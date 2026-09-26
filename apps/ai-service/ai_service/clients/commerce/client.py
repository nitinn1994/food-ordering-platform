"""The one way this service talks to commerce-api (Phase 14 plan.md
sections 9-12).

Five typed operations, one per commerce-api route a tool needs, and nothing
else: no public method takes a URL, a path, an HTTP method or headers
(tests/test_commerce_client.py pins the public surface). The base URL is set
once, from ``COMMERCE_API_URL``, on the ``httpx.AsyncClient`` this class is
given, and every route is a constant here.

Every 2xx body is validated against a model generated from
``packages/contracts/api-contracts`` (ADR-0003); every failure becomes one of
the four errors in ``errors.py``. The client decides nothing about commerce:
availability, quantities, prices and totals are commerce-api's alone
(system-architecture.md section 5). It never retries: a cart add is a delta
(section 8 gap 3).
"""

from typing import Annotated, Any, Literal

import httpx
from pydantic import BaseModel, TypeAdapter, ValidationError

from ai_service.clients.commerce.errors import (
    CommerceApiError,
    CommerceBadResponseError,
    CommerceOutcomeUnknownError,
    CommerceUnavailableError,
)
from ai_service.config import Settings
from ai_service.contracts.api_contracts import (
    AddCartItemRequest,
    CartResponse,
    MenuResponse,
    UpdateCartItemRequest,
)
from ai_service.core.request_context import correlation_id_var
from ai_service.schemas.errors import ErrorResponse

MENU_ROUTE = "/v1/menu"
CART_ROUTE = "/v1/cart"
CART_ITEMS_ROUTE = "/v1/cart/items"
CART_ITEM_ROUTE = "/v1/cart/items/{item_id}"

CORRELATION_ID_HEADER = "X-Correlation-Id"

# The contract's own item id constraints (length and slug pattern), taken
# from the generated model rather than restated. A path parameter is checked
# against them before it is placed in a path: the pattern admits no "/",
# ".", "%" or whitespace, so no id can change the route (plan.md AC6).
_ITEM_ID: TypeAdapter[str] = TypeAdapter(
    Annotated[str, *AddCartItemRequest.model_fields["itemId"].metadata]
)

# Transport failures after which the request cannot have been sent: safe to
# report as "unavailable" even for a write.
_NOT_SENT = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)

Method = Literal["GET", "POST", "PATCH", "DELETE"]

# The HTTP client type, named here so the composition root (main.py) can
# accept one without importing httpx, which only clients/ may do.
CommerceHttpClient = httpx.AsyncClient


class InvalidCommerceArgumentError(ValueError):
    """A caller passed an argument the contract forbids. Tools validate
    first, so reaching this is a bug, never a commerce outcome."""

    def __init__(self) -> None:
        super().__init__("Invalid argument for a commerce request.")


def build_commerce_http_client(
    settings: Settings, transport: httpx.AsyncBaseTransport | None = None
) -> CommerceHttpClient:
    """The one ``httpx.AsyncClient`` an app uses, closed on shutdown by
    ``create_app``'s lifespan (plan.md OD13). ``transport`` is for tests
    (httpx.MockTransport); the service never passes one."""
    return httpx.AsyncClient(
        base_url=settings.commerce_api_url,
        transport=transport,
        timeout=httpx.Timeout(settings.commerce_api_timeout_seconds),
        # A redirect would send the request somewhere COMMERCE_API_URL does
        # not name; the environment's proxies and .netrc are not ours to
        # trust (plan.md AC5).
        follow_redirects=False,
        trust_env=False,
        headers={"Accept": "application/json"},
    )


class CommerceClient:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def get_menu(self) -> MenuResponse:
        return await self._send("GET", MENU_ROUTE, MenuResponse, write=False)

    async def get_cart(self) -> CartResponse:
        return await self._send("GET", CART_ROUTE, CartResponse, write=False)

    async def add_cart_item(self, item_id: str, quantity: int) -> CartResponse:
        body = _request_body(AddCartItemRequest, itemId=item_id, quantity=quantity)
        return await self._send(
            "POST", CART_ITEMS_ROUTE, CartResponse, write=True, body=body
        )

    async def set_cart_item_quantity(self, item_id: str, quantity: int) -> CartResponse:
        body = _request_body(UpdateCartItemRequest, quantity=quantity)
        return await self._send(
            "PATCH", _cart_item_route(item_id), CartResponse, write=True, body=body
        )

    async def remove_cart_item(self, item_id: str) -> CartResponse:
        return await self._send(
            "DELETE", _cart_item_route(item_id), CartResponse, write=True
        )

    async def _send[ResponseT: BaseModel](
        self,
        method: Method,
        route: str,
        model: type[ResponseT],
        *,
        write: bool,
        body: dict[str, Any] | None = None,
    ) -> ResponseT:
        headers: dict[str, str] = {}
        correlation_id = correlation_id_var.get()
        if correlation_id is not None:
            headers[CORRELATION_ID_HEADER] = correlation_id
        # Every exception below is re-raised "from None": httpx's own text
        # can name the URL, and nothing here may carry it into a log.
        try:
            response = await self._http.request(
                method, route, json=body, headers=headers
            )
        except _NOT_SENT:
            raise CommerceUnavailableError() from None
        except httpx.DecodingError:
            # A response arrived but its body could not be decoded (a bad
            # Content-Encoding). Not a TransportError, so caught on its own.
            # The outcome is known, so this is a bad response even for a
            # write, never "outcome unknown".
            raise CommerceBadResponseError() from None
        except httpx.TransportError:
            # Timed out or dropped after the request may have been sent.
            if write:
                raise CommerceOutcomeUnknownError() from None
            raise CommerceUnavailableError() from None
        return _parse(response, model)


def _cart_item_route(item_id: str) -> str:
    try:
        valid = _ITEM_ID.validate_python(item_id, strict=True)
    except ValidationError:
        raise InvalidCommerceArgumentError() from None
    return CART_ITEM_ROUTE.format(item_id=valid)


def _request_body(model: type[BaseModel], **fields: Any) -> dict[str, Any]:
    # The generated request model is the body's schema. A ValidationError
    # here would carry the rejected value, so it never leaves this function
    # (ADR-0019, S2).
    try:
        request = model.model_validate(fields, strict=True)
    except ValidationError:
        raise InvalidCommerceArgumentError() from None
    return request.model_dump(mode="json")


def _parse[ResponseT: BaseModel](
    response: httpx.Response, model: type[ResponseT]
) -> ResponseT:
    status = response.status_code
    if 200 <= status < 300:
        try:
            return model.model_validate_json(response.content)
        except ValidationError:
            raise CommerceBadResponseError(status) from None
    if status >= 500:
        raise CommerceUnavailableError(status)
    if 400 <= status < 500:
        try:
            error = ErrorResponse.model_validate_json(response.content)
        except ValidationError:
            raise CommerceBadResponseError(status) from None
        raise CommerceApiError(status, error.code)
    # 1xx or 3xx: redirects are never followed (build_commerce_http_client).
    raise CommerceBadResponseError(status)
