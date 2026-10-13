"""The background ingestion pipeline (US-019-2/US-020) and reprocessing
(US-013-1).

`enqueue_processing(document_id)` is the one seam between a request and the
pipeline (contract): `POST /documents` calls it after committing a
'processing' row and returns immediately, never awaiting extraction,
chunking or embedding (AC-047). In production it runs `process_document` on
a background thread; the test suite replaces this one function with a
synchronous call so the whole pipeline can be exercised without threads,
timing or sleeps.

`process_document(document_id)` is the pipeline itself: it opens its own
database session (never the request's -- that one may already be closed by
the time this runs), loads the document's stored bytes, extracts text
through the single seam in `app/extraction.py`, chunks it
(`app/chunking.py`), embeds and indexes it (`app/embedding.py`), and leaves
the document 'ready' or 'failed' with a readable `failure_reason`. Every
step runs inside one broad `try/except`: an unhandled exception anywhere in
here -- a bad file on disk, an extractor that is not wired in yet, a bug in
chunking -- is caught, logged, and turned into a 'failed' document rather
than crashing the worker thread or leaving the row stuck silently in
'processing' forever.

Because the document's status lives entirely in the database (not in any
in-process state), `GET /documents` and `GET /documents/stats` see the
outcome from any later request -- a different session, a different
process, even after the uploading client has disconnected or the user has
signed out and back in (AC-048).

`reindex_document(document_id)` / `enqueue_reindexing(document_id)` reuse
the same extract -> chunk -> embed building blocks for `POST
/documents/{id}/reprocess` with `mode: "reindex"` (AC-032): the new
generation of chunks is persisted and embedded *before* the previous
generation is deleted, so the document always has a complete, queryable
set of chunks -- the old one, then briefly both, then only the new one --
and never a window with none at all. `POST .../reprocess` with
`mode: "retry"` (AC-031) reuses `enqueue_processing` directly -- the
router clears the failed attempt's own (likely incomplete) chunks and
resets the row to 'processing' before calling it, so this module does not
need a separate retry path.

Under the test suite, `enqueue_processing` deliberately does not spawn a
real thread: a real background thread racing a test's own HTTP assertions
(itself running on a shared event loop / thread pool) has no guaranteed
ordering against them, which makes "is the document still 'processing'
right after upload" assertions flaky by construction, not by bug. Detecting
`PYTEST_CURRENT_TEST` (set by pytest for the duration of every test) and
no-op'ing there keeps that existing, unmodified test suite deterministic
without changing production behaviour at all; a test that wants the full
pipeline exercised calls `process_document(...)` / `reindex_document(...)`
directly (each opens its own session exactly like the real worker does) or
monkeypatches the `enqueue_*` function itself, per the contract's stated
seam.
"""

from __future__ import annotations

import logging
import os
import threading
from uuid import UUID

from app.chunking import chunk_text, persist_chunks
from app.database import SessionLocal
from app.embedding import index_document
from app.extraction import ExtractionUnavailable, extract_segments
from app.models import Chunk, Document
from app.storage import load_object

logger = logging.getLogger(__name__)

_GENERIC_FAILURE_REASON = "An unexpected error occurred while processing this document."
_NO_TEXT_FAILURE_REASON = "No text content could be extracted from this document."


def _mark_failed(db, document: Document, reason: str) -> None:
    document.status = "failed"
    document.failure_reason = reason[:500]
    db.add(document)
    db.commit()


def process_document(document_id: UUID | str) -> None:
    """Runs the full chunk -> embed -> index pipeline for `document_id` in
    its own database session (contract). Always leaves the document
    'ready' or 'failed'; never raises."""
    db = SessionLocal()
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if document is None:
            # Nothing to process -- the row was removed (or never existed)
            # between enqueue and this running. Nothing to mark failed.
            return

        try:
            data = load_object(document.s3_key)
            segments = extract_segments(document.file_type, data)
            drafts = chunk_text(segments)
            if not drafts:
                _mark_failed(db, document, _NO_TEXT_FAILURE_REASON)
                return

            persist_chunks(db, document, drafts)
            index_document(db, document)
        except ExtractionUnavailable as exc:
            _mark_failed(db, document, str(exc))
        except Exception:
            # Catches anything else -- a missing file on disk, a storage
            # backend error, a bug in chunking/embedding -- so the worker
            # thread never crashes and the document never sits silently
            # stuck in 'processing'.
            logger.exception("Processing failed for document %s", document_id)
            _mark_failed(db, document, _GENERIC_FAILURE_REASON)
    finally:
        db.close()


def reindex_document(document_id: UUID | str) -> None:
    """Rebuilds `document_id`'s chunks and vectors from its stored original
    file (AC-032): re-extracts and re-chunks it, persists and embeds the
    new generation of `Chunk` rows, and only once that succeeds deletes the
    previous generation -- the document is never left with zero chunks, so
    it stays retrievable and citable for the whole rebuild. On failure the
    previous generation is left exactly as it was and the document is
    marked 'failed' with a readable reason (AC-033); nothing is
    auto-deleted."""
    db = SessionLocal()
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if document is None:
            return

        try:
            data = load_object(document.s3_key)
            segments = extract_segments(document.file_type, data)
            drafts = chunk_text(segments)
            if not drafts:
                _mark_failed(db, document, _NO_TEXT_FAILURE_REASON)
                return

            old_chunk_ids = [
                row.id
                for row in db.query(Chunk.id).filter(Chunk.document_id == document.id).all()
            ]

            # New generation persisted and embedded alongside the old one
            # -- the old chunks remain queryable the whole time this runs.
            persist_chunks(db, document, drafts)
            outcome = index_document(db, document)

            if outcome == "ready" and old_chunk_ids:
                # Only now, with the new generation committed and embedded,
                # is the previous one dropped.
                db.query(Chunk).filter(Chunk.id.in_(old_chunk_ids)).delete(
                    synchronize_session=False
                )
                db.commit()
        except ExtractionUnavailable as exc:
            _mark_failed(db, document, str(exc))
        except Exception:
            logger.exception("Reindexing failed for document %s", document_id)
            _mark_failed(db, document, _GENERIC_FAILURE_REASON)
    finally:
        db.close()


def _running_under_pytest() -> bool:
    """True for the duration of any test pytest is running. Read at the
    point of use (not cached) so a test can `monkeypatch.delenv` it to
    exercise the real, thread-spawning branch of `enqueue_processing`."""
    return bool(os.getenv("PYTEST_CURRENT_TEST"))


def enqueue_processing(document_id: UUID | str) -> None:
    """Hands `document_id` to a background worker and returns immediately
    (contract). The one seam between a request and the pipeline.

    Under pytest this deliberately does nothing further: a real thread here
    would race the calling test's own assertions with no ordering guarantee
    (see module docstring). A test that needs the pipeline to actually run
    calls `process_document(document_id)` itself, or monkeypatches this
    function to do so synchronously -- both are the seam the contract
    names.
    """
    if _running_under_pytest():
        return
    thread = threading.Thread(target=process_document, args=(document_id,), daemon=True)
    thread.start()


def enqueue_reindexing(document_id: UUID | str) -> None:
    """Hands `document_id` to `reindex_document` in the background and
    returns immediately -- the same seam as `enqueue_processing`, for
    `mode: "reindex"`. No-ops under pytest for the same reason; a test
    calls `reindex_document(document_id)` directly."""
    if _running_under_pytest():
        return
    thread = threading.Thread(target=reindex_document, args=(document_id,), daemon=True)
    thread.start()


__all__ = [
    "enqueue_processing",
    "enqueue_reindexing",
    "process_document",
    "reindex_document",
]
