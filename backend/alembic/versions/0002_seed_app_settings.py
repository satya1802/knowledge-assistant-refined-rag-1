"""Seed default app_settings rows (US-021-1).

Additive, data-only migration layered on `0001_initial`: inserts the
`similarity_threshold` (0.62, the product default per AC-051) and
`answer_model` rows into `app_settings` so `GET /settings` returns a real,
in-force value from the very first request against a freshly migrated
database, rather than depending on application code to backfill them.
Nothing here changes a column or a table -- only data -- and like every
migration once merged (see `0001_initial.py`'s docstring), this file is
never edited again; a later change is a new migration on top of it.

Idempotent: running `alembic upgrade head` again finds the rows already
there (the migration itself only ever runs once per database, tracked by
`alembic_version`, but this still checks first rather than assuming) and
inserts nothing a second time.
"""

from __future__ import annotations

import os
from datetime import datetime

import sqlalchemy as sa

from alembic import op

revision = "0002_seed_app_settings"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

_app_settings = sa.table(
    "app_settings",
    sa.column("key", sa.String),
    sa.column("value", sa.JSON),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

# Matches app/settings.py's Settings.answer_model default; an operator who
# has already set ANSWER_MODEL before running this migration gets that
# value seeded instead of the hard-coded default.
_DEFAULT_ANSWER_MODEL = os.getenv("ANSWER_MODEL", "llama-3.1-8b-instant")
_DEFAULT_SIMILARITY_THRESHOLD = 0.62


def upgrade() -> None:
    connection = op.get_bind()
    existing = {row[0] for row in connection.execute(sa.select(_app_settings.c.key)).fetchall()}

    now = datetime.utcnow()
    rows = []
    if "similarity_threshold" not in existing:
        rows.append(
            {
                "key": "similarity_threshold",
                "value": _DEFAULT_SIMILARITY_THRESHOLD,
                "updated_at": now,
            }
        )
    if "answer_model" not in existing:
        rows.append({"key": "answer_model", "value": _DEFAULT_ANSWER_MODEL, "updated_at": now})

    if rows:
        op.bulk_insert(_app_settings, rows)


def downgrade() -> None:
    op.execute(
        _app_settings.delete().where(
            _app_settings.c.key.in_(["similarity_threshold", "answer_model"])
        )
    )
