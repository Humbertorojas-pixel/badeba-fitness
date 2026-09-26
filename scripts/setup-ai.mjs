// Prepara la IA local: entorno virtual de Python con Laya (decisiones) y el SDK de Anthropic (diálogo).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const venv = path.join(root, 'server', '.venv');
const py = process.platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python');
const run = (cmd, args) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!fs.existsSync(py)) run(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'venv', venv]);
// PyTorch solo-CPU: más liviano y suficiente para Laya en equipos con gráfica integrada.
run(py, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(py, ['-m', 'pip', 'install', 'torch', '--index-url', 'https://download.pytorch.org/whl/cpu']);
run(py, ['-m', 'pip', 'install', '-r', path.join(root, 'server', 'requirements.txt')]);
const envFile = path.join(root, 'server', '.env');
if (!fs.existsSync(envFile)) {
  fs.writeFileSync(envFile, '# Tu API key de Anthropic (opcional). Sin ella, los NPC usan diálogo local.\nANTHROPIC_API_KEY=\n\n# Límites de gasto en USD\nNEXO_SESSION_BUDGET_USD=0.50\nNEXO_DAILY_BUDGET_USD=2.00\n\n# 1 = no cargar Laya (ahorra ~1 GB de RAM; el combate usa reglas)\nNEXO_NO_LAYA=0\n');
  console.log(`Creado ${envFile}: pega ahí tu ANTHROPIC_API_KEY si quieres diálogo generativo.`);
}
console.log('IA lista. Ejecuta: npm run play (la primera vez Laya descarga ~650 MB).');
