import Phaser from 'phaser';
import { createControls } from '../ui/controls.js';
import { Menu } from '../ui/Menu.js';
import { TextBox } from '../ui/TextBox.js';
import { drawBox } from '../gfx/misc.js';
import { pixelText, RARITY_STYLE } from '../gfx/font.js';
import { measure } from '../gfx/fontGlyphs.js';
import { PAL, hexToInt } from '../palette.js';
import { audio } from '../audio/audio.js';
import { getRun } from '../core/state.js';
import { ATTRS, ATTR_LABEL, SLOTS, SLOT_LABEL, derive, allocate, unequip, xpToNext } from '../core/character.js';
import { fit } from '../ui/itemText.js';

// Pantalla de estado (como el RESUMEN de Pokémon): atributos, asignación de puntos y equipo.
export class Status extends Phaser.Scene {
  constructor() {
    super('Status');
  }

  create() {
    this.run = getRun(this);
    this.controls = createControls(this);
    this.add.image(0, 0, 'battle_bg').setOrigin(0, 0);
    drawBox(this.add.graphics(), 0, 0, 240, 40);
    drawBox(this.add.graphics(), 0, 40, 124, 72);
    drawBox(this.add.graphics(), 124, 40, 116, 72);
    drawBox(this.add.graphics(), 0, 112, 240, 48);
    this.add.sprite(22, 34, 'player', 0).setOrigin(0.5, 1);
    this.head = pixelText(this, 38, 8, '', 'box');
    this.xpText = pixelText(this, 38, 21, '', 'box');
    this.hpText = pixelText(this, 150, 8, '', 'box');
    this.hpBar = this.add.graphics();
    this.pointsText = pixelText(this, 150, 21, '', 'blood');
    this.attrRows = ATTRS.map((a, i) => ({ label: pixelText(this, 18, 47 + i * 14, ATTR_LABEL[a], 'box'), value: pixelText(this, 0, 47 + i * 14, '', 'box') }));
    this.derived = [0, 1, 2, 3, 4].map((i) => pixelText(this, 134, 46 + i * 12, '', 'box'));
    this.equipRows = SLOTS.map((s, i) => ({ label: pixelText(this, 18, 117 + i * 13, `${SLOT_LABEL[s]}:`, 'box'), value: pixelText(this, 72, 117 + i * 13, '', 'box') }));
    this.cursor = this.add.image(0, 0, 'ui_cursor').setOrigin(0, 0);
    this.textbox = new TextBox(this, this.controls);
    this.index = 0;
    this.busy = false;
    this.refresh();
  }

  entries() {
    return [...ATTRS.map((a) => ({ type: 'attr', key: a })), ...SLOTS.map((s) => ({ type: 'slot', key: s }))];
  }

  refresh() {
    const p = this.run.player;
    const d = derive(p);
    this.head.setText(`${p.name}   Nv ${p.level}`);
    this.xpText.setText(`EXP ${p.xp}/${xpToNext(p.level)}`);
    this.hpText.setText(`PS ${p.hp}/${d.maxHp}`);
    const ratio = p.hp / d.maxHp;
    this.hpBar.clear().fillStyle(hexToInt(PAL.ink)).fillRect(149, 32, 82, 5).fillStyle(hexToInt(PAL.stone1)).fillRect(150, 33, 80, 3)
      .fillStyle(hexToInt(ratio > 0.5 ? PAL.hpGreen : ratio > 0.2 ? PAL.hpYellow : PAL.hpRed)).fillRect(150, 33, Math.ceil(80 * ratio), 3);
    this.pointsText.setText(p.points ? `Puntos: ${p.points}` : '');
    ATTRS.forEach((a, i) => {
      const v = `${p.attrs[a]}${p.points ? ' +' : ''}`;
      this.attrRows[i].value.setText(v).setX(112 - measure(v));
    });
    const lines = [`ATQ ${d.str}`, `DEF ${d.def}`, `VEL ${d.spd}`, `INT ${d.int}`, `Maná ${d.manaUsed}/${d.manaCap}`];
    this.derived.forEach((t, i) => t.setText(lines[i]));
    SLOTS.forEach((s, i) => {
      const it = p.equipment[s];
      const row = this.equipRows[i].value;
      if (!it) row.setFont('font_faded').setText('(vacío)');
      else row.setFont(`font_${d.desynced.includes(s) ? 'faded' : RARITY_STYLE[it.rarity]}`).setText(fit(`${it.name}${d.desynced.includes(s) ? ' (desinc.)' : ''}`, 160));
    });
    const e = this.entries()[this.index];
    if (e.type === 'attr') this.cursor.setPosition(9, 49 + ATTRS.indexOf(e.key) * 14);
    else this.cursor.setPosition(9, 119 + SLOTS.indexOf(e.key) * 13);
  }

  async choose(e) {
    const p = this.run.player;
    if (e.type === 'attr') {
      if (allocate(p, e.key)) audio.sfx('confirm');
      else audio.sfx('bump');
      this.refresh();
      return;
    }
    const it = p.equipment[e.key];
    if (!it) {
      audio.sfx('bump');
      return;
    }
    this.busy = true;
    const menu = new Menu(this, this.controls, { x: 150, y: 64, w: 84, h: 44, items: [{ label: 'Quitar' }, { label: 'Cancelar' }] });
    const choice = await menu.open(0);
    menu.destroy();
    if (choice === 0) {
      unequip(p, this.run.bag.gear, e.key);
      await this.textbox.say(`Guardas ${it.name} en la mochila.`);
      this.textbox.hide();
    }
    this.busy = false;
    this.refresh();
  }

  update() {
    if (this.busy) return;
    const c = this.controls;
    const d = c.justDir();
    const n = this.entries().length;
    if (d === 'up' || d === 'down') {
      this.index = (this.index + (d === 'up' ? -1 : 1) + n) % n;
      audio.sfx('cursor');
      this.refresh();
    }
    if (c.confirm()) this.choose(this.entries()[this.index]);
    else if (c.cancel() || c.start()) {
      audio.sfx('cancel');
      this.scene.resume('Overworld');
      this.scene.stop();
    }
  }
}
