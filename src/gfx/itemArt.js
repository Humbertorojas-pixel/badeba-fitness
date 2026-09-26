import { PixelBuffer, shadeLayer, addStrip } from './pixelBuffer.js';
import { PAL } from '../palette.js';
import { MATERIALS } from './heroArt.js';
import { itemLook, itemMaterial } from '../data/items.js';

// Iconos de objeto (24x24). La complejidad crece con la rareza:
//   común: forma limpia · raro: acero y remaches · legendario: oro, gema y runas ·
//   único divino: oro blanco, alas, halo y destellos · único infernal: hierro negro, cuernos,
//   filo dentado, brasas y un ojo que mira.
export const ICON = 24;
const WOOD = [PAL.ink, PAL.rust0, PAL.rust1, PAL.rust2];
const LEATHER = [PAL.ink, PAL.rust0, PAL.rust1, PAL.rust2];
const FEATHER = [PAL.stone2, PAL.bone0, PAL.bone1, PAL.bone2];
const HORN = [PAL.ink, PAL.night, PAL.shade, PAL.stone1];
const GEM = { raro: PAL.steel3, legendario: PAL.blood3, divino: PAL.steel3, infernal: PAL.ember2 };
const AURA = { divino: PAL.ember2, infernal: PAL.blood3 };

function shaded(out, ramp, draw, depth = 1) {
  const l = new PixelBuffer(out.w, out.h);
  draw(l);
  out.paste(shadeLayer(l, ramp, { shadowDepth: depth }), 0, 0);
  return out;
}

// Eje diagonal de las armas: empuñadura abajo a la izquierda, punta arriba a la derecha.
const G0 = [3.5, 20.5];
const DIR = [0.7071, -0.7071];
const NRM = [0.7071, 0.7071];
const at = (t, w = 0) => [G0[0] + DIR[0] * t + NRM[0] * w, G0[1] + DIR[1] * t + NRM[1] * w];
const band = (t0, t1, w0, w1 = w0) => [at(t0, -w0), at(t1, -w1), at(t1, w1), at(t0, w0)];
const px = (b, [x, y], c) => b.set(Math.round(x - 0.5), Math.round(y - 0.5), c);
function seg(b, p, q, c) {
  const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 1.5);
  for (let i = 0; i <= n; i++) px(b, [p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n], c);
}
function sparkle(b, x, y, c = PAL.bone2) {
  b.set(x, y, c).set(x - 1, y, PAL.ember2).set(x + 1, y, PAL.ember2).set(x, y - 1, PAL.ember2).set(x, y + 1, PAL.ember2);
}
function flame(b, x, y, h) {
  for (let i = 0; i < h; i++) b.set(x + (i % 2 ? 0 : i > 1 ? -1 : 0), y - i, i === h - 1 ? PAL.ember2 : i > h / 2 ? PAL.ember1 : PAL.blood3);
}

// Adornos de la guarda (o de los hombros) según el material.
function guardDecor(b, mat, t, gw) {
  if (mat === 'legendario') {
    px(b, at(t, 0), GEM.legendario);
    px(b, at(t, -gw), PAL.ember2);
    px(b, at(t, gw), PAL.ember2);
  } else if (mat === 'raro') {
    px(b, at(t, 0), PAL.steel3);
  } else if (mat === 'divino') {
    // Alas que nacen de la guarda: tres plumas escalonadas por lado, abiertas hacia la punta.
    for (const side of [-1, 1]) {
      shaded(b, FEATHER, (l) => {
        for (let i = 0; i < 3; i++) {
          const [x, y] = at(t + 0.8 + i * 1.4, side * (gw + 0.6 + i * 0.9));
          l.ellipse(x, y, 1.6, 1.6, '#');
        }
        l.poly([at(t, side * gw), at(t + 4.5, side * (gw + 2.8)), at(t + 3.5, side * gw)], '#');
      }, 1);
    }
    px(b, at(t, 0), GEM.divino);
  } else if (mat === 'infernal') {
    // Guarda de cuernos que se curvan hacia la empuñadura, con puntas al rojo, y un ojo abierto.
    for (const side of [-1, 1]) {
      shaded(b, HORN, (l) => {
        for (let k = 0; k <= 1; k += 0.08) l.ellipse(...at(t - k * 3.5, side * (gw - 0.5 + k * 2.2 + Math.sin(k * 3) * 0.6)), 1.2 - k * 0.8, 1.2 - k * 0.8, '#');
      }, 1);
      px(b, at(t - 3.5, side * (gw + 1.9)), PAL.ember1);
    }
    px(b, at(t, 0), PAL.ember2);
    px(b, at(t + 0.6, 0), PAL.ink);
  }
}

function bladeDecor(b, mat, t0, t1, w) {
  if (mat === 'legendario') for (let t = t0 + 2; t < t1 - 3; t += 3) px(b, at(t, 0), PAL.ember2);
  if (mat === 'divino') {
    seg(b, at(t0 + 1, -w + 0.4), at(t1 - 2, -w * 0.5), PAL.bone2);
    const [x, y] = at(t1 - 4, 0);
    sparkle(b, Math.round(x) + 2, Math.round(y) - 3);
  }
  if (mat === 'infernal') {
    // Filo dentado y brasas que brotan del lomo.
    for (let t = t0 + 2; t < t1 - 2; t += 2.5) px(b, at(t, w + 0.3), null);
    for (let t = t0 + 3; t < t1 - 3; t += 4) {
      const [x, y] = at(t, -w - 1);
      flame(b, Math.round(x), Math.round(y), 3);
    }
  }
}

function weaponIcon(look, mat) {
  const M = MATERIALS[mat] || MATERIALS.comun;
  const b = new PixelBuffer(ICON, ICON);
  const blade = M.blade;
  const metal = M.metal;
  if (look === 'espada' || look === 'daga' || look === 'mandoble') {
    const L = look === 'daga' ? 14 : look === 'mandoble' ? 24.5 : 22;
    const bw = look === 'mandoble' ? 2.4 : look === 'daga' ? 1.3 : 1.6;
    const gt = look === 'mandoble' ? 7 : 5;
    const gw = look === 'mandoble' ? 5 : look === 'daga' ? 2.8 : 4;
    shaded(b, blade, (l) => l.poly([at(gt + 0.5, -bw), at(L - 2.6, -bw * 0.9), at(L, 0), at(L - 2.6, bw * 0.9), at(gt + 0.5, bw)], '#'), 1);
    seg(b, at(gt + 1.5, -0.5), at(L - 3, -0.5), blade[3]);
    if (look === 'mandoble') seg(b, at(gt + 2, 0.6), at(L - 5, 0.6), blade[0]);
    bladeDecor(b, mat, gt, L, bw);
    shaded(b, LEATHER, (l) => l.poly(band(1, gt - 0.5, 0.9), '#'));
    for (let t = 1.5; t < gt - 0.5; t += 1.4) px(b, at(t, 0), PAL.rust0);
    shaded(b, metal, (l) => l.ellipse(...at(0.4, 0), 1.5, 1.5, '#'));
    shaded(b, metal, (l) => l.poly([at(gt - 0.7, -gw), at(gt + 0.7, -gw), at(gt + 0.7, gw), at(gt - 0.7, gw)], '#'));
    guardDecor(b, mat, gt, gw);
  } else if (look === 'hacha') {
    shaded(b, WOOD, (l) => l.poly(band(0, 22.5, 0.85), '#'));
    shaded(b, LEATHER, (l) => l.poly(band(0.5, 5, 1), '#'));
    shaded(b, blade, (l) => l.poly([at(15.5, -0.8), at(13.5, -5.5), at(17.5, -8), at(22.5, -6), at(21.5, -0.8)], '#'), 1);
    seg(b, at(13.8, -5.8), at(18, -7.9), blade[3]);
    seg(b, at(18, -7.9), at(22.2, -5.9), blade[3]);
    shaded(b, metal, (l) => l.poly([at(18, 0.8), at(19.5, 3.8), at(21, 0.8)], '#'));
    shaded(b, metal, (l) => l.poly(band(16.5, 20.5, 1.2), '#'));
    guardDecor(b, mat, 18.5, 1.6);
    if (mat === 'infernal') for (const t of [14.5, 17, 20]) px(b, at(t, -6.5 + Math.abs(t - 17.5) * 0.4), null);
    if (mat === 'divino') sparkle(b, 6, 7);
  } else if (look === 'maza') {
    shaded(b, WOOD, (l) => l.poly(band(0, 17, 0.9), '#'));
    shaded(b, LEATHER, (l) => l.poly(band(0.5, 6, 1.1), '#'));
    const c = at(20, 0);
    shaded(b, metal, (l) => {
      l.ellipse(c[0], c[1], 3.8, 3.8, '#');
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0.7, -0.7]]) l.poly([[c[0] + dy * 1.5 + dx * 3, c[1] - dx * 1.5 + dy * 3], [c[0] + dx * 6, c[1] + dy * 6], [c[0] - dy * 1.5 + dx * 3, c[1] + dx * 1.5 + dy * 3]], '#');
    }, 2);
    b.set(Math.round(c[0]) - 2, Math.round(c[1]) - 2, metal[3]);
    guardDecor(b, mat, 17, 1.5);
    if (mat === 'infernal') { b.set(Math.round(c[0]), Math.round(c[1]), PAL.ember2).set(Math.round(c[0]) - 1, Math.round(c[1]), PAL.ink); }
  } else if (look === 'lanza') {
    shaded(b, WOOD, (l) => l.poly(band(0, 19, 0.75), '#'));
    shaded(b, blade, (l) => l.poly([at(18, 0), at(20.5, -2.3), at(25, 0), at(20.5, 2.3)], '#'), 1);
    seg(b, at(19, -0.4), at(24, -0.2), blade[3]);
    shaded(b, metal, (l) => l.poly(band(16.8, 18.2, 1.4), '#'));
    guardDecor(b, mat, 17.5, 1.5);
    if (mat === 'legendario') { px(b, at(16, 1.8), PAL.blood2); px(b, at(15, 2.4), PAL.blood3); px(b, at(14.4, 2.8), PAL.blood2); }
    bladeDecor(b, mat, 18, 25, 2);
  } else if (look === 'guadana') {
    shaded(b, WOOD, (l) => l.poly(band(0, 23, 0.8), '#'));
    shaded(b, blade, (l) => {
      for (let t = 0; t <= 1; t += 0.03) {
        const x = (1 - t) ** 2 * 20.5 + 2 * (1 - t) * t * 12 + t * t * 3;
        const y = (1 - t) ** 2 * 4 + 2 * (1 - t) * t * 1 + t * t * 8;
        l.ellipse(x, y, 2.2 - t * 1.6, 2 - t * 1.4, '#');
      }
    }, 1);
    for (let t = 0.1; t <= 0.85; t += 0.05) {
      const x = (1 - t) ** 2 * 20.5 + 2 * (1 - t) * t * 12 + t * t * 3;
      const y = (1 - t) ** 2 * 4 + 2 * (1 - t) * t * 1 + t * t * 8;
      b.set(Math.round(x), Math.round(y + 1.5 - t), blade[3]);
    }
    shaded(b, metal, (l) => l.poly(band(21, 23.5, 1.3), '#'));
    guardDecor(b, mat, 21.5, 1.6);
    if (mat === 'infernal') for (const x of [8, 12, 16]) flame(b, x, 1, 2);
    if (mat === 'divino') sparkle(b, 6, 4);
  }
  return b;
}

// ---------------------------------------------------------------- armaduras (vista frontal)

function armorIcon(look, mat) {
  const M = MATERIALS[mat] || MATERIALS.comun;
  const metal = M.metal;
  const b = new PixelBuffer(ICON, ICON);
  const fancy = mat === 'legendario' || mat === 'divino' || mat === 'infernal';
  const cloth = {
    harapos: [PAL.rust0, PAL.rust0, PAL.rust1, PAL.rust2],
    cuero: mat === 'divino' ? [PAL.ember0, PAL.rust2, PAL.bone0, PAL.bone1] : mat === 'infernal' ? [PAL.ink, PAL.blood0, PAL.rust0, PAL.blood1] : [PAL.rust0, PAL.rust1, PAL.rust2, PAL.ember0],
    habito: mat === 'divino' ? [PAL.stone2, PAL.bone0, PAL.bone1, PAL.bone2] : mat === 'infernal' ? [PAL.ink, PAL.blood0, PAL.blood0, PAL.blood1] : mat === 'raro' ? [PAL.night, PAL.steel0, PAL.steel1, PAL.steel2] : [PAL.ink, PAL.night, PAL.shade, PAL.dusk],
  }[look];
  // Alas por detrás (divino).
  if (mat === 'divino') {
    for (const flip of [false, true]) {
      const w = new PixelBuffer(ICON, ICON);
      w.poly([[8, 9], [1, 2], [0, 9], [2, 14], [7, 14]], '#');
      const sh = shadeLayer(flip ? w.flipH() : w, FEATHER, { shadowDepth: 1 });
      for (const y of [6, 9, 12]) sh.set(flip ? 23 - 2 : 2, y, PAL.stone2).set(flip ? 23 - 3 : 3, y + 1, PAL.stone2);
      b.paste(sh, 0, 0);
    }
  }
  if (look === 'harapos') {
    shaded(b, cloth, (l) => l.poly([[6, 4], [18, 4], [20, 18], [18, 21], [16, 19], [14, 22], [11, 19], [9, 22], [7, 19], [4, 20]], '#'), 2);
    b.ellipse(12, 4.5, 2.5, 1.5, PAL.ink);
    b.rect(8, 9, 3, 3, PAL.moss1).rect(8, 9, 3, 1, PAL.moss2).line(5, 14, 19, 14, PAL.rust0);
  } else if (look === 'cuero') {
    shaded(b, cloth, (l) => l.poly([[6, 5], [18, 5], [19, 20], [5, 20]], '#'), 2);
    shaded(b, cloth, (l) => l.ellipse(12, 5, 6, 2.5, '#'), 1);
    b.line(6, 6, 16, 16, cloth[0]).rect(5, 15, 15, 1, PAL.ink).set(12, 15, M.trim[1]);
    if (mat !== 'comun') for (const [x, y] of [[7, 8], [17, 8], [7, 18], [17, 18]]) b.set(x, y, M.trim[1]);
  } else if (look === 'habito') {
    shaded(b, cloth, (l) => { l.poly([[7, 8], [17, 8], [20, 22], [4, 22]], '#'); l.ellipse(12, 7, 5.5, 5.5, '#'); }, 2);
    b.ellipse(12, 8, 3, 3.2, PAL.ink);
    b.set(11, 8, mat === 'infernal' ? PAL.ember2 : mat === 'divino' ? PAL.ember2 : PAL.skin0).set(13, 8, mat === 'infernal' ? PAL.ember2 : mat === 'divino' ? PAL.ember2 : PAL.skin0);
    b.line(6, 15, 18, 15, fancy ? M.trim[1] : PAL.bone0).line(12, 15, 12, 19, fancy ? M.trim[1] : PAL.bone0);
  } else if (look === 'cota') {
    shaded(b, metal, (l) => l.poly([[5, 5], [19, 5], [22, 12], [18, 13], [18, 21], [6, 21], [6, 13], [2, 12]], '#'), 2);
    for (let y = 6; y < 21; y++) for (let x = 3; x < 22; x++) if ((x + y) % 2 === 0 && b.get(x, y) === metal[2]) b.set(x, y, metal[1]);
    shaded(b, mat === 'comun' ? [PAL.blood0, PAL.blood0, PAL.blood1, PAL.blood2] : [metal[0], M.trim[0], M.trim[1], M.trim[1]], (l) => l.rect(10, 6, 4, 15, '#'), 1);
  } else if (look === 'coraza' || look === 'placas') {
    const big = look === 'placas';
    const top = big ? 8 : 5;
    shaded(b, metal, (l) => l.poly([[6, top + 1], [9, top], [15, top], [18, top + 1], [18, 15], [16, 18], [8, 18], [6, 15]], '#'), 2);
    b.ellipse(12, top, 2.5, 1.5, PAL.ink);
    b.line(12, top + 2, 12, 17, metal[3]).line(13, top + 2, 13, 17, metal[1]);
    b.line(8, 13, 16, 13, metal[0]);
    shaded(b, metal, (l) => l.rect(7, 19, 4, 3, '#').rect(13, 19, 4, 3, '#'), 1);
    shaded(b, metal, (l) => { l.ellipse(5, big ? 9 : 6, big ? 4 : 3.2, big ? 3 : 2.5, '#'); l.ellipse(19, big ? 9 : 6, big ? 4 : 3.2, big ? 3 : 2.5, '#'); }, 1);
    if (big) {
      shaded(b, metal, (l) => l.ellipse(12, 4, 4, 4, '#').rect(8, 4, 9, 3, '#'), 1);
      b.rect(9, 5, 7, 1, PAL.ink);
      if (mat === 'infernal' || mat === 'divino') b.set(10, 5, PAL.ember2).set(14, 5, PAL.ember2);
    }
    if (fancy) b.line(7, top + 1, 10, top, M.trim[1]).line(14, top, 17, top + 1, M.trim[1]).line(8, 18, 16, 18, M.trim[1]).line(6, 9, 6, 14, M.trim[1]).line(18, 9, 18, 14, M.trim[1]);
  }
  // Cuernos (infernal) sobre los hombros o el yelmo, grietas encendidas y brasas en el borde.
  if (mat === 'infernal') {
    const top = look === 'placas' ? [[9, 2], [15, 2]] : [[4, 5], [20, 5]];
    top.forEach(([x, y], i) => shaded(b, HORN, (l) => {
      for (let k = 0; k <= 1; k += 0.1) l.ellipse(x + (i ? 1 : -1) * Math.sin(k * 1.6) * 3, y - k * 5, 1.2 - k * 0.8, 1.2 - k * 0.8, '#');
    }, 1));
    b.line(10, 11, 12, 14, PAL.ember1).line(12, 14, 11, 17, PAL.ember2).line(14, 12, 15, 15, PAL.ember1);
    for (const x of [7, 12, 17]) flame(b, x, 23, 3);
  }
  if (mat === 'legendario') b.ellipse(12, 12, 1.4, 1.4, GEM.legendario).set(12, 11, PAL.bone2);
  if (mat === 'divino') b.ellipse(12, 12, 1.4, 1.4, GEM.divino).set(12, 11, PAL.bone2);
  return b;
}

// ---------------------------------------------------------------- reliquias y consumibles

const RELIC_LOOK = { Amuleto: 'amuleto', Anillo: 'anillo', Rosario: 'rosario', Colgante: 'colgante', Reloj: 'reloj', Corazón: 'corazon' };

function relicIcon(look, mat) {
  const M = MATERIALS[mat] || MATERIALS.comun;
  const b = new PixelBuffer(ICON, ICON);
  const gem = GEM[mat] || PAL.stone3;
  const chain = (x0, x1, yb) => { for (let t = 0; t <= 1; t += 0.08) { b.set(Math.round(x0 + (12 - x0) * t), Math.round(2 + (yb - 2) * t), M.metal[2]); b.set(Math.round(x1 + (12 - x1) * t), Math.round(2 + (yb - 2) * t), M.metal[2]); } };
  if (look === 'amuleto') {
    chain(4, 20, 12);
    shaded(b, M.metal, (l) => l.ellipse(12, 15, 5, 5, '#'), 1);
    b.ellipse(12, 15, 2.2, 2.2, gem).set(11, 14, PAL.bone2);
  } else if (look === 'anillo') {
    shaded(b, M.metal, (l) => l.ellipse(12, 14, 7, 5, '#'), 1);
    b.ellipse(12, 14.5, 4.6, 3, null);
    shaded(b, [PAL.ink, gem, gem, PAL.bone2], (l) => l.poly([[9, 9], [15, 9], [12, 5]], '#').rect(9, 9, 7, 2, '#'), 1);
  } else if (look === 'rosario') {
    for (let a = 0; a < Math.PI * 2; a += 0.45) b.ellipse(12 + Math.cos(a) * 7, 10 + Math.sin(a) * 6, 1.3, 1.3, mat === 'comun' ? PAL.bone0 : M.trim[1]);
    shaded(b, WOOD, (l) => l.rect(11, 15, 2, 8, '#').rect(8, 17, 8, 2, '#'), 1);
  } else if (look === 'colgante') {
    chain(5, 19, 10);
    shaded(b, [PAL.steel0, PAL.steel2, PAL.steel3, PAL.bone2], (l) => l.poly([[12, 9], [16, 14], [12, 22], [8, 14]], '#'), 1);
    b.line(11, 12, 10, 16, PAL.bone2);
  } else if (look === 'reloj') {
    shaded(b, M.metal, (l) => l.ellipse(12, 13, 8, 8, '#').rect(10, 3, 4, 3, '#'), 2);
    b.ellipse(12, 13, 5.5, 5.5, PAL.bone2);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) b.set(Math.round(12 + Math.cos(a) * 4.5), Math.round(13 + Math.sin(a) * 4.5), PAL.stone1);
    b.set(12, 13, PAL.ink);
  } else {
    // Corazón de brasa: anatómico, con arterias y fuego.
    shaded(b, [PAL.blood0, PAL.blood1, PAL.blood2, PAL.blood3], (l) => { l.ellipse(9, 12, 5, 5, '#'); l.ellipse(15, 12, 5, 5, '#'); l.poly([[4, 13], [20, 13], [12, 22]], '#'); l.rect(10, 4, 3, 5, '#'); l.rect(14, 5, 2, 4, '#'); }, 2);
    b.line(8, 11, 11, 17, PAL.ember1).line(15, 10, 13, 16, PAL.ember2);
    for (const x of [7, 12, 17]) flame(b, x, 7, 3);
  }
  return b;
}

function consumableIcon(key) {
  const b = new PixelBuffer(ICON, ICON);
  const glass = [PAL.steel0, PAL.steel1, PAL.steel2, PAL.steel3];
  if (key === 'pocion') {
    shaded(b, glass, (l) => l.ellipse(12, 15, 7, 7, '#').rect(10, 4, 4, 6, '#'), 1);
    b.ellipse(12, 16, 5.5, 5, PAL.blood1).ellipse(11, 15, 3, 2, PAL.blood2).set(9, 13, PAL.bone2).set(14, 18, PAL.blood3);
    b.rect(10, 3, 4, 2, PAL.rust1);
  } else if (key === 'incienso') {
    shaded(b, [PAL.rust0, PAL.ember0, PAL.ember1, PAL.ember2], (l) => l.ellipse(12, 17, 6, 4, '#').rect(8, 13, 9, 3, '#'), 1);
    b.line(12, 13, 12, 2, PAL.stone2).line(6, 13, 12, 2, PAL.stone1).line(18, 13, 12, 2, PAL.stone1);
    for (const [x, y] of [[10, 9], [13, 6], [11, 4], [14, 10]]) b.set(x, y, PAL.bone1);
  } else {
    shaded(b, glass, (l) => l.rect(9, 7, 6, 13, '#').rect(10, 4, 4, 4, '#'), 1);
    b.rect(10, 12, 4, 7, PAL.moss2).rect(10, 12, 4, 1, PAL.bone1).set(10, 9, PAL.bone2);
    b.rect(10, 3, 4, 2, PAL.rust1);
  }
  return b;
}

function aura(b, color) {
  const add = [];
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (b.get(x, y) || (x + y) % 2) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => b.get(x + dx, y + dy) === PAL.ink)) add.push([x, y]);
    }
  }
  for (const [x, y] of add) b.set(x, y, color);
}

// Halo sobre los objetos divinos.
function halo(b) {
  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    const x = Math.round(12 + Math.cos(a) * 7);
    const y = Math.round(2 + Math.sin(a) * 1.8);
    if (!b.get(x, y)) b.set(x, y, PAL.ember2);
  }
}

export function relicLook(item) {
  return RELIC_LOOK[item.name.split(' ')[0]] || 'amuleto';
}

// Icono de cualquier objeto (consumible o equipo).
export function drawItemIcon(item) {
  if (item.kind === 'consumable') return consumableIcon(item.key).outline(PAL.ink);
  return drawEquipIcon(item.slot, item.slot === 'reliquia' ? relicLook(item) : itemLook(item), itemMaterial(item));
}

export function drawEquipIcon(slot, look, mat) {
  const b = slot === 'arma' ? weaponIcon(look, mat) : slot === 'armadura' ? armorIcon(look, mat) : relicIcon(look, mat);
  b.outline(PAL.ink);
  if (mat === 'divino' && slot !== 'arma') halo(b);
  if (AURA[mat]) aura(b, AURA[mat]);
  return b;
}

export function itemIconKey(item) {
  if (item.kind === 'consumable') return `icon_c_${item.key}`;
  const look = item.slot === 'reliquia' ? relicLook(item) : itemLook(item);
  return `icon_${item.slot}_${look}_${itemMaterial(item)}`;
}

export function ensureItemIcon(scene, item) {
  const key = itemIconKey(item);
  if (!scene.textures.exists(key)) addStrip(scene, key, [drawItemIcon(item)]);
  return key;
}
