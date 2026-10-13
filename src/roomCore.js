// Lógica de las salas multijugador: código de sala, jugadores por equipo, retransmisión de posiciones
// y disparos, y marcador de la partida por equipos.
// No sabe nada del transporte: lo mismo lo usa el servidor (rooms.js, por WebSocket) que el navegador
// del anfitrión cuando el juego se aloja como página estática (src/p2p.js, de navegador a navegador).
// La sala no simula nada: quien dispara decide el impacto, la víctima aplica el daño y avisa de su
// muerte, y la sala lleva la cuenta de bajas y decide cuándo termina la partida.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0 ni I/1 para dictar el código sin errores
const CODE_LEN = 4;
const MAX_TEAM = 6; // jugadores por equipo, como mucho
export const MAP_COUNT = 3; // mapas disponibles (ver src/maps.js)
export const SNAP_MS = 50;
const DEAD = 16; // bit de "abatido" en el estado de cada jugador (ver FLAG en src/net.js)
// Ajustes de la partida, que fija el anfitrión en la sala de espera:
//   goal: bajas para ganar · time: límite en minutos (0 = sin límite) · teamSize: jugadores por equipo
//   respawn: segundos para reaparecer · weapons: 0 todas, 1 pistola y cuchillo, 2 sólo cuchillo · ff: fuego amigo
//   map: índice del mapa
const DEFAULTS = { map: 0, goal: 20, time: 0, teamSize: MAX_TEAM, respawn: 3, weapons: 0, ff: false };
const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const weaponId = (w) => (w === 1 || w === 2 ? w : 0); // 0 fusil, 1 pistola, 2 cuchillo

export function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

// Crea un servicio de salas. Con `fixedCode` lleva una única sala con ese código (la del anfitrión).
// Cada conexión se da de alta con connect(send), donde send(msg) entrega un mensaje a ese jugador.
export function createRooms({ fixedCode = '' } = {}) {
  const rooms = new Map();
  let nextId = 1;

  const send = (c, msg) => c.send(msg);
  const fail = (c, msg) => send(c, { t: 'error', msg });

  // Envía un mensaje a todos los que están jugando en la sala (salvo `except`).
  function relay(room, msg, except = null) {
    for (const p of room.players.values()) if (p.playing && p !== except) p.send(msg);
  }

  function newCode() {
    for (;;) {
      const code = randomCode();
      if (!rooms.has(code)) return code;
    }
  }

  function roomInfo(room) {
    return {
      code: room.code, host: room.host, phase: room.phase, settings: room.settings, score: room.score,
      left: room.endsAt ? Math.max(0, room.endsAt - Date.now()) : 0, // ms que quedan de partida (0 = sin límite)
      players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, playing: p.playing, k: p.k, d: p.d })),
    };
  }

  function broadcastRoom(room) {
    const msg = { t: 'room', room: roomInfo(room) };
    for (const p of room.players.values()) send(p, msg);
  }

  // Nombre limpio y único dentro de la sala (es lo que identifica al jugador en pantalla).
  function cleanName(raw, room) {
    const base = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Operador';
    const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 13)} ${n}`;
    return name;
  }

  function resetPlayer(c, playing) {
    c.playing = playing; c.state = null; c.dead = false; c.k = 0; c.d = 0;
  }

  function teamCounts(room) {
    const count = [0, 0];
    for (const p of room.players.values()) count[p.team]++;
    return count;
  }

  function joinRoom(c, room, rawName) {
    const count = teamCounts(room);
    c.name = cleanName(rawName, room);
    c.team = count[1] < count[0] ? 1 : 0; // al equipo con menos gente
    c.room = room;
    resetPlayer(c, false);
    room.players.set(c.id, c);
    send(c, { t: 'joined', id: c.id, room: roomInfo(room) });
    broadcastRoom(room);
  }

  function leaveRoom(c) {
    const room = c.room;
    if (!room) return;
    c.room = null; c.playing = false; c.state = null;
    room.players.delete(c.id);
    if (room.players.size === 0) { rooms.delete(room.code); return; }
    if (room.host === c.id) room.host = room.players.keys().next().value;
    broadcastRoom(room);
  }

  // Fin de partida: se envía el resultado a quienes jugaban y la sala vuelve a la espera.
  // winner: equipo ganador, o -1 si se acaba el tiempo con empate.
  function endMatch(room, winner) {
    room.endsAt = 0;
    relay(room, { t: 'end', winner, room: roomInfo(room) });
    room.phase = 'lobby';
    for (const p of room.players.values()) { p.playing = false; p.state = null; p.dead = false; }
    broadcastRoom(room);
  }

  function message(c, m) {
    if (!m || typeof m !== 'object') return;
    const room = c.room;

    switch (m.t) {
      case 's': // estado propio: [x, y, z, yaw, pitch, flags]
        if (room && c.playing && Array.isArray(m.d) && m.d.length === 6 && m.d.every(Number.isFinite)) c.state = m.d;
        break;
      case 'f': // disparo: [ox, oy, oz, ex, ey, ez, tipo]; los demás lo dibujan y lo oyen
        if (room && c.playing && !c.dead && Array.isArray(m.d) && m.d.length === 7 && m.d.every(Number.isFinite)) relay(room, { t: 'f', id: c.id, d: m.d }, c);
        break;
      case 'hit': { // impacto decidido por quien dispara; la víctima aplica el daño
        if (!room || !c.playing || c.dead || !Number.isFinite(m.dmg)) return;
        const v = room.players.get(m.to);
        if (!v || v === c || !v.playing || v.dead) return;
        if (v.team === c.team && !room.settings.ff) return;
        send(v, { t: 'hit', by: c.id, dmg: Math.min(200, Math.max(0, m.dmg)), part: m.part === 1 || m.part === 2 ? m.part : 0, w: weaponId(m.w) });
        break;
      }
      case 'died': { // la víctima avisa de su muerte y de quién la causó (0 = nadie: caída, explosión propia…)
        if (!room || !c.playing || c.dead || room.phase !== 'playing') return;
        c.dead = true; c.d++;
        const k = room.players.get(m.by);
        const killer = k && k !== c && k.playing ? k : null;
        if (killer) {
          const enemy = killer.team !== c.team;
          killer.k += enemy ? 1 : -1; // matar a un compañero resta
          if (enemy) room.score[killer.team]++;
        }
        relay(room, { t: 'kill', by: killer ? killer.id : 0, id: c.id, head: m.part === 1, w: weaponId(m.w) });
        const winner = room.score.findIndex((s) => s >= room.settings.goal);
        if (winner >= 0) endMatch(room, winner); else broadcastRoom(room);
        break;
      }
      case 'spawn': // la víctima ha reaparecido
        if (room && c.playing) c.dead = false;
        break;
      case 'bar': // bidón explosivo reventado (índice); solo cuenta el primer aviso
        if (!room || !c.playing || !Number.isInteger(m.i) || m.i < 0 || m.i > 255 || room.barrels.has(m.i)) return;
        room.barrels.add(m.i);
        relay(room, { t: 'bar', i: m.i, by: Number.isInteger(m.by) ? m.by : 0 }, c);
        break;
      case 'create': {
        if (room || (fixedCode && rooms.size)) return;
        const r = { code: fixedCode || newCode(), host: c.id, phase: 'lobby', players: new Map(), settings: { ...DEFAULTS }, score: [0, 0], barrels: new Set(), endsAt: 0 };
        rooms.set(r.code, r);
        joinRoom(c, r, m.name);
        break;
      }
      case 'join': {
        if (room) return;
        const r = rooms.get(String(m.code ?? '').trim().toUpperCase());
        if (!r) return fail(c, 'No existe ninguna sala con ese código');
        if (r.players.size >= r.settings.teamSize * 2) return fail(c, 'La sala está llena');
        joinRoom(c, r, m.name);
        break;
      }
      case 'team': {
        if (!room) return;
        const team = m.team === 1 ? 1 : 0;
        if (team !== c.team && teamCounts(room)[team] >= room.settings.teamSize) return fail(c, 'Ese equipo está completo');
        c.team = team;
        broadcastRoom(room);
        break;
      }
      case 'set': { // ajustes de la partida: solo el anfitrión y antes de empezar
        if (!room || room.host !== c.id || room.phase !== 'lobby' || !m.s || typeof m.s !== 'object') return;
        const s = m.s; const cfg = room.settings;
        if (Number.isInteger(s.map) && s.map >= 0 && s.map < MAP_COUNT) cfg.map = s.map;
        if (Number.isFinite(s.goal)) cfg.goal = clampNum(Math.round(s.goal), 1, 200);
        if (Number.isFinite(s.time)) cfg.time = clampNum(s.time, 0, 60);
        // El tamaño de equipo no puede dejar fuera a quien ya está dentro.
        if (Number.isFinite(s.teamSize)) cfg.teamSize = clampNum(Math.round(s.teamSize), Math.max(1, ...teamCounts(room)), MAX_TEAM);
        if (Number.isFinite(s.respawn)) cfg.respawn = clampNum(Math.round(s.respawn), 1, 15);
        if (s.weapons === 0 || s.weapons === 1 || s.weapons === 2) cfg.weapons = s.weapons;
        if (typeof s.ff === 'boolean') cfg.ff = s.ff;
        broadcastRoom(room);
        break;
      }
      case 'enter': // el anfitrión inicia la partida; quien llega después entra a la que ya está en curso
        if (!room) return;
        if (room.phase === 'lobby') {
          if (room.host !== c.id) return fail(c, 'Solo el anfitrión puede iniciar la partida');
          room.phase = 'playing'; room.score = [0, 0]; room.barrels.clear();
          room.endsAt = room.settings.time > 0 ? Date.now() + room.settings.time * 60000 : 0;
          for (const p of room.players.values()) resetPlayer(p, true);
          const info = roomInfo(room);
          for (const p of room.players.values()) send(p, { t: 'start', room: info, barrels: [] });
        } else if (!c.playing) {
          resetPlayer(c, true);
          send(c, { t: 'start', room: roomInfo(room), barrels: [...room.barrels] });
        }
        broadcastRoom(room);
        break;
      case 'leave':
        leaveRoom(c);
        break;
      default:
    }
  }

  // Instantáneas de posición a todos los que están jugando en cada sala; hay que llamarlo cada SNAP_MS.
  // El bit de "abatido" lo pone la sala: es quien sabe quién ha muerto y quién ha reaparecido.
  function tick() {
    for (const room of rooms.values()) {
      if (room.phase !== 'playing') continue;
      // Tiempo agotado: gana quien vaya por delante.
      if (room.endsAt && Date.now() >= room.endsAt) {
        const [a, b] = room.score;
        endMatch(room, a === b ? -1 : a > b ? 0 : 1);
        continue;
      }
      const d = [];
      for (const p of room.players.values()) {
        const s = p.state;
        if (p.playing && s) d.push([p.id, s[0], s[1], s[2], s[3], s[4], p.dead ? s[5] | DEAD : s[5] & ~DEAD]);
      }
      if (d.length) relay(room, { t: 'snap', d });
    }
  }

  return {
    connect(sendFn) {
      return { send: sendFn, id: nextId++, name: '', team: 0, room: null, playing: false, state: null, dead: false, k: 0, d: 0 };
    },
    message,
    disconnect: leaveRoom,
    tick,
  };
}
