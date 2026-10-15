// Prueba del modo en línea: dos navegadores (anfitrión e invitado) y un tercer jugador simulado
// crean/entran en una sala y juegan una partida corta. Se comprueba la sala, la sincronización de
// movimiento, los nombres, el combate con las tres armas (daño, bajas, marcador, reaparición, bidones),
// el botín (cofres, objetos del suelo y vendas), los ajustes de la partida y el final de partida.
//
//   node tools/mptest.mjs [dirSalida] [--port 5198]
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 5198;
const outDir = resolve(args.find((a, i) => !a.startsWith('--') && (portIdx < 0 || i !== portIdx + 1)) || join(ROOT, 'tools', 'out'));
mkdirSync(outDir, { recursive: true });
const BASE = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const logs = [];
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '  ok ' : 'FALLO'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };
const section = (name) => console.log(`\n${name}`);

const server = spawn(process.execPath, [join(ROOT, 'server.js'), String(PORT)], { stdio: 'ignore' });
await sleep(500);
// Un navegador por jugador: así ninguna página queda en segundo plano (donde no se dibuja).
const browsers = [];
const launch = () => puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--window-size=1280,720', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--mute-audio', '--no-first-run',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  defaultViewport: { width: 1280, height: 720 },
}).then((b) => { browsers.push(b); return b; });

async function open(tag, query) {
  const page = await (await launch()).newPage();
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warn' && !m.text().includes('X4122'))) logs.push(`[${tag} ${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[${tag} pageerror] ${e.stack || e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`[${tag} http ${r.status()}] ${r.url()}`); });
  await page.goto(BASE + query, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__game && window.__game.ready === true', { timeout: 90000 });
  return page;
}
const shot = (page, name) => page.screenshot({ path: join(outDir, `${name}.jpg`), type: 'jpeg', quality: 86 });
const click = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);
const visible = (page, id) => page.evaluate((i) => !document.getElementById(i).classList.contains('hidden'), id);
const text = (page, id) => page.evaluate((i) => document.getElementById(i).textContent, id);
const waitFor = (page, expr, timeout = 6000) => page.waitForFunction(expr, { timeout }).then(() => true, () => false);
// Dispara durante `ms` apuntando con la mira (dispersión mínima).
// Elige una opción de un desplegable como lo haría el jugador.
const choose = (page, id, value) => page.evaluate((i, v) => { const s = document.getElementById(i); s.value = v; s.dispatchEvent(new Event('change')); }, id, value);
const fire = async (page, ms) => { await page.evaluate('__game.input.fire = true'); await sleep(ms); await page.evaluate('__game.input.fire = false'); };

// Jugador simulado: habla el protocolo directamente, sin navegador.
class Bot {
  constructor() { this.id = 0; this.room = null; this.started = null; this.hits = 0; this.kills = []; this.loots = []; this.takes = []; this.ended = null; this.error = ''; this.pose = null; this.timer = null; }

  async connect() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'joined') { this.id = m.id; this.room = m.room; }
      if (m.t === 'room') this.room = m.room;
      if (m.t === 'start') { this.started = m; this.room = m.room; }
      if (m.t === 'hit') this.hits++;
      if (m.t === 'kill') this.kills.push(m);
      if (m.t === 'loot') this.loots.push(m);
      if (m.t === 'take') this.takes.push(m);
      if (m.t === 'end') this.ended = m;
      if (m.t === 'error') this.error = m.msg;
    });
    await new Promise((r) => this.ws.on('open', r));
    // Envía su postura 20 veces por segundo, como un cliente real.
    this.timer = setInterval(() => { if (this.pose) this.send({ t: 's', d: this.pose() }); }, 50);
  }

  send(msg) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  close() { clearInterval(this.timer); this.ws.terminate(); }
}

const bots = [];
try {
  // ------------------------------------------------------------------
  section('Sala');
  const A = await open('A', '?nolock=1&debug=1');
  await click(A, 'btn-mp');
  await click(A, 'btn-create'); // sin nombre: debe avisar
  check('pide el nombre antes de crear', (await text(A, 'mp-error')).length > 0);
  await A.$eval('#mp-name', (e) => { e.value = 'Alex'; });
  await click(A, 'btn-create');
  await waitFor(A, '!document.getElementById("lobby").classList.contains("hidden")');
  const code = await text(A, 'lobby-code');
  check('sala creada con código de 4 caracteres', /^[A-Z2-9]{4}$/.test(code), code);

  // Invitado: llega por enlace con el código; primero prueba un código que no existe.
  const B = await open('B', `?nolock=1&debug=1&sala=${code}`);
  check('el enlace abre la pantalla de unirse con el código escrito', (await visible(B, 'mp')) && (await B.$eval('#mp-code', (e) => e.value)) === code);
  await B.$eval('#mp-name', (e) => { e.value = 'Marta'; });
  await B.$eval('#mp-code', (e) => { e.value = 'ZZZZ'; });
  await click(B, 'btn-join');
  await waitFor(B, 'document.getElementById("mp-error").textContent.length > 0');
  check('código inexistente: muestra error', (await text(B, 'mp-error')).includes('No existe'));
  await B.$eval('#mp-code', (e, c) => { e.value = c; }, code);
  await click(B, 'btn-join');
  await waitFor(B, '!document.getElementById("lobby").classList.contains("hidden")');

  // Tercer jugador simulado, con el mismo nombre que el anfitrión.
  let bot = new Bot(); bots.push(bot);
  await bot.connect();
  bot.send({ t: 'join', code: code.toLowerCase(), name: 'Alex' });
  await sleep(400);
  check('tres jugadores en la sala, repartidos y con nombres únicos', bot.room.players.length === 3 && new Set(bot.room.players.map((p) => p.name)).size === 3
    && bot.room.players[1].team === 1, bot.room.players.map((p) => `${p.name}:${p.team}`).join(', '));
  const idA = bot.room.players.find((p) => p.name === 'Alex').id;
  check('el invitado no puede iniciar', await B.$eval('#btn-enter', (e) => e.disabled));

  await click(B, 'btn-team-0');
  await sleep(300);
  check('cambio de equipo visible para el anfitrión', (await text(A, 'team-list-0')).includes('Marta'));
  await click(B, 'btn-team-1');

  // El anfitrión fija la partida a 4 bajas (el ajuste lo usará la pantalla de personalización).
  await A.evaluate('__game.net.set({ goal: 4 })');
  await B.evaluate('__game.net.set({ goal: 99 })'); // un invitado no puede cambiarlo
  await sleep(300);
  check('el límite de bajas lo fija el anfitrión y lo ven todos', (await text(B, 'lobby-note')).includes('4 bajas') && (await text(A, 'lobby-note')).includes('4 bajas'));

  // ------------------------------------------------------------------
  section('Ajustes de la partida');
  check('sólo el anfitrión puede tocar los ajustes', (await B.$eval('#set-respawn', (e) => e.disabled)) && !(await A.$eval('#set-respawn', (e) => e.disabled)));
  await choose(A, 'set-respawn', '2');
  await choose(A, 'set-teamSize', '1'); // ALFA ya tiene dos: el servidor no deja bajar de ahí
  await sleep(300);
  const cfgB = await B.evaluate('({ respawn: document.getElementById("set-respawn").value, size: document.getElementById("set-teamSize").value, count: document.getElementById("team-count-0").textContent, btn: document.getElementById("btn-team-0").textContent, off: document.getElementById("btn-team-0").disabled })');
  check('los cambios del anfitrión llegan a todos', cfgB.respawn === '2', JSON.stringify(cfgB));
  check('el tamaño de equipo no deja fuera a quien ya está', cfgB.size === '2' && cfgB.count === '2 / 2');
  check('equipo completo: no se puede pasar a él', cfgB.btn === 'EQUIPO COMPLETO' && cfgB.off);
  await choose(A, 'set-map', '1');
  await sleep(300);
  check('el mapa lo elige el anfitrión y lo ven todos', (await B.$eval('#set-map', (e) => e.value + e.selectedOptions[0].textContent)).startsWith('1LA SOLANA'));
  await choose(A, 'set-map', '2');
  await sleep(300);
  check('están los tres mapas', (await B.$eval('#set-map', (e) => e.options.length + e.selectedOptions[0].textContent)).startsWith('3MUELLE NORTE'));
  await choose(A, 'set-map', '0');
  const extra = new Bot(); bots.push(extra);
  await extra.connect();
  extra.send({ t: 'join', code, name: 'Cuarto' });
  await sleep(250);
  const late = new Bot(); bots.push(late);
  await late.connect();
  late.send({ t: 'join', code, name: 'Quinto' });
  await sleep(250);
  check('con los equipos llenos no entra nadie más', !!extra.room && extra.room.players.length === 4 && !late.room && late.error.includes('llena'), late.error);
  extra.send({ t: 'team', team: 0 });
  await sleep(200);
  check('el servidor rechaza pasar a un equipo completo', extra.error.includes('completo') && extra.room.players.find((p) => p.name === 'Cuarto').team === 1);
  extra.close(); late.close();
  await sleep(300);
  await shot(A, '1-sala-anfitrion');

  // ------------------------------------------------------------------
  section('Inicio y sincronización');
  await click(A, 'btn-enter');
  await sleep(600);
  const stA = await A.evaluate('__game.stats()'); const stB = await B.evaluate('__game.stats()');
  check('la partida empieza para todos', stA.mode === 'online' && stB.mode === 'online' && !!bot.started, `${stA.state}/${stB.state}`);
  check('sin enemigos de IA en línea', await A.evaluate('__game.enemies.list.every((e) => !e.s.mesh.visible)'));
  const posA = await A.evaluate('[__game.player.pos.x, __game.player.pos.z]'); const posB = await B.evaluate('[__game.player.pos.x, __game.player.pos.z]');
  check('cada equipo aparece en su esquina', posA[0] < -25 && posA[1] > 4 && posB[0] > 30 && posB[1] < -40, `A ${posA.map((v) => v.toFixed(1))}  B ${posB.map((v) => v.toFixed(1))}`);
  check('protección al aparecer', await A.evaluate('__game.player.invulnerable === true'));

  // El jugador simulado camina en círculo; el invitado se acerca agachado.
  let ang = 0; let walking = true; let botAt = [0, 2.5, Math.PI];
  bot.pose = () => {
    if (!walking) return [botAt[0], 0, botAt[1], botAt[2], 0, 8];
    ang += 0.035;
    return [Math.cos(ang) * 2.2, 0, 2 + Math.sin(ang) * 2.2, -ang, 0, 8];
  };
  await A.evaluate('__game.teleport(0, 10.5, 0, -4)');
  await B.evaluate('__game.teleport(3.2, 5.5, 147, 0)');
  await B.evaluate('__game.input.crouchToggle = true');
  await sleep(2600);
  await shot(A, '2-partida-anfitrion');

  const seenA = await A.evaluate('[...__game.remotes.map.values()].map((r) => ({ name: r.name, team: r.team, x: r.x, z: r.z, vis: r.s.mesh.visible, speed: r.speed, crouch: r.pose.crouch }))');
  const marta = seenA.find((r) => r.name === 'Marta'); const alex2 = seenA.find((r) => r.name !== 'Marta');
  check('el anfitrión ve a los otros dos', seenA.length === 2 && seenA.every((r) => r.vis), seenA.map((r) => r.name).join(', '));
  check('posición del invitado sincronizada', !!marta && Math.hypot(marta.x - 3.2, marta.z - 5.5) < 0.3 && marta.team === 1, marta && `${marta.x.toFixed(2)}, ${marta.z.toFixed(2)}`);
  check('postura agachada sincronizada', !!marta && marta.crouch > 0.8);
  check('el jugador simulado se ve caminando', !!alex2 && alex2.speed > 0.8 && alex2.speed < 3, alex2 && `${alex2.speed.toFixed(2)} m/s`);
  const seenB = await B.evaluate('[...__game.remotes.map.values()].map((r) => ({ name: r.name, x: r.x, z: r.z }))');
  const alex = seenB.find((r) => r.name === 'Alex');
  check('el invitado ve al anfitrión donde está', !!alex && Math.hypot(alex.x - 0, alex.z - 10.5) < 0.3, alex && `${alex.x.toFixed(2)}, ${alex.z.toFixed(2)}`);
  check('la protección de aparición caduca', await A.evaluate('__game.player.invulnerable === false'));
  const fpsA = (await A.evaluate('__game.stats()')).fps;
  check('rendimiento con jugadores remotos', fpsA >= 50, `${fpsA} FPS`);

  // Cobertura: el invitado pulsa agacharse junto a una caja baja y se asoma con E; el anfitrión lo ve inclinado.
  await B.evaluate('__game.input.crouchToggle = false; __game.teleport(-9.5, 30.75, 90, 0)');
  await sleep(300);
  await B.evaluate('__game.input.crouchToggle = true');
  await sleep(300);
  await B.evaluate("__game.input.keys.add('KeyE')");
  await sleep(900);
  const cov = await B.evaluate('({ inCover: __game.player.inCover, lean: __game.player.lean })');
  check('agacharse junto a una caja pone a cubierto y deja asomarse', cov.inCover && cov.lean > 0.3, JSON.stringify(cov));
  const leanSeen = await A.evaluate("[...__game.remotes.map.values()].find((r) => r.name === 'Marta').pose.lean");
  check('asomarse se sincroniza', leanSeen > 0.8, leanSeen.toFixed(2));
  await B.evaluate("__game.input.keys.delete('KeyE'); __game.teleport(3.2, 5.5, 147, 0)");
  await sleep(700);

  // ------------------------------------------------------------------
  section('Nombres');
  const tags = () => A.evaluate('Object.fromEntries([...__game.remotes.map.values()].map((r) => [r.name, Math.round(r.tagA * 100) / 100]))');
  let tg = await tags();
  check('el nombre del compañero se ve siempre', tg['Alex 2'] > 0.9, JSON.stringify(tg));
  check('el nombre del rival está oculto si no se le apunta', tg.Marta < 0.05, JSON.stringify(tg));
  await A.evaluate('__game.teleport(0, 10.5, -32.6, -7.5)'); // apunta al invitado
  await sleep(500);
  tg = await tags();
  check('al apuntar a un rival aparece su nombre', tg.Marta > 0.9, JSON.stringify(tg));
  await shot(A, '2b-nombre-del-rival');
  await A.evaluate('__game.teleport(0, 10.5, 0, -4)');
  await sleep(400);
  check('sigue visible un momento al dejar de apuntarle', (await tags()).Marta > 0.5);
  await sleep(1800);
  check('y después se oculta', (await tags()).Marta < 0.05);

  // ------------------------------------------------------------------
  section('Combate');
  // Los disparos del anfitrión se ven y se oyen en el otro equipo: el fogonazo sale de su arma.
  await A.evaluate('__game.input.aim = true');
  await A.evaluate('__game.teleport(0, 10.5, 0, -35)');
  await sleep(400);
  await A.evaluate('__game.input.fire = true');
  await sleep(160);
  await shot(B, '3-disparos-vistos-por-el-invitado');
  await A.evaluate('__game.input.fire = false');
  await sleep(200);
  const flash = await B.evaluate('(() => { const l = __game.fx.lights[1]; return [l.position.x, l.position.y, l.position.z]; })()');
  check('el invitado recibe los disparos del anfitrión', Math.hypot(flash[0] - 0, flash[2] - 10.5) < 1.6 && flash[1] > 0.5, flash.map((v) => v.toFixed(2)).join(', '));

  // Fuego amigo desactivado: disparar a un compañero no le hace nada.
  walking = false;
  await B.evaluate('__game.input.crouchToggle = false; __game.teleport(20, 12, 0, 0)');
  await A.evaluate('__game.teleport(0, 10.5, 0, -3)');
  await sleep(600);
  await fire(A, 300);
  await sleep(300);
  const ff = await A.evaluate('({ shots: __game.combat.shots, hits: __game.combat.hits })');
  check('sin fuego amigo: los compañeros no reciben daño', ff.shots >= 4 && ff.hits === 0 && bot.hits === 0, `${ff.shots} disparos, ${ff.hits} impactos`);

  // Rival a 8 m: el daño llega a la víctima.
  botAt = [40, 10, 0];
  // Si pisa un chaleco que dejó un caído, el daño iría a él: las comprobaciones de vida se hacen sin chaleco
  // y sin objetos en el suelo de su pantalla (así no recoge ninguno).
  await B.evaluate('__game.loot.items.clear(); __game.player.armor = 0; __game.teleport(0, 2.5, 180, 0)');
  await A.evaluate('__game.teleport(0, 10.5, 0, -3)');
  await sleep(700);
  await fire(A, 110);
  await sleep(350);
  const hitsA = (await A.evaluate('__game.combat.hits')) - ff.hits;
  const hpB = await B.evaluate('__game.player.health');
  check('los impactos quitan vida al rival', hitsA >= 1 && Math.abs(100 - hpB - 26 * hitsA) < 0.5, `${hitsA} impactos, vida ${hpB.toFixed(0)}`);
  check('el herido ve de dónde le disparan', await B.evaluate('Math.cos(__game.player.hurtDir) > 0.9'), 'de frente');

  // Hasta abatirlo.
  await A.evaluate('__game.teleport(0, 10.5, 0, -3)');
  await sleep(150);
  await A.evaluate('__game.input.fire = true');
  const died = await waitFor(B, '__game.player.dead === true', 3000);
  await A.evaluate('__game.input.fire = false');
  await sleep(400);
  check('el rival cae', died);
  const scoreA = await A.evaluate('__game.net.room.score'); const scoreB = await B.evaluate('__game.net.room.score');
  check('la baja sube el marcador del equipo', scoreA.join() === '1,0' && scoreB.join() === '1,0' && (await text(A, 'score-0')) === '1', `A ${scoreA}  B ${scoreB}`);
  const feedA = await text(A, 'killfeed');
  check('registro de bajas con los dos nombres', feedA.includes('Alex') && feedA.includes('Marta'), feedA);
  check('aviso al que mata y al que muere', (await text(A, 'kill-msg')).includes('ELIMINADO · Marta') && (await text(B, 'kill-msg')).includes('TE ELIMINÓ Alex')
    && (await A.$eval('#hitmarker', (e) => e.className)) === 'kill');
  check('el cuerpo del rival cae a la vista del que dispara', await A.evaluate('(() => { const r = [...__game.remotes.map.values()].find((p) => p.name === "Marta"); return __game.remotes.isDown(r) && r.pose.death > 0.3; })()'));
  const kd = await A.evaluate('__game.net.room.players.map((p) => `${p.name} ${p.k}/${p.d}`).join(", ")');
  check('bajas y muertes por jugador', kd.includes('Alex 1/0') && kd.includes('Marta 0/1'), kd);
  await A.evaluate('__game.input.keys.add("Tab")');
  await sleep(250);
  check('tabla de jugadores con Tab', (await visible(A, 'scoreboard')) && (await text(A, 'scoreboard')).includes('Marta'));
  await shot(A, '4-baja-y-tabla');
  await A.evaluate('__game.input.keys.delete("Tab")');

  // Reaparición con protección.
  const back = await waitFor(B, '__game.player.dead === false', 5000);
  const re = await B.evaluate('({ hp: __game.player.health, x: __game.player.pos.x, z: __game.player.pos.z, shield: __game.player.invulnerable, state: __game.stats().state })');
  check('el rival reaparece en su esquina, protegido', back && re.hp === 100 && re.x > 30 && re.z < -40 && re.shield && re.state === 'playing', JSON.stringify(re));
  await sleep(500);
  check('los demás lo ven de pie y protegido', await A.evaluate('(() => { const r = [...__game.remotes.map.values()].find((p) => p.name === "Marta"); return !__game.remotes.isDown(r) && (r.flags & 32) !== 0 && r.x > 30; })()'));
  await sleep(2400);
  check('la protección se acaba', await B.evaluate('__game.player.invulnerable === false'));

  // ------------------------------------------------------------------
  section('Armas');
  const hud = () => A.evaluate('({ cur: __game.weapon.cur, name: document.getElementById("weapon-name").textContent, on: [...document.querySelectorAll("#toolbar .slot")].findIndex((s) => s.classList.contains("on")) })');
  const weaponSeenByB = () => B.evaluate('(() => { const r = [...__game.remotes.map.values()].find((p) => p.name === "Alex"); return __game.remotes.weaponOf(r); })()');
  // Pistola: un disparo por pulsación y menos daño que el fusil.
  await B.evaluate('__game.loot.items.clear(); __game.player.armor = 0; __game.teleport(0, 2.5, 180, 0)');
  await A.evaluate('__game.input.pressed.add("Digit2")');
  await A.evaluate('__game.teleport(0, 10.5, 0, -3)');
  await sleep(800);
  let h = await hud();
  check('la tecla 2 saca la pistola y la barra lo marca', h.cur === 1 && h.name.includes('P22') && h.on === 1, JSON.stringify(h));
  check('los demás ven el arma que llevas', (await weaponSeenByB()) === 1);
  const shotsBefore = await A.evaluate('__game.combat.shots');
  await fire(A, 260);
  await sleep(350);
  const pistol = { shots: (await A.evaluate('__game.combat.shots')) - shotsBefore, hp: await B.evaluate('__game.player.health') };
  check('la pistola es semiautomática y de poco calibre', pistol.shots === 1 && Math.abs(pistol.hp - 83) < 0.5, `${pistol.shots} disparo, vida del rival ${pistol.hp.toFixed(0)}`);
  await shot(B, '4b-pistola-vista-por-el-rival');

  // Cuchillo por la espalda: quita toda la vida de un golpe.
  await A.evaluate('__game.input.aim = false; __game.input.pressed.add("Digit3")');
  await B.evaluate('__game.teleport(0, 2.5, 0, 0)'); // de espaldas al anfitrión
  await A.evaluate('__game.teleport(0, 4, 0, -8)');
  await sleep(800);
  h = await hud();
  check('la tecla 3 saca el cuchillo', h.cur === 2 && h.name.includes('CUCHILLO') && h.on === 2 && (await weaponSeenByB()) === 2, JSON.stringify(h));
  await fire(A, 100);
  const stabbed = await waitFor(B, '__game.player.dead === true', 2500);
  const tDead = Date.now();
  await sleep(400);
  const knife = await A.evaluate('({ score: __game.net.room.score.join(), feed: document.getElementById("killfeed").textContent })');
  check('puñalada por la espalda: mata de un golpe', stabbed && knife.score === '2,0', JSON.stringify(knife));
  check('el registro anuncia la baja a cuchillo', knife.feed.includes('CUCHILLO'), knife.feed);

  // Cuchillo de frente: hiere, pero no mata.
  await waitFor(B, '__game.player.dead === false', 5000);
  const respawnMs = Date.now() - tDead;
  check('se reaparece en el tiempo que fijó el anfitrión (2 s)', respawnMs > 1500 && respawnMs < 2900, `${respawnMs} ms`);
  await B.evaluate('__game.loot.items.clear(); __game.player.armor = 0; __game.teleport(0, 2.5, 180, 0)'); // de cara al anfitrión
  await sleep(3000); // fin de la protección de reaparición
  await A.evaluate('__game.teleport(0, 4, 0, -8)');
  await fire(A, 100);
  await sleep(500);
  const front = await B.evaluate('({ hp: __game.player.health, dead: __game.player.dead })');
  check('cuchillo de frente: hiere sin matar', !front.dead && Math.abs(front.hp - 45) < 0.5, JSON.stringify(front));
  await A.evaluate('__game.input.wheel = 1'); // la rueda pasa del cuchillo al fusil
  await sleep(700);
  h = await hud();
  check('la rueda del ratón cambia de arma', h.cur === 0 && h.on === 0, JSON.stringify(h));
  await A.evaluate('__game.input.aim = true');
  await B.evaluate('__game.teleport(20, 12, 0, 0)');

  // Bidón explosivo: lo revienta el anfitrión y desaparece para todos.
  const plan = await A.evaluate(`(() => {
    const g = __game; const col = g.world.col;
    for (let i = 0; i < g.world.barrels.length; i++) {
      const b = g.world.barrels[i];
      for (let a = 0; a < 8; a++) {
        const sx = b.x + Math.cos(a * Math.PI / 4) * 7.5; const sz = b.z + Math.sin(a * Math.PI / 4) * 7.5;
        if (col.blockedAbove(sx, sz, 0.6, 0.1, 1.9) || g.world.barrels.some((o) => Math.hypot(o.x - sx, o.z - sz) < 6.8)) continue;
        const dx = b.x - sx; const dz = b.z - sz;
        if (!col.lineOfSight(sx, 1.68, sz, b.x - dx / 7.5 * 0.45, 0.45, b.z - dz / 7.5 * 0.45)) continue;
        return { i, sx, sz, yaw: Math.atan2(-dx, -dz) * 180 / Math.PI, pitch: Math.atan2(0.45 - 1.68, 7.5) * 180 / Math.PI };
      }
    }
    return null;
  })()`);
  await A.evaluate(`__game.teleport(${plan.sx}, ${plan.sz}, ${plan.yaw}, ${plan.pitch})`);
  await sleep(500);
  await fire(A, 320);
  await sleep(900);
  const barrelA = await A.evaluate(`__game.world.barrels[${plan.i}].alive`); const barrelB = await B.evaluate(`__game.world.barrels[${plan.i}].alive`);
  check('el bidón revienta para todos', barrelA === false && barrelB === false, `bidón ${plan.i}: A ${barrelA}, B ${barrelB}`);
  check('quien lo revienta desde lejos no se hiere', (await A.evaluate('__game.player.health')) === 100);

  // Caer sin que nadie te mate no da puntos al rival.
  await B.evaluate('__game.player.damage(500, 0, 0)');
  await sleep(500);
  const afterFall = await A.evaluate('({ score: __game.net.room.score.join(), d: __game.net.room.players.find((p) => p.name === "Marta").d, feed: document.getElementById("killfeed").textContent })');
  check('morir sin rival no da puntos', afterFall.score === '2,0' && afterFall.d === 3 && afterFall.feed.includes('HA CAÍDO'), JSON.stringify(afterFall));

  // ------------------------------------------------------------------
  section('Botín');
  const chestsA = await A.evaluate('__game.loot.chests.map((c) => [c.s, c.open])');
  check('al menos 6 cofres aunque haya pocos jugadores, en sitios distintos y cerrados', chestsA.length === 6 && new Set(chestsA.map((c) => c[0])).size === 6 && chestsA.every((c) => !c[1])
    && JSON.stringify(bot.started.loot.chests) === JSON.stringify(chestsA.map((c) => [c[0], 0])), JSON.stringify(chestsA));
  // El anfitrión mira el primero y pulsa F.
  await A.evaluate('(() => { const c = __game.loot.chests[0]; __game.teleport(c.x + Math.sin(c.yaw) * 1.6, c.z + Math.cos(c.yaw) * 1.6, c.yaw * 180 / Math.PI, -40); })()');
  await sleep(400);
  const hintA = await A.evaluate('document.getElementById("use-hint").classList.contains("on") ? document.getElementById("use-text").textContent : "(sin aviso)"');
  const lightBefore = await A.evaluate('__game.weapon.lightOn');
  await A.evaluate('__game.input.pressed.add("KeyF")');
  await sleep(500);
  const opened = await B.evaluate('({ open: __game.loot.chests[0].open, items: [...__game.loot.items.values()].map((i) => i.id) })');
  check('mirar un cofre y pulsar F lo abre para todos', hintA === 'ABRIR COFRE' && opened.open && bot.loots.length === 1 && bot.loots[0].items.every((d) => opened.items.includes(d[0]))
    && bot.loots[0].items.length >= 1 && bot.loots[0].items.length <= 3, `${hintA} · ${JSON.stringify(opened)}`);
  check('F no cambia la linterna si se mira un cofre', (await A.evaluate('__game.weapon.lightOn')) === lightBefore);
  await A.evaluate('__game.net.openChest(0)');
  await sleep(300);
  check('un cofre abierto no vuelve a dar botín', bot.loots.length === 1);
  // Dos piden el mismo objeto: sólo se lo lleva uno y desaparece para todos.
  const first = bot.loots[0].items[0][0];
  bot.send({ t: 'take', id: first });
  await A.evaluate(`__game.net.take(${first})`);
  await sleep(400);
  check('cada objeto se lo lleva sólo el primero que lo pide', bot.takes.filter((m) => m.id === first).length === 1
    && !(await A.evaluate(`__game.loot.items.has(${first})`)) && !(await B.evaluate(`__game.loot.items.has(${first})`)));
  // Al caer, el invitado dejó unas vendas o un chaleco; el anfitrión lo recoge al pasar por encima.
  const fall = bot.kills[bot.kills.length - 1].drop;
  check('el caído deja unas vendas o un chaleco', !!fall && (fall[1] === 0 || fall[1] === 2) && (await A.evaluate(`__game.loot.items.has(${fall[0]})`)), JSON.stringify(fall));
  // Sin chaleco ni vendas (puede que se llevara algo del cofre): con el chaleco entero no se coge otro.
  await A.evaluate(`__game.player.armor = 0; __game.weapon.slots[3].count = 0; __game.teleport(${fall[2]}, ${fall[4]}, 0, 0)`);
  await sleep(700);
  const got = await A.evaluate(`({ armor: __game.player.armor, band: __game.weapon.itemCount(0), left: __game.loot.items.has(${fall[0]}) })`);
  check('se recoge al pasar por encima', !got.left && (fall[1] === 2 ? got.armor === 50 : got.band === 1), JSON.stringify(got));
  // Vendas: tecla 4, un clic y en 2,5 s curan media vida (en línea la vida no se recupera sola).
  await A.evaluate('__game.player.armor = 0; __game.weapon.slots[3].count = 1; __game.player.health = 40; __game.input.pressed.add("Digit4")');
  await sleep(700);
  await fire(A, 100);
  await sleep(800);
  const itemSeen = await B.evaluate('(() => { const r = [...__game.remotes.map.values()].find((p) => p.name === "Alex"); return { item: (r.flags & 8192) !== 0, weapon: __game.remotes.weaponOf(r), aim: r.pose.aim }; })()');
  check('los demás ven que lleva vendas en la mano', itemSeen.item && itemSeen.weapon === 0 && itemSeen.aim < 0.3, JSON.stringify(itemSeen));
  await sleep(2100);
  const healed = await A.evaluate('({ hp: __game.player.health, band: __game.weapon.itemCount(0), cur: __game.weapon.cur })');
  check('las vendas curan media vida y se vuelve al arma', Math.abs(healed.hp - 90) < 0.5 && healed.band === 0 && healed.cur === 0, JSON.stringify(healed));

  // ------------------------------------------------------------------
  section('Final de partida');
  // El jugador simulado sale y vuelve a entrar con la partida empezada, ahora en BRAVO.
  bot.close();
  bot = new Bot(); bots.push(bot);
  await bot.connect();
  bot.send({ t: 'join', code, name: 'Bot' });
  await sleep(200);
  bot.send({ t: 'team', team: 1 });
  bot.send({ t: 'enter' });
  await sleep(400);
  check('quien entra tarde recibe los bidones ya reventados', !!bot.started && bot.started.barrels.includes(plan.i), bot.started && `[${bot.started.barrels}]`);
  bot.pose = () => [40, 0, -40, 0, 0, 0];
  // Dos bajas más del anfitrión (la víctima es quien avisa de su muerte): llega a 4 y gana ALFA.
  bot.send({ t: 'died', by: idA, part: 1 });
  await sleep(300);
  check('disparo a la cabeza en el registro', (await text(A, 'killfeed')).includes('CABEZA') && (await A.evaluate('__game.net.room.score.join()')) === '3,0');
  bot.send({ t: 'died', by: idA, part: 0 }); // sigue abatido: no cuenta dos veces
  await sleep(200);
  check('una misma muerte no cuenta dos veces', (await A.evaluate('__game.net.room.score.join()')) === '3,0');
  bot.send({ t: 'spawn' });
  bot.send({ t: 'died', by: idA, part: 0 });
  await sleep(2200);
  const endA = await A.evaluate('({ end: !document.getElementById("end").classList.contains("hidden"), title: document.getElementById("end-title").textContent, pre: document.getElementById("end-pre").textContent, board: document.getElementById("end-board").textContent, lobbyBtn: !document.getElementById("btn-end-lobby").classList.contains("hidden"), again: !document.getElementById("btn-again").classList.contains("hidden"), state: __game.stats().state, phase: __game.net.room.phase })');
  check('al llegar al límite gana el equipo', endA.end && endA.title === 'VICTORIA' && endA.pre === 'ALFA 4 — 0 BRAVO' && endA.state === 'ended' && endA.phase === 'lobby' && !!bot.ended && bot.ended.winner === 0, JSON.stringify({ ...endA, board: undefined }));
  check('tabla final por equipos', endA.board.includes('Alex') && endA.board.includes('Marta') && endA.board.includes('Bot') && endA.lobbyBtn && !endA.again, endA.board);
  check('el equipo perdedor ve la derrota', (await text(B, 'end-title')) === 'DERROTA' && (await visible(B, 'end')));
  await shot(A, '5-final-anfitrion');

  // Revancha: el anfitrión vuelve a la sala e inicia otra; el invitado seguía en la pantalla final.
  await click(A, 'btn-end-lobby');
  await sleep(300);
  check('vuelta a la sala tras la partida', (await visible(A, 'lobby')) && !(await visible(A, 'end')) && (await A.evaluate('__game.mode === "solo" && __game.stats().state === "menu"')));
  await choose(A, 'set-map', '1'); // la revancha, en el otro mapa
  await sleep(2500); // se construye por adelantado mientras se espera en la sala
  await choose(A, 'set-weapons', '2'); // sólo cuchillo
  await A.evaluate('__game.net.set({ time: 0.12 })'); // unos 7 segundos de partida
  await sleep(300);
  await click(A, 'btn-enter');
  await sleep(900);
  const re2 = await B.evaluate('({ mode: __game.mode, end: !document.getElementById("end").classList.contains("hidden"), score: __game.net.room.score.join(), barrels: __game.world.barrels.every((b) => b.alive), kd: __game.net.room.players.every((p) => p.k === 0 && p.d === 0), hud: document.getElementById("score-0").textContent + "-" + document.getElementById("score-1").textContent })');
  check('revancha: marcador a cero y mapa restaurado', re2.mode === 'online' && !re2.end && re2.score === '0,0' && re2.barrels && re2.kd && re2.hud === '0-0' && (await A.evaluate('__game.mode === "online"')), JSON.stringify(re2));

  const env = '({ map: __game.world.id, x: __game.player.pos.x, z: __game.player.pos.z, rain: __game.weather.active, fog: __game.scene.fog.density, exposure: __game.renderer.toneMappingExposure, fps: __game.stats().fps })';
  const solB = await B.evaluate(env); const solA = await A.evaluate(env);
  check('la revancha se juega en La Solana, cada equipo en su base', solA.map === 1 && solB.map === 1 && solA.x < -36 && solB.x > 36 && Math.abs(Math.abs(solB.z) - 18) < 4.5, `A ${solA.x.toFixed(1)}, ${solA.z.toFixed(1)}  B ${solB.x.toFixed(1)}, ${solB.z.toFixed(1)}`);
  check('ambiente del mapa nuevo: seco y de día', !solB.rain && solB.fog < 0.006 && solB.exposure === 1, JSON.stringify(solB));
  await A.evaluate('__game.input.pressed.add("Digit1")');
  await sleep(600);
  const only = await A.evaluate('({ cur: __game.weapon.cur, mask: __game.weapon.allowedMask, off: [...document.querySelectorAll("#toolbar .slot")].map((s) => s.classList.contains("off")).join() })');
  check('sólo cuchillo: no se puede sacar otra arma', only.cur === 2 && only.mask === 28 && only.off === 'true,true,false,false,false', JSON.stringify(only)); // 28: cuchillo, vendas y botiquín
  const clock = await B.evaluate('({ on: !document.getElementById("clock").classList.contains("hidden"), text: document.getElementById("clock").textContent })');
  check('el reloj muestra el tiempo que queda', clock.on && /^0:0\d$/.test(clock.text), JSON.stringify(clock));
  await shot(A, '6-la-solana-solo-cuchillo');
  await sleep(2500); // deja pasar el tirón de la primera carga antes de medir
  check('rendimiento en el mapa nuevo', (await A.evaluate('__game.stats().fps')) >= 50, `${(await A.evaluate('__game.stats().fps'))} FPS`);
  await sleep(5700);
  const draw = await B.evaluate('({ end: !document.getElementById("end").classList.contains("hidden"), title: document.getElementById("end-title").textContent, pre: document.getElementById("end-pre").textContent })');
  check('al agotarse el tiempo con el marcador igualado hay empate', draw.end && draw.title === 'EMPATE' && draw.pre === 'ALFA 0 — 0 BRAVO' && (await text(A, 'end-title')) === 'EMPATE', JSON.stringify(draw));

  // Tercera partida: ajustes normales, en el tercer mapa.
  await click(A, 'btn-end-lobby');
  await sleep(300);
  await A.evaluate('__game.net.set({ time: 0, weapons: 0, map: 2 })');
  await sleep(2800); // se construye mientras se espera en la sala
  await click(A, 'btn-enter');
  await sleep(900);
  const third = await B.evaluate('({ mode: __game.mode, cur: __game.weapon.cur, mask: __game.weapon.allowedMask, clock: document.getElementById("clock").classList.contains("hidden") })');
  check('otra partida con todas las armas y sin límite de tiempo', third.mode === 'online' && third.cur === 0 && third.mask === 31 && third.clock, JSON.stringify(third));
  const port = await B.evaluate(env); const portA = await A.evaluate(env);
  check('la tercera se juega en Muelle Norte, cada equipo en su base', port.map === 2 && portA.map === 2 && port.x > 36 && portA.x < -36 && Math.min(Math.abs(port.z + 24), Math.abs(port.z - 10)) < 4.3, `A ${portA.x.toFixed(1)}, ${portA.z.toFixed(1)}  B ${port.x.toFixed(1)}, ${port.z.toFixed(1)}`);
  check('ambiente del puerto: nevando y con niebla densa', port.rain && port.fog > 0.02 && (await B.evaluate('__game.weather.storm === false')), JSON.stringify(port));
  await sleep(3000);
  await shot(B, '7-muelle-norte');
  check('rendimiento en Muelle Norte', (await B.evaluate('__game.stats().fps')) >= 50, `${(await B.evaluate('__game.stats().fps'))} FPS`);

  // ------------------------------------------------------------------
  section('Salidas');
  await B.evaluate('document.getElementById("btn-leave").click()');
  await sleep(500);
  check('el invitado vuelve al menú y recupera la misión', (await visible(B, 'menu')) && (await B.evaluate('__game.mode === "solo" && __game.stats().state === "menu" && __game.remotes.map.size === 0')));
  check('el anfitrión deja de verlo', (await A.evaluate('__game.remotes.map.size')) === 1);
  bot.close();
  await sleep(400);
  check('al irse todos los demás, el anfitrión se queda solo en la sala', (await A.evaluate('__game.remotes.map.size === 0 && __game.net.room.players.length === 1')));

  // El invitado puede volver a entrar a la partida en curso.
  await click(B, 'btn-mp');
  await B.$eval('#mp-code', (e, c) => { e.value = c; }, code);
  await click(B, 'btn-join');
  await waitFor(B, '!document.getElementById("lobby").classList.contains("hidden")');
  check('partida en curso: ofrece entrar', (await text(B, 'btn-enter')).includes('ENTRAR'));
  await click(B, 'btn-enter');
  await sleep(800);
  check('reentrada a la partida en curso', (await B.evaluate('__game.mode === "online" && __game.remotes.map.size === 1')) && (await A.evaluate('__game.remotes.map.size === 1')));

  // La misión en solitario sigue funcionando tras haber jugado en línea.
  await B.evaluate('document.getElementById("btn-leave").click()');
  await sleep(300);
  await click(B, 'btn-start');
  await sleep(3000);
  const solo = await B.evaluate('({ st: __game.stats(), vis: __game.enemies.list.every((e) => e.s.mesh.visible), obj: document.getElementById("objective-label").textContent, z: __game.player.pos.z, score: document.getElementById("score").classList.contains("hidden") })');
  const night = await B.evaluate(env);
  check('la misión vuelve a Sector 7 con su noche de lluvia', night.map === 0 && night.rain && Math.abs(night.fog - 0.0135) < 1e-6 && night.exposure === 1.15 && (await B.evaluate('__game.weather.storm === true')), JSON.stringify(night));
  check('misión en solitario intacta', solo.st.mode === 'solo' && solo.st.state === 'playing' && solo.st.alive === 10 && solo.vis && solo.obj === 'OBJETIVO' && solo.z > 60 && solo.score, JSON.stringify(solo.st));
  await B.evaluate('__game.input.fire = true');
  await sleep(300);
  await B.evaluate('__game.input.fire = false');
  check('el arma de la misión no envía nada a la red', await B.evaluate('__game.combat.shots >= 2 && __game.net.link === null'));

  // Caída del servidor: el anfitrión vuelve al menú con aviso.
  server.kill();
  await sleep(1200);
  check('conexión perdida: aviso y vuelta a la pantalla de salas', (await visible(A, 'mp')) && (await text(A, 'mp-error')).includes('conexión'));
} catch (e) {
  logs.push(`[prueba] ${e.stack || e.message}`);
  failed++;
} finally {
  for (const b of bots) b.close();
  await Promise.all(browsers.map((b) => b.close()));
  server.kill();
}

if (logs.length) { console.log(`\n--- consola (${logs.length}) ---`); console.log([...new Set(logs)].slice(0, 40).join('\n')); } else console.log('\n--- consola limpia ---');
console.log(failed ? `${failed} comprobaciones fallidas` : 'Todo correcto');
process.exit(failed ? 1 : 0);
