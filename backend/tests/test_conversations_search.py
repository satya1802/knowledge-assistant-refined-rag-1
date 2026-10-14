"""US-030-1/US-030-3: GET /conversations?q= search (AC-073, AC-074).

Covers:
* `q` matching a conversation's title, case-insensitively.
* `q` matching a message's content (not the title), case-insensitively.
* a `q` that matches nothing returns an empty list, not a 404 and not the
  unfiltered list.
* an absent `q` returns the caller's full list, unchanged.
* another user's matching conversation is never returned, regardless of
  whether the match is title or content.

Conversations are created through the real POST /conversations endpoint so
the title path goes through the same contract the app uses; message
content is seeded directly against the ORM (same technique as
tests/test_conversation_privacy.py) since no test here needs the
generation/embedding seam.
"""

import uuid

from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Message, User
from app.security import hash_password

_PASSWORD = "ConvSearchSeedPass123!"


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_user(email: str) -> User:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(email=email, password_hash=hash_password(_PASSWORD), role="user")
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _signed_in_client(email: str) -> TestClient:
    client = TestClient(app)
    response = client.post("/auth/login", json={"email": email, "password": _PASSWORD})
    assert response.status_code == 200
    return client


def _create_conversation(client: TestClient, title: str) -> str:
    response = client.post("/conversations", json={"title": title})
    assert response.status_code == 201
    return response.json()["id"]


def _seed_message(conversation_id: str, *, role: str, content: str) -> None:
    db = SessionLocal()
    try:
        db.add(Message(conversation_id=uuid.UUID(conversation_id), role=role, content=content))
        db.commit()
    finally:
        db.close()


def _search(client: TestClient, q: str | None = None):
    if q is None:
        return client.get("/conversations")
    return client.get("/conversations", params={"q": q})


# --------------------------------------------------------------------- #
# Title match (AC-073)
# --------------------------------------------------------------------- #


def test_q_matches_title_case_insensitively_and_scoped_to_the_caller() -> None:
    owner = _seed_user(_unique_email("convsearch-title-owner"))
    other = _seed_user(_unique_email("convsearch-title-other"))
    owner_client = _signed_in_client(owner.email)
    other_client = _signed_in_client(other.email)

    vacation_id = _create_conversation(owner_client, "Vacation Policy Questions")
    budget_id = _create_conversation(owner_client, "Budget Report Review")
    _create_conversation(other_client, "Vacation photos from the team offsite")

    response = _search(owner_client, "VACATION")

    assert response.status_code == 200
    ids = [row["id"] for row in response.json()]
    assert ids == [vacation_id]
    assert budget_id not in ids


# --------------------------------------------------------------------- #
# Message content match (AC-073)
# --------------------------------------------------------------------- #


def test_q_matches_message_content_case_insensitively_even_when_title_does_not_match() -> None:
    owner = _seed_user(_unique_email("convsearch-content-owner"))
    other = _seed_user(_unique_email("convsearch-content-other"))
    owner_client = _signed_in_client(owner.email)
    other_client = _signed_in_client(other.email)

    matching_id = _create_conversation(owner_client, "General questions")
    _seed_message(matching_id, role="user", content="What is the REFUND window for orders?")
    non_matching_id = _create_conversation(owner_client, "Unrelated thread")
    _seed_message(non_matching_id, role="user", content="How do I reset my password?")

    other_matching_id = _create_conversation(other_client, "Other user's thread")
    _seed_message(other_matching_id, role="user", content="refund policy details please")

    response = _search(owner_client, "refund")

    assert response.status_code == 200
    ids = [row["id"] for row in response.json()]
    assert ids == [matching_id]
    assert non_matching_id not in ids
    assert other_matching_id not in ids


# --------------------------------------------------------------------- #
# Non-matching q (AC-074)
# --------------------------------------------------------------------- #


def test_non_matching_q_returns_an_empty_list() -> None:
    owner = _seed_user(_unique_email("convsearch-nomatch"))
    owner_client = _signed_in_client(owner.email)
    _create_conversation(owner_client, "Anything at all")

    response = _search(owner_client, "nothing-will-ever-match-this-zzz")

    assert response.status_code == 200
    assert response.json() == []


# --------------------------------------------------------------------- #
# Absent q returns full list
# --------------------------------------------------------------------- #


def test_absent_q_returns_the_full_list() -> None:
    owner = _seed_user(_unique_email("convsearch-absent"))
    owner_client = _signed_in_client(owner.email)
    first_id = _create_conversation(owner_client, "First conversation")
    second_id = _create_conversation(owner_client, "Second conversation")

    response = _search(owner_client, None)

    assert response.status_code == 200
    ids = {row["id"] for row in response.json()}
    assert ids == {first_id, second_id}


def test_blank_q_also_returns_the_full_list() -> None:
    owner = _seed_user(_unique_email("convsearch-blank"))
    owner_client = _signed_in_client(owner.email)
    first_id = _create_conversation(owner_client, "First conversation")

    response = _search(owner_client, "   ")

    assert response.status_code == 200
    ids = {row["id"] for row in response.json()}
    assert first_id in ids


# --------------------------------------------------------------------- #
# Isolation: another user's matching conversation is never returned
# --------------------------------------------------------------------- #


def test_another_users_matching_conversation_is_never_returned() -> None:
    owner = _seed_user(_unique_email("convsearch-isolation-owner"))
    other = _seed_user(_unique_email("convsearch-isolation-other"))
    owner_client = _signed_in_client(owner.email)
    other_client = _signed_in_client(other.email)

    _create_conversation(owner_client, "Owner thread, no overlap")
    other_id = _create_conversation(other_client, "Shared Keyword Thread")
    _seed_message(other_id, role="user", content="shared keyword in content too")

    response = _search(owner_client, "shared keyword")

    assert response.status_code == 200
    assert response.json() == []

    # Sanity: the other user's own search does find it.
    other_response = _search(other_client, "shared keyword")
    assert other_response.status_code == 200
    assert [row["id"] for row in other_response.json()] == [other_id]


def test_search_requires_an_authenticated_session() -> None:
    client = TestClient(app)  # no login

    response = client.get("/conversations", params={"q": "anything"})

    assert response.status_code == 401
