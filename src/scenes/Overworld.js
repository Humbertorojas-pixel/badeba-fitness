import { TILE, WALK_MS, RUN_MS, TURN_GRACE_MS, DEPTH, GAME_W } from '../constants.js';
import Phaser from 'phaser';
import { createControls } from '../ui/controls.js';
import { TextBox } from '../ui/TextBox.js';
import { Menu } from '../ui/Menu.js';
import { drawBox } from '../gfx/misc.js';
import { pixelText } from '../gfx/font.js';
import { measure } from '../gfx/fontGlyphs.js';
import { ensureMonsterTextures } from '../gfx/monsterTextures.js';
import { DIR_FRAME_BASE } from '../gfx/heroArt.js';
import { ensureHeroTextures } from '../gfx/heroTextures.js';
import { audio } from '../audio/audio.js';
import { getRun } from '../core/state.js';
import { isBlocked } from '../world/floor.js';
import { generateFloor } from '../world/generate.js';
import { BIOMES } from '../world/biomes.js';
import { buildRegionView } from '../world/regionView.js';
import { createRng, hashSeed } from '../core/rng.js';
import { rollEnemyLoot } from '../core/loot.js';
import { derive } from '../core/character.js';
import { getStore, getProfile } from '../core/storage.js';
import { TextInput } from '../ui/TextInput.js';
import { refreshAiStatus, aiStatus, talk } from '../ai/client.js';
import { greedLevel } from '../ai/enemyBrain.js';
import { fallbackGreeting, fallbackReply, BLOCKED_REPLY } from '../ai/npcFallback.js';
import { generateEnemyTemplate } from '../world/enemyGen.js';
import { initialWeather, stepWeather, weatherOf, WEATHERS } from '../world/weather.js';
import { WeatherView } from '../gfx/weatherView.js';
import { generateDungeon } from '../world/dungeon.js';
import { ensureItemIcon } from '../gfx/itemArt.js';
import { itemDisplayName } from '../core/loot.js';
import { RARITY_LABEL } from '../data/items.js';
import { healParty, companionFromNpc, PARTY_MAX } from '../core/party.js';
import { checkQuests } from '../world/quests.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const MAX_TURNS = 25;
const LIGHTNING_REVEAL = 13;
const ROAM_RADIUS = 4;
const ENCOUNTER_RATE = 1 / 10;
const HOSTILE_BIOME = { archetypes: { humanoid: 1 }, ramps: ['steel', 'rust', 'flesh'] };

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
        if (!key.startsWith('mon_') && !key.startsWith('tiles_f') && !key.startsWith('p_')) continue;
        // Las animaciones son globales: si apuntan a una textura borrada, fallan en el piso siguiente.
        if (this.anims.exists(`${key}_anim`)) this.anims.remove(`${key}_anim`);
        this.textures.remove(key);
      }
    }
    const freshFloor = !this.run.floorData;
    if (freshFloor) this.buildFloorData();
    // Dentro de una mazmorra el mapa activo es el suyo; la región espera arriba.
    this.inDungeon = !!this.run.dungeon;
    const floor = this.inDungeon ? this.run.dungeon.data : this.run.floorData;
    this.floor = floor;
    const mapKey = this.inDungeon ? `f${this.run.floor}_${this.run.dungeon.id}` : `f${this.run.floor}`;
    this.view = buildRegionView(this, floor, mapKey, { opened: new Set(this.run.opened || []) });

    this.enemies = floor.enemies
      .filter((e) => !this.run.defeated.includes(e.id))
      .map((e) => {
        const tex = ensureMonsterTextures(this, String(e.template.seed), e.template);
        const shadow = this.add.image(e.x * TILE + 8, e.y * TILE + 15, 'shadow').setDepth(DEPTH.entity + e.y + 0.3);
        const sprite = this.add.sprite(e.x * TILE + 8, e.y * TILE + 15, tex.small).setOrigin(0.5, 1).setDepth(DEPTH.entity + e.y + 0.5);
        sprite.play({ key: `${tex.small}_anim`, startFrame: (e.x + e.y) % 2 });
        return { data: e, id: e.id, x: e.x, y: e.y, template: e.template, sprite, shadow, busy: false };
      });

    this.npcs = floor.npcs
      .filter((n) => !this.run.defeated.includes(n.id))
      .map((n) => {
        const sprite = this.add.sprite(n.x * TILE + 8, n.y * TILE + TILE, `npc_${n.sheet.palette}`, DIR_FRAME_BASE.down).setOrigin(0.5, 1);
        sprite.setDepth(DEPTH.entity + n.y + 0.5);
        return { data: n, sprite };
      });

    const pos = this.run.pos || floor.start;
    this.questCheckOnCreate = true;
    this.tile = { x: pos.x, y: pos.y };
    this.facing = this.run.facing || 'down';
    this.hero = ensureHeroTextures(this, this.run.player.equipment);
    this.player = this.add.sprite(0, 0, this.hero.key, DIR_FRAME_BASE[this.facing]).setOrigin(0.5, 1);
    this.placePlayer();
    this.view.follow(this.player);
    this.setupCompanions();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, floor.w * TILE, floor.h * TILE);
    cam.startFollow(this.player, true);
    cam.setRoundPixels(true);
    this.view.culler.update(0, true);

    this.add.image(0, 0, 'vignette').setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay);
    // Clima: persiste en la partida; cada piso empieza con el suyo.
    this.weatherRng = createRng((this.run.seed ^ (this.run.floor * 104729) ^ Date.now()) >>> 0);
    if (!this.run.weather) this.run.weather = initialWeather(this.weatherRng, floor.biome, this.run.floor);
    this.weather = new WeatherView(this, { world: true, onLightning: () => this.reveal(LIGHTNING_REVEAL) });
    this.weather.set(this.inDungeon ? 'despejado' : this.run.weather.kind, true);
    this.textbox = new TextBox(this, this.controls);
    this.textInput = new TextInput(this, this.controls);
    this.dialogRng = createRng((this.run.seed ^ Date.now()) >>> 0);
    this.encounterRng = createRng((this.run.seed ^ (Date.now() * 31)) >>> 0);
    if (!aiStatus().checked || aiStatus().laya === 'loading') refreshAiStatus();
    this.busy = false;
    this.moving = false;
    this.turnLock = 0;
    this.lastBump = 0;
    this.reveal();
    this.view.updateGrass(this.tile, this.player.depth);
    this.zone = this.zoneAt(this.tile);

    audio.playMusic(this.musicHere());
    cam.fadeIn(350);
    if (this.run.pendingLocation) {
      this.showLocation(this.run.pendingLocation);
      this.run.pendingLocation = null;
    } else if (this.run.locationShown !== this.run.floor) {
      this.run.locationShown = this.run.floor;
      this.showLocation(`Piso ${this.run.floor} · ${floor.biomeName}`);
    }
    this.refreshQuestMarks();
    if (this.questCheckOnCreate) {
      const done = checkQuests(this.run, this.run.floor, { defeated: this.run.defeated });
      if (done.length) this.run.pendingMessage = `Misión cumplida. ${done[0].giver} te espera.`;
      if (done.length) this.refreshQuestMarks();
    }
    if (!this.run.introShown) {
      this.run.introShown = true;
      this.dialog('Despiertas bajo un cielo de roca. Un bosque entero crece aquí abajo, en la oscuridad del pozo.');
    } else if (this.run.pendingMessage) {
      const msg = this.run.pendingMessage;
      this.run.pendingMessage = null;
      this.dialog(msg);
    }
    if (freshFloor || this.run.autosavePending) {
      this.run.autosavePending = false;
      this.autosave();
    }
    this.time.addEvent({ delay: 650, loop: true, callback: () => this.roamEnemies() });
    const onResume = () => {
      this.busy = false;
      this.refreshHero();
      if ((this.run.party || []).length !== this.companions.length || this.companions.some((m, i) => m.c !== this.run.party[i])) this.setupCompanions();
    };
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));
  }

  // Compañeros: te siguen en fila por las casillas que vas dejando.
  setupCompanions() {
    this.companions?.forEach((m) => m.sprite.destroy());
    this.trail = [];
    const free = (x, y) => !isBlocked(this.floor, x, y) && !this.enemyAt(x, y) && !this.npcAt(x, y);
    const behind = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]
      .map(([dx, dy]) => ({ x: this.tile.x + dx, y: this.tile.y + dy })).filter((t) => free(t.x, t.y));
    this.companions = (this.run.party || []).map((c, i) => {
      const t = behind[i] || { ...this.tile };
      this.trail.push(t);
      const m = { c, sprite: this.makeCompanionSprite(c), tile: t };
      this.placeCompanion(m);
      return m;
    });
  }

  makeCompanionSprite(c) {
    if (c.kind === 'criatura') {
      const tex = ensureMonsterTextures(this, c.id, c.template);
      return this.add.sprite(0, 0, tex.small).setOrigin(0.5, 1).play(`${tex.small}_anim`);
    }
    const key = `npc_${c.palette}`;
    for (const [dir, base] of Object.entries(DIR_FRAME_BASE)) {
      const anim = `${key}_walk_${dir}`;
      if (!this.anims.exists(anim)) this.anims.create({ key: anim, frames: [base + 1, base, base + 2, base].map((frame) => ({ key, frame })), frameRate: 10, repeat: -1 });
    }
    return this.add.sprite(0, 0, key, DIR_FRAME_BASE.down).setOrigin(0.5, 1);
  }

  placeCompanion(m) {
    const off = m.c.kind === 'criatura' ? 15 : 16;
    m.sprite.setPosition(m.tile.x * TILE + 8, m.tile.y * TILE + off).setDepth(DEPTH.entity + m.tile.y + 0.45);
  }

  moveCompanions(from, duration) {
    if (!this.companions?.length) return;
    this.trail.unshift({ ...from });
    this.trail.length = this.companions.length;
    this.companions.forEach((m, i) => {
      const to = this.trail[i];
      if (!to || (to.x === m.tile.x && to.y === m.tile.y)) return;
      const dx = to.x - m.tile.x;
      const dy = to.y - m.tile.y;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      const off = m.c.kind === 'criatura' ? 15 : 16;
      if (m.c.kind === 'npc') m.sprite.anims.play(`npc_${m.c.palette}_walk_${dir}`, true);
      else m.sprite.setFlipX(dx > 0);
      m.sprite.setDepth(DEPTH.entity + Math.max(m.tile.y, to.y) + 0.45);
      m.tile = { ...to };
      this.tweens.add({
        targets: m.sprite, x: to.x * TILE + 8, y: to.y * TILE + off, duration,
        onComplete: () => {
          if (m.c.kind === 'npc') { m.sprite.anims.stop(); m.sprite.setFrame(DIR_FRAME_BASE[dir]); }
          this.placeCompanion(m);
        },
      });
    });
  }

  // Tras equipar o quitar algo en MOCHILA/ESTADO, el personaje cambia de aspecto.
  refreshHero() {
    const hero = ensureHeroTextures(this, this.run.player.equipment);
    if (hero.key === this.hero.key) return;
    this.hero = hero;
    this.player.anims.stop();
    this.player.setTexture(hero.key, DIR_FRAME_BASE[this.facing]);
  }

  buildFloorData() {
    const floor = generateFloor({ runSeed: this.run.seed, depth: this.run.floor });
    // Los enemigos cargan botín con las mismas reglas que el jugador (y con el mismo pity).
    const rng = createRng(hashSeed(floor.seed, 'loot'));
    const intelligence = derive(this.run.player).int;
    const { pity } = getProfile(this);
    for (const e of floor.enemies) e.template.loot = e.template.friend ? null : rollEnemyLoot(rng, pity, this.run.floor, intelligence, e.template.rank);
    this.run.floorData = floor;
    this.run.pos = null;
    this.run.stepsSinceBattle = 0;
    this.run.grassBattles = 0;
  }

  // Niebla de guerra: lo explorado queda en el MAPA. El clima acorta o alarga la vista
  // (y un relámpago ilumina de golpe una zona amplia).
  reveal(radius = this.inDungeon ? 5 : weatherOf(this.run.weather).reveal) {
    const { w, h, seen } = this.floor;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = this.tile.x + dx;
        const y = this.tile.y + dy;
        if (x >= 0 && y >= 0 && x < w && y < h) seen[y * w + x] = 1;
      }
    }
  }

  zoneAt(t) {
    let best = null;
    for (const z of this.floor.zones) {
      const d = Math.hypot(z.x - t.x, z.y - t.y);
      if (d <= z.r && (!best || z.r < best.r)) best = z;
    }
    return best;
  }

  async autosave(label = 'Autoguardado') {
    const profile = getProfile(this);
    profile.deepest = Math.max(profile.deepest, this.run.floor);
    try {
      await getStore().saveRun(this.run, profile, 'auto');
      this.toast(label);
    } catch (err) {
      console.warn(err);
      this.toast('No se pudo guardar');
    }
  }

  toast(text) {
    const w = measure(text) + 20;
    // Arriba a la derecha: no tapa la caja de diálogo ni el cartel de zona (arriba a la izquierda).
    const c = this.add.container(GAME_W - w - 4, -26).setScrollFactor(0).setDepth(DEPTH.ui);
    c.add(drawBox(this.add.graphics(), 0, 0, w, 24));
    c.add(pixelText(this, 10, 6, text, 'box'));
    this.tweens.chain({
      targets: c,
      tweens: [{ y: 30, duration: 200, ease: 'Quad.out', delay: 400 }, { y: -26, duration: 200, ease: 'Quad.in', delay: 1400 }],
      onComplete: () => c.destroy(),
    });
  }

  async manualSave() {
    await this.textbox.say('¿Guardar tu progreso?', { hold: true });
    const menu = new Menu(this, this.controls, { x: GAME_W - 64, y: 64, w: 60, h: 46, items: [{ label: 'Sí' }, { label: 'No' }] });
    const choice = await menu.open(0);
    menu.destroy();
    if (choice === 0) {
      this.run.pos = { ...this.tile };
      this.run.facing = this.facing;
      try {
        await getStore().saveRun(this.run, getProfile(this), 'manual');
        audio.sfx('heal');
        await this.textbox.say('Partida guardada. La oscuridad recordará tu paso.');
      } catch (err) {
        console.warn(err);
        audio.sfx('bump');
        await this.textbox.say('No se pudo guardar la partida.');
      }
    }
    this.textbox.hide();
    this.busy = false;
  }

  async openPauseMenu() {
    this.busy = true;
    this.player.anims.stop();
    this.player.setFrame(DIR_FRAME_BASE[this.facing]);
    audio.sfx('confirm');
    const points = this.run.player.points;
    const items = [
      { label: 'MAPA', scene: 'MapView' },
      { label: 'EQUIPO', scene: 'Party' },
      { label: 'MOCHILA', scene: 'Bag' },
      { label: points ? 'ESTADO +' : 'ESTADO', style: points ? 'unique' : 'box', scene: 'Status' },
      { label: 'GUARDAR' },
      { label: 'CERRAR' },
    ];
    const menu = new Menu(this, this.controls, { x: 158, y: 4, w: 78, h: 12 + items.length * 16, rowH: 16, padY: 10, items });
    const choice = await menu.open(this.pauseIndex || 0);
    menu.destroy();
    this.pauseIndex = Math.max(0, choice);
    const item = items[choice];
    if (item?.scene) {
      this.run.pos = { ...this.tile };
      this.scene.launch(item.scene);
      this.scene.pause();
      return;
    }
    if (item?.label === 'GUARDAR') {
      this.manualSave();
      return;
    }
    this.busy = false;
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
    this.player.setDepth(DEPTH.entity + this.tile.y + 0.5);
  }

  showLocation(label) {
    const w = measure(label) + 20;
    const c = this.add.container(4, -26).setScrollFactor(0).setDepth(DEPTH.ui);
    c.add(drawBox(this.add.graphics(), 0, 0, w, 24));
    c.add(pixelText(this, 10, 6, label, 'box'));
    this.tweens.chain({
      targets: c,
      tweens: [{ y: 4, duration: 250, ease: 'Quad.out' }, { y: -26, duration: 250, ease: 'Quad.in', delay: 1800 }],
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

  npcAt(x, y) {
    return this.npcs.find((n) => n.data.x === x && n.data.y === y);
  }

  update(time, delta) {
    this.view.update(time, delta);
    for (const e of this.enemies) if (e.mark) e.mark.setPosition(e.sprite.x - 2, e.sprite.y - 34 - (Math.floor(time / 400) % 2));
    this.weather.update(time, delta);
    if (this.busy || this.moving) return;
    if (this.turnLock > 0) this.turnLock -= delta;

    if (this.controls.start()) {
      this.controls.confirm();
      this.openPauseMenu();
      return;
    }
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
    const npc = this.npcAt(x, y);
    if (npc) {
      this.talkTo(npc);
      return;
    }
    const spot = this.floor.inspect.find((i) => i.x === x && i.y === y);
    if (!spot) return;
    audio.sfx('inspect');
    if (spot.landmark && (this.run.quests || []).some((q) => q.status === 'activa' && q.type === 'peregrinar' && q.floor === this.run.floor)) {
      this.pray(spot);
      return;
    }
    if (spot.action === 'hoguera') this.rest();
    else if (spot.action === 'posada') this.rest(`${spot.text} La posadera te da una cama y un plato caliente.`, 'Descansas en la posada');
    else if (spot.action === 'capilla') this.chapelPrayer(spot);
    else if (spot.action === 'mazmorra') this.askEnterDungeon(spot.id);
    else if (spot.action === 'cofre') this.openChest(spot);
    else this.dialog(spot.text);
  }

  async pray(spot) {
    this.busy = true;
    await this.textbox.say(spot.text);
    await this.textbox.say('Te arrodillas y rezas por los que se perdieron. Por un momento, el pozo guarda silencio.');
    this.textbox.hide();
    await this.updateQuests({ prayed: true });
    if (this.run.pendingMessage) { const m = this.run.pendingMessage; this.run.pendingMessage = null; await this.textbox.say(m); this.textbox.hide(); }
    this.busy = false;
  }

  // Hoguera de aldea: descanso completo y guardado (el punto seguro de cada región).
  async rest(text = 'Descansas junto a la hoguera. El calor cierra tus heridas.', saved = 'La hoguera guarda tu paso') {
    this.busy = true;
    const p = this.run.player;
    p.hp = derive(p).maxHp;
    healParty(this.run.party, 1);
    audio.sfx('heal');
    this.cameras.main.flash(400, 194, 141, 58);
    await this.textbox.say(text);
    this.textbox.hide();
    this.run.pos = { ...this.tile };
    this.run.facing = this.facing;
    await this.autosave(saved);
    this.busy = false;
  }

  // Altar de la capilla en ruinas: una oración cura la mitad de las heridas, una vez por piso.
  async chapelPrayer(spot) {
    const run = this.run;
    run.opened ||= [];
    this.busy = true;
    await this.textbox.say(spot.text);
    if (run.opened.includes(spot.id)) {
      await this.textbox.say('Ya rezaste aquí. La vela se consume despacio, sin prisa por ti.');
    } else {
      run.opened.push(spot.id);
      const p = run.player;
      const max = derive(p).maxHp;
      p.hp = Math.min(max, p.hp + Math.ceil(max * 0.5));
      healParty(run.party, 0.5);
      audio.sfx('heal');
      this.cameras.main.flash(500, 216, 207, 188);
      await this.textbox.say('Te arrodillas ante el altar partido. La campana muda tiembla, y tus heridas se cierran a medias.');
    }
    this.textbox.hide();
    this.busy = false;
  }

  stairsHint(from) {
    const dx = this.floor.stairs.x - from.x;
    const dy = this.floor.stairs.y - from.y;
    const ns = Math.abs(dy) > 3 ? (dy < 0 ? 'norte' : 'sur') : '';
    const ew = Math.abs(dx) > 3 ? (dx < 0 ? 'oeste' : 'este') : '';
    if (!ns && !ew) return 'muy cerca de aquí';
    const combined = { norteeste: 'noreste', norteoeste: 'noroeste', sureste: 'sureste', suroeste: 'suroeste' };
    return `hacia el ${ns && ew ? combined[ns + ew] : ns || ew}`;
  }

  // Lo que el NPC percibe: se inyecta en su prompt (y lo usa el diálogo local si no hay IA).
  talkContext(npc) {
    const p = this.run.player;
    const d = derive(p);
    return {
      piso: this.run.floor,
      bioma: this.floor.biomeName,
      clima: weatherOf(this.run.weather).name,
      mision: npc.quest ? { encargo: npc.quest.summary, estado: (this.run.quests || []).find((q) => q.id === npc.quest.id)?.status || 'sin ofrecer' } : null,
      lugar: this.zoneAt(npc)?.name || 'tierras salvajes',
      lugares_cercanos: this.floor.zones.map((z) => z.name),
      escalera: this.stairsHint(npc),
      criaturas: this.enemies.length,
      fragmento: !!this.floor.fragment,
      codicia: greedLevel(this.run),
      inteligencia: d.int,
      viajero: {
        nombre: p.name,
        nivel: p.level,
        vida: `${Math.round((p.hp / d.maxHp) * 100)}%`,
        objetos_visibles: Object.values(p.equipment).filter(Boolean).map((i) => `${i.name} (${i.rarity})`),
      },
    };
  }

  async showThinking(name, promise) {
    let dots = 0;
    this.textbox.show(`${name} medita`);
    const timer = this.time.addEvent({ delay: 350, loop: true, callback: () => { dots = (dots + 1) % 4; this.textbox.show(`${name} medita${'.'.repeat(dots)}`); } });
    try {
      return await promise;
    } finally {
      timer.remove();
    }
  }

  // Conversación libre y continua con un NPC. La memoria vive mientras dure el piso.
  async talkTo(npc) {
    this.busy = true;
    this.player.anims.stop();
    this.player.setFrame(DIR_FRAME_BASE[this.facing]);
    npc.sprite.setFrame(DIR_FRAME_BASE[OPPOSITE[this.facing]]);
    audio.sfx('inspect');
    const data = npc.data;
    const { sheet } = data;
    const rng = this.dialogRng;
    const context = this.talkContext(data);

    if (!data.history.length) {
      const res = await this.showThinking(sheet.name, talk({ mode: 'npc', npc: sheet, context, history: [], message: '' }));
      data.history.push({ role: 'user', text: '(El viajero se acerca en silencio.)' }, { role: 'assistant', text: res?.reply || fallbackGreeting(sheet, rng) });
    }
    let line = data.history[data.history.length - 1].text;
    await this.textbox.say(`${sheet.name}: ${line}`);
    // Misión: ofrecerla, o cumplirla y unirse al equipo.
    if (data.quest && (await this.handleQuest(npc)) === 'joined') return;
    for (;;) {
      if (data.turns >= MAX_TURNS) {
        await this.textbox.say(`${sheet.name}: Ya no tengo nada más que decirte. Sigue bajando.`);
        break;
      }
      const { text, reason } = await this.textInput.prompt(`Hablas con ${sheet.name}:`);
      if (!text) {
        if (reason === 'timeout') await this.textbox.say(`${sheet.name} se cansa de esperar y te da la espalda.`);
        break;
      }
      const res = await this.showThinking(sheet.name, talk({ mode: 'npc', npc: sheet, context: this.talkContext(data), history: data.history, message: text }));
      if (res?.blocked) {
        line = BLOCKED_REPLY[res.blocked];
        await this.textbox.say(`${sheet.name}: ${line}`);
        continue;
      }
      line = res?.reply || fallbackReply(sheet, text, context, rng);
      data.history.push({ role: 'user', text }, { role: 'assistant', text: line });
      data.turns += 1;
      // Escalamiento: Laya estima si atacará; sin Laya, solo la codicia extrema lo provoca.
      const greedy = ['altísima', 'obsesiva'].includes(context.codicia);
      const p = res?.escalate ?? (greedy ? 0.35 : 0);
      await this.textbox.say(`${sheet.name}: ${line}`);
      if (sheet.canTurnHostile && p >= 0.35 && rng.next() < p) {
        await this.npcTurnsHostile(npc);
        return;
      }
    }
    this.textbox.hide();
    npc.sprite.setFrame(DIR_FRAME_BASE.down);
    this.busy = false;
  }

  questOf(npc) {
    return (this.run.quests || []).find((q) => q.id === npc.data.quest?.id);
  }

  async handleQuest(npc) {
    const { sheet, quest } = npc.data;
    const state = this.questOf(npc);
    if (!state) {
      await this.textbox.say(`${sheet.name}: ${quest.offer}`);
      if (await this.confirm('¿Aceptas la misión?')) {
        (this.run.quests ||= []).push({ ...quest, status: 'activa' });
        audio.sfx('confirm');
        await this.textbox.say(`${sheet.name}: Gracias. Te esperaré aquí. (Misión anotada en EQUIPO.)`);
      } else {
        await this.textbox.say(`${sheet.name}: Lo entiendo. Si cambias de idea, aquí estaré.`);
      }
      this.refreshQuestMarks();
      return 'offered';
    }
    if (state.status === 'activa') {
      await this.textbox.say(`${sheet.name}: ¿Ya lo hiciste? ${state.summary}`);
      return 'active';
    }
    if (state.status === 'cumplida') {
      const party = (this.run.party ||= []);
      if (party.length >= PARTY_MAX) {
        await this.textbox.say(`${sheet.name}: Lo lograste. Pero ya viajas con demasiada gente. Haz sitio en tu equipo y vuelve por mí.`);
        return 'full';
      }
      await this.textbox.say(`${sheet.name}: Lo lograste. Te debo más de lo que puedo decir. Desde ahora, voy contigo.`);
      audio.sfx('encounter');
      state.status = 'entregada';
      party.push(companionFromNpc(npc.data, this.run.floor));
      this.run.defeated.push(npc.data.id);
      this.floor.blockers.delete(npc.data.y * this.floor.w + npc.data.x);
      npc.sprite.destroy();
      npc.mark?.destroy();
      this.npcs = this.npcs.filter((n) => n !== npc);
      await this.textbox.say(`¡${sheet.name} se une a tu equipo!`);
      this.textbox.hide();
      this.setupCompanions();
      this.busy = false;
      return 'joined';
    }
    return null;
  }

  // "!" sobre quien ofrece una misión, "?" sobre quien espera tu regreso con ella cumplida.
  refreshQuestMarks() {
    for (const n of this.npcs) {
      n.mark?.destroy();
      n.mark = null;
      if (!n.data.quest) continue;
      const st = this.questOf(n)?.status;
      if (st === 'activa' || st === 'entregada') continue;
      n.mark = pixelText(this, n.sprite.x - 2, n.sprite.y - 40, st === 'cumplida' ? '?' : '!', 'ember').setDepth(DEPTH.ui - 1);
      this.tweens.add({ targets: n.mark, y: n.mark.y - 2, duration: 500, yoyo: true, repeat: -1 });
    }
    // Presa de una misión activa: una marca roja sobre ella.
    for (const e of this.enemies) {
      e.mark?.destroy();
      e.mark = null;
      const q = (this.run.quests || []).find((qq) => qq.status === 'activa' && qq.type === 'cazar' && qq.target === e.id);
      if (q) e.mark = pixelText(this, e.sprite.x - 2, e.sprite.y - 34, '!', 'blood').setDepth(DEPTH.ui - 1);
    }
  }

  // Comprueba misiones cumplidas y lo anuncia.
  async updateQuests(extra = {}) {
    const done = checkQuests(this.run, this.run.floor, { defeated: this.run.defeated, ...extra });
    for (const q of done) {
      audio.sfx('heal');
      this.toast('Misión cumplida');
      this.run.pendingMessage = this.run.pendingMessage || `Misión cumplida. ${q.giver} te espera.`;
    }
    if (done.length) this.refreshQuestMarks();
    return done;
  }

  async npcTurnsHostile(npc) {
    const { sheet } = npc.data;
    this.cameras.main.shake(250, 0.01);
    await this.textbox.say(`¡${sheet.name} desenvaina! Sus ojos ya no son humanos.`);
    this.textbox.hide();
    const template = generateEnemyTemplate({ seed: hashSeed(this.floor.seed, npc.data.id), depth: this.run.floor, biome: HOSTILE_BIOME, rank: 'raro' });
    template.name = sheet.name;
    template.title = null;
    template.article = '';
    template.loot = rollEnemyLoot(createRng(hashSeed(this.floor.seed, 'npcloot')), getProfile(this).pity, this.run.floor, derive(this.run.player).int, 'raro');
    this.startBattle({ id: npc.data.id, template });
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
    const door = this.floor.inspect.find((i) => i.action === 'mazmorra' && i.x === nx && i.y === ny);
    if (door) {
      this.askEnterDungeon(door.id);
      return;
    }
    if (isBlocked(this.floor, nx, ny) || this.npcAt(nx, ny) || this.enemies.some((e) => e.busy && e.tx === nx && e.ty === ny)) {
      this.player.anims.play(this.hero.walk(dir), true);
      if (this.time.now - this.lastBump > 320) {
        audio.sfx('bump');
        this.lastBump = this.time.now;
      }
      return;
    }
    // Correr: mantener X (el botón B de Pokémon con las zapatillas).
    const running = this.controls.cancelHeld();
    this.moveCompanions(this.tile, running ? RUN_MS : WALK_MS);
    this.moving = true;
    this.dest = { x: nx, y: ny };
    this.player.anims.play(this.hero.walk(dir), true);
    this.player.anims.timeScale = running ? 1.8 : 1;
    this.player.setDepth(DEPTH.entity + Math.max(this.tile.y, ny) + 0.5);
    this.tweens.add({
      targets: this.player,
      x: nx * TILE + 8,
      y: ny * TILE + TILE,
      duration: running ? RUN_MS : WALK_MS,
      onComplete: () => {
        this.tile = { x: nx, y: ny };
        this.dest = null;
        this.placePlayer();
        this.moving = false;
        this.afterStep();
      },
    });
  }

  afterStep() {
    audio.playMusic(this.musicHere());
    const changed = this.inDungeon ? null : stepWeather(this.run.weather, this.weatherRng, this.floor.biome);
    if (changed) {
      this.weather.set(changed);
      this.toast(WEATHERS[changed].name);
    }
    this.reveal();
    const inGrass = this.view.updateGrass(this.tile, this.player.depth);
    this.run.stepsSinceBattle = (this.run.stepsSinceBattle || 0) + 1;
    const zone = this.zoneAt(this.tile);
    if (zone !== this.zone) {
      this.zone = zone;
      if (zone && zone.kind !== 'fragmento') this.showLocation(zone.name);
    }
    if (this.inFragment() && this.run.fragmentSeen !== this.run.floor) {
      this.run.fragmentSeen = this.run.floor;
      this.cameras.main.shake(300, 0.004);
      this.dialog('La realidad se pliega. Este lugar no pertenece a este piso.');
      return;
    }
    const { stairs } = this.floor;
    if (this.tile.x === stairs.x && this.tile.y === stairs.y) {
      if (this.inDungeon) this.askExitDungeon();
      else this.askDescend();
      return;
    }
    // Tras huir, el enemigo no vuelve a detectarte hasta que salgas de su línea de visión.
    const grace = this.run.sightGrace;
    if (grace && !this.enemies.some((e) => e.id === grace && this.inSight(e))) this.run.sightGrace = null;
    const spotter = this.enemies.find((e) => !e.busy && e.id !== this.run.sightGrace && this.inSight(e));
    if (spotter) {
      this.spotted(spotter);
      return;
    }
    if (inGrass && this.run.stepsSinceBattle > 4 && this.encounterRng.next() < ENCOUNTER_RATE * weatherOf(this.run.weather).encounter) this.grassEncounter();
  }

  // Encuentro en la hierba alta: algo salta de entre las matas, como en Pokémon.
  grassEncounter() {
    this.busy = true;
    const n = this.run.grassBattles || 0;
    this.run.grassBattles = n + 1;
    const template = generateEnemyTemplate({ seed: hashSeed(this.floor.seed, `g${n}`), depth: this.run.floor, biome: BIOMES[this.floor.biome], allowUnique: false });
    const rng = createRng(hashSeed(this.floor.seed, `gl${n}`));
    template.loot = template.rank !== 'comun' || rng.chance(0.5) ? rollEnemyLoot(rng, getProfile(this).pity, this.run.floor, derive(this.run.player).int, template.rank) : null;
    const mark = pixelText(this, this.player.x - 1, this.player.y - 34, '!', 'blood').setDepth(DEPTH.ui);
    audio.sfx('encounter');
    this.time.delayedCall(450, () => {
      mark.destroy();
      this.startBattle({ id: null, template });
    });
  }

  // Las criaturas deambulan cerca de su guarida; al moverse también pueden verte.
  roamEnemies() {
    if (this.busy) return;
    for (const e of this.enemies) {
      if (e.busy || Math.abs(e.x - this.tile.x) + Math.abs(e.y - this.tile.y) > 16 || this.dialogRng.next() > 0.35) continue;
      const [dx, dy] = Phaser.Utils.Array.GetRandom(Object.values(DIRS));
      const tx = e.x + dx;
      const ty = e.y + dy;
      const home = e.data.home || e.data;
      if (Math.abs(tx - home.x) > ROAM_RADIUS || Math.abs(ty - home.y) > ROAM_RADIUS) continue;
      if (isBlocked(this.floor, tx, ty) || this.enemyAt(tx, ty) || this.npcAt(tx, ty)) continue;
      if ((tx === this.tile.x && ty === this.tile.y) || (this.dest && tx === this.dest.x && ty === this.dest.y)) continue;
      if (this.floor.fragment?.cells.has(ty * this.floor.w + tx) !== this.floor.fragment?.cells.has(e.y * this.floor.w + e.x)) continue;
      e.busy = true;
      e.tx = tx;
      e.ty = ty;
      e.sprite.setDepth(DEPTH.entity + Math.max(e.y, ty) + 0.5);
      this.tweens.add({
        targets: [e.sprite, e.shadow],
        x: tx * TILE + 8,
        y: ty * TILE + 15,
        duration: 320,
        onComplete: () => {
          e.x = tx;
          e.y = ty;
          e.data.x = tx;
          e.data.y = ty;
          e.busy = false;
          e.sprite.setDepth(DEPTH.entity + ty + 0.5);
          e.shadow.setDepth(DEPTH.entity + ty + 0.3);
          if (!this.busy && !this.moving && e.id !== this.run.sightGrace && this.inSight(e)) this.spotted(e);
        },
      });
    }
  }

  inSight(e) {
    if (e.data.passive) return false;
    const dx = this.tile.x - e.x;
    const dy = this.tile.y - e.y;
    if (dx !== 0 && dy !== 0) return false;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist === 0 || dist > (this.inDungeon ? 4 : weatherOf(this.run.weather).sight)) return false;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    for (let i = 1; i < dist; i++) {
      const x = e.x + sx * i;
      const y = e.y + sy * i;
      if (isBlocked(this.floor, x, y) || this.enemyAt(x, y) || this.npcAt(x, y)) return false;
    }
    return true;
  }

  // Como los entrenadores de Pokémon: "!" sobre el enemigo, se acerca y comienza el combate.
  spotted(enemy) {
    this.busy = true;
    enemy.busy = true;
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
          enemy.data.x = toX;
          enemy.data.y = toY;
          const face = dx > 0 ? 'left' : dx < 0 ? 'right' : dy > 0 ? 'up' : 'down';
          this.facing = face;
          this.player.setFrame(DIR_FRAME_BASE[face]);
          this.startBattle(enemy);
        },
      });
    });
  }

  async confirm(text) {
    await this.textbox.say(text, { hold: true });
    const menu = new Menu(this, this.controls, { x: GAME_W - 64, y: 64, w: 60, h: 46, items: [{ label: 'Sí' }, { label: 'No' }] });
    const choice = await menu.open(0);
    menu.destroy();
    this.textbox.hide();
    return choice === 0;
  }

  async askEnterDungeon(id) {
    this.busy = true;
    this.player.anims.stop();
    const d = this.floor.dungeons?.find((q) => q.id === id);
    if (!d) { this.busy = false; return; }
    audio.sfx('inspect');
    if (!(await this.confirm(`${d.name}. Un aliento frío sube desde la oscuridad. ¿Entrar?`))) {
      this.busy = false;
      return;
    }
    this.enterDungeon(d);
  }

  // Genera la mazmorra (determinista) y fija el botín de sus criaturas la primera vez.
  enterDungeon(d) {
    const run = this.run;
    const data = generateDungeon({ seed: hashSeed(this.floor.seed, d.id), depth: run.floor, theme: d.theme, id: `${run.floor}_${d.id}`, name: d.name });
    run.dungeonLoot ||= {};
    const rng = createRng(hashSeed(data.seed, 'loot'));
    const intelligence = derive(run.player).int;
    const { pity } = getProfile(this);
    for (const e of data.enemies) {
      if (!(e.id in run.dungeonLoot)) run.dungeonLoot[e.id] = rollEnemyLoot(rng, pity, run.floor, intelligence, e.template.rank);
      e.template.loot = run.dungeonLoot[e.id];
    }
    run.dungeon = { id: d.id, name: d.name, data, returnPos: { ...d.front } };
    run.visitedDungeons ||= [];
    if (!run.visitedDungeons.includes(`${run.floor}_${d.id}`)) {
      run.visitedDungeons.push(`${run.floor}_${d.id}`);
      run.pendingMessage = 'La oscuridad aquí abajo es más espesa. Tu luz apenas alcanza unos pasos. Algo guarda lo más hondo.';
    }
    run.pos = null;
    run.facing = 'down';
    run.pendingLocation = d.name;
    run.autosavePending = true;
    this.travel();
  }

  async askExitDungeon() {
    this.busy = true;
    if (!(await this.confirm('La escala sube hacia la región. ¿Volver a la superficie?'))) {
      this.busy = false;
      return;
    }
    const run = this.run;
    run.pos = { ...run.dungeon.returnPos };
    run.facing = 'down';
    run.pendingLocation = `Piso ${run.floor} · ${run.floorData.biomeName}`;
    run.dungeon = null;
    run.autosavePending = true;
    this.travel();
  }

  travel() {
    audio.sfx('stairs');
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
  }

  // Cofres: botín con rareza mínima rara; el del jefe acelera el destino (pity) como un legendario.
  async openChest(spot) {
    const run = this.run;
    run.opened ||= [];
    if (run.opened.includes(spot.id)) {
      this.dialog('El cofre está vacío.');
      return;
    }
    this.busy = true;
    this.player.anims.stop();
    run.opened.push(spot.id);
    this.view.openChest(spot.id);
    audio.sfx('encounter');
    const rng = createRng(hashSeed(this.floor.seed, spot.id));
    const loot = rollEnemyLoot(rng, getProfile(this).pity, run.floor, derive(run.player).int, spot.boss ? 'legendario' : 'raro');
    if (loot.kind === 'consumable') run.bag.consumables[loot.key] = (run.bag.consumables[loot.key] || 0) + 1;
    else run.bag.gear.push(loot);
    run.bag.consumables.tonico = (run.bag.consumables.tonico || 0) + 1;
    const card = this.add.container(spot.x * TILE + 8, spot.y * TILE - 14).setDepth(DEPTH.ui);
    card.add(drawBox(this.add.graphics(), -17, -17, 34, 34));
    card.add(this.add.image(0, 0, ensureItemIcon(this, loot)));
    this.tweens.add({ targets: card, y: card.y - 8, duration: 300, ease: 'Back.out' });
    const tag = loot.kind === 'equip' ? ` (${RARITY_LABEL[loot.rarity]})` : '';
    await this.textbox.say(`Dentro del cofre: ${itemDisplayName(loot)}${tag}. También hay un tónico.`);
    card.destroy();
    if (spot.boss && this.inDungeon) {
      const q = (run.quests || []).find((qq) => qq.status === 'activa' && qq.type === 'recuperar' && qq.target === run.dungeon.id);
      if (q) await this.textbox.say(`Bajo el botín encuentras el ${q.object} que buscaba ${q.giver}.`);
      await this.updateQuests({ openedBoss: run.dungeon.id });
      if (run.pendingMessage) { const m = run.pendingMessage; run.pendingMessage = null; await this.textbox.say(m); }
    }
    this.textbox.hide();
    this.busy = false;
  }

  async askDescend() {
    this.busy = true;
    await this.textbox.say('Escalones hacia el siguiente piso. No hay vuelta atrás. ¿Descender?', { hold: true });
    const menu = new Menu(this, this.controls, { x: GAME_W - 64, y: 64, w: 60, h: 46, items: [{ label: 'Sí' }, { label: 'No' }] });
    const choice = await menu.open(1);
    menu.destroy();
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
      const p = this.run.player;
      const max = derive(p).maxHp;
      const heal = Math.min(max - p.hp, Math.ceil(max * 0.25));
      p.hp += heal;
      healParty(this.run.party, 0.25);
      this.run.pendingMessage = heal > 0 ? `Recuperas el aliento al descender. (+${heal} PS)` : null;
      this.run.floor += 1;
      this.run.defeated = [];
      this.run.floorData = null;
      this.run.weather = null;
      this.run.dungeon = null;
      this.run.opened = [];
      this.run.dungeonLoot = {};
      this.run.pos = null;
      this.run.facing = 'down';
      this.scene.restart();
    });
  }

  startBattle(enemy) {
    this.busy = true;
    this.run.pos = { ...this.tile };
    this.run.facing = this.facing;
    this.run.stepsSinceBattle = 0;
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
