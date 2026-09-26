# NEXO — RPG 2D procedural

RPG por turnos con gramática visual de Pokémon GBA, paleta oscura propia y atmósfera opresiva. Todo el arte y el audio se generan por código al arrancar: no hay archivos de imagen ni de sonido. Los enemigos deciden con **Laya** (modelo de decisión local) y los NPC conversan en **texto libre** con **Claude Haiku 4.5**; si la IA no está disponible, el juego sigue funcionando con reglas y diálogo local.

Diseño completo: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

## Jugar

```bash
npm install
npm run play          # compila, arranca el servidor local y abre el navegador
```

Sin nada más, el juego funciona completo con IA por reglas y diálogo local. Para activar la IA:

```bash
npm run setup-ai      # crea server/.venv con Laya (PyTorch CPU) y el SDK de Anthropic, y server/.env
```

Luego edita `server/.env` y pega tu `ANTHROPIC_API_KEY` si quieres diálogo generativo. La primera vez que arranques con Laya, descargará su modelo multilingüe (~650 MB) en segundo plano; mientras tanto el combate usa reglas. En equipos con poca RAM puedes poner `NEXO_NO_LAYA=1`.

| Tecla | Acción |
|---|---|
| Flechas / WASD | Mover (toque corto = girar en el sitio) |
| Mantener X + dirección | Correr |
| Z / Espacio | Aceptar · hablar · inspeccionar · descansar en una hoguera |
| X / Esc / Retroceso | Volver |
| Enter | Menú (MAPA, MOCHILA, ESTADO, GUARDAR) — también acepta |
| En el MAPA: Z · flechas · X | Cambiar zoom · desplazar · salir |
| M | Silenciar |

Cada piso es una **región** enorme (de 128×96 a 184×136 casillas): bosques, lagos, ríos con puentes, caminos con carteles que señalan aldeas y monumentos, huertos, estalagmitas, haces de luz que caen por grietas del techo y la escalera de descenso escondida en algún lugar. El **MAPA** es un pergamino con tres niveles de zoom (Z) que se desplaza con las flechas y solo muestra lo que ya recorriste. En las aldeas hay **hogueras**: descansar en ellas cura por completo y guarda la partida. La **hierba alta** esconde encuentros, y los enemigos del piso deambulan y te persiguen si te ven.

- **Clima**: lluvia, tormenta con relámpagos, niebla, ceniza, brasas, esporas o polvo según el bioma; cambia mientras caminas y tiene efectos pequeños y legibles (la niebla acorta la vista de los enemigos y facilita huir, la lluvia saca más criaturas de la hierba, la tormenta y el polvo bajan la precisión en combate). Los NPC saben qué tiempo hace.
- **Equipo visible**: la armadura (harapos, cuero, hábito, cota, coraza, placas) y el arma (daga, espada, maza, lanza, hacha, guadaña, mandoble) se ven en el personaje, en el mapa y de espaldas en combate; la rareza cambia el material (hierro, acero, acero negro con oro, metal sangrante).
- **Enemigos por rareza**: común, raro, legendario (con nombre propio, cuernos, aura y un ataque de firma) y único (criaturas de leyenda). Cada región tiene un guardián legendario junto a su monumento que no persigue: tú decides si lo enfrentas. Los humanoides empuñan el arma que portan.

Al hablar con un NPC (o elegir HABLAR en combate) escribes libremente: **Enter** envía, **Esc** termina la conversación.

## IA y límites de seguridad

- **Laya** (en el servidor Python local) decide la acción de cada enemigo muestreando sus probabilidades calibradas, filtra lo que escribes (fuera de tema, romper el personaje, abuso) antes de gastar una llamada, estima si un NPC se vuelve hostil y si un enemigo acepta tu negociación. Nunca genera texto: no puede alucinar una acción.
- **Claude Haiku 4.5** pone la voz: saludos y respuestas de NPC con su ficha de personaje y lo que perciben del piso, y la línea de apertura de cada enemigo.
- La **API key vive solo en el servidor** (`server/.env`), nunca en el navegador. El servidor solo escucha en `127.0.0.1`.
- Límites: 20 peticiones/min globales y 8 por conversación, presupuesto por sesión (`NEXO_SESSION_BUDGET_USD`, 0.50 por defecto) y diario (`NEXO_DAILY_BUDGET_USD`, 2.00), `max_tokens` de 160/90/60, interruptor de emergencia `NEXO_AI_DISABLED=1`. En el juego: 25 turnos por conversación y cierre a los 90 s de inactividad.
- La inteligencia del jugador ayuda a negociar; llevar objetos legendarios o únicos despierta una codicia que hunde la negociación.
- Caché de prompts: se usa caché automático, pero en Haiku 4.5 solo se activa cuando el prefijo supera 4096 tokens (conversaciones largas); por debajo de eso cada respuesta cuesta del orden de una décima de centavo.

## Desarrollo

```bash
npm run dev           # Vite con recarga en caliente (sin el servidor Python, la IA queda en modo local)
npm test              # lógica del juego (combate, pisos, loot, guardado, IA)
npm run test:server   # servidor Python (límites, proxy, moderación) con Laya/Claude simulados
npm run smoke         # juega en Chromium: combate, menús, descenso, guardado y recuperación
npm run smoke:ai      # integración de IA en Chromium contra el servidor con Laya/Claude simulados
npm run build         # build de producción en dist/
```

## Estado por fases

- [x] **Fase 1** — movimiento en cuadrícula, combate por turnos estilo Pokémon, audio sintetizado, arte procedural.
- [x] **Fase 2** — pisos procedurales: 3 biomas (BSP, autómata celular, ruinas erosionadas), decoración por L-Systems, fragmentos multiversales, enemigos únicos por semilla, validación BFS con regeneración determinista.
- [x] **Fase 3** — atributos manuales (Fuerza, Salud, Inteligencia, Maná), subida de nivel, maná como sintonización con desincronización por drenaje, loot Común/Raro/Legendario/Único con pity-timer, enemigos que usan y sueltan su ítem, pantallas de MOCHILA y ESTADO.
- [x] **Fase 4** — guardado en IndexedDB con escritura atómica, autoguardado al entrar a cada piso y guardado manual, anillo de 3 respaldos con checksum y validación, restauración automática ante corrupción, permamuerte parcial (el perfil con pity y récords sobrevive).
- [x] **Fase 5** — servidor local con Laya (decisiones, moderación, escalamiento, persuasión) y proxy de Claude con límites; NPC con ficha de personaje y conversación libre; negociación en combate; todo con respaldo local si la IA no está.
- [x] **Fase 6** — pisos como regiones: terreno por ruido fractal (elevación y humedad), ríos por A*, red de caminos por árbol de expansión mínima con puentes y túneles, aldeas con casas, plaza, pozo, hoguera y aldeanos con rol, monumentos colosales por bioma (caballero arrodillado, árbol ancestral, costillar), 5 biomas con arte, música, partículas y fondo de combate propios, autotiles de caminos y agua, hierba alta que cubre al jugador, mapa con niebla de guerra, zonas con nombre, correr, encuentros en hierba y enemigos errantes.
- [x] **Fase 7** — clima dinámico con efectos de juego, sonido y relámpagos; personaje dibujado por capas con el equipo visible; catálogo de armas y armaduras con aspecto propio; enemigos por rareza con guardianes legendarios; criaturas por anatomía (20 formas); regiones más grandes con tiles animados, orillas continuas, acantilados de doble altura, huertos, carteles, estalagmitas, cristales y haces de luz; mapa ilustrado con zoom.
