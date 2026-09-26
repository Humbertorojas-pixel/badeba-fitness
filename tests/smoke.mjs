// Prueba de humo en navegador real: arranca Vite, abre el juego, juega y guarda capturas.
// Uso: npm run smoke [-- carpeta_capturas]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || 'smoke-shots';
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 5174, strictPort: true }, logLevel: 'error' });
await server.listen();

const executablePath = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 720, height: 480 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const scenes = () => page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
const press = async (key, n = 1, gap = 120) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await wait(gap); } };
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };

try {
  await page.goto('http://localhost:5174/');
  await wait(1500);
  await shot('01-titulo');
  await press('Enter');
  await wait(1200);
  await shot('02-mundo-intro');
  await press('z', 4, 400);
  await wait(500);
  await shot('03-mundo');

  // Recorre el cuarto inicial hacia el enemigo del cuarto este (lo detecta y ataca).
  await hold('ArrowRight', 2600);
  await wait(2500);
  const s1 = await scenes();
  await shot('04-tras-caminar');
  if (!s1.includes('Battle')) throw new Error(`Se esperaba combate, escenas activas: ${s1}`);
  await wait(1500);
  await press('z', 2, 500);
  await wait(800);
  await shot('05-combate-menu');
  await press('z');
  await wait(400);
  await shot('06-menu-movimientos');
  await press('z');
  for (let i = 0; i < 40; i++) {
    await press('z', 1, 350);
    const s = await scenes();
    if (s.includes('Overworld') || s.includes('Title')) break;
  }
  await wait(1200);
  await shot('07-fin-combate');
  console.log('Escenas finales:', await scenes());
} catch (e) {
  errors.push(`test: ${e.message}`);
  await shot('error');
}

await browser.close();
await server.close();
if (errors.length) {
  console.error('ERRORES:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Smoke OK — capturas en', outDir);
