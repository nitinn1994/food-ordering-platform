"""The agent application service: the only way into the graph.

Between HTTP and LangGraph (plan.md section 8). The route knows nothing
about graphs, and the graph knows nothing about HTTP. ``run_turn`` maps a
message into graph state, runs one turn, maps the final state into a typed
``AgentResult``, translates every failure into ``AgentTurnFailedError``,
and writes the turn's one log line.

Logged: outcome, duration, lengths, and on failure the exception's class
name. Never logged: the message, the reply, the exception's text or its
traceback, since any of them can carry the customer's words or model output
(ADR-0019, S2).
"""

import logging
import time
from typing import Annotated

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, ConfigDict, Field

from ai_service.agents.errors import AgentTurnFailedError
from ai_service.agents.graph import RECURSION_LIMIT, AgentGraph
from ai_service.agents.state import AgentState

MAX_REPLY_LENGTH = 4000

logger = logging.getLogger("ai_service.agent")


class AgentResult(BaseModel):
    """One turn's typed result. Later phases add intents and UI commands
    here, generated from packages/contracts (plan.md section 11)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    reply: Annotated[str, Field(min_length=1, max_length=MAX_REPLY_LENGTH)]


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
            result = AgentResult(reply=final["reply"])
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
                }
            },
        )
        return result


def _elapsed_ms(started_at: float) -> float:
    return round((time.perf_counter() - started_at) * 1000, 2)
