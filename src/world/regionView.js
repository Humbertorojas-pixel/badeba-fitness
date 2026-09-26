import Phaser from 'phaser';
import { TILE, DEPTH, GAME_W, GAME_H } from '../constants.js';
import { buildTileset } from '../gfx/tiles.js';
import { ensurePropTextures, propKey } from '../gfx/propTextures.js';
import { computeTiles } from './floor.js';
import { BIOMES } from './biomes.js';
import { PROPS } from './props.js';
import { hexToInt } from '../palette.js';

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

export function buildRegionView(scene, floor, floorNum) {
  const B = BIOMES[floor.biome];
  const tilesKey = `tiles_f${floorNum}`;
  if (!scene.textures.exists(tilesKey)) buildTileset(scene, B, floor.fragment ? BIOMES[floor.fragment.biome] : null, tilesKey);
  const map = scene.make.tilemap({ data: computeTiles(floor), tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage(tilesKey, tilesKey, TILE, TILE, 0, 0);
  map.createLayer(0, tileset, 0, 0).setDepth(DEPTH.floor);

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
    },
  };
}
