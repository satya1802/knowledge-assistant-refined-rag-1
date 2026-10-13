"""Server-side application settings: provider/model names and the one secret.

`settings` is the single source of truth for which AI provider and which
answer/embedding models this deployment uses -- all three are read from the
environment at construction time (`AI_PROVIDER`, `ANSWER_MODEL`,
`EMBEDDING_MODEL`), each with a sane default, so an operator changes them by
setting an env var and restarting, never by editing code (AC-099).

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
"""

import os
from dataclasses import dataclass, field


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


@dataclass(frozen=True)
class Settings:
    """Public fields (`ai_provider`, `answer_model`, `embedding_model`) are
    safe to log, return in a response or show in an admin screen.
    `groq_api_key` is not -- see the module docstring."""

    ai_provider: str = field(default_factory=lambda: _env("AI_PROVIDER", "groq"))
    answer_model: str = field(
        default_factory=lambda: _env("ANSWER_MODEL", "llama-3.1-8b-instant")
    )
    embedding_model: str = field(
        default_factory=lambda: _env("EMBEDDING_MODEL", "nomic-embed-text-v1.5")
    )
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
            "groq_api_key='***'"
            ")"
        )

    __str__ = __repr__


settings = Settings()
