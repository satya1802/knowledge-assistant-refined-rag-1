"""Unit tests for `app/storage.py`: `store_object`, `load_object` and
`delete_object` -- the one seam every router/worker module is documented to
go through for an object's original bytes (module docstring), exercised
directly as functions, never through `client`/`TestClient` (that belongs in
`backend/tests/integration/`; see `backend/tests/test_documents_upload.py`
and `backend/tests/test_documents_download.py`, which already cover the
end-to-end upload/download contract these functions back).

This ticket carries no acceptance criteria of its own ("This ticket carries
no acceptance criteria"), so tests are named after the module's own
documented guarantees:

  * local-disk mode (`s3_status().enabled is False`, the only mode this
    sandbox's env can exercise without real AWS keys -- see the note below)
    round-trips bytes under `STORAGE_DIR`, creates nested-key parent
    directories, and treats delete-of-a-missing-key as a no-op rather than
    an error;
  * `store_object` returns the key unchanged, since callers persist that
    return value as `Document.s3_key`;
  * S3 mode is reached by whichever backend `s3_status()` reports enabled
    *at the point of use*, never cached from import time -- proven here by
    flipping the four AWS_* vars between two calls in the same process and
    watching `store_object`/`load_object`/`delete_object` switch target
    each time, with the boto3 S3 client itself replaced by a small
    in-process fake so no real AWS call is ever attempted.

Assumption: this sandbox's S3 service has no AWS_ACCESS_KEY_ID /
AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_BUCKET set (confirmed: none of the
four are present in the test environment), so `s3_status().enabled` is
False here exactly as it is in local development, and the existing
integration suite already exercises this module the same way (see the
`_local_storage` fixture in `test_documents_upload.py` and
`test_documents_download.py`, which explicitly deletes those four vars).
A unit test cannot reach real S3 from this sandbox either way, so the S3
branch is proven by substituting a fake boto3 client for the real one
boto3.client("s3", ...) would return, never by stubbing `store_object`/
`load_object`/`delete_object` themselves -- the code path under test still
runs in full, only the network edge is swapped out.
"""

from __future__ import annotations

import pytest

import app.storage as storage_module
from app.storage import delete_object, load_object, store_object


@pytest.fixture(autouse=True)
def _local_storage_env(tmp_path, monkeypatch):
    """Every test starts in local-disk mode, pointed at a throwaway
    directory, unless it explicitly opts into S3 mode below -- the same
    isolation `test_documents_upload.py` and `test_documents_download.py`
    already rely on, so a leftover object from one test can never leak
    into another's assertions."""
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path))
    return tmp_path


class _FakeS3Client:
    """Stands in for the object `boto3.client("s3", ...)` would return,
    with just enough behaviour to prove `store_object`/`load_object`/
    `delete_object` call it the way the module docstring describes, and
    nothing that reaches a network."""

    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}
        self.put_calls: list[dict] = []
        self.delete_calls: list[dict] = []

    def put_object(self, *, Bucket: str, Key: str, Body: bytes) -> None:
        self.put_calls.append({"Bucket": Bucket, "Key": Key, "Body": Body})
        self.objects[(Bucket, Key)] = Body

    def get_object(self, *, Bucket: str, Key: str) -> dict:
        body = self.objects[(Bucket, Key)]
        return {"Body": _FakeBody(body)}

    def delete_object(self, *, Bucket: str, Key: str) -> None:
        self.delete_calls.append({"Bucket": Bucket, "Key": Key})
        self.objects.pop((Bucket, Key), None)


class _FakeBody:
    def __init__(self, data: bytes):
        self._data = data

    def read(self) -> bytes:
        return self._data


@pytest.fixture
def _s3_mode(monkeypatch):
    """Switches the process into S3-enabled mode (all four AWS_* vars set
    to fake, non-credential values -- never real keys) and replaces
    `boto3.client` with one that returns a `_FakeS3Client`, so the S3
    branch of each function runs for real without ever reaching AWS."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "fake-access-key-id")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "fake-secret-access-key")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("S3_BUCKET", "fake-test-bucket")

    fake_client = _FakeS3Client()

    import boto3

    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: fake_client)
    return fake_client


# --------------------------------------------------------------------- #
# local-disk mode
# --------------------------------------------------------------------- #


def test_store_then_load_round_trips_the_exact_bytes_on_local_disk(_local_storage_env) -> None:
    original = b"the exact original bytes, byte for byte"

    store_object("documents/plain-key.txt", original)

    assert load_object("documents/plain-key.txt") == original


def test_store_object_returns_the_key_unchanged(_local_storage_env) -> None:
    key = "documents/some-id/report.pdf"

    returned = store_object(key, b"content")

    assert returned == key


def test_store_object_creates_nested_parent_directories_under_storage_dir(
    _local_storage_env,
) -> None:
    nested_key = "documents/abc123/subfolder/report.pdf"

    store_object(nested_key, b"nested content")

    stored_path = _local_storage_env / nested_key
    assert stored_path.is_file()
    assert stored_path.read_bytes() == b"nested content"


def test_delete_object_removes_a_file_that_was_actually_stored(_local_storage_env) -> None:
    store_object("documents/to-delete.txt", b"gone soon")
    stored_path = _local_storage_env / "documents/to-delete.txt"
    assert stored_path.is_file()

    delete_object("documents/to-delete.txt")

    assert not stored_path.exists()


def test_delete_object_on_a_missing_key_is_a_no_op_not_an_error(_local_storage_env) -> None:
    # Never written in the first place -- the documented "already absent"
    # case a document's delete endpoint must not fail on.
    delete_object("documents/never-written.txt")  # must not raise


def test_load_object_raises_when_nothing_was_ever_stored_at_that_key(
    _local_storage_env,
) -> None:
    with pytest.raises(FileNotFoundError):
        load_object("documents/nonexistent.txt")


def test_local_storage_dir_defaults_to_storage_data_when_storage_dir_unset(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("STORAGE_DIR", raising=False)
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"):
        monkeypatch.delenv(name, raising=False)

    store_object("default-dir-key.txt", b"default location")

    assert (tmp_path / "storage_data" / "default-dir-key.txt").read_bytes() == (
        b"default location"
    )


# --------------------------------------------------------------------- #
# S3 mode, with boto3.client replaced by a fake
# --------------------------------------------------------------------- #


def test_store_object_in_s3_mode_calls_put_object_with_the_configured_bucket_and_returns_the_key(
    _s3_mode,
) -> None:
    returned = store_object("documents/s3-key.txt", b"s3 bytes")

    assert returned == "documents/s3-key.txt"
    assert _s3_mode.put_calls == [
        {"Bucket": "fake-test-bucket", "Key": "documents/s3-key.txt", "Body": b"s3 bytes"}
    ]


def test_load_object_in_s3_mode_reads_back_what_was_put(_s3_mode) -> None:
    store_object("documents/s3-round-trip.txt", b"round trip bytes")

    assert load_object("documents/s3-round-trip.txt") == b"round trip bytes"


def test_delete_object_in_s3_mode_calls_delete_object_with_the_configured_bucket(
    _s3_mode,
) -> None:
    store_object("documents/s3-to-delete.txt", b"will be deleted")

    delete_object("documents/s3-to-delete.txt")

    assert _s3_mode.delete_calls == [
        {"Bucket": "fake-test-bucket", "Key": "documents/s3-to-delete.txt"}
    ]
    assert ("fake-test-bucket", "documents/s3-to-delete.txt") not in _s3_mode.objects


# --------------------------------------------------------------------- #
# the backend is read fresh at the point of use, never cached
# --------------------------------------------------------------------- #


def test_each_function_reads_s3_status_fresh_rather_than_caching_it_across_calls(
    _local_storage_env, monkeypatch
) -> None:
    """Starts in local-disk mode, stores a key there, then flips the
    process into S3 mode (with a fake client) and stores/loads/deletes the
    *same* key name -- proving every one of the three functions re-checks
    `s3_status()` on every call rather than deciding once and remembering,
    exactly as the module docstring ("at the point of use... never at
    import time") promises."""
    key = "documents/switching-backend.txt"
    store_object(key, b"local bytes")
    assert (_local_storage_env / key).read_bytes() == b"local bytes"

    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "fake-access-key-id")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "fake-secret-access-key")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("S3_BUCKET", "fake-test-bucket")

    fake_client = _FakeS3Client()
    import boto3

    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: fake_client)

    store_object(key, b"s3 bytes")

    # The local file from the first call is untouched; the S3 fake now
    # holds its own, distinct copy under the same key name.
    assert (_local_storage_env / key).read_bytes() == b"local bytes"
    assert load_object(key) == b"s3 bytes"

    delete_object(key)
    assert ("fake-test-bucket", key) not in fake_client.objects
    # Back to local-disk mode: the file that was never touched by any of
    # the S3-mode calls above is still exactly where it was left.
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"):
        monkeypatch.delenv(name, raising=False)
    assert (_local_storage_env / key).read_bytes() == b"local bytes"


def test_storage_module_never_imports_boto3_at_module_load_time() -> None:
    """The module docstring promises boto3 is only imported at the point
    of use, inside each function, so a missing `boto3` package or missing
    AWS keys never breaks startup in local-disk mode. `boto3` is listed in
    requirements.txt here, so this checks the *absence of a module-level
    name* rather than an ImportError, which would otherwise require
    uninstalling a real dependency to prove."""
    assert "boto3" not in vars(storage_module)
    with open(storage_module.__file__, encoding="utf-8") as handle:
        source = handle.read()
    top_level_lines = [
        line for line in source.splitlines() if not line.startswith((" ", "\t"))
    ]
    assert not any(line.strip().startswith("import boto3") for line in top_level_lines)
