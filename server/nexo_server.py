"""Servidor local de NEXO: sirve el juego y la API de IA (Laya + proxy de Claude).

Uso: python server/nexo_server.py   (solo escucha en 127.0.0.1)
"""
import json
import mimetypes
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from claude_proxy import Talker, Unavailable  # noqa: E402
from decisions import Decider  # noqa: E402
from limits import Budget, RateLimiter  # noqa: E402
from prompts import enemy_system, npc_system  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
MAX_BODY = 64 * 1024
MAX_MESSAGE = 280
MAX_HISTORY = 60
BLOCK_THRESHOLD = 0.75


def env_float(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


class App:
    def __init__(self, decider=None, talker=None):
        self.decider = decider or Decider()
        self.talker = talker or Talker(
            budget=Budget(env_float("NEXO_SESSION_BUDGET_USD", 0.5), env_float("NEXO_DAILY_BUDGET_USD", 2.0), Path(__file__).parent / ".usage.json"),
            rate_global=RateLimiter(20, 60),
            rate_session=RateLimiter(8, 60),
            disabled=os.environ.get("NEXO_AI_DISABLED") == "1",
        )

    def health(self, _body):
        return {"laya": self.decider.state, "claude": self.talker.status(), "budget": self.talker.budget.status()}

    def decide(self, body):
        try:
            return {"answers": self.decider.predict(body["state"], body["questions"])}
        except Exception as exc:  # cualquier fallo de inferencia: el juego decide por reglas
            return HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)}

    def talk(self, body):
        message = str(body.get("message", ""))[:MAX_MESSAGE]
        history = body.get("history") or []
        session = str(body.get("session", "anon"))[:64]
        mode = body.get("mode", "npc")
        who = body.get("npc") or body.get("enemy") or {}
        context = body.get("context") or {}
        if len(history) > MAX_HISTORY:
            return HTTPStatus.TOO_MANY_REQUESTS, {"error": "conversación demasiado larga"}

        result = {"reply": None, "blocked": None, "escalate": None, "persuaded": None}
        if self.decider.ready and message:
            try:
                flags = self.decider.moderate(message, who.get("name", ""))
                worst = max(flags, key=flags.get)
                if flags[worst] >= BLOCK_THRESHOLD:
                    result["blocked"] = worst
                    return result
                greed = context.get("codicia", "baja")
                if mode == "negotiate":
                    result["persuaded"] = self.decider.persuasion(who, message, context.get("inteligencia", 5), greed)
                else:
                    result["escalate"] = self.decider.escalation(who, history, message, greed)
            except Exception as exc:  # Laya falló en esta petición: seguimos sin sus señales
                print(f"[laya] {exc}", file=sys.stderr)

        system = enemy_system(who, context) if mode == "negotiate" else npc_system(who, context)
        messages = [{"role": h["role"], "content": str(h["text"])[:600]} for h in history if h.get("role") in ("user", "assistant")]
        messages.append({"role": "user", "content": message or "(El viajero se acerca en silencio.)"})
        try:
            result["reply"] = self.talker.say(system, messages, session, max_tokens=160 if mode == "npc" else 90)
        except Unavailable as exc:
            result["unavailable"] = str(exc)
        return result

    def bark(self, body):
        enemy = body.get("enemy") or {}
        situation = str(body.get("situation", "inicio del combate"))[:120]
        try:
            line = self.talker.say(
                enemy_system(enemy, body.get("context") or {}),
                [{"role": "user", "content": f"({situation}. Di una sola frase breve y amenazante.)"}],
                str(body.get("session", "bark"))[:64],
                max_tokens=60,
            )
            return {"line": line}
        except Unavailable as exc:
            return {"line": None, "unavailable": str(exc)}

    def routes(self):
        return {("GET", "/api/health"): self.health, ("POST", "/api/decide"): self.decide, ("POST", "/api/talk"): self.talk, ("POST", "/api/bark"): self.bark}


def make_handler(app):
    routes = app.routes()

    class Handler(BaseHTTPRequestHandler):
        server_version = "Nexo/1.0"

        def log_message(self, fmt, *args):
            if os.environ.get("NEXO_VERBOSE"):
                super().log_message(fmt, *args)

        def _json(self, status, payload):
            data = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _api(self, method):
            fn = routes.get((method, self.path.split("?")[0]))
            if not fn:
                return self._json(HTTPStatus.NOT_FOUND, {"error": "ruta desconocida"})
            body = {}
            if method == "POST":
                length = int(self.headers.get("Content-Length") or 0)
                if length > MAX_BODY:
                    return self._json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "cuerpo demasiado grande"})
                try:
                    body = json.loads(self.rfile.read(length) or b"{}")
                except ValueError:
                    return self._json(HTTPStatus.BAD_REQUEST, {"error": "JSON inválido"})
            out = fn(body)
            status, payload = out if isinstance(out, tuple) else (HTTPStatus.OK, out)
            self._json(status, payload)

        def _static(self):
            rel = self.path.split("?")[0].lstrip("/") or "index.html"
            target = (DIST / rel).resolve()
            outside = DIST.resolve() not in target.parents
            if outside or not target.is_file():
                target = DIST / "index.html"
            if not target.is_file():
                return self._json(HTTPStatus.NOT_FOUND, {"error": "falta compilar el juego: npm run build"})
            data = target.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path.startswith("/api/"):
                self._api("GET")
            else:
                self._static()

        def do_POST(self):
            self._api("POST")

    return Handler


def main():
    port = int(os.environ.get("NEXO_PORT", 8765))
    app = App()
    if os.environ.get("NEXO_NO_LAYA") == "1":
        app.decider.state = "unavailable"
    else:
        app.decider.load_async()
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app))
    laya = "desactivada" if app.decider.state == "unavailable" else "cargando en segundo plano"
    print(f"NEXO escuchando en http://localhost:{port}  (Laya: {laya} · Claude: {app.talker.status()})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
