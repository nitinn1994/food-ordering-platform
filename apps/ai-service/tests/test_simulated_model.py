import asyncio

from langchain_core.messages import AIMessage, HumanMessage

from ai_service.llm import build_chat_model
from ai_service.llm.simulated import SIMULATED_REPLY, SimulatedChatModel
from ai_service.tools.registry import build_tool_registry, tool_schemas

INPUT_SENTINEL = "SENTINEL_INPUT_3e7b"


def test_async_reply_is_the_fixed_text() -> None:
    reply = asyncio.run(SimulatedChatModel().ainvoke([HumanMessage("Hello")]))

    assert isinstance(reply, AIMessage)
    assert reply.content == SIMULATED_REPLY
    assert not reply.tool_calls


def test_sync_reply_is_the_fixed_text() -> None:
    reply = SimulatedChatModel().invoke([HumanMessage("Hello")])

    assert reply.content == SIMULATED_REPLY


def test_reply_does_not_depend_on_the_input() -> None:
    model = SimulatedChatModel()

    replies = {
        model.invoke([HumanMessage(text)]).content
        for text in ("Hello", "Add two tiramisu", INPUT_SENTINEL)
    }

    assert replies == {SIMULATED_REPLY}


def test_input_is_never_echoed() -> None:
    reply = SimulatedChatModel().invoke([HumanMessage(INPUT_SENTINEL)])

    assert INPUT_SENTINEL not in str(reply.content)


def test_llm_type_names_it_simulated() -> None:
    assert SimulatedChatModel()._llm_type == "simulated"


def test_build_chat_model_returns_a_new_simulated_model_each_call() -> None:
    first, second = build_chat_model(), build_chat_model()

    assert isinstance(first, SimulatedChatModel)
    assert first is not second


def test_binding_tools_changes_nothing() -> None:
    # Phase 14 plan.md OD5: the graph binds the five tools; this model
    # accepts them and never calls one.
    model = SimulatedChatModel()

    bound = model.bind_tools(tool_schemas(build_tool_registry()))
    reply = asyncio.run(bound.ainvoke([HumanMessage("Add a tiramisu")]))

    assert bound is model
    assert isinstance(reply, AIMessage)
    assert reply.content == SIMULATED_REPLY
    assert reply.tool_calls == []
