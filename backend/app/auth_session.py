"""Server-side session issuance, lookup and revocation.

Sessions are rows in the `sessions` table (see `app/models.py`); the cookie
only ever carries an opaque, unguessable token whose SHA-256 is what gets
stored and compared, so a leaked database backup does not hand out usable
cookies. Every lookup re-reads the table (AC-004/AC-006): there is no
in-process cache, so a backend restart does not invalidate a still-valid
session and an expired or revoked one is rejected immediately everywhere.
"""

import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session as DBSession

from app.config import session_lifetime_days
from app.models import Session as SessionModel
from app.models import User

COOKIE_NAME = "session_token"


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: DBSession, user_id) -> tuple[str, SessionModel]:
    """Create a session row for `user_id`; returns the plaintext token (for
    the cookie) and the row (for its id/expiry)."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=session_lifetime_days())
    session = SessionModel(
        user_id=user_id,
        token_hash=_hash_token(token),
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return token, session


def get_session_user(db: DBSession, token: str) -> User | None:
    """The user a still-valid, unrevoked session token belongs to, or None."""
    session = (
        db.query(SessionModel).filter(SessionModel.token_hash == _hash_token(token)).first()
    )
    if session is None:
        return None
    if session.revoked_at is not None:
        return None
    if session.expires_at < datetime.utcnow():
        return None
    return db.query(User).filter(User.id == session.user_id).first()


def revoke_session(db: DBSession, token: str) -> None:
    """Deletes the session row for `token`, if one exists (AC-005)."""
    session = (
        db.query(SessionModel).filter(SessionModel.token_hash == _hash_token(token)).first()
    )
    if session is not None:
        db.delete(session)
        db.commit()
