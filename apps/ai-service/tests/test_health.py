from fastapi.testclient import TestClient

from tests.commerce_fakes import FakeCommerce
from tests.conftest import AgentClientFactory
from tests.fakes import RaisingChatModel


def test_health_is_ok_with_exact_body(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# Readiness (Phase 18, plan.md AC13, OD2)


def test_ready_with_exact_body(client: TestClient) -> None:
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_ready_never_calls_commerce_api_or_the_model(
    agent_client: AgentClientFactory,
) -> None:
    # An empty FakeCommerce records every request; a raising model fails any
    # turn. Neither may be touched.
    commerce = FakeCommerce()
    client = agent_client(RaisingChatModel(), commerce)

    assert client.get("/health/ready").status_code == 200
    assert commerce.requests == []
