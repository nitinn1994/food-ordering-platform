"""The presentation tool allowlist (Phase 15 plan.md section 6, OD2).

Five tools, one per ``@contracts/ui-commands`` command, declared literally.
Like the Commerce registry: no discovery, no runtime registration, and a
read-only mapping. Nothing is added beyond the existing contract: no
``OpenCheckout`` (a declined candidate) and never ``ShowOrderConfirmation``
(rejected outright: it would show an order that never happened).

A tool's arguments are its command's fields without ``type``, taken from the
generated model, so no constraint is restated here. None of them can express
a URL, route, selector, component, script or price.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, get_args

from pydantic import BaseModel, ConfigDict, create_model

from ai_service.contracts.ui_commands import (
    HighlightItem,
    OpenCartPanel,
    SearchMenu,
    ShowItemDetail,
    ShowMenuCategory,
)

type CommandModel = (
    ShowMenuCategory | HighlightItem | OpenCartPanel | ShowItemDetail | SearchMenu
)
# The same five classes as a tuple, for isinstance checks that narrow to
# CommandModel. tests/test_ui_command_tools.py pins both to the generated
# union, so neither can drift from the contract.
COMMAND_CLASSES = (
    ShowMenuCategory,
    HighlightItem,
    OpenCartPanel,
    ShowItemDetail,
    SearchMenu,
)

# The same rules as the Commerce tool inputs (tools/schemas.py): strict (no
# coercion: "true" is not a boolean), frozen, unknown keys rejected.
_INPUT_CONFIG = ConfigDict(extra="forbid", strict=True, frozen=True)


@dataclass(frozen=True)
class PresentationToolDefinition:
    name: str
    description: str
    # The generated command this tool records.
    command_model: type[CommandModel]
    # The arguments the model sees: command_model's fields minus ``type``.
    input_model: type[BaseModel]

    @property
    def command_type(self) -> str:
        """The command's contract name: the value of its ``type`` literal."""
        (name,) = get_args(self.command_model.model_fields["type"].annotation)
        assert isinstance(name, str)  # noqa: S101 - a generated Literal[str]
        return name


def _input_model(command: type[CommandModel]) -> type[BaseModel]:
    fields: dict[str, Any] = {
        name: (info.annotation, info)
        for name, info in command.model_fields.items()
        if name != "type"
    }
    return create_model(
        f"{command.__name__}Arguments", __config__=_INPUT_CONFIG, **fields
    )


def _definition(
    name: str, description: str, command: type[CommandModel]
) -> PresentationToolDefinition:
    return PresentationToolDefinition(
        name=name,
        description=description,
        command_model=command,
        input_model=_input_model(command),
    )


def build_presentation_registry() -> Mapping[str, PresentationToolDefinition]:
    definitions = (
        _definition(
            "show_menu_category",
            "Show one menu category on screen. categoryId must be a category id "
            "returned by get_menu. Changes nothing but the screen.",
            ShowMenuCategory,
        ),
        _definition(
            "highlight_item",
            "Highlight one menu item on screen. itemId must be an item id "
            "returned by get_menu. Changes nothing but the screen.",
            HighlightItem,
        ),
        _definition(
            "open_cart_panel",
            "Open (open: true) or close (open: false) the cart panel. The panel "
            "always shows the cart as the ordering service has it; opening it "
            "never means a change succeeded.",
            OpenCartPanel,
        ),
        _definition(
            "show_item_detail",
            "Show the detail view of one menu item. itemId must be an item id "
            "returned by get_menu. Changes nothing but the screen.",
            ShowItemDetail,
        ),
        _definition(
            "search_menu",
            "Filter the menu on screen by a search phrase of up to 200 "
            "characters. An empty query clears the search.",
            SearchMenu,
        ),
    )
    return MappingProxyType({d.name: d for d in definitions})


def presentation_tool_schemas(
    registry: Mapping[str, PresentationToolDefinition],
) -> list[dict[str, Any]]:
    """The registry in the same function format as the Commerce tools
    (tools/registry.py ``tool_schemas``), so the model is bound to both
    lists the same way."""
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
