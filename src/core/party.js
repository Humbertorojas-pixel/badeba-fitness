import { createCombatant } from './battle.js';
import { CUTE } from '../data/cute.js';

// Equipo: hasta dos compañeros que te siguen por el mapa y pelean a tu lado.
export const PARTY_MAX = 2;

// Rol y movimientos de cada tipo de NPC reclutable.
const NPC_KIT = {
  mercenario: { role: 'ataque', moves: ['tajo', 'embestida'] },
  vigia: { role: 'ataque', moves: ['flecha', 'tajo'] },
  loco: { role: 'ataque', moves: ['garra', 'mordida'] },
  herrera: { role: 'guardia', moves: ['martillazo'] },
  anciano: { role: 'cura', moves: ['baston'] },
  posadera: { role: 'cura', moves: ['baston'] },
  peregrina: { role: 'cura', moves: ['baston'] },
  monja: { role: 'cura', moves: ['baston'] },
  nino: { role: 'cura', moves: ['baston'] },
};

function baseStats(depth, role) {
  const k = 0.85 + 0.13 * (depth - 1);
  const s = { maxHp: 30 * k, str: 9 * k, def: 6 * k, spd: 7 * k };
  if (role === 'guardia') { s.maxHp *= 1.3; s.def += 3; }
  if (role === 'cura') s.str *= 0.8;
  if (role === 'ataque') s.str *= 1.2;
  return Object.fromEntries(Object.entries(s).map(([key, v]) => [key, Math.max(1, Math.round(v))]));
}

// Kit por oficio: primero el rol exacto, luego el título ("vigía de la aldea"), por último la paleta.
export function npcKit(sheet) {
  if (NPC_KIT[sheet.roleKey]) return NPC_KIT[sheet.roleKey];
  const key = (sheet.role || sheet.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const found = Object.keys(NPC_KIT).find((k) => key.includes(k));
  return NPC_KIT[found] || NPC_KIT[sheet.palette] || { role: 'ataque', moves: ['tajo'] };
}

export function companionFromCreature(template, depth) {
  const sp = CUTE[template.form];
  const stats = baseStats(depth, sp.role);
  return {
    id: `c_${template.seed}`, kind: 'criatura', name: sp.name, species: template.form, role: sp.role,
    level: depth, xp: 0, ...stats, hp: stats.maxHp, moves: sp.moves.slice(),
    template: { seed: template.seed, archetype: 'cute', ramp: template.ramp, form: template.form, rank: 'comun' },
  };
}

export function companionFromNpc(npc, depth) {
  const kit = npcKit(npc.sheet);
  const stats = baseStats(depth, kit.role);
  return {
    id: `n_${npc.id}_${depth}`, kind: 'npc', name: npc.sheet.name, role: kit.role, level: depth, xp: 0,
    ...stats, hp: stats.maxHp, moves: kit.moves.slice(), palette: npc.sheet.palette,
    title: npc.sheet.home ? `Fue ${npc.sheet.role.replace(/ de la aldea$/, '')} en ${npc.sheet.home}. Te sigue por la misión cumplida.` : `Fue ${npc.sheet.role}. Te sigue por la misión cumplida.`,
  };
}

export function companionCombatant(c) {
  return createCombatant({ name: c.name, maxHp: c.maxHp, str: c.str, def: c.def, spd: c.spd, moves: c.moves }, { hp: c.hp, role: c.role });
}

export const companionXpToNext = (level) => Math.round(18 * level ** 1.45);

// Experiencia compartida: cada nivel sube un 8 % sus atributos.
export function gainCompanionXp(c, amount) {
  c.xp += amount;
  let levels = 0;
  while (c.xp >= companionXpToNext(c.level)) {
    c.xp -= companionXpToNext(c.level);
    c.level += 1;
    levels++;
    for (const k of ['maxHp', 'str', 'def', 'spd']) c[k] = Math.round(c[k] * 1.08) + (k === 'maxHp' ? 1 : 0);
    c.hp = Math.min(c.maxHp, c.hp + Math.round(c.maxHp * 0.1));
  }
  return levels;
}

// Cura a todo el equipo (fracción de la vida máxima); revive a los caídos.
export function healParty(party, fraction = 1) {
  for (const c of party || []) c.hp = Math.min(c.maxHp, Math.max(c.hp, 0) + Math.ceil(c.maxHp * fraction));
}
