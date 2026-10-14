// Vehículos abandonados (camión militar, todoterreno), contenedores, generador y torre de focos.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxUV, cylUV, xform } from '../geo.js';
import { pbr } from '../materials.js';
import { steamEmitter } from '../fxRecipes.js';

// Coloca piezas definidas en espacio local del vehículo (frente hacia +Z).
function assembler(ctx, x, z, yaw) {
  const base = xform(x, 0, z, 0, yaw, 0);
  return (geo, mat, lx, ly, lz, rx = 0, ry = 0, rz = 0, flags = 3) => ctx.add(geo, mat, base.clone().multiply(xform(lx, ly, lz, rx, ry, rz)), flags);
}
const rbox = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, r);
function wheel(put, M, lx, ly, lz, r, w) {
  put(cylUV(r, r, w, 20, 0.9), M.tire, lx, ly, lz, 0, 0, Math.PI / 2);
  put(cylUV(r * 0.55, r * 0.55, w + 0.02, 12), M.darkSteel, lx, ly, lz, 0, 0, Math.PI / 2);
  // Llanta y buje por la cara de fuera.
  const out = Math.sign(lx) * (w / 2 + 0.014);
  put(cylUV(r * 0.44, r * 0.5, 0.03, 12), M.metal(0x8c9196, { worn: true }), lx + out, ly, lz, 0, 0, Math.PI / 2);
  put(cylUV(r * 0.17, r * 0.17, 0.08, 8), M.steel, lx + out, ly, lz, 0, 0, Math.PI / 2);
}

export function truck(ctx, x, z, yaw, tarp = true) {
  const M = ctx.M;
  const body = M.metal(0x3f4a36, { worn: true });
  const put = assembler(ctx, x, z, yaw);
  put(boxUV(2.2, 0.32, 7.0, 2), M.darkSteel, 0, 1.0, 0);
  put(rbox(2.42, 1.75, 1.95, 0.12), body, 0, 2.15, 1.75);
  put(rbox(2.1, 0.95, 1.55, 0.1), body, 0, 1.72, 3.25);
  put(boxUV(2.5, 0.3, 0.22, 1), M.darkSteel, 0, 0.95, 4.05);
  put(boxUV(1.5, 0.6, 0.06, 1), M.darkSteel, 0, 1.7, 4.04);
  for (const s of [-1, 1]) {
    put(cylUV(0.14, 0.14, 0.08, 14), M.glassDark, s * 0.84, 1.75, 4.03, Math.PI / 2);
    put(rbox(0.5, 0.12, 1.5, 0.05), body, s * 1.12, 1.42, 3.1);
    put(new THREE.PlaneGeometry(0.75, 0.6), M.glassDark, s * 1.225, 2.45, 1.85, 0, s * Math.PI / 2, 0, 0);
    put(boxUV(0.06, 0.35, 0.22, 1), M.darkSteel, s * 1.38, 2.55, 2.75);
  }
  put(new THREE.PlaneGeometry(2.1, 0.78), M.glass, 0, 2.5, 2.745, -0.12, 0, 0, 0);
  // Caja de carga y lona.
  put(boxUV(2.46, 0.95, 4.3, 2), body, 0, 1.6, -1.45);
  if (tarp) {
    put(rbox(2.5, 1.5, 4.3, 0.3), M.tarp, 0, 2.8, -1.45);
    for (const zz of [-3.2, -2, -0.9, 0.3]) put(boxUV(2.56, 0.05, 0.06, 1), M.darkSteel, 0, 3.52, zz, 0, 0, 0, 1);
  } else {
    for (const s of [-1, 1]) put(boxUV(0.06, 0.6, 4.3, 2), body, s * 1.2, 2.35, -1.45);
  }
  for (const s of [-1, 1]) for (const zz of [3.05, -0.75, -2.35]) wheel(put, M, s * 1.05, 0.56, zz, 0.56, 0.38);
  put(cylUV(0.5, 0.5, 0.3, 16, 0.9), M.tire, 0, 1.5, -3.75, Math.PI / 2);
  // Calandra de lamas, matrícula y aros de los faros.
  for (let i = 0; i < 5; i++) put(boxUV(1.4, 0.035, 0.03, 1), M.steel, 0, 1.5 + i * 0.1, 4.075, 0, 0, 0, 0);
  put(boxUV(0.52, 0.16, 0.02, 1), M.metal(0xcfcbbd, { worn: true }), 0, 0.98, 4.17, 0, 0, 0, 0);
  for (const s of [-1, 1]) {
    put(cylUV(0.17, 0.17, 0.06, 14), M.darkSteel, s * 0.84, 1.75, 4.0, Math.PI / 2);
    // Puerta: juntas, manilla y estribo; brazo del retrovisor.
    for (const zz of [1.15, 2.45]) put(boxUV(0.02, 1.3, 0.03, 1), M.darkSteel, s * 1.215, 2.0, zz, 0, 0, 0, 0);
    put(boxUV(0.03, 0.04, 0.16, 1), M.steel, s * 1.225, 1.95, 1.34, 0, 0, 0, 0);
    put(boxUV(0.16, 0.05, 0.9, 1), M.darkSteel, s * 1.2, 1.12, 1.8);
    put(boxUV(0.2, 0.04, 0.04, 1), M.darkSteel, s * 1.3, 2.5, 2.72, 0, 0, 0, 0);
    // Nervios de la caja y pilotos traseros.
    for (const zz of [-3.3, -2.4, -1.45, -0.5, 0.4]) put(boxUV(0.04, 0.9, 0.07, 1), M.darkSteel, s * 1.245, 1.6, zz, 0, 0, 0, 2);
    put(boxUV(0.2, 0.12, 0.04, 1), M.glow(0xff2010, 0.7), s * 0.95, 1.22, -3.61, 0, 0, 0, 0);
  }
  put(boxUV(2.3, 0.12, 0.1, 1), M.darkSteel, 0, 0.98, -3.62);
  // Escape vertical tras la cabina y depósito de combustible en el costado.
  put(cylUV(0.07, 0.07, 1.9, 10), M.darkSteel, -1.3, 2.75, 0.74);
  put(cylUV(0.09, 0.09, 0.5, 10), M.steel, -1.3, 3.1, 0.74);
  put(cylUV(0.3, 0.3, 1.1, 14), M.metal(0x6a7076, { worn: true }), 1.0, 0.98, 0.75, Math.PI / 2);
  for (const zz of [0.4, 1.1]) put(cylUV(0.31, 0.31, 0.05, 14), M.darkSteel, 1.0, 0.98, zz, Math.PI / 2);
  ctx.collider(x, z, 2.5, 7.9, 0, 3.4, yaw, 'metal');
  ctx.coverAround(x, z, 2.5, 7.9, yaw, false);
}

export function jeep(ctx, x, z, yaw, color = 0x4a4d3a) {
  const M = ctx.M;
  const body = M.metal(color, { worn: true });
  const put = assembler(ctx, x, z, yaw);
  put(rbox(1.9, 0.7, 4.3, 0.12), body, 0, 0.95, 0);
  put(rbox(1.7, 0.42, 1.5, 0.1), body, 0, 1.38, 1.3);
  put(boxUV(1.95, 0.22, 0.16, 1), M.darkSteel, 0, 0.72, 2.2);
  put(boxUV(1.95, 0.22, 0.16, 1), M.darkSteel, 0, 0.72, -2.2);
  put(boxUV(1.0, 0.36, 0.05, 1), M.darkSteel, 0, 1.3, 2.07);
  for (const s of [-1, 1]) {
    put(cylUV(0.11, 0.11, 0.06, 12), M.glassDark, s * 0.68, 1.32, 2.08, Math.PI / 2);
    put(boxUV(0.05, 0.95, 0.05, 1), M.darkSteel, s * 0.9, 1.85, 0.5, 0.25);
    put(boxUV(0.05, 0.9, 0.05, 1), M.darkSteel, s * 0.9, 1.78, -1.9);
    put(boxUV(0.05, 0.05, 2.5, 1), M.darkSteel, s * 0.9, 2.25, -0.75);
    for (const zz of [1.4, -1.4]) wheel(put, M, s * 0.92, 0.44, zz, 0.44, 0.3);
  }
  put(new THREE.PlaneGeometry(1.75, 0.8), M.glass, 0, 1.9, 0.52, -0.25, 0, 0, 0);
  put(rbox(1.86, 0.08, 2.6, 0.03), M.tarp, 0, 2.3, -0.75);
  put(rbox(1.5, 0.5, 0.5, 0.1), M.plastic, 0, 1.25, -0.2);
  put(cylUV(0.42, 0.42, 0.26, 16, 0.9), M.tire, 0, 1.15, -2.36, Math.PI / 2);
  // Calandra de barras, aros de los faros y marco del parabrisas.
  for (let i = -3; i <= 3; i++) put(boxUV(0.03, 0.3, 0.03, 1), M.steel, i * 0.12, 1.3, 2.105, 0, 0, 0, 0);
  put(boxUV(1.85, 0.05, 0.05, 1), M.darkSteel, 0, 2.29, 0.42);
  put(boxUV(1.85, 0.05, 0.05, 1), M.darkSteel, 0, 1.51, 0.62);
  for (const s of [-1, 1]) {
    put(cylUV(0.135, 0.135, 0.05, 12), M.darkSteel, s * 0.68, 1.32, 2.06, Math.PI / 2);
    put(boxUV(0.04, 0.14, 0.18, 1), M.darkSteel, s * 1.0, 1.75, 0.62);
    put(boxUV(0.12, 0.08, 0.03, 1), M.glow(0xff2010, 0.7), s * 0.8, 1.05, -2.16, 0, 0, 0, 0);
    // Banquetas (bajas: un plano del menú cruza la cabina y no deben taparlo) y rejillas del capó.
    put(boxUV(0.5, 0.12, 0.5, 1), M.tarp, s * 0.45, 1.34, -0.42);
    for (const zz of [1.0, 1.3]) put(boxUV(0.3, 0.012, 0.05, 1), M.darkSteel, s * 0.4, 1.596, zz, 0, 0, 0, 0);
  }
  put(boxUV(0.16, 0.46, 0.34, 1), body, 0.68, 1.2, -2.24); // bidón de reserva
  put(cylUV(0.008, 0.008, 1.6, 5), M.darkSteel, -0.86, 2.1, -1.95, 0, 0, 0, 0); // antena
  ctx.collider(x, z, 1.95, 4.5, 0, 1.75, yaw, 'metal');
  ctx.coverAround(x, z, 1.95, 4.5, yaw, false);
}

// ---------- Contenedores marítimos ----------
const CONTAINER_COLORS = { red: 0x7d2a1e, blue: 0x234a72, green: 0x2f5a44, grey: 0x7c8388, orange: 0xa85316, white: 0xa9aca8 };
const _cmat = new Map();
export function container(ctx, x, z, yaw, color = 'red', level = 0, long = false) {
  const M = ctx.M;
  if (!_cmat.has(color)) _cmat.set(color, pbr(M.surf.corrugated, { color: CONTAINER_COLORS[color] }));
  const mat = _cmat.get(color);
  const L = long ? 12.19 : 6.06; const Wd = 2.44; const H = 2.59;
  const y0 = level * H;
  const base = xform(x, y0, z, 0, yaw, 0);
  const put = (geo, m, lx, ly, lz, flags = 3) => ctx.add(geo, m, base.clone().multiply(xform(lx, ly, lz)), flags);
  put(boxUV(L - 0.1, H - 0.1, Wd - 0.1, 4, true), mat, 0, H / 2, 0);
  // Bastidor: postes de esquina y largueros.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(boxUV(0.16, H, 0.16, 1), mat, sx * (L / 2 - 0.08), H / 2, sz * (Wd / 2 - 0.08));
  for (const sz of [-1, 1]) for (const yy of [0.08, H - 0.08]) put(boxUV(L, 0.16, 0.12, 1), mat, 0, yy, sz * (Wd / 2 - 0.06));
  for (const sx of [-1, 1]) for (const yy of [0.08, H - 0.08]) put(boxUV(0.12, 0.16, Wd, 1), mat, sx * (L / 2 - 0.06), yy, 0);
  // Puertas con barras de cierre en un extremo.
  for (const sz of [-0.9, -0.3, 0.3, 0.9]) put(cylUV(0.022, 0.022, H - 0.4, 6), M.steel, L / 2 + 0.03, H / 2, sz, 1);
  put(boxUV(0.03, H - 0.3, 0.04, 1), M.darkSteel, L / 2 + 0.01, H / 2, 0, 0);
  for (const sz of [-0.6, 0.6]) put(boxUV(0.05, 0.1, 0.3, 1), M.steel, L / 2 + 0.04, 1.15, sz, 0);
  // Detalle sólo en los que se ven de cerca (los apilados altos del carguero se quedan como están).
  if (level <= 1) {
    const plate = M.metal(0xcfcbbd, { worn: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const yy of [0.065, H - 0.065]) put(boxUV(0.2, 0.13, 0.2, 1), M.darkSteel, sx * (L / 2 - 0.08), yy, sz * (Wd / 2 - 0.08)); // esquineras
    for (const sz of [-1, 1]) {
      put(boxUV(0.8, 0.28, 0.012, 1), plate, -sz * (L / 2 - 1.05), H - 0.62, sz * (Wd / 2 - 0.044), 0); // rótulo
      for (const yy of [0.6, 2.0]) put(boxUV(0.05, 0.12, 0.08, 1), M.steel, L / 2 + 0.02, yy, sz * 1.1, 0); // bisagras
    }
    put(boxUV(0.02, 0.3, 0.45, 1), plate, L / 2 + 0.012, 1.75, 0.6, 0); // placa de datos
  }
  ctx.collider(x, z, L, Wd, y0, y0 + H, yaw, 'metal', { foot: level === 0 });
  if (level === 0) {
    ctx.coverAround(x, z, L, Wd, yaw, false);
    // Esquinas: buenas posiciones para asomarse.
    const cos = Math.cos(yaw); const sin = Math.sin(yaw);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = sx * (L / 2 - 0.6); const lz = sz * (Wd / 2 + 0.6);
      ctx.cover.push({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos, nx: -sz * sin, nz: -sz * cos, low: false, user: null });
    }
  }
}

// ---------- Generador con baliza y escape ----------
export function generator(ctx, x, z, yaw = 0) {
  const M = ctx.M;
  const body = M.metal(0x8a7a1c, { worn: true });
  const put = assembler(ctx, x, z, yaw);
  put(boxUV(1.5, 0.25, 2.7, 1), M.darkSteel, 0, 0.3, 0);
  put(new RoundedBoxGeometry(1.4, 1.3, 2.5, 3, 0.07), body, 0, 1.05, 0);
  for (let i = 0; i < 7; i++) put(boxUV(0.03, 0.05, 0.9, 1), M.darkSteel, 0.705, 0.75 + i * 0.1, -0.5, 0, 0, 0.5, 0);
  put(boxUV(0.03, 0.55, 0.7, 1), M.plastic, 0.71, 1.15, 0.7);
  for (const [dy, dz, c] of [[1.3, 0.55, 0x30ff60], [1.3, 0.7, 0xffb020], [1.2, 0.85, 0xff3020]]) put(new THREE.SphereGeometry(0.018, 6, 4), M.glow(c, 8), 0.73, dy, dz, 0, 0, 0, 0);
  put(cylUV(0.06, 0.06, 0.7, 8), M.darkSteel, -0.4, 2.0, -0.9);
  for (const s of [-1, 1]) for (const zz of [-0.9, 0.9]) put(cylUV(0.2, 0.2, 0.12, 10), M.rubber, s * 0.72, 0.2, zz, 0, 0, Math.PI / 2);
  ctx.collider(x, z, 1.5, 2.7, 0, 1.72, yaw, 'metal');
  ctx.coverAround(x, z, 1.5, 2.7, yaw, false);
  const cos = Math.cos(yaw); const sin = Math.sin(yaw);
  ctx.emitters.push(steamEmitter(x + -0.4 * cos + -0.9 * sin, 2.4, z - -0.4 * sin + -0.9 * cos, 6, 0.3, 0.1, [0.5, 0.5, 0.52]));
  // Baliza giratoria roja.
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 12), new THREE.MeshBasicMaterial());
  bulb.material.color.set(0xff1a08).multiplyScalar(26);
  bulb.position.set(x, 1.8, z);
  ctx.group.add(bulb);
  const lamp = ctx.lamp({ x, y: 2.0, z, color: 0xff2008, intensity: 190, type: 'point', range: 17, flareSize: 1.8, flareK: 2, bulb, strength: 1.1 });
  const ph = ctx.rng.range(0, 6);
  lamp.pulse = (t) => 0.1 + 0.9 * Math.pow(0.5 + 0.5 * Math.sin(t * 5.2 + ph), 4);
  ctx.hum = ctx.hum || [];
  ctx.hum.push({ x, z });
}

// ---------- Torre de focos portátil ----------
export function floodTower(ctx, x, z, tx, tz, shadow = true) {
  const M = ctx.M;
  const yel = M.metal(0x9a8a1e, { worn: true });
  ctx.box(yel, x, 0.25, z, 1.3, 0.9, 2.0, { surface: 'metal', tile: 1.5, cover: 'low' });
  for (const s of [-1, 1]) ctx.add(cylUV(0.3, 0.3, 0.18, 12), M.rubber, xform(x + s * 0.7, 0.3, z, 0, 0, Math.PI / 2));
  const H = 6.6;
  ctx.cyl(M.steel, x, 1.1, z, 0.07, H - 1.1, { seg: 8, collide: false });
  const yaw = Math.atan2(tx - x, tz - z);
  ctx.add(boxUV(1.7, 0.08, 0.08, 1), M.darkSteel, xform(x, H, z, 0, yaw, 0));
  const dir = new THREE.Vector3(tx - x, -H, tz - z).normalize();
  for (const s of [-0.6, 0, 0.6]) {
    const px = x + Math.cos(yaw) * s; const pz = z - Math.sin(yaw) * s;
    ctx.add(boxUV(0.5, 0.36, 0.14, 1), M.darkSteel, xform(px, H + 0.22, pz, 0.42, yaw, 0));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.3), new THREE.MeshBasicMaterial());
    panel.material.color.set(0xe4efff).multiplyScalar(34);
    panel.position.set(px + dir.x * 0.09, H + 0.2, pz + dir.z * 0.09);
    panel.rotation.set(0.42, yaw, 0, 'YXZ');
    ctx.group.add(panel);
  }
  ctx.lamp({
    x, y: H + 0.15, z, color: 0xdbe9ff, intensity: 2300, type: 'spot', range: 62, angle: 0.62, penumbra: 0.6, decay: 1.7, target: [tx, 0, tz], shadow, shadowSize: 2048,
    cone: { radius: 12, length: 24, intensity: 0.15, edge: 2.0, fall: 1.3 }, flareSize: 4.2, flareK: 2.6, strength: 1.5,
  });
}
