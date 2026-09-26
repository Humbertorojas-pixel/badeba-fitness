import { addStrip } from './pixelBuffer.js';
import { drawProp } from './propArt.js';

export const propKey = (biome, p) => `p_${biome}_${p.k}_${p.k === 'hoguera' ? 0 : p.v}`;

// Genera (una vez por piso) las texturas de los elementos usados en la región.
export function ensurePropTextures(scene, biomeKey, B, props) {
  const done = new Set();
  for (const p of props) {
    const key = propKey(biomeKey, p);
    if (done.has(key) || scene.textures.exists(key)) continue;
    done.add(key);
    if (p.k === 'hoguera') {
      addStrip(scene, key, [0, 1, 2].map((f) => drawProp('hoguera', B, f)));
      if (scene.anims.exists(`${key}_anim`)) scene.anims.remove(`${key}_anim`);
      scene.anims.create({ key: `${key}_anim`, frames: scene.anims.generateFrameNumbers(key, { frames: [0, 1, 0, 2] }), frameRate: 8, repeat: -1 });
    } else {
      addStrip(scene, key, [drawProp(p.k, B, p.v)]);
    }
  }
}
