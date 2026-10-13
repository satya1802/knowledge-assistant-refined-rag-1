"""Where an uploaded document's original bytes are written.

Reads whether object storage (S3) is configured through
`app.config.s3_status()` at the point of use -- never at import time, so a
missing key never breaks startup. When it is not configured, the bytes go
to a local directory instead (`STORAGE_DIR`, default `./storage_data`),
with a clear log line explaining why, so local development and CI never
need real AWS credentials.
"""

import logging
import os
from pathlib import Path

from app.config import s3_status

logger = logging.getLogger(__name__)


def _local_storage_dir() -> Path:
    path = Path(os.getenv("STORAGE_DIR", "./storage_data"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def store_object(key: str, data: bytes) -> str:
    """Writes `data` under `key`: to S3 when object storage is configured,
    else to local disk under `STORAGE_DIR`. Returns `key` unchanged -- that
    is what callers persist as `Document.s3_key`."""
    status = s3_status()
    if not status.enabled:
        logger.info("%s Writing %s to local disk instead.", status.message, key)
        dest = _local_storage_dir() / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return key

    import boto3  # imported here, not at module load, per app/config.py's rule

    client = boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )
    client.put_object(Bucket=os.environ["S3_BUCKET"], Key=key, Body=data)
    return key
