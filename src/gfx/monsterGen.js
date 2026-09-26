import { PixelBuffer, shadeLayer, BAYER4 } from './pixelBuffer.js';
import { PAL } from '../palette.js';
import { createRng } from '../core/rng.js';
import { MATERIALS } from './heroArt.js';

// Criaturas por anatomía: cada arquetipo se arma con piezas (patas, torso, cabeza, fauces...) en
// vista 3/4 mirando hacia el jugador, se ilumina desde arriba a la izquierda y se detalla con
// texturas propias. La forma sigue al nombre (un Mastín no se parece a una Araña).
export const RAMPS = {
  flesh: [PAL.blood0, PAL.blood1, PAL.blood2, PAL.blood3],
  rot: [PAL.moss0, PAL.moss1, PAL.moss2, PAL.bone0],
  bone: [PAL.stone1, PAL.bone0, PAL.bone1, PAL.bone2],
  void: [PAL.night, PAL.dusk, PAL.stone0, PAL.stone2],
  rust: [PAL.rust0, PAL.rust1, PAL.rust2, PAL.ember1],
  steel: [PAL.steel0, PAL.steel1, PAL.steel2, PAL.steel3],
};

export const ARCHETYPES = ['beast', 'humanoid', 'wraith', 'crawler'];

const BONE = [PAL.stone1, PAL.bone0, PAL.bone1, PAL.bone2];
const RUST = [PAL.rust0, PAL.rust1, PAL.rust2, PAL.bone0];
const PALE = [PAL.stone1, PAL.stone2, PAL.bone0, PAL.bone1];
const RANK_GLOW = { raro: PAL.steel3, legendario: PAL.ember2, unico: PAL.blood3 };
const DEFAULT_FORM = { beast: 'bestia', humanoid: 'penitente', wraith: 'espectro', crawler: 'reptante' };

// Lápiz en coordenadas de 64x64: el mismo dibujo sirve para el sprite de combate y el del mapa.
function makePen(size) {
  const k = size / 64;
  const r = (v) => Math.max(0.7, v * k);
  const pen = {
    k,
    size,
    L: () => new PixelBuffer(size, size),
    ell: (l, cx, cy, rx, ry, c = '#') => l.ellipse(cx * k, cy * k, r(rx), r(ry), c),
    poly: (l, pts, c = '#') => l.poly(pts.map(([x, y]) => [x * k, y * k]), c),
    limb: (l, x0, y0, x1, y1, w0, w1 = w0, c = '#') => {
      const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * k * 1.5));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        l.ellipse((x0 + (x1 - x0) * t) * k, (y0 + (y1 - y0) * t) * k, r(w0 + (w1 - w0) * t), r(w0 + (w1 - w0) * t), c);
      }
      return l;
    },
    // Curva cuadrática con grosor variable (colas, cuernos, tentáculos).
    curve: (l, [[x0, y0], [cx, cy], [x1, y1]], w0, w1, c = '#') => {
      const steps = Math.max(4, Math.ceil((Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) * k * 1.5));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1;
        const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
        l.ellipse(x * k, y * k, r(w0 + (w1 - w0) * t), r(w0 + (w1 - w0) * t), c);
      }
      return l;
    },
    px: (b, x, y, c) => b.set(Math.round(x * k), Math.round(y * k), c),
    line: (b, x0, y0, x1, y1, c) => b.line(Math.round(x0 * k), Math.round(y0 * k), Math.round(x1 * k), Math.round(y1 * k), c),
  };
  return pen;
}

// Iluminación de volumen: cada pieza se trata como un cuerpo redondeado con luz arriba-izquierda,
// borde inferior en sombra y un poco de tramado ordenado entre bandas (recurso típico de GBA).
function shadeRound(mask, ramp, dither) {
  let x0 = mask.w;
  let y0 = mask.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (!mask.get(x, y)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
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
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      let v = 0.5 + (nx * -0.55 + ny * -0.83) * 0.42;
      if (!on(x, y + 1) || !on(x + 1, y)) v -= 0.24;
      else if (!on(x, y - 1) || !on(x - 1, y)) v += 0.2;
      const level = Math.max(0, Math.min(2.999, v * 3));
      const lo = Math.floor(level);
      const frac = level - lo;
      let idx = frac >= 0.5 ? lo + 1 : lo;
      if (dither && frac > 0.38 && frac < 0.62) idx = (frac - 0.38) / 0.24 > BAYER4[y % 4][x % 4] ? lo + 1 : lo;
      out.set(x, y, ramp[Math.min(3, idx)]);
    }
  }
  return out;
}

// Compone las piezas en orden. Donde una pieza se superpone a otra deja una línea de contacto
// oscura (como los contornos internos de los sprites de Pokémon).
function compose(size, parts, big) {
  const out = new PixelBuffer(size, size);
  for (const p of parts) {
    const shaded = p.mode === 'edge' ? shadeLayer(p.mask, p.ramp, { shadowDepth: p.depth ?? (big ? 2 : 1) }) : shadeRound(p.mask, p.ramp, big);
    if (big && p.contact !== false) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!p.mask.get(x, y)) continue;
          const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !p.mask.get(x + dx, y + dy) && out.get(x + dx, y + dy));
          if (touches) shaded.set(x, y, p.ramp[0]);
        }
      }
    }
    out.paste(shaded, 0, 0);
  }
  return out;
}

function farRamp(ramp) {
  return [PAL.ink, ramp[0], ramp[1], ramp[2]];
}

// ---------------------------------------------------------------- arquetipos

function beast(pen, rng, form, pal) {
  const j = (v, a) => v + (rng.next() * 2 - 1) * a;
  const parts = [];
  const add = (ramp, draw, mode = 'round', extra = {}) => { const l = pen.L(); draw(l); parts.push({ mask: l, ramp, mode, ...extra }); };
  const bw = j(1, 0.1);
  const bh = j(1, 0.1);
  const by = j(40, 2);
  const hx = j(18, 1.5);
  const hy = j(33, 2);
  const open = form === 'devorador' ? 9 : j(4.5, 1.2);
  const slim = form === 'carronero' || form === 'hiena' ? 0.85 : 1;
  add(pal.far, (l) => { pen.limb(l, 23, by + 4, 20, 60, 4 * slim, 3); pen.limb(l, 47, by + 4, 50, 60, 4 * slim, 3); }, 'edge');
  // Cola
  if (form === 'carronero') add(BONE, (l) => pen.curve(l, [[52, by - 3], [60, by - 2], [62, by - 14]], 2.2, 0.8), 'edge');
  else if (form !== 'bestia') add(pal.main, (l) => pen.curve(l, [[52, by - 3], [61, by - 3], [61, by - 16]], 3.4, 1.2), 'edge');
  add(pal.main, (l) => { pen.ell(l, 39, by, 15 * bw * slim, 11 * bh * slim); pen.ell(l, 27, by - 4, 12 * bw, 12 * bh); });
  add(pal.main, (l) => { pen.ell(l, 47, by + 5, 7 * slim, 8); pen.limb(l, 49, by + 9, 45, 60, 3.6 * slim, 3); });
  add(pal.main, (l) => pen.limb(l, 26, by + 2, 25, 60, 5 * slim, 3.6));
  add(pal.main, (l) => { pen.limb(l, 25, by - 6, hx + 4, hy, 7, 6); pen.ell(l, hx, hy, 9, 8); });
  add(pal.main, (l) => pen.poly(l, [[hx - 2, hy - 5], [hx - 15, hy - 1], [hx - 15, hy + 3], [hx - 1, hy + 4]]));
  add(pal.main, (l) => pen.poly(l, [[hx - 1, hy + 4], [hx - 13, hy + 3 + open], [hx - 12, hy + 6 + open], [hx + 3, hy + 8]]));
  // Orejas o cuernos.
  if (form === 'mastin' || form === 'hiena') add(pal.main, (l) => { pen.poly(l, [[hx - 1, hy - 6], [hx + 2, hy - 16], [hx + 5, hy - 6]]); pen.poly(l, [[hx + 4, hy - 6], [hx + 8, hy - 14], [hx + 9, hy - 4]]); });
  if (form === 'bestia' || form === 'devorador') add(pal.acc, (l) => { pen.curve(l, [[hx + 2, hy - 6], [hx + 4, hy - 16], [hx - 4, hy - 20]], 2.6, 0.7); pen.curve(l, [[hx + 7, hy - 5], [hx + 12, hy - 14], [hx + 8, hy - 20]], 2.2, 0.7); }, 'edge');
  const mane = form === 'hiena' || form === 'mastin' || form === 'bestia';
  return {
    parts,
    head: [hx, hy],
    body: [39, by, 15, 11],
    detail(b, big) {
      // Fauces: hueco oscuro, lengua y dientes.
      pen.poly(b, [[hx - 2, hy + 4], [hx - 14, hy + 2], [hx - 13, hy + 2 + open], [hx + 1, hy + 7]], PAL.ink);
      if (big) {
        pen.poly(b, [[hx - 4, hy + 5], [hx - 10, hy + 3 + open * 0.6], [hx - 3, hy + 6]], PAL.blood1);
        for (let x = hx - 13; x < hx - 1; x += 2.2) { pen.px(b, x, hy + 2.6, PAL.bone2); pen.px(b, x + 1, hy + 1 + open, PAL.bone1); }
      }
      // Lomo: crin oscura o vértebras.
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const x = 20 + t * 30;
        const y = by - 14 + Math.sin(t * Math.PI) * -2 + t * 4;
        if (mane) pen.poly(b, [[x - 2, y + 2], [x + 3, y + 1], [x + 3, y - 4 - (i % 2) * 2]], pal.main[0]);
        else if (big) pen.ell(b, x, y + 1, 1.6, 1.2, PAL.bone1);
      }
      if (big) {
        // Pelaje (trazos cortos) o costillas marcadas.
        if (form === 'carronero' || form === 'devorador') for (let i = 0; i < 4; i++) pen.curve(b, [[33 + i * 5, by - 7], [36 + i * 5, by], [33 + i * 5, by + 7]], 0.5, 0.5, pal.main[0]);
        else for (let i = 0; i < 26; i++) { const x = rng.int(20, 52); const y = rng.int(by - 8, by + 8); pen.line(b, x, y, x + 1.5, y + 2, pal.main[1]); }
        // Garras.
        for (const x of [21, 24, 27, 42, 45, 48]) pen.px(b, x, 61, PAL.bone1);
      }
    },
  };
}

function humanoid(pen, rng, form, pal, weapon) {
  const j = (v, a) => v + (rng.next() * 2 - 1) * a;
  const parts = [];
  const add = (ramp, draw, mode = 'round', extra = {}) => { const l = pen.L(); draw(l); parts.push({ mask: l, ramp, mode, ...extra }); };
  const hx = j(31, 1.5);
  const hy = form === 'ahorcado' ? 18 : j(16, 1.5);
  const cloth = form === 'monja' ? [PAL.ink, PAL.night, PAL.shade, PAL.dusk] : pal.main;
  add(farRamp(cloth), (l) => { pen.limb(l, 42, 26, 50, 48, 3.4, 2.6); pen.ell(l, 51, 50, 3, 3); }, 'edge');
  add(cloth, (l) => pen.poly(l, [[23, 22], [40, 22], [46, 40], [51, 62], [46, 59], [42, 62], [37, 59], [32, 62], [27, 59], [22, 62], [17, 59], [13, 62], [18, 40]]));
  if (form === 'verdugo') add(RUST, (l) => pen.poly(l, [[22, 38], [42, 38], [44, 60], [20, 60]]));
  // Cabeza según la forma.
  if (form === 'penitente') {
    add(cloth, (l) => { pen.poly(l, [[22, 26], [41, 26], [35, 1], [31, 0]]); pen.poly(l, [[23, 18], [40, 18], [42, 34], [21, 34]]); });
  } else if (form === 'verdugo') {
    add(RUST, (l) => { pen.ell(l, hx, hy, 9, 10); pen.poly(l, [[hx - 8, hy + 4], [hx + 8, hy + 4], [hx + 10, hy + 13], [hx - 10, hy + 13]]); });
  } else if (form === 'ahorcado') {
    add(PALE, (l) => pen.ell(l, hx - 3, hy, 7.5, 8));
    add(RUST, (l) => { pen.limb(l, hx + 1, hy + 7, 38, 0, 1.4, 1.4); pen.ell(l, hx, hy + 8, 6, 2); }, 'edge');
  } else if (form === 'monja') {
    add(cloth, (l) => pen.poly(l, [[hx - 10, hy - 6], [hx + 10, hy - 6], [hx + 13, hy + 18], [hx - 13, hy + 18]]));
    add(PALE, (l) => pen.ell(l, hx - 1, hy + 2, 6, 7.5));
  } else {
    add(cloth, (l) => { pen.ell(l, hx, hy, 10, 10); pen.poly(l, [[hx - 4, hy - 9], [hx + 8, hy - 13], [hx + 6, hy - 4]]); });
  }
  // Brazo cercano, largo, con garras (o empuñando el arma que porta).
  add(cloth, (l) => { pen.limb(l, 22, 25, 13, 46, 3.8, 2.8); }, 'edge');
  add(form === 'ahorcado' || form === 'monja' ? PALE : pal.far, (l) => pen.ell(l, 12, 48, 3.4, 3.2));
  return {
    parts,
    head: [hx, hy],
    body: [32, 42, 16, 18],
    detail(b, big) {
      const eye = pal.eye;
      if (form === 'penitente') {
        pen.ell(b, 28, 24, 1.8, 1.4, PAL.ink); pen.ell(b, 35, 24, 1.8, 1.4, PAL.ink);
        pen.px(b, 28, 24, eye); pen.px(b, 35, 24, eye);
        if (big) pen.line(b, 31.5, 28, 31.5, 33, cloth[1]);
      } else if (form === 'verdugo') {
        pen.ell(b, hx - 4, hy, 2, 2.2, PAL.ink); pen.ell(b, hx + 3, hy, 2, 2.2, PAL.ink);
        pen.px(b, hx - 4, hy, eye); pen.px(b, hx + 3, hy, eye);
        if (big) for (let y = hy - 8; y < hy + 10; y += 3) pen.line(b, hx - 7, y, hx + 7, y + 1, RUST[0]);
      } else if (form === 'ahorcado') {
        for (const ex of [hx - 6, hx]) { pen.line(b, ex - 1, hy - 1, ex + 1, hy + 1, PAL.ink); pen.line(b, ex - 1, hy + 1, ex + 1, hy - 1, PAL.ink); }
        pen.line(b, hx - 5, hy + 5, hx - 1, hy + 4, PAL.blood1);
      } else if (form === 'monja') {
        pen.poly(b, [[hx - 7, hy - 5], [hx + 6, hy - 5], [hx + 6, hy - 3], [hx - 7, hy - 3]], PAL.bone2);
        pen.ell(b, hx - 4, hy + 2, 1.6, 2, PAL.ink); pen.ell(b, hx + 2, hy + 2, 1.6, 2, PAL.ink);
        if (big) { pen.line(b, hx - 4, hy + 4, hx - 4, hy + 9, PAL.blood1); pen.line(b, hx + 2, hy + 4, hx + 2, hy + 8, PAL.blood1); }
      } else {
        pen.ell(b, hx - 2, hy + 2, 5.5, 5, PAL.ink);
        pen.px(b, hx - 4, hy + 1, eye); pen.px(b, hx + 1, hy + 1, eye);
      }
      if (big) {
        // Pliegues del hábito, cuerda o cadenas.
        for (const [x0, x1] of [[26, 22], [32, 32], [38, 43]]) pen.line(b, x0, 38, x1, 58, cloth[1]);
        pen.line(b, 20, 36, 44, 36, form === 'flagelante' ? PAL.rust1 : PAL.ink);
        if (form === 'flagelante') for (const [x, y] of [[27, 44], [35, 48], [30, 52]]) pen.ell(b, x, y, 1.4, 1, PAL.blood2);
        for (const x of [10, 12, 14]) pen.line(b, x, 50, x - 1, 55, PAL.bone1);
      }
      if (weapon) drawHeldWeapon(pen, b, weapon, big);
    },
  };
}

// El humanoide empuña en su mano el arma que porta como botín.
function drawHeldWeapon(pen, b, { look, rarity }, big) {
  const M = MATERIALS[rarity] || MATERIALS.comun;
  const l = pen.L();
  const blade = pen.L();
  if (look === 'lanza' || look === 'guadana') pen.limb(l, 11, 62, 8, 4, 1.2);
  else if (look === 'hacha' || look === 'maza') pen.limb(l, 12, 52, 6, 22, 1.3);
  else if (look !== 'daga') pen.limb(l, 12, 50, 12, 46, 1.2);
  if (look === 'espada') pen.poly(blade, [[10, 45], [14, 45], [7, 12], [5, 13]]);
  if (look === 'mandoble') pen.poly(blade, [[9, 45], [16, 45], [9, 4], [3, 6]]);
  if (look === 'daga') pen.poly(blade, [[10, 46], [13, 46], [9, 34], [8, 35]]);
  if (look === 'hacha') pen.poly(blade, [[1, 18], [9, 20], [9, 28], [1, 32]]);
  if (look === 'maza') pen.ell(blade, 6, 20, 5, 5);
  if (look === 'lanza') pen.poly(blade, [[8, 0], [11, 7], [8, 12], [5, 7]]);
  if (look === 'guadana') pen.curve(blade, [[8, 4], [20, 0], [30, 8]], 2.4, 0.6);
  b.paste(shadeLayer(l, [PAL.ink, PAL.rust0, PAL.rust1, PAL.rust2], { shadowDepth: 1 }), 0, 0);
  b.paste(shadeLayer(blade, M.blade, { shadowDepth: big ? 2 : 1 }), 0, 0);
  if (!['lanza', 'guadana', 'hacha', 'maza'].includes(look)) pen.line(b, 7, 45, 16, 45, M.metal[2]);
  if (big && M.glow) for (const [x, y] of [[8, 16], [6, 26]]) pen.px(b, x, y, M.glow);
  pen.ell(b, 12, 48, 3, 2.8, PAL.ink);
  pen.ell(b, 12, 47.5, 2.4, 2.2, PAL.bone0);
}

function wraith(pen, rng, form, pal) {
  const j = (v, a) => v + (rng.next() * 2 - 1) * a;
  const parts = [];
  const add = (ramp, draw, mode = 'round', extra = {}) => { const l = pen.L(); draw(l); parts.push({ mask: l, ramp, mode, ...extra }); };
  const hx = j(31, 1.5);
  const hy = j(15, 1.5);
  add(farRamp(BONE), (l) => { pen.limb(l, 42, 26, 56, 36, 1.8, 1.2); for (const dy of [-2, 0, 2]) pen.limb(l, 56, 36, 61, 38 + dy * 1.5, 0.8, 0.5); }, 'edge');
  add(pal.main, (l) => pen.poly(l, [[hx - 9, hy], [hx + 10, hy], [48, 36], [52, 48], [46, 56], [42, 50], [38, 62], [33, 52], [28, 60], [24, 50], [18, 58], [15, 46], [16, 30]]));
  add(pal.main, (l) => { pen.ell(l, hx, hy, 11, 11); pen.poly(l, [[hx - 3, hy - 10], [hx + 9, hy - 14], [hx + 8, hy - 3]]); });
  if (form === 'planidera') add(BONE, (l) => pen.ell(l, hx - 2, hy + 1, 6.5, 8));
  add(BONE, (l) => { pen.limb(l, 22, 26, 8, 34, 2, 1.4); for (const dy of [-3, 0, 3]) pen.limb(l, 8, 34, 2, 36 + dy * 1.5, 1, 0.6); }, 'edge');
  return {
    parts,
    head: [hx, hy],
    body: [32, 38, 16, 18],
    fade: true,
    detail(b, big) {
      const eye = pal.eye;
      if (form === 'planidera') {
        pen.line(b, hx - 6, hy, hx - 3, hy + 1, PAL.ink); pen.line(b, hx, hy + 1, hx + 3, hy, PAL.ink);
        pen.line(b, hx - 4, hy + 2, hx - 4, hy + 8, PAL.stone2); pen.line(b, hx + 1, hy + 2, hx + 1, hy + 7, PAL.stone2);
        pen.ell(b, hx - 1.5, hy + 5.5, 1.4, 1, PAL.ink);
      } else {
        pen.ell(b, hx - 2, hy + 2, 6, 7, PAL.ink);
        pen.ell(b, hx - 4, hy + 1, 1.2, 1.2, eye); pen.ell(b, hx + 1, hy + 1, 1.2, 1.2, eye);
        if (big) { pen.px(b, hx - 4, hy + 1, PAL.bone2); pen.px(b, hx + 1, hy + 1, PAL.bone2); }
      }
      if (form === 'eco' && big) for (const [x, y] of [[26, 38], [38, 44], [30, 50]]) { pen.ell(b, x, y, 2.4, 2.8, PAL.ink); pen.px(b, x - 1, y - 1, eye); pen.px(b, x + 1, y - 1, eye); }
      if (form === 'lamento' && big) for (let y = 34; y < 54; y += 3) pen.ell(b, 44 + (y % 2), y, 1.6, 1.4, PAL.steel1);
      if (big) for (const [x0, x1] of [[24, 20], [31, 30], [38, 41]]) pen.line(b, x0, 28, x1, 50, pal.main[1]);
    },
  };
}

function crawler(pen, rng, form, pal) {
  const j = (v, a) => v + (rng.next() * 2 - 1) * a;
  const parts = [];
  const add = (ramp, draw, mode = 'round', extra = {}) => { const l = pen.L(); draw(l); parts.push({ mask: l, ramp, mode, ...extra }); };
  if (form === 'arana' || form === 'tejedor') {
    const legs = (l, list) => { for (const [x0, y0, kx, ky, fx] of list) { pen.limb(l, x0, y0, kx, ky, 2, 1.6); pen.limb(l, kx, ky, fx, 62, 1.6, 0.8); } };
    add(pal.far, (l) => legs(l, [[30, 40, 40, 22, 50], [32, 42, 48, 26, 58], [28, 42, 16, 24, 8], [26, 44, 10, 30, 2]]), 'edge');
    add(pal.main, (l) => pen.ell(l, 44, 34, j(15, 1.5), j(13, 1.5)));
    add(pal.main, (l) => pen.ell(l, 24, 44, 10, 8));
    add(pal.main, (l) => legs(l, [[28, 46, 36, 30, 44], [24, 48, 30, 32, 34], [20, 46, 12, 34, 14], [22, 48, 6, 40, 4]]), 'edge');
    return {
      parts,
      head: [20, 42],
      body: [44, 34, 15, 13],
      detail(b, big) {
        for (const [x, y, r] of [[17, 41, 1.6], [21, 39, 1.6], [16, 45, 1.1], [23, 43, 1.1], [19, 37, 1], [25, 38, 1]]) { pen.ell(b, x, y, r, r, PAL.ink); pen.px(b, x, y, pal.eye); }
        pen.limb(b, 15, 48, 13, 53, 1.2, 0.6, PAL.bone1); pen.limb(b, 21, 49, 21, 54, 1.2, 0.6, PAL.bone1);
        if (big) {
          pen.poly(b, [[42, 26], [48, 26], [45, 32], [48, 40], [42, 40], [45, 32]], pal.acc[2]);
          for (let i = 0; i < 12; i++) pen.px(b, rng.int(34, 56), rng.int(24, 44), pal.main[3]);
        }
      },
    };
  }
  if (form === 'roedor') {
    add(pal.far, (l) => { pen.limb(l, 22, 48, 20, 60, 2.8, 2.2); pen.limb(l, 46, 50, 50, 60, 3, 2.2); }, 'edge');
    add(pal.main, (l) => pen.curve(l, [[52, 50], [64, 46], [60, 24]], 1.6, 0.6), 'edge');
    add(pal.main, (l) => pen.ell(l, 38, 46, 17, 12));
    add([PAL.blood0, PAL.blood0, PAL.blood1, PAL.skin1], (l) => { pen.ell(l, 22, 34, 4, 4.5); pen.ell(l, 27, 36, 3.5, 4); });
    add(pal.main, (l) => { pen.ell(l, 18, 42, 9, 8); pen.poly(l, [[14, 38], [2, 45], [14, 49]]); });
    add(pal.main, (l) => { pen.limb(l, 26, 50, 24, 61, 3, 2.4); pen.limb(l, 44, 50, 42, 61, 3.2, 2.4); }, 'edge');
    return {
      parts,
      head: [16, 41],
      body: [38, 46, 17, 12],
      detail(b, big) {
        pen.ell(b, 14, 41, 1.6, 1.6, PAL.ink); pen.px(b, 14, 41, pal.eye);
        pen.px(b, 3, 45, PAL.ink);
        pen.poly(b, [[5, 47], [8, 47], [7, 51]], PAL.bone2);
        if (big) {
          for (const dy of [-2, 0, 2]) pen.line(b, 5, 46 + dy, -2, 44 + dy * 2, PAL.stone2);
          for (let i = 0; i < 22; i++) { const x = rng.int(26, 52); const y = rng.int(38, 54); pen.line(b, x, y, x + 2, y + 1, pal.main[1]); }
        }
      },
    };
  }
  // Larva o reptante: cuerpo segmentado que se alza hacia la cabeza.
  const segs = 7;
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const fat = form === 'larva' ? Math.sin(t * Math.PI) * 5 + 7 : 7 - t * 1.5;
    pts.push([56 - t * 36, 54 - Math.sin(t * Math.PI * 0.6) * 22 + j(0, 1), fat]);
  }
  if (form !== 'larva') add(pal.far, (l) => { for (const [x, y] of pts) pen.limb(l, x, y, x + 3, 62, 1, 0.6); }, 'edge');
  for (const [x, y, r] of pts) add(pal.main, (l) => pen.ell(l, x, y, r, r * 0.92));
  const [hx, hy] = pts[segs - 1];
  add(pal.main, (l) => pen.ell(l, hx - 5, hy - 1, 7, 6.5));
  if (form !== 'larva') add(pal.main, (l) => { for (const [x, y] of pts) pen.limb(l, x - 1, y + 3, x - 4, 62, 1.1, 0.6); }, 'edge');
  return {
    parts,
    head: [hx - 5, hy - 1],
    body: [38, 46, 16, 10],
    detail(b, big) {
      pen.curve(b, [[hx - 10, hy + 2], [hx - 15, hy + 5], [hx - 12, hy + 9]], 1.3, 0.5, PAL.bone1);
      pen.curve(b, [[hx - 6, hy + 4], [hx - 8, hy + 9], [hx - 4, hy + 11]], 1.2, 0.5, PAL.bone1);
      pen.ell(b, hx - 7, hy - 3, 1.5, 1.5, PAL.ink); pen.px(b, hx - 7, hy - 3, pal.eye);
      pen.ell(b, hx - 3, hy - 4, 1.2, 1.2, PAL.ink); pen.px(b, hx - 3, hy - 4, pal.eye);
      if (big) for (const [x, y, r] of pts) { pen.line(b, x - r * 0.3, y - r * 0.8, x - r * 0.6, y - r * 0.2, pal.main[3]); pen.px(b, x, y + r * 0.4, pal.main[0]); }
    },
  };
}

// ---------------------------------------------------------------- rareza

function rankDecor(pen, b, rng, rank, shape, pal, big) {
  if (rank === 'comun') return;
  const [bx, by, brx, bry] = shape.body;
  const [hx, hy] = shape.head;
  if (rank === 'raro' && big) {
    for (let i = 0; i < 3; i++) pen.curve(b, [[bx - brx * 0.5 + i * 5, by - bry * 0.5], [bx - brx * 0.3 + i * 5, by], [bx - brx * 0.5 + i * 5, by + bry * 0.4]], 0.8, 0.5, pal.acc[3]);
  }
  if (rank === 'legendario') {
    // Corona de cuernos y runas encendidas.
    const horn = pen.L();
    pen.curve(horn, [[hx - 4, hy - 6], [hx - 10, hy - 14], [hx - 6, hy - 22]], 2.2, 0.6);
    pen.curve(horn, [[hx + 3, hy - 7], [hx + 8, hy - 15], [hx + 5, hy - 23]], 2.2, 0.6);
    b.paste(shadeLayer(horn, [PAL.ember0, PAL.ember1, PAL.ember2, PAL.bone2], { shadowDepth: 1 }), 0, 0);
    if (big) for (let i = 0; i < 5; i++) { const x = bx + rng.int(-brx * 0.6, brx * 0.6); const y = by + rng.int(-bry * 0.5, bry * 0.5); if (b.get(Math.round(x * pen.k), Math.round(y * pen.k))) { pen.line(b, x, y, x + 1, y + 2, PAL.ember2); pen.px(b, x + 2, y, PAL.ember1); } }
  }
  if (rank === 'unico') {
    // Ojos que no deberían estar ahí.
    for (let i = 0, placed = 0; i < 30 && placed < (big ? 4 : 2); i++) {
      const x = bx + rng.int(-brx * 0.6, brx * 0.6);
      const y = by + rng.int(-bry * 0.5, bry * 0.5);
      if (!b.get(Math.round(x * pen.k), Math.round(y * pen.k)) || !b.get(Math.round((x + 3) * pen.k), Math.round((y + 3) * pen.k))) continue;
      placed++;
      if (big) {
        pen.ell(b, x, y, 2.6, 1.8, PAL.ink);
        pen.ell(b, x, y, 1.6, 1.1, PAL.blood2);
        pen.line(b, x, y - 1, x, y + 1, PAL.ink);
        pen.px(b, x - 1, y - 1, PAL.ember2);
      } else pen.px(b, x, y, PAL.blood3);
    }
  }
}

// Aura punteada fuera del contorno: el rango se distingue de un vistazo, también en el mapa.
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

// Espectros: el borde inferior se deshace en tramado (transparencia de GBA).
function fadeBottom(b, from) {
  for (let y = Math.floor(b.h * from); y < b.h; y++) {
    const t = (y - b.h * from) / (b.h * (1 - from));
    for (let x = 0; x < b.w; x++) if (b.get(x, y) && BAYER4[y % 4][x % 4] < t * 0.7) b.set(x, y, null);
  }
}

export function generateMonster({ seed, size = 64, archetype, ramp, rank = 'comun', form, weapon = null }) {
  const rng = createRng(seed);
  const arch = archetype || rng.pick(ARCHETYPES);
  const rampKey = ramp || rng.pick(Object.keys(RAMPS));
  const main = RAMPS[rampKey];
  const big = size >= 40;
  const eye = rng.pick([PAL.ember2, PAL.blood3, PAL.bone2, PAL.steel3]);
  const pal = { main, far: farRamp(main), acc: rampKey === 'bone' ? RUST : BONE, eye };
  const pen = makePen(size);
  const shapeRng = rng.fork('shape');
  const f = form || DEFAULT_FORM[arch];
  const shape = arch === 'beast' ? beast(pen, shapeRng, f, pal)
    : arch === 'humanoid' ? humanoid(pen, shapeRng, f, pal, weapon)
      : arch === 'wraith' ? wraith(pen, shapeRng, f, pal) : crawler(pen, shapeRng, f, pal);
  const b = compose(size, shape.parts, big);
  shape.detail(b, big);
  rankDecor(pen, b, rng.fork('rank'), rank, shape, pal, big);
  if (shape.fade && big) fadeBottom(b, 0.78);
  b.outline(PAL.ink);
  if (RANK_GLOW[rank] && rank !== 'raro') aura(b, RANK_GLOW[rank]);
  else if (rank === 'raro' && !big) aura(b, RANK_GLOW.raro);
  return { buffer: b, archetype: arch, eyeColor: eye };
}
