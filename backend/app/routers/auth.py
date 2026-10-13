"""Auth endpoints: sign-in, sign-out and the current session.

Login creates a DB-backed session row and sets an HTTP-only cookie (US-001);
logout deletes that row and clears the cookie (US-005); `/me` resolves the
caller from the cookie, re-reading the sessions table every time
(`app/deps.current_user`) rather than trusting anything cached in-process.

Login also enforces per-email lockout (US-003-1): five failed attempts
within a rolling 15-minute window locks that email for 15 minutes
(AC-007); while locked, even the correct password is refused with the same
generic body as any other failure (AC-008), and a successful sign-in after
the window has elapsed clears the tracked failures (AC-152). The lockout
bookkeeping itself lives in `app/services.py`; this handler only calls it at
the right points.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session as DBSession

from app.auth_session import COOKIE_NAME, create_session, revoke_session
from app.config import session_lifetime_days
from app.database import get_db
from app.deps import current_user
from app.models import User
from app.schemas import LoginRequest, LoginResponse, UserOut
from app.security import verify_against_dummy, verify_password
from app.services import is_account_locked, register_failed_login, register_successful_login

router = APIRouter(prefix="/auth", tags=["auth"])

# Identical for an unknown email, a wrong password, a disabled account and a
# locked-out account (AC-002/AC-008/AC-151) -- nothing in the body tells an
# attacker which case it was.
_BAD_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Email or password is incorrect",
)


def _request_is_https(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    return request.headers.get("x-forwarded-proto", "").lower() == "https"


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),  # noqa: B008
) -> LoginResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()

    if user is None:
        # Spend the same time a real check would, so an unknown email is not
        # faster than a wrong password (AC-002).
        verify_against_dummy(payload.password)
        raise _BAD_CREDENTIALS

    if is_account_locked(user):
        # Same dummy-hash timing path as an unknown email, so a locked
        # account is not distinguishable from any other failure by response
        # body, status code or timing (AC-008).
        verify_against_dummy(payload.password)
        raise _BAD_CREDENTIALS

    password_ok = verify_password(payload.password, user.password_hash)
    if not password_ok:
        register_failed_login(db, user)
        raise _BAD_CREDENTIALS

    if not user.is_active:
        raise _BAD_CREDENTIALS

    register_successful_login(db, user)

    token, _session = create_session(db, user.id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=_request_is_https(request),
        max_age=session_lifetime_days() * 86400,
        path="/",
    )
    return LoginResponse(user=UserOut.model_validate(user))


@router.post("/logout", status_code=204)
async def logout(request: Request, db: DBSession = Depends(get_db)) -> Response:  # noqa: B008
    token = request.cookies.get(COOKIE_NAME)
    if token:
        revoke_session(db, token)
    resp = Response(status_code=204)
    resp.delete_cookie(key=COOKIE_NAME, path="/")
    return resp


@router.get("/me", response_model=LoginResponse)
async def me(user: User = Depends(current_user)) -> LoginResponse:  # noqa: B008
    return LoginResponse(user=UserOut.model_validate(user))
