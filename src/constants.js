export const GAME_W = 240;
export const GAME_H = 160;
export const TILE = 16;

export const WALK_MS = 200;
export const RUN_MS = 110;
export const TURN_GRACE_MS = 90;

// entity + fila de la casilla: los mapas llegan a 120 filas, así que overlay/ui van muy por encima.
export const DEPTH = {
  floor: 0,
  decal: 1,
  entity: 10,
  overlay: 1000,
  ui: 2000,
};
