"""Unit tests for `app/deps.py`: the `current_user` and `require_admin`
dependencies, exercised directly as plain functions against a real `User`/
`Session` row (no `client`/`TestClient`, no HTTP layer -- that belongs in
`backend/tests/integration/`).

This ticket carries no acceptance criteria of its own, so most tests are
named after the module's own documented guarantees rather than an `AC-###`.
The one exception is AC-012, which the module's docstring explicitly calls
out: a disabled user's still-valid session cookie must be rejected on its
very next request, not just at a future login -- `current_user` is the one
place that is enforced, so its test is named after that criterion.

`current_user` takes a `fastapi.Request`; rather than mock it, a real
`Request` is built from a minimal ASGI scope carrying the cookie header,
which is exactly what `request.cookies` parses in production.
"""

import pytest
from fastapi import HTTPException, Request

from app.auth_session import COOKIE_NAME, create_session
from app.database import Base, SessionLocal, engine
from app.deps import current_user, require_admin
from app.models import Session as SessionModel
from app.models import User
from app.security import hash_password


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _make_user(db, email: str, *, role: str = "user", is_active: bool = True) -> User:
    db.query(SessionModel).filter(
        SessionModel.user_id.in_(db.query(User.id).filter(User.email == email))
    ).delete(synchronize_session=False)
    db.query(User).filter(User.email == email).delete()
    db.commit()
    user = User(
        email=email,
        password_hash=hash_password("Irrelevant123!"),
        role=role,
        is_active=is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _request(cookie: str | None) -> Request:
    headers = []
    if cookie is not None:
        headers.append((b"cookie", f"{COOKIE_NAME}={cookie}".encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers,
    }
    return Request(scope)


def test_current_user_rejects_a_request_with_no_session_cookie(db) -> None:
    with pytest.raises(HTTPException) as exc_info:
        current_user(_request(None), db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Not authenticated"


def test_current_user_rejects_a_cookie_that_matches_no_session(db) -> None:
    with pytest.raises(HTTPException) as exc_info:
        current_user(_request("a-token-that-was-never-issued"), db)

    assert exc_info.value.status_code == 401


def test_current_user_returns_the_user_for_a_valid_session_cookie(db) -> None:
    user = _make_user(db, "deps-valid@example.com")
    token, _session = create_session(db, user.id)

    found = current_user(_request(token), db)

    assert found.id == user.id
    assert found.email == user.email


def test_ac012_current_user_rejects_a_disabled_users_still_valid_session(db) -> None:
    """A session row is still unexpired and unrevoked, but an administrator
    has since disabled the account behind it: the very next request on that
    cookie must be rejected, with the same 401 a missing/expired session
    gets (not a distinct error that would leak which case applied)."""
    user = _make_user(db, "deps-disabled@example.com", is_active=True)
    token, _session = create_session(db, user.id)

    # Disable the account after the session was already issued -- exactly
    # the "existing cookie outlives a later deactivation" scenario AC-012
    # names, not a session created for an already-disabled user.
    user.is_active = False
    db.add(user)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        current_user(_request(token), db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Not authenticated"


def test_current_user_accepts_an_active_users_valid_session(db) -> None:
    user = _make_user(db, "deps-active@example.com", is_active=True)
    token, _session = create_session(db, user.id)

    assert current_user(_request(token), db).id == user.id


def test_require_admin_returns_the_user_when_role_is_admin(db) -> None:
    admin = _make_user(db, "deps-admin@example.com", role="admin")

    assert require_admin(admin) is admin


def test_require_admin_rejects_a_non_admin_user_with_403(db) -> None:
    user = _make_user(db, "deps-non-admin@example.com", role="user")

    with pytest.raises(HTTPException) as exc_info:
        require_admin(user)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin required"
