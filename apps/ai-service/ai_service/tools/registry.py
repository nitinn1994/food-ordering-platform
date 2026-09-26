"""The tool allowlist (Phase 14 plan.md sections 4, 5, 18 and 19; OD1).

Five tools, declared literally below. There is no discovery, no decorator
registration, no plugin loading and no way to add a tool at runtime:
``build_tool_registry`` returns a read-only mapping, and ``ToolService``
resolves a model's tool name only against it. The schemas the model is shown
(``tool_schemas``) are built from the same mapping, so what the model is told
exists and what can run are one list.

Excluded on purpose (plan.md section 4): ``create_order`` and ``get_order``
(deferred), ``clear_cart``, ``get_categories`` and ``get_orders`` (no
commerce-api route), ``get_menu_item`` (``get_menu`` already covers it).

Phase 15 (plan.md section 12): each write tool carries the business intent it
performs (``tools/intents.py``), and its handler receives that validated
intent, not the raw arguments. The presentation tools that emit UI commands
live in a separate registry (``ai_service/ui_commands/``) and never here.
"""

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Literal

from pydantic import BaseModel

from ai_service.clients.commerce import CommerceClient
from ai_service.contracts.agent_intents import (
    AddItemToCart,
    RemoveItemFromCart,
    SetCartItemQuantity,
)
from ai_service.tools.intents import TOOL_INTENTS, IntentModel
from ai_service.tools.results import ToolData
from ai_service.tools.schemas import (
    AddCartItemInput,
    GetCartInput,
    GetMenuInput,
    RemoveCartItemInput,
    SetCartItemQuantityInput,
    ToolInput,
)

Category = Literal["read", "write"]


@dataclass(frozen=True)
class ToolDefinition[ArgT: BaseModel]:
    """``ArgT`` is what the handler receives: the validated input model for a
    read, the validated business intent for a write."""

    name: str
    description: str
    # read: runs whenever relevant. write: changes the cart; never retried.
    category: Category
    # The arguments the model sees and is validated against.
    input_model: type[ToolInput]
    # One Commerce API client call and nothing else.
    handler: Callable[[CommerceClient, ArgT], Awaitable[ToolData]]
    # Writes only: the business intent this tool performs (tools/intents.py).
    intent: type[IntentModel] | None = None


async def _get_menu(client: CommerceClient, _: GetMenuInput) -> ToolData:
    return await client.get_menu()


async def _get_cart(client: CommerceClient, _: GetCartInput) -> ToolData:
    return await client.get_cart()


async def _add_cart_item(client: CommerceClient, intent: AddItemToCart) -> ToolData:
    return await client.add_cart_item(intent.itemId, intent.quantity)


async def _set_cart_item_quantity(
    client: CommerceClient, intent: SetCartItemQuantity
) -> ToolData:
    return await client.set_cart_item_quantity(intent.itemId, intent.quantity)


async def _remove_cart_item(
    client: CommerceClient, intent: RemoveItemFromCart
) -> ToolData:
    return await client.remove_cart_item(intent.itemId)


def build_tool_registry() -> Mapping[str, ToolDefinition[Any]]:
    definitions: tuple[ToolDefinition[Any], ...] = (
        ToolDefinition(
            name="get_menu",
            description=(
                "Read the whole menu: categories and items with their ids, names, "
                "descriptions, prices in cents, availability, dietary tags and "
                "allergens. Use it to find item ids; never guess one."
            ),
            category="read",
            input_model=GetMenuInput,
            handler=_get_menu,
        ),
        ToolDefinition(
            name="get_cart",
            description=(
                "Read the customer's current cart: its lines, quantities, prices "
                "in cents and subtotal."
            ),
            category="read",
            input_model=GetCartInput,
            handler=_get_cart,
        ),
        ToolDefinition(
            name="add_cart_item",
            description=(
                "Add a quantity of a menu item to the cart. If the item is already "
                "in the cart, the quantity is added to its existing line. Returns "
                "the updated cart."
            ),
            category="write",
            input_model=AddCartItemInput,
            handler=_add_cart_item,
            intent=TOOL_INTENTS["add_cart_item"],
        ),
        ToolDefinition(
            name="set_cart_item_quantity",
            description=(
                "Set an item that is already in the cart to an exact quantity. It "
                "replaces the quantity rather than adding to it. To remove an "
                "item, use remove_cart_item. Returns the updated cart."
            ),
            category="write",
            input_model=SetCartItemQuantityInput,
            handler=_set_cart_item_quantity,
            intent=TOOL_INTENTS["set_cart_item_quantity"],
        ),
        ToolDefinition(
            name="remove_cart_item",
            description=(
                "Remove an item's line from the cart entirely. Returns the updated "
                "cart."
            ),
            category="write",
            input_model=RemoveCartItemInput,
            handler=_remove_cart_item,
            intent=TOOL_INTENTS["remove_cart_item"],
        ),
    )
    return MappingProxyType({d.name: d for d in definitions})


def tool_schemas(registry: Mapping[str, ToolDefinition[Any]]) -> list[dict[str, Any]]:
    """The registry as the tool definitions a chat model is bound to: plain
    JSON-schema dicts in the widely used function format, so no LangChain
    tool class is needed (plan.md OD4)."""
    return [
        {
            "type": "function",
            "function": {
                "name": definition.name,
                "description": definition.description,
                "parameters": definition.input_model.model_json_schema(),
            },
        }
        for definition in registry.values()
    ]
