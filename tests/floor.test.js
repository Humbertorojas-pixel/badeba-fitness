import { describe, it, expect } from 'vitest';
import { parseAscii, computeTiles, validateFloor, isWall } from '../src/world/floor.js';
import { FIXED_FLOOR, ENEMY_KEYS } from '../src/world/fixedFloor.js';
import { T } from '../src/gfx/tiles.js';

describe('piso fijo', () => {
  const floor = parseAscii(FIXED_FLOOR, { enemyKeys: ENEMY_KEYS, inspectText: 'x' });

  it('tiene inicio, escaleras y enemigos alcanzables', () => {
    expect(floor.start).toBeTruthy();
    expect(floor.stairs).toBeTruthy();
    expect(floor.enemies.length).toBe(4);
    expect(validateFloor(floor)).toBe(true);
  });

  it('las antorchas están sobre caras de muro', () => {
    const tiles = computeTiles(floor);
    for (const t of floor.torches) {
      expect(isWall(floor, t.x, t.y)).toBe(true);
      expect(tiles[t.y][t.x]).toBe(T.WALL_FACE);
    }
  });
});
