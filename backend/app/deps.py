"""Reusable FastAPI dependencies other routers protect their endpoints with.

`current_user` resolves the signed-in user from the session cookie, reading
the sessions table on every call (no cache -- see `app/auth_session.py`).
It also enforces that the account is still active (AC-012): a session row
can still be valid while the user behind it has since been disabled by an
administrator, and every protected route must reject that caller on its
very next request, not just at their next login. Enforcing it here, once,
means every router that depends on `current_user` (directly or through
`require_admin`) inherits the check for free -- no route anywhere patches
this in for itself.

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
    if not user.is_active:
        # Same 401 a missing/expired session gets: a disabled account's
        # existing cookie must stop working on its very next request
        # (AC-012), not merely at a future login.
        raise _NOT_AUTHENTICATED
    return user


def require_admin(user: User = Depends(current_user)) -> User:  # noqa: B008
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
