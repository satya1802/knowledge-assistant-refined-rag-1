"""Unit tests for `app/routers/users.py`: the `list_users`, `create_user`
and `patch_user` coroutines, each called directly as a plain
coroutine/function against a real `User`/`Session` row -- no `client`
fixture, no `TestClient`, no HTTP layer. (`backend/tests/test_user_provisioning.py`
already drives this router end-to-end through `TestClient` for AC-011
through AC-014; this file covers the handlers' own logic the same way
`tests/unit/test_auth.py` and `tests/unit/test_conversations.py` cover
their routers.)

This ticket carries no acceptance criteria of its own. Where a behaviour the
module's docstring names with an AC (AC-009, AC-010, AC-011, AC-014), the
test is named after it; the rest are named after the module's own
documented guarantees.

Async handlers are run with `asyncio.run`, exactly as `tests/unit/test_auth.py`
and `tests/unit/test_conversations.py` run theirs. `create_user` takes a
real `fastapi.Request` (it reads the session cookie through `current_user`
once the bootstrap window has closed), built the same way
`tests/unit/test_deps.py`'s `_request` helper builds one.
"""

import asyncio
import uuid

import pytest
from fastapi import HTTPException, Request

from app.auth_session import COOKIE_NAME, create_session
from app.database import Base, SessionLocal, engine
from app.models import Session as SessionModel
from app.models import User
from app.routers.users import create_user, list_users, patch_user
from app.schemas import CreateUserRequest, PatchUserRequest
from app.security import hash_password, verify_password

_PASSWORD = "SeedPass123!"


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        # This module seeds rows directly against the shared sqlite file
        # tests/conftest.py points at (same technique as
        # tests/unit/test_conversations.py); clean up after itself so an
        # empty-table assertion in another test in this file (or a later
        # module) does not see rows this module left behind.
        session.query(SessionModel).filter(
            SessionModel.user_id.in_(session.query(User.id).filter(User.email.like("users-unit-%")))
        ).delete(synchronize_session=False)
        session.query(User).filter(User.email.like("users-unit-%")).delete(
            synchronize_session=False
        )
        session.commit()
        session.close()


def _unique_email(label: str) -> str:
    return f"users-unit-{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_user(db, email: str, *, role: str = "user", is_active: bool = True) -> User:
    user = User(
        email=email,
        password_hash=hash_password(_PASSWORD),
        role=role,
        is_active=is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _request(cookie: str | None) -> Request:
    headers = []
    if cookie is not None:
        headers.append((b"cookie", f"{COOKIE_NAME}={cookie}".encode()))
    scope = {"type": "http", "method": "POST", "path": "/users", "headers": headers}
    return Request(scope)


def _request_for(db, user: User) -> Request:
    token, _session = create_session(db, user.id)
    return _request(token)


def _clear_all_users(db) -> None:
    """Empties the table so `create_user` takes its bootstrap branch, the
    same way an actually-empty database would -- this module's own fixture
    only scrubs rows it itself seeded, so an earlier module's rows (this
    whole suite shares one sqlite file, per `tests/conftest.py`) must be
    cleared explicitly for the "table is empty" tests to mean anything."""
    db.query(SessionModel).delete(synchronize_session=False)
    db.query(User).delete(synchronize_session=False)
    db.commit()


# --------------------------------------------------------------------- #
# list_users
# --------------------------------------------------------------------- #


def test_list_users_returns_every_user_ordered_by_created_at(db) -> None:
    admin = _seed_user(db, _unique_email("list-admin"), role="admin")
    first = _seed_user(db, _unique_email("list-first"))
    second = _seed_user(db, _unique_email("list-second"))

    result = asyncio.run(list_users(db=db, _admin=admin))

    ids = [u.id for u in result]
    assert ids.index(first.id) < ids.index(second.id)
    assert admin.id in ids


def test_list_users_never_includes_a_password_field(db) -> None:
    admin = _seed_user(db, _unique_email("list-nopw-admin"), role="admin")
    _seed_user(db, _unique_email("list-nopw-user"))

    result = asyncio.run(list_users(db=db, _admin=admin))

    for user in result:
        assert not hasattr(user, "temporary_password")
    # The ORM row itself still carries password_hash -- the schema layer
    # (app/schemas.py's UserListOut) is what strips it before serialization,
    # not this function; this test documents that list_users hands back raw
    # rows and relies on the response_model to do the stripping.
    assert all(hasattr(u, "password_hash") for u in result)


# --------------------------------------------------------------------- #
# create_user -- AC-009 / AC-010: the bootstrap window
# --------------------------------------------------------------------- #


def test_ac009_create_user_against_an_empty_table_creates_the_first_account_as_admin(db) -> None:
    _clear_all_users(db)
    payload = CreateUserRequest(email=_unique_email("bootstrap"), password="BootstrapPass123!")

    result = asyncio.run(create_user(payload, _request(None), db=db))

    assert result.role == "admin"
    assert result.is_active is True
    stored = db.query(User).filter(User.id == result.id).one()
    assert stored.role == "admin"


def test_ac010_create_user_request_schema_has_no_role_field_to_supply(db) -> None:
    """AC-010: there is nothing a caller can put in the request body to pick
    a role -- `CreateUserRequest` simply has no such field."""
    payload = CreateUserRequest(email=_unique_email("norole"), password="NoRolePass123!")

    assert not hasattr(payload, "role")


def test_create_user_against_an_empty_table_ignores_an_unauthenticated_request(db) -> None:
    """The bootstrap branch never calls `current_user`, so a request with no
    session cookie at all still succeeds while the table is empty."""
    _clear_all_users(db)
    payload = CreateUserRequest(email=_unique_email("bootstrap-anon"), password="AnonPass123!")

    result = asyncio.run(create_user(payload, _request(None), db=db))

    assert result.role == "admin"


def test_create_user_lowercases_the_supplied_email(db) -> None:
    _clear_all_users(db)
    mixed_case = _unique_email("MixedCase").replace("users-unit", "USERS-UNIT", 1)
    payload = CreateUserRequest(email=mixed_case, password="MixedCasePass123!")

    result = asyncio.run(create_user(payload, _request(None), db=db))

    assert result.email == mixed_case.lower()
    stored = db.query(User).filter(User.id == result.id).one()
    assert stored.email == mixed_case.lower()


# --------------------------------------------------------------------- #
# create_user -- AC-011: the temporary password
# --------------------------------------------------------------------- #


def test_ac011_create_user_response_carries_the_supplied_password_once(db) -> None:
    _clear_all_users(db)
    plain_password = "ExactlyWhatTheCallerSupplied123!"
    payload = CreateUserRequest(email=_unique_email("temp-pw"), password=plain_password)

    result = asyncio.run(create_user(payload, _request(None), db=db))

    assert result.temporary_password == plain_password
    # The response has no other field that could leak the hash.
    dumped = result.model_dump()
    assert "password_hash" not in dumped
    assert "password" not in dumped
    # And it was actually hashed, not stored in the clear.
    stored = db.query(User).filter(User.id == result.id).one()
    assert stored.password_hash != plain_password
    assert verify_password(plain_password, stored.password_hash)


# --------------------------------------------------------------------- #
# create_user -- once the table is non-empty: authentication required
# --------------------------------------------------------------------- #


def test_create_user_once_a_user_exists_rejects_a_request_with_no_session_cookie(db) -> None:
    _seed_user(db, _unique_email("gate-existing"), role="admin")
    payload = CreateUserRequest(email=_unique_email("gate-anon"), password="GateAnonPass123!")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(create_user(payload, _request(None), db=db))

    assert exc_info.value.status_code == 401


def test_create_user_once_a_user_exists_rejects_a_non_admin_caller_with_403(db) -> None:
    _seed_user(db, _unique_email("gate-admin"), role="admin")
    standard = _seed_user(db, _unique_email("gate-standard"), role="user")
    request = _request_for(db, standard)
    payload = CreateUserRequest(email=_unique_email("gate-blocked"), password="BlockedPass123!")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(create_user(payload, request, db=db))

    assert exc_info.value.status_code == 403
    assert db.query(User).filter(User.email == payload.email.lower()).first() is None


def test_create_user_once_a_user_exists_an_admin_caller_creates_a_plain_user_account(db) -> None:
    admin = _seed_user(db, _unique_email("gate-ok-admin"), role="admin")
    request = _request_for(db, admin)
    payload = CreateUserRequest(email=_unique_email("gate-ok-new"), password="GateOkPass123!")

    result = asyncio.run(create_user(payload, request, db=db))

    assert result.role == "user"
    stored = db.query(User).filter(User.id == result.id).one()
    assert stored.role == "user"


def test_create_user_duplicate_email_is_rejected_with_409_and_creates_no_row(db) -> None:
    admin = _seed_user(db, _unique_email("dup-admin"), role="admin")
    existing_email = _unique_email("dup-existing")
    _seed_user(db, existing_email)
    request = _request_for(db, admin)
    payload = CreateUserRequest(email=existing_email, password="WouldBeIgnoredPass123!")

    before_count = db.query(User.id).filter(User.email == existing_email).count()
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(create_user(payload, request, db=db))

    assert exc_info.value.status_code == 409
    assert db.query(User.id).filter(User.email == existing_email).count() == before_count == 1


def test_create_user_duplicate_email_check_is_case_insensitive(db) -> None:
    admin = _seed_user(db, _unique_email("dup-ci-admin"), role="admin")
    existing_email = _unique_email("dup-ci-existing")
    _seed_user(db, existing_email)
    request = _request_for(db, admin)
    shouting_case = existing_email.upper()
    payload = CreateUserRequest(email=shouting_case, password="StillIgnoredPass123!")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(create_user(payload, request, db=db))

    assert exc_info.value.status_code == 409


# --------------------------------------------------------------------- #
# patch_user
# --------------------------------------------------------------------- #


def test_patch_user_raises_404_for_a_non_uuid_id(db) -> None:
    admin = _seed_user(db, _unique_email("patch-badid-admin"), role="admin")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            patch_user("not-a-uuid-at-all", PatchUserRequest(is_active=False), db=db, _admin=admin)
        )

    assert exc_info.value.status_code == 404


def test_patch_user_raises_404_for_an_id_nobody_uses(db) -> None:
    admin = _seed_user(db, _unique_email("patch-noone-admin"), role="admin")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            patch_user(str(uuid.uuid4()), PatchUserRequest(is_active=False), db=db, _admin=admin)
        )

    assert exc_info.value.status_code == 404


def test_patch_user_updates_only_the_fields_supplied(db) -> None:
    admin = _seed_user(db, _unique_email("patch-partial-admin"), role="admin")
    target = _seed_user(db, _unique_email("patch-partial-target"), role="user", is_active=True)
    original_hash = target.password_hash

    result = asyncio.run(
        patch_user(str(target.id), PatchUserRequest(is_active=False), db=db, _admin=admin)
    )

    assert result.is_active is False
    assert result.role == "user"
    assert result.password_hash == original_hash


def test_patch_user_updating_the_password_replaces_the_hash_and_old_password_stops_matching(
    db,
) -> None:
    admin = _seed_user(db, _unique_email("patch-pw-admin"), role="admin")
    target = _seed_user(db, _unique_email("patch-pw-target"))
    original_hash = target.password_hash
    new_password = "BrandNewPatchedPass123!"

    result = asyncio.run(
        patch_user(str(target.id), PatchUserRequest(password=new_password), db=db, _admin=admin)
    )

    assert result.password_hash != original_hash
    assert verify_password(new_password, result.password_hash)
    assert not verify_password(_PASSWORD, result.password_hash)


def test_ac013_patch_user_granting_admin_updates_the_row_immediately(db) -> None:
    admin = _seed_user(db, _unique_email("patch-role-admin"), role="admin")
    target = _seed_user(db, _unique_email("patch-role-target"), role="user")

    result = asyncio.run(
        patch_user(str(target.id), PatchUserRequest(role="admin"), db=db, _admin=admin)
    )

    assert result.role == "admin"
    reloaded = db.query(User).filter(User.id == target.id).one()
    assert reloaded.role == "admin"


def test_patch_user_with_no_fields_set_leaves_the_row_unchanged(db) -> None:
    admin = _seed_user(db, _unique_email("patch-noop-admin"), role="admin")
    target = _seed_user(db, _unique_email("patch-noop-target"), role="user", is_active=True)
    original_hash = target.password_hash

    result = asyncio.run(patch_user(str(target.id), PatchUserRequest(), db=db, _admin=admin))

    assert result.role == "user"
    assert result.is_active is True
    assert result.password_hash == original_hash
