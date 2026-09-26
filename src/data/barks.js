// Banco de "barks": líneas escritas a mano, siempre disponibles (respaldo de la IA generativa).
export const BARKS = {
  intro: {
    beast: ['Huele tu sangre antes de verte.', 'Un gruñido húmedo llena la sala.', 'Sus costillas se abren y se cierran como fauces.'],
    humanoid: ['«Otro peregrino. Otra ofrenda.»', '«Arrodíllate. Duele menos.»', '«Yo también bajé las escaleras una vez.»'],
    wraith: ['Un susurro repite tu nombre al revés.', '«Tu maná sabe a miedo.»', 'La luz de las antorchas se inclina hacia ella.'],
    crawler: ['Patas. Demasiadas patas.', 'Chasquidos bajo la piedra, cada vez más cerca.', 'Algo cruje entre sus mandíbulas.'],
  },
  greed: ['Sus ojos no te miran a ti: miran lo que llevas.', '«Eso que cargas no te pertenece. Nada aquí te pertenece.»', 'La codicia le deforma el rostro.'],
  refuse: ['«Las palabras no sacian el hambre.»', 'Ladea la cabeza, como si tu voz fuera ruido.', '«Habla cuanto quieras. Muere igual.»'],
  spared: ['Retrocede hacia la penumbra y te deja pasar.', '«Vete. Hoy no.» Se funde con las sombras.', 'Baja el arma. En sus ojos hay algo parecido al cansancio.'],
};

export function pickBark(rng, list) {
  return list[Math.floor(rng.next() * list.length)];
}
