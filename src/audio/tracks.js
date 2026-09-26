// Música en notación por pasos (semicorcheas): nota ("A2", "Bb3", "C#4"), "-" sostiene, "." silencio.
// Canal de ruido: k (bombo), s (caja), h (charles). Tonalidades menores y frigias: tono opresivo.
const bars = (...b) => b.join(' ');

export const TRACKS = {
  titulo: {
    bpm: 60,
    channels: [
      { wave: 'triangle', vol: 0.55, notes: bars('A2 - - - - - - - - - - - - - - -', 'A2 - - - - - - - - - - - - - - -', 'F2 - - - - - - - - - - - - - - -', 'E2 - - - - - - - - - - - - . . .') },
      { wave: 'sine', vol: 0.22, notes: bars('A4 . C5 . E5 . . . . . . . . . . .', 'G#4 . B4 . E5 . . . . . . . . . . .', 'F4 . A4 . C5 . . . . . . . . . . .', 'E4 . G#4 . B4 . . . D5 - - - . . . .') },
    ],
  },
  catacumbas: {
    bpm: 66,
    channels: [
      { wave: 'triangle', vol: 0.5, notes: bars('A2 - - - - - - - - - - - - - - -', 'A2 - - - - - - - - - - - G2 - - -', 'F2 - - - - - - - - - - - - - - -', 'E2 - - - - - - - - - - - . . . .') },
      { wave: 'pulse12', vol: 0.13, echo: { delay: 3, vol: 0.4, transpose: 12 }, notes: bars('E4 - - - . . . . C4 - - - . . . .', 'D4 - - - - - - - . . B3 - - - . .', 'C4 - - - . . A3 - - - - - . . . .', 'G#3 - - - - - - - - - - - . . . .') },
      { wave: 'noise', vol: 0.05, notes: bars('h . . . . . . . . . . . . . . .', '. . . . . . . . . . h . . . . .', '. . . . . . h . . . . . . . . .', '. . . . . . . . . . . . . . h .') },
    ],
  },
  combate: {
    bpm: 150,
    channels: [
      { wave: 'triangle', vol: 0.55, notes: bars('A2 . A2 . A3 . A2 . A2 . A2 . G3 . A2 .', 'F2 . F2 . F3 . F2 . F2 . F2 . E3 . F2 .', 'G2 . G2 . G3 . G2 . G2 . G2 . F3 . G2 .', 'E2 . E2 . E3 . E2 . G#2 . G#2 . B2 . E3 .') },
      { wave: 'pulse25', vol: 0.16, notes: bars('A4 - - - C5 - - - E5 - D5 - C5 - B4 -', 'C5 - - - - - A4 - F4 - - - A4 - C5 -', 'B4 - - - D5 - - - G5 - F5 - E5 - D5 -', 'E5 - - - - - - - G#4 - B4 - D5 - E5 -') },
      { wave: 'pulse12', vol: 0.07, notes: bars('C4 - - - - - - - E4 - - - - - - -', 'A3 - - - - - - - C4 - - - - - - -', 'B3 - - - - - - - D4 - - - - - - -', 'G#3 - - - - - - - B3 - - - - - - -') },
      { wave: 'noise', vol: 0.12, notes: bars('k . h . s . h . k . k . s . h .', 'k . h . s . h . k . k . s . h .', 'k . h . s . h . k . k . s . h .', 'k . h . s . h . k . s . s . s s') },
    ],
  },
  victoria: {
    bpm: 132,
    loop: false,
    channels: [
      { wave: 'pulse25', vol: 0.18, notes: 'A4 - C5 - E5 - A5 - - - - - G5 - A5 - - - - - - - - - . . . .' },
      { wave: 'triangle', vol: 0.5, notes: 'A2 - - - - - - - - - - - E2 - A2 - - - - - - - - - . . . .' },
    ],
  },
  derrota: {
    bpm: 70,
    loop: false,
    channels: [
      { wave: 'pulse12', vol: 0.16, notes: 'E4 - - - D4 - - - C4 - - - B3 - - - - - - - . . . .' },
      { wave: 'triangle', vol: 0.5, notes: 'A2 - - - - - - - - - - - G#2 - - - - - - - . . . .' },
    ],
  },
};
