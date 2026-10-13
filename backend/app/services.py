"""The backing services this application is configured to reach.

Each entry maps an architecture component to a check of whether the
environment variables it needs are set. Redis is set from
docker-compose.yml through .env.example, so a fresh clone reports it
configured. Object storage, the Groq AI provider and OCR read the keys the
product owner has not set yet (see `app/config.py`): they report themselves
unconfigured until those keys exist, exactly as the features built on them
must at their own point of use.
"""

import os

from app.config import groq_status, ocr_status, s3_status

SERVICE_CHECKS = {
    "redis-queue": lambda: bool(os.getenv("REDIS_URL")),
    "object-storage": lambda: s3_status().enabled,
    "ai-provider": lambda: groq_status().enabled,
    "ocr": lambda: ocr_status().enabled,
}


def configured_services() -> dict[str, bool]:
    """Each service mapped to whether it is currently usable."""
    return {name: check() for name, check in SERVICE_CHECKS.items()}
