import { audio } from '../audio/audio.js';

const KEYMAP = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  z: 'confirm', Z: 'confirm', Enter: ['confirm', 'start'], ' ': 'confirm',
  x: 'cancel', X: 'cancel', Escape: 'cancel', Backspace: 'cancel',
};
const actionsOf = (key) => [].concat(KEYMAP[key] || []);
const DIRS = ['up', 'down', 'left', 'right'];

// Controles estilo GBA: Z/Espacio = A, X/Esc/Retroceso = B, Enter = START (y A), M = silenciar.
// Las pulsaciones se toman de eventos nativos (no se pierden toques rápidos) y se
// descartan al final de cada frame, para que nada se "acumule" durante animaciones.
export function createControls(scene) {
  const kb = scene.input.keyboard;
  kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,BACKSPACE');
  const held = new Set();
  const stack = [];
  const pressed = new Set();
  let suspended = false;

  const onDown = (e) => {
    if (suspended) return;
    if (e.key === 'm' || e.key === 'M') {
      if (!e.repeat) audio.toggleMute();
      return;
    }
    const actions = actionsOf(e.key);
    if (!actions.length) return;
    held.add(e.key);
    for (const action of actions) {
      if (!e.repeat) pressed.add(action);
      if (DIRS.includes(action) && !stack.includes(action)) stack.push(action);
    }
  };
  const onUp = (e) => {
    held.delete(e.key);
    for (const action of actionsOf(e.key)) {
      const stillHeld = [...held].some((k) => actionsOf(k).includes(action));
      const i = stack.indexOf(action);
      if (i >= 0 && !stillHeld) stack.splice(i, 1);
    }
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
    start: () => take('start'),
    confirmHeld: () => [...held].some((k) => actionsOf(k).includes('confirm')),
    justDir: () => DIRS.find((d) => take(d)) || null,
    // Durante la escritura libre el teclado pertenece al campo de texto.
    suspend: () => { suspended = true; blur(); },
    resume: () => { suspended = false; blur(); },
  };
}
