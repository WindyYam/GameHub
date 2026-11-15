// js/core/shots.js — subsystem "film" (ENTRY). OWNER: film engineer (with js/core/camera.js, js/core/hud.js, hud.css).
// Contract: ENGINE.md section 5.9; additions and usage: docs/film.md. Check: `node filmcheck.mjs`.
//
// What this file owns
//   - the TIMELINE: the shot table of world.json plus the flight time of every transition (FLIGHT below).
//     film.duration and film.shots are the single authority for time in the film;
//   - the camera for any film time (js/core/camera.js builds the path; this file adds near / far and the debug override);
//   - the light blend for any film time, in the { a, b, k } form lighting.stateAt() consumes;
//   - the overlay state for any film time (js/core/hud.js draws it into #hud).
// Everything is a pure function of t. Nothing here reads a clock or a random number.
import * as M from './mathx.js';
import { buildPath, ease5 } from './camera.js';
import { createHud, HUD_TIMING, buildEndCard } from './hud.js';

/**
 * Flight time (seconds) of the transition INTO a shot, by shot id. A missing id flies in world.json's
 * `transitionIn`. Hold durations are never changed. A flight longer than designed starts EARLIER than the
 * shot's t0 (see `lead` in the shot record), so every shot-relative time of world.json stays valid.
 */
export const FLIGHT = Object.freeze({
  processionalWay: 2.8,   // designed 2.3: 2 km from 570 m down into the walled street
  southPalace: 3.0,       // designed 2.0: the view turns 123 degrees; at 2.0 s it peaked at 84 degrees per second (a whip pan)
  euphrates: 3.0,         // designed 2.4: down over the river basin onto the boat
  etemenanki: 3.8,        // designed 2.5: 820 m at 20 to 45 m round the tower, which stays in frame
  merkesLane: 3.4,        // designed 2.3: 780 m low over the roofs of Merkes and down into the lane
  rooftop: 2.6,           // designed 2.0: the loop over the house blocks
  aerial: 2.8,            // designed 2.4: 3 km up to 1750 m
  nightPass: 2.5,         // designed 2.0: 2.4 km back down
});

/**
 * Seconds added after the last hold so that the end card can be read (integration round). The camera runs on along
 * the last hold's line and eases to rest: it covers half the distance it would at full speed. film.duration includes
 * the tail; shots[last].t1 stays the end of the designed hold.
 */
export const TAIL = 2.0;

/**
 * Per-transition tuning, by the id of the shot flown INTO (all optional; defaults in camera.js):
 *   p, h0            speed ~ (height above the floor + h0)^p along the curve (p = 0: no height term)
 *   rampIn, rampOut  share of the flight over which that term fades in / out (the hold speeds take over at the ends)
 *   turn             +1 force a clockwise view turn, -1 counter-clockwise (default: the shorter way)
 *   lookFrom, lookTo share of the flight over which the view turns (default 0..1); lookRamp: ramp share of that turn
 *   carry            seconds for which a hold's own turn rate carries on into the flight (0.5)
 *   pitchDip         extra elevation (degrees, negative = down) at mid-flight
 *   look: 'target'   aim at a look target travelling between the two holds' targets (or tune.track = [x, y, z])
 *                    instead of blending view angles; lookIn / lookOut = hand-over shares
 */
export const TUNE = Object.freeze({
  // round the tower counter-clockwise, as the path goes: Etemenanki stays in frame for the whole flight
  etemenanki: { turn: -1, p: 0.3, lookRamp: 0.22 },
});

/**
 * Light timelines that replace a shot's `lightTimeline` of world.json, by shot id (times in seconds from the shot's
 * t0, as in world.json; the hold starts at `transitionIn`). `steady: e` = the sun travels INTO this node at a steady
 * rate and eases to rest over the last share `e` of the move (a time-lapse), instead of the eased quintic.
 *
 * rooftop (shot 8, hold = 2.0 to 7.0): world.json gives morning until 2.6, golden at 4.4, blue at 6.0, which leaves
 * 1.6 s for the sunset, and the day-to-night weight of the lighting covered only the last third of that: day turned
 * into night within a quarter second of film. Here the hold still begins in morning light (the contract test asks for it), a
 * day passes in 1.15 s (the sun sweeps over the top and comes down into the frame), and the dusk takes 3.3 s: the
 * sun sinks from 11 degrees at a steady 4.9 degrees of elevation per second, touches the horizon 2.3 s later and
 * the light settles into blue 0.4 s before the camera leaves the roof.
 */
export const LIGHT = Object.freeze({
  rooftop: [{ t: 0, mode: 'morning' }, { t: 2.15, mode: 'morning' }, { t: 3.3, mode: 'golden' }, { t: 6.6, mode: 'blue', steady: 0.24 }],
});

/** Sun position for an hour angle (degrees, + = afternoon): { elevationDeg, azimuthDeg (MODEL), dir } (the formula of lighting.sunAtHourAngle). */
export function sunAtHourAngle(L, Hdeg) {
  const lat = L.site.lat * M.DEG, dec = L.solarDeclinationDeg * M.DEG, H = Hdeg * M.DEG;
  const E = -Math.cos(dec) * Math.sin(H), N = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(H) * Math.sin(lat);
  const U = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const elevationDeg = Math.asin(M.clamp(U, -1, 1)) * M.RAD, azimuthDeg = M.mod(Math.atan2(E, N) * M.RAD + L.gridRotationFromTrueNorthDeg, 360);
  return { elevationDeg, azimuthDeg, dir: M.dirFromAzEl(azimuthDeg, elevationDeg) };
}

/** Solar hour angle (degrees, + = afternoon) of every light mode, from world.json alone (the formula lighting uses). */
export function modeHourAngles(L) {
  const lat = L.site.lat * M.DEG, dec = L.solarDeclinationDeg * M.DEG, out = {};
  for (const [name, m] of Object.entries(L.modes)) {
    const cosH = M.clamp((Math.sin(m.sunElevationDeg * M.DEG) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec)), -1, 1);
    out[name] = Math.acos(cosH) * M.RAD * (m.sunTrueAzimuthDeg > 180 ? 1 : -1);
  }
  return out;
}

export async function create(ctx, options = {}) {
  const world = ctx.world, S = world.shots, ground = ctx.ground;
  const fps = S.fps;
  const flight = { ...FLIGHT, ...(options.flight || {}) }, tune = { ...TUNE, ...(options.tune || {}) }, lightPlan = { ...LIGHT, ...(options.light || {}) };

  // ---- timeline ------------------------------------------------------------------------------------
  // t0 / t1 / duration / transitionIn keep their world.json meaning (t1 - t0 = duration; the hold starts at
  // t0 + transitionIn). tIn is where the flight into the shot really starts (= t1 of the previous shot); it is
  // earlier than t0 by `lead` when the flight was lengthened.
  const water = world.levels.water;
  let clock = 0;
  const shots = S.list.map((raw, index) => {
    const designed = raw.transitionIn || 0;
    const fl = index === 0 ? 0 : Math.max(designed, flight[raw.id] ?? designed);
    const tIn = clock, tHold = tIn + fl, t0 = tHold - designed, t1 = t0 + raw.duration;
    clock = t1;
    const y0 = raw.keyframes[0].pos[1];
    const s = {
      index, n: raw.n, id: raw.id, name: raw.name, mode: raw.mode, caption: raw.caption,
      t0, t1, duration: raw.duration, transitionIn: designed,
      keyframes: raw.keyframes.map((k) => ({ t: k.t, time: t0 + k.t, pos: k.pos.slice(), look: k.look.slice(), fov: k.fov })),
      waypoints: (raw.transitionWaypoints || []).map((p) => p.slice()),
      lightTimeline: lightPlan[raw.id] || raw.lightTimeline || null,      // the timeline the film USES (LIGHT above); world.json's is raw.lightTimeline
      mid: (tHold + t1) / 2,
      raw,
      // additions (docs/film.md)
      tIn, tHold, flight: fl, lead: fl - designed,
      // datum level of what the camera stands on / flies over in this shot (speed shaping of the flights only)
      floor: raw.ridesBoat ? water : raw.eyeLevel || raw.onRoofOf ? y0 - 1.6 : 10,
      tune: tune[raw.id] || {},
    };
    return s;
  });
  const tail = Math.max(0, options.tail ?? TAIL), holdEnd = clock;
  const duration = clock + tail;
  const path = buildPath(shots);
  /** film time -> path time: identity up to the end of the last hold, then the camera eases to rest over the tail */
  const warp = (t) => { if (!(t > holdEnd) || tail <= 0) return t; const u = Math.min(t - holdEnd, tail); return holdEnd + u - (u * u) / (2 * tail); };
  const finalMode = (s) => (s.lightTimeline ? s.lightTimeline[s.lightTimeline.length - 1].mode : s.mode);

  // one-entry cache: the engine asks for the same t several times per sub-frame
  let cacheT = NaN, cacheS = null;
  const stateAt = (t) => { if (t !== cacheT) { cacheS = path.stateAt(warp(t)); cacheT = t; } return cacheS; };

  /**
   * { shot, index, local, inTransition, k }. local = t - shot.t0 (seconds; NEGATIVE during the lead of a lengthened
   * flight). k = progress 0..1: share of the flight path flown (by arc length) or share of the hold elapsed.
   */
  function shotAt(t) {
    const tt = M.clamp(t, 0, duration), st = stateAt(tt), s = shots[st.index];
    return { shot: s, index: s.index, local: tt - s.t0, inTransition: st.inTransition, k: st.progress };
  }

  /** Depth range for a camera position: near = clamp(0.02 x height above ground / water, 0.3, 40), far = 40 km (ENGINE.md 13). */
  function depthRange(pos) {
    const h = pos[1] - Math.max(ground.height(pos[0], pos[2]), ground.waterLevel);
    return { near: M.clamp(0.02 * h, 0.3, 40), far: 40000 };
  }

  let override = null, approachTable = null;
  /** Camera pose of the FILM PATH at film time t, whatever the debug override is. */
  function pathPoseAt(t) {
    const st = stateAt(t), dr = depthRange(st.pos);
    return { pos: st.pos.slice(), look: st.look.slice(), up: [0, 1, 0], fov: st.fov, near: dr.near, far: dr.far };
  }
  /** Camera pose at film time t (pure): { pos, look, up, fov (vertical, degrees), near, far }; the debug override while one is set. */
  function poseAt(t) {
    if (override && override.pos) {   // web build: an override may carry only a light mode
      const dr = depthRange(override.pos);
      return { pos: override.pos.slice(), look: override.look.slice(), up: override.up || [0, 1, 0], fov: override.fov ?? 50, near: override.near ?? dr.near, far: override.far ?? dr.far };
    }
    return pathPoseAt(t);
  }

  // ---- light -----------------------------------------------------------------------------------------
  // The whole film is one list of nodes (time, mode). Between two nodes with the same mode the light rests;
  // between different modes the sun travels along its arc: the hour angle H(t) is a C2 quintic through the
  // nodes (zero rate where it meets a rest, a shared rate where two moves meet, as in the sunset of shot 8),
  // and k = (H - Ha) / (Hb - Ha) is what lighting.stateAt({ a, b, k }) turns back into the same hour angle.
  const HA = modeHourAngles(world.lighting);
  const nodes = [{ t: -1e9, mode: shots[0].mode, steady: 0 }];
  const push = (t, mode, steady = 0) => { const last = nodes[nodes.length - 1]; if (t <= last.t + 1e-9) { last.mode = mode; return; } nodes.push({ t, mode, steady }); };
  shots.forEach((s, i) => {
    if (s.lightTimeline) for (const n of s.lightTimeline) push(s.t0 + n.t, n.mode, n.steady || 0);
    else if (i > 0 && finalMode(shots[i - 1]) !== s.mode) { push(s.tIn, finalMode(shots[i - 1])); push(s.tHold, s.mode); }
  });
  nodes.push({ t: 1e9, mode: nodes[nodes.length - 1].mode, steady: 0 });
  const segs = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    segs.push({ t0: a.t, t1: b.t, a: a.mode, b: b.mode, Ha: HA[a.mode], Hb: HA[b.mode], moving: a.mode !== b.mode, r0: 0, r1: 0, steady: a.mode !== b.mode ? b.steady : 0, pressT: a.t, target: b.mode });
  }
  for (let i = 0; i < segs.length - 1; i++) {                       // shared rate (degrees / s) where two moves meet
    const p = segs[i], q = segs[i + 1];
    if (!p.moving || !q.moving) continue;
    const d1 = (p.Hb - p.Ha) / (p.t1 - p.t0), d2 = (q.Hb - q.Ha) / (q.t1 - q.t0);
    if (d1 * d2 <= 0) continue;
    const h1 = p.t1 - p.t0, h2 = q.t1 - q.t0, w1 = 2 * h2 + h1, w2 = h2 + 2 * h1;
    p.r1 = q.r0 = (w1 + w2) / (w1 / d1 + w2 / d2);                  // Fritsch-Carlson weighted harmonic mean
  }
  for (let i = 0; i < segs.length; i++) {                           // a steady move sets its own rate; the move before it arrives with that rate
    const g = segs[i];
    if (!g.steady) continue;
    g.r0 = (g.Hb - g.Ha) / ((g.t1 - g.t0) * (1 - g.steady / 2)); g.r1 = 0;
    if (i > 0 && segs[i - 1].moving) segs[i - 1].r1 = g.r0;
    if (i < segs.length - 1 && segs[i + 1].moving) segs[i + 1].r0 = 0;
  }
  const quintic = (g, x) => {                                       // quintic Hermite, zero second derivative at both ends
    const h = g.t1 - g.t0, x3 = x * x * x, x4 = x3 * x, x5 = x4 * x, e = 10 * x3 - 15 * x4 + 6 * x5;
    return g.Ha + (g.Hb - g.Ha) * e + g.r0 * h * (x - 6 * x3 + 8 * x4 - 3 * x5) + g.r1 * h * (-4 * x3 + 7 * x4 - 3 * x5);
  };
  /** steady rate, then a C2 ease to rest over the last share e (the rate is constant until 1 - e, so it meets a quintic C2) */
  const steadyMove = (g, x) => {
    const e = g.steady, v = 1 / (1 - e / 2);
    if (x <= 1 - e) return g.Ha + (g.Hb - g.Ha) * v * x;
    const y = (x - (1 - e)) / e, y4 = y * y * y * y;
    return g.Ha + (g.Hb - g.Ha) * v * (1 - e + e * (y - y4 * (y * y - 3 * y + 2.5)));
  };
  const hourAngle = (g, x) => (g.steady ? steadyMove(g, x) : quintic(g, x));
  for (const g of segs) {                                           // keep every move monotone (halve a shared rate that overshoots)
    if (!g.moving || g.steady) continue;
    const i = segs.indexOf(g), fixed0 = i > 0 && segs[i - 1].steady, fixed1 = i < segs.length - 1 && segs[i + 1].steady;
    for (let guard = 0; guard < 8; guard++) {
      let mono = true, prev = g.Ha;
      for (let j = 1; j <= 200; j++) { const v = quintic(g, j / 200); if ((v - prev) * (g.Hb - g.Ha) < -1e-9) { mono = false; break; } prev = v; }
      if (mono || fixed0 || fixed1) break;
      g.r0 *= 0.5; g.r1 *= 0.5;
      if (i > 0 && segs[i - 1].moving) segs[i - 1].r1 = g.r0; if (i < segs.length - 1 && segs[i + 1].moving) segs[i + 1].r0 = g.r1;
    }
  }
  // the overlay's light pill: pressed once where the sun starts to move, on the mode the uninterrupted move ends in
  // (morning to blue through the sunset of shot 8 is ONE press on BLUE, as in the reference video)
  for (let i = segs.length - 1; i >= 0; i--) if (segs[i].moving && i < segs.length - 1 && segs[i + 1].moving) segs[i].target = segs[i + 1].target;
  for (let i = 1; i < segs.length; i++) if (segs[i].moving && segs[i - 1].moving) segs[i].pressT = segs[i - 1].pressT;
  function lightSeg(t) { let g = segs[segs.length - 1]; for (const q of segs) if (t < q.t1) { g = q; break; } return g; }
  /**
   * Light blend at film time t (pure): { a, b, k } for lighting.stateAt(). k = 0 whenever a === b.
   * Also carries hourAngleDeg (the sun's hour angle, + = afternoon), `active` (the mode the overlay highlights: the
   * one the sun is travelling to) and `since` (seconds since that pill was pressed; -1 while the light rests).
   */
  function lightAt(t) {
    if (override && override.mode) return typeof override.mode === 'string' ? { a: override.mode, b: override.mode, k: 0 } : override.mode;
    const g = lightSeg(t);
    if (!g.moving) return { a: g.a, b: g.a, k: 0, hourAngleDeg: g.Ha, active: g.a, since: -1 };
    const x = M.clamp((t - g.t0) / (g.t1 - g.t0)), H = hourAngle(g, x);
    return { a: g.a, b: g.b, k: M.clamp((H - g.Ha) / (g.Hb - g.Ha)), hourAngleDeg: H, active: g.target, since: t - g.pressT };
  }
  /** Sun position on the film's light timeline at t, whatever the debug override is: { elevationDeg, azimuthDeg (model), dir, hourAngleDeg }. */
  function sunAt(t) {
    const g = lightSeg(t), H = g.moving ? hourAngle(g, M.clamp((t - g.t0) / (g.t1 - g.t0))) : g.Ha;
    return { ...sunAtHourAngle(world.lighting, H), hourAngleDeg: H };
  }

  // ---- overlay state ---------------------------------------------------------------------------------
  const presets = shots.map((s, i) => (S.presetsForHUD && S.presetsForHUD[i]) || s.name);
  const modeNames = Object.keys(world.lighting.modes);
  const endCard = buildEndCard(world.conjectural);
  const TI = HUD_TIMING;
  /** seconds before the start of its hold at which the caption of a shot begins to fade in */
  const captionLead = (q) => (q.index === 0 ? 0 : M.clamp(TI.captionLeadShare * q.flight, TI.captionLeadMin, TI.captionLeadMax));
  // where a shot's own light plan starts the sun moving inside the hold, the caption comes with that press
  // ("Evening on a roof ..." appears as the day begins to pass, not over the morning roofs of the flight in)
  const captionIn = shots.map((q) => {
    const move = q.lightTimeline ? segs.find((g) => g.moving && g.t0 >= q.tHold - 1e-9 && g.t0 < q.t1) : null;
    return move ? move.t0 - TI.captionFade / 2 : q.tHold - captionLead(q);
  });
  /**
   * Everything the overlay shows at film time t (pure). The documented captionAt() is a subset of this.
   * { title: { text, sub, opacity, subOpacity }, caption: { text, opacity, shot },
   *   bar: { opacity, presets, activePreset, presetPress, modes, activeMode, modePress },
   *   endCard: { heading, groups: [{ label, items }], lines, opacity } }
   */
  function hudAt(t) {
    const st = stateAt(M.clamp(t, 0, duration)), s = shots[st.index], lastShot = shots[shots.length - 1];
    // the end card: from the last flight (endCardLead before the camera arrives) to the last frame
    const endT0 = lastShot.tHold - TI.endCardLead, endK = M.smoothstep(endT0, endT0 + TI.endFade, t);
    // caption of the shot whose hold is nearest: in during the second half of the flight, out just after the camera leaves
    let cap = { text: '', opacity: 0, shot: null };
    for (const q of shots) {
      const tin = q.index === 0 ? TI.firstCaption : captionIn[q.index];
      const out = q === lastShot ? 1 : M.smoothstep(q.t1 + TI.captionTail, q.t1 + TI.captionTail - TI.captionFade, t);
      const o = Math.min(M.smoothstep(tin, tin + TI.captionFade, t), out);
      if (o > cap.opacity) cap = { text: q.caption, opacity: o, shot: q.n };
    }
    const light = lightAt(t);
    const pressAt = (since) => (since < 0 ? 0 : Math.exp(-since / TI.press));
    return {
      title: { text: TI.title, sub: TI.subtitle, opacity: M.smoothstep(0.25, 1.05, t), subOpacity: Math.min(M.smoothstep(0.7, 1.5, t), M.smoothstep(TI.subtitleOut + 0.8, TI.subtitleOut, t)) },
      caption: cap,
      bar: {
        opacity: M.smoothstep(0.5, 1.3, t),
        presets, activePreset: s.index, presetPress: s.index > 0 ? pressAt(t - s.tIn) : 0,
        modes: modeNames, activeMode: Math.max(0, modeNames.indexOf(light.active || light.b)), modePress: pressAt(light.since ?? -1),
      },
      endCard: { ...endCard, opacity: endK },
    };
  }
  /** Overlay text at film time t (pure): { caption: { text, opacity }, title: { text, sub, opacity }, endCard: { lines, opacity } }. */
  function captionAt(t) {
    const h = hudAt(t);
    return { caption: { text: h.caption.text, opacity: h.caption.opacity }, title: { text: h.title.text, sub: h.title.sub, opacity: h.title.opacity }, endCard: { lines: h.endCard.lines, opacity: h.endCard.opacity } };
  }

  // ---- HUD (DOM) -------------------------------------------------------------------------------------
  const hud = typeof document !== 'undefined' && document.getElementById('hud') ? createHud(document.getElementById('hud'), { presets, modes: modeNames }) : null;
  let debugHud = (ctx.flags && ctx.flags.hud === 2) || false;
  /** Speed (m/s) and turn rate (degrees / s) of the film path at t, by central difference over one frame. */
  function motionAt(t) {
    const h = 0.5 / fps, a = path.stateAt(warp(t - h)), b = path.stateAt(warp(t + h));
    const da = M.angleDiffDeg(a.az, b.az) * Math.cos(((a.el + b.el) / 2) * M.DEG), de = b.el - a.el;
    return { speed: Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) / (2 * h), turn: Math.hypot(da, de) / (2 * h) };
  }
  /** Update the DOM overlay for film time t. Hidden with hud=0 and under a debug camera. `tag` = debug label (contact sheets). */
  function updateHud(t, tag = null) {
    if (!hud) return;
    const on = ctx.flags.hud !== 0 && (!override || !!ctx.flags.web);   // web build: the overlay stays under free look
    let dbg = null;
    if (debugHud) {
      const sa = shotAt(t), p = poseAt(t), l = lightAt(t), mo = motionAt(t);
      dbg = { t, frame: Math.round(t * fps), shot: sa.shot, local: sa.local, inTransition: sa.inTransition, k: sa.k, light: l, pose: p, speed: mo.speed, turn: mo.turn, override: !!override };
    }
    // a bare "t=..." tag of the harness gets the shot and the light appended (contact sheets of film times)
    if (tag && /^t=/.test(tag)) { const sa = shotAt(t), l = lightAt(t); tag = `${tag}  ${sa.shot.n} ${sa.shot.name}${sa.inTransition ? ' (flight)' : ''}  ${l.k > 0 && l.a !== l.b ? l.a + '>' + l.b : l.a}`; }
    hud.update(hudAt(t), { visible: on, tag, debug: dbg });
  }

  const film = {
    impl: 'real',
    duration, fps, shots,
    shotAt, poseAt, pathPoseAt, lightAt, captionAt, updateHud, depthRange,
    /** Film time at the middle of the hold of shot n (1-based) or id. */
    shotMid(nOrId) { const s = shots.find((q) => q.n === nOrId || q.id === nOrId); if (!s) throw new Error(`film: no shot '${nOrId}'`); return s.mid; },
    /** Apply a pose to a THREE.PerspectiveCamera (position, orientation, fov, near, far). */
    applyCamera(camera, pose) {
      camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
      camera.fov = pose.fov; camera.near = pose.near; camera.far = pose.far;
      camera.lookAt(pose.look[0], pose.look[1], pose.look[2]);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    },
    /**
     * Debug camera override (null clears it). While set, poseAt()/lightAt() ignore the timeline.
     * o: { pos: [x, y, z], look: [x, y, z], fov?: 50, up?: [0, 1, 0], near?, far?,
     *      mode?: 'golden' | 'afternoon' | 'morning' | 'blue' | {a, b, k} (default: the timeline's mode at t),
     *      fog?: number (multiplier on fog density, 0 = off), lod?: { fixed: metres } | { scale: number },
     *      shadowRadius?: metres, debug?: boolean (show ctx.LAYERS.DEBUG) }
     */
    setOverride(o) { override = o ? { ...o } : null; },
    get override() { return override; },

    // ---- additions (docs/film.md) ----------------------------------------------------------------------
    /** Designed length of the film in world.json (58 s); `duration` is the real one. */
    designedDuration: S.totalDuration,
    /** Flights and holds in film order: [{ kind: 'hold' | 'flight', shot, from (previous shot, flights only), t0, t1 }]. */
    segments: shots.flatMap((s, i) => (i === 0 ? [] : [{ kind: 'flight', shot: s, from: shots[i - 1], t0: s.tIn, t1: s.tHold }]).concat([{ kind: 'hold', shot: s, from: null, t0: s.tHold, t1: s.t1 }])),
    /** Path state without near / far: { pos, look, fov, az, el (degrees), index, inTransition, progress }. */
    stateAt: (t) => { const st = stateAt(t); return { ...st, pos: st.pos.slice(), look: st.look.slice() }; },
    /**
     * The straight, constant-velocity line of a hold for ANY film time: it runs on before the hold begins and after
     * it ends. A thing the camera rides (the boat of shot 5) follows THIS, not pathPoseAt, so that it is already
     * under way where the camera lands on it and sails on when the camera has left.
     * rideAt(n | id, t) -> { pos, look, fov, velocity: [vx, vy, vz] (m/s), speed, headingDeg (model azimuth of travel) }.
     * Inside the hold rideAt(n, t).pos equals pathPoseAt(t).pos exactly.
     */
    rideAt(nOrId, t) {
      const s = shots.find((q) => q.n === nOrId || q.id === nOrId); if (!s) throw new Error(`film: no shot '${nOrId}'`);
      const h = path.holds[s.index], e = 0.01, a = h.at(t), p0 = h.at(t - e).pos, p1 = h.at(t + e).pos;
      const velocity = [(p1[0] - p0[0]) / (2 * e), (p1[1] - p0[1]) / (2 * e), (p1[2] - p0[2]) / (2 * e)];
      return { pos: a.pos.slice(), look: a.look.slice(), fov: a.fov, velocity, speed: Math.hypot(velocity[0], velocity[1], velocity[2]), headingDeg: M.dirToAz(velocity[0], velocity[2]) };
    },
    /** { speed (m/s), turn (degrees / s) } of the film path at t. */
    motionAt,
    /** Full overlay state at t (pure); see hudAt above. */
    hudAt,
    /**
     * How close the camera of the FILM PATH ever comes to a point: nearestApproach([x, y, z] | (t) => [x, y, z] | null,
     * { from, to }) -> { dist (m), t (film time), pos (camera position then) }. A function of t is a thing that moves
     * (a figure on the boat: rideAt(n, t).pos plus its offset). The camera lands on and leaves its low standpoints
     * along the ground (docs/film.md "corridors"): a figure, a pole or a bow nearer than about 0.8 m to the path is
     * flown THROUGH and shows its inside for a frame. Sampled at 240 Hz with exact distances between the samples.
     */
    nearestApproach(target, opts = {}) {
      const HZ = 240, n = Math.round(duration * HZ);
      if (!approachTable) { approachTable = new Float64Array((n + 1) * 3); for (let i = 0; i <= n; i++) approachTable.set(path.stateAt(warp(i / HZ)).pos, i * 3); }
      const tab = approachTable, fn = typeof target === 'function' ? target : null;
      const i0 = Math.max(0, Math.floor((opts.from ?? 0) * HZ)), i1 = Math.min(n, Math.ceil((opts.to ?? duration) * HZ));
      const rel = (i) => { const q = fn ? fn(i / HZ) : target; return q ? [tab[i * 3] - q[0], tab[i * 3 + 1] - q[1], tab[i * 3 + 2] - q[2]] : null; };
      let best = Infinity, bestT = i0 / HZ, a = rel(i0);
      if (a && i1 === i0) best = Math.hypot(a[0], a[1], a[2]);
      for (let i = i0; i < i1; i++) {
        const b = rel(i + 1);
        if (a && b) {                                              // distance from the origin to the segment a..b of the relative motion
          const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L2 = dx * dx + dy * dy + dz * dz;
          const k = L2 > 0 ? M.clamp(-(a[0] * dx + a[1] * dy + a[2] * dz) / L2) : 0;
          const d = Math.hypot(a[0] + dx * k, a[1] + dy * k, a[2] + dz * k);
          if (d < best) { best = d; bestT = (i + k) / HZ; }
        }
        a = b;
      }
      return { dist: best, t: bestT, pos: path.stateAt(warp(bestT)).pos.slice() };
    },
    /** The camera-path internals (camera.js): transitions[i] = { T, length, chain, curve, sAt(tau), turnDeg, ... }. */
    path,
    /** Light nodes of the whole film: [{ t0, t1, a, b, Ha, Hb, moving, r0, r1 (degrees of hour angle / s at the ends), steady, pressT, target }]. */
    lightSegments: segs,
    /** The sun on the film's light timeline at t: { elevationDeg, azimuthDeg (model), dir, hourAngleDeg }. Ignores the debug override. */
    sunAt,
    /** Debug readout (t, shot, mode, camera): on with hud=2 or film.debugHud = true. Off by default. */
    get debugHud() { return debugHud; },
    set debugHud(v) { debugHud = !!v; },
    hud,
  };
  return film;
}
