"""Unit tests for `app/routers/chat.py`'s private helpers: the pieces
`POST /chat` is built from, exercised directly as plain functions and
coroutines against a real (SQLite) `Session`, never through
`client`/`TestClient` (that belongs in `backend/tests/integration/`, see
`backend/tests/test_chat_rag.py`, `tests/test_chat_history.py` and
`tests/test_chat_generation_errors.py`, which already cover the end-to-end
`POST /chat` contract these helpers back).

This ticket carries no acceptance criteria of its own ("This ticket carries
no acceptance criteria. Do what the title and description describe, and
note what you assumed"), so tests are named after each helper's own
documented behaviour rather than an `AC-###`:

* `_max_prior_turns`: default, a configured override, and the fall back to
  the default on a non-integer or non-positive `CHAT_MAX_PRIOR_TURNS`.
* `_parse_conversation_id`: a valid UUID string parses; anything else is a
  422 `HTTPException`, never an unhandled `ValueError`.
* `_find_conversation`: `None` for an id nobody has used yet, the row
  itself when it belongs to the caller, and a 404 (never a 403, so
  existence is never leaked) when it belongs to someone else.
* `_create_conversation`: persists a new row for the caller, with the
  title truncated at `_TITLE_MAX_LENGTH` when the question is longer.
* `_prior_context_text`: empty for a brand-new (`None`) conversation or one
  with no messages yet; renders the existing turns oldest-first,
  regardless of insertion order; bounded to `_max_prior_turns() * 2`
  messages so an arbitrarily long conversation cannot grow the rendered
  transcript without limit.
* `_build_generation_question`: the bare question when there is no prior
  context, and a composite transcript-then-question string when there is.
* `chat` (the endpoint coroutine itself, called directly -- no HTTP layer,
  no `Depends` resolution): a `GenerationError` is turned into a 503
  `HTTPException` carrying `{code, message}`, and the failing call writes
  no `Conversation`/`Message` row.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

import app.routers.chat as chat_module
from app.database import Base, SessionLocal, engine
from app.generation import GenerationAuthError
from app.models import Conversation, Message, User
from app.retrieval import RetrievedChunk
from app.routers.chat import (
    _DEFAULT_MAX_PRIOR_TURNS,
    _TITLE_MAX_LENGTH,
    _build_generation_question,
    _create_conversation,
    _find_conversation,
    _max_prior_turns,
    _parse_conversation_id,
    _prior_context_text,
    chat,
)
from app.schemas import ChatRequest
from app.security import hash_password


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        # This module seeds Conversation/Message/User rows directly
        # against the ORM; leaving any behind would leak into another
        # module's exact-count assertions over the same shared sqlite file
        # (see tests/conftest.py), same rationale as tests/unit/test_retrieval.py.
        session.query(Message).delete()
        session.query(Conversation).delete()
        session.query(User).filter(User.email.like("chat-unit-%")).delete(
            synchronize_session=False
        )
        session.commit()
        session.close()


def _seed_user(db, *, label: str = "owner") -> User:
    user = User(
        email=f"chat-unit-{label}-{uuid.uuid4().hex[:10]}@example.com",
        password_hash=hash_password("ChatUnitPass123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_conversation(db, user: User, *, title: str = "A conversation") -> Conversation:
    conversation = Conversation(user_id=user.id, title=title)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def _seed_message(
    db, conversation: Conversation, *, role: str, content: str, created_at: datetime
) -> Message:
    message = Message(
        conversation_id=conversation.id,
        role=role,
        content=content,
        created_at=created_at,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


# --------------------------------------------------------------------- #
# _max_prior_turns
# --------------------------------------------------------------------- #


def test_max_prior_turns_defaults_when_env_var_unset(monkeypatch) -> None:
    monkeypatch.delenv("CHAT_MAX_PRIOR_TURNS", raising=False)

    assert _max_prior_turns() == _DEFAULT_MAX_PRIOR_TURNS


def test_max_prior_turns_reads_a_configured_positive_value(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_MAX_PRIOR_TURNS", "2")

    assert _max_prior_turns() == 2


def test_max_prior_turns_falls_back_to_default_on_non_integer_value(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_MAX_PRIOR_TURNS", "not-a-number")

    assert _max_prior_turns() == _DEFAULT_MAX_PRIOR_TURNS


@pytest.mark.parametrize("raw", ["0", "-1", "-100"])
def test_max_prior_turns_falls_back_to_default_on_non_positive_value(monkeypatch, raw) -> None:
    monkeypatch.setenv("CHAT_MAX_PRIOR_TURNS", raw)

    assert _max_prior_turns() == _DEFAULT_MAX_PRIOR_TURNS


# --------------------------------------------------------------------- #
# _parse_conversation_id
# --------------------------------------------------------------------- #


def test_parse_conversation_id_accepts_a_valid_uuid_string() -> None:
    raw = str(uuid.uuid4())

    parsed = _parse_conversation_id(raw)

    assert parsed == uuid.UUID(raw)


def test_parse_conversation_id_rejects_a_non_uuid_string_with_422() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _parse_conversation_id("not-a-uuid")

    assert exc_info.value.status_code == 422
    assert "UUID" in exc_info.value.detail


# --------------------------------------------------------------------- #
# _find_conversation
# --------------------------------------------------------------------- #


def test_find_conversation_returns_none_for_an_id_no_conversation_uses(db) -> None:
    user = _seed_user(db)

    found = _find_conversation(db, user, uuid.uuid4())

    assert found is None


def test_find_conversation_returns_the_row_when_it_belongs_to_the_caller(db) -> None:
    user = _seed_user(db)
    conversation = _seed_conversation(db, user)

    found = _find_conversation(db, user, conversation.id)

    assert found is not None
    assert found.id == conversation.id


def test_find_conversation_raises_404_not_403_when_owned_by_someone_else(db) -> None:
    owner = _seed_user(db, label="owner")
    stranger = _seed_user(db, label="stranger")
    conversation = _seed_conversation(db, owner)

    with pytest.raises(HTTPException) as exc_info:
        _find_conversation(db, stranger, conversation.id)

    assert exc_info.value.status_code == 404


# --------------------------------------------------------------------- #
# _create_conversation
# --------------------------------------------------------------------- #


def test_create_conversation_persists_a_new_row_for_the_caller(db) -> None:
    user = _seed_user(db)
    conversation_id = uuid.uuid4()

    created = _create_conversation(db, user, conversation_id, "What is the refund policy?")

    assert created.id == conversation_id
    assert created.user_id == user.id
    from_db = db.query(Conversation).filter(Conversation.id == conversation_id).one()
    assert from_db.title == "What is the refund policy?"


def test_create_conversation_truncates_the_title_to_the_max_length(db) -> None:
    user = _seed_user(db)
    long_question = "x" * (_TITLE_MAX_LENGTH + 50)

    created = _create_conversation(db, user, uuid.uuid4(), long_question)

    assert created.title == long_question[:_TITLE_MAX_LENGTH]
    assert len(created.title) == _TITLE_MAX_LENGTH


# --------------------------------------------------------------------- #
# _prior_context_text
# --------------------------------------------------------------------- #


def test_prior_context_text_is_empty_for_a_brand_new_conversation() -> None:
    assert _prior_context_text(None) == ""


def test_prior_context_text_is_empty_for_a_conversation_with_no_messages_yet(db) -> None:
    user = _seed_user(db)
    conversation = _seed_conversation(db, user)

    assert _prior_context_text(conversation) == ""


def test_prior_context_text_renders_turns_oldest_first_regardless_of_insertion_order(db) -> None:
    user = _seed_user(db)
    conversation = _seed_conversation(db, user)
    base = datetime(2026, 1, 1, 12, 0, 0)
    # Inserted out of chronological order on purpose.
    _seed_message(
        db,
        conversation,
        role="assistant",
        content="The answer.",
        created_at=base + timedelta(minutes=1),
    )
    _seed_message(db, conversation, role="user", content="The question.", created_at=base)
    db.refresh(conversation)

    text = _prior_context_text(conversation)

    assert text == "User: The question.\nAssistant: The answer."


def test_prior_context_text_is_bounded_to_max_prior_turns_times_two(db, monkeypatch) -> None:
    monkeypatch.setenv("CHAT_MAX_PRIOR_TURNS", "1")
    user = _seed_user(db)
    conversation = _seed_conversation(db, user)
    base = datetime(2026, 1, 1, 12, 0, 0)
    for i in range(3):
        _seed_message(
            db,
            conversation,
            role="user",
            content=f"Question {i}.",
            created_at=base + timedelta(minutes=2 * i),
        )
        _seed_message(
            db,
            conversation,
            role="assistant",
            content=f"Answer {i}.",
            created_at=base + timedelta(minutes=2 * i + 1),
        )
    db.refresh(conversation)

    text = _prior_context_text(conversation)

    # Bounded to the last 1 * 2 = 2 messages (the final turn only).
    assert text == "User: Question 2.\nAssistant: Answer 2."
    assert "Question 0" not in text
    assert "Question 1" not in text


# --------------------------------------------------------------------- #
# _build_generation_question
# --------------------------------------------------------------------- #


def test_build_generation_question_returns_the_bare_question_with_no_prior_context() -> None:
    result = _build_generation_question(None, "What is the vacation policy?")

    assert result == "What is the vacation policy?"


def test_build_generation_question_prepends_the_prior_transcript_when_there_is_one(db) -> None:
    user = _seed_user(db)
    conversation = _seed_conversation(db, user)
    base = datetime(2026, 1, 1, 12, 0, 0)
    _seed_message(
        db, conversation, role="user", content="What is the vacation policy?", created_at=base
    )
    _seed_message(
        db,
        conversation,
        role="assistant",
        content="Ten days a year.",
        created_at=base + timedelta(minutes=1),
    )
    db.refresh(conversation)

    result = _build_generation_question(conversation, "And what about sick days?")

    assert "What is the vacation policy?" in result
    assert "Ten days a year." in result
    assert result.endswith("Follow-up question: And what about sick days?")
    # Retrieval is never handed this composite text -- only generation is;
    # that boundary is enforced by `chat()` itself, not this helper, but
    # the helper's output is exactly what makes that boundary possible.
    assert result != "And what about sick days?"


# --------------------------------------------------------------------- #
# chat(): the endpoint coroutine itself, called directly -- no HTTP layer
# --------------------------------------------------------------------- #


class _EmptyRetrieval:
    """Stands in for `retrieve_relevant_chunks`: always finds nothing, so
    the test below exercises the error-mapping path without depending on
    any seeded chunk."""

    def __call__(self, db, question):
        return []


class _FailingGeneration:
    def __init__(self, error: GenerationAuthError):
        self._error = error

    def __call__(self, question, retrieved):
        raise self._error


def test_chat_maps_a_generation_error_to_a_structured_503_and_writes_nothing(
    db, monkeypatch
) -> None:
    user = _seed_user(db)
    error = GenerationAuthError("Groq rejected the request: invalid credentials.")
    monkeypatch.setattr(chat_module, "retrieve_relevant_chunks", _EmptyRetrieval())
    monkeypatch.setattr(chat_module, "generate_answer", _FailingGeneration(error))

    payload = ChatRequest(conversation_id=str(uuid.uuid4()), question="Will this fail?")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(chat(payload, db, user))

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == {"code": "groq_auth_error", "message": error.message}
    assert db.query(Conversation).count() == 0
    assert db.query(Message).count() == 0


def test_chat_grounded_response_persists_conversation_and_numbers_citations(
    db, monkeypatch
) -> None:
    user = _seed_user(db)

    class _StubChunk:
        def __init__(self):
            self.id = uuid.uuid4()
            self.document_id = uuid.uuid4()
            self.content = "Matching content."

    stub_chunk = _StubChunk()
    retrieved = [RetrievedChunk(chunk=stub_chunk, score=0.9)]

    monkeypatch.setattr(chat_module, "retrieve_relevant_chunks", lambda db, question: retrieved)
    monkeypatch.setattr(
        chat_module, "generate_answer", lambda question, context: "Here is the answer. [1]"
    )
    monkeypatch.setattr(
        chat_module,
        "citation_from_chunk",
        lambda chunk: {
            "filename": "doc.txt",
            "page_ref": 1,
            "section_ref": None,
            "text_preview": "Matching content.",
        },
    )

    conversation_id = str(uuid.uuid4())
    payload = ChatRequest(conversation_id=conversation_id, question="What is in the policy?")

    response = asyncio.run(chat(payload, db, user))

    assert response.from_documents is True
    assert [c.number for c in response.citations] == [1]
    assert response.citations[0].chunk_id == stub_chunk.id

    conversation = (
        db.query(Conversation).filter(Conversation.id == uuid.UUID(conversation_id)).one()
    )
    assert conversation.user_id == user.id
    messages = db.query(Message).filter(Message.conversation_id == conversation.id).all()
    assert sorted(m.role for m in messages) == ["assistant", "user"]
