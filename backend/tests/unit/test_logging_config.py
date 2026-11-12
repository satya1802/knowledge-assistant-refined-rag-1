"""Unit tests for `app/logging_config.py`: `_secret_values`,
`RedactSecretsFilter`, and `install_logging`, exercised directly as plain
functions/a plain class -- no `client` fixture, no `TestClient`.

This ticket (the logging_config.py implementation) carries no acceptance
criteria of its own; `backend/tests/test_logging_redaction.py` already
covers the filter's redaction of a plain message, formatted `%s` args, and
exception text, plus `install_logging()` wiring up caplog's handler (all in
service of AC-098, which lives on the settings module). This file is not a
rewrite of that one: it covers what it leaves untouched --

  * `_secret_values()` itself, as a unit in its own right;
  * the module's documented claim that the filter reads the *live* settings
    value on every call rather than one captured when the filter object was
    built;
  * a message containing more than one occurrence of the secret;
  * the filter's behaviour when there is nothing to redact (`exc_text` is
    `None`, no key configured) -- it must not raise and must still return
    `True` so the record is emitted;
  * that `install_logging()` actually attaches the filter object to an
    already-existing handler and to each of the named loggers it documents
    (`uvicorn`, `uvicorn.error`, `uvicorn.access`, `app`), not just that a
    caplog-captured record happens to come out redacted; and
  * that calling `install_logging()` more than once is safe, as its
    docstring promises.
"""

import logging

import app.settings as settings_module
from app.logging_config import RedactSecretsFilter, _secret_values, install_logging


class _FakeSettings:
    def __init__(self, groq_api_key: str = "") -> None:
        self.groq_api_key = groq_api_key


def _make_record(msg: str, args: tuple = ()) -> logging.LogRecord:
    return logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=args,
        exc_info=None,
    )


# --- _secret_values ---------------------------------------------------


def test_secret_values_is_empty_when_no_key_is_configured(monkeypatch) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings(""))

    assert _secret_values() == []


def test_secret_values_returns_the_configured_key(monkeypatch) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings("a-configured-key"))

    assert _secret_values() == ["a-configured-key"]


# --- RedactSecretsFilter -----------------------------------------------


def test_filter_reads_the_live_settings_value_not_one_captured_at_construction(
    monkeypatch,
) -> None:
    """The module docstring promises the filter looks at
    `app.settings.settings` fresh on every call, so a key configured after
    the filter object was built is still redacted."""
    monkeypatch.setattr(settings_module, "settings", _FakeSettings(""))
    redact = RedactSecretsFilter()

    # The key only becomes configured after the filter instance already
    # exists -- exactly the "set after this module loads" case the
    # docstring calls out.
    monkeypatch.setattr(settings_module, "settings", _FakeSettings("late-configured-key"))
    record = _make_record("using key late-configured-key now")

    redact.filter(record)

    assert "late-configured-key" not in record.getMessage()
    assert "***" in record.getMessage()


def test_filter_replaces_every_occurrence_of_the_secret_in_one_message(monkeypatch) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings("dup-secret"))
    record = _make_record("dup-secret seen twice, here: dup-secret")

    RedactSecretsFilter().filter(record)

    message = record.getMessage()
    assert "dup-secret" not in message
    assert message.count("***") == 2


def test_filter_does_not_raise_when_exc_text_is_absent(monkeypatch) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings("a-secret"))
    record = _make_record("a plain message, no traceback attached")

    result = RedactSecretsFilter().filter(record)

    assert result is True
    assert record.exc_text is None


def test_filter_returns_true_so_the_record_is_still_emitted(monkeypatch) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings("a-secret"))
    record = _make_record("message mentioning a-secret")

    assert RedactSecretsFilter().filter(record) is True


def test_filter_returns_true_even_when_no_secret_is_configured(monkeypatch) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings(""))
    record = _make_record("nothing sensitive in here")

    assert RedactSecretsFilter().filter(record) is True


# --- install_logging -----------------------------------------------------


def test_install_logging_attaches_the_filter_to_an_existing_root_handler() -> None:
    root = logging.getLogger()
    handler = logging.Handler()
    root.addHandler(handler)
    try:
        install_logging()

        assert any(isinstance(f, RedactSecretsFilter) for f in handler.filters)
    finally:
        root.removeHandler(handler)


def test_install_logging_attaches_the_filter_to_each_documented_named_logger() -> None:
    names = ("uvicorn", "uvicorn.error", "uvicorn.access", "app")

    install_logging()

    for name in names:
        logger = logging.getLogger(name)
        assert any(
            isinstance(f, RedactSecretsFilter) for f in logger.filters
        ), f"{name} logger has no RedactSecretsFilter attached"


def test_install_logging_attaches_the_filter_to_the_root_logger_itself() -> None:
    root = logging.getLogger()

    install_logging()

    assert any(isinstance(f, RedactSecretsFilter) for f in root.filters)


def test_install_logging_is_safe_to_call_more_than_once() -> None:
    # Its docstring promises exactly this; calling it twice must not raise,
    # and the root logger must still carry the filter afterwards.
    install_logging()
    install_logging()

    root = logging.getLogger()
    assert any(isinstance(f, RedactSecretsFilter) for f in root.filters)
