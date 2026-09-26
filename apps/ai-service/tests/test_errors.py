import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from ai_service.core.errors import AiServiceError
from ai_service.schemas.errors import (
    MAX_CODE_LENGTH,
    MAX_FIELD_LENGTH,
    MAX_MESSAGE_LENGTH,
    ErrorResponse,
)
from tests.fixtures_routes import EXCEPTION_SENTINEL

# The committed, freshness-tested artifact generated from @contracts/common's
# Zod source (ADR-0012). Read from the repository, not copied, so a change
# to the shared contract fails this suite.
CONTRACT_ERROR_SCHEMA_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages/contracts/common/schema/error.v1.json"
)
INPUT_SENTINEL = "SENTINEL_INPUT_e83d"


@pytest.fixture(scope="module")
def contract_schema() -> dict[str, Any]:
    assert CONTRACT_ERROR_SCHEMA_PATH.is_file(), (
        f"shared contract schema missing: {CONTRACT_ERROR_SCHEMA_PATH}"
    )
    schema: dict[str, Any] = json.loads(CONTRACT_ERROR_SCHEMA_PATH.read_text())
    Draft202012Validator.check_schema(schema)
    return schema


def assert_contract_error(body: Any, schema: dict[str, Any]) -> None:
    Draft202012Validator(schema).validate(body)


ERROR_CASES = [
    pytest.param("GET", "/does-not-exist", None, 404, "ROUTE_NOT_FOUND", id="404"),
    pytest.param("POST", "/health", None, 405, "METHOD_NOT_ALLOWED", id="405"),
    pytest.param("POST", "/__test/echo", {}, 400, "INVALID_PAYLOAD", id="400-body"),
    pytest.param(
        "GET", "/__test/query?limit=x", None, 400, "INVALID_PAYLOAD", id="400-query"
    ),
    pytest.param("GET", "/__test/teapot", None, 418, "HTTP_ERROR", id="other-http"),
    pytest.param(
        "GET",
        "/__test/nonstandard-status",
        None,
        499,
        "HTTP_ERROR",
        id="non-enum-http",
    ),
    pytest.param(
        "GET", "/__test/service-error", None, 409, "TEST_FAILURE", id="service"
    ),
    pytest.param("GET", "/__test/boom", None, 500, "INTERNAL_ERROR", id="500"),
]


@pytest.mark.parametrize(("method", "path", "body", "status", "code"), ERROR_CASES)
def test_every_error_is_a_contract_error(
    fixture_client: TestClient,
    contract_schema: dict[str, Any],
    method: str,
    path: str,
    body: object,
    status: int,
    code: str,
) -> None:
    response = fixture_client.request(method, path, json=body)

    assert response.status_code == status
    assert response.headers["content-type"] == "application/json"
    assert response.json()["code"] == code
    assert_contract_error(response.json(), contract_schema)


def test_error_model_bounds_match_the_shared_contract(
    contract_schema: dict[str, Any],
) -> None:
    ours = ErrorResponse.model_json_schema()["properties"]
    theirs = contract_schema["properties"]

    assert contract_schema["required"] == ["code", "message"]
    assert theirs["code"]["maxLength"] == MAX_CODE_LENGTH
    assert theirs["code"]["pattern"] == ours["code"]["pattern"]
    assert theirs["message"]["maxLength"] == MAX_MESSAGE_LENGTH
    assert theirs["field"]["maxLength"] == MAX_FIELD_LENGTH
    assert set(ours) <= set(theirs)


def test_missing_body_field_names_it(fixture_client: TestClient) -> None:
    response = fixture_client.post("/__test/echo", json={})

    assert response.json() == {
        "code": "INVALID_PAYLOAD",
        "message": "text: missing",
        "field": "text",
    }


def test_query_field_keeps_its_location(fixture_client: TestClient) -> None:
    response = fixture_client.get("/__test/query?limit=x")

    assert response.json()["field"] == "query.limit"


def test_rejected_value_is_never_echoed(fixture_client: TestClient) -> None:
    response = fixture_client.post("/__test/echo", json={"text": INPUT_SENTINEL})

    assert response.status_code == 400
    assert response.json()["field"] == "text"
    assert INPUT_SENTINEL not in response.text


def test_unknown_key_is_rejected_and_field_is_bounded(
    fixture_client: TestClient, contract_schema: dict[str, Any]
) -> None:
    long_key = "k" * 100
    response = fixture_client.post("/__test/echo", json={"text": "ok", long_key: 1})

    body = response.json()
    assert response.status_code == 400
    assert body["field"] == "k" * MAX_FIELD_LENGTH
    assert len(body["message"]) <= MAX_MESSAGE_LENGTH
    assert_contract_error(body, contract_schema)


def test_malformed_json_has_no_field(
    fixture_client: TestClient, contract_schema: dict[str, Any]
) -> None:
    response = fixture_client.post(
        "/__test/echo",
        content=b'{"text": ',
        headers={"content-type": "application/json"},
    )

    body = response.json()
    assert response.status_code == 400
    assert body["code"] == "INVALID_PAYLOAD"
    assert "field" not in body
    assert_contract_error(body, contract_schema)


def test_405_keeps_the_allow_header(fixture_client: TestClient) -> None:
    response = fixture_client.post("/health")

    assert response.headers["allow"] == "GET"


def test_http_exception_detail_is_never_returned(
    fixture_client: TestClient,
) -> None:
    response = fixture_client.get("/__test/teapot")

    assert response.json() == {"code": "HTTP_ERROR", "message": "I'm a Teapot"}
    assert EXCEPTION_SENTINEL not in response.text


def test_non_enum_status_keeps_its_status_and_a_static_phrase(
    fixture_client: TestClient,
) -> None:
    response = fixture_client.get("/__test/nonstandard-status")

    assert response.status_code == 499
    assert response.json() == {"code": "HTTP_ERROR", "message": "HTTP error."}
    assert EXCEPTION_SENTINEL not in response.text


def test_unhandled_exception_leaks_nothing(fixture_client: TestClient) -> None:
    response = fixture_client.get("/__test/boom")

    assert response.json() == {
        "code": "INTERNAL_ERROR",
        "message": "Internal server error.",
    }
    assert EXCEPTION_SENTINEL not in response.text
    assert "Traceback" not in response.text


def test_service_error_rejects_a_malformed_code() -> None:
    with pytest.raises(ValueError, match="code"):
        AiServiceError(code="not-a-code", message="x", status_code=400)
