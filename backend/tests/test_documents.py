"""US-008-1: POST /documents, GET /documents and GET /documents/stats are
real and database-backed.

Covers AC-015 (a supported, in-limit upload is stored and persisted),
AC-016 (an unsupported type is rejected with nothing written), AC-017 (an
oversize supported-type file is rejected with nothing written), AC-018
(admin-only upload, 401 unauthenticated / 403 non-admin), AC-034/AC-036
(GET /documents is a real, filterable, any-signed-in-user listing) and
AC-035 (a restart never loses a persisted document).

Each test seeds its own user(s) directly against the ORM, the established
pattern in this suite (see test_account.py, test_user_provisioning.py), and
uses a fresh TestClient per actor so session cookies never leak.
"""

import importlib
import uuid

from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Document, User
from app.security import hash_password

_PASSWORD = "SeedPass123!"


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
    email = _unique_email("docs-admin")
    admin = _seed_user(email, role="admin")
    client = _fresh_client()
    assert _login(client, email).status_code == 200
    return client, admin


# --------------------------------------------------------------------- #
# AC-015
# --------------------------------------------------------------------- #


def test_admin_upload_of_a_supported_file_is_stored_and_persisted() -> None:
    client, admin = _admin_client()

    response = client.post(
        "/documents",
        files={"file": ("policy.txt", b"hello world", "text/plain")},
    )

    assert response.status_code in (201, 202)
    body = response.json()
    assert body["filename"] == "policy.txt"
    assert body["file_type"] == "txt"
    assert body["size_bytes"] == len(b"hello world")
    assert body["status"] == "processing"
    assert "id" in body

    with SessionLocal() as db:
        row = db.query(Document).filter(Document.id == uuid.UUID(body["id"])).one()
        assert row.filename == "policy.txt"
        assert row.file_type == "txt"
        assert row.size_bytes == len(b"hello world")
        assert row.status == "processing"
        assert row.uploaded_by == admin.id
        assert row.s3_key


# --------------------------------------------------------------------- #
# AC-016
# --------------------------------------------------------------------- #


def test_unsupported_type_is_rejected_and_nothing_is_persisted() -> None:
    client, _ = _admin_client()

    with SessionLocal() as db:
        before = db.query(Document).count()

    response = client.post(
        "/documents",
        files={"file": ("virus.exe", b"MZ...", "application/octet-stream")},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    for fmt in ("PDF", "DOCX", "TXT", "MD"):
        assert fmt in detail

    with SessionLocal() as db:
        after = db.query(Document).count()
    assert after == before


# --------------------------------------------------------------------- #
# AC-017
# --------------------------------------------------------------------- #


def test_oversize_supported_file_is_rejected_and_nothing_is_persisted() -> None:
    client, _ = _admin_client()

    with SessionLocal() as db:
        before = db.query(Document).count()

    too_big = b"a" * (25 * 1024 * 1024 + 1)
    response = client.post(
        "/documents",
        files={"file": ("big.txt", too_big, "text/plain")},
    )

    assert response.status_code == 413
    assert "25 MB" in response.json()["detail"]

    with SessionLocal() as db:
        after = db.query(Document).count()
    assert after == before


# --------------------------------------------------------------------- #
# AC-018
# --------------------------------------------------------------------- #


def test_upload_requires_an_authenticated_admin() -> None:
    anon_client = _fresh_client()
    unauth_response = anon_client.post(
        "/documents", files={"file": ("a.txt", b"hi", "text/plain")}
    )
    assert unauth_response.status_code == 401

    standard_email = _unique_email("docs-standard")
    _seed_user(standard_email, role="user")
    standard_client = _fresh_client()
    assert _login(standard_client, standard_email).status_code == 200

    forbidden_response = standard_client.post(
        "/documents", files={"file": ("a.txt", b"hi", "text/plain")}
    )
    assert forbidden_response.status_code == 403


# --------------------------------------------------------------------- #
# AC-034 / AC-036
# --------------------------------------------------------------------- #


def test_list_documents_is_persisted_newest_first_filterable_and_open_to_any_signed_in_user() -> (
    None
):
    client, admin = _admin_client()

    first = client.post(
        "/documents", files={"file": ("alpha.txt", b"one", "text/plain")}
    ).json()
    second = client.post(
        "/documents", files={"file": ("beta.md", b"two", "text/markdown")}
    ).json()

    standard_email = _unique_email("docs-reader")
    _seed_user(standard_email, role="user")
    reader_client = _fresh_client()
    assert _login(reader_client, standard_email).status_code == 200

    response = reader_client.get("/documents")
    assert response.status_code == 200
    rows = response.json()
    ids_in_order = [row["id"] for row in rows]
    assert ids_in_order.index(second["id"]) < ids_in_order.index(first["id"])

    matching = next(row for row in rows if row["id"] == first["id"])
    assert matching["filename"] == "alpha.txt"
    assert matching["file_type"] == "txt"
    assert matching["size_bytes"] == 3
    assert matching["status"] == "processing"
    assert matching["chunk_count"] == 0
    assert matching["uploaded_by"] == admin.email
    assert "created_at" in matching

    q_response = reader_client.get("/documents", params={"q": "beta"})
    assert [row["id"] for row in q_response.json()] == [second["id"]]

    type_response = reader_client.get("/documents", params={"type": "md"})
    assert all(row["file_type"] == "md" for row in type_response.json())

    status_response = reader_client.get("/documents", params={"status": "processing"})
    assert all(row["status"] == "processing" for row in status_response.json())


def test_list_documents_requires_a_signed_in_session() -> None:
    anon_client = _fresh_client()
    assert anon_client.get("/documents").status_code == 401


# --------------------------------------------------------------------- #
# GET /documents/stats
# --------------------------------------------------------------------- #


def test_document_stats_reflects_the_database() -> None:
    client, _ = _admin_client()
    client.post("/documents", files={"file": ("one.txt", b"abc", "text/plain")})
    client.post("/documents", files={"file": ("two.txt", b"abcdef", "text/plain")})

    response = client.get("/documents/stats")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert body["processing"] >= 2
    assert body["bytes"] >= 9
    assert set(body.keys()) == {"total", "ready", "processing", "failed", "chunks", "bytes"}


# --------------------------------------------------------------------- #
# AC-035
# --------------------------------------------------------------------- #


def test_restarting_the_app_keeps_documents_and_their_status() -> None:
    client, admin = _admin_client()
    created = client.post(
        "/documents", files={"file": ("persisted.txt", b"keep me", "text/plain")}
    ).json()

    import app.main as main_module

    importlib.reload(main_module)
    TestClient(main_module.app)

    fresh_client = TestClient(main_module.app)
    assert _login(fresh_client, admin.email).status_code == 200
    response = fresh_client.get("/documents")

    assert response.status_code == 200
    matching = next(row for row in response.json() if row["id"] == created["id"])
    assert matching["status"] == "processing"
    assert matching["filename"] == "persisted.txt"
