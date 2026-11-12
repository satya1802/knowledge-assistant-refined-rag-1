"""Unit tests for `app/models.py`: the column defaults `mapped_column`
pins in Python rather than in a migration (`default=`), the one uniqueness
constraint the module's own docstring calls out (`User.email`), and the
ORM relationship/cascade wiring between every linked pair of tables --
exercised directly against the models through a real `SessionLocal` session,
never `client`/`TestClient` (that belongs in `backend/tests/integration/`).

This ticket carries no acceptance criteria, so tests are named after the
module's own documented guarantees instead of an `AC-###`.

Assumptions:
  * This suite runs against whatever `DATABASE_URL` the environment already
    configures (SQLite locally by default, the project's real Postgres +
    pgvector elsewhere -- see `backend/tests/unit/test_database.py` and
    `backend/tests/test_embedding.py`, which already stores and reads back
    a 768-dim `Chunk.embedding` the same way). These tests do not assert a
    specific backend; they assert what the models guarantee on either one:
    Python-side defaults, ORM-level cascade, and the `User.email` unique
    constraint (enforced by both SQLite and Postgres).
  * Foreign-key *enforcement* at the database level (e.g. inserting a
    `Session` row for a `user_id` that does not exist) is not asserted
    here: SQLite does not enforce it without a per-connection PRAGMA this
    module does not set, so such a test would pass or fail depending only
    on which backend happens to be configured, not on anything the models
    declare. Cascade-on-delete, which is pure SQLAlchemy ORM behaviour
    (`cascade="all, delete-orphan"`) and backend-independent, is covered
    instead.
  * Tests that insert a `User` generate a fresh, unique email per call
    (`_unique_email`) rather than a fixed literal, so the suite is safe to
    run repeatedly against a database that is not reset between runs (the
    same convention `tests/test_embedding.py` already uses).
"""

import uuid
from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.database import Base, SessionLocal, engine
from app.models import AppSetting, AuditLog, Chunk, Citation, Conversation, Document, Message, User
from app.models import Session as SessionModel


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _make_user(db, *, label: str = "model-user", role: str = "user", **kwargs) -> User:
    user = User(email=_unique_email(label), password_hash="irrelevant-hash", role=role, **kwargs)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_document(db, user: User, *, filename: str = "f.txt") -> Document:
    document = Document(
        filename=filename,
        file_type="txt",
        size_bytes=10,
        s3_key=f"documents/{uuid.uuid4().hex}/{filename}",
        uploaded_by=user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


# --------------------------------------------------------------------- #
# Column defaults
# --------------------------------------------------------------------- #


def test_user_column_defaults_apply_on_insert(db) -> None:
    user = User(email=_unique_email("defaults"), password_hash="hash")
    db.add(user)
    db.commit()
    db.refresh(user)

    assert isinstance(user.id, uuid.UUID)
    assert user.role == "user"
    assert user.is_active is True
    assert user.failed_attempts == 0
    assert user.locked_until is None
    assert user.theme == "system"
    assert isinstance(user.created_at, datetime)


def test_default_uuid_generator_produces_distinct_ids_per_row(db) -> None:
    first = _make_user(db, label="id-a")
    second = _make_user(db, label="id-b")

    assert first.id != second.id


def test_session_defaults_apply_on_insert(db) -> None:
    user = _make_user(db, label="session-defaults")
    session_row = SessionModel(
        user_id=user.id, token_hash="hash", expires_at=datetime(2030, 1, 1)
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)

    assert session_row.revoked_at is None
    assert isinstance(session_row.created_at, datetime)


def test_document_defaults_to_processing_status_with_no_failure_reason(db) -> None:
    user = _make_user(db, label="doc-defaults")
    document = _make_document(db, user)

    assert document.status == "processing"
    assert document.failure_reason is None
    assert document.notes is None
    assert isinstance(document.created_at, datetime)
    assert isinstance(document.updated_at, datetime)


def test_message_from_documents_defaults_to_false(db) -> None:
    user = _make_user(db, label="msg-defaults")
    conversation = Conversation(user_id=user.id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    message = Message(conversation_id=conversation.id, role="user", content="hi")
    db.add(message)
    db.commit()
    db.refresh(message)

    assert message.from_documents is False


# --------------------------------------------------------------------- #
# User.email uniqueness
# --------------------------------------------------------------------- #


def test_user_email_uniqueness_is_enforced(db) -> None:
    email = _unique_email("dupe")
    db.add(User(email=email, password_hash="hash1"))
    db.commit()

    db.add(User(email=email, password_hash="hash2"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


# --------------------------------------------------------------------- #
# Relationships
# --------------------------------------------------------------------- #


def test_session_user_relationship_is_navigable_both_ways(db) -> None:
    user = _make_user(db, label="session-rel")
    session_row = SessionModel(
        user_id=user.id, token_hash="hash", expires_at=datetime(2030, 1, 1)
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    db.refresh(user)

    assert session_row.user.id == user.id
    assert [s.id for s in user.sessions] == [session_row.id]


def test_document_chunk_relationship_is_navigable_both_ways(db) -> None:
    user = _make_user(db, label="doc-chunk-rel")
    document = _make_document(db, user)
    chunk = Chunk(document_id=document.id, chunk_index=0, content="hello")
    db.add(chunk)
    db.commit()
    db.refresh(chunk)
    db.refresh(document)

    assert chunk.document.id == document.id
    assert [c.id for c in document.chunks] == [chunk.id]


def test_conversation_message_citation_relationships_are_navigable(db) -> None:
    user = _make_user(db, label="conv-msg-rel")
    document = _make_document(db, user)
    chunk = Chunk(document_id=document.id, chunk_index=0, content="hello")
    db.add(chunk)
    db.commit()
    db.refresh(chunk)

    conversation = Conversation(user_id=user.id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    message = Message(conversation_id=conversation.id, role="assistant", content="hi")
    db.add(message)
    db.commit()
    db.refresh(message)

    citation = Citation(
        message_id=message.id,
        chunk_id=chunk.id,
        document_id=document.id,
        number=1,
        filename=document.filename,
    )
    db.add(citation)
    db.commit()
    db.refresh(citation)
    db.refresh(message)
    db.refresh(conversation)

    assert message.conversation.id == conversation.id
    assert [m.id for m in conversation.messages] == [message.id]
    assert citation.message.id == message.id
    assert [c.id for c in message.citations] == [citation.id]


# --------------------------------------------------------------------- #
# Cascade delete ("all, delete-orphan")
# --------------------------------------------------------------------- #


def test_deleting_a_user_cascades_to_their_sessions_and_conversations(db) -> None:
    user = _make_user(db, label="cascade-user")
    session_row = SessionModel(
        user_id=user.id, token_hash="h", expires_at=datetime(2030, 1, 1)
    )
    conversation = Conversation(user_id=user.id, title="t")
    db.add_all([session_row, conversation])
    db.commit()
    session_id, conversation_id = session_row.id, conversation.id

    db.delete(user)
    db.commit()

    assert db.query(SessionModel).filter(SessionModel.id == session_id).first() is None
    assert db.query(Conversation).filter(Conversation.id == conversation_id).first() is None


def test_deleting_a_document_cascades_to_its_chunks(db) -> None:
    user = _make_user(db, label="cascade-doc")
    document = _make_document(db, user)
    chunk = Chunk(document_id=document.id, chunk_index=0, content="hello")
    db.add(chunk)
    db.commit()
    chunk_id = chunk.id

    db.delete(document)
    db.commit()

    assert db.query(Chunk).filter(Chunk.id == chunk_id).first() is None


def test_deleting_a_conversation_cascades_to_its_messages_and_their_citations(db) -> None:
    user = _make_user(db, label="cascade-conv")
    document = _make_document(db, user)
    chunk = Chunk(document_id=document.id, chunk_index=0, content="hello")
    db.add(chunk)
    db.commit()
    db.refresh(chunk)

    conversation = Conversation(user_id=user.id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    message = Message(conversation_id=conversation.id, role="assistant", content="hi")
    db.add(message)
    db.commit()
    db.refresh(message)

    citation = Citation(
        message_id=message.id,
        chunk_id=chunk.id,
        document_id=document.id,
        number=1,
        filename=document.filename,
    )
    db.add(citation)
    db.commit()
    message_id, citation_id = message.id, citation.id

    db.delete(conversation)
    db.commit()

    assert db.query(Message).filter(Message.id == message_id).first() is None
    assert db.query(Citation).filter(Citation.id == citation_id).first() is None


# --------------------------------------------------------------------- #
# Chunk.embedding (pgvector column)
# --------------------------------------------------------------------- #


def test_chunk_embedding_defaults_to_none_before_indexing(db) -> None:
    user = _make_user(db, label="embed-none")
    document = _make_document(db, user, filename="unindexed.txt")
    chunk = Chunk(document_id=document.id, chunk_index=0, content="not yet embedded")
    db.add(chunk)
    db.commit()
    db.refresh(chunk)

    assert chunk.embedding is None


def test_chunk_embedding_round_trips_a_768_dimension_vector(db) -> None:
    user = _make_user(db, label="embed-roundtrip")
    document = _make_document(db, user, filename="embedded.txt")
    vector = [0.5] * 768
    chunk = Chunk(
        document_id=document.id, chunk_index=0, content="embedded content", embedding=vector
    )
    db.add(chunk)
    db.commit()
    db.refresh(chunk)

    assert chunk.embedding is not None
    assert len(chunk.embedding) == 768
    assert list(chunk.embedding) == pytest.approx(vector)


# --------------------------------------------------------------------- #
# AppSetting / AuditLog (JSON columns, no FK to a required parent)
# --------------------------------------------------------------------- #


def test_app_setting_stores_an_arbitrary_json_value_under_its_key(db) -> None:
    key = f"test-setting-{uuid.uuid4().hex[:8]}"
    setting = AppSetting(key=key, value={"enabled": True, "count": 3})
    db.add(setting)
    db.commit()
    db.refresh(setting)

    assert setting.key == key
    assert setting.value == {"enabled": True, "count": 3}
    assert isinstance(setting.updated_at, datetime)


def test_audit_log_allows_a_null_user_id_and_no_detail(db) -> None:
    log = AuditLog(action="system.startup")
    db.add(log)
    db.commit()
    db.refresh(log)

    assert log.user_id is None
    assert log.detail is None
    assert isinstance(log.created_at, datetime)


def test_audit_log_stores_a_json_detail_payload_linked_to_a_user(db) -> None:
    user = _make_user(db, label="audit-actor")
    log = AuditLog(user_id=user.id, action="user.login", detail={"ip": "127.0.0.1"})
    db.add(log)
    db.commit()
    db.refresh(log)

    assert log.user_id == user.id
    assert log.detail == {"ip": "127.0.0.1"}


# --------------------------------------------------------------------- #
# Table names and module exports
# --------------------------------------------------------------------- #


def test_tablenames_match_the_approved_data_model() -> None:
    assert User.__tablename__ == "users"
    assert SessionModel.__tablename__ == "sessions"
    assert Document.__tablename__ == "documents"
    assert Chunk.__tablename__ == "chunks"
    assert Conversation.__tablename__ == "conversations"
    assert Message.__tablename__ == "messages"
    assert Citation.__tablename__ == "citations"
    assert AppSetting.__tablename__ == "app_settings"
    assert AuditLog.__tablename__ == "audit_logs"


def test_all_declares_every_model_and_the_shared_base() -> None:
    from app import models

    assert set(models.__all__) == {
        "Base",
        "User",
        "Session",
        "Document",
        "Chunk",
        "Conversation",
        "Message",
        "Citation",
        "AppSetting",
        "AuditLog",
    }
    for name in models.__all__:
        assert hasattr(models, name)
