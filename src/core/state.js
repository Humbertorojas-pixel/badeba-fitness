import { newPlayer } from './character.js';
import { newPity } from './loot.js';

export function newRun(seed = Date.now() >>> 0) {
  return {
    seed,
    floor: 1,
    player: newPlayer(),
    bag: { consumables: { tonico: 3, pocion: 0, incienso: 0 }, gear: [] },
    pity: newPity(),
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
