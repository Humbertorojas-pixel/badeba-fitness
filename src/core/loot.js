import { BASES, AFFIXES, LEGEND_TITLES, UNIQUES, SYNC_COST, CONSUMABLES } from '../data/items.js';

// Tasas base por tirada (diseño): Legendario 0.005 %, Único 0.0001 %.
export const BASE_RATES = { unico: 0.000001, legendario: 0.00005, raro: 0.3 };
// Pity: la probabilidad se duplica cada `doubling` tiradas fallidas; `hard` garantiza el drop.
export const PITY = {
  legendario: { doubling: 40, hard: 900 },
  unico: { doubling: 60, hard: 3000 },
};

export function newPity() {
  return { legendario: 0, unico: 0 };
}

export function pityChance(tier, count) {
  const { doubling, hard } = PITY[tier];
  if (count + 1 >= hard) return 1;
  return Math.min(1, BASE_RATES[tier] * 2 ** (count / doubling));
}

// Tira la rareza de un drop. Muta `pity`: se reinicia al conseguir el tier, sube si falla.
export function rollRarity(rng, pity, { intelligence = 0 } = {}) {
  let result = null;
  if (rng.next() < pityChance('unico', pity.unico)) result = 'unico';
  else if (rng.next() < pityChance('legendario', pity.legendario)) result = 'legendario';
  pity.unico = result === 'unico' ? 0 : pity.unico + 1;
  pity.legendario = result === 'legendario' ? 0 : pity.legendario + 1;
  if (result) return result;
  const rare = BASE_RATES.raro * (1 + intelligence * 0.02);
  return rng.next() < rare ? 'raro' : 'comun';
}

function addMods(into, mods) {
  for (const [k, v] of Object.entries(mods)) into[k] = (into[k] || 0) + v;
}

function scaleMods(mods, depth) {
  const f = 1 + (depth - 1) * 0.12;
  const out = {};
  for (const [k, v] of Object.entries(mods)) out[k] = k === 'acc' ? v : Math.round(v * (v > 0 ? f : 1));
  return out;
}

let itemCounter = 0;
export function generateItem(rng, rarity, depth, slot = rng.pick(Object.keys(BASES))) {
  const id = `it${Date.now().toString(36)}${(itemCounter++).toString(36)}${rng.int(0, 9999)}`;
  if (rarity === 'unico') {
    const u = rng.pick(UNIQUES);
    return { id, kind: 'equip', slot: u.slot, rarity, name: u.name, mods: scaleMods(u.mods, depth), effect: u.effect, sync: rng.int(...SYNC_COST.unico), desc: u.desc };
  }
  const base = rng.pick(BASES[slot]);
  const mods = scaleMods(base.mods, depth);
  const g = base.gender === 'f' ? 1 : 0;
  let name = base.name;
  let effect = null;
  const affixCount = rarity === 'legendario' ? 2 : rarity === 'raro' ? 1 : 0;
  for (const affix of rng.shuffle(AFFIXES).slice(0, affixCount)) {
    addMods(mods, scaleMods(affix.mods, depth));
    if (affix.effect) effect = affix.effect;
    if (rarity === 'raro') name = `${name} ${affix.name[g]}`;
  }
  if (rarity === 'legendario') {
    addMods(mods, { atk: slot === 'arma' ? 3 : 0, def: slot === 'armadura' ? 3 : 0, hp: slot === 'reliquia' ? 8 : 0 });
    name = `${base.name} ${rng.pick(LEGEND_TITLES)}`;
  }
  for (const k of Object.keys(mods)) if (mods[k] === 0) delete mods[k];
  const sync = rarity === 'comun' ? 0 : rng.int(...SYNC_COST[rarity]);
  return { id, kind: 'equip', slot, rarity, name, mods, effect, sync };
}

// Botín que porta un enemigo: puede ser consumible, equipo o nada.
export function rollEnemyLoot(rng, pity, depth, intelligence) {
  const r = rng.next();
  if (r < 0.3) return null;
  if (r < 0.62) return { kind: 'consumable', key: rng.chance(0.2 + depth * 0.02) ? 'pocion' : rng.chance(0.15) ? 'incienso' : 'tonico' };
  const rarity = rollRarity(rng, pity, { intelligence });
  return generateItem(rng, rarity, depth);
}

export function itemDisplayName(item) {
  return item.kind === 'consumable' ? CONSUMABLES[item.key].name : item.name;
}
