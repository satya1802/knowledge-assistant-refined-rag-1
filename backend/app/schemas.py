"""Pydantic request and response models.

Request bodies are typed from the approved API spec so the OpenAPI document
and any generated client are accurate before a single handler does real
work. Responses stay the generic `StubResponse` below for endpoints that are
still stubs -- the actual response shapes (and the behaviour that fills
them) are development-sprint work, one endpoint at a time.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class StubResponse(BaseModel):
    """What a generated route returns until someone implements it.

    A stub that returns a typed body rather than raising keeps the service
    startable and its OpenAPI document complete, so the frontend can be built
    against the agreed shape while the handlers are still being written.
    """

    endpoint: str
    status: str = "not_implemented"
    detail: str = "Scaffolded from the approved API spec; no behaviour yet."


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    """What a user looks like in any response -- never a password or hash
    (AC-001/AC-003)."""

    id: uuid.UUID
    email: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class UserListOut(UserOut):
    """The shape GET /users returns: `UserOut` plus `created_at`. Never a
    password (AC-011): GET /users and `/auth/me` only ever carry this shape
    or `UserOut`, neither of which has a password field."""

    created_at: datetime


class CreateUserResponse(UserOut):
    """The shape POST /users returns (AC-011): the persisted account plus
    the temporary password the caller supplied for it, present in this one
    response body and nowhere else -- not in GET /users, not in
    `/auth/me`, and not emailed anywhere."""

    temporary_password: str


class LoginResponse(BaseModel):
    user: UserOut


class CreateUserRequest(BaseModel):
    """POST /users body (US-001-2 / AC-009 / AC-010).

    No `role` field: the server alone decides role (admin only for the very
    first account, 'user' for every account after that) -- there is nothing
    for a caller to supply or for the server to ignore.
    """

    email: str
    password: str


class PatchUserRequest(BaseModel):
    is_active: bool | None = None
    password: str | None = None
    role: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ThemeRequest(BaseModel):
    theme: Literal["light", "dark", "system"]


class ReprocessRequest(BaseModel):
    mode: Literal["retry", "reindex"]


class ConversationCreateRequest(BaseModel):
    title: str | None = None


class ChatRequest(BaseModel):
    conversation_id: str
    question: str


class SettingsPatchRequest(BaseModel):
    threshold: float | None = None
    answer_model: str | None = None
