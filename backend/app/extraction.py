"""Text extraction seam the background worker calls exactly once per
document (US-019-2).

PDF and DOCX extraction is separate, later development-sprint work
(US-009/US-016) and is deliberately not implemented here: `extract_segments`
is the single seam the worker calls, so wiring in a real PDF/DOCX extractor
later is a change to this module alone, not to `app/worker.py`. Until then,
asking for either raises `ExtractionUnavailable` with a short, readable
message rather than crashing the worker -- `app/worker.py` catches it and
marks the document 'failed' with that message.

TXT and MD need no extractor at all: their stored bytes already *are* the
document's text, so this module just decodes them (replacing anything that
is not valid UTF-8 rather than raising on it).
"""

from __future__ import annotations

from app.chunking import Segment


class ExtractionUnavailable(Exception):
    """Raised when no extractor exists yet for a given file type. Carries a
    short, human-readable message safe to store as `Document.failure_reason`."""


def extract_segments(file_type: str, data: bytes) -> list[Segment]:
    """Returns the `Segment`s chunking should split, for a document whose
    stored bytes are `data` and whose accepted type is `file_type` ('pdf',
    'docx', 'txt' or 'md').

    TXT/MD decode directly. PDF/DOCX raise `ExtractionUnavailable` -- that
    extraction work is out of scope for this slice.
    """
    normalized = (file_type or "").strip().lower()
    if normalized in ("txt", "md"):
        text = data.decode("utf-8", errors="replace")
        return [Segment(text=text)]

    raise ExtractionUnavailable(f"Text extraction for '{file_type}' files is not available yet.")


__all__ = ["ExtractionUnavailable", "extract_segments"]
