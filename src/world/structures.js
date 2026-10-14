// Edificios y estructuras: almacén militar, oficina, garita, perímetro, torre de vigilancia y depósitos.
import * as THREE from 'three';
import { boxUV, cylUV, xform } from '../geo.js';
import { WAREHOUSE as W, OFFICE as O, BASE, ROAD } from '../layout.js';
import { fence } from './props.js';

export function warehouse(ctx) {
  const M = ctx.M;
  ctx.region = 'warehouse';
  const H = W.wallH; const T = 0.3;
  const cx = (W.x0 + W.x1) / 2; const cz = (W.z0 + W.z1) / 2;
  const wx = W.x1 - W.x0; const wz = W.z1 - W.z0;
  const wall = (x, z, w, d, y0 = 0, h = H) => ctx.box(M.corrugatedWall, x, y0, z, w, h, d, { tile: 4, fitV: true, surface: 'metal' });
  wall(cx, W.z0, wx, T);
  wall(W.x0, cz, T, wz);
  wall(W.x1, cz, T, wz);
  wall((W.x0 + W.doorX0) / 2, W.z1, W.doorX0 - W.x0, T);
  wall((W.doorX1 + W.x1) / 2, W.z1, W.x1 - W.doorX1, T);
  wall((W.doorX0 + W.doorX1) / 2, W.z1, W.doorX1 - W.doorX0, T, W.doorH, H - W.doorH);
  // Zócalo de hormigón y marco de la puerta.
  for (const [x, z, w, d] of [[cx, W.z0, wx + 0.2, 0.44], [W.x0, cz, 0.44, wz], [W.x1, cz, 0.44, wz],
    [(W.x0 + W.doorX0) / 2, W.z1, W.doorX0 - W.x0, 0.44], [(W.doorX1 + W.x1) / 2, W.z1, W.x1 - W.doorX1, 0.44]]) {
    ctx.box(M.concreteWall, x, 0, z, w, 1.0, d, { tile: 4, fitV: true, collide: false });
  }
  for (const x of [W.doorX0 - 0.15, W.doorX1 + 0.15]) ctx.box(M.metal(0xb8960f, { worn: true }), x, 0, W.z1 + 0.05, 0.3, W.doorH + 0.3, 0.5, { tile: 1.5, surface: 'metal' });
  ctx.box(M.darkSteel, (W.doorX0 + W.doorX1) / 2, W.doorH, W.z1 + 0.05, W.doorX1 - W.doorX0 + 0.6, 0.3, 0.5, { collide: false });
  // Puerta corredera abierta, apoyada a un lado.
  ctx.box(M.corrugatedRoof, W.doorX1 + 5.3, 0.1, W.z1 + 0.32, 10, W.doorH + 0.1, 0.14, { tile: 4, fitV: true, surface: 'metal' });
  ctx.box(M.darkSteel, (W.doorX0 + W.doorX1) / 2 + 5, W.doorH + 0.35, W.z1 + 0.32, 21, 0.12, 0.12, { collide: false });

  // Tejado a dos aguas y hastiales.
  const rise = W.ridgeH - H; const half = wz / 2; const slope = Math.atan2(rise, half); const len = Math.hypot(rise, half) + 0.7;
  for (const s of [-1, 1]) {
    ctx.add(boxUV(wx + 1.2, 0.16, len, 4), M.corrugatedRoof, xform(cx, H + rise / 2 + 0.05, cz + s * (half / 2 + 0.15), s * slope, 0, 0));
  }
  const tri = new THREE.Shape();
  tri.moveTo(-half, 0); tri.lineTo(half, 0); tri.lineTo(0, rise); tri.closePath();
  for (const x of [W.x0 - T / 2, W.x1 - T / 2]) {
    const g = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false });
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 8);
    ctx.add(g, M.corrugatedWall, xform(x, H, cz, 0, Math.PI / 2, 0));
  }
  // Cerchas interiores.
  for (let x = W.x0 + 5; x < W.x1; x += 5) {
    ctx.add(boxUV(0.14, 0.2, wz - 0.4, 1), M.darkSteel, xform(x, H - 0.1, cz), 2);
    for (const s of [-1, 1]) ctx.add(boxUV(0.12, 0.16, len - 0.6, 1), M.darkSteel, xform(x, H + rise / 2 - 0.2, cz + s * half / 2, s * slope, 0, 0), 2);
    ctx.add(boxUV(0.1, rise - 0.3, 0.1, 1), M.darkSteel, xform(x, H + rise / 2 - 0.2, cz), 2);
  }
  // Ventanas altas iluminadas en la fachada sur.
  for (const x of [-20, -16, -12, 7, 11]) {
    ctx.add(boxUV(2.2, 1.0, 0.08, 1), M.darkSteel, xform(x, 6.3, W.z1 + 0.16), 0);
    ctx.add(new THREE.PlaneGeometry(2, 0.8), M.glow(x === -16 ? 0x1a2430 : 0xa9c2d8, x === -16 ? 0.3 : 0.7), xform(x, 6.3, W.z1 + 0.21), 0);
  }
  // Canalones y bajantes.
  for (const x of [W.x0 + 0.4, W.x1 - 0.4, W.doorX0 - 1.2]) ctx.add(cylUV(0.07, 0.07, H, 8), M.darkSteel, xform(x, H / 2, W.z1 + 0.24), 1);

  // --- Interior ---
  const steel = M.metal(0x34506a, { worn: true, wet: 0 });
  for (const [x, z] of [[-19, -52], [-19, -42], [10, -52], [11, -41]]) {
    // Estantería industrial con cajas.
    for (const dx of [-1.6, 1.6]) for (const dz of [-0.5, 0.5]) ctx.add(boxUV(0.09, 4.4, 0.09, 1), steel, xform(x + dx, 2.2, z + dz));
    for (const y of [0.25, 1.7, 3.15]) {
      ctx.add(boxUV(3.4, 0.08, 1.2, 1), steel, xform(x, y, z));
      for (const dx of [-1, 0.1, 1.05]) if (ctx.rng() < 0.8) { const s = ctx.rng.range(0.7, 0.95); ctx.add(boxUV(s, s, s, s), ctx.rng() < 0.5 ? M.woodDry : M.wood2, xform(x + dx, y + 0.04 + s / 2, z, 0, ctx.rng.range(-0.2, 0.2), 0)); }
    }
    ctx.collider(x, z, 3.5, 1.3, 0, 4.4, 0, 'wood');
    ctx.coverAround(x, z, 3.5, 1.3, 0, false);
  }
  // Lámparas colgantes.
  for (const [x, z, fl] of [[-12, -46, 0.25], [6, -46, 0]]) {
    ctx.add(cylUV(0.012, 0.012, 2.6, 6), M.darkSteel, xform(x, 8.2, z), 0);
    ctx.add(new THREE.ConeGeometry(0.42, 0.3, 16, 1, true), M.darkSteel, xform(x, 6.9, z), 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial());
    bulb.material.color.set(0xdcecff).multiplyScalar(22);
    bulb.position.set(x, 6.78, z);
    ctx.group.add(bulb);
    ctx.lamp({ x, y: 6.7, z, color: 0xcfe2ff, intensity: 300, type: 'point', range: 24, cone: { radius: 4.6, length: 6.7, intensity: 0.2 }, flareSize: 1.5, bulb, flicker: fl });
  }
  // Baliza roja de alarma sobre la puerta.
  const bx = W.doorX0 - 0.9;
  ctx.add(boxUV(0.2, 0.2, 0.25, 1), M.darkSteel, xform(bx, 6.05, W.z1 + 0.3), 0);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial());
  beacon.material.color.set(0xff1808).multiplyScalar(30);
  beacon.position.set(bx, 6.05, W.z1 + 0.5);
  ctx.group.add(beacon);
  const l = ctx.lamp({ x: bx, y: 6.05, z: W.z1 + 0.75, color: 0xff2410, intensity: 260, type: 'point', range: 20, flareSize: 2.2, flareK: 2, bulb: beacon, strength: 1.2 });
  l.pulse = (t) => 0.12 + 0.88 * Math.pow(Math.max(0, Math.sin(t * 3.6)), 3);
  // Detalle exterior (sólo visual): pilastras entre ventanas, canalones, cumbrera con ventiladores y cuadro eléctrico.
  const post = M.darkSteel;
  for (const x of [-22, -18, -14, -10, 14.6]) ctx.add(boxUV(0.26, H - 1, 0.14, 1), post, xform(x, (H + 1) / 2, W.z1 + 0.22), 1);
  for (const z of [-54, -49, -44, -39]) for (const x of [W.x0 - 0.22, W.x1 + 0.22]) ctx.add(boxUV(0.14, H - 1, 0.26, 1), post, xform(x, (H + 1) / 2, z), 1);
  for (const z of [W.z0 - 0.48, W.z1 + 0.48]) ctx.add(boxUV(wx + 1.2, 0.14, 0.2, 1), M.darkSteel, xform(cx, H - 0.02, z), 1);
  ctx.add(boxUV(wx + 1.2, 0.1, 0.5, 1), M.darkSteel, xform(cx, W.ridgeH + 0.16, cz), 1);
  const vent = M.metal(0x8c9196, { worn: true });
  for (const x of [-16, -4, 8]) {
    ctx.add(cylUV(0.45, 0.5, 0.5, 12), vent, xform(x, W.ridgeH + 0.45, cz), 1);
    ctx.add(cylUV(0.62, 0.62, 0.08, 12), vent, xform(x, W.ridgeH + 0.76, cz), 1);
  }
  ctx.add(boxUV(0.9, 1.5, 0.2, 1), M.metal(0x6a7076, { worn: true }), xform(-12, 1.85, W.z1 + 0.25), 1);
  ctx.add(cylUV(0.03, 0.03, 3, 6), M.darkSteel, xform(-12.3, 4.1, W.z1 + 0.19), 0);
  ctx.concreteRects.push({ x0: W.x0, x1: W.x1, z0: W.z0, z1: W.z1 + 4.5 });
  ctx.region = 'all';
}

export function office(ctx) {
  const M = ctx.M;
  ctx.region = 'road';
  const cx = (O.x0 + O.x1) / 2; const cz = (O.z0 + O.z1) / 2; const wx = O.x1 - O.x0; const wz = O.z1 - O.z0;
  ctx.box(M.cinder, cx, 0, cz, wx, O.h, wz, { tile: 1.6 });
  ctx.box(M.concreteWall, cx, O.h, cz, wx + 0.5, 0.45, wz + 0.5, { tile: 4, fitV: true, collide: false });
  ctx.box(M.concreteWall, cx, 0, cz, wx + 0.24, 0.6, wz + 0.24, { tile: 4, fitV: true, collide: false });
  // Ventanas en la fachada que da a la carretera (este) y en la sur.
  const lit = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0];
  let k = 0;
  for (let fl = 0; fl < 2; fl++) {
    for (let i = 0; i < 5; i++, k++) {
      const z = O.z0 + 1.9 + i * 2.55; const y = 1.75 + fl * 3.2; const x = O.x1 + 0.02;
      if (fl === 0 && i === 2) continue; // hueco de la puerta
      ctx.add(boxUV(0.12, 1.7, 1.75, 1), M.darkSteel, xform(x, y, z), 0);
      ctx.add(new THREE.PlaneGeometry(1.55, 1.5), lit[k] ? M.glow(0xffc27a, 2.2) : M.glassDark, xform(x + 0.07, y, z, 0, Math.PI / 2, 0), 0);
      if (lit[k]) for (let s = 0; s < 6; s++) ctx.add(boxUV(0.02, 0.05, 1.5, 1), M.darkSteel, xform(x + 0.09, y - 0.6 + s * 0.24, z), 0); // persiana
      ctx.add(boxUV(0.2, 0.06, 1.95, 1), M.concrete, xform(x + 0.06, y - 0.9, z), 0);
    }
  }
  // Puerta con marquesina y luz.
  const dz = O.z0 + 1.9 + 2 * 2.55;
  ctx.add(boxUV(0.1, 2.25, 1.3, 1), M.metal(0x3a4a58, { worn: true }), xform(O.x1 + 0.04, 1.13, dz));
  ctx.add(boxUV(1.3, 0.1, 2.2, 1), M.darkSteel, xform(O.x1 + 0.65, 2.55, dz));
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.3), new THREE.MeshBasicMaterial());
  bulb.material.color.set(0xffd2a0).multiplyScalar(18);
  bulb.position.set(O.x1 + 0.12, 2.38, dz);
  ctx.group.add(bulb);
  ctx.lamp({ x: O.x1 + 0.6, y: 2.3, z: dz, color: 0xffc890, intensity: 70, type: 'point', range: 12, flareSize: 1.1, bulb, flicker: 0.12 });
  // Aparatos de aire, tubería y escalera de servicio.
  for (const [x, z] of [[-26, 35], [-19, 41]]) {
    ctx.add(boxUV(1.6, 1.0, 1.1, 1.5), M.metal(0x8c9196, { worn: true }), xform(x, O.h + 0.95, z));
    ctx.add(cylUV(0.4, 0.4, 0.06, 14), M.darkSteel, xform(x, O.h + 1.48, z), 0);
  }
  ctx.add(cylUV(0.08, 0.08, O.h, 8), M.darkSteel, xform(O.x1 + 0.14, O.h / 2, O.z1 - 0.6), 1);
  ctx.add(boxUV(0.9, 1.3, 0.5, 1), M.metal(0x6a7076, { worn: true }), xform(O.x1 + 0.3, 2.6, O.z0 + 1.2));
  // Detalle exterior (sólo visual): imposta entre plantas, casetón y antenas en la azotea, y escalera de gato.
  ctx.add(boxUV(0.08, 0.14, wz + 0.1, 2), M.concrete, xform(O.x1 + 0.04, 3.55, cz), 0);
  ctx.add(boxUV(wx + 0.1, 0.14, 0.08, 2), M.concrete, xform(cx, 3.55, O.z1 + 0.04), 0);
  ctx.add(boxUV(2.2, 2.1, 2.6, 1.6), M.cinderDark, xform(cx - 2, O.h + 1.5, cz - 4));
  ctx.add(boxUV(2.5, 0.12, 2.9, 2), M.concrete, xform(cx - 2, O.h + 2.6, cz - 4));
  ctx.add(cylUV(0.04, 0.05, 4.5, 8), M.darkSteel, xform(cx + 5, O.h + 2.7, cz - 3), 1);
  for (const [y, w] of [[1.6, 1.3], [2.3, 1.0], [3.0, 0.7]]) ctx.add(boxUV(w, 0.03, 0.03, 1), M.darkSteel, xform(cx + 5, O.h + 0.45 + y, cz - 3), 0);
  ctx.add(new THREE.SphereGeometry(0.6, 12, 5, 0, Math.PI * 2, 0, 0.95), M.metal(0x8c9196, { worn: true }), xform(cx - 5.5, O.h + 1.25, cz + 4, 2.2, 0.6, 0), 1);
  ctx.add(cylUV(0.04, 0.04, 0.8, 6), M.darkSteel, xform(cx - 5.5, O.h + 0.85, cz + 4), 0);
  for (const s of [-1, 1]) ctx.add(boxUV(0.04, O.h, 0.04, 1), M.darkSteel, xform(cx - 6 + s * 0.25, O.h / 2, O.z1 + 0.1), 0);
  for (let i = 0; i < 17; i++) ctx.add(boxUV(0.5, 0.03, 0.03, 1), M.darkSteel, xform(cx - 6, 0.5 + i * 0.4, O.z1 + 0.1), 0);
  ctx.concreteRects.push({ x0: O.x0 - 1.5, x1: O.x1 + 2.2, z0: O.z0 - 1.5, z1: O.z1 + 1.5 }, { x0: O.x1, x1: -ROAD.halfW, z0: dz - 1.2, z1: dz + 1.2 });
  ctx.region = 'all';
}

export function guardBooth(ctx, x, z) {
  const M = ctx.M;
  const w = 2.6;
  ctx.box(M.cinderDark, x, 0, z, w, 1.05, w, { tile: 1.6 });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.add(boxUV(0.14, 1.6, 0.14, 1), M.darkSteel, xform(x + dx * (w / 2 - 0.07), 1.85, z + dz * (w / 2 - 0.07)));
  for (const [dx, dz, yaw] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) {
    ctx.add(new THREE.PlaneGeometry(w - 0.3, 1.5), M.glass, xform(x + dx * (w / 2 - 0.04), 1.82, z + dz * (w / 2 - 0.04), 0, yaw, 0), 0);
  }
  ctx.box(M.concrete, x, 2.62, z, w + 0.7, 0.16, w + 0.7, { collide: false });
  ctx.collider(x, z, w, w, 1.05, 2.7, 0, 'glass', { foot: false });
  ctx.add(boxUV(0.9, 0.05, 0.5, 1), M.woodDry, xform(x, 1.1, z + 0.6), 0);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.14), new THREE.MeshBasicMaterial());
  bulb.material.color.set(0xd6ebff).multiplyScalar(14);
  bulb.position.set(x, 2.56, z);
  ctx.group.add(bulb);
  ctx.lamp({ x, y: 2.4, z, color: 0xcfe6ff, intensity: 55, type: 'point', range: 11, bulb, flareSize: 0.9, flicker: 0.05 });
  ctx.concreteRects.push({ x0: x - 2.2, x1: x + 2.2, z0: z - 2.2, z1: z + 2.2 });
  // Barrera levadiza (levantada y torcida).
  ctx.box(M.metal(0xb8960f, { worn: true }), x - 1.75, 0, z - 2.3, 0.3, 1.1, 0.3, { surface: 'metal', tile: 1 });
  for (let i = 0; i < 9; i++) ctx.add(boxUV(0.7, 0.09, 0.07, 1), i % 2 ? M.metal(0xc9c9c9) : M.metal(0xb8201a), xform(x - 1.95 - Math.cos(1.05) * (0.35 + i * 0.7), 1.05 + Math.sin(1.05) * (0.35 + i * 0.7), z - 2.3, 0, 0, -1.05), 1);
}

export function perimeter(ctx) {
  const M = ctx.M;
  const G = ROAD.halfW + 0.4;
  // Valla sur de la base con hueco para la carretera y pilares del portón.
  fence(ctx, BASE.x0, BASE.z1, -G, BASE.z1, 3);
  fence(ctx, G, BASE.z1, BASE.x1, BASE.z1, 3);
  for (const s of [-1, 1]) ctx.box(M.concreteWall, s * (G + 0.1), 0, BASE.z1, 0.7, 3.4, 0.7, { tile: 2, fitV: true });
  fence(ctx, BASE.x0, BASE.z1, BASE.x0, BASE.z0, 3);
  fence(ctx, BASE.x1, BASE.z1, BASE.x1, BASE.z0, 3);
  // Muro norte de hormigón.
  ctx.box(M.concreteWall, 0, 0, BASE.z0, BASE.x1 - BASE.x0 + 1, 4, 0.5, { tile: 4, fitV: true });
  // Laterales de la carretera de acceso y cierre al sur.
  fence(ctx, 12.5, BASE.z1, 12.5, ROAD.zSouth - 3, 2.4);
  fence(ctx, -35, BASE.z1, -35, ROAD.zSouth - 3, 2.4);
  fence(ctx, -35, ROAD.zSouth - 3, 12.5, ROAD.zSouth - 3, 2.4);
  // Bordillos.
  for (const s of [-1, 1]) ctx.box(M.concrete, s * (ROAD.halfW + 0.3), 0, (BASE.z1 + ROAD.zSouth) / 2 + 1.5, 0.5, 0.13, ROAD.zSouth - BASE.z1 - 5, { tile: 2, flags: 2 });
}

export function guardTower(ctx, x, z) {
  const M = ctx.M;
  const steel = M.metal(0x3d4a3a, { worn: true });
  const P = 6.4;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.cyl(steel, x + dx * 1.3, 0, z + dz * 1.3, 0.09, P, { seg: 8 });
    ctx.add(boxUV(0.06, 0.06, 3.9, 1), steel, xform(x + dx * 1.3, P * 0.33, z, dx * 0.0, 0, 0, 1, 1, 1).multiply(xform(0, 0, 0, 0.95 * dz, 0, 0)), 1);
  }
  for (const y of [2.1, 4.2]) for (const [w, d, ox, oz] of [[2.6, 0.06, 0, 1.3], [2.6, 0.06, 0, -1.3], [0.06, 2.6, 1.3, 0], [0.06, 2.6, -1.3, 0]]) ctx.add(boxUV(w, 0.06, d, 1), steel, xform(x + ox, y, z + oz), 1);
  ctx.box(M.woodDry, x, P, z, 3.4, 0.14, 3.4, { collide: false, tile: 1.7 });
  for (const [w, d, ox, oz] of [[3.4, 0.08, 0, 1.66], [3.4, 0.08, 0, -1.66], [0.08, 3.4, 1.66, 0], [0.08, 3.4, -1.66, 0]]) ctx.add(boxUV(w, 1.05, d, 1.7), M.corrugatedRoof, xform(x + ox, P + 0.66, z + oz));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.add(boxUV(0.08, 1.2, 0.08, 1), steel, xform(x + dx * 1.62, P + 1.75, z + dz * 1.62));
  ctx.add(boxUV(4.2, 0.1, 4.2, 4), M.corrugatedRoof, xform(x, P + 2.4, z, 0.06, 0, 0));
  // Arriostramiento en cruz de las cuatro caras (sólo visual).
  for (let k = 0; k < 3; k++) {
    const y = 1.05 + k * 2.1; const a = (k % 2 ? -1 : 1) * 0.679;
    for (const s of [-1, 1]) {
      ctx.add(boxUV(0.05, 0.05, 3.34, 1), steel, xform(x + s * 1.3, y, z, a * s, 0, 0), 1);
      ctx.add(boxUV(3.34, 0.05, 0.05, 1), steel, xform(x, y, z + s * 1.3, 0, 0, a * s), 1);
    }
  }
  // Escalera.
  for (let i = 0; i < 16; i++) ctx.add(boxUV(0.5, 0.03, 0.03, 1), steel, xform(x, 0.3 + i * 0.4, z + 1.42), 0);
  for (const s of [-1, 1]) ctx.add(boxUV(0.04, P, 0.04, 1), steel, xform(x + s * 0.25, P / 2, z + 1.42), 0);
  // Reflector que barre el patio.
  const head = new THREE.Group();
  head.position.set(x - 1.5, P + 1.55, z - 1.5);
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.5, 16), M.darkSteel);
  housing.rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial());
  lens.material.color.set(0xe6f0ff).multiplyScalar(40);
  lens.position.z = -0.26; lens.rotation.y = Math.PI;
  head.add(housing, lens);
  ctx.group.add(head);
  const lamp = ctx.lamp({
    x: head.position.x, y: head.position.y, z: head.position.z, color: 0xdce9ff, intensity: 5200, type: 'spot', range: 75, angle: 0.2, penumbra: 0.5, decay: 1.6,
    target: [0, 0, -15], shadow: true, cone: { radius: 5.2, length: 38, intensity: 0.5, edge: 2.2, fall: 0.9 }, flareSize: 3.2, flareK: 2.4, strength: 1.4,
  });
  const tgt = new THREE.Vector3();
  ctx.updaters.push((dt, t) => {
    const a = Math.sin(t * 0.19) * 0.95 + Math.sin(t * 0.071) * 0.25;
    tgt.set(8 - Math.sin(a) * 30, 0, -14 + Math.cos(a) * 4 - Math.abs(Math.sin(a)) * 10);
    lamp.light.target.position.copy(tgt);
    lamp.dir.set(tgt.x - lamp.x, -lamp.y, tgt.z - lamp.z).normalize();
    head.lookAt(tgt);
    head.rotateY(Math.PI);
    lamp.cone.quaternion.setFromUnitVectors(_down, lamp.dir);
  });
}
const _down = new THREE.Vector3(0, -1, 0);

export function fuelDepot(ctx, x, z) {
  const M = ctx.M;
  const tank = M.metal(0x9aa0a4, { worn: true });
  for (const dx of [0, 4.6]) {
    const g = new THREE.CapsuleGeometry(1.5, 6.2, 8, 20);
    ctx.add(g, tank, xform(x + dx, 2.15, z, Math.PI / 2, 0, 0));
    for (const dz of [-2.4, 2.4]) ctx.box(M.concrete, x + dx, 0, z + dz, 2.6, 0.9, 0.7, { collide: false, tile: 2 });
    ctx.collider(x + dx, z, 3, 9.2, 0, 3.65, 0, 'metal');
    ctx.coverAround(x + dx, z, 3, 9.2, 0, false);
    ctx.add(cylUV(0.3, 0.3, 0.3, 12), M.darkSteel, xform(x + dx, 3.75, z - 1.5), 1);
    // Zunchos, pasarela con barandilla y válvula (sólo visual).
    for (const k of [-2.2, 0, 2.2]) ctx.add(new THREE.TorusGeometry(1.52, 0.04, 6, 24), M.darkSteel, xform(x + dx, 2.15, z + k), 1);
    ctx.add(boxUV(0.7, 0.06, 6, 1), M.darkSteel, xform(x + dx, 3.69, z), 1);
    for (const s of [-1, 1]) {
      for (const k of [-2.9, -1.45, 0, 1.45, 2.9]) ctx.add(boxUV(0.04, 0.9, 0.04, 1), M.steel, xform(x + dx + s * 0.33, 4.15, z + k), 0);
      for (const y of [4.2, 4.6]) ctx.add(boxUV(0.04, 0.04, 5.84, 1), M.steel, xform(x + dx + s * 0.33, y, z), 0);
    }
    ctx.add(cylUV(0.1, 0.1, 1.5, 8), M.darkSteel, xform(x + dx, 0.95, z + 4.7), 1);
    ctx.add(new THREE.TorusGeometry(0.2, 0.025, 6, 14), M.metal(0xb8201a), xform(x + dx, 1.5, z + 4.86), 0);
    ctx.add(boxUV(1.3, 0.9, 0.04, 1), M.glow(0xd8a020, 0.12), xform(x + dx, 2.2, z + 4.62), 0);
  }
  ctx.add(cylUV(0.09, 0.09, 4.6, 8), M.metal(0xb8960f, { worn: true }), xform(x + 2.3, 0.5, z + 3.6, 0, 0, Math.PI / 2), 1);
  ctx.concreteRects.push({ x0: x - 3, x1: x + 7.6, z0: z - 6, z1: z + 6 });
}
