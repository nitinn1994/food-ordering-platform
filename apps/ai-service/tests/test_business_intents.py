"""Write tool <-> business intent (Phase 15 plan.md section 12, OD5; AC9).

Every write tool performs exactly one ``@contracts/agent-intents`` intent and
every intent has exactly one write tool. A write's arguments reach its
handler only as that validated intent, and each intent reaches exactly its
commerce-api route.
"""

import json
import logging
from pathlib import Path
from typing import Any, get_args

import pytest

from ai_service.contracts.agent_intents import AgentIntent
from ai_service.tools.intents import TOOL_INTENTS, build_intent, intent_name
from ai_service.tools.registry import build_tool_registry
from scripts.generate_contracts import AGENT_INTENTS_SCHEMA_DIR
from tests.commerce_fakes import CART, FakeCommerce, json_response

# Tool -> (arguments, the intent it becomes, the route it must reach).
WRITES: dict[str, tuple[dict[str, Any], dict[str, Any], tuple[str, str]]] = {
    "add_cart_item": (
        {"itemId": "tiramisu", "quantity": 2},
        {"type": "AddItemToCart", "itemId": "tiramisu", "quantity": 2},
        ("POST", "/v1/cart/items"),
    ),
    "set_cart_item_quantity": (
        {"itemId": "tiramisu", "quantity": 5},
        {"type": "SetCartItemQuantity", "itemId": "tiramisu", "quantity": 5},
        ("PATCH", "/v1/cart/items/tiramisu"),
    ),
    "remove_cart_item": (
        {"itemId": "tiramisu"},
        {"type": "RemoveItemFromCart", "itemId": "tiramisu"},
        ("DELETE", "/v1/cart/items/tiramisu"),
    ),
}


def _contract_intent_types() -> set[str]:
    envelope = json.loads(
        Path(AGENT_INTENTS_SCHEMA_DIR / "agent-intent.v1.json").read_text()
    )
    return {
        b["properties"]["type"]["const"]
        for b in envelope["properties"]["intent"]["oneOf"]
    }


def test_every_write_tool_has_exactly_one_intent_and_back() -> None:
    registry = build_tool_registry()
    writes = {name for name, d in registry.items() if d.category == "write"}

    assert set(TOOL_INTENTS) == writes
    assert {registry[name].intent for name in writes} == set(TOOL_INTENTS.values())
    # Bijective: no two tools share an intent.
    assert len(set(TOOL_INTENTS.values())) == len(TOOL_INTENTS)


def test_the_intents_are_exactly_the_contract_union() -> None:
    generated = set(get_args(AgentIntent.model_fields["root"].annotation))
    names = {intent_name(model) for model in TOOL_INTENTS.values()}

    assert set(TOOL_INTENTS.values()) == generated
    assert names == _contract_intent_types()
    assert names.isdisjoint({"PlaceOrder", "ClearCart"})


def test_reads_perform_no_intent() -> None:
    registry = build_tool_registry()

    reads = [d for d in registry.values() if d.category == "read"]

    assert {d.name for d in reads} == {"get_menu", "get_cart"}
    assert all(d.intent is None for d in reads)


@pytest.mark.parametrize("name", list(TOOL_INTENTS))
def test_tool_arguments_are_the_intent_fields_without_type(name: str) -> None:
    definition = build_tool_registry()[name]
    assert definition.intent is not None

    intent_fields = set(definition.intent.model_fields) - {"type"}

    assert set(definition.input_model.model_fields) == intent_fields


@pytest.mark.parametrize("name", list(WRITES))
def test_build_intent_turns_arguments_into_the_intent(name: str) -> None:
    definition = build_tool_registry()[name]
    assert definition.intent is not None
    arguments, expected, _ = WRITES[name]

    intent = build_intent(definition.intent, definition.input_model(**arguments))

    assert intent.model_dump() == expected


@pytest.mark.parametrize("name", list(WRITES))
def test_each_intent_reaches_exactly_its_route(name: str) -> None:
    arguments, _, route = WRITES[name]
    fake = FakeCommerce().on(*route, json_response(200, CART))

    result = fake.execute_tool(name, arguments)

    assert result.ok
    assert [(r.method, r.url.path) for r in fake.requests] == [route]


def test_a_write_handler_receives_the_intent_not_the_raw_arguments() -> None:
    fake = FakeCommerce().on("POST", "/v1/cart/items", json_response(200, CART))

    fake.execute_tool("add_cart_item", {"itemId": "tiramisu", "quantity": 2})

    # The body is the intent's payload: exactly the contract fields, no type.
    assert fake.request_json() == {"itemId": "tiramisu", "quantity": 2}


@pytest.mark.parametrize(
    "arguments",
    [
        {"itemId": "tiramisu", "quantity": 0},
        {"itemId": "tiramisu", "quantity": "2"},
        {"itemId": "../x", "quantity": 1},
        {"itemId": "tiramisu", "quantity": 1, "type": "PlaceOrder"},
    ],
)
def test_an_invalid_intent_never_reaches_commerce_api(
    arguments: dict[str, Any],
) -> None:
    fake = FakeCommerce()

    result = fake.execute_tool("add_cart_item", arguments)

    assert not result.ok
    assert fake.requests == []


def test_the_tool_log_names_the_intent(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    fake = FakeCommerce().on("POST", "/v1/cart/items", json_response(200, CART))

    fake.execute_tool("add_cart_item", {"itemId": "tiramisu", "quantity": 1})

    [record] = [r for r in caplog.records if r.name == "ai_service.tools"]
    assert record.fields["intent"] == "AddItemToCart"  # type: ignore[attr-defined]
    assert record.fields["category"] == "write"  # type: ignore[attr-defined]
