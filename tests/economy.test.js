import { describe, it, expect } from 'vitest';
import { createRng } from '../src/core/rng.js';
import { rollRarity, newPity, pityChance, PITY, BASE_RATES, generateItem, rollEnemyLoot } from '../src/core/loot.js';
import { newPlayer, derive, canEquip, equip, syncState, gainXp, allocate, xpToNext } from '../src/core/character.js';
import { createCombatant, createEnemyCombatant, resolveTurn } from '../src/core/battle.js';

describe('economía de loot', () => {
  it('las tasas base respetan el diseño', () => {
    expect(BASE_RATES.legendario).toBe(0.00005);
    expect(BASE_RATES.unico).toBe(0.000001);
    expect(pityChance('legendario', 0)).toBeCloseTo(0.00005);
  });

  it('el pity garantiza legendario y único al llegar al tope', () => {
    const rng = createRng(1);
    const pity = newPity();
    let legendary = -1;
    let unique = -1;
    for (let i = 0; i < PITY.unico.hard + 5; i++) {
      const r = rollRarity(rng, pity);
      if (r === 'legendario' && legendary < 0) legendary = i;
      if (r === 'unico' && unique < 0) unique = i;
    }
    expect(legendary).toBeGreaterThanOrEqual(0);
    expect(legendary).toBeLessThan(PITY.legendario.hard);
    expect(unique).toBeGreaterThanOrEqual(0);
    expect(unique).toBeLessThan(PITY.unico.hard);
  });

  it('raros salen "un par por piso" (~30 % por tirada de equipo)', () => {
    const rng = createRng(7);
    let rares = 0;
    for (let i = 0; i < 10000; i++) if (rollRarity(rng, newPity()) === 'raro') rares++;
    expect(rares / 10000).toBeGreaterThan(0.25);
    expect(rares / 10000).toBeLessThan(0.35);
  });

  it('la inteligencia mejora marginalmente la probabilidad de raro', () => {
    const count = (intel) => { const rng = createRng(3); let n = 0; for (let i = 0; i < 20000; i++) if (rollRarity(rng, newPity(), { intelligence: intel }) === 'raro') n++; return n; };
    expect(count(20)).toBeGreaterThan(count(0));
  });

  it('genera ítems coherentes por rareza', () => {
    const rng = createRng(11);
    const common = generateItem(rng, 'comun', 1, 'arma');
    expect(common.sync).toBe(0);
    const rare = generateItem(rng, 'raro', 3, 'armadura');
    expect(rare.sync).toBeGreaterThanOrEqual(3);
    const uniq = generateItem(rng, 'unico', 5);
    expect(uniq.effect).toBeTruthy();
  });

  it('los enemigos a veces portan botín', () => {
    const rng = createRng(5);
    const loots = Array.from({ length: 200 }, () => rollEnemyLoot(rng, newPity(), 2, 5));
    expect(loots.some((l) => l === null)).toBe(true);
    expect(loots.some((l) => l?.kind === 'consumable')).toBe(true);
    expect(loots.some((l) => l?.kind === 'equip')).toBe(true);
  });
});

describe('personaje y sintonización de maná', () => {
  const rareSword = { id: 'a', kind: 'equip', slot: 'arma', rarity: 'raro', name: 'Espada', mods: { atk: 5 }, sync: 5 };
  const legendArmor = { id: 'b', kind: 'equip', slot: 'armadura', rarity: 'legendario', name: 'Coraza', mods: { def: 8 }, sync: 10 };

  it('no permite equipar si el maná máximo no cubre la sincronización', () => {
    const p = newPlayer();
    expect(canEquip(p, rareSword).ok).toBe(true);
    equip(p, [], rareSword);
    expect(canEquip(p, legendArmor).ok).toBe(false);
    p.attrs.mana = 6;
    expect(canEquip(p, legendArmor).ok).toBe(true);
  });

  it('el drenaje desincroniza sin desequipar (periodo de gracia)', () => {
    const p = newPlayer();
    equip(p, [], rareSword);
    const atk = derive(p).str;
    p.manaDrain = 10;
    expect(syncState(p).desynced).toEqual(['arma']);
    expect(p.equipment.arma).toBe(rareSword);
    expect(derive(p).str).toBe(atk - 5);
    p.manaDrain = 0;
    expect(derive(p).str).toBe(atk);
  });

  it('subir de nivel da puntos y asignar Salud sube PS', () => {
    const p = newPlayer();
    const levels = gainXp(p, xpToNext(1) + 1);
    expect(levels).toBe(1);
    expect(p.points).toBe(3);
    const hp = derive(p).maxHp;
    allocate(p, 'salud');
    expect(derive(p).maxHp).toBe(hp + 4);
  });
});

describe('efectos de ítems en combate', () => {
  const base = { name: 'X', maxHp: 100, str: 10, def: 5, spd: 5, moves: ['tajo'] };
  it('doble golpe produce dos daños en un ataque', () => {
    const player = createCombatant({ ...base, spd: 50 }, { effects: ['doubleStrike'] });
    const enemy = createCombatant({ ...base, moves: ['garra'] });
    const { events } = resolveTurn({ player, enemy, consumables: {} }, { type: 'move', move: 'tajo' }, createRng(2));
    const hits = events.filter((e) => e.type === 'damage' && e.side === 'enemy');
    expect(hits.length === 2 || events.some((e) => e.type === 'miss')).toBe(true);
  });

  it('el enemigo aplica los mods de su ítem', () => {
    const tpl = { ...base, loot: { kind: 'equip', mods: { atk: 7, def: 2 }, effect: 'reflect' } };
    const c = createEnemyCombatant(tpl);
    expect(c.str).toBe(17);
    expect(c.def).toBe(7);
    expect(c.effects).toContain('reflect');
  });
});
