// Modo supervivencia: oleadas sin fin de soldados contra el jugador, con descanso entre una y otra,
// munición que sueltan los caídos, puntuación y récord por mapa (guardado en este navegador).
// Reutiliza los soldados de la misión (enemies.list): los que no están en juego esperan fuera (bench) y
// entran por puntos alejados del jugador y fuera de su vista. No hay nada en línea: es solo local.
import * as THREE from 'three';
import { ST } from './enemies.js';
import { RIFLE, PISTOL, KNIFE } from './weapon.js';
import { SPAWN } from './layout.js';
import { makeCanvas, tex } from './textures.js';
import { NavGrid } from './navgrid.js';
import { rand } from './utils.js';

export const FIRST_WAVE = 4; // enemigos de la primera oleada
export const WAVE_STEP = 3; // cuántos más trae cada oleada
const MAX_ALIVE = 8; // a la vez en el mapa como mucho; el resto llega de refuerzo al ir cayendo
const REST_TIME = 20; // descanso entre oleadas (s)
const FIRST_DELAY = 6; // hasta la primera oleada (s)
const REFILL = 200; // reserva del fusil al terminar cada oleada (si se tenía menos)
const DROP_AMMO = 10; // balas de fusil que suelta cada enemigo
const PICK_R = 1.25; // distancia para recoger la munición
const MAX_DROPS = 24; // cajas en el suelo a la vez (si hay más, desaparece la más antigua)
const SPAWN_MIN = 24; const SPAWN_MAX = 65; // distancia al jugador de los puntos de aparición
const POINTS = { kill: 100, head: 50, knife: 100, wave: 250 }; // la de oleada se multiplica por su número
const STORE = 'nightfall.survival';
const NAV_EVERY = 0.4; // cada cuánto se rehace el camino hacia el jugador (s)

// Récords por mapa: { [mapa]: { wave, score } }.
export function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function saveRecords(r) {
  try { localStorage.setItem(STORE, JSON.stringify(r)); } catch { /* sin almacenamiento */ }
}

export const fmt = (n) => n.toLocaleString('es-ES');

// Caja de munición: verde oliva con una franja amarilla que brilla un poco (de noche, si no, no se ve).
function ammoCrate() {
  const c = makeCanvas(128, 64); const x = c.getContext('2d');
  x.fillStyle = '#4a5233'; x.fillRect(0, 0, 128, 64);
  x.fillStyle = '#3a4128'; x.fillRect(0, 0, 128, 6); x.fillRect(0, 58, 128, 6);
  x.fillStyle = '#e8b830'; x.fillRect(0, 24, 128, 16);
  x.fillStyle = '#1b1d14'; x.font = 'bold 13px monospace'; x.textAlign = 'center'; x.fillText('5.56 MM', 64, 37);
  const g = makeCanvas(128, 64); const y = g.getContext('2d');
  y.fillStyle = '#000'; y.fillRect(0, 0, 128, 64);
  y.fillStyle = '#e8b830'; y.fillRect(0, 24, 128, 16);
  const mat = new THREE.MeshStandardMaterial({
    map: tex(c, { srgb: true, wrap: false }), emissiveMap: tex(g, { srgb: true, wrap: false }),
    emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.65, metalness: 0.25,
  });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.18, 0.16), mat, MAX_DROPS);
  mesh.count = 0;
  mesh.frustumCulled = false; // las cajas cambian de sitio: la esfera envolvente no vale
  return mesh;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

export class Survival {
  constructor(g, scene) {
    this.g = g; // world, enemies, combat, weapon, player, hud, audio
    this.active = false;
    this.map = 0;
    this.drops = []; // { x, z, a } (a: giro)
    this.crates = ammoCrate();
    scene.add(this.crates);
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.phase = 'rest'; // rest | wave
    this.restT = FIRST_DELAY;
    this.toSpawn = 0; // enemigos de la oleada que aún no han entrado
    this.spawnT = 0;
    this.score = 0;
    this.record = null; // récord anterior del mapa al terminar
    this.newRecord = false;
    this.drops.length = 0;
    this.crates.count = 0; this.crates.visible = false;
    this.t = 0;
  }

  // Dónde empieza el jugador: en Sector 7, donde la misión; en los otros, lo más cerca posible del centro.
  startSpot(map) {
    if (map === 0) return SPAWN;
    const col = this.g.world.col;
    for (let r = 0; r < 14; r += 1) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = Math.cos(a) * r; const z = Math.sin(a) * r;
        if (!col.blockedAbove(x, z, 0.6, 0.1, 1.9)) return { x, z, yaw: Math.random() * Math.PI * 2 };
        if (r === 0) break;
      }
    }
    return { x: 0, z: 0, yaw: 0 };
  }

  // Puntos de aparición del mapa (se calculan una vez). En Sector 7, dentro de la base: donde patrulla la
  // misión y junto a sus coberturas. En los demás, una franja a lo largo de todo el borde del recinto.
  spots() {
    const w = this.g.world;
    if (w.survivalSpots) return w.survivalSpots;
    const pts = [];
    if (w.enemies.length) {
      for (const s of w.enemies) pts.push({ x: s.x, z: s.z });
      for (const n of w.cover) pts.push({ x: n.x, z: n.z });
    } else {
      const b = w.bounds;
      for (let x = b.x0 + 2; x <= b.x1 - 2; x += 3) {
        for (let z = b.z0 + 2; z <= b.z1 - 2; z += 3) {
          if (Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z) < 9) pts.push({ x, z });
        }
      }
    }
    w.survivalSpots = pts.filter((p) => !w.col.blockedAbove(p.x, p.z, 0.5, 0.1, 1.9));
    return w.survivalSpots;
  }

  start(map) {
    const { enemies, weapon } = this.g;
    this.active = true;
    this.map = map;
    this.reset();
    enemies.hunt = true;
    enemies.bench();
    // Rejilla de navegación del mapa (se construye la primera vez y se guarda con él).
    const w = this.g.world;
    if (!w.nav) w.nav = new NavGrid(w.col, w.bounds);
    this.nav = w.nav; this.nav.target = -1; this.navT = 0;
    enemies.nav = this.nav;
    this.setLevel(1);
    weapon.slots[RIFLE].reserve = REFILL;
    this.g.hud.objective('Prepárate', `Primera oleada en ${FIRST_DELAY} s`);
  }

  stop() {
    const { enemies, combat } = this.g;
    this.active = false;
    enemies.hunt = false;
    enemies.nav = null;
    enemies.reactK = 1;
    combat.difficulty = 1;
    this.drops.length = 0;
    this.crates.count = 0; this.crates.visible = false;
  }

  // Dificultad de la oleada n: apuntan mejor y reaccionan antes, hasta un tope.
  setLevel(n) {
    this.g.combat.difficulty = Math.min(1.6, 1 + 0.06 * (n - 1));
    this.g.enemies.reactK = Math.max(0.55, 1 - 0.05 * (n - 1));
  }

  get total() { return FIRST_WAVE + WAVE_STEP * (this.wave - 1); }
  get left() { return this.g.enemies.alive + this.toSpawn; }

  // Baja de un soldado (lo llama combat). Suma puntos y deja una caja de munición donde cae.
  onKill(e, part) {
    if (!this.active) return;
    const { weapon, hud } = this.g;
    const knife = weapon.cur === KNIFE || !!weapon.quick;
    const pts = POINTS.kill + (part === 'head' ? POINTS.head : 0) + (knife ? POINTS.knife : 0);
    this.score += pts;
    hud.killMsg(`${knife ? 'CUCHILLO' : part === 'head' ? 'DISPARO A LA CABEZA' : 'HOSTIL NEUTRALIZADO'} · +${pts}`);
    if (this.drops.length >= MAX_DROPS) this.drops.shift();
    this.drops.push({ x: e.x, z: e.z, a: Math.random() * Math.PI * 2 });
  }

  beginWave() {
    const { hud, audio } = this.g;
    this.wave++;
    this.phase = 'wave';
    this.toSpawn = this.total;
    this.spawnT = 0;
    this.setLevel(this.wave);
    hud.objective(`Oleada ${this.wave}`, '');
    hud.message(`OLEADA ${this.wave}`, 2.5);
    audio.objective();
  }

  // Oleada superada: puntos extra, vida al máximo, munición repuesta, bidones otra vez en su sitio y descanso.
  endWave() {
    const { hud, audio, player, weapon, combat } = this.g;
    const bonus = POINTS.wave * this.wave;
    this.score += bonus;
    this.phase = 'rest';
    this.restT = REST_TIME;
    if (!player.dead) player.health = 100;
    for (const i of [RIFLE, PISTOL]) {
      const s = weapon.slots[i];
      s.mag = s.def.mag;
      s.reserve = Math.max(s.reserve, i === RIFLE ? REFILL : s.def.reserve);
    }
    combat.restoreBarrels();
    hud.objective('Descanso', '');
    hud.message(`OLEADA ${this.wave} SUPERADA · +${bonus}`, 3);
    audio.objective();
  }

  // Un soldado libre para entrar: primero los que esperan fuera; si no, un cuerpo que no se esté viendo
  // (o, a falta de otro, uno que lleve ya un buen rato en el suelo).
  freeSoldier(px, eyeY, pz) {
    const { enemies, world } = this.g;
    let best = null; let bt = -1;
    for (const e of enemies.list) {
      if (e.off) return e;
      if (e.state !== ST.DEAD || e.td >= 0 || e.deadT < 3) continue;
      const hidden = !world.col.lineOfSight(px, eyeY, pz, e.x, 0.5, e.z) || Math.hypot(e.x - px, e.z - pz) > 45;
      const t = e.deadT + (hidden ? 100 : 0);
      if ((hidden || e.deadT > 15) && t > bt) { bt = t; best = e; }
    }
    return best;
  }

  // Punto de aparición: lejos del jugador y fuera de su vista (si no hay ninguno así, el que más se acerque).
  pickSpot(px, eyeY, pz) {
    const col = this.g.world.col;
    const spots = this.spots();
    let fallback = null; let fd = -1;
    for (let i = 0; i < 40; i++) {
      const p = spots[Math.floor(Math.random() * spots.length)];
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < SPAWN_MIN * 0.6 || !this.nav.reachable(p.x, p.z)) continue;
      const seen = col.lineOfSight(px, eyeY, pz, p.x, 1.5, p.z);
      if (!seen && d >= SPAWN_MIN && d <= SPAWN_MAX) return p;
      const score = (seen ? 0 : 100) + Math.min(d, SPAWN_MAX);
      if (score > fd) { fd = score; fallback = p; }
    }
    return fallback;
  }

  // Entra un grupo de hasta tres soldados por el mismo punto.
  spawnGroup() {
    const { enemies, player, world } = this.g;
    const px = player.pos.x; const pz = player.pos.z; const eyeY = player.eyeY;
    const p = this.pickSpot(px, eyeY, pz);
    if (!p) return false;
    const n = Math.min(3, this.toSpawn, MAX_ALIVE - enemies.alive);
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const e = this.freeSoldier(px, eyeY, pz);
      if (!e) break;
      // Uno al lado del otro, si cabe.
      let x = p.x; let z = p.z;
      for (let k = 0; k < 6 && i > 0; k++) {
        const a = rand(0, Math.PI * 2);
        const tx = p.x + Math.cos(a) * 1.4 * i; const tz = p.z + Math.sin(a) * 1.4 * i;
        if (!world.col.blockedAbove(tx, tz, 0.45, 0.1, 1.9)) { x = tx; z = tz; break; }
      }
      enemies.enter(e, x, z, px + rand(-5, 5), pz + rand(-5, 5));
      this.toSpawn--; placed++;
    }
    return placed > 0;
  }

  update(dt) {
    if (!this.active) return;
    const { player, hud, enemies, weapon, audio } = this.g;
    this.t += dt;
    if ((this.navT -= dt) <= 0) { this.navT = NAV_EVERY; this.nav.update(player.pos.x, player.pos.z); }
    if (!player.dead) {
      if (this.phase === 'rest') {
        this.restT -= dt;
        hud.objectiveSub(`${this.wave ? 'Siguiente oleada' : 'Primera oleada'} en ${Math.max(0, Math.ceil(this.restT))} s · ${fmt(this.score)} pts`);
        if (this.restT <= 0) this.beginWave();
      } else {
        this.spawnT -= dt;
        if (this.toSpawn > 0 && this.spawnT <= 0 && enemies.alive < MAX_ALIVE) this.spawnT = this.spawnGroup() ? rand(2, 3.5) : 1;
        hud.objectiveSub(`Hostiles: ${this.left} · ${fmt(this.score)} pts`);
        if (this.toSpawn === 0 && enemies.alive === 0) this.endWave();
      }
    }

    // Cajas de munición: se recogen al pasar por encima.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (!player.dead && Math.hypot(d.x - player.pos.x, d.z - player.pos.z) < PICK_R) {
        weapon.slots[RIFLE].reserve += DROP_AMMO;
        hud.message(`+${DROP_AMMO} BALAS`, 1.2);
        audio.reload(1);
        this.drops.splice(i, 1);
      }
    }
    const m = this.crates;
    m.count = this.drops.length;
    m.visible = m.count > 0;
    this.drops.forEach((d, i) => {
      _q.setFromAxisAngle(_up, d.a + this.t * 1.4);
      _p.set(d.x, 0.13 + Math.sin(this.t * 2.2 + d.a) * 0.03, d.z);
      m.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    m.instanceMatrix.needsUpdate = true;
  }

  // Al terminar (muerte): guarda el récord del mapa si se ha superado. Devuelve el anterior.
  finish() {
    const records = loadRecords();
    const prev = records[this.map] || { wave: 0, score: 0 };
    this.record = prev;
    this.newRecord = this.score > prev.score;
    if (this.newRecord) { records[this.map] = { wave: this.wave, score: this.score }; saveRecords(records); }
    return prev;
  }
}
