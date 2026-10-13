"""US-013-2: GET /documents/{id}/download (AC-027).

Covers: a download returns the exact uploaded bytes and the original
filename; 404 for an unknown id; 401 unauthenticated. `STORAGE_DIR` is
redirected to a pytest tmp directory so nothing here touches real AWS, the
established pattern in this suite (see test_documents_upload.py).
"""

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import User
from app.security import hash_password

_PASSWORD = "DownloadSeedPass123!"


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
    email = _unique_email("dl-admin")
    _seed_user(email, role="admin")
    client = _fresh_client()
    assert _login(client, email).status_code == 200
    return client


# --------------------------------------------------------------------- #
# AC-027
# --------------------------------------------------------------------- #


def test_download_returns_the_exact_uploaded_bytes_and_the_original_filename() -> None:
    client = _admin_client()
    original_bytes = b"the exact original bytes, byte for byte"
    created = client.post(
        "/documents", files={"file": ("Original Name.txt", original_bytes, "text/plain")}
    ).json()

    response = client.get(f"/documents/{created['id']}/download")

    assert response.status_code == 200
    assert response.content == original_bytes
    content_disposition = response.headers.get("content-disposition", "")
    assert "Original Name.txt" in content_disposition


def test_download_works_for_a_standard_signed_in_user_not_only_an_admin() -> None:
    admin_client = _admin_client()
    original_bytes = b"readable by any signed-in user"
    created = admin_client.post(
        "/documents", files={"file": ("shared.txt", original_bytes, "text/plain")}
    ).json()

    standard_email = _unique_email("dl-standard")
    _seed_user(standard_email, role="user")
    standard_client = _fresh_client()
    assert _login(standard_client, standard_email).status_code == 200

    response = standard_client.get(f"/documents/{created['id']}/download")

    assert response.status_code == 200
    assert response.content == original_bytes


def test_download_of_an_unknown_id_is_404() -> None:
    client = _admin_client()

    response = client.get(f"/documents/{uuid.uuid4()}/download")

    assert response.status_code == 404


def test_download_requires_an_authenticated_session() -> None:
    client = _admin_client()
    created = client.post(
        "/documents", files={"file": ("guarded.txt", b"guarded", "text/plain")}
    ).json()

    anon_response = _fresh_client().get(f"/documents/{created['id']}/download")

    assert anon_response.status_code == 401
