"""Phase 18 (plan.md section 3 S-2, AC15): every response carries the
security headers - success, validation failure, 404, 405, 413, 415 and the
last-resort 500."""

import pytest
from fastapi.testclient import TestClient

from ai_service.config import Settings
from ai_service.main import create_app
from tests import fixtures_routes

EXPECTED = {
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
}


def assert_security_headers(headers: object) -> None:
    for name, value in EXPECTED.items():
        assert headers[name] == value, name  # type: ignore[index]


@pytest.mark.parametrize(
    ("method", "path", "kwargs", "status"),
    [
        ("GET", "/health", {}, 200),
        ("GET", "/health/ready", {}, 200),
        ("POST", "/v1/agent/turns", {"json": {"message": "Hello"}}, 200),
        ("POST", "/v1/agent/turns", {"json": {}}, 400),
        ("GET", "/nope", {}, 404),
        ("GET", "/v1/agent/turns", {}, 405),
        (
            "POST",
            "/v1/agent/turns",
            {"content": b"x", "headers": {"content-type": "text/plain"}},
            415,
        ),
        (
            "POST",
            "/v1/agent/turns",
            {
                "content": b'{"m":"' + b"x" * 20_000 + b'"}',
                "headers": {"content-type": "application/json"},
            },
            413,
        ),
    ],
)
def test_every_response_carries_the_headers(
    client: TestClient, method: str, path: str, kwargs: dict[str, object], status: int
) -> None:
    response = client.request(method, path, **kwargs)  # type: ignore[arg-type]

    assert response.status_code == status
    assert_security_headers(response.headers)


def test_the_last_resort_500_carries_the_headers(settings: Settings) -> None:
    app = create_app(settings, extra_routers=[fixtures_routes.router])
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/__test/boom")

    assert response.status_code == 500
    assert_security_headers(response.headers)


def test_headers_are_not_duplicated(client: TestClient) -> None:
    response = client.get("/health")

    assert len(response.headers.get_list("cache-control")) == 1
