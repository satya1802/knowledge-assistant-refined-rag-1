"""User administration endpoints: list, create and enable/disable/promote.

Admin-only once session auth exists (US-002, US-003, US-004); this stub
reserves the three routes and their request shapes only.
"""

from fastapi import APIRouter

from app.schemas import CreateUserRequest, PatchUserRequest, StubResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[StubResponse])
async def list_users() -> list[StubResponse]:
    return [StubResponse(endpoint="GET /users")]


@router.post("", response_model=StubResponse)
async def create_user(payload: CreateUserRequest) -> StubResponse:
    return StubResponse(endpoint="POST /users")


@router.patch("/{user_id}", response_model=StubResponse)
async def patch_user(user_id: str, payload: PatchUserRequest) -> StubResponse:
    return StubResponse(endpoint="PATCH /users/{id}")
