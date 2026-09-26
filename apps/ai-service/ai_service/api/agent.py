from typing import Annotated

from fastapi import APIRouter, Depends, Request

from ai_service.agents.service import AgentService
from ai_service.schemas.agent import AgentTurnRequest, AgentTurnResponse

router = APIRouter(prefix="/v1/agent")


def get_agent_service(request: Request) -> AgentService:
    # Built (or injected) by create_app; never a module-level instance.
    service: AgentService = request.app.state.agent_service
    return service


# One conversational turn, handled by a simulated model
# (docs/api/ai-service.md). The body carries the reply and, when the turn
# produced any, its UI commands (Phase 15). Failures arrive as
# AgentTurnFailedError and are mapped by core/errors.py like any
# AiServiceError.
# response_model_exclude_none: a turn without UI commands omits uiCommands.
# The contract makes it optional, never nullable (Phase 15 plan.md OD12).
@router.post(
    "/turns", response_model=AgentTurnResponse, response_model_exclude_none=True
)
async def create_turn(
    body: AgentTurnRequest,
    service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentTurnResponse:
    result = await service.run_turn(body.message)
    return AgentTurnResponse(reply=result.reply, uiCommands=result.ui_commands)
