"""US-008-3: AC-034/AC-035 -- documents survive a restart.

A document written through one app/session is still returned by
GET /documents from a fresh app instance against the same database, its
status unchanged, and no table is dropped, cleared or re-created on
startup. `STORAGE_DIR` is redirected to a pytest tmp directory so nothing
here touches real AWS.
"""

import importlib
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import inspect as sa_inspect

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Document, User
from app.security import hash_password

_PASSWORD = "PersistSeedPass123!"


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_admin(email: str) -> User:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(email=email, password_hash=hash_password(_PASSWORD), role="admin")
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _login(client: TestClient, email: str):
    return client.post("/auth/login", json={"email": email, "password": _PASSWORD})


def test_documents_written_through_one_app_survive_a_fresh_app_instance(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path))
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"):
        monkeypatch.delenv(name, raising=False)

    email = _unique_email("persist-admin")
    admin = _seed_admin(email)
    first_client = TestClient(app)
    assert _login(first_client, email).status_code == 200

    created = first_client.post(
        "/documents", files={"file": ("keep-me.txt", b"durable content", "text/plain")}
    ).json()
    assert created["status"] == "processing"

    tables_before = set(sa_inspect(engine).get_table_names())
    with SessionLocal() as db:
        document_count_before = db.query(Document).count()

    # Simulate a restart: a fresh app instance bound to the same database,
    # the same technique test_startup_persistence.py uses for users/sessions.
    import app.main as main_module

    importlib.reload(main_module)
    fresh_client = TestClient(main_module.app)

    tables_after = set(sa_inspect(engine).get_table_names())
    assert tables_after == tables_before  # nothing dropped or recreated

    with SessionLocal() as db:
        document_count_after = db.query(Document).count()
    assert document_count_after == document_count_before  # nothing cleared

    assert _login(fresh_client, email).status_code == 200
    response = fresh_client.get("/documents")

    assert response.status_code == 200
    matching = next(row for row in response.json() if row["id"] == created["id"])
    assert matching["status"] == "processing"
    assert matching["filename"] == "keep-me.txt"

    with SessionLocal() as db:
        row = db.query(Document).filter(Document.id == uuid.UUID(created["id"])).one()
        assert row.status == "processing"
        assert row.uploaded_by == admin.id
