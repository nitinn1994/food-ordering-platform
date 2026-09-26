from fastapi.testclient import TestClient


def test_health_is_ok_with_exact_body(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
