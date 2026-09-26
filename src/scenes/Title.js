import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants.js';
import { pixelText } from '../gfx/font.js';
import { measure } from '../gfx/fontGlyphs.js';
import { PAL, hexToInt } from '../palette.js';
import { createControls } from '../ui/controls.js';
import { audio } from '../audio/audio.js';
import { newRun, setRun } from '../core/state.js';

export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    this.controls = createControls(this);
    this.add.image(0, 0, 'battle_bg').setOrigin(0, 0);
    this.add.rectangle(0, 112, GAME_W, 48, hexToInt(PAL.ink)).setOrigin(0, 0);
    this.add.image(0, 0, 'vignette').setOrigin(0, 0);

    this.embers = Array.from({ length: 24 }, () => this.spawnEmber(this.add.rectangle(0, 0, 1, 1, 0), true));

    const title = 'NEXO';
    this.add.bitmapText(Math.round((GAME_W - measure(title) * 4) / 2), 30, 'font_blood', title).setScale(4);
    const sub = 'Descenso a la mazmorra de mil realidades';
    pixelText(this, Math.round((GAME_W - measure(sub)) / 2), 82, sub, 'dim');
    const prompt = 'Pulsa Z o ENTER';
    this.prompt = pixelText(this, Math.round((GAME_W - measure(prompt)) / 2), 118, prompt, 'light');
    const hint = 'Flechas: mover  Z: aceptar  X: volver  M: silencio';
    pixelText(this, Math.round((GAME_W - measure(hint)) / 2), 140, hint, 'dim');

    if (audio.ready) audio.playMusic('titulo');
    this.cameras.main.fadeIn(400);
    this.starting = false;
  }

  spawnEmber(r, anywhere = false) {
    const color = Phaser.Utils.Array.GetRandom([PAL.ember1, PAL.blood3, PAL.ember2]);
    r.setFillStyle(hexToInt(color));
    r.setPosition(Phaser.Math.Between(0, GAME_W), anywhere ? Phaser.Math.Between(0, 112) : 112);
    r.speed = Phaser.Math.FloatBetween(4, 14);
    r.drift = Phaser.Math.FloatBetween(-3, 3);
    r.setOrigin(0, 0);
    return r;
  }

  update(time, delta) {
    for (const e of this.embers) {
      e.y -= (e.speed * delta) / 1000;
      e.x += (Math.sin((time / 700) + e.speed) * e.drift * delta) / 1000;
      if (e.y < 0) this.spawnEmber(e);
    }
    this.prompt.setVisible(Math.floor(time / 500) % 2 === 0 || this.starting);
    if (!this.starting && this.controls.confirm()) {
      this.starting = true;
      audio.init();
      audio.sfx('confirm');
      audio.stopMusic();
      setRun(this, newRun());
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Overworld'));
    }
  }
}
