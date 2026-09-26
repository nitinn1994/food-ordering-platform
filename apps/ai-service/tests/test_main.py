from typing import Any

import pytest
import uvicorn

from ai_service import __main__ as entry


@pytest.fixture
def uvicorn_calls(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def fake_run(app: str, **kwargs: Any) -> None:
        calls.append({"app": app, **kwargs})

    monkeypatch.setattr(uvicorn, "run", fake_run)
    # main() configures the process-wide root logger; keep that out of the
    # test process (tests/test_logging.py covers configure_logging itself).
    monkeypatch.setattr(entry, "configure_logging", lambda settings: None)
    for name in ("APP_ENV", "HOST", "PORT", "LOG_LEVEL", "LOG_FORMAT"):
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
