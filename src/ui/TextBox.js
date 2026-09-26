import { drawBox } from '../gfx/misc.js';
import { pixelText } from '../gfx/font.js';
import { wrap, LINE_H } from '../gfx/fontGlyphs.js';
import { DEPTH } from '../constants.js';
import { audio } from '../audio/audio.js';

const CHARS_PER_SEC = 45;

// Caja de mensajes inferior (2 líneas) con máquina de escribir y flecha de continuar.
export class TextBox {
  constructor(scene, controls, { x = 0, y = 112, w = 240, h = 48 } = {}) {
    this.scene = scene;
    this.controls = controls;
    this.rect = { x, y, w, h };
    this.container = scene.add.container(0, 0).setDepth(DEPTH.ui).setScrollFactor(0).setVisible(false);
    this.bg = drawBox(scene.add.graphics(), x, y, w, h);
    this.lines = [0, 1].map((i) => pixelText(scene, x + 10, y + 9 + i * (LINE_H + 3), '', 'box'));
    this.arrow = scene.add.image(x + w - 16, y + h - 13, 'ui_next').setOrigin(0, 0).setVisible(false);
    this.container.add([this.bg, ...this.lines, this.arrow]);
    this.active = false;
    this._tick = this._tick.bind(this);
    scene.events.on('update', this._tick);
    scene.events.once('shutdown', () => scene.events.off('update', this._tick));
  }

  get maxWidth() {
    return this.rect.w - 26;
  }

  say(text, { auto = 0 } = {}) {
    const all = wrap(text, this.maxWidth);
    const pages = [];
    for (let i = 0; i < all.length; i += 2) pages.push(all.slice(i, i + 2));
    this.container.setVisible(true);
    return new Promise((resolve) => {
      this.state = { pages, page: 0, shown: 0, auto, waited: 0, resolve };
      this._startPage();
      this.active = true;
    });
  }

  hide() {
    this.container.setVisible(false);
    this.active = false;
  }

  // Texto fijo sin esperar entrada (ej. "¿Qué hará Errante?" junto al menú de combate).
  show(text) {
    const lines = wrap(text, this.maxWidth);
    this.lines.forEach((t, i) => t.setText(lines[i] || ''));
    this.arrow.setVisible(false);
    this.container.setVisible(true);
    this.active = false;
  }

  _startPage() {
    const s = this.state;
    s.shown = 0;
    s.waited = 0;
    s.total = s.pages[s.page].reduce((n, l) => n + [...l].length, 0);
    this.lines.forEach((t) => t.setText(''));
    this.arrow.setVisible(false);
  }

  _render() {
    const s = this.state;
    let left = Math.floor(s.shown);
    s.pages[s.page].forEach((line, i) => {
      const chars = [...line];
      this.lines[i].setText(chars.slice(0, Math.max(0, left)).join(''));
      left -= chars.length;
    });
    for (let i = s.pages[s.page].length; i < 2; i++) this.lines[i].setText('');
  }

  _tick(_time, delta) {
    if (!this.active) return;
    const s = this.state;
    const c = this.controls;
    if (s.shown < s.total) {
      const speed = c.confirmHeld() ? 4 : 1;
      s.shown = Math.min(s.total, s.shown + (CHARS_PER_SEC * speed * delta) / 1000);
      c.confirm();
      this._render();
      return;
    }
    const last = s.page === s.pages.length - 1;
    if (!(last && s.auto)) this.arrow.setVisible(Math.floor(this.scene.time.now / 300) % 2 === 0);
    s.waited += delta;
    const advance = c.confirm() || (last && s.auto && s.waited >= s.auto);
    if (!advance) return;
    if (!last) {
      audio.sfx('cursor');
      s.page++;
      this._startPage();
      return;
    }
    this.active = false;
    this.arrow.setVisible(false);
    s.resolve();
  }
}
