"""US-018-2: app/chunking.py -- chunk sizing/overlap (AC-041), persisted
chunk metadata (AC-042) and citation resolution from a stored chunk
(AC-043).

Pure-function behaviour (`chunk_text`) needs no database and never touches
the network. `persist_chunks` / `citation_from_chunk` are exercised against
a real `Document` row seeded directly against the ORM, the established
pattern in this suite (see test_documents_persistence.py).
"""

import uuid

from app.chunking import (
    Segment,
    chunk_hard_ceiling,
    chunk_overlap,
    chunk_target,
    chunk_text,
    citation_from_chunk,
    persist_chunks,
)
from app.database import Base, SessionLocal, engine
from app.models import Chunk, Document, User
from app.security import hash_password

_PASSWORD = "ChunkSeedPass123!"
_WORDS = (
    "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod "
    "tempor incididunt ut labore et dolore magna aliqua "
)


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_document(filename: str = "policy.txt") -> Document:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(
            email=_unique_email("chunk-owner"),
            password_hash=hash_password(_PASSWORD),
            role="admin",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        document = Document(
            filename=filename,
            file_type="txt",
            size_bytes=1,
            s3_key="documents/fake/key.txt",
            status="processing",
            uploaded_by=user.id,
        )
        db.add(document)
        db.commit()
        db.refresh(document)
        return document
    finally:
        db.close()


def _paragraph(n_chars: int) -> str:
    """A run of plain words with no sentence punctuation until its very
    end, so the only breakpoint a reader (or chunk_text) finds inside it is
    the ". " this function appends. Repeated, these simulate real prose
    where sentence boundaries land close to -- not right after -- the
    halfway point of a ~1,000-char window."""
    body = (_WORDS * (n_chars // len(_WORDS) + 1))[: n_chars - 2]
    return body + ". "


def _paragraph_text(paragraph_chars: int, count: int) -> str:
    """`count` paragraphs of `paragraph_chars` each, concatenated with no
    other separator -- a multi-thousand-character input with sentence
    breakpoints spaced evenly around the chunk target."""
    return "".join(_paragraph(paragraph_chars) for _ in range(count))


# --------------------------------------------------------------------- #
# AC-041: sizing, overlap and breakpoint placement
# --------------------------------------------------------------------- #


def test_chunks_stay_near_target_size_overlap_and_break_in_the_latter_half() -> None:
    target = chunk_target()
    overlap = chunk_overlap()
    ceiling = chunk_hard_ceiling()

    # Paragraphs sized just under the target: with no punctuation inside
    # them, the first candidate breakpoint after a window's halfway point
    # is each paragraph's own ". ", so the resulting chunk length is
    # governed by paragraph length, not by an accidental early period.
    text = _paragraph_text(target - 48, 6)
    drafts = chunk_text([Segment(text=text, page_ref=1)])

    assert len(drafts) >= 3  # a multi-thousand-character input yields several chunks

    for draft in drafts[:-1]:
        # AC-041: chunk length stays near 1,000 chars ...
        assert abs(len(draft.content) - target) <= 300
        # ... and the breakpoint lands in the latter half of the window.
        assert len(draft.content) >= target // 2
        assert len(draft.content) <= ceiling

    for first, second in zip(drafts, drafts[1:]):
        # Consecutive chunks actually share overlapping text: a slice from
        # near the end of the first chunk re-appears at the start of the
        # second.
        tail_len = min(overlap - 20, len(first.content))
        tail = first.content[-tail_len:] if tail_len > 0 else ""
        assert tail != ""
        assert tail in second.content


def test_empty_text_yields_no_chunks() -> None:
    assert chunk_text([]) == []
    assert chunk_text([Segment(text="")]) == []
    assert chunk_text([Segment(text=""), Segment(text="")]) == []


def test_text_shorter_than_one_window_yields_exactly_one_chunk() -> None:
    short_text = "Hello there, this is a short document."
    drafts = chunk_text([Segment(text=short_text, page_ref=1)])

    assert len(drafts) == 1
    assert drafts[0].index == 0
    assert drafts[0].content == short_text
    assert drafts[0].page_ref == 1


def test_text_with_no_whitespace_still_splits_without_exceeding_the_hard_ceiling() -> None:
    no_whitespace_text = "a" * 3000
    drafts = chunk_text([Segment(text=no_whitespace_text, page_ref=1)])

    ceiling = chunk_hard_ceiling()
    assert len(drafts) > 1
    for draft in drafts:
        assert len(draft.content) <= ceiling
    # With no breakpoint character anywhere, every non-final chunk falls
    # back to a hard cut at exactly the ceiling.
    assert len(drafts[0].content) == ceiling


# --------------------------------------------------------------------- #
# AC-042: persisted chunk metadata
# --------------------------------------------------------------------- #


def test_persisted_chunks_carry_document_id_index_content_and_a_page_reference() -> None:
    document = _seed_document(filename="persisted-chunks.txt")
    text = _paragraph_text(900, 4)
    drafts = chunk_text([Segment(text=text, page_ref=7)])
    assert len(drafts) >= 2

    db = SessionLocal()
    try:
        rows = persist_chunks(db, document, drafts)
        assert len(rows) == len(drafts)

        stored = (
            db.query(Chunk)
            .filter(Chunk.document_id == document.id)
            .order_by(Chunk.chunk_index)
            .all()
        )
        assert len(stored) == len(drafts)

        for expected_index, row in enumerate(stored):
            assert row.document_id == document.id
            assert row.chunk_index == expected_index
            assert row.content
            assert row.page_ref is not None or row.section_ref is not None
            # filename is reachable from the chunk via its relationship.
            assert row.document.filename == "persisted-chunks.txt"
    finally:
        db.close()


def test_persisted_chunks_record_a_section_reference_when_given_one_instead_of_a_page() -> None:
    document = _seed_document(filename="sectioned.md")
    drafts = chunk_text([Segment(text="Short section body.", section_ref="Introduction")])

    db = SessionLocal()
    try:
        rows = persist_chunks(db, document, drafts)
        assert rows[0].page_ref is None
        assert rows[0].section_ref == "Introduction"
        assert rows[0].document.filename == "sectioned.md"
    finally:
        db.close()


# --------------------------------------------------------------------- #
# AC-043: citation resolution from a stored chunk
# --------------------------------------------------------------------- #


def test_citation_from_a_stored_chunk_matches_its_filename_and_page() -> None:
    document = _seed_document(filename="citeable.txt")
    drafts = chunk_text([Segment(text="Some citeable body text.", page_ref=3)])

    db = SessionLocal()
    try:
        [row] = persist_chunks(db, document, drafts)

        citation = citation_from_chunk(row)

        assert citation["chunk_id"] == row.id
        assert citation["document_id"] == document.id
        assert citation["filename"] == "citeable.txt"
        assert citation["page_ref"] == 3
        assert citation["section_ref"] is None
        assert citation["text_preview"] == row.content
    finally:
        db.close()


def test_citation_for_a_chunk_spanning_a_page_boundary_cites_only_the_first_page() -> None:
    document = _seed_document(filename="spanning.txt")
    page_one_text = "Page one body text. " * 10  # ~210 chars: short, stays under half the target
    page_two_text = "Page two body text continues here. " * 60  # long enough to be spanned into
    drafts = chunk_text(
        [
            Segment(text=page_one_text, page_ref=1),
            Segment(text=page_two_text, page_ref=2),
        ]
    )
    assert len(drafts) >= 1

    first_draft = drafts[0]
    # The first chunk starts in page one but, because page one alone is
    # shorter than the breakpoint search window, its content spans into
    # page two's text.
    assert "Page one body" in first_draft.content
    assert "Page two body" in first_draft.content
    assert first_draft.page_ref == 1

    db = SessionLocal()
    try:
        [row, *_rest] = persist_chunks(db, document, drafts)

        citation = citation_from_chunk(row)

        assert citation["filename"] == "spanning.txt"
        assert citation["page_ref"] == 1  # only the first page is recorded
        assert citation["page_ref"] == row.page_ref
    finally:
        db.close()
