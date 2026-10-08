/* sound.js — card sound effects for the player and host screens, and the host's countdown beeps.
 * Uses Web Audio so sounds start instantly and can overlap (fast clicking).
 * Browsers only allow sound after the player has tapped something, so the sounds
 * load on the first tap or key press. Sound can be switched off in the Game menu. */
const SFX = (() => {
  const FILES = { select: 'sounds/card-select.mp3', cascade: 'sounds/cascade.mp3', timeUp: 'sounds/time-up.mp3' };
  const VOLUME = { select: 0.7, cascade: 0.8, timeUp: 0.9 };
  let ctx = null, buffers = {}, playing = {};
  let on = true;
  try { on = localStorage.getItem('make24-sound') !== 'off'; } catch {}

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    for (const [name, url] of Object.entries(FILES)) {
      fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { buffers[name] = buf; }).catch(() => {});
    }
  }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true }));

  function play(name) {
    if (!on || !ctx || !buffers[name]) return;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buffers[name]; gain.gain.value = VOLUME[name] ?? 1;
    src.connect(gain).connect(ctx.destination); src.start();
    playing[name] = src;
  }
  // Countdown beeps (made on the fly, no file): a short beep for 3, 2, 1 and a longer, higher one for "go"
  function beep(kind) {
    if (!on || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const go = kind === 'go', t = ctx.currentTime, d = go ? 0.5 : 0.16;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = go ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function stop(name) { try { playing[name] && playing[name].stop(); } catch {} playing[name] = null; }
  function setOn(v) { on = v; try { localStorage.setItem('make24-sound', v ? 'on' : 'off'); } catch {} if (!v) Object.keys(playing).forEach(stop); }
  return { play, beep, stop, get on() { return on; }, setOn };
})();
