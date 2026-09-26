from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from ai_service.config import Settings
from ai_service.main import create_app
from tests import fixtures_routes


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
