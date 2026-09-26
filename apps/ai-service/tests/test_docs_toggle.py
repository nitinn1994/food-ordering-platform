from typing import cast

import pytest
from fastapi.testclient import TestClient
from starlette.middleware.cors import CORSMiddleware

from ai_service.config import AppEnv, Settings
from ai_service.main import create_app

DOC_PATHS = ["/docs", "/redoc", "/openapi.json"]


def _settings(app_env: AppEnv) -> Settings:
    # Production requires COMMERCE_API_URL (Phase 14, AC4); nothing here
    # connects to it.
    return Settings(app_env=app_env, commerce_api_url="http://127.0.0.1:3001")


@pytest.mark.parametrize("path", DOC_PATHS)
def test_docs_are_served_in_development(path: str) -> None:
    client = TestClient(create_app(Settings(app_env="development")))

    assert client.get(path).status_code == 200


@pytest.mark.parametrize("app_env", ["test", "production"])
@pytest.mark.parametrize("path", DOC_PATHS)
def test_docs_are_absent_outside_development(path: str, app_env: AppEnv) -> None:
    client = TestClient(create_app(_settings(app_env)))

    response = client.get(path)
    assert response.status_code == 404
    assert response.json()["code"] == "ROUTE_NOT_FOUND"


@pytest.mark.parametrize("app_env", ["development", "test", "production"])
def test_no_cors_middleware_is_installed(app_env: AppEnv) -> None:
    app = create_app(_settings(app_env))

    assert all(cast(object, m.cls) is not CORSMiddleware for m in app.user_middleware)


def test_cross_origin_request_gets_no_cors_headers(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers
