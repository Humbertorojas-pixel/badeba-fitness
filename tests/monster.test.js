import { describe, it, expect } from 'vitest';
import { generateMonster } from '../src/gfx/monsterGen.js';
import { ENEMIES } from '../src/data/enemies.js';

describe('generador de monstruos', () => {
  it('es determinista y produce siluetas sustanciales en ambas escalas', () => {
    for (const e of Object.values(ENEMIES)) {
      const a = generateMonster({ seed: e.seed, size: 56, archetype: e.archetype, ramp: e.ramp });
      const b = generateMonster({ seed: e.seed, size: 56, archetype: e.archetype, ramp: e.ramp });
      expect(a.buffer.px).toEqual(b.buffer.px);
      expect(a.buffer.count()).toBeGreaterThan(300);
      const small = generateMonster({ seed: e.seed, size: 16, archetype: e.archetype, ramp: e.ramp });
      expect(small.buffer.count()).toBeGreaterThan(20);
    }
  });
});
