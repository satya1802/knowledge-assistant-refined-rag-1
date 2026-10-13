"""The SSE chat endpoint.

Streaming token-by-token answers (sse-starlette), 0.62-threshold retrieval
and Groq generation are development-sprint work (US-022, US-024, US-042);
this stub only reserves the route and its request shape so a client can be
built against a stable path before the behaviour exists.
"""

from fastapi import APIRouter

from app.schemas import ChatRequest, StubResponse

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=StubResponse)
async def chat(payload: ChatRequest) -> StubResponse:
    return StubResponse(endpoint="POST /chat")
