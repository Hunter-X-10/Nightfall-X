// Armas del jugador: fusil, pistola y cuchillo. Selección con animación de cambio, disparo por raycast
// (o tajo cuerpo a cuerpo), dispersión, retroceso, recarga animada, balanceo, linterna y golpe rápido
// con el cuchillo (tecla V): puñalada de lado o remate por la espalda.
import * as THREE from 'three';
import { buildViewModel, buildPistolModel, buildKnifeModel, buildGrabHand, SIGHT_Y, PISTOL_SIGHT_Y } from './viewmodel.js';
import { TAKEDOWN_STAB, TAKEDOWN_TIME } from './enemyModel.js';
import { Charm, loadCharms } from './charms.js';
import { FRAME } from './sprites.js';
import { tracer } from './fxRecipes.js';
import { clamp, damp, lerp, rand, smoothstep as ss } from './utils.js';

export const VM_SCALE = 0.4;
export const LIGHT_POWER = 70;
export const RIFLE = 0; export const PISTOL = 1; export const KNIFE = 2;

// Cada arma, en el orden de la barra (teclas 1, 2 y 3). Dispersiones en grados; `hip`/`ads` son la
// posición del modelo desde la cadera y apuntando. El daño de cada una está en combat.js.
export const WEAPONS = [
  {
    name: 'MK-18 CQBR · AUTO', label: 'FUSIL', mag: 30, reserve: 150, interval: 60 / 720, auto: true, reloadTime: 2.35,
    spreadHip: 1.05, spreadAds: 0.07, moveHip: 1.7, moveAds: 0.45, heatHip: 0.42, heatAds: 0.2,
    climb: 0.62, kick: 1, flash: 1, zoom: 20, speed: 1, noise: 60, hip: [0.108, -0.128, -0.2], ads: [0, -SIGHT_Y, -0.17],
  },
  {
    name: 'P22 COMPACTA · .22', label: 'PISTOLA', mag: 12, reserve: 60, interval: 0.115, auto: false, reloadTime: 1.6,
    spreadHip: 0.8, spreadAds: 0.14, moveHip: 1.15, moveAds: 0.4, heatHip: 0.5, heatAds: 0.28,
    climb: 0.85, kick: 0.75, flash: 0.6, zoom: 10, speed: 1.05, noise: 40, hip: [0.082, -0.098, -0.31], ads: [0, -PISTOL_SIGHT_Y, -0.3],
  },
  {
    name: 'CUCHILLO DE COMBATE', label: 'CUCHILLO', melee: true, interval: 0.5, reach: 2.1,
    spreadHip: 0.5, spreadAds: 0.5, moveHip: 0.6, moveAds: 0.6, heatHip: 0, heatAds: 0,
    zoom: 0, speed: 1.12, hip: [0.118, -0.118, -0.275], ads: [0.118, -0.118, -0.275],
  },
];

const SWAP_DOWN = 0.15; const SWAP_UP = 0.22; // segundos para bajar un arma y subir la siguiente
const SWING_TIME = 0.4; const SWING_HIT = 0.32; // duración del tajo y momento (0-1) en que alcanza
// Golpe rápido con V (sólo con un rival al lado o de espaldas, ver combat.quickTarget): al azar, dos de cada
// tres veces es el remate (si hay sitio a su espalda) y si no, la puñalada. Tiempos de la puñalada en segundos;
// los del remate, en enemyModel.js (los comparte la animación de la víctima).
const TAKEDOWN_CHANCE = 2 / 3;
const QUICK_LIGHT = 7; // intensidad de la linterna durante el golpe rápido
const QUICK_FILL = 0.5; // y luz de relleno añadida (de noche, si no, las manos no se ven)
const STAB_TIME = 0.8; const STAB_HIT = 0.38;
// Armería: dónde se expone cada arma ante la cámara y con cuánta luz (están a distinta distancia del foco).
const SHOW_POSE = [[0.14, 0.005, -0.38], [0.1, 0.02, -0.19], [0.1, 0.01, -0.2]];
const SHOW_LIGHT = [1.4, 0.4, 0.4];
const DEG = Math.PI / 180;

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m = new THREE.Vector3();
const _e = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Weapon {
  constructor(camera, surf, fx, audio) {
    this.camera = camera;
    this.fx = fx;
    this.audio = audio;
    this.root = new THREE.Group(); // contiene los tres modelos; sólo se ve el del arma en mano
    this.slots = [buildViewModel(surf), buildPistolModel(surf), buildKnifeModel(surf)].map((vm, i) => {
      vm.root.scale.setScalar(VM_SCALE);
      this.root.add(vm.root);
      return { def: WEAPONS[i], vm, mag: 0, reserve: 0 };
    });
    camera.add(this.root);
    // Golpe rápido: cuchillo en la mano derecha (con el antebrazo hacia abajo, ver buildKnifeModel) y mano
    // izquierda libre, que agarra a la víctima en los remates.
    this.quickKnife = buildKnifeModel(surf, [0.1, -0.5, 0.2]);
    this.grabHand = buildGrabHand(surf);
    for (const m of [this.quickKnife, this.grabHand]) { m.root.scale.setScalar(VM_SCALE); m.root.visible = false; this.root.add(m.root); }

    // Linterna táctica: siempre en escena (intensidad 0 apagada) para no recompilar shaders.
    this.light = new THREE.SpotLight(0xdde8ff, 0, 60, 0.46, 0.75, 1.2);
    // Por delante de la boca del cañón: así el cono no "quema" el propio arma.
    this.light.position.set(0.05, -0.035, -0.39);
    this.light.target.position.set(0.02, -0.03, -20);
    camera.add(this.light, this.light.target);
    this.lightOn = true;
    // Relleno muy tenue y de corto alcance para que el arma no quede en negro.
    this.fill = new THREE.PointLight(0xa9bbd9, 0.06, 1.2, 2);
    this.fill.position.set(0.14, 0.18, 0.06);
    camera.add(this.fill);
    this.lightDir = new THREE.Vector3();
    this.lightPos = new THREE.Vector3();
    this.allowed = WEAPONS.map(() => true); // armas disponibles (lo decide el ajuste de la partida)
    this.cur = RIFLE;
    this.charms = this.slots.map(() => null); // llavero de cada arma (null = ninguno)
    loadCharms().forEach((id, i) => this.setCharm(i, id));
    this.reset();
  }

  // Cuelga un llavero (identificador de CHARMS) del arma `i`, en lugar del que tuviera.
  setCharm(i, id) {
    this.charms[i]?.dispose();
    this.charms[i] = id === 'none' ? null : new Charm(id);
    if (this.charms[i]) this.slots[i].vm.charm.add(this.charms[i].group);
  }

  // Armería: expone el arma `i` de perfil, girando despacio, con el llavero de cara a la cámara.
  showcase(dt, time, i) {
    this.root.visible = true;
    this.slots.forEach((s, k) => { s.vm.root.visible = k === i; });
    this.quickKnife.root.visible = false; this.grabHand.root.visible = false;
    const vm = this.slots[i].vm;
    // Piezas móviles en su sitio, por si la última partida las dejó a medias.
    if (vm.mag) { vm.mag.position.y = i === RIFLE ? -0.085 : 0; vm.mag.visible = true; }
    if (vm.leftArm) vm.leftArm.position.set(0, 0, 0);
    vm.rightArm.position.set(0, 0, 0);
    if (vm.slide) vm.slide.position.z = 0;
    if (vm.lensUniforms) vm.lensUniforms.uGain.value = 0;
    if (vm.lampLens) vm.lampLens.visible = false;
    for (const arm of [vm.leftArm, vm.rightArm]) if (arm) arm.visible = false; // sólo el arma
    const [x, y, z] = SHOW_POSE[i];
    vm.root.position.set(x, y + Math.sin(time * 0.9) * 0.003, z);
    vm.root.rotation.set(0.1, Math.PI / 2 - 0.25 + Math.sin(time * 0.5) * 0.5, 0);
    this.fill.intensity = SHOW_LIGHT[i];
    this.fill.color.setRGB(1, 0.96, 0.9);
    const charm = this.charms[i];
    if (charm) { charm.face = -Math.PI / 2; charm.update(dt, vm.root, vm.charm, this.camera); }
  }

  endShowcase() {
    this.root.visible = false;
    this.fill.intensity = 0.06;
    for (const { vm } of this.slots) for (const arm of [vm.leftArm, vm.rightArm]) if (arm) arm.visible = true;
    this.show(this.cur);
  }

  get slot() { return this.slots[this.cur]; }
  get def() { return this.slots[this.cur].def; }
  get vm() { return this.slots[this.cur].vm; }
  // Munición del arma en mano (null con el cuchillo).
  get mag() { return this.def.melee ? null : this.slot.mag; }
  get reserve() { return this.def.melee ? null : this.slot.reserve; }

  // Limita las armas disponibles: 0 todas, 1 pistola y cuchillo, 2 sólo cuchillo.
  allow(mode) {
    this.allowed = WEAPONS.map((_, i) => i >= mode);
  }

  // Bits de las armas disponibles (para la barra del HUD).
  get allowedMask() { return this.allowed.reduce((m, ok, i) => m | (ok ? 1 << i : 0), 0); }

  reset() {
    for (const s of this.slots) { s.mag = s.def.mag || 0; s.reserve = s.def.reserve || 0; }
    const first = this.allowed.indexOf(true);
    this.pending = -1; // arma a la que se está cambiando
    this.drawT = 0; // 0 = arma arriba, 1 = bajada del todo (cambio de arma)
    this.reloading = false;
    this.reloadT = 0;
    this.reloadStage = 0;
    this.cool = 0;
    this.heat = 0;
    this.burst = 0;
    this.sinceShot = 9;
    this.aiming = false;
    this.spread = 1;
    this.shots = 0;
    this.kick = 0; this.kickV = 0; this.kickRot = 0; this.kickRotV = 0;
    this.jitY = 0; this.jitZ = 0;
    this.swayX = 0; this.swayY = 0; this.sprintT = 0; this.crouchT = 0; this.lowerT = 0;
    this.boltT = 1;
    this.swingT = 1; this.swingDone = true; // tajo del cuchillo (1 = en reposo)
    this.quick = null; // golpe rápido en curso: { kind: 'stab' | 'takedown', t, target, done, swung }
    this.quickTarget = null; // rival al que se le puede dar el golpe rápido ahora mismo (ver combat.quickTarget)
    for (const { vm } of this.slots) { vm.rightArm.position.set(0, 0, 0); vm.rightArm.visible = true; }
    this.quickKnife.root.visible = false; this.grabHand.root.visible = false;
    this.time = 0;
    this.smoke = 0;
    this.dryLatch = false;
    this.fireLatch = false;
    this.fillKick = 0;
    this.quickGlow = 0; // relleno extra para ver las manos y a la víctima durante el golpe rápido
    this.root.visible = true;
    this.show(first);
  }

  // Pone un arma en mano sin animación.
  show(i) {
    this.cur = i;
    this.slots.forEach((s, k) => { s.vm.root.visible = k === i; });
    this.charms[i]?.rest();
  }

  // Pide cambiar de arma: baja la actual, cambia y sube la nueva.
  select(i) {
    if (this.quick || !this.allowed[i] || i === (this.pending >= 0 ? this.pending : this.cur)) return;
    this.reloading = false; this.reloadT = 0;
    this.swingT = 1; this.swingDone = true;
    this.pending = i === this.cur ? -1 : i;
    this.audio.weaponSwap();
  }

  startReload() {
    const s = this.slot;
    if (s.def.melee || this.reloading || s.mag >= s.def.mag || s.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadStage = 0;
  }

  update(dt, input, player, game) {
    this.time += dt;
    this.sinceShot += dt;
    this.cool = Math.max(0, this.cool - dt);
    this.heat = Math.max(0, this.heat - dt * (this.sinceShot > 0.12 ? 5.5 : 1.2));
    if (this.sinceShot > 0.3) this.burst = 0;
    const dead = player.dead;

    // --- Cambio de arma: teclas 1-3 o rueda del ratón (Q y E son para asomarse a cubierto) ---
    const wheel = input.consumeWheel();
    if (!dead) {
      const n = this.slots.length;
      let want = -1;
      for (let i = 0; i < n; i++) if (input.hit(`Digit${i + 1}`)) want = i;
      if (wheel) {
        // Siguiente arma disponible en el sentido de la rueda.
        want = this.pending >= 0 ? this.pending : this.cur;
        do want = (want + wheel + n) % n; while (!this.allowed[want]);
      }
      if (want >= 0) this.select(want);
    }
    if (this.pending >= 0) {
      this.drawT += dt / SWAP_DOWN;
      if (this.drawT >= 1) { this.drawT = 1; this.show(this.pending); this.pending = -1; this.kick = 0; this.kickV = 0; }
    } else if (this.drawT > 0) this.drawT = Math.max(0, this.drawT - dt / SWAP_UP);
    const ready = this.pending < 0 && this.drawT < 0.35 && !player.vault; // trepando no se dispara

    // --- Golpe rápido con V ---
    if (dead) this.quick = null;
    this.quickTarget = !dead && ready && !this.quick ? game.quickTarget() : null;
    if (this.quickTarget && input.hit('KeyV')) this.startQuick(player, game);
    if (this.quick) this.updateQuick(dt, player, game);

    const def = this.def;
    const slot = this.slot;
    player.aimZoom = def.zoom;
    player.speedK = def.speed;
    this.aiming = !dead && ready && !this.quick && input.aim && !def.melee && !this.reloading && !player.sprinting;
    if (!dead && ready && !this.quick) {
      if (input.hit('KeyR')) this.startReload();
      if (!input.fire) { this.dryLatch = false; this.fireLatch = false; }
      // El cuchillo se puede usar a la carrera; las armas de fuego, no.
      if (input.fire && !this.reloading && (def.melee || this.sprintT < 0.4)) {
        if (def.melee) { if (this.cool <= 0) this.swing(); }
        else if (slot.mag > 0) {
          // Semiautomática: un disparo por pulsación.
          if (this.cool <= 0 && (def.auto || !this.fireLatch)) { this.fireLatch = true; this.fire(player, game); }
        } else if (!this.dryLatch) { this.dryLatch = true; this.audio.dryFire(); this.startReload(); }
      }
    }
    if (!dead && input.hit('KeyF')) { this.lightOn = !this.lightOn; this.audio.uiClick(); }
    if (this.reloading) this.updateReload(dt);
    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / SWING_TIME);
      if (!this.swingDone && this.swingT >= SWING_HIT) { this.swingDone = true; if (!dead) this.stab(player, game); }
    }

    // Dispersión actual en grados (alimenta la cruceta).
    const move = clamp(player.speed / 6.4, 0, 1);
    this.spread = (lerp(def.spreadHip, def.spreadAds, player.aimT) + move * lerp(def.moveHip, def.moveAds, player.aimT) + this.heat * lerp(def.heatHip, def.heatAds, player.aimT)
      + (player.onGround ? 0 : 2.2)) * (player.crouching ? 0.72 : 1);

    this.updatePose(dt, player, dead);

    // Linterna.
    // Durante el golpe rápido el arma baja y su linterna apunta al suelo: queda un resplandor tenue (a
    // pleno, con la víctima a menos de un metro, quemaría la imagen a blanco).
    const target = this.lightOn && !dead ? (this.quick ? QUICK_LIGHT : LIGHT_POWER) : 0;
    this.light.intensity = damp(this.light.intensity, target, 18, dt);
    this.slots[RIFLE].vm.lampLens.visible = this.light.intensity > 5;
    this.fillKick *= Math.exp(-dt * 28);
    this.quickGlow = damp(this.quickGlow, this.quick ? 1 : 0, 8, dt);
    this.fill.intensity = 0.06 + this.fillKick * 0.22 + this.quickGlow * QUICK_FILL;
    this.fill.color.setRGB(0.66 + this.fillKick * 0.34, 0.73 - this.fillKick * 0.1, 0.85 - this.fillKick * 0.5);
    this.camera.getWorldDirection(this.lightDir);
    this.light.getWorldPosition(this.lightPos);

    // Hilo de humo que sale del cañón tras una ráfaga.
    if (this.smoke > 0 && this.sinceShot > 0.08) {
      this.smoke -= dt * 6;
      if (this.vm.muzzle && Math.random() < dt * 30) {
        this.vm.muzzle.getWorldPosition(_m);
        const c = this.fx.lit(_m.x, _m.y, _m.z, 0.8, 0.8, 0.85, 4);
        this.fx.alpha.emit({
          x: _m.x, y: _m.y, z: _m.z, vx: rand(-0.03, 0.03), vy: rand(0.12, 0.22), vz: rand(-0.03, 0.03), life: rand(0.7, 1.2),
          size: 0.01, sizeEnd: rand(0.04, 0.07), rot: rand(6.28), rotV: rand(-1, 1), frame: FRAME.SMOKE_A, r: c[0], g: c[1], b: c[2], alpha: 0.1, drag: 0.8, fadeIn: 0.15,
        });
      }
    }
  }

  // Origen y dirección de la vista (para el disparo o el tajo).
  viewRay() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.getWorldPosition(_o);
    cam.getWorldQuaternion(_q);
    _d.set(0, 0, -1).applyQuaternion(_q);
    _r.set(1, 0, 0).applyQuaternion(_q);
    _u.set(0, 1, 0).applyQuaternion(_q);
  }

  fire(player, game) {
    const def = this.def; const vm = this.vm;
    this.slot.mag--;
    this.cool += def.interval;
    this.shots++;
    this.burst++;
    this.sinceShot = 0;
    this.heat = Math.min(4, this.heat + (def.auto ? 0 : 0.9)); // la pistola pierde precisión si se dispara muy seguido
    this.smoke = Math.min(6, this.smoke + 0.9 * def.flash);

    this.viewRay();
    // Dispersión uniforme dentro de un cono.
    const ang = this.spread * DEG * Math.sqrt(Math.random());
    const th = Math.random() * Math.PI * 2;
    _d.addScaledVector(_r, Math.cos(th) * Math.tan(ang)).addScaledVector(_u, Math.sin(th) * Math.tan(ang)).normalize();

    const end = game.playerShot(_o, _d);

    // --- Efectos visuales ---
    vm.muzzle.getWorldPosition(_m);
    const fx = this.fx;
    const s = VM_SCALE * (0.55 + 0.45 * def.flash);
    fx.add.emit({ x: _m.x + _d.x * 0.03, y: _m.y + _d.y * 0.03, z: _m.z + _d.z * 0.03, life: 0.04, size: rand(0.26, 0.4) * s, rot: rand(6.28), frame: FRAME.FLASH, r: 5, g: 3.1, b: 1.2 });
    fx.add.emit({ x: _m.x, y: _m.y, z: _m.z, life: 0.045, size: 0.6 * s, frame: FRAME.GLOW, r: 1.1, g: 0.62, b: 0.22 });
    for (let i = 0; i < 2; i++) {
      fx.add.emit({
        x: _m.x, y: _m.y, z: _m.z, vx: _d.x * rand(4, 9) + rand(-1, 1), vy: _d.y * rand(4, 9) + rand(-1, 1), vz: _d.z * rand(4, 9) + rand(-1, 1),
        life: rand(0.06, 0.14), size: 0.006, frame: FRAME.STREAK, mode: 1, stretch: 0.03, r: 8, g: 4, b: 1, fadeK: 3,
      });
    }
    // La luz del fogonazo va algo adelantada para iluminar el entorno sin quemar el arma.
    fx.flash(0, _o.x + _d.x * 1.5 + _u.x * 0.25, _o.y + _d.y * 1.5 + _u.y * 0.25, _o.z + _d.z * 1.5 + _u.z * 0.25, 0xffb468, 170 * def.flash, 0.07);
    this.fillKick = def.flash;
    if (end) tracer(fx, _m.x, _m.y, _m.z, end.x, end.y, end.z);

    // Casquillo: sale por la derecha, hacia arriba y algo hacia atrás.
    vm.eject.getWorldPosition(_e);
    const pv = player.vel;
    fx.casings.spawn(
      _e.x, _e.y, _e.z,
      pv.x + _r.x * rand(1.6, 2.5) + _u.x * rand(1.2, 2) - _d.x * rand(0.2, 0.8),
      pv.y * 0.5 + _r.y * 2 + _u.y * rand(1.4, 2.2) + 0.4,
      pv.z + _r.z * rand(1.6, 2.5) + _u.z * rand(1.2, 2) - _d.z * rand(0.2, 0.8),
      VM_SCALE * (def.auto ? 1 : 0.6),
    );

    // --- Retroceso ---
    const aimK = lerp(1, 0.72, player.aimT) * (player.crouching ? 0.85 : 1);
    const climb = (def.climb + Math.min(this.burst, 7) * 0.055) * aimK;
    const side = (Math.sin(this.shots * 1.7) * 0.16 + rand(-0.22, 0.22)) * aimK;
    player.addRecoil(climb * DEG, side * DEG);
    player.addShake(0.045 * def.kick);
    this.kickV += 3.4 * def.kick;
    this.kickRotV += 2.6 * (def.auto ? 1 : 1.7);
    this.jitY = rand(-1, 1);
    this.jitZ = rand(-1, 1);
    this.boltT = 0;
    if (def.auto) this.audio.gunshot(); else this.audio.pistolShot();
  }

  // Empieza un tajo; el golpe se resuelve un instante después, en mitad del movimiento.
  swing() {
    this.cool += this.def.interval;
    this.swingT = 0; this.swingDone = false;
    this.sinceShot = 0;
    this.audio.knifeSwing();
  }

  stab(player, game) {
    this.viewRay();
    if (game.playerMelee(_o, _d, this.def.reach)) player.addShake(0.12);
  }

  // Golpe rápido: la mano derecha suelta el arma, saca el cuchillo de la cintura y apuñala. Corta la recarga.
  startQuick(player, game) {
    const t = this.quickTarget;
    const spot = Math.random() < TAKEDOWN_CHANCE ? player.takedownSpot(t) : null;
    this.quick = { kind: spot ? 'takedown' : 'stab', t: 0, target: t, done: false, swung: false };
    this.quickTarget = null;
    this.reloading = false; this.reloadT = 0;
    this.swingT = 1; this.swingDone = true;
    this.sinceShot = 0; // atacar quita la protección de reaparecer
    this.audio.knifeDraw();
    if (spot) { player.startTakedown(spot, t, TAKEDOWN_TIME); game.takedownStart(t); }
  }

  updateQuick(dt, player, game) {
    const q = this.quick;
    q.t += dt;
    if (q.kind === 'stab') {
      if (!q.swung && q.t >= 0.3) { q.swung = true; this.audio.knifeSwing(); }
      if (!q.done && q.t >= STAB_HIT) { q.done = true; if (game.quickStab(q.target)) player.addShake(0.12); }
      if (q.t >= STAB_TIME) this.quick = null;
    } else {
      if (!q.swung && q.t >= 0.42) { q.swung = true; this.audio.knifeSwing(); }
      if (!q.done && q.t >= TAKEDOWN_STAB) { q.done = true; game.takedownStab(q.target); player.addShake(0.18); player.punchVP -= 0.5; }
      // El jugador recupera el control a la vez (player.lock) y el arma sube como tras un cambio.
      if (q.t >= TAKEDOWN_TIME) { this.quick = null; this.drawT = 1; }
    }
  }

  // Cuchillo del golpe rápido en la mano derecha, `t` segundos después de pulsar V. Sube desde abajo (de la
  // cintura, fuera de la vista), apuñala y vuelve a bajar.
  poseQuick(root, t, kind) {
    let x; let y; let z; let rx; let ry; let rz;
    if (kind === 'stab') {
      const up = ss(0.12, 0.3, t) * (1 - ss(0.48, 0.66, t));
      const thrust = ss(0.3, 0.4, t) * (1 - ss(0.44, 0.58, t)); // estocada al frente, al costado del rival
      x = 0.1 - 0.075 * thrust; y = -0.13 - 0.3 * (1 - up) + 0.04 * thrust; z = -0.27 + 0.08 * (1 - up) - 0.17 * thrust;
      rx = 0.12 - 0.7 * (1 - up) + 0.04 * thrust; ry = 0.2 + 0.1 * thrust; rz = 0.28;
    } else {
      const up = ss(0.16, 0.4, t) * (1 - ss(0.86, 1.06, t));
      const thrust = ss(0.42, TAKEDOWN_STAB, t) * (1 - ss(0.8, 0.94, t)); // al cuello y fuera
      const twist = ss(TAKEDOWN_STAB, 0.7, t) * (1 - ss(0.8, 0.9, t));
      // Desde abajo y hacia arriba, con el antebrazo saliendo por la parte de abajo de la pantalla.
      x = 0.12 - 0.07 * thrust; y = -0.16 - 0.3 * (1 - up) + 0.06 * thrust; z = -0.27 + 0.08 * (1 - up) - 0.11 * thrust;
      rx = 0.42 - 0.9 * (1 - up); ry = 0.42 + 0.14 * thrust; rz = 0.3 + 0.12 * twist;
    }
    const breath = Math.sin(this.time * 1.55) * 0.0015;
    root.position.set(x * VM_SCALE, (y + breath) * VM_SCALE, z * VM_SCALE);
    root.rotation.set(rx, ry, rz);
  }

  // Mano izquierda del remate: sube, agarra a la víctima por el hombro, tira de ella y la suelta.
  poseGrab(t) {
    const root = this.grabHand.root;
    root.visible = t > 0.04 && t < 1.12;
    if (!root.visible) return;
    const reach = ss(0.06, 0.3, t) * (1 - ss(0.88, 1.1, t));
    const pull = ss(0.24, 0.42, t) * (1 - ss(0.78, 0.98, t));
    const away = 1 - reach;
    root.position.set((-0.08 - 0.08 * away) * VM_SCALE, (-0.07 - 0.3 * away - 0.01 * pull) * VM_SCALE, (-0.36 + 0.2 * away + 0.05 * pull) * VM_SCALE);
    root.rotation.set(0.15 - 0.6 * away, -0.35, -0.25);
  }

  updateReload(dt) {
    const s = this.slot;
    this.reloadT += dt;
    const r = this.reloadT / s.def.reloadTime;
    const cues = [0.17, 0.55, 0.73, 0.81];
    while (this.reloadStage < 4 && r >= cues[this.reloadStage]) {
      this.audio.reload(this.reloadStage);
      if (this.reloadStage === 1) {
        const need = Math.min(s.def.mag - s.mag, s.reserve);
        s.mag += need;
        s.reserve -= need;
        this.kickV += 0.9;
      }
      if (this.reloadStage === 3) { this.kickV += 1.4; this.boltT = 0; }
      this.reloadStage++;
    }
    if (r >= 1) { this.reloading = false; this.reloadT = 0; }
  }

  updatePose(dt, player, dead) {
    const def = this.def; const vm = this.vm;
    const aim = def.melee ? 0 : player.aimT;
    this.sprintT = damp(this.sprintT, player.sprinting && !this.reloading ? 1 : 0, 9, dt);
    this.crouchT = damp(this.crouchT, player.crouching ? 1 : 0, 8, dt);
    this.lowerT = damp(this.lowerT, dead ? 1 : 0, 5, dt);

    // Muelles de retroceso del arma.
    this.kickV += (-this.kick * 260 - this.kickV * 24) * dt; this.kick += this.kickV * dt;
    this.kickRotV += (-this.kickRot * 220 - this.kickRotV * 20) * dt; this.kickRot += this.kickRotV * dt;
    // Inercia al girar la vista.
    this.swayX = damp(this.swayX, clamp(player.mouseDX * 0.0016, -0.07, 0.07), 9, dt);
    this.swayY = damp(this.swayY, clamp(player.mouseDY * 0.0016, -0.06, 0.06), 9, dt);

    const sp = this.sprintT;
    const hipK = 1 - aim;
    const bobK = player.bobAmt * (0.25 + 0.75 * hipK) * (1 + sp * 1.3);
    const bx = Math.cos(player.bob) * 0.0075 * bobK;
    const by = -Math.abs(Math.sin(player.bob)) * 0.0085 * bobK;
    const breath = Math.sin(this.time * 1.55) * (0.0018 * hipK + 0.0004);
    // Golpe rápido: en la puñalada la mano derecha baja a la cintura a por el cuchillo (handOut) y el arma
    // se queda en la izquierda; en el remate el arma baja del todo. knifeOut: el cuchillo está en la mano.
    const q = this.quick; const qt = q ? q.t : 0;
    const takedown = q !== null && q.kind === 'takedown';
    const handOut = q && !takedown ? ss(0, 0.14, qt) * (1 - ss(0.6, 0.78, qt)) : 0;
    const knifeOut = q !== null && (takedown ? qt > 0.16 && qt < 1.08 : qt > 0.12 && qt < 0.66);
    const low = Math.max(this.lowerT, ss(0, 1, this.drawT), takedown ? ss(0, 0.18, qt) : 0); // muerto, cambiando de arma o rematando

    let px = lerp(def.hip[0], def.ads[0], aim) + bx - this.swayX * 0.12 * hipK - sp * 0.03;
    let py = lerp(def.hip[1], def.ads[1], aim) + by + breath - this.swayY * 0.1 * hipK - sp * 0.035 - player.landDip * 0.5
      + clamp(-player.vel.y * 0.004, -0.02, 0.02) - low * 0.3;
    let pz = lerp(def.hip[2], def.ads[2], aim) + this.kick * 0.012 + sp * 0.04;
    let rx = this.kickRot * 0.012 + this.swayY * 0.9 * (0.3 + 0.7 * hipK) + Math.sin(this.time * 1.3) * 0.0025 * hipK - sp * 0.2 - low * 0.9;
    let ry = this.swayX * 1.1 * (0.3 + 0.7 * hipK) + this.jitY * this.kick * 0.002 + sp * 0.66 + hipK * 0.012;
    let rz = Math.cos(player.bob) * 0.014 * bobK + player.roll * 1.6 + this.jitZ * this.kick * 0.004 - this.swayX * 0.6 * hipK
      + this.crouchT * 0.07 * hipK + sp * 0.16;
    // Deslizamiento: el arma baja un poco y se ladea hacia dentro (menos al apuntar).
    const sl = player.slideK * (0.35 + 0.65 * hipK);
    px -= sl * 0.012; py -= sl * 0.018; rz += sl * 0.2; rx -= sl * 0.04;
    // Trepando: el arma baja y se ladea mientras la otra mano se apoya en el obstáculo.
    const vk = player.vaultK;
    px += vk * 0.03; py -= vk * 0.1; rx -= vk * 0.45; rz += vk * 0.3;
    if (handOut > 0) {
      // Puñalada: el arma de fuego, sujeta sólo con la izquierda, baja un poco y se ladea; el cuchillo en
      // mano baja a la cintura como si se cambiara de agarre.
      if (this.cur !== KNIFE) { px -= 0.05 * handOut; py -= 0.12 * handOut; pz += 0.03 * handOut; rz += 0.22 * handOut; rx -= 0.3 * handOut; ry += 0.05 * handOut; }
      else { py -= 0.35 * handOut; rx -= 0.7 * handOut; }
    }
    if (this.cur !== KNIFE) {
      vm.rightArm.position.set(0.03 * handOut, -0.3 * handOut, 0.1 * handOut);
      vm.rightArm.visible = handOut < 0.98;
    }

    this.boltT = Math.min(1, this.boltT + dt * 14);
    const r = this.reloading ? this.reloadT / def.reloadTime : 0;

    if (this.cur === RIFLE) {
      // --- Recarga: inclinación del arma, cargador y mano izquierda ---
      let magY = 0; let magVisible = true;
      let lx = 0; let ly = 0; let lz = 0;
      if (this.reloading) {
        const tilt = ss(0, 0.13, r) * (1 - ss(0.86, 1, r));
        rz -= 0.55 * tilt; rx += 0.24 * tilt; ry += 0.14 * tilt;
        px -= 0.03 * tilt; py -= 0.035 * tilt; pz += 0.02 * tilt;
        const drop = ss(0.17, 0.3, r);
        const rise = ss(0.38, 0.55, r);
        magY = r < 0.36 ? -0.36 * drop : -0.36 * (1 - rise);
        magVisible = !(r > 0.3 && r < 0.38);
        // Mano izquierda: del guardamanos al cargador, baja con él, sube con el nuevo, toca el retén y vuelve.
        const toMag = ss(0.03, 0.15, r) * (1 - ss(0.6, 0.7, r));
        const toBolt = ss(0.62, 0.72, r) * (1 - ss(0.82, 0.94, r));
        lx = toBolt * -0.012; ly = toMag * -0.105 + magY * toMag + toBolt * 0.045; lz = toMag * 0.168 + toBolt * 0.2;
        py += Math.sin(ss(0.55, 0.62, r) * Math.PI) * 0.012;
      }
      vm.mag.position.y = -0.085 + magY;
      vm.mag.visible = magVisible;
      vm.leftArm.position.set(lx, ly, lz);
      // Cerrojo: retrocede y vuelve en cada disparo.
      vm.bolt.position.z = -0.03 + Math.sin(this.boltT * Math.PI) * 0.034;
      // Retícula colimada: eje del arma en espacio de vista.
      _e.set(0, 0, -1).applyEuler(vm.root.rotation.set(rx, ry, rz));
      vm.lensUniforms.uFwd.value.copy(_e);
      vm.lensUniforms.uGain.value = 0.55 + 0.45 * aim;
    } else if (this.cur === PISTOL) {
      // El retroceso levanta más la boca que en el fusil.
      rx += this.kickRot * 0.03;
      let magY = 0; let ly = 0; let slideBack = Math.sin(this.boltT * Math.PI) * 0.03;
      if (this.reloading) {
        // Se inclina hacia dentro, la mano izquierda saca el cargador, mete otro y suelta la corredera.
        const tilt = ss(0, 0.14, r) * (1 - ss(0.86, 1, r));
        rz += 0.45 * tilt; rx += 0.34 * tilt; ry += 0.1 * tilt;
        px -= 0.02 * tilt; py -= 0.02 * tilt;
        const drop = ss(0.17, 0.3, r);
        const rise = ss(0.38, 0.55, r);
        magY = r < 0.36 ? -0.3 * drop : -0.3 * (1 - rise);
        ly = magY * ss(0.05, 0.17, r) * (1 - ss(0.58, 0.7, r));
        py += Math.sin(ss(0.55, 0.62, r) * Math.PI) * 0.01;
        if (r > 0.17 && r < 0.81) slideBack = 0.03; // abierta hasta soltar el retén
      } else if (this.slot.mag === 0) slideBack = 0.03; // corredera retenida con el cargador vacío
      vm.mag.position.y = magY;
      vm.leftArm.position.y = ly;
      vm.slide.position.z = slideBack;
    } else {
      // Cuchillo: punta adelantada hacia el centro; el tajo cruza la vista de derecha a izquierda.
      rx += 0.22; ry += 0.34; rz += 0.3 - this.crouchT * 0.07;
      if (this.swingT < 1) {
        const s = this.swingT;
        const wind = ss(0, 0.18, s) * (1 - ss(0.18, 0.4, s)); // toma impulso
        const cut = ss(0.16, 0.5, s) * (1 - ss(0.62, 1, s)); // cruza
        px += 0.035 * wind - 0.19 * cut;
        py += 0.02 * wind + 0.012 * cut;
        pz += 0.03 * wind - 0.15 * cut;
        ry += -0.3 * wind + 0.95 * cut;
        rz += -0.2 * wind + 0.95 * cut;
        rx += 0.1 * wind - 0.2 * cut;
      }
    }

    vm.root.position.set(px * VM_SCALE, py * VM_SCALE, pz * VM_SCALE);
    vm.root.rotation.set(rx, ry, rz);

    // Cuchillo del golpe rápido; con el cuchillo en mano, ocupa su lugar mientras se apuñala.
    this.slots[KNIFE].vm.root.visible = this.cur === KNIFE && !knifeOut;
    this.quickKnife.root.visible = knifeOut;
    if (knifeOut) this.poseQuick(this.quickKnife.root, qt, q.kind);
    if (takedown) this.poseGrab(qt);
    else this.grabHand.root.visible = false;

    const charm = this.charms[this.cur];
    if (charm) { charm.face = 0; charm.update(dt, vm.root, vm.charm, this.camera); }
  }
}
