"""The embedding + indexing service (US-019-1).

`EmbeddingProvider` is the one interface every embedding adapter implements
(AC-155): `embed(texts: list[str]) -> list[list[float]]`. Which adapter
`get_embedding_provider()` constructs is chosen server-side, in
`app/settings.py`, through `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` /
`EMBEDDING_DIM` -- swapping providers is then an env-var change, never a
code change here or in `index_document`. Today only `"none"` is wired up:
which real provider this deployment should use is an open decision (Gemini
removed from the approved stack, Groq has no embedding model) recorded in
`docs/decisions/0001-embedding-provider.md`, awaiting sign-off. Until it is
signed off, the configured provider reports itself disabled with a clear
message -- following the same point-of-use pattern `app/config.py` uses for
every other unset key -- rather than raising at import time or silently
calling nothing.

`index_document()` is the other half of the contract: given a `Document`
whose `Chunk` rows already exist (US-018-1's `chunking.persist_chunks`; this
module never re-chunks anything), it embeds their content in batches of at
most 100 chunks per provider call (AC-044), validates every returned vector
is exactly `settings.embedding_dim` dimensions wide -- a hard error, never
silently stored -- writes the accepted vectors to `Chunk.embedding`, and
moves the `Document` to 'ready' (failure_reason cleared, AC-045) or
'failed' (a short, human-readable failure_reason, AC-046). A transient
provider error or rate-limit response is retried a bounded number of times
with exponential backoff before that final failure; the bounds
(`EMBEDDING_MAX_RETRIES`, `EMBEDDING_BACKOFF_BASE_SECONDS`) are read at the
point of use, same pattern as `app/chunking.py`, so an operator can tune
them without a code change. Failure never deletes the `Document` row or its
chunks -- only `status`/`failure_reason` change.

No provider key is ever logged or returned from here: this module never
reads a provider's API key itself (an adapter that needs one would read it
through `app/config.py`'s point-of-use pattern), and no exception message
built here ever includes one.
"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID

from sqlalchemy.orm import Session as DBSession

from app.models import Chunk, Document
from app.settings import settings

logger = logging.getLogger(__name__)

# AC-044: a provider call never carries more than this many chunks.
EMBED_BATCH_SIZE = 100

DocumentStatus = Literal["processing", "ready", "failed"]


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def max_retries() -> int:
    """Bounded retry count for a transient provider failure (AC-046).
    Defaults to 3 total attempts; set `EMBEDDING_MAX_RETRIES` to change it."""
    return _int_env("EMBEDDING_MAX_RETRIES", 3)


def backoff_base_seconds() -> float:
    """Base delay for the exponential backoff between retries: attempt `n`
    (0-indexed) waits `base * 2**n` seconds. Defaults to 1.0 second; set
    `EMBEDDING_BACKOFF_BASE_SECONDS` to change it."""
    return _float_env("EMBEDDING_BACKOFF_BASE_SECONDS", 1.0)


class EmbeddingProviderError(Exception):
    """A provider call failed in a transient or rate-limited way. Retried
    up to `max_retries()` times before being treated as a final failure."""


class EmbeddingDimensionError(Exception):
    """A provider returned a response that was not exactly
    `settings.embedding_dim` floats per vector (or not one vector per input
    text). Never retried and never silently stored (AC-044)."""


class EmbeddingProvider(Protocol):
    """The one interface every embedding adapter implements (AC-155/
    contract). `embed` takes `len(texts)` strings and must return exactly
    `len(texts)` vectors, in the same order, or raise."""

    def embed(self, texts: list[str]) -> list[list[float]]: ...


@dataclass(frozen=True)
class _DisabledProvider:
    """Reports itself disabled with a clear message instead of calling
    anything, following `app/config.py`'s point-of-use pattern. Constructing
    one does no I/O and makes no network call -- safe to build at any time,
    never only at import time."""

    message: str

    def embed(self, texts: list[str]) -> list[list[float]]:
        raise EmbeddingProviderError(self.message)


def get_embedding_provider() -> EmbeddingProvider:
    """The `EmbeddingProvider` `settings.embedding_provider` selects. Never
    called at import time (only when `index_document` actually needs one),
    and never makes a network call itself -- it just builds an adapter.

    Only `"none"` exists today: which real provider to wire in is the open
    decision recorded in `docs/decisions/0001-embedding-provider.md`. An
    unrecognized value is treated the same as `"none"` -- disabled, with a
    message naming what was asked for -- rather than raising at startup.
    """
    name = settings.embedding_provider
    if name == "none":
        return _DisabledProvider(
            message=(
                "Embedding provider is disabled: no provider is selected yet "
                "(see backend/docs/decisions/0001-embedding-provider.md); set "
                "EMBEDDING_PROVIDER once one is signed off."
            )
        )
    return _DisabledProvider(
        message=(
            f"Embedding provider '{name}' is not supported: set EMBEDDING_PROVIDER "
            "to 'none' until a provider is selected "
            "(see backend/docs/decisions/0001-embedding-provider.md)."
        )
    )


def _batches(items: Sequence[Chunk], size: int) -> Iterator[Sequence[Chunk]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _validate_vectors(
    vectors: Iterable[list[float]], expected_count: int, expected_dim: int
) -> list[list[float]]:
    vectors = list(vectors)
    if len(vectors) != expected_count:
        raise EmbeddingDimensionError(
            f"Expected {expected_count} embedding vectors, got {len(vectors)}."
        )
    for vector in vectors:
        if len(vector) != expected_dim:
            raise EmbeddingDimensionError(
                f"Expected {expected_dim}-dimension vectors, got {len(vector)}."
            )
    return vectors


def _embed_batch_with_retry(provider: EmbeddingProvider, texts: list[str]) -> list[list[float]]:
    """Calls `provider.embed(texts)`, retrying a transient
    `EmbeddingProviderError` up to `max_retries()` total attempts with
    exponential backoff (AC-046). The last error is re-raised once attempts
    are exhausted."""
    attempts = max_retries()
    base = backoff_base_seconds()
    last_error: EmbeddingProviderError | None = None

    for attempt in range(attempts):
        try:
            return provider.embed(texts)
        except EmbeddingProviderError as exc:
            last_error = exc
            if attempt < attempts - 1:
                time.sleep(base * (2**attempt))

    assert last_error is not None  # attempts is always >= 1
    raise last_error


def _fail(db: DBSession, document: Document, reason: str) -> DocumentStatus:
    """Moves `document` to 'failed' with a short, human-readable
    `failure_reason`. Never deletes the document row or its chunks
    (AC-046)."""
    document.status = "failed"
    document.failure_reason = reason[:500]
    db.add(document)
    db.commit()
    return "failed"


def index_document(
    db: DBSession,
    document: Document,
    provider: EmbeddingProvider | None = None,
) -> DocumentStatus:
    """Embeds every `Chunk` already persisted for `document` and moves it to
    'ready' or 'failed' (contract). `provider` is injectable so a caller
    (or a test) can supply a mock instead of the server-configured default
    from `get_embedding_provider()` -- the real adapter is never exercised
    here or at import time.
    """
    provider = provider or get_embedding_provider()
    dim = settings.embedding_dim

    chunks: list[Chunk] = (
        db.query(Chunk).filter(Chunk.document_id == document.id).order_by(Chunk.chunk_index).all()
    )
    if not chunks:
        return _fail(db, document, "No chunks were found to embed.")

    vectors_by_chunk_id: dict[UUID, list[float]] = {}
    for batch in _batches(chunks, EMBED_BATCH_SIZE):
        texts = [chunk.content for chunk in batch]
        try:
            vectors = _embed_batch_with_retry(provider, texts)
            vectors = _validate_vectors(vectors, expected_count=len(texts), expected_dim=dim)
        except EmbeddingDimensionError as exc:
            return _fail(db, document, f"Embedding response was invalid: {exc}")
        except EmbeddingProviderError as exc:
            return _fail(db, document, f"Embedding provider error: {exc}")

        for chunk, vector in zip(batch, vectors, strict=True):
            vectors_by_chunk_id[chunk.id] = vector

    for chunk in chunks:
        chunk.embedding = vectors_by_chunk_id[chunk.id]
        db.add(chunk)

    document.status = "ready"
    document.failure_reason = None
    db.add(document)
    db.commit()
    return "ready"


__all__ = [
    "EMBED_BATCH_SIZE",
    "DocumentStatus",
    "EmbeddingDimensionError",
    "EmbeddingProvider",
    "EmbeddingProviderError",
    "backoff_base_seconds",
    "get_embedding_provider",
    "index_document",
    "max_retries",
]
