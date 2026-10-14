// Mapa MUELLE NORTE: terminal de contenedores bajo la nevada, de día y con niebla cerrada.
// Simétrico de oeste a este (ALFA sale del oeste, BRAVO del este). La niebla acorta la vista a unos
// 40 m, así que se juega a media y corta distancia entre hileras de contenedores:
//   norte  — calle estrecha entre el tinglado de aduanas y la primera hilera
//   centro — dos calles anchas con las hileras al tresbolillo (los huecos no se alinean)
//   sur    — el muelle: abierto, con las patas de las grúas pórtico por cobertura y el carguero atracado
import * as THREE from 'three';
import { WorldCtx } from './ctx.js';
import { xform, boxUV, cylUV } from '../geo.js';
import { lampPost, fence, jersey, sandbags, crate, crateStack, barrel, explosiveBarrel, pallet, tires, buildInstances } from './props.js';
import { truck, jeep, container } from './vehicles.js';
import { buildGround } from '../ground.js';

const HX = 48; const HZ = 40;
const QUAY = 37; // borde del muelle (más allá, el agua)
const BASE_X = 33.6; // muro de contenedores de cada base
const COLORS = ['red', 'blue', 'green', 'grey', 'orange', 'white'];

// Tinglado de aduanas: nave maciza a lo largo del muro norte, con portones de carga y focos.
function shed(ctx) {
  const M = ctx.M;
  ctx.box(M.corrugatedWall, 0, 0, -37.2, 60, 6, 5.6, { tile: 4, fitV: true, surface: 'metal' });
  ctx.box(M.concreteWall, 0, 0, -37.2, 60.3, 1, 5.9, { tile: 4, fitV: true, collide: false });
  ctx.box(M.corrugatedRoof, 0, 6, -37.2, 61, 0.3, 6.6, { tile: 4, collide: false });
  for (const x of [-24, -12, 0, 12, 24]) {
    ctx.add(boxUV(4.4, 3.7, 0.12, 2), M.darkSteel, xform(x, 1.85, -34.36), 0);
    for (let i = 0; i < 6; i++) ctx.add(boxUV(4.2, 0.05, 0.05, 1), M.steel, xform(x, 0.5 + i * 0.6, -34.28), 0); // lamas del portón
    ctx.add(boxUV(5.2, 0.14, 1.4, 2), M.corrugatedRoof, xform(x, 4.1, -33.7, 0.12, 0, 0)); // marquesina
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.16), new THREE.MeshBasicMaterial());
    bulb.material.color.set(0xdfeaff).multiplyScalar(16);
    bulb.position.set(x, 3.95, -33.6);
    ctx.group.add(bulb);
    ctx.lamp({ x, y: 3.9, z: -33.6, color: 0xdfeaff, type: 'spot', range: 14, target: [x, 0, -31.5], cone: { radius: 3.6, length: 3.9, intensity: 0.22, edge: 1.5, fall: 1.2 }, flareSize: 1.6, bulb });
  }
  // Detalle (sólo visual): pilastras entre portones, topes de muelle, números de puerta, imposta y ventiladores.
  const post = M.darkSteel;
  for (const x of [-30, -18, -6, 6, 18, 30]) ctx.add(boxUV(0.3, 5, 0.16, 1), post, xform(x, 3.5, -34.32), 1);
  for (const x of [-24, -12, 0, 12, 24]) {
    for (const s of [-1, 1]) ctx.add(boxUV(0.25, 0.6, 0.14, 1), M.rubber, xform(x + s * 2.45, 0.7, -34.2), 0);
    ctx.add(boxUV(0.9, 0.6, 0.04, 1), M.metal(0xb8960f, { worn: true }), xform(x, 5.15, -34.37), 0);
  }
  ctx.add(boxUV(61.2, 0.35, 0.1, 2), M.darkSteel, xform(0, 6.1, -33.86), 1);
  const vent = M.metal(0x8c9196, { worn: true });
  for (const x of [-22, -11, 0, 11, 22]) {
    ctx.add(boxUV(1.2, 0.6, 1.2, 1), vent, xform(x, 6.6, -37.2), 1);
    ctx.add(boxUV(1.5, 0.08, 1.5, 1), M.darkSteel, xform(x, 6.94, -37.2), 1);
  }
  ctx.concreteRects.push({ x0: -31, x1: 31, z0: -34.6, z1: -30.5 });
}

// Grúa pórtico: cuatro patas (cobertura) y, arriba, las vigas y la pluma que se pierden en la niebla.
function gantry(ctx, x, z) {
  const M = ctx.M;
  const yel = M.metal(0xb8960f, { worn: true });
  const H = 17; const sx = 4.2; const sz = 5.6;
  for (const dx of [-sx, sx]) {
    for (const dz of [-sz, sz]) {
      ctx.box(yel, x + dx, 0, z + dz, 0.95, H, 0.95, { tile: 2, surface: 'metal' });
      ctx.box(M.darkSteel, x + dx, 0, z + dz, 1.5, 0.5, 2.6, { tile: 1.5, surface: 'metal', collide: false }); // carretón
    }
    ctx.add(boxUV(0.7, 0.9, sz * 2 + 1, 2), yel, xform(x + dx, 8, z)); // riostra
    ctx.add(boxUV(0.9, 1.3, 34, 2), yel, xform(x + dx, H + 0.6, z + 9)); // viga carril y pluma sobre el agua
  }
  for (const dz of [-sz, sz, 16, 25.5]) ctx.add(boxUV(sx * 2 + 1.6, 1.0, 0.8, 2), yel, xform(x, H + 0.3, z + dz));
  ctx.add(boxUV(2.6, 2.4, 3.2, 2), M.metal(0x8c9196, { worn: true }), xform(x, H - 1.7, z + 7)); // cabina
  ctx.add(new THREE.PlaneGeometry(2.3, 1.1), M.glassDark, xform(x, H - 1.9, z + 8.62), 0);
  for (const dxx of [-0.8, 0.8]) ctx.add(cylUV(0.03, 0.03, 9, 6), M.darkSteel, xform(x + dxx, H - 5, z + 19), 0); // cables del gancho
  ctx.add(boxUV(2.6, 0.3, 6.2, 1), yel, xform(x, H - 9.6, z + 19)); // bastidor de enganche
  // Detalle (sólo visual, nada a ras de suelo): cruces de arriostramiento, travesaños, mástil con tirantes,
  // carro, caseta de máquinas, barandillas y escalera de gato.
  const grey = M.metal(0x6a7076, { worn: true });
  for (const dx of [-sx, sx]) {
    for (const a of [-0.614, 0.614]) ctx.add(boxUV(0.35, 0.35, 13.7, 2), yel, xform(x + dx, 12.45, z, a, 0, 0));
    for (const dz of [-sz, sz]) for (const y of [8, H - 0.4]) ctx.add(boxUV(1.3, 0.5, 1.3, 2), yel, xform(x + dx, y, z + dz));
    ctx.add(boxUV(0.5, 7, 0.5, 2), yel, xform(x + dx, H + 4.75, z + sz)); // mástil
    ctx.add(boxUV(0.18, 0.18, 21.08, 2), M.darkSteel, xform(x + dx, H + 4.72, z + 15.55, 0.336, 0, 0)); // tirante de la pluma
    ctx.add(boxUV(0.18, 0.18, 15.27, 2), M.darkSteel, xform(x + dx, H + 4.72, z - 1.2, -0.472, 0, 0)); // tirante de cola
    const out = Math.sign(dx) * 0.42;
    for (let i = 0; i < 11; i++) ctx.add(boxUV(0.05, 1, 0.05, 1), M.darkSteel, xform(x + dx + out, H + 1.75, z - 7.5 + i * 3.3), 0);
    for (const y of [H + 1.8, H + 2.25]) ctx.add(boxUV(0.05, 0.05, 33.6, 1), M.darkSteel, xform(x + dx + out, y, z + 9), 0);
  }
  for (const dz of [-sz, sz]) ctx.add(boxUV(sx * 2, 0.7, 0.7, 2), yel, xform(x, 8, z + dz));
  ctx.add(boxUV(sx * 2 + 0.5, 0.4, 0.4, 2), yel, xform(x, H + 8.2, z + sz));
  ctx.add(boxUV(7.4, 0.5, 3.2, 2), grey, xform(x, H + 0.2, z + 19)); // carro
  ctx.add(boxUV(2.6, 1.8, 2.6, 2), grey, xform(x, H + 1.35, z + 19));
  ctx.add(boxUV(6.5, 2.6, 5, 2), M.metal(0x8c9196, { worn: true }), xform(x, H + 2.55, z - 4.5)); // caseta de máquinas
  ctx.add(boxUV(6.9, 0.14, 5.4, 2), M.darkSteel, xform(x, H + 3.92, z - 4.5));
  for (const s of [-1, 1]) ctx.add(boxUV(0.05, H - 0.6, 0.05, 1), M.darkSteel, xform(x - sx - 0.52, (H + 0.6) / 2, z - sz + s * 0.22), 0);
  for (let i = 0; i < 32; i++) ctx.add(boxUV(0.03, 0.03, 0.44, 1), M.darkSteel, xform(x - sx - 0.52, 0.9 + i * 0.5, z - sz), 0);
}

// Carguero atracado: sólo se ve desde el muelle, medio borrado por la niebla.
function ship(ctx) {
  const M = ctx.M;
  const z = 50.5;
  ctx.add(boxUV(92, 9.5, 15, 6), M.metal(0x4b2320, { worn: true }), xform(2, 3.2, z));
  ctx.add(boxUV(92.4, 0.5, 15.4, 6), M.darkSteel, xform(2, 8.1, z));
  ctx.add(boxUV(12, 10, 12, 4), M.metal(0xb9bdbf, { worn: true }), xform(-33, 13, z)); // puente
  ctx.add(boxUV(12.6, 0.4, 12.6, 4), M.darkSteel, xform(-33, 18.1, z));
  for (let i = 0; i < 5; i++) ctx.add(new THREE.PlaneGeometry(1.5, 0.9), M.glassDark, xform(-37.5 + i * 2.2, 15.6, z - 6.02, 0, Math.PI, 0), 0);
  ctx.add(cylUV(1.3, 1.6, 5, 16), M.metal(0x2a2d30, { worn: true }), xform(-33, 20.6, z + 1));
  // Detalle (sólo visual): línea de flotación, cintón, portillos, barandilla, banda de la chimenea, mástiles y botes.
  const white = M.metal(0xb9bdbf, { worn: true });
  ctx.add(boxUV(92.2, 0.7, 0.08, 4), M.darkSteel, xform(2, 0.5, z - 7.52), 0);
  ctx.add(boxUV(92.3, 0.25, 0.14, 4), M.darkSteel, xform(2, 7.0, z - 7.52), 0);
  for (let i = 0; i < 18; i++) ctx.add(cylUV(0.28, 0.28, 0.06, 10), M.glassDark, xform(-40 + i * 5, 6.0, z - 7.52, Math.PI / 2, 0, 0), 0);
  for (let i = 0; i < 24; i++) ctx.add(boxUV(0.06, 1.1, 0.06, 1), white, xform(-44 + i * 4, 8.9, z - 7.6), 0);
  for (const y of [8.95, 9.42]) ctx.add(boxUV(92, 0.05, 0.05, 4), white, xform(2, y, z - 7.6), 0);
  ctx.add(cylUV(1.42, 1.5, 0.9, 16), white, xform(-33, 21.6, z + 1), 0);
  ctx.add(cylUV(0.12, 0.16, 6, 8), white, xform(-33, 21.3, z - 3), 0);
  ctx.add(boxUV(2.4, 0.12, 0.25, 1), white, xform(-33, 23.6, z - 3), 0);
  ctx.add(cylUV(0.15, 0.2, 9, 8), white, xform(40, 12.85, z), 0);
  ctx.add(boxUV(0.1, 0.1, 5, 1), white, xform(40, 15.6, z), 0);
  for (const dx of [-3, 3]) {
    ctx.add(new THREE.CapsuleGeometry(0.85, 3, 4, 10), M.metal(0xd8601a, { worn: true }), xform(-33 + dx * 1.2, 10.4, z - 6.9, 0, 0, Math.PI / 2), 0);
    for (const k of [-1.2, 1.2]) ctx.add(boxUV(0.12, 1.6, 0.12, 1), white, xform(-33 + dx * 1.2 + k, 11.6, z - 6.5), 0);
  }
  // Carga sobre cubierta.
  const R = ctx.rng;
  for (let i = 0; i < 7; i++) {
    for (const dz of [-3.2, 0, 3.2]) {
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) container(ctx, -20 + i * 6.4, z + dz, 0, R.pick(COLORS), 3.2 + k);
    }
  }
}

// Base de un equipo (s = -1 oeste, +1 este): muro de contenedores con cuatro salidas, una por calle.
function base(ctx, s) {
  const x = s * BASE_X;
  // Tres tramos largos y uno corto; los huecos dan a la calle norte, a las dos centrales y al muelle.
  container(ctx, x, -24.9, Math.PI / 2, s < 0 ? 'blue' : 'red', 0, true);
  container(ctx, x, -6.9, Math.PI / 2, 'grey', 0, true); container(ctx, x, -6.9, Math.PI / 2 + s * 0.02, s < 0 ? 'blue' : 'red', 1, true);
  container(ctx, x, 11.1, Math.PI / 2, 'green', 0, true);
  container(ctx, x, 26, Math.PI / 2, 'white');
  // Dentro: pantallas entre las salidas y las zonas de aparición, y algo de material.
  container(ctx, s * 42, -33.5, 0, 'orange');
  container(ctx, s * 42, 20.5, 0, 'grey');
  truck(ctx, s * 44.2, -7, 0, true);
  crateStack(ctx, s * 37.6, -9.4, s * 0.2, 1);
  crateStack(ctx, s * 38.2, 0.6, s * 0.3, 2);
  tires(ctx, s * 45.6, 2.4, 4);
  for (const [dx, z] of [[45.8, 28.5], [46.3, 29.4]]) barrel(ctx, s * dx, z);
  pallet(ctx, s * 37.4, 30.6, 0.2, 4);
  ctx.concreteRects.push({ x0: Math.min(s * (BASE_X + 1.4), s * HX), x1: Math.max(s * (BASE_X + 1.4), s * HX), z0: -HZ, z1: 14 });
}

// Mitad de las calles (s = -1 oeste, +1 este); la otra mitad es su reflejo.
function yard(ctx, s) {
  const M = ctx.M;
  const R = ctx.rng;
  const c = () => R.pick(COLORS);
  // Hileras de contenedores a lo largo, al tresbolillo.
  container(ctx, s * 8.5, -20, 0, c(), 0, true); container(ctx, s * 8.5, -20, s * 0.015, c(), 1, true);
  container(ctx, s * 23, -20, 0, c(), 0, true);
  container(ctx, s * 19, -5, 0, c(), 0, true); container(ctx, s * 21.5, -5, 0, c(), 1);
  container(ctx, s * 8.5, 10, 0, c(), 0, true);
  container(ctx, s * 23, 10, 0, c(), 0, true); container(ctx, s * 23, 10, -s * 0.02, c(), 1, true);

  // Calle norte.
  crateStack(ctx, s * 14.2, -28, s * 0.25, 1);
  jersey(ctx, s * 24.4, -27.4, s * 0.2);
  tires(ctx, s * 5.4, -31.2, 3);
  pallet(ctx, s * 19.4, -32.6, s * 0.3, 4);
  lampPost(ctx, s * 29.6, -29.4, -s, 0, { color: 0xdfeaff, h: 7.4 });

  // Primera calle central: un camión cruzado.
  truck(ctx, s * 15.6, -12.5, s * Math.PI / 2, s > 0);
  crateStack(ctx, s * 4.4, -13, s * 0.4, 0);
  sandbags(ctx, s * 27.4, -12.2, Math.PI / 2, 3.6, 3);
  explosiveBarrel(ctx, s * 9.2, -9.4);
  lampPost(ctx, s * 31, -15.6, -s, 0, { color: 0xdfeaff, h: 7.4, flicker: s > 0 ? 0.2 : 0 });

  // Segunda calle central.
  jersey(ctx, s * 7.6, 2.6, Math.PI / 2 + s * 0.06);
  jersey(ctx, s * 15.4, 5.4, s * 0.15);
  crateStack(ctx, s * 26.4, 3.4, s * 0.2, 2);
  crate(ctx, s * 11.6, -1.6, 1.3, s * 0.3, 0, true);
  explosiveBarrel(ctx, s * 3.4, 6.2);
  lampPost(ctx, s * 31, 2.2, -s, 0, { color: 0xffb060, h: 7.4 });

  // Muelle: grúa pórtico con un contenedor entre las patas, barreras y carga suelta.
  gantry(ctx, s * 18, 27.4);
  container(ctx, s * 18, 27.4, 0, c());
  jersey(ctx, s * 6.4, 19.6, 0); jersey(ctx, s * 27, 18.4, Math.PI / 2);
  crateStack(ctx, s * 29.6, 31.4, s * 0.3, 0);
  sandbags(ctx, s * 9.6, 32, s * 0.2, 3.4, 3);
  explosiveBarrel(ctx, s * 10.6, 24.6); explosiveBarrel(ctx, s * 11.3, 25.3);
  pallet(ctx, s * 25.6, 25, s * 0.5, 3);
  lampPost(ctx, s * 30.6, 35.2, 0, -1, { color: 0xffb060, h: 8 });
  for (const bx of [4, 12, 20, 28, 36, 44]) ctx.cyl(M.darkSteel, s * bx, 0, QUAY - 0.7, 0.24, 0.55, { rTop: 0.3, seg: 10 }); // norays
}

export function buildMuelle(scene, M, reflection) {
  const ctx = new WorldCtx(scene, M);
  ctx.ambient = [0.8, 0.84, 0.92]; // el humo y el polvo se ven a plena luz
  ctx.fakeLights = true; // de día las farolas sólo brillan en la niebla; la luz la pone el cielo

  // Cerramiento: muros al norte y a los lados; al sur, el cantil con su barandilla y el agua.
  ctx.region = 'perimeter';
  const P = { tile: 4, fitV: true };
  ctx.box(M.concreteWall, 0, 0, -HZ - 0.25, HX * 2 + 1, 4.4, 0.5, P);
  for (const s of [-1, 1]) ctx.box(M.concreteWall, s * (HX + 0.25), 0, 0, 0.5, 4.4, HZ * 2 + 1, P);
  ctx.box(M.concrete, 0, 0, QUAY + 0.6, HX * 2, 0.32, 0.7, { tile: 2 });
  fence(ctx, -HX, QUAY + 1.2, HX, QUAY + 1.2, 1.5);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 240), new THREE.MeshStandardMaterial({ color: 0x1b252e, roughness: 0.16, metalness: 0.25 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, QUAY + 1.3 + 120);
  water.receiveShadow = true;
  ctx.group.add(water);

  ctx.region = 'north';
  shed(ctx);
  for (const s of [-1, 1]) {
    ctx.region = s < 0 ? 'west' : 'east';
    base(ctx, s);
    yard(ctx, s);
  }

  // Piezas centrales, sobre el eje de simetría.
  ctx.region = 'mid';
  container(ctx, 0, -5, 0, 'orange', 0, true); container(ctx, 0, -5, 0.02, 'white', 1, true);
  crateStack(ctx, 0, -27.6, 0.1, 2);
  crate(ctx, 0, 3.4, 1.4, 0.4);
  jeep(ctx, 0, 27.6, Math.PI / 2, 0x5a6066);
  lampPost(ctx, 0, 35.2, 0, -1, { color: 0xffb060, h: 8 });
  lampPost(ctx, 0, -29.6, 0, 1, { color: 0xdfeaff, h: 7.4 });
  ctx.region = 'ship';
  ship(ctx);

  buildInstances(ctx);
  const staticMeshes = ctx.finish();

  ctx.concreteRects.push({ x0: -HX, x1: HX, z0: 14, z1: QUAY + 1.4 }); // el muelle
  const ground = buildGround({
    surfaces: M.surf, footprints: ctx.footprints, puddles: [], concreteRects: ctx.concreteRects, reflection,
    spec: {
      key: 'muelle', map: { cx: 0, cz: 0, size: 132 }, wet: 0, indoor: [],
      snow: [0.66, 0.7, 0.76, 1],
      // Franja amarilla y negra a lo largo del cantil.
      marks: `float white = 0.0; float yellow = 0.0;
float hz = gBox(gp, vec2(${-HX}.0, ${QUAY - 1.9}), vec2(${HX}.0, ${QUAY - 1.2}), 0.02);
float hzStripe = step(0.5, fract((gp.x + gp.y) * 1.4));`,
      // Nieve virgen en todo salvo las calles (asfalto) y las plataformas de hormigón.
      paintDirt(c, map) {
        c.fillStyle = '#fff';
        c.fillRect(map.cx - map.size, map.cz - map.size, map.size * 2, map.size * 2);
        c.fillStyle = '#000';
        c.fillRect(-BASE_X + 1.4, -30.5, (BASE_X - 1.4) * 2, 44.5);
        for (const r of ctx.concreteRects) c.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
      },
    },
  });
  ctx.group.add(ground.mesh);

  // Dos zonas de aparición por equipo, tras el muro de contenedores y mirando hacia el centro.
  const zones = (s) => [-24, 10].map((z) => ({ x: s * 41.4, z, r: 3.8, yaw: s * Math.PI / 2 }));

  // Nodos de cobertura para la IA (modo supervivencia): fuera de obstáculos y dentro del recinto.
  const cover = ctx.cover.filter((n) => !ctx.col.blockedAbove(n.x, n.z, 0.34, 0.3, 1.6) && Math.abs(n.x) < HX - 1 && n.z > -HZ + 1 && n.z < QUAY - 1);

  return {
    ctx, group: ctx.group, ground, cover, enemies: [], staticMeshes,
    col: ctx.col, lamps: ctx.lamps, barrels: ctx.barrels, emitters: ctx.emitters,
    dry: { x0: 0, z0: 0, x1: 0, z1: 0, y: 0 }, // nieva en todas partes
    hum: [], fire: null,
    bounds: { x0: -HX + 0.5, x1: HX - 0.5, z0: -HZ + 0.5, z1: QUAY },
    spawns: [zones(-1), zones(1)],
    envPos: [0, 3.2, 20],
    // Ambiente: mediodía encapotado, nevando; luz plana y niebla densa que se come lo lejano.
    env: {
      day: true, weather: 'snow', wet: 0, snow: 1, flashlight: false,
      fog: [0.56, 0.6, 0.66], fogDensity: 0.021, zenith: [0.47, 0.51, 0.58], sunColor: [0.42, 0.44, 0.48], cloud: 1,
      hemi: { sky: 0xe2eaf4, ground: 0xb4bcc8, intensity: 2.3 },
      sun: { color: 0xe6edf7, intensity: 1.3, dir: [-30, 80, 45], target: [0, 0] },
      exposure: 0.95, vignette: 0.42, envIntensity: 1.2, groundEnv: 0.3, shadowEvery: 2,
    },
  };
}
