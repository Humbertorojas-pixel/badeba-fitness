import { describe, it, expect } from 'vitest';
import { generateFloor } from '../src/world/generate.js';
import { validateFloor, computeTiles, isBlocked, reachable } from '../src/world/floor.js';
import { T, FRAGMENT_OFFSET } from '../src/gfx/tiles.js';
import { expand } from '../src/world/lsystem.js';

describe('generación procedural de pisos', () => {
  it('produce pisos válidos para muchas semillas y profundidades', () => {
    const biomes = new Set();
    for (let s = 1; s <= 60; s++) {
      for (const depth of [1, 2, 5, 9]) {
        const f = generateFloor({ runSeed: s * 7919, depth });
        expect(validateFloor(f)).toBe(true);
        expect(f.enemies.length).toBeGreaterThanOrEqual(3);
        expect(isBlocked(f, f.start.x, f.start.y)).toBe(false);
        biomes.add(f.biome);
      }
    }
    expect(biomes.size).toBe(3);
  });

  it('el piso 1 siempre es catacumbas', () => {
    for (let s = 1; s <= 20; s++) expect(generateFloor({ runSeed: s, depth: 1 }).biome).toBe('catacumbas');
  });

  it('es determinista por semilla', () => {
    const a = generateFloor({ runSeed: 1234, depth: 4 });
    const b = generateFloor({ runSeed: 1234, depth: 4 });
    expect(Array.from(a.walls)).toEqual(Array.from(b.walls));
    expect(a.enemies.map((e) => e.template.name)).toEqual(b.enemies.map((e) => e.template.name));
  });

  it('el fragmento multiversal nunca toca la ruta crítica ni el inicio/salida', () => {
    let found = 0;
    for (let s = 1; s <= 40; s++) {
      const f = generateFloor({ runSeed: s, depth: 3, forceFragment: true });
      if (!f.fragment) continue;
      found++;
      const startIdx = f.start.y * f.w + f.start.x;
      const stairsIdx = f.stairs.y * f.w + f.stairs.x;
      expect(f.fragment.cells.has(startIdx)).toBe(false);
      expect(f.fragment.cells.has(stairsIdx)).toBe(false);
      // Quitar el fragmento no debe romper la conexión inicio -> escaleras.
      const blocked = { ...f, blockers: new Set([...f.blockers, ...f.fragment.cells]) };
      expect(reachable(blocked, f.start)[stairsIdx]).toBe(1);
      const tiles = computeTiles(f).flat();
      expect(tiles.some((t) => t >= FRAGMENT_OFFSET)).toBe(true);
      expect(f.enemies.some((e) => e.id === 'frag')).toBe(true);
    }
    expect(found).toBeGreaterThan(20);
  });

  it('las antorchas están en caras de muro', () => {
    const f = generateFloor({ runSeed: 99, depth: 2 });
    const tiles = computeTiles(f);
    for (const t of f.torches) expect(tiles[t.y][t.x] % FRAGMENT_OFFSET).toBe(T.WALL_FACE);
  });

  it('los L-Systems expanden según sus reglas', () => {
    expect(expand('F', { F: 'F+F' }, 2)).toBe('F+F+F+F');
  });
});
