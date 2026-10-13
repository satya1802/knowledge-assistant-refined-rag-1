"""Test-only schema setup.

Application startup (`app/main.py`) never creates or alters the schema --
`alembic upgrade head` is the only path (AC-094, see `app/main.py`'s
docstring and `tests/test_migrations.py`). These tests still need tables to
exist in the throwaway local database they run against, so this fixture
creates them directly from the models once per test session. It is never
called by the application itself.
"""

from app import models  # noqa: F401 -- registers every table on Base.metadata
from app.database import Base, engine


def pytest_configure() -> None:
    Base.metadata.create_all(bind=engine)
