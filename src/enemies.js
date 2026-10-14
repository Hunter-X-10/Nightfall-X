// Enemigos: patrulla, detección, cobertura sencilla, ráfagas, daño por zonas y muerte.
import * as THREE from 'three';
import { createSoldier, poseSoldier, takedownPose } from './enemyModel.js';
import { coneGeometry, coneMaterial, flare } from './volumetric.js';
import { impact, muzzleWorld, tracer } from './fxRecipes.js';
import { angleDelta, clamp, damp, rand, randSign, rayCapsule } from './utils.js';

export const ST = { PATROL: 0, ALERT: 1, COMBAT: 2, DEAD: 3 };
const R = 0.36;
const _v = new THREE.Vector3();
const _hit = {};
const _pos = { x: 0, z: 0 };

export class Enemies {
  constructor(scene, col, fx, audio, surf, coverNodes) {
    this.scene = scene; this.col = col; this.fx = fx; this.audio = audio; this.surf = surf;
    this.cover = coverNodes;
    this.list = [];
    this.coneGeo = coneGeometry(1.5, 9, true);
    this.onKilled = null;
    this.combatLevel = 0;
    this.active = true; // en partidas en línea no hay IA
  }

  setActive(v) {
    this.active = v;
    for (const e of this.list) e.s.mesh.visible = v;
    if (!v) this.combatLevel = 0;
  }

  spawn(specs) {
    for (const spec of specs) {
      const s = createSoldier(this.surf);
      const cone = new THREE.Mesh(this.coneGeo, coneMaterial(0xcfe0ff, 0.2, 1.3, 1.2));
      cone.position.set(0.035, 0.045, 0.5);
      const fl = flare(0xdfeaff, 0.38, 1.1);
      fl.position.set(0.035, 0.045, 0.48);
      s.bone.gun.add(cone, fl);
      this.scene.add(s.mesh);
      this.list.push({ spec, s, cone, fl, pose: {} });
    }
    this.reset();
  }

  reset() {
    this.list.forEach((e, i) => {
      const sp = e.spec;
      Object.assign(e, {
        x: sp.x, z: sp.z, yaw: sp.yaw || 0, state: ST.PATROL, hp: 100, wp: 0, wait: rand(0, 2),
        awareness: 0, think: i * 0.03, canSee: false, dist: 99, lostT: 0, lastX: sp.x, lastZ: sp.z,
        coverNode: null, peek: false, peekT: 0, peekX: 0, peekZ: 0, reaction: 0, burst: 0, shotCool: 0, pause: 0, grace: 1,
        stuckT: 0, sx: sp.x, sz: sp.z, sideT: 0, sideX: 0, sideZ: 0, tx: sp.x, tz: sp.z, moving: false, shout: 0, deadT: 0, flinchV: 0, speed: 0,
        td: -1, // remate con el cuchillo: segundos desde que el jugador lo agarró (-1 = no)
      });
      Object.assign(e.pose, { phase: i * 1.3, walk: 0, crouch: 0, aim: 0, aimPitch: 0, flinchX: 0, flinchY: 0, death: 0, deathDir: 1, deathTwist: 0, lean: 0, look: i, grab: 0, slump: 0 });
      e.cone.visible = true; e.fl.visible = true;
      e.s.mesh.visible = this.active;
    });
    this.combatLevel = 0;
  }

  get alive() { return this.list.reduce((n, e) => n + (e.state !== ST.DEAD ? 1 : 0), 0); }

  // Rayo del jugador contra los enemigos. Devuelve { enemy, part, dist } o null.
  // pad: holgura añadida a las zonas de impacto (cuerpo a cuerpo).
  raycast(ox, oy, oz, dx, dy, dz, maxT, pad = 0) {
    if (!this.active) return null;
    let best = null; let bt = maxT;
    for (const e of this.list) {
      if (e.state === ST.DEAD && e.pose.death > 0.5) continue;
      const cr = e.pose.crouch;
      const hipY = 0.95 - cr * 0.4; const shY = hipY + 0.5; const headY = shY + 0.2;
      const lean = cr * 0.12;
      const fx = Math.sin(e.yaw) * lean; const fz = Math.cos(e.yaw) * lean;
      let t = rayCapsule(ox, oy, oz, dx, dy, dz, e.x + fx, headY, e.z + fz, e.x + fx, headY + 0.03, e.z + fz, 0.135 + pad, bt);
      if (t >= 0 && t < bt) { bt = t; best = { enemy: e, part: 'head', dist: t }; }
      t = rayCapsule(ox, oy, oz, dx, dy, dz, e.x, hipY + 0.12, e.z, e.x + fx, shY - 0.08, e.z + fz, 0.23 + pad, bt);
      if (t >= 0 && t < bt) { bt = t; best = { enemy: e, part: 'torso', dist: t }; }
      t = rayCapsule(ox, oy, oz, dx, dy, dz, e.x, 0.12, e.z, e.x, hipY, e.z, 0.19 + pad, bt);
      if (t >= 0 && t < bt) { bt = t; best = { enemy: e, part: 'legs', dist: t }; }
    }
    return best;
  }

  damage(e, part, amount, dirX, dirZ) {
    if (!this.active || e.state === ST.DEAD) return false;
    e.hp -= amount;
    e.pose.flinchX += rand(0.1, 0.25); e.pose.flinchY += rand(-0.35, 0.35);
    e.shotCool = Math.max(e.shotCool, 0.3);
    if (e.hp <= 0) {
      e.state = ST.DEAD; e.deadT = 0;
      // Cae en el sentido del impacto respecto a hacia dónde mira.
      const facing = Math.sin(e.yaw) * dirX + Math.cos(e.yaw) * dirZ;
      e.pose.deathDir = facing < 0 ? 1 : -1;
      e.pose.deathTwist = rand(-1, 1);
      e.cone.visible = false; e.fl.visible = false;
      this.onKilled?.(e, part);
      return true;
    }
    if (e.state !== ST.COMBAT) this.engage(e, 0.25);
    return false;
  }

  // El jugador lo agarra por la espalda para rematarlo: deja de actuar y hace la animación de la víctima.
  // La muerte llega con la puñalada (damage), sin cambiar la animación.
  grab(e) {
    if (e.state === ST.DEAD) return;
    e.td = 0;
    e.moving = false;
    e.cone.visible = false; e.fl.visible = false;
  }

  engage(e, reaction = rand(0.5, 0.9)) {
    if (e.state === ST.DEAD || e.state === ST.COMBAT) return;
    e.state = ST.COMBAT; e.reaction = reaction; e.grace = 0.35; e.shout = 0.7; e.burst = 0; e.pause = 0; e.coverNode = null; e.awareness = 1;
  }

  // Ruido (disparo del jugador): alerta a quien esté dentro del radio.
  hear(x, z, radius) {
    if (!this.active) return;
    for (const e of this.list) {
      if (e.state === ST.DEAD || e.state === ST.COMBAT) continue;
      if (Math.hypot(e.x - x, e.z - z) < radius) { e.state = ST.ALERT; e.lastX = x; e.lastZ = z; e.lostT = 0; e.awareness = Math.max(e.awareness, 0.6); }
    }
  }

  pickCover(e, px, pz) {
    let best = null; let bs = 1e9;
    for (const n of this.cover) {
      if (n.user && n.user !== e && n.user.state !== ST.DEAD) continue;
      const de = Math.hypot(n.x - e.x, n.z - e.z);
      if (de > 20) continue;
      const dp = Math.hypot(n.x - px, n.z - pz);
      if (dp < 7 || dp > 42) continue;
      // El obstáculo debe quedar entre el nodo y el jugador.
      if (((px - n.x) * n.nx + (pz - n.z) * n.nz) / dp < 0.45) continue;
      const score = de + Math.abs(dp - 17) * 0.6 + (n === e.badNode ? 30 : 0) + Math.random() * 3;
      if (score < bs && this.col.raycast(e.x, 0.6, e.z, (n.x - e.x) / (de || 1), 0, (n.z - e.z) / (de || 1), de, 'solid', _hit, false) === null) { bs = score; best = n; }
    }
    if (e.coverNode) e.coverNode.user = null;
    e.coverNode = best;
    if (best) best.user = e;
    e.peek = false; e.peekT = rand(0.4, 1.0);
  }

  move(e, tx, tz, speed, dt) {
    let dx = tx - e.x; let dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) { e.moving = false; return true; }
    dx /= d; dz /= d;
    if (e.sideT > 0) { e.sideT -= dt; dx = dx * 0.25 + e.sideX; dz = dz * 0.25 + e.sideZ; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
    const step = Math.min(d, speed * dt);
    _pos.x = e.x + dx * step; _pos.z = e.z + dz * step;
    this.col.resolveCircle(_pos, R, 0, 1.7, 0.28);
    e.x = _pos.x; e.z = _pos.z;
    e.moving = true; e.speed = speed; e.mdx = dx; e.mdz = dz;
    // Atasco: si apenas avanza, se desplaza de lado un momento.
    e.stuckT += dt;
    if (e.stuckT > 0.7) {
      if (Math.hypot(e.x - e.sx, e.z - e.sz) < speed * 0.25) { const s = randSign(); e.sideX = -dz * s; e.sideZ = dx * s; e.sideT = rand(0.6, 1.2); e.stuckN = (e.stuckN || 0) + 1; }
      else e.stuckN = 0;
      e.sx = e.x; e.sz = e.z; e.stuckT = 0;
    }
    return false;
  }

  update(dt, player, game) {
    if (!this.active) return;
    const px = player.pos.x; const pz = player.pos.z; const pEye = player.eyeY;
    const hx = player.headX; const hz = player.headZ; // la cabeza se desplaza al asomarse a cubierto
    let combat = 0;
    for (const e of this.list) {
      const p = e.pose;
      if (e.td >= 0) {
        // Remate: quieto, sin percibir ni disparar. Al terminar la caída queda muerto en el suelo.
        e.td += dt;
        takedownPose(p, e.td);
        p.walk = 0; p.crouch = damp(p.crouch, 0, 10, dt); p.aim = damp(p.aim, 0, 10, dt);
        this.applyPose(e);
        if (p.death >= 1 && e.state === ST.DEAD) { e.td = -1; e.deadT = 9; }
        else if (e.td > 2.5) { e.td = -1; p.grab = 0; p.slump = 0; p.death = 0; e.cone.visible = true; e.fl.visible = true; } // no llegó la puñalada: lo suelta
        continue;
      }
      if (e.state === ST.DEAD) {
        e.deadT += dt;
        p.death = Math.min(1, e.deadT / 0.75); p.walk = damp(p.walk, 0, 10, dt); p.aim = damp(p.aim, 0, 6, dt);
        p.flinchX = damp(p.flinchX, 0, 8, dt); p.flinchY = damp(p.flinchY, 0, 8, dt);
        if (e.deadT < 1.2) this.applyPose(e);
        continue;
      }
      const dx = px - e.x; const dz = pz - e.z;
      e.dist = Math.hypot(dx, dz);
      const eyeY = 1.62 - p.crouch * 0.42;

      // --- Percepción (escalonada) ---
      e.think -= dt;
      if (e.think <= 0) {
        e.think = 0.12;
        e.canSee = !player.dead && e.dist < 75 && this.col.lineOfSight(e.x, eyeY, e.z, hx, pEye - 0.15, hz);
        if (e.state !== ST.COMBAT) {
          const facing = (Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / (e.dist || 1);
          const range = (player.crouching ? 19 : 29) + (game.flashlight ? 9 : 0) + (e.state === ST.ALERT ? 10 : 0);
          if (e.canSee && e.dist < range && (facing > 0.3 || e.dist < 4.5)) e.awareness += 0.12 * (2.6 - 1.9 * (e.dist / range));
          else e.awareness = Math.max(0, e.awareness - 0.12 * 0.3);
          if (e.awareness >= 1) this.engage(e);
        }
        if (e.canSee && e.state === ST.COMBAT) { e.lastX = px; e.lastZ = pz; e.lostT = 0; }
      }
      e.moving = false;
      let faceX = Math.sin(e.yaw); let faceZ = Math.cos(e.yaw);
      let wantAim = 0; let wantCrouch = 0;

      if (e.state === ST.PATROL) {
        const path = e.spec.path;
        if (path && path.length) {
          if (e.wait > 0) { e.wait -= dt; p.look += dt * 0.9; }
          else if (this.move(e, path[e.wp][0], path[e.wp][1], 1.25, dt)) { e.wp = (e.wp + 1) % path.length; e.wait = rand(1.5, 4.5); }
          if (e.moving) { faceX = e.mdx; faceZ = e.mdz; }
        } else p.look += dt * 0.7;
      } else if (e.state === ST.ALERT) {
        wantAim = 0.7;
        e.lostT += dt;
        if (this.move(e, e.lastX, e.lastZ, 2.5, dt) || e.lostT > 9 || (e.stuckN || 0) > 3) {
          p.look += dt * 1.6;
          if (e.lostT > 12) { e.state = ST.PATROL; e.awareness = 0; e.stuckN = 0; }
        }
        if (e.moving) { faceX = e.mdx; faceZ = e.mdz; }
      } else {
        combat++;
        wantAim = 1;
        e.lostT += dt;
        if (e.shout > 0) { e.shout -= dt; if (e.shout <= 0) for (const o of this.list) if (o !== e && Math.hypot(o.x - e.x, o.z - e.z) < 30) { o.lastX = e.lastX; o.lastZ = e.lastZ; this.engage(o, rand(0.6, 1.1)); } }
        // Cobertura: elegir, ir, asomarse por ciclos.
        if (!e.coverNode || (e.stuckN || 0) > 2 || e.lostT > 6) {
          if (e.coverNode) e.badNode = e.coverNode;
          this.pickCover(e, e.lastX, e.lastZ); e.stuckN = 0; if (e.lostT > 6) e.lostT = 3;
        }
        const n = e.coverNode;
        let atCover = false;
        if (n) {
          const gx = n.x + (e.peek ? e.peekX : 0); const gz = n.z + (e.peek ? e.peekZ : 0);
          atCover = this.move(e, gx, gz, 4.3, dt) || Math.hypot(gx - e.x, gz - e.z) < 0.5;
          if (Math.hypot(n.x - e.x, n.z - e.z) < 1.6) {
            e.peekT -= dt;
            if (e.peekT <= 0) {
              e.peek = !e.peek;
              e.peekT = e.peek ? rand(1.6, 3.0) : rand(0.7, 1.7);
              if (e.peek && !n.low) { // en cobertura alta, salir por el lado con línea de tiro
                const lx = -dz / (e.dist || 1); const lz = dx / (e.dist || 1); const s = randSign();
                const ok = (k) => this.col.lineOfSight(n.x + lx * k, 1.5, n.z + lz * k, px, pEye - 0.2, pz);
                const k = ok(1.3 * s) ? 1.3 * s : ok(-1.3 * s) ? -1.3 * s : 0;
                e.peekX = lx * k; e.peekZ = lz * k;
                if (k === 0) { e.badNode = n; e.coverNode.user = null; e.coverNode = null; }
              } else { e.peekX = 0; e.peekZ = 0; }
            }
            wantCrouch = n.low && !e.peek ? 1 : 0;
          }
        } else if (e.canSee) {
          // Sin cobertura: se mueve de lado mientras dispara.
          e.peekT -= dt;
          if (e.peekT <= 0) { e.peekT = rand(0.8, 1.8); const s = randSign(); e.tx = e.x - (dz / e.dist) * 2.5 * s; e.tz = e.z + (dx / e.dist) * 2.5 * s; }
          this.move(e, e.tx, e.tz, 2.2, dt);
        }
        faceX = e.lastX - e.x; faceZ = e.lastZ - e.z;
        // --- Disparo en ráfagas ---
        e.reaction -= dt; e.shotCool -= dt;
        const exposed = !n || e.peek || !atCover || !n.low;
        if (e.reaction <= 0 && e.canSee && exposed && p.aim > 0.8 && !player.dead) {
          if (e.burst > 0) { if (e.shotCool <= 0) { this.shoot(e, player, game); e.burst--; e.shotCool = 0.105; if (e.burst === 0) e.pause = rand(0.55, 1.25); } }
          else { e.pause -= dt; if (e.pause <= 0) e.burst = 3 + Math.floor(Math.random() * 4); }
        }
        e.grace = Math.min(1, e.grace + dt * 0.35);
      }

      // --- Orientación y pose ---
      const targetYaw = Math.atan2(faceX, faceZ);
      e.yaw += angleDelta(e.yaw, targetYaw) * Math.min(1, dt * (e.state === ST.COMBAT ? 9 : 5));
      p.walk = damp(p.walk, e.moving ? Math.min(1, e.speed / 2.4) : 0, 9, dt);
      if (e.moving) p.phase += dt * (3.2 + e.speed * 1.5);
      p.crouch = damp(p.crouch, wantCrouch, 8, dt);
      p.aim = damp(p.aim, wantAim, 7, dt);
      p.aimPitch = damp(p.aimPitch, Math.atan2(pEye - 0.25 - (1.38 - p.crouch * 0.4), Math.max(1, e.dist)), 8, dt);
      p.flinchX = damp(p.flinchX, 0, 7, dt); p.flinchY = damp(p.flinchY, 0, 7, dt);
      this.applyPose(e);
    }
    this.combatLevel = combat;
  }

  applyPose(e) {
    poseSoldier(e.s, e.pose);
    e.s.mesh.position.set(e.x, 0, e.z);
    e.s.mesh.rotation.y = e.yaw;
  }

  shoot(e, player, game) {
    const g = e.s.bone.gun;
    e.s.mesh.updateMatrixWorld(true);
    g.localToWorld(_v.set(0, 0.045, 0.7));
    const mx = _v.x; const my = _v.y; const mz = _v.z;
    // A cubierto sólo asoma la cabeza: se apunta a ella (que se desplaza al asomarse por un lado).
    const tx = player.headX; const tz = player.headZ;
    const ty = player.eyeY - (player.inCover ? 0.12 : 0.32);
    let dx = tx - mx; let dy = ty - my; let dz = tz - mz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    dx /= dist; dy /= dist; dz /= dist;
    // Probabilidad de acierto según distancia, movimiento y postura del jugador.
    const acc = 0.5 * clamp(1.15 - dist / 46, 0.22, 1) * (player.speed > 4.5 ? 0.55 : player.speed > 1.5 ? 0.8 : 1) * (player.crouching ? 0.8 : 1) * e.grace * game.difficulty;
    const hitPlayer = Math.random() < acc;
    const miss = hitPlayer ? 0.006 : clamp(0.9 / dist, 0.02, 0.28) + Math.random() * 0.05;
    const a = Math.random() * Math.PI * 2;
    // Base ortonormal alrededor de la dirección para desviar el tiro.
    const rx = -dz; const rz = dx; const rl = Math.hypot(rx, rz) || 1;
    // Los fallos se desvían sobre todo en horizontal (el jugador es alto y estrecho).
    const sideK = hitPlayer ? Math.cos(a) : (Math.cos(a) < 0 ? -1 : 1) * (0.75 + 0.5 * Math.random());
    dx += (rx / rl) * sideK * miss; dz += (rz / rl) * sideK * miss; dy += Math.sin(a) * miss * (hitPlayer ? 0.7 : 0.45);
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;

    const w = this.col.raycast(mx, my, mz, dx, dy, dz, 140, 'bullets', _hit, true);
    const wd = w ? w.dist : 140;
    // Cuerpo del jugador: de los pies a la cabeza, inclinado si se asoma.
    const pt = rayCapsule(mx, my, mz, dx, dy, dz, player.pos.x, player.pos.y + 0.25, player.pos.z, tx, player.eyeY, tz, 0.34, wd);
    let ex; let ey; let ez;
    if (pt >= 0) {
      ex = mx + dx * pt; ey = my + dy * pt; ez = mz + dz * pt;
      player.damage(rand(7, 11) * (dist > 32 ? 0.8 : 1), e.x, e.z);
    } else {
      ex = mx + dx * wd; ey = my + dy * wd; ez = mz + dz * wd;
      if (w) game.worldImpact(w, false);
      // Silbido si la bala pasa cerca de la cabeza.
      const along = (tx - mx) * dx + (player.eyeY - my) * dy + (tz - mz) * dz;
      if (along > 0 && along < wd) {
        const cx = mx + dx * along - tx; const cy = my + dy * along - player.eyeY; const cz = mz + dz * along - tz;
        if (cx * cx + cy * cy + cz * cz < 2.2) this.audio.whizz(Math.sign(cx * Math.cos(player.yaw) - cz * Math.sin(player.yaw)) || 1);
      }
    }
    muzzleWorld(this.fx, mx, my, mz, dx, dy, dz);
    tracer(this.fx, mx, my, mz, ex, ey, ez, 6, 2.6, 1.2, 190);
    this.audio.enemyShot(mx, my, mz);
  }
}
