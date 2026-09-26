"""Request body limits: 16 KB of JSON, nothing else.

Added with the first route that accepts a body (ADR-0019), matching
commerce-api's rules (docs/api/commerce-api.md section 3, its
json-body.middleware.ts): a request with a body - POST, PUT, PATCH or DELETE
with a non-zero ``Content-Length`` or any ``Transfer-Encoding`` - must be
``application/json`` (else 415) and at most 16 KB (else 413), checked before
anything parses it.

A pure ASGI middleware, installed inside ``RequestContextMiddleware`` so its
responses carry the correlation headers. It reads the body itself, up to the
limit, and hands the app a buffered copy. It cannot instead abort mid-read:
FastAPI turns any exception raised while it reads a body into a 400. 16 KB is
small enough to buffer, and buffering also catches a streamed body that
sends no ``Content-Length``.

A repeated header is read by its first value, the same rule as Starlette's
``Headers.get``, which FastAPI's body parsing uses. So this middleware and
the parser behind it always judge the same ``Content-Type``.

Assumption: the server enforces ``Content-Length``. A request declaring
``Content-Length: 0`` (and no ``Transfer-Encoding``) is treated as having no
body, and neither check runs. uvicorn (h11) never delivers body bytes beyond
a declared length, so nothing more can arrive. The rule is commerce-api's
``hasBody`` (json-body.middleware.ts). If this service ever runs behind
something that does not enforce ``Content-Length`` (another ASGI server,
HTTP/2 termination, a proxy), count what ``receive`` delivers on that path
too, and change commerce-api the same way (Phase 13 review, finding 2).
"""

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ai_service.core.errors import PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE
from ai_service.schemas.errors import ErrorResponse

# commerce-api's JSON_BODY_LIMIT, "16kb" (16 * 1024 bytes in body-parser).
JSON_BODY_LIMIT_BYTES = 16 * 1024

_METHODS_WITH_BODY = frozenset({"POST", "PUT", "PATCH", "DELETE"})

_TOO_LARGE = ErrorResponse(code=PAYLOAD_TOO_LARGE, message="Request body is too large.")
_UNSUPPORTED = ErrorResponse(
    code=UNSUPPORTED_MEDIA_TYPE, message="Request body must be application/json."
)


class RequestLimitsMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in _METHODS_WITH_BODY:
            await self.app(scope, receive, send)
            return

        content_length = _first_header(scope, b"content-length")
        has_body = (content_length is not None and content_length != b"0") or (
            _first_header(scope, b"transfer-encoding") is not None
        )
        if not has_body:
            await self.app(scope, receive, send)
            return

        content_type = (
            (_first_header(scope, b"content-type") or b"").decode("latin-1").lower()
        )
        if not content_type.startswith("application/json"):
            await _send_error(send, 415, _UNSUPPORTED)
            return
        # Early refusal on the declared size, before reading anything.
        if (
            content_length is not None
            and content_length.isdigit()
            and int(content_length) > JSON_BODY_LIMIT_BYTES
        ):
            await _send_error(send, 413, _TOO_LARGE)
            return

        chunks: list[bytes] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                # The client is gone; there is no one to answer.
                return
            chunk: bytes = message.get("body", b"")
            size += len(chunk)
            if size > JSON_BODY_LIMIT_BYTES:
                await _send_error(send, 413, _TOO_LARGE)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            # After the body, the app may wait for a disconnect.
            return await receive()

        await self.app(scope, replay, send)


def _first_header(scope: Scope, name: bytes) -> bytes | None:
    # ASGI header names are lowercase. First value wins, as in Starlette.
    for key, value in scope.get("headers", []):
        if key == name:
            found: bytes = value
            return found
    return None


async def _send_error(send: Send, status: int, error: ErrorResponse) -> None:
    body = json.dumps(error.to_body()).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
