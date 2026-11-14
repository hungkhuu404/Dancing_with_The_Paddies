// Rasters of one tile, pure (no three.js) so a Web Worker can build them off the main thread:
// The parcel-id raster always stays 1024² (2 m). Only the visual soft mask
// (R canal water, G parcel cover, B road) uses 1024² on low / 2048² on high.
export const MASK = 2048, IDS = 1024;
export function maskResolution(tier){return tier==='low'?1024:MASK;}

function checkMaskSize(size){
  if(size!==1024&&size!==MASK)throw new RangeError('Tile soft mask must be 1024 or 2048 pixels');
  return size;
}

export function fillPoly(data, poly, id, cx, cz) {
  const S = IDS;
  const pts = poly.map(([x, z]) => [((x - cx + 1000) / 2000) * S, ((z - cz + 1000) / 2000) * S]);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(S - 1, Math.ceil(y1));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > yc) !== (yj > yc)) xs.push(xi + ((yc - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(S - 1, Math.floor(xs[k + 1] - 0.5)); x++) {
        const o = (y * S + x) * 4;
        data[o] = id & 255; data[o + 1] = (id >> 8) & 255; data[o + 3] = 255;
      }
    }
  }
}

/** canvas row 0 is the top; a DataTexture row 0 is v = 0 (the bottom, as CanvasTexture flipY gave): flip the rows */
export function maskBytes(c, size = c.width || MASK) {
  if(!Number.isInteger(size)||size<1||size>MASK)throw new RangeError('Invalid soft-mask dimensions');
  const src = c.getContext('2d').getImageData(0, 0, size, size).data, out = new Uint8Array(src.length), row = size * 4;
  if(src.length!==size*size*4)throw new RangeError('Soft-mask byte count does not match its dimensions');
  for (let y = 0; y < size; y++) out.set(src.subarray((size - 1 - y) * row, (size - y) * row), y * row);
  return out;
}

export function drawMask(layout, cx, cz, maskSize = MASK) {
  checkMaskSize(maskSize);
  const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(maskSize, maskSize) : Object.assign(document.createElement('canvas'), { width: maskSize, height: maskSize });
  const g = c.getContext('2d', { willReadFrequently: true });
  const s = maskSize / 2000;
  const P = (v) => v * s;
  g.fillStyle = '#000'; g.fillRect(0, 0, maskSize, maskSize);
  g.setTransform(1, 0, 0, 1, (1000 - cx) * s, (1000 - cz) * s); // tile window -> canvas
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round'; g.lineJoin = 'round';
  const stroke = (lines, color, wfn) => {
    g.strokeStyle = color;
    for (const l of lines) {
      g.lineWidth = Math.max(1, wfn(l) * s);
      g.beginPath();
      l.points.forEach(([x, z], i) => (i ? g.lineTo(P(x), P(z)) : g.moveTo(P(x), P(z))));
      g.stroke();
    }
  };
  // canal water drawn slightly narrower than width_m so banks overlap the edge
  stroke(layout.canals, '#f00', (l) => Math.max(1.5, (l.width_m || 4) - 1.6));
  g.fillStyle = '#0f0';
  for (const p of layout.parcels) {
    g.beginPath();
    p.poly.forEach(([x, z], i) => (i ? g.lineTo(P(x), P(z)) : g.moveTo(P(x), P(z))));
    g.closePath(); g.fill();
  }
  stroke(layout.roads, '#00f', (l) => l.width_m || 4);
  return c;
}


/** Both rasters for a tile: {ids, mask} as RGBA bytes ready for DataTextures. */
export function rasterise(layout, cx, cz, maskSize = MASK) {
  checkMaskSize(maskSize);
  const ids = new Uint8Array(IDS * IDS * 4);
  layout.parcels.forEach((p, i) => fillPoly(ids, p.poly, i + 1, cx, cz));
  return { ids, mask: maskBytes(drawMask(layout, cx, cz, maskSize), maskSize), maskSize };
}
