// Lanzador de un solo comando: compila si hace falta, arranca el servidor local y abre el navegador.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const port = Number(process.env.NEXO_PORT || 8765);
const url = `http://localhost:${port}`;

function newestMtime(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newestMtime(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}

const distIndex = path.join(root, 'dist', 'index.html');
if (!fs.existsSync(distIndex) || newestMtime(path.join(root, 'src')) > fs.statSync(distIndex).mtimeMs) {
  console.log('Compilando el juego...');
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// server/.env (opcional): ANTHROPIC_API_KEY=... y límites NEXO_*. Nunca se sube al repositorio.
const env = { ...process.env, NEXO_PORT: String(port) };
const envFile = path.join(root, 'server', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const venvPy = process.platform === 'win32' ? path.join(root, 'server', '.venv', 'Scripts', 'python.exe') : path.join(root, 'server', '.venv', 'bin', 'python');
const python = fs.existsSync(venvPy) ? venvPy : process.platform === 'win32' ? 'python' : 'python3';
const server = spawn(python, [path.join(root, 'server', 'nexo_server.py')], { cwd: root, env, stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig));

for (let i = 0; i < 50; i++) {
  try {
    const h = await (await fetch(`${url}/api/health`)).json();
    console.log(`Listo → ${url}   (Laya: ${h.laya} · Claude: ${h.claude})`);
    if (h.claude === 'no_key') console.log('Sin API key: los NPC usarán diálogo local. Pon ANTHROPIC_API_KEY en server/.env para diálogo generativo.');
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}
if (!process.env.NEXO_NO_BROWSER) {
  const opener = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).on('error', () => console.log(`Abre ${url} en tu navegador.`)).unref();
}
