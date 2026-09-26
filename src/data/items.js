export const RARITIES = ['comun', 'raro', 'legendario', 'unico'];
export const RARITY_LABEL = { comun: 'Común', raro: 'Raro', legendario: 'Legendario', unico: 'Único' };

// Bases de equipo por ranura. mods: atk, def, spd, hp, int, mana, acc.
export const BASES = {
  arma: [
    { name: 'Espada corta', gender: 'f', mods: { atk: 2 } },
    { name: 'Mandoble', gender: 'm', mods: { atk: 5, spd: -2 } },
    { name: 'Hacha', gender: 'f', mods: { atk: 4, acc: -0.05 } },
    { name: 'Daga', gender: 'f', mods: { atk: 1, spd: 2 } },
    { name: 'Maza', gender: 'f', mods: { atk: 3, acc: 0.03 } },
  ],
  armadura: [
    { name: 'Harapos', gender: 'm', mods: { def: 1 } },
    { name: 'Cota', gender: 'f', mods: { def: 3 } },
    { name: 'Coraza', gender: 'f', mods: { def: 5, spd: -1 } },
    { name: 'Capa de cuero', gender: 'f', mods: { def: 2, spd: 1 } },
  ],
  reliquia: [
    { name: 'Amuleto', gender: 'm', mods: { int: 2 } },
    { name: 'Anillo', gender: 'm', mods: { atk: 1 } },
    { name: 'Rosario', gender: 'm', mods: { hp: 6 } },
    { name: 'Colgante', gender: 'm', mods: { mana: 3 } },
  ],
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
  { name: 'Hoja del Eclipse', slot: 'arma', mods: { atk: 7 }, effect: 'doubleStrike', desc: 'Cada ataque golpea dos veces.' },
  { name: 'Espejo sin Reflejo', slot: 'armadura', mods: { def: 4 }, effect: 'reflect', desc: 'Devuelve parte del daño recibido.' },
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
