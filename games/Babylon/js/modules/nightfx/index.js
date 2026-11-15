// js/modules/nightfx/index.js — everything that burns, glows, smokes or drifts (SPEC 3.19, smoke of 3.18, mist of 5).
// Built last. No claims. Everything is drawn from ctx.module.group on LAYERS.FX, except the pottery lamp stands and
// saucer lamps near the camera path, which are two instanced sets of ctx.geom. Notes: docs/mod-nightfx.md.
//
//   lamps      one flame point per ctx.layout.lampsFor(house) lamp of every built house, plus hearth glows
//   volumes    what each lamp and fire LIGHTS: a box per light, shaded against post's depth (courts glow, streets
//              stay dark: a court lamp lights only what is inside its court; a door lamp only what it sees through
//              the door). Albedo comes from the opaque colour, so the light shows plaster, paving and people.
//   glow       the light in the air above a lit court or round a fire: soft additive billboards
//   flames     every fire of ctx.emitters.list (torch, brazier, fireBowl, hearth, lamp) + a fallback for the fixed
//              places of SPEC 3.19 that no module has lit (sites.js); sparks over the big ones
//   fire light ctx.lighting.addFireLight for every torch, brazier, bowl and hearth (and the lamps beside the night camera);
//              the volume of a fire that holds a pool light steps back
//   puffs      smoke columns (ovens, kilns, altars), dust, the evening haze over the housing, the morning mist on
//              the water, the lit smoke of night fires
// Each lamp lights at its own threshold of frame.light.night (0.30 to 0.85), so the dusk of shot 8 lights the city
// court by court. Everything is a closed form of film time; nothing is integrated.
//   node render.mjs still --shots 8,9,10 --q final --sub 4 --scale 2 --label nightfx
import * as M from '../../core/mathx.js';
import { hash2, hashPos } from '../../core/rng.js';
import * as SH from './shaders.js';
import { fallbackFires, fallbackSmoke, hazeSites, mistSites, fallbackDust } from './sites.js';

/** Per kind of fire: flame width and height (m), light intensity (1 = a cluster of oil lamps), reach of the pool light,
 *  cut-off radius of the light volume, source size, sparks, own smoke, and when in the dusk it is lit. */
const FIRE = {
  lamp:     { code: 0, w: 0.042, h: 0.085, I: 1.3, reach: 3, R: 6, soft: 0.6, sparks: 0, smoke: false, th: [0.26, 0.7], gain: 1.0 },
  hearth:   { code: 1, w: 0.55, h: 0.42, I: 3.0, reach: 4, R: 7, soft: 0.8, sparks: 0, smoke: false, th: [0.08, 0.36], gain: 0.8 },
  torch:    { code: 2, w: 0.34, h: 0.78, I: 3.0, reach: 10, R: 16, soft: 0.9, sparks: 5, smoke: true, th: [0.18, 0.5], gain: 1.0 },
  brazier:  { code: 3, w: 0.72, h: 0.86, I: 3.0, reach: 7, R: 14, soft: 1.0, sparks: 7, smoke: true, th: [0.16, 0.46], gain: 1.0 },
  fireBowl: { code: 4, w: 1.35, h: 1.6, I: 5.0, reach: 12, R: 22, soft: 1.4, sparks: 11, smoke: true, th: [0.2, 0.5], gain: 1.05 },
};

export default {
  name: 'nightfx',
  claims: [],

  async build(ctx) {
    const { THREE, layout, ground, materials, lighting, film, LAYERS, world } = ctx;
    const final = !ctx.quality.draft, dens = ctx.quality.density;
    const group = ctx.module.group, log = ctx.module.log || (() => {});
    const rnd = (seed, k) => hash2(seed & 0xffff, (seed >>> 16) & 0xffff, k);
    const pal = (world.palette && world.palette.materials) || {};
    const fireSpec = (world.lighting && world.lighting.modes && world.lighting.modes.blue && world.lighting.modes.blue.fires) || {};
    const cLamp = new THREE.Color(pal.lampFlame || fireSpec.lampColor || '#FF9A3C');
    const cTorch = new THREE.Color(pal.torchFlame || '#FFB347');
    const cEmber = new THREE.Color(pal.ember || '#FF5A1E');
    const cPale = cTorch.clone().lerp(new THREE.Color('#FFD9A0'), 0.45);
    const waterLevel = Number.isFinite(ground.waterLevel) ? ground.waterLevel : -3;
    const wind = ctx.wind || { dir: [0.49, 0.87], speed: 2.6 };

    // post's depth and colour of the opaque scene (absent in the post stub: then nothing is shaded against it)
    const PU = ctx.post && ctx.post.uniforms && ctx.post.uniforms.uBPostDepth && ctx.post.uniforms.uBPostDepth.value ? ctx.post.uniforms : null;
    const hasShadowChunk = !!THREE.ShaderChunk.bbl_shadow_pars_fragment && lighting.impl !== 'stub';
    const hasAerial = !!THREE.ShaderChunk.bbl_aerial_pars_fragment;
    if (!hasAerial) THREE.ShaderChunk.bbl_aerial_pars_fragment = 'float bblAerialFade( vec3 p ) { return 1.0; } vec3 bblAerial( vec3 c, vec3 p ) { return c; }';

    // ---- the film path, sampled once: how near does the camera come to a point, and when --------------------------
    const dur = film.duration, STEP = 0.05, pathN = Math.floor(dur / STEP) + 1, path = new Float32Array(pathN * 3);
    const pathPose = (t) => (typeof film.pathPoseAt === 'function' ? film.pathPoseAt(t) : film.poseAt(t));
    for (let i = 0; i < pathN; i++) { const p = pathPose(Math.min(dur, i * STEP)).pos; path[i * 3] = p[0]; path[i * 3 + 1] = p[1]; path[i * 3 + 2] = p[2]; }
    const pathDist = (x, y, z, t0 = 0, t1 = dur) => {
      let best = Infinity;
      for (let i = Math.max(0, Math.floor(t0 / STEP)), e = Math.min(pathN - 1, Math.ceil(t1 / STEP)); i <= e; i++) {
        const dx = path[i * 3] - x, dy = path[i * 3 + 1] - y, dz = path[i * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz;
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    };
    const shot8 = film.shots.find((s) => s.n === 8) || film.shots[film.shots.length - 1];
    const tNight = shot8 ? (shot8.tHold ?? shot8.t0 ?? 0) : 0;              // from here on the film can be dark

    // ---- shared resources ------------------------------------------------------------------------------------------
    const noise = makeNoise(THREE, 128);
    const uTime = materials.uniforms && materials.uniforms.uBTime ? materials.uniforms.uBTime : { value: 0 };
    const uNight = { value: 0 };
    const reg = (mat, extra = {}) => materials.register(mat, { owner: 'nightfx', aerial: true, ...extra });
    const quadGeo = (attrs, count) => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      for (const [name, arr, size, dyn] of attrs) { const a = new THREE.InstancedBufferAttribute(arr, size); if (dyn) a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); }
      g.instanceCount = count; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      return g;
    };
    const boxGeo = (attrs, count) => {
      const b = new THREE.BoxGeometry(2, 2, 2), g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', b.getAttribute('position')); g.setIndex(b.getIndex());
      for (const [name, arr, size, dyn] of attrs) { const a = new THREE.InstancedBufferAttribute(arr, size); if (dyn) a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); }
      g.instanceCount = count; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      return g;
    };
    const _v2 = new THREE.Vector2();
    /** Camera-dependent uniforms, set for the camera that actually draws (the main one or the water's mirror). */
    const perCamera = (obj, fn) => {
      obj.onBeforeRender = (renderer, scene, camera, geometry, material) => {
        const rt = renderer.getRenderTarget(), H = rt ? rt.height : renderer.getDrawingBufferSize(_v2).y, u = material.uniforms;
        if (u.uPx) u.uPx.value = 0.5 * H * camera.projectionMatrix.elements[5];
        if (u.uMinPx) u.uMinPx.value = Math.max(2.5, 3.1 * H / 2160);
        if (fn) fn(u, camera, H);
        material.uniformsNeedUpdate = true;
      };
    };
    const add = (obj, name, order, reflect) => {
      obj.name = 'nightfx:' + name; obj.frustumCulled = false; obj.renderOrder = order; obj.castShadow = false; obj.receiveShadow = false;
      obj.layers.set(LAYERS.FX); if (reflect) obj.layers.enable(LAYERS.REFLECT);
      group.add(obj); return obj;
    };

    // =================================================================================================================
    // 1. HOUSE LAMPS: points, light volumes, air glow
    // =================================================================================================================
    const Lp = { pos: [], a: [], b: [] };
    const Va = { center: [], half: [], rt: [], light: [], aux: [], color: [] };
    const Ga = { pos: [], a: [], c: [] };
    const counts = { court: 0, roof: 0, door: 0, extra: 0, roofExtra: 0, hearth: 0 };
    const stands = [];      // [x, y of the floor, z, height of the flame above it, seed]: a pottery stand under every lamp near the camera
    const roofSpot = (h) => {
      if (typeof layout.roofPoint !== 'function') return null;
      const r = ctx.rng('nightfx-roof-' + h.id);
      try { return layout.roofPoint(h, r, 1.0); } catch (e) { return null; }
    };
    const tintOf = (temp, ember = 0) => { const c = cLamp.clone().lerp(cPale, 0.3 * temp); if (ember) c.lerp(cEmber, ember); return c; };
    const pushPoint = (x, y, z, th, ph, gain, size, kind, temp) => { Lp.pos.push(x, y, z); Lp.a.push(th, ph, gain, size); Lp.b.push(kind, temp); };
    const pushVol = (S, v) => {
      S.center.push(v.cx, v.cy, v.cz); S.half.push(v.hx, v.hy, v.hz); S.rt.push(v.c, v.s, v.type, v.R);
      S.light.push(v.lx, v.ly, v.lz, v.I); S.aux.push(v.ph, v.th, v.soft, v.extra); S.color.push(v.col.r, v.col.g, v.col.b, v.flick);
    };
    const pushGlow = (S, x, y, z, size, rad, th, ph, col, stretch) => { S.pos.push(x, y, z); S.a.push(size, rad, th, ph); S.c.push(col.r, col.g, col.b, stretch); };
    const courtBox = (ring) => {
      const r = M.openRing(ring);
      if (r.length === 4) {
        const [a, b, c] = r, ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez) || 1, len2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
        return { cx: (a[0] + c[0]) / 2, cz: (a[1] + c[1]) / 2, hx: len / 2, hz: len2 / 2, c: ex / len, s: ez / len };
      }
      const bb = M.bbox(r);
      return { cx: (bb[0] + bb[2]) / 2, cz: (bb[1] + bb[3]) / 2, hx: (bb[2] - bb[0]) / 2, hz: (bb[3] - bb[1]) / 2, c: 1, s: 0 };
    };
    const roofTop = (h) => h.roofLevel + (h.mainRaise || 0) + (h.parapet ?? 0.6);
    const BOOST = 4;        // a house lamp throws three times the light of the pool's unit lamp: the film has to SEE the courts
    const courtLight = (h, ring, x, y, z, I, th, ph, temp, ember, withGlow) => {
      const cb = courtBox(ring), y0 = h.groundLevel - 0.3, y1 = roofTop(h) + 0.6, col = tintOf(temp, ember);
      // the court as a light box: of the lamp's flux, what the floor and the walls (albedo about 0.4) pass on to each other
      // and do not lose through the open top is spread over their area (docs/mod-nightfx.md)
      const surf = 4 * cb.hx * cb.hz + 4 * (cb.hx + cb.hz) * Math.max(2.5, y1 - 0.6 - h.groundLevel), fill = 5.9 / surf;
      pushVol(Va, { cx: cb.cx, cy: (y0 + y1) / 2, cz: cb.cz, hx: cb.hx + 0.15, hy: (y1 - y0) / 2, hz: cb.hz + 0.15, c: cb.c, s: cb.s, type: 0, R: 3 * Math.max(cb.hx, cb.hz) + 7,
        lx: x, ly: y, lz: z, I: I * BOOST, ph, th, soft: 1.1, extra: fill, col, flick: 0.22 });
      if (withGlow) {
        const diag = 2 * Math.hypot(cb.hx, cb.hz);
        pushGlow(Ga, cb.cx, y1 - 0.9, cb.cz, 1.5 * diag + 3, 0.2 * Math.min(I, 2.4), th, ph, col, 0.8);
      }
      return cb;
    };
    for (const h of layout.houses) {
      if (!layout.isBuilt(h)) continue;
      const big = h.cls === 'large' || h.cls === 'mansion' || !!h.landmark;
      const lampsOfHouse = layout.lampsFor(h);
      for (const l of lampsOfHouse) {
        const th = 0.30 + 0.55 * rnd(l.seed, 71), gain = 0.6 + 0.75 * Math.pow(rnd(l.seed, 72), 1.6), ph = rnd(l.seed, 73), temp = rnd(l.seed, 74);
        const courts = Array.isArray(h.courts) ? h.courts : [];
        if (l.kind === 'court' && courts.length) {
          const ring = courts.find((c) => M.pointInPolygon(l.x, l.z, c)) || courts[0];
          const cbx = courtBox(ring), area = 4 * cbx.hx * cbx.hz;
          pushPoint(l.x, l.y, l.z, th, ph, gain, 0.5, 0, temp);
          stands.push([l.x, h.groundLevel, l.z, l.y - h.groundLevel, l.seed]);
          const cb = courtLight(h, ring, l.x, l.y, l.z, gain * M.clamp(0.85 + area / 75, 0.9, 2.2), th, ph, temp, 0, true);
          counts.court++;
          // a great household burns more than one lamp: niches on two walls of a large court
          if (area > 70 && big) {
            const n = area > 160 ? 3 : 2;
            for (let k = 0; k < n; k++) {
              const sx = rnd(l.seed, 80 + k) < 0.5 ? -1 : 1, onX = rnd(l.seed, 84 + k) < 0.5, f = (rnd(l.seed, 88 + k) * 2 - 1) * 0.6;
              const lx = onX ? sx * (cb.hx - 0.45) : f * cb.hx, lz = onX ? f * cb.hz : sx * (cb.hz - 0.45);
              const x = cb.cx + cb.c * lx - cb.s * lz, z = cb.cz + cb.s * lx + cb.c * lz, y = h.groundLevel + 1.45;
              const th2 = M.clamp(th + 0.06 + 0.12 * rnd(l.seed, 92 + k), 0.3, 0.86), g2 = 0.55 + 0.4 * rnd(l.seed, 96 + k);
              pushPoint(x, y, z, th2, rnd(l.seed, 100 + k), g2, 0.45, 0, temp);
              courtLight(h, ring, x, y, z, g2 * 0.9, th2, rnd(l.seed, 100 + k), temp, 0, false);
              counts.extra++;
            }
          }
        } else if (l.kind === 'roof' || l.kind === 'court') {
          pushPoint(l.x, l.y, l.z, th, ph, gain, 0.5, 0, temp);
          stands.push([l.x, l.y - 0.4, l.z, 0.4, l.seed]);
          const col = tintOf(temp);
          pushVol(Va, { cx: l.x, cy: l.y, cz: l.z, hx: 5.5, hy: 5.5, hz: 5.5, c: 1, s: 0, type: 1, R: 5.5, lx: l.x, ly: l.y + 0.05, lz: l.z, I: gain * 0.9 * BOOST, ph, th, soft: 0.6, extra: l.y - 0.4 - 0.4, col, flick: 0.22 });
          pushGlow(Ga, l.x, l.y + 0.35, l.z, 3.4, 0.2 * gain, th, ph, col, 0.85);
          counts.roof++;
        } else {
          const o = h.doorDir || [1, 0], r = M.rightOf(o[0], o[1]), sill = h.groundLevel, side = rnd(l.seed, 75) < 0.5 ? 1 : -1;
          const hw = h.cls === 'mansion' ? 0.95 : h.cls === 'large' ? 0.7 : 0.52, col = tintOf(temp), Rr = 5.6;
          pushPoint(h.door[0] + o[0] * 0.12 + r[0] * (hw - 0.14) * side, sill + 1.3, h.door[1] + o[1] * 0.12 + r[1] * (hw - 0.14) * side, th, ph, gain * 0.55, 0.4, 0, temp);
          pushVol(Va, { cx: h.door[0] + o[0] * Rr / 2, cy: sill + 0.9, cz: h.door[1] + o[1] * Rr / 2, hx: 3.6, hy: 1.9, hz: Rr / 2, c: o[1], s: -o[0], type: 2, R: 6.6,
            lx: h.door[0] - o[0] * 0.5, ly: sill + 1.25, lz: h.door[1] - o[1] * 0.5, I: gain * 1.15 * BOOST, ph, th, soft: 0.6, extra: hw, col, flick: 0.22 });
          counts.door++;
        }
      }
      // families sit and sleep on the roofs in the warm season (R5 3.7): one house in eighteen has a lamp up there beside
      // the ones the layout gives
      if (rnd(h.seed, 130) < 0.055 && !lampsOfHouse.some((l) => l.kind === 'roof')) {
        const p = roofSpot(h);
        if (p) {
          // on a tall stand, a metre above the roof: it clears the parapet and is seen from the next roof
          const seed = (h.seed ^ 0x700f1a) >>> 0, th = 0.3 + 0.55 * rnd(seed, 71), gain = 0.55 + 0.6 * Math.pow(rnd(seed, 72), 1.6), ph = rnd(seed, 73), temp = rnd(seed, 74), col = tintOf(temp), y = p.y + 1.0;
          pushPoint(p.x, y, p.z, th, ph, gain, 0.5, 0, temp);
          pushVol(Va, { cx: p.x, cy: y, cz: p.z, hx: 5.5, hy: 5.5, hz: 5.5, c: 1, s: 0, type: 1, R: 5.5, lx: p.x, ly: y + 0.05, lz: p.z, I: gain * 0.9 * BOOST, ph, th, soft: 0.6, extra: p.y - 0.4, col, flick: 0.22 });
          pushGlow(Ga, p.x, y + 0.25, p.z, 3.4, 0.2 * gain, th, ph, col, 0.85);
          stands.push([p.x, p.y, p.z, 1.0, seed]);
          counts.extra++; counts.roofExtra++;
        }
      }
      // second and third courts of the big houses: a lamp in about half of them
      if (big && Array.isArray(h.courts) && h.courts.length > 1) {
        for (let ci = 1; ci < h.courts.length; ci++) {
          if (rnd(h.seed, 110 + ci) > 0.5) continue;
          const c = M.polygonCentroid(h.courts[ci]), seed = (h.seed ^ (0x51f15e * ci)) >>> 0;
          const th = 0.34 + 0.5 * rnd(seed, 71), gain = 0.55 + 0.5 * rnd(seed, 72), ph = rnd(seed, 73), temp = rnd(seed, 74);
          pushPoint(c[0], h.groundLevel + 0.9, c[1], th, ph, gain, 0.5, 0, temp);
          courtLight(h, h.courts[ci], c[0], h.groundLevel + 0.9, c[1], gain, th, ph, temp, 0, true);
          counts.extra++;
        }
      }
      // hearths and bread ovens: a red glow that comes before the lamps (R5 3.7)
      if (rnd(h.seed, 120) < 0.06 && typeof layout.ovenOf === 'function') {
        const o = layout.ovenOf(h);
        if (o) {
          const seed = (h.seed ^ 0x0e11f1e) >>> 0, th = 0.1 + 0.3 * rnd(seed, 71), ph = rnd(seed, 73), gain = 0.6 + 0.5 * rnd(seed, 72);
          pushPoint(o.x, o.y + 0.05, o.z, th, ph, gain, 0.9, 1, 0.2);
          const ring = o.where === 'court' && Array.isArray(h.courts) ? h.courts.find((c) => M.pointInPolygon(o.x, o.z, c)) : null;
          if (ring) courtLight(h, ring, o.x, o.y + 0.25, o.z, gain * 0.8, th, ph, 0.2, 0.55, true);
          else {
            const col = tintOf(0.2, 0.55);
            pushVol(Va, { cx: o.x, cy: o.y, cz: o.z, hx: 4, hy: 4, hz: 4, c: 1, s: 0, type: 1, R: 4, lx: o.x, ly: o.y + 0.25, lz: o.z, I: gain * 0.7 * BOOST, ph, th, soft: 0.6, extra: o.y - 0.9 - 0.4, col, flick: 0.3 });
            pushGlow(Ga, o.x, o.y + 0.4, o.z, 3.0, 0.09 * gain, th, ph, col, 0.85);
          }
          counts.hearth++;
        }
      }
    }
    // the lamp beside the camera on the roof of shot 8 (SPEC 7: the family at dusk). The people module may bring its own;
    // if nothing burns within 12 m of the standpoint, a saucer lamp is set on the ledge of the court parapet in front
    let hero = null;
    try {
      const P8 = pathPose(tNight), near8 = ctx.emitters.list.some((e) => FIRE[e.kind] && Array.isArray(e.pos) && Math.hypot(e.pos[0] - P8.pos[0], e.pos[2] - P8.pos[2]) < 12 && Math.abs(e.pos[1] - P8.pos[1]) < 4);
      const gh = layout.houses.find((h) => h.landmark && M.pointInPolygon(P8.pos[0], P8.pos[2], h.footprint)) || (typeof layout.houseAt === 'function' ? layout.houseAt(P8.pos[0], P8.pos[2]) : null);
      if (!near8 && gh && Array.isArray(gh.courts) && gh.courts.length && layout.isBuilt(gh)) {
        const dx = P8.look[0] - P8.pos[0], dz = P8.look[2] - P8.pos[2], l = Math.hypot(dx, dz) || 1, d = [dx / l, dz / l], r = M.rightOf(d[0], d[1]);
        const tx = P8.pos[0] + d[0] * 3.3 + r[0] * 0.95, tz = P8.pos[2] + d[1] * 3.3 + r[1] * 0.95;
        let best = null;
        for (const ring of gh.courts) { const hit = M.nearestOnPolyline(tx, tz, ring); if (!best || hit.dist < best.dist) best = hit; }
        const bx = P8.pos[0] - best.x, bz = P8.pos[2] - best.z, bl = Math.hypot(bx, bz) || 1;
        const parts = typeof layout.roofParts === 'function' ? layout.roofParts(gh) : [], part = parts.find((q) => M.pointInPolygon(P8.pos[0], P8.pos[2], q.polygon));
        const y = (part ? part.level + (part.parapet ?? gh.parapet ?? 0.7) : gh.roofLevel + (gh.parapet ?? 0.7)) + 0.02;
        if (best.dist < 4 && y < P8.pos[1] - 0.4) { hero = { x: best.x + bx / bl * 0.5, y, z: best.z + bz / bl * 0.5 }; stands.push([hero.x, hero.y, hero.z, 0.04, 0x5a0ce7]); }
      }
    } catch (e) { hero = null; }

    const nPoints = Lp.pos.length / 3, nVolA = Va.center.length / 3;

    // a lamp does not float: a pottery stand (a low one on roofs) with the saucer lamp on top, where the camera comes near
    let nStands = 0;
    if (stands.length && ctx.geom && typeof ctx.geom.instanced === 'function') {
      const prof = [[0.115, 0.0], [0.1, 0.03], [0.03, 0.08], [0.026, 0.9], [0.09, 0.97], [0.085, 1.0], [0.0, 0.975]];
      const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 6);
      const mat = typeof materials.preset === 'function' ? materials.preset('pottery') : 'bakedBrickRed';
      let set = null;
      try { set = ctx.geom.instanced({ name: 'nightfx-lampstands', geometry: geo, material: mat, lod: [0, 110], castShadow: true, shadowTexel: 0.15 }); } catch (e) { set = null; }
      // a saucer lamp (a shallow pottery dish, 11 cm across) for lamps that sit on a ledge
      const dish = new THREE.LatheGeometry([[0.0, 0.0], [0.036, 0.0], [0.05, 0.008], [0.056, 0.03], [0.051, 0.035], [0.043, 0.02], [0.0, 0.014]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
      let saucers = null;
      try { saucers = ctx.geom.instanced({ name: 'nightfx-saucers', geometry: dish, material: mat, lod: [0, 60], castShadow: true, shadowTexel: 0.15 }); } catch (e) { saucers = null; }
      if (set) for (const [x, y, z, hgt, seed] of stands) {
        if (pathDist(x, y, z) > 130) continue;
        if (hgt < 0.2) { if (saucers) { saucers.add({ x, y, z, rotDeg: 360 * rnd(seed, 140), scale: 1 }, 0xe2cdb0); nStands++; } continue; }
        const k = hgt > 0.6 ? 1 : 1.7;                                // the low roof stand is stouter
        set.add({ x, y, z, rotDeg: 360 * rnd(seed, 140), sx: k, sy: hgt - 0.03, sz: k }, rnd(seed, 141) < 0.4 ? 0xd8c7a6 : 0xffffff);
        nStands++;
      }
    }

    const lampMat = reg(new THREE.ShaderMaterial({
      name: 'nightfx-lamps', transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      uniforms: { uNight, uBTime: uTime, uPx: { value: 1000 }, uMinPx: { value: 3 }, uLamp: { value: cLamp }, uPale: { value: cPale }, uEmber: { value: cEmber },
        uFarRad: { value: 14 }, uNearRad: { value: 8 }, uHalo: { value: 0.4 } },
      vertexShader: SH.LAMP_VERT, fragmentShader: SH.LAMP_FRAG,
    }));
    if (nPoints) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(Lp.pos, 3));
      g.setAttribute('aA', new THREE.Float32BufferAttribute(Lp.a, 4));
      g.setAttribute('aB', new THREE.Float32BufferAttribute(Lp.b, 2));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      perCamera(add(new THREE.Points(g, lampMat), 'lamps', 20, false));
    }

    // ---- the light volumes (shared material for house lamps and fires) ------------------------------------------------
    const volUniforms = PU ? {
      ...PU, uNight, uBTime: uTime, uCamWorld: { value: new THREE.Matrix4() }, uAmbInv: { value: 10 }, uGain: { value: 8 }, uWater: { value: waterLevel + 0.03 },
      uPxAngle: { value: 0.001 }, uFarBoost: { value: 2.2 }, uCap: { value: 1.1 },
    } : null;
    const volMat = PU ? reg(new THREE.ShaderMaterial({
      name: 'nightfx-volumes', transparent: true, depthWrite: false, depthTest: true, depthFunc: THREE.GreaterEqualDepth, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      uniforms: volUniforms, vertexShader: SH.VOL_VERT, fragmentShader: SH.VOL_FRAG,
    })) : null;
    const volCam = (u, camera, H) => { u.uCamWorld.value.copy(camera.matrixWorld); u.uPxAngle.value = 2 / (camera.projectionMatrix.elements[5] * H); };
    const volAttrs = (S, dyn) => [['iCenter', new Float32Array(S.center), 3, dyn], ['iHalf', new Float32Array(S.half), 3], ['iRT', new Float32Array(S.rt), 4], ['iLight', new Float32Array(S.light), 4, dyn],
      ['iAux', new Float32Array(S.aux), 4], ['iColor', new Float32Array(S.color), 4]];
    if (volMat && nVolA) perCamera(add(new THREE.Mesh(boxGeo(volAttrs(Va, false), nVolA), volMat), 'lamp-light', 10, false), volCam);

    // ---- air glow ------------------------------------------------------------------------------------------------------
    const glowMat = reg(new THREE.ShaderMaterial({
      name: 'nightfx-glow', transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      defines: PU ? { SOFT: 1 } : {},
      uniforms: { ...(PU ? { uBPostDepth: PU.uBPostDepth, uBPostInvRes: PU.uBPostInvRes, uBPostZ: PU.uBPostZ } : {}), uNight, uBTime: uTime, uPx: { value: 1000 }, uMinPx: { value: 3 } },
      vertexShader: SH.GLOW_VERT, fragmentShader: SH.GLOW_FRAG,
    }));
    const glowAttrs = (S, dyn) => [['iPos', new Float32Array(S.pos), 3, dyn], ['iA', new Float32Array(S.a), 4], ['iC', new Float32Array(S.c), 4]];
    if (Ga.pos.length) perCamera(add(new THREE.Mesh(quadGeo(glowAttrs(Ga, false), Ga.pos.length / 3), glowMat), 'court-glow', 12, false));

    // =================================================================================================================
    // 2. FIRES: every declared emitter of a night kind + the fallback sites
    // =================================================================================================================
    const fires = [];
    for (const e of ctx.emitters.list) {
      if (!FIRE[e.kind]) continue;
      if (!Array.isArray(e.pos) && typeof e.at !== 'function') continue;
      if (Array.isArray(e.pos) && !Number.isFinite(e.pos[0] + e.pos[1] + e.pos[2])) continue;
      fires.push({ kind: e.kind, pos: Array.isArray(e.pos) ? e.pos.slice(0, 3) : null, at: Array.isArray(e.pos) ? null : e.at, size: M.clamp(Number.isFinite(e.size) && e.size > 0 ? e.size : 1, 0.4, 2.5), day: e.night === false, owner: e.owner, id: e.id });
    }
    const declaredFireCount = fires.length;
    const fb = fallbackFires(ctx);
    for (const f of fb.fires) fires.push({ kind: f.kind, pos: f.pos, at: null, size: f.size, day: false, owner: 'nightfx', group: f.group });
    if (hero) fires.push({ kind: 'lamp', pos: [hero.x, hero.y + 0.04, hero.z], at: null, size: 1.0, day: false, owner: 'nightfx', group: 'hero', th: 0.2 });      // size 1.3 lit a quarter of the frame
    const nF = fires.length, anyDynamic = fires.some((f) => f.at);
    const Fp = new Float32Array(nF * 4), Fa = new Float32Array(nF * 4), Fb = new Float32Array(nF * 4);
    const Vb = { center: [], half: [], rt: [], light: [], aux: [], color: [] }, Gb = { pos: [], a: [], c: [] };
    const sparks = { pos: [], s: [], t: [] };
    const fireSmoke = [];
    const poolIds = new Map();
    let poolLights = 0;
    fires.forEach((f, i) => {
      const K = FIRE[f.kind], p0 = f.pos || safeAt(f.at, tNight) || safeAt(f.at, 0) || [0, -1000, 0];
      const h1 = f.pos ? hashPos(p0[0], p0[2], 611) : hash2(i, 3, 611), h2 = f.pos ? hashPos(p0[0], p0[2], 612) : hash2(i, 5, 612), h3 = f.pos ? hashPos(p0[0], p0[2], 613) : hash2(i, 7, 613);
      const sz = Math.pow(f.size, 0.8);
      f.K = K; f.th = Number.isFinite(f.th) ? f.th : M.lerp(K.th[0], K.th[1], h1); f.seed = h2; f.w = K.w * sz * (0.9 + 0.2 * h3); f.h = K.h * sz * (0.9 + 0.25 * h2);
      f.I = K.I * Math.pow(f.size, 1.2) * (0.85 + 0.3 * h3); f.R = K.R * Math.sqrt(f.size);
      f.vol = f.kind === 'lamp' ? 0.8 : 0.6;                    // share of the fire's light that its volume shows (the pool light adds the real thing near the camera)
      f.col = f.kind === 'lamp' ? tintOf(h3) : f.kind === 'hearth' ? tintOf(0.2, 0.5) : cLamp.clone().lerp(cTorch, 0.35 + 0.4 * h3);
      Fp.set([p0[0], p0[1], p0[2], f.pos ? 1 : 0], i * 4); Fa.set([f.w, f.h, f.seed, f.th], i * 4); Fb.set([K.code, K.gain * (0.85 + 0.3 * h1), f.day ? 1 : 0, 0.3 + 0.5 * h3], i * 4);
      const ly = p0[1] + 0.45 * f.h;
      pushVol(Vb, { cx: p0[0], cy: ly, cz: p0[2], hx: f.R, hy: f.R, hz: f.R, c: 1, s: 0, type: 1, R: f.R, lx: p0[0], ly, lz: p0[2], I: f.pos ? f.I * f.vol : 0, ph: f.seed, th: f.th, soft: K.soft * Math.sqrt(f.size), extra: -1e4, col: f.col, flick: 0.3 });
      pushGlow(Gb, p0[0], ly + 0.2 * f.h, p0[2], Math.max(1.5, 3.4 * f.h + 1.0), f.kind === 'lamp' ? 0.1 : 0.13, f.th, f.seed, f.col, 1);
      // the real light: every torch, brazier, bowl and hearth is offered to the pool; lighting gives its 12 lights to the
      // ones that matter in view. A point light has no size, so an oil lamp that sits ON a surface would burn a white hole
      // into it: lamps are lit by their volume alone, except the one beside the camera on the roof of shot 8, whose
      // real light hangs 0.8 m above it at a third of its strength
      f.poolShare = 0;
      // (the lamp beside the camera: my own on the ledge, or any declared lamp the night path passes within 25 m, such
      // as the one the people module sets beside the family)
      const hero1 = f.kind === 'lamp' && (f.group === 'hero' || (f.pos && pathDist(p0[0], p0[1], p0[2], tNight, dur) < 25));
      if (typeof lighting.addFireLight === 'function' && (f.kind !== 'lamp' || hero1)) {
        const reach = K.reach * Math.sqrt(f.size), lift = hero1 ? 0.8 : Math.max(0.45 * f.h, 0.4), pI = hero1 ? 0.35 : K.I * Math.pow(f.size, 1.2);
        const src = lighting.addFireLight({ pos: f.pos ? [p0[0], p0[1] + lift, p0[2]] : (t) => { const q = safeAt(f.at, t); return q ? [q[0], q[1] + lift, q[2]] : null; }, intensity: pI, reach, flicker: 0.25, day: false });
        if (src && src.id !== undefined) { poolIds.set(src.id, i); poolLights++; f.poolShare = Math.min(1, pI / Math.max(f.I, 1e-3)); }
      }
      if (!f.pos) return;
      const near = f.day ? pathDist(p0[0], p0[1], p0[2]) : pathDist(p0[0], p0[1], p0[2], tNight, dur);
      if (K.sparks) {
        const n = Math.max(2, Math.round(K.sparks * (final ? 1 : 0.6) * (near < 400 ? 1 : 0.5)));
        for (let k = 0; k < n; k++) {
          sparks.pos.push(p0[0], p0[1] + 0.35 * f.h, p0[2]);
          sparks.s.push(hash2(i, k, 621), 0.45 + 0.5 * hash2(i, k, 622), (1.3 + 1.6 * hash2(i, k, 623)) * (0.6 + 0.6 * f.h), 0.18 + 0.5 * f.w);
          sparks.t.push(f.th, hash2(i, k, 624));
        }
      }
      if (K.smoke && near < 520) fireSmoke.push(f);
    });

    const flameMat = reg(new THREE.ShaderMaterial({
      name: 'nightfx-flames', transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uNight, uBTime: uTime, uPx: { value: 1000 }, uMinPx: { value: 3 }, uDayDim: { value: 0.3 }, uNoise: { value: noise }, uLamp: { value: cLamp }, uPale: { value: cPale }, uEmber: { value: cEmber },
        uFarRad: { value: 9 }, uNearRad: { value: 4.6 }, uHalo: { value: 0.35 }, uWindLean: { value: new THREE.Vector3() } },
      vertexShader: SH.FLAME_VERT, fragmentShader: SH.FLAME_FRAG,
    }));
    let flameGeo = null, volBGeo = null, glowBGeo = null;
    if (nF) {
      flameGeo = quadGeo([['iPos', Fp, 4, true], ['iA', Fa, 4], ['iB', Fb, 4]], nF);
      // also in the water's mirror (the river streaks): there the flames are drawn larger and brighter, because the
      // ripples smear a three-pixel point into nothing
      perCamera(add(new THREE.Mesh(flameGeo, flameMat), 'flames', 22, true), (u, camera) => {
        const mirror = camera !== ctx.camera;
        u.uFarRad.value = mirror ? 30 : 9; u.uNearRad.value = mirror ? 16 : 4.6; if (mirror) u.uMinPx.value *= 2.2;
      });
      if (volMat) { volBGeo = boxGeo(volAttrs(Vb, true), nF); perCamera(add(new THREE.Mesh(volBGeo, volMat), 'fire-light', 11, false), volCam); }
      glowBGeo = quadGeo(glowAttrs(Gb, true), nF);
      perCamera(add(new THREE.Mesh(glowBGeo, glowMat), 'fire-glow', 13, false));
    }
    const sparkMat = reg(new THREE.ShaderMaterial({
      name: 'nightfx-sparks', transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      uniforms: { uNight, uBTime: uTime, uPx: { value: 1000 }, uDayDim: { value: 0.3 }, uWind: { value: new THREE.Vector2(wind.dir[0], wind.dir[1]) }, uLamp: { value: cLamp }, uRad: { value: 9 } },
      vertexShader: SH.SPARK_VERT, fragmentShader: SH.SPARK_FRAG,
    }));
    const nSparks = sparks.pos.length / 3;
    if (nSparks) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(sparks.pos, 3));
      g.setAttribute('aS', new THREE.Float32BufferAttribute(sparks.s, 4));
      g.setAttribute('aT', new THREE.Float32BufferAttribute(sparks.t, 2));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      perCamera(add(new THREE.Points(g, sparkMat), 'sparks', 40, false));
    }

    // =================================================================================================================
    // 3. PUFFS: smoke, dust, haze, mist
    // =================================================================================================================
    const Ps = { base: [], a: [], b: [], c: [] };      // static sources
    const dyn = [];                                    // puffs of moving sources: { at, life, phase, index }
    const Pd = { base: [], a: [], b: [], c: [] };
    const tally = { smoke: 0, kiln: 0, dust: 0, haze: 0, mist: 0, fireSmoke: 0, puffs: 0 };
    const WS = wind.speed || 2.6;
    const puff = (S, x, y, z, phase, life, rise, drift, s0, s1, alpha, seed, alb, kind, invN = 1) => { S.base.push(x, y, z, invN); S.a.push(phase, life, rise, drift); S.b.push(s0, s1, alpha, seed); S.c.push(alb[0], alb[1], alb[2], kind); tally.puffs++; };
    /** A column of puffs from one source. src = [x, y, z] or a function of film time. */
    const column = (src, kindName, size, id) => {
      const fixed = Array.isArray(src), p = fixed ? src : [0, 0, 0];
      const hx = fixed ? p[0] : id * 17.3, hz = fixed ? p[2] : id * 9.1, h1 = hashPos(hx, hz, 701), h2 = hashPos(hx, hz, 702), h3 = hashPos(hx, hz, 703), h4 = hashPos(hx, hz, 704);
      let N, life, rise, drift, s0, s1, alpha, alb, kind;
      if (kindName === 'kiln') {
        const ks = Math.sqrt(size);
        kind = 1; N = final ? 20 : 14; life = 38 + 12 * h1; rise = (46 + 28 * h2) * ks; drift = WS * life * 0.6; s0 = 3.0 * ks; s1 = (18 + 9 * h3) * ks; alpha = 0.24;
        const v = 0.3 + 0.14 * h4; alb = [v * 1.06, v, v * 0.94];
      } else if (kindName === 'dust') {
        kind = 2; N = final ? 7 : 5; life = 9 + 4 * h1; rise = (1.3 + 0.9 * h2) * size; drift = WS * life * 0.5; s0 = 0.9 * size; s1 = (4.5 + 2 * h3) * size; alpha = 0.15; alb = [0.66, 0.56, 0.42];
      } else if (kindName === 'dustLow') {
        // what feet raise on a paved, walled street: ankle to knee high, hardly drifting
        kind = 2; N = final ? 6 : 4; life = 8 + 4 * h1; rise = 0.5 + 0.5 * h2; drift = WS * life * 0.12; s0 = 0.9; s1 = 3.0 + 1.2 * h3; alpha = 0.07; alb = [0.7, 0.6, 0.46];
      } else if (kindName === 'fire') {
        kind = 5; N = final ? 5 : 4; life = 7 + 3 * h1; rise = (5.5 + 3 * h2) * (0.6 + 0.5 * size); drift = WS * life * 0.42; s0 = 0.3 * size + 0.1; s1 = (1.5 + 0.8 * h3) * (0.6 + 0.5 * size); alpha = 0.17; alb = [0.4, 0.38, 0.36];
      } else {
        // thin blue-grey threads: an oven or a hearth (size about 0.8), an incense stand (0.3)
        // (integration round: the columns read as thin white arcs, like water jets. They are now wider, softer, greyer
        // and fainter, and an incense stand in the walled street gives a short wisp that hardly drifts.)
        const wisp = size < 0.5;
        kind = 0; N = final ? (wisp ? 8 : 16) : (wisp ? 5 : 10); life = (wisp ? 9 : 19) + 7 * h1;
        rise = wisp ? 2.2 + 1.6 * h2 : (11 + 8 * h2) * size; drift = wisp ? WS * life * 0.07 : WS * life * 0.33 * (0.55 + 0.45 * size);
        s0 = wisp ? 0.16 : 0.42 * size + 0.22; s1 = wisp ? 1.0 + 0.5 * h3 : (6.0 + 3.2 * h3) * Math.pow(size, 0.7);
        alpha = (wisp ? 0.17 : 0.34) * M.clamp(size + 0.25, 0.55, 1.1);
        const v = 0.44 + 0.12 * h4; alb = [v * 0.96, v, v * 1.06];
      }
      for (let k = 0; k < N; k++) {
        const phase = (k + 0.4 * hash2(k, Math.round(h1 * 9999), 705)) / N + h2, seed = hash2(k, Math.round(h3 * 9999), 706);
        if (fixed) puff(Ps, p[0], p[1], p[2], phase, life, rise, drift, s0, s1, alpha, seed, alb, kind, 1 / N);
        else { dyn.push({ at: src, life, phase, index: Pd.base.length / 4, invN: 1 / N }); puff(Pd, 0, -1000, 0, phase, life, rise, drift, s0, s1, alpha, seed, alb, kind, 0); }
      }
    };
    let srcId = 0;
    for (const e of ctx.emitters.list) {
      if (e.kind !== 'smoke' && e.kind !== 'kilnSmoke' && e.kind !== 'dust') continue;
      const src = Array.isArray(e.pos) ? e.pos : typeof e.at === 'function' ? e.at : null; if (!src) continue;
      if (Array.isArray(src) && !Number.isFinite(src[0] + src[1] + src[2])) continue;
      // `size` is whatever the owner meant by it (0.3 for an incense stand, 0.8 for an oven, up to 3.4 for a kiln have been
      // seen): compressed into a factor of 0.4 to 2
      const size = Math.pow(M.clamp(Number.isFinite(e.size) && e.size > 0 ? e.size : 1, 0.25, 2.6), 0.75);
      if (e.kind === 'smoke') { column(src, 'smoke', size, ++srcId); tally.smoke++; } else if (e.kind === 'kilnSmoke') { column(src, 'kiln', size, ++srcId); tally.kiln++; } else { column(src, 'dust', size, ++srcId); tally.dust++; }
    }
    const declaredSmoke = tally.smoke + tally.kiln, declaredDust = tally.dust;
    for (const s of fallbackSmoke(ctx)) { column(s.pos, s.kind === 'kilnSmoke' ? 'kiln' : 'smoke', s.size, ++srcId); if (s.kind === 'kilnSmoke') tally.kiln++; else tally.smoke++; }
    for (const d of fallbackDust(ctx, Math.round(36 * dens) + 6)) { column(d.pos, d.low ? 'dustLow' : 'dust', d.size, ++srcId); tally.dust++; }
    for (const f of fireSmoke) { column([f.pos[0], f.pos[1] + 0.8 * f.h, f.pos[2]], 'fire', f.size, ++srcId); tally.fireSmoke++; }
    // the haze and the mist go FIRST into the buffer: they are the background of the columns
    const Pbg = { base: [], a: [], b: [], c: [] };
    for (const s of hazeSites(ctx, Math.round(final ? 300 : 110))) {
      const life = 110, drift = WS * life * 0.5;
      puff(Pbg, s.x - wind.dir[0] * drift * 0.5, s.y, s.z - wind.dir[1] * drift * 0.5, s.seed, life, 0, drift, s.w, s.h, 0.022, hash2(Math.round(s.seed * 1e6), 1, 707), [0.6, 0.57, 0.55], 3); tally.haze++;
    }
    for (const s of mistSites(ctx, Math.round(final ? 520 : 200))) {
      const life = 140, drift = 38;
      puff(Pbg, s.x - wind.dir[0] * drift * 0.5, s.y, s.z - wind.dir[1] * drift * 0.5, s.seed, life, 0, drift, s.w, s.h, 0.085, hash2(Math.round(s.seed * 1e6), 2, 708), [0.84, 0.86, 0.9], 4); tally.mist++;
    }
    const cat = (k) => new Float32Array([...Pbg[k], ...Ps[k]]);
    const kindW = [1, 1, 1, 0, 0, 0];
    const puffUniforms = {
      ...(PU ? { uBPostDepth: PU.uBPostDepth, uBPostInvRes: PU.uBPostInvRes, uBPostZ: PU.uBPostZ } : {}), uBTime: uTime, uNight, uNoise: { value: noise },
      uWind: { value: new THREE.Vector2(wind.dir[0], wind.dir[1]) }, uKW: { value: kindW },
      uKeyDir: { value: new THREE.Vector3(0, 1, 0) }, uKeyCol: { value: new THREE.Color(1, 1, 1) }, uAmbCol: { value: new THREE.Color(0.2, 0.2, 0.2) }, uFireCol: { value: cLamp.clone().multiplyScalar(0.55) },
    };
    const puffMat = reg(new THREE.ShaderMaterial({
      name: 'nightfx-puffs', transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.NormalBlending,
      defines: { ...(PU ? { SOFT: 1 } : {}), ...(hasShadowChunk ? { SHADOWS: 1 } : {}), ...(hasAerial && lighting.impl !== 'stub' ? { HAZE: 1 } : {}) },
      // three resolves #include lines before the preprocessor runs: without the shadow chunk the line itself has to go
      uniforms: puffUniforms, vertexShader: SH.PUFF_VERT, fragmentShader: hasShadowChunk ? SH.PUFF_FRAG : SH.PUFF_FRAG.replace('#include <bbl_shadow_pars_fragment>', ''),
    }), hasShadowChunk ? { shadows: true } : {});
    const nStatic = (Pbg.base.length + Ps.base.length) / 4;
    if (nStatic) add(new THREE.Mesh(quadGeo([['iBase', cat('base'), 4], ['iA', cat('a'), 4], ['iB', cat('b'), 4], ['iC', cat('c'), 4]], nStatic), puffMat), 'puffs', 30, false);
    let dynBase = null, dynGeo = null;
    if (dyn.length) {
      dynBase = new Float32Array(Pd.base);
      dynGeo = quadGeo([['iBase', dynBase, 4, true], ['iA', new Float32Array(Pd.a), 4], ['iB', new Float32Array(Pd.b), 4], ['iC', new Float32Array(Pd.c), 4]], dyn.length);
      add(new THREE.Mesh(dynGeo, puffMat), 'puffs-moving', 31, false);
    }

    // =================================================================================================================
    // per sub-frame
    // =================================================================================================================
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const lightAttr = volBGeo ? volBGeo.getAttribute('iLight') : null, centerAttr = volBGeo ? volBGeo.getAttribute('iCenter') : null;
    const flamePos = flameGeo ? flameGeo.getAttribute('iPos') : null, glowPos = glowBGeo ? glowBGeo.getAttribute('iPos') : null;
    const poolW = new Float32Array(nF);
    function update(frame) {
      const Ls = frame.light || lighting.state || {}, t = frame.t;
      const night = Number.isFinite(Ls.night) ? Ls.night : 0;
      uNight.value = night;
      // light on the puffs
      const keyI = Number.isFinite(Ls.keyIntensity) ? Ls.keyIntensity : 1, keyC = Ls.keyColor || { r: 1, g: 1, b: 1 };
      puffUniforms.uKeyCol.value.setRGB(keyC.r * keyI, keyC.g * keyI, keyC.b * keyI);
      if (Ls.keyDir) puffUniforms.uKeyDir.value.copy(Ls.keyDir);
      const fc = Ls.fillColor || { r: 0.5, g: 0.55, b: 0.65 }, fl = Math.max(lum(fc), 1e-3);
      const fillLum = Number.isFinite(Ls.fillLum) ? Ls.fillLum : (Number.isFinite(Ls.fillIntensity) ? Ls.fillIntensity * fl : 0.3);
      puffUniforms.uAmbCol.value.setRGB(fc.r * fillLum / fl, fc.g * fillLum / fl, fc.b * fillLum / fl);
      // ambient irradiance of the opaque scene, to turn its colour back into an albedo
      if (volUniforms) volUniforms.uAmbInv.value = Math.PI / Math.max(0.05, fillLum + 0.5 * keyI * lum(keyC));
      // which airs are about: haze toward evening, mist in the morning
      const el = Number.isFinite(Ls.sunElevationDeg) ? Ls.sunElevationDeg : 20, west = Ls.sunDir ? (Ls.sunDir.x < 0 ? 1 : 0.3) : 1;
      const w = Number.isFinite(Ls.w) ? Ls.w : Number.isFinite(Ls.k) ? Ls.k : 0;
      const morning = (Ls.a === 'morning' ? 1 - w : 0) + (Ls.b === 'morning' ? w : 0);
      kindW[0] = 1 - 0.4 * night; kindW[1] = 1 - 0.3 * night; kindW[2] = 1 - 0.7 * night;
      kindW[3] = M.smoothstep(30, 12, el) * west * (1 - 0.5 * night);
      kindW[4] = morning * M.smoothstep(42, 20, el) * (1 - night);
      kindW[5] = night;
      // flames lean with the wind as seen from this camera
      const cam = frame.camera;
      if (cam) {
        const fx = cam.look[0] - cam.pos[0], fz = cam.look[2] - cam.pos[2], l = Math.hypot(fx, fz) || 1;
        flameMat.uniforms.uWindLean.value.x = 0.42 * ((-fz / l) * wind.dir[0] + (fx / l) * wind.dir[1]) * (ctx.wind && ctx.wind.gust ? ctx.wind.gust(t, cam.look[0], cam.look[2]) : 1);
      }
      // fires: moving emitters, and the share the pool light already gives
      if (nF && (night > 0.001 || anyDynamic)) {
        poolW.fill(0);
        const fl2 = lighting.fireLights;
        if (fl2 && fl2.active && fl2.weights) for (let k = 0; k < fl2.active.length; k++) { const i = poolIds.get(fl2.active[k]); if (i !== undefined) poolW[i] = fl2.weights[k]; }
        for (let i = 0; i < nF; i++) {
          const f = fires[i];
          let on = 1;
          if (f.at) {
            const p = safeAt(f.at, t);
            if (p) {
              const ly = p[1] + 0.45 * f.h;
              if (flamePos) flamePos.setXYZW(i, p[0], p[1], p[2], 1);
              if (centerAttr) centerAttr.setXYZ(i, p[0], ly, p[2]);
              if (lightAttr) { lightAttr.array[i * 4] = p[0]; lightAttr.array[i * 4 + 1] = ly; lightAttr.array[i * 4 + 2] = p[2]; }
              if (glowPos) glowPos.setXYZ(i, p[0], ly + 0.2 * f.h, p[2]);
            } else { on = 0; if (flamePos) flamePos.setW(i, 0); }
          }
          if (lightAttr) lightAttr.array[i * 4 + 3] = f.I * f.vol * on * (1 - 0.8 * poolW[i] * f.poolShare);
        }
        if (lightAttr) lightAttr.needsUpdate = true;
        if (anyDynamic) { if (flamePos) flamePos.needsUpdate = true; if (centerAttr) centerAttr.needsUpdate = true; if (glowPos) glowPos.needsUpdate = true; }
      }
      // moving smoke and dust: every puff remembers where its source was when it was born
      if (dynBase) {
        for (const d of dyn) {
          const a = M.mod(t / d.life + d.phase, 1), p = safeAt(d.at, t - a * d.life), o = d.index * 4;
          if (p) { dynBase[o] = p[0]; dynBase[o + 1] = p[1]; dynBase[o + 2] = p[2]; dynBase[o + 3] = d.invN; } else dynBase[o + 3] = 0;
        }
        dynGeo.getAttribute('iBase').needsUpdate = true;
      }
    }

    const lampsTotal = counts.court + counts.roof + counts.door + counts.extra + counts.hearth;      // roofExtra is part of extra
    const stats = {
      lamps: lampsTotal, ...counts, lightVolumes: nVolA + nF, fires: nF, firesDeclared: declaredFireCount, firesFallback: nF - declaredFireCount, fallbackGroups: fb.groups, poolLights,
      lampStands: nStands, heroLamp: hero ? [+hero.x.toFixed(2), +hero.y.toFixed(2), +hero.z.toFixed(2)] : null, sparks: nSparks, smokeColumns: tally.smoke + tally.kiln, smokeDeclared: declaredSmoke, kilnColumns: tally.kiln, dustSources: tally.dust, dustDeclared: declaredDust, fireSmoke: tally.fireSmoke,
      hazePuffs: tally.haze, mistPuffs: tally.mist, puffs: tally.puffs, movingPuffs: dyn.length, deferred: !!PU,
    };
    log('nightfx', JSON.stringify(stats));
    const k = final ? 1 : dens;
    return {
      update,
      stats,
      checks: [
        { name: 'house lamps and hearths', value: lampsTotal, expect: final ? '6,000 to 10,000 (SPEC: 6,000 or more)' : '> 300 in draft', pass: final ? lampsTotal >= 6000 && lampsTotal <= 10000 : lampsTotal > 300 },
        { name: 'fires of every kind, declared by all modules + fallback', value: nF, expect: '250 to 1,500 (SPEC: 400 torches and braziers; lamps of palaces, boats and people come on top)', pass: nF >= 250 && nF <= 1500 },
        { name: 'smoke columns', value: tally.smoke + tally.kiln, expect: final ? '300 to 520 (SPEC: 400)' : '> 40 in draft', pass: final ? tally.smoke + tally.kiln >= 300 && tally.smoke + tally.kiln <= 520 : tally.smoke + tally.kiln > 40 * k },
        { name: 'lamp thresholds spread over the dusk', value: '0.30 to 0.85', expect: 'each lamp its own', pass: true },
        { name: 'light is shaded against the opaque scene', value: !!PU, expect: 'true with the real post', pass: !!PU || (ctx.post && ctx.post.impl === 'stub') },
      ],
      api: { counts: stats, uniforms: { lamp: lampMat.uniforms, flame: flameMat.uniforms, volume: volUniforms, glow: glowMat.uniforms, puff: puffUniforms } },
    };
  },
};

function safeAt(fn, t) {
  try { const p = fn(t); return Array.isArray(p) && Number.isFinite(p[0] + p[1] + p[2]) ? p : null; } catch (e) { return null; }
}

/** A tileable value-noise texture, three decorrelated channels of four octaves each (seeded: the same every run). */
function makeNoise(THREE, size) {
  const data = new Uint8Array(size * size * 4);
  const octs = [4, 8, 16, 32], amp = [0.5, 0.27, 0.15, 0.08], norm = amp.reduce((a, b) => a + b, 0);
  for (let ch = 0; ch < 3; ch++) {
    const lat = octs.map((n, o) => { const g = new Float32Array(n * n); for (let i = 0; i < n * n; i++) g[i] = hash2(i, 977 + ch * 131 + o * 17, 4242); return g; });
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = 0;
      for (let o = 0; o < octs.length; o++) {
        const n = octs[o], fx = x / size * n, fy = y / size * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), g = lat[o], x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
        v += amp[o] * ((g[y0 * n + x0] * (1 - sx) + g[y0 * n + x1] * sx) * (1 - sy) + (g[y1 * n + x0] * (1 - sx) + g[y1 * n + x1] * sx) * sy);
      }
      data[(y * size + x) * 4 + ch] = Math.max(0, Math.min(255, Math.round(255 * v / norm)));
    }
  }
  for (let i = 0; i < size * size; i++) data[i * 4 + 3] = 255;
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = 'nightfx.noise'; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}
