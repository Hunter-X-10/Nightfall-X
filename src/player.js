// Controlador en primera persona: movimiento con inercia, sprint, agacharse, salto, cobertura (al agacharse
// junto a un obstáculo) con asomarse a los lados, balanceo de cabeza, retroceso de cámara, resistencia para el
// sprint, deslizamiento (agacharse esprintando), trepar obstáculos bajos, salud con regeneración, chaleco y el
// bloqueo durante un remate con el cuchillo.
import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp, smoothstep } from './utils.js';
import { BASE, ROAD, SPAWN } from './layout.js';

const RADIUS = 0.38;
const EYE_STAND = 1.68;
const EYE_CROUCH = 1.02;
const GRAVITY = 19;
// Asomarse: desplazamiento lateral de la cabeza (el mismo que la pose de los soldados remotos, ver
// poseSoldier y remotePlayers.raycast), bajada de la cámara por metro desplazado y giro de la vista.
export const LEAN_DIST = 0.38;
const LEAN_DROP = 0.13;
const LEAN_ROLL = 0.17;
const COVER_REACH = 0.35; // distancia máxima al obstáculo para ponerse a cubierto
const COVER_LOW = 1.45; // una cobertura más baja deja asomarse por encima al apuntar
// Resistencia (0-1): el sprint la gasta en 5 s y, tras una pausa, se recupera en ~4 s andando o ~3 s
// quieto o agachado. Si se agota no se vuelve a esprintar hasta recuperar STAMINA_MIN (evita tirones).
const STAMINA_DRAIN = 0.2;
const STAMINA_REGEN = 0.25;
const STAMINA_REGEN_REST = 0.34;
const STAMINA_DELAY = 1;
const STAMINA_MIN = 0.3;
const STAMINA_JUMP = 0.1;
// Deslizamiento: agacharse mientras se esprinta (o poco después) da un impulso en la dirección de la carrera
// que se frena hasta el paso agachado en SLIDE_TIME. La dirección no cambia; la vista sí, y se puede disparar.
// Es permisivo: vale pulsar agacharse hasta SLIDE_GRACE s después de soltar el sprint, y la pulsación se
// recuerda SLIDE_BUFFER s en el suelo (en el aire no caduca: tras un salto esprintando, se desliza al aterrizar).
const SLIDE_TIME = 0.8;
const SLIDE_SPEED = 8.4;
const SLIDE_MIN = 3.4; // velocidad mínima para empezar a deslizarse
const SLIDE_GRACE = 0.4;
const SLIDE_BUFFER = 0.3;
const SLIDE_STAMINA = 0.12;
const SLIDE_COOL = 0.45; // segundos tras un deslizamiento antes de poder hacer otro
const EYE_SLIDE = 0.86;
// Trepar: saltar (Espacio) frente a un obstáculo de VAULT_MIN a VAULT_MAX m de alto a menos de VAULT_REACH m
// lo salta si es estrecho (hasta VAULT_DEPTH m de fondo y con sitio detrás) o se sube encima si no. También
// vale pulsar Espacio un poco antes de llegar: la pulsación se recuerda VAULT_BUFFER s, en el aire incluida.
const VAULT_MIN = 0.4;
const VAULT_MAX = 1.25;
const VAULT_REACH = 0.75; // desde el borde del cuerpo
const VAULT_DEPTH = 1.2;
const VAULT_DROP = 1.6; // caída máxima al otro lado
const VAULT_BUFFER = 0.3;
const VAULT_STAMINA = 0.08;
// Remate: el jugador se coloca a esta distancia detrás de la víctima, mirando a su nuca.
const TAKEDOWN_DIST = 0.7;
const TAKEDOWN_MOVE = 0.22; // segundos para llegar a ese sitio
const _mouse = { x: 0, y: 0 };
const _cover = {};
const _ray = {};
const _spot = { x: 0, z: 0 };

export class Player {
  constructor(camera, col, events) {
    this.camera = camera;
    this.col = col;
    this.events = events; // { step(surface, loud), land(v), hurt(amount), death(), exhausted(), slide(surface), vault(surface), armorBreak() }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.sensitivity = 1;
    this.baseFov = 74;
    this.aimZoom = 20; // grados de campo de visión que se cierran al apuntar (depende del arma)
    this.speedK = 1; // factor de velocidad del arma en mano
    this.bounds = { x0: BASE.x0 - 3.5, x1: BASE.x1 + 3.5, z0: BASE.z0 + 0.6, z1: ROAD.zSouth - 4 }; // límites del mapa en uso
    this.groundSurface = () => 'asphalt';
    this.reset();
  }

  reset(spawn = SPAWN) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.eye = EYE_STAND;
    this.onGround = true;
    this.crouching = false;
    this.sprinting = false;
    this.moving = false;
    this.speed = 0;
    this.health = 100;
    this.armor = 0; // chaleco (0 a ARMOR_MAX): recibe el daño antes que la vida
    this.stamina = 1;
    this.exhausted = false;
    this.restT = 0; // segundos sin gastar resistencia
    this.dead = false;
    this.invulnerable = false;
    this.lastHurt = -99;
    this.time = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.stepDist = 0;
    this.landDip = 0;
    this.roll = 0;
    this.punchP = 0; this.punchY = 0; this.punchVP = 0; this.punchVY = 0; // retroceso transitorio
    this.shake = 0;
    this.fov = this.baseFov;
    this.aimT = 0;
    this.mouseDX = 0; this.mouseDY = 0; // para el balanceo del arma
    this.deathT = 0;
    this.hurtDir = 0;
    this.inCover = false;
    this.coverLow = false;
    this.coverT = 0;
    this.leanDir = 0; // -1 izquierda, 0 nada, 1 derecha (lo que se pide con Q/E)
    this.lean = 0; // desplazamiento lateral real de la cabeza, en metros (+ derecha)
    this.headX = this.pos.x; this.headZ = this.pos.z; // posición de la cabeza en planta (para la IA)
    this.lock = null; // remate en curso: no se controla el movimiento ni se recibe daño
    this.sliding = false;
    this.slideT = 0; // segundos desde que empezó el deslizamiento
    this.slideX = 0; this.slideZ = 0; // dirección del deslizamiento
    this.slideCool = 0;
    this.slideK = 0; // 0-1, suavizado (inclinación de la cámara y del arma)
    this.crouchPrev = false; // para detectar el momento de pulsar agacharse
    this.slideBuf = 0; // segundos que aún vale la última pulsación de agacharse para deslizarse
    this.sprintAgo = 99; // segundos en el suelo desde que se dejó de esprintar (no cuenta en el aire)
    this.vault = null; // salto o subida a un obstáculo en curso (ver tryVault)
    this.vaultK = 0; // 0-1-0 a lo largo del salto (arma y cámara)
    this.vaultBuf = 0; // segundos que aún vale la última pulsación de Espacio para trepar
    this.jumpY = 0; // altura de los pies al despegar (para medir obstáculos desde el aire)
  }

  get eyeY() { return this.pos.y + this.eye; }
  get height() { return this.crouching ? 1.25 : 1.8; }

  addRecoil(pitch, yaw) {
    this.pitch += pitch * 0.38;
    this.yaw += yaw * 0.38;
    this.punchVP += pitch * 14;
    this.punchVY += yaw * 14;
  }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

  // El chaleco se lleva el daño primero, salvo con `pierce` (la puñalada rápida, que deja la vida en lo justo).
  damage(amount, fromX, fromZ, pierce = false) {
    if (this.dead || this.invulnerable || this.lock) return;
    if (this.armor > 0 && !pierce) {
      const took = Math.min(this.armor, amount);
      this.armor -= took; amount -= took;
      if (this.armor <= 0) { this.armor = 0; this.events.armorBreak?.(); }
    }
    this.health -= amount;
    this.lastHurt = this.time;
    this.addShake(0.25);
    this.punchVP += (Math.random() - 0.3) * 0.9;
    this.punchVY += (Math.random() - 0.5) * 0.9;
    // Ángulo del agresor relativo a la vista (para el indicador del HUD).
    const ang = Math.atan2(fromX - this.pos.x, -(fromZ - this.pos.z));
    this.hurtDir = ang + this.yaw;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.events.death?.();
    }
    this.events.hurt?.(amount);
  }

  update(dt, input, aiming, canSprint = true) {
    this.time += dt;
    if (this.dead || this.lock) { this.sliding = false; this.slideK = damp(this.slideK, 0, 10, dt); this.vault = null; this.vaultK = 0; }
    if (this.dead) return this.updateDead(dt);
    if (this.lock) return this.updateLock(dt, input);
    if (this.vault) return this.updateVault(dt, input);

    // --- Vista ---
    input.consumeMouse(_mouse);
    const sens = 0.0021 * this.sensitivity * lerp(1, 0.62, this.aimT);
    this.mouseDX = _mouse.x; this.mouseDY = _mouse.y;
    this.yaw -= _mouse.x * sens;
    this.pitch = clamp(this.pitch - _mouse.y * sens, -1.48, 1.48);

    // --- Dirección deseada ---
    let fwd = 0; let str = 0;
    if (input.down('KeyW')) fwd += 1;
    if (input.down('KeyS')) fwd -= 1;
    if (input.down('KeyD')) str += 1;
    if (input.down('KeyA')) str -= 1;
    const len = Math.hypot(fwd, str);
    if (len > 0) { fwd /= len; str /= len; }
    this.moving = len > 0;

    // --- Agacharse y cobertura ---
    // Agachado junto a un obstáculo que tape al menos hasta la cadera se está a cubierto: al pulsar agacharse
    // a su lado o al llegar a él (o a su esquina) ya agachado. Se sale al levantarse, al saltar o al alejarse.
    const wantCrouch = input.crouch;
    const crouchHit = wantCrouch && !this.crouchPrev;
    this.crouchPrev = wantCrouch;
    // Deslizamiento: al pulsar agacharse esprintando o justo después (sprinting es del fotograma anterior).
    this.slideCool = Math.max(0, this.slideCool - dt);
    this.slideBuf = crouchHit ? SLIDE_BUFFER : this.onGround ? Math.max(0, this.slideBuf - dt) : this.slideBuf;
    if (this.sprinting) this.sprintAgo = 0;
    else if (this.onGround) this.sprintAgo += dt;
    if (this.slideBuf > 0 && wantCrouch && !this.sliding && this.onGround && this.sprintAgo < SLIDE_GRACE
      && Math.hypot(this.vel.x, this.vel.z) > SLIDE_MIN && this.slideCool <= 0) {
      this.slideBuf = 0;
      this.startSlide();
    }
    if (this.sliding) {
      this.slideT += dt;
      // Termina al acabarse el impulso, al soltar agacharse, al caer de un borde o al chocar con algo.
      if (this.slideT >= SLIDE_TIME || !wantCrouch || !this.onGround || (this.slideT > 0.15 && this.speed < 1.5)) this.endSlide();
    }
    if (!wantCrouch || !this.onGround || this.sliding) this.inCover = false;
    else if ((this.coverT -= dt) <= 0) this.inCover = this.findCover();
    // Tras una cobertura baja, apuntar asoma por encima: de pie mientras se apunta (no bajo un obstáculo).
    const peekUp = this.inCover && this.coverLow && aiming;
    if (wantCrouch && !peekUp) this.crouching = true;
    else if (this.crouching && !this.col.blockedAbove(this.pos.x, this.pos.z, RADIUS, this.pos.y + 1.3, this.pos.y + 1.8)) this.crouching = false;

    this.sprinting = canSprint && !this.exhausted && input.sprint && fwd > 0.5 && !this.crouching && !aiming && this.onGround;
    const maxSpeed = (this.crouching ? 1.9 : this.sprinting ? 6.4 : aiming ? 2.3 : 3.9) * this.speedK;

    const sin = Math.sin(this.yaw); const cos = Math.cos(this.yaw);
    let wx = (-sin * fwd + cos * str) * maxSpeed;
    let wz = (-cos * fwd - sin * str) * maxSpeed;
    // Inercia: acelera rápido, frena algo más lento; poco control en el aire.
    let lambda = this.onGround ? (this.moving ? 9.5 : 12) : 1.6;
    if (this.sliding) {
      // En la dirección en la que empezó, frenando hasta el paso agachado.
      const sp = lerp(SLIDE_SPEED, 1.9, smoothstep(0, 1, this.slideT / SLIDE_TIME)) * this.speedK;
      wx = this.slideX * sp; wz = this.slideZ * sp;
      lambda = 20;
    }
    this.vel.x = damp(this.vel.x, wx, lambda, dt);
    this.vel.z = damp(this.vel.z, wz, lambda, dt);

    // Trepar: Espacio frente a un obstáculo bajo (o poco antes de llegar, aunque ya se haya saltado).
    this.vaultBuf = input.hit('Space') ? VAULT_BUFFER : Math.max(0, this.vaultBuf - dt);
    if (this.onGround) this.jumpY = this.pos.y;
    if (this.vaultBuf > 0 && this.tryVault()) { this.vaultBuf = 0; return this.updateVault(0, input); }

    if (this.onGround && input.hit('Space') && !this.crouching) {
      this.vel.y = 5.7;
      this.onGround = false;
      this.stamina = Math.max(0, this.stamina - STAMINA_JUMP);
      this.restT = 0;
    }
    this.vel.y -= GRAVITY * dt;

    // --- Resistencia ---
    if (this.sprinting) { this.stamina -= STAMINA_DRAIN * dt; this.restT = 0; }
    else if ((this.restT += dt) > STAMINA_DELAY) {
      this.stamina = Math.min(1, this.stamina + (this.moving && !this.crouching ? STAMINA_REGEN : STAMINA_REGEN_REST) * dt);
    }
    if (this.stamina <= 0) {
      this.stamina = 0;
      if (!this.exhausted) { this.exhausted = true; this.events.exhausted?.(); }
    } else if (this.stamina >= STAMINA_MIN) this.exhausted = false;

    // --- Integración con subpasos y colisión ---
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.z) * dt) / 0.18));
    const sdt = dt / steps;
    const px = this.pos.x; const pz = this.pos.z;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * sdt;
      this.pos.z += this.vel.z * sdt;
      this.col.resolveCircle(this.pos, RADIUS, this.pos.y, this.pos.y + this.height, this.onGround ? 0.32 : 0.1);
    }
    // Límites del mapa.
    this.pos.x = clamp(this.pos.x, this.bounds.x0, this.bounds.x1);
    this.pos.z = clamp(this.pos.z, this.bounds.z0, this.bounds.z1);
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (dt > 0) { this.vel.x = (this.pos.x - px) / dt; this.vel.z = (this.pos.z - pz) / dt; }
    this.speed = moved / Math.max(dt, 1e-5);

    this.pos.y += this.vel.y * dt;
    const ground = this.col.groundHeight(this.pos.x, this.pos.z, this.pos.y, this.onGround ? 0.32 : 0.05, RADIUS * 0.6);
    if (this.pos.y <= ground) {
      if (!this.onGround) {
        const impact = -this.vel.y;
        if (impact > 2.5) { this.landDip = Math.min(0.16, impact * 0.016); this.events.land?.(impact); }
        if (impact > 13) this.damage((impact - 13) * 6, this.pos.x, this.pos.z);
      }
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > ground + 0.05) {
      this.onGround = false;
    }

    // --- Pasos y balanceo ---
    const speedN = clamp(this.speed / 6.4, 0, 1);
    if (this.onGround && this.speed > 0.6 && !this.sliding) {
      this.stepDist += moved;
      const stride = this.sprinting ? 2.05 : this.crouching ? 1.25 : 1.55;
      this.bob += (moved / stride) * Math.PI;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        this.events.step?.(this.groundSurface(this.pos.x, this.pos.z, this.pos.y), this.sprinting ? 1 : this.crouching ? 0.35 : 0.65);
      }
    }
    this.bobAmt = damp(this.bobAmt, this.onGround && !this.sliding ? speedN : 0, 8, dt);
    this.eye = damp(this.eye, this.sliding ? EYE_SLIDE : this.crouching ? EYE_CROUCH : EYE_STAND, this.sliding ? 14 : 11, dt);
    this.slideK = damp(this.slideK, this.sliding ? 1 : 0, 10, dt);
    this.landDip = damp(this.landDip, 0, 7, dt);
    this.aimT = damp(this.aimT, aiming ? 1 : 0, 14, dt);

    // Retroceso transitorio: muelle amortiguado hacia cero.
    this.punchVP += (-this.punchP * 170 - this.punchVP * 17) * dt;
    this.punchVY += (-this.punchY * 170 - this.punchVY * 17) * dt;
    this.punchP += this.punchVP * dt;
    this.punchY += this.punchVY * dt;

    // Inclinación lateral al desplazarse de lado.
    const strafe = (this.vel.x * cos - this.vel.z * sin) / 6.4;
    this.roll = damp(this.roll, -strafe * 0.028, 8, dt);
    this.shake = damp(this.shake, 0, 5.5, dt);

    // --- Asomarse (Q/E), sólo a cubierto ---
    this.leanDir = this.inCover ? (input.down('KeyE') ? 1 : 0) - (input.down('KeyQ') ? 1 : 0) : 0;
    let leanTo = this.leanDir * LEAN_DIST;
    if (leanTo !== 0) {
      // Sin meter la cabeza en una pared: se recorta con un rayo lateral a la altura de los ojos.
      const s = Math.sign(leanTo);
      const hit = this.col.raycast(this.pos.x, this.pos.y + this.eye, this.pos.z, cos * s, 0, -sin * s, LEAN_DIST + 0.2, 'solid', _ray, false);
      if (hit) leanTo = s * Math.max(0, hit.dist - 0.2);
    }
    this.lean = damp(this.lean, leanTo, 10, dt);
    this.headX = this.pos.x + cos * this.lean;
    this.headZ = this.pos.z - sin * this.lean;

    const targetFov = this.baseFov + (this.sprinting ? 8 : 0) + this.slideK * 6 - this.aimT * this.aimZoom;
    this.fov = damp(this.fov, targetFov, 9, dt);
    this.applyCamera();
  }

  startSlide() {
    const v = Math.hypot(this.vel.x, this.vel.z);
    if (v < 0.1) return;
    this.sliding = true;
    this.slideT = 0;
    this.slideX = this.vel.x / v; this.slideZ = this.vel.z / v;
    this.inCover = false;
    this.stamina = Math.max(0, this.stamina - SLIDE_STAMINA);
    this.restT = 0;
    this.events.slide?.(this.groundSurface(this.pos.x, this.pos.z, this.pos.y));
  }

  endSlide() {
    this.sliding = false;
    this.slideCool = SLIDE_COOL;
  }

  // ¿Hay delante (hacia donde se mira) un obstáculo que saltar o al que subirse? Si lo hay, empieza a trepar.
  tryVault() {
    const col = this.col;
    const fx = -Math.sin(this.yaw); const fz = -Math.cos(this.yaw);
    const x = this.pos.x; const z = this.pos.z;
    const base = this.onGround ? this.pos.y : Math.min(this.pos.y, this.jumpY); // pies al despegar
    // Cara del obstáculo: rayos horizontales a varias alturas.
    let d = Infinity; let surface = 'concrete';
    for (const h of [0.45, 0.8, 1.15]) {
      const y = base + h;
      if (y < this.pos.y + 0.1) continue;
      const hit = col.raycast(x, y, z, fx, 0, fz, RADIUS + VAULT_REACH, 'solid', _ray, false);
      if (hit && hit.dist < d) { d = hit.dist; surface = hit.surface; }
    }
    if (d === Infinity) return false;
    // Altura de la tapa justo detrás de la cara (sin contar lo que pase de VAULT_MAX: eso es una pared).
    const top = col.topAt(x + fx * (d + 0.06), z + fz * (d + 0.06), base + VAULT_MAX, 0.02);
    if (top - base < VAULT_MIN || top < this.pos.y + 0.15) return false;
    // Nada encima del jugador que impida subir.
    if (top + 1.75 > this.pos.y + 1.75 && col.blockedAbove(x, z, 0.2, this.pos.y + 1.75, top + 1.75)) return false;
    // Sin nada por encima de la tapa hasta `len` metros, a la altura del cuerpo al pasar.
    const clear = (len, heights) => heights.every((h) => !col.raycast(x, top + h, z, fx, 0, fz, len, 'solid', _ray, false));

    // Fondo del obstáculo: hasta dónde sigue la tapa a la misma altura.
    let exit = -1;
    for (let s = d + 0.08; s <= d + VAULT_DEPTH; s += 0.08) {
      if (col.topAt(x + fx * s, z + fz * s, top + 0.05) < top - 0.25) { exit = s; break; }
    }
    // Estrecho y con sitio libre detrás: se salta al otro lado.
    if (exit > 0) {
      const len = exit + RADIUS + 0.15;
      const sx = x + fx * len; const sz = z + fz * len;
      const gy = col.groundHeight(sx, sz, top - 0.25, 0, RADIUS * 0.6);
      _spot.x = sx; _spot.z = sz;
      if (gy >= base - VAULT_DROP) col.resolveCircle(_spot, RADIUS, gy, gy + 1.8, 0.32);
      if (gy >= base - VAULT_DROP && Math.hypot(_spot.x - sx, _spot.z - sz) < 0.03 && clear(len + RADIUS, [0.2, 0.7, 1.3])) {
        this.startVault(true, sx, gy, sz, top, false, surface);
        return true;
      }
    }
    // Si no, se sube encima (si la tapa se puede pisar y cabe, de pie o agachado).
    const len = d + RADIUS + 0.12;
    const mx = x + fx * len; const mz = z + fz * len;
    if (Math.abs(col.groundHeight(mx, mz, top, 0.05, RADIUS * 0.6) - top) > 0.06) return false;
    _spot.x = mx; _spot.z = mz;
    col.resolveCircle(_spot, RADIUS, top, top + 1.25, 0.32);
    if (Math.hypot(_spot.x - mx, _spot.z - mz) > 0.03 || col.blockedAbove(mx, mz, RADIUS, top + 0.3, top + 1.25)) return false;
    const low = col.blockedAbove(mx, mz, RADIUS, top + 1.25, top + 1.8);
    if (!clear(len, low ? [0.2, 0.7] : [0.2, 0.7, 1.3])) return false;
    this.startVault(false, mx, top, mz, top, low, surface);
    return true;
  }

  // over: salta al otro lado; si no, se sube encima. Termina en (x1, y1, z1), agachado si `crouch`.
  startVault(over, x1, y1, z1, top, crouch, surface) {
    const rise = Math.max(0, top - this.pos.y);
    this.vault = {
      t: 0, time: (over ? 0.5 : 0.44) + rise * 0.12, over, crouch,
      x0: this.pos.x, y0: this.pos.y, z0: this.pos.z, x1, y1, z1, top: top + 0.06,
      dx: x1 - this.pos.x, dz: z1 - this.pos.z,
      speed: Math.max(this.sprinting || this.sprintAgo < SLIDE_GRACE ? 5 : 3.2, Math.hypot(this.vel.x, this.vel.z) * 0.8),
    };
    this.sliding = false; this.inCover = false; this.crouching = false;
    this.stamina = Math.max(0, this.stamina - VAULT_STAMINA);
    this.restT = 0;
    this.events.vault?.(surface);
  }

  // Durante el salto: los pies suben hasta la tapa, avanzan por encima y bajan al otro lado (o se quedan
  // arriba). Se puede mirar alrededor, pero no moverse ni disparar.
  updateVault(dt, input) {
    const V = this.vault;
    input.consumeMouse(_mouse);
    const sens = 0.0021 * this.sensitivity;
    this.mouseDX = _mouse.x; this.mouseDY = _mouse.y;
    this.yaw -= _mouse.x * sens;
    this.pitch = clamp(this.pitch - _mouse.y * sens, -1.48, 1.48);

    V.t += dt;
    const k = Math.min(1, V.t / V.time);
    const px = this.pos.x; const pz = this.pos.z;
    const hk = smoothstep(0.08, 1, k);
    let y;
    if (k < 0.42) y = lerp(V.y0, V.top, 1 - (1 - k / 0.42) ** 2);
    else if (!V.over) y = lerp(V.top, V.y1, (k - 0.42) / 0.58);
    else if (k < 0.68) y = V.top;
    else y = lerp(V.top, V.y1, ((k - 0.68) / 0.32) ** 2);
    this.pos.set(lerp(V.x0, V.x1, hk), y, lerp(V.z0, V.z1, hk));
    this.speed = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-5);
    this.vaultK = Math.sin(Math.PI * k);
    this.onGround = false; this.moving = false; this.sprinting = false;
    this.inCover = false; this.leanDir = 0;
    this.lean = damp(this.lean, 0, 10, dt);
    this.headX = this.pos.x; this.headZ = this.pos.z;
    // La cabeza se agacha un poco al pasar por encima.
    this.eye = damp(this.eye, (V.crouch && k > 0.6 ? EYE_CROUCH : EYE_STAND) - 0.14 * this.vaultK, 12, dt);
    this.easeOff(dt);
    this.fov = damp(this.fov, this.baseFov, 9, dt);

    if (k >= 1) {
      // Sale con algo de impulso hacia delante; al saltar al otro lado, aterriza.
      const l = Math.hypot(V.dx, V.dz) || 1;
      this.vel.set((V.dx / l) * V.speed, 0, (V.dz / l) * V.speed);
      this.pos.y = V.y1;
      this.onGround = true;
      this.crouching = V.crouch;
      this.vault = null; this.vaultK = 0;
      if (V.over) { this.landDip = 0.07; this.events.land?.(4); }
    }
    this.applyCamera();
  }

  // Lleva a reposo el balanceo, el retroceso y la sacudida de la cámara (sin control del jugador).
  easeOff(dt) {
    this.bobAmt = damp(this.bobAmt, 0, 8, dt);
    this.landDip = damp(this.landDip, 0, 7, dt);
    this.aimT = damp(this.aimT, 0, 14, dt);
    this.roll = damp(this.roll, 0, 8, dt);
    this.shake = damp(this.shake, 0, 5.5, dt);
    this.punchVP += (-this.punchP * 170 - this.punchVP * 17) * dt;
    this.punchVY += (-this.punchY * 170 - this.punchVY * 17) * dt;
    this.punchP += this.punchVP * dt;
    this.punchY += this.punchVY * dt;
  }

  // Sitio desde el que rematar a `t` ({ x, y, z, fx, fz }: posición y hacia dónde mira): a su espalda, con
  // suelo a la misma altura, sin chocar con nada y sin paredes entre medias. Devuelve { x, z } o null.
  takedownSpot(t) {
    const x = t.x - t.fx * TAKEDOWN_DIST; const z = t.z - t.fz * TAKEDOWN_DIST;
    const gy = this.col.groundHeight(x, z, t.y, 0.32, RADIUS * 0.6);
    if (Math.abs(gy - t.y) > 0.25) return null;
    _spot.x = x; _spot.z = z;
    this.col.resolveCircle(_spot, RADIUS, gy, gy + EYE_STAND + 0.12, 0.32);
    if (Math.hypot(_spot.x - x, _spot.z - z) > 0.03) return null;
    const dx = x - this.pos.x; const dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      for (const h of [0.45, 1.1]) {
        if (this.col.raycast(this.pos.x, this.pos.y + h, this.pos.z, dx / d, 0, dz / d, d + RADIUS, 'solid', _ray, false)) return null;
      }
    }
    return { x, z, y: gy };
  }

  // Empieza un remate desde `spot` (ver takedownSpot) a la víctima `t`. Dura `time` segundos.
  startTakedown(spot, t, time) {
    this.lock = {
      t: 0, time, x0: this.pos.x, z0: this.pos.z, y0: this.pos.y, x1: spot.x, z1: spot.z, y1: spot.y,
      yaw0: this.yaw, yaw1: Math.atan2(-t.fx, -t.fz), pitch0: this.pitch, pitch1: Math.atan2(t.y + 1.42 - (spot.y + EYE_STAND), TAKEDOWN_DIST),
    };
    this.vel.set(0, 0, 0);
  }

  // Durante el remate: se acerca a la espalda de la víctima y mira a su nuca; el ratón y las teclas no hacen
  // nada. Al terminar se recupera el control donde se ha quedado, que es un sitio libre (takedownSpot).
  updateLock(dt, input) {
    const L = this.lock;
    input.consumeMouse(_mouse);
    L.t += dt;
    const k = smoothstep(0, TAKEDOWN_MOVE, L.t);
    this.pos.set(lerp(L.x0, L.x1, k), lerp(L.y0, L.y1, k), lerp(L.z0, L.z1, k));
    this.col.resolveCircle(this.pos, RADIUS, this.pos.y, this.pos.y + 1.8, 0.32);
    this.yaw = L.yaw0 + angleDelta(L.yaw0, L.yaw1) * k;
    this.pitch = lerp(L.pitch0, L.pitch1, k);
    this.vel.set(0, 0, 0);
    this.onGround = true; this.moving = false; this.sprinting = false; this.speed = 0;
    this.mouseDX = 0; this.mouseDY = 0;
    // De pie para llegar al cuello (si no hay techo encima).
    if (this.crouching && !this.col.blockedAbove(this.pos.x, this.pos.z, RADIUS, this.pos.y + 1.3, this.pos.y + 1.8)) this.crouching = false;
    this.eye = damp(this.eye, this.crouching ? EYE_CROUCH : EYE_STAND, 11, dt);
    this.inCover = false; this.leanDir = 0;
    this.lean = damp(this.lean, 0, 10, dt);
    this.headX = this.pos.x; this.headZ = this.pos.z;
    this.easeOff(dt);
    this.fov = damp(this.fov, this.baseFov, 9, dt);
    if (L.t >= L.time) this.lock = null;
    this.applyCamera();
  }

  updateDead(dt) {
    this.deathT += dt;
    this.eye = damp(this.eye, 0.28, 3.2, dt);
    this.roll = damp(this.roll, 0.9, 2.6, dt);
    this.pitch = damp(this.pitch, 0.25, 2, dt);
    this.shake = damp(this.shake, 0, 4, dt);
    this.inCover = false; this.leanDir = 0;
    this.lean = damp(this.lean, 0, 6, dt);
    this.applyCamera();
  }

  // ¿Hay un obstáculo para ponerse a cubierto? Anota si es bajo (se puede asomar por encima).
  findCover() {
    this.coverT = 0.1;
    const c = this.col.coverInfo(this.pos.x, this.pos.z, RADIUS, this.pos.y, COVER_REACH, _cover);
    if (!c) return false;
    this.coverLow = c.h < COVER_LOW;
    return true;
  }

  applyCamera() {
    const cam = this.camera;
    const bobY = Math.sin(this.bob * 2) * 0.021 * this.bobAmt * (1 - this.aimT * 0.7);
    const bobX = Math.cos(this.bob) * 0.016 * this.bobAmt * (1 - this.aimT * 0.7);
    const sh = this.shake * this.shake;
    const t = this.time * 43;
    const cos = Math.cos(this.yaw); const sin = Math.sin(this.yaw);
    // Asomarse: la cabeza se desplaza de lado, baja un poco y la vista se inclina hacia ese lado.
    const side = bobX + this.lean;
    cam.position.set(
      this.pos.x + cos * side,
      this.pos.y + this.eye + bobY - this.landDip - Math.abs(this.lean) * LEAN_DROP,
      this.pos.z - sin * side,
    );
    cam.rotation.set(
      this.pitch + this.punchP + Math.sin(t * 1.3) * sh * 0.03,
      this.yaw + this.punchY + Math.sin(t + 1.7) * sh * 0.03,
      this.roll - (this.lean / LEAN_DIST) * LEAN_ROLL + this.slideK * 0.07 + this.vaultK * 0.06 + Math.cos(this.bob) * 0.0035 * this.bobAmt + Math.sin(t * 0.9 + 0.4) * sh * 0.02,
    );
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  regen(dt) {
    if (!this.dead && this.health < 100 && this.time - this.lastHurt > 4.5) {
      this.health = Math.min(100, this.health + 14 * dt);
    }
  }
}
