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

// Camino BFS (en la página) desde el jugador hasta una casilla vecina al enemigo más cercano.
const pathToEnemy = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('Overworld');
  const f = s.floor;
  const blocked = (x, y) => x < 0 || y < 0 || x >= f.w || y >= f.h || f.walls[y * f.w + x] === 1 || f.blockers.has(y * f.w + x);
  const dirs = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
  const targets = new Set(s.enemies.map((e) => `${e.x},${e.y}`));
  const start = `${s.tile.x},${s.tile.y}`;
  const prev = new Map([[start, null]]);
  const q = [[s.tile.x, s.tile.y]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [d, [dx, dy]] of Object.entries(dirs)) {
      const k = `${x + dx},${y + dy}`;
      if (prev.has(k)) continue;
      if (targets.has(k)) {
        const steps = [d];
        for (let c = `${x},${y}`; prev.get(c); c = prev.get(c)[0]) steps.unshift(prev.get(c)[1]);
        return steps;
      }
      if (blocked(x + dx, y + dy)) continue;
      prev.set(k, [`${x},${y}`, d]);
      q.push([x + dx, y + dy]);
    }
  }
  return [];
});

const step = (dir) => page.evaluate((d) => {
  const s = window.__game.scene.getScene('Overworld');
  if (s.busy || s.moving) return false;
  s.facing = d;
  s.tryMove(d);
  return true;
}, dir);

try {
  await page.goto('http://localhost:5174/');
  await wait(1500);
  await shot('01-titulo');
  await press('Enter', 1, 800);
  await shot('01b-menu-titulo');
  await press('z');
  await wait(1400);
  await shot('02-mundo-intro');
  // Avanza los diálogos hasta que el jugador pueda moverse.
  for (let i = 0; i < 25 && (await page.evaluate(() => window.__game.scene.getScene('Overworld').busy)); i++) await press('z', 1, 500);
  await wait(800);
  await shot('03-mundo');

  // La prueba verifica flujos, no el azar del combate: el jugador empieza fuerte.
  await page.evaluate(() => { const p = window.__game.registry.get('run').player; p.attrs.fuerza = 40; p.attrs.salud = 30; p.hp = 140; });
  // Las criaturas deambulan: se re-planifica la ruta cada pocos pasos hasta entrar en combate.
  for (let leg = 0; leg < 40 && !(await scenes()).includes('Battle'); leg++) {
    const route = await pathToEnemy();
    if (!route.length) throw new Error('No hay camino a ningún enemigo');
    for (const dir of route.slice(0, 6)) {
      if ((await scenes()).includes('Battle')) break;
      for (let t = 0; t < 30 && !(await step(dir)); t++) {
        await wait(120);
        if ((await scenes()).includes('Battle')) break;
      }
      await wait(260);
    }
  }
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
  for (let i = 0; i < 60; i++) {
    await press('z', 1, 350);
    const s = await scenes();
    if (s.includes('Overworld') || s.includes('Title')) break;
  }
  await wait(1200);
  await shot('07-fin-combate');

  // Menú de pausa → ESTADO (con puntos) → MOCHILA (con un legendario y un raro inyectados).
  if ((await scenes()).includes('Overworld')) {
    await page.evaluate(() => {
      const run = window.__game.registry.get('run');
      run.player.points = 3;
      run.bag.gear.push(
        { id: 'l1', kind: 'equip', slot: 'arma', rarity: 'legendario', name: 'Mandoble del Rey Sin Trono', mods: { atk: 9, spd: -2 }, sync: 9 },
        { id: 'r1', kind: 'equip', slot: 'armadura', rarity: 'raro', name: 'Cota férrea', mods: { def: 5 }, sync: 4 },
      );
    });
    await press('Enter', 1, 500);
    await shot('10-pausa');
    await press('z', 1, 900);
    await shot('10b-mapa');
    await press('x', 1, 600);
    await press('Enter', 1, 500);
    await press('ArrowDown', 2, 200);
    await press('z', 1, 800);
    await press('z', 2, 250);
    await shot('11-estado');
    await press('x', 1, 600);
    await press('Enter', 1, 500);
    await press('ArrowUp', 1, 200);
    await press('z', 1, 800);
    await press('ArrowRight', 1, 300);
    await shot('12-mochila-equipo');
    await press('ArrowDown', 1, 200);
    await press('z', 1, 400);
    await press('z', 1, 900);
    await shot('13-equipar');
    await press('z', 1, 400);
    await press('x', 1, 600);
    for (let i = 0; i < 8 && (await scenes()).includes('Bag'); i++) {
      const busy = await page.evaluate(() => window.__game.scene.getScene('Bag').busy);
      await press(busy ? 'z' : 'x', 1, 500);
    }
    // El equipo se ve en el personaje: la textura corresponde al arma/armadura equipadas.
    const hero = await page.evaluate(() => {
      const r = window.__game.registry.get('run');
      const ow = window.__game.scene.getScene('Overworld');
      return { key: ow.hero.key, arma: r.player.equipment.arma?.rarity, armadura: r.player.equipment.armadura?.rarity, active: window.__game.scene.getScenes(true).map((x) => x.scene.key), paused: ow.sys.isPaused(), busy: ow.busy };
    });
    if (hero.key === 'hero_harapos-comun-espada-comun' || (hero.arma === 'legendario' && !hero.key.includes('mandoble-legendario'))) {
      throw new Error(`El personaje no refleja el equipo: ${JSON.stringify(hero)}`);
    }
    await shot('13b-equipo-visible');
  }

  // Descenso: coloca al jugador junto a la escalera, la pisa y confirma "Sí".
  if ((await scenes()).includes('Overworld')) {
    const dir = await page.evaluate(() => {
      const s = window.__game.scene.getScene('Overworld');
      const { stairs, w, walls, blockers } = s.floor;
      for (const [d, dx, dy] of [['up', 0, 1], ['down', 0, -1], ['left', 1, 0], ['right', -1, 0]]) {
        const x = stairs.x + dx;
        const y = stairs.y + dy;
        if (!walls[y * w + x] && !blockers.has(y * w + x) && !s.enemyAt(x, y)) {
          s.tile = { x, y };
          s.placePlayer();
          return d;
        }
      }
      return null;
    });
    await step(dir);
    await wait(1600);
    await press('z', 1, 900);
    await press('ArrowUp', 1, 300);
    await shot('08-descender');
    await press('z');
    await wait(2500);
    const floorNum = await page.evaluate(() => window.__game.registry.get('run').floor);
    await shot('09-piso-2');
    if (floorNum !== 2) throw new Error(`Se esperaba piso 2, piso actual: ${floorNum}`);

    // Guardado: recargar la página y CONTINUAR debe devolver al piso 2 con el mismo nivel.
    const level = await page.evaluate(() => window.__game.registry.get('run').player.level);
    await wait(1500);
    await page.reload();
    await wait(1800);
    await press('Enter', 1, 900);
    await shot('14-titulo-continuar');
    await press('z');
    await wait(1800);
    const loaded = await page.evaluate(() => { const r = window.__game.registry.get('run'); return { floor: r.floor, level: r.player.level }; });
    if (loaded.floor !== 2 || loaded.level !== level) throw new Error(`Continuar falló: ${JSON.stringify(loaded)}`);

    // Corrupción: se daña el guardado actual en IndexedDB; al continuar se restaura el respaldo (piso 1).
    await page.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('nexo', 1);
      req.onsuccess = () => {
        const tx = req.result.transaction('saves', 'readwrite');
        const st = tx.objectStore('saves');
        const g = st.get('run');
        g.onsuccess = () => { const rec = g.result; rec.data = rec.data.slice(0, -40); st.put(rec, 'run'); };
        tx.oncomplete = resolve;
        tx.onerror = reject;
      };
    }));
    await page.reload();
    await wait(1800);
    await press('Enter', 1, 900);
    await press('z');
    await wait(1800);
    await shot('15-recuperado');
    const recovered = await page.evaluate(() => window.__game.registry.get('run').floor);
    if (recovered !== 1) throw new Error(`Se esperaba recuperar el respaldo del piso 1, piso: ${recovered}`);
  }
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
