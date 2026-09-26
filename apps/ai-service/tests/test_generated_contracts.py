"""ai_service/contracts/ is generated, never hand-written (ADR-0003, Phase 14
plan.md OD3).

The drift test regenerates the module in memory from the committed JSON
Schema and compares it with the committed file, the same guard every
contracts package applies to its own schema/*.v1.json (ADR-0012). So a hand
edit, a stale regeneration and a changed contract all fail here.

The fixtures are checked against the committed JSON Schema as well as the
generated models, so both sides agree on what is valid, not just on text.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from pydantic import BaseModel, ValidationError

from ai_service.contracts.api_contracts import (
    AddCartItemRequest,
    CartResponse,
    MenuResponse,
    UpdateCartItemRequest,
)
from scripts.generate_contracts import OUTPUT, SCHEMA_DIR, SCHEMAS, render
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


def test_committed_models_match_the_generator() -> None:
    assert OUTPUT.read_text() == render(), (
        "ai_service/contracts/api_contracts.py is stale or was edited by hand. "
        "Run: uv run python scripts/generate_contracts.py"
    )


def test_every_source_schema_is_committed() -> None:
    for file_name in SCHEMAS.values():
        assert Path(SCHEMA_DIR / file_name).is_file(), file_name


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
