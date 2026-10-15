// Skins: acabados procedurales para el fusil y la pistola en primera persona. Recrean los acabados
// clásicos de los shooters (camuflajes militares, pavonado, temple, damasco, anodizados en degradado,
// oro, diamante…) con nombres propios. Cada skin se pinta por píxel en tres lienzos (color; rugosidad y
// metal; emisión) fuera del hilo principal y se proyecta en triplanar con la posición de cada pieza en el espacio del arma, así el
// dibujo sigue de una pieza a otra sin depender de las UV. Se eligen en la armería y se guardan en el navegador.
import * as THREE from 'three';
import { SKINS, W, H, skinById, paintRows } from './skinPaint.js';

export { RARITY, SKINS, skinById } from './skinPaint.js';

const STORE_KEY = 'nightfall.skins';
export const SKIN_SLOTS = 2; // fusil y pistola

// Tiempo compartido por las skins animadas (lo avanza Weapon).
export const SKIN_TIME = { value: 0 };

// Caja de proyección de cada arma, en metros del espacio del modelo: centro en Z, centro en Y y largo.
export const SKIN_BOX = [
  [-0.12, -0.03, 0.96], // fusil: de la bocacha (-0,585) a la cantonera (0,348)
  [-0.04, -0.035, 0.32], // pistola
];

// Skin guardada para cada arma (identificadores de SKINS).
export function loadSkins() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* sin almacenamiento o dato roto */ }
  return Array.from({ length: SKIN_SLOTS }, (_, i) => (Array.isArray(saved) && SKINS.some((s) => s.id === saved[i]) ? saved[i] : 'none'));
}

export function saveSkins(ids) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(ids)); } catch { /* sin almacenamiento */ }
}

// ---------- Texturas ----------
// Se pintan en workers (src/skinWorker.js), cada uno una franja de filas, para no congelar el juego. Se
// comparten entre el fusil y la pistola y se liberan cuando ya nadie las usa. Se suben a la tarjeta una por
// fotograma. Si no hay workers (navegador antiguo o fallo al cargarlos), se pinta aquí mismo.
const cache = new Map(); // id -> { users, tex, ready }
let blackTex = null;
let renderer = null;

// main.js pasa el renderer para subir las texturas por adelantado, repartidas en varios fotogramas.
export function setSkinRenderer(r) { renderer = r; }

const POOL = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
let workers = null; // null = aún sin crear; [] = sin workers
function pool() {
  if (workers) return workers;
  workers = [];
  try {
    for (let i = 0; i < POOL; i++) workers.push(new Worker(new URL('./skinWorker.js', import.meta.url), { type: 'module' }));
  } catch { workers = []; }
  return workers;
}

// Pinta la skin entera repartiendo las filas entre los workers. Los búferes vuelven por transferencia.
function paintInWorkers(def, ws) {
  const n = W * H * 4;
  const out = { col: new Uint8Array(n), mr: new Uint8Array(n), em: def.emit ? new Uint8Array(n) : null };
  return Promise.all(ws.map((w, k) => new Promise((resolve, reject) => {
    const j0 = Math.floor((H * k) / ws.length); const j1 = Math.floor((H * (k + 1)) / ws.length);
    w.onmessage = ({ data }) => {
      const off = (H - j1) * W * 4; // las filas van de abajo arriba
      out.col.set(data.col, off); out.mr.set(data.mr, off);
      if (out.em && data.em) out.em.set(data.em, off);
      resolve();
    };
    w.onerror = (e) => { e.preventDefault(); reject(e); };
    w.postMessage({ id: def.id, j0, j1 });
  }))).then(() => out);
}

// Cola de pintado: una skin cada vez (con todos los workers). Las que ya nadie quiere se saltan.
const queue = [];
let busy = false;
async function pump() {
  if (busy || !queue.length) return;
  const job = queue.shift();
  if (!job.wanted()) { job.resolve(null); pump(); return; }
  busy = true;
  let data = null;
  const ws = pool();
  if (ws.length) {
    try { data = await paintInWorkers(job.def, ws); } catch { for (const w of ws) w.terminate(); workers = []; }
  }
  if (!data) data = paintRows(job.def.id, 0, H);
  busy = false;
  job.resolve(data);
  pump();
}
function paint(def, wanted) {
  return new Promise((resolve) => { queue.push({ def, wanted, resolve }); pump(); });
}

const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); });

function dataTex(data, srgb) {
  const t = new THREE.DataTexture(data, W, H);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

async function build(def, data) {
  const tex = { map: dataTex(data.col, true), mr: dataTex(data.mr, false), em: data.em ? dataTex(data.em, true) : null };
  if (tex.em && def.scroll) tex.em.wrapS = THREE.RepeatWrapping;
  if (renderer) for (const t of [tex.map, tex.mr, tex.em]) if (t) { await nextFrame(); renderer.initTexture(t); }
  return tex;
}

function acquire(def) {
  let e = cache.get(def.id);
  if (!e) {
    e = { users: 1, tex: null }; // cuenta ya a quien la pide: la cola mira si alguien la quiere
    const entry = e;
    cache.set(def.id, e);
    entry.ready = (async () => {
      // Se repite si, mientras tanto, la soltaron todos y otro la volvió a pedir.
      while (entry.users > 0) {
        const data = await paint(def, () => entry.users > 0);
        if (!data || entry.users === 0) continue;
        const tex = await build(def, data);
        if (entry.users > 0) { entry.tex = tex; return tex; }
        disposeTex(tex);
      }
      if (cache.get(def.id) === entry) cache.delete(def.id); // nadie la quiere ya
      return null;
    })();
    return e;
  }
  e.users++;
  return e;
}

function disposeTex(t) { t.map.dispose(); t.mr.dispose(); t.em?.dispose(); }

function release(id) {
  const e = cache.get(id);
  if (!e || --e.users > 0 || !e.tex) return; // si aún se está pintando, la recoge acquire al acabar
  disposeTex(e.tex);
  cache.delete(id);
}

// ---------- Material ----------
// MeshPhysicalMaterial con el color, la rugosidad, el metal y la emisión tomados en triplanar de las
// texturas de la skin, usando los atributos skinPos/skinNrm (posición y normal en el espacio del arma).
function skinMaterial(def, tex, box, base, tint) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint, tint, tint), roughness: 1, metalness: 1,
    normalMap: base.normalMap, normalScale: base.normalScale.clone().multiplyScalar(def.grain ?? 1),
    clearcoat: def.clearcoat || 0, clearcoatRoughness: 0.08,
  });
  m.envMapIntensity = def.env ?? 1;
  const uniforms = {
    uSkinMap: { value: tex.map }, uSkinMR: { value: tex.mr }, uSkinEm: { value: tex.em || blackPixel() },
    uSkinBox: { value: new THREE.Vector3(...box) },
    uSkinEmAnim: { value: new THREE.Vector4(def.scroll || 0, def.pulse?.[0] || 0, def.pulse?.[1] || 0, (def.emit || 0) * tint) },
    uSkinTime: SKIN_TIME,
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute vec3 skinPos;\nattribute vec3 skinNrm;\nvarying vec3 vSkinP;\nvarying vec3 vSkinN;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSkinP = skinPos; vSkinN = skinNrm;');
    sh.fragmentShader = SKIN_HEAD + sh.fragmentShader
      .replace('#include <map_fragment>', SKIN_MAP)
      .replace('#include <roughnessmap_fragment>', 'vec4 skinMR = skinTex(uSkinMR, vec2(0.0));\nfloat roughnessFactor = roughness * skinMR.g;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * skinMR.b;')
      .replace('#include <emissivemap_fragment>', SKIN_EMIT);
  };
  m.customProgramCacheKey = () => 'skin';
  return m;
}

const SKIN_HEAD = /* glsl */ `
uniform sampler2D uSkinMap;
uniform sampler2D uSkinMR;
uniform sampler2D uSkinEm;
uniform vec3 uSkinBox;
uniform vec4 uSkinEmAnim;
uniform float uSkinTime;
varying vec3 vSkinP;
varying vec3 vSkinN;
vec3 skinW;
vec2 skinUX; vec2 skinUY; vec2 skinUZ;
vec4 skinTex(sampler2D t, vec2 off) {
  return texture2D(t, skinUX + off) * skinW.x + texture2D(t, skinUY + off) * skinW.y + texture2D(t, skinUZ + off) * skinW.z;
}
`;

// Proyecciones: de lado (Z, Y), desde arriba (Z, X) y de frente (X, Y).
const SKIN_MAP = /* glsl */ `
vec3 sw = pow(abs(normalize(vSkinN)), vec3(4.0));
skinW = sw / (sw.x + sw.y + sw.z);
float sHalf = uSkinBox.z * 0.5;
float su = (vSkinP.z - uSkinBox.x) / uSkinBox.z + 0.5;
float sv = (vSkinP.y - uSkinBox.y) / sHalf + 0.5;
skinUX = vec2(su, sv);
skinUY = vec2(su, vSkinP.x / sHalf + 0.5);
skinUZ = vec2(vSkinP.x / uSkinBox.z + 0.5, sv);
diffuseColor.rgb *= skinTex(uSkinMap, vec2(0.0)).rgb;
`;

const SKIN_EMIT = /* glsl */ `
vec3 skinE = skinTex(uSkinEm, vec2(uSkinTime * uSkinEmAnim.x, 0.0)).rgb;
float skinPh = fract(dot(skinE, vec3(37.0, 17.0, 11.0)));
float skinPulse = 1.0 - uSkinEmAnim.z * (0.5 + 0.5 * sin(uSkinTime * uSkinEmAnim.y + skinPh * 6.2832));
totalEmissiveRadiance += skinE * skinPulse * uSkinEmAnim.w;
`;

// Guarda en cada malla pintable su posición y normal en el espacio del arma (en reposo), para que el
// dibujo encaje entre piezas que cuelgan de grupos distintos (corredera, cargador).
export function bakeSkinSpace(mesh, root) {
  const g = mesh.geometry;
  if (g.attributes.skinPos) return;
  const m = new THREE.Matrix4();
  for (let o = mesh; o && o !== root; o = o.parent) { o.updateMatrix(); m.premultiply(o.matrix); }
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const p = g.attributes.position.clone().applyMatrix4(m);
  const n = g.attributes.normal.clone().applyNormalMatrix(nm);
  g.setAttribute('skinPos', p);
  g.setAttribute('skinNrm', n);
}

// Juego de materiales de una skin para un arma: `main` para el cuerpo y `accent` para los detalles.
// `box`: SKIN_BOX del arma. `base`: material original, del que se toma el normal map del grano.
class SkinSet {
  constructor(def, tex, box, base) {
    this.def = def;
    this.main = skinMaterial(def, tex, box, base, 1);
    this.accent = skinMaterial(def, tex, box, base, def.accent ?? 0.6);
  }

  dispose() {
    this.main.dispose(); this.accent.dispose();
    release(this.def.id);
  }
}

// Pide la skin `id` para un arma. `promise` da el SkinSet cuando está pintada (o null si se canceló);
// `cancel()` la suelta si ya no hace falta, esté lista o no.
export function loadSkinSet(id, box, base) {
  const def = skinById(id);
  const entry = acquire(def);
  let set = null; let cancelled = false;
  const promise = entry.ready.then((tex) => {
    if (cancelled) return null;
    if (!tex) { cancelled = true; release(def.id); return null; }
    set = new SkinSet(def, tex, box, base);
    return set;
  });
  return { promise, cancel: () => { if (cancelled) return; cancelled = true; if (set) set.dispose(); else release(def.id); } };
}

// Mallas diminutas con los materiales de skin (sin barniz y con él) para compilar sus shaders al cargar
// el juego, en vez de en el primer cambio de skin (tardaba casi un segundo). Se dibujan unos fotogramas
// delante de la cámara y luego se quitan; los materiales no se liberan, para que el programa siga en caché.
const warmMats = [];
export function skinWarmup(base) {
  const group = new THREE.Group();
  const g = new THREE.PlaneGeometry(0.00001, 0.00001); // menos de un píxel: no se llega a ver
  g.setAttribute('skinPos', g.attributes.position.clone());
  g.setAttribute('skinNrm', g.attributes.normal.clone());
  const tex = { map: blackPixel(), mr: blackPixel(), em: null };
  for (const clearcoat of [0, 1]) {
    const m = skinMaterial({ clearcoat }, tex, SKIN_BOX[0], base, 1);
    warmMats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false; mesh.receiveShadow = true;
    mesh.position.set(0, 0, -0.3);
    group.add(mesh);
  }
  return group;
}

function blackPixel() {
  if (!blackTex) { blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blackTex.needsUpdate = true; }
  return blackTex;
}
