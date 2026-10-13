

# NIGHTFALL

**Shooter en primera persona para el navegador**, con una misión en solitario y partidas en línea por equipos. No hay nada que instalar para jugar: se abre una dirección web y listo.

![Sector 7: base militar de noche, bajo la lluvia](docs/sector7.jpg)

Todo lo que se ve y se oye está generado por código: no hay ni un solo archivo de imagen, modelo 3D o sonido. Las texturas, los soldados, las armas, la lluvia, la nieve y los disparos se construyen al arrancar.

---

## Cómo se juega

### Misión en solitario

Infíltrate de noche en una base abandonada, cruza el control de acceso y llega al terminal del almacén. Diez soldados patrullan, se cubren, se avisan entre ellos y te buscan si te oyen. El cuchillo no hace ruido: una puñalada por la espalda elimina a un guardia sin alertar al resto.

### Partidas en línea por equipos

Dos equipos, **ALFA** y **BRAVO**, se enfrentan hasta que uno alcanza el número de bajas acordado.

1. Pulsa **Multijugador**, escribe tu nombre y **crea una partida**.
2. Comparte el **código de 4 letras** o el enlace de invitación.
3. Los demás se unen, eligen equipo y el anfitrión inicia la partida.

![Sala de espera con los equipos y los ajustes de la partida](docs/sala.jpg)

Quien llega tarde puede entrar con la partida empezada. Al terminar se vuelve a la sala y el anfitrión puede lanzar la revancha.

---

## Mapas

Los tres tienen el mismo tamaño (unos 96 × 80 m) y cada uno se juega distinto.

| | Mapa | Ambiente | Cómo se juega |
|---|---|---|---|
| <img src="docs/sector7.jpg" width="260" alt="Sector 7"> | **Sector 7** | Base militar, noche de tormenta | El mapa de la misión. Patio de contenedores y almacén; la luz la ponen las farolas y tu linterna. |
| <img src="docs/la-solana.jpg" width="260" alt="La Solana"> | **La Solana** | Depósito en el desierto, atardecer | Simétrico, con tres carriles: contenedores al norte, una nave que se cruza por dentro y una explanada abierta al sur para tiros largos. |
| <img src="docs/muelle-norte.jpg" width="260" alt="Muelle Norte"> | **Muelle Norte** | Puerto bajo la nevada, niebla cerrada | No se ve a más de 40 m. Calles entre hileras de contenedores y un muelle con grúas pórtico y un carguero atracado. |

---

## Armas

Se cambia con **1**, **2** y **3**, con la rueda del ratón o con **Q** (vuelve a la anterior).

| Arma | Funcionamiento | Daño entre jugadores |
|---|---|---|
| **Fusil** MK-18 | Automático, 30 balas | 26 al torso |
| **Pistola** P22 | Un disparo por clic, 12 balas | 17 al torso |
| **Cuchillo** | Tajo a 2 m; corres un 12 % más rápido | 55 de frente · **mortal por la espalda** |

Con las armas de fuego, un disparo a la cabeza hace más del doble de daño y uno a las piernas algo menos. Cada jugador tiene 100 de vida, que se recupera sola al cabo de unos segundos sin recibir daño.

![Partida en curso: marcador, registro de bajas y tabla de jugadores](docs/partida.jpg)

---

## Ajustes de la partida

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

## Controles

| Tecla | Acción |
|---|---|
| **W A S D** | Moverse |
| **Ratón** | Mirar |
| **Clic izquierdo** | Disparar o dar un tajo |
| **Clic derecho** | Apuntar |
| **R** | Recargar |
| **1 · 2 · 3** | Fusil, pistola, cuchillo |
| **Rueda / Q** | Cambiar de arma |
| **Shift** | Esprintar |
| **Ctrl / C** | Agacharse |
| **Espacio** | Saltar |
| **F** | Linterna |
| **Tab** | Tabla de jugadores (en línea) |
| **Esc** | Pausa o menú |

Se recomienda jugar con auriculares y a pantalla completa (F11).

---

## Ejecutarlo en tu ordenador

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

---

## Publicarlo en internet

Hay dos maneras, y el juego es el mismo en las dos:

| | Página estática | Con servidor |
|---|---|---|
| Dónde | Netlify, Vercel, GitHub Pages… | Raspberry Pi, contenedor, Render… |
| Quién lleva la sala | El navegador del anfitrión | El servidor |
| Si el anfitrión se va | Se acaba la partida | La sala sigue con los demás |
| Conexión | Directa entre jugadores (WebRTC) | Todos contra el servidor (WebSocket) |

### Como página estática (Netlify, Vercel…)

No hace falta servidor: quien crea la partida hace de anfitrión y los demás se conectan directamente a su navegador. Para encontrarse usan el servicio público y gratuito de [PeerJS](https://peerjs.com); los datos de la partida no pasan por él.

```bash
npm install
npm run build
```

Eso deja en `dist/` todo lo que hay que subir (unos 3 MB). Tres formas de publicarlo:

- **Arrastrando la carpeta**: abre [app.netlify.com/drop](https://app.netlify.com/drop) y suelta `dist/`.
- **Netlify conectado al repositorio**: *Add new site → Import an existing project*. La configuración ya está en `netlify.toml`; cada `git push` vuelve a publicar.
- **Vercel**: *Add New → Project* e importa el repositorio. La configuración está en `vercel.json`.

A tener en cuenta:

- La partida corre en el navegador del anfitrión: si cierra la pestaña, termina para todos, y su conexión marca el retraso de los demás.
- Algunas redes (ciertas wifis de empresa o de universidad, algunos móviles) impiden las conexiones directas; quien esté en una puede no lograr entrar.

### Con servidor

Hace falta un alojamiento que **ejecute Node y admita WebSockets**. El repositorio viene preparado de dos formas:

- **`Dockerfile`**, para cualquier alojamiento de contenedores, como [Back4app Containers](https://www.back4app.com/container-as-a-service-caas): se conecta el repositorio y el servicio construye y arranca la imagen. El servidor escucha en el puerto 7860 y gasta muy poca memoria (unos 16 MB en reposo).
- **`render.yaml`**, para [Render](https://render.com), creando un *Blueprint* a partir del repositorio.

En ambos casos el servidor acepta conexiones de fuera automáticamente y el alojamiento da una dirección `https`.

```bash
docker build -t nightfall .
docker run -p 7860:7860 nightfall
```

### En una Raspberry Pi con Tailscale Funnel

Gratis, con dirección `https` fija (`https://equipo.tu-red.ts.net`) y sin abrir puertos del router. Requiere Tailscale en la Pi y Funnel activado en tu red (*Access controls* y *DNS → HTTPS Certificates* en el panel de Tailscale).

```bash
docker compose up -d --build
tailscale funnel --bg 7860
```

El juego sólo escucha en `127.0.0.1:7860` de la Pi y Funnel lo publica. `tailscale funnel status` muestra la dirección.

### En una Raspberry Pi con Cloudflare Tunnel

Sin coste mensual y sin abrir puertos del router: el juego corre en tu Raspberry Pi y Cloudflare lo publica en tu dominio con `https` (los WebSockets funcionan sin configurar nada).

1. En [Cloudflare Zero Trust](https://one.dash.cloudflare.com) crea un túnel (*Networks → Tunnels → Create*), tipo *Cloudflared*, y copia su token.
2. En el túnel añade un *Public Hostname*, por ejemplo `nightfall.tudominio.com`, con servicio `HTTP` y URL `nightfall:7860`.
3. En la Raspberry Pi (con Docker y Docker Compose instalados):

```bash
git clone <este repositorio> && cd <carpeta>
echo "TUNNEL_TOKEN=pega_aquí_el_token" > .env
docker compose --profile cloudflare up -d --build
```

Las imágenes de Node y de `cloudflared` son multiarquitectura, así que sirven en una Pi de 64 bits. El dominio tiene que estar gestionado por Cloudflare.

A tener en cuenta:

- Las salas viven en la memoria del servidor: debe haber **una sola instancia**, y si se reinicia se cortan las partidas en curso.
- Los planes gratuitos suelen dormir el servidor cuando nadie lo usa; el primero que entra espera a que despierte.

---

## Cómo está hecho

- **[Three.js](https://threejs.org)** sobre WebGL, sin paso de compilación: el navegador carga los módulos tal cual.
- **Servidor mínimo** en Node: `server.js` sirve los archivos y `rooms.js` lleva las salas por WebSocket. Su única dependencia es `ws`.
- **Las salas funcionan igual con servidor que sin él**: su lógica (`src/roomCore.js`) no sabe por dónde llegan los mensajes. La ejecuta el servidor o, en la versión estática, el navegador del anfitrión, al que los demás se conectan con [PeerJS](https://peerjs.com).
- **Red sencilla a propósito**: quien dispara decide si acierta, según lo que ve en su pantalla; la víctima aplica el daño y avisa de su muerte; la sala solo reparte posiciones, lleva el marcador y decide cuándo acaba la partida.

```
server.js          servidor web
rooms.js           salas por WebSocket
index.html, css/   página, menús y HUD
src/
  main.js          arranque, estados del juego y bucle principal
  maps.js          catálogo de mapas
  world/           un archivo por mapa, más las piezas comunes (vehículos, contenedores…)
  weapon.js        las tres armas
  combat.js        daño, bajas y bidones explosivos
  roomCore.js      salas, equipos, marcador y ajustes
  net.js           conexión con la sala
  p2p.js           conexión directa entre navegadores, sin servidor
  remotePlayers.js los demás jugadores en pantalla
  enemies.js       inteligencia de los soldados de la misión
tools/             pruebas automáticas y build.mjs, que prepara dist/
```

Para añadir un mapa: un archivo nuevo en `src/world/`, una línea en `src/maps.js` y subir `MAP_COUNT` en `src/roomCore.js`.

### Pruebas

```bash
npm run test:online
```

Abre dos navegadores y un tercer jugador simulado, y juega partidas completas en los tres mapas: crear sala, unirse, disparar, morir, reaparecer, cambiar ajustes y terminar. Necesita Google Chrome instalado en Windows en su ruta habitual.

```bash
npm run test:p2p
```

Construye `dist/`, la sirve como simples archivos y juega una partida con tres navegadores conectados directamente entre sí. Necesita internet.

---

## Estado del proyecto

Funciona y está comprobado con pruebas automáticas, pero conviene saber dónde están los límites:

- **Todavía no se ha jugado con muchas personas reales ni por internet.** Las pruebas se han hecho en un solo ordenador, también las de la conexión directa entre navegadores.
- **No hay protección contra trampas.** Está pensado para jugar entre conocidos.
- La primera vez que se carga un mapa hay una pausa de unos segundos.
- Los valores de daño, tiempos y el diseño de los mapas nuevos son un punto de partida, pendiente de ajustar jugando.
- Pide una tarjeta gráfica decente; la calidad se ajusta sola si el equipo no llega.

---

## Licencia

[MIT](LICENSE) © 2026 Alexus.

Puedes usar, copiar, modificar y distribuir este proyecto, también con fines comerciales, siempre que conserves el aviso de autoría y la licencia. Se ofrece tal cual, sin garantías.
