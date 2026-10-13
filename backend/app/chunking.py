"""Splits extracted document text into overlapping, metadata-carrying chunks.

Extraction (US-009/US-016) hands this module a sequence of `Segment`s --
each one a run of text tagged with the page or section it came from.
`chunk_text()` concatenates them and slices the result into ~1,000-character
windows with ~150 characters of overlap (AC-041), picking a breakpoint at a
paragraph, sentence or whitespace boundary in the latter half of each window
rather than cutting mid-word. A chunk that spans more than one input segment
(e.g. a page boundary) is tagged with the page/section of whichever segment
its first character came from, per the product decision that only the first
page of a spanning chunk is recorded.

`persist_chunks()` is the only part of this module that touches a database;
everything else is pure and synchronous -- no network calls, no embedding
work. `citation_from_chunk()` turns a persisted `Chunk` row into the exact
dict shape the `Citation` model's columns mirror, so a caller building a
citation can never drift from what was actually stored.

Size/overlap/ceiling are module constants, overridable via environment
variables read at the point of use (same pattern as `app/config.py`) so an
operator can tune them without a code change.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import Chunk, Document

# Defaults per AC-041: ~1,000 character chunks, ~150 character overlap.
_DEFAULT_CHUNK_TARGET = 1000
_DEFAULT_CHUNK_OVERLAP = 150
# Hard ceiling: even when no good breakpoint is found, a chunk never exceeds
# this many characters (AC-041's "no chunk exceeds a documented hard
# ceiling").
_DEFAULT_CHUNK_HARD_CEILING = 1500
_DEFAULT_TEXT_PREVIEW_LENGTH = 200

_BREAKPOINT_PATTERNS = ("\n\n", ". ", "! ", "? ", "\n", " ")

# (start, end, page_ref, section_ref) span for one input segment within the
# combined text `chunk_text` builds internally.
_OffsetSpan = tuple[int, int, "int | None", "str | None"]


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def chunk_target() -> int:
    """Target chunk size in characters, read at point of use."""
    return _int_env("CHUNK_TARGET_CHARS", _DEFAULT_CHUNK_TARGET)


def chunk_overlap() -> int:
    """Overlap between consecutive chunks, in characters, read at point of use."""
    return _int_env("CHUNK_OVERLAP_CHARS", _DEFAULT_CHUNK_OVERLAP)


def chunk_hard_ceiling() -> int:
    """Hard upper bound on a single chunk's length, in characters."""
    ceiling = _int_env("CHUNK_HARD_CEILING_CHARS", _DEFAULT_CHUNK_HARD_CEILING)
    # Never let the ceiling be smaller than the target; that would make every
    # chunk a hard cut before a breakpoint search could ever run.
    return max(ceiling, chunk_target())


def text_preview_length() -> int:
    """Length of the `text_preview` a citation carries, in characters."""
    return _int_env("CITATION_PREVIEW_CHARS", _DEFAULT_TEXT_PREVIEW_LENGTH)


@dataclass(frozen=True)
class Segment:
    """One run of extracted text tagged with where it came from."""

    text: str
    page_ref: int | None = None
    section_ref: str | None = None


@dataclass(frozen=True)
class ChunkDraft:
    """An in-memory chunk, not yet persisted."""

    index: int
    content: str
    page_ref: int | None = None
    section_ref: str | None = None


def _build_text(segments: list[Segment]) -> tuple[str, list[_OffsetSpan]]:
    """Joins non-empty segments with a blank line, returning the combined
    text and a list of (start, end, page_ref, section_ref) spans so any
    character offset in the combined text can be traced back to the
    segment it came from."""
    parts: list[str] = []
    offset_map: list[_OffsetSpan] = []
    pos = 0
    for segment in segments:
        if not segment.text:
            continue
        if parts:
            parts.append("\n\n")
            pos += 2
        start = pos
        parts.append(segment.text)
        pos += len(segment.text)
        offset_map.append((start, pos, segment.page_ref, segment.section_ref))
    return "".join(parts), offset_map


def _lookup_ref(offset_map: list[_OffsetSpan], position: int) -> tuple[int | None, str | None]:
    for start, end, page_ref, section_ref in offset_map:
        if start <= position < end:
            return page_ref, section_ref
    if offset_map:
        last = offset_map[-1]
        return last[2], last[3]
    return None, None


def _find_end(text: str, start: int, target: int, ceiling: int) -> int:
    """The end offset of the chunk starting at `start`: a breakpoint found
    in the latter half of the target window (preferred) or, failing that, a
    hard cut no further than `ceiling` characters from `start`."""
    length = len(text)
    naive_end = start + target
    if naive_end >= length:
        return length

    half_start = start + target // 2
    if half_start >= length:
        return length

    search_limit = min(start + ceiling, length)
    region = text[half_start:search_limit]
    for pattern in _BREAKPOINT_PATTERNS:
        idx = region.find(pattern)
        if idx != -1:
            return half_start + idx + len(pattern)
    return search_limit


def chunk_text(segments: list[Segment]) -> list[ChunkDraft]:
    """Splits page/section-tagged `segments` into overlapping `ChunkDraft`s.

    Text shorter than one window yields exactly one chunk. No chunk exceeds
    `chunk_hard_ceiling()` characters.
    """
    if not segments:
        return []

    full_text, offset_map = _build_text(segments)
    if not full_text:
        return []

    target = chunk_target()
    overlap = chunk_overlap()
    ceiling = chunk_hard_ceiling()
    length = len(full_text)

    drafts: list[ChunkDraft] = []
    start = 0
    index = 0
    while start < length:
        end = _find_end(full_text, start, target, ceiling)
        content = full_text[start:end].strip()
        if content:
            page_ref, section_ref = _lookup_ref(offset_map, start)
            drafts.append(
                ChunkDraft(index=index, content=content, page_ref=page_ref, section_ref=section_ref)
            )
            index += 1

        if end >= length:
            break

        next_start = end - overlap
        if next_start <= start:
            # Guards against a zero/negative-progress loop when overlap is
            # configured larger than the slice just produced.
            next_start = start + 1
        start = next_start

    return drafts


def persist_chunks(db, document: Document, drafts: list[ChunkDraft]) -> list[Chunk]:
    """Writes `drafts` as `Chunk` rows linked to `document`. The only part
    of this module that touches a database session."""
    from app.models import Chunk

    rows: list[Chunk] = []
    for draft in drafts:
        chunk = Chunk(
            document_id=document.id,
            chunk_index=draft.index,
            content=draft.content,
            page_ref=draft.page_ref,
            section_ref=draft.section_ref,
        )
        db.add(chunk)
        rows.append(chunk)

    db.commit()
    for chunk in rows:
        db.refresh(chunk)
    return rows


def citation_from_chunk(chunk: Chunk) -> dict:
    """Resolves a persisted `Chunk` to the dict shape the `Citation` model's
    columns mirror exactly: chunk_id, document_id, filename (via the owning
    Document), page_ref, section_ref, text_preview."""
    document = chunk.document
    filename = document.filename if document is not None else None
    preview_len = text_preview_length()
    content = chunk.content or ""
    text_preview = content[:preview_len]

    return {
        "chunk_id": chunk.id,
        "document_id": chunk.document_id,
        "filename": filename,
        "page_ref": chunk.page_ref,
        "section_ref": chunk.section_ref,
        "text_preview": text_preview,
    }
