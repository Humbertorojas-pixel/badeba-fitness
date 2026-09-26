import { generateMonster } from './monsterGen.js';
import { addStrip } from './pixelBuffer.js';
import { itemLook } from '../data/items.js';

export const MONSTER_SMALL = 24;

// Genera (una vez) las texturas del mapa y de combate de un enemigo. Los humanoides empuñan el
// arma que portan como botín; el rango añade cuernos, ojos o un aura.
export function ensureMonsterTextures(scene, id, template) {
  const small = `mon_s_${id}`;
  const big = `mon_b_${id}`;
  if (!scene.textures.exists(small)) {
    const loot = template.loot;
    const weapon = loot?.kind === 'equip' && loot.slot === 'arma' ? { look: itemLook(loot), rarity: loot.rarity } : null;
    const opts = { seed: template.seed, archetype: template.archetype, ramp: template.ramp, rank: template.rank || 'comun', form: template.form, weapon };
    addStrip(scene, small, [generateMonster({ ...opts, size: MONSTER_SMALL }).buffer]);
    addStrip(scene, big, [generateMonster({ ...opts, size: 64 }).buffer]);
  }
  return { small, big };
}
