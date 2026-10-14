"""The Groq-backed answer-generation seam (US-042-1).

`generate_answer` is the one function `app/routers/chat.py` calls after
retrieval (`app/retrieval.py`) has already run; it is never the seam that
decides whether document context exists -- it only turns a question plus
whatever `RetrievedChunk`s retrieval found into an answer string, or raises
a `GenerationError` the router turns into a structured `{code, message}`
response.

Errors are split into two kinds, mirroring `app/embedding.py`'s pattern
exactly:

* `GenerationAuthError` / `GenerationQuotaError` -- the provider has
  rejected the request outright (bad/missing credentials, or quota/usage
  exhausted). These are never retried (AC-061): the caller gets a clear,
  immediate, readable error rather than a hang or an open-ended wait.
* `GenerationProviderError` -- a transient rate-limit or network failure.
  `generate_answer` retries this up to `generation_max_retries()` total
  attempts with exponential backoff (`generation_backoff_base_seconds()`),
  both read at the point of use so an operator can tune them without a code
  change (AC-062). There is no unbounded retry loop anywhere in this
  module.

`get_generation_client()` builds the real client only when `GROQ_API_KEY`
is configured (read once, here, through `app/settings.py` -- never directly
from the environment and never logged); when it is not, a disabled client
reports that clearly as a non-retryable `GenerationAuthError`, following
`app/config.py`'s point-of-use pattern instead of crashing at import or
startup. The client itself is swapped out via dependency injection
(`generate_answer(..., client=...)`), so a test can supply a failing fake
that makes no network call -- the real Groq client is never exercised by a
test through this seam.

Generation never writes to the database: a failure here -- of any kind --
leaves every conversation, message, document, chunk and vector exactly as
it was before the call (AC-063). This module has no database session
parameter at all, by design.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Protocol

from app.retrieval import RetrievedChunk
from app.settings import settings


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def generation_max_retries() -> int:
    """Bounded retry count for a transient generation failure (AC-062).
    Defaults to 3 total attempts; set `GENERATION_MAX_RETRIES` to change
    it, at the point of use -- never hard-coded in `generate_answer`."""
    return _int_env("GENERATION_MAX_RETRIES", 3)


def generation_backoff_base_seconds() -> float:
    """Base delay for the exponential backoff between retries: attempt `n`
    (0-indexed) waits `base * 2**n` seconds. Defaults to 1.0 second; set
    `GENERATION_BACKOFF_BASE_SECONDS` to change it."""
    return _float_env("GENERATION_BACKOFF_BASE_SECONDS", 1.0)


class GenerationError(Exception):
    """Base for every error `generate_answer` can raise. Carries a `code`
    and a human-readable `message` -- exactly the shape the chat router's
    `{code, message}` error contract needs, so the router never has to
    translate an exception into that shape itself."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class GenerationAuthError(GenerationError):
    """The provider rejected the request as unauthenticated (missing or
    invalid credentials), or no `GROQ_API_KEY` is configured at all.
    Never retried (AC-061)."""

    def __init__(self, message: str):
        super().__init__("groq_auth_error", message)


class GenerationQuotaError(GenerationError):
    """The provider reports quota/usage exhausted. Never retried
    (AC-061)."""

    def __init__(self, message: str):
        super().__init__("groq_quota_exceeded", message)


class GenerationProviderError(GenerationError):
    """A transient rate-limit or network failure. Retried up to
    `generation_max_retries()` total attempts with backoff before being
    surfaced (AC-062)."""

    def __init__(self, message: str):
        super().__init__("groq_unavailable", message)


class GenerationClient(Protocol):
    """The one interface every generation adapter implements. `generate`
    takes the question and the retrieved context and must return an answer
    string, or raise a `GenerationError` subclass."""

    def generate(self, question: str, context: list[RetrievedChunk]) -> str: ...


@dataclass(frozen=True)
class _DisabledClient:
    """Reports itself disabled with a clear, key-free message instead of
    calling anything. Constructing one does no I/O and makes no network
    call -- safe to build at any time."""

    message: str

    def generate(self, question: str, context: list[RetrievedChunk]) -> str:
        raise GenerationAuthError(self.message)


def _format_context(context: list[RetrievedChunk]) -> str:
    if not context:
        return ""
    parts = []
    for index, item in enumerate(context, start=1):
        parts.append(f"[{index}] {item.chunk.content}")
    return "\n\n".join(parts)


class _GroqClient:
    """Thin adapter over the `groq` SDK. Classifies the SDK's own exception
    types into this module's `GenerationError` subclasses; never logs or
    returns the API key it was constructed with (it is only ever passed to
    the SDK's own client constructor)."""

    def __init__(self, api_key: str, model: str):
        self._api_key = api_key
        self._model = model

    def generate(self, question: str, context: list[RetrievedChunk]) -> str:
        import groq

        client = groq.Groq(api_key=self._api_key)
        context_text = _format_context(context)
        system_prompt = (
            "Answer the user's question using only the provided context when it "
            "is relevant. If the context has no relevant information, answer from "
            "general knowledge and say so."
        )
        user_prompt = (
            f"Context:\n{context_text}\n\nQuestion: {question}" if context_text else question
        )

        try:
            response = client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
        except groq.AuthenticationError as exc:
            raise GenerationAuthError("Groq rejected the request: invalid credentials.") from exc
        except groq.RateLimitError as exc:
            body = str(exc).lower()
            if "quota" in body or "insufficient" in body:
                raise GenerationQuotaError("Groq reports quota/usage exhausted.") from exc
            raise GenerationProviderError("Groq rate-limited the request.") from exc
        except (groq.APIConnectionError, groq.APITimeoutError) as exc:
            raise GenerationProviderError("Groq was unreachable.") from exc
        except groq.InternalServerError as exc:
            raise GenerationProviderError("Groq reported an internal error.") from exc
        except groq.APIStatusError as exc:
            status_code = getattr(exc, "status_code", None)
            if status_code in (401, 403):
                raise GenerationAuthError("Groq rejected the request: not authorized.") from exc
            if status_code == 429:
                raise GenerationProviderError("Groq rate-limited the request.") from exc
            if status_code and status_code >= 500:
                raise GenerationProviderError("Groq reported a server error.") from exc
            raise GenerationError("groq_error", "Groq returned an unexpected error.") from exc

        return response.choices[0].message.content or ""


def get_generation_client() -> GenerationClient:
    """The `GenerationClient` this deployment uses. Never called at import
    time (only when `generate_answer` actually needs one), and never makes
    a network call itself -- it just builds an adapter.

    Reads `settings.groq_api_key` -- the only place in this module that
    touches it -- and reports a clear, key-free, non-retryable error when
    it is absent, rather than crashing at startup."""
    if not settings.groq_api_key:
        return _DisabledClient(
            message=(
                "The Groq AI provider is disabled: set GROQ_API_KEY to enable "
                "answer generation."
            )
        )
    return _GroqClient(api_key=settings.groq_api_key, model=settings.answer_model)


def generate_answer(
    question: str,
    retrieved: list[RetrievedChunk],
    *,
    client: GenerationClient | None = None,
) -> str:
    """Turns `question` plus whatever `retrieved` (already run by the
    caller) found into an answer string.

    `client` is injectable so tests can supply a failing fake with no
    network call; left as `None` (the normal call path) the server-side
    client from `get_generation_client()` is used.

    A `GenerationAuthError`/`GenerationQuotaError` is raised immediately,
    never retried (AC-061). A `GenerationProviderError` is retried up to
    `generation_max_retries()` total attempts with exponential backoff
    before being re-raised (AC-062) -- there is no unbounded retry loop.
    Any failure path here performs no database write of any kind
    (AC-063).
    """
    active_client = client or get_generation_client()
    attempts = generation_max_retries()
    base = generation_backoff_base_seconds()
    last_error: GenerationProviderError | None = None

    for attempt in range(attempts):
        try:
            return active_client.generate(question, retrieved)
        except (GenerationAuthError, GenerationQuotaError):
            # Non-retryable: surface immediately, no wait (AC-061).
            raise
        except GenerationProviderError as exc:
            last_error = exc
            if attempt < attempts - 1:
                time.sleep(base * (2**attempt))

    assert last_error is not None  # attempts is always >= 1
    raise last_error


__all__ = [
    "GenerationAuthError",
    "GenerationClient",
    "GenerationError",
    "GenerationProviderError",
    "GenerationQuotaError",
    "generate_answer",
    "generation_backoff_base_seconds",
    "generation_max_retries",
    "get_generation_client",
]
