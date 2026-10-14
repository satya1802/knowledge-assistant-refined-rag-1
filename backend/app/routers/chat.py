"""The chat endpoint: retrieval-then-generation-then-persist (US-021-1 /
US-042-1 / US-022-1 / US-025-1).

Streaming token-by-token answers (sse-starlette) remain development-sprint
work (US-024). What is real as of this slice is retrieval
(AC-049/AC-050/AC-156): every call here goes straight to
`app/retrieval.py`'s `retrieve_relevant_chunks`, which embeds the question
and runs the cosine-similarity search over indexed chunks at the in-force
threshold, before `generate_answer` (the real Groq-backed generation seam,
US-042-1) is ever called. There is no other code path into chunk search and
no way to call `generate_answer` without `retrieve_relevant_chunks` having
already run first in the same request -- retrieval cannot be skipped, and
it always runs against the follow-up's own question text, never a previous
turn's (AC-065).

Context across turns (US-025-1, AC-065): `generate_answer`'s only
caller-supplied signal besides the retrieved chunks is its `question`
string (`app/generation.py` is read-only to this change -- no new
parameter was added there). So when `conversation_id` already names a
conversation this caller owns, its already-persisted turns -- bounded to
the most recent `_max_prior_turns()` turns (`CHAT_MAX_PRIOR_TURNS`, read at
point of use) so an arbitrarily long conversation can never grow the
generation prompt without limit -- are rendered as a short transcript and
prepended to the follow-up's own question before it is handed to
`generate_answer`. Retrieval is never given this composite text: it always
searches on `payload.question` alone, fresh, every call.

A generation failure -- Groq unauthenticated, out of quota, or
unavailable after `app/generation.py`'s bounded retries -- never reaches
the client as a bare, ambiguous 500: it is turned into a structured
`{code, message}` body (contract) at a documented, non-ambiguous status
(503) the chat UI can render inline. Nothing is written to the database on
either path, so a generation failure leaves every conversation, message,
document, chunk and vector exactly as it was before the call (AC-063) --
every write below happens only after `generate_answer` has already
returned successfully.

Once generation succeeds, the user's question and the assistant's answer
are persisted as `Message` rows on the conversation named by
`conversation_id` (created on first use if it does not already exist for
this caller, AC-064), the assistant message's `from_documents` flag
mirrors whether retrieval found anything (AC-052/AC-058), and one
`Citation` row is written per cited chunk, numbered 1..n consecutively and
consistently with the `[n]` markers the generation prompt instructs the
model to use (AC-053). A `from_documents=false` answer persists zero
`Citation` rows (AC-059). The handler does no blocking work of its own
beyond these database reads/writes and the retrieval/generation calls
(AC-066) -- no extra network call, no extra provider round trip.
"""

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.chunking import citation_from_chunk
from app.database import get_db
from app.deps import current_user
from app.generation import GenerationError, generate_answer
from app.models import Citation, Conversation, Message, User
from app.retrieval import retrieve_relevant_chunks
from app.schemas import ChatRequest, ChatResponse, CitationOut

router = APIRouter(tags=["chat"])

_TITLE_MAX_LENGTH = 80
_DEFAULT_MAX_PRIOR_TURNS = 5


def _max_prior_turns() -> int:
    """Bounded number of prior user/assistant turns folded into a
    follow-up's generation prompt (AC-065). Read at point of use, same
    pattern as `app/chunking.py`/`app/embedding.py`, so an operator can
    tune it via `CHAT_MAX_PRIOR_TURNS` without a code change."""
    raw = os.getenv("CHAT_MAX_PRIOR_TURNS")
    if not raw:
        return _DEFAULT_MAX_PRIOR_TURNS
    try:
        value = int(raw)
    except ValueError:
        return _DEFAULT_MAX_PRIOR_TURNS
    return value if value > 0 else _DEFAULT_MAX_PRIOR_TURNS


def _parse_conversation_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="conversation_id must be a valid UUID.",
        ) from exc


def _find_conversation(
    db: DBSession, user: User, conversation_id: uuid.UUID
) -> Conversation | None:
    """The existing conversation named by `conversation_id`, or None when it
    does not exist yet. Raises 404 when it exists but belongs to someone
    else, so a caller can never learn that a given id belongs to another
    account."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if conversation is not None and conversation.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


def _create_conversation(
    db: DBSession, user: User, conversation_id: uuid.UUID, question: str
) -> Conversation:
    """Creates and persists a brand-new conversation for this caller
    (AC-064): a `conversation_id` that does not exist yet is never an
    error, it is the normal way a conversation is born."""
    conversation = Conversation(
        id=conversation_id,
        user_id=user.id,
        title=question[:_TITLE_MAX_LENGTH],
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def _prior_context_text(conversation: Conversation | None) -> str:
    """A short transcript of `conversation`'s already-persisted turns,
    most-recent-first bound applied, oldest-first in the rendered text (the
    natural reading order). Empty when there is no existing conversation or
    it has no messages yet -- a brand-new conversation never fabricates
    context."""
    if conversation is None or not conversation.messages:
        return ""

    messages = sorted(conversation.messages, key=lambda message: message.created_at)
    # AC-065: bounded so a long conversation cannot grow the prompt without
    # limit. A "turn" here is one user or assistant message; two messages
    # (question + answer) per round trip.
    limit = _max_prior_turns() * 2
    recent = messages[-limit:] if limit else messages

    lines = []
    for message in recent:
        speaker = "User" if message.role == "user" else "Assistant"
        lines.append(f"{speaker}: {message.content}")
    return "\n".join(lines)


def _build_generation_question(conversation: Conversation | None, question: str) -> str:
    """The text handed to `generate_answer` as its `question` argument:
    the follow-up's own question, optionally preceded by a bounded prior
    transcript (AC-065). Retrieval is never given this composite text --
    only `question` itself, unchanged, is ever embedded and searched."""
    prior_text = _prior_context_text(conversation)
    if not prior_text:
        return question
    return (
        "Earlier turns of this conversation (most recent, for context only):\n"
        f"{prior_text}\n\n"
        f"Follow-up question: {question}"
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    db: DBSession = Depends(get_db),  # noqa: B008
    user: User = Depends(current_user),  # noqa: B008
) -> ChatResponse:
    conversation_uuid = _parse_conversation_id(payload.conversation_id)

    # AC-064/404-isolation: resolved once, up front, so both the prior-turn
    # context below and the persistence step after generation see the same
    # conversation (or the same "does not exist yet" fact).
    existing_conversation = _find_conversation(db, user, conversation_uuid)

    # AC-049/AC-156/AC-060/AC-065: a fresh retrieval for this question's own
    # text, every time -- it always runs, even against an empty knowledge
    # base, an unrelated question, or a follow-up in an existing
    # conversation, and nothing from a previous turn is read or reused here.
    retrieved = retrieve_relevant_chunks(db, payload.question)

    # AC-065: prior turns (if any), bounded, folded into the text handed to
    # generation -- never into retrieval.
    generation_question = _build_generation_question(existing_conversation, payload.question)

    try:
        # AC-052: when retrieval found chunks at/above the in-force
        # threshold, only those chunks are passed as context here.
        answer = generate_answer(generation_question, retrieved)
    except GenerationError as exc:
        # AC-061/AC-062/AC-063: a clear, immediate, documented error --
        # never a hang, never an unbounded retry, and nothing has been
        # written to the database on this path.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    from_documents = bool(retrieved)

    conversation = existing_conversation or _create_conversation(
        db, user, conversation_uuid, payload.question
    )

    db.add(Message(conversation_id=conversation.id, role="user", content=payload.question))

    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
        from_documents=from_documents,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    # Touches updated_at so GET /conversations sorts this one to the front.
    conversation.updated_at = assistant_message.created_at
    db.add(conversation)
    db.commit()

    citations: list[CitationOut] = []
    for index, item in enumerate(retrieved, start=1):
        meta = citation_from_chunk(item.chunk)
        citation = Citation(
            message_id=assistant_message.id,
            chunk_id=item.chunk.id,
            document_id=item.chunk.document_id,
            number=index,
            filename=meta["filename"],
            page_ref=meta["page_ref"],
            section_ref=meta["section_ref"],
            text_preview=meta["text_preview"],
        )
        db.add(citation)
        citations.append(
            CitationOut(
                number=index,
                document_id=item.chunk.document_id,
                chunk_id=item.chunk.id,
                filename=meta["filename"],
                page_ref=meta["page_ref"],
                section_ref=meta["section_ref"],
                text_preview=meta["text_preview"],
                score=item.score,
            )
        )
    if citations:
        db.commit()

    return ChatResponse(
        conversation_id=str(conversation.id),
        answer=answer,
        from_documents=from_documents,
        citations=citations,
    )
