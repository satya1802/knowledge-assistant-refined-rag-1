"""US-042-1: POST /chat's structured error contract and the no-write
guarantee on a generation failure.

AC-061: a Groq quota-exhausted or auth error on POST /chat surfaces as a
documented, non-ambiguous 503 with a `{code, message}` body -- never a bare
500, never a hang.
AC-062: a transient provider failure is retried a bounded number of times
before the same structured error reaches the caller -- the request itself
still returns promptly (no real sleep) rather than looping forever.
AC-063: whichever way generation fails, no conversation, message, document
or chunk row is created, deleted or modified by the call.

`app.generation.get_generation_client` is monkeypatched to a fake client
so no real Groq call is ever made; `generate_answer` picks it up through
its normal `client or get_generation_client()` call path, exactly as it
does against the real server-side client.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

import app.generation as generation_module
from app.database import Base, SessionLocal, engine
from app.generation import GenerationAuthError, GenerationProviderError, GenerationQuotaError
from app.main import app
from app.models import Chunk, Conversation, Document, Message, User
from app.security import hash_password

_PASSWORD = "ChatGenSeedPass123!"


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_user_and_signed_in_client() -> TestClient:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(
            email=_unique_email("chatgen"),
            password_hash=hash_password(_PASSWORD),
            role="user",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        email = user.email
    finally:
        db.close()

    client = TestClient(app)
    login = client.post("/auth/login", json={"email": email, "password": _PASSWORD})
    assert login.status_code == 200
    return client


def _row_counts() -> dict:
    db = SessionLocal()
    try:
        return {
            "conversations": db.query(Conversation).count(),
            "messages": db.query(Message).count(),
            "documents": db.query(Document).count(),
            "chunks": db.query(Chunk).count(),
        }
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    """Retries must not actually slow this test down (AC-062)."""
    monkeypatch.setattr(generation_module.time, "sleep", lambda _seconds: None)


class _AuthFailsClient:
    def __init__(self):
        self.attempts = 0

    def generate(self, question, context):
        self.attempts += 1
        raise GenerationAuthError("Groq rejected the request: invalid credentials.")


class _QuotaFailsClient:
    def __init__(self):
        self.attempts = 0

    def generate(self, question, context):
        self.attempts += 1
        raise GenerationQuotaError("Groq reports quota/usage exhausted.")


class _AlwaysProviderFailsClient:
    def __init__(self):
        self.attempts = 0

    def generate(self, question, context):
        self.attempts += 1
        raise GenerationProviderError("Groq was unreachable.")


def _chat_payload() -> dict:
    return {"conversation_id": str(uuid.uuid4()), "question": "What does the policy say?"}


# --------------------------------------------------------------------- #
# AC-061: auth/quota surfaces as a documented 503, no retry, no hang
# --------------------------------------------------------------------- #


def test_auth_error_surfaces_as_a_structured_503_on_the_first_attempt(monkeypatch) -> None:
    fake_client = _AuthFailsClient()
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_client)
    client = _seed_user_and_signed_in_client()

    response = client.post("/chat", json=_chat_payload())

    assert response.status_code == 503
    body = response.json()["detail"]
    assert body["code"] == "groq_auth_error"
    assert body["message"]
    assert fake_client.attempts == 1  # never retried


def test_quota_error_surfaces_as_a_structured_503_on_the_first_attempt(monkeypatch) -> None:
    fake_client = _QuotaFailsClient()
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_client)
    client = _seed_user_and_signed_in_client()

    response = client.post("/chat", json=_chat_payload())

    assert response.status_code == 503
    body = response.json()["detail"]
    assert body["code"] == "groq_quota_exceeded"
    assert body["message"]
    assert fake_client.attempts == 1  # never retried


# --------------------------------------------------------------------- #
# AC-062: transient failure is retried a bounded number of times
# --------------------------------------------------------------------- #


def test_persistent_transient_failure_retries_a_bounded_number_of_times_then_surfaces(
    monkeypatch,
) -> None:
    fake_client = _AlwaysProviderFailsClient()
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_client)
    from app.generation import generation_max_retries

    client = _seed_user_and_signed_in_client()

    response = client.post("/chat", json=_chat_payload())

    assert response.status_code == 503
    body = response.json()["detail"]
    assert body["code"] == "groq_unavailable"
    # Bounded: exactly the configured ceiling, never an endless loop.
    assert fake_client.attempts == generation_max_retries()


# --------------------------------------------------------------------- #
# AC-063: no row is created, deleted or modified on any failure path
# --------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "fake_client_factory",
    [_AuthFailsClient, _QuotaFailsClient, _AlwaysProviderFailsClient],
)
def test_a_generation_failure_of_any_kind_leaves_every_row_untouched(
    monkeypatch, fake_client_factory
) -> None:
    fake_client = fake_client_factory()
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: fake_client)
    client = _seed_user_and_signed_in_client()

    before = _row_counts()
    response = client.post("/chat", json=_chat_payload())
    after = _row_counts()

    assert response.status_code == 503
    assert after == before


def test_chat_requires_an_authenticated_session() -> None:
    client = TestClient(app)  # no login

    response = client.post("/chat", json=_chat_payload())

    assert response.status_code == 401
