// Elementos del mapa. w/h: tamaño de la imagen en casillas. fp: casillas sólidas relativas al
// ancla (casilla inferior izquierda); dy crece hacia arriba. Solo la base es sólida: las copas y
// los techos se pueden rodear por detrás y tapan al jugador (profundidad real).
const row = (w, dy = 0, from = 0) => Array.from({ length: w }, (_, i) => [from + i, dy]);

export const PROPS = {
  arbol: { w: 2, h: 3, fp: row(2) },
  pino: { w: 2, h: 3, fp: row(2) },
  seco: { w: 2, h: 3, fp: row(2) },
  sauce: { w: 2, h: 3, fp: row(2) },
  hongo: { w: 2, h: 3, fp: row(2), light: 'frio' },
  hongo_chico: { w: 1, h: 1, fp: [], light: 'frio' },
  arbusto: { w: 1, h: 1, fp: row(1) },
  roca: { w: 1, h: 1, fp: row(1) },
  pena: { w: 2, h: 2, fp: row(2) },
  tocon: { w: 1, h: 1, fp: row(1) },
  juncos: { w: 1, h: 1, fp: [] },
  lapida: { w: 1, h: 1, fp: row(1) },
  cruz: { w: 1, h: 2, fp: row(1) },
  vela: { w: 1, h: 1, fp: [], light: 'fuego' },
  columna: { w: 1, h: 3, fp: row(1) },
  escombro: { w: 1, h: 1, fp: row(1) },
  estatua: { w: 2, h: 3, fp: row(2) },
  farol_roto: { w: 1, h: 2, fp: row(1) },
  hueso_grande: { w: 2, h: 2, fp: row(2) },
  casa: { w: 4, h: 4, fp: [...row(4, 0), ...row(4, 1), ...row(4, 2)], door: [1, 0] },
  pozo: { w: 2, h: 2, fp: row(2) },
  hoguera: { w: 1, h: 1, fp: row(1), light: 'fuego' },
  farol: { w: 1, h: 2, fp: row(1), light: 'fuego' },
  valla: { w: 1, h: 1, fp: row(1) },
  arbol_ancestral: { w: 6, h: 8, fp: [...row(4, 0, 1), ...row(4, 1, 1)] },
  coloso: { w: 5, h: 8, fp: [...row(5, 0), ...row(5, 1)] },
  costilla: { w: 3, h: 6, fp: row(1), fpFlip: [[2, 0]] },
  craneo: { w: 4, h: 3, fp: [...row(4, 0), ...row(4, 1)] },
};

export const TREE_KINDS = new Set(['arbol', 'pino', 'seco', 'sauce', 'hongo']);

export function footprint(prop) {
  const def = PROPS[prop.k];
  const fp = prop.v === 1 && def.fpFlip ? def.fpFlip : def.fp;
  return fp.map(([dx, dy]) => [prop.x + dx, prop.y - dy]);
}
