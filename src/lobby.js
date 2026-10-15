// Pantallas del modo en línea: nombre + crear/unirse por código, y sala de espera con los dos equipos
// y los ajustes de la partida (que sólo puede cambiar el anfitrión).
import { TEAMS } from './net.js';
import { MAPS } from './maps.js';
import { rankTag } from './hud.js';
import { profile } from './profile.js';

const $ = (id) => document.getElementById(id);
const NAME_KEY = 'nightfall.name';

// Ajustes de la partida: clave de la sala (ver src/roomCore.js) y opciones [valor, texto].
const SETTINGS = [
  { key: 'map', options: MAPS.map((m, i) => [i, `${m.name} · ${m.desc}`]) },
  { key: 'goal', options: [5, 10, 15, 20, 30, 40, 50, 75, 100].map((n) => [n, `${n} bajas`]) },
  { key: 'time', options: [[0, 'Sin límite'], ...[5, 10, 15, 20, 30].map((n) => [n, `${n} minutos`])] },
  { key: 'teamSize', options: [1, 2, 3, 4, 5, 6].map((n) => [n, `${n} contra ${n}`]) },
  { key: 'respawn', options: [1, 2, 3, 5, 8, 12].map((n) => [n, `${n} s`]) },
  { key: 'weapons', options: [[0, 'Todas'], [1, 'Pistola y cuchillo'], [2, 'Sólo cuchillo']] },
  { key: 'ff', options: [[false, 'No'], [true, 'Sí']] },
];

export class Lobby {
  // onBack(): volver al menú principal.
  constructor(net, { onBack }) {
    this.net = net;
    this.onBack = onBack;
    this.busy = false;
    try { $('mp-name').value = localStorage.getItem(NAME_KEY) || ''; } catch { /* sin almacenamiento */ }

    $('btn-create').addEventListener('click', () => this.connect(false));
    $('btn-join').addEventListener('click', () => this.connect(true));
    $('mp-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('mp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.connect(true); });
    $('mp-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') ($('mp-code').value ? this.connect(true) : $('mp-code').focus()); });
    $('btn-mp-back').addEventListener('click', () => { this.hide(); this.onBack(); });

    for (const t of [0, 1]) $(`btn-team-${t}`).addEventListener('click', () => { this.error(''); net.setTeam(t); });
    $('btn-enter').addEventListener('click', () => { this.error(''); net.enter(); });
    $('btn-lobby-leave').addEventListener('click', () => { net.leave(); this.open(); });
    $('btn-copy').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}?sala=${net.room.code}`;
      try { await navigator.clipboard.writeText(url); $('btn-copy').textContent = 'ENLACE COPIADO'; } catch { $('btn-copy').textContent = url; }
    });

    // Desplegables de ajustes: cada cambio se envía a la sala, que lo valida y lo reparte a todos.
    for (const { key, options } of SETTINGS) {
      const select = $(`set-${key}`);
      for (const [value, label] of options) select.add(new Option(label, String(value)));
      select.addEventListener('change', () => {
        const raw = select.value;
        net.set({ [key]: raw === 'true' ? true : raw === 'false' ? false : Number(raw) });
      });
    }
  }

  // Muestra la pantalla de nombre y código (con el código ya escrito si se llega por enlace).
  open(code = '', error = '') {
    $('menu').classList.add('hidden'); $('lobby').classList.add('hidden');
    $('mp').classList.remove('hidden');
    if (code) $('mp-code').value = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    this.error(error);
    this.setBusy(false);
    ($('mp-name').value ? $('mp-code') : $('mp-name')).focus();
  }

  hide() { $('mp').classList.add('hidden'); $('lobby').classList.add('hidden'); }

  // Aviso de error, en la pantalla que esté a la vista.
  error(msg) {
    $('mp-error').textContent = msg || '';
    $('lobby-error').textContent = msg || '';
    if (msg) this.setBusy(false);
  }

  setBusy(v) {
    this.busy = v;
    $('btn-create').disabled = v; $('btn-join').disabled = v;
  }

  async connect(joining) {
    if (this.busy) return;
    const name = $('mp-name').value.trim();
    const code = $('mp-code').value.trim();
    if (!name) { this.error('Escribe tu nombre para que los demás te identifiquen'); $('mp-name').focus(); return; }
    if (joining && code.length !== 4) { this.error('El código de sala tiene 4 caracteres'); $('mp-code').focus(); return; }
    try { localStorage.setItem(NAME_KEY, name); } catch { /* sin almacenamiento */ }
    this.error('');
    this.setBusy(true);
    try {
      const rank = [profile.prestige, profile.level];
      if (joining) await this.net.join(code, name, rank); else await this.net.create(name, rank);
    } catch (e) {
      this.error(e.message);
    }
  }

  // Ya dentro de una sala: pasa a la sala de espera.
  showRoom() {
    $('mp').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('btn-copy').textContent = 'COPIAR ENLACE';
    this.error('');
    this.setBusy(false);
    this.render();
  }

  render() {
    const { net } = this;
    const room = net.room;
    if (!room) return;
    const me = net.me;
    const cfg = room.settings;
    const live = room.phase === 'playing';
    $('lobby-code').textContent = room.code;
    for (const t of [0, 1]) {
      const list = $(`team-list-${t}`);
      list.textContent = '';
      const players = room.players.filter((p) => p.team === t);
      for (const p of players) {
        const li = document.createElement('li');
        const tag = rankTag(p);
        if (tag) li.append(tag);
        li.append(p.name);
        if (p.id === net.id) li.classList.add('me');
        if (p.id === room.host) li.dataset.tag = 'ANFITRIÓN';
        list.appendChild(li);
      }
      $(`team-count-${t}`).textContent = `${players.length} / ${cfg.teamSize}`;
      const btn = $(`btn-team-${t}`);
      const full = players.length >= cfg.teamSize;
      btn.disabled = me.team === t || full;
      btn.textContent = me.team === t ? 'TU EQUIPO' : full ? 'EQUIPO COMPLETO' : `PASAR A ${TEAMS[t]}`;
    }

    // Ajustes: editables sólo por el anfitrión y antes de empezar.
    for (const { key } of SETTINGS) {
      const select = $(`set-${key}`);
      const value = String(cfg[key]);
      if (![...select.options].some((o) => o.value === value)) select.add(new Option(value, value)); // valor fuera de la lista
      select.value = value;
      select.disabled = !net.isHost || live;
    }

    const enter = $('btn-enter');
    enter.disabled = !live && !net.isHost;
    enter.textContent = live ? 'ENTRAR EN LA PARTIDA' : net.isHost ? 'INICIAR PARTIDA' : 'ESPERANDO AL ANFITRIÓN…';
    const goal = `Gana el primer equipo que consiga ${cfg.goal} bajas${cfg.time > 0 ? `, o el que vaya por delante a los ${cfg.time} minutos` : ''}.`;
    $('lobby-note').textContent = live ? `La partida ya está en curso. ${goal}`
      : `${goal} ${net.isHost ? 'Comparte el código para que se unan y ajusta la partida a tu gusto.' : 'Los ajustes los decide el anfitrión.'}`
        + (net.direct && net.isHost ? ' La partida corre en tu navegador: si cierras esta pestaña, se acaba para todos.' : '');
  }
}
