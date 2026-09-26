import { PixelBuffer, shadeLayer, BAYER4 } from './pixelBuffer.js';
import { PAL } from '../palette.js';
import { createRng } from '../core/rng.js';

const STONE = [PAL.stone0, PAL.stone1, PAL.stone2, PAL.stone3];
const BONE = [PAL.stone1, PAL.bone0, PAL.bone1, PAL.bone2];
const WOOD = [PAL.rust0, PAL.rust0, PAL.rust1, PAL.rust2];
const IRON = [PAL.night, PAL.steel0, PAL.steel1, PAL.steel2];

const layer = (w, h) => new PixelBuffer(w, h);
// Dibuja una silueta plana con `draw`, la sombrea con `ramp` y la pega en `out`.
function part(out, ramp, draw, depth = 3) {
  const l = layer(out.w, out.h);
  draw(l);
  out.paste(shadeLayer(l, ramp, { shadowDepth: depth }), 0, 0);
  return out;
}
function speckle(b, rng, n, colors, area) {
  const [x0, y0, x1, y1] = area;
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0, x1);
    const y = rng.int(y0, y1);
    if (b.get(x, y)) b.set(x, y, rng.pick(colors));
  }
}
function trunk(out, x, top, bottom, width, ramp = WOOD) {
  part(out, ramp, (l) => {
    l.rect(x, top, width, bottom - top, '#');
    l.poly([[x - 3, bottom], [x + width + 3, bottom], [x + width, bottom - 4], [x, bottom - 4]], '#');
  }, 2);
}

const ART = {
  arbol(B, v) {
    const rng = createRng(11 + v);
    const b = layer(32, 48);
    trunk(b, 13, 28, 47, 6);
    part(b, B.leaves, (l) => {
      l.ellipse(16 + rng.int(-1, 1), 18, 14, 12, '#').ellipse(8, 25, 7, 7, '#').ellipse(24, 25, 7, 7, '#').ellipse(16, 8, 9, 7, '#');
    });
    speckle(b, rng, 40, [B.leaves[3], B.leaves[2]], [2, 1, 18, 20]);
    speckle(b, rng, 30, [B.leaves[0], B.leaves[1]], [10, 16, 30, 33]);
    return b.outline(PAL.ink);
  },
  pino(B, v) {
    const rng = createRng(21 + v);
    const b = layer(32, 48);
    trunk(b, 14, 34, 47, 4);
    part(b, B.leaves, (l) => {
      for (let t = 0; t < 4; t++) {
        const top = t * 9;
        const half = 6 + t * 3 + rng.int(0, 1);
        l.poly([[16, top], [16 - half, top + 13], [16 + half, top + 13]], '#');
      }
    });
    speckle(b, rng, 25, [B.leaves[3]], [4, 2, 16, 40]);
    return b.outline(PAL.ink);
  },
  seco(B, v) {
    const rng = createRng(31 + v);
    const b = layer(32, 48);
    const bark = [PAL.ink, PAL.shade, PAL.stone0, PAL.stone1];
    part(b, bark, (l) => {
      l.poly([[13, 47], [19, 47], [18, 20], [15, 12], [14, 20]], '#');
      const branches = [[15, 26, 5, 16], [17, 22, 27, 12], [16, 18, 9, 6], [17, 16, 22, 4], [15, 30, 3, 25], [18, 30, 29, 24]];
      for (const [x0, y0, x1, y1] of branches) l.line(x0, y0, x1 + rng.int(-1, 1), y1 + rng.int(-1, 1), '#', 2);
    }, 2);
    return b.outline(PAL.ink);
  },
  sauce(B, v) {
    const rng = createRng(41 + v);
    const b = layer(32, 48);
    trunk(b, 13, 26, 47, 6);
    part(b, B.leaves, (l) => l.ellipse(16, 14, 15, 11, '#').ellipse(16, 6, 9, 6, '#'));
    for (let x = 2; x < 31; x += 2) {
      const len = rng.int(10, 24);
      b.line(x, 16, x + rng.int(-1, 1), 16 + len, rng.chance(0.5) ? B.leaves[2] : B.leaves[1]);
    }
    speckle(b, rng, 20, [B.leaves[3]], [3, 3, 18, 14]);
    return b.outline(PAL.ink);
  },
  hongo(B, v) {
    const b = layer(32, 48);
    const cap = v === 1 ? [PAL.steel0, PAL.steel1, PAL.steel2, PAL.steel3] : [PAL.blood0, PAL.blood1, PAL.blood2, PAL.blood3];
    part(b, BONE, (l) => l.poly([[12, 47], [20, 47], [19, 20], [13, 20]], '#'), 2);
    part(b, cap, (l) => l.ellipse(16, 16, 15, 10, '#').rect(1, 16, 30, 3, '#'));
    for (const [x, y] of [[8, 11], [18, 8], [24, 14], [12, 17]]) b.ellipse(x, y, 1.6, 1.2, PAL.bone2);
    b.rect(3, 19, 26, 1, PAL.ink);
    return b.outline(PAL.ink);
  },
  hongo_chico() {
    const b = layer(16, 16);
    for (const [x, h] of [[4, 6], [9, 9], [12, 5]]) {
      b.rect(x, 15 - h, 2, h, PAL.bone1);
      b.ellipse(x + 1, 15 - h, 3, 2, PAL.steel2).set(x, 14 - h, PAL.steel3);
    }
    return b.outline(PAL.ink);
  },
  arbusto(B, v) {
    const rng = createRng(51 + v);
    const b = part(layer(16, 16), B.leaves, (l) => l.ellipse(8, 10, 7, 5.5, '#').ellipse(5, 8, 4, 4, '#').ellipse(11, 8, 4, 4, '#'));
    speckle(b, rng, 10, [B.leaves[3]], [2, 4, 9, 10]);
    return b.outline(PAL.ink);
  },
  roca(B, v) {
    return part(layer(16, 16), B.rock.face, (l) => l.ellipse(8, 10 + v, 7, 5.5 - v, '#').ellipse(6, 8, 4, 3.5, '#')).outline(PAL.ink);
  },
  pena(B) {
    const b = part(layer(32, 32), B.rock.face, (l) => l.poly([[3, 31], [29, 31], [27, 12], [20, 3], [9, 5], [4, 15]], '#'));
    for (const [x, y] of [[12, 14], [16, 18], [19, 13], [13, 22]]) b.rect(x, y, 2, 3, PAL.ember1);
    return b.outline(PAL.ink);
  },
  tocon() {
    const b = part(layer(16, 16), WOOD, (l) => l.rect(3, 7, 10, 8, '#').ellipse(8, 7, 5, 2, '#'));
    b.ellipse(8, 7, 4, 1.5, PAL.rust2).ellipse(8, 7, 2, 0.8, PAL.rust1);
    return b.outline(PAL.ink);
  },
  juncos() {
    const b = layer(16, 16);
    for (const x of [3, 6, 9, 12]) {
      b.line(x, 15, x + (x % 2 ? 1 : -1), 3, PAL.moss1);
      if (x !== 9) b.rect(x - 1 + (x % 2), 3, 2, 3, PAL.rust1);
    }
    return b;
  },
  lapida(B, v) {
    const b = part(layer(16, 16), STONE, (l) => {
      l.rect(4, 5, 8, 10, '#').ellipse(8, 5, 4, 3, '#');
      if (v) l.rect(3, 14, 10, 2, '#');
    });
    b.rect(7, 6, 2, 6, PAL.stone0).rect(5, 8, 6, 1, PAL.stone0);
    return b.outline(PAL.ink);
  },
  cruz() {
    return part(layer(16, 32), WOOD, (l) => l.rect(7, 6, 3, 25, '#').rect(3, 11, 11, 3, '#'), 1).outline(PAL.ink);
  },
  vela() {
    const b = layer(16, 16);
    for (const [x, h] of [[4, 5], [8, 8], [11, 4]]) {
      b.rect(x, 15 - h, 2, h, PAL.bone1).set(x, 15 - h, PAL.bone2);
      b.set(x, 13 - h, PAL.ember2).set(x, 14 - h, PAL.ember1);
    }
    return b;
  },
  columna(B, v) {
    const b = part(layer(16, 48), STONE, (l) => {
      l.rect(3, 42, 10, 6, '#').rect(4, 14 + v * 6, 8, 29 - v * 6, '#');
      l.poly([[4, 14 + v * 6], [12, 14 + v * 6], [10, 9 + v * 6], [7, 12 + v * 6], [5, 8 + v * 6]], '#');
    }, 2);
    for (let y = 18 + v * 6; y < 41; y += 3) b.set(6, y, PAL.stone1).set(9, y + 1, PAL.stone1);
    return b.outline(PAL.ink);
  },
  escombro() {
    return part(layer(16, 16), STONE, (l) => l.rect(2, 9, 6, 5, '#').rect(7, 7, 7, 7, '#').rect(4, 5, 5, 4, '#')).outline(PAL.ink);
  },
  estatua() {
    const b = part(layer(32, 48), STONE, (l) => {
      l.rect(4, 40, 24, 8, '#');
      l.poly([[9, 40], [23, 40], [21, 16], [16, 11], [11, 16]], '#');
      l.ellipse(16, 10, 5, 6, '#');
    });
    b.rect(14, 10, 4, 3, PAL.ink).rect(6, 43, 20, 1, PAL.stone1);
    return b.outline(PAL.ink);
  },
  farol_roto() {
    return part(layer(16, 32), IRON, (l) => l.line(8, 31, 5, 8, '#', 2).rect(1, 5, 6, 6, '#'), 1).outline(PAL.ink);
  },
  hueso_grande() {
    const b = part(layer(32, 32), BONE, (l) => {
      l.ellipse(10, 20, 9, 8, '#').ellipse(22, 24, 9, 6, '#').rect(8, 26, 18, 5, '#');
    });
    b.ellipse(8, 19, 2.5, 3, PAL.ink).ellipse(15, 19, 2.5, 3, PAL.ink);
    return b.outline(PAL.ink);
  },
  pozo() {
    const b = layer(32, 32);
    part(b, WOOD, (l) => l.rect(4, 2, 2, 18, '#').rect(26, 2, 2, 18, '#').poly([[1, 4], [31, 4], [27, 0], [5, 0]], '#'), 1);
    part(b, STONE, (l) => l.ellipse(16, 22, 13, 8, '#').rect(3, 22, 26, 9, '#'), 2);
    b.ellipse(16, 21, 9, 4.5, PAL.ink).ellipse(16, 22, 7, 3, PAL.steel0);
    return b.outline(PAL.ink);
  },
  valla() {
    return part(layer(16, 16), WOOD, (l) => l.rect(2, 4, 2, 11, '#').rect(12, 4, 2, 11, '#').rect(0, 6, 16, 2, '#').rect(0, 10, 16, 2, '#'), 1).outline(PAL.ink);
  },
  farol() {
    const b = part(layer(16, 32), IRON, (l) => l.rect(7, 10, 2, 22, '#').rect(4, 30, 8, 2, '#').rect(4, 2, 8, 9, '#'), 1);
    b.rect(5, 4, 6, 5, PAL.ember1).rect(6, 5, 4, 3, PAL.ember2);
    return b.outline(PAL.ink);
  },
  casa(B, v) {
    const style = B.house;
    const rng = createRng(61 + v);
    const b = layer(64, 64);
    const wallRamp = style === 'madera' || style === 'palafito' ? WOOD : style === 'mausoleo' ? STONE : [PAL.night, PAL.steel0, PAL.steel1, PAL.stone2];
    const roofRamp = style === 'mausoleo' ? [PAL.shade, PAL.stone0, PAL.stone1, PAL.stone2]
      : v === 1 ? [PAL.blood0, PAL.blood0, PAL.blood1, PAL.blood2] : [PAL.rust0, PAL.rust1, PAL.rust2, PAL.ember1];
    const wallTop = style === 'palafito' ? 26 : 28;
    const wallBottom = style === 'palafito' ? 52 : 63;
    if (style === 'palafito') part(b, WOOD, (l) => { for (const x of [6, 22, 40, 56]) l.rect(x, 50, 3, 14, '#'); }, 1);
    part(b, wallRamp, (l) => {
      if (style === 'ruina') {
        l.poly([[2, 63], [62, 63], [62, 30], [52, 26], [44, 34], [30, 24], [18, 32], [8, 25], [2, 32]], '#');
      } else l.rect(3, wallTop, 58, wallBottom - wallTop + 1, '#');
    });
    if (style === 'madera' || style === 'palafito') {
      for (let y = wallTop + 4; y < wallBottom; y += 5) b.rect(4, y, 56, 1, PAL.rust0);
      b.rect(3, wallTop, 3, wallBottom - wallTop, PAL.rust0).rect(58, wallTop, 3, wallBottom - wallTop, PAL.rust0);
    } else if (style === 'mausoleo') {
      for (const x of [5, 53]) b.rect(x, wallTop, 6, wallBottom - wallTop, PAL.stone2).rect(x + 5, wallTop, 1, wallBottom - wallTop, PAL.stone0);
    } else {
      for (let i = 0; i < 14; i++) b.rect(rng.int(4, 56), rng.int(34, 60), rng.int(2, 5), 1, PAL.night);
    }
    if (style !== 'ruina') {
      part(b, roofRamp, (l) => {
        if (style === 'mausoleo') l.poly([[0, wallTop + 2], [64, wallTop + 2], [32, 2]], '#');
        else l.poly([[0, wallTop + 3], [64, wallTop + 3], [56, 4], [8, 4]], '#');
      });
      if (style !== 'mausoleo') for (let y = 8; y < wallTop; y += 4) b.line(6 + (wallTop - y) * 0.2, y, 58 - (wallTop - y) * 0.2, y, roofRamp[0]);
      b.rect(0, wallTop + 2, 64, 2, PAL.ink);
    }
    // Puerta en la casilla 1 (x 16..31) y ventana iluminada: cálida frente a la oscuridad del pozo.
    const doorTop = wallBottom - 17;
    b.rect(19, doorTop, 10, wallBottom - doorTop + 1, PAL.ink).rect(18, doorTop - 1, 12, 2, style === 'mausoleo' ? PAL.stone3 : PAL.rust2);
    b.set(27, doorTop + 9, PAL.ember1);
    const lit = style !== 'ruina' && style !== 'mausoleo';
    b.rect(40, doorTop - 4, 12, 10, PAL.ink).rect(41, doorTop - 3, 10, 8, lit ? PAL.ember1 : PAL.night);
    if (lit) b.rect(42, doorTop - 2, 4, 3, PAL.ember2).rect(45, doorTop - 3, 1, 8, PAL.rust0).rect(41, doorTop, 10, 1, PAL.rust0);
    return b.outline(PAL.ink);
  },
  hoguera(_B, frame) {
    const b = layer(16, 16);
    b.line(2, 14, 13, 11, PAL.rust0, 2).line(2, 11, 13, 14, PAL.rust1, 2);
    const hgt = [7, 9, 8][frame % 3];
    const sway = [0, 1, -1][frame % 3];
    b.ellipse(8 + sway * 0.5, 12 - hgt / 2, 3.2, hgt / 2 + 0.5, PAL.blood3);
    b.ellipse(8 + sway * 0.5, 13 - hgt / 2, 2, hgt / 2 - 1, PAL.ember1).rect(7, 9, 2, 3, PAL.ember2);
    return b.outline(PAL.ink);
  },
  arbol_ancestral(B) {
    const rng = createRng(71);
    const b = layer(96, 128);
    part(b, WOOD, (l) => {
      l.poly([[28, 127], [68, 127], [62, 60], [56, 40], [40, 40], [34, 60]], '#');
      for (const [x0, x1] of [[30, 6], [34, 16], [62, 84], [66, 92]]) l.line(x0, 118, x1, 127, '#', 5);
      l.line(40, 52, 18, 38, '#', 4).line(58, 50, 80, 34, '#', 4);
    }, 4);
    b.ellipse(48, 96, 7, 11, PAL.ink).ellipse(47, 97, 5, 9, PAL.night);
    part(b, B.leaves, (l) => {
      l.ellipse(48, 30, 46, 26, '#').ellipse(20, 40, 18, 14, '#').ellipse(76, 40, 18, 14, '#').ellipse(48, 12, 26, 12, '#');
    }, 4);
    speckle(b, rng, 220, [B.leaves[3], B.leaves[2]], [4, 2, 60, 36]);
    speckle(b, rng, 160, [B.leaves[0], B.leaves[1]], [30, 30, 94, 60]);
    for (let i = 0; i < 9; i++) b.ellipse(rng.int(20, 76), rng.int(24, 50), 1.2, 1.2, PAL.ember2);
    return b.outline(PAL.ink);
  },
  // Caballero de piedra arrodillado, sin cabeza, con las manos sobre una espada gigante clavada.
  coloso() {
    const rng = createRng(81);
    const b = layer(80, 128);
    const ramp = [PAL.shade, PAL.stone0, PAL.stone1, PAL.stone2];
    part(b, ramp, (l) => l.rect(1, 114, 78, 14, '#'), 3);
    part(b, [PAL.shade, PAL.shade, PAL.stone0, PAL.stone1], (l) => l.poly([[8, 50], [72, 50], [76, 114], [4, 114]], '#'), 3);
    part(b, ramp, (l) => {
      l.ellipse(24, 106, 12, 9, '#').ellipse(56, 106, 12, 9, '#');
      l.poly([[22, 96], [58, 96], [62, 40], [18, 40]], '#');
      l.rect(24, 84, 32, 12, '#');
    }, 4);
    for (let y = 86; y < 96; y += 3) b.rect(25, y, 30, 1, PAL.stone0);
    part(b, ramp, (l) => {
      l.poly([[20, 44], [12, 60], [26, 74], [36, 72]], '#');
      l.poly([[60, 44], [68, 60], [54, 74], [44, 72]], '#');
      l.ellipse(17, 42, 13, 9, '#').ellipse(63, 42, 13, 9, '#');
      l.rect(33, 30, 14, 12, '#');
    }, 4);
    for (const x of [9, 57]) b.rect(x, 38, 14, 2, PAL.stone0).rect(x + 2, 44, 10, 1, PAL.stone0);
    b.poly([[33, 30], [47, 30], [45, 26], [41, 29], [38, 24], [35, 28]], PAL.stone1);
    part(b, [PAL.night, PAL.steel0, PAL.steel1, PAL.steel2], (l) => {
      l.rect(37, 74, 6, 42, '#').poly([[37, 116], [43, 116], [40, 122]], '#');
      l.rect(28, 68, 24, 5, '#').rect(38, 52, 4, 16, '#').ellipse(40, 50, 3.5, 3.5, '#');
    }, 2);
    part(b, ramp, (l) => l.ellipse(33, 70, 6, 5, '#').ellipse(47, 70, 6, 5, '#'), 2);
    for (let i = 0; i < 10; i++) {
      const x0 = rng.int(20, 60);
      const y0 = rng.int(44, 108);
      b.line(x0, y0, x0 + rng.int(-4, 4), y0 + rng.int(3, 8), PAL.shade);
    }
    for (let i = 0; i < 60; i++) {
      const x = rng.int(4, 76);
      const y = rng.int(60, 127);
      if (b.get(x, y) && b.get(x, y) !== PAL.steel1) b.set(x, y, rng.chance(0.5) ? PAL.moss1 : PAL.moss0);
    }
    return b.outline(PAL.ink);
  },
  // Costilla de titán: nace del suelo a la izquierda y se arquea sobre el camino.
  costilla() {
    const b = layer(48, 96);
    part(b, BONE, (l) => {
      for (let t = 0; t <= 1; t += 0.015) {
        const x = 7 + Math.sin(t * Math.PI * 0.62) * 38;
        const y = 94 - Math.sin(t * Math.PI * 0.5) * 84;
        l.ellipse(x, y, 5 - t * 2.5, 3.5 - t, '#');
      }
    }, 2);
    return b.outline(PAL.ink);
  },
  craneo() {
    const b = part(layer(64, 48), BONE, (l) => l.ellipse(32, 20, 28, 19, '#').rect(14, 26, 36, 18, '#'), 4);
    b.ellipse(21, 24, 7, 6, PAL.ink).ellipse(43, 24, 7, 6, PAL.ink).ellipse(21, 25, 2, 2, PAL.ember1).ellipse(43, 25, 2, 2, PAL.ember1);
    b.poly([[29, 32], [35, 32], [32, 37]], PAL.ink);
    for (let x = 17; x < 48; x += 4) b.rect(x, 41, 3, 5, PAL.bone2).rect(x, 45, 3, 1, PAL.bone0);
    return b.outline(PAL.ink);
  },
};

// ---------------------------------------------------------------- vegetación detallada

// Volumen redondeado: luz desde arriba a la izquierda, borde inferior en sombra y tramado entre
// bandas (el mismo recurso que los sprites de criaturas).
function ballShade(mask, ramp, lx = -0.6, ly = -0.8) {
  let x0 = mask.w; let y0 = mask.h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) if (mask.get(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = new PixelBuffer(mask.w, mask.h);
  if (x1 < 0) return out;
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;
  const rx = Math.max(1, (x1 - x0 + 1) / 2);
  const ry = Math.max(1, (y1 - y0 + 1) / 2);
  const on = (x, y) => mask.get(x, y) !== null;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!on(x, y)) continue;
      let v = 0.5 + (((x + 0.5 - cx) / rx) * lx + ((y + 0.5 - cy) / ry) * ly) * 0.45;
      if (!on(x, y + 1) || !on(x + 1, y)) v -= 0.22;
      else if (!on(x, y - 1) || !on(x - 1, y)) v += 0.18;
      const level = Math.max(0, Math.min(2.999, v * 3));
      const lo = Math.floor(level);
      const frac = level - lo;
      let idx = frac >= 0.5 ? lo + 1 : lo;
      if (frac > 0.38 && frac < 0.62) idx = (frac - 0.38) / 0.24 > BAYER4[y % 4][x % 4] ? lo + 1 : lo;
      out.set(x, y, ramp[Math.min(3, idx)]);
    }
  }
  return out;
}

// Pega una pieza sombreada dejando una línea de contacto oscura donde se superpone.
function pasteContact(out, mask, shaded, dark) {
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (!mask.get(x, y)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !mask.get(x + dx, y + dy) && out.get(x + dx, y + dy))) shaded.set(x, y, dark);
    }
  }
  out.paste(shaded, 0, 0);
}

// Copa por racimos: cada racimo es una esfera de hojas con borde festoneado.
function canopy(b, clumps, ramp, rng) {
  for (const { x, y, r } of [...clumps].sort((p, q) => p.y - q.y)) {
    const m = new PixelBuffer(b.w, b.h).ellipse(x, y, r, r * 0.88, '#');
    for (let a = 0; a < Math.PI * 2; a += 0.55) m.ellipse(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.82, 1.6 + rng.next(), 1.6, '#');
    pasteContact(b, m, ballShade(m, ramp), ramp[0]);
  }
  // Textura de hojas: marcas en V claras en la luz y oscuras en la sombra.
  for (let i = 0; i < clumps.length * 9; i++) {
    const c = rng.pick(clumps);
    const px = Math.round(c.x + (rng.next() * 2 - 1) * c.r * 0.8);
    const py = Math.round(c.y + (rng.next() * 2 - 1) * c.r * 0.7);
    const cur = b.get(px, py);
    if (!cur) continue;
    const lit = cur === ramp[3] || cur === ramp[2];
    const mark = lit ? (cur === ramp[3] ? ramp[2] : ramp[3]) : ramp[0];
    b.set(px, py, mark).set(px + 1, py - 1, mark);
    if (lit && rng.chance(0.4)) b.set(px - 1, py - 1, mark);
  }
}

function barkTrunk(b, x, top, bottom, w, ramp, rng) {
  const m = new PixelBuffer(b.w, b.h).poly([[x, top], [x + w, top], [x + w + 1, bottom - 3], [x + w + 4, bottom], [x - 4, bottom], [x - 1, bottom - 3]], '#');
  const sh = shadeLayer(m, ramp, { shadowDepth: 2 });
  for (let lx = x + 1; lx < x + w; lx += 2) for (let y = top + 1; y < bottom - 2; y++) if (rng.chance(0.7)) sh.set(lx + (y % 5 === 0 ? 1 : 0), y, ramp[0]);
  const ky = rng.int(top + 3, bottom - 6);
  sh.ellipse(x + w / 2, ky, 1.3, 1.6, ramp[0]).set(Math.round(x + w / 2), ky, ramp[2]);
  b.paste(sh, 0, 0);
}

const AUTUMN = [PAL.rust0, PAL.rust1, PAL.ember0, PAL.ember1];

Object.assign(ART, {
  arbol(B, v) {
    const rng = createRng(11 + v * 7);
    const b = layer(32, 48);
    barkTrunk(b, 13, 22, 47, 6, WOOD, rng);
    const layouts = [
      [[16, 17, 10], [8, 21, 7], [24, 21, 7], [11, 9, 6.5], [21, 9, 6.5], [16, 25, 6]],
      [[16, 20, 9], [16, 11, 8.5], [9, 17, 6], [23, 17, 6], [16, 4, 5.5]],
      [[15, 16, 9], [7, 22, 6.5], [25, 19, 6.5], [10, 9, 6], [22, 8, 6.5], [17, 25, 6.5], [4, 15, 4]],
    ];
    const ramp = v === 2 && B.ground.style === 'grass' ? AUTUMN : B.leaves;
    canopy(b, layouts[v % 3].map(([x, y, r]) => ({ x: x + rng.int(-1, 1), y, r })), ramp, rng);
    // Sombra de la copa sobre el tronco.
    for (let y = 30; y < 34; y++) for (let x = 12; x < 20; x++) if (b.get(x, y) && (x + y) % 2 === 0 && WOOD.includes(b.get(x, y))) b.set(x, y, PAL.rust0);
    return b.outline(PAL.ink);
  },
  pino(B, v) {
    const rng = createRng(21 + v * 5);
    const b = layer(32, 48);
    barkTrunk(b, 14, 34, 47, 4, WOOD, rng);
    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const top = 1 + t * 7 + (v === 1 ? t : 0);
      const half = 4 + t * 2.6 + rng.int(0, 1) * 0.5;
      const bottom = top + 11;
      const pts = [[16, top]];
      for (let k = 0; k <= 8; k++) {
        const x = 16 - half + (k / 8) * half * 2;
        pts.push([x, bottom - (k % 2 ? 2 : 0) + (Math.abs(k - 4) / 4) * 1.5]);
      }
      const m = new PixelBuffer(32, 48).poly([[16, top], [16 + half, bottom], ...pts.slice(1).reverse(), [16 - half, bottom]], '#');
      pasteContact(b, m, ballShade(m, B.leaves, -0.9, -0.4), B.leaves[0]);
      for (let i = 0; i < 6; i++) {
        const x = Math.round(16 + (rng.next() * 2 - 1) * half * 0.7);
        const y = rng.int(top + 4, bottom - 2);
        if (b.get(x, y)) b.set(x, y, x < 16 ? B.leaves[3] : B.leaves[0]).set(x + (x < 16 ? -1 : 1), y + 1, x < 16 ? B.leaves[2] : B.leaves[1]);
      }
    }
    return b.outline(PAL.ink);
  },
  seco(B, v) {
    const rng = createRng(31 + v * 3);
    const b = layer(32, 48);
    const bark = [PAL.ink, PAL.shade, PAL.stone0, PAL.stone1];
    const m = new PixelBuffer(32, 48);
    const branch = (x, y, ang, len, wdt, depth) => {
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      for (let t = 0; t <= 1; t += 0.05) m.ellipse(x + (x2 - x) * t, y + (y2 - y) * t, Math.max(0.5, wdt * (1 - t * 0.4)), Math.max(0.5, wdt * (1 - t * 0.4)), '#');
      if (depth <= 0) return;
      const n = depth > 2 ? 2 : rng.int(1, 2);
      for (let i = 0; i < n; i++) branch(x2, y2, ang + (i === 0 ? -1 : 1) * (0.35 + rng.next() * 0.45), len * (0.62 + rng.next() * 0.15), wdt * 0.62, depth - 1);
    };
    branch(16, 47, -Math.PI / 2 + (rng.next() - 0.5) * 0.2, 16, 3, 4);
    m.poly([[10, 47], [22, 47], [18, 43], [14, 43]], '#');
    b.paste(ballShade(m, bark, -1, -0.2), 0, 0);
    // Musgo colgante en los pantanos.
    if (B.ground.style === 'mud') for (let i = 0; i < 8; i++) { const x = rng.int(4, 28); for (let y = 0; y < 48; y++) if (m.get(x, y)) { b.line(x, y + 1, x, y + rng.int(3, 7), PAL.moss1); break; } }
    return b.outline(PAL.ink);
  },
  sauce(B, v) {
    const rng = createRng(41 + v * 9);
    const b = layer(32, 48);
    barkTrunk(b, 13, 20, 47, 6, WOOD, rng);
    canopy(b, [{ x: 16, y: 12, r: 11 }, { x: 8, y: 16, r: 6 }, { x: 24, y: 16, r: 6 }, { x: 16, y: 5, r: 7 }], B.leaves, rng);
    // Cortinas de ramas colgantes.
    for (let x = 2; x < 31; x += 1) {
      if (rng.chance(0.35)) continue;
      const len = rng.int(12, 26);
      const y0 = 14 + Math.round(Math.abs(x - 16) * 0.3);
      for (let k = 0; k < len; k++) {
        const c = k < 3 ? B.leaves[1] : (k + x) % 5 === 0 ? B.leaves[3] : (k + x) % 2 ? B.leaves[2] : B.leaves[1];
        b.set(x + (k > len * 0.7 ? 1 : 0), y0 + k, c);
      }
    }
    return b.outline(PAL.ink);
  },
  hongo(B, v) {
    const b = layer(32, 48);
    const cap = v === 1 ? [PAL.steel0, PAL.steel1, PAL.steel2, PAL.steel3] : [PAL.blood0, PAL.blood1, PAL.blood2, PAL.blood3];
    const stem = new PixelBuffer(32, 48).poly([[12, 47], [20, 47], [19, 30], [18, 20], [14, 20], [13, 30]], '#').ellipse(16, 45, 6, 3, '#');
    b.paste(ballShade(stem, BONE, -1, 0), 0, 0);
    b.ellipse(16, 30, 5, 1.5, PAL.bone1).line(12, 31, 20, 31, PAL.bone0);
    const capM = new PixelBuffer(32, 48).ellipse(16, 16, 15, 10, '#');
    for (let y = 17; y < 27; y++) for (let x = 0; x < 32; x++) capM.set(x, y, null);
    capM.rect(1, 16, 30, 2, '#');
    b.rect(3, 18, 26, 3, PAL.ink);
    for (let x = 4; x < 28; x += 2) b.set(x, 19, cap[0]).set(x + 1, 20, PAL.bone0);
    pasteContact(b, capM, ballShade(capM, cap), cap[0]);
    for (const [x, y, r] of [[8, 11, 1.8], [18, 8, 2.2], [24, 13, 1.6], [12, 15, 1.4], [21, 15, 1.2]]) b.ellipse(x, y, r, r * 0.8, PAL.bone2).set(Math.round(x + r * 0.5), Math.round(y + r * 0.4), PAL.bone0);
    for (const [x, h] of [[5, 5], [25, 4]]) { b.rect(x, 47 - h, 2, h, PAL.bone1); b.ellipse(x + 1, 47 - h, 2.5, 1.5, cap[2]); }
    return b.outline(PAL.ink);
  },
  arbusto(B, v) {
    const rng = createRng(51 + v * 13);
    const b = layer(16, 16);
    canopy(b, [{ x: 8, y: 10, r: 6 }, { x: 4.5, y: 8, r: 3.8 }, { x: 11.5, y: 8, r: 3.8 }, { x: 8, y: 5, r: 3.5 }], B.leaves, rng);
    const dots = v === 1 ? [PAL.blood3, PAL.blood2] : v === 2 ? [PAL.bone2, PAL.steel3] : null;
    if (dots) for (let i = 0; i < 6; i++) { const x = rng.int(3, 12); const y = rng.int(4, 13); if (b.get(x, y)) b.set(x, y, dots[0]).set(x + 1, y + 1, dots[1]); }
    return b.outline(PAL.ink);
  },
  helecho(B, v) {
    const rng = createRng(91 + v);
    const b = layer(16, 16);
    for (const [ex, ey, bend] of [[1, 8, -2], [3, 3, -1], [8, 1, 0], [13, 3, 1], [15, 8, 2]]) {
      let prev = [8, 15];
      for (let t = 0.1; t <= 1; t += 0.1) {
        const x = 8 + (ex - 8) * t;
        const y = 15 + (ey - 15) * t + Math.sin(t * Math.PI) * bend * 0 - (t > 0.6 ? (t - 0.6) * -4 : 0);
        b.line(Math.round(prev[0]), Math.round(prev[1]), Math.round(x), Math.round(y), B.leaves[1]);
        if (t > 0.2) {
          const nx = -(ey - 15);
          const ny = ex - 8;
          const n = Math.hypot(nx, ny) || 1;
          for (const sgn of [-1, 1]) b.set(Math.round(x + (nx / n) * sgn * 1.4), Math.round(y + (ny / n) * sgn * 1.4), t < 0.7 ? B.leaves[2] : B.leaves[3]);
        }
        prev = [x, y];
      }
    }
    b.set(rng.int(6, 9), 14, B.leaves[0]);
    return b.outline(PAL.ink);
  },
});

Object.assign(ART, {
  // Nenúfares: hojas redondas con su muesca; algunos con flor.
  nenufar(B, v) {
    const rng = createRng(111 + v);
    const b = layer(16, 16);
    const pads = v === 2 ? [[5, 9, 5], [12, 5, 3.5]] : [[8, 9, 6.5], [3, 3, 3]];
    for (const [x, y, r] of pads) {
      const m = layer(16, 16).ellipse(x, y, r, r * 0.7, '#');
      const cut = rng.next() * Math.PI * 2;
      for (let t = 0; t < r; t += 0.5) m.set(Math.round(x + Math.cos(cut) * t), Math.round(y + Math.sin(cut) * t * 0.7), null);
      b.paste(ballShade(m, [PAL.moss0, PAL.moss1, PAL.moss2, PAL.bone0]), 0, 0);
      b.set(Math.round(x), Math.round(y), PAL.moss0);
    }
    if (v === 1) {
      for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [-1, -1], [1, -1]]) b.set(8 + dx, 8 + dy, PAL.bone2);
      b.set(8, 8, PAL.ember2).set(7, 9, PAL.blood3).set(9, 9, PAL.blood3);
    }
    for (const [x, y] of [[1, 12], [14, 12], [12, 14]]) b.set(x, y, B.water?.[2] || PAL.steel2);
    return b.outline(PAL.ink);
  },
  // Roca medio hundida, con espuma en la línea del agua.
  roca_agua(B, v) {
    const b = layer(16, 16);
    const m = layer(16, 16).ellipse(8, 10, 6 - v, 5, '#').ellipse(6, 8, 3.5, 3, '#');
    for (let y = 12; y < 16; y++) for (let x = 0; x < 16; x++) m.set(x, y, null);
    b.paste(ballShade(m, B.rock.face), 0, 0);
    b.outline(PAL.ink);
    for (let x = 2; x < 14; x++) b.set(x, 12, x % 3 ? PAL.bone1 : B.water?.[2] || PAL.steel3);
    b.set(1, 13, PAL.bone1).set(14, 13, PAL.bone1);
    return b;
  },
  // Roca en la lava: grietas encendidas.
  roca_lava(B, v) {
    const b = layer(16, 16);
    const m = layer(16, 16).ellipse(8, 10, 6, 4.5, '#').ellipse(9, 7, 3.5, 3, '#');
    b.paste(ballShade(m, [PAL.ink, PAL.night, PAL.shade, PAL.dusk]), 0, 0);
    b.line(5, 9, 8, 11, PAL.ember1).line(8, 11, 11, 8, PAL.ember2).set(9, 6, PAL.ember1);
    b.outline(PAL.ink);
    for (let x = 2; x < 14; x += 2) b.set(x, 14, v ? PAL.ember2 : PAL.blood3);
    return b;
  },
  // Estalagmita: el techo del pozo recuerda que todo esto es una caverna.
  estalagmita(B, v) {
    const b = part(layer(16, 32), B.rock.face, (l) => {
      l.poly([[2, 31], [14, 31], [11, 18], [9, 4 + v * 5], [7, 10], [5, 20]], '#');
      if (!v) l.poly([[10, 31], [15, 31], [13, 24]], '#');
    }, 2);
    b.line(8, 8 + v * 5, 6, 26, B.rock.face[3]);
    return b.outline(PAL.ink);
  },
  cristal(B, v) {
    const ramp = v ? [PAL.blood0, PAL.blood1, PAL.blood3, PAL.ember2] : [PAL.steel0, PAL.steel2, PAL.steel3, PAL.bone2];
    const b = part(layer(16, 16), ramp, (l) => {
      l.poly([[6, 15], [9, 15], [9, 5], [7, 2], [5, 5]], '#');
      l.poly([[2, 15], [6, 15], [5, 9], [3, 7]], '#');
      l.poly([[9, 15], [14, 15], [13, 10], [11, 8]], '#');
    }, 1);
    b.line(6, 4, 6, 13, ramp[3]).set(3, 9, ramp[3]).set(11, 10, ramp[3]);
    return b.outline(PAL.ink);
  },
  helecho(B, v) {
    const rng = createRng(91 + v);
    const b = layer(16, 16);
    for (const [x1, y1] of [[1, 7], [4, 3], [8, 1], [12, 3], [15, 7]]) {
      b.line(8, 15, x1, y1, B.leaves[2]);
      for (let t = 0.3; t < 1; t += 0.2) b.set(Math.round(8 + (x1 - 8) * t), Math.round(15 + (y1 - 15) * t) + 1, B.leaves[rng.chance(0.5) ? 1 : 3]);
    }
    return b.outline(PAL.ink);
  },
  flores(B, v) {
    const rng = createRng(101 + v);
    const b = layer(16, 16);
    const petals = rng.pick([[PAL.bone2, PAL.bone1], [PAL.blood3, PAL.blood2], [PAL.ember2, PAL.ember1], [PAL.steel3, PAL.steel2]]);
    for (let i = 0; i < 4; i++) {
      const x = rng.int(2, 13);
      const y = rng.int(5, 12);
      b.line(x, y + 1, x, 15, B.leaves[1]);
      b.set(x, y, PAL.ember1).set(x - 1, y, petals[0]).set(x + 1, y, petals[0]).set(x, y - 1, petals[0]).set(x, y + 1, petals[1]);
    }
    return b;
  },
  tronco(B, v) {
    const b = part(layer(32, 16), WOOD, (l) => l.rect(2, 6, 27, 8, '#'), 2);
    part(b, WOOD, (l) => l.ellipse(28, 10, 3.5, 4.5, '#'), 1);
    b.ellipse(28, 10, 2, 3, PAL.rust2).set(28, 10, PAL.rust1);
    for (let x = 5; x < 26; x += 4) b.set(x, 8, PAL.rust0).set(x + 1, 11, PAL.rust0);
    if (!v) for (let x = 4; x < 22; x += 3) b.set(x, 6, PAL.moss2).set(x + 1, 6, PAL.moss1);
    return b.outline(PAL.ink);
  },
  espantapajaros() {
    const b = layer(16, 32);
    part(b, WOOD, (l) => l.rect(7, 8, 2, 24, '#').rect(1, 13, 14, 2, '#'), 1);
    part(b, [PAL.rust0, PAL.rust1, PAL.rust2, PAL.bone0], (l) => l.poly([[4, 12], [12, 12], [13, 24], [3, 24]], '#'), 1);
    part(b, [PAL.rust1, PAL.bone0, PAL.bone1, PAL.bone2], (l) => l.ellipse(8, 7, 3.5, 3.5, '#'), 1);
    b.set(7, 7, PAL.ink).set(9, 7, PAL.ink).line(6, 9, 10, 9, PAL.ink);
    part(b, [PAL.ink, PAL.night, PAL.shade, PAL.dusk], (l) => l.rect(3, 3, 10, 2, '#').rect(5, 0, 6, 3, '#'), 1);
    return b.outline(PAL.ink);
  },
  cartel() {
    const b = layer(16, 32);
    part(b, WOOD, (l) => l.rect(7, 12, 2, 20, '#'), 1);
    part(b, WOOD, (l) => l.poly([[1, 6], [12, 6], [15, 9], [12, 12], [1, 12]], '#'), 1);
    b.line(3, 8, 10, 8, PAL.rust0).line(3, 10, 8, 10, PAL.rust0);
    return b.outline(PAL.ink);
  },
});

Object.assign(ART, {
  // Boca de cueva en la pared de roca: arco oscuro con colmillos de piedra.
  cueva(B) {
    const b = part(layer(32, 32), B.rock.face, (l) => l.rect(0, 0, 32, 32, '#'), 2);
    for (let x = 0; x < 32; x += 3) b.line(x, 0, x + 1, 30, B.rock.face[0]);
    const mouth = layer(32, 32).poly([[4, 32], [5, 16], [9, 8], [16, 5], [23, 8], [27, 16], [28, 32]], '#');
    b.paste(shadeLayer(mouth, [PAL.ink, PAL.ink, PAL.night, PAL.shade], { shadowDepth: 3 }), 0, 0);
    b.ellipse(16, 24, 9, 9, PAL.ink);
    for (const [x, h] of [[9, 4], [13, 6], [18, 5], [22, 3]]) b.poly([[x - 1.5, 7 + (x > 15 ? x - 15 : 15 - x) * 0.3], [x + 1.5, 7], [x, 7 + h]], B.rock.face[2]);
    for (const [x, y] of [[3, 30], [27, 29], [6, 31]]) b.ellipse(x, y, 2.5, 1.6, B.rock.face[1]);
    b.set(12, 22, PAL.ember1).set(20, 25, PAL.ember1);
    return b.outline(PAL.ink);
  },
  // Mausoleo con escalones que bajan a la cripta.
  cripta() {
    const b = layer(48, 48);
    part(b, STONE, (l) => l.rect(2, 16, 44, 32, '#'), 3);
    part(b, [PAL.shade, PAL.stone0, PAL.stone1, PAL.stone2], (l) => l.poly([[0, 18], [48, 18], [24, 2]], '#'), 3);
    b.line(4, 17, 24, 5, PAL.stone3).rect(0, 18, 48, 2, PAL.ink);
    for (const x of [4, 38]) part(b, STONE, (l) => l.rect(x, 20, 6, 28, '#'), 2);
    b.rect(15, 22, 18, 26, PAL.ink).ellipse(24, 23, 9, 5, PAL.ink);
    for (let i = 0; i < 4; i++) b.rect(17 + i, 40 + i * 2, 14 - i * 2, 1, [PAL.shade, PAL.night, PAL.ink, PAL.ink][i]);
    b.rect(22, 7, 4, 9, PAL.stone3).rect(19, 10, 10, 3, PAL.stone3);
    for (const [x, y] of [[6, 44], [40, 30], [12, 20], [44, 44]]) b.set(x, y, PAL.moss1).set(x + 1, y, PAL.moss2);
    return b.outline(PAL.ink);
  },
  cofre(_B, frame) {
    const b = layer(16, 16);
    part(b, WOOD, (l) => l.rect(2, 8, 12, 7, '#'), 1);
    if (!frame) {
      part(b, WOOD, (l) => l.rect(2, 4, 12, 5, '#').ellipse(8, 5, 6, 2, '#'), 1);
      b.rect(2, 8, 12, 1, PAL.ink);
    } else {
      part(b, WOOD, (l) => l.rect(2, 1, 12, 4, '#'), 1);
      b.rect(3, 8, 10, 3, PAL.ink).set(6, 9, PAL.ember2).set(9, 9, PAL.ember1).set(8, 10, PAL.ember2);
    }
    for (const x of [4, 11]) b.line(x, frame ? 1 : 3, x, 14, PAL.stone2);
    b.rect(7, frame ? 4 : 8, 2, 3, PAL.ember1).set(7, frame ? 5 : 9, PAL.ember2);
    return b.outline(PAL.ink);
  },
  sarcofago() {
    const b = part(layer(32, 16), STONE, (l) => l.rect(1, 3, 30, 12, '#'), 2);
    b.rect(3, 5, 26, 7, PAL.stone2).ellipse(8, 8.5, 3, 2.5, PAL.stone1).line(11, 8, 26, 8, PAL.stone1);
    b.line(14, 6, 14, 11, PAL.stone1).line(4, 12, 28, 12, PAL.stone0);
    return b.outline(PAL.ink);
  },
  urna(_B, v) {
    const ramp = v ? [PAL.rust0, PAL.rust1, PAL.rust2, PAL.ember0] : STONE;
    const b = part(layer(16, 16), ramp, (l) => l.ellipse(8, 10, 5, 5, '#').rect(6, 3, 4, 3, '#'), 2);
    b.rect(5, 2, 6, 2, ramp[1]).line(4, 9, 12, 9, ramp[0]);
    return b.outline(PAL.ink);
  },
  antorcha(_B, frame) {
    const b = layer(16, 16);
    part(b, IRON, (l) => l.rect(7, 8, 2, 6, '#').rect(5, 7, 6, 2, '#'), 1);
    const h = [5, 6, 4][frame % 3];
    b.ellipse(8 + [0, 0.5, -0.5][frame % 3], 7 - h / 2, 2.4, h / 2 + 0.5, PAL.blood3);
    b.ellipse(8, 7.5 - h / 2, 1.4, h / 2 - 0.5, PAL.ember1).set(8, 5, PAL.ember2);
    return b.outline(PAL.ink);
  },
  telarana() {
    const b = layer(16, 16);
    for (const [x, y] of [[15, 0], [12, 6], [6, 12], [0, 15]]) b.line(0, 0, x, y, PAL.bone0);
    for (const r of [4, 8]) for (let a = 0; a <= Math.PI / 2; a += 0.12) b.set(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), PAL.stone2);
    return b;
  },
  huesos() {
    const b = layer(16, 16);
    b.line(3, 13, 12, 11, PAL.bone1).line(5, 10, 11, 14, PAL.bone0);
    b.ellipse(9, 9, 3, 2.6, PAL.bone1).set(8, 9, PAL.ink).set(10, 9, PAL.ink).set(9, 11, PAL.bone0);
    return b.outline(PAL.ink);
  },
  // Escala de cuerda hacia la luz: la salida de la mazmorra.
  salida() {
    const b = layer(16, 32);
    for (const x of [4, 11]) b.line(x, 0, x, 31, PAL.rust1);
    for (let y = 3; y < 31; y += 4) b.line(4, y, 11, y, PAL.rust2);
    b.rect(3, 0, 10, 2, PAL.bone1);
    return b.outline(PAL.ink);
  },
});


// ---------------------------------------------------------------- estructuras detalladas

function shingles(b, x0, y0, x1, y1, ramp, rowH = 4) {
  for (let y = y0; y < y1; y += rowH) {
    const off = ((y - y0) / rowH) % 2 ? 3 : 0;
    for (let x = x0 - 6 + off; x < x1; x += 6) {
      for (let dx = 0; dx < 6; dx++) {
        const px = x + dx;
        if (!b.get(px, y + 1)) continue;
        const edge = Math.abs(dx - 2.5) > 2 ? 1 : 0;
        b.set(px, y + rowH - 1 - edge, ramp[0]);
        if (dx > 0 && dx < 5) b.set(px, y + 1, ramp[3]);
      }
    }
  }
}

function windowLit(b, x, y, w, h, lit, frame = WOOD) {
  part(b, frame, (l) => l.rect(x - 1, y - 1, w + 2, h + 2, '#'), 1);
  b.rect(x, y, w, h, lit ? PAL.ember1 : PAL.night);
  if (lit) b.rect(x + 1, y + 1, Math.ceil(w / 2) - 1, Math.ceil(h / 2) - 1, PAL.ember2).set(x + 1, y + 1, PAL.bone2);
  b.line(x + Math.floor(w / 2), y, x + Math.floor(w / 2), y + h - 1, frame[1]).line(x, y + Math.floor(h / 2), x + w - 1, y + Math.floor(h / 2), frame[1]);
  // Contraventanas abiertas.
  part(b, frame, (l) => { l.rect(x - 4, y - 1, 3, h + 2, '#'); l.rect(x + w + 1, y - 1, 3, h + 2, '#'); }, 1);
  for (const sx of [x - 4, x + w + 1]) b.line(sx + 1, y, sx + 1, y + h - 1, frame[0]);
}

function flowerBox(b, x, y, w, rng) {
  part(b, WOOD, (l) => l.rect(x, y, w, 3, '#'), 1);
  for (let i = x; i < x + w; i += 2) b.set(i, y - 1, PAL.moss2).set(i + 1, y - 2, rng.pick([PAL.blood3, PAL.bone2, PAL.ember2]));
}

Object.assign(ART, {
  casa(B, v) {
    const style = B.house;
    const rng = createRng(61 + v * 17);
    const b = layer(64, 64);
    const wood = style === 'palafito' ? [PAL.rust0, PAL.rust0, PAL.rust1, PAL.bone0] : WOOD;
    const roofRamp = style === 'mausoleo' ? [PAL.shade, PAL.stone0, PAL.stone1, PAL.stone2]
      : v === 1 ? [PAL.blood0, PAL.blood0, PAL.blood1, PAL.blood2] : v === 2 ? [PAL.moss0, PAL.rust0, PAL.rust1, PAL.moss1] : [PAL.rust0, PAL.rust1, PAL.rust2, PAL.ember1];
    const wallTop = style === 'palafito' ? 26 : 28;
    const wallBottom = style === 'palafito' ? 52 : 63;
    if (style === 'palafito') {
      part(b, WOOD, (l) => { for (const x of [5, 21, 39, 55]) l.rect(x, 50, 4, 14, '#'); }, 1);
      for (let x = 0; x < 64; x += 4) b.rect(x, 53, 3, 2, PAL.rust1);
    }
    if (style === 'ruina' || style === 'mausoleo') {
      const stone = style === 'mausoleo' ? STONE : [PAL.night, PAL.steel0, PAL.steel1, PAL.stone2];
      part(b, stone, (l) => {
        if (style === 'ruina') l.poly([[2, 63], [62, 63], [62, 30], [52, 26], [44, 34], [30, 24], [18, 32], [8, 25], [2, 32]], '#');
        else l.rect(3, wallTop, 58, wallBottom - wallTop + 1, '#');
      }, 3);
      for (let y = wallTop + 3; y < wallBottom; y += 5) {
        for (let x = 3 + (Math.floor((y - wallTop) / 5) % 2) * 4; x < 60; x += 8) if (b.get(x, y)) b.line(x, y, x + 6, y, stone[0]).line(x + 7, y - 4, x + 7, y, stone[0]).set(x + 1, y - 3, stone[3]);
      }
      if (style === 'mausoleo') {
        for (const x of [5, 53]) part(b, STONE, (l) => l.rect(x, wallTop, 6, wallBottom - wallTop, '#'), 2);
        part(b, roofRamp, (l) => l.poly([[0, wallTop + 2], [64, wallTop + 2], [32, 4]], '#'), 3);
        b.line(4, wallTop + 1, 32, 5, roofRamp[3]).rect(0, wallTop + 2, 64, 2, PAL.ink);
        b.rect(30, 10, 4, 10, PAL.stone3).rect(27, 13, 10, 3, PAL.stone3);
        windowLit(b, 42, 38, 8, 9, v === 1, STONE);
        if (v === 2) for (let i = 0; i < 20; i++) { const x = rng.int(4, 60); const y = rng.int(wallTop, 62); if (b.get(x, y)) b.set(x, y, PAL.moss1); }
        if (v === 0) for (const x of [14, 50]) { b.rect(x, 58, 2, 4, PAL.bone1); b.set(x, 57, PAL.ember2); }
      } else {
        for (let i = 0; i < 16; i++) b.set(rng.int(4, 58), rng.int(34, 60), PAL.moss1);
        b.poly([[40, 36], [50, 36], [48, 46], [42, 46]], PAL.ink);
        for (const [x, y] of [[12, 60], [50, 61], [30, 62]]) b.ellipse(x, y, 3, 1.5, PAL.stone1);
      }
    } else {
      // Muros de troncos sobre cimiento de piedra.
      part(b, wood, (l) => l.rect(3, wallTop, 58, wallBottom - wallTop + 1, '#'), 2);
      for (let y = wallTop + 4; y < wallBottom - 3; y += 5) {
        b.line(4, y, 59, y, wood[0]).line(4, y - 3, 59, y - 3, wood[3]);
        for (let i = 0; i < 2; i++) b.set(rng.int(6, 56), y - 2, wood[0]);
      }
      for (const x of [3, 58]) part(b, wood, (l) => l.rect(x, wallTop, 3, wallBottom - wallTop, '#'), 1);
      if (style !== 'palafito') {
        part(b, STONE, (l) => l.rect(2, 58, 60, 6, '#'), 1);
        for (let x = 2; x < 62; x += 6) b.line(x, 58, x, 63, PAL.stone0);
      }
      // Tejado de tejas con alero, cumbrera y chimenea.
      part(b, roofRamp, (l) => l.poly([[0, wallTop + 3], [64, wallTop + 3], [56, 4], [8, 4]], '#'), 3);
      shingles(b, 1, 6, 63, wallTop + 3, roofRamp);
      b.rect(8, 3, 48, 2, roofRamp[3]).rect(8, 5, 48, 1, roofRamp[0]);
      for (let x = 0; x < 64; x++) if ((x + wallTop) % 2 === 0) b.set(x, wallTop + 4, PAL.ink);
      b.rect(0, wallTop + 3, 64, 1, PAL.ink);
      part(b, STONE, (l) => l.rect(45, 0, 7, 12, '#'), 1);
      b.rect(44, 0, 9, 2, PAL.stone3).rect(46, 1, 5, 1, PAL.ink);
      for (let y = 3; y < 12; y += 3) b.line(45, y, 51, y, PAL.stone0);
      if (v === 2) for (let i = 0; i < 18; i++) { const x = rng.int(6, 58); const y = rng.int(8, wallTop); if (b.get(x, y)) b.set(x, y, PAL.moss2); }
    }
    // Puerta de tablones con bisagras y escalón (siempre en la casilla 1: x 16..31).
    const doorTop = wallBottom - 17;
    b.rect(18, doorTop - 1, 12, 1, style === 'mausoleo' ? PAL.stone3 : PAL.rust2);
    part(b, style === 'mausoleo' || style === 'ruina' ? [PAL.ink, PAL.ink, PAL.night, PAL.shade] : [PAL.rust0, PAL.rust0, PAL.rust1, PAL.rust2], (l) => l.rect(19, doorTop, 10, wallBottom - doorTop + 1, '#'), 1);
    if (style !== 'mausoleo' && style !== 'ruina') {
      for (const x of [21, 24, 27]) b.line(x, doorTop + 1, x, wallBottom, PAL.rust0);
      b.rect(19, doorTop + 3, 3, 1, PAL.steel1).rect(19, wallBottom - 4, 3, 1, PAL.steel1).set(27, doorTop + 9, PAL.ember2);
      b.rect(17, wallBottom, 14, 1, PAL.stone2);
    }
    if (style === 'madera' || style === 'palafito') {
      windowLit(b, 42, doorTop - 3, 9, 9, true);
      flowerBox(b, 40, doorTop + 7, 13, rng);
      if (v === 0) { b.rect(33, doorTop, 1, 3, PAL.steel1); b.rect(32, doorTop + 3, 3, 3, PAL.ember1).set(33, doorTop + 4, PAL.ember2); }
      if (v !== 1 && style === 'madera') part(b, WOOD, (l) => l.ellipse(9, 58, 4, 4, '#').rect(5, 55, 8, 8, '#'), 1);
      if (v === 1 && style === 'madera') for (let y = 54; y < 62; y += 3) for (let x = 6; x < 14; x += 3) b.ellipse(x, y, 1.5, 1.4, PAL.rust2).set(x, y, PAL.rust0);
    }
    return b.outline(PAL.ink);
  },
  pozo() {
    const b = layer(32, 32);
    part(b, WOOD, (l) => l.rect(4, 4, 2, 16, '#').rect(26, 4, 2, 16, '#'), 1);
    part(b, [PAL.rust0, PAL.rust1, PAL.rust2, PAL.ember1], (l) => l.poly([[0, 7], [32, 7], [27, 0], [5, 0]], '#'), 2);
    shingles(b, 1, 1, 31, 7, [PAL.rust0, PAL.rust1, PAL.rust2, PAL.ember1], 3);
    b.line(6, 11, 26, 11, PAL.rust1).rect(27, 9, 3, 1, PAL.steel1).rect(29, 9, 1, 3, PAL.steel1);
    b.line(16, 11, 16, 15, PAL.bone0);
    part(b, IRON, (l) => l.rect(14, 15, 5, 4, '#'), 1);
    const ring = layer(32, 32).ellipse(16, 22, 13, 8, '#').rect(3, 22, 26, 9, '#');
    b.paste(ballShade(ring, STONE, -0.7, -0.3), 0, 0);
    for (let y = 24; y < 31; y += 3) for (let x = 4 + (y % 2) * 3; x < 28; x += 6) b.line(x, y, x, y + 2, PAL.stone0);
    b.ellipse(16, 21, 9, 4.5, PAL.ink).ellipse(16, 22, 7, 3, PAL.steel0).set(13, 22, PAL.steel2);
    return b.outline(PAL.ink);
  },
});


// ---------------------------------------------------------------- piedra, tumbas y ruinas

function mossy(b, rng, n, area) {
  const [x0, y0, x1, y1] = area;
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0, x1);
    const y = rng.int(y0, y1);
    if (b.get(x, y) && b.get(x, y) !== PAL.ink) b.set(x, y, rng.chance(0.5) ? PAL.moss1 : PAL.moss2);
  }
}

Object.assign(ART, {
  estatua(B, v) {
    const rng = createRng(121 + v);
    const b = layer(32, 48);
    const ped = layer(32, 48).rect(4, 40, 24, 8, '#').rect(6, 36, 20, 4, '#');
    b.paste(ballShade(ped, STONE, -0.7, -0.4), 0, 0);
    b.rect(10, 42, 12, 3, PAL.stone0).line(11, 43, 20, 43, PAL.stone1);
    if (v === 1) {
      const wings = layer(32, 48).poly([[10, 16], [2, 6], [1, 20], [8, 32]], '#').poly([[22, 16], [30, 6], [31, 20], [24, 32]], '#');
      b.paste(ballShade(wings, [PAL.stone0, PAL.stone1, PAL.stone2, PAL.bone0], -0.8, -0.3), 0, 0);
      for (const [x0, x1] of [[3, 8], [29, 24]]) for (let y = 12; y < 28; y += 4) b.line(x0, y, x1, y + 3, PAL.stone0);
    }
    const body = layer(32, 48).poly([[10, 36], [22, 36], [20, 18], [16, 14], [12, 18]], '#').ellipse(16, 11, 5, 5.5, '#');
    b.paste(ballShade(body, STONE), 0, 0);
    b.ellipse(15, 12, 3, 3.5, PAL.stone0).ellipse(15, 13, 2, 2.4, PAL.shade);
    for (const x of [13, 16, 19]) b.line(x, 22, x - 1, 35, PAL.stone1);
    if (v === 2) {
      b.line(23, 12, 23, 38, PAL.stone3).line(24, 12, 24, 38, PAL.stone1).rect(20, 20, 8, 2, PAL.stone2).rect(22, 8, 3, 4, PAL.stone2);
    } else {
      b.ellipse(16, 23, 3, 2.5, PAL.stone2).set(16, 22, PAL.stone3);
    }
    if (B.ground.style === 'ash' || v === 1) b.line(14, 16, 14, 24, PAL.stone0);
    mossy(b, rng, 14, [4, 30, 28, 47]);
    return b.outline(PAL.ink);
  },
  columna(B, v) {
    const rng = createRng(131 + v);
    const b = layer(16, 48);
    const top = v ? 14 + rng.int(0, 6) : 8;
    const shaft = layer(16, 48).rect(4, top, 8, 42 - top, '#');
    if (v) shaft.poly([[4, top], [12, top], [10, top - 4], [7, top - 1], [5, top - 5]], '#');
    b.paste(ballShade(shaft, STONE, -1, -0.1), 0, 0);
    for (const x of [6, 8, 10]) b.line(x, top + 2, x, 40, PAL.stone1);
    b.line(5, top + 2, 5, 40, PAL.stone3);
    if (!v) {
      part(b, STONE, (l) => l.rect(2, 5, 12, 3, '#').ellipse(3, 6, 2, 2, '#').ellipse(13, 6, 2, 2, '#'), 1);
      b.rect(3, 8, 10, 1, PAL.stone0);
    }
    part(b, STONE, (l) => l.rect(2, 41, 12, 3, '#').rect(1, 44, 14, 4, '#'), 1);
    if (v) {
      part(b, STONE, (l) => l.rect(12, 44, 4, 3, '#').rect(0, 45, 3, 3, '#'), 1);
      for (let y = top; y < 40; y += 2) if (rng.chance(0.5)) b.set(rng.chance(0.5) ? 4 : 11, y, PAL.moss1);
      b.line(9, top + 6, 11, 30, PAL.moss2).line(11, 30, 10, 36, PAL.moss1);
    }
    mossy(b, rng, 6, [1, 40, 15, 47]);
    return b.outline(PAL.ink);
  },
  lapida(B, v) {
    const rng = createRng(141 + v * 3);
    const b = layer(16, 16);
    if (v === 1) {
      const m = layer(16, 16).rect(6, 2, 4, 13, '#').rect(3, 5, 10, 3, '#');
      b.paste(ballShade(m, STONE), 0, 0);
      b.set(7, 9, PAL.stone0).set(8, 11, PAL.stone0);
    } else if (v === 2) {
      const m = layer(16, 16).poly([[3, 15], [12, 15], [13, 6], [9, 3], [4, 5]], '#');
      b.paste(ballShade(m, STONE), 0, 0);
      b.line(8, 4, 7, 9, PAL.shade).line(7, 9, 9, 12, PAL.shade);
    } else {
      const m = layer(16, 16).rect(4, 6, 8, 9, '#').ellipse(8, 6, 4, 3.5, '#');
      b.paste(ballShade(m, STONE), 0, 0);
      b.rect(7, 5, 2, 6, PAL.stone0).rect(5, 7, 6, 1, PAL.stone0).set(6, 12, PAL.stone0).set(9, 12, PAL.stone0);
    }
    mossy(b, rng, 4, [3, 9, 12, 14]);
    b.outline(PAL.ink);
    for (const x of [2, 4, 11, 13]) b.set(x, 15, PAL.moss2).set(x, 14, B.tallGrass?.[1] || PAL.moss1);
    return b;
  },
  cruz(B, v) {
    const b = layer(16, 32);
    part(b, [PAL.rust0, PAL.rust0, PAL.rust1, PAL.rust2], (l) => l.ellipse(8, 29, 7, 3, '#'), 1);
    part(b, WOOD, (l) => l.rect(7, 6, 3, 23, '#').rect(3, 11, 11, 3, '#'), 1);
    b.line(8, 7, 8, 26, PAL.rust0);
    if (!v) b.rect(9, 14, 3, 5, PAL.blood1).set(11, 19, PAL.blood2).set(10, 20, PAL.blood1);
    else b.ellipse(8, 12, 2, 2, PAL.bone1).set(8, 12, PAL.ink);
    return b.outline(PAL.ink);
  },
  roca(B, v) {
    const rng = createRng(151 + v);
    const b = layer(16, 16);
    const m = layer(16, 16).ellipse(8, 10.5, 7, 5, '#').ellipse(6.5, 8, 4.5, 3.8, '#');
    if (v) m.ellipse(13, 12, 3, 2.5, '#');
    b.paste(ballShade(m, B.rock.face), 0, 0);
    b.line(7, 7, 9, 11, B.rock.face[0]);
    mossy(b, rng, 3, [3, 5, 9, 8]);
    return b.outline(PAL.ink);
  },
  pena(B, v) {
    const rng = createRng(161 + v);
    const b = layer(32, 32);
    const m = layer(32, 32).poly([[4, 31], [28, 31], [27, 12], [21, 3], [11, 4], [5, 13]], '#');
    b.paste(ballShade(m, B.rock.face), 0, 0);
    for (const [x0, y0, x1, y1] of [[12, 12, 12, 20], [12, 16, 16, 12], [18, 14, 20, 22], [20, 18, 16, 22], [14, 24, 20, 24]]) {
      b.line(x0, y0, x1, y1, PAL.ember1);
      b.set(x0, y0, PAL.ember2);
    }
    mossy(b, rng, 16, [4, 20, 28, 31]);
    for (let i = 0; i < 6; i++) b.set(rng.int(8, 24), rng.int(6, 12), PAL.bone0);
    return b.outline(PAL.ink);
  },
  tocon(B, v) {
    const b = layer(16, 16);
    part(b, WOOD, (l) => l.rect(3, 7, 10, 7, '#').poly([[1, 15], [15, 15], [12, 11], [4, 11]], '#'), 1);
    b.ellipse(8, 7, 5, 2.2, PAL.rust2).ellipse(8, 7, 3, 1.2, PAL.rust1).set(8, 7, PAL.rust0);
    for (const x of [5, 8, 11]) b.line(x, 9, x, 13, PAL.rust0);
    if (!v) { b.rect(12, 9, 2, 3, PAL.bone1); b.ellipse(13, 9, 2, 1.3, PAL.blood2); }
    return b.outline(PAL.ink);
  },
  farol_roto() {
    const b = layer(16, 32);
    part(b, IRON, (l) => l.line(9, 31, 8, 12, '#', 2).line(8, 12, 3, 7, '#', 2).rect(6, 29, 6, 3, '#'), 1);
    b.line(3, 8, 3, 11, PAL.stone2);
    part(b, IRON, (l) => l.rect(1, 11, 5, 6, '#'), 1);
    b.rect(2, 12, 3, 4, PAL.night).set(3, 13, PAL.steel3).set(2, 15, PAL.steel2);
    return b.outline(PAL.ink);
  },
  escombro(B, v) {
    const b = layer(16, 16);
    for (const [x, y, w, h] of (v ? [[1, 10, 6, 5], [7, 9, 8, 6], [4, 5, 6, 5]] : [[2, 9, 7, 6], [8, 11, 7, 4], [5, 5, 5, 5]])) {
      b.paste(ballShade(layer(16, 16).rect(x, y, w, h, '#'), STONE), 0, 0);
      b.line(x, y, x + w - 1, y, PAL.stone3);
    }
    b.set(3, 14, PAL.moss1).set(12, 14, PAL.moss2);
    return b.outline(PAL.ink);
  },
  hueso_grande(B, v) {
    const b = layer(32, 32);
    const skull = layer(32, 32).ellipse(13, 18, 11, 9, '#').rect(6, 22, 16, 6, '#');
    b.paste(ballShade(skull, BONE), 0, 0);
    b.ellipse(9, 18, 3, 3.5, PAL.ink).ellipse(17, 18, 3, 3.5, PAL.ink).set(9, 19, PAL.ember1);
    b.poly([[12, 22], [14, 22], [13, 25]], PAL.ink);
    for (let x = 8; x < 20; x += 3) b.rect(x, 27, 2, 3, PAL.bone2);
    const horn = layer(32, 32);
    for (let t = 0; t <= 1; t += 0.05) horn.ellipse(22 + t * 7, 12 - Math.sin(t * 2) * 8, 2.8 - t * 2, 2.8 - t * 2, '#');
    b.paste(ballShade(horn, BONE), 0, 0);
    if (v) for (const x of [24, 27]) b.line(x, 31, x + 2, 22, PAL.bone1);
    part(b, [PAL.rust0, PAL.rust0, PAL.rust1, PAL.rust2], (l) => l.ellipse(14, 30, 13, 2.5, '#'), 1);
    return b.outline(PAL.ink);
  },
});

// Sombra tramada al pie de lo que se alza (luz desde arriba a la izquierda).
const SHADOWED = new Set(['cripta', 'urna', 'sarcofago', 'arbol', 'pino', 'seco', 'sauce', 'hongo', 'estatua', 'columna', 'pena', 'estalagmita', 'espantapajaros', 'cartel', 'farol', 'farol_roto', 'cruz', 'arbol_ancestral', 'coloso', 'pozo']);

function castShadow(b) {
  const cx = b.w / 2 + 2;
  const cy = b.h - 2.5;
  const rx = b.w * 0.42;
  for (let y = b.h - 5; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (b.get(x, y) || (x + y) % 2) continue;
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / 2.6) ** 2 <= 1) b.set(x, y, PAL.ink);
    }
  }
  return b;
}

export const VARIANTS = { arbol: 3, pino: 3, seco: 3, sauce: 3, hongo: 2, arbusto: 2, roca: 2, lapida: 2, columna: 2, casa: 3 };

export function drawProp(kind, B, v = 0) {
  const b = ART[kind](B, v);
  if (SHADOWED.has(kind)) castShadow(b);
  return kind === 'costilla' && v === 1 ? b.flipH() : b;
}
