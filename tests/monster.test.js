import { describe, it, expect } from 'vitest';
import { generateMonster } from '../src/gfx/monsterGen.js';
import { generateEnemyTemplate } from '../src/world/enemyGen.js';
import { BIOMES } from '../src/world/biomes.js';

const tpl = (seed) => generateEnemyTemplate({ seed, depth: 1, biome: BIOMES.necropolis });

describe('generador de monstruos', () => {
  it('es determinista y produce siluetas sustanciales en ambas escalas', () => {
    for (const e of [1, 2, 3, 4, 5, 6].map(tpl)) {
      const a = generateMonster({ seed: e.seed, size: 64, archetype: e.archetype, ramp: e.ramp });
      const b = generateMonster({ seed: e.seed, size: 64, archetype: e.archetype, ramp: e.ramp });
      expect(a.buffer.px).toEqual(b.buffer.px);
      expect(a.buffer.count()).toBeGreaterThan(300);
      const small = generateMonster({ seed: e.seed, size: 16, archetype: e.archetype, ramp: e.ramp });
      expect(small.buffer.count()).toBeGreaterThan(20);
    }
  });
});
