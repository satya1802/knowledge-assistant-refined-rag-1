"""Unit tests for `app/schemas.py`: each Pydantic request/response model
constructed and validated directly, never through `client`/`TestClient`
(that belongs in `backend/tests/integration/`, which already exercises
these shapes end-to-end -- e.g. `tests/test_user_provisioning.py` for
`CreateUserResponse`, `tests/test_settings.py` for `SettingsPatchRequest`,
`tests/test_chat_rag.py` for `ChatResponse`/`CitationOut`).

This ticket carries no acceptance criteria of its own. Where the module's
own docstrings name an AC (AC-001/AC-003, AC-009-AC-011, AC-034/AC-036,
AC-049/AC-050/AC-054/AC-059, AC-080), the test covering that guarantee is
named after it; the rest are named after the schema's own documented shape:
required vs. optional fields, defaults, the `Literal` choices a field is
restricted to, and the `model_config = {"from_attributes": True}` wiring
that lets a response model build straight from an ORM row.

Assumptions:
  * `model_config = {"from_attributes": True}` is exercised by constructing
    each such model with `model_validate` against a plain `SimpleNamespace`
    standing in for an ORM row -- never a real database session -- since
    the point under test is the schema's own field-mapping/validation, not
    anything SQLAlchemy does (that belongs to `tests/unit/test_models.py`).
  * "Never a password" (AC-001/AC-003/AC-011) is checked the same way the
    router tests do: dumping the model and asserting no `password`/
    `password_hash` key appears, rather than asserting on the full set of
    fields a model happens to have today.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.schemas import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    ChatRequest,
    ChatResponse,
    CitationOut,
    ConversationCreateRequest,
    ConversationDetailOut,
    ConversationSummaryOut,
    CreateUserRequest,
    CreateUserResponse,
    DocumentCreateOut,
    DocumentOut,
    DocumentStatsOut,
    LoginRequest,
    LoginResponse,
    MessageOut,
    PatchUserRequest,
    ReprocessRequest,
    SettingsOut,
    SettingsPatchRequest,
    StubResponse,
    ThemeRequest,
    ThemeResponse,
    UserListOut,
    UserOut,
)

# --------------------------------------------------------------------- #
# StubResponse
# --------------------------------------------------------------------- #


def test_stub_response_only_requires_endpoint_and_defaults_the_rest() -> None:
    stub = StubResponse(endpoint="/documents")

    assert stub.status == "not_implemented"
    assert "no behaviour yet" in stub.detail


def test_stub_response_requires_endpoint() -> None:
    with pytest.raises(ValidationError):
        StubResponse()


# --------------------------------------------------------------------- #
# LoginRequest / LoginResponse
# --------------------------------------------------------------------- #


def test_login_request_requires_both_email_and_password() -> None:
    with pytest.raises(ValidationError):
        LoginRequest(email="a@example.com")
    with pytest.raises(ValidationError):
        LoginRequest(password="secret")

    request = LoginRequest(email="a@example.com", password="secret")
    assert request.email == "a@example.com"
    assert request.password == "secret"


def test_login_response_wraps_a_user_out_with_no_password() -> None:
    row = SimpleNamespace(
        id=uuid.uuid4(),
        email="a@example.com",
        role="user",
        is_active=True,
        theme="system",
        password_hash="should-never-appear",
    )

    response = LoginResponse(user=UserOut.model_validate(row))

    dumped = response.model_dump()
    assert "password" not in dumped["user"]
    assert "password_hash" not in dumped["user"]
    assert dumped["user"]["email"] == "a@example.com"


# --------------------------------------------------------------------- #
# UserOut -- AC-001/AC-003: never a password or hash
# --------------------------------------------------------------------- #


def _user_row(**overrides) -> SimpleNamespace:
    base = dict(
        id=uuid.uuid4(),
        email="user@example.com",
        role="user",
        is_active=True,
        theme="system",
        password_hash="super-secret-hash",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_ac001_user_out_builds_from_an_orm_like_row_via_from_attributes() -> None:
    row = _user_row()

    user = UserOut.model_validate(row)

    assert user.id == row.id
    assert user.email == row.email
    assert user.role == row.role
    assert user.is_active is True


def test_ac001_user_out_dump_never_carries_a_password_or_hash() -> None:
    row = _user_row()

    dumped = UserOut.model_validate(row).model_dump()

    assert "password" not in dumped
    assert "password_hash" not in dumped
    assert set(dumped) == {"id", "email", "role", "is_active", "theme"}


def test_user_out_theme_defaults_to_system_when_the_row_has_none() -> None:
    row = _user_row()
    del row.__dict__["theme"]

    user = UserOut.model_validate(row)

    assert user.theme == "system"


@pytest.mark.parametrize("theme", ["light", "dark", "system"])
def test_user_out_accepts_every_documented_theme(theme: str) -> None:
    user = UserOut.model_validate(_user_row(theme=theme))

    assert user.theme == theme


def test_user_out_rejects_a_theme_outside_the_documented_choices() -> None:
    with pytest.raises(ValidationError):
        UserOut.model_validate(_user_row(theme="neon"))


# --------------------------------------------------------------------- #
# UserListOut -- AC-011: UserOut plus created_at, still never a password
# --------------------------------------------------------------------- #


def test_ac011_user_list_out_adds_created_at_and_still_has_no_password_field() -> None:
    now = datetime(2026, 1, 1, 12, 0, 0)
    row = _user_row(created_at=now)

    listed = UserListOut.model_validate(row)

    assert listed.created_at == now
    dumped = listed.model_dump()
    assert "password" not in dumped
    assert "password_hash" not in dumped


def test_user_list_out_requires_created_at_the_plain_user_out_does_not() -> None:
    row = _user_row()  # no created_at

    with pytest.raises(ValidationError):
        UserListOut.model_validate(row)


# --------------------------------------------------------------------- #
# CreateUserResponse -- AC-011: temporary_password present once, here only
# --------------------------------------------------------------------- #


def test_ac011_create_user_response_carries_the_temporary_password_alongside_user_fields() -> None:
    row = _user_row(temporary_password="JustIssuedPass123!")

    response = CreateUserResponse.model_validate(row)

    assert response.temporary_password == "JustIssuedPass123!"
    assert response.email == row.email


def test_create_user_response_requires_temporary_password() -> None:
    row = _user_row()  # no temporary_password

    with pytest.raises(ValidationError):
        CreateUserResponse.model_validate(row)


def test_user_list_out_has_no_temporary_password_field_even_when_the_row_carries_one() -> None:
    """AC-011: the one-time password leaks nowhere but the create response --
    `UserListOut` (what `GET /users` returns) simply has no such field, so
    even a row that happens to carry the attribute never surfaces it."""
    now = datetime(2026, 1, 1, 12, 0, 0)
    row = _user_row(created_at=now, temporary_password="should-not-leak-here")

    dumped = UserListOut.model_validate(row).model_dump()

    assert "temporary_password" not in dumped


# --------------------------------------------------------------------- #
# CreateUserRequest -- AC-009/AC-010: no role field to supply
# --------------------------------------------------------------------- #


def test_ac010_create_user_request_has_no_role_field() -> None:
    request = CreateUserRequest(email="new@example.com", password="pw")

    assert not hasattr(request, "role")
    assert set(request.model_dump()) == {"email", "password"}


def test_create_user_request_ignores_an_extra_role_field_supplied_anyway() -> None:
    """Even if a caller's JSON body includes `"role": "admin"`, the model has
    nowhere to put it -- Pydantic's default `extra="ignore"` behaviour --
    so the server, not the request, is what decides a role."""
    request = CreateUserRequest.model_validate(
        {"email": "new@example.com", "password": "pw", "role": "admin"}
    )

    assert not hasattr(request, "role")


def test_create_user_request_requires_both_fields() -> None:
    with pytest.raises(ValidationError):
        CreateUserRequest(email="new@example.com")
    with pytest.raises(ValidationError):
        CreateUserRequest(password="pw")


# --------------------------------------------------------------------- #
# PatchUserRequest -- every field optional, defaults to None
# --------------------------------------------------------------------- #


def test_patch_user_request_with_no_fields_defaults_everything_to_none() -> None:
    request = PatchUserRequest()

    assert request.is_active is None
    assert request.password is None
    assert request.role is None


def test_patch_user_request_accepts_a_single_field_at_a_time() -> None:
    assert PatchUserRequest(is_active=False).is_active is False
    assert PatchUserRequest(password="new-pw").password == "new-pw"
    assert PatchUserRequest(role="admin").role == "admin"


# --------------------------------------------------------------------- #
# ChangePasswordRequest / ChangePasswordResponse -- AC-080
# --------------------------------------------------------------------- #


def test_change_password_request_requires_both_passwords() -> None:
    with pytest.raises(ValidationError):
        ChangePasswordRequest(current_password="old")
    with pytest.raises(ValidationError):
        ChangePasswordRequest(new_password="new")


def test_ac080_change_password_response_defaults_to_ok_and_carries_nothing_secret() -> None:
    response = ChangePasswordResponse()

    assert response.status == "ok"
    assert set(response.model_dump()) == {"status"}


# --------------------------------------------------------------------- #
# ThemeRequest / ThemeResponse -- Literal["light", "dark", "system"]
# --------------------------------------------------------------------- #


@pytest.mark.parametrize("theme", ["light", "dark", "system"])
def test_theme_request_and_response_accept_every_documented_theme(theme: str) -> None:
    assert ThemeRequest(theme=theme).theme == theme
    assert ThemeResponse(theme=theme).theme == theme


def test_theme_request_rejects_a_theme_outside_the_documented_choices() -> None:
    with pytest.raises(ValidationError):
        ThemeRequest(theme="neon")


def test_theme_request_requires_a_theme() -> None:
    with pytest.raises(ValidationError):
        ThemeRequest()


# --------------------------------------------------------------------- #
# ReprocessRequest -- Literal["retry", "reindex"]
# --------------------------------------------------------------------- #


@pytest.mark.parametrize("mode", ["retry", "reindex"])
def test_reprocess_request_accepts_both_documented_modes(mode: str) -> None:
    assert ReprocessRequest(mode=mode).mode == mode


def test_reprocess_request_rejects_a_mode_outside_retry_or_reindex() -> None:
    with pytest.raises(ValidationError):
        ReprocessRequest(mode="delete")


# --------------------------------------------------------------------- #
# ConversationCreateRequest / ChatRequest
# --------------------------------------------------------------------- #


def test_conversation_create_request_title_is_optional_and_defaults_to_none() -> None:
    assert ConversationCreateRequest().title is None
    assert ConversationCreateRequest(title="My chat").title == "My chat"


def test_chat_request_requires_conversation_id_and_question() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(conversation_id=str(uuid.uuid4()))
    with pytest.raises(ValidationError):
        ChatRequest(question="What is the policy?")

    request = ChatRequest(conversation_id=str(uuid.uuid4()), question="What is the policy?")
    assert request.question == "What is the policy?"


# --------------------------------------------------------------------- #
# CitationOut -- score only ever populated on a fresh POST /chat response
# --------------------------------------------------------------------- #


def _citation_row(**overrides) -> SimpleNamespace:
    base = dict(
        number=1,
        document_id=uuid.uuid4(),
        chunk_id=uuid.uuid4(),
        filename="handbook.pdf",
        page_ref=2,
        section_ref=None,
        text_preview="...the policy states...",
        score=0.87,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_citation_out_builds_from_attributes_with_a_score() -> None:
    citation = CitationOut.model_validate(_citation_row())

    assert citation.score == 0.87
    assert citation.filename == "handbook.pdf"


def test_citation_out_score_defaults_to_none_when_the_row_has_none() -> None:
    """A citation rebuilt from a persisted `Citation` row (no `score`
    column, by design) always carries `score=None`."""
    row = _citation_row()
    del row.__dict__["score"]

    citation = CitationOut.model_validate(row)

    assert citation.score is None


def test_citation_out_requires_number_document_id_and_chunk_id() -> None:
    with pytest.raises(ValidationError):
        CitationOut(document_id=uuid.uuid4(), chunk_id=uuid.uuid4())


# --------------------------------------------------------------------- #
# ChatResponse -- AC-049/AC-050/AC-059: citations never invented, empty by
# default, and each instance's list is independent (mutable-default safety
# from `Field(default_factory=list)`)
# --------------------------------------------------------------------- #


def test_chat_response_citations_default_to_an_empty_list() -> None:
    response = ChatResponse(
        conversation_id=str(uuid.uuid4()), answer="No matching documents.", from_documents=False
    )

    assert response.citations == []


def test_ac059_chat_response_requires_no_citations_when_nothing_was_retrieved() -> None:
    response = ChatResponse(
        conversation_id=str(uuid.uuid4()),
        answer="I don't have documents for that.",
        from_documents=False,
        citations=[],
    )

    assert response.citations == []
    assert response.from_documents is False


def test_chat_response_default_citation_lists_are_independent_per_instance() -> None:
    """Guards against a mutable-default bug: appending to one response's
    (default) list must never leak into another's."""
    first = ChatResponse(conversation_id=str(uuid.uuid4()), answer="a", from_documents=False)
    second = ChatResponse(conversation_id=str(uuid.uuid4()), answer="b", from_documents=False)

    first.citations.append(
        CitationOut(number=1, document_id=uuid.uuid4(), chunk_id=uuid.uuid4())
    )

    assert first.citations != []
    assert second.citations == []


def test_chat_response_requires_conversation_id_answer_and_from_documents() -> None:
    with pytest.raises(ValidationError):
        ChatResponse(answer="a", from_documents=False)


# --------------------------------------------------------------------- #
# MessageOut -- AC-054: identical to what POST /chat returned at the time
# --------------------------------------------------------------------- #


def test_ac054_message_out_carries_from_documents_and_citations_from_a_row() -> None:
    now = datetime(2026, 1, 1, 12, 0, 0)
    row = SimpleNamespace(
        id=uuid.uuid4(),
        role="assistant",
        content="Ten days a year.",
        from_documents=True,
        citations=[_citation_row(score=None)],
        created_at=now,
    )

    message = MessageOut.model_validate(row)

    assert message.from_documents is True
    assert len(message.citations) == 1
    assert message.citations[0].score is None


def test_message_out_citations_default_to_an_empty_list_when_absent() -> None:
    message = MessageOut(
        id=uuid.uuid4(),
        role="user",
        content="What is the policy?",
        from_documents=False,
        created_at=datetime(2026, 1, 1),
    )

    assert message.citations == []


# --------------------------------------------------------------------- #
# ConversationSummaryOut / ConversationDetailOut
# --------------------------------------------------------------------- #


def test_conversation_summary_out_builds_from_a_row_with_optional_title() -> None:
    now = datetime(2026, 1, 1, 12, 0, 0)
    row = SimpleNamespace(id=uuid.uuid4(), title=None, created_at=now, updated_at=now)

    summary = ConversationSummaryOut.model_validate(row)

    assert summary.title is None
    assert summary.created_at == now


def test_conversation_detail_out_defaults_messages_to_empty_and_carries_them_in_order() -> None:
    now = datetime(2026, 1, 1, 12, 0, 0)
    no_messages = ConversationDetailOut(id=uuid.uuid4(), created_at=now, updated_at=now)
    assert no_messages.messages == []

    message_row = SimpleNamespace(
        id=uuid.uuid4(),
        role="user",
        content="Hi",
        from_documents=False,
        citations=[],
        created_at=now,
    )
    row = SimpleNamespace(
        id=uuid.uuid4(), title="Chat", messages=[message_row], created_at=now, updated_at=now
    )

    detail = ConversationDetailOut.model_validate(row)

    assert len(detail.messages) == 1
    assert detail.messages[0].content == "Hi"


# --------------------------------------------------------------------- #
# SettingsOut / SettingsPatchRequest -- threshold bounds enforced here,
# before any handler runs
# --------------------------------------------------------------------- #


def test_settings_out_requires_both_fields() -> None:
    with pytest.raises(ValidationError):
        SettingsOut(similarity_threshold=0.5)
    with pytest.raises(ValidationError):
        SettingsOut(answer_model="gpt-test")

    settings = SettingsOut(similarity_threshold=0.5, answer_model="gpt-test")
    assert settings.similarity_threshold == 0.5


def test_settings_patch_request_with_no_fields_defaults_both_to_none() -> None:
    patch = SettingsPatchRequest()

    assert patch.similarity_threshold is None
    assert patch.answer_model is None


@pytest.mark.parametrize("value", [0.0, 0.5, 1.0])
def test_settings_patch_request_accepts_the_inclusive_bounds(value: float) -> None:
    assert SettingsPatchRequest(similarity_threshold=value).similarity_threshold == value


@pytest.mark.parametrize("value", [-0.0001, -1.0, 1.0001, 2.0])
def test_settings_patch_request_rejects_a_threshold_outside_zero_to_one(value: float) -> None:
    with pytest.raises(ValidationError):
        SettingsPatchRequest(similarity_threshold=value)


def test_settings_patch_request_answer_model_accepts_any_string_with_no_threshold() -> None:
    patch = SettingsPatchRequest(answer_model="llama-3.1-8b-instant")

    assert patch.answer_model == "llama-3.1-8b-instant"
    assert patch.similarity_threshold is None


# --------------------------------------------------------------------- #
# DocumentCreateOut / DocumentOut / DocumentStatsOut -- AC-015/AC-034/AC-036
# --------------------------------------------------------------------- #


def test_ac015_document_create_out_builds_from_a_freshly_inserted_row() -> None:
    now = datetime(2026, 1, 1, 12, 0, 0)
    row = SimpleNamespace(
        id=uuid.uuid4(),
        filename="policy.pdf",
        file_type="pdf",
        size_bytes=1024,
        status="processing",
        created_at=now,
    )

    created = DocumentCreateOut.model_validate(row)

    assert created.status == "processing"
    assert created.filename == "policy.pdf"


def test_document_create_out_has_no_chunk_count_or_uploader_field() -> None:
    """AC-015's own distinction from the full listing shape (`DocumentOut`):
    a document this new has neither yet."""
    assert "chunk_count" not in DocumentCreateOut.model_fields
    assert "uploaded_by" not in DocumentCreateOut.model_fields


def test_ac034_document_out_carries_chunk_count_and_uploader_and_optional_failure_fields() -> None:
    now = datetime(2026, 1, 1, 12, 0, 0)
    row = SimpleNamespace(
        id=uuid.uuid4(),
        filename="policy.pdf",
        file_type="pdf",
        size_bytes=2048,
        status="failed",
        failure_reason="extraction timed out",
        notes=None,
        chunk_count=0,
        uploaded_by="ada@example.com",
        created_at=now,
    )

    document = DocumentOut.model_validate(row)

    assert document.failure_reason == "extraction timed out"
    assert document.chunk_count == 0
    assert document.uploaded_by == "ada@example.com"


def test_document_out_requires_chunk_count_and_uploaded_by() -> None:
    now = datetime(2026, 1, 1, 12, 0, 0)
    row = SimpleNamespace(
        id=uuid.uuid4(),
        filename="policy.pdf",
        file_type="pdf",
        size_bytes=2048,
        status="ready",
        failure_reason=None,
        notes=None,
        created_at=now,
        # chunk_count and uploaded_by deliberately omitted
    )

    with pytest.raises(ValidationError):
        DocumentOut.model_validate(row)


def test_document_stats_out_requires_every_count_field() -> None:
    stats = DocumentStatsOut(total=3, ready=1, processing=1, failed=1, chunks=10, bytes=4096)

    assert stats.total == 3
    assert stats.bytes == 4096

    with pytest.raises(ValidationError):
        DocumentStatsOut(total=3, ready=1, processing=1, failed=1, chunks=10)
