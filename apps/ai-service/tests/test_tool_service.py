"""The tool application service (Phase 14 plan.md sections 8 and 12;
AC12-AC14).

Every call goes through the real ``CommerceClient`` to
``tests/commerce_fakes.FakeCommerce``.
"""

import json
from types import MappingProxyType
from typing import Any

import httpx
import pytest
from pydantic import ValidationError

from ai_service.clients.commerce import (
    CommerceClient,
    InvalidCommerceArgumentError,
)
from ai_service.contracts.api_contracts import CartResponse, MenuResponse
from ai_service.tools.registry import ToolDefinition
from ai_service.tools.results import (
    MESSAGES,
    TOOL_CALL_LIMIT_EXCEEDED,
    ToolError,
    ToolResult,
)
from ai_service.tools.schemas import GetMenuInput
from tests.commerce_fakes import (
    CART,
    EMPTY_CART,
    MENU,
    FakeCommerce,
    contract_error,
    json_response,
)

SENTINEL = "SENTINEL_TOOL_4b8d"

# tool -> (arguments, method, path, request body, response body)
TOOLS: dict[str, tuple[dict[str, Any], str, str, Any, Any]] = {
    "get_menu": ({}, "GET", "/v1/menu", None, MENU),
    "get_cart": ({}, "GET", "/v1/cart", None, CART),
    "add_cart_item": (
        {"itemId": "tiramisu", "quantity": 2},
        "POST",
        "/v1/cart/items",
        {"itemId": "tiramisu", "quantity": 2},
        CART,
    ),
    "set_cart_item_quantity": (
        {"itemId": "tiramisu", "quantity": 4},
        "PATCH",
        "/v1/cart/items/tiramisu",
        {"quantity": 4},
        CART,
    ),
    "remove_cart_item": (
        {"itemId": "tiramisu"},
        "DELETE",
        "/v1/cart/items/tiramisu",
        None,
        EMPTY_CART,
    ),
}


def _scripted(name: str, outcome: Any) -> tuple[FakeCommerce, dict[str, Any]]:
    arguments, method, path, *_ = TOOLS[name]
    return FakeCommerce().on(method, path, outcome), arguments


def _error(result: ToolResult) -> ToolError:
    assert not result.ok
    assert result.data is None
    assert result.error is not None
    return result.error


# Success and routing (AC13)


@pytest.mark.parametrize("name", list(TOOLS))
def test_each_tool_calls_its_one_route_and_returns_the_resource(name: str) -> None:
    arguments, method, path, request_body, response_body = TOOLS[name]
    fake = FakeCommerce().on(method, path, json_response(200, response_body))

    result = fake.execute_tool(name, arguments)

    assert result.ok
    assert result.error is None
    assert isinstance(result.data, MenuResponse if name == "get_menu" else CartResponse)
    assert json.loads(result.to_content()) == {"ok": True, "data": response_body}
    assert [(r.method, r.url.path) for r in fake.requests] == [(method, path)]
    assert fake.request_json() == request_body


# Allowlist (AC12)


@pytest.mark.parametrize(
    "name",
    [
        "http_get",
        "GET_MENU",
        "get_menu ",
        "create_order",
        "clear_cart",
        "__class__",
        "",
    ],
)
def test_unknown_tool_is_never_executed(name: str) -> None:
    fake = FakeCommerce()

    result = fake.execute_tool(name, {})

    assert _error(result).code == "UNKNOWN_TOOL"
    assert fake.requests == []


# Arguments (AC12)


@pytest.mark.parametrize(
    ("name", "arguments", "field"),
    [
        ("add_cart_item", {"itemId": "tiramisu"}, "quantity"),
        ("add_cart_item", {"itemId": "../x", "quantity": 1}, "itemId"),
        ("add_cart_item", {"itemId": "tiramisu", "quantity": "2"}, "quantity"),
        ("set_cart_item_quantity", {"itemId": "tiramisu", "quantity": 0}, "quantity"),
        ("remove_cart_item", {"itemId": "Tiramisu"}, "itemId"),
        ("get_menu", {"url": "http://evil.test"}, None),
        ("add_cart_item", {"itemId": "tiramisu", "quantity": 1, "x": 1}, None),
        ("get_cart", "not an object", None),
        ("get_cart", ["a"], None),
        ("remove_cart_item", None, None),
    ],
)
def test_invalid_arguments_never_reach_commerce(
    name: str, arguments: Any, field: str | None
) -> None:
    fake = FakeCommerce()

    result = fake.execute_tool(name, arguments)

    error = _error(result)
    assert error.code == "INVALID_TOOL_ARGUMENTS"
    assert error.field == field
    assert fake.requests == []


def test_an_unknown_key_is_not_echoed_back() -> None:
    fake = FakeCommerce()

    result = fake.execute_tool("get_cart", {SENTINEL: SENTINEL})

    assert SENTINEL not in result.to_content()


def test_a_rejected_value_is_not_echoed_back() -> None:
    fake = FakeCommerce()

    result = fake.execute_tool("add_cart_item", {"itemId": SENTINEL, "quantity": 1})

    assert SENTINEL not in result.to_content()


# Error mapping (plan.md section 12)

MAPPING = [
    (
        "add_cart_item",
        contract_error(404, "MENU_ITEM_NOT_FOUND"),
        "MENU_ITEM_NOT_FOUND",
    ),
    (
        "add_cart_item",
        contract_error(422, "MENU_ITEM_UNAVAILABLE"),
        "MENU_ITEM_UNAVAILABLE",
    ),
    (
        "add_cart_item",
        contract_error(422, "CART_ITEM_QUANTITY_LIMIT_EXCEEDED"),
        "CART_ITEM_QUANTITY_LIMIT_EXCEEDED",
    ),
    ("add_cart_item", contract_error(409, "CART_CONFLICT"), "CART_CONFLICT"),
    (
        "remove_cart_item",
        contract_error(404, "CART_ITEM_NOT_FOUND"),
        "CART_ITEM_NOT_FOUND",
    ),
    (
        "add_cart_item",
        contract_error(400, "INVALID_PAYLOAD"),
        "COMMERCE_REQUEST_REJECTED",
    ),
    (
        "add_cart_item",
        contract_error(400, "UNSUPPORTED_CONTRACT_VERSION"),
        "COMMERCE_REQUEST_REJECTED",
    ),
    (
        "add_cart_item",
        contract_error(413, "PAYLOAD_TOO_LARGE"),
        "COMMERCE_REQUEST_REJECTED",
    ),
    ("get_cart", contract_error(418, "SOMETHING_NEW"), "COMMERCE_REQUEST_REJECTED"),
    ("get_menu", contract_error(404, "ROUTE_NOT_FOUND"), "COMMERCE_UNAVAILABLE"),
    ("get_menu", contract_error(503, "SERVICE_UNAVAILABLE"), "COMMERCE_UNAVAILABLE"),
    ("add_cart_item", contract_error(500, "INTERNAL_ERROR"), "COMMERCE_UNAVAILABLE"),
    ("get_menu", httpx.ConnectError, "COMMERCE_UNAVAILABLE"),
    ("get_cart", httpx.ReadTimeout, "COMMERCE_UNAVAILABLE"),
    ("add_cart_item", httpx.ConnectError, "COMMERCE_UNAVAILABLE"),
    ("add_cart_item", httpx.ReadTimeout, "COMMERCE_OUTCOME_UNKNOWN"),
    ("set_cart_item_quantity", httpx.RemoteProtocolError, "COMMERCE_OUTCOME_UNKNOWN"),
    ("remove_cart_item", httpx.ReadTimeout, "COMMERCE_OUTCOME_UNKNOWN"),
    ("get_menu", httpx.Response(200, content=b"{}"), "COMMERCE_BAD_RESPONSE"),
    ("get_cart", httpx.Response(302), "COMMERCE_BAD_RESPONSE"),
    ("add_cart_item", httpx.Response(400, content=b"<html>"), "COMMERCE_BAD_RESPONSE"),
    (
        "add_cart_item",
        lambda _: httpx.Response(
            200,
            headers={"Content-Encoding": "gzip"},
            stream=httpx.ByteStream(b"not gzip"),
        ),
        "COMMERCE_BAD_RESPONSE",
    ),
]


@pytest.mark.parametrize(("name", "outcome", "code"), MAPPING)
def test_client_failures_map_to_one_code_each(
    name: str, outcome: Any, code: str
) -> None:
    fake, arguments = _scripted(name, outcome)

    error = _error(fake.execute_tool(name, arguments))

    assert error.code == code
    assert error.message == MESSAGES[code]
    assert error.field is None
    assert len(fake.requests) == 1


def test_commerce_message_is_never_passed_to_the_model() -> None:
    fake, arguments = _scripted(
        "add_cart_item", contract_error(422, "MENU_ITEM_UNAVAILABLE", SENTINEL)
    )

    result = fake.execute_tool("add_cart_item", arguments)

    assert SENTINEL not in result.to_content()


def test_every_code_has_a_message() -> None:
    for code, message in MESSAGES.items():
        assert ToolResult.failure(code).error == ToolError(code=code, message=message)


# Bugs are not disguised as commerce outcomes (plan.md section 12)


def _registry_with(handler: Any) -> MappingProxyType[str, ToolDefinition[Any]]:
    definition = ToolDefinition(
        name="probe",
        description="test only",
        category="read",
        input_model=GetMenuInput,
        handler=handler,
    )
    return MappingProxyType({"probe": definition})


def test_an_unexpected_exception_propagates() -> None:
    async def broken(client: CommerceClient, _: GetMenuInput) -> Any:
        raise RuntimeError("a bug")

    with pytest.raises(RuntimeError):
        FakeCommerce().execute_tool("probe", {}, registry=_registry_with(broken))


def test_an_invalid_client_argument_propagates() -> None:
    async def bypasses_validation(client: CommerceClient, _: GetMenuInput) -> Any:
        return await client.remove_cart_item("../x")

    fake = FakeCommerce()

    with pytest.raises(InvalidCommerceArgumentError):
        fake.execute_tool("probe", {}, registry=_registry_with(bypasses_validation))
    assert fake.requests == []


# ToolResult itself (plan.md section 7)


def test_refused_call_result() -> None:
    error = _error(ToolResult.failure(TOOL_CALL_LIMIT_EXCEEDED))

    assert error.message == MESSAGES[TOOL_CALL_LIMIT_EXCEEDED]


@pytest.mark.parametrize(
    "fields",
    [
        {"ok": True},
        {"ok": False},
        {
            "ok": True,
            "data": CartResponse.model_validate(CART),
            "error": ToolError(code="X", message="m"),
        },
        {"ok": False, "data": CartResponse.model_validate(CART)},
    ],
)
def test_result_holds_exactly_one_outcome(fields: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        ToolResult(**fields)


def test_failure_content_omits_empty_fields() -> None:
    content = json.loads(ToolResult.failure("CART_CONFLICT").to_content())

    assert content == {
        "ok": False,
        "error": {"code": "CART_CONFLICT", "message": MESSAGES["CART_CONFLICT"]},
    }
