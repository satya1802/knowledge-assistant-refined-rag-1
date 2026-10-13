# 0001 - Embedding provider selection (open decision)

**Status:** open -- awaiting sign-off. Not yet wired into
`app/settings.py`'s `EMBEDDING_PROVIDER` default, which is `"none"` until
this is resolved.

## Why this is open

The product's original AI provider was Google Gemini. Gemini has since been
removed from the approved stack (see `app/main.py`'s project brief), and the
backend's remaining configured AI provider, Groq (`app/config.py`'s
`groq_status`, `AI_PROVIDER=groq` in `backend/.env.example`), does not offer
an embedding model -- only chat/completion models. Neither of the two
providers already wired into this codebase can satisfy US-019-1's embedding
requirement, so a *new* provider decision is required before
`EMBEDDING_PROVIDER` can point at anything real.

## Hard constraint

Whatever is chosen must produce **exactly 768-dimension** vectors: that is
the width `Chunk.embedding` is declared at (`pgvector.sqlalchemy.Vector(768)`
in `app/models.py`, set in migration `0001_initial`). A provider whose
native output is a different width is not a drop-in candidate unless its
output is truncated/padded in a way the team explicitly signs off on
separately -- `app/embedding.py` treats any other width as a hard error
(AC-044), not something to coerce silently.

## Candidates considered

- **OpenAI** (`text-embedding-3-small`, 1536-dim natively, but supports a
  `dimensions` parameter that can request 768) -- needs `OPENAI_API_KEY`.
- **Cohere** (`embed-english-v3.0`, configurable output dimension) -- needs
  `COHERE_API_KEY`.
- **A self-hosted/local model** matching `EMBEDDING_MODEL`'s current default
  value, `nomic-embed-text-v1.5` (native 768-dim, Matryoshka-truncatable),
  run via an inference server this deployment would need to stand up and
  operate itself -- no per-call API key, but new infrastructure.

None of these has been evaluated against cost, latency or data-residency
requirements yet; that evaluation, and sign-off on one candidate, is
tracked as follow-up work outside US-019-1's scope.

## What happens until this is signed off

`app/embedding.py`'s `get_embedding_provider()` returns a provider that
reports itself disabled with a message pointing at this file, for any value
of `EMBEDDING_PROVIDER` (including the default, `"none"`) -- exactly the
point-of-use pattern `app/config.py` uses for every other unset key.
`index_document()` still runs end-to-end against an injected mock provider
in tests; it simply has nothing real to call until one of the above (or
another candidate) is chosen here.
