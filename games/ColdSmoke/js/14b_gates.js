"use strict";
// ---------------------------------------------------------------- gates: flags, dye and lanterns that announce a jump
// A marked jump was a white wedge on white snow. It is now marked the way a course is marked on a mountain: tall orange feather flags
// where Course.markers says (plus one more pair forty metres up the hill, so the approach is a lane to ski through), blue dye sprayed
// across the takeoff and the landing, and after dark a storm lantern burning at the foot of every flag.
// Flags and lanterns are small meshes drawn with the trees (same sun, same shadow map). Dye and lamplight are sheets laid on the snow:
// they are cut from the terrain's own finest grid (0.5 m cells, the same diagonal), so near the lens they lie exactly in the drawn
// surface, and they are blended over it (dye multiplies, light adds). Everything is worked out from Course on demand and kept only
// while it is near: a new mountain needs reset() and nothing else.
const GATE_K = { FH: 3.2, LS: 1.2, LFY: 0.186, LI: 0.90 };      // flag height; the lantern's scale and the height of its flame above its foot; its brightness (radiance of snow at 1 m)
const Gates = (() => {
  const G = { enabled: true, far: 520, band: 80, back: 260, pre: 40, vLand: 21, lanterns: 1, dye: 1, wind: [1.2, 0.4], markers: null, stats: { gates: 0, flags: 0, tris: 0 } };
  // the flag: its height, where the pole starts to bend over, the bend's two radii and its sweep, the foot of the sail; the cloth's grid
  // Two cuts of it. 'b' (the default): a feather flag as they stand on a slopestyle course, a 2.55 m pole and a teardrop sail 1.7 m long and
  // half a metre across at its widest, narrow at its foot and rounded over the bend of the pole. 'a': the first cut, a 3.2 m pole with a sail
  // nearly as wide at its foot as at its head (from a little way off it read as an orange board stood in the snow)
  // (per cut: height of the pole's top, where it starts to bend, the bend's sideways radius, its sweep, the foot of the sail, the free
  // corner at the foot (out, up), how far the free edge bellies out, and where the chevrons sit: first, step, half width, how steep)
  const CUTS = {
    a: { FH: 3.2, YA: 2.25, RX: 0.40, TH1: 2.15, Y0: 0.50, cx: 0.74, cy: 0.84, bel: 0.12, bp: 0.8, ch: [1.34, 0.37, 0.058, 0.60] },
    b: { FH: 2.55, YA: 1.90, RX: 0.27, TH1: 2.20, Y0: 0.80, cx: 0.22, cy: 1.06, bel: 0.25, bp: 0.70, ch: [1.30, 0.22, 0.034, 0.36] },
  };
  const NA = 16, NB = 56;
  if (typeof Variants !== 'undefined') Variants.def('flag', '跳台旗', [['a', '宽旗'], ['b', '羽毛旗']], 'b');
  const cutId = () => (typeof Variants !== 'undefined' && CUTS[Variants.val.flag]) ? Variants.val.flag : 'b';
  const LOX = 0.11, LOZ = 0.62, LSINK = 0.085, LFY = GATE_K.LFY;   // where the lantern stands from the foot of the pole (in front of the cloth, up the hill), how deep it is pressed into the snow, how high its flame is
  const MAXG = 12, DV = 2000, DI = 10800, PV = 1800, PIX = 6400, DS = 11, PS = 10;       // jumps kept at once; room per jump in the sheets' buffers; floats per vertex
  let gfx, flags = {}, propVB, propIB, propN = 0, driftN = 0, instF, instP, instS, cpuF, cpuP, cpuS, dyeVB, dyeIB, poolVB, poolIB;
  let pipeFlag, pipeFlagSh, pipeProp, pipeDrift, pipePool, pipeDye, pipeGlare;
  let gates = new Map(), slots = [], live = [], segsRef = null, seen = 0, nF = 0, nP = 0, nS = 0;
  // each lantern is lit at its own moment as the sun goes down (somebody walks the course with a taper, over the minute round sunset),
  // and its flame takes a few seconds to grow: 0 = out, 1 = burning. By sun height, so it is the same at dawn the other way round
  const lantOn = (sd, e) => 1 - smooth(-0.002, 0.002, e - 0.03 - (sd - 0.5) * 0.06);

  // ---- the flag: a whippy pole bent over at the top by the pull of the sleeve, and the sail hung in the bend
  function flagMesh(K) {
    const { FH, YA, RX, TH1, Y0 } = K, RY = FH - YA;
    const arc = [[0, 0, YA]];
    { let l = 0, px = 0, py = YA; for (let i = 1; i <= 48; i++) { const th = TH1 * i / 48, x = RX * (1 - Math.cos(th)), y = YA + RY * Math.sin(th); l += Math.hypot(x - px, y - py); arc.push([l, x, y]); px = x; py = y; } }
    const LA = arc[48][0], LT = YA + LA;
    // the pole's centre line by length from the snow: [x, y, tangent x, tangent y]
    const pole = l => {
      if (l <= YA) return [0, l, 0, 1];
      const q = Math.min(l - YA, LA - 1e-6); let i = 1; while (arc[i][0] < q) i++;
      const a = arc[i - 1], b = arc[i], f = (q - a[0]) / (b[0] - a[0]), dl = b[0] - a[0]; return [lerp(a[1], b[1], f), lerp(a[2], b[2], f), (b[1] - a[1]) / dl, (b[2] - a[2]) / dl];
    };
    const tip = pole(LT);
    // the free edge runs from the lower corner up to the tip of the pole, bellied a little; the cloth is ruled between it and the pole
    const trail = q => [lerp(K.cx, tip[0], q) + K.bel * Math.pow(Math.sin(PI * Math.pow(q, K.bp)), 0.9), lerp(K.cy, tip[1], q)];
    const sail = (a, b) => { const L = pole(lerp(Y0, LT, b)), T = trail(b); return [lerp(L[0], T[0], a), lerp(L[1], T[1], a)]; };
    const V = [], I = [], put = (...f) => { for (const x of f) V.push(x); };
    for (let j = 0; j <= NB; j++) for (let i = 0; i <= NA; i++) {
      const a = i / NA, b = j / NB, e = 1e-3, b0 = Math.min(b, 1 - e), p = sail(a, b), pa = sail(a + e, b), pb0 = sail(a, b0), pb1 = sail(a, b0 + e);
      put(p[0], p[1], 0, 0, 0, 1, a, b, 0, 0, (pa[0] - p[0]) / e, (pa[1] - p[1]) / e, (pb1[0] - pb0[0]) / e, (pb1[1] - pb0[1]) / e);
    }
    for (let j = 0; j < NB; j++) for (let i = 0; i < NA; i++) { const k = j * (NA + 1) + i; I.push(k, k + 1, k + NA + 1, k + 1, k + NA + 2, k + NA + 1); }
    // the pole: a tapering tube, carried a little way down into the snow (pos is its centre line; the shader adds normal x radius, so a
    // far pole can be kept a pixel wide); and the collar of the spike it stands in
    const tube = (rings, NR) => {
      const v0 = V.length / 14;
      for (const [x, y, tx, ty, r] of rings) for (let k = 0; k < NR; k++) { const ph = k / NR * TAU, c = Math.cos(ph), s = Math.sin(ph); put(x, y, 0, c * ty, -c * tx, s, 0, y / FH, 1, r, 0, 0, 0, 0); }
      for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < NR; k++) { const a = v0 + j * NR + k, b = v0 + j * NR + (k + 1) % NR; I.push(a, b, a + NR, b, b + NR, a + NR); }
    };
    { const rings = []; for (let j = 0; j <= 30; j++) { const l = -0.35 + (LT + 0.35) * j / 30, c = pole(Math.max(l, 0)); rings.push([c[0], l < 0 ? l : c[1], c[2], c[3], lerp(0.016, 0.0055, sat(l / LT))]); } tube(rings, 6); }
    tube([[0, -0.06, 0, 1, 0.027], [0, 0.07, 0, 1, 0.027], [0, 0.10, 0, 1, 0.017]], 6);
    return { V: new Float32Array(V), I: new Uint32Array(I) };
  }

  // ---- what stands in the snow at its foot: the drift round the pole, and a storm lantern pressed into the snow beside it
  function propMesh() {
    const V = [], I = [], put = (...f) => { for (const x of f) V.push(x); };
    // (per vertex: position, normal, then: part (0 drift, 2 iron, 3 glass); for the drift how far out to its rim, for the glass how high
    // up the globe; how open to the sky; 1 = it stands with the lantern)
    // the drift: snow trodden in round the pole and rounded off by the wind. It is drawn blended, thinning to nothing at its rim, so it
    // has no edge whatever the snow under it is doing
    { const NR = 16, US = [0.045, 0.11, 0.2, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9, 1.0], v0 = V.length / 10;
      const rim = ph => 0.42 * (1 + 0.20 * Math.sin(ph + 0.7) + 0.10 * Math.sin(2 * ph + 2.1));
      const hgt = (r, ph) => { const u = Math.min(r / rim(ph), 1), A = 0.080 * (1 + 0.22 * Math.sin(2 * ph + 1.1) + 0.14 * Math.sin(3 * ph + 0.4)); return A * (1 - u * u) * (1 - u * u) + 0.045 * Math.exp(-(r * r) / 0.0035); };
      for (const u of US) for (let k = 0; k < NR; k++) {
        const ph = k / NR * TAU, c = Math.cos(ph), s = Math.sin(ph), r = u * rim(ph), e = 0.006, y = hgt(r, ph), dr = (hgt(r + e, ph) - hgt(r - e, ph)) / (2 * e), dp = (hgt(r, ph + e) - hgt(r, ph - e)) / (2 * e) / r;
        const sx = dr * c - dp * s, sz = dr * s + dp * c, l = Math.hypot(sx, 1, sz);
        put(r * c, y, r * s, -sx / l, 1 / l, -sz / l, 0, u, 0.80 + 0.20 * smooth(0.03, 0.22, r), 0);
      }
      for (let j = 0; j < US.length - 1; j++) for (let k = 0; k < NR; k++) { const a = v0 + j * NR + k, b = v0 + j * NR + (k + 1) % NR; I.push(a, b, a + NR, b, b + NR, a + NR); } }
    const nDrift = I.length;
    const lathe = (prof, NR, part) => {
      const v0 = V.length / 10, n = prof.length;
      for (let j = 0; j < n; j++) {
        const a = prof[Math.max(j - 1, 0)], b = prof[Math.min(j + 1, n - 1)], dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1, nr = dy / l, ny = -dr / l;
        for (let k = 0; k < NR; k++) { const ph = k / NR * TAU, c = Math.cos(ph), s = Math.sin(ph); put(prof[j][0] * c, prof[j][1], prof[j][0] * s, nr * c, ny, nr * s, part, prof[j][2] || 0, 1, 1); }
      }
      for (let j = 0; j < n - 1; j++) for (let k = 0; k < NR; k++) { const a = v0 + j * NR + k, b = v0 + j * NR + (k + 1) % NR; I.push(a, b, a + NR, b, b + NR, a + NR); }
    };
    // the lantern, from the snow up: the tank, the burner, the globe, the chimney under its hood
    lathe([[0.078, -0.060], [0.078, 0.076], [0.071, 0.089], [0.042, 0.098], [0.031, 0.100]], 12, 2);           // (the tank goes on down under the snow: on steep ground its underside must not show)
    lathe([[0.031, 0.100], [0.033, 0.104], [0.033, 0.116], [0.027, 0.120]], 10, 2);
    lathe([[0.029, 0.118, 0], [0.039, 0.131, 0.15], [0.045, 0.151, 0.40], [0.045, 0.172, 0.62], [0.039, 0.192, 0.85], [0.034, 0.205, 1]], 12, 3);
    lathe([[0.036, 0.203], [0.041, 0.208], [0.041, 0.226], [0.051, 0.231], [0.045, 0.243], [0.025, 0.256], [0.010, 0.262], [0, 0.263]], 10, 2);
    // its frame: the two air tubes that run from the tank up either side of the globe and in under the hood, and the bail over the top
    const wire = (pts, r, NR) => {
      const v0 = V.length / 10;
      for (let j = 0; j < pts.length; j++) {
        const a = pts[Math.max(j - 1, 0)], b = pts[Math.min(j + 1, pts.length - 1)], t = v3.norm(v3.sub(b, a)), u = v3.norm(v3.cross(t, [0, 0, 1])), w = v3.cross(u, t);
        for (let k = 0; k < NR; k++) { const ph = k / NR * TAU, c = Math.cos(ph), s = Math.sin(ph), n = [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s]; put(pts[j][0] + n[0] * r, pts[j][1] + n[1] * r, pts[j][2] + n[2] * r, n[0], n[1], n[2], 2, 0, 1, 1); }
      }
      for (let j = 0; j < pts.length - 1; j++) for (let k = 0; k < NR; k++) { const a = v0 + j * NR + k, b = v0 + j * NR + (k + 1) % NR; I.push(a, b, a + NR, b, b + NR, a + NR); }
    };
    for (const sx of [-1, 1]) wire([[sx * 0.072, 0.082, 0], [sx * 0.084, 0.108, 0], [sx * 0.088, 0.150, 0], [sx * 0.087, 0.192, 0], [sx * 0.078, 0.219, 0], [sx * 0.060, 0.234, 0], [sx * 0.044, 0.238, 0]], 0.0062, 5);
    { const pts = []; for (let i = 0; i <= 12; i++) { const a = PI * i / 12; pts.push([-0.089 * Math.cos(a), 0.196 + 0.112 * Math.sin(a), -0.034 * Math.sin(a)]); } wire(pts, 0.0035, 4); }
    // the guard round the globe: four bars and three hoops of wire, so the glass sits in a cage and never shows as a bare ball
    for (let b = 0; b < 4; b++) { const a = (b + 0.5) * PI / 2, c = Math.cos(a), sn = Math.sin(a); wire([[c * 0.040, 0.112, sn * 0.040], [c * 0.053, 0.135, sn * 0.053], [c * 0.055, 0.162, sn * 0.055], [c * 0.052, 0.190, sn * 0.052], [c * 0.042, 0.208, sn * 0.042]], 0.0042, 4); }
    for (const [y, r] of [[0.128, 0.051], [0.162, 0.056], [0.194, 0.050]]) { const pts = []; for (let i = 0; i <= 16; i++) { const a = TAU * i / 16 + 0.1; pts.push([Math.cos(a) * r, y, Math.sin(a) * r]); } wire(pts, 0.0034, 4); }
    return { V: new Float32Array(V), I: new Uint32Array(I), nDrift };
  }

  G.init = function (g) {
    gfx = g;
    const pm = propMesh();
    for (const id in CUTS) { const fm = flagMesh(CUTS[id]); flags[id] = { vb: gfx.buffer(fm.V, 'vertex'), ib: gfx.buffer(fm.I, 'index'), n: fm.I.length, ch: CUTS[id].ch }; }
    const flagN = flags.b.n;
    propVB = gfx.buffer(pm.V, 'vertex'); propIB = gfx.buffer(pm.I, 'index'); propN = pm.I.length; driftN = pm.nDrift;
    G.stats.tris = (flagN + propN) / 3;
    const MF = MAXG * 6;
    cpuF = new Float32Array(MF * 16); instF = gfx.buffer(cpuF, 'vertex', true);
    cpuP = new Float32Array(MF * 12); instP = gfx.buffer(cpuP, 'vertex', true);
    cpuS = new Float32Array(MF * 8); instS = gfx.buffer(cpuS, 'vertex', true);
    dyeVB = gfx.buffer(new Float32Array(MAXG * DV * DS), 'vertex', true); dyeIB = gfx.buffer(new Uint32Array(MAXG * DI), 'index', true);
    poolVB = gfx.buffer(new Float32Array(MAXG * PV * PS), 'vertex', true); poolIB = gfx.buffer(new Uint32Array(MAXG * PIX), 'index', true);
    const fmesh = { attrs: [['pos', 'vec3f'], ['nrm', 'vec3f'], ['uv', 'vec4f'], ['tg', 'vec4f']] }, finst = { instanced: true, attrs: [['i0', 'vec4f'], ['i1', 'vec4f'], ['i2', 'vec4f'], ['i3', 'vec4f']] };
    pipeFlag = gfx.pipeline({
      name: 'gateFlag', lib: [SL.common, SL.hash, SL.fog, SL.shadow, SL.tonemap, GATE_SSL, FLAG_SSL], buffers: [fmesh, finst], cull: 'none',
      varyings: { wp: 'vec3f', nrm: 'vec3f', uv: 'vec4f', mp: 'vec4f', ex: 'vec4f', lp: 'vec3f' }, uniforms: { p: 'vec4f' }, textures: { tDetail: '2d', tShadow: 'shadow', tSky: '2d' },
      vs: `fn vert(a: VIn) -> VOut { var v: VOut;
        let px: f32 = length(U.camPos.xyz - a.i0.xyz) * 2.0 * U.camRight.w * U.res.w;
        let f: FlagV = flagVertex(a.pos, a.nrm, a.uv, a.tg, a.i0, a.i1, a.i2, 0.6 * px, px);
        v.wp = f.wp; v.nrm = f.n; v.uv = a.uv; v.mp = vec4f(a.pos, a.i2.x); v.ex = vec4f(a.i2.z * flameK(a.i2.x), a.i2.w, 0.0, 0.0); v.lp = a.i0.xyz + a.i3.xyz;
        v.clip = U.viewProj * vec4f(f.wp, 1.0); return v; }`,
      fs: FLAG_FS,
    });
    pipeFlagSh = gfx.pipeline({
      name: 'gateFlagShadow', lib: [SL.common, FLAG_SSL], buffers: [fmesh, finst], varyings: {}, uniforms: { p: 'vec4f' }, textures: {}, colorFormat: null, cull: 'none', depthBias: 2, depthBiasSlope: 2.5,
      vs: `fn vert(a: VIn) -> VOut { var v: VOut; let f: FlagV = flagVertex(a.pos, a.nrm, a.uv, a.tg, a.i0, a.i1, a.i2, 0.03, 0.0); v.clip = U.shadowVP * vec4f(f.wp, 1.0); return v; }`, fs: null,
    });
    // (one pair of shaders, two pipelines: the lantern is solid; the drift is laid over the finished snow and thins out at its rim)
    const prop = (name, o) => gfx.pipeline(Object.assign({
      name, lib: [SL.common, SL.hash, SL.fog, SL.shadow, SL.tonemap, GATE_SSL], cull: 'none',
      buffers: [{ attrs: [['pos', 'vec3f'], ['nrm', 'vec3f'], ['pm', 'vec4f']] }, { instanced: true, attrs: [['j0', 'vec4f'], ['j1', 'vec4f'], ['j2', 'vec4f']] }],
      varyings: { wp: 'vec3f', nrm: 'vec3f', pm: 'vec4f', ex: 'vec4f', lp: 'vec3f' }, uniforms: { p: 'vec4f' }, textures: { tDetail: '2d', tShadow: 'shadow', tSky: '2d' },
      vs: PROP_VS, fs: PROP_FS,
    }, o));
    pipeProp = prop('gateProp', {}); pipeDrift = prop('gateDrift', { blend: 'premul', depthWrite: false, depthFunc: 'lequal' });
    const sheetVS = (extra) => `fn vert(a: VIn) -> VOut { var v: VOut;
        var wp: vec3f = a.pos + M.off.xyz;
        // (beyond the terrain's finest ring the drawn snow is a coarser copy of itself: the sheet rides a little higher the farther off it is)
        let d: f32 = length(U.camPos.xyz - wp);
        wp.y = wp.y + 0.004 + 0.00002 * d * d;
        // (round the skier the drawn snow is raised by the depth the skis ride at, terrain's snowLift: the sheet goes up with it, or a disc of
        // it round the skier would lie under the snow, as the kicker's blue dye did)
        wp.y = wp.y + M.p.z * smoothstep(mix(2.15, 7.5, M.p.w), mix(1.0, 3.0, M.p.w), length(wp.xz - U.player.xz));
        v.wp = wp; ${extra}
        v.clip = U.viewProj * vec4f(wp, 1.0);
        v.clip.z = v.clip.z - U.camFwd.w * (0.012 / max(v.clip.w, 0.05) + 0.0002 * v.clip.w);
        return v; }`;
    pipePool = gfx.pipeline({
      name: 'gatePool', lib: [SL.common, SL.hash, SL.fog, GATE_SSL], buffers: [{ attrs: [['pos', 'vec3f'], ['nrm', 'vec3f'], ['lp', 'vec4f']] }], cull: 'none', blend: 'add', depthWrite: false, depthFunc: 'lequal',
      varyings: { wp: 'vec3f', nrm: 'vec3f', lp: 'vec4f' }, uniforms: { off: 'vec4f', p: 'vec4f' }, textures: { tSnow: '2d', tSnowF: '2d', tNoise: '2d', tSky: '2d' },
      vs: sheetVS('v.nrm = a.nrm; v.lp = vec4f(a.lp.xyz + M.off.xyz, a.lp.w);'), fs: POOL_FS,
    });
    pipeDye = gfx.pipeline({
      name: 'gateDye', lib: [SL.common, SL.hash, SL.fog, GATE_SSL], buffers: [{ attrs: [['pos', 'vec3f'], ['st', 'vec4f'], ['sd', 'vec4f']] }], cull: 'none', blend: 'mul', depthWrite: false, depthFunc: 'lequal',
      varyings: { wp: 'vec3f', st: 'vec4f', sd: 'vec4f' }, uniforms: { off: 'vec4f', p: 'vec4f', l0: 'vec4f', l1: 'vec4f', l2: 'vec4f', l3: 'vec4f' }, textures: { tDetail: '2d', tSky: '2d' },
      vs: sheetVS('v.st = a.st; v.sd = a.sd;'), fs: DYE_FS,
    });
    pipeGlare = gfx.pipeline({
      name: 'gateGlare', lib: [SL.common, SL.hash, SL.fog, GATE_SSL], buffers: [{ instanced: true, attrs: [['g0', 'vec4f'], ['g1', 'vec4f']] }], topology: 'strip', cull: 'none', blend: 'add', depthWrite: false, depthFunc: 'lequal',
      varyings: { uv: 'vec2f', ex: 'vec4f', wp: 'vec3f' }, uniforms: { p: 'vec4f' }, textures: { tSky: '2d' },
      vs: GLARE_VS, fs: GLARE_FS,
    });
    G.pipes = [pipeFlag, pipeFlagSh, pipeProp, pipeDrift, pipePool, pipeDye, pipeGlare];
    // (a new mountain is noticed in update() anyway, by the course's own list having been replaced; where the game announces one, listen too)
    if (typeof App !== 'undefined' && App.onMountain) App.onMountain.push(() => G.reset());
  };
  // a new mountain (or the same one planned afresh): nothing is carried over
  G.reset = function () { gates.clear(); slots = []; live.length = 0; segsRef = typeof Course !== 'undefined' ? Course.segs : null; nF = nP = nS = 0; };

  // a sheet lying in the drawn snow: the cells of the terrain's finest grid inside a rectangle of the map (kept where `keep` says so),
  // split along the same diagonal as the terrain splits them. `vert` appends one vertex's attributes; positions are relative to `an`
  function sheet(x0, x1, z0, z1, an, V, I, stride, maxV, vert, keep) {
    const c = 0.5, gx0 = Math.floor(x0 / c), gz0 = Math.floor(z0 / c), w = Math.ceil(x1 / c) - gx0 + 1, h = Math.ceil(z1 / c) - gz0 + 1, v0 = V.length / stride;
    if (w < 2 || h < 2 || v0 + w * h > maxV) return;
    const H = new Float64Array((w + 2) * (h + 2)), at = (i, j) => H[(j + 1) * (w + 2) + i + 1];
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) H[(j + 1) * (w + 2) + i + 1] = Course.height((gx0 + i) * c, (gz0 + j) * c, c);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const sx = (at(i + 1, j) - at(i - 1, j)) / (2 * c), sz = (at(i, j + 1) - at(i, j - 1)) / (2 * c), l = Math.hypot(sx, 1, sz);
      vert((gx0 + i) * c, at(i, j), (gz0 + j) * c, -sx / l, 1 / l, -sz / l);
    }
    for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
      if (keep && !keep((gx0 + i + 0.5) * c, (gz0 + j + 0.5) * c)) continue;
      const a = v0 + j * w + i; I.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  }

  // ---- a jump, worked out from its four markers (lip left, lip right, run-in left, run-in right) and the shape of the snow itself.
  // Its flags are placed at once. The sheets that lie on the snow take some thousands of heights to be asked of the course: they are
  // left as a list of small jobs, done one a frame while the jump is still far down the hill
  function plan(M) {
    const pc = {}, tn = {}, xl = (M[0][0] + M[1][0]) / 2, sl = -M[0][1], mo = (M[1][0] - M[0][0]) / 2, ss = -M[2][1];
    const du = xl - Course.at(sl, pc).cx, cx = s => Course.at(s, pc).cx + du, hgt = (x, s) => Course.height(x, -s, 0.5);
    // the wedge as it stands above the snow either side of it; the lip is where its profile breaks off (found coarsely, then closely)
    const wedge = s => { const x = cx(s); return hgt(x, s) - 0.5 * (hgt(x - mo, s) + hgt(x + mo, s)); }, brk = s => wedge(s + 0.5) + wedge(s - 0.5) - 2 * wedge(s);
    let sc = sl, best = 1e9; for (let s = ss + 2; s <= sl + 6; s += 0.5) { const c = brk(s); if (c < best) { best = c; sc = s; } }
    for (let s = sc - 0.375, e = sc + 0.4; s < e; s += 0.125) { const c = brk(s); if (c < best) { best = c; sc = s; } }
    // how far out its walls reach (where the top has fallen to a sixth), just short of the lip. (The line goes there: the last stride and
    // a half of the takeoff is its steepest, the part of it that faces a skier coming down the hill. It is a broad band, not a thin line:
    // seen along the snow from a lens going at speed, a thin one is blurred away)
    const sq = sc - 0.87, xq = cx(sq), top = wedge(sq); let uf = mo - 1.2;
    for (let u = 1; u < mo; u += 0.1) if (0.5 * (hgt(xq + u, sq) + hgt(xq - u, sq)) - 0.5 * (hgt(xq - mo, sq) + hgt(xq + mo, sq)) < 0.16 * top) { uf = u; break; }
    // where a skier who leaves the lip at an ordinary pace comes down: thrown along the takeoff's own slope, falling until the snow is met
    const slope = (hgt(cx(sc - 0.25), sc - 0.25) - hgt(cx(sc - 1.5), sc - 1.5)) / 1.25, vs = G.vLand / Math.hypot(1, slope), y0 = hgt(cx(sc), sc);
    let ld = 22; for (let t = 0.15; t < 3.5; t += 1 / 120) { const s = sc + vs * t; if (y0 + slope * vs * t - 4.905 * t * t <= hgt(cx(s), s)) { ld = vs * t; break; } }
    ld = clamp(ld, 9, 46);
    const g = { key: '', slot: -1, seen: 0, s: sc, x: cx(sc), mo, flags: [], an: [Math.round(cx(sc)), Math.round(hgt(cx(sc), sc)), Math.round(-sc)], dyeN: 0, poolN: 0, land: ld, work: [], fade: 0, lit: 0 };
    // the flags: on the course's own four marks, and one more pair up the hill. Each of that pair is kept on the run (brought in to its
    // edge if the mark would fall in the forest), and where a tree already stands it is moved along the hill a little, or failing that
    // a step or two in toward the line
    const flag = (x, z, row) => {
      const y = Course.height(x, z, 0.5), n = Course.normal(x, z, 0.3), sd = hash2(Math.round(x * 16), Math.round(z * 16)), lx = x + LOX, lz = z + LOZ;
      g.flags.push({ x, y, z, row, sd, gx: -n[0] / n[1], gz: -n[2] / n[1], b: [0, 0], bv: [0, 0], wash: 0, wy: 0, lx, ly: Course.height(lx, lz, 0.5) - LSINK, lz });
    };
    flag(M[0][0], M[0][1], 2); flag(M[1][0], M[1][1], 2); flag(M[2][0], M[2][1], 1); flag(M[3][0], M[3][1], 1);
    for (const sx of [-1, 1]) pre: for (const li of [0, -2, -4, 2]) for (const ds of [0, 3.5, -3.5, 7, -7, 10.5, -10.5, 14]) {
      const sp = ss - 1 - G.pre + ds - (sx > 0 ? 0.5 : 0), c = Course.at(sp, pc), x = clamp(c.cx + du + sx * (mo + li), c.cx - c.hw + 1.5, c.cx + c.hw - 1.5);
      Course.nearTree(x, -sp, tn); if (tn.ok && !tn.soft && tn.d < Math.max(3.2, (tn.r || 0) + 1.3)) continue;
      flag(x, -sp, 0); break pre;
    }
    // ---- the dye: a band across the takeoff just short of the lip (over the top and down both walls), one along each edge of the takeoff,
    // and one across the snow where the skier comes down
    const an = g.an, DVt = [], DIt = [], PVt = [], PIt = [], R = 3.4;
    const stroke = (x0, x1, z0, z1, st, keep) => sheet(x0, x1, z0, z1, an, DVt, DIt, DS, DV, (x, y, z) => { const q = st(x, -z); DVt.push(x - an[0], y - an[1], z - an[2], q[0], q[1], q[2], q[3], q[4], q[5], q[6], 0); }, keep);
    const sdG = hash2(Math.round(xl * 8), Math.round(sl * 8)), L1 = 2 * (uf + 0.5), sLand = sc + ld, xL = cx(sLand), L2 = 2 * (mo - 1.6);
    g.work.push(() => stroke(xq - L1 / 2 - 0.6, xq + L1 / 2 + 0.6, -sq - 1.25, -sq + 1.6, (x, s) => [x - xq, s - sq, L1, 1.5, sdG, 0, 1]));
    // (and the face under it washed with a lighter, wider pass: from up the hill the lip band alone is one line two pixels high, the face
    // seen nearly edge-on; washed, the face is a pale cyan block under a deep blue lip, and the takeoff reads from eighty metres)
    g.work.push(() => stroke(xq - L1 / 2 - 0.6, xq + L1 / 2 + 0.6, -sc + 1.2, -sc + 8.2, (x, s) => [x - xq, s - (sc - 4.6), L1 * 0.94, 5.4, sdG + 0.63, 0, 0.52]));
    g.work.push(() => stroke(xL - L2 / 2 - 0.6, xL + L2 / 2 + 0.6, -sLand - 1.4, -sLand + 1.4, (x, s) => [x - xL, s - sLand, L2, 0.95, sdG + 0.37, 0, 0.92]));
    g.work.push(() => { for (const sx of [-1, 1]) {
      // (along the top edge of each wall: these run with the line of sight, so they are what shows the takeoff from far up the hill)
      const ue = sx * (uf - 1.55), s0 = Math.max(ss + 3, sc - 9.5), s1 = sc - 1.05, sm = (s0 + s1) / 2, xa = Math.min(cx(s0), cx(s1)) + ue, xb = Math.max(cx(s0), cx(s1)) + ue;
      stroke(xa - 1.0, xb + 1.0, -s1 - 0.3, -s0 + 0.3, (x, s) => [s - sm, (x - cx(s) - ue) * sx, s1 - s0, 0.32, sdG + 0.11 + 0.2 * sx, 1, 0.9]);
    } });
    // ---- the snow each lantern lights: a disc of the same grid round it
    for (let i = 0; i < g.flags.length; i += 2) g.work.push(() => { for (const f of g.flags.slice(i, i + 2)) sheet(f.lx - R, f.lx + R, f.lz - R, f.lz + R, an, PVt, PIt, PS, PV, (x, y, z, nx, ny, nz) => PVt.push(x - an[0], y - an[1], z - an[2], nx, ny, nz, f.lx - an[0], f.ly + LFY - an[1], f.lz - an[2], f.sd), (x, z) => Math.hypot(x - f.lx, z - f.lz) < R); });
    // ---- and into this jump's own stretch of the shared buffers they go (indices count from the start of the buffer)
    g.work.push(() => {
      const o = g.slot, dI = new Uint32Array(DIt.length > DI ? DIt.slice(0, DI) : DIt), pI = new Uint32Array(PIt.length > PIX ? PIt.slice(0, PIX) : PIt);
      for (let i = 0; i < dI.length; i++) dI[i] += o * DV; for (let i = 0; i < pI.length; i++) pI[i] += o * PV;
      if (dI.length) { gfx.updateBuffer(dyeVB, o * DV * DS * 4, new Float32Array(DVt)); gfx.updateBuffer(dyeIB, o * DI * 4, dI); }
      if (pI.length) { gfx.updateBuffer(poolVB, o * PV * PS * 4, new Float32Array(PVt)); gfx.updateBuffer(poolIB, o * PIX * 4, pI); }
      g.dyeN = dI.length; g.poolN = pI.length;
    });
    return g;
  }
  function touch(M) {
    const key = M[0][0].toFixed(2) + ',' + M[0][1].toFixed(2); let g = gates.get(key);
    if (!g) {
      let slot = -1; for (let i = 0; i < MAXG; i++) if (!slots[i]) { slot = i; break; }
      if (slot < 0) return;
      g = plan(M); g.key = key; g.slot = slot; slots[slot] = g; gates.set(key, g);
    }
    g.seen = seen;
  }

  // every frame: which jumps are near (asked of the course each time: it is cheap, and it is what makes a new mountain just work), how
  // each flag stands in the wind and against the skier, and the instance data for the frame (render space = world - origin)
  G.update = function (cam, origin, player, dt, t) {
    nF = nP = nS = 0; live.length = 0;
    if (!G.enabled || !gfx) return;
    if (Course.segs !== segsRef) G.reset();
    const px = cam.pos[0], py = cam.pos[1], pz = cam.pos[2], cs = -pz, ox = origin[0], oy = origin[1], oz = origin[2], e = Sky.sunElev;
    seen++; let cur = [];
    // (asked far enough ahead that a jump is known while even its nearest flag, the pair up the hill, is still beyond `far`: every flag
    // then grows in over `band`, none arrives part grown)
    (G.markers || Course.markers)(cs - G.back, cs + G.far + G.pre + 40, (x, z) => { cur.push([x, z]); if (cur.length === 4) { touch(cur); cur = []; } });
    for (const [k, g] of gates) if (g.seen !== seen) { slots[g.slot] = null; gates.delete(k); }
    const W = typeof App !== 'undefined' && App.state.wind ? [App.state.wind[0], App.state.wind[2]] : G.wind;       // (the same wind the snow smoke rides)
    const wl = Math.hypot(W[0], W[1]) || 1, wx = W[0] / wl, wz = W[1] / wl, wyaw = Math.atan2(wz, wx);
    const v = typeof Game !== 'undefined' ? Game.s.v : [0, 0, 0], sp = Math.hypot(v[0], v[2]);
    let job = false;
    for (const g of gates.values()) {
      const gd = Math.hypot(g.x - px, -g.s - pz);
      // (its sheets: one small job a frame while it is too far off for them to show; all at once if the lens has arrived beside it)
      if (g.work.length) { if (gd < G.far * 0.8 + 30) { for (const w of g.work) w(); g.work.length = 0; } else if (!job) { g.work.shift()(); job = true; } }
      // (what is behind the lens goes the same way as what is far ahead: over a stretch, never at once)
      const bk = smooth(G.back - 10, G.back - 70, cs - g.s);
      g.fade = smooth(G.far * 0.8, G.far * 0.8 - 70, gd) * bk; g.lit = 0; live.push(g);
      for (const f of g.flags) {
        // (a gust is a front that crosses the hill with the wind: the flags it meets answer one after another, not all together)
        const gust = 0.5 + 0.5 * vnoise1(t * 0.31 - (f.x * wx + f.z * wz) * 0.06, 7);
        if (dt > 0 && player) {
          const dx = f.x - player[0], dz = f.z - player[2], d = Math.hypot(dx, dz), up = player[1] - f.y;
          if (d < 0.85 && up < 2.4 && up > -1.5 && sp > 1.5) {
            // a shoulder takes the pole: it goes over the way the skier is going (and a little outward), as far as the skier is deep in it
            const k = 1 - d / 0.85, ux = v[0] / sp * 0.9 + dx / (d || 1) * 0.45, uz = v[2] / sp * 0.9 + dz / (d || 1) * 0.45, ul = Math.hypot(ux, uz) || 1, a = Math.min(1.2, (0.3 + 1.2 * k) * smooth(1.5, 9, sp));
            const r = 1 - Math.exp(-dt * 42), nx = f.b[0] + (ux / ul * a - f.b[0]) * r, nz = f.b[1] + (uz / ul * a - f.b[1]) * r;
            f.b[0] = nx; f.b[1] = nz; f.bv[0] = f.bv[1] = 0;            // (held, not thrown: let go, it starts back from rest)
          } else {
            // let go, it whips back upright and shivers to rest
            const w = 10.5, z = 0.13;
            for (let i = 0; i < 2; i++) { f.bv[i] = clamp(f.bv[i] + (-w * w * f.b[i] - 2 * z * w * f.bv[i]) * dt, -14, 14); f.b[i] += f.bv[i] * dt; }
          }
          // the air a skier drags along: the cloth snaps as they go by
          if (d < 3.6 && up < 3 && sp > 4) { f.wash = Math.min(1.5, f.wash + (1 - d / 3.6) * sp * 0.30 * dt); let a = Math.atan2(v[2], v[0]) - wyaw; f.wy = a - TAU * Math.round(a / TAU); }
          f.wash *= Math.exp(-dt * 0.85);
        }
        const d = Math.hypot(f.x - px, f.y - py, f.z - pz), sc = smooth(G.far, G.far - G.band, d) * bk, k = lantOn(f.sd, e) * G.lanterns;
        // the sail lies down the wind and wanders either side of it; the pole leans with the gusts and trembles
        // (and the air a passing skier drags along takes the sail round with it for a moment: it streams the way they went)
        const yaw = wyaw + 0.30 * vnoise1(t * 0.23 + f.sd * 91, 8) + 0.09 * vnoise1(t * 1.3 + f.sd * 17, 9) + 0.5 * f.wash * vnoise1(t * 2.9 + f.sd * 29, 10) + f.wy * 0.85 * smooth(0.03, 0.8, f.wash);
        const lean = 0.030 + 0.050 * gust, tr = 0.007 * Math.sin(t * 6.3 + f.sd * 40);
        let o = nF++ * 16;
        cpuF[o] = f.x - ox; cpuF[o + 1] = f.y - oy; cpuF[o + 2] = f.z - oz; cpuF[o + 3] = sc;
        cpuF[o + 4] = Math.cos(yaw); cpuF[o + 5] = Math.sin(yaw); cpuF[o + 6] = f.b[0] + wx * lean - wz * tr; cpuF[o + 7] = f.b[1] + wz * lean + wx * tr;
        cpuF[o + 8] = f.sd; cpuF[o + 9] = Math.min(2.1, (0.72 + 0.56 * gust) * (1 + 0.8 * f.wash)); cpuF[o + 10] = k; cpuF[o + 11] = f.row;
        cpuF[o + 12] = f.lx - f.x; cpuF[o + 13] = f.ly + LFY - f.y; cpuF[o + 14] = f.lz - f.z; cpuF[o + 15] = 0;
        // the lantern and the drift are too small to be seen from far off: they shrink away, and the glare carries the light on its own
        const ps = smooth(170, 120, d);
        if (ps > 0) { o = nP++ * 12; cpuP[o] = f.x - ox; cpuP[o + 1] = f.y - oy; cpuP[o + 2] = f.z - oz; cpuP[o + 3] = ps; cpuP[o + 4] = f.gx; cpuP[o + 5] = f.gz; cpuP[o + 6] = k; cpuP[o + 7] = f.sd; cpuP[o + 8] = f.lx - f.x; cpuP[o + 9] = f.ly - f.y; cpuP[o + 10] = f.lz - f.z; cpuP[o + 11] = 0; }
        if (k > 0.002) { g.lit = 1; o = nS++ * 8; cpuS[o] = f.lx - ox; cpuS[o + 1] = f.ly + LFY - oy; cpuS[o + 2] = f.lz - oz; cpuS[o + 3] = k; cpuS[o + 4] = f.sd; cpuS[o + 5] = sc; cpuS[o + 6] = 0; cpuS[o + 7] = 0; }
      }
    }
    if (nF) gfx.updateBuffer(instF, 0, cpuF.subarray(0, nF * 16));
    if (nP) gfx.updateBuffer(instP, 0, cpuP.subarray(0, nP * 12));
    if (nS) gfx.updateBuffer(instS, 0, cpuS.subarray(0, nS * 8));
    G.stats.gates = live.length; G.stats.flags = nF;
  };
  // with the trees: flags and what stands at their feet
  G.draw = function (R) {
    const fc = flags[cutId()];
    if (nF) gfx.draw(pipeFlag, { u: { p: fc.ch }, tex: { tDetail: Tex.detail, tShadow: R.shadowTex, tSky: Sky.lut }, vb: [fc.vb, instF], ib: fc.ib, count: fc.n, instances: nF });
    if (nP) gfx.draw(pipeProp, { u: { p: [0, 0, 0, 0] }, tex: { tDetail: Tex.detail, tShadow: R.shadowTex, tSky: Sky.lut }, vb: [propVB, instP], ib: propIB, first: driftN, count: propN - driftN, instances: nP });
  };
  G.drawShadow = function () { const fc = flags[cutId()]; if (nF) gfx.draw(pipeFlagSh, { u: { p: fc.ch }, vb: [fc.vb, instF], ib: fc.ib, count: fc.n, instances: nF }); };
  // over the finished snow: lamplight first, then the dye (which takes its share of that light too), the drifts at the poles, and last
  // the glare of the flames
  G.drawOver = function (R) {
    if (!live.length) return;
    const o = R.origin, e = Sky.sunElev, lf = typeof Terrain !== 'undefined' && Terrain.lift ? Terrain.lift : [0, 0];
    for (const g of live) if (g.lit && g.poolN && g.fade > 0) gfx.draw(pipePool, { u: { off: [g.an[0] - o[0], g.an[1] - o[1], g.an[2] - o[2], g.fade], p: [e, G.lanterns, lf[0], lf[1]] }, tex: { tSnow: Tex.snow, tSnowF: Tex.snowFine, tNoise: Tex.noise, tSky: Sky.lut }, vb: [poolVB], ib: poolIB, count: g.poolN, first: g.slot * PIX });
    // (the dye is told how dark the night is and where the four lanterns nearest it burn: it is pigment, and shows its blue only where
    // there is light enough to see colour by)
    const nf = smooth(0.0, -0.09, e);
    const lant = (g, i) => { const f = g.flags[i]; return f ? [f.lx - o[0], f.ly + LFY - o[1], f.lz - o[2], lantOn(f.sd, e) * G.lanterns] : [0, -1e4, 0, 0]; };
    if (G.dye > 0) for (const g of live) if (g.dyeN && g.fade > 0) gfx.draw(pipeDye, { u: { off: [g.an[0] - o[0], g.an[1] - o[1], g.an[2] - o[2], g.fade * G.dye], p: [nf, 0, lf[0], lf[1]], l0: lant(g, 0), l1: lant(g, 1), l2: lant(g, 2), l3: lant(g, 3) }, tex: { tDetail: Tex.detail, tSky: Sky.lut }, vb: [dyeVB], ib: dyeIB, count: g.dyeN, first: g.slot * DI });
    if (nP) gfx.draw(pipeDrift, { u: { p: [0, 0, 0, 0] }, tex: { tDetail: Tex.detail, tShadow: R.shadowTex, tSky: Sky.lut }, vb: [propVB, instP], ib: propIB, first: 0, count: driftN, instances: nP });
    if (nS) gfx.draw(pipeGlare, { u: { p: [0, 0, 0, 0] }, tex: { tSky: Sky.lut }, vb: [instS], count: 4, instances: nS });
  };
  G.lantOn = lantOn; G.live = live;
  return G;
})();

// what the three kinds of thing here share: the lantern's light, and snow lit the way the terrain lights its own
const LANT_I = GATE_K.LI.toFixed(2);
const GATE_SSL = `
fn lantCol() -> vec3f { return vec3f(1.0, 0.59, 0.22); }
// a flame is never quite steady
fn flameK(sd: f32) -> f32 { let t: f32 = U.camPos.w; return 1.0 + 0.08 * sin(t * 9.1 + sd * 50.0) * sin(t * 5.3 + sd * 31.0) + 0.035 * sin(t * 23.0 + sd * 17.0); }
fn lantOn(sd: f32, e: f32) -> f32 { return 1.0 - smoothstep(-0.002, 0.002, e - 0.03 - (sd - 0.5) * 0.06); }
fn gateSnow(N: vec3f, V: vec3f, sh: f32, ao: f32) -> vec3f {
  let L: vec3f = U.sunDir.xyz; let ndl: f32 = dot(N, L);
  let sdir: vec2f = normalize(L.xz + vec2f(1e-4, 0.0)); let tanE: f32 = L.y / max(length(L.xz), 1e-3);
  let back: f32 = saturate(dot(normalize(-V.xz + vec2f(1e-5, 0.0)), sdir));
  let mic: f32 = 1.0 - 0.75 * back * back * saturate(1.0 - tanE * 1.2);
  let amb: vec3f = U.ambSky.rgb * (1.3 + 0.8 * N.y) + U.ambGnd.rgb * (0.50 - 0.45 * N.y) + twiLight(N);
  return vec3f(0.93, 0.955, 0.985) * (U.sunCol.rgb * (saturate((ndl + 0.12) / 1.12) * sh * mic) + amb * ao);
}
`;

const FLAG_SSL = `
struct FlagV { wp: vec3f, n: vec3f, }
// the wind in the cloth: trains of ripples that run out to the free edge and up the sail, none in step with another, on top of the slow
// swing of the whole sail. a = how far out from the pole (0..1): the sleeve cannot move, the free edge moves most
fn flagWave(a: f32, x: f32, y: f32, t: f32, ph: f32, gain: f32) -> f32 {
  let g: f32 = gain * (0.72 + 0.28 * sin(t * 0.83 + ph) * sin(t * 0.37 + ph * 1.7));
  let e: f32 = a * (0.55 + 0.45 * a);
  let th: f32 = x * 9.5 + y * 2.6 - t * 14.0 + ph;
  // (and the wind fills the sail: it bellies out from the pole to the free edge, deepest across its middle, more as the wind blows)
  return g * (e * (0.078 * sin(th - 0.45 * cos(th)) + 0.030 * sin(x * 15.0 - y * 4.3 - t * 23.0 + ph * 2.3))
            + a * (0.085 * a * sin(x * 4.2 + y * 1.3 - t * 6.4 + ph * 0.7) + 0.075 * sin(y * 1.9 - t * 2.6 + ph * 1.3))
            + 0.11 * sin(3.1416 * a) * (0.8 + 0.2 * sin(t * 1.1 + ph)));
}
fn turnAbout(p: vec3f, k: vec3f, ang: f32) -> vec3f { let c: f32 = cos(ang); return p * c + cross(k, p) * sin(ang) + k * (dot(k, p) * (1.0 - c)); }
// rmin: the least radius the pole is drawn with; px: metres to a pixel where the flag stands (0 = do not care)
fn flagVertex(pos: vec3f, nrm: vec3f, uv: vec4f, tg: vec4f, i0: vec4f, i1: vec4f, i2: vec4f, rmin: f32, px: f32) -> FlagV {
  var o: FlagV; var p: vec3f = pos; var n: vec3f = nrm;
  if (uv.z < 0.5) {
    let t: f32 = U.camPos.w; let ph: f32 = i2.x * 41.0; let e: f32 = 0.03;
    let gn: f32 = i2.y * (1.22 - 0.50 * uv.y);                         // (the foot of the sail is held least: the lower free corner moves most)
    let w0: f32 = flagWave(uv.x, pos.x, pos.y, t, ph, gn);
    let wa: f32 = flagWave(uv.x + e, pos.x + e * tg.x, pos.y + e * tg.y, t, ph, gn);
    let wb: f32 = flagWave(uv.x, pos.x + e * tg.z, pos.y + e * tg.w, t, ph, gn);
    // (cloth does not stretch: what it gains sideways it loses in reach. And a flag too far off to be two pixels wide is drawn that wide:
    // a banner a kilometre down the valley is a fleck of colour, not nothing)
    p = vec3f((pos.x - uv.x * (0.9 * w0 * w0 + 0.025 * i2.y)) * max(1.0, 2.6 * px), pos.y, w0);
    n = normalize(cross(vec3f(tg.x, tg.y, (wa - w0) / e), vec3f(tg.z, tg.w, (wb - w0) / e)));
  } else {
    p = pos + nrm * max(uv.w, rmin);
  }
  // the sail swivels on its pole and lies down the wind
  var q: vec3f = vec3f(p.x * i1.x - p.z * i1.y, p.y, p.x * i1.y + p.z * i1.x);
  var m: vec3f = vec3f(n.x * i1.x - n.z * i1.y, n.y, n.x * i1.y + n.z * i1.x);
  // the pole is whippy: it leans with the gusts, and goes right over when a skier's shoulder takes it. Each height is turned about the
  // foot by its own share of the lean (little near the snow, most at the tip)
  let bl: f32 = length(i1.zw);
  if (bl > 0.0004) {
    let h: f32 = saturate(q.y / ${GATE_K.FH.toFixed(2)}); let ang: f32 = bl * (1.5 * h - 0.5 * h * h);
    let k: vec3f = vec3f(i1.w, 0.0, -i1.z) / bl;
    q = turnAbout(q, k, ang); m = turnAbout(m, k, ang);
  }
  o.wp = i0.xyz + q * i0.w; o.n = m;
  return o;
}
`;

const FLAG_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let toC: vec3f = U.camPos.xyz - v.wp; let dist: f32 = length(toC); let V: vec3f = toC / dist;
  let L: vec3f = U.sunDir.xyz;
  var N: vec3f = normalize(v.nrm);
  let px: f32 = dist * 2.0 * U.camRight.w * U.res.w;                       // metres to a pixel out there
  let y: f32 = v.mp.y;
  let wv: vec4f = tex(tDetail, v.mp.xy * 3.3 + v.mp.w);
  let sh: f32 = shadowAt(v.wp, 0.0016);
  // the lantern at its foot, and the skier's headlamp
  let lv: vec3f = v.lp - v.wp; let l2: f32 = dot(lv, lv); let Ll: vec3f = lv * inverseSqrt(max(l2, 1e-4));
  let El: vec3f = lantCol() * (v.ex.x * ${LANT_I} / (l2 + 0.03));
  let Eh: vec3f = lampLight(v.wp); let Lh: vec3f = normalize(U.lamp.xyz - v.wp);
  var col: vec3f = vec3f(0.0);
  if (v.uv.z < 0.5) {
    if (dot(N, V) < 0.0) { N = -N; }
    let a: f32 = v.uv.x; let b: f32 = v.uv.y;
    // creases, and the knit of the cloth
    let cr: vec4f = tex(tDetail, v.mp.xy * vec2f(0.55, 0.31) + v.mp.w * 3.0);
    // (a sail pulled on its pole wrinkles in long folds that fan out from the sleeve and slant down toward the free edge; they move as it flaps)
    let fw: f32 = (a * 1.0 - y * 0.55) * 14.0 + 1.6 * cr.z + U.camPos.w * 1.7 + v.mp.w * 13.0;
    let fold: f32 = cos(fw) * (0.30 + 0.70 * a) * (1.0 - a * 0.5) * smoothstep(0.02, 0.15, a);
    N = normalize(N + (vec3f(cr.x, cr.y, 0.5) - 0.5) * 0.30 + (vec3f(wv.x, wv.y, 0.5) - 0.5) * 0.10 + vec3f(0.55, -0.30, 0.0) * (fold * 0.60 * (1.0 - smoothstep(0.8, 2.5, fwidth(fw)))));
    // the banner: an orange field, a dark sleeve round the pole, white chevrons pointing down, a doubled hem
    let ew: f32 = max(0.006, 0.6 * px);
    let sleeve: f32 = 1.0 - smoothstep(0.060 - ew * 1.4, 0.060 + ew * 1.4, a);
    let ac: f32 = abs(a - 0.54);
    var chev: f32 = 0.0;
    // (they count down to the lip: three on the pair up the hill, two where the run-in begins, one at the lip itself)
    let nch: f32 = 3.0 - floor(v.ex.y + 0.5);
    // (where they sit is the cut's: M.p = first, step, half width, how steep the arms)
    for (var i: i32 = 0; i < 3; i++) { let dq: f32 = abs(y - M.p.x - 0.5 * M.p.y * (3.0 - nch) - M.p.y * f32(i) - ac * M.p.w); chev = max(chev, (1.0 - smoothstep(M.p.z - ew, M.p.z + ew, dq)) * step(f32(i) + 0.5, nch)); }
    chev *= (1.0 - smoothstep(0.40, 0.44, ac)) * (1.0 - sleeve);
    // the hem: the cloth turned back on itself and stitched, along the free edge and the foot. Doubled, it lets less light through and
    // reads as a darker line round the sail, as a real one does
    let hw: f32 = max(0.035, 1.2 * ew);
    let hem: f32 = max(smoothstep(1.0 - hw - 0.012, 1.0 - hw, a), 1.0 - smoothstep(0.010, 0.022, b)) * (1.0 - sleeve);
    // (printed polyester, not a safety-vest orange: a red-orange with some grey in it; in the folds' troughs it lies in its own shade)
    let trough: f32 = (1.0 - 0.45 * saturate(-fold) * (1.0 - smoothstep(0.8, 2.5, fwidth(fw)))) * (0.80 + 0.20 * smoothstep(0.05, 0.35, a));
    var alb: vec3f = mix(vec3f(0.58, 0.21, 0.09), vec3f(0.78, 0.77, 0.73), chev) * (1.0 - 0.22 * hem) * trough;
    var thr: vec3f = mix(vec3f(0.56, 0.18, 0.04), vec3f(0.50, 0.47, 0.41), chev) * (1.0 - 0.62 * hem) * (0.86 + 0.28 * wv.w);
    alb = mix(alb, vec3f(0.016, 0.018, 0.022), sleeve); thr *= 1.0 - sleeve;
    // snow blown onto the foot of the sail
    let dusty: f32 = (1.0 - smoothstep(0.52, 1.05, y)) * smoothstep(0.50, 0.68, wv.z * 0.6 + cr.w * 0.4 + 0.22 * (1.0 - smoothstep(0.5, 0.8, y)));
    alb = mix(alb, vec3f(0.90, 0.92, 0.95), dusty * 0.85); thr = mix(thr, vec3f(0.30, 0.31, 0.33), dusty * 0.85);
    let ndl: f32 = dot(N, L);
    let amb: vec3f = U.ambSky.rgb * (0.5 + 0.5 * N.y) + U.ambGnd.rgb * (0.5 - 0.5 * N.y) * 1.25 + twiLight(N);
    let ambB: vec3f = U.ambSky.rgb * (0.5 - 0.5 * N.y) + U.ambGnd.rgb * (0.5 + 0.5 * N.y) * 1.25 + twiLight(-N);
    // lit from the lens's side it is a matt orange; with the sun behind it the light comes through the cloth and the flag glows, most of
    // all where the line of sight runs on toward the sun
    // (light that meets the cloth on the slant has farther to go through the weave: every fold shows as a darker band. On the lit side
    // the nylon has a soft sheen)
    let fwd: f32 = pow(saturate(dot(-V, L)), 5.0);
    let tk: f32 = saturate(0.06 - ndl * 1.06); let thru: f32 = tk * tk * (0.6 + 0.4 * tk) * (0.30 + 2.4 * fwd);
    let sheen: f32 = 0.20 * pow(saturate(dot(N, normalize(V + L))), 22.0) * saturate(ndl * 3.0) * (1.0 - sleeve);
    col = alb * (U.sunCol.rgb * (saturate((ndl + 0.12) / 1.12) * sh) + amb)
        + thr * (U.sunCol.rgb * (thru * sh) + ambB * 0.9) + U.sunCol.rgb * (sheen * sh);
    // lantern and headlamp: the same cloth, lit from whichever side they stand on
    let nl: f32 = dot(N, Ll); let nh: f32 = dot(N, Lh);
    col += El * (alb * saturate((nl + 0.2) / 1.2) + thr * saturate((0.2 - nl) / 1.2));
    col += Eh * (alb * saturate((nh + 0.2) / 1.2) + thr * saturate((0.2 - nh) / 1.2));
  } else {
    // the pole: black glass fibre, snow plastered on its foot
    let ndv: f32 = saturate(dot(N, V));
    let snowy: f32 = (1.0 - smoothstep(0.10, 0.55, y)) * smoothstep(0.34, 0.58, wv.z + 0.25 * (1.0 - smoothstep(0.0, 0.2, y)));
    let alb: vec3f = mix(vec3f(0.030, 0.032, 0.038), vec3f(0.90, 0.92, 0.95), snowy);
    let ndl: f32 = dot(N, L);
    let amb: vec3f = U.ambSky.rgb * (0.5 + 0.5 * N.y) + U.ambGnd.rgb * (0.5 - 0.5 * N.y) * 1.25 + twiLight(N);
    col = alb * (U.sunCol.rgb * (saturate(ndl) * sh) + amb) + U.sunCol.rgb * (sh * 0.35 * (1.0 - snowy) * pow(max(dot(N, normalize(V + L)), 0.0), 48.0) * saturate(ndl * 4.0));
    // (against the light a thin dark pole would be lost: the sun finds its edge)
    col += U.sunCol.rgb * (0.10 * pow(1.0 - ndv, 2.0) * saturate(dot(-V, L)) * sh);
    col += alb * (El * saturate(dot(N, Ll) * 0.7 + 0.3) + Eh * saturate(dot(N, Lh) * 0.7 + 0.3));
  }
  col = applyFog(col, v.wp);
  o.color = vec4f(col, 1.0);
  return o;
}
`;

const PROP_VS = `
fn vert(a: VIn) -> VOut { var v: VOut;
  var wp: vec3f = vec3f(0.0); var n: vec3f = a.nrm;
  if (a.pm.w > 0.5) {
    // the lantern: upright, standing any way round
    let an: f32 = a.j1.w * 6.2832; let c: f32 = cos(an); let s: f32 = sin(an);
    wp = a.j0.xyz + a.j2.xyz + vec3f(a.pos.x * c - a.pos.z * s, a.pos.y, a.pos.x * s + a.pos.z * c) * (a.j0.w * ${GATE_K.LS.toFixed(2)});
    n = vec3f(a.nrm.x * c - a.nrm.z * s, a.nrm.y, a.nrm.x * s + a.nrm.z * c);
  } else {
    // the drift round the foot of the pole lies on the slope
    wp = a.j0.xyz + vec3f(a.pos.x, a.pos.y + dot(a.j1.xy, a.pos.xz), a.pos.z) * a.j0.w;
    n = normalize(vec3f(a.nrm.x - a.j1.x * a.nrm.y, a.nrm.y, a.nrm.z - a.j1.y * a.nrm.y));
  }
  v.wp = wp; v.nrm = n; v.pm = a.pm; v.ex = vec4f(a.j1.z * flameK(a.j1.w), a.j1.w, 0.0, 0.0); v.lp = a.j0.xyz + a.j2.xyz + vec3f(0.0, ${GATE_K.LFY.toFixed(3)}, 0.0);
  v.clip = U.viewProj * vec4f(wp, 1.0);
  // (the drift is laid over the snow that is already drawn: a few centimetres nearer the lens than it lies, so that snow never cuts through it)
  if (a.pm.w < 0.5) { v.clip.z = v.clip.z - U.camFwd.w * 0.05 / max(v.clip.w, 0.05); }
  return v; }
`;
const PROP_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let toC: vec3f = U.camPos.xyz - v.wp; let dist: f32 = length(toC); let V: vec3f = toC / dist;
  let L: vec3f = U.sunDir.xyz;
  var N: vec3f = normalize(v.nrm);
  let part: f32 = floor(v.pm.x + 0.5); let k: f32 = v.ex.x;
  let sh: f32 = shadowAt(v.wp + N * 0.03, 0.0016);
  let lv: vec3f = v.lp - v.wp; let l2: f32 = dot(lv, lv); let Ll: vec3f = lv * inverseSqrt(max(l2, 1e-4));
  let El: vec3f = lantCol() * (k * ${LANT_I} / (l2 + 0.02));
  let Eh: vec3f = lampLight(v.wp); let Lh: vec3f = normalize(U.lamp.xyz - v.wp);
  let nz: vec4f = tex(tDetail, (v.wp.xz + U.origin.xz) * 1.75 + v.wp.yy * 0.9);
  var col: vec3f = vec3f(0.0); var al: f32 = 1.0;
  if (part < 0.5) {
    // the drift at the pole
    N = normalize(N + vec3f(nz.x - 0.5, 0.0, nz.y - 0.5) * 0.40);
    col = gateSnow(N, V, sh, v.pm.z);
    col += vec3f(0.93, 0.955, 0.985) * (El * saturate((dot(N, Ll) + 0.3) / 1.3) + Eh * saturate((dot(N, Lh) + 0.1) / 1.1));
    al = 1.0 - smoothstep(0.42, 0.97, v.pm.y + (nz.z - 0.5) * 0.25);
  } else {
    let ndv: f32 = abs(dot(N, V)); if (dot(N, V) < 0.0) { N = -N; }
    let amb: vec3f = U.ambSky.rgb * (0.5 + 0.5 * N.y) + U.ambGnd.rgb * (0.5 - 0.5 * N.y) * 1.25 + twiLight(N);
    let Hh: vec3f = normalize(V + L);
    if (part > 2.5) {
      // the globe: by day you look through it at the snow beyond (greyed and greened by two walls of old glass, darkest at its edges)
      // and at the burner standing in it; alight, a flame stands there instead, brightest where the eye looks through its middle
      let R: vec3f = reflect(-V, N);
      let env: vec3f = skyLut(normalize(vec3f(R.x, abs(R.y) * 0.9 + 0.02, R.z)));
      let fr: f32 = 0.04 + 0.96 * pow(1.0 - ndv, 5.0); let vv: f32 = v.pm.y;
      let stub: f32 = (1.0 - smoothstep(0.16, 0.34, vv)) * smoothstep(0.62, 0.86, ndv);
      let thru: vec3f = gateSnow(vec3f(0.0, 1.0, 0.0), V, sh, 0.75) * vec3f(0.60, 0.70, 0.68) * (0.30 + 0.70 * ndv);
      col = mix(thru, vec3f(0.03) * amb, stub) * (1.0 - fr) + env * (fr * 0.45);
      col += U.sunCol.rgb * (sh * (0.9 * pow(max(dot(N, Hh), 0.0), 220.0) + 0.05 * pow(max(dot(N, Hh), 0.0), 12.0)));
      // (on a round globe the normal says where across it the eye is looking: the flame is a tear of light standing on the wick,
      // leaning and shivering; the glass about it glows)
      let band: f32 = smoothstep(0.0, 0.30, vv) * (1.0 - smoothstep(0.50, 1.0, vv));
      let f: f32 = (vv - 0.14) / 0.52; let tt: f32 = U.camPos.w; let sd: f32 = v.ex.y;
      let lat: f32 = dot(N, U.camRight.xyz) - f * (0.10 * sin(tt * 7.3 + sd * 40.0) + 0.05 * sin(tt * 17.0 + sd * 23.0));
      let wd: f32 = 0.72 * sqrt(saturate(f)) * saturate(1.0 - f);
      let fl: f32 = (1.0 - smoothstep(wd * 0.30, wd + 0.03, abs(lat))) * step(0.0, f) * step(f, 1.0);
      col += lantCol() * (k * (0.50 + 1.4 * ndv * band + 5.0 * fl)) + vec3f(1.0, 0.84, 0.56) * (k * 34.0 * fl * fl);
    } else {
      // black enamelled iron, snow lying wherever it can (and warmed by its own flame)
      let snowy: f32 = smoothstep(0.50, 0.80, N.y + (nz.z - 0.5) * 0.7);
      let alb: vec3f = mix(vec3f(0.020, 0.021, 0.024), vec3f(0.90, 0.92, 0.95), snowy);
      let ndl: f32 = dot(N, L);
      col = alb * (U.sunCol.rgb * (saturate(ndl) * sh) + amb) + U.sunCol.rgb * (sh * (1.0 - snowy) * 0.6 * pow(max(dot(N, Hh), 0.0), 48.0) * saturate(ndl * 4.0));
      col += skyLut(normalize(vec3f(N.x, abs(N.y) + 0.05, N.z))) * (0.05 * pow(1.0 - ndv, 3.0) * (1.0 - snowy));
      // (so near the flame the iron would burn out: it stays what it is, a dark frame against the glow, with a warm edge)
      col += alb * (min(El, vec3f(7.0)) * saturate(dot(N, Ll) * 0.5 + 0.5) + Eh * saturate(dot(N, Lh) * 0.7 + 0.3)) + lantCol() * (k * 0.10 * pow(1.0 - ndv, 2.0) * (1.0 - snowy));
    }
  }
  col = applyFog(col, v.wp);
  o.color = vec4f(col * al, al);
  return o;
}
`;

// lamplight on the snow: a point of light a hand above the surface. The snow answers it as it answers the sun in the terrain's own
// shader: by its slope (the grid's, plus the same wind ripples the terrain draws), and its crystals flash in it
const POOL_FS = `
fn poolSpark(wxz: vec2f, cell: f32, N: vec3f, Hh: vec3f, ja: vec2f, jb: vec2f, idet: f32) -> vec3f {
  let g: vec2f = wxz / cell; let id: vec2f = floor(g);
  let r: vec4f = texLod(tNoise, (id + 0.5) / 256.0, 0.0);
  let tilt: vec2f = (r.xz - 0.5) * (0.30 + 2.3 * r.y * r.y);
  let n: vec3f = normalize(N + vec3f(tilt.x, 0.0, tilt.y));
  let w: vec2f = (g - id - 0.5 - (r.yw - 0.5) * 0.4) * cell;
  let px: vec2f = vec2f(w.x * jb.y - w.y * jb.x, w.y * ja.x - w.x * ja.y) * idet;
  let shape: f32 = saturate(1.0 - dot(px, px) / (1.2 + 1.6 * r.w));
  return mix(vec3f(1.0), 0.55 + 0.75 * cos(6.2832 * (r.z + vec3f(0.0, 0.33, 0.67))), 0.45 * r.x) * (pow(max(dot(n, Hh), 0.0), 380.0) * shape * shape);
}
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let wp: vec3f = v.wp; let toC: vec3f = U.camPos.xyz - wp; let dist: f32 = length(toC); let V: vec3f = toC / dist;
  let lv: vec3f = v.lp.xyz - wp; let l2: f32 = dot(lv, lv); let Ll: vec3f = lv * inverseSqrt(max(l2, 1e-4));
  let k: f32 = lantOn(v.lp.w, M.p.x) * M.p.y * flameK(v.lp.w) * M.off.w;
  let wxz: vec2f = wp.xz + U.origin.xz;
  let d1: vec4f = tex(tSnow, wxz / 12.8); let d2: vec4f = tex(tSnowF, wxz / 2.56 + vec2f(0.37, 0.11));
  let q1: vec2f = d1.xy * 2.0 - 1.0; let q2: vec2f = d2.xy * 2.0 - 1.0;
  let f1: f32 = smoothstep(420.0, 40.0, dist); let f2: f32 = smoothstep(46.0, 5.0, dist);
  let gm: vec3f = normalize(v.nrm);
  let slope: vec2f = -gm.xz / max(gm.y, 0.2) + q1 * abs(q1) * (0.81 * f1) + q2 * abs(q2) * (0.81 * f2);
  let N: vec3f = normalize(vec3f(-slope.x, 1.0, -slope.y));
  // what arrives: inverse square from the flame, on a surface that scatters it on under its skin (so it does not go black at a grazing angle)
  let nl: f32 = saturate((dot(N, Ll) + 0.30) / 1.30);
  let r: f32 = length(lv.xz);
  var E: f32 = k * ${LANT_I} * (nl / (l2 + 0.02) + 0.30 * exp(-r / 0.45));
  E *= 1.0 - smoothstep(2.3, 3.3, r);
  let ja: vec2f = dpdx(wxz); let jb: vec2f = dpdy(wxz);
  let det: f32 = ja.x * jb.y - ja.y * jb.x; let idet: f32 = det / (det * det + 1e-12);
  let lvl: f32 = log2(max(max(length(ja), length(jb)), 0.0004) * 6.0 / 0.004); let l0: f32 = floor(lvl); let c0: f32 = 0.004 * exp2(l0);
  let Hh: vec3f = normalize(V + Ll);
  let sp: vec3f = mix(poolSpark(wxz + vec2f(4.1, 2.3), c0, N, Hh, ja, jb, idet), poolSpark(wxz + vec2f(7.9, 5.6), c0 * 2.0, N, Hh, ja, jb, idet), lvl - l0);
  var col: vec3f = lantCol() * E * (vec3f(0.93, 0.955, 0.985) + sp * (26.0 * U.fx.y * smoothstep(300.0, 20.0, dist)));
  col *= 1.0 - fogAmount(wp);
  o.color = vec4f(col, 1.0);
  return o;
}
`;

// dye sprayed on snow by somebody walking with a tank on their back: st = (along the stroke, across it, its length, its width) in metres,
// sd = (which stroke, 1 = a line down the hill that thins toward its upper end, strength). The sheet multiplies the snow under it.
const DYE_FS = `
fn lantE(l: vec4f, wp: vec3f) -> f32 { let d: vec3f = l.xyz - wp; return l.w * ${LANT_I} * 0.62 / (dot(d, d) + 0.03); }
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let p: f32 = v.st.x; let q: f32 = v.st.y; let len: f32 = v.st.z; let sd: f32 = v.sd.x;
  // the line wanders, swells and thins as the walker's arm does
  let n0: vec4f = tex(tDetail, vec2f(p * 0.027 + sd * 7.3, sd * 3.1 + 0.2));
  let n1: vec4f = tex(tDetail, vec2f(p * 0.11 + sd * 3.7, sd * 5.3 + 0.6));
  let c: f32 = ((n0.z - 0.5) * 0.85 + (n1.z - 0.5) * 0.16) * mix(1.0, 0.4, v.sd.y);
  // (seen from far up the hill, along the snow, a band a stride wide is thinner than a pixel and would be lost: it is never drawn
  // thinner than a two-hundredth of the picture's height, as far as its sheet reaches. A line stays a line)
  let fp: f32 = abs(dpdx(q)) + abs(dpdy(q));                          // metres across the stroke to a pixel
  // (a band drawn wider than it is, to stay in the picture, is drawn paler by as much: the same dye spread over more pixels. Far off
  // it is a soft tint across the snow, never an even stroke of ink)
  let wt: f32 = v.st.w * (0.74 + 0.52 * n1.x) * mix(1.0, 0.55 + 0.45 * smoothstep(-0.5, 0.5, p / len), v.sd.y);
  let w: f32 = max(wt, fp * max(1.8, 0.0034 * U.res.y));
  let cov: f32 = 0.55 + 0.45 * saturate(wt / w);
  let fine: vec4f = tex(tDetail, vec2f(p, q) * 0.83 + sd);
  let grain: vec4f = tex(tDetail, vec2f(p, q) * 3.9 + sd * 2.0);
  let blot: vec4f = tex(tDetail, vec2f(p * 0.37 + sd * 1.7, q * 0.52 + sd * 4.1));
  let d: f32 = abs(q - c) - 0.5 * w;                                  // > 0: outside the band the nozzle covered
  let edge: f32 = d + (fine.z - 0.5) * 0.34 + (blot.z - 0.5) * 0.30 + (grain.z - 0.5) * 0.08;
  let aw: f32 = max(0.03, 0.5 * fp);
  // (the spray is thickest down the middle of the pass and fades over a forearm's width: a nozzle throws a cone, not a brush; the
  // colour is never even: the walker hurries and lingers, and the passes overlap)
  let mot: vec4f = tex(tDetail, vec2f(p * 0.21 + sd * 9.0, q * 0.35 + sd * 2.0));
  let core: f32 = (1.0 - smoothstep(-0.30 - aw, 0.10 + aw, edge)) * (0.48 + 0.52 * smoothstep(0.26, 0.66, mot.z * 0.5 + fine.z * 0.3 + blot.x * 0.2));
  let soak: f32 = 0.34 * exp(-max(edge, 0.0) / 0.14);                 // it creeps outward through the grains
  let drop: vec4f = tex(tDetail, vec2f(p, q) * 1.9 + sd * 4.0);
  let mist: f32 = 0.55 * exp(-max(d, 0.0) / 0.26) * smoothstep(0.64, 0.76, drop.z);   // and droplets fell wide of it
  var rho: f32 = max(core, max(soak, mist));
  // the snow takes it grain by grain: a crystal here drinks it, the one beside it is still white, and in the hollows between the clods
  // it pools. (Noise fixed to the snow at two and five centimetres; the mip chain evens it out to its mean as it falls under a pixel)
  let gA: f32 = tex(tDetail, v.wp.xz * 0.135 + sd).w;
  let gB: f32 = tex(tDetail, v.wp.xz * 0.052 + sd * 3.0).w;
  let gC: f32 = tex(tDetail, v.wp.xz * 0.019 + sd * 5.0).z;
  let gr: f32 = smoothstep(0.22, 0.78, gA * 0.5 + gB * 0.3 + gC * 0.2);
  rho = saturate(rho * (0.20 + 1.60 * gr) - 0.06 * (1.0 - gr)) * cov;
  // every skier before you has gone over it: where most of them go the colour is worn thin in streaks, and a little of it has been
  // dragged on down the hill. (The streaks are read along a slanting line through the noise, so no stretch of them comes round again;
  // and they come in bunches: here a dozen have taken the same line, there nobody has)
  let str: vec4f = tex(tDetail, vec2f(p * 1.3 + sd * 5.0, q * 0.06 + p * 0.043 + sd * 3.0));
  let bun: vec4f = tex(tDetail, vec2f(p * 0.083 + sd * 2.0, p * 0.011 + sd * 7.0));
  let mid: f32 = exp(-sq(p / (0.26 * len))) * (1.0 - v.sd.y) * smoothstep(0.30, 0.62, bun.z + 0.12);
  rho *= 1.0 - mid * (0.06 + 0.36 * smoothstep(0.40, 0.60, str.z + (bun.x - 0.5) * 0.25));
  rho = max(rho, 0.34 * mid * smoothstep(0.50, 0.68, str.z) * exp(-max(q - 0.3 * v.st.w, 0.0) / 0.55) * step(0.0, q) * (1.0 - smoothstep(0.85, 1.20, q)));
  // it stops where the walker stopped; a line down the hill fades out toward its upper end
  rho *= smoothstep(0.0, 0.7, 0.5 * len - abs(p) + (fine.z - 0.5) * 0.5) * mix(1.0, smoothstep(-0.52, -0.05, p / len), v.sd.y);
  // (the walker sprays the top and the edges; on the steep walls of the kicker the dye only runs a little way down, it does not streak)
  let nw: vec3f = normalize(cross(dpdx(v.wp), dpdy(v.wp)));
  rho *= smoothstep(0.84, 0.95, abs(nw.y));
  // (seen along the snow, the light that comes back from it has mostly been thrown off the tops of the grains, which the dye has
  // hardly reached: at a grazing look the colour fades toward the snow's own)
  let ndv: f32 = abs(dot(nw, normalize(U.camPos.xyz - v.wp)));
  rho *= mix(0.72, 1.0, smoothstep(0.03, 0.30, ndv));
  rho *= v.sd.z * M.off.w * (1.0 - fogAmount(v.wp));
  // (a dye takes its share of the light at every grain it passes: thin, it is a pale cyan; thick, a deep blue. Marking dye on snow is
  // never the blue of the bottle: wet into the grains and lit through them it is greyed toward the snow, and the deepest of it is a
  // dense slate blue, not ink)
  let Td: vec3f = pow(vec3f(0.13, 0.32, 0.74), vec3f(saturate(rho) * 1.05));
  // (by night it is pigment in the dark: a blue dye under a blue moon is a dull navy stain that only just reads, the snow round it
  // already lit in the moon's own colour. Where the headlamp or a lantern falls on it, the light is warm and bright enough to show
  // the colour, and there it is blue again. So: how much of the light here is lamp or lantern, against the moon and the sky)
  var El: f32 = dot(lampLight(v.wp), vec3f(0.3, 0.55, 0.15));
  El += lantE(M.l0, v.wp) + lantE(M.l1, v.wp) + lantE(M.l2, v.wp) + lantE(M.l3, v.wp);
  let Dn: f32 = dot(U.sunCol.rgb, vec3f(0.3, 0.55, 0.15)) * max(U.sunDir.y, 0.0) + dot(U.ambSky.rgb, vec3f(0.3, 0.55, 0.15)) * 1.6;
  let lit: f32 = smoothstep(0.15, 0.75, El / (El + Dn + 1e-5));
  let Tn: vec3f = pow(vec3f(0.30, 0.33, 0.42), vec3f(saturate(rho) * 1.05));
  o.color = vec4f(mix(Td, Tn, M.p.x * (1.0 - lit)), 1.0);
  return o;
}
`;

// the glare of a flame: what the lens and the frosty air make of a small, very bright source. A flame that lights three metres of snow
// is thousands of times brighter than that snow: near, its core burns out the film; far down the valley it is still a clear point of
// light, since all of it lands on one pixel. The core is never drawn smaller than a pixel across (it would come and go as the lens
// moves): past that it keeps its size on the screen and loses brightness instead, as the square of the distance
const GLARE_VS = `
fn vert(a: VIn) -> VOut { var v: VOut;
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  var c: vec3f = a.g0.xyz; let d: f32 = length(U.camPos.xyz - c);
  // (the flame stands a hand above the snow: from far off that is less than a pixel, and the snow in front of it, a pixel lower on the
  // screen, would cut its core in half. A far light must not come and go with the ground: from far off it is drawn two pixels above
  // its foot. And it is drawn a little nearer the lens than it stands: a hand's width near to, so its own lantern does not cover it,
  // a twentieth of the way from far off, where the snow is drawn coarser and may stand a little proud of the true ground. Whatever
  // really stands in front of it, a tree or the hill, still hides it)
  c.y = c.y + max(0.0, 4.0 * U.camRight.w * U.res.w * d - 0.10);
  let toC: vec3f = U.camPos.xyz - c;
  let pull: f32 = min(0.20 + 0.05 * max(d - 4.0, 0.0), 0.5 * d);
  let cp: vec4f = U.viewProj * vec4f(c + toC * (pull / max(d, 0.25)), 1.0);
  let rw: f32 = 0.85 / (max(d, 0.1) * U.camRight.w);                   // its true reach on the screen (0.85 m of glow), in half-heights
  let r: f32 = max(rw, 0.072);                                         // (and never less than the aureole, which keeps its size on the screen)
  v.clip = vec4f(cp.x + corner.x * r / U.camUp.w * cp.w, cp.y + corner.y * r * cp.w, cp.z, cp.w);
  v.uv = corner; v.ex = vec4f(a.g0.w * flameK(a.g1.x) * a.g1.y, rw / r, r * 0.5 * U.res.y, a.g1.x); v.wp = c;
  return v; }
`;
const GLARE_FS = `
fn frag(v: VOut) -> FOut { var o: FOut;
  let d: f32 = length(v.uv); if (d >= 1.0) { discard; }
  let s: f32 = v.ex.y; let rpx: f32 = v.ex.z;                        // s: 1 = drawn at its true size, less = enlarged to stay on the screen
  let F: f32 = sq(s * rpx);                                          // the light that lands on one pixel if all of the flame does (1 = film white)
  // the core: the flame itself (a thumb's width), or a pixel and a bit, whichever is larger
  let cw: f32 = max(0.026 * s, 1.15 / rpx);
  let core: f32 = exp(-sq(d / cw)) * min(14.0, F);
  // frost in the air: a small aureole that keeps its size on the screen however far the lamp, and the wider glow that belongs to the place
  let aur: f32 = min(0.60, 0.22 * sqrt(F)) * exp(-d * rpx / (0.008 * U.res.y));
  let dw: f32 = min(d / s, 1.0); let halo: f32 = exp(-dw * 5.5) * sq(1.0 - dw);
  // a few thin rays from the iris, as the sun has: only for a lamp near enough to be more than a point
  let an: f32 = atan2(v.uv.y, v.uv.x) / 6.2832 * 14.0 + 0.31; let da: f32 = (an - floor(an + 0.5)) * 0.4488;
  let ray: f32 = exp(-sq(dw * sin(da) / (0.004 + 0.02 * dw))) * exp(-dw * 10.0) * (1.0 - dw) * s * s;
  let col: vec3f = (vec3f(1.0, 0.82, 0.55) * core + lantCol() * (aur + halo * 0.34 + ray * 0.8)) * v.ex.x;
  o.color = vec4f(col * (1.0 - fogAmount(v.wp)) * sq(1.0 - d * d), 1.0);
  return o; }
`;
