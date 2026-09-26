"""The agent's tool loop, end to end (Phase 14 plan.md sections 16 and 17;
AC15-AC20, AC22, AC24).

Every test goes through ``POST /v1/agent/turns`` on the real ``create_app``:
a scripted model (tests/fakes.py) asks for tools, the real ``ToolService``
and ``CommerceClient`` run them against ``FakeCommerce``, and the model's
next call sees the results.
"""

import asyncio
import io
import json
import logging
from typing import Any

import httpx
import pytest
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage

from ai_service.agents.graph import RECURSION_LIMIT
from ai_service.agents.nodes import (
    MAX_TOOL_CALLS_PER_MESSAGE,
    MAX_TOOL_CALLS_PER_TURN,
    MAX_TOOL_ROUNDS,
)
from ai_service.agents.prompts import SYSTEM_PROMPT
from tests.commerce_fakes import (
    CART,
    EMPTY_CART,
    MENU,
    FakeCommerce,
    contract_error,
    json_response,
)
from tests.conftest import AgentClientFactory
from tests.fakes import SequencedChatModel, calls

TOOL_NAMES = [
    "get_menu",
    "get_cart",
    "add_cart_item",
    "set_cart_item_quantity",
    "remove_cart_item",
]
SENTINEL_MESSAGE = "SENTINEL_TURN_MESSAGE_5d0e"
SENTINEL_ITEM = "sentinel-item-5d0e"


def _turn(
    agent_client: AgentClientFactory,
    model: SequencedChatModel,
    commerce: FakeCommerce,
    message: str = "Add a tiramisu",
    headers: dict[str, str] | None = None,
) -> Any:
    # Starlette's TestClient response: an httpx2 Response in this
    # environment (ADR-0020), not the httpx one the service uses.
    client = agent_client(model, commerce)
    return client.post("/v1/agent/turns", json={"message": message}, headers=headers)


def _tool_messages(sent: list[BaseMessage]) -> list[ToolMessage]:
    return [m for m in sent if isinstance(m, ToolMessage)]


def _content(message: ToolMessage) -> dict[str, Any]:
    assert isinstance(message.content, str)
    content: dict[str, Any] = json.loads(message.content)
    return content


def test_menu_then_add_then_reply(agent_client: AgentClientFactory) -> None:
    commerce = (
        FakeCommerce()
        .on("GET", "/v1/menu", json_response(200, MENU))
        .on("POST", "/v1/cart/items", json_response(200, CART))
    )
    model = SequencedChatModel(
        replies=[
            calls(("get_menu", {})),
            calls(("add_cart_item", {"itemId": "tiramisu", "quantity": 2})),
            AIMessage("Added two tiramisu. Your subtotal is $15.00."),
        ]
    )

    response = _turn(agent_client, model, commerce)

    assert response.status_code == 200
    assert response.json() == {"reply": "Added two tiramisu. Your subtotal is $15.00."}
    assert [(r.method, r.url.path) for r in commerce.requests] == [
        ("GET", "/v1/menu"),
        ("POST", "/v1/cart/items"),
    ]
    assert commerce.request_json() == {"itemId": "tiramisu", "quantity": 2}
    # Each model call saw the results of the calls before it.
    assert len(model.received) == 3
    [menu_result] = _tool_messages(model.received[1])
    assert _content(menu_result) == {"ok": True, "data": MENU}
    add_result = _tool_messages(model.received[2])[-1]
    assert _content(add_result) == {"ok": True, "data": CART}


def test_a_tool_error_reaches_the_model_and_the_turn_succeeds(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on(
        "POST",
        "/v1/cart/items",
        contract_error(422, "MENU_ITEM_UNAVAILABLE", "commerce text"),
    )
    model = SequencedChatModel(
        replies=[
            calls(("add_cart_item", {"itemId": "tiramisu", "quantity": 1})),
            AIMessage("Sorry, tiramisu is unavailable right now."),
        ]
    )

    response = _turn(agent_client, model, commerce)

    assert response.status_code == 200
    [result] = _tool_messages(model.received[1])
    content = _content(result)
    assert content["ok"] is False
    assert content["error"]["code"] == "MENU_ITEM_UNAVAILABLE"
    assert "commerce text" not in result.content


def test_every_call_id_is_answered_exactly_once(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on("GET", "/v1/cart", json_response(200, CART))
    mixed = calls(
        ("get_cart", {}),
        ("create_order", {}),
        ("add_cart_item", {"itemId": "tiramisu"}),
    )
    mixed.invalid_tool_calls = [
        {
            "type": "invalid_tool_call",
            "name": "remove_cart_item",
            "args": "{oops",
            "id": "call_bad",
            "error": None,
        }
    ]
    model = SequencedChatModel(replies=[mixed, AIMessage("Done.")])

    response = _turn(agent_client, model, commerce)

    assert response.status_code == 200
    results = {m.tool_call_id: _content(m) for m in _tool_messages(model.received[1])}
    assert len(_tool_messages(model.received[1])) == len(results) == 4
    assert results["call_0"]["ok"] is True
    assert results["call_1"]["error"]["code"] == "UNKNOWN_TOOL"
    assert results["call_2"]["error"]["code"] == "INVALID_TOOL_ARGUMENTS"
    assert results["call_bad"]["error"]["code"] == "INVALID_TOOL_ARGUMENTS"
    assert [(r.method, r.url.path) for r in commerce.requests] == [("GET", "/v1/cart")]


def test_calls_in_one_message_run_in_order_one_at_a_time(
    agent_client: AgentClientFactory,
) -> None:
    active = 0
    overlaps: list[int] = []

    async def slow(request: httpx.Request) -> httpx.Response:
        nonlocal active
        active += 1
        overlaps.append(active)
        await asyncio.sleep(0.01)
        active -= 1
        return json_response(200, CART if request.method == "POST" else EMPTY_CART)

    commerce = (
        FakeCommerce()
        .on("POST", "/v1/cart/items", slow)
        .on("DELETE", "/v1/cart/items/soup", slow)
    )
    model = SequencedChatModel(
        replies=[
            calls(
                ("add_cart_item", {"itemId": "tiramisu", "quantity": 1}),
                ("remove_cart_item", {"itemId": "soup"}),
            ),
            AIMessage("Done."),
        ]
    )

    assert _turn(agent_client, model, commerce).status_code == 200

    assert [(r.method, r.url.path) for r in commerce.requests] == [
        ("POST", "/v1/cart/items"),
        ("DELETE", "/v1/cart/items/soup"),
    ]
    assert max(overlaps) == 1


def test_a_model_that_never_stops_is_cut_off(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on("GET", "/v1/cart", json_response(200, CART))
    model = SequencedChatModel(replies=[calls(("get_cart", {}))])

    response = _turn(agent_client, model, commerce)

    assert response.status_code == 500
    assert response.json()["code"] == "AGENT_FAILED"
    assert len(commerce.requests) == MAX_TOOL_ROUNDS
    assert len(model.received) == MAX_TOOL_ROUNDS + 1


def test_calls_past_the_turn_limit_never_run(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on("GET", "/v1/cart", json_response(200, CART))
    too_many: list[tuple[str, Any]] = [("get_cart", {})] * (MAX_TOOL_CALLS_PER_TURN + 2)
    model = SequencedChatModel(replies=[calls(*too_many), AIMessage("Here it is.")])

    response = _turn(agent_client, model, commerce)

    assert response.status_code == 200
    assert len(commerce.requests) == MAX_TOOL_CALLS_PER_TURN
    refused = [
        m
        for m in _tool_messages(model.received[1])
        if _content(m).get("error", {}).get("code") == "TOOL_CALL_LIMIT_EXCEEDED"
    ]
    assert len(refused) == 2


def test_the_longest_allowed_turn_fits_the_recursion_limit(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on("GET", "/v1/cart", json_response(200, CART))
    rounds = [calls(("get_cart", {}))] * MAX_TOOL_ROUNDS
    model = SequencedChatModel(replies=[*rounds, AIMessage("Your cart.")])

    response = _turn(agent_client, model, commerce)

    assert response.status_code == 200
    assert len(commerce.requests) == MAX_TOOL_ROUNDS
    assert RECURSION_LIMIT >= 2 * MAX_TOOL_ROUNDS + 2


def test_the_model_is_bound_to_the_five_tools_and_prompted(
    agent_client: AgentClientFactory,
) -> None:
    model = SequencedChatModel(replies=[AIMessage("Hello!")])

    assert _turn(agent_client, model, FakeCommerce()).status_code == 200

    assert [t["function"]["name"] for t in model.bound_tools] == TOOL_NAMES
    first = model.received[0][0]
    assert isinstance(first, SystemMessage)
    assert first.content == SYSTEM_PROMPT


def test_the_correlation_id_reaches_commerce_api(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on("GET", "/v1/menu", json_response(200, MENU))
    model = SequencedChatModel(replies=[calls(("get_menu", {})), AIMessage("Menu.")])

    response = _turn(
        agent_client, model, commerce, headers={"X-Correlation-Id": "turn-7f3a"}
    )

    assert response.headers["x-correlation-id"] == "turn-7f3a"
    assert commerce.requests[0].headers["x-correlation-id"] == "turn-7f3a"


def test_turn_log_counts_tools_and_nothing_leaks(
    agent_client: AgentClientFactory,
    log_stream: io.StringIO,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    commerce = (
        FakeCommerce()
        .on("GET", "/v1/menu", json_response(200, MENU))
        .on(
            "POST",
            "/v1/cart/items",
            contract_error(404, "MENU_ITEM_NOT_FOUND", SENTINEL_MESSAGE),
        )
    )
    model = SequencedChatModel(
        replies=[
            calls(("get_menu", {})),
            calls(("add_cart_item", {"itemId": SENTINEL_ITEM, "quantity": 1})),
            AIMessage("That item isn't on the menu."),
        ]
    )

    response = _turn(agent_client, model, commerce, message=SENTINEL_MESSAGE)

    assert response.status_code == 200
    [turn] = [r for r in caplog.records if r.name == "ai_service.agent"]
    fields = turn.fields  # type: ignore[attr-defined]
    assert (fields["tool_calls"], fields["tool_rounds"]) == (2, 2)
    assert len([r for r in caplog.records if r.name == "ai_service.tools"]) == 2
    output = log_stream.getvalue()
    for sentinel in (SENTINEL_MESSAGE, SENTINEL_ITEM, "Tiramisu"):
        assert sentinel not in output
        assert sentinel not in caplog.text


def test_a_flood_of_tool_calls_fails_the_turn_without_running_any(
    agent_client: AgentClientFactory,
) -> None:
    commerce = FakeCommerce().on("GET", "/v1/cart", json_response(200, CART))
    flood: list[tuple[str, Any]] = [("get_cart", {})] * (MAX_TOOL_CALLS_PER_MESSAGE + 1)
    model = SequencedChatModel(replies=[calls(*flood), AIMessage("unreachable")])

    response = _turn(agent_client, model, commerce)

    assert response.status_code == 500
    assert response.json()["code"] == "AGENT_FAILED"
    assert commerce.requests == []
    assert len(model.received) == 1
