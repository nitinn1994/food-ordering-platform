import io
import json
import logging
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from ai_service.config import Settings
from ai_service.core.logging import configure_logging
from tests.fixtures_routes import EXCEPTION_SENTINEL

HEADER_SENTINEL = "SENTINEL_HEADER_4b1e"
QUERY_SENTINEL = "SENTINEL_QUERY_0c9a"
BODY_SENTINEL = "SENTBODY9x"  # fits EchoBody's 10-character bound


@pytest.fixture
def log_stream(settings: Settings) -> Iterator[io.StringIO]:
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


def lines(stream: io.StringIO) -> list[dict[str, Any]]:
    return [json.loads(line) for line in stream.getvalue().splitlines() if line]


def completion_lines(stream: io.StringIO) -> list[dict[str, Any]]:
    return [e for e in lines(stream) if e["message"] == "request completed"]


def test_one_completion_line_per_request(
    fixture_client: TestClient, log_stream: io.StringIO
) -> None:
    response = fixture_client.get("/health")

    [entry] = completion_lines(log_stream)
    assert entry["level"] == "INFO"
    assert entry["logger"] == "ai_service.request"
    assert entry["method"] == "GET"
    assert entry["path"] == "/health"
    assert entry["status"] == 200
    assert isinstance(entry["duration_ms"], int | float)
    assert entry["request_id"] == response.headers["x-request-id"]
    assert entry["correlation_id"] == response.headers["x-correlation-id"]
    assert entry["timestamp"].endswith("+00:00")


def test_lines_logged_inside_a_request_carry_its_ids(
    fixture_client: TestClient, log_stream: io.StringIO
) -> None:
    response = fixture_client.get("/__test/log", headers={"X-Correlation-Id": "corr-1"})

    [entry] = [e for e in lines(log_stream) if e["message"] == "inside a request"]
    assert entry["request_id"] == response.headers["x-request-id"]
    assert entry["correlation_id"] == "corr-1"


def test_lines_outside_a_request_have_no_ids(log_stream: io.StringIO) -> None:
    logging.getLogger("ai_service.test").info("no request here")

    [entry] = lines(log_stream)
    assert "request_id" not in entry


def test_headers_query_and_body_are_never_logged(
    fixture_client: TestClient, log_stream: io.StringIO
) -> None:
    fixture_client.get(
        f"/health?k={QUERY_SENTINEL}",
        headers={
            "Authorization": f"Bearer {HEADER_SENTINEL}",
            "Cookie": f"session={HEADER_SENTINEL}",
            "X-Anything": HEADER_SENTINEL,
        },
    )
    fixture_client.post("/__test/echo", json={"text": BODY_SENTINEL})
    fixture_client.post("/__test/echo", json={"text": BODY_SENTINEL * 2})

    # Exclude the test client's own transport logger: httpx (client side, in
    # this process) logs the full request URL it *sent*. It is not a service
    # log line, and the service has no httpx dependency (test_boundaries.py).
    output = "\n".join(
        json.dumps(e) for e in lines(log_stream) if e["logger"] != "httpx"
    )
    for sentinel in (HEADER_SENTINEL, QUERY_SENTINEL, BODY_SENTINEL):
        assert sentinel not in output
    assert [e["path"] for e in completion_lines(log_stream)] == [
        "/health",
        "/__test/echo",
        "/__test/echo",
    ]


def test_unhandled_exception_is_logged_with_traceback_and_request_id(
    fixture_client: TestClient, log_stream: io.StringIO
) -> None:
    response = fixture_client.get("/__test/boom")

    [error] = [e for e in lines(log_stream) if e["level"] == "ERROR"]
    assert error["request_id"] == response.headers["x-request-id"]
    assert "RuntimeError" in error["exc_info"]
    # The detail is server-side only; the response never carries it.
    assert EXCEPTION_SENTINEL in error["exc_info"]
    assert EXCEPTION_SENTINEL not in response.text
    [completion] = completion_lines(log_stream)
    assert completion["status"] == 500


def test_log_level_threshold_applies(log_stream: io.StringIO) -> None:
    configure_logging(Settings(app_env="test", log_level="WARNING"), log_stream)
    logging.getLogger("ai_service.test").info("dropped")
    logging.getLogger("ai_service.test").warning("kept")

    assert [e["message"] for e in lines(log_stream)] == ["kept"]


def test_pretty_format_is_plain_text(log_stream: io.StringIO) -> None:
    configure_logging(Settings(app_env="test", log_format="pretty"), log_stream)
    logging.getLogger("ai_service.test").info("hello")

    output = log_stream.getvalue()
    assert "INFO" in output
    assert "hello" in output
    assert not output.lstrip().startswith("{")


def test_uvicorn_access_log_is_silenced(log_stream: io.StringIO) -> None:
    logging.getLogger("uvicorn.access").info("GET /health?k=%s", QUERY_SENTINEL)
    logging.getLogger("uvicorn.error").info("server started")

    assert [e["message"] for e in lines(log_stream)] == ["server started"]
