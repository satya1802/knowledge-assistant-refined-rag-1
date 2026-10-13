"""Central place to read the service keys the product owner has not set yet.

AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, S3_BUCKET (object
storage), OCR_MIN_TEXT_CHARS, TESSDATA_PREFIX, TESSERACT_CMD (OCR),
GROQ_API_KEY (the AI provider) and the embedding provider's own key
(`embedding_status()`, name chosen by `EMBEDDING_PROVIDER`) are added to the
environment before deployment, not during development. Every feature that
needs one of them must read it here, at the point of use, and turn itself
off with a clear message when it is empty -- never fail at import or at
startup, and a test must mock the feature, never exercise the real service
through this module.

This module only reports whether a feature's keys are present; it never
calls AWS, Groq, Tesseract or an embedding provider itself.
"""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class FeatureStatus:
    enabled: bool
    message: str


def _require(names: list[str], feature: str) -> FeatureStatus:
    missing = [name for name in names if not os.getenv(name)]
    if missing:
        return FeatureStatus(
            enabled=False,
            message=f"{feature} is disabled: set {', '.join(missing)} to enable it.",
        )
    return FeatureStatus(enabled=True, message=f"{feature} is enabled.")


def s3_status() -> FeatureStatus:
    """Amazon S3 (objstore): storage for original uploaded files."""
    return _require(
        ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"],
        "Object storage (S3)",
    )


def groq_status() -> FeatureStatus:
    """Groq: grounded/fallback chat answers and the OCR vision fallback."""
    return _require(["GROQ_API_KEY"], "The Groq AI provider")


def ocr_status() -> FeatureStatus:
    """Tesseract OCR: reads scanned/image-only PDF pages in-container."""
    return _require(["TESSERACT_CMD", "TESSDATA_PREFIX"], "Tesseract OCR")


def embedding_status() -> FeatureStatus:
    """The embedding provider named by `EMBEDDING_PROVIDER`
    (`app/settings.py`), read here at the point of use (AC-155): reports
    disabled with a clear, key-free message when no provider is chosen yet,
    or when the chosen one's own key (`<PROVIDER>_EMBEDDING_API_KEY`) is
    absent. `app/embedding.py` is this function's one caller."""
    from app.settings import settings

    provider = (settings.embedding_provider or "none").strip().lower()
    if provider in ("", "none"):
        return FeatureStatus(
            enabled=False,
            message=(
                "No embedding provider is configured: set EMBEDDING_PROVIDER "
                "(see backend/docs/decisions/0001-embedding-provider.md)."
            ),
        )
    return _require(
        [f"{provider.upper()}_EMBEDDING_API_KEY"], f"Embedding provider '{provider}'"
    )


def ocr_min_text_chars(default: int = 20) -> int:
    """Below this many extracted characters, a PDF page is treated as
    scanned and routed to OCR. Read at point of use so a change takes effect
    without a redeploy; falls back to `default` when unset or not a number.
    """
    raw = os.getenv("OCR_MIN_TEXT_CHARS")
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def bcrypt_rounds(default: int = 12) -> int:
    """Bcrypt cost factor for password hashing, read at point of use so an
    operator can raise it (e.g. on faster hardware) without a code change.
    """
    raw = os.getenv("BCRYPT_COST")
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def session_lifetime_days(default: int = 14) -> int:
    """How long a freshly created session row stays valid."""
    raw = os.getenv("SESSION_LIFETIME_DAYS")
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default
