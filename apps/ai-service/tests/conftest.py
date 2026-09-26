import io
import logging
import os
from collections.abc import Iterator
from contextlib import ExitStack
from typing import Protocol

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel

from ai_service.agents.graph import build_agent_graph
from ai_service.agents.service import AgentService
from ai_service.config import TRACING_VARIABLES, Settings
from ai_service.core.logging import configure_logging
from ai_service.main import create_app
from tests import fixtures_routes
from tests.commerce_fakes import FakeCommerce, presentation_service


def pytest_configure(config: pytest.Config) -> None:
    # Tests build models and graphs directly, never through load_settings'
    # tracing guard, and langsmith caches what it reads from the environment.
    # So the developer's shell is cleared of tracing switches before any test
    # runs: the suite must never send anything to LangSmith (AC13).
    for name in TRACING_VARIABLES:
        os.environ.pop(name, None)


@pytest.fixture
def settings() -> Settings:
    # Built directly, never from os.environ, so the suite is independent of
    # the developer's shell and of any .env file (AC2).
    return Settings(app_env="test")


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def fixture_client(settings: Settings) -> Iterator[TestClient]:
    """The app plus the test-only routes in tests/fixtures_routes.py."""
    app = create_app(settings, extra_routers=[fixtures_routes.router])
    with TestClient(app) as test_client:
        yield test_client


class AgentClientFactory(Protocol):
    def __call__(
        self, model: BaseChatModel, commerce: FakeCommerce | None = None
    ) -> TestClient: ...


@pytest.fixture
def agent_client(settings: Settings) -> Iterator[AgentClientFactory]:
    """Builds a client whose app runs the real graph on ``model`` (a fake
    from tests/fakes.py, say), injected through create_app, with the real
    tools calling ``commerce`` (a FakeCommerce; an empty one by default,
    where every route is 404). The app owns and closes the HTTP client."""
    with ExitStack() as stack:

        def build(
            model: BaseChatModel, commerce: FakeCommerce | None = None
        ) -> TestClient:
            fake = commerce or FakeCommerce()
            http = fake.http_client(settings)
            tool_service = fake.tool_service(http)
            service = AgentService(
                build_agent_graph(model, tool_service, presentation_service())
            )
            app = create_app(settings, agent_service=service, commerce_http_client=http)
            return stack.enter_context(TestClient(app))

        yield build


@pytest.fixture
def log_stream(settings: Settings) -> Iterator[io.StringIO]:
    """The service's real log configuration, writing to a buffer."""
    root = logging.getLogger()
    saved_handlers, saved_level = list(root.handlers), root.level
    stream = io.StringIO()
    configure_logging(settings, stream=stream)
    yield stream
    for handler in list(root.handlers):
        root.removeHandler(handler)
    for handler in saved_handlers:
        root.addHandler(handler)
    root.setLevel(saved_level)
