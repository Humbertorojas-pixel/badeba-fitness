// Paleta maestra: gramática de Pokémon GBA, ánimo propio (oscuro y desaturado).
// Todo sprite/tile generado debe usar solo estos colores.
export const PAL = {
  ink: '#14121a',
  night: '#1c1922',
  shade: '#231f2b',
  dusk: '#2e2a38',
  stone0: '#3b3845',
  stone1: '#4f4b5a',
  stone2: '#6b6677',
  stone3: '#8c8698',
  bone0: '#a59b89',
  bone1: '#c2b8a4',
  bone2: '#d8cfbc',
  blood0: '#3a1216',
  blood1: '#5e1a1e',
  blood2: '#8a2a28',
  blood3: '#b5433a',
  rust0: '#3a2618',
  rust1: '#5c3d26',
  rust2: '#87603c',
  moss0: '#1f271b',
  moss1: '#34402a',
  moss2: '#55623c',
  steel0: '#232b38',
  steel1: '#3a4659',
  steel2: '#5d6f88',
  steel3: '#8a9cb3',
  skin0: '#7a5a4a',
  skin1: '#a8836a',
  ember0: '#8c5f24',
  ember1: '#c28d3a',
  ember2: '#e3bf6a',
  hpGreen: '#5f8a4a',
  hpYellow: '#b8973e',
  hpRed: '#a8322e',
};

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToInt(hex) {
  return parseInt(hex.slice(1), 16);
}
