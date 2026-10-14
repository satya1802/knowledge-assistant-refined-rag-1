"""Database-backed application settings (US-021-1).

Replaces the former GET/PATCH /settings stubs: the in-force values live as
rows in `app_settings` (key/value/updated_at), seeded by the additive
alembic migration `0002_seed_app_settings.py` with the product defaults --
a 0.62 similarity threshold and the server-configured answer model name --
so `GET /settings` returns a real value from the very first request rather
than a hard-coded one, and `PATCH /settings` persists a change that the
very next `POST /chat` applies with no code change or redeploy (AC-051).

Every reader here goes straight to the database on every call; nothing is
cached in-process, so the threshold `app/retrieval.py` applies is always
the one most recently written, never a value captured at import time or at
request-start.
"""

from __future__ import annotations

from sqlalchemy.orm import Session as DBSession

from app.models import AppSetting
from app.settings import settings as server_settings

SIMILARITY_THRESHOLD_KEY = "similarity_threshold"
ANSWER_MODEL_KEY = "answer_model"

# AC-051: the product default, in force until an admin ever changes it.
DEFAULT_SIMILARITY_THRESHOLD = 0.62


def _get(db: DBSession, key: str):
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row is not None else None


def _set(db: DBSession, key: str, value) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value
        db.add(row)
    db.commit()


def get_similarity_threshold(db: DBSession) -> float:
    """The threshold in force right now (AC-051): 0.62 until a row exists,
    the persisted value from then on. Read fresh on every call -- never
    cached -- so a value written by a PATCH a moment ago is what the very
    next read sees."""
    value = _get(db, SIMILARITY_THRESHOLD_KEY)
    if value is None:
        return DEFAULT_SIMILARITY_THRESHOLD
    try:
        return float(value)
    except (TypeError, ValueError):
        return DEFAULT_SIMILARITY_THRESHOLD


def set_similarity_threshold(db: DBSession, value: float) -> float:
    """Persists a new in-force threshold (AC-051). Range validation (422 on
    an invalid value) happens in the request schema, before this is ever
    called -- this function only writes what it is given."""
    _set(db, SIMILARITY_THRESHOLD_KEY, float(value))
    return float(value)


def get_answer_model(db: DBSession) -> str:
    """The answer model name in force: a persisted override if one has ever
    been written, otherwise the server-configured `ANSWER_MODEL` default."""
    value = _get(db, ANSWER_MODEL_KEY)
    if value:
        return str(value)
    return server_settings.answer_model


def set_answer_model(db: DBSession, value: str) -> str:
    _set(db, ANSWER_MODEL_KEY, str(value))
    return str(value)


def get_settings_snapshot(db: DBSession) -> dict:
    """The full `GET /settings` body (contract): both values in force right
    now, read fresh from the database."""
    return {
        "similarity_threshold": get_similarity_threshold(db),
        "answer_model": get_answer_model(db),
    }


__all__ = [
    "ANSWER_MODEL_KEY",
    "DEFAULT_SIMILARITY_THRESHOLD",
    "SIMILARITY_THRESHOLD_KEY",
    "get_answer_model",
    "get_settings_snapshot",
    "get_similarity_threshold",
    "set_answer_model",
    "set_similarity_threshold",
]
