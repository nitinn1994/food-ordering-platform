import asyncio
import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from starlette.types import Message, Receive, Scope, Send

from ai_service.core.request_limits import (
    JSON_BODY_LIMIT_BYTES,
    RequestLimitsMiddleware,
)

PATH = "/v1/agent/turns"
JSON = {"content-type": "application/json"}
JSON_TYPE = b"application/json"
TOO_LARGE = {"code": "PAYLOAD_TOO_LARGE", "message": "Request body is too large."}
UNSUPPORTED = {
    "code": "UNSUPPORTED_MEDIA_TYPE",
    "message": "Request body must be application/json.",
}


def json_body_of_size(size: int) -> bytes:
    """A syntactically valid JSON body of exactly ``size`` bytes."""
    prefix, suffix = b'{"message": "', b'"}'
    return prefix + b"x" * (size - len(prefix) - len(suffix)) + suffix


# Size


def test_body_over_the_limit_is_413(client: TestClient) -> None:
    response = client.post(
        PATH, content=json_body_of_size(JSON_BODY_LIMIT_BYTES + 1), headers=JSON
    )

    assert response.status_code == 413
    assert response.json() == TOO_LARGE
    assert response.headers["x-request-id"]
    assert response.headers["x-correlation-id"]


def test_body_at_the_limit_reaches_validation(client: TestClient) -> None:
    response = client.post(
        PATH, content=json_body_of_size(JSON_BODY_LIMIT_BYTES), headers=JSON
    )

    # Past the limit check; rejected by the schema (message too long) instead.
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_PAYLOAD"


def test_streamed_body_without_a_length_is_counted(client: TestClient) -> None:
    body = json_body_of_size(JSON_BODY_LIMIT_BYTES + 1)

    def chunks() -> Iterator[bytes]:
        yield body[:1000]
        yield body[1000:]

    response = client.post(PATH, content=chunks(), headers=JSON)

    assert "content-length" not in {k.lower() for k in response.request.headers}
    assert response.status_code == 413
    assert response.json() == TOO_LARGE


def test_small_streamed_body_is_passed_on(client: TestClient) -> None:
    def chunks() -> Iterator[bytes]:
        yield b'{"message": '
        yield b'"Hello"}'

    response = client.post(PATH, content=chunks(), headers=JSON)

    assert response.status_code == 200


# Content type


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({"content-type": "text/plain"}, id="text-plain"),
        pytest.param({"content-type": "application/x-www-form-urlencoded"}, id="form"),
        pytest.param({}, id="none"),
    ],
)
def test_body_that_is_not_json_is_415(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.post(PATH, content=b'{"message": "Hello"}', headers=headers)

    assert response.status_code == 415
    assert response.json() == UNSUPPORTED
    assert response.headers["x-request-id"]
    assert response.headers["x-correlation-id"]


def test_json_with_a_charset_is_accepted(client: TestClient) -> None:
    response = client.post(
        PATH,
        content=b'{"message": "Hello"}',
        headers={"content-type": "application/json; charset=utf-8"},
    )

    assert response.status_code == 200


def test_content_type_is_checked_before_size(client: TestClient) -> None:
    response = client.post(
        PATH,
        content=b"x" * (JSON_BODY_LIMIT_BYTES + 1),
        headers={"content-type": "text/plain"},
    )

    assert response.status_code == 415


# Requests without a body


def test_requests_without_a_body_are_untouched(client: TestClient) -> None:
    assert client.get("/health").status_code == 200
    # No body, no content type: reaches routing, which answers 405.
    assert client.post("/health").status_code == 405
    assert client.delete("/health").status_code == 405


# The middleware on its own (cases a test client cannot produce)


def run_middleware(messages: list[Message]) -> tuple[list[Message], list[bytes]]:
    """Drive the middleware with ``messages`` as the request stream. Returns
    what it sent and each body the inner app received."""
    sent: list[Message] = []
    app_bodies: list[bytes] = []
    incoming = iter(messages)

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        message = await receive()
        app_bodies.append(message["body"])
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive() -> Message:
        return next(incoming)

    async def send(message: Message) -> None:
        sent.append(message)

    scope: Scope = {
        "type": "http",
        "method": "POST",
        "headers": [
            (b"content-type", b"application/json"),
            (b"transfer-encoding", b"chunked"),
        ],
    }
    asyncio.run(RequestLimitsMiddleware(app)(scope, receive, send))
    return sent, app_bodies


def chunk(body: bytes, more: bool) -> Message:
    return {"type": "http.request", "body": body, "more_body": more}


def test_chunks_are_joined_and_replayed_once() -> None:
    sent, app_bodies = run_middleware(
        [chunk(b'{"a"', True), chunk(b": 1", True), chunk(b"}", False)]
    )

    assert app_bodies == [b'{"a": 1}']
    assert sent[0]["status"] == 204


def test_chunks_over_the_limit_never_reach_the_app() -> None:
    half = b"x" * (JSON_BODY_LIMIT_BYTES // 2 + 1)

    sent, app_bodies = run_middleware([chunk(half, True), chunk(half, False)])

    assert app_bodies == []
    assert sent[0]["status"] == 413
    assert json.loads(sent[1]["body"]) == TOO_LARGE


def test_client_disconnect_while_reading_sends_nothing() -> None:
    sent, app_bodies = run_middleware([chunk(b"{", True), {"type": "http.disconnect"}])

    assert sent == []
    assert app_bodies == []


# Repeated headers: the first value decides, as it does for FastAPI's parser
# (Phase 13 review, finding 1).


def test_repeated_content_type_is_judged_by_its_first_value(
    client: TestClient,
) -> None:
    body = b'{"message": "Hello"}'

    rejected = client.post(
        PATH,
        content=body,
        headers=[(b"content-type", b"text/plain"), (b"content-type", JSON_TYPE)],
    )
    accepted = client.post(
        PATH,
        content=body,
        headers=[(b"content-type", JSON_TYPE), (b"content-type", b"text/plain")],
    )

    assert rejected.status_code == 415
    assert rejected.json() == UNSUPPORTED
    assert accepted.status_code == 200


def test_repeated_content_length_cannot_lift_the_limit() -> None:
    # First value small, a later one large: the declared-size check reads the
    # first, and the byte count while reading still refuses the real body.
    sent: list[Message] = []
    app_calls: list[Scope] = []
    big = b"x" * (JSON_BODY_LIMIT_BYTES + 1)
    incoming = iter([{"type": "http.request", "body": big, "more_body": False}])

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        app_calls.append(scope)

    async def receive() -> Message:
        return next(incoming)

    async def send(message: Message) -> None:
        sent.append(message)

    scope: Scope = {
        "type": "http",
        "method": "POST",
        "headers": [
            (b"content-type", JSON_TYPE),
            (b"content-length", b"10"),
            (b"content-length", str(len(big)).encode()),
        ],
    }
    asyncio.run(RequestLimitsMiddleware(app)(scope, receive, send))

    assert app_calls == []
    assert sent[0]["status"] == 413
