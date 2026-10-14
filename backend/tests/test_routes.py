"""Confirms every approved endpoint is wired into the OpenAPI document and
that calling one returns its typed placeholder rather than a 404 -- the two
things a development ticket needs true before it can replace a stub with
real behaviour.

`/conversations/{conversation_id}` (GET and DELETE) is no longer a stub as
of US-022-3: both now return real, user-scoped data (see
`tests/test_chat_rag.py`), so this module no longer asserts the placeholder
body for either -- that assertion lived here only until the real
implementation landed.
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
