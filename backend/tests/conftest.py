"""Test-only schema setup.

Application startup (`app/main.py`) never creates or alters the schema --
`alembic upgrade head` is the only path (AC-094, see `app/main.py`'s
docstring and `tests/test_migrations.py`). These tests still need tables to
exist in the throwaway local database they run against, so this fixture
creates them directly from the models once per test session. It is never
called by the application itself.

`DATABASE_URL` defaults (see `app/database.py`) to a file-based SQLite
database rather than an in-memory one, so its rows outlive a single `pytest`
process. Several tests assert exact row sets or a strict ordering (e.g.
`tests/test_documents.py`, `tests/test_documents_delete.py`); run against a
database left over from a previous invocation, those assertions see extra
rows that were never seeded by the run in progress and fail for reasons that
have nothing to do with the code under test. Removing the underlying SQLite
file before creating tables, once per session, guarantees every test run
starts from an empty schema regardless of what an earlier run left behind.
This only touches the throwaway local file this suite itself created
(nothing here runs against Postgres or any shared database).
"""

import os

from app import models  # noqa: F401 -- registers every table on Base.metadata
from app.database import Base, engine


def _reset_sqlite_file() -> None:
    database = engine.url.database
    if engine.url.get_backend_name() != "sqlite":
        return
    if not database or database == ":memory:":
        return
    if os.path.exists(database):
        os.remove(database)


def pytest_configure() -> None:
    _reset_sqlite_file()
    Base.metadata.create_all(bind=engine)
