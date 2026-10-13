"""US-010-3: DELETE /documents/{id}, stats consistency and failure
retention.

Covers AC-020 (a document whose processing raises leaves status 'failed'
with a non-empty failure_reason, and both the Document row and its stored
object survive), AC-023/AC-024 (GET /documents/stats matches the rows
actually present after an upload and after a delete), AC-025/AC-026 (GET
/documents filtering: q matches filename case-insensitively, and
status + type + q combine as an AND) and the DELETE contract itself (204 +
cascading removal, 401/403/404).

Each test seeds its own user(s) directly against the ORM and uses a fresh
TestClient per actor, the established pattern in this suite (see
test_documents_upload.py). `STORAGE_DIR` is redirected to a pytest tmp
directory so nothing here touches real AWS, and the worker pipeline is
driven directly via `process_document(...)` -- never a real thread.
"""

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Chunk, Document, User
from app.security import hash_password
from app.worker import process_document

_PASSWORD = "DeleteSeedPass123!"


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


def _admin_client() -> tuple[TestClient, User]:
    email = _unique_email("del-admin")
    admin = _seed_user(email, role="admin")
    client = _fresh_client()
    assert _login(client, email).status_code == 200
    return client, admin


def _chunk_count(document_id) -> int:
    with SessionLocal() as db:
        return db.query(Chunk).filter(Chunk.document_id == document_id).count()


def _document_row(document_id):
    with SessionLocal() as db:
        return db.query(Document).filter(Document.id == document_id).first()


# --------------------------------------------------------------------- #
# DELETE contract: 204 + cascading removal, and no longer listed
# --------------------------------------------------------------------- #


def test_admin_delete_returns_204_removes_the_row_and_its_chunks_and_drops_from_the_listing() -> (
    None
):
    client, _ = _admin_client()
    created = client.post(
        "/documents", files={"file": ("to-delete.txt", b"some real body text", "text/plain")}
    ).json()
    doc_id = uuid.UUID(created["id"])
    process_document(doc_id)  # drives it to 'ready' with persisted chunks
    assert _chunk_count(doc_id) > 0

    response = client.delete(f"/documents/{created['id']}")

    assert response.status_code == 204
    assert _document_row(doc_id) is None
    assert _chunk_count(doc_id) == 0

    listing = client.get("/documents")
    assert created["id"] not in [row["id"] for row in listing.json()]


# --------------------------------------------------------------------- #
# DELETE authorization and not-found
# --------------------------------------------------------------------- #


def test_delete_is_401_unauthenticated_403_for_a_standard_user_and_404_for_an_unknown_id() -> None:
    client, _ = _admin_client()
    created = client.post(
        "/documents", files={"file": ("guarded.txt", b"guarded body", "text/plain")}
    ).json()

    anon_response = _fresh_client().delete(f"/documents/{created['id']}")
    assert anon_response.status_code == 401

    standard_email = _unique_email("del-standard")
    _seed_user(standard_email, role="user")
    standard_client = _fresh_client()
    assert _login(standard_client, standard_email).status_code == 200
    forbidden_response = standard_client.delete(f"/documents/{created['id']}")
    assert forbidden_response.status_code == 403
    assert _document_row(uuid.UUID(created["id"])) is not None  # untouched by the 403 attempt

    unknown_response = client.delete(f"/documents/{uuid.uuid4()}")
    assert unknown_response.status_code == 404


# --------------------------------------------------------------------- #
# AC-023 / AC-024: stats match the rows actually present
# --------------------------------------------------------------------- #


def test_stats_match_actual_rows_after_an_upload_and_after_a_delete() -> None:
    client, _ = _admin_client()

    ready_doc = client.post(
        "/documents", files={"file": ("ready-one.txt", b"will finish cleanly", "text/plain")}
    ).json()
    process_document(uuid.UUID(ready_doc["id"]))  # -> 'ready' with chunks

    processing_doc = client.post(
        "/documents", files={"file": ("still-processing.txt", b"left alone", "text/plain")}
    ).json()  # left at 'processing' -- never run through the worker

    stats_response = client.get("/documents/stats")
    assert stats_response.status_code == 200
    stats = stats_response.json()

    with SessionLocal() as db:
        actual_total = db.query(Document).count()
        actual_ready = db.query(Document).filter(Document.status == "ready").count()
        actual_processing = db.query(Document).filter(Document.status == "processing").count()
        actual_failed = db.query(Document).filter(Document.status == "failed").count()
        actual_chunks = db.query(Chunk).count()
        actual_bytes = sum(d.size_bytes for d in db.query(Document).all())

    assert stats["total"] == actual_total
    assert stats["ready"] == actual_ready
    assert stats["processing"] == actual_processing
    assert stats["failed"] == actual_failed
    assert stats["chunks"] == actual_chunks
    assert stats["bytes"] == actual_bytes
    assert stats["ready"] >= 1
    assert stats["processing"] >= 1

    delete_response = client.delete(f"/documents/{ready_doc['id']}")
    assert delete_response.status_code == 204

    after_response = client.get("/documents/stats")
    after_stats = after_response.json()
    with SessionLocal() as db:
        after_total = db.query(Document).count()
        after_ready = db.query(Document).filter(Document.status == "ready").count()
        after_chunks = db.query(Chunk).count()

    assert after_stats["total"] == after_total
    assert after_stats["ready"] == after_ready
    assert after_stats["chunks"] == after_chunks
    assert after_total == actual_total - 1
    assert after_chunks < actual_chunks  # the deleted document's chunks are gone too

    remaining_response = client.get("/documents")
    assert processing_doc["id"] in [row["id"] for row in remaining_response.json()]
    assert ready_doc["id"] not in [row["id"] for row in remaining_response.json()]


# --------------------------------------------------------------------- #
# AC-020: processing that raises leaves 'failed' + a readable reason, and
# both the row and the stored object survive.
# --------------------------------------------------------------------- #


def test_processing_that_raises_marks_the_document_failed_and_keeps_the_row_and_the_object(
    _local_storage,
) -> None:
    client, _ = _admin_client()
    # .pdf has no extractor wired in yet (app/extraction.py) -- its
    # extract_segments call raises ExtractionUnavailable, which
    # process_document must catch and turn into a 'failed' document rather
    # than letting the exception propagate.
    created = client.post(
        "/documents", files={"file": ("unsupported.pdf", b"%PDF-1.4 fake", "application/pdf")}
    ).json()
    doc_id = uuid.UUID(created["id"])

    with SessionLocal() as db:
        s3_key = db.query(Document).filter(Document.id == doc_id).one().s3_key
    stored_path = _local_storage / s3_key
    assert stored_path.exists()  # written at upload time

    process_document(doc_id)  # drives the pipeline synchronously; must not raise

    row = _document_row(doc_id)
    assert row is not None
    assert row.status == "failed"
    assert row.failure_reason
    assert stored_path.exists()  # AC-020: failure never deletes the object

    listing = client.get("/documents", params={"status": "failed"})
    assert created["id"] in [r["id"] for r in listing.json()]


# --------------------------------------------------------------------- #
# AC-025 / AC-026: filtering
# --------------------------------------------------------------------- #


def test_q_filter_matches_filename_case_insensitively_and_combines_with_status_and_type_as_and() -> (
    None
):
    client, _ = _admin_client()

    alpha = client.post(
        "/documents", files={"file": ("Quarterly-REPORT.txt", b"alpha body", "text/plain")}
    ).json()
    process_document(uuid.UUID(alpha["id"]))  # -> ready, file_type txt

    beta = client.post(
        "/documents", files={"file": ("quarterly-summary.md", b"# beta", "text/markdown")}
    ).json()  # left 'processing', file_type md, filename also matches "quarterly"

    gamma = client.post(
        "/documents", files={"file": ("unrelated.txt", b"gamma body", "text/plain")}
    ).json()
    process_document(uuid.UUID(gamma["id"]))  # -> ready, file_type txt, filename doesn't match

    # q is case-insensitive and matches a substring of the filename.
    q_only = client.get("/documents", params={"q": "QUARTERLY"})
    q_ids = {row["id"] for row in q_only.json()}
    assert q_ids == {alpha["id"], beta["id"]}

    # status + type + q combine as an AND: only alpha is ready, txt, and
    # matches "quarterly" -- beta is excluded by status and type, gamma by q.
    combined = client.get(
        "/documents", params={"q": "quarterly", "status": "ready", "type": "txt"}
    )
    combined_ids = {row["id"] for row in combined.json()}
    assert combined_ids == {alpha["id"]}

    # Status alone still returns gamma (also ready, txt) alongside alpha.
    status_only = client.get("/documents", params={"status": "ready", "type": "txt"})
    status_only_ids = {row["id"] for row in status_only.json()}
    assert status_only_ids == {alpha["id"], gamma["id"]}
