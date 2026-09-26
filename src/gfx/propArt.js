import { PixelBuffer, shadeLayer } from './pixelBuffer.js';
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

export const VARIANTS = { arbol: 3, pino: 3, seco: 3, sauce: 3, hongo: 2, arbusto: 2, roca: 2, lapida: 2, columna: 2, casa: 3 };

export function drawProp(kind, B, v = 0) {
  const b = ART[kind](B, v);
  return kind === 'costilla' && v === 1 ? b.flipH() : b;
}
