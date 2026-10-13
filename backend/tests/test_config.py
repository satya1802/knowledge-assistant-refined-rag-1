"""The feature-flag helpers in app/config.py read environment variables and
nothing else -- these tests only ever check the flag, never a real AWS,
Groq or Tesseract call.
"""

from app.config import groq_status, ocr_status, s3_status


def test_s3_is_disabled_until_every_required_key_is_set(monkeypatch) -> None:
    for name in ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"]:
        monkeypatch.delenv(name, raising=False)

    status = s3_status()

    assert status.enabled is False
    assert "S3_BUCKET" in status.message


def test_s3_is_enabled_once_every_required_key_is_set(monkeypatch) -> None:
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "id")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("S3_BUCKET", "bucket")

    assert s3_status().enabled is True


def test_groq_is_disabled_without_its_key(monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    assert groq_status().enabled is False


def test_groq_is_enabled_once_its_key_is_set(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    assert groq_status().enabled is True


def test_ocr_is_disabled_without_tesseract_configuration(monkeypatch) -> None:
    monkeypatch.delenv("TESSERACT_CMD", raising=False)
    monkeypatch.delenv("TESSDATA_PREFIX", raising=False)

    assert ocr_status().enabled is False
