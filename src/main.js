// NIGHTFALL-X — arranque, estados de juego y bucle principal.
import * as THREE from 'three';
import { setAnisotropy } from './textures.js';
import { createSurfaces, createMaterials, WET, SNOW } from './materials.js';
import { PlanarReflection } from './reflection.js';
import { PostFX } from './post.js';
import { createSky, FOG_COLOR } from './sky.js';
import { MAPS } from './maps.js';
import { FX } from './fx.js';
import { AudioEngine } from './audio.js';
import { Weather } from './weather.js';
import { tickVolumetrics } from './volumetric.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Weapon, LIGHT_POWER, KNIFE } from './weapon.js';
import { setSkinRenderer } from './skins.js';
import { profile, MAX_LEVEL } from './profile.js';
import { XP, ROMAN, award, awardKill, startSession, session, events as progress, xpFor, canPrestige, prestige, charmName } from './progress.js';
import { Enemies } from './enemies.js';
import { HUD, renderBoard } from './hud.js';
import { Combat, STAB_LEFT } from './combat.js';
import { Net, TEAMS, FLAG, WEAPON_SHIFT, LEAN_SHIFT } from './net.js';
import { RemotePlayers } from './remotePlayers.js';
import { Lobby } from './lobby.js';
import { Armory } from './armory.js';
import { Market } from './market.js';
import { Survival, loadRecords, fmt } from './survival.js';
import { LootWorld } from './lootWorld.js';
import { ARMOR_MAX, ITEM, ITEM_MAX, ITEM_NAMES, PICK_R } from './loot.js';
import { SPAWN } from './layout.js';
import { clamp, damp } from './utils.js';

const params = new URLSearchParams(location.search);
const AUTOSTART = params.has('autostart');
const DEBUG = params.has('debug') || AUTOSTART;
const NOLOCK = AUTOSTART || params.has('nolock'); // pruebas automáticas: sin captura de ratón
const SEND_INTERVAL = 0.05; // envío de la posición propia en partidas en línea
const SPAWN_SHIELD = 2.5; // protección al reaparecer; se pierde antes si se dispara
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function showError(e) {
  const box = $('error-box');
  box.classList.remove('hidden');
  box.textContent = `Error al iniciar la demo:\n${e && e.stack ? e.stack : e}`;
  console.error(e);
}
window.addEventListener('error', (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

async function boot() {
  // ---------- Render ----------
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  const canvasRatio = Math.min(window.devicePixelRatio || 1, 1.25);
  renderer.setPixelRatio(canvasRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  $('app').appendChild(renderer.domElement);
  setAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), 0.0135);
  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.04, 600);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  await nextFrame();

  const surf = createSurfaces();
  const M = createMaterials(surf);
  await nextFrame();

  const sky = createSky();
  scene.add(sky.mesh);
  // Luz ambiente y luz direccional (luna o sol): cada mapa les da color, fuerza y dirección (ver applyEnv).
  const hemi = new THREE.HemisphereLight(0x93abd6, 0x0d1016, 0.5);
  const moon = new THREE.DirectionalLight(0x9fb8ea, 0.42);
  moon.position.set(-46, 80, 36);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -62, right: 62, top: 78, bottom: -78, near: 5, far: 240 });
  moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.06;
  moon.shadow.autoUpdate = false; moon.shadow.needsUpdate = true;
  moon.target.position.set(0, 0, 4);
  scene.add(hemi, moon, moon.target);

  const reflection = new PlanarReflection(renderer, 0.5);

  // ---------- Mapas ----------
  // Cada mapa se construye la primera vez que hace falta y se queda en memoria, oculto.
  const worlds = [];
  const loadWorld = (id) => {
    if (!worlds[id]) {
      const w = MAPS[id].build(scene, M, reflection);
      w.id = id; w.group.visible = false;
      worlds[id] = w;
    }
    return worlds[id];
  };
  // Mapa de entorno capturado de la propia escena (reflejos coherentes en metal y cristal).
  const envHidden = []; // lo que no debe salir en la captura: arma en mano, lluvia…
  const captureEnv = (w) => {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const refl = w.ground.uniforms.uReflOn.value;
      const hidden = envHidden.filter((o) => o.visible);
      hidden.forEach((o) => { o.visible = false; });
      w.ground.uniforms.uReflOn.value = 0;
      const env = pmrem.fromScene(scene, 0, 0.1, 400, { position: new THREE.Vector3(...w.envPos) }).texture;
      w.ground.uniforms.uReflOn.value = refl;
      hidden.forEach((o) => { o.visible = true; });
      w.ground.material.envMap = env;
      w.ground.material.envMapIntensity = w.env.groundEnv;
      w.ground.material.needsUpdate = true;
      pmrem.dispose();
      return env;
    } catch (e) { console.warn('Sin mapa de entorno', e); return null; }
  };
  let world = loadWorld(0); // el menú y la misión usan siempre el primero
  world.group.visible = true;
  reflection.hidden.push(world.ground.mesh);
  await nextFrame();
  world.envTex = captureEnv(world);
  scene.environment = world.envTex;
  scene.environmentIntensity = world.env.envIntensity;

  const fx = new FX(scene, scene.fog);
  const audio = new AudioEngine();
  fx.audio = audio;
  fx.sampleLight = (x, y, z, out) => world.ctx.sampleLight(x, y, z, out, fx.lights);
  fx.groundAt = (x, z, y) => world.col.groundHeight(x, z, y + 0.25, 0.3, 0);
  world.emitters.forEach((e) => fx.addEmitter(e));
  const weather = new Weather(scene, world.dry);
  weather.onThunder = (close) => audio.thunder(close);
  envHidden.push(weather.rain, weather.splash);

  const input = new Input(renderer.domElement);
  const hud = new HUD();
  const g = { world, fx, audio, hud };
  const player = (g.player = new Player(camera, world.col, {
    step: (surface, loud) => { audio.step(surface, loud); if (surface === 'water') combat.footSplash(player.pos.x, player.pos.z); },
    land: (v) => audio.land(v),
    exhausted: () => audio.cough(),
    slide: (surface) => audio.slide(surface),
    vault: (surface) => audio.vault(surface),
    armorBreak: () => audio.armorBreak(),
    hurt: () => { audio.hurt(); hud.damageFrom(player.hurtDir); hurtFlash = 1; },
    death: () => {
      if (mode !== 'online') { endTimer = 2.4; return; }
      // En línea: la víctima avisa de su muerte y de quién la causó; el servidor lleva la cuenta.
      respawnT = net.room.settings.respawn;
      net.died(combat.source.by === net.id ? 0 : combat.source.by, combat.source.part, combat.source.w);
    },
  }));
  player.groundSurface = (x, z, y) => (y > 0.06 ? 'metal' : world.ground.surfaceAt(x, z));
  const weapon = (g.weapon = new Weapon(camera, surf, fx, audio));
  weapon.onNotice = (text) => hud.message(text, 1.2);
  reflection.hidden.push(weapon.root, weapon.warm);
  envHidden.push(weapon.root, weapon.warm);
  setSkinRenderer(renderer);
  const enemies = (g.enemies = new Enemies(scene, world.col, fx, audio, surf, world.cover));
  enemies.spawn(world.enemies);
  const combat = (g.combat = new Combat(g));
  const survival = (g.survival = new Survival(g, scene));
  combat.onKill = (e, part) => {
    const knife = weapon.cur === KNIFE || !!weapon.quick;
    survival.onKill(e, part);
    awardKill(part === 'head', knife);
  };
  let hurtFlash = 0; let endTimer = 0;

  // ---------- Progreso (src/progress.js) ----------
  // En el menú no hay HUD: se actualiza la ficha (y el Mercado Negro, si está abierto).
  progress.gain = (xp, label) => {
    if (state !== 'menu') { hud.xpGain(xp, label); return; }
    refreshProfile();
    if (market.open && !market.spin && !market.won) market.render();
  };
  progress.level = (r) => {
    if (state === 'menu') return;
    hud.levelUp(r); audio.levelUp();
    if (mode === 'online') net.setRank([profile.prestige, profile.level]);
  };
  // Ficha del menú: prestigio, nivel, barra de XP, monedas y alijos; y aviso en el Mercado Negro si hay alijos.
  let prestigeAsk = false; // primer clic en PRESTIGIO: pide confirmación
  const fmtN = (n) => n.toLocaleString('es-ES');
  const refreshProfile = () => {
    $('pc-badge').textContent = profile.prestige ? `★ ${ROMAN[profile.prestige]}` : '';
    $('pc-level').textContent = profile.level;
    const need = xpFor(profile.level);
    $('pc-fill').style.width = `${Math.min(100, (profile.xp / need) * 100)}%`;
    $('pc-xp').textContent = prestigeAsk ? 'VUELVES AL NIVEL 1 Y CONSERVAS TODO'
      : `${fmtN(profile.xp)} / ${fmtN(need)} XP${profile.level >= MAX_LEVEL ? ' · PRÓXIMO PREMIO' : ''}`;
    $('pc-coins').textContent = fmtN(profile.coins);
    $('pc-cases').textContent = profile.cases;
    const pb = $('btn-prestige');
    pb.classList.toggle('hidden', !canPrestige());
    pb.classList.toggle('confirm', prestigeAsk);
    pb.textContent = prestigeAsk ? 'CONFIRMAR PRESTIGIO' :`PRESTIGIO ★ ${ROMAN[profile.prestige + 1]}`;
    $('btn-market').classList.toggle('ready', profile.cases > 0);
    $('btn-market').querySelector('.mi-desc').textContent = profile.cases > 0
      ? `Tienes ${profile.cases} ${profile.cases === 1 ? 'alijo' : 'alijos'} sin abrir` : 'Abre alijos y consigue skins';
  };
  $('btn-prestige').addEventListener('click', () => {
    if (!prestigeAsk) { prestigeAsk = true; refreshProfile(); return; }
    prestigeAsk = false;
    if (prestige()) { audio.init(); audio.levelUp(); }
    refreshProfile();
  });
  $('player-card').addEventListener('pointerleave', () => { if (prestigeAsk) { prestigeAsk = false; refreshProfile(); } });

  // Pantalla final: lo ganado en la partida, con la barra del nivel llenándose.
  const renderEndXp = () => {
    const box = $('end-xp');
    box.textContent = '';
    if (!session.xp && !session.coins) return;
    const head = document.createElement('div'); head.className = 'ex-head';
    head.innerHTML = `<span>NIVEL <b>${profile.level}</b></span><span class="gain">+${fmtN(session.xp)} XP</span>`;
    const bar = document.createElement('div'); bar.className = 'ex-bar';
    const fill = document.createElement('i'); bar.appendChild(fill);
    const from = session.ups ? 0 : (session.startXp / xpFor(profile.level)) * 100;
    fill.style.width = `${from}%`;
    const gains = document.createElement('div'); gains.className = 'ex-gains';
    const parts = [];
    if (session.ups) parts.push(profile.level >= MAX_LEVEL && session.startLevel >= MAX_LEVEL ? `<b>${session.ups} ${session.ups === 1 ? 'PREMIO' : 'PREMIOS'}</b>` : `<b>SUBES ${session.ups} ${session.ups === 1 ? 'NIVEL' : 'NIVELES'}</b>`);
    if (session.cases) parts.push(`+${session.cases} ${session.cases === 1 ? 'ALIJO' : 'ALIJOS'}`);
    if (session.coins) parts.push(`+${fmtN(session.coins)} ◈`);
    for (const c of session.charms) parts.push(`LLAVERO ${charmName(c)}`);
    gains.innerHTML = parts.join(' · ');
    box.append(head, bar, gains);
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${(profile.xp / xpFor(profile.level)) * 100}%`; }));
  };

  // ---------- Multijugador ----------
  let mode = 'solo'; // solo (misión) | survival | online
  let menuOpen = false; // menú abierto durante una partida en línea (el juego no se detiene)
  let respawnT = 0; let sendT = 0; let shieldT = 0;
  let matchEnd = null; // resultado recibido del servidor al terminar la partida
  let matchEndsAt = 0; // instante (reloj del navegador) en que se agota el tiempo; 0 = sin límite
  const net = (g.net = new Net());
  const remotes = (g.remotes = new RemotePlayers(scene, surf, reflection));

  // ---------- Botín (solo en línea) ----------
  // Cofres y objetos del suelo (lootWorld.js). Lo que se recoge se pide a la sala, que se lo da al primero
  // que lo pide (mensaje "take"); mientras tanto no se vuelve a pedir.
  const loot = (g.loot = new LootWorld(scene, fx, audio));
  const pending = new Map(); // id del objeto -> instante en que se pidió
  const canTake = (type) => (type === ITEM.VEST ? player.armor < ARMOR_MAX : weapon.itemCount(type) < ITEM_MAX);
  const requestTake = (it) => { if (!pending.has(it.id)) { pending.set(it.id, time); net.take(it.id); } };
  // La sala nos ha dado un objeto: el chaleco se pone solo (o se deja nuevo); vendas y botiquín se guardan.
  const gotItem = (type) => {
    if (type === ITEM.VEST) { player.armor = ARMOR_MAX; audio.vestOn(); hud.message('CHALECO PUESTO', 1.2); }
    else if (weapon.addItem(type)) { audio.pickup(); hud.message(`+1 ${ITEM_NAMES[type]}`, 1.2); }
  };
  // Cada fotograma en línea, antes de weapon.update (que usa F para la linterna): se recoge lo que se pisa y,
  // si se mira un cofre o un objeto, F lo abre o lo recoge en lugar de encender la linterna.
  const updateLoot = () => {
    for (const [id, t] of pending) if (time - t > 1.5) pending.delete(id);
    if (state !== 'playing' || player.dead || matchEnd || menuOpen) { hud.useHint(''); return; }
    for (const it of loot.near(player.pos.x, player.pos.y, player.pos.z, PICK_R)) if (canTake(it.type)) requestTake(it);
    const tg = loot.target(camera);
    if (!tg) { hud.useHint(''); return; }
    const f = input.hit('KeyF');
    if (f) input.pressed.delete('KeyF');
    if (tg.kind === 'chest') {
      hud.useHint('ABRIR COFRE');
      if (f) net.openChest(tg.i);
      return;
    }
    const type = tg.item.type;
    const ok = canTake(type);
    hud.useHint(ok ? `RECOGER ${ITEM_NAMES[type]}` : type === ITEM.VEST ? 'CHALECO COMPLETO' : `${ITEM_NAMES[type]} AL MÁXIMO`, !ok);
    if (ok && f) requestTake(tg.item);
  };

  const post = new PostFX(renderer);
  let quality = 'auto'; let scale = 1; let lastDrop = -99;

  // Ambiente de un mapa: cielo, niebla, luces, exposición, lluvia y humedad.
  const fogBase = new THREE.Color();
  const applyEnv = (env) => {
    scene.fog.color.setRGB(env.fog[0], env.fog[1], env.fog[2]);
    fogBase.copy(scene.fog.color);
    scene.fog.density = env.fogDensity;
    hemi.color.set(env.hemi.sky); hemi.groundColor.set(env.hemi.ground); hemi.intensity = env.hemi.intensity;
    const { color, intensity, dir, target } = env.sun;
    moon.color.set(color); moon.intensity = intensity;
    moon.position.set(target[0] + dir[0], dir[1], target[1] + dir[2]);
    moon.target.position.set(target[0], 0, target[1]);
    moon.shadow.needsUpdate = true;
    const u = sky.uniforms;
    u.uDay.value = env.day ? 1 : 0;
    u.uZenith.value.setRGB(env.zenith[0], env.zenith[1], env.zenith[2]);
    if (env.day) {
      u.uSunDir.value.set(dir[0], dir[1], dir[2]).normalize();
      u.uSunCol.value.setRGB(env.sunColor[0], env.sunColor[1], env.sunColor[2]);
      u.uCloud.value = env.cloud;
    }
    renderer.toneMappingExposure = env.exposure;
    post.u.uVignette.value = env.vignette;
    scene.environmentIntensity = env.envIntensity;
    WET.value = env.wet; SNOW.value = env.snow;
    reflection.enabled = env.wet > 0; // sin suelo mojado no hace falta el reflejo
    weather.setMode(env.weather);
    audio.rainK = env.weather === 'rain' ? 1 : 0;
  };
  applyEnv(world.env);
  const resize = () => {
    const w = window.innerWidth; const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    post.setSize(w, h, canvasRatio * scale);
    reflection.setSize(w * canvasRatio * scale, h * canvasRatio * scale);
  };
  const setQuality = (q) => {
    quality = q;
    scale = q === 'low' ? 0.62 : q === 'medium' ? 0.82 : 1;
    post.setMSAA(q === 'low' ? 0 : q === 'medium' ? 2 : 4);
    reflection.scale = q === 'low' ? 0.33 : 0.5;
    // En media/baja se reducen las sombras dinámicas de los focos (recompila shaders una vez).
    const spots = world.lamps.filter((l) => l.light && l.light.isSpotLight && l.shadowWanted);
    spots.forEach((l, i) => { l.light.castShadow = q === 'low' ? false : q === 'medium' ? i < 2 : true; });
    moon.castShadow = q !== 'low';
    resize();
  };
  window.addEventListener('resize', resize);
  resize();

  // Pone en uso otro mapa: oculta el actual (con sus luces) y cambia colisiones, suelo y ambiente.
  const useMap = (id) => {
    const next = loadWorld(id);
    if (next === world) return;
    world.group.visible = false;
    fx.emitters = fx.emitters.filter((e) => !world.emitters.includes(e));
    world = next; g.world = world;
    world.group.visible = true;
    world.emitters.forEach((e) => fx.addEmitter(e));
    player.col = world.col; player.bounds = world.bounds;
    enemies.col = world.col; enemies.cover = world.cover; enemies.lights = world.env.flashlight;
    reflection.hidden[0] = world.ground.mesh;
    weather.setDry(world.dry);
    applyEnv(world.env);
    weapon.lightOn = world.env.flashlight;
    if (world.envTex === undefined) world.envTex = captureEnv(world);
    scene.environment = world.envTex;
    setQuality(quality);
  };
  // Construye un mapa por adelantado (al elegirlo en la sala) para que empezar la partida no tarde.
  const preloadMap = (id) => { if (!worlds[id]) setTimeout(() => loadWorld(id), 80); };

  // ---------- Estados ----------
  let state = 'menu'; // menu | intro | playing | paused | ended
  let stateT = 0; let time = 0; let fade = 0; let fadeTarget = 1;
  const menuShots = [
    { p: [2.2, 1.5, 68], q: [2.6, 1.9, 44], yaw: 0.04, pitch: 0.02 },
    { p: [-9, 5.5, 2], q: [3, 4.5, -8], yaw: 0.9, pitch: -0.2 },
    { p: [-2, 1.3, -18], q: [-2.4, 1.5, -29.5], yaw: 0.0, pitch: 0.06 },
    { p: [16, 2.2, 24], q: [9, 2.0, 21.5], yaw: 0.75, pitch: 0.0 },
  ];
  let shot = 0;
  const far = new THREE.Vector3(0, 0, 900);

  const placeMenuCam = (t) => {
    const s = menuShots[shot]; const k = clamp(t / 11, 0, 1);
    camera.position.set(s.p[0] + (s.q[0] - s.p[0]) * k, s.p[1] + (s.q[1] - s.p[1]) * k, s.p[2] + (s.q[2] - s.p[2]) * k);
    camera.rotation.set(s.pitch + Math.sin(time * 0.3) * 0.006, s.yaw + Math.sin(time * 0.21) * 0.01, 0);
    if (camera.fov !== 52) { camera.fov = 52; camera.updateProjectionMatrix(); }
  };

  const setMode = (m) => {
    mode = m;
    const online = m === 'online';
    enemies.setActive(!online);
    combat.mission = !online;
    combat.survival = m === 'survival';
    if (m !== 'survival') survival.stop();
    if (!online) { loot.clear(); pending.clear(); }
    hud.useHint('');
    $('btn-restart').classList.toggle('hidden', online);
    $('btn-restart').textContent = m === 'survival' ? 'REINICIAR' : 'REINICIAR MISIÓN';
    $('btn-leave').textContent = online ? 'SALIR DE LA PARTIDA' : 'SALIR AL MENÚ';
    $('pause-title').textContent = online ? 'MENÚ' : 'PAUSA';
    $('objective-label').textContent = online ? 'SALA' : m === 'survival' ? 'SUPERVIVENCIA' : 'OBJETIVO';
    hud.setOnline(online);
  };

  const begin = (spawn) => {
    audio.init();
    combat.reset(); combat.restoreBarrels(); fx.reset(); enemies.reset(); player.reset(spawn); weapon.reset();
    input.crouchToggle = false;
    hurtFlash = 0; endTimer = 0; respawnT = 0; sendT = 0; shieldT = 0; matchEnd = null; menuOpen = false;
    state = 'intro'; stateT = 0; fade = 0; fadeTarget = 1;
    armory.hide(); market.hide();
    startSession();
    for (const id of ['menu', 'end', 'pause', 'mp', 'lobby', 'survival']) $(id).classList.add('hidden');
    document.body.classList.add('cine');
    weapon.root.visible = true;
    input.enabled = true;
    if (!NOLOCK) input.lock().then((ok) => { if (!ok) pauseGame(); });
  };

  const startMission = () => {
    setMode('solo');
    useMap(0);
    weapon.allow(0);
    begin(SPAWN);
    player.armor = ARMOR_MAX; // se empieza con el chaleco puesto
    hud.objective('Infiltra la base: cruza el control de acceso', 'Linterna: F');
  };

  // Supervivencia en el mapa `id`: oleadas sin fin (ver survival.js). Se empieza con el chaleco puesto.
  const startSurvival = (id) => {
    setMode('survival');
    useMap(id);
    weapon.allow(0);
    begin(survival.startSpot(id));
    player.armor = ARMOR_MAX;
    survival.start(id);
  };
  // Volver a jugar al mismo modo (pantalla final y botón de reinicio de la pausa).
  const playAgain = () => (mode === 'survival' ? startSurvival(survival.map) : startMission());

  // Punto libre para aparecer: de las zonas del equipo, la más alejada de los rivales (al azar si da igual).
  const pickSpawn = (team) => {
    let base = world.spawns[team][0]; let far = -1;
    for (const zone of world.spawns[team]) {
      let d = 60 + Math.random() * 8;
      for (const r of remotes.map.values()) if (r.placed && r.team !== team && !remotes.isDown(r)) d = Math.min(d, Math.hypot(r.x - zone.x, r.z - zone.z));
      if (d > far) { far = d; base = zone; }
    }
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2; const r = Math.sqrt(Math.random()) * base.r;
      const x = base.x + Math.cos(a) * r; const z = base.z + Math.sin(a) * r;
      if (!world.col.blockedAbove(x, z, 0.6, 0.1, 1.9) && !remotes.near(x, z, 1.2)) return { x, z, yaw: base.yaw };
    }
    return base;
  };

  const onlineStatus = () => `${MAPS[net.room.settings.map].name} · Equipo ${TEAMS[net.me.team]} · ${net.room.players.filter((p) => p.playing).length} en partida`;

  // Protección de reaparición: no se recibe daño durante unos segundos o hasta disparar.
  const shield = () => { shieldT = SPAWN_SHIELD; player.invulnerable = true; };

  const refreshScore = () => {
    hud.score(net.room.score, net.room.settings.goal, net.me.team);
    matchEndsAt = net.room.left > 0 ? performance.now() + net.room.left : 0;
    renderBoard($('scoreboard'), net.room, net.id);
  };

  const startOnline = (m) => {
    setMode('online');
    useMap(net.room.settings.map);
    weapon.allow(net.room.settings.weapons, true);
    remotes.sync(net.room.players, net.id);
    begin(pickSpawn(net.me.team));
    combat.clearBarrels(m.barrels);
    loot.start(m.loot || {}, net.room.settings.map, world.col);
    pending.clear();
    shield();
    hud.objective(net.room.code, onlineStatus());
    refreshScore();
  };

  const toMenu = () => {
    setMode('solo');
    useMap(0);
    remotes.clear();
    input.enabled = false; input.unlock();
    player.reset(); enemies.reset(); fx.reset();
    hurtFlash = 0; endTimer = 0; shieldT = 0; matchEnd = null; menuOpen = false;
    state = 'menu'; stateT = 0; fade = 0;
    hud.show(false);
    document.body.classList.remove('cine');
    for (const id of ['end', 'pause', 'mp', 'lobby', 'survival']) $(id).classList.add('hidden');
    $('menu').classList.remove('hidden');
    refreshProfile();
  };
  // Tras una partida en línea: de vuelta a la sala de espera, sin salir de ella.
  const toLobby = () => { toMenu(); $('menu').classList.add('hidden'); lobby.showRoom(); };

  // Elección de mapa para la supervivencia, con el récord de cada uno.
  const openSurvival = () => {
    const records = loadRecords();
    const list = $('survival-maps');
    list.textContent = '';
    MAPS.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'btn ghost map-pick';
      const r = records[i];
      const name = document.createElement('b'); name.textContent = m.name;
      const desc = document.createElement('span'); desc.textContent = m.desc;
      const rec = document.createElement('span'); rec.className = 'rec';
      rec.textContent = r ? `RÉCORD ${fmt(r.score)} · OLEADA ${r.wave}` : 'SIN RÉCORD';
      b.append(name, desc, rec);
      b.addEventListener('click', () => startSurvival(i));
      list.appendChild(b);
    });
    $('menu').classList.add('hidden');
    $('survival').classList.remove('hidden');
    for (let i = 1; i < MAPS.length; i++) preloadMap(i);
  };

  const lobby = new Lobby(net, { onBack: () => $('menu').classList.remove('hidden') });
  const backToMenu = () => { $('menu').classList.remove('hidden'); refreshProfile(); };
  const armory = new Armory(weapon, { onBack: backToMenu });
  const market = new Market(weapon, audio, { onBack: backToMenu });
  net.handlers = {
    joined: () => { lobby.showRoom(); preloadMap(net.room.settings.map); },
    room: () => {
      lobby.render();
      if (mode !== 'online') preloadMap(net.room.settings.map);
      // Con la partida terminada la escena se queda como estaba hasta salir de la pantalla de resultado.
      if (mode !== 'online' || matchEnd) return;
      remotes.sync(net.room.players, net.id);
      hud.objectiveSub(onlineStatus());
      refreshScore();
    },
    start: startOnline,
    snap: (list) => { if (mode === 'online') remotes.onSnap(list, net.id); },
    fire: (id, d) => { if (mode === 'online' && !matchEnd) combat.remoteShot(id, d); },
    barrel: (i, by) => { if (mode === 'online') combat.remoteBarrel(i, by); },
    // Botín: un cofre abierto (por cualquiera), un objeto que se lleva alguien y la lista de cofres.
    loot: (m) => { if (mode === 'online') loot.onLoot(m.c, m.items); },
    take: (m) => {
      if (mode !== 'online') return;
      loot.remove(m.id);
      pending.delete(m.id);
      if (m.by === net.id && !player.dead) gotItem(m.k);
    },
    chests: (list) => { if (mode === 'online') loot.setChests(list); },
    // Otro jugador nos ha alcanzado: el daño se aplica aquí y, si es mortal, se avisa al servidor.
    // k = 1 es la puñalada rápida: deja la vida en STAB_LEFT, o mata si ya había menos (el chaleco no la para).
    hit: (m) => {
      if (mode !== 'online' || matchEnd) return;
      const r = remotes.get(m.by);
      const dmg = m.k === 1 ? (player.health > STAB_LEFT ? player.health - STAB_LEFT : 200) : m.dmg;
      combat.hurtPlayer(dmg, r ? r.x : player.pos.x, r ? r.z : player.pos.z, m.by, m.part, m.w, m.k === 1);
    },
    // Baja confirmada por el servidor.
    kill: (m) => {
      if (mode !== 'online') return;
      if (m.drop) loot.drop(m.drop); // lo que deja el caído (vendas o chaleco)
      const who = (id) => net.room.players.find((p) => p.id === id);
      const killer = who(m.by); const victim = who(m.id);
      if (!victim) return;
      remotes.markKilled(m.id, m.by === net.id ? player.pos : remotes.get(m.by));
      hud.feed(killer, victim, m.head, m.by === net.id || m.id === net.id, m.w);
      if (m.by === net.id) {
        hud.hitmarker('kill'); audio.hitmarker('kill');
        hud.killMsg(`ELIMINADO · ${victim.name}${m.head ? ' · DISPARO A LA CABEZA' : ''}`);
      } else if (m.id === net.id && killer) hud.killMsg(`TE ELIMINÓ ${killer.name}`);
      if (m.by === net.id && m.id !== net.id) awardKill(m.head, m.w === KNIFE);
    },
    end: (m) => {
      if (mode !== 'online' || matchEnd) return;
      matchEnd = m; endTimer = 1.5;
      const team = (m.room.players.find((p) => p.id === net.id) || net.me).team;
      if (m.winner < 0) award(XP.draw, 'EMPATE'); else if (m.winner === team) award(XP.win, 'VICTORIA'); else award(XP.loss, 'PARTIDA TERMINADA');
      input.enabled = false; input.fire = false; input.aim = false; input.keys.clear();
    },
    error: (msg) => lobby.error(msg),
    close: (msg) => {
      if (mode === 'online') toMenu();
      lobby.open('', msg);
    },
  };

  const pauseGame = () => {
    if (state !== 'playing' && state !== 'intro') return;
    if (mode === 'online') {
      // En línea el mundo sigue: solo se abre el menú y se sueltan los controles.
      if (menuOpen) return;
      menuOpen = true; input.enabled = false; input.fire = false; input.aim = false; input.keys.clear();
    } else { state = 'paused'; audio.suspend(); }
    $('pause').classList.remove('hidden');
    document.body.classList.remove('cine'); hud.show(true);
  };
  const closeMenu = () => { menuOpen = false; input.enabled = true; $('pause').classList.add('hidden'); };

  // La pantalla final sirve para la misión (estadísticas) y para las partidas en línea (tabla por equipos).
  const endLayout = (online) => {
    $('end-stats').classList.toggle('hidden', online);
    $('end-board').classList.toggle('hidden', !online);
    $('btn-again').classList.toggle('hidden', online);
    $('btn-end-lobby').classList.toggle('hidden', !online);
  };

  const showEnd = (win) => {
    state = 'ended';
    input.enabled = false; input.unlock();
    hud.show(false);
    const acc = combat.shots ? Math.round((combat.hits / combat.shots) * 100) : 0;
    const mm = Math.floor(combat.time / 60); const ss = String(Math.floor(combat.time % 60)).padStart(2, '0');
    if (mode === 'survival') {
      const prev = survival.finish();
      const s = survival;
      const cleared = s.phase === 'rest' ? s.wave : s.wave - 1;
      $('end-pre').textContent = `SUPERVIVENCIA · ${MAPS[s.map].name}`;
      $('end-title').textContent = s.newRecord ? 'NUEVO RÉCORD' : 'CAÍDO EN COMBATE';
      $('end-stats').innerHTML = `<span>PUNTOS</span><span>${fmt(s.score)}</span><span>OLEADAS SUPERADAS</span><span>${cleared}</span>`
        + `<span>BAJAS</span><span>${combat.kills}</span><span>DISPAROS A LA CABEZA</span><span>${combat.headshots}</span>`
        + `<span>PRECISIÓN</span><span>${acc} %</span><span>TIEMPO</span><span>${mm}:${ss}</span>`
        + (prev.score && !s.newRecord ? `<span>RÉCORD</span><span>${fmt(prev.score)} · oleada ${prev.wave}</span>` : '');
      endLayout(false);
      renderEndXp();
      $('end').classList.remove('hidden');
      return;
    }
    $('end-pre').textContent = win ? 'MISIÓN' : 'OPERADOR';
    $('end-title').textContent = win ? 'COMPLETADA' : 'CAÍDO EN COMBATE';
    $('end-stats').innerHTML = `<span>TIEMPO</span><span>${mm}:${ss}</span><span>BAJAS</span><span>${combat.kills} / ${enemies.list.length}</span>`
      + `<span>DISPAROS A LA CABEZA</span><span>${combat.headshots}</span><span>PRECISIÓN</span><span>${acc} %</span>`;
    endLayout(false);
    renderEndXp();
    $('end').classList.remove('hidden');
  };

  // Resultado de una partida en línea (mensaje "end" del servidor).
  const showMatchEnd = (m) => {
    state = 'ended';
    input.enabled = false; input.unlock();
    hud.show(false);
    menuOpen = false; $('pause').classList.add('hidden');
    const team = (m.room.players.find((p) => p.id === net.id) || net.me).team;
    $('end-pre').textContent = `${TEAMS[0]} ${m.room.score[0]} — ${m.room.score[1]} ${TEAMS[1]}`;
    $('end-title').textContent = m.winner < 0 ? 'EMPATE' : team === m.winner ? 'VICTORIA' : 'DERROTA';
    renderBoard($('end-board'), m.room, net.id);
    endLayout(true);
    renderEndXp();
    $('end').classList.remove('hidden');
  };
  g.onMissionEnd = () => { endTimer = 1.6; player.invulnerable = true; award(XP.mission, 'MISIÓN COMPLETADA'); };

  input.onLockChange = (locked) => {
    if (NOLOCK) return;
    if (!locked) pauseGame();
    else if (menuOpen) closeMenu();
    else if (state === 'paused') {
      state = 'playing'; $('pause').classList.add('hidden'); audio.resume();
    }
  };
  // Si se pierde la captura sin pasar por la pausa, un clic en el juego la recupera.
  renderer.domElement.addEventListener('click', () => { if (!NOLOCK && state === 'playing' && !input.locked) input.lock(); });
  $('btn-start').addEventListener('click', startMission);
  $('btn-again').addEventListener('click', playAgain);
  $('btn-restart').addEventListener('click', () => { audio.resume(); playAgain(); });
  $('btn-survival').addEventListener('click', openSurvival);
  $('btn-survival-back').addEventListener('click', () => { $('survival').classList.add('hidden'); $('menu').classList.remove('hidden'); });
  $('btn-mp').addEventListener('click', () => lobby.open());
  $('btn-armory').addEventListener('click', () => armory.show());
  $('btn-market').addEventListener('click', () => market.show());
  $('btn-leave').addEventListener('click', () => { if (mode === 'online') net.leave(); else audio.resume(); toMenu(); });
  $('btn-end-lobby').addEventListener('click', toLobby);
  $('btn-end-menu').addEventListener('click', () => { net.leave(); toMenu(); });
  $('btn-resume').addEventListener('click', async () => { if (!(await input.lock())) hud.message('Haz clic de nuevo para continuar', 2); });
  $('opt-sens').addEventListener('input', (e) => { player.sensitivity = Number(e.target.value); });
  $('opt-vol').addEventListener('input', (e) => audio.setVolume(Number(e.target.value)));
  $('opt-quality').addEventListener('change', (e) => setQuality(e.target.value));
  // Al cerrar la pestaña se suelta la sala en el acto, para que los demás no esperen a que caduque la conexión.
  window.addEventListener('pagehide', () => net.leave());
  window.addEventListener('beforeunload', (e) => { if (state === 'playing' || state === 'paused') { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Bucle ----------
  let unlockedT = 0;
  let last = performance.now(); let frame = 0; let fpsAcc = 0; let fpsN = 0; let fps = 0; let msAvg = 16; let calls = 0;
  const rainExtra = [
    { x: 0, y: 0, z: 0, range: 34, r: 0.85, g: 0.92, b: 1, intensity: 0, cos: Math.cos(0.44), dir: new THREE.Vector3() },
    { x: 0, y: 0, z: 0, range: 16, r: 1, g: 0.7, b: 0.35, intensity: 0 },
    { x: 0, y: 0, z: 0, range: 40, r: 1, g: 0.55, b: 0.25, intensity: 0 },
  ];
  const lookDir = new THREE.Vector3(); const lookHit = {};

  function tick(now) {
    requestAnimationFrame(tick);
    const rawDt = (now - last) / 1000; last = now;
    const dt = Math.min(0.05, rawDt);
    frame++;
    if (frame === 4) weapon.endWarmup(); // los shaders de las skins ya están compilados
    msAvg += (Math.min(rawDt * 1000, 45) - msAvg) * 0.04;
    fpsAcc += rawDt; fpsN++;
    if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (state === 'paused') { input.endFrame(); return; }
    // Red de seguridad: si se está jugando sin el ratón capturado, se pasa a pausa.
    if (!NOLOCK && state === 'playing' && !input.locked && !menuOpen) { unlockedT += rawDt; if (unlockedT > 0.8) { unlockedT = 0; pauseGame(); return; } } else unlockedT = 0;
    time += dt; stateT += dt;

    // --- Lógica ---
    if (state === 'menu') {
      // En la armería y el Mercado Negro no se cambia de plano: se está mirando el arma (o la ruleta). El primer
      // plano cruza el todoterreno y, parado al final, se queda dentro de la cabina: entonces se pasa al siguiente.
      const still = armory.open || market.open;
      if (still && shot === 0 && stateT > 6) { stateT = 0; shot = 1; }
      if (still && stateT > 9) stateT = 9;
      if (stateT > 11) { stateT = 0; shot = (shot + 1) % menuShots.length; }
      fadeTarget = stateT < 0.2 || stateT > 10.2 ? 0 : 1;
      placeMenuCam(stateT);
      player.pos.copy(far);
      const show = armory.open ? armory.slot : market.open ? market.showSlot : -1;
      weapon.root.visible = show >= 0;
      weapon.light.intensity = 0;
      if (show >= 0) weapon.showcase(dt, time, show);
      if (market.open) market.update(rawDt);
      enemies.update(dt, player, combat);
    } else {
      if (state === 'intro' && stateT > 2.3) { state = 'playing'; document.body.classList.remove('cine'); hud.show(true); }
      player.update(dt, input, weapon.aiming, !weapon.reloading && !weapon.use);
      camera.updateMatrixWorld();
      if (mode === 'online') updateLoot();
      weapon.update(dt, input, player, combat);
      enemies.update(dt, player, combat);
      if (mode !== 'online') player.regen(dt); // en línea la vida sólo se recupera con vendas o botiquín
      combat.update(dt);
      if (mode === 'survival' && state !== 'ended') survival.update(dt);
      if (mode === 'online') {
        if (matchEnd) {
          if (state !== 'ended' && (endTimer -= dt) <= 0) showMatchEnd(matchEnd);
        } else {
          if (respawnT > 0) {
            respawnT -= dt;
            if (respawnT > 0) hud.message(`Reapareces en ${Math.ceil(respawnT)}`, 0.2);
            else { player.reset(pickSpawn(net.me.team)); weapon.reset(); shield(); net.spawned(); }
          }
          if (shieldT > 0 && ((shieldT -= dt) <= 0 || weapon.sinceShot < 0.2)) { shieldT = 0; player.invulnerable = false; }
          sendT += rawDt;
          if (sendT >= SEND_INTERVAL) {
            sendT = 0;
            const flags = (player.crouching ? FLAG.CROUCH : 0) | (player.sprinting ? FLAG.SPRINT : 0) | (weapon.aiming ? FLAG.AIM : 0)
              | (weapon.lightOn ? FLAG.LIGHT : 0) | (shieldT > 0 ? FLAG.SHIELD : 0) | (player.lock ? FLAG.LOCK : 0) | (player.sliding ? FLAG.SLIDE : 0) | (player.vault ? FLAG.VAULT : 0)
              | (weapon.netWeapon << WEAPON_SHIFT) | (weapon.def.heal !== undefined ? FLAG.ITEM : 0)
              | ((player.lean < -0.12 ? 1 : player.lean > 0.12 ? 2 : 0) << LEAN_SHIFT);
            net.sendState(player.pos.x, player.pos.y, player.pos.z, player.yaw, player.pitch, flags);
          }
        }
        hud.board(input.down('Tab') && !matchEnd);
        hud.clock(matchEndsAt && !matchEnd ? Math.max(0, Math.ceil((matchEndsAt - performance.now()) / 1000)) : -1);
      } else if (endTimer > 0 && state !== 'ended') { endTimer -= dt; if (endTimer <= 0) showEnd(!player.dead); }
      hud.update(dt, { player, weapon, camera, objective: combat.objective, fps: DEBUG ? `${fps} FPS · ${calls} dc · x${scale.toFixed(2)}` : undefined });
      if (weapon.mag === 0 && !weapon.reloading && !player.dead) hud.message(weapon.reserve > 0 ? 'R — RECARGAR' : 'SIN MUNICIÓN', 0.2);
    }
    fade = damp(fade, fadeTarget, state === 'menu' ? 5 : 2.2, dt);

    // --- Ambiente ---
    weather.update(dt, camera);
    const fl = weather.flash;
    moon.intensity = world.env.sun.intensity + fl * 4.5; hemi.intensity = world.env.hemi.intensity + fl * 1.4;
    scene.fog.color.setRGB(fogBase.r + fl * 0.16, fogBase.g + fl * 0.19, fogBase.b + fl * 0.26);
    sky.uniforms.uFlash.value = fl; sky.uniforms.uTime.value = time; sky.uniforms.uHorizon.value.copy(scene.fog.color);
    world.ground.uniforms.uTime.value = time;
    tickVolumetrics(time);
    world.ctx.updateLamps(dt, time, state === 'menu' ? null : audio);
    for (const u of world.ctx.updaters) u(dt, time);
    if (mode === 'online') {
      // A quién se está apuntando: su nombre se muestra aunque sea rival.
      let focus = 0;
      if (state !== 'menu' && !player.dead) {
        const p = camera.position;
        camera.getWorldDirection(lookDir);
        const wh = world.col.raycast(p.x, p.y, p.z, lookDir.x, lookDir.y, lookDir.z, 90, 'sight', lookHit, true);
        const rh = remotes.raycast(p.x, p.y, p.z, lookDir.x, lookDir.y, lookDir.z, wh ? wh.dist : 90, -1, 0.3, true);
        if (rh) focus = rh.player.id;
      }
      remotes.update(dt, camera, net.me.team, focus);
      loot.update(dt, camera);
    }
    if (frame % world.env.shadowEvery === 0 || fl > 0.01) moon.shadow.needsUpdate = true;

    const L = rainExtra;
    L[0].x = weapon.lightPos.x; L[0].y = weapon.lightPos.y; L[0].z = weapon.lightPos.z; L[0].dir.copy(weapon.lightDir); L[0].intensity = (weapon.light.intensity / LIGHT_POWER) * 1.6;
    for (const [i, li] of [[1, 0], [2, 2]]) { const l = fx.lights[li]; L[i].x = l.position.x; L[i].y = l.position.y; L[i].z = l.position.z; L[i].intensity = Math.min(3, l.intensity / 250); }
    weather.setLights(camera.position, world.lamps, L);
    fx.update(dt, camera);

    const indoor = world.ground.indoor(camera.position.x, camera.position.z) ? 1 : 0;
    let humDist = 99; for (const h of world.hum) humDist = Math.min(humDist, Math.hypot(h.x - camera.position.x, h.z - camera.position.z));
    audio.setListener(camera.position.x, camera.position.y, camera.position.z, state === 'menu' ? camera.rotation.y : player.yaw);
    audio.update(dt, { indoor, combat: enemies.combatLevel > 0 ? 1 : 0, humDist, fireDist: world.fire ? Math.hypot(world.fire.x - camera.position.x, world.fire.z - camera.position.z) : 99, time });

    // --- Postprocesado ---
    hurtFlash = Math.max(0, hurtFlash - dt * 1.6);
    const low = state === 'menu' ? 0 : clamp(1 - player.health / 45, 0, 1);
    post.u.uDamage.value = Math.min(1, hurtFlash * 0.5 + low * 0.5 + (player.dead ? 0.6 : 0));
    post.u.uSat.value = 1 - low * 0.45 - (player.dead ? 0.5 : 0);
    post.u.uFade.value = fade;
    post.u.uFlash.value = fl * 0.03;
    $('fade').classList.add('clear');

    // --- Render ---
    renderer.info.reset();
    camera.updateMatrixWorld();
    reflection.render(scene, camera);
    post.render(scene, camera, dt, time);
    calls = renderer.info.render.calls;
    input.endFrame();

    // Resolución adaptativa en calidad automática.
    if (quality === 'auto' && frame % 45 === 0 && frame > 120) {
      // Baja rápido si no llega a ~45 fps; sube despacio y sólo tras un tiempo estable.
      if (msAvg > 22.5 && scale > 0.6) { scale = Math.max(0.6, scale - 0.08); lastDrop = time; resize(); }
      else if (msAvg < 17.6 && scale < 1 && time - lastDrop > 14) { scale = Math.min(1, scale + 0.04); resize(); }
    }
  }

  // Precompila shaders antes de habilitar el botón para evitar tirones.
  placeMenuCam(0);
  try { await renderer.compileAsync(scene, camera); } catch { /* compilación perezosa */ }
  requestAnimationFrame((t) => { last = t; tick(t); });
  const btn = $('btn-start');
  btn.disabled = false; btn.querySelector('.mi-desc').textContent = 'Infiltra la base y llega al almacén';
  $('btn-mp').disabled = false;
  $('btn-armory').disabled = false;
  $('btn-market').disabled = false;
  refreshProfile();
  $('btn-survival').disabled = false;
  if (params.get('sala')) lobby.open(params.get('sala'));
  if (DEBUG) $('fps-counter').classList.remove('hidden');

  window.__game = {
    ready: false, profile, progress: { award, session, prestige }, market, player, weapon, enemies, combat, survival, input, post, camera, scene, renderer, weather, fx, audio, net, remotes, armory, loot, useMap,
    get world() { return world; },
    get mode() { return mode; },
    start: startMission,
    startSurvival,
    teleport(x, z, yawDeg = 0, pitchDeg = 0) { player.pos.set(x, 0, z); player.vel.set(0, 0, 0); player.yaw = THREE.MathUtils.degToRad(yawDeg); player.pitch = THREE.MathUtils.degToRad(pitchDeg); },
    stats() {
      const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { fps, ms: Math.round(msAvg * 10) / 10, calls, tris: renderer.info.render.triangles, scale, state, mode, alive: enemies.alive, hp: Math.round(player.health), gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?' };
    },
  };
  if (AUTOSTART) { startMission(); hud.show(true); }
  setTimeout(() => { window.__game.ready = true; }, 600);
}

boot().catch(showError);
