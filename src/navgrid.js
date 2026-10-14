// Rejilla de navegación para la IA del modo supervivencia. Marca qué celdas puede pisar un soldado (con su
// radio, contra los mismos obstáculos que Enemies.move) y calcula, desde la celda del jugador, cuántos pasos
// hay andando hasta cada una (búsqueda en anchura). Un soldado lejano sigue esa cuenta hacia abajo: rodea
// paredes y edificios en vez de quedarse empujando contra ellos.
const CELL = 0.8;
const R = 0.42; // radio del soldado (0,36) con algo de holgura
const FEET = 0.28; const HEAD = 1.7; // lo que se puede subir de un paso y la altura de la cabeza
const FAR = 0xffff; // celda sin camino

export class NavGrid {
  constructor(col, bounds) {
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.w = Math.ceil((bounds.x1 - bounds.x0) / CELL);
    this.h = Math.ceil((bounds.z1 - bounds.z0) / CELL);
    const n = this.w * this.h;
    this.block = new Uint8Array(n);
    this.dist = new Uint16Array(n).fill(FAR);
    this.queue = new Int32Array(n);
    this.target = -1;
    for (const c of col.list) this.mark(c);
  }

  // Marca las celdas cuyo centro tocaría el obstáculo `c`.
  mark(c) {
    if (!c.solid || c.y1 <= FEET || c.y0 >= HEAD) return;
    let ex; let ez;
    if (c.type === 'cyl') { ex = ez = c.r + R; } else {
      const ac = Math.abs(c.cos); const as = Math.abs(c.sin);
      ex = c.hx * ac + c.hz * as + R; ez = c.hx * as + c.hz * ac + R;
    }
    const i0 = Math.max(0, Math.floor((c.x - ex - this.x0) / CELL)); const i1 = Math.min(this.w - 1, Math.floor((c.x + ex - this.x0) / CELL));
    const j0 = Math.max(0, Math.floor((c.z - ez - this.z0) / CELL)); const j1 = Math.min(this.h - 1, Math.floor((c.z + ez - this.z0) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = this.x0 + (i + 0.5) * CELL - c.x; const dz = this.z0 + (j + 0.5) * CELL - c.z;
        let hit;
        if (c.type === 'cyl') hit = dx * dx + dz * dz < ex * ex;
        else {
          const lx = dx * c.cos - dz * c.sin; const lz = dx * c.sin + dz * c.cos;
          const px = Math.max(0, Math.abs(lx) - c.hx); const pz = Math.max(0, Math.abs(lz) - c.hz);
          hit = px * px + pz * pz < R * R;
        }
        if (hit) this.block[j * this.w + i] = 1;
      }
    }
  }

  cell(x, z) {
    const i = Math.floor((x - this.x0) / CELL); const j = Math.floor((z - this.z0) / CELL);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
  }

  // Vuelve a contar los pasos si el jugador ha cambiado de celda.
  update(px, pz) {
    let t = this.cell(px, pz);
    if (t < 0 || t === this.target) return;
    this.target = t;
    // Si el jugador está pegado a un obstáculo, su celda puede salir bloqueada: se parte de la libre más cercana.
    if (this.block[t]) t = this.nearestFree(t);
    const { dist, block, queue, w, h } = this;
    dist.fill(FAR);
    if (t < 0) return;
    let head = 0; let tail = 0;
    dist[t] = 0; queue[tail++] = t;
    while (head < tail) {
      const c = queue[head++];
      const i = c % w; const j = (c - i) / w; const d = dist[c] + 1;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di; const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
          const nc = nj * w + ni;
          if (block[nc] || dist[nc] <= d) continue;
          if (di && dj && (block[j * w + ni] || block[nj * w + i])) continue; // sin cortar esquinas
          dist[nc] = d; queue[tail++] = nc;
        }
      }
    }
  }

  nearestFree(c) {
    const i = c % this.w; const j = (c - i) / this.w;
    for (let r = 1; r < 6; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const ni = i + di; const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
          if (!this.block[nj * this.w + ni]) return nj * this.w + ni;
        }
      }
    }
    return -1;
  }

  // ¿Se puede llegar andando desde (x, z) hasta el jugador?
  reachable(x, z) { const c = this.cell(x, z); return c >= 0 && this.dist[c] < FAR; }

  // Punto al que dirigirse desde (x, z) para acercarse al jugador: tres celdas más adelante en el camino.
  // Devuelve false si no hay camino (o ya se está en la celda del jugador).
  ahead(x, z, out) {
    let c = this.cell(x, z);
    if (c < 0) return false;
    const { dist, w, h } = this;
    let moved = false;
    for (let step = 0; step < 3; step++) {
      const i = c % w; const j = (c - i) / w;
      let best = -1; let bd = dist[c];
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di; const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
          const nc = nj * w + ni;
          if (dist[nc] < bd) { bd = dist[nc]; best = nc; }
        }
      }
      if (best < 0) break;
      c = best; moved = true;
    }
    if (!moved) return false;
    const i = c % w;
    out.x = this.x0 + (i + 0.5) * CELL; out.z = this.z0 + ((c - i) / w + 0.5) * CELL;
    return true;
  }
}
