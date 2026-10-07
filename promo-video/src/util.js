// Timing, easing and small math helpers. Everything in the film is a pure
// function of time so any frame can be rendered on its own and the loop is exact.

export const BPM = 128;
export const BEAT = 60 / BPM;          // 0.46875 s
export const BEATS = 64;               // 16 bars
export const DUR = BEATS * BEAT;       // 30 s exactly

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (x, a, b) => clamp((x - a) / (b - a));
export const mod = (a, n) => ((a % n) + n) % n;
export const smooth = (t) => t * t * (3 - 2 * t);

export const ease = {
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
};

// Damped spring step response (0 -> 1 with overshoot). tau in seconds.
export function spring(tau, freq = 2.4, zeta = 0.36) {
  if (tau <= 0) return 0;
  const w = TAU * freq;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * tau) * (Math.cos(wd * tau) + ((zeta * w) / wd) * Math.sin(wd * tau));
}

// Decaying oscillation used for wobbles / jiggles after an impact.
export function wobble(tau, freq = 3, decay = 4) {
  if (tau <= 0) return 0;
  return Math.exp(-decay * tau) * Math.sin(TAU * freq * tau);
}

// One-sided exponential impulse (for flashes, kicks).
export function impulse(tau, decay = 8) {
  return tau < 0 ? 0 : Math.exp(-decay * tau);
}

// Pop in at beat b0, pop out at beat b1 (in beats, local timeline). Returns scale.
export function popInOut(b, b0, b1 = Infinity, outDur = 0.35) {
  if (b < b0) return 0;
  const sIn = spring((b - b0) * BEAT, 2.5, 0.44);
  if (b < b1) return sIn;
  const k = seg(b, b1, b1 + outDur);
  return sIn * (1 - ease.inBack(k, 2.2));
}

// Squash & stretch pair after an impact at tau (s) — returns [sx, sy].
export function squash(tau, amt = 0.22) {
  const w = wobble(tau, 3.2, 5.5) * amt;
  return [1 + w, 1 - w];
}

// Beat pump: sharp kick on every beat, decays within the beat.
export function pump(b, decay = 9) {
  const ph = mod(b, 1) * BEAT;
  return Math.exp(-decay * ph);
}

// Deterministic PRNG (mulberry32).
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sound-effect cue sheet. Shots register cues while they are built; the
// renderer dumps this list so the soundtrack lines up with the picture.
export const SFX = [];
export function cue(beat, type, gain = 1, pan = 0) {
  SFX.push({ beat: mod(beat, BEATS), t: mod(beat, BEATS) * BEAT, type, gain, pan });
}
