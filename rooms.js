// Salas multijugador sobre WebSocket (ruta /ws). La lógica de las salas está en src/roomCore.js, que
// también usa el navegador del anfitrión cuando el juego se aloja como página estática.
const { WebSocketServer } = require('ws');

const PING_MS = 15000;

// Un mismo mensaje suele ir a varios jugadores: se convierte a texto una sola vez.
let lastMsg = null;
let lastRaw = '';
const encode = (msg) => {
  if (msg !== lastMsg) { lastMsg = msg; lastRaw = JSON.stringify(msg); }
  return lastRaw;
};

// Engancha el servicio de salas a un servidor HTTP existente.
async function attachRooms(server) {
  const { createRooms, SNAP_MS } = await import('./src/roomCore.js');
  const rooms = createRooms();
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });

  wss.on('connection', (ws) => {
    const c = rooms.connect((msg) => { if (ws.readyState === 1) ws.send(encode(msg)); });
    c.alive = true;
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      rooms.message(c, m);
    });
    ws.on('pong', () => { c.alive = true; });
    ws.on('close', () => rooms.disconnect(c));
    ws.on('error', () => {});
    ws.client = c;
  });

  const snap = setInterval(rooms.tick, SNAP_MS);

  // Latido: descarta conexiones que se han caído sin cerrar.
  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      const c = ws.client;
      if (!c) continue;
      if (!c.alive) { ws.terminate(); continue; }
      c.alive = false;
      ws.ping();
    }
  }, PING_MS);

  wss.on('close', () => { clearInterval(snap); clearInterval(ping); });
  return wss;
}

module.exports = { attachRooms };
