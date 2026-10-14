// Cliente de red: habla con la sala (ver src/roomCore.js). Si el juego lo sirve server.js, la sala está
// en el servidor y se llega a ella por WebSocket; si está en un alojamiento estático, la lleva el
// navegador del anfitrión y se llega directamente a él (ver src/p2p.js).
import { hostLink, guestLink } from './p2p.js';

export const TEAMS = ['ALFA', 'BRAVO'];
export const TEAM_COLORS = ['#6fb6ff', '#ff7a5c'];

// Bits de estado que acompañan a la posición de cada jugador. DEAD lo fija el servidor.
export const FLAG = { CROUCH: 1, SPRINT: 2, AIM: 4, LIGHT: 8, DEAD: 16, SHIELD: 32 };
export const WEAPON_SHIFT = 6; // los bits 6 y 7 llevan el arma en mano (índice de WEAPONS)
export const LEAN_SHIFT = 8; // los bits 8 y 9, hacia dónde se asoma: 0 nada, 1 izquierda, 2 derecha
// Zona del cuerpo alcanzada por un disparo.
export const PART = { TORSO: 0, HEAD: 1, LEGS: 2 };

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// Dónde está la sala: 'servidor' (lo normal con server.js) o 'p2p'. La versión para alojamiento estático
// (tools/build.mjs) lo deja escrito en la página; para probar, se puede forzar con ?red=p2p o ?red=servidor.
const MODE = new URLSearchParams(location.search).get('red') || document.querySelector('meta[name="nightfall-red"]')?.content || 'servidor';

function serverLink(onMessage, onClose) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => resolve({
      send: (msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); },
      close: () => ws.close(),
    });
    ws.onerror = () => reject(new Error('No se pudo conectar con el servidor'));
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      onMessage(m);
    };
    ws.onclose = onClose;
  });
}

export class Net {
  constructor() {
    this.link = null; // conexión con la sala: { send(msg), close() }
    this.direct = false; // true si la sala la lleva el navegador del anfitrión
    this.id = 0;
    // { code, host, phase, settings: { goal, ff }, score: [alfa, bravo], players: [{ id, name, team, playing, k, d }] }
    this.room = null;
    // joined(), room(), start(msg), snap(list), hit(msg), kill(msg), fire(id, datos), barrel(i, by), end(msg), error(msg), close(aviso)
    this.handlers = {};
  }

  get me() { return this.room ? this.room.players.find((p) => p.id === this.id) : null; }
  get isHost() { return !!this.room && this.room.host === this.id; }

  // Abre la conexión con la sala. `code` es el de la sala a la que se quiere entrar (vacío para crear una).
  async open(code = '') {
    this.direct = MODE === 'p2p';
    if (!this.direct && this.link) return;
    this.leave();
    const link = {}; // se rellena al conectar; antes sirve para saber si esta conexión sigue siendo la vigente
    this.link = link;
    const onMessage = (m) => { if (this.link === link) this.receive(m); };
    const onClose = () => {
      if (this.link !== link) return; // cierre de una conexión ya sustituida o abandonada a propósito
      const wasIn = !!this.room;
      this.link = null; this.room = null; this.id = 0;
      if (wasIn) this.handlers.close?.(`Se perdió la conexión con el ${this.direct ? 'anfitrión' : 'servidor'}`);
    };
    let made;
    try {
      made = await (!this.direct ? serverLink(onMessage, onClose) : code ? guestLink(code, onMessage, onClose) : hostLink(onMessage));
    } catch (e) {
      if (this.link === link) this.link = null;
      throw e;
    }
    if (this.link !== link) { made.close(); throw new Error('Conexión cancelada'); }
    Object.assign(link, made);
  }

  receive(m) {
    const h = this.handlers;
    switch (m.t) {
      case 'snap': h.snap?.(m.d); break;
      case 'f': h.fire?.(m.id, m.d); break;
      case 'hit': h.hit?.(m); break;
      case 'kill': h.kill?.(m); break;
      case 'bar': h.barrel?.(m.i, m.by); break;
      case 'joined': this.id = m.id; this.room = m.room; h.joined?.(); break;
      case 'room': this.room = m.room; h.room?.(); break;
      case 'start': this.room = m.room; h.start?.(m); break;
      case 'end': h.end?.(m); break;
      case 'error': h.error?.(m.msg); break;
      default:
    }
  }

  send(msg) { this.link?.send?.(msg); }

  async create(name) { await this.open(); this.send({ t: 'create', name }); }
  async join(code, name) { await this.open(code); this.send({ t: 'join', code, name }); }
  setTeam(team) { this.send({ t: 'team', team }); }
  set(settings) { this.send({ t: 'set', s: settings }); }
  enter() { this.send({ t: 'enter' }); }

  sendState(x, y, z, yaw, pitch, flags) {
    this.send({ t: 's', d: [r2(x), r2(y), r2(z), r3(yaw), r3(pitch), flags] });
  }

  // Disparo propio, de `o` a `e`. kind: 0 = al mundo o al aire, 1 = ha alcanzado a un jugador.
  fire(o, e, kind) { this.send({ t: 'f', d: [r2(o.x), r2(o.y), r2(o.z), r2(e.x), r2(e.y), r2(e.z), kind] }); }
  // w: arma (índice de WEAPONS) con la que se ha hecho el daño.
  hit(to, dmg, part, w) { this.send({ t: 'hit', to, dmg: r2(dmg), part, w }); }
  died(by, part, w) { this.send({ t: 'died', by, part, w }); }
  spawned() { this.send({ t: 'spawn' }); }
  barrel(i, by) { this.send({ t: 'bar', i, by }); }

  // Abandona la sala a propósito (no dispara el aviso de conexión perdida).
  leave() {
    const link = this.link;
    this.link = null; this.room = null; this.id = 0;
    link?.close?.();
  }
}
