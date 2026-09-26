import { PixelBuffer, shadeLayer } from './pixelBuffer.js';
import { PAL } from '../palette.js';

const C = {
  hair: PAL.night,
  hairHi: PAL.dusk,
  skin: PAL.skin1,
  skinSh: PAL.skin0,
  armor: PAL.steel1,
  armorHi: PAL.steel2,
  armorDk: PAL.steel0,
  cape: PAL.blood1,
  capeHi: PAL.blood2,
  capeDk: PAL.blood0,
  boot: PAL.rust1,
  blade: PAL.stone2,
  bladeHi: PAL.stone3,
  hilt: PAL.rust1,
  eye: PAL.ink,
};

// Patas por frame: 0 = parado, 1 = paso izquierdo, 2 = paso derecho.
function legsFront(b, frame) {
  const lift = (side) => (frame === 1 && side === 'r') || (frame === 2 && side === 'l');
  for (const [side, x] of [['l', 5], ['r', 9]]) {
    const top = 19;
    const bottom = lift(side) ? 22 : 23;
    b.rect(x, top, 2, bottom - top - 1, C.armorDk);
    b.rect(x, bottom - 1, 2, 2, C.boot);
  }
}

function drawDown(frame) {
  const b = new PixelBuffer(16, 24);
  b.rect(12, 4, 1, 6, C.hilt).set(12, 3, C.bladeHi).rect(11, 10, 3, 1, C.blade);
  b.rect(3, 13, 10, 8, C.capeDk).rect(3, 13, 1, 7, C.cape).rect(12, 13, 1, 7, C.cape);
  legsFront(b, frame);
  b.rect(4, 12, 8, 7, C.armor).rect(5, 13, 6, 2, C.armorHi).rect(4, 17, 8, 1, C.boot);
  b.set(7, 16, C.armorDk).set(8, 16, C.armorDk);
  b.rect(3, 13, 1, 4, C.armor).rect(12, 13, 1, 4, C.armor);
  b.set(3, 17, C.skin).set(12, 17, C.skin);
  b.ellipse(3.5, 12.5, 1.6, 1.3, C.armorHi).ellipse(12.5, 12.5, 1.6, 1.3, C.armorHi);
  b.ellipse(8, 7.5, 5.2, 4.8, C.hair);
  b.set(4, 3, C.hair).set(6, 2, C.hair).set(9, 2, C.hair).set(11, 3, C.hair).set(2, 6, C.hair).set(13, 6, C.hair);
  b.rect(5, 8, 6, 4, C.skin).rect(5, 11, 1, 1, C.skinSh).rect(10, 11, 1, 1, C.skinSh);
  b.set(5, 8, C.hair).set(7, 8, C.hair).set(8, 8, C.hair).set(10, 8, C.hair);
  b.rect(6, 9, 1, 2, C.eye).rect(9, 9, 1, 2, C.eye);
  b.set(6, 5, C.hairHi).set(7, 4, C.hairHi);
  return b.outline();
}

function drawUp(frame) {
  const b = new PixelBuffer(16, 24);
  legsFront(b, frame);
  b.rect(3, 13, 1, 4, C.armor).rect(12, 13, 1, 4, C.armor);
  b.set(3, 17, C.skin).set(12, 17, C.skin);
  b.rect(4, 12, 8, 9, C.cape).rect(6, 14, 1, 6, C.capeHi).rect(9, 14, 1, 6, C.capeDk);
  for (let x = 4; x < 12; x += 2) b.set(x, 20, null);
  b.line(10, 3, 6, 19, C.blade, 2).line(11, 3, 7, 18, C.bladeHi);
  b.rect(10, 1, 2, 3, C.hilt).rect(9, 4, 4, 1, C.bladeHi);
  b.ellipse(3.5, 12.5, 1.6, 1.3, C.armorHi).ellipse(12.5, 12.5, 1.6, 1.3, C.armorHi);
  b.ellipse(8, 7.5, 5.2, 4.8, C.hair);
  b.set(4, 3, C.hair).set(6, 2, C.hair).set(9, 2, C.hair).set(11, 3, C.hair).set(2, 6, C.hair).set(13, 6, C.hair);
  b.set(6, 5, C.hairHi).set(9, 6, C.hairHi).set(7, 9, C.hairHi);
  return b.outline();
}

function drawLeft(frame) {
  const b = new PixelBuffer(16, 24);
  b.rect(10, 3, 1, 7, C.hilt).set(10, 2, C.bladeHi).rect(9, 10, 3, 1, C.blade);
  b.poly([[8, 12], [12, 13], [13, 21], [7, 21]], C.capeDk);
  b.rect(12, 14, 1, 6, C.cape);
  const legs = { 0: [[6, 23], [8, 23]], 1: [[4, 23], [9, 23]], 2: [[5, 23], [8, 22]] }[frame];
  for (const [x, bottom] of legs) {
    b.rect(x, 19, 2, bottom - 20, C.armorDk);
    b.rect(x, bottom - 1, 2, 2, C.boot);
  }
  b.rect(5, 12, 6, 7, C.armor).rect(5, 13, 2, 4, C.armorHi).rect(5, 17, 6, 1, C.boot);
  const armX = frame === 1 ? 8 : frame === 2 ? 6 : 7;
  b.rect(armX, 13, 2, 4, C.armorHi).rect(armX, 17, 2, 1, C.skin);
  b.ellipse(8.5, 12.5, 1.8, 1.3, C.armorHi);
  b.ellipse(8, 7.5, 5, 4.8, C.hair);
  b.set(10, 2, C.hair).set(12, 3, C.hair).set(13, 5, C.hair).set(7, 2, C.hair).set(5, 3, C.hair);
  b.rect(3, 8, 5, 4, C.skin).set(2, 10, C.skin).rect(7, 11, 1, 1, C.skinSh);
  b.set(4, 8, C.hair).set(6, 8, C.hair).set(3, 7, C.hair);
  b.rect(4, 9, 1, 2, C.eye);
  b.set(9, 5, C.hairHi).set(10, 6, C.hairHi);
  return b.outline();
}

export function buildPlayerOverworld() {
  const frames = [];
  const dirs = [drawDown, drawUp, drawLeft];
  for (const fn of dirs) for (let f = 0; f < 3; f++) frames.push(fn(f));
  for (let f = 0; f < 3; f++) frames.push(drawLeft(f).flipH());
  // Orden: down 0-2, up 3-5, left 6-8, right 9-11
  return frames;
}

export const DIR_FRAME_BASE = { down: 0, up: 3, left: 6, right: 9 };

// NPCs: el mismo chibi con otra paleta (ropa, pelo), como los NPC de Pokémon comparten base.
export const NPC_PALETTES = {
  peregrina: { hair: PAL.bone1, hairHi: PAL.bone2, cloth: PAL.rust1, clothHi: PAL.rust2, clothDk: PAL.rust0, robe: PAL.moss1, robeHi: PAL.moss2, robeDk: PAL.moss0 },
  mercenario: { hair: PAL.rust0, hairHi: PAL.rust1, cloth: PAL.stone1, clothHi: PAL.stone2, clothDk: PAL.stone0, robe: PAL.steel0, robeHi: PAL.steel1, robeDk: PAL.night },
  loco: { hair: PAL.bone0, hairHi: PAL.bone1, cloth: PAL.moss0, clothHi: PAL.moss1, clothDk: PAL.night, robe: PAL.blood0, robeHi: PAL.blood1, robeDk: PAL.ink },
  monja: { hair: PAL.ink, hairHi: PAL.night, cloth: PAL.bone1, clothHi: PAL.bone2, clothDk: PAL.bone0, robe: PAL.night, robeHi: PAL.dusk, robeDk: PAL.ink },
  nino: { hair: PAL.ember0, hairHi: PAL.ember1, cloth: PAL.bone0, clothHi: PAL.bone1, clothDk: PAL.stone1, robe: PAL.stone1, robeHi: PAL.stone2, robeDk: PAL.stone0 },
};

export function buildNpcFrames(key) {
  const p = NPC_PALETTES[key];
  const map = {
    [C.hair]: p.hair, [C.hairHi]: p.hairHi,
    [C.armor]: p.cloth, [C.armorHi]: p.clothHi, [C.armorDk]: p.clothDk,
    [C.cape]: p.robe, [C.capeHi]: p.robeHi, [C.capeDk]: p.robeDk,
    [C.blade]: p.cloth, [C.bladeHi]: p.clothHi,
  };
  return buildPlayerOverworld().map((b) => b.clone().mask((_x, _y, c) => map[c]));
}

const RAMP = {
  cape: [PAL.blood0, PAL.blood0, PAL.blood1, PAL.blood2],
  steel: [PAL.steel0, PAL.steel1, PAL.steel2, PAL.steel3],
  blade: [PAL.stone0, PAL.stone1, PAL.stone2, PAL.stone3],
  hair: [PAL.ink, PAL.night, PAL.shade, PAL.stone0],
  leather: [PAL.rust0, PAL.rust0, PAL.rust1, PAL.rust2],
};

// Sprite de espaldas 64x64 para combate (convención Pokémon GBA), construido por capas sombreadas.
export function buildPlayerBack() {
  const out = new PixelBuffer(64, 64);

  const cape = new PixelBuffer(64, 64).poly([[10, 34], [54, 34], [62, 64], [2, 64]], '#');
  for (let x = 3; x < 62; x += 5) cape.set(x, 63, null).set(x + 1, 63, null).set(x + 1, 62, null);
  out.paste(shadeLayer(cape, RAMP.cape), 0, 0);
  for (const [x0, x1] of [[16, 11], [24, 21], [40, 43], [48, 53]]) out.line(x0, 40, x1, 61, PAL.blood2);
  for (const [x0, x1] of [[20, 16], [44, 48]]) out.line(x0, 42, x1, 61, PAL.blood0);

  const blade = new PixelBuffer(64, 64).poly([[4, 58], [12, 64], [50, 18], [43, 12]], '#');
  const bladeShaded = shadeLayer(blade, RAMP.blade, { shadowDepth: 2 });
  for (const [x, y] of [[22, 42], [30, 33], [15, 52]]) bladeShaded.set(x, y, PAL.stone0).set(x + 1, y - 1, PAL.stone0);
  out.paste(bladeShaded, 0, 0);
  const guard = new PixelBuffer(64, 64).poly([[40, 16], [45, 10], [53, 18], [48, 23]], '#');
  out.paste(shadeLayer(guard, RAMP.steel, { shadowDepth: 1 }), 0, 0);
  const grip = new PixelBuffer(64, 64).poly([[47, 11], [55, 2], [58, 5], [50, 14]], '#');
  const gripShaded = shadeLayer(grip, RAMP.leather, { shadowDepth: 1 });
  for (let i = 0; i < 4; i++) gripShaded.set(49 + i * 2, 11 - i * 2, PAL.rust0);
  out.paste(gripShaded, 0, 0);
  out.ellipse(57, 3, 1.8, 1.8, PAL.steel2);

  const collar = new PixelBuffer(64, 64).rect(22, 29, 20, 8, '#');
  out.paste(shadeLayer(collar, RAMP.steel, { shadowDepth: 2 }), 0, 0);
  for (const flip of [false, true]) {
    const p = new PixelBuffer(64, 64).poly([[3, 38], [8, 30], [18, 27], [27, 30], [27, 38], [16, 42], [4, 42]], '#');
    const plate = shadeLayer(flip ? p.flipH() : p, RAMP.steel, { shadowDepth: 3 });
    const pb = flip ? 64 - 1 : 0;
    const sx = (x) => (flip ? pb - x : x);
    plate.line(sx(6), 36, sx(25), 35, PAL.steel0).set(sx(12), 31, PAL.steel3).set(sx(21), 30, PAL.steel3);
    out.paste(plate, 0, 0);
  }

  // Melena en contorno polar: mechones largos arriba, cortos en la nuca, barridos hacia la derecha.
  // Mechones explícitos: [base x, base y, punta x, punta y, medio ancho de la base].
  const locks = [
    [25, 16, 13, 3, 5], [30, 13, 25, -1, 5], [35, 13, 38, -1, 5], [39, 15, 49, 3, 5], [41, 20, 54, 15, 4],
    [24, 21, 10, 19, 4], [42, 25, 52, 29, 3], [27, 28, 23, 35, 3], [33, 29, 33, 36, 3], [38, 27, 43, 33, 3],
  ];
  const hair = new PixelBuffer(64, 64).ellipse(32, 21, 10, 9, '#');
  for (const [bx, by, tx, ty, hw] of locks) {
    const len = Math.hypot(tx - bx, ty - by);
    const px = (-(ty - by) / len) * hw;
    const py = ((tx - bx) / len) * hw;
    hair.poly([[bx + px, by + py], [bx - px, by - py], [tx, ty]], '#');
  }
  const hairShaded = shadeLayer(hair, [PAL.night, PAL.shade, PAL.dusk, PAL.stone1], { shadowDepth: 2 });
  for (const [bx, by, tx, ty] of locks) {
    const mx = Math.round(bx + (tx - bx) * 0.7);
    const my = Math.round(by + (ty - by) * 0.7);
    hairShaded.line(Math.round(32 + (bx - 32) * 0.4), Math.round(21 + (by - 21) * 0.4), mx, my, PAL.night);
  }
  for (const [bx, by, tx, ty] of locks.slice(0, 5)) hairShaded.set(Math.round((bx * 2 + tx) / 3) - 1, Math.round((by * 2 + ty) / 3), PAL.stone0);
  out.paste(hairShaded, 0, 0);

  return out.outline(PAL.ink);
}
