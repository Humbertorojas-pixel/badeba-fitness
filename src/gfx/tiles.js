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
  FLOOR_ROOTS: 10,
  FLOOR_DEBRIS: 11,
};

// Los tiles de un fragmento multiversal usan el mismo índice + FRAGMENT_OFFSET.
export const FRAGMENT_OFFSET = 16;

function floorBase(pal, seed) {
  const rng = createRng(seed);
  const [dark, mid, light] = pal.floor;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, mid);
  if (pal.floorStyle === 'slab') {
    for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
      b.rect(ox, oy + 7, 8, 1, dark).rect(ox + 7, oy, 1, 8, dark);
      b.rect(ox, oy, 7, 1, light).rect(ox, oy, 1, 7, light);
    }
    for (let i = 0; i < 6; i++) b.set(rng.int(1, 14), rng.int(1, 14), rng.chance(0.5) ? dark : light);
  } else {
    for (let i = 0; i < 5; i++) {
      const x = rng.int(1, 13);
      const y = rng.int(1, 13);
      b.ellipse(x + 1, y + 1, rng.int(1, 2), 1, light).set(x + 1, y + 2, dark).set(x + 2, y + 2, dark);
    }
    for (let i = 0; i < 16; i++) b.set(rng.int(0, 15), rng.int(0, 15), rng.chance(0.6) ? dark : light);
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

function moss(b, rng) {
  for (let i = 0; i < 18; i++) {
    const x = rng.int(0, 15);
    const y = rng.int(0, 15);
    b.set(x, y, rng.chance(0.6) ? PAL.moss1 : PAL.moss0);
    if (rng.chance(0.3)) b.set(x + 1, y, PAL.moss2);
  }
}

function roots(b, rng) {
  let x = rng.int(0, 3);
  let y = rng.int(4, 11);
  while (x < 16) {
    b.set(x, y, PAL.rust0).set(x, y - 1, PAL.rust1);
    if (rng.chance(0.25)) b.line(x, y, x + 2, y + rng.int(-3, 3), PAL.rust0);
    x += 1;
    y = Math.max(2, Math.min(14, y + rng.int(-1, 1)));
  }
}

function debris(b, rng, pal) {
  for (let i = 0; i < 6; i++) {
    const x = rng.int(2, 13);
    const y = rng.int(2, 13);
    b.rect(x, y, rng.int(1, 2), rng.int(1, 2), pal.face[2]).set(x, y, pal.face[3]);
    b.set(x + 1, y + 2, PAL.ink);
  }
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
  const [mortar, base, alt, hi] = pal.face;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, mortar);
  if (pal.faceStyle === 'brick') {
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const off = row % 2 === 0 ? 0 : 4;
      for (let x = -8 + off; x < 16; x += 8) {
        b.rect(x + 1, y + 1, 7, 3, rng.chance(0.25) ? alt : base);
        b.rect(x + 1, y + 1, 7, 1, hi);
        if (rng.chance(0.3)) b.set(x + rng.int(2, 6), y + 2, mortar);
      }
    }
  } else {
    b.rect(0, 0, 16, 16, base);
    for (let x = 0; x < 16; x += rng.int(2, 4)) {
      const top = rng.int(0, 4);
      b.line(x, top, x + rng.int(-1, 1), 13, mortar);
      b.set(x + 1, top + 1, hi);
    }
    for (let i = 0; i < 8; i++) b.set(rng.int(0, 15), rng.int(2, 12), rng.chance(0.5) ? alt : hi);
  }
  b.rect(0, 0, 16, 1, hi).rect(0, 14, 16, 2, PAL.ink).rect(0, 13, 16, 1, mortar);
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
    rocks.ellipse(x, y, rng.int(3, 4), rng.int(2, 3), pal.face[1]);
    rocks.ellipse(x - 1, y - 1, 1.5, 1, pal.face[3]);
  }
  rocks.outline(PAL.ink);
  return b.paste(rocks, 0, 0);
}

export function biomeFrames(pal, seed = 7331) {
  const frames = [];
  const decorated = (s, fn) => {
    const f = floorBase(pal, seed + s);
    fn(f, createRng(seed + s + 100));
    return f;
  };
  frames[T.VOID] = new PixelBuffer(16, 16).rect(0, 0, 16, 16, PAL.ink);
  frames[T.FLOOR] = floorBase(pal, seed);
  frames[T.FLOOR_CRACK] = decorated(1, (f, r) => crack(f, r, pal.floor[0]));
  frames[T.FLOOR_BONES] = decorated(3, bones);
  frames[T.FLOOR_BLOOD] = decorated(5, blood);
  frames[T.WALL_TOP] = wallTop(pal, seed + 7);
  frames[T.WALL_FACE] = wallFace(pal, seed + 8);
  frames[T.STAIRS] = stairs();
  frames[T.RUBBLE] = rubble(pal, seed + 9);
  frames[T.FLOOR_MOSS] = decorated(10, moss);
  frames[T.FLOOR_ROOTS] = decorated(12, roots);
  frames[T.FLOOR_DEBRIS] = decorated(14, (f, r) => debris(f, r, pal));
  while (frames.length < FRAGMENT_OFFSET) frames.push(new PixelBuffer(16, 16));
  return frames;
}

// Tileset del piso: bioma base en 0..15 y (opcional) bioma del fragmento en 16..31.
export function buildTileset(scene, basePal, fragmentPal = null, key = 'tiles') {
  const frames = biomeFrames(basePal);
  if (fragmentPal) frames.push(...biomeFrames(fragmentPal, 9119));
  addStrip(scene, key, frames);
  return key;
}
