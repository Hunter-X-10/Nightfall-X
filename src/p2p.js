// Partidas de navegador a navegador (WebRTC, con PeerJS), para cuando el juego se aloja como página
// estática y no hay servidor de salas. Quien crea la partida hace de anfitrión: su navegador lleva la
// sala (src/roomCore.js) y los demás se conectan directamente a él. El código de sala es el
// identificador con el que el anfitrión se anuncia en el servicio público de PeerJS, que sólo sirve
// para que los navegadores se encuentren: los datos de la partida no pasan por él.
import { createRooms, randomCode, SNAP_MS } from './roomCore.js';

const PREFIX = 'nightfall-sala-';
const CONNECT_MS = 15000;
const NO_BROKER = 'No se pudo conectar con el servicio de partidas';

let loading = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = import.meta.resolve('peerjs'); // la ruta está en el importmap de index.html
    s.onload = () => resolve(window.Peer);
    s.onerror = () => { loading = null; reject(new Error(NO_BROKER)); };
    document.head.appendChild(s);
  });
  return loading;
}

// Se da de alta en el servicio de PeerJS, con el identificador indicado o con uno cualquiera.
function openPeer(Peer, id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    const fail = (e) => { peer.destroy(); reject(e); };
    peer.once('error', fail);
    peer.once('open', () => { peer.off('error', fail); resolve(peer); });
  });
}

// Llama a fn cada `ms`. Desde un Worker, porque el navegador frena los temporizadores de una pestaña
// en segundo plano y el anfitrión dejaría de repartir posiciones al cambiar de ventana.
function ticker(fn, ms) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms})`], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    return () => { w.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }
}

// Crea una sala en este navegador y la anuncia. Devuelve el enlace del propio anfitrión con ella.
export async function hostLink(onMessage) {
  const Peer = await loadPeer();
  let peer = null; let code = '';
  for (let i = 0; i < 6 && !peer; i++) {
    code = randomCode();
    try { peer = await openPeer(Peer, PREFIX + code); } catch (e) { if (e.type !== 'unavailable-id') throw new Error(NO_BROKER); }
  }
  if (!peer) throw new Error(NO_BROKER);

  const rooms = createRooms({ fixedCode: code });
  let open = true;
  // El anfitrión habla con su sala sin pasar por la red; recibe una copia de cada mensaje, como los demás.
  const me = rooms.connect((msg) => { const copy = structuredClone(msg); queueMicrotask(() => { if (open) onMessage(copy); }); });

  peer.on('connection', (conn) => {
    const c = rooms.connect((msg) => { if (conn.open) conn.send(msg); });
    conn.on('data', (m) => rooms.message(c, m));
    conn.on('close', () => rooms.disconnect(c));
    conn.on('error', () => {});
  });
  // Si se cae el servicio de PeerJS la partida sigue, pero no podría entrar nadie más: se reintenta.
  peer.on('disconnected', () => setTimeout(() => { if (open && !peer.destroyed) peer.reconnect(); }, 2000));
  peer.on('error', () => {});
  const stopTick = ticker(rooms.tick, SNAP_MS);

  return {
    send: (msg) => rooms.message(me, msg),
    close() { open = false; stopTick(); rooms.disconnect(me); peer.destroy(); },
  };
}

// Se conecta a la sala que anuncia el anfitrión con ese código.
export async function guestLink(rawCode, onMessage, onClose) {
  const Peer = await loadPeer();
  const code = String(rawCode ?? '').trim().toUpperCase();
  let peer;
  try { peer = await openPeer(Peer); } catch { throw new Error(NO_BROKER); }

  return new Promise((resolve, reject) => {
    const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    let connected = false; let over = false;
    const end = (msg) => {
      if (over) return;
      over = true; clearTimeout(timer); peer.destroy();
      if (connected) onClose(); else reject(new Error(msg));
    };
    const timer = setTimeout(() => end('No se pudo conectar con el anfitrión: puede que su red o la tuya impidan las conexiones directas'), CONNECT_MS);
    peer.on('error', (e) => { if (!connected) end(e.type === 'peer-unavailable' ? 'No existe ninguna sala con ese código' : 'No se pudo conectar con el anfitrión'); });
    conn.on('open', () => {
      if (over) return;
      connected = true; clearTimeout(timer);
      resolve({
        send: (msg) => { if (conn.open) conn.send(msg); },
        close() { over = true; conn.close(); peer.destroy(); },
      });
    });
    conn.on('data', (m) => { if (!over) onMessage(m); });
    conn.on('close', () => end('No se pudo conectar con el anfitrión'));
    conn.on('error', () => {});
  });
}
