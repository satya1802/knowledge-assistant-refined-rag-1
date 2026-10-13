"""AC-094: an initial Alembic migration covers the current models, and
`alembic upgrade head` is idempotent on a populated database.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

_BACKEND_DIR = Path(__file__).resolve().parent.parent

_EXPECTED_TABLES = {
    "users",
    "sessions",
    "documents",
    "chunks",
    "conversations",
    "messages",
    "citations",
    "app_settings",
    "audit_logs",
}


def _alembic_config(db_url: str) -> Config:
    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def test_upgrade_head_creates_every_table(tmp_path, monkeypatch) -> None:
    db_url = f"sqlite:///{tmp_path / 'migrate_schema.db'}"
    monkeypatch.setenv("DATABASE_URL", db_url)

    command.upgrade(_alembic_config(db_url), "head")

    engine = create_engine(db_url)
    with engine.connect() as conn:
        tables = {
            row[0]
            for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        }
    assert _EXPECTED_TABLES <= tables


def test_upgrade_head_is_idempotent_on_a_populated_database(tmp_path, monkeypatch) -> None:
    db_url = f"sqlite:///{tmp_path / 'migrate_idempotent.db'}"
    monkeypatch.setenv("DATABASE_URL", db_url)
    cfg = _alembic_config(db_url)

    command.upgrade(cfg, "head")

    engine = create_engine(db_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users "
                "(id, email, password_hash, role, is_active, failed_attempts, "
                "theme, created_at) VALUES "
                "('11111111-1111-1111-1111-111111111111', 'a@example.com', 'x', "
                "'admin', 1, 0, 'system', '2024-01-01 00:00:00')"
            )
        )

    # AC-093/AC-094: running the same migration again neither errors nor
    # loses the row already there.
    command.upgrade(cfg, "head")

    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
    assert count == 1
