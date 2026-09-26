import { addStrip } from './pixelBuffer.js';
import { buildHeroOverworld, buildHeroBack, lookFromEquipment, lookSignature, DIR_FRAME_BASE } from './heroArt.js';

// Texturas del personaje según su equipo. Se generan una vez por combinación y se reutilizan:
// cambiar de arma o armadura solo cambia qué textura usa el sprite.
export function ensureHeroTextures(scene, equipment) {
  const look = lookFromEquipment(equipment);
  const key = `hero_${lookSignature(look)}`;
  if (!scene.textures.exists(key)) {
    addStrip(scene, key, buildHeroOverworld(look));
    addStrip(scene, `${key}_back`, [buildHeroBack(look)]);
  }
  for (const [dir, base] of Object.entries(DIR_FRAME_BASE)) {
    const anim = `${key}_walk_${dir}`;
    if (scene.anims.exists(anim)) continue;
    scene.anims.create({
      key: anim,
      frames: [base + 1, base, base + 2, base].map((frame) => ({ key, frame })),
      frameRate: 10,
      repeat: -1,
    });
  }
  return { key, back: `${key}_back`, walk: (dir) => `${key}_walk_${dir}` };
}
