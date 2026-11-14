// Distance-based road motion. Decorative routes never change flood data.
export function roadRoute(road) {
  const points = [];
  for (const p of road.points || []) if (p.every(Number.isFinite) && (!points.length || Math.hypot(p[0] - points.at(-1)[0], p[1] - points.at(-1)[1]) > .01)) points.push(p);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return { points, lengths, length: lengths.at(-1) || 0, width: road.width_m || 4 };
}
export function roadPoint(route, distance) {
  if (route.points.length < 2 || route.length <= 0) return null;
  const s = Math.max(0, Math.min(route.length, distance));
  let i = 1;
  while (i < route.lengths.length - 1 && route.lengths[i] < s) i++;
  const a = route.points[i - 1], b = route.points[i], t = (s - route.lengths[i - 1]) / (route.lengths[i] - route.lengths[i - 1]);
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
export function roadPose(route, time, speed, phase = 0, lane = 0) {
  if (!route.length) return null;
  const cycle = ((time * speed / route.length + phase) % 2 + 2) % 2;
  const forward = cycle < 1, u = forward ? cycle : 2 - cycle;
  // Smooth stop and reversal at the end of a finite road; no wrap/teleport.
  const distance = route.length * (.5 - .5 * Math.cos(Math.PI * u));
  const p = roadPoint(route, distance), ahead = roadPoint(route, distance + 2), behind = roadPoint(route, distance - 2);
  const tangent = Math.atan2(ahead.x - behind.x, ahead.z - behind.z), heading = tangent + (forward ? 0 : Math.PI);
  const offset = Math.max(-route.width * .3, Math.min(route.width * .3, lane));
  return { x: p.x + Math.cos(tangent) * offset, z: p.z - Math.sin(tangent) * offset, yaw: heading, distance };
}
