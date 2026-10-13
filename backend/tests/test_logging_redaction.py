"""app/logging_config.py: the secret never survives into a log record or a
traceback (AC-098)."""

import logging

import app.settings as settings_module
from app.logging_config import RedactSecretsFilter, install_logging


class _FakeSettings:
    groq_api_key = "super-secret-value"


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


def test_filter_redacts_the_secret_from_a_plain_message(monkeypatch) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings())
    record = _make_record("calling groq with key super-secret-value")

    RedactSecretsFilter().filter(record)

    assert "super-secret-value" not in record.getMessage()
    assert "***" in record.getMessage()


def test_filter_redacts_the_secret_from_formatted_args(monkeypatch) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings())
    record = _make_record("key=%s", args=("super-secret-value",))

    RedactSecretsFilter().filter(record)

    assert "super-secret-value" not in record.getMessage()


def test_filter_redacts_the_secret_from_exception_text(monkeypatch) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings())
    record = _make_record("boom")
    record.exc_text = "Traceback: used key super-secret-value and failed"

    RedactSecretsFilter().filter(record)

    assert "super-secret-value" not in record.exc_text


def test_filter_leaves_messages_alone_when_no_secret_is_configured(monkeypatch) -> None:
    class _NoSecret:
        groq_api_key = ""

    monkeypatch.setattr(settings_module, "settings", _NoSecret())
    record = _make_record("nothing secret here")

    RedactSecretsFilter().filter(record)

    assert record.getMessage() == "nothing secret here"


def test_install_logging_redacts_records_handled_by_root(monkeypatch, caplog) -> None:
    monkeypatch.setattr(settings_module, "settings", _FakeSettings())
    install_logging()

    logger = logging.getLogger("app.test_redaction_module")
    with caplog.at_level(logging.INFO):
        logger.info("secret is super-secret-value")

    for record in caplog.records:
        assert "super-secret-value" not in record.getMessage()


def test_logging_the_settings_object_prints_the_key_as_stars(caplog) -> None:
    from app.settings import Settings

    settings = Settings()
    with caplog.at_level(logging.INFO):
        logging.getLogger("app.test_redaction_module").info("current settings: %s", settings)

    assert "***" in caplog.text
