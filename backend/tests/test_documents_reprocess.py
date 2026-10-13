"""US-013-2: POST /documents/{id}/reprocess -- retry and re-index
(AC-031/AC-032), and repeated indexing failure retention (AC-033).

The router hands both modes off to `app/worker.py`'s `enqueue_processing`
/ `enqueue_reindexing` -- the documented seam -- which no-ops under pytest.
Each test here monkeypatches `app.routers.documents.enqueue_processing` /
`enqueue_reindexing` (the names imported into that module) to call
`process_document` / `reindex_document` synchronously, so the pipeline
actually runs within the request. A fake `EmbeddingProvider` stands in for
the real one throughout -- never a real provider call -- the same
technique `test_documents_delete.py` and `test_embedding.py` use.
`STORAGE_DIR` is redirected to a pytest tmp directory so nothing here
touches real AWS.
"""

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.routers.documents as documents_router
import app.worker as worker_module
from app.database import Base, SessionLocal, engine
from app.embedding import EmbeddingProviderError, index_document as _real_index_document
from app.main import app
from app.models import Chunk, Document, User
from app.security import hash_password
from app.worker import process_document, reindex_document

_PASSWORD = "ReprocessSeedPass123!"


class _FakeEmbeddingProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 768 for _ in texts]


class _AlwaysFailingProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise EmbeddingProviderError("simulated persistent provider outage")


@pytest.fixture(autouse=True)
def _fast_retries(monkeypatch):
    import app.embedding as embedding_module

    monkeypatch.setattr(embedding_module.time, "sleep", lambda _s: None)
    monkeypatch.setenv("EMBEDDING_MAX_RETRIES", "1")


@pytest.fixture(autouse=True)
def _synchronous_reprocess(monkeypatch):
    """Router-level seam: reprocess normally hands off to a background
    thread that no-ops under pytest. Running it synchronously here lets
    each test observe the pipeline's outcome within the request."""
    monkeypatch.setattr(documents_router, "enqueue_processing", process_document)
    monkeypatch.setattr(documents_router, "enqueue_reindexing", reindex_document)


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
    email = _unique_email("reprocess-admin")
    _seed_user(email, role="admin")
    client = _fresh_client()
    assert _login(client, email).status_code == 200
    return client


def _patch_index_document(monkeypatch, provider) -> None:
    def _patched(db, document, provider_arg=None):
        return _real_index_document(db, document, provider=provider_arg or provider)

    monkeypatch.setattr(worker_module, "index_document", _patched)


def _document_row(document_id):
    with SessionLocal() as db:
        return db.query(Document).filter(Document.id == document_id).first()


def _chunk_ids(document_id) -> set:
    with SessionLocal() as db:
        return {
            row.id for row in db.query(Chunk.id).filter(Chunk.document_id == document_id).all()
        }


# --------------------------------------------------------------------- #
# AC-031: retry on a Failed document re-runs the pipeline from the stored
# file and returns it to processing (observed here as the pipeline's
# synchronous outcome, 'ready').
# --------------------------------------------------------------------- #


def test_retry_on_a_failed_document_reruns_the_pipeline_from_the_stored_file(monkeypatch) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    client = _admin_client()
    created = client.post(
        "/documents", files={"file": ("retry-me.txt", b"some real recoverable body text", "text/plain")}
    ).json()
    doc_id = uuid.UUID(created["id"])

    # Simulate a prior failed attempt: a stale chunk and a failure_reason,
    # with status 'failed' -- exactly what a real failed run would leave.
    with SessionLocal() as db:
        document = db.query(Document).filter(Document.id == doc_id).one()
        document.status = "failed"
        document.failure_reason = "a previous attempt's failure reason"
        db.add(document)
        stale_chunk = Chunk(document_id=doc_id, chunk_index=0, content="stale leftover content")
        db.add(stale_chunk)
        db.commit()
    stale_chunk_ids = _chunk_ids(doc_id)
    assert len(stale_chunk_ids) == 1

    response = client.post(f"/documents/{created['id']}/reprocess", json={"mode": "retry"})

    assert response.status_code == 200
    reloaded = _document_row(doc_id)
    assert reloaded.status == "ready"  # the pipeline re-ran to completion
    assert reloaded.failure_reason is None

    new_chunk_ids = _chunk_ids(doc_id)
    assert new_chunk_ids  # freshly produced, non-empty
    assert new_chunk_ids.isdisjoint(stale_chunk_ids)  # the stale chunk was cleared, not kept


def test_retry_is_rejected_with_409_when_the_document_is_not_currently_failed() -> None:
    client = _admin_client()
    created = client.post(
        "/documents", files={"file": ("still-processing.txt", b"left alone", "text/plain")}
    ).json()

    response = client.post(f"/documents/{created['id']}/reprocess", json={"mode": "retry"})

    assert response.status_code == 409


def test_reprocess_requires_admin_and_a_known_id() -> None:
    admin_client = _admin_client()
    created = admin_client.post(
        "/documents", files={"file": ("guarded.txt", b"guarded body", "text/plain")}
    ).json()

    anon_response = _fresh_client().post(
        f"/documents/{created['id']}/reprocess", json={"mode": "retry"}
    )
    assert anon_response.status_code == 401

    standard_email = _unique_email("reprocess-standard")
    _seed_user(standard_email, role="user")
    standard_client = _fresh_client()
    assert _login(standard_client, standard_email).status_code == 200
    forbidden = standard_client.post(
        f"/documents/{created['id']}/reprocess", json={"mode": "retry"}
    )
    assert forbidden.status_code == 403

    unknown_response = admin_client.post(
        f"/documents/{uuid.uuid4()}/reprocess", json={"mode": "retry"}
    )
    assert unknown_response.status_code == 404


# --------------------------------------------------------------------- #
# AC-032: re-index on a Ready document rebuilds chunks and vectors while
# the document stays queryable throughout.
# --------------------------------------------------------------------- #


def test_reindex_on_a_ready_document_rebuilds_chunks_and_stays_queryable(monkeypatch) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    client = _admin_client()
    created = client.post(
        "/documents", files={"file": ("reindex-me.txt", b"some real reindexable body text", "text/plain")}
    ).json()
    doc_id = uuid.UUID(created["id"])
    process_document(doc_id)  # -> 'ready' with its first generation of chunks
    assert _document_row(doc_id).status == "ready"
    original_chunk_ids = _chunk_ids(doc_id)
    assert original_chunk_ids

    response = client.post(f"/documents/{created['id']}/reprocess", json={"mode": "reindex"})

    assert response.status_code == 200
    reloaded = _document_row(doc_id)
    assert reloaded.status == "ready"  # stays queryable: never left 'processing' or 'failed'

    rebuilt_chunk_ids = _chunk_ids(doc_id)
    assert rebuilt_chunk_ids  # a new, non-empty generation of chunks exists
    assert rebuilt_chunk_ids.isdisjoint(original_chunk_ids)  # the old generation is gone

    # The document is listed and still reports a chunk count after reindex.
    listing = client.get("/documents")
    matching = next(r for r in listing.json() if r["id"] == created["id"])
    assert matching["status"] == "ready"
    assert matching["chunk_count"] == len(rebuilt_chunk_ids)


def test_reindex_is_rejected_with_409_when_the_document_is_not_currently_ready() -> None:
    client = _admin_client()
    created = client.post(
        "/documents", files={"file": ("still-processing-2.txt", b"left alone", "text/plain")}
    ).json()

    response = client.post(f"/documents/{created['id']}/reprocess", json={"mode": "reindex"})

    assert response.status_code == 409


# --------------------------------------------------------------------- #
# AC-033: repeated indexing failure leaves the document Failed with file,
# row and reason retained -- never auto-deleted.
# --------------------------------------------------------------------- #


def test_repeated_indexing_failure_leaves_the_document_failed_with_everything_retained(
    monkeypatch, _local_storage
) -> None:
    _patch_index_document(monkeypatch, _AlwaysFailingProvider())
    client = _admin_client()
    created = client.post(
        "/documents",
        files={"file": ("perpetually-failing.txt", b"some real body text to chunk", "text/plain")},
    ).json()
    doc_id = uuid.UUID(created["id"])

    with SessionLocal() as db:
        s3_key = db.query(Document).filter(Document.id == doc_id).one().s3_key
    stored_path = _local_storage / s3_key

    # First attempt.
    process_document(doc_id)
    first = _document_row(doc_id)
    assert first.status == "failed"
    assert first.failure_reason
    assert stored_path.exists()

    # Retry through the real endpoint -- fails again, every single time,
    # and nothing is ever deleted across repeated failures.
    for _ in range(3):
        retry_response = client.post(
            f"/documents/{created['id']}/reprocess", json={"mode": "retry"}
        )
        assert retry_response.status_code == 200
        reloaded = _document_row(doc_id)
        assert reloaded.status == "failed"
        assert reloaded.failure_reason
        assert stored_path.exists()  # the stored object is never removed

    final_listing = client.get("/documents", params={"status": "failed"})
    assert created["id"] in [r["id"] for r in final_listing.json()]
