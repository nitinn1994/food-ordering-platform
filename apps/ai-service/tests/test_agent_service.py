import asyncio
import logging
from typing import Any, cast

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from pydantic import ValidationError

from ai_service.agents.errors import AGENT_FAILED, AgentTurnFailedError
from ai_service.agents.graph import RECURSION_LIMIT, AgentGraph, build_agent_graph
from ai_service.agents.service import MAX_REPLY_LENGTH, AgentResult, AgentService
from ai_service.core.logging import JsonFormatter
from ai_service.llm.simulated import SIMULATED_REPLY, SimulatedChatModel
from tests.fakes import (
    MODEL_EXCEPTION_SENTINEL,
    RaisingChatModel,
    ScriptedChatModel,
    empty_reply_model,
    non_text_reply_model,
    tool_call_model,
)

SENTINEL_MESSAGE = "SENTINEL_MESSAGE_d93a"
REPLY_SENTINEL = "SENTINEL_REPLY_08be"


def service_for(model: BaseChatModel) -> AgentService:
    return AgentService(build_agent_graph(model))


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
    stub = StubGraph({"reply": "ok"})
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
    assert set(fields) == {"outcome", "duration_ms", "message_chars", "reply_chars"}
    assert fields["outcome"] == "ok"
    assert fields["message_chars"] == len(SENTINEL_MESSAGE)
    assert fields["reply_chars"] == len(SIMULATED_REPLY)
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
