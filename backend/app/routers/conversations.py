"""Conversation list, create, detail and delete for the signed-in user
(US-023, US-025, US-022-1).

Every route here is scoped to the signed-in caller (via `current_user`):
listing, reading or deleting a conversation that belongs to someone else is
indistinguishable from one that does not exist at all -- a 404, never a
403, so a caller can never learn that a given id belongs to another
account. `GET /conversations/{id}` returns messages in creation order, each
with the numbered `Citation` rows it was persisted with (US-022-1,
AC-054), so a reload shows exactly the citations the original answer
carried. `DELETE /conversations/{id}` relies on the cascades declared on
`app/models.py`'s `Conversation`/`Message` relationships (`delete-orphan`)
to remove every message and citation underneath it in the same operation.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import current_user
from app.models import Conversation, User
from app.schemas import (
    ConversationCreateRequest,
    ConversationDetailOut,
    ConversationSummaryOut,
    MessageOut,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")


def _load_conversation_or_404(db: DBSession, user: User, conversation_id: str) -> Conversation:
    try:
        conversation_uuid = uuid.UUID(conversation_id)
    except ValueError as exc:
        raise _NOT_FOUND from exc

    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_uuid, Conversation.user_id == user.id)
        .first()
    )
    if conversation is None:
        raise _NOT_FOUND
    return conversation


@router.get("", response_model=list[ConversationSummaryOut])
async def list_conversations(
    db: DBSession = Depends(get_db),  # noqa: B008
    user: User = Depends(current_user),  # noqa: B008
) -> list[Conversation]:
    return (
        db.query(Conversation)
        .filter(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )


@router.post("", response_model=ConversationSummaryOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreateRequest,
    db: DBSession = Depends(get_db),  # noqa: B008
    user: User = Depends(current_user),  # noqa: B008
) -> Conversation:
    conversation = Conversation(user_id=user.id, title=payload.title)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.get("/{conversation_id}", response_model=ConversationDetailOut)
async def get_conversation(
    conversation_id: str,
    db: DBSession = Depends(get_db),  # noqa: B008
    user: User = Depends(current_user),  # noqa: B008
) -> ConversationDetailOut:
    conversation = _load_conversation_or_404(db, user, conversation_id)

    messages = sorted(conversation.messages, key=lambda message: message.created_at)
    message_outs = [
        MessageOut(
            id=message.id,
            role=message.role,
            content=message.content,
            from_documents=message.from_documents,
            citations=sorted(message.citations, key=lambda citation: citation.number),
            created_at=message.created_at,
        )
        for message in messages
    ]

    return ConversationDetailOut(
        id=conversation.id,
        title=conversation.title,
        messages=message_outs,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    db: DBSession = Depends(get_db),  # noqa: B008
    user: User = Depends(current_user),  # noqa: B008
) -> Response:
    conversation = _load_conversation_or_404(db, user, conversation_id)
    db.delete(conversation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
