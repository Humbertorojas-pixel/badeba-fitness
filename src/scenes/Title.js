import Phaser from 'phaser';
import { GAME_W } from '../constants.js';
import { pixelText } from '../gfx/font.js';
import { measure } from '../gfx/fontGlyphs.js';
import { PAL, hexToInt } from '../palette.js';
import { createControls } from '../ui/controls.js';
import { Menu } from '../ui/Menu.js';
import { TextBox } from '../ui/TextBox.js';
import { audio } from '../audio/audio.js';
import { newRun, setRun } from '../core/state.js';
import { getStore, isPersistent } from '../core/storage.js';

const center = (text) => Math.round((GAME_W - measure(text)) / 2);

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
    pixelText(this, center(sub), 82, sub, 'dim');
    const prompt = 'Pulsa Z o ENTER';
    this.prompt = pixelText(this, center(prompt), 118, prompt, 'light');
    const hint = 'Flechas: mover  Z: aceptar  X: volver  M: silencio';
    this.hint = pixelText(this, center(hint), 140, hint, 'dim');
    this.textbox = new TextBox(this, this.controls);

    // Carga del perfil y de la partida en paralelo mientras se muestra el título.
    const store = getStore();
    this.loading = Promise.all([store.loadProfile(), store.loadRun()]).then(([profile, saved]) => {
      this.registry.set('profile', profile);
      this.saved = saved;
    });

    if (audio.ready) audio.playMusic('titulo');
    this.cameras.main.fadeIn(400);
    this.phase = 'press';
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

  async openMenu() {
    this.phase = 'menu';
    audio.init();
    audio.sfx('confirm');
    audio.playMusic('titulo');
    await this.loading;
    this.prompt.setVisible(false);
    this.hint.setVisible(false);
    const saved = this.saved;
    const items = [];
    if (saved) items.push({ label: `CONTINUAR  (Piso ${saved.run.floor} · Nv ${saved.run.player.level})`, action: 'continue' });
    items.push({ label: 'NUEVA PARTIDA', action: 'new' });
    const profile = this.registry.get('profile');
    const menu = new Menu(this, this.controls, { x: 24, y: 96, w: 192, h: 16 + items.length * 16, rowH: 16, padY: 9, cancellable: false, items });
    if (!isPersistent()) pixelText(this, 28, 147, 'Aviso: este navegador no permite guardar.', 'blood');
    else if (profile.deepest) pixelText(this, 28, 147, `Récord: piso ${profile.deepest} · Caídas: ${profile.deaths}`, 'dim');
    for (;;) {
      const i = await menu.open(0);
      const { action } = items[i];
      if (action === 'continue') {
        saved.run.locationShown = null;
        return this.start(saved.run, saved.recovered);
      }
      menu.close();
      if (saved) {
        await this.textbox.say('Empezar de nuevo borrará tu partida actual. ¿Seguro?', { hold: true });
        const confirm = new Menu(this, this.controls, { x: 176, y: 64, w: 60, h: 46, items: [{ label: 'Sí' }, { label: 'No' }] });
        const c = await confirm.open(1);
        confirm.destroy();
        this.textbox.hide();
        if (c !== 0) continue;
        await getStore().deleteRun();
      }
      profile.runs += 1;
      return this.start(newRun(), false);
    }
  }

  start(run, recovered) {
    if (recovered) run.pendingMessage = 'Tu partida estaba dañada: se restauró el respaldo válido más reciente.';
    setRun(this, run);
    audio.stopMusic();
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Overworld'));
  }

  update(time, delta) {
    for (const e of this.embers) {
      e.y -= (e.speed * delta) / 1000;
      e.x += (Math.sin((time / 700) + e.speed) * e.drift * delta) / 1000;
      if (e.y < 0) this.spawnEmber(e);
    }
    if (this.phase === 'press') {
      this.prompt.setVisible(Math.floor(time / 500) % 2 === 0);
      if (this.controls.confirm()) this.openMenu();
    }
  }
}
