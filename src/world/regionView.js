import Phaser from 'phaser';
import { TILE, DEPTH, GAME_W, GAME_H } from '../constants.js';
import { buildTileset, TILESET_COLS } from '../gfx/tiles.js';
import { ensurePropTextures, propKey } from '../gfx/propTextures.js';
import { computeTiles, computeOverlay } from './floor.js';
import { BIOMES } from './biomes.js';
import { PROPS } from './props.js';
import { hexToInt, hexToRgb, PAL } from '../palette.js';
import { BAYER4 } from '../gfx/pixelBuffer.js';

// Punto de luz de cada elemento luminoso (en píxeles dentro de su imagen).
const LIGHT_AT = { hoguera: [8, 8], farol: [8, 6], hongo: [16, 14], hongo_chico: [8, 8], vela: [8, 8] };

// Solo se muestran los objetos cerca de la cámara: los mapas tienen miles de elementos.
class Culler {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.t = 0;
  }

  add(obj, x0, y0, x1, y1) {
    this.items.push({ obj, x0, y0, x1, y1 });
    return obj;
  }

  update(delta, force = false) {
    this.t -= delta;
    if (this.t > 0 && !force) return;
    this.t = 120;
    const v = this.scene.cameras.main.worldView;
    const m = 48;
    for (const it of this.items) {
      it.obj.setVisible(it.x1 >= v.x - m && it.x0 <= v.right + m && it.y1 >= v.y - m && it.y0 <= v.bottom + m);
    }
  }
}

// Partículas ambientales en pantalla: esporas, ceniza, niebla, polvo o brasas según el bioma.
class Ambience {
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.kind = cfg?.kind;
    this.items = [];
    if (!cfg) return;
    const n = this.kind === 'niebla' ? 10 : 30;
    for (let i = 0; i < n; i++) {
      const big = this.kind === 'niebla';
      const r = scene.add.rectangle(0, 0, big ? Phaser.Math.Between(30, 60) : 1, big ? Phaser.Math.Between(6, 12) : 1, hexToInt(Phaser.Utils.Array.GetRandom(cfg.colors)), big ? 0.08 : 0.9)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay - 1);
      this.reset(r, true);
      this.items.push(r);
    }
  }

  reset(r, anywhere) {
    const k = this.kind;
    r.x = Phaser.Math.Between(-20, GAME_W);
    r.y = anywhere ? Phaser.Math.Between(0, GAME_H) : k === 'ceniza' ? -4 : GAME_H + 2;
    r.vx = k === 'niebla' ? Phaser.Math.FloatBetween(3, 7) : k === 'polvo' ? Phaser.Math.FloatBetween(4, 10) : Phaser.Math.FloatBetween(-3, 3);
    r.vy = { esporas: -Phaser.Math.FloatBetween(2, 6), ceniza: Phaser.Math.FloatBetween(4, 9), brasas: -Phaser.Math.FloatBetween(8, 18), polvo: Phaser.Math.FloatBetween(-1, 1), niebla: 0 }[k];
    r.phase = Math.random() * 6;
  }

  update(time, delta) {
    for (const r of this.items) {
      r.x += (r.vx + Math.sin(time / 900 + r.phase) * 2) * (delta / 1000);
      r.y += r.vy * (delta / 1000);
      if (this.kind === 'esporas') r.setAlpha(0.35 + 0.6 * Math.abs(Math.sin(time / 500 + r.phase)));
      if (r.y < -6 || r.y > GAME_H + 6 || r.x > GAME_W + 60) this.reset(r, false);
    }
  }
}

// Anima tiles redibujando su hueco en el lienzo del tileset (agua, lava, hierba alta).
class TileAnimator {
  constructor(scene, key, anims) {
    this.tex = scene.textures.get(key);
    const ctx = this.tex.context;
    this.ctx = ctx;
    this.t = 0;
    this.phase = 0;
    this.items = ctx ? anims.map((a) => ({
      index: a.index,
      slow: a.slow,
      frames: a.frames.map((buf) => {
        const img = ctx.createImageData(16, 16);
        for (let i = 0; i < 256; i++) {
          const c = buf.px[i];
          if (!c) continue;
          const [r, g, b] = hexToRgb(c);
          img.data.set([r, g, b, 255], i * 4);
        }
        return img;
      }),
    })) : [];
  }

  update(delta) {
    this.t += delta;
    if (this.t < 280 || !this.items.length) return;
    this.t = 0;
    this.phase++;
    for (const it of this.items) {
      if (it.slow && this.phase % 2) continue;
      const f = (it.slow ? this.phase / 2 : this.phase) % it.frames.length;
      this.ctx.putImageData(it.frames[f], (it.index % TILESET_COLS) * 16, Math.floor(it.index / TILESET_COLS) * 16);
    }
    this.tex.refresh();
  }
}

// Haz de luz diagonal (tramado) que cae desde una grieta del techo.
function ensureShaftTexture(scene, color) {
  const key = `shaft_${color.slice(1)}`;
  if (scene.textures.exists(key)) return key;
  const w = 56;
  const h = 120;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const [r, g, b] = hexToRgb(color);
  for (let y = 0; y < h; y++) {
    const cx = 14 + (y / h) * 26;
    const half = 7 + (y / h) * 9;
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x + 0.5 - cx) / half;
      if (d > 1) continue;
      const k = (1 - d) * (0.45 + 0.55 * (y / h)) * (y > h - 16 ? (h - y) / 16 : 1);
      if (BAYER4[y % 4][x % 4] > k) continue;
      const i = (y * w + x) * 4;
      img.data.set([r, g, b, 90], i);
    }
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, canvas);
  return key;
}

export function buildRegionView(scene, floor, floorNum) {
  const B = BIOMES[floor.biome];
  const tilesKey = `tiles_f${floorNum}`;
  const { anims } = buildTileset(scene, B, floor.fragment ? BIOMES[floor.fragment.biome] : null, tilesKey);
  const animator = new TileAnimator(scene, tilesKey, anims);
  const map = scene.make.tilemap({ data: computeTiles(floor), tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage(tilesKey, tilesKey, TILE, TILE, 0, 0);
  map.createLayer(0, tileset, 0, 0).setDepth(DEPTH.floor);
  const over = scene.make.tilemap({ data: computeOverlay(floor), tileWidth: TILE, tileHeight: TILE });
  over.createLayer(0, over.addTilesetImage(tilesKey, tilesKey, TILE, TILE, 0, 0), 0, 0).setDepth(DEPTH.floor + 0.5);

  const culler = new Culler(scene);
  ensurePropTextures(scene, floor.biome, B, floor.props);
  for (const p of floor.props) {
    const def = PROPS[p.k];
    const key = propKey(floor.biome, p);
    const x = p.x * TILE;
    const y = (p.y + 1) * TILE;
    const img = p.k === 'hoguera' ? scene.add.sprite(x, y, key, 0).play(`${key}_anim`) : scene.add.image(x, y, key);
    img.setOrigin(0, 1);
    // Profundidad por la fila de la base: quien pase por detrás queda tapado por copas y techos.
    img.setDepth(def.fp.length ? DEPTH.entity + p.y + 0.4 : DEPTH.decal + 1);
    culler.add(img, x, y - img.height, x + img.width, y);
    if (def.light) {
      const [lx, ly] = LIGHT_AT[p.k] || [img.width / 2, 8];
      const gx = x + lx;
      const gy = y - img.height + ly;
      const glow = scene.add.image(gx, gy, def.light === 'frio' ? 'glow_cold' : 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.overlay - 2);
      culler.add(glow, gx - 32, gy - 24, gx + 32, gy + 24);
    }
  }
  // Haces de luz: la bóveda de roca tiene grietas por donde se cuela un resplandor pálido.
  const shaftKey = ensureShaftTexture(scene, B.lavaWater ? PAL.ember1 : PAL.bone1);
  const shafts = (floor.shafts || []).map((c, i) => {
    const x = c.x * TILE - 20;
    const y = (c.y + 1) * TILE - 120;
    const img = scene.add.image(x, y, shaftKey).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.overlay - 4);
    img.phase = i * 1.7;
    culler.add(img, x, y, x + 56, y + 120);
    return img;
  });
  const s = floor.stairs;
  scene.add.image(s.x * TILE + 8, s.y * TILE + 8, 'glow_cold').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.overlay - 2);

  const grassOverlay = scene.add.image(0, 0, `${tilesKey}_grass`).setOrigin(0, 0).setVisible(false);
  const ambience = new Ambience(scene, B.particles);
  return {
    culler,
    ambience,
    // La hierba alta tapa las piernas de quien está dentro de ella (como en Pokémon).
    updateGrass(tile, depth) {
      const inGrass = floor.grass[tile.y * floor.w + tile.x] === 1;
      grassOverlay.setVisible(inGrass);
      if (inGrass) grassOverlay.setPosition(tile.x * TILE, tile.y * TILE).setDepth(depth + 0.2);
      return inGrass;
    },
    update(time, delta) {
      culler.update(delta);
      ambience.update(time, delta);
      animator.update(delta);
      for (const sh of shafts) if (sh.visible) sh.setAlpha(0.65 + 0.35 * Math.sin(time / 1400 + sh.phase));
    },
  };
}
