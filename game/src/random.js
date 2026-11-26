// A small seeded random number generator (mulberry32) and the smooth value
// noise built on it: the same seed gives the same valley, which is what
// makes the game and its screenshot scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D value noise in [0, 1), smooth in both axes. */
export function makeNoise(seed) {
  function hash(ix, iz) {
    const n = Math.sin(ix * 127.1 + iz * 311.7 + seed * 0.731) * 43758.5453;
    return n - Math.floor(n);
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  function noise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);
    const ux = smooth(fx);
    const uz = smooth(fz);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }
  /** Two octaves of value noise, still in [0, 1). */
  function fbm(x, z) {
    return noise(x, z) * 0.65 + noise(x * 2.13 + 7.3, z * 2.13 + 3.1) * 0.35;
  }
  return { noise, fbm };
}

/** Smoothstep helper: 0 below `from`, 1 above `to`, eased between. */
export function smoothstep(from, to, value) {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle `from` to angle `to`, in (-PI, PI]. */
export function angleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
