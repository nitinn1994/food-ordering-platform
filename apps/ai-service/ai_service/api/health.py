from fastapi import APIRouter

from ai_service.schemas.health import HealthResponse, ReadinessResponse

router = APIRouter()


# Liveness only, unversioned, no dependency check - the same contract as
# commerce-api's GET /health (docs/api/commerce-api.md section 9). It must
# never depend on a model provider or on commerce-api (plan.md section 13).
@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


# Readiness (Phase 18, plan.md AC13, OD2): the process is up and routing.
# Deliberately checks no dependency. With commerce-api down, a turn still
# answers - its tools report the outage to the model, and the reply says so
# - and taking this service out of rotation would help no one. It must
# never call a model provider either: a provider outage is not a reason to
# restart or drain this service.
@router.get("/health/ready", response_model=ReadinessResponse)
def ready() -> ReadinessResponse:
    return ReadinessResponse(status="ready")
