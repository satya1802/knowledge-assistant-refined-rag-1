"""Reusable FastAPI dependencies other routers protect their endpoints with.

`current_user` resolves the signed-in user from the session cookie, reading
the sessions table on every call (no cache -- see `app/auth_session.py`).
`require_admin` builds on it for admin-only routes. Both exist here, outside
`app/routers/auth.py`, so any router can import them without importing the
auth router itself.
"""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.auth_session import COOKIE_NAME, get_session_user
from app.database import get_db
from app.models import User

_NOT_AUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
)


def current_user(request: Request, db: DBSession = Depends(get_db)) -> User:  # noqa: B008
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise _NOT_AUTHENTICATED
    user = get_session_user(db, token)
    if user is None:
        raise _NOT_AUTHENTICATED
    return user


def require_admin(user: User = Depends(current_user)) -> User:  # noqa: B008
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
