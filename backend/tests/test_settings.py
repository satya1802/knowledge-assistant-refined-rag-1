"""app/settings.py: env-driven provider/model config, secret never printed
(AC-097/AC-098/AC-099)."""

from app.settings import Settings


def test_defaults_apply_without_any_env_set(monkeypatch) -> None:
    for name in ("AI_PROVIDER", "ANSWER_MODEL", "EMBEDDING_MODEL", "GROQ_API_KEY"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings()

    assert settings.ai_provider
    assert settings.answer_model
    assert settings.embedding_model
    assert settings.groq_api_key == ""


def test_env_vars_override_defaults_without_a_code_change(monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "other-provider")
    monkeypatch.setenv("ANSWER_MODEL", "custom-answer-model")
    monkeypatch.setenv("EMBEDDING_MODEL", "custom-embedding-model")
    monkeypatch.setenv("GROQ_API_KEY", "super-secret-key")

    settings = Settings()

    assert settings.ai_provider == "other-provider"
    assert settings.answer_model == "custom-answer-model"
    assert settings.embedding_model == "custom-embedding-model"
    assert settings.groq_api_key == "super-secret-key"


def test_repr_and_str_redact_the_key(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "super-secret-key")

    settings = Settings()

    assert "super-secret-key" not in repr(settings)
    assert "super-secret-key" not in str(settings)
    assert "***" in repr(settings)
    assert "***" in str(settings)


def test_masked_key_never_reveals_the_real_value(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "super-secret-key")
    settings = Settings()

    assert settings.masked_groq_api_key == "***"


def test_masked_key_is_empty_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    settings = Settings()

    assert settings.masked_groq_api_key == ""


def test_exposing_provider_and_model_names_never_includes_the_secret() -> None:
    settings = Settings()

    public = {
        "ai_provider": settings.ai_provider,
        "answer_model": settings.answer_model,
        "embedding_model": settings.embedding_model,
    }

    assert "groq_api_key" not in public
    assert settings.groq_api_key not in public.values()
