export const RARITIES = ['comun', 'raro', 'legendario', 'unico'];
export const RARITY_LABEL = { comun: 'Común', raro: 'Raro', legendario: 'Legendario', unico: 'Único' };

// Bases de equipo por ranura. mods: atk, def, spd, hp, int, mana, acc.
// `look` decide cómo se ve en el personaje (mapa y combate); `minDepth`, desde qué piso aparece.
export const BASES = {
  arma: [
    { name: 'Daga', gender: 'f', look: 'daga', mods: { atk: 1, spd: 2 } },
    { name: 'Espada corta', gender: 'f', look: 'espada', mods: { atk: 2 } },
    { name: 'Maza', gender: 'f', look: 'maza', mods: { atk: 3, acc: 0.03 } },
    { name: 'Lanza', gender: 'f', look: 'lanza', mods: { atk: 3, spd: 1 } },
    { name: 'Hacha', gender: 'f', look: 'hacha', mods: { atk: 4, acc: -0.05 } },
    { name: 'Guadaña', gender: 'f', look: 'guadana', mods: { atk: 4, int: 1 }, minDepth: 2 },
    { name: 'Mandoble', gender: 'm', look: 'mandoble', mods: { atk: 5, spd: -2 } },
  ],
  armadura: [
    { name: 'Harapos', gender: 'm', look: 'harapos', mods: { def: 1 } },
    { name: 'Capa de cuero', gender: 'f', look: 'cuero', mods: { def: 2, spd: 1 } },
    { name: 'Hábito ritual', gender: 'm', look: 'habito', mods: { def: 1, int: 2, mana: 2 } },
    { name: 'Cota de malla', gender: 'f', look: 'cota', mods: { def: 3 } },
    { name: 'Coraza', gender: 'f', look: 'coraza', mods: { def: 5, spd: -1 } },
    { name: 'Armadura de placas', gender: 'f', look: 'placas', mods: { def: 7, spd: -2, hp: 4 }, minDepth: 3 },
  ],
  reliquia: [
    { name: 'Amuleto', gender: 'm', mods: { int: 2 } },
    { name: 'Anillo', gender: 'm', mods: { atk: 1 } },
    { name: 'Rosario', gender: 'm', mods: { hp: 6 } },
    { name: 'Colgante', gender: 'm', mods: { mana: 3 } },
  ],
};

// Equipo inicial del Errante: solo aspecto, sin bonificaciones (no altera el balance).
export const STARTER_GEAR = {
  arma: { id: 'start_arma', kind: 'equip', slot: 'arma', rarity: 'comun', name: 'Espada mellada', look: 'espada', mods: {}, effect: null, sync: 0 },
  armadura: { id: 'start_armadura', kind: 'equip', slot: 'armadura', rarity: 'comun', name: 'Harapos del Errante', look: 'harapos', mods: {}, effect: null, sync: 0 },
};

// Afijos de ítems raros/legendarios: [masculino, femenino].
export const AFFIXES = [
  { name: ['afilado', 'afilada'], mods: { atk: 2 } },
  { name: ['pesado', 'pesada'], mods: { atk: 3, spd: -1 } },
  { name: ['veloz', 'veloz'], mods: { spd: 2 } },
  { name: ['del penitente', 'del penitente'], mods: { hp: 8 } },
  { name: ['vidente', 'vidente'], mods: { int: 2 } },
  { name: ['rúnico', 'rúnica'], mods: { mana: 4 } },
  { name: ['férreo', 'férrea'], mods: { def: 2 } },
  { name: ['de la sangre', 'de la sangre'], mods: {}, effect: 'lifesteal' },
];

// Títulos de legendarios (se nombran como mitos).
export const LEGEND_TITLES = ['del Rey Sin Trono', 'de la Última Vigilia', 'del Halcón Caído', 'de la Marca', 'del Pozo', 'de los Mil Ecos'];

// Únicos: rompen las reglas del juego.
export const UNIQUES = [
  { name: 'Hoja del Eclipse', slot: 'arma', look: 'mandoble', mods: { atk: 7 }, effect: 'doubleStrike', desc: 'Cada ataque golpea dos veces.' },
  { name: 'Guadaña del Barquero', slot: 'arma', look: 'guadana', mods: { atk: 6, int: 3 }, effect: 'lifesteal', desc: 'Siega la vida y te la entrega.' },
  { name: 'Espejo sin Reflejo', slot: 'armadura', look: 'placas', mods: { def: 4 }, effect: 'reflect', desc: 'Devuelve parte del daño recibido.' },
  { name: 'Piel del Titán', slot: 'armadura', look: 'cuero', mods: { def: 6, hp: 15 }, effect: 'reflect', desc: 'Cuero que aún recuerda al gigante.' },
  { name: 'Reloj sin Agujas', slot: 'reliquia', mods: { spd: 4 }, effect: 'alwaysFirst', desc: 'Siempre actúas primero.' },
  { name: 'Corazón de Brasa', slot: 'reliquia', mods: { hp: 20 }, effect: 'lifesteal', desc: 'Tus golpes te devuelven vida.' },
];

export const SYNC_COST = { comun: 0, raro: [3, 5], legendario: [8, 11], unico: [14, 16] };

export const CONSUMABLES = {
  tonico: { name: 'Tónico', heal: 20, desc: 'Cierra heridas leves. +20 PS.' },
  pocion: { name: 'Poción oscura', heal: 50, desc: 'Sabe a hierro. +50 PS.' },
  incienso: { name: 'Incienso', restoreMana: true, desc: 'Deshace el drenaje de maná en combate.' },
};

export const EFFECT_DESC = {
  lifesteal: 'Roba vida al golpear.',
  doubleStrike: 'Golpea dos veces.',
  reflect: 'Refleja daño.',
  alwaysFirst: 'Actúa primero.',
};

export const MOD_LABEL = { atk: 'ATQ', def: 'DEF', spd: 'VEL', hp: 'PS', int: 'INT', mana: 'MANÁ', acc: 'PREC' };

const DEFAULT_LOOK = { arma: 'espada', armadura: 'harapos' };

// Aspecto de un ítem (los guardados antiguos no tenían `look`: se deduce del nombre).
export function itemLook(item) {
  if (!item || item.slot === 'reliquia') return null;
  if (item.look) return item.look;
  const u = UNIQUES.find((q) => q.name === item.name);
  if (u?.look) return u.look;
  const first = (n) => n.split(' ')[0];
  const base = (BASES[item.slot] || []).find((b) => item.name.startsWith(b.name)) || (BASES[item.slot] || []).find((b) => first(b.name) === first(item.name));
  return base?.look || DEFAULT_LOOK[item.slot] || null;
}
