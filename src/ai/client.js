// Cliente del servidor local de IA. Cada llamada tiene timeout y nunca lanza:
// si algo falla devuelve null y el juego continúa con su lógica local.
const status = { laya: 'unavailable', claude: 'unavailable', checked: false };
const SESSION = Math.random().toString(36).slice(2);

async function call(path, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify({ session: SESSION, ...body }) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshAiStatus() {
  const h = await call('/api/health', null, 1500);
  status.laya = h?.laya || 'unavailable';
  status.claude = h?.claude || 'unavailable';
  status.checked = true;
  return { ...status };
}

export function aiStatus() {
  return { ...status };
}

export const layaReady = () => status.laya === 'ready';
export const claudeReady = () => status.claude === 'ready';

export async function decide(state, questions) {
  if (!layaReady()) return null;
  const r = await call('/api/decide', { state, questions }, 2500);
  return r?.answers || null;
}

export async function talk(payload) {
  if (!layaReady() && !claudeReady()) return null;
  return call('/api/talk', payload, 14000);
}

export async function bark(enemy, context, situation) {
  if (!claudeReady()) return null;
  const r = await call('/api/bark', { enemy, context, situation }, 3000);
  return r?.line || null;
}
