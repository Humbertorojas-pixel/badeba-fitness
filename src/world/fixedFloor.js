// Piso fijo de la fase 1 (se sustituye por generación procedural en la fase 2).
// # muro · . suelo · , grieta · b huesos · x sangre · m musgo · r escombro
// S inicio · E escaleras · T antorcha en muro · ? cadáver inspeccionable · 1-4 enemigos
export const FIXED_FLOOR = [
  '##############################',
  '##############################',
  '###T######T#######T#######T###',
  '###...........###...........##',
  '###..b........###......x....##',
  '###...........###...........##',
  '###.....S.............1.....##',
  '###.m.........###...........##',
  '###.......,...###.....r.....##',
  '###...........###...........##',
  '#######.##############.#######',
  '#######.##############.#######',
  '####T##.##T########T##2###T###',
  '###..........#####..........##',
  '###.x.........####....b.....##',
  '###......?...#####..........##',
  '###..,................,.....##',
  '###..b.......#####......3...##',
  '###..4...x...#####.m........##',
  '###..........#####.......E..##',
  '##############################',
  '##############################',
];

export const ENEMY_KEYS = { 1: 'carronero', 2: 'sombra', 3: 'penitente', 4: 'reptante' };

export const INSPECT_TEXT =
  'Un cadáver aferra un pergamino: «El pozo no tiene fondo. Solo pisos que olvidan que existieron.»';
