"""POST /auth/login lockout behaviour (US-003-1 / AC-007, AC-008, AC-152).

Time is controlled by monkeypatching the `datetime` name inside
`app.services` (the only module that calls `datetime.utcnow()` for lockout
bookkeeping) with a subclass whose `utcnow()` returns a value the test sets
explicitly. No test sleeps; every "elapsed" minute is a direct assignment.
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import app.services as services_module
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Session as SessionModel
from app.models import User
from app.security import hash_password

client = TestClient(app)

_PASSWORD = "CorrectPass123!"
_WRONG = "WrongPass123!"


@pytest.fixture
def set_now(monkeypatch):
    """Patches app.services.datetime so its utcnow() returns a value this
    test controls, and returns the setter function."""

    class _Frozen(datetime):
        current = datetime(2024, 1, 1, 12, 0, 0)

        @classmethod
        def utcnow(cls):
            return cls.current

    monkeypatch.setattr(services_module, "datetime", _Frozen)

    def _set(dt: datetime) -> None:
        _Frozen.current = dt

    return _set


def _make_user(email: str, *, failed_attempts: int = 0, locked_until=None) -> User:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        db.query(SessionModel).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
        user = User(
            email=email,
            password_hash=hash_password(_PASSWORD),
            role="user",
            failed_attempts=failed_attempts,
            locked_until=locked_until,
        )
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


def test_five_failures_within_the_window_locks_and_sets_locked_until_ahead(set_now) -> None:
    email = "lockout-five@example.com"
    user = _make_user(email)
    t0 = datetime(2024, 1, 1, 12, 0, 0)

    for minute in range(5):
        set_now(t0 + timedelta(minutes=minute))
        response = client.post("/auth/login", json={"email": email, "password": _WRONG})
        assert response.status_code == 401

    reloaded = _reload(user)
    assert reloaded.failed_attempts == 5
    # Re-stamped from the fifth attempt's time (t0 + 4min), not the first.
    expected = t0 + timedelta(minutes=4) + timedelta(minutes=15)
    assert reloaded.locked_until == expected


def test_locked_window_rejects_the_correct_password_with_the_generic_body(set_now) -> None:
    email = "lockout-locked@example.com"
    t0 = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(email, failed_attempts=5, locked_until=t0 + timedelta(minutes=15))

    set_now(t0 + timedelta(minutes=5))
    wrong_response = client.post(
        "/auth/login", json={"email": email, "password": _WRONG}
    )
    correct_response = client.post(
        "/auth/login", json={"email": email, "password": _PASSWORD}
    )

    assert wrong_response.status_code == 401
    assert correct_response.status_code == 401
    assert correct_response.json() == wrong_response.json()

    # The lock attempt with the correct password must not touch counters.
    reloaded = _reload(user)
    assert reloaded.failed_attempts == 5
    assert reloaded.locked_until == t0 + timedelta(minutes=15)


def test_correct_password_after_lock_expiry_succeeds_and_resets_attempts(set_now) -> None:
    email = "lockout-expired@example.com"
    t0 = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(email, failed_attempts=5, locked_until=t0 + timedelta(minutes=15))

    set_now(t0 + timedelta(minutes=16))
    response = client.post("/auth/login", json={"email": email, "password": _PASSWORD})

    assert response.status_code == 200
    reloaded = _reload(user)
    assert reloaded.failed_attempts == 0
    assert reloaded.locked_until is None


def test_successful_login_before_any_lock_resets_a_nonzero_counter(set_now) -> None:
    email = "lockout-partial@example.com"
    t0 = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(email, failed_attempts=3, locked_until=t0 + timedelta(minutes=15))

    set_now(t0 + timedelta(minutes=5))
    response = client.post("/auth/login", json={"email": email, "password": _PASSWORD})

    assert response.status_code == 200
    reloaded = _reload(user)
    assert reloaded.failed_attempts == 0
    assert reloaded.locked_until is None


def test_unknown_email_creates_no_lock_state_and_returns_the_generic_body(set_now) -> None:
    unknown_email = "lockout-unknown@example.com"
    known_email = "lockout-known-for-comparison@example.com"
    _make_user(known_email)
    t0 = datetime(2024, 1, 1, 12, 0, 0)
    set_now(t0)

    unknown_response = client.post(
        "/auth/login", json={"email": unknown_email, "password": _WRONG}
    )
    known_response = client.post(
        "/auth/login", json={"email": known_email, "password": _WRONG}
    )

    assert unknown_response.status_code == 401
    assert unknown_response.json() == known_response.json()

    db = SessionLocal()
    try:
        assert db.query(User).filter(User.email == unknown_email).count() == 0
    finally:
        db.close()
