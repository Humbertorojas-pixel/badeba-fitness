// Integración de IA en navegador real contra el servidor de NEXO con Laya/Claude simulados.
// Requiere: dist compilado y `server/.venv`. Uso: node tests/ai-smoke.mjs [carpeta_capturas]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || 'ai-shots';
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync('tests/.scratch', { recursive: true });
const PORT = 8799;
const harness = spawn('server/.venv/bin/python', ['tests/ai_harness.py'], { env: { ...process.env, NEXO_PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const executablePath = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: path.join(outDir, `${n}.png`) });
const press = async (k, n = 1, gap = 150) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await wait(gap); } };
const calls = () => page.evaluate(() => fetch('/api/_calls').then((r) => r.json()));
const scenes = () => page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
const textShown = () => page.evaluate(() => window.__game.scene.getScenes(true).flatMap((s) => (s.textbox ? s.textbox.lines.map((l) => l.text) : [])).join(' '));

// Lleva al jugador junto a un objetivo (NPC o enemigo) y lo encara.
const approach = (kind) => page.evaluate((k) => {
  const s = window.__game.scene.getScene('Overworld');
  const f = s.floor;
  const target = k === 'npc' ? s.npcs[0].data : s.enemies[0];
  for (const [d, dx, dy] of [['up', 0, 1], ['down', 0, -1], ['left', 1, 0], ['right', -1, 0]]) {
    const x = target.x + dx;
    const y = target.y + dy;
    if (!f.walls[y * f.w + x] && !f.blockers.has(y * f.w + x) && !s.enemyAt(x, y)) {
      s.tile = { x, y };
      s.placePlayer();
      s.facing = d;
      s.player.setFrame({ down: 0, up: 3, left: 6, right: 9 }[d]);
      return true;
    }
  }
  return false;
}, kind);

try {
  await page.goto(`http://localhost:${PORT}/`);
  await wait(1500);
  await press('Enter', 1, 900);
  await press('z', 1, 1500);
  for (let i = 0; i < 25 && (await page.evaluate(() => window.__game.scene.getScene('Overworld')?.busy !== false)); i++) await press('z', 1, 500);
  await wait(600);

  // Conversación libre con el NPC del primer piso.
  if (!(await approach('npc'))) throw new Error('No hay acceso al NPC');
  await press('z', 1, 1800);
  await shot('01-saludo');
  const greeting = await page.evaluate(() => window.__game.scene.getScene('Overworld').npcs[0].data.history.at(-1)?.text || '');
  if (!greeting.includes('voz del pozo')) throw new Error(`Saludo no vino de Claude: ${greeting}`);
  const textActive = () => page.evaluate(() => window.__game.scene.getScene('Overworld').textInput.active);
  // Si el NPC ofrece una misión, se acepta (Z) antes de poder escribirle.
  for (let i = 0; i < 14 && !(await textActive()); i++) await press('z', 1, 600);
  await page.keyboard.type('¿Dónde está la escalera, señora?');
  await wait(300);
  await shot('02-escribiendo');
  await press('Enter', 1, 2200);
  await shot('03-respuesta');
  const c1 = await calls();
  if (c1.moderate < 1 || c1.claude < 2) throw new Error(`Llamadas insuficientes: ${JSON.stringify(c1)}`);
  for (let i = 0; i < 6 && !(await textActive()); i++) await press('z', 1, 600);
  await press('Escape', 1, 800);
  const busy = await page.evaluate(() => window.__game.scene.getScene('Overworld').busy);
  if (busy) throw new Error('La conversación no terminó al pulsar Esc');

  // Combate: línea de apertura, HABLAR con texto libre y una decisión del enemigo vía Laya.
  if (!(await approach('enemy'))) throw new Error('No hay acceso a un enemigo');
  await press('z', 1, 3500);
  if (!(await scenes()).includes('Battle')) throw new Error('No empezó el combate');
  const menuActive = () => page.evaluate(() => !!window.__game.scene.getScene('Battle')?.actionMenu?.active);
  for (let i = 0; i < 40 && !(await menuActive()); i++) await press('z', 1, 600);
  await shot('04-combate');
  await press('ArrowDown', 1, 250);
  await press('z', 1, 500);
  await page.keyboard.type('No quiero pelear. Déjame pasar.');
  await press('Enter', 1, 1500);
  await shot('05-negociacion');
  for (let i = 0; i < 12; i++) {
    const s = await scenes();
    if (!s.includes('Battle')) break;
    const menuOpen = await page.evaluate(() => window.__game.scene.getScene('Battle').actionMenu.active);
    if (menuOpen) { await press('ArrowUp', 1, 200); await press('z', 1, 400); await press('z', 1, 900); }
    else await press('z', 1, 600);
  }
  const c2 = await calls();
  console.log('Llamadas a la IA:', c2);
  if (c2.claude < 4) throw new Error(`Faltan llamadas a Claude (bark/negociación): ${JSON.stringify(c2)}`);
} catch (e) {
  errors.push(`test: ${e.message}`);
  await shot('error');
}
await browser.close();
harness.kill();
if (errors.length) { console.error('ERRORES:\n' + errors.join('\n')); process.exit(1); }
console.log('AI smoke OK — capturas en', outDir);
