# NIGHTFALL-X — notas para Claude

Shooter en primera persona para el navegador hecho con Three.js. Tiene una misión en solitario contra IA y partidas en línea por equipos (ALFA contra BRAVO). Está publicado en https://nightfall-x.pages.dev y el repositorio es https://github.com/Hunter-X-10/Nightfall-X (licencia MIT, autor "Alexus"). El nombre "Nightfall-X" sirve para distinguirlo de otros proyectos llamados Nightfall; antes estaba en `alexlmdmca-creator/nightfall`, que redirige al nuevo.

El usuario escribe en español. Responde, comenta el código y escribe los mensajes de commit en español.

## Reglas del proyecto

- **Todo es procedural.** No hay imágenes, modelos 3D ni sonidos en archivo: texturas, soldados, armas, mapas y audio se generan por código al arrancar. No añadas recursos externos sin preguntar.
- **No hay paso de compilación para jugar.** `index.html` carga `src/main.js` con un importmap que apunta a `node_modules/`. No hay TypeScript, empaquetador ni framework.
- **Commits a nombre del usuario, con Claude como coautor.** Termina cada mensaje de commit con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (el usuario lo pidió el 14 de octubre de 2026 para que Claude figure como contribuidor). Los commits hasta `32bc318` incluido no la llevan y no se reescriben. No hagas commit ni push sin que lo pida: **cada push a `main` vuelve a publicar en Cloudflare Pages**.
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
- **Deslizamiento**: pulsar agacharse (Ctrl o C) mientras se esprinta da un impulso de 8,4 m/s en la dirección de la carrera que se frena hasta el paso agachado en 0,8 s (`SLIDE_TIME`). Recorre unos 3 m.
  - Es permisivo, como en Fortnite, porque al usuario le costaba activarlo. Vale pulsar agacharse hasta 0,4 s después de soltar el sprint (`SLIDE_GRACE`, `player.sprintAgo`) si aún se va a más de 3,4 m/s (`SLIDE_MIN`). La pulsación se recuerda 0,3 s en el suelo (`SLIDE_BUFFER`, `player.slideBuf`) y en el aire no caduca: tras un salto esprintando, se desliza al aterrizar.
  - La dirección queda fija y la vista se puede girar. Se puede disparar y apuntar. La cámara baja a `EYE_SLIDE` (0,86), se inclina un poco y abre 6° el campo de visión. El arma baja y se ladea (`weapon.updatePose`, con `player.slideK`).
  - Gasta un 12 % de resistencia (`SLIDE_STAMINA`) y deja 0,45 s de espera (`SLIDE_COOL`). Termina antes si se suelta agacharse, se cae de un borde o se choca. Suena `audio.slide(surface)` (evento `slide`).
  - En línea va en el bit 11, `FLAG.SLIDE`. El soldado remoto (`pose.slide`) estira la pierna derecha y apoya la rodilla izquierda, con la cadera a `SLIDE_HIP` (0,42) y el torso `SLIDE_BACK` (0,3 rad) hacia atrás.
- **Trepar**: Espacio frente a un obstáculo de 0,4 a 1,25 m de alto (`VAULT_MIN`/`VAULT_MAX`), a menos de 0,75 m del cuerpo (`VAULT_REACH`) en la dirección en la que se mira. Lo decide `player.tryVault` y, si no hay obstáculo válido, se salta como siempre.
  - Si el obstáculo tiene como mucho 1,2 m de fondo (`VAULT_DEPTH`) y hay sitio detrás, se salta al otro lado, con una caída máxima de 1,6 m (`VAULT_DROP`). Si no, se sube encima, de pie o agachado según el techo, siempre que la tapa se pueda pisar. Si hay algo encima (una caja apilada, por ejemplo), no se hace nada.
  - Dura ~0,5-0,65 s (`player.vault`, `updateVault`). Se puede mirar alrededor, pero no moverse, disparar ni dar el golpe rápido. El arma baja y se ladea (`player.vaultK`). Al terminar sale con impulso hacia delante. No es inmune.
  - Es permisivo, como el deslizamiento: la pulsación de Espacio se recuerda 0,3 s (`VAULT_BUFFER`), también en el aire, midiendo la altura desde donde se despegó (`player.jumpY`). Funciona agachado y desde una cobertura. Gasta un 8 % de resistencia. Suena `audio.vault(surface)`.
  - `col.topAt` (`colliders.js`) da la tapa más alta bajo un punto, aunque no se pueda pisar. Sirve para medir el obstáculo.
  - En línea va en el bit 12, `FLAG.VAULT`. La altura ya viaja en el estado. El soldado remoto (`pose.vault`) recoge las piernas como al agacharse, adelanta el torso y apoya la mano izquierda, y sus cápsulas son las de agachado.
  - Para probarlo: en La Solana, barrera de 0,82 m en (-7.2, 17.2) con `teleport(-7.2, 18.3, 0)`, muro de 1,1 m con `teleport(-13.6, 28.4, 0)` y sacos con `teleport(-6.4, 12, 0)`. Para subirse, la caja de Sector 7 con `teleport(-8.95, 29.2, 90)`; es el único obstáculo bajo, ancho y libre de los tres mapas. Las cajas de madera de La Solana tienen otra apilada encima y no se pueden trepar.
- **Armas en primera persona**: `src/viewmodel.js` construye los modelos con `profile()` (siluetas extruidas) y `finger()` (dedos). `src/weapon.js` lleva la lógica: disparo, recarga, retroceso y cambio de arma. Las definiciones están en `WEAPONS` y el daño en `DAMAGE` (`src/combat.js`).
- **Golpe rápido con V**: con cualquier arma, solo si hay un rival a menos de 1,9 m, dentro de la vista, sin pared en medio y **de lado o de espaldas** (de frente no se puede). Entonces sale el aviso `V CUCHILLO` (`#quick-hint`). El objetivo lo elige `combat.quickTarget`. Al pulsar V, al azar (`TAKEDOWN_CHANCE`, 2/3) hace una de dos animaciones:
  - **Remate** (si hay sitio libre a la espalda de la víctima, `player.takedownSpot`): mortal. El jugador queda bloqueado e **inmune** 1,2 s (`player.lock`, `TAKEDOWN_TIME`). La cámara se coloca 0,7 m detrás de la víctima mirando a su nuca, el arma baja del todo, la mano izquierda (`buildGrabHand`) la agarra del hombro y la derecha le clava el cuchillo en el cuello en `TAKEDOWN_STAB`. La víctima hace `takedownPose` (`enemyModel.js`, parámetros `grab` y `slump` de `poseSoldier`) y cae de bruces. Al terminar, el arma sube como tras un cambio (`drawT = 1`).
  - **Puñalada**: la mano derecha suelta el arma (que se queda en la izquierda, bajada y ladeada), baja a la cintura, sale con el cuchillo y apuñala. Deja al rival con `STAB_LEFT` (30) de vida, o lo mata si ya tenía menos. No bloquea.
  - El cuchillo de estas animaciones es un modelo aparte (`weapon.quickKnife`, con el antebrazo hacia abajo para que la manga no se corte con el plano cercano de la cámara). Mientras dura, la linterna baja a `QUICK_LIGHT` y sube la luz de relleno (`QUICK_FILL`): de noche, si no, o se quema a blanco o no se ve nada.
  - En la misión, la IA agarrada se congela (`enemies.grab`, `e.td`) y muere con la puñalada. En línea la víctima muere al empezar el remate, para que la latencia no le deje escapar. Solo quien remata ve la animación (`remotes.takedown`, `r.td`); la víctima y los demás ven una muerte normal.
- **Llaveros**: `src/charms.js` tiene el catálogo `CHARMS`, los modelos y un péndulo movido por la aceleración del arma en el mundo.
  - Se eligen en la armería (`src/armory.js`, botón ARMERÍA del menú). Ahí el arma se expone con `Weapon.showcase()`.
  - Se guardan en `localStorage` (`nightfall.charms`) y solo los ve el propio jugador; no viajan por la red.
- **Supervivencia** (botón SUPERVIVENCIA del menú, `src/survival.js`): oleadas sin fin en cualquiera de los 3 mapas. Es solo local, sin red. `mode` vale `'survival'` y `combat.survival` quita los objetivos de la misión.
  - Oleada n: `FIRST_WAVE + WAVE_STEP·(n−1)` enemigos (4, 7, 10…), como mucho `MAX_ALIVE` (8) a la vez; el resto entra de refuerzo. Cada oleada sube `combat.difficulty` (puntería) y baja `enemies.reactK` (reacción), con tope.
  - Al superar una oleada: bonus de puntos, vida al máximo, fusil a 200 de reserva como mínimo (`REFILL`), pistola llena, bidones repuestos y 20 s de descanso (`REST_TIME`).
  - Cada baja suelta una caja de munición (+10 balas de fusil al pasar por encima). Las cajas son un único `InstancedMesh`.
  - Se empieza donde la misión en Sector 7 (los enemigos salen de la base) y lo más cerca posible del centro en La Solana y Muelle Norte (salen de una franja a lo largo de todo el borde). Siempre a 24-65 m y fuera de la vista.
  - Reutiliza los 10 soldados de la misión: `enemies.bench()` los deja fuera de juego (`e.off`, como muertos y ocultos) y `enemies.enter()` los mete ya alerta. Si no queda ninguno libre, se recicla un cuerpo que no se vea.
  - Con `enemies.hunt`, la IA vuelve a saber cada 5-8 s dónde anda el jugador (`track`), cambia a una cobertura más cercana si está a más de 22 m y, sin cobertura, avanza hacia él. Para rodear edificios sigue `src/navgrid.js`: una rejilla de 0,8 m con los obstáculos de `colliders.js` y la distancia andando desde la celda del jugador (`enemies.nav`, solo en supervivencia).
  - Los récords por mapa se guardan en `localStorage` (`nightfall.survival`). En pruebas: `__game.startSurvival(id)` y `__game.survival` (`restT = 0.05` salta el descanso).
- **Red**:
  - `src/roomCore.js` tiene la lógica de salas, sin transporte.
  - `rooms.js` y `server.js` la sirven por WebSocket.
  - `src/p2p.js` la ejecuta en el navegador del anfitrión con PeerJS (modo de `dist/`).
  - Quien dispara decide el impacto; la víctima aplica el daño y avisa de su muerte; el servidor solo lleva el marcador.
  - El estado de cada jugador es `[x, y, z, yaw, pitch, flags]` (`net.sendState`). `flags`: bits 0-5 de `FLAG` (CROUCH, SPRINT, AIM, LIGHT, DEAD, SHIELD), bits 6-7 el arma (`WEAPON_SHIFT`) y bits 8-9 hacia dónde se asoma (`LEAN_SHIFT`: 0 nada, 1 izquierda, 2 derecha). `roomCore.js` exige 6 elementos: para enviar más estado, usa bits nuevos en vez de alargar el array.
  - Bit 10, `FLAG.LOCK`: el jugador está rematando y es inmune. Los demás no pueden darle (`remotes.isImmune`, como con SHIELD, pero sin parpadeo).
  - Bit 11, `FLAG.SLIDE`: se está deslizando (ver Deslizamiento).
  - Bit 12, `FLAG.VAULT`: está trepando (ver Trepar).
  - El mensaje `hit` lleva `k`: con `k = 1` (puñalada rápida) la víctima ignora `dmg` y se queda con `STAB_LEFT` de vida, porque solo ella sabe cuánta le queda (`main.js`, manejador `hit`).

## Cosas que rompen fácilmente

- **Zonas de impacto ≠ malla.** Los impactos se calculan con cápsulas a partir de la pose (`raycast` en `remotePlayers.js` y en `enemies.js`), no con la geometría. Puedes cambiar el aspecto de los soldados, pero respeta las alturas de cadera (0,95), hombros y cabeza. No toques los huesos, `ARM_UP`/`ARM_FORE` ni `poseSoldier` sin revisar los raycast.
- **Asomarse: tres números enlazados.** La cámara local se aparta `LEAN_DIST` (0,38, `player.js`). El soldado remoto lo imita con `LEAN_HIP` (0,15) y `LEAN_SPINE` (0,42 rad) de `enemyModel.js`, porque la cabeza está a 0,57 m del pivote de la columna. Las cápsulas de `remotePlayers.raycast` usan esas mismas constantes. Si cambias uno, recalcula los otros y comprueba que la cápsula de la cabeza sigue centrada en la cabeza del modelo.
- **Deslizamiento: pose y cápsulas.** `SLIDE_HIP` y `SLIDE_BACK` (`enemyModel.js`) los usan a la vez la pose y `remotePlayers.raycast`. Deslizándose, la cápsula de las piernas va de la cadera al pie estirado, 0,8 m por delante. Si cambias la pose de las piernas, mueve también ese punto.
- **Teclas Q/E.** Son para asomarse. Q dejó de ser "arma anterior": las armas se cambian con la rueda y 1-2-3. V es el golpe rápido.
- **Golpe rápido: tiempos compartidos.** `TAKEDOWN_STAB` y `TAKEDOWN_TIME` (`enemyModel.js`) los usan a la vez la animación en primera persona (`weapon.js`), el bloqueo del jugador (`player.js`) y la pose de la víctima (IA y remotos). Cámbialos solo ahí. La pose de la víctima no toca las cápsulas de impacto porque solo se aplica a quien ya no recibe disparos.
- **Cobertura de La Solana y Muelle Norte.** Antes estos mapas devolvían `cover: []`. Ahora exponen sus nodos para la IA de supervivencia, filtrados igual que en Sector 7. En línea no se usan.
- **Supervivencia y misión comparten soldados.** `enemies.reset()` (al empezar la misión o volver al menú) los devuelve a todos a su patrulla con `off = false`, y `setMode` llama a `survival.stop()`, que quita `hunt`, `nav` y la dificultad. `useMap` cambia `enemies.col`/`cover`/`lights` al mapa en uso.
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
  - **Cambio de nombre**:
    - El repositorio pasó a llamarse `Hunter-X-10/Nightfall-X`, a juego con la web `nightfall-x.pages.dev`.
    - Se actualizaron el remoto de git, `CLAUDE.md`, `LICENSE` (`Alexus (Hunter-X-10)`) y el título del README (`NIGHTFALL-X`).
  - Commits de la sesión:
    - `0b7a70e`: resistencia y golpe rápido.
    - `160fc19`: repositorio nuevo en `CLAUDE.md` y `LICENSE`.
    - `7737eb4`: título del README.
- **Sesión del 14 de octubre de 2026 (segunda parte)**:
  - El usuario descartó la supresión, más bidones y el disparo a ciegas, y eligió las oleadas.
  - **Modo supervivencia**, con el diseño del usuario (detalles en Arquitectura):
    - Se elige entre los 3 mapas. En La Solana y Muelle Norte se empieza en el centro y los enemigos vienen de todos lados. En Sector 7 se empieza donde la misión y salen de la base (decisión de Claude, aceptada).
    - Oleadas infinitas: 4 enemigos y +3 por oleada, 8 a la vez como mucho.
    - 20 s de descanso con el fusil a 200 de reserva. Cada enemigo suelta 10 balas.
    - Puntuación (baja, cabeza, cuchillo y bonus por oleada) y récord por mapa.
    - Hizo falta la rejilla de navegación (`src/navgrid.js`): con la IA de la misión, los que salían del borde se quedaban empujando contra las paredes. También avanzan de cobertura en cobertura si están lejos.
    - El usuario lo probó y le gustó ("está perfecto el modo").
  - **Nombre NIGHTFALL-X dentro del juego**: menú, `<title>`, mensaje del servidor y comentarios de cabecera.
  - **Menú de inicio rediseñado**, a gusto del usuario:
    - Línea de estado con punto rojo, logo con "-X" en ámbar y entradas numeradas con descripción, con barra y brillo ámbar al pasar el ratón.
    - Controles como teclas, agrupados abajo (se añadió la V), y esquinas de visor.
    - Estilos en la sección "Menú principal" de `css/style.css`. El texto "JUGAR MISIÓN" ya no cambia al cargar: `main.js` rellena `.mi-desc`.
  - Commits: `933e8b6` (supervivencia, nombre y menú) y `32bc318` (esta documentación).
  - A petición del usuario, Claude pasa a figurar como coautor de los commits (ver Reglas del proyecto).
- **Sesión del 15 de octubre de 2026**:
  - El usuario dejó las mecánicas pendientes en cuatro (ver "Mecánicas pendientes") y descartó el resto.
  - **Deslizamiento** (detalles en Arquitectura). Primero solo se activaba pulsando agacharse en pleno sprint y al usuario le costaba. Lo quiso "parecido al Fortnite": margen de 0,4 s tras soltar el sprint y la pulsación recordada, también en el aire.
  - **Trepar** obstáculos bajos: los salta o se sube encima, con el mismo criterio permisivo.
  - El usuario probó las dos cosas en local y le gustaron.
- **Pendiente**:
  - Probar con gente real y latencia de internet.
  - Decidir si se suaviza la linterna de cerca (durante el golpe rápido ya se atenúa).
  - Pasar la pausa, la armería, las salas y la pantalla final al estilo del menú nuevo (se ofreció; siguen con los botones de antes).
  - Mecánicas que faltan: solo las cuatro de "Mecánicas pendientes". El siguiente bit libre de `flags` es el 13.

## Mecánicas pendientes

Hechas: **inclinarse con Q/E**, **cobertura libre**, **resistencia**, **golpe rápido con V**, **supervivencia por oleadas**, **deslizamiento** y **trepar** (ver Arquitectura).

El 15 de octubre de 2026 el usuario dejó la lista en estas cuatro, en este orden. Todo lo demás del brainstorming está descartado y no hay que volver a proponerlo: supresión, más bidones, disparo a ciegas, saltar y agarrarse, IA más lista, puertas y ventanas, cajas empujables y cobertura pegada al estilo Gears/Division.

| # | Mecánica | Tiempo | Dificultad | Qué hay que tocar |
|---|---|---|---|---|
| 1 | ~~Deslizamiento~~ (hecho el 15 de octubre) | 1-2 h | Baja-media | Sprint + agacharse da un impulso de ~0,8 s que decae. Baja la cámara y se puede disparar mientras dura. Gasta `player.stamina`. Necesita pose remota, cápsulas de impacto, un bit nuevo en `flags`, el arma ladeada y un sonido de roce. |
| 2 | ~~Trepar obstáculos bajos~~ (hecho el 15 de octubre) | 2-3 h | Media | Detectar delante un obstáculo de 1,2 m o menos (`colliders.js`) y subirlo con una animación corta. Gasta `player.stamina`. Necesita pose remota y otro bit. Cuidado con atravesar paredes o quedarse atascado encima. |
| 3 | Botiquines y chaleco | 2-3 h | Baja-media | Objetos recogibles por el mapa, una barra de armadura en el HUD y daño absorbido en `player.damage`. En línea la armadura es local porque la víctima ya aplica el daño. Lo delicado es sincronizar quién recoge cada objeto. |
| 4 | Granadas (de fragmentación, de humo y cegadora) | 5-8 h | Alta | Lanzamiento con rebotes, daño por radio con línea de visión, humo que tapa la vista de la IA, efecto de la cegadora, animación de lanzar, IA que huye y un mensaje de red nuevo. Reutiliza `particles.js`/`fxRecipes.js`. El daño funciona como con las balas: quien lanza decide y la víctima lo aplica. |

En la sesión del 15 de octubre se hacen el deslizamiento y trepar. Botiquines, chaleco y granadas quedan para otra sesión.

**Al implementarlas**:
- Cualquier pose nueva (deslizar, trepar) cambia las cápsulas de impacto de `remotePlayers.js` y `enemies.js`.
- El estado nuevo va en bits de `flags`, sin romper el protocolo (ver Red).
- Todo por código, sin recursos externos.
