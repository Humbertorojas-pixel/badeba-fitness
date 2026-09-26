import { generateMonster } from './monsterGen.js';
import { addStrip } from './pixelBuffer.js';
import { itemLook, itemMaterial } from '../data/items.js';
import { relicLook } from './itemArt.js';
import { PixelBuffer } from './pixelBuffer.js';

// Segundo frame de respiración: la mitad superior del cuerpo baja un píxel (se comprime).
export function breathFrame(buf, amount = 1) {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) if (buf.get(x, y)) { if (top < 0) top = y; bottom = y; }
  const out = buf.clone();
  if (top < 0) return out;
  const mid = Math.round(top + (bottom - top) * 0.55);
  for (let y = mid; y >= top; y--) for (let x = 0; x < buf.w; x++) out.px[y * buf.w + x] = y - amount >= top ? buf.get(x, y - amount) : null;
  return out;
}

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
    const sb = generateMonster({ ...opts, size: MONSTER_SMALL }).buffer;
    const bb = generateMonster({ ...opts, size: 64 }).buffer;
    addStrip(scene, small, [sb, breathFrame(sb)]);
    addStrip(scene, big, [bb, breathFrame(bb, 1)]);
    for (const key of [small, big]) {
      if (scene.anims.exists(`${key}_anim`)) scene.anims.remove(`${key}_anim`);
      scene.anims.create({ key: `${key}_anim`, frames: scene.anims.generateFrameNumbers(key, { frames: [0, 1] }), frameRate: key === big ? 1.6 : 2.2, repeat: -1 });
    }
  }
  return { small, big };
}
