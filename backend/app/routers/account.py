"""The signed-in user's own password and theme preference (US-037, US-038).

Both endpoints require an authenticated session (`app.deps.current_user`)
and operate only on the caller's own row -- neither takes a user id, so
there is nothing for a caller to point at another account.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import current_user
from app.models import User
from app.schemas import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    ThemeRequest,
    ThemeResponse,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/account", tags=["account"])


@router.post("/password", response_model=ChangePasswordResponse)
async def change_password(
    payload: ChangePasswordRequest,
    db: DBSession = Depends(get_db),  # noqa: B008
    user: User = Depends(current_user),  # noqa: B008
) -> ChangePasswordResponse:
    if not verify_password(payload.current_password, user.password_hash):
        # Current hash is left untouched (AC-081): nothing is written
        # before this check passes.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return ChangePasswordResponse()


@router.patch("/theme", response_model=ThemeResponse)
async def set_theme(
    payload: ThemeRequest,
    db: DBSession = Depends(get_db),  # noqa: B008
    user: User = Depends(current_user),  # noqa: B008
) -> ThemeResponse:
    # payload.theme is already constrained to 'light' | 'dark' | 'system' by
    # the schema's Literal; any other value is rejected before this runs.
    user.theme = payload.theme
    db.commit()
    return ThemeResponse(theme=user.theme)
