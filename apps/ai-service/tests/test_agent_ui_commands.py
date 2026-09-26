"""UI commands through a whole turn (Phase 15 plan.md sections 11, 13, 16
and 17; AC6, AC10-AC13).

Every turn runs the real graph, the real tools and the real presentation
tools through the HTTP route, on a scripted or the simulated model, with
commerce-api faked. Every 200 body is checked against the committed
``agent-turn-response.v1.json``, the same schema apps/web validates.
"""

import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from langchain_core.messages import AIMessage

from ai_service.agents.graph import build_agent_graph
from ai_service.agents.nodes import MAX_TOOL_CALLS_PER_TURN
from ai_service.agents.service import AgentService
from ai_service.llm.simulated import (
    ADD_FAILURE_REPLIES,
    ADDED_REPLY,
    SimulatedChatModel,
)
from scripts.generate_contracts import UI_COMMANDS_SCHEMA_DIR
from tests.commerce_fakes import (
    CART,
    FakeCommerce,
    contract_error,
    json_response,
    presentation_service,
)
from tests.conftest import AgentClientFactory
from tests.fakes import SequencedChatModel, calls

PATH = "/v1/agent/turns"
OPEN_CART = {"type": "OpenCartPanel", "open": True}
SHOW_DESSERTS = {"type": "ShowMenuCategory", "categoryId": "desserts"}
ADD_TIRAMISU = ("add_cart_item", {"itemId": "tiramisu", "quantity": 1})
ISSUED_AT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def _response_schema() -> Draft202012Validator:
    schema = json.loads(
        Path(UI_COMMANDS_SCHEMA_DIR / "agent-turn-response.v1.json").read_text()
    )
    return Draft202012Validator(schema)


def _turn(
    agent_client: AgentClientFactory,
    model: Any,
    commerce: FakeCommerce | None = None,
    message: str = "Hello",
    headers: dict[str, str] | None = None,
) -> Any:
    client = agent_client(model, commerce or FakeCommerce())
    return client.post(PATH, json={"message": message}, headers=headers)


def _ok_body(response: Any) -> dict[str, Any]:
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    _response_schema().validate(body)
    return body


def _commands(body: dict[str, Any]) -> list[dict[str, Any]]:
    commands: list[dict[str, Any]] = body["uiCommands"]["commands"]
    return commands


# The response shape (AC6)


def test_a_turn_without_commands_omits_the_key(
    agent_client: AgentClientFactory,
) -> None:
    body = _ok_body(_turn(agent_client, SequencedChatModel(replies=[AIMessage("Hi")])))

    assert body == {"reply": "Hi"}


def test_the_batch_carries_the_turns_correlation_id_and_a_utc_timestamp(
    agent_client: AgentClientFactory,
) -> None:
    model = SequencedChatModel(
        replies=[calls(("open_cart_panel", {"open": True})), AIMessage("Here.")]
    )

    response = _turn(agent_client, model, headers={"X-Correlation-Id": "turn-7f3a"})
    body = _ok_body(response)

    batch = body["uiCommands"]
    assert batch["contractVersion"] == 1
    assert batch["correlationId"] == "turn-7f3a"
    assert response.headers["x-correlation-id"] == "turn-7f3a"
    assert ISSUED_AT.fullmatch(batch["issuedAt"])
    assert batch["commands"] == [OPEN_CART]


def test_without_a_correlation_header_the_generated_one_is_used(
    agent_client: AgentClientFactory,
) -> None:
    model = SequencedChatModel(
        replies=[calls(("open_cart_panel", {"open": True})), AIMessage("Here.")]
    )

    response = _turn(agent_client, model)

    assert (
        _ok_body(response)["uiCommands"]["correlationId"]
        == (response.headers["x-correlation-id"])
    )


def test_outside_a_request_the_service_still_sets_a_correlation_id() -> None:
    model = SequencedChatModel(
        replies=[calls(("open_cart_panel", {"open": True})), AIMessage("Here.")]
    )
    service = AgentService(
        build_agent_graph(model, FakeCommerce().tool_service(), presentation_service())
    )

    result = asyncio.run(service.run_turn("Hello"))

    assert result.ui_commands is not None
    assert len(result.ui_commands.correlationId) > 0


# Ordering (AC10)


def test_a_write_then_a_ui_command_in_separate_rounds(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on("POST", "/v1/cart/items", json_response(200, CART))
    model = SequencedChatModel(
        replies=[
            calls(ADD_TIRAMISU),
            calls(("open_cart_panel", {"open": True})),
            AIMessage("Added."),
        ]
    )

    body = _ok_body(_turn(agent_client, model, commerce))

    assert _commands(body) == [OPEN_CART]
    assert [(r.method, r.url.path) for r in commerce.requests] == [
        ("POST", "/v1/cart/items")
    ]


def test_a_ui_call_beside_a_write_is_delivered_only_after_the_write_ran(
    agent_client: AgentClientFactory,
) -> None:
    order: list[str] = []

    def add(_: Any) -> Any:
        order.append("write")
        return json_response(200, CART)

    commerce = FakeCommerce().on("POST", "/v1/cart/items", add)
    # The presentation call comes first in the same message: it is recorded
    # first, but nothing leaves the graph until the turn is over.
    model = SequencedChatModel(
        replies=[
            calls(("open_cart_panel", {"open": True}), ADD_TIRAMISU),
            AIMessage("Done."),
        ]
    )

    response = _turn(agent_client, model, commerce)
    order.append("response")

    assert order == ["write", "response"]
    assert _commands(_ok_body(response)) == [OPEN_CART]


def test_commands_keep_the_order_the_model_asked_for(
    agent_client: AgentClientFactory,
) -> None:
    model = SequencedChatModel(
        replies=[
            calls(("show_menu_category", {"categoryId": "desserts"})),
            calls(
                ("highlight_item", {"itemId": "tiramisu"}),
                ("open_cart_panel", {"open": True}),
            ),
            AIMessage("Done."),
        ]
    )

    body = _ok_body(_turn(agent_client, model))

    assert _commands(body) == [
        SHOW_DESSERTS,
        {"type": "HighlightItem", "itemId": "tiramisu"},
        OPEN_CART,
    ]


def test_an_invalid_ui_call_is_dropped_and_its_siblings_kept(
    agent_client: AgentClientFactory,
) -> None:
    model = SequencedChatModel(
        replies=[
            calls(
                ("open_cart_panel", {"open": True, "execute": "alert(1)"}),
                ("show_menu_category", {"categoryId": "desserts"}),
                ("show_item_detail", {"itemId": "javascript:alert(1)"}),
            ),
            AIMessage("Done."),
        ]
    )

    body = _ok_body(_turn(agent_client, model))

    assert _commands(body) == [SHOW_DESSERTS]
    assert "alert" not in json.dumps(body)


# Limits (AC11)


def test_ui_calls_share_the_turn_limit_and_the_excess_is_not_recorded(
    agent_client: AgentClientFactory,
) -> None:
    requested = [("open_cart_panel", {"open": True})] * (MAX_TOOL_CALLS_PER_TURN + 1)
    model = SequencedChatModel(replies=[calls(*requested), AIMessage("Done.")])

    body = _ok_body(_turn(agent_client, model))

    assert len(_commands(body)) == MAX_TOOL_CALLS_PER_TURN


def test_commerce_calls_count_toward_the_same_limit(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on("GET", "/v1/cart", json_response(200, CART))
    requested: list[tuple[str, dict[str, Any]]] = [
        ("get_cart", {})
    ] * MAX_TOOL_CALLS_PER_TURN + [("open_cart_panel", {"open": True})]
    model = SequencedChatModel(replies=[calls(*requested), AIMessage("Done.")])

    body = _ok_body(_turn(agent_client, model, commerce))

    assert "uiCommands" not in body


# Failure (AC12)


def test_a_failed_turn_returns_the_error_only(agent_client: AgentClientFactory) -> None:
    # The model shows the cart, then produces an unusable (empty) reply.
    model = SequencedChatModel(
        replies=[calls(("open_cart_panel", {"open": True})), AIMessage("")]
    )

    response = _turn(agent_client, model)

    assert response.status_code == 500
    assert response.json() == {
        "code": "AGENT_FAILED",
        "message": "The assistant could not process this message.",
    }


# The simulated model end to end (AC13)


def test_simulated_add_that_succeeds_shows_the_cart(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on("POST", "/v1/cart/items", json_response(200, CART))

    body = _ok_body(
        _turn(agent_client, SimulatedChatModel(), commerce, message="add tiramisu")
    )

    assert body["reply"] == ADDED_REPLY
    assert _commands(body) == [OPEN_CART]
    assert commerce.request_json() == {"itemId": "tiramisu", "quantity": 1}


@pytest.mark.parametrize(
    ("status", "code"),
    [(422, "MENU_ITEM_UNAVAILABLE"), (404, "MENU_ITEM_NOT_FOUND")],
)
def test_simulated_add_that_fails_sends_no_ui_command(
    agent_client: AgentClientFactory, status: int, code: str
) -> None:
    commerce = FakeCommerce().on(
        "POST", "/v1/cart/items", contract_error(status, code, "commerce text")
    )

    body = _ok_body(
        _turn(agent_client, SimulatedChatModel(), commerce, message="add tiramisu")
    )

    assert body == {"reply": ADD_FAILURE_REPLIES[code]}
    assert "commerce text" not in body["reply"]


def test_simulated_add_of_an_unslugable_item_never_reaches_commerce(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce()

    body = _ok_body(
        _turn(agent_client, SimulatedChatModel(), commerce, message="add " + "x" * 80)
    )

    # A 80-character id fails the tool's contract bound (64): refused before
    # any request, explained, and no UI command.
    assert body == {"reply": ADD_FAILURE_REPLIES["INVALID_TOOL_ARGUMENTS"]}
    assert commerce.requests == []


def test_simulated_presentation_turn_needs_no_commerce_api(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce()

    body = _ok_body(
        _turn(
            agent_client, SimulatedChatModel(), commerce, message="show me the desserts"
        )
    )

    assert _commands(body) == [SHOW_DESSERTS]
    assert commerce.requests == []


# The turn log (plan.md section 18)


def test_the_turn_log_counts_ui_commands_without_content(
    agent_client: AgentClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)

    _ok_body(
        _turn(agent_client, SimulatedChatModel(), message="find sentinel-query-4b2a")
    )

    [record] = [r for r in caplog.records if r.name == "ai_service.agent"]
    assert record.fields["ui_commands"] == 1  # type: ignore[attr-defined]
    assert "sentinel-query-4b2a" not in caplog.text
