// Tiny Web Audio sound effects - no assets, everything is synthesised.
//
// The audio context is created lazily on the first user gesture, because
// browsers refuse to start audio before one.

let ctx = null;
let master = null;
let enabled = true;

function ensure() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** One shaped oscillator note. */
function tone(freq, dur, { type = 'square', gain = 0.5, delay = 0, slideTo = null } = {}) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env);
  env.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A short burst of filtered noise. */
function noise(dur, { gain = 0.3, freq = 1200, delay = 0 } = {}) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const env = c.createGain();
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(env);
  env.connect(master);
  src.start(t0);
}

export const SFX = {
  /** Card picked up or put down. */
  select() {
    tone(520, 0.05, { type: 'square', gain: 0.18 });
  },
  /** A hand is played: a short rising arpeggio. */
  play() {
    [392, 523, 659].forEach((f, i) => tone(f, 0.12, { type: 'square', gain: 0.22, delay: i * 0.05 }));
  },
  /** Cards discarded: a papery swish. */
  discard() {
    noise(0.18, { gain: 0.25, freq: 2200 });
  },
  /** Something was bought. */
  buy() {
    tone(880, 0.07, { type: 'triangle', gain: 0.25 });
    tone(1320, 0.12, { type: 'triangle', gain: 0.2, delay: 0.06 });
  },
  /** A blind was beaten. */
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'square', gain: 0.2, delay: i * 0.09 }));
  },
  /** The run ended. */
  lose() {
    [392, 330, 262].forEach((f, i) => tone(f, 0.26, { type: 'sawtooth', gain: 0.18, delay: i * 0.14 }));
  },
  /** Something is wrong. */
  error() {
    tone(150, 0.14, { type: 'sawtooth', gain: 0.2 });
  },
  /** A generic UI click. */
  click() {
    tone(660, 0.04, { type: 'square', gain: 0.15 });
  },
  /** A new blind is on the table. */
  blind() {
    tone(220, 0.22, { type: 'sawtooth', gain: 0.16, slideTo: 330 });
  },
};

export function isMuted() { return !enabled; }

export function toggleMute() {
  enabled = !enabled;
  if (!enabled && ctx) {
    try { ctx.suspend(); } catch { /* ignore */ }
  } else if (ctx) {
    try { ctx.resume(); } catch { /* ignore */ }
  }
  return enabled;
}

/** Call from a user gesture to unlock audio on browsers that require it. */
export function unlockAudio() {
  ensure();
}
