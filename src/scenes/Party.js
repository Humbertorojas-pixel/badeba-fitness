import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants.js';
import { createControls } from '../ui/controls.js';
import { Menu } from '../ui/Menu.js';
import { TextBox } from '../ui/TextBox.js';
import { drawBox } from '../gfx/misc.js';
import { pixelText } from '../gfx/font.js';
import { measure, wrap } from '../gfx/fontGlyphs.js';
import { PAL, hexToInt } from '../palette.js';
import { audio } from '../audio/audio.js';
import { getRun } from '../core/state.js';
import { ensureMonsterTextures } from '../gfx/monsterTextures.js';
import { DIR_FRAME_BASE } from '../gfx/heroArt.js';
import { PARTY_MAX, companionXpToNext } from '../core/party.js';
import { ROLE_LABEL, CUTE } from '../data/cute.js';
import { MOVES } from '../data/moves.js';
import { fit } from '../ui/itemText.js';

const TABS = ['Equipo', 'Misiones'];
const QUEST_STATE = { activa: 'En curso', cumplida: '¡Cumplida! Vuelve con', entregada: 'Entregada' };

// EQUIPO: tus compañeros (y despedirlos) y las misiones aceptadas en este piso.
export class Party extends Phaser.Scene {
  constructor() {
    super('Party');
  }

  create() {
    this.run = getRun(this);
    this.controls = createControls(this);
    this.add.rectangle(0, 0, GAME_W, GAME_H, hexToInt(PAL.ink)).setOrigin(0, 0);
    this.add.image(0, 0, 'battle_bg').setOrigin(0, 0).setAlpha(0.5);
    drawBox(this.add.graphics(), 0, 0, GAME_W, 22);
    this.tabText = pixelText(this, 8, 5, '', 'box');
    this.hint = pixelText(this, 0, 5, '', 'faded');
    this.layer = this.add.container(0, 0);
    this.textbox = new TextBox(this, this.controls);
    this.tab = 0;
    this.index = 0;
    this.busy = false;
    this.refresh();
    audio.sfx('confirm');
  }

  refresh() {
    this.layer.removeAll(true);
    const hint = this.tab === 1 ? '< > equipo' : (this.run.party || []).length ? 'Z: despedir   < > misiones' : '< > misiones';
    this.tabText.setText(`${TABS[this.tab]}`);
    this.hint.setText(hint).setX(GAME_W - 8 - measure(hint));
    if (this.tab === 0) this.drawParty();
    else this.drawQuests();
  }

  drawParty() {
    const party = this.run.party || [];
    if (!party.length) {
      const g = drawBox(this.add.graphics(), 0, 24, GAME_W, 136);
      this.layer.add(g);
      const lines = wrap('Aún viajas solo. Vence a las criaturas adorables que brillan en la región, o ayuda a quien te pida algo: podrían acompañarte.', GAME_W - 24);
      lines.forEach((l, i) => this.layer.add(pixelText(this, 12, 34 + i * 13, l, 'box')));
      return;
    }
    this.index = Math.min(this.index, party.length - 1);
    party.forEach((c, i) => {
      const y = 24 + i * 68;
      const box = drawBox(this.add.graphics(), 0, y, GAME_W, 66, i === this.index ? { border: PAL.ember0 } : undefined);
      this.layer.add(box);
      let sprite;
      if (c.kind === 'criatura') {
        const tex = ensureMonsterTextures(this, c.id, c.template);
        sprite = this.add.sprite(26, y + 44, tex.small).setOrigin(0.5, 1).play(`${tex.small}_anim`).setScale(1);
      } else {
        sprite = this.add.sprite(26, y + 48, `npc_${c.palette}`, DIR_FRAME_BASE.down).setOrigin(0.5, 1);
      }
      this.layer.add(sprite);
      const head = `${c.name}  Nv${c.level}`;
      this.layer.add(pixelText(this, 46, y + 5, head, 'box'));
      this.layer.add(pixelText(this, GAME_W - 12 - measure(ROLE_LABEL[c.role]), y + 5, ROLE_LABEL[c.role], c.role === 'cura' ? 'rare' : c.role === 'guardia' ? 'legend' : 'blood'));
      const ratio = Math.max(0, c.hp / c.maxHp);
      const bar = this.add.graphics();
      bar.fillStyle(hexToInt(PAL.ink)).fillRect(45, y + 18, 82, 5).fillStyle(hexToInt(PAL.stone1)).fillRect(46, y + 19, 80, 3)
        .fillStyle(hexToInt(ratio > 0.5 ? PAL.hpGreen : ratio > 0.2 ? PAL.hpYellow : PAL.hpRed)).fillRect(46, y + 19, Math.ceil(80 * ratio), 3);
      this.layer.add(bar);
      this.layer.add(pixelText(this, 132, y + 16, c.hp > 0 ? `PS ${c.hp}/${c.maxHp}` : 'Debilitado', c.hp > 0 ? 'box' : 'blood'));
      this.layer.add(pixelText(this, 46, y + 27, `ATQ ${c.str}  DEF ${c.def}  VEL ${c.spd}   EXP ${c.xp}/${companionXpToNext(c.level)}`, 'faded'));
      const extra = c.kind === 'criatura' ? CUTE[c.species]?.desc : c.title;
      this.layer.add(pixelText(this, 46, y + 38, fit(c.moves.map((m) => MOVES[m]?.name || m).join(', '), GAME_W - 58), 'box'));
      if (extra) this.layer.add(pixelText(this, 12, y + 50, fit(extra, GAME_W - 24), 'faded'));
    });
    if (party.length < PARTY_MAX) {
      const y = 24 + party.length * 68;
      this.layer.add(drawBox(this.add.graphics(), 0, y, GAME_W, 66));
      this.layer.add(pixelText(this, 12, y + 8, `Hueco libre (${party.length}/${PARTY_MAX})`, 'faded'));
      wrap('Vence a una criatura adorable que brille o cumple la misión de alguien que te pida ayuda.', GAME_W - 24)
        .slice(0, 3).forEach((l, i) => this.layer.add(pixelText(this, 12, y + 24 + i * 12, l, 'box')));
    }
  }

  drawQuests() {
    const quests = (this.run.quests || []).filter((q) => q.floor === this.run.floor);
    this.layer.add(drawBox(this.add.graphics(), 0, 24, GAME_W, 136));
    if (!quests.length) {
      wrap('No tienes misiones en este piso. Habla con la gente de las aldeas y con quien vague solo: algunos necesitan ayuda.', GAME_W - 24)
        .forEach((l, i) => this.layer.add(pixelText(this, 12, 34 + i * 13, l, 'box')));
      return;
    }
    let y = 32;
    for (const q of quests) {
      const style = q.status === 'cumplida' ? 'legend' : q.status === 'entregada' ? 'faded' : 'box';
      const head = `${q.giver}: ${QUEST_STATE[q.status]}${q.status === 'cumplida' ? ` ${q.giver.split(' ')[0]}` : ''}`;
      this.layer.add(pixelText(this, 12, y, fit(head, GAME_W - 24), style));
      y += 12;
      for (const l of wrap(q.summary, GAME_W - 32).slice(0, 2)) {
        this.layer.add(pixelText(this, 20, y, l, 'dim'));
        y += 11;
      }
      y += 4;
      if (y > 148) break;
    }
  }

  async choose() {
    const party = this.run.party || [];
    const c = party[this.index];
    if (this.tab !== 0 || !c) return;
    this.busy = true;
    const menu = new Menu(this, this.controls, { x: 150, y: 40, w: 84, h: 44, items: [{ label: 'Despedir' }, { label: 'Cancelar' }] });
    const choice = await menu.open(1);
    menu.destroy();
    if (choice === 0) {
      party.splice(this.index, 1);
      audio.sfx('cancel');
      await this.textbox.say(`${c.name} se despide. Quizá volváis a cruzaros.`);
      this.textbox.hide();
      this.index = 0;
    }
    this.busy = false;
    this.refresh();
  }

  update() {
    if (this.busy) return;
    const c = this.controls;
    const d = c.justDir();
    if (d === 'left' || d === 'right') {
      this.tab = (this.tab + 1) % TABS.length;
      audio.sfx('cursor');
      this.refresh();
    } else if ((d === 'up' || d === 'down') && this.tab === 0 && (this.run.party || []).length > 1) {
      this.index = (this.index + 1) % this.run.party.length;
      audio.sfx('cursor');
      this.refresh();
    }
    if (c.confirm()) this.choose();
    else if (c.cancel() || c.start()) {
      audio.sfx('cancel');
      this.scene.resume('Overworld');
      this.scene.stop();
    }
  }
}
