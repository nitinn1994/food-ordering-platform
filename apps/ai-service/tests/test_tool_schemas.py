"""Tool input models (Phase 14 plan.md section 6; AC11).

Strict, frozen, unknown keys rejected, and carrying the contract's own
constraints, checked here against the committed JSON Schema.
"""

import json
from typing import Any

import pytest
from pydantic import ValidationError

from ai_service.tools.schemas import (
    AddCartItemInput,
    GetCartInput,
    GetMenuInput,
    RemoveCartItemInput,
    SetCartItemQuantityInput,
    ToolInput,
)
from scripts.generate_contracts import SCHEMA_DIR

ITEM_AND_QUANTITY: list[type[ToolInput]] = [AddCartItemInput, SetCartItemQuantityInput]
TAKES_ITEM: list[type[ToolInput]] = [
    AddCartItemInput,
    SetCartItemQuantityInput,
    RemoveCartItemInput,
]
NO_ARGUMENTS: list[type[ToolInput]] = [GetMenuInput, GetCartInput]


def _contract_property(name: str) -> dict[str, Any]:
    schema = json.loads((SCHEMA_DIR / "cart-add-item-request.v1.json").read_text())
    prop: dict[str, Any] = schema["properties"][name]
    return prop


def _valid(model: type[ToolInput]) -> dict[str, Any]:
    fields = set(model.model_fields)
    return (
        {"itemId": "tiramisu", "quantity": 2}
        if "quantity" in fields
        else ({"itemId": "tiramisu"} if fields else {})
    )


@pytest.mark.parametrize("model", NO_ARGUMENTS + TAKES_ITEM, ids=lambda m: m.__name__)
def test_valid_arguments_are_accepted(model: type[ToolInput]) -> None:
    model.model_validate(_valid(model))


@pytest.mark.parametrize("model", NO_ARGUMENTS, ids=lambda m: m.__name__)
@pytest.mark.parametrize(
    "arguments",
    [{"x": 1}, {"url": "http://evil"}, {"method": "DELETE"}, {"itemId": "tiramisu"}],
)
def test_no_argument_tools_reject_any_argument(
    model: type[ToolInput], arguments: dict[str, Any]
) -> None:
    with pytest.raises(ValidationError):
        model.model_validate(arguments)


@pytest.mark.parametrize("model", TAKES_ITEM, ids=lambda m: m.__name__)
@pytest.mark.parametrize(
    "extra",
    [
        {"url": "http://evil.test"},
        {"endpoint": "/v1/orders"},
        {"method": "POST"},
        {"headers": {"Authorization": "x"}},
        {"priceCents": 1},
        {"cartId": "c1"},
        {"ownerId": "o1"},
        {"sql": "DROP TABLE carts"},
    ],
)
def test_unknown_keys_are_rejected(
    model: type[ToolInput], extra: dict[str, Any]
) -> None:
    with pytest.raises(ValidationError):
        model.model_validate({**_valid(model), **extra})


@pytest.mark.parametrize("model", TAKES_ITEM, ids=lambda m: m.__name__)
@pytest.mark.parametrize(
    "item_id", ["", "A", "Tiramisu", "../x", "a/b", "%2e", "a b", "a-", "a" * 65, 7]
)
def test_invalid_item_id_is_rejected(model: type[ToolInput], item_id: Any) -> None:
    with pytest.raises(ValidationError):
        model.model_validate({**_valid(model), "itemId": item_id})


@pytest.mark.parametrize("model", ITEM_AND_QUANTITY, ids=lambda m: m.__name__)
@pytest.mark.parametrize("quantity", [0, -1, 100, "2", 2.0, 2.5, True, None])
def test_invalid_quantity_is_rejected(model: type[ToolInput], quantity: Any) -> None:
    with pytest.raises(ValidationError):
        model.model_validate({"itemId": "tiramisu", "quantity": quantity})


@pytest.mark.parametrize("model", TAKES_ITEM, ids=lambda m: m.__name__)
def test_missing_arguments_are_rejected(model: type[ToolInput]) -> None:
    with pytest.raises(ValidationError):
        model.model_validate({})


@pytest.mark.parametrize("model", TAKES_ITEM, ids=lambda m: m.__name__)
def test_item_id_constraints_are_the_contracts(model: type[ToolInput]) -> None:
    schema = model.model_json_schema()["properties"]["itemId"]
    contract = _contract_property("itemId")

    for key in ("minLength", "maxLength", "pattern", "type"):
        assert schema[key] == contract[key], key


@pytest.mark.parametrize("model", ITEM_AND_QUANTITY, ids=lambda m: m.__name__)
def test_quantity_constraints_are_the_contracts(model: type[ToolInput]) -> None:
    schema = model.model_json_schema()["properties"]["quantity"]
    contract = _contract_property("quantity")

    for key in ("minimum", "maximum", "type"):
        assert schema[key] == contract[key], key


def test_inputs_are_frozen() -> None:
    args = AddCartItemInput.model_validate({"itemId": "tiramisu", "quantity": 1})

    with pytest.raises(ValidationError):
        args.quantity = 5  # type: ignore[misc]
