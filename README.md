# NEXO — RPG 2D procedural

RPG por turnos con gramática visual de Pokémon GBA, paleta oscura propia y atmósfera opresiva. Todo el arte y el audio se generan por código al arrancar: no hay archivos de imagen ni de sonido.

Diseño completo: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

## Jugar

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

| Tecla | Acción |
|---|---|
| Flechas / WASD | Mover (toque corto = girar en el sitio) |
| Z / Espacio | Aceptar · hablar · inspeccionar |
| X / Esc / Retroceso | Volver |
| Enter | Menú (MOCHILA, ESTADO) — también acepta |
| M | Silenciar |

## Desarrollo

```bash
npm test          # pruebas de lógica (combate, pisos, generador de monstruos)
npm run smoke     # abre el juego en Chromium, juega un combate y guarda capturas
npm run build     # build de producción en dist/
```

## Estado por fases

- [x] **Fase 1** — movimiento en cuadrícula, piso fijo, combate por turnos estilo Pokémon, audio sintetizado, arte procedural.
- [x] **Fase 2** — pisos procedurales: 3 biomas (BSP, autómata celular, ruinas erosionadas), decoración por L-Systems, fragmentos multiversales, enemigos únicos por semilla, validación BFS con regeneración determinista.
- [x] **Fase 3** — atributos manuales (Fuerza, Salud, Inteligencia, Maná), subida de nivel, maná como sintonización con desincronización por drenaje, loot Común/Raro/Legendario/Único con pity-timer, enemigos que usan y sueltan su ítem, pantallas de MOCHILA y ESTADO.
- [ ] Fase 4 — guardado/carga.
- [ ] Fase 5 — IA: Laya (decisiones) + Claude (diálogo libre con NPCs).
