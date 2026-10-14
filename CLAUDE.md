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
- **Jugador y cobertura**: `src/player.js` lleva el movimiento (inercia, sprint, agacharse, salto) y la cámara (`applyCamera`).
  - Agachado (Ctrl o la C) junto a un obstáculo que tape al menos hasta la cadera se está a cubierto (`inCover`): al pulsar agacharse a su lado o al llegar a él ya agachado. Se comprueba unas 10 veces por segundo con `col.coverInfo` (`src/colliders.js`), que ignora postes finos. Acercarse sin agacharse no hace nada: el usuario no quiere cobertura automática.
  - A cubierto, Q/E asoman la cabeza `LEAN_DIST` (0,38 m) a cada lado (`player.lean`, recortado con un rayo para no atravesar paredes). Tras una cobertura baja (< 1,45 m), apuntar levanta al jugador para disparar por encima.
  - `player.headX`/`headZ` son la posición real de la cabeza: la IA (`enemies.js`) la usa para ver y disparar al jugador.
- **Resistencia**: `player.stamina` (0-1) en `player.js`. El sprint la gasta en 5 s (`STAMINA_DRAIN`) y saltar un 10 %. Tras 1 s sin gastar se recupera en ~4 s andando o ~3 s quieto o agachado. Al llegar a 0, `player.exhausted` impide esprintar hasta recuperar el 30 % (`STAMINA_MIN`), suena una tos corta (`audio.cough`, evento `exhausted`) y la barra fina bajo la vida (`#stamina`, solo visible si no está llena) se pone ámbar. Es solo local: en línea basta el bit `SPRINT`.
- **Armas en primera persona**: `src/viewmodel.js` construye los modelos con `profile()` (siluetas extruidas) y `finger()` (dedos). `src/weapon.js` lleva la lógica: disparo, recarga, retroceso y cambio de arma. Las definiciones están en `WEAPONS` y el daño en `DAMAGE` (`src/combat.js`).
- **Golpe rápido con V**: con cualquier arma, solo si hay un rival a menos de 1,9 m, dentro de la vista, sin pared en medio y **de lado o de espaldas** (de frente no se puede). Entonces sale el aviso `V CUCHILLO` (`#quick-hint`). El objetivo lo elige `combat.quickTarget`. Al pulsar V, al azar (`TAKEDOWN_CHANCE`, 2/3) hace una de dos animaciones:
  - **Remate** (si hay sitio libre a la espalda de la víctima, `player.takedownSpot`): mortal. El jugador queda bloqueado e **inmune** 1,2 s (`player.lock`, `TAKEDOWN_TIME`). La cámara se coloca 0,7 m detrás de la víctima mirando a su nuca, el arma baja del todo, la mano izquierda (`buildGrabHand`) la agarra del hombro y la derecha le clava el cuchillo en el cuello en `TAKEDOWN_STAB`. La víctima hace `takedownPose` (`enemyModel.js`, parámetros `grab` y `slump` de `poseSoldier`) y cae de bruces. Al terminar, el arma sube como tras un cambio (`drawT = 1`).
  - **Puñalada**: la mano derecha suelta el arma (que se queda en la izquierda, bajada y ladeada), baja a la cintura, sale con el cuchillo y apuñala. Deja al rival con `STAB_LEFT` (30) de vida, o lo mata si ya tenía menos. No bloquea.
  - El cuchillo de estas animaciones es un modelo aparte (`weapon.quickKnife`, con el antebrazo hacia abajo para que la manga no se corte con el plano cercano de la cámara). Mientras dura, la linterna baja a `QUICK_LIGHT` y sube la luz de relleno (`QUICK_FILL`): de noche, si no, o se quema a blanco o no se ve nada.
  - En la misión, la IA agarrada se congela (`enemies.grab`, `e.td`) y muere con la puñalada. En línea la víctima muere al empezar el remate, para que la latencia no le deje escapar. Solo quien remata ve la animación (`remotes.takedown`, `r.td`); la víctima y los demás ven una muerte normal.
- **Llaveros**: `src/charms.js` tiene el catálogo `CHARMS`, los modelos y un péndulo movido por la aceleración del arma en el mundo.
  - Se eligen en la armería (`src/armory.js`, botón ARMERÍA del menú). Ahí el arma se expone con `Weapon.showcase()`.
  - Se guardan en `localStorage` (`nightfall.charms`) y solo los ve el propio jugador; no viajan por la red.
- **Red**:
  - `src/roomCore.js` tiene la lógica de salas, sin transporte.
  - `rooms.js` y `server.js` la sirven por WebSocket.
  - `src/p2p.js` la ejecuta en el navegador del anfitrión con PeerJS (modo de `dist/`).
  - Quien dispara decide el impacto; la víctima aplica el daño y avisa de su muerte; el servidor solo lleva el marcador.
  - El estado de cada jugador es `[x, y, z, yaw, pitch, flags]` (`net.sendState`). `flags`: bits 0-5 de `FLAG` (CROUCH, SPRINT, AIM, LIGHT, DEAD, SHIELD), bits 6-7 el arma (`WEAPON_SHIFT`) y bits 8-9 hacia dónde se asoma (`LEAN_SHIFT`: 0 nada, 1 izquierda, 2 derecha). `roomCore.js` exige 6 elementos: para enviar más estado, usa bits nuevos en vez de alargar el array.
  - Bit 10, `FLAG.LOCK`: el jugador está rematando y es inmune. Los demás no pueden darle (`remotes.isImmune`, como con SHIELD, pero sin parpadeo).
  - El mensaje `hit` lleva `k`: con `k = 1` (puñalada rápida) la víctima ignora `dmg` y se queda con `STAB_LEFT` de vida, porque solo ella sabe cuánta le queda (`main.js`, manejador `hit`).

## Cosas que rompen fácilmente

- **Zonas de impacto ≠ malla.** Los impactos se calculan con cápsulas a partir de la pose (`raycast` en `remotePlayers.js` y en `enemies.js`), no con la geometría. Puedes cambiar el aspecto de los soldados, pero respeta las alturas de cadera (0,95), hombros y cabeza. No toques los huesos, `ARM_UP`/`ARM_FORE` ni `poseSoldier` sin revisar los raycast.
- **Asomarse: tres números enlazados.** La cámara local se aparta `LEAN_DIST` (0,38, `player.js`). El soldado remoto lo imita con `LEAN_HIP` (0,15) y `LEAN_SPINE` (0,42 rad) de `enemyModel.js`, porque la cabeza está a 0,57 m del pivote de la columna. Las cápsulas de `remotePlayers.raycast` usan esas mismas constantes. Si cambias uno, recalcula los otros y comprueba que la cápsula de la cabeza sigue centrada en la cabeza del modelo.
- **Teclas Q/E.** Son para asomarse. Q dejó de ser "arma anterior": las armas se cambian con la rueda y 1-2-3. V es el golpe rápido.
- **Golpe rápido: tiempos compartidos.** `TAKEDOWN_STAB` y `TAKEDOWN_TIME` (`enemyModel.js`) los usan a la vez la animación en primera persona (`weapon.js`), el bloqueo del jugador (`player.js`) y la pose de la víctima (IA y remotos). Cámbialos solo ahí. La pose de la víctima no toca las cápsulas de impacto porque solo se aplica a quien ya no recibe disparos.
- **Probar el golpe rápido.** Necesita un sitio despejado: en La Solana, `teleport(-9, 25, 0)` y colocar un enemigo a 1,3 m delante, de espaldas (`e.x`, `e.z`, `e.yaw`, `e.wait = 999`; parchea `enemies.engage` para que no se gire). Para forzar el tipo, fija `Math.random` antes de `input.pressed.add('KeyV')` (< 2/3 remate). Para fotografiar fases concretas, envuelve `requestAnimationFrame` y retén los fotogramas cuando `weapon.quick.t` llegue al instante deseado.
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
   - Un paso con `"print": true` imprime lo que devuelve su `eval`.
   - Para simular teclas: `__game.input.keys.add('KeyE')` / `.delete(...)`, `input.crouchToggle = true` (agacharse) e `input.aim = true` (apuntar). Para que la IA no moleste: `__game.enemies.setActive(false)` y `player.invulnerable = true`.
   - Caja baja de Sector 7 para probar la cobertura: centro (-10.8, 29.2), 1,25 m de alto. Por ejemplo, `teleport(-9.45, 33.2, 90)`, agacharse y andar con D hasta su esquina. Ojo: hay postes finos cerca que desplazan el teletransporte.
   - Para ver a un jugador remoto fuera de una partida, `remotes.sync([{ id, name, team, playing: true }], 0)` y llamar a `remotes.update` en cada fotograma rellenando `buf`, porque en la misión no se actualizan.
   - Desactiva la linterna (`weapon.lightOn = false`) para capturas de cerca: quema a blanco.
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
- **Mecánicas (octubre 2026)**:
  - Cobertura y asomarse con Q/E, con efecto en la IA y sincronizada en línea (commit `91ad15f`).
- **Sesión del 14 de octubre de 2026**:
  - Se categorizaron las ideas del brainstorming por tiempo y dificultad: las rápidas son resistencia, golpe con V, supresión y más bidones; las medias, oleadas, deslizamiento, disparo a ciegas y botiquines; las grandes, trepar, granadas, IA más lista, puertas y cajas empujables.
  - **Resistencia para el sprint**: 5 s de sprint, 1 s de pausa, 30 % para volver a correr. Barra fina bajo la vida y una tos corta y suave al agotarse; el usuario la quería discreta, "no como si se estuviese muriendo".
  - **Golpe rápido con V**, con el diseño del usuario:
    - Solo de lado o de espaldas.
    - Al azar, 2/3 remate al cuello (mortal, con 1,2 s de inmunidad) y 1/3 puñalada que deja a 30.
    - La mano saca el cuchillo "del pantalón", fuera de la vista.
    - En línea solo el atacante ve la animación.
    - Se descartó el remate en tercera persona tipo CoD moderno: demasiado para este juego.
    - El usuario lo probó en línea y funciona.
- **Pendiente**:
  - Probar con gente real y latencia de internet.
  - Decidir si se suaviza la linterna de cerca (durante el golpe rápido ya se atenúa).
  - Siguiente en la lista: supresión (2-4 h, no toca la red), oleadas en la misión, o deslizamiento + disparo a ciegas juntos. Los dos últimos comparten bit de estado, pose remota y cápsulas. El siguiente bit libre de `flags` es el 11.

## Ideas de mecánicas (brainstorming, octubre 2026)

Hechas: **inclinarse con Q/E**, **cobertura libre**, **resistencia** y **golpe rápido con V** (ver Arquitectura). La "cobertura pegada" al estilo Gears/Division se descartó: pide cámara en tercera persona, poses nuevas y transiciones.

**Movimiento**

| Idea | Cómo encaja | Coste | Riesgo en línea |
|---|---|---|---|
| Deslizamiento | Sprint + agacharse da un impulso de ~0,8 s que decae. Baja la cámara y la cápsula, y se puede disparar mientras se desliza. | Bajo: es una variante de `crouching` | Medio: necesita un bit nuevo en `flags` y la pose del soldado remoto |
| Trepar (vault) | Detectar un obstáculo bajo (≤ 1,2 m) delante y subirlo con una animación corta. | Medio: hay que consultar `colliders.js` | Medio |
| Saltar y agarrarse | Variante de trepar para repisas más altas. | Medio-alto | Medio |
| ~~Resistencia (stamina)~~ | Hecha. Al añadir deslizamiento o trepar, que gasten `player.stamina`. | — | — |

**Cobertura**
- Supresión: si te disparan cerca, la visión se desenfoca y viñetea, y la puntería empeora. Hace que la cobertura se sienta útil.

**Combate**
- Granadas (frag, humo, cegadora): la mecánica con más impacto de las que faltan. Reutiliza `particles.js`/`fxRecipes.js`. En línea hay que sincronizar el lanzamiento; el daño, como con las balas: quien lanza decide y la víctima lo aplica.
- Armadura/chaleco y botiquines recogibles, para que la salud sea una decisión.
- Disparo a ciegas desde la cobertura, con poca precisión y poca exposición.

**Mundo y misión**
- Puertas y ventanas interactivas (abrir, cerrar, romper cristales).
- Objetos que se mueven: cajas empujables, más bidones explosivos (ya los hay).
- Oleadas o modo supervivencia en la misión en solitario, para rejugarla.
- Dificultad de la IA: que flanquee, lance granadas o busque cobertura y se asome.

**Orden propuesto** (menos riesgo primero; comparten el bit de estado, la cápsula variable y la pose remota):
1. Deslizamiento + trepar obstáculos bajos.
2. Supresión.
3. Granadas, las últimas porque tocan red, IA y efectos a la vez.

**Al implementarlas**:
- Cualquier pose nueva (deslizar, trepar) cambia las cápsulas de impacto de `remotePlayers.js` y `enemies.js`.
- El estado nuevo va en bits de `flags`, sin romper el protocolo (ver Red).
- Todo por código, sin recursos externos.
