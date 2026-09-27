"""Security response headers on every response (Phase 18,
docs/features/phase-18-production-hardening/plan.md section 3 S-2, AC15).

The same set as commerce-api's security-headers.middleware.ts. This service
answers JSON to apps/web's server only, so each value is the strictest one:

- ``nosniff``: a JSON body is never reinterpreted as script or HTML;
- CSP ``default-src 'none'; frame-ancestors 'none'``: were a body ever
  rendered, it could load and run nothing, and it cannot be framed. In
  development the API docs (/docs, /redoc) load scripts, so they are left
  without a CSP there; they are not served anywhere else;
- ``no-referrer``: nothing leaks from a followed link;
- ``no-store``: a turn's reply and commands describe one moment's cart.

A pure ASGI middleware, installed as the outermost user middleware, for the
reason core/request_context.py gives: only then does every response,
including that middleware's own last-resort 500, pass through it. A header
the app already set is replaced, never duplicated.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

SECURITY_HEADERS: tuple[tuple[bytes, bytes], ...] = (
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"cache-control", b"no-store"),
)
# Development only (main.py serves them nowhere else); they need scripts.
_DOCS_PATHS = frozenset({"/docs", "/redoc"})


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        added = SECURITY_HEADERS
        if scope["path"] in _DOCS_PATHS:
            added = tuple(
                h for h in SECURITY_HEADERS if h[0] != b"content-security-policy"
            )

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                names = {name for name, _ in added}
                message["headers"] = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() not in names
                ] + list(added)
            await send(message)

        await self.app(scope, receive, send_with_headers)
