"""The agent application service: the only way into the graph.

Between HTTP and LangGraph (plan.md section 8). The route knows nothing
about graphs, and the graph knows nothing about HTTP. ``run_turn`` maps a
message into graph state, runs one turn, maps the final state into a typed
``AgentResult``, translates every failure into ``AgentTurnFailedError``,
and writes the turn's one log line.

Phase 15 (plan.md sections 9, 11 and 16): the turn's UI commands, collected
by ``finalize_reply``, are wrapped in the contract's batch envelope here,
with the turn's correlation id and an ISO-8601 UTC ``Z`` timestamp. The
envelope is validated inside the same ``try`` as the reply, so a command the
contract rejects fails the turn (AGENT_FAILED) and never reaches a
traceback.

Phase 18 (docs/features/phase-18-production-hardening/plan.md section 4,
AI-7, AI-8): every turn runs under a deadline, and at most a fixed number
run at once. Past the deadline the graph is cancelled - no further model or
tool call starts - and the caller gets 504 AGENT_TIMEOUT. Over capacity, a
turn is refused before the graph runs, with 503 AGENT_BUSY. Both are logged
like any other turn, with outcome "timeout" or "busy".

Logged: outcome, duration, lengths, how many tool calls and tool rounds a
successful turn used (Phase 14 plan.md section 21), how many UI commands it
returned, and on failure the exception's class name. Never logged: the
message, the reply, the exception's text or its traceback, since any of them
can carry the customer's words or model output (ADR-0019, S2).
"""

import asyncio
import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Annotated

from annotated_types import MaxLen
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, ConfigDict, Field

from ai_service.agents.errors import (
    AgentBusyError,
    AgentTurnFailedError,
    AgentTurnTimeoutError,
)
from ai_service.agents.graph import RECURSION_LIMIT, AgentGraph
from ai_service.agents.nodes import tool_calls_requested, tool_rounds
from ai_service.agents.state import AgentState
from ai_service.contracts.ui_commands import AgentTurnResponse, UiCommandBatch
from ai_service.core.request_context import correlation_id_var
from ai_service.ui_commands import build_batch

# The contract's bound on a reply, read from the generated model (Phase 15),
# never restated.
MAX_REPLY_LENGTH: int = next(
    item.max_length
    for item in AgentTurnResponse.model_fields["reply"].metadata
    if isinstance(item, MaxLen)
)

logger = logging.getLogger("ai_service.agent")


class AgentResult(BaseModel):
    """One turn's typed result. No intents: they never leave this service
    (Phase 15 plan.md section 5)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    reply: Annotated[str, Field(min_length=1, max_length=MAX_REPLY_LENGTH)]
    # None when the turn produced no UI commands.
    ui_commands: UiCommandBatch | None = None


# Settings' defaults (config.py), repeated for callers that build a service
# directly, such as tests.
DEFAULT_TURN_TIMEOUT_SECONDS = 20.0
DEFAULT_MAX_CONCURRENT_TURNS = 16


class AgentService:
    def __init__(
        self,
        graph: AgentGraph,
        turn_timeout_seconds: float = DEFAULT_TURN_TIMEOUT_SECONDS,
        max_concurrent_turns: int = DEFAULT_MAX_CONCURRENT_TURNS,
    ) -> None:
        self._graph = graph
        self._turn_timeout_seconds = turn_timeout_seconds
        self._max_concurrent_turns = max_concurrent_turns
        # One event loop per process, and no await between the check and the
        # increment below, so a plain counter is race-free.
        self._turns_in_flight = 0

    @property
    def turns_in_flight(self) -> int:
        return self._turns_in_flight

    async def run_turn(self, message: str) -> AgentResult:
        if self._turns_in_flight >= self._max_concurrent_turns:
            _log_refused(message)
            raise AgentBusyError()
        self._turns_in_flight += 1
        try:
            return await self._run_turn(message)
        finally:
            self._turns_in_flight -= 1

    async def _run_turn(self, message: str) -> AgentResult:
        started_at = time.perf_counter()
        state: AgentState = {"messages": [HumanMessage(content=message)]}
        deadline = asyncio.timeout(self._turn_timeout_seconds)
        try:
            async with deadline:
                final = await self._graph.ainvoke(
                    state, config={"recursion_limit": RECURSION_LIMIT}
                )
            # Inside the try: a ValidationError here carries the reply as its
            # input, so it must never reach the last-resort handler, which
            # logs a traceback (ADR-0019, S2).
            batch = build_batch(
                final.get("ui_commands", []), _correlation_id(), _issued_at()
            )
            result = AgentResult(reply=final["reply"], ui_commands=batch)
            messages = final["messages"]
        except TimeoutError as error:
            # Only this turn's own deadline is a timeout; any other
            # TimeoutError from inside the graph is an ordinary failure.
            if not deadline.expired():
                raise _failed(message, started_at, error) from None
            logger.warning(
                "agent turn timed out",
                extra={
                    "fields": {
                        "outcome": "timeout",
                        "duration_ms": _elapsed_ms(started_at),
                        "message_chars": len(message),
                    }
                },
            )
            raise AgentTurnTimeoutError() from None
        except Exception as error:
            # Exception, not BaseException: cancellation (a client going
            # away, shutdown) must propagate.
            raise _failed(message, started_at, error) from None

        logger.info(
            "agent turn completed",
            extra={
                "fields": {
                    "outcome": "ok",
                    "duration_ms": _elapsed_ms(started_at),
                    "message_chars": len(message),
                    "reply_chars": len(result.reply),
                    "tool_calls": tool_calls_requested(messages),
                    "tool_rounds": tool_rounds(messages),
                    "ui_commands": len(batch.commands) if batch else 0,
                }
            },
        )
        return result


def _failed(message: str, started_at: float, error: Exception) -> AgentTurnFailedError:
    """Logs a failed turn and returns the error to raise."""
    logger.warning(
        "agent turn failed",
        extra={
            "fields": {
                "outcome": "failed",
                "duration_ms": _elapsed_ms(started_at),
                "message_chars": len(message),
                "error_type": type(error).__name__,
            }
        },
    )
    return AgentTurnFailedError()


def _log_refused(message: str) -> None:
    logger.warning(
        "agent turn refused",
        extra={
            "fields": {
                "outcome": "busy",
                "duration_ms": 0.0,
                "message_chars": len(message),
            }
        },
    )


def _correlation_id() -> str:
    """The turn's X-Correlation-Id, which RequestContextMiddleware always
    sets during a request. Outside one (a direct call, a test) there is none,
    and the envelope still needs one."""
    return correlation_id_var.get() or str(uuid.uuid4())


def _issued_at() -> str:
    """Now, as the contract's timestamp: ISO-8601 UTC ending in ``Z``,
    never ``+00:00`` (ADR-0012 D9), which apps/web would reject."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _elapsed_ms(started_at: float) -> float:
    return round((time.perf_counter() - started_at) * 1000, 2)
