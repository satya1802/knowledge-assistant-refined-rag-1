"""app/destructive.py: no destructive action without an explicit,
caller-supplied confirmation (AC-096)."""

import pytest
from fastapi import HTTPException

from app.destructive import ConfirmationRequest, ensure_confirmed, require_confirmation


def test_require_confirmation_rejects_when_confirm_is_omitted() -> None:
    with pytest.raises(HTTPException) as exc:
        require_confirmation()

    assert exc.value.status_code == 400


def test_require_confirmation_rejects_an_explicit_false() -> None:
    with pytest.raises(HTTPException):
        require_confirmation(confirm=False)


def test_require_confirmation_allows_an_explicit_true() -> None:
    assert require_confirmation(confirm=True) is True


def test_ensure_confirmed_rejects_the_default_body() -> None:
    with pytest.raises(HTTPException) as exc:
        ensure_confirmed(ConfirmationRequest())

    assert exc.value.status_code == 400


def test_ensure_confirmed_allows_a_confirmed_body() -> None:
    ensure_confirmed(ConfirmationRequest(confirm=True))
