"""The tool allowlist (Phase 14 plan.md sections 4, 5 and 18; AC10).

The set of tools is pinned: adding, renaming or recategorising one is a
reviewed change to this file.
"""

from typing import Any

import pytest

from ai_service.clients.commerce import CommerceClient
from ai_service.tools.registry import build_tool_registry, tool_schemas
from ai_service.tools.service import ToolService
from tests.commerce_fakes import FakeCommerce

EXPECTED_CATEGORIES = {
    "get_menu": "read",
    "get_cart": "read",
    "add_cart_item": "write",
    "set_cart_item_quantity": "write",
    "remove_cart_item": "write",
}


def test_registry_holds_exactly_the_approved_tools() -> None:
    registry = build_tool_registry()

    assert {name: d.category for name, d in registry.items()} == EXPECTED_CATEGORIES
    assert all(name == d.name for name, d in registry.items())


def test_registry_cannot_be_changed() -> None:
    registry: Any = build_tool_registry()

    with pytest.raises(TypeError):
        registry["http_get"] = registry["get_menu"]
    with pytest.raises(TypeError):
        del registry["get_menu"]


def test_definitions_are_frozen() -> None:
    definition: Any = build_tool_registry()["get_menu"]

    with pytest.raises(AttributeError):
        definition.name = "anything"


def test_bound_schemas_are_the_registry() -> None:
    schemas = tool_schemas(build_tool_registry())

    assert [s["function"]["name"] for s in schemas] == list(EXPECTED_CATEGORIES)
    assert all(s["type"] == "function" for s in schemas)
    assert all(s["function"]["description"].strip() for s in schemas)


@pytest.mark.parametrize("schema", tool_schemas(build_tool_registry()))
def test_no_schema_accepts_extra_or_transport_parameters(
    schema: dict[str, Any],
) -> None:
    parameters = schema["function"]["parameters"]

    assert parameters["type"] == "object"
    assert parameters["additionalProperties"] is False
    assert set(parameters.get("properties", {})) <= {"itemId", "quantity"}


def test_service_binds_what_it_executes() -> None:
    fake = FakeCommerce()
    registry = build_tool_registry()

    service = ToolService(CommerceClient(fake.http_client()), registry)

    assert service.tool_schemas() == tool_schemas(registry)


def test_set_quantity_description_states_absolute_semantics() -> None:
    description = build_tool_registry()["set_cart_item_quantity"].description

    assert "replaces" in description
    assert "remove_cart_item" in description
