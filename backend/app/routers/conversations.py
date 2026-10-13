"""Conversation list, detail and delete for the signed-in user (US-023, US-025)."""

from fastapi import APIRouter, Response

from app.schemas import ConversationCreateRequest, StubResponse

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[StubResponse])
async def list_conversations(q: str | None = None) -> list[StubResponse]:
    return [StubResponse(endpoint="GET /conversations")]


@router.post("", response_model=StubResponse)
async def create_conversation(payload: ConversationCreateRequest) -> StubResponse:
    return StubResponse(endpoint="POST /conversations")


@router.get("/{conversation_id}", response_model=StubResponse)
async def get_conversation(conversation_id: str) -> StubResponse:
    return StubResponse(endpoint="GET /conversations/{id}")


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str) -> Response:
    return Response(status_code=204)
