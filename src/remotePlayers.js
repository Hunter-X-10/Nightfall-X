// Jugadores remotos: un soldado por jugador, con el aspecto de su equipo, movido por interpolación entre
// las instantáneas que reparte el servidor, con cápsulas de impacto para los disparos y el nombre sobre la
// cabeza: el de los compañeros se ve siempre; el de los rivales, sólo mientras se les apunta.
import * as THREE from 'three';
import { createSoldier, poseSoldier, soldierGeometry, LEAN_HIP, LEAN_SPINE } from './enemyModel.js';
import { coneGeometry, coneMaterial, flare } from './volumetric.js';
import { FLAG, LEAN_SHIFT, PART, TEAM_COLORS, WEAPON_SHIFT } from './net.js';
import { angleDelta, clamp, damp, lerp, rand, rayCapsule } from './utils.js';

const INTERP_MS = 120; // se dibuja algo en el pasado para tener siempre dos muestras entre las que interpolar
const TAG_H = 0.26;
const NAME_LINGER = 1.2; // segundos que sigue visible el nombre de un rival tras dejar de apuntarle
const SWING_TIME = 0.4;
// Por arma (fusil, pistola, cuchillo): boca del cañón y origen del haz de la linterna, en el hueso del arma.
const MUZZLE_Z = [0.7, 0.2, 0.3];
const CONE_Z = [0.5, 0.2, 0.1];
const _v = new THREE.Vector3();

// Aspecto del soldado (ver LOOKS en enemyModel.js) de cada equipo.
const teamLook = (team) => team + 1;

function nameTag(name, team) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '600 50px Bahnschrift, "DIN Alternate", "Segoe UI", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  g.strokeText(name, 256, 50, 490);
  g.fillStyle = TEAM_COLORS[team];
  g.fillText(name, 256, 50, 490);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.renderOrder = 23;
  return sprite;
}

export class RemotePlayers {
  constructor(scene, surf, reflection) {
    this.scene = scene; this.surf = surf; this.reflection = reflection;
    this.map = new Map();
    this.coneGeo = coneGeometry(1.5, 9, true);
  }

  get(id) { return this.map.get(id); }

  // Ajusta la lista a los jugadores de la sala que están en partida (sin contar al local).
  sync(players, myId) {
    const seen = new Set();
    for (const p of players) {
      if (p.id === myId || !p.playing) continue;
      seen.add(p.id);
      let r = this.map.get(p.id);
      if (!r) { r = this.add(p); this.map.set(p.id, r); }
      if (r.name !== p.name || r.team !== p.team) this.dress(r, p.name, p.team);
    }
    for (const [id, r] of this.map) if (!seen.has(id)) { this.remove(r); this.map.delete(id); }
  }

  add(p) {
    const s = createSoldier(this.surf);
    const cone = new THREE.Mesh(this.coneGeo, coneMaterial(0xcfe0ff, 0.2, 1.3, 1.2));
    cone.position.set(0.035, 0.045, 0.5);
    const fl = flare(0xdfeaff, 0.38, 1.1);
    fl.position.set(0.035, 0.045, 0.48);
    s.bone.gun.add(cone, fl);
    s.mesh.visible = false; // hasta que llegue su primera posición
    this.scene.add(s.mesh);
    return {
      id: p.id, name: null, team: -1, s, cone, fl, tag: null, buf: [],
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, speed: 0, placed: false,
      killed: false, // baja confirmada por el servidor antes de que llegue en las instantáneas
      weapon: 0, swingT: 1, revealT: 0, tagA: 0,
      pose: { phase: p.id * 1.3, walk: 0, crouch: 0, aim: 1, aimPitch: 0, flinchX: 0, flinchY: 0, death: 0, deathDir: 1, deathTwist: 0.3, lean: 0, look: 0 },
    };
  }

  dress(r, name, team) {
    r.name = name; r.team = team;
    r.s.mesh.geometry = soldierGeometry(r.weapon, teamLook(team));
    this.dropTag(r);
    r.tag = nameTag(name, team);
    r.s.mesh.add(r.tag);
    this.reflection.hidden.push(r.tag);
  }

  dropTag(r) {
    if (!r.tag) return;
    const i = this.reflection.hidden.indexOf(r.tag);
    if (i >= 0) this.reflection.hidden.splice(i, 1);
    r.s.mesh.remove(r.tag);
    r.tag.material.map.dispose(); r.tag.material.dispose();
    r.tag = null;
  }

  remove(r) {
    this.dropTag(r);
    this.scene.remove(r.s.mesh);
    r.s.mesh.skeleton.dispose();
    r.cone.material.dispose(); r.fl.material.dispose();
  }

  clear() {
    for (const r of this.map.values()) this.remove(r);
    this.map.clear();
  }

  // Instantánea del servidor: [[id, x, y, z, yaw, pitch, flags], ...]
  onSnap(list, myId) {
    const t = performance.now();
    for (const d of list) {
      if (d[0] === myId) continue;
      const r = this.map.get(d[0]);
      if (!r) continue;
      if (r.killed && !(d[6] & FLAG.DEAD)) r.killed = false; // ya ha reaparecido
      r.buf.push({ t, x: d[1], y: d[2], z: d[3], yaw: d[4], pitch: d[5], f: d[6] });
      if (r.buf.length > 12) r.buf.shift();
    }
  }

  // ¿Hay algún jugador a menos de `dist` metros de (x, z)? (para no reaparecer encima de otro)
  near(x, z, dist) {
    for (const r of this.map.values()) if (r.placed && Math.hypot(r.x - x, r.z - z) < dist) return true;
    return false;
  }

  isDown(r) { return r.killed || (r.flags & FLAG.DEAD) !== 0; }

  // Rayo de un disparo contra los jugadores tal y como se ven en pantalla.
  // skipTeam: equipo al que no se puede dañar (-1 = ninguno). pad: holgura de las cápsulas (cuerpo a
  // cuerpo, o para saber a quién se mira). shielded: incluir a los protegidos tras reaparecer.
  // Devuelve { player, part, dist } o null.
  raycast(ox, oy, oz, dx, dy, dz, maxT, skipTeam = -1, pad = 0, shielded = false) {
    let best = null; let bt = maxT;
    for (const r of this.map.values()) {
      if (!r.placed || r.team === skipTeam || this.isDown(r) || (!shielded && r.flags & FLAG.SHIELD)) continue;
      const cr = r.pose.crouch;
      const hipY = r.y + 0.95 - cr * 0.4; const shY = hipY + 0.5;
      const lean = cr * 0.12;
      const fx = -Math.sin(r.yaw) * lean; const fz = -Math.cos(r.yaw) * lean; // hacia donde mira
      // Asomarse: todo el cuerpo se aparta con la cadera y el torso gira sobre la columna (ver poseSoldier);
      // la cabeza está a 0,57 m del pivote y el hombro a 0,29 m.
      const ln = r.pose.lean; const ang = ln * LEAN_SPINE;
      const rx = Math.cos(r.yaw); const rz = -Math.sin(r.yaw); // derecha del jugador
      const hip = ln * LEAN_HIP; const sh = hip + 0.29 * Math.sin(ang); const hd = hip + 0.57 * Math.sin(ang);
      const headY = shY + 0.2 - 0.57 * (1 - Math.cos(ang));
      const bx = r.x + rx * hip; const bz = r.z + rz * hip;
      let t = rayCapsule(ox, oy, oz, dx, dy, dz, r.x + fx + rx * hd, headY, r.z + fz + rz * hd, r.x + fx + rx * hd, headY + 0.03, r.z + fz + rz * hd, 0.135 + pad, bt);
      if (t >= 0 && t < bt) { bt = t; best = { player: r, part: PART.HEAD, dist: t }; }
      t = rayCapsule(ox, oy, oz, dx, dy, dz, bx, hipY + 0.12, bz, r.x + fx + rx * sh, shY - 0.08, r.z + fz + rz * sh, 0.23 + pad, bt);
      if (t >= 0 && t < bt) { bt = t; best = { player: r, part: PART.TORSO, dist: t }; }
      t = rayCapsule(ox, oy, oz, dx, dy, dz, bx, r.y + 0.12, bz, bx, hipY, bz, 0.19 + pad, bt);
      if (t >= 0 && t < bt) { bt = t; best = { player: r, part: PART.LEGS, dist: t }; }
    }
    return best;
  }

  // Sacudida al recibir un impacto.
  flinch(r) { r.pose.flinchX += rand(0.1, 0.25); r.pose.flinchY += rand(-0.35, 0.35); }

  // Baja confirmada: cae ya, sin esperar a la instantánea. `from` (con x, z) es quien la causó, si se conoce.
  markKilled(id, from) {
    const r = this.map.get(id);
    if (!r) return;
    r.killed = true;
    // Cae en el sentido del disparo respecto a hacia dónde mira.
    const facing = from ? -Math.sin(r.yaw) * (r.x - from.x) - Math.cos(r.yaw) * (r.z - from.z) : -1;
    r.pose.deathDir = facing < 0 ? 1 : -1;
    r.pose.deathTwist = rand(-1, 1);
  }

  // Arma en mano (índice de WEAPONS).
  weaponOf(r) { return Math.min(2, (r.flags >> WEAPON_SHIFT) & 3); }

  // Lanza la animación del tajo de cuchillo.
  swing(r) { r.swingT = 0; }

  // Posición en el mundo de la boca del cañón (vector compartido: úsalo antes de volver a llamar).
  muzzle(r) {
    r.s.mesh.updateMatrixWorld(true);
    return r.s.bone.gun.localToWorld(_v.set(0, 0.045, MUZZLE_Z[r.weapon]));
  }

  // myTeam: equipo del jugador local. focusId: jugador al que se está apuntando (0 = nadie).
  update(dt, camera, myTeam, focusId) {
    const now = performance.now();
    const rt = now - INTERP_MS;
    const blink = Math.floor(now / 90) % 2 === 0;
    for (const r of this.map.values()) {
      const b = r.buf;
      if (!b.length) continue;
      while (b.length > 2 && b[1].t <= rt) b.shift();
      const a = b[0]; const c = b[1] || a;
      let k = c === a ? 0 : clamp((rt - a.t) / (c.t - a.t), 0, 1);
      // Un salto grande es una reaparición: no se interpola a través del mapa.
      if (Math.hypot(c.x - a.x, c.z - a.z) > 6) k = k < 0.5 ? 0 : 1;
      const x = lerp(a.x, c.x, k); const y = lerp(a.y, c.y, k); const z = lerp(a.z, c.z, k);
      const flags = k < 0.5 ? a.f : c.f;

      const moved = r.placed ? Math.hypot(x - r.x, z - r.z) : 0;
      r.speed = dt > 0 && moved < 3 ? damp(r.speed, moved / dt, 10, dt) : 0;
      r.x = x; r.y = y; r.z = z;
      r.yaw = a.yaw + angleDelta(a.yaw, c.yaw) * k;
      r.pitch = lerp(a.pitch, c.pitch, k);
      r.flags = flags;
      r.placed = true;

      const p = r.pose;
      const dead = this.isDown(r);
      const moving = r.speed > 0.4 && !dead;
      p.walk = damp(p.walk, moving ? Math.min(1, r.speed / 2.4) : 0, 9, dt);
      if (moving) p.phase += dt * (3.2 + r.speed * 1.5);
      p.crouch = damp(p.crouch, flags & FLAG.CROUCH ? 1 : 0, 9, dt);
      const leanBits = (flags >> LEAN_SHIFT) & 3;
      p.lean = damp(p.lean, dead ? 0 : leanBits === 1 ? -1 : leanBits === 2 ? 1 : 0, 10, dt);
      p.aim = damp(p.aim, flags & FLAG.SPRINT || dead ? 0 : 1, 8, dt);
      p.aimPitch = r.pitch;
      p.flinchX = damp(p.flinchX, 0, 7, dt); p.flinchY = damp(p.flinchY, 0, 7, dt);
      p.death = dead ? Math.min(1, p.death + dt / 0.75) : 0;

      // Arma en mano: cambia la variante del modelo y la postura.
      const w = this.weaponOf(r);
      if (w !== r.weapon) {
        r.weapon = w;
        r.s.mesh.geometry = soldierGeometry(w, teamLook(r.team));
        r.cone.position.z = CONE_Z[w]; r.fl.position.z = CONE_Z[w] - 0.02;
      }
      p.weapon = w;
      if (r.swingT < 1) r.swingT = Math.min(1, r.swingT + dt / SWING_TIME);
      p.swing = r.swingT < 1 ? r.swingT : 0;

      const lit = (flags & FLAG.LIGHT) !== 0 && !dead;
      r.cone.visible = lit; r.fl.visible = lit;

      poseSoldier(r.s, p);
      const mesh = r.s.mesh;
      // Recién reaparecido y protegido: parpadea mientras no se le puede dañar.
      mesh.visible = dead || !(flags & FLAG.SHIELD) || blink;
      mesh.position.set(x, y, z);
      mesh.rotation.y = r.yaw + Math.PI; // el modelo mira a +Z; la cámara, a -Z

      // Nombre: siempre el de los compañeros; el de un rival, mientras se le apunta y un momento después.
      if (r.id === focusId) r.revealT = NAME_LINGER; else r.revealT = Math.max(0, r.revealT - dt);
      const show = !dead && (r.team === myTeam || r.revealT > 0);
      r.tagA = damp(r.tagA, show ? 1 : 0, show ? 16 : 6, dt);
      const tag = r.tag;
      tag.visible = r.tagA > 0.02;
      tag.material.opacity = r.tagA;
      // Sobre la cabeza y con tamaño aparente mínimo para que se lea de lejos.
      tag.position.y = 2.02 - p.crouch * 0.42;
      tag.position.x = -p.lean * 0.38; // sigue a la cabeza al asomarse (el modelo mira a +Z: su derecha es -X)
      const d = Math.hypot(camera.position.x - x, camera.position.y - (y + 1.9), camera.position.z - z);
      const s = TAG_H * Math.max(1, d / 11);
      tag.scale.set(s * (512 / 96), s, 1);
    }
  }
}
