# NIGHTFALL — notas para Claude

Shooter en primera persona para el navegador hecho con Three.js. Tiene una misión en solitario contra IA y partidas en línea por equipos (ALFA contra BRAVO). Está publicado en https://nightfall-x.pages.dev y el repositorio es https://github.com/alexlmdmca-creator/nightfall (licencia MIT, autor "Alexus").

El usuario escribe en español. Responde, comenta el código y escribe los mensajes de commit en español.

## Reglas del proyecto

- **Todo es procedural.** No hay imágenes, modelos 3D ni sonidos en archivo: texturas, soldados, armas, mapas y audio se generan por código al arrancar. No añadas recursos externos sin preguntar.
- **No hay paso de compilación para jugar.** `index.html` carga `src/main.js` con un importmap que apunta a `node_modules/`. No hay TypeScript, empaquetador ni framework.
- **Commits solo a nombre del usuario**, sin `Co-Authored-By` ni menciones a Claude. No hagas commit ni push sin que lo pida: **cada push a `main` vuelve a publicar en Cloudflare Pages**.
- **"No romper nada"** es un requisito habitual. Antes de dar algo por terminado, pasa las pruebas de la sección de verificación.

## Ejecutar

```bash
npm start              # servidor local con salas por WebSocket (server.js)
npm run build          # genera dist/ para Cloudflare Pages/Netlify/Vercel (modo online de navegador a navegador)
npm run test:online    # prueba automática del modo en línea, ~100 s
npm run test:p2p       # igual, pero con PeerJS entre 3 navegadores (necesita internet)
```

Parámetros útiles en la URL:
- `?autostart=1`: empieza la misión sin captura de ratón y expone `window.__game`.
- `?debug`: muestra los FPS.
- `?nolock=1`: juega sin capturar el ratón.
- `?red=p2p`: fuerza el modo online sin servidor.

## Arquitectura

- `src/main.js`: arranque, estados (menu, intro, playing, paused, ended), bucle principal y conexión entre módulos. En modo prueba expone `window.__game` con `teleport`, `stats`, `useMap`, `weapon`, `enemies`, `remotes`, `armory`, etc.
- **Mapas**: `src/maps.js` y `src/world/` (`index.js` es Sector 7, `solana.js` La Solana, `muelle.js` Muelle Norte). Cada mapa se construye con `WorldCtx` (`src/world/ctx.js`):
  - `ctx.box`/`ctx.cyl` dibujan y colisionan.
  - `ctx.add` solo dibuja.
  - `ctx.collider` solo colisiona.
  - `ctx.instance` acumula instancias.
  - La geometría estática se fusiona por material, región y flags (`StaticBatch` en `src/geo.js`).
- **Soldados**: `src/enemyModel.js`, una sola `SkinnedMesh` por soldado con 13 huesos y pose procedural (`poseSoldier`, con IK de brazos).
  - `soldierGeometry(weapon, look)` usa los aspectos de `LOOKS`: 0 guardia de la misión, 1 ALFA (operador táctico), 2 BRAVO (insurgente).
  - El color de equipo va solo en parches, brazalete y pañuelo.
  - La IA (`src/enemies.js`) usa el aspecto 0; los jugadores remotos (`src/remotePlayers.js`) usan `team + 1`.
- **Armas en primera persona**: `src/viewmodel.js` construye los modelos con `profile()` (siluetas extruidas) y `finger()` (dedos). `src/weapon.js` lleva la lógica: disparo, recarga, retroceso y cambio de arma. Las definiciones están en `WEAPONS` y el daño en `DAMAGE` (`src/combat.js`).
- **Llaveros**: `src/charms.js` tiene el catálogo `CHARMS`, los modelos y un péndulo movido por la aceleración del arma en el mundo.
  - Se eligen en la armería (`src/armory.js`, botón ARMERÍA del menú). Ahí el arma se expone con `Weapon.showcase()`.
  - Se guardan en `localStorage` (`nightfall.charms`) y solo los ve el propio jugador; no viajan por la red.
- **Red**:
  - `src/roomCore.js` tiene la lógica de salas, sin transporte.
  - `rooms.js` y `server.js` la sirven por WebSocket.
  - `src/p2p.js` la ejecuta en el navegador del anfitrión con PeerJS (modo de `dist/`).
  - Quien dispara decide el impacto; la víctima aplica el daño y avisa de su muerte; el servidor solo lleva el marcador.

## Cosas que rompen fácilmente

- **Zonas de impacto ≠ malla.** Los impactos se calculan con cápsulas a partir de la pose (`raycast` en `remotePlayers.js` y en `enemies.js`), no con la geometría. Puedes cambiar el aspecto de los soldados, pero respeta las alturas de cadera (0,95), hombros y cabeza. No toques los huesos, `ARM_UP`/`ARM_FORE` ni `poseSoldier` sin revisar los raycast.
- **Armas: anclajes fijos.** `SIGHT_Y`, `PISTOL_SIGHT_Y`, `MUZZLE` y `EJECT`, la lente de la mira y las piezas que anima `weapon.js` (`bolt`, `mag`, `slide`, `leftArm`, `rightArm`, `lens`, `lampLens`, `charm`) deben conservar posición y nombre. Si no, se desalinean la mira, la recarga o los efectos.
- **Acabado de las armas.** Fusil y pistola usan un grano fino y mate. El normal map de gotas (`surf.glassDrops`) en piezas grandes parecía abolladuras y al usuario no le gustó. El cuchillo conserva el acabado antiguo (`knifeBlack`/`knifeDark`).
- **`ctx.rng` es una secuencia.** Llamarlo en código nuevo desplaza todo lo aleatorio que se genera después: cajas, bidones, carga del carguero. Para detalle nuevo, usa valores fijos.
- **Detalle visual de los mapas.** Añádelo con `ctx.add` o `collide: false`, sin tocar colisionadores, nodos de cobertura, zonas de aparición ni `src/layout.js`.
- **Materiales y llamadas de dibujo.** Cada material nuevo es otra llamada de dibujo, multiplicada por las sombras y el reflejo. Reutiliza `M.darkSteel`, `M.steel` y los `M.metal(color, …)` que ya existan; `M.metal` y `M.glow` cachean por clave.
- **Plano del menú principal.** El primer plano cruza la cabina del todoterreno de `src/world/index.js` (3.2, 46.5). No pongas nada alto dentro de los jeeps.
- **Linterna.** Con intensidad 70 y `decay` 1.2 (`weapon.js`), a unos 2 m quema a blanco lo que ilumina, soldados incluidos. Ya pasaba así y no se ha cambiado.
- **Saltos de línea.** Unos archivos tienen CRLF y otros LF en la copia de trabajo, y `core.autocrlf` está activado. Al editar con scripts, conserva el que tenga cada archivo.

## Verificación

1. **Capturas con `tools/shot.mjs`.** Abre Chrome sin ventana, ejecuta pasos de un JSON (`eval`, `click`, `wait`, `shot`) y avisa de errores de consola:
   ```bash
   node tools/shot.mjs plan.json
   ```
   - Guarda los planes y las capturas en la carpeta temporal, no en el repositorio.
   - Para ver modelos, un paso `eval` puede hacer `import('/src/enemyModel.js')` y colocar soldados en la escena.
   - La Solana (`__game.useMap(1)`) es de día y se ve mejor.
   - Sector 7 es de noche: sube `renderer.toneMappingExposure` solo para inspeccionar.
2. **Modo en línea**: `npm run test:online` tiene que terminar en "Todo correcto".
3. **Versión publicable**: `npm run build` tiene que generar `dist/` sin errores.
4. **Rendimiento**: `__game.stats()` da FPS, llamadas de dibujo y triángulos. Ojo: los triángulos por fotograma varían según toque o no actualizar sombras; para comparar, cuenta la geometría de `__game.world.group`.
5. **Enseña capturas al usuario** antes y después de cada cambio visual.

## Estado

- **Hecho**: modo en línea completo (salas, combate, nombres, ajustes del anfitrión, 3 mapas) y publicado.
- **Mejora gráfica (octubre 2026)**:
  - Soldados con dos facciones tipo CS.
  - Armas con siluetas reales y manos con dedos.
  - Seis llaveros: calavera, bala, dado, granada, pato de goma y bidón.
  - Armería en el menú.
  - Más detalle en vehículos, contenedores, edificios, grúas y carguero.
- **Pendiente**: probar con gente real y latencia de internet; decidir si se suaviza la linterna de cerca.
