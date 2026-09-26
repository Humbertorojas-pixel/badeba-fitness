import { T, FRAGMENT_OFFSET, INNER } from '../gfx/tiles.js';
import { G } from './ground.js';
import { maskAt, valueNoise } from './terrain.js';
import { createRng } from '../core/rng.js';

export function isWall(floor, x, y) {
  if (x < 0 || y < 0 || x >= floor.w || y >= floor.h) return true;
  return floor.walls[y * floor.w + x] === 1;
}

export function isBlocked(floor, x, y) {
  return isWall(floor, x, y) || floor.blockers.has(y * floor.w + x);
}

// Capa visual del suelo. Caminos y agua usan autotiles (16 variantes según vecinos);
// la roca con suelo debajo muestra su cara (perspectiva 3/4); la roca profunda es vacío.
export function computeTiles(floor) {
  const { w, h, ground, grass, decal } = floor;
  const frag = floor.fragment?.cells;
  const gAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? G.ROCK : ground[y * w + x]);
  const inFrag = (x, y) => !!frag && x >= 0 && y >= 0 && x < w && y < h && frag.has(y * w + x);
  const isRock = (x, y) => gAt(x, y) === G.ROCK;
  const watery = (x, y) => [G.WATER, G.BRIDGE, G.ROCK].includes(gAt(x, y));
  const pathy = (x, y) => [G.PATH, G.BRIDGE, G.PAVED].includes(gAt(x, y));
  // Humor del suelo a gran escala (sombrío / normal / frondoso), estable por semilla del piso.
  const mood = valueNoise(createRng(((floor.seed || 1) ^ 0x5eed) >>> 0), w, h, 9);
  const out = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let foreign = inFrag(x, y);
      let tile;
      switch (ground[i]) {
        case G.ROCK:
          if (!isRock(x, y + 1)) {
            // Pared de dos casillas si hay roca encima: más alta y más imponente.
            tile = isRock(x, y - 1) ? T.ROCK_FACE_LOW : T.ROCK_FACE;
            foreign = inFrag(x, y + 1);
          } else if (!isRock(x, y + 2) && y + 2 < h) {
            tile = T.ROCK_FACE_HI;
            foreign = inFrag(x, y + 2);
          } else {
            let near = false;
            for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (!isRock(x + dx, y + dy)) near = true;
            tile = !near ? T.VOID : (x * 31 + y * 17) % 5 === 0 ? T.ROCK_TOP_ALT : T.ROCK_TOP;
          }
          break;
        case G.WATER: {
          const m = maskAt(watery, x, y);
          const deep = m === 15 && watery(x - 1, y - 1) && watery(x + 1, y - 1) && watery(x - 1, y + 1) && watery(x + 1, y + 1)
            && gAt(x, y - 2) === G.WATER && gAt(x, y + 2) === G.WATER && gAt(x - 2, y) === G.WATER && gAt(x + 2, y) === G.WATER;
          tile = deep ? T.WATER_DEEP : T.WATER + m;
          break;
        }
        case G.PATH:
          tile = T.PATH + maskAt(pathy, x, y);
          break;
        case G.BRIDGE:
          tile = pathy(x, y - 1) || pathy(x, y + 1) ? T.BRIDGE_V : T.BRIDGE_H;
          break;
        case G.PAVED:
          tile = T.PAVED;
          break;
        case G.FIELD:
          tile = x % 2 ? T.FIELD_ALT : T.FIELD;
          break;
        default:
          if (grass[i]) tile = (x * 5 + y * 3 + ((x * y) % 7)) % 3 === 0 ? T.TALL_GRASS_ALT : T.TALL_GRASS;
          else if (decal[i]) tile = T.DECAL + decal[i] - 1;
          else if (isRock(x, y - 1)) tile = T.GROUND_SHADE;
          else {
            const n = (x * 7349 + y * 2917) % 11;
            const v = n < 7 ? 0 : n < 10 ? 1 : 2;
            const m = mood(x, y);
            tile = (m < 0.36 ? T.GROUND_DARK : m > 0.64 ? T.GROUND_LUSH : T.GROUND) + v;
          }
      }
      row.push(tile + (foreign ? FRAGMENT_OFFSET : 0));
    }
    out.push(row);
  }
  if (floor.stairs) out[floor.stairs.y][floor.stairs.x] = T.STAIRS;
  return out;
}

// Capa superior: esquinas cóncavas de agua y caminos (-1 = vacío).
export function computeOverlay(floor) {
  const { w, h, ground } = floor;
  const frag = floor.fragment?.cells;
  const gAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? G.ROCK : ground[y * w + x]);
  const watery = (x, y) => [G.WATER, G.BRIDGE, G.ROCK].includes(gAt(x, y));
  const pathy = (x, y) => [G.PATH, G.BRIDGE, G.PAVED].includes(gAt(x, y));
  const corners = (test, x, y) => {
    let m = 0;
    if (test(x, y - 1) && test(x - 1, y) && !test(x - 1, y - 1)) m |= INNER.NW;
    if (test(x, y - 1) && test(x + 1, y) && !test(x + 1, y - 1)) m |= INNER.NE;
    if (test(x, y + 1) && test(x - 1, y) && !test(x - 1, y + 1)) m |= INNER.SW;
    if (test(x, y + 1) && test(x + 1, y) && !test(x + 1, y + 1)) m |= INNER.SE;
    return m;
  };
  const out = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const g = ground[y * w + x];
      let t = -1;
      if (g === G.WATER) {
        const m = corners(watery, x, y);
        if (m) t = T.WATER_IN + m;
      } else if (g === G.PATH) {
        const m = corners(pathy, x, y);
        if (m) t = T.PATH_IN + m;
      }
      if (t >= 0 && frag?.has(y * w + x)) t += FRAGMENT_OFFSET;
      row.push(t);
    }
    out.push(row);
  }
  return out;
}

export function reachable(floor, from) {
  const seen = new Uint8Array(floor.w * floor.h);
  const queue = [[from.x, from.y]];
  seen[from.y * floor.w + from.x] = 1;
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const i = ny * floor.w + nx;
      if (isBlocked(floor, nx, ny) || seen[i]) continue;
      seen[i] = 1;
      queue.push([nx, ny]);
    }
  }
  return seen;
}

// Todo lo importante (descenso, criaturas, NPC, hogueras) debe ser alcanzable desde el inicio.
export function validateFloor(floor) {
  if (!floor.start || !floor.stairs) return false;
  const seen = reachable(floor, floor.start);
  const ok = (p) => seen[p.y * floor.w + p.x] === 1;
  const talkable = (n) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isBlocked(floor, n.x + dx, n.y + dy) && ok({ x: n.x + dx, y: n.y + dy }));
  const bonfires = (floor.inspect || []).filter((i) => ['hoguera', 'cofre', 'mazmorra', 'posada', 'capilla'].includes(i.action));
  return ok(floor.stairs) && floor.enemies.every(ok) && (floor.npcs || []).every(talkable) && bonfires.every(talkable);
}
