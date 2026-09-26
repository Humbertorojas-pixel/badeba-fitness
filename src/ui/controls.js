import { audio } from '../audio/audio.js';

const KEYMAP = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  z: 'confirm', Z: 'confirm', Enter: 'confirm', ' ': 'confirm',
  x: 'cancel', X: 'cancel', Escape: 'cancel', Backspace: 'cancel',
};
const DIRS = ['up', 'down', 'left', 'right'];

// Controles estilo GBA: Z/Enter/Espacio = A, X/Esc/Retroceso = B, M = silenciar.
// Las pulsaciones se toman de eventos nativos (no se pierden toques rápidos) y se
// descartan al final de cada frame, para que nada se "acumule" durante animaciones.
export function createControls(scene) {
  const kb = scene.input.keyboard;
  kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,BACKSPACE');
  const held = new Set();
  const stack = [];
  const pressed = new Set();

  const onDown = (e) => {
    if (e.key === 'm' || e.key === 'M') {
      if (!e.repeat) audio.toggleMute();
      return;
    }
    const action = KEYMAP[e.key];
    if (!action) return;
    held.add(e.key);
    if (!e.repeat) pressed.add(action);
    if (DIRS.includes(action) && !stack.includes(action)) stack.push(action);
  };
  const onUp = (e) => {
    const action = KEYMAP[e.key];
    if (!action) return;
    held.delete(e.key);
    const stillHeld = [...held].some((k) => KEYMAP[k] === action);
    const i = stack.indexOf(action);
    if (i >= 0 && !stillHeld) stack.splice(i, 1);
  };
  const clearFrame = () => pressed.clear();
  const blur = () => {
    held.clear();
    stack.length = 0;
    pressed.clear();
  };

  kb.on('keydown', onDown);
  kb.on('keyup', onUp);
  scene.events.on('postupdate', clearFrame);
  window.addEventListener('blur', blur);
  scene.events.once('shutdown', () => {
    kb.off('keydown', onDown);
    kb.off('keyup', onUp);
    scene.events.off('postupdate', clearFrame);
    window.removeEventListener('blur', blur);
  });

  const take = (action) => {
    if (!pressed.has(action)) return false;
    pressed.delete(action);
    return true;
  };

  return {
    dir: () => stack[stack.length - 1] || null,
    confirm: () => take('confirm'),
    cancel: () => take('cancel'),
    confirmHeld: () => [...held].some((k) => KEYMAP[k] === 'confirm'),
    justDir: () => DIRS.find((d) => take(d)) || null,
  };
}
