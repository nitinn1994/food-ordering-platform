from typing import Annotated

from fastapi import APIRouter, Depends, Request

from ai_service.agents.service import AgentService
from ai_service.schemas.agent import AgentTurnRequest, AgentTurnResponse

router = APIRouter(prefix="/v1/agent")


def get_agent_service(request: Request) -> AgentService:
    # Built (or injected) by create_app; never a module-level instance.
    service: AgentService = request.app.state.agent_service
    return service


# One conversational turn, handled by a simulated model in Phase 13
# (docs/api/ai-service.md). Failures arrive as AgentTurnFailedError and are
# mapped by core/errors.py like any AiServiceError.
@router.post("/turns", response_model=AgentTurnResponse)
async def create_turn(
    body: AgentTurnRequest,
    service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentTurnResponse:
    result = await service.run_turn(body.message)
    return AgentTurnResponse(reply=result.reply)
