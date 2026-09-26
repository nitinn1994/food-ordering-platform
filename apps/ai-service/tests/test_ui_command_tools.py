"""Presentation tools (Phase 15 plan.md sections 6, 8, 9 and 18; AC7, AC8).

The second allowlist: one tool per ``@contracts/ui-commands`` command,
validated strictly, recording a command and nothing else. No I/O, so no
fake is needed.
"""

import json
import logging
from pathlib import Path
from typing import Any, get_args

import pytest

from ai_service.contracts.ui_commands import UiCommand
from ai_service.tools.registry import build_tool_registry
from ai_service.tools.results import (
    INVALID_TOOL_ARGUMENTS,
    TOOL_CALL_LIMIT_EXCEEDED,
    UNKNOWN_TOOL,
)
from ai_service.ui_commands import (
    PresentationResult,
    PresentationToolService,
    build_batch,
    build_presentation_registry,
)
from ai_service.ui_commands.registry import COMMAND_CLASSES, CommandModel
from ai_service.ui_commands.service import UNREGISTERED_TOOL
from scripts.generate_contracts import UI_COMMANDS_SCHEMA_DIR

SENTINEL = "sentinel-ui-7c1e"  # a valid slug, so a valid call can carry it

VALID_CALLS: list[tuple[str, dict[str, Any], dict[str, Any]]] = [
    (
        "show_menu_category",
        {"categoryId": "desserts"},
        {"type": "ShowMenuCategory", "categoryId": "desserts"},
    ),
    (
        "highlight_item",
        {"itemId": "tiramisu"},
        {"type": "HighlightItem", "itemId": "tiramisu"},
    ),
    ("open_cart_panel", {"open": True}, {"type": "OpenCartPanel", "open": True}),
    ("open_cart_panel", {"open": False}, {"type": "OpenCartPanel", "open": False}),
    (
        "show_item_detail",
        {"itemId": "garlic-bread"},
        {"type": "ShowItemDetail", "itemId": "garlic-bread"},
    ),
    ("search_menu", {"query": "soup"}, {"type": "SearchMenu", "query": "soup"}),
    ("search_menu", {"query": ""}, {"type": "SearchMenu", "query": ""}),
]

INVALID_CALLS: list[Any] = [
    pytest.param(
        "open_cart_panel", {"open": True, "execute": "alert(1)"}, None, id="extra-key"
    ),
    pytest.param("open_cart_panel", {"open": "true"}, "open", id="string-bool"),
    pytest.param("open_cart_panel", {}, "open", id="missing"),
    pytest.param(
        "show_menu_category", {"categoryId": "../admin"}, "categoryId", id="path-id"
    ),
    pytest.param(
        "show_item_detail", {"itemId": "https://evil.test"}, "itemId", id="url-id"
    ),
    pytest.param("highlight_item", {"itemId": 7}, "itemId", id="int-id"),
    pytest.param("search_menu", {"query": "x" * 201}, "query", id="long-query"),
    pytest.param(
        "open_cart_panel",
        {"type": "ShowOrderConfirmation", "open": True},
        None,
        id="type-smuggled-in",
    ),
    pytest.param("open_cart_panel", "not an object", None, id="not-an-object"),
]


@pytest.fixture
def service() -> PresentationToolService:
    return PresentationToolService(build_presentation_registry())


def _contract_types() -> set[str]:
    response = json.loads(
        Path(UI_COMMANDS_SCHEMA_DIR / "agent-turn-response.v1.json").read_text()
    )
    commands = response["properties"]["uiCommands"]["properties"]["commands"]
    return {
        branch["properties"]["type"]["const"] for branch in commands["items"]["oneOf"]
    }


# The allowlist


def test_one_tool_per_contract_command_and_no_more() -> None:
    registry = build_presentation_registry()

    types = [definition.command_type for definition in registry.values()]

    assert len(types) == len(set(types)) == 5
    assert set(types) == _contract_types()


def test_the_command_class_tuple_is_the_generated_union() -> None:
    generated: set[object] = set(get_args(UiCommand.model_fields["root"].annotation))
    classes: set[object] = set(COMMAND_CLASSES)

    assert classes == set(get_args(CommandModel.__value__)) == generated


def test_declined_and_rejected_commands_have_no_tool() -> None:
    registry = build_presentation_registry()

    assert "open_checkout" not in registry
    assert "show_order_confirmation" not in registry
    assert {d.command_type for d in registry.values()}.isdisjoint(
        {"OpenCheckout", "ShowOrderConfirmation"}
    )


def test_names_are_disjoint_from_the_commerce_tools() -> None:
    assert set(build_presentation_registry()).isdisjoint(build_tool_registry())


def test_the_registry_is_read_only() -> None:
    registry = build_presentation_registry()

    with pytest.raises(TypeError):
        registry["evil"] = registry["open_cart_panel"]  # type: ignore[index]


def test_tool_schemas_expose_the_arguments_without_type(
    service: PresentationToolService,
) -> None:
    schemas = {s["function"]["name"]: s["function"] for s in service.tool_schemas()}

    assert list(schemas) == list(build_presentation_registry())
    for function in schemas.values():
        parameters = function["parameters"]
        assert "type" not in parameters.get("properties", {})
        assert parameters["additionalProperties"] is False
    assert (
        schemas["search_menu"]["parameters"]["properties"]["query"]["maxLength"] == 200
    )


# Execution


@pytest.mark.parametrize(("name", "args", "command"), VALID_CALLS)
def test_a_valid_call_records_its_command(
    service: PresentationToolService,
    name: str,
    args: dict[str, Any],
    command: dict[str, Any],
) -> None:
    result = service.execute(name, args)

    assert result.ok
    assert result.command is not None
    assert result.command.model_dump() == command
    # The model reads only "ok"; the command never enters its context.
    assert json.loads(result.to_content()) == {"ok": True}


@pytest.mark.parametrize(("name", "args", "field"), INVALID_CALLS)
def test_an_invalid_call_is_refused_and_records_nothing(
    service: PresentationToolService, name: str, args: Any, field: str | None
) -> None:
    result = service.execute(name, args)

    assert not result.ok
    assert result.command is None
    assert result.error is not None
    assert result.error.code == INVALID_TOOL_ARGUMENTS
    assert result.error.field == field
    content = result.to_content()
    assert "alert" not in content
    assert "evil" not in content


def test_an_unknown_name_is_refused(service: PresentationToolService) -> None:
    result = service.execute("run_javascript", {"code": "alert(1)"})

    assert result.error is not None
    assert result.error.code == UNKNOWN_TOOL
    assert result.command is None


def test_refuse_records_nothing(service: PresentationToolService) -> None:
    result = service.refuse("open_cart_panel", TOOL_CALL_LIMIT_EXCEEDED)

    assert result.error is not None
    assert result.error.code == TOOL_CALL_LIMIT_EXCEEDED
    assert result.command is None


def test_a_result_is_exactly_one_outcome() -> None:
    with pytest.raises(ValueError, match="ok requires a command"):
        PresentationResult(ok=True)


# Logging (ADR-0019 S2): the same fields as a Commerce call, never arguments


def test_each_call_logs_one_line_without_arguments(
    service: PresentationToolService, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)

    service.execute("highlight_item", {"itemId": SENTINEL})
    service.execute("open_cart_panel", {"open": True, "x": SENTINEL})
    service.execute(SENTINEL, {})

    records = [r for r in caplog.records if r.name == "ai_service.tools"]
    assert len(records) == 3
    fields = [r.fields for r in records]  # type: ignore[attr-defined]
    assert [f["tool"] for f in fields] == [
        "highlight_item",
        "open_cart_panel",
        UNREGISTERED_TOOL,
    ]
    assert {f["category"] for f in fields} == {"ui"}
    assert {f["intent"] for f in fields} == {None}
    assert {f["commerce_status"] for f in fields} == {None}
    assert [f["outcome"] for f in fields] == ["ok", "error", "error"]
    assert SENTINEL not in caplog.text
    assert all(SENTINEL not in str(r.__dict__) for r in records)


# The batch envelope


def test_no_commands_means_no_batch() -> None:
    assert build_batch([], "turn", "2026-09-26T12:00:00.000Z") is None


def test_a_batch_carries_the_commands_in_order(
    service: PresentationToolService,
) -> None:
    commands = [service.execute(n, a).command for n, a, _ in VALID_CALLS]

    batch = build_batch(
        [c for c in commands if c is not None], "turn", "2026-09-26T12:00:00.000Z"
    )

    assert batch is not None
    assert batch.model_dump()["commands"] == [c for _, _, c in VALID_CALLS]
    assert (batch.contractVersion, batch.correlationId) == (1, "turn")


def test_a_batch_over_the_contract_cap_is_rejected(
    service: PresentationToolService,
) -> None:
    command = service.execute("open_cart_panel", {"open": True}).command
    assert command is not None

    with pytest.raises(ValueError, match="at most 10"):
        build_batch([command] * 11, "turn", "2026-09-26T12:00:00.000Z")


def test_a_batch_rejects_a_non_utc_timestamp(service: PresentationToolService) -> None:
    command = service.execute("open_cart_panel", {"open": True}).command
    assert command is not None

    with pytest.raises(ValueError, match="issuedAt"):
        build_batch([command], "turn", "2026-09-26T12:00:00+00:00")
