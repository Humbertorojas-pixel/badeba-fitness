import { createRng, hashSeed } from '../core/rng.js';
import { T } from '../gfx/tiles.js';
import { BIOMES, pickBiome } from './biomes.js';
import { LSYSTEMS, expand, turtle } from './lsystem.js';
import { generateEnemyTemplate } from './enemyGen.js';
import { validateFloor, isWall } from './floor.js';
import { LORE, FRAGMENT_LORE } from '../data/lore.js';

export const FRAGMENT_CHANCE = 0.02;
const DECAL_TILE = { raices: T.FLOOR_ROOTS, sangre: T.FLOOR_BLOOD, escombros: T.FLOOR_DEBRIS, huesos: T.FLOOR_BONES, grietas: T.FLOOR_CRACK };
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function emptyFloor(w, h) {
  return {
    w, h,
    walls: new Uint8Array(w * h).fill(1),
    decal: new Array(w * h).fill(T.FLOOR),
    blockers: new Set(),
    start: null, stairs: null,
    enemies: [], torches: [], inspect: [],
    fragment: null,
  };
}

const idx = (f, x, y) => y * f.w + x;
const carve = (f, x, y) => { f.walls[idx(f, x, y)] = 0; };
// Márgenes: 3 filas arriba (espacio para caras de muro), 2 en los demás lados.
const inBounds = (f, x, y) => x >= 2 && y >= 3 && x < f.w - 2 && y < f.h - 2;

function valueNoise(rng, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => rng.next());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const v = (i, j) => g[(y0 + j) * gw + (x0 + i)];
    const a = v(0, 0) + (v(1, 0) - v(0, 0)) * tx;
    const b = v(0, 1) + (v(1, 1) - v(0, 1)) * tx;
    return a + (b - a) * ty;
  };
}

function corridor(f, rng, a, b) {
  const cells = [];
  const horizontalFirst = rng.chance(0.5);
  let { x, y } = a;
  const stepTo = (tx, ty) => {
    while (x !== tx || y !== ty) {
      if (x !== tx) x += Math.sign(tx - x);
      else y += Math.sign(ty - y);
      if (inBounds(f, x, y)) {
        carve(f, x, y);
        cells.push(idx(f, x, y));
      }
    }
  };
  if (horizontalFirst) { stepTo(b.x, a.y); stepTo(b.x, b.y); } else { stepTo(a.x, b.y); stepTo(b.x, b.y); }
  return cells;
}

// Macro 1: partición BSP en habitaciones rectangulares unidas por pasillos.
function carveRooms(f, rng) {
  const leaves = [];
  const split = (x, y, w, h, d) => {
    const canV = w >= 20;
    const canH = h >= 16;
    if (d >= 5 || (!canV && !canH) || (w * h < 260 && rng.chance(0.35))) {
      const leaf = { x, y, w, h };
      leaves.push(leaf);
      return { leaf };
    }
    const vertical = canV && (!canH || w / h > 1.2 || (w / h > 0.8 && rng.chance(0.5)));
    if (vertical) {
      const cut = rng.int(10, w - 10);
      return { a: split(x, y, cut, h, d + 1), b: split(x + cut, y, w - cut, h, d + 1) };
    }
    const cut = rng.int(8, h - 8);
    return { a: split(x, y, w, cut, d + 1), b: split(x, y + cut, w, h - cut, d + 1) };
  };
  const tree = split(2, 3, f.w - 4, f.h - 5, 0);

  const rooms = leaves.map((l, i) => {
    const rw = rng.int(5, Math.max(5, l.w - 4));
    const rh = rng.int(4, Math.max(4, l.h - 4));
    const rx = l.x + rng.int(1, Math.max(1, l.w - rw - 2));
    const ry = l.y + rng.int(2, Math.max(2, l.h - rh - 1));
    const cells = [];
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if (inBounds(f, x, y)) {
          carve(f, x, y);
          cells.push(idx(f, x, y));
        }
      }
    }
    l.room = { id: i, x: rx, y: ry, w: rw, h: rh, cells, cx: rx + (rw >> 1), cy: ry + (rh >> 1), links: new Set() };
    return l.room;
  });

  const pickRoom = (node) => (node.leaf ? node.leaf.room : pickRoom(rng.chance(0.5) ? node.a : node.b));
  const connect = (node) => {
    if (node.leaf) return;
    connect(node.a);
    connect(node.b);
    const ra = pickRoom(node.a);
    const rb = pickRoom(node.b);
    corridor(f, rng, { x: ra.cx, y: ra.cy }, { x: rb.cx, y: rb.cy });
    ra.links.add(rb.id);
    rb.links.add(ra.id);
  };
  connect(tree);
  for (let i = 0; i < 2 && rooms.length > 3; i++) {
    const [a, b] = rng.shuffle(rooms).slice(0, 2);
    corridor(f, rng, { x: a.cx, y: a.cy }, { x: b.cx, y: b.cy });
    a.links.add(b.id);
    b.links.add(a.id);
  }
  return rooms;
}

// Macro 2: autómata celular para cavernas orgánicas, regiones conectadas por túneles.
function carveCave(f, rng) {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (inBounds(f, x, y) && rng.chance(0.55)) carve(f, x, y);
  for (let it = 0; it < 5; it++) {
    const next = f.walls.slice();
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (!inBounds(f, x, y)) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isWall(f, x + dx, y + dy)) n++;
        next[idx(f, x, y)] = n >= 5 ? 1 : n <= 2 ? 0 : f.walls[idx(f, x, y)];
      }
    }
    f.walls = next;
  }
  const regions = floodRegions(f);
  regions.sort((a, b) => b.length - a.length);
  const keep = regions.filter((r) => r.length >= 25);
  for (const r of regions) if (r.length < 25) for (const i of r) f.walls[i] = 1;
  if (!keep.length) return [];
  const main = new Set(keep[0]);
  for (const r of keep.slice(1)) {
    const a = r[Math.floor(r.length / 2)];
    let best = null;
    let bestD = Infinity;
    for (const m of main) {
      const d = Math.abs((m % f.w) - (a % f.w)) + Math.abs(Math.floor(m / f.w) - Math.floor(a / f.w));
      if (d < bestD) { bestD = d; best = m; }
    }
    corridor(f, rng, { x: a % f.w, y: Math.floor(a / f.w) }, { x: best % f.w, y: Math.floor(best / f.w) });
    for (const i of r) main.add(i);
  }
  // Pseudo-habitaciones por Voronoi sobre el suelo, para repartir contenido.
  const floorCells = [];
  for (let i = 0; i < f.w * f.h; i++) if (!f.walls[i]) floorCells.push(i);
  const seeds = [];
  for (const c of rng.shuffle(floorCells)) {
    const cx = c % f.w;
    const cy = Math.floor(c / f.w);
    if (seeds.every((s) => Math.abs(s.x - cx) + Math.abs(s.y - cy) > 10)) seeds.push({ x: cx, y: cy });
    if (seeds.length >= 9) break;
  }
  const rooms = seeds.map((s, i) => ({ id: i, cells: [], cx: s.x, cy: s.y, links: new Set() }));
  for (const c of floorCells) {
    const cx = c % f.w;
    const cy = Math.floor(c / f.w);
    let bi = 0;
    let bd = Infinity;
    rooms.forEach((r, i) => {
      const d = Math.abs(r.cx - cx) + Math.abs(r.cy - cy);
      if (d < bd) { bd = d; bi = i; }
    });
    rooms[bi].cells.push(c);
  }
  return rooms.filter((r) => r.cells.length >= 12);
}

function floodRegions(f) {
  const seen = new Uint8Array(f.w * f.h);
  const out = [];
  for (let i = 0; i < f.w * f.h; i++) {
    if (f.walls[i] || seen[i]) continue;
    const region = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop();
      region.push(k);
      const x = k % f.w;
      const y = Math.floor(k / f.w);
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (isWall(f, nx, ny)) continue;
        const ni = idx(f, nx, ny);
        if (!seen[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    out.push(region);
  }
  return out;
}

function bfs(f, from) {
  const dist = new Int32Array(f.w * f.h).fill(-1);
  const prev = new Int32Array(f.w * f.h).fill(-1);
  const q = [idx(f, from.x, from.y)];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const x = k % f.w;
    const y = Math.floor(k / f.w);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      const ni = idx(f, nx, ny);
      if (isWall(f, nx, ny) || f.blockers.has(ni) || dist[ni] >= 0) continue;
      dist[ni] = dist[k] + 1;
      prev[ni] = k;
      q.push(ni);
    }
  }
  return { dist, prev };
}

const cellOf = (f, i) => ({ x: i % f.w, y: Math.floor(i / f.w) });
const openAround = (f, i) => { const { x, y } = cellOf(f, i); return N4.every(([dx, dy]) => !isWall(f, x + dx, y + dy)); };

function tryGenerate(seed, depth, forceFragment) {
  const rng = createRng(seed);
  const biomeKey = pickBiome(rng, depth);
  const biome = BIOMES[biomeKey];
  const f = emptyFloor(Math.min(60, 38 + depth * 2), Math.min(44, 30 + depth));
  f.biome = biomeKey;
  f.biomeName = biome.name;
  f.music = biome.music;

  const rooms = biome.macro === 'cave' ? carveCave(f, rng) : carveRooms(f, rng);
  if (rooms.length < 3) return null;

  if (biome.macro === 'ruins') {
    // Muros derrumbados por ruido + escombros: fortaleza que se deshace.
    const noise = valueNoise(rng, f.w, f.h, 5);
    for (let y = 4; y < f.h - 3; y++) {
      for (let x = 3; x < f.w - 3; x++) {
        const i = idx(f, x, y);
        if (f.walls[i] && noise(x, y) > 0.72 && N4.some(([dx, dy]) => !isWall(f, x + dx, y + dy))) carve(f, x, y);
      }
    }
    for (const r of rooms) for (const c of r.cells) if (rng.chance(0.04) && openAround(f, c)) f.blockers.add(c);
  }

  const startRoom = rng.pick(rooms);
  const startCell = startRoom.cells.find((c) => openAround(f, c) && !f.blockers.has(c)) ?? startRoom.cells[0];
  f.blockers.delete(startCell);
  f.start = cellOf(f, startCell);
  const { dist, prev } = bfs(f, f.start);

  let stairsCell = -1;
  for (const r of rooms) for (const c of r.cells) if (!f.blockers.has(c) && dist[c] > (stairsCell < 0 ? -1 : dist[stairsCell])) stairsCell = c;
  if (stairsCell < 0 || dist[stairsCell] < 15) return null;
  f.stairs = cellOf(f, stairsCell);
  const stairsRoom = rooms.find((r) => r.cells.includes(stairsCell));

  const critical = new Set();
  for (let k = stairsCell; k >= 0; k = prev[k]) critical.add(k);

  const taken = new Set([startCell, stairsCell]);
  const free = (c) => !taken.has(c) && !f.blockers.has(c) && !isWall(f, c % f.w, Math.floor(c / f.w));

  // Fragmento multiversal: sala hoja fuera de la ruta crítica, nunca la de inicio ni la de salida.
  if (forceFragment || rng.chance(FRAGMENT_CHANCE)) {
    const leaves = rooms.filter((r) => r !== startRoom && r !== stairsRoom && r.cells.length >= 16 && r.cells.every((c) => !critical.has(c)));
    if (leaves.length) {
      const room = rng.pick(leaves);
      f.fragment = { biome: 'abismo', cells: new Set(room.cells), roomId: room.id };
      const spot = room.cells.find((c) => free(c) && openAround(f, c));
      if (spot !== undefined) {
        taken.add(spot);
        const eseed = hashSeed(seed, 'frag');
        f.enemies.push({ id: 'frag', ...cellOf(f, spot), template: generateEnemyTemplate({ seed: eseed, depth, biome: BIOMES.abismo, foreign: true }) });
      }
      const lore = room.cells.find((c) => free(c) && !openAround(f, c));
      if (lore !== undefined) {
        taken.add(lore);
        f.blockers.add(lore);
        f.decal[lore] = T.FLOOR_BONES;
        f.inspect.push({ ...cellOf(f, lore), text: rng.pick(FRAGMENT_LORE) });
      }
    }
  }

  const enemyCount = Math.min(10, 3 + Math.floor(depth * 0.8));
  const candidates = rng.shuffle(rooms.filter((r) => r !== startRoom && r.id !== f.fragment?.roomId));
  for (let i = 0, placed = 0; placed < enemyCount && i < candidates.length * 3; i++) {
    const room = candidates[i % candidates.length];
    const spots = room.cells.filter((c) => free(c) && dist[c] >= 8 && openAround(f, c)
      && f.enemies.every((e) => Math.abs(e.x - (c % f.w)) + Math.abs(e.y - Math.floor(c / f.w)) > 3));
    if (!spots.length) continue;
    const c = rng.pick(spots);
    taken.add(c);
    const eseed = hashSeed(seed, `e${placed}`);
    f.enemies.push({ id: `e${placed}`, ...cellOf(f, c), template: generateEnemyTemplate({ seed: eseed, depth, biome }) });
    placed++;
  }

  // Antorchas en caras de muro que dan a una sala.
  const faces = [];
  for (let y = 1; y < f.h - 1; y++) for (let x = 1; x < f.w - 1; x++) if (isWall(f, x, y) && !isWall(f, x, y + 1) && isWall(f, x - 1, y) && isWall(f, x + 1, y)) faces.push({ x, y });
  const torchTarget = Math.round(rooms.length * biome.torchRate);
  for (const face of rng.shuffle(faces)) {
    if (f.torches.length >= torchTarget) break;
    if (f.fragment?.cells.has(idx(f, face.x, face.y + 1))) continue;
    if (f.torches.every((t) => Math.abs(t.x - face.x) + Math.abs(t.y - face.y) > 6)) f.torches.push(face);
  }

  // Micro: decoración que crece con L-Systems desde puntos semilla en cada sala.
  for (const r of rooms) {
    const inFrag = f.fragment?.roomId === r.id;
    if (!inFrag && !rng.chance(0.65)) continue;
    const type = inFrag ? 'sangre' : rng.pick(biome.decals);
    const sys = LSYSTEMS[type];
    const str = expand(sys.axiom, sys.rules, sys.iterations);
    const origin = cellOf(f, rng.pick(r.cells));
    turtle(str, origin, rng, (x, y) => {
      if (isWall(f, x, y)) return false;
      const i = idx(f, x, y);
      if (i === stairsCell || f.decal[i] !== T.FLOOR) return false;
      f.decal[i] = DECAL_TILE[type];
      return true;
    }, { skip: sys.skip });
  }
  if (biome.macro === 'cave') {
    const moss = valueNoise(rng, f.w, f.h, 6);
    for (let i = 0; i < f.w * f.h; i++) if (!f.walls[i] && f.decal[i] === T.FLOOR && moss(i % f.w, Math.floor(i / f.w)) > 0.68) f.decal[i] = T.FLOOR_MOSS;
  }

  // Cadáveres con lore contra las paredes de salas lejanas.
  const loreCount = rng.int(0, 2);
  for (let n = 0; n < loreCount; n++) {
    const room = rng.pick(rooms.filter((r) => r !== startRoom && r.id !== f.fragment?.roomId));
    const spot = room && room.cells.find((c) => free(c) && !openAround(f, c) && !critical.has(c));
    if (spot === undefined) continue;
    taken.add(spot);
    f.blockers.add(spot);
    f.decal[spot] = T.FLOOR_BONES;
    f.inspect.push({ ...cellOf(f, spot), text: rng.pick(LORE) });
  }

  f.rooms = rooms.length;
  return f;
}

// Si un intento no pasa la validación, se regenera con la semilla derivada siguiente
// (determinista: la misma semilla de partida produce siempre el mismo piso).
export function generateFloor({ runSeed, depth, forceFragment = false }) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const seed = hashSeed(hashSeed(runSeed, depth), attempt);
    const f = tryGenerate(seed, depth, forceFragment);
    if (f && validateFloor(f)) {
      f.seed = seed;
      f.attempts = attempt + 1;
      return f;
    }
  }
  throw new Error(`No se pudo generar el piso ${depth} (semilla ${runSeed})`);
}
