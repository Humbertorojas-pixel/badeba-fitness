import { describe, it, expect } from 'vitest';
import { generateFloor, regionSize } from '../src/world/generate.js';
import { validateFloor, computeTiles, isBlocked, reachable } from '../src/world/floor.js';
import { G } from '../src/world/ground.js';
import { T, FRAGMENT_OFFSET } from '../src/gfx/tiles.js';
import { PROPS, footprint } from '../src/world/props.js';
import { expand } from '../src/world/lsystem.js';
import { astar, maskAt } from '../src/world/terrain.js';

describe('regiones procedurales', () => {
  it('produce regiones válidas para muchas semillas y profundidades', () => {
    const biomes = new Set();
    for (let s = 1; s <= 25; s++) {
      for (const depth of [1, 3, 6]) {
        const f = generateFloor({ runSeed: s * 7919, depth });
        expect(validateFloor(f)).toBe(true);
        expect(f.w).toBe(regionSize(depth).w);
        expect(f.enemies.length).toBeGreaterThanOrEqual(5);
        expect(isBlocked(f, f.start.x, f.start.y)).toBe(false);
        biomes.add(f.biome);
      }
    }
    expect(biomes.size).toBe(5);
  }, 120000);

  it('las regiones son enormes frente a la pantalla (15×10 casillas visibles)', () => {
    const f = generateFloor({ runSeed: 3, depth: 1 });
    expect(f.w * f.h).toBeGreaterThan(15 * 10 * 70);
    const far = generateFloor({ runSeed: 3, depth: 10 });
    expect(far.w).toBe(184);
    expect(far.h).toBe(136);
  });

  it('los caminos tienen carteles que señalan lugares con nombre', () => {
    for (let s = 1; s <= 6; s++) {
      const f = generateFloor({ runSeed: s, depth: 2 });
      const signs = f.props.filter((p) => p.k === 'cartel');
      expect(signs.length).toBeGreaterThan(0);
      for (const sg of signs) expect(f.inspect.some((i) => i.x === sg.x && i.y === sg.y && i.text.startsWith('El cartel'))).toBe(true);
    }
  });

  it('el piso 1 siempre es el Bosque de Raíces y tiene aldea con hoguera y aldeanos', () => {
    for (let s = 1; s <= 12; s++) {
      const f = generateFloor({ runSeed: s, depth: 1 });
      expect(f.biome).toBe('bosque');
      expect(f.zones.some((z) => z.kind === 'aldea')).toBe(true);
      expect(f.inspect.some((i) => i.action === 'hoguera')).toBe(true);
      expect(f.props.filter((p) => p.k === 'casa').length).toBeGreaterThanOrEqual(2);
      expect(f.npcs.length).toBeGreaterThanOrEqual(2);
    }
  }, 60000);

  it('es determinista por semilla', () => {
    const a = generateFloor({ runSeed: 1234, depth: 4 });
    const b = generateFloor({ runSeed: 1234, depth: 4 });
    expect(Array.from(a.ground)).toEqual(Array.from(b.ground));
    expect(a.props).toEqual(b.props);
    expect(a.enemies.map((e) => e.template.name)).toEqual(b.enemies.map((e) => e.template.name));
  });

  it('las huellas de los elementos son sólidas y no pisan caminos', () => {
    const f = generateFloor({ runSeed: 77, depth: 2 });
    for (const p of f.props) {
      for (const [x, y] of footprint(p)) {
        expect(f.walls[y * f.w + x]).toBe(1);
        expect([G.PATH, G.BRIDGE]).not.toContain(f.ground[y * f.w + x]);
      }
      expect(p.y - PROPS[p.k].h + 1).toBeGreaterThanOrEqual(0);
    }
  });

  it('los caminos cruzan el agua con puentes transitables', () => {
    let bridges = 0;
    for (let s = 1; s <= 15; s++) {
      const f = generateFloor({ runSeed: s, depth: 2 });
      for (let i = 0; i < f.w * f.h; i++) if (f.ground[i] === G.BRIDGE) { bridges++; expect(f.walls[i]).toBe(0); }
    }
    expect(bridges).toBeGreaterThan(0);
  }, 60000);

  it('el fragmento multiversal queda fuera de los caminos y no corta el paso', () => {
    let found = 0;
    for (let s = 1; s <= 20; s++) {
      const f = generateFloor({ runSeed: s, depth: 3, forceFragment: true });
      if (!f.fragment) continue;
      found++;
      const stairsIdx = f.stairs.y * f.w + f.stairs.x;
      for (const k of f.fragment.cells) expect([G.PATH, G.BRIDGE, G.PAVED]).not.toContain(f.ground[k]);
      const blocked = { ...f, blockers: new Set([...f.blockers, ...f.fragment.cells]) };
      expect(reachable(blocked, f.start)[stairsIdx]).toBe(1);
      expect(computeTiles(f).flat().some((t) => t >= FRAGMENT_OFFSET)).toBe(true);
      expect(f.enemies.some((e) => e.id === 'frag')).toBe(true);
    }
    expect(found).toBeGreaterThan(10);
  }, 60000);

  it('los tiles de camino y agua usan autotiles según vecinos', () => {
    const f = generateFloor({ runSeed: 5, depth: 1 });
    const tiles = computeTiles(f);
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const g = f.ground[y * f.w + x];
      const t = tiles[y][x] % FRAGMENT_OFFSET;
      if (g === G.PATH) expect(t).toBeGreaterThanOrEqual(T.PATH);
      if (g === G.WATER) expect(t).toBeGreaterThanOrEqual(T.WATER);
    }
  });
});

describe('herramientas de terreno', () => {
  it('A* encuentra el camino más barato y respeta muros', () => {
    const wall = (x, y) => (x === 2 && y < 4 ? Infinity : 1);
    const path = astar(5, 5, { x: 0, y: 0 }, { x: 4, y: 0 }, wall);
    expect(path.length).toBe(13);
  });

  it('la máscara de autotile codifica N/E/S/O', () => {
    expect(maskAt(() => true, 1, 1)).toBe(15);
    expect(maskAt((x, y) => y === 0, 1, 1)).toBe(1);
  });

  it('los L-Systems expanden según sus reglas', () => {
    expect(expand('F', { F: 'F+F' }, 2)).toBe('F+F+F+F');
  });
});
