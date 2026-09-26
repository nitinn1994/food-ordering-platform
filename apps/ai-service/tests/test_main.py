from typing import Any

import pytest
import uvicorn
from fastapi.testclient import TestClient

from ai_service import __main__ as entry
from ai_service import main as main_module
from ai_service.clients.commerce import build_commerce_http_client
from ai_service.config import TRACING_VARIABLES, ConfigError, Settings
from ai_service.main import create_app
from tests.commerce_fakes import FakeCommerce


@pytest.fixture
def uvicorn_calls(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def fake_run(app: str, **kwargs: Any) -> None:
        calls.append({"app": app, **kwargs})

    monkeypatch.setattr(uvicorn, "run", fake_run)
    # main() configures the process-wide root logger; keep that out of the
    # test process (tests/test_logging.py covers configure_logging itself).
    monkeypatch.setattr(entry, "configure_logging", lambda settings: None)
    for name in (
        "APP_ENV",
        "HOST",
        "PORT",
        "LOG_LEVEL",
        "LOG_FORMAT",
        "COMMERCE_API_URL",
        "COMMERCE_API_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)
    # The developer's shell must not decide the outcome (tracing guard).
    for name in TRACING_VARIABLES:
        monkeypatch.delenv(name, raising=False)
    return calls


def test_invalid_environment_exits_before_starting_the_server(
    uvicorn_calls: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("PORT", "SENTINEL_PORT")

    assert entry.main([]) == 1
    assert uvicorn_calls == []
    stderr = capsys.readouterr().err
    assert "PORT" in stderr
    assert "SENTINEL_PORT" not in stderr


def test_tracing_enabled_exits_before_starting_the_server(
    uvicorn_calls: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("LANGSMITH_TRACING", "SENTINEL_TRACING")

    assert entry.main([]) == 1
    assert uvicorn_calls == []
    stderr = capsys.readouterr().err
    assert "LANGSMITH_TRACING (tracing_not_allowed)" in stderr
    assert "SENTINEL_TRACING" not in stderr


def test_valid_environment_starts_uvicorn_with_the_settings(
    uvicorn_calls: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PORT", "4555")

    assert entry.main([]) == 0
    assert uvicorn_calls == [
        {
            "app": "ai_service.main:app_from_environment",
            "factory": True,
            "host": "127.0.0.1",
            "port": 4555,
            "reload": False,
            "access_log": False,
            "log_config": None,
        }
    ]


def test_reload_flag_is_passed_through(
    uvicorn_calls: list[dict[str, Any]],
) -> None:
    entry.main(["--reload"])

    assert uvicorn_calls[0]["reload"] is True


@pytest.mark.parametrize("name", TRACING_VARIABLES)
def test_create_app_refuses_tracing_however_it_is_called(
    monkeypatch: pytest.MonkeyPatch, name: str
) -> None:
    # A composition root that skips load_settings (a script, a worker) must
    # still refuse (security review S1).
    monkeypatch.setenv(name, "true")

    with pytest.raises(ConfigError) as caught:
        create_app(Settings(app_env="test"))

    assert caught.value.field_errors == [f"{name} (tracing_not_allowed)"]


# The Commerce API HTTP client's lifecycle (Phase 14 plan.md section 9, OD13;
# AC25).


def test_the_app_closes_its_commerce_client_on_shutdown() -> None:
    http = FakeCommerce().http_client()
    app = create_app(Settings(app_env="test"), commerce_http_client=http)

    with TestClient(app):
        assert not http.is_closed

    assert http.is_closed


def test_liveness_and_a_non_commerce_turn_never_call_commerce_api() -> None:
    commerce = FakeCommerce()
    http = commerce.http_client()
    app = create_app(Settings(app_env="test"), commerce_http_client=http)

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        hello = client.post("/v1/agent/turns", json={"message": "Hello"})
        shown = client.post("/v1/agent/turns", json={"message": "Show desserts"})

    # Neither liveness nor a turn that only changes the screen needs
    # commerce-api (AC22; presentation tools do no I/O, Phase 15).
    assert hello.status_code == shown.status_code == 200
    assert commerce.requests == []


def test_the_default_model_adds_through_the_injected_client() -> None:
    # Phase 15 plan.md OD6: the simulated model now performs "add <item>" with
    # add_cart_item, through the one Commerce API client the app was given.
    # An empty FakeCommerce answers 404, so the add fails and no UI command
    # is returned.
    commerce = FakeCommerce()
    http = commerce.http_client()
    app = create_app(Settings(app_env="test"), commerce_http_client=http)

    with TestClient(app) as client:
        turn = client.post("/v1/agent/turns", json={"message": "Add a tiramisu"})

    assert turn.status_code == 200
    assert "uiCommands" not in turn.json()
    assert [(r.method, r.url.path) for r in commerce.requests] == [
        ("POST", "/v1/cart/items")
    ]


def test_each_default_app_builds_its_own_client_and_closes_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The path taken when no client is injected: create_app builds one from
    # settings. The real builder runs; this only records what it returns.
    built: list[Any] = []

    def recording_builder(settings: Settings) -> Any:
        http = build_commerce_http_client(settings)
        built.append(http)
        return http

    monkeypatch.setattr(main_module, "build_commerce_http_client", recording_builder)
    settings = Settings(app_env="test", commerce_api_url="http://commerce.test:4000")

    first, second = create_app(settings), create_app(settings)
    with TestClient(first), TestClient(second):
        assert [c.is_closed for c in built] == [False, False]

    assert len(built) == 2
    assert built[0] is not built[1]
    assert all(str(c.base_url) == "http://commerce.test:4000" for c in built)
    assert all(c.is_closed for c in built)
