import Phaser from 'phaser';
import { registerFonts } from '../gfx/font.js';
import { buildMisc, buildBattleBackdrops } from '../gfx/misc.js';
import { BIOMES } from '../world/biomes.js';
import { buildNpcFrames, NPC_LOOKS } from '../gfx/heroArt.js';
import { addStrip } from '../gfx/pixelBuffer.js';

// Genera todo el arte en tiempo de arranque: el juego no depende de archivos de imagen.
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    registerFonts(this);
    buildMisc(this);
    buildBattleBackdrops(this, BIOMES);
    for (const key of Object.keys(NPC_LOOKS)) addStrip(this, `npc_${key}`, buildNpcFrames(key));

    this.scene.start('Title');
  }
}
