"""Password hashing (AC-003): bcrypt only, cost factor read at point of use.

No endpoint or log statement in this project ever holds a plaintext password
or a hash past the moment it is checked -- that discipline is enforced by
callers (see `app/routers/auth.py`), this module only does the hashing.
"""

import bcrypt

from app.config import bcrypt_rounds


def hash_password(password: str) -> str:
    """Bcrypt-hash `password`, never storing or returning the plaintext."""
    salt = bcrypt.gensalt(rounds=bcrypt_rounds())
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """True when `password` matches `password_hash`; never raises on a
    malformed hash so a corrupt row fails closed rather than 500s."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# A hash computed once at import time so the "unknown email" branch of login
# can still run a bcrypt check against *something* -- otherwise a known email
# with a wrong password takes measurably longer than an unknown email, which
# is exactly the timing side-channel AC-002 forbids.
_DUMMY_HASH = hash_password("not-a-real-password-used-only-for-timing")


def verify_against_dummy(password: str) -> bool:
    """Always returns False; spends the same time as a real check (AC-002)."""
    return verify_password(password, _DUMMY_HASH)
