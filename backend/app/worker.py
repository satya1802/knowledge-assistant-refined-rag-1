"""The background ingestion pipeline (US-019-2/US-020).

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
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from uuid import UUID

from app.chunking import chunk_text, persist_chunks
from app.config import s3_status
from app.database import SessionLocal
from app.embedding import index_document
from app.extraction import ExtractionUnavailable, extract_segments
from app.models import Document

logger = logging.getLogger(__name__)

_GENERIC_FAILURE_REASON = "An unexpected error occurred while processing this document."
_NO_TEXT_FAILURE_REASON = "No text content could be extracted from this document."


def _load_local(key: str) -> bytes:
    path = Path(os.getenv("STORAGE_DIR", "./storage_data")) / key
    return path.read_bytes()


def _load_object(key: str) -> bytes:
    """Reads back the original bytes `app/storage.py` wrote for `key`: from
    S3 when object storage is configured, else from the same local disk
    directory `store_object` used."""
    status = s3_status()
    if not status.enabled:
        return _load_local(key)

    import boto3  # imported here, not at module load, per app/config.py's rule

    client = boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )
    response = client.get_object(Bucket=os.environ["S3_BUCKET"], Key=key)
    return response["Body"].read()


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
            data = _load_object(document.s3_key)
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


def enqueue_processing(document_id: UUID | str) -> None:
    """Hands `document_id` to a background worker and returns immediately
    (contract). The one seam between a request and the pipeline: the test
    suite monkeypatches this to call `process_document` synchronously
    instead of starting a thread."""
    thread = threading.Thread(target=process_document, args=(document_id,), daemon=True)
    thread.start()


__all__ = ["enqueue_processing", "process_document"]
