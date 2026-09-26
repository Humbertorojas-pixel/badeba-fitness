import { PixelBuffer, addStrip } from './pixelBuffer.js';
import { PAL } from '../palette.js';
import { createRng } from '../core/rng.js';

// Índices de tile dentro del bloque de un bioma. PATH y WATER ocupan 16 variantes (autotile).
export const T = {
  VOID: 0, ROCK_TOP: 1, ROCK_FACE: 2, GROUND: 3, TALL_GRASS: 6, PAVED: 7,
  BRIDGE_H: 8, BRIDGE_V: 9, STAIRS: 10, DECAL: 11, PATH: 16, WATER: 32,
};
export const TILES_PER_BIOME = 64;
// Los tiles de un fragmento multiversal usan el mismo índice + FRAGMENT_OFFSET.
export const FRAGMENT_OFFSET = TILES_PER_BIOME;

const N = 1;
const E = 2;
const S = 4;
const W = 8;

function groundTile(B, seed, variant) {
  const rng = createRng(seed + variant * 101);
  const [dark, mid, light] = B.ground.colors;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, mid);
  const style = B.ground.style;
  if (style === 'grass') {
    const tufts = 5 + variant * 3;
    for (let i = 0; i < tufts; i++) {
      const x = rng.int(1, 13);
      const y = rng.int(2, 14);
      b.set(x, y, light).set(x + 2, y, light).set(x + 1, y + 1, dark).set(x, y + 1, dark);
    }
    if (variant === 2) b.set(rng.int(3, 12), rng.int(3, 12), PAL.bone2).set(rng.int(3, 12), rng.int(3, 12), PAL.ember2);
  } else if (style === 'mud') {
    for (let i = 0; i < 2 + variant; i++) {
      const x = rng.int(2, 12);
      const y = rng.int(3, 12);
      b.ellipse(x + 1, y, rng.int(1, 3), 1.2, dark).set(x, y - 1, light);
    }
    for (let i = 0; i < 10; i++) b.set(rng.int(0, 15), rng.int(0, 15), rng.chance(0.5) ? dark : light);
  } else if (style === 'paved') {
    b.rect(0, 0, 16, 16, dark);
    const stones = [[0, 0, 7, 5], [8, 0, 8, 6], [0, 6, 5, 5], [6, 7, 10, 4], [0, 12, 9, 4], [10, 12, 6, 4]];
    for (const [x, y, sw, sh] of stones) {
      b.rect(x, y, sw - 1, sh - 1, mid).rect(x, y, sw - 1, 1, light);
      if (rng.chance(0.3 + variant * 0.2)) b.set(x + rng.int(1, sw - 2), y + rng.int(1, sh - 2), dark);
    }
  } else {
    for (let i = 0; i < 16 + variant * 6; i++) b.set(rng.int(0, 15), rng.int(0, 15), rng.chance(0.55) ? dark : light);
    if (variant > 0) {
      const x = rng.int(2, 12);
      const y = rng.int(2, 12);
      b.ellipse(x + 0.5, y + 0.5, 1.4, 1, light).set(x, y + 1, dark).set(x + 1, y + 1, dark);
    }
  }
  return b;
}

// Hierba alta de Pokémon: matas en dos filas sobre el tono del suelo. `front` dibuja solo la
// fila delantera, que se pinta encima del jugador para taparle las piernas.
function grassTufts(B, front = false) {
  const [dark, mid, light] = B.tallGrass;
  const b = new PixelBuffer(16, 16);
  if (!front) b.rect(0, 0, 16, 16, B.ground.colors[1]);
  const tuft = (bx, by) => {
    const heights = [3, 5, 6, 4, 6, 5, 3];
    heights.forEach((hgt, i) => {
      b.line(bx + i, by, bx + i, by - hgt + 1, i % 3 === 0 ? dark : mid);
      if (i % 2 === 1) b.set(bx + i, by - hgt + 1, light);
    });
    b.line(bx + 1, by, bx + 5, by, dark);
  };
  if (!front) {
    tuft(0, 7);
    tuft(8, 7);
  }
  tuft(4, 15);
  tuft(-4, 15);
  tuft(12, 15);
  return b;
}

function jaggedEdges(b, mask, rng, fillColor, rimColor, depthMin = 1, depthMax = 3) {
  const sides = [[N, (i, d) => [i, d]], [S, (i, d) => [i, 15 - d]], [W, (i, d) => [d, i]], [E, (i, d) => [15 - d, i]]];
  for (const [bit, at] of sides) {
    if (mask & bit) continue;
    let depth = rng.int(depthMin, depthMax);
    for (let i = 0; i < 16; i++) {
      if (rng.chance(0.35)) depth = Math.max(depthMin, Math.min(depthMax, depth + rng.int(-1, 1)));
      for (let d = 0; d < depth; d++) b.set(...at(i, d), fillColor);
      b.set(...at(i, depth), rimColor);
    }
  }
}

function pathTile(B, mask) {
  const rng = createRng(4242 + mask);
  const [dark, mid, light] = B.path;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, mid);
  for (let i = 0; i < 14; i++) b.set(rng.int(0, 15), rng.int(0, 15), rng.chance(0.5) ? dark : light);
  jaggedEdges(b, mask, rng, B.ground.colors[1], dark, 1, 3);
  return b;
}

function waterTile(B, mask) {
  const rng = createRng(777 + mask);
  const [deep, mid, light] = B.water;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, mid);
  if (B.lavaWater) {
    for (let i = 0; i < 6; i++) b.line(rng.int(0, 12), rng.int(1, 14), rng.int(3, 15), rng.int(1, 14), PAL.blood1);
    for (let i = 0; i < 7; i++) b.set(rng.int(1, 14), rng.int(1, 14), PAL.ember2);
    jaggedEdges(b, mask, rng, PAL.ink, PAL.shade, 1, 2);
    return b;
  }
  for (let y = 2; y < 16; y += 4) {
    const x = rng.int(0, 10);
    b.line(x, y, x + rng.int(2, 5), y, light);
    b.set(rng.int(0, 15), y + 1, deep);
  }
  // Orilla superior: talud de tierra oscura y espuma (perspectiva 3/4).
  if (!(mask & N)) b.rect(0, 0, 16, 3, B.ground.colors[0]).rect(0, 3, 16, 1, light);
  if (!(mask & S)) b.rect(0, 15, 16, 1, light);
  if (!(mask & W)) b.rect(0, 0, 1, 16, light);
  if (!(mask & E)) b.rect(15, 0, 1, 16, light);
  return b;
}

function bridgeTile(vertical) {
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, PAL.rust1);
  for (let k = 0; k < 16; k += 4) {
    if (vertical) b.rect(0, k, 16, 1, PAL.rust0).rect(2, k + 1, 12, 1, PAL.rust2);
    else b.rect(k, 0, 1, 16, PAL.rust0).rect(k + 1, 2, 1, 12, PAL.rust2);
  }
  if (vertical) b.rect(0, 0, 2, 16, PAL.rust0).rect(14, 0, 2, 16, PAL.rust0).rect(1, 0, 1, 16, PAL.rust2);
  else b.rect(0, 0, 16, 2, PAL.rust0).rect(0, 14, 16, 2, PAL.ink).rect(0, 1, 16, 1, PAL.rust2);
  return b;
}

function rockTop(B, seed) {
  const rng = createRng(seed);
  const [d0, d1, d2, d3] = B.rock.top;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, d1);
  for (let i = 0; i < 7; i++) {
    const x = rng.int(0, 13);
    const y = rng.int(0, 13);
    b.ellipse(x + 1.5, y + 1.5, rng.int(1, 3), rng.int(1, 2), d2);
    b.set(x + 1, y, d3);
  }
  for (let i = 0; i < 10; i++) b.set(rng.int(0, 15), rng.int(0, 15), d0);
  return b;
}

function rockFace(B, seed) {
  const rng = createRng(seed);
  const [mortar, base, alt, hi] = B.rock.face;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, mortar);
  if (B.rock.style === 'brick') {
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const off = row % 2 === 0 ? 0 : 4;
      for (let x = -8 + off; x < 16; x += 8) {
        b.rect(x + 1, y + 1, 7, 3, rng.chance(0.25) ? alt : base).rect(x + 1, y + 1, 7, 1, hi);
      }
    }
  } else {
    b.rect(0, 0, 16, 16, base);
    for (let x = 0; x < 16; x += rng.int(2, 4)) {
      const top = rng.int(0, 4);
      b.line(x, top, x + rng.int(-1, 1), 13, mortar).set(x + 1, top + 1, hi);
    }
    for (let i = 0; i < 8; i++) b.set(rng.int(0, 15), rng.int(2, 12), rng.chance(0.5) ? alt : hi);
  }
  return b.rect(0, 0, 16, 1, hi).rect(0, 14, 16, 2, PAL.ink).rect(0, 13, 16, 1, mortar);
}

function stairsTile(B) {
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, B.path[1]);
  b.ellipse(8, 8.5, 7.5, 6.5, PAL.stone2).ellipse(8, 8.5, 6.5, 5.5, PAL.stone0);
  const steps = [PAL.dusk, PAL.shade, PAL.night, PAL.ink];
  steps.forEach((c, i) => b.ellipse(8 + i * 0.4, 9 + i * 0.5, 5.5 - i * 1.2, 4.5 - i, c));
  return b.set(4, 5, PAL.stone3).set(10, 4, PAL.stone3);
}

const DECALS = {
  raices: (b, rng) => {
    let x = 0;
    let y = rng.int(4, 11);
    while (x < 16) {
      b.set(x, y, PAL.rust0).set(x, y - 1, PAL.rust1);
      x++;
      y = Math.max(2, Math.min(14, y + rng.int(-1, 1)));
    }
  },
  flores: (b, rng) => {
    for (let i = 0; i < 4; i++) {
      const x = rng.int(2, 13);
      const y = rng.int(3, 13);
      const c = rng.pick([PAL.bone2, PAL.ember2, PAL.blood3, PAL.steel3]);
      b.set(x, y + 1, PAL.moss0).set(x, y, c).set(x - 1, y, c).set(x + 1, y, c).set(x, y - 1, c).set(x, y, PAL.ember1);
    }
  },
  musgo: (b, rng) => {
    for (let i = 0; i < 20; i++) b.set(rng.int(0, 15), rng.int(0, 15), rng.chance(0.6) ? PAL.moss1 : PAL.moss2);
  },
  huesos: (b, rng) => {
    b.line(4, 10, 9, 8, PAL.bone1).set(3, 10, PAL.bone2).set(4, 11, PAL.bone2).set(10, 8, PAL.bone2);
    b.ellipse(11.5, 11.5, 2, 1.6, PAL.bone1).set(11, 11, PAL.ink).set(12, 11, PAL.ink);
    b.set(rng.int(2, 6), rng.int(3, 5), PAL.bone0);
  },
  grietas: (b, rng, B) => {
    let x = rng.int(3, 12);
    let y = rng.int(1, 4);
    for (let i = 0; i < 11; i++) {
      b.set(x, y, B.ground.colors[0]);
      x += rng.int(-1, 1);
      y += 1;
    }
  },
  sangre: (b, rng) => {
    b.ellipse(8, 9, 4.5, 3, PAL.blood0).ellipse(7, 8.5, 2.5, 1.8, PAL.blood1);
    for (let i = 0; i < 5; i++) b.set(rng.int(2, 13), rng.int(3, 14), PAL.blood0);
  },
  escombros: (b, rng, B) => {
    for (let i = 0; i < 6; i++) {
      const x = rng.int(2, 13);
      const y = rng.int(2, 13);
      b.rect(x, y, 2, 1, B.path[2]).set(x, y + 1, PAL.ink);
    }
  },
};

export function biomeFrames(B, seed = 7331) {
  const frames = Array.from({ length: TILES_PER_BIOME }, () => new PixelBuffer(16, 16));
  frames[T.VOID] = new PixelBuffer(16, 16).rect(0, 0, 16, 16, PAL.ink);
  frames[T.ROCK_TOP] = rockTop(B, seed + 1);
  frames[T.ROCK_FACE] = rockFace(B, seed + 2);
  for (let v = 0; v < 3; v++) frames[T.GROUND + v] = groundTile(B, seed + 3, v);
  frames[T.TALL_GRASS] = grassTufts(B);
  frames[T.PAVED] = groundTile({ ...B, ground: { style: 'paved', colors: B.path } }, seed + 7, 1);
  frames[T.BRIDGE_H] = bridgeTile(false);
  frames[T.BRIDGE_V] = bridgeTile(true);
  frames[T.STAIRS] = stairsTile(B);
  (B.decals || ['sangre', 'grietas', 'huesos']).forEach((name, i) => {
    const f = groundTile(B, seed + 20 + i, 0);
    DECALS[name](f, createRng(seed + 40 + i), B);
    frames[T.DECAL + i] = f;
  });
  for (let m = 0; m < 16; m++) {
    frames[T.PATH + m] = pathTile(B, m);
    frames[T.WATER + m] = waterTile(B, m);
  }
  return frames;
}

// Tileset del piso: bioma base en 0..63 y (opcional) bioma del fragmento en 64..127.
export function buildTileset(scene, B, fragmentB = null, key = 'tiles') {
  const frames = biomeFrames(B);
  if (fragmentB) frames.push(...biomeFrames({ ...fragmentB, decals: ['sangre', 'grietas', 'sangre'] }, 9119));
  addStrip(scene, key, frames);
  addStrip(scene, `${key}_grass`, [grassTufts(B, true)]);
  return key;
}
