"""The agent graph: ``START -> call_model -> finalize_reply -> END``.

Linear on purpose (plan.md sections 5 and 7): with no tools there is no
decision to route on. The first conditional edge arrives with tools.
tests/test_agent_graph.py pins the nodes and edges, so a change to the shape
is a visible decision.
"""

from langchain_core.language_models import BaseChatModel
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from ai_service.agents.nodes import finalize_reply, make_call_model
from ai_service.agents.state import AgentState

CALL_MODEL = "call_model"
FINALIZE_REPLY = "finalize_reply"

# Passed on every invocation. The graph needs 2 steps; a future accidental
# loop fails fast as GraphRecursionError instead of running to LangGraph's
# default of 25.
RECURSION_LIMIT = 5

AgentGraph = CompiledStateGraph[AgentState, None, AgentState, AgentState]


def build_agent_graph(model: BaseChatModel) -> AgentGraph:
    builder = StateGraph(AgentState)
    builder.add_node(CALL_MODEL, make_call_model(model))
    builder.add_node(FINALIZE_REPLY, finalize_reply)
    builder.add_edge(START, CALL_MODEL)
    builder.add_edge(CALL_MODEL, FINALIZE_REPLY)
    builder.add_edge(FINALIZE_REPLY, END)
    # No checkpointer: every turn is independent, and nothing is remembered
    # (plan.md section 12). The compiled graph holds no per-turn state.
    return builder.compile()
