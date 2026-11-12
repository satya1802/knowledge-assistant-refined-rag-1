"""Unit tests for `app/services.py`: `configured_services` and the sign-in
lockout bookkeeping (`is_account_locked`, `register_failed_login`,
`register_successful_login`), each called directly as a plain function --
no `client` fixture, no `TestClient`, no HTTP layer. Lockout rows are read
and written through a real `SessionLocal` session, exactly as
`backend/tests/unit/test_models.py` and `backend/tests/unit/test_deps.py`
already do for their own modules.

`backend/tests/test_auth_lockout.py` already proves the same lockout rules
end-to-end through `POST /auth/login` (AC-007, AC-008, AC-152). These tests
isolate the bookkeeping functions `app/services.py` actually implements
those criteria with, so a regression in the rolling-window math, the
re-stamping on the fifth failure, or the no-op reset is caught here at the
unit level rather than only by that slower black-box suite.

This ticket carries no acceptance criteria of its own; tests are named
after the module's own documented guarantees, using AC-007/AC-008/AC-152
where one function singlehandedly implements that criterion.

Assumption: `configured_services()`'s own four checks are each already
unit-tested at the level below (`backend/tests/test_config.py` for
`s3_status`/`groq_status`/`ocr_status`, `REDIS_URL` presence being a plain
`os.getenv`). What is not tested anywhere else is that `configured_services`
actually wires each of those checks to the *name* the rest of the app reads
(`app/main.py`'s `/health`) -- that is what this file adds, by monkeypatching
each check independently and confirming the resulting dict reflects it.
"""

import uuid
from datetime import datetime, timedelta

import pytest

import app.services as services_module
from app.database import Base, SessionLocal, engine
from app.models import User
from app.services import (
    LOCKOUT_WINDOW_MINUTES,
    MAX_FAILED_ATTEMPTS,
    configured_services,
    is_account_locked,
    register_failed_login,
    register_successful_login,
)


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _make_user(db, *, failed_attempts: int = 0, locked_until=None) -> User:
    user = User(
        email=f"services-unit-{uuid.uuid4().hex[:10]}@example.com",
        password_hash="irrelevant-hash",
        failed_attempts=failed_attempts,
        locked_until=locked_until,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _reload(db, user_id) -> User:
    return db.query(User).filter(User.id == user_id).one()


# --------------------------------------------------------------------- #
# configured_services
# --------------------------------------------------------------------- #


def test_configured_services_maps_each_name_to_its_own_checks_result(monkeypatch) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(services_module, "s3_status", lambda: _status(True))
    monkeypatch.setattr(services_module, "groq_status", lambda: _status(False))
    monkeypatch.setattr(services_module, "ocr_status", lambda: _status(True))

    result = configured_services()

    assert result == {
        "redis-queue": True,
        "object-storage": True,
        "ai-provider": False,
        "ocr": True,
    }


def test_configured_services_redis_queue_reflects_redis_url_presence(monkeypatch) -> None:
    monkeypatch.setattr(services_module, "s3_status", lambda: _status(False))
    monkeypatch.setattr(services_module, "groq_status", lambda: _status(False))
    monkeypatch.setattr(services_module, "ocr_status", lambda: _status(False))

    monkeypatch.delenv("REDIS_URL", raising=False)
    assert configured_services()["redis-queue"] is False

    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    assert configured_services()["redis-queue"] is True


def test_configured_services_object_storage_tracks_s3_status_not_a_hardcoded_value(
    monkeypatch,
) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(services_module, "groq_status", lambda: _status(False))
    monkeypatch.setattr(services_module, "ocr_status", lambda: _status(False))

    monkeypatch.setattr(services_module, "s3_status", lambda: _status(False))
    assert configured_services()["object-storage"] is False

    monkeypatch.setattr(services_module, "s3_status", lambda: _status(True))
    assert configured_services()["object-storage"] is True


def test_configured_services_ai_provider_and_ocr_are_checked_independently(monkeypatch) -> None:
    """A regression that swaps the ai-provider and ocr checks, or that
    makes one follow the other, must fail this test: they are set to
    opposite values and each key is asserted against its own check."""
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(services_module, "s3_status", lambda: _status(False))
    monkeypatch.setattr(services_module, "groq_status", lambda: _status(True))
    monkeypatch.setattr(services_module, "ocr_status", lambda: _status(False))

    result = configured_services()

    assert result["ai-provider"] is True
    assert result["ocr"] is False


def _status(enabled: bool):
    class _Fake:
        pass

    fake = _Fake()
    fake.enabled = enabled
    return fake


# --------------------------------------------------------------------- #
# is_account_locked (AC-008)
# --------------------------------------------------------------------- #


def test_ac008_is_account_locked_false_below_the_failure_threshold(db) -> None:
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(
        db, failed_attempts=MAX_FAILED_ATTEMPTS - 1, locked_until=now + timedelta(minutes=15)
    )

    assert is_account_locked(user, now=now) is False


def test_ac008_is_account_locked_true_at_the_threshold_within_the_lock_window(db) -> None:
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(
        db, failed_attempts=MAX_FAILED_ATTEMPTS, locked_until=now + timedelta(minutes=15)
    )

    assert is_account_locked(user, now=now) is True


def test_ac008_is_account_locked_false_once_the_lock_expiry_has_passed(db) -> None:
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(
        db, failed_attempts=MAX_FAILED_ATTEMPTS, locked_until=now - timedelta(seconds=1)
    )

    assert is_account_locked(user, now=now) is False


def test_ac008_is_account_locked_false_exactly_at_the_lock_expiry_instant(db) -> None:
    """`now < user.locked_until` is strict: the expiry instant itself is
    already unlocked, not the last locked moment."""
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(db, failed_attempts=MAX_FAILED_ATTEMPTS, locked_until=now)

    assert is_account_locked(user, now=now) is False


def test_is_account_locked_false_with_no_tracked_lock_regardless_of_attempts(db) -> None:
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(db, failed_attempts=MAX_FAILED_ATTEMPTS, locked_until=None)

    assert is_account_locked(user, now=now) is False


def test_is_account_locked_defaults_now_to_the_current_time_when_not_passed(db) -> None:
    far_future = datetime.utcnow() + timedelta(days=365)
    user = _make_user(db, failed_attempts=MAX_FAILED_ATTEMPTS, locked_until=far_future)

    assert is_account_locked(user) is True


# --------------------------------------------------------------------- #
# register_failed_login (AC-007)
# --------------------------------------------------------------------- #


def test_ac007_register_failed_login_starts_a_fresh_window_on_the_first_failure(db) -> None:
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(db)

    register_failed_login(db, user, now=now)

    reloaded = _reload(db, user.id)
    assert reloaded.failed_attempts == 1
    assert reloaded.locked_until == now + timedelta(minutes=LOCKOUT_WINDOW_MINUTES)


def test_ac007_register_failed_login_counts_within_an_active_window_without_re_stamping(
    db,
) -> None:
    t0 = datetime(2024, 1, 1, 12, 0, 0)
    window_end = t0 + timedelta(minutes=LOCKOUT_WINDOW_MINUTES)
    user = _make_user(db, failed_attempts=1, locked_until=window_end)

    register_failed_login(db, user, now=t0 + timedelta(minutes=1))

    reloaded = _reload(db, user.id)
    assert reloaded.failed_attempts == 2
    # Below the lock threshold: the window expiry itself does not move yet.
    assert reloaded.locked_until == window_end


def test_ac007_register_failed_login_re_stamps_locked_until_on_the_threshold_failure(
    db,
) -> None:
    t0 = datetime(2024, 1, 1, 12, 0, 0)
    window_end = t0 + timedelta(minutes=LOCKOUT_WINDOW_MINUTES)
    user = _make_user(db, failed_attempts=MAX_FAILED_ATTEMPTS - 1, locked_until=window_end)
    attempt_time = t0 + timedelta(minutes=4)

    register_failed_login(db, user, now=attempt_time)

    reloaded = _reload(db, user.id)
    assert reloaded.failed_attempts == MAX_FAILED_ATTEMPTS
    # Re-stamped from *this* attempt's time, not the window's original end.
    assert reloaded.locked_until == attempt_time + timedelta(minutes=LOCKOUT_WINDOW_MINUTES)
    assert reloaded.locked_until != window_end


def test_register_failed_login_starts_a_fresh_window_once_the_previous_one_has_elapsed(
    db,
) -> None:
    t0 = datetime(2024, 1, 1, 12, 0, 0)
    old_window_end = t0 + timedelta(minutes=LOCKOUT_WINDOW_MINUTES)
    user = _make_user(db, failed_attempts=4, locked_until=old_window_end)
    later = old_window_end + timedelta(minutes=1)

    register_failed_login(db, user, now=later)

    reloaded = _reload(db, user.id)
    # The stale window's count is discarded, not carried forward past its
    # own expiry -- this is a fresh first failure, not the fifth.
    assert reloaded.failed_attempts == 1
    assert reloaded.locked_until == later + timedelta(minutes=LOCKOUT_WINDOW_MINUTES)


def test_register_failed_login_persists_through_the_session_passed_in(db) -> None:
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(db)

    register_failed_login(db, user, now=now)

    # Read back through a brand-new session, proving the write was
    # committed rather than only mutated on the in-memory object.
    other_session = SessionLocal()
    try:
        fetched = other_session.query(User).filter(User.id == user.id).one()
        assert fetched.failed_attempts == 1
    finally:
        other_session.close()


# --------------------------------------------------------------------- #
# register_successful_login (AC-152)
# --------------------------------------------------------------------- #


def test_ac152_register_successful_login_clears_failed_attempts_and_the_lock(db) -> None:
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(
        db, failed_attempts=MAX_FAILED_ATTEMPTS, locked_until=now + timedelta(minutes=15)
    )

    register_successful_login(db, user)

    reloaded = _reload(db, user.id)
    assert reloaded.failed_attempts == 0
    assert reloaded.locked_until is None


def test_ac152_register_successful_login_clears_a_partial_unlocked_counter_too(db) -> None:
    """Even below the lock threshold, any nonzero count is wiped by a
    success -- the rolling window does not survive a correct password."""
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(db, failed_attempts=2, locked_until=now + timedelta(minutes=15))

    register_successful_login(db, user)

    reloaded = _reload(db, user.id)
    assert reloaded.failed_attempts == 0
    assert reloaded.locked_until is None


def test_register_successful_login_is_a_noop_when_there_is_nothing_to_clear(db) -> None:
    """The module's docstring promises a no-op (no write) when there is no
    tracked failure/lock to clear. Wrapping `commit` on the session passed
    in and asserting it was never called is the only way to tell that
    guarantee apart from a version that unconditionally writes zeros."""
    user = _make_user(db)
    assert user.failed_attempts == 0
    assert user.locked_until is None

    commit_calls = []
    original_commit = db.commit

    def _tracked_commit():
        commit_calls.append(1)
        return original_commit()

    db.commit = _tracked_commit

    register_successful_login(db, user)

    assert commit_calls == []


def test_register_successful_login_does_not_raise_when_called_twice_in_a_row(db) -> None:
    now = datetime(2024, 1, 1, 12, 0, 0)
    user = _make_user(db, failed_attempts=3, locked_until=now + timedelta(minutes=15))

    register_successful_login(db, user)
    register_successful_login(db, user)

    reloaded = _reload(db, user.id)
    assert reloaded.failed_attempts == 0
    assert reloaded.locked_until is None
