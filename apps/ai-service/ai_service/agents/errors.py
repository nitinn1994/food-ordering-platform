"""The agent's caller-facing errors (plan.md section 13, OD8; Phase 18 adds
the deadline and capacity errors)."""

from ai_service.core.errors import AiServiceError

AGENT_FAILED = "AGENT_FAILED"
AGENT_TIMEOUT = "AGENT_TIMEOUT"
AGENT_BUSY = "AGENT_BUSY"


class AgentTurnFailedError(AiServiceError):
    """Any failure while the graph runs: the model, a node, or the result.

    One static message and no detail. What failed stays server-side as an
    exception class name (never the exception's text, which can carry the
    customer's message or model output). Model-specific codes (timeouts,
    provider outages) arrive with the phase that adds a provider.
    """

    def __init__(self) -> None:
        super().__init__(
            code=AGENT_FAILED,
            message="The assistant could not process this message.",
            status_code=500,
        )


class AgentTurnTimeoutError(AiServiceError):
    """The turn ran past ``AGENT_TURN_TIMEOUT_SECONDS`` and was cancelled
    (Phase 18, plan.md section 4 AI-7). A write already sent to commerce-api
    may or may not have landed; apps/web re-reads the cart after every turn,
    whatever the outcome (ADR-0022)."""

    def __init__(self) -> None:
        super().__init__(
            code=AGENT_TIMEOUT,
            message="The assistant took too long to answer.",
            status_code=504,
        )


class AgentBusyError(AiServiceError):
    """``AGENT_MAX_CONCURRENT_TURNS`` turns are already running; this one was
    refused before the graph ran, so nothing changed (Phase 18, AI-8)."""

    def __init__(self) -> None:
        super().__init__(
            code=AGENT_BUSY,
            message="The assistant is busy. Try again shortly.",
            status_code=503,
        )
