"""The graph's two nodes (plan.md section 6).

Plain functions over ``AgentState``, testable without compiling a graph.
They do not log: turn-level logging belongs to the agent service, and a node
that logged would be one step from logging content.
"""

from typing import Any, Protocol

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage

from ai_service.agents.state import AgentState


class CallModelNode(Protocol):
    # A Protocol, not Callable[[AgentState], ...]: LangGraph's node protocol
    # takes the state as a parameter named "state", which a Callable type
    # (positional-only) does not promise.
    async def __call__(self, state: AgentState) -> dict[str, Any]: ...


class AgentOutputError(Exception):
    """The model's output is not a usable reply.

    The message is a fixed description of the problem, never the output
    itself: model output is untrusted, and an exception's text can reach a
    log (ADR-0019, S2).
    """


def make_call_model(model: BaseChatModel) -> CallModelNode:
    """Bind ``model`` into the ``call_model`` node by closure, so no node
    ever reads a model from a global."""

    async def call_model(state: AgentState) -> dict[str, Any]:
        # No prompt is prepended: there is no model yet that would read one.
        message = await model.ainvoke(state["messages"])
        return {"messages": [message]}

    return call_model


def finalize_reply(state: AgentState) -> dict[str, Any]:
    """Check the model's last message and turn it into ``reply``.

    The one place free-form model output becomes a typed result; later
    phases validate structured output (intents, UI commands) here too.
    """
    if not state["messages"]:
        raise AgentOutputError("no messages")
    message = state["messages"][-1]
    if not isinstance(message, AIMessage):
        raise AgentOutputError("last message is not from the model")
    if message.tool_calls or message.invalid_tool_calls:
        raise AgentOutputError("model requested a tool; none are available")
    if not isinstance(message.content, str):
        raise AgentOutputError("model reply is not plain text")
    if not message.content.strip():
        raise AgentOutputError("model reply is empty")
    return {"reply": message.content}
