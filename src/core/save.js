import { newPity } from './loot.js';

export const SAVE_VERSION = 1;
export const BACKUP_SLOTS = 3;

export function newProfile() {
  return { pity: newPity(), runs: 0, deaths: 0, deepest: 0 };
}

// FNV-1a de 32 bits: suficiente para detectar corrupción accidental del guardado.
export function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Sets y arreglos tipados no sobreviven a JSON: se marcan y se restauran al leer.
function replacer(_key, value) {
  if (value instanceof Set) return { __set: [...value] };
  if (value instanceof Uint8Array) return { __u8: Array.from(value) };
  return value;
}

function reviver(_key, value) {
  if (value && typeof value === 'object') {
    if (Array.isArray(value.__set)) return new Set(value.__set);
    if (Array.isArray(value.__u8)) return Uint8Array.from(value.__u8);
  }
  return value;
}

export function packRecord(kind, payload) {
  const data = JSON.stringify(payload, replacer);
  return { version: SAVE_VERSION, kind, savedAt: Date.now(), checksum: checksum(data), data };
}

export function unpackRecord(record) {
  if (!record || typeof record.data !== 'string') throw new Error('registro vacío');
  if (checksum(record.data) !== record.checksum) throw new Error('checksum inválido');
  return JSON.parse(record.data, reviver);
}

// Validación semántica: un guardado puede tener checksum correcto y aun así ser imposible.
export function validateRun(run) {
  const problems = [];
  const p = run?.player;
  if (!p || !Number.isFinite(p.hp) || p.hp <= 0) problems.push('PS del jugador inválidos');
  if (!Number.isInteger(run?.floor) || run.floor < 1) problems.push('número de piso inválido');
  const f = run?.floorData;
  if (f) {
    const sizeOk = Number.isInteger(f.w) && Number.isInteger(f.h) && f.w >= 10 && f.h >= 10 && f.w <= 200 && f.h <= 200;
    if (!sizeOk || !(f.walls instanceof Uint8Array) || f.walls.length !== f.w * f.h) problems.push('mapa corrupto');
    else {
      const inside = (q) => q && q.x >= 0 && q.y >= 0 && q.x < f.w && q.y < f.h;
      const open = (q) => inside(q) && f.walls[q.y * f.w + q.x] === 0;
      if (!open(f.start) || !open(f.stairs)) problems.push('inicio o escalera fuera del mapa');
      if (run.pos && !open(run.pos)) problems.push('posición del jugador fuera de los límites');
      if (!Array.isArray(f.enemies) || f.enemies.some((e) => !inside(e))) problems.push('enemigos fuera del mapa');
    }
  }
  return problems;
}

// Almacén con respaldos rotativos. `backend` implementa get/putMany/deleteMany (atómicos).
export class SaveStore {
  constructor(backend) {
    this.backend = backend;
  }

  async loadProfile() {
    try {
      return { ...newProfile(), ...unpackRecord(await this.backend.get('profile')) };
    } catch {
      return newProfile();
    }
  }

  async saveProfile(profile) {
    await this.backend.putMany([['profile', packRecord('profile', profile)]]);
  }

  // Guarda la partida y el perfil; la partida anterior pasa al anillo de respaldos, todo en una transacción.
  async saveRun(run, profile, kind = 'auto') {
    const problems = validateRun(run);
    if (problems.length) throw new Error(`Estado inválido, no se guarda: ${problems.join(', ')}`);
    const meta = (await this.backend.get('meta')) || { next: 0 };
    const previous = await this.backend.get('run');
    const entries = [['run', packRecord(kind, run)], ['profile', packRecord('profile', profile)]];
    if (previous) {
      entries.push([`backup_${meta.next % BACKUP_SLOTS}`, previous]);
      entries.push(['meta', { next: meta.next + 1 }]);
    }
    await this.backend.putMany(entries);
  }

  // Carga la partida; si está dañada, prueba los respaldos del más reciente al más antiguo.
  async loadRun() {
    const meta = (await this.backend.get('meta')) || { next: 0 };
    const candidates = ['run'];
    for (let i = 1; i <= BACKUP_SLOTS; i++) candidates.push(`backup_${(meta.next - i + BACKUP_SLOTS * 100) % BACKUP_SLOTS}`);
    let recovered = false;
    for (const key of candidates) {
      const record = await this.backend.get(key);
      if (!record) continue;
      try {
        const run = unpackRecord(record);
        if (validateRun(run).length) throw new Error('inválido');
        if (recovered) await this.backend.putMany([['run', record]]);
        return { run, recovered, kind: record.kind, savedAt: record.savedAt };
      } catch {
        recovered = true;
      }
    }
    return null;
  }

  async hasRun() {
    return !!(await this.loadRun());
  }

  // Permamuerte: la partida y sus respaldos desaparecen; el perfil permanece.
  async deleteRun() {
    const keys = ['run', 'meta'];
    for (let i = 0; i < BACKUP_SLOTS; i++) keys.push(`backup_${i}`);
    await this.backend.deleteMany(keys);
  }
}

export function memoryBackend() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.get(key) ?? null; },
    async putMany(entries) { for (const [k, v] of entries) map.set(k, structuredClone(v)); },
    async deleteMany(keys) { for (const k of keys) map.delete(k); },
  };
}

// IndexedDB: una sola transacción por operación → escrituras atómicas (sin guardados a medias).
export function indexedDbBackend(name = 'nexo', storeName = 'saves') {
  const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(storeName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = async (mode, fn) => {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      let result;
      fn(store, (r) => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  return {
    get: (key) => tx('readonly', (s, done) => { const r = s.get(key); r.onsuccess = () => done(r.result ?? null); }),
    putMany: (entries) => tx('readwrite', (s) => { for (const [k, v] of entries) s.put(v, k); }),
    deleteMany: (keys) => tx('readwrite', (s) => { for (const k of keys) s.delete(k); }),
  };
}
