// Plantillas base de enemigos. `seed` fija su aspecto procedural; `ramp` su paleta.
export const ENEMIES = {
  carronero: {
    name: 'Carroñero', article: 'Un', archetype: 'beast', ramp: 'rot', seed: 1101,
    maxHp: 22, str: 7, def: 4, spd: 6, moves: ['garra', 'mordida'],
  },
  sombra: {
    name: 'Sombra', article: 'Una', archetype: 'wraith', ramp: 'void', seed: 2203,
    maxHp: 26, str: 9, def: 4, spd: 10, moves: ['lamento', 'garra'],
  },
  penitente: {
    name: 'Penitente', article: 'Un', archetype: 'humanoid', ramp: 'flesh', seed: 3307,
    maxHp: 34, str: 10, def: 7, spd: 4, moves: ['azote', 'garra'],
  },
  reptante: {
    name: 'Reptante', article: 'Un', archetype: 'crawler', ramp: 'bone', seed: 4409,
    maxHp: 18, str: 6, def: 3, spd: 8, moves: ['picadura', 'mordida'],
  },
};
