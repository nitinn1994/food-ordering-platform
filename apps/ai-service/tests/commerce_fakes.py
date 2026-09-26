"""A fake commerce-api for tests, on httpx's own ``MockTransport``.

Never shipped. It records every request the Commerce API client sends and
answers from a table of scripted outcomes: a response, a function of the
request, or an httpx transport exception to raise. An unscripted route gets
commerce-api's own 404 ``ROUTE_NOT_FOUND``. So tests exercise the real
``build_commerce_http_client`` and ``CommerceClient`` with no network and no
running commerce-api.

The bodies below are shaped like docs/api/commerce-api.md sections 11-12.
"""

import asyncio
import inspect
import json
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

import httpx

from ai_service.clients.commerce import CommerceClient, build_commerce_http_client
from ai_service.config import Settings
from ai_service.tools.registry import ToolDefinition, build_tool_registry
from ai_service.tools.results import ToolResult
from ai_service.tools.service import ToolService
from ai_service.ui_commands import (
    PresentationToolService,
    build_presentation_registry,
)

MENU_ITEM: dict[str, Any] = {
    "id": "tiramisu",
    "categoryId": "desserts",
    "name": "Tiramisu",
    "description": "Espresso-soaked ladyfingers, mascarpone.",
    "longDescription": "Layered with mascarpone cream, dusted with cocoa.",
    "priceCents": 750,
    "available": True,
    "dietaryTags": ["vegetarian"],
    "allergens": ["gluten", "dairy", "egg"],
    "calories": 450,
}
MENU: dict[str, Any] = {
    "categories": [{"id": "desserts", "name": "Desserts", "items": [MENU_ITEM]}]
}
CART_LINE: dict[str, Any] = {
    "itemId": "tiramisu",
    "name": "Tiramisu",
    "unitPriceCents": 750,
    "quantity": 2,
    "lineSubtotalCents": 1500,
    "available": True,
}
CART: dict[str, Any] = {"items": [CART_LINE], "itemCount": 2, "subtotalCents": 1500}
EMPTY_CART: dict[str, Any] = {"items": [], "itemCount": 0, "subtotalCents": 0}

Outcome = (
    httpx.Response
    | Callable[[httpx.Request], httpx.Response | Awaitable[httpx.Response]]
    | type[httpx.RequestError]
)


def json_response(status: int, body: Any) -> httpx.Response:
    return httpx.Response(status, json=body)


def contract_error(status: int, code: str, message: str = "Refused.") -> httpx.Response:
    return json_response(status, {"code": code, "message": message})


class FakeCommerce:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self._routes: dict[tuple[str, str], Outcome] = {}

    def on(self, method: str, path: str, outcome: Outcome) -> "FakeCommerce":
        self._routes[(method, path)] = outcome
        return self

    # Async, so a scripted outcome can await (the sequential-execution test
    # holds a request open). httpx's MockTransport awaits it for an
    # AsyncClient, which is the only kind the service uses.
    async def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        outcome = self._routes.get((request.method, request.url.path))
        if outcome is None:
            return contract_error(404, "ROUTE_NOT_FOUND", "Route not found.")
        if isinstance(outcome, httpx.Response):
            return outcome
        if isinstance(outcome, type):
            raise outcome("simulated transport failure", request=request)
        response = outcome(request)
        return await response if inspect.isawaitable(response) else response

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def http_client(self, settings: Settings | None = None) -> httpx.AsyncClient:
        return build_commerce_http_client(
            settings or Settings(app_env="test"), transport=self.transport()
        )

    def run[T](self, operation: Callable[[CommerceClient], Awaitable[T]]) -> T:
        """Run one client operation in a fresh event loop, with the client
        opened and closed inside it."""

        async def call() -> T:
            async with self.http_client() as http:
                return await operation(CommerceClient(http))

        return asyncio.run(call())

    def request_json(self, index: int = -1) -> Any:
        content = self.requests[index].content
        return json.loads(content) if content else None

    def tool_service(self, http: httpx.AsyncClient | None = None) -> ToolService:
        """The real tool service over this fake. For graph tests that never
        close the client; an app closes the one it is given."""
        return ToolService(
            CommerceClient(http or self.http_client()), build_tool_registry()
        )

    def execute_tool(
        self,
        name: str,
        arguments: Any,
        registry: Mapping[str, ToolDefinition[Any]] | None = None,
    ) -> ToolResult:
        """Run one ``ToolService.execute`` call through the real client."""

        async def call() -> ToolResult:
            async with self.http_client() as http:
                service = ToolService(
                    CommerceClient(http), registry or build_tool_registry()
                )
                return await service.execute(name, arguments)

        return asyncio.run(call())


def presentation_service() -> PresentationToolService:
    """The real presentation tool service (Phase 15). It has no I/O, so it
    needs no fake."""
    return PresentationToolService(build_presentation_registry())
