"""The graph's nodes and routing (Phase 13 plan.md section 6; Phase 14
plan.md sections 16 and 17).

Plain functions over ``AgentState``, testable without compiling a graph.
They do not log: turn-level logging belongs to the agent service and
tool-level logging to the tool service, and a node that logged would be one
step from logging content.

``execute_tools`` only translates: model tool calls in, ``ToolService`` or
``PresentationToolService`` calls, tool messages out. It never speaks HTTP
and never interprets a result. How many rounds and calls a turn has used is
derived from the messages, so the state gains no key for them.

Phase 15 (plan.md sections 13 and 16): a presentation call's validated UI
command rides on its tool message as ``artifact``, which is never sent to the
model. ``finalize_reply`` collects those artifacts, in call order, once the
turn is over, so no UI command leaves the graph before every commerce write
in the turn has resolved. Presentation calls count toward the same per-turn
limit as Commerce calls (OD10).
"""

from collections.abc import Sequence
from typing import Any, Final, Literal, Protocol

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, SystemMessage, ToolMessage

from ai_service.agents.prompts import SYSTEM_PROMPT
from ai_service.agents.state import AgentState
from ai_service.tools.results import INVALID_TOOL_ARGUMENTS, TOOL_CALL_LIMIT_EXCEEDED
from ai_service.tools.service import ToolService
from ai_service.ui_commands import PresentationToolService, UiCommandModel
from ai_service.ui_commands.service import UI_COMMAND_CLASSES

# Model messages that ask for tools, per turn. A further request goes to
# finalize_reply, which refuses it (AGENT_FAILED).
MAX_TOOL_ROUNDS = 4
# Tool calls run per turn, across all rounds. Later calls are answered with
# TOOL_CALL_LIMIT_EXCEEDED and never run.
MAX_TOOL_CALLS_PER_TURN = 8
# Tool calls (well-formed or not) one model message may ask for at all. A
# message over this is unusable output, not a list of calls to refuse one by
# one: model output must not scale the work and log volume of a turn
# (security review S1). Twice the per-turn limit, so an ordinary overshoot
# is still answered call by call.
MAX_TOOL_CALLS_PER_MESSAGE = 2 * MAX_TOOL_CALLS_PER_TURN

EXECUTE_TOOLS: Final = "execute_tools"
FINALIZE_REPLY: Final = "finalize_reply"


class CallModelNode(Protocol):
    # A Protocol, not Callable[[AgentState], ...]: LangGraph's node protocol
    # takes the state as a parameter named "state", which a Callable type
    # (positional-only) does not promise.
    async def __call__(self, state: AgentState) -> dict[str, Any]: ...


class ExecuteToolsNode(Protocol):
    async def __call__(self, state: AgentState) -> dict[str, Any]: ...


class AgentOutputError(Exception):
    """The model's output is not a usable reply.

    The message is a fixed description of the problem, never the output
    itself: model output is untrusted, and an exception's text can reach a
    log (ADR-0019, S2).
    """


def make_call_model(
    model: BaseChatModel, tool_schemas: Sequence[dict[str, Any]]
) -> CallModelNode:
    """Bind ``model``, with the tools it may call, into the ``call_model``
    node by closure, so no node ever reads a model from a global."""
    bound = model.bind_tools(list(tool_schemas))

    async def call_model(state: AgentState) -> dict[str, Any]:
        # The prompt is sent, not stored: it is never duplicated in state
        # across tool rounds.
        message = await bound.ainvoke(
            [SystemMessage(SYSTEM_PROMPT), *state["messages"]]
        )
        return {"messages": [message]}

    return call_model


def requests_tools(message: AnyMessage) -> bool:
    return isinstance(message, AIMessage) and bool(
        message.tool_calls or message.invalid_tool_calls
    )


def tool_rounds(messages: Sequence[AnyMessage]) -> int:
    """Model messages in this turn that asked for tools."""
    return sum(1 for message in messages if requests_tools(message))


def tool_calls_requested(messages: Sequence[AnyMessage]) -> int:
    """Well-formed tool calls the model has asked for in this turn."""
    return sum(len(m.tool_calls) for m in messages if isinstance(m, AIMessage))


def route_after_model(
    state: AgentState,
) -> Literal["execute_tools", "finalize_reply"]:
    messages = state["messages"]
    if (
        messages
        and requests_tools(messages[-1])
        and tool_rounds(messages) <= MAX_TOOL_ROUNDS
    ):
        return EXECUTE_TOOLS
    return FINALIZE_REPLY


def make_execute_tools(
    tool_service: ToolService, presentation_service: PresentationToolService
) -> ExecuteToolsNode:
    """Run the last model message's tool calls, one after another in the
    model's order: presentation tools through ``presentation_service``,
    every other name through ``tool_service`` (which refuses a name it does
    not know). Answer every call id with exactly one tool message (providers
    reject a turn with an unanswered call)."""

    def refuse(name: str, code: str) -> str:
        if presentation_service.handles(name):
            return presentation_service.refuse(name, code).to_content()
        return tool_service.refuse(name, code).to_content()

    async def execute_tools(state: AgentState) -> dict[str, Any]:
        message = state["messages"][-1]
        if not isinstance(message, AIMessage):
            raise AgentOutputError("tool step without a model message")
        # Checked before anything runs: nothing is executed, refused or
        # logged for a message like this. The turn fails (AGENT_FAILED).
        requested = len(message.tool_calls) + len(message.invalid_tool_calls)
        if requested > MAX_TOOL_CALLS_PER_MESSAGE:
            raise AgentOutputError("model message requested too many tool calls")
        # Calls requested before this message, all rounds.
        used = tool_calls_requested(state["messages"][:-1])
        replies: list[ToolMessage] = []
        # Sequential, never concurrent: two writes to one cart must not race
        # each other into CART_CONFLICT (plan.md AC18).
        for call in message.tool_calls:
            used += 1
            name = call["name"]
            if used > MAX_TOOL_CALLS_PER_TURN:
                content = refuse(name, TOOL_CALL_LIMIT_EXCEEDED)
                replies.append(_tool_message(content, call["id"]))
            elif presentation_service.handles(name):
                outcome = presentation_service.execute(name, call["args"])
                replies.append(
                    _tool_message(outcome.to_content(), call["id"], outcome.command)
                )
            else:
                result = await tool_service.execute(name, call["args"])
                replies.append(_tool_message(result.to_content(), call["id"]))
        # Arguments that were not even JSON: answered, never run.
        for invalid in message.invalid_tool_calls:
            content = refuse(invalid["name"] or "", INVALID_TOOL_ARGUMENTS)
            replies.append(_tool_message(content, invalid["id"]))
        return {"messages": replies}

    return execute_tools


def _tool_message(
    content: str, call_id: str | None, command: UiCommandModel | None = None
) -> ToolMessage:
    # artifact: kept beside the message for finalize_reply, never sent to the
    # model (langchain_core's documented use of ToolMessage.artifact).
    return ToolMessage(content=content, tool_call_id=call_id or "", artifact=command)


def collected_ui_commands(messages: Sequence[AnyMessage]) -> list[UiCommandModel]:
    """The UI commands accepted in this turn, in call order. Only
    ``execute_tools`` builds tool messages, and it sets an artifact only for
    an accepted presentation call."""
    return [
        message.artifact
        for message in messages
        if isinstance(message, ToolMessage)
        and isinstance(message.artifact, UI_COMMAND_CLASSES)
    ]


def finalize_reply(state: AgentState) -> dict[str, Any]:
    """Check the model's last message and turn it into ``reply``, and
    collect the turn's UI commands into ``ui_commands``.

    The one place model output becomes a typed result. The UI commands were
    already validated one by one when they were called; the response
    validates them again as a batch (agents/service.py).
    """
    if not state["messages"]:
        raise AgentOutputError("no messages")
    message = state["messages"][-1]
    if not isinstance(message, AIMessage):
        raise AgentOutputError("last message is not from the model")
    if message.tool_calls or message.invalid_tool_calls:
        # route_after_model sends a tool request here only once the round
        # limit is spent.
        raise AgentOutputError("model requested tools after the round limit")
    if not isinstance(message.content, str):
        raise AgentOutputError("model reply is not plain text")
    if not message.content.strip():
        raise AgentOutputError("model reply is empty")
    return {
        "reply": message.content,
        "ui_commands": collected_ui_commands(state["messages"]),
    }
