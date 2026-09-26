from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import add_messages

from ai_service.agents.state import AgentState


def test_state_holds_conversation_keys_only() -> None:
    # Adding a key (above all a commerce one: cart, price, order status,
    # availability) must change this test in a reviewed diff (AC4).
    assert set(AgentState.__annotations__) == {"messages", "reply"}


def test_only_messages_is_required() -> None:
    assert AgentState.__required_keys__ == frozenset({"messages"})
    assert AgentState.__optional_keys__ == frozenset({"reply"})


def test_messages_reducer_appends() -> None:
    merged = add_messages(HumanMessage("Hello"), AIMessage("Hi"))

    assert [type(m) for m in merged] == [HumanMessage, AIMessage]
