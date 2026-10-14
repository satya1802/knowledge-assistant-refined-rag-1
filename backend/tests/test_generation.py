"""US-042-1: app/generation.py's error classification and bounded retry.

AC-061: an auth or quota error from the provider is never retried -- it is
raised on the very first attempt.
AC-062: a transient provider error is retried up to a bounded number of
total attempts, with no endless retry loop, before being surfaced.
AC-063: no failure path here touches the database at all (this module
takes no database session, so there is nothing to assert beyond "no crash
reading/writing anything" -- covered end to end in
test_chat_generation_errors.py against the real router).

A fake `GenerationClient` is injected throughout -- the real Groq SDK is
never exercised by this suite, matching app/embedding.py's established
pattern (see tests/test_embedding.py).
"""

import pytest

import app.generation as generation_module
from app.generation import (
    GenerationAuthError,
    GenerationProviderError,
    GenerationQuotaError,
    generate_answer,
    generation_backoff_base_seconds,
    generation_max_retries,
)


class _AlwaysAuthFailsClient:
    def __init__(self):
        self.attempts = 0

    def generate(self, question, context):
        self.attempts += 1
        raise GenerationAuthError("invalid credentials")


class _AlwaysQuotaFailsClient:
    def __init__(self):
        self.attempts = 0

    def generate(self, question, context):
        self.attempts += 1
        raise GenerationQuotaError("quota exhausted")


class _AlwaysProviderFailsClient:
    def __init__(self):
        self.attempts = 0

    def generate(self, question, context):
        self.attempts += 1
        raise GenerationProviderError("rate limited")


class _FailsThenSucceedsClient:
    def __init__(self, fail_times: int):
        self.fail_times = fail_times
        self.attempts = 0

    def generate(self, question, context):
        self.attempts += 1
        if self.attempts <= self.fail_times:
            raise GenerationProviderError("transient")
        return "the answer"


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    """Retries must not actually slow the test suite down."""
    monkeypatch.setattr(generation_module.time, "sleep", lambda _seconds: None)


# --------------------------------------------------------------------- #
# AC-061: auth/quota errors are never retried
# --------------------------------------------------------------------- #


def test_auth_error_is_raised_on_the_first_attempt_with_no_retry() -> None:
    client = _AlwaysAuthFailsClient()

    with pytest.raises(GenerationAuthError):
        generate_answer("question", [], client=client)

    assert client.attempts == 1


def test_quota_error_is_raised_on_the_first_attempt_with_no_retry() -> None:
    client = _AlwaysQuotaFailsClient()

    with pytest.raises(GenerationQuotaError):
        generate_answer("question", [], client=client)

    assert client.attempts == 1


def test_auth_error_carries_a_clear_code_and_message() -> None:
    client = _AlwaysAuthFailsClient()

    with pytest.raises(GenerationAuthError) as exc_info:
        generate_answer("question", [], client=client)

    assert exc_info.value.code == "groq_auth_error"
    assert exc_info.value.message


def test_quota_error_carries_a_clear_code_and_message() -> None:
    client = _AlwaysQuotaFailsClient()

    with pytest.raises(GenerationQuotaError) as exc_info:
        generate_answer("question", [], client=client)

    assert exc_info.value.code == "groq_quota_exceeded"
    assert exc_info.value.message


# --------------------------------------------------------------------- #
# AC-062: transient errors retry a bounded number of times
# --------------------------------------------------------------------- #


def test_transient_provider_error_retries_and_eventually_succeeds_within_the_bound() -> None:
    client = _FailsThenSucceedsClient(fail_times=generation_max_retries() - 1)

    answer = generate_answer("question", [], client=client)

    assert answer == "the answer"
    assert client.attempts == generation_max_retries()


def test_persistent_provider_error_stops_after_exactly_max_retries_attempts() -> None:
    client = _AlwaysProviderFailsClient()

    with pytest.raises(GenerationProviderError):
        generate_answer("question", [], client=client)

    # Bounded, not endless: exactly the configured number of attempts, never
    # more.
    assert client.attempts == generation_max_retries()


def test_provider_error_code_and_message_are_surfaced_after_exhausting_retries() -> None:
    client = _AlwaysProviderFailsClient()

    with pytest.raises(GenerationProviderError) as exc_info:
        generate_answer("question", [], client=client)

    assert exc_info.value.code == "groq_unavailable"
    assert exc_info.value.message


def test_retry_bounds_are_configurable_via_environment(monkeypatch) -> None:
    monkeypatch.setenv("GENERATION_MAX_RETRIES", "5")
    monkeypatch.setenv("GENERATION_BACKOFF_BASE_SECONDS", "0.01")

    assert generation_max_retries() == 5
    assert generation_backoff_base_seconds() == 0.01

    client = _AlwaysProviderFailsClient()
    with pytest.raises(GenerationProviderError):
        generate_answer("question", [], client=client)
    assert client.attempts == 5


def test_an_invalid_environment_override_falls_back_to_the_default() -> None:
    import os

    os.environ["GENERATION_MAX_RETRIES"] = "not-a-number"
    try:
        assert generation_max_retries() == 3
    finally:
        del os.environ["GENERATION_MAX_RETRIES"]
