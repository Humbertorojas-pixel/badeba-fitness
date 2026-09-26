import { PixelBuffer, shadeLayer, BAYER4 } from './pixelBuffer.js';
import { PAL } from '../palette.js';
import { createRng } from '../core/rng.js';
import { MATERIALS } from './heroArt.js';
import { drawEquipIcon } from './itemArt.js';

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

export const ARCHETYPES = ['beast', 'humanoid', 'wraith', 'crawler', 'eldritch', 'ito', 'undead'];

const BONE = [PAL.stone1, PAL.bone0, PAL.bone1, PAL.bone2];
const RUST = [PAL.rust0, PAL.rust1, PAL.rust2, PAL.bone0];
const PALE = [PAL.stone1, PAL.stone2, PAL.bone0, PAL.bone1];
const RANK_GLOW = { raro: PAL.steel3, legendario: PAL.ember2, unico: PAL.blood3 };
const DEFAULT_FORM = { beast: 'bestia', humanoid: 'penitente', wraith: 'espectro', crawler: 'reptante', eldritch: 'engendro', ito: 'cabeza_colgante', undead: 'esqueleto' };

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
    if (p.raw) {
      out.paste(p.raw, 0, 0);
      continue;
    }
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
  if (form === 'licantropo') return werewolf(pen, rng, pal);
  if (form === 'gargola') return gargoyle(pen, rng);
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
    hold: { mode: 'impaled', at: [40, by - 5] },
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

function humanoid(pen, rng, form, pal) {
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
    hold: { mode: 'hand', at: [12, 48], fist: form === 'ahorcado' || form === 'monja' ? PALE : pal.far },
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
    },
  };
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
    hold: { mode: 'dangle', at: [5, 36] },
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
      hold: { mode: 'impaled', at: [42, 31] },
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
      hold: { mode: 'impaled', at: [40, 40] },
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
    hold: { mode: 'impaled', at: [pts[3][0], pts[3][1] - 1] },
    detail(b, big) {
      pen.curve(b, [[hx - 10, hy + 2], [hx - 15, hy + 5], [hx - 12, hy + 9]], 1.3, 0.5, PAL.bone1);
      pen.curve(b, [[hx - 6, hy + 4], [hx - 8, hy + 9], [hx - 4, hy + 11]], 1.2, 0.5, PAL.bone1);
      pen.ell(b, hx - 7, hy - 3, 1.5, 1.5, PAL.ink); pen.px(b, hx - 7, hy - 3, pal.eye);
      pen.ell(b, hx - 3, hy - 4, 1.2, 1.2, PAL.ink); pen.px(b, hx - 3, hy - 4, pal.eye);
      if (big) for (const [x, y, r] of pts) { pen.line(b, x - r * 0.3, y - r * 0.8, x - r * 0.6, y - r * 0.2, pal.main[3]); pen.px(b, x, y + r * 0.4, pal.main[0]); }
    },
  };
}

// ---------------------------------------------------------------- horrores nuevos

const PAPER = [PAL.stone1, PAL.bone0, PAL.bone1, PAL.bone2];
const IRONR = [PAL.night, PAL.steel0, PAL.steel1, PAL.steel2];
const STONE = [PAL.stone0, PAL.stone1, PAL.stone2, PAL.stone3];
const HAIRR = [PAL.ink, PAL.ink, PAL.night, PAL.shade];
const DARKR = [PAL.ink, PAL.night, PAL.shade, PAL.dusk];
const GOLD = [PAL.ember0, PAL.ember1, PAL.ember2, PAL.bone2];

function builder(pen) {
  const parts = [];
  const add = (ramp, draw, mode = 'round', extra = {}) => { const l = pen.L(); draw(l); parts.push({ mask: l, ramp, mode, ...extra }); };
  return { parts, add };
}

// Ojo con esclerótica, iris, pupila rasgada y brillo.
function eyeBall(pen, b, x, y, r, color, big) {
  pen.ell(b, x, y, r, r * 0.85, PAL.ink);
  pen.ell(b, x, y, r - 0.6, r * 0.85 - 0.6, PAL.bone1);
  pen.ell(b, x + r * 0.15, y, r * 0.55, r * 0.55, color);
  pen.ell(b, x + r * 0.2, y, Math.max(0.5, r * 0.18), r * 0.45, PAL.ink);
  if (big) pen.px(b, x - r * 0.35, y - r * 0.4, PAL.bone2);
}

// Rostro de pesadilla: ojos enormes con pupilas mínimas y boca imposible.
function itoFace(pen, b, x, y, s, big, mouth = 'grin') {
  for (const dx of [-3.4 * s, 3.4 * s]) {
    pen.ell(b, x + dx, y, 2.6 * s, 2 * s, PAL.ink);
    pen.ell(b, x + dx, y, 2.1 * s, 1.5 * s, PAL.bone2);
    pen.px(b, x + dx + 0.4, y, PAL.ink);
    if (big) pen.line(b, x + dx - 2.4 * s, y - 2.8 * s, x + dx + 2 * s, y - 3.2 * s, PAL.ink);
  }
  if (mouth === 'grin') {
    // Sonrisa abierta de oreja a oreja: media luna negra con una hilera de dientes.
    const pts = [];
    for (let t = 0; t <= 1; t += 0.1) pts.push([x - 6 * s + 12 * s * t, y + 3.5 * s + Math.sin(t * Math.PI) * 5 * s]);
    for (let t = 1; t >= 0; t -= 0.1) pts.push([x - 6 * s + 12 * s * t, y + 3.5 * s + Math.sin(t * Math.PI) * 1.6 * s]);
    pen.poly(b, pts, PAL.ink);
    if (big) for (let t = 0.12; t < 0.9; t += 0.1) pen.line(b, x - 6 * s + 12 * s * t, y + 3.6 * s + Math.sin(t * Math.PI) * 1.6 * s, x - 6 * s + 12 * s * t, y + 4.8 * s + Math.sin(t * Math.PI) * 1.8 * s, PAL.bone2);
  } else {
    pen.ell(b, x, y + 5 * s, 1.6 * s, 2.4 * s, PAL.ink);
  }
}

function eldritch(pen, rng, form, pal) {
  const j = (v, a) => v + (rng.next() * 2 - 1) * a;
  const { parts, add } = builder(pen);
  if (form === 'ojo') {
    add(pal.far, (l) => { for (const [x0, x1, x2, y2] of [[24, 16, 12, 62], [30, 28, 24, 63], [38, 42, 46, 63], [44, 52, 56, 60]]) pen.curve(l, [[x0, 40], [x1, 52], [x2, y2]], 2.6, 0.7); }, 'edge');
    add(pal.main, (l) => pen.ell(l, 32, 25, 20, 19));
    add(pal.main, (l) => { for (const [x0, x1, x2] of [[26, 20, 18], [34, 36, 36], [40, 46, 50]]) pen.curve(l, [[x0, 40], [x1, 52], [x2, 63]], 2.8, 0.8); }, 'edge');
    return {
      parts, head: [32, 12], body: [32, 25, 18, 17], hold: { mode: 'dangle', at: [20, 55] }, fade: true,
      detail(b, big) {
        pen.ell(b, 31, 26, 15, 13, PAL.ink);
        pen.ell(b, 31, 26, 14, 12, PAL.bone1);
        pen.ell(b, 28, 23, 9, 6, PAL.bone2);
        if (big) for (const [x0, y0, x1, y1] of [[17, 22, 23, 25], [18, 32, 24, 29], [44, 20, 38, 24], [45, 30, 39, 28], [30, 14, 31, 19]]) pen.line(b, x0, y0, x1, y1, PAL.blood2);
        pen.ell(b, 33, 26, 7.5, 7.5, pal.eye);
        pen.ell(b, 33, 26, 5, 5, pal.main[1]);
        pen.ell(b, 33, 26, 1.6, 5.5, PAL.ink);
        pen.px(b, 29, 22, PAL.bone2);
        if (big) {
          pen.curve(b, [[13, 22], [31, 8], [50, 22]], 1.4, 1.4, pal.main[0]);
          for (const [x, y] of [[20, 50], [22, 56], [35, 50], [36, 56], [44, 50], [47, 56]]) pen.px(b, x, y, PAL.bone0);
        }
      },
    };
  }
  if (form === 'profundo') {
    add(pal.far, (l) => { pen.limb(l, 42, 30, 50, 50, 3, 2.4); pen.ell(l, 51, 52, 3, 2.5); }, 'edge');
    add(pal.main, (l) => pen.poly(l, [[20, 26], [40, 22], [48, 40], [46, 58], [36, 62], [22, 60], [16, 44]]));
    add(pal.main, (l) => { pen.ell(l, 22, 56, 8, 5); pen.ell(l, 42, 57, 8, 5); });
    add(pal.acc, (l) => { for (let i = 0; i < 6; i++) pen.poly(l, [[34 + i * 2.5, 16 + i * 4], [38 + i * 2.5, 18 + i * 4], [41 + i * 3, 10 + i * 4]]); }, 'edge');
    add(pal.main, (l) => pen.ell(l, 25, 19, 13, 10));
    add(pal.main, (l) => { pen.limb(l, 20, 30, 10, 46, 3.4, 2.6); }, 'edge');
    return {
      parts, head: [25, 19], body: [32, 42, 14, 16], hold: { mode: 'hand', at: [10, 47] },
      detail(b, big) {
        pen.curve(b, [[13, 24], [22, 29], [34, 25]], 1, 1, PAL.ink);
        if (big) for (let x = 15; x < 33; x += 2.5) pen.px(b, x, 25.5 + Math.sin(((x - 13) / 21) * Math.PI) * 3, PAL.bone2);
        eyeBall(pen, b, 16, 15, 3.6, pal.eye, big);
        eyeBall(pen, b, 31, 12, 2.8, pal.eye, big);
        if (big) {
          for (const x of [30, 33, 36]) pen.curve(b, [[x, 27], [x + 1, 30], [x, 33]], 0.5, 0.5, pal.main[0]);
          for (let y = 36; y < 58; y += 3) for (let x = 22 + (y % 2) * 2; x < 44; x += 4) if (b.get(Math.round(x * pen.k), Math.round(y * pen.k))) pen.curve(b, [[x - 1, y], [x, y + 1], [x + 1, y]], 0.5, 0.5, pal.main[1]);
          for (const dx of [-2, 0, 2]) pen.line(b, 10, 48, 10 + dx - 2, 53, PAL.bone1);
        }
      },
    };
  }
  if (form === 'heraldo') {
    add(DARKR, (l) => {
      pen.poly(l, [[26, 26], [12, 4], [4, 8], [1, 24], [8, 20], [10, 32], [16, 26], [20, 36]]);
      pen.poly(l, [[38, 26], [52, 4], [60, 8], [63, 24], [56, 20], [54, 32], [48, 26], [44, 36]]);
    });
    add(pal.far, (l) => { pen.ell(l, 42, 58, 7, 5); pen.limb(l, 42, 36, 52, 50, 3, 2.4); }, 'edge');
    add(pal.main, (l) => { pen.ell(l, 32, 42, 13, 14); pen.ell(l, 22, 58, 7, 5); });
    add(pal.main, (l) => pen.ell(l, 31, 16, 10, 11));
    add(pal.main, (l) => { for (const [x0, x1, y1] of [[25, 21, 38], [28, 26, 40], [31, 31, 41], [34, 36, 40], [37, 41, 36]]) pen.curve(l, [[x0, 22], [x0 + (x1 - x0) * 0.3 + 2, 30], [x1, y1]], 1.8, 0.5); }, 'edge');
    add(pal.main, (l) => pen.limb(l, 22, 34, 12, 50, 3.2, 2.4), 'edge');
    return {
      parts, head: [31, 16], body: [32, 42, 13, 14], hold: { mode: 'hand', at: [12, 50] },
      detail(b, big) {
        pen.ell(b, 27, 16, 1.6, 1.2, pal.eye); pen.ell(b, 35, 16, 1.6, 1.2, pal.eye);
        if (big) {
          for (const [x0, y0, x1, y1] of [[24, 26, 6, 8], [22, 30, 3, 22], [40, 26, 58, 8], [42, 30, 61, 22]]) pen.line(b, x0, y0, x1, y1, PAL.ink);
          for (let i = 0; i < 6; i++) pen.px(b, 26 + i * 2.4, 32 + (i % 2) * 3, PAL.bone0);
          pen.curve(b, [[24, 10], [31, 5], [38, 10]], 0.6, 0.6, pal.main[3]);
        }
      },
    };
  }
  if (form === 'fungoide') {
    add([PAL.stone1, PAL.stone2, PAL.bone0, PAL.bone1], (l) => { pen.curve(l, [[42, 28], [52, 10], [60, 6]], 5, 2.5); pen.curve(l, [[36, 26], [34, 12], [38, 2]], 4, 2); });
    add(pal.far, (l) => { for (const x of [36, 44, 52]) { pen.limb(l, x, 44, x + 3, 54, 1.4, 1.2); pen.limb(l, x + 3, 54, x + 1, 62, 1.2, 0.7); } }, 'edge');
    add(pal.main, (l) => { pen.ell(l, 48, 42, 10, 7); pen.ell(l, 36, 40, 9, 7); pen.ell(l, 26, 38, 7, 6); });
    add(pal.main, (l) => { for (const x of [30, 40, 48]) { pen.limb(l, x, 44, x - 3, 54, 1.4, 1.2); pen.limb(l, x - 3, 54, x - 1, 62, 1.2, 0.7); } }, 'edge');
    add(pal.acc, (l) => { pen.limb(l, 22, 42, 10, 46, 2, 1.6); pen.poly(l, [[10, 42], [2, 40], [6, 46], [2, 50], [11, 49]]); }, 'edge');
    add([PAL.blood0, PAL.blood1, PAL.blood2, PAL.bone1], (l) => pen.ell(l, 22, 26, 10, 8.5));
    return {
      parts, head: [22, 26], body: [38, 40, 14, 7], hold: { mode: 'impaled', at: [40, 37] },
      detail(b, big) {
        if (big) {
          for (let i = 0; i < 7; i++) pen.curve(b, [[14 + i * 2.2, 20 + (i % 2) * 2], [17 + i * 2.2, 26], [14 + i * 2.2, 32 - (i % 2) * 2]], 0.5, 0.5, PAL.blood0);
          for (const [x, y, c] of [[18, 22, PAL.steel3], [26, 28, PAL.ember2], [22, 31, PAL.steel3], [28, 21, PAL.ember2]]) pen.px(b, x, y, c);
          for (const [x0, x1] of [[18, 8], [24, 22], [28, 34]]) pen.curve(b, [[x0, 18], [x0 + 2, 12], [x1, 6]], 0.8, 0.4, PAL.blood1);
          for (const [x0, y0, x1, y1] of [[43, 26, 58, 7], [46, 22, 60, 12], [36, 25, 37, 4], [38, 20, 41, 6]]) pen.line(b, x0, y0, x1, y1, PAL.stone1);
          for (let i = 0; i < 16; i++) { const x = rng.int(34, 62); const y = rng.int(2, 28); const c = b.get(Math.round(x * pen.k), Math.round(y * pen.k)); if (c === PAL.bone0 || c === PAL.bone1) pen.px(b, x, y, null); }
        }
      },
    };
  }
  // Engendro: masa amorfa de carne, ojos y bocas.
  add(pal.far, (l) => { pen.curve(l, [[12, 50], [2, 44], [4, 30]], 3, 0.8); pen.curve(l, [[52, 48], [62, 40], [60, 26]], 3, 0.8); }, 'edge');
  add(pal.main, (l) => {
    pen.ell(l, 32, 48, 26, 15);
    pen.ell(l, j(22, 2), 36, 12, 12);
    pen.ell(l, j(41, 2), 32, 13, 13);
    pen.ell(l, 31, 22, 10, 9);
  });
  add(pal.main, (l) => { pen.curve(l, [[18, 56], [8, 60], [4, 52]], 2.6, 0.7); pen.curve(l, [[44, 58], [54, 63], [60, 56]], 2.6, 0.7); }, 'edge');
  return {
    parts, head: [31, 22], body: [32, 42, 20, 14], hold: { mode: 'impaled', at: [36, 26] },
    detail(b, big) {
      const spots = [[22, 34, 3.6], [38, 28, 4.2], [30, 20, 2.6], [46, 40, 2.4], [16, 46, 2.2], [28, 48, 3], [40, 50, 2], [52, 48, 1.8], [34, 38, 1.6]];
      for (const [x, y, r] of spots.slice(0, big ? 9 : 4)) eyeBall(pen, b, x, y, big ? r : r * 1.4, pal.eye, big);
      if (big) {
        for (const [x0, y0, w] of [[12, 40, 6], [42, 56, 8]]) {
          pen.line(b, x0, y0, x0 + w, y0 + 1, PAL.ink);
          for (let x = x0; x <= x0 + w; x += 2) pen.px(b, x, y0 - 1, PAL.bone2);
        }
        for (let i = 0; i < 14; i++) { const x = rng.int(10, 54); const y = rng.int(30, 58); if (b.get(Math.round(x * pen.k), Math.round(y * pen.k)) === pal.main[2]) pen.px(b, x, y, pal.main[3]); }
      }
    },
  };
}

function ito(pen, rng, form) {
  const { parts, add } = builder(pen);
  if (form === 'caracol') {
    add(PALE, (l) => pen.ell(l, 34, 55, 24, 7));
    add(PAPER, (l) => pen.ell(l, 40, 34, 16, 17));
    add(PALE, (l) => pen.limb(l, 20, 52, 14, 46, 5, 4));
    add(PAPER, (l) => pen.ell(l, 13, 40, 7.5, 8.5));
    return {
      parts, head: [13, 40], body: [40, 34, 15, 15], hold: { mode: 'impaled', at: [44, 26] }, hatch: true,
      detail(b, big) {
        let prev = null;
        for (let t = 0; t < Math.PI * 7; t += 0.08) {
          const r = 15 * (1 - t / (Math.PI * 7.4));
          const p = [40 + Math.cos(t) * r, 34 + Math.sin(t) * r * 1.05];
          if (prev) pen.line(b, prev[0], prev[1], p[0], p[1], PAL.ink);
          prev = p;
        }
        pen.poly(b, [[6, 36], [20, 33], [18, 38], [8, 40]], PAL.ink);
        for (const x of [8, 11, 14, 17]) pen.line(b, x, 35, x - 2, 44, PAL.ink);
        itoFace(pen, b, 12, 42, big ? 0.8 : 1, big, 'open');
        if (big) for (let x = 56; x < 64; x += 2) pen.px(b, x, 61, PAL.bone1);
      },
    };
  }
  if (form === 'cabeza_colgante') {
    add(RUST, (l) => { pen.limb(l, 32, 46, 30, 64, 1.1, 1.1); pen.ell(l, 32, 46, 7, 2.2); }, 'edge');
    add(PAPER, (l) => pen.ell(l, 32, 24, 20, 22));
    add(HAIRR, (l) => { pen.ell(l, 32, 8, 18, 8); for (const [x, y] of [[14, 22], [50, 22], [12, 14], [52, 14]]) pen.curve(l, [[32 + (x - 32) * 0.6, 6], [x, 8], [x + (x < 32 ? -1 : 1), y]], 2, 0.6); }, 'edge');
    return {
      parts, head: [32, 24], body: [32, 24, 18, 20], hold: { mode: 'dangle', at: [30, 56] }, hatch: true,
      detail(b, big) {
        itoFace(pen, b, 32, 24, big ? 1.6 : 1.3, big, 'grin');
        if (big) { pen.line(b, 30, 28, 31, 32, PAL.stone1); pen.line(b, 18, 30, 20, 34, PAL.stone1); pen.line(b, 44, 30, 46, 33, PAL.stone1); }
      },
    };
  }
  if (form === 'cabellera') {
    add(HAIRR, (l) => {
      for (const [x, y] of [[2, 8], [0, 28], [4, 48], [12, 63], [22, 64], [44, 64], [54, 62], [62, 46], [63, 26], [60, 8], [48, 0], [16, 0]]) {
        pen.curve(l, [[31, 18], [31 + (x - 31) * 0.4 + (y > 30 ? 4 : -4), 18 + (y - 18) * 0.6], [x, y]], 2.6, 0.5);
      }
    }, 'edge');
    add(PAPER, (l) => pen.poly(l, [[26, 30], [37, 30], [41, 62], [22, 62]]));
    add(PAPER, (l) => pen.ell(l, 31, 20, 7, 9));
    return {
      parts, head: [31, 20], body: [31, 44, 8, 16], hold: { mode: 'dangle', at: [56, 30] }, hatch: true,
      detail(b, big) {
        itoFace(pen, b, 31, 19, big ? 0.9 : 0.8, big, 'open');
        for (const x of [25, 28, 35, 38]) pen.curve(b, [[31, 10], [x, 18], [x + (x < 31 ? -2 : 2), 34]], 0.6, 0.5, PAL.ink);
      },
    };
  }
  if (form === 'sonriente') {
    add(PAPER, (l) => pen.poly(l, [[26, 40], [38, 40], [41, 62], [23, 62]]));
    add(PALE, (l) => { pen.limb(l, 27, 42, 18, 60, 1.8, 1.4); pen.limb(l, 37, 42, 46, 60, 1.8, 1.4); }, 'edge');
    add(PALE, (l) => pen.limb(l, 32, 42, 35, 18, 2.4, 2));
    add(PAPER, (l) => pen.ell(l, 35, 13, 11, 9));
    return {
      parts, head: [35, 13], body: [32, 50, 8, 11], hold: { mode: 'hand', at: [18, 58] }, hatch: true,
      detail(b, big) {
        pen.curve(b, [[27, 11], [29.5, 9], [32, 11]], 0.7, 0.7, PAL.ink);
        pen.curve(b, [[38, 11], [40.5, 9], [43, 11]], 0.7, 0.7, PAL.ink);
        pen.poly(b, [[25, 15], [45, 15], [41, 21], [35, 23], [29, 21]], PAL.ink);
        if (big) {
          for (let x = 27; x < 44; x += 2) { pen.line(b, x, 15.5, x, 17.5, PAL.bone2); pen.line(b, x, 19, x, 20.5, PAL.bone2); }
          for (const [x, y] of [[17, 60], [19, 61], [45, 60], [47, 61]]) pen.line(b, x, y, x - 1, y + 3, PAL.stone2);
        }
      },
    };
  }
  if (form === 'alargado') {
    add(PALE, (l) => {
      pen.limb(l, 30, 10, 33, 50, 3.2, 2.4);
      pen.limb(l, 31, 22, 20, 30, 1.4, 1.2); pen.limb(l, 20, 30, 26, 40, 1.2, 1); pen.limb(l, 26, 40, 16, 46, 1, 0.9);
      pen.limb(l, 32, 22, 44, 26, 1.4, 1.2); pen.limb(l, 44, 26, 40, 38, 1.2, 1);
      pen.limb(l, 33, 48, 26, 56, 1.6, 1.2); pen.limb(l, 26, 56, 30, 63, 1.2, 1);
      pen.limb(l, 34, 48, 40, 63, 1.6, 1.2);
    }, 'edge');
    add(PAPER, (l) => pen.ell(l, 30, 9, 4.5, 9));
    return {
      parts, head: [30, 9], body: [32, 30, 5, 20], hold: { mode: 'hand', at: [16, 46] }, hatch: true,
      detail(b, big) {
        pen.line(b, 28, 4, 28, 9, PAL.ink); pen.line(b, 32, 4, 32, 9, PAL.ink);
        pen.ell(b, 30, 14, 1.4, 3.2, PAL.ink);
        if (big) for (let y = 20; y < 48; y += 4) pen.line(b, 31, y, 33, y + 1, PAL.stone1);
      },
    };
  }
  // Pez andante: un pez muerto sobre patas de tubo y hierro.
  add(IRONR, (l) => { for (const [x0, x1, x2] of [[24, 18, 14], [30, 30, 26], [38, 42, 40], [44, 52, 54]]) { pen.limb(l, x0, 32, x1, 46, 1.6, 1.4); pen.limb(l, x1, 46, x2, 62, 1.4, 1.1); } }, 'edge');
  add(PAPER, (l) => { pen.ell(l, 32, 24, 20, 11); pen.poly(l, [[50, 24], [63, 12], [60, 24], [63, 36]]); pen.poly(l, [[26, 14], [36, 6], [42, 14]]); });
  return {
    parts, head: [18, 24], body: [32, 24, 18, 10], hold: { mode: 'impaled', at: [36, 20] }, hatch: true,
    detail(b, big) {
      pen.ell(b, 19, 22, 4, 4, PAL.ink); pen.ell(b, 19, 22, 3.2, 3.2, PAL.bone2); pen.px(b, 19, 22, PAL.ink);
      pen.poly(b, [[12, 27], [20, 29], [13, 31]], PAL.ink);
      if (big) {
        for (let x = 14; x < 19; x += 1.5) pen.px(b, x, 28, PAL.bone2);
        for (const x of [26, 29]) pen.curve(b, [[x, 18], [x + 2, 24], [x, 30]], 0.5, 0.5, PAL.ink);
        for (let y = 18; y < 32; y += 3) for (let x = 32 + (y % 2) * 2; x < 50; x += 4) pen.curve(b, [[x - 1, y], [x, y + 1], [x + 1, y]], 0.4, 0.4, PAL.stone1);
        for (const [x, y] of [[18, 46], [30, 46], [42, 46], [52, 46]]) pen.ell(b, x, y, 1.8, 1.8, PAL.steel2);
        pen.curve(b, [[40, 30], [48, 40], [58, 38]], 0.8, 0.8, PAL.steel1);
      }
    },
  };
}

function undead(pen, rng, form, pal) {
  const { parts, add } = builder(pen);
  if (form === 'esqueleto' || form === 'liche') {
    const lich = form === 'liche';
    if (lich) {
      add(pal.main, (l) => pen.poly(l, [[21, 22], [43, 22], [50, 62], [14, 62]]));
    } else {
      add(farRamp(BONE), (l) => { pen.limb(l, 40, 26, 46, 38, 1.4, 1.2); pen.limb(l, 46, 38, 44, 50, 1.2, 1); pen.limb(l, 35, 46, 38, 62, 1.6, 1.3); }, 'edge');
      add(BONE, (l) => { pen.limb(l, 32, 24, 32, 44, 1.6, 1.6); pen.ell(l, 32, 44, 6, 3); pen.limb(l, 29, 46, 27, 62, 1.6, 1.3); }, 'edge');
      add(BONE, (l) => { for (let i = 0; i < 4; i++) { const y = 26 + i * 3.5; pen.curve(l, [[32, y], [24 - i * 0.3, y + 1], [26, y + 4]], 1, 0.7); pen.curve(l, [[32, y], [40 + i * 0.3, y + 1], [38, y + 4]], 1, 0.7); } }, 'edge');
    }
    add(BONE, (l) => { pen.ell(l, 31, 14, 7.5, 8); pen.poly(l, [[26, 18], [36, 18], [35, 24], [27, 24]]); });
    if (lich) add(GOLD, (l) => { pen.poly(l, [[23, 8], [39, 8], [39, 10], [23, 10]]); for (const x of [24, 28, 32, 36, 39]) pen.poly(l, [[x - 1.5, 8.5], [x + 1.5, 8.5], [x, 3]]); }, 'edge');
    add(lich ? pal.main : BONE, (l) => { pen.limb(l, 22, 26, 16, 38, lich ? 3 : 1.4, lich ? 2.6 : 1.2); pen.limb(l, 16, 38, 12, 47, lich ? 2.4 : 1.2, lich ? 2 : 1); }, 'edge');
    return {
      parts, head: [31, 14], body: [32, 38, 10, 14], hold: { mode: 'hand', at: [12, 48], fist: BONE },
      detail(b, big) {
        pen.ell(b, 28, 14, 2.2, 2.4, PAL.ink); pen.ell(b, 34, 14, 2.2, 2.4, PAL.ink);
        pen.px(b, 28, 14, pal.eye); pen.px(b, 34, 14, pal.eye);
        pen.poly(b, [[30, 17], [32, 17], [31, 19]], PAL.ink);
        if (big) {
          for (let x = 27; x < 36; x += 1.5) pen.line(b, x, 20, x, 22, PAL.ink);
          if (lich) {
            for (const x of [28, 34]) { pen.line(b, x, 12, x - 1, 7, pal.eye); pen.px(b, x, 6, PAL.bone2); }
            pen.line(b, 14, 56, 50, 56, PAL.ember1);
            pen.ell(b, 12, 40, 3, 3, PAL.steel3); pen.px(b, 11, 39, PAL.bone2);
            for (const [x0, x1] of [[26, 20], [32, 32], [38, 44]]) pen.line(b, x0, 30, x1, 54, pal.main[1]);
          } else {
            for (let y = 26; y < 44; y += 2) pen.px(b, 32, y, PAL.stone1);
            pen.poly(b, [[26, 44], [38, 44], [36, 52], [28, 52]], PAL.rust1);
          }
        }
      },
    };
  }
  if (form === 'necrofago') {
    const G = [PAL.stone0, PAL.stone1, PAL.stone2, PAL.bone0];
    add(farRamp(G), (l) => { pen.limb(l, 32, 40, 24, 60, 2.4, 1.6); pen.limb(l, 40, 46, 42, 61, 2.6, 2); }, 'edge');
    add(G, (l) => pen.ell(l, 36, 38, 14, 11));
    add(G, (l) => { pen.ell(l, 47, 46, 6, 7); pen.limb(l, 48, 50, 52, 61, 2.6, 2); }, 'edge');
    add(G, (l) => { pen.limb(l, 28, 36, 20, 36, 4, 3.5); pen.ell(l, 17, 35, 7, 6.5); pen.poly(l, [[14, 30], [18, 22], [20, 30]]); pen.poly(l, [[20, 30], [26, 24], [24, 32]]); });
    add(G, (l) => pen.limb(l, 26, 40, 14, 60, 2.6, 1.8), 'edge');
    return {
      parts, head: [17, 35], body: [36, 38, 14, 11], hold: { mode: 'hand', at: [14, 58], fist: G },
      detail(b, big) {
        pen.poly(b, [[10, 37], [20, 38], [12, 44]], PAL.ink);
        if (big) for (const [x, y] of [[12, 38], [15, 38], [18, 38.5], [13, 42]]) pen.line(b, x, y, x, y + 1.5, PAL.bone2);
        pen.px(b, 14, 33, pal.eye); pen.px(b, 19, 32, pal.eye);
        if (big) {
          for (let i = 0; i < 5; i++) pen.curve(b, [[30 + i * 4, 32], [32 + i * 4, 38], [30 + i * 4, 44]], 0.5, 0.5, PAL.stone0);
          for (let x = 26; x < 48; x += 3) pen.px(b, x, 28 + Math.abs(x - 37) * 0.08, PAL.bone1);
          for (const x of [12, 14, 16]) pen.line(b, x, 60, x - 2, 63, PAL.bone1);
        }
      },
    };
  }
  if (form === 'vampiro') {
    const CAPE = [PAL.ink, PAL.night, PAL.shade, PAL.dusk];
    add(CAPE, (l) => pen.poly(l, [[16, 20], [48, 20], [58, 62], [6, 62]]));
    add([PAL.blood0, PAL.blood0, PAL.blood1, PAL.blood2], (l) => pen.poly(l, [[20, 24], [44, 24], [50, 60], [14, 60]]));
    add(CAPE, (l) => { pen.poly(l, [[24, 22], [40, 22], [40, 52], [24, 52]]); pen.limb(l, 28, 52, 28, 62, 2.4, 2.2); pen.limb(l, 36, 52, 36, 62, 2.4, 2.2); });
    add(CAPE, (l) => { pen.poly(l, [[16, 4], [26, 20], [22, 24]]); pen.poly(l, [[48, 4], [38, 20], [42, 24]]); });
    add(PALE, (l) => pen.ell(l, 32, 14, 6.5, 8));
    add(CAPE, (l) => pen.limb(l, 25, 26, 16, 44, 2.6, 2.2), 'edge');
    return {
      parts, head: [32, 14], body: [32, 38, 12, 16], hold: { mode: 'hand', at: [16, 46], fist: PALE },
      detail(b, big) {
        pen.poly(b, [[25, 10], [32, 13], [39, 10], [38, 5], [32, 4], [26, 5]], PAL.ink);
        pen.px(b, 29, 14, PAL.blood3); pen.px(b, 35, 14, PAL.blood3);
        pen.line(b, 30, 19, 34, 19, PAL.blood1);
        pen.px(b, 30, 20, PAL.bone2); pen.px(b, 34, 20, PAL.bone2);
        if (big) {
          pen.poly(b, [[29, 22], [35, 22], [32, 30]], PAL.bone1);
          pen.poly(b, [[31, 23], [33, 23], [32, 28]], PAL.blood2);
          for (const x of [14, 16, 18]) pen.line(b, x, 47, x - 1, 51, PAL.bone1);
        }
      },
    };
  }
  // Momia: vendas, tiras sueltas y un ojo que arde entre las vueltas.
  const WRAP = [PAL.stone2, PAL.bone0, PAL.bone1, PAL.bone2];
  add(farRamp(WRAP), (l) => { pen.limb(l, 40, 26, 28, 30, 3, 2.6); pen.limb(l, 36, 48, 37, 62, 3, 2.6); }, 'edge');
  add(WRAP, (l) => { pen.ell(l, 32, 34, 10, 14); pen.limb(l, 28, 48, 27, 62, 3, 2.6); });
  add(WRAP, (l) => pen.ell(l, 31, 14, 7, 8));
  add(WRAP, (l) => pen.limb(l, 23, 26, 8, 31, 3, 2.6), 'edge');
  return {
    parts, head: [31, 14], body: [32, 34, 10, 14], hold: { mode: 'hand', at: [8, 31], fist: WRAP },
    detail(b, big) {
      pen.line(b, 25, 14, 37, 13, PAL.ink);
      pen.px(b, 28, 14, PAL.ember2);
      if (big) {
        // Vueltas de venda solo sobre el cuerpo.
        for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if ((y + Math.floor(x / 4)) % 3 === 0 && WRAP.includes(b.get(x, y))) b.set(x, y, PAL.stone1);
        pen.curve(b, [[10, 32], [12, 40], [9, 46]], 0.7, 0.5, PAL.bone1);
        pen.curve(b, [[40, 46], [44, 54], [42, 60]], 0.7, 0.5, PAL.bone1);
        pen.px(b, 27, 14, PAL.ember1);
      }
    },
  };
}

// Licántropo erguido y gárgola de piedra (variantes de bestia).
function werewolf(pen, rng, pal) {
  const { parts, add } = builder(pen);
  add(pal.far, (l) => { pen.limb(l, 42, 44, 47, 54, 3.4, 2.6); pen.limb(l, 47, 54, 44, 62, 2.6, 2); pen.limb(l, 40, 26, 50, 40, 3, 2.6); pen.limb(l, 50, 40, 52, 50, 2.6, 2); }, 'edge');
  add(pal.main, (l) => { pen.ell(l, 34, 32, 12, 13); pen.ell(l, 32, 42, 9, 8); });
  add(pal.main, (l) => { pen.ell(l, 29, 48, 6, 7); pen.limb(l, 28, 52, 24, 57, 3, 2.4); pen.limb(l, 24, 57, 28, 62, 2.4, 2); }, 'edge');
  add(pal.main, (l) => { pen.ell(l, 20, 18, 8, 7.5); pen.poly(l, [[16, 15], [5, 21], [6, 25], [18, 24]]); pen.poly(l, [[16, 12], [17, 3], [22, 11]]); pen.poly(l, [[22, 12], [27, 5], [27, 14]]); });
  add(pal.main, (l) => pen.poly(l, [[16, 24], [7, 27], [9, 29], [20, 27]]));
  add(pal.main, (l) => { pen.limb(l, 26, 28, 14, 40, 3.2, 2.6); pen.limb(l, 14, 40, 10, 50, 2.6, 2); }, 'edge');
  return {
    parts, head: [20, 18], body: [34, 34, 12, 13], hold: { mode: 'hand', at: [10, 50] },
    detail(b, big) {
      pen.poly(b, [[8, 25], [17, 25], [9, 28]], PAL.ink);
      if (big) for (let x = 8; x < 17; x += 2) pen.px(b, x, 25, PAL.bone2);
      pen.px(b, 17, 16, pal.eye); pen.px(b, 6, 21, PAL.ink);
      for (let i = 0; i < 8; i++) pen.poly(b, [[24 + i * 2.5, 22 + (i % 3)], [27 + i * 2.5, 22], [26 + i * 2.5, 16 + (i % 2) * 2]], pal.main[0]);
      if (big) {
        for (let i = 0; i < 24; i++) { const x = rng.int(24, 44); const y = rng.int(24, 46); pen.line(b, x, y, x + 1, y + 2, pal.main[1]); }
        for (const dx of [-2, 0, 2]) pen.line(b, 10 + dx, 50, 9 + dx, 54, PAL.bone1);
      }
    },
  };
}

function gargoyle(pen, rng) {
  const { parts, add } = builder(pen);
  add(farRamp(STONE), (l) => pen.poly(l, [[30, 26], [20, 2], [12, 10], [8, 24], [18, 22], [24, 32]]));
  add(STONE, (l) => pen.poly(l, [[38, 26], [56, 2], [63, 14], [60, 28], [52, 24], [46, 34]]));
  add(STONE, (l) => { pen.ell(l, 35, 42, 13, 12); pen.ell(l, 26, 54, 7, 6); pen.ell(l, 45, 54, 7, 6); });
  add(STONE, (l) => { pen.limb(l, 26, 40, 18, 60, 3, 2.4); pen.limb(l, 32, 44, 28, 60, 2.6, 2.2); }, 'edge');
  add(STONE, (l) => { pen.ell(l, 22, 28, 8, 7.5); pen.poly(l, [[16, 30], [8, 34], [18, 36]]); });
  add([PAL.ink, PAL.night, PAL.stone0, PAL.stone2], (l) => { pen.curve(l, [[18, 22], [14, 14], [18, 8]], 1.8, 0.5); pen.curve(l, [[25, 22], [26, 13], [31, 9]], 1.8, 0.5); }, 'edge');
  return {
    parts, head: [22, 28], body: [35, 42, 13, 12], hold: { mode: 'impaled', at: [40, 38] },
    detail(b, big) {
      pen.px(b, 19, 27, PAL.ember2); pen.px(b, 24, 26, PAL.ember2);
      pen.line(b, 9, 34, 17, 34, PAL.ink);
      if (big) {
        for (let i = 0; i < 8; i++) { const x = rng.int(20, 50); const y = rng.int(30, 56); pen.line(b, x, y, x + rng.int(-2, 2), y + rng.int(2, 4), PAL.stone0); }
        for (let i = 0; i < 10; i++) { const x = rng.int(20, 52); const y = rng.int(36, 60); if (b.get(Math.round(x * pen.k), Math.round(y * pen.k))) pen.px(b, x, y, PAL.moss1); }
        for (const [x0, y0, x1, y1] of [[52, 6, 44, 30], [58, 10, 50, 28], [14, 10, 24, 28]]) pen.line(b, x0, y0, x1, y1, PAL.stone0);
        for (const x of [18, 20, 22, 28, 30]) pen.line(b, x, 60, x - 1, 63, PAL.stone3);
      }
    },
  };
}

// Tinta al estilo manga de horror: rayado cruzado en las sombras y contorno grueso.
function hatch(b) {
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const c = b.get(x, y);
      if (c === PAL.stone1 && ((x + y) % 3 === 0 || (x - y + 300) % 3 === 0)) b.set(x, y, PAL.ink);
      else if ((c === PAL.stone2 || c === PAL.bone0) && (x + y) % 4 === 0) b.set(x, y, PAL.stone1);
    }
  }
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

// El botín se ve en la criatura: el arma empuñada, colgando de la garra o clavada en el lomo;
// la armadura como placa atada; la reliquia como gema incrustada en la frente.
function lootWeaponBig(shape, loot, size) {
  const icon = drawEquipIcon('arma', loot.look, loot.mat);
  const buf = new PixelBuffer(size, size);
  const [x, y] = shape.hold.at;
  if (shape.hold.mode === 'hand') buf.paste(icon, Math.round(x - 3.5), Math.round(y - 20.5));
  else if (shape.hold.mode === 'dangle') buf.paste(icon.flipV(), Math.round(x - 3.5), Math.round(y - 3.5));
  else buf.paste(icon.flipH().flipV(), Math.round(x - 2), Math.round(y - 20));
  return buf;
}

function lootWeaponSmall(pen, b, shape, loot) {
  const M = MATERIALS[loot.mat] || MATERIALS.comun;
  const [x, y] = shape.hold.at;
  const dir = shape.hold.mode === 'dangle' ? [1, 1] : [1, -1];
  const len = shape.hold.mode === 'impaled' ? 16 : 22;
  const sx = shape.hold.mode === 'impaled' ? x + 6 : x;
  const sy = shape.hold.mode === 'impaled' ? y - 6 : y;
  pen.line(b, sx, sy, sx + dir[0] * len, sy + dir[1] * len, M.blade[2]);
  pen.px(b, sx + dir[0] * len, sy + dir[1] * len, M.blade[3]);
  pen.line(b, sx + dir[0] * 3 - 3, sy + dir[1] * 3 - 3 * dir[1] * -1, sx + dir[0] * 3 + 3, sy + dir[1] * 3 + 3 * dir[1] * -1, M.metal[2]);
  if (M.glow) pen.px(b, sx + dir[0] * len * 0.6, sy + dir[1] * len * 0.6, M.glow);
}

function lootWear(pen, b, shape, loot, big) {
  const M = MATERIALS[loot.mat] || MATERIALS.comun;
  const [hx, hy] = shape.head;
  const [bx, by, brx, bry] = shape.body;
  if (loot.slot === 'reliquia') {
    const gem = { comun: PAL.stone3, raro: PAL.steel3, legendario: PAL.blood3, divino: PAL.ember2, infernal: PAL.ember2 }[loot.mat] || PAL.steel3;
    pen.ell(b, hx, hy - 3, big ? 2.2 : 1, big ? 2.2 : 1, PAL.ink);
    pen.ell(b, hx, hy - 3, big ? 1.4 : 0.7, big ? 1.4 : 0.7, gem);
    if (big) pen.px(b, hx - 0.6, hy - 3.6, PAL.bone2);
    return;
  }
  // Placa de armadura atada al lomo (con correas) o hombrera en los humanoides.
  const onShoulder = shape.hold.mode === 'hand';
  const px0 = onShoulder ? 23 : bx - brx * 0.1;
  const py0 = onShoulder ? 27 : by - bry * 0.8;
  if (big && !onShoulder) for (const dx of [-5, 5]) pen.line(b, px0 + dx, py0 + 2, px0 + dx - 1, py0 + bry * 1.1, PAL.ink);
  const l = pen.L();
  pen.poly(l, [[px0 - 8, py0 + 3], [px0 - 6, py0 - 3], [px0, py0 - 5], [px0 + 6, py0 - 3], [px0 + 8, py0 + 3], [px0, py0 + 4]]);
  b.paste(shadeLayer(l, M.metal, { shadowDepth: big ? 2 : 1 }), 0, 0);
  if (big) {
    pen.line(b, px0 - 6, py0 + 1, px0 + 6, py0 + 1, M.metal[0]);
    for (const dx of [-5, 5]) pen.px(b, px0 + dx, py0 - 1, M.metal[3]);
    if (loot.mat !== 'comun') pen.line(b, px0 - 5, py0 - 3, px0 + 5, py0 - 3, M.trim[1]);
    if (loot.mat === 'legendario') pen.px(b, px0, py0 - 1, PAL.blood3);
    if (loot.mat === 'divino') { pen.line(b, px0, py0 - 3, px0, py0 + 2, PAL.ember2); pen.line(b, px0 - 2, py0 - 1, px0 + 2, py0 - 1, PAL.ember2); }
    if (loot.mat === 'infernal') for (const dx of [-4, 0, 4]) pen.poly(b, [[px0 + dx - 1.5, py0 - 3], [px0 + dx + 1.5, py0 - 3], [px0 + dx, py0 - 9]], PAL.night);
  }
}

export function generateMonster({ seed, size = 64, archetype, ramp, rank = 'comun', form, loot = null }) {
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
  const BUILD = { beast, humanoid, wraith, crawler, eldritch, ito, undead };
  const shape = (BUILD[arch] || beast)(pen, shapeRng, f, pal);
  const weapon = loot?.slot === 'arma' && loot.look ? loot : null;
  if (weapon && big && shape.hold.mode === 'impaled') shape.parts.unshift({ raw: lootWeaponBig(shape, weapon, size) });
  const b = compose(size, shape.parts, big);
  shape.detail(b, big);
  if (shape.hatch && big) hatch(b);
  if (weapon && big && shape.hold.mode !== 'impaled') {
    b.paste(lootWeaponBig(shape, weapon, size), 0, 0);
    if (shape.hold.mode === 'hand') {
      const [hx, hy] = shape.hold.at;
      const fist = pen.L();
      pen.ell(fist, hx, hy, 3.2, 3);
      b.paste(shadeLayer(fist, shape.hold.fist || pal.far, { shadowDepth: 1 }), 0, 0);
    }
  }
  if (weapon && !big) lootWeaponSmall(pen, b, shape, weapon);
  if (loot && loot.slot !== 'arma') lootWear(pen, b, shape, loot, big);
  rankDecor(pen, b, rng.fork('rank'), rank, shape, pal, big);
  if (shape.fade && big) fadeBottom(b, 0.78);
  b.outline(PAL.ink);
  // Contorno doble para la tinta de pesadilla.
  if (shape.hatch && big) b.outline(PAL.ink);
  if (RANK_GLOW[rank] && rank !== 'raro') aura(b, RANK_GLOW[rank]);
  else if (rank === 'raro' && !big) aura(b, RANK_GLOW.raro);
  return { buffer: b, archetype: arch, eyeColor: eye };
}
