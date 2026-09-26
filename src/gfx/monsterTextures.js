import { generateMonster } from './monsterGen.js';
import { addStrip } from './pixelBuffer.js';

// Genera (una vez) las texturas pequeña (mapa) y grande (combate) de un enemigo.
export function ensureMonsterTextures(scene, id, template) {
  const small = `mon_s_${id}`;
  const big = `mon_b_${id}`;
  if (!scene.textures.exists(small)) {
    const opts = { seed: template.seed, archetype: template.archetype, ramp: template.ramp };
    addStrip(scene, small, [generateMonster({ ...opts, size: 16 }).buffer]);
    addStrip(scene, big, [generateMonster({ ...opts, size: 64 }).buffer]);
  }
  return { small, big };
}
