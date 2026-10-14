// Llaveros: colgantes procedurales que penden del arma en primera persona y se balancean con ella.
// Se eligen en la armería (src/armory.js), uno por arma, y se guardan en el navegador.
// Sólo los ve el propio jugador: no viajan por la red.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { xform } from './geo.js';
import { drumGeometry, DRUM_H } from './world/props.js';

// Catálogo, en el orden de la armería. `none` = sin llavero.
export const CHARMS = [
  { id: 'none', name: 'SIN LLAVERO' },
  { id: 'skull', name: 'CALAVERA' },
  { id: 'bullet', name: 'BALA' },
  { id: 'dice', name: 'DADO' },
  { id: 'grenade', name: 'GRANADA' },
  { id: 'duck', name: 'PATO DE GOMA' },
  { id: 'drum', name: 'BIDÓN' },
];

const STORE_KEY = 'nightfall.charms';
const SLOTS = 3; // fusil, pistola, cuchillo

// Llavero guardado para cada arma (identificadores de CHARMS).
export function loadCharms() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* sin almacenamiento o dato roto */ }
  return Array.from({ length: SLOTS }, (_, i) => (Array.isArray(saved) && CHARMS.some((c) => c.id === saved[i]) ? saved[i] : 'none'));
}

export function saveCharms(ids) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(ids)); } catch { /* sin almacenamiento */ }
}

// ---------- Modelos ----------
// Medidas reales en metros, en el espacio del arma. El origen es la anilla de la que cuelga; el cuerpo
// pende hacia -Y y da la cara a +Z, que es hacia el jugador.
const CHAIN = 0.02; // largo de la cadena

let _mat = null;
function materials() {
  if (!_mat) {
    _mat = {
      matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 1 }),
    };
  }
  return _mat;
}

// Acumula piezas pintadas por vértice y las fusiona en una malla mate y otra metálica.
function builder() {
  const lists = { matte: [], metal: [] };
  const c = new THREE.Color();
  const add = (kind, g, color, m) => {
    const k = g.index ? g.toNonIndexed() : g;
    if (m) k.applyMatrix4(m);
    const n = k.attributes.position.count;
    const col = new Float32Array(n * 3);
    c.set(color);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    k.setAttribute('color', new THREE.BufferAttribute(col, 3));
    lists[kind].push(k);
  };
  const build = () => {
    const group = new THREE.Group();
    const mat = materials();
    for (const kind of ['matte', 'metal']) {
      if (!lists[kind].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(lists[kind], false), mat[kind]);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  };
  return { add, build };
}

const STEEL = 0xb4b8bc;
const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
const ball = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// Cadena de tres eslabones y anilla de enganche, comunes a todos.
function chain(add) {
  for (let i = 0; i < 3; i++) add('metal', new THREE.TorusGeometry(0.003, 0.0007, 5, 10), STEEL, xform(0, -0.0035 - i * 0.0052, 0, 0, i % 2 ? Math.PI / 2 : 0));
  add('metal', new THREE.TorusGeometry(0.0026, 0.0007, 5, 10), STEEL, xform(0, -CHAIN, 0, 0, Math.PI / 2));
}

const BUILD = {
  skull(add) {
    const BONE = 0xd9d3c1; const HOLE = 0x0b0b0b;
    add('matte', ball(0.012, 14, 10), BONE, xform(0, -0.035, -0.001, 0, 0, 0, 1, 1.02, 1.1)); // cráneo
    add('matte', rb(0.0145, 0.009, 0.012, 0.003), BONE, xform(0, -0.0465, 0.004)); // mandíbula
    for (const sx of [-1, 1]) {
      add('matte', ball(0.0037, 8, 6), HOLE, xform(sx * 0.0048, -0.0365, 0.0108, 0, 0, 0, 1, 1.1, 0.6)); // cuencas
      add('matte', rb(0.004, 0.005, 0.004, 0.0015), BONE, xform(sx * 0.0095, -0.041, 0.004)); // pómulos
    }
    add('matte', ball(0.0017, 6, 4), HOLE, xform(0, -0.0415, 0.0122, 0, 0, 0, 1, 1.4, 0.6)); // nariz
    for (let i = -1; i <= 1; i++) add('matte', new THREE.BoxGeometry(0.0007, 0.0062, 0.001), HOLE, xform(i * 0.0034, -0.047, 0.0101)); // dientes
  },
  bullet(add) {
    // Cartucho colgado por el culote, con la punta hacia abajo.
    add('metal', lathe([[0, -0.046], [0.0036, -0.046], [0.0036, -0.043], [0.0045, -0.04], [0.0045, -0.0245], [0.0052, -0.024], [0.0052, -0.0225], [0, -0.0225]]), 0xb8923a);
    add('metal', lathe([[0, -0.0605], [0.0009, -0.06], [0.0022, -0.057], [0.0032, -0.052], [0.0035, -0.046], [0, -0.046]]), 0xb4683a);
  },
  dice(add) {
    const S = 0.016; const cy = -0.0345; const g = 0.0044; const face = S / 2;
    add('matte', rb(S, S, S, 0.003), 0xe9e5db, xform(0, cy, 0));
    // Puntos de cada cara: [eje, signo, lista de posiciones en la rejilla].
    const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [-1, 1], [1, -1], [1, 1]], 5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] };
    for (const [axis, sign, n] of [['z', 1, 5], ['z', -1, 2], ['x', 1, 3], ['x', -1, 4], ['y', 1, 1], ['y', -1, 6]]) {
      for (const [u, v] of P[n]) {
        const at = axis === 'z' ? [u * g, cy + v * g, sign * face] : axis === 'x' ? [sign * face, cy + v * g, u * g] : [u * g, cy + sign * face, v * g];
        const flat = axis === 'z' ? [1, 1, 0.35] : axis === 'x' ? [0.35, 1, 1] : [1, 0.35, 1];
        add('matte', ball(0.0015, 6, 4), 0x121212, xform(...at, 0, 0, 0, ...flat));
      }
    }
  },
  grenade(add) {
    const OLIVE = 0x46562f;
    add('matte', lathe([[0, -0.052], [0.006, -0.0505], [0.0102, -0.046], [0.0115, -0.04], [0.0102, -0.034], [0.0065, -0.03], [0.0055, -0.0285], [0, -0.0285]]), OLIVE); // cuerpo
    for (const y of [-0.0445, -0.04, -0.0355]) add('matte', new THREE.TorusGeometry(y === -0.04 ? 0.0115 : 0.0107, 0.0006, 4, 14), 0x232b18, xform(0, y, 0, Math.PI / 2)); // surcos
    add('metal', new THREE.CylinderGeometry(0.0048, 0.0052, 0.006, 10), 0x7a7d80, xform(0, -0.0258, 0)); // espoleta
    add('metal', rb(0.0045, 0.019, 0.0014, 0.0005), 0x8a8d90, xform(0, -0.0345, 0.0113, -0.22)); // palanca
    add('metal', rb(0.0045, 0.0014, 0.008, 0.0005), 0x8a8d90, xform(0, -0.0245, 0.0065));
    add('metal', new THREE.TorusGeometry(0.0036, 0.0006, 5, 10), STEEL, xform(0.0078, -0.027, 0, 0, Math.PI / 2)); // anilla del seguro
  },
  duck(add) {
    const YELLOW = 0xf0c21a;
    add('matte', ball(0.011, 14, 10), YELLOW, xform(0, -0.0445, -0.001, 0, 0, 0, 1, 0.82, 1.22)); // cuerpo
    add('matte', ball(0.0076, 12, 8), YELLOW, xform(0, -0.031, 0.0045)); // cabeza
    add('matte', ball(0.005, 8, 6), YELLOW, xform(0, -0.0405, -0.013, -0.5, 0, 0, 0.8, 0.7, 1.1)); // cola
    for (const sx of [-1, 1]) {
      add('matte', ball(0.006, 8, 6), 0xe3b414, xform(sx * 0.0098, -0.0445, -0.002, 0, 0, 0, 0.35, 0.7, 1.1)); // alas
      add('matte', ball(0.0012, 6, 4), 0x0c0c0c, xform(sx * 0.0038, -0.0295, 0.0108)); // ojos
    }
    add('matte', rb(0.0062, 0.0028, 0.0062, 0.0012), 0xe8701a, xform(0, -0.0328, 0.0128)); // pico
  },
  drum(add) {
    // El bidón explosivo del juego, en miniatura.
    const k = 0.034 / DRUM_H;
    add('matte', drumGeometry().clone(), 0xc62a1e, xform(0, -0.04, 0, 0, 0, 0, k, k, k));
    add('matte', new THREE.CylinderGeometry(0.0116, 0.0116, 0.0062, 16, 1, true), 0xe5b81e, xform(0, -0.04, 0)); // franja de aviso
    add('matte', new THREE.ConeGeometry(0.0026, 0.0052, 3), 0x121212, xform(0, -0.04, 0.0113, 0, Math.PI / 6));
  },
};

function buildCharm(id) {
  const { add, build } = builder();
  chain(add);
  BUILD[id](add);
  return build();
}

// ---------- Péndulo ----------
const LENGTH = 0.045; // de la anilla al centro del cuerpo
const GRAVITY = 9.8;
const INERTIA = 0.6; // cuánto de la aceleración del arma llega al colgante
const MAX_ACCEL = 60;
const MAX_TILT = Math.cos(1.35); // no se levanta más de ~77° respecto a la vertical del arma
const _down = new THREE.Vector3(0, -1, 0);
const _p = new THREE.Vector3(); const _v = new THREE.Vector3(); const _a = new THREE.Vector3();
const _g = new THREE.Vector3(); const _d = new THREE.Vector3();
const _qi = new THREE.Quaternion(); const _yaw = new THREE.Quaternion();

export class Charm {
  constructor(id) {
    this.id = id;
    this.group = buildCharm(id);
    this.q = new THREE.Vector3(0, -LENGTH, 0); // posición del cuerpo respecto a la anilla, en el espacio del arma
    this.u = new THREE.Vector3(); // su velocidad
    this.prev = new THREE.Vector3(); this.prevV = new THREE.Vector3(); // anilla en el mundo, el fotograma anterior
    this.fresh = true; // primer fotograma: aún no hay movimiento que medir
    this.face = 0; // giro en torno a la cadena (la armería lo pone de cara a la cámara)
  }

  // Deja el colgante quieto y a plomo (al cambiar de arma, reaparecer o abrir la armería).
  rest() { this.q.set(0, -LENGTH, 0); this.u.set(0, 0, 0); this.fresh = true; }

  // root: grupo raíz del arma (hijo directo de la cámara). anchor: punto del que cuelga, hijo de root.
  update(dt, root, anchor, camera) {
    if (dt <= 0) return;
    // Aceleración de la anilla en el mundo: es lo que sacude el colgante al girar, andar, disparar o recargar.
    _p.copy(anchor.position).multiplyScalar(root.scale.x).applyQuaternion(root.quaternion).add(root.position)
      .applyQuaternion(camera.quaternion).add(camera.position);
    if (this.fresh) this.prev.copy(_p);
    _v.copy(_p).sub(this.prev).divideScalar(dt);
    if (this.fresh) { this.fresh = false; this.prevV.copy(_v); }
    _a.copy(_v).sub(this.prevV).divideScalar(dt).multiplyScalar(INERTIA);
    const al = _a.length();
    if (al > MAX_ACCEL) _a.multiplyScalar(MAX_ACCEL / al);
    this.prev.copy(_p); this.prevV.copy(_v);

    // Gravedad aparente (la real menos la aceleración de la anilla), llevada al espacio del arma.
    _g.copy(_down).multiplyScalar(GRAVITY).sub(_a);
    _g.applyQuaternion(_qi.copy(camera.quaternion).multiply(root.quaternion).invert());

    // Masa puntual atada a la anilla, en dos pasos por fotograma para que no se desboque.
    const h = Math.min(dt, 0.05) / 2;
    for (let i = 0; i < 2; i++) {
      this.u.addScaledVector(_g, h);
      this.u.multiplyScalar(Math.exp(-h * 3.2));
      this.q.addScaledVector(this.u, h);
      this.q.multiplyScalar(LENGTH / (this.q.length() || 1));
      this.u.addScaledVector(this.q, -this.u.dot(this.q) / (LENGTH * LENGTH)); // sin velocidad a lo largo de la cadena
      // Tope: no pasa de cierto ángulo respecto a la vertical del arma, para no atravesarla.
      if (-this.q.y / LENGTH < MAX_TILT) {
        const k = (LENGTH * Math.sqrt(1 - MAX_TILT * MAX_TILT)) / (Math.hypot(this.q.x, this.q.z) || 1);
        this.q.set(this.q.x * k, -LENGTH * MAX_TILT, this.q.z * k);
        this.u.multiplyScalar(0.4);
      }
    }

    _d.copy(this.q).normalize();
    this.group.quaternion.setFromUnitVectors(_down, _d).multiply(_yaw.setFromAxisAngle(_down, -this.face));
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}
