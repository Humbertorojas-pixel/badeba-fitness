import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants.js';
import { createControls } from '../ui/controls.js';
import { drawBox } from '../gfx/misc.js';
import { pixelText } from '../gfx/font.js';
import { measure } from '../gfx/fontGlyphs.js';
import { PAL, hexToRgb } from '../palette.js';
import { PixelBuffer, addStrip } from '../gfx/pixelBuffer.js';
import { audio } from '../audio/audio.js';
import { getRun } from '../core/state.js';
import { G } from '../world/ground.js';
import { footprint, TREE_KINDS, BUILDINGS } from '../world/props.js';
import { weatherOf } from '../world/weather.js';
import { fit } from '../ui/itemText.js';

// Área visible del mapa en pantalla.
const AREA = { x: 3, y: 24, w: GAME_W - 6, h: 112 };
const ZOOMS = [1, 2, 4];
const ZOOM_LABEL = { 1: 'Vista completa', 2: 'Región', 4: 'Detalle' };
const COVER = { NONE: 0, TREE: 1, HOUSE: 2, LANDMARK: 3, PROP: 4 };
const LANDMARKS = new Set(['coloso', 'arbol_ancestral', 'costilla', 'craneo']);

// Paleta de cartógrafo: el mapa es un pergamino, no una captura del juego.
const INK = {
  fog: PAL.ink, fogEdge: PAL.night, ground: PAL.bone0, groundDot: PAL.bone1, grass: PAL.moss2,
  rock: PAL.stone0, rockHatch: PAL.shade, rockEdge: PAL.stone1, water: PAL.steel1, waterDeep: PAL.steel0, wave: PAL.steel2,
  path: PAL.rust1, bridge: PAL.rust0, paved: PAL.stone2, field: PAL.rust2, fieldRow: PAL.moss1,
  tree: PAL.moss1, treeDark: PAL.moss0, treeLight: PAL.moss2, trunk: PAL.rust0,
  roof: PAL.blood2, roofDark: PAL.blood1, landmark: PAL.bone2, landmarkDark: PAL.stone2, prop: PAL.stone1,
};

function icon(draw, w, h) {
  const b = new PixelBuffer(w, h);
  draw(b);
  return b;
}

function buildIcons(scene) {
  if (scene.textures.exists('map_icon_village')) return;
  addStrip(scene, 'map_icon_village', [icon((b) => {
    b.poly([[0, 4], [4, 0], [8, 4]], PAL.blood2).rect(1, 4, 7, 4, PAL.bone2).rect(3, 5, 2, 3, PAL.ink).set(6, 5, PAL.ember2);
    b.outline(PAL.ink);
  }, 9, 9)]);
  addStrip(scene, 'map_icon_monument', [icon((b) => {
    b.poly([[2, 8], [4, 0], [6, 8]], PAL.bone2).rect(1, 8, 7, 1, PAL.bone1).set(4, 2, PAL.ember2);
    b.outline(PAL.ink);
  }, 9, 10)]);
  addStrip(scene, 'map_icon_stairs', [icon((b) => {
    b.ellipse(4.5, 4.5, 4, 4, PAL.blood3).ellipse(4.5, 4.5, 2.6, 2.6, PAL.ink).rect(4, 2, 1, 4, PAL.blood3).poly([[2, 4], [7, 4], [4.5, 7]], PAL.blood3);
    b.outline(PAL.ink);
  }, 9, 9)]);
  addStrip(scene, 'map_icon_danger', [icon((b) => {
    b.ellipse(3.5, 3, 3, 3, PAL.bone2).rect(2, 5, 4, 2, PAL.bone2).set(2, 3, PAL.ink).set(5, 3, PAL.ink).set(3, 6, PAL.ink);
    b.outline(PAL.ember1);
  }, 8, 8)]);
  addStrip(scene, 'map_icon_dungeon', [icon((b) => {
    b.poly([[0, 8], [0, 3], [4.5, 0], [9, 3], [9, 8]], PAL.stone2).poly([[2, 8], [2, 4], [4.5, 2], [7, 4], [7, 8]], PAL.ink).set(4, 5, PAL.ember2);
    b.outline(PAL.ink);
  }, 10, 9)]);
  addStrip(scene, 'map_icon_chest', [icon((b) => {
    b.rect(0, 2, 7, 5, PAL.rust2).rect(0, 2, 7, 1, PAL.rust1).set(3, 4, PAL.ember2);
    b.outline(PAL.ink);
  }, 8, 8)]);
  addStrip(scene, 'map_icon_chapel', [icon((b) => {
    b.rect(3, 0, 1, 3, PAL.bone2).rect(2, 1, 3, 1, PAL.bone2).poly([[0, 9], [0, 5], [3.5, 3], [7, 5], [7, 9]], PAL.stone3).rect(3, 6, 1, 3, PAL.ink);
    b.outline(PAL.ink);
  }, 8, 10)]);
  addStrip(scene, 'map_icon_camp', [icon((b) => {
    b.poly([[0, 7], [3.5, 0], [7, 7]], PAL.bone1).poly([[2.5, 7], [3.5, 4], [4.5, 7]], PAL.ink);
    b.outline(PAL.ink);
  }, 8, 8)]);
  // Misiones: "!" quien ofrece una, "?" quien espera tu regreso, diana roja el objetivo activo.
  addStrip(scene, 'map_icon_quest', [icon((b) => {
    b.rect(2, 0, 3, 5, PAL.ember2).rect(2, 6, 3, 2, PAL.ember2).rect(3, 0, 1, 5, PAL.bone2);
    b.outline(PAL.ink);
  }, 7, 9)]);
  addStrip(scene, 'map_icon_quest_done', [icon((b) => {
    b.rect(1, 0, 5, 2, PAL.ember2).rect(4, 2, 2, 2, PAL.ember2).rect(3, 3, 2, 2, PAL.ember2).rect(3, 6, 2, 2, PAL.ember2);
    b.outline(PAL.ink);
  }, 8, 9)]);
  addStrip(scene, 'map_icon_target', [icon((b) => {
    b.ellipse(4.5, 4.5, 4.4, 4.4, PAL.blood3).ellipse(4.5, 4.5, 3, 3, PAL.ink).ellipse(4.5, 4.5, 1.6, 1.6, PAL.blood3);
    b.outline(PAL.ink);
  }, 10, 10)]);
  addStrip(scene, 'map_icon_player', [icon((b) => {
    b.poly([[3.5, 0], [7, 7], [3.5, 5], [0, 7]], PAL.ember2).set(3, 3, PAL.bone2);
    b.outline(PAL.ink);
  }, 8, 8)]);
}

// Pinta el mapa a `s` píxeles por casilla: bosques con copas, agua con olas, roca rayada,
// casas con tejado y niebla tramada en el borde de lo explorado.
function paintMap(f, cover, s) {
  const W = f.w * s;
  const H = f.h * s;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const rgb = {};
  for (const [k, v] of Object.entries(INK)) rgb[k] = hexToRgb(v);
  const at = (x, y) => (x < 0 || y < 0 || x >= f.w || y >= f.h ? -1 : y * f.w + x);
  const seen = (x, y) => { const i = at(x, y); return i >= 0 && f.seen[i] === 1; };
  const g = (x, y) => { const i = at(x, y); return i < 0 ? G.ROCK : f.ground[i]; };
  for (let ty = 0; ty < f.h; ty++) {
    for (let tx = 0; tx < f.w; tx++) {
      const i = ty * f.w + tx;
      const vis = f.seen[i] === 1;
      const edge = !vis && (seen(tx + 1, ty) || seen(tx - 1, ty) || seen(tx, ty + 1) || seen(tx, ty - 1));
      const gt = f.ground[i];
      const deep = gt === G.WATER && [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => g(tx + dx, ty + dy) === G.WATER);
      const rockEdge = gt === G.ROCK && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g(tx + dx, ty + dy) !== G.ROCK);
      for (let v = 0; v < s; v++) {
        for (let u = 0; u < s; u++) {
          const px = tx * s + u;
          const py = ty * s + v;
          let c;
          if (!vis) c = edge && (px + py) % 2 === 0 ? 'fogEdge' : 'fog';
          else {
            const cv = cover[i];
            if (cv === COVER.TREE) {
              if (s === 4) c = v === 3 ? (u === 1 || u === 2 ? 'trunk' : 'ground') : v === 0 ? (u === 1 || u === 2 ? 'treeLight' : 'ground') : u === 3 && v === 2 ? 'treeDark' : 'tree';
              else if (s === 2) c = u === 1 && v === 1 ? 'treeDark' : 'tree';
              else c = 'tree';
            } else if (cv === COVER.HOUSE) c = s >= 2 && v === s - 1 ? 'roofDark' : 'roof';
            else if (cv === COVER.LANDMARK) c = s >= 2 && (u + v) % 2 ? 'landmarkDark' : 'landmark';
            else if (cv === COVER.PROP) c = s === 4 && (u === 0 || v === 0 || u === 3 || v === 3) ? 'ground' : 'prop';
            else {
              switch (gt) {
                case G.ROCK:
                  c = rockEdge ? 'rockEdge' : s >= 2 && (px + py) % 3 === 0 ? 'rockHatch' : 'rock';
                  break;
                case G.WATER:
                  c = deep ? 'waterDeep' : 'water';
                  if (s >= 2 && v === s - 1 && (px + ty * 3) % 4 === 0) c = 'wave';
                  break;
                case G.PATH: c = 'path'; break;
                case G.BRIDGE: c = 'bridge'; break;
                case G.PAVED: c = 'paved'; break;
                case G.FIELD: c = v % 2 ? 'fieldRow' : 'field'; break;
                default:
                  if (f.grass[i]) c = s === 1 ? ((tx + ty) % 2 ? 'grass' : 'ground') : (u + v) % 2 === 0 ? 'grass' : 'ground';
                  else c = (px * 7 + py * 13) % 11 === 0 ? 'groundDot' : 'ground';
              }
            }
          }
          const k = (py * W + px) * 4;
          const [r, gg, b] = rgb[c];
          img.data[k] = r;
          img.data[k + 1] = gg;
          img.data[k + 2] = b;
          img.data[k + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Mapa de la región con tres niveles de zoom y desplazamiento: la región es enorme y el jugador,
// una flecha diminuta en ella.
export class MapView extends Phaser.Scene {
  constructor() {
    super('MapView');
  }

  create() {
    const run = getRun(this);
    const f = run.dungeon?.data || run.floorData;
    this.f = f;
    this.controls = createControls(this);
    buildIcons(this);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x14121a).setOrigin(0, 0);

    this.cover = new Uint8Array(f.w * f.h);
    for (const p of f.props) {
      const code = TREE_KINDS.has(p.k) ? COVER.TREE : BUILDINGS.has(p.k) ? COVER.HOUSE : LANDMARKS.has(p.k) ? COVER.LANDMARK : COVER.PROP;
      for (const [x, y] of footprint(p)) if (x >= 0 && y >= 0 && x < f.w && y < f.h) this.cover[y * f.w + x] = code;
    }
    for (const s of ZOOMS) {
      const key = `region_map_${s}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, paintMap(f, this.cover, s));
    }

    this.frame = this.add.graphics();
    this.frame.fillStyle(0x2e2a38).fillRect(AREA.x - 2, AREA.y - 2, AREA.w + 4, AREA.h + 4);
    // El mapa vive en su propio "mundo" y lo muestra una cámara recortada al área del mapa.
    this.mapImg = this.add.image(0, 0, 'region_map_2').setOrigin(0, 0);
    this.markers = this.add.container(0, 0);

    const title = run.dungeon ? `${run.dungeon.name} · Piso ${run.floor}` : `Piso ${run.floor} · ${f.biomeName}`;
    drawBox(this.add.graphics(), 0, 0, GAME_W, 22);
    pixelText(this, 8, 5, title, 'box');
    const weather = run.dungeon ? 'Bajo tierra' : weatherOf(run.weather).name;
    pixelText(this, GAME_W - 8 - measure(weather), 5, weather, 'faded');

    const pos = run.pos || f.start;
    this.pos = pos;
    const explored = Math.round((f.seen.reduce((s, v) => s + v, 0) / (f.w * f.h)) * 100);
    const zone = f.zones.filter((z) => Math.hypot(z.x - pos.x, z.y - pos.y) <= z.r).sort((a, b) => a.r - b.r)[0];
    drawBox(this.add.graphics(), 0, 138, GAME_W, 22);
    const info = `${explored}% explorado`;
    pixelText(this, 8, 143, fit(zone ? zone.name : 'Tierras salvajes', GAME_W - 30 - measure(info)), 'box');
    pixelText(this, GAME_W - 8 - measure(info), 143, info, 'faded');
    const hint = 'Z: zoom  X: salir  Flechas: mover';
    this.add.rectangle(AREA.x, AREA.y + AREA.h - 11, AREA.w, 11, 0x14121a).setOrigin(0, 0).setDepth(4);
    this.zoomLabel = pixelText(this, AREA.x + 3, AREA.y + AREA.h - 11, '', 'light').setDepth(5);
    pixelText(this, AREA.x + AREA.w - 3 - measure(hint), AREA.y + AREA.h - 11, hint, 'dim').setDepth(5);

    this.cameras.main.ignore([this.mapImg, this.markers]);
    this.mapCam = this.cameras.add(AREA.x, AREA.y, AREA.w, AREA.h - 11).setRoundPixels(true);
    this.mapCam.setBackgroundColor('#14121a');
    this.mapCam.ignore(this.children.list.filter((o) => o !== this.mapImg && o !== this.markers));

    this.zoomIndex = 1;
    this.setZoom(1, pos);
    audio.sfx('confirm');
  }

  // Cambia el zoom manteniendo centrado el punto de interés.
  setZoom(index, focus) {
    this.zoomIndex = index;
    const s = ZOOMS[index];
    this.s = s;
    this.mapImg.setTexture(`region_map_${s}`);
    this.mapW = this.f.w * s;
    this.mapH = this.f.h * s;
    this.panX = focus.x * s + s / 2 - AREA.w / 2;
    this.panY = focus.y * s + s / 2 - (AREA.h - 11) / 2;
    this.zoomLabel.setText(ZOOM_LABEL[s]);
    this.buildMarkers();
    this.applyPan();
  }

  buildMarkers() {
    const f = this.f;
    const s = this.s;
    this.markers.removeAll(true);
    this.marks = [];
    const seen = (x, y) => f.seen[y * f.w + x] === 1;
    const mark = (tx, ty, key, label) => {
      const img = this.add.image(0, 0, key).setOrigin(0.5, 0.5);
      this.markers.add(img);
      let text = null;
      if (label && s >= 2) {
        text = pixelText(this, 0, 0, label, 'light');
        this.markers.add(text);
      }
      this.marks.push({ tx, ty, img, text });
    };
    for (const z of f.zones) {
      if (!seen(z.x, z.y)) continue;
      if (z.kind === 'aldea') mark(z.x, z.y, 'map_icon_village', z.name);
      else if (z.kind === 'monumento') mark(z.x, z.y, 'map_icon_monument', z.name);
      else if (z.kind === 'capilla') mark(z.x, z.y, 'map_icon_chapel', s === 4 ? z.name : null);
      else if (z.kind === 'campamento' && s === 4) mark(z.x, z.y, 'map_icon_camp');
      else if (z.kind === 'mazmorra' && z.r < 50) mark(z.x, z.y - 1, 'map_icon_dungeon', z.name);
      else if ((z.kind === 'lago' || z.kind === 'bosque') && s === 4) {
        const t = pixelText(this, 0, 0, z.name, 'dim');
        this.markers.add(t);
        this.marks.push({ tx: z.x, ty: z.y, img: null, text: t, center: true });
      }
    }
    const run = getRun(this);
    const guard = f.enemies.find((e) => e.id === 'guardian' || e.boss);
    if (guard && seen(guard.x, guard.y) && !run.defeated.includes(guard.id)) mark(guard.x, guard.y, 'map_icon_danger');
    for (const c of f.inspect.filter((i) => i.action === 'cofre')) if (seen(c.x, c.y) && !(run.opened || []).includes(c.id)) mark(c.x, c.y, 'map_icon_chest');
    if (seen(f.stairs.x, f.stairs.y)) mark(f.stairs.x, f.stairs.y, 'map_icon_stairs', s === 4 ? (f.dark ? 'Salida' : 'El Descenso') : null);
    if (!f.dark) this.questMarks(run, mark, seen);
    this.player = this.add.image(0, 0, 'map_icon_player').setOrigin(0.5, 0.5);
    this.markers.add(this.player);
    this.marks.push({ tx: this.pos.x, ty: this.pos.y, img: this.player, text: null });
    // Coordenadas del mundo del mapa: la cámara recorta lo que queda fuera.
    for (const m of this.marks) {
      const x = m.tx * s + s / 2;
      const y = m.ty * s + s / 2;
      if (m.img) m.img.setPosition(Math.round(x), Math.round(y));
      if (m.text) {
        const w = measure(m.text.text || '');
        m.text.setPosition(Math.round(m.center ? x - w / 2 : x + 6), Math.round(y - 4));
      }
    }
  }

  // Quien ofrece misión (si ya lo viste), quien espera tu regreso y el objetivo de cada misión
  // activa: el NPC te dijo dónde buscar, así que el objetivo se marca aunque siga en la niebla.
  questMarks(run, mark, seen) {
    const f = this.f;
    const quests = (run.quests || []).filter((q) => q.floor === run.floor);
    for (const n of f.npcs) {
      if (!n.quest || run.defeated.includes(n.id)) continue;
      const q = quests.find((qq) => qq.id === n.quest.id);
      if (!q && seen(n.x, n.y)) mark(n.x, n.y, 'map_icon_quest', this.s === 4 ? n.sheet.name : null);
      else if (q?.status === 'cumplida') mark(n.x, n.y, 'map_icon_quest_done', this.s >= 2 ? n.sheet.name : null);
    }
    for (const q of quests) {
      if (q.status !== 'activa') continue;
      let at = null;
      if (q.type === 'cazar') {
        const e = f.enemies.find((en) => en.id === q.target);
        if (e && !run.defeated.includes(e.id)) at = e;
      } else if (q.type === 'jefe' || q.type === 'recuperar') at = (f.dungeons || []).find((d) => d.id === q.target);
      else if (q.type === 'peregrinar') at = f.inspect.find((i) => i.landmark);
      if (at) mark(at.x, at.y + (q.type === 'jefe' || q.type === 'recuperar' ? -1 : 0), 'map_icon_target');
    }
  }

  applyPan() {
    const clampAxis = (v, size, view) => (size <= view ? -(view - size) / 2 : Math.max(0, Math.min(size - view, v)));
    this.panX = clampAxis(this.panX, this.mapW, AREA.w);
    this.panY = clampAxis(this.panY, this.mapH, AREA.h - 11);
    this.mapCam.setScroll(Math.round(this.panX), Math.round(this.panY));
  }

  update(time, delta) {
    this.player.setAlpha(Math.floor(time / 300) % 2 === 0 ? 1 : 0.35);
    const c = this.controls;
    if (c.start() || c.cancel()) {
      c.confirm();
      audio.sfx('cancel');
      this.scene.resume('Overworld');
      this.scene.stop();
      return;
    }
    if (c.confirm()) {
      audio.sfx('cursor');
      const s = this.s;
      const focus = { x: (this.panX + AREA.w / 2) / s, y: (this.panY + AREA.h / 2) / s };
      this.setZoom((this.zoomIndex + 1) % ZOOMS.length, { x: Math.floor(focus.x), y: Math.floor(focus.y) });
      return;
    }
    const dir = c.dir();
    if (dir) {
      const speed = (delta / 1000) * 160;
      if (dir === 'left') this.panX -= speed;
      if (dir === 'right') this.panX += speed;
      if (dir === 'up') this.panY -= speed;
      if (dir === 'down') this.panY += speed;
      this.applyPan();
    }
  }
}
