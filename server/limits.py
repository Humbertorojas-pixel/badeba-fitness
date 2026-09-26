"""Límites de seguridad del proxy: tasa de peticiones y presupuesto de gasto."""
import json
import threading
import time
from datetime import date
from pathlib import Path

# Precios de Claude Haiku 4.5 (USD por millón de tokens).
PRICES = {"input": 1.00, "output": 5.00, "cache_read": 0.10, "cache_write": 1.25}


class RateLimiter:
    """Ventana deslizante: máximo `limit` peticiones cada `window` segundos por clave."""

    def __init__(self, limit, window=60.0, clock=time.monotonic):
        self.limit = limit
        self.window = window
        self.clock = clock
        self.hits = {}
        self.lock = threading.Lock()

    def allow(self, key="global"):
        now = self.clock()
        with self.lock:
            recent = [t for t in self.hits.get(key, []) if now - t < self.window]
            if len(recent) >= self.limit:
                self.hits[key] = recent
                return False
            recent.append(now)
            self.hits[key] = recent
            return True


def cost_of(usage):
    """Costo estimado en USD de una respuesta a partir de su `usage`."""
    get = lambda name: getattr(usage, name, 0) or 0
    return (
        get("input_tokens") * PRICES["input"]
        + get("output_tokens") * PRICES["output"]
        + get("cache_read_input_tokens") * PRICES["cache_read"]
        + get("cache_creation_input_tokens") * PRICES["cache_write"]
    ) / 1_000_000


class Budget:
    """Tope de gasto por sesión (en memoria) y diario (persistido en disco)."""

    def __init__(self, session_cap, daily_cap, path, today=date.today):
        self.session_cap = session_cap
        self.daily_cap = daily_cap
        self.path = Path(path)
        self.today = today
        self.session_spent = 0.0
        self.lock = threading.Lock()

    def _load_daily(self):
        try:
            data = json.loads(self.path.read_text())
            return data.get(self.today().isoformat(), 0.0)
        except (OSError, ValueError):
            return 0.0

    def daily_spent(self):
        return self._load_daily()

    def can_spend(self):
        with self.lock:
            return self.session_spent < self.session_cap and self._load_daily() < self.daily_cap

    def record(self, amount):
        with self.lock:
            self.session_spent += amount
            key = self.today().isoformat()
            total = self._load_daily() + amount
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({key: total}))
            tmp.replace(self.path)

    def status(self):
        return {
            "session_spent": round(self.session_spent, 5),
            "session_cap": self.session_cap,
            "daily_spent": round(self._load_daily(), 5),
            "daily_cap": self.daily_cap,
        }
