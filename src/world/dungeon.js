import { createRng, hashSeed } from '../core/rng.js';
import { BIOMES } from './biomes.js';
import { PROPS, footprint } from './props.js';
import { valueNoise, mst, N4 } from './terrain.js';
import { generateEnemyTemplate } from './enemyGen.js';
import { validateFloor } from './floor.js';
import { G } from './ground.js';
import { DUNGEON_LORE } from '../data/lore.js';

// Mazmorras dentro del piso: cuevas talladas por autómata celular o criptas de salas y pasillos.
// Oscuras, más pobladas que la región, con cofres y un jefe en lo más hondo.
export function dungeonSize(depth) {
  return { w: Math.min(76, 54 + depth * 2), h: Math.min(58, 42 + depth * 2) };
}

function carveCave(rng, w, h, ground) {
  const idx = (x, y) => y * w + x;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells[idx(x, y)] = x < 2 || y < 3 || x >= w - 2 || y >= h - 2 || rng.chance(0.45) ? 1 : 0;
  for (let it = 0; it < 5; it++) {
    const next = cells.slice();
    for (let y = 3; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && cells[idx(x + dx, y + dy)]) n++;
        next[idx(x, y)] = n >= 5 || (it < 2 && n === 0) ? 1 : 0;
      }
    }
    cells.set(next);
  }
  for (let i = 0; i < w * h; i++) ground[i] = cells[i] ? G.ROCK : G.GROUND;
}

function carveCrypt(rng, w, h, ground) {
  const idx = (x, y) => y * w + x;
  ground.fill(G.ROCK);
  const rooms = [];
  for (let t = 0; t < 200 && rooms.length < Math.floor((w * h) / 220); t++) {
    const rw = rng.int(5, 9);
    const rh = rng.int(4, 7);
    const x = rng.int(3, w - rw - 3);
    const y = rng.int(4, h - rh - 3);
    if (rooms.some((r) => x < r.x + r.w + 2 && x + rw + 2 > r.x && y < r.y + r.h + 3 && y + rh + 3 > r.y)) continue;
    rooms.push({ x, y, w: rw, h: rh, cx: x + Math.floor(rw / 2), cy: y + Math.floor(rh / 2) });
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) ground[idx(x, y)] = G.PAVED;
  const edges = mst(rooms.map((r) => ({ x: r.cx, y: r.cy })));
  for (let i = 0; i < 2 && rooms.length > 3; i++) edges.push([rng.int(0, rooms.length - 1), rng.int(0, rooms.length - 1)]);
  for (const [a, b] of edges) {
    const p = rooms[a];
    const q = rooms[b];
    const horizontalFirst = rng.chance(0.5);
    const cx = horizontalFirst ? q.cx : p.cx;
    const cy = horizontalFirst ? p.cy : q.cy;
    for (const [x0, y0, x1, y1] of [[p.cx, p.cy, cx, cy], [cx, cy, q.cx, q.cy]]) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) ground[idx(x, y0)] = G.PAVED;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) ground[idx(x0, y)] = G.PAVED;
    }
  }
  return rooms;
}

function tryDungeon(seed, depth, themeKey, id, name) {
  const rng = createRng(seed);
  const B = BIOMES[themeKey];
  const crypt = B.dungeon === 'cripta';
  const { w, h } = dungeonSize(depth);
  const N = w * h;
  const idx = (x, y) => y * w + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const ground = new Uint8Array(N);
  const occ = new Uint8Array(N);
  const f = {
    w, h, ground, grass: new Uint8Array(N), decal: new Uint8Array(N), props: [],
    walls: new Uint8Array(N), seen: new Uint8Array(N), blockers: new Set(),
    start: null, stairs: null, enemies: [], npcs: [], inspect: [], zones: [], fragment: null, shafts: [],
    biome: themeKey, biomeName: name, music: B.music, dungeon: id, dark: true, seed,
  };
  const gAt = (x, y) => (inside(x, y) ? ground[idx(x, y)] : G.ROCK);
  const floorish = (x, y) => [G.GROUND, G.PAVED].includes(gAt(x, y));
  const rooms = crypt ? carveCrypt(rng, w, h, ground) : (carveCave(rng, w, h, ground), null);

  // Nos quedamos con la región transitable más grande.
  const seen = new Int32Array(N).fill(-1);
  let best = [];
  for (let i = 0; i < N; i++) {
    if (seen[i] >= 0 || !floorish(i % w, Math.floor(i / w))) continue;
    const comp = [i];
    seen[i] = i;
    for (let k = 0; k < comp.length; k++) {
      const x = comp[k] % w;
      const y = Math.floor(comp[k] / w);
      for (const [dx, dy] of N4) {
        const ni = idx(x + dx, y + dy);
        if (inside(x + dx, y + dy) && seen[ni] < 0 && floorish(x + dx, y + dy)) { seen[ni] = i; comp.push(ni); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  if (best.length < N * (crypt ? 0.1 : 0.22)) return null;
  const main = new Set(best);
  for (let i = 0; i < N; i++) if (!main.has(i)) ground[i] = G.ROCK;
  const cell = (k) => ({ x: k % w, y: Math.floor(k / w) });

  // Charcas (agua o lava de la región) en las cuevas.
  if (!crypt) {
    const pool = valueNoise(rng.fork('pool'), w, h, 6);
    for (const k of best) {
      const { x, y } = cell(k);
      if (pool(x, y) < 0.2 && N4.every(([dx, dy]) => gAt(x + dx, y + dy) !== G.ROCK)) ground[k] = G.WATER;
    }
  }

  // Salida: una escala de cuerda en el borde superior de una sala o galería.
  const exits = best.map(cell).filter((c) => floorish(c.x, c.y) && gAt(c.x, c.y - 1) === G.ROCK && floorish(c.x, c.y + 1) && floorish(c.x, c.y + 2));
  if (!exits.length) return null;
  const exit = crypt ? exits.sort((a, b) => Math.hypot(a.x - rooms[0].cx, a.y - rooms[0].cy) - Math.hypot(b.x - rooms[0].cx, b.y - rooms[0].cy))[0] : rng.pick(exits);
  f.stairs = exit;
  f.start = { x: exit.x, y: exit.y + 1 };
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

  const place = (k, x, y, v = 0, extra = {}) => {
    const prop = { k, x, y, v, ...extra };
    const fp = footprint(prop);
    if (!fp.every(([fx, fy]) => floorish(fx, fy) && !occ[idx(fx, fy)] && dist({ x: fx, y: fy }, exit) > 2.5)) return null;
    if (y - PROPS[k].h + 1 < 0) return null;
    for (const [fx, fy] of fp) occ[idx(fx, fy)] = 1;
    f.props.push(prop);
    return prop;
  };
  f.props.push({ k: 'salida', x: exit.x, y: exit.y, v: 0 });
  occ[idx(exit.x, exit.y)] = 1;

  // Distancias desde la entrada: el jefe espera en lo más hondo.
  const far = new Int32Array(N).fill(-1);
  const q = [idx(f.start.x, f.start.y)];
  far[q[0]] = 0;
  for (let k = 0; k < q.length; k++) {
    const { x, y } = cell(q[k]);
    for (const [dx, dy] of N4) {
      const ni = idx(x + dx, y + dy);
      if (inside(x + dx, y + dy) && far[ni] < 0 && floorish(x + dx, y + dy)) { far[ni] = far[q[k]] + 1; q.push(ni); }
    }
  }
  const deepest = cell(q[q.length - 1]);
  if (far[q[q.length - 1]] < 18) return null;

  // Decoración según el tema.
  if (crypt) {
    for (const r of rooms) {
      if (r.w >= 7 && rng.chance(0.6)) place('sarcofago', r.cx - 1, r.cy);
      for (const [cx, cy] of [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]]) if (rng.chance(0.5)) place('vela', cx, cy);
      if (r.w >= 8 && r.h >= 6 && rng.chance(0.5)) { place('columna', r.x + 1, r.y + 2); place('columna', r.x + r.w - 2, r.y + 2); }
    }
  }
  const nearRock = (x, y) => [[0, -1], [-1, 0], [1, 0]].some(([dx, dy]) => gAt(x + dx, y + dy) === G.ROCK);
  for (const [kind, rate, cond] of B.decor) {
    for (const k of best) {
      const { x, y } = cell(k);
      if (!floorish(x, y) || occ[k]) continue;
      if (cond === 'roca' && !nearRock(x, y)) continue;
      if (rng.chance(rate)) place(kind, x, y, rng.int(0, 1));
    }
  }
  // Antorchas en las paredes (caras de roca con suelo delante).
  for (const k of best) {
    const { x, y } = cell(k);
    if (gAt(x, y - 1) === G.ROCK && gAt(x, y - 2) === G.ROCK && floorish(x, y) && rng.chance(crypt ? 0.05 : 0.02)) f.props.push({ k: 'antorcha', x, y: y - 1, v: 0 });
  }
  for (let i = 0; i < Math.floor(N / 90); i++) {
    const { x, y } = cell(rng.pick(best));
    if (floorish(x, y) && !occ[idx(x, y)]) f.decal[idx(x, y)] = rng.int(1, 3);
  }

  // Paredes: roca, agua y la base de cada elemento.
  for (let i = 0; i < N; i++) f.walls[i] = ground[i] === G.ROCK || ground[i] === G.WATER || occ[i] ? 1 : 0;
  f.walls[idx(exit.x, exit.y)] = 0;

  const free = (c) => floorish(c.x, c.y) && !occ[idx(c.x, c.y)] && !f.walls[idx(c.x, c.y)];
  const spot = (near, minD, maxD) => {
    for (let t = 0; t < 200; t++) {
      const c = { x: near.x + rng.int(-maxD, maxD), y: near.y + rng.int(-maxD, maxD) };
      if (inside(c.x, c.y) && free(c) && dist(c, near) >= minD && dist(c, near) <= maxD && N4.filter(([dx, dy]) => free({ x: c.x + dx, y: c.y + dy })).length >= 2) return c;
    }
    return null;
  };

  // Jefe y su cofre, en el punto más hondo.
  const bossAt = spot(deepest, 0, 3);
  if (!bossAt) return null;
  occ[idx(bossAt.x, bossAt.y)] = 1;
  const bossRank = rng.chance(0.35 + depth * 0.03) ? 'legendario' : 'raro';
  f.enemies.push({ id: `${id}_boss`, ...bossAt, home: bossAt, boss: true, template: generateEnemyTemplate({ seed: hashSeed(seed, 'boss'), depth, biome: B, rank: bossRank }) });
  const chests = [];
  const bossChest = spot(bossAt, 1.5, 4);
  if (bossChest) chests.push({ ...bossChest, boss: true });
  const chestCount = rng.int(2, 3);
  for (let t = 0; t < 200 && chests.length < chestCount + 1; t++) {
    const c = cell(rng.pick(best));
    if (!free(c) || far[idx(c.x, c.y)] < 10 || chests.some((o) => dist(o, c) < 10) || !nearRock(c.x, c.y)) continue;
    chests.push(c);
  }
  chests.forEach((c, i) => {
    const cid = `${id}_c${i}`;
    if (!place('cofre', c.x, c.y, 0, { id: cid })) return;
    f.walls[idx(c.x, c.y)] = 1;
    f.inspect.push({ x: c.x, y: c.y, action: 'cofre', id: cid, boss: !!c.boss });
  });

  // Inscripciones.
  for (let i = 0; i < 2; i++) {
    const c = cell(rng.pick(best));
    if (free(c) && nearRock(c.x, c.y) && place('huesos', c.x, c.y)) f.inspect.push({ x: c.x, y: c.y, text: rng.pick(DUNGEON_LORE) });
  }

  // Criaturas: más densas que en la región.
  const count = Math.min(18, 8 + Math.floor(depth * 1.5));
  for (const k of rng.shuffle(best.slice())) {
    if (f.enemies.length > count) break;
    const c = cell(k);
    if (!free(c) || far[k] < 8 || occ[k] || f.enemies.some((e) => dist(e, c) < 5)) continue;
    occ[k] = 1;
    const eid = `${id}_e${f.enemies.length}`;
    f.enemies.push({ id: eid, ...c, home: c, template: generateEnemyTemplate({ seed: hashSeed(seed, eid), depth, biome: B }) });
  }
  for (const e of f.enemies) f.walls[idx(e.x, e.y)] = 0;
  for (const it of f.inspect) if (!f.walls[idx(it.x, it.y)]) f.blockers.add(idx(it.x, it.y));
  f.zones.push({ name, kind: 'mazmorra', x: Math.floor(w / 2), y: Math.floor(h / 2), r: 999 });
  f.bossRank = bossRank;
  return f;
}

// Determinista: la misma entrada genera siempre la misma mazmorra.
export function generateDungeon({ seed, depth, theme, id, name }) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const f = tryDungeon(hashSeed(seed, attempt), depth, theme, id, name);
    if (f && validateFloor(f)) return f;
  }
  throw new Error(`No se pudo generar la mazmorra ${id}`);
}
