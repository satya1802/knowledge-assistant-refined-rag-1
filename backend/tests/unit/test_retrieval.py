"""Unit tests for `app/retrieval.py`: `retrieve_relevant_chunks`, the one
seam `app/routers/chat.py` calls before any answer-generation call (module
docstring), and its private `_cosine_similarity` helper -- exercised
directly against a real (SQLite) `Session` and a fake `EmbeddingProvider`,
never through `client`/`TestClient` (that belongs in
`backend/tests/integration/`, see `backend/tests/test_chat_rag.py`, which
already covers the end-to-end `POST /chat` contract this function backs).

This ticket carries no acceptance criteria of its own ("Write unit tests
only... This ticket carries no acceptance criteria"), so tests are named
after the module's own documented guarantees rather than an `AC-###`:

  * only chunks scoring at or above the in-force threshold are returned,
    highest score first, capped at `limit`;
  * a chunk with no stored embedding is never considered, even when one
    exists;
  * the threshold is read fresh from `app/settings_store.py` on every call
    when not given explicitly, and an explicit `threshold=` overrides it;
  * the boundary is inclusive (`score >= threshold`, not `>`);
  * a disabled/erroring provider, or a knowledge base with nothing
    embedded yet, yields an empty list rather than raising -- `POST /chat`
    must still be able to answer from general knowledge;
  * `provider=` is genuinely injected: the server-configured default from
    `get_embedding_provider()` is never touched when a provider is passed;
  * `_cosine_similarity` itself: the textbook cases (identical, orthogonal,
    opposite vectors) and its documented zero-vector/mismatched-length
    safety net.
"""

from __future__ import annotations

import math
import uuid

import pytest

import app.retrieval as retrieval_module
from app.database import Base, SessionLocal, engine
from app.embedding import EmbeddingProviderError
from app.models import Chunk, Document, User
from app.retrieval import (
    DEFAULT_RESULT_LIMIT,
    RetrievedChunk,
    _cosine_similarity,
    retrieve_relevant_chunks,
)
from app.security import hash_password
from app.settings_store import DEFAULT_SIMILARITY_THRESHOLD, set_similarity_threshold

_DIM = 768


class _FakeEmbeddingProvider:
    """Returns a fixed vector for every text, regardless of `question`
    (retrieval only ever embeds one question per call)."""

    def __init__(self, vector: list[float]):
        self.vector = vector
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        return [self.vector for _ in texts]


class _RaisingEmbeddingProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise EmbeddingProviderError("disabled")


class _EmptyEmbeddingProvider:
    """A pathological provider that returns no vectors at all for a
    non-empty input -- the other way `retrieve_relevant_chunks` must not
    blow up on a bad adapter."""

    def embed(self, texts: list[str]) -> list[list[float]]:
        return []


def _unit_vector(index: int, dim: int = _DIM) -> list[float]:
    vector = [0.0] * dim
    vector[index] = 1.0
    return vector


def _vector_with_cosine_to(query: list[float], score: float, dim: int = _DIM) -> list[float]:
    """Builds a unit vector whose cosine similarity to the unit `query`
    (which must be `_unit_vector(0, dim)`) is exactly `score`, by putting
    `score` in the first component and the remaining unit mass in the
    second -- so `dot(query, vector) == score` with no other term
    contributing, with `query` and `vector` both unit length."""
    remainder = math.sqrt(max(0.0, 1.0 - score * score))
    vector = [0.0] * dim
    vector[0] = score
    vector[1] = remainder
    return vector


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        # This module seeds `Chunk`/`Document` rows directly against the
        # ORM and reuses fixed query vectors across tests; leaving any
        # behind would leak into a later test's "only above threshold"
        # count in this module or (being real rows in the shared sqlite
        # file, see tests/conftest.py) another module's exact-set
        # assertions over `documents`/`chunks`.
        session.query(Chunk).delete()
        session.query(Document).delete()
        session.query(User).filter(User.email.like("retrieval-unit-%")).delete(
            synchronize_session=False
        )
        session.commit()
        session.close()


def _seed_user(db) -> User:
    user = User(
        email=f"retrieval-unit-{uuid.uuid4().hex[:10]}@example.com",
        password_hash=hash_password("RetrievalUnitPass123!"),
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_document(db) -> Document:
    document = Document(
        filename="retrieval-unit.txt",
        file_type="txt",
        size_bytes=1,
        s3_key=f"documents/fake/{uuid.uuid4().hex}.txt",
        status="ready",
        uploaded_by=_seed_user(db).id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def _seed_chunk(
    db, document: Document, *, content: str, embedding: list[float] | None
) -> Chunk:
    chunk = Chunk(document_id=document.id, chunk_index=0, content=content, embedding=embedding)
    db.add(chunk)
    db.commit()
    db.refresh(chunk)
    return chunk


# --------------------------------------------------------------------- #
# _cosine_similarity
# --------------------------------------------------------------------- #


def test_cosine_similarity_of_identical_vectors_is_one() -> None:
    v = [1.0, 2.0, 3.0]

    assert _cosine_similarity(v, v) == pytest.approx(1.0)


def test_cosine_similarity_of_orthogonal_vectors_is_zero() -> None:
    assert _cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_similarity_of_opposite_vectors_is_negative_one() -> None:
    assert _cosine_similarity([1.0, 0.0], [-1.0, 0.0]) == pytest.approx(-1.0)


def test_cosine_similarity_is_scale_invariant() -> None:
    a = [1.0, 2.0, 3.0]
    b = [2.0, 4.0, 6.0]  # same direction, different magnitude

    assert _cosine_similarity(a, b) == pytest.approx(1.0)


@pytest.mark.parametrize(
    "a, b",
    [
        ([], [1.0, 2.0]),
        ([1.0, 2.0], []),
        ([1.0, 2.0], [1.0, 2.0, 3.0]),  # mismatched length
        ([0.0, 0.0], [1.0, 1.0]),  # zero-norm vector
        ([1.0, 1.0], [0.0, 0.0]),
    ],
)
def test_cosine_similarity_returns_zero_rather_than_raising_on_bad_input(a, b) -> None:
    assert _cosine_similarity(a, b) == 0.0


# --------------------------------------------------------------------- #
# retrieve_relevant_chunks: threshold filtering and ordering
# --------------------------------------------------------------------- #


def test_retrieve_relevant_chunks_returns_only_chunks_at_or_above_threshold(db) -> None:
    query = _unit_vector(0)
    document = _seed_document(db)
    above = _seed_chunk(
        db, document, content="above", embedding=_vector_with_cosine_to(query, 0.9)
    )
    _seed_chunk(db, document, content="below", embedding=_vector_with_cosine_to(query, 0.1))

    results = retrieve_relevant_chunks(
        db, "a question", provider=_FakeEmbeddingProvider(query), threshold=0.62
    )

    assert [r.chunk.id for r in results] == [above.id]


def test_retrieve_relevant_chunks_sorts_by_score_highest_first(db) -> None:
    query = _unit_vector(0)
    document = _seed_document(db)
    low = _seed_chunk(db, document, content="low", embedding=_vector_with_cosine_to(query, 0.65))
    high = _seed_chunk(
        db, document, content="high", embedding=_vector_with_cosine_to(query, 0.95)
    )
    mid = _seed_chunk(db, document, content="mid", embedding=_vector_with_cosine_to(query, 0.8))

    results = retrieve_relevant_chunks(
        db, "a question", provider=_FakeEmbeddingProvider(query), threshold=0.62
    )

    assert [r.chunk.id for r in results] == [high.id, mid.id, low.id]
    assert results[0].score > results[1].score > results[2].score


def test_retrieve_relevant_chunks_boundary_is_inclusive_not_exclusive(db) -> None:
    """A chunk scoring exactly the in-force threshold is returned
    (`score >= threshold`), not dropped by a strict `>`. The threshold is
    derived from the exact score `_cosine_similarity` computes for these
    two vectors, so the test holds regardless of floating-point rounding
    in how that score was produced."""
    query = _unit_vector(0)
    document = _seed_document(db)
    chunk_vector = _vector_with_cosine_to(query, 0.7)
    exact_score = _cosine_similarity(query, chunk_vector)
    chunk = _seed_chunk(db, document, content="on the line", embedding=chunk_vector)

    results = retrieve_relevant_chunks(
        db, "a question", provider=_FakeEmbeddingProvider(query), threshold=exact_score
    )

    assert [r.chunk.id for r in results] == [chunk.id]
    assert results[0].score == pytest.approx(exact_score)


def test_retrieve_relevant_chunks_excludes_chunks_with_no_stored_embedding(db) -> None:
    query = _unit_vector(0)
    document = _seed_document(db)
    _seed_chunk(db, document, content="never embedded", embedding=None)
    matching = _seed_chunk(
        db, document, content="embedded match", embedding=_vector_with_cosine_to(query, 0.9)
    )

    results = retrieve_relevant_chunks(
        db, "a question", provider=_FakeEmbeddingProvider(query), threshold=0.62
    )

    assert [r.chunk.id for r in results] == [matching.id]


def test_retrieve_relevant_chunks_caps_results_at_limit(db) -> None:
    query = _unit_vector(0)
    document = _seed_document(db)
    for i, score in enumerate([0.99, 0.95, 0.9, 0.85]):
        _seed_chunk(
            db, document, content=f"chunk-{i}", embedding=_vector_with_cosine_to(query, score)
        )

    results = retrieve_relevant_chunks(
        db, "a question", provider=_FakeEmbeddingProvider(query), threshold=0.62, limit=2
    )

    assert len(results) == 2
    assert results[0].score > results[1].score


def test_retrieve_relevant_chunks_default_limit_matches_the_module_constant(db) -> None:
    query = _unit_vector(0)
    document = _seed_document(db)
    for i in range(DEFAULT_RESULT_LIMIT + 3):
        _seed_chunk(
            db, document, content=f"chunk-{i}", embedding=_vector_with_cosine_to(query, 0.99)
        )

    results = retrieve_relevant_chunks(
        db, "a question", provider=_FakeEmbeddingProvider(query), threshold=0.62
    )

    assert len(results) == DEFAULT_RESULT_LIMIT


# --------------------------------------------------------------------- #
# retrieve_relevant_chunks: empty / error cases never raise
# --------------------------------------------------------------------- #


def test_retrieve_relevant_chunks_returns_empty_list_when_knowledge_base_has_no_embedded_chunks(
    db,
) -> None:
    results = retrieve_relevant_chunks(
        db, "anything", provider=_FakeEmbeddingProvider(_unit_vector(0)), threshold=0.62
    )

    assert results == []


def test_retrieve_relevant_chunks_returns_empty_list_when_the_provider_raises(db) -> None:
    document = _seed_document(db)
    _seed_chunk(
        db,
        document,
        content="would otherwise match anything",
        embedding=_unit_vector(0),
    )

    results = retrieve_relevant_chunks(
        db, "anything", provider=_RaisingEmbeddingProvider(), threshold=0.0
    )

    assert results == []


def test_retrieve_relevant_chunks_returns_empty_list_when_provider_returns_no_vectors(db) -> None:
    document = _seed_document(db)
    _seed_chunk(db, document, content="irrelevant", embedding=_unit_vector(0))

    results = retrieve_relevant_chunks(
        db, "anything", provider=_EmptyEmbeddingProvider(), threshold=0.0
    )

    assert results == []


# --------------------------------------------------------------------- #
# retrieve_relevant_chunks: threshold resolution and provider injection
# --------------------------------------------------------------------- #


def test_retrieve_relevant_chunks_reads_the_threshold_from_settings_store_when_not_given(
    db,
) -> None:
    query = _unit_vector(0)
    document = _seed_document(db)
    # Scores just above and just below the product default (0.62).
    above_default = _seed_chunk(
        db, document, content="above default", embedding=_vector_with_cosine_to(query, 0.7)
    )
    _seed_chunk(
        db, document, content="below default", embedding=_vector_with_cosine_to(query, 0.5)
    )

    results = retrieve_relevant_chunks(db, "a question", provider=_FakeEmbeddingProvider(query))

    assert DEFAULT_SIMILARITY_THRESHOLD == pytest.approx(0.62)
    assert [r.chunk.id for r in results] == [above_default.id]


def test_retrieve_relevant_chunks_picks_up_a_persisted_threshold_change_immediately(db) -> None:
    """Nothing here is cached between calls (module docstring): a threshold
    written a moment ago is what the very next call sees."""
    query = _unit_vector(0)
    document = _seed_document(db)
    chunk = _seed_chunk(
        db, document, content="mid score", embedding=_vector_with_cosine_to(query, 0.75)
    )

    set_similarity_threshold(db, 0.9)
    excluded = retrieve_relevant_chunks(db, "a question", provider=_FakeEmbeddingProvider(query))
    assert excluded == []

    set_similarity_threshold(db, 0.5)
    included = retrieve_relevant_chunks(db, "a question", provider=_FakeEmbeddingProvider(query))
    assert [r.chunk.id for r in included] == [chunk.id]

    # Leave the in-force threshold as this module found it, for any test
    # collected after it in the same process.
    set_similarity_threshold(db, DEFAULT_SIMILARITY_THRESHOLD)


def test_retrieve_relevant_chunks_never_calls_the_server_default_provider_when_one_is_injected(
    db, monkeypatch
) -> None:
    def _fail_if_called():
        raise AssertionError(
            "get_embedding_provider() must not be used when provider= is injected"
        )

    monkeypatch.setattr(retrieval_module, "get_embedding_provider", _fail_if_called)

    results = retrieve_relevant_chunks(
        db, "a question", provider=_FakeEmbeddingProvider(_unit_vector(0)), threshold=0.62
    )

    assert results == []


def test_retrieve_relevant_chunks_uses_the_default_provider_when_none_is_given(
    db, monkeypatch
) -> None:
    fake = _FakeEmbeddingProvider(_unit_vector(0))
    monkeypatch.setattr(retrieval_module, "get_embedding_provider", lambda: fake)
    document = _seed_document(db)
    chunk = _seed_chunk(db, document, content="matches", embedding=_unit_vector(0))

    results = retrieve_relevant_chunks(db, "a question", threshold=0.62)

    assert [r.chunk.id for r in results] == [chunk.id]
    assert fake.calls == [["a question"]]


# --------------------------------------------------------------------- #
# RetrievedChunk
# --------------------------------------------------------------------- #


def test_retrieved_chunk_carries_the_chunk_and_its_score(db) -> None:
    document = _seed_document(db)
    chunk = _seed_chunk(db, document, content="anything", embedding=_unit_vector(0))

    item = RetrievedChunk(chunk=chunk, score=0.99)

    assert item.chunk is chunk
    assert item.score == 0.99
