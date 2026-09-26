import { PixelBuffer } from './pixelBuffer.js';
import { PAL } from '../palette.js';
import { createRng } from '../core/rng.js';

export const RAMPS = {
  flesh: [PAL.blood0, PAL.blood1, PAL.blood2, PAL.blood3],
  rot: [PAL.moss0, PAL.moss1, PAL.moss2, PAL.bone0],
  bone: [PAL.stone1, PAL.bone0, PAL.bone1, PAL.bone2],
  void: [PAL.night, PAL.dusk, PAL.stone0, PAL.stone2],
  rust: [PAL.rust0, PAL.rust1, PAL.rust2, PAL.ember1],
  steel: [PAL.steel0, PAL.steel1, PAL.steel2, PAL.steel3],
};

export const ARCHETYPES = ['beast', 'humanoid', 'wraith', 'crawler'];

// Cada forma: [tipo, u, v, a, b] en coordenadas normalizadas (u: -1..1 centro 0, v: 0..1).
function shapesFor(arch, rng) {
  const j = (x, amt = 0.06) => x + (rng.next() * 2 - 1) * amt;
  const s = (x) => x * (0.85 + rng.next() * 0.3);
  switch (arch) {
    case 'beast':
      return {
        head: [j(0, 0), j(0.34), s(0.34), s(0.22)],
        shapes: [
          ['ell', 0, j(0.6), s(0.78), s(0.26)],
          ['ell', 0, j(0.34), s(0.34), s(0.22)],
          ['bar', j(0.55), 0.68, 1.0, s(0.12)],
          ['bar', j(0.22), 0.72, 1.0, s(0.1)],
          ['tri', j(0.22), j(0.2), j(0.4), j(0.02)],
        ],
      };
    case 'humanoid':
      return {
        head: [0, j(0.17), s(0.18), s(0.16)],
        shapes: [
          ['ell', 0, j(0.17), s(0.18), s(0.16)],
          ['ell', 0, j(0.45), s(0.36), s(0.24)],
          ['limb', j(0.36), 0.32, j(0.72), j(0.82), s(0.1)],
          ['bar', j(0.16), 0.66, 1.0, s(0.12)],
          ['tri', j(0.14), j(0.08), j(0.3), j(0.0)],
        ],
      };
    case 'wraith':
      return {
        head: [0, j(0.22), s(0.24), s(0.2)],
        shapes: [
          ['ell', 0, j(0.22), s(0.24), s(0.2)],
          ['cone', s(0.5), 0.34, 0.98],
          ['limb', j(0.42), 0.38, j(0.92), j(0.66), s(0.07)],
          ['limb', j(0.3), 0.5, j(0.7), j(0.9), s(0.06)],
        ],
      };
    case 'crawler':
    default:
      return {
        head: [0, j(0.5), s(0.2), s(0.16)],
        shapes: [
          ['ell', 0, j(0.62), s(0.84), s(0.2)],
          ['ell', 0, j(0.5), s(0.22), s(0.18)],
          ['limb', 0.3, 0.62, j(0.55), 0.96, s(0.06)],
          ['limb', 0.5, 0.62, j(0.8), 0.94, s(0.06)],
          ['limb', 0.7, 0.62, j(0.98), 0.9, s(0.06)],
          ['tri', j(0.1), j(0.44), j(0.34), j(0.3)],
        ],
      };
  }
}

function inShape(sh, u, v) {
  const [t] = sh;
  if (t === 'ell') {
    const [, cu, cv, a, b] = sh;
    const du = (u - cu) / a;
    const dv = (v - cv) / b;
    return du * du + dv * dv <= 1;
  }
  if (t === 'bar') {
    const [, cu, top, bottom, w] = sh;
    return Math.abs(u - cu) <= w / 2 && v >= top && v <= bottom;
  }
  if (t === 'limb') {
    const [, u0, v0, u1, v1, w] = sh;
    const dx = u1 - u0;
    const dy = v1 - v0;
    const len2 = dx * dx + dy * dy;
    const t2 = Math.max(0, Math.min(1, ((u - u0) * dx + (v - v0) * dy) / len2));
    const px = u0 + t2 * dx - u;
    const py = v0 + t2 * dy - v;
    return Math.sqrt(px * px + py * py) <= w * (1 - t2 * 0.5);
  }
  if (t === 'cone') {
    const [, halfTop, top, bottom] = sh;
    if (v < top || v > bottom) return false;
    const k = (v - top) / (bottom - top);
    return Math.abs(u) <= halfTop * (1 - k) + 0.02;
  }
  if (t === 'tri') {
    const [, bu, bv, tu, tv] = sh;
    // Cuerno: triángulo de base (bu±0.08, bv) a punta (tu, tv).
    const pts = [[bu - 0.08, bv], [bu + 0.08, bv], [tu, tv]];
    let sign = 0;
    for (let i = 0; i < 3; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % 3];
      const cross = (bx - ax) * (v - ay) - (by - ay) * (u - ax);
      if (cross !== 0) {
        if (sign === 0) sign = Math.sign(cross);
        else if (Math.sign(cross) !== sign) return false;
      }
    }
    return true;
  }
  return false;
}

function largestComponent(grid, n) {
  const seen = new Uint8Array(n * n);
  let best = [];
  for (let i = 0; i < n * n; i++) {
    if (!grid[i] || seen[i]) continue;
    const comp = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop();
      comp.push(k);
      const x = k % n;
      const y = Math.floor(k / n);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const nk = ny * n + nx;
        if (grid[nk] && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  const out = new Uint8Array(n * n);
  for (const k of best) out[k] = 1;
  return out;
}

export function generateMonster({ seed, size = 56, archetype, ramp }) {
  const rng = createRng(seed);
  const arch = archetype || rng.pick(ARCHETYPES);
  const colors = RAMPS[ramp || rng.pick(Object.keys(RAMPS))];
  const { head, shapes } = shapesFor(arch, rng);
  const n = size;
  const pad = Math.max(1, Math.round(n * 0.05));
  const inner = n - pad * 2;
  const half = Math.ceil(n / 2);

  let grid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < half; x++) {
      const u = Math.abs(((x + 0.5 - n / 2) / inner) * 2);
      const v = (y + 0.5 - pad) / inner;
      if (shapes.some((sh) => inShape(sh, u, v) || inShape(sh, -u, v))) grid[y * n + x] = 1;
    }
  }

  const iterations = n >= 32 ? 3 : 1;
  for (let it = 0; it < iterations; it++) {
    const next = grid.slice();
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < half; x++) {
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) c += grid[(y + dy) * n + x + dx];
        const k = y * n + x;
        if (!grid[k] && c >= 3 && rng.chance(0.3)) next[k] = 1;
        else if (grid[k] && c <= 4 && rng.chance(0.28)) next[k] = 0;
      }
    }
    grid = next;
  }
  // Pasada de mayoría: elimina dientes de sierra de 1px sin perder la forma orgánica.
  if (n >= 32) {
    const next = grid.slice();
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < half; x++) {
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += grid[(y + dy) * n + x + dx];
        next[y * n + x] = c >= 5 ? 1 : 0;
      }
    }
    grid = next;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < half; x++) grid[y * n + (n - 1 - x)] = grid[y * n + x];
  grid = largestComponent(grid, n);

  // Púas a lo largo del contorno superior (mitad izquierda, luego espejo).
  if (n >= 32) {
    const spikes = rng.int(3, 7);
    const spikeLen = Math.max(2, Math.round(n * 0.06));
    for (let s = 0; s < spikes; s++) {
      const x = rng.int(Math.floor(n * 0.12), half - 2);
      let top = -1;
      for (let y = 0; y < n; y++) if (grid[y * n + x]) { top = y; break; }
      if (top < 2) continue;
      const lean = rng.int(-1, 0);
      for (let k = 1; k <= spikeLen; k++) {
        const sx = x + Math.round((lean * k) / 2);
        if (top - k >= 0) grid[(top - k) * n + sx] = 1;
      }
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < half; x++) grid[y * n + (n - 1 - x)] = grid[y * n + x];
  }

  const filled = (x, y) => x >= 0 && y >= 0 && x < n && y < n && grid[y * n + x] === 1;
  const depth = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!filled(x, y)) continue;
      let d = 1;
      while (d < 6 && filled(x - d, y) && filled(x + d, y) && filled(x, y - d) && filled(x, y + d)) d++;
      depth[y * n + x] = d;
    }
  }

  // Sombreado por bandas: luz desde arriba-izquierda, sombra abajo-derecha, núcleo en tono medio.
  const big = n >= 32;
  const edgeWithin = (x, y, dx, dy, k) => {
    for (let i = 1; i <= k; i++) if (!filled(x + dx * i, y + dy * i)) return true;
    return false;
  };
  const b = new PixelBuffer(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!filled(x, y)) continue;
      let idx = 2;
      if (edgeWithin(x, y, 0, -1, 1) || edgeWithin(x, y, -1, -1, 1)) idx = 3;
      else if (edgeWithin(x, y, 0, 1, 1) || edgeWithin(x, y, 1, 1, 1) || edgeWithin(x, y, 1, 0, 1)) idx = 0;
      else if (big && (edgeWithin(x, y, 0, 1, 3) || edgeWithin(x, y, 1, 1, 2) || edgeWithin(x, y, 1, 0, 3))) idx = 1;
      else if (big && depth[y * n + x] >= 5 && y > n * 0.55) idx = 1;
      b.set(x, y, colors[idx]);
    }
  }

  if (n >= 32) {
    const lesions = rng.int(2, 5);
    for (let i = 0; i < lesions; i++) {
      const lx = rng.int(Math.floor(n * 0.25), half - 2);
      const ly = rng.int(Math.floor(n * 0.3), Math.floor(n * 0.85));
      if (depth[ly * n + lx] >= 3) {
        const r = rng.int(1, 2);
        for (const mx of [lx, n - 1 - lx]) b.ellipse(mx + 0.5, ly + 0.5, r, r * 0.8, colors[0]);
      }
    }
    if (arch === 'humanoid') {
      const top = Math.floor(pad + inner * 0.36);
      for (let y = top; y < top + inner * 0.18; y += 3) {
        for (let x = Math.floor(n / 2 - inner * 0.14); x < n / 2 + inner * 0.14; x++) {
          if (filled(x, y) && depth[y * n + x] >= 2 && Math.abs(x + 0.5 - n / 2) > 1) b.set(x, y, colors[0]);
        }
      }
    }
  }

  // Ojos: brillo en la zona de la cabeza, pares simétricos.
  const [, hv, ha, hb] = head;
  const eyeY = Math.round(pad + (hv + hb * 0.05) * inner);
  const eyeCount = rng.pick([2, 2, 2, 4, 1]);
  const spread = Math.max(1, Math.round(ha * inner * 0.45));
  const eyeColor = rng.pick([PAL.ember2, PAL.blood3, PAL.bone2, PAL.steel3]);
  const eyeSize = n >= 32 ? 2 : 1;
  const placeEye = (ex, ey) => {
    if (!filled(ex, ey)) return;
    if (eyeSize === 2) {
      b.rect(ex - 1, ey - 1, 3, 3, PAL.ink);
      b.rect(ex, ey, 1, 1, eyeColor);
      b.set(ex - 1, ey, eyeColor);
    } else {
      b.set(ex, ey, eyeColor);
    }
  };
  const cx = Math.floor(n / 2);
  if (eyeCount === 1) {
    placeEye(cx, eyeY);
  } else {
    placeEye(cx - spread, eyeY);
    placeEye(cx + spread - 1 + (eyeSize === 2 ? 1 : 0), eyeY);
    if (eyeCount === 4 && n >= 32) {
      placeEye(cx - Math.round(spread * 0.5), eyeY - 3);
      placeEye(cx + Math.round(spread * 0.5), eyeY - 3);
    }
  }
  // Fauces: hueco oscuro con dientes arriba y abajo.
  if (n >= 32 && rng.chance(0.8)) {
    const my = eyeY + Math.max(4, Math.round(hb * inner * 0.6));
    const mw = Math.max(3, Math.round(ha * inner * rng.int(45, 70) / 100));
    const mh = rng.int(2, 4);
    for (let y = my; y < my + mh; y++) {
      const inset = Math.floor(((y - my) * mw) / (mh * 2));
      for (let x = cx - mw + inset; x < cx + mw - inset; x++) if (filled(x, y)) b.set(x, y, PAL.ink);
    }
    for (let x = cx - mw + 1; x < cx + mw - 1; x += 2) {
      if (filled(x, my)) b.set(x, my, PAL.bone2);
      if (filled(x + 1, my + mh - 1) && mh > 2) b.set(x + 1, my + mh - 1, PAL.bone1);
    }
  }
  // Garras: solo en las puntas más bajas de cada apoyo.
  if (n >= 32) {
    let lowest = 0;
    for (let i = 0; i < n * n; i++) if (grid[i]) lowest = Math.max(lowest, Math.floor(i / n));
    for (let x = 1; x < n - 1; x++) {
      const y = lowest;
      if (filled(x, y) && (!filled(x - 1, y) || !filled(x + 1, y))) b.set(x, y, PAL.bone1);
    }
  }

  b.outline(PAL.ink);
  return { buffer: b, archetype: arch, eyeColor };
}
