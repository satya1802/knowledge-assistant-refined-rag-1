"""Unit tests for `app/auth_session.py`: session issuance, lookup and
revocation, exercised directly against `SessionModel`/`User` rows (no
`client`/`TestClient`, no HTTP layer -- that belongs in
`backend/tests/integration/`).

Covers the module's own documented guarantees:
  * the stored `token_hash` is never the plaintext cookie token (sha256 of
    it instead), so a leaked database backup hands out nothing usable;
  * `get_session_user` re-reads the table every call and rejects a revoked
    session (AC-004) or an expired one (AC-006) immediately, with no
    in-process cache to go stale;
  * `revoke_session` deletes the row for a valid token (AC-005) and is a
    silent no-op for a token that matches no row.

Time is controlled the same way `tests/test_auth_lockout.py` controls it:
by writing `expires_at`/`revoked_at` directly rather than sleeping.
"""

import hashlib
from datetime import datetime, timedelta

import pytest

import app.auth_session as auth_session_module
from app.auth_session import COOKIE_NAME, create_session, get_session_user, revoke_session
from app.database import Base, SessionLocal, engine
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


def _make_user(db, email: str) -> User:
    db.query(SessionModel).filter(
        SessionModel.user_id.in_(db.query(User.id).filter(User.email == email))
    ).delete(synchronize_session=False)
    db.query(User).filter(User.email == email).delete()
    db.commit()
    user = User(email=email, password_hash=hash_password("Irrelevant123!"), role="user")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_cookie_name_is_the_documented_constant() -> None:
    assert COOKIE_NAME == "session_token"


def test_create_session_returns_plaintext_token_and_row_whose_hash_matches(db) -> None:
    user = _make_user(db, "create-session@example.com")

    token, session = create_session(db, user.id)

    assert isinstance(token, str) and len(token) > 20
    assert session.user_id == user.id
    assert session.revoked_at is None
    # The stored hash is derived from the plaintext token, not the token
    # itself: a backup of this row never hands out a usable cookie.
    assert session.token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert session.token_hash != token


def test_create_session_sets_expiry_from_the_configured_lifetime(db, monkeypatch) -> None:
    monkeypatch.setattr(auth_session_module, "session_lifetime_days", lambda: 3)
    user = _make_user(db, "lifetime@example.com")

    before = datetime.utcnow()
    _token, session = create_session(db, user.id)
    after = datetime.utcnow()

    assert before + timedelta(days=3) <= session.expires_at <= after + timedelta(days=3)


def test_get_session_user_returns_the_owning_user_for_a_valid_token(db) -> None:
    user = _make_user(db, "lookup-valid@example.com")
    token, _session = create_session(db, user.id)

    found = get_session_user(db, token)

    assert found is not None
    assert found.id == user.id
    assert found.email == user.email


def test_get_session_user_returns_none_for_an_unknown_token(db) -> None:
    _make_user(db, "lookup-unknown@example.com")

    assert get_session_user(db, "a-token-that-was-never-issued") is None


def test_ac004_get_session_user_rejects_a_revoked_session(db) -> None:
    user = _make_user(db, "lookup-revoked@example.com")
    token, session = create_session(db, user.id)

    session.revoked_at = datetime.utcnow()
    db.add(session)
    db.commit()

    assert get_session_user(db, token) is None


def test_ac006_get_session_user_rejects_an_expired_session(db) -> None:
    user = _make_user(db, "lookup-expired@example.com")
    token, session = create_session(db, user.id)

    session.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.add(session)
    db.commit()

    assert get_session_user(db, token) is None


def test_ac005_revoke_session_deletes_the_row_for_a_valid_token(db) -> None:
    user = _make_user(db, "revoke-valid@example.com")
    token, session = create_session(db, user.id)

    revoke_session(db, token)

    assert db.query(SessionModel).filter(SessionModel.id == session.id).first() is None
    assert get_session_user(db, token) is None


def test_revoke_session_on_an_unknown_token_is_a_silent_no_op(db) -> None:
    user = _make_user(db, "revoke-unknown@example.com")
    token, session = create_session(db, user.id)

    # Revoking a token nobody issued must not touch the real session row.
    revoke_session(db, "a-token-that-was-never-issued")

    assert db.query(SessionModel).filter(SessionModel.id == session.id).first() is not None
    assert get_session_user(db, token) is not None
