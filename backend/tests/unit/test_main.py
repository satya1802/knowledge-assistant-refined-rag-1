"""Unit tests for `app/main.py`: the `health` coroutine, the application's
metadata, the CORS middleware's configuration (default origins vs.
`ALLOWED_ORIGINS`), and that every approved router is actually wired onto
the app -- each exercised directly against the `FastAPI` app object or a
single coroutine, never through the `client` fixture or `TestClient`.

This ticket carries no acceptance criteria of its own. `backend/tests/test_health.py`
and `backend/tests/test_routes.py` already cover the running app's `/health`
response and the registered OpenAPI paths end-to-end with `TestClient`; this
file covers what those two leave untouched -- the module's own logic:

  * `health()` as a plain coroutine, with `configured_services` monkeypatched,
    so a change to the services module (adding/removing a service, a
    service flipping configured/unconfigured) cannot silently change what
    `/health` reports without this test noticing;
  * the application's title, version and the brief embedded in its
    description, so an edit that truncates or garbles that text is caught
    here rather than only by someone reading the rendered OpenAPI docs;
  * the CORS origin list the module computes from `ALLOWED_ORIGINS` --
    the documented fallback to the two Vite dev origins when the variable
    is unset or blank, and the comma-split/trimmed/empty-filtered parsing
    when it is set -- since a mistake here means the deployed frontend's
    calls are silently rejected by the browser, discovered only after a
    deploy;
  * that `allow_credentials`, `allow_methods` and `allow_headers` are
    configured as the module promises in its comment; and
  * that every router `app/routers/` exports is actually included on the
    app (import wiring, not endpoint behaviour -- each router's own tests
    cover that).

`ALLOWED_ORIGINS` is read once, at import time, directly into module-level
names (`_dev_origins`, `_allowed_origins`) rather than behind a function, so
these tests use `importlib.reload` under a controlled environment to
observe each case; `app.main` is reloaded again by later tests (and by the
rest of the suite importing it afresh), so no test here leaves the module
in a state another test depends on.
"""

import asyncio
import importlib

from starlette.middleware.cors import CORSMiddleware

import app.main as main_module


def _cors_middleware(app):
    """The registered `CORSMiddleware` entry on `app`, found by introspecting
    `app.user_middleware` directly -- no client, no request."""
    for mw in app.user_middleware:
        if mw.cls is CORSMiddleware:
            return mw
    raise AssertionError("CORSMiddleware is not registered on the app")


# --- app metadata -----------------------------------------------------


def test_app_metadata_matches_the_approved_brief() -> None:
    assert main_module.app.title == "Knowledge Assistant - Refined RAG"
    assert main_module.app.version == "0.1.0"
    assert "Core rule: Knowledge Base first. Gemini general-knowledge fallback second." in (
        main_module.app.description
    )
    assert (
        "Reloading the application must never erase chat history, uploaded documents, "
        "users, or saved application data." in main_module.app.description
    )


# --- health() -----------------------------------------------------------


def test_health_reports_ok_and_passes_through_configured_services(monkeypatch) -> None:
    """A change to what `configured_services()` returns must be reflected
    verbatim by `health()`, with nothing added, dropped or recomputed."""
    fake_services = {
        "redis-queue": True,
        "object-storage": False,
        "ai-provider": True,
        "ocr": False,
    }
    monkeypatch.setattr(main_module, "configured_services", lambda: fake_services)

    result = asyncio.run(main_module.health())

    assert result == {"status": "ok", "services": fake_services}


def test_health_status_is_always_ok_regardless_of_which_services_are_configured(
    monkeypatch,
) -> None:
    """`/health` is a liveness probe: it must report `status: ok` even when
    every backing service is unconfigured, never fail or degrade with them."""
    monkeypatch.setattr(
        main_module,
        "configured_services",
        lambda: {"redis-queue": False, "object-storage": False, "ai-provider": False, "ocr": False},
    )

    result = asyncio.run(main_module.health())

    assert result["status"] == "ok"


# --- CORS: ALLOWED_ORIGINS parsing --------------------------------------


def test_default_dev_origins_used_when_allowed_origins_is_unset(monkeypatch) -> None:
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)

    reloaded = importlib.reload(main_module)

    cors = _cors_middleware(reloaded.app)
    assert cors.kwargs["allow_origins"] == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_default_dev_origins_used_when_allowed_origins_is_blank(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "   ")

    reloaded = importlib.reload(main_module)

    cors = _cors_middleware(reloaded.app)
    assert cors.kwargs["allow_origins"] == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_allowed_origins_parsed_from_a_comma_separated_env_var(monkeypatch) -> None:
    monkeypatch.setenv(
        "ALLOWED_ORIGINS", " https://app.example.com ,https://admin.example.com,, "
    )

    reloaded = importlib.reload(main_module)

    cors = _cors_middleware(reloaded.app)
    # Whitespace trimmed and the empty entry from the trailing comma dropped;
    # the dev-only fallback origins are not mixed in once the real ones are set.
    assert cors.kwargs["allow_origins"] == [
        "https://app.example.com",
        "https://admin.example.com",
    ]


def test_allowed_origins_with_a_single_origin_does_not_fall_back_to_dev_origins(
    monkeypatch,
) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://app.example.com")

    reloaded = importlib.reload(main_module)

    cors = _cors_middleware(reloaded.app)
    assert cors.kwargs["allow_origins"] == ["https://app.example.com"]


def test_cors_middleware_allows_credentials_every_method_and_every_header(monkeypatch) -> None:
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)

    reloaded = importlib.reload(main_module)

    cors = _cors_middleware(reloaded.app)
    assert cors.kwargs["allow_credentials"] is True
    assert cors.kwargs["allow_methods"] == ["*"]
    assert cors.kwargs["allow_headers"] == ["*"]


# --- router wiring --------------------------------------------------------


def test_every_approved_router_is_included_on_the_app() -> None:
    """Each router `app/routers/` exports must actually be wired onto the
    app -- a router left out of `include_router` compiles fine and simply
    never answers a request, which only this kind of check catches."""
    registered_paths = {route.path for route in main_module.app.routes}

    expected_prefixes = {
        "/auth",
        "/users",
        "/account",
        "/documents",
        "/conversations",
        "/settings",
    }
    for prefix in expected_prefixes:
        assert any(
            path == prefix or path.startswith(prefix + "/") for path in registered_paths
        ), f"no route registered under {prefix!r}"

    # The chat router has no prefix of its own (see app/routers/chat.py), so
    # its own routes are asserted by exact path instead.
    assert "/chat" in registered_paths

    assert "/health" in registered_paths
