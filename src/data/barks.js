// Banco de "barks": líneas escritas a mano, siempre disponibles (respaldo de la IA generativa).
export const BARKS = {
  intro: {
    beast: ['Huele tu sangre antes de verte.', 'Un gruñido húmedo llena la sala.', 'Sus costillas se abren y se cierran como fauces.'],
    humanoid: ['«Otro peregrino. Otra ofrenda.»', '«Arrodíllate. Duele menos.»', '«Yo también bajé las escaleras una vez.»'],
    wraith: ['Un susurro repite tu nombre al revés.', '«Tu maná sabe a miedo.»', 'La luz de las antorchas se inclina hacia ella.'],
    crawler: ['Patas. Demasiadas patas.', 'Chasquidos bajo la piedra, cada vez más cerca.', 'Algo cruje entre sus mandíbulas.'],
    eldritch: ['Tu mente se niega a contar sus ojos.', 'Un canto sin voz vibra dentro de tus dientes.', 'La geometría del aire se equivoca a su alrededor.'],
    ito: ['Te mira. No parpadea. No tiene con qué.', 'Algo en su forma se enrosca, y tus pensamientos se enroscan con él.', '«Tú también podrías ser tan hermoso.»'],
    cute: ['«¡Pip!»', 'Ladea la cabecita, curioso.', 'Da saltitos a tu alrededor, sin saber si jugar o huir.'],
    undead: ['Huesos que recuerdan cómo odiar.', '«La muerte fue solo una pausa.»', 'Huele a tumba abierta y a vino viejo.'],
  },
  greed: ['Sus ojos no te miran a ti: miran lo que llevas.', '«Eso que cargas no te pertenece. Nada aquí te pertenece.»', 'La codicia le deforma el rostro.'],
  refuse: ['«Las palabras no sacian el hambre.»', 'Ladea la cabeza, como si tu voz fuera ruido.', '«Habla cuanto quieras. Muere igual.»'],
  spared: ['Retrocede hacia la penumbra y te deja pasar.', '«Vete. Hoy no.» Se funde con las sombras.', 'Baja el arma. En sus ojos hay algo parecido al cansancio.'],
};

export function pickBark(rng, list) {
  return list[Math.floor(rng.next() * list.length)];
}
