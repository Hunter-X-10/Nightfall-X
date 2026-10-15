// Modelos procedurales de las armas en primera persona: carabina con mira holográfica y linterna,
// pistola compacta y cuchillo de combate, cada uno con sus manos, más una mano izquierda libre para los
// remates con el cuchillo, y las vendas y el botiquín de las partidas en línea. Las piezas con forma (cajón, cargador,
// empuñaduras, culata, armazón) son siluetas laterales extruidas; los dedos, cadenas de cilindros.
// Unidades reales en metros; el grupo raíz se escala y cuelga de la cámara. -Z = hacia delante.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { xform } from './geo.js';
import { grainCanvas, heightToNormal, tex } from './textures.js';

export const SIGHT_Y = 0.097; // altura del eje de la mira del fusil sobre el origen del arma
export const PISTOL_SIGHT_Y = 0.049; // ídem para las miras de la pistola
export const MUZZLE = new THREE.Vector3(0, 0.032, -0.585);
export const EJECT = new THREE.Vector3(0.03, 0.04, -0.03);

const _y = new THREE.Vector3(0, 1, 0);

function between(p0, p1, r0, r1, seg = 12) {
  const a = new THREE.Vector3(...p0); const b = new THREE.Vector3(...p1);
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, dir.length(), seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(_y, dir.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

// Silueta lateral extruida: puntos [z, y] en el espacio del arma y ancho `w` centrado en x = 0.
// o.holes: huecos con el mismo formato. o.bevel: chaflán de los cantos.
function profile(pts, w, o = {}) {
  const trace = (path, list) => { list.forEach(([z, y], i) => (i ? path.lineTo(-z, y) : path.moveTo(-z, y))); path.closePath(); return path; };
  const s = trace(new THREE.Shape(), pts);
  for (const hole of o.holes || []) s.holes.push(trace(new THREE.Path(), hole));
  const b = o.bevel ?? 0.0015;
  const g = new THREE.ExtrudeGeometry(s, { depth: w - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -(w - 2 * b) / 2);
  g.rotateY(Math.PI / 2); // x del perfil -> -Z
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 5);
  return g;
}

// Materiales compartidos por los tres modelos.
let _mat = null;
function materials(surf) {
  if (_mat) return _mat;
  const drops = surf.glassDrops;
  const grain = tex(heightToNormal(grainCanvas(128, 4242), 0.5), {}); // grano fino: acabado mate, sin relieve a la vista
  const mk = (color, rough, metal, k = 0.5, normal = drops) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, normalMap: normal });
    m.normalScale.set(k, k);
    return m;
  };
  _mat = {
    // Fusil y pistola: metal y polímero lisos y mates.
    black: mk(0x2a2c30, 0.46, 0.7, 0.3, grain),
    dark: mk(0x0d0e10, 0.58, 0.3, 0.3, grain),
    fde: mk(0x7d6c4e, 0.62, 0.05, 0.3, grain),
    // Cuchillo: conserva el acabado con gotas de siempre.
    knifeBlack: mk(0x2a2c30, 0.4, 0.7),
    knifeDark: mk(0x0d0e10, 0.55, 0.3, 0.2),
    steel: mk(0x9a9da0, 0.22, 1, 0.3),
    glove: mk(0x1d2024, 0.8, 0, 0.25),
    pad: mk(0x23262a, 0.55, 0.1, 0.3),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x4d5440, roughness: 0.9, map: surf.tarp.map, normalMap: surf.tarp.normalMap }),
    // Vendas y botiquín.
    bandage: new THREE.MeshStandardMaterial({ map: bandageTexture(), roughness: 0.95, metalness: 0 }),
    kitRed: mk(0xa3231b, 0.45, 0.05, 0.3, grain),
    kitWhite: mk(0xdedcd6, 0.6, 0, 0.3, grain),
    foam: mk(0x8d9196, 0.85, 0, 0.3, grain), // interior del botiquín (gris: al sol, el blanco se quema)
    kitGreen: mk(0x3f6b3a, 0.4, 0.1, 0.3, grain),
    kitOrange: mk(0xe0701e, 0.45, 0, 0.3, grain),
  };
  return _mat;
}

// Venda: tejido crudo con las vueltas marcadas en diagonal.
function bandageTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e3d3'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(120, 104, 80, 0.35)'; g.lineWidth = 1.2;
  for (let i = -64; i < 128; i += 9) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 22, 64); g.stroke(); }
  g.fillStyle = 'rgba(255, 255, 255, 0.25)';
  for (let i = 0; i < 160; i++) g.fillRect((i * 37) % 64, (i * 23) % 64, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Utilidades de construcción: acumulan geometría por material y la fusionan en una malla por material.
function kit(surf) {
  const mat = materials(surf);
  const lists = new Map();
  const put = (m, g, mtx) => { if (mtx) g.applyMatrix4(mtx); const k = g.index ? g.toNonIndexed() : g; if (!lists.has(m)) lists.set(m, []); lists.get(m).push(k); };
  const rbox = (m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, r = 0.004) => put(m, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), xform(x, y, z, rx, ry, rz));
  const box = (m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => put(m, new THREE.BoxGeometry(w, h, d), xform(x, y, z, rx, ry, rz));
  const cylZ = (m, r0, r1, len, x, y, z, seg = 16) => put(m, new THREE.CylinderGeometry(r1, r0, len, seg), xform(x, y, z, Math.PI / 2, 0, 0));
  const cylX = (m, r, len, x, y, z, seg = 10) => put(m, new THREE.CylinderGeometry(r, r, len, seg), xform(x, y, z, 0, 0, Math.PI / 2));
  const prof = (m, pts, w, x = 0, o) => put(m, profile(pts, w, o), x ? xform(x, 0, 0) : null);
  // Dedo: cadena de tramos entre los puntos dados, con una esfera en cada nudillo y en la yema.
  const finger = (m, pts, r0, r1 = r0) => {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const ra = r0 + ((r1 - r0) * i) / n; const rb = r0 + ((r1 - r0) * (i + 1)) / n;
      put(m, between(pts[i], pts[i + 1], ra, rb, 8));
      put(m, new THREE.SphereGeometry(rb, 8, 6), xform(...pts[i + 1]));
    }
  };
  const flush = (parent) => {
    for (const [m, list] of lists) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    lists.clear();
  };
  return { mat, put, rbox, box, cylZ, cylX, prof, finger, flush };
}

const finish = (root) => root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });

// Punto del que cuelga el llavero (ver src/charms.js).
function anchor(root, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  root.add(o);
  return o;
}

// ---------- Fusil ----------
export function buildViewModel(surf) {
  const root = new THREE.Group();
  root.name = 'viewmodel';
  const { mat, put, rbox, box, cylZ, cylX, prof, finger, flush } = kit(surf);

  // --- Cajón de mecanismos: superior liso e inferior con el brocal del cargador ---
  prof(mat.black, [[0.088, 0.012], [0.088, 0.05], [0.078, 0.058], [-0.118, 0.058], [-0.118, 0.012]], 0.044);
  prof(mat.black, [[0.085, 0.014], [-0.118, 0.014], [-0.118, -0.03], [-0.112, -0.09], [-0.04, -0.084], [-0.036, -0.04], [0.03, -0.038], [0.05, -0.03], [0.085, -0.016]], 0.04);
  box(mat.dark, 0.003, 0.02, 0.062, 0.0222, 0.037, -0.03); // ventana de expulsión
  box(mat.black, 0.003, 0.012, 0.062, 0.0232, 0.021, -0.03); // tapa de la ventana, abierta
  rbox(mat.black, 0.008, 0.014, 0.014, 0.024, 0.04, 0.012, 0, 0, 0, 0.003); // deflector de vainas
  cylZ(mat.black, 0.007, 0.007, 0.03, 0.026, 0.03, 0.062, 10); // empujador del cerrojo
  rbox(mat.black, 0.052, 0.009, 0.022, 0, 0.058, 0.088, 0, 0, 0, 0.002); // palanca de montar
  box(mat.black, 0.008, 0.004, 0.062, 0, -0.064, 0.002); // guardamonte
  box(mat.steel, 0.006, 0.022, 0.006, 0, -0.05, 0.014, 0.25); // gatillo
  // Lado izquierdo: retenida del cerrojo, selector y pasadores.
  rbox(mat.black, 0.004, 0.02, 0.012, -0.0215, 0.0, -0.045, 0, 0, 0, 0.0015);
  cylX(mat.black, 0.005, 0.004, -0.021, -0.014, 0.05);
  box(mat.black, 0.003, 0.005, 0.02, -0.0225, -0.014, 0.04, 0.25);
  cylX(mat.steel, 0.003, 0.003, -0.0205, -0.004, 0.072, 8);
  cylX(mat.steel, 0.003, 0.003, -0.0205, -0.008, -0.098, 8);
  // Empuñadura, inclinada hacia atrás.
  prof(mat.fde, [[0.03, -0.036], [0.072, -0.03], [0.086, -0.042], [0.11, -0.128], [0.1, -0.14], [0.07, -0.134], [0.042, -0.07]], 0.03, 0, { bevel: 0.004 });
  // Culata: tubo, cuerpo con aligeramiento y cantonera.
  cylZ(mat.black, 0.014, 0.014, 0.19, 0, 0.03, 0.18, 14);
  prof(mat.fde, [[0.165, 0.052], [0.325, 0.052], [0.335, 0.04], [0.335, -0.075], [0.322, -0.082], [0.298, -0.07], [0.235, -0.008], [0.165, 0.002]], 0.04, 0,
    { bevel: 0.004, holes: [[[0.262, -0.004], [0.312, -0.004], [0.312, -0.052]]] });
  rbox(mat.dark, 0.044, 0.135, 0.014, 0, -0.014, 0.341, 0, 0, 0, 0.005);
  // Guardamanos octogonal con ranuras, raíl y empuñadura delantera.
  const hg = new THREE.CylinderGeometry(0.0268, 0.0268, 0.27, 8, 1);
  hg.rotateY(Math.PI / 8);
  put(mat.fde, hg, xform(0, 0.032, -0.255, Math.PI / 2, 0, 0, 0.92, 1, 1));
  cylZ(mat.black, 0.0225, 0.0225, 0.012, 0, 0.032, -0.121, 12);
  for (let i = 0; i < 5; i++) {
    const z = -0.15 - i * 0.048;
    for (const sx of [-1, 1]) {
      box(mat.dark, 0.002, 0.012, 0.032, sx * 0.0232, 0.032, z);
      for (const sy of [-1, 1]) box(mat.dark, 0.002, 0.009, 0.03, sx * 0.0163, 0.032 + sy * 0.0177, z, 0, 0, sx * sy * -Math.PI / 4);
    }
    box(mat.dark, 0.016, 0.002, 0.03, 0, 0.0065, z);
  }
  box(mat.black, 0.022, 0.006, 0.475, 0, 0.0605, -0.152);
  for (let i = 0; i < 44; i++) box(mat.black, 0.0225, 0.0045, 0.0055, 0, 0.0655, 0.082 - i * 0.0108);
  rbox(mat.fde, 0.028, 0.072, 0.036, 0, -0.03, -0.245, -0.22, 0, 0, 0.01);
  // Cañón, toma de gases y bocacha.
  cylZ(mat.black, 0.0085, 0.0085, 0.15, 0, 0.032, -0.455);
  cylZ(mat.black, 0.0118, 0.0118, 0.03, 0, 0.032, -0.4, 12);
  cylZ(mat.black, 0.0128, 0.0118, 0.062, 0, 0.032, -0.55);
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) box(mat.dark, 0.004, 0.007, 0.01, sx * 0.0115, 0.032, -0.532 - i * 0.016);
  cylZ(mat.dark, 0.0058, 0.0058, 0.004, 0, 0.032, -0.5815, 12);
  // Módulo láser y linterna con su montaje.
  rbox(mat.black, 0.04, 0.022, 0.07, 0, 0.0775, -0.33, 0, 0, 0, 0.004);
  rbox(mat.black, 0.012, 0.02, 0.03, 0.027, 0.034, -0.345, 0, 0, 0, 0.003);
  cylZ(mat.black, 0.0135, 0.0125, 0.075, 0.037, 0.034, -0.345, 14);
  cylZ(mat.black, 0.0165, 0.0135, 0.02, 0.037, 0.034, -0.39, 14);
  // Mira holográfica: base, capó de chapa fina y botonera. Alza abatida detrás.
  rbox(mat.black, 0.04, 0.014, 0.08, 0, 0.0725, -0.02, 0, 0, 0, 0.003);
  for (const sx of [-1, 1]) prof(mat.black, [[0, 0.079], [-0.054, 0.079], [-0.05, 0.116], [-0.042, 0.1245], [-0.014, 0.1245], [-0.004, 0.112]], 0.003, sx * 0.0235, { bevel: 0.0006 });
  rbox(mat.black, 0.05, 0.004, 0.03, 0, 0.1255, -0.028, 0, 0, 0, 0.0015);
  rbox(mat.black, 0.036, 0.012, 0.03, 0, 0.084, 0.012, 0, 0, 0, 0.003);
  rbox(mat.black, 0.024, 0.007, 0.04, 0, 0.0705, 0.066, 0, 0, 0, 0.002);
  // Anilla portafusil en el lado izquierdo: de ella cuelga el llavero.
  rbox(mat.black, 0.006, 0.012, 0.016, -0.0235, 0.014, -0.135, 0, 0, 0, 0.002);
  put(mat.steel, new THREE.TorusGeometry(0.006, 0.0013, 6, 12), xform(-0.028, 0.005, -0.135));
  flush(root);

  // Cerrojo visible por la ventana (se anima al disparar).
  const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.056), mat.steel);
  bolt.position.set(0.0222, 0.037, -0.03);
  root.add(bolt);

  // Cargador curvo (se anima al recargar).
  const mag = new THREE.Group();
  mag.position.set(0, -0.085, -0.074);
  const magMesh = new THREE.Mesh(
    profile([[0.03, 0.03], [-0.03, 0.03], [-0.034, -0.05], [-0.046, -0.115], [-0.064, -0.168], [-0.006, -0.186], [0.008, -0.13], [0.022, -0.06]], 0.024, { bevel: 0.002 }),
    mat.dark,
  );
  magMesh.receiveShadow = true;
  mag.add(magMesh);
  root.add(mag);

  // LEDs y lente de la linterna.
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.002, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 6, 0.4) }));
  led.position.set(0.012, 0.089, -0.296);
  root.add(led);
  const lampLens = new THREE.Mesh(new THREE.CircleGeometry(0.0135, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 14, 16) }));
  lampLens.position.set(0.037, 0.034, -0.4005);
  lampLens.rotation.y = Math.PI;
  root.add(lampLens);

  // Lente con retícula colimada: se dibuja según el ángulo respecto al eje del arma.
  const lensUniforms = { uFwd: { value: new THREE.Vector3(0, 0, -1) }, uGain: { value: 1 } };
  const lens = new THREE.Mesh(
    new THREE.PlaneGeometry(0.042, 0.042),
    new THREE.ShaderMaterial({
      uniforms: lensUniforms, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `varying vec3 vView; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFwd; uniform float uGain; varying vec3 vView;
        void main() {
          vec3 v = normalize(vView);
          vec3 d = v - uFwd * dot(v, uFwd);
          float a = length(d);
          float ang = atan(d.y, d.x);
          float dotR = 1.0 - smoothstep(0.0006, 0.0011, a);
          float ring = 1.0 - smoothstep(0.0, 0.0013, abs(a - 0.0125));
          float ticks = (1.0 - smoothstep(0.0, 0.0011, abs(sin(ang * 2.0)) * a)) * step(0.0125, a) * step(a, 0.0165);
          float r = max(dotR, max(ring, ticks));
          vec3 col = vec3(9.0, 0.5, 0.25) * r * uGain;
          gl_FragColor = vec4(col + vec3(0.02, 0.05, 0.06), 0.1 + r * 0.9);
        }`,
    }),
  );
  lens.position.set(0, SIGHT_Y + 0.004, -0.03);
  lens.renderOrder = 30;
  root.add(lens);

  // --- Mano derecha (fija al arma): dorso por la derecha, dedos rodeando la empuñadura y pulgar por la izquierda ---
  const rightArm = new THREE.Group();
  rbox(mat.glove, 0.03, 0.088, 0.05, 0.02, -0.088, 0.094, -0.3, 0, 0, 0.014);
  rbox(mat.glove, 0.03, 0.07, 0.022, 0, -0.085, 0.112, -0.3, 0, 0, 0.01);
  rbox(mat.pad, 0.012, 0.05, 0.04, 0.036, -0.08, 0.09, -0.3, 0, 0, 0.004);
  for (let i = 0; i < 3; i++) {
    const y = -0.066 - i * 0.022; const zf = 0.042 + ((y + 0.07) / -0.064) * 0.028;
    finger(mat.glove, [[0.02, y, zf + 0.004], [0.006, y, zf - 0.009], [-0.014, y - 0.002, zf - 0.004], [-0.02, y - 0.003, zf + 0.012]], 0.0088, 0.0078);
  }
  finger(mat.glove, [[0.022, -0.05, 0.05], [0.025, -0.038, 0.015], [0.024, -0.034, -0.012]], 0.0088, 0.0078); // índice, fuera del gatillo
  finger(mat.glove, [[0.004, -0.046, 0.098], [-0.02, -0.034, 0.075], [-0.024, -0.03, 0.046]], 0.0105, 0.009); // pulgar
  put(mat.sleeve, between([0.016, -0.128, 0.118], [0.15, -0.32, 0.43], 0.034, 0.055));
  put(mat.glove, between([0.012, -0.112, 0.105], [0.03, -0.142, 0.14], 0.036, 0.037));
  flush(rightArm);
  root.add(rightArm);

  // --- Mano izquierda (acompaña al cargador durante la recarga): dorso a la vista, dedos por delante y reloj ---
  const leftArm = new THREE.Group();
  rbox(mat.glove, 0.028, 0.078, 0.058, -0.026, -0.04, -0.24, -0.22, 0, 0, 0.012);
  rbox(mat.pad, 0.01, 0.046, 0.046, -0.041, -0.036, -0.241, -0.22, 0, 0, 0.004);
  for (let i = 0; i < 4; i++) {
    const y = -0.008 - i * 0.019; const zf = -0.263 - 0.22 * (y + 0.03);
    finger(mat.glove, [[-0.022, y, zf + 0.006], [-0.008, y, zf - 0.009], [0.012, y - 0.001, zf - 0.006], [0.02, y - 0.002, zf + 0.01]], 0.0088, 0.0078);
  }
  finger(mat.glove, [[-0.02, -0.03, -0.215], [-0.026, -0.004, -0.232], [-0.027, 0.01, -0.262]], 0.0105, 0.009); // pulgar
  put(mat.sleeve, between([-0.04, -0.082, -0.205], [-0.27, -0.33, 0.2], 0.034, 0.056));
  put(mat.glove, between([-0.03, -0.07, -0.222], [-0.056, -0.098, -0.18], 0.036, 0.037));
  rbox(mat.dark, 0.032, 0.009, 0.034, -0.07, -0.066, -0.184, 0, 0, 0.63, 0.003);
  rbox(mat.black, 0.022, 0.004, 0.022, -0.0735, -0.061, -0.184, 0, 0, 0.63, 0.0015);
  flush(leftArm);
  root.add(leftArm);

  const muzzle = new THREE.Object3D(); muzzle.position.copy(MUZZLE); root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.copy(EJECT); root.add(eject);
  const charm = anchor(root, -0.028, -0.002, -0.135);

  finish(root);
  return { root, bolt, mag, leftArm, rightArm, muzzle, eject, lens, lensUniforms, lampLens, charm };
}

// ---------- Pistola ----------
// Compacta de pequeño calibre, a dos manos. La corredera y el cargador se animan aparte.
const GRIP_LEAN = -0.22; // la empuñadura se inclina hacia atrás

export function buildPistolModel(surf) {
  const root = new THREE.Group();
  root.name = 'viewmodel-pistol';
  const { mat, put, rbox, box, cylZ, prof, finger, flush } = kit(surf);

  // Armazón de una pieza: guardapolvo, guardamonte hueco y empuñadura, con cachas.
  prof(mat.dark, [[0.05, 0.02], [-0.125, 0.02], [-0.125, 0.002], [-0.07, 0], [-0.066, -0.03], [-0.058, -0.037], [-0.012, -0.037], [-0.004, -0.03],
    [0.018, -0.108], [0.062, -0.108], [0.046, -0.02], [0.058, 0.004]], 0.026, 0,
  { bevel: 0.003, holes: [[[-0.06, -0.004], [-0.06, -0.028], [-0.054, -0.031], [-0.014, -0.031], [-0.01, -0.004]]] });
  prof(mat.fde, [[0, -0.03], [0.02, -0.1], [0.056, -0.1], [0.042, -0.026]], 0.03, 0, { bevel: 0.004 });
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) box(mat.dark, 0.002, 0.003, 0.03, sx * 0.0152, -0.04 - i * 0.016, 0.022 + i * 0.0045, GRIP_LEAN);
  box(mat.steel, 0.005, 0.018, 0.005, 0, -0.014, -0.03, 0.25); // gatillo
  rbox(mat.dark, 0.008, 0.014, 0.01, 0, 0.03, 0.052, 0.4, 0, 0, 0.003); // martillo
  cylZ(mat.steel, 0.0052, 0.0052, 0.012, 0, 0.031, -0.136, 12); // boca del cañón
  // Anilla en el costado izquierdo del guardapolvo: de ella cuelga el llavero.
  rbox(mat.dark, 0.006, 0.008, 0.012, -0.0145, 0.008, -0.116, 0, 0, 0, 0.002);
  put(mat.steel, new THREE.TorusGeometry(0.005, 0.0012, 6, 12), xform(-0.0185, 0.004, -0.116));
  flush(root);

  // Corredera con miras (retrocede en cada disparo).
  const slide = new THREE.Group();
  prof(mat.black, [[0.047, 0.018], [0.047, 0.04], [0.043, 0.042], [-0.128, 0.042], [-0.139, 0.036], [-0.139, 0.018]], 0.027, 0, { bevel: 0.002 });
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) box(mat.dark, 0.0015, 0.016, 0.004, sx * 0.0137, 0.03, 0.036 - i * 0.008);
  box(mat.dark, 0.002, 0.012, 0.03, 0.0137, 0.034, -0.03); // ventana de expulsión
  for (const sx of [-1, 1]) box(mat.dark, 0.005, 0.007, 0.007, sx * 0.007, 0.0455, 0.04); // alza
  box(mat.dark, 0.004, 0.007, 0.007, 0, 0.0455, -0.13); // punto de mira
  flush(slide);
  const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 0.6) });
  for (const [x, z] of [[-0.007, 0.0438], [0.007, 0.0438], [0, -0.1262]]) {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 8), dotMat);
    dot.position.set(x, 0.0462, z);
    slide.add(dot);
  }
  root.add(slide);

  // Cargador: baja por la empuñadura al recargar.
  const mag = new THREE.Group();
  mag.rotation.x = GRIP_LEAN;
  const magMesh = new THREE.Mesh(new RoundedBoxGeometry(0.021, 0.1, 0.031, 2, 0.003), mat.black);
  magMesh.position.set(0, -0.058, 0.017);
  const magBase = new THREE.Mesh(new RoundedBoxGeometry(0.029, 0.009, 0.046, 2, 0.003), mat.black);
  magBase.position.set(0, -0.112, 0.018);
  mag.add(magMesh, magBase);
  root.add(mag);

  // Mano derecha en la empuñadura: dedos por delante, índice a lo largo del armazón y pulgar alto.
  const rightArm = new THREE.Group();
  rbox(mat.glove, 0.03, 0.08, 0.05, 0.022, -0.062, 0.045, GRIP_LEAN, 0, 0, 0.014);
  rbox(mat.glove, 0.03, 0.07, 0.02, 0.004, -0.06, 0.066, GRIP_LEAN, 0, 0, 0.009);
  rbox(mat.pad, 0.012, 0.046, 0.04, 0.038, -0.056, 0.042, GRIP_LEAN, 0, 0, 0.004);
  for (let i = 0; i < 3; i++) {
    const y = -0.046 - i * 0.02; const zf = -0.004 + ((y + 0.03) / -0.078) * 0.022;
    finger(mat.glove, [[0.02, y, zf + 0.006], [0.006, y, zf - 0.009], [-0.013, y, zf - 0.004], [-0.019, y, zf + 0.012]], 0.0086, 0.0076);
  }
  finger(mat.glove, [[0.019, -0.02, 0.012], [0.019, -0.006, -0.03]], 0.0082, 0.0074);
  finger(mat.glove, [[0, -0.012, 0.058], [-0.018, 0.002, 0.03], [-0.02, 0.006, 0]], 0.01, 0.0088);
  put(mat.sleeve, between([0.016, -0.1, 0.085], [0.16, -0.31, 0.42], 0.034, 0.055));
  put(mat.glove, between([0.012, -0.085, 0.07], [0.03, -0.118, 0.11], 0.036, 0.037));
  flush(rightArm);
  root.add(rightArm);

  // Mano izquierda de apoyo (acompaña al cargador durante la recarga): abraza a la derecha por delante.
  const leftArm = new THREE.Group();
  rbox(mat.glove, 0.03, 0.07, 0.056, -0.03, -0.07, 0.03, GRIP_LEAN, 0, 0.18, 0.014);
  for (let i = 0; i < 4; i++) {
    const y = -0.05 - i * 0.018; const zf = -0.02 + ((y + 0.03) / -0.078) * 0.022;
    finger(mat.glove, [[-0.026, y, zf + 0.01], [-0.01, y, zf - 0.006], [0.012, y, zf - 0.004], [0.026, y, zf + 0.012]], 0.0086, 0.0076);
  }
  finger(mat.glove, [[-0.022, -0.02, 0.03], [-0.023, -0.002, 0], [-0.022, 0.004, -0.04]], 0.01, 0.0088); // pulgar adelantado
  put(mat.sleeve, between([-0.04, -0.105, 0.06], [-0.27, -0.33, 0.36], 0.034, 0.056));
  put(mat.glove, between([-0.034, -0.092, 0.045], [-0.06, -0.124, 0.085], 0.036, 0.037));
  flush(leftArm);
  root.add(leftArm);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.031, -0.145); root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.016, 0.04, -0.025); root.add(eject);
  const charm = anchor(root, -0.0185, -0.001, -0.116);

  finish(root);
  return { root, slide, mag, leftArm, rightArm, muzzle, eject, charm };
}

// ---------- Cuchillo ----------
// Hoja hacia delante (-Z), filo hacia abajo, empuñado con la mano derecha. `forearm`: hasta dónde llega la
// manga. La del golpe rápido baja casi en vertical para salir por debajo de la pantalla con la mano al centro.
export function buildKnifeModel(surf, forearm = [0.15, -0.26, 0.44]) {
  const root = new THREE.Group();
  root.name = 'viewmodel-knife';
  const { mat, put, rbox, box, finger, flush } = kit(surf);

  // Hoja: perfil lateral extruido (x = largo, y = alto), girado para que apunte hacia delante.
  const s = new THREE.Shape();
  s.moveTo(0, -0.014);
  s.lineTo(0.118, -0.014);
  s.quadraticCurveTo(0.165, -0.012, 0.185, 0.009);
  s.lineTo(0.128, 0.015);
  s.lineTo(0.118, 0.0185);
  s.lineTo(0, 0.0185);
  s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.0026, bevelEnabled: true, bevelThickness: 0.0009, bevelSize: 0.0016, bevelSegments: 1, steps: 1 });
  blade.translate(0, 0, -0.0013);
  blade.rotateY(Math.PI / 2); // x del perfil -> -Z
  blade.translate(0, 0.002, -0.04);
  put(mat.steel, blade);
  box(mat.knifeDark, 0.0034, 0.003, 0.085, 0, 0.011, -0.095); // canal de la hoja
  // Guarda, mango con estrías y pomo.
  rbox(mat.knifeBlack, 0.014, 0.056, 0.012, 0, 0.003, -0.036, 0, 0, 0, 0.004);
  rbox(mat.pad, 0.023, 0.031, 0.108, 0, 0.002, 0.024, 0, 0, 0, 0.009);
  for (let i = 0; i < 5; i++) box(mat.knifeDark, 0.0245, 0.0325, 0.004, 0, 0.002, -0.012 + i * 0.018);
  rbox(mat.knifeBlack, 0.024, 0.034, 0.014, 0, 0.002, 0.084, 0, 0, 0, 0.005);
  // Anilla en la punta de la guarda: de ella cuelga el llavero.
  put(mat.steel, new THREE.TorusGeometry(0.005, 0.0012, 6, 12), xform(0, -0.029, -0.036));
  flush(root);

  // Mano derecha cerrada sobre el mango: dorso por la derecha, dedos por encima y pulgar sobre el lomo.
  const rightArm = new THREE.Group();
  rbox(mat.glove, 0.024, 0.06, 0.084, 0.022, -0.002, 0.03, 0, 0, 0, 0.012);
  rbox(mat.glove, 0.04, 0.02, 0.08, 0.004, -0.024, 0.03, 0, 0, 0, 0.009);
  rbox(mat.pad, 0.012, 0.044, 0.05, 0.036, 0.004, 0.03, 0, 0, 0, 0.004);
  for (let i = 0; i < 4; i++) {
    const z = i * 0.021;
    finger(mat.glove, [[0.018, 0.018, z], [0.002, 0.026, z], [-0.016, 0.014, z], [-0.017, -0.01, z], [-0.004, -0.021, z]], 0.0088, 0.008);
  }
  finger(mat.glove, [[0.016, 0.014, 0.004], [0.004, 0.026, -0.012], [-0.003, 0.027, -0.03]], 0.0105, 0.009);
  put(mat.sleeve, between([0.014, -0.03, 0.075], forearm, 0.034, 0.055));
  put(mat.glove, between([0.008, -0.018, 0.06], [0.026, -0.05, 0.1], 0.036, 0.037));
  flush(rightArm);
  root.add(rightArm);

  const charm = anchor(root, 0, -0.034, -0.036);

  finish(root);
  return { root, rightArm, charm };
}

// ---------- Mano izquierda libre ----------
// Agarra a la víctima de un remate por el hombro: palma hacia abajo, dorso a la vista, dedos hacia delante
// doblándose hacia abajo y pulgar por la derecha. El origen es el centro de la palma.
export function buildGrabHand(surf) {
  const root = new THREE.Group();
  root.name = 'viewmodel-grab';
  const k = kit(surf);
  openHand(k, [-0.15, -0.26, 0.47]);
  k.flush(root);
  finish(root);
  return { root };
}

// Mano izquierda abierta: palma hacia abajo, dedos hacia delante (-Z) doblándose hacia abajo, pulgar por la
// derecha y reloj en la muñeca. Origen en el centro de la palma; la manga va hasta `elbow`.
function openHand({ mat, put, rbox, finger }, elbow) {
  rbox(mat.glove, 0.084, 0.03, 0.09, 0, 0, 0, 0, 0, 0, 0.012);
  rbox(mat.pad, 0.056, 0.01, 0.05, -0.004, 0.016, 0.006, 0, 0, 0, 0.004);
  for (let i = 0; i < 4; i++) {
    const x = -0.03 + i * 0.02; const k = 1 - Math.abs(i - 1.3) * 0.08; // el corazón, el más largo
    finger(mat.glove, [[x, 0, -0.04], [x, -0.003, -0.04 - 0.036 * k], [x, -0.026, -0.04 - 0.062 * k], [x, -0.054, -0.04 - 0.068 * k]], 0.0092, 0.008);
  }
  finger(mat.glove, [[0.036, -0.008, 0.012], [0.058, -0.026, -0.022], [0.062, -0.052, -0.044]], 0.0108, 0.009); // pulgar
  put(mat.glove, between([0, -0.006, 0.04], [-0.02, -0.03, 0.09], 0.036, 0.037)); // puño del guante
  put(mat.sleeve, between([-0.012, -0.018, 0.07], elbow, 0.034, 0.056));
  rbox(mat.dark, 0.034, 0.009, 0.034, -0.03, 0.012, 0.085, 0, 0, 0.3, 0.003); // reloj
  rbox(mat.black, 0.024, 0.004, 0.024, -0.03, 0.018, 0.085, 0, 0, 0.3, 0.0015);
}

// Mano derecha cerrada, como la del cuchillo: agarre a lo largo de Z (de z = 0 a 0,063), dorso por la derecha,
// dedos por encima y pulgar sobre lo que sujeta. La manga va hasta `elbow`.
function fist({ mat, put, rbox, finger }, elbow) {
  rbox(mat.glove, 0.024, 0.06, 0.084, 0.022, -0.002, 0.03, 0, 0, 0, 0.012);
  rbox(mat.glove, 0.04, 0.02, 0.08, 0.004, -0.024, 0.03, 0, 0, 0, 0.009);
  rbox(mat.pad, 0.012, 0.044, 0.05, 0.036, 0.004, 0.03, 0, 0, 0, 0.004);
  for (let i = 0; i < 4; i++) {
    const z = i * 0.021;
    finger(mat.glove, [[0.018, 0.018, z], [0.002, 0.026, z], [-0.016, 0.014, z], [-0.017, -0.01, z], [-0.004, -0.021, z]], 0.0088, 0.008);
  }
  finger(mat.glove, [[0.016, 0.014, 0.004], [0.004, 0.026, -0.012], [-0.003, 0.027, -0.03]], 0.0105, 0.009);
  put(mat.sleeve, between([0.014, -0.03, 0.075], elbow, 0.034, 0.055));
  put(mat.glove, between([0.008, -0.018, 0.06], [0.026, -0.05, 0.1], 0.036, 0.037));
}

// ---------- Vendas ----------
// La mano derecha lleva el rollo y lo enrolla en la muñeca izquierda (ver Weapon.poseHeal). Piezas animadas:
// leftArm (mano izquierda), rightArm (mano derecha con el rollo), wrap (venda ya puesta, cilindro a lo largo del
// antebrazo que crece con scale.y), strip (tira entre el rollo y la muñeca, se estira con scale.z).
export const WRAP_LEN = 0.085; // largo de la venda puesta al terminar
export function buildBandageModel(surf) {
  const root = new THREE.Group();
  root.name = 'viewmodel-bandage';
  const k = kit(surf);
  const { mat, put } = k;

  // Mano izquierda, palma abajo y girada para que el antebrazo cruce desde la izquierda con la muñeca a la
  // vista; la venda se enrolla ahí.
  const leftArm = new THREE.Group();
  const hand = new THREE.Group();
  const elbow = new THREE.Vector3(-0.12, -0.2, 0.34); const wrist = new THREE.Vector3(-0.012, -0.018, 0.075);
  openHand(k, elbow.toArray());
  k.flush(hand);
  hand.rotation.set(0.2, -0.95, 0.25);
  hand.position.set(-0.035, -0.015, -0.05);
  leftArm.add(hand);
  const axis = elbow.clone().sub(wrist).normalize();
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.045, 1, 18, 1).translate(0, 0.5, 0), mat.bandage);
  wrap.position.copy(wrist).addScaledVector(axis, 0.008);
  wrap.quaternion.setFromUnitVectors(_y, axis);
  wrap.scale.y = 0.0001;
  hand.add(wrap);
  // Muñeca y codo en el espacio de la mano (la vuelta del rollo se hace alrededor de ese eje).
  const wristPt = wrist.clone().addScaledVector(axis, 0.012);
  const elbowPt = elbow.clone();
  root.add(leftArm);

  // Mano derecha con el rollo cogido con la punta de los dedos.
  const rightArm = new THREE.Group();
  fist(k, [0.12, -0.2, 0.22]);
  put(mat.bandage, new THREE.CylinderGeometry(0.036, 0.036, 0.05, 20), xform(0, 0.006, -0.035, Math.PI / 2, 0, 0));
  put(mat.foam, new THREE.CylinderGeometry(0.011, 0.011, 0.052, 10), xform(0, 0.006, -0.035, Math.PI / 2, 0, 0)); // alma del rollo
  k.flush(rightArm);
  const rollPt = new THREE.Vector3(0, -0.028, -0.035); // donde sale la tira (bajo el rollo)
  root.add(rightArm);

  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0015, 1).translate(0, 0, 0.5), mat.bandage);
  strip.visible = false;
  root.add(strip);

  finish(root);
  return { root, leftArm, rightArm, hand, wrap, strip, wristPt, elbowPt, rollPt };
}

// ---------- Botiquín ----------
// Maletín rojo con la cruz blanca, sujeto en horizontal con las dos manos. Al usarlo se abre la tapa, la mano
// derecha saca el autoinyector, se lo clava en el antebrazo izquierdo y lo vuelve a guardar (Weapon.poseHeal).
// Piezas animadas: lid (tapa, gira sobre su bisagra trasera), rightArm, leftArm e injector (fuera de la mano
// va en su hueco de la bandeja; en la mano, sigue a rightArm con `grip`).
export function buildMedkitModel(surf) {
  const root = new THREE.Group();
  root.name = 'viewmodel-medkit';
  const k = kit(surf);
  const { mat, put, rbox, box, cylX } = k;
  const W = 0.27; const D = 0.18; const H = 0.055;

  // Bandeja: el interior es espuma clara con el hueco del autoinyector, gasas y un rollo de esparadrapo.
  rbox(mat.kitRed, W, H, D, 0, 0, 0, 0, 0, 0, 0.008);
  box(mat.foam, W - 0.02, 0.004, D - 0.02, 0, H / 2 - 0.0015, 0);
  box(mat.dark, 0.032, 0.003, 0.12, 0.05, H / 2 + 0.0008, 0); // hueco del autoinyector
  rbox(mat.kitWhite, 0.07, 0.012, 0.05, -0.07, H / 2 + 0.005, -0.03, 0, 0.15, 0, 0.003);
  rbox(mat.kitWhite, 0.07, 0.012, 0.05, -0.07, H / 2 + 0.005, 0.035, 0, -0.1, 0, 0.003);
  put(mat.bandage, new THREE.CylinderGeometry(0.022, 0.022, 0.018, 16), xform(-0.005, H / 2 + 0.009, 0.045));
  // Asa por delante (hacia la cámara) y cierres.
  for (const sx of [-1, 1]) {
    rbox(mat.black, 0.012, 0.016, 0.016, sx * 0.045, 0, D / 2 + 0.006, 0, 0, 0, 0.003);
    rbox(mat.pad, 0.026, 0.012, 0.008, sx * 0.1, H / 2 - 0.004, D / 2 + 0.003, 0, 0, 0, 0.002);
  }
  cylX(mat.black, 0.007, 0.1, 0, -0.004, D / 2 + 0.018, 12);
  k.flush(root);

  // Tapa con la cruz, articulada en el borde trasero.
  const lid = new THREE.Group();
  lid.position.set(0, H / 2, -D / 2);
  rbox(mat.kitRed, W, 0.03, D, 0, 0.015, D / 2, 0, 0, 0, 0.008);
  box(mat.kitWhite, 0.1, 0.003, 0.03, 0, 0.0305, D / 2);
  box(mat.kitWhite, 0.03, 0.003, 0.1, 0, 0.0305, D / 2);
  box(mat.foam, W - 0.024, 0.003, D - 0.024, 0, -0.0005, D / 2); // forro interior
  k.flush(lid);
  root.add(lid);

  // Autoinyector: cuerpo verde, punta naranja hacia -Z y émbolo gris atrás.
  const injector = new THREE.Group();
  const { cylZ } = k;
  cylZ(mat.kitGreen, 0.011, 0.011, 0.085, 0, 0, 0, 16);
  cylZ(mat.kitOrange, 0.0115, 0.0105, 0.022, 0, 0, -0.053, 16);
  cylZ(mat.steel, 0.0035, 0.0035, 0.012, 0, 0, -0.07, 8);
  cylZ(mat.pad, 0.0085, 0.0085, 0.014, 0, 0, 0.049, 12);
  box(mat.kitWhite, 0.0225, 0.012, 0.03, 0, 0, 0.004); // etiqueta
  k.flush(injector);
  injector.position.set(0.05, H / 2 + 0.011, 0);
  injector.userData.rest = injector.position.clone();
  root.add(injector);

  // Mano izquierda bajo el lado izquierdo, palma arriba; derecha agarrando el lado derecho.
  const leftArm = new THREE.Group();
  const lh = new THREE.Group();
  const elbow = [0.16, 0.2, 0.3]; // girada media vuelta: la manga acaba yendo abajo a la izquierda
  openHand(k, elbow);
  k.flush(lh);
  lh.rotation.set(0, 0, Math.PI);
  lh.position.set(-0.1, -H / 2 - 0.018, 0.01);
  leftArm.add(lh);
  root.add(leftArm);
  // Donde se pincha: en el antebrazo izquierdo, algo más allá del puño del guante (espacio de lh).
  const armPt = new THREE.Vector3(-0.012, -0.018, 0.075).lerp(new THREE.Vector3(...elbow), 0.16);
  const rightArm = new THREE.Group();
  fist(k, [0.12, -0.2, 0.22]);
  k.flush(rightArm);
  root.add(rightArm);
  // Dónde queda el autoinyector dentro del puño (espacio de rightArm).
  const grip = new THREE.Matrix4().makeTranslation(0, 0.003, -0.025); // asoma por delante del puño

  finish(root);
  return { root, lid, injector, leftArm, lh, rightArm, grip, armPt };
}
