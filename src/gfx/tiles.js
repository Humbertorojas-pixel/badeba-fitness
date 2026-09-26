import { PixelBuffer, addStrip, addGrid, BAYER4 } from './pixelBuffer.js';
import { PAL } from '../palette.js';
import { createRng } from '../core/rng.js';

// Índices de tile dentro del bloque de un bioma. PATH y WATER ocupan 16 variantes (autotile).
export const T = {
  VOID: 0, ROCK_TOP: 1, ROCK_FACE: 2, GROUND: 3, TALL_GRASS: 6, PAVED: 7,
  BRIDGE_H: 8, BRIDGE_V: 9, STAIRS: 10, DECAL: 11, ROCK_FACE_HI: 14, GROUND_SHADE: 15,
  PATH: 16, WATER: 32, GROUND_DARK: 48, GROUND_LUSH: 51, FIELD: 54, FIELD_ALT: 55, WATER_DEEP: 56, ROCK_TOP_ALT: 57, ROCK_FACE_LOW: 58,
  WATER_IN: 64, PATH_IN: 80,
};
export const TILES_PER_BIOME = 96;
export const TILESET_COLS = 16;
// Los tiles de un fragmento multiversal usan el mismo índice + FRAGMENT_OFFSET.
export const FRAGMENT_OFFSET = TILES_PER_BIOME;
export const WATER_FRAMES = 3;

const N = 1;
const E = 2;
const S = 4;
const W = 8;

// Suelo con tres "humores" a gran escala (sombrío, normal, frondoso) para que la región no se
// vea como un tapiz uniforme. Todos comparten el tono medio, así que empalman sin costuras.
function groundTile(B, seed, variant, mood = 'normal') {
  const rng = createRng(seed + variant * 101 + (mood === 'dark' ? 5003 : mood === 'lush' ? 9001 : 0));
  const [dark, mid, light] = B.ground.colors;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, mid);
  const style = B.ground.style;
  const darkN = mood === 'dark' ? 26 : mood === 'lush' ? 6 : 12;
  const lightN = mood === 'lush' ? 14 : mood === 'dark' ? 3 : 7;
  for (let i = 0; i < darkN; i++) b.set(rng.int(0, 15), rng.int(0, 15), dark);
  for (let i = 0; i < lightN; i++) b.set(rng.int(0, 15), rng.int(0, 15), light);
  if (style === 'grass') {
    const tufts = (mood === 'lush' ? 6 : mood === 'dark' ? 2 : 4) + variant;
    for (let i = 0; i < tufts; i++) {
      const x = rng.int(1, 14);
      const y = rng.int(2, 14);
      b.set(x, y, light).set(x - 1, y - 1, light).set(x + 1, y - 1, light).set(x, y + 1, dark);
    }
    if (variant === 2 && mood !== 'dark') {
      for (let i = 0; i < (mood === 'lush' ? 3 : 1); i++) {
        const x = rng.int(3, 12);
        const y = rng.int(3, 12);
        const c = rng.pick([PAL.bone2, PAL.ember2, PAL.steel3, PAL.blood3]);
        b.set(x, y, c).set(x - 1, y, c).set(x + 1, y, c).set(x, y - 1, c).set(x, y, PAL.ember1).set(x, y + 1, dark);
      }
    }
    if (mood === 'dark' && variant > 0) b.set(rng.int(2, 13), rng.int(2, 13), PAL.rust1).set(rng.int(2, 13), rng.int(2, 13), PAL.rust0);
  } else if (style === 'mud') {
    for (let i = 0; i < 2 + variant; i++) {
      const x = rng.int(2, 12);
      const y = rng.int(3, 12);
      b.ellipse(x + 1, y, rng.int(1, 3), 1.2, dark).set(x, y - 1, light);
    }
    if (variant === 2) {
      const x = rng.int(3, 10);
      const y = rng.int(4, 11);
      b.ellipse(x + 2, y, 3, 1.5, B.water?.[0] || dark).set(x + 1, y, B.water?.[2] || light);
    }
  } else if (style === 'paved') {
    b.rect(0, 0, 16, 16, dark);
    const stones = [[0, 0, 7, 5], [8, 0, 8, 6], [0, 6, 5, 5], [6, 7, 10, 4], [0, 12, 9, 4], [10, 12, 6, 4]];
    for (const [x, y, sw, sh] of stones) {
      b.rect(x, y, sw - 1, sh - 1, mid).rect(x, y, sw - 1, 1, light).rect(x + sw - 2, y + 1, 1, sh - 2, dark);
      if (rng.chance(0.3 + variant * 0.2)) b.set(x + rng.int(1, sw - 2), y + rng.int(1, sh - 2), dark);
    }
    if (rng.chance(0.5)) b.set(rng.int(1, 14), rng.int(1, 14), PAL.moss1);
  } else {
    // Ceniza o polvo: grietas, piedrecitas y restos.
    if (variant > 0) {
      const x = rng.int(2, 12);
      const y = rng.int(2, 12);
      b.ellipse(x + 0.5, y + 0.5, 1.4, 1, light).set(x, y + 1, dark).set(x + 1, y + 1, dark);
    }
    if (variant === 2) {
      let x = rng.int(3, 12);
      for (let y = rng.int(1, 5); y < 14; y++) { b.set(x, y, dark); x += rng.int(-1, 1); }
    }
  }
  return b;
}

// Sombra ambiental al pie de un acantilado: tramado que se desvanece hacia abajo.
function shadeTop(b, rows = 6) {
  for (let y = 0; y < rows; y++) {
    const k = 1 - y / rows;
    for (let x = 0; x < 16; x++) if (BAYER4[y % 4][x % 4] < k * 0.85) b.set(x, y, PAL.ink);
  }
  return b;
}

// Hierba alta de Pokémon: matas redondeadas con puntas claras. `sway` inclina las puntas (animación);
// `front` dibuja solo la fila delantera, que tapa las piernas del jugador.
function grassTufts(B, { front = false, sway = 0 } = {}) {
  const [dark, mid, light] = B.tallGrass;
  const b = new PixelBuffer(16, 16);
  if (!front) b.rect(0, 0, 16, 16, B.ground.colors[0]);
  const tuft = (bx, by) => {
    const heights = [3, 5, 6, 7, 6, 5, 3];
    heights.forEach((hgt, i) => {
      const x = bx + i;
      const lean = hgt >= 5 ? sway : 0;
      b.line(x, by, x + lean, by - hgt + 1, i === 0 || i === 6 ? dark : mid);
      if (i > 0 && i < 6) b.set(x + lean, by - hgt + 1, light);
      if (i === 3) b.set(x + lean, by - hgt + 2, light);
    });
    b.line(bx, by, bx + 6, by, dark).set(bx + 3, by - 1, dark);
  };
  if (!front) {
    tuft(0, 7);
    tuft(8, 7);
    tuft(-4, 11);
    tuft(12, 11);
  }
  tuft(4, 15);
  tuft(-4, 15);
  tuft(12, 15);
  return b;
}

function jaggedEdges(b, mask, rng, fillColor, rimColor, depthMin = 1, depthMax = 3) {
  const sides = [[N, (i, d) => [i, d]], [S, (i, d) => [i, 15 - d]], [W, (i, d) => [d, i]], [E, (i, d) => [15 - d, i]]];
  for (const [bit, at] of sides) {
    if (mask & bit) continue;
    let depth = rng.int(depthMin, depthMax);
    for (let i = 0; i < 16; i++) {
      if (rng.chance(0.35)) depth = Math.max(depthMin, Math.min(depthMax, depth + rng.int(-1, 1)));
      for (let d = 0; d < depth; d++) b.set(...at(i, d), fillColor);
      b.set(...at(i, depth), rimColor);
    }
  }
}

// Esquinas exteriores cortadas en diagonal suave cuando dos lados vecinos son borde. Junto con
// las esquinas cóncavas (misma diagonal), una orilla en escalera se lee como una línea continua.
const cornerCut = (x, y, r) => x + y + (x * y) / (r * 2.2) < r;

function roundCorners(b, mask, color, r = 4) {
  const corners = [[N | W, 0, 0, 1, 1], [N | E, 15, 0, -1, 1], [S | W, 0, 15, 1, -1], [S | E, 15, 15, -1, -1]];
  for (const [bits, cx, cy, sx, sy] of corners) {
    if (mask & bits) continue;
    for (let y = 0; y < r; y++) for (let x = 0; x < r; x++) if (cornerCut(x, y, r)) b.set(cx + sx * x, cy + sy * y, color);
  }
}

function roundRim(b, mask, color, r) {
  const corners = [[N | W, 0, 0, 1, 1], [N | E, 15, 0, -1, 1], [S | W, 0, 15, 1, -1], [S | E, 15, 15, -1, -1]];
  for (const [bits, cx, cy, sx, sy] of corners) {
    if (mask & bits) continue;
    for (let y = 0; y <= r; y++) for (let x = 0; x <= r; x++) if (!cornerCut(x, y, r) && (cornerCut(x - 1, y, r) || cornerCut(x, y - 1, r))) b.set(cx + sx * x, cy + sy * y, color);
  }
}

function pathTile(B, mask) {
  const rng = createRng(4242 + mask);
  const [dark, mid, light] = B.path;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, mid);
  for (let i = 0; i < 14; i++) b.set(rng.int(0, 15), rng.int(0, 15), rng.chance(0.5) ? dark : light);
  for (let i = 0; i < 3; i++) {
    const x = rng.int(2, 12);
    const y = rng.int(2, 12);
    b.rect(x, y, 2, 1, light).set(x, y + 1, dark).set(x + 1, y + 1, dark);
  }
  jaggedEdges(b, mask, rng, B.ground.colors[1], dark, 1, 3);
  roundCorners(b, mask, B.ground.colors[1], 7);
  return b;
}

// Agua con orillas redondeadas, talud superior (perspectiva 3/4) y ondas que avanzan por frame.
function waterTile(B, mask, frame = 0, deep = false) {
  const rng = createRng(777 + mask);
  const [dark, mid, light] = B.water;
  const base = deep ? dark : mid;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, base);
  if (B.lavaWater) {
    const glow = [PAL.ember1, PAL.ember2, PAL.ember1][frame % 3];
    for (let i = 0; i < 6; i++) {
      const x = (rng.int(0, 12) + frame * 2) % 16;
      b.line(x, rng.int(1, 14), x + rng.int(2, 5), rng.int(1, 14), PAL.blood1);
    }
    for (let i = 0; i < 7; i++) b.set((rng.int(1, 14) + frame) % 16, rng.int(1, 14), i % 2 ? glow : PAL.ember2);
    if (!deep) {
      jaggedEdges(b, mask, rng, PAL.ink, PAL.shade, 1, 2);
      roundCorners(b, mask, B.ground.colors[1], 9);
      roundRim(b, mask, PAL.shade, 9);
    }
    return b;
  }
  // Ondas: segmentos claros que se desplazan en horizontal según el frame.
  for (let y = 2; y < 16; y += 4) {
    const x0 = (rng.int(0, 15) + frame * 2 + (y % 8 === 2 ? 0 : 7)) % 16;
    const len = rng.int(2, 4);
    for (let i = 0; i < len; i++) b.set((x0 + i) % 16, y, deep ? mid : light);
    b.set((x0 + len + 1) % 16, y + 1, deep ? PAL.ink : dark);
  }
  if (frame === 1) b.set(rng.int(2, 13), rng.int(2, 13), PAL.bone2);
  if (deep) return b;
  // Orilla superior: talud de tierra y espuma. Laterales e inferior: espuma de un píxel.
  const bank = B.ground.colors[0];
  if (!(mask & N)) b.rect(0, 0, 16, 3, bank).rect(0, 3, 16, 1, light);
  if (!(mask & S)) b.rect(0, 15, 16, 1, light);
  if (!(mask & W)) b.rect(0, 0, 1, 16, light);
  if (!(mask & E)) b.rect(15, 0, 1, 16, light);
  if (!(mask & N)) {
    if (!(mask & W)) b.rect(0, 0, 1, 4, bank);
    if (!(mask & E)) b.rect(15, 0, 1, 4, bank);
  }
  // La espuma respira: un píxel más claro recorre el borde.
  const f = [3, 8, 12][frame % 3];
  if (!(mask & S)) b.set(f, 14, light);
  roundCorners(b, mask, B.ground.colors[1], 9);
  // Espuma que sigue la curva de la esquina.
  roundRim(b, mask, light, 9);
  return b;
}

// Esquinas cóncavas (capa superior transparente): bits 1=NO, 2=NE, 4=SO, 8=SE.
// Rellenan el escalón donde dos lados son agua (o camino) pero la diagonal no.
export const INNER = { NW: 1, NE: 2, SW: 4, SE: 8 };

function innerCorners(mask, fill, rim, r = 3) {
  const b = new PixelBuffer(16, 16);
  const corners = [[INNER.NW, 0, 0, 1, 1], [INNER.NE, 15, 0, -1, 1], [INNER.SW, 0, 15, 1, -1], [INNER.SE, 15, 15, -1, -1]];
  for (const [bit, cx, cy, sx, sy] of corners) {
    if (!(mask & bit)) continue;
    for (let y = 0; y <= r; y++) {
      for (let x = 0; x <= r; x++) {
        if (cornerCut(x, y, r)) b.set(cx + sx * x, cy + sy * y, fill);
        else if (rim && (cornerCut(x - 1, y, r) || cornerCut(x, y - 1, r))) b.set(cx + sx * x, cy + sy * y, rim);
      }
    }
  }
  return b;
}

function bridgeTile(vertical) {
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, PAL.rust1);
  for (let k = 0; k < 16; k += 4) {
    if (vertical) b.rect(0, k, 16, 1, PAL.rust0).rect(2, k + 1, 12, 1, PAL.rust2);
    else b.rect(k, 0, 1, 16, PAL.rust0).rect(k + 1, 2, 1, 12, PAL.rust2);
  }
  if (vertical) b.rect(0, 0, 2, 16, PAL.rust0).rect(14, 0, 2, 16, PAL.rust0).rect(1, 0, 1, 16, PAL.rust2);
  else b.rect(0, 0, 16, 2, PAL.rust0).rect(0, 14, 16, 2, PAL.ink).rect(0, 1, 16, 1, PAL.rust2);
  b.set(vertical ? 3 : 5, vertical ? 6 : 4, PAL.stone2).set(vertical ? 12 : 10, vertical ? 10 : 12, PAL.stone2);
  return b;
}

// Techo de roca (lo que queda por encima de la vista): masa oscura con grietas y relieve.
function rockTop(B, seed) {
  const rng = createRng(seed);
  const [d0, d1, d2, d3] = B.rock.top;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, d1);
  for (let i = 0; i < 6; i++) {
    const x = rng.int(0, 13);
    const y = rng.int(0, 13);
    b.ellipse(x + 1.5, y + 1.5, rng.int(1, 3), rng.int(1, 2), d2);
    b.set(x + 1, y, d3).set(x + 2, y + 2, d0);
  }
  let x = rng.int(2, 13);
  for (let y = 0; y < 16; y++) { if (rng.chance(0.7)) b.set(x, y, d0); x = Math.max(0, Math.min(15, x + rng.int(-1, 1))); }
  for (let i = 0; i < 10; i++) b.set(rng.int(0, 15), rng.int(0, 15), d0);
  return b;
}

// Cara del acantilado: la inferior toca el suelo; la superior continúa hacia arriba (doble altura).
// `lip`: borde iluminado arriba (solo en la casilla más alta de la pared).
function rockFace(B, seed, upper = false, lip = true) {
  const rng = createRng(seed + (upper ? 77 : 0));
  const [mortar, base, alt, hi] = B.rock.face;
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, mortar);
  if (B.rock.style === 'brick') {
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const off = (row + (upper ? 1 : 0)) % 2 === 0 ? 0 : 4;
      for (let x = -8 + off; x < 16; x += 8) {
        b.rect(x + 1, y + 1, 7, 3, rng.chance(0.25) ? alt : base).rect(x + 1, y + 1, 7, 1, hi);
        if (rng.chance(0.15)) b.set(x + rng.int(2, 6), y + 2, mortar);
      }
    }
  } else {
    b.rect(0, 0, 16, 16, base);
    // Estrías verticales con luz a la izquierda de cada pliegue.
    for (let x = rng.int(0, 2); x < 16; x += rng.int(3, 5)) {
      const top = upper ? 0 : rng.int(0, 3);
      b.line(x, top, x + rng.int(-1, 1), 15, mortar);
      b.line(x + 1, top + 1, x + 1, 12, hi);
    }
    for (let i = 0; i < 8; i++) b.set(rng.int(0, 15), rng.int(1, 14), rng.chance(0.5) ? alt : hi);
    if (B.ground.style === 'grass' || B.ground.style === 'mud') {
      for (let i = 0; i < 3; i++) {
        const x = rng.int(1, 14);
        b.line(x, 0, x, rng.int(2, 6), PAL.moss1).set(x, 0, PAL.moss2);
      }
    }
  }
  if (upper) return b.rect(0, 0, 16, 1, hi);
  if (lip) b.rect(0, 0, 16, 1, alt);
  return b.rect(0, 14, 16, 2, PAL.ink).rect(0, 13, 16, 1, mortar);
}

function stairsTile(B) {
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, B.path[1]);
  b.ellipse(8, 8.5, 7.5, 6.5, PAL.stone2).ellipse(8, 8.5, 6.5, 5.5, PAL.stone0);
  const steps = [PAL.dusk, PAL.shade, PAL.night, PAL.ink];
  steps.forEach((c, i) => b.ellipse(8 + i * 0.4, 9 + i * 0.5, 5.5 - i * 1.2, 4.5 - i, c));
  return b.set(4, 5, PAL.stone3).set(10, 4, PAL.stone3);
}

// Surcos de cultivo junto a las aldeas.
function fieldTile(B, alt) {
  const soil = B.ground.style === 'ash' ? [PAL.shade, PAL.dusk, PAL.stone0] : [PAL.rust0, PAL.rust1, PAL.rust2];
  const crop = B.ground.style === 'ash' ? [PAL.stone1, PAL.stone2] : B.ground.style === 'mud' ? [PAL.moss1, PAL.bone0] : [PAL.moss1, PAL.moss2];
  const b = new PixelBuffer(16, 16).rect(0, 0, 16, 16, soil[1]);
  for (let y = 1; y < 16; y += 4) {
    b.rect(0, y, 16, 1, soil[2]).rect(0, y + 2, 16, 1, soil[0]);
    for (let x = (alt ? 2 : 0) + (y % 8 === 1 ? 0 : 2); x < 16; x += 4) b.set(x, y, crop[0]).set(x, y - 1, crop[1]).set(x + 1, y - 1, crop[0]);
  }
  return b;
}

const DECALS = {
  raices: (b, rng) => {
    let x = 0;
    let y = rng.int(4, 11);
    while (x < 16) {
      b.set(x, y, PAL.rust0).set(x, y - 1, PAL.rust1);
      x++;
      y = Math.max(2, Math.min(14, y + rng.int(-1, 1)));
    }
  },
  flores: (b, rng) => {
    for (let i = 0; i < 4; i++) {
      const x = rng.int(2, 13);
      const y = rng.int(3, 13);
      const c = rng.pick([PAL.bone2, PAL.ember2, PAL.blood3, PAL.steel3]);
      b.set(x, y + 1, PAL.moss0).set(x, y, c).set(x - 1, y, c).set(x + 1, y, c).set(x, y - 1, c).set(x, y, PAL.ember1);
    }
  },
  musgo: (b, rng) => {
    for (let i = 0; i < 20; i++) b.set(rng.int(0, 15), rng.int(0, 15), rng.chance(0.6) ? PAL.moss1 : PAL.moss2);
  },
  huesos: (b, rng) => {
    b.line(4, 10, 9, 8, PAL.bone1).set(3, 10, PAL.bone2).set(4, 11, PAL.bone2).set(10, 8, PAL.bone2);
    b.ellipse(11.5, 11.5, 2, 1.6, PAL.bone1).set(11, 11, PAL.ink).set(12, 11, PAL.ink);
    b.set(rng.int(2, 6), rng.int(3, 5), PAL.bone0);
  },
  grietas: (b, rng, B) => {
    let x = rng.int(3, 12);
    let y = rng.int(1, 4);
    for (let i = 0; i < 11; i++) {
      b.set(x, y, B.ground.colors[0]);
      x += rng.int(-1, 1);
      y += 1;
    }
  },
  sangre: (b, rng) => {
    b.ellipse(8, 9, 4.5, 3, PAL.blood0).ellipse(7, 8.5, 2.5, 1.8, PAL.blood1);
    for (let i = 0; i < 5; i++) b.set(rng.int(2, 13), rng.int(3, 14), PAL.blood0);
  },
  escombros: (b, rng, B) => {
    for (let i = 0; i < 6; i++) {
      const x = rng.int(2, 13);
      const y = rng.int(2, 13);
      b.rect(x, y, 2, 1, B.path[2]).set(x, y + 1, PAL.ink);
    }
  },
};

export function biomeFrames(B, seed = 7331) {
  const frames = Array.from({ length: TILES_PER_BIOME }, () => new PixelBuffer(16, 16).rect(0, 0, 16, 16, PAL.ink));
  frames[T.VOID] = new PixelBuffer(16, 16).rect(0, 0, 16, 16, PAL.ink);
  frames[T.ROCK_TOP] = rockTop(B, seed + 1);
  frames[T.ROCK_TOP_ALT] = rockTop(B, seed + 91);
  frames[T.ROCK_FACE] = rockFace(B, seed + 2);
  frames[T.ROCK_FACE_HI] = rockFace(B, seed + 2, true);
  frames[T.ROCK_FACE_LOW] = rockFace(B, seed + 2, false, false);
  for (let v = 0; v < 3; v++) {
    frames[T.GROUND + v] = groundTile(B, seed + 3, v);
    frames[T.GROUND_DARK + v] = groundTile(B, seed + 3, v, 'dark');
    frames[T.GROUND_LUSH + v] = groundTile(B, seed + 3, v, 'lush');
  }
  frames[T.GROUND_SHADE] = shadeTop(groundTile(B, seed + 3, 0));
  frames[T.TALL_GRASS] = grassTufts(B);
  frames[T.PAVED] = groundTile({ ...B, ground: { style: 'paved', colors: B.path } }, seed + 7, 1);
  frames[T.BRIDGE_H] = bridgeTile(false);
  frames[T.BRIDGE_V] = bridgeTile(true);
  frames[T.STAIRS] = stairsTile(B);
  frames[T.FIELD] = fieldTile(B, false);
  frames[T.FIELD_ALT] = fieldTile(B, true);
  frames[T.WATER_DEEP] = waterTile(B, 15, 0, true);
  (B.decals || ['sangre', 'grietas', 'huesos']).forEach((name, i) => {
    const f = groundTile(B, seed + 20 + i, 0);
    DECALS[name](f, createRng(seed + 40 + i), B);
    frames[T.DECAL + i] = f;
  });
  for (let m = 0; m < 16; m++) {
    frames[T.PATH + m] = pathTile(B, m);
    frames[T.WATER + m] = waterTile(B, m, 0);
  }
  const blank = () => new PixelBuffer(16, 16);
  frames[T.WATER_IN] = blank();
  frames[T.PATH_IN] = blank();
  for (let m = 1; m < 16; m++) {
    frames[T.WATER_IN + m] = innerCorners(m, B.lavaWater ? PAL.ink : B.ground.colors[1], B.lavaWater ? PAL.shade : B.water[2], 7);
    frames[T.PATH_IN + m] = innerCorners(m, B.ground.colors[1], B.path[0], 5);
  }
  return frames;
}

// Frames animados de un bioma: agua (y lava) que ondula, hierba alta que se mece.
export function biomeAnimations(B, base = 0) {
  const anims = [];
  for (let m = 0; m < 16; m++) anims.push({ index: base + T.WATER + m, frames: [0, 1, 2].map((f) => waterTile(B, m, f)) });
  anims.push({ index: base + T.WATER_DEEP, frames: [0, 1, 2].map((f) => waterTile(B, 15, f, true)) });
  anims.push({ index: base + T.TALL_GRASS, frames: [grassTufts(B), grassTufts(B, { sway: 1 }), grassTufts(B), grassTufts(B, { sway: -1 })], slow: true });
  return anims;
}

// Tileset del piso: bioma base en 0..63 y (opcional) bioma del fragmento en 64..127.
// Devuelve siempre las animaciones (la textura solo se crea la primera vez).
export function buildTileset(scene, B, fragmentB = null, key = 'tiles') {
  const fragB = fragmentB ? { ...fragmentB, decals: ['sangre', 'grietas', 'sangre'] } : null;
  if (!scene.textures.exists(key)) {
    const frames = biomeFrames(B);
    if (fragB) frames.push(...biomeFrames(fragB, 9119));
    addGrid(scene, key, frames, TILESET_COLS);
    addStrip(scene, `${key}_grass`, [grassTufts(B, { front: true })]);
  }
  const anims = biomeAnimations(B);
  if (fragB) anims.push(...biomeAnimations(fragB, FRAGMENT_OFFSET));
  return { key, anims };
}
