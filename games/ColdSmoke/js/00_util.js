"use strict";
// ---------------------------------------------------------------- util: math, hashing, noise (CPU side)
const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
const fract = x => x - Math.floor(x);
const damp = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);   // exponential approach
const sign = x => x < 0 ? -1 : x > 0 ? 1 : 0;

// integer hash (matches the shader-side pcg-ish hash bit for bit: uint32 arithmetic)
function hashU(x) { x = x >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16; return x >>> 0; }
function hash2U(x, y) { return hashU((x | 0) + Math.imul(hashU(y | 0), 0x9e3779b1) | 0); }
function hash3U(x, y, z) { return hashU((x | 0) + Math.imul(hash2U(y, z), 0x9e3779b1) | 0); }
const U2F = 1 / 4294967296;
const hash1 = (x) => hashU(x) * U2F;
const hash2 = (x, y) => hash2U(x, y) * U2F;
const hash3 = (x, y, z) => hash3U(x, y, z) * U2F;

// seeded RNG (mulberry32)
function RNG(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// value noise 1D/2D/3D with quintic fade, range [-1, 1]
function vnoise1(x, seed = 0) { const i = Math.floor(x), f = x - i; const u = f * f * f * (f * (f * 6 - 15) + 10); return lerp(hash2(i, seed), hash2(i + 1, seed), u) * 2 - 1; }
function vnoise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash3(ix, iy, seed), b = hash3(ix + 1, iy, seed), c = hash3(ix, iy + 1, seed), d = hash3(ix + 1, iy + 1, seed);
  return (lerp(lerp(a, b, ux), lerp(c, d, ux), uy)) * 2 - 1;
}
function vnoise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const s = seed * 7919;
  const h = (a, b, c) => hash3(a, b, c + s);
  const x00 = lerp(h(ix, iy, iz), h(ix + 1, iy, iz), ux), x10 = lerp(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), ux);
  const x01 = lerp(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), ux), x11 = lerp(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz) * 2 - 1;
}
function fbm2(x, y, oct, seed = 0, lac = 2, gain = 0.5) { let a = 0.5, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise2(x, y, seed + i * 131); n += a; x *= lac; y *= lac; a *= gain; } return s / n; }
function fbm3(x, y, z, oct, seed = 0) { let a = 0.5, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise3(x, y, z, seed + i * 17); n += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s / n; }

// ---- vec3 helpers (plain arrays)
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
};

// ---- mat4 (column-major Float64 arrays of 16; clip space z in [0,1], y up — WebGPU convention)
const m4 = {
  ident: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; } return o; },
  perspective(fovy, aspect, near, far) { const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far); return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far * nf, -1, 0, 0, far * near * nf, 0]; },
  ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, 1 / (n - f), 0, (l + r) / (l - r), (t + b) / (b - t), n / (n - f), 1]; },
  lookAt(eye, at, up) {
    const z = v3.norm(v3.sub(eye, at)), x = v3.norm(v3.cross(up, z)), y = v3.cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -v3.dot(x, eye), -v3.dot(y, eye), -v3.dot(z, eye), 1];
  },
  fromBasis(x, y, z, t) { return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, t[0], t[1], t[2], 1]; },
  translate(t) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1]; },
  scale(s) { return [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1]; },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  rotAxis(ax, a) { const [x, y, z] = v3.norm(ax), c = Math.cos(a), s = Math.sin(a), t = 1 - c; return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1]; },
  invert(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; det = 1 / det;
    return [(a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
      (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
      (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
      (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det];
  },
  tp(m, p) { const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w]; },
  td(m, d) { return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]]; },
};

// float32 -> float16 bits (for rgba16f uploads)
const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
function toHalf(v) {
  _f32[0] = v; const x = _u32[0]; const sgn = (x >>> 16) & 0x8000; let m = (x >>> 12) & 0x07ff; const e = (x >>> 23) & 0xff;
  if (e < 103) return sgn; if (e > 142) return sgn | 0x7c00 | ((e === 255 ? 0 : 1) && 0);
  if (e < 113) { m |= 0x0800; return sgn | ((m >> (114 - e)) + ((m >> (113 - e)) & 1)); }
  return (sgn | ((e - 112) << 10) | (m >> 1)) + (m & 1);
}

// ---------------------------------------------------------------- the frame the picture is shown in
// The game is made to be seen wide. A desktop window or a phone lying on its side is used as it comes; a phone held upright shows the
// picture turned a quarter turn (the player turns the phone, whether or not its rotation lock is on). Everything that deals in screen
// positions goes through here: the size of the frame, where a finger is inside it, and which way is down.
const View = (() => {
  const V = { rot: 0, w: 0, h: 0, forced: false, flip: false, wide: true, short: false };
  const handheld = () => !!(window.matchMedia && matchMedia('(pointer: coarse) and (hover: none)').matches);
  V.measure = function () {
    // UIKit reports the Metal surface in points when a window moves between displays.
    const iw = innerWidth, ih = innerHeight;
    V.forced = V.force != null ? V.force : handheld() && ih > iw * 1.04;
    V.rot = V.forced ? (V.flip ? -90 : 90) : 0;
    V.w = V.forced ? ih : iw; V.h = V.forced ? iw : ih;
    V.wide = V.w >= V.h * 1.12; V.short = V.h < 520;
    return V;
  };
  // a pointer's place in the picture's own frame
  V.x = e => V.rot === 90 ? e.clientY : V.rot === -90 ? innerHeight - e.clientY : e.clientX;
  V.y = e => V.rot === 90 ? innerWidth - e.clientX : V.rot === -90 ? e.clientX : e.clientY;
  // the angle the picture is seen at: what the browser reports, plus our own quarter turn
  V.angle = () => ((((screen.orientation && screen.orientation.angle) || window.orientation || 0) + (V.rot === 90 ? 90 : V.rot === -90 ? 270 : 0)) % 360 + 360) % 360;
  // which way up the phone is being held, from gravity in the device's own axes (only matters while we are doing the turning ourselves)
  V.gravity = function (gx) {
    if (!V.forced) return false;
    const want = gx > 0.5 ? true : gx < -0.5 ? false : V.flip;
    if (want === V.flip) return false;
    V.flip = want; return true;
  };
  return V;
})();

// ---------------------------------------------------------------- the live part of a ring of particles
// Spray and glitter are written into fixed rings in turn, and each record says when it was thrown (slot 3) and how long it lives (slot 10).
// Most of a ring is long dead at any moment, yet every slot used to be drawn: a phone paid for tens of thousands of empty quads a frame.
// A LiveRing counts the records written since the oldest one still alive, so only that run of the ring is drawn (one or two spans, as it wraps).
// The look is the same: a record is only dropped once its own life is over.
function LiveRing(N, stride) {
  const L = { N, n: 0 };
  L.put = () => { if (L.n < L.N) L.n++; };                       // after each record written
  L.clear = () => { L.n = 0; };
  // drop from the old end what has died by `now` (the time the shaders get, U.camPos.w); head = the next slot to be written
  L.trim = function (cpu, head, now) {
    while (L.n > 0) {
      const o = (((head - L.n) % N + N) % N) * stride, t0 = cpu[o + 3];
      if (now - t0 < cpu[o + 10] && t0 - now < 60) break;          // (still alive, or yet to be thrown; a record far in the future is a stale clock)
      L.n--;
    }
  };
  // f(first, count) for each span to draw
  L.spans = function (head, f) {
    const n = L.n; if (!n) return;
    const s = ((head - n) % N + N) % N;
    if (s + n <= N) f(s, n); else { f(s, N - s); f(0, n - (N - s)); }
  };
  return L;
}
