"""Unit tests for `app/settings_store.py`: the `app_settings`-backed reads
and writes `app/routers/settings.py` and `app/retrieval.py` call, exercised
directly against a real (SQLite) `Session` -- never through `client`/
`TestClient` (that belongs in `backend/tests/integration/`, see
`backend/tests/test_settings.py` for the `GET`/`PATCH /settings` contract
this module backs).

This ticket carries no acceptance criteria of its own ("This ticket carries
no acceptance criteria. Do what the title and description describe"), so
tests are named after the module's own documented guarantees rather than an
`AC-###`:

  * `get_similarity_threshold` returns the product default (0.62) until a
    row exists, and the persisted value from then on;
  * a stored value that cannot be read back as a float is never allowed to
    crash a read -- it falls back to the default;
  * `set_similarity_threshold` creates the row the first time and updates
    it in place afterwards (no duplicate rows), and always returns a
    `float`, even when given an `int`;
  * `get_answer_model` returns the server-configured default (`app/
    settings.py`'s `settings.answer_model`) until a row exists, and the
    persisted override from then on;
  * an empty-string override is treated as "nothing persisted" and falls
    back to the server default, matching the handler's own `is not None`
    guard semantics in `app/routers/settings.py`;
  * `set_answer_model` persists and always returns a `str`;
  * `get_settings_snapshot` returns both values together, and reflects a
    write made a moment before it with no caching in between (the module
    docstring's central claim);
  * every read goes straight to the database -- a second `Session` against
    the same engine sees what the first wrote.
"""

from __future__ import annotations

import pytest

from app.database import Base, SessionLocal, engine
from app.models import AppSetting
from app.settings import settings as server_settings
from app.settings_store import (
    ANSWER_MODEL_KEY,
    DEFAULT_SIMILARITY_THRESHOLD,
    SIMILARITY_THRESHOLD_KEY,
    get_answer_model,
    get_settings_snapshot,
    get_similarity_threshold,
    set_answer_model,
    set_similarity_threshold,
)


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        # `app_settings` rows are keyed by a fixed, module-level key name
        # (`SIMILARITY_THRESHOLD_KEY`/`ANSWER_MODEL_KEY`), so a row this
        # module writes would otherwise persist into another test module
        # sharing the same sqlite file (see tests/conftest.py) and change
        # what a fresh read (or the product default) looks like there.
        session.query(AppSetting).delete()
        session.commit()
        session.close()


# --------------------------------------------------------------------- #
# get_similarity_threshold / set_similarity_threshold
# --------------------------------------------------------------------- #


def test_get_similarity_threshold_returns_the_product_default_when_no_row_exists(db) -> None:
    assert get_similarity_threshold(db) == DEFAULT_SIMILARITY_THRESHOLD
    assert DEFAULT_SIMILARITY_THRESHOLD == pytest.approx(0.62)


def test_get_similarity_threshold_returns_the_persisted_value_once_set(db) -> None:
    set_similarity_threshold(db, 0.75)

    assert get_similarity_threshold(db) == pytest.approx(0.75)


def test_set_similarity_threshold_returns_a_float_even_when_given_an_int(db) -> None:
    result = set_similarity_threshold(db, 1)

    assert result == 1.0
    assert isinstance(result, float)


def test_set_similarity_threshold_updates_the_existing_row_rather_than_duplicating_it(db) -> None:
    set_similarity_threshold(db, 0.5)
    set_similarity_threshold(db, 0.8)

    rows = db.query(AppSetting).filter(AppSetting.key == SIMILARITY_THRESHOLD_KEY).all()

    assert len(rows) == 1
    assert get_similarity_threshold(db) == pytest.approx(0.8)


def test_get_similarity_threshold_falls_back_to_default_on_an_unparseable_stored_value(db) -> None:
    # Bypasses the public setter to simulate a row whose value cannot be
    # read back as a float -- the one case the module docstring says is a
    # request-schema concern (422 before this is ever called), but the
    # store itself must not raise if it ever happens.
    db.add(AppSetting(key=SIMILARITY_THRESHOLD_KEY, value="not-a-number"))
    db.commit()

    assert get_similarity_threshold(db) == DEFAULT_SIMILARITY_THRESHOLD


def test_similarity_threshold_write_is_visible_to_a_fresh_read_with_no_caching(db) -> None:
    """A value written a moment ago is what the very next read sees, from a
    different `Session` against the same engine -- nothing is held
    in-process between calls."""
    set_similarity_threshold(db, 0.91)

    other_session = SessionLocal()
    try:
        assert get_similarity_threshold(other_session) == pytest.approx(0.91)
    finally:
        other_session.close()


# --------------------------------------------------------------------- #
# get_answer_model / set_answer_model
# --------------------------------------------------------------------- #


def test_get_answer_model_returns_the_server_default_when_no_row_exists(db) -> None:
    assert get_answer_model(db) == server_settings.answer_model


def test_get_answer_model_returns_the_persisted_override_once_set(db) -> None:
    set_answer_model(db, "custom-answer-model")

    assert get_answer_model(db) == "custom-answer-model"
    assert get_answer_model(db) != server_settings.answer_model


def test_get_answer_model_falls_back_to_server_default_when_stored_value_is_empty_string(
    db,
) -> None:
    db.add(AppSetting(key=ANSWER_MODEL_KEY, value=""))
    db.commit()

    assert get_answer_model(db) == server_settings.answer_model


def test_set_answer_model_returns_a_string(db) -> None:
    result = set_answer_model(db, "another-model")

    assert result == "another-model"
    assert isinstance(result, str)


def test_set_answer_model_updates_the_existing_row_rather_than_duplicating_it(db) -> None:
    set_answer_model(db, "model-a")
    set_answer_model(db, "model-b")

    rows = db.query(AppSetting).filter(AppSetting.key == ANSWER_MODEL_KEY).all()

    assert len(rows) == 1
    assert get_answer_model(db) == "model-b"


# --------------------------------------------------------------------- #
# get_settings_snapshot
# --------------------------------------------------------------------- #


def test_get_settings_snapshot_returns_both_defaults_when_nothing_persisted(db) -> None:
    snapshot = get_settings_snapshot(db)

    assert snapshot == {
        "similarity_threshold": DEFAULT_SIMILARITY_THRESHOLD,
        "answer_model": server_settings.answer_model,
    }


def test_get_settings_snapshot_reflects_a_write_made_a_moment_before_with_no_caching(db) -> None:
    set_similarity_threshold(db, 0.77)
    set_answer_model(db, "snapshot-model")

    snapshot = get_settings_snapshot(db)

    assert snapshot == {
        "similarity_threshold": pytest.approx(0.77),
        "answer_model": "snapshot-model",
    }


def test_get_settings_snapshot_only_changes_the_field_that_was_set(db) -> None:
    """Setting one value never disturbs the other's in-force value --
    `PATCH /settings` with only one field present must leave the other at
    its prior value."""
    set_similarity_threshold(db, 0.7)

    snapshot = get_settings_snapshot(db)

    assert snapshot["similarity_threshold"] == pytest.approx(0.7)
    assert snapshot["answer_model"] == server_settings.answer_model
