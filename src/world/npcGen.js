import { createRng } from '../core/rng.js';

// Fichas de personaje: todo lo que se inyecta en el prompt de Claude sale de aquí (data-driven).
export const NPC_ROLES = {
  peregrina: {
    title: 'peregrina', palette: 'peregrina', canTurnHostile: false,
    names: ['Mara', 'Iselda', 'Casilda', 'Brunhilda', 'Olvida'],
    personality: ['cansada y amable, habla despacio, como quien ya no espera nada', 'devota de un dios que no responde; reza en voz baja entre frases'],
    secret: ['bajó buscando a su hermano y ya olvidó su rostro', 'lleva un mapa de un piso que ya no existe'],
    disposition: ['amable', 'recelosa'],
  },
  mercenario: {
    title: 'mercenario', palette: 'mercenario', canTurnHostile: true,
    names: ['Anselmo', 'Rorik', 'Teodric', 'Gunther', 'Varo'],
    personality: ['pragmático y codicioso, todo tiene precio para él', 'veterano burlón que se ríe del miedo ajeno'],
    secret: ['mató a su compañía por un arma que resultó falsa', 'debe su vida a una sombra y le paga con viajeros'],
    disposition: ['desconfiado', 'hostil contenido'],
  },
  loco: {
    title: 'ermitaño delirante', palette: 'loco', canTurnHostile: true,
    names: ['Zacarías', 'Ulrico', 'Benigno', 'Ezequiel'],
    personality: ['habla en acertijos y ríe a destiempo', 'cree que la mazmorra está viva y le habla por las noches'],
    secret: ['a veces recuerda cosas que aún no han pasado', 'se comió a su sombra para no estar solo'],
    disposition: ['errático', 'indiferente'],
  },
  monja: {
    title: 'monja ciega', palette: 'monja', canTurnHostile: false,
    names: ['Sor Ágata', 'Sor Leocadia', 'Sor Inés'],
    personality: ['serena y profética; siente los fragmentos de otras realidades como frío en la piel', 'habla del eclipse que no terminó como de un recuerdo propio'],
    secret: ['no es ciega: se arrancó los ojos para no ver lo que viene', 'lleva siglos en el mismo piso, aunque el piso cambie'],
    disposition: ['serena', 'compasiva'],
  },
  nino: {
    title: 'niño que no envejece', palette: 'nino', canTurnHostile: false,
    names: ['Tobías', 'Nilo', 'Pim'],
    personality: ['juguetón e inquietante; conoce los pasillos como un juego', 'responde con preguntas y cuenta los pasos del viajero en voz alta'],
    secret: ['murió en el primer piso hace mucho y no lo sabe', 'es el eco de otro viajero que no llegó al fondo'],
    disposition: ['curioso', 'amable'],
  },
};

// Aldeanos: gente que sobrevive en los asentamientos de cada región. Nunca se vuelven hostiles.
export const VILLAGER_ROLES = {
  herrera: {
    title: 'herrera de la aldea', palette: 'mercenario', names: ['Brunhild', 'Ottilia', 'Greta'],
    personality: ['ruda y directa, huele a hollín; respeta a quien carga buen acero', 'callada, mide a los viajeros por sus manos'],
    secret: ['forja cadenas para algo que vive bajo la aldea', 'su martillo perteneció a un caballero del eclipse'],
  },
  anciano: {
    title: 'anciano de la aldea', palette: 'peregrina', names: ['Abuelo Tadeo', 'Viejo Ramiro', 'Anciana Petra'],
    personality: ['sabio y cansado; cuenta historias de pisos que ya no existen', 'desconfía de los que bajan: "nadie baja por buenas razones"'],
    secret: ['recuerda haber nacido en un piso más profundo', 'sabe que la aldea se muda sola cuando nadie mira'],
  },
  vigia: {
    title: 'vigía de la aldea', palette: 'mercenario', names: ['Hugo', 'Leandra', 'Cástor'],
    personality: ['nervioso, siempre mirando hacia la oscuridad del bosque', 'orgulloso de sus guardias; habla de cada criatura que ha visto'],
    secret: ['dejó entrar a algo una noche y no se lo ha dicho a nadie', 'ya no duerme: teme que la hoguera se apague'],
  },
  posadera: {
    title: 'posadera', palette: 'nino', names: ['Marta', 'Remedios', 'Clotilde'],
    personality: ['cálida y habladora; conoce todos los rumores del piso', 'práctica y maternal, regaña a los viajeros heridos'],
    secret: ['sirve sopa a huéspedes que nadie más ve', 'guarda la llave de una puerta que no lleva a ningún lugar'],
  },
};

export function generateVillager(seed, depth, village) {
  const rng = createRng(seed);
  const roleKey = rng.pick(Object.keys(VILLAGER_ROLES));
  const r = VILLAGER_ROLES[roleKey];
  return {
    role: r.title,
    roleKey,
    palette: r.palette,
    canTurnHostile: false,
    name: rng.pick(r.names),
    personality: rng.pick(r.personality),
    secret: rng.pick(r.secret),
    disposition: rng.pick(['amable', 'recelosa', 'cansada']),
    knowledge: `vive en ${village}; conoce los caminos cercanos, el bosque y las criaturas de este piso`,
    home: village,
    level: depth,
  };
}

export function generateNpc(seed, depth) {
  const rng = createRng(seed);
  const roleKey = rng.pick(Object.keys(NPC_ROLES));
  const r = NPC_ROLES[roleKey];
  return {
    role: r.title,
    roleKey,
    palette: r.palette,
    canTurnHostile: r.canTurnHostile,
    name: rng.pick(r.names),
    personality: rng.pick(r.personality),
    secret: rng.pick(r.secret),
    disposition: rng.pick(r.disposition),
    knowledge: depth <= 2 ? 'rumores de los primeros pisos' : 'historias de pisos profundos y de quienes no volvieron',
    level: depth,
  };
}
