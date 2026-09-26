import Phaser from 'phaser';
import { GAME_W, DEPTH } from '../constants.js';
import { createControls } from '../ui/controls.js';
import { TextBox } from '../ui/TextBox.js';
import { Menu } from '../ui/Menu.js';
import { drawBox } from '../gfx/misc.js';
import { pixelText } from '../gfx/font.js';
import { measure } from '../gfx/fontGlyphs.js';
import { ensureMonsterTextures } from '../gfx/monsterTextures.js';
import { PAL, hexToInt } from '../palette.js';
import { audio } from '../audio/audio.js';
import { getRun } from '../core/state.js';
import { createRng } from '../core/rng.js';
import { createCombatant, createEnemyCombatant, resolveTurn } from '../core/battle.js';
import { derive, gainXp, xpReward } from '../core/character.js';
import { itemDisplayName } from '../core/loot.js';
import { getStore, getProfile } from '../core/storage.js';
import { MOVES } from '../data/moves.js';
import { CONSUMABLES, RARITY_LABEL } from '../data/items.js';

const ENEMY_BASE = { x: 176, y: 70 };
const PLAYER_BASE = { x: 64, y: 112 };

// Panel de PS con barra verde/amarilla/roja animada, como en Pokémon GBA.
class HpPanel {
  constructor(scene, { x, y, w, h, name, level, showNumbers }) {
    this.scene = scene;
    this.showNumbers = showNumbers;
    this.c = scene.add.container(x, y).setDepth(DEPTH.ui);
    this.c.add(drawBox(scene.add.graphics(), 0, 0, w, h));
    const lv = `Nv${level}`;
    this.c.add(pixelText(scene, 9, 6, name, 'box'));
    this.c.add(pixelText(scene, w - 10 - measure(lv), 6, lv, 'box'));
    this.c.add(pixelText(scene, 9, 18, 'PS', 'blood'));
    this.bar = scene.add.graphics();
    this.c.add(this.bar);
    this.barRect = { x: 24, y: 21, w: w - 34 };
    if (showNumbers) {
      this.nums = pixelText(scene, 0, 25, '', 'box');
      this.c.add(this.nums);
      this.w = w;
    }
  }

  set(hp, max) {
    const { x, y, w } = this.barRect;
    const ratio = Math.max(0, hp / max);
    const color = ratio > 0.5 ? PAL.hpGreen : ratio > 0.2 ? PAL.hpYellow : PAL.hpRed;
    this.bar.clear();
    this.bar.fillStyle(hexToInt(PAL.ink)).fillRect(x - 1, y - 1, w + 2, 5);
    this.bar.fillStyle(hexToInt(PAL.stone1)).fillRect(x, y, w, 3);
    const fw = Math.ceil(w * ratio);
    this.bar.fillStyle(hexToInt(color)).fillRect(x, y, fw, 3);
    this.bar.fillStyle(0xffffff, 0.25).fillRect(x, y, fw, 1);
    if (this.nums) {
      const txt = `${Math.ceil(hp)}/${max}`;
      this.nums.setText(txt).setX(this.w - 10 - measure(txt));
    }
  }

  animate(from, to, max) {
    return new Promise((resolve) => {
      const o = { v: from };
      this.scene.tweens.add({
        targets: o, v: to, duration: Math.min(700, 60 + Math.abs(to - from) * 30),
        onUpdate: () => this.set(o.v, max),
        onComplete: () => { this.set(to, max); resolve(); },
      });
    });
  }
}

export class Battle extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  init(data) {
    this.enemyId = data.enemyId;
    this.template = data.template;
  }

  create() {
    this.run = getRun(this);
    this.controls = createControls(this);
    this.rng = createRng((this.run.seed ^ (this.run.floor * 7919) ^ this.time.now) >>> 0);
    const { template } = this;
    this.enemy = createEnemyCombatant(template);
    this.player = this.buildPlayerCombatant();

    this.add.image(0, 0, 'battle_bg').setOrigin(0, 0);
    const tex = ensureMonsterTextures(this, String(template.seed), template);
    this.enemyGroup = this.add.container(0, 0);
    this.enemyGroup.add(this.add.image(ENEMY_BASE.x, ENEMY_BASE.y - 4, 'platform_enemy'));
    this.enemySprite = this.add.image(ENEMY_BASE.x, ENEMY_BASE.y, tex.big).setOrigin(0.5, 1);
    this.enemyGroup.add(this.enemySprite);
    this.playerGroup = this.add.container(0, 0);
    this.playerGroup.add(this.add.image(PLAYER_BASE.x, PLAYER_BASE.y - 8, 'platform_player'));
    this.playerSprite = this.add.image(PLAYER_BASE.x, PLAYER_BASE.y + 4, 'player_back').setOrigin(0.5, 1);
    this.playerGroup.add(this.playerSprite);

    this.enemyPanel = new HpPanel(this, { x: 4, y: 8, w: 120, h: 32, name: this.enemy.name, level: template.level });
    this.playerPanel = new HpPanel(this, { x: 128, y: 70, w: 108, h: 40, name: this.player.name, level: this.run.player.level, showNumbers: true });
    this.enemyPanel.set(this.enemy.hp, this.enemy.maxHp);
    this.playerPanel.set(this.player.hp, this.player.maxHp);
    this.enemyPanel.c.setVisible(false);
    this.playerPanel.c.setVisible(false);

    this.textbox = new TextBox(this, this.controls);
    this.actionMenu = new Menu(this, this.controls, {
      x: 120, y: 112, w: 120, h: 48, cols: 2, colW: 54, rowH: 16, cancellable: false, padX: 14, padY: 9,
      items: [{ label: 'LUCHAR' }, { label: 'MOCHILA' }, { label: 'HABLAR' }, { label: 'HUIR' }],
    });
    this.moveInfo = pixelText(this, 0, 0, '', 'box').setDepth(DEPTH.ui + 2).setScrollFactor(0).setVisible(false);
    this.moveInfo2 = pixelText(this, 0, 0, '', 'box').setDepth(DEPTH.ui + 2).setScrollFactor(0).setVisible(false);
    this.moveInfoBox = drawBox(this.add.graphics(), 160, 112, 80, 48).setDepth(DEPTH.ui + 1).setVisible(false);
    const moves = this.player.moves;
    this.moveMenu = new Menu(this, this.controls, {
      x: 0, y: 112, w: 160, h: 48, cols: 2, colW: 72, rowH: 16, padX: 14, padY: 9,
      items: moves.map((m) => ({ label: MOVES[m].name })),
      onChange: (i) => this.describeMove(moves[i]),
    });

    audio.playMusic('combate');
    this.cameras.main.fadeIn(200);
    this.flow();
  }

  buildPlayerCombatant() {
    const p = this.run.player;
    const d = derive(p);
    return createCombatant({ name: p.name, maxHp: d.maxHp, str: d.str, def: d.def, spd: d.spd, moves: p.moves }, { hp: p.hp, accBonus: d.accBonus, effects: d.effects });
  }

  // Recalcula stats tras un drenaje o restauración de maná; anuncia ítems (des)sincronizados.
  async applyDerived() {
    const before = derive({ ...this.run.player, manaDrain: this.lastDrain ?? 0 }).desynced;
    this.lastDrain = this.run.player.manaDrain;
    const d = derive(this.run.player);
    Object.assign(this.player, { str: d.str, def: d.def, spd: d.spd, accBonus: d.accBonus, effects: d.effects, maxHp: d.maxHp });
    this.player.hp = Math.min(this.player.hp, d.maxHp);
    this.playerPanel.set(this.player.hp, this.player.maxHp);
    for (const slot of d.desynced.filter((s) => !before.includes(s))) {
      await this.say(`¡${this.run.player.equipment[slot].name} se desincroniza!`);
    }
    for (const slot of before.filter((s) => !d.desynced.includes(s))) {
      await this.say(`${this.run.player.equipment[slot].name} vuelve a sincronizarse.`);
    }
  }

  describeMove(id) {
    const m = MOVES[id];
    const a = m.kind === 'guard' ? 'Reduce daño' : `POT ${m.power}`;
    const b = m.kind === 'guard' ? 'a la mitad' : `PREC ${Math.round(m.acc * 100)}%`;
    this.moveInfo.setText(a).setPosition(170, 122);
    this.moveInfo2.setText(b).setPosition(170, 138);
  }

  setMoveMenuVisible(v) {
    this.moveInfoBox.setVisible(v);
    this.moveInfo.setVisible(v);
    this.moveInfo2.setVisible(v);
  }

  async intro() {
    this.enemyGroup.x = -200;
    this.playerGroup.x = 200;
    await new Promise((resolve) => {
      this.tweens.add({ targets: this.enemyGroup, x: 0, duration: 700, ease: 'Linear' });
      this.tweens.add({ targets: this.playerGroup, x: 0, duration: 700, ease: 'Linear', onComplete: resolve });
    });
    audio.sfx('miss');
    this.enemyPanel.c.setVisible(true);
    await this.say(`¡${this.template.article} ${this.enemy.name} surge de la penumbra!`);
    const loot = this.template.loot;
    if (loot?.kind === 'equip' && loot.rarity !== 'comun') {
      if (loot.rarity !== 'raro') audio.sfx('encounter');
      await this.say(`¡Empuña ${loot.name}! (${RARITY_LABEL[loot.rarity]})`);
      if (loot.rarity === 'legendario') await this.say('Un arma de las que solo existen en los mitos de los muertos.');
      if (loot.rarity === 'unico') await this.say('El aire se dobla a su alrededor. Ese objeto no obedece las leyes de este mundo.');
    }
    this.playerPanel.c.setVisible(true);
  }

  say(text, auto = 0) {
    return this.textbox.say(text, { auto });
  }

  async chooseAction() {
    for (;;) {
      this.textbox.show(`¿Qué hará ${this.player.name}?`);
      const choice = await this.actionMenu.open();
      this.actionMenu.close();
      if (choice === 0) {
        this.textbox.hide();
        this.setMoveMenuVisible(true);
        const i = await this.moveMenu.open(this.lastMove || 0);
        this.moveMenu.close();
        this.setMoveMenuVisible(false);
        if (i >= 0) {
          this.lastMove = i;
          return { type: 'move', move: this.player.moves[i] };
        }
      } else if (choice === 1) {
        const stock = this.run.bag.consumables;
        const keys = Object.keys(CONSUMABLES);
        const bag = new Menu(this, this.controls, {
          x: 96, y: 40, w: 144, h: 16 + (keys.length + 1) * 16, rowH: 16, padY: 9,
          items: [...keys.map((k) => ({ label: `${CONSUMABLES[k].name} x${stock[k] || 0}`, disabled: !stock[k] })), { label: 'Cerrar' }],
        });
        const i = await bag.open();
        bag.destroy();
        if (i >= 0 && i < keys.length) return { type: 'item', item: keys[i] };
      } else if (choice === 2) {
        await this.say(`${this.enemy.name} solo responde con un gruñido gutural.`);
      } else if (choice === 3) {
        return { type: 'flee' };
      }
    }
  }

  async flow() {
    await this.intro();
    let outcome = 'continue';
    while (outcome === 'continue') {
      const action = await this.chooseAction();
      const result = resolveTurn({ player: this.player, enemy: this.enemy, consumables: this.run.bag.consumables }, action, this.rng);
      await this.play(result.events);
      outcome = result.outcome;
    }
    await this.finish(outcome);
  }

  lunge(side) {
    const sprite = side === 'player' ? this.playerSprite : this.enemySprite;
    const dx = side === 'player' ? 8 : -8;
    return new Promise((resolve) => {
      this.tweens.add({ targets: sprite, x: sprite.x + dx, duration: 80, yoyo: true, onComplete: resolve });
    });
  }

  blink(sprite) {
    return new Promise((resolve) => {
      let n = 0;
      this.time.addEvent({
        delay: 70, repeat: 7,
        callback: () => {
          sprite.setVisible(n % 2 === 1);
          n++;
          if (n === 8) { sprite.setVisible(true); resolve(); }
        },
      });
    });
  }

  sink(sprite, baseY) {
    const h = sprite.height;
    return new Promise((resolve) => {
      const o = { v: 0 };
      this.tweens.add({
        targets: o, v: h, duration: 450, ease: 'Quad.in',
        onUpdate: () => { sprite.setCrop(0, 0, sprite.width, h - o.v); sprite.y = baseY + o.v; },
        onComplete: () => { sprite.setVisible(false); resolve(); },
      });
    });
  }

  async play(events) {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const next = events[i + 1];
      switch (ev.type) {
        case 'text':
          await this.say(ev.text, 700);
          if (next && next.type === 'damage') await this.lunge(next.side === 'enemy' ? 'player' : 'enemy');
          break;
        case 'damage': {
          const target = ev.side === 'enemy' ? this.enemy : this.player;
          const panel = ev.side === 'enemy' ? this.enemyPanel : this.playerPanel;
          const sprite = ev.side === 'enemy' ? this.enemySprite : this.playerSprite;
          audio.sfx(ev.crit ? 'crit' : 'hit');
          if (ev.crit) this.cameras.main.shake(200, 0.02);
          await this.blink(sprite);
          await panel.animate(ev.hp + ev.amount, ev.hp, target.maxHp);
          break;
        }
        case 'heal':
          audio.sfx('heal');
          await this.playerPanel.animate(ev.hp - ev.amount, ev.hp, this.player.maxHp);
          break;
        case 'miss':
          audio.sfx('miss');
          break;
        case 'guard':
          audio.sfx('guard');
          break;
        case 'faint':
          audio.sfx('faint');
          if (ev.side === 'enemy') await this.sink(this.enemySprite, ENEMY_BASE.y);
          else await this.sink(this.playerSprite, PLAYER_BASE.y + 4);
          break;
        case 'drain':
          audio.sfx('flee');
          this.run.player.manaDrain += ev.amount;
          await this.say(`¡Tu maná se drena! (-${ev.amount})`);
          await this.applyDerived();
          break;
        case 'restoreMana':
          this.run.player.manaDrain = 0;
          audio.sfx('heal');
          await this.applyDerived();
          break;
        case 'enemyFled':
          audio.sfx('flee');
          await new Promise((r) => this.tweens.add({ targets: this.enemySprite, x: GAME_W + 60, duration: 400, onComplete: r }));
          break;
        default:
          break;
      }
    }
  }

  async rewards() {
    const run = this.run;
    const xp = xpReward(this.template);
    await this.say(`Ganas ${xp} puntos de experiencia.`);
    const levels = gainXp(run.player, xp);
    for (let i = levels - 1; i >= 0; i--) {
      audio.sfx('heal');
      await this.say(`¡${run.player.name} sube al nivel ${run.player.level - i}! (+3 puntos de atributo)`);
    }
    if (levels) await this.say('Asigna tus puntos en ESTADO (Enter).');
    const loot = this.template.loot;
    if (!loot) return;
    if (loot.kind === 'consumable') run.bag.consumables[loot.key] = (run.bag.consumables[loot.key] || 0) + 1;
    else run.bag.gear.push(loot);
    if (loot.kind === 'equip' && loot.rarity !== 'comun' && loot.rarity !== 'raro') audio.sfx('encounter');
    const tag = loot.kind === 'equip' ? ` (${RARITY_LABEL[loot.rarity]})` : '';
    await this.say(`${this.enemy.name} deja caer ${itemDisplayName(loot)}${tag}.`);
  }

  async finish(outcome) {
    const run = this.run;
    if (outcome !== 'lose') {
      run.player.hp = this.player.hp;
      run.player.manaDrain = 0;
    }
    if (outcome === 'win') {
      audio.playMusic('victoria');
      run.defeated.push(this.enemyId);
      await this.say(`Has sobrevivido a ${this.template.article.toLowerCase()} ${this.enemy.name}.`);
      await this.rewards();
    } else if (outcome === 'enemyFled') {
      run.defeated.push(this.enemyId);
    } else if (outcome === 'fled') {
      audio.sfx('flee');
      run.sightGrace = this.enemyId;
    } else if (outcome === 'lose') {
      audio.playMusic('derrota');
      await this.say(`Has caído en el piso ${run.floor}. La mazmorra te reclama.`);
      // Permamuerte parcial: la partida se pierde; el perfil (pity y récords) permanece.
      const profile = getProfile(this);
      profile.deaths += 1;
      profile.deepest = Math.max(profile.deepest, run.floor);
      try {
        const store = getStore();
        await store.deleteRun();
        await store.saveProfile(profile);
      } catch (err) {
        console.warn(err);
      }
    }
    this.textbox.hide();
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (outcome === 'lose') {
        audio.stopMusic();
        this.registry.remove('run');
        this.scene.start('Title');
      } else {
        this.scene.start('Overworld');
      }
    });
  }
}
