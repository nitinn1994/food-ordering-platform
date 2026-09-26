"""Write tool -> business intent (Phase 15 plan.md section 12, OD5).

A write tool call is a business intent: ``@contracts/agent-intents`` names
the three operations this service may ask commerce-api to perform, and each
write tool performs exactly one of them. The map below is fixed and literal.
The model can pick a tool from the allowlist, but it can never name an
intent, and nothing turns a string into an operation.

``ToolService`` validates a write call's arguments as the tool's own input
model, then as this generated intent (strict, unknown keys rejected), and
hands the intent to the handler. The constraints are the contract's, so a
call the tool accepts is a call the intent accepts. The second check guards
against the two drifting, and it makes "every write is a contract intent" a
property of the code, not of a comment. commerce-api stays the final
authority: nothing here checks availability, quantities or prices.

Reads (``get_menu``, ``get_cart``) are not intents: they change nothing.
Declined intents (``PlaceOrder``, ``ClearCart``) have no tool and no entry
here (docs/api/contracts.md section 7).
"""

from collections.abc import Mapping
from types import MappingProxyType
from typing import get_args

from pydantic import BaseModel

from ai_service.contracts.agent_intents import (
    AddItemToCart,
    RemoveItemFromCart,
    SetCartItemQuantity,
)

type IntentModel = AddItemToCart | RemoveItemFromCart | SetCartItemQuantity

TOOL_INTENTS: Mapping[str, type[IntentModel]] = MappingProxyType(
    {
        "add_cart_item": AddItemToCart,
        "set_cart_item_quantity": SetCartItemQuantity,
        "remove_cart_item": RemoveItemFromCart,
    }
)


def intent_name(model: type[IntentModel]) -> str:
    """The intent's contract name: the value of its ``type`` literal."""
    (name,) = get_args(model.model_fields["type"].annotation)
    assert isinstance(name, str)  # noqa: S101 - a generated Literal[str]
    return name


def build_intent(model: type[IntentModel], arguments: BaseModel) -> IntentModel:
    """Validate already-validated tool arguments as ``model``. Raises
    ``pydantic.ValidationError``, which the caller treats like any invalid
    argument."""
    return model.model_validate(
        {"type": intent_name(model), **arguments.model_dump()}, strict=True
    )
