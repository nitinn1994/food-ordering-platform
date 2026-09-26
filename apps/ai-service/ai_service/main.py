"""The one application factory.

``create_app`` is the single source of truth for HTTP behaviour: every
router, handler and middleware is registered here, in one explicit order,
and nothing is registered at import time. ``__main__`` and every test build
the app through it, so a test app is configured identically to the served
one (the lesson of commerce-api's configure-app.ts, ADR-0013).
"""

from collections.abc import Sequence

from fastapi import APIRouter, FastAPI

from ai_service import __version__
from ai_service.api import build_router
from ai_service.config import Settings, load_settings
from ai_service.core.errors import register_exception_handlers
from ai_service.core.logging import configure_logging
from ai_service.core.request_context import RequestContextMiddleware


def create_app(settings: Settings, extra_routers: Sequence[APIRouter] = ()) -> FastAPI:
    # The generated API docs describe the service's internals, so they are
    # served only in development (plan.md OD12); elsewhere these paths are
    # plain 404 ROUTE_NOT_FOUND.
    docs_enabled = settings.app_env == "development"
    app = FastAPI(
        title="ai-service",
        version=__version__,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    app.state.settings = settings
    register_exception_handlers(app)

    app.include_router(build_router())
    # Test-only routes (tests/fixtures_routes.py) come in here; nothing in
    # the service itself passes any.
    for router in extra_routers:
        app.include_router(router)

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
