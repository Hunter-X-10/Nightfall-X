// Prueba del modo en línea sin servidor de salas, tal como queda en un alojamiento estático: se
// construye dist/, se sirve como simples archivos y tres navegadores (anfitrión y dos invitados) juegan
// conectados directamente entre sí. La lógica de las salas ya la cubre mptest.mjs; aquí se comprueba
// que todo llega igual cuando la sala la lleva el navegador del anfitrión.
// Necesita internet: los navegadores se encuentran a través del servicio público de PeerJS.
//
//   node tools/p2ptest.mjs [dirSalida] [--port 5197]
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 5197;
const outDir = resolve(args.find((a, i) => !a.startsWith('--') && (portIdx < 0 || i !== portIdx + 1)) || join(ROOT, 'tools', 'out'));
mkdirSync(outDir, { recursive: true });
const BASE = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const logs = [];
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '  ok ' : 'FALLO'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };
const section = (name) => console.log(`\n${name}`);

// Servidor de archivos sin más, como el de un alojamiento estático: no hay /ws.
const DIST = join(ROOT, 'tools', 'out', 'dist');
execFileSync(process.execPath, [join(ROOT, 'tools', 'build.mjs'), DIST], { stdio: 'inherit' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, BASE).pathname);
  const file = join(DIST, path === '/' ? 'index.html' : path);
  if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

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
const choose = (page, id, value) => page.evaluate((i, v) => { const s = document.getElementById(i); s.value = v; s.dispatchEvent(new Event('change')); }, id, value);
const fire = async (page, ms) => { await page.evaluate('__game.input.fire = true'); await sleep(ms); await page.evaluate('__game.input.fire = false'); };
const inLobby = '!document.getElementById("lobby").classList.contains("hidden")';
const remote = (page, name) => page.evaluate((n) => { const r = [...__game.remotes.map.values()].find((p) => p.name === n); return r ? { x: r.x, z: r.z, team: r.team, vis: r.s.mesh.visible } : null; }, name);

try {
  // ------------------------------------------------------------------
  section('Sala en el navegador del anfitrión');
  const A = await open('A', '?nolock=1&debug=1');
  await click(A, 'btn-mp');
  await A.$eval('#mp-name', (e) => { e.value = 'Alex'; });
  await click(A, 'btn-create');
  check('el anfitrión crea la sala sin servidor', await waitFor(A, inLobby, 20000), await text(A, 'mp-error'));
  const code = await text(A, 'lobby-code');
  check('código de 4 caracteres y conexión directa', /^[A-Z2-9]{4}$/.test(code) && (await A.evaluate('__game.net.direct && __game.net.isHost')), code);
  check('se avisa de que la partida depende de su pestaña', (await text(A, 'lobby-note')).includes('si cierras esta pestaña'));

  const B = await open('B', `?nolock=1&debug=1&sala=${code}`);
  await B.$eval('#mp-name', (e) => { e.value = 'Marta'; });
  const wrong = [...'ABCDEFGH'].find((c) => c !== code[0]) + code.slice(1);
  await B.$eval('#mp-code', (e, c) => { e.value = c; }, wrong);
  await click(B, 'btn-join');
  await waitFor(B, 'document.getElementById("mp-error").textContent.length > 0', 20000);
  check('código inexistente: muestra error', (await text(B, 'mp-error')).includes('No existe'), await text(B, 'mp-error'));
  await B.$eval('#mp-code', (e, c) => { e.value = c.toLowerCase(); }, code);
  await click(B, 'btn-join');
  check('el invitado entra con el código', await waitFor(B, inLobby, 20000), await text(B, 'mp-error'));

  const C = await open('C', `?nolock=1&debug=1&sala=${code}`);
  await C.$eval('#mp-name', (e) => { e.value = 'Alex'; });
  await click(C, 'btn-join');
  check('entra un segundo invitado', await waitFor(C, inLobby, 20000), await text(C, 'mp-error'));
  await sleep(400);
  const roster = await C.evaluate('__game.net.room.players.map((p) => `${p.name}:${p.team}`).join(", ")');
  check('tres jugadores repartidos y con nombres únicos', roster === 'Alex:0, Marta:1, Alex 2:0', roster);
  check('el invitado no puede iniciar ni tocar los ajustes', (await B.$eval('#btn-enter', (e) => e.disabled)) && (await B.$eval('#set-goal', (e) => e.disabled)));
  await choose(A, 'set-goal', '5');
  await B.evaluate('__game.net.set({ goal: 99 })'); // un invitado no puede cambiarlo
  await sleep(500);
  check('los ajustes del anfitrión llegan a los invitados', (await text(B, 'lobby-note')).includes('5 bajas') && (await text(C, 'lobby-note')).includes('5 bajas'));
  await A.evaluate('__game.net.set({ goal: 1, respawn: 2 })');
  await shot(B, 'p2p-1-sala-invitado');

  // ------------------------------------------------------------------
  section('Partida');
  await click(A, 'btn-enter');
  await sleep(900);
  const modes = await Promise.all([A, B, C].map((p) => p.evaluate('__game.stats().mode')));
  check('la partida empieza para los tres', modes.join() === 'online,online,online', modes.join());
  await A.evaluate('__game.teleport(20, 12, 0, 0)');
  await B.evaluate('__game.teleport(0, 2.5, 180, -3)');
  await C.evaluate('__game.teleport(0, 10.5, 0, -3)');
  await sleep(2800); // fin de la protección de aparición
  const seen = { aB: await remote(A, 'Marta'), aC: await remote(A, 'Alex 2'), bA: await remote(B, 'Alex'), bC: await remote(B, 'Alex 2'), cA: await remote(C, 'Alex'), cB: await remote(C, 'Marta') };
  const at = (r, x, z) => !!r && r.vis && Math.hypot(r.x - x, r.z - z) < 0.3;
  check('el anfitrión ve a los dos invitados donde están', at(seen.aB, 0, 2.5) && at(seen.aC, 0, 10.5), JSON.stringify([seen.aB, seen.aC]));
  check('cada invitado ve al anfitrión y al otro invitado', at(seen.bA, 20, 12) && at(seen.bC, 0, 10.5) && at(seen.cA, 20, 12) && at(seen.cB, 0, 2.5), JSON.stringify([seen.bA, seen.bC, seen.cA, seen.cB]));

  // De invitado a invitado: el disparo pasa por el anfitrión.
  await B.evaluate('__game.input.aim = true');
  await sleep(400);
  await fire(B, 110);
  await sleep(500);
  const hitsB = await B.evaluate('__game.combat.hits'); const hpC = await C.evaluate('__game.player.health');
  check('un invitado hiere al otro', hitsB >= 1 && Math.abs(100 - hpC - 26 * hitsB) < 0.5, `${hitsB} impactos, vida ${hpC.toFixed(0)}`);
  await B.evaluate('__game.input.aim = false');

  // El anfitrión abate al invitado rival: con el límite en 1 baja, se acaba la partida.
  await C.evaluate('__game.teleport(20, 12, 0, 0)');
  await A.evaluate('__game.input.aim = true; __game.teleport(0, 10.5, 0, -3)');
  await sleep(700);
  await A.evaluate('__game.input.fire = true');
  const died = await waitFor(B, '__game.player.dead === true', 4000);
  await A.evaluate('__game.input.fire = false');
  check('el anfitrión abate a un invitado', died);
  await sleep(2400);
  const ends = await Promise.all([A, B, C].map((p) => p.evaluate('document.getElementById("end").classList.contains("hidden") ? "" : `${document.getElementById("end-title").textContent} ${document.getElementById("end-pre").textContent}`')));
  check('fin de partida para todos, con el mismo marcador', ends.join(' | ') === 'VICTORIA ALFA 1 — 0 BRAVO | DERROTA ALFA 1 — 0 BRAVO | VICTORIA ALFA 1 — 0 BRAVO', ends.join(' | '));
  await shot(C, 'p2p-2-final-invitado');

  // ------------------------------------------------------------------
  section('Salidas');
  await click(A, 'btn-end-lobby');
  await click(C, 'btn-end-menu');
  await sleep(1200);
  check('al irse un invitado, la sala lo quita', (await A.evaluate('__game.net.room.players.map((p) => p.name).join()')) === 'Alex,Marta');
  await click(B, 'btn-end-lobby');
  await sleep(300);
  check('el otro invitado sigue en la sala', (await visible(B, 'lobby')) && (await B.evaluate('__game.net.room.players.length')) === 2);
  await click(A, 'btn-lobby-leave');
  const told = await waitFor(B, '!document.getElementById("mp").classList.contains("hidden") && document.getElementById("mp-error").textContent.length > 0', 12000);
  check('si el anfitrión cierra la sala, el invitado recibe el aviso', told && (await text(B, 'mp-error')).includes('anfitrión'), await text(B, 'mp-error'));
} catch (e) {
  logs.push(`[prueba] ${e.stack || e.message}`);
  failed++;
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  server.close();
}

if (logs.length) { console.log(`\n--- consola (${logs.length}) ---`); console.log([...new Set(logs)].slice(0, 40).join('\n')); } else console.log('\n--- consola limpia ---');
console.log(failed ? `${failed} comprobaciones fallidas` : 'Todo correcto');
process.exit(failed ? 1 : 0);
