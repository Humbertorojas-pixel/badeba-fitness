import { PixelBuffer, addStrip } from './pixelBuffer.js';
import { PAL } from '../palette.js';
import { createRng } from '../core/rng.js';

export const T = {
  VOID: 0,
  FLOOR: 1,
  FLOOR_CRACK: 2,
  FLOOR_BONES: 3,
  FLOOR_BLOOD: 4,
  WALL_TOP: 5,
  WALL_FACE: 6,
  STAIRS: 7,
  RUBBLE: 8,
  FLOOR_MOSS: 9,
};

export const SOLID = new Set([T.VOID, T.WALL_TOP, T.WALL_FACE, T.RUBBLE]);

// Paleta por bioma: la misma construcción de tiles con distinta paleta.
export const BIOME_TILE_PALETTES = {
  catacumbas: {
    floor: [PAL.stone0, PAL.stone1, PAL.stone2], wall: [PAL.night, PAL.shade, PAL.dusk, PAL.stone0], brick: [PAL.shade, PAL.stone0, PAL.stone1, PAL.stone2],
  },
};

function floorBase(pal, seed) {
  const rng = createRng(seed);
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, pal.floor[1]);
  for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
    const sx = ox + ((oy / 8) % 2) * 0;
    b.rect(sx, oy + 7, 8, 1, pal.floor[0]).rect(sx + 7, oy, 1, 8, pal.floor[0]);
    b.rect(sx, oy, 7, 1, pal.floor[2]).rect(sx, oy, 1, 7, pal.floor[2]);
  }
  for (let i = 0; i < 6; i++) {
    const x = rng.int(1, 14);
    const y = rng.int(1, 14);
    b.set(x, y, rng.chance(0.5) ? pal.floor[0] : pal.floor[2]);
  }
  return b;
}

function crack(b, rng, color) {
  let x = rng.int(3, 12);
  let y = rng.int(2, 5);
  for (let i = 0; i < 9; i++) {
    b.set(x, y, color);
    x += rng.int(-1, 1);
    y += 1;
  }
}

function bones(b, rng) {
  b.line(4, 10, 9, 8, PAL.bone1).set(3, 10, PAL.bone2).set(4, 11, PAL.bone2).set(10, 8, PAL.bone2).set(9, 7, PAL.bone2);
  b.ellipse(11.5, 11.5, 2, 1.6, PAL.bone1).set(11, 11, PAL.ink).set(12, 11, PAL.ink).set(11, 13, PAL.bone0);
  b.set(rng.int(2, 6), rng.int(3, 5), PAL.bone0);
}

function blood(b, rng) {
  b.ellipse(8, 9, 4.5, 3, PAL.blood0).ellipse(7, 8.5, 2.5, 1.8, PAL.blood1);
  for (let i = 0; i < 5; i++) b.set(rng.int(2, 13), rng.int(3, 14), PAL.blood0);
}

function moss(b, rng, pal) {
  for (let i = 0; i < 18; i++) {
    const x = rng.int(0, 15);
    const y = rng.int(0, 15);
    b.set(x, y, rng.chance(0.6) ? PAL.moss1 : PAL.moss0);
    if (rng.chance(0.3)) b.set(x + 1, y, PAL.moss2);
  }
  return pal;
}

function wallTop(pal, seed) {
  const rng = createRng(seed);
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, pal.wall[1]);
  for (let i = 0; i < 7; i++) {
    const x = rng.int(0, 13);
    const y = rng.int(0, 13);
    b.ellipse(x + 1.5, y + 1.5, rng.int(1, 3), rng.int(1, 2), pal.wall[2]);
    b.set(x + 1, y, pal.wall[3]);
  }
  for (let i = 0; i < 10; i++) b.set(rng.int(0, 15), rng.int(0, 15), pal.wall[0]);
  return b;
}

function wallFace(pal, seed) {
  const rng = createRng(seed);
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, pal.brick[0]);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    const off = row % 2 === 0 ? 0 : 4;
    for (let x = -8 + off; x < 16; x += 8) {
      const shade = rng.chance(0.25) ? pal.brick[2] : pal.brick[1];
      b.rect(x + 1, y + 1, 7, 3, shade);
      b.rect(x + 1, y + 1, 7, 1, pal.brick[3]);
      if (rng.chance(0.3)) b.set(x + rng.int(2, 6), y + 2, pal.brick[0]);
    }
  }
  b.rect(0, 0, 16, 1, PAL.stone3).rect(0, 14, 16, 2, PAL.ink).rect(0, 13, 16, 1, pal.brick[0]);
  return b;
}

function stairs() {
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, PAL.stone1);
  const steps = [PAL.stone2, PAL.stone0, PAL.dusk, PAL.shade, PAL.night, PAL.ink];
  steps.forEach((c, i) => b.rect(1 + i, 1 + i * 2, 14 - i * 2, 2, c));
  b.rect(0, 0, 16, 1, PAL.stone3).rect(0, 0, 1, 16, PAL.stone0).rect(15, 0, 1, 16, PAL.stone0);
  return b;
}

function rubble(pal, seed) {
  const rng = createRng(seed);
  const b = floorBase(pal, seed);
  const rocks = new PixelBuffer(16, 16);
  for (let i = 0; i < 4; i++) {
    const x = rng.int(4, 11);
    const y = rng.int(6, 11);
    rocks.ellipse(x, y, rng.int(3, 4), rng.int(2, 3), pal.brick[1]);
    rocks.ellipse(x - 1, y - 1, 1.5, 1, pal.brick[3]);
  }
  rocks.outline(PAL.ink);
  return b.paste(rocks, 0, 0);
}

export function buildTileset(scene, biome = 'catacumbas', key = 'tiles') {
  const pal = BIOME_TILE_PALETTES[biome];
  const seed = 7331;
  const frames = [];
  frames[T.VOID] = new PixelBuffer(16, 16).rect(0, 0, 16, 16, PAL.ink);
  frames[T.FLOOR] = floorBase(pal, seed);
  const cracked = floorBase(pal, seed + 1);
  crack(cracked, createRng(seed + 2), pal.floor[0]);
  frames[T.FLOOR_CRACK] = cracked;
  const withBones = floorBase(pal, seed + 3);
  bones(withBones, createRng(seed + 4));
  frames[T.FLOOR_BONES] = withBones;
  const bloody = floorBase(pal, seed + 5);
  blood(bloody, createRng(seed + 6));
  frames[T.FLOOR_BLOOD] = bloody;
  frames[T.WALL_TOP] = wallTop(pal, seed + 7);
  frames[T.WALL_FACE] = wallFace(pal, seed + 8);
  frames[T.STAIRS] = stairs();
  frames[T.RUBBLE] = rubble(pal, seed + 9);
  const mossy = floorBase(pal, seed + 10);
  moss(mossy, createRng(seed + 11), pal);
  frames[T.FLOOR_MOSS] = mossy;
  addStrip(scene, key, frames);
  return key;
}
