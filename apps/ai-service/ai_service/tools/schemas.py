"""Tool input models (Phase 14 plan.md section 6, OD10).

Strict (no string-to-int coercion), frozen, unknown keys rejected. Field
names follow the contracts (``itemId``), so nothing is renamed between a
tool call and the HTTP body. The constraints are the generated contract
model's own (``AddCartItemRequest``), reused, never restated: an item id is
1-64 characters of lowercase slug, a quantity an integer from 1 to 99.

Nothing here can express a URL, route, HTTP method, header, cart or owner
id, or price. That is the point.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from ai_service.contracts.api_contracts import AddCartItemRequest

_CONTRACT_FIELDS = AddCartItemRequest.model_fields

ItemId = Annotated[
    str,
    *_CONTRACT_FIELDS["itemId"].metadata,
    Field(description="A menu item id exactly as returned by get_menu."),
]
Quantity = Annotated[
    int,
    *_CONTRACT_FIELDS["quantity"].metadata,
    Field(description="How many, from 1 to 99."),
]


class ToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class GetMenuInput(ToolInput):
    pass


class GetCartInput(ToolInput):
    pass


class AddCartItemInput(ToolInput):
    itemId: ItemId
    quantity: Quantity


class SetCartItemQuantityInput(ToolInput):
    itemId: ItemId
    quantity: Quantity


class RemoveCartItemInput(ToolInput):
    itemId: ItemId
