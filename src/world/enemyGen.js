import { createRng } from '../core/rng.js';

const ARCH = {
  beast: {
    nouns: [['Carroñero', 'm'], ['Mastín', 'm'], ['Devorador', 'm'], ['Bestia', 'f'], ['Hiena', 'f']],
    base: { maxHp: 24, str: 8, def: 4, spd: 7 }, moves: ['garra', 'mordida'],
  },
  humanoid: {
    nouns: [['Penitente', 'm'], ['Verdugo', 'm'], ['Ahorcado', 'm'], ['Flagelante', 'm'], ['Monja', 'f']],
    base: { maxHp: 32, str: 10, def: 7, spd: 4 }, moves: ['azote', 'garra'],
  },
  wraith: {
    nouns: [['Sombra', 'f'], ['Lamento', 'm'], ['Espectro', 'm'], ['Plañidera', 'f'], ['Eco', 'm']],
    base: { maxHp: 24, str: 9, def: 4, spd: 10 }, moves: ['lamento', 'garra', 'succion'],
  },
  crawler: {
    nouns: [['Reptante', 'm'], ['Tejedor', 'm'], ['Roedor', 'm'], ['Larva', 'f'], ['Araña', 'f']],
    base: { maxHp: 18, str: 7, def: 3, spd: 9 }, moves: ['picadura', 'mordida'],
  },
};

// Epíteto por paleta [masculino, femenino] + ajuste de stats.
const RAMP_TRAITS = {
  flesh: { adj: ['sangrante', 'sangrante'], mod: { str: 2 } },
  rot: { adj: ['podrido', 'podrida'], mod: { maxHp: 4, spd: -1 } },
  bone: { adj: ['óseo', 'ósea'], mod: { def: 2 } },
  void: { adj: ['hueco', 'hueca'], mod: { spd: 2, def: -1 } },
  rust: { adj: ['oxidado', 'oxidada'], mod: { str: 1, def: 1 } },
  steel: { adj: ['acorazado', 'acorazada'], mod: { def: 3, spd: -2 } },
};

function weightedPick(rng, weights) {
  const entries = Object.entries(weights);
  let r = rng.next() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

export function generateEnemyTemplate({ seed, depth, biome, foreign = false }) {
  const rng = createRng(seed);
  const archetype = weightedPick(rng, biome.archetypes);
  const ramp = rng.pick(biome.ramps);
  const def = ARCH[archetype];
  const [noun, gender] = rng.pick(def.nouns);
  const trait = RAMP_TRAITS[ramp];
  const adj = trait.adj[gender === 'f' ? 1 : 0];
  const scale = 1 + 0.15 * (depth - 1) + (foreign ? 0.35 : 0);
  const stat = (k) => Math.max(1, Math.round((def.base[k] + (trait.mod[k] || 0)) * scale));
  return {
    name: foreign ? `${noun} ${gender === 'f' ? 'ajena' : 'ajeno'}` : `${noun} ${adj}`,
    article: gender === 'f' ? 'Una' : 'Un',
    archetype,
    ramp,
    seed,
    level: depth,
    maxHp: stat('maxHp'),
    str: stat('str'),
    def: stat('def'),
    spd: stat('spd'),
    moves: def.moves.slice(),
  };
}
