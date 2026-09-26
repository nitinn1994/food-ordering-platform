"""ai_service/contracts/ is generated, never hand-written (ADR-0003, Phase 14
plan.md OD3; Phase 15 plan.md section 9 adds ui_commands and agent_intents).

The drift test regenerates each module in memory from the committed JSON
Schema and compares it with the committed file, the same guard every
contracts package applies to its own schema/*.v1.json (ADR-0012). So a hand
edit, a stale regeneration and a changed contract all fail here.

The fixtures are checked against the committed JSON Schema as well as the
generated models, so both sides agree on what is valid, not just on text.
"""

import json
from pathlib import Path
from typing import Any, get_args

import pytest
from jsonschema import Draft202012Validator
from pydantic import BaseModel, ValidationError

from ai_service.contracts.agent_intents import AgentIntent
from ai_service.contracts.api_contracts import (
    AddCartItemRequest,
    CartResponse,
    MenuResponse,
    UpdateCartItemRequest,
)
from ai_service.contracts.ui_commands import (
    AgentTurnRequest,
    AgentTurnResponse,
    UiCommand,
)
from scripts.generate_contracts import SCHEMA_DIR, SCHEMAS, TARGETS, render
from tests.commerce_fakes import CART, CART_LINE, MENU, MENU_ITEM

# Generated class -> (a valid instance, its committed schema file).
VALID: dict[type[BaseModel], tuple[dict[str, Any], str]] = {
    MenuResponse: (MENU, SCHEMAS["MenuResponse"]),
    CartResponse: (CART, SCHEMAS["CartResponse"]),
    AddCartItemRequest: (
        {"itemId": "tiramisu", "quantity": 1},
        SCHEMAS["AddCartItemRequest"],
    ),
    UpdateCartItemRequest: ({"quantity": 99}, SCHEMAS["UpdateCartItemRequest"]),
}


def _schema(file_name: str) -> dict[str, Any]:
    schema: dict[str, Any] = json.loads((SCHEMA_DIR / file_name).read_text())
    return schema


def _with(base: dict[str, Any], **changes: Any) -> dict[str, Any]:
    return {**base, **changes}


@pytest.mark.parametrize("name", list(TARGETS))
def test_committed_models_match_the_generator(name: str) -> None:
    target = TARGETS[name]
    assert target.output.read_text() == render(target), (
        f"ai_service/contracts/{target.output.name} is stale or was edited by "
        "hand. Run: uv run python scripts/generate_contracts.py"
    )


@pytest.mark.parametrize("name", list(TARGETS))
def test_every_source_schema_is_committed(name: str) -> None:
    for source in TARGETS[name].sources:
        assert Path(source).is_file(), source


@pytest.mark.parametrize("model", list(VALID), ids=lambda m: m.__name__)
def test_valid_instance_is_accepted_by_both(model: type[BaseModel]) -> None:
    instance, file_name = VALID[model]

    Draft202012Validator(_schema(file_name)).validate(instance)
    model.model_validate(instance)


INVALID = [
    pytest.param(MenuResponse, _with(MENU, extra=1), id="menu-unknown-key"),
    pytest.param(
        MenuResponse,
        {"categories": [{"id": "d", "name": "D", "items": [_with(MENU_ITEM, x=1)]}]},
        id="menu-item-unknown-key",
    ),
    pytest.param(
        MenuResponse,
        {"categories": [{"id": "Bad_Id", "name": "D", "items": []}]},
        id="menu-category-bad-id",
    ),
    pytest.param(CartResponse, _with(CART, ownerId="x"), id="cart-unknown-key"),
    pytest.param(
        CartResponse,
        _with(CART, items=[_with(CART_LINE, quantity=0)]),
        id="cart-line-quantity-0",
    ),
    pytest.param(
        CartResponse, _with(CART, subtotalCents=-1), id="cart-negative-subtotal"
    ),
    pytest.param(
        AddCartItemRequest,
        {"itemId": "tiramisu", "quantity": 1, "priceCents": 1},
        id="add-with-price",
    ),
    pytest.param(
        AddCartItemRequest, {"itemId": "../x", "quantity": 1}, id="add-path-like-id"
    ),
    pytest.param(
        AddCartItemRequest, {"itemId": "tiramisu", "quantity": 100}, id="add-100"
    ),
    pytest.param(UpdateCartItemRequest, {"quantity": 0}, id="update-0"),
]


@pytest.mark.parametrize(("model", "instance"), INVALID)
def test_invalid_instance_is_rejected_by_both(
    model: type[BaseModel], instance: dict[str, Any]
) -> None:
    _, file_name = VALID[model]

    assert not Draft202012Validator(_schema(file_name)).is_valid(instance)
    with pytest.raises(ValidationError):
        model.model_validate(instance)


# --- Phase 15: the agent turn, its UI commands, and the business intents ---
#
# The unions are generated from JSON Schema oneOf, which carries no
# discriminator keyword, so the generator emits a plain union, not a tagged
# one (the ADR-0012 open question). Each branch has a Literal ``type`` and
# forbids extra keys, so at most one branch can match. These tests prove it
# rather than assume it (Phase 15 plan.md assumption A1).

UI_SCHEMA_DIR = TARGETS["ui_commands"].sources[0].parent
INTENT_SCHEMA_FILE = TARGETS["agent_intents"].sources[0]

TURN_META = {
    "contractVersion": 1,
    "correlationId": "turn_7f3a",
    "issuedAt": "2026-09-26T12:00:00.000Z",
}

VALID_COMMANDS: list[dict[str, Any]] = [
    {"type": "ShowMenuCategory", "categoryId": "desserts"},
    {"type": "HighlightItem", "itemId": "tiramisu"},
    {"type": "OpenCartPanel", "open": True},
    {"type": "ShowItemDetail", "itemId": "garlic-bread"},
    {"type": "SearchMenu", "query": ""},
]

INVALID_COMMANDS: list[Any] = [
    pytest.param({"type": "DeleteAllOrders", "itemId": "x"}, id="unknown-type"),
    pytest.param({"execute": "someJavaScript(...)"}, id="execute-only"),
    pytest.param(
        {"type": "OpenCartPanel", "open": True, "execute": "alert(1)"},
        id="extra-key",
    ),
    pytest.param(
        {"type": "HighlightItem", "categoryId": "desserts"}, id="other-branch-field"
    ),
    pytest.param({"type": "ShowMenuCategory"}, id="missing-field"),
    pytest.param({"type": "HighlightItem", "itemId": "../admin"}, id="path-like-id"),
    pytest.param(
        {"type": "ShowItemDetail", "itemId": "https://evil.test"}, id="url-as-id"
    ),
    pytest.param({"type": "SearchMenu", "query": "x" * 201}, id="query-too-long"),
]

VALID_INTENTS: list[dict[str, Any]] = [
    {"type": "AddItemToCart", "itemId": "tiramisu", "quantity": 1},
    {"type": "SetCartItemQuantity", "itemId": "tiramisu", "quantity": 99},
    {"type": "RemoveItemFromCart", "itemId": "tiramisu"},
]

INVALID_INTENTS: list[Any] = [
    pytest.param({"type": "PlaceOrder"}, id="declined-intent"),
    pytest.param({"type": "ClearCart"}, id="declined-clear-cart"),
    pytest.param(
        {"type": "AddItemToCart", "itemId": "tiramisu", "quantity": 0}, id="add-0"
    ),
    pytest.param(
        {"type": "AddItemToCart", "itemId": "tiramisu", "quantity": 1, "price": 1},
        id="extra-key",
    ),
    pytest.param(
        {"type": "RemoveItemFromCart", "itemId": "tiramisu", "quantity": 1},
        id="other-branch-field",
    ),
]


def _command_schema() -> dict[str, Any]:
    response = _schema_at(UI_SCHEMA_DIR / "agent-turn-response.v1.json")
    batch: dict[str, Any] = response["properties"]["uiCommands"]
    command: dict[str, Any] = batch["properties"]["commands"]["items"]
    return command


def _intent_schema() -> dict[str, Any]:
    intent: dict[str, Any] = _schema_at(INTENT_SCHEMA_FILE)["properties"]["intent"]
    return intent


def _schema_at(path: Path) -> dict[str, Any]:
    schema: dict[str, Any] = json.loads(path.read_text())
    return schema


@pytest.mark.parametrize("command", VALID_COMMANDS, ids=lambda c: c["type"])
def test_each_ui_command_is_accepted_as_its_own_branch(
    command: dict[str, Any],
) -> None:
    Draft202012Validator(_command_schema()).validate(command)
    parsed = UiCommand.model_validate(command).root

    assert type(parsed).__name__ == command["type"]
    assert parsed.model_dump() == command


@pytest.mark.parametrize("command", INVALID_COMMANDS)
def test_invalid_ui_command_is_rejected_by_both(command: Any) -> None:
    assert not Draft202012Validator(_command_schema()).is_valid(command)
    with pytest.raises(ValidationError):
        UiCommand.model_validate(command)


def test_generated_ui_command_types_are_exactly_the_contract_allowlist() -> None:
    contract = {b["properties"]["type"]["const"] for b in _command_schema()["oneOf"]}
    generated = {
        branch.__name__
        for branch in get_args(UiCommand.model_fields["root"].annotation)
    }

    assert contract == generated == {c["type"] for c in VALID_COMMANDS}


def test_generated_models_coerce_unless_validated_strictly() -> None:
    """Generated models are lax, like Pydantic's default: "true" becomes
    True. The presentation tools validate with strict=True (Phase 15 plan.md
    section 9), the same no-coercion rule the Phase 14 tool inputs apply."""
    lax = {"type": "OpenCartPanel", "open": "true"}

    UiCommand.model_validate(lax)
    with pytest.raises(ValidationError):
        UiCommand.model_validate(lax, strict=True)


@pytest.mark.parametrize("intent", VALID_INTENTS, ids=lambda i: i["type"])
def test_each_intent_is_accepted_as_its_own_branch(intent: dict[str, Any]) -> None:
    Draft202012Validator(_intent_schema()).validate(intent)
    parsed = AgentIntent.model_validate(intent).root

    assert type(parsed).__name__ == intent["type"]
    assert parsed.model_dump() == intent


@pytest.mark.parametrize("intent", INVALID_INTENTS)
def test_invalid_intent_is_rejected_by_both(intent: Any) -> None:
    assert not Draft202012Validator(_intent_schema()).is_valid(intent)
    with pytest.raises(ValidationError):
        AgentIntent.model_validate(intent)


def test_valid_turn_response_is_accepted_by_both() -> None:
    body = {
        "reply": "Here's your cart.",
        "uiCommands": {**TURN_META, "commands": VALID_COMMANDS},
    }

    Draft202012Validator(
        _schema_at(UI_SCHEMA_DIR / "agent-turn-response.v1.json")
    ).validate(body)
    parsed = AgentTurnResponse.model_validate(body)

    assert parsed.model_dump(exclude_none=True) == body


def test_turn_response_without_commands_serializes_without_the_key() -> None:
    assert AgentTurnResponse(reply="Hi").model_dump(exclude_none=True) == {
        "reply": "Hi"
    }


INVALID_TURN_RESPONSES: list[Any] = [
    pytest.param({"reply": "Hi", "execute": "x"}, id="unknown-key"),
    pytest.param({"reply": ""}, id="empty-reply"),
    pytest.param({"reply": "x" * 4001}, id="reply-too-long"),
    pytest.param(
        {"reply": "Hi", "uiCommands": {**TURN_META, "commands": []}},
        id="empty-batch",
    ),
    pytest.param(
        {
            "reply": "Hi",
            "uiCommands": {**TURN_META, "commands": VALID_COMMANDS * 3},
        },
        id="over-the-batch-cap",
    ),
    pytest.param(
        {
            "reply": "Hi",
            "uiCommands": {
                **TURN_META,
                "contractVersion": 2,
                "commands": VALID_COMMANDS[:1],
            },
        },
        id="unsupported-contract-version",
    ),
    pytest.param(
        {
            "reply": "Hi",
            "uiCommands": {
                **TURN_META,
                "issuedAt": "2026-09-26T12:00:00+00:00",
                "commands": VALID_COMMANDS[:1],
            },
        },
        id="issued-at-not-z",
    ),
]


@pytest.mark.parametrize("body", INVALID_TURN_RESPONSES)
def test_invalid_turn_response_is_rejected_by_both(body: Any) -> None:
    schema = _schema_at(UI_SCHEMA_DIR / "agent-turn-response.v1.json")

    assert not Draft202012Validator(schema).is_valid(body)
    with pytest.raises(ValidationError):
        AgentTurnResponse.model_validate(body)


@pytest.mark.parametrize(
    ("body", "valid"),
    [
        ({"message": "Hello"}, True),
        ({"message": "x" * 2000}, True),
        ({"message": ""}, False),
        ({"message": " \n\t"}, False),
        ({"message": "x" * 2001}, False),
        ({"message": "Hello", "execute": "x"}, False),
    ],
)
def test_turn_request_agrees_with_its_schema(body: dict[str, Any], valid: bool) -> None:
    schema = _schema_at(UI_SCHEMA_DIR / "agent-turn-request.v1.json")

    assert Draft202012Validator(schema).is_valid(body) is valid
    if valid:
        AgentTurnRequest.model_validate(body)
    else:
        with pytest.raises(ValidationError):
            AgentTurnRequest.model_validate(body)
