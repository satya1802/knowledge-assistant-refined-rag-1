"""Answer-generation seam (stub): deliberately not implemented here.

Groq-backed generation is US-042-1's work. This module exists only so
`app/routers/chat.py` has a single, stable, callable seam to hand retrieved
chunks to after `app/retrieval.py` has run -- wiring in the real Groq call
later is a change to this module alone, never to the chat router or to
retrieval. Calling it today never reaches a real provider and never reads
`GROQ_API_KEY`; it just reports a short, honest placeholder so the chat
response shape is stable for the frontend to build against.
"""

from __future__ import annotations

from app.retrieval import RetrievedChunk


def generate_answer(question: str, retrieved: list[RetrievedChunk]) -> str:
    """Placeholder answer generation (US-042-1 fills this in for real).

    Never calls Groq or any other provider, and never reads a provider API
    key -- this always returns a short, fixed, key-free placeholder string,
    whether or not `retrieved` is empty.
    """
    return "Answer generation is not implemented yet."


__all__ = ["generate_answer"]
