"""The chat endpoint: retrieval-then-generation (US-021-1).

Streaming token-by-token answers (sse-starlette) and real Groq generation
remain development-sprint work (US-022, US-024, US-042) -- `answer` below
is `app/generation.py`'s stub placeholder. What is real as of this slice is
retrieval (AC-049/AC-050/AC-156): every call here goes straight to
`app/retrieval.py`'s `retrieve_relevant_chunks`, which embeds the question
and runs the cosine-similarity search over indexed chunks at the in-force
threshold, before `generate_answer` (the generation seam) is ever called.
There is no other code path into chunk search and no way to call
`generate_answer` without `retrieve_relevant_chunks` having already run
first in the same request -- retrieval cannot be skipped.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.chunking import citation_from_chunk
from app.database import get_db
from app.deps import current_user
from app.generation import generate_answer
from app.models import User
from app.retrieval import retrieve_relevant_chunks
from app.schemas import ChatRequest, ChatResponse, CitationOut

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    db: DBSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(current_user),  # noqa: B008
) -> ChatResponse:
    # AC-049/AC-156: a fresh retrieval for this question's own text, every
    # time -- nothing from a previous turn is read or reused here.
    retrieved = retrieve_relevant_chunks(db, payload.question)

    citations = [
        CitationOut(
            number=index + 1,
            document_id=item.chunk.document_id,
            chunk_id=item.chunk.id,
            score=item.score,
            **{
                key: value
                for key, value in citation_from_chunk(item.chunk).items()
                if key not in ("document_id", "chunk_id")
            },
        )
        for index, item in enumerate(retrieved)
    ]

    answer = generate_answer(payload.question, retrieved)

    return ChatResponse(
        conversation_id=payload.conversation_id,
        answer=answer,
        from_documents=bool(citations),
        citations=citations,
    )
