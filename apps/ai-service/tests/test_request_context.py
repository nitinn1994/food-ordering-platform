import uuid

import pytest
from fastapi.testclient import TestClient

# One request per response class the service can produce. The 500 case is
# the one that matters most: Starlette sends unhandled-error responses from
# ServerErrorMiddleware, outside every user middleware, which is exactly the
# kind of ordering gap that once left commerce-api's 413 without headers
# (ADR-0013).
RESPONSE_CLASSES = [
    pytest.param("GET", "/health", None, 200, id="200"),
    pytest.param("POST", "/__test/echo", {}, None, id="validation"),
    pytest.param("GET", "/does-not-exist", None, 404, id="404"),
    pytest.param("POST", "/health", None, 405, id="405"),
    pytest.param("GET", "/__test/boom", None, 500, id="500"),
]


@pytest.mark.parametrize(("method", "path", "body", "status"), RESPONSE_CLASSES)
def test_every_response_carries_both_headers(
    fixture_client: TestClient,
    method: str,
    path: str,
    body: object,
    status: int | None,
) -> None:
    response = fixture_client.request(method, path, json=body)

    if status is not None:
        assert response.status_code == status
    else:
        assert response.status_code >= 400
    assert response.headers.get("x-request-id")
    assert response.headers.get("x-correlation-id")


def test_request_id_is_a_fresh_uuid_per_request(client: TestClient) -> None:
    first = client.get("/health").headers["x-request-id"]
    second = client.get("/health").headers["x-request-id"]

    assert first != second
    assert uuid.UUID(first).version == 4


def test_inbound_request_id_is_never_trusted(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-Id": "evil"})

    assert response.headers["x-request-id"] != "evil"


def test_valid_correlation_id_is_echoed(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Correlation-Id": "abc-123"})

    assert response.headers["x-correlation-id"] == "abc-123"


def test_correlation_id_at_the_64_character_bound_is_echoed(
    client: TestClient,
) -> None:
    value = "c" * 64
    response = client.get("/health", headers={"X-Correlation-Id": value})

    assert response.headers["x-correlation-id"] == value


@pytest.mark.parametrize("value", ["", "c" * 65], ids=["empty", "too-long"])
def test_invalid_correlation_id_is_replaced_not_rejected(
    client: TestClient, value: str
) -> None:
    response = client.get("/health", headers={"X-Correlation-Id": value})

    assert response.status_code == 200
    replaced = response.headers["x-correlation-id"]
    assert replaced != value
    assert 1 <= len(replaced) <= 64


# Security review S1: only visible ASCII (0x21-0x7E) is echoed back, since
# the value goes straight into a response header. Anything else - control
# characters, spaces, non-ASCII bytes - is replaced, never rejected.
@pytest.mark.parametrize(
    "value",
    ["abc\x7f", "abc\x01def", "has space", "caf\xe9", "\t"],
    ids=["DEL", "control", "space", "non-ascii", "tab"],
)
def test_correlation_id_with_non_printable_characters_is_replaced(
    client: TestClient, value: str
) -> None:
    response = client.get(
        "/health", headers=[(b"X-Correlation-Id", value.encode("latin-1"))]
    )

    assert response.status_code == 200
    replaced = response.headers["x-correlation-id"]
    assert replaced != value
    assert uuid.UUID(replaced)


def test_every_printable_ascii_character_is_accepted(client: TestClient) -> None:
    value = "".join(chr(c) for c in range(0x21, 0x7F))[:64]
    response = client.get("/health", headers={"X-Correlation-Id": value})

    assert response.headers["x-correlation-id"] == value


def test_missing_correlation_id_is_generated(client: TestClient) -> None:
    response = client.get("/health")

    assert uuid.UUID(response.headers["x-correlation-id"])


def test_500_body_is_static_and_leaks_nothing(fixture_client: TestClient) -> None:
    response = fixture_client.get("/__test/boom")

    assert response.status_code == 500
    assert response.json() == {
        "code": "INTERNAL_ERROR",
        "message": "Internal server error.",
    }
    assert "SENTINEL" not in response.text
    assert "Traceback" not in response.text
