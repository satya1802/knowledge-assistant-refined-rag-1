"""US-008-3: upload, authorization and storage coverage for POST /documents.

Covers AC-015 (a supported, in-limit upload creates exactly one Document
row with status 'processing' and a non-empty s3_key, and is returned by
GET /documents), AC-016 (an unsupported extension is rejected with a
message naming PDF, DOCX, TXT and MD, and nothing is persisted or stored),
AC-017 (an in-test-generated, >25 MB file is rejected with a size-limit
message and nothing persisted or stored) and AC-018 (upload is admin-only;
401 unauthenticated, 403 non-admin; a non-admin GET /documents still
succeeds).

`STORAGE_DIR` is redirected to a pytest tmp directory for every test here
(see app/storage.py) so nothing ever touches real AWS and "zero stored
objects" can be asserted by counting files on disk.
"""

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Document, User
from app.security import hash_password

_PASSWORD = "UploadSeedPass123!"


@pytest.fixture(autouse=True)
def _local_storage(tmp_path, monkeypatch) -> Path:
    # AC-* / constraint: object storage is a tmp directory, never real S3.
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path))
    return tmp_path


def _stored_object_count(storage_dir: Path) -> int:
    return sum(1 for p in storage_dir.rglob("*") if p.is_file())


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
    email = _unique_email("upload-admin")
    admin = _seed_user(email, role="admin")
    client = _fresh_client()
    assert _login(client, email).status_code == 200
    return client, admin


def _document_count() -> int:
    with SessionLocal() as db:
        return db.query(Document).count()


# --------------------------------------------------------------------- #
# AC-015
# --------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "filename,content,content_type",
    [
        ("policy.txt", b"hello world", "text/plain"),
        ("notes.md", b"# heading", "text/markdown"),
    ],
)
def test_admin_upload_of_a_small_valid_file_creates_one_row_with_storage_and_is_listed(
    _local_storage, filename, content, content_type
) -> None:
    client, admin = _admin_client()
    before = _document_count()

    response = client.post("/documents", files={"file": (filename, content, content_type)})

    assert response.status_code in (201, 202)
    body = response.json()
    assert body["status"] == "processing"

    after = _document_count()
    assert after == before + 1

    with SessionLocal() as db:
        row = db.query(Document).filter(Document.id == uuid.UUID(body["id"])).one()
        assert row.status == "processing"
        assert row.s3_key
        assert row.uploaded_by == admin.id

    listing = client.get("/documents")
    assert listing.status_code == 200
    assert any(r["id"] == body["id"] for r in listing.json())


# --------------------------------------------------------------------- #
# AC-016
# --------------------------------------------------------------------- #


def test_unsupported_extension_returns_400_names_every_accepted_format_and_stores_nothing(
    _local_storage,
) -> None:
    client, _ = _admin_client()
    before_docs = _document_count()
    before_objects = _stored_object_count(_local_storage)

    response = client.post(
        "/documents",
        files={"file": ("payload.exe", b"MZ fake binary", "application/octet-stream")},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    for fmt in ("PDF", "DOCX", "TXT", "MD"):
        assert fmt in detail

    assert _document_count() == before_docs
    assert _stored_object_count(_local_storage) == before_objects


# --------------------------------------------------------------------- #
# AC-017
# --------------------------------------------------------------------- #


def test_oversize_upload_returns_413_with_a_size_limit_message_and_stores_nothing(
    _local_storage,
) -> None:
    client, _ = _admin_client()
    before_docs = _document_count()
    before_objects = _stored_object_count(_local_storage)

    oversize = b"a" * (25 * 1024 * 1024 + 1)  # generated in-test, never committed
    response = client.post("/documents", files={"file": ("huge.txt", oversize, "text/plain")})

    assert response.status_code == 413
    assert "25 MB" in response.json()["detail"]

    assert _document_count() == before_docs
    assert _stored_object_count(_local_storage) == before_objects


# --------------------------------------------------------------------- #
# AC-018
# --------------------------------------------------------------------- #


def test_unauthenticated_upload_is_401_and_non_admin_upload_is_403(_local_storage) -> None:
    anon_client = _fresh_client()
    unauth_response = anon_client.post(
        "/documents", files={"file": ("a.txt", b"hi", "text/plain")}
    )
    assert unauth_response.status_code == 401

    standard_email = _unique_email("upload-standard")
    _seed_user(standard_email, role="user")
    standard_client = _fresh_client()
    assert _login(standard_client, standard_email).status_code == 200

    before_docs = _document_count()
    forbidden_response = standard_client.post(
        "/documents", files={"file": ("a.txt", b"hi", "text/plain")}
    )
    assert forbidden_response.status_code == 403
    assert _document_count() == before_docs


def test_non_admin_get_documents_still_succeeds(_local_storage) -> None:
    standard_email = _unique_email("upload-reader")
    _seed_user(standard_email, role="user")
    standard_client = _fresh_client()
    assert _login(standard_client, standard_email).status_code == 200

    response = standard_client.get("/documents")

    assert response.status_code == 200
    assert isinstance(response.json(), list)
