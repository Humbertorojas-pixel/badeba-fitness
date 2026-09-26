import { SaveStore, indexedDbBackend, memoryBackend } from './save.js';

let store = null;
let persistent = true;

// Almacén único del juego. Si IndexedDB no está disponible (p. ej. modo privado), se usa memoria.
export function getStore() {
  if (store) return store;
  try {
    if (typeof indexedDB === 'undefined') throw new Error('sin IndexedDB');
    store = new SaveStore(indexedDbBackend());
  } catch {
    persistent = false;
    store = new SaveStore(memoryBackend());
  }
  return store;
}

export function isPersistent() {
  return persistent;
}

export function getProfile(scene) {
  return scene.registry.get('profile');
}
