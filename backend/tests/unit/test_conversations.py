"""Unit tests for `app/routers/conversations.py`: `_load_conversation_or_404`
and the four route coroutines (`list_conversations`, `create_conversation`,
`get_conversation`, `delete_conversation`), exercised directly as plain
functions/coroutines against a real (SQLite) `Session` -- no
`client`/`TestClient`, no HTTP layer. The end-to-end contract through the
real HTTP surface is already covered by
`backend/tests/test_conversations_search.py`,
`backend/tests/test_conversations_delete.py` and
`backend/tests/test_conversation_privacy.py`; this module reaches under
those for the router's own logic, isolated from routing/auth/serialization.

This ticket carries no acceptance criteria of its own ("This ticket carries
no acceptance criteria. Do what the title and description describe, and
note what you assumed"), so tests are named after the behaviour the
module's docstring documents rather than an `AC-###` -- same convention as
`backend/tests/unit/test_chat.py` and `backend/tests/unit/test_deps.py` for
their own routers.

Each coroutine is awaited directly with `asyncio.run`, passing plain
arguments in place of what FastAPI's `Depends` would have resolved -- the
same technique `tests/unit/test_chat.py` uses for `chat()`.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from app.chunking import ChunkDraft, persist_chunks
from app.database import Base, SessionLocal, engine
from app.models import Citation, Conversation, Document, Message, User
from app.routers.conversations import (
    _load_conversation_or_404,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
)
from app.schemas import ConversationCreateRequest
from app.security import hash_password


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        # Mirrors tests/unit/test_chat.py: this module seeds rows directly
        # against the ORM on the shared sqlite file tests/conftest.py
        # points at, so clean up after itself rather than leak rows into
        # another module's exact-count/exact-set assertions.
        session.query(Citation).delete()
        session.query(Message).delete()
        session.query(Conversation).delete()
        session.query(Document).delete()
        session.query(User).filter(User.email.like("conv-unit-%")).delete(
            synchronize_session=False
        )
        session.commit()
        session.close()


def _seed_user(db, *, label: str = "owner") -> User:
    user = User(
        email=f"conv-unit-{label}-{uuid.uuid4().hex[:10]}@example.com",
        password_hash=hash_password("ConvUnitPass123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_conversation(
    db, user: User, *, title: str | None = "A conversation", updated_at: datetime | None = None
) -> Conversation:
    conversation = Conversation(user_id=user.id, title=title)
    if updated_at is not None:
        conversation.updated_at = updated_at
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def _seed_message(
    db, conversation: Conversation, *, role: str = "user", content: str, created_at=None
) -> Message:
    message = Message(conversation_id=conversation.id, role=role, content=content)
    if created_at is not None:
        message.created_at = created_at
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def _seed_citation(db, message: Message, *, number: int) -> Citation:
    """Seeds a real chunk-backed citation (same technique as
    tests/test_conversations_delete.py) so citation numbering/sorting is
    exercised against a real row, not a bare dict."""
    document = Document(
        filename=f"conv-unit-{uuid.uuid4().hex[:6]}.txt",
        file_type="txt",
        size_bytes=1,
        s3_key=f"documents/conv-unit/{uuid.uuid4().hex}.txt",
        status="ready",
        uploaded_by=message.conversation.user_id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    [chunk] = persist_chunks(
        db, document, [ChunkDraft(index=0, content="Some chunk content.", page_ref=1)]
    )

    citation = Citation(
        message_id=message.id,
        chunk_id=chunk.id,
        document_id=document.id,
        number=number,
        filename=document.filename,
        page_ref=1,
    )
    db.add(citation)
    db.commit()
    db.refresh(citation)
    return citation


# --------------------------------------------------------------------- #
# _load_conversation_or_404
# --------------------------------------------------------------------- #


def test_load_conversation_or_404_returns_the_row_when_owned_by_the_caller(db) -> None:
    user = _seed_user(db)
    conversation = _seed_conversation(db, user)

    found = _load_conversation_or_404(db, user, str(conversation.id))

    assert found.id == conversation.id


def test_load_conversation_or_404_raises_404_for_a_non_uuid_string(db) -> None:
    user = _seed_user(db)

    with pytest.raises(HTTPException) as exc_info:
        _load_conversation_or_404(db, user, "not-a-uuid-at-all")

    assert exc_info.value.status_code == 404


def test_load_conversation_or_404_raises_404_for_an_id_nobody_uses(db) -> None:
    user = _seed_user(db)

    with pytest.raises(HTTPException) as exc_info:
        _load_conversation_or_404(db, user, str(uuid.uuid4()))

    assert exc_info.value.status_code == 404


def test_load_conversation_or_404_raises_404_not_403_when_owned_by_someone_else(db) -> None:
    owner = _seed_user(db, label="owner")
    stranger = _seed_user(db, label="stranger")
    conversation = _seed_conversation(db, owner)

    with pytest.raises(HTTPException) as exc_info:
        _load_conversation_or_404(db, stranger, str(conversation.id))

    # Never a 403: existence must not be leaked to a non-owner.
    assert exc_info.value.status_code == 404


# --------------------------------------------------------------------- #
# list_conversations
# --------------------------------------------------------------------- #


def test_list_conversations_returns_only_the_callers_own_rows_newest_first(db) -> None:
    owner = _seed_user(db, label="owner")
    other = _seed_user(db, label="other")
    base = datetime(2026, 1, 1, 12, 0, 0)
    older = _seed_conversation(db, owner, title="Older", updated_at=base)
    newer = _seed_conversation(db, owner, title="Newer", updated_at=base + timedelta(hours=1))
    _seed_conversation(db, other, title="Someone else's")

    result = asyncio.run(list_conversations(q=None, db=db, user=owner))

    assert [c.id for c in result] == [newer.id, older.id]


def test_list_conversations_blank_q_returns_the_full_list_unfiltered(db) -> None:
    owner = _seed_user(db)
    first = _seed_conversation(db, owner, title="First")
    second = _seed_conversation(db, owner, title="Second")

    result = asyncio.run(list_conversations(q="   ", db=db, user=owner))

    assert {c.id for c in result} == {first.id, second.id}


def test_list_conversations_q_matches_title_case_insensitively(db) -> None:
    owner = _seed_user(db)
    matching = _seed_conversation(db, owner, title="Vacation Policy Questions")
    non_matching = _seed_conversation(db, owner, title="Budget Report Review")

    result = asyncio.run(list_conversations(q="VACATION", db=db, user=owner))

    ids = [c.id for c in result]
    assert ids == [matching.id]
    assert non_matching.id not in ids


def test_list_conversations_q_matches_message_content_not_just_title(db) -> None:
    owner = _seed_user(db)
    matching = _seed_conversation(db, owner, title="General questions")
    _seed_message(db, matching, content="What is the REFUND window for orders?")
    non_matching = _seed_conversation(db, owner, title="Unrelated thread")
    _seed_message(db, non_matching, content="How do I reset my password?")

    result = asyncio.run(list_conversations(q="refund", db=db, user=owner))

    ids = [c.id for c in result]
    assert ids == [matching.id]
    assert non_matching.id not in ids


def test_list_conversations_q_matching_nothing_returns_an_empty_list(db) -> None:
    owner = _seed_user(db)
    _seed_conversation(db, owner, title="Anything at all")

    result = asyncio.run(
        list_conversations(q="nothing-will-ever-match-this-zzz", db=db, user=owner)
    )

    assert result == []


def test_list_conversations_never_returns_another_users_row_even_on_a_matching_q(db) -> None:
    owner = _seed_user(db, label="owner")
    other = _seed_user(db, label="other")
    other_conv = _seed_conversation(db, other, title="Shared Keyword Thread")

    result = asyncio.run(list_conversations(q="shared keyword", db=db, user=owner))

    assert result == []
    assert other_conv.id not in [c.id for c in result]


# --------------------------------------------------------------------- #
# create_conversation
# --------------------------------------------------------------------- #


def test_create_conversation_persists_a_new_row_owned_by_the_caller(db) -> None:
    user = _seed_user(db)

    created = asyncio.run(
        create_conversation(ConversationCreateRequest(title="My new thread"), db=db, user=user)
    )

    assert created.title == "My new thread"
    assert created.user_id == user.id
    from_db = db.query(Conversation).filter(Conversation.id == created.id).one()
    assert from_db.title == "My new thread"


def test_create_conversation_accepts_no_title(db) -> None:
    user = _seed_user(db)

    created = asyncio.run(
        create_conversation(ConversationCreateRequest(title=None), db=db, user=user)
    )

    assert created.title is None
    assert created.user_id == user.id


# --------------------------------------------------------------------- #
# get_conversation
# --------------------------------------------------------------------- #


def test_get_conversation_returns_messages_in_creation_order_regardless_of_insertion_order(
    db,
) -> None:
    user = _seed_user(db)
    conversation = _seed_conversation(db, user)
    base = datetime(2026, 1, 1, 12, 0, 0)
    # Inserted out of chronological order on purpose.
    second = _seed_message(
        db,
        conversation,
        role="assistant",
        content="The answer.",
        created_at=base + timedelta(minutes=1),
    )
    first = _seed_message(db, conversation, role="user", content="The question.", created_at=base)
    db.refresh(conversation)

    detail = asyncio.run(get_conversation(str(conversation.id), db=db, user=user))

    assert [m.id for m in detail.messages] == [first.id, second.id]
    assert [m.content for m in detail.messages] == ["The question.", "The answer."]


def test_get_conversation_returns_each_messages_citations_sorted_by_number(db) -> None:
    user = _seed_user(db)
    conversation = _seed_conversation(db, user)
    message = _seed_message(db, conversation, role="assistant", content="Here [1] and here [2].")
    _seed_citation(db, message, number=2)
    _seed_citation(db, message, number=1)

    detail = asyncio.run(get_conversation(str(conversation.id), db=db, user=user))

    [out_message] = detail.messages
    assert [c.number for c in out_message.citations] == [1, 2]


def test_get_conversation_raises_404_not_403_for_another_users_conversation(db) -> None:
    owner = _seed_user(db, label="owner")
    stranger = _seed_user(db, label="stranger")
    conversation = _seed_conversation(db, owner)
    _seed_message(db, conversation, content="Owner's own private content.")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_conversation(str(conversation.id), db=db, user=stranger))

    assert exc_info.value.status_code == 404


# --------------------------------------------------------------------- #
# delete_conversation
# --------------------------------------------------------------------- #


def test_delete_conversation_removes_the_conversation_and_its_messages_and_citations(db) -> None:
    user = _seed_user(db)
    conversation = _seed_conversation(db, user)
    message = _seed_message(db, conversation, content="To be deleted.")
    citation = _seed_citation(db, message, number=1)

    response = asyncio.run(delete_conversation(str(conversation.id), db=db, user=user))

    assert response.status_code == 204
    assert db.query(Conversation).filter(Conversation.id == conversation.id).first() is None
    assert db.query(Message).filter(Message.id == message.id).first() is None
    assert db.query(Citation).filter(Citation.id == citation.id).first() is None


def test_delete_conversation_leaves_the_callers_other_conversations_untouched(db) -> None:
    user = _seed_user(db)
    to_delete = _seed_conversation(db, user, title="Delete me")
    keep = _seed_conversation(db, user, title="Keep me")

    asyncio.run(delete_conversation(str(to_delete.id), db=db, user=user))

    assert db.query(Conversation).filter(Conversation.id == keep.id).first() is not None


def test_delete_conversation_raises_404_not_403_for_another_users_conversation_and_deletes_nothing(
    db,
) -> None:
    owner = _seed_user(db, label="owner")
    stranger = _seed_user(db, label="stranger")
    conversation = _seed_conversation(db, owner)
    message = _seed_message(db, conversation, content="Not the stranger's to delete.")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(delete_conversation(str(conversation.id), db=db, user=stranger))

    assert exc_info.value.status_code == 404
    assert db.query(Conversation).filter(Conversation.id == conversation.id).first() is not None
    assert db.query(Message).filter(Message.id == message.id).first() is not None
