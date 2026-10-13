"""US-037-3: self-service password change and server-side theme preference.

Covers AC-080 (correct current password changes the stored hash and
succeeds), AC-081 (an incorrect current password is rejected and the hash
is untouched), AC-082 (after a change, login accepts only the new password)
and AC-084 (PATCH /account/theme persists light/dark/system on the caller,
rejects invalid values, and GET /auth/me reflects it).

Each test seeds its own user directly against the ORM (the established
pattern in this suite, e.g. test_auth_lockout.py) and uses a fresh
TestClient per actor so session cookies never leak between tests.
"""

import uuid

from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import User
from app.security import hash_password

_PASSWORD = "CorrectPass123!"
_NEW_PASSWORD = "BrandNewPass456!"


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_user(email: str) -> User:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(email=email, password_hash=hash_password(_PASSWORD), role="user")
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _reload(user: User) -> User:
    db = SessionLocal()
    try:
        return db.query(User).filter(User.id == user.id).one()
    finally:
        db.close()


def _fresh_client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, email: str, password: str):
    return client.post("/auth/login", json={"email": email, "password": password})


# --------------------------------------------------------------------- #
# AC-080
# --------------------------------------------------------------------- #


def test_correct_current_password_stores_a_new_bcrypt_hash_and_returns_success() -> None:
    email = _unique_email("ac080")
    user = _seed_user(email)
    client = _fresh_client()
    assert _login(client, email, _PASSWORD).status_code == 200
    before = _reload(user).password_hash

    response = client.post(
        "/account/password",
        json={"current_password": _PASSWORD, "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    after = _reload(user).password_hash
    assert after != before
    assert after.startswith("$2")  # bcrypt hash prefix
    assert _NEW_PASSWORD not in after


# --------------------------------------------------------------------- #
# AC-081
# --------------------------------------------------------------------- #


def test_incorrect_current_password_is_rejected_and_the_hash_is_unchanged() -> None:
    email = _unique_email("ac081")
    user = _seed_user(email)
    client = _fresh_client()
    assert _login(client, email, _PASSWORD).status_code == 200
    before = _reload(user).password_hash

    response = client.post(
        "/account/password",
        json={"current_password": "WrongPass999!", "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 400
    after = _reload(user).password_hash
    assert after == before


def test_password_change_requires_an_authenticated_session() -> None:
    client = _fresh_client()  # no login

    response = client.post(
        "/account/password",
        json={"current_password": _PASSWORD, "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 401


# --------------------------------------------------------------------- #
# AC-082
# --------------------------------------------------------------------- #


def test_after_a_change_login_accepts_only_the_new_password() -> None:
    email = _unique_email("ac082")
    _seed_user(email)
    client = _fresh_client()
    assert _login(client, email, _PASSWORD).status_code == 200

    change_response = client.post(
        "/account/password",
        json={"current_password": _PASSWORD, "new_password": _NEW_PASSWORD},
    )
    assert change_response.status_code == 200

    old_attempt = _login(_fresh_client(), email, _PASSWORD)
    new_attempt = _login(_fresh_client(), email, _NEW_PASSWORD)

    assert old_attempt.status_code == 401
    assert new_attempt.status_code == 200


# --------------------------------------------------------------------- #
# AC-084
# --------------------------------------------------------------------- #


def test_patch_theme_persists_each_valid_value_and_me_reflects_it() -> None:
    email = _unique_email("ac084")
    _seed_user(email)
    client = _fresh_client()
    assert _login(client, email, _PASSWORD).status_code == 200

    for value in ("light", "dark", "system"):
        patch_response = client.patch("/account/theme", json={"theme": value})
        assert patch_response.status_code == 200
        assert patch_response.json()["theme"] == value

        me_response = client.get("/auth/me")
        assert me_response.status_code == 200
        assert me_response.json()["user"]["theme"] == value


def test_patch_theme_rejects_an_invalid_value_and_leaves_the_stored_theme_unchanged() -> None:
    email = _unique_email("ac084-invalid")
    user = _seed_user(email)
    client = _fresh_client()
    assert _login(client, email, _PASSWORD).status_code == 200
    assert client.patch("/account/theme", json={"theme": "dark"}).status_code == 200

    response = client.patch("/account/theme", json={"theme": "purple"})

    assert response.status_code == 422
    assert _reload(user).theme == "dark"


def test_theme_change_requires_an_authenticated_session() -> None:
    client = _fresh_client()  # no login

    response = client.patch("/account/theme", json={"theme": "dark"})

    assert response.status_code == 401
