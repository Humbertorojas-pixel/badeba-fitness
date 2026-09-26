import { describe, it, expect } from 'vitest';
import { SaveStore, memoryBackend, packRecord, unpackRecord, validateRun, newProfile } from '../src/core/save.js';
import { newRun } from '../src/core/state.js';
import { generateFloor } from '../src/world/generate.js';

const runOnFloor = (depth = 1) => {
  const run = newRun(4242);
  run.floor = depth;
  run.floorData = generateFloor({ runSeed: run.seed, depth });
  run.pos = { ...run.floorData.start };
  return run;
};

describe('guardado', () => {
  it('serializa y restaura Sets y arreglos tipados del piso', () => {
    const run = runOnFloor(3);
    const back = unpackRecord(packRecord('manual', run));
    expect(back.floorData.walls).toBeInstanceOf(Uint8Array);
    expect(back.floorData.blockers).toBeInstanceOf(Set);
    expect(Array.from(back.floorData.walls)).toEqual(Array.from(run.floorData.walls));
    expect(validateRun(back)).toEqual([]);
  });

  it('detecta corrupción por checksum', () => {
    const rec = packRecord('auto', runOnFloor());
    rec.data = rec.data.replace('"hp":', '"hp":9');
    expect(() => unpackRecord(rec)).toThrow(/checksum/);
  });

  it('la validación semántica detecta coordenadas fuera del mapa', () => {
    const run = runOnFloor();
    run.pos = { x: 999, y: 3 };
    expect(validateRun(run).join()).toMatch(/fuera de los límites/);
  });

  it('restaura automáticamente el respaldo si la partida está dañada', async () => {
    const backend = memoryBackend();
    const store = new SaveStore(backend);
    const profile = newProfile();
    const run = runOnFloor(1);
    await store.saveRun(run, profile, 'auto');
    run.floor = 2;
    await store.saveRun(run, profile, 'manual');
    const bad = backend.map.get('run');
    backend.map.set('run', { ...bad, data: bad.data.slice(0, -5) });
    const loaded = await store.loadRun();
    expect(loaded.recovered).toBe(true);
    expect(loaded.run.floor).toBe(1);
    expect((await store.loadRun()).recovered).toBe(false);
  });

  it('mantiene como máximo 3 respaldos rotativos', async () => {
    const backend = memoryBackend();
    const store = new SaveStore(backend);
    const run = runOnFloor();
    for (let i = 0; i < 6; i++) { run.floor = i + 1; await store.saveRun(run, newProfile()); }
    const backups = [...backend.map.keys()].filter((k) => k.startsWith('backup_'));
    expect(backups.length).toBe(3);
  });

  it('no guarda un estado inválido', async () => {
    const store = new SaveStore(memoryBackend());
    const run = runOnFloor();
    run.player.hp = 0;
    await expect(store.saveRun(run, newProfile())).rejects.toThrow(/inválido/);
  });

  it('la muerte borra la partida pero conserva el perfil', async () => {
    const store = new SaveStore(memoryBackend());
    const profile = newProfile();
    profile.pity.legendario = 321;
    await store.saveRun(runOnFloor(), profile);
    await store.saveRun(runOnFloor(), profile);
    await store.deleteRun();
    expect(await store.loadRun()).toBeNull();
    expect((await store.loadProfile()).pity.legendario).toBe(321);
  });
});
