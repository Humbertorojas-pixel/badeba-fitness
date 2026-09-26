"""Servidor real de NEXO con Laya y Claude simulados (para pruebas de integración sin red)."""
import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

from claude_proxy import Talker  # noqa: E402
from decisions import Decider  # noqa: E402
from limits import Budget, RateLimiter  # noqa: E402
from nexo_server import App, make_handler  # noqa: E402

CALLS = {"decide": 0, "moderate": 0, "claude": 0}


class FakeRouter:
    def predict(self, state, questions, model=None):
        if "accion" in questions:
            CALLS["decide"] += 1
        if "rompe_personaje" in questions:
            CALLS["moderate"] += 1
        answers = {}
        for qid, q in questions.items():
            if q["type"] == "noul":
                answers[qid] = {"type": "noul", "noul": 0.95 if qid == "convencido" else 0.02}
            else:
                keys = list(q["criteria"].keys())
                answers[qid] = {"type": "choice", "choice": keys[0], "probabilities": {k: 1 / len(keys) for k in keys}}
        return {"answers": answers}


class FakeClient:
    def __init__(self):
        self.messages = SimpleNamespace(create=self.create)

    def create(self, **kw):
        CALLS["claude"] += 1
        text = {160: "Soy una voz del pozo. Te escucho, viajero.", 90: "Pasa, viajero. Hoy no.", 60: "Tu carne huele a escaleras."}.get(kw["max_tokens"], "...")
        usage = SimpleNamespace(input_tokens=900, output_tokens=30, cache_read_input_tokens=0, cache_creation_input_tokens=0)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], usage=usage, stop_reason="end_turn")


def main():
    decider = Decider(router_factory=FakeRouter)
    decider._load()
    talker = Talker(Budget(1.0, 5.0, ROOT / "tests" / ".scratch" / "usage.json"), RateLimiter(100), RateLimiter(100), client=FakeClient())
    app = App(decider=decider, talker=talker)
    routes = app.routes()
    routes[("GET", "/api/_calls")] = lambda _b: dict(CALLS)
    app.routes = lambda: routes
    port = int(os.environ.get("NEXO_PORT", 8799))
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app))
    print(f"harness en {port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
