// Clima de la región. Bajo la bóveda de roca también llueve (goteras que se vuelven diluvio),
// sube la niebla de los lagos, cae ceniza o sopla un viento cargado de brasas.
// Cada clima tiene efectos de juego pequeños pero legibles.
export const WEATHERS = {
  despejado: {
    name: 'Calma', start: 'El aire se aquieta.',
    sight: 3, reveal: 7, encounter: 1, acc: 0, flee: 0,
  },
  lluvia: {
    name: 'Lluvia', start: 'Empieza a gotear desde la bóveda de roca.',
    sight: 3, reveal: 6, encounter: 1.4, acc: 0, flee: 0, sound: 'lluvia',
    battle: 'La lluvia empapa el suelo. Las criaturas salen de sus madrigueras.',
  },
  tormenta: {
    name: 'Tormenta', start: 'Truena en lo alto del pozo. Diluvia.',
    sight: 3, reveal: 6, encounter: 1.5, acc: -0.1, flee: 0, sound: 'tormenta', lightning: true,
    battle: 'La tormenta ciega a ambos: la precisión baja.',
  },
  niebla: {
    name: 'Niebla', start: 'Una niebla espesa sube de la tierra.',
    sight: 1, reveal: 4, encounter: 1, acc: -0.08, flee: 0.2,
    battle: 'En la niebla cuesta acertar, pero es más fácil huir.',
  },
  ceniza: {
    name: 'Lluvia de ceniza', start: 'Cae ceniza, lenta como nieve sucia.',
    sight: 2, reveal: 5, encounter: 1, acc: -0.05, flee: 0.1, sound: 'viento',
    battle: 'La ceniza se mete en los ojos: la precisión baja un poco.',
  },
  brasas: {
    name: 'Viento de brasas', start: 'Un viento ardiente arrastra brasas por el páramo.',
    sight: 3, reveal: 6, encounter: 1.2, acc: -0.05, flee: 0, sound: 'brasas',
    battle: 'Las brasas queman el aire: la precisión baja un poco.',
  },
  esporas: {
    name: 'Nube de esporas', start: 'Una nube de esporas luminosas llena el aire.',
    sight: 2, reveal: 5, encounter: 1.3, acc: 0, flee: 0.1,
    battle: 'Las esporas atraen a las criaturas del bosque.',
  },
  polvo: {
    name: 'Tormenta de polvo', start: 'Un vendaval de polvo barre las ruinas.',
    sight: 2, reveal: 5, encounter: 1, acc: -0.1, flee: 0.15, sound: 'viento',
    battle: 'El polvo lo cubre todo: la precisión baja.',
  },
};

// Probabilidades relativas por bioma.
export const BIOME_WEATHER = {
  bosque: { despejado: 4, lluvia: 3, niebla: 2, esporas: 2, tormenta: 1 },
  necropolis: { despejado: 3, niebla: 4, lluvia: 2, ceniza: 1, tormenta: 1 },
  pantano: { despejado: 2, niebla: 4, lluvia: 3, tormenta: 2, esporas: 1 },
  ciudad: { despejado: 4, polvo: 3, lluvia: 2, tormenta: 1, niebla: 1 },
  ceniza: { despejado: 2, ceniza: 4, brasas: 3, polvo: 1 },
};

const MIN_STEPS = 70;
const MAX_STEPS = 170;

function weighted(rng, table, exclude) {
  const entries = Object.entries(table).filter(([k]) => k !== exclude);
  let r = rng.next() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

// El primer piso empieza en calma para aprender; luego el clima es el que toque.
export function initialWeather(rng, biome, depth) {
  const kind = depth === 1 ? 'despejado' : weighted(rng, BIOME_WEATHER[biome] || { despejado: 1 });
  return { kind, left: rng.int(MIN_STEPS, MAX_STEPS) };
}

// Avanza un paso. Devuelve el nuevo clima si cambió (nunca repite el mismo).
export function stepWeather(state, rng, biome) {
  state.left -= 1;
  if (state.left > 0) return null;
  const table = BIOME_WEATHER[biome] || { despejado: 1 };
  if (Object.keys(table).length < 2) {
    state.left = MAX_STEPS;
    return null;
  }
  state.kind = weighted(rng, table, state.kind);
  state.left = rng.int(MIN_STEPS, MAX_STEPS);
  return state.kind;
}

export function weatherOf(state) {
  return WEATHERS[state?.kind] || WEATHERS.despejado;
}
