// Atributos manuales: Fuerza, Salud, Inteligencia, Maná. Todo lo demás se deriva.
import { STARTER_GEAR } from '../data/items.js';
import { RANKS } from '../world/enemyGen.js';

export const ATTRS = ['fuerza', 'salud', 'inteligencia', 'mana'];
export const ATTR_LABEL = { fuerza: 'Fuerza', salud: 'Salud', inteligencia: 'Intelig.', mana: 'Maná' };
export const POINTS_PER_LEVEL = 3;
export const SLOTS = ['arma', 'armadura', 'reliquia'];
export const SLOT_LABEL = { arma: 'Arma', armadura: 'Armadura', reliquia: 'Reliquia' };

export function newPlayer() {
  const p = {
    name: 'Errante',
    level: 1,
    xp: 0,
    points: 0,
    attrs: { fuerza: 10, salud: 5, inteligencia: 5, mana: 4 },
    equipment: { arma: { ...STARTER_GEAR.arma }, armadura: { ...STARTER_GEAR.armadura }, reliquia: null },
    manaDrain: 0,
    moves: ['tajo', 'embestida', 'guardia'],
  };
  p.hp = derive(p).maxHp;
  return p;
}

export function xpToNext(level) {
  return Math.round(20 * level ** 1.5);
}

export function maxManaOf(p) {
  const base = p.attrs.mana * 3;
  const fromItems = SLOTS.reduce((s, k) => s + (p.equipment[k]?.mods.mana || 0), 0);
  return base + fromItems;
}

// Sintonización: el costo acumulado del equipo (en orden de ranura) debe caber en el maná.
// Si el maná máximo baja (drenaje), los ítems que ya no caben quedan desincronizados:
// siguen equipados pero sin efecto (periodo de gracia en lugar de desequipar a la fuerza).
export function syncState(p) {
  const cap = Math.max(0, maxManaOf(p) - p.manaDrain);
  let used = 0;
  const desynced = [];
  for (const slot of SLOTS) {
    const it = p.equipment[slot];
    if (!it || !it.sync) continue;
    if (used + it.sync > cap) desynced.push(slot);
    else used += it.sync;
  }
  return { cap, used, desynced };
}

export function derive(p) {
  const { desynced, cap, used } = syncState(p);
  const mods = { atk: 0, def: 0, spd: 0, hp: 0, int: 0, acc: 0 };
  const effects = [];
  for (const slot of SLOTS) {
    const it = p.equipment[slot];
    if (!it || desynced.includes(slot)) continue;
    for (const [k, v] of Object.entries(it.mods)) if (k in mods) mods[k] += v;
    if (it.effect) effects.push(it.effect);
  }
  const a = p.attrs;
  return {
    maxHp: 20 + a.salud * 4 + mods.hp,
    str: a.fuerza + mods.atk,
    def: 6 + Math.floor(p.level / 2) + mods.def,
    spd: 8 + mods.spd,
    int: a.inteligencia + mods.int,
    accBonus: Math.min(0.1, Math.max(0, (a.fuerza - 10) * 0.005)) + mods.acc,
    effects,
    manaCap: cap,
    manaUsed: used,
    desynced,
  };
}

export function canEquip(p, item) {
  const current = p.equipment[item.slot];
  const probe = { ...p, manaDrain: 0, equipment: { ...p.equipment, [item.slot]: item } };
  const { desynced } = syncState(probe);
  if (desynced.length) return { ok: false, reason: `Tu maná no alcanza para sincronizar ${item.name} (${item.sync}).` };
  return { ok: true, replaced: current };
}

export function equip(p, bag, item) {
  const check = canEquip(p, item);
  if (!check.ok) return check;
  const i = bag.indexOf(item);
  if (i >= 0) bag.splice(i, 1);
  if (check.replaced) bag.push(check.replaced);
  p.equipment[item.slot] = item;
  p.hp = Math.min(p.hp, derive(p).maxHp);
  return check;
}

export function unequip(p, bag, slot) {
  const it = p.equipment[slot];
  if (!it) return;
  p.equipment[slot] = null;
  bag.push(it);
  p.hp = Math.min(p.hp, derive(p).maxHp);
}

export function gainXp(p, amount) {
  p.xp += amount;
  let levels = 0;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    p.points += POINTS_PER_LEVEL;
    levels++;
  }
  return levels;
}

export function allocate(p, attr) {
  if (p.points <= 0 || !ATTRS.includes(attr)) return false;
  const before = derive(p).maxHp;
  p.points -= 1;
  p.attrs[attr] += 1;
  p.hp += derive(p).maxHp - before;
  return true;
}

export function xpReward(template) {
  return Math.round((6 + template.level * 4 + template.maxHp * 0.3) * (RANKS[template.rank]?.xp || 1));
}
