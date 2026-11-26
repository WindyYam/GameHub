"use strict";
// ---------------------------------------------------------------- diamond dust: the fine snow that hangs in clear cold air
// Nothing is simulated. Every crystal is a pure function of (index, time): a point in a box that wraps around the camera, drifting
// down with the wind. Three nested boxes give density where it matters: a wide sparse field, a closer one, and a handful right at the
// lens that the depth of field turns into soft discs. The light on each crystal comes from the same sun, through the same shadow map.
// (the wind's part of the drift is where the wind has carried the air so far, Weather.off, not the wind times the time: when the wind changes,
// in a gust or as heavy snow comes on, every crystal carries on from where it is)
// In heavy snow (05b_weather.js) two more things are drawn: the flakes, soft tufts of snow that hide what is behind them (big and blurred at the
// lens, single flakes near, a moving texture farther off; at speed they streak toward you), and the veil of all the snow falling beyond them,
// which takes the far city and ranges down to shapes. Light snow draws neither.
const Dust = (() => {
  const D = { enabled: true, layers: [
    { W: 32, n: 4600, power: 1.3, fall: 0.38 },
    { W: 8, n: 1700, power: 1.0, fall: 0.30 },
    { W: 2, n: 64, power: 1.5, fall: 0.22 },
  ],
  // the flakes of heavy snow (boxes must divide 1024 m, the floating origin's step): size = radius (m), fall (m/s), op = opacity, shut = how far
  // they streak (the dust's shutter times this). The counts are the blizzard's; the snow showers draw three quarters of them
  heavy: [
    { W: 32, n: 14000, size: 0.015, fall: 1.15, op: 0.7, shut: 3.5 },
    { W: 16, n: 14000, size: 0.018, fall: 1.05, op: 1.0, shut: 3.5 },
    { W: 4, n: 160, size: 0.021, fall: 0.9, op: 0.6, shut: 1.6 },
  ] };
  let gfx, pipe, pipeF, pipeV;
  D.init = function (g) {
    gfx = g;
    pipe = gfx.pipeline({
      name: 'dust', lib: [SL.common, SL.hash, SL.depth, SL.shadow, GLINT_SSL], topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'add',
      buffers: [], varyings: { uv: 'vec2f', shp: 'vec4f', col: 'vec4f' }, uniforms: { p: 'vec4f', o: 'vec4f', w: 'vec4f' },
      textures: { tDepth: 'depth', tShadow: 'shadow' },
      vs: `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  let W: f32 = M.p.x; let id: u32 = a.iid + u32(M.p.w);
  let h: vec3f = hashu3(id * 3u + 7u); let h2: vec3f = hashu3(id * 3u + 1013u);
  let tm: f32 = U.camPos.w;
  // drift: wind + settling, each crystal a little different, with a slow sideways flutter
  let wm: f32 = 0.55 + 0.5 * h2.x; let fall: f32 = M.p.z * (0.6 + 0.8 * h2.y);
  let vel: vec3f = U.wind.xyz * wm + vec3f(0.0, -fall, 0.0);
  let fl: vec3f = vec3f(sin(tm * (0.7 + h2.z) + h.x * 40.0), 0.0, cos(tm * (0.6 + h2.x) + h.z * 40.0)) * 0.12;
  let q: vec3f = h * W + M.o.xyz * wm + vec3f(0.0, -fall * tm, 0.0) + fl;
  // wrap into a box centred a little ahead of the camera
  let ctr: vec3f = U.camPos.xyz + U.camFwd.xyz * (0.36 * W);
  let rel: vec3f = (fract((q - ctr - U.origin.xyz) / W + 0.5) - 0.5) * W;
  let pos: vec3f = ctr + rel;
  let edge: f32 = max(abs(rel.x), max(abs(rel.y), abs(rel.z))) / W;
  let fade: f32 = smoothstep(0.5, 0.40, edge);
  // the dust is not spread evenly: it hangs in sheets a few metres thick that drift with the wind (three plane waves riding on the air,
  // each repeating every 1024 m), so the sparkle comes toward you in veils and thins out again behind them
  let pa: vec3f = pos + U.origin.xyz - M.w.xyz;
  let kk: f32 = 0.0061359232;
  let sv: f32 = sin(kk * dot(pa, vec3f(31.0, 9.0, 17.0))) + sin(kk * dot(pa, vec3f(-13.0, 47.0, 41.0)) + 1.3) + 0.6 * sin(kk * dot(pa, vec3f(57.0, -19.0, -71.0)) + 2.1);
  let veil: f32 = smoothstep(-0.5, 1.5, sv);
  let pw: f32 = M.p.y * U.fx.x * fade * (0.12 + 1.9 * h2.z * h2.z * h2.z) * (0.22 + 2.9 * veil * veil);
  let vis: f32 = shadowFast(pos, 0.0015);
  let g: GlintV = glintQuad(corner, pos, vel, h.y + h2.x * 0.37, pw, vis, 0.0, 1.0);
  v.clip = g.clip; v.uv = g.uv; v.shp = g.shp; v.col = g.col;
  return v;
}`,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut; o.color = glintShade(v.uv, v.shp, v.col); return o; }`,
    });
    pipeF = gfx.pipeline({
      name: 'flake', lib: [SL.common, SL.hash, SL.depth, SL.shadow, GLINT_SSL], topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'premul',
      buffers: [], varyings: { uv: 'vec2f', shp: 'vec4f', col: 'vec4f' }, uniforms: { p: 'vec4f', q: 'vec4f', o: 'vec4f' },
      textures: { tDepth: 'depth', tShadow: 'shadow' }, vs: FLAKE_VS, fs: FLAKE_FS,
    });
    pipeV = gfx.pipeline({
      name: 'snowVeil', lib: [SL.common, SL.depth, SL.tnoise], buffers: [], varyings: { uv: 'vec2f' }, uniforms: { a: 'vec4f', b: 'vec4f', c: 'vec4f', d: 'vec4f', e: 'vec4f' },
      textures: { tDepth: 'depth', tNoise: '2d' }, depth: false, depthTest: false, cull: 'none', blend: 'trans', vs: VS_FULLSCREEN, fs: veilFS(),
    });
    D.pipes = [pipe, pipeF, pipeV];
  };
  const off = R => typeof Weather !== 'undefined' ? Weather.off : [1.2 * R.time, 0, 0.4 * R.time];
  // the veil of the snow falling beyond the flakes: drawn over the finished scene before the thrown snow and the flakes (99_main.js)
  D.veil = function (R) {
    const u = typeof Weather !== 'undefined' ? Weather.veilU : null; if (!D.enabled || !u) return;
    gfx.draw(pipeV, { u, tex: { tDepth: R.depth, tNoise: Tex.noise }, count: 3 });
  };
  D.fx = function (R) {
    if (!D.enabled) return;
    const o = off(R), ow = [((o[0] % 1024) + 1024) % 1024, ((o[1] % 1024) + 1024) % 1024, ((o[2] % 1024) + 1024) % 1024, 0];
    const sh = typeof Weather !== 'undefined' && Weather.ks > 0.001 ? Weather.share || 0 : 0;
    const dayK = typeof Sky !== 'undefined' ? 1 - smooth(0.2, 0.8, Sky.night || 0) : 1;
    if (sh > 0.001) { let id = 0; for (const L of D.heavy) { const n = Math.min(L.n, Math.ceil(L.n * (sh + 0.04) * Quality.k('dust'))); gfx.draw(pipeF, { u: { p: [L.W, L.size, L.fall, id], q: [sh, L.shut, L.op, L.n], o: [o[0], o[1], o[2], dayK] }, tex: { tDepth: R.depth, tShadow: R.shadowTex }, count: 4, instances: n }); id += L.n; } }
    let id = 0;
    // 晴 turns the diamond dust down with Weather.dust (小雪 is 1, the way a clear day always looked); 大雪 is the flakes above
    const dustK = typeof Weather !== 'undefined' && Weather.dust != null ? Weather.dust : 1;
    for (const L of D.layers) { const n = Math.round(L.n * Quality.k('dust') * dustK); if (n > 0) gfx.draw(pipe, { u: { p: [L.W, L.power, L.fall, id], o: [o[0], o[1], o[2], 0], w: ow }, tex: { tDepth: R.depth, tShadow: R.shadowTex }, count: 4, instances: n }); id += L.n; }
  };
  return D;
})();

// ---- a flake of heavy snow: a loose tuft of crystals two or three centimetres across (鹅毛大雪, snow like goose down: bigger than most real ones). It rides the wind almost with it, settles at about a metre a
// second and sways in slow loops as it tumbles. It is not a spark: it hides what is behind it as much as it covers, lit by the overcast all round
// (so against the bright sky it is a grey speck, against the trees a white one), by the sun where that is out and comes through it (a backlit
// snowfall glows), by the lamp after dark and by a flash. M.p = (box, flake radius, fall speed, first id); M.q = (how much of the snowfall is
// falling now 0..1, streak, opacity, flakes in this box); M.o = how far the wind has carried the air
const FLAKE_VS = `
// a flake on screen: drawn at its own size (rp, px) blurred by the lens, a streak along its motion over the shutter; a big soft one near the
// lens streaks no longer than twice its disc (it is smeared already, and a long soft streak reads as a capsule, not as snow)
fn flakeQuad(corner: vec2f, pos: vec3f, vel: vec3f, rphys: f32, shutK: f32, rnd: vec2f) -> GlintV {
  var g: GlintV = glintCull();
  let rel: vec3f = pos - U.camPos.xyz; let zv: f32 = dot(rel, U.camFwd.xyz);
  if (zv < 0.12) { return g; }
  let cp: vec4f = U.viewProj * vec4f(pos, 1.0); let ndc: vec2f = cp.xy / cp.w;
  if (abs(ndc.x) > 1.3 || abs(ndc.y) > 1.3) { return g; }
  let pix: vec2f = clamp((vec2f(ndc.x, -ndc.y) * 0.5 + 0.5) * U.res.xy, vec2f(0.0), U.res.xy - 1.0);
  if (zv > linDepth(texFetchD(tDepth, vec2i(pix), 0)) + 0.03) { return g; }
  let pp: vec4f = U.prevViewProj * vec4f(pos - vel * U.misc.z, 1.0);
  var mv: vec2f = vec2f(0.0);
  if (pp.w > 0.05) { mv = (ndc - pp.xy / pp.w) * vec2f(0.5, -0.5) * U.res.xy * (U.dof.w * shutK / max(U.misc.z, 0.004)); }
  // (each flake its own streak: tumbling and caught by eddies, it is not where the wind alone would put it, so the streaks differ in length
  // and lean a little this way and that, never an even grid of the same dash)
  mv = vec2f(mv.x * cos(rnd.y) - mv.y * sin(rnd.y), mv.x * sin(rnd.y) + mv.y * cos(rnd.y)) * rnd.x;
  var ml: f32 = length(mv); var ax: vec2f = vec2f(1.0, 0.0);
  if (ml > 0.25) { ax = mv / ml; }
  let sc: f32 = U.res.y / 1170.0;
  let coc: f32 = min(U.dof.y * abs(1.0 / U.dof.x - 1.0 / zv), U.dof.z) * sc;
  let rp: f32 = rphys * U.res.y / (2.0 * U.camRight.w * zv);
  let rad: f32 = sqrt(coc * coc + rp * rp + sq(0.62 * sc) + sq(0.8 * sc * smoothstep(10.0, 28.0, zv)));      // (far flakes soft specks, seen through the falling snow)
  ml = min(ml, 0.16 * U.res.y);
  ml = mix(min(ml, 5.0 * rad), min(ml, 2.0 * rad), smoothstep(2.5 * sc, 7.0 * sc, rad));       // (short soft streaks: never pills or confetti)
  let hl: f32 = ml * 0.5;
  let ext: vec2f = vec2f(hl + rad + 1.0, rad + 1.0);
  let lp: vec2f = corner * ext;
  let opx: vec2f = ax * lp.x + vec2f(-ax.y, ax.x) * lp.y;
  g.clip = vec4f((ndc + opx * vec2f(2.0, -2.0) * U.res.zw) * cp.w, cp.z, cp.w);
  g.uv = lp; g.shp = vec4f(hl, rad, rp, zv);
  return g;
}
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  let W: f32 = M.p.x; let id: u32 = a.iid + u32(M.p.w);
  let h: vec3f = hashu3(id * 3u + 77u); let h2: vec3f = hashu3(id * 3u + 4099u);
  let tm: f32 = U.camPos.w;
  let wm: f32 = 0.82 + 0.22 * h2.x; let fall: f32 = M.p.z * (0.7 + 0.6 * h2.y);
  let sw: f32 = 0.9 + 0.8 * h2.z; let sa: f32 = 0.10 + 0.14 * h2.y;
  let a1: f32 = tm * sw + h.x * 40.0; let a2: f32 = tm * sw * 0.83 + h.z * 40.0;
  let fl: vec3f = vec3f(sin(a1), 0.0, cos(a2)) * sa;
  let vel: vec3f = U.wind.xyz * wm + vec3f(cos(a1) * sw * sa, -fall, -sin(a2) * sw * 0.83 * sa);
  let q: vec3f = h * W + M.o.xyz * wm + vec3f(0.0, -fall * tm, 0.0) + fl;
  let ctr: vec3f = U.camPos.xyz + U.camFwd.xyz * (0.36 * W);
  let rel: vec3f = (fract((q - ctr - U.origin.xyz) / W + 0.5) - 0.5) * W;
  let pos: vec3f = ctr + rel;
  let edge: f32 = max(abs(rel.x), max(abs(rel.y), abs(rel.z))) / W;
  // (as the snowfall comes on it thickens flake by flake, each fading in, none popping)
  let fade: f32 = smoothstep(0.5, 0.40, edge) * smoothstep(0.0, 0.04, M.q.x - f32(a.iid) / M.q.w);
  let vis: f32 = shadowFast(pos, 0.0015);
  let h3: vec3f = hashu3(id * 3u + 9001u);
  let rnd: vec2f = vec2f(0.4 + 0.8 * h3.x, (h3.y - 0.5) * 0.52 + 0.16 * sin(tm * (0.8 + h3.z) + h3.x * 40.0));
  let g: GlintV = flakeQuad(corner, pos, vel, M.p.y * (0.5 + 1.4 * h3.z * h3.z), M.q.y, rnd);
  v.clip = g.clip; v.uv = g.uv; v.shp = g.shp;
  // how much of what is drawn the flake really covers: its own area on screen against the soft disc (or streak) it is drawn as (the soft
  // profile below holds a third of a full disc's area, and 1.07 r per pixel of streak)
  let rp: f32 = g.shp.z; let r: f32 = max(g.shp.y, 0.7);
  let cov: f32 = min(0.65, rp * rp / (0.333 * r * r + 0.68 * r * g.shp.x)) * fade * M.q.z;      // (a tuft is lacy: never quite opaque)
  let V: vec3f = normalize(U.camPos.xyz - pos); let mu: f32 = dot(-V, U.sunDir.xyz);
  // (a touch brighter than the snow on the ground, so a snowfall reads against the slope; brighter still close to the lens, where a flake is a soft
  // light rather than a smudge on the glass)
  // (ice scatters grey: the sun's colour is taken 40% toward white, and its forward lobe is soft. A low sun no longer turns the flakes to orange
  // embers; a flake is lit from every side, so half the sun reaches it whichever way it faces, and the snow's own light from below)
  let sc: vec3f = mix(U.sunCol.rgb, vec3f(luma(U.sunCol.rgb)), 0.4);
  var lit: vec3f = U.ambSky.rgb * 1.9 + U.ambGnd.rgb * 1.5 + sc * (vis * (0.45 + 1.0 * hg(mu, 0.55)));
  // (the lamp: flakes in its cone sparkle, but those right at the lens take less of it, or the beam is a white wall in front of the eyes)
  if (U.lamp.w > 0.0) { lit += lampLight(pos) * (1.2 * mix(0.35, 1.0, smoothstep(0.6, 3.5, length(pos - U.lamp.xyz)))); }
  lit *= 1.0 + 0.6 * smoothstep(3.0, 0.5, g.shp.w);
  // by day a flake must never read darker than what lies behind it (dark specks on bright snow read as dirt): it covers less than it adds,
  // so in front of the snow or the overcast it all but vanishes, as real flakes do, and in front of trees it is a white speck
  v.col = vec4f(lit * (0.88 * cov), cov * mix(1.0, 0.55, M.o.w));
  return v;
}`;
// a soft disc that thins out from its middle to its rim (a tuft of crystals, or the lens's blur of one), or a streak of it with round ends
const FLAKE_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let d: f32 = length(vec2f(max(abs(v.uv.x) - v.shp.x, 0.0), v.uv.y));
  let x: f32 = d / (max(v.shp.y, 0.7) + 0.6);
  let a: f32 = saturate(1.0 - x * x);
  o.color = v.col * (a * a);
  return o;
}`;
// ---- the veil: how much falling snow lies between the eye and what the scene shows there, and the light it scatters toward the eye: the
// overcast's own (the snow is lit from everywhere above), the sun's where it is out (thrown forward: a snowfall glows round the sun), the city's
// glow after dark (it hangs in the snow toward the city), and a flash. M.a = (thickness per metre, the distance over which it levels off, its
// thickness against the sky, -); M.b = overcast light; M.c = the city's glow; M.d = (the flash's direction, its light); M.e = (how far the wind
// has carried the air, mod 1024 m; game time mod 1024 s)
function veilFS() {
  const ca = typeof Vista !== 'undefined' ? Vista.cityAz : 0.14;
  return `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let zf: f32 = linDepth(texFetchD(tDepth, vec2i(v.clip.xy), 0));
  let ndc: vec2f = vec2f(v.uv.x * 2.0 - 1.0, 1.0 - v.uv.y * 2.0);
  let dv: vec3f = screenRay(ndc);
  let len: f32 = length(dv); let d: vec3f = dv / len; let r: f32 = zf * len;
  let sky: f32 = smoothstep(9000.0, 13000.0, zf);
  // it builds with distance and levels off (a snowfall is so many kilometres across, and the cloud it falls from is near overhead: looking up
  // there is less of it in the way)
  var tau: f32 = M.a.x * M.a.y * (1.0 - exp(-r / M.a.y));
  // (thinner in the first fifteen metres: the near trees and the skier keep their darks, and the snow stands in layers in front of the far ones)
  tau -= 0.3 * M.a.x * min(r, 15.0);
  tau = mix(tau, M.a.z * (1.0 - 0.45 * smoothstep(0.0, 0.5, d.y) + 0.5 * smoothstep(0.22, 0.0, d.y)), sky);     // (the low sky lies behind the most snow)
  // it does not fall evenly: denser sheets drift across on the wind, settling with the snow (read where the line of sight crosses two shells
  // round the eye, 14 and 34 m out, so they pass with the right parallax as you go)
  let w: vec3f = U.origin.xyz - M.e.xyz + vec3f(0.0, M.e.w, 0.0);
  let s1: f32 = tnoise3((U.camPos.xyz + d * 14.0 + w) * 0.25);
  let s2: f32 = tnoise3((U.camPos.xyz + d * 34.0 + w) * 0.25 + vec3f(91.0, 17.0, 53.0));
  let s3: f32 = tnoise3((U.camPos.xyz + d * 75.0 + w) * 0.12 + vec3f(37.0, 71.0, 13.0));
  tau *= 1.0 + 0.8 * (s1 - 0.5) * smoothstep(12.0, 18.0, r) + 0.7 * (s2 - 0.5) * smoothstep(30.0, 40.0, r) + 0.6 * (s3 - 0.5) * smoothstep(65.0, 90.0, r) * (1.0 - sky);
  let T: f32 = exp(-tau);
  let mu: f32 = dot(d, U.sunDir.xyz);
  // (the sun's light thrown forward by the snow: a soft glow and a small bright core round the disc, held to a few times the overcast's own
  // light, so the sun in a break is a sun seen through snow and not a blown ball)
  var sf: vec3f = mix(U.sunCol.rgb, vec3f(luma(U.sunCol.rgb)), 0.3) * (0.05 + 0.11 * hg(mu, 0.6) + 0.04 * hg(mu, 0.93));
  sf *= min(1.0, 2.5 * luma(M.b.rgb) / max(luma(sf), 1e-6));
  var c: vec3f = M.b.rgb + sf;
  var az: f32 = atan2(d.x, -d.z) - ${(+ca).toFixed(5)}; az = atan2(sin(az), cos(az));
  c += M.c.rgb * ((0.08 + 1.6 * exp(-abs(az) / 0.35)) * smoothstep(0.3, -0.05, d.y));
  c += vec3f(0.78, 0.86, 1.0) * (M.d.w * (0.9 + 2.0 * exp(-sq(acos(clamp(dot(d, M.d.xyz), -1.0, 1.0))) / 0.15)));
  o.color = vec4f(c * (1.0 - T), T);
  return o;
}`;
}
