// Mundo de colisiones analítico: cajas orientadas (giro en Y) y cilindros verticales.
// Se usa para el movimiento (círculo vs. forma), los disparos (rayo vs. forma) y la línea de visión.

const EPS = 1e-6;

export class CollisionWorld {
  constructor() {
    this.list = [];
  }

  // Caja centrada en (cx, cz), tamaño (sx, sz), entre y0 e y1, girada `yaw` rad sobre Y.
  addBox(cx, cz, sx, sz, y0, y1, yaw = 0, surface = 'concrete', opts = {}) {
    const c = {
      type: 'box', x: cx, z: cz, hx: sx / 2, hz: sz / 2, y0, y1,
      sin: Math.sin(yaw), cos: Math.cos(yaw), yaw,
      rad: Math.hypot(sx / 2, sz / 2),
      surface, solid: true, bullets: true, sight: true, walkable: true, ref: null, ...opts,
    };
    this.list.push(c);
    return c;
  }

  addCyl(x, z, r, y0, y1, surface = 'metal', opts = {}) {
    const c = {
      type: 'cyl', x, z, r, y0, y1, rad: r,
      surface, solid: true, bullets: true, sight: true, walkable: true, ref: null, ...opts,
    };
    this.list.push(c);
    return c;
  }

  remove(c) {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
  }

  // Empuja un círculo (pos.x, pos.z) fuera de los obstáculos. Devuelve true si hubo contacto.
  resolveCircle(pos, radius, feetY, headY, stepH = 0.3) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.list.length; i++) {
        const c = this.list[i];
        if (!c.solid) continue;
        if (c.y1 <= feetY + stepH || c.y0 >= headY) continue;
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const reach = c.rad + radius;
        if (dx * dx + dz * dz > reach * reach) continue;

        if (c.type === 'cyl') {
          const d = Math.hypot(dx, dz);
          if (d < reach) {
            if (d > EPS) {
              pos.x = c.x + (dx / d) * reach;
              pos.z = c.z + (dz / d) * reach;
            } else {
              pos.x = c.x + reach;
            }
            hit = true;
          }
          continue;
        }

        // A espacio local de la caja.
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        const qx = lx < -c.hx ? -c.hx : lx > c.hx ? c.hx : lx;
        const qz = lz < -c.hz ? -c.hz : lz > c.hz ? c.hz : lz;
        let px = lx - qx;
        let pz = lz - qz;
        const d2 = px * px + pz * pz;
        if (d2 >= radius * radius) continue;

        let ox;
        let oz;
        if (d2 > EPS) {
          const d = Math.sqrt(d2);
          const k = (radius - d) / d;
          ox = px * k;
          oz = pz * k;
        } else {
          // Centro dentro de la caja: salir por la cara más cercana.
          const penX = c.hx - Math.abs(lx);
          const penZ = c.hz - Math.abs(lz);
          if (penX < penZ) { ox = (lx < 0 ? -1 : 1) * (penX + radius); oz = 0; }
          else { ox = 0; oz = (lz < 0 ? -1 : 1) * (penZ + radius); }
        }
        // De vuelta a espacio mundo.
        pos.x += ox * c.cos + oz * c.sin;
        pos.z += -ox * c.sin + oz * c.cos;
        hit = true;
      }
    }
    return hit;
  }

  // Altura del suelo bajo (x, z): la tapa más alta alcanzable desde feetY.
  groundHeight(x, z, feetY, stepH = 0.3, margin = 0.15) {
    let h = 0;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (!c.solid || !c.walkable) continue;
      if (c.y1 > feetY + stepH || c.y1 <= h) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      if (c.type === 'cyl') {
        if (dx * dx + dz * dz <= (c.r + margin) * (c.r + margin)) h = c.y1;
      } else {
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) <= c.hx + margin && Math.abs(lz) <= c.hz + margin) h = c.y1;
      }
    }
    return h;
  }

  // ¿Hay techo/obstáculo que impida ponerse de pie?
  blockedAbove(x, z, radius, y0, y1) {
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (!c.solid || c.y1 <= y0 || c.y0 >= y1) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      if (c.type === 'cyl') {
        if (dx * dx + dz * dz < (c.r + radius) * (c.r + radius)) return true;
      } else {
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) < c.hx + radius * 0.7 && Math.abs(lz) < c.hz + radius * 0.7) return true;
      }
    }
    return false;
  }

  // Cobertura junto a un jugador en (x, z) con pies en feetY: el obstáculo sólido más cercano a menos de
  // `reach` metros del borde del círculo que tape al menos hasta la cadera (agachado) y que no sea un
  // poste (cilindros de 0,2 m de radio o más, cajas de 0,6 m o más en su lado largo). Devuelve
  // { nx, nz, h, dist } (normal del obstáculo hacia el jugador, altura de la tapa sobre los pies) o null.
  coverInfo(x, z, radius, feetY, reach = 0.35, out = {}) {
    let best = radius + reach;
    let found = false;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (!c.solid || !c.bullets || c.y1 < feetY + 0.8 || c.y0 > feetY + 0.5) continue;
      if (c.type === 'cyl' ? c.r < 0.2 : Math.max(c.hx, c.hz) < 0.3) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const lim = c.rad + best;
      if (dx * dx + dz * dz > lim * lim) continue;
      let d; let nx; let nz;
      if (c.type === 'cyl') {
        const l = Math.hypot(dx, dz);
        if (l < EPS) continue;
        d = l - c.r; nx = dx / l; nz = dz / l;
      } else {
        // Punto más cercano de la caja, en su espacio local.
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        const px = lx - (lx < -c.hx ? -c.hx : lx > c.hx ? c.hx : lx);
        const pz = lz - (lz < -c.hz ? -c.hz : lz > c.hz ? c.hz : lz);
        d = Math.hypot(px, pz);
        if (d < EPS) continue;
        const ox = px / d; const oz = pz / d;
        nx = ox * c.cos + oz * c.sin; nz = -ox * c.sin + oz * c.cos;
      }
      if (d >= best) continue;
      best = d; found = true;
      out.nx = nx; out.nz = nz; out.h = c.y1 - feetY; out.dist = d;
    }
    return found ? out : null;
  }

  // Rayo contra el mundo. `mode`: 'bullets' | 'sight'. Devuelve el impacto más cercano o null.
  // out: { dist, x, y, z, nx, ny, nz, surface, collider }
  raycast(ox, oy, oz, dx, dy, dz, maxDist, mode = 'bullets', out = {}, ground = true) {
    let best = maxDist;
    let found = false;

    if (ground && dy < -EPS) {
      const t = -oy / dy;
      if (t > 0 && t < best) {
        best = t; found = true;
        out.nx = 0; out.ny = 1; out.nz = 0; out.surface = 'ground'; out.collider = null;
      }
    }

    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (!c[mode]) continue;

      // Rechazo rápido: distancia del centro al rayo en XZ no es fiable con dy; usamos esfera envolvente.
      const cyMid = (c.y0 + c.y1) * 0.5;
      const hh = (c.y1 - c.y0) * 0.5;
      const mx = c.x - ox;
      const my = cyMid - oy;
      const mz = c.z - oz;
      const proj = mx * dx + my * dy + mz * dz;
      const R = c.rad + hh;
      if (proj < -R || proj > best + R) continue;
      const perp2 = mx * mx + my * my + mz * mz - proj * proj;
      if (perp2 > R * R) continue;

      if (c.type === 'box') {
        const lox = -mx * c.cos + mz * c.sin;
        const loz = -mx * c.sin - mz * c.cos;
        const ldx = dx * c.cos - dz * c.sin;
        const ldz = dx * c.sin + dz * c.cos;
        let tmin = 0;
        let tmax = best;
        let axis = -1;
        let sign = 0;
        // X
        if (Math.abs(ldx) < EPS) { if (lox < -c.hx || lox > c.hx) continue; }
        else {
          let t1 = (-c.hx - lox) / ldx; let t2 = (c.hx - lox) / ldx; let s = -1;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        // Y
        if (Math.abs(dy) < EPS) { if (oy < c.y0 || oy > c.y1) continue; }
        else {
          let t1 = (c.y0 - oy) / dy; let t2 = (c.y1 - oy) / dy; let s = -1;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        // Z
        if (Math.abs(ldz) < EPS) { if (loz < -c.hz || loz > c.hz) continue; }
        else {
          let t1 = (-c.hz - loz) / ldz; let t2 = (c.hz - loz) / ldz; let s = -1;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) continue;
        }
        if (axis < 0 || tmin >= best) continue; // origen dentro de la caja o más lejos
        best = tmin; found = true;
        if (axis === 0) { out.nx = sign * c.cos; out.ny = 0; out.nz = -sign * c.sin; }
        else if (axis === 1) { out.nx = 0; out.ny = sign; out.nz = 0; }
        else { out.nx = sign * c.sin; out.ny = 0; out.nz = sign * c.cos; }
        out.surface = c.surface; out.collider = c;
      } else {
        // Cilindro vertical: lateral + tapas.
        const a = dx * dx + dz * dz;
        const fx = -mx;
        const fz = -mz;
        let tHit = -1;
        let nx = 0; let ny = 0; let nz = 0;
        if (a > EPS) {
          const b = fx * dx + fz * dz;
          const cc = fx * fx + fz * fz - c.r * c.r;
          const disc = b * b - a * cc;
          if (disc >= 0) {
            const t = (-b - Math.sqrt(disc)) / a;
            const y = oy + dy * t;
            if (t > 0 && y >= c.y0 && y <= c.y1) {
              tHit = t;
              nx = (fx + dx * t) / c.r; nz = (fz + dz * t) / c.r;
            }
          }
        }
        if (tHit < 0 && Math.abs(dy) > EPS) {
          const capY = dy < 0 ? c.y1 : c.y0;
          const t = (capY - oy) / dy;
          if (t > 0) {
            const px = fx + dx * t;
            const pz = fz + dz * t;
            if (px * px + pz * pz <= c.r * c.r) { tHit = t; nx = 0; nz = 0; ny = dy < 0 ? 1 : -1; }
          }
        }
        if (tHit > 0 && tHit < best) {
          best = tHit; found = true;
          out.nx = nx; out.ny = ny; out.nz = nz; out.surface = c.surface; out.collider = c;
        }
      }
    }

    if (!found) return null;
    out.dist = best;
    out.x = ox + dx * best;
    out.y = oy + dy * best;
    out.z = oz + dz * best;
    return out;
  }

  // Línea de visión entre dos puntos.
  lineOfSight(ax, ay, az, bx, by, bz) {
    let dx = bx - ax; let dy = by - ay; let dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < EPS) return true;
    dx /= len; dy /= len; dz /= len;
    return this.raycast(ax, ay, az, dx, dy, dz, len - 0.05, 'sight', _los, false) === null;
  }
}

const _los = {};
