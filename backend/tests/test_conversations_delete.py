"""US-030-2/US-030-3: DELETE /conversations/{id} (AC-077, AC-078, AC-079).

Covers:
* a successful delete removes the conversation, its messages and its
  citations from the database (via the cascade declared in app/models.py).
* a fresh GET /conversations and GET /conversations/{id}, from a brand new
  session for the same user, reflect the deletion.
* every other conversation belonging to that user is untouched.
* deleting a conversation owned by another user returns 404 and deletes
  nothing.

A message's citation is seeded exactly as tests/test_chat_rag.py seeds one
(through `persist_chunks` for the chunk, then a `Citation` row directly)
so the cascade this test asserts on is exercised for real, not just an
empty conversation.
"""

import uuid

from fastapi.testclient import TestClient

from app.chunking import ChunkDraft, persist_chunks
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Citation, Conversation, Document, Message, User
from app.security import hash_password

_PASSWORD = "ConvDeleteSeedPass123!"


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


def _seed_conversation_with_message_and_citation(owner: User, title: str) -> dict:
    """Seeds a conversation with one message and one citation (backed by a
    real document/chunk) directly against the ORM, returning every id this
    module's assertions need."""
    db = SessionLocal()
    try:
        conversation = Conversation(user_id=owner.id, title=title)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

        document = Document(
            filename="convdelete.txt",
            file_type="txt",
            size_bytes=1,
            s3_key=f"documents/fake/{uuid.uuid4().hex}.txt",
            status="ready",
            uploaded_by=owner.id,
        )
        db.add(document)
        db.commit()
        db.refresh(document)

        [chunk] = persist_chunks(
            db, document, [ChunkDraft(index=0, content="Some chunk content.", page_ref=1)]
        )

        message = Message(
            conversation_id=conversation.id,
            role="assistant",
            content="Here is the answer. [1]",
            from_documents=True,
        )
        db.add(message)
        db.commit()
        db.refresh(message)

        citation = Citation(
            message_id=message.id,
            chunk_id=chunk.id,
            document_id=document.id,
            number=1,
            filename=document.filename,
            page_ref=1,
        )
        db.add(citation)
        db.commit()
        db.refresh(citation)

        return {
            "conversation_id": str(conversation.id),
            "message_id": str(message.id),
            "citation_id": str(citation.id),
        }
    finally:
        db.close()


def _row_exists(model, row_id: str) -> bool:
    db = SessionLocal()
    try:
        return db.query(model).filter(model.id == uuid.UUID(row_id)).first() is not None
    finally:
        db.close()


# --------------------------------------------------------------------- #
# AC-078 / AC-079: successful delete removes everything underneath it
# --------------------------------------------------------------------- #


def test_delete_removes_conversation_messages_and_citations_from_the_database() -> None:
    owner = _seed_user(_unique_email("convdelete-owner"))
    client = _signed_in_client(owner.email)
    ids = _seed_conversation_with_message_and_citation(owner, "Conversation to delete")

    response = client.delete(f"/conversations/{ids['conversation_id']}")

    assert response.status_code == 204
    assert not _row_exists(Conversation, ids["conversation_id"])
    assert not _row_exists(Message, ids["message_id"])
    assert not _row_exists(Citation, ids["citation_id"])


def test_a_fresh_session_sees_the_deletion_in_both_list_and_detail() -> None:
    owner = _seed_user(_unique_email("convdelete-freshsession"))
    client = _signed_in_client(owner.email)
    ids = _seed_conversation_with_message_and_citation(owner, "Deleted elsewhere")
    survivor_id = _create_conversation(client, "Should survive")

    delete_response = client.delete(f"/conversations/{ids['conversation_id']}")
    assert delete_response.status_code == 204

    # A brand new session (new TestClient, fresh login) for the same user.
    new_session_client = _signed_in_client(owner.email)

    list_response = new_session_client.get("/conversations")
    assert list_response.status_code == 200
    listed_ids = [row["id"] for row in list_response.json()]
    assert ids["conversation_id"] not in listed_ids
    assert survivor_id in listed_ids

    detail_response = new_session_client.get(f"/conversations/{ids['conversation_id']}")
    assert detail_response.status_code == 404


def test_other_conversations_of_the_same_user_are_untouched_by_a_delete() -> None:
    owner = _seed_user(_unique_email("convdelete-untouched"))
    client = _signed_in_client(owner.email)
    to_delete = _create_conversation(client, "Delete me")
    keep_one = _create_conversation(client, "Keep me one")
    keep_two = _create_conversation(client, "Keep me two")

    response = client.delete(f"/conversations/{to_delete}")
    assert response.status_code == 204

    listing = client.get("/conversations")
    assert listing.status_code == 200
    remaining_ids = {row["id"] for row in listing.json()}
    assert remaining_ids == {keep_one, keep_two}

    assert client.get(f"/conversations/{keep_one}").status_code == 200
    assert client.get(f"/conversations/{keep_two}").status_code == 200


# --------------------------------------------------------------------- #
# Another user's conversation: 404, deletes nothing
# --------------------------------------------------------------------- #


def test_deleting_another_users_conversation_returns_404_and_deletes_nothing() -> None:
    owner = _seed_user(_unique_email("convdelete-other-owner"))
    stranger = _seed_user(_unique_email("convdelete-other-stranger"))
    stranger_client = _signed_in_client(stranger.email)
    ids = _seed_conversation_with_message_and_citation(owner, "Not the stranger's to delete")

    response = stranger_client.delete(f"/conversations/{ids['conversation_id']}")

    assert response.status_code == 404
    assert _row_exists(Conversation, ids["conversation_id"])
    assert _row_exists(Message, ids["message_id"])
    assert _row_exists(Citation, ids["citation_id"])


def test_delete_requires_an_authenticated_session() -> None:
    client = TestClient(app)  # no login

    response = client.delete(f"/conversations/{uuid.uuid4()}")

    assert response.status_code == 401


def test_deleting_a_nonexistent_conversation_returns_404() -> None:
    owner = _seed_user(_unique_email("convdelete-missing"))
    client = _signed_in_client(owner.email)

    response = client.delete(f"/conversations/{uuid.uuid4()}")

    assert response.status_code == 404


def test_deleting_an_already_deleted_conversation_returns_404_on_the_second_attempt() -> None:
    owner = _seed_user(_unique_email("convdelete-twice"))
    client = _signed_in_client(owner.email)
    conversation_id = _create_conversation(client, "Delete twice")

    first = client.delete(f"/conversations/{conversation_id}")
    second = client.delete(f"/conversations/{conversation_id}")

    assert first.status_code == 204
    assert second.status_code == 404
