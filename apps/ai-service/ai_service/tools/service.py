"""The tool application service (Phase 14 plan.md sections 3, 12 and 21).

``execute`` is the only way a tool runs: it resolves the name against the
registry (the allowlist), validates the arguments against the tool's strict
input model, makes the tool's one client call, and turns every expected
failure into a ``ToolResult``. A tool failure is data for the model, never
an exception that fails the turn.

What is not converted: an unexpected exception (a bug, including
``InvalidCommerceArgumentError``, which validation here makes unreachable)
propagates, so the turn fails with AGENT_FAILED rather than disguising a
bug as a commerce outage.

One ``ai_service.tools`` log line per call: tool, category, outcome, error
code, commerce status and duration. Never the arguments (model output, even
an item id), the result, commerce-api's message or an unregistered name
(ADR-0019 S2).
"""

import logging
import time
from collections.abc import Mapping
from typing import Any

from pydantic import ValidationError

from ai_service.clients.commerce import (
    CommerceApiError,
    CommerceClient,
    CommerceClientError,
    CommerceOutcomeUnknownError,
    CommerceUnavailableError,
)
from ai_service.tools.registry import ToolDefinition, tool_schemas
from ai_service.tools.results import (
    COMMERCE_BAD_RESPONSE,
    COMMERCE_OUTCOME_UNKNOWN,
    COMMERCE_REQUEST_REJECTED,
    COMMERCE_UNAVAILABLE,
    INVALID_TOOL_ARGUMENTS,
    PASSED_THROUGH_CODES,
    UNKNOWN_TOOL,
    ToolResult,
)

# commerce-api's "no route matched": a wrong COMMERCE_API_URL, not a
# commerce outcome.
_ROUTE_NOT_FOUND = "ROUTE_NOT_FOUND"
# Logged in place of a name that is not registered: the name is model output.
UNREGISTERED_TOOL = "<unregistered>"
# Results that point at a misconfiguration or contract drift, not at the
# customer's request.
_WARNING_CODES = frozenset({COMMERCE_REQUEST_REJECTED, COMMERCE_BAD_RESPONSE})

logger = logging.getLogger("ai_service.tools")


class ToolService:
    def __init__(
        self, client: CommerceClient, registry: Mapping[str, ToolDefinition[Any]]
    ) -> None:
        self._client = client
        self._registry = registry

    def tool_schemas(self) -> list[dict[str, Any]]:
        """The definitions a chat model is bound to: exactly the tools
        ``execute`` will run."""
        return tool_schemas(self._registry)

    async def execute(self, name: str, arguments: Any) -> ToolResult:
        started_at = time.perf_counter()
        definition = self._registry.get(name)
        if definition is None:
            return self._finish(started_at, None, ToolResult.failure(UNKNOWN_TOOL))
        try:
            args = definition.input_model.model_validate(arguments)
        except ValidationError as error:
            result = ToolResult.failure(
                INVALID_TOOL_ARGUMENTS, _declared_field(error, definition)
            )
            return self._finish(started_at, definition, result)
        commerce_status: int | None = None
        warn = False
        try:
            result = ToolResult.success(await definition.handler(self._client, args))
        except CommerceClientError as error:
            commerce_status = error.status
            # A route commerce-api does not have means COMMERCE_API_URL is
            # wrong: the customer sees "unavailable", the operator a warning.
            warn = (
                isinstance(error, CommerceApiError) and error.code == _ROUTE_NOT_FOUND
            )
            result = ToolResult.failure(_error_code(error))
        return self._finish(started_at, definition, result, commerce_status, warn)

    def refuse(self, name: str, code: str) -> ToolResult:
        """A call the graph declines without running it (over the per-turn
        limit, or arguments that were not even JSON), logged like any
        other call."""
        return self._finish(
            time.perf_counter(), self._registry.get(name), ToolResult.failure(code)
        )

    def _finish(
        self,
        started_at: float,
        definition: ToolDefinition[Any] | None,
        result: ToolResult,
        commerce_status: int | None = None,
        warn: bool = False,
    ) -> ToolResult:
        error_code = result.error.code if result.error else None
        logger.log(
            logging.WARNING if warn or error_code in _WARNING_CODES else logging.INFO,
            "tool call completed" if result.ok else "tool call failed",
            extra={
                "fields": {
                    "tool": definition.name if definition else UNREGISTERED_TOOL,
                    "category": definition.category if definition else None,
                    "outcome": "ok" if result.ok else "error",
                    "error_code": error_code,
                    "commerce_status": commerce_status,
                    "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
                }
            },
        )
        return result


def _error_code(error: CommerceClientError) -> str:
    """Client failure -> the code the model sees (plan.md section 12)."""
    if isinstance(error, CommerceApiError):
        if error.code in PASSED_THROUGH_CODES:
            return error.code
        if error.code == _ROUTE_NOT_FOUND:
            return COMMERCE_UNAVAILABLE
        return COMMERCE_REQUEST_REJECTED
    if isinstance(error, CommerceOutcomeUnknownError):
        return COMMERCE_OUTCOME_UNKNOWN
    if isinstance(error, CommerceUnavailableError):
        return COMMERCE_UNAVAILABLE
    # CommerceBadResponseError, or any future subclass: never assume success.
    return COMMERCE_BAD_RESPONSE


def _declared_field(
    error: ValidationError, definition: ToolDefinition[Any]
) -> str | None:
    """The first failing argument's name, but only if the tool declares it:
    an unknown key is the model's own text and is not echoed back."""
    for issue in error.errors(include_input=False, include_url=False):
        location = issue["loc"]
        if location and location[0] in definition.input_model.model_fields:
            return str(location[0])
    return None
