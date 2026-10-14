"""The chat endpoint: retrieval-then-generation-then-persist (US-021-1 /
US-042-1 / US-022-1).

Streaming token-by-token answers (sse-starlette) remain development-sprint
work (US-024). What is real as of this slice is retrieval
(AC-049/AC-050/AC-156): every call here goes straight to
`app/retrieval.py`'s `retrieve_relevant_chunks`, which embeds the question
and runs the cosine-similarity search over indexed chunks at the in-force
threshold, before `generate_answer` (the real Groq-backed generation seam,
US-042-1) is ever called. There is no other code path into chunk search and
no way to call `generate_answer` without `retrieve_relevant_chunks` having
already run first in the same request -- retrieval cannot be skipped.

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
this caller), the assistant message's `from_documents` flag mirrors whether
retrieval found anything (AC-052/AC-058), and one `Citation` row is written
per cited chunk, numbered 1..n consecutively and consistently with the
`[n]` markers the generation prompt instructs the model to use (AC-053).
A `from_documents=false` answer persists zero `Citation` rows (AC-059).
"""

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


def _parse_conversation_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="conversation_id must be a valid UUID.",
        ) from exc


def _get_or_create_conversation(
    db: DBSession, user: User, conversation_id: uuid.UUID, question: str
) -> Conversation:
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if conversation is not None and conversation.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conversation is None:
        conversation = Conversation(
            id=conversation_id,
            user_id=user.id,
            title=question[:_TITLE_MAX_LENGTH],
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
    return conversation


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    db: DBSession = Depends(get_db),  # noqa: B008
    user: User = Depends(current_user),  # noqa: B008
) -> ChatResponse:
    conversation_uuid = _parse_conversation_id(payload.conversation_id)

    # AC-049/AC-156/AC-060: a fresh retrieval for this question's own text,
    # every time -- it always runs, even against an empty knowledge base or
    # an unrelated question, and nothing from a previous turn is read or
    # reused here.
    retrieved = retrieve_relevant_chunks(db, payload.question)

    try:
        # AC-052: when retrieval found chunks at/above the in-force
        # threshold, only those chunks are passed as context here.
        answer = generate_answer(payload.question, retrieved)
    except GenerationError as exc:
        # AC-061/AC-062/AC-063: a clear, immediate, documented error --
        # never a hang, never an unbounded retry, and nothing has been
        # written to the database on this path.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    from_documents = bool(retrieved)

    conversation = _get_or_create_conversation(db, user, conversation_uuid, payload.question)

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
