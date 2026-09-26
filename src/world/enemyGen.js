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

// Rango del enemigo (misma escala de rareza que el equipo). Multiplica stats, experiencia y botín.
export const RANKS = {
  comun: { hp: 1, str: 1, def: 1, spd: 1, xp: 1 },
  raro: { hp: 1.35, str: 1.15, def: 1.1, spd: 1.05, xp: 1.7 },
  legendario: { hp: 1.9, str: 1.35, def: 1.3, spd: 1.1, xp: 3.2 },
  unico: { hp: 2.6, str: 1.5, def: 1.4, spd: 1.2, xp: 5 },
};
export const RANK_ORDER = ['comun', 'raro', 'legendario', 'unico'];

// Movimiento de firma de los enemigos legendarios y únicos.
const SIGNATURE = { beast: 'desgarro', humanoid: 'ejecucion', wraith: 'alarido', crawler: 'enjambre' };

// Nombres propios: los legendarios se ganan uno, los únicos son criaturas de leyenda.
const PROPER = ['Vargoth', 'Ismera', 'Kalden', 'Oruth', 'Selvane', 'Druhm', 'Mireth', 'Galvor', 'Yssa', 'Torvek', 'Ashka', 'Brennoc'];
const UNIQUE_FOES = {
  beast: [['El Hambre Sin Boca', 'void', 'devorador'], ['La Jauría de Uno', 'flesh', 'mastin']],
  humanoid: [['El Verdugo Sin Rostro', 'steel', 'verdugo'], ['El Rey Mendigo', 'rust', 'penitente']],
  wraith: [['La Novia Ahogada', 'bone', 'planidera'], ['El Coro de los Mil', 'void', 'eco']],
  crawler: [['La Madre Larva', 'rot', 'larva'], ['El Tejedor de Carne', 'flesh', 'tejedor']],
};

// Forma visual a partir del sustantivo (el sprite coincide con el nombre).
export function formOf(noun) {
  return noun.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace('ñ', 'n');
}

export function rollEnemyRank(rng, depth, { allowUnique = true } = {}) {
  const r = rng.next();
  const unique = allowUnique && depth >= 2 ? 0.004 : 0;
  const legend = 0.02 + 0.003 * depth;
  const rare = 0.12 + 0.012 * depth;
  if (r < unique) return 'unico';
  if (r < unique + legend) return 'legendario';
  if (r < unique + legend + rare) return 'raro';
  return 'comun';
}

function weightedPick(rng, weights) {
  const entries = Object.entries(weights);
  let r = rng.next() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

// `rank` fuerza el rango (guardianes); si no, se tira con la semilla del enemigo (determinista).
export function generateEnemyTemplate({ seed, depth, biome, foreign = false, rank = null, allowUnique = true }) {
  const rng = createRng(seed);
  const archetype = weightedPick(rng, biome.archetypes);
  let ramp = rng.pick(biome.ramps);
  const def = ARCH[archetype];
  const [noun, gender] = rng.pick(def.nouns);
  const rolled = rollEnemyRank(rng.fork('rank'), depth, { allowUnique });
  const tier = rank || rolled;
  let name = foreign ? `${noun} ${gender === 'f' ? 'ajena' : 'ajeno'}` : `${noun} ${RAMP_TRAITS[ramp].adj[gender === 'f' ? 1 : 0]}`;
  let article = gender === 'f' ? 'Una' : 'Un';
  let title = null;
  let form = formOf(noun);
  if (tier === 'legendario') {
    title = name;
    name = rng.fork('name').pick(PROPER);
    article = '';
  } else if (tier === 'unico') {
    const [uname, uramp, uform] = rng.fork('name').pick(UNIQUE_FOES[archetype]);
    name = uname;
    ramp = uramp;
    form = uform;
    article = '';
  }
  const trait = RAMP_TRAITS[ramp];
  const mult = RANKS[tier];
  // Curva de dificultad: el primer piso es aprendizaje; cada piso suma un 14 %.
  const scale = 0.7 + 0.14 * (depth - 1) + (foreign ? 0.35 : 0);
  const key = { maxHp: 'hp', str: 'str', def: 'def', spd: 'spd' };
  const stat = (k) => Math.max(1, Math.round((def.base[k] + (trait.mod[k] || 0)) * scale * mult[key[k]]));
  const moves = def.moves.slice();
  if (tier === 'legendario' || tier === 'unico') moves.push(SIGNATURE[archetype]);
  return {
    name,
    title,
    article,
    rank: tier,
    form,
    archetype,
    ramp,
    seed,
    level: depth,
    maxHp: stat('maxHp'),
    str: stat('str'),
    def: stat('def'),
    spd: stat('spd'),
    moves,
  };
}
