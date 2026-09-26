# RPG 2D Procedural — Diseño consolidado

Proyecto personal de entretenimiento. RPG 2D por turnos, atmósfera opresiva estilo Berserk, lore emergente e indeterminado, generación procedural profunda, con IA local para decisiones y una API en la nube para diálogo/narrativa. Estilo gráfico: gramática visual de Pokémon en Game Boy Advance, con paleta propia oscura.

Prioridad explícita: **simplicidad de desarrollo por encima de pureza arquitectónica** — es un proyecto de un solo desarrollador para uso propio, no un producto a distribuir. Cada decisión abajo ya pasó ese filtro.

---

## 1. Stack y arquitectura

- **Frontend**: Phaser 3 + Vite. Corre en navegador normal (Chrome/Firefox), sin empaquetar (nada de Electron/Tauri — no aporta nada cuando el único usuario eres tú).
- **Backend**: un solo servidor local en **Python** (Flask o FastAPI) con dos responsabilidades:
  1. **Motor de decisión** — carga Laya con su paquete oficial (`pip install laya`), expone un endpoint tipo `/decidir` que recibe estado + preguntas tipadas y regresa las probabilidades calibradas. Nada de ONNX, nada de WebAssembly, nada de portar código a JS — se usa tal cual el SDK de Python.
  2. **Proxy de la API de Claude** — guarda la API key como variable de entorno, expone `/hablar` para el navegador, reenvía a la API de Anthropic (Claude Haiku 4.5) y aplica los límites de seguridad (ver sección 4).
- **Arranque**: un solo comando/script (`npm run play` o un `.sh`) que levanta el servidor Python y abre el navegador en `localhost:PUERTO`. Nada más.
- **Guardado**: IndexedDB en el navegador (transacciones atómicas nativas, no hace falta SQLite ni lógica de escritura segura manual).

## 2. Capas de IA

| Capa | Motor | Dónde vive | Costo |
|---|---|---|---|
| Decisión de combate (acción, hostilidad por codicia) | Laya | Servidor Python local | Gratis |
| Monitor de escalamiento en diálogo (¿la charla se vuelve combate?) | Laya | Servidor Python local | Gratis |
| Guardarraíl de entrada libre (¿rompe personaje / fuera de tema / abusivo?) | Laya | Servidor Python local | Gratis |
| Líneas de combate ("barks") | Banco de texto propio + Claude Haiku 4.5 como generador ocasional | Proxy → API | Centavos |
| Diálogo libre y continuo con NPCs | Claude Haiku 4.5, con prompt caching del contexto del personaje | Proxy → API | Centavos |

**Reglas fijas que no cambian**: Laya nunca genera texto, solo clasifica — es estructuralmente imposible que alucine una decisión de juego. El LLM generativo (Claude) nunca controla estado de juego, solo prosa. Si la API falla, tarda, o no hay internet: fallback silencioso al banco de líneas precompuestas.

**Diálogo con NPCs — reglas de producto:**
- Texto libre (no menú de opciones).
- Conversación continua, con memoria dentro de esa sesión de charla.
- Contexto inyectado por turno: rol del NPC, bioma/profundidad del piso, si es un fragmento multiversal, flags de estado del mundo, stats relevantes del jugador (Inteligencia para negociación, valor del inventario para sesgo de codicia).
- Las conversaciones son **desechables**: se descartan por completo al cambiar de piso (no hay forma de regresar a un piso ya visitado), así que no existe memoria persistente de NPCs entre pisos.

**Límites de seguridad (obligatorios desde el día uno del lado del proxy):**
- Rate limit duro (peticiones por minuto, global y por conversación).
- Presupuesto de gasto acumulado por sesión de juego; al cruzarlo, corta llamadas a la API y cae al banco de líneas locales.
- `max_tokens` bajo (~150-200) en cada llamada a Claude.
- Interruptor de emergencia por variable de entorno (tope de gasto diario).

**Límites de conversación (lógica de juego):**
- Tope duro de intercambios por conversación (~25-30 turnos), cierre narrativo en personaje al llegar ahí.
- Timeout por inactividad (60-90s) que cierra la conversación sola.

## 3. Generación procedural

- **Macro (topología del piso)**: ruido continuo (Perlin/Simplex) + autómatas celulares, o Wave Function Collapse para estructuras tipo fortaleza con más coherencia de tiles.
- **Micro (población)**: L-Systems para vegetación, escombros, estructuras alienígenas.
- **Fragmentos multiversales**: ~2% de probabilidad por piso, restringidos a nodos "hoja" (dead-ends) del grafo de conectividad — nunca bloquean la ruta crítica.
- **Validación obligatoria**: BFS/A* desde la entrada antes de mostrar el piso; si no todas las salas críticas son alcanzables, regenerar con semilla+1 (determinista, no semilla aleatoria nueva).
- **RNG con semilla fija** en todo el pipeline (mulberry32 o similar) — reproducibilidad total para depurar y para el fallback de regeneración.

## 4. Sistema RPG

- **Fuerza**: daño físico y éxito en combate cuerpo a cuerpo.
- **Salud**: HP base.
- **Inteligencia**: modula negociación pacífica (vía Laya/Claude) + bonus pasivo a probabilidad de drop.
- **Maná**: llave de sincronización de equipo — no puedes usar ítems Raros/Legendarios/Únicos si tu maná máximo no cubre su costo de sincronización. Si un debuff baja tu maná máximo por debajo del costo de un ítem ya puesto, el ítem entra en un **grace period** de desincronización (se desactiva temporalmente) en vez de desequiparse a la fuerza.
- **Economía de loot**: Común/Normal frecuentes, Raro un par por piso, Legendario 0.005% con **pity-timer** (contador oculto que sube la probabilidad tras cada intento fallido, evita sequías infinitas), Único 0.0001% también con pity-timer. Los enemigos usan las mismas reglas de ítems que el jugador — si tienen algo legendario, lo usan contra ti.

## 5. Guardado

- IndexedDB, transacciones atómicas nativas.
- Solo se persiste: piso actual + estado global del jugador (stats, inventario, progreso). Nunca el historial de pisos pasados — al no poder regresar, esa información no vuelve a ser relevante.

## 6. Estilo visual

Gramática rigurosa de Pokémon en GBA, con paleta propia:

- **Overworld**: vista cenital 3/4, proporciones chibi, movimiento en cuadrícula de 16x16.
- **Combate**: pantalla separada del overworld — fondo estático, jugador de espaldas abajo, enemigo arriba (layout clásico Pokémon).
- **UI**: caja de diálogo con marco en la parte inferior, barra de HP con degradado verde-amarillo-rojo + contador numérico, tipografía pixel de ancho fijo.
- **Sprites**: tiles de 16x16, personajes overworld 16x16/16x32 con 3-4 frames de caminata por dirección, sprites de combate hasta 64x64 con idle de 2 frames.
- **Paleta**: propia, oscura y desaturada — se toma la técnica/proporciones de Pokémon, no sus colores alegres, para que encaje con el tono opresivo Berserk.
- **Cámara pixel-perfect** (movimiento/zoom en enteros), sin shaders de iluminación en tiempo real — usar lightmaps pre-horneados para la atmósfera.
- Arrancar con un tileset placeholder CC0 estilo GBA para no bloquear el desarrollo del motor mientras se define el arte final.

## 7. Audio

- Convención GBA real: soundfont/samples de instrumento (no chiptune 8-bit puro) — pistas cortas en loop por bioma, cambian con la generación procedural.
- Composición en tono menor, dispersa, con silencios — misma gramática técnica que Pokémon, ánimo opuesto (oscuro, no alegre).
- Efectos de acción (menú, ataque, ítem) vía **jsfxr** o paquetes CC0 para arrancar rápido sin producción musical propia.
- Composición original, si se quiere, se deja para después de tener el motor jugable — no bloquea nada.

## 8. Orden de construcción (rebanada vertical)

Siempre con un juego jugable al final de cada paso — nunca construir todos los sistemas en paralelo sin integrar.

1. Movimiento + un piso fijo (no procedural) + combate por turnos con enemigo estático y reglas fijas (sin IA).
2. Generación procedural del piso (macro + micro) sustituyendo el piso fijo.
3. Stats, inventario, economía de loot.
4. Guardado/carga (IndexedDB).
5. Capa de IA: servidor Python con Laya (decisión de combate) → banco de barks → Claude API (narrativa) → diálogo libre con NPCs.
6. Arte y audio placeholder → pulido final (paleta propia, tileset definitivo, composición propia si se desea).

## 9. Pendientes que siguen abiertos

Ya no bloquean el arranque, pero hay que resolverlos durante la construcción:

- Esquema exacto de preguntas para Laya (`choice`/`score`/`noul` concretos por caso de uso: acción de combate, hostilidad, escalamiento, moderación de entrada).
- Plantilla de "ficha de personaje" por NPC/rol y contenido inicial de al menos los primeros arquetipos.
- Redacción del banco de "barks" de combate.
- Números exactos de economía: curva del pity-timer, costos de maná por rareza, fórmulas de escalado de stats.
- Continuidad narrativa entre pisos: ¿hilo argumental conectado o viñetas emergentes sin relación entre corridas? (decisión de diseño, no técnica).
- Selección concreta del tileset y paquete de audio CC0 iniciales.
