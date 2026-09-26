// Diálogo local sin red: respuestas por palabras clave, con la voz de cada rol.
// Garantiza que hablar con NPCs funcione aunque no haya servidor, API key o presupuesto.
const VOICE = {
  peregrina: {
    greet: ['Otro que baja... Que la luz te dure más que a mí.', 'No te acerques con prisa. Aquí la prisa mata.'],
    idle: ['No sé qué buscas, pero dudo que esté arriba.', 'Hace días que rezo y el eco me responde con otra voz.'],
  },
  mercenario: {
    greet: ['Mira quién sigue vivo. ¿Qué me ofreces?', 'Camina con cuidado, peregrino. Y con la bolsa cerrada.'],
    idle: ['Todo tiene precio aquí abajo. Hasta el silencio.', 'He visto morir a mejores que tú por menos.'],
  },
  loco: {
    greet: ['¡Tú! Tú ya estuviste aquí mañana.', 'Shh... las paredes están escuchando. Siempre escuchan.'],
    idle: ['El pozo tiene hambre y nosotros somos las migajas.', 'Conté las piedras. Faltan dos. Siempre faltan dos.'],
  },
  monja: {
    greet: ['Siento tu calor, viajero. Aún no te ha tocado el frío.', 'Bienvenido a otra de las mil realidades.'],
    idle: ['El eclipse no terminó. Solo aprendimos a vivir bajo él.', 'No mires demasiado tiempo las salas que no pertenecen.'],
  },
  nino: {
    greet: ['¡Hola! ¿Jugamos a contar escaleras?', 'Llevas treinta pasos desde la antorcha. Los conté.'],
    idle: ['¿Por qué los mayores siempre bajan y nunca suben?', 'Mi amigo se quedó en el primer piso. Dice que está bien.'],
  },
};

// Del tema más específico al más genérico: gana la primera coincidencia.
const TOPICS = [
  { re: /escaler|salida|bajar|descen|camino/, reply: (c) => `La escalera... dicen que está ${c.escalera}. Pero no te fíes de nadie aquí.` },
  { re: /peligro|monstru|enemig|criatura|bestia/, reply: (c) => (c.criaturas ? `Aún rondan ${c.criaturas} criaturas en este piso. Las oigo respirar.` : 'Este piso está en silencio. Demasiado silencio.') },
  { re: /fragment|realidad|extrañ|rara/, reply: (c) => (c.fragmento ? 'Hay una sala que no pertenece aquí. La piedra late. No duermas en ella.' : 'Aquí no siento otras realidades... por ahora.') },
  { re: /maná|mana|sincron/, reply: () => 'El maná no es para conjurar. Es lo que te deja entender a las armas que valen la pena.' },
  { re: /legend|mito|arma|tesoro|rey/, reply: () => 'Hablan de hojas del Rey Sin Trono, de la Última Vigilia... Quien las lleva nunca duerme tranquilo.' },
  { re: /quién|quien|nombre|eres/, reply: (c, n) => `Me llaman ${n.name}. Lo demás lo olvidé en algún piso.` },
  { re: /adiós|adios|gracias|luego/, reply: () => 'Que el pozo te olvide, viajero. Es lo mejor que puede pasarte.' },
  { re: /piso|lugar|dónde|donde|aquí|aqui/, reply: (c) => `Esto es ${c.bioma.toLowerCase()}, el piso ${c.piso}. Mañana tendrá otra forma, o no existirá.` },
];

export function fallbackGreeting(npc, rng) {
  return rng.pick(VOICE[npc.roleKey].greet);
}

export function fallbackReply(npc, message, context, rng) {
  const text = message.toLowerCase();
  const topic = TOPICS.find((t) => t.re.test(text));
  return topic ? topic.reply(context, npc) : rng.pick(VOICE[npc.roleKey].idle);
}

export const BLOCKED_REPLY = {
  fuera_de_tema: 'Esas palabras no significan nada aquí abajo.',
  rompe_personaje: '¿Qué dices? Hablas como los que pierden la cabeza en el cuarto piso.',
  abusivo: 'Guarda tu veneno para las criaturas.',
};
