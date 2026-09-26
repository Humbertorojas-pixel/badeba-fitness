import { addStrip } from './pixelBuffer.js';
import { drawProp } from './propArt.js';

// Elementos con varios frames: fuego animado o cofre cerrado/abierto.
export const ANIMATED = { hoguera: [0, 1, 0, 2], antorcha: [0, 1, 0, 2], molino: [0, 1, 2, 3] };
const FRAMES = { hoguera: 3, antorcha: 3, cofre: 2, molino: 4 };
const RATE = { molino: 5 };
export const propKey = (biome, p) => `p_${biome}_${p.k}_${FRAMES[p.k] ? 0 : p.v}`;

// Genera (una vez por piso) las texturas de los elementos usados en la región.
export function ensurePropTextures(scene, biomeKey, B, props) {
  const done = new Set();
  for (const p of props) {
    const key = propKey(biomeKey, p);
    if (done.has(key) || scene.textures.exists(key)) continue;
    done.add(key);
    if (FRAMES[p.k]) {
      addStrip(scene, key, Array.from({ length: FRAMES[p.k] }, (_, f) => drawProp(p.k, B, f)));
      if (ANIMATED[p.k]) {
        if (scene.anims.exists(`${key}_anim`)) scene.anims.remove(`${key}_anim`);
        scene.anims.create({ key: `${key}_anim`, frames: scene.anims.generateFrameNumbers(key, { frames: ANIMATED[p.k] }), frameRate: RATE[p.k] || 8, repeat: -1 });
      }
    } else {
      addStrip(scene, key, [drawProp(p.k, B, p.v)]);
    }
  }
}
