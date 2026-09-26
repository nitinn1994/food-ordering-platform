import asyncio
from typing import Any

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.errors import GraphRecursionError

from ai_service.agents.graph import (
    CALL_MODEL,
    FINALIZE_REPLY,
    RECURSION_LIMIT,
    AgentGraph,
    build_agent_graph,
)
from ai_service.agents.nodes import AgentOutputError
from ai_service.llm.simulated import SIMULATED_REPLY, SimulatedChatModel
from tests.fakes import empty_reply_model


@pytest.fixture
def graph() -> AgentGraph:
    return build_agent_graph(SimulatedChatModel())


def run(graph: AgentGraph, recursion_limit: int = RECURSION_LIMIT) -> dict[str, Any]:
    return asyncio.run(
        graph.ainvoke(
            {"messages": [HumanMessage("Hello")]},
            config={"recursion_limit": recursion_limit},
        )
    )


def test_nodes_are_exactly_the_two_planned(graph: AgentGraph) -> None:
    assert set(graph.get_graph().nodes) == {
        "__start__",
        CALL_MODEL,
        FINALIZE_REPLY,
        "__end__",
    }


def test_edges_are_linear_and_unconditional(graph: AgentGraph) -> None:
    edges = graph.get_graph().edges

    assert {(e.source, e.target) for e in edges} == {
        ("__start__", CALL_MODEL),
        (CALL_MODEL, FINALIZE_REPLY),
        (FINALIZE_REPLY, "__end__"),
    }
    assert not any(e.conditional for e in edges)


def test_compiled_without_a_checkpointer(graph: AgentGraph) -> None:
    assert graph.checkpointer is None


def test_one_turn_appends_the_reply_and_sets_it(graph: AgentGraph) -> None:
    final = run(graph)

    assert [type(m) for m in final["messages"]] == [HumanMessage, AIMessage]
    assert final["reply"] == SIMULATED_REPLY


def test_turns_are_independent(graph: AgentGraph) -> None:
    first, second = run(graph), run(graph)

    # Nothing carried over: no checkpointer, no memory.
    assert len(first["messages"]) == len(second["messages"]) == 2


def test_recursion_limit_is_enforced(graph: AgentGraph) -> None:
    with pytest.raises(GraphRecursionError):
        run(graph, recursion_limit=1)


def test_node_failure_propagates_out_of_the_graph() -> None:
    graph = build_agent_graph(empty_reply_model())

    with pytest.raises(AgentOutputError):
        run(graph)
