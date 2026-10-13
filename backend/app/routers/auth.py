"""Auth endpoints: sign-in, sign-out and the current session.

Generated from the approved API spec. Every handler below is a stub that
returns a typed placeholder (see `app.main`) -- session issuance, lockout
and cookie handling (US-001, US-005, US-037) are development-sprint work.
"""

from fastapi import APIRouter, Response

from app.schemas import LoginRequest, StubResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=StubResponse)
async def login(payload: LoginRequest) -> StubResponse:
    return StubResponse(endpoint="POST /auth/login")


@router.post("/logout", status_code=204)
async def logout() -> Response:
    return Response(status_code=204)


@router.get("/me", response_model=StubResponse)
async def me() -> StubResponse:
    return StubResponse(endpoint="GET /auth/me")
