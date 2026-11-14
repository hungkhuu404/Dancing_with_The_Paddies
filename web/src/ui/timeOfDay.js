// Compact light range with a readable current period. Value eases toward the target (interruptible).
const STOPS = [['Dawn', 0], ['Noon', 0.33], ['Golden hour', 0.66], ['Night', 1]];

export function createTimeOfDay(root, initial, reduced) {
  root.innerHTML = `
    <label class="tod-label" for="tod-range">Light</label>
    <input id="tod-range" class="tod-range" type="range" min="0" max="1000" step="1" value="${initial * 1000}" aria-valuetext="" aria-describedby="light-control-note">
    <output class="tod-value" for="tod-range" aria-live="off"></output>`;
  const range = root.querySelector('input');
  const s = { value: initial, target: initial };
  const name = (v) => STOPS.reduce((a, b) => (Math.abs(b[1] - v) < Math.abs(a[1] - v) ? b : a))[0];
  const sync = () => {
    range.setAttribute('aria-valuetext', name(s.target));
    root.querySelector('output').value = name(s.target);
  };
  range.addEventListener('input', () => { s.target = range.value / 1000; s.value = s.target; sync(); });
  sync();
  return {
    get value() { return s.value; },
    set(v, instant = false) { s.target = v; if (instant) s.value = v; range.value = v * 1000; sync(); },
    update(dt) {
      if (reduced) { s.value = s.target; return; }
      const d = s.target - s.value;
      s.value += Math.abs(d) < 0.0005 ? d : d * Math.min(1, dt * 2.2);
    },
  };
}
