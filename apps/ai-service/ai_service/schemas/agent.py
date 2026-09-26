"""``POST /v1/agent/turns`` request and response.

Generated since Phase 15, no longer hand-written: both models come from
``@contracts/ui-commands``' Zod source via ``ai_service/contracts/
ui_commands.py`` (ADR-0003; docs/features/phase-15-ai-ui-commands/plan.md
OD4), so apps/web and this service validate one definition. The request's
wire rules are unchanged: 1-2000 characters, at least one non-whitespace
(Phase 13 OD9). The response gained the optional ``uiCommands`` batch.

Still no conversation id (Phase 13 OD4: every turn is independent until
memory exists) and no intent: business intents never travel to the
frontend (system-architecture.md section 4.4).
"""

from annotated_types import MaxLen

from ai_service.contracts.ui_commands import AgentTurnRequest, AgentTurnResponse

__all__ = ["MAX_TURN_MESSAGE_LENGTH", "AgentTurnRequest", "AgentTurnResponse"]

# Read from the generated model, never restated. Not schemas/errors.py's
# MAX_MESSAGE_LENGTH, which bounds error messages.
MAX_TURN_MESSAGE_LENGTH: int = next(
    item.max_length
    for item in AgentTurnRequest.model_fields["message"].metadata
    if isinstance(item, MaxLen)
)
