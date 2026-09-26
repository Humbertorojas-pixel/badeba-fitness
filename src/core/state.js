import { createCombatant } from './battle.js';

export const PLAYER_BASE = { name: 'Errante', maxHp: 40, str: 10, def: 6, spd: 8, moves: ['tajo', 'embestida', 'guardia'] };

export function newRun(seed = Date.now() >>> 0) {
  return {
    seed,
    floor: 1,
    player: createCombatant(PLAYER_BASE),
    inventory: { tonico: 3 },
    defeated: [],
    introShown: false,
  };
}

export function getRun(scene) {
  return scene.registry.get('run');
}

export function setRun(scene, run) {
  scene.registry.set('run', run);
  return run;
}
