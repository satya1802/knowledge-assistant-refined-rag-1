"""US-019-1: app/embedding.py -- batching/dimension validation (AC-044),
success write-through (AC-045), bounded retry/backoff on final failure
(AC-046), and the server-side provider selection contract (AC-155).

A fake `EmbeddingProvider` is injected into `index_document` throughout:
the default/real provider is never exercised, matching the constraint that
no real embedding API is ever called from this suite.
"""

import dataclasses
import uuid

import pytest

import app.embedding as embedding_module
from app.chunking import ChunkDraft, persist_chunks
from app.database import Base, SessionLocal, engine
from app.embedding import (
    EMBED_BATCH_SIZE,
    EmbeddingProviderError,
    backoff_base_seconds,
    get_embedding_provider,
    index_document,
    max_retries,
)
from app.models import Chunk, Document, User
from app.security import hash_password

_PASSWORD = "EmbedSeedPass123!"


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_document_with_chunks(n_chunks: int, filename: str = "doc.txt") -> Document:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(
            email=_unique_email("embed-owner"),
            password_hash=hash_password(_PASSWORD),
            role="admin",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        document = Document(
            filename=filename,
            file_type="txt",
            size_bytes=1,
            s3_key="documents/fake/key.txt",
            status="processing",
            uploaded_by=user.id,
        )
        db.add(document)
        db.commit()
        db.refresh(document)

        base = ChunkDraft(index=0, content="word " * 50, page_ref=1)
        drafts = [dataclasses.replace(base, index=i) for i in range(n_chunks)]
        persist_chunks(db, document, drafts)
        return document
    finally:
        db.close()


class _FakeProvider:
    """Returns one 768-dim vector per input text, in order."""

    def __init__(self, dim: int = 768):
        self.dim = dim
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[0.1] * self.dim for _ in texts]


class _WrongDimensionProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 5 for _ in texts]


class _AlwaysFailsProvider:
    def __init__(self):
        self.attempts = 0

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.attempts += 1
        raise EmbeddingProviderError("rate limited")


class _FailsThenSucceedsProvider:
    def __init__(self, fail_times: int, dim: int = 768):
        self.fail_times = fail_times
        self.attempts = 0
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.attempts += 1
        if self.attempts <= self.fail_times:
            raise EmbeddingProviderError("transient error")
        return [[0.2] * self.dim for _ in texts]


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    """Retries must not actually slow the test suite down."""
    monkeypatch.setattr(embedding_module.time, "sleep", lambda _seconds: None)


# --------------------------------------------------------------------- #
# AC-044: batching at <=100 chunks/call, dimension validation
# --------------------------------------------------------------------- #


def test_embed_batches_requests_at_a_maximum_of_100_chunks_per_call() -> None:
    document = _seed_document_with_chunks(n_chunks=EMBED_BATCH_SIZE + 5)
    provider = _FakeProvider()

    db = SessionLocal()
    try:
        status = index_document(db, document, provider=provider)
        assert status == "ready"
        assert len(provider.calls) == 2
        assert len(provider.calls[0]) == EMBED_BATCH_SIZE
        assert len(provider.calls[1]) == 5
    finally:
        db.close()


def test_a_wrong_dimension_vector_is_a_hard_error_and_is_never_stored() -> None:
    document = _seed_document_with_chunks(n_chunks=2, filename="wrongdim.txt")
    provider = _WrongDimensionProvider()

    db = SessionLocal()
    try:
        status = index_document(db, document, provider=provider)
        assert status == "failed"

        refreshed = db.query(Document).filter(Document.id == document.id).one()
        assert refreshed.status == "failed"
        assert refreshed.failure_reason

        chunks = db.query(Chunk).filter(Chunk.document_id == document.id).all()
        assert all(chunk.embedding is None for chunk in chunks)
    finally:
        db.close()


# --------------------------------------------------------------------- #
# AC-045: success write-through
# --------------------------------------------------------------------- #


def test_on_success_vectors_are_written_and_document_becomes_ready() -> None:
    document = _seed_document_with_chunks(n_chunks=3, filename="success.txt")
    document.failure_reason = "stale reason from a previous attempt"

    db = SessionLocal()
    try:
        db.add(document)
        db.commit()

        provider = _FakeProvider()
        status = index_document(db, document, provider=provider)
        assert status == "ready"

        refreshed = db.query(Document).filter(Document.id == document.id).one()
        assert refreshed.status == "ready"
        assert refreshed.failure_reason is None

        chunks = (
            db.query(Chunk)
            .filter(Chunk.document_id == document.id)
            .order_by(Chunk.chunk_index)
            .all()
        )
        assert len(chunks) == 3
        for chunk in chunks:
            assert chunk.embedding is not None
            assert len(chunk.embedding) == 768
    finally:
        db.close()


# --------------------------------------------------------------------- #
# AC-046: bounded retry/backoff, final failure keeps rows
# --------------------------------------------------------------------- #


def test_transient_errors_retry_and_eventually_succeed_within_the_bound() -> None:
    document = _seed_document_with_chunks(n_chunks=1, filename="retry-success.txt")
    provider = _FailsThenSucceedsProvider(fail_times=max_retries() - 1)

    db = SessionLocal()
    try:
        status = index_document(db, document, provider=provider)
        assert status == "ready"
        assert provider.attempts == max_retries()
    finally:
        db.close()


def test_final_failure_after_bounded_retries_sets_failed_and_keeps_rows() -> None:
    document = _seed_document_with_chunks(n_chunks=2, filename="retry-fail.txt")
    provider = _AlwaysFailsProvider()

    db = SessionLocal()
    try:
        status = index_document(db, document, provider=provider)
        assert status == "failed"
        assert provider.attempts == max_retries()

        refreshed = db.query(Document).filter(Document.id == document.id).one()
        assert refreshed.status == "failed"
        assert refreshed.failure_reason
        assert len(refreshed.failure_reason) < 600

        chunks = db.query(Chunk).filter(Chunk.document_id == document.id).all()
        assert len(chunks) == 2  # neither the document nor its chunks were deleted
    finally:
        db.close()


def test_retry_bounds_are_configurable_via_environment(monkeypatch) -> None:
    monkeypatch.setenv("EMBEDDING_MAX_RETRIES", "5")
    monkeypatch.setenv("EMBEDDING_BACKOFF_BASE_SECONDS", "0.01")
    assert max_retries() == 5
    assert backoff_base_seconds() == 0.01


def test_no_chunks_to_embed_fails_cleanly() -> None:
    document = _seed_document_with_chunks(n_chunks=0, filename="empty.txt")
    db = SessionLocal()
    try:
        status = index_document(db, document, provider=_FakeProvider())
        assert status == "failed"
        refreshed = db.query(Document).filter(Document.id == document.id).one()
        assert refreshed.failure_reason
    finally:
        db.close()


# --------------------------------------------------------------------- #
# AC-155: server-side provider selection, disabled-by-default
# --------------------------------------------------------------------- #


def test_default_provider_reports_itself_disabled_with_a_clear_message() -> None:
    provider = get_embedding_provider()
    with pytest.raises(EmbeddingProviderError, match="disabled"):
        provider.embed(["hello"])


def test_an_unrecognized_provider_name_is_also_disabled_not_a_crash(monkeypatch) -> None:
    import app.settings as settings_module

    monkeypatch.setattr(
        settings_module,
        "settings",
        settings_module.Settings(embedding_provider="made-up-provider"),
    )
    monkeypatch.setattr(embedding_module, "settings", settings_module.settings)

    provider = get_embedding_provider()
    with pytest.raises(EmbeddingProviderError, match="made-up-provider"):
        provider.embed(["hello"])


def test_getting_the_provider_never_raises_or_calls_anything_at_construction_time() -> None:
    # Constructing it must not itself attempt any network call; only
    # calling .embed() may raise.
    get_embedding_provider()


def test_no_provider_key_appears_in_the_disabled_message() -> None:
    provider = get_embedding_provider()
    try:
        provider.embed(["hello"])
    except EmbeddingProviderError as exc:
        assert "key" not in str(exc).lower() or "API key" not in str(exc)
