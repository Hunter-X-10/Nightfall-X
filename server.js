// Servidor de la demo: archivos estáticos + salas multijugador por WebSocket (/ws).
// Uso: node server.js [puerto] [--lan]
//   --lan (o HOST=0.0.0.0) acepta conexiones de otros equipos; por defecto solo este ordenador.
//   En un alojamiento (que fija la variable PORT) acepta conexiones de fuera sin tener que indicarlo.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { attachRooms } = require('./rooms.js');

const ROOT = __dirname;
const args = process.argv.slice(2);
const PORT = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 5173);
// Algunos alojamientos (alwaysdata) indican también la dirección en la que escuchar, en la variable IP.
const HOST = process.env.HOST || process.env.IP || (args.includes('--lan') || process.env.PORT ? '0.0.0.0' : '127.0.0.1');
// Solo se sirve lo que necesita el navegador.
const PUBLIC = ['/index.html', '/css/', '/src/', '/node_modules/three/', '/node_modules/peerjs/dist/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  if (!PUBLIC.some((p) => (p.endsWith('/') ? urlPath.startsWith(p) : urlPath === p))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + urlPath);
    return;
  }

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. Prueba: node server.js ${PORT + 1}`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

attachRooms(server).then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`NIGHTFALL-X listo en  http://localhost:${PORT}`);
    if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
      for (const list of Object.values(os.networkInterfaces())) {
        for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  En tu red local:  http://${n.address}:${PORT}`);
      }
    }
  });
});
