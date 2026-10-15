// Worker que pinta una franja de filas de una skin (ver src/skins.js) y devuelve los búferes.
import { paintRows } from './skinPaint.js';

self.onmessage = ({ data: { id, j0, j1 } }) => {
  const out = paintRows(id, j0, j1);
  self.postMessage(out, [out.col.buffer, out.mr.buffer, ...(out.em ? [out.em.buffer] : [])]);
};
