"""The graph's state: conversation state only.

Allowed here is what the agent needs while it processes one turn: that
turn's messages, and the reply produced from them. With no memory (plan.md
section 12), a turn starts with exactly one ``HumanMessage``.

Never allowed here is business state. Cart contents, prices, totals, order
status and availability belong to commerce-api (system-architecture.md
section 4.2). A later tool may put a commerce-api response into a message for
the model to read. That is context, never an authoritative copy, and it is
never read back as truth.

tests/test_agent_state.py pins the keys, so adding one is a reviewed
decision, not a side effect.
"""

from typing import Annotated, NotRequired, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph import add_messages


class AgentState(TypedDict):
    # add_messages appends a node's messages to the list instead of
    # replacing it.
    messages: Annotated[list[AnyMessage], add_messages]
    # Set by finalize_reply only, once the model's output has been checked.
    reply: NotRequired[str]
