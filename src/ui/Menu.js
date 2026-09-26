import { drawBox } from '../gfx/misc.js';
import { pixelText } from '../gfx/font.js';
import { DEPTH } from '../constants.js';
import { audio } from '../audio/audio.js';

// Menú en rejilla con cursor ▶ (como LUCHAR/MOCHILA/POKéMON/HUIR).
export class Menu {
  constructor(scene, controls, { x, y, w, h, items, cols = 1, colW = 48, rowH = 16, cancellable = true, padX = 16, padY = 10, onChange = null }) {
    this.scene = scene;
    this.controls = controls;
    this.items = items;
    this.cols = cols;
    this.cancellable = cancellable;
    this.onChange = onChange;
    this.index = 0;
    this.container = scene.add.container(0, 0).setDepth(DEPTH.ui + 1).setScrollFactor(0).setVisible(false);
    this.container.add(drawBox(scene.add.graphics(), x, y, w, h));
    this.positions = items.map((_, i) => ({ x: x + padX + (i % cols) * colW, y: y + padY + Math.floor(i / cols) * rowH }));
    this.labels = items.map((it, i) => {
      const t = pixelText(scene, this.positions[i].x, this.positions[i].y, it.label, it.disabled ? 'faded' : it.style || 'box');
      this.container.add(t);
      return t;
    });
    this.cursor = scene.add.image(0, 0, 'ui_cursor').setOrigin(0, 0);
    this.container.add(this.cursor);
    this._tick = this._tick.bind(this);
    scene.events.on('update', this._tick);
    scene.events.once('shutdown', () => scene.events.off('update', this._tick));
    this.active = false;
  }

  setItemLabel(i, label, disabled = false) {
    this.items[i].label = label;
    this.items[i].disabled = disabled;
    this.labels[i].setFont(disabled ? 'font_faded' : `font_${this.items[i].style || 'box'}`).setText(label);
  }

  open(startIndex = this.index) {
    this.index = startIndex;
    this._place();
    this.container.setVisible(true);
    this.active = true;
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  close() {
    this.container.setVisible(false);
    this.active = false;
  }

  destroy() {
    this.scene.events.off('update', this._tick);
    this.container.destroy();
  }

  _place() {
    const p = this.positions[this.index];
    this.cursor.setPosition(p.x - 8, p.y + 2);
    if (this.onChange) this.onChange(this.index);
  }

  _tick() {
    if (!this.active) return;
    const c = this.controls;
    const d = c.justDir();
    if (d) {
      const n = this.items.length;
      const rows = Math.ceil(n / this.cols);
      let col = this.index % this.cols;
      let row = Math.floor(this.index / this.cols);
      if (d === 'left') col = (col - 1 + this.cols) % this.cols;
      if (d === 'right') col = (col + 1) % this.cols;
      if (d === 'up') row = (row - 1 + rows) % rows;
      if (d === 'down') row = (row + 1) % rows;
      const next = Math.min(n - 1, row * this.cols + col);
      if (next !== this.index) {
        this.index = next;
        audio.sfx('cursor');
        this._place();
      }
    }
    if (c.confirm()) {
      if (this.items[this.index].disabled) {
        audio.sfx('bump');
        return;
      }
      audio.sfx('confirm');
      this.active = false;
      this.resolve(this.index);
    } else if (this.cancellable && c.cancel()) {
      audio.sfx('cancel');
      this.active = false;
      this.resolve(-1);
    }
  }
}
