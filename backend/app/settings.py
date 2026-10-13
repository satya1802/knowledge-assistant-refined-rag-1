"""Server-side application settings: provider/model names and the one secret.

`settings` is the single source of truth for which AI provider and which
answer/embedding models this deployment uses -- all are read from the
environment at construction time (`AI_PROVIDER`, `ANSWER_MODEL`,
`EMBEDDING_MODEL`, `EMBEDDING_PROVIDER`, `EMBEDDING_DIM`), each with a sane
default, so an operator changes them by setting an env var and restarting,
never by editing code (AC-099, AC-155).

`GROQ_API_KEY` lives here too, but it is not a public setting: it is read
once from the environment and handed to server-side callers only (the Groq
client construction, nowhere else). No router, schema or template may read
`os.environ["GROQ_API_KEY"]` directly or put `settings.groq_api_key` into a
response body, cookie, header or template context -- that is the one rule
this module exists to make easy to follow, because every other module reads
the key through here or not at all (AC-097).

`repr()`/`str()` on a `Settings` instance print the key as '***' (AC-098):
`logging.info(settings)` or an uncaught exception that stringifies it in a
traceback never leaks the real value. Use `masked_groq_api_key` when you
need to show a caller the key is configured without showing what it is.

`embedding_provider` picks the `EmbeddingProvider` adapter `app/embedding.py`
constructs (AC-155); `embedding_dim` is the vector width every adapter must
produce (768, matching `Chunk.embedding`'s pgvector column) -- a provider
that cannot meet it is not swapped in by changing this number, it simply
fails its own point-of-use check in `app/embedding.py`.
"""

import os
from dataclasses import dataclass, field


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


@dataclass(frozen=True)
class Settings:
    """Public fields (`ai_provider`, `answer_model`, `embedding_model`,
    `embedding_provider`, `embedding_dim`) are safe to log, return in a
    response or show in an admin screen. `groq_api_key` is not -- see the
    module docstring."""

    ai_provider: str = field(default_factory=lambda: _env("AI_PROVIDER", "groq"))
    answer_model: str = field(default_factory=lambda: _env("ANSWER_MODEL", "llama-3.1-8b-instant"))
    embedding_model: str = field(
        default_factory=lambda: _env("EMBEDDING_MODEL", "nomic-embed-text-v1.5")
    )
    # AC-155: which EmbeddingProvider adapter app/embedding.py constructs.
    # "none" (the default) until the open decision in
    # backend/docs/decisions/0001-embedding-provider.md is signed off.
    embedding_provider: str = field(default_factory=lambda: _env("EMBEDDING_PROVIDER", "none"))
    # 768 to match Chunk.embedding's pgvector column (AC-044/AC-155).
    embedding_dim: int = field(default_factory=lambda: _int_env("EMBEDDING_DIM", 768))
    groq_api_key: str = field(default_factory=lambda: os.getenv("GROQ_API_KEY", ""), repr=False)

    @property
    def masked_groq_api_key(self) -> str:
        """'***' when a key is configured, '' when it is not -- for a status
        display that must never show the real value."""
        return "***" if self.groq_api_key else ""

    def __repr__(self) -> str:
        return (
            "Settings("
            f"ai_provider={self.ai_provider!r}, "
            f"answer_model={self.answer_model!r}, "
            f"embedding_model={self.embedding_model!r}, "
            f"embedding_provider={self.embedding_provider!r}, "
            f"embedding_dim={self.embedding_dim!r}, "
            "groq_api_key='***'"
            ")"
        )

    __str__ = __repr__


settings = Settings()
