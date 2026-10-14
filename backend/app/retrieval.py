"""Retrieval service (US-021-1): embed-then-search, the one seam every
answer must pass through.

`retrieve_relevant_chunks` is the single injectable function that embeds a
question (through `app/embedding.py`'s `EmbeddingProvider` interface -- no
second provider abstraction is introduced here) and runs a cosine-similarity
search over every chunk that has an indexed embedding, returning only the
ones scoring at or above the in-force similarity threshold
(`app/settings_store.py`, default 0.62) as the context an answer may cite
(AC-050). `app/routers/chat.py` calls this on every request before any
answer-generation call, and only this function: there is no second code
path into chunk search, so retrieval cannot be skipped (AC-049). Because it
takes no history and reads nothing cached between calls, a follow-up
question in an existing conversation runs a brand-new search of its own
question text; the previous turn's chunks are never carried forward or
reused (AC-156).

Cosine similarity is computed in Python, not through a pgvector operator,
so the exact same code runs against both the local SQLite database
(`app/database.py`'s default, which cannot run a pgvector distance query at
all) and PostgreSQL+pgvector in production -- only chunks that already have
a stored embedding are considered.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy.orm import Session as DBSession

from app.embedding import EmbeddingProvider, EmbeddingProviderError, get_embedding_provider
from app.models import Chunk
from app.settings_store import get_similarity_threshold

# A generous cap on how many chunks are ever handed to generation as context
# for one question; the threshold itself (not this) is what AC-050 governs.
DEFAULT_RESULT_LIMIT = 5


@dataclass(frozen=True)
class RetrievedChunk:
    """One chunk that scored at or above the in-force threshold for a given
    question, plus the score it scored."""

    chunk: Chunk
    score: float


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def retrieve_relevant_chunks(
    db: DBSession,
    question: str,
    *,
    provider: EmbeddingProvider | None = None,
    threshold: float | None = None,
    limit: int = DEFAULT_RESULT_LIMIT,
) -> list[RetrievedChunk]:
    """Embeds `question` and searches every indexed chunk, returning the
    ones scoring >= the in-force threshold, highest score first, capped at
    `limit` (contract: "every POST /chat request embeds the query and runs
    cosine-similarity search ... before any answer-generation call").

    `provider` is injectable so generation and tests can supply a mock
    `EmbeddingProvider` instead of the server-configured default from
    `get_embedding_provider()` -- the real adapter is never exercised by a
    test through this seam. `threshold` is injectable for the same reason;
    left as `None` (the normal call path) it is always read fresh from
    `app/settings_store.py` at the point of use, never hard-coded here or in
    the chat router.

    Never raises up to the caller: a disabled/misconfigured embedding
    provider, or a database with no embedded chunks yet, simply yields an
    empty result (no document context), so `POST /chat` can still answer
    from general knowledge rather than failing the whole request.
    """
    provider = provider or get_embedding_provider()
    in_force_threshold = get_similarity_threshold(db) if threshold is None else threshold

    try:
        vectors = provider.embed([question])
    except EmbeddingProviderError:
        return []

    if not vectors:
        return []
    query_vector = vectors[0]

    chunks = db.query(Chunk).filter(Chunk.embedding.isnot(None)).all()

    scored: list[RetrievedChunk] = []
    for chunk in chunks:
        score = _cosine_similarity(query_vector, list(chunk.embedding))
        if score >= in_force_threshold:
            scored.append(RetrievedChunk(chunk=chunk, score=score))

    scored.sort(key=lambda item: item.score, reverse=True)
    return scored[:limit]


__all__ = ["DEFAULT_RESULT_LIMIT", "RetrievedChunk", "retrieve_relevant_chunks"]
