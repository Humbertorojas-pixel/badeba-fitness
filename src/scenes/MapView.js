import Phaser from 'phaser';
import { GAME_W } from '../constants.js';
import { createControls } from '../ui/controls.js';
import { drawBox } from '../gfx/misc.js';
import { pixelText } from '../gfx/font.js';
import { measure } from '../gfx/fontGlyphs.js';
import { PAL, hexToRgb } from '../palette.js';
import { audio } from '../audio/audio.js';
import { getRun } from '../core/state.js';
import { BIOMES } from '../world/biomes.js';
import { G } from '../world/ground.js';
import { footprint, TREE_KINDS } from '../world/props.js';

// Mapa de la región a 1 píxel por casilla, con niebla de guerra: el jugador es un punto diminuto.
export class MapView extends Phaser.Scene {
  constructor() {
    super('MapView');
  }

  create() {
    const run = getRun(this);
    const f = run.floorData;
    const B = BIOMES[f.biome];
    this.controls = createControls(this);
    this.add.rectangle(0, 0, GAME_W, 160, 0x14121a).setOrigin(0, 0);
    const title = `Piso ${run.floor} · ${f.biomeName}`;
    drawBox(this.add.graphics(), 0, 0, GAME_W, 22);
    pixelText(this, Math.round((GAME_W - measure(title)) / 2), 5, title, 'box');

    const cover = new Uint8Array(f.w * f.h);
    for (const p of f.props) {
      const code = TREE_KINDS.has(p.k) ? 1 : p.k === 'casa' ? 2 : ['coloso', 'arbol_ancestral', 'costilla', 'craneo'].includes(p.k) ? 3 : 4;
      for (const [x, y] of footprint(p)) if (x >= 0 && y >= 0 && x < f.w && y < f.h) cover[y * f.w + x] = code;
    }
    const colorOf = (i) => {
      if (!f.seen[i]) return PAL.ink;
      const c = cover[i];
      if (c === 1) return B.leaves[1];
      if (c === 2) return PAL.blood2;
      if (c === 3) return PAL.bone2;
      if (c === 4) return PAL.stone2;
      switch (f.ground[i]) {
        case G.ROCK: return PAL.night;
        case G.WATER: return B.water[1];
        case G.PATH: case G.BRIDGE: return B.path[2];
        case G.PAVED: return B.path[1];
        default: return f.grass[i] ? B.tallGrass[1] : B.ground.colors[1];
      }
    };
    const canvas = document.createElement('canvas');
    canvas.width = f.w;
    canvas.height = f.h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(f.w, f.h);
    for (let i = 0; i < f.w * f.h; i++) {
      const [r, g, b] = hexToRgb(colorOf(i));
      img.data.set([r, g, b, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    if (this.textures.exists('region_map')) this.textures.remove('region_map');
    this.textures.addCanvas('region_map', canvas);

    const ox = Math.round((GAME_W - f.w) / 2);
    const oy = 26 + Math.round((112 - f.h) / 2);
    this.add.rectangle(ox - 2, oy - 2, f.w + 4, f.h + 4, 0x2e2a38).setOrigin(0, 0);
    this.add.image(ox, oy, 'region_map').setOrigin(0, 0);

    const seen = (x, y) => f.seen[y * f.w + x] === 1;
    const mark = (x, y, color) => this.add.rectangle(ox + x - 1, oy + y - 1, 3, 3, parseInt(color.slice(1), 16)).setOrigin(0, 0);
    for (const z of f.zones) {
      if (!seen(z.x, z.y)) continue;
      if (z.kind === 'aldea') mark(z.x, z.y, PAL.ember2);
      if (z.kind === 'monumento') mark(z.x, z.y, PAL.bone2);
    }
    if (seen(f.stairs.x, f.stairs.y)) mark(f.stairs.x, f.stairs.y, PAL.blood3);
    const pos = run.pos || f.start;
    this.dot = this.add.rectangle(ox + pos.x - 1, oy + pos.y - 1, 3, 3, 0xd8cfbc).setOrigin(0, 0);

    const explored = Math.round((f.seen.reduce((s, v) => s + v, 0) / (f.w * f.h)) * 100);
    const zone = f.zones.filter((z) => Math.hypot(z.x - pos.x, z.y - pos.y) <= z.r).sort((a, b) => a.r - b.r)[0];
    drawBox(this.add.graphics(), 0, 138, GAME_W, 22);
    pixelText(this, 8, 143, zone ? zone.name : 'Tierras salvajes', 'box');
    const info = `${explored}% explorado`;
    pixelText(this, GAME_W - 8 - measure(info), 143, info, 'faded');
    audio.sfx('confirm');
  }

  update(time) {
    this.dot.setVisible(Math.floor(time / 300) % 2 === 0);
    const c = this.controls;
    if (c.cancel() || c.confirm() || c.start()) {
      audio.sfx('cancel');
      this.scene.resume('Overworld');
      this.scene.stop();
    }
  }
}
