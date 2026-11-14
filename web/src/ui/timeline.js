// Season scrubber: a film strip of the 20 radar passes. Drag, click, arrow keys, Home/End, play.
import { fmtDate } from '../data/parcels.js';
import {reducedMotion} from './motion.js';

/** player (optional): {start(): boolean, stop()} drives playback (the cinematic time-lapse) instead of the 1.5 s interval. */
export function createTimeline(root, passes, fractions, onChange, player = null) {
  const n = passes.length;
  root.innerHTML = `
    <button class="tl-play" type="button" aria-label="Play the season">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-play" d="M4 2.5v11l9-5.5z"/><path class="i-pause" d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>
    </button>
    <button class="tl-prev" type="button" aria-label="Previous image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
    <button class="tl-next" type="button" aria-label="Next image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button>
    <div class="tl-strip" role="slider" tabindex="0" aria-label="Observation date" aria-valuemin="1" aria-valuemax="${n}">
      <div class="tl-frames" style="grid-template-columns:repeat(${n},1fr)">${passes.map((p, i) => `
        <div class="tl-frame${p.source === 'radar' ? ' is-radar' : ''}" data-i="${i}">
          <div class="tl-bar" style="--f:${fractions[i].toFixed(3)}"></div>
          <span class="tl-lab">${fmtDate(p.date).split(' ').slice(0, 2).join(' ')}</span>
        </div>`).join('')}
      </div>
      <div class="tl-head" aria-hidden="true"></div>
      <span class="tl-preview" aria-hidden="true"></span>
    </div>
    <div class="tl-readout" aria-live="polite">
      <span class="tl-date"></span>
      <span class="tl-counter"></span>
      <span class="tl-track"></span>
      <span class="tl-badge"></span>
    </div><p class="control-note observation-note">Observation date <span class="scan-note">Illustrated radar sweep</span></p>`;
  const strip = root.querySelector('.tl-strip');
  const head = root.querySelector('.tl-head');
  const play = root.querySelector('.tl-play');
  const frames = [...root.querySelectorAll('.tl-frame')];
  let cur = -1, playing = false, timer = 0;
  let dateAnimation=null,preview=-1;
  const dateLabel=root.querySelector('.tl-date'),tooltip=root.querySelector('.tl-preview');

  function set(i, user = true) {
    i = Math.max(0, Math.min(n - 1, i));
    if (i === cur) return;
    const animateDate=cur>=0&&!root.classList.contains('is-scrubbing')&&!reducedMotion();
    cur = i;
    const p = passes[i];
    head.style.transform = `translateX(${i * 100}%)`;
    head.style.width = `${100 / n}%`;
    frames.forEach((f, k) => f.classList.toggle('is-on', k === i));
    strip.setAttribute('aria-valuenow', i + 1);
    const real = p.source === 'radar';
    strip.setAttribute('aria-valuetext', `${fmtDate(p.date)}, ${real ? 'radar' : 'simulated'}`);
    dateLabel.textContent = fmtDate(p.date);
    root.querySelector('.tl-counter').textContent=`Image ${i+1} of ${n}`;
    dateAnimation?.cancel();
    if(animateDate)dateAnimation=dateLabel.animate([{opacity:.25,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'});
    root.querySelector('.tl-track').textContent = `Track ${p.track || '—'}`;
    const b = root.querySelector('.tl-badge');
    b.textContent = real ? 'NISAR' : 'Simulated';
    b.classList.toggle('is-real', real);
    root.querySelector('.tl-prev').disabled=i===0;
    root.querySelector('.tl-next').disabled=i===n-1;
    onChange(i, user);
  }
  const fromX = (x) => {
    const r = strip.getBoundingClientRect();
    return Math.floor(((x - r.left) / r.width) * n);
  };
  strip.addEventListener('pointerdown', (e) => {
    strip.setPointerCapture(e.pointerId);
    root.classList.add('is-scrubbing');clearPreview();
    stop();
    set(fromX(e.clientX));
    const move = (ev) => set(fromX(ev.clientX));
    const up = () => { root.classList.remove('is-scrubbing');strip.removeEventListener('pointermove', move); strip.removeEventListener('pointerup', up); strip.removeEventListener('pointercancel', up); };
    strip.addEventListener('pointermove', move);
    strip.addEventListener('pointerup', up);
    strip.addEventListener('pointercancel', up);
  });
  function clearPreview(){strip.classList.remove('has-preview');frames[preview]?.classList.remove('is-preview');preview=-1;}
  strip.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse'||e.buttons||root.classList.contains('is-scrubbing'))return;
    const i=Math.max(0,Math.min(n-1,fromX(e.clientX)));if(i===preview)return;
    frames[preview]?.classList.remove('is-preview');preview=i;frames[i].classList.add('is-preview');
    tooltip.textContent=fmtDate(passes[i].date);tooltip.style.left=((i+.5)/n*100)+'%';strip.classList.add('has-preview');
  });
  strip.addEventListener('pointerleave',clearPreview);
  strip.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (k) { stop(); set(cur + k); e.preventDefault(); }
    else if (e.key === 'Home') { stop(); set(0); e.preventDefault(); }
    else if (e.key === 'End') { stop(); set(n - 1); e.preventDefault(); }
  });
  function stop() { if (playing) player?.stop(); playing = false; clearInterval(timer); root.classList.remove('is-playing'); play.setAttribute('aria-label', 'Play the season'); }
  function start() {
    playing = true;
    root.classList.add('is-playing');
    play.setAttribute('aria-label', 'Pause');
    if (player?.start()) return;
    if (cur >= n - 1) set(0);
    timer = setInterval(() => { if (cur >= n - 1) stop(); else set(cur + 1); }, 1500);
  }
  play.addEventListener('click', () => (playing ? stop() : start()));
  root.querySelector('.tl-prev').addEventListener('click',()=>{stop();set(cur-1);});
  root.querySelector('.tl-next').addEventListener('click',()=>{stop();set(cur+1);});
  return { set: (i) => set(i, false), step: (d) => { stop(); set(cur + d); }, get index() { return cur; }, stop };
}
