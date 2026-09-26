import { describe, it, expect } from 'vitest';
import { createRng } from '../src/core/rng.js';
import { createCombatant, resolveTurn, computeDamage, fleeChance } from '../src/core/battle.js';
import { generateEnemyTemplate } from '../src/world/enemyGen.js';
import { BIOMES } from '../src/world/biomes.js';

const tpl = (seed) => generateEnemyTemplate({ seed, depth: 1, biome: BIOMES.catacumbas });
import { MOVES } from '../src/data/moves.js';

const hero = () => createCombatant({ name: 'Tú', maxHp: 40, str: 10, def: 6, spd: 8, moves: ['tajo', 'embestida', 'guardia'] });

describe('combate', () => {
  it('el RNG es determinista por semilla', () => {
    const a = createRng(42); const b = createRng(42);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });

  it('el daño mínimo es 1 y la guardia lo reduce', () => {
    const rng = createRng(1);
    const p = hero();
    const e = createCombatant(tpl(3));
    const normal = computeDamage(e, p, MOVES.garra, createRng(5)).amount;
    p.guarding = true;
    const guarded = computeDamage(e, p, MOVES.garra, createRng(5)).amount;
    expect(guarded).toBeLessThan(normal);
    expect(computeDamage({ str: 1 }, { def: 999 }, MOVES.garra, rng).amount).toBe(1);
  });

  it('una pelea siempre termina', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed);
      const state = { player: hero(), enemy: createCombatant(tpl(7)), consumables: { tonico: 3 } };
      let outcome = 'continue';
      let turns = 0;
      while (outcome === 'continue' && turns < 100) {
        outcome = resolveTurn(state, { type: 'move', move: 'tajo' }, rng).outcome;
        turns++;
      }
      expect(outcome).not.toBe('continue');
    }
  });

  it('usar un tónico cura y consume el ítem', () => {
    const state = { player: hero(), enemy: createCombatant(tpl(9)), consumables: { tonico: 1 } };
    state.player.hp = 5;
    const { events } = resolveTurn(state, { type: 'item', item: 'tonico' }, createRng(3));
    expect(state.consumables.tonico).toBe(0);
    expect(events.some((e) => e.type === 'heal')).toBe(true);
  });

  it('la probabilidad de huida está acotada', () => {
    expect(fleeChance({ spd: 100 }, { spd: 1 })).toBe(0.95);
    expect(fleeChance({ spd: 1 }, { spd: 100 })).toBe(0.2);
  });
});
