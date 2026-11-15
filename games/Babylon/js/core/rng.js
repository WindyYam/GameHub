// rng.js — seeded randomness. The ONLY source of randomness allowed in scene code.
// Never use Math.random(), Date.now() or performance.now() in anything that affects a pixel.
//
//   const r = ctx.rng('houses');          // a FRESH generator for the named stream, same sequence every time
//   r.next()            -> [0, 1)
//   r.range(a, b)       -> [a, b)
//   r.int(a, b)         -> integer in [a, b] inclusive
//   r.pick(array), r.chance(p), r.gauss(), r.sign(), r.shuffle(array) (in place)
//   r.fork('lanes')     -> independent child stream
//   hash2(ix, iz, seed) -> stateless [0, 1) hash of two integers (use for per-cell / per-instance values:
//                          the result does not depend on how many numbers anyone else has drawn)

export const GLOBAL_SEED = 'babylon-575';

/** 32-bit string hash (xmur3 finaliser). */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Stateless integer hash -> [0, 1). */
export function hash2(ix, iz, seed = 0) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
export const hash1 = (i, seed = 0) => hash2(i, 0x9e37, seed);
/** Stateless hash of a float position quantised to `q` metres. */
export const hashPos = (x, z, seed = 0, q = 0.01) => hash2(Math.round(x / q), Math.round(z / q), seed);

export class Rng {
  /** @param {string|number} seed */
  constructor(seed) {
    this.seedName = String(seed);
    let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
    this._a = a || 0x6d2b79f5;
  }
  /** mulberry32 */
  next() {
    let t = (this._a = (this._a + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Weighted pick: weights is an array of numbers or an object {key: weight}. Returns index or key. */
  weighted(weights) {
    const keys = Array.isArray(weights) ? weights.map((_, i) => i) : Object.keys(weights);
    let sum = 0; for (const k of keys) sum += weights[k];
    let r = this.next() * sum;
    for (const k of keys) { r -= weights[k]; if (r <= 0) return k; }
    return keys[keys.length - 1];
  }
  gauss() {
    const u = Math.max(this.next(), 1e-12), v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  fork(name) { return new Rng(this.seedName + '/' + name); }
}

/** Factory used for ctx.rng: every call returns a fresh generator for the named stream. */
export function makeRngFactory(globalSeed = GLOBAL_SEED) {
  return (name = 'default') => new Rng(globalSeed + ':' + name);
}
