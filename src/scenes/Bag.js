import Phaser from 'phaser';
import { GAME_W } from '../constants.js';
import { createControls } from '../ui/controls.js';
import { Menu } from '../ui/Menu.js';
import { TextBox } from '../ui/TextBox.js';
import { drawBox } from '../gfx/misc.js';
import { pixelText, RARITY_STYLE } from '../gfx/font.js';
import { measure, wrap } from '../gfx/fontGlyphs.js';
import { CONSUMABLES } from '../data/items.js';
import { audio } from '../audio/audio.js';
import { getRun } from '../core/state.js';
import { derive, equip } from '../core/character.js';
import { describeItem, fit } from '../ui/itemText.js';
import { ensureHeroTextures } from '../gfx/heroTextures.js';
import { ensureItemIcon } from '../gfx/itemArt.js';

const POCKETS = ['Consumibles', 'Equipo'];
const SHORT_SLOT = { arma: 'Arma', armadura: 'Armad.', reliquia: 'Reliq.' };
const ROWS = 6;

// Mochila a pantalla completa (como la BOLSA de Pokémon GBA): bolsillos, lista y descripción.
export class Bag extends Phaser.Scene {
  constructor() {
    super('Bag');
  }

  create() {
    this.run = getRun(this);
    this.controls = createControls(this);
    this.add.image(0, 0, 'battle_bg').setOrigin(0, 0);
    this.add.rectangle(0, 112, GAME_W, 48, 0x14121a).setOrigin(0, 0);
    drawBox(this.add.graphics(), 4, 4, 88, 24);
    drawBox(this.add.graphics(), 4, 30, 88, 80);
    drawBox(this.add.graphics(), 94, 4, 142, 106);
    drawBox(this.add.graphics(), 0, 112, 240, 48);
    this.pocketLabel = pixelText(this, 12, 10, '', 'box');
    // Vista previa: el personaje con lo que lleva puesto ahora mismo.
    this.hero = this.add.sprite(76, 106, ensureHeroTextures(this, this.run.player.equipment).key, 0).setOrigin(0.5, 1);
    // Icono grande del objeto seleccionado.
    this.icon = this.add.image(76, 50, '__DEFAULT').setVisible(false);
    this.sideText = [0, 1, 2, 3, 4].map((i) => pixelText(this, 12, 38 + i * 13, '', 'box'));
    this.rows = Array.from({ length: ROWS }, (_, i) => ({
      name: pixelText(this, 110, 13 + i * 16, '', 'box'),
      count: pixelText(this, 0, 13 + i * 16, '', 'box'),
    }));
    this.cursor = this.add.image(102, 15, 'ui_cursor').setOrigin(0, 0);
    this.desc = [0, 1, 2].map((i) => pixelText(this, 10, 118 + i * 13, '', 'box'));
    this.textbox = new TextBox(this, this.controls);
    this.pocket = 0;
    this.index = 0;
    this.scroll = 0;
    this.busy = false;
    this.refresh();
  }

  entries() {
    const { bag } = this.run;
    if (this.pocket === 0) {
      return Object.entries(bag.consumables).filter(([, n]) => n > 0).map(([key, n]) => ({ kind: 'consumable', key, count: n }));
    }
    return bag.gear;
  }

  refresh() {
    const list = this.entries();
    this.index = Math.min(this.index, Math.max(0, list.length - 1));
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + ROWS) this.scroll = this.index - ROWS + 1;
    this.pocketLabel.setText(`< ${POCKETS[this.pocket]} >`);
    this.rows.forEach((row, i) => {
      const it = list[this.scroll + i];
      if (!it) {
        row.name.setText('');
        row.count.setText('');
        return;
      }
      const label = it.kind === 'consumable' ? CONSUMABLES[it.key].name : it.name;
      const style = it.kind === 'consumable' ? 'box' : RARITY_STYLE[it.rarity];
      row.name.setFont(`font_${style}`).setText(fit(label, 104));
      const count = it.kind === 'consumable' ? `x${it.count}` : '';
      row.count.setText(count).setX(228 - measure(count));
    });
    this.cursor.setVisible(list.length > 0).setY(15 + (this.index - this.scroll) * 16);

    this.hero.setTexture(ensureHeroTextures(this, this.run.player.equipment).key, 0);
    const d = derive(this.run.player);
    const side = this.pocket === 0
      ? [`PS ${this.run.player.hp}/${d.maxHp}`, '', 'Z: usar', 'X: salir']
      : [`Maná ${d.manaUsed}/${d.manaCap}`, ...Object.entries(this.run.player.equipment).map(([k, v]) => `${SHORT_SLOT[k]}: ${v ? 'sí' : '-'}`)];
    this.sideText.forEach((t, i) => t.setText(side[i] || ''));

    const sel = list[this.index];
    if (sel) this.icon.setTexture(ensureItemIcon(this, sel)).setVisible(true);
    else this.icon.setVisible(false);
    const lines = sel ? wrap(describeItem(sel), 222) : ['Vacío.'];
    this.desc.forEach((t, i) => t.setText(lines[i] || ''));
  }

  async act(item) {
    this.busy = true;
    const isGear = item.kind === 'equip';
    const options = isGear ? ['Equipar', 'Tirar', 'Cancelar'] : ['Usar', 'Cancelar'];
    const menu = new Menu(this, this.controls, { x: 150, y: 50, w: 80, h: 12 + options.length * 16, items: options.map((label) => ({ label })) });
    const choice = await menu.open(0);
    menu.destroy();
    const label = options[choice] || 'Cancelar';
    const { player, bag } = this.run;
    if (label === 'Usar') {
      const c = CONSUMABLES[item.key];
      if (c.heal) {
        const max = derive(player).maxHp;
        if (player.hp >= max) {
          await this.say('Ya estás en plena forma.');
        } else {
          const before = player.hp;
          player.hp = Math.min(max, player.hp + c.heal);
          bag.consumables[item.key] -= 1;
          audio.sfx('heal');
          await this.say(`Recuperas ${player.hp - before} PS.`);
        }
      } else {
        await this.say('No tiene efecto fuera de combate.');
      }
    } else if (label === 'Equipar') {
      const res = equip(player, bag.gear, item);
      if (res.ok) {
        audio.sfx('confirm');
        await this.say(res.replaced ? `Equipas ${item.name} y guardas ${res.replaced.name}.` : `Equipas ${item.name}.`);
      } else {
        audio.sfx('bump');
        await this.say(res.reason);
      }
    } else if (label === 'Tirar') {
      bag.gear.splice(bag.gear.indexOf(item), 1);
      await this.say(`Dejas ${item.name} en la oscuridad.`);
    }
    this.textbox.hide();
    this.busy = false;
    this.refresh();
  }

  say(text) {
    return this.textbox.say(text);
  }

  update() {
    if (this.busy) return;
    const c = this.controls;
    const d = c.justDir();
    const list = this.entries();
    if (d === 'left' || d === 'right') {
      this.pocket = (this.pocket + 1) % POCKETS.length;
      this.index = 0;
      this.scroll = 0;
      audio.sfx('cursor');
      this.refresh();
    } else if ((d === 'up' || d === 'down') && list.length) {
      this.index = (this.index + (d === 'up' ? -1 : 1) + list.length) % list.length;
      audio.sfx('cursor');
      this.refresh();
    }
    if (c.confirm() && list[this.index]) {
      audio.sfx('confirm');
      this.act(list[this.index]);
    } else if (c.cancel() || c.start()) {
      audio.sfx('cancel');
      this.scene.resume('Overworld');
      this.scene.stop();
    }
  }
}
