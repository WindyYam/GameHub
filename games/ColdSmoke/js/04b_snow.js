"use strict";
// ---------------------------------------------------------------- the snow, version b (Variants 'snowr', default b since the owner merged it 2026-11-14; a: the snow as it was)
// From the snow-rendering research the owner asked for (2026-11-13). The first b had six parts; side by side the owner could not tell most
// of them from a, so only the three that show were kept, each on its own switch:
//   snr2 闪光不闪烁  glints after Wang & Bowles 2016 ("Sparkly but not too sparkly"): each glint a soft dot never smaller than about a
//                  pixel and a half, dimmer the bigger it is, held to a ceiling, and fading into the mean sheen of the glints where the
//                  cells grow too small to show. Small, very bright one-pixel flashes were what flickered on phones drawn at a lower
//                  resolution, and what the bloom turned into a blown-out patch beside the sun
//   snr4 雪痕边埂  the edges of a carving ski squeeze up a berm of snow along each side of the track (more on the packed run)
//   snr6 压雪纹    the groomed run: its wind ripples planed off, the corduroy a groomer leaves (ribs 3.2 cm apart down the run) and the lanes
//                  of its passes. Not at 流畅
// The terrain shader (04_terrain.js) asks M.sf / M.sg which parts are on, and reads the run's lie from a table (M.ct0..15, along z) that
// this module fills every frame. Tracks (17_tracks.js) asks SnowLook.trackK for the berm.
const SnowLook = (() => {
  const S = { N: 16, DZ: 50, BACK: 100 };
  const VS = typeof Variants !== 'undefined' ? Variants : null;
  const PARTS = [['snr2', '└ 闪光不闪烁'], ['snr4', '└ 雪痕边埂'], ['snr6', '└ 压雪纹']];
  if (VS) { VS.def('snowr', '雪面渲染', [['a', '原来的'], ['b', '新的']], 'b'); for (const [n, l] of PARTS) VS.def(n, l, [['on', '开'], ['off', '关']], 'on'); }
  // the glints on the snow (snr2): a, as delivered (4-10 px flecks with a rainbow tint, out to 220 m: at speed the shutter drew them into
  // dashes); b, as photographs show them: pinpoints, close by only, nearly white, going over into a smooth sheen toward the sun further off
  if (VS) VS.def('glint', '└ 雪面闪点', [['a', '原来'], ['b', '收细']], 'b');
  S.b = () => !!VS && VS.val.snowr === 'b';
  S.on = n => S.b() && VS.val[n] !== 'off';
  // the uniforms the terrain takes: sf.x = fine glints (Variants 'glint' b), sf.y = soft glints; sg = (groomed run, tracks, -, quality level); sn = (z of the table's first row,
  // 1 / its spacing, table on, -); ct0..15 = (centre of the run - origin x, half width, powder, ridge)
  const U = S.U = { sf: [0, 0, 0, 0], sg: [0, 0, 0, 0], sn: [0, 0, 0, 0] };
  for (let i = 0; i < S.N; i++) U['ct' + i] = [0, 40, 0, 0];
  S.uniformNames = () => { const u = { sf: 'vec4f', sg: 'vec4f', sn: 'vec4f' }; for (let i = 0; i < S.N; i++) u['ct' + i] = 'vec4f'; return u; };
  const row = {};
  S.frame = function (origin, at) {
    U.sf[1] = S.on('snr2') ? 1 : 0; U.sf[0] = VS && VS.val.glint === 'a' ? 0 : 1; U.sg[0] = S.on('snr6') ? 1 : 0; U.sg[1] = S.on('snr4') ? 1 : 0; U.sg[3] = typeof Quality !== 'undefined' ? Quality.tier : 0; U.sg[2] = typeof Quality !== 'undefined' ? Quality.k('tsh') : 0;
    U.sn[2] = U.sg[0];
    if (!U.sg[0]) return U;
    // the table: from BACK m behind the camera on down the run (the run goes toward -z)
    const z0 = at[2] + S.BACK;
    U.sn[0] = z0 - origin[2]; U.sn[1] = -1 / S.DZ;
    for (let i = 0; i < S.N; i++) {
      const c = Course.at(Math.max(0, -(z0 - i * S.DZ)), row), u = U['ct' + i];
      if (!(c.cx === c.cx && c.hw === c.hw && c.powder === c.powder && c.ridge === c.ridge)) continue;      // (never a NaN into the shader)
      u[0] = c.cx - origin[0]; u[1] = c.hw; u[2] = c.powder; u[3] = c.ridge;
    }
    return U;
  };
  // tracks (snr4): how much of a berm a ski squeezes up along its sides (0..1): most on the packed run, less in powder (pressed down
  // more than pushed aside) and on the wind-packed ridge
  S.trackK = function (x, z) {
    if (!S.on('snr4')) return null;
    const c = Course.at(Math.max(0, -z), row), off = clamp((Math.abs(x - c.cx) - c.hw) / 6, 0, 1), pw = Math.max(c.powder, off);
    return { berm: (0.8 - 0.25 * pw) * (1 - 0.5 * c.ridge) };
  };
  return S;
})();

// the run's lie at a point (render space), from the table: (x - centre of the run, half width, powder, ridge). Vertex stage
const SNOW_VS_SSL = `
fn snowCourse(wp: vec3f) -> vec4f {
  let t: f32 = clamp((wp.z - M.sn.x) * M.sn.y, 0.0, ${(SnowLook.N - 1).toFixed(1)});
  var r: vec4f = vec4f(0.0);
${Array.from({ length: SnowLook.N }, (_, i) => `  r += M.ct${i} * max(1.0 - abs(t - ${i.toFixed(1)}), 0.0);`).join('\n')}
  return vec4f(wp.x - r.x, r.y, r.z, r.w);
}
`;
// fragment stage
const SNOW_SSL = `
// one glint per cell, as sparkLayer, but soft and never smaller than a pixel and a half: dimmer the wider it is, so the light each one
// gives is the same whatever the resolution (Wang & Bowles 2016). n: the sharpness of its lobe
fn sparkSoft(wxz: vec2f, cell: vec2f, N: vec3f, Hh: vec3f, ja: vec2f, jb: vec2f, idet: f32, n: f32) -> vec4f {
  let g: vec2f = wxz / cell; let id: vec2f = floor(g);
  let r: vec4f = texLod(tNoise, (id + 0.5) / 256.0, 0.0);
  let tilt: vec2f = (r.xz - 0.5) * (0.30 + 2.3 * r.y * r.y);
  let nn: vec3f = normalize(N + vec3f(tilt.x, 0.0, tilt.y));
  let d: f32 = max(dot(nn, Hh), 0.0);
  let w: vec2f = (g - id - 0.5 - (r.yw - 0.5) * 0.4) * cell;
  let px: vec2f = vec2f(w.x * jb.y - w.y * jb.x, w.y * ja.x - w.x * ja.y) * idet;
  // (its radius squared in pixels, about 1.0 to 1.4 px; with the fine glints, M.sf.x, about 0.8 to 1.05 px)
  let s2: f32 = mix(1.1 + 0.9 * r.w, 0.6 + 0.5 * r.w, M.sf.x);
  let shape: f32 = exp(-dot(px, px) / s2) * (1.4 / s2);
  let tint: vec3f = mix(vec3f(1.0), 0.55 + 0.75 * cos(6.2832 * (r.z + vec3f(0.0, 0.33, 0.67))), mix(0.45, 0.18, M.sf.x) * r.x);
  return vec4f(tint, 1.0) * (pow(d, n) * shape * (n / 380.0));
}
`;
