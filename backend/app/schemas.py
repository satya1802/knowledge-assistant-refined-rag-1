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

from pydantic import BaseModel, Field


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
    theme: Literal["light", "dark", "system"] = "system"

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


class ChangePasswordResponse(BaseModel):
    """Confirms the password change without echoing anything secret
    (AC-080): just a success flag the UI can show a message against."""

    status: str = "ok"


class ThemeRequest(BaseModel):
    theme: Literal["light", "dark", "system"]


class ThemeResponse(BaseModel):
    theme: Literal["light", "dark", "system"]


class ReprocessRequest(BaseModel):
    mode: Literal["retry", "reindex"]


class ConversationCreateRequest(BaseModel):
    title: str | None = None


class ChatRequest(BaseModel):
    conversation_id: str
    question: str


class CitationOut(BaseModel):
    """One retrieved chunk cited in a chat answer."""

    number: int
    document_id: uuid.UUID
    chunk_id: uuid.UUID
    filename: str | None = None
    page_ref: int | None = None
    section_ref: str | None = None
    text_preview: str | None = None
    score: float


class ChatResponse(BaseModel):
    """POST /chat's response (contract): retrieval (AC-049/AC-050) has
    already run by the time this is built. `answer` is a placeholder until
    US-042-1 wires in real generation; `citations` is never more than what
    retrieval actually returned, and is empty exactly when retrieval found
    nothing at or above the in-force threshold."""

    conversation_id: str
    answer: str
    from_documents: bool
    citations: list[CitationOut] = Field(default_factory=list)


class SettingsOut(BaseModel):
    """GET/PATCH /settings response (contract): the values in force right
    now, read fresh from the database on every call -- never a value
    captured at import time or hard-coded in the router."""

    similarity_threshold: float
    answer_model: str


class SettingsPatchRequest(BaseModel):
    """PATCH /settings body (contract). `similarity_threshold` must be a
    valid cosine-similarity bound -- outside [0, 1] is rejected with 422
    before the handler ever runs. `answer_model` is accepted too (the
    underlying `app_settings` row already exists for it) but the contract's
    documented use is `similarity_threshold`."""

    similarity_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    answer_model: str | None = None


class DocumentCreateOut(BaseModel):
    """What POST /documents returns (AC-015): the created row's id and the
    identifying fields the caller just supplied, plus its initial
    'processing' status -- not the full listing shape, which also needs a
    chunk count and uploader display name that do not exist yet for a
    document this new."""

    id: uuid.UUID
    filename: str
    file_type: str
    size_bytes: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentOut(BaseModel):
    """What GET /documents returns, one row per document (AC-034/AC-036)."""

    id: uuid.UUID
    filename: str
    file_type: str
    size_bytes: int
    status: str
    failure_reason: str | None = None
    notes: str | None = None
    chunk_count: int
    uploaded_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentStatsOut(BaseModel):
    """What GET /documents/stats returns, computed from the database."""

    total: int
    ready: int
    processing: int
    failed: int
    chunks: int
    bytes: int
