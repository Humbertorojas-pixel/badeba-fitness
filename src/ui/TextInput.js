import { drawBox } from '../gfx/misc.js';
import { pixelText } from '../gfx/font.js';
import { GLYPHS, measure } from '../gfx/fontGlyphs.js';
import { DEPTH } from '../constants.js';
import { audio } from '../audio/audio.js';

let hiddenInput = null;

// Un <input> invisible con foco recibe el texto: así funcionan acentos con tecla muerta, ñ,
// métodos de entrada y pegar. Lo escrito se dibuja con la fuente pixel del juego.
function getHiddenInput() {
  if (!hiddenInput) {
    hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.autocomplete = 'off';
    hiddenInput.spellcheck = false;
    hiddenInput.setAttribute('aria-label', 'Texto del diálogo');
    Object.assign(hiddenInput.style, { position: 'fixed', left: '0', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(hiddenInput);
  }
  return hiddenInput;
}

const printable = (s) => [...s].filter((ch) => ch === ' ' || GLYPHS[ch]).join('');

export class TextInput {
  constructor(scene, controls, { x = 0, y = 112, w = 240, h = 48 } = {}) {
    this.scene = scene;
    this.controls = controls;
    this.maxWidth = w - 28;
    this.container = scene.add.container(0, 0).setDepth(DEPTH.ui + 2).setScrollFactor(0).setVisible(false);
    this.container.add(drawBox(scene.add.graphics(), x, y, w, h));
    this.label = pixelText(scene, x + 10, y + 9, '', 'blood');
    this.line = pixelText(scene, x + 10, y + 25, '', 'box');
    this.hint = pixelText(scene, 0, y + 9, '', 'faded');
    this.box = { x, w };
    this.container.add([this.label, this.line, this.hint]);
    this.active = false;
    this.onInput = this.onInput.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.tick = this.tick.bind(this);
    scene.events.on('update', this.tick);
    scene.events.once('shutdown', () => {
      scene.events.off('update', this.tick);
      if (this.active) this.finish(null, 'cancel');
    });
  }

  prompt(label, { maxLen = 140, idleMs = 90000 } = {}) {
    this.text = '';
    this.maxLen = maxLen;
    this.idleMs = idleMs;
    this.idle = 0;
    this.label.setText(label);
    // La ayuda se acorta si el nombre del interlocutor es largo, para no encimarse.
    const room = this.box.w - 30 - measure(label);
    const hint = ['Enter: decir  Esc: salir', 'Enter/Esc', ''].find((h) => measure(h) <= room);
    this.hint.setText(hint).setX(this.box.x + this.box.w - 10 - measure(hint));
    this.container.setVisible(true);
    this.controls.suspend();
    const kb = this.scene.input.keyboard;
    kb.enabled = false;
    kb.disableGlobalCapture();
    const el = getHiddenInput();
    el.value = '';
    el.maxLength = maxLen;
    el.addEventListener('input', this.onInput);
    el.addEventListener('keydown', this.onKeyDown);
    el.focus();
    this.active = true;
    this.render();
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  finish(value, reason = null) {
    this.active = false;
    this.container.setVisible(false);
    const el = getHiddenInput();
    el.removeEventListener('input', this.onInput);
    el.removeEventListener('keydown', this.onKeyDown);
    el.blur();
    const kb = this.scene.input.keyboard;
    kb.enabled = true;
    kb.enableGlobalCapture();
    this.controls.resume();
    this.resolve({ text: value, reason });
  }

  onInput() {
    const el = getHiddenInput();
    const clean = printable(el.value).slice(0, this.maxLen);
    if (clean !== el.value) el.value = clean;
    if (clean.length > this.text.length) audio.sfx('cursor');
    this.text = clean;
    this.idle = 0;
    this.render();
  }

  onKeyDown(e) {
    this.idle = 0;
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.text.trim()) {
        audio.sfx('confirm');
        this.finish(this.text.trim());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      audio.sfx('cancel');
      this.finish(null, 'cancel');
    }
  }

  render() {
    const caret = Math.floor(this.scene.time.now / 400) % 2 === 0 ? '_' : ' ';
    let shown = this.text;
    while (shown && measure(`..${shown}${caret}`) > this.maxWidth) shown = [...shown].slice(1).join('');
    this.line.setText(`${shown !== this.text ? '..' : ''}${shown}${caret}`);
  }

  tick(_t, delta) {
    if (!this.active) return;
    // Si el foco se pierde (clic fuera), se recupera para no dejar al jugador sin teclado.
    if (document.activeElement !== getHiddenInput()) getHiddenInput().focus();
    this.idle += delta;
    this.render();
    if (this.idle >= this.idleMs) this.finish(null, 'timeout');
  }
}
