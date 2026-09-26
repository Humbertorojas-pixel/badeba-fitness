import { PAL } from '../palette.js';

// Lienzo de índices de paleta (strings de PAL o null). Puro: funciona en Node para pruebas.
export class PixelBuffer {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x, y) {
    return this.inside(x, y) ? this.px[y * this.w + x] : null;
  }

  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (this.inside(x, y)) this.px[y * this.w + x] = c;
    return this;
  }

  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    return this;
  }

  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
    return this;
  }

  line(x0, y0, x1, y1, c, thick = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      for (let t = 0; t < thick; t++) this.set(x + t, y, c);
    }
    return this;
  }

  poly(points, c) {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        const yc = y + 0.5;
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
          xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, c);
      }
    }
    return this;
  }

  // Pinta solo sobre píxeles ya ocupados (para sombreado/detalles dentro de una forma).
  mask(fn) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const cur = this.get(x, y);
        if (cur) {
          const next = fn(x, y, cur);
          if (next !== undefined) this.px[y * this.w + x] = next;
        }
      }
    }
    return this;
  }

  // Contorno exterior de 1px como en los sprites de GBA.
  outline(c = PAL.ink, diagonal = false) {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        if (diagonal) n.push([1, 1], [-1, 1], [1, -1], [-1, -1]);
        if (n.some(([dx, dy]) => { const v = this.get(x + dx, y + dy); return v && v !== c; })) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }

  paste(other, dx, dy) {
    for (let y = 0; y < other.h; y++) {
      for (let x = 0; x < other.w; x++) {
        const v = other.get(x, y);
        if (v) this.set(x + dx, y + dy, v);
      }
    }
    return this;
  }

  flipH() {
    const out = new PixelBuffer(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.px[y * this.w + x] = this.get(this.w - 1 - x, y);
    return out;
  }

  flipV() {
    const out = new PixelBuffer(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.px[y * this.w + x] = this.get(x, this.h - 1 - y);
    return out;
  }

  clone() {
    const out = new PixelBuffer(this.w, this.h);
    out.px = this.px.slice();
    return out;
  }

  shift(dx, dy) {
    const out = new PixelBuffer(this.w, this.h);
    out.paste(this, dx, dy);
    return out;
  }

  count() {
    return this.px.reduce((n, v) => n + (v ? 1 : 0), 0);
  }

  drawTo(ctx, ox = 0, oy = 0) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const v = this.px[y * this.w + x];
        if (v) {
          ctx.fillStyle = v;
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      }
    }
  }
}

// Sombreado por bandas de una silueta plana: luz arriba-izquierda, sombra abajo-derecha.
// ramp = [más oscuro, sombra, medio, luz].
export function shadeLayer(layer, ramp, { shadowDepth = 3 } = {}) {
  const f = (x, y) => layer.get(x, y) !== null;
  const edge = (x, y, dx, dy, k) => {
    for (let i = 1; i <= k; i++) if (!f(x + dx * i, y + dy * i)) return true;
    return false;
  };
  const out = new PixelBuffer(layer.w, layer.h);
  for (let y = 0; y < layer.h; y++) {
    for (let x = 0; x < layer.w; x++) {
      if (!f(x, y)) continue;
      let c = ramp[2];
      if (edge(x, y, 0, -1, 1) || edge(x, y, -1, 0, 1)) c = ramp[3];
      else if (edge(x, y, 0, 1, 1) || edge(x, y, 1, 0, 1)) c = ramp[0];
      else if (edge(x, y, 0, 1, shadowDepth) || edge(x, y, 1, 0, shadowDepth)) c = ramp[1];
      out.set(x, y, c);
    }
  }
  return out;
}

// Registra una tira de frames horizontales como textura con frames numerados.
export function addStrip(scene, key, buffers) {
  const fw = buffers[0].w;
  const fh = buffers[0].h;
  const canvas = document.createElement('canvas');
  canvas.width = fw * buffers.length;
  canvas.height = fh;
  const ctx = canvas.getContext('2d');
  buffers.forEach((b, i) => b.drawTo(ctx, i * fw, 0));
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas);
  buffers.forEach((_, i) => tex.add(i, 0, i * fw, 0, fw, fh));
  return tex;
}

// Registra frames en una rejilla de `cols` columnas (tilesets grandes: evita texturas muy anchas).
export function addGrid(scene, key, buffers, cols = 16) {
  const fw = buffers[0].w;
  const fh = buffers[0].h;
  const rows = Math.ceil(buffers.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = fw * cols;
  canvas.height = fh * rows;
  const ctx = canvas.getContext('2d');
  buffers.forEach((b, i) => b.drawTo(ctx, (i % cols) * fw, Math.floor(i / cols) * fh));
  if (scene.textures.exists(key)) scene.textures.remove(key);
  return scene.textures.addCanvas(key, canvas);
}

// Matriz de Bayer 4x4 para tramado ordenado (dithering estilo GBA).
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));
