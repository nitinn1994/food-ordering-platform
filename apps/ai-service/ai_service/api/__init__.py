"""HTTP routes. Parsing and mapping only: logic belongs in the packages a
route calls, never in the route itself."""

from fastapi import APIRouter

from ai_service.api import health


def build_router() -> APIRouter:
    router = APIRouter()
    router.include_router(health.router)
    return router
