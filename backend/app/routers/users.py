"""User administration: bootstrap, list, create and enable/disable/promote.

The first account ever created has no administrator to authorize it, so
account creation is open -- unauthenticated -- for exactly as long as the
`users` table is empty, and that first account is always created as role
'admin' (AC-009). Every account after that must be created by an
authenticated administrator and is always created as role 'user'; nothing a
caller supplies in the request body can change that (AC-010) -- the request
schema does not even accept a role.

POST /users returns the password the caller just set for the new account
exactly once, in that response body only (AC-011): no other endpoint -- not
GET /users, not `/auth/me` -- ever carries it, and no email is sent. Role
changes (grant or removal of 'admin') happen only through PATCH
/users/{id}, never at creation time.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import current_user, require_admin
from app.models import User
from app.schemas import CreateUserRequest, CreateUserResponse, PatchUserRequest, UserListOut, UserOut
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserListOut])
async def list_users(
    db: DBSession = Depends(get_db),  # noqa: B008
    _admin: User = Depends(require_admin),  # noqa: B008
) -> list[User]:
    return db.query(User).order_by(User.created_at).all()


@router.post("", response_model=CreateUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateUserRequest,
    request: Request,
    db: DBSession = Depends(get_db),  # noqa: B008
) -> CreateUserResponse:
    has_any_user = db.query(User.id).first() is not None

    if has_any_user:
        # Not the bootstrap case: resolve the caller from their session
        # cookie (401 when missing/invalid/disabled) and require admin
        # (403 otherwise) -- AC-014.
        caller = current_user(request, db)
        if caller.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
        role = "user"
    else:
        role = "admin"

    email = payload.email.lower()
    if db.query(User.id).filter(User.email == email).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # The plaintext only ever lives in this local variable and this one
    # response body -- it is never logged (see app/logging_config.py /
    # app/security.py) and never persisted anywhere but as the bcrypt hash
    # already committed above.
    return CreateUserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        temporary_password=payload.password,
    )


@router.patch("/{user_id}", response_model=UserOut)
async def patch_user(
    user_id: str,
    payload: PatchUserRequest,
    db: DBSession = Depends(get_db),  # noqa: B008
    _admin: User = Depends(require_admin),  # noqa: B008
) -> User:
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found") from exc

    user = db.query(User).filter(User.id == parsed_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.is_active is not None:
        # Takes effect immediately: app/deps.current_user rejects the
        # disabled user's next request on their existing session (AC-012).
        user.is_active = payload.is_active
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.role is not None:
        # Grants or removes 'admin'; the new role is live on the very next
        # request because require_admin re-reads this row every time
        # (AC-013) -- nothing here is cached.
        user.role = payload.role

    db.commit()
    db.refresh(user)
    return user
