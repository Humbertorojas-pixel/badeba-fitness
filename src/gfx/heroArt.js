import { PixelBuffer, shadeLayer } from './pixelBuffer.js';
import { PAL } from '../palette.js';
import { itemLook } from '../data/items.js';

// Personaje compuesto por capas: la armadura y el arma equipadas se ven en el mapa y en combate,
// y su rareza cambia el material (hierro, acero, acero ennegrecido con oro, metal sangrante).
export const HERO_W = 24;
export const HERO_H = 32;

export const MATERIALS = {
  comun: { metal: [PAL.stone0, PAL.stone1, PAL.stone2, PAL.stone3], trim: [PAL.rust1, PAL.rust2], blade: [PAL.stone0, PAL.stone2, PAL.stone3, PAL.bone2], glow: null },
  raro: { metal: [PAL.steel0, PAL.steel1, PAL.steel2, PAL.steel3], trim: [PAL.steel2, PAL.steel3], blade: [PAL.steel0, PAL.steel2, PAL.steel3, PAL.bone2], glow: null },
  legendario: { metal: [PAL.ink, PAL.night, PAL.dusk, PAL.stone1], trim: [PAL.ember0, PAL.ember2], blade: [PAL.night, PAL.dusk, PAL.stone2, PAL.ember2], glow: PAL.ember2 },
  unico: { metal: [PAL.ink, PAL.blood0, PAL.blood1, PAL.blood2], trim: [PAL.blood2, PAL.blood3], blade: [PAL.blood0, PAL.blood1, PAL.blood3, PAL.ember2], glow: PAL.blood3 },
};

// Tela de acento (capas, tabardos) según la rareza de la armadura.
const ACCENT = {
  comun: [PAL.blood0, PAL.blood0, PAL.blood1, PAL.blood2],
  raro: [PAL.night, PAL.steel0, PAL.steel1, PAL.steel2],
  legendario: [PAL.ink, PAL.night, PAL.shade, PAL.dusk],
  unico: [PAL.blood0, PAL.blood1, PAL.blood2, PAL.blood3],
};

const ARMOR = {
  ninguna: { body: 'tunic' },
  harapos: { body: 'tunic', rags: true, cape: 'tattered' },
  cuero: { body: 'leather', cape: 'cloak', hood: 'down' },
  habito: { body: 'robe', hood: 'up' },
  cota: { body: 'chain', tabard: true },
  coraza: { body: 'plate', pauldrons: 1, cape: 'cape' },
  placas: { body: 'plate', pauldrons: 2, cape: 'cape', helmet: true, greaves: true },
};

const WOOD = [PAL.rust0, PAL.rust0, PAL.rust1, PAL.rust2];
const LEATHER = [PAL.ink, PAL.rust0, PAL.rust1, PAL.rust2];
const SKIN = [PAL.skin0, PAL.skin0, PAL.skin1, PAL.skin1];
const HAIR = [PAL.night, PAL.dusk, PAL.stone0, PAL.stone2];
const PANTS = [PAL.ink, PAL.night, PAL.shade, PAL.dusk];

// Aspecto del personaje a partir de su equipo.
export function lookFromEquipment(eq = {}) {
  return {
    armor: itemLook(eq.armadura) || 'ninguna',
    armorRarity: eq.armadura?.rarity || 'comun',
    weapon: itemLook(eq.arma),
    weaponRarity: eq.arma?.rarity || 'comun',
  };
}

export function lookSignature(look) {
  return `${look.armor}-${look.armorRarity}-${look.weapon || 'x'}-${look.weaponRarity}${look.npc ? `-${look.npc}` : ''}`;
}

function resolve(look) {
  const A = ARMOR[look.armor] || ARMOR.ninguna;
  const ar = look.armorRarity || 'comun';
  const M = MATERIALS[ar];
  const c = look.colors || {};
  const accent = c.accent || ACCENT[ar];
  const cloth = c.cloth || {
    tunic: A.rags ? [PAL.rust0, PAL.rust0, PAL.rust1, PAL.rust2] : [PAL.stone1, PAL.bone0, PAL.bone1, PAL.bone2],
    leather: [PAL.rust0, PAL.rust1, PAL.rust2, PAL.ember0],
    robe: { comun: [PAL.ink, PAL.night, PAL.shade, PAL.dusk], raro: [PAL.night, PAL.steel0, PAL.steel1, PAL.steel2], legendario: [PAL.ink, PAL.night, PAL.shade, PAL.dusk], unico: [PAL.blood0, PAL.blood0, PAL.blood1, PAL.blood2] }[ar],
    chain: M.metal,
    plate: M.metal,
  }[A.body];
  const cloak = c.cloak || (A.cape === 'tattered' ? (ar === 'comun' ? [PAL.night, PAL.shade, PAL.dusk, PAL.stone0] : accent)
    : A.cape === 'cloak' ? (ar === 'comun' ? [PAL.night, PAL.moss0, PAL.moss1, PAL.moss2] : accent) : accent);
  const P = {
    skin: SKIN,
    hair: c.hair || HAIR,
    cloth,
    cloak,
    accent,
    metal: M.metal,
    trim: ar === 'comun' && A.body !== 'plate' && A.body !== 'chain' ? [PAL.rust1, PAL.rust2] : M.trim,
    pants: PANTS,
    boots: LEATHER,
    glow: M.glow,
  };
  const WM = MATERIALS[look.weaponRarity || 'comun'];
  return { A, P, W: look.weapon, WM, rarity: ar };
}

// Silueta plana sombreada por bandas (luz arriba-izquierda), pegada sobre `out`.
function shade(out, ramp, draw, depth = 1) {
  const l = new PixelBuffer(out.w, out.h);
  draw(l);
  out.paste(shadeLayer(l, ramp, { shadowDepth: depth }), 0, 0);
  return out;
}

// Borde inferior en zigzag (tela rasgada).
function zig(x0, x1, y, depth, step = 2) {
  const pts = [];
  for (let x = x1, k = 0; x >= x0; x -= step, k++) pts.push([x, y - (k % 2 ? depth : 0)]);
  return pts;
}

// ---------------------------------------------------------------- mapa (24x32)

function owWeapon(b, L, view, layer) {
  const { W: kind, WM } = L;
  if (!kind) return;
  const blade = WM.blade;
  const metal = WM.metal;
  const glow = (x, y) => { if (WM.glow) b.set(x, y, WM.glow); };
  if (view === 'down') {
    if (layer === 'back') {
      if (kind === 'espada') {
        shade(b, blade, (l) => l.line(5, 8, 6, 12, '#', 2));
        shade(b, metal, (l) => l.line(3, 13, 9, 11, '#'));
        b.set(5, 7, metal[3]);
        glow(5, 9);
      } else if (kind === 'mandoble') {
        shade(b, blade, (l) => l.poly([[4, 11], [9, 9], [23, 27], [20, 31]], '#'), 1);
        shade(b, LEATHER, (l) => l.line(4, 4, 6, 9, '#', 2));
        shade(b, metal, (l) => l.line(2, 10, 9, 8, '#', 1).rect(3, 9, 6, 2, '#'));
        b.set(4, 3, metal[3]).line(20, 25, 22, 28, blade[3]);
        glow(21, 27);
      } else if (kind === 'hacha') {
        shade(b, WOOD, (l) => l.line(6, 4, 8, 14, '#'));
        shade(b, blade, (l) => l.poly([[1, 3], [6, 4], [6, 8], [1, 10]], '#'));
        b.set(1, 5, blade[3]).set(1, 7, blade[3]);
        glow(2, 6);
      } else if (kind === 'lanza') {
        shade(b, WOOD, (l) => l.line(5, 4, 19, 31, '#'));
        shade(b, blade, (l) => l.poly([[3, 0], [6, 3], [5, 6], [3, 5]], '#'));
        glow(4, 2);
      } else if (kind === 'guadana') {
        shade(b, WOOD, (l) => l.line(19, 3, 20, 31, '#'));
        shade(b, blade, (l) => {
          for (let t = 0; t <= 1; t += 0.05) l.ellipse(19 - t * 13, 3 - Math.sin(t * Math.PI) * 2 + t * 3, 1.4 - t * 0.6, 1.2, '#');
        });
        glow(12, 2);
      }
    } else if (kind === 'daga') {
      shade(b, blade, (l) => l.rect(15, 24, 1, 4, '#'));
      b.set(15, 23, metal[2]).set(14, 23, metal[1]).set(16, 23, metal[1]).set(15, 22, LEATHER[2]);
    } else if (kind === 'maza') {
      b.line(6, 24, 6, 27, WOOD[2]);
      shade(b, metal, (l) => l.ellipse(6, 28.5, 1.8, 1.8, '#'));
      b.set(4, 28, metal[3]).set(8, 28, metal[1]).set(6, 30, metal[1]);
    }
    return;
  }
  if (view === 'up') {
    if (layer !== 'front') return;
    if (kind === 'espada') {
      shade(b, blade, (l) => l.line(16, 15, 9, 27, '#', 2));
      shade(b, metal, (l) => l.line(15, 14, 20, 16, '#'));
      shade(b, LEATHER, (l) => l.line(18, 11, 19, 14, '#', 2));
      b.set(19, 10, metal[3]);
      glow(12, 22);
    } else if (kind === 'mandoble') {
      shade(b, blade, (l) => l.poly([[15, 10], [19, 11], [9, 31], [5, 29]], '#'), 1);
      shade(b, metal, (l) => l.rect(14, 8, 8, 2, '#'));
      shade(b, LEATHER, (l) => l.line(18, 3, 19, 7, '#', 2));
      b.set(19, 2, metal[3]);
      glow(10, 25);
    } else if (kind === 'hacha') {
      shade(b, WOOD, (l) => l.line(17, 5, 9, 25, '#'));
      shade(b, blade, (l) => l.poly([[17, 2], [22, 4], [22, 10], [17, 9]], '#'));
      glow(21, 6);
    } else if (kind === 'lanza') {
      shade(b, WOOD, (l) => l.line(19, 3, 5, 31, '#'));
      shade(b, blade, (l) => l.poly([[21, 0], [21, 4], [18, 5], [18, 2]], '#'));
      glow(20, 1);
    } else if (kind === 'guadana') {
      shade(b, WOOD, (l) => l.line(5, 3, 4, 31, '#'));
      shade(b, blade, (l) => {
        for (let t = 0; t <= 1; t += 0.05) l.ellipse(5 + t * 13, 3 - Math.sin(t * Math.PI) * 2 + t * 3, 1.4 - t * 0.6, 1.2, '#');
      });
      glow(12, 2);
    } else if (kind === 'daga') {
      shade(b, blade, (l) => l.rect(8, 24, 1, 3, '#'));
      b.set(8, 23, metal[2]);
    } else if (kind === 'maza') {
      b.line(17, 24, 17, 27, WOOD[2]);
      shade(b, metal, (l) => l.ellipse(17, 28.5, 1.8, 1.8, '#'));
    }
    return;
  }
  // Perfil (mirando a la izquierda): el arma cuelga a la espalda, a la derecha del cuerpo.
  if (layer === 'back') {
    if (kind === 'espada') {
      shade(b, blade, (l) => l.line(16, 12, 20, 25, '#', 2));
      shade(b, metal, (l) => l.line(14, 12, 19, 10, '#'));
      shade(b, LEATHER, (l) => l.line(15, 7, 16, 10, '#'));
      glow(19, 22);
    } else if (kind === 'mandoble') {
      shade(b, blade, (l) => l.poly([[15, 10], [19, 10], [22, 30], [18, 31]], '#'), 1);
      shade(b, metal, (l) => l.rect(13, 8, 8, 2, '#'));
      shade(b, LEATHER, (l) => l.line(16, 3, 17, 7, '#', 2));
      b.set(16, 2, metal[3]);
      glow(20, 27);
    } else if (kind === 'hacha') {
      shade(b, WOOD, (l) => l.line(16, 5, 19, 25, '#'));
      shade(b, blade, (l) => l.poly([[16, 2], [22, 1], [22, 8], [17, 8]], '#'));
      glow(21, 3);
    } else if (kind === 'lanza') {
      shade(b, WOOD, (l) => l.line(14, 4, 21, 31, '#'));
      shade(b, blade, (l) => l.poly([[13, 0], [16, 3], [15, 6], [13, 5]], '#'));
      glow(14, 2);
    } else if (kind === 'guadana') {
      shade(b, WOOD, (l) => l.line(17, 3, 18, 31, '#'));
      shade(b, blade, (l) => {
        for (let t = 0; t <= 1; t += 0.05) l.ellipse(17 - t * 14, 3 - Math.sin(t * Math.PI) * 2 + t * 3, 1.4 - t * 0.6, 1.2, '#');
      });
      glow(9, 1);
    }
  } else if (kind === 'daga') {
    shade(b, blade, (l) => l.rect(11, 24, 1, 3, '#'));
    b.set(11, 23, metal[2]);
  } else if (kind === 'maza') {
    b.line(12, 24, 12, 27, WOOD[2]);
    shade(b, metal, (l) => l.ellipse(12, 28.5, 1.8, 1.8, '#'));
  }
}

function sleeveRamp(L) {
  return L.A.body === 'plate' || L.A.body === 'chain' ? L.P.metal : L.P.cloth;
}

function chainTexture(b, P, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x + y) % 2 === 0 && b.get(x, y) === P.metal[2]) b.set(x, y, P.metal[1]);
}

// Torso de frente o de espaldas (x0..x1 de ancho 10, y 18..25).
function owTorso(b, L, back) {
  const { A, P } = L;
  if (A.body === 'robe') {
    shade(b, P.cloth, (l) => l.poly([[7, 18], [16, 18], [18, 30], [5, 30]], '#'));
    b.line(9, 24, 8, 29, P.cloth[0]).line(14, 24, 15, 29, P.cloth[0]);
    b.rect(7, 23, 10, 1, L.rarity === 'comun' ? PAL.bone0 : P.trim[1]);
    if (!back) b.set(12, 24, PAL.bone0).set(12, 25, PAL.bone0);
    return;
  }
  if (A.body === 'plate') {
    shade(b, P.metal, (l) => l.rect(7, 18, 10, 7, '#'));
    if (!back) b.line(11, 19, 11, 23, P.metal[3]).line(12, 19, 12, 23, P.metal[1]);
    else b.line(12, 19, 12, 23, P.metal[0]);
    if (L.rarity !== 'comun') b.rect(7, 18, 10, 1, P.trim[1]);
    b.rect(7, 24, 10, 1, P.boots[1]);
    shade(b, P.metal, (l) => l.rect(7, 25, 10, 2, '#'));
    b.set(9, 25, P.metal[0]).set(12, 25, P.metal[0]).set(15, 25, P.metal[0]);
    return;
  }
  if (A.body === 'chain') {
    shade(b, P.metal, (l) => l.rect(7, 18, 10, 9, '#'));
    chainTexture(b, P, 7, 18, 16, 26);
    if (!back) {
      shade(b, P.accent, (l) => l.rect(10, 19, 4, 9, '#'));
      b.set(11, 21, P.trim[1]).set(12, 21, P.trim[1]).set(11, 22, P.trim[0]).set(12, 22, P.trim[0]);
    }
    b.rect(7, 24, 10, 1, P.boots[1]).set(12, 24, P.trim[1]);
    return;
  }
  if (A.body === 'leather') {
    shade(b, P.cloth, (l) => l.rect(7, 18, 10, 8, '#'));
    b.line(7, 18, 15, 23, P.cloth[0]);
    b.rect(7, 23, 10, 1, PAL.ink).set(back ? 12 : 11, 23, P.trim[1]);
    if (L.rarity !== 'comun') for (const [x, y] of [[8, 20], [15, 20], [8, 25], [15, 25]]) b.set(x, y, P.trim[1]);
    return;
  }
  // Túnica (harapos o ropa simple)
  shade(b, P.cloth, (l) => l.poly(A.rags ? [[7, 18], [16, 18], [17, 25], ...zig(6, 17, 27, 1)] : [[7, 18], [16, 18], [17, 26], [6, 26]], '#'));
  b.rect(7, 23, 10, 1, A.rags ? PAL.rust0 : PAL.stone0);
  if (A.rags) b.set(9, 20, P.cloth[0]).set(10, 21, P.cloth[0]).set(14, 19, P.cloth[3]);
}

function owLegsFront(b, L, frame) {
  const { A, P } = L;
  const lift = frame === 1 ? 'l' : frame === 2 ? 'r' : null;
  for (const side of ['l', 'r']) {
    const x = side === 'l' ? 8 : 13;
    const bottom = lift === side ? 30 : 31;
    if (A.body !== 'robe') shade(b, A.greaves ? P.metal : P.pants, (l) => l.rect(x, 25, 3, bottom - 26), 1);
    shade(b, A.greaves ? P.metal : P.boots, (l) => l.rect(x, bottom - 2, 3, 2, '#').set(side === 'l' ? x - 1 : x + 3, bottom - 1, '#'), 1);
  }
}

function owArms(b, L, frame, back) {
  const { A, P } = L;
  const swing = frame === 1 ? [1, -1] : frame === 2 ? [-1, 1] : [0, 0];
  const ramp = sleeveRamp(L);
  [[5, swing[0]], [17, swing[1]]].forEach(([x, dy]) => {
    shade(b, ramp, (l) => l.rect(x, 19 + dy, 2, 5, '#'), 1);
    const hand = A.body === 'plate' ? P.metal[2] : P.skin[2];
    b.rect(x, 24 + dy, 2, 2, hand).set(back ? x : x + 1, 25 + dy, A.body === 'plate' ? P.metal[1] : P.skin[0]);
  });
  if (A.pauldrons) {
    const r = A.pauldrons === 2 ? 3 : 2.4;
    shade(b, P.metal, (l) => l.ellipse(6.3, 19.2, r, 2.1, '#').ellipse(17.7, 19.2, r, 2.1, '#'), 1);
    if (L.rarity !== 'comun') b.set(6, 18, P.trim[1]).set(17, 18, P.trim[1]);
  }
}

function owHeadFront(b, L) {
  const { A, P } = L;
  if (A.helmet) {
    shade(b, P.metal, (l) => l.ellipse(12, 12.5, 5.6, 5.6, '#').rect(7, 12, 11, 6, '#'), 1);
    b.rect(8, 13, 8, 1, PAL.ink);
    if (P.glow) b.set(9, 13, P.glow).set(14, 13, P.glow);
    b.set(10, 15, P.metal[0]).set(12, 15, P.metal[0]).set(14, 15, P.metal[0]);
    b.line(12, 7, 12, 11, P.metal[3]);
    if (L.rarity !== 'comun') b.rect(11, 5, 2, 3, P.accent[3]).set(11, 4, P.accent[2]);
    return;
  }
  if (A.hood === 'up') {
    shade(b, P.cloth, (l) => l.ellipse(12, 12.5, 6, 6, '#').rect(6, 13, 13, 6, '#').set(12, 5, '#'), 1);
    b.ellipse(12, 15, 3.6, 3.4, PAL.ink);
    b.rect(10, 16, 4, 2, P.skin[0]);
    b.set(10, 15, P.glow || P.skin[2]).set(13, 15, P.glow || P.skin[2]);
    return;
  }
  shade(b, P.hair, (l) => l.ellipse(12, 12, 5.8, 5.4, '#'), 1);
  for (const [x, y] of [[6, 9], [5, 12], [18, 9], [19, 12], [9, 6], [12, 5], [15, 6]]) b.set(x, y, P.hair[1]);
  b.rect(8, 12, 8, 5, P.skin[2]);
  b.set(8, 16, P.skin[0]).set(15, 16, P.skin[0]).rect(9, 17, 6, 1, P.skin[0]);
  for (const x of [8, 9, 11, 12, 14, 15]) b.set(x, 12, P.hair[1]);
  b.set(8, 13, P.hair[1]).set(12, 13, P.hair[1]).set(15, 13, P.hair[1]);
  b.rect(9, 14, 1, 2, PAL.ink).rect(14, 14, 1, 2, PAL.ink);
  b.set(10, 8, P.hair[3]).set(11, 8, P.hair[3]).set(9, 9, P.hair[3]);
  if (A.hood === 'down') shade(b, P.cloak, (l) => l.ellipse(12, 18.5, 5.5, 1.8, '#'), 1);
}

function owHeadBack(b, L) {
  const { A, P } = L;
  if (A.helmet) {
    shade(b, P.metal, (l) => l.ellipse(12, 12.5, 5.6, 5.6, '#').rect(7, 12, 11, 6, '#'), 1);
    b.line(12, 7, 12, 17, P.metal[1]);
    if (L.rarity !== 'comun') b.rect(11, 5, 2, 3, P.accent[3]);
    return;
  }
  if (A.hood === 'up') {
    shade(b, P.cloth, (l) => l.ellipse(12, 12.5, 6, 6, '#').rect(6, 13, 13, 6, '#').poly([[10, 16], [14, 16], [12, 22]], '#'), 1);
    b.line(12, 8, 12, 19, P.cloth[1]);
    return;
  }
  shade(b, P.hair, (l) => l.ellipse(12, 12, 5.8, 5.6, '#').poly([[7, 14], [17, 14], [15, 19], [9, 19]], '#'), 1);
  for (const [x, y] of [[6, 9], [5, 12], [18, 9], [19, 12], [9, 6], [12, 5], [15, 6], [8, 18], [16, 18]]) b.set(x, y, P.hair[1]);
  b.line(10, 10, 9, 17, P.hair[0]).line(14, 10, 15, 17, P.hair[0]);
  b.set(11, 8, P.hair[3]).set(12, 8, P.hair[3]);
  if (A.hood === 'down') shade(b, P.cloak, (l) => l.ellipse(12, 19, 6, 2.4, '#'), 1);
}

function owCapeBehind(b, L) {
  const { A, P } = L;
  if (!A.cape) return;
  shade(b, P.cloak, (l) => l.poly([[6, 19], [17, 19], [19, 27], ...(A.cape === 'tattered' ? zig(4, 19, 29, 2) : [[19, 29], [4, 29]]), [4, 27]], '#'), 1);
}

function drawDown(L, frame) {
  const b = new PixelBuffer(HERO_W, HERO_H);
  owWeapon(b, L, 'down', 'back');
  owCapeBehind(b, L);
  owLegsFront(b, L, frame);
  owTorso(b, L, false);
  owArms(b, L, frame, false);
  owHeadFront(b, L);
  owWeapon(b, L, 'down', 'front');
  return b.outline(PAL.ink);
}

function drawUp(L, frame) {
  const b = new PixelBuffer(HERO_W, HERO_H);
  const { A, P } = L;
  owLegsFront(b, L, frame);
  owTorso(b, L, true);
  owArms(b, L, frame, true);
  if (A.cape) {
    shade(b, P.cloak, (l) => l.poly([[7, 18], [16, 18], [18, 27], ...(A.cape === 'tattered' ? zig(5, 18, 29, 2) : [[18, 29], [5, 29]]), [5, 27]], '#'), 2);
    b.line(10, 21, 9, 28, P.cloak[1]).line(14, 21, 15, 28, P.cloak[1]);
  }
  owWeapon(b, L, 'up', 'front');
  owHeadBack(b, L);
  return b.outline(PAL.ink);
}

function drawLeft(L, frame) {
  const b = new PixelBuffer(HERO_W, HERO_H);
  const { A, P } = L;
  owWeapon(b, L, 'left', 'back');
  if (A.cape) {
    const f = frame === 0 ? 0 : 1;
    shade(b, P.cloak, (l) => l.poly([[12, 18], [16, 18], [19 + f, 27], ...(A.cape === 'tattered' ? zig(12, 20 + f, 29, 2) : [[20 + f, 29], [12, 29]])], '#'), 1);
  }
  // Piernas: la lejana más oscura; en los pasos se separan.
  const legs = { 0: [[12, 11]], 1: [[15, 8]], 2: [[9, 13]] }[frame][0];
  const [far, near] = legs;
  const farRamp = A.greaves ? [P.metal[0], P.metal[0], P.metal[1], P.metal[2]] : [PAL.ink, PAL.ink, P.pants[1], P.pants[2]];
  const legRamp = A.greaves ? P.metal : P.pants;
  const bootRamp = A.greaves ? P.metal : P.boots;
  if (A.body !== 'robe') {
    shade(b, farRamp, (l) => l.rect(far, 25, 3, 4, '#'), 1);
    shade(b, legRamp, (l) => l.rect(near, 25, 3, 4, '#'), 1);
  }
  shade(b, farRamp === legRamp ? bootRamp : [PAL.ink, PAL.ink, bootRamp[1], bootRamp[2]], (l) => l.rect(far - 1, 29, 4, 2, '#'), 1);
  shade(b, bootRamp, (l) => l.rect(near - 1, 29, 4, 2, '#'), 1);
  const swing = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  // Brazo lejano, torso, brazo cercano.
  shade(b, [PAL.ink, PAL.ink, sleeveRamp(L)[1], sleeveRamp(L)[2]], (l) => l.rect(14 - swing, 19, 2, 5, '#'), 1);
  if (A.body === 'robe') {
    shade(b, P.cloth, (l) => l.poly([[9, 18], [15, 18], [16, 30], [8, 30]], '#'));
    b.rect(9, 23, 7, 1, L.rarity === 'comun' ? PAL.bone0 : P.trim[1]);
  } else if (A.body === 'plate' || A.body === 'chain') {
    shade(b, P.metal, (l) => l.rect(9, 18, 7, A.body === 'chain' ? 9 : 7, '#'));
    if (A.body === 'chain') {
      chainTexture(b, P, 9, 18, 15, 26);
      shade(b, P.accent, (l) => l.rect(9, 19, 2, 8, '#'));
    } else {
      shade(b, P.metal, (l) => l.rect(9, 25, 7, 2, '#'));
      if (L.rarity !== 'comun') b.rect(9, 18, 7, 1, P.trim[1]);
    }
    b.rect(9, 24, 7, 1, P.boots[1]);
  } else {
    shade(b, P.cloth, (l) => l.poly(A.rags ? [[9, 18], [15, 18], [16, 25], ...zig(8, 16, 27, 1)] : [[9, 18], [15, 18], [16, 26], [8, 26]], '#'));
    b.rect(9, 23, 7, 1, A.body === 'leather' ? PAL.ink : A.rags ? PAL.rust0 : PAL.stone0);
  }
  shade(b, sleeveRamp(L), (l) => l.rect(11 + swing, 19, 2, 5, '#'), 1);
  b.rect(11 + swing, 24, 2, 2, A.body === 'plate' ? P.metal[2] : P.skin[2]);
  if (A.pauldrons) shade(b, P.metal, (l) => l.ellipse(12, 19.2, A.pauldrons === 2 ? 3.2 : 2.6, 2.1, '#'), 1);
  // Cabeza de perfil.
  if (A.helmet) {
    shade(b, P.metal, (l) => l.ellipse(12, 12.5, 5.6, 5.6, '#').rect(7, 12, 11, 6, '#'), 1);
    b.rect(6, 13, 5, 1, PAL.ink);
    if (P.glow) b.set(7, 13, P.glow);
    if (L.rarity !== 'comun') b.rect(12, 5, 2, 3, P.accent[3]).set(14, 5, P.accent[2]);
  } else if (A.hood === 'up') {
    shade(b, P.cloth, (l) => l.ellipse(12.5, 12.5, 6, 6, '#').rect(7, 13, 12, 6, '#').set(14, 5, '#'), 1);
    b.ellipse(8.2, 14.8, 2.9, 3.4, PAL.ink);
    b.rect(7, 16, 2, 2, P.skin[0]).set(7, 14, P.glow || P.skin[2]);
  } else {
    shade(b, P.hair, (l) => l.ellipse(12.5, 12, 5.6, 5.4, '#').poly([[13, 14], [18, 12], [17, 18], [13, 18]], '#'), 1);
    for (const [x, y] of [[16, 6], [18, 8], [19, 11], [18, 15], [12, 5], [9, 6]]) b.set(x, y, P.hair[1]);
    b.rect(7, 12, 5, 5, P.skin[2]).set(6, 14, P.skin[2]).rect(8, 17, 4, 1, P.skin[0]).set(11, 14, P.skin[0]);
    b.rect(7, 12, 4, 1, P.hair[1]).set(7, 13, P.hair[1]).set(10, 13, P.hair[1]);
    b.rect(8, 14, 1, 2, PAL.ink);
    b.set(13, 8, P.hair[3]).set(14, 9, P.hair[3]);
    if (A.hood === 'down') shade(b, P.cloak, (l) => l.ellipse(13, 18.5, 4.5, 1.8, '#'), 1);
  }
  owWeapon(b, L, 'left', 'front');
  return b.outline(PAL.ink);
}

export const DIR_FRAME_BASE = { down: 0, up: 3, left: 6, right: 9 };

// 12 frames: abajo 0-2, arriba 3-5, izquierda 6-8, derecha 9-11 (espejo).
export function buildHeroOverworld(look) {
  const L = resolve(look);
  const frames = [];
  for (const fn of [drawDown, drawUp, drawLeft]) for (let f = 0; f < 3; f++) frames.push(fn(L, f));
  for (let f = 0; f < 3; f++) frames.push(drawLeft(L, f).flipH());
  return frames;
}

// ---------------------------------------------------------------- combate (64x64, de espaldas)

function bbLimb(l, x0, y0, x1, y1, w0, w1 = w0) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = w0 + (w1 - w0) * t;
    l.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, '#');
  }
  return l;
}

function sparkle(b, WM, pts) {
  if (!WM.glow) return;
  for (const [x, y] of pts) b.set(x, y, WM.glow).set(x + 1, y, PAL.bone2).set(x - 1, y, WM.glow).set(x, y - 1, WM.glow).set(x, y + 1, WM.glow);
}

// Dónde queda la mano derecha según el arma (null: el arma descansa en el hombro o la espalda).
const HAND = { espada: [56, 52], daga: [56, 52], lanza: [56, 46], guadana: [56, 44] };

function bbWeapon(out, L, layer) {
  const { W: kind, WM } = L;
  if (!kind) return;
  const blade = WM.blade;
  const metal = WM.metal;
  if (layer === 'behind') {
    if (kind === 'lanza') {
      shade(out, WOOD, (l) => l.rect(55, 10, 3, 54, '#'), 1);
      shade(out, blade, (l) => l.poly([[56.5, 0], [61, 9], [56.5, 15], [52, 9]], '#'), 2);
      out.line(56, 2, 56, 12, blade[3]);
      shade(out, metal, (l) => l.rect(54, 14, 5, 3, '#'), 1);
      sparkle(out, WM, [[58, 6]]);
    } else if (kind === 'guadana') {
      shade(out, WOOD, (l) => bbLimb(l, 60, 64, 47, 3, 1.5), 1);
    }
    return;
  }
  if (kind === 'mandoble') {
    const bl = shadeLayer(new PixelBuffer(64, 64).poly([[2, 58], [10, 64], [50, 18], [43, 12]], '#'), blade, { shadowDepth: 2 });
    for (const [x, y] of [[22, 42], [30, 33], [15, 52]]) bl.set(x, y, blade[0]).set(x + 1, y - 1, blade[0]);
    out.paste(bl, 0, 0);
    shade(out, metal, (l) => l.poly([[40, 16], [45, 10], [53, 18], [48, 23]], '#'), 1);
    const grip = shadeLayer(new PixelBuffer(64, 64).poly([[47, 11], [55, 2], [58, 5], [50, 14]], '#'), LEATHER, { shadowDepth: 1 });
    for (let i = 0; i < 4; i++) grip.set(49 + i * 2, 11 - i * 2, PAL.rust0);
    out.paste(grip, 0, 0);
    out.ellipse(57, 3, 1.8, 1.8, metal[2]);
    sparkle(out, WM, [[28, 36], [14, 52]]);
  } else if (kind === 'espada') {
    shade(out, blade, (l) => l.poly([[54, 47], [58, 48], [62, 12], [60, 10]], '#'), 1);
    out.line(56, 45, 61, 13, blade[3]);
    shade(out, metal, (l) => l.poly([[49, 47], [62, 50], [62, 52], [49, 49]], '#'), 1);
    sparkle(out, WM, [[60, 18]]);
  } else if (kind === 'daga') {
    shade(out, blade, (l) => l.poly([[55, 47], [58, 47], [59, 35], [57, 33]], '#'), 1);
    shade(out, metal, (l) => l.rect(52, 47, 9, 2, '#'), 1);
    sparkle(out, WM, [[58, 38]]);
  } else if (kind === 'hacha' || kind === 'maza') {
    shade(out, WOOD, (l) => bbLimb(l, 38, 50, 55, 10, 1.6), 1);
    if (kind === 'hacha') {
      shade(out, blade, (l) => l.poly([[50, 6], [58, 0], [63, 6], [63, 16], [58, 20], [52, 14]], '#'), 2);
      out.line(62, 5, 62, 16, blade[3]).line(61, 3, 61, 4, blade[3]);
      shade(out, metal, (l) => l.rect(52, 8, 5, 6, '#'), 1);
      sparkle(out, WM, [[60, 10]]);
    } else {
      shade(out, metal, (l) => l.ellipse(56, 9, 6.5, 6.5, '#'), 3);
      for (const [x, y, dx, dy] of [[56, 1, 0, -1], [63, 9, 1, 0], [49, 9, -1, 0], [61, 3, 1, -1], [51, 3, -1, -1], [61, 15, 1, 1]]) out.set(x + dx, y + dy, metal[3]).set(x, y, metal[2]);
      out.set(54, 6, metal[3]).set(55, 5, metal[3]);
      sparkle(out, WM, [[57, 12]]);
    }
  } else if (kind === 'guadana') {
    shade(out, blade, (l) => {
      for (let t = 0; t <= 1; t += 0.01) {
        const x = 47 - t * 40;
        const y = 4 + Math.sin(t * Math.PI * 0.9) * -2 + t * t * 16;
        l.ellipse(x, y, 3.2 - t * 2.2, 2.6 - t * 1.6, '#');
      }
    }, 2);
    for (let t = 0.05; t <= 0.9; t += 0.01) out.set(Math.round(47 - t * 40), Math.round(4 + Math.sin(t * Math.PI * 0.9) * -2 + t * t * 16 + 2.2 - t * 1.5), blade[3]);
    shade(out, metal, (l) => l.rect(44, 2, 6, 5, '#'), 1);
    sparkle(out, WM, [[28, 5], [12, 16]]);
  }
}

// Melena revuelta vista desde atrás: mechones curvos que nacen de la coronilla y se barren
// hacia la derecha; los de la nuca caen sobre el cuello.
const LOCKS = [
  [20, 1, 4.5], [29, -1, 5], [38, 0, 5], [47, 5, 4.5], [12, 9, 4], [53, 13, 4],
  [9, 20, 3.8], [56, 23, 3.5], [14, 30, 3.5], [23, 34, 3.5], [32, 36, 3.8], [41, 35, 3.5], [49, 30, 3.2],
];

function lockPoint(tx, ty, t) {
  const cx = 32;
  const cy = 18;
  const x0 = cx + (tx - cx) * 0.3;
  const y0 = cy + (ty - cy) * 0.3;
  const bend = 4 * Math.sin(t * Math.PI);
  return [x0 + (tx - x0) * t + bend * 0.8, y0 + (ty - y0) * t - bend * 0.3];
}

function bbHair(out, P) {
  const hair = new PixelBuffer(64, 64).ellipse(32, 19, 10.5, 10, '#');
  for (const [tx, ty, r] of LOCKS) {
    for (let t = 0; t <= 1; t += 0.04) {
      const [x, y] = lockPoint(tx, ty, t);
      const rr = r * (1 - t) + 0.4;
      hair.ellipse(x, y, rr, rr, '#');
    }
  }
  const shaded = shadeLayer(hair, P.hair, { shadowDepth: 2 });
  // Separación entre mechones y brillos en los de arriba a la izquierda.
  for (const [tx, ty] of LOCKS) {
    let prev = null;
    for (let t = 0.1; t <= 0.8; t += 0.05) {
      const [x, y] = lockPoint(tx, ty, t);
      const off = [Math.round(x + (ty < 10 ? 2 : 1)), Math.round(y + 1)];
      if (!prev || prev[0] !== off[0] || prev[1] !== off[1]) shaded.set(off[0], off[1], P.hair[0]);
      prev = off;
    }
  }
  for (const [tx, ty] of LOCKS.slice(0, 5)) {
    for (let t = 0.2; t <= 0.55; t += 0.08) {
      const [x, y] = lockPoint(tx, ty, t);
      shaded.set(Math.round(x - 1), Math.round(y - 1), P.hair[3]);
    }
  }
  out.paste(shaded, 0, 0);
}

export function buildHeroBack(look) {
  const L = resolve(look);
  const { A, P, W: kind } = L;
  const out = new PixelBuffer(64, 64);
  const hand = HAND[kind];
  const arm = sleeveRamp(L);
  const skinHand = A.body === 'plate' ? P.metal : [P.skin[0], P.skin[0], P.skin[2], P.skin[3]];
  bbWeapon(out, L, 'behind');

  // Brazos a los costados (el derecho sostiene el arma si es de mano).
  const rightArm = () => shade(out, arm, (l) => bbLimb(l, 55, 38, hand ? hand[0] - 1 : 58, hand ? hand[1] - 3 : 62, 5.5, 4.2), 2);
  // Bajo una capa los brazos quedan ocultos; solo asoma el que empuña el arma.
  if (!A.cape) {
    shade(out, arm, (l) => bbLimb(l, 9, 38, 6, 62, 5.5, 4.2), 2);
    if (!hand) rightArm();
  }

  // Espalda: forma de trapecio desde el cuello hasta los hombros.
  const back = [[22, 30], [42, 30], [52, 35], [56, 64], [8, 64], [12, 35]];
  if (A.body === 'robe') {
    shade(out, P.cloth, (l) => l.poly([[22, 30], [42, 30], [54, 35], [60, 64], [4, 64], [10, 35]], '#'), 3);
    for (const [x0, x1] of [[20, 14], [32, 32], [44, 50]]) out.line(x0, 42, x1, 63, P.cloth[1]);
    out.rect(10, 56, 44, 2, L.rarity === 'comun' ? PAL.bone0 : P.trim[1]);
  } else if (!A.cape) {
    const ramp = A.body === 'chain' ? P.metal : P.cloth;
    shade(out, ramp, (l) => l.poly(back, '#'), 3);
    if (A.body === 'chain') {
      chainTexture(out, P, 4, 30, 60, 63);
      out.rect(9, 56, 46, 3, P.boots[1]).rect(30, 56, 4, 3, P.trim[1]);
    } else if (A.body === 'leather') {
      shade(out, LEATHER, (l) => l.poly([[46, 32], [51, 35], [18, 60], [13, 57]], '#'), 1);
      out.rect(9, 56, 46, 2, PAL.ink).rect(28, 44, 4, 4, P.trim[1]);
      if (L.rarity !== 'comun') for (const [x, y] of [[16, 40], [48, 40], [16, 50], [48, 50]]) out.set(x, y, P.trim[1]);
    } else {
      for (const x of [20, 30, 40]) out.line(x, 38, x + (x > 30 ? 2 : -2), 54, P.cloth[1]);
      out.rect(9, 56, 46, 2, A.rags ? PAL.rust0 : PAL.stone0);
    }
  } else if (A.body === 'plate') {
    shade(out, P.metal, (l) => l.poly(back, '#'), 3);
  }

  // Capa, capa con capucha caída o harapos.
  if (A.cape) {
    const hem = A.cape === 'tattered' ? zig(1, 63, 64, 5, 4) : [[63, 64], [1, 64]];
    const cape = new PixelBuffer(64, 64).poly([[22, 30], [42, 30], [54, 35], [60, 42], ...hem, [4, 42], [10, 35]], '#');
    if (A.cape !== 'tattered') for (let x = 3; x < 62; x += 5) cape.set(x, 63, null).set(x + 1, 63, null).set(x + 1, 62, null);
    out.paste(shadeLayer(cape, P.cloak, { shadowDepth: 3 }), 0, 0);
    for (const [x0, x1] of [[16, 10], [24, 20], [40, 44], [48, 54]]) out.line(x0, 42, x1, 60, P.cloak[3]);
    for (const [x0, x1] of [[20, 15], [44, 49]]) out.line(x0, 44, x1, 62, P.cloak[0]);
    if (A.cape === 'tattered') {
      for (const [x, y] of [[18, 50], [40, 47], [30, 58], [50, 55]]) out.ellipse(x, y, 1.5, 1.2, PAL.ink);
      out.rect(24, 44, 5, 4, PAL.rust1).rect(24, 44, 5, 1, PAL.rust2);
    }
    if (L.rarity === 'legendario' || L.rarity === 'unico') out.line(1, 63, 4, 42, P.trim[1]).line(63, 63, 60, 42, P.trim[1]);
  }
  if (hand) {
    rightArm();
    shade(out, skinHand, (l) => l.ellipse(hand[0], hand[1], 4, 3.5, '#'), 1);
  }

  // Hombreras.
  if (A.pauldrons) {
    for (const flip of [false, true]) {
      const big = A.pauldrons === 2;
      const p = new PixelBuffer(64, 64).poly(big ? [[1, 40], [6, 29], [18, 25], [28, 29], [28, 39], [16, 44], [2, 44]] : [[3, 38], [8, 30], [18, 27], [27, 30], [27, 38], [16, 42], [4, 42]], '#');
      const plate = shadeLayer(flip ? p.flipH() : p, P.metal, { shadowDepth: 3 });
      const sx = (x) => (flip ? 63 - x : x);
      plate.line(sx(6), 36, sx(25), 35, P.metal[0]).set(sx(12), 31, P.metal[3]).set(sx(21), 30, P.metal[3]);
      if (big) plate.line(sx(4), 40, sx(26), 38, P.metal[0]);
      if (L.rarity !== 'comun') plate.line(sx(8), 30, sx(18), 26, P.trim[1]);
      out.paste(plate, 0, 0);
    }
  }

  // Cabeza: yelmo, capucha o melena (con la capucha caída sobre la espalda).
  if (A.helmet) {
    shade(out, P.metal, (l) => l.poly([[18, 26], [46, 26], [48, 34], [16, 34]], '#'), 2);
    shade(out, P.metal, (l) => l.ellipse(32, 18, 11, 12, '#'), 3);
    out.line(32, 7, 32, 29, P.metal[3]).line(33, 7, 33, 29, P.metal[1]);
    for (const x of [24, 40]) out.set(x, 22, P.metal[0]);
    if (L.rarity !== 'comun') shade(out, P.accent, (l) => l.poly([[30, 7], [34, 7], [38, 1], [36, 0], [31, 3]], '#'), 1);
  } else if (A.hood === 'up') {
    shade(out, P.cloth, (l) => l.poly([[32, 3], [42, 10], [46, 24], [44, 34], [20, 34], [18, 24], [22, 10]], '#'), 3);
    out.line(32, 5, 32, 33, P.cloth[1]).line(26, 14, 22, 30, P.cloth[0]);
    if (L.rarity !== 'comun') out.line(20, 33, 44, 33, P.trim[1]);
  } else {
    if (A.body === 'plate') shade(out, P.metal, (l) => l.rect(24, 27, 16, 7, '#'), 1);
    else out.rect(27, 26, 10, 7, P.skin[0]).rect(28, 26, 8, 2, P.skin[2]);
    if (A.hood === 'down') shade(out, P.cloak, (l) => l.ellipse(32, 33, 14, 5, '#'), 2);
    bbHair(out, P);
  }

  bbWeapon(out, L, 'front');
  return out.outline(PAL.ink);
}

// NPC: el mismo cuerpo con otro atuendo y colores (como los NPC de Pokémon comparten base).
export const NPC_LOOKS = {
  peregrina: { armor: 'habito', colors: { cloth: [PAL.moss0, PAL.moss0, PAL.moss1, PAL.moss2] } },
  mercenario: { armor: 'cota', weapon: 'espada', colors: { hair: [PAL.rust0, PAL.rust0, PAL.rust1, PAL.rust2], accent: [PAL.moss0, PAL.moss0, PAL.moss1, PAL.moss2] } },
  loco: { armor: 'harapos', colors: { hair: [PAL.stone2, PAL.bone0, PAL.bone1, PAL.bone2], cloth: [PAL.moss0, PAL.moss0, PAL.moss1, PAL.moss2], cloak: [PAL.blood0, PAL.blood0, PAL.blood1, PAL.blood2] } },
  monja: { armor: 'habito', colors: { cloth: [PAL.stone2, PAL.bone0, PAL.bone1, PAL.bone2] } },
  nino: { armor: 'ninguna', colors: { hair: [PAL.ember0, PAL.ember0, PAL.ember1, PAL.ember2] } },
};

export function buildNpcFrames(key) {
  const n = NPC_LOOKS[key];
  return buildHeroOverworld({ armorRarity: 'comun', weaponRarity: 'comun', weapon: null, ...n });
}
