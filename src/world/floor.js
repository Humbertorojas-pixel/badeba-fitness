import { T, FRAGMENT_OFFSET } from '../gfx/tiles.js';

export function isWall(floor, x, y) {
  if (x < 0 || y < 0 || x >= floor.w || y >= floor.h) return true;
  return floor.walls[y * floor.w + x] === 1;
}

export function isBlocked(floor, x, y) {
  return isWall(floor, x, y) || floor.blockers.has(y * floor.w + x);
}

// Capa visual: muro con suelo debajo = cara (perspectiva 3/4); muro rodeado de muro = vacío.
// Las celdas del fragmento multiversal (y sus muros vecinos) usan el tileset del otro bioma.
export function computeTiles(floor) {
  const frag = floor.fragment?.cells;
  const inFrag = (x, y) => !!frag && x >= 0 && y >= 0 && x < floor.w && y < floor.h && frag.has(y * floor.w + x);
  const out = [];
  for (let y = 0; y < floor.h; y++) {
    const row = [];
    for (let x = 0; x < floor.w; x++) {
      const i = y * floor.w + x;
      let tile;
      let foreign = inFrag(x, y);
      if (!isWall(floor, x, y)) {
        tile = floor.blockers.has(i) && floor.decal[i] === T.FLOOR ? T.RUBBLE : floor.decal[i];
      } else if (!isWall(floor, x, y + 1)) {
        tile = T.WALL_FACE;
        foreign = inFrag(x, y + 1);
      } else {
        let nearFloor = false;
        for (let dy = -1; dy <= 2; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!isWall(floor, x + dx, y + dy)) nearFloor = true;
            if (inFrag(x + dx, y + dy)) foreign = true;
          }
        }
        tile = nearFloor ? T.WALL_TOP : T.VOID;
        if (tile === T.VOID) foreign = false;
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
  while (queue.length) {
    const [x, y] = queue.shift();
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

// Todas las casillas críticas (escalera, enemigos) deben ser alcanzables desde el inicio.
export function validateFloor(floor) {
  if (!floor.start || !floor.stairs) return false;
  const seen = reachable(floor, floor.start);
  const ok = (p) => seen[p.y * floor.w + p.x] === 1;
  // Los NPC son bloqueantes: se comprueba que alguna casilla vecina sea alcanzable.
  const talkable = (n) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ok({ x: n.x + dx, y: n.y + dy }) && !isBlocked(floor, n.x + dx, n.y + dy));
  return ok(floor.stairs) && floor.enemies.every(ok) && (floor.npcs || []).every(talkable);
}
