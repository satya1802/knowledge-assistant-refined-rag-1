"""The signed-in user's own password and theme preference (US-037, US-038)."""

from fastapi import APIRouter, Response

from app.schemas import ChangePasswordRequest, StubResponse, ThemeRequest

router = APIRouter(prefix="/account", tags=["account"])


@router.post("/password", status_code=204)
async def change_password(payload: ChangePasswordRequest) -> Response:
    return Response(status_code=204)


@router.patch("/theme", response_model=StubResponse)
async def set_theme(payload: ThemeRequest) -> StubResponse:
    return StubResponse(endpoint="PATCH /account/theme")
