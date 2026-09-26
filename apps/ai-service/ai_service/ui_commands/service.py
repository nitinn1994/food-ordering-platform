"""The presentation tool service (Phase 15 plan.md sections 8, 9 and 13).

``execute`` resolves a name against the presentation registry, validates the
arguments strictly, and builds the generated UI command. It performs no I/O.
What the model reads back is ``{"ok": true}``, or the same error shape and
codes the Commerce tools use (``tools/results.py``), so the model sees one
error vocabulary. The command itself travels beside the tool message, as its
``artifact``, which is never sent to the model (the graph sets it).

One ``ai_service.tools`` log line per call, with the same fields as a
Commerce tool call (category ``ui``, no intent, no commerce status). Never
the arguments: they are model output (ADR-0019 S2).

``build_batch`` wraps a turn's commands in the contract's envelope once the
turn is over.
"""

import logging
import time
from collections.abc import Mapping, Sequence
from typing import Annotated, Any, Self, get_args

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from ai_service.contracts.ui_commands import UiCommand, UiCommandBatch
from ai_service.tools.results import (
    INVALID_TOOL_ARGUMENTS,
    UNKNOWN_TOOL,
    ToolError,
    ToolResult,
)
from ai_service.ui_commands.registry import (
    COMMAND_CLASSES,
    CommandModel,
    PresentationToolDefinition,
    presentation_tool_schemas,
)

type UiCommandModel = CommandModel

UI_COMMAND_CLASSES = COMMAND_CLASSES

CATEGORY = "ui"
# Logged in place of a name that is not registered: the name is model output.
UNREGISTERED_TOOL = "<unregistered>"

# The envelope's version, read from the generated Literal, never restated.
(CONTRACT_VERSION,) = get_args(
    UiCommandBatch.model_fields["contractVersion"].annotation
)

logger = logging.getLogger("ai_service.tools")


class PresentationResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    ok: bool
    error: ToolError | None = None
    # Never serialized into the model's tool message.
    command: Annotated[UiCommandModel | None, Field(exclude=True)] = None

    @model_validator(mode="after")
    def _exactly_one_outcome(self) -> Self:
        if self.ok != (self.command is not None) or self.ok == (self.error is not None):
            raise ValueError("ok requires a command and no error; not ok, the reverse")
        return self

    @classmethod
    def success(cls, command: UiCommandModel) -> Self:
        return cls(ok=True, command=command)

    @classmethod
    def failure(cls, code: str, field: str | None = None) -> Self:
        # ToolResult owns the message for every code; reused, not copied.
        return cls(ok=False, error=ToolResult.failure(code, field).error)

    def to_content(self) -> str:
        """The tool message content the model reads."""
        return self.model_dump_json(exclude_none=True)


class PresentationToolService:
    def __init__(self, registry: Mapping[str, PresentationToolDefinition]) -> None:
        self._registry = registry

    def names(self) -> frozenset[str]:
        return frozenset(self._registry)

    def handles(self, name: str) -> bool:
        return name in self._registry

    def tool_schemas(self) -> list[dict[str, Any]]:
        return presentation_tool_schemas(self._registry)

    def execute(self, name: str, arguments: Any) -> PresentationResult:
        started_at = time.perf_counter()
        definition = self._registry.get(name)
        if definition is None:
            return self._finish(
                started_at, None, PresentationResult.failure(UNKNOWN_TOOL)
            )
        try:
            args = definition.input_model.model_validate(arguments)
            command = definition.command_model.model_validate(
                {"type": definition.command_type, **args.model_dump()}, strict=True
            )
        except ValidationError as error:
            result = PresentationResult.failure(
                INVALID_TOOL_ARGUMENTS, _declared_field(error, definition)
            )
            return self._finish(started_at, definition, result)
        return self._finish(started_at, definition, PresentationResult.success(command))

    def refuse(self, name: str, code: str) -> PresentationResult:
        """A call the graph declines without running it, logged like any
        other call."""
        return self._finish(
            time.perf_counter(),
            self._registry.get(name),
            PresentationResult.failure(code),
        )

    def _finish(
        self,
        started_at: float,
        definition: PresentationToolDefinition | None,
        result: PresentationResult,
    ) -> PresentationResult:
        logger.info(
            "tool call completed" if result.ok else "tool call failed",
            extra={
                "fields": {
                    "tool": definition.name if definition else UNREGISTERED_TOOL,
                    "category": CATEGORY,
                    "intent": None,
                    "outcome": "ok" if result.ok else "error",
                    "error_code": result.error.code if result.error else None,
                    "commerce_status": None,
                    "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
                }
            },
        )
        return result


def build_batch(
    commands: Sequence[UiCommandModel], correlation_id: str, issued_at: str
) -> UiCommandBatch | None:
    """The turn's commands in the contract envelope, or ``None`` when there
    are none: the response then omits ``uiCommands`` (plan.md OD12). Raises
    ``ValidationError`` on anything the contract rejects, more than
    ``MAX_COMMANDS_PER_BATCH`` commands included."""
    if not commands:
        return None
    return UiCommandBatch(
        contractVersion=CONTRACT_VERSION,
        correlationId=correlation_id,
        issuedAt=issued_at,
        commands=[UiCommand(command) for command in commands],
    )


def _declared_field(
    error: ValidationError, definition: PresentationToolDefinition
) -> str | None:
    """The first failing argument's name, but only if the tool declares it:
    an unknown key is the model's own text and is not echoed back."""
    for issue in error.errors(include_input=False, include_url=False):
        location = issue["loc"]
        if location and location[0] in definition.input_model.model_fields:
            return str(location[0])
    return None
