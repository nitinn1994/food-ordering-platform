from fastapi import APIRouter

from ai_service.schemas.health import HealthResponse

router = APIRouter()


# Liveness only, unversioned, no dependency check - the same contract as
# commerce-api's GET /health (docs/api/commerce-api.md section 9). It must
# never depend on a model provider or on commerce-api (plan.md section 13).
@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
