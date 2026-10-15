// Prepara la carpeta dist/ para un alojamiento estático (Netlify, Vercel, GitHub Pages…): el juego y,
// en vendor/, sólo los archivos de las bibliotecas que de verdad se cargan. Allí no hay servidor de
// salas, así que las partidas en línea van de navegador a navegador (ver src/p2p.js).
//
//   node tools/build.mjs [dirSalida]
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'dist'));
const MODULES = join(ROOT, 'node_modules');

// Rutas del importmap de index.html, llevadas de node_modules/ a vendor/.
const VENDOR = {
  three: ['three/build/three.module.js', 'three/build/three.module.js'],
  'three/addons/': ['three/examples/jsm/', 'three/addons/'],
  peerjs: ['peerjs/dist/peerjs.min.js', 'peerjs/peerjs.min.js'],
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'css'), join(OUT, 'css'), { recursive: true });
cpSync(join(ROOT, 'src'), join(OUT, 'src'), { recursive: true, filter: (f) => !f.endsWith('package.json') });
cpSync(join(ROOT, 'ads.txt'), join(OUT, 'ads.txt')); // vendedores autorizados de anuncios (AdSense)

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const map = /<script type="importmap">[\s\S]*?<\/script>/;
if (!map.test(html)) throw new Error('index.html no tiene importmap');
const imports = Object.fromEntries(Object.entries(VENDOR).map(([name, [, to]]) => [name, `./vendor/${to}`]));
// La marca nightfall-red le dice al juego que aquí no hay servidor de salas (ver src/net.js).
const viewport = /(<meta name="viewport"[^>]*>)/;
if (!viewport.test(html)) throw new Error('index.html no tiene la etiqueta viewport');
writeFileSync(join(OUT, 'index.html'), html.replace(viewport, '$1\n  <meta name="nightfall-red" content="p2p">').replace(map, `<script type="importmap">\n  ${JSON.stringify({ imports }, null, 2).replace(/\n/g, '\n  ')}\n  </script>`));

// Sigue los import desde el código del juego y copia los archivos de las bibliotecas a los que llega.
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\1/g;
const seen = new Set();
const copied = [];

function vendorFile(spec) {
  for (const [name, [from, to]] of Object.entries(VENDOR)) {
    if (name.endsWith('/') ? spec.startsWith(name) : spec === name) return [join(MODULES, from + spec.slice(name.length)), join(OUT, 'vendor', to + spec.slice(name.length))];
  }
  return null;
}

function scan(file, dest) {
  if (seen.has(file)) return;
  seen.add(file);
  if (dest) {
    if (!existsSync(file)) throw new Error(`Falta ${relative(ROOT, file)} (¿se ha ejecutado npm install?)`);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(file, dest);
    copied.push(dest);
  }
  if (!/\.m?js$/.test(file) || file.endsWith('.min.js')) return;
  for (const [, , spec] of readFileSync(file, 'utf8').matchAll(SPEC)) {
    if (spec.startsWith('.')) {
      if (dest) scan(resolve(dirname(file), spec), resolve(dirname(dest), spec));
    } else {
      const hit = vendorFile(spec);
      if (hit) scan(...hit);
      else if (!dest) throw new Error(`${relative(ROOT, file)} importa "${spec}", que no está en el importmap`);
    }
  }
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
for (const file of walk(join(ROOT, 'src'))) scan(file, null);
scan(...vendorFile('peerjs')); // se carga con una etiqueta <script>, no con import

const size = (files) => files.reduce((n, f) => n + statSync(f).size, 0);
const all = walk(OUT);
console.log(`dist/ lista: ${all.length} archivos, ${(size(all) / 1048576).toFixed(1)} MB (${copied.length} de bibliotecas).`);
