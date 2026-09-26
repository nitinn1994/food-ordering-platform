import asyncio

import pytest
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage

from ai_service.agents.nodes import AgentOutputError, finalize_reply, make_call_model
from ai_service.agents.state import AgentState
from ai_service.llm.simulated import SIMULATED_REPLY, SimulatedChatModel
from tests.fakes import (
    MODEL_EXCEPTION_SENTINEL,
    RaisingChatModel,
    ScriptedChatModel,
    empty_reply_model,
    non_text_reply_model,
    tool_call_model,
)

CONTENT_SENTINEL = "SENTINEL_CONTENT_71c0"


def state(*messages: AnyMessage) -> AgentState:
    return {"messages": list(messages)}


# call_model


def test_call_model_returns_exactly_the_models_message() -> None:
    node = make_call_model(SimulatedChatModel())

    update = asyncio.run(node(state(HumanMessage("Hello"))))

    [message] = update["messages"]
    assert isinstance(message, AIMessage)
    assert message.content == SIMULATED_REPLY
    assert set(update) == {"messages"}


def test_call_model_sends_the_state_messages_to_the_model() -> None:
    model = ScriptedChatModel(reply=AIMessage("ok"))
    node = make_call_model(model)

    asyncio.run(node(state(HumanMessage("Hello"))))

    [sent] = model.received
    assert [m.content for m in sent] == ["Hello"]


def test_call_model_propagates_a_model_failure() -> None:
    node = make_call_model(RaisingChatModel())

    with pytest.raises(RuntimeError, match=MODEL_EXCEPTION_SENTINEL):
        asyncio.run(node(state(HumanMessage("Hello"))))


# finalize_reply


def test_finalize_reply_sets_reply_from_the_last_model_message() -> None:
    update = finalize_reply(state(HumanMessage("Hello"), AIMessage("Hi there")))

    assert update == {"reply": "Hi there"}


@pytest.mark.parametrize(
    "messages",
    [
        pytest.param([], id="no-messages"),
        pytest.param([HumanMessage(CONTENT_SENTINEL)], id="last-not-from-model"),
        pytest.param([empty_reply_model().reply], id="empty"),
        pytest.param([AIMessage("   \n")], id="whitespace"),
        pytest.param([non_text_reply_model().reply], id="non-text"),
        pytest.param([tool_call_model().reply], id="tool-call"),
        pytest.param(
            [
                AIMessage(
                    content=CONTENT_SENTINEL,
                    invalid_tool_calls=[
                        {
                            "type": "invalid_tool_call",
                            "name": "x",
                            "args": "{",
                            "id": "c1",
                            "error": None,
                        }
                    ],
                )
            ],
            id="invalid-tool-call",
        ),
    ],
)
def test_finalize_reply_rejects_unusable_output(messages: list[AnyMessage]) -> None:
    with pytest.raises(AgentOutputError) as caught:
        finalize_reply(state(*messages))

    # The error describes the problem; it never carries the content.
    assert CONTENT_SENTINEL not in str(caught.value)
