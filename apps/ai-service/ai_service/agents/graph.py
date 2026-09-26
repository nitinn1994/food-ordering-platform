"""The agent graph (Phase 14 plan.md sections 16 and 17):

    START -> call_model --(tool calls, rounds left)--> execute_tools -> call_model
                        \\--(otherwise)--------------> finalize_reply -> END

The first conditional edge, which Phase 13 reserved for tools. The loop is
bounded three ways: MAX_TOOL_ROUNDS (routing), MAX_TOOL_CALLS_PER_TURN
(execute_tools), and RECURSION_LIMIT as LangGraph's backstop.
tests/test_agent_graph.py pins the nodes and edges, so a change to the shape
is a visible decision.
"""

from langchain_core.language_models import BaseChatModel
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from ai_service.agents.nodes import (
    EXECUTE_TOOLS,
    FINALIZE_REPLY,
    MAX_TOOL_ROUNDS,
    finalize_reply,
    make_call_model,
    make_execute_tools,
    route_after_model,
)
from ai_service.agents.state import AgentState
from ai_service.tools.service import ToolService

CALL_MODEL = "call_model"

__all__ = [
    "CALL_MODEL",
    "EXECUTE_TOOLS",
    "FINALIZE_REPLY",
    "RECURSION_LIMIT",
    "AgentGraph",
    "build_agent_graph",
]

# Passed on every invocation. A full turn is at most MAX_TOOL_ROUNDS x
# (call_model + execute_tools), then call_model and finalize_reply: 10 steps.
# Anything beyond that is a bug, and fails fast as GraphRecursionError
# instead of running to LangGraph's default of 25.
RECURSION_LIMIT = 2 * MAX_TOOL_ROUNDS + 4

AgentGraph = CompiledStateGraph[AgentState, None, AgentState, AgentState]


def build_agent_graph(model: BaseChatModel, tool_service: ToolService) -> AgentGraph:
    builder = StateGraph(AgentState)
    builder.add_node(CALL_MODEL, make_call_model(model, tool_service.tool_schemas()))
    builder.add_node(EXECUTE_TOOLS, make_execute_tools(tool_service))
    builder.add_node(FINALIZE_REPLY, finalize_reply)
    builder.add_edge(START, CALL_MODEL)
    builder.add_conditional_edges(
        CALL_MODEL, route_after_model, [EXECUTE_TOOLS, FINALIZE_REPLY]
    )
    builder.add_edge(EXECUTE_TOOLS, CALL_MODEL)
    builder.add_edge(FINALIZE_REPLY, END)
    # No checkpointer: every turn is independent, and nothing is remembered
    # (Phase 13 plan.md section 12). The compiled graph holds no per-turn
    # state.
    return builder.compile()
