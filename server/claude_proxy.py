"""Proxy hacia la API de Claude. La API key solo vive aquí (variable de entorno), nunca en el navegador."""
import os
from pathlib import Path

from limits import cost_of

DEFAULT_MODEL = "claude-haiku-4-5"


class Unavailable(Exception):
    """La narrativa generativa no está disponible: el juego debe usar su banco local de líneas."""


def credentials_present():
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return True
    return (Path.home() / ".config" / "anthropic").exists()


class Talker:
    def __init__(self, budget, rate_global, rate_session, client=None, model=None, disabled=False):
        self.budget = budget
        self.rate_global = rate_global
        self.rate_session = rate_session
        self.model = model or os.environ.get("NEXO_CLAUDE_MODEL", DEFAULT_MODEL)
        self.disabled = disabled
        self._client = client

    @property
    def client(self):
        if self._client is None:
            import anthropic

            self._client = anthropic.Anthropic(timeout=12.0, max_retries=1)
        return self._client

    def status(self):
        if self.disabled:
            return "disabled"
        if self._client is None and not credentials_present():
            return "no_key"
        return "ready"

    def say(self, system, messages, session, max_tokens):
        if self.status() != "ready":
            raise Unavailable(self.status())
        if not self.budget.can_spend():
            raise Unavailable("budget")
        if not self.rate_global.allow("global") or not self.rate_session.allow(session):
            raise Unavailable("rate")
        import anthropic

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                cache_control={"type": "ephemeral"},
                system=system,
                messages=messages,
            )
        except (anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
            raise Unavailable(type(exc).__name__) from exc
        self.budget.record(cost_of(response.usage))
        if response.stop_reason == "refusal":
            raise Unavailable("refusal")
        text = " ".join(b.text for b in response.content if b.type == "text").strip()
        if not text:
            raise Unavailable("empty")
        return clean_line(text)


def clean_line(text, limit=320):
    text = " ".join(text.replace("*", "").split()).strip('"«» ')
    if len(text) > limit:
        cut = text[:limit]
        end = max(cut.rfind("."), cut.rfind("!"), cut.rfind("?"))
        text = cut[: end + 1] if end > 60 else cut.rstrip() + "..."
    return text
