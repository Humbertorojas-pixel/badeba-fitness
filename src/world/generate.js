import { createRng, hashSeed } from '../core/rng.js';
import { BIOMES, pickBiome } from './biomes.js';
import { PROPS, footprint } from './props.js';
import { fbm, valueNoise, astar, mst, N4 } from './terrain.js';
import { LSYSTEMS, expand, turtle } from './lsystem.js';
import { generateEnemyTemplate } from './enemyGen.js';
import { generateNpc, generateVillager } from './npcGen.js';
import { validateFloor } from './floor.js';
import { LORE, FRAGMENT_LORE, HOUSE_LORE, LANDMARK_LORE } from '../data/lore.js';
import { G } from './ground.js';
export const FRAGMENT_CHANCE = 0.02;
const LANDMARK_NAME = { coloso: 'El Coloso Arrodillado', arbol_ancestral: 'Árbol Ancestral', costillar: 'Costillar del Titán' };

export function regionSize(depth) {
  return { w: Math.min(160, 96 + depth * 8), h: Math.min(120, 72 + depth * 6) };
}

function tryGenerate(seed, depth, forceFragment) {
  const rng = createRng(seed);
  const biomeKey = pickBiome(rng, depth);
  const B = BIOMES[biomeKey];
  const geo = B.geo;
  const { w, h } = regionSize(depth);
  const N = w * h;
  const idx = (x, y) => y * w + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const border = (x, y) => Math.min(x, w - 1 - x, y - 1, h - 1 - y);

  const ground = new Uint8Array(N);
  const occ = new Uint8Array(N);
  const reserved = new Uint8Array(N);
  const grass = new Uint8Array(N);
  const decal = new Uint8Array(N);
  const props = [];
  const f = {
    w, h, ground, grass, decal, props,
    walls: new Uint8Array(N), seen: new Uint8Array(N),
    blockers: new Set(), start: null, stairs: null,
    enemies: [], npcs: [], inspect: [], zones: [], fragment: null,
    biome: biomeKey, biomeName: B.name, music: B.music,
  };
  const gAt = (x, y) => (inside(x, y) ? ground[idx(x, y)] : G.ROCK);

  // 1. Relieve y humedad: la caverna cierra los bordes, el agua llena las hondonadas.
  const elev = fbm(rng.fork('elev'), w, h, 30, 4);
  const moist = fbm(rng.fork('moist'), w, h, 22, 3);
  const detail = valueNoise(rng.fork('det'), w, h, 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const b = border(x, y);
      const edge = b < 7 ? ((7 - b) / 7) * 0.45 : 0;
      const e = elev(x, y) + edge + (detail(x, y) - 0.5) * 0.08;
      ground[idx(x, y)] = b < 2 ? G.ROCK : e > geo.rock ? G.ROCK : e < geo.water ? G.WATER : G.GROUND;
    }
  }
  for (let it = 0; it < 2; it++) {
    const next = ground.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (border(x, y) < 2) continue;
        let rocks = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && gAt(x + dx, y + dy) === G.ROCK) rocks++;
        const i = idx(x, y);
        if (rocks >= 5) next[i] = G.ROCK;
        else if (rocks <= 2 && ground[i] === G.ROCK) next[i] = G.GROUND;
      }
    }
    ground.set(next);
  }
  const regions = (type) => {
    const seen = new Uint8Array(N);
    const out = [];
    for (let i = 0; i < N; i++) {
      if (ground[i] !== type || seen[i]) continue;
      const cells = [];
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const k = stack.pop();
        cells.push(k);
        const x = k % w;
        const y = Math.floor(k / w);
        for (const [dx, dy] of N4) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inside(nx, ny)) continue;
          const ni = idx(nx, ny);
          if (!seen[ni] && ground[ni] === type) { seen[ni] = 1; stack.push(ni); }
        }
      }
      out.push(cells);
    }
    return out;
  };
  for (const r of regions(G.ROCK)) if (r.length < 14 && r.every((k) => border(k % w, Math.floor(k / w)) >= 2)) for (const k of r) ground[k] = G.GROUND;
  for (const r of regions(G.WATER)) if (r.length < 8) for (const k of r) ground[k] = G.GROUND;

  // 2. Río: A* con costo ruidoso entre dos bordes opuestos → meandros naturales.
  if (rng.chance(geo.river)) {
    const vertical = rng.chance(0.5);
    const a = vertical ? { x: rng.int(w * 0.25, w * 0.75), y: 3 } : { x: 2, y: rng.int(h * 0.25, h * 0.75) };
    const b = vertical ? { x: rng.int(w * 0.25, w * 0.75), y: h - 3 } : { x: w - 3, y: rng.int(h * 0.25, h * 0.75) };
    const meander = valueNoise(rng.fork('river'), w, h, 7);
    const river = astar(w, h, a, b, (x, y) => (border(x, y) < 2 ? Infinity : 1 + meander(x, y) * 9 + (gAt(x, y) === G.ROCK ? 6 : 0)));
    for (const k of river || []) {
      const x = k % w;
      const y = Math.floor(k / w);
      for (const [dx, dy] of [[0, 0], vertical ? [1, 0] : [0, 1]]) if (border(x + dx, y + dy) >= 2) ground[idx(x + dx, y + dy)] = G.WATER;
    }
  }

  // 3. Puntos de interés sobre la tierra principal.
  const main = regions(G.GROUND).sort((p, q) => q.length - p.length)[0] || [];
  if (main.length < N * 0.3) return null;
  const cell = (k) => ({ x: k % w, y: Math.floor(k / w) });
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const openness = (c, r) => {
    let ok = 0;
    let all = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        all++;
        if (gAt(c.x + dx, c.y + dy) === G.GROUND) ok++;
      }
    }
    return ok / all;
  };
  const side = rng.int(0, 3);
  const edgeScore = (c) => [c.x, w - c.x, c.y, h - c.y][side];
  const byEdge = main.map(cell).filter((c) => border(c.x, c.y) >= 4).sort((p, q) => edgeScore(p) - edgeScore(q));
  const start = rng.pick(byEdge.slice(0, Math.max(1, Math.floor(byEdge.length * 0.03))));
  const byFar = main.map(cell).filter((c) => border(c.x, c.y) >= 5).sort((p, q) => dist(q, start) - dist(p, start));
  const stairs = rng.pick(byFar.slice(0, Math.max(1, Math.floor(byFar.length * 0.03))));
  if (!start || !stairs || dist(start, stairs) < Math.max(w, h) * 0.5) return null;

  const pois = [start, stairs];
  const samplePoi = (r, minOpen, minDist, tries = 400) => {
    for (let t = 0; t < tries; t++) {
      const c = cell(rng.pick(main));
      if (border(c.x, c.y) < r + 3) continue;
      if (pois.some((p) => dist(p, c) < minDist)) continue;
      if (openness(c, r) >= minOpen) return c;
    }
    return null;
  };
  const villages = [];
  for (let i = 0; i < (w >= 128 ? 2 : 1); i++) {
    const c = samplePoi(7, 0.7, 26);
    if (c) { villages.push(c); pois.push(c); }
  }
  const landmark = samplePoi(6, 0.65, 20);
  if (landmark) pois.push(landmark);
  const shrines = [];
  for (let i = 0; i < 3; i++) {
    const c = samplePoi(2, 0.8, 14);
    if (c) { shrines.push(c); pois.push(c); }
  }
  const flatten = (c, r) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const x = c.x + dx;
        const y = c.y + dy;
        if (!inside(x, y) || border(x, y) < 2) continue;
        const i = idx(x, y);
        if (ground[i] !== G.PATH && ground[i] !== G.BRIDGE) ground[i] = G.GROUND;
        reserved[i] = 1;
      }
    }
  };
  for (const v of villages) flatten(v, 8);
  if (landmark) flatten(landmark, 5);
  flatten(start, 3);
  flatten(stairs, 3);

  // 4. Caminos: árbol mínimo entre puntos + atajos. Puentes sobre agua, túneles en roca.
  const edges = mst(pois);
  for (let i = 0; i < 2; i++) {
    const [p, q] = rng.shuffle(pois.map((_, k) => k)).slice(0, 2);
    edges.push([p, q]);
  }
  const wobble = valueNoise(rng.fork('road'), w, h, 6);
  const roadCost = (x, y) => {
    if (border(x, y) < 2) return Infinity;
    const t = gAt(x, y);
    if (t === G.PATH || t === G.BRIDGE || t === G.PAVED) return 0.5;
    if (t === G.WATER) return 9;
    if (t === G.ROCK) return 40;
    return 1 + wobble(x, y) * 2 + (moist(x, y) > geo.forest ? 0.6 : 0);
  };
  for (const [a, b] of edges) {
    const path = astar(w, h, pois[a], pois[b], roadCost);
    if (!path) return null;
    for (const k of path) {
      const t = ground[k];
      if (t === G.WATER) ground[k] = G.BRIDGE;
      else if (t !== G.BRIDGE && t !== G.PAVED) ground[k] = G.PATH;
    }
  }

  const free = (x, y, allowPath = false) => {
    if (!inside(x, y) || border(x, y) < 2) return false;
    const i = idx(x, y);
    const t = ground[i];
    return !occ[i] && (t === G.GROUND || (allowPath && (t === G.PATH || t === G.PAVED)));
  };
  const place = (k, x, y, v = 0, { allowPath = false, ignoreReserved = true } = {}) => {
    const prop = { k, x, y, v };
    const fp = footprint(prop);
    if (!fp.every(([fx, fy]) => free(fx, fy, allowPath) && (ignoreReserved || !reserved[idx(fx, fy)]))) return null;
    // La imagen no puede salirse del mapa.
    if (y - PROPS[k].h + 1 < 0 || x < 0 || x + PROPS[k].w > w) return null;
    for (const [fx, fy] of fp) occ[idx(fx, fy)] = 1;
    props.push(prop);
    return prop;
  };

  // 5. Aldeas: plaza empedrada con hoguera, casas con la puerta hacia la plaza, faroles y aldeanos.
  const lore = rng.fork('lore');
  villages.forEach((c, vi) => {
    const name = B.villages[(vi + rng.int(0, 9)) % B.villages.length];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.abs(dx) + Math.abs(dy) <= 4) ground[idx(c.x + dx, c.y + dy)] = G.PAVED;
    place('hoguera', c.x, c.y, 0, { allowPath: true });
    f.inspect.push({ x: c.x, y: c.y, action: 'hoguera', text: 'Una hoguera que nadie deja apagar.' });
    const spots = [];
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2 + rng.next() * 0.3;
      const r = rng.int(5, 7);
      spots.push({ x: Math.round(c.x + Math.cos(ang) * r) - 2, y: Math.round(c.y + Math.sin(ang) * r * 0.8) + 1 });
    }
    let houses = 0;
    const target = rng.int(4, 6);
    for (const s of rng.shuffle(spots)) {
      if (houses >= target) break;
      // Deja una casilla libre alrededor de cada casa (y de su techo) para que se lean por separado.
      let clear = true;
      for (let yy = s.y - 4; yy <= s.y + 1 && clear; yy++) {
        for (let xx = s.x - 1; xx <= s.x + 4; xx++) {
          if (!inside(xx, yy) || occ[idx(xx, yy)] || gAt(xx, yy) === G.ROCK || gAt(xx, yy) === G.WATER) { clear = false; break; }
        }
      }
      if (!clear) continue;
      const doorFront = { x: s.x + PROPS.casa.door[0], y: s.y + 1 };
      if (!free(doorFront.x, doorFront.y, true)) continue;
      if (!place('casa', s.x, s.y, rng.int(0, 2), { allowPath: false })) continue;
      houses++;
      f.inspect.push({ x: s.x + PROPS.casa.door[0], y: s.y, text: lore.pick(HOUSE_LORE) });
      const walk = astar(w, h, doorFront, { x: c.x, y: c.y + 1 }, (x, y) => {
        if (occ[idx(x, y)]) return Infinity;
        const t = gAt(x, y);
        if (t === G.WATER || t === G.ROCK) return Infinity;
        return t === G.PAVED || t === G.PATH ? 0.4 : 1;
      });
      for (const k of walk || []) if (ground[k] === G.GROUND) ground[k] = G.PATH;
    }
    for (let i = 0, lamps = 0; i < 30 && lamps < 4; i++) {
      const ang = rng.next() * Math.PI * 2;
      if (place('farol', Math.round(c.x + Math.cos(ang) * 3.6), Math.round(c.y + Math.sin(ang) * 3))) lamps++;
    }
    place('pozo', c.x + 2, c.y - 2);
    const people = rng.int(2, 3);
    for (let i = 0, t = 0; i < people && t < 60; t++) {
      const x = c.x + rng.int(-3, 3);
      const y = c.y + rng.int(-2, 3);
      if (!free(x, y, true)) continue;
      if (N4.filter(([dx, dy]) => free(x + dx, y + dy, true)).length < 3) continue;
      occ[idx(x, y)] = 1;
      f.npcs.push({ id: `npc_v${vi}_${i}`, x, y, sheet: generateVillager(hashSeed(seed, `v${vi}${i}`), depth, name), history: [], turns: 0 });
      i++;
    }
    f.zones.push({ name, kind: 'aldea', x: c.x, y: c.y, r: 9 });
  });

  // 6. Monumento colosal: el jugador se mide contra algo muchas veces más grande que él.
  if (landmark) {
    const kind = B.landmark;
    let front = { x: landmark.x, y: landmark.y };
    if (kind === 'costillar') {
      const px = landmark.x;
      for (let y = landmark.y - 12; y <= landmark.y; y++) {
        for (let x = px - 4; x <= px + 4; x++) {
          if (inside(x, y) && border(x, y) >= 2 && !occ[idx(x, y)]) { ground[idx(x, y)] = G.GROUND; reserved[idx(x, y)] = 1; }
        }
      }
      for (let y = landmark.y - 10; y <= landmark.y; y++) ground[idx(px, y)] = G.PATH;
      for (const y of [landmark.y - 1, landmark.y - 4, landmark.y - 7]) {
        place('costilla', px - 3, y, 0);
        place('costilla', px + 1, y, 1);
      }
      place('craneo', px - 2, landmark.y - 11);
      front = { x: px, y: landmark.y - 10 };
    } else {
      // Se prueban varias posiciones: la base nunca debe cortar un camino ya trazado.
      const def = PROPS[kind];
      const offsets = [[0, 0], [-3, 0], [3, 0], [0, -2], [-3, -2], [3, -2], [0, 3], [-4, 2], [4, 2]];
      for (const [ox, oy] of offsets) {
        const ax = landmark.x - Math.floor(def.w / 2) + ox;
        const ay = landmark.y - 1 + oy;
        if (place(kind, ax, ay)) {
          front = { x: ax + Math.floor(def.w / 2), y: ay + 1 };
          break;
        }
      }
    }
    f.inspect.push({ x: front.x, y: front.y - 1, text: LANDMARK_LORE[kind] });
    f.zones.push({ name: LANDMARK_NAME[kind], kind: 'monumento', x: landmark.x, y: landmark.y - 3, r: 7 });
  }

  // Santuarios con lore: estatuas o rocas con inscripciones.
  for (const s of shrines) {
    const k = biomeKey === 'ciudad' || biomeKey === 'necropolis' ? 'estatua' : 'pena';
    if (place(k, s.x - 1, s.y - 1)) f.inspect.push({ x: s.x, y: s.y - 1, text: lore.pick(LORE) });
  }

  // El Descenso: el pozo hacia el siguiente piso.
  f.stairs = stairs;
  ground[idx(stairs.x, stairs.y)] = G.PAVED;
  f.zones.push({ name: 'El Descenso', kind: 'descenso', x: stairs.x, y: stairs.y, r: 4 });
  f.start = start;

  // 7. Vegetación y decoración.
  const forestNoise = fbm(rng.fork('forest'), w, h, 14, 3);
  const grassNoise = fbm(rng.fork('grass'), w, h, 8, 2);
  for (let y = 3; y < h - 2; y++) {
    for (let x = 2; x < w - 3; x++) {
      const i = idx(x, y);
      if (ground[i] !== G.GROUND || reserved[i] || occ[i]) continue;
      const fv = moist(x, y) * 0.55 + forestNoise(x, y) * 0.45;
      if (fv > geo.forest && rng.chance(geo.treeDensity)) {
        if (occ[idx(x, y - 1)] || occ[idx(x + 1, y - 1)]) continue;
        place(rng.pick(B.trees), x, y, rng.int(0, 2), { ignoreReserved: false });
      }
    }
  }
  for (let i = 0; i < N; i++) {
    if (ground[i] === G.GROUND && !occ[i] && !reserved[i] && grassNoise(i % w, Math.floor(i / w)) > geo.grass) grass[i] = 1;
  }
  const nearWater = (x, y) => N4.some(([dx, dy]) => gAt(x + dx, y + dy) === G.WATER);
  for (const [kind, rate, cond] of B.decor) {
    for (let i = 0; i < N; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      if (ground[i] !== G.GROUND || occ[i] || reserved[i] || grass[i]) continue;
      if (cond === 'orilla' && !nearWater(x, y)) continue;
      if (rng.chance(rate)) place(kind, x, y, rng.int(0, 1), { ignoreReserved: false });
    }
  }
  const patches = Math.floor(N / 350);
  for (let p = 0; p < patches; p++) {
    const which = rng.int(0, B.decals.length - 1);
    const sys = LSYSTEMS[B.decals[which]];
    const o = cell(rng.pick(main));
    turtle(expand(sys.axiom, sys.rules, sys.iterations), o, rng, (x, y) => {
      if (!inside(x, y) || ground[idx(x, y)] !== G.GROUND || occ[idx(x, y)] || decal[idx(x, y)]) return false;
      decal[idx(x, y)] = which + 1;
      return true;
    }, { skip: sys.skip });
  }

  // Paredes: roca, agua (salvo puentes) y la base de cada elemento.
  const syncWalls = () => { for (let i = 0; i < N; i++) f.walls[i] = ground[i] === G.ROCK || ground[i] === G.WATER || occ[i] ? 1 : 0; };
  syncWalls();

  // 8. Fragmento multiversal: lejos de caminos, aldeas, monumentos, inicio y descenso.
  if (forceFragment || rng.chance(FRAGMENT_CHANCE)) {
    for (let t = 0; t < 300 && !f.fragment; t++) {
      const c = cell(rng.pick(main));
      if (pois.some((p) => dist(p, c) < 14) || openness(c, 4) < 0.5) continue;
      let nearRoad = false;
      for (let dy = -6; dy <= 6 && !nearRoad; dy++) for (let dx = -6; dx <= 6; dx++) if ([G.PATH, G.BRIDGE, G.PAVED].includes(gAt(c.x + dx, c.y + dy))) nearRoad = true;
      if (nearRoad) continue;
      const cells = new Set();
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const x = c.x + dx;
          const y = c.y + dy;
          if (dx * dx + dy * dy <= 26 && inside(x, y) && ground[idx(x, y)] === G.GROUND) cells.add(idx(x, y));
        }
      }
      for (let i = props.length - 1; i >= 0; i--) {
        const fp = footprint(props[i]);
        if (fp.some(([x, y]) => cells.has(idx(x, y)))) {
          for (const [x, y] of fp) occ[idx(x, y)] = 0;
          props.splice(i, 1);
        }
      }
      for (const k of cells) { grass[k] = 0; decal[k] = 3; }
      f.fragment = { biome: 'abismo', cells };
      const spot = [...cells].find((k) => N4.every(([dx, dy]) => cells.has(idx((k % w) + dx, Math.floor(k / w) + dy))));
      if (spot !== undefined) {
        occ[spot] = 1;
        f.enemies.push({ id: 'frag', ...cell(spot), home: cell(spot), template: generateEnemyTemplate({ seed: hashSeed(seed, 'frag'), depth, biome: BIOMES.abismo, foreign: true }) });
      }
      const loreCell = [...cells].find((k) => k !== spot && !occ[k]);
      if (loreCell !== undefined) {
        occ[loreCell] = 1;
        f.inspect.push({ ...cell(loreCell), text: rng.pick(FRAGMENT_LORE) });
      }
      f.zones.push({ name: 'Eco de otra realidad', kind: 'fragmento', x: c.x, y: c.y, r: 5 });
    }
    syncWalls();
    // Los enemigos no son pared (se enfrentan); el cadáver del fragmento sí bloquea.
    for (const e of f.enemies) f.walls[idx(e.x, e.y)] = 0;
    for (const it of f.inspect) if (!f.walls[idx(it.x, it.y)]) f.blockers.add(idx(it.x, it.y));
  }

  // 9. Criaturas que deambulan por la región (además de los encuentros en hierba alta).
  const reach = bfs(f, start);
  const enemyCount = Math.min(16, 6 + depth) + (f.fragment ? 1 : 0);
  const candidates = rng.shuffle(main.filter((k) => !occ[k] && !reserved[k] && ground[k] !== G.BRIDGE && reach[k] >= 0));
  for (const k of candidates) {
    if (f.enemies.length >= enemyCount) break;
    const c = cell(k);
    if (dist(c, start) < 18 || villages.some((v) => dist(v, c) < 13)) continue;
    if (f.enemies.some((e) => dist(e, c) < 8)) continue;
    const id = `e${f.enemies.length}`;
    occ[k] = 1;
    f.enemies.push({ id, ...c, home: c, template: generateEnemyTemplate({ seed: hashSeed(seed, id), depth, biome: B }) });
  }

  // Un ermitaño errante fuera de las aldeas.
  if (rng.chance(0.6) || villages.length === 0) {
    for (const k of candidates) {
      const c = cell(k);
      if (occ[k] || dist(c, start) < 8 || villages.some((v) => dist(v, c) < 12)) continue;
      if (N4.filter(([dx, dy]) => free(c.x + dx, c.y + dy, true)).length < 3) continue;
      occ[k] = 1;
      f.npcs.push({ id: 'npc_h', ...c, sheet: generateNpc(hashSeed(seed, 'npc'), depth), history: [], turns: 0 });
      break;
    }
  }
  for (const n of f.npcs) f.blockers.add(idx(n.x, n.y));

  // Zonas con nombre: el lago más grande y la espesura más densa.
  const lakes = regions(G.WATER).sort((p, q) => q.length - p.length);
  if (lakes[0]?.length > 40) {
    const cs = lakes[0].map(cell);
    const cx = Math.round(cs.reduce((s, c) => s + c.x, 0) / cs.length);
    const cy = Math.round(cs.reduce((s, c) => s + c.y, 0) / cs.length);
    f.zones.push({ name: rng.pick(B.lakeNames), kind: 'lago', x: cx, y: cy, r: Math.round(Math.sqrt(cs.length) * 0.8) + 3 });
  }
  const block = 14;
  let best = null;
  const trees = new Set(['arbol', 'pino', 'seco', 'sauce', 'hongo']);
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const n = props.filter((p) => trees.has(p.k) && p.x >= bx && p.x < bx + block && p.y >= by && p.y < by + block).length;
      if (!best || n > best.n) best = { n, x: bx + block / 2, y: by + block / 2 };
    }
  }
  if (best && best.n >= 12) f.zones.push({ name: rng.pick(B.forestNames), kind: 'bosque', x: Math.round(best.x), y: Math.round(best.y), r: 9 });

  f.villages = villages.length;
  f.landmark = !!landmark;
  return f;
}

function bfs(f, from) {
  const dist = new Int32Array(f.w * f.h).fill(-1);
  const q = [from.y * f.w + from.x];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const x = k % f.w;
    const y = Math.floor(k / f.w);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
      const ni = ny * f.w + nx;
      if (f.walls[ni] || f.blockers.has(ni) || dist[ni] >= 0) continue;
      dist[ni] = dist[k] + 1;
      q.push(ni);
    }
  }
  return dist;
}

// Si un intento no pasa la validación, se regenera con la semilla derivada siguiente
// (determinista: la misma semilla de partida produce siempre la misma región).
export function generateFloor({ runSeed, depth, forceFragment = false }) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const seed = hashSeed(hashSeed(runSeed, depth), attempt);
    const f = tryGenerate(seed, depth, forceFragment);
    if (f && validateFloor(f)) {
      f.seed = seed;
      f.attempts = attempt + 1;
      return f;
    }
  }
  throw new Error(`No se pudo generar el piso ${depth} (semilla ${runSeed})`);
}
