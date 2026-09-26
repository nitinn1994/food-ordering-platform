"""The one application factory.

``create_app`` is the single source of truth for HTTP behaviour: every
router, handler and middleware is registered here, in one explicit order,
and nothing is registered at import time. ``__main__`` and every test build
the app through it, so a test app is configured identically to the served
one (the lesson of commerce-api's configure-app.ts, ADR-0013).
"""

from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from ai_service import __version__
from ai_service.agents.graph import build_agent_graph
from ai_service.agents.service import AgentService
from ai_service.api import build_router
from ai_service.clients.commerce import (
    CommerceClient,
    CommerceHttpClient,
    build_commerce_http_client,
)
from ai_service.config import Settings, ensure_tracing_disabled, load_settings
from ai_service.core.errors import register_exception_handlers
from ai_service.core.logging import configure_logging
from ai_service.core.request_context import RequestContextMiddleware
from ai_service.core.request_limits import RequestLimitsMiddleware
from ai_service.llm import build_chat_model
from ai_service.tools.registry import build_tool_registry
from ai_service.tools.service import ToolService
from ai_service.ui_commands import (
    PresentationToolService,
    build_presentation_registry,
)


def create_app(
    settings: Settings,
    extra_routers: Sequence[APIRouter] = (),
    agent_service: AgentService | None = None,
    commerce_http_client: CommerceHttpClient | None = None,
) -> FastAPI:
    # Before anything is built: an app must never run with LangSmith tracing
    # on, however it was started (ADR-0020, security review S1).
    ensure_tracing_disabled()
    # The generated API docs describe the service's internals, so they are
    # served only in development (plan.md OD12); elsewhere these paths are
    # plain 404 ROUTE_NOT_FOUND.
    docs_enabled = settings.app_env == "development"
    # One Commerce API HTTP client per app, owned by the app and closed when
    # it shuts down (Phase 14 plan.md section 9, OD13). Tests pass their own
    # (a MockTransport); an injected agent service may come with one too.
    # Nothing connects until a tool runs, so building the app, /health and
    # the simulated model never need commerce-api.
    http_client = commerce_http_client
    if agent_service is None:
        http_client = http_client or build_commerce_http_client(settings)
        tool_service = ToolService(CommerceClient(http_client), build_tool_registry())
        presentation_service = PresentationToolService(build_presentation_registry())
        agent_service = AgentService(
            build_agent_graph(build_chat_model(), tool_service, presentation_service)
        )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            if http_client is not None:
                await http_client.aclose()

    app = FastAPI(
        title="ai-service",
        version=__version__,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    # One agent service per app, never module-level: tests inject their own
    # (a fake model), and two apps never share one (plan.md section 16).
    app.state.agent_service = agent_service
    register_exception_handlers(app)

    app.include_router(build_router())
    # Test-only routes (tests/fixtures_routes.py) come in here; nothing in
    # the service itself passes any.
    for router in extra_routers:
        app.include_router(router)

    # Each add_middleware wraps the previous ones. Body limits run inside the
    # request context, so their 413/415 carry the correlation headers.
    app.add_middleware(RequestLimitsMiddleware)
    # Added last, so it is the outermost user middleware: every response,
    # including the unhandled-error 500 it sends itself, passes through it.
    app.add_middleware(RequestContextMiddleware)

    return app


def app_from_environment() -> FastAPI:
    """Factory uvicorn imports by name (so ``--reload`` works). ``__main__``
    has already validated the same environment before calling uvicorn.

    Logging is configured here as well as in ``__main__``: with ``--reload``
    this runs in a separate worker process that inherits no configuration."""
    settings = load_settings()
    configure_logging(settings)
    return create_app(settings)
