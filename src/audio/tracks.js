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
  bosque: {
    bpm: 70,
    channels: [
      { wave: 'triangle', vol: 0.5, notes: bars('D2 - - - - - - - A2 - - - - - - -', 'Bb1 - - - - - - - F2 - - - - - - -', 'G1 - - - - - - - D2 - - - - - - -', 'A1 - - - - - - - C#2 - - - - - - -') },
      { wave: 'pulse12', vol: 0.12, echo: { delay: 3, vol: 0.4, transpose: 12 }, notes: bars('D4 - - - F4 - - - A4 - - - - - G4 -', 'F4 - - - - - E4 - D4 - - - C4 - - -', 'Bb3 - - - D4 - - - G4 - - - F4 - E4 -', 'E4 - - - - - - - C#4 - - - - - . .') },
      { wave: 'sine', vol: 0.08, notes: bars('. . . . . . . . . . . . D6 - - -', '. . . . . . . . . . . . . . . .', '. . . . . . . . . . . . Bb5 - - -', '. . . . . . . . A5 - - - . . . .') },
      { wave: 'noise', vol: 0.04, notes: bars('h . . . . . . . . . . h . . . .', '. . . . . . h . . . . . . . . .', 'h . . . . . . . . . . . . . h .', '. . . . h . . . . . . . . . . .') },
    ],
  },
  caverna: {
    bpm: 58,
    channels: [
      { wave: 'triangle', vol: 0.5, notes: bars('D2 - - - - - - - - - - - - - - -', 'D2 - - - - - - - Eb2 - - - - - - -', 'D2 - - - - - - - - - - - - - - -', 'C2 - - - - - - - Eb2 - - - . . . .') },
      { wave: 'sine', vol: 0.16, echo: { delay: 4, vol: 0.35, transpose: 0 }, notes: bars('. . . . A4 - . . . . . . . . . .', '. . . . . . . . Bb4 - - . . . . .', '. . D5 - . . . . . . . . . . . .', '. . . . . . . . A4 - - - G4 - - -') },
      { wave: 'noise', vol: 0.06, notes: bars('. . . h . . . . . . . . . . . .', '. . . . . . . . . . . . . h . .', '. h . . . . . . . . . . . . . .', '. . . . . . . h . . . . . . . .') },
    ],
  },
  ruinas: {
    bpm: 76,
    channels: [
      { wave: 'triangle', vol: 0.5, notes: bars('E2 - - - - - - - B2 - - - - - - -', 'C3 - - - - - - - G2 - - - - - - -', 'A2 - - - - - - - E2 - - - - - - -', 'F2 - - - - - - - B1 - - - - - - -') },
      { wave: 'pulse25', vol: 0.12, echo: { delay: 2, vol: 0.35, transpose: 0 }, notes: bars('B4 - - - . . G4 - - - . . E4 - - -', 'E5 - - - - - D5 - C5 - - - B4 - - -', 'C5 - - - . . A4 - - - . . E4 - - -', 'F4 - - - G4 - - - A4 - - - D#4 - - -') },
      { wave: 'noise', vol: 0.05, notes: bars('h . . . . . . . h . . . . . . .', 'h . . . . . . . h . . . . . . .', 'h . . . . . . . h . . . . . . .', 'h . . . . . . . h . . . h . . .') },
    ],
  },
  eco: {
    bpm: 50,
    channels: [
      { wave: 'triangle', vol: 0.45, notes: bars('C2 - - - - - - - F#2 - - - - - - -', 'C2 - - - - - - - G2 - - - - - - -') },
      { wave: 'pulse12', vol: 0.1, echo: { delay: 3, vol: 0.5, transpose: -1 }, notes: bars('C5 - - . . . F#5 - - . . . . . . .', 'B4 - - . . . F5 - - . . . E5 - - -') },
      { wave: 'sine', vol: 0.12, notes: bars('. . . . . . . . . . . . C6 - - -', '. . . . . . . . Db6 - - - . . . .') },
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
