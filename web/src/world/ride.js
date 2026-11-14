// Boat ride: the camera sits in a xuồng at water level. W/S paddle, A/D turn, drag to look around, Esc leaves.
// The boat stays inside the canal water (clampToCanals); on touch screens, on-screen arrows drive it.
import * as THREE from 'three';
import * as P from './placeholders.js';
import { litMaterial } from './common.js';
import { clampToCanals } from './paths.js';

export function createRide(ctx) {
  const boat = new THREE.Mesh(P.xuong(), litMaterial(null, 'ridexuong', { radar: '.85' }));
  boat.castShadow = boat.receiveShadow = true; boat.visible = false; boat.name = 'ride_boat';
  const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 5).translate(0, -0.85, 0), litMaterial(null, 'ridepaddle'));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.02).translate(0, -1.75, 0), paddle.material);
  paddle.add(blade); boat.add(paddle);
  const st = { on: false, x: 0, z: 0, yaw: 0, v: 0, w: 0, look: 0, pitch: -0.06, saved: null, keys: new Set(), stroke: 0 };
  const out = {};
  const touch = document.getElementById('ride-pad');

  function enter() {
    if (st.on) return;
    // start in the moored boat nearest the view target (else the nearest canal point)
    const t = ctx.target();
    let best = null, bd = Infinity;
    for (const b of ctx.mooredBoats()) { if (b.kind === 'cargo') continue; /* a cargo hull would fill the view */ const d = Math.hypot(b.x - t.x, b.z - t.z); if (d < bd) { bd = d; best = b; } }
    const c = clampToCanals(best ? best.x : t.x, best ? best.z : t.z, ctx.canals(), 1.2, out);
    st.x = c.x; st.z = c.z; st.yaw = best ? best.rot || 0 : 0; st.v = 0; st.w = 0; st.look = 0;
    st.saved = ctx.saveView();
    st.on = true; boat.visible = true;
    document.body.classList.add('riding');
    if (touch) touch.hidden = false;
  }
  function exit() {
    if (!st.on) return;
    st.on = false; boat.visible = false; st.keys.clear();
    document.body.classList.remove('riding');
    if (touch) touch.hidden = true;
    ctx.restoreView(st.saved);
  }
  addEventListener('keydown', (e) => {
    if (!st.on) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { exit(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    if ('wasd'.includes(k) || e.key.startsWith('Arrow')) { st.keys.add({ arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' }[k] || k); e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); st.keys.delete({ arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' }[k] || k); }, true);
  addEventListener('blur', () => st.keys.clear());
  touch?.querySelectorAll('[data-k]').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); st.keys.add(k); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => st.keys.delete(k));
  });
  touch?.querySelector('[data-exit]')?.addEventListener('click', exit);
  // drag to look around (the view eases back to the bow when released)
  let drag = null;
  ctx.canvas.addEventListener('pointerdown', (e) => { if (st.on) drag = [e.clientX, e.clientY, st.look, st.pitch]; });
  addEventListener('pointermove', (e) => { if (st.on && drag) { st.look = drag[2] - (e.clientX - drag[0]) * 0.005; st.pitch = THREE.MathUtils.clamp(drag[3] - (e.clientY - drag[1]) * 0.004, -0.6, 0.5); } });
  addEventListener('pointerup', () => (drag = null));

  const fwd = new THREE.Vector3();
  function update(dt, t, camera) {
    if (!st.on) return;
    const k = st.keys;
    const thrust = (k.has('w') ? 1 : 0) - (k.has('s') ? 0.6 : 0), turn = (k.has('a') ? 1 : 0) - (k.has('d') ? 1 : 0);
    st.v += (thrust * 2.4 - st.v) * Math.min(1, dt * (thrust ? 0.9 : 0.35)); // paddling ~2.4 m/s, glides to a stop
    st.w += (turn * 0.7 - st.w) * Math.min(1, dt * 2);
    st.yaw += st.w * dt * (0.4 + Math.min(1, Math.abs(st.v) / 1.5));
    let nx = st.x + Math.sin(st.yaw) * st.v * dt, nz = st.z + Math.cos(st.yaw) * st.v * dt;
    const c = clampToCanals(nx, nz, ctx.canals(), 1.2, out); // canals of every loaded tile: crossing into the next tile keeps working
    if (!c.inside) st.v *= 0.6; // bumped the bank
    st.x = c.x; st.z = c.z;
    if (!drag) { st.look *= 1 - Math.min(1, dt * 0.8); st.pitch += (-0.06 - st.pitch) * Math.min(1, dt * 0.8); }
    const bob = Math.sin(t * 1.6) * 0.035 + Math.sin(t * 2.7) * 0.015, roll = Math.sin(t * 1.3) * 0.025 + st.w * 0.05;
    boat.position.set(st.x, bob - 0.02, st.z);
    boat.rotation.set(Math.sin(t * 1.1) * 0.012, st.yaw, roll, 'YXZ');
    // paddle stroke while moving
    st.stroke += dt * (Math.abs(thrust) ? 2.4 : 0.4);
    paddle.position.set(0.55, 0.9, 0.6);
    paddle.rotation.set(Math.sin(st.stroke) * 0.7 * (thrust ? 1 : 0.2), 0, -0.35 + Math.cos(st.stroke) * 0.1);
    // seated at the stern, eye 1.05 m above the water
    camera.position.set(st.x - Math.sin(st.yaw) * 1.6, 1.05 + bob, st.z - Math.cos(st.yaw) * 1.6);
    const yaw = st.yaw + st.look;
    fwd.set(Math.sin(yaw) * Math.cos(st.pitch), Math.sin(st.pitch), Math.cos(yaw) * Math.cos(st.pitch));
    camera.up.set(Math.sin(roll) * 0.3 * Math.cos(yaw), 1, -Math.sin(roll) * 0.3 * Math.sin(yaw)).normalize();
    camera.lookAt(fwd.add(camera.position));
    camera.up.set(0, 1, 0);
  }

  return { boat, enter, exit, update, get on() { return st.on; }, keys: st.keys, state: st };
}
