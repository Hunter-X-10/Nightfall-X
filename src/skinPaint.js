// Catálogo y pintura de las skins (ver src/skins.js). Sin three.js: lo usan tanto el juego como los workers
// que pintan las texturas fuera del hilo principal (src/skinWorker.js).

// Rarezas, de menos a más (colores al estilo de los shooters).
export const RARITY = [
  { name: 'COMÚN', color: '#b0c3d9' },
  { name: 'RARA', color: '#4b69ff' },
  { name: 'ÉPICA', color: '#8847ff' },
  { name: 'LEGENDARIA', color: '#d32ce6' },
  { name: 'MÍTICA', color: '#eb4b4b' },
];

// Tamaño de los lienzos: el ancho cubre el largo del arma y el alto, la mitad (píxeles cuadrados).
export const W = 1024; export const H = 512;

// ---------- Ruido ----------
function hash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Ruido de valor. `p`: periodo en X (en celdas) para que se repita sin costura; 0 = sin periodo.
function vnoise(x, y, s, p = 0) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const fx = x - xi; const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx); const uy = fy * fy * (3 - 2 * fy);
  const x0 = p ? ((xi % p) + p) % p : xi; const x1 = p ? (((xi + 1) % p) + p) % p : xi + 1;
  const a = hash(x0, yi, s); const b = hash(x1, yi, s); const c = hash(x0, yi + 1, s); const d = hash(x1, yi + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, s, oct = 4, p = 0) {
  let v = 0; let a = 0.5; let f = 1; let n = 0;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17, p * f); n += a; a *= 0.5; f *= 2; }
  return v / n;
}
// Voronoi: distancia al punto más cercano y al segundo (para grietas y celdas).
function voronoi(x, y, s) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  let d1 = 9; let d2 = 9; let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i; const cy = yi + j;
      const dx = cx + hash(cx, cy, s) - x; const dy = cy + hash(cx, cy, s + 1) - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; id = hash(cx, cy, s + 2); } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// ---------- Pintura ----------
// Cada pintor recibe (x, y, o): x de 0 a 2 a lo largo del arma (0 = boca), y de 0 a 1 de arriba abajo, en
// las mismas unidades; rellena o.c (color sRGB 0-1), o.rough, o.metal y, si emite, o.e (color de emisión).
function set(o, c, k = 1) { o.c[0] = c[0] * k; o.c[1] = c[1] * k; o.c[2] = c[2] * k; }
function mix(o, c, t) { o.c[0] += (c[0] - o.c[0]) * t; o.c[1] += (c[1] - o.c[1]) * t; o.c[2] += (c[2] - o.c[2]) * t; }
function mixC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
// Rampa de colores: stops = [[t, color], …] ordenados.
function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) { const [t0, c0] = stops[i - 1]; const [t1, c1] = stops[i]; return mixC(c0, c1, sstep(0, 1, (t - t0) / (t1 - t0))); }
  }
  return stops[stops.length - 1][1];
}

// Desgaste de la pintura: arañazos finos y desconchones que dejan ver el metal.
const BARE = rgb(0x7c7f83);
function wear(o, x, y, s, k = 1) {
  const chip = fbm(x * 70, y * 70, s + 300, 3);
  const scratch = vnoise(x * 420 + y * 40, y * 7 + x * 2, s + 400);
  if (chip > 0.8 - 0.05 * k || scratch > 1 - 0.018 * k) { set(o, BARE); o.metal = 0.85; o.rough = 0.5; return; }
  // Suciedad suave: la pintura no es uniforme.
  const g = fbm(x * 9, y * 9, s + 500, 3);
  const d = 0.88 + g * 0.22;
  o.c[0] *= d; o.c[1] *= d; o.c[2] *= d;
  o.rough = Math.min(1, o.rough + (g - 0.5) * 0.15);
}

// Camuflaje por capas: cada capa es un ruido con su escala (ancho, alto) y umbral; gana la última que lo supera.
function camo(layers, s, digital = 0) {
  return (x, y, o) => {
    if (digital) { x = Math.floor(x * digital) / digital; y = Math.floor(y * digital) / digital; }
    set(o, layers[0][0]);
    for (let i = 1; i < layers.length; i++) {
      const [c, sx, sy, th] = layers[i];
      if (fbm(x * sx, y * sy, s + i * 31, 4) > th) set(o, c);
    }
  };
}

const PAINT = { rough: 0.72, metal: 0.04 };

// Catálogo, en el orden de la armería. `rarity`: índice de RARITY. `accent`: brillo de los detalles
// (piezas oscuras del arma) respecto al cuerpo. `clearcoat`: barniz brillante encima. `emit`: intensidad de
// la emisión; `scroll` la desplaza por el arma (u por segundo) y `pulse` = [velocidad, profundidad].
export const SKINS = [
  { id: 'none', name: 'DE FÁBRICA', rarity: 0 },
  {
    id: 'woodland', name: 'BOSQUE', rarity: 0, accent: 0.6,
    paint: (() => {
      const f = camo([[rgb(0x8f8661)], [rgb(0x4d5a33), 3, 6, 0.48], [rgb(0x5a4330), 3.4, 7, 0.56], [rgb(0x1d1c1a), 4.6, 9, 0.62]], 11);
      return (x, y, o) => { f(x, y, o); Object.assign(o, PAINT); wear(o, x, y, 11); };
    })(),
  },
  {
    id: 'desert', name: 'DESIERTO DIGITAL', rarity: 0, accent: 0.6,
    paint: (() => {
      const f = camo([[rgb(0x9c8663)], [rgb(0xad9c7a), 3, 5, 0.5], [rgb(0x8e7150), 4, 6, 0.55], [rgb(0x5f4c37), 5, 8, 0.63]], 23, 128);
      return (x, y, o) => { f(x, y, o); Object.assign(o, PAINT); wear(o, x, y, 23); };
    })(),
  },
  {
    id: 'urban', name: 'ASTILLA URBANA', rarity: 0, accent: 0.6,
    paint: (x, y, o) => {
      // Astillas: ruido estirado en una diagonal y cortado en seco.
      const a = x * 0.87 - y * 0.5; const b = x * 0.5 + y * 0.87;
      set(o, rgb(0x7d8083));
      if (fbm(a * 1.6, b * 9, 41, 3) > 0.52) set(o, rgb(0x5c6064));
      if (fbm(a * 2.2, b * 12, 43, 3) > 0.6) set(o, rgb(0x34373b));
      if (fbm(a * 2.8, b * 15, 47, 3) > 0.66) set(o, rgb(0xa2a4a6));
      Object.assign(o, PAINT); wear(o, x, y, 41);
    },
  },
  {
    id: 'arctic', name: 'ÁRTICO', rarity: 0, accent: 0.7,
    paint: (() => {
      const f = camo([[rgb(0x969da2)], [rgb(0x788188), 3, 6, 0.5], [rgb(0x566067), 4, 8, 0.6], [rgb(0x3d444a), 6, 11, 0.68]], 53);
      return (x, y, o) => { f(x, y, o); Object.assign(o, PAINT); wear(o, x, y, 53, 0.6); };
    })(),
  },
  {
    id: 'redtiger', name: 'TIGRE ROJO', rarity: 1, accent: 0.55, clearcoat: 0.25,
    paint: (x, y, o) => {
      set(o, mixC(rgb(0xb0221b), rgb(0x8a1712), fbm(x * 6, y * 6, 61, 3)));
      // Rayas de tigre: ondas a lo ancho del arma, deformadas y afinadas hacia los bordes.
      const w = fbm(x * 3, y * 1.6, 63, 4);
      const d = Math.sin(x * 34 + w * 10);
      const taper = Math.abs(y - 0.5 + (fbm(x * 2, 0, 65, 2) - 0.5) * 0.4) * 1.3;
      if (d > 0.35 + taper && fbm(x * 5, y * 5, 67, 3) > 0.32) set(o, rgb(0x141010));
      o.rough = 0.55; o.metal = 0.05;
      wear(o, x, y, 61, 0.7);
    },
  },
  {
    id: 'blued', name: 'PAVONADO', rarity: 1, accent: 0.8, grain: 0.2, env: 1.6,
    paint: (x, y, o) => {
      // Acero pavonado: azul muy oscuro con vetas de pulido a lo largo y tornasol suave.
      const g = fbm(x * 3, y * 3, 71, 4);
      set(o, mixC(rgb(0x1f3256), rgb(0x2e2850), sstep(0.55, 0.75, g)));
      const streak = vnoise(x * 3, y * 260, 73);
      const k = 0.85 + streak * 0.3;
      o.c[0] *= k; o.c[1] *= k; o.c[2] *= k;
      o.rough = 0.28 + streak * 0.14; o.metal = 0.9;
    },
  },
  {
    id: 'carbon', name: 'FIBRA DE CARBONO', rarity: 1, accent: 0.75, clearcoat: 1, grain: 0.1,
    paint: (x, y, o) => {
      // Sarga 2x2: cada celda es una mecha horizontal o vertical, sombreada como un hilo redondo.
      const px = (x / 2) * W; const py = y * H; const c = 7;
      const i = Math.floor(px / c); const j = Math.floor(py / c);
      const horiz = (((i + j) % 4) + 4) % 4 < 2;
      const f = horiz ? (py / c - j) : (px / c - i);
      const shade = Math.sin(f * Math.PI);
      const base = horiz ? 0.12 : 0.085;
      const v = base + shade * 0.07 + (hash(i, j, 79) - 0.5) * 0.015;
      set(o, [v, v * 1.02, v * 1.08]);
      o.rough = 0.42 - shade * 0.12; o.metal = 0;
    },
  },
  {
    id: 'widow', name: 'VIUDA NEGRA', rarity: 1, accent: 0.55, clearcoat: 0.2,
    paint: (() => {
      const centers = [[0.3, 0.42], [0.95, 0.62], [1.62, 0.38]];
      const N = 14; const seg = (Math.PI * 2) / N;
      return (x, y, o) => {
        set(o, mixC(rgb(0x9a1a16), rgb(0x6e100d), fbm(x * 5, y * 5, 81, 3)));
        let best = 9; let dx = 0; let dy = 0;
        for (const [cx, cy] of centers) { const ex = x - cx; const ey = y - cy; const d = ex * ex + ey * ey; if (d < best) { best = d; dx = ex; dy = ey; } }
        const r = Math.sqrt(best);
        const ang = Math.atan2(dy, dx) + Math.PI;
        const a = (ang % seg) - seg / 2; // ángulo desde el centro del sector
        const spoke = r * Math.sin(seg / 2 - Math.abs(a));
        // Hilos entre radios, con algo de comba.
        const rp = (r * Math.cos(a)) / Math.cos(seg / 2) + 0.008 * (1 - (a / (seg / 2)) ** 2);
        const f = rp * 26; const ring = (Math.min(f - Math.floor(f), Math.ceil(f) - f)) / 26;
        const line = Math.min(spoke, ring);
        if (line < 0.0028 && r > 0.012) set(o, rgb(0x0d0b0b));
        o.rough = 0.5; o.metal = 0.05;
        wear(o, x, y, 81, 0.6);
      };
    })(),
  },
  {
    id: 'rust', name: 'ÓXIDO', rarity: 1, accent: 0.75, grain: 1.6,
    paint: (x, y, o) => {
      const n = fbm(x * 5, y * 5, 91, 5);
      const speck = vnoise(x * 160, y * 160, 93);
      const rust = sstep(0.42, 0.58, n + (speck - 0.5) * 0.12);
      set(o, mixC(rgb(0x55595e), mixC(rgb(0x6b3a1f), rgb(0xa4572a), fbm(x * 14, y * 14, 95, 3)), rust));
      o.rough = 0.45 + rust * 0.5; o.metal = 0.9 - rust * 0.85;
    },
  },
  {
    id: 'temper', name: 'TEMPLE', rarity: 2, accent: 0.8, grain: 0.12, env: 1.6, clearcoat: 0.3,
    paint: (x, y, o) => {
      // Endurecido en caja: manchas azules, moradas y doradas sobre el acero, como de haberlo calentado.
      const q = fbm(x * 4, y * 4, 101, 4);
      const n = fbm(x * 6 + q * 3, y * 6 + q * 3, 103, 5);
      const c = ramp([[0.3, rgb(0x1d3a86)], [0.4, rgb(0x2f56a8)], [0.47, rgb(0x6a4b92)], [0.53, rgb(0x8d9095)], [0.6, rgb(0x9d7c3f)], [0.7, rgb(0xd0aa52)]], n);
      set(o, c, 0.9 + vnoise(x * 60, y * 60, 105) * 0.15);
      o.rough = 0.2 + fbm(x * 8, y * 8, 107, 2) * 0.12; o.metal = 0.8;
    },
  },
  {
    id: 'damascus', name: 'DAMASCO', rarity: 2, accent: 0.8, grain: 0.12, env: 1.6,
    paint: (x, y, o) => {
      // Capas de acero forjado: ondas apretadas a lo largo, deformadas como al plegar el metal.
      const w = fbm(x * 1.6, y * 3, 111, 4) * 0.3 + fbm(x * 7, y * 12, 113, 3) * 0.05;
      const L = 0.5 + 0.5 * Math.sin((y + w) * 150);
      const t = sstep(0.25, 0.75, L);
      set(o, mixC(rgb(0x34373b), rgb(0xb4b8bd), t));
      o.rough = 0.42 - t * 0.2; o.metal = 1;
    },
  },
  {
    id: 'tigertooth', name: 'COLMILLO', rarity: 2, accent: 0.85, clearcoat: 0.6, grain: 0.1, env: 1.5,
    paint: (x, y, o) => {
      // Anodizado dorado con rayas de tigre anaranjadas, finas y numerosas.
      set(o, mixC(rgb(0xf4b844), rgb(0xe08e28), fbm(x * 3, y * 3, 121, 3)));
      const w = fbm(x * 4, y * 2, 123, 4);
      const d = Math.sin(x * 60 + w * 12 + y * 6);
      const taper = Math.abs(y - 0.5) * 1.1;
      if (d > 0.45 + taper) mix(o, rgb(0x9a4614), 0.85);
      o.rough = 0.2; o.metal = 0.75;
    },
  },
  {
    id: 'ultraviolet', name: 'ULTRAVIOLETA', rarity: 2, accent: 0.7, clearcoat: 0.3, grain: 0.3, env: 1.4,
    paint: (x, y, o) => {
      const n = fbm(x * 4, y * 4, 131, 5);
      set(o, mixC(rgb(0x6a34b0), rgb(0x2a1548), sstep(0.5, 0.72, n)));
      o.rough = 0.3 + n * 0.1; o.metal = 1;
      wear(o, x, y, 131, 0.5);
      o.metal = 0.8;
    },
  },
  {
    id: 'fade', name: 'DEGRADADO', rarity: 3, accent: 1, clearcoat: 1, grain: 0.08, env: 1.4,
    paint: (x, y, o) => {
      // Anodizado en degradado: amarillo en la boca, rosa, morado y azul hacia la culata.
      const t = x / 2 + (fbm(x * 3, y * 3, 141, 3) - 0.5) * 0.08;
      set(o, ramp([[0.05, rgb(0xf6d84a)], [0.32, rgb(0xf15a9c)], [0.62, rgb(0x9550d4)], [0.92, rgb(0x3b6fe0)]], t));
      o.rough = 0.2; o.metal = 0.7;
    },
  },
  {
    id: 'mirage', name: 'ESPEJISMO', rarity: 3, accent: 1, clearcoat: 1, grain: 0.08, env: 1.4,
    paint: (x, y, o) => {
      // Caramelo metálico: remolinos rosas, rojos, morados y azules sobre negro, con motas oscuras.
      const q = fbm(x * 2.5, y * 2.5, 151, 4);
      const n = fbm(x * 2.5 + q * 3, y * 2.5 + q * 3, 153, 5);
      const m = fbm(x * 4 + n * 2, y * 4, 155, 3);
      const c = ramp([[0.3, rgb(0x2d4fd6)], [0.45, rgb(0x7a2fb6)], [0.58, rgb(0xd8458f)], [0.7, rgb(0xc2183c)]], m);
      set(o, mixC(rgb(0x0b0a0f), c, sstep(0.3, 0.55, n)));
      if (vnoise(x * 140, y * 140, 157) > 0.9) set(o, rgb(0x08070a));
      o.rough = 0.18; o.metal = 0.7;
    },
  },
  {
    id: 'marble', name: 'MÁRMOL ÍGNEO', rarity: 3, accent: 1, clearcoat: 1, grain: 0.08, env: 1.4,
    paint: (x, y, o) => {
      // Vetas de rojo, amarillo y azul retorcidas, como mármol fundido.
      const q = fbm(x * 1.8, y * 1.8, 161, 4);
      const n = fbm(x * 2 + q * 4, y * 2 + q * 4, 163, 5);
      const t = (n * 3.2) % 1;
      set(o, ramp([[0, rgb(0xd1261d)], [0.3, rgb(0xf3c233)], [0.5, rgb(0xf3c233)], [0.72, rgb(0x2a57d4)], [1, rgb(0xd1261d)]], t));
      const vein = Math.abs(Math.sin(n * 40));
      if (vein < 0.06) mix(o, rgb(0x120c0a), 0.7);
      o.rough = 0.18; o.metal = 0.7;
    },
  },
  {
    id: 'gold', name: 'ORO', rarity: 3, accent: 0.9, grain: 0.06, env: 1.8, clearcoat: 0.4,
    paint: (x, y, o) => {
      const g = fbm(x * 4, y * 4, 171, 4);
      const streak = vnoise(x * 2, y * 300, 173);
      set(o, mixC(rgb(0xd29a3c), rgb(0xf2c463), g), 0.92 + streak * 0.12);
      o.rough = 0.24 + streak * 0.08; o.metal = 1;
    },
  },
  {
    id: 'diamond', name: 'DIAMANTE', rarity: 4, accent: 1, clearcoat: 1, grain: 0.05, env: 1.8, emit: 2.4, pulse: [3.2, 1],
    paint: (x, y, o) => {
      // Facetas triangulares de distintos tonos y algún destello que se enciende y se apaga.
      const size = 9; const Y = (y * H) / (size * 0.866); const X = ((x / 2) * W) / size + Y * 0.5;
      const i = Math.floor(X); const j = Math.floor(Y);
      const fx = X - i; const fy = Y - j;
      const up = fx > fy ? 1 : 0;
      const h = hash(i * 2 + up, j, 181);
      const pal = [rgb(0xe8eef4), rgb(0xbfd9f2), rgb(0xf2d4ea), rgb(0xd2f1f0), rgb(0x9fb6cc)];
      set(o, pal[Math.floor(h * pal.length)], 0.7 + hash(i, j * 2 + up, 183) * 0.45);
      const edge = Math.min(fy, 1 - fx, Math.abs(fx - fy));
      if (edge < 0.06) set(o, rgb(0x5a6470));
      o.rough = 0.08 + hash(i, j, 185) * 0.1; o.metal = 0.55;
      if (edge > 0.1 && h > 0.86) { const k = (h - 0.86) * 7; o.e = [k, k, k * 1.05]; }
    },
  },
  {
    id: 'singularity', name: 'SINGULARIDAD', rarity: 4, accent: 1, clearcoat: 1, grain: 0.1, emit: 2.2, scroll: 0.012,
    paint: (x, y, o) => {
      // Nebulosa que fluye por el arma sobre negro, con estrellas. Se repite a lo largo para poder desplazarla.
      const P = 3; // periodo del ruido en el largo (x va de 0 a 2: 2 * frecuencia celdas)
      const q = fbm(x * 1.5, y * 3, 191, 4, P);
      const n = fbm(x * 1.5 + q * 0, y * 3 + q * 2, 193, 5, P);
      const m = fbm(x * 3, y * 6 + n * 3, 195, 4, 6);
      const glow = sstep(0.34, 0.66, n);
      const c = ramp([[0.35, rgb(0x2a1a8a)], [0.5, rgb(0x7a2ad0)], [0.65, rgb(0xd04ad8)], [0.8, rgb(0x3f8bff)]], m);
      set(o, mixC(rgb(0x050508), c, glow * 0.6));
      o.e = [c[0] * glow, c[1] * glow, c[2] * glow];
      const sx = Math.floor((x / 2) * W / 3); const sy = Math.floor((y * H) / 3);
      const st = hash(((sx % 341) + 341) % 341, sy, 197);
      if (st > 0.994) { const k = (st - 0.994) * 160; o.e = [k, k, k]; set(o, [1, 1, 1]); }
      o.rough = 0.22; o.metal = 0.6;
    },
  },
  {
    id: 'magma', name: 'NÚCLEO DE LAVA', rarity: 4, accent: 1, grain: 1.4, emit: 2.4, pulse: [1.6, 0.35],
    paint: (x, y, o) => {
      // Roca volcánica negra con grietas incandescentes.
      const wx = x + (fbm(x * 6, y * 6, 201, 3) - 0.5) * 0.06; const wy = y + (fbm(x * 6, y * 6, 203, 3) - 0.5) * 0.06;
      const v = voronoi(wx * 9, wy * 9, 205);
      const crack = v.d2 - v.d1;
      const rock = fbm(x * 20, y * 20, 207, 4);
      set(o, mixC(rgb(0x0d0b0a), rgb(0x2a2420), rock));
      o.rough = 0.8; o.metal = 0.1;
      const hot = 1 - sstep(0.02, 0.1, crack);
      if (hot > 0) {
        const core = 1 - sstep(0.0, 0.035, crack);
        const e = mixC(rgb(0xff5a0a), rgb(0xffd25a), core);
        const k = hot * (0.7 + v.id * 0.6);
        o.e = [e[0] * k, e[1] * k, e[2] * k];
        mix(o, rgb(0x5a1a06), hot);
        o.rough = 0.6;
      }
    },
  },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

// Pinta las filas j0 a j1 (de arriba abajo) de la skin `id` en tres búferes RGBA: color, rugosidad y metal
// (G y B) y emisión (null si no emite). Las filas van al revés, de abajo arriba, como las lee la textura.
export function paintRows(id, j0, j1) {
  const def = skinById(id);
  const n = (j1 - j0) * W * 4;
  const col = new Uint8Array(n); const mr = new Uint8Array(n); const em = def.emit ? new Uint8Array(n) : null;
  const o = { c: [0, 0, 0], rough: 0.5, metal: 0, e: null };
  for (let j = j0; j < j1; j++) {
    const y = j / H; const row = (j1 - 1 - j) * W * 4;
    for (let i = 0; i < W; i++) {
      o.e = null;
      def.paint((i / W) * 2, y, o);
      const k = row + i * 4;
      col[k] = clamp255(o.c[0]); col[k + 1] = clamp255(o.c[1]); col[k + 2] = clamp255(o.c[2]); col[k + 3] = 255;
      mr[k + 1] = clamp255(o.rough); mr[k + 2] = clamp255(o.metal); mr[k + 3] = 255;
      if (em && o.e) { em[k] = clamp255(o.e[0]); em[k + 1] = clamp255(o.e[1]); em[k + 2] = clamp255(o.e[2]); }
      if (em) em[k + 3] = 255;
    }
  }
  return { col, mr, em };
}
const clamp255 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);

// Miniatura de la skin (ruleta y premios del Mercado Negro): el tramo central del lienzo en w × h píxeles RGBA,
// con la emisión sumada al color. Promedia 3 × 3 muestras por píxel para que el detalle fino no se vea granulado.
export function paintThumb(id, w, h) {
  const def = skinById(id);
  const out = new Uint8ClampedArray(w * h * 4);
  const o = { c: [0, 0, 0], rough: 0.5, metal: 0, e: null };
  const u0 = 0.1; const span = 1.8 / w; // de 0,1 a 1,9 a lo largo del arma; píxeles cuadrados
  const v0 = 0.5 - (h * span) / 2;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let r = 0; let g = 0; let b = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          o.e = null; o.c[0] = 0.1; o.c[1] = 0.1; o.c[2] = 0.11;
          def.paint?.(u0 + (i + (sx + 0.5) / 3) * span, v0 + (j + (sy + 0.5) / 3) * span, o);
          r += o.c[0] + (o.e ? o.e[0] * 0.6 : 0); g += o.c[1] + (o.e ? o.e[1] * 0.6 : 0); b += o.c[2] + (o.e ? o.e[2] * 0.6 : 0);
        }
      }
      const k = (j * w + i) * 4;
      out[k] = (r / 9) * 255; out[k + 1] = (g / 9) * 255; out[k + 2] = (b / 9) * 255; out[k + 3] = 255;
    }
  }
  return out;
}
