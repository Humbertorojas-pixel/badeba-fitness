import { T } from '../gfx/tiles.js';

const DECAL = { '.': T.FLOOR, ',': T.FLOOR_CRACK, b: T.FLOOR_BONES, x: T.FLOOR_BLOOD, m: T.FLOOR_MOSS };

export function parseAscii(rows, { enemyKeys = {}, inspectText = '' } = {}) {
  const h = rows.length;
  const w = rows[0].length;
  const floor = {
    w, h,
    walls: new Uint8Array(w * h),
    decal: new Array(w * h).fill(T.FLOOR),
    blockers: new Set(),
    start: null,
    stairs: null,
    enemies: [],
    torches: [],
    inspect: [],
  };
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`Fila ${y} mide ${row.length}, se esperaba ${w}`);
    [...row].forEach((ch, x) => {
      const i = y * w + x;
      if (ch === '#' || ch === 'T') {
        floor.walls[i] = 1;
        if (ch === 'T') floor.torches.push({ x, y });
        return;
      }
      if (DECAL[ch] !== undefined) floor.decal[i] = DECAL[ch];
      if (ch === 'r') floor.blockers.add(i);
      if (ch === 'S') floor.start = { x, y };
      if (ch === 'E') floor.stairs = { x, y };
      if (ch === '?') {
        floor.decal[i] = T.FLOOR_BONES;
        floor.blockers.add(i);
        floor.inspect.push({ x, y, text: inspectText });
      }
      if (enemyKeys[ch]) floor.enemies.push({ id: `e${floor.enemies.length}`, x, y, key: enemyKeys[ch] });
    });
  });
  return floor;
}

export function isWall(floor, x, y) {
  if (x < 0 || y < 0 || x >= floor.w || y >= floor.h) return true;
  return floor.walls[y * floor.w + x] === 1;
}

export function isBlocked(floor, x, y) {
  return isWall(floor, x, y) || floor.blockers.has(y * floor.w + x);
}

// Capa visual: muro con suelo debajo = cara (perspectiva 3/4); muro rodeado de muro = vacío.
export function computeTiles(floor) {
  const out = [];
  for (let y = 0; y < floor.h; y++) {
    const row = [];
    for (let x = 0; x < floor.w; x++) {
      const i = y * floor.w + x;
      if (!isWall(floor, x, y)) {
        row.push(floor.blockers.has(i) && floor.decal[i] === T.FLOOR ? T.RUBBLE : floor.decal[i]);
        continue;
      }
      if (!isWall(floor, x, y + 1)) {
        row.push(T.WALL_FACE);
        continue;
      }
      let nearFloor = false;
      for (let dy = -1; dy <= 2 && !nearFloor; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (!isWall(floor, x + dx, y + dy)) nearFloor = true;
      }
      row.push(nearFloor ? T.WALL_TOP : T.VOID);
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
  return ok(floor.stairs) && floor.enemies.every(ok);
}
