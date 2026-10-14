"""Server-side settings: similarity threshold and answer model name
(US-021-1 / US-043).

Backed by `app/settings_store.py`, which reads/writes rows in the
`app_settings` table -- no in-process cache, so a value `PATCH /settings`
just wrote is exactly what the very next `GET /settings` (or the next
`POST /chat`, through `app/retrieval.py`) sees (AC-051). `PATCH /settings`
is admin-only (401 unauthenticated, 403 signed-in non-admin, via
`require_admin`); an out-of-range `similarity_threshold` is rejected with
422 by `SettingsPatchRequest`'s own field validation, before this handler
ever runs.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import current_user, require_admin
from app.models import User
from app.schemas import SettingsOut, SettingsPatchRequest
from app.settings_store import (
    get_settings_snapshot,
    set_answer_model,
    set_similarity_threshold,
)

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
async def get_settings(
    db: DBSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(current_user),  # noqa: B008
) -> SettingsOut:
    return SettingsOut(**get_settings_snapshot(db))


@router.patch("", response_model=SettingsOut)
async def patch_settings(
    payload: SettingsPatchRequest,
    db: DBSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(require_admin),  # noqa: B008
) -> SettingsOut:
    if payload.similarity_threshold is not None:
        set_similarity_threshold(db, payload.similarity_threshold)
    if payload.answer_model is not None:
        set_answer_model(db, payload.answer_model)
    return SettingsOut(**get_settings_snapshot(db))
