"""A logging filter that redacts the AI provider secret from every record.

`install_logging()` attaches `RedactSecretsFilter` to the root logger and to
every handler currently attached to it (plus the `uvicorn*` loggers, whose
handlers FastAPI's server configures itself), so GROQ_API_KEY never appears
in a log line, a formatted `%s` argument or a traceback produced anywhere in
this process (AC-098). Call it once, as early as possible, in
`app/main.py` -- before anything that might log the key.

The filter reads the live value from `app.settings.settings` on every call
(not a value captured at import time) so a key set after this module loads
is still redacted, and so tests can substitute a fake settings object.
"""

import logging

import app.settings as settings_module


def _secret_values() -> list[str]:
    value = getattr(settings_module.settings, "groq_api_key", "")
    return [value] if value else []


class RedactSecretsFilter(logging.Filter):
    """Replaces any configured secret value in a record's message, its
    formatted `args`, or its exception text with '***'."""

    def filter(self, record: logging.LogRecord) -> bool:
        secrets = _secret_values()
        if not secrets:
            return True

        message = record.getMessage()
        for secret in secrets:
            if secret in message:
                message = message.replace(secret, "***")
        record.msg = message
        record.args = ()

        if record.exc_text:
            for secret in secrets:
                record.exc_text = record.exc_text.replace(secret, "***")

        return True


def install_logging() -> None:
    """Attaches a `RedactSecretsFilter` everywhere a record this process
    emits could be handled. Safe to call more than once."""
    redact = RedactSecretsFilter()

    root = logging.getLogger()
    root.addFilter(redact)
    for handler in root.handlers:
        handler.addFilter(redact)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "app"):
        logging.getLogger(name).addFilter(redact)
