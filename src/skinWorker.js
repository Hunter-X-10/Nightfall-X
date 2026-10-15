// Worker que pinta una franja de filas de una skin (ver src/skins.js) y devuelve los búferes, o una miniatura
// para el Mercado Negro (src/market.js) si el mensaje trae `thumb`.
import { paintRows, paintThumb } from './skinPaint.js';

self.onmessage = ({ data: { id, j0, j1, thumb } }) => {
  if (thumb) {
    const px = paintThumb(id, thumb[0], thumb[1]);
    self.postMessage({ id, px }, [px.buffer]);
    return;
  }
  const out = paintRows(id, j0, j1);
  self.postMessage(out, [out.col.buffer, out.mr.buffer, ...(out.em ? [out.em.buffer] : [])]);
};
