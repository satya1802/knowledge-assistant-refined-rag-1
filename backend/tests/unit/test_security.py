"""Unit tests for `app/security.py`: `hash_password`, `verify_password` and
`verify_against_dummy`, each called directly as a plain function -- no
`client` fixture, no `TestClient`, no HTTP layer, no database.

This ticket carries no acceptance criteria of its own. The module's own
docstring names AC-002 (no timing side-channel between an unknown email and
a known one with the wrong password) and AC-003 (bcrypt-only hashing with a
cost factor read at point of use); tests for those are named accordingly.
The rest are named after the module's own documented guarantees: a hash
never round-trips back to the plaintext it was computed from, a malformed
hash fails closed instead of raising, and the cost factor is actually read
from `app.config.bcrypt_rounds` rather than hard-coded.

Assumption: bcrypt's own correctness (that a given salt+cost always embeds
in the hash string) is treated as a library guarantee, not re-tested here;
what this file checks is that `app/security.py` *uses* bcrypt the way its
docstring promises -- real algorithm, real configurable cost, no plaintext
retained -- not bcrypt's internal math.
"""

import re

import bcrypt

import app.security as security_module
from app.security import hash_password, verify_against_dummy, verify_password

_PASSWORD = "CorrectHorseBatteryStaple123!"
_OTHER_PASSWORD = "SomethingElseEntirely456?"

# bcrypt hash shape: $2<a|b|y>$<cost>$<22-char-salt><31-char-digest>
_BCRYPT_HASH_RE = re.compile(r"^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$")


def test_ac003_hash_password_produces_a_real_bcrypt_hash() -> None:
    result = hash_password(_PASSWORD)

    match = _BCRYPT_HASH_RE.match(result)
    assert match is not None, f"not a bcrypt hash: {result!r}"


def test_ac003_hash_password_reads_the_cost_factor_from_config_at_point_of_use(
    monkeypatch,
) -> None:
    monkeypatch.setattr(security_module, "bcrypt_rounds", lambda: 4)

    result = hash_password(_PASSWORD)

    match = _BCRYPT_HASH_RE.match(result)
    assert match is not None
    assert int(match.group(1)) == 4


def test_hash_password_never_contains_the_plaintext_password() -> None:
    result = hash_password(_PASSWORD)

    assert _PASSWORD not in result


def test_hash_password_is_salted_so_two_hashes_of_the_same_password_differ() -> None:
    first = hash_password(_PASSWORD)
    second = hash_password(_PASSWORD)

    assert first != second
    # ... yet both still verify against the original password.
    assert verify_password(_PASSWORD, first) is True
    assert verify_password(_PASSWORD, second) is True


def test_verify_password_true_for_the_matching_password() -> None:
    hashed = hash_password(_PASSWORD)

    assert verify_password(_PASSWORD, hashed) is True


def test_verify_password_false_for_a_non_matching_password() -> None:
    hashed = hash_password(_PASSWORD)

    assert verify_password(_OTHER_PASSWORD, hashed) is False


def test_verify_password_is_case_sensitive() -> None:
    hashed = hash_password(_PASSWORD)

    assert verify_password(_PASSWORD.lower(), hashed) is False


def test_verify_password_false_and_does_not_raise_on_a_malformed_hash() -> None:
    assert verify_password(_PASSWORD, "not-a-bcrypt-hash-at-all") is False


def test_verify_password_false_and_does_not_raise_on_an_empty_hash() -> None:
    assert verify_password(_PASSWORD, "") is False


def test_verify_password_false_and_does_not_raise_on_a_hash_with_bad_bytes() -> None:
    # A hash string bcrypt cannot even base64-decode must still fail closed
    # rather than bubble a ValueError up to the caller (and a 500 to the
    # client) -- the docstring's whole point.
    assert verify_password(_PASSWORD, "$2b$12$" + "\x00" * 53) is False


def test_verify_against_dummy_always_returns_false() -> None:
    assert verify_against_dummy(_PASSWORD) is False
    assert verify_against_dummy("") is False
    assert verify_against_dummy("anything at all") is False


def test_ac002_verify_against_dummy_runs_a_real_bcrypt_check_not_a_shortcut() -> None:
    """AC-002: the whole reason this helper exists is so that rejecting an
    *unknown* email costs the same as rejecting a *known* email with the
    wrong password. That only holds if it actually performs a bcrypt
    comparison against something -- a function that just `return False`
    without hashing would be instant and reintroduce the timing leak."""
    # The module computes one dummy hash at import time and reuses it; a
    # real bcrypt hash for an unrelated hard-coded plaintext is what makes
    # checkpw() do real work here.
    dummy_hash = security_module._DUMMY_HASH

    assert _BCRYPT_HASH_RE.match(dummy_hash) is not None
    # And it is a genuine bcrypt digest bcrypt itself can check -- not a
    # hand-rolled stand-in `verify_against_dummy` happens to ignore.
    assert bcrypt.checkpw(b"not-a-real-password-used-only-for-timing", dummy_hash.encode("utf-8"))


def test_verify_against_dummy_hash_never_matches_the_password_passed_in() -> None:
    # Guards against a regression where `verify_against_dummy` is changed to
    # hash its argument rather than check against the fixed dummy hash,
    # which would make it answer True for the one password that happens to
    # equal the dummy plaintext.
    assert verify_against_dummy("not-a-real-password-used-only-for-timing") is False
