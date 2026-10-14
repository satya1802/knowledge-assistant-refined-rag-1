"""US-022-3: POST /chat's grounded path, fallback path and citation
persistence, plus the conversations endpoints that read what it wrote.

Covers the US-022-1 contract end to end:

* Grounded (AC-052/AC-053): chunks scoring at/above the 0.62 threshold are
  the only context handed to generation; the response is
  `from_documents=true` with citations numbered 1..n.
* Fallback (AC-058/AC-059/AC-060): with everything below threshold, the
  embedding seam still runs before generation sees an empty context; the
  response is `from_documents=false` with `citations == []`.
* Empty knowledge base: the same fallback path, with zero rows in `chunks`
  at all -- retrieval still runs, zero `Citation` rows are written.
* Persistence (AC-054): `GET /conversations/{id}` returns the identical
  citation numbers/filenames/refs/previews the original `POST /chat`
  response carried.
* Isolation: list/detail/delete are scoped to the owning user; another
  user gets 404, never 403 (so existence is never leaked).
* Regression (AC-061/AC-063): a `GenerationError` still yields a structured
  503 and writes no `Message` or `Citation` row, even when retrieval found
  a grounded match first.

A fake `EmbeddingProvider` (injected via `app.retrieval.get_embedding_provider`)
and a fake `GenerationClient` (injected via `app.generation.get_generation_client`)
stand in throughout -- no real network call, no real Groq key, matching the
pattern in `tests/test_chat_generation_errors.py` and `tests/test_embedding.py`.

Every test in this module gets a clean `documents`/`chunks`/`citations`
table before and after it runs (see `_isolated_knowledge_base` below). Two
reasons this matters: (1) several tests here assert an exact retrieved set
against a fixed query vector, so a `Chunk` left over from an earlier test
in this module -- scoring above threshold against that same query vector --
would silently leak into a later test's "below threshold" or "empty
knowledge base" expectations; and (2) `Document` rows created directly here
(bypassing the normal upload flow) are real rows in the same database other
test modules' `/documents` listing assertions query against, so leaving any
behind after this module runs would corrupt an unrelated module's exact-set
assertions (e.g. `tests/test_documents_delete.py`'s status/type filters).
"""

import uuid

import pytest
from fastapi.testclient import TestClient

import app.generation as generation_module
import app.retrieval as retrieval_module
from app.chunking import ChunkDraft, persist_chunks
from app.database import Base, SessionLocal, engine
from app.generation import GenerationAuthError
from app.main import app
from app.models import Chunk, Citation, Conversation, Document, Message, User
from app.security import hash_password

_PASSWORD = "ChatRagSeedPass123!"
_DIM = 768
_QUERY_VECTOR = [1.0] * _DIM
_MATCH_VECTOR = [1.0] * _DIM  # cosine(_QUERY_VECTOR, _MATCH_VECTOR) == 1.0
_BELOW_THRESHOLD_VECTOR = [1.0, -1.0] * (_DIM // 2)  # cosine(_QUERY_VECTOR, this) == 0.0


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


def _seed_document(db, *, filename: str, uploaded_by: uuid.UUID) -> Document:
    document = Document(
        filename=filename,
        file_type="txt",
        size_bytes=1,
        s3_key=f"documents/fake/{uuid.uuid4().hex}.txt",
        status="ready",
        uploaded_by=uploaded_by,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def _seed_chunk(db, document: Document, *, content: str, page_ref: int, embedding: list[float]):
    [chunk] = persist_chunks(
        db, document, [ChunkDraft(index=0, content=content, page_ref=page_ref)]
    )
    chunk.embedding = embedding
    db.add(chunk)
    db.commit()
    db.refresh(chunk)
    return chunk


def _wipe_chunks_and_documents() -> None:
    """Guarantees a literal empty knowledge base, independent of what any
    other test -- in this module or another -- left behind in the shared
    sqlite file (see tests/conftest.py)."""
    db = SessionLocal()
    try:
        db.query(Citation).delete()
        db.query(Chunk).delete()
        db.query(Document).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _isolated_knowledge_base():
    """Every test in this module starts from, and leaves behind, zero
    `Document`/`Chunk`/`Citation` rows: this module is the only one that
    seeds chunks with a fixed, reused query vector directly against the
    ORM, so without this a chunk left over from one test would leak into a
    later test's retrieval (here, or in a module collected afterwards)."""
    _wipe_chunks_and_documents()
    yield
    _wipe_chunks_and_documents()


class _FakeEmbeddingProvider:
    def __init__(self, vector: list[float] = _QUERY_VECTOR):
        self.vector = vector
        self.calls = 0

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls += 1
        return [self.vector for _ in texts]


class _RecordingGenerationClient:
    def __init__(self, answer: str = "Here is the answer. [1]"):
        self.answer = answer
        self.calls = 0
        self.received_context = None

    def generate(self, question, context):
        self.calls += 1
        self.received_context = context
        return self.answer


def _row_counts() -> dict:
    db = SessionLocal()
    try:
        return {
            "conversations": db.query(Conversation).count(),
            "messages": db.query(Message).count(),
            "citations": db.query(Citation).count(),
        }
    finally:
        db.close()


# --------------------------------------------------------------------- #
# Grounded path
# --------------------------------------------------------------------- #


def test_grounded_path_only_passes_above_threshold_chunks_and_numbers_citations(
    monkeypatch,
) -> None:
    admin = _seed_user(_unique_email("chatrag-grounded"), role="admin")
    db = SessionLocal()
    try:
        document = _seed_document(db, filename="grounded.txt", uploaded_by=admin.id)
        matching_chunk = _seed_chunk(
            db, document, content="Matching content.", page_ref=1, embedding=_MATCH_VECTOR
        )
        _seed_chunk(
            db,
            document,
            content="Unrelated content.",
            page_ref=2,
            embedding=_BELOW_THRESHOLD_VECTOR,
        )
    finally:
        db.close()

    fake_embedding = _FakeEmbeddingProvider()
    fake_generation = _RecordingGenerationClient()
    monkeypatch.setattr(retrieval_module, "get_embedding_provider", lambda: fake_embedding)
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_generation)

    client = _signed_in_client(admin.email)
    conversation_id = str(uuid.uuid4())
    response = client.post(
        "/chat", json={"conversation_id": conversation_id, "question": "What is in the policy?"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["from_documents"] is True
    assert [c["number"] for c in body["citations"]] == [1]
    assert body["citations"][0]["filename"] == "grounded.txt"
    assert body["citations"][0]["chunk_id"] == str(matching_chunk.id)

    # Only the matching chunk reached generation as context.
    assert fake_generation.calls == 1
    assert len(fake_generation.received_context) == 1
    assert fake_generation.received_context[0].chunk.id == matching_chunk.id

    db = SessionLocal()
    try:
        citations = (
            db.query(Citation)
            .join(Message)
            .filter(Message.conversation_id == uuid.UUID(conversation_id))
            .all()
        )
        assert len(citations) == 1
        assert citations[0].number == 1
        assert citations[0].chunk_id == matching_chunk.id
    finally:
        db.close()


# --------------------------------------------------------------------- #
# Fallback path
# --------------------------------------------------------------------- #


def test_fallback_path_still_invokes_embedding_before_generation_sees_empty_context(
    monkeypatch,
) -> None:
    admin = _seed_user(_unique_email("chatrag-fallback"), role="admin")
    db = SessionLocal()
    try:
        document = _seed_document(db, filename="fallback.txt", uploaded_by=admin.id)
        _seed_chunk(
            db,
            document,
            content="Below threshold one.",
            page_ref=1,
            embedding=_BELOW_THRESHOLD_VECTOR,
        )
        _seed_chunk(
            db,
            document,
            content="Below threshold two.",
            page_ref=2,
            embedding=_BELOW_THRESHOLD_VECTOR,
        )
    finally:
        db.close()

    fake_embedding = _FakeEmbeddingProvider()
    fake_generation = _RecordingGenerationClient()
    monkeypatch.setattr(retrieval_module, "get_embedding_provider", lambda: fake_embedding)
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_generation)

    client = _signed_in_client(admin.email)
    conversation_id = str(uuid.uuid4())
    before = _row_counts()

    response = client.post(
        "/chat",
        json={"conversation_id": conversation_id, "question": "Totally unrelated question."},
    )

    assert response.status_code == 200
    body = response.json()
    assert fake_embedding.calls == 1  # the seam was invoked before generation
    assert fake_generation.calls == 1
    assert fake_generation.received_context == []
    assert body["from_documents"] is False
    assert body["citations"] == []

    after = _row_counts()
    assert after["citations"] == before["citations"]  # zero new Citation rows


# --------------------------------------------------------------------- #
# Empty knowledge base
# --------------------------------------------------------------------- #


def test_empty_knowledge_base_still_runs_retrieval_and_writes_zero_citations(monkeypatch) -> None:
    _wipe_chunks_and_documents()
    admin = _seed_user(_unique_email("chatrag-empty"), role="admin")

    fake_embedding = _FakeEmbeddingProvider()
    fake_generation = _RecordingGenerationClient()
    monkeypatch.setattr(retrieval_module, "get_embedding_provider", lambda: fake_embedding)
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_generation)

    client = _signed_in_client(admin.email)
    conversation_id = str(uuid.uuid4())

    response = client.post(
        "/chat", json={"conversation_id": conversation_id, "question": "Anything at all?"}
    )

    assert response.status_code == 200
    body = response.json()
    assert fake_embedding.calls == 1  # retrieval still ran
    assert body["from_documents"] is False
    assert body["citations"] == []

    db = SessionLocal()
    try:
        assert db.query(Citation).count() == 0
    finally:
        db.close()


# --------------------------------------------------------------------- #
# Persistence
# --------------------------------------------------------------------- #


def test_persisted_citations_match_the_original_chat_response_exactly(monkeypatch) -> None:
    admin = _seed_user(_unique_email("chatrag-persist"), role="admin")
    db = SessionLocal()
    try:
        document = _seed_document(db, filename="persisted-ref.txt", uploaded_by=admin.id)
        _seed_chunk(
            db, document, content="Persisted matching content.", page_ref=4, embedding=_MATCH_VECTOR
        )
    finally:
        db.close()

    fake_embedding = _FakeEmbeddingProvider()
    fake_generation = _RecordingGenerationClient(answer="Persisted answer [1]")
    monkeypatch.setattr(retrieval_module, "get_embedding_provider", lambda: fake_embedding)
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_generation)

    client = _signed_in_client(admin.email)
    conversation_id = str(uuid.uuid4())

    chat_response = client.post(
        "/chat", json={"conversation_id": conversation_id, "question": "Persist this please."}
    )
    assert chat_response.status_code == 200
    original_citations = chat_response.json()["citations"]
    assert len(original_citations) == 1

    detail_response = client.get(f"/conversations/{conversation_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()

    assistant_messages = [m for m in detail["messages"] if m["role"] == "assistant"]
    assert len(assistant_messages) == 1
    persisted_citations = assistant_messages[0]["citations"]
    assert len(persisted_citations) == 1

    original = original_citations[0]
    persisted = persisted_citations[0]
    assert persisted["number"] == original["number"]
    assert persisted["filename"] == original["filename"]
    assert persisted["page_ref"] == original["page_ref"]
    assert persisted["section_ref"] == original["section_ref"]
    assert persisted["text_preview"] == original["text_preview"]
    assert persisted["document_id"] == original["document_id"]
    assert persisted["chunk_id"] == original["chunk_id"]


# --------------------------------------------------------------------- #
# Isolation
# --------------------------------------------------------------------- #


def test_conversations_list_detail_and_delete_are_scoped_to_the_owning_user() -> None:
    owner = _seed_user(_unique_email("chatrag-owner"))
    stranger = _seed_user(_unique_email("chatrag-stranger"))
    owner_client = _signed_in_client(owner.email)
    stranger_client = _signed_in_client(stranger.email)

    created = owner_client.post("/conversations", json={"title": "Owner's conversation"})
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    # Stranger cannot see it in their list.
    stranger_list = stranger_client.get("/conversations")
    assert conversation_id not in [row["id"] for row in stranger_list.json()]

    # Stranger gets a 404 on detail -- never a 403.
    stranger_detail = stranger_client.get(f"/conversations/{conversation_id}")
    assert stranger_detail.status_code == 404

    # Stranger cannot delete it either.
    stranger_delete = stranger_client.delete(f"/conversations/{conversation_id}")
    assert stranger_delete.status_code == 404

    # The owner can still see, read and delete it.
    owner_detail = owner_client.get(f"/conversations/{conversation_id}")
    assert owner_detail.status_code == 200

    owner_delete = owner_client.delete(f"/conversations/{conversation_id}")
    assert owner_delete.status_code == 204

    owner_detail_after_delete = owner_client.get(f"/conversations/{conversation_id}")
    assert owner_detail_after_delete.status_code == 404


# --------------------------------------------------------------------- #
# Regression: GenerationError still yields a structured 503, no writes
# --------------------------------------------------------------------- #


def test_generation_error_after_a_grounded_retrieval_still_yields_503_and_writes_nothing(
    monkeypatch,
) -> None:
    admin = _seed_user(_unique_email("chatrag-regression"), role="admin")
    db = SessionLocal()
    try:
        document = _seed_document(db, filename="regression.txt", uploaded_by=admin.id)
        _seed_chunk(
            db, document, content="Would-be matching content.", page_ref=1, embedding=_MATCH_VECTOR
        )
    finally:
        db.close()

    class _FailingClient:
        def generate(self, question, context):
            raise GenerationAuthError("Groq rejected the request: invalid credentials.")

    fake_embedding = _FakeEmbeddingProvider()
    monkeypatch.setattr(retrieval_module, "get_embedding_provider", lambda: fake_embedding)
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: _FailingClient())

    client = _signed_in_client(admin.email)
    before = _row_counts()

    response = client.post(
        "/chat", json={"conversation_id": str(uuid.uuid4()), "question": "Will this fail?"}
    )

    assert response.status_code == 503
    body = response.json()["detail"]
    assert body["code"] == "groq_auth_error"
    assert body["message"]

    after = _row_counts()
    assert after == before
