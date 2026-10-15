// Botín en el mundo (partidas en línea): cofres de madera con herrajes dorados que se abren con F y vendas,
// botiquines y chalecos en el suelo, que se recogen al pasar por encima o con F mirándolos. Qué hay y quién se
// lleva cada cosa lo decide la sala (src/roomCore.js, con los datos de src/loot.js); aquí se dibuja y se anima.
// Todo va instanciado: los cofres son cinco mallas (cuerpo y tapa en madera y en dorado, más el brillo del
// interior) y los objetos, una por tipo más los haces de luz, sean cuantos sean.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, xform } from './geo.js';
import { makeCanvas, tex, heightToNormal } from './textures.js';
import { CHEST_SPOTS, ITEM } from './loot.js';
import { FRAME } from './sprites.js';
import { clamp, lerp, rand, smoothstep as ss } from './utils.js';

const MAX_CHESTS = 16;
const MAX_ITEMS = 48; // de cada tipo
// Cofre: ancho, fondo y alto del cuerpo; la tapa es un reborde recto y un arco encima. Frente hacia +Z.
const CW = 0.92; const CD = 0.56; const CH = 0.46;
const LIP = 0.05; const ARC = 0.2;
const LID_OPEN = 1.95; // giro de la tapa abierta (rad)
const OPEN_REACH = 2.5; // desde los ojos, para abrir con F
const TAKE_REACH = 2.6; // ídem para recoger con F
const FLY_TIME = 0.75; // vuelo de cada objeto desde el cofre hasta el suelo
const HOVER = 0.3; // altura a la que flotan los objetos
// Brillo de cada objeto (vendas, botiquín, chaleco): blanco, verde y azul, como la rareza.
const GLOW = [[0.75, 0.8, 0.85], [0.3, 0.95, 0.4], [0.25, 0.55, 1.4]];

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = {};

// ---------- Geometría ----------
// Pieza con color por vértice (las mallas instanciadas comparten material y se tiñen así).
function tint(g, hex) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const place = (g, ...t) => g.applyMatrix4(xform(...t));
const rbox = (w, h, d, r, ...t) => place(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), ...t);
// Caja con UV a escala (1 unidad = `tile` m) en cada cara, para que las tablas no se estiren.
function woodBox(w, h, d, tile, ...t) {
  const g = new THREE.BoxGeometry(w, h, d);
  const n = g.attributes.normal; const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)); const ay = Math.abs(n.getY(i));
    const [su, sv] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  return place(g, ...t);
}

// Perfil de la tapa (en z, y; z = 0 en la bisagra trasera) extruido a lo ancho (x), centrado en x = 0.
// `e` agranda el arco hacia fuera (para los flejes dorados, que van encima de la madera).
function lidShape(e = 0, inner = false) {
  const s = new THREE.Shape();
  const N = 20;
  s.moveTo(CD + e, 0); s.lineTo(CD + e, LIP);
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * Math.PI;
    s.lineTo(CD / 2 + (CD / 2 + e) * Math.cos(a), LIP + (ARC + e) * Math.sin(a));
  }
  s.lineTo(-e, 0);
  if (inner) {
    // Solo la banda entre el arco grande y el de la madera.
    s.lineTo(0, 0); s.lineTo(0, LIP);
    for (let i = N - 1; i >= 0; i--) {
      const a = (i / N) * Math.PI;
      s.lineTo(CD / 2 + (CD / 2) * Math.cos(a), LIP + ARC * Math.sin(a));
    }
    s.lineTo(CD, 0);
  }
  s.closePath();
  return s;
}
function extrudeX(shape, width, x = 0, uvTile = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2); // el perfil queda en (z, y) y la extrusión a lo ancho
  if (x) g.translate(x, 0, 0);
  // Las tablas (a lo largo de u en la textura) van a lo ancho del cofre.
  if (uvTile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) / uvTile, uv.getX(i) / uvTile); }
  return g;
}

const GOLD = 0xffffff; const DARK = 0x1a1410; const IRON = 0x6b5a40;
function chestGeometry() {
  const T = 0.045; // grosor de las paredes
  const wood = [
    woodBox(CW + 0.03, 0.05, CD + 0.03, 0.5, 0, 0.025, 0), // zócalo
    woodBox(CW - 2 * T, 0.04, CD - 2 * T, 0.5, 0, 0.07, 0), // fondo
    woodBox(CW, CH - 0.05, T, 0.5, 0, 0.05 + (CH - 0.05) / 2, CD / 2 - T / 2),
    woodBox(CW, CH - 0.05, T, 0.5, 0, 0.05 + (CH - 0.05) / 2, -CD / 2 + T / 2),
    woodBox(T, CH - 0.05, CD - 2 * T, 0.5, CW / 2 - T / 2, 0.05 + (CH - 0.05) / 2, 0),
    woodBox(T, CH - 0.05, CD - 2 * T, 0.5, -CW / 2 + T / 2, 0.05 + (CH - 0.05) / 2, 0),
  ].map((g) => tint(g, 0xffffff));
  const gold = [];
  const g = (geo, hex = GOLD) => gold.push(tint(geo, hex));
  // Esquineras en L, bandas de arriba y de abajo, y tachuelas.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g(rbox(0.075, CH - 0.02, 0.014, 0.004, sx * (CW / 2 - 0.0375 + 0.004), CH / 2 + 0.01, sz * (CD / 2 + 0.005)));
    g(rbox(0.014, CH - 0.02, 0.075, 0.004, sx * (CW / 2 + 0.005), CH / 2 + 0.01, sz * (CD / 2 - 0.0375 + 0.004)));
    for (const y of [0.1, CH / 2, CH - 0.08]) {
      g(place(new THREE.SphereGeometry(0.009, 8, 6), sx * (CW / 2 - 0.035), y, sz * (CD / 2 + 0.013)));
      g(place(new THREE.SphereGeometry(0.009, 8, 6), sx * (CW / 2 + 0.013), y, sz * (CD / 2 - 0.035)));
    }
  }
  for (const [y, h] of [[CH - 0.022, 0.04], [0.075, 0.035]]) {
    for (const sz of [-1, 1]) g(rbox(CW - 0.14, h, 0.01, 0.003, 0, y, sz * (CD / 2 + 0.004)));
    for (const sx of [-1, 1]) g(rbox(0.01, h, CD - 0.14, 0.003, sx * (CW / 2 + 0.004), y, 0));
  }
  // Placa de la cerradura en el frente, con el ojo oscuro.
  g(rbox(0.12, 0.1, 0.016, 0.01, 0, CH - 0.085, CD / 2 + 0.008));
  g(place(new THREE.CylinderGeometry(0.011, 0.011, 0.01, 12), 0, CH - 0.078, CD / 2 + 0.017, Math.PI / 2, 0, 0), DARK);
  g(rbox(0.008, 0.024, 0.01, 0.002, 0, CH - 0.097, CD / 2 + 0.017), DARK);
  // Asas de hierro en los costados.
  for (const sx of [-1, 1]) {
    g(place(new THREE.TorusGeometry(0.045, 0.009, 6, 14, Math.PI), sx * (CW / 2 + 0.03), CH - 0.15, 0, 0, Math.PI / 2, Math.PI), IRON);
    g(rbox(0.016, 0.03, 0.12, 0.004, sx * (CW / 2 + 0.01), CH - 0.15, 0), IRON);
  }
  return { wood: mergeGeometries(wood, false), gold: mergeGeometries(gold, false) };
}

// Tapa en su propio espacio: bisagra en el origen, la tapa se extiende hacia +Z (el frente).
function lidGeometry() {
  const wood = [tint(extrudeX(lidShape(), CW + 0.02, 0, 0.5), 0xffffff)];
  // Cara interior oscura (se ve al abrirla).
  wood.push(tint(place(new THREE.PlaneGeometry(CW - 0.04, CD - 0.04), 0, 0.002, CD / 2, Math.PI / 2, 0, 0), 0x6a5040));
  const gold = [];
  const g = (geo, hex = GOLD) => gold.push(tint(geo, hex));
  for (const x of [-0.3, 0.3]) g(extrudeX(lidShape(0.012, true), 0.065, x));
  for (const x of [-(CW / 2 + 0.005), CW / 2 + 0.005]) g(extrudeX(lidShape(0.004, false), 0.014, x));
  g(rbox(CW + 0.03, 0.03, 0.014, 0.004, 0, 0.022, CD + 0.006)); // borde frontal
  g(rbox(CW + 0.03, 0.03, 0.014, 0.004, 0, 0.022, -0.006)); // borde trasero
  // Pasador de la cerradura: cuelga del borde de la tapa sobre la placa del cuerpo.
  g(rbox(0.07, 0.11, 0.014, 0.01, 0, -0.012, CD + 0.02));
  g(place(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), 0, -0.04, CD + 0.028, Math.PI / 2, 0, 0), DARK);
  // Tachuelas en los flejes.
  for (const x of [-0.3, 0.3]) {
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      g(place(new THREE.SphereGeometry(0.01, 8, 6), x, LIP + (ARC + 0.012) * Math.sin(a), CD / 2 + (CD / 2 + 0.012) * Math.cos(a)));
    }
  }
  return { wood: mergeGeometries(wood, false), gold: mergeGeometries(gold, false) };
}

// Madera del cofre: tablas horizontales de tono cálido, con juntas oscuras y veta.
function woodTextures() {
  const S = 256;
  const a = makeCanvas(S); const h = makeCanvas(S);
  const ca = a.getContext('2d'); const ch = h.getContext('2d');
  const rows = 4; const ph = S / rows;
  let seed = 7;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let r = 0; r < rows; r++) {
    const y = r * ph; const t = (R() - 0.5) * 26;
    ca.fillStyle = `rgb(${150 + t},${92 + t * 0.7},${48 + t * 0.4})`; ca.fillRect(0, y, S, ph);
    ch.fillStyle = '#909090'; ch.fillRect(0, y, S, ph);
    for (let i = 0; i < 26; i++) {
      const off = y + R() * ph; const dark = R() < 0.65;
      ca.strokeStyle = dark ? `rgba(70,38,16,${0.15 + R() * 0.3})` : `rgba(230,170,110,${0.08 + R() * 0.12})`;
      ch.strokeStyle = dark ? 'rgba(60,60,60,0.35)' : 'rgba(190,190,190,0.25)';
      for (const c of [ca, ch]) {
        c.lineWidth = 0.6 + R() * 1.2;
        c.beginPath(); c.moveTo(0, off);
        c.bezierCurveTo(S * 0.3, off + (R() - 0.5) * 6, S * 0.7, off + (R() - 0.5) * 6, S, off);
        c.stroke();
      }
    }
    // Nudo.
    const kx = R() * S; const ky = y + ph * (0.3 + R() * 0.4);
    ca.fillStyle = 'rgba(60,30,12,0.55)'; ca.beginPath(); ca.ellipse(kx, ky, 7, 3.5, 0, 0, Math.PI * 2); ca.fill();
    // Junta entre tablas.
    ca.fillStyle = 'rgb(40,22,10)'; ca.fillRect(0, y, S, 3);
    ch.fillStyle = '#000'; ch.fillRect(0, y, S, 3);
  }
  const map = tex(a, { srgb: true });
  const normalMap = tex(heightToNormal(h, 3));
  return { map, normalMap };
}

// Brillo suave (para el halo de los cofres y el interior al abrirse).
function glowTexture() {
  const c = makeCanvas(64); const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, { srgb: true, wrap: false });
}

// Haz de luz de los objetos: dos planos cruzados con degradado hacia arriba y un anillo en el suelo.
// La textura lleva el haz en la mitad izquierda y el anillo en la derecha.
function beamGeometry() {
  const c = makeCanvas(128, 64); const g = c.getContext('2d');
  for (let x = 0; x < 64; x++) {
    const k = Math.pow(Math.sin((x / 63) * Math.PI), 2);
    const gr = g.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); gr.addColorStop(0.5, `rgba(255,255,255,${0.25 * k})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, 0, 1, 64);
  }
  const rg = g.createRadialGradient(96, 32, 0, 96, 32, 31);
  rg.addColorStop(0, 'rgba(255,255,255,0.25)'); rg.addColorStop(0.7, 'rgba(255,255,255,0.5)'); rg.addColorStop(0.85, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(64, 0, 64, 64);
  const quad = (w, h, rotY, u0, u1) => {
    const p = new THREE.PlaneGeometry(w, h);
    p.translate(0, h / 2, 0); p.rotateY(rotY);
    const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, lerp(u0, u1, uv.getX(i)));
    return p;
  };
  const ring = new THREE.PlaneGeometry(0.9, 0.9); ring.rotateX(-Math.PI / 2); ring.translate(0, 0.02, 0);
  const uv = ring.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, lerp(0.5, 1, uv.getX(i)));
  const geo = mergeGeometries([quad(0.5, 1.5, 0, 0, 0.5), quad(0.5, 1.5, Math.PI / 2, 0, 0.5), ring], false);
  return { geo, map: tex(c, { srgb: true, wrap: false }) };
}

// Objetos del suelo, a escala real y con el centro en el origen.
function itemGeometry(type) {
  const parts = [];
  const add = (geo, hex) => parts.push(tint(geo, hex));
  if (type === ITEM.BANDAGE) {
    // Dos rollos de venda atados con una cinta y una cruz roja.
    for (const x of [-0.058, 0.058]) {
      add(place(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 20), x, 0, 0, Math.PI / 2, 0, 0), 0xebe4d2);
      add(place(new THREE.CylinderGeometry(0.018, 0.018, 0.102, 10), x, 0, 0, Math.PI / 2, 0, 0), 0x9a8f7a);
    }
    add(rbox(0.235, 0.118, 0.03, 0.01, 0, 0, 0), 0x3d6fa8);
    add(rbox(0.05, 0.014, 0.034, 0.003, 0, 0.0545, 0), 0xc8221a);
    add(rbox(0.014, 0.05, 0.034, 0.003, 0, 0.0545, 0, Math.PI / 2, 0, 0), 0xc8221a);
  } else if (type === ITEM.MEDKIT) {
    // Maletín rojo con cruz blanca por las dos caras, asa arriba y cierres.
    add(rbox(0.32, 0.2, 0.1, 0.02, 0, 0, 0), 0xb3261e);
    add(rbox(0.33, 0.012, 0.106, 0.004, 0, 0.035, 0), 0x8c1d17); // junta de la tapa
    for (const sz of [-1, 1]) {
      add(place(new THREE.BoxGeometry(0.11, 0.035, 0.004), 0, -0.02, sz * 0.051), 0xf2f0ea);
      add(place(new THREE.BoxGeometry(0.035, 0.11, 0.004), 0, -0.02, sz * 0.051), 0xf2f0ea);
    }
    add(place(new THREE.TorusGeometry(0.04, 0.009, 6, 14, Math.PI), 0, 0.1, 0), 0x202224);
    for (const sx of [-1, 1]) add(rbox(0.03, 0.03, 0.02, 0.004, sx * 0.1, 0.06, 0.05), 0xb0b4b8);
  } else {
    // Chaleco: placa delantera con portacargadores, hombreras y placa trasera.
    const olive = 0x4c5638; const dark = 0x353c27;
    add(rbox(0.34, 0.4, 0.06, 0.03, 0, 0, 0.07), olive);
    add(rbox(0.32, 0.38, 0.05, 0.03, 0, 0.01, -0.08), olive);
    for (let i = -1; i <= 1; i++) add(rbox(0.09, 0.13, 0.05, 0.012, i * 0.1, -0.1, 0.115), dark);
    for (let i = -1; i <= 1; i++) add(rbox(0.07, 0.03, 0.054, 0.008, i * 0.1, -0.03, 0.117), olive);
    add(rbox(0.16, 0.07, 0.012, 0.006, 0, 0.1, 0.105), 0x7d8288); // parche
    for (const sx of [-1, 1]) {
      add(rbox(0.07, 0.03, 0.2, 0.01, sx * 0.11, 0.205, -0.005), dark); // hombreras
      add(rbox(0.03, 0.2, 0.17, 0.01, sx * 0.175, -0.07, -0.005), dark); // faja
    }
    add(rbox(0.2, 0.045, 0.012, 0.006, 0, 0.17, 0.104), 0x3a7bd5); // tira reflectante azul
  }
  return mergeGeometries(parts, false);
}

// ---------- Mundo ----------
export class LootWorld {
  constructor(scene, fx, audio) {
    this.fx = fx; this.audio = audio;
    this.group = new THREE.Group();
    scene.add(this.group);
    const { map, normalMap } = woodTextures();
    // Un poco de brillo propio para que de noche no quede en negro.
    const woodMat = new THREE.MeshStandardMaterial({ map, normalMap, vertexColors: true, roughness: 0.72, metalness: 0, emissive: 0x3a1c08, emissiveMap: map, emissiveIntensity: 0.35 });
    woodMat.normalScale.set(0.8, 0.8);
    // Dorado: algo de brillo propio para que se vea también de noche.
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe0a83c, vertexColors: true, roughness: 0.3, metalness: 1, emissive: 0x4a3008, emissiveIntensity: 0.6 });
    const mk = (geo, mat, count = MAX_CHESTS, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    const body = chestGeometry(); const lid = lidGeometry();
    this.bodyWood = mk(body.wood, woodMat); this.bodyGold = mk(body.gold, goldMat);
    this.lidWood = mk(lid.wood, woodMat); this.lidGold = mk(lid.gold, goldMat);
    const glowMap = glowTexture();
    const add = (map2) => new THREE.MeshBasicMaterial({ map: map2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
    // Brillo del interior al abrirse y halo del cofre lleno (mirando a cámara).
    const inner = new THREE.PlaneGeometry(CW - 0.12, CD - 0.12); inner.rotateX(-Math.PI / 2);
    this.inner = mk(inner, add(glowMap), MAX_CHESTS, false);
    this.halo = mk(new THREE.PlaneGeometry(1, 1), add(glowMap), MAX_CHESTS, false);
    for (const m of [this.inner, this.halo]) { m.receiveShadow = false; m.renderOrder = 6; m.setColorAt(0, _c.set(0)); }
    // Objetos y sus haces de luz.
    const itemMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.05 });
    this.itemMeshes = [ITEM.BANDAGE, ITEM.MEDKIT, ITEM.VEST].map((t) => mk(itemGeometry(t), itemMat, MAX_ITEMS, false));
    const beam = beamGeometry();
    this.beams = mk(beam.geo, add(beam.map), MAX_ITEMS * 3, false);
    this.beams.receiveShadow = false; this.beams.renderOrder = 6;
    this.beams.setColorAt(0, _c.set(0));

    this.chests = []; // { s, x, y, z, yaw, open, lid, glow, col, humT }
    this.items = new Map(); // id -> { id, type, x, y, z, t, fly }
    this.col = null;
    this.t = 0;
  }

  // ---------- Estado (mensajes de la sala) ----------
  // Empieza una partida en el mapa `map` con colisiones `col`: { chests: [[sitio, abierto]], items: [[id, tipo, x, y, z]] }.
  start(info, map, col) {
    this.clear();
    this.col = col; this.map = map;
    this.setChests(info.chests || []);
    for (const d of info.items || []) this.addItem(d, null);
  }

  // Quita todo (al salir de la partida o cambiar de mapa).
  clear() {
    for (const ch of this.chests) this.col?.remove(ch.col);
    this.chests = [];
    this.items.clear();
    this.col = null;
    for (const m of [this.bodyWood, this.bodyGold, this.lidWood, this.lidGold, this.inner, this.halo, this.beams, ...this.itemMeshes]) m.count = 0;
  }

  // Lista de cofres de la sala: [[sitio, abierto], ...]. Los que ya estaban se animan si cambian.
  setChests(list) {
    if (!this.col) return;
    list.forEach(([s, open], i) => {
      let ch = this.chests[i];
      if (!ch || ch.s !== s) {
        if (ch) this.col.remove(ch.col);
        const [x, z, yaw] = CHEST_SPOTS[this.map][s];
        const y = Math.max(0, this.col.groundHeight(x, z, 0.4, 0.5, 0.2));
        // Sólido para moverse y para las balas, pero no tapa la vista (la IA no juega en línea).
        const col = this.col.addBox(x, z, CW, CD, y, y + CH + LIP + ARC * 0.7, yaw, 'wood', { sight: false });
        ch = { s, x, y, z, yaw, open: !!open, lid: open ? 1 : 0, glow: 0, col, humT: rand(0, 2) };
        this.chests[i] = ch;
      } else if (ch.open && !open) {
        ch.open = false; // vuelve a tener botín: la tapa se cierra sola (ver update)
      } else ch.open = !!open;
    });
    for (let i = list.length; i < this.chests.length; i++) this.col.remove(this.chests[i].col);
    this.chests.length = list.length;
  }

  // Se abre el cofre `i`: la tapa sube, sale un destello y los objetos salen volando hasta donde caen.
  onLoot(i, items) {
    const ch = this.chests[i];
    if (!ch) { for (const d of items) this.addItem(d, null); return; }
    ch.open = true; ch.glow = 1;
    const fx = this.fx;
    const cy = ch.y + CH;
    fx.flash(1, ch.x, cy + 0.4, ch.z, 0xffc050, 90, 0.6);
    for (let k = 0; k < 34; k++) {
      fx.add.emit({
        x: ch.x + rand(-0.3, 0.3), y: cy + rand(0, 0.1), z: ch.z + rand(-0.2, 0.2),
        vx: rand(-1, 1), vy: rand(1.2, 3), vz: rand(-1, 1), gravity: -3.5, drag: 1.4,
        life: rand(0.6, 1.3), size: rand(0.025, 0.05), sizeEnd: 0, frame: FRAME.GLOW, r: 3, g: 2, b: 0.6,
      });
    }
    this.audio.chestOpen(ch.x, cy, ch.z);
    items.forEach((d, k) => this.addItem(d, { x: ch.x, y: cy - 0.05, z: ch.z, delay: 0.18 + k * 0.14 }));
  }

  // Objeto que deja un jugador al caer: salta un poco desde donde estaba.
  drop(d) { this.addItem(d, { x: d[2], y: d[3] + 0.9, z: d[4], delay: 0 }); }

  addItem(d, from) {
    const [id, type, x, y, z] = d;
    const gy = this.col ? this.col.groundHeight(x, z, y + 0.6, 0.7, 0.1) : y;
    this.items.set(id, { id, type, x, y: gy, z, t: rand(0, 6), fly: from ? { ...from, t: -from.delay } : null });
  }

  // Alguien se ha llevado el objeto (o ha caducado).
  remove(id, sparkle = true) {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);
    if (sparkle && !it.fly) {
      const c = GLOW[it.type];
      for (let k = 0; k < 8; k++) {
        this.fx.add.emit({ x: it.x, y: it.y + HOVER, z: it.z, vx: rand(-0.6, 0.6), vy: rand(0.4, 1.4), vz: rand(-0.6, 0.6), drag: 2, life: rand(0.3, 0.6), size: 0.03, sizeEnd: 0, frame: FRAME.GLOW, r: c[0] * 2, g: c[1] * 2, b: c[2] * 2 });
      }
    }
  }

  // ---------- Consultas ----------
  // Qué se está mirando desde la cámara: { kind: 'chest', i } (cerrado), { kind: 'item', item } o null.
  target(camera) {
    if (!this.col) return null;
    camera.getWorldPosition(_o); camera.getWorldDirection(_d);
    const wall = this.col.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, TAKE_REACH, 'sight', _hit, true);
    let best = null; let bd = wall ? wall.dist : TAKE_REACH;
    this.chests.forEach((ch, i) => {
      if (ch.open || ch.lid > 0.05) return;
      // Rayo contra la caja del cofre, en su espacio.
      const c = Math.cos(ch.yaw); const s = Math.sin(ch.yaw);
      const ox = _o.x - ch.x; const oz = _o.z - ch.z;
      const lo = [ox * c - oz * s, _o.y - ch.y, ox * s + oz * c];
      const ld = [_d.x * c - _d.z * s, _d.y, _d.x * s + _d.z * c];
      const lo0 = [-CW / 2 - 0.06, 0, -CD / 2 - 0.06]; const hi0 = [CW / 2 + 0.06, CH + LIP + ARC + 0.06, CD / 2 + 0.06];
      let t0 = 0; let t1 = OPEN_REACH;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(ld[k]) < 1e-6) { if (lo[k] < lo0[k] || lo[k] > hi0[k]) return; continue; }
        let ta = (lo0[k] - lo[k]) / ld[k]; let tb = (hi0[k] - lo[k]) / ld[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) return;
      }
      if (t0 < bd + 0.3) { bd = t0; best = { kind: 'chest', i }; }
    });
    for (const it of this.items.values()) {
      if (it.fly) continue;
      const cx = it.x - _o.x; const cy = it.y + HOVER - _o.y; const cz = it.z - _o.z;
      const along = cx * _d.x + cy * _d.y + cz * _d.z;
      if (along < 0 || along > bd) continue;
      const off = cx * cx + cy * cy + cz * cz - along * along;
      if (off < 0.32 * 0.32) { bd = along; best = { kind: 'item', item: it }; }
    }
    return best;
  }

  // Objetos a menos de `r` m de (x, y, z) que ya están en el suelo (se recogen al pasar por encima).
  *near(x, y, z, r) {
    for (const it of this.items.values()) if (!it.fly && Math.hypot(it.x - x, it.z - z) < r && Math.abs(it.y - y) < 1.2) yield it;
  }

  // ---------- Animación ----------
  update(dt, camera) {
    this.t += dt;
    const t = this.t;
    camera.getWorldPosition(_o);
    // Cofres.
    const n = this.chests.length;
    for (const m of [this.bodyWood, this.bodyGold, this.lidWood, this.lidGold, this.inner, this.halo]) m.count = n;
    this.chests.forEach((ch, i) => {
      ch.lid = clamp(ch.lid + (ch.open ? dt / 0.45 : -dt / 0.6), 0, 1);
      ch.glow = Math.max(0, ch.glow - dt * 0.7);
      const open = ch.open ? 1 - (1 - ch.lid) ** 3 : ss(0, 1, ch.lid); // se abre de golpe y se cierra suave
      _m.compose(_p.set(ch.x, ch.y, ch.z), _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ch.yaw), _s.set(1, 1, 1));
      this.bodyWood.setMatrixAt(i, _m); this.bodyGold.setMatrixAt(i, _m);
      _m2.compose(_p.set(0, CH, -CD / 2), _q.setFromEuler(_e.set(-LID_OPEN * open, 0, 0)), _s);
      _m2.premultiply(_m);
      this.lidWood.setMatrixAt(i, _m2); this.lidGold.setMatrixAt(i, _m2);
      // Interior que brilla al abrirse y se apaga.
      _m2.compose(_p.set(0, CH - 0.06, 0), _q.identity(), _s.set(1, 1, 1)).premultiply(_m);
      this.inner.setMatrixAt(i, _m2);
      this.inner.setColorAt(i, _c.setRGB(2.4, 1.6, 0.6).multiplyScalar(ch.glow * open));
      // Halo y destellos mientras está lleno y cerrado.
      const full = !ch.open && ch.lid < 0.02;
      const dist = Math.hypot(ch.x - _o.x, ch.z - _o.z);
      const pulse = full ? 0.55 + 0.25 * Math.sin(t * 2.6 + i) : 0;
      _p.set(ch.x, ch.y + CH * 0.85, ch.z);
      camera.getWorldQuaternion(_q);
      this.halo.setMatrixAt(i, _m2.compose(_p, _q, _s.set(1.5, 1.2, 1)));
      this.halo.setColorAt(i, _c.setRGB(0.9, 0.6, 0.18).multiplyScalar(pulse));
      if (full && dist < 45 && Math.random() < dt * 7) {
        const a = rand(0, Math.PI * 2);
        this.fx.add.emit({
          x: ch.x + Math.cos(a) * rand(0.2, 0.5), y: ch.y + rand(0.3, CH + 0.25), z: ch.z + Math.sin(a) * rand(0.15, 0.35),
          vx: rand(-0.05, 0.05), vy: rand(0.15, 0.4), vz: rand(-0.05, 0.05), life: rand(0.8, 1.5), size: rand(0.018, 0.035), sizeEnd: 0,
          frame: FRAME.GLOW, r: 2.6, g: 1.8, b: 0.55, fadeIn: 0.25,
        });
      }
      if (full && dist < 9 && (ch.humT -= dt) <= 0) { ch.humT = rand(1.8, 2.8); this.audio.chestHum(ch.x, ch.y + 0.5, ch.z); }
    });
    for (const m of [this.bodyWood, this.bodyGold, this.lidWood, this.lidGold, this.inner, this.halo]) m.instanceMatrix.needsUpdate = true;
    this.inner.instanceColor.needsUpdate = true; this.halo.instanceColor.needsUpdate = true;

    // Objetos: vuelan del cofre (o del caído) al suelo y luego flotan girando.
    const counts = [0, 0, 0]; let nb = 0;
    for (const it of this.items.values()) {
      it.t += dt;
      let x = it.x; let y = it.y + HOVER + Math.sin(it.t * 2.1) * 0.035; let z = it.z;
      let spin = it.t * 1.3; let tilt = 0.18 * Math.sin(it.t * 1.1);
      let beamK = 1;
      const f = it.fly;
      if (f) {
        f.t += dt;
        const k = clamp(f.t / FLY_TIME, 0, 1);
        if (f.t < 0) { x = f.x; y = f.y; z = f.z; beamK = 0; } else {
          x = lerp(f.x, it.x, k); z = lerp(f.z, it.z, k);
          y = lerp(f.y, it.y + HOVER, k) + Math.sin(Math.PI * k) * 0.9;
          spin += (1 - k) * 9; tilt += (1 - k) * 2;
          beamK = k * k;
        }
        if (f.t < 0 || k < 1) {
          if (f.t >= 0 && Math.random() < dt * 40) {
            const c = GLOW[it.type];
            this.fx.add.emit({ x, y, z, life: 0.35, size: 0.04, sizeEnd: 0, frame: FRAME.GLOW, r: c[0] * 2.5, g: c[1] * 2.5, b: c[2] * 2.5 });
          }
        } else it.fly = null;
        if (f.t < 0) continue; // aún dentro del cofre
      }
      const mesh = this.itemMeshes[it.type];
      const i = counts[it.type]++;
      if (i >= MAX_ITEMS) continue;
      _q.setFromEuler(_e.set(tilt, spin, 0, 'YXZ'));
      mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1)));
      if (nb < MAX_ITEMS * 3) {
        this.beams.setMatrixAt(nb, _m.compose(_p.set(it.x, it.y, it.z), _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t * 0.4), _s.set(1, 1, 1)));
        const c = GLOW[it.type];
        this.beams.setColorAt(nb, _c.setRGB(c[0], c[1], c[2]).multiplyScalar(0.32 * beamK * (0.85 + 0.15 * Math.sin(t * 3 + it.id))));
        nb++;
      }
    }
    this.itemMeshes.forEach((m, k) => { m.count = Math.min(MAX_ITEMS, counts[k]); m.instanceMatrix.needsUpdate = true; });
    this.beams.count = nb;
    this.beams.instanceMatrix.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
  }
}
