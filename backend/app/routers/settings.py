"""Server-side settings: similarity threshold and answer model name (US-043)."""

from fastapi import APIRouter

from app.schemas import SettingsPatchRequest, StubResponse

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=StubResponse)
async def get_settings() -> StubResponse:
    return StubResponse(endpoint="GET /settings")


@router.patch("", response_model=StubResponse)
async def patch_settings(payload: SettingsPatchRequest) -> StubResponse:
    return StubResponse(endpoint="PATCH /settings")
