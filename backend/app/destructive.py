"""Shared guard for any endpoint that destroys data.

Every endpoint added to this service that deletes rows, drops a table or
removes a file must require an explicit, caller-supplied confirmation --
never fire off a destructive action because a GET, a bare DELETE with no
body, or an error handler happened to run (AC-096). Two ways to use this,
depending on how the endpoint takes its input:

    # Query-param-driven (e.g. DELETE with no body):
    @router.delete("/{id}")
    async def delete_thing(id: str, _confirmed: bool = Depends(require_confirmation)):
        ...

    # Body-driven (e.g. POST/PATCH):
    @router.post("/{id}/purge")
    async def purge_thing(id: str, payload: ConfirmationRequest):
        ensure_confirmed(payload)
        ...

Either way the caller must pass `confirm=true` (query string) or
`{"confirm": true}` (body) or the request is rejected with 400 before any
destructive code runs. No destructive handler in this codebase may invent
its own ad-hoc confirmation check instead of using one of these two.
"""

from fastapi import HTTPException, status
from pydantic import BaseModel

_NOT_CONFIRMED_QUERY = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="This action is destructive; pass confirm=true to proceed.",
)

_NOT_CONFIRMED_BODY = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="This action is destructive; set confirm: true in the request body.",
)


class ConfirmationRequest(BaseModel):
    """Body shape for a destructive POST/PATCH: `confirm` defaults to False
    so an omitted field never accidentally confirms anything."""

    confirm: bool = False


def require_confirmation(confirm: bool = False) -> bool:
    """FastAPI dependency for a destructive endpoint driven by a query
    parameter (typically DELETE): raises 400 unless `confirm=true` is
    explicitly passed. Returns True so it can also be read as a value."""
    if confirm is not True:
        raise _NOT_CONFIRMED_QUERY
    return True


def ensure_confirmed(payload: ConfirmationRequest) -> None:
    """Call from a destructive handler that takes a `ConfirmationRequest`
    body: raises 400 unless `payload.confirm` is True."""
    if payload.confirm is not True:
        raise _NOT_CONFIRMED_BODY
