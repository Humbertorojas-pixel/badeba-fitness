import Phaser from 'phaser';
import { TILE, WALK_MS, TURN_GRACE_MS, DEPTH, GAME_W } from '../constants.js';
import { createControls } from '../ui/controls.js';
import { TextBox } from '../ui/TextBox.js';
import { Menu } from '../ui/Menu.js';
import { drawBox } from '../gfx/misc.js';
import { pixelText } from '../gfx/font.js';
import { measure } from '../gfx/fontGlyphs.js';
import { ensureMonsterTextures } from '../gfx/monsterTextures.js';
import { DIR_FRAME_BASE } from '../gfx/playerSprites.js';
import { audio } from '../audio/audio.js';
import { getRun } from '../core/state.js';
import { computeTiles, isBlocked } from '../world/floor.js';
import { generateFloor } from '../world/generate.js';
import { BIOMES } from '../world/biomes.js';
import { buildTileset } from '../gfx/tiles.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SIGHT = 3;

export class Overworld extends Phaser.Scene {
  constructor() {
    super('Overworld');
  }

  create() {
    this.run = getRun(this);
    this.controls = createControls(this);
    if (this.run.purgeTextures) {
      this.run.purgeTextures = false;
      for (const key of this.textures.getTextureKeys()) {
        if (key.startsWith('mon_') || key.startsWith('tiles_f')) this.textures.remove(key);
      }
    }
    if (!this.run.floorData) this.buildFloorData();
    const floor = this.run.floorData;
    this.floor = floor;

    const tilesKey = `tiles_f${this.run.floor}`;
    if (!this.textures.exists(tilesKey)) {
      buildTileset(this, BIOMES[floor.biome].tiles, floor.fragment ? BIOMES[floor.fragment.biome].tiles : null, tilesKey);
    }
    const map = this.make.tilemap({ data: computeTiles(floor), tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(tilesKey, tilesKey, TILE, TILE, 0, 0);
    map.createLayer(0, tileset, 0, 0).setDepth(DEPTH.floor);

    for (const t of floor.torches) {
      this.add.image(t.x * TILE + 8, (t.y + 1) * TILE + 2, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.decal);
      this.add.sprite(t.x * TILE, t.y * TILE, 'torch').setOrigin(0, 0).setDepth(DEPTH.decal).play({ key: 'torch_burn', startFrame: (t.x + t.y) % 3 });
    }

    this.enemies = floor.enemies
      .filter((e) => !this.run.defeated.includes(e.id))
      .map((e) => {
        const tex = ensureMonsterTextures(this, String(e.template.seed), e.template);
        const shadow = this.add.image(e.x * TILE + 8, e.y * TILE + 15, 'shadow').setDepth(DEPTH.entity - 1);
        const sprite = this.add.image(e.x * TILE + 8, e.y * TILE + 15, tex.small).setOrigin(0.5, 1);
        sprite.setDepth(DEPTH.entity + e.y);
        this.tweens.add({ targets: sprite, y: sprite.y - 1, duration: 500, yoyo: true, repeat: -1, ease: 'Stepped', delay: (e.x * 97) % 400 });
        return { ...e, sprite, shadow };
      });

    const pos = this.run.pos || floor.start;
    this.tile = { x: pos.x, y: pos.y };
    this.facing = this.run.facing || 'down';
    this.player = this.add.sprite(0, 0, 'player', DIR_FRAME_BASE[this.facing]).setOrigin(0.5, 1);
    this.placePlayer();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, floor.w * TILE, floor.h * TILE);
    cam.startFollow(this.player, true);
    cam.setRoundPixels(true);

    this.add.image(0, 0, 'vignette').setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay);
    this.textbox = new TextBox(this, this.controls);
    this.busy = false;
    this.moving = false;
    this.turnLock = 0;
    this.lastBump = 0;

    audio.playMusic(this.musicHere());
    cam.fadeIn(350);
    if (this.run.locationShown !== this.run.floor) {
      this.run.locationShown = this.run.floor;
      this.showLocation();
    }
    if (!this.run.introShown) {
      this.run.introShown = true;
      this.dialog('Despiertas sobre piedra húmeda. El aire huele a hierro y a cera quemada.');
    }
  }

  buildFloorData() {
    this.run.floorData = generateFloor({ runSeed: this.run.seed, depth: this.run.floor });
    this.run.pos = null;
  }

  inFragment() {
    const frag = this.floor.fragment;
    return !!frag && frag.cells.has(this.tile.y * this.floor.w + this.tile.x);
  }

  musicHere() {
    return this.inFragment() ? BIOMES[this.floor.fragment.biome].music : this.floor.music;
  }

  placePlayer() {
    this.player.setPosition(this.tile.x * TILE + 8, this.tile.y * TILE + TILE);
    this.player.setDepth(DEPTH.entity + this.tile.y);
  }

  showLocation() {
    const label = `Piso ${this.run.floor} · ${this.floor.biomeName}`;
    const w = measure(label) + 20;
    const c = this.add.container(4, -26).setScrollFactor(0).setDepth(DEPTH.ui);
    c.add(drawBox(this.add.graphics(), 0, 0, w, 24));
    c.add(pixelText(this, 10, 6, label, 'box'));
    this.tweens.chain({
      targets: c,
      tweens: [
        { y: 4, duration: 250, ease: 'Quad.out' },
        { y: -26, duration: 250, ease: 'Quad.in', delay: 1800 },
      ],
      onComplete: () => c.destroy(),
    });
  }

  async dialog(text) {
    this.busy = true;
    await this.textbox.say(text);
    this.textbox.hide();
    this.busy = false;
  }

  enemyAt(x, y) {
    return this.enemies.find((e) => e.x === x && e.y === y);
  }

  update(_time, delta) {
    if (this.busy || this.moving) return;
    if (this.turnLock > 0) this.turnLock -= delta;

    if (this.controls.confirm()) {
      this.interact();
      return;
    }
    const dir = this.controls.dir();
    if (!dir) {
      this.player.anims.stop();
      this.player.setFrame(DIR_FRAME_BASE[this.facing]);
      return;
    }
    if (dir !== this.facing) {
      this.facing = dir;
      this.player.anims.stop();
      this.player.setFrame(DIR_FRAME_BASE[dir]);
      this.turnLock = TURN_GRACE_MS;
      return;
    }
    if (this.turnLock > 0) return;
    this.tryMove(dir);
  }

  interact() {
    const [dx, dy] = DIRS[this.facing];
    const x = this.tile.x + dx;
    const y = this.tile.y + dy;
    const enemy = this.enemyAt(x, y);
    if (enemy) {
      this.startBattle(enemy);
      return;
    }
    const spot = this.floor.inspect.find((i) => i.x === x && i.y === y);
    if (spot) {
      audio.sfx('inspect');
      this.dialog(spot.text);
    }
  }

  tryMove(dir) {
    const [dx, dy] = DIRS[dir];
    const nx = this.tile.x + dx;
    const ny = this.tile.y + dy;
    const enemy = this.enemyAt(nx, ny);
    if (enemy) {
      this.startBattle(enemy);
      return;
    }
    if (isBlocked(this.floor, nx, ny)) {
      this.player.anims.play(`walk_${dir}`, true);
      if (this.time.now - this.lastBump > 320) {
        audio.sfx('bump');
        this.lastBump = this.time.now;
      }
      return;
    }
    this.moving = true;
    this.player.anims.play(`walk_${dir}`, true);
    this.player.setDepth(DEPTH.entity + Math.max(this.tile.y, ny));
    this.tweens.add({
      targets: this.player,
      x: nx * TILE + 8,
      y: ny * TILE + TILE,
      duration: WALK_MS,
      onComplete: () => {
        this.tile = { x: nx, y: ny };
        this.placePlayer();
        this.moving = false;
        this.afterStep();
      },
    });
  }

  afterStep() {
    audio.playMusic(this.musicHere());
    if (this.inFragment() && this.run.fragmentSeen !== this.run.floor) {
      this.run.fragmentSeen = this.run.floor;
      this.cameras.main.shake(300, 0.004);
      this.dialog('La realidad se pliega. Este lugar no pertenece a este piso.');
      return;
    }
    const { stairs } = this.floor;
    if (stairs && this.tile.x === stairs.x && this.tile.y === stairs.y) {
      this.askDescend();
      return;
    }
    // Tras huir, el enemigo no vuelve a detectarte hasta que salgas de su línea de visión.
    const grace = this.run.sightGrace;
    if (grace && !this.enemies.some((e) => e.id === grace && this.inSight(e))) this.run.sightGrace = null;
    const spotter = this.enemies.find((e) => e.id !== this.run.sightGrace && this.inSight(e));
    if (spotter) this.spotted(spotter);
  }

  inSight(e) {
    const dx = this.tile.x - e.x;
    const dy = this.tile.y - e.y;
    if (dx !== 0 && dy !== 0) return false;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist === 0 || dist > SIGHT) return false;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    for (let i = 1; i < dist; i++) {
      if (isBlocked(this.floor, e.x + sx * i, e.y + sy * i) || this.enemyAt(e.x + sx * i, e.y + sy * i)) return false;
    }
    return true;
  }

  // Como los entrenadores de Pokémon: "!" sobre el enemigo, se acerca y comienza el combate.
  spotted(enemy) {
    this.busy = true;
    this.player.anims.stop();
    this.player.setFrame(DIR_FRAME_BASE[this.facing]);
    audio.sfx('encounter');
    const mark = pixelText(this, enemy.sprite.x - 1, enemy.sprite.y - 30, '!', 'blood').setDepth(DEPTH.ui);
    this.time.delayedCall(700, () => {
      mark.destroy();
      const dx = Math.sign(this.tile.x - enemy.x);
      const dy = Math.sign(this.tile.y - enemy.y);
      const steps = Math.abs(this.tile.x - enemy.x) + Math.abs(this.tile.y - enemy.y) - 1;
      const toX = enemy.x + dx * steps;
      const toY = enemy.y + dy * steps;
      this.tweens.add({
        targets: [enemy.sprite, enemy.shadow],
        x: toX * TILE + 8,
        y: toY * TILE + 15,
        duration: Math.max(1, steps) * WALK_MS,
        onComplete: () => {
          enemy.x = toX;
          enemy.y = toY;
          const stored = this.floor.enemies.find((e) => e.id === enemy.id);
          stored.x = toX;
          stored.y = toY;
          const face = dx > 0 ? 'left' : dx < 0 ? 'right' : dy > 0 ? 'up' : 'down';
          this.facing = face;
          this.player.setFrame(DIR_FRAME_BASE[face]);
          this.startBattle(enemy);
        },
      });
    });
  }

  async askDescend() {
    this.busy = true;
    await this.textbox.say('Una escalera se hunde en la oscuridad. No hay vuelta atrás. ¿Descender?', { hold: true });
    const menu = new Menu(this, this.controls, { x: GAME_W - 64, y: 64, w: 60, h: 46, items: [{ label: 'Sí' }, { label: 'No' }] });
    const choice = await menu.open(1);
    menu.close();
    this.textbox.hide();
    if (choice !== 0) {
      this.busy = false;
      return;
    }
    audio.sfx('stairs');
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // No se puede volver: el piso anterior se descarta (sus texturas se liberan al crear el nuevo).
      this.run.purgeTextures = true;
      this.run.floor += 1;
      this.run.defeated = [];
      this.run.floorData = null;
      this.run.pos = null;
      this.run.facing = 'down';
      this.scene.restart();
    });
  }

  startBattle(enemy) {
    this.busy = true;
    this.run.pos = { ...this.tile };
    this.run.facing = this.facing;
    this.player.anims.stop();
    audio.stopMusic();
    audio.sfx('encounter');
    const cam = this.cameras.main;
    cam.flash(120, 216, 207, 188);
    this.time.delayedCall(180, () => cam.flash(120, 20, 18, 26));
    this.time.delayedCall(380, () => {
      cam.fadeOut(260, 0, 0, 0);
      cam.once('camerafadeoutcomplete', () => this.scene.start('Battle', { enemyId: enemy.id, template: enemy.template }));
    });
  }
}
