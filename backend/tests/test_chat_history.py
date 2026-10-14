"""US-025-2: follow-up context, first-question persistence/listing, and
startup durability for chat history (built on US-025-1 / US-022-1).

AC-065: a follow-up POST /chat folds the conversation's earlier turns into
the text handed to `generate_answer` (the stubbed generation seam), while
retrieval still runs fresh on the follow-up's own question text alone --
never on the composite transcript.
AC-064/AC-066: a brand-new conversation_id on POST /chat creates exactly
one Conversation row and persists exactly one user and one assistant
Message row; the conversation then appears in GET /conversations.
AC-069: Conversation/Message/Citation rows survive an application startup
cycle (simulated the same way tests/test_startup_persistence.py simulates
one: reloading app.main), and that cycle issues no DELETE/TRUNCATE/DROP
against those tables.

Fakes stand in for embedding and generation exactly as in
tests/test_chat_rag.py and tests/test_chat_generation_errors.py -- no real
network call, no real Groq key, anywhere in this module.
"""

import importlib
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

import app.generation as generation_module
import app.retrieval as retrieval_module
from app.chunking import ChunkDraft, persist_chunks
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Chunk, Citation, Conversation, Document, Message, User
from app.security import hash_password

_PASSWORD = "ChatHistorySeedPass123!"
_DIM = 768


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_user(email: str, *, role: str = "user") -> User:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(email=email, password_hash=hash_password(_PASSWORD), role=role)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _signed_in_client(email: str) -> TestClient:
    client = TestClient(app)
    response = client.post("/auth/login", json={"email": email, "password": _PASSWORD})
    assert response.status_code == 200
    return client


class _FakeEmbeddingProvider:
    """Records every batch of texts it was asked to embed, in call order."""

    def __init__(self):
        self.calls: list[list[str]] = []

    def embed(self, texts):
        self.calls.append(list(texts))
        return [[0.01] * _DIM for _ in texts]


class _RecordingGenerationClient:
    """Records the exact `question` text generate_answer handed it, in
    call order, and returns a fixed, distinguishable answer each time."""

    def __init__(self):
        self.received_questions: list[str] = []
        self._count = 0

    def generate(self, question, context):
        self._count += 1
        self.received_questions.append(question)
        return f"Generated answer #{self._count}."


def _wipe_chat_tables() -> None:
    """This module seeds conversations/messages/citations and, for the
    startup test, documents/chunks directly against the ORM -- rows other
    modules' exact-count assertions (e.g. tests/test_documents.py) would
    otherwise see leak in. Cleared before and after every test here, same
    rationale as tests/test_chat_rag.py's _isolated_knowledge_base."""
    db = SessionLocal()
    try:
        db.query(Citation).delete()
        db.query(Message).delete()
        db.query(Conversation).delete()
        db.query(Chunk).delete()
        db.query(Document).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _isolated_chat_history():
    _wipe_chat_tables()
    yield
    _wipe_chat_tables()


# --------------------------------------------------------------------- #
# AC-065
# --------------------------------------------------------------------- #


def test_follow_up_folds_earlier_turns_into_generation_while_retrieval_stays_on_its_own_text(
    monkeypatch,
) -> None:
    user = _seed_user(_unique_email("chathist-followup"))
    client = _signed_in_client(user.email)

    fake_embedding = _FakeEmbeddingProvider()
    fake_generation = _RecordingGenerationClient()
    monkeypatch.setattr(retrieval_module, "get_embedding_provider", lambda: fake_embedding)
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_generation)

    conversation_id = str(uuid.uuid4())
    first_question = "What is the vacation policy?"
    first_response = client.post(
        "/chat", json={"conversation_id": conversation_id, "question": first_question}
    )
    assert first_response.status_code == 200
    first_answer = first_response.json()["answer"]

    follow_up_question = "And what about sick days specifically?"
    second_response = client.post(
        "/chat", json={"conversation_id": conversation_id, "question": follow_up_question}
    )
    assert second_response.status_code == 200

    # Retrieval ran fresh, each time, on that call's own question text alone
    # -- never the composite transcript generation saw.
    assert fake_embedding.calls[0] == [first_question]
    assert fake_embedding.calls[-1] == [follow_up_question]

    # Generation for the follow-up saw the earlier turn's question and
    # answer text folded in, plus its own question text.
    second_generation_question = fake_generation.received_questions[-1]
    assert first_question in second_generation_question
    assert first_answer in second_generation_question
    assert follow_up_question in second_generation_question

    # The very first call had no prior turns to fold in at all.
    first_generation_question = fake_generation.received_questions[0]
    assert first_generation_question == first_question


# --------------------------------------------------------------------- #
# AC-064 / AC-066
# --------------------------------------------------------------------- #


def test_first_question_creates_conversation_and_persists_one_user_and_one_assistant_message(
    monkeypatch,
) -> None:
    user = _seed_user(_unique_email("chathist-first"))
    client = _signed_in_client(user.email)

    fake_embedding = _FakeEmbeddingProvider()
    fake_generation = _RecordingGenerationClient()
    monkeypatch.setattr(retrieval_module, "get_embedding_provider", lambda: fake_embedding)
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_generation)

    conversation_id = str(uuid.uuid4())
    response = client.post(
        "/chat",
        json={"conversation_id": conversation_id, "question": "What is the refund window?"},
    )
    assert response.status_code == 200

    db = SessionLocal()
    try:
        conversation = (
            db.query(Conversation).filter(Conversation.id == uuid.UUID(conversation_id)).one()
        )
        assert conversation.user_id == user.id
        messages = db.query(Message).filter(Message.conversation_id == conversation.id).all()
    finally:
        db.close()

    assert len(messages) == 2
    assert sorted(message.role for message in messages) == ["assistant", "user"]
    assert sum(1 for message in messages if message.role == "user") == 1
    assert sum(1 for message in messages if message.role == "assistant") == 1

    list_response = client.get("/conversations")
    assert list_response.status_code == 200
    listed_ids = [row["id"] for row in list_response.json()]
    assert conversation_id in listed_ids


# --------------------------------------------------------------------- #
# AC-069
# --------------------------------------------------------------------- #


def test_chat_history_rows_survive_a_startup_cycle_with_no_delete_or_truncate() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(
            email=_unique_email("chathist-startup"),
            password_hash=hash_password(_PASSWORD),
            role="admin",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        document = Document(
            filename="startup-survives.txt",
            file_type="txt",
            size_bytes=1,
            s3_key=f"documents/fake/{uuid.uuid4().hex}.txt",
            status="ready",
            uploaded_by=user.id,
        )
        db.add(document)
        db.commit()
        db.refresh(document)

        [chunk] = persist_chunks(
            db, document, [ChunkDraft(index=0, content="Startup content.", page_ref=1)]
        )
        chunk.embedding = [0.01] * _DIM
        db.add(chunk)
        db.commit()
        db.refresh(chunk)

        conversation = Conversation(user_id=user.id, title="Startup survives")
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

        db.add(
            Message(
                conversation_id=conversation.id,
                role="user",
                content="Does this survive a restart?",
            )
        )
        db.commit()

        assistant_message = Message(
            conversation_id=conversation.id,
            role="assistant",
            content="Yes, it does.",
            from_documents=True,
        )
        db.add(assistant_message)
        db.commit()
        db.refresh(assistant_message)

        db.add(
            Citation(
                message_id=assistant_message.id,
                chunk_id=chunk.id,
                document_id=document.id,
                number=1,
                filename=document.filename,
                page_ref=1,
                section_ref=None,
                text_preview="Startup content.",
            )
        )
        db.commit()

        conversation_id = conversation.id
        assistant_message_id = assistant_message.id
    finally:
        db.close()

    destructive_statements: list[str] = []

    def _capture(conn, cursor, statement, parameters, context, executemany):
        upper = statement.strip().upper()
        if upper.startswith(("DELETE", "TRUNCATE", "DROP")):
            destructive_statements.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        # Simulate a restart: re-import/re-run the application module, the
        # same technique tests/test_startup_persistence.py uses.
        import app.main as main_module

        importlib.reload(main_module)
        TestClient(main_module.app)
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    relevant_destructive_statements = [
        statement
        for statement in destructive_statements
        if any(table in statement for table in ("conversations", "messages", "citations"))
    ]
    assert relevant_destructive_statements == []

    db = SessionLocal()
    try:
        assert db.query(Conversation).filter(Conversation.id == conversation_id).count() == 1
        assert (
            db.query(Message).filter(Message.conversation_id == conversation_id).count() == 2
        )
        assert (
            db.query(Citation).filter(Citation.message_id == assistant_message_id).count() == 1
        )
    finally:
        db.close()
