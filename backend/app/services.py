"""The backing services this application is configured to reach, plus
sign-in lockout bookkeeping (US-003-1).

Each entry in SERVICE_CHECKS maps an architecture component to a check of
whether the environment variables it needs are set. Redis is set from
docker-compose.yml through .env.example, so a fresh clone reports it
configured. Object storage, the Groq AI provider and OCR read the keys the
product owner has not set yet (see `app/config.py`): they report themselves
unconfigured until those keys exist, exactly as the features built on them
must at their own point of use.

Lockout state (`User.failed_attempts`, `User.locked_until`) lives in the
users table, not in-process, so a backend restart never clears it (one of
the acceptance criteria for US-003-1). The two columns double as both the
rolling 15-minute failure window *and*, once five failures land inside that
window, the lock expiry itself: `locked_until` is the moment the current
tracking period (window or lock) ends, and `failed_attempts` is how many
failures have landed inside it so far. Naive `datetime.utcnow()` is used
throughout, consistent with `app/models.py`'s own column defaults and with
`app/auth_session.py`'s session-expiry comparisons.
"""

import os
from datetime import datetime, timedelta

from sqlalchemy.orm import Session as DBSession

from app.config import groq_status, ocr_status, s3_status
from app.models import User

SERVICE_CHECKS = {
    "redis-queue": lambda: bool(os.getenv("REDIS_URL")),
    "object-storage": lambda: s3_status().enabled,
    "ai-provider": lambda: groq_status().enabled,
    "ocr": lambda: ocr_status().enabled,
}


def configured_services() -> dict[str, bool]:
    """Each service mapped to whether it is currently usable."""
    return {name: check() for name, check in SERVICE_CHECKS.items()}


# --- Sign-in lockout (US-003-1 / AC-007, AC-008, AC-152) -------------------

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 15


def is_account_locked(user: User, now: datetime | None = None) -> bool:
    """True while `user` is within an active lock (AC-008): five or more
    failures recorded, and the lock/window expiry has not yet passed."""
    now = now or datetime.utcnow()
    return (
        user.failed_attempts >= MAX_FAILED_ATTEMPTS
        and user.locked_until is not None
        and now < user.locked_until
    )


def register_failed_login(db: DBSession, user: User, now: datetime | None = None) -> None:
    """Records one failed sign-in attempt for `user` (AC-007).

    A failure starts a fresh rolling window when there is no tracked window
    yet or the previous one has elapsed; otherwise it counts within the
    existing window. The fifth failure inside a window re-stamps
    `locked_until` to fifteen minutes from *that* attempt, which is the
    actual lock expiry a subsequent call to `is_account_locked` checks
    against.
    """
    now = now or datetime.utcnow()
    if user.locked_until is None or now > user.locked_until:
        user.failed_attempts = 1
        user.locked_until = now + timedelta(minutes=LOCKOUT_WINDOW_MINUTES)
    else:
        user.failed_attempts += 1
        if user.failed_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = now + timedelta(minutes=LOCKOUT_WINDOW_MINUTES)
    db.add(user)
    db.commit()


def register_successful_login(db: DBSession, user: User) -> None:
    """Clears any tracked failures/lock after a successful sign-in
    (AC-152). A no-op when there is nothing to clear, so every successful
    login does not force an unnecessary write."""
    if user.failed_attempts or user.locked_until is not None:
        user.failed_attempts = 0
        user.locked_until = None
        db.add(user)
        db.commit()
