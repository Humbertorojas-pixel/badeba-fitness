import { GLYPHS, CELL_H, LINE_H } from './fontGlyphs.js';
import { PAL } from '../palette.js';

export const FONT_STYLES = {
  box: { color: PAL.ink, shadow: PAL.bone0 },
  light: { color: PAL.bone2, shadow: PAL.ink },
  blood: { color: PAL.blood3, shadow: PAL.ink },
  ember: { color: PAL.ember2, shadow: PAL.ink },
  dim: { color: PAL.stone3, shadow: PAL.ink },
  faded: { color: PAL.stone2, shadow: PAL.bone0 },
  rare: { color: PAL.steel1, shadow: PAL.bone0 },
  legend: { color: PAL.ember0, shadow: PAL.bone0 },
  unique: { color: PAL.blood2, shadow: PAL.bone0 },
};

export const RARITY_STYLE = { comun: 'box', raro: 'rare', legendario: 'legend', unico: 'unique' };

// Genera una fuente bitmap por estilo: el glifo lleva sombra abajo/derecha horneada.
export function registerFonts(scene) {
  const chars = Object.keys(GLYPHS);
  const cols = 16;
  const cellW = 8;
  const cellH = CELL_H + 1;
  const rows = Math.ceil(chars.length / cols);

  for (const [style, { color, shadow }] of Object.entries(FONT_STYLES)) {
    const key = `font_${style}`;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cellW;
    canvas.height = rows * cellH;
    const ctx = canvas.getContext('2d');

    const place = [];
    chars.forEach((ch, i) => {
      const g = GLYPHS[ch];
      const ox = (i % cols) * cellW;
      const oy = Math.floor(i / cols) * cellH;
      const plot = (fill, dx, dy) => {
        ctx.fillStyle = fill;
        g.rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) {
            if (row[x] === '#') ctx.fillRect(ox + x + dx, oy + y + dy, 1, 1);
          }
        });
      };
      plot(shadow, 1, 0);
      plot(shadow, 0, 1);
      plot(shadow, 1, 1);
      plot(color, 0, 0);
      place.push({ ch, x: ox, y: oy, w: g.width + 1, h: cellH, adv: g.width + 1 });
    });

    const texture = scene.textures.addCanvas(key, canvas);
    const W = canvas.width;
    const H = canvas.height;
    const data = { font: key, size: CELL_H, lineHeight: LINE_H, chars: {} };
    for (const p of place) {
      const code = p.ch.codePointAt(0);
      const u0 = p.x / W;
      const v0 = p.y / H;
      const u1 = (p.x + p.w) / W;
      const v1 = (p.y + p.h) / H;
      data.chars[code] = {
        x: p.x, y: p.y, width: p.w, height: p.h,
        centerX: Math.floor(p.w / 2), centerY: Math.floor(p.h / 2),
        xOffset: 0, yOffset: 0, xAdvance: p.adv,
        data: {}, kerning: {}, u0, v0, u1, v1,
      };
      const frame = texture.add(p.ch, 0, p.x, p.y, p.w, p.h);
      if (frame) frame.setUVs(p.w, p.h, u0, v0, u1, v1);
    }
    scene.cache.bitmapFont.add(key, { data, texture: key, frame: null });
  }
}

export function pixelText(scene, x, y, text, style = 'box') {
  return scene.add.bitmapText(x, y, `font_${style}`, text).setOrigin(0, 0);
}
