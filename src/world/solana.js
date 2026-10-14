// Mapa LA SOLANA: depósito logístico en el desierto, al atardecer y en seco. Pensado para equipos:
// es simétrico de oeste a este (ALFA sale del oeste, BRAVO del este) y tiene tres carriles:
//   norte  — patio de contenedores, pasillos estrechos y combate cercano
//   centro — nave que se cruza por dentro, con una plaza de barreras alrededor
//   sur    — explanada abierta con vehículos, depósitos de combustible y tiros largos
import * as THREE from 'three';
import { WorldCtx } from './ctx.js';
import { xform, boxUV, cylUV } from '../geo.js';
import { jersey, sandbags, crate, crateStack, barrel, explosiveBarrel, pallet, tires, buildInstances } from './props.js';
import { fuelDepot } from './structures.js';
import { truck, jeep, container } from './vehicles.js';
import { makeCanvas, tex } from '../textures.js';
import { buildGround } from '../ground.js';
import { NO_MARKS } from '../groundShader.js';

const HX = 48; const HZ = 40; // semiejes del recinto
const BASE_X = 33; // muro frontal de cada base
const HALL = { hx: 10, hz: 7, h: 5, doorW: 5, doorH: 3.4, sideW: 3, sideH: 2.7 }; // nave central

// Mesetas lejanas alrededor del mapa, ya dentro de la calima.
function mesaLine(ctx) {
  const c = makeCanvas(2048, 256);
  const g = c.getContext('2d');
  // Dos planos: mesetas del fondo, más claras, y cerros cercanos.
  for (const [base, top, color, step] of [[150, 70, '#b9a88f', 190], [205, 40, '#8f7a61', 120]]) {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, 256);
    let x = 0; let y = base;
    while (x < 2048) {
      const w = step * (0.5 + Math.random());
      const h = base - Math.random() * top;
      g.lineTo(x, y); g.lineTo(x + 14, h); g.lineTo(x + w * 0.55, h + Math.random() * 6); g.lineTo(x + w * 0.55 + 18, base + Math.random() * 10);
      x += w; y = base + Math.random() * 10;
    }
    g.lineTo(2048, y); g.lineTo(2048, 256); g.closePath(); g.fill();
  }
  const t = tex(c, { srgb: true });
  t.repeat.set(3, 1);
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.BackSide, fog: false });
  mat.color.setRGB(0.5, 0.46, 0.42); // atenuado para fundirse con el horizonte
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(170, 170, 46, 64, 1, true), mat);
  mesh.position.set(0, 14, 0);
  ctx.group.add(mesh);
}

// Tramo de muro alineado con un eje, entre dos puntos.
function wall(ctx, mat, x0, z0, x1, z1, h, o = {}) {
  const t = o.t ?? 0.5;
  const w = Math.abs(x1 - x0) + t; const d = Math.abs(z1 - z0) + t;
  ctx.box(mat, (x0 + x1) / 2, o.y0 ?? 0, (z0 + z1) / 2, x0 === x1 ? t : w - t, h, z0 === z1 ? t : d - t, { tile: o.tile ?? 1.6, fitV: o.fitV ?? false, surface: o.surface ?? 'concrete' });
}

// Nave central: cuatro puertas (dos grandes al este y al oeste, dos de paso al norte y al sur),
// un núcleo macizo en medio que corta las líneas de tiro de lado a lado, y cubierta plana.
function hall(ctx) {
  const M = ctx.M;
  const { hx, hz, h, doorW, doorH, sideW, sideH } = HALL;
  const steel = M.corrugatedWall;
  const o = { t: 0.3, tile: 4, fitV: true, surface: 'metal' };
  for (const s of [-1, 1]) {
    // Fachadas este y oeste, con la puerta grande.
    wall(ctx, steel, s * hx, -hz, s * hx, -doorW / 2, h, o);
    wall(ctx, steel, s * hx, doorW / 2, s * hx, hz, h, o);
    wall(ctx, steel, s * hx, -doorW / 2, s * hx, doorW / 2, h - doorH, { ...o, y0: doorH });
    for (const k of [-1, 1]) ctx.box(M.metal(0xb8960f, { worn: true }), s * hx, 0, k * (doorW / 2 + 0.12), 0.5, doorH + 0.2, 0.3, { tile: 1.5, surface: 'metal' });
    // Fachadas norte y sur, con la puerta de paso.
    wall(ctx, steel, -hx, s * hz, -sideW / 2, s * hz, h, o);
    wall(ctx, steel, sideW / 2, s * hz, hx, s * hz, h, o);
    wall(ctx, steel, -sideW / 2, s * hz, sideW / 2, s * hz, h - sideH, { ...o, y0: sideH });
    // Zócalo de hormigón.
    ctx.box(M.concreteWall, s * hx, 0, -(hz + doorW / 2) / 2, 0.44, 0.9, hz - doorW / 2, { tile: 4, fitV: true, collide: false });
    ctx.box(M.concreteWall, s * hx, 0, (hz + doorW / 2) / 2, 0.44, 0.9, hz - doorW / 2, { tile: 4, fitV: true, collide: false });
  }
  // Cubierta y vigas.
  ctx.box(M.corrugatedRoof, 0, h, 0, hx * 2 + 1, 0.25, hz * 2 + 1, { tile: 4, surface: 'metal', col: { walkable: false } });
  for (let x = -hx + 4; x < hx; x += 4) ctx.add(boxUV(0.16, 0.3, hz * 2 - 0.4, 1), M.darkSteel, xform(x, h - 0.16, 0), 2);
  // Núcleo: cuarto técnico macizo en el centro.
  ctx.box(M.cinderDark, 0, 0, 0, 3.4, h, 3.4, { tile: 1.6 });
  ctx.add(boxUV(1.1, 2.1, 0.08, 1), M.metal(0x3a4a58, { worn: true, wet: 0 }), xform(0, 1.05, 1.74));
  // Carga apilada en el interior: cobertura en las cuatro esquinas.
  for (const s of [-1, 1]) {
    crateStack(ctx, s * 6.2, -3.9, s * 0.25, 1);
    crate(ctx, s * 5.4, 4.4, 1.3, s * 0.3, 0, true);
    crate(ctx, s * 6.9, 4.9, 1.0, s * -0.2);
    pallet(ctx, s * 2.9, -5.6, s * 0.2, 4);
  }
  // Dos lámparas colgantes: dentro hay sombra aunque fuera sea de día.
  for (const x of [-5.6, 5.6]) {
    ctx.add(cylUV(0.012, 0.012, 0.7, 6), M.darkSteel, xform(x, h - 0.35, 0), 0);
    ctx.add(new THREE.ConeGeometry(0.4, 0.28, 16, 1, true), M.darkSteel, xform(x, h - 0.8, 0), 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial());
    bulb.material.color.set(0xffe2b8).multiplyScalar(14);
    bulb.position.set(x, h - 0.9, 0);
    ctx.group.add(bulb);
    ctx.lamp({ x, y: h - 1, z: 0, color: 0xffd9a8, intensity: 34, type: 'point', range: 13, bulb, strength: 0.6 });
  }
  // Detalle exterior (sólo visual): pilastras, imposta de cubierta y equipos en el tejado.
  const post = M.darkSteel;
  for (const s of [-1, 1]) {
    for (const x of [-hx, -5, 5, hx]) ctx.add(boxUV(0.26, h, 0.14, 1), post, xform(x, h / 2, s * (hz + 0.22)), 1);
    for (const z of [-5, 5]) ctx.add(boxUV(0.14, h, 0.26, 1), post, xform(s * (hx + 0.22), h / 2, z), 1);
    ctx.add(boxUV(hx * 2 + 1.1, 0.3, 0.08, 2), M.darkSteel, xform(0, h + 0.1, s * (hz + 0.52)), 1);
    ctx.add(boxUV(0.08, 0.3, hz * 2 + 1.1, 2), M.darkSteel, xform(s * (hx + 0.52), h + 0.1, 0), 1);
    ctx.add(boxUV(1.6, 1, 1.1, 1.5), M.metal(0x8c9196, { worn: true }), xform(s * 4.5, h + 0.75, 2.5));
    ctx.add(cylUV(0.4, 0.4, 0.06, 14), M.darkSteel, xform(s * 4.5, h + 1.28, 2.5), 0);
    ctx.add(cylUV(0.14, 0.14, 0.9, 8), M.darkSteel, xform(s * 7, h + 0.7, -3.5), 1);
  }
  ctx.concreteRects.push({ x0: -hx - 4, x1: hx + 4, z0: -hz - 4, z1: hz + 4 });
}

// Base de un equipo (s = -1 oeste, +1 este): barracón al fondo, muro frontal con tres salidas
// (norte, centro y sur) y pantallas que tapan la vista desde fuera hacia donde se aparece.
function base(ctx, s) {
  const M = ctx.M;
  // Barracón macizo contra el muro del fondo.
  ctx.box(M.cinder, s * 45.2, 0, 0, 4.6, 4.6, 22, { tile: 1.6 });
  ctx.box(M.concreteWall, s * 45.2, 4.6, 0, 5.1, 0.4, 22.5, { tile: 4, fitV: true, collide: false });
  for (const z of [-8, -4, 4, 8]) {
    ctx.add(boxUV(0.12, 1.5, 1.7, 1), M.darkSteel, xform(s * 42.86, 2.4, z), 0);
    ctx.add(new THREE.PlaneGeometry(1.5, 1.3), M.glassDark, xform(s * 42.78, 2.4, z, 0, -s * Math.PI / 2, 0), 0);
  }
  ctx.add(boxUV(0.1, 2.25, 1.3, 1), M.metal(s < 0 ? 0x2f5078 : 0x7a3526, { worn: true }), xform(s * 42.86, 1.13, 0)); // puerta del color del equipo
  // Detalle (sólo visual): marquesina de la puerta, depósito de agua en la azotea y bajante.
  ctx.add(boxUV(1.1, 0.1, 2.0, 1), M.darkSteel, xform(s * 42.4, 2.5, 0));
  ctx.add(cylUV(0.9, 0.9, 1.6, 14), M.metal(0x8c9196, { worn: true }), xform(s * 45.4, 6.1, -6));
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) ctx.add(boxUV(0.08, 0.5, 0.08, 1), M.darkSteel, xform(s * 45.4 + dx, 5.15, -6 + dz), 0);
  ctx.add(cylUV(0.07, 0.07, 4.6, 8), M.darkSteel, xform(s * 42.82, 2.3, 10.4), 1);
  // Muro frontal: dos lienzos que dejan salida por el norte, por el centro y por el sur.
  for (const k of [-1, 1]) {
    wall(ctx, M.cinderDark, s * BASE_X, k * 4, s * BASE_X, k * 30, 3.4);
    ctx.box(M.concreteWall, s * BASE_X, 3.4, k * 17, 0.7, 0.18, 26.2, { tile: 4, fitV: true, collide: false });
    // Contenedor entre la salida lateral y la zona de aparición.
    container(ctx, s * 40.5, k * 26.4, 0, k < 0 ? 'grey' : 'green');
    sandbags(ctx, s * 35.2, k * 33.5, Math.PI / 2, 3.2, 3);
  }
  // Pantalla delante de la salida central: desde el centro del mapa no se ve el interior de la base.
  container(ctx, s * 27, 0, Math.PI / 2, s < 0 ? 'blue' : 'red', 0, true);
  container(ctx, s * 27, 2.6, Math.PI / 2, 'white', 1);
  // Pantallas delante de las salidas laterales.
  container(ctx, s * 29.6, -35, Math.PI / 2, 'orange');
  jeep(ctx, s * 29.8, 35, s * 0.1, 0x6b6248);
  // Dentro de la base.
  truck(ctx, s * 37.3, -8.5, 0, true);
  crateStack(ctx, s * 36.4, 8.6, s * 0.2, 2);
  tires(ctx, s * 35, 13.6, 4);
  for (const [dx, z] of [[41.2, -33.5], [42, -34.3]]) barrel(ctx, s * dx, z);
  pallet(ctx, s * 38.6, 3.4, 0.3, 3);
  ctx.concreteRects.push({ x0: Math.min(s * BASE_X, s * HX), x1: Math.max(s * BASE_X, s * HX), z0: -HZ, z1: HZ });
}

// Mitad de los tres carriles (s = -1 oeste, +1 este); la otra mitad es su reflejo.
function lanes(ctx, s) {
  const M = ctx.M;
  // ---- Carril norte: patio de contenedores ----
  container(ctx, s * 21, -14, Math.PI / 2, 'blue'); container(ctx, s * 21, -14, Math.PI / 2 + s * 0.03, 'grey', 1);
  container(ctx, s * 15.8, -27, 0, 'red', 0, true); container(ctx, s * 13.4, -27, s * 0.03, 'green', 1);
  container(ctx, s * 6.4, -18.6, s * 0.06, 'green');
  container(ctx, s * 26.6, -24, Math.PI / 2, 'white');
  crateStack(ctx, s * 12.4, -13.4, s * 0.3, 1);
  crate(ctx, s * 3.2, -25.6, 1.3, s * 0.2, 0, true);
  explosiveBarrel(ctx, s * 10.6, -21.6);
  tires(ctx, s * 23.6, -34.4, 4);
  jersey(ctx, s * 16.4, -19.6, Math.PI / 2 + s * 0.1);
  pallet(ctx, s * 9.4, -34.6, s * 0.4, 4);

  // ---- Franja entre la base y el centro ----
  jersey(ctx, s * 21.6, -5, Math.PI / 2); jersey(ctx, s * 21.6, 6, Math.PI / 2 + s * 0.08);
  sandbags(ctx, s * 15.4, -1.2, Math.PI / 2 + s * 0.1, 3.6, 3);
  sandbags(ctx, s * 6.4, -10.6, s * 0.08, 3.4, 3);
  sandbags(ctx, s * 6.4, 10.6, -s * 0.08, 3.4, 3);
  crateStack(ctx, s * 14.6, 8.4, s * 0.4, 0);

  // ---- Carril sur: explanada de vehículos ----
  truck(ctx, s * 17.6, 20.6, s * 0.5, s < 0);
  jeep(ctx, s * 10.2, 34.2, s * 1.25);
  ctx.box(M.cinder, s * 13.6, 0, 27.4, 7.4, 1.1, 0.45, { tile: 1.6, cover: 'low' }); // murete
  sandbags(ctx, s * 24.4, 14.2, Math.PI / 2, 4, 3);
  jersey(ctx, s * 20.4, 30.4, s * 0.3); jersey(ctx, s * 7.2, 17.2, 0);
  crateStack(ctx, s * 26.6, 23.6, s * 0.2, 2);
  explosiveBarrel(ctx, s * 5.6, 25.4); explosiveBarrel(ctx, s * 6.3, 26.2);
  tires(ctx, s * 22.8, 37, 3);
  for (const [dx, z] of [[11.6, 15.2], [12.4, 15.9]]) barrel(ctx, s * dx, z, 0x7a4630);
}

export function buildSolana(scene, M, reflection) {
  const ctx = new WorldCtx(scene, M);
  ctx.ambient = [0.82, 0.74, 0.62]; // el humo y el polvo se ven a plena luz

  // Muro perimetral.
  ctx.region = 'perimeter';
  const P = { tile: 4, fitV: true };
  wall(ctx, M.concreteWall, -HX - 0.25, -HZ - 0.25, HX + 0.25, -HZ - 0.25, 4.4, P);
  wall(ctx, M.concreteWall, -HX - 0.25, HZ + 0.25, HX + 0.25, HZ + 0.25, 4.4, P);
  wall(ctx, M.concreteWall, -HX - 0.25, -HZ - 0.25, -HX - 0.25, HZ + 0.25, 4.4, P);
  wall(ctx, M.concreteWall, HX + 0.25, -HZ - 0.25, HX + 0.25, HZ + 0.25, 4.4, P);

  ctx.region = 'hall';
  hall(ctx);
  for (const s of [-1, 1]) {
    ctx.region = s < 0 ? 'west' : 'east';
    base(ctx, s);
    lanes(ctx, s);
  }

  // Piezas centrales, sobre el eje de simetría.
  ctx.region = 'mid';
  container(ctx, 0, -33, 0, 'orange', 0, true); container(ctx, 0, -33, 0.02, 'white', 1);
  crateStack(ctx, 0, -23.4, 0.1, 2);
  fuelDepot(ctx, -2.3, 31);
  jersey(ctx, 0, 21.6, 0);
  crate(ctx, 0, 13.4, 1.4, 0.4);

  buildInstances(ctx);
  mesaLine(ctx);
  const staticMeshes = ctx.finish();

  const indoor = [{ x0: -HALL.hx, x1: HALL.hx, z0: -HALL.hz, z1: HALL.hz }];
  const ground = buildGround({
    surfaces: M.surf, footprints: ctx.footprints, puddles: [], concreteRects: ctx.concreteRects, reflection,
    spec: {
      key: 'solana', map: { cx: 0, cz: 0, size: 132 }, marks: NO_MARKS, wet: 0, indoor,
      dirtTint: [9.5, 7.6, 5.2], tuft: [0.3, 0.23, 0.14, 0.4], // arena clara con manchas de grava
      // Todo es arena salvo las plataformas de hormigón (que ya van en su propia capa).
      paintDirt(c, map) {
        c.fillStyle = '#fff';
        c.fillRect(map.cx - map.size, map.cz - map.size, map.size * 2, map.size * 2);
        c.fillStyle = '#000';
        for (const r of ctx.concreteRects) c.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
      },
    },
  });
  ctx.group.add(ground.mesh);

  // Dos zonas de aparición por equipo, tras los lienzos del muro frontal y mirando hacia el centro.
  const zones = (s) => [-18, 18].map((z) => ({ x: s * 41, z, r: 4, yaw: s * Math.PI / 2 }));

  return {
    ctx, group: ctx.group, ground, cover: [], enemies: [], staticMeshes,
    col: ctx.col, lamps: ctx.lamps, barrels: ctx.barrels, emitters: ctx.emitters,
    dry: { x0: 0, z0: 0, x1: 0, z1: 0, y: 0 }, // no llueve
    hum: [], fire: null,
    bounds: { x0: -HX + 0.5, x1: HX - 0.5, z0: -HZ + 0.5, z1: HZ - 0.5 },
    spawns: [zones(-1), zones(1)],
    envPos: [0, 3.2, 20],
    // Ambiente: última hora de la tarde, sol bajo desde el sur (de costado para los dos equipos).
    env: {
      day: true, weather: 'none', wet: 0, snow: 0, flashlight: false,
      fog: [0.5, 0.43, 0.34], fogDensity: 0.0042, zenith: [0.1, 0.2, 0.42], sunColor: [1.0, 0.82, 0.6], cloud: 0.55,
      hemi: { sky: 0xc4d6ea, ground: 0x9a8262, intensity: 2.3 },
      sun: { color: 0xffdcae, intensity: 4.6, dir: [20, 62, 78], target: [0, 0] },
      exposure: 1.0, vignette: 0.36, envIntensity: 1.3, groundEnv: 0.3, shadowEvery: 2,
    },
  };
}
