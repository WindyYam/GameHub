"use strict";
// ---------------------------------------------------------------- sky: atmosphere LUT, the day turning into night, sun, moon, stars, an airliner now and then
// (nebula / clouds / city / cloud sea are layered in further down this file and in their own)
const Sky = (() => {
  const S = { alt: 3200, E: 22, az: -0.2, sunElev: 0.20, elev: 0.20, moonElev: 0.27, moonK: 0.034, skyline: 0.027, lutSun: -99, lutMoon: -99,
    clock: 0, cycle: 1440, night: 0, lights: 0, stars: 0, moonVis: 0, milk: 1, isMoon: false, exposure: 0.145, hiAlt: 8600, lampK: 0 };
  let gfx, lutTex, lutTarget, pipeLut, pipeSky;
  // the day, as [minutes from midnight, height of the sun (rad)]. One unit of the clock is one in-game minute and one real second, so the
  // cycle is a whole day: 24 real minutes. The shape is the old one, stretched so the day fills 06:00–18:30 and the night the rest: a long
  // low afternoon, the hour of gold, the sun held on the far skyline, then dusk, the dark, and the morning. The sun keeps its compass bearing
  // throughout (only its height changes), and comes up again where it went down.
  // (the afternoon sun stands low, 11 degrees up: it is in the picture, the thrown snow hangs close under it, and every ripple of the slope has a shadow)
  const DE = 0.20;
  // (the run begins at `day`, 10:20, still that low afternoon sun. Sunrise and sunset below are 06:00 and 18:30)
  const DAY = [[0, -0.22], [230.1, -0.22], [325.4, -0.03], [376.6, 0.06], [463.9, DE], [619.7, DE], [765.1, DE], [1004, 0.075], [1121.5, 0.034], [1173.5, 0.012], [1352.5, -0.22], [1440, -0.22]];
  S.elevAt = function (t) {
    t = ((t % S.cycle) + S.cycle) % S.cycle;
    for (let i = 1; i < DAY.length; i++) if (t <= DAY[i][0]) {
      const a = DAY[i - 1], b = DAY[i]; let f = (t - a[0]) / (b[0] - a[0]);
      // ease out of and into the long holds
      if (i > 1 && DAY[i - 2][1] === a[1] && a[1] !== b[1]) f = f * f * (2 - f); else if (i < DAY.length - 1 && DAY[i + 1][1] === b[1] && a[1] !== b[1]) f = 1 - (1 - f) * (1 - f) * (1 + f);
      return lerp(a[1], b[1], f);
    }
    return DAY[0][1];
  };
  S.times = { day: 619.7, golden: 968.7, sunset: 1110, dusk: 1219.7, night: 1424.7, dawn: 299.4, sunrise: 360 };
  S.setClock = function (t) { S.clock = t; S.sunElev = S.elevAt(t); };
  S.setClock(S.times.day);                                          // the picture opens in the afternoon, as it always has

  S.init = function (g) {
    gfx = g;
    lutTex = gfx.texture({ w: 128, h: 64, format: 'rgba16f', filter: 'linear', wrap: 'clamp' });
    lutTarget = gfx.target({ color: lutTex });
    S.lut = lutTex;
    pipeLut = gfx.pipeline({
      name: 'skyLut', lib: [SL.common, SL.atmo], buffers: [], varyings: { uv: 'vec2f' }, uniforms: { p: 'vec4f', q: 'vec4f' }, textures: {}, depth: false, depthTest: false, cull: 'none',
      vs: VS_FULLSCREEN,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut;
        let az: f32 = saturate((v.uv.x - 0.5 / 128.0) * (128.0 / 127.0)) * PI;
        let vv: f32 = saturate(((1.0 - v.uv.y) - 0.5 / 64.0) * (64.0 / 63.0)) * 2.0 - 1.0;
        let el: f32 = sign(vv) * vv * vv * PI * 0.5;
        let se: f32 = M.p.x;
        let sun: vec3f = vec3f(cos(se), sin(se), 0.0);
        let d: vec3f = vec3f(cos(el) * cos(az), sin(el), cos(el) * sin(az));
        var c: vec3f = atmoScatter(vec3f(0.0), d, sun, M.p.y);
        // the same air lit by the moon, which hangs on the sun's bearing
        if (M.q.w > 0.0) { c += atmoScatter(vec3f(0.0), d, vec3f(cos(M.p.z), sin(M.p.z), 0.0), M.p.y) * M.q.rgb; }
        o.color = vec4f(c, 1.0); return o; }`,
    });
    pipeSky = gfx.pipeline({
      name: 'sky', lib: [SL.common, SL.hash, SL.noise, SL.fog, NEBULA_SSL, vistaSSL(), CLOUDSEA_SSL, CIRRUS_SSL, NIGHT_SSL, AURORA_SSL, CONTRAIL_SSL, ANTISOLAR_SSL, weatherSkySSL()], buffers: [], varyings: { uv: 'vec2f' },
      uniforms: { au: 'vec4f', p: 'vec4f', nr: 'vec4f', nu: 'vec4f', nf: 'vec4f', sd: 'vec4f', mo: 'vec4f', hi: 'vec4f', fr: 'vec4f', pa: 'vec4f', pb: 'vec4f', pc: 'vec4f', cs: 'vec4f', ab: 'vec4f', ns: 'vec4f',
        wa: 'vec4f', wb: 'vec4f', wc: 'vec4f', wd: 'vec4f', we: 'vec4f', wf: 'vec4f', wg: 'vec4f' },
      textures: { tSky: '2d', tNebA: '2d', tNebB: '2d', tDetail: '2d', tFarA: '2d', tFarB: '2d', tCityA: '2d', tCityB: '2d', tCitySh: '2d', tSeaA: '2d', tSeaB: '2d' }, depthFunc: 'lequal', depthWrite: false, cull: 'none',
      vs: `fn vert(a: VIn) -> VOut { var v: VOut; let uv: vec2f = vec2f(f32((a.vid << 1u) & 2u), f32(a.vid & 2u)); v.clip = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 1.0, 1.0); v.uv = uv; return v; }`,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut;
        let ndc: vec2f = vec2f(v.uv.x * 2.0 - 1.0, 1.0 - v.uv.y * 2.0);
        let d: vec3f = normalize(screenRay(ndc));
        var col: vec3f = skyLut0(vec3f(d.x, max(d.y, 0.0), d.z));
        let mu: f32 = dot(d, U.sunDir.xyz);
        // the haze band at the horizon: milky and bright by day rather than yellow (at sunset it keeps all its colour)
        let hz: f32 = smoothstep(0.16, 0.0, d.y);
        col = mix(col, vec3f(luma(col)) * vec3f(1.03, 1.0, 1.0), 0.55 * hz * U.sunDir.w);
        col = antiSolar(d, col);
        let ang: f32 = acos(clamp(mu, -1.0, 1.0));
        // polariser on the lens: sky light scattered at right angles to the sun is strongly polarised, so the blue deepens away from the sun
        col *= 1.0 - M.p.z * (1.0 - mu * mu) * smoothstep(-0.02, 0.32, d.y);
        let skyL: f32 = luma(col);
        // stars come out as the sky lets them
        // the nebula: by day a pale ghost riding on the blue (scaled with the sky behind it), lost in the haze toward the horizon and in the sun's glare
        let nb: vec4f = nebula(d, U.camPos.w);
        let nbc: vec3f = mix(vec3f(luma(nb.rgb)), nb.rgb, M.p.w);
        // stars come out as the sky lets them; where the nebula glows they sink into it
        if (U.skyP.w > 0.003) { col += stars(d) * (U.skyP.w * smoothstep(-0.01, 0.10, d.y) / (1.0 + 2.5 * luma(nb.rgb) * M.nu.w)); }
        // the aurora: out when the stars are (a clear dark sky), behind everything that stands or floats in front of the sky
        if (M.au.x * U.skyP.w > 0.002) { col += aurora(d, M.au.y, M.au.z, M.au.w) * (M.au.x * U.skyP.w); }
        col += nbc * (M.p.x * skyL + M.p.y) * smoothstep(-0.01, 0.15, d.y) * smoothstep(0.04, mix(0.12, 0.26, U.sunDir.w), ang) * U.fx.z * M.nu.w;
        col += moonDisc(d);
        col += meteor(d);
        // high thin cloud in front of all that, and whatever is flying up there
        let ci: vec4f = cirrus(d, mu);
        col = col * (1.0 - ci.a) + ci.rgb;
        let ct: vec4f = contrail(d, mu);
        col = col * (1.0 - ct.a) + ct.rgb;
        // sun disc with limb darkening, and its glare: the air spreads the light well out from the disc, so the sky pales and whitens toward
        // the sun over a good twenty degrees (round the moon there is far less of it)
        let disc: f32 = smoothstep(0.0062, 0.0048, ang) * M.sd.w * smoothstep(-0.002, 0.003, d.y);
        col += M.sd.rgb * U.sunCol.w * disc * (0.55 + 0.45 * sqrt(saturate(1.0 - sq(ang / 0.0062))));
        col += U.sunCol.rgb * (0.9 * exp(-ang * 55.0) + 0.12 * exp(-ang * 9.0) + (0.20 * exp(-ang * 15.0) + M.pc.y * exp(-ang * 4.4)) * (0.2 + 0.8 * M.sd.w));
        // in heavy snow the overcast is drawn over all of that, the sun coming and going through its breaks (05b_weather.js)
        col = overcast(d, mu, col);
        // beyond the mountain, nearest last: ranges on the horizon, the cloud deck, the city standing in it
        col = farRanges(d, col);
        if (d.y < 0.0) { col = mix(col, cloudSea(d, mu, col), smoothstep(0.0, -0.006, d.y)); }
        { let cb: vec3f = col; col = mix(cityLayer(d, col), cb, M.wf.w); }      // (behind heavy snow only a shape of it: 05b_weather.js)
        // ...and nearer than all of it, a bolt of lightning
        col += bolt(d);
        o.color = vec4f(col, 0.0); return o; }`,
    });
    S.pipes = [pipeLut, pipeSky];
  };
  const dirOf = el => { const ce = Math.cos(el); return [Math.sin(S.az) * ce, Math.sin(el), -Math.cos(S.az) * ce]; };
  // the light everything is lit by: the sun, or the moon once the sun is well down. Azimuth is measured from -z toward +x
  S.sunDir = function () { return dirOf(S.elev); };
  S.trueSun = function () { return dirOf(S.sunElev); };
  S.moonDir = function () { return dirOf(S.moonElev); };
  // ---- the moon's journey. It keeps the sun's bearing (everything the key light touches is built for that one bearing: the snow's own small
  // shadows, the far ranges, the city's shadows, the sky table that is mirrored about it), so it travels in height only: a young moon following
  // the sun down, from high over the valley at dusk to low over the far range by dawn. Where it hangs the stars sink at the same pace
  // (see stars() below), so the moon and the stars round it go down together.
  // Its height is one smooth wave of a phase. The phase moves with the day's clock; while the clock is held (a time of day chosen and kept, a
  // test) it moves with game time instead, so the moon is never nailed to the sky: it sinks to the low end, turns round softly and climbs again.
  // By day, unseen, it goes back to where the evening will find it. Sky.moonRate 0 makes it stand still under a held clock.
  // v is the old rate (a ten-minute day) scaled by 600/1440, so one of these longer days still carries the same fraction of the wave
  const MW = S.moonWay = { lo: 0.105, hi: 0.42, v: 1.0e-3 * 600 / 1440, k: 0.985, at: 0.27, drift: 0, t: null, clock: 0, lut: -9 };
  S.moonRate = 1;
  S.moonStep = function () {
    const A = 0.5 * (MW.hi - MW.lo), ak = Math.asin(MW.k), t = Render.time, dC = MW.t === null ? 0 : S.clock - MW.clock, dT = MW.t === null ? 0 : t - MW.t;
    MW.t = t; MW.clock = S.clock;
    // (a clock wound by hand, far faster than time runs, takes the moon to where that hour has it: what the held hours added melts away with
    // the distance wound, the same at any frame rate, so the moon glides there with the hours and never jumps)
    if (S.sunElev > 0.115) MW.drift = 0; else if (Math.abs(dC) > 3 * Math.abs(dT)) MW.drift *= Math.exp(-Math.abs(dC) / 30); else if (dC === 0) MW.drift += dT * S.moonRate * (S.cycle / 600);
    // `at` is its height at nightfall (Sky.times.night), on the way down; in between the wave is all but a straight line of slope v.
    // The wave is folded at the high afternoon (Sky.times.day), while the moon is lost in the glare, so that seam is never seen.
    const ph0 = PI - Math.asin(Math.sin(ak * (MW.at - MW.lo - A) / A) / MW.k), cyc = S.cycle, seam = S.times.day;
    const c = ((S.clock - seam) % cyc + cyc) % cyc, night0 = ((S.times.night - seam) % cyc + cyc) % cyc;
    S.moonElev = MW.lo + A + A * Math.asin(MW.k * Math.sin(ph0 + (c - night0 + MW.drift) * MW.v * ak / (A * MW.k))) / ak;
    // what it lights follows: its direction every frame, the colours of its light in steps too small to see (as the sun's do), the sky's
    // table when it has gone a little further
    if (S.isMoon) S.elev = S.moonElev;
    if (S.sunElev < 0.06 && Math.abs(S.moonElev - S.lightMoon) > 0.0004) S.lightElev = undefined;
    if (S.moonSky > 1e-5 && Math.abs(S.moonElev - MW.lut) > 0.002) { MW.lut = S.moonElev; S.lutSun = -99; }
  };
  const lum3 = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // moonlight as film shows it: silver-blue
  const MT = [0.635, 0.795, 1.128], NIGHT = [0.0041, 0.0052, 0.0087];
  // light colours derived from the same atmosphere the LUT is baked from
  S.computeLight = function () {
    const e = S.sunElev, sun = dirOf(e), k = S.E / PI, tr = Atmo.transmit(S.alt, sun), irr = Atmo.irradiance(sun, S.alt);
    if (!S.moonT) { const md = S.moonDir(); S.moonT = Atmo.transmit(S.alt, md); S.moonIrr = Atmo.irradiance(md, S.alt); }
    S.night = smooth(0.0, -0.17, e); S.lights = smooth(0.035, -0.09, e); S.stars = smooth(-0.03, -0.16, e); S.moonVis = smooth(0.11, -0.03, e); S.milk = smooth(0.03, 0.22, e);
    S.nebNightK = smooth(0.02, -0.17, e);
    S.lampK = smooth(-0.015, -0.085, e);                          // the skier's headlamp comes on at dusk
    // the far ranges stand in front of the sun for the last of its descent: the disc goes behind their skyline
    const vis = smooth(S.skyline - 0.0075, S.skyline + 0.0075, e);
    // the moon was there all along, a thin crescent lost in the glare; it takes over as the key light when the sun is well under
    S.isMoon = e < -0.05; S.elev = S.isMoon ? S.moonElev : e;
    S.moonSky = S.moonK * smooth(0.05, -0.12, e);                 // its share of the sky's own light (in the LUT and the ambient)
    const mk = S.moonK * smooth(-0.05, -0.15, e), moon = S.moonT.map((c, i) => c * k * mk * MT[i]);
    S.disc = tr.map(c => c * k);
    S.sunCol = S.isMoon ? moon : tr.map(c => c * k * vis);
    // what stands higher keeps the sun longer: the far summits and the cumulus (alpenglow), and higher still the cirrus and the contrails
    const gone = smooth(-0.05, -0.022, e);
    S.sunFar = S.isMoon ? moon : Atmo.transmit(S.alt + 900, sun).map(c => c * k * gone);
    S.sunHi = S.isMoon ? moon : Atmo.transmit(S.alt + S.hiAlt, sun).map(c => c * k * gone);
    S.ambSky = irr.map((c, i) => c * k + S.moonIrr[i] * k * S.moonSky * MT[i] + NIGHT[i] * S.night);
    // (the moonlit air is as blue as the sunlit one, but far too dim for the eye to see it so: by night the fill light is pulled a third of the way to grey)
    { const g = lum3(S.ambSky), q = S.nightGrey * S.night; S.ambSky = S.ambSky.map(c => c + (g - c) * q); }
    // light bounced up from surrounding snow
    const up = Math.max(0, Math.sin(S.elev));
    S.ambGnd = [0, 1, 2].map(c => 0.5 * (S.sunCol[c] * (up * 0.9 + 0.2 * smooth(-0.05, 0.15, Math.sin(S.elev))) + S.ambSky[c] * 0.8));
    // the band of bright sky low on the sun's bearing: after sunset it is what lights the slope that faces it
    { const a = Atmo.scatter(dirOf(0.02), sun, S.alt), b = Atmo.scatter(dirOf(0.06), sun, S.alt); S.twi = [0, 1, 2].map(c => (a[c] + b[c]) * 0.5 * S.E * S.twiK); }
    // the sky opposite the sun (ANTISOLAR_SSL): how bright the air is there 8 degrees up, where the earth's shadow stands, how strong the
    // pink band over it and the blue band of the shadow itself are. The band shows from the last minutes of the sun on the skyline until the
    // shadow has climbed into it and the sky has gone dark
    { const ce = Math.cos(0.14), a8 = [-Math.sin(S.az) * ce, Math.sin(0.14), Math.cos(S.az) * ce];
      S.anti = [-2.2 * e - 0.02, smooth(0.115, 0.035, e) * smooth(-0.14, -0.045, e), smooth(0.02, -0.025, e) * smooth(-0.22, -0.11, e), lum3(Atmo.scatter(a8, sun, S.alt)) + 0.004]; }
    // the lens opens as the light goes, but not all the way: dusk should feel like dusk
    const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], L = lum(S.sunCol) * 0.33 + lum(S.ambSky) * 1.9 + lum(S.twi) * 0.5;
    S.sceneL = L; S.exposure = clamp(S.expDay * Math.pow(S.keyL / L, S.expGamma), S.expDay, 2.6);
    // ...and with the sun on the skyline it is stopped down for the sky: the glow holds the picture and the land goes toward silhouette
    S.exposure *= 1 - S.sunsetStop * smooth(0.10, 0.05, e) * smooth(-0.07, -0.02, e);
    // ...and night is shown as night: the moonlit snow sits well under middle grey, so the pool of the headlamp and the lights of the city carry the picture
    S.exposure *= 1 - S.nightStop * S.night;
    // ...and a graduated filter holds the sky back while it does, as a photographer's would at dusk: the air's own light (sky, haze) is shown a
    // little darker than the land it hangs over, so the blue stays deep and the afterglow keeps its colour
    S.nd = Math.pow(S.expDay / S.exposure, S.ndGamma);
  };
  S.sunsetStop = 0.30; S.nightStop = 0.20; S.nightGrey = 0.36; S.twiK = 0.5; S.expDay = 0.145; S.keyL = 2.46; S.expGamma = 0.65; S.ndGamma = 0.42;
  // call before the frame's globals are built: refreshes light colours when the sun has moved
  S.update = function () { S.moonStep(); if (S.lightElev === undefined || Math.abs(S.lightElev - S.sunElev) > 0.0004 || S.lightAz !== S.az) { S.lightElev = S.sunElev; S.lightAz = S.az; S.moonT = S.lightMoon === S.moonElev ? S.moonT : null; S.lightMoon = S.moonElev; S.computeLight(); } };
  S.bakeLut = function () {
    if (Math.abs(S.lutSun - S.sunElev) < 0.002 && Math.abs(S.lutMoon - S.moonSky) < 0.0006) return false;
    S.lutSun = S.sunElev; S.lutMoon = S.moonSky;
    gfx.beginPass(lutTarget, { color: [0, 0, 0, 1] });
    gfx.draw(pipeLut, { u: { p: [S.sunElev, S.alt, S.moonElev, 0], q: [MT[0] * S.moonSky, MT[1] * S.moonSky, MT[2] * S.moonSky, S.moonSky > 1e-5 ? 1 : 0] }, count: 3 });
    gfx.endPass();
    return true;
  };

  // ---- an airliner now and then: straight and level far above, minutes apart, on its own business. It trails only while it crosses a
  // layer of damp air (half a minute of its flight); the trail it has laid thins away behind it within another minute. (It is nearer and
  // quicker than a real one would be: at true airliner pace it hung beside the same cloud for minutes and read as a scratch on the sky.)
  const PL = S.plane = { on: false, next: 55, x: 0, z: 0, hx: 1, hz: 0, v: 250, t0: 0, n: 0, len: 0, wet: 90, cut: 0 };
  S.updatePlane = function (t, dt, cam, fwd) {
    if (!PL.on) {
      if (t < PL.next || S.planes === false) return;
      // it crosses ahead of the mountain, 30-46 km off, from one side to the other on a slightly slanting course
      const rnd = RNG(7001 + PL.n * 131), side = PL.n % 2 ? 1 : -1, D = 30000 + 16000 * rnd(), a0 = Math.atan2(fwd[0], -fwd[2]) * 0.5 + (rnd() - 0.5) * 0.3, th = (rnd() - 0.5) * 0.7;
      const cx = cam[0] + D * Math.sin(a0), cz = cam[2] - D * Math.cos(a0);
      PL.hx = -side * Math.cos(th); PL.hz = Math.sin(th);
      PL.v = 330 + 50 * rnd(); PL.wet = 26 + 12 * rnd();
      // the damp layer starts well to one side of the valley, so the trail is drawn across the view
      const back = 9000 + D * 0.32;
      PL.x = cx - PL.hx * back; PL.z = cz - PL.hz * back; PL.t0 = t; PL.len = 60; PL.cut = 0; PL.on = true; PL.n++;
    }
    const age = t - PL.t0;
    PL.x += PL.hx * PL.v * dt; PL.z += PL.hz * PL.v * dt; PL.len = Math.min(PL.len + PL.v * dt, 60000);
    if (age > PL.wet) PL.cut += PL.v * dt;                       // out of the damp air: no new trail behind the aircraft
    // gone when what it laid has thinned away
    if (age > PL.wet + 62) { PL.on = false; PL.next = t + 240 + 160 * hashU(PL.n * 977) * U2F; }
  };

  S.nebDay = 0.55; S.nebNight = 0.33; S.nebSat = 0.45; S.polar = 0.34; S.glare = 0.075;
  // how strong the nebula is, for the owner to choose: by day its pale ghost on the blue (kept on purpose, but at 0.55 it reads as a burst of
  // cirrus gone wrong: real cirrus lies in parallel streaks along the wind) and by night (it crowds the moon, the city and the clouds into one
  // corner). [day, night] multipliers on nebDay and nebNight
  const NebDayV = { a: 1, b: 0.27, c: 0 }, NebNightV = { a: 1, b: 0.65 };
  Variants.def('nebday', '白天星云', [['a', '现在的'], ['b', '很淡'], ['c', '没有']], 'a');
  Variants.def('nebnight', '夜空星云', [['a', '现在的'], ['b', '淡些']], 'a');
  Variants.def('moon', '夜里的月亮', [['a', '月牙'], ['b', '盈凸']], 'b');
  // the night's show (the owner: nebula and aurora together are too busy, "它们不能同时出现"): each night is a nebula night, an aurora night
  // or, now and then, a plain night of stars alone; never both. The pick is made per night (from the mountain's seed and which night it
  // is), so it changes only in the high afternoon, when the nebula is a pale ghost and the aurora is out anyway; the nebula then fades with the dusk on
  // an aurora night, and the aurora only comes up with the stars, so the two never share the sky even for a moment.
  // a = they take turns night by night, b = by chance (nebula 45%, aurora 35%, stars alone 20%), c = no aurora (the nebula every night)
  Variants.def('aurora', '极光', [['a', '和星云轮流'], ['b', '随机'], ['c', '关']], 'b');
  S.auroraK = 0.35;
  S.show = function () {
    const v = Variants.val.aurora; if (v === 'c') return 'nebula';
    const n = Math.floor((S.clock - S.times.day) / S.cycle), sd = typeof Course !== 'undefined' ? Course.seed % 9973 : 0;
    const h = (k) => { const q = Math.sin(k * 127.1 + 311.7) * 43758.5453; return q - Math.floor(q); };
    if (v === 'a') return ((n + sd) & 1) ? 'aurora' : 'nebula';
    const r = h(n * 1.618 + sd * 0.731);
    if (n === 0) return r < 0.55 ? 'nebula' : 'aurora';          // the first night always shows something
    return r < 0.45 ? 'nebula' : r < 0.80 ? 'aurora' : 'none';
  };
  // the nebula's share of the sky: all of it by day; at night only on a nebula night
  S.nebShow = function () { return S.show() === 'nebula' ? 1 : 1 - S.nebNightK; };
  // the aurora's strength breathes slowly; the curtain drifts along the sky and its rays shimmer. How bright it is at all is S.auroraK
  S.aurora = function (t) {
    if (S.show() !== 'aurora') return 0;
    const n = (x) => { const i = Math.floor(x), f = x - i, h = (k) => { const q = Math.sin(k * 127.1 + 311.7) * 43758.5453; return q - Math.floor(q); }; return lerp(h(i), h(i + 1), f * f * (3 - 2 * f)); };
    const breathe = 0.7 + 0.3 * n(t / 23) + 0.15 * Math.sin(t * 0.21);
    return S.auroraK * breathe;
  };
  S.draw = function () {
    Vista.updateShadow(); const b = Nebula.basis(), md = S.moonDir(), cam = Render.cam.pos;
    // strobes: two quick white flashes and a slow red beacon
    const ph = (Render.time * 0.9) % 1, strobe = (ph < 0.045 || (ph > 0.13 && ph < 0.175)) ? 1 : 0, beacon = Math.pow(Math.max(0, Math.sin(Render.time * 4.2)), 8);
    // (under the overcast the far summits lose the sun with everything else)
    const wx = typeof Weather !== 'undefined' ? Weather.sky : null, wk = wx && Weather.sunK != null ? Weather.sunK : 1;
    gfx.draw(pipeSky, { u: { au: [S.aurora(Render.time), 0.12, Render.time * 0.0035, Render.time], p: [S.nebDay * (NebDayV[Variants.val.nebday] ?? 1), S.nebNight * S.nebNightK * (NebNightV[Variants.val.nebnight] ?? 1), S.polar * lerp(0.5, 1, S.milk), lerp(1.0, S.nebSat, S.milk)], nr: b.nr, nu: [b.nu[0], b.nu[1], b.nu[2], b.nu[3] * S.nebShow()], nf: b.nf,
      sd: [S.disc[0], S.disc[1], S.disc[2], S.isMoon ? 0 : 1], mo: [md[0], md[1], md[2], S.moonVis], hi: [S.sunHi[0], S.sunHi[1], S.sunHi[2], S.night], fr: [S.sunFar[0] * wk, S.sunFar[1] * wk, S.sunFar[2] * wk, strobe + 0.5 * beacon],
      pa: PL.on ? [PL.x - cam[0], PL.z - cam[2], S.hiAlt, 1] : [0, 0, S.hiAlt, 0], pb: [PL.hx, PL.hz, PL.len, PL.v], pc: [PL.cut, S.glare, (Variants.val.moon === 'b' ? 1 : 0) * S.night, 0], cs: [Clouds.sea.f, Clouds.sea.oA, Clouds.sea.oB, 0], ab: S.anti, ns: [NSKY.step(Render.time)[0], NSKY.v[1], 0, 0],
      wa: wx ? wx.wa : [0, 0, 0, 0], wb: wx ? wx.wb : [0, 0, 0, 0], wc: wx ? wx.wc : [0, 0, 0, 0], wd: wx ? wx.wd : [0, 0, 0, 0], we: wx ? wx.we : [0, 0, 0, 0], wf: wx ? wx.wf : [0, 0, 0, 0], wg: wx ? wx.wg : [0, 0, 0, 0] },
      tex: { tSky: lutTex, tNebA: Nebula.texA, tNebB: Nebula.texB, tDetail: Tex.detail, tFarA: Vista.farA, tFarB: Vista.farB, tCityA: Vista.cityA, tCityB: Vista.cityB, tCitySh: Vista.shTex, tSeaA: Clouds.sea.A, tSeaB: Clouds.sea.B }, count: 3 });
  };
  return S;
})();

// ---- what the night adds: the stars (turning, and twinkling through the air), a shooting star now and then, and the moon (a young crescent
// with the rest of its disc faintly lit by the earth, and a halo of thin haze round it)
// the aurora: one green curtain hanging across the sky with a violet glow above it. Its lower edge is a wavy line a little above the
// horizon (b0, radians up); fine rays run up it, it is brighter in some stretches than others, and it drifts (sh) and shimmers (tm)
const AURORA_SSL = `
fn aurora(d: vec3f, b0: f32, sh: f32, tm: f32) -> vec3f {
  let e: f32 = d.y;
  if (e < -0.01) { return vec3f(0.0); }
  let a: f32 = atan2(d.z, d.x) + sh;
  let base: f32 = b0 + 0.09 * sin(a * 2.1 + 1.1) + 0.05 * sin(a * 4.9 + 0.4 + tm * 0.013) + 0.05 * (vnoise2(vec2f(a * 3.0, 1.7 + tm * 0.01)) - 0.5);
  let h: f32 = e - base;
  if (h < -0.04) { return vec3f(0.0); }
  let r: f32 = fbm2(vec2f(a * 46.0 + 4.0 * vnoise2(vec2f(a * 5.0, 2.0 + tm * 0.02)), 0.5 + h * 1.5 + tm * 0.05));
  let rays: f32 = 0.15 + 1.5 * pow(r, 3.0);
  let lower: f32 = smoothstep(-0.04, 0.004, h);
  let fall: f32 = exp(-max(h, 0.0) * 8.0);
  let tall: f32 = exp(-max(h, 0.0) * 1.6);
  let band: f32 = 0.25 + 0.75 * smoothstep(-0.5, 0.9, sin(a * 1.7 + 0.7)) * (0.6 + 0.8 * vnoise2(vec2f(a * 2.2, 5.3)));
  return (vec3f(0.10, 1.0, 0.42) * fall + vec3f(0.62, 0.16, 0.78) * (tall - fall) * 0.6) * lower * rays * band;
}`;
const NIGHT_SSL = `
// one star's own row of random numbers, read off at its own pace and smoothed from each to the next: an irregular flutter, never a sine
fn starFlick(t: f32, id: f32) -> f32 { let i: f32 = floor(t); let f: f32 = t - i; return mix(hash21(vec2f(i, id)), hash21(vec2f(i + 1.0, id)), f * f * (3.0 - 2.0 * f)); }
fn stars(dw: vec3f) -> vec3f {
  // the whole field turns about the heart of the nebula, which so keeps its place: anticlockwise as you face it (the way the northern sky
  // turns about its pole), once round in just under an hour. What stands to the left of it is going down, at the moon's pace where the moon hangs
  let ax: vec3f = M.nf.xyz; let ra: f32 = U.camPos.w * 0.00181; let rc: f32 = cos(ra); let rs: f32 = sin(ra);
  let d: vec3f = dw * rc + cross(ax, dw) * rs + ax * (dot(ax, dw) * (1.0 - rc));
  let p: vec3f = d * 150.0; let i: vec3f = floor(p); let h: vec3f = hash33(i + vec3f(31.0, 57.0, 11.0));
  // one star in a cell at most, kept clear of its walls (a star is drawn only by its own cell, and the walls would cut its glow square) and
  // close to the sphere the cells are cut from; most cells have none worth drawing
  let cr: vec3f = i + 0.30 + 0.40 * h; let rr: f32 = length(cr);
  if (abs(rr - 150.0) > 0.22) { return vec3f(0.0); }
  let c: vec3f = cr / rr;
  let h2: vec3f = hash33(i + vec3f(7.0, 3.0, 91.0));
  let mag: f32 = h2.x * h2.x; let b: f32 = mag * mag * mag * mag;         // a few bright ones, a great many faint
  if (b < 0.42) { return vec3f(0.0); }
  let s: f32 = (b - 0.42) / 0.58;
  let planet: f32 = step(0.9965, s);                                       // the very brightest few are planets
  let px: f32 = 2.0 * U.camRight.w * U.res.w;                              // one pixel, in radians
  // (never much smaller than a pixel: the field moves now, and a finer point would flash as it crossed from one pixel to the next)
  let sz: f32 = px * (0.68 + 0.44 * s * s + 0.2 * planet);
  let a: vec3f = d - c; let g: f32 = exp(-dot(a, a) / (sz * sz));
  if (g < 0.004) { return vec3f(0.0); }
  // ---- they twinkle because of the air in between. Overhead the light crosses one thickness of it and arrives nearly calm; toward the
  // horizon it crosses many (am), and each star flutters at its own pace: a quick irregular flicker of several hertz riding on slower swells,
  // steeper the lower it stands. The air bends blue more than red, so for a bright star low down the colours arrive a moment apart and it
  // flashes faintly red and blue. A planet is a disc, not a point: its flutter averages out and it shines steadily.
  let am: f32 = 1.0 / (max(dw.y, 0.0) + 0.025);
  let tq: f32 = 1.0 - exp((1.0 - am) * 0.25);
  let tt: f32 = U.camPos.w - 512.0 * floor(U.camPos.w / 512.0); let id: f32 = floor(h2.z * 4096.0);
  let t1: f32 = tt * (7.5 + 6.0 * h.y) + h.x * 97.0;
  let dl: f32 = 0.07 * tq * tq * smoothstep(0.25, 0.70, s) * (1.0 - planet);
  let slow: f32 = starFlick(tt * (1.3 + 1.6 * h2.y) + h.z * 53.0, id + 4096.0) - 0.5;
  let fl: vec3f = vec3f(starFlick(t1 - dl, id), starFlick(t1, id), starFlick(t1 + dl, id)) - 0.5;
  let amp: f32 = mix(0.06, 2.0, tq) * (0.6 + 0.4 * smoothstep(0.0, 0.3, s)) * mix(1.0, 0.12, planet);
  // (log-normal, as the real thing is: brief flashes well above the mean, longer spells below it; the last term keeps the mean where it was)
  let tw: vec3f = min(exp((fl * 1.5 + slow) * amp - 0.09 * amp * amp), vec3f(4.0));
  let tint: vec3f = mix(mix(vec3f(1.0, 0.80, 0.62), vec3f(0.70, 0.84, 1.0), smoothstep(0.15, 0.75, h2.y)), vec3f(1.0, 0.93, 0.80), planet);
  return tint * tw * (g * (0.018 + 0.08 * s + 1.3 * s * s * s * s) * (1.0 + 0.7 * planet));
}
// ---- a shooting star now and then. The night is cut into spans of eight seconds, and in one span out of seven a grain of dust comes in over
// the valley ahead: a head that kindles, brightens as it falls and flares just before it goes out, and the trail it leaves, which cools from
// white to ember and outlives it by a second. All of it follows from the number of the span, so nothing is remembered between frames.
fn meteorLight(u: f32) -> f32 { return smoothstep(0.0, 0.15, u) * (0.45 + 0.55 * smoothstep(0.2, 0.8, u) + 0.9 * exp(-sq((u - 0.88) / 0.06))) * smoothstep(1.0, 0.96, u); }
fn meteor(d: vec3f) -> vec3f {
  let tm: f32 = U.camPos.w; let sl: f32 = floor(tm / 8.0); let n: u32 = u32(i32(sl)) * 3u;
  let h: vec3f = hashu3(n + 77u);
  if (U.skyP.w < 0.25 || h.x > 0.14) { return vec3f(0.0); }
  let g: vec3f = hashu3(n + 78u); let k: vec3f = hashu3(n + 79u);
  let dur: f32 = 0.5 + 0.6 * g.x; let age: f32 = tm - sl * 8.0 - 5.3 * g.y;
  if (age < 0.0 || age > dur + 1.2) { return vec3f(0.0); }
  // E: where it goes out. hd: which way it was heading there (downward, on a slant to one side or the other)
  let az: f32 = (h.y * 2.0 - 1.0) * 0.8; let el: f32 = 0.10 + 0.16 * h.z; let ce: f32 = cos(el);
  let E: vec3f = vec3f(sin(az) * ce, sin(el), -cos(az) * ce); let rt: vec3f = vec3f(cos(az), 0.0, sin(az)); let th: f32 = (g.z * 2.0 - 1.0) * 1.05;
  let hd: vec3f = rt * sin(th) - cross(rt, E) * cos(th);
  let w: f32 = 0.26 + 0.16 * k.x; let L: f32 = w * dur;                     // its speed across the sky (rad/s), and so the length of its path
  let x: f32 = atan2(dot(d, hd), dot(d, E)); let y: f32 = dot(d, cross(E, hd));   // along the path (0 where it goes out), and off to the side of it
  let xh: f32 = min(age, dur) * w - L;                                      // where the head is
  if (x > xh + 0.012 || x < -L - 0.012 || abs(y) > 0.012) { return vec3f(0.0); }
  let px: f32 = 2.0 * U.camRight.w * U.res.w; let wd: f32 = max(0.8 * px, 0.0007);
  let since: f32 = max(age - (x + L) / w, 0.0);                             // how long since the head went by this place
  let tr: f32 = meteorLight(saturate((x + L) / L)) * (0.8 * exp(-since / 0.14) + 0.2 * exp(-since / 0.5)) * exp(-sq(y / wd)) * smoothstep(xh + 0.6 * wd, xh - 0.6 * wd, x);
  let hb: f32 = meteorLight(min(age / dur, 1.0)) * exp(-(sq(x - xh) + y * y) / sq(1.7 * wd));
  let col: vec3f = vec3f(0.85, 1.0, 0.95) * (hb * 4.0) + mix(vec3f(0.70, 0.95, 1.0), vec3f(1.0, 0.62, 0.36), saturate(since / 0.45)) * (tr * 1.6);
  return col * ((0.7 + 0.6 * k.y) * U.skyP.w * smoothstep(0.04, 0.10, d.y));
}
fn moonDisc(d: vec3f) -> vec3f {
  let md: vec3f = M.mo.xyz; let RM: f32 = 0.019;
  let c: f32 = dot(d, md);
  if (M.mo.w <= 0.001 || c < 0.9854) { return vec3f(0.0); }
  let mr: vec3f = normalize(cross(md, vec3f(0.0, 1.0, 0.0))); let mup: vec3f = cross(mr, md);
  let q: vec2f = vec2f(dot(d, mr), dot(d, mup)) / RM; let r2: f32 = dot(q, q); let r: f32 = sqrt(r2);
  let px: f32 = 2.0 * U.camRight.w * U.res.w / RM;
  let edge: f32 = smoothstep(1.0 + px, 1.0 - px, r);
  // ---- its halo. Thin haze drifts across it on two winds (a layer of wisps, a broader one behind: both read from the shared noise where
  // the line of sight meets them, so the moon also travels through them); the haze scatters a soft aureole close round the disc and, further
  // out, one faint ring, bluish within and rusty at its rim. Both swell and fade as the haze thickens and thins: the halo breathes.
  let tm: f32 = U.camPos.w; let hp: vec2f = d.xz / (d.y + 0.30);
  let hv: f32 = 0.45 * texLod(tDetail, hp * 1.3 + tm * vec2f(0.0052, 0.0019), 3.0).z + 0.55 * texLod(tDetail, hp * 0.45 + vec2f(0.37, 0.81) + tm * vec2f(-0.0041, 0.0046), 4.0).z;
  let hz: f32 = clamp(1.0 + 2.6 * (hv - 0.47), 0.35, 1.8);                  // how much haze, against the usual
  let ro: f32 = max(r - 1.0, 0.0);
  var col: vec3f = vec3f(0.62, 0.77, 1.0) * (hz * (0.10 * exp(-ro / (0.5 + 0.45 * hz)) + 0.028 * exp(-ro / (2.0 + hz))));
  col += mix(vec3f(0.60, 0.80, 1.0), vec3f(1.0, 0.66, 0.42), smoothstep(3.8, 5.1, r)) * (0.006 * hz * exp(-sq((r - 4.4) / 0.7)));
  col *= smoothstep(9.0, 6.0, r);
  if (edge > 0.0) {
    let z: f32 = sqrt(max(1.0 - r2, 0.0)); let n: vec3f = vec3f(q.x, q.y, z);
    // the sun is below and beyond it: only the lower limb is lit
    // (by night the moon has swung round, away from the sun far below: it is gibbous and lights the snow as such; at sunset still a crescent)
    let lit: f32 = smoothstep(-0.02, 0.10, dot(n, normalize(mix(vec3f(0.10, -0.80, -0.59), vec3f(0.18, -0.62, 0.76), M.pc.z))));
    let seas: f32 = texLod(tDetail, q * 0.11 + vec2f(0.31, 0.72), 0.0).z; let fine: f32 = texLod(tDetail, q * 0.45 + vec2f(0.6, 0.1), 0.0).w;
    let alb: f32 = (0.55 + 0.45 * smoothstep(0.35, 0.60, seas)) * (0.85 + 0.3 * fine);
    col += (vec3f(1.0, 0.96, 0.88) * (lit * 11.0 * (0.55 + 0.45 * z)) + vec3f(0.50, 0.62, 0.90) * 0.085) * (alb * edge * (1.06 - 0.06 * hz));
  }
  return col * M.mo.w;
}
`;

// ---- an airliner at cruise height and the trail of ice it draws: M.pa = where it is from the eye (x, z, height above the eye, on/off),
// M.pb = (heading x, z, length of trail laid so far, speed), M.hi = the light up there (it keeps the sun after the mountain has lost it)
const CONTRAIL_SSL = `
fn contrail(d: vec3f, mu: f32) -> vec4f {
  if (M.pa.w <= 0.0 || d.y < 0.012) { return vec4f(0.0); }
  // the trail is a round tube of ice, not a ribbon lying flat: what counts is how near the line of sight passes to its axis
  let u: vec3f = vec3f(M.pb.x, 0.0, M.pb.y); let P0: vec3f = vec3f(M.pa.x, M.pa.z, M.pa.y);
  let bq: f32 = dot(d, u); let den: f32 = max(1.0 - bq * bq, 1e-4);
  let dq: f32 = -dot(d, P0); let eq: f32 = -dot(u, P0);
  let rng: f32 = max((bq * eq - dq) / den, 1.0);                           // how far along the line of sight
  let along: f32 = -(eq - bq * dq) / den;                                  // how far behind the aircraft (m)
  var across: f32 = -dot(P0, normalize(cross(d, u)));
  let px: f32 = rng * 2.0 * U.camRight.w * U.res.w;                        // what one pixel spans up there (m)
  let light: vec3f = M.hi.rgb * (0.55 + 3.0 * hg(mu, 0.72) + 0.5 * hg(mu, 0.2)) + U.ambSky.rgb * 0.6;
  var a: f32 = 0.0;
  if (along > 40.0 + M.pc.x && along < M.pb.z && abs(across) < 2500.0) {
    let age: f32 = along / M.pb.w;                                          // seconds since the aircraft was here
    // the wake rolls the trail into slow waves, and wind aloft shears it out of true
    let wob: vec4f = texLod(tDetail, vec2f(along / 9000.0, 0.37), 0.0);
    across += (wob.x - 0.5) * 2.6 * age + 12.0 * sin(along / 75.0 + wob.z * 6.0) * smoothstep(15.0, 80.0, age);
    // two engines' trails that spread and run together within seconds
    let sep: f32 = 15.0 * exp(-age / 9.0);
    // it spreads as it ages, in long uneven stretches (the air it was laid in is not the same everywhere)
    let n: vec4f = texLod(tDetail, vec2f(along / 26000.0, 0.81), 0.0);
    let w: f32 = (9.0 + 1.5 * age) * (0.7 + 0.6 * n.x);
    let we: f32 = max(w, 0.9 * px);
    let g: f32 = 0.5 * (exp(-sq((across - sep) / we)) + exp(-sq((across + sep) / we))) * (w / we) * mix(1.0, 2.0, exp(-age / 9.0));
    // the edges curl into the wake's slow lobes, and whole stretches thin away where the air is dry
    let lobe: f32 = texLod(tDetail, vec2f(along / 3400.0, across / max(we, 1.0) * 0.11 + 0.5), log2(max(px / 6.6, 1.0))).z;
    let brk: f32 = mix(1.0, (0.25 + 1.25 * smoothstep(0.25, 0.70, n.z)) * (0.6 + 0.8 * lobe), smoothstep(20.0, 140.0, age));
    // looked at along its length there is more of it in the way
    a = (1.0 - exp(-1.5 * g * brk * exp(-age / 27.0) * smoothstep(40.0, 320.0, along - M.pc.x) * smoothstep(M.pb.z, M.pb.z * 0.72, along) / max(sqrt(den), 0.3)));
  }
  a *= smoothstep(0.012, 0.06, d.y);
  var c: vec3f = light * a;
  // the aircraft itself: a fleck of sunlit metal by day, its strobes after dark
  let rh: f32 = M.pa.z / d.y; let pxh: f32 = rh * 2.0 * U.camRight.w * U.res.w;
  let dr: f32 = length(d * rh - P0) / max(pxh * 0.9, 22.0);
  if (dr < 3.0) {
    let k: f32 = exp(-dr * dr) * min(1.0, 22.0 / (pxh * 0.9)) * smoothstep(0.012, 0.05, d.y);
    c += (M.hi.rgb * 2.6 + vec3f(1.0, 0.96, 0.9) * (M.fr.w * 30.0 * M.hi.w) + U.ambSky.rgb) * k;
  }
  return vec4f(c, a);
}
`;

// ---- the cloud sea: a floor of cloud far below, always the same distance away however long you descend.
// It is a real volume of droplets, ray-marched and lit in 13_clouds.js into a panorama round the eye (it never comes nearer, so the view of
// it only turns): R = light from the sun, G from the sky, B thrown up by the cloud around, A = how far off the cloud seen that way lies (km).
// A new panorama (a "key") is finished every couple of seconds, for the deck as it will then be; the frame shows the last two, each carried
// along by the wind to this very moment, and fades from one to the next: three fetches here, the march itself is spread over the frames.
// SEA: deck = how far below the eye its floor lies (m), top = how high cloud can stand above that; k, ta, tb = the panorama's layout
// (bearings packed closer down the valley than behind, rows closer toward the horizon); wind (m/s); K = seconds between keys; air = haze length (m)
const SEA = { deck: 950, top: 376, k: 0.75, ta: 0.40, tb: 0.90, wind: [28, 9], K: 1.5, air: 26000 };
const seaF = x => (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(6)));
const SEA_MAP_SSL = `
// where in the panorama a point lies: p = its horizontal offset from the eye, drop = how far below the eye (any unit, the same for both)
fn seaUV(p: vec2f, drop: f32) -> vec2f {
  let az: f32 = atan2(p.x, -p.y); let th: f32 = atan2(drop, length(p));
  var v: f32 = min(th / ${seaF(SEA.ta)}, 1.0);
  for (var i: i32 = 0; i < 4; i++) { let c: f32 = v * v * v; v -= (${seaF(SEA.ta)} * v + ${seaF(SEA.tb)} * c * v - th) / (${seaF(SEA.ta)} + ${seaF(4 * SEA.tb)} * c); }
  return vec2f(0.5 + (az + ${seaF(SEA.k)} * sin(az)) * 0.15915494, saturate(v));
}
// how far off (m) the cloud seen along d lies: for whatever else must lie on the deck or stand in it (the city's lights, its towers' feet).
// Needs this string in the pipeline's lib and the texture tSeaB bound to Clouds.sea.B
fn seaRange(d: vec3f) -> f32 { return texLod(tSeaB, seaUV(d.xz, max(-d.y, 1e-4)), 0.0).a * 1000.0; }
`;
const CLOUDSEA_SSL = SEA_MAP_SSL + `
fn cloudSea(d: vec3f, mu: f32, haze: vec3f) -> vec3f {
  let dy: f32 = max(-d.y, 1e-4); let f: f32 = M.cs.x; let w: vec2f = vec2f(${seaF(SEA.wind[0] * SEA.K)}, ${seaF(SEA.wind[1] * SEA.K)});
  // how far off the cloud seen this way lies, and so where it stands on the map
  let r0: f32 = seaRange(d);
  let p0: vec2f = d.xz * r0; let dr: f32 = dy * r0;
  // the last key and the next one, each moved to where the wind has carried it by now (or will have: the next one lies a little ahead in time)
  let a: vec4f = texLod(tSeaA, seaUV(p0 - w * M.cs.y, dr), 0.0);
  let b: vec4f = texLod(tSeaB, seaUV(p0 - w * M.cs.z, dr), 0.0);
  let k: vec4f = mix(a, b, f);
  let t: f32 = k.a * 1000.0; let pg: vec2f = d.xz * t;
  // the frame's own light on it; the city's towers lay their shadows across it
  var c: vec3f = (U.sunCol.rgb + U.twi.rgb * 0.8) * (k.r * (1.0 - 0.6 * cityShadow(pg))) + U.ambSky.rgb * k.g + U.ambGnd.rgb * k.b;
  // after dark the city lights the cloud it stands in (the one place where the deck takes light from a spot pg on the map, metres from the eye)
  c += vec3f(1.0, 0.60, 0.28) * (cityGlow(pg) * U.skyP.z * (0.30 + 0.70 * saturate(k.g * 0.45)));
  return mix(haze, c, exp(-t / ${seaF(SEA.air)}));
}
`;

// ---- high thin cloud: ice crystals combed out by the wind into long fibres. Returns (light scattered toward the eye, opacity).
const CIRRUS_SSL = `
fn cirrus(d: vec3f, mu: f32) -> vec4f {
  // a sheet far overhead, bent with the earth so it meets the horizon instead of running off to infinity
  let t: f32 = 1.0 / (max(d.y, 0.0) + 0.10);
  let p: vec2f = d.xz * t + vec2f(-U.skyP.y * 1.1, -U.skyP.y * 0.3);   // (minus: the sheet drifts with the wind below, toward +x)
  let ax: vec2f = vec2f(0.86, 0.50);
  let q: vec2f = vec2f(dot(p, ax), dot(p, vec2f(-ax.y, ax.x)));
  let wv: vec2f = tex(tDetail, q * vec2f(0.045, 0.09) + vec2f(0.21, 0.63)).xy - 0.5;
  let n1: f32 = tex(tDetail, vec2f(q.x * 0.022, q.y * 0.26) + wv * 0.055).z;
  let n2: f32 = tex(tDetail, vec2f(q.x * 0.075, q.y * 0.80) + wv * 0.10 + vec2f(0.37, 0.11)).z;
  let sw: f32 = smoothstep(-0.55, 0.75, mu);
  let cv: f32 = tex(tDetail, q * vec2f(0.012, 0.030) + vec2f(0.55, 0.20)).z;
  let cov: f32 = smoothstep(mix(0.36, 0.40, sw), mix(0.78, 0.60, sw), cv);
  // toward the sun it glows as a veil; away from it the same ice is only seen where it is thickest, so there it is drawn as fibres (combed
  // threads, sharper and sparser), never as a lid over the blue
  let fib: f32 = n1 * 0.62 + n2 * 0.38 + 0.10 * cov;
  let n3: f32 = tex(tDetail, vec2f(q.x * 0.16, q.y * 2.1) + wv * 0.16 + vec2f(0.71, 0.43)).z;
  // (away from the sun every edge is soft at every scale: the fine streaks only modulate the veil, the veil fades in and out over a wide range)
  let thr: f32 = mix(mix(0.25, 1.0, smoothstep(0.30, 0.85, n3)), 1.0, sw);
  let a: f32 = cov * sq(smoothstep(mix(0.34, 0.36, sw), mix(0.86, 0.72, sw), fib)) * thr * smoothstep(0.015, 0.14, d.y) * U.cloudP.z * mix(0.30, 0.62, sw);
  // ice scatters the sunlight it is in toward the eye even opposite the sun (a weak back lobe): high up it keeps the sun after the land has
  // lost it, so at sundown the threads glow gold over the sun and pink over the band opposite. Little sky light, so it never reads grey
  let lit: vec3f = M.hi.rgb * (0.55 + 3.2 * hg(mu, 0.75) + 0.6 * hg(mu, 0.25) + (1.0 + 2.2 * M.ab.y) * hg(-mu, 0.35)) + U.ambSky.rgb * 0.45;
  // thin ice hides little of the sky behind it: it adds its own light and takes away only a part of what is behind (the alpha returned is
  // that part)
  return vec4f(lit * a, a * 0.45);
}
`;

// ---- the half of the sky opposite the sun. The table above is single scattering: away from the sun it is a deep blue that brightens only in
// the last few degrees over the horizon, which the mountain hides. Light scattered more than once (and the haze) carries that pale horizon a
// good way up, so it is spread up here. With the sun on the skyline the earth throws its shadow up into the air opposite: a slate-blue band
// on the horizon (rising as the sun sinks), and over it the Belt of Venus, air still lit by the reddened last sun, a pink band low over it
// fading into the blue. M.ab: (height of the shadow's edge rad, band strength, shadow strength, the table's light there before exposure)
const ANTISOLAR_SSL = `
fn antiSolar(d: vec3f, c0: vec3f) -> vec3f {
  var col: vec3f = c0;
  let dh: vec2f = normalize(d.xz + vec2f(1e-5, 0.0)); let sh: vec2f = normalize(U.sunDir.xz + vec2f(1e-5, 0.0));
  let ca: f32 = dot(dh, sh);
  let w: f32 = smoothstep(0.35, -0.85, ca);                     // how far round from the sun (1 opposite it)
  let el: f32 = asin(clamp(d.y, -1.0, 1.0));
  // the pale horizon, carried up
  let hzc: vec3f = skyLut0(vec3f(d.x, 0.035, d.z));
  // (toward a pale clean blue of the horizon's brightness: the table's own horizon is a greenish white, which mixed into the blue reads teal)
  let hzb: vec3f = vec3f(0.80, 0.92, 1.12) * luma(hzc);
  col = mix(col, max(hzb, col), pow(smoothstep(1.2, 0.0, el), 1.4) * mix(0.22, 0.66, w));
  let L: f32 = M.ab.w * U.skyP.x;
  // the earth's shadow: slate blue below its soft edge
  let r: f32 = el - M.ab.x;
  let shd: f32 = smoothstep(0.035, -0.012, r) * M.ab.z * w;
  col = mix(col, vec3f(0.56, 0.68, 1.06) * (L * 0.62), shd);
  // the Belt of Venus over it, densest a few degrees above the edge, melting into the blue by 20 degrees
  let bel: f32 = smoothstep(-0.015, 0.07, r) * exp(-max(r - 0.08, 0.0) / 0.45) * M.ab.y * 0.8 * w;
  col = mix(col, vec3f(1.34, 0.78, 0.92) * (L * 2.4), bel);
  return col;
}
`;
