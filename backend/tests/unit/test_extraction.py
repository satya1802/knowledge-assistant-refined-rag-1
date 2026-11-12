"""Unit tests for `app/extraction.py`: the `extract_segments` seam the
background worker calls exactly once per document (no `client`/`TestClient`,
no HTTP or worker layer -- that belongs in `backend/tests/integration/`).

This ticket carries no acceptance criteria of its own, so tests are named
after the module's own documented guarantees:
  * TXT/MD decode directly to a single `Segment` carrying the full text,
    with invalid UTF-8 bytes replaced rather than raising;
  * PDF/DOCX (and anything else) raise `ExtractionUnavailable` with a
    short, readable message safe to store as `Document.failure_reason`,
    rather than crashing the worker;
  * file-type matching is case-insensitive and tolerant of surrounding
    whitespace, since callers pass through whatever `Document.file_type`
    holds.
"""

import pytest

from app.chunking import Segment
from app.extraction import ExtractionUnavailable, extract_segments


def test_txt_decodes_to_a_single_segment_with_the_full_text() -> None:
    segments = extract_segments("txt", b"Hello, world!")

    assert segments == [Segment(text="Hello, world!")]


def test_md_decodes_to_a_single_segment_with_the_full_text() -> None:
    segments = extract_segments("md", b"# Heading\n\nSome body text.")

    assert segments == [Segment(text="# Heading\n\nSome body text.")]


def test_txt_result_carries_no_page_or_section_ref() -> None:
    [segment] = extract_segments("txt", b"plain text")

    assert segment.page_ref is None
    assert segment.section_ref is None


def test_file_type_matching_is_case_insensitive() -> None:
    segments = extract_segments("TXT", b"upper case type")

    assert segments == [Segment(text="upper case type")]


def test_file_type_matching_tolerates_surrounding_whitespace() -> None:
    segments = extract_segments("  md  ", b"padded type")

    assert segments == [Segment(text="padded type")]


def test_txt_replaces_invalid_utf8_bytes_instead_of_raising() -> None:
    # 0xff is not valid UTF-8 on its own; decoding must substitute rather
    # than blow up the worker on a malformed upload.
    invalid = b"before" + b"\xff" + b"after"

    [segment] = extract_segments("txt", invalid)

    assert "before" in segment.text
    assert "after" in segment.text
    assert "�" in segment.text


def test_empty_txt_bytes_yield_a_single_segment_with_empty_text() -> None:
    segments = extract_segments("txt", b"")

    assert segments == [Segment(text="")]


def test_pdf_raises_extraction_unavailable() -> None:
    with pytest.raises(ExtractionUnavailable) as exc_info:
        extract_segments("pdf", b"%PDF-1.4 fake bytes")

    assert "pdf" in str(exc_info.value)


def test_docx_raises_extraction_unavailable() -> None:
    with pytest.raises(ExtractionUnavailable) as exc_info:
        extract_segments("docx", b"fake docx bytes")

    assert "docx" in str(exc_info.value)


def test_unknown_file_type_raises_extraction_unavailable() -> None:
    with pytest.raises(ExtractionUnavailable):
        extract_segments("exe", b"anything")


def test_empty_file_type_raises_extraction_unavailable() -> None:
    with pytest.raises(ExtractionUnavailable):
        extract_segments("", b"anything")


def test_extraction_unavailable_message_is_a_plain_string_safe_to_store() -> None:
    with pytest.raises(ExtractionUnavailable) as exc_info:
        extract_segments("pdf", b"irrelevant")

    message = str(exc_info.value)
    assert isinstance(message, str)
    assert len(message) > 0
    assert "not available yet" in message
