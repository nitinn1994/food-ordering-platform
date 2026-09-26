"""The Commerce API client (Phase 14 plan.md sections 9-12; AC3, AC5-AC9).

Every test runs the real ``build_commerce_http_client`` and
``CommerceClient`` against ``tests/commerce_fakes.FakeCommerce`` (httpx's
MockTransport): no network, no running commerce-api.
"""

import inspect
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import pytest
from pydantic import BaseModel

from ai_service.clients.commerce import (
    CommerceApiError,
    CommerceBadResponseError,
    CommerceClient,
    CommerceClientError,
    CommerceOutcomeUnknownError,
    CommerceUnavailableError,
    InvalidCommerceArgumentError,
    build_commerce_http_client,
)
from ai_service.config import Settings
from ai_service.contracts.api_contracts import CartResponse, MenuResponse
from ai_service.core.request_context import correlation_id_var
from tests.commerce_fakes import (
    CART,
    EMPTY_CART,
    MENU,
    FakeCommerce,
    contract_error,
    json_response,
)

SENTINEL = "SENTINEL_COMMERCE_7c1e"

Operation = Callable[[CommerceClient], Awaitable[Any]]

# name -> (operation, method, path, request body, response body, model)
OPERATIONS: dict[str, tuple[Operation, str, str, Any, Any, type[BaseModel]]] = {
    "get_menu": (
        lambda c: c.get_menu(),
        "GET",
        "/v1/menu",
        None,
        MENU,
        MenuResponse,
    ),
    "get_cart": (
        lambda c: c.get_cart(),
        "GET",
        "/v1/cart",
        None,
        CART,
        CartResponse,
    ),
    "add_cart_item": (
        lambda c: c.add_cart_item("tiramisu", 2),
        "POST",
        "/v1/cart/items",
        {"itemId": "tiramisu", "quantity": 2},
        CART,
        CartResponse,
    ),
    "set_cart_item_quantity": (
        lambda c: c.set_cart_item_quantity("tiramisu", 3),
        "PATCH",
        "/v1/cart/items/tiramisu",
        {"quantity": 3},
        CART,
        CartResponse,
    ),
    "remove_cart_item": (
        lambda c: c.remove_cart_item("tiramisu"),
        "DELETE",
        "/v1/cart/items/tiramisu",
        None,
        CART,
        CartResponse,
    ),
}
READS = ["get_menu", "get_cart"]
WRITES = ["add_cart_item", "set_cart_item_quantity", "remove_cart_item"]


def _scripted(name: str, outcome: Any) -> tuple[FakeCommerce, Operation]:
    operation, method, path, *_ = OPERATIONS[name]
    return FakeCommerce().on(method, path, outcome), operation


def _raises(fake: FakeCommerce, operation: Operation) -> CommerceClientError:
    with pytest.raises(CommerceClientError) as caught:
        fake.run(operation)
    return caught.value


# Public surface (AC3)


def test_public_surface_is_exactly_the_five_operations() -> None:
    public = {name for name in dir(CommerceClient) if not name.startswith("_")}

    assert public == set(OPERATIONS)


@pytest.mark.parametrize("name", list(OPERATIONS))
def test_no_operation_accepts_a_url_method_or_headers(name: str) -> None:
    parameters = set(inspect.signature(getattr(CommerceClient, name)).parameters)

    assert parameters <= {"self", "item_id", "quantity"}


# Routes, bodies, parsing (AC13 at the client level)


@pytest.mark.parametrize("name", list(OPERATIONS))
def test_each_operation_calls_its_one_route(name: str) -> None:
    operation, method, path, request_body, response_body, model = OPERATIONS[name]
    fake = FakeCommerce().on(method, path, json_response(200, response_body))

    result = fake.run(operation)

    assert isinstance(result, model)
    assert result.model_dump(mode="json") == response_body
    assert [(r.method, r.url.path) for r in fake.requests] == [(method, path)]
    assert fake.request_json() == request_body
    if request_body is not None:
        assert fake.requests[0].headers["content-type"] == "application/json"


# Construction (AC4, AC5)


def test_http_client_is_built_from_settings_only() -> None:
    settings = Settings(
        app_env="test",
        commerce_api_url="http://commerce.test:4000",
        commerce_api_timeout_seconds=1.5,
    )

    http = build_commerce_http_client(settings)

    assert str(http.base_url) == "http://commerce.test:4000"
    assert http.timeout == httpx.Timeout(1.5)
    assert http.follow_redirects is False
    assert http.trust_env is False


def test_a_redirect_is_never_followed() -> None:
    redirect = httpx.Response(302, headers={"Location": "http://elsewhere.test/x"})
    fake, operation = _scripted("get_menu", redirect)

    error = _raises(fake, operation)

    assert isinstance(error, CommerceBadResponseError)
    assert error.status == 302
    assert len(fake.requests) == 1


# Headers (AC9)


def test_correlation_id_is_forwarded() -> None:
    fake, operation = _scripted("get_cart", json_response(200, CART))
    token = correlation_id_var.set("turn-abc-123")
    try:
        fake.run(operation)
    finally:
        correlation_id_var.reset(token)

    assert fake.requests[0].headers["x-correlation-id"] == "turn-abc-123"


def test_no_correlation_header_without_a_request_context() -> None:
    fake, operation = _scripted("get_cart", json_response(200, CART))

    fake.run(operation)

    assert "x-correlation-id" not in fake.requests[0].headers


def test_only_standard_headers_are_sent() -> None:
    fake, operation = _scripted("add_cart_item", json_response(200, CART))

    fake.run(operation)

    sent = {name.lower() for name in fake.requests[0].headers}
    assert sent <= {
        "host",
        "accept",
        "accept-encoding",
        "connection",
        "user-agent",
        "content-length",
        "content-type",
        "x-correlation-id",
    }
    assert fake.requests[0].headers["accept"] == "application/json"


# Argument safety (AC6)

BAD_ITEM_IDS = ["../x", "a/b", "%2e", "", "A", "a" * 65, "tira misu", "..", "a-"]


@pytest.mark.parametrize("item_id", BAD_ITEM_IDS)
@pytest.mark.parametrize(
    "call",
    [
        lambda c, i: c.set_cart_item_quantity(i, 1),
        lambda c, i: c.remove_cart_item(i),
        lambda c, i: c.add_cart_item(i, 1),
    ],
    ids=["set", "remove", "add"],
)
def test_invalid_item_id_never_reaches_the_transport(
    item_id: str, call: Callable[[CommerceClient, str], Awaitable[Any]]
) -> None:
    fake = FakeCommerce()

    with pytest.raises(InvalidCommerceArgumentError) as caught:
        fake.run(lambda c: call(c, item_id))

    assert fake.requests == []
    assert caught.value.__cause__ is None
    assert caught.value.__suppress_context__


@pytest.mark.parametrize("quantity", [0, 100, -1, "2", 2.0, True])
@pytest.mark.parametrize(
    "call",
    [
        lambda c, q: c.add_cart_item("tiramisu", q),
        lambda c, q: c.set_cart_item_quantity("tiramisu", q),
    ],
    ids=["add", "set"],
)
def test_invalid_quantity_never_reaches_the_transport(
    quantity: Any, call: Callable[[CommerceClient, Any], Awaitable[Any]]
) -> None:
    fake = FakeCommerce()

    with pytest.raises(InvalidCommerceArgumentError):
        fake.run(lambda c: call(c, quantity))

    assert fake.requests == []


# Response validation (AC7)


@pytest.mark.parametrize(
    "body",
    [
        pytest.param(b"not json " + SENTINEL.encode(), id="invalid-json"),
        pytest.param(b'{"items": []}', id="missing-fields"),
        pytest.param(
            json.dumps({**EMPTY_CART, "x": SENTINEL}).encode(), id="unknown-key"
        ),
        pytest.param(
            json.dumps({**EMPTY_CART, "itemCount": SENTINEL}).encode(),
            id="wrong-type",
        ),
    ],
)
def test_malformed_success_body_is_a_bad_response(
    body: bytes, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    fake, operation = _scripted("get_cart", httpx.Response(200, content=body))

    error = _raises(fake, operation)

    assert isinstance(error, CommerceBadResponseError)
    assert error.status == 200
    assert error.__suppress_context__
    assert SENTINEL not in str(error)
    assert SENTINEL not in caplog.text


# Failure classification (AC8)

_ALL = list(OPERATIONS)


@pytest.mark.parametrize("name", _ALL)
@pytest.mark.parametrize(
    "exception", [httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout]
)
def test_request_never_sent_is_unavailable_even_for_writes(
    name: str, exception: type[httpx.TransportError]
) -> None:
    fake, operation = _scripted(name, exception)

    error = _raises(fake, operation)

    assert type(error) is CommerceUnavailableError
    assert error.status is None
    assert len(fake.requests) == 1


SENT_THEN_LOST = [
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.ReadError,
    httpx.RemoteProtocolError,
]


@pytest.mark.parametrize("name", READS)
@pytest.mark.parametrize("exception", SENT_THEN_LOST)
def test_lost_read_is_unavailable(
    name: str, exception: type[httpx.TransportError]
) -> None:
    fake, operation = _scripted(name, exception)

    assert type(_raises(fake, operation)) is CommerceUnavailableError


@pytest.mark.parametrize("name", WRITES)
@pytest.mark.parametrize("exception", SENT_THEN_LOST)
def test_lost_write_has_an_unknown_outcome_and_is_not_retried(
    name: str, exception: type[httpx.TransportError]
) -> None:
    fake, operation = _scripted(name, exception)

    error = _raises(fake, operation)

    assert type(error) is CommerceOutcomeUnknownError
    assert len(fake.requests) == 1


def test_transport_exception_text_is_not_kept() -> None:
    fake, operation = _scripted("get_menu", httpx.ConnectError)

    error = _raises(fake, operation)

    assert "simulated" not in str(error)
    assert error.__suppress_context__


@pytest.mark.parametrize("status", [500, 502, 503, 504])
@pytest.mark.parametrize("name", _ALL)
def test_server_error_is_unavailable_and_not_retried(name: str, status: int) -> None:
    fake, operation = _scripted(
        name, contract_error(status, "SERVICE_UNAVAILABLE", SENTINEL)
    )

    error = _raises(fake, operation)

    assert type(error) is CommerceUnavailableError
    assert error.status == status
    assert len(fake.requests) == 1


@pytest.mark.parametrize(
    ("name", "status", "code"),
    [
        ("add_cart_item", 404, "MENU_ITEM_NOT_FOUND"),
        ("add_cart_item", 422, "MENU_ITEM_UNAVAILABLE"),
        ("add_cart_item", 422, "CART_ITEM_QUANTITY_LIMIT_EXCEEDED"),
        ("add_cart_item", 409, "CART_CONFLICT"),
        ("set_cart_item_quantity", 404, "CART_ITEM_NOT_FOUND"),
        ("remove_cart_item", 404, "CART_ITEM_NOT_FOUND"),
        ("add_cart_item", 400, "INVALID_PAYLOAD"),
        ("get_menu", 404, "ROUTE_NOT_FOUND"),
        ("get_cart", 418, "SOMETHING_NEW"),
    ],
)
def test_contract_error_keeps_status_and_code_only(
    name: str, status: int, code: str
) -> None:
    fake, operation = _scripted(name, contract_error(status, code, SENTINEL))

    error = _raises(fake, operation)

    assert isinstance(error, CommerceApiError)
    assert (error.status, error.code) == (status, code)
    assert SENTINEL not in str(error)
    assert SENTINEL not in repr(vars(error))
    assert len(fake.requests) == 1


@pytest.mark.parametrize(
    "response",
    [
        pytest.param(httpx.Response(400, content=b"<html>"), id="html"),
        pytest.param(httpx.Response(404), id="empty"),
        pytest.param(json_response(409, {"error": "x"}), id="not-a-contract-error"),
        pytest.param(
            json_response(422, {"code": "lower", "message": "m"}), id="bad-code"
        ),
    ],
)
def test_client_error_without_a_contract_body_is_a_bad_response(
    response: httpx.Response,
) -> None:
    fake, operation = _scripted("add_cart_item", response)

    error = _raises(fake, operation)

    assert isinstance(error, CommerceBadResponseError)
    assert error.status == response.status_code


def test_informational_or_unexpected_status_is_a_bad_response() -> None:
    fake, operation = _scripted("get_menu", httpx.Response(304))

    assert isinstance(_raises(fake, operation), CommerceBadResponseError)


# A response that arrived but cannot be decoded (review finding 1):
# httpx.DecodingError is a RequestError, not a TransportError.


def _undecodable(request: httpx.Request) -> httpx.Response:
    # A stream, so the body is decoded only when the client reads it, as it
    # would be from a real server.
    return httpx.Response(
        200,
        headers={"Content-Encoding": "gzip"},
        stream=httpx.ByteStream(b"not gzip " + SENTINEL.encode()),
    )


@pytest.mark.parametrize("name", _ALL)
def test_an_undecodable_response_is_a_bad_response(name: str) -> None:
    fake, operation = _scripted(name, _undecodable)

    error = _raises(fake, operation)

    # Bad response even for a write: a response arrived, so the outcome is
    # known, and nothing is retried.
    assert type(error) is CommerceBadResponseError
    assert error.__suppress_context__
    assert SENTINEL not in str(error)
    assert len(fake.requests) == 1


@pytest.mark.parametrize("name", _ALL)
def test_a_raised_decoding_error_is_a_bad_response(name: str) -> None:
    fake, operation = _scripted(name, httpx.DecodingError)

    assert type(_raises(fake, operation)) is CommerceBadResponseError
