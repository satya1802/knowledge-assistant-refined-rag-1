"""Central place to read the service keys the product owner has not set yet.

AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, S3_BUCKET (object
storage), OCR_MIN_TEXT_CHARS, TESSDATA_PREFIX, TESSERACT_CMD (OCR) and
GROQ_API_KEY (the AI provider) are added to the environment before
deployment, not during development. Every feature that needs one of them
must read it here, at the point of use, and turn itself off with a clear
message when it is empty -- never fail at import or at startup, and a test
must mock the feature, never exercise the real service through this module.

This module only reports whether a feature's keys are present; it never
calls AWS, Groq or Tesseract itself.
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
