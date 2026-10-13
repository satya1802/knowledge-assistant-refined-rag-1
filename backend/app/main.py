"""Application entrypoint.

Generated from the approved architecture: one router per resource domain in
the `api` component, one route per endpoint the API spec declares. Every
generated route except `/health` is a stub that returns a typed placeholder,
so the service starts, serves its OpenAPI document and passes its tests
before a single handler is implemented.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401 -- imported so the tables register before create_all
from app.database import Base, engine
from app.routers import account, auth, chat, conversations, documents, settings, users
from app.services import configured_services

app = FastAPI(
    title="Knowledge Assistant - Refined RAG",
    # Wrapped across lines rather than one very long literal so this stays
    # inside the 100-column limit backend/ruff.toml enforces; the words
    # themselves are the approved project brief, unchanged.
    description=(
        "Knowledge Assistant - Refined RAG MVP Page 1 Knowledge Assistant Refined "
        "Enterprise RAG Chatbot - MVP Build Specification AI Provider Google Gemini "
        "only Primary Data Source Uploaded Knowledge Base Fallback Gemini general "
        "knowledge only when Knowledge Base has no relevant match Persistence "
        "Documents, users, chat history, messages and settings persist across "
        "reloads/restarts Reference Stack FastAPI + React/TypeScript + SQLite "
        "locally / PostgreSQL + pgvector production Core rule: Knowledge Base "
        "first. Gemini general-knowledge fallback second. Reloading the application "
        "must never erase chat history, uploaded documents, users, or saved "
        "application data."
    ),
    version="0.1.0",
)

# The SPA runs on a different origin than the API, so the browser refuses its calls
# unless that origin is allowed here. In development that is the Vite dev server; when
# deployed, the platform injects the frontend's real URL as ALLOWED_ORIGINS (comma
# separated). Point ALLOWED_ORIGINS at the real thing and nothing else has to change.
_dev_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins or _dev_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The scaffold ships no migrations, so the tables are created from the models on
# startup. Replace this with Alembic before anything holds data worth keeping.
Base.metadata.create_all(bind=engine)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(account.router)
app.include_router(documents.router)
app.include_router(conversations.router)
app.include_router(chat.router)
app.include_router(settings.router)


@app.get("/health")
async def health() -> dict[str, object]:
    """Liveness probe, and the only route here that is not a stub."""
    return {"status": "ok", "services": configured_services()}
