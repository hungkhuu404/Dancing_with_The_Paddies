import {tapForRecording} from '../audio/recordMix.js';
// Procedural ambient soundscape (Web Audio, no files): frogs + crickets at night, birds + roosters at dawn,
// distant boat engines, rain, thunder. Created on the first user click of the Sound toggle (no autoplay).
export function createSound() {
  let ac = null, master = null, noise = null, rainG = null, windG = null, waterG = null, engineG = null, engineOsc = null, engineLfo = null, duck = null;
  let narrating=false,paused=false;
  document.addEventListener('visibilitychange',()=>{if(!ac)return;if(document.hidden)ac.suspend().catch(()=>{});else if(st.on&&!paused)ac.resume().catch(()=>{});});
  const st = { on: false, next: { frog: 0, cricket: 0, bird: 0, rooster: 5 } };

  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0;
    duck=ac.createGain();duck.gain.value=narrating?.24:1;
    const limiter=ac.createDynamicsCompressor();limiter.threshold.value=-18;limiter.knee.value=12;limiter.ratio.value=4;limiter.attack.value=.01;limiter.release.value=.3;
    master.connect(duck).connect(limiter).connect(ac.destination);tapForRecording(ac,limiter);
    // 2 s of white noise, looped, feeds rain and wind
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise = buf;
    const loop = (filterType, f, q, spread=0) => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; const fl = ac.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); g.gain.value = 0; const stereo=ac.createStereoPanner();stereo.pan.value=spread;s.connect(fl).connect(g).connect(stereo).connect(master); s.start(0,Math.random()*2); return g; };
    rainG = loop('highpass', 1100, 0.4,-.35);
    windG = loop('lowpass', 420, 0.7,.45);
    waterG = loop('bandpass', 650, .6,-.5);
    // two-stroke engine: low sawtooth chopped by a ~9 Hz pulse, muffled by distance
    engineOsc = ac.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 52;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const chop = ac.createGain(); chop.gain.value = 0.5;
    engineLfo = ac.createOscillator(); engineLfo.frequency.value = 9; const lfoG = ac.createGain(); lfoG.gain.value = 0.5; engineLfo.connect(lfoG).connect(chop.gain);
    engineG = ac.createGain(); engineG.gain.value = 0;
    engineOsc.connect(lp).connect(chop).connect(engineG).connect(master);
    engineOsc.start(); engineLfo.start();
  }
  const pan = (p) => { const n = ac.createStereoPanner(); n.pan.value = p; n.connect(master); return n; };
  const tidy=(source,nodes)=>{source.onended=()=>nodes.forEach(n=>n.disconnect());};
  function frog(t, gain, p) { // two quick nasal croaks
    const out = pan(p);
    for (let k = 0; k < 2; k++) {
      const o = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain(), t0 = t + k * 0.16;
      o.type = 'square'; o.frequency.value = 180 + Math.random() * 120; m.frequency.value = 40 + Math.random() * 20; mg.gain.value = 60;
      m.connect(mg).connect(o.frequency);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 3;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
      o.connect(bp).connect(g).connect(out); o.start(t0); m.start(t0); o.stop(t0 + 0.15); m.stop(t0 + 0.15);
      tidy(o,k===1?[o,m,mg,bp,g,out]:[o,m,mg,bp,g]);
    }
  }
  function cricket(t, gain, p) { // a train of 4.5 kHz pulses
    const o = ac.createOscillator(), g = ac.createGain(), out = pan(p);
    o.frequency.value = 4300 + Math.random() * 600; g.gain.value = 0;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) { const a = t + i * 0.07; g.gain.setValueAtTime(0, a);g.gain.linearRampToValueAtTime(gain,a+.006);g.gain.linearRampToValueAtTime(0,a+.04); }
    o.connect(g).connect(out); o.start(t); o.stop(t + n * 0.07 + 0.05);
    tidy(o,[o,g,out]);
  }
  function bird(t, gain, p) { // fast up/down chirps
    const o = ac.createOscillator(), g = ac.createGain(), out = pan(p), n = 2 + Math.floor(Math.random() * 4), f = 2200 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      const a = t + i * 0.12;
      o.frequency.setValueAtTime(f, a); o.frequency.exponentialRampToValueAtTime(f * (1.3 + Math.random() * 0.5), a + 0.05); o.frequency.exponentialRampToValueAtTime(f * 0.9, a + 0.09);
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(gain, a + 0.01); g.gain.linearRampToValueAtTime(0, a + 0.09);
    }
    o.connect(g).connect(out); o.start(t); o.stop(t + n * 0.12 + 0.1);
    tidy(o,[o,g,out]);
  }
  function rooster(t, gain, p) { // "cock-a-doodle-doo": 4 pitch segments through a vowel-ish band
    const o = ac.createOscillator(), g = ac.createGain(), bp = ac.createBiquadFilter(), out = pan(p);
    o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2;
    const seg = [[480, 0.18], [620, 0.16], [560, 0.18], [700, 0.7]];
    let a = t;
    g.gain.setValueAtTime(0, a);
    for (const [f, d] of seg) { o.frequency.setValueAtTime(f, a); o.frequency.linearRampToValueAtTime(f * 1.08, a + d * 0.6); g.gain.linearRampToValueAtTime(gain, a + 0.03); g.gain.setValueAtTime(gain, a + d - 0.04); g.gain.linearRampToValueAtTime(gain * 0.2, a + d); a += d; }
    g.gain.linearRampToValueAtTime(0, a + 0.1);
    o.connect(bp).connect(g).connect(out); o.start(t); o.stop(a + 0.2);
    tidy(o,[o,bp,g,out]);
  }
  function thunder(t, gain) {
    const s = ac.createBufferSource(), lp = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; s.loop = true; lp.type = 'lowpass'; lp.frequency.value = 160;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    s.connect(lp).connect(g).connect(master); s.start(t); s.stop(t + 4.6);
    tidy(s,[s,lp,g]);
  }

  /** env: {night 0..1, dawn 0..1, rain 0..1 at the listener, engineDist m, flooded 0..1} */
  function update(env) {
    if (!st.on || !ac || paused || ac.state!=='running') return;
    const now = ac.currentTime, N = st.next, r = Math.random;
    rainG.gain.setTargetAtTime(env.rain * 0.35, now, 0.5);
    windG.gain.setTargetAtTime((0.024 + env.rain * 0.065)*(1+.18*Math.sin(now*.31)), now, 1);
    waterG.gain.setTargetAtTime(Math.max(0,Math.min(1,env.flooded))*.026*(.75+.25*Math.sin(now*1.3)),now,.8);
    engineG.gain.setTargetAtTime(Math.min(0.12, 25 / Math.max(25, env.engineDist)) * 0.5, now, 0.4);
    if (N.frog < now) { N.frog = now + 0.15 + r() * (1.2 - env.flooded * 0.8); if (env.night > 0.5) frog(now + 0.05, 0.06 * env.night * (0.3 + r()), r() * 2 - 1); }
    if (N.cricket < now) { N.cricket = now + 0.25 + r() * 0.6; if (env.night > 0.4) cricket(now + 0.05, 0.012 * env.night, r() * 2 - 1); }
    if (N.bird < now) { N.bird = now + 0.4 + r() * 2.5; const day = 1 - env.night; if (day > 0.4 && env.rain < 0.5) bird(now + 0.05, 0.02 * (0.4 + env.dawn * 1.2), r() * 2 - 1); }
    if (N.rooster < now) { N.rooster = now + 8 + r() * 20; if (env.dawn > 0.3) rooster(now + 0.05, 0.05 * env.dawn * (0.3 + r() * 0.7), r() * 2 - 1); }
  }

  return {
    update,
    get on() { return st.on; },
    setNarrating(active){narrating=!!active;if(duck)duck.gain.setTargetAtTime(narrating?.24:1,ac.currentTime,narrating?.12:.65);},
    setPaused(value) {
      paused=!!value;
      if(!ac)return;
      if(paused)ac.suspend().catch(()=>{});
      else if(st.on&&!document.hidden)ac.resume().catch(()=>{});
    },
    toggle() {
      if (!ac) init();
      st.on = !st.on;
      if (st.on&&!paused&&!document.hidden) ac.resume().catch(()=>{});
      master.gain.setTargetAtTime(st.on ? 0.9 : 0, ac.currentTime, 0.3);
      return st.on;
    },
    thunder(distM) { if (st.on && ac && !paused && Number.isFinite(distM)) thunder(ac.currentTime + Math.min(6000,Math.max(0,distM)) / 343, Math.min(0.35, 600 / Math.max(1,distM))); },
  };
}
