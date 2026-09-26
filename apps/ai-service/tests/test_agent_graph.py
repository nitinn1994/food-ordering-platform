import asyncio
from typing import Any

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.errors import GraphRecursionError

from ai_service.agents.graph import (
    CALL_MODEL,
    EXECUTE_TOOLS,
    FINALIZE_REPLY,
    RECURSION_LIMIT,
    AgentGraph,
    build_agent_graph,
)
from ai_service.agents.nodes import MAX_TOOL_ROUNDS, AgentOutputError
from ai_service.llm.simulated import SIMULATED_REPLY, SimulatedChatModel
from ai_service.ui_commands import (
    PresentationToolService,
    build_presentation_registry,
)
from tests.commerce_fakes import FakeCommerce, presentation_service
from tests.fakes import empty_reply_model


@pytest.fixture
def graph() -> AgentGraph:
    return build_agent_graph(
        SimulatedChatModel(), FakeCommerce().tool_service(), presentation_service()
    )


def run(graph: AgentGraph, recursion_limit: int = RECURSION_LIMIT) -> dict[str, Any]:
    return asyncio.run(
        graph.ainvoke(
            {"messages": [HumanMessage("Hello")]},
            config={"recursion_limit": recursion_limit},
        )
    )


def test_nodes_are_exactly_the_three_planned(graph: AgentGraph) -> None:
    assert set(graph.get_graph().nodes) == {
        "__start__",
        CALL_MODEL,
        EXECUTE_TOOLS,
        FINALIZE_REPLY,
        "__end__",
    }


def test_edges_are_the_bounded_tool_loop(graph: AgentGraph) -> None:
    edges = graph.get_graph().edges

    assert {(e.source, e.target, e.conditional) for e in edges} == {
        ("__start__", CALL_MODEL, False),
        # The one decision: tools, or a reply (Phase 14 plan.md section 16).
        (CALL_MODEL, EXECUTE_TOOLS, True),
        (CALL_MODEL, FINALIZE_REPLY, True),
        (EXECUTE_TOOLS, CALL_MODEL, False),
        (FINALIZE_REPLY, "__end__", False),
    }


def test_recursion_limit_covers_the_longest_turn_and_no_more() -> None:
    # MAX_TOOL_ROUNDS x (call_model + execute_tools) + call_model +
    # finalize_reply, with a margin of two.
    assert RECURSION_LIMIT == 2 * MAX_TOOL_ROUNDS + 2 + 2


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
    graph = build_agent_graph(
        empty_reply_model(), FakeCommerce().tool_service(), presentation_service()
    )

    with pytest.raises(AgentOutputError):
        run(graph)


def test_a_name_in_both_registries_refuses_to_build() -> None:
    # Phase 15 AC8: execute_tools routes by name, so a presentation tool that
    # shadowed a Commerce tool would silently take its calls.
    shadowing = PresentationToolService(
        {"get_cart": build_presentation_registry()["open_cart_panel"]}
    )

    with pytest.raises(ValueError, match="get_cart"):
        build_agent_graph(
            SimulatedChatModel(), FakeCommerce().tool_service(), shadowing
        )
