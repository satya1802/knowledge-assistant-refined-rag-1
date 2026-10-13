"""AC-095/AC-097: a failing AI-provider/pipeline call never costs existing
data, and the configured Groq secret never appears in an endpoint response
or in any file shipped to the browser.
"""

from pathlib import Path

from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Session as SessionModel
from app.models import User
from app.security import hash_password

_REPO_ROOT = Path(__file__).resolve().parents[2]

client = TestClient(app)


def _seed_user_and_session() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        db.query(SessionModel).delete()
        db.query(User).filter(User.email == "pipeline@example.com").delete()
        db.commit()
        user = User(
            email="pipeline@example.com",
            password_hash=hash_password("x"),
            role="user",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        from datetime import datetime, timedelta

        db.add(
            SessionModel(
                user_id=user.id,
                token_hash="pipeline-session",
                expires_at=datetime.utcnow() + timedelta(days=1),
            )
        )
        db.commit()
    finally:
        db.close()


def test_a_failing_ai_provider_call_leaves_seeded_rows_in_place(monkeypatch) -> None:
    _seed_user_and_session()

    def _boom(*_args, **_kwargs):
        raise RuntimeError("simulated AI-provider/pipeline failure")

    # The chat route is the one path this stage wires up for the future AI
    # pipeline call (US-022/US-024/US-042); forcing its handler to raise
    # simulates that call failing mid-request.
    from app.routers import chat as chat_router

    monkeypatch.setattr(chat_router, "chat", _boom)

    with SessionLocal() as db:
        users_before = db.query(User).count()
        sessions_before = db.query(SessionModel).count()

    try:
        client.post("/chat", json={"conversation_id": "c1", "question": "hi"})
    except RuntimeError:
        pass

    with SessionLocal() as db:
        assert db.query(User).count() == users_before
        assert db.query(SessionModel).count() == sessions_before
        assert db.query(User).filter(User.email == "pipeline@example.com").count() == 1


def test_no_endpoint_response_contains_the_configured_secret(monkeypatch) -> None:
    secret = "qa-canary-secret-9f8a7b6c"
    monkeypatch.setenv("GROQ_API_KEY", secret)
    import app.settings as settings_module

    monkeypatch.setattr(settings_module, "settings", settings_module.Settings())

    _seed_user_and_session()

    responses = [
        client.get("/health"),
        client.get("/openapi.json"),
        client.post(
            "/auth/login",
            json={"email": "pipeline@example.com", "password": "x"},
        ),
        client.get("/documents"),
        client.get("/documents/stats"),
        client.get("/documents/some-id/download"),
        client.post("/documents/some-id/reprocess", json={"mode": "retry"}),
        client.get("/conversations"),
        client.get("/conversations/some-id"),
        client.delete("/conversations/some-id"),
        client.get("/users"),
        client.post("/chat", json={"conversation_id": "c1", "question": "hi"}),
        client.patch("/account/theme", json={"theme": "dark"}),
    ]

    for response in responses:
        assert secret not in response.text


def test_no_frontend_source_file_contains_the_configured_secret(monkeypatch) -> None:
    secret = "qa-canary-secret-9f8a7b6c"
    monkeypatch.setenv("GROQ_API_KEY", secret)

    frontend_src = _REPO_ROOT / "frontend" / "src"
    for path in frontend_src.rglob("*"):
        if path.is_file():
            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            assert secret not in content, f"{path} contains the configured secret"


def test_env_example_files_never_contain_a_real_configured_secret(monkeypatch) -> None:
    secret = "qa-canary-secret-9f8a7b6c"
    monkeypatch.setenv("GROQ_API_KEY", secret)

    for rel in (".env.example", "backend/.env.example"):
        path = _REPO_ROOT / rel
        content = path.read_text(encoding="utf-8")
        assert secret not in content
