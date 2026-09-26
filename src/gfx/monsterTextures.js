import { generateMonster } from './monsterGen.js';
import { addStrip } from './pixelBuffer.js';
import { itemLook, itemMaterial } from '../data/items.js';
import { relicLook } from './itemArt.js';

export const MONSTER_SMALL = 24;

// Genera (una vez) las texturas del mapa y de combate de un enemigo. El botín que porta se ve en
// su cuerpo (arma, placa de armadura o gema); el rango añade cuernos, ojos o un aura.
export function ensureMonsterTextures(scene, id, template) {
  const small = `mon_s_${id}`;
  const big = `mon_b_${id}`;
  if (!scene.textures.exists(small)) {
    const loot = template.loot;
    const gear = loot?.kind === 'equip' ? { slot: loot.slot, look: loot.slot === 'reliquia' ? relicLook(loot) : itemLook(loot), mat: itemMaterial(loot) } : null;
    const opts = { seed: template.seed, archetype: template.archetype, ramp: template.ramp, rank: template.rank || 'comun', form: template.form, loot: gear };
    addStrip(scene, small, [generateMonster({ ...opts, size: MONSTER_SMALL }).buffer]);
    addStrip(scene, big, [generateMonster({ ...opts, size: 64 }).buffer]);
  }
  return { small, big };
}
