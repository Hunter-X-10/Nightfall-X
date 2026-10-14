// HUD minimalista en DOM: cruceta dinámica, marcador de impacto, munición, barra de armas, vida, objetivo y brújula.
import * as THREE from 'three';
import { TEAMS } from './net.js';
import { WEAPONS } from './weapon.js';
import { clamp } from './utils.js';

const $ = (id) => document.getElementById(id);
const PX_PER_DEG = 3.6;
const FEED_MAX = 5;
const FEED_MS = 6000;
// Siluetas de la barra de armas (fusil, pistola, cuchillo), en un lienzo de 64 x 24.
const ICONS = [
  '2,9 13,9 15,7 40,7 40,5 45,5 45,7 62,7 62,10 46,10 44,12 36,12 33,21 28,21 30,12 22,12 20,17 15,17 16,12 2,13',
  '14,6 50,6 50,11 36,11 34,14 28,14 25,22 17,22 20,11 14,11',
  '4,13 30,7 38,7 38,10 60,10 60,15 38,15 38,17 30,17 14,16',
];
const _v = new THREE.Vector3();

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // los nombres los escriben los jugadores: nunca como HTML
  return e;
};

// Tabla de jugadores por equipo (marcador con Tab y pantalla de fin de partida).
export function renderBoard(root, room, myId) {
  root.textContent = '';
  for (const t of [0, 1]) {
    const col = el('div', `board-team t${t}`);
    const head = el('div', 'board-head');
    head.append(el('span', '', TEAMS[t]), el('b', '', room.score[t]));
    const cap = el('div', 'board-row cap');
    cap.append(el('span', '', 'JUGADOR'), el('span', '', 'BAJAS'), el('span', '', 'MUERTES'));
    col.append(head, cap);
    const players = room.players.filter((p) => p.team === t && p.playing).sort((a, b) => b.k - a.k || a.d - b.d);
    for (const p of players) {
      const row = el('div', p.id === myId ? 'board-row me' : 'board-row');
      row.append(el('span', '', p.name), el('span', '', p.k), el('span', '', p.d));
      col.appendChild(row);
    }
    root.appendChild(col);
  }
}

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), cross: $('crosshair'), hit: $('hitmarker'), dmgDir: $('dmg-dir'), vignette: $('damage-vignette'),
      mag: $('ammo-mag'), res: $('ammo-res'), pips: $('ammo-pips'), hp: $('health-num'), hpFill: $('health-fill'), health: $('health'),
      sta: $('stamina'), staFill: $('stamina-fill'), quick: $('quick-hint'),
      obj: $('objective'), objText: $('objective-text'), objSub: $('objective-sub'), strip: $('compass-strip'), cObj: $('compass-obj'),
      marker: $('obj-marker'), dist: $('obj-dist'), msg: $('center-msg'), kill: $('kill-msg'), fps: $('fps-counter'),
      wname: $('weapon-name'), ammo: $('ammo'), toolbar: $('toolbar'),
      clock: $('clock'),
      score: $('score'), score0: $('score-0'), score1: $('score-1'), goal: $('score-goal'), feed: $('killfeed'), board: $('scoreboard'),
    };
    // Brújula: marcas cada 15° repetidas tres vueltas para poder desplazarla sin costuras.
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    let html = '';
    for (let d = -360; d <= 720; d += 15) {
      const n = ((d % 360) + 360) % 360;
      html += `<span class="${names[n] ? 'major' : ''}" style="left:${(d + 360) * PX_PER_DEG}px">${names[n] || n}</span>`;
    }
    this.el.strip.innerHTML = html;
    this.el.pips.innerHTML = '<i></i>'.repeat(30);
    this.pips = [...this.el.pips.children];
    // Barra de armas: una casilla por arma con su tecla, silueta y munición.
    this.slots = WEAPONS.map((w, i) => {
      const slot = el('div', 'slot');
      slot.innerHTML = `<svg viewBox="0 0 64 24" aria-hidden="true"><polygon points="${ICONS[i]}"/></svg>`;
      const ammo = el('span', 's-ammo');
      slot.append(el('span', 's-key', i + 1), ammo, el('span', 's-name', w.label));
      this.el.toolbar.appendChild(slot);
      return { slot, ammo };
    });
    this.cache = {};
    this.hitT = 0; this.dmgT = 0; this.killT = 0; this.msgT = 0;
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  objective(text, sub = '') {
    this.el.objText.textContent = text;
    this.el.objSub.textContent = sub;
    this.el.obj.classList.remove('flash');
    void this.el.obj.offsetWidth;
    this.el.obj.classList.add('flash');
  }

  objectiveSub(sub) { this.set('sub', sub, (v) => { this.el.objSub.textContent = v; }); }

  hitmarker(kind) {
    this.hitT = kind === 'kill' ? 0.42 : 0.2;
    this.el.hit.className = kind === 'kill' ? 'kill' : kind === 'head' ? 'head' : '';
  }

  damageFrom(angle) {
    this.dmgT = 1;
    this.el.dmgDir.style.transform = `rotate(${angle}rad)`;
  }

  killMsg(text) { this.el.kill.textContent = text; this.killT = 1.6; }
  message(text, time = 1.5) { this.set('msg', text, (v) => { this.el.msg.textContent = v; }); this.msgT = time; }

  // ---------- Partida en línea ----------
  // Muestra u oculta el marcador por equipos y vacía el registro de bajas.
  setOnline(on) {
    this.el.score.classList.toggle('hidden', !on);
    this.el.feed.textContent = '';
    this.board(false);
    this.clock(-1);
  }

  // Tiempo que queda de partida en segundos (-1 = sin límite: se oculta).
  clock(sec) {
    this.set('clock', sec, (v) => {
      this.el.clock.classList.toggle('hidden', v < 0);
      this.el.clock.classList.toggle('low', v >= 0 && v <= 30);
      if (v >= 0) this.el.clock.textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
    });
  }

  score(score, goal, myTeam) {
    this.el.score0.textContent = score[0];
    this.el.score1.textContent = score[1];
    this.el.goal.textContent = goal;
    this.el.score.dataset.team = myTeam;
  }

  // Línea del registro de bajas. killer/victim: { name, team }; sin killer, la víctima ha caído sola.
  // weapon: arma de la baja (2 = cuchillo, que se anuncia).
  feed(killer, victim, head, mine, weapon = 0) {
    const row = el('div', mine ? 'mine' : '');
    if (killer) row.append(el('span', `who t${killer.team}`, killer.name), el('span', 'sep', weapon === 2 ? '▸ CUCHILLO ▸' : head ? '▸ CABEZA ▸' : '▸'));
    row.append(el('span', `who t${victim.team}`, victim.name));
    if (!killer) row.append(el('span', 'sep', 'HA CAÍDO'));
    const feed = this.el.feed;
    feed.appendChild(row);
    while (feed.children.length > FEED_MAX) feed.firstChild.remove();
    setTimeout(() => row.remove(), FEED_MS);
  }

  board(on) { this.set('board', on ? 1 : 0, (v) => this.el.board.classList.toggle('hidden', !v)); }

  update(dt, { player, weapon, camera, objective, fps }) {
    const e = this.el;
    // Cruceta: separación según la dispersión; se oculta al apuntar o esprintar.
    const gap = Math.round(5 + weapon.spread * 7.5);
    this.set('gap', gap, (v) => e.cross.style.setProperty('--gap', `${v}px`));
    const crossOn = player.aimT < 0.5 && weapon.sprintT < 0.5 && !player.dead ? 1 : 0;
    this.set('crossOn', crossOn, (v) => { e.cross.style.opacity = v; });

    // Arma en mano: nombre, munición (el cuchillo no tiene) y casilla marcada en la barra.
    const def = weapon.def;
    this.set('weapon', weapon.cur, () => {
      e.wname.textContent = def.name;
      e.ammo.classList.toggle('melee', !!def.melee);
      this.pips.forEach((p, i) => { p.style.display = i < (def.mag || 0) ? '' : 'none'; });
      this.cache.mag = undefined; this.cache.res = undefined;
    });
    this.set('allowed', weapon.allowedMask, (m) => this.slots.forEach((s, i) => s.slot.classList.toggle('off', !(m & (1 << i)))));
    this.set('slot', weapon.pending >= 0 ? weapon.pending : weapon.cur, (v) => this.slots.forEach((s, i) => s.slot.classList.toggle('on', i === v)));
    weapon.slots.forEach((s, i) => {
      if (!s.def.melee) this.set(`slotAmmo${i}`, s.mag * 1000 + s.reserve, () => { this.slots[i].ammo.textContent = `${s.mag} / ${s.reserve}`; });
    });
    this.set('mag', weapon.mag, (v) => {
      if (v === null) return;
      e.mag.textContent = String(v).padStart(2, '0');
      e.mag.classList.toggle('low', v <= def.mag * 0.27);
      this.pips.forEach((p, i) => p.classList.toggle('off', i >= v));
    });
    this.set('res', weapon.reserve, (v) => { if (v !== null) e.res.textContent = v; });
    const hp = Math.ceil(player.health);
    this.set('hp', hp, (v) => {
      e.hp.textContent = v;
      e.hpFill.style.width = `${v}%`;
      e.health.classList.toggle('low', v <= 35);
    });
    this.set('sta', Math.round(player.stamina * 100), (v) => {
      e.staFill.style.width = `${v}%`;
      e.sta.classList.toggle('on', v < 100);
    });
    this.set('staOut', player.exhausted, (v) => e.sta.classList.toggle('out', v));
    this.set('quick', !!weapon.quickTarget, (v) => e.quick.classList.toggle('on', v));

    // Marcadores temporales.
    this.hitT = Math.max(0, this.hitT - dt);
    this.set('hit', Math.round(Math.min(1, this.hitT * 6) * 20), (v) => { e.hit.style.opacity = v / 20; e.hit.style.transform = `scale(${1 + (1 - v / 20) * 0.35})`; });
    this.dmgT = Math.max(0, this.dmgT - dt * 0.9);
    this.set('dmg', Math.round(this.dmgT * 20), (v) => { e.dmgDir.style.opacity = v / 20; });
    this.killT = Math.max(0, this.killT - dt);
    this.set('kill', Math.round(Math.min(1, this.killT * 2) * 20), (v) => { e.kill.style.opacity = v / 20; });
    this.msgT = Math.max(0, this.msgT - dt);
    this.set('msgOn', this.msgT > 0 ? 1 : 0, (v) => { e.msg.style.opacity = v; });

    // Brújula.
    const heading = ((-player.yaw * 180) / Math.PI % 360 + 360) % 360;
    e.strip.style.transform = `translateX(${180 - (heading + 360) * PX_PER_DEG}px)`;
    if (objective) {
      const dx = objective.x - player.pos.x; const dz = objective.z - player.pos.z;
      const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
      let rel = ((bearing - heading + 540) % 360) - 180;
      e.cObj.style.transform = `translateX(${clamp(rel * PX_PER_DEG, -170, 170) - 4}px)`;
      // Marcador proyectado en pantalla.
      _v.set(objective.x, objective.y ?? 1.6, objective.z).project(camera);
      const behind = _v.z > 1;
      let sx = (_v.x * 0.5 + 0.5) * window.innerWidth; let sy = (-_v.y * 0.5 + 0.5) * window.innerHeight;
      if (behind) { sx = window.innerWidth - sx; sy = window.innerHeight - 60; }
      sx = clamp(sx, 40, window.innerWidth - 40); sy = clamp(sy, 80, window.innerHeight - 110);
      e.marker.style.transform = `translate(${Math.round(sx - 8)}px, ${Math.round(sy - 8)}px)`;
      this.set('dist', Math.round(Math.hypot(dx, dz)), (v) => { e.dist.textContent = `${v} m`; });
      this.set('markerOn', 1, () => { e.marker.style.display = ''; e.cObj.style.display = ''; });
    } else {
      this.set('markerOn', 0, () => { e.marker.style.display = 'none'; e.cObj.style.display = 'none'; });
    }
    if (fps !== undefined) this.set('fps', fps, (v) => { e.fps.textContent = v; });
  }
}
