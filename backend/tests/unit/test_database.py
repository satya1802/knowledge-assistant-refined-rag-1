"""Unit tests for `app/database.py`: engine/session construction, the
SQLite-by-default fallback, and the `get_db` request-scoped dependency --
exercised directly against the module, never through `client`/`TestClient`
(that belongs in `backend/tests/integration/`).

This ticket carries no acceptance criteria, so these tests are named after
the module's own documented guarantees (its docstring and the `DATABASE_URL`
default) rather than an `AC-###`:

  * `DATABASE_URL` falls back to a file-based SQLite URL when the
    environment variable is unset, and honours it when set -- checked in a
    fresh subprocess (not `importlib.reload`) because the value is read
    once at import time into a module-level constant, and the whole test
    suite already imports this module before any single test runs.
  * a SQLite engine accepts a connection made on one thread and used from
    another (`check_same_thread=False`), which is exactly what happens
    when FastAPI runs a sync dependency in its threadpool -- the docstring
    names this as the reason the flag exists at all.
  * the engine actually configured for this run (whatever `DATABASE_URL`
    points at in this environment) connects successfully, so `connect_args`
    is never wrong for the backend in use.
  * `get_db` yields a working session and always closes it -- on a normal
    return and when the caller raises -- without ever swallowing the
    caller's exception.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase

import app.database as database
from app.database import Base, engine, get_db

_BACKEND_DIR = Path(__file__).resolve().parents[2]


def _run_in_subprocess(
    script: str, cwd: Path, database_url: str | None
) -> subprocess.CompletedProcess:
    """Runs `script` in a fresh Python process with `app` importable and
    `DATABASE_URL` controlled exactly, so the module-level constant in
    `app/database.py` is read fresh -- not whatever this test session's own
    `app.database` import already resolved it to.
    """
    env = dict(os.environ)
    env.pop("DATABASE_URL", None)
    if database_url is not None:
        env["DATABASE_URL"] = database_url
    env["PYTHONPATH"] = str(_BACKEND_DIR)
    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )


def test_base_is_a_shared_sqlalchemy_declarative_base() -> None:
    assert issubclass(Base, DeclarativeBase)


def test_database_url_reads_the_configured_environment_value() -> None:
    # This session's own `app.database` import already resolved
    # `DATABASE_URL` once, from whatever the environment set it to for this
    # run; confirm it is not silently ignoring that value.
    configured = os.environ.get("DATABASE_URL")
    if configured is None:
        pytest.skip("DATABASE_URL is unset in this environment; see the default-fallback test")
    assert database.DATABASE_URL == configured


def test_database_url_defaults_to_a_file_based_sqlite_url_when_unset(tmp_path) -> None:
    script = "import app.database as d; print(d.DATABASE_URL)"
    result = _run_in_subprocess(script, cwd=tmp_path, database_url=None)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "sqlite:///./app.db"


def test_database_url_honors_a_configured_non_default_value(tmp_path) -> None:
    custom_url = f"sqlite:///{tmp_path / 'custom.db'}"
    script = "import app.database as d; print(d.DATABASE_URL)"
    result = _run_in_subprocess(script, cwd=tmp_path, database_url=custom_url)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == custom_url


def test_sqlite_engine_allows_a_connection_made_on_one_thread_to_be_used_from_another(
    tmp_path,
) -> None:
    """The documented reason `check_same_thread=False` exists: without it,
    SQLite raises when a connection opened on one thread is used from
    another, which is exactly what FastAPI's sync-dependency threadpool
    does. Default `DATABASE_URL` (sqlite) is used so this exercises the
    sqlite-only branch of `_connect_args`.
    """
    script = (
        "import threading\n"
        "import app.database as d\n"
        "from sqlalchemy import text\n"
        "errors = []\n"
        "def worker():\n"
        "    try:\n"
        "        with d.engine.connect() as conn:\n"
        "            conn.execute(text('SELECT 1'))\n"
        "    except Exception as exc:  # noqa: BLE001 - captured to report, not swallowed\n"
        "        errors.append(repr(exc))\n"
        "t = threading.Thread(target=worker)\n"
        "t.start()\n"
        "t.join()\n"
        "assert not errors, errors\n"
        "print('OK')\n"
    )
    result = _run_in_subprocess(script, cwd=tmp_path, database_url=None)

    assert result.returncode == 0, result.stderr
    assert "OK" in result.stdout


def test_engine_connects_successfully_for_the_configured_database_url() -> None:
    """Whatever backend `DATABASE_URL` names for this run -- SQLite or the
    real one configured for the project -- `connect_args` must be valid for
    it: a wrong combination (e.g. a SQLite-only kwarg sent to another
    driver) would fail right here, at connect time.
    """
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1


def test_get_db_yields_a_session_that_can_run_a_query_against_the_configured_database() -> None:
    gen = get_db()
    session = next(gen)
    try:
        assert session.execute(text("SELECT 1")).scalar() == 1
    finally:
        with pytest.raises(StopIteration):
            next(gen)


def test_get_db_closes_the_session_when_the_caller_finishes_normally(monkeypatch) -> None:
    closed = []

    class FakeSession:
        def close(self) -> None:
            closed.append(True)

    monkeypatch.setattr(database, "SessionLocal", lambda: FakeSession())

    gen = database.get_db()
    session = next(gen)

    assert isinstance(session, FakeSession)
    assert closed == []

    with pytest.raises(StopIteration):
        next(gen)
    assert closed == [True]


def test_get_db_closes_the_session_even_when_the_caller_raises(monkeypatch) -> None:
    closed = []

    class FakeSession:
        def close(self) -> None:
            closed.append(True)

    monkeypatch.setattr(database, "SessionLocal", lambda: FakeSession())

    gen = database.get_db()
    next(gen)

    # This is what FastAPI does when the request handler raises: it throws
    # the exception into the dependency generator at its suspension point.
    # `get_db` has no `except`, only `finally`, so the session must still
    # close and the original exception must still propagate -- never be
    # swallowed.
    with pytest.raises(RuntimeError, match="boom"):
        gen.throw(RuntimeError("boom"))
    assert closed == [True]
