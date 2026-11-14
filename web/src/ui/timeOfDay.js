// Time-of-day control: a small range with four named stops. Value eases toward the target (interruptible).
const STOPS = [['Dawn', 0], ['Noon', 0.33], ['Golden hour', 0.66], ['Night', 1]];

export function createTimeOfDay(root, initial, reduced) {
  root.innerHTML = `
    <label class="tod-label" for="tod-range">Light</label>
    <input id="tod-range" class="tod-range" type="range" min="0" max="1000" step="1" value="${initial * 1000}" aria-valuetext="">
    <div class="tod-stops">${STOPS.map(([n, v]) => `<button type="button" data-v="${v}">${n}</button>`).join('')}</div>`;
  const range = root.querySelector('input');
  const s = { value: initial, target: initial };
  const name = (v) => STOPS.reduce((a, b) => (Math.abs(b[1] - v) < Math.abs(a[1] - v) ? b : a))[0];
  const sync = () => {
    range.setAttribute('aria-valuetext', name(s.target));
    root.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(name(s.target) === b.textContent)));
  };
  range.addEventListener('input', () => { s.target = range.value / 1000; s.value = s.target; sync(); });
  root.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { s.target = +b.dataset.v; range.value = s.target * 1000; sync(); }));
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
