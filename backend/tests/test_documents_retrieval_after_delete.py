"""US-013-2: a deleted document's chunks are never returned by the
retrieval query path and can never be cited (AC-030).

`POST /chat` retrieval (US-022/US-024) is still a stub -- the actual
query-by-embedding path does not exist in this codebase yet (see
`app/routers/chat.py`'s docstring). What *does* exist, and is the seam any
future retrieval implementation must use, is `app/models.py`'s `Chunk`
table and `app/chunking.py`'s `citation_from_chunk`: this test drives a
document to 'ready' with real, embedded chunks, captures a chunk id a
citation would be built from, deletes the document through the real
`DELETE /documents/{id}` endpoint, and then proves that same chunk id is
no longer resolvable by the query shape any retrieval path would use
(`Chunk.id == ...` / `Chunk.document_id == ...`) -- so it can never be
cited. `STORAGE_DIR` is redirected to a pytest tmp directory; a fake
embedding provider stands in for the real one, the same technique
test_documents_delete.py and test_embedding.py use.
"""

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.worker as worker_module
from app.chunking import citation_from_chunk
from app.database import Base, SessionLocal, engine
from app.embedding import index_document as _real_index_document
from app.main import app
from app.models import Chunk, Document, User
from app.security import hash_password
from app.worker import process_document

_PASSWORD = "RetrievalSeedPass123!"


class _FakeEmbeddingProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 768 for _ in texts]


@pytest.fixture(autouse=True)
def _fake_embedding_provider(monkeypatch):
    def _patched_index_document(db, document, provider=None):
        return _real_index_document(db, document, provider=provider or _FakeEmbeddingProvider())

    monkeypatch.setattr(worker_module, "index_document", _patched_index_document)


@pytest.fixture(autouse=True)
def _local_storage(tmp_path, monkeypatch) -> Path:
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path))
    return tmp_path


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_user(email: str, *, role: str = "user") -> User:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(email=email, password_hash=hash_password(_PASSWORD), role=role)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _login(client: TestClient, email: str, password: str = _PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def _fresh_client() -> TestClient:
    return TestClient(app)


def _admin_client() -> TestClient:
    email = _unique_email("retrieval-admin")
    _seed_user(email, role="admin")
    client = _fresh_client()
    assert _login(client, email).status_code == 200
    return client


def test_a_chunk_belonging_to_a_deleted_document_is_no_longer_queryable_or_citable() -> None:
    client = _admin_client()
    created = client.post(
        "/documents",
        files={"file": ("citeable-then-deleted.txt", b"some real citeable body text", "text/plain")},
    ).json()
    doc_id = uuid.UUID(created["id"])
    process_document(doc_id)  # drives it to 'ready' with real, embedded chunks

    with SessionLocal() as db:
        document = db.query(Document).filter(Document.id == doc_id).one()
        assert document.status == "ready"
        chunk = db.query(Chunk).filter(Chunk.document_id == doc_id).first()
        assert chunk is not None
        chunk_id = chunk.id
        # Sanity: before deletion, this chunk resolves to a real citation.
        citation = citation_from_chunk(chunk)
        assert citation["document_id"] == doc_id

    delete_response = client.delete(f"/documents/{created['id']}")
    assert delete_response.status_code == 204

    with SessionLocal() as db:
        # The exact query shape a retrieval path uses to resolve a
        # candidate chunk id to a citation: it must now find nothing.
        assert db.query(Chunk).filter(Chunk.id == chunk_id).first() is None
        # And the broader per-document query any retrieval/filter step
        # would run returns nothing for this document either.
        assert db.query(Chunk).filter(Chunk.document_id == doc_id).count() == 0
        assert db.query(Document).filter(Document.id == doc_id).first() is None
