"""US-029: chat history stays private to the signed-in user (AC-075, AC-076).

`tests/test_chat_rag.py::test_conversations_list_detail_and_delete_are_scoped_to_the_owning_user`
already proves a single stranger gets a 404 (never 403) on someone else's
single conversation. This module reaches past that for what it does not:

AC-075: with *two* users who each hold *more than one* conversation, each
user's `GET /conversations` returns exactly their own set -- not merely "is
missing the other one sample id", but the precise set, in both directions.

AC-076: a conversation holding real message content is refused by ID to
*both* an unrelated user and an administrator alike -- the ticket calls the
administrator case out by name, and `app/deps.require_admin` is not even on
this router's dependency graph, so nothing here would catch role silently
leaking owner access if the router were ever changed to use it. The refusal
body is asserted to carry none of that content, not just a non-200 status.

This module also proves `POST /chat` refuses a `conversation_id` the
caller does not own (same 404-never-403 contract as the other routes) and,
critically, writes no `Message` row to that conversation at all -- not an
empty-string row, not a row under the wrong user, nothing.

Messages are seeded directly against the ORM (as
`tests/test_chat_history.py` does for its startup-persistence row) because
no test here needs the retrieval/generation seam for the list/detail/delete
checks -- only real, sensitive-looking message content to prove it cannot
leak. The POST /chat test does need that seam (it is a real request through
the real router) so it stubs embedding and generation exactly as
`tests/test_chat_rag.py` and `tests/test_chat_generation_errors.py` do --
no real network call, no real Groq key, here either.
"""

import uuid

from fastapi.testclient import TestClient

import app.generation as generation_module
import app.retrieval as retrieval_module
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Conversation, Message, User
from app.security import hash_password

_PASSWORD = "ConversationPrivacySeedPass123!"


def _unique_email(label: str) -> str:
    return f"{label}-{uuid.uuid4().hex[:10]}@example.com"


def _seed_user(email: str, *, role: str = "user") -> User:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(email=email, password_hash=hash_password(_PASSWORD), role=role)
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


def _message_count(conversation_id: str) -> int:
    db = SessionLocal()
    try:
        return (
            db.query(Message).filter(Message.conversation_id == uuid.UUID(conversation_id)).count()
        )
    finally:
        db.close()


def _message_contents(conversation_id: str) -> list[str]:
    db = SessionLocal()
    try:
        return [
            m.content
            for m in db.query(Message)
            .filter(Message.conversation_id == uuid.UUID(conversation_id))
            .all()
        ]
    finally:
        db.close()


class _FakeEmbeddingProvider:
    def embed(self, texts):
        return [[0.01] * 768 for _ in texts]


class _FakeGenerationClient:
    def generate(self, question, context):
        return "Fake generated answer."


# --------------------------------------------------------------------- #
# AC-075
# --------------------------------------------------------------------- #


def test_each_signed_in_user_lists_exactly_their_own_conversations_and_none_of_the_others() -> None:
    user_a = _seed_user(_unique_email("privacy-user-a"))
    user_b = _seed_user(_unique_email("privacy-user-b"))
    client_a = _signed_in_client(user_a.email)
    client_b = _signed_in_client(user_b.email)

    a_ids = {
        _create_conversation(client_a, "A's first conversation"),
        _create_conversation(client_a, "A's second conversation"),
    }
    b_ids = {
        _create_conversation(client_b, "B's first conversation"),
        _create_conversation(client_b, "B's second conversation"),
        _create_conversation(client_b, "B's third conversation"),
    }

    a_response = client_a.get("/conversations")
    b_response = client_b.get("/conversations")
    assert a_response.status_code == 200
    assert b_response.status_code == 200

    a_listed = {row["id"] for row in a_response.json()}
    b_listed = {row["id"] for row in b_response.json()}

    # Exactly their own set -- neither a superset leaking the other user's
    # rows nor a subset accidentally missing one of their own.
    assert a_listed == a_ids
    assert b_listed == b_ids
    assert a_listed.isdisjoint(b_ids)
    assert b_listed.isdisjoint(a_ids)


# --------------------------------------------------------------------- #
# AC-076
# --------------------------------------------------------------------- #


def test_conversation_belonging_to_another_user_is_refused_with_no_content_leaked() -> None:
    owner = _seed_user(_unique_email("privacy-owner"))
    stranger = _seed_user(_unique_email("privacy-stranger"))
    admin = _seed_user(_unique_email("privacy-admin"), role="admin")

    owner_client = _signed_in_client(owner.email)
    stranger_client = _signed_in_client(stranger.email)
    admin_client = _signed_in_client(admin.email)

    conversation_id = _create_conversation(owner_client, "Owner's private conversation")
    secret_question = "What is our unreleased product's internal codename?"
    secret_answer = "The internal codename is Project Nightjar."
    _seed_message(conversation_id, role="user", content=secret_question)
    _seed_message(conversation_id, role="assistant", content=secret_answer)

    for label, client in [("a stranger", stranger_client), ("an administrator", admin_client)]:
        response = client.get(f"/conversations/{conversation_id}")
        # Refused outright, and specifically as a 404 indistinguishable from
        # a nonexistent id -- never a 403, which would itself confirm to the
        # caller that this conversation id exists and belongs to someone.
        assert response.status_code == 404, f"{label} must be refused this conversation"
        body_text = response.text
        assert secret_question not in body_text, f"{label}'s refusal must not carry message content"
        assert secret_answer not in body_text, f"{label}'s refusal must not carry message content"

    # The refusal is about ownership, not a broken conversation: the owner
    # themselves still reads every bit of it.
    owner_response = owner_client.get(f"/conversations/{conversation_id}")
    assert owner_response.status_code == 200
    owner_contents = [message["content"] for message in owner_response.json()["messages"]]
    assert secret_question in owner_contents
    assert secret_answer in owner_contents


def test_an_administrator_cannot_list_another_users_conversation_either() -> None:
    """AC-076 names the administrator explicitly; this confirms the
    exclusion holds for `GET /conversations` too, not only the by-id
    route -- an admin's own listing must never include a row that belongs
    to someone else."""
    owner = _seed_user(_unique_email("privacy-list-owner"))
    admin = _seed_user(_unique_email("privacy-list-admin"), role="admin")
    owner_client = _signed_in_client(owner.email)
    admin_client = _signed_in_client(admin.email)

    owned_id = _create_conversation(owner_client, "Owner's own, admin-invisible conversation")

    admin_listing = admin_client.get("/conversations")
    assert admin_listing.status_code == 200
    assert owned_id not in [row["id"] for row in admin_listing.json()]


def test_conversation_belonging_to_another_user_cannot_be_deleted() -> None:
    """AC-076: DELETE /conversations/{id} on another user's conversation is
    refused (404, never 403) and the record -- and its message content --
    still exists, both in the database directly and via the owner's own
    subsequent read, afterwards."""
    owner = _seed_user(_unique_email("privacy-delete-owner"))
    stranger = _seed_user(_unique_email("privacy-delete-stranger"))
    owner_client = _signed_in_client(owner.email)
    stranger_client = _signed_in_client(stranger.email)

    conversation_id = _create_conversation(
        owner_client, "Owner's conversation, not deletable by a stranger"
    )
    _seed_message(conversation_id, role="user", content="Do not delete me.")

    delete_response = stranger_client.delete(f"/conversations/{conversation_id}")
    assert delete_response.status_code == 404

    db = SessionLocal()
    try:
        still_there = (
            db.query(Conversation).filter(Conversation.id == uuid.UUID(conversation_id)).first()
        )
        assert still_there is not None
    finally:
        db.close()
    assert _message_count(conversation_id) == 1

    owner_detail = owner_client.get(f"/conversations/{conversation_id}")
    assert owner_detail.status_code == 200


def test_post_chat_with_another_users_conversation_id_is_refused_and_writes_no_message(
    monkeypatch,
) -> None:
    """POST /chat with a `conversation_id` the caller does not own is
    refused with the same 404-never-403 contract as the other routes, and
    writes no `Message` row to that conversation at all -- not an empty
    row, not a row under the wrong user, nothing."""
    owner = _seed_user(_unique_email("privacy-chat-owner"))
    stranger = _seed_user(_unique_email("privacy-chat-stranger"))
    owner_client = _signed_in_client(owner.email)
    stranger_client = _signed_in_client(stranger.email)

    conversation_id = _create_conversation(owner_client, "Owner's conversation")
    _seed_message(conversation_id, role="user", content="Owner's own first question.")

    before_count = _message_count(conversation_id)

    monkeypatch.setattr(
        retrieval_module, "get_embedding_provider", lambda: _FakeEmbeddingProvider()
    )
    monkeypatch.setattr(generation_module, "get_generation_client", lambda: _FakeGenerationClient())

    response = stranger_client.post(
        "/chat",
        json={"conversation_id": conversation_id, "question": "Sneaky attempt to hijack."},
    )

    assert response.status_code == 404

    assert _message_count(conversation_id) == before_count
    assert "Sneaky attempt to hijack." not in _message_contents(conversation_id)
