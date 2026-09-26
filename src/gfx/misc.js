import { PixelBuffer, addStrip, BAYER4 } from './pixelBuffer.js';
import { PAL, hexToRgb } from '../palette.js';
import { createRng } from '../core/rng.js';
import { GAME_W, GAME_H } from '../constants.js';

function canvasTexture(scene, key, w, h, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  paint(ctx);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

// Oscuridad radial cuantizada con tramado ordenado: mismo recurso que usaban los juegos de GBA.
function ditheredRadial(ctx, w, h, { cx, cy, rx, ry, inner, outer, maxAlpha, color, invert = false }) {
  const [r, g, b] = hexToRgb(color);
  const img = ctx.createImageData(w, h);
  const steps = 5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      let k = Math.min(1, Math.max(0, (d - inner) / (outer - inner)));
      if (invert) k = 1 - k;
      const level = k * steps;
      const lo = Math.floor(level);
      const q = (level - lo > BAYER4[y % 4][x % 4] ? lo + 1 : lo) / steps;
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(q * maxAlpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function buildMisc(scene) {
  canvasTexture(scene, 'vignette', GAME_W, GAME_H, (ctx) =>
    ditheredRadial(ctx, GAME_W, GAME_H, { cx: GAME_W / 2, cy: GAME_H / 2 + 4, rx: 120, ry: 90, inner: 0.45, outer: 1.05, maxAlpha: 0.92, color: PAL.ink }));

  canvasTexture(scene, 'glow', 64, 48, (ctx) =>
    ditheredRadial(ctx, 64, 48, { cx: 32, cy: 20, rx: 30, ry: 22, inner: 0.0, outer: 1.0, maxAlpha: 0.28, color: PAL.ember1, invert: true }));

  const torchFrames = [0, 1, 2].map((f) => {
    const b = new PixelBuffer(16, 16);
    b.rect(6, 10, 4, 2, PAL.rust1).rect(7, 12, 2, 3, PAL.rust0).set(6, 10, PAL.rust2);
    const flame = new PixelBuffer(16, 16);
    const hgt = [5, 6, 4][f];
    const sway = [0, 1, -1][f];
    flame.ellipse(8 + sway * 0.5, 10 - hgt / 2, 2.2, hgt / 2 + 0.5, PAL.blood3);
    flame.ellipse(8 + sway * 0.5, 10 - hgt / 2 + 1, 1.3, hgt / 2 - 0.5, PAL.ember1);
    flame.set(8 + sway, 10 - hgt, PAL.blood3);
    flame.set(8, 8, PAL.ember2).set(8, 9, PAL.ember2);
    return b.paste(flame, 0, 0).outline(PAL.ink);
  });
  addStrip(scene, 'torch', torchFrames);

  const cursor = new PixelBuffer(6, 8);
  cursor.poly([[0, 0], [5, 4], [0, 8]], PAL.ink);
  addStrip(scene, 'ui_cursor', [cursor]);

  const next = new PixelBuffer(7, 5);
  next.poly([[0, 0], [7, 0], [3.5, 4.5]], PAL.blood2);
  next.outline(PAL.ink);
  addStrip(scene, 'ui_next', [next.shift(0, 0)]);

  const shadow = new PixelBuffer(14, 5).ellipse(7, 2.5, 6.5, 2.2, PAL.ink);
  addStrip(scene, 'shadow', [shadow]);

  buildBattleBackdrop(scene);
}

function buildBattleBackdrop(scene) {
  canvasTexture(scene, 'battle_bg', GAME_W, 112, (ctx) => {
    const rng = createRng(90210);
    const bands = [PAL.ink, PAL.night, PAL.shade, PAL.dusk];
    for (let y = 0; y < 112; y++) {
      const t = (y / 112) * (bands.length - 1);
      const lo = Math.floor(t);
      for (let x = 0; x < GAME_W; x++) {
        const pick = t - lo > BAYER4[y % 4][x % 4] ? Math.min(lo + 1, bands.length - 1) : lo;
        ctx.fillStyle = bands[pick];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (let i = 0; i < 7; i++) {
      const x = rng.int(0, GAME_W - 12);
      const w = rng.int(6, 12);
      const top = rng.int(8, 40);
      ctx.fillStyle = PAL.night;
      ctx.fillRect(x, top, w, 112 - top);
      ctx.fillStyle = PAL.shade;
      ctx.fillRect(x, top, 1, 112 - top);
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(x + w - 1, top, 1, 112 - top);
    }
    ctx.fillStyle = PAL.stone0;
    ctx.fillRect(0, 96, GAME_W, 16);
    for (let x = 0; x < GAME_W; x += 2) {
      ctx.fillStyle = (x / 2) % 2 ? PAL.dusk : PAL.stone0;
      ctx.fillRect(x, 95, 2, 1);
    }
  });

  const platform = (w, h) => {
    const b = new PixelBuffer(w, h);
    b.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, PAL.stone1);
    b.ellipse(w / 2, h / 2 + 1, w / 2 - 4, h / 2 - 3, PAL.stone0);
    b.ellipse(w / 2 - 2, h / 2 - 1, w / 2 - 8, h / 2 - 4, PAL.stone2);
    b.ellipse(w / 2 - 1, h / 2, w / 2 - 10, h / 2 - 4, PAL.stone1);
    return b.outline(PAL.ink);
  };
  addStrip(scene, 'platform_enemy', [platform(88, 20)]);
  addStrip(scene, 'platform_player', [platform(104, 22)]);
}

// Marco de caja estilo Pokémon GBA: contorno, borde de color, relleno claro.
export function drawBox(g, x, y, w, h, { border = PAL.blood1, fill = PAL.bone2, inner = PAL.bone1 } = {}) {
  const hex = (c) => parseInt(c.slice(1), 16);
  g.fillStyle(hex(PAL.ink)).fillRect(x, y, w, h);
  g.fillStyle(hex(border)).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(hex(PAL.ink)).fillRect(x + 3, y + 3, w - 6, h - 6);
  g.fillStyle(hex(fill)).fillRect(x + 4, y + 4, w - 8, h - 8);
  g.fillStyle(hex(inner)).fillRect(x + 4, y + h - 5, w - 8, 1);
  g.fillStyle(hex(PAL.blood3)).fillRect(x + 1, y + 1, 1, 1).fillRect(x + w - 2, y + 1, 1, 1).fillRect(x + 1, y + h - 2, 1, 1).fillRect(x + w - 2, y + h - 2, 1, 1);
  return g;
}
