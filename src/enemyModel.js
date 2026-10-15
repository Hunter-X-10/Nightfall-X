// Soldado procedural: una sola SkinnedMesh por soldado (1 draw call), con codos, rodillas y cintura que
// doblan con mezcla de dos huesos, y pose procedural: marcha, agachado, apuntado con IK de brazos, impacto y caída.
// Hay una geometría por aspecto (guardia, ALFA, BRAVO) y por arma en mano (fusil, pistola, cuchillo).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { xform } from './geo.js';
import { smoothstep } from './utils.js';

// Huesos: [nombre, padre, x, y, z] en espacio de modelo (mirando a +Z, derecha = -X).
const BONES = [
  ['root', -1, 0, 0, 0], ['pelvis', 0, 0, 0.95, 0], ['spine', 1, 0, 1.08, 0], ['head', 2, 0, 1.52, 0],
  ['armL', 2, 0.21, 1.42, 0], ['foreL', 4, 0.21, 1.13, 0], ['armR', 2, -0.21, 1.42, 0], ['foreR', 6, -0.21, 1.13, 0],
  ['thighL', 1, 0.1, 0.93, 0], ['shinL', 8, 0.1, 0.5, 0], ['thighR', 1, -0.1, 0.93, 0], ['shinR', 10, -0.1, 0.5, 0],
  ['gun', 2, 0, 1.08, 0],
];
const B = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
// Asomarse: desplazamiento lateral de la cadera (m) y giro del torso (rad) con lean = ±1. Con la cabeza a
// 0,57 m del pivote de la columna, la cabeza se aparta 0,38 m (LEAN_DIST de player.js).
export const LEAN_HIP = 0.15;
export const LEAN_SPINE = 0.42;
// Deslizamiento (slide = 1): altura de la cadera (m) y torso echado hacia atrás (rad). Las cápsulas de
// impacto de remotePlayers.raycast usan las mismas constantes.
export const SLIDE_HIP = 0.42;
export const SLIDE_BACK = 0.3;
export const ARM_UP = 0.29;
export const ARM_FORE = 0.3;
// Remate con el cuchillo por la espalda (segundos desde que se agarra a la víctima): el atacante clava el
// cuchillo en TAKEDOWN_STAB y recupera el control en TAKEDOWN_TIME; la víctima cae desde TAKEDOWN_FALL.
export const TAKEDOWN_STAB = 0.52;
export const TAKEDOWN_TIME = 1.2;
const TAKEDOWN_FALL = 0.95;

// Aspectos: 0 guardia de la misión (IA), 1 ALFA (operador táctico), 2 BRAVO (insurgente).
// `accent` es el color del equipo: sólo va en parches, brazalete y pañuelo.
const BLACK = 0x0d0e0f; const GUN = 0x111214; const FDE = 0x6f6046; const STEEL = 0x8d9297; const FACE = 0x9a7458;
const LOOKS = [
  { tactical: true, uni: 0x3d4434, pants: 0x3d4434, vest: 0x23261f, helm: 0x2e3328, mask: 0x15171a, boot: BLACK, glove: BLACK, finger: BLACK, accent: 0x5a5c44 },
  { tactical: true, uni: 0x1e2a3c, pants: 0x1e2a3c, vest: 0x14181e, helm: 0x1a2029, mask: 0x101215, boot: BLACK, glove: BLACK, finger: BLACK, accent: 0x2b78d8 },
  { tactical: false, uni: 0x6a5a3c, pants: 0x34362b, vest: 0x35301f, helm: 0x1c1d1f, mask: 0x121315, boot: 0x3b2b1d, glove: 0x1c1d1f, finger: FACE, accent: 0xc2351f, scarf: 0x8f2518 },
];

// Tubo de sección elíptica: anillos [y, rx, rz, cx, cz] de abajo arriba, con normales suaves.
function tube(rings, seg = 12, caps = true) {
  const cols = seg + 1;
  const pos = []; const uv = []; const idx = [];
  for (const [y, rx, rz, cx = 0, cz = 0] of rings) {
    for (let i = 0; i < cols; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
      uv.push((i / seg) * 2, y * 3);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * cols + i; const c = a + cols;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  side.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  side.setIndex(idx);
  side.computeVertexNormals();
  const n = side.attributes.normal;
  for (let j = 0; j < rings.length; j++) { // costura: la primera y la última columna comparten normal
    const a = j * cols; const b = a + seg;
    _a.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, _a.x, _a.y, _a.z); n.setXYZ(b, _a.x, _a.y, _a.z);
  }
  const parts = [side.toNonIndexed()];
  if (caps) {
    for (const [ring, rot] of [[rings[0], Math.PI / 2], [rings[rings.length - 1], -Math.PI / 2]]) {
      const [y, rx, rz, cx = 0, cz = 0] = ring;
      parts.push(new THREE.CircleGeometry(1, seg).rotateX(rot).scale(rx, 1, rz).translate(cx, y, cz).toNonIndexed());
    }
  }
  return parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
}

const _geos = [];
// weapon: 0 fusil, 1 pistola, 2 cuchillo. look: índice de LOOKS.
export function soldierGeometry(weapon = 0, look = 0) {
  const key = look * 3 + weapon;
  if (_geos[key]) return _geos[key];
  const L = LOOKS[look];
  const parts = [];
  const c = new THREE.Color();
  // skin: un hueso, o [hueso de arriba, hueso de abajo, altura de la articulación, mitad del tramo de mezcla].
  // color: un color, o una función (x, y, z) del centro de cada triángulo.
  const add = (g, skin, color, m) => {
    const k = g.index ? g.toNonIndexed() : g;
    if (m) k.applyMatrix4(m);
    const p = k.attributes.position;
    const n = p.count;
    const col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i += 3) {
      c.set(typeof color === 'function'
        ? color((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3)
        : color);
      for (let v = i; v < i + 3; v++) col.set([c.r, c.g, c.b], v * 3);
    }
    for (let i = 0; i < n; i++) {
      if (Array.isArray(skin)) {
        const [up, lo, y, half] = skin;
        const w = smoothstep(y - half, y + half, p.getY(i));
        si[i * 4] = up; si[i * 4 + 1] = lo; sw[i * 4] = w; sw[i * 4 + 1] = 1 - w;
      } else { si[i * 4] = skin; sw[i * 4] = 1; }
    }
    k.setAttribute('color', new THREE.BufferAttribute(col, 3));
    k.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    k.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    parts.push(k);
  };
  const rb = (w, h, d, r = 0.02, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
  const ball = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
  const ring = (y0, y1, rx, rz, cx = 0, cz = 0, seg = 16) => tube([[y0, rx, rz, cx, cz], [y1, rx, rz, cx, cz]], seg, false);
  const k = L.tactical ? 1 : 1.07; // holgura de la ropa de calle

  // --- Tronco: una pieza de la entrepierna al cuello, que dobla por la cintura ---
  add(tube([[0.86, 0.1, 0.085], [0.9, 0.16, 0.105], [0.97, 0.172, 0.112], [1.04, 0.158, 0.104], [1.1, 0.156 * k, 0.104 * k], [1.2, 0.172 * k, 0.114 * k],
    [1.32, 0.192 * k, 0.124 * k, 0, 0.004], [1.4, 0.196 * k, 0.118 * k], [1.45, 0.16 * k, 0.1 * k], [1.49, 0.075, 0.07]], 16),
  [B.spine, B.pelvis, 1.08, 0.05], (x, y) => (y < 1.0 ? L.pants : L.uni));

  // --- Cuello y cabeza ---
  add(tube([[1.46, 0.056, 0.058], [1.52, 0.052, 0.055], [1.58, 0.054, 0.058, 0, 0.004]], 10), [B.head, B.spine, 1.52, 0.03], L.mask);
  add(ball(0.1, 16, 12), B.head, L.mask, xform(0, 1.645, 0.006, 0, 0, 0, 0.93, 1.14, 1.03)); // pasamontañas
  add(ball(0.072), B.head, L.mask, xform(0, 1.588, 0.03, 0, 0, 0, 0.98, 0.85, 1)); // mandíbula
  add(rb(0.026, 0.04, 0.03, 0.012), B.head, L.mask, xform(0, 1.612, 0.1)); // nariz

  // --- Brazos: una pieza del hombro a la muñeca, que dobla por el codo ---
  for (const [arm, fore, sx] of [[B.armL, B.foreL, 1], [B.armR, B.foreR, -1]]) {
    const x = sx * 0.21;
    add(tube([[0.875, 0.036, 0.04, x], [0.93, 0.042, 0.046, x], [1.05, 0.05, 0.054, x], [1.13, 0.047, 0.051, x], [1.2, 0.053 * k, 0.057 * k, x],
      [1.32, 0.059 * k, 0.063 * k, x], [1.42, 0.058 * k, 0.062 * k, x]], 10), [arm, fore, 1.13, 0.045], L.uni);
    add(ball(0.066 * k), arm, L.uni, xform(x, 1.42, 0, 0, 0, 0, 1, 0.95, 1.02)); // hombro
    add(ball(0.049), fore, L.uni, xform(x, 1.13, -0.004)); // codo
    // Mano cerrada: puño, nudillos y pulgar.
    add(ring(0.868, 0.9, 0.041, 0.045, x, 0, 10), fore, L.glove);
    add(rb(0.066, 0.088, 0.08, 0.026), fore, L.glove, xform(x, 0.838, 0.004));
    for (let i = 0; i < 4; i++) add(rb(0.064, 0.02, 0.03, 0.009), fore, L.finger, xform(x, 0.868 - i * 0.021, 0.036));
    add(rb(0.024, 0.06, 0.03, 0.011), fore, L.finger, xform(x - sx * 0.036, 0.85, 0.022, 0, 0, sx * 0.3));
  }

  // --- Piernas: una pieza de la cadera al tobillo, que dobla por la rodilla ---
  for (const [thigh, shin, sx] of [[B.thighL, B.shinL, 1], [B.thighR, B.shinR, -1]]) {
    const x = sx * 0.1;
    add(tube([[0.2, 0.054 * k, 0.06 * k, x], [0.34, 0.064 * k, 0.072 * k, x, -0.008], [0.46, 0.058 * k, 0.064 * k, x], [0.5, 0.06 * k, 0.066 * k, x, 0.004],
      [0.56, 0.066 * k, 0.07 * k, x, 0.004], [0.72, 0.08 * k, 0.086 * k, x], [0.86, 0.088 * k, 0.094 * k, x], [0.93, 0.088 * k, 0.094 * k, x]], 12),
    [thigh, shin, 0.5, 0.05], L.pants);
    add(ball(0.09), thigh, L.pants, xform(x, 0.93, 0, 0, 0, 0, 1, 1, 1.05)); // cadera
    add(ball(0.063 * k), shin, L.pants, xform(x, 0.5, 0.002)); // rodilla
    // Bota: caña, pantalón recogido, pie y suela.
    add(tube([[0.06, 0.056, 0.064, x], [0.2, 0.058, 0.066, x], [0.235, 0.06, 0.068, x]], 10), shin, L.boot);
    add(tube([[0.2, 0.064 * k, 0.072 * k, x], [0.24, 0.07 * k, 0.078 * k, x], [0.28, 0.06 * k, 0.068 * k, x]], 12, false), shin, L.pants);
    add(rb(0.1, 0.078, 0.26, 0.032, 2), shin, L.boot, xform(x, 0.062, 0.05));
    add(rb(0.106, 0.028, 0.272, 0.01), shin, BLACK, xform(x, 0.014, 0.05));
  }

  if (L.tactical) {
    // Casco de corte alto con raíles, soporte de visor, auriculares con micrófono y gafas.
    add(new THREE.SphereGeometry(0.128, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.55), B.head, L.helm, xform(0, 1.688, -0.004, -0.1, 0, 0, 1, 1.02, 1.1));
    for (const sx of [-1, 1]) {
      add(rb(0.014, 0.028, 0.12, 0.006), B.head, BLACK, xform(sx * 0.128, 1.694, -0.005));
      add(rb(0.034, 0.085, 0.072, 0.02), B.head, BLACK, xform(sx * 0.108, 1.64, -0.004));
    }
    add(rb(0.05, 0.045, 0.022, 0.008), B.head, BLACK, xform(0, 1.742, 0.126, 0.35));
    add(rb(0.07, 0.034, 0.01, 0.004), B.head, L.accent, xform(0, 1.71, -0.143, 0.12)); // distintivo en la nuca
    add(rb(0.008, 0.008, 0.09, 0.003), B.head, BLACK, xform(0.085, 1.6, 0.055, 0, -0.5));
    add(ring(1.626, 1.654, 0.097, 0.107, 0, 0.006), B.head, BLACK); // cinta de las gafas
    add(rb(0.16, 0.052, 0.045, 0.02, 2), B.head, 0x1d2630, xform(0, 1.64, 0.084));
    // Portaplacas: faja, placas, hombreras, portacargadores, radio y mochila.
    add(tube([[1.1, 0.172, 0.118], [1.26, 0.19, 0.128]], 16, false), B.spine, L.vest);
    add(rb(0.31, 0.33, 0.07, 0.035, 2), B.spine, L.vest, xform(0, 1.275, 0.105));
    add(rb(0.31, 0.35, 0.07, 0.035), B.spine, L.vest, xform(0, 1.28, -0.1));
    for (const sx of [-1, 1]) add(rb(0.06, 0.035, 0.22, 0.015), B.spine, L.vest, xform(sx * 0.115, 1.462, 0));
    for (const x of [-0.1, 0, 0.1]) {
      add(rb(0.085, 0.13, 0.045, 0.012), B.spine, L.vest, xform(x, 1.185, 0.158));
      add(rb(0.06, 0.04, 0.026, 0.006), B.spine, GUN, xform(x, 1.262, 0.158));
    }
    add(rb(0.15, 0.07, 0.03, 0.01), B.spine, L.vest, xform(0, 1.365, 0.15));
    add(rb(0.07, 0.036, 0.008, 0.003), B.spine, L.accent, xform(0, 1.365, 0.166));
    add(rb(0.05, 0.11, 0.035, 0.01), B.spine, BLACK, xform(0.125, 1.335, 0.14));
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), B.spine, BLACK, xform(0.14, 1.46, 0.135));
    add(rb(0.25, 0.3, 0.09, 0.035), B.spine, L.vest, xform(0, 1.28, -0.175));
    add(rb(0.2, 0.08, 0.07, 0.025), B.spine, L.vest, xform(0, 1.42, -0.16));
    add(rb(0.1, 0.04, 0.008, 0.003), B.spine, L.accent, xform(0, 1.36, -0.222));
    // Cinturón con bolsas y funda de muslo con su pistola.
    add(ring(1.005, 1.06, 0.178, 0.118), B.pelvis, BLACK);
    add(rb(0.05, 0.04, 0.012, 0.004), B.pelvis, 0x2a2c2e, xform(0, 1.032, 0.118));
    add(rb(0.07, 0.09, 0.04, 0.012), B.pelvis, L.vest, xform(0.135, 0.99, 0.085, 0, 0.5));
    add(rb(0.1, 0.11, 0.05, 0.02), B.pelvis, L.vest, xform(0.1, 0.975, -0.115));
    add(ring(0.765, 0.795, 0.09, 0.096, -0.1, 0, 12), B.thighR, BLACK);
    add(rb(0.045, 0.17, 0.085, 0.015), B.thighR, BLACK, xform(-0.197, 0.79, 0.01));
    add(rb(0.03, 0.05, 0.04, 0.008), B.thighR, GUN, xform(-0.2, 0.892, -0.012, 0.25));
    // Parches de hombro, coderas y rodilleras.
    for (const [arm, fore, sx] of [[B.armL, B.foreL, 1], [B.armR, B.foreR, -1]]) {
      add(rb(0.008, 0.06, 0.06, 0.003), arm, L.accent, xform(sx * 0.269, 1.33, 0));
      add(rb(0.07, 0.075, 0.05, 0.02), fore, L.vest, xform(sx * 0.21, 1.105, -0.035));
    }
    for (const [shin, sx] of [[B.shinL, 1], [B.shinR, -1]]) {
      add(rb(0.1, 0.11, 0.05, 0.022), shin, L.vest, xform(sx * 0.1, 0.49, 0.052));
      add(rb(0.07, 0.07, 0.02, 0.008), shin, BLACK, xform(sx * 0.1, 0.495, 0.078));
    }
  } else {
    // Abertura del pasamontañas con los ojos, gorro de lana con vuelta y pañuelo del color del equipo tapando media cara.
    add(new THREE.SphereGeometry(0.1, 12, 4, Math.PI / 2 - 1.15, 2.3, 1.28, 0.62), B.head, FACE, xform(0, 1.645, 0.006, 0, 0, 0, 0.945, 1.155, 1.045));
    for (const sx of [-1, 1]) {
      add(rb(0.024, 0.011, 0.012, 0.004), B.head, BLACK, xform(sx * 0.034, 1.642, 0.1));
      add(rb(0.036, 0.008, 0.012, 0.003), B.head, 0x2a1c12, xform(sx * 0.035, 1.657, 0.1, 0, 0, sx * -0.12));
    }
    add(new THREE.SphereGeometry(0.108, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), B.head, L.helm, xform(0, 1.68, 0, 0, 0, 0, 0.97, 1.1, 1.05));
    add(tube([[1.662, 0.103, 0.112], [1.672, 0.107, 0.116], [1.694, 0.106, 0.115]], 16, false), B.head, L.helm);
    add(tube([[1.455, 0.1, 0.092, 0, 0.004], [1.5, 0.108, 0.1, 0, 0.006], [1.55, 0.09, 0.094, 0, 0.012], [1.6, 0.082, 0.088, 0, 0.022], [1.616, 0.074, 0.08, 0, 0.022]], 14),
      [B.head, B.spine, 1.52, 0.035], L.scarf);
    add(rb(0.1, 0.1, 0.016, 0.006), B.spine, L.scarf, xform(0, 1.445, 0.116, 0.2, 0, Math.PI / 4)); // pico del pañuelo sobre el pecho
    add(rb(0.05, 0.04, 0.04, 0.015), B.spine, L.scarf, xform(0.03, 1.5, -0.1)); // nudo
    // Chaqueta: faldón que cae sobre la cadera.
    add(tube([[0.93, 0.186, 0.124], [1.0, 0.18, 0.12], [1.09, 0.17, 0.114]], 16, false), [B.spine, B.pelvis, 1.08, 0.05], L.uni);
    // Arnés de pecho con tres cargadores, tirantes y bandolera.
    add(ring(1.15, 1.19, 0.186, 0.126), B.spine, L.vest);
    add(rb(0.3, 0.17, 0.05, 0.02, 2), B.spine, L.vest, xform(0, 1.215, 0.128));
    for (const x of [-0.1, 0, 0.1]) {
      add(rb(0.08, 0.15, 0.04, 0.012), B.spine, 0x2a2619, xform(x, 1.225, 0.16));
      add(rb(0.055, 0.05, 0.024, 0.006), B.spine, 0x5e3319, xform(x, 1.31, 0.158, 0.15));
    }
    for (const sx of [-1, 1]) {
      add(rb(0.04, 0.26, 0.012, 0.005), B.spine, L.vest, xform(sx * 0.1, 1.37, 0.13, -0.12));
      add(rb(0.04, 0.03, 0.2, 0.01), B.spine, L.vest, xform(sx * 0.1, 1.47, 0));
      add(rb(0.04, 0.34, 0.012, 0.005), B.spine, L.vest, xform(sx * 0.1, 1.3, -0.128, 0.05));
    }
    add(rb(0.2, 0.22, 0.08, 0.03, 2), B.spine, 0x2c2a22, xform(0, 1.27, -0.165));
    add(ring(1.285, 1.33, 0.067, 0.071, 0.21, 0, 10), B.armL, L.accent); // brazalete
    for (const [thigh, sx] of [[B.thighL, 1], [B.thighR, -1]]) add(rb(0.03, 0.13, 0.1, 0.012), thigh, 0x3e4034, xform(sx * 0.19, 0.74, 0)); // bolsillos
  }

  // --- Arma (hueso "gun"; origen del hueso = empuñadura, cañón u hoja hacia +Z) ---
  const G = (g, x, y, z, rx = 0, color = GUN) => add(g, B.gun, color, xform(x, 1.08 + y, z, rx));
  const cylZ = (r0, r1, len, seg = 8) => new THREE.CylinderGeometry(r1, r0, len, seg);
  if (weapon === 1) {
    G(rb(0.03, 0.03, 0.19, 0.006), 0, 0.047, 0.075); // corredera
    G(rb(0.028, 0.02, 0.15, 0.005), 0, 0.024, 0.065); // armazón
    G(rb(0.03, 0.105, 0.046, 0.01), 0, -0.02, 0.0, 0.25); // empuñadura
    G(rb(0.012, 0.008, 0.05, 0.003), 0, -0.006, 0.065); // guardamonte
    G(rb(0.012, 0.03, 0.008, 0.003), 0, 0.008, 0.09);
    G(rb(0.006, 0.008, 0.008, 0.002), 0, 0.066, 0.16); // punto de mira
    G(rb(0.014, 0.008, 0.008, 0.002), 0, 0.066, -0.01); // alza
  } else if (weapon === 2) {
    // Hoja: perfil lateral extruido (x = largo, y = alto), girado para que apunte hacia +Z.
    const s = new THREE.Shape();
    s.moveTo(0, -0.016); s.lineTo(0.14, -0.016); s.quadraticCurveTo(0.19, -0.014, 0.21, 0.01);
    s.lineTo(0.15, 0.016); s.lineTo(0.135, 0.02); s.lineTo(0, 0.02); s.closePath();
    const blade = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false });
    blade.translate(0, 0, -0.003); blade.rotateY(-Math.PI / 2);
    G(blade, 0, 0.012, 0.065, 0, STEEL);
    G(rb(0.016, 0.07, 0.016, 0.004), 0, 0.012, 0.055); // guarda
    G(rb(0.03, 0.036, 0.12, 0.01), 0, 0.008, -0.01); // mango
  } else {
    G(rb(0.042, 0.05, 0.24, 0.01), 0, 0.055, 0.09); // cajón superior
    G(rb(0.038, 0.045, 0.17, 0.01), 0, 0.012, 0.07); // cajón inferior
    G(rb(0.036, 0.06, 0.06, 0.008), 0, -0.02, 0.13); // brocal
    G(rb(0.028, 0.09, 0.052, 0.008), 0, -0.085, 0.137, -0.12); // cargador, en dos tramos curvos
    G(rb(0.028, 0.08, 0.052, 0.008), 0, -0.155, 0.153, -0.3);
    G(rb(0.03, 0.095, 0.042, 0.01), 0, -0.045, -0.005, 0.3, FDE); // empuñadura
    G(cylZ(0.014, 0.014, 0.2), 0, 0.05, -0.13, Math.PI / 2); // tubo de la culata
    G(rb(0.04, 0.075, 0.13, 0.012), 0, 0.035, -0.21, 0, FDE);
    G(rb(0.036, 0.05, 0.06, 0.01), 0, -0.012, -0.245, 0, FDE);
    G(rb(0.042, 0.115, 0.015, 0.005), 0, 0.02, -0.282);
    G(cylZ(0.027, 0.027, 0.27), 0, 0.052, 0.355, Math.PI / 2, FDE); // guardamanos
    G(rb(0.02, 0.008, 0.44, 0.003), 0, 0.084, 0.2); // raíl
    G(rb(0.026, 0.07, 0.03, 0.008), 0, -0.005, 0.33, 0, FDE); // empuñadura delantera
    G(rb(0.03, 0.012, 0.06, 0.004), 0, 0.094, 0.09); // mira holográfica
    G(rb(0.038, 0.04, 0.045, 0.006), 0, 0.12, 0.09);
    G(cylZ(0.009, 0.009, 0.14), 0, 0.052, 0.55, Math.PI / 2); // cañón y bocacha
    G(cylZ(0.013, 0.012, 0.06), 0, 0.052, 0.65, Math.PI / 2);
    G(cylZ(0.016, 0.016, 0.08), 0.035, 0.045, 0.42, Math.PI / 2); // linterna
  }

  const geo = mergeGeometries(parts, false);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius = 2.2;
  _geos[key] = geo;
  return geo;
}

let _mat = null;
function soldierMaterial(surf) {
  if (!_mat) {
    _mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, normalMap: surf.tarp.normalMap });
    _mat.normalScale.set(0.6, 0.6);
  }
  return _mat;
}

const _down = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3(); const _t = new THREE.Vector3();
const _q1 = new THREE.Quaternion(); const _q2 = new THREE.Quaternion();
const _grip = new THREE.Vector3(); const _hand = new THREE.Vector3(); const _gq = new THREE.Quaternion(); const _ge = new THREE.Euler();

// IK de dos huesos (hombro -> mano) en el espacio local de la columna.
function solveArm(upper, fore, sx, sy, sz, target, poleX, poleY, poleZ) {
  _a.set(target.x - sx, target.y - sy, target.z - sz);
  let d = _a.length();
  const max = ARM_UP + ARM_FORE - 0.005;
  if (d > max) { _a.multiplyScalar(max / d); d = max; }
  _a.divideScalar(d);
  const x = (ARM_UP * ARM_UP - ARM_FORE * ARM_FORE + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ARM_UP * ARM_UP - x * x));
  _b.set(poleX, poleY, poleZ).addScaledVector(_a, -_a.dot(_b.set(poleX, poleY, poleZ))).normalize(); // polo ⟂ al eje
  _c.copy(_a).multiplyScalar(x).addScaledVector(_b, h); // codo relativo al hombro
  _t.copy(_a).multiplyScalar(d).sub(_c).normalize();
  _c.normalize();
  upper.quaternion.setFromUnitVectors(_down, _c);
  _q1.copy(upper.quaternion).invert();
  fore.quaternion.copy(_q1).multiply(_q2.setFromUnitVectors(_down, _t));
}

export function createSoldier(surf, look = 0) {
  const bones = BONES.map(([name]) => { const b = new THREE.Bone(); b.name = name; return b; });
  BONES.forEach(([, parent, x, y, z], i) => {
    if (parent < 0) bones[i].position.set(x, y, z);
    else { const p = BONES[parent]; bones[i].position.set(x - p[2], y - p[3], z - p[4]); bones[parent].add(bones[i]); }
  });
  const mesh = new THREE.SkinnedMesh(soldierGeometry(0, look), soldierMaterial(surf));
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const bone = Object.fromEntries(bones.map((b) => [b.name, b]));
  return { mesh, bone };
}

// Pose de la víctima de un remate, `t` segundos después de agarrarla: la echan hacia atrás (grab), se
// desploma tras la puñalada (slump) y cae de bruces. Quien llama pone a 0 la marcha, el apuntado y el agachado.
export function takedownPose(p, t) {
  p.grab = smoothstep(0.1, 0.38, t) * (1 - smoothstep(0.75, 1.05, t));
  p.slump = smoothstep(0.58, 1.0, t);
  p.death = Math.min(1, Math.max(0, (t - TAKEDOWN_FALL) / 0.75));
  p.deathDir = -1; p.deathTwist = 0.2;
  p.flinchX = 0; p.flinchY = 0;
}

// Aplica la pose. p: { phase, walk, crouch, aim, aimPitch, flinchX, flinchY, death, deathDir, lean }
// Opcionales: weapon (0 fusil, 1 pistola, 2 cuchillo) y swing (avance 0-1 del tajo), de los jugadores;
// grab y slump (0-1), de la víctima de un remate (ver takedownPose). Sólo se usan en soldados que ya no
// reciben disparos, así que no cambian las zonas de impacto. slide (0-1, deslizándose), de los jugadores:
// éste sí las cambia (ver SLIDE_HIP y SLIDE_BACK). vault (0-1, trepando), de los jugadores: piernas recogidas
// como al agacharse (sus cápsulas son las de agachado) y la mano izquierda apoyada en el obstáculo.
export function poseSoldier(s, p) {
  const b = s.bone;
  const sw = Math.sin(p.phase);
  const walk = p.walk;
  const cr = p.crouch;
  const grab = p.grab || 0; const slump = p.slump || 0;
  const vt = p.vault || 0;
  const knee = Math.max(cr, slump * 0.55, vt); // al desplomarse se le doblan las rodillas; al trepar, se recogen
  // Piernas: marcha + flexión al agacharse.
  const thigh = -knee * 1.15;
  const shin = knee * 2.05;
  b.thighL.rotation.x = thigh + sw * 0.62 * walk;
  b.thighR.rotation.x = thigh - sw * 0.62 * walk;
  b.shinL.rotation.x = shin + Math.max(0, -Math.cos(p.phase)) * 0.95 * walk;
  b.shinR.rotation.x = shin + Math.max(0, Math.cos(p.phase)) * 0.95 * walk;
  b.thighL.rotation.z = knee * 0.12; b.thighR.rotation.z = -knee * 0.12;
  b.pelvis.position.y = 0.95 - knee * 0.4 + Math.abs(Math.cos(p.phase)) * 0.035 * walk;
  b.pelvis.rotation.y = sw * 0.09 * walk;
  // Deslizamiento: pierna derecha estirada por delante y la izquierda doblada debajo, con la rodilla en el
  // suelo; la cadera baja a SLIDE_HIP.
  const sl = p.slide || 0;
  if (sl > 0) {
    b.thighR.rotation.x += (-1.2 - b.thighR.rotation.x) * sl; b.shinR.rotation.x += (0.15 - b.shinR.rotation.x) * sl;
    b.thighL.rotation.x += (-0.55 - b.thighL.rotation.x) * sl; b.shinL.rotation.x += (2.3 - b.shinL.rotation.x) * sl;
    b.thighL.rotation.z += (0.25 - b.thighL.rotation.z) * sl; b.thighR.rotation.z += (-0.05 - b.thighR.rotation.z) * sl;
    b.pelvis.position.y += (SLIDE_HIP - b.pelvis.position.y) * sl;
  }
  // Asomarse (lean -1 izquierda, 1 derecha): la cadera se aparta y el torso se inclina hacia ese lado.
  // El modelo mira a +Z, así que su derecha es -X. Las cápsulas de impacto usan LEAN_HIP y LEAN_SPINE.
  b.pelvis.position.x = -p.lean * LEAN_HIP;
  // Torso: inclinación al correr, apuntado vertical y sacudida por impacto.
  // Remate: arqueado hacia atrás con la cabeza levantada al agarrarlo; luego se vence hacia delante.
  b.spine.rotation.set(0.1 * walk + cr * 0.28 * (1 - sl) - sl * SLIDE_BACK + vt * 0.25 - p.aimPitch * p.aim * 0.75 + p.flinchX - grab * 0.3 + slump * 0.32,
    -sw * 0.11 * walk + p.flinchY + p.aim * -0.22, p.lean * LEAN_SPINE);
  b.head.rotation.set(-cr * 0.2 * (1 - sl) + sl * SLIDE_BACK - p.aimPitch * p.aim * 0.2 - 0.1 * walk - grab * 0.55 + slump * 0.75,
    (p.aim * 0.2 + (1 - p.aim) * Math.sin(p.look) * 0.5) * (1 - Math.max(grab, slump)), 0);

  const a = p.aim;
  const weapon = p.weapon || 0;
  if (weapon === 1) {
    // Pistola: baja y apuntando al suelo en reposo; a dos manos y brazos extendidos al apuntar.
    _grip.set(-0.12 + a * 0.09, 0.0 + a * 0.3, 0.2 + a * 0.24);
    _ge.set((1 - a) * 0.95 + sw * 0.03 * walk, (1 - a) * 0.25 + a * 0.2, 0);
  } else if (weapon === 2) {
    // Cuchillo: adelantado en la derecha; el tajo lo lleva al frente cruzando hacia el centro.
    const cut = Math.sin(Math.PI * (p.swing || 0));
    _grip.set(-0.2 + cut * 0.17, 0.06 + a * 0.08 + cut * 0.08, 0.24 + a * 0.04 + cut * 0.24);
    _ge.set(-0.25 + (1 - a) * 0.5 - cut * 0.2, 0.25 + cut * 0.7, 0);
  } else {
    // Fusil: mezcla entre "listo" (cruzado al pecho) y "apuntando".
    _grip.set(-0.13 + a * 0.01, 0.1 + a * 0.16, 0.2 + a * 0.07);
    _ge.set((1 - a) * 0.62 + sw * 0.03 * walk, (1 - a) * 0.72 + a * 0.2, (1 - a) * 0.25);
  }
  // Deslizamiento: el arma no sigue al torso echado hacia atrás, sigue apuntando al frente.
  _ge.x += sl * SLIDE_BACK;
  // Remate: el arma se le cae hacia abajo, colgando de la mano derecha.
  const drop = Math.max(grab, slump);
  if (drop > 0) {
    _grip.lerp(_t.set(-0.17, -0.2, 0.14), drop);
    _ge.set(_ge.x + (1.25 - _ge.x) * drop, _ge.y * (1 - drop), _ge.z * (1 - drop));
  }
  _gq.setFromEuler(_ge);
  b.gun.position.copy(_grip);
  b.gun.quaternion.copy(_gq);
  // Manos sobre el arma: derecha en la empuñadura; izquierda en el guardamanos, de apoyo o en guardia.
  _hand.set(0, -0.03, 0).applyQuaternion(_gq).add(_grip);
  solveArm(b.armR, b.foreR, -0.21, 0.34, 0, _hand, -0.5, -1, -0.3);
  if (weapon === 2) _hand.set(0.17, 0.08 + a * 0.06, 0.26);
  else _hand.set(weapon === 1 ? 0.035 : 0, weapon === 1 ? -0.05 : 0, weapon === 1 ? 0.0 : 0.34).applyQuaternion(_gq).add(_grip);
  // Remate: la izquierda va al cuello al agarrarlo y después cuelga.
  if (grab > 0) _hand.lerp(_t.set(0.05, 0.4, 0.13), grab);
  if (slump > 0) _hand.lerp(_t.set(0.26, -0.12, 0.06), slump);
  // Trepando: la izquierda baja a apoyarse en el obstáculo.
  if (vt > 0) _hand.lerp(_t.set(0.2, -0.2, 0.38), vt);
  solveArm(b.armL, b.foreL, 0.21, 0.34, 0, _hand, 0.7, -1, 0.1);

  // Caída al morir: el cuerpo gira sobre los pies y las extremidades se sueltan.
  if (p.death > 0) {
    const d = p.death;
    const ease = 1 - (1 - d) * (1 - d);
    b.root.rotation.set(-ease * 1.5 * p.deathDir, 0, ease * p.deathTwist * 0.4);
    b.root.position.y = ease * 0.16;
    b.spine.rotation.x += -0.35 * ease * p.deathDir;
    b.head.rotation.x += -0.3 * ease * p.deathDir;
    b.thighL.rotation.x = thigh * (1 - ease) + 0.35 * ease; b.thighR.rotation.x = thigh * (1 - ease) - 0.15 * ease;
    b.shinL.rotation.x = shin * (1 - ease) + 0.5 * ease; b.shinR.rotation.x = shin * (1 - ease) + 0.15 * ease;
    b.pelvis.position.y = 0.95 - knee * 0.4 * (1 - ease);
    b.armL.rotation.z -= ease * 0.9; b.armR.rotation.z += ease * 0.7;
  } else {
    b.root.rotation.set(0, 0, 0);
    b.root.position.y = 0;
  }
}
