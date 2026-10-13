"""Pydantic request and response models.

Request bodies are typed from the approved API spec so the OpenAPI document
and any generated client are accurate before a single handler does real
work. Responses stay the generic `StubResponse` below -- the actual response
shapes (and the behaviour that fills them) are development-sprint work, one
endpoint at a time.
"""

import uuid
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


class LoginResponse(BaseModel):
    user: UserOut


class CreateUserRequest(BaseModel):
    email: str
    temp_password: str
    role: str


class PatchUserRequest(BaseModel):
    is_active: bool | None = None
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
