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

Logged: outcome, duration, lengths, how many tool calls and tool rounds a
successful turn used (Phase 14 plan.md section 21), how many UI commands it
returned, and on failure the exception's class name. Never logged: the
message, the reply, the exception's text or its traceback, since any of them
can carry the customer's words or model output (ADR-0019, S2).
"""

import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Annotated

from annotated_types import MaxLen
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, ConfigDict, Field

from ai_service.agents.errors import AgentTurnFailedError
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


class AgentService:
    def __init__(self, graph: AgentGraph) -> None:
        self._graph = graph

    async def run_turn(self, message: str) -> AgentResult:
        started_at = time.perf_counter()
        state: AgentState = {"messages": [HumanMessage(content=message)]}
        try:
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
        except Exception as error:
            # Exception, not BaseException: cancellation (a client going
            # away, shutdown) must propagate.
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
            raise AgentTurnFailedError() from None

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
