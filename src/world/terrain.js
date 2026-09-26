// Herramientas de terreno: ruido fractal, caminos A* y máscaras de autotile.
export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Ruido de valor suavizado; fbm suma octavas para relieve natural.
export function valueNoise(rng, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const g = Float32Array.from({ length: gw * gh }, () => rng.next());
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = s(gx - x0);
    const ty = s(gy - y0);
    const v = (i, j) => g[(y0 + j) * gw + (x0 + i)];
    const a = v(0, 0) + (v(1, 0) - v(0, 0)) * tx;
    const b = v(0, 1) + (v(1, 1) - v(0, 1)) * tx;
    return a + (b - a) * ty;
  };
}

export function fbm(rng, w, h, baseCell, octaves = 3) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(valueNoise(rng, w, h, Math.max(2, baseCell / 2 ** o)));
  const norm = layers.reduce((s, _l, o) => s + 0.5 ** o, 0);
  return (x, y) => layers.reduce((s, l, o) => s + l(x, y) * 0.5 ** o, 0) / norm;
}

// Montículo binario simple para A*.
class Heap {
  constructor() { this.a = []; }
  push(item, pri) {
    const a = this.a;
    a.push([pri, item]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

// A* en rejilla 4-conexa. cost(x, y) → Infinity si intransitable. Devuelve lista de índices.
export function astar(w, h, from, to, cost) {
  const idx = (x, y) => y * w + x;
  const start = idx(from.x, from.y);
  const goal = idx(to.x, to.y);
  const g = new Float32Array(w * h).fill(Infinity);
  const prev = new Int32Array(w * h).fill(-1);
  const heap = new Heap();
  g[start] = 0;
  heap.push(start, 0);
  const hfn = (i) => Math.abs((i % w) - to.x) + Math.abs(Math.floor(i / w) - to.y);
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy] of N4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = cost(nx, ny);
      if (!Number.isFinite(c)) continue;
      const ni = idx(nx, ny);
      const ng = g[cur] + c;
      if (ng < g[ni]) {
        g[ni] = ng;
        prev[ni] = cur;
        heap.push(ni, ng + hfn(ni));
      }
    }
  }
  if (!Number.isFinite(g[goal])) return null;
  const path = [];
  for (let k = goal; k >= 0; k = prev[k]) path.unshift(k);
  return path;
}

// Máscara de 4 bits de vecinos iguales (N=1, E=2, S=4, O=8) para elegir la variante de autotile.
export function maskAt(test, x, y) {
  return (test(x, y - 1) ? 1 : 0) | (test(x + 1, y) ? 2 : 0) | (test(x, y + 1) ? 4 : 0) | (test(x - 1, y) ? 8 : 0);
}

// Árbol de expansión mínima (Prim) sobre puntos: base de la red de caminos.
export function mst(points) {
  if (points.length < 2) return [];
  const inTree = new Set([0]);
  const edges = [];
  const d = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  while (inTree.size < points.length) {
    let best = null;
    for (const i of inTree) {
      for (let j = 0; j < points.length; j++) {
        if (inTree.has(j)) continue;
        const dist = d(points[i], points[j]);
        if (!best || dist < best[2]) best = [i, j, dist];
      }
    }
    edges.push([best[0], best[1]]);
    inTree.add(best[1]);
  }
  return edges;
}
