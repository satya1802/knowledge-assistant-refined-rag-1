"""Unit tests for `app/worker.py`: `process_document`, `reindex_document`,
`enqueue_processing`/`enqueue_reindexing` and the pytest-detection seam
`_running_under_pytest` -- exercised directly as functions against a real
(SQLite) database session, never through `client`/`TestClient` (that
belongs in `backend/tests/integration/`; see
`backend/tests/test_documents_reprocess.py`, which already covers the
end-to-end `POST /documents/{id}/reprocess` contract these functions back,
and `backend/tests/test_documents_upload.py`, which covers `POST
/documents` calling `enqueue_processing`).

This ticket carries no acceptance criteria of its own ("This ticket carries
no acceptance criteria"), so tests are named after the module's own
documented guarantees (module docstring) rather than an `AC-###`:

  * `process_document` always leaves a document 'ready' or 'failed', never
    raises, and never touches a document that no longer exists;
  * a document with no extractable text, an unsupported file type
    (`ExtractionUnavailable`), an embedding-provider failure, or any other
    unexpected error (a missing stored file) each produce a readable,
    truncated `failure_reason` and a 'failed' status -- never a crash and
    never a silently stuck 'processing' row;
  * `reindex_document` persists and embeds the new generation of chunks
    *before* deleting the previous one, so the document is never left with
    zero chunks mid-rebuild, and on any failure the previous generation is
    left exactly as it was -- nothing is ever auto-deleted on failure;
  * `enqueue_processing`/`enqueue_reindexing` no-op under pytest (the
    documented seam) and, when `PYTEST_CURRENT_TEST` is absent, hand the
    right target function and document id off to a genuine background
    thread.

A fake `EmbeddingProvider` stands in for the real one throughout -- never a
real provider call -- the same technique `test_documents_reprocess.py` and
`test_retrieval.py` use. `STORAGE_DIR` is redirected to a pytest tmp
directory so nothing here touches real AWS.
"""

from __future__ import annotations

import uuid

import pytest

import app.worker as worker_module
from app.database import Base, SessionLocal, engine
from app.embedding import EmbeddingProviderError
from app.embedding import index_document as _real_index_document
from app.extraction import ExtractionUnavailable
from app.models import Chunk, Document, User
from app.security import hash_password
from app.storage import store_object
from app.worker import (
    _running_under_pytest,
    enqueue_processing,
    enqueue_reindexing,
    process_document,
    reindex_document,
)

_PASSWORD = "WorkerUnitTestPass123!"


class _FakeEmbeddingProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 768 for _ in texts]


class _AlwaysFailingProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise EmbeddingProviderError("simulated persistent provider outage")


@pytest.fixture(autouse=True)
def _fast_retries(monkeypatch):
    import app.embedding as embedding_module

    monkeypatch.setattr(embedding_module.time, "sleep", lambda _s: None)
    monkeypatch.setenv("EMBEDDING_MAX_RETRIES", "1")


@pytest.fixture(autouse=True)
def _local_storage(tmp_path, monkeypatch):
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        # Mirrors tests/unit/test_retrieval.py: this module seeds
        # Document/Chunk/User rows directly against the ORM against a
        # file-backed sqlite database shared across the whole suite (see
        # tests/conftest.py) -- leaving any behind would leak into another
        # module's exact-row-set assertions.
        session.query(Chunk).delete()
        session.query(Document).delete()
        session.query(User).filter(User.email.like("worker-unit-%")).delete(
            synchronize_session=False
        )
        session.commit()
        session.close()


def _seed_user(db) -> User:
    user = User(
        email=f"worker-unit-{uuid.uuid4().hex[:10]}@example.com",
        password_hash=hash_password(_PASSWORD),
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_document(
    db,
    *,
    file_type: str = "txt",
    content: bytes = b"some real body text long enough to chunk and embed",
    store: bool = True,
) -> Document:
    """Creates a `Document` row (status 'processing'). When `store` is
    True (the default) its bytes are actually written under `s3_key` via
    the same `app/storage.py` seam the real upload path uses; when False
    the row points at a key that was never written, so `load_object`
    raises `FileNotFoundError` -- the "missing stored file" failure mode
    this module must turn into a 'failed' document rather than a crash."""
    key = f"documents/worker-unit/{uuid.uuid4().hex}.{file_type}"
    if store:
        store_object(key, content)
    document = Document(
        filename=f"worker-unit-{uuid.uuid4().hex[:8]}.{file_type}",
        file_type=file_type,
        size_bytes=len(content),
        s3_key=key,
        status="processing",
        uploaded_by=_seed_user(db).id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def _document_row(document_id) -> Document | None:
    with SessionLocal() as session:
        return session.query(Document).filter(Document.id == document_id).first()


def _chunk_ids(document_id) -> set:
    with SessionLocal() as session:
        return {
            row.id for row in session.query(Chunk.id).filter(Chunk.document_id == document_id).all()
        }


def _patch_index_document(monkeypatch, provider) -> None:
    def _patched(db_arg, document_arg, provider_arg=None):
        return _real_index_document(db_arg, document_arg, provider=provider_arg or provider)

    monkeypatch.setattr(worker_module, "index_document", _patched)


# --------------------------------------------------------------------- #
# process_document: success
# --------------------------------------------------------------------- #


def test_process_document_marks_a_good_document_ready_with_chunks_and_no_failure_reason(
    db, monkeypatch
) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    document = _seed_document(db)

    process_document(document.id)

    reloaded = _document_row(document.id)
    assert reloaded.status == "ready"
    assert reloaded.failure_reason is None
    assert _chunk_ids(document.id)  # at least one chunk was persisted and embedded


# --------------------------------------------------------------------- #
# process_document: each documented failure mode
# --------------------------------------------------------------------- #


def test_process_document_fails_with_the_no_text_reason_when_nothing_can_be_extracted(
    db, monkeypatch
) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    # Empty bytes decode to an empty string, which chunk_text turns into no
    # drafts at all -- the documented "no text content" failure mode.
    document = _seed_document(db, content=b"")

    process_document(document.id)

    reloaded = _document_row(document.id)
    assert reloaded.status == "failed"
    assert reloaded.failure_reason == "No text content could be extracted from this document."
    assert _chunk_ids(document.id) == set()


def test_process_document_fails_with_the_extractor_message_for_an_unsupported_file_type(
    db, monkeypatch
) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    document = _seed_document(db, file_type="pdf", content=b"%PDF-1.4 irrelevant bytes")

    process_document(document.id)

    reloaded = _document_row(document.id)
    assert reloaded.status == "failed"
    assert reloaded.failure_reason == "Text extraction for 'pdf' files is not available yet."
    assert _chunk_ids(document.id) == set()


def test_process_document_fails_rather_than_crashes_when_the_stored_file_is_missing(
    db, monkeypatch
) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    document = _seed_document(db, store=False)  # s3_key points at nothing on disk

    process_document(document.id)  # must not raise

    reloaded = _document_row(document.id)
    assert reloaded.status == "failed"
    assert reloaded.failure_reason == "An unexpected error occurred while processing this document."


def test_process_document_fails_when_the_embedding_provider_keeps_erroring(db, monkeypatch) -> None:
    _patch_index_document(monkeypatch, _AlwaysFailingProvider())
    document = _seed_document(db)

    process_document(document.id)

    reloaded = _document_row(document.id)
    assert reloaded.status == "failed"
    assert "simulated persistent provider outage" in reloaded.failure_reason
    # Chunks were persisted before the (failing) embedding step ran; a
    # provider failure never deletes them, only marks the document failed.
    assert _chunk_ids(document.id)


def test_process_document_on_an_id_that_no_longer_exists_is_a_silent_no_op(db) -> None:
    process_document(uuid.uuid4())  # must not raise


def test_process_document_truncates_an_overlong_failure_reason_to_500_characters(
    db, monkeypatch
) -> None:
    long_message = "x" * 600

    def _raise(*_args, **_kwargs):
        raise ExtractionUnavailable(long_message)

    monkeypatch.setattr(worker_module, "extract_segments", _raise)
    document = _seed_document(db)

    process_document(document.id)

    reloaded = _document_row(document.id)
    assert reloaded.status == "failed"
    assert len(reloaded.failure_reason) == 500
    assert reloaded.failure_reason == long_message[:500]


# --------------------------------------------------------------------- #
# reindex_document: success, with the old generation queryable until the
# new one is actually embedded
# --------------------------------------------------------------------- #


def test_reindex_document_keeps_the_previous_generation_queryable_until_the_new_one_is_indexed(
    db, monkeypatch
) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    document = _seed_document(db, content=b"the original body text for a reindex test case")
    process_document(document.id)
    assert _document_row(document.id).status == "ready"
    original_ids = _chunk_ids(document.id)
    assert original_ids

    observed: dict[str, set] = {}

    def _spy_index(db_arg, document_arg, provider_arg=None):
        # By the time index_document runs, reindex_document has already
        # persisted the new generation's chunks (committed) but has not
        # yet deleted the old one -- both generations are queryable right
        # now, proving the documented "never a window with none at all".
        observed["mid_flight_ids"] = _chunk_ids(document_arg.id)
        return _real_index_document(db_arg, document_arg, provider=_FakeEmbeddingProvider())

    monkeypatch.setattr(worker_module, "index_document", _spy_index)

    reindex_document(document.id)

    assert original_ids.issubset(observed["mid_flight_ids"])
    assert len(observed["mid_flight_ids"]) > len(original_ids)  # the new generation too

    reloaded = _document_row(document.id)
    assert reloaded.status == "ready"
    final_ids = _chunk_ids(document.id)
    assert final_ids  # never left with zero chunks
    assert final_ids.isdisjoint(original_ids)  # the old generation is gone, now that it succeeded


# --------------------------------------------------------------------- #
# reindex_document: each documented failure mode leaves the previous
# generation exactly as it was -- nothing auto-deleted
# --------------------------------------------------------------------- #


def test_reindex_document_on_no_extractable_text_leaves_the_previous_generation_untouched(
    db, monkeypatch
) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    document = _seed_document(db, content=b"the original body text that must survive")
    process_document(document.id)
    original_ids = _chunk_ids(document.id)
    assert original_ids

    # Force the "no drafts" branch on the reindex attempt itself by
    # swapping in an extractor that returns an empty segment.
    monkeypatch.setattr(worker_module, "extract_segments", lambda *_a, **_k: [])

    reindex_document(document.id)

    reloaded = _document_row(document.id)
    assert reloaded.status == "failed"
    assert reloaded.failure_reason == "No text content could be extracted from this document."
    assert _chunk_ids(document.id) == original_ids  # exactly as it was -- nothing deleted or added


def test_reindex_document_on_an_unsupported_file_type_leaves_the_previous_generation_untouched(
    db, monkeypatch
) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    document = _seed_document(db, content=b"the original body text that must survive again")
    process_document(document.id)
    original_ids = _chunk_ids(document.id)
    assert original_ids

    # Simulate the file type having become unsupported by the time a
    # reindex is attempted (extract_segments raises ExtractionUnavailable
    # for anything other than txt/md).
    with SessionLocal() as session:
        row = session.query(Document).filter(Document.id == document.id).one()
        row.file_type = "pdf"
        session.add(row)
        session.commit()

    reindex_document(document.id)

    reloaded = _document_row(document.id)
    assert reloaded.status == "failed"
    assert reloaded.failure_reason == "Text extraction for 'pdf' files is not available yet."
    assert _chunk_ids(document.id) == original_ids


def test_reindex_document_on_embedding_failure_leaves_the_previous_generation_untouched(
    db, monkeypatch
) -> None:
    _patch_index_document(monkeypatch, _FakeEmbeddingProvider())
    document = _seed_document(db, content=b"the original body text, embedding will fail next")
    process_document(document.id)
    assert _document_row(document.id).status == "ready"
    original_ids = _chunk_ids(document.id)
    assert original_ids

    _patch_index_document(monkeypatch, _AlwaysFailingProvider())

    reindex_document(document.id)

    reloaded = _document_row(document.id)
    assert reloaded.status == "failed"
    assert "simulated persistent provider outage" in reloaded.failure_reason
    # Nothing is ever auto-deleted on failure: the previous generation is
    # still exactly there (the failed new generation's chunks sit alongside
    # it, never silently dropped either).
    assert original_ids.issubset(_chunk_ids(document.id))


def test_reindex_document_on_an_id_that_no_longer_exists_is_a_silent_no_op(db) -> None:
    reindex_document(uuid.uuid4())  # must not raise


# --------------------------------------------------------------------- #
# enqueue_processing / enqueue_reindexing: the documented pytest seam
# --------------------------------------------------------------------- #


def test_enqueue_processing_no_ops_under_pytest_without_spawning_a_thread_or_running_anything(
    monkeypatch,
) -> None:
    def _fail_if_run(_document_id):
        raise AssertionError("process_document must not run under pytest's no-op seam")

    def _fail_if_spawned(*_args, **_kwargs):
        raise AssertionError("no thread may be spawned under pytest's no-op seam")

    monkeypatch.setattr(worker_module, "process_document", _fail_if_run)
    monkeypatch.setattr(worker_module.threading, "Thread", _fail_if_spawned)

    enqueue_processing(uuid.uuid4())  # must not raise


def test_enqueue_reindexing_no_ops_under_pytest_without_spawning_a_thread_or_running_anything(
    monkeypatch,
) -> None:
    def _fail_if_run(_document_id):
        raise AssertionError("reindex_document must not run under pytest's no-op seam")

    def _fail_if_spawned(*_args, **_kwargs):
        raise AssertionError("no thread may be spawned under pytest's no-op seam")

    monkeypatch.setattr(worker_module, "reindex_document", _fail_if_run)
    monkeypatch.setattr(worker_module.threading, "Thread", _fail_if_spawned)

    enqueue_reindexing(uuid.uuid4())  # must not raise


class _FakeThread:
    """Stands in for `threading.Thread`: records what it was asked to run
    instead of actually running it in a background thread, so the test can
    assert on the target/args without any real concurrency."""

    def __init__(self, *, target=None, args=(), daemon=None):
        self.target = target
        self.args = args
        self.daemon = daemon
        self.started = False

    def start(self) -> None:
        self.started = True


def test_enqueue_processing_spawns_a_daemon_thread_running_process_document_outside_pytest(
    monkeypatch,
) -> None:
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    captured: dict[str, _FakeThread] = {}

    def _capturing_thread(**kwargs) -> _FakeThread:
        thread = _FakeThread(**kwargs)
        captured["thread"] = thread
        return thread

    monkeypatch.setattr(worker_module.threading, "Thread", _capturing_thread)
    document_id = uuid.uuid4()

    enqueue_processing(document_id)

    thread = captured["thread"]
    assert thread.target is worker_module.process_document
    assert thread.args == (document_id,)
    assert thread.daemon is True
    assert thread.started is True


def test_enqueue_reindexing_spawns_a_daemon_thread_running_reindex_document_outside_pytest(
    monkeypatch,
) -> None:
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    captured: dict[str, _FakeThread] = {}

    def _capturing_thread(**kwargs) -> _FakeThread:
        thread = _FakeThread(**kwargs)
        captured["thread"] = thread
        return thread

    monkeypatch.setattr(worker_module.threading, "Thread", _capturing_thread)
    document_id = uuid.uuid4()

    enqueue_reindexing(document_id)

    thread = captured["thread"]
    assert thread.target is worker_module.reindex_document
    assert thread.args == (document_id,)
    assert thread.daemon is True
    assert thread.started is True


def test_running_under_pytest_reflects_the_env_var_read_fresh_each_call(monkeypatch) -> None:
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "some::test (call)")
    assert _running_under_pytest() is True

    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    assert _running_under_pytest() is False
