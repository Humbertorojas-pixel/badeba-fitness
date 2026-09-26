import { createRng, hashSeed } from '../core/rng.js';
import { BIOMES, pickBiome, dungeonThemeKey } from './biomes.js';
import { PROPS, footprint } from './props.js';
import { fbm, valueNoise, astar, mst, N4 } from './terrain.js';
import { LSYSTEMS, expand, turtle } from './lsystem.js';
import { generateEnemyTemplate, generateCuteTemplate } from './enemyGen.js';
import { cuteForBiome } from '../data/cute.js';
import { assignQuests } from './quests.js';
import { generateNpc, generateVillager } from './npcGen.js';
import { validateFloor } from './floor.js';
import { LORE, FRAGMENT_LORE, HOUSE_LORE, LANDMARK_LORE, INN_LORE, STALL_LORE, TOWER_LORE, MILL_LORE, CAMP_LORE, CART_LORE, CHAPEL_NAMES, CHAPEL_LORE } from '../data/lore.js';
import { G } from './ground.js';
export const FRAGMENT_CHANCE = 0.02;
const LANDMARK_NAME = { coloso: 'El Coloso Arrodillado', arbol_ancestral: 'Árbol Ancestral', costillar: 'Costillar del Titán' };

// Regiones enormes: el primer piso ya ocupa decenas de pantallas y crecen al descender.
export function regionSize(depth) {
  return { w: Math.min(184, 120 + depth * 8), h: Math.min(136, 90 + depth * 6) };
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
  for (let i = 0; i < (w >= 160 ? 3 : 2); i++) {
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
  // Capilla en ruinas: un punto de interés al que llega un camino.
  const chapel = rng.chance(0.75) ? samplePoi(4, 0.8, 16) : null;
  if (chapel) pois.push({ x: chapel.x, y: chapel.y + 1 });
  const noRoad = new Uint8Array(N);
  if (chapel) for (let dy = -2; dy <= 0; dy++) for (let dx = -2; dx <= 1; dx++) if (inside(chapel.x + dx, chapel.y + dy)) noRoad[idx(chapel.x + dx, chapel.y + dy)] = 1;
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
  if (chapel) flatten(chapel, 4);
  flatten(start, 3);
  flatten(stairs, 3);

  // Entradas a mazmorras: bocas de cueva en acantilados de doble altura o criptas en claros.
  const themeKey = dungeonThemeKey(biomeKey);
  const entrances = [];
  const wantDungeons = w >= 160 ? 3 : 2;
  const mainSet = new Set(main);
  if (B.dungeon === 'cripta') {
    for (let i = 0; i < wantDungeons * 3 && entrances.length < wantDungeons; i++) {
      const c = samplePoi(3, 0.85, 16);
      if (!c || entrances.some((e) => dist(e.front, c) < 20)) continue;
      flatten(c, 3);
      const front = { x: c.x, y: c.y + 1 };
      entrances.push({ x: c.x - 1, y: c.y, door: { x: c.x, y: c.y }, front, crypt: true });
      pois.push(front);
    }
  } else {
    const cands = [];
    for (let y = 4; y < h - 5; y++) {
      for (let x = 3; x < w - 5; x++) {
        const rockPair = (yy) => gAt(x, yy) === G.ROCK && gAt(x + 1, yy) === G.ROCK;
        const groundPair = (yy) => gAt(x, yy) === G.GROUND && gAt(x + 1, yy) === G.GROUND;
        if (rockPair(y) && rockPair(y - 1) && groundPair(y + 1) && groundPair(y + 2) && mainSet.has(idx(x, y + 1))) cands.push({ x, y });
      }
    }
    for (const c of rng.shuffle(cands)) {
      if (entrances.length >= wantDungeons) break;
      const front = { x: c.x, y: c.y + 1 };
      if (dist(front, start) < 16 || pois.some((p) => dist(p, front) < 12) || entrances.some((e) => dist(e.front, front) < 20)) continue;
      entrances.push({ x: c.x, y: c.y, door: { x: c.x, y: c.y }, front });
      pois.push(front);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) reserved[idx(front.x + dx, front.y + dy)] = 1;
    }
  }

  // 4. Caminos: árbol mínimo entre puntos + atajos. Puentes sobre agua, túneles en roca.
  const edges = mst(pois);
  for (let i = 0; i < 2; i++) {
    const [p, q] = rng.shuffle(pois.map((_, k) => k)).slice(0, 2);
    edges.push([p, q]);
  }
  const wobble = valueNoise(rng.fork('road'), w, h, 6);
  const roadCost = (x, y) => {
    if (border(x, y) < 2 || noRoad[idx(x, y)]) return Infinity;
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
  // Reserva un rectángulo para que la vegetación no tape una construcción.
  const reserveRect = (x0, y0, x1, y1) => {
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (inside(xx, yy)) reserved[idx(xx, yy)] = 1;
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
    let inn = null;
    let innTries = 0;
    const target = rng.int(4, 6);
    const homes = [];
    for (const s of rng.shuffle(spots)) {
      if (houses >= target) break;
      // La posada es la primera construcción que se intenta: la más grande, junto a la plaza.
      const kind = !inn && innTries++ < 8 ? 'posada' : 'casa';
      const def = PROPS[kind];
      // Deja una casilla libre alrededor de cada edificio (y de su techo) para que se lean por separado.
      let clear = true;
      for (let yy = s.y - def.h; yy <= s.y + 1 && clear; yy++) {
        for (let xx = s.x - 1; xx <= s.x + def.w; xx++) {
          if (!inside(xx, yy) || occ[idx(xx, yy)] || gAt(xx, yy) === G.ROCK || gAt(xx, yy) === G.WATER) { clear = false; break; }
        }
      }
      if (!clear) continue;
      const doorFront = { x: s.x + def.door[0], y: s.y + 1 };
      if (!free(doorFront.x, doorFront.y, true)) continue;
      const built = place(kind, s.x, s.y, rng.int(0, kind === 'posada' ? 1 : 2), { allowPath: false });
      if (!built) continue;
      houses++;
      homes.push(built);
      if (kind === 'posada') {
        inn = built;
        f.inspect.push({ x: s.x + def.door[0], y: s.y, action: 'posada', text: lore.pick(INN_LORE) });
      } else f.inspect.push({ x: s.x + def.door[0], y: s.y, text: lore.pick(HOUSE_LORE) });
      const walk = astar(w, h, doorFront, { x: c.x, y: c.y + 1 }, (x, y) => {
        if (occ[idx(x, y)]) return Infinity;
        const t = gAt(x, y);
        if (t === G.WATER || t === G.ROCK) return Infinity;
        return t === G.PAVED || t === G.PATH ? 0.4 : 1;
      });
      for (const k of walk || []) if (ground[k] === G.GROUND) ground[k] = G.PATH;
    }
    // Leña, barriles y cajas junto a las casas (nunca sobre los senderos).
    for (const hp of homes) {
      const def = PROPS[hp.k];
      if (rng.chance(0.5)) place('lena', hp.x + def.w, hp.y) || place('lena', hp.x - 2, hp.y);
      else place(rng.pick(['barril', 'cajas']), hp.x + def.w, hp.y, rng.int(0, 1));
    }
    for (let i = 0, lamps = 0; i < 30 && lamps < 4; i++) {
      const ang = rng.next() * Math.PI * 2;
      if (place('farol', Math.round(c.x + Math.cos(ang) * 3.6), Math.round(c.y + Math.sin(ang) * 3))) lamps++;
    }
    place('pozo', c.x + 2, c.y - 2);
    // Puestos de mercado en el borde de la plaza: con acceso por delante y sin pisar senderos.
    const stallOk = (x, y) => [0, 1].every((dx) => {
      const t = gAt(x + dx, y);
      const below = gAt(x + dx, y + 1);
      return inside(x + dx, y - 1) && !occ[idx(x + dx, y)] && !occ[idx(x + dx, y - 1)] && !occ[idx(x + dx, y + 1)]
        && (t === G.GROUND || t === G.PAVED) && (below === G.GROUND || below === G.PAVED || below === G.PATH);
    });
    for (let t = 0, stalls = 0, want = rng.int(1, 2); t < 30 && stalls < want; t++) {
      const ang = rng.next() * Math.PI * 2;
      const r = rng.int(4, 5);
      const x = Math.round(c.x + Math.cos(ang) * r) - 1;
      const y = Math.round(c.y + Math.sin(ang) * r * 0.8);
      if (Math.abs(x - c.x) < 2 && Math.abs(y - c.y) < 2) continue;
      if (!stallOk(x, y) || !place('puesto', x, y, rng.int(0, 2), { allowPath: true })) continue;
      f.inspect.push({ x, y, text: lore.pick(STALL_LORE) });
      if (rng.chance(0.6)) place('cajas', x + 2, y, rng.int(0, 1), { allowPath: false });
      stalls++;
    }
    // Torre de vigía en el borde de la aldea, mirando al bosque.
    for (let t = 0; t < 16; t++) {
      const ang = rng.next() * Math.PI * 2;
      const x = Math.round(c.x + Math.cos(ang) * 9);
      const y = Math.round(c.y + Math.sin(ang) * 7.5);
      let clear = true;
      for (let yy = y - 5; yy <= y + 1 && clear; yy++) for (let xx = x - 1; xx <= x + 2; xx++) if (!inside(xx, yy) || occ[idx(xx, yy)]) { clear = false; break; }
      if (!clear || !place('torre', x, y, rng.int(0, 1))) continue;
      reserveRect(x - 1, y - 5, x + 2, y + 3);
      f.inspect.push({ x, y, text: lore.pick(TOWER_LORE) });
      break;
    }
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

    // Huertos a las afueras, con su espantapájaros: la aldea vive de algo.
    for (let k = 0, made = 0; k < 24 && made < 2; k++) {
      const ang = rng.next() * Math.PI * 2;
      const fw = rng.int(5, 7);
      const fh = rng.int(3, 4);
      const fx = Math.round(c.x + Math.cos(ang) * 11) - Math.floor(fw / 2);
      const fy = Math.round(c.y + Math.sin(ang) * 9) - Math.floor(fh / 2);
      let ok = true;
      for (let yy = fy - 1; yy <= fy + fh && ok; yy++) {
        for (let xx = fx - 1; xx <= fx + fw; xx++) {
          if (!inside(xx, yy) || border(xx, yy) < 3 || occ[idx(xx, yy)] || gAt(xx, yy) !== G.GROUND) { ok = false; break; }
        }
      }
      if (!ok) continue;
      for (let yy = fy; yy < fy + fh; yy++) for (let xx = fx; xx < fx + fw; xx++) { ground[idx(xx, yy)] = G.FIELD; reserved[idx(xx, yy)] = 1; }
      const sx = fx + Math.floor(fw / 2);
      const sy = fy + Math.floor(fh / 2);
      ground[idx(sx, sy)] = G.GROUND;
      if (made === 0) place('espantapajaros', sx, sy);
      if (made === 0 && (B.house === 'madera' || B.house === 'palafito') && rng.chance(0.7)) {
        for (const mx of [fx + fw + 1, fx - 4]) {
          if (place('molino', mx, fy + fh - 1)) { reserveRect(mx - 1, fy + fh - 6, mx + 3, fy + fh + 3); f.inspect.push({ x: mx + 1, y: fy + fh - 1, text: lore.pick(MILL_LORE) }); break; }
        }
      }
      made++;
    }
  });
  const villageNames = f.zones.filter((z) => z.kind === 'aldea');

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
    f.inspect.push({ x: front.x, y: front.y - 1, text: LANDMARK_LORE[kind], landmark: true });
    f.guardSpot = front;
    f.zones.push({ name: LANDMARK_NAME[kind], kind: 'monumento', x: landmark.x, y: landmark.y - 3, r: 7 });
  }

  // Santuarios con lore: estatuas o rocas con inscripciones.
  for (const s of shrines) {
    const k = biomeKey === 'ciudad' || biomeKey === 'necropolis' ? 'estatua' : 'pena';
    if (place(k, s.x - 1, s.y - 1)) f.inspect.push({ x: s.x, y: s.y - 1, text: lore.pick(LORE) });
  }

  // Carteles en los caminos: señalan aldeas y monumentos (orientarse en una región enorme).
  const named = [...villageNames, ...f.zones.filter((z) => z.kind === 'monumento')];
  const compass = (dx, dy) => {
    const ns = Math.abs(dy) > Math.abs(dx) * 0.4 ? (dy < 0 ? 'norte' : 'sur') : '';
    const ew = Math.abs(dx) > Math.abs(dy) * 0.4 ? (dx < 0 ? 'oeste' : 'este') : '';
    const combo = { norteeste: 'noreste', norteoeste: 'noroeste', sureste: 'sureste', suroeste: 'suroeste' };
    return ns && ew ? combo[ns + ew] : ns || ew;
  };
  const signSpots = [];
  for (let i = 0; i < N; i++) {
    if (ground[i] !== G.PATH) continue;
    const c = cell(i);
    const roads = N4.filter(([dx, dy]) => [G.PATH, G.BRIDGE, G.PAVED].includes(gAt(c.x + dx, c.y + dy))).length;
    const nearVillage = villages.some((v) => Math.abs(dist(v, c) - 12) < 1.5);
    if (roads >= 3 || nearVillage) signSpots.push(c);
  }
  const signs = [];
  for (const c of rng.shuffle(signSpots)) {
    if (signs.length >= 2 + villages.length * 2) break;
    if (signs.some((q) => dist(q, c) < 16) || pois.some((p) => dist(p, c) < 5)) continue;
    const spot = [[1, 0], [-1, 0], [0, -1], [0, 1]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).find((q) => free(q.x, q.y) && !reserved[idx(q.x, q.y)]);
    if (!spot || !place('cartel', spot.x, spot.y)) continue;
    const lines = named.filter((z) => dist(z, spot) > 8).sort((p, q) => dist(p, spot) - dist(q, spot)).slice(0, 3)
      .map((z) => `${z.name}: al ${compass(z.x - spot.x, z.y - spot.y)}`);
    f.inspect.push({ x: spot.x, y: spot.y, text: lines.length ? `El cartel dice: ${lines.join('. ')}.` : 'El cartel está en blanco, borrado por la humedad.' });
    signs.push(spot);
  }

  // Mazmorras: la estructura de la entrada, su nombre y la zona que anuncia el cartel.
  const dungeonNames = rng.shuffle(BIOMES[themeKey].names.slice());
  f.dungeons = [];
  entrances.forEach((e, i) => {
    const ok = e.crypt ? place('cripta', e.x, e.y, 0, { allowPath: true }) : place('cueva', e.x, e.y);
    if (!ok) return;
    const id = `m${i}`;
    const name = dungeonNames[i % dungeonNames.length];
    const cells = e.crypt ? [e.door] : [e.door, { x: e.door.x + 1, y: e.door.y }];
    for (const c of cells) f.inspect.push({ x: c.x, y: c.y, action: 'mazmorra', id });
    f.dungeons.push({ id, name, theme: themeKey, x: e.door.x, y: e.door.y, front: e.front });
    f.zones.push({ name, kind: 'mazmorra', x: e.front.x, y: e.front.y, r: 3 });
  });

  // Capilla en ruinas: rezar en su altar cura una vez por piso.
  if (chapel) {
    if (place('capilla', chapel.x - 2, chapel.y, rng.int(0, 2), { allowPath: true })) {
      const name = rng.pick(CHAPEL_NAMES);
      f.inspect.push({ x: chapel.x, y: chapel.y, action: 'capilla', id: 'capilla', text: CHAPEL_LORE });
      f.zones.push({ name, kind: 'capilla', x: chapel.x, y: chapel.y - 1, r: 4 });
    }
  }

  // Campamentos abandonados cerca de los caminos: tienda, fogata apagada y, a veces, un cofre.
  const nearRoad = (c, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (gAt(c.x + dx, c.y + dy) === G.PATH) return true;
    return false;
  };
  const wantCamps = w >= 160 ? 2 : rng.int(1, 2);
  for (let t = 0, camps = 0; t < 500 && camps < wantCamps; t++) {
    const c = cell(rng.pick(main));
    if (border(c.x, c.y) < 5 || gAt(c.x, c.y) !== G.GROUND || openness(c, 3) < 0.9) continue;
    if (dist(c, start) < 10 || dist(c, stairs) < 8 || villages.some((v) => dist(v, c) < 16) || pois.some((q) => dist(q, c) < 8)) continue;
    if (!nearRoad(c, 6) || nearRoad(c, 1)) continue;
    let clear = true;
    for (let yy = c.y - 3; yy <= c.y + 2 && clear; yy++) for (let xx = c.x - 2; xx <= c.x + 4; xx++) if (!inside(xx, yy) || occ[idx(xx, yy)] || reserved[idx(xx, yy)]) { clear = false; break; }
    if (!clear || !place('tienda', c.x, c.y, rng.int(0, 1))) continue;
    reserveRect(c.x - 3, c.y - 3, c.x + 5, c.y + 2);
    f.inspect.push({ x: c.x, y: c.y, text: lore.pick(CAMP_LORE) });
    place('fogata', c.x + 3, c.y + 1);
    place(rng.pick(['cajas', 'barril']), c.x - 1, c.y, rng.int(0, 1));
    if (rng.chance(0.6)) {
      const id = `camp${camps}`;
      const chest = place('cofre', c.x + 3, c.y - 1);
      if (chest) { chest.id = id; f.inspect.push({ x: c.x + 3, y: c.y - 1, action: 'cofre', id }); }
    }
    f.zones.push({ name: 'Campamento abandonado', kind: 'campamento', x: c.x + 1, y: c.y, r: 3 });
    pois.push(c);
    camps++;
  }

  // Carretas rotas al borde de los caminos.
  const roadCells = [];
  for (let i = 0; i < N; i++) if (ground[i] === G.PATH) roadCells.push(i);
  for (let t = 0, carts = 0, want = rng.int(1, 3); t < 200 && carts < want && roadCells.length; t++) {
    const c = cell(rng.pick(roadCells));
    if (villages.some((v) => dist(v, c) < 12) || pois.some((q) => dist(q, c) < 6)) continue;
    const spot = [[1, 0], [-2, 0], [0, 1], [0, -1], [-1, 1], [-1, -1]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }))
      .find((q) => [0, 1].every((dx) => free(q.x + dx, q.y) && !reserved[idx(q.x + dx, q.y)] && !occ[idx(q.x + dx, q.y - 1)]));
    if (!spot || !place('carreta', spot.x, spot.y, rng.int(0, 1), { ignoreReserved: false })) continue;
    reserveRect(spot.x - 1, spot.y - 2, spot.x + 2, spot.y + 1);
    f.inspect.push({ x: spot.x, y: spot.y, text: lore.pick(CART_LORE) });
    if (rng.chance(0.5)) place('barril', spot.x + 2, spot.y, 1, { ignoreReserved: false });
    pois.push(spot);
    carts++;
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
        const kind = B.rareTree && rng.chance(B.rareTree[1]) ? B.rareTree[0] : rng.pick(B.trees);
        place(kind, x, y, rng.int(0, 2), { ignoreReserved: false });
      }
    }
  }
  for (let i = 0; i < N; i++) {
    if (ground[i] === G.GROUND && !occ[i] && !reserved[i] && grassNoise(i % w, Math.floor(i / w)) > geo.grass) grass[i] = 1;
  }
  const nearWater = (x, y) => N4.some(([dx, dy]) => gAt(x + dx, y + dy) === G.WATER);
  const nearRock = (x, y) => [[0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]].some(([dx, dy]) => gAt(x + dx, y + dy) === G.ROCK);
  for (const [kind, rate, cond] of B.decor) {
    for (let i = 0; i < N; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      if (ground[i] !== G.GROUND || occ[i] || reserved[i] || grass[i]) continue;
      if (cond === 'orilla' && !nearWater(x, y)) continue;
      if (cond === 'roca' && !nearRock(x, y)) continue;
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

  // Vida en el agua: nenúfares y rocas junto a la orilla (o rocas encendidas en la lava).
  const shore = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => gAt(x + dx, y + dy) === G.GROUND);
  for (let i = 0; i < N; i++) {
    if (ground[i] !== G.WATER) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    if (!shore(x, y) || f.fragment?.cells?.has(i)) continue;
    if (B.lavaWater) {
      if (rng.chance(0.025)) props.push({ k: 'roca_lava', x, y, v: rng.int(0, 1) });
    } else if (rng.chance(biomeKey === 'pantano' ? 0.1 : biomeKey === 'bosque' ? 0.06 : 0.02)) {
      props.push({ k: 'nenufar', x, y, v: rng.int(0, 2) });
    } else if (rng.chance(0.012)) {
      props.push({ k: 'roca_agua', x, y, v: rng.int(0, 1) });
    }
  }

  // Haces de luz que se cuelan por grietas del techo del pozo, sobre claros abiertos.
  f.shafts = [];
  for (let t = 0; t < 400 && f.shafts.length < Math.floor(N / 1100); t++) {
    const c = cell(rng.pick(main));
    if (border(c.x, c.y) < 6 || openness(c, 3) < 0.85 || f.shafts.some((q) => dist(q, c) < 14)) continue;
    f.shafts.push(c);
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

  // Guardián del monumento: un enemigo legendario que espera junto a él (no persigue).
  if (f.guardSpot) {
    const g = f.guardSpot;
    const spots = [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) spots.push({ x: g.x + dx, y: g.y + dy });
    spots.sort((p, q) => dist(p, g) - dist(q, g));
    for (const c of spots) {
      const k = idx(c.x, c.y);
      if (!inside(c.x, c.y) || dist(c, g) < 2 || occ[k] || f.walls[k] || reach[k] < 0 || f.inspect.some((i) => i.x === c.x && i.y === c.y)) continue;
      // Debe quedar al menos una casilla libre para rodearlo: nunca tapa el único paso.
      if (N4.filter(([dx, dy]) => !f.walls[idx(c.x + dx, c.y + dy)]).length < 3) continue;
      occ[k] = 1;
      f.enemies.push({ id: 'guardian', ...c, home: c, passive: true, template: generateEnemyTemplate({ seed: hashSeed(seed, 'guardian'), depth, biome: B, rank: 'legendario' }) });
      break;
    }
    delete f.guardSpot;
  }

  // Criaturas adorables: una o dos por región, lejos del camino principal; no persiguen.
  const cuteKinds = rng.shuffle(cuteForBiome(biomeKey));
  const cuteCount = Math.min(cuteKinds.length, rng.chance(0.5) ? 2 : 1);
  let cuteMade = 0;
  for (const k of candidates) {
    if (cuteMade >= cuteCount) break;
    const c = cell(k);
    if (occ[k] || dist(c, start) < 12 || f.enemies.some((e) => dist(e, c) < 6) || villages.some((v) => dist(v, c) < 10)) continue;
    occ[k] = 1;
    const form = cuteKinds[cuteMade];
    f.enemies.push({ id: `cute${cuteMade}`, ...c, home: c, passive: true, template: generateCuteTemplate({ seed: hashSeed(seed, `cute${cuteMade}`), depth, form }) });
    cuteMade++;
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

  assignQuests(f, seed, depth);
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
