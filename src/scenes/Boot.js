import Phaser from 'phaser';
import { registerFonts } from '../gfx/font.js';
import { buildMisc } from '../gfx/misc.js';
import { buildPlayerOverworld, buildPlayerBack, buildNpcFrames, NPC_PALETTES } from '../gfx/playerSprites.js';
import { addStrip } from '../gfx/pixelBuffer.js';

// Genera todo el arte en tiempo de arranque: el juego no depende de archivos de imagen.
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    registerFonts(this);
    buildMisc(this);
    addStrip(this, 'player', buildPlayerOverworld());
    addStrip(this, 'player_back', [buildPlayerBack()]);
    for (const key of Object.keys(NPC_PALETTES)) addStrip(this, `npc_${key}`, buildNpcFrames(key));

    const anims = { down: 0, up: 3, left: 6, right: 9 };
    for (const [dir, base] of Object.entries(anims)) {
      this.anims.create({
        key: `walk_${dir}`,
        frames: [{ key: 'player', frame: base + 1 }, { key: 'player', frame: base }, { key: 'player', frame: base + 2 }, { key: 'player', frame: base }],
        frameRate: 10,
        repeat: -1,
      });
    }
    this.anims.create({ key: 'torch_burn', frames: this.anims.generateFrameNumbers('torch', { frames: [0, 1, 0, 2] }), frameRate: 7, repeat: -1 });

    this.scene.start('Title');
  }
}
