"""The simulated model's keyword table (Phase 15 plan.md OD6, AC13).

Driven message by message, with no graph: each test hands ``respond`` the
turn so far and checks the next message. The graph-level flows (tools
actually running, commands reaching the response) are in
tests/test_agent_ui_commands.py.
"""

import asyncio
import json
from typing import Any

import pytest
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

from ai_service.llm import build_chat_model
from ai_service.llm.simulated import (
    ADD_FAILURE_REPLIES,
    ADD_FAILURE_REPLY,
    ADDED_REPLY,
    ASK_WHICH_ITEM_REPLY,
    NOT_SHOWN_REPLY,
    SHOWN_REPLIES,
    SIMULATED_REPLY,
    TOOL_NAMES,
    UNUSABLE_RESULT_REPLY,
    SimulatedChatModel,
    respond,
)
from ai_service.tools.registry import build_tool_registry, tool_schemas
from ai_service.ui_commands import build_presentation_registry

INPUT_SENTINEL = "SENTINEL_INPUT_3e7b"
OK = json.dumps({"ok": True})


def failed(code: str) -> str:
    return json.dumps({"ok": False, "error": {"code": code, "message": "x"}})


def only_call(message: AIMessage) -> tuple[str, dict[str, Any]]:
    assert message.content == ""
    [call] = message.tool_calls
    return call["name"], call["args"]


def after(text: str, *steps: tuple[AIMessage, str]) -> list[BaseMessage]:
    """A turn: the human message, then each model call and its tool result."""
    turn: list[BaseMessage] = [HumanMessage(text)]
    for call, content in steps:
        turn.append(call)
        turn.append(ToolMessage(content=content, tool_call_id=call.tool_calls[0]["id"]))
    return turn


# First step: which tool, if any, a phrase asks for


@pytest.mark.parametrize(
    ("text", "tool", "args"),
    [
        ("show me the desserts", "show_menu_category", {"categoryId": "desserts"}),
        ("Any STARTERS?", "show_menu_category", {"categoryId": "starters"}),
        ("mains please", "show_menu_category", {"categoryId": "mains"}),
        ("tiramisu", "highlight_item", {"itemId": "tiramisu"}),
        ("tiramisu details", "show_item_detail", {"itemId": "tiramisu"}),
        ("open my cart", "open_cart_panel", {"open": True}),
        ("search for garlic", "search_menu", {"query": "garlic"}),
        ("find soup", "search_menu", {"query": "soup"}),
        ("add tiramisu", "add_cart_item", {"itemId": "tiramisu", "quantity": 1}),
        (
            "Add a Garlic Bread",
            "add_cart_item",
            {"itemId": "garlic-bread", "quantity": 1},
        ),
        (
            "add tiramisu to my cart",
            "add_cart_item",
            {"itemId": "tiramisu", "quantity": 1},
        ),
    ],
)
def test_each_phrase_asks_for_its_tool(
    text: str, tool: str, args: dict[str, Any]
) -> None:
    assert only_call(respond([HumanMessage(text)])) == (tool, args)


def test_a_search_phrase_is_cut_to_the_contract_bound() -> None:
    _, args = only_call(respond([HumanMessage("find " + "x" * 500)]))

    assert args == {"query": "x" * 200}


@pytest.mark.parametrize("text", ["Hello", "What's good?", INPUT_SENTINEL])
def test_anything_else_gets_the_fixed_reply(text: str) -> None:
    reply = respond([HumanMessage(text)])

    assert reply.content == SIMULATED_REPLY
    assert reply.tool_calls == []


def test_add_with_no_item_asks_which() -> None:
    assert respond([HumanMessage("add !!!")]).content == ASK_WHICH_ITEM_REPLY


def test_every_tool_it_names_is_registered() -> None:
    registered = set(build_tool_registry()) | set(build_presentation_registry())

    assert registered >= TOOL_NAMES


# After a presentation call


@pytest.mark.parametrize(("tool", "reply"), list(SHOWN_REPLIES.items()))
def test_a_shown_command_gets_its_reply(tool: str, reply: str) -> None:
    call = AIMessage(content="", tool_calls=[{"name": tool, "args": {}, "id": "c0"}])

    assert respond(after("x", (call, OK))).content == reply


def test_a_refused_presentation_call_is_not_claimed() -> None:
    call = respond([HumanMessage("show me the desserts")])

    reply = respond(after("x", (call, failed("INVALID_TOOL_ARGUMENTS"))))

    assert reply.content == NOT_SHOWN_REPLY
    assert reply.tool_calls == []


# The add path: the cart is shown only after commerce-api said ok


def test_a_successful_add_opens_the_cart_then_replies() -> None:
    add = respond([HumanMessage("add tiramisu")])

    opened = respond(after("add tiramisu", (add, OK)))
    assert only_call(opened) == ("open_cart_panel", {"open": True})

    reply = respond(after("add tiramisu", (add, OK), (opened, OK)))
    assert reply.content == ADDED_REPLY
    assert reply.tool_calls == []


def test_call_ids_are_unique_within_a_turn() -> None:
    add = respond([HumanMessage("add tiramisu")])
    opened = respond(after("add tiramisu", (add, OK)))

    assert add.tool_calls[0]["id"] != opened.tool_calls[0]["id"]


@pytest.mark.parametrize(
    "code",
    [*ADD_FAILURE_REPLIES, "COMMERCE_UNAVAILABLE", "CART_CONFLICT", "SOMETHING_NEW"],
)
def test_a_failed_add_explains_and_asks_for_no_ui_command(code: str) -> None:
    add = respond([HumanMessage("add tiramisu")])

    reply = respond(after("add tiramisu", (add, failed(code))))

    assert reply.tool_calls == []
    assert reply.content == ADD_FAILURE_REPLIES.get(code, ADD_FAILURE_REPLY)
    assert "Added" not in str(reply.content)


@pytest.mark.parametrize(
    "content", ["not json", json.dumps([1]), json.dumps({"ok": "yes"})]
)
def test_an_unreadable_result_is_never_treated_as_success(content: str) -> None:
    add = respond([HumanMessage("add tiramisu")])

    reply = respond(after("add tiramisu", (add, content)))

    assert reply.content == UNUSABLE_RESULT_REPLY
    assert reply.tool_calls == []


# Invariants


@pytest.mark.parametrize(
    "text",
    [INPUT_SENTINEL, f"add {INPUT_SENTINEL}", f"find {INPUT_SENTINEL}", "tiramisu"],
)
def test_replies_never_echo_the_input(text: str) -> None:
    lowered = text.lower()
    first = respond([HumanMessage(text)])
    replies = [first]
    if first.tool_calls:
        replies.append(respond(after(text, (first, OK))))

    for reply in replies:
        assert lowered not in str(reply.content).lower()
        assert INPUT_SENTINEL not in str(reply.content)


def test_it_reads_only_the_current_turn() -> None:
    earlier = [HumanMessage("add tiramisu"), AIMessage(ADDED_REPLY)]

    assert respond([*earlier, HumanMessage("Hello")]).content == SIMULATED_REPLY


def test_async_and_sync_agree() -> None:
    model = SimulatedChatModel()
    messages = [HumanMessage("show me the desserts")]

    sync = model.invoke(messages)
    asynchronous = asyncio.run(model.ainvoke(messages))

    assert isinstance(sync, AIMessage)
    assert isinstance(asynchronous, AIMessage)
    assert sync.tool_calls == asynchronous.tool_calls


def test_llm_type_names_it_simulated() -> None:
    assert SimulatedChatModel()._llm_type == "simulated"


def test_build_chat_model_returns_a_new_simulated_model_each_call() -> None:
    first, second = build_chat_model(), build_chat_model()

    assert isinstance(first, SimulatedChatModel)
    assert first is not second


def test_binding_tools_returns_the_model_itself() -> None:
    model = SimulatedChatModel()

    bound = model.bind_tools(tool_schemas(build_tool_registry()))

    assert bound is model
