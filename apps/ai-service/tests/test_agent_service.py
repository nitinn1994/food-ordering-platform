import asyncio
import logging
from typing import Any, cast

import httpx
import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from pydantic import ValidationError

from ai_service.agents.errors import (
    AGENT_BUSY,
    AGENT_FAILED,
    AGENT_TIMEOUT,
    AgentBusyError,
    AgentTurnFailedError,
    AgentTurnTimeoutError,
)
from ai_service.agents.graph import RECURSION_LIMIT, AgentGraph, build_agent_graph
from ai_service.agents.service import MAX_REPLY_LENGTH, AgentResult, AgentService
from ai_service.core.logging import JsonFormatter
from ai_service.llm.simulated import SIMULATED_REPLY, SimulatedChatModel
from tests.commerce_fakes import FakeCommerce, presentation_service
from tests.fakes import (
    MODEL_EXCEPTION_SENTINEL,
    RaisingChatModel,
    ScriptedChatModel,
    SequencedChatModel,
    calls,
    empty_reply_model,
    non_text_reply_model,
    tool_call_model,
)

SENTINEL_MESSAGE = "SENTINEL_MESSAGE_d93a"
REPLY_SENTINEL = "SENTINEL_REPLY_08be"


def service_for(model: BaseChatModel) -> AgentService:
    return AgentService(
        build_agent_graph(model, FakeCommerce().tool_service(), presentation_service())
    )


class StubGraph:
    """Stands in for a compiled graph where a real one cannot produce the
    case under test (cancellation), and records how it was invoked."""

    def __init__(self, result: dict[str, Any] | BaseException) -> None:
        self.result = result
        self.configs: list[dict[str, Any]] = []

    async def ainvoke(self, state: Any, config: dict[str, Any]) -> dict[str, Any]:
        self.configs.append(config)
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


def stub_service(stub: StubGraph) -> AgentService:
    return AgentService(cast(AgentGraph, stub))


def rendered(caplog: pytest.LogCaptureFixture) -> str:
    """Every captured record as the service would write it, exc_info and
    all, so a sentinel anywhere in a line is found."""
    formatter = JsonFormatter()
    return "\n".join(formatter.format(record) for record in caplog.records)


def agent_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == "ai_service.agent"]


# Success


def test_turn_returns_the_simulated_reply() -> None:
    result = asyncio.run(service_for(SimulatedChatModel()).run_turn("Hello"))

    assert result == AgentResult(reply=SIMULATED_REPLY)


def test_turns_are_deterministic() -> None:
    service = service_for(SimulatedChatModel())

    first = asyncio.run(service.run_turn("Hello"))
    second = asyncio.run(service.run_turn("Something else"))

    assert first == second


def test_recursion_limit_is_passed_on_every_turn() -> None:
    stub = StubGraph({"messages": [], "reply": "ok"})
    service = stub_service(stub)

    asyncio.run(service.run_turn("Hello"))
    asyncio.run(service.run_turn("Hello"))

    assert stub.configs == [{"recursion_limit": RECURSION_LIMIT}] * 2


def test_result_is_frozen_and_bounded() -> None:
    result = AgentResult(reply="ok")

    with pytest.raises(ValidationError):
        result.reply = "changed"  # type: ignore[misc]
    with pytest.raises(ValidationError):
        AgentResult(reply="")
    with pytest.raises(ValidationError):
        AgentResult(reply="x" * (MAX_REPLY_LENGTH + 1))


# Failure


FAILING_MODELS = [
    pytest.param(RaisingChatModel(), id="model-raises"),
    pytest.param(empty_reply_model(), id="empty-reply"),
    pytest.param(non_text_reply_model(), id="non-text-reply"),
    pytest.param(tool_call_model(), id="tool-call"),
    pytest.param(
        ScriptedChatModel(reply=AIMessage(REPLY_SENTINEL + "x" * MAX_REPLY_LENGTH)),
        id="reply-too-long",
    ),
]


@pytest.mark.parametrize("model", FAILING_MODELS)
def test_every_failure_becomes_agent_failed(model: BaseChatModel) -> None:
    with pytest.raises(AgentTurnFailedError) as caught:
        asyncio.run(service_for(model).run_turn(SENTINEL_MESSAGE))

    error = caught.value
    assert error.status_code == 500
    assert error.response.to_body() == {
        "code": AGENT_FAILED,
        "message": "The assistant could not process this message.",
    }
    # Raised "from None": the original never travels with it.
    assert error.__cause__ is None
    assert error.__suppress_context__


def test_missing_reply_in_final_state_becomes_agent_failed() -> None:
    with pytest.raises(AgentTurnFailedError):
        asyncio.run(stub_service(StubGraph({"messages": []})).run_turn("Hello"))


def test_cancellation_is_not_swallowed() -> None:
    service = stub_service(StubGraph(asyncio.CancelledError()))

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(service.run_turn("Hello"))


# Logging


def test_success_writes_one_completion_line_without_content(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)

    asyncio.run(service_for(SimulatedChatModel()).run_turn(SENTINEL_MESSAGE))

    [record] = agent_records(caplog)
    assert record.levelno == logging.INFO
    assert record.getMessage() == "agent turn completed"
    fields = record.fields  # type: ignore[attr-defined]
    assert set(fields) == {
        "outcome",
        "duration_ms",
        "message_chars",
        "reply_chars",
        "tool_calls",
        "tool_rounds",
        "ui_commands",
    }
    assert fields["outcome"] == "ok"
    assert fields["message_chars"] == len(SENTINEL_MESSAGE)
    assert fields["reply_chars"] == len(SIMULATED_REPLY)
    # A message matching none of the simulated model's keywords calls no
    # tool and emits no UI command (Phase 15 plan.md OD6).
    assert (fields["tool_calls"], fields["tool_rounds"]) == (0, 0)
    assert fields["ui_commands"] == 0
    assert SENTINEL_MESSAGE not in rendered(caplog)
    assert SIMULATED_REPLY not in rendered(caplog)


@pytest.mark.parametrize("model", FAILING_MODELS)
def test_failure_writes_one_line_with_the_error_type_only(
    caplog: pytest.LogCaptureFixture, model: BaseChatModel
) -> None:
    caplog.set_level(logging.DEBUG)

    with pytest.raises(AgentTurnFailedError):
        asyncio.run(service_for(model).run_turn(SENTINEL_MESSAGE))

    [record] = agent_records(caplog)
    assert record.levelno == logging.WARNING
    assert record.getMessage() == "agent turn failed"
    assert record.exc_info is None
    fields = record.fields  # type: ignore[attr-defined]
    assert set(fields) == {"outcome", "duration_ms", "message_chars", "error_type"}
    assert fields["outcome"] == "failed"
    output = rendered(caplog)
    for sentinel in (SENTINEL_MESSAGE, MODEL_EXCEPTION_SENTINEL, REPLY_SENTINEL):
        assert sentinel not in output
    assert "Traceback" not in output


def test_failure_names_the_exception_class(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)

    with pytest.raises(AgentTurnFailedError):
        asyncio.run(service_for(RaisingChatModel()).run_turn("Hello"))

    [record] = agent_records(caplog)
    assert record.fields["error_type"] == "RuntimeError"  # type: ignore[attr-defined]


# Deadline and capacity (Phase 18, plan.md section 4 AI-7, AI-8; AC11, AC12)


class GatedGraph:
    """Holds every turn open until ``release`` is set, then answers."""

    def __init__(self) -> None:
        self.release = asyncio.Event()
        self.started = 0

    async def ainvoke(self, state: Any, config: dict[str, Any]) -> dict[str, Any]:
        self.started += 1
        await self.release.wait()
        return {"messages": [], "reply": "ok"}


class SleepingGraph:
    def __init__(self, seconds: float, error: BaseException | None = None) -> None:
        self.seconds = seconds
        self.error = error

    async def ainvoke(self, state: Any, config: dict[str, Any]) -> dict[str, Any]:
        await asyncio.sleep(self.seconds)
        if self.error is not None:
            raise self.error
        return {"messages": [], "reply": "ok"}


def test_a_turn_past_its_deadline_is_a_timeout(
    caplog: pytest.LogCaptureFixture,
) -> None:
    service = AgentService(
        cast(AgentGraph, SleepingGraph(5)), turn_timeout_seconds=0.05
    )

    with (
        caplog.at_level(logging.INFO, logger="ai_service.agent"),
        pytest.raises(AgentTurnTimeoutError) as raised,
    ):
        asyncio.run(service.run_turn(SENTINEL_MESSAGE))

    assert raised.value.status_code == 504
    assert raised.value.response.code == AGENT_TIMEOUT
    fields = caplog.records[-1].__dict__["fields"]
    assert fields["outcome"] == "timeout"
    assert SENTINEL_MESSAGE not in rendered(caplog)
    assert service.turns_in_flight == 0


def test_a_timeout_error_from_inside_the_graph_is_a_failure_not_a_timeout() -> None:
    service = AgentService(
        cast(AgentGraph, SleepingGraph(0, TimeoutError())), turn_timeout_seconds=5
    )

    with pytest.raises(AgentTurnFailedError):
        asyncio.run(service.run_turn("Hello"))


def test_no_tool_call_starts_after_the_deadline() -> None:
    # The model asks for two sequential cart reads; the first hangs past the
    # deadline, so the second must never be sent.
    async def hang(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        raise AssertionError("unreachable")

    commerce = FakeCommerce().on("GET", "/v1/cart", hang)
    model = SequencedChatModel(replies=[calls(("get_cart", {}), ("get_cart", {}))])

    async def turn() -> None:
        async with commerce.http_client() as http:
            graph = build_agent_graph(
                model, commerce.tool_service(http), presentation_service()
            )
            await AgentService(graph, turn_timeout_seconds=0.1).run_turn("cart?")

    with pytest.raises(AgentTurnTimeoutError):
        asyncio.run(turn())
    assert len(commerce.requests) == 1


def test_turns_over_capacity_are_refused_without_running_the_graph(
    caplog: pytest.LogCaptureFixture,
) -> None:
    graph = GatedGraph()
    service = AgentService(cast(AgentGraph, graph), max_concurrent_turns=2)

    async def scenario() -> None:
        running = [asyncio.create_task(service.run_turn("a")) for _ in range(2)]
        await asyncio.sleep(0)
        assert service.turns_in_flight == 2
        with (
            caplog.at_level(logging.INFO, logger="ai_service.agent"),
            pytest.raises(AgentBusyError) as raised,
        ):
            await service.run_turn(SENTINEL_MESSAGE)
        assert raised.value.status_code == 503
        assert raised.value.response.code == AGENT_BUSY
        assert graph.started == 2
        graph.release.set()
        await asyncio.gather(*running)
        # Capacity comes back once turns finish.
        assert service.turns_in_flight == 0
        assert (await service.run_turn("b")).reply == "ok"

    asyncio.run(scenario())
    assert caplog.records[-1].__dict__["fields"]["outcome"] == "busy"
    assert SENTINEL_MESSAGE not in rendered(caplog)


def test_capacity_is_released_after_a_failed_turn() -> None:
    service = AgentService(
        cast(AgentGraph, SleepingGraph(0, RuntimeError("x"))), max_concurrent_turns=1
    )

    for _ in range(3):
        with pytest.raises(AgentTurnFailedError):
            asyncio.run(service.run_turn("Hello"))
    assert service.turns_in_flight == 0
