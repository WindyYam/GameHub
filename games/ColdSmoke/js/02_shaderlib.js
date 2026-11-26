"use strict";
// ---------------------------------------------------------------- shared shader chunks (SSL = typed WGSL subset, see 01_gfx.js)
defineGlobals([
  ['viewProj', 'mat4x4f'], ['invViewProj', 'mat4x4f'], ['prevViewProj', 'mat4x4f'], ['shadowVP', 'mat4x4f'],
  ['camPos', 'vec4f'],     // xyz render-space camera position, w time (s)
  ['camRight', 'vec4f'],   // xyz, w tan(fovY/2)
  ['camUp', 'vec4f'],      // xyz, w aspect
  ['camFwd', 'vec4f'],     // xyz, w near plane
  ['eyeCenter', 'vec4f'],  // xy tangent-space offset of the image centre from the optical axis
  ['sunDir', 'vec4f'],     // xyz toward the light (sun, or moon at night), w how milky the horizon haze is (1 by day, 0 when the sun is on the horizon)
  ['sunCol', 'vec4f'],     // rgb light radiance at ground, w disc intensity
  ['ambSky', 'vec4f'],     // rgb sky irradiance from above, w exposure
  ['ambGnd', 'vec4f'],     // rgb bounce irradiance from below, w blowing snow (spindrift) amount
  ['fogA', 'vec4f'],       // x density, y height falloff, z fog reference height (render-space y), w far-fade distance
  ['res', 'vec4f'],        // w, h, 1/w, 1/h of the scene target
  ['origin', 'vec4f'],     // xyz floating-origin offset mod 1024 (keeps periodic noise continuous), w frame counter
  ['misc', 'vec4f'],       // x speed m/s, y lean (-1..1), z dt, w shadow range (m)
  ['wind', 'vec4f'],       // xyz wind velocity, w gust phase
  ['player', 'vec4f'],     // xyz render-space skier position, w airborne 0/1
  ['sunScr', 'vec4f'],     // xy sun position in uv, z visible (in front) 0/1, w sun elevation (rad)
  ['fx', 'vec4f'],         // x diamond dust amount, y sparkle gain, z nebula gain, w snow micro-shadow amount
  ['skyP', 'vec4f'],       // x sky LUT exposure scale, y cloud drift, z city lights 0..1, w stars 0..1
  ['dof', 'vec4f'],        // x focus distance, y aperture scale (px), z max coc px, w shutter (s)
  ['cloudP', 'vec4f'],     // xy drift of the cloud shadows (m, mod 1024), z their darkness 0..1, w coverage threshold
  ['sprayT', 'vec4f'],     // the thrown snow's sun-side depth map: x scale, yz offset (from shadow-map xy), w light depth of the skier
  ['twi', 'vec4f'],        // rgb light of the bright band of sky low on the sun's bearing (what lights a slope after sunset), w spare
  ['lamp', 'vec4f'],       // the skier's headlamp, lit after dark: xyz render-space position, w strength (0 = off)
  ['lampDir', 'vec4f'],    // xyz where it points, w 1: the trees' grain and the shafts' march offsets held still ('tgrain' b, 14_trees.js), 0: new every frame
]);

const SL = {};

SL.hash = `
fn pcg(v: u32) -> u32 { let x: u32 = v * 747796405u + 2891336453u; let w: u32 = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u; return (w >> 22u) ^ w; }
fn u2f(h: u32) -> f32 { return f32(h >> 8u) * (1.0 / 16777216.0); }
fn hash11(x: f32) -> f32 { return u2f(pcg(u32(i32(floor(x))))); }
fn hash21(p: vec2f) -> f32 { let q: vec2i = vec2i(floor(p)); return u2f(pcg(u32(q.x) + pcg(u32(q.y)))); }
fn hash31(p: vec3f) -> f32 { let q: vec3i = vec3i(floor(p)); return u2f(pcg(u32(q.x) + pcg(u32(q.y) + pcg(u32(q.z))))); }
fn hash22(p: vec2f) -> vec2f { let q: vec2i = vec2i(floor(p)); let h: u32 = pcg(u32(q.x) + pcg(u32(q.y))); return vec2f(u2f(h), u2f(pcg(h))); }
fn hash33(p: vec3f) -> vec3f { let q: vec3i = vec3i(floor(p)); let h: u32 = pcg(u32(q.x) + pcg(u32(q.y) + pcg(u32(q.z)))); let h2: u32 = pcg(h); return vec3f(u2f(h), u2f(h2), u2f(pcg(h2))); }
fn hashu(n: u32) -> f32 { return u2f(pcg(n)); }
fn hashu3(n: u32) -> vec3f { let a: u32 = pcg(n); let b: u32 = pcg(a); return vec3f(u2f(a), u2f(b), u2f(pcg(b))); }
`;

// integer-lattice value noise (stable on every GPU; used by bakes and vertex stages)
SL.noise = `
fn vnoise2(p: vec2f) -> f32 {
  let i: vec2f = floor(p); let f: vec2f = p - i; let u: vec2f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn vnoise3(p: vec3f) -> f32 {
  let i: vec3f = floor(p); let f: vec3f = p - i; let u: vec3f = f * f * (3.0 - 2.0 * f);
  let a: f32 = mix(mix(hash31(i), hash31(i + vec3f(1.0, 0.0, 0.0)), u.x), mix(hash31(i + vec3f(0.0, 1.0, 0.0)), hash31(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y);
  let b: f32 = mix(mix(hash31(i + vec3f(0.0, 0.0, 1.0)), hash31(i + vec3f(1.0, 0.0, 1.0)), u.x), mix(hash31(i + vec3f(0.0, 1.0, 1.0)), hash31(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
fn fbm2(p: vec2f) -> f32 { var q: vec2f = p; var a: f32 = 0.5; var s: f32 = 0.0; for (var i: i32 = 0; i < 5; i++) { s += a * vnoise2(q); q = q * 2.03 + vec2f(17.1, 9.2); a *= 0.5; } return s / 0.96875; }
fn fbm3(p: vec3f) -> f32 { var q: vec3f = p; var a: f32 = 0.5; var s: f32 = 0.0; for (var i: i32 = 0; i < 5; i++) { s += a * vnoise3(q); q = q * 2.03 + vec3f(17.1, 9.2, 5.4); a *= 0.5; } return s / 0.96875; }
fn fbm3n(p: vec3f, n: i32) -> f32 { var q: vec3f = p; var a: f32 = 0.5; var s: f32 = 0.0; var w: f32 = 0.0; for (var i: i32 = 0; i < n; i++) { s += a * vnoise3(q); w += a; q = q * 2.03 + vec3f(17.1, 9.2, 5.4); a *= 0.5; } return s / w; }
`;

// texture-based 3D value noise (one bilinear fetch): needs tNoise (256^2, G channel = R shifted by (37,17))
SL.tnoise = `
fn tnoise3(p: vec3f) -> f32 {
  let i: vec3f = floor(p); var f: vec3f = p - i; f = f * f * (3.0 - 2.0 * f);
  let uv: vec2f = (i.xy + vec2f(37.0, 17.0) * i.z) + f.xy;
  let rg: vec2f = texLod(tNoise, (uv + 0.5) / 256.0, 0.0).rg;
  return mix(rg.x, rg.y, f.z);
}
fn tfbm3(p: vec3f) -> f32 { return 0.5333 * tnoise3(p) + 0.2667 * tnoise3(p * 2.02 + vec3f(5.1, 1.7, 9.3)) + 0.1333 * tnoise3(p * 4.03 + vec3f(2.3, 7.7, 4.1)) + 0.0667 * tnoise3(p * 8.01); }
`;

SL.common = `
fn screenRay(ndc: vec2f) -> vec3f {
  let slope: vec2f = ndc * vec2f(U.camRight.w * U.camUp.w, U.camRight.w) + U.eyeCenter.xy;
  return U.camFwd.xyz + U.camRight.xyz * slope.x + U.camUp.xyz * slope.y;
}
const PI: f32 = 3.14159265;
fn sq(x: f32) -> f32 { return x * x; }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn remap(x: f32, a: f32, b: f32) -> f32 { return saturate((x - a) / (b - a)); }
// the sky is not evenly bright: low on the sun's bearing lies a band many times brighter than the rest, and at dusk it is the main light.
// Whatever faces that way takes its colour.
fn twiLight(N: vec3f) -> vec3f { let h: vec2f = normalize(U.sunDir.xz + vec2f(1e-5, 0.0)); let g: f32 = saturate(dot(N, vec3f(h.x * 0.97, 0.24, h.y * 0.97)) * 0.5 + 0.5); return U.twi.rgb * (g * g * g); }
// the skier's headlamp: a warm spot inside a wide faint flood. What arrives at a point (to be multiplied by how the surface there answers it).
// The fall-off is that of a broad reflector, not a bare point: the snow at the ski tips is not burnt out, and the pool lies a few lengths
// ahead, where the skier is looking. It throws no shadows of its own: nothing stands between it and what it looks at.
// (the spot has no rim: it thins away over a wide angle, so that on a bank close ahead it is a glow and not a disc with an edge)
fn lampCone(c: f32) -> f32 { let s: f32 = smoothstep(0.80, 0.998, c); return 0.06 * smoothstep(0.30, 0.85, c) + s * s + 0.9 * pow(smoothstep(0.955, 0.999, c), 3.0); }   // (an LED's hot centre over its flood)
fn lampLight(wp: vec3f) -> vec3f {
  if (U.lamp.w <= 0.0) { return vec3f(0.0); }
  let d: vec3f = wp - U.lamp.xyz; let r2: f32 = dot(d, d);
  let c: f32 = dot(d, U.lampDir.xyz) / sqrt(max(r2, 1e-4));
  return vec3f(1.0, 0.85, 0.64) * (U.lamp.w * lampCone(c) / (r2 + 30.0));
}
fn hg(c: f32, g: f32) -> f32 { let g2: f32 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
// sky-view LUT: u = azimuth from the sun (0..PI mirrored), v = elevation with extra resolution at the horizon
fn skyUV(d: vec3f, sun: vec3f) -> vec2f {
  let el: f32 = asin(clamp(d.y, -1.0, 1.0));
  let sh: vec2f = normalize(sun.xz + vec2f(1e-5, 0.0)); let dh: vec2f = normalize(d.xz + vec2f(1e-5, 0.0));
  let az: f32 = acos(clamp(dot(sh, dh), -1.0, 1.0));
  let vv: f32 = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (PI * 0.5));
  return vec2f(az / PI * (127.0 / 128.0) + 0.5 / 128.0, 1.0 - (vv * (63.0 / 64.0) + 0.5 / 64.0));
}
`;

// shared fog / aerial perspective (needs tSky)
SL.fog = `
fn skyLut0(d: vec3f) -> vec3f { return texLod(tSky, skyUV(d, U.sunDir.xyz), 0.0).rgb * U.skyP.x; }
// (under heavy snow's overcast, U.twi.w, the air and what is mirrored take the overcast's grey, not the clear sky's blue: 05b_weather.js)
fn skyLut(d: vec3f) -> vec3f { return mix(skyLut0(d), U.ambSky.rgb * 2.4, U.twi.w * 0.85); }
fn fogAmount(wp: vec3f) -> f32 {
  let v: vec3f = wp - U.camPos.xyz; let dist: f32 = length(v);
  // exponential height fog, analytic integral along the ray
  let k: f32 = U.fogA.y; let h0: f32 = U.camPos.y - U.fogA.z; let dy: f32 = v.y;
  var t: f32 = k * dy; if (abs(t) < 1e-3) { t = 1e-3; }
  let od: f32 = U.fogA.x * dist * exp(-k * h0) * (1.0 - exp(-t)) / t;
  return 1.0 - exp(-od);
}
fn applyFog(col: vec3f, wp: vec3f) -> vec3f {
  let v: vec3f = wp - U.camPos.xyz; let dist: f32 = length(v); let d: vec3f = v / max(dist, 1e-3);
  let f: f32 = fogAmount(wp);
  // haze takes the colour of the sky behind it, flattened toward the horizon band so far terrain melts into the cloud sea
  let hd: vec3f = normalize(vec3f(d.x, max(d.y, -0.02) * 0.4 + 0.03, d.z));
  var fc: vec3f = skyLut(hd);
  let mu: f32 = dot(d, U.sunDir.xyz);
  fc += U.sunCol.rgb * (hg(mu, 0.72) * 0.55 + hg(mu, 0.2) * 0.15) * 0.25;
  return mix(col, fc, f);
}
`;

// scene depth buffer -> distance along the camera axis (m). Constants match Render.cam near/far.
const CAM_NEAR = 0.25, CAM_FAR = 14000;
SL.depth = `
fn linDepth(d: f32) -> f32 { return ${(CAM_NEAR * CAM_FAR).toFixed(1)} / (${CAM_FAR.toFixed(1)} - d * ${(CAM_FAR - CAM_NEAR).toFixed(2)}); }
`;
// (views) first person draws from closer in than CAM_NEAR, to show the skier's own hands: the near plane is read from the frame (U.camFwd.w) instead
SL.depth = `
fn linDepth(d: f32) -> f32 { let n: f32 = U.camFwd.w; return n * ${CAM_FAR.toFixed(1)} / (${CAM_FAR.toFixed(1)} - d * (${CAM_FAR.toFixed(1)} - n)); }
`;

SL.shadow = `
// shadows of the clouds overhead, drifting with the wind: two octaves of lattice noise that repeat every 1024 m, so the pattern
// survives the floating origin. The clouds part round the skier (a sunlit clearing travels with them): the light show stays on.
fn cloudLat(i: vec2f, per: f32) -> f32 { let w: vec2f = i - per * floor(i / per); return fract(sin(dot(w, vec2f(127.1, 311.7)) + 1.3) * 43758.5453); }
fn cloudVN(p: vec2f, per: f32) -> f32 {
  let i: vec2f = floor(p); let f: vec2f = p - i; let u: vec2f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cloudLat(i, per), cloudLat(i + vec2f(1.0, 0.0), per), u.x), mix(cloudLat(i + vec2f(0.0, 1.0), per), cloudLat(i + vec2f(1.0, 1.0), per), u.x), u.y);
}
fn cloudShade(wp: vec3f) -> f32 {
  let q: vec2f = wp.xz + U.origin.xz + U.cloudP.xy;
  let n: f32 = cloudVN(q / 256.0, 4.0) * 0.62 + cloudVN(q / 128.0 + vec2f(3.7, 1.9), 8.0) * 0.38;
  let open: f32 = smoothstep(110.0, 300.0, length(wp.xz - U.player.xz));
  return 1.0 - U.cloudP.z * open * smoothstep(U.cloudP.w, U.cloudP.w + 0.09, n);
}
fn shadowAt(wp: vec3f, bias: f32) -> f32 {
  let sp: vec4f = U.shadowVP * vec4f(wp, 1.0);
  let uv: vec2f = vec2f(sp.x * 0.5 + 0.5, 0.5 - sp.y * 0.5);
  let e: vec2f = abs(sp.xy);
  let fade: f32 = smoothstep(0.86, 0.98, max(e.x, e.y));
  if (fade >= 1.0 || sp.z > 1.0 || sp.z < 0.0) { return cloudShade(wp); }
  let ts: f32 = 1.0 / texSize(tShadow).x; let z: f32 = sp.z - bias;
  var s: f32 = texShadow(tShadow, uv + vec2f(-0.75, -0.25) * ts, z) + texShadow(tShadow, uv + vec2f(0.25, -0.75) * ts, z)
             + texShadow(tShadow, uv + vec2f(0.75, 0.25) * ts, z) + texShadow(tShadow, uv + vec2f(-0.25, 0.75) * ts, z);
  return mix(s * 0.25, 1.0, fade) * cloudShade(wp);
}
// 1 where the shadow map can answer for this point, 0 beyond its edges
fn shadowCover(wp: vec3f) -> f32 {
  let sp: vec4f = U.shadowVP * vec4f(wp, 1.0);
  if (sp.z > 1.0 || sp.z < 0.0) { return 0.0; }
  let e: vec2f = abs(sp.xy);
  return 1.0 - smoothstep(0.86, 0.98, max(e.x, e.y));
}
fn shadowFast(wp: vec3f, bias: f32) -> f32 {
  let sp: vec4f = U.shadowVP * vec4f(wp, 1.0);
  let uv: vec2f = vec2f(sp.x * 0.5 + 0.5, 0.5 - sp.y * 0.5);
  let e: vec2f = abs(sp.xy);
  if (max(e.x, e.y) > 0.97 || sp.z > 1.0 || sp.z < 0.0) { return 1.0; }
  return texShadow(tShadow, uv, sp.z - bias);
}
// the snow's own lookup. The sun is half a degree wide, so an edge blurs with the distance to what casts it: a boot's is sharp, a spruce
// tip's twenty metres off is soft. And a low sun stretches each 6 cm texel along its light into metre-long steps that only a wider
// kernel hides. So: four taps ask whether the caster stands more than 3 m up the ray; where it does, eight taps on a disc turned
// per point (5 texels across at sunset, 1 at noon) soften the edge; where it does not, the old tight kernel keeps the foot sharp
fn shadowSoft(wp: vec3f, bias: f32) -> f32 {
  let sp: vec4f = U.shadowVP * vec4f(wp, 1.0);
  let uv: vec2f = vec2f(sp.x * 0.5 + 0.5, 0.5 - sp.y * 0.5);
  let e: vec2f = abs(sp.xy);
  let fade: f32 = smoothstep(0.86, 0.98, max(e.x, e.y));
  if (fade >= 1.0 || sp.z > 1.0 || sp.z < 0.0) { return cloudShade(wp); }
  let ts: f32 = 1.0 / texSize(tShadow).x; let z: f32 = sp.z - bias;
  let rm: f32 = clamp(0.25 / max(U.sunDir.y, 0.04), 1.0, 5.0) * ts; let zf: f32 = z - 0.0025;
  let far: f32 = 1.0 - 0.25 * (texShadow(tShadow, uv + vec2f(-0.7, -0.7) * rm, zf) + texShadow(tShadow, uv + vec2f(0.7, -0.7) * rm, zf)
             + texShadow(tShadow, uv + vec2f(0.7, 0.7) * rm, zf) + texShadow(tShadow, uv + vec2f(-0.7, 0.7) * rm, zf));
  var s: f32 = 0.0;
  if (far <= 0.0) {
    s = 0.25 * (texShadow(tShadow, uv + vec2f(-0.75, -0.25) * ts, z) + texShadow(tShadow, uv + vec2f(0.25, -0.75) * ts, z)
             + texShadow(tShadow, uv + vec2f(0.75, 0.25) * ts, z) + texShadow(tShadow, uv + vec2f(-0.25, 0.75) * ts, z));
  } else {
    let r: f32 = mix(0.75 * ts, rm, far);
    let a: f32 = 6.2832 * fract(52.9829 * fract(dot(wp.xz * 97.0, vec2f(0.06711056, 0.00583715))));
    let c: f32 = cos(a) * r; let sn: f32 = sin(a) * r;
    let m: mat2x2f = mat2x2f(vec2f(c, sn), vec2f(-sn, c));
    s = 0.125 * (texShadow(tShadow, uv + m * vec2f(-0.326, -0.406), z) + texShadow(tShadow, uv + m * vec2f(-0.840, -0.074), z)
             + texShadow(tShadow, uv + m * vec2f(-0.696, 0.457), z) + texShadow(tShadow, uv + m * vec2f(-0.203, 0.621), z)
             + texShadow(tShadow, uv + m * vec2f(0.962, -0.195), z) + texShadow(tShadow, uv + m * vec2f(0.473, -0.480), z)
             + texShadow(tShadow, uv + m * vec2f(0.519, 0.767), z) + texShadow(tShadow, uv + m * vec2f(0.185, -0.893), z));
  }
  return mix(s, 1.0, fade) * cloudShade(wp);
}
`;

// how much thrown snow lies between a point and the sun. The snow cloud is drawn from the sun's side into a small map of
// (optical depth, and its first two moments in depth), so a point INSIDE the cloud is shadowed only by the part on its sunward side:
// the curtain gets a lit face and a shaded face, and its shadow on the slope is soft and see-through at the edges.
SL.sprayTau = `
fn sprayTau(wp: vec3f, lift: f32) -> f32 {
  let sp: vec4f = U.shadowVP * vec4f(wp, 1.0);
  let q: vec2f = sp.xy * U.sprayT.x - U.sprayT.yz;
  if (max(abs(q.x), abs(q.y)) >= 0.97) { return 0.0; }
  let m: vec4f = texLod(tSunTau, vec2f(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5), 0.0);
  if (m.x < 0.002) { return 0.0; }
  let zr: f32 = (sp.z - U.sprayT.w) * 1199.0 - lift;
  let mu: f32 = m.y / m.x; let sg: f32 = sqrt(max(m.z / m.x - mu * mu, 0.0)) + 0.07;
  return m.x * smoothstep(-1.7, 1.7, (zr - mu) / sg);
}
`;

// physically based clear-sky single scattering (used to bake the sky LUT; the same maths runs in JS for the sun/ambient colours)
SL.atmo = `
const ATM_RE: f32 = 6360e3; const ATM_RA: f32 = 6460e3;
fn raySphere(o: vec3f, d: vec3f, r: f32) -> vec2f { let b: f32 = dot(o, d); let c: f32 = dot(o, o) - r * r; let h: f32 = b * b - c; if (h < 0.0) { return vec2f(-1.0, -1.0); } let s: f32 = sqrt(h); return vec2f(-b - s, -b + s); }
fn atmoDensity(h: f32) -> vec3f { return vec3f(exp(-h / 8000.0), exp(-h / 1200.0), max(0.0, 1.0 - abs(h - 25000.0) / 15000.0)); }
fn atmoScatter(o: vec3f, d: vec3f, sun: vec3f, alt: f32) -> vec3f {
  let bR: vec3f = vec3f(5.802e-6, 13.558e-6, 33.1e-6); let bM: f32 = 3.996e-6 * 1.6; let bMe: f32 = 4.44e-6 * 1.6; let bO: vec3f = vec3f(0.650e-6, 1.881e-6, 0.085e-6);
  let ro: vec3f = vec3f(0.0, ATM_RE + alt, 0.0);
  let ta: vec2f = raySphere(ro, d, ATM_RA); let tg: vec2f = raySphere(ro, d, ATM_RE - 2500.0);
  var tmax: f32 = ta.y; if (tg.x > 0.0) { tmax = min(tmax, tg.x); }
  if (tmax <= 0.0) { return vec3f(0.0); }
  let mu: f32 = dot(d, sun); let pR: f32 = 3.0 / (16.0 * PI) * (1.0 + mu * mu); let pM: f32 = hg(mu, 0.78) * 0.85 + hg(mu, 0.35) * 0.15;
  var od: vec3f = vec3f(0.0); var sumR: vec3f = vec3f(0.0); var sumM: vec3f = vec3f(0.0); var sumMS: vec3f = vec3f(0.0);
  let N: i32 = 24; var tPrev: f32 = 0.0;
  for (var i: i32 = 0; i < N; i++) {
    let fr: f32 = (f32(i) + 0.5) / f32(N); let t: f32 = tmax * fr * fr; let tn: f32 = tmax * sq((f32(i) + 1.0) / f32(N)); let dt: f32 = tn - tPrev; tPrev = tn;
    let p: vec3f = ro + d * t; let h: f32 = length(p) - ATM_RE; let dn: vec3f = atmoDensity(h) * dt; od += dn;
    let tl: vec2f = raySphere(p, sun, ATM_RA); let tgl: vec2f = raySphere(p, sun, ATM_RE - 2500.0);
    var odl: vec3f = vec3f(0.0); let M: i32 = 6; let dl: f32 = tl.y / f32(M);
    for (var j: i32 = 0; j < M; j++) { let pl: vec3f = p + sun * (f32(j) + 0.5) * dl; odl += atmoDensity(length(pl) - ATM_RE) * dl; }
    let tau: vec3f = bR * (od.x + odl.x) + vec3f(bMe) * (od.y + odl.y) + bO * (od.z + odl.z);
    var att: vec3f = exp(-tau);
    if (tgl.x > 0.0) { att *= smoothstep(-0.02, 0.0, -tgl.x / ATM_RE - 0.01); }   // planet shadow
    sumR += att * dn.x; sumM += att * dn.y;
    // cheap multiple scattering: isotropic second bounce lit by an already-attenuated sun
    let tau2: vec3f = bR * (od.x + odl.x * 0.35) + vec3f(bMe) * (od.y + odl.y * 0.35) + bO * (od.z + odl.z);
    sumMS += exp(-tau2) * (dn.x * bR + dn.y * vec3f(bM)) ;
  }
  let sunUp: f32 = smoothstep(-0.12, 0.05, sun.y);
  return sumR * bR * pR + sumM * bM * pM + sumMS * 0.045 * (0.5 + 0.5 * sunUp);
}
fn atmoTransmit(alt: f32, d: vec3f) -> vec3f {
  let bR: vec3f = vec3f(5.802e-6, 13.558e-6, 33.1e-6); let bMe: f32 = 4.44e-6 * 1.6; let bO: vec3f = vec3f(0.650e-6, 1.881e-6, 0.085e-6);
  let ro: vec3f = vec3f(0.0, ATM_RE + alt, 0.0); let ta: vec2f = raySphere(ro, d, ATM_RA);
  var od: vec3f = vec3f(0.0); let M: i32 = 16; let dl: f32 = ta.y / f32(M);
  for (var j: i32 = 0; j < M; j++) { let pl: vec3f = ro + d * (f32(j) + 0.5) * dl; od += atmoDensity(length(pl) - ATM_RE) * dl; }
  return exp(-(bR * od.x + vec3f(bMe) * od.y + bO * od.z));
}
`;

// JS mirror of the atmosphere model (sun colour at the ground, ambient irradiance) — plain numbers, same constants
const Atmo = (() => {
  const RE = 6360e3, RA = 6460e3, bR = [5.802e-6, 13.558e-6, 33.1e-6], bM = 3.996e-6 * 1.6, bMe = 4.44e-6 * 1.6, bO = [0.650e-6, 1.881e-6, 0.085e-6];
  const rs = (o, d, r) => { const b = v3.dot(o, d), c = v3.dot(o, o) - r * r, h = b * b - c; if (h < 0) return [-1, -1]; const s = Math.sqrt(h); return [-b - s, -b + s]; };
  const dens = h => [Math.exp(-h / 8000), Math.exp(-h / 1200), Math.max(0, 1 - Math.abs(h - 25000) / 15000)];
  const hgf = (c, g) => (1 - g * g) / (12.566 * Math.pow(Math.max(1 + g * g - 2 * g * c, 1e-4), 1.5));
  function transmit(alt, d) {
    const ro = [0, RE + alt, 0], ta = rs(ro, d, RA), tg = rs(ro, d, RE - 2500); if (tg[0] > 0) return [0, 0, 0];
    const M = 24, dl = ta[1] / M; let od = [0, 0, 0];
    for (let j = 0; j < M; j++) { const p = v3.mad(ro, d, (j + 0.5) * dl), dn = dens(v3.len(p) - RE); od[0] += dn[0] * dl; od[1] += dn[1] * dl; od[2] += dn[2] * dl; }
    return [0, 1, 2].map(c => Math.exp(-(bR[c] * od[0] + bMe * od[1] + bO[c] * od[2])));
  }
  function scatter(d, sun, alt) {
    const ro = [0, RE + alt, 0], ta = rs(ro, d, RA), tg = rs(ro, d, RE - 2500); let tmax = ta[1]; if (tg[0] > 0) tmax = Math.min(tmax, tg[0]); if (tmax <= 0) return [0, 0, 0];
    const mu = v3.dot(d, sun), pR = 3 / (16 * PI) * (1 + mu * mu), pM = hgf(mu, 0.78) * 0.85 + hgf(mu, 0.35) * 0.15;
    const od = [0, 0, 0], sR = [0, 0, 0], sM = [0, 0, 0], sMS = [0, 0, 0], N = 16; let tPrev = 0;
    for (let i = 0; i < N; i++) {
      const fr = (i + 0.5) / N, t = tmax * fr * fr, tn = tmax * ((i + 1) / N) ** 2, dt = tn - tPrev; tPrev = tn;
      const p = v3.mad(ro, d, t), dn = dens(v3.len(p) - RE); od[0] += dn[0] * dt; od[1] += dn[1] * dt; od[2] += dn[2] * dt;
      const tl = rs(p, sun, RA), tgl = rs(p, sun, RE - 2500), M = 5, dl = tl[1] / M, odl = [0, 0, 0];
      for (let j = 0; j < M; j++) { const pl = v3.mad(p, sun, (j + 0.5) * dl), d2 = dens(v3.len(pl) - RE); odl[0] += d2[0] * dl; odl[1] += d2[1] * dl; odl[2] += d2[2] * dl; }
      const shadow = tgl[0] > 0 ? 0 : 1;
      for (let c = 0; c < 3; c++) {
        const att = Math.exp(-(bR[c] * (od[0] + odl[0]) + bMe * (od[1] + odl[1]) + bO[c] * (od[2] + odl[2]))) * shadow;
        sR[c] += att * dn[0] * dt; sM[c] += att * dn[1] * dt;
        sMS[c] += Math.exp(-(bR[c] * (od[0] + odl[0] * 0.35) + bMe * (od[1] + odl[1] * 0.35) + bO[c] * (od[2] + odl[2]))) * (dn[0] * dt * bR[c] + dn[1] * dt * bM);
      }
    }
    const sunUp = smooth(-0.12, 0.05, sun[1]);
    return [0, 1, 2].map(c => sR[c] * bR[c] * pR + sM[c] * bM * pM + sMS[c] * 0.045 * (0.5 + 0.5 * sunUp));
  }
  // cosine-weighted hemisphere irradiance (upper) from the sky, by a small fixed sample set
  function irradiance(sun, alt) {
    const acc = [0, 0, 0]; let w = 0; const n = 24;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, phi = i * 2.399963, ct = Math.sqrt(1 - u), st = Math.sqrt(u);
      const d = [st * Math.cos(phi), ct, st * Math.sin(phi)], s = scatter(d, sun, alt);
      acc[0] += s[0]; acc[1] += s[1]; acc[2] += s[2]; w++;
    }
    return acc.map(c => c / w * PI);
  }
  return { transmit, scatter, irradiance };
})();

SL.tonemap = `
fn agxContrast(x: vec3f) -> vec3f { let x2: vec3f = x * x; let x4: vec3f = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
fn agx(c: vec3f) -> vec3f {
  let inM: mat3x3f = mat3x3f(vec3f(0.842479062253094, 0.0423282422610123, 0.0423756549057051), vec3f(0.0784335999999992, 0.878468636469772, 0.0784336), vec3f(0.0792237451477643, 0.0791661274605434, 0.879142973793104));
  let outM: mat3x3f = mat3x3f(vec3f(1.19687900512017, -0.0528968517574562, -0.0529716355144438), vec3f(-0.0980208811401368, 1.15190312990417, -0.0980434501171241), vec3f(-0.0990297440797205, -0.0989611768448433, 1.15107367264116));
  var v: vec3f = inM * c;
  v = clamp((log2(max(v, vec3f(1e-10))) + 12.47393) / 16.5, vec3f(0.0), vec3f(1.0));
  v = agxContrast(v);
  v = outM * v;
  return pow(max(v, vec3f(0.0)), vec3f(2.2));
}
// photographic curve (after H. Uchimura): a toe, a long straight section so lit snow keeps its form, and a short shoulder
fn filmCurve1(x: f32) -> f32 {
  let P: f32 = 1.0; let a: f32 = 1.0; let m: f32 = 0.22; let l: f32 = 0.42; let c: f32 = 1.38;
  let l0: f32 = (P - m) * l / a; let S0: f32 = m + l0; let S1: f32 = m + a * l0; let C2: f32 = a * P / (P - S1);
  let t: f32 = saturate(x / m); let w0: f32 = 1.0 - t * t * (3.0 - 2.0 * t); let w2: f32 = step(S0, x); let w1: f32 = 1.0 - w0 - w2;
  return m * pow(max(x, 0.0) / m, c) * w0 + (m + a * (x - m)) * w1 + (P - (P - S1) * exp(-C2 / P * (x - S0))) * w2;
}
fn filmCurve(c: vec3f) -> vec3f { return vec3f(filmCurve1(c.x), filmCurve1(c.y), filmCurve1(c.z)); }
fn acesFit(x: vec3f) -> vec3f { let a: vec3f = x * (x * 2.51 + 0.03); let b: vec3f = x * (x * 2.43 + 0.59) + 0.14; return saturate(a / b); }
fn toSRGB(c: vec3f) -> vec3f { let lo: vec3f = c * 12.92; let hi: vec3f = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055; return vec3f(select(hi.x, lo.x, c.x < 0.0031308), select(hi.y, lo.y, c.y < 0.0031308), select(hi.z, lo.z, c.z < 0.0031308)); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
// the same pattern, moved every frame: at 60 fps a dither that changes each frame reads as a true blend
fn ignT(p: vec2f) -> f32 { return ign(p + 5.588238 * (U.origin.w - 64.0 * floor(U.origin.w / 64.0))); }
`;
