"""Unit tests for `app/routers/auth.py`: the `login`, `logout` and `me`
coroutines plus the `_request_is_https` helper, each called directly as a
plain function/coroutine against a real `User`/`Session` row -- no `client`
fixture, no `TestClient`, no HTTP layer. (`backend/tests/test_auth_lockout.py`
already drives the lockout rules end-to-end through `TestClient`; this file
covers the handler's own logic the same way `tests/unit/test_deps.py` and
`tests/unit/test_auth_session.py` cover their modules.)

This ticket carries no acceptance criteria of its own. Where a behaviour the
handler implements is named by an AC in its module docstring (AC-002,
AC-007, AC-008, AC-012, AC-151, AC-152), the test is named after it; the
rest are named after the module's own documented guarantees: the generic
body on every rejection, the cookie attributes `login` sets, and that
`logout`/`me` do only what their docstrings promise.

Async handlers are run with `asyncio.run`, exactly as
`tests/unit/test_main.py` runs `main_module.health()`.
"""

import asyncio
from datetime import datetime, timedelta
from http.cookies import SimpleCookie

import pytest
from fastapi import HTTPException, Request, Response

import app.routers.auth as auth_module
from app.auth_session import COOKIE_NAME, create_session, get_session_user
from app.database import Base, SessionLocal, engine
from app.models import Session as SessionModel
from app.models import User
from app.schemas import LoginRequest
from app.security import hash_password

_PASSWORD = "CorrectPass123!"
_WRONG = "WrongPass123!"


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _make_user(
    db,
    email: str,
    *,
    is_active: bool = True,
    failed_attempts: int = 0,
    locked_until=None,
) -> User:
    db.query(SessionModel).filter(
        SessionModel.user_id.in_(db.query(User.id).filter(User.email == email))
    ).delete(synchronize_session=False)
    db.query(User).filter(User.email == email).delete()
    db.commit()
    user = User(
        email=email,
        password_hash=hash_password(_PASSWORD),
        role="user",
        is_active=is_active,
        failed_attempts=failed_attempts,
        locked_until=locked_until,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _reload(db, user: User) -> User:
    db.expire(user)
    return db.query(User).filter(User.id == user.id).one()


def _request(*, scheme: str = "http", cookie: str | None = None, extra_headers=None) -> Request:
    headers = list(extra_headers or [])
    if cookie is not None:
        headers.append((b"cookie", f"{COOKIE_NAME}={cookie}".encode()))
    headers.append((b"host", b"example.com"))
    scope = {
        "type": "http",
        "method": "POST",
        "scheme": scheme,
        "path": "/auth/login",
        "query_string": b"",
        "headers": headers,
    }
    return Request(scope)


def _set_cookie(response: Response) -> SimpleCookie:
    raw = response.headers.get("set-cookie")
    assert raw is not None, "no Set-Cookie header was set"
    jar = SimpleCookie()
    jar.load(raw)
    return jar


def _login(db, email: str, password: str, *, scheme: str = "http", extra_headers=None):
    payload = LoginRequest(email=email, password=password)
    request = _request(scheme=scheme, extra_headers=extra_headers)
    response = Response()
    result = asyncio.run(auth_module.login(payload, request, response, db))
    return result, response


# --- _request_is_https --------------------------------------------------


def test_request_is_https_true_for_https_scheme() -> None:
    assert auth_module._request_is_https(_request(scheme="https")) is True


def test_request_is_https_false_for_plain_http_with_no_forwarded_header() -> None:
    assert auth_module._request_is_https(_request(scheme="http")) is False


def test_request_is_https_true_from_x_forwarded_proto_regardless_of_case() -> None:
    req = _request(scheme="http", extra_headers=[(b"x-forwarded-proto", b"HTTPS")])
    assert auth_module._request_is_https(req) is True


def test_request_is_https_false_when_forwarded_proto_is_something_else() -> None:
    req = _request(scheme="http", extra_headers=[(b"x-forwarded-proto", b"http")])
    assert auth_module._request_is_https(req) is False


# --- login: rejection cases share one generic body ----------------------


def test_login_unknown_email_raises_the_generic_401(db) -> None:
    with pytest.raises(HTTPException) as exc_info:
        _login(db, "no-such-user@example.com", _WRONG)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Email or password is incorrect"


def test_ac007_login_with_wrong_password_registers_a_failed_attempt(db) -> None:
    user = _make_user(db, "auth-wrong-password@example.com")

    with pytest.raises(HTTPException) as exc_info:
        _login(db, user.email, _WRONG)

    assert exc_info.value.status_code == 401
    reloaded = _reload(db, user)
    assert reloaded.failed_attempts == 1
    assert reloaded.locked_until is not None


def test_ac008_login_while_locked_raises_the_generic_401_and_does_not_touch_counters(db) -> None:
    locked_until = datetime.utcnow() + timedelta(minutes=15)
    user = _make_user(
        db, "auth-locked@example.com", failed_attempts=5, locked_until=locked_until
    )

    # Even the *correct* password is refused while locked (AC-008).
    with pytest.raises(HTTPException) as exc_info:
        _login(db, user.email, _PASSWORD)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Email or password is incorrect"
    reloaded = _reload(db, user)
    # Checking against the dummy hash while locked must not re-count a
    # failure or move the lock expiry.
    assert reloaded.failed_attempts == 5
    assert reloaded.locked_until == locked_until
    assert db.query(SessionModel).filter(SessionModel.user_id == user.id).count() == 0


def test_ac151_login_for_a_disabled_account_with_the_correct_password_raises_401(db) -> None:
    user = _make_user(db, "auth-disabled@example.com", is_active=False)

    with pytest.raises(HTTPException) as exc_info:
        _login(db, user.email, _PASSWORD)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Email or password is incorrect"
    # A disabled account's correct password is not a "failed" attempt and
    # must not start/extend a lockout, nor create a session.
    reloaded = _reload(db, user)
    assert reloaded.failed_attempts == 0
    assert reloaded.locked_until is None
    assert db.query(SessionModel).filter(SessionModel.user_id == user.id).count() == 0


def test_unknown_email_and_wrong_password_for_a_known_user_share_the_identical_body(db) -> None:
    """AC-002: nothing in the response body tells an attacker which case it
    was."""
    known = _make_user(db, "auth-known-for-comparison@example.com")

    with pytest.raises(HTTPException) as unknown_exc:
        _login(db, "auth-totally-unknown@example.com", _WRONG)
    with pytest.raises(HTTPException) as wrong_exc:
        _login(db, known.email, _WRONG)

    assert unknown_exc.value.status_code == wrong_exc.value.status_code == 401
    assert unknown_exc.value.detail == wrong_exc.value.detail


# --- login: success ------------------------------------------------------


def test_login_success_returns_the_user_and_persists_a_session_row(db) -> None:
    user = _make_user(db, "auth-success@example.com")

    result, response = _login(db, user.email, _PASSWORD)

    assert result.user.id == user.id
    assert result.user.email == user.email
    assert "password" not in result.user.model_dump()
    jar = _set_cookie(response)
    token = jar[COOKIE_NAME].value
    found = get_session_user(db, token)
    assert found is not None
    assert found.id == user.id


def test_ac152_successful_login_clears_previously_tracked_failures(db) -> None:
    user = _make_user(
        db,
        "auth-clears-lock@example.com",
        failed_attempts=3,
        locked_until=datetime.utcnow() + timedelta(minutes=15),
    )

    _login(db, user.email, _PASSWORD)

    reloaded = _reload(db, user)
    assert reloaded.failed_attempts == 0
    assert reloaded.locked_until is None


def test_login_cookie_is_httponly_lax_samesite_and_served_at_root_path(db) -> None:
    user = _make_user(db, "auth-cookie-attrs@example.com")

    _, response = _login(db, user.email, _PASSWORD)

    jar = _set_cookie(response)
    morsel = jar[COOKIE_NAME]
    assert morsel["httponly"] is True
    assert morsel["samesite"] == "lax"
    assert morsel["path"] == "/"


def test_login_cookie_is_not_marked_secure_over_plain_http(db) -> None:
    user = _make_user(db, "auth-cookie-plain-http@example.com")

    _, response = _login(db, user.email, _PASSWORD, scheme="http")

    morsel = _set_cookie(response)[COOKIE_NAME]
    assert morsel["secure"] == ""


def test_login_cookie_is_marked_secure_over_https(db) -> None:
    user = _make_user(db, "auth-cookie-https@example.com")

    _, response = _login(db, user.email, _PASSWORD, scheme="https")

    morsel = _set_cookie(response)[COOKIE_NAME]
    assert morsel["secure"] is True


def test_login_cookie_is_marked_secure_behind_a_forwarded_proto_header(db) -> None:
    user = _make_user(db, "auth-cookie-forwarded@example.com")

    _, response = _login(
        db,
        user.email,
        _PASSWORD,
        scheme="http",
        extra_headers=[(b"x-forwarded-proto", b"https")],
    )

    morsel = _set_cookie(response)[COOKIE_NAME]
    assert morsel["secure"] is True


def test_login_cookie_max_age_matches_the_configured_session_lifetime(db, monkeypatch) -> None:
    monkeypatch.setattr(auth_module, "session_lifetime_days", lambda: 3)
    user = _make_user(db, "auth-cookie-lifetime@example.com")

    _, response = _login(db, user.email, _PASSWORD)

    morsel = _set_cookie(response)[COOKIE_NAME]
    assert int(morsel["max-age"]) == 3 * 86400


# --- logout ---------------------------------------------------------------


def test_logout_revokes_an_existing_session_and_clears_the_cookie(db) -> None:
    user = _make_user(db, "auth-logout@example.com")
    token, _session = create_session(db, user.id)
    request = _request(cookie=token)

    result = asyncio.run(auth_module.logout(request, db))

    assert result.status_code == 204
    assert get_session_user(db, token) is None
    morsel = _set_cookie(result)[COOKIE_NAME]
    assert morsel["max-age"] == "0"


def test_logout_with_no_cookie_still_returns_204_and_clears_the_cookie(db) -> None:
    request = _request(cookie=None)

    result = asyncio.run(auth_module.logout(request, db))

    assert result.status_code == 204
    morsel = _set_cookie(result)[COOKIE_NAME]
    assert morsel["max-age"] == "0"


def test_logout_with_an_unknown_token_does_not_raise(db) -> None:
    request = _request(cookie="a-token-that-was-never-issued")

    result = asyncio.run(auth_module.logout(request, db))

    assert result.status_code == 204


# --- me ---------------------------------------------------------------


def test_me_returns_the_given_user_wrapped_in_a_login_response(db) -> None:
    user = _make_user(db, "auth-me@example.com")

    result = asyncio.run(auth_module.me(user))

    assert result.user.id == user.id
    assert result.user.email == user.email
    assert "password" not in result.user.model_dump()
