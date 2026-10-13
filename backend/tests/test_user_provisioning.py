"""US-005-3: administrator account provisioning and the role boundary.

Covers AC-011 (temporary password shown once, never in GET /users),
AC-012 (a disabled account is rejected on its next request and at login),
AC-013 (a promoted user passes GET /users on their very next request) and
AC-014 (a standard user is refused admin-only user management, with no
other user's data leaking into the refusal body).

Every test seeds its own rows directly against the ORM (the same pattern
`test_auth_lockout.py` uses) rather than relying on the POST /users
bootstrap path, because by the time this module runs the `users` table
already has rows from earlier test modules -- the "first account is free"
branch in `app/routers/users.py` would not trigger here anyway.
"""

import uuid

from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Session as SessionModel
from app.models import User
from app.security import hash_password

_PASSWORD = "SeedPass123!"


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_user(email: str, *, role: str = "user", is_active: bool = True) -> User:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(
            email=email,
            password_hash=hash_password(_PASSWORD),
            role=role,
            is_active=is_active,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _login(client: TestClient, email: str, password: str = _PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def _fresh_client() -> TestClient:
    # A client per test keeps session cookies from leaking between callers
    # (admin vs. the account under test), unlike a module-level client.
    return TestClient(app)


# --------------------------------------------------------------------- #
# AC-011
# --------------------------------------------------------------------- #


def test_create_user_returns_the_temporary_password_once_and_get_users_never_carries_it() -> None:
    admin_email = _unique_email("ac011-admin")
    _seed_user(admin_email, role="admin")
    admin_client = _fresh_client()
    assert _login(admin_client, admin_email).status_code == 200

    new_email = _unique_email("ac011-new")
    new_password = "BrandNewPass123!"
    create_response = admin_client.post(
        "/users", json={"email": new_email, "password": new_password}
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["temporary_password"] == new_password
    assert created["email"] == new_email

    list_response = admin_client.get("/users")
    assert list_response.status_code == 200
    rows = list_response.json()
    matching = [row for row in rows if row["email"] == new_email]
    assert len(matching) == 1
    assert "temporary_password" not in matching[0]
    assert "password" not in matching[0]
    assert "password_hash" not in matching[0]


# --------------------------------------------------------------------- #
# AC-012
# --------------------------------------------------------------------- #


def test_disabling_a_user_rejects_their_existing_session_and_future_login() -> None:
    admin_email = _unique_email("ac012-admin")
    admin = _seed_user(admin_email, role="admin")  # noqa: F841 -- documents the seed
    target_email = _unique_email("ac012-target")
    target = _seed_user(target_email, role="user")

    admin_client = _fresh_client()
    assert _login(admin_client, admin_email).status_code == 200

    target_client = _fresh_client()
    assert _login(target_client, target_email).status_code == 200
    # The session is good before the disable.
    assert target_client.get("/auth/me").status_code == 200

    patch_response = admin_client.patch(f"/users/{target.id}", json={"is_active": False})
    assert patch_response.status_code == 200
    assert patch_response.json()["is_active"] is False

    # Same cookie, very next request: rejected (AC-012).
    assert target_client.get("/auth/me").status_code == 401

    # A fresh login attempt with the correct password is refused too.
    login_attempt = _fresh_client()
    login_response = _login(login_attempt, target_email)
    assert login_response.status_code == 401


# --------------------------------------------------------------------- #
# AC-013
# --------------------------------------------------------------------- #


def test_granting_admin_passes_get_users_on_the_very_next_request() -> None:
    admin_email = _unique_email("ac013-admin")
    _seed_user(admin_email, role="admin")
    target_email = _unique_email("ac013-target")
    target = _seed_user(target_email, role="user")

    admin_client = _fresh_client()
    assert _login(admin_client, admin_email).status_code == 200

    target_client = _fresh_client()
    assert _login(target_client, target_email).status_code == 200

    # Before promotion: refused.
    assert target_client.get("/users").status_code == 403

    role_response = admin_client.patch(f"/users/{target.id}", json={"role": "admin"})
    assert role_response.status_code == 200
    assert role_response.json()["role"] == "admin"

    # No re-login: require_admin re-reads the row every request.
    assert target_client.get("/users").status_code == 200


def test_granting_admin_then_admin_only_document_actions_are_not_enforced_by_the_backend() -> None:
    """Documents that AC-013's second half ("...and the admin-only document
    actions") has nothing to verify against: app/routers/documents.py wires
    every document route with no `current_user`/`require_admin` dependency
    at all, so there is no admin-only document behaviour yet to pass or
    fail. This is recorded as a defect, not silently skipped."""
    admin_email = _unique_email("ac013-docs-admin")
    _seed_user(admin_email, role="admin")
    target_email = _unique_email("ac013-docs-target")
    target = _seed_user(target_email, role="user")

    admin_client = _fresh_client()
    assert _login(admin_client, admin_email).status_code == 200
    admin_client.patch(f"/users/{target.id}", json={"role": "admin"})

    anon_client = _fresh_client()  # deliberately unauthenticated
    # If document routes were admin-gated, this would be 401. It is not --
    # every document route accepts anonymous callers today.
    response = anon_client.post("/documents/some-id/reprocess", json={"mode": "retry"})
    assert response.status_code == 200, (
        "Expected the current (ungated) behaviour; if this starts failing, "
        "document routes have gained auth and this test -- and the AC-013 "
        "defect note above -- should be revisited rather than deleted."
    )


# --------------------------------------------------------------------- #
# AC-014
# --------------------------------------------------------------------- #


def test_a_standard_user_is_refused_every_user_management_endpoint() -> None:
    standard_email = _unique_email("ac014-standard")
    standard = _seed_user(standard_email, role="user")
    other_email = _unique_email("ac014-other")
    other = _seed_user(other_email, role="user")

    standard_client = _fresh_client()
    assert _login(standard_client, standard_email).status_code == 200

    get_response = standard_client.get("/users")
    assert get_response.status_code == 403
    get_body = get_response.text
    assert other_email not in get_body
    assert standard_email not in get_body

    post_response = standard_client.post(
        "/users", json={"email": _unique_email("ac014-blocked"), "password": "WouldBeIgnored1!"}
    )
    assert post_response.status_code == 403

    patch_response = standard_client.patch(f"/users/{other.id}", json={"is_active": False})
    assert patch_response.status_code == 403
    assert other_email not in patch_response.text

    # The target account was not actually touched by the refused attempt.
    with SessionLocal() as db:
        reloaded = db.query(User).filter(User.id == other.id).one()
        assert reloaded.is_active is True

    # Sanity: the seeded "standard" row itself was never granted anything.
    with SessionLocal() as db:
        reloaded_self = db.query(User).filter(User.id == standard.id).one()
        assert reloaded_self.role == "user"
