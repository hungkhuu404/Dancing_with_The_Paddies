// Static geometry lookup, not water data. Every texel inside a parcel points to
// the 250 m cell containing its centroid, exactly as applyCells does nearby.
export function cellForParcel(poly, offset, origin, frame, step = 250) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  const e = origin.utm_e + offset.x + x / poly.length;
  const n = origin.utm_n - offset.z - z / poly.length;
  return [Math.floor((e - frame.e0) / step), Math.floor((n - frame.n0) / step)];
}

export function paintPolygon(bytes, width, height, points, color) {
  const lo = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))));
  const hi = Math.min(height - 1, Math.ceil(Math.max(...points.map(p => p[1]))));
  const cuts = [];
  for (let y = lo; y <= hi; y++) {
    cuts.length = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [x1, y1] = points[i], [x2, y2] = points[j];
      if ((y1 > y + .5) !== (y2 > y + .5)) cuts.push(x1 + (y + .5 - y1) * (x2 - x1) / (y2 - y1));
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      for (let x = Math.max(0, Math.ceil(cuts[i] - .5)); x <= Math.min(width - 1, Math.floor(cuts[i + 1] - .5)); x++) bytes.set(color, (y * width + x) * 4);
    }
  }
}
