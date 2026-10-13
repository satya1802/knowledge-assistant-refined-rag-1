"""Confirms every approved endpoint is wired into the OpenAPI document and
that calling one returns its typed placeholder rather than a 404 -- the two
things a development ticket needs true before it can replace a stub with
real behaviour.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

EXPECTED_PATHS = {
    "/auth/login",
    "/auth/logout",
    "/auth/me",
    "/users",
    "/users/{user_id}",
    "/account/password",
    "/account/theme",
    "/documents",
    "/documents/stats",
    "/documents/{document_id}/download",
    "/documents/{document_id}/reprocess",
    "/documents/{document_id}",
    "/conversations",
    "/conversations/{conversation_id}",
    "/chat",
    "/settings",
}


def test_every_approved_endpoint_is_registered() -> None:
    paths = set(client.get("/openapi.json").json()["paths"])

    assert EXPECTED_PATHS <= paths


def test_a_stub_route_returns_its_placeholder() -> None:
    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json() == {
        "endpoint": "GET /auth/me",
        "status": "not_implemented",
        "detail": "Scaffolded from the approved API spec; no behaviour yet.",
    }


def test_a_no_content_route_returns_no_body() -> None:
    response = client.post("/auth/logout")

    assert response.status_code == 204
    assert response.content == b""
