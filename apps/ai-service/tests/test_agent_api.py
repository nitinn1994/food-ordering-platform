import io
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from ai_service.config import Settings
from ai_service.llm.simulated import SIMULATED_REPLY
from ai_service.main import create_app
from ai_service.schemas.agent import MAX_TURN_MESSAGE_LENGTH
from tests.conftest import AgentClientFactory as AgentClient
from tests.fakes import MODEL_EXCEPTION_SENTINEL, RaisingChatModel, ScriptedChatModel

PATH = "/v1/agent/turns"
SENTINEL_MESSAGE = "SENTINEL_MESSAGE_6f14"


def log_lines(stream: io.StringIO) -> list[dict[str, Any]]:
    return [json.loads(line) for line in stream.getvalue().splitlines() if line]


# Success


def test_turn_returns_the_simulated_reply(client: TestClient) -> None:
    response = client.post(PATH, json={"message": "Hello"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"reply": SIMULATED_REPLY}
    assert response.headers["x-request-id"]
    assert response.headers["x-correlation-id"]


def test_injected_service_is_the_one_used(agent_client: AgentClient) -> None:
    client = agent_client(ScriptedChatModel(reply=AIMessage("scripted reply")))

    response = client.post(PATH, json={"message": "Hello"})

    assert response.json() == {"reply": "scripted reply"}


def test_each_app_builds_its_own_service(settings: Settings) -> None:
    first, second = create_app(settings), create_app(settings)

    assert first.state.agent_service is not second.state.agent_service


def test_message_at_the_length_limit_is_accepted(client: TestClient) -> None:
    response = client.post(PATH, json={"message": "x" * MAX_TURN_MESSAGE_LENGTH})

    assert response.status_code == 200


# Validation


@pytest.mark.parametrize(
    ("body", "field", "error_type"),
    [
        pytest.param({}, "message", "missing", id="missing"),
        pytest.param({"message": None}, "message", "string_type", id="null"),
        pytest.param({"message": 42}, "message", "string_type", id="number"),
        pytest.param({"message": ""}, "message", "string_too_short", id="empty"),
        pytest.param(
            {"message": " \t\n "},
            "message",
            "string_pattern_mismatch",
            id="whitespace",
        ),
        pytest.param(
            {"message": "x" * (MAX_TURN_MESSAGE_LENGTH + 1)},
            "message",
            "string_too_long",
            id="too-long",
        ),
        pytest.param(
            {"message": "Hello", "conversationId": "c1"},
            "conversationId",
            "extra_forbidden",
            id="unknown-key",
        ),
    ],
)
def test_invalid_body_is_400(
    client: TestClient, body: dict[str, Any], field: str, error_type: str
) -> None:
    response = client.post(PATH, json=body)

    assert response.status_code == 400
    assert response.json() == {
        "code": "INVALID_PAYLOAD",
        "message": f"{field}: {error_type}",
        "field": field,
    }


def test_rejected_value_is_never_echoed(client: TestClient) -> None:
    long_message = SENTINEL_MESSAGE + "x" * MAX_TURN_MESSAGE_LENGTH

    response = client.post(PATH, json={"message": long_message})

    assert response.status_code == 400
    assert SENTINEL_MESSAGE not in response.text


def test_other_methods_are_405(client: TestClient) -> None:
    response = client.get(PATH)

    assert response.status_code == 405
    assert response.json()["code"] == "METHOD_NOT_ALLOWED"


# Failure


def test_agent_failure_is_a_safe_500(agent_client: AgentClient) -> None:
    client = agent_client(RaisingChatModel())

    response = client.post(PATH, json={"message": SENTINEL_MESSAGE})

    assert response.status_code == 500
    assert response.json() == {
        "code": "AGENT_FAILED",
        "message": "The assistant could not process this message.",
    }
    assert response.headers["x-request-id"]
    for leaked in (SENTINEL_MESSAGE, MODEL_EXCEPTION_SENTINEL, "Traceback"):
        assert leaked not in response.text


def test_health_does_not_depend_on_the_agent(agent_client: AgentClient) -> None:
    client = agent_client(RaisingChatModel())

    assert client.get("/health").json() == {"status": "ok"}


# Logging


def test_turn_log_line_carries_the_request_ids_and_no_content(
    client: TestClient, log_stream: io.StringIO
) -> None:
    response = client.post(
        PATH, json={"message": SENTINEL_MESSAGE}, headers={"X-Correlation-Id": "c-1"}
    )

    entries = log_lines(log_stream)
    [turn] = [e for e in entries if e["message"] == "agent turn completed"]
    assert turn["logger"] == "ai_service.agent"
    assert turn["request_id"] == response.headers["x-request-id"]
    assert turn["correlation_id"] == "c-1"
    assert turn["outcome"] == "ok"
    assert [e["path"] for e in entries if e["message"] == "request completed"] == [PATH]
    output = log_stream.getvalue()
    assert SENTINEL_MESSAGE not in output
    assert SIMULATED_REPLY not in output


def test_failed_turn_logs_no_content_and_no_traceback(
    agent_client: AgentClient, log_stream: io.StringIO
) -> None:
    client = agent_client(RaisingChatModel())

    client.post(PATH, json={"message": SENTINEL_MESSAGE})

    entries = log_lines(log_stream)
    [turn] = [e for e in entries if e["message"] == "agent turn failed"]
    assert turn["error_type"] == "RuntimeError"
    assert "exc_info" not in turn
    output = log_stream.getvalue()
    for leaked in (SENTINEL_MESSAGE, MODEL_EXCEPTION_SENTINEL, "Traceback"):
        assert leaked not in output
