"""The agent's one caller-facing error (plan.md section 13, OD8)."""

from ai_service.core.errors import AiServiceError

AGENT_FAILED = "AGENT_FAILED"


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
