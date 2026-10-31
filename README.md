<h1 align="center">NIGHTFALL-X</h1>

<p align="center">
  <b>Shooter en primera persona para el navegador</b><br>
  Misión en solitario, supervivencia por oleadas y partidas en línea por equipos. Sin instalar nada.
</p>

<p align="center">
  <a href="https://nightfall-x.pages.dev"><img src="https://img.shields.io/badge/%E2%96%B6%20JUGAR%20AHORA-nightfall--x.pages.dev-e8452c?style=for-the-badge" alt="Jugar ahora"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Three.js-WebGL-000000?logo=threedotjs&logoColor=white" alt="Three.js">
  <img src="https://img.shields.io/badge/online-de%20navegador%20a%20navegador-6fb6ff" alt="Online de navegador a navegador">
  <img src="https://img.shields.io/badge/alojado%20en-Cloudflare%20Pages-F38020?logo=cloudflarepages&logoColor=white" alt="Alojado en Cloudflare Pages">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-green" alt="Licencia MIT"></a>
</p>

<p align="center">
  <a href="#-cómo-se-juega">Cómo se juega</a> ·
  <a href="#-mapas">Mapas</a> ·
  <a href="#-armas">Armas</a> ·
  <a href="#-movimiento">Movimiento</a> ·
  <a href="#-progreso-skins-y-mercado-negro">Progreso</a> ·
  <a href="#-ajustes-de-la-partida">Ajustes</a> ·
  <a href="#-controles">Controles</a> ·
  <a href="#-cómo-está-hecho">Cómo está hecho</a>
</p>

![Sector 7: base militar de noche, bajo la lluvia](docs/sector7.jpg)

> Todo lo que se ve y se oye está **generado por código**: no hay ni un solo archivo de imagen, modelo 3D o sonido. Las texturas, los soldados, las armas, la lluvia, la nieve y los disparos se construyen al arrancar.

## 🚀 Jugar

El juego está publicado en **[nightfall-x.pages.dev](https://nightfall-x.pages.dev)**. Ábrelo en un ordenador con ratón y teclado, elige **Jugar misión**, **Supervivencia** o **Multijugador**, y a jugar.

Va mejor con auriculares y a pantalla completa (**F11**).

---

## 🎯 Cómo se juega

### Misión en solitario

Infíltrate de noche en una base abandonada, cruza el control de acceso y llega al terminal del almacén. Diez soldados patrullan, se cubren, se avisan entre ellos y te buscan si te oyen. El cuchillo no hace ruido: una puñalada por la espalda elimina a un guardia sin alertar al resto.

### Supervivencia

Oleadas sin fin en cualquiera de los tres mapas. La primera trae 4 soldados y cada una suma 3 más, con un máximo de 8 a la vez; cada oleada apuntan mejor y reaccionan antes. Te buscan por todo el mapa y rodean los edificios para llegar a ti.

- Cada baja suelta una caja de munición (+10 balas de fusil al pasar por encima).
- Al superar una oleada: vida y chaleco al máximo, munición repuesta y 20 segundos de descanso.
- Puntos por baja, por disparo a la cabeza, por cuchillo y por oleada. Se guarda el récord de cada mapa.

### Partidas en línea por equipos

Dos equipos, **ALFA** y **BRAVO**, se enfrentan hasta que uno alcanza el número de bajas acordado.

1. Pulsa **Multijugador**, escribe tu nombre y **crea una partida**.
2. Comparte el **código de 4 letras** o el enlace de invitación.
3. Los demás se unen, eligen equipo y el anfitrión inicia la partida.

![Sala de espera con los equipos y los ajustes de la partida](docs/sala.jpg)

Quien llega tarde puede entrar con la partida empezada. Al terminar se vuelve a la sala y el anfitrión puede lanzar la revancha.

#### Cofres y botín

En línea **la vida no se recupera sola**: hay que curarse con lo que se encuentra.

- Por el mapa hay cofres (uno por jugador, como mínimo 6), en sitios distintos cada partida. Se abren con **F** y sueltan de 1 a 3 objetos que ven todos; se rellenan al minuto.
- **Vendas**: +50 de vida en 2,5 s. **Botiquín**: vida entera en 5 s. Se llevan 2 de cada como mucho, en los huecos **4** y **5**, y se usan con un clic.
- **Chaleco**: 50 puntos de armadura que se llevan el daño antes que la vida. Se pone solo al cogerlo.
- Quien muere deja vendas o un chaleco. Lo que nadie recoge desaparece a los 2 minutos.

> [!NOTE]
> La partida corre en el navegador de quien la crea, y los demás se conectan directamente a él.
> - Si el anfitrión cierra la pestaña, la partida termina para todos.
> - Algunas redes (ciertas wifis de empresa o de universidad, algunos móviles) impiden las conexiones directas; quien esté en una puede no lograr entrar.

---

## 🧭 Mapas

Los tres tienen el mismo tamaño (unos 96 × 80 m), cada uno se juega distinto y todos valen para la supervivencia y para las partidas en línea.

| | Mapa | Ambiente | Cómo se juega |
|---|---|---|---|
| <img src="docs/sector7.jpg" width="260" alt="Sector 7"> | **Sector 7** | Base militar, noche de tormenta | El mapa de la misión. Patio de contenedores y almacén; la luz la ponen las farolas y tu linterna. |
| <img src="docs/la-solana.jpg" width="260" alt="La Solana"> | **La Solana** | Depósito en el desierto, atardecer | Simétrico, con tres carriles: contenedores al norte, una nave que se cruza por dentro y una explanada abierta al sur para tiros largos. |
| <img src="docs/muelle-norte.jpg" width="260" alt="Muelle Norte"> | **Muelle Norte** | Puerto bajo la nevada, niebla cerrada | No se ve a más de 40 m. Calles entre hileras de contenedores y un muelle con grúas pórtico y un carguero atracado. |

---

## 🔫 Armas

Se cambia con **1**, **2** y **3** o con la rueda del ratón. En línea, **4** y **5** sacan las vendas y el botiquín.

| Arma | Funcionamiento | Daño entre jugadores |
|---|---|---|
| **Fusil** MK-18 | Automático, 30 balas | 26 al torso |
| **Pistola** P22 | Un disparo por clic, 12 balas | 17 al torso |
| **Cuchillo** | Tajo a 2 m; corres un 12 % más rápido | 55 de frente · **mortal por la espalda** |

Con las armas de fuego, un disparo a la cabeza hace más del doble de daño y uno a las piernas algo menos. Cada jugador tiene 100 de vida. En la misión y en supervivencia se recupera sola al cabo de unos segundos sin recibir daño y se empieza con chaleco; en línea, no (ver [Cofres y botín](#cofres-y-botín)).

### Golpe rápido con cuchillo (V)

Con cualquier arma en la mano, si tienes un rival a menos de 2 m **de lado o de espaldas** aparece el aviso `V CUCHILLO`. Al pulsar **V**, al azar:

- **Remate** (2 de cada 3): mortal. La cámara se coloca detrás de la víctima y eres inmune durante la animación (1,2 s).
- **Puñalada** (1 de cada 3): deja al rival con 30 de vida, o lo mata si tenía menos. El chaleco no la para.

![Partida en curso: marcador, registro de bajas y tabla de jugadores](docs/partida.jpg)

---

## 🏃 Movimiento

- **Resistencia**: el sprint dura unos 5 segundos. Si la agotas, no puedes volver a esprintar hasta recuperar un 30 %. La barra fina bajo la vida solo aparece cuando no está llena.
- **Deslizamiento**: agáchate mientras esprintas (vale hasta un instante después de soltar Shift, y también al aterrizar de un salto). Recorre unos 3 m y se puede disparar mientras dura.
- **Trepar**: pulsa Espacio frente a un obstáculo bajo (de 0,4 a 1,25 m). Si es estrecho, lo saltas al otro lado; si no, te subes encima.
- **Cobertura**: agáchate junto a algo que te tape al menos hasta la cadera y quedas a cubierto. Desde ahí, **Q** y **E** asoman la cabeza a cada lado. Tras una cobertura baja, apuntar te levanta para disparar por encima.

---

## 🏅 Progreso, skins y Mercado Negro

- **Niveles**: ganas XP con cada baja (más por disparo a la cabeza o con cuchillo), cada oleada superada, la misión completada y cada partida en línea. Hay 25 niveles, que se alcanzan en una hora y media de juego más o menos.
- **Recompensas**: cada nivel da un alijo y 100 monedas, y cada baja da 5 monedas. Los niveles 4, 8, 12, 16, 20 y 24 desbloquean un llavero.
- **Prestigio**: en el nivel 25 puedes volver al 1 con una estrella (hasta X) sin perder nada de lo conseguido. Tu nivel y tu estrella se ven junto a tu nombre en la sala y en el marcador.
- **Mercado Negro**: abre los alijos con una ruleta. Cada uno da una skin para el fusil o la pistola: hay 21, de común a mítica. Si ya tenías la que sale, se cambia por monedas. Un alijo cuesta 250 monedas.
- **Armería**: elige la skin y los llaveros de cada arma. Lo que aún no tienes sale apagado.

> [!NOTE]
> El progreso se guarda en el navegador de cada dispositivo, sin cuentas. Si borras los datos del sitio o juegas en incógnito, se pierde. Por ahora, las skins y los llaveros solo los ves tú.

---

## 🔧 Ajustes de la partida

Los decide el anfitrión en la sala, antes de empezar.

| Ajuste | Opciones |
|---|---|
| Mapa | Sector 7, La Solana o Muelle Norte |
| Bajas para ganar | De 5 a 100 |
| Tiempo límite | Sin límite, o de 5 a 30 minutos (al agotarse gana quien vaya por delante; igualados, empate) |
| Jugadores por equipo | De 1 contra 1 a 6 contra 6 |
| Reaparición | De 1 a 12 segundos |
| Armas | Todas, pistola y cuchillo, o solo cuchillo |
| Fuego amigo | Sí o no |

Durante la partida el nombre de tus compañeros se ve siempre sobre su cabeza; el de un rival solo aparece mientras le apuntas. Al reaparecer tienes unos segundos de protección, que se pierden si disparas.

---

## 🎮 Controles

| Tecla | Acción |
|---|---|
| **W A S D** | Moverse |
| **Ratón** | Mirar |
| **Clic izquierdo** | Disparar o dar un tajo |
| **Clic derecho** | Apuntar |
| **R** | Recargar |
| **1 · 2 · 3** | Fusil, pistola, cuchillo |
| **4 · 5** | Vendas y botiquín (en línea) |
| **Rueda** | Cambiar de arma |
| **V** | Golpe rápido con cuchillo |
| **Shift** | Esprintar |
| **Ctrl / C** | Agacharse (esprintando: deslizarse) |
| **Espacio** | Saltar (frente a un obstáculo bajo: trepar) |
| **Q · E** | Asomarse a cubierto |
| **F** | Linterna · abrir cofres y recoger objetos |
| **Tab** | Tabla de jugadores (en línea) |
| **Esc** | Pausa o menú |

---

## 💻 Cómo está hecho

- **[Three.js](https://threejs.org)** sobre WebGL, sin paso de compilación: el navegador carga los módulos tal cual.
- **Sin recursos externos**: texturas, modelos y sonidos se generan por código al arrancar.
- **En línea de navegador a navegador**: el navegador del anfitrión lleva la sala y los demás se conectan directamente a él por WebRTC, con [PeerJS](https://peerjs.com). No hay servidor de partidas.
- **Red sencilla a propósito**: quien dispara decide si acierta, según lo que ve en su pantalla; la víctima aplica el daño y avisa de su muerte; la sala solo reparte posiciones, lleva el marcador y decide cuándo acaba la partida.

```
index.html, css/   página, menús y HUD
src/
  main.js          arranque, estados del juego y bucle principal
  maps.js          catálogo de mapas
  world/           un archivo por mapa, más las piezas comunes (vehículos, contenedores…)
  player.js        movimiento, resistencia, cobertura, deslizamiento y trepar
  weapon.js        las armas, las vendas y el botiquín
  combat.js        daño, bajas y bidones explosivos
  survival.js      modo supervivencia por oleadas
  loot.js          cofres y objetos (lootWorld.js los dibuja)
  progress.js      XP, niveles, prestigio, monedas y alijos
  profile.js       perfil del jugador guardado en el navegador
  skins.js         skins procedurales (skinPaint.js las pinta)
  armory.js        armería: skins y llaveros
  market.js        Mercado Negro: ruleta de alijos
  roomCore.js      salas, equipos, marcador, ajustes y botín
  net.js           conexión con la sala
  p2p.js           conexión directa entre navegadores
  remotePlayers.js los demás jugadores en pantalla
  enemies.js       inteligencia de los soldados (navgrid.js: rutas en supervivencia)
server.js          servidor para jugar en local
tools/             pruebas automáticas
```

Para añadir un mapa: un archivo nuevo en `src/world/`, una línea en `src/maps.js` y subir `MAP_COUNT` en `src/roomCore.js`.

<details>
<summary><b>Ejecutarlo en tu ordenador</b></summary>

<br>

Hace falta [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm start
```

Abre **http://localhost:5173**. En Windows también vale con hacer doble clic en `start.bat`.

Para jugar con gente de tu misma red wifi:

```bash
npm run lan
```

El servidor mostrará la dirección que deben abrir los demás.

</details>

<details>
<summary><b>Pruebas automáticas</b></summary>

<br>

Necesitan Google Chrome instalado en Windows en su ruta habitual.

```bash
npm run test:online
```

Abre dos navegadores y un tercer jugador simulado, y juega partidas completas en los tres mapas: crear sala, unirse, disparar, morir, reaparecer, cambiar ajustes y terminar.

```bash
npm run test:p2p
```

Juega una partida con tres navegadores conectados directamente entre sí, como en la versión publicada. Necesita internet.

</details>

---

## 📌 Estado del proyecto

Funciona y está comprobado con pruebas automáticas, pero conviene saber dónde están los límites:

- **Todavía no se ha jugado con muchas personas reales.** Las pruebas se han hecho en un solo ordenador.
- **No hay protección contra trampas.** Está pensado para jugar entre conocidos.
- La primera vez que se carga un mapa hay una pausa de unos segundos.
- Los valores de daño, tiempos y el diseño de los mapas nuevos son un punto de partida, pendiente de ajustar jugando.
- Pide una tarjeta gráfica decente; la calidad se ajusta sola si el equipo no llega.

---

## 📄 Licencia

[MIT](LICENSE) © 2026 Hunter-X.

Puedes usar, copiar, modificar y distribuir este proyecto, también con fines comerciales, siempre que conserves el aviso de autoría y la licencia. Se ofrece tal cual, sin garantías.
