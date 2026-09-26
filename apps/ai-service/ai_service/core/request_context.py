"""Request correlation, the completion log line, and the last-resort 500.

A pure ASGI middleware, not ``BaseHTTPMiddleware``, and installed as the
outermost user middleware. Starlette sends responses for unhandled
exceptions from ``ServerErrorMiddleware``, which sits *outside* every user
middleware, so a response built there would never pass through this one and
would go out without ``X-Request-Id``/``X-Correlation-Id`` - the same class
of ordering bug that left commerce-api's 413 without headers (ADR-0013).
This middleware therefore catches the exception itself and sends the 500.

Header rules match commerce-api (docs/api/commerce-api.md section 7):

- ``X-Request-Id``: always server-generated; an inbound value is ignored.
- ``X-Correlation-Id``: a valid inbound value is echoed; a missing or invalid
  one is replaced, never rejected. "Valid" is @contracts/common's
  ``correlationIdSchema`` (a string of 1 to ``MAX_CORRELATION_ID_LENGTH``,
  64, characters) *and* visible ASCII only (0x21-0x7E). The value is echoed
  into a response header, where control characters are not allowed (RFC
  9110), so this is deliberately stricter than the shared schema
  (security-review.md S1).

Headers, query strings and bodies are never logged (plan.md section 12).
"""

import json
import logging
import re
import time
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ai_service.core.errors import INTERNAL_ERROR_RESPONSE

REQUEST_ID_HEADER = b"x-request-id"
CORRELATION_ID_HEADER = b"x-correlation-id"
# packages/contracts/common/src/ids.ts, MAX_CORRELATION_ID_LENGTH.
MAX_CORRELATION_ID_LENGTH = 64
_VALID_CORRELATION_ID = re.compile(rf"[\x21-\x7e]{{1,{MAX_CORRELATION_ID_LENGTH}}}")

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
correlation_id_var: ContextVar[str | None] = ContextVar("correlation_id", default=None)

logger = logging.getLogger("ai_service.request")

_INTERNAL_ERROR_BODY = json.dumps(INTERNAL_ERROR_RESPONSE.to_body()).encode()
_INTERNAL_ERROR_HEADERS = [
    (b"content-type", b"application/json"),
    (b"content-length", str(len(_INTERNAL_ERROR_BODY)).encode()),
]


def _inbound_correlation_id(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == CORRELATION_ID_HEADER:
            decoded: str = value.decode("latin-1")
            if _VALID_CORRELATION_ID.fullmatch(decoded):
                return decoded
            return None
    return None


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        correlation_id = _inbound_correlation_id(scope) or str(uuid.uuid4())
        request_token = request_id_var.set(request_id)
        correlation_token = correlation_id_var.set(correlation_id)
        context_headers = [
            (REQUEST_ID_HEADER, request_id.encode("latin-1")),
            (CORRELATION_ID_HEADER, correlation_id.encode("latin-1")),
        ]

        status = 500
        response_started = False
        started_at = time.perf_counter()

        async def send_with_context(message: Message) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status = message["status"]
                headers = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() not in (REQUEST_ID_HEADER, CORRELATION_ID_HEADER)
                ]
                message["headers"] = headers + context_headers
            await send(message)

        try:
            await self.app(scope, receive, send_with_context)
        except Exception:
            # The traceback stays server-side, tagged with the request id by
            # the logging filter; the client gets a static body only.
            logger.exception("Unhandled exception while handling request")
            if not response_started:
                await send_with_context(
                    {
                        "type": "http.response.start",
                        "status": 500,
                        "headers": list(_INTERNAL_ERROR_HEADERS),
                    }
                )
                await send({"type": "http.response.body", "body": _INTERNAL_ERROR_BODY})
            status = 500
        finally:
            logger.info(
                "request completed",
                extra={
                    "fields": {
                        "method": scope["method"],
                        # scope["path"] excludes the query string by definition.
                        "path": scope["path"],
                        "status": status,
                        "duration_ms": round(
                            (time.perf_counter() - started_at) * 1000, 2
                        ),
                    }
                },
            )
            request_id_var.reset(request_token)
            correlation_id_var.reset(correlation_token)
