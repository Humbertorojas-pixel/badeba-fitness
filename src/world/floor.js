import { T, FRAGMENT_OFFSET } from '../gfx/tiles.js';
import { G } from './ground.js';
import { maskAt } from './terrain.js';

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
            tile = T.ROCK_FACE;
            foreign = inFrag(x, y + 1);
          } else {
            let near = false;
            for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (!isRock(x + dx, y + dy)) near = true;
            tile = near ? T.ROCK_TOP : T.VOID;
          }
          break;
        case G.WATER:
          tile = T.WATER + maskAt(watery, x, y);
          break;
        case G.PATH:
          tile = T.PATH + maskAt(pathy, x, y);
          break;
        case G.BRIDGE:
          tile = pathy(x, y - 1) || pathy(x, y + 1) ? T.BRIDGE_V : T.BRIDGE_H;
          break;
        case G.PAVED:
          tile = T.PAVED;
          break;
        default:
          if (grass[i]) tile = T.TALL_GRASS;
          else if (decal[i]) tile = T.DECAL + decal[i] - 1;
          else {
            const n = (x * 7349 + y * 2917) % 11;
            tile = n < 7 ? T.GROUND : n < 10 ? T.GROUND + 1 : T.GROUND + 2;
          }
      }
      row.push(tile + (foreign ? FRAGMENT_OFFSET : 0));
    }
    out.push(row);
  }
  if (floor.stairs) out[floor.stairs.y][floor.stairs.x] = T.STAIRS;
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
  const bonfires = (floor.inspect || []).filter((i) => i.action === 'hoguera');
  return ok(floor.stairs) && floor.enemies.every(ok) && (floor.npcs || []).every(talkable) && bonfires.every(talkable);
}
