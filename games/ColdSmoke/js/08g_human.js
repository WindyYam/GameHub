"use strict";
// ---------------------------------------------------------------- the human lab's body and motion (generated: do not edit here)
// Made by code-only-game-kit research/human/tools/export_rider.js from its dist/human.js: the skeleton, the ski and board solvers, Human.Turn
// (a whole turn from its phase, amplitude and speed) and Human.Moves (jumps and air tricks), and the riders' motion sets. Read by 08i_labride.js.
// ---------------------------------------------------------------- Human: small vector / quaternion / dual-quaternion helpers
// The human body module (human/) is self-contained: it reads no game globals and can be dropped into any page.
// Everything lives under the one global `Human`.
var Human = (typeof Human !== 'undefined' && Human) || {};
(() => {
  const V = Human.v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  };
  // quaternions [x, y, z, w]
  const Q = Human.q = {
    id: () => [0, 0, 0, 1],
    axis(ax, ang) { const s = Math.sin(ang / 2), n = V.norm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)]; },
    mul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; },
    conj: a => [-a[0], -a[1], -a[2], a[3]],
    norm(a) { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; },
    rot(q, v) { const x = q[0], y = q[1], z = q[2], w = q[3], tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
      return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx]; },
    // intrinsic X then Y then Z (radians)
    euler(x, y, z) { return Q.mul(Q.mul(Q.axis([1, 0, 0], x), Q.axis([0, 1, 0], y)), Q.axis([0, 0, 1], z)); },
    slerp(a, b, t) { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (d < 0) { b = b.map(v => -v); d = -d; }
      if (d > 0.9995) return Q.norm(a.map((v, i) => v + (b[i] - v) * t)); const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s; return a.map((v, i) => v * wa + b[i] * wb); },
    // swing-twist about a unit axis: returns [swing, twist], q = swing * twist
    swingTwist(q, ax) { const d = q[0] * ax[0] + q[1] * ax[1] + q[2] * ax[2]; let tw = [ax[0] * d, ax[1] * d, ax[2] * d, q[3]]; const l = Math.hypot(...tw); tw = l < 1e-9 ? [0, 0, 0, 1] : tw.map(v => v / l); return [Q.mul(q, Q.conj(tw)), tw]; },
    angle(q) { return 2 * Math.atan2(Math.hypot(q[0], q[1], q[2]), Math.abs(q[3])); },
    pow(q, t) { const [x, y, z, w] = q[3] < 0 ? q.map(v => -v) : q, s = Math.hypot(x, y, z); if (s < 1e-9) return [0, 0, 0, 1]; const a = Math.atan2(s, w) * t; return [x / s * Math.sin(a), y / s * Math.sin(a), z / s * Math.sin(a), Math.cos(a)]; },
  };
  Human.clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  Human.smooth = (a, b, x) => { const t = Human.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  Human.smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  Human.DEG = Math.PI / 180;
})();

// ---------------------------------------------------------------- Human: body parameters -> measurements
// A few numbers (sex, stature, mass, body fat, frame) become the measurements the body is built to: girths, breadths, landmark heights.
// All the numbers are from ANSUR II (US Army anthropometric survey, 2012, public release 2017; 4,082 men and 1,986 women), regressions fitted on the
// raw CSVs (see research/03_body_shape.md). Lengths in metres, mass in kg. sex: 0 = male, 1 = female (a blend, for the mannequin's shape only).
(() => {
  const lerp = (a, b, t) => a + (b - a) * t;
  // girth = c0 + cS * S(mm) + cM * kg  (male, female)
  const REG = {
    chest:   [[1036, -0.291, 6.23], [990, -0.329, 7.27]],
    waist:   [[1025, -0.436, 7.96], [1014, -0.472, 9.08]],
    buttock: [[808, -0.140, 5.35], [847, -0.178, 6.86]],
    thigh:   [[595, -0.184, 4.13], [584, -0.194, 5.14]],
    calf:    [[351, -0.068, 1.89], [306, -0.051, 2.23]],
    biceps:  [[380, -0.122, 2.25], [341, -0.140, 2.83]],    // flexed: the relaxed arm is taken as 0.9 of it
    neck:    [[408, -0.085, 1.63], [306, -0.047, 1.48]],
    biacromial: [[205, 0.092, 0.59], [132, 0.128, 0.36]],
  };
  // + 1 % body fat at the same stature and mass (mm): fat moves out of the limbs' muscle and into the trunk (men) or hips and thighs (women)
  const BF = { biceps: [-2.2, -0.7], forearm: [-1.7, -1.1], calf: [-1.0, -1.8], thigh: [0.1, 2.1], chest: [1.8, 2.7], buttock: [1.3, 2.9], waist: [2.5, 1.5] };
  const BF_MEAN = [21.7, 30];          // (the women's 36 % from the Navy formula is an overestimate; 30 is used as their centre)
  // landmark heights as a fraction of stature (male, female)
  const LM = { c7: [0.864, 0.857], notch: [0.819, 0.816], acromion: [0.820, 0.820], nipple: [0.735, 0.719], rib10: [0.638, 0.648], crest: [0.604, 0.611],
    navel: [0.601, 0.602], troch: [0.513, 0.519], crotch: [0.482, 0.480], patella: [0.278, 0.276], tibiale: [0.266, 0.269], malleolus: [0.042, 0.039] };
  // means for the measures with no regression (mm at the sexes' mean stature and mass): scaled as girth ~ sqrt(mass / stature)
  const MEAN = { S: [1756, 1629], kg: [85.5, 67.8], forearm: [310 * 0.9, 264 * 0.9], wrist: [176, 155], ankle: [229, 216], lowthigh: [409, 401],
    foot: [271, 246], footB: [102, 93], hand: [193, 181], head: [574, 561], headB: [154, 148], headL: [200, 190], hip: [346, 354], bicristal: [275, 273] };

  Human.DEFAULTS = { sex: 0, stature: 1.756, mass: 75, bodyFat: 18, frame: 0, def: 1 };
  Human.PRESETS = { male: { sex: 0, stature: 1.756, mass: 75, bodyFat: 18, frame: 0, def: 1 }, female: { sex: 1, stature: 1.629, mass: 60, bodyFat: 27, frame: 0, def: 1 } };

  Human.measure = (p = {}) => {
    p = Object.assign({}, Human.DEFAULTS, p);
    const s = Human.clamp(p.sex, 0, 1), S = p.stature * 1000, kg = p.mass;
    const reg = k => { const [m, f] = REG[k]; return lerp(m[0] + m[1] * S + m[2] * kg, f[0] + f[1] * S + f[2] * kg, s); };
    const dBF = p.bodyFat - lerp(BF_MEAN[0], BF_MEAN[1], s);
    const bf = k => BF[k] ? lerp(BF[k][0], BF[k][1], s) * dBF : 0;
    const mean = k => lerp(MEAN[k][0], MEAN[k][1], s);
    const sc = Math.sqrt((kg / mean('kg')) / (S / mean('S')));     // girth scale for the measures with no regression
    const G = {                                                   // girths, mm
      chest: reg('chest') + bf('chest'), waist: reg('waist') + bf('waist'), buttock: reg('buttock') + bf('buttock'), thigh: reg('thigh') + bf('thigh'),
      calf: reg('calf') + bf('calf'), arm: 0.9 * reg('biceps') + bf('biceps'), neck: reg('neck'),
      forearm: mean('forearm') * sc + bf('forearm'), wrist: mean('wrist') * Math.sqrt(sc), ankle: mean('ankle') * Math.sqrt(sc), lowthigh: mean('lowthigh') * sc + 0.5 * bf('thigh'),
    };
    const B = {                                                   // breadths and lengths, mm
      biacromial: reg('biacromial') * (1 + 0.06 * p.frame), hip: mean('hip') * Math.sqrt(sc) + bf('buttock') * 0.4, bicristal: mean('bicristal') * (S / mean('S')),
      foot: mean('foot') * S / mean('S'), footB: mean('footB') * S / mean('S'), hand: mean('hand') * S / mean('S'),
      headB: mean('headB') * Math.pow(S / mean('S'), 0.3), headL: mean('headL') * Math.pow(S / mean('S'), 0.3),
    };
    const L = {}; for (const k in LM) L[k] = lerp(LM[k][0], LM[k][1], s) * S;
    // density 1.06 kg/L at ~18 % fat (Siri: 1 / D = 4.95 / (%BF/100 + 4.5)) -> the volume the body must hold
    const dens = 4.95 / (p.bodyFat / 100 + 4.5);
    return { p, sex: s, S, kg, bfDelta: dBF, G, B, L, density: dens, volume: kg / dens /* litres */ };
  };
})();

// ---------------------------------------------------------------- Human: the skeleton (59 bones) and how a pose is turned into bone rotations
// Coordinates: metres, y up, z forward (the way the body faces), x to the body's LEFT. Canonical rest pose: the T-pose, arms straight out along
// +-x, palms down, thumbs forward; legs straight, feet forward. Every bone's rest frame is the world frame, so a bone's local rotation is simply its
// rotation relative to its parent, and a point given in canonical space x_c rides bone b to  R_b (x_c - J_b) + P_b.
// Bone list: the research/02 Tier A list (VRM / Unity Humanoid superset): scapula, twist bones, a 5-piece spine and the foot bones are driven by
// code from measured rhythms and are never set directly.
// A pose is given anatomically (degrees): spine flexion, arm elevation and plane, hip flexion ... (see Human.restPose), and turned into bone rotations
// here: the spine's bend spread over five bones by measured shares, the shoulder girdle placed by the scapulohumeral rhythm, pronation spread over the
// forearm by twist bones. The right side is computed as the left and mirrored.
(() => {
  const V = Human.v3, Q = Human.q, D = Human.DEG, clamp = Human.clamp;
  // name, parent, canonical joint position (mm, at stature 1756; left side, +x), and which landmark scale applies
  const BONES = [
    ['root', null, [0, 0, 0]],
    ['pelvis', 'root', [0, 930, -20]],
    ['lumbar_lo', 'pelvis', [0, 1010, -58]],
    ['lumbar_hi', 'lumbar_lo', [0, 1095, -60]],
    ['thorax_lo', 'lumbar_hi', [0, 1180, -64]],
    ['thorax_mid', 'thorax_lo', [0, 1280, -70]],
    ['thorax_hi', 'thorax_mid', [0, 1390, -68]],
    ['neck_lo', 'thorax_hi', [0, 1505, -58]],
    ['neck_hi', 'neck_lo', [0, 1562, -40]],
    ['head', 'neck_hi', [0, 1608, -22]],
    ['jaw', 'head', [0, 1605, 2]],
    ['eye_L', 'head', [32, 1668, 72]],
    ['eye_R', 'head', [-32, 1668, 72]],
  ];
  const SIDE = [
    ['clavicle', 'thorax_hi', [22, 1440, 48]],
    ['scapula', 'clavicle', [182, 1446, -12]],
    ['upperarm', 'scapula', [176, 1404, -6]],
    ['upperarm_twist_01', 'upperarm', [176 + 110, 1404, -6]],
    ['upperarm_twist_02', 'upperarm', [176 + 220, 1404, -6]],
    ['forearm', 'upperarm', [506, 1404, -6]],
    ['forearm_twist_01', 'forearm', [506 + 85, 1404, -6]],
    ['forearm_twist_02', 'forearm', [506 + 170, 1404, -6]],
    ['hand', 'forearm', [762, 1404, -6]],
    ['thumb_cmc', 'hand', [774, 1394, 18]],
    ['thumb_mcp', 'thumb_cmc', [806, 1388, 42]],
    ['thumb_ip', 'thumb_mcp', [834, 1386, 56]],
    ['fingers_mcp', 'hand', [858, 1402, -2]],
    ['fingers_ip', 'fingers_mcp', [902, 1401, -2]],
    ['thigh', 'pelvis', [88, 895, 4]],
    ['thigh_twist', 'thigh', [89, 683, 4]],
    ['shin', 'thigh', [91, 490, 2]],          // the knee turns about the femur's condyles, ~2 cm above the joint line (tibiale, 0.266 H)
    ['shin_twist', 'shin', [91, 272, 0]],
    ['talus', 'shin', [91, 76, -6]],
    ['foot', 'talus', [91, 50, -20]],
    ['midfoot', 'foot', [96, 36, 46]],
    ['toe_hallux', 'midfoot', [72, 20, 140]],
    ['toes_lesser', 'midfoot', [112, 16, 124]],
  ];
  for (const sd of ['L', 'R']) for (const [n, par, j] of SIDE)
    BONES.push([n + '_' + sd, par === 'pelvis' || par === 'thorax_hi' ? par : par + '_' + sd, sd === 'L' ? j : [-j[0], j[1], j[2]]]);
  Human.BONE_NAMES = BONES.map(b => b[0]);
  const REF = {}; BONES.forEach(b => REF[b[0]] = b[2]);             // reference joint positions (mm, stature 1756)

  // canonical joint positions for a body: heights scale with stature (the landmark fractions are near constant across people), the shoulders with
  // the biacromial breadth, the hips with the pelvis
  function build(M) {
    const k = M.S / 1756, sh = M.B.biacromial / 411 / k, hp = (M.B.bicristal / 275) * (1 + 0.05 * M.sex) / k * (M.S / 1756) / k;
    const bones = BONES.map(([name, parent, j], i) => {
      let x = j[0], y = j[1], z = j[2];
      const arm = /clavicle|scapula|upperarm|forearm|hand|thumb|fingers/.test(name) && !/clavicle/.test(name);
      if (arm) x = Math.sign(x) * (Math.abs(x) - 176 + 176 * sh);               // the whole arm moves out with the shoulder
      else if (/scapula/.test(name)) x *= sh;
      if (/thigh|shin|talus|foot|toe/.test(name)) x *= hp;
      return { name, parent, i, J: [x * k / 1000, y * k / 1000, z * k / 1000] };
    });
    const idx = {}; bones.forEach(b => idx[b.name] = b.i);
    bones.forEach(b => { b.p = b.parent ? idx[b.parent] : -1; });
    bones.forEach(b => { b.children = bones.filter(c => c.p === b.i).map(c => c.i); });
    return { bones, idx, M, n: bones.length };
  }

  // ---- the anatomical pose (degrees). Zero is the anatomical standing position with the palms facing the thighs (forearm mid-prone).
  // arm: elev = thoracohumeral elevation from hanging (0) through horizontal (90) to overhead (180); plane = 0 out to the side (abduction plane),
  // 90 straight forward (flexion plane), -45 behind; axial = humeral rotation (+ internal); elbow flexion; pron (+ pronation, - supination);
  // wflex (+ palm-ward), wdev (+ ulnar); grip 0..1 (fingers curl); thumb 0..1. shrug, protract: extra clavicle elevation / protraction (deg).
  // leg: flex (hip), abd (+ out), rot (+ internal), knee (flexion), ankle (+ plantarflexion, - dorsiflexion), inv (+ inversion, subtalar), toe (+ up).
  // spine: flex (+ forward), lat (+ to the left), twist (+ shoulders turned to the left). neck: flex, lat, yaw (+ to the left).
  // root: pos (metres, added to the pelvis), rot (deg, x y z intrinsic: x + tips the pelvis forward).
  Human.restPose = () => ({
    root: { pos: [0, 0, 0], rot: [0, 0, 0], spin: 0, flip: 0 }, spine: { flex: 0, lat: 0, twist: 0 }, neck: { flex: 0, lat: 0, yaw: 0 }, jaw: 0, plant: [0, 0], unbind: 0,   // plant: how far each ski pole (L, R) is planted in the snow, 0..1; unbind: 1 = the rear foot is out of its board binding (one-foot skating)
   
    arm_L: { elev: 0, plane: 0, axial: 0, elbow: 0, pron: 0, wflex: 0, wdev: 0, grip: 0.3, thumb: 0.25, shrug: 0, protract: 0 },
    arm_R: { elev: 0, plane: 0, axial: 0, elbow: 0, pron: 0, wflex: 0, wdev: 0, grip: 0.3, thumb: 0.25, shrug: 0, protract: 0 },
    leg_L: { flex: 0, abd: 0, rot: 0, knee: 0, ankle: 0, inv: 0, toe: 0 },
    leg_R: { flex: 0, abd: 0, rot: 0, knee: 0, ankle: 0, inv: 0, toe: 0 },
  });
  // joint ranges (CDC / Soucie 2011 and AAOS normative values; research/02). A pose outside them is clamped and the overrun reported.
  // Ankle dorsiflexion is the weight-bearing value (knee-to-wall lunge, about 35-45 deg in healthy adults; Bennell 1998), not the 20 deg passive value:
  // squats, landings, ski and snowboard stances all load the ankle.
  const ROM = {
    spine: { flex: [-30, 90], lat: [-35, 35], twist: [-45, 45] }, neck: { flex: [-55, 50], lat: [-40, 40], yaw: [-75, 75] },
    arm: { elev: [0, 175], plane: [-90, 135], axial: [-90, 70], elbow: [0, 148], pron: [-85, 80], wflex: [-65, 75], wdev: [-20, 30], grip: [0, 1], thumb: [0, 1], shrug: [-10, 30], protract: [-20, 30] },
    leg: { flex: [-18, 130], abd: [-20, 45], rot: [-45, 45], knee: [0, 140], ankle: [-35, 55], inv: [-10, 25], toe: [-35, 80] },
  };
  Human.ROM = ROM;
  Human.clampPose = pose => {
    const over = [];
    const cl = (o, R, tag) => { for (const k in R) if (o[k] != null) { const [a, b] = R[k], v = clamp(o[k], a, b); if (v !== o[k]) over.push([tag + '.' + k, o[k] - v]); o[k] = v; } };
    cl(pose.spine, ROM.spine, 'spine'); cl(pose.neck, ROM.neck, 'neck');
    for (const s of ['L', 'R']) { cl(pose['arm_' + s], ROM.arm, 'arm_' + s); cl(pose['leg_' + s], ROM.leg, 'leg_' + s); }
    // hip internal rotation shrinks as the hip flexes (est.); deep flexion with the knee straight is limited by the hamstrings
    for (const s of ['L', 'R']) { const l = pose['leg_' + s]; const lim = 45 - 15 * clamp(l.flex / 110, 0, 1); if (l.rot > lim) { over.push(['leg_' + s + '.rot', l.rot - lim]); l.rot = lim; }
      const ham = 80 + 1.0 * l.knee; if (l.flex > ham) { over.push(['leg_' + s + '.flex(hamstrings)', l.flex - ham]); l.flex = ham; } }
    return over;
  };

  // shares of the trunk's bend per spine bone (lumbar_lo .. thorax_hi) and of the neck's per neck bone (neck_lo, neck_hi, head)
  const SPINE = { flex: [0.32, 0.24, 0.16, 0.14, 0.14], lat: [0.18, 0.22, 0.24, 0.22, 0.14], twist: [0.04, 0.06, 0.25, 0.35, 0.30] };
  const NECK = { flex: [0.30, 0.35, 0.35], lat: [0.35, 0.35, 0.30], yaw: [0.2, 0.3, 0.5] };
  const mirror = q => [q[0], -q[1], -q[2], q[3]];
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  const ax = (a, deg) => Q.axis(a, deg * D);
  const HANG = ax(Z, -90);                         // T-pose arm (+x, palm down) -> hanging (palm toward the thigh)

  // the left arm's rotations in the thorax frame (as if the thorax were at rest): clavicle, scapula, humerus; then local rotations below the humerus
  function armLocal(a) {
    const e = a.elev, s = clamp((e - 15) / 135, 0, 1);
    // scapulohumeral rhythm (McClure 2001): through the raise the clavicle lifts 10 deg and draws back 20, the scapula turns upward 50, tilts back 30
    const clav = Q.mul(ax(Y, 20 * s - a.protract), ax(Z, 10 * s + a.shrug));
    const scapTh = Q.mul(clav, Q.mul(ax(Z, 40 * s), Q.mul(ax(X, -30 * s), ax(Y, 4 * s))));
    // humerus: from hanging, swung up by elev in the chosen plane, then turned about its own axis
    const pl = a.plane * D, swingAx = [-Math.sin(pl), 0, Math.cos(pl)];
    const sw = Q.axis(swingAx, e * D);
    const dir = Q.rot(sw, [0, -1, 0]);
    // the humerus keeps the palm's natural turn when raised in front (Codman): axial counted from that
    const humTh = Q.mul(Q.axis(dir, -a.axial * D), Q.mul(sw, HANG));
    const pr = a.pron * D;
    return {
      clavicle: clav,
      scapula: Q.mul(Q.conj(clav), scapTh),
      upperarm: Q.mul(Q.conj(scapTh), humTh),
      forearm: ax(Y, -a.elbow),
      hand: Q.mul(Q.axis(X, pr), Q.mul(ax(Z, -a.wflex), ax(Y, a.wdev))),
      fingers_mcp: ax(Z, -80 * a.grip), fingers_ip: ax(Z, -95 * a.grip),
      thumb_cmc: Q.mul(ax(X, 35 * a.thumb), ax(Z, -15 * a.thumb)), thumb_mcp: ax(Y, -35 * a.thumb), thumb_ip: ax(Y, -45 * a.thumb),
    };
  }
  const SUBTALAR = V.norm([-Math.sin(16 * D) * Math.cos(42 * D), Math.sin(42 * D), Math.cos(16 * D) * Math.cos(42 * D)]);
  const TALOCRURAL = V.norm([1, -Math.tan(8 * D), 0]);      // ~82 deg from vertical (Inman), the lateral end lower
  function legLocal(l) {
    return {
      thigh: Q.mul(ax(X, -l.flex), Q.mul(ax(Z, l.abd), ax(Y, -l.rot))),
      thigh_twist: ax(Y, l.rot * 0.5),                                       // the upper thigh's flesh follows half of the femur's own turn
      shin: Q.mul(ax(X, l.knee), ax(Y, -12 * clamp(l.knee / 90, 0, 1) + 4 * clamp(1 - l.knee / 15, 0, 1))),  // tibia turns in as the knee bends (screw-home)
      shin_twist: Q.id(),
      talus: Q.axis(TALOCRURAL, l.ankle * D),
      foot: Q.axis(SUBTALAR, -l.inv * D),
      midfoot: Q.id(),
      toe_hallux: ax(X, -l.toe), toes_lesser: ax(X, -l.toe * 0.85),
    };
  }

  // anatomical pose -> local rotation per bone (array of quaternions) + root position
  function poseLocals(sk, pose) {
    const L = sk.bones.map(() => Q.id()), I = sk.idx;
    const r = pose.root.rot;
    // root.spin: a turn about the vertical in the world (deg), root.flip: a turn about the side-to-side axis (- = backflip), both outside the
    // body's own lean, for tricks in the air
    L[I.pelvis] = Q.mul(Q.mul(Q.axis([0, 1, 0], (pose.root.spin || 0) * D), Q.axis([1, 0, 0], (pose.root.flip || 0) * D)), pose.root.yf ? Q.mul(Q.mul(Q.axis([0, 1, 0], r[1] * D), Q.axis([1, 0, 0], r[0] * D)), Q.axis([0, 0, 1], r[2] * D)) : Q.euler(r[0] * D, r[1] * D, r[2] * D));
    // (root.yf: the yaw outermost, so pitch and roll stay the body's own when it is turned across the hill: review adjust9)
    const sp = pose.spine, nk = pose.neck;
    ['lumbar_lo', 'lumbar_hi', 'thorax_lo', 'thorax_mid', 'thorax_hi'].forEach((n, i) =>
      L[I[n]] = Q.mul(ax(X, sp.flex * SPINE.flex[i]), Q.mul(ax(Z, -sp.lat * SPINE.lat[i]), ax(Y, sp.twist * SPINE.twist[i]))));
    ['neck_lo', 'neck_hi', 'head'].forEach((n, i) =>
      L[I[n]] = Q.mul(ax(X, nk.flex * NECK.flex[i]), Q.mul(ax(Z, -nk.lat * NECK.lat[i]), ax(Y, nk.yaw * NECK.yaw[i]))));
    L[I.jaw] = ax(X, pose.jaw || 0);
    for (const s of ['L', 'R']) {
      const set = (o, mir) => { for (const k in o) { const q = o[k]; L[I[k + '_' + s]] = mir ? mirror(q) : q; } };
      const arm = armLocal(pose['arm_' + s]);
      // forearm twist bones as absolute shares of the pronation about the forearm axis (they are children of the forearm, which does not pronate)
      const pr = pose['arm_' + s].pron * D;
      arm.forearm_twist_01 = Q.axis(X, pr * 0.33); arm.forearm_twist_02 = Q.axis(X, pr * 0.66);
      // upper-arm twist bones: the humerus carries the full axial turn; the flesh near the shoulder is turned back by half, mid-arm by a quarter
      const axl = pose['arm_' + s].axial * D, hdir = [1, 0, 0];
      arm.upperarm_twist_01 = Q.axis(hdir, axl * 0.5); arm.upperarm_twist_02 = Q.axis(hdir, axl * 0.25);
      set(arm, s === 'R');
      set(legLocal(pose['leg_' + s]), s === 'R');
    }
    return L;
  }

  // forward kinematics: world rotation R and position P per bone
  function fk(sk, L, rootPos) {
    const n = sk.n, R = new Array(n), P = new Array(n);
    for (const b of sk.bones) {
      if (b.p < 0) { R[b.i] = L[b.i]; P[b.i] = b.J.slice(); continue; }
      const pr = R[b.p];
      R[b.i] = Q.norm(Q.mul(pr, L[b.i]));
      P[b.i] = V.add(P[b.p], Q.rot(pr, V.sub(b.J, sk.bones[b.p].J)));
      if (b.name === 'pelvis' && rootPos) P[b.i] = V.add(P[b.i], rootPos);
    }
    return { R, P };
  }
  // a pose -> world transforms (clamped to the joint ranges first; the overrun is returned)
  function pose(sk, anat) {
    const p = JSON.parse(JSON.stringify(anat)), over = Human.clampPose(p);
    const xf = fk(sk, poseLocals(sk, p), p.root.pos);
    xf.over = over; xf.anat = p;
    return xf;
  }
  // canonical point -> posed point on bone b
  const apply = (xf, sk, b, x) => V.add(xf.P[b], Q.rot(xf.R[b], V.sub(x, sk.bones[b].J)));
  const applyInv = (xf, sk, b, p) => V.add(sk.bones[b].J, Q.rot(Q.conj(xf.R[b]), V.sub(p, xf.P[b])));

  // interpolate two anatomical poses (every number linearly; the joint maths downstream keeps it smooth)
  Human.lerpPose = (a, b, t) => {
    // spin and flip are whole turns in the air: they take the short way round, so -358 to 0 is a 2 degree step and not a turn backwards
    const wrap = (x, y) => x + ((((y - x) % 360) + 540) % 360 - 180) * t;
    const f = (x, y, k) => (k === 'spin' || k === 'flip') ? wrap(x || 0, y || 0) : typeof x === 'number' ? x + (y - x) * t : Array.isArray(x) ? x.map((v, i) => f(v, y[i])) : Object.fromEntries(Object.keys(x).map(k => [k, f(x[k], y[k] != null ? y[k] : x[k], k)]));
    return f(a, b);
  };
  Human.Skeleton = { REF, build, pose, poseLocals, fk, apply, applyInv, armLocal, legLocal, SPINE, NECK };
})();

// ---------------------------------------------------------------- Human: the body's volume, as a signed distance field riding the bones
// Three kinds of piece, all given on a reference man (stature 1756 mm) in mm and carried to any body through the bones they ride:
//   loft     a stack of cross-sections along a segment: at each station a superellipse with four radii (to either side and to front and back),
//            the way ANSUR measures a body (breadth, depth, girth). A loft is cut into slabs, one per bone it spans, each slab riding its own bone
//            (the trunk's loft rides the five spine bones, the forearm's the twist bones), so the volume bends and twists where the skeleton does.
//   muscle   a belly on its action line, from an origin on one bone to an insertion on another; as the line shortens the belly thickens and as it
//            lengthens it thins, r = r0 * sqrt(L0 / L), which holds its volume (Scheepers 1997; Aubel & Thalmann 2000).
//   ellipsoid for the head's mannequin forms.
// The base lofts are the body under the superficial muscles; their radii are scaled per measured level (chest, waist, thigh ...) until the body's
// girths, measured the way a tape measures them, are the girths ANSUR predicts for its stature, mass and body fat (Human.Body.calibrate).
// Groups (trunk, neck and head, each arm, each leg) are joined to the trunk with a smooth minimum; the legs and the arms never with each other, so the
// thighs touch without webbing and an arm against the side stays an arm.
(() => {
  const V = Human.v3, Q = Human.q, REF = () => Human.Skeleton.REF, smin = Human.smin;

  // ---- the pieces (reference man; mm). Loft station: [t, rU+, rU-, rV+, rV-, n, cu, cv, girth key]
  // trunk: y from 800 to 1530, u = x (to the side), v = z (front); centre line z = cv
  const TRUNK = [
    // y     w    zF    zB   zW   n    girth     back half wider (lats, scapulae)
    [800, 26, 10, -34, -22, 2.0, 'buttock', 1],
    [822, 50, 26, -58, -26, 2.1, 'buttock', 1],
    [848, 112, 48, -90, -32, 2.3, 'buttock', 1],
    [878, 140, 62, -116, -38, 2.4, 'buttock', 1],
    [905, 146, 72, -124, -36, 2.5, 'buttock', 1],
    [950, 140, 80, -120, -28, 2.5, 'buttock', 1],
    [1000, 134, 90, -114, -18, 2.5, 'waist', 1],   // (review adjust3: waist about 88 % of the hips' width, not a box)
    [1055, 128, 96, -110, -12, 2.5, 'waist', 1],
    [1110, 134, 98, -116, -10, 2.5, 'waist', 1.02],
    [1180, 146, 100, -120, -10, 2.5, 'chest', 1.06],
    [1240, 145, 106, -124, -8, 2.5, 'chest', 1.12],
    [1290, 140, 112, -126, -8, 2.4, 'chest', 1.15],
    [1350, 136, 112, -124, -10, 2.3, 'chest', 1.14],
    [1410, 126, 98, -118, -15, 2.2, 'chest', 1.08],
    [1452, 106, 70, -106, -22, 2.1, 'chest', 1.02],
    [1490, 76, 34, -92, -30, 2.0, 'neck', 1],
    [1530, 40, 10, -72, -36, 2.0, 'neck', 1],
  ];
  const trunkLoft = { name: 'trunk', group: 'trunk', A: ['pelvis', [0, 800, 0]], B: ['pelvis', [0, 1530, 0]], u: [1, 0, 0], v: [0, 0, 1],
    st: TRUNK.map(([y, w, zF, zB, zW, n, g, wb]) => [(y - 800) / 730, w, w, zF - zW, zW - zB, n, 0, zW, g, wb]),
    slabs: [['pelvis', -1, 1000], ['lumbar_lo', 1000, 1080], ['lumbar_hi', 1080, 1170], ['thorax_lo', 1170, 1260], ['thorax_mid', 1260, 1370], ['thorax_hi', 1370, 2]].map(([b, a, c]) => [b, a < 0 ? -1 : (a - 800) / 730, c < 10 ? c : (c - 800) / 730]) };
  const NECKL = [[1462, 62, 56, 64, -40, 2.1], [1500, 58, 50, 60, -36, 2.1], [1545, 55, 47, 54, -30, 2.1], [1590, 53, 44, 52, -22, 2.1], [1625, 46, 36, 48, -14, 2.1]];
  const neckLoft = { name: 'neck', group: 'neck', A: ['neck_lo', [0, 1462, 0]], B: ['neck_lo', [0, 1625, 0]], u: [1, 0, 0], v: [0, 0, 1],
    st: NECKL.map(([y, w, zF, zB, zW, n]) => [(y - 1462) / 163, w, w, zF, zB, n, 0, zW, 'neck']),
    slabs: [['neck_lo', -1, (1560 - 1462) / 163], ['neck_hi', (1560 - 1462) / 163, 2]] };
  // left arm (T-pose, along +x), one loft from the shoulder joint to the wrist, cut into slabs on the upper arm, its twist bones, the forearm and
  // its twist bones (so the elbow is one continuous surface). u = +y (top: the outside of the arm), v = +z (front). Stations at x (mm).
  // (the loft starts as a dome inside the shoulder, not a flat cut: with the arm down, that end is the round top of the shoulder)
  // (the stations up to 230 are the deltoid: they keep their size, the arm's girth is fitted on the stations below)
  const ARMS = [[112, 10, 10, 12, 12, 'shoulder'], [124, 30, 28, 34, 34, 'shoulder'], [138, 42, 38, 46, 46, 'shoulder'], [154, 46, 43, 52, 52, 'shoulder'], [176, 51, 46, 56, 56, 'shoulder'], [230, 55, 46, 55, 56, 'shoulder'], [290, 45, 55, 50, 54, 'arm'], [350, 41, 55, 59, 47, 'arm'],
    [400, 41, 50, 60, 39, 'arm'], [450, 41, 45, 53, 29, 'arm'], [490, 40, 44, 46, 30, 'forearm'], [506, 38, 42, 44, 32, 'forearm'], [530, 41, 43, 46, 33, 'forearm'],
    [560, 41, 42, 45, 34, 'forearm'], [610, 35, 38, 36, 33, 'forearm'], [660, 32, 30, 32, 30, 'wrist'], [720, 27, 22, 33, 26, 'wrist'], [770, 18, 19, 30, 29, 'wrist']];
  const ARM = { name: 'arm', group: 'arm', A: ['upperarm', null], B: ['hand', null], u: [0, 1, 0], v: [0, 0, 1],
    st: ARMS.map(([x, a, b, c, d, g]) => [(x - 176) / 586, a, b, c, d, x < 480 ? 2.2 : x < 650 ? 2.3 : 2.6, 0, -2, g]),
    slabs: [['upperarm_twist_01', -1, 0.19], ['upperarm_twist_02', 0.19, 0.38], ['upperarm', 0.38, 0.563], ['forearm', 0.563, 0.71], ['forearm_twist_01', 0.71, 0.85], ['forearm_twist_02', 0.85, 2]] };
  // the hand is a glove: the palm, the four fingers as one padded block (it curls at two rows of knuckles) and the thumb
  const PALM = { name: 'palm', group: 'arm', blend: 0.022, A: ['hand', null], B: ['fingers_mcp', null], u: [0, 1, 0], v: [0, 0, 1],
    st: [[-0.05, 18, 19, 30, 29, 2.6, 0, 0, 'wrist'], [0.3, 17, 19, 38, 36, 2.8, 0, 0, 'wrist'], [0.75, 16, 18, 41, 39, 2.8, 0, 0, 'wrist'], [1.0, 14, 15, 40, 38, 2.7, 0, 0, 'wrist']],
    slabs: [['hand', -1, 2]] };
  const FING = { name: 'fingers', group: 'arm', A: ['fingers_mcp', null], B: ['fingers_mcp', [952, 1402, -2]], u: [0, 1, 0], v: [0, 0, 1],
    st: [[0.0, 13, 14, 39, 37, 2.6, 0, 0, 'wrist'], [0.45, 12, 13, 37, 35, 2.6, 0, 0, 'wrist'], [0.78, 11, 11, 33, 31, 2.5, 0, 0, 'wrist'], [0.93, 9, 9, 26, 24, 2.3, 0, 0, 'wrist'], [1.0, 5, 5, 14, 13, 2, 0, 0, 'wrist']],
    slabs: [['fingers_mcp', -1, 0.47], ['fingers_ip', 0.47, 2]] };
  const THUMB = { name: 'thumb', group: 'arm', A: ['thumb_cmc', null], B: ['thumb_ip', [860, 1384, 68]], u: [0, 1, 0], v: [0, 0, 1],
    st: [[-0.1, 14, 16, 16, 16, 2.2, 0, 0, 'wrist'], [0.2, 13, 14, 15, 15, 2.2, 0, 0, 'wrist'], [0.55, 12, 12, 13, 13, 2.2, 0, 0, 'wrist'], [0.9, 10, 10, 11, 11, 2.2, 0, 0, 'wrist'], [1.0, 6, 6, 7, 7, 2, 0, 0, 'wrist']],
    slabs: [['thumb_cmc', -1, 0.42], ['thumb_mcp', 0.42, 0.72], ['thumb_ip', 0.72, 2]] };
  // left leg, one loft from the hip joint to the ankle, cut into slabs on the thigh, its twist bone, the shin and its twist bone. u = +x
  // (outside), v = +z (front). Stations at height y (mm): rU+ (outside), rU- (inside), rV+ (front), rV- (back), centre offset back
  const LEGS = [[937, 44, 50, 40, 52, -10, 'thigh'], [880, 75, 65, 82, 79, -8, 'thigh'], [846, 101, 67, 102, 89, -6, 'thigh'], [800, 85, 73, 107, 67, -4, 'thigh'],
    [740, 70, 80, 105, 56, -2, 'thigh'], [680, 69, 87, 106, 64, 0, 'lowthigh'], [600, 54, 81, 86, 63, 0, 'lowthigh'], [530, 48, 73, 65, 66, 0, 'lowthigh'],
    [490, 45, 59, 52, 68, -1, 'lowthigh'], [470, 43, 51, 45, 70, -2, 'calf'], [440, 45, 43, 38, 74, -2, 'calf'], [400, 49, 37, 30, 78, -3, 'calf'],
    [360, 55, 38, 28, 80, -4, 'calf'], [300, 50, 36, 28, 71, -6, 'calf'], [240, 44, 27, 25, 52, -6, 'calf'], [180, 36, 20, 25, 40, -6, 'ankle'],
    [120, 30, 17, 35, 37, -5, 'ankle'], [80, 33, 33, 31, 33, -4, 'ankle'], [55, 28, 28, 28, 30, -6, 'ankle']];
  const LEG = { name: 'leg', group: 'leg', A: ['thigh', null], B: ['talus', null], u: [1, 0, 0], v: [0, 0, 1],
    st: LEGS.map(([y, a, b, c, d, cv, g]) => [(895 - y) / 819, a, b, c, d, 2.3, 0, cv, g]),
    slabs: [['thigh_twist', -1, 0.25], ['thigh', 0.25, 0.495], ['shin', 0.495, 0.76], ['shin_twist', 0.76, 2]] };
  // foot: along z from the heel, u = +x, v = +y (up); cv = height of the section's centre above the sole
  const FOOTS = [[-70, 10, 10, 12, 12, 2.0, 0, 30], [-58, 27, 27, 30, 30, 2.1, 0, 32], [-30, 31, 31, 44, 40, 2.2, 0, 42], [0, 35, 33, 46, 38, 2.4, -2, 40],
    [40, 39, 35, 34, 32, 2.6, -4, 34], [90, 45, 39, 24, 24, 2.8, -6, 26], [130, 49, 43, 17, 18, 3.0, -7, 19], [165, 45, 41, 12, 14, 3.0, -9, 15], [190, 36, 36, 10, 11, 2.8, -10, 12], [202, 16, 16, 6, 7, 2.2, -10, 9]];
  const FOOT = { name: 'foot', group: 'leg', A: ['foot', [91, 0, -70]], B: ['foot', [91, 0, 202]], u: [1, 0, 0], v: [0, 1, 0],
    st: FOOTS.map(([z, a, b, c, d, n, cu, cv]) => [(z + 70) / 272, a, b, c, d, n, cu, cv, 'foot']),
    slabs: [['foot', -1, (25 + 70) / 272], ['midfoot', (25 + 70) / 272, (128 + 70) / 272], ['toe_hallux', (128 + 70) / 272, 2]] };
  // the shoulder's top, neck to acromion (the trapezius slope over the clavicle and the scapula's spine). u = +y (up), v = +z
  const SHOULDER = { name: 'shoulder', group: 'trunk', blend: 0.045, A: ['thorax_hi', [22, 1482, -46]], B: ['scapula', [174, 1428, -12]], u: [0, 1, 0], v: [0, 0, 1],
    st: [[-0.05, 24, 50, 40, 52, 2.2, 0, 0, 'chest'], [0.3, 21, 46, 42, 52, 2.2, 0, 0, 'chest'], [0.7, 17, 38, 40, 46, 2.2, 0, 0, 'chest'], [1.0, 12, 26, 32, 34, 2.2, 0, 0, 'chest'], [1.1, 8, 16, 20, 22, 2.0, 0, 0, 'chest']],
    slabs: [['thorax_hi', -1, 0.35], ['clavicle', 0.35, 0.7], ['scapula', 0.7, 2]] };
  const LOFTS_SIDE = [SHOULDER, ARM, PALM, FING, THUMB, LEG, FOOT];

  // head (mannequin forms): ellipsoids on the head and jaw, centre and radii in mm
  const HEAD = [   // (forms join with a 3 cm blend)
    ['head', [0, 1668, -8], [76, 90, 97]],         // cranium
    ['head', [0, 1614, 22], [64, 72, 74]],         // face
    ['head', [0, 1682, 62], [52, 16, 24]],         // brow
    ['head', [0, 1636, 88], [11, 20, 14]],         // nose
    ['head', [73, 1648, -6], [9, 29, 17]], ['head', [-73, 1648, -6], [9, 29, 17]],     // ears
    ['jaw', [0, 1566, 40], [57, 34, 52]],          // jaw
    ['jaw', [0, 1542, 66], [27, 20, 20]],          // chin
  ];

  // muscles (left side): name, group, origin bone, origin, insertion bone, insertion, belly radius, flatness (thickness / width), thickness
  // direction (reference frame), where along the line the belly peaks, blend (mm), how much of its thickness stands out of the base
  const MUSCLES = [
    ['deltoid_ant', 'arm', 'scapula', [150, 1452, 40], 'upperarm', [302, 1398, 18], 26, 0.6, [0, 0.6, 1], 0.4, 12, 0.38],
    ['deltoid_mid', 'arm', 'scapula', [190, 1446, -8], 'upperarm', [306, 1404, 0], 28, 0.6, [0, 1, 0], 0.35, 12, 0.34],
    ['deltoid_post', 'arm', 'scapula', [150, 1448, -64], 'upperarm', [302, 1400, -16], 25, 0.6, [0, 0.6, -1], 0.4, 12, 0.38],
    ['biceps', 'arm', 'scapula', [215, 1400, 24], 'forearm', [535, 1400, 10], 25, 0.85, [0, 0, 1], 0.6, 10, 0.45],
    ['triceps_long', 'arm', 'scapula', [168, 1386, -30], 'forearm', [500, 1408, -36], 26, 0.7, [0, 0, -1], 0.4, 10, 0.42],
    ['triceps_lat', 'arm', 'upperarm', [230, 1416, -24], 'forearm', [500, 1412, -34], 22, 0.7, [0, 0.7, -1], 0.45, 10, 0.4],
    ['brachioradialis', 'arm', 'upperarm', [440, 1420, 8], 'forearm_twist_02', [735, 1404, 20], 17, 0.8, [0, 1, 0.5], 0.25, 8, 0.22],
    ['flexors', 'arm', 'upperarm', [500, 1382, -8], 'forearm_twist_02', [720, 1394, 0], 21, 0.75, [0, -1, 0], 0.25, 8, 0.2],
    ['extensors', 'arm', 'upperarm', [505, 1428, -4], 'forearm_twist_02', [725, 1414, -4], 18, 0.75, [0, 1, -0.3], 0.3, 8, 0.2],
    ['pec_clav', 'trunk', 'thorax_hi', [70, 1430, 72], 'upperarm', [232, 1402, 24], 25, 0.45, [0, 0.3, 1], 0.35, 14, 0.2],
    // the pectoral as one broad slab from the sternum to the arm (its lower edge is the fold in front of the armpit)
    ['pec_sternal', 'trunk', 'thorax_mid', [26, 1338, 112], 'upperarm', [205, 1392, 44], 60, 0.3, [0, 0, 1], 0.4, 16, 0.24, 1],
    ['lat', 'trunk', 'lumbar_hi', [45, 1120, -116], 'upperarm', [215, 1392, -8], 36, 0.35, [1, 0, -1], 0.45, 16, 0.28],
    ['teres', 'trunk', 'scapula', [110, 1330, -108], 'upperarm', [212, 1395, -6], 19, 0.6, [0.3, -0.5, -1], 0.4, 12, 0.12],
    ['infraspinatus', 'trunk', 'scapula', [86, 1420, -104], 'scapula', [100, 1305, -108], 30, 0.33, [0.2, 0, -1], 0.5, 14, 0.1],
    ['trap_upper', 'trunk', 'neck_lo', [8, 1562, -60], 'scapula', [176, 1458, -24], 24, 0.5, [0, 1, -0.3], 0.35, 16, 0.3],
    ['trap_mid', 'trunk', 'thorax_hi', [5, 1420, -108], 'scapula', [150, 1446, -55], 22, 0.35, [0, 0, -1], 0.4, 14, 0.2],
    ['trap_low', 'trunk', 'thorax_mid', [5, 1270, -112], 'scapula', [95, 1410, -100], 22, 0.35, [0, 0, -1], 0.45, 14, 0.2],
    // rectus abdominis in four bellies between its tendinous bands (the bands and the linea alba are the gaps between them)
    ['rectus_abd1', 'trunk', 'pelvis', [36, 948, 96], 'pelvis', [38, 1042, 101], 31, 0.4, [0, 0, 1], 0.55, 10, 0.14, 1],
    ['rectus_abd2', 'trunk', 'lumbar_lo', [38, 1050, 102], 'lumbar_hi', [40, 1124, 106], 31, 0.4, [0, 0, 1], 0.5, 10, 0.17, 1],
    ['rectus_abd3', 'trunk', 'lumbar_hi', [40, 1132, 107], 'thorax_lo', [42, 1198, 110], 31, 0.4, [0, 0, 1], 0.5, 10, 0.17, 1],
    ['rectus_abd4', 'trunk', 'thorax_lo', [42, 1206, 111], 'thorax_mid', [52, 1264, 113], 30, 0.4, [0, 0, 1], 0.5, 10, 0.14, 1],
    ['serratus1', 'trunk', 'thorax_mid', [108, 1292, 86], 'thorax_mid', [134, 1262, 42], 16, 0.5, [1, 0, 1], 0.45, 8, 0.16, 1],
    ['serratus2', 'trunk', 'thorax_mid', [112, 1258, 88], 'thorax_lo', [138, 1228, 44], 16, 0.5, [1, 0, 1], 0.45, 8, 0.16, 1],
    ['serratus3', 'trunk', 'thorax_lo', [116, 1224, 86], 'thorax_lo', [140, 1194, 46], 15, 0.5, [1, 0, 1], 0.45, 8, 0.14, 1],
    ['oblique', 'trunk', 'thorax_mid', [125, 1240, 45], 'pelvis', [112, 1030, 52], 34, 0.4, [1, 0, 0.3], 0.62, 18, 0.15],
    ['erector', 'trunk', 'pelvis', [32, 980, -116], 'thorax_mid', [32, 1330, -100], 26, 0.6, [0, 0, -1], 0.4, 14, 0.2],
    ['glute_max', 'trunk', 'pelvis', [40, 1010, -132], 'thigh', [118, 815, -72], 50, 0.6, [0.3, 0, -1], 0.35, 18, 0.0],
    ['glute_med', 'trunk', 'pelvis', [125, 1030, -50], 'thigh', [150, 885, -15], 34, 0.6, [1, 0, 0], 0.4, 16, 0.15],
    ['scm', 'neck', 'thorax_hi', [24, 1442, 58], 'head', [62, 1625, -22], 11, 0.8, [1, 0, 1], 0.45, 8, 0.45],
    ['rectus_fem', 'leg', 'pelvis', [95, 880, 62], 'shin', [92, 440, 55], 30, 0.75, [0, 0, 1], 0.5, 12, 0.18],
    ['vastus_lat', 'leg', 'thigh', [150, 860, 10], 'shin', [118, 470, 40], 36, 0.65, [1, 0, 0.3], 0.5, 12, 0.2],
    ['vastus_med', 'leg', 'thigh', [75, 720, 30], 'shin', [70, 470, 40], 32, 0.8, [-0.7, 0, 0.7], 0.7, 12, 0.3],
    ['adductors', 'leg', 'pelvis', [25, 840, 10], 'thigh', [75, 600, -5], 42, 0.7, [-1, 0, 0], 0.35, 14, 0.08],
    ['ham_bf', 'leg', 'pelvis', [100, 860, -80], 'shin', [130, 430, -35], 30, 0.8, [0, 0, -1], 0.45, 12, 0.12],
    ['ham_sm', 'leg', 'pelvis', [70, 860, -80], 'shin', [60, 430, -35], 30, 0.8, [0, 0, -1], 0.45, 12, 0.12],
    ['gastro_med', 'leg', 'thigh', [68, 500, -42], 'shin', [88, 175, -58], 33, 0.75, [-0.5, 0, -1], 0.32, 10, 0.35],
    ['gastro_lat', 'leg', 'thigh', [118, 500, -42], 'shin', [98, 195, -55], 27, 0.75, [0.5, 0, -1], 0.3, 10, 0.35],
    ['tib_ant', 'leg', 'shin', [112, 440, 40], 'shin', [92, 110, 40], 15, 0.8, [0.5, 0, 1], 0.3, 8, 0.2],
    ['patella', 'leg', 'thigh', [91, 505, 56], 'shin', [91, 448, 58], 22, 0.6, [0, 0, 1], 0.5, 12, 0.15],
  ];

  // ---- build a body for a skeleton (sk.M holds the measurements)
  function build(sk, F) {
    const M = sk.M, k = M.S / 1756 / 1000, ref = REF();
    F = F || { buttock: 1, waist: 1, chest: 1, neck: 1, arm: 1, forearm: 1, wrist: 1, thigh: 1, lowthigh: 1, calf: 1, ankle: 1, foot: 1 };
    // muscle size: with mass at the same stature (girth ~ sqrt(mass / length)), less with fat, less for the female blend
    const msc = Math.sqrt((M.kg / 75) / (M.S / 1756)) * (1 - 0.008 * M.bfDelta) * (1 - 0.22 * M.sex);
    const I = sk.idx;
    // a reference point on bone b -> canonical point of this body
    const map = (b, x) => V.add(sk.bones[I[b]].J, V.mul(V.sub(x, ref[b]), k));
    const parts = [], lofts = [];
    const addLoft = (L, side) => {
      const sx = side === 'R' ? -1 : 1, nm = b => (b === 'pelvis' || b.startsWith('thorax') || b.startsWith('lumbar') || b.startsWith('neck') || b === 'head') ? b : b + '_' + side;
      const grp = L.group === 'trunk' || L.group === 'neck' ? L.group : L.group + (side ? '_' + side : '');
      const mir = x => [x[0] * sx, x[1], x[2]];
      const pA = L.A[1] ? map(nm(L.A[0]), mir(L.A[1])) : sk.bones[I[nm(L.A[0])]].J;
      const pB = L.B[1] ? map(nm(L.B[0]), mir(L.B[1])) : sk.bones[I[nm(L.B[0])]].J;
      const len = V.len(V.sub(pB, pA)), ax = V.norm(V.sub(pB, pA));
      // cross-section frame: u, v from the spec, made square to the axis; mirrored, u flips with x for the side-to-side radii
      let u = mir(L.u), v = mir(L.v);
      v = V.norm(V.sub(v, V.mul(ax, V.dot(v, ax)))); u = V.norm(V.cross(v, ax)); if (V.dot(u, mir(L.u)) < 0) u = V.mul(u, -1);
      // a fine table along t (Catmull-Rom through the stations), radii in metres scaled by the girth factors
      const S = L.st, NT = 160, t0 = S[0][0], t1 = S[S.length - 1][0], tab = new Float32Array(NT * 8);
      const fld = (i, j) => { const s = S[Math.max(0, Math.min(S.length - 1, i))]; if (j === 9) return s[9] || 1; if (j < 5) return s[j] * (F[s[8]] || 1); return s[j]; };
      // piecewise linear through the stations, then smoothed along the loft (a Gaussian of ~2.5 % of its length): no ridges at the stations
      for (let q = 0; q < NT; q++) {
        const t = t0 + (t1 - t0) * q / (NT - 1);
        let i = 0; while (i < S.length - 2 && S[i + 1][0] < t) i++;
        const f = Math.min(1, Math.max(0, (t - S[i][0]) / (S[i + 1][0] - S[i][0])));
        for (const j of [1, 2, 3, 4, 5, 6, 7, 9]) { const v2 = fld(i, j) + (fld(i + 1, j) - fld(i, j)) * f; tab[q * 8 + (j === 9 ? 7 : j - 1)] = j < 5 || j === 6 || j === 7 ? v2 * k : v2; }
      }
      const sig = 0.025 * NT, R = Math.ceil(2.5 * sig), wts = []; for (let r = -R; r <= R; r++) wts.push(Math.exp(-r * r / (2 * sig * sig)));
      const tmp = Float32Array.from(tab);
      for (let q = 0; q < NT; q++) for (let j = 0; j < 8; j++) { let sw = 0, sv = 0; for (let r = -R; r <= R; r++) { const qq = q + r; if (qq < 0 || qq >= NT) continue; sw += wts[r + R]; sv += wts[r + R] * tmp[qq * 8 + j]; } tab[q * 8 + j] = sv / sw; }
      for (let q = 0; q < NT; q++) tab[q * 8 + 4] = Math.max(1.6, tab[q * 8 + 4]);
      const lo = { name: L.name + (side ? '_' + side : ''), group: grp, blend: L.blend, A: pA, ax, u, v, len, t0, t1, tab, NT, inv: (NT - 1) / (t1 - t0), knee: L.name === 'leg' ? (side === 'R' ? 1 : 0) : -1, kscale: M.S / 1756 };
      lofts.push(lo);
      let rmax = 0; for (let q = 0; q < NT; q++) rmax = Math.max(rmax, tab[q * 8] * tab[q * 8 + 7], tab[q * 8 + 1] * tab[q * 8 + 7], tab[q * 8 + 2], tab[q * 8 + 3]);
      for (const [b, c0, c1] of L.slabs) {
        const ca = Math.max(c0, t0), cb = Math.min(c1, t1), mid = V.add(pA, V.mul(ax, len * (ca + cb) / 2));
        parts.push({ kind: 'loft', loft: lo, bone: I[nm(b)], c0, c1, group: lo.group, cen: mid, rad: Math.hypot(len * (cb - ca) / 2 + 0.04, rmax + 0.04) });
      }
    };
    addLoft(trunkLoft, ''); addLoft(neckLoft, '');
    for (const s of ['L', 'R']) for (const L of LOFTS_SIDE) addLoft(L, s);
    // the shoulder's masses, which a tube for the arm and a barrel for the chest leave out: the deltoid capping the joint, and the two folds
    // of the armpit (the pectoral in front, the latissimus / teres behind) that carry the chest's surface out onto the arm
    for (const s of ['L', 'R']) { const sx = s === 'L' ? 1 : -1, E = (bone, c, r, group, blend) => { const cc = map(bone, [c[0] * sx, c[1], c[2]]);
        parts.push({ kind: 'ell', bone: I[bone], c: cc, r: V.mul(r, k), group, blend, cen: cc, rad: Math.max(...r) * k + 0.04 }); };
      E('upperarm_twist_01_' + s, [198, 1408, -2], [60, 50, 57], 'arm_' + s, 0.03);
      E('thorax_hi', [122, 1368, 50], [50, 50, 36], 'trunk', 0.04);
      E('scapula_' + s, [126, 1352, -66], [48, 64, 34], 'trunk', 0.04);
    }
    for (const [b, c, r] of HEAD) parts.push({ kind: 'ell', bone: I[b], c: map(b, c), r: V.mul(r, k), group: 'neck', cen: map(b, c), rad: Math.max(...r) * k + 0.03 });
    // the buttocks' two cheeks (the trunk's loft cannot make the cleft between them)
    for (const sx of [1, -1]) { const c = map('pelvis', [sx * 64, 878, -88]); parts.push({ kind: 'ell', bone: I.pelvis, c, r: V.mul([70 * (F.buttock || 1), 80, 60 * (F.buttock || 1)], k), group: 'trunk', blend: 0.035, cen: c, rad: 0.11 }); }
    // female blend: breast volume (a mannequin's smooth form), sized with the sex blend and body fat
    if (M.sex > 0.05) for (const sx of [1, -1]) {
      const r = (38 + 30 * Math.max(0, (M.p.bodyFat - 15) / 20)) * M.sex * Math.sqrt(M.kg / 60);
      const c = map('thorax_mid', [sx * 92, 1262, 112]);
      parts.push({ kind: 'ell', bone: I.thorax_mid, c, r: V.mul([r * 1.05, r * 0.95, r * 0.8], k), group: 'trunk', blend: 0.03, cen: c, rad: r * k + 0.04 });
    }
    const muscles = [];
    // muscle definition: how far the bellies stand out of the skin. M.p.def is the user's setting (1 = a fit, active man); fat smooths it away
    // (compared side by side with SMPL's scanned average man: at 18 % fat a man shows his muscles' outline, not carved abs, a spine groove or
    // ridges round the limbs; definition comes in as fat drops below ~20 %, strongly only below ~10 %)
    const lean = Math.pow(Math.max(0.08, Math.min(1, (24 - M.p.bodyFat) / 16)), 1.5), DEF = 1.5 * (M.p.def != null ? M.p.def : 1) * lean;
    for (const s of ['L', 'R']) for (const [name, group, ob, oa, ib, ia, r0, flat, out, tp, kb, show, pad] of MUSCLES) {
      const sx = s === 'R' ? -1 : 1, nm = b => (b === 'pelvis' || b.startsWith('thorax') || b.startsWith('lumbar') || b.startsWith('neck') || b === 'head') ? b : b + '_' + s;
      const mir = x => [x[0] * sx, x[1], x[2]];
      const A = map(nm(ob), mir(oa)), B = map(nm(ib), mir(ia));
      const m = { kind: 'muscle', name: name + '_' + s, group: group === 'neck' ? 'neck' : group === 'trunk' ? 'trunk' : group + '_' + s, ob: I[nm(ob)], ib: I[nm(ib)], A, B,
        L0: V.len(V.sub(B, A)), r0: r0 * k * msc, flat, out: V.norm(mir(out)), tp, blend: kb / 1000 * 1.8, show, pad: !!pad };
      muscles.push(m); parts.push(m);
    }
    const groups = ['trunk', 'neck', 'arm_L', 'arm_R', 'leg_L', 'leg_R'];
    parts.forEach(p => p.gi = groups.indexOf(p.group));
    const body = { sk, M, F, parts, lofts, muscles, groups, msc, k };
    // each muscle's line is laid on the base surface (the coordinates above are surface landmarks): its two ends are moved onto it
    const c0 = prepare(body, Human.Skeleton.fk(sk, sk.bones.map(() => Q.id())), true);
    const snap = P => { for (let it = 0; it < 3; it++) { const d = dist(c0, P[0], P[1], P[2]), g = V.norm(grad(c0, P[0], P[1], P[2])); P = V.sub(P, V.mul(g, d)); } return P; };
    for (const m of muscles) {
      m.A = snap(m.A); m.B = snap(m.B); m.L0 = V.len(V.sub(m.B, m.A));
      m.h0 = m.r0 * m.flat * (m.show != null ? m.show : 0.3) * DEF;
    }
    return body;
  }

  // ---- per pose: the transforms every piece needs (from Human.Skeleton.pose)
  function prepare(body, xf, noMuscle) {
    const sk = body.sk, n = sk.n, inv = new Float64Array(n * 15);
    for (let b = 0; b < n; b++) {
      const q = Q.conj(xf.R[b]), ex = Q.rot(q, [1, 0, 0]), ey = Q.rot(q, [0, 1, 0]), ez = Q.rot(q, [0, 0, 1]), o = b * 15;
      // canonical = J + R^T (p - P): rows of R^T
      inv[o] = ex[0]; inv[o + 1] = ey[0]; inv[o + 2] = ez[0]; inv[o + 3] = ex[1]; inv[o + 4] = ey[1]; inv[o + 5] = ez[1]; inv[o + 6] = ex[2]; inv[o + 7] = ey[2]; inv[o + 8] = ez[2];
      inv[o + 9] = xf.P[b][0]; inv[o + 10] = xf.P[b][1]; inv[o + 11] = xf.P[b][2]; inv[o + 12] = sk.bones[b].J[0]; inv[o + 13] = sk.bones[b].J[1]; inv[o + 14] = sk.bones[b].J[2];
    }
    const pc = body.parts.map(p => {
      if (p.kind === 'muscle') {
        const A = Human.Skeleton.apply(xf, sk, p.ob, p.A), B = Human.Skeleton.apply(xf, sk, p.ib, p.B), ab = V.sub(B, A), L = V.len(ab), an = V.mul(ab, 1 / L);
        let out = Q.rot(xf.R[p.ob], p.out); out = V.norm(V.sub(out, V.mul(an, V.dot(out, an)))); const e2 = V.cross(an, out);
        const sq = Math.sqrt(p.L0 / L), r = p.r0 * sq, h = p.h0 * sq;             // shorter -> thicker and wider, the same volume
        return { A, an, L, e1: out, e2, r, h, cen: V.lerp(A, B, 0.5), rad: L / 2 + r + 0.02 };
      }
      return { cen: Human.Skeleton.apply(xf, sk, p.bone, p.cen), rad: p.rad };
    });
    const np = body.parts.length, cb = new Float64Array(np * 4);
    pc.forEach((q, i) => { cb[i * 4] = q.cen[0]; cb[i * 4 + 1] = q.cen[1]; cb[i * 4 + 2] = q.cen[2]; cb[i * 4 + 3] = q.rad; });
    if (!body.li) {
      const li = new Int16Array(np).fill(-1), lg = [], lk = []; const ids = new Map();
      body.parts.forEach((p, i) => { if (p.kind === 'muscle') return; const key = p.kind === 'loft' ? p.loft : p; if (!ids.has(key)) { ids.set(key, lg.length); lg.push(p.gi); lk.push(p.kind === 'ell' ? (p.blend || 0.03) : (p.loft.blend || 0.015)); } li[i] = ids.get(key); });
      body.li = li; body.lg = Int8Array.from(lg); body.lk = Float64Array.from(lk);
    }
    return { body, xf, inv, pc, cb, knee: xf.anat ? [xf.anat.leg_L.knee, xf.anat.leg_R.knee] : null, li: body.li, lg: body.lg, lk: body.lk, ld: new Float64Array(body.lg.length), lb: new Int32Array(body.lg.length), cd: new Float64Array(np), gd: new Float64Array(6), gb: new Int32Array(6),
      kind: Int8Array.from(body.parts, p => p.kind === 'loft' ? 0 : p.kind === 'ell' ? 1 : noMuscle ? 3 : 2), gi: Int8Array.from(body.parts, p => p.gi) };
  }

  const OV = 0.03;
  // distance to one piece
  function partDist(p, c, pc, x, y, z) {
    if (p.kind === 'muscle') {
      // relief: how far the belly lifts the skin at this point (>= 0)
      const dx = x - pc.A[0], dy = y - pc.A[1], dz = z - pc.A[2];
      const t = (dx * pc.an[0] + dy * pc.an[1] + dz * pc.an[2]) / pc.L; if (t <= 0 || t >= 1) return 0;
      const qx = dx - pc.an[0] * t * pc.L, qy = dy - pc.an[1] * t * pc.L, qz = dz - pc.an[2] * t * pc.L;
      const a = qx * pc.e1[0] + qy * pc.e1[1] + qz * pc.e1[2], b = qx * pc.e2[0] + qy * pc.e2[1] + qz * pc.e2[2];
      const tt = t < p.tp ? 0.5 * t / p.tp : 0.5 + 0.5 * (t - p.tp) / (1 - p.tp);
      // a belly tapers to its tendons; a pad (the abdominal segments, the serratus digits) is flat-topped with soft edges
      const sn = Math.sin(Math.PI * tt), e4 = (2 * tt - 1) ** 4, prof = p.pad ? 1 - e4 : Math.sqrt(sn) * (1.5 - 0.5 * sn), w = pc.r * (p.pad ? 1 : prof);
      if (w < 1e-4) return 0;
      const rho = b / w, r2 = rho * rho; if (r2 >= 1) return 0;
      const s1 = Human.smooth(-1.2 * w, 0, a) * (1 - Human.smooth(1.5 * w, 3.5 * w, a)); if (s1 <= 0) return 0;
      const side = s1;
      const f = p.pad ? (1 - r2) * (1 + 0.6 * r2) : (1 - r2) * (1 - r2);
      return pc.h * prof * f * side;
    }
    const o = p.bone * 15, inv = c.inv, px = x - inv[o + 9], py = y - inv[o + 10], pz = z - inv[o + 11];
    const cx = inv[o + 12] + inv[o] * px + inv[o + 1] * py + inv[o + 2] * pz, cy = inv[o + 13] + inv[o + 3] * px + inv[o + 4] * py + inv[o + 5] * pz, cz = inv[o + 14] + inv[o + 6] * px + inv[o + 7] * py + inv[o + 8] * pz;
    if (p.kind === 'ell') {
      const ex = (cx - p.c[0]) / p.r[0], ey = (cy - p.c[1]) / p.r[1], ez = (cz - p.c[2]) / p.r[2], k0 = Math.hypot(ex, ey, ez), k1 = Math.hypot(ex / p.r[0], ey / p.r[1], ez / p.r[2]);
      return k1 < 1e-9 ? -Math.min(...p.r) : k0 * (k0 - 1) / k1;
    }
    // loft slab
    const L = p.loft, rx = cx - L.A[0], ry = cy - L.A[1], rz = cz - L.A[2], ax = L.ax, U = L.u, W = L.v;
    const t = (rx * ax[0] + ry * ax[1] + rz * ax[2]) / L.len;
    const tt = t < L.t0 ? L.t0 : t > L.t1 ? L.t1 : t;
    const s = (tt - L.t0) * L.inv, i = s >= L.NT - 1 ? L.NT - 2 : s | 0, f = s - i, T = L.tab, a = i * 8, b = a + 8, f1 = 1 - f;
    const du = rx * U[0] + ry * U[1] + rz * U[2] - (T[a + 5] * f1 + T[b + 5] * f), dv = rx * W[0] + ry * W[1] + rz * W[2] - (T[a + 6] * f1 + T[b + 6] * f);
    let ru = du > 0 ? T[a] * f1 + T[b] * f : T[a + 1] * f1 + T[b + 1] * f, rv = dv > 0 ? T[a + 2] * f1 + T[b + 2] * f : T[a + 3] * f1 + T[b + 3] * f; const n = T[a + 4] * f1 + T[b + 4] * f;
    // a bent knee squeezes the leg (measured on SMPL from 0 to 120 deg, data/smpl_lofts.json 'knee'): above the knee the front swells about
    // 20 mm (the quadriceps bunch) and the back flattens about 30 mm against the calf; below it the shin widens about 10 mm
    if (L.knee >= 0 && c.knee) { const fk = Math.min(1.2, Math.max(0, c.knee[L.knee] / 120)) * L.kscale;
      if (fk > 0) { const wt = Human.smooth(0.30, 0.42, tt) * (1 - Human.smooth(0.50, 0.54, tt)), ws = Human.smooth(0.50, 0.53, tt) * (1 - Human.smooth(0.58, 0.66, tt));
        if (wt > 0) rv = dv > 0 ? rv + 0.020 * fk * wt : Math.max(0.3 * rv, rv - 0.030 * fk * wt); if (ws > 0) ru += 0.010 * fk * ws; } }
    if (dv < 0) { const wb = T[a + 7] * f1 + T[b + 7] * f; if (wb !== 1) { const e = -dv / rv / 0.6, sm = e >= 1 ? 1 : e * e * (3 - 2 * e); ru *= 1 + (wb - 1) * sm; } }
    const qu = (du < 0 ? -du : du) / ru, qv = (dv < 0 ? -dv : dv) / rv, rp = Math.sqrt(du * du + dv * dv);
    const fq = qu + qv < 1e-9 ? 0 : Math.exp(Math.log(Math.exp(n * Math.log(qu + 1e-12)) + Math.exp(n * Math.log(qv + 1e-12))) / n);
    const rm = ru < rv ? ru : rv;
    let d = fq > 1e-6 ? rp * (1 - 1 / fq) : -rm;
    if (d < -rm) d = -rm;
    const ov = (t < L.t0 ? L.t0 - t : t - L.t1) * L.len; if (ov > d) d = ov;
    // (the slabs overlap by OV on either side of their cut: where they meet, the inside stays the loft's own inside)
    if (p.c0 > L.t0) { const e = (p.c0 - t) * L.len - OV; if (e > d) d = e; }
    if (p.c1 < L.t1) { const e = (t - p.c1) * L.len - OV; if (e > d) d = e; }
    return d;
  }

  // the body's distance at a point. opt.groups: a mask of group indices to include (for measuring). Returns the distance; with out, also fills
  // out.g (the nearest group) and out.part (the nearest base piece)
  const GK = [0, 0.02, 0.055, 0.055, 0.045, 0.045];          // how softly each group is joined to the trunk (m)
  function dist(c, x, y, z, mask, out) {
    const parts = c.body.parts, pc = c.pc, np = parts.length, gd = c.gd, gb = c.gb, cd = c.cd, CB = c.cb, kind = c.kind, gi = c.gi, li = c.li, ld = c.ld, lb = c.lb, nl = ld.length;
    for (let g = 0; g < 6; g++) { gd[g] = 1e9; gb[g] = -1; }
    for (let l = 0; l < nl; l++) ld[l] = 1e9;
    // cheap bounds first; the nearest piece is evaluated first so that everything far beyond it can be skipped
    let i0 = -1, m0 = 1e9;
    for (let i = 0; i < np; i++) {
      const o = i * 4, ex = x - CB[o], ey = y - CB[o + 1], ez = z - CB[o + 2], d = Math.sqrt(ex * ex + ey * ey + ez * ez) - CB[o + 3]; cd[i] = d;
      if (kind[i] < 2 && d < m0 && (!mask || mask >> gi[i] & 1)) { m0 = d; i0 = i; }
    }
    if (i0 < 0) return 1e9;
    if (m0 > 0.05 && !out) return m0;                                  // far from everything: a lower bound is enough
    // base pieces: the slabs of one loft by plain minimum (they are one surface cut in pieces), then the lofts and forms of a group blended
    let U = 1e9;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < np; i++) {
      if (pass === 0 ? i !== i0 : i === i0) continue;
      const k = kind[i]; if (k >= 2) continue; const g = gi[i]; if (mask && !(mask >> g & 1)) continue;
      if (pass && cd[i] > U + 0.06) continue;
      const d = partDist(parts[i], c, pc[i], x, y, z), l = li[i];
      if (d < ld[l]) { ld[l] = d; lb[l] = i; }
      if (d < U) U = d;
      if (!pass) break;
    }
    const LG = c.lg, LK = c.lk;
    for (let l = 0; l < nl; l++) { const d = ld[l]; if (d > 1e8) continue; const g = LG[l];
      if (gd[g] > 1e8) { gd[g] = d; gb[g] = lb[l]; } else { if (d < gd[g]) gb[g] = lb[l]; gd[g] = smin(gd[g], d, LK[l]); } }
    for (let g = 0; g < 6; g++) if (gd[g] < U) U = gd[g];
    for (let i = 0; i < np; i++) {
      if (kind[i] !== 2) continue; const g = gi[i]; if (gd[g] > 0.04 || gd[g] < -0.04) continue; if (cd[i] > 0.04) continue;
      gd[g] -= partDist(parts[i], c, pc[i], x, y, z);
    }
    let best = gd[0], bg = 0;
    for (let g = 1; g < 6; g++) { if (gd[g] > 1e8) continue; const d = gd[0] < 1e8 ? smin(gd[0], gd[g], GK[g]) : gd[g]; if (d < best) { best = d; bg = g; } }
    if (out) { out.g = bg; out.part = gb[bg]; out.gd = Array.from(gd); }
    return best;
  }
  function grad(c, x, y, z, mask, h = 0.0015) {
    // tetrahedral differences: 4 samples
    const a = dist(c, x + h, y - h, z - h, mask), b = dist(c, x - h, y - h, z + h, mask), d = dist(c, x - h, y + h, z - h, mask), e = dist(c, x + h, y + h, z + h, mask);
    return [a - b - d + e, -a - b + d + e, -a + b - d + e].map(v => v / (4 * h));
  }
  Human.Body = { build, prepare, dist, grad, partDist, MUSCLES, TRUNK };
})();

// ---------------------------------------------------------------- Human: ski clothes, as a distance field over the body's
// Clothes are the body's own field pushed outward by how far each garment stands off the skin, plus a few hard forms the body does not have
// (boots, helmet, goggles). All of it is given in the bind pose (the A-pose the mesh is made in) from the skeleton's own joints, meshed once and
// skinned with the body's weights, so it moves with any clip; nothing is sprung.
//   jacket  2.6-3.2 cm off the trunk and arms, down past the seat (the hem 13 cm below the hip joints), a high collar round the neck, folds in the
//           crook of the elbow; the look of the game's skier (orange shell, navy forearms, a pale band round the upper sleeve)
//   pants   2.2 cm off the legs, fuller at the knee, belled over the boot cuff
//   gloves  1 cm off the hand, a gauntlet over the sleeve's cuff
//   boots   a shell round the foot and shin up to 34 cm, flat soled
//   helmet  a shell over the skull down to the brow in front and the nape behind; goggles across the eyes
// The material of each vertex comes from the same rules (Clothes.mat), so the colours follow the cut exactly.
(() => {
  const B = Human.Body, S = Human.Skeleton, smooth = Human.smooth;
  const MAT = ['skin', 'jacket', 'sleeve', 'band', 'pants', 'glove', 'boot', 'helmet', 'goggle', 'lens'];
  const COL = { skin: [0.56, 0.34, 0.25], jacket: [0.95, 0.255, 0.026], sleeve: [0.018, 0.030, 0.055], band: [0.86, 0.87, 0.85], pants: [0.045, 0.05, 0.06],
    glove: [0.018, 0.018, 0.02], boot: [0.62, 0.64, 0.68], helmet: [0.78, 0.79, 0.80], goggle: [0.02, 0.02, 0.025], lens: [0.95, 0.45, 0.08] };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]);
  const rbox = (p, c, h, r) => { const q = [Math.abs(p[0] - c[0]) - h[0] + r, Math.abs(p[1] - c[1]) - h[1] + r, Math.abs(p[2] - c[2]) - h[2] + r];
    return len([Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)]) + Math.min(Math.max(q[0], q[1], q[2]), 0) - r; };
  const ell = (p, c, r) => { const ex = (p[0] - c[0]) / r[0], ey = (p[1] - c[1]) / r[1], ez = (p[2] - c[2]) / r[2], k0 = Math.hypot(ex, ey, ez), k1 = Math.hypot(ex / r[0], ey / r[1], ez / r[2]); return k1 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1; };
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }, smax = (a, b, k) => -smin(-a, -b, k);

  // the joints of the bind pose this is cut to
  function prepare(body, sk, xf, cB) {
    const I = sk.idx, J = n => S.apply(xf, sk, I[n], sk.bones[I[n]].J);
    const c = { cB, out: {}, J: {}, pc: cB.pc, body: cB.body };
    for (const n of ['pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'talus_L', 'talus_R', 'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'hand_L', 'hand_R', 'neck_hi', 'head', 'eye_L', 'eye_R'])
      c.J[n] = J(n);
    c.hip = (c.J.thigh_L[1] + c.J.thigh_R[1]) / 2; c.hem = c.hip - 0.12;
    // the jacket's skirt: below the waist it hangs straight down over the seat and between the legs instead of following them (a rounded
    // cylinder as wide and deep as the hips and the seat, measured on the body's own field)
    const far = (dir, y) => { let lo = 0, hi = 0.4; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2, q = [c.J.pelvis[0] + dir[0] * m, y, c.J.pelvis[2] + dir[1] * m]; if (B.dist(cB, q[0], q[1], q[2], 0) < 0) lo = m; else hi = m; } return lo; };
    const ys = [c.hip - 0.02, c.hip - 0.06, c.hip - 0.10];
    c.sk = { x: Math.max(...ys.map(y => far([1, 0], y))), zf: Math.max(...ys.map(y => far([0, 1], y))), zb: Math.max(...ys.map(y => far([0, -1], y))), cx: c.J.pelvis[0], cz: c.J.pelvis[2] };
    const e = c.J.eye_L, hd = c.J.head; c.eyeY = e[1]; c.eyeZ = e[2];
    c.hc = [0, e[1] + 0.018, (hd[2] + e[2]) / 2 - 0.012];          // the middle of the cranium
    return c;
  }
  // a point along an arm: t 0 at the shoulder .. 1 at the wrist; s: metres past the wrist (negative: before it)
  function armAt(c, p, sd) { const a = c.J['upperarm_' + sd], w = c.J['hand_' + sd], ax = sub(w, a), L = len(ax), t = dot(sub(p, a), ax) / (L * L); return { t, s: (t - 1) * L, el: dot(sub(p, c.J['forearm_' + sd]), ax) / L }; }
  // how far the cloth stands off the skin here, and which cloth it is
  function region(c, p, g) {
    const y = p[1];
    if (g === 1) { const k = smooth(c.J.neck_hi[1] - 0.005, c.J.neck_hi[1] + 0.012, y); return { off: 0.028 * (1 - k), mat: k > 0.5 ? 'skin' : 'jacket' }; }      // collar, then the face
    if (g === 2 || g === 3) {
      const A = armAt(c, p, g === 2 ? 'L' : 'R');
      // folds in the crook of the elbow and round the forearm
      const fold = 0.0022 * Math.sin(A.el / 0.024 * 2 * Math.PI + 3 * p[1]) * smooth(-0.06, -0.025, A.el) * (1 - smooth(0.0, 0.035, A.el));
      const sleeve = 0.030 + (0.025 - 0.030) * smooth(0, 0.35, A.t) + fold, gaunt = 0.032, hand = 0.010;
      const gw = smooth(-0.052, -0.044, A.s), hw = smooth(0.022, 0.032, A.s);
      const off = sleeve + (gaunt - sleeve) * gw + (hand - gaunt) * hw;
      const sh = A.t * len(sub(c.J['hand_' + (g === 2 ? 'L' : 'R')], c.J['upperarm_' + (g === 2 ? 'L' : 'R')]));
      const mat = gw > 0.5 ? 'glove' : A.el > 0.045 ? 'sleeve' : Math.abs(sh - 0.16) < 0.0125 ? 'band' : 'jacket';
      return { off, mat };
    }
    // trunk and legs: the jacket down to its hem, the pants below
    const jw = smooth(c.hem - 0.006, c.hem + 0.006, y), back = p[2] < c.J.pelvis[2] - 0.06 ? 0.004 * smooth(c.hem, c.hem + 0.25, y) : 0;
    let pants = 0.022;
    if (g === 4 || g === 5) { const k = c.J['shin_' + (g === 4 ? 'L' : 'R')]; pants += 0.005 * Math.exp(-(((y - k[1]) / 0.07) ** 2)) + (p[2] < k[2] ? 0.0012 * Math.sin((y - k[1]) / 0.026 * 2 * Math.PI) * Math.exp(-(((y - k[1] + 0.01) / 0.04) ** 2)) : 0);
      pants += 0.008 * smooth(0.385, 0.33, y) * smooth(0.27, 0.30, y) - 0.04 * smooth(0.28, 0.24, y); }       // (belled over the boot's cuff; inside the boot it is the boot)
    return { off: pants + (0.031 + back - pants) * jw, mat: jw > 0.5 ? 'jacket' : 'pants' };
  }
  function skirt(c, p) {
    const k = c.sk, dx = (p[0] - k.cx) / (k.x + 0.03), dz = (p[2] - k.cz) / ((p[2] > k.cz ? k.zf : k.zb) + 0.03), n = 3, r = Math.pow(Math.pow(Math.abs(dx), n) + Math.pow(Math.abs(dz), n), 1 / n);
    return Math.max((r - 1) * (k.x + 0.03), c.hem - p[1], p[1] - c.hip - 0.02);
  }
  function boot(c, p, sd) {
    // a ski boot: the shaft leans forward (about 12 deg) round the shin, the shell narrows to the toe, a sole with a heel and a toe lug
    const t = c.J['talus_' + sd], ax = t[0], az = t[2] + 0.006 + 0.05 * Math.max(0, p[1] - 0.08);
    const dx = (p[0] - ax) / 0.062, dz = (p[2] - az) / (p[2] > az ? 0.08 : 0.068), rr = Math.hypot(dx, dz), rad = (rr - 1) * 0.065;
    const top = 0.28 + 0.02 * Math.max(0, Math.min(1, (p[2] - az) / 0.08));        // (the cuff higher in front, where the tongue is)
    const shaft = smax(Math.max(rad, 0.03 - p[1]), p[1] - top, 0.008);
    const z0 = t[2] + 0.05, hw = 0.056 - 0.016 * smooth(z0 + 0.06, z0 + 0.17, p[2]), q = [ax + (p[0] - ax) * 0.056 / hw, p[1], p[2]];
    const shell = rbox(q, [ax, 0.06, z0], [0.056, 0.06 - 0.012 * smooth(z0 + 0.08, z0 + 0.17, p[2]), 0.16], 0.028);
    const sole = rbox(p, [ax, 0.012, z0], [0.05, 0.012, 0.168], 0.008);
    return Math.max(smin(smin(shaft, shell, 0.04), sole, 0.01), -0.002 - p[1]);
  }
  function helmet(c, p) {
    const h = ell(p, c.hc, [0.103, 0.115, 0.123]), cut = c.eyeY + 0.03 + (c.J.head[1] - 0.012 - c.eyeY - 0.03) * smooth(0.06, -0.02, p[2] - c.hc[2]);      // (down to the brow in front, the nape behind)
    return smax(h, cut - p[1], 0.008);
  }
  function goggles(c, p) {
    const gy = c.eyeY + 0.003, e = ell(p, c.hc, [0.096, 0.108, 0.118]);
    return smax(smax(e, Math.abs(p[1] - gy) - 0.027, 0.006), c.hc[2] + 0.025 - p[2], 0.01);
  }
  // the whole field; mat (optional object) gets the material of the nearest surface
  function dist(c, x, y, z, mask, out) {
    const p = [x, y, z], o = c.out, d0 = B.dist(c.cB, x, y, z, mask, o);
    if (d0 > 0.15 && !out) return d0 - 0.035;
    const r = region(c, p, o.g), db = d0 - r.off;
    let d = db, m = r.mat;
    if (o.g === 0 || o.g === 4 || o.g === 5) { const sk = skirt(c, p), j = smin(r.mat === 'jacket' ? db : 1e9, sk, 0.04); if (j < d) { d = j; m = 'jacket'; } }
    for (const sd of ['L', 'R']) { const b = boot(c, p, sd); if (b < d) m = 'boot'; d = smin(d, b, 0.006); }
    const hl = helmet(c, p); if (hl < d) m = 'helmet'; d = smin(d, hl, 0.006);
    const gg = goggles(c, p); if (gg < d) { m = (p[2] > c.hc[2] + 0.07 && Math.abs(p[1] - c.eyeY - 0.003) < 0.021) ? 'lens' : 'goggle'; } d = smin(d, gg, 0.004);
    if (out) { out.mat = m; out.g = o.g; out.part = o.part; }
    return d;
  }
  function grad(c, x, y, z, mask, h = 0.0015) {
    const a = dist(c, x + h, y - h, z - h, mask), b = dist(c, x - h, y - h, z + h, mask), d = dist(c, x - h, y + h, z - h, mask), e = dist(c, x + h, y + h, z + h, mask);
    return [a - b - d + e, -a - b + d + e, -a + b - d + e].map(v => v / (4 * h));
  }
  // the colour of every vertex of a clothed mesh, and which vertices are boots (they bend at the ankle, not at the toes)
  function colours(c, mesh) {
    const nv = mesh.nv, col = new Float32Array(nv * 3), mat = new Uint8Array(nv), o = {};
    for (let v = 0; v < nv; v++) { dist(c, mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2], 0, o); const k = MAT.indexOf(o.mat); mat[v] = k; col.set(COL[o.mat], v * 3); }
    const adj = mesh.adj || (mesh.adj = Human.Mesh.adjacency(nv, mesh.idx)), tmp = new Float32Array(col.length);
    for (let it = 0; it < 2; it++) { tmp.set(col);
      for (let v = 0; v < nv; v++) { const a0 = adj.off[v], a1 = adj.off[v + 1]; let mixd = false; for (let k = a0; k < a1; k++) if (mat[adj.nb[k]] !== mat[v]) { mixd = true; break; }
        if (!mixd) continue; for (let ch = 0; ch < 3; ch++) { let sum = tmp[v * 3 + ch]; for (let k = a0; k < a1; k++) sum += tmp[adj.nb[k] * 3 + ch]; col[v * 3 + ch] = sum / (a1 - a0 + 1); } } }
    return { col, mat };
  }
  // boots are rigid below the cuff: the weights of the toe and midfoot bones go to the foot
  function stiffBoots(sk, W, mat) {
    const I = sk.idx, to = { L: I.foot_L, R: I.foot_R }, from = {};
    for (const sd of ['L', 'R']) for (const n of ['midfoot', 'toe_hallux', 'toes_lesser']) from[I[n + '_' + sd]] = to[sd];
    const k = MAT.indexOf('boot');
    for (let v = 0; v < mat.length; v++) if (mat[v] === k) for (let j = 0; j < 4; j++) { const b = W.bi[v * 4 + j]; if (from[b] != null) W.bi[v * 4 + j] = from[b]; }
  }
  Human.Clothes = { prepare, dist, grad, colours, stiffBoots, MAT, COL };
})();

// ---------------------------------------------------------------- Human: the body's surface, meshed once in the bind pose
// Sparse surface nets over the posed distance field: a coarse pass finds the blocks the surface passes through, only those are sampled finely, one
// vertex per cell the surface crosses (the mean of its edge crossings), one quad per crossed edge; then every vertex is moved onto the surface
// along the field's gradient. (The topology is fixed per body shape; research/03 wants one fixed template for every shape later.)
(() => {
  const B = Human.Body;
  function mesh(c, h = 0.008, opt = {}) {
    const t0 = performance.now(), D = opt.dist || B.dist, GR = opt.grad || B.grad, pad = opt.pad || 0;
    // bounds from the pieces' spheres
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    c.pc.forEach((q, i) => { const p = c.body.parts[i]; if (p.kind === 'muscle') return; const r = Math.min(q.rad, 0.5); for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q.cen[a] - r); hi[a] = Math.max(hi[a], q.cen[a] + r); } });
    lo = lo.map(v => v - 2 * h - pad); hi = hi.map(v => v + 2 * h + pad);
    const BS = 4, nx = Math.ceil((hi[0] - lo[0]) / h / BS) * BS, ny = Math.ceil((hi[1] - lo[1]) / h / BS) * BS, nz = Math.ceil((hi[2] - lo[2]) / h / BS) * BS;
    const cx = nx + 1, cy = ny + 1, cz = nz + 1, G = new Float32Array(cx * cy * cz).fill(NaN);
    const id = (i, j, k) => (k * cy + j) * cx + i;
    let mask = opt.mask;
    const f = (i, j, k) => { const o = id(i, j, k); let v = G[o]; if (v !== v) { v = G[o] = D(c, lo[0] + i * h, lo[1] + j * h, lo[2] + k * h, mask); } return v; };
    // coarse blocks
    const bx = nx / BS, by = ny / BS, bz = nz / BS, act = new Uint8Array(bx * by * bz), half = Math.sqrt(3) * BS * h / 2;
    let nact = 0;
    for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
      const d = D(c, lo[0] + (i + 0.5) * BS * h, lo[1] + (j + 0.5) * BS * h, lo[2] + (k + 0.5) * BS * h, mask);
      if (Math.abs(d) < half * 1.2 + 0.004) { act[(k * by + j) * bx + i] = 1; nact++; }
    }
    // cells
    const vid = new Int32Array(nx * ny * nz).fill(-1), P = [];
    const cid = (i, j, k) => (k * ny + j) * nx + i;
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let Ii = 0; Ii < bx; Ii++) {
      if (!act[(K * by + J) * bx + Ii]) continue;
      for (let k = K * BS; k < K * BS + BS; k++) for (let j = J * BS; j < J * BS + BS; j++) for (let i = Ii * BS; i < Ii * BS + BS; i++) {
        let neg = 0;
        for (let q = 0; q < 8; q++) { cv[q] = f(i + (q & 1), j + (q >> 1 & 1), k + (q >> 2 & 1)); if (cv[q] < 0) neg++; }
        if (neg === 0 || neg === 8) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of E) { const va = cv[a], vb = cv[b]; if ((va < 0) === (vb < 0)) continue; const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += (a >> 1 & 1) + ((b >> 1 & 1) - (a >> 1 & 1)) * t; sz += (a >> 2 & 1) + ((b >> 2 & 1) - (a >> 2 & 1)) * t; n++; }
        vid[cid(i, j, k)] = P.length / 3;
        P.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
      }
    }
    // quads: for each grid edge with a sign change, the four cells around it
    const T = [];
    const quad = (a, b, c2, d, flip) => { if (a < 0 || b < 0 || c2 < 0 || d < 0) return; if (!flip) T.push(a, c2, b, a, d, c2); else T.push(a, b, c2, a, c2, d); };
    for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
      const o = id(i, j, k), v0 = G[o]; if (v0 !== v0) continue;
      const vx = G[o + 1], vy = G[o + cx], vz = G[o + cx * cy];
      if (vx === vx && i < nx && (v0 < 0) !== (vx < 0)) quad(vid[cid(i, j - 1, k - 1)], vid[cid(i, j, k - 1)], vid[cid(i, j, k)], vid[cid(i, j - 1, k)], v0 < 0);
      if (vy === vy && j < ny && (v0 < 0) !== (vy < 0)) quad(vid[cid(i - 1, j, k - 1)], vid[cid(i - 1, j, k)], vid[cid(i, j, k)], vid[cid(i, j, k - 1)], v0 < 0);
      if (vz === vz && k < nz && (v0 < 0) !== (vz < 0)) quad(vid[cid(i - 1, j - 1, k)], vid[cid(i, j - 1, k)], vid[cid(i, j, k)], vid[cid(i - 1, j, k)], v0 < 0);
    }
    const pos = new Float32Array(P), nv = pos.length / 3;
    // onto the surface
    for (let v = 0; v < nv; v++) {
      for (let it = 0; it < 2; it++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], d = D(c, x, y, z, mask);
        if (Math.abs(d) < 1e-5) break;
        const g = GR(c, x, y, z, mask), gl = g[0] * g[0] + g[1] * g[1] + g[2] * g[2]; if (gl < 1e-6) break;
        const s = Math.max(-h, Math.min(h, d / gl * Math.sqrt(gl))) / Math.sqrt(gl);
        pos[v * 3] -= g[0] * s; pos[v * 3 + 1] -= g[1] * s; pos[v * 3 + 2] -= g[2] * s;
      }
    }
    const idx = new Uint32Array(T);
    return { pos, idx, nv, nt: idx.length / 3, h, ms: performance.now() - t0, cells: nact * BS * BS * BS };
  }
  // per-vertex normals from the triangles (area weighted)
  function normals(pos, idx, out) {
    const N = out || new Float32Array(pos.length); N.fill(0);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    return N;
  }
  // enclosed volume (litres) by the divergence theorem
  function volume(pos, idx) {
    let v = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
    }
    return v / 6 * 1000;
  }
  // vertex neighbours (for smoothing)
  function adjacency(nv, idx) {
    const sets = Array.from({ length: nv }, () => new Set());
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; sets[a].add(b); sets[b].add(a); }
    const off = new Uint32Array(nv + 1); let n = 0; sets.forEach((s, i) => { off[i] = n; n += s.size; }); off[nv] = n;
    const nb = new Uint32Array(n); sets.forEach((s, i) => { let o = off[i]; for (const j of s) nb[o++] = j; });
    return { off, nb };
  }
  Human.Mesh = { mesh, normals, volume, adjacency };
})();

// ---------------------------------------------------------------- Human: measuring the body like a tape measure, and fitting it to ANSUR
// A girth is the perimeter of the convex hull of a slice (a tape bridges hollows; research/03). The body is measured in the canonical T-pose, at the
// ANSUR landmark heights, and its base radii are scaled per level until each girth is the one ANSUR predicts.
(() => {
  const V = Human.v3, Q = Human.q, B = Human.Body;
  // slice through centre C in the plane (e1, e2): the hull perimeter, and the points
  function slice(c, C, e1, e2, mask, n = 96) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * 2 * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
      const at = r => B.dist(c, C[0] + (e1[0] * dx + e2[0] * dy) * r, C[1] + (e1[1] * dx + e2[1] * dy) * r, C[2] + (e1[2] * dx + e2[2] * dy) * r, mask);
      let r0 = 0, r1 = 0.004, guard = 0;
      // walk out to the last surface crossing (from outside in, so hollows are skipped as a tape would)
      r1 = 0.45; if (at(r1) < 0) continue;
      let r = r1; while (r > 0 && at(r) > 0 && guard++ < 400) r -= Math.max(0.002, at(r) * 0.9);
      if (r <= 0) continue;
      r0 = r; r1 = r + 0.004; for (let k = 0; k < 20; k++) { const m = (r0 + r1) / 2; if (at(m) < 0) r0 = m; else r1 = m; }
      pts.push([dx * r0, dy * r0]);
    }
    if (pts.length < 3) return { girth: 0, pts };
    // convex hull (monotone chain)
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    const H = lo.slice(0, -1).concat(hi.slice(0, -1));
    let g = 0; for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; g += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return { girth: g, pts, hull: H };
  }
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  const G = { trunk: 1, neck: 2, armL: 4, legL: 16, legs: 48 };
  // the girths of a body (mm), measured the ANSUR way
  function girths(body) {
    const sk = body.sk, M = body.M, S = M.S / 1000, J = n => sk.bones[sk.idx[n]].J;
    const c = B.prepare(body, Human.Skeleton.fk(sk, sk.bones.map(() => Q.id())));
    const hz = (y, mask, cx = 0, cz = -0.01) => slice(c, [cx, y, cz], X, Z, mask).girth * 1000;
    // a limb's centre at a height (the leg's line from hip to ankle)
    const legX = y => { const h = J('thigh_L'), k = J('shin_L'), a = J('talus_L'); const p = y > k[1] ? V.lerp(k, h, (y - k[1]) / (h[1] - k[1])) : V.lerp(a, k, (y - a[1]) / (k[1] - a[1])); return p; };
    const legAt = y => { const p = legX(y); return slice(c, [p[0], y, p[2]], X, Z, G.legL).girth * 1000; };
    const armAt = x => slice(c, [x, J('upperarm_L')[1], J('upperarm_L')[2]], Y, Z, G.armL).girth * 1000;
    const gh = J('upperarm_L')[0], el = J('forearm_L')[0], wr = J('hand_L')[0];
    const maxOf = (f, a, b, n = 8) => { let m = 0; for (let i = 0; i <= n; i++) m = Math.max(m, f(a + (b - a) * i / n)); return m; };
    const minOf = (f, a, b, n = 8) => { let m = 1e9; for (let i = 0; i <= n; i++) m = Math.min(m, f(a + (b - a) * i / n)); return m; };
    return {
      chest: hz(M.L.nipple / 1000, G.trunk), waist: hz(M.L.navel / 1000, G.trunk), buttock: hz(0.505 * S, G.trunk | G.legs, 0, -0.03),
      thigh: legAt(M.L.crotch / 1000 - 0.012 * S), lowthigh: legAt(0.31 * S), calf: maxOf(legAt, 0.17 * S, 0.25 * S), ankle: minOf(legAt, 0.05 * S, 0.1 * S),
      arm: armAt(gh + 0.5 * (el - gh)), forearm: maxOf(armAt, el + 0.05 * (wr - el), el + 0.35 * (wr - el), 6), wrist: armAt(wr - 0.012),
      neck: hz(0.86 * S, G.neck, 0, -0.03),
    };
  }
  // scale the base radii until the girths are ANSUR's (a few rounds; each girth moves almost in proportion to its level's radii)
  function calibrate(sk, rounds = 4) {
    let F = null, body = B.build(sk), log = [];
    for (let r = 0; r < rounds; r++) {
      const g = girths(body), T = sk.M.G; F = Object.assign({}, body.F);
      const err = {};
      for (const k in g) if (T[k] && g[k] > 0) { F[k] *= Math.pow(T[k] / g[k], 1.1); err[k] = g[k] - T[k]; }
      log.push(err);
      body = B.build(sk, F);
    }
    body.calib = log; body.girths = girths(body);
    return body;
  }
  Human.Measure = { slice, girths, calibrate };
})();

// ---------------------------------------------------------------- Human: skin weights and deformation
// Weights come from the body itself: each vertex belongs to the bones whose pieces it lies on, by how far it is from each (the slabs of a loft
// overlap a little at their cuts, so the weights cross a joint over a few centimetres), never across a gap (a thigh's vertex is never weighted to
// the other thigh, an arm's never to the ribs), then smoothed over the surface. Up to four bones per vertex.
// Three ways to deform, for comparison (Variants a / b / c in the lab):
//   a  linear blend (LBS): what most games ship. Loses volume at a bent joint ("collapsing elbow") and twists into a candy wrapper.
//   b  dual quaternions (DQS, Kavan 2008): blends rigid motions, so no collapse; a slight bulge outside a bend.
//   c  DQS, then every vertex is moved onto the posed body's own surface along its gradient (the idea of implicit skinning, Vaillant 2013): the
//      posed distance field has the right volume at every joint and the muscles' bulge, so the skin takes both. No sculpted correctives.
(() => {
  const V = Human.v3, Q = Human.q, B = Human.Body;
  function weights(body, mesh, cBind, opt = {}) {
    const sk = body.sk, parts = body.parts, nv = mesh.nv, pos = mesh.pos, sig = opt.sigma || 0.011;
    // which group each bone's pieces are in
    const boneGroup = new Int8Array(sk.n).fill(-1); parts.forEach(p => { if (p.kind !== 'muscle') boneGroup[p.bone] = p.gi; });
    const ok = (vg, bg) => bg === vg || bg === 0 || (vg === 0 && bg >= 0) || (vg === 1 && bg === 0);
    const W = new Float32Array(nv * sk.n), vg = new Int8Array(nv), out = {};
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      B.dist(cBind, x, y, z, 0, out); vg[v] = out.g;
      const db = new Float64Array(sk.n).fill(1e9);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]; if (p.kind === 'muscle') continue; const bg = boneGroup[p.bone]; if (!ok(out.g, bg)) continue;
        const q = cBind.pc[i]; if (Math.hypot(x - q.cen[0], y - q.cen[1], z - q.cen[2]) - q.rad > 0.08) continue;
        const d = B.partDist(p, cBind, q, x, y, z); if (d < db[p.bone]) db[p.bone] = d;
      }
      let m = 1e9; for (let b = 0; b < sk.n; b++) m = Math.min(m, db[b]);
      for (let b = 0; b < sk.n; b++) if (db[b] < m + 6 * sig) W[v * sk.n + b] = Math.exp(-(db[b] - m) / sig);
    }
    // smooth over the surface (the weights become a smooth field; a few Jacobi steps)
    const adj = mesh.adj || (mesh.adj = Human.Mesh.adjacency(nv, mesh.idx));
    let A = W, Bf = new Float32Array(W.length);
    for (let it = 0; it < (opt.smooth || 6); it++) {
      for (let v = 0; v < nv; v++) {
        const o = v * sk.n, a0 = adj.off[v], a1 = adj.off[v + 1], n = a1 - a0;
        for (let b = 0; b < sk.n; b++) { let s = 0; for (let k = a0; k < a1; k++) s += A[adj.nb[k] * sk.n + b]; Bf[o + b] = 0.5 * A[o + b] + 0.5 * s / Math.max(1, n); }
      }
      const t = A; A = Bf; Bf = t;
    }
    // top four, normalised
    const bi = new Uint8Array(nv * 4), bw = new Float32Array(nv * 4);
    for (let v = 0; v < nv; v++) {
      const o = v * sk.n, top = [];
      for (let b = 0; b < sk.n; b++) { const w = A[o + b]; if (w > 1e-4) top.push([w, b]); }
      top.sort((a, b) => b[0] - a[0]); const s = top.slice(0, 4).reduce((s, t) => s + t[0], 0) || 1;
      for (let k = 0; k < 4; k++) { const t = top[k]; bi[v * 4 + k] = t ? t[1] : 0; bw[v * 4 + k] = t ? t[0] / s : 0; }
    }
    return { bi, bw, vg };
  }

  // skinning transforms for a pose: bone b moves a bind-pose point by  R_b R0_b^-1 (x - P0_b) + P_b
  function boneDQ(xf, bind) {
    const n = xf.R.length, dq = new Float64Array(n * 8), mat = new Float64Array(n * 12);
    for (let b = 0; b < n; b++) {
      const r = Q.norm(Q.mul(xf.R[b], Q.conj(bind.R[b]))), t = V.sub(xf.P[b], Q.rot(r, bind.P[b]));
      const o = b * 8; dq[o] = r[0]; dq[o + 1] = r[1]; dq[o + 2] = r[2]; dq[o + 3] = r[3];
      // dual part: 0.5 * t * r
      const d = Q.mul([t[0], t[1], t[2], 0], r); dq[o + 4] = d[0] * 0.5; dq[o + 5] = d[1] * 0.5; dq[o + 6] = d[2] * 0.5; dq[o + 7] = d[3] * 0.5;
      const ex = Q.rot(r, [1, 0, 0]), ey = Q.rot(r, [0, 1, 0]), ez = Q.rot(r, [0, 0, 1]), m = b * 12;
      mat[m] = ex[0]; mat[m + 1] = ey[0]; mat[m + 2] = ez[0]; mat[m + 3] = t[0]; mat[m + 4] = ex[1]; mat[m + 5] = ey[1]; mat[m + 6] = ez[1]; mat[m + 7] = t[1]; mat[m + 8] = ex[2]; mat[m + 9] = ey[2]; mat[m + 10] = ez[2]; mat[m + 11] = t[2];
    }
    return { dq, mat };
  }
  function deform(mesh, W, xf, bind, mode, out) {
    const nv = mesh.nv, P = mesh.pos, o3 = out || new Float32Array(nv * 3), { dq, mat } = boneDQ(xf, bind), bi = W.bi, bw = W.bw;
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      if (mode === 'a') {
        let X = 0, Y = 0, Z = 0;
        for (let k = 0; k < 4; k++) { const w = bw[v * 4 + k]; if (!w) continue; const m = bi[v * 4 + k] * 12;
          X += w * (mat[m] * x + mat[m + 1] * y + mat[m + 2] * z + mat[m + 3]); Y += w * (mat[m + 4] * x + mat[m + 5] * y + mat[m + 6] * z + mat[m + 7]); Z += w * (mat[m + 8] * x + mat[m + 9] * y + mat[m + 10] * z + mat[m + 11]); }
        o3[v * 3] = X; o3[v * 3 + 1] = Y; o3[v * 3 + 2] = Z;
      } else {
        // blend dual quaternions (sign-aligned to the first), normalise, apply
        let r0 = 0, r1 = 0, r2 = 0, r3 = 0, d0 = 0, d1 = 0, d2 = 0, d3 = 0; const f = bi[v * 4] * 8;
        for (let k = 0; k < 4; k++) { let w = bw[v * 4 + k]; if (!w) continue; const o = bi[v * 4 + k] * 8;
          if (dq[o] * dq[f] + dq[o + 1] * dq[f + 1] + dq[o + 2] * dq[f + 2] + dq[o + 3] * dq[f + 3] < 0) w = -w;
          r0 += w * dq[o]; r1 += w * dq[o + 1]; r2 += w * dq[o + 2]; r3 += w * dq[o + 3]; d0 += w * dq[o + 4]; d1 += w * dq[o + 5]; d2 += w * dq[o + 6]; d3 += w * dq[o + 7]; }
        const l = Math.hypot(r0, r1, r2, r3); r0 /= l; r1 /= l; r2 /= l; r3 /= l; d0 /= l; d1 /= l; d2 /= l; d3 /= l;
        // rotate
        const tx = 2 * (r1 * z - r2 * y), ty = 2 * (r2 * x - r0 * z), tz = 2 * (r0 * y - r1 * x);
        let X = x + r3 * tx + r1 * tz - r2 * ty, Y = y + r3 * ty + r2 * tx - r0 * tz, Z = z + r3 * tz + r0 * ty - r1 * tx;
        // translation = 2 * dual * conj(real)
        X += 2 * (-d3 * r0 + d0 * r3 - d1 * r2 + d2 * r1); Y += 2 * (-d3 * r1 + d1 * r3 - d2 * r0 + d0 * r2); Z += 2 * (-d3 * r2 + d2 * r3 - d0 * r1 + d1 * r0);
        o3[v * 3] = X; o3[v * 3 + 1] = Y; o3[v * 3 + 2] = Z;
      }
    }
    return o3;
  }
  // c: move each vertex onto the posed surface along the field's gradient (up to maxMove; a vertex whose field turns sharply, meaning it is in
  // contact with another part, stops there, as in implicit skinning). Only vertices near a joint need it: the rest ride one bone rigidly.
  function project(c, pos, W, opt = {}) {
    const nv = pos.length / 3, maxMove = opt.maxMove || 0.03, out = new Float32Array(pos), moved = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      if (W.bw[v * 4] > (opt.rigid || 0.985) && !opt.all) continue;
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], g0 = null;
      for (let it = 0; it < 3; it++) {
        const d = B.dist(c, x, y, z); if (Math.abs(d) < 2e-4) break;
        const g = B.grad(c, x, y, z), gl = Math.hypot(g[0], g[1], g[2]); if (gl < 1e-6) break;
        const n = [g[0] / gl, g[1] / gl, g[2] / gl];
        if (g0 && n[0] * g0[0] + n[1] * g0[1] + n[2] * g0[2] < 0.55) break;            // contact: stop
        g0 = g0 || n;
        const s = d / gl;
        x -= n[0] * s; y -= n[1] * s; z -= n[2] * s;
      }
      let dx = x - pos[v * 3], dy = y - pos[v * 3 + 1], dz = z - pos[v * 3 + 2]; const m = Math.hypot(dx, dy, dz);
      if (m > maxMove) { const k = maxMove / m; dx *= k; dy *= k; dz *= k; }
      out[v * 3] += dx; out[v * 3 + 1] += dy; out[v * 3 + 2] += dz; moved[v] = Math.min(m, maxMove);
    }
    // the moves are smoothed over the surface (a vertex stopped by a contact and its neighbour that was not would otherwise make a step)
    if (opt.adj) {
      const adj = opt.adj; let D = new Float32Array(nv * 3), E = new Float32Array(nv * 3);
      for (let i = 0; i < nv * 3; i++) D[i] = out[i] - pos[i];
      for (let it = 0; it < (opt.smooth || 4); it++) {
        for (let v = 0; v < nv; v++) { const a0 = adj.off[v], a1 = adj.off[v + 1]; let sx = 0, sy = 0, sz = 0;
          for (let k = a0; k < a1; k++) { const u = adj.nb[k] * 3; sx += D[u]; sy += D[u + 1]; sz += D[u + 2]; }
          const n = Math.max(1, a1 - a0); E[v * 3] = 0.5 * D[v * 3] + 0.5 * sx / n; E[v * 3 + 1] = 0.5 * D[v * 3 + 1] + 0.5 * sy / n; E[v * 3 + 2] = 0.5 * D[v * 3 + 2] + 0.5 * sz / n; }
        const t = D; D = E; E = t;
      }
      for (let i = 0; i < nv * 3; i++) out[i] = pos[i] + D[i];
    }
    return { pos: out, moved };
  }
  Human.Skin = { weights, deform, project, boneDQ };
})();

// ---------------------------------------------------------------- Human: the stress poses (the joints where bodies usually break)
// Each pose is a few anatomical numbers on top of the rest pose; the skeleton spreads them over the bones (spine shares, scapular rhythm, twist
// bones) and clamps them to the joint ranges. Human.ground puts the lowest foot back on the floor.
(() => {
  const P = (name, zh, f) => { const p = Human.restPose(); f(p); return { name, zh, pose: p }; };
  const arms = (p, o) => { Object.assign(p.arm_L, o); Object.assign(p.arm_R, o); };
  const legs = (p, o) => { Object.assign(p.leg_L, o); Object.assign(p.leg_R, o); };
  Human.bindPose = () => { const p = Human.restPose(); arms(p, { elev: 45, plane: 15, elbow: 10 }); return p; };
  Human.POSES = [
    P('apose', 'A 字站姿（绑定姿势）', p => arms(p, { elev: 45, plane: 15, elbow: 10 })),
    P('relaxed', '自然站立', p => { arms(p, { elev: 8, plane: 20, elbow: 12, pron: 10 }); p.spine.flex = 3; }),
    P('tpose', 'T 字', p => arms(p, { elev: 90, plane: 0 })),
    P('overhead', '双臂举过头', p => { arms(p, { elev: 168, plane: 35, axial: -25, elbow: 8 }); p.spine.flex = -8; }),
    P('squat', '深蹲', p => { p.root.rot = [32, 0, 0]; legs(p, { flex: 127, abd: 14, rot: -12, knee: 120, ankle: -25 }); p.spine.flex = 24; p.neck.flex = -25; arms(p, { elev: 85, plane: 90, elbow: 15 }); }),
    P('lunge', '弓步', p => { Object.assign(p.leg_L, { flex: 88, knee: 92, ankle: -12 }); Object.assign(p.leg_R, { flex: -16, knee: 85, ankle: 30, toe: 55 }); p.root.rot = [6, 0, 0];
      arms(p, { elev: 20, plane: 60, elbow: 70 }); }),
    P('twist', '扭转 45°', p => { p.spine.twist = 45; p.neck.yaw = 25; Object.assign(p.arm_L, { elev: 70, plane: -20, elbow: 40 }); Object.assign(p.arm_R, { elev: 75, plane: 110, elbow: 30 }); }),
    P('bend', '体前屈', p => { p.root.rot = [72, 0, 0]; legs(p, { flex: 72, knee: 4, ankle: 4 }); p.spine.flex = 38; p.neck.flex = -10; arms(p, { elev: 95, plane: 90, elbow: 5, pron: 20 }); }),   // (the pelvis tips forward over straight legs)
    P('carve', '滑雪刻滑（倾斜 50°）', p => { p.root.rot = [12, 0, -42]; Object.assign(p.leg_L, { flex: 70, abd: -6, knee: 78, ankle: -20, inv: 8 }); Object.assign(p.leg_R, { flex: 50, abd: 8, knee: 52, ankle: -20, inv: -6 });
      p.spine = { flex: 22, lat: -20, twist: -12 }; p.neck = { flex: -20, lat: 18, yaw: 10 }; arms(p, { elev: 40, plane: 75, elbow: 65, grip: 1, thumb: 0.7 }); Object.assign(p.arm_L, { elev: 30 }); }),
    P('tuck', '团身（速降）', p => { p.root.rot = [40, 0, 0]; legs(p, { flex: 112, knee: 97, ankle: -25 }); p.spine.flex = 26; p.neck.flex = -45; arms(p, { elev: 70, plane: 88, elbow: 115, grip: 1, thumb: 0.8 }); }),
    P('reach', '交叉抱臂 / 背手', p => { Object.assign(p.arm_L, { elev: 95, plane: 128, elbow: 25 }); Object.assign(p.arm_R, { elev: 35, plane: -40, axial: 60, elbow: 95, pron: 40 }); p.spine.twist = 10; }),
  ];
  // the pose's root shifted so that the lowest ankle stays on the floor where it stood (feet keep their heights)
  Human.ground = (sk, pose) => {
    const xf0 = Human.Skeleton.pose(sk, Human.restPose()), xf = Human.Skeleton.pose(sk, pose), I = sk.idx;
    const feet = ['talus_L', 'talus_R'].map(n => [xf.P[I[n]], xf0.P[I[n]]]);
    const lo = feet[0][0][1] < feet[1][0][1] ? feet[0] : feet[1];
    const p = JSON.parse(JSON.stringify(pose));
    p.root.pos = [p.root.pos[0], p.root.pos[1] + lo[1][1] - lo[0][1], p.root.pos[2] + (feet[0][1][2] + feet[1][1][2] - feet[0][0][2] - feet[1][0][2]) / 2];
    return p;
  };
})();

// ---------------------------------------------------------------- Human: motion (clips that play the anatomical pose over time)
// A clip is a function of its phase u (0..1) that returns an anatomical pose and a lift (m, for flight). Motion.sample puts the lowest point of
// the feet (heel, ball, toe tip) on the floor and adds the lift, so a clip never has to know the body's size.
//   daily: walk and run from the textbook gait curves (sagittal joint angles over one stride, Winter 1991 / Perry 1992 shapes, rounded),
//          a countermovement jump (ballistic flight from the take-off speed) and a squat
//   ski:   the carved turn from real skiing video (data/mocap, CC BY: the joint directions per phase are fitted onto this skeleton),
//          the straight-line tuck, a jump on skis
(() => {
  const D = Math.PI / 180, V = Human.v3;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  // periodic Catmull-Rom through [percent, value] points
  const cyc = pts => {
    const P = pts[pts.length - 1][0] === 100 ? pts.slice(0, -1) : pts, n = P.length;
    return u => {
      const x = ((u % 1) + 1) % 1 * 100; let i = n - 1; for (let k = 0; k < n; k++) if (P[k][0] <= x) i = k;
      const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
      const span = ((c[0] - b[0]) + 100) % 100 || 100, t = (((x - b[0]) + 100) % 100) / span;
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * b[1] + (-a[1] + c[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3);
    };
  };
  // Catmull-Rom through key poses at times (s), clamped at the ends: any tree of numbers
  const mix = (trees, w) => { const t0 = trees[0];
    if (typeof t0 === 'number') return trees.reduce((s, x, i) => s + x * w[i], 0);
    if (Array.isArray(t0)) return t0.map((_, j) => mix(trees.map(t => t[j]), w));
    const o = {}; for (const k in t0) o[k] = mix(trees.map(t => t[k] != null ? t[k] : t0[k]), w); return o; };
  // (monotone cubic, Fritsch-Carlson: a value never swings past its keys, so a key at a joint's limit stays inside the limit; ends at rest)
  const herm = (a, b, c, d, ta, tb, tc, td, s) => {
    if (typeof b === 'number') { const h = tc - tb, d1 = (c - b) / h, d0 = tb > ta ? (b - a) / (tb - ta) : 0, d2 = td > tc ? (d - c) / (td - tc) : 0;
      const mb = d0 * d1 <= 0 ? 0 : 2 / (1 / d0 + 1 / d1), mc = d1 * d2 <= 0 ? 0 : 2 / (1 / d1 + 1 / d2), s2 = s * s, s3 = s2 * s;
      return b * (2 * s3 - 3 * s2 + 1) + h * mb * (s3 - 2 * s2 + s) + c * (-2 * s3 + 3 * s2) + h * mc * (s3 - s2); }
    if (Array.isArray(b)) return b.map((_, j) => herm(a[j], b[j], c[j], d[j], ta, tb, tc, td, s));
    const o = {}, g = (t, k) => t[k] != null ? t[k] : b[k]; for (const k in b) o[k] = herm(g(a, k), b[k], g(c, k), g(d, k), ta, tb, tc, td, s); return o; };
  const keys = K => t => {
    let i = 0; while (i < K.length - 2 && K[i + 1][0] <= t) i++;
    const b = K[i], c = K[i + 1], a = K[Math.max(0, i - 1)], d = K[Math.min(K.length - 1, i + 2)];
    return herm(a[1], b[1], c[1], d[1], a[0], b[0], c[0], d[0], clamp((t - b[0]) / (c[0] - b[0]), 0, 1));
  };
  // a pose from a few fields on top of the rest pose
  const make = f => { const p = Human.restPose(); f(p); return p; };
  const set = (p, o) => { for (const k in o) Object.assign(p[k], o[k]); return p; };
  const both = (p, part, o) => { Object.assign(p[part + '_L'], o); Object.assign(p[part + '_R'], o); };
  // the arm swung forward (+) or back (-) by s deg out of a slight abduction a: elevation and plane
  const swing = (s, a) => ({ elev: Math.hypot(s, a), plane: Math.atan2(s, a) / D });

  // ---- daily
  const GAIT = {
    walk: { hip: cyc([[0, 28], [12, 24], [30, 6], [50, -11], [62, 1], [75, 22], [88, 32], [100, 28]]),
      knee: cyc([[0, 4], [15, 17], [38, 5], [50, 9], [62, 42], [73, 63], [85, 34], [95, 6], [100, 4]]),
      ankle: cyc([[0, -3], [8, 3], [30, -10], [47, -13], [62, 12], [70, 2], [80, -5], [90, -4], [100, -3]]),        // + plantar
      toe: cyc([[0, 4], [40, 8], [56, 34], [64, 22], [72, 4], [100, 4]]) },
    run: { hip: cyc([[0, 32], [18, 16], [38, -10], [50, 2], [65, 34], [85, 48], [100, 32]]),
      knee: cyc([[0, 20], [16, 42], [38, 18], [55, 68], [70, 95], [86, 58], [100, 20]]),
      ankle: cyc([[0, -8], [16, -24], [38, 18], [55, 5], [75, -8], [100, -8]]),
      toe: cyc([[0, 4], [30, 10], [38, 32], [48, 8], [100, 4]]) },
  };
  // the signs of the skeleton's root and spine turns, read off the skeleton once (so the clips can say "left hip forward")
  let SG = null;
  const signs = sk => {
    if (SG) return SG; const I = sk.idx, at = f => Human.Skeleton.pose(sk, make(f));
    const r = at(() => {}), y = at(p => { p.root.rot = [0, 10, 0]; }), z = at(p => { p.root.rot = [0, 0, 10]; }), tw = at(p => { p.spine.twist = 10; });
    SG = { yaw: y.P[I.thigh_L][2] > r.P[I.thigh_L][2] ? 1 : -1, roll: z.P[I.thigh_L][1] > r.P[I.thigh_L][1] ? 1 : -1,
      twist: tw.P[I.upperarm_L][2] > r.P[I.upperarm_L][2] ? 1 : -1,
      neck: Human.q.rot(at(p => { p.neck.yaw = 30; }).R[I.head], [0, 0, 1])[0] > 0 ? 1 : -1 };       // + = the face turns to the body's left
    return SG;
  };
  const gait = (G, run) => (u, sk) => {
    const s = signs(sk), L = u, R = (u + 0.5) % 1, c = Math.cos(2 * Math.PI * u);
    return { pose: make(p => {
      for (const [side, v] of [['L', L], ['R', R]]) {
        Object.assign(p['leg_' + side], { flex: G.hip(v), knee: G.knee(v), ankle: G.ankle(v), toe: G.toe(v), abd: run ? -5 : 3 * Math.cos(2 * Math.PI * v) - 5 });   // step width about 12 cm (Donelan 2001)
        // the arm swings with the opposite leg: forward as this side's leg goes back
        // (shoulder range: walk about 30-40 deg, run about +35 / -40 deg; Bohannon 1997, Hinrichs 1987)
        // running: +38 forward, -50 back, the elbow opening to about 70 behind the body and closing to about 105 in front
        const sw = run ? -23 * Math.cos(2 * Math.PI * v) - 18 : -15 * Math.cos(2 * Math.PI * v) + 2;
        Object.assign(p['arm_' + side], swing(sw, run ? 10 : 2 + 3 * Math.max(0, sw) / 17), { elbow: run ? 98 + 20 * (sw + 41) / 46 : 28 + 22 * Math.max(0, sw) / 17, pron: 10, grip: run ? 0.5 : 0.15, thumb: run ? 0.4 : 0.1 });
      }
      // pelvis: turns forward with the swinging leg and drops on the swing side; the chest turns the other way; the trunk leans in a run
      p.root.rot = [run ? 7 : 3, s.yaw * (run ? -4 : 5) * c, s.roll * (run ? 4 : 3.5) * Math.sin(2 * Math.PI * u * 2 - 0.4) * (u < 0.5 ? 1 : -1) * 0];
      p.root.rot[2] = s.roll * (run ? 4 : 3) * Math.sin(2 * Math.PI * u);
      // the body sways over the stance foot: about 4 cm side to side in a walk, 3 cm in a run (left foot, +x, carries the weight around u 0.25)
      p.root.pos = [(run ? 0.012 : 0.02) * Math.sin(2 * Math.PI * (u - (run ? 0.12 : 0))), 0, 0];
      p.spine.twist = -s.twist * (run ? 14 : 12) * c; p.spine.flex = run ? 8 : 4; p.neck.flex = run ? -5 : -2; p.neck.yaw = s.twist * (run ? 5 : 3) * c;
    }), lift: run ? 0.08 * Math.max(0, Math.sin(Math.PI * clamp(((u % 0.5) * 2 - 0.76) / 0.24, 0, 1))) : 0 };
  };

  const STAND = make(p => { both(p, 'leg', { abd: 4, rot: -8 }); both(p, 'arm', { elev: 8, plane: 20, elbow: 12, pron: 10 }); });
  const deep = (f, k, a) => make(p => { p.root.rot = [f * 0.2, 0, 0]; both(p, 'leg', { flex: f, knee: k, ankle: a, abd: 6, rot: -6 }); p.spine.flex = f * 0.18; p.neck.flex = -f * 0.2; both(p, 'arm', { elev: 8, plane: 20, elbow: 12, pron: 10 }); });
  const squatK = keys([[0, STAND], [0.4, STAND],
    [1.6, make(p => { p.root.rot = [21, 0, 0]; both(p, 'leg', { flex: 106, abd: 12, rot: -8, knee: 118, ankle: -25 }); p.spine.flex = 44; p.neck.flex = -25; both(p, 'arm', { elev: 100, plane: 86, elbow: 20 }); })],
    // (the bottom is held only briefly and keeps settling: no frozen frames)
    [1.85, make(p => { p.root.rot = [20, 0, 0]; both(p, 'leg', { flex: 102, abd: 12, rot: -8, knee: 112, ankle: -24 }); p.spine.flex = 43; p.neck.flex = -24; both(p, 'arm', { elev: 100, plane: 86, elbow: 22 }); })],
    [3.1, STAND], [3.6, STAND]]);
  // countermovement jump: dip, drive (arms swing up), flight, land and absorb
  // the arms swing from behind the body to in front of it by passing straight down past the hips (keys on the angles alone would carry them out
  // sideways through a T)
  const J08 = make(p => { p.root.rot = [20, 0, 0]; both(p, 'leg', { flex: 78, knee: 82, ankle: -26, abd: 9 }); p.spine.flex = 26; p.neck.flex = -12; both(p, 'arm', { ...swing(-50, 10), elbow: 35 }); }), J093 = make(p => { p.root.rot = [20, 0, 0]; both(p, 'leg', { flex: 42, knee: 42, ankle: -24, abd: 4 }); p.spine.flex = 8; p.neck.flex = 0; both(p, "arm", { elev: 45, plane: 78, elbow: 22 }); });
  const J0865 = Human.lerpPose(J08, J093, 0.5); for (const sd of ['L', 'R']) Object.assign(J0865['arm_' + sd], { elev: 4, plane: 40 });
  // the arms reach full backswing a little before the bottom of the dip and are already swinging down past the hips at the bottom (one fast
  // flick from the bottom made the shoulder 1300-1450 deg/s)
  const J072 = Human.lerpPose(STAND, J08, 0.85), J08b = Human.lerpPose(J08, J0865, 0); for (const sd of ['L', 'R']) { Object.assign(J072['arm_' + sd], J08['arm_' + sd]); Object.assign(J08b['arm_' + sd], { ...swing(-30, 10), elbow: 30 }); }
  const jumpK = keys([[0, STAND], [0.3, STAND],
    [0.72, J072],
    [0.8, J08b],
    [0.865, J0865],
    [0.93, J093],

    [1.05, make(p => { p.root.rot = [4, 0, 0]; both(p, 'leg', { flex: -4, knee: 2, ankle: 38, toe: 40 }); p.spine.flex = -4; both(p, 'arm', { elev: 90, plane: 85, elbow: 35 }); })],
    [1.3, make(p => { p.root.rot = [2, 0, 0]; both(p, 'leg', { flex: 8, knee: 14, ankle: 14, toe: 5 }); both(p, 'arm', { elev: 45, plane: 75, elbow: 20 }); })],
    [1.64, make(p => { p.root.rot = [16, 0, 0]; both(p, 'leg', { flex: 34, knee: 28, ankle: 10, toe: 0 }); p.spine.flex = 10; both(p, 'arm', { elev: 60, plane: 70, elbow: 25 }); })],
    // the heels come down about 70 ms after the balls, with the body still over the feet
    [1.71, make(p => { p.root.rot = [22, 0, 0]; both(p, 'leg', { flex: 55, knee: 52, ankle: -14, abd: 4 }); p.spine.flex = 10; p.neck.flex = -10; both(p, 'arm', { elev: 55, plane: 75, elbow: 28 }); })],
    [1.9, make(p => { p.root.rot = [20, 0, 0]; both(p, 'leg', { flex: 62, knee: 66, ankle: -24, abd: 9 }); p.spine.flex = 12; p.neck.flex = -15; both(p, 'arm', { elev: 50, plane: 80, elbow: 30 }); })],
    [2.6, STAND], [3.2, STAND]]);
  // a flight from t1 to t2 (s): the centre of mass rises g T^2 / 8 at the top, whatever the pose does (solve() puts the centre of mass on this arc)
  const flight = (t, t1, t2) => t > t1 && t < t2 ? 4 * (9.81 * (t2 - t1) ** 2 / 8) * ((t - t1) / (t2 - t1)) * (1 - (t - t1) / (t2 - t1)) : 0;

  // ---- ski
  // ski stance: ankles closed in the boots, knees and hips flexed, hands forward holding the poles
  const skiArms = (p, o) => both(p, 'arm', Object.assign({ elev: 38, plane: 72, elbow: 62, pron: 30, grip: 1, thumb: 0.7, wdev: 10 }, o));
  const SKI = make(p => { p.root.rot = [22, 0, 0]; both(p, 'leg', { flex: 42, knee: 52, ankle: -18, abd: 1 }); p.spine.flex = 16; p.neck.flex = -18; skiArms(p, {}); });
  // a race tuck: the back close to level (drag rises about 0.8 % per degree of torso angle, Elfmark), the head up to see, hands before the chin
  const TUCK = make(p => { p.root.rot = [52, 0, 0]; both(p, 'leg', { flex: 110, knee: 110, ankle: -29 }); p.spine.flex = 30; p.neck.flex = -55; p.root.rot[0] = 48; skiArms(p, { elev: 72, plane: 100, elbow: 115 }); });
  const skiJumpK = keys([[0, SKI], [0.3, SKI],
    [0.6, make(p => { p.root.rot = [28, 0, 0]; both(p, 'leg', { flex: 72, knee: 88, ankle: -24 }); p.spine.flex = 22; p.neck.flex = -22; skiArms(p, { elev: 30, plane: 60 }); })],
    [0.82, make(p => { p.root.rot = [12, 0, 0]; both(p, 'leg', { flex: 18, knee: 16, ankle: -18 }); p.spine.flex = 10; p.neck.flex = -10; skiArms(p, { elev: 60, plane: 80, elbow: 40 }); })],
    // a real tuck at the top of the air: knees and hips near 100 (a visible freestyle tuck)
    [1.1, make(p => { p.root.rot = [20, 0, 0]; both(p, 'leg', { flex: 125, knee: 115, ankle: -20 }); p.spine.flex = 25; p.neck.flex = -22; skiArms(p, { elev: 50, plane: 85, elbow: 80 }); })],
    [1.25, make(p => { p.root.rot = [20, 0, 0]; both(p, 'leg', { flex: 125, knee: 115, ankle: -20 }); p.spine.flex = 25; p.neck.flex = -22; skiArms(p, { elev: 50, plane: 85, elbow: 80 }); })],
    [1.4, make(p => { p.root.rot = [8, 0, 0]; both(p, 'leg', { flex: 85, knee: 80, ankle: -20 }); p.spine.flex = 22; p.neck.flex = -20; skiArms(p, { elev: 55, plane: 85, elbow: 75 }); })],
    [1.6, make(p => { p.root.rot = [10, 0, 0]; both(p, 'leg', { flex: 62, knee: 60, ankle: -20 }); p.spine.flex = 14; p.neck.flex = -18; skiArms(p, { elev: 45, plane: 75, elbow: 50 }); })],
    [1.8, make(p => { p.root.rot = [28, 0, 0]; both(p, 'leg', { flex: 84, knee: 95, ankle: -25 }); p.spine.flex = 26; p.neck.flex = -28; skiArms(p, { elev: 50, plane: 80, elbow: 55 }); })],
    [2.6, SKI], [3.0, SKI]]);

  // the carved turn: one right turn, mirrored for the left turn. The video gives, per phase, how far the hips lean inside the feet, how low they
  // sit and how far the shoulders turn against the pelvis (the sideways plane is what one camera measures well); the skis are put parallel on
  // the snow under that, the legs are solved to reach them (the inside leg folds, the outside leg stays long) and the trunk leans back out
  // over the outside ski (angulation). The raw joint directions are not used: their depth is too noisy and crosses the skis.
  const carveCache = new WeakMap();
  function fitCarve(sk) {
    if (carveCache.has(sk)) return carveCache.get(sk);
    const M = Human.MOCAP && Human.MOCAP.carve; if (!M) return null;
    const I = sk.idx, J = n => sk.bones[I[n]].J, s = signs(sk);
    const legLen = V.len(V.sub(J('shin_L'), J('thigh_L'))) + V.len(V.sub(J('talus_L'), J('shin_L')));
    // coordinate descent on a few fields of the pose, from the previous phase's answer
    const descend = (p, fields, err, step = 16) => {
      let e = err(p);
      for (let st = step; st > 0.1; st /= 2) for (let rep = 0; rep < 4; rep++) { let moved = false;
        for (const [o, k] of fields) for (const dv of [st, -st]) { o(p)[k] += dv; const e2 = err(p); if (e2 < e - 1e-12) { e = e2; moved = true; } else o(p)[k] -= dv; }
        if (!moved) break; }
      return e;
    };
    const latSign = (() => { const a = Human.Skeleton.pose(sk, make(p => { p.spine.lat = 20; })); return a.P[I.head][0] > 0 ? 1 : -1; })();   // + = the chest leans to the body's left
    const out = []; let prev = SKI; const stance = 0.34 * sk.M.S / 1756;
    for (let ph = 0; ph < M.phases; ph++) {
      // deg, + = the hips to the body's left of the feet. The video is a slalom racer (legs lean 45); recreational skiers and Steep's lean 21-35, so 0.75 of it
      const lean = 0.9 * Math.atan2(-M.hipLateral[ph], M.hipHeight[ph]) / D;
      // depth: the hips stay at 0.80-0.95 of the leg's length from the feet (outside knee about 45-65 deg in slalom, Zorko 2015)
      const ext = clamp(Math.max(1.06 * Math.hypot(M.hipLateral[ph], M.hipHeight[ph]) + 0.01, 0.93 - 0.006 * Math.abs(Math.atan2(M.hipLateral[ph], M.hipHeight[ph]) / D)), 0.76, 0.93), low = clamp(1 - ext, 0.05, 0.2), tw = (M.twist ? M.twist[ph] : 0) / D;
      const p = JSON.parse(JSON.stringify(prev));
      // the pelvis: leans with the turn (less than the legs do), tips forward more as it sinks; sits behind the boots as the knees fold
      p.root.rot = [14 + 22 * low, 0, -s.roll * 0.35 * lean];
      p.root.pos = [0, 0, 0];
      const hipW = [Math.sin(lean * D) * ext * legLen, Math.cos(lean * D) * ext * legLen, -0.03 * legLen];   // the hips stay over the heels to midfoot (no backseat)        // mid-hip from mid-ankle, world
      const X = () => Human.Skeleton.pose(sk, p), at = (xf, n) => xf.P[I[n]];
      // which way the roll leans: checked on the skeleton (the hips' line must dip toward the inside of the turn)
      { const xf = X(), d = V.sub(at(xf, 'thigh_L'), at(xf, 'thigh_R')); if ((d[1] > 0) === (lean > 0)) p.root.rot[2] = -p.root.rot[2]; }
      for (const sd of ['L', 'R']) {
        const foot = [(sd === 'L' ? 1 : -1) * stance / 2, 0, 0];
        { // a first answer in the leg's own plane (knee angle from the reach, hip angles from the direction), then refined on the skeleton
          const xf = X(), mid = V.lerp(at(xf, 'thigh_L'), at(xf, 'thigh_R'), 0.5), hip = V.sub(at(xf, 'thigh_' + sd), mid);
          const d = Human.q.rot(Human.q.conj(xf.R[I.pelvis]), V.sub(V.sub(foot, hipW), hip)), tl = V.len(V.sub(J('shin_L'), J('thigh_L'))), sl = legLen - tl, r = Math.min(V.len(d), legLen * 0.999);
          const knee = 180 - Math.acos(clamp((tl * tl + sl * sl - r * r) / (2 * tl * sl), -1, 1)) / D, al = Math.acos(clamp((tl * tl + r * r - sl * sl) / (2 * tl * r), -1, 1)) / D;
          Object.assign(p['leg_' + sd], { flex: Math.atan2(d[2], -d[1]) / D + al, abd: Math.atan2(d[0] * (sd === 'L' ? 1 : -1), -d[1]) / D, rot: 0, knee }); }
        Object.assign(p['leg_' + sd], { ankle: -24, inv: 0, toe: 0 });
        descend(p, [[q => q['leg_' + sd], 'flex'], [q => q['leg_' + sd], 'abd'], [q => q['leg_' + sd], 'rot'], [q => q['leg_' + sd], 'knee']], () => { const xf = X();
          const mid = V.lerp(at(xf, 'thigh_L'), at(xf, 'thigh_R'), 0.5), a = V.sub(at(xf, 'talus_' + sd), mid), t = V.sub(foot, hipW);
          const c = contacts(sk, xf), o = sd === 'L' ? 0 : 3, f = V.sub(c[o + 1], c[o]), ski = 1 - f[2] / Math.hypot(f[0], f[2]);
          return V.dot(V.sub(a, t), V.sub(a, t)) * 3000 + ski; }, 3);
        // the leg stays inside its joint ranges (the skis are made parallel later, by the solver, within the same ranges)
        for (const q of ['flex', 'abd', 'rot', 'knee']) { const R = Human.ROM.leg[q]; p['leg_' + sd][q] = clamp(p['leg_' + sd][q], R[0], R[1]); }
        // the boot: the ankle holds the ski level from tip to tail
        descend(p, [[q => q['leg_' + sd], 'ankle']], () => { const c = contacts(sk, X()), o = sd === 'L' ? 0 : 3; return (c[o + 1][1] - c[o][1]) ** 2; }, 8);
        p['leg_' + sd].ankle = clamp(p['leg_' + sd].ankle, Human.ROM.leg.ankle[0], Human.ROM.leg.ankle[1]);
      }
      // angulation: the trunk leans back toward the outside ski, the head stays level; the chest turns against the pelvis as measured
      // (measured: trunk side bend only 3-10 deg, the chest turned 0-8 deg toward the outside ski; the angulation is mostly at the hips)
      p.spine = { flex: 18 + 30 * low, lat: -latSign * 0.2 * lean, twist: -s.twist * 0.3 * tw };
      p.neck = { flex: -(14 + 30 * low), lat: -latSign * 0.25 * lean, yaw: -s.neck * 0.3 * tw };
      // the outside hand (right in a lean to the left) rises and opens, the inside hand drops in front; continuous through the switch of turns
      skiArms(p, { elev: 48, elbow: 50 }); const k = clamp(lean / 30, -1, 1);
      Object.assign(p.arm_R, { elev: 42 + 8 * k, plane: 62 - 8 * k, elbow: 78 - 12 * k }); Object.assign(p.arm_L, { elev: 42 - 8 * k, plane: 62 + 8 * k, elbow: 78 + 12 * k });
      out.push(p); prev = p;
    }
    // the left turn: the right turn mirrored
    const mirror = p => { const q = JSON.parse(JSON.stringify(p));
      [q.arm_L, q.arm_R] = [q.arm_R, q.arm_L]; [q.leg_L, q.leg_R] = [q.leg_R, q.leg_L];
      q.spine.lat = -q.spine.lat; q.spine.twist = -q.spine.twist; q.neck.lat = -q.neck.lat; q.neck.yaw = -q.neck.yaw;
      q.root.rot = [q.root.rot[0], -q.root.rot[1], -q.root.rot[2]]; q.root.pos = [-q.root.pos[0], q.root.pos[1], q.root.pos[2]]; return q; };
    const all = out.concat(out.map(mirror)), r = { poses: all, turn: M.seconds || 1.2 };
    carveCache.set(sk, r); return r;
  }
  // skiers hold the apex of the turn (the outside knee is near still for about a third of the cycle, Alhammoud 2020) and move quickly through
  // the edge change: the phase is slowed around each apex (u 0.2 and 0.7) and sped up between
  const carve = (u0, sk) => {
    const C = fitCarve(sk); if (!C) return { pose: SKI };
    const u = ((u0 + 0.3 * Math.sin(4 * Math.PI * (u0 - 0.2)) / (4 * Math.PI)) % 1 + 1) % 1;
    const n = C.poses.length, x = u * n, i = Math.floor(x) % n, t = x - Math.floor(x);
    const P = k => C.poses[(i + k + n) % n], t2 = t * t, t3 = t2 * t;
    const pose = mix([P(-1), P(0), P(1), P(2)], [(-t + 2 * t2 - t3) / 2, (2 - 5 * t2 + 3 * t3) / 2, (t + 4 * t2 - 3 * t3) / 2, (-t2 + t3) / 2]);
    // the skis swing across the fall line and back (heading follows the lean: across the hill at each edge change, down it at the apex);
    // the legs turn under a pelvis that keeps facing down the hill, as in moguls
    const hd = -20 * Math.sin(2 * Math.PI * (u - 0.2)); pose.leg_L.rot -= hd; pose.leg_R.rot += hd;   // (sign checked: the skis turn toward the side the hips lean to)
    return { pose, heading: hd };
  };
  // tuck: held, with the small weight shifts of a racer over the skis (no springs: a slow periodic sway)
  const tuck = u => ({ pose: Human.lerpPose(Human.lerpPose(TUCK, make(p => { p.root.rot = [48, 0, 0]; both(p, 'leg', { flex: 126, knee: 106, ankle: -30 }); p.spine.flex = 31; p.neck.flex = -55; skiArms(p, { elev: 90, plane: 90, elbow: 130 }); }), 0.5 - 0.5 * Math.cos(2 * Math.PI * u)),
    make(p => { Object.assign(p, JSON.parse(JSON.stringify(TUCK))); p.root.rot = [52, 0, 4]; p.leg_L.flex = 116; p.leg_L.knee = 96; p.spine.twist = 4; p.neck.yaw = 5; }), 0.1 - 0.1 * Math.cos(2 * Math.PI * (u * 2 + 0.3))) });

  // moguls: the legs fold over each bump and reach into each trough while the trunk stays quiet
  // (knee travel per bump about 55 deg, knees kept together)
  const ABSORB = make(p => { p.root.rot = [32, 0, 0]; both(p, 'leg', { flex: 90, knee: 98, ankle: -35, abd: 0 }); p.spine.flex = 26; p.neck.flex = -30; skiArms(p, { elev: 56, plane: 38, elbow: 70 }); });
  const REACH = make(p => { p.root.rot = [22, 0, 0]; both(p, 'leg', { flex: 50, knee: 50, ankle: -18 }); p.spine.flex = 24; p.neck.flex = -18; skiArms(p, { elev: 42, plane: 38, elbow: 66 }); });
  // (two bumps per cycle: absorb on each crest, the skis turn about +-15 deg under a trunk that keeps facing the fall line; the inside hand reaches to plant)
  const moguls = u => { const p = Human.lerpPose(REACH, ABSORB, 0.5 - 0.5 * Math.cos(4 * Math.PI * u)), hd = 15 * Math.sin(2 * Math.PI * u);
    p.leg_L.rot = -hd; p.leg_R.rot = hd; const ins = hd > 0 ? 'L' : 'R', k = Math.abs(hd) / 15; p['arm_' + ins].elev += 20 * k; p['arm_' + ins].plane += 6 * k;
    // a pole plant on every bump: the inside hand reaches forward and down as the crest arrives and the tip touches beside the ski tip
    const pl = Math.max(0, Math.cos(4 * Math.PI * (u - 0.22))) ** 4; p.plant = ins === 'L' ? [pl, 0] : [0, pl];
    Object.assign(p['arm_' + ins], { elev: p['arm_' + ins].elev + 10 * pl, plane: p['arm_' + ins].plane + 10 * pl, elbow: p['arm_' + ins].elbow - 15 * pl });
    return { pose: p, heading: hd }; };
  // a spread eagle off a kicker: pop, legs and arms out wide in the air, back together to land
  const spreadK = keys([[0, SKI], [0.3, SKI],
    [0.6, make(p => { p.root.rot = [28, 0, 0]; both(p, 'leg', { flex: 72, knee: 88, ankle: -24 }); p.spine.flex = 22; p.neck.flex = -22; skiArms(p, { elev: 30, plane: 60 }); })],
    [0.82, make(p => { p.root.rot = [8, 0, 0]; both(p, 'leg', { flex: 12, knee: 10, ankle: -18 }); p.spine.flex = 6; p.neck.flex = -8; skiArms(p, { elev: 70, plane: 40, elbow: 30 }); })],
    [1.2, make(p => { p.root.rot = [0, 0, 0]; both(p, 'leg', { flex: 20, knee: 25, ankle: -18, abd: 42, rot: -12 }); p.spine.flex = 5; skiArms(p, { elev: 100, plane: 10, elbow: 35 }); })],
    [1.5, make(p => { p.root.rot = [10, 0, 0]; both(p, 'leg', { flex: 24, knee: 26, ankle: -18, abd: 6 }); p.spine.flex = 10; p.neck.flex = -12; skiArms(p, { elev: 50, plane: 60, elbow: 45 }); })],
    [1.8, make(p => { p.root.rot = [30, 0, 0]; both(p, 'leg', { flex: 92, knee: 110, ankle: -25 }); p.spine.flex = 28; p.neck.flex = -30; skiArms(p, { elev: 50, plane: 80, elbow: 55 }); })],
    [2.6, SKI], [3.0, SKI]]);

  // a powder slash: the skis are thrown across the fall line (about 70 deg) under a chest that keeps looking down the hill, the body sinks and leans
  // back up the hill, the outside arm is flung out for balance (Steep s_0161, f_0121)
  const SLASH = make(p => { p.root.rot = [28, 0, 0]; both(p, 'leg', { flex: 46, knee: 54, ankle: -20 }); p.spine.flex = 32; p.neck.flex = -22; skiArms(p, {});
    Object.assign(p.arm_R, { elev: 45, plane: 85, elbow: 45 }); Object.assign(p.arm_L, { elev: 42, plane: 25, elbow: 60 }); });
  const slash = (u, sk) => { const t = u * 2.4, w = Human.smooth(0.3, 0.75, t) * (1 - Human.smooth(1.5, 2.1, t)), s = signs(sk), p = Human.lerpPose(SKI, SLASH, w);
    p.spine.twist = s.twist * 40 * w; p.neck.yaw = -s.neck * 20 * w;
    // the body leans into the slash (the snow pushes the skis back toward the hill) and keeps sinking through it
    const roll = -s.roll * 24 * w; p.spine.lat += 0.3 * roll; p.neck.lat = 0.85 * roll; p.neck.flex = -10 * w; const sink = 6 * w * Math.sin(Math.PI * Human.smooth(0.6, 1.6, t)); for (const sd of ['L', 'R']) { p['leg_' + sd].flex += sink; p['leg_' + sd].knee += sink; }
    return { pose: p, heading: (55 + 5 * Human.smooth(0.6, 1.5, t)) * w, roll }; };

  // ---- snowboard (regular stance: the left foot leads, the board runs toward the body's left)
  // tilt = the pelvis' forward tip, hip / knee / ankle in the sagittal plane: with the shins' lean and the ankle they decide which edge the board
  // stands on (toes down on the toe edge, toes up on the heel edge); the floor puts that edge on the snow
  const sb = (tilt, hip, knee, ankle, sp, f) => (sk => { const s = signs(sk); return make(p => {
    p.root.rot = [tilt, 0, 0]; both(p, 'leg', { flex: hip, knee, ankle, abd: 6, rot: 0 }); p.spine.flex = sp; p.spine.twist = -s.twist * 18; p.neck.yaw = s.neck * 65; p.neck.flex = -sp * 0.5 - tilt * 0.4;
    Object.assign(p.arm_L, { elev: 42, plane: 5, elbow: 22, pron: 30, grip: 0.4, thumb: 0.3 }); Object.assign(p.arm_R, { elev: 34, plane: 35, elbow: 34, pron: 30, grip: 0.4, thumb: 0.3 }); if (f) f(p, s);
    // (review adjust3: the eye line tipped 42-44 deg with the body on both edges) a rider keeps the eyes nearer level: the neck bends against the lean
    if (p.root.rot[0] > 0) p.neck.lat = Math.max(-35, Math.min(35, 0.8 * p.root.rot[0])); }); });   // (heel side: its own key sets the head, measured on the eye line)
  // the board's edge angle is tilt - hip + knee + ankle (deg, + = on the toe edge), so each key sets it on purpose
  // (Steep and real riders: knees 70-90 deg, hips low, hands near the knees; on edge the whole body inclines 35-45 deg toward the snow, over the toes on
  // the toe edge, sitting back over the heels on the heel edge)
  // front (left) and rear leg differ on edge (Delorme 2004, on snow): toe side the rear ankle bends about 12 deg more; heel side the front ankle is near
  // neutral and the rear a little bent. Knees 40-65, hips 30-75 (Delorme, Park 2015): a rider is far less folded than a squat.
  const legs = (p, fr, rr) => { Object.assign(p.leg_L, fr); Object.assign(p.leg_R, rr); };
  const SB = { ride: sb(6, 40, 60, -24, 16, p => { legs(p, { knee: 60, ankle: -24 }, { knee: 64, ankle: -28 }); Object.assign(p.arm_L, { elev: 40, plane: 10, elbow: 25 }); Object.assign(p.arm_R, { elev: 35, plane: 0, elbow: 20 }); }),
    // toe edge: knees driven into the slope, chest over the front knee, hands at knee height (Steep b_0049, b_0137)
    toe: sb(44, 42, 85, -22, 16, p => { legs(p, { knee: 85, ankle: -22 }, { knee: 89, ankle: -34 }); Object.assign(p.arm_L, { elev: 28, plane: 75, elbow: 50 }); Object.assign(p.arm_R, { elev: 26, plane: 70, elbow: 50 }); p.neck.flex = -20; }),
    // heel edge: the whole body inclines back toward the snow as one piece (hips 55-60, not a chair), the chest comes forward over the board
    heel: sb(-33, 56, 80, -20, 8, p => { both(p, 'leg', { abd: 4, rot: 3 }); legs(p, { knee: 80, ankle: -33 }, { knee: 83, ankle: -35 }); Object.assign(p.arm_L, { elev: 50, plane: 70, elbow: 60 }); Object.assign(p.arm_R, { elev: 42, plane: 62, elbow: 40 }); p.neck.flex = 20; p.neck.lat = -16; }),   // (reviews adjust3/4: hips 70 / knees 88 read as a chair with the eyes on the sky; one inclined line, hips 56, knees 80, the gaze down the slope; adjust5: root -40 leaned 46 deg and read as falling, so -33)
    crouch: sb(20, 80, 88, -25, 16), // the ollie: the rear leg drives the tail down while the front knee lifts the nose
    pop: sb(10, 35, 40, -10, 4, p => { legs(p, { flex: 42, knee: 40, ankle: -12 }, { flex: 42, knee: 45, ankle: -22 }); p.arm_L.elev = 40; p.arm_R.elev = 35; }),
    grab: sb(4, 122, 128, -20, 10, p => { both(p, 'leg', { flex: 122, knee: 128, abd: 6, rot: -4 }); p.spine.flex = 22; Object.assign(p.arm_R, { elev: 42, plane: 78, elbow: 12, grip: 0.9, thumb: 0.8 }); Object.assign(p.arm_L, { elev: 70, plane: 10, elbow: 40 }); }),
    open: sb(14, 44, 48, -22, 10), land: sb(16, 76, 88, -26, 18) };
  const sbCache = new WeakMap();
  const sbOf = sk => { if (!sbCache.has(sk)) { const P = {}; for (const k in SB) P[k] = SB[k](sk);
    sbCache.set(sk, { P, turn: keys([[0, P.ride], [0.42, P.toe], [1.18, Human.lerpPose(P.toe, P.crouch, 0.25)], [1.62, P.ride], [2.05, P.heel], [2.6, Human.lerpPose(P.heel, P.crouch, 0.2)], [3.0, P.ride]]),   // the rider sinks a little through each edge instead of freezing   // toe side lasts about 1.25x heel side (Delorme)
      jump: keys([[0, P.ride], [0.3, P.ride], [0.6, P.crouch], [0.82, P.pop], [1.2, P.grab], [1.45, P.grab], [1.65, P.open], [1.9, P.land], [2.2, Human.lerpPose(P.land, P.ride, 0.25)], [2.7, P.ride], [3.0, P.ride]]) }); } return sbCache.get(sk); };
  // the board turns on its edges: toe edge at 0.25, heel edge at 0.75 (the same key at both ends, so it loops)
  // the front leg leads each edge change by about 0.17 s (Delorme 2004): the rear knee and ankle are read that much later (the whole rear leg read late could not reach its binding from the new pelvis) in the turn
  const sbTurn = (u, sk) => { const t = u * 3.0, K = sbOf(sk), p = K.turn(t), q = K.turn(((t - 0.17) % 3 + 3) % 3); for (const k of ['knee', 'ankle']) p.leg_R[k] = q.leg_R[k]; return { pose: p }; };
  const sbJump = (u, sk) => { const t = u * 3.0; return { pose: sbOf(sk).jump(t), lift: flight(t, 0.8, 1.7), reach: { hand: 'R', w: Human.smooth(0.95, 1.2, t) * (1 - Human.smooth(1.45, 1.62, t)) } }; };
  // riding straight is never still: the rider sinks and rises a little and shifts between the feet
  const sbRide = (u, sk) => { const P = sbOf(sk).P, p = Human.lerpPose(Human.lerpPose(P.ride, P.land, 0.15 - 0.15 * Math.cos(2 * Math.PI * u)), P.crouch, 0.1 + 0.08 * Math.sin(4 * Math.PI * u)); return { pose: p }; };

  // Tricks are started on the ground (Yeadon 1993): for a spin the shoulders wind up against the turn in the last 0.2 s before take-off and then lead it,
  // with the head looking ahead into the rotation; for a backflip the arms throw up and back, the knees tuck to about 120 at the top and open again
  // 0.2 s before landing. `t0` take-off, `t1` landing (s).
  const trick = (base, kind, t0, t1) => (u, sk) => { const dur = kind.dur, t = u * dur, r = base(u, sk), s = signs(sk), p = r.pose;
    const lerp = (a, b, w) => a + (b - a) * w, wind = Human.smooth(t0 - 0.25, t0 - 0.05, t) * (1 - Human.smooth(t0 - 0.05, t0 + 0.1, t)), air = Human.smooth(t0 - 0.05, t0 + 0.15, t) * (1 - Human.smooth(t1 - 0.3, t1 - 0.1, t));
    if (kind.spin) { p.spine.twist = lerp(p.spine.twist, -s.twist * 35, wind); p.spine.twist = lerp(p.spine.twist, s.twist * 20, air);
      p.neck.yaw = lerp(p.neck.yaw, s.neck * 50, air); p.neck.flex = lerp(p.neck.flex, -25, air);
      // the arms wrap: the leading arm reaches across the chest, the trailing arm pulls in
      const gr = r.reach && r.reach.hand === 'R';   // a grabbing hand stays on the board
      if (!gr) { p.arm_R.elev = lerp(p.arm_R.elev, 75, air); p.arm_R.plane = lerp(p.arm_R.plane, 100, air); p.arm_R.elbow = lerp(p.arm_R.elbow, 60, air); }
      p.arm_L.elev = lerp(p.arm_L.elev, gr ? 75 : 70, air); p.arm_L.plane = lerp(p.arm_L.plane, gr ? 90 : 60, air); p.arm_L.elbow = lerp(p.arm_L.elbow, gr ? 45 : 90, air);
      // the body is never frozen in a long air: it pulls in to spin faster in the middle and opens toward the landing
      const mid = Math.sin(Math.PI * Human.smooth(t0 + 0.1, t1 - 0.25, t)); for (const sd of ['L', 'R']) { p['leg_' + sd].flex = Math.min(gr ? 125 : 85, p['leg_' + sd].flex); p['leg_' + sd].knee = Math.min(gr ? 130 : 85, p['leg_' + sd].knee); if (!gr) p['arm_' + sd].elbow += 15 * mid; }
      p.spine.flex -= (gr ? 10 : 20) * mid; p.root.rot[0] = Math.min(p.root.rot[0], lerp(p.root.rot[0], 15, air)); if (!gr) p.arm_R.plane = Math.min(p.arm_R.plane + 25 * mid, 130); p.arm_L.elev = Math.min(p.arm_L.elev, lerp(p.arm_L.elev, 50, air)); p.neck.yaw += s.neck * 15 * mid; }
    if (kind.flip) { const top = Human.smooth(t0 + 0.05, t0 + 0.1 + 0.35 * (t1 - t0), t) * (1 - Human.smooth((t0 + t1) / 2 + 0.1, t1 - 0.35, t)), throwUp = Human.smooth(t0 - 0.25, t0 + 0.05, t) * (1 - Human.smooth(t0 + 0.15, t0 + 0.4, t));
      for (const sd of ['L', 'R']) { const A = p['arm_' + sd], Lg = p['leg_' + sd];
        A.elev = lerp(A.elev, 120, throwUp); A.plane = lerp(A.plane, 90, throwUp); A.elbow = lerp(A.elbow, 40, throwUp);
        A.elev = lerp(A.elev, 90, top); A.plane = lerp(A.plane, 20, top); A.elbow = lerp(A.elbow, 25, top);
        Lg.flex = lerp(Lg.flex, 35, throwUp); Lg.knee = lerp(Lg.knee, 40, throwUp); Lg.flex = lerp(Lg.flex, 120, top); Lg.knee = lerp(Lg.knee, 120, top); }
      p.neck.flex = lerp(p.neck.flex, -35, throwUp + top * 0.5); p.spine.flex = lerp(p.spine.flex, 30, top); }
    return r; };

  // clip time -> key time for a stretched flight: before take-off t0 unchanged, the air t0..t1 mapped onto the keys' air t0..k1, after shifted
  const airT = (t, t0, t1, k1) => t < t0 ? t : t < t1 ? t0 + (t - t0) * (k1 - t0) / (t1 - t0) : t - (t1 - k1);
  const CLIPS = [
    { name: 'walk', zh: '走路', group: 'daily', dur: 1.1, at: gait(GAIT.walk, false) },
    { name: 'run', zh: '跑步', group: 'daily', dur: 0.72, at: gait(GAIT.run, true) },
    { name: 'jump', zh: '原地跳', group: 'daily', dur: 3.2, at: u => { const t = u * 3.2; return { pose: jumpK(t), lift: flight(t, 1.06, 1.62) }; } },
    { name: 'squatrep', zh: '深蹲起', group: 'daily', dur: 3.6, at: u => ({ pose: squatK(u * 3.6) }) },
    { name: 'carve', zh: '刻滑转弯（真人数据）', group: 'ski', dur: 3.2, at: carve },
    { name: 'tuckhold', zh: '团身滑行', group: 'ski', dur: 3.0, at: tuck },
    { name: 'moguls', zh: '蘑菇吸收', group: 'ski', dur: 1.2, at: moguls },   // two bumps per cycle, 0.6 s each
    { name: 'skijump', zh: '起跳团身', group: 'ski', dur: 3.0, at: u => { const t = u * 3.0; return { pose: skiJumpK(t), lift: flight(t, 0.8, 1.6) }; } },
    { name: 'spread', zh: '空中大鹏展翅', group: 'ski', dur: 3.0, at: u => { const t = u * 3.0; return { pose: spreadK(t), lift: flight(t, 0.8, 1.6), free: Human.smooth(0.9, 1.05, t) * (1 - Human.smooth(1.4, 1.55, t)) > 0.5 }; } },
    { name: 'sbride', zh: '单板直滑', group: 'board', dur: 2.4, at: sbRide },
    { name: 'sbturn', zh: '单板前刃 / 后刃', group: 'board', dur: 3.0, at: sbTurn },
    // big-kicker tricks: 1.5-1.6 s in the air as on Steep's jumps; the jump's own take-off and landing keys are kept and its air keys stretched (airT)
    { name: 'skispin', zh: '双板 360', group: 'ski', dur: 3.8, at: trick(u => { const t = u * 3.8; return { pose: skiJumpK(airT(t, 0.8, 2.3, 1.6)), lift: flight(t, 0.8, 2.3), spin: 360 * Human.smooth(0.8, 2.1, t) }; }, { dur: 3.8, spin: 1 }, 0.8, 2.3) },
    { name: 'skiflip', zh: '双板后空翻', group: 'ski', dur: 3.9, at: trick(u => { const t = u * 3.9; return { pose: skiJumpK(airT(t, 0.8, 2.4, 1.6)), lift: flight(t, 0.8, 2.4), flip: -360 * Human.smooth(0.82, 2.0, t) }; }, { dur: 3.9, flip: 1 }, 0.8, 2.4) },
    { name: 'skislash', zh: '双板粉雪甩尾', group: 'ski', dur: 2.4, at: slash },
    { name: 'sbjump', zh: '单板起跳抓板', group: 'board', dur: 3.0, at: sbJump },
  ];

  // ---- the feet on the floor: the lowest of heel, ball and toe tip of both feet sits where the rest pose's lowest one sits
  const CONTACT = [['foot', [0, -42, -42]], ['midfoot', [-16, -28, 89]], ['toe_hallux', [0, -12, 60]]];   // mm from the joint, left side
  function contacts(sk, xf) {
    const k = sk.M.S / 1756 / 1000, I = sk.idx, out = [];
    for (const s of ['L', 'R']) for (const [b, o] of CONTACT) { const bi = I[b + '_' + s], J = sk.bones[bi].J;
      out.push(Human.Skeleton.apply(xf, sk, bi, [J[0] + (s === 'R' ? -o[0] : o[0]) * k, J[1] + o[1] * k, J[2] + o[2] * k])); }
    return out;
  }
  // what is under the feet, as boxes (centre c, long axis ax, normal n, side, length L, width W, thickness T): two skis or one snowboard
  function gear(sk, xf, kind) {
    const c = contacts(sk, xf), I = sk.idx, Q = Human.q, soles = [['L', 0], ['R', 3]].map(([s, o]) => {
      const mid = V.lerp(c[o], c[o + 1], 0.5), fwd = V.norm(V.sub(c[o + 1], c[o])); let up = Q.rot(xf.R[I['foot_' + s]], [0, 1, 0]); up = V.norm(V.sub(up, V.mul(fwd, V.dot(up, fwd)))); return { mid, fwd, up }; });
    const box = (cen, ax, n, L, W) => ({ c: V.sub(cen, V.mul(n, 0.009)), ax, n, side: V.cross(n, ax), L, W, T: 0.014 });
    if (kind === 'ski') return soles.map(f => box(V.add(f.mid, V.mul(f.fwd, 0.1)), f.fwd, f.up, 1.62, 0.09));
    // one-foot skating: the board hangs on the front foot alone, square across it (turned by the duck angle), the binding half a stance
    // toward the nose from the board's middle
    if (kind === 'board' && xf.anat && xf.anat.unbind > 0.5) { const f = soles[0], lf = Q.rot(xf.R[I.pelvis], [1, 0, 0]); let pp = V.norm(V.cross(f.up, f.fwd)); if (V.dot(pp, lf) < 0) pp = V.mul(pp, -1);
      const duck = (xf.anat.unbind > 0.5 ? UDUCK : 14) * D, ax = V.norm(V.add(V.mul(pp, Math.cos(duck)), V.mul(f.fwd, Math.sin(duck)))), half = 0.27 * sk.M.S / 1756;
      return [box(V.sub(f.mid, V.mul(ax, half)), ax, f.up, 1.5, 0.27)]; }
    if (kind === 'board') { const ax = V.norm(V.sub(soles[0].mid, soles[1].mid)); let n = V.add(soles[0].up, soles[1].up); n = V.norm(V.sub(n, V.mul(ax, V.dot(n, ax))));
      return [box(V.lerp(soles[0].mid, soles[1].mid, 0.5), ax, n, 1.5, 0.27)]; }
    return [];
  }
  // ski poles: a shaft through each closed fist (thumb side up, out of the little-finger side), 0.68 x stature long (the usual sizing rule); drawn only,
  // never part of the grounding
  function poles(sk, xf) {
    const I = sk.idx, L = 0.68 * sk.M.S / 1000, base = Math.min(...gearPts(gear(sk, xf, 'ski')).map(p => p[1])), fl = floor0.has(sk) ? floor0.get(sk) : base;
    return ['L', 'R'].map(s => { const bi = I['hand_' + s], g = Human.Skeleton.apply(xf, sk, bi, V.add(sk.bones[I['fingers_mcp_' + s]].J, [0, -0.01, 0]).map((v, i, a) => (v + sk.bones[bi].J[i]) / 2));
      // a loose grip lets the shaft hang: it follows the hand partly and trails down, back and a little outside the skis (it never crosses the body)
      // (`out` is the pole's own side, fixed: taken from which side of the pelvis the fist was, it flipped when an inside hand crossed over the
      // pelvis in a low, leaning turn, and the shaft jumped 40 deg in one frame)
      const h = Human.q.rot(xf.R[bi], [0, 0, -1]), out = s === 'L' ? 1 : -1;
      // held: in the air and in a tuck the fist holds the shaft rigid along its own line (Steep f_0401); otherwise it trails loosely
      const tr = V.norm(V.sub(xf.P[I.neck_lo], xf.P[I.pelvis])), hold = Math.max(Human.smooth(0.03, 0.1, base - fl), Human.smooth(0.7, 0.45, tr[1])), wh = 0.4 + 0.6 * hold;
      // (photos of skiers: a trailing shaft runs down and back close beside the leg, only a little out (5-10 deg), about 30 deg back; standing
      // still it is near upright, 10 deg back. It was 0.4 out: the poles stood out from the skier in an A, 27-46 deg)
      const rest = xf.anat && xf.anat.poleRest ? xf.anat.poleRest : 0;
      let ax = V.norm(V.add(V.mul(V.norm([0.15 * h[0], h[1], h[2]]), wh), V.mul(V.norm([(0.06 - 0.04 * rest) * out * (1 - hold), -1, -0.55 + 0.37 * rest]), 1 - wh)));
      // in a tuck the shafts lie under the arms along the body, baskets behind (Steep s_0028)
      const tk = Human.smooth(0.7, 0.45, tr[1]); if (tk > 0) ax = V.norm(V.add(V.mul(ax, 1 - tk), V.mul(V.norm([0.05 * out, -0.3, -1]), tk)));
      // in the air a held shaft follows the fist only partly: it points down the body, out past the hip and back (Steep f_0401, f_0481), so it never
      // stands up, hangs under the skis or runs through a thigh, whatever the arms and the body's rotation do
      { const air = Human.smooth(0.03, 0.1, base - fl); if (air > 0) { const bx = Human.q.rot(xf.R[I.pelvis], [1, 0, 0]), bz = Human.q.rot(xf.R[I.pelvis], [0, 0, 1]), so = s === 'L' ? 1 : -1;
        const want = V.norm(V.add(V.add(V.mul(tr, -0.6), V.mul(bx, 0.5 * so)), V.mul(bz, -0.6))); ax = V.norm(V.add(V.mul(ax, 1 - 0.7 * air), V.mul(want, 0.7 * air))); } }
      // a held shaft never points up along the body (raised arms turn the fist's line to the sky): it trails down the body and back
      { const d = ax[0] * tr[0] + ax[1] * tr[1] + ax[2] * tr[2]; if (d > -0.35) { const back = V.norm(V.add(V.mul(tr, -0.6), [0.3 * out, 0, -0.75])), k = Math.min(1, (d + 0.35) / 0.8);
        ax = V.norm(V.add(V.mul(ax, 1 - k), V.mul(back, k))); } }
      const
        len = L - 0.06, minY = base + 0.02;
      // the tip stays above the snow, or above the soles of the skis in the air: the shaft swings back toward level instead of going through
      // a pole plant: the tip goes to the snow beside the front of the ski on its own side (pose.plant, set by the clip)
      const pw = xf.anat && xf.anat.plant ? xf.anat.plant[s === 'L' ? 0 : 1] : 0;
      if (pw > 0.001) { const sk0 = gear(sk, xf, 'ski')[s === 'L' ? 0 : 1], tip = V.add(V.add(sk0.c, V.mul(sk0.ax, xf.anat.plantAt != null ? xf.anat.plantAt : 0.65)), [0.22 * out, 0, 0]); tip[1] = fl + 0.005;
        // (never ahead of the fist: a tip aimed ahead of the hand points the shaft against its trailing line, and the blend of two near-opposite
        // lines spun the shaft through the side in one frame. A real touch lands under or just behind a hand that is reaching forward)
        { const fa = V.dot(V.sub(g, sk0.c), sk0.ax) - 0.05, ta = V.dot(V.sub(tip, sk0.c), sk0.ax); if (ta > fa) { const t2 = V.sub(tip, V.mul(sk0.ax, ta - fa)); tip[0] = t2[0]; tip[2] = t2[2]; } }
        ax =V.norm(V.add(V.mul(ax, 1 - pw), V.mul(V.norm(V.sub(tip, g)), pw))); }
      const lowY = minY - 0.025 * Human.smooth(0.3, 0.7, pw);   // a planted tip sinks a few mm into the snow
      // a low fist (the inside hand reaching down to the inside knee in a carve, Reilly McGlashan 2026-11-17 frames 16.25-17.75 s): the shaft
      // that would go under the snow trails BACK, its basket dragging in the snow behind the boot, a little outside (the photos), not swung
      // level out to the side (Mac shots 2026-11-17 23:00: the inside pole lay flat, pointing sideways off the skier like a stick)
      { const sub = lowY - (g[1] + ax[1] * len); if (sub > 0 && !(pw > 0.001)) { const gs = gear(sk, xf, 'ski'); if (gs.length === 2) { const own = gs[s === 'L' ? 0 : 1], oth = gs[s === 'L' ? 1 : 0];
        let ac = V.norm(V.cross([0, 1, 0], own.ax)); if (V.dot(ac, V.sub(own.c, oth.c)) < 0) ac = V.mul(ac, -1);
        const fw = V.norm([own.ax[0], 0, own.ax[2]]), bk = V.norm(V.add(V.mul(fw, -1), V.mul(ac, 0.3))), hz = Math.hypot(ax[0], ax[2]) || 1, k = Human.smooth(0, 0.25, sub / len);
        // (turned round by the angle, the short way: a blend of the two headings would pass through nothing when they are near opposite)
        const a0 = Math.atan2(ax[0], ax[2]), a1 = Math.atan2(bk[0], bk[2]); let da = a1 - a0; da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));
        const a = a0 + da * k; ax = V.norm([Math.sin(a) * hz, ax[1], Math.cos(a) * hz]); } } }
      if (g[1] + ax[1] * len < lowY) { const y = Math.max(-1, Math.min(0, (lowY - g[1]) / len)), hz = Math.hypot(ax[0], ax[2]) || 1, k = Math.sqrt(1 - y * y) / hz; ax = [ax[0] * k, y, ax[2] * k]; }
      // a shaft never runs between the legs or across its own ski (user 2026-11-17: "雪棍穿到两个腿之间…会自己把自己绊倒"): in a turn the body
      // leans in, so a shaft hanging down from the inside hand lands between the skis. Its tip is kept at least 18 cm outside its own ski's
      // line (measured square to the ski, on the side away from the other ski), the shaft turned out about the fist to get there
      { const gs = gear(sk, xf, 'ski'); if (gs.length === 2) { const own = gs[s === 'L' ? 0 : 1], oth = gs[s === 'L' ? 1 : 0];
        let ac = V.norm(V.cross([0, 1, 0], own.ax)); if (V.dot(ac, V.sub(own.c, oth.c)) < 0) ac = V.mul(ac, -1);
        const tip = V.add(g, V.mul(ax, L - 0.06)), lat = V.dot(V.sub(tip, own.c), ac);
        if (lat < 0.12) ax = V.norm(V.sub(V.add(tip, V.mul(ac, 0.12 - lat)), g));
        // (Mac shots 2026-11-17, front view: in a crossover the chest faces down the hill while the skis still point across, so a fist held in
        // front ends up over the other half of the body, and a shaft from it ran slanting across the front of its own shin to a tip that was
        // outside the ski: from the front the pole crossed the legs. Photos of skiers (giant slalom and carving, front and three-quarter): the
        // shaft runs from the fist down and out, the tip further out than the fist, the lower shaft clear of the shin. So the tip is kept at
        // least 4 cm further out than the fist, and the shaft at knee height 10 cm outside the knee, both square to the ski)
        const la = p => V.dot(V.sub(p, own.c), ac), kn = xf.P[I['shin_' + s]], t2 = V.add(g, V.mul(ax, L - 0.06)), lg = la(g);
        let need = lg + 0.04; const f = (g[1] - kn[1]) / Math.max(1e-3, g[1] - t2[1]);
        // (faded in as the fist rises over the knee, so the tip never jumps when the fist passes the knee's height)
        if (f > 0 && f <= 1) need = Math.max(need, need + (lg + (la(kn) + 0.08 - lg) / Math.max(f, 0.25) - need) * Human.smooth(0.05, 0.25, f));
        need = Math.min(need, 0.6); const lt = la(t2);
        // (and no further out than it must be: 8 cm past the fist at most, or the clearance above. From behind, photos of skiers show the
        // shafts near parallel to the body, a few degrees out; free to trail further out they stood in an A, user 2026-11-17 21:16)
        const cap = Math.max(need, lg + 0.08), tt = Math.min(Math.max(lt, need), cap);
        if (tt !== lt) ax = V.norm(V.sub(V.add(t2, V.mul(ac, tt - lt)), g));
        // standing still (pose.poleRest, from the game below walking pace): the tips rest lightly in the snow beside the boots and a little
        // behind the fists, the arms loose (owner 2026-11-17 21:30: "起步的时候就把雪杖轻轻的压在地上，扎在地上，放松…只有开始滑的时候你才会
        // 抬起来"). Where they land follows from the fist's height and the pole's length: as far out as the rules above put it, the rest behind
        if (rest > 0.001 && base - fl < 0.03) { const t4 = V.add(g, V.mul(ax, len)), a0 = la(t4) - lg, dy = g[1] - (fl - 0.01), hr = Math.sqrt(Math.max(0, len * len - dy * dy));
          const a = Math.max(-hr, Math.min(hr, a0)), bk = Math.sqrt(Math.max(0, hr * hr - a * a)), fw = V.norm([own.ax[0], 0, own.ax[2]]);
          const tp = [g[0] + ac[0] * a - fw[0] * bk, fl - 0.01, g[2] + ac[2] * a - fw[2] * bk];
          ax = V.norm(V.add(V.mul(ax, 1 - rest), V.mul(V.norm(V.sub(tp, g)), rest))); } } }
      const up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], side = V.norm(V.cross(up, ax)), n = V.cross(ax, side);
      return { c: V.add(g, V.mul(ax, L / 2 - 0.06)), ax, n, side, L, W: 0.018, T: 0.018, pole: true }; });
  }
  // where the gear can touch the snow: its edges near the feet (the tips flex away)
  const gearPts = B => { const out = []; for (const b of B) for (const a of [-0.3, 0.3]) for (const w of [-0.5, 0.5]) out.push(V.add(b.c, V.add(V.mul(b.ax, a * b.L), V.add(V.mul(b.side, w * b.W), V.mul(b.n, -b.T / 2))))); return out; };
  const floor0 = new WeakMap();
  function ground(sk, pose, lift, kind) {
    if (!floor0.has(sk)) floor0.set(sk, Math.min(...contacts(sk, Human.Skeleton.pose(sk, Human.restPose())).map(p => p[1])));
    const xf = Human.Skeleton.pose(sk, pose), lo = Math.min(...(kind ? gearPts(gear(sk, xf, kind)) : contacts(sk, xf)).map(p => p[1]));
    const p = JSON.parse(JSON.stringify(pose)); p.root.pos = [p.root.pos[0], p.root.pos[1] + floor0.get(sk) - lo + (lift || 0), p.root.pos[2]];
    return p;
  }
  // the clip's pose at time t (s), on the floor
  // ski clips solve both legs onto the skis, which is too slow per frame: the clip is solved once at 96 phases and read back by interpolation
  const baked = new WeakMap();
  // a skeleton's signature: its bone lengths to the millimetre
  const skSig = sk => { let h = 0; for (const b of sk.bones) for (const v of (b.J || [])) h = (h * 31 + Math.round(v * 1000)) | 0; return (h >>> 0).toString(36) + ':' + sk.n; };
  // prebaked frames: one array per channel (keys = 'arm_L.elev', 'root.pos0', ...), 96 values each
  function unpackFrames(ch, keys) { return Array.from({ length: 96 }, (_, i) => { const p = Human.restPose(); p.plant = [0, 0]; p.root.spin = 0; p.root.flip = 0;
    keys.forEach((k, j) => { const v = ch[j][i], parts = k.split('.');
      if (parts.length === 2) { const [a, c] = parts, mm = /^(.*?)(\d)$/.exec(c); if (mm && Array.isArray(p[a][mm[1]])) p[a][mm[1]][+mm[2]] = v; else p[a][c] = v; }
      else { const mm = /^(.*?)(\d)$/.exec(k); if (mm && Array.isArray(p[mm[1]])) p[mm[1]][+mm[2]] = v; else p[k] = v; } }); return p; }); }
  function smoothLoop(F, sig) {
    if (!(sig > 0)) return; const n = F.length, R = Math.ceil(sig * 3), w = []; for (let d = -R; d <= R; d++) w.push(Math.exp(-d * d / (2 * sig * sig)));
    const W = w.reduce((x, y) => x + y, 0), src = F.map(f => JSON.parse(JSON.stringify(f)));
    const mix = (trees, o) => { for (const k in o) { const v = o[k];
      if (typeof v === 'number') { let acc = 0; for (let d = 0; d < trees.length; d++) acc += w[d] * trees[d][k]; o[k] = acc / W; }
      else if (v && typeof v === 'object') mix(trees.map(t => t[k]), v); } };
    for (let i = 0; i < n; i++) { const trees = []; for (let d = -R; d <= R; d++) trees.push(src[((i + d) % n + n) % n]); mix(trees, F[i]); }
  }
  function bakedFrames(sk, clip) { sample(sk, clip, 0); return baked.get(sk)[clip.name]; }
  function sample(sk, clip, t) {
    if (!baked.has(sk)) baked.set(sk, {}); const B = baked.get(sk), N = 96;
    // a clip being tuned (Human.Turn): frames are solved as they are first needed, `clip.budget` per call (default 2), and until then the
    // nearest solved frame stands in, so a change shows at once and fills in while it plays
    if (clip.lazy) { const n = clip.frames || N; if (!B[clip.name] || B[clip.name].length !== n) B[clip.name] = new Array(n); const F = B[clip.name];
      const x = (((t / clip.dur) % 1 + 1) % 1) * n, i = Math.floor(x) % n, j = (i + 1) % n; let budget = clip.budget == null ? 2 : clip.budget;
      for (const k of [i, j]) if (!F[k] && budget-- > 0) F[k] = solve(sk, clip, clip.dur * k / n);
      const near = k => { for (let d = 0; d < n; d++) { const f = F[(k - d + n) % n] || F[(k + d) % n]; if (f) return f; } return null; };
      // once every frame is solved, the loop is smoothed once (a Gaussian of `clip.smooth` frames, default 1.5, round the loop): the per-frame
      // solvers (parallel skis, balance, bindings) each leave small kinks where their search lands a step apart, which the toes and the fingers
      // magnify into jolts. Zero-phase and over the whole loop, so nothing lags and nothing is left to swing
      if (!F.sm && (() => { for (let k = 0; k < n; k++) if (!F[k]) return false; return true; })()) { F.sm = true; smoothLoop(F, clip.smooth == null ? 1.5 : clip.smooth); }
      const a = F[i] || near(i), b = F[j] || a; if (!a) return solve(sk, clip, t);
      return Human.lerpPose(a, b, F[i] && F[j] ? x - Math.floor(x) : 0); }
    if (!B[clip.name]) { const P = Human.PREBAKED && Human.PREBAKED.sk[skSig(sk)];
      // solved ahead of time by tools/prebake.js for the default and reference skeletons: switching clips is then instant (a trick takes
      // seconds to solve: the skis' turn-out is searched on every frame)
      if (P && P[clip.name]) B[clip.name] = unpackFrames(P[clip.name], Human.PREBAKED.keys);
      else { const F = Array.from({ length: N }, (_, i) => solve(sk, clip, clip.dur * i / N));
        // (review adjust4: the ski balance switches on and off frame by frame, a nod of the back at each edge change) the back's and the neck's bend are
        // smoothed along the loop on skis (a Gaussian of 2.5 frames)
        if (clip.gear === 'ski') { const g = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map(d => [d, Math.exp(-d * d / 12.5)]), W = g.reduce((a, [, w]) => a + w, 0);
          for (const k of ['spine', 'neck']) { const v = F.map(f => f[k].flex); F.forEach((f, i) => { f[k].flex = g.reduce((a, [d, w]) => a + w * v[(i + d + N) % N], 0) / W; }); } }
        B[clip.name] = clip.gear ? F : plant(sk, clip, F); } }
    const x = (((t / clip.dur) % 1 + 1) % 1) * N, i = Math.floor(x) % N;
    return Human.lerpPose(B[clip.name][i], B[clip.name][(i + 1) % N], x - Math.floor(x));
  }
  // In the air the centre of mass flies on its arc: it runs from where it was at take-off to where it is at landing, plus the clip's lift.
  // Tucking the legs then raises the feet, not the body.
  const groundCom = new WeakMap();
  function solve(sk, clip, t) {
    const u = ((t / clip.dur) % 1 + 1) % 1, r = clip.at(u, sk);
    if (!(r.lift > 0)) return solve1(sk, clip, t);
    const dt = clip.dur / 192, lifted = x => clip.at(((x / clip.dur) % 1 + 1) % 1, sk).lift > 0;
    let ta = t, tb = t; while (lifted(ta) && t - ta < clip.dur) ta -= dt; while (lifted(tb) && tb - t < clip.dur) tb += dt;
    if (!groundCom.has(sk)) groundCom.set(sk, new Map()); const G = groundCom.get(sk), cg = x => { const k = clip.name + ':' + x.toFixed(4);
      if (!G.has(k)) G.set(k, com(sk, Human.Skeleton.pose(sk, solve1(sk, clip, x)))); return G.get(k); };
    // the centre of mass moves in a straight line across the floor and on the arc up and down: no steering in the air
    const ca = cg(ta), cb = cg(tb), g = solve1(sk, clip, t), c = com(sk, Human.Skeleton.pose(sk, g)), s = (t - ta) / (tb - ta);
    for (let i = 0; i < 3; i++) g.root.pos[i] += ca[i] + (cb[i] - ca[i]) * s + (i === 1 ? r.lift : 0) - c[i];
    // (nothing under the snow while airborne: the arc can dip a ski tip below the floor at touch-down, review adjust12 saw 4 cm)
    const xf = Human.Skeleton.pose(sk, g), lo = Math.min(...(clip.gear ? gearPts(gear(sk, xf, clip.gear)) : contacts(sk, xf)).map(p => p[1])) - floor0.get(sk);
    if (lo < 0) g.root.pos[1] -= lo;
    return g;
  }
  function solve1(sk, clip, t) {
    const u = ((t / clip.dur) % 1 + 1) % 1, r = clip.at(u, sk);
    // on skis the boots hold the feet flat to the skis and the skis lie level: the whole body is pitched by what the pose leaves over
    const level = (w = 1) => { for (let it = 0; it < 2; it++) { const c = contacts(sk, Human.Skeleton.pose(sk, r.pose));
      r.pose.root.rot[0] -= w * Math.atan2((c[0][1] - c[1][1] + c[3][1] - c[4][1]) / 2, Math.hypot(c[1][0] - c[0][0], c[1][2] - c[0][2])) / D; } };
    // (in the air the skis may pitch with the body: levelling them there tipped every air pose about 20 deg forward)
    if (clip.gear === 'ski') level(1 - Human.smooth(0.03, 0.4, r.lift || 0));
    if (clip.gear === 'ski' && !r.free) parallel(sk, r.pose, r.heading || 0, Human.smooth(0.03, 0.4, r.lift || 0), r.wedge || 0, r.wedgeEdge, r.edges ? [0, 0] : null);   // (set edges: flat skis first, the lean and the edges after)
    // (a wedge holds its knees, so the skis come out pitched: the body is levelled again over them, then the legs re-solved)
    if (clip.gear === 'ski' && r.wedge && !r.free) { level(1); parallel(sk, r.pose, r.heading || 0, 0, r.wedge, r.wedgeEdge); }
    // a lean the skis go on edge with (a slash): put on after the skis are solved, so the solver cannot stand the body back up
    let eS = null;   // (the set edges, kept for the pass after the balance)
    if (r.roll || r.edges) { r.pose.root.rot[2] += r.roll || 0;
      // (then the legs are solved again under the leaned body: the skis stay on the snow and level, review adjust7 saw them float 9-27 cm)
      // (review adjust13: also in the first and last moments of a flight, else the roll put on here tips the yawed skis' tips down at touch-down)
      const aw = Human.smooth(0.03, 0.4, r.lift || 0);
      if (clip.gear === 'ski' && !r.free && aw < 0.3) { const eT = gear(sk, Human.Skeleton.pose(sk, r.pose), 'ski').map(upEdge);
        if (r.edges) { for (let i = 0; i < 2; i++) eT[i] = r.edges[i] * D; eS = eT; }   // (set edges, uphill +, reached in two passes with the body levelled between)
        for (let k = 0; k < (r.edges ? 2 : 1); k++) { level(1 - aw); parallel(sk, r.pose, r.heading || 0, aw, r.wedge || 0, r.wedgeEdge, eT); } } }
    if (clip.gear === 'ski' && !r.free && !(r.lift > 0)) { skiBalance(sk, r.pose);
      // (review adjust13: the balance moves both shins by one amount; on skis set on edge across the hill the legs stand differently, so the downhill ski came off the snow: the legs are solved onto the skis once more, from the balanced angles)
      if (eS) parallel(sk, r.pose, r.heading || 0, 0, r.wedge || 0, r.wedgeEdge, eS); }
    if (r.spineCap !== undefined) r.pose.spine.flex = Math.min(r.pose.spine.flex, r.spineCap);   // (a clip's cap holds after the balance)
    // a board lies level along its length: the body rolls so both feet stand at one height before the bindings are solved (otherwise unequal
    // legs stand the board on a corner)
    if (clip.gear === 'board' && !(r.pose.unbind > 0.5)) { const dy = () => { const c = contacts(sk, Human.Skeleton.pose(sk, r.pose)), a = V.lerp(c[0], c[1], 0.5), b = V.lerp(c[3], c[4], 0.5); return [a[1] - b[1], Math.hypot(a[0] - b[0], a[2] - b[2])]; };
      for (let it = 0; it < 3; it++) { const [e, d] = dy(); if (Math.abs(e) < 0.002) break; const ang = Math.atan2(e, d) / D; r.pose.root.rot[2] += ang; if (Math.abs(dy()[0]) > Math.abs(e)) r.pose.root.rot[2] -= 2 * ang; } }
    if (clip.gear === 'board') bind(sk, r.pose, r.reach, r.skate);
    // rotations in the air are put on after the gear is solved (the solvers work in the body's own frame of travel): spin about the vertical,
    // flip about the side-to-side axis (+ = forward, - = backflip)
    // A turn happens about the centre of mass, which keeps flying on its arc: the body is placed as if upright, then turned and moved back so
    // its centre of mass is where it was. Whole turns are stored as their remainder, so a finished flip reads 0 again.
    const g = ground(sk, r.pose, r.lift, clip.gear);
    // a yaw-first root (root.yf) is written back as the usual x-y-z angles, so every stored pose means one thing (review adjust10: the prebake dropped the flag)
    if (g.root.yf) { const r0 = g.root.rot, q = Human.q.mul(Human.q.mul(Human.q.axis([0, 1, 0], r0[1] * D), Human.q.axis([1, 0, 0], r0[0] * D)), Human.q.axis([0, 0, 1], r0[2] * D));
      const c0 = Human.q.rot(q, [1, 0, 0]), c1 = Human.q.rot(q, [0, 1, 0]), c2 = Human.q.rot(q, [0, 0, 1]);
      g.root.rot = [Math.atan2(-c2[1], c2[2]) / D, Math.asin(Math.max(-1, Math.min(1, c2[0]))) / D, Math.atan2(-c1[0], c0[0]) / D]; delete g.root.yf; }
    if (!r.spin && !r.flip) return g;
    const c0 = com(sk, Human.Skeleton.pose(sk, g));
    g.root.spin = (r.spin || 0) % 360; g.root.flip = (r.flip || 0) % 360;
    const c1 = com(sk, Human.Skeleton.pose(sk, g)); for (let i = 0; i < 3; i++) g.root.pos[i] += c0[i] - c1[i];
    return g;
  }
  // (review adjust3: levelling the skis took the forward lean out of the pelvis, so skiers sat 15-30 cm behind their boots in every deep
  // pose.) On the snow a skier keeps the centre of mass over the middle of the feet (measured along the pelvis' own fore-aft, the plane the
  // shins and trunk move in; along the skis a slash's sideways lean would read as fore-aft): first the shins go forward in the boots (the ankle
  // closes, the knee bends as much: the thigh and the skis keep their angle, the hips come forward over the feet) and, half as much, the back bends
  // further forward (at the spine: the pelvis is yawed and rolled by now, where a pitch of the root would swing the
  // thighs and lift the skis). Only ever forward: a pose already over
  // its feet is left as written.
  function skiBalance(sk, p) { const S = Human.Skeleton, A = Human.ROM.leg.ankle[0] + 2, k0 = [p.leg_L.knee, p.leg_R.knee], a0 = [p.leg_L.ankle, p.leg_R.ankle];
    const ahead = () => { const xf = S.pose(sk, p), c = contacts(sk, xf), m = com(sk, xf), mid = [0, 2].map(j => (c[0][j] + c[1][j] + c[3][j] + c[4][j]) / 4);
      const f = Human.q.rot(xf.R[sk.idx.pelvis], [0, 0, 1]), fw = V.norm([f[0], 0, f[2]]); return (m[0] - mid[0]) * fw[0] + (m[2] - mid[1]) * fw[2]; };
    const shins = d => { ['L', 'R'].forEach((s, i) => { const L = p['leg_' + s], dd = Math.min(d, a0[i] - A); L.ankle = a0[i] - Math.max(0, dd); L.knee = k0[i] + Math.max(0, dd); }); };
    const sp0 = p.spine.flex, nf0 = p.neck.flex, trunk = a => { p.spine.flex = sp0 + a; p.neck.flex = nf0 - 0.6 * a; };   // (the head comes up as the back bends: the eyes stay ahead, review adjust5)
    // both together on one amount (the shins first, the back half as much, up to 30), so the balance does not switch from one to the other at
    // an edge change; and the pelvis no more than 8 cm behind the ankles
    const aft = () => { const xf = S.pose(sk, p), P = n => xf.P[sk.idx[n]], f = Human.q.rot(xf.R[sk.idx.pelvis], [0, 0, 1]), h = Math.hypot(f[0], f[2]) || 1;
      return (((P('talus_L')[0] + P('talus_R')[0]) / 2 - P('pelvis')[0]) * f[0] + ((P('talus_L')[2] + P('talus_R')[2]) / 2 - P('pelvis')[2]) * f[2]) / h; };
    const room = Math.max(0, Math.min(a0[0], a0[1]) - A), both = x => { shins(x); trunk(Math.min(30, 0.5 * x)); }, bad = x => ahead() < -0.01 || (x < room && aft() > 0.08);   // (the back cannot bring the pelvis forward: once the boots are closed only the centre of mass counts)
    if (!bad(0)) return; both(50); if (bad(50)) return; let lo = 0, hi = 50; for (let i = 0; i < 12; i++) { const md = (lo + hi) / 2; both(md); if (bad(md)) lo = md; else hi = md; } both(hi);
  }
  // two skis run side by side: same heading (+z), flat fore and aft, the same edge angle, the same height, half a stance each side of the middle.
  // Each leg's six joint angles are solved (damped least squares, inside the joint limits) to bring its ski there.
  // `wedge` (deg): a snowplough (`wedgeEdge`: deg, or [left, right] for a wedge turn's weighted outside ski), the tips together and the tails apart, each ski that much off the heading and on its inside edge
  // a ski's edge toward uphill (the lab's fall line is +z): its base tipped about its own length, + = the uphill edge bites
  const upEdge = b => { let u = V.norm(V.cross([0, 1, 0], b.ax)); if (u[2] > 0) u = V.mul(u, -1); return Math.asin(Math.max(-1, Math.min(1, V.dot(b.n, u)))); };
  const UDUCK = 42;   // the front binding of a one-foot skate: the board turned this much off the foot (deg), so the hips can face the nose with the hip near the middle of its turn
  const WS = -1;   // which way an inside edge tips the ski's normal for the left ski (checked on the skeleton)
  function parallel(sk, pose, hd = 0, air = 0, wedge = 0, wedgeEdge = 8, edgeT = null) {   // (`edgeT`: [left, right] edge in rad, held as given)
    const read = () => gear(sk, Human.Skeleton.pose(sk, pose), 'ski');
    const wq = wedge && Array.isArray(wedgeEdge) && !edgeT, inEdge = (b, i) => { const o = read()[1 - i]; let u = V.norm(V.cross([0, 1, 0], b.ax)); if (V.dot(u, V.sub(o.c, b.c)) < 0) u = V.mul(u, -1); return Math.asin(Math.max(-1, Math.min(1, V.dot(b.n, u)))); };
    // (a ski boot does not let the ankle point the toes: plantarflexion stops at -5; the keys themselves hold the shins forward)
    const KS = ['flex', 'abd', 'rot', 'knee', 'ankle', 'inv'], R = Object.assign({}, Human.ROM.leg, { ankle: [Human.ROM.leg.ankle[0], -5], inv: [-12, 12] }), cl = (k, v) => Math.max(R[k][0], Math.min(R[k][1], v));
    // the pelvis first turns to face between the two skis, so neither hip has to do it all
    const yaw = g => (Math.atan2(g[0].ax[0], g[0].ax[2]) + Math.atan2(g[1].ax[0], g[1].ax[2])) / 2 / D - hd;
    // (not in the air: a deep tuck points the skis almost straight up or down, where their heading means nothing)
    // (pose.pelvisYaw: the pelvis is set to that share of the heading, on the snow and in the air alike, and the hips turn the skis the rest: review adjust11)
    const pk = pose.pelvisYaw; if (pk !== undefined) pose.root.rot[1] = pk * hd + (pose.yawFix || 0);
    for (let it = 0; it < 3 && air < 0.3 && pk === undefined; it++) { const m = yaw(read()); if (Math.abs(m) < 0.05) break;
      pose.root.rot[1] += 1; const d = yaw(read()) - m; pose.root.rot[1] -= 1; if (Math.abs(d) > 0.2) pose.root.rot[1] -= m / d; }
    // the stance is measured across the skis (square to their heading), so skis turned across the hill stay side by side instead of staggered
    const g0 = read(), sd = [Math.cos(hd * D), 0, -Math.sin(hd * D)], cx = (g0[0].c[0] + g0[1].c[0]) / 2, cz = (g0[0].c[2] + g0[1].c[2]) / 2, y = (g0[0].c[1] + g0[1].c[1]) / 2,
      half = Math.max((g0[0].c[0] - g0[1].c[0]) * sd[0] + (g0[0].c[2] - g0[1].c[2]) * sd[2], wedge ? 0.14 + 1.5 * Math.sin(wedge / 2 * D) : 0.24) / 2;   // (a wedge: the tips about 10 cm apart)
    const e = (Math.atan2(g0[0].n[0], g0[0].n[1]) + Math.atan2(g0[1].n[0], g0[1].n[1])) / 2, PW = 5, fw = [Math.sin(hd * D), 0, Math.cos(hd * D)];
    // each ski keeps its own lead along the heading (the inside ski a little ahead) and is put half a stance across from the middle
    const tgt = g0.map((b, i) => { const hs = i ? -half : half, al = (b.c[0] - cx) * fw[0] + (b.c[2] - cz) * fw[2]; return [cx + sd[0] * hs + fw[0] * al, cz + sd[2] * hs + fw[2] * al]; });
    // two passes: a hip that cannot turn its ski far enough (deep knees, boot limits) gets help from the pelvis turning a little more
    for (let pass = 0; pass < 2; pass++) {
    if (pass) { const g1 = read(), m = yaw(g1); if (pk === undefined) { if (Math.abs(m) < 0.5 || air >= 0.3) break; pose.root.rot[1] -= m * 1.6; } }
    for (const [i, s] of [[0, 'L'], [1, 'R']]) { const L = pose['leg_' + s], tx = tgt[i][0], tz = tgt[i][1], hi = hd + (i ? wedge : -wedge) / 2, ei = edgeT ? edgeT[i] : wedge ? (i ? -1 : 1) * (Array.isArray(wedgeEdge) ? wedgeEdge[i] : wedgeEdge) * D * WS : e;
      for (const k of KS) L[k] = cl(k, L[k]);
      // weak pulls toward the written ankle and knee: otherwise the solver opens the ankle in the boot and sits the body back
      const a0 = L.ankle, k0 = L.knee, i0 = L.inv;   // (in the air the skis may pitch with the feet: the boots keep the written ankle)
      const res = () => { const b = read()[i]; return [(Math.atan2(b.ax[0], b.ax[2]) - hi * D) * 8 * Math.min(1, 3 * Math.hypot(b.ax[0], b.ax[2])), b.ax[1] * (1 - 0.9 * Math.max(0, (air - 0.3) / 0.7)), wq ? (inEdge(b, i) - wedgeEdge[i] * D) * 3 : edgeT ? upEdge(b) - ei : Math.atan2(b.n[0], b.n[1]) - ei, (b.c[0] - tx) * PW, (b.c[1] - y) * PW, (b.c[2] - tz) * PW, (L.ankle - a0) * (0.006 + 0.03 * air), (L.inv - i0) * 0.03 * air, (L.knee - k0) * (wedge ? 0.012 : 0.004)]; };   // (a wedge: the written knee holds, the hips spread and turn in instead)
      for (let it = 0; it < 20; it++) { const f = res(); if (Math.hypot(...f) < 2e-3) break;
        const J = KS.map(k => { const h = L[k] + 1 > R[k][1] ? -1 : 1; L[k] += h; const d = res(); L[k] -= h; return d.map((v, j) => (v - f[j]) / h); });
        // (JtJ + lambda) d = -Jt f
        const A = KS.map((_, r) => KS.map((_, c) => J[r].reduce((a, v, j) => a + v * J[c][j], 0) + (r === c ? 2e-6 : 0))), g = KS.map((_, r) => -J[r].reduce((a, v, j) => a + v * f[j], 0));
        for (let c = 0; c < 6; c++) { let pv = c; for (let r = c + 1; r < 6; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r; [A[c], A[pv]] = [A[pv], A[c]]; [g[c], g[pv]] = [g[pv], g[c]];
          for (let r = c + 1; r < 6; r++) { const m = A[r][c] / A[c][c]; for (let q = c; q < 6; q++) A[r][q] -= m * A[c][q]; g[r] -= m * g[c]; } }
        const d = new Array(6); for (let r = 5; r >= 0; r--) { let v = g[r]; for (let q = r + 1; q < 6; q++) v -= A[r][q] * d[q]; d[r] = v / A[r][r]; }
        KS.forEach((k, j) => { L[k] = cl(k, L[k] + Math.max(-12, Math.min(12, d[j]))); }); } } }
  }
  // a snowboard holds both feet: each in its binding, a fixed half stance from the middle, at its duck angle, flat on the deck. The board is where
  // the written pose puts it; each leg's six angles are solved onto its binding. `reach` = { hand, w }: that hand takes hold of the board's nearer
  // edge between the feet (w 0..1 blends the arm from the written pose to the hold).
  // `skate` (one-foot skating, pose.unbind): { s: stroke along the board (m, + toward the nose), up: lift (m) } for the free rear foot
  function bind(sk, pose, reach, skate) {
    const P = Human.Skeleton.pose, I = sk.idx, Q = Human.q, PW = 8, KS = ['flex', 'abd', 'rot', 'knee', 'ankle', 'inv'];
    const sole = (xf, s, o) => { const c = contacts(sk, xf), fwd = V.norm(V.sub(c[o + 1], c[o])); let up = Q.rot(xf.R[I['foot_' + s]], [0, 1, 0]); return { mid: V.lerp(c[o], c[o + 1], 0.5), fwd, up: V.norm(V.sub(up, V.mul(fwd, V.dot(up, fwd)))) }; };
    const xf0 = P(sk, pose), b = gear(sk, xf0, 'board')[0], deck = V.add(b.c, V.mul(b.n, 0.009)), half = 0.27 * sk.M.S / 1756, duck = 14 * D;
    if (pose.unbind > 0.5) { // the front foot holds the board; the rear foot pushes on the snow on the toe side, pointing along the board
      // the front foot (and so the board) flat on the snow where the pose puts it
      { const L = pose.leg_L, s0 = sole(xf0, 'L', 0), m0 = s0.mid, g0 = s0.fwd, w1 = KS.map(q => L[q]); dls(L, KS, Human.ROM.leg, () => { const f = sole(P(sk, pose), 'L', 0); return [(f.mid[0] - m0[0]) * PW, (f.mid[1] - m0[1]) * PW, (f.mid[2] - m0[2]) * PW, f.up[0] * 4, f.up[2] * 4, f.fwd[1] * 4, f.fwd[0] * g0[2] - f.fwd[2] * g0[0], ...KS.map((q, n) => (L[q] - w1[n]) * 0.01)]; }, 30, 1e-5); }   // (the foot keeps the written heading: review adjust7 saw the board yaw 3-14 deg each stroke)
      const xf1 = P(sk, pose), b1 = gear(sk, xf1, 'board')[0];
      const toe = Math.sign(V.dot(sole(xf1, 'L', 0).fwd, b1.side)) || 1, sk2 = skate || { s: 0, up: 0 }, L = pose.leg_R, snow = V.sub(b1.c, V.mul(b1.n, b1.T / 2)), b = b1;
      const tm = V.add(snow, V.add(V.mul(b.side, toe * (b.W / 2 + 0.09)), V.add(V.mul(b.ax, -0.05 + sk2.s), V.mul(b.n, 0.012 + sk2.up))));
      for (const q of KS) L[q] = Math.max(Human.ROM.leg[q][0], Math.min(Human.ROM.leg[q][1], L[q]));
      // a weak pull toward every written angle: five residuals leave the six angles one free direction, along which the solve jumped between frames
      const w0 = KS.map(q => L[q]), ow = 0.5;
      dls(L, KS, Human.ROM.leg, () => { const f = sole(P(sk, pose), 'R', 3); return [(f.mid[0] - tm[0]) * PW, (f.mid[1] - tm[1]) * PW, (f.mid[2] - tm[2]) * PW, V.dot(f.fwd, b.side) * ow, V.dot(f.up, b.side) * 0.6 * ow, ...KS.map((q, n) => (L[q] - w0[n]) * 0.015)]; }, 30, 1e-5);
      return; }
    for (const [s, o, sg] of [['L', 0, 1], ['R', 3, -1]]) { const f0 = sole(xf0, s, o), e = Math.sign(V.dot(f0.mid, b.ax) - V.dot(deck, b.ax)) || sg;
      const tm = V.add(deck, V.mul(b.ax, e * half)), tf = V.norm(V.add(V.mul(b.side, Math.sign(V.dot(f0.fwd, b.side)) * Math.cos(duck)), V.mul(b.ax, e * Math.sin(duck)))), tr = V.cross(b.n, tf), L = pose['leg_' + s];
      for (const q of KS) L[q] = Math.max(Human.ROM.leg[q][0], Math.min(Human.ROM.leg[q][1], L[q]));
      // a weak pull toward the written knee: the six angles are otherwise free to trade a straight knee for a bent hip (the heel-side chair)
      const k0 = L.knee, ab0 = L.abd;
      dls(L, KS, Human.ROM.leg, () => { const f = sole(P(sk, pose), s, o); return [(f.mid[0] - tm[0]) * PW, (f.mid[1] - tm[1]) * PW, (f.mid[2] - tm[2]) * PW, V.dot(f.fwd, b.n), V.dot(f.fwd, b.ax) - V.dot(tf, b.ax), V.dot(f.up, tr), (L.knee - k0) * 0.004, (L.abd - ab0) * 0.012]; }, 12, 1e-5); }
    // the hold: the arm reaches, and the trunk bends and leans toward the board for what the arm cannot (as a rider folds to grab)
    if (reach && reach.w > 0.001) { const A = pose['arm_' + reach.hand], Sp = pose.spine, bi = I['fingers_mcp_' + reach.hand], grip = () => Human.Skeleton.apply(P(sk, pose), sk, bi, sk.bones[bi].J);
      const toe = Math.sign(V.dot(sole(P(sk, pose), 'L', 0).fwd, b.side)) || 1, h = V.sub(grip(), deck);
      const t = V.add(deck, V.add(V.mul(b.side, toe * b.W / 2), V.add(V.mul(b.ax, Math.max(-0.12, Math.min(0.12, V.dot(h, b.ax)))), V.mul(b.n, 0.015))));
      const KA = ['elev', 'plane', 'axial', 'elbow', 'sflex', 'slat'], RA = Object.assign({ sflex: [-10, 45], slat: [-15, 15] }, Human.ROM.arm);   // a grab is made mostly with the knees: the trunk bends 55 at most
      const L = { get sflex() { return Sp.flex; }, set sflex(v) { Sp.flex = v; }, get slat() { return Sp.lat; }, set slat(v) { Sp.lat = v; } };
      for (const q of KA.slice(0, 4)) Object.defineProperty(L, q, { get: () => A[q], set: v => { A[q] = v; } });
      const raw = KA.map(q => L[q]); dls(L, KA, RA, () => { const g = grip(); return [(g[0] - t[0]) * PW, (g[1] - t[1]) * PW, (g[2] - t[2]) * PW]; }, 16, 1e-5);
      KA.forEach((q, n) => { L[q] = raw[n] + (L[q] - raw[n]) * reach.w; }); }
  }
  // joint angles `KS` of one limb `L` (inside the limits `R`) moved until the residuals res() vanish: damped least squares on a numeric Jacobian
  function dls(L, KS, R, res, iters, damp) {
    const n = KS.length, cl = (k, v) => Math.max(R[k][0], Math.min(R[k][1], v));
    for (let it = 0; it < iters; it++) { const f = res(); if (Math.hypot(...f) < 1e-3) break;
      const J = KS.map(k => { const h = L[k] + 1 > R[k][1] ? -1 : 1; L[k] += h; const d = res(); L[k] -= h; return d.map((v, j) => (v - f[j]) / h); });
      const A = KS.map((_, r) => KS.map((_, c) => J[r].reduce((a, v, j) => a + v * J[c][j], 0) + (r === c ? (damp || 2e-6) : 0))), g = KS.map((_, r) => -J[r].reduce((a, v, j) => a + v * f[j], 0));
      for (let c = 0; c < n; c++) { let pv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r; [A[c], A[pv]] = [A[pv], A[c]]; [g[c], g[pv]] = [g[pv], g[c]];
        for (let r = c + 1; r < n; r++) { const m = A[r][c] / A[c][c]; for (let q = c; q < n; q++) A[r][q] -= m * A[c][q]; g[r] -= m * g[c]; } }
      const d = new Array(n); for (let r = n - 1; r >= 0; r--) { let v = g[r]; for (let q = r + 1; q < n; q++) v -= A[r][q] * d[q]; d[r] = v / A[r][r]; }
      KS.forEach((k, j) => { L[k] = cl(k, L[k] + Math.max(-10, Math.min(10, d[j]))); }); }
  }
  // centre of mass of the posed skeleton, from Dempster's segment masses and centre positions
  function com(sk, xf) {
    const I = sk.idx, J = n => Human.Skeleton.apply(xf, sk, I[n], sk.bones[I[n]].J), parts = [[0.497, V.lerp(J('pelvis'), J('thorax_hi'), 0.45)], [0.081, V.lerp(J('neck_hi'), J('head'), 1.6)]];
    for (const s of ['L', 'R']) parts.push([0.028, V.lerp(J('upperarm_' + s), J('forearm_' + s), 0.436)], [0.016, V.lerp(J('forearm_' + s), J('hand_' + s), 0.43)], [0.006, J('hand_' + s)],
      [0.1, V.lerp(J('thigh_' + s), J('shin_' + s), 0.433)], [0.0465, V.lerp(J('shin_' + s), J('talus_' + s), 0.433)], [0.0145, V.lerp(J('talus_' + s), J('midfoot_' + s), 0.5)]);
    const c = [0, 0, 0]; let m = 0; for (const [w, p] of parts) { m += w; for (let i = 0; i < 3; i++) c[i] += w * p[i]; } return c.map(v => v / m);
  }
  // feet on the floor stay where they landed. F = the clip's poses at even phases, each already set on the floor. A foot is planted while its heel
  // or ball is on the floor; from the step it lands, that point is held still (or, in walk and run, carried back by the floor at the belt speed).
  // The whole body is first shifted to meet the planted feet, then each planted leg's angles are solved for what is left. In clips that stand in
  // place the body is also shifted until the centre of mass is over the feet. After lift-off the leg eases back to the written pose (no spring).
  function plant(sk, clip, F) {
    const N = F.length, dt = clip.dur / N, fl = floor0.get(sk), R = Human.ROM.leg, KS = ['flex', 'abd', 'rot', 'knee', 'ankle'], PW = 8, P = Human.Skeleton.pose;
    const pts = F.map(p => contacts(sk, P(sk, p))), isGait = clip.name === 'walk' || clip.name === 'run' || !!clip.gait;
    const feet = [['L', 0], ['R', 3]].map(([s, o]) => ({ s, o, st: pts.map(c => Math.min(c[o][1], c[o + 1][1], c[o + 2][1]) - fl < 0.012), j: pts.map(c => [0, 1, 2].reduce((m, q) => c[o + q][1] < c[o + m][1] ? q : m, 0)), tg: new Array(N).fill(null), dir: new Array(N).fill(null) }));
    // walk and run: the floor's speed is what the heel and ball do while they are down; a foot that only skims the floor on its way forward is not planted
    let v = 0; if (isGait) { let n = 0; for (const f of feet) for (let k = 0; k < N; k++) { const k1 = (k + 1) % N, j = pts[k][f.o][1] <= pts[k][f.o + 1][1] ? 0 : 1;
        if (pts[k][f.o + j][1] - fl < 0.012 && pts[k1][f.o + j][1] - fl < 0.012) { v -= (pts[k1][f.o + j][2] - pts[k][f.o + j][2]) / dt; n++; } } v /= Math.max(1, n);
      for (const f of feet) f.st = f.st.map((x, k) => x && (pts[k][f.o + f.j[k]][2] - pts[(k + N - 1) % N][f.o + f.j[k]][2]) / dt < -0.4 * v); }
    for (const f of feet) { const all = f.st.every(x => x), starts = all ? [F.reduce((m, p, k) => p.root.pos[1] < F[m].root.pos[1] ? k : m, 0)] : f.st.map((x, k) => x && !f.st[(k + N - 1) % N] ? k : -1).filter(k => k >= 0);
      for (const a of starts) { let anc = null, jp = -1; // the foot rolls heel -> ball -> toe: when the lowest point changes, the new one is anchored where the
        // a planted foot also keeps the heading it landed with: the pelvis turns above it, the foot does not twist on the floor
        const hd0 = V.norm(V.sub(pts[a][f.o + 1], pts[a][f.o]));
        for (let m = 0; m < N && f.st[(a + m) % N]; m++) { const k = (a + m) % N, j = f.j[k]; f.dir[k] = hd0;   // held foot puts it, so the roll does not jump
          if (!anc) anc = [pts[a][f.o + j][0], pts[a][f.o + j][2]];
          else if (j !== jp) { const p = pts[k][f.o + j], q = pts[k][f.o + jp]; anc = [anc[0] + p[0] - q[0], anc[1] + p[2] - q[2]]; }
          jp = j; f.tg[k] = [anc[0], Math.max(fl, pts[k][f.o + j][1]), anc[1]]; anc = [anc[0], anc[1] - v * dt]; } } }
    const out = F.map(p => JSON.parse(JSON.stringify(p))), off = new Array(N).fill(null), delta = feet.map(() => new Array(N).fill(null));
    for (let k = 0; k < N; k++) { const pin = feet.filter(f => f.tg[k]); if (!pin.length) continue; const pose = out[k];
      const cur = f => contacts(sk, P(sk, pose))[f.o + f.j[k]], fwd0 = feet.map(f => V.norm(V.sub(pts[k][f.o + 1], pts[k][f.o])));
      const sh = [0, 0]; for (const f of pin) { const c = pts[k][f.o + f.j[k]]; sh[0] += (f.tg[k][0] - c[0]) / pin.length; sh[1] += (f.tg[k][2] - c[2]) / pin.length; }
      // walking and running, the pelvis does not slide sideways to meet a planted foot (that swayed the body 46 cm); the leg reaches it instead
      if (!isGait) pose.root.pos[0] += sh[0]; pose.root.pos[2] += sh[1];
      const legs = () => { for (const f of pin) { const L = pose['leg_' + f.s], i = feet.indexOf(f); for (const q of KS) L[q] = Math.max(R[q][0], Math.min(R[q][1], L[q]));
        dls(L, KS, R, () => { const c = contacts(sk, P(sk, pose)), p = c[f.o + f.j[k]], w = V.norm(V.sub(c[f.o + 1], c[f.o])), t = f.tg[k];
          return [(p[0] - t[0]) * PW, (p[1] - t[1]) * PW, (p[2] - t[2]) * PW, w[1] - fwd0[i][1], (w[0] - fwd0[i][0]) * (isGait ? 0.3 : 1)]; }, 8, 1e-4); } };
      // what the legs cannot reach in height, the whole body takes up; `miss` = the worst distance left between a planted point and its place
      const miss = () => { const c = contacts(sk, P(sk, pose)); return Math.max(...pin.map(f => V.len(V.sub(c[f.o + f.j[k]], f.tg[k])))); };
      const settle = () => { legs(); for (let it = 0; it < 2; it++) { const c = contacts(sk, P(sk, pose)); pose.root.pos[1] += pin.reduce((a, f) => a + f.tg[k][1] - c[f.o + f.j[k]][1], 0) / pin.length; legs(); } };
      settle();
      // standing in place on both feet: the centre of mass comes back over the feet
      // (by leaning the trunk from the hips, as a person does: shifting the hips instead would ask the ankles for more bend than they have)
      if (!isGait && pin.length === 2) { const err = () => { const c = contacts(sk, P(sk, pose)), g = com(sk, P(sk, pose));
          const z0 = Math.max(c[0][2], c[3][2]) + 0.05, z1 = Math.min(c[1][2], c[4][2]) - 0.01; return g[2] - Math.max(z0, Math.min(z1, g[2])); };
        // first the hips move over the feet (the shins lean, as far as the ankles bend with the foot still flat on its place) ...
        for (let it = 0; it < 4; it++) { const e = err(); if (Math.abs(e) < 0.004) break; const keep = JSON.stringify(pose), back = () => Object.assign(pose, JSON.parse(keep));
          let step = -e, ok = false; for (let tr = 0; tr < 3 && !ok; tr++, step /= 2) { pose.root.pos[2] += step; settle(); ok = miss() < 0.004 && Math.abs(err()) < Math.abs(e); if (!ok) back(); }
          if (!ok) break; }
        // ... then the trunk leans for what is left
        for (let it = 0; it < 5; it++) { const e = err(); if (Math.abs(e) < 0.004) break; const keep = JSON.stringify(pose), back = () => Object.assign(pose, JSON.parse(keep));
          pose.root.rot[0] += 2; settle(); const d = (err() - e) / 2; back(); if (Math.abs(d) < 1e-4) break;
          // a lean the planted legs cannot follow is halved, then given up
          let step = Math.max(-8, Math.min(8, -e / d)), ok = false; for (let tr = 0; tr < 3 && !ok; tr++, step /= 2) { pose.root.rot[0] += step; settle(); ok = miss() < 0.006 && Math.abs(err()) < Math.abs(e); if (!ok) back(); }
          if (!ok) break; } }
      off[k] = [pose.root.pos[0] - F[k].root.pos[0], pose.root.pos[2] - F[k].root.pos[2]];
      for (const f of pin) delta[feet.indexOf(f)][k] = KS.map(q => pose['leg_' + f.s][q] - F[k]['leg_' + f.s][q]); }
    // in the air: the body's shift runs straight from the last planted step to the next; a leg that has lifted off eases back over 10 steps
    if (off.some(x => x)) for (let k = 0; k < N; k++) if (!off[k]) { let a = 1, b = 1; while (!off[(k + N - a) % N]) a++; while (!off[(k + b) % N]) b++;
      const A = off[(k + N - a) % N], B = off[(k + b) % N], t = a / (a + b); out[k].root.pos[0] += A[0] + (B[0] - A[0]) * t; out[k].root.pos[2] += A[1] + (B[1] - A[1]) * t; }
    feet.forEach((f, i) => { for (let k = 0; k < N; k++) if (!delta[i][k]) { let a = 1; while (a <= 10 && !delta[i][(k + N - a) % N]) a++; if (a > 10) continue;
      const d = delta[i][(k + N - a) % N], w = 1 - Human.smooth(0, 1, a / 10); KS.forEach((q, n) => { out[k]['leg_' + f.s][q] += d[n] * w; }); } });
    return out;
  }
  CLIPS.push({ name: 'sb360', zh: '单板 360 抓板', group: 'board', dur: 3.6, at: trick((u, sk) => { const t = u * 3.6, r = sbJump(airT(t, 0.8, 2.3, 1.7) / 3.0, sk); r.lift = flight(t, 0.8, 2.3); r.spin = 360 * Human.smooth(0.8, 2.15, t); return r; }, { dur: 3.6, spin: 1 }, 0.8, 2.3) },
    { name: 'sbback', zh: '单板后空翻', group: 'board', dur: 3.9, at: trick((u, sk) => { const t = u * 3.9, r = sbJump(airT(t, 0.8, 2.4, 1.7) / 3.0, sk);
      r.lift = flight(t, 0.8, 2.4); r.flip = -360 * Human.smooth(0.82, 2.0, t); r.reach = null; return r; }, { dur: 3.9, flip: 1 }, 0.8, 2.4) });
  for (const c of CLIPS) c.gear = c.group === 'ski' ? 'ski' : c.group === 'board' ? 'board' : null;
  const forget = (sk, name) => { const B = baked.get(sk); if (B) delete B[name]; };
  Human.Motion = { CLIPS, sample, forget, signs, skSig, bakedFrames, ground, contacts, gear, fitCarve, cyc, keys, com, plant, parallel, bind, poles, SKI, sbOf, flight, skiJumpK, airT };
})();

// ---------------------------------------------------------------- Human: retarget joint positions (mocap, video pose) onto this skeleton
// Input: landmarks per frame from any skeleton, in metres, y up, the body facing +z (turn the data first): root (pelvis centre), hipL/R, kneeL/R,
// ankleL/R, ballL/R (base of the toes), shL/R, elbowL/R, wristL/R, neck (C7/T1), head (top of the head). Output: an anatomical pose
// (Human.restPose format) whose segments point where the source's do.
// Limbs take the source's directions as they are. Four directions do not: they depend on where each skeleton put its joints (pelvis "up",
// trunk, head, foot), so the source's are turned in the body's mid-plane by the difference between the two skeletons' neutral poses
// (offsets(): zero pose for pelvis, trunk and head; a flat foot for the foot).
// Solved in order down the tree (pelvis, spine, neck, each leg, each arm), each a small damped least squares on direction errors, started
// from the previous frame's answer. Joint limits are kept (the pose is clamped by Human.Skeleton.pose as always).
(() => {
  const V = Human.v3, D = Math.PI / 180, Y = [0, 1, 0];
  // our landmarks off a posed skeleton
  function landmarks(sk, xf) {
    const S = Human.Skeleton, I = sk.idx, J = n => S.apply(xf, sk, I[n], sk.bones[I[n]].J), k = sk.M.S / 1756 / 1000;
    const o = { root: J('pelvis'), neck: J('neck_lo'), head: S.apply(xf, sk, I.head, [0, 1735 * k, 5 * k]) };
    for (const s of ['L', 'R']) { const b = I['toe_hallux_' + s], j = sk.bones[b].J;
      Object.assign(o, { ['hip' + s]: J('thigh_' + s), ['knee' + s]: J('shin_' + s), ['ankle' + s]: J('talus_' + s), ['ball' + s]: J('toe_hallux_' + s),
        ['toe' + s]: S.apply(xf, sk, b, [j[0], j[1] - 0.004, j[2] + 55 * k]), ['sh' + s]: J('upperarm_' + s), ['elbow' + s]: J('forearm_' + s), ['wrist' + s]: J('hand_' + s) }); }
    return o;
  }
  const mid = (a, b) => V.lerp(a, b, 0.5);
  const sag = v => Math.atan2(v[2], v[1]);                      // a vector's angle in the mid-plane (from up toward forward)
  const pitch = v => Math.atan2(v[1], Math.hypot(v[0], v[2]));  // from horizontal, + up
  // the directions the solver matches (raw, before offsets)
  const dirs = L => { const mh = mid(L.hipL, L.hipR), o = { hipLine: V.norm(V.sub(L.hipL, L.hipR)), pelUp: V.norm(V.sub(L.root, mh)), trunk: V.norm(V.sub(mid(L.shL, L.shR), mh)),
      shLine: V.norm(V.sub(L.shL, L.shR)), head: V.norm(V.sub(L.head, L.neck)) };
    for (const s of ['L', 'R']) Object.assign(o, { ['thigh' + s]: V.norm(V.sub(L['knee' + s], L['hip' + s])), ['shank' + s]: V.norm(V.sub(L['ankle' + s], L['knee' + s])),
      ['foot' + s]: V.norm(V.sub(L['ball' + s], L['ankle' + s])), ['uarm' + s]: V.norm(V.sub(L['elbow' + s], L['sh' + s])), ['farm' + s]: V.norm(V.sub(L['wrist' + s], L['elbow' + s])) });
    return o; };
  // the mid-plane / pitch differences between the source's neutral and ours. srcZero: the source's zero-pose landmarks; srcFlat: the source foot's
  // pitch when it stands flat (radians)
  function offsets(sk, srcZero, srcFlat) {
    const a = dirs(srcZero), b = dirs(landmarks(sk, Human.Skeleton.pose(sk, Human.restPose())));
    return { pelUp: sag(b.pelUp) - sag(a.pelUp), trunk: sag(b.trunk) - sag(a.trunk), head: sag(b.head) - sag(a.head), foot: pitch(b.footL) - srcFlat };
  }
  // turn v about the axis ax (unit) by a (Rodrigues)
  const turn = (v, ax, a) => { const c = Math.cos(a), s = Math.sin(a), d = V.dot(ax, v), x = V.cross(ax, v); return [0, 1, 2].map(i => v[i] * c + x[i] * s + ax[i] * d * (1 - c)); };
  const repitch = (v, a) => { const h = V.norm([v[0], 0, v[2]]), p = pitch(v) + a; return V.norm([h[0] * Math.cos(p), Math.sin(p), h[2] * Math.cos(p)]); };
  // targets for one frame
  function targets(src, off) {
    const t = dirs(src), x = t.hipLine;
    t.pelUp = turn(t.pelUp, x, off.pelUp); t.trunk = turn(t.trunk, x, off.trunk); t.head = turn(t.head, V.norm(t.shLine), off.head);
    for (const s of ['L', 'R']) t['foot' + s] = repitch(t['foot' + s], off.foot);
    return t;
  }
  // damped least squares over named fields of the pose (numeric Jacobian, degrees)
  function dls(pose, fields, res, iters) {
    const get = f => f[0](pose)[f[1]], put = (f, v) => { f[0](pose)[f[1]] = v; };
    for (let it = 0; it < iters; it++) { const r0 = res(); if (Math.hypot(...r0) < 1e-4) break;
      const Jc = fields.map(f => { const v = get(f); put(f, v + 0.5); const r = res(); put(f, v); return r.map((x, i) => (x - r0[i]) / 0.5); });
      const n = fields.length, A = Jc.map((a, i) => Jc.map((b, j) => a.reduce((s, x, k) => s + x * b[k], 0) + (i === j ? 1e-4 : 0))), g = Jc.map(a => -a.reduce((s, x, k) => s + x * r0[k], 0));
      for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [g[c], g[p]] = [g[p], g[c]];
        for (let r = c + 1; r < n; r++) { const m = A[r][c] / A[c][c]; for (let q = c; q < n; q++) A[r][q] -= m * A[c][q]; g[r] -= m * g[c]; } }
      const d = new Array(n); for (let r = n - 1; r >= 0; r--) { let v = g[r]; for (let q = r + 1; q < n; q++) v -= A[r][q] * d[q]; d[r] = v / A[r][r]; }
      fields.forEach((f, j) => put(f, get(f) + Math.max(-15, Math.min(15, d[j])))); }
  }
  // limits applied while solving (so a target past a joint's range is met as far as the joint goes, not by wandering off)
  function clampAll(pose) { Human.clampPose(pose); }
  // one frame: src = landmarks (facing +z), off = offsets(), prev = the previous frame's pose (or null).
  // Each part is solved from the previous frame's answer and from a first guess read straight off the directions (and, for the arms, that guess
  // with the upper arm turned in or out); the best is kept, so one bad frame cannot trap the rest of a take in a wrong fold.
  function solve(sk, src, off, prev) {
    const T = targets(src, off), pose = prev ? JSON.parse(JSON.stringify(prev)) : Human.restPose();
    let cache = null; const cur = () => cache || (cache = dirs(landmarks(sk, Human.Skeleton.pose(sk, pose))));
    const err = keys => () => { cache = null; const c = cur(); return keys.flatMap(([k, w]) => V.sub(c[k], T[k]).map(x => x * w)); };
    const F = (part, k) => [p => p[part], k], ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, V.dot(a, b)))) / D;
    const best = (fields, res, iters, seeds) => { const get = () => fields.map(f => f[0](pose)[f[1]]), put = v => fields.forEach((f, i) => { f[0](pose)[f[1]] = v[i]; });
      let top = null; for (const sd of [get(), ...seeds]) { put(sd); dls(pose, fields, res, iters); const e = Math.hypot(...res()); if (!top || e < top[0] - 1e-6) top = [e, get()]; }
      put(top[1]); return top[0]; };
    // body frames from the targets: pelvis (hip line, pelvis up) and trunk (shoulder line, trunk)
    const fr = (x, up) => { const X = V.norm(x), Z = V.norm(V.cross(X, up)); return { x: X, y: V.cross(Z, X), z: Z }; };
    const pel = fr(T.hipLine, T.pelUp), tr = fr(T.shLine, T.trunk);
    pose.root.pos = [0, 0, 0];
    best([[p => p.root.rot, 0], [p => p.root.rot, 1], [p => p.root.rot, 2]], err([['hipLine', 1], ['pelUp', 1]]), 10, [[0, 0, 0]]);
    best([F('spine', 'flex'), F('spine', 'lat'), F('spine', 'twist')], err([['trunk', 1], ['shLine', 0.7]]), 10, [[0, 0, 0]]);
    best([F('neck', 'flex'), F('neck', 'lat')], err([['head', 1]]), 8, [[0, 0]]);
    for (const s of ['L', 'R']) { const sg = s === 'L' ? 1 : -1, th = T['thigh' + s], ua = T['uarm' + s];
      const g = [Math.atan2(V.dot(th, pel.z), -V.dot(th, pel.y)) / D, Math.asin(Math.max(-1, Math.min(1, sg * V.dot(th, pel.x)))) / D, 0, ang(th, T['shank' + s])];
      best(['flex', 'abd', 'rot', 'knee'].map(k => F('leg_' + s, k)), err([['thigh' + s, 1], ['shank' + s, 1]]), 10, [g]);
      best(['ankle', 'inv', 'rot'].map(k => F('leg_' + s, k)), err([['foot' + s, 1], ['shank' + s, 0.5]]), 8, [[0, 0, 0]]);
      const el = ang(ua, V.mul(tr.y, -1)), pl = Math.atan2(V.dot(ua, tr.z), sg * V.dot(ua, tr.x)) / D, eb = ang(ua, T['farm' + s]);
      best(['elev', 'plane', 'axial', 'elbow'].map(k => F('arm_' + s, k)), err([['uarm' + s, 1], ['farm' + s, 1]]), 10, [[el, pl, 0, eb], [el, pl, 45, eb], [el, pl, -45, eb]]);
    }
    clampAll(pose);
    // residual direction error (deg) per segment, for the record
    cache = null; const c = cur(); pose.err = {}; for (const k in T) pose.err[k] = ang(c[k], T[k]);
    return pose;
  }
  // a turn about y that brings `heading` (horizontal) to +z, applied to a landmark set
  function face(L, heading) { const a = Math.atan2(heading[0], heading[2]), c = Math.cos(-a), s = Math.sin(-a), o = {};
    for (const k in L) { const p = L[k]; o[k] = [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; } return o; }
  Human.Retarget = { landmarks, offsets, targets, solve, face, dirs, dls };
})();

// ---------------------------------------------------------------- Human: tricks driven by real motion capture
// A trick table (data/mocap/trick_*.json, from tools/mocap/bake_trick.js) holds, per frame of a real performance, the body's own pose with the
// whole-body rotation taken out, and that rotation as a curve (pitch: - = backward, from standing; yaw: + = to the left), the time counted
// from take-off.
// A clip plays it on the gear: the run-up and the landing as recorded (the rotation put back into the pelvis, so the gear solvers keep the
// skis or board on the snow), the air stretched onto the kicker's longer flight with the rotation put back about the centre of mass
// (Human.Motion's flip / spin). Only what the gear forbids is changed: a ski boot holds the ankle (no pointed toes, no rolled foot).
(() => {
  const M = Human.Motion, D = Math.PI / 180;
  const LEG = ['flex', 'abd', 'rot', 'knee', 'ankle', 'inv'], ARM = ['elev', 'plane', 'axial', 'elbow'];
  // one frame of the table at time x (s from take-off), linear between frames
  function at(T, x) {
    const F = T.frames, dt = 1 / T.fps, f0 = F[0].t, i = Math.max(0, Math.min(F.length - 2, Math.floor((x - f0) / dt))), w = Math.max(0, Math.min(1, (x - F[i].t) / dt)), a = F[i], b = F[i + 1];
    const l = (u, v) => u + (v - u) * w, lv = (u, v) => u.map((q, j) => l(q, v[j]));
    const o = { pitch: l(a.pitch, b.pitch), yaw: l(a.yaw, b.yaw), pose: {} };
    for (const k in a.pose) o.pose[k] = lv(a.pose[k], b.pose[k]);
    return o;
  }
  // video tables (v_*): HMR fits jitter frame to frame (knee spikes of 800 deg/s), so each pose channel gets a median of 5 then a Gaussian
  // (1.5 frames, more for a slow-motion recording, which is squeezed onto a 1.6 s air) once, before the table is stretched onto the kicker's air
  const smoothed = new Map();
  function table(name) { const T = Human.MOCAP.tricks[name]; if (!name.startsWith('v_')) return T; if (smoothed.has(name)) return smoothed.get(name);
    const F = T.frames, n = F.length, sg = Math.max(1.5, 1.5 * T.air / 1.6), R = Math.ceil(3 * sg), out = Object.assign({}, T, { frames: F.map(f => Object.assign({}, f, { pose: JSON.parse(JSON.stringify(f.pose)) })) });
    for (const k in F[0].pose) for (let j = 0; j < F[0].pose[k].length; j++) {
      const v = F.map(f => f.pose[k][j]), med = v.map((_, i) => { const w = []; for (let d = -2; d <= 2; d++) w.push(v[Math.max(0, Math.min(n - 1, i + d))]); return w.sort((x, y) => x - y)[2]; });
      med.forEach((_, i) => { let ws = 0, a = 0; for (let d = -R; d <= R; d++) { const g = Math.exp(-d * d / (2 * sg * sg)); ws += g; a += g * med[Math.max(0, Math.min(n - 1, i + d))]; } out.frames[i].pose[k][j] = a / ws; }); }
    smoothed.set(name, out); return out; }
  // table numbers -> an anatomical pose (hands and feet details from the rest pose)
  function pose(q) { const p = Human.restPose();
    p.root.rot = q.root.slice(); [p.spine.flex, p.spine.lat, p.spine.twist] = q.spine; [p.neck.flex, p.neck.lat, p.neck.yaw] = q.neck;
    for (const s of ['L', 'R']) { LEG.forEach((k, j) => { p['leg_' + s][k] = q['leg_' + s][j]; }); ARM.forEach((k, j) => { p['arm_' + s][k] = q['arm_' + s][j]; }); }
    return p; }
  // A kicker take-off is not a gymnast's standing take-off: the run-up, the pop and the landing are the gear's own (the ski jump keys, the
  // board's ollie), and the recording takes over in the air, where it is what makes the trick look real (when the body opens and folds, what
  // the arms do, how the turn speeds up and slows down). The recorded air (0..A s) is stretched onto the kicker's air (t0..t1), and its turn
  // scaled to a whole number of turns at touch-down, so the skis or board land along the slope.
  // skis side by side in the air: a little spread at most, then both legs turned in or out alike until the two skis point the same way
  function together(sk, p) {
    const r_in = p.leg_L.rot;   // (continuity: a flat valley has minima at -28 and +32; the pull to the written turn-out picks the same one each frame)
    const apart = (r, a) => { p.leg_L.rot = p.leg_R.rot = r; p.leg_L.abd = p.leg_R.abd = a; const g = M.gear(sk, Human.Skeleton.pose(sk, p), 'ski'), u = g[0].ax, v = g[1].ax;
      return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) + 0.0015 * Math.abs(r) + 0.004 * Math.abs(r - r_in) + 0.004 * Math.abs(a - 3); };
    // a coarse grid over turn-out (-40..40) and spread (-4..12), then a finer one around the best
    let best = [0, 3, Infinity];
    for (let r = -40; r <= 40; r += 8) for (let a = -4; a <= 12; a += 4) { const e = apart(r, a); if (e < best[2]) best = [r, a, e]; }
    const [r0, a0] = best;
    for (let r = r0 - 6; r <= r0 + 6; r += 2) for (let a = a0 - 3; a <= a0 + 3; a += 1.5) { const e = apart(r, a); if (e < best[2]) best = [r, a, e]; }
    apart(best[0], best[1]);
  }
  const SHAPE = 0.35;
  const E0 = 0.14;   // blend in and out of the recording around take-off and landing (s)
  // The turn made from the shape: in the air angular momentum is kept, so the turn rate goes as 1 / (moment of inertia about the turn axis):
  // a tuck spins up, opening slows it, and it never stops. The inertia is read off the posed skeleton's joints (the gear adds a fixed part).
  const inertia = new WeakMap();
  // segment masses (fraction of body mass, Dempster) put on the landmark that carries each segment's centre
  const MASS = { root: 0.142, neck: 0.216, head: 0.081, knee: 0.1, ankle: 0.0465, ball: 0.0145, elbow: 0.028, wrist: 0.016, toe: 0, hip: 0, sh: 0 };
  function physTurn(sk, tbl, kind, x) {
    if (!inertia.has(sk)) inertia.set(sk, {}); const C = inertia.get(sk), key = tbl + kind;
    if (!C[key]) { const T = table(tbl), A = T.air, N = 48, I = [];
      for (let i = 0; i <= N; i++) { const L = Human.Retarget.landmarks(sk, Human.Skeleton.pose(sk, pose(at(T, A * i / N).pose))), P = Object.values(L), c = [0, 1, 2].map(j => P.reduce((a, v) => a + v[j], 0) / P.length);
        // about the side axis (x) for a flip, the vertical (y) for a spin
        I.push(Object.entries(L).reduce((a, [n, v]) => { const d = [v[0] - c[0], v[1] - c[1], v[2] - c[2]]; return a + (MASS[n.replace(/[LR]$/, '')] || 0) * (kind === 'flip' ? d[1] * d[1] + d[2] * d[2] : d[0] * d[0] + d[2] * d[2]); }, 0)); }
      // the gear's own share (skis or board, about 4 kg, mostly near the feet) is small; and before touch-down a rider opens up to stop the
      // turn on the landing, which the last fifth of the air shows as a rate easing to about a third
      const g = I.reduce((a, v) => a + v, 0) / I.length * 0.08, F = [0], ease = i => 1 - 0.65 * Human.smooth(0.78, 1, i / N);
      for (let i = 1; i <= N; i++) F.push(F[i - 1] + 0.5 * (ease(i - 1) / (I[i - 1] + g) + ease(i) / (I[i] + g)));
      C[key] = { A, N, F: F.map(v => v / F[N]) }; }
    const { A, N, F } = C[key], f = Math.max(0, Math.min(N, x / A * N)), i = Math.min(N - 1, Math.floor(f)); return F[i] + (F[i + 1] - F[i]) * (f - i);
  }
  function clip(name, zh, tbl, kind, gear, dur, t0, t1, opt = {}) {
    const SH = opt.shape !== undefined ? opt.shape : SHAPE, E = opt.E || E0;
    return { name, zh, group: gear, gear, dur, mocap: true, at: (u, sk) => {
      const T = table(tbl), t = u * dur, A = T.air;
      // the gear's own jump: keys timed for a 0.8 s air, stretched like the hand-made tricks
      const own = gear === 'ski' ? M.skiJumpK(M.airT(t, t0, t1, 1.6)) : M.sbOf(sk).jump(M.airT(t, t0, t1, 1.7));
      const x = Math.max(0, Math.min(A, (t - t0) * A / (t1 - t0))), q = at(T, x), w = Human.smooth(t0 - 0.02, t0 + E, t) * (1 - Human.smooth(t1 - E, t1 + 0.02, t));
      const m = pose(q.pose);
      // HMR reads the spine about 15 deg more bent than it is (walking clips read 15-18 deg), and a rider tucks at the hips and knees, not by
      // curling the back: the spine is taken 15 deg straighter and capped at 40, the rest of the fold goes to the hips and knees
      if (opt.phys) { const sp = m.spine.flex - 15, ex = Math.max(0, sp - 40); m.spine.flex = Math.min(sp, 40);
        for (const s of ['L', 'R']) { m['leg_' + s].flex += ex; m['leg_' + s].knee += 0.8 * ex + (gear === 'ski' && kind === 'flip' ? 20 * Human.smooth(0.1, 0.3, x / A) * (1 - Human.smooth(0.7, 0.9, x / A)) : 0); } }
      // the gear ties the feet together: on skis both legs share their turn-out and spread (else the skis cross) and the bends stay close;
      // on a board the stance (pelvis sideways, the legs' spread and turn-out) is the board's own, the bends follow the recording
      const avg = (k, f) => { const a = m.leg_L[k], b = m.leg_R[k], c = (a + b) / 2; m.leg_L[k] = a + (c - a) * f; m.leg_R[k] = b + (c - b) * f; };
      if (gear === 'ski') { avg('rot', 1); avg('abd', 1); avg('inv', 1); avg('ankle', 1); avg('flex', 0.9); avg('knee', 0.9); m.leg_L.rot = m.leg_R.rot = m.leg_L.rot * 0.3;
        for (const s of ['L', 'R']) m['leg_' + s].flex = Math.min(m['leg_' + s].flex, 112); }   // (1.7 m skis in a gymnast's 130 deg tuck would hit the chest)
      else { m.root.rot = own.root.rot.slice(); for (const s of ['L', 'R']) for (const k of ['abd', 'rot', 'inv']) m['leg_' + s][k] = own['leg_' + s][k]; avg('flex', opt.phys ? 0.8 : 0.5); avg('knee', opt.phys ? 0.8 : 0.5); }
      // (review mocap1: a gymnast's floor tricks have the right timing but the wrong shapes for a kicker, arms overhead, a layout, straight legs;
      // so the recording drives the turn and only a third of the shape, the rest is the gear's own tucked air)
      if (opt.phys && kind === 'flip') { m.spine.twist *= 0.3; m.spine.lat *= 0.3; m.neck.yaw *= 0.3; m.neck.lat *= 0.3; m.root.rot[1] *= 0.3; m.root.rot[2] *= 0.3; }
      // before touch-down a rider opens up: over the last quarter of the air the back straightens (<= 30) and the arms come down (<= 80)
      if (opt.phys) { const o = Human.smooth(0.7, 0.92, x / A); m.spine.flex += (Math.min(m.spine.flex, 30) - m.spine.flex) * o;
        for (const s of ['L', 'R']) { const a = m['arm_' + s]; a.elev += (Math.min(a.elev, 80) - a.elev) * o; }
        // (review adjust2: the hand still rose over the head at touch-down) from 0.6 of the air the trunk straightens sideways and the arms
        // come round to the front; and riders keep the elbows bent in the air (a straight arm flung out read as a gymnast's)
        const o2 = Human.smooth(0.55, 0.8, x / A); m.spine.lat += (Math.max(-10, Math.min(10, m.spine.lat)) - m.spine.lat) * o2;
        for (const s of ['L', 'R']) { const a = m['arm_' + s]; a.plane += (Math.max(a.plane, 45) - a.plane) * o2; a.elbow = Math.max(a.elbow, 55); a.elev = Math.min(a.elev, 100); } }
      const p = Human.lerpPose(own, m, w * SH);
      // (review adjust3: the caps above were diluted by the blend, the hand stayed 18-20 cm over the shoulder and then dropped 65 cm in 0.28 s)
      // so from 0.45 of the air the final pose is opened up too (reviews adjust4/5: 0.55, then 0.45, was too late): back straighter, arms down and round to
      // the front, the head back to level
      if (opt.phys) { const o3 = Human.smooth(0.40, 0.70, x / A) * w; p.spine.flex += (Math.min(p.spine.flex, 25) - p.spine.flex) * o3;
        for (const s of ['L', 'R']) { const a = p['arm_' + s]; a.elev += (Math.min(a.elev, 60) - a.elev) * o3; a.plane += (Math.max(a.plane, 60) - a.plane) * o3; }
        p.neck.lat += (Math.max(-8, Math.min(8, p.neck.lat)) - p.neck.lat) * o3; p.neck.flex += (Math.max(p.neck.flex, -25) - p.neck.flex) * o3; }
      const rec = kind === 'flip' ? q.pitch : q.yaw, r0 = kind === 'flip' ? at(T, 0).pitch : at(T, 0).yaw, r1 = kind === 'flip' ? at(T, A).pitch : at(T, A).yaw;
      const whole = (kind === 'flip' ? -360 : 360) * Math.max(1, Math.round(Math.abs(r1 - r0) / 360)) * (kind === 'flip' ? 1 : Math.sign(r1 - r0));
      const turn = opt.phys ? (kind === 'flip' ? -360 : 360 * (opt.dir || 1)) * physTurn(sk, tbl, kind, x) : (rec - r0) * whole / (r1 - r0), r = { pose: p, lift: M.flight(t, t0, t1) };
      if (t > t0 && t < t1) { if (kind === 'flip') r.flip = turn; else r.spin = turn; }
      // in the air the legs already hold the skis together: the ground solver (which squares the skis to a heading) stands aside
      if (gear === 'ski' && w > 0.5) r.free = true;
      // a ski boot holds the ankle forward and the foot flat; a board binding holds the foot flat
      for (const s of ['L', 'R']) { const L = p['leg_' + s]; if (gear === 'ski') { L.ankle = Math.min(L.ankle, -12); L.inv = 0; } else { L.ankle = Math.min(L.ankle, 5); L.inv = Math.max(-8, Math.min(8, L.inv)); } }
      if (r.free) together(sk, p);
      if (gear === 'board') { r.reach = null; }
      return r; } };
  }
  M.CLIPS.push(clip('skiflip_mc', '双板后空翻（真人动捕）', 'backflip', 'flip', 'ski', 3.9, 0.8, 2.4),
    clip('skispin_mc', '双板 360（真人动捕）', 'spin360', 'spin', 'ski', 3.8, 0.8, 2.3),
    clip('sbback_mc', '单板后空翻（真人动捕）', 'backflip', 'flip', 'board', 3.9, 0.8, 2.4),
    clip('sb360_mc', '单板 360（真人动捕）', 'spin360', 'spin', 'board', 3.6, 0.8, 2.3));
  // from real kicker video (data/video_tricks, MediaPipe; tools/mocap/bake_video.js): the shape of the air is the rider's own, the turn is
  // made from that shape (the video's own orientation is unreliable upside down)
  const V = { shape: 0.85, phys: true, E: 0.22 };
  M.CLIPS.push(clip('skiflip_v', '双板后空翻（真实视频·SMPL）', 'v_skiflip', 'flip', 'ski', 3.9, 0.8, 2.4, V),
    clip('skispin_v', '双板 360（真实视频·SMPL）', 'v_skispin', 'spin', 'ski', 3.8, 0.8, 2.3, V),
    clip('sbback_v', '单板后空翻（真实视频·SMPL）', 'v_sbflip', 'flip', 'board', 3.9, 0.8, 2.4, V),
    clip('sb360_v', '单板 360（真实视频·SMPL）', 'v_sb360', 'spin', 'board', 3.6, 0.8, 2.3, V));
})();

// ---------------------------------------------------------------- Human: everyday motion played from real motion capture (AMASS)
// A cycle table (data/mocap/cycle_amass_*.json, tools/mocap/bake_cycle.js) holds one loop of a real person's motion: per frame the joint
// angles, the pelvis' travel about its straight path (m, +x left, +z forward) and the flight (m). It is played as it was recorded, looped;
// Motion.sample puts the feet on the floor. The tables are read when the clips are sampled (Human.MOCAP is appended after the sources).
(() => {
  const M = Human.Motion, LEG = ['flex', 'abd', 'rot', 'knee', 'ankle', 'inv'], ARM = ['elev', 'plane', 'axial', 'elbow'];
  const toPose = (q, gait) => { const p = Human.restPose(); p.root.rot = q.root.slice(); [p.spine.flex, p.spine.lat, p.spine.twist] = q.spine; [p.neck.flex, p.neck.lat, p.neck.yaw] = q.neck;
    for (const s of ['L', 'R']) { LEG.forEach((k, j) => { p['leg_' + s][k] = q['leg_' + s][j]; }); ARM.forEach((k, j) => { p['arm_' + s][k] = q['arm_' + s][j]; }); }
    // standing still, the SMPL fits read the ankle 14-20 deg dorsiflexed and the hip 4-8 deg extended, and walking and running turn the feet out 20-30 deg against our 8 (a squat's wide stance turns them out on purpose, so less is taken there) (the start of the squat and jump
    // takes): a difference of definition between SMPL's foot and pelvis and ours, taken out here
    for (const s of ['L', 'R']) { p['leg_' + s].ankle += gait ? 16 : 8; p['leg_' + s].flex += 5; p['leg_' + s].rot += gait ? 18 : 0; }
    // SMPL's foot is one stiff block: its roll is the fit's guess, kept inside our foot's range
    for (const s of ['L', 'R']) { const L = p['leg_' + s]; for (const k of ['inv', 'ankle', 'abd', 'rot']) { const R = Human.ROM.leg[k]; if (R) L[k] = Math.max(R[0], Math.min(R[1], L[k])); } }
    // relaxed hands, as in the hand-made clips
    for (const s of ['L', 'R']) Object.assign(p['arm_' + s], { pron: 10, grip: 0.15, thumb: 0.1 }); return p; };
  // Catmull-Rom between frames (the loop wraps), so the 30 fps recording plays smoothly at any rate
  function at(T, u, gait, sk) { const F = T.frames, n = F.length, x = (((u % 1) + 1) % 1) * n, i = Math.floor(x), t = x - i, f = k => F[((i + k) % n + n) % n];
    const w = [(-t + 2 * t * t - t ** 3) / 2, (2 - 5 * t * t + 3 * t ** 3) / 2, (t + 4 * t * t - 3 * t ** 3) / 2, (-t * t + t ** 3) / 2], P = [f(-1), f(0), f(1), f(2)];
    const mix = get => get(P[0]).map((_, j) => P.reduce((a, q, m) => a + w[m] * get(q)[j], 0));
    const q = {}; for (const k in F[0].pose) q[k] = mix(fr => fr.pose[k]);
    const pose = toPose(q, gait); pose.root.pos = mix(fr => fr.pos); const lift = Math.max(0, mix(fr => [fr.lift])[0]);
    if (!gait && sk && lift === 0) balance(sk, pose);
    return { pose, lift }; }
  // Standing on both feet (a squat, before and after a jump) the centre of mass is over the feet. Our segments are not SMPL's, so the same
  // joint angles can leave it behind the heels (the deep squat sat 28 cm back). The body is tipped forward or back about the ankles
  // (pelvis pitch and both ankles together, so the feet stay flat) until the centre of mass is over the middle of the feet.
  function balance(sk, p) { const S = Human.Skeleton, r0 = p.root.rot[0], aL = p.leg_L.ankle, aR = p.leg_R.ankle;
    const err = d => { p.root.rot[0] = r0 + d; p.leg_L.ankle = aL - d; p.leg_R.ankle = aR - d; const xf = S.pose(sk, p), c = M.contacts(sk, xf), m = M.com(sk, xf);
      const mid = (c[0][2] + c[1][2] + c[3][2] + c[4][2]) / 4; return m[2] - mid; };
    let lo = -30, hi = 30; if (Math.abs(err(0)) < 0.01) { err(0); return; }
    if (err(lo) * err(hi) > 0) { err(0); return; }
    for (let i = 0; i < 14; i++) { const md = (lo + hi) / 2; if (err(lo) * err(md) <= 0) hi = md; else lo = md; } err((lo + hi) / 2); }
  const clip = (name, zh, key, gait) => { const T = () => Human.MOCAP.cycles[key];
    return { name, zh, group: 'daily', mocap: true, gait, get dur() { return T() ? T().period : 1; }, at: (u, sk) => at(T(), u, gait, sk) }; };
  // (runs and the squat are baked too, data/mocap/cycle_amass_{jog,run,run3,squat}.json, but not played yet: in a run the swing foot passes
  // only 4-6 cm over the floor on our legs, so the floor planting takes it for a second stance foot and the feet slide; the squat's feet
  // drift 60 cm apart at the bottom, where SMPL's hip turn and spread read differently from ours)
  M.CLIPS.push(clip('walk_am', '走路（AMASS 真人动捕）', 'walk', true), clip('walk2_am', '走路 2（AMASS 真人动捕）', 'walk2', true), clip('jump_am', '原地跳（AMASS 真人动捕）', 'jump', false));
})();

// ---------------------------------------------------------------- Human: ski and board moves timed from real video
// Tables from tools/mocap/bake_vcycle.js (HMR2 / SMPL fits of real riders, data/video_tricks/more): a short-turn loop averaged over six turn
// pairs, a hockey stop and a heel-side powder slash as they happened. What a single camera reads well is used: how deep the legs fold and when,
// how far the trunk bends and turns, what the arms do. The rest is the gear's own: the lean, the skis' heading and edge come from the hand-made
// clips and the solvers (a video's whole-body orientation is the camera's, and its leg turn-out crosses the skis).
// Each video number goes in as a change from the rider's own start (or cycle mean), so the HMR biases (a spine read 15-20 deg too bent, a knee
// read a little straighter) cancel.
(() => {
  const M = Human.Motion;
  // (Human.MOCAP is appended after the sources: the tables and their means are read on first use)
  let VT = null, ST, stKnee, stSp, stTw, HS, hs0, HB, hb0, hbK, hbSp, WS, ws0, PW, pwK, pwSp, PB, pbK, pbSp;
  const init = () => { if (VT) return; VT = Human.MOCAP.vski;
    ST = VT.shortturn; stKnee = mean(ST, avgKnee); stSp = mean(ST, q => q.spine[0]); stTw = mean(ST, q => q.spine[2]);
    HS = VT.hockeystop; HS.dur = (HS.frames.length - 1) / HS.fps; hs0 = HS.frames[0];
    HB = VT.heelbrake; HB.dur = (HB.frames.length - 1) / HB.fps; hb0 = HB.frames[0]; hbK = mean(HB, avgKnee); hbSp = mean(HB, q => q.spine[0]);
    WS = VT.wedgestop; WS.dur = (WS.frames.length - 1) / WS.fps + 0.8; ws0 = WS.frames[0];
    PW = VT.powder; pwK = mean(PW, avgKnee); pwSp = mean(PW, q => q.spine[0]); PB = VT.sbpowder; pbK = mean(PB, avgKnee); pbSp = mean(PB, q => q.spine[0]); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), sm = Human.smooth;
  // a table frame at time t (s) or phase (loop), linear between frames
  const frame = (T, x, loop) => { const n = T.frames.length, f = loop ? (((x % 1) + 1) % 1) * n : clamp(x * T.fps, 0, n - 1.001), i = Math.floor(f), w = f - i, a = T.frames[i % n], b = T.frames[(i + 1) % n], o = {};
    for (const k in a) if (Array.isArray(a[k])) o[k] = a[k].map((v, j) => v + (b[k][j] - v) * w); return o; };
  const avgKnee = q => (q.leg_L[3] + q.leg_R[3]) / 2, avgFlex = q => (q.leg_L[0] + q.leg_R[0]) / 2;
  const mean = (T, f) => T.frames.reduce((s, q) => s + f(q), 0) / T.frames.length;
  // the arms as the rider held them, blended into the clip's own (hand grip, pronation, wrist kept)
  const arms = (p, q, w) => { for (const s of ['L', 'R']) { const a = p['arm_' + s], v = q['arm_' + s]; a.elev += (v[0] - a.elev) * w; a.plane += (v[1] - a.plane) * w; a.elbow += (Math.max(25, v[3]) - a.elbow) * w; } };
  // legs sink by d deg at the knee: the hip folds as much (on skis the ankle closes 0.4 of it, so the hips stay over the feet; on a board the
  // binding solver sets the ankles, and equal hip and knee changes keep the edge angle tilt - hip + knee + ankle)
  const sink = (p, d, gear) => { for (const s of ['L', 'R']) { const L = p['leg_' + s]; L.flex += d; L.knee += d; if (gear === 'ski') L.ankle = Math.min(L.ankle - 0.4 * d, -12); L.ankle = clamp(L.ankle, Human.ROM.leg.ankle[0], Human.ROM.leg.ankle[1]); } };

  // ---- short turns: quick linked turns down the fall line, the chest facing down the hill, a pole plant to start every turn
  // (the carved turn's lean and solved legs, swung harder: the skis cross the fall line about 32 deg each way; its phase matches the video's
  // trunk side bend at zero shift)
  const carve = M.CLIPS.find(c => c.name === 'carve');
  const shortturn = (u, sk) => { init(); const r = carve.at(u, sk), p = r.pose, q = frame(ST, u, true), s = M.signs(sk);
    // the up-and-down of the turn as the video's knees show it (0.45 of it, about 14 deg lower overall and the back 6 deg more bent: on the carve's longer legs the full
    // swing stood the skier bolt upright at each edge change)
    sink(p, 17 + 0.45 * (avgKnee(q) - stKnee), 'ski'); p.spine.flex += 6; p.neck.flex -= 4;
    // the inside leg folds, the outside stays long: the video's left-right difference on top of the carve's
    const dk = (q.leg_L[3] - q.leg_R[3]) * 0.25; p.leg_L.knee += dk; p.leg_L.flex += dk; p.leg_R.knee -= dk; p.leg_R.flex -= dk;
    p.spine.flex += 0.6 * (q.spine[0] - stSp);
    // the chest stays square to the fall line while the skis swing under it: more counter-turn than in a carve
    const hd = 1.6 * r.heading, ex = hd - r.heading; p.leg_L.rot -= ex; p.leg_R.rot += ex;
    p.spine.twist += 0.6 * (q.spine[2] - stTw) - s.twist * 0.25 * hd; p.neck.yaw += s.neck * 0.2 * hd;
    arms(p, q, 0.7);
    // the pole plant at the end of each turn: the hand that reached furthest forward (the new inside hand) touches down beside the tip
    const pl = ph => Math.max(0, Math.cos(2 * Math.PI * (u - ph))) ** 12;
    p.plant = [pl(0.3), pl(0.8)];
    return { pose: p, heading: hd };
  };

  // ---- hockey stop: run straight, a pole touch and a sink, the skis pivot hard across (about 62 deg, as far as the two skis stay parallel on our legs) under a chest that keeps facing
  // downhill, the body leans up the hill and stays low while the skis skid to a stop, then stands up and turns back down the hill
  const hockey = (u, sk) => { init(); const t = u * HS.dur, s = M.signs(sk), q = frame(HS, t, false), SKI = M.SKI;
    const p = JSON.parse(JSON.stringify(SKI));
    // the video's sink and trunk, as a change from its own straight running (faded in and out at the loop's ends)
    const fade = sm(0, 0.3, t) * (1 - sm(HS.dur - 0.5, HS.dur, t));
    // (+6 from the skid on: a skier stays low through the skid and after the stop, where the instructor's knees read only 55)
    const low = sm(1.0, 1.4, t) * (1 - sm(HS.dur - 0.5, HS.dur, t));
    sink(p, fade * clamp(0.6 * (avgKnee(q) - avgKnee(hs0)), -5, 28) + 6 * low, 'ski');
    p.spine.flex = Math.min(35, p.spine.flex + fade * 0.6 * (q.spine[0] - hs0.spine[0])); p.root.rot[0] += 8 * low; p.leg_L.flex += 8 * low; p.leg_R.flex += 8 * low; p.neck.flex -= 4 * low;   // (the pelvis tips with the hips folding as much: the thighs and skis keep their angle, so levelling the skis cannot take it out, review adjust6)   // (review adjust5: the lean from the hips, not a 57 deg hunch; eyes up the slope)
    arms(p, q, 0.6 * fade);
    const w = sm(1.0, 1.3, t) * (1 - sm(3.0, 3.8, t)), hd = 75 * w; p.root.yf = 1; p.pelvisYaw = 0.85;
    p.spine.twist = s.twist * 0.55 * hd; p.neck.yaw = -s.neck * 0.25 * hd;
    // the inside (left) hand touches the snow as the skis start to turn
    const pl = sm(0.45, 0.6, t) * (1 - sm(0.8, 1.0, t)); p.plant = [pl, 0];
    // the body leans into the skid (the snow pushes the skis back toward the hill), most while the skis bite at the start of the skid
    const bite = sm(1.1, 1.4, t) * (1 - sm(1.5, 2.2, t)), roll = -s.roll * (26 * w + 6 * bite);
    p.spine.lat += 0.3 * roll; p.neck.lat = 0.85 * roll;
    return { pose: p, heading: hd, roll, spineCap: 35, edges: [(32 + 2 * bite) * w, (32 + 2 * bite) * w] };   // (both skis on their uphill edges, review adjust9)
  };

  // ---- heel-side powder slash on a board: a quick rise to unweight, then the whole body inclines onto the heel edge as one line (hips open,
  // not a chair) and sinks a little as the tail is thrown round, then rides on. (review adjust4: the video's knee depth taken whole sat the
  // rider in a chair, hips 85, knees 100: now the depth is the board's own heel key, the video gives the timing, the trunk and the arms)
  const heelbrake = (u, sk) => { init(); const t = u * HB.dur, q = frame(HB, t, false), P = M.sbOf(sk).P;
    const w = sm(0.45, 0.9, t) * (1 - sm(2.2, 2.9, t)), p = Human.lerpPose(P.ride, P.heel, w);
    const fade = sm(0, 0.3, t) * (1 - sm(HB.dur - 0.4, HB.dur, t));
    // the unweight: knees 15 deg straighter just before the edge goes in; then a sink of up to 8 deg at the bottom of the slash
    const up = Math.sin(Math.PI * clamp((t - 0.25) / 0.55, 0, 1)), dn = sm(1.0, 1.5, t) * (1 - sm(1.9, 2.6, t));
    sink(p, -15 * up + 8 * dn, 'board');
    p.spine.flex += 0.3 * (q.spine[0] - hbSp) * fade; p.spine.flex = Math.min(p.spine.flex, 10);   // (the back straight: one line from the feet to the head)
    // the back hand swings round over the tail as the board slides out, the front hand points the way on
    arms(p, q, 0.5 * fade);
    return { pose: p };
  };

  // ---- the snowplough (a beginner's first turns and stops): tips together, tails pushed apart, both skis on their inside edges
  // (Motion.parallel's wedge). Upright and quiet, hands low in front.
  const PLOUGH = () => { const p = JSON.parse(JSON.stringify(M.SKI)); p.root.rot[0] = 14; for (const s of ['L', 'R']) Object.assign(p['leg_' + s], { flex: 38, knee: 55, ankle: -22 }); p.spine.flex = 16; p.neck.flex = -16;   // (review adjust6: the beginners in the videos keep knees 44-64, hips 40-57)
    for (const s of ['L', 'R']) Object.assign(p['arm_' + s], { elev: 30, plane: 55, elbow: 55 }); return p; };
  // wedge stop: gliding in a narrow wedge, the tails pushed out to a wide one as the legs turn in and spread (the video's hip spread gives the
  // timing: 11 -> 21 deg in about 0.8 s), a little sink, held to a stop, then let back to the glide
  const wedgestop = (u, sk) => { init(); const t = u * WS.dur, q = frame(WS, Math.min(t, WS.dur - 0.8), false), p = PLOUGH();
    const ab = (q.leg_L[1] + q.leg_R[1]) / 2 - (ws0.leg_L[1] + ws0.leg_R[1]) / 2, back = sm(WS.dur - 0.8, WS.dur, t);
    const wd = (14 + 24 * sm(1, 9, ab)) * (1 - back) + 14 * back;   // (the push-out in about 0.25 s, as in the video)
    sink(p, clamp(avgKnee(q) - avgKnee(ws0), -4, 14) * (1 - back), 'ski'); p.spine.flex += clamp(0.4 * (q.spine[0] - ws0.spine[0]), -5, 8) * (1 - back);
    return { pose: p, heading: 0, wedge: wd, wedgeEdge: 4 + wd * 0.3 }; };
  // wedge turns: the wedge kept, the skis steered round by turning both legs, more weight and edge on the outside ski (its leg longer)
  // (review adjust6: the outside ski carries the turn, edge 25-30 against 5-10 inside, the knees 20-30 apart, the chest stays on the fall line)
  const wedgeturn = (u, sk) => { const s = M.signs(sk), p = PLOUGH(), ph = Math.sin(2 * Math.PI * u), hd = 18 * ph;
    // + = turning to the body's left: the right ski is the outside ski
    p.leg_R.knee -= 12 * ph; p.leg_R.flex -= 10 * ph; p.leg_L.knee += 12 * ph; p.leg_L.flex += 10 * ph;
    p.spine.lat = 5 * ph; p.root.rot[2] -= s.roll * 7 * ph; p.spine.twist = s.twist * 0.6 * hd; p.neck.yaw = -s.neck * 0.4 * hd;
    const eo = 12 + 18 * Math.abs(ph), ei = 8 - 3 * Math.abs(ph);
    return { pose: p, heading: hd, wedge: 28, wedgeEdge: ph > 0 ? [ei, eo] : [eo, ei] }; };

  // ---- sideslips: the skis or the board held across the fall line, sliding down sideways on a soft uphill edge that is let off and set
  // again (instructors' sideslip drills: the edge eases about every 1.5 s, the knees and hips flex a little to set it)
  const skisideslip = (u, sk) => { const s = M.signs(sk), p = JSON.parse(JSON.stringify(M.SKI)), set = 0.5 - 0.5 * Math.cos(4 * Math.PI * u);
    sink(p, -2 + 6 * set, 'ski'); p.spine.flex += 4; const hd = 80; p.root.yf = 1;   // (twist 0.55: 0.6 of 80 broke the 45 deg spine limit)   // (straight across the hill; the root turned yaw-first so the lean is the body's own)
    // the chest faces down the hill while the skis point across it; the downhill (here left) hand ready for a pole plant
    p.spine.twist = s.twist * 0.55 * hd; p.neck.yaw = -s.neck * 0.4 * hd;
    const roll = -s.roll * (6 + 6 * set); p.spine.lat += 0.3 * roll; p.neck.lat = 0.85 * roll;
    return { pose: p, heading: hd, roll, edges: [16 + 3 * set, 16 + 3 * set] }; };
  const sbsideslip = (u, sk) => { const P = M.sbOf(sk).P, set = 0.5 - 0.5 * Math.cos(4 * Math.PI * u), p = Human.lerpPose(P.ride, P.heel, 0.25 + 0.15 * set);
    sink(p, -6 + 4 * set, 'board');
    // arms out low and wide for balance, the head looking down the hill (review adjust6)
    for (const sd of ['L', 'R']) Object.assign(p['arm_' + sd], { elev: 45, plane: 15, elbow: 25 }); p.neck.yaw = 0; return { pose: p }; };   // (review adjust8: eyes down the hill, not toward the nose)
  // falling leaf: the heel-edge slip with the weight moved onto the front foot (the board drifts nose-first across the hill) then onto the
  // back foot (tail-first), the head turning to look the way it goes. The front-back shift is the video's (sb_fallingleaf_1: the hips flex
  // over the front then the back foot about every 3.5 s)
  const sbfallingleaf = (u, sk) => { const P = M.sbOf(sk).P, s = M.signs(sk), sh = Math.sin(2 * Math.PI * u), set = 0.5 - 0.5 * Math.cos(4 * Math.PI * u);
    const p = Human.lerpPose(P.ride, P.heel, 0.3 + 0.12 * set); sink(p, -6, 'board');
    p.leg_L.flex += 8 * sh; p.leg_L.knee += 8 * sh; p.leg_R.flex -= 8 * sh; p.leg_R.knee -= 8 * sh;
    p.spine.lat += 6 * sh; p.neck.yaw = s.neck * (12 + 30 * sh);
    return { pose: p }; };

  // ---- one-foot skating on a board (getting to the lift): the rear foot out of its binding pushes on the snow beside the toe edge, the
  // body stands tall over the front foot and faces the nose (sb_skate_1: knees 15-50, the back 5-15 deg bent; a push about every 1.5 s, the
  // pushing knee folding to about 80 as the foot comes forward again)
  const sbskate = (u, sk) => { const s = M.signs(sk), p = Human.restPose(), ph = u % 1;
    p.unbind = 1; p.root.rot = [8, 30 * s.yaw, 0]; p.spine.flex = 10; p.neck.flex = -14; p.neck.yaw = s.neck * 20;   // (review adjust7: hips and head toward the nose)
    Object.assign(p.leg_L, { flex: 34, knee: 44, ankle: -16, abd: 4, rot: 20 });
    // push: on the snow from 0 to 0.6 of the stroke (the foot goes from beside the front binding to behind the back of the board's middle), then lifted and brought back
    const push = ph < 0.6, x = push ? ph / 0.6 : (ph - 0.6) / 0.4, sm2 = x * x * (3 - 2 * x);
    const stroke = push ? 0.10 - 0.32 * sm2 : -0.22 + 0.32 * sm2, up = push ? 0 : 0.07 * Math.sin(Math.PI * x);
    Object.assign(p.leg_R, { flex: 20 - 25 * (push ? sm2 : 1 - sm2), abd: 14, rot: 38, inv: 20, knee: 25 + (push ? 0 : 45 * Math.sin(Math.PI * x)), ankle: -10 });
    // the front knee gives a little with each push; the arms swing loosely against the pushing leg
    const give = push ? sm2 : 1 - sm2, sw = Math.sin(2 * Math.PI * ph);
    // the upper body works with the push (review adjust9: it was a statue): the chest turns against the pushing leg, the back bends into the end of the push, the head steadies the look
    p.spine.twist = s.twist * 8 * sw; p.spine.flex += 4 * give; p.neck.yaw += s.neck * 6 * sw;   // (against the chest, so the head holds still)
    p.root.rot[1] += 4 * s.yaw * sw;   // (the pelvis turns a little with each push too)
    p.leg_L.rot += 4 * s.yaw * sw; p.neck.yaw += 4 * s.neck * sw;   // (the front hip and neck take it back out, so the board and the look stay put)
    p.leg_L.knee += 16 * give; p.leg_L.flex += 10 * give;   // the front knee sinks as the push foot reaches back
    Object.assign(p.arm_L, { elev: 25 + 15 * Math.sin(2 * Math.PI * ph), plane: 20, elbow: 30, pron: 30, grip: 0.4, thumb: 0.3 });
    Object.assign(p.arm_R, { elev: 25 - 15 * Math.sin(2 * Math.PI * ph), plane: 20, elbow: 30, pron: 30, grip: 0.4, thumb: 0.3 });
    return { pose: p, skate: { s: stroke, up } }; };

  // ---- batch 2 (data/video_tricks/more3): deep powder on skis and on a board, steep jump turns, a fast straight run on a board
  // ski powder: the carved turn pair (3.2 s, the video's pair is 3.26 s) ridden lower, with the video's bounce (the knees open at the edge change
  // to let the skis float up and fold through the turn, about +-17 deg) and less lean: in deep snow the skis turn under a body that stays more upright
  const skipowder = (u, sk) => { init(); const r = carve.at(u, sk), p = r.pose, q = frame(PW, u + 5 / 32, true);
    sink(p, 6 + 0.45 * (avgKnee(q) - pwK), 'ski'); p.leg_L.flex += 6; p.leg_R.flex += 6; p.root.yf = 1; p.leg_L.knee = Math.min(p.leg_L.knee, 95); p.leg_R.knee = Math.min(p.leg_R.knee, 95);   // (review adjust11: some of the sink from the hips, so the pelvis comes forward)
    p.spine.flex += -4 + 0.4 * (q.spine[0] - pwSp); p.neck.flex += 2; p.root.rot[0] -= 6;   // (review adjust8: trunk up, hips over the feet)
    p.root.rot[2] *= 0.15; arms(p, q, 0.5);
    for (const s of ['L', 'R']) Object.assign(p['arm_' + s], { elev: 55, plane: 85 });   // hands up and wide for balance (review adjust7)
    return { pose: p, heading: 1.2 * r.heading }; };
  // board powder: the board turn slowed to the video's 5.2 s pair, the knees opening and folding about 25 deg each turn (the rider rises to let the
  // nose float, then sinks into the turn), the trunk following
  const sbturn = M.CLIPS.find(c => c.name === 'sbturn');
  const sbpowder = (u, sk) => { init(); const r = sbturn.at(u, sk), p = r.pose, q = frame(PB, u, true);
    sink(p, 0.35 * (avgKnee(q) - pbK), 'board'); p.spine.flex = Math.min(30, p.spine.flex + 0.3 * (q.spine[0] - pbSp)); arms(p, q, 0.4);
    // surfed, not carved (review adjust7): half the board turn's lean, the weight back on the rear foot so the nose floats
    p.root.rot[0] *= 0.45; p.root.rot[2] *= 0.5; p.leg_R.knee += 2; p.leg_R.flex += 2;
    const dk = p.leg_R.knee - p.leg_L.knee; if (dk > 20) { p.leg_R.knee -= dk - 20; p.leg_R.flex -= dk - 20; }
    return r; };
  // board fast straight: a flat glide, taller than the riding stance (video knees 33, spine 19), arms low and relaxed, the small sway of riding
  const sbfast = (u, sk) => { const P = M.sbOf(sk).P, p = Human.lerpPose(P.ride, P.crouch, 0.05 + 0.05 * Math.sin(2 * Math.PI * u));
    sink(p, -12 + 3 * Math.sin(4 * Math.PI * u), 'board'); p.spine.flex = Math.max(8, p.spine.flex - 2);
    Object.assign(p.arm_L, { elev: 25, plane: 10, elbow: 30 }); Object.assign(p.arm_R, { elev: 35, plane: 25, elbow: 45 });
    return { pose: p }; };
  // steep jump turns (video ski_jumpturn_1: a sink to knees about 70 with a pole plant downhill, a spring to about 40, the legs pulled up in the
  // air, the skis pivoting through the fall line under a chest that keeps facing down the hill, a landing that sinks to about 75): 1.3 s per turn
  const JT = 1.3, jtAir = [0.40, 0.70];
  const jumpturn = (u, sk) => { const t = (u * 2 * JT) % JT, side = u < 0.5 ? 1 : -1, s = M.signs(sk), p = JSON.parse(JSON.stringify(M.SKI));
    const [a, b] = jtAir, wind = sm(0.05, a - 0.12, t) * (1 - sm(a - 0.12, a - 0.02, t)), air = sm(a - 0.04, a + 0.06, t) * (1 - sm(b - 0.1, b, t)), land = sm(b - 0.01, b + 0.12, t) * (1 - sm(b + 0.14, b + 0.5, t));   // (from touch-down: review adjust8 saw the skis sink 4 cm)
    const ext = sm(a - 0.17, a - 0.02, t) * (1 - sm(a - 0.01, a + 0.06, t));   // the spring: the legs open hard just before the skis leave the snow
    sink(p, 10 + 20 * wind - 30 * ext + 16 * land, 'ski');   // (traversing low between turns, video knees about 70)
    const tuck = sm(a + 0.02, a + 0.18, t) * (1 - sm(b - 0.14, b - 0.02, t));   // (after the spring, not against it)
    for (const sd of ['L', 'R']) { const L = p['leg_' + sd]; L.flex += 18 * tuck; L.knee += 20 * tuck; }
    // heading: from across the hill one way to across the other, the turn made in the air
    const turn = sm(a, b, t), hd = side * 70 * (2 * turn - 1);
    p.spine.twist = s.twist * 0.6 * hd; p.neck.yaw = -s.neck * 0.2 * hd; p.spine.flex += 10 * (wind + land) + 6;
    p.pelvisYaw = 0.7;   // (the pelvis turns with the skis through the air too: the yaw solve is off in flight, review adjust9 saw a 42 deg snap at touch-down)   // (review adjust7: the chest faces down the hill, sign as in hockey)
    p.root.yf = 1; const roll = -s.roll * side * 14 * (2 * turn - 1) * (1 - air), E = 20 * (1 - air);   // (the traverses on their uphill edges, review adjust10)
    // pole plant: the downhill hand reaches down the hill before the spring
    const ph = side > 0 ? 'R' : 'L', A = p['arm_' + ph]; A.elev += 25 * wind; A.plane += 30 * wind;
    p.plant = side > 0 ? [0, wind] : [wind, 0];
    const x = clamp((t - a) / (b - a), 0, 1);
    return { pose: p, heading: hd, lift: 0.19 * 4 * x * (1 - x), roll, edges: [E, E] }; };   // (a 0.19 m rise: free fall over 0.30 s plus what the tucked legs draw up)

  // ---- a fast giant-slalom turn (EPFL Ski-2DPose race shots, 42 GS shots: 1.7 s a turn, knees p50 71 / p90 99, edges |p90| 62, inclination
  // |p90| 43, angulation p50 23 / p90 47, stance 0.34 m): the carved turn, slowed to the race rhythm, leaned and edged harder, deeper at the apex
  const gsturn = (u, sk) => { const r = carve.at(u, sk), p = r.pose, ap = Math.abs(Math.sin(2 * Math.PI * (u - 0.2)));
    p.root.rot[2] *= GSL; sink(p, 6 + 10 * ap, 'ski'); p.spine.lat *= 1.6; p.neck.lat *= 1.3;
    return { pose: p, heading: GSH * r.heading }; };
  let GSL = 1.7, GSH = 1.5;   // (1.7: edges to 53, inclination 46; race |p90| 62 / 43: the rest of the edge comes from angulation)
  M.gsTune = (l, h) => { GSL = l; GSH = h; };

  M.CLIPS.push({ name: 'gsturn', zh: '双板高速大回转（比赛数据）', group: 'ski', gear: 'ski', dur: 3.4, at: gsturn });
  M.CLIPS.push({ name: 'sbskate', zh: '单板单脚滑（后脚蹬雪）', group: 'board', gear: 'board', dur: 1.5, at: sbskate });
  M.CLIPS.push({ name: 'skipowder', zh: '双板粉雪（真实视频）', group: 'ski', gear: 'ski', dur: 3.2, mocap: true, at: skipowder },
    { name: 'skijumpturn', zh: '双板陡坡跳转', group: 'ski', gear: 'ski', dur: 2 * JT, at: jumpturn },
    { name: 'sbpowder', zh: '单板粉雪（真实视频）', group: 'board', gear: 'board', dur: 5.2, mocap: true, at: sbpowder },
    { name: 'sbfast', zh: '单板高速直滑', group: 'board', gear: 'board', dur: 2.4, at: sbfast });
  M.CLIPS.push({ name: 'skisideslip', zh: '双板横滑', group: 'ski', gear: 'ski', dur: 3.0, at: skisideslip },
    { name: 'sbsideslip', zh: '单板后刃横滑', group: 'board', gear: 'board', dur: 3.0, at: sbsideslip },
    { name: 'sbfallingleaf', zh: '单板落叶飘', group: 'board', gear: 'board', dur: 7.0, at: sbfallingleaf });
  M.CLIPS.push({ name: 'wedgeturn', zh: '双板犁式转弯（新手）', group: 'ski', gear: 'ski', dur: 7.5, at: wedgeturn },
    { name: 'wedgestop', zh: '双板犁式刹停（真实视频）', group: 'ski', gear: 'ski', get dur() { init(); return WS.dur; }, mocap: true, at: wedgestop });
  M.CLIPS.push({ name: 'shortturn', zh: '双板小回转（真实视频）', group: 'ski', gear: 'ski', get dur() { init(); return ST.period; }, mocap: true, at: shortturn },
    { name: 'hockeystop', zh: '双板急停（真实视频）', group: 'ski', gear: 'ski', get dur() { init(); return HS.dur; }, mocap: true, at: hockey },
    { name: 'sbheelbrake', zh: '单板后刃甩尾刹车（真实视频）', group: 'board', gear: 'board', get dur() { init(); return HB.dur; }, mocap: true, at: heelbrake });
})();

// ---------------------------------------------------------------- Human: the reference body (a real modelled man, for study)
// Human.REFDATA (09a_refdata.js) is an open, artist-made mesh with skin weights. Here it is hung on this module's skeleton so that every pose
// and clip of Human.Motion plays on it: the skeleton's joints are moved to the mesh's joints, and the mesh's own pose (arms down at an angle,
// legs a little apart) is the bind pose: each bone's bind rotation says how far that pose is from this skeleton's rest frame.
(() => {
  const V = Human.v3, Q = Human.q;
  const bytes = s => typeof atob === 'function' ? Uint8Array.from(atob(s), c => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, 'base64'));
  let cache = null;
  function build() {
    if (cache) return cache; const D = Human.REFDATA; if (!D) return null;
    const M = Human.measure(Human.DEFAULTS), sk = Human.Skeleton.build(M);
    // rest (canonical) joints: each bone's offset from its parent, turned back by the parent's bind rotation
    const Jc = [];
    for (const b of sk.bones) Jc[b.i] = b.p < 0 ? D.J[b.i].slice() : V.add(Jc[b.p], Q.rot(Q.conj(D.R[b.p]), V.sub(D.J[b.i], D.J[b.p])));
    sk.bones.forEach(b => { b.J = Jc[b.i]; });
    const q16 = new Uint16Array(bytes(D.pos).buffer), pos = new Float32Array(D.nv * 3);
    for (let i = 0; i < D.nv; i++) { pos[i * 3] = q16[i * 3] / 30000 - 1; pos[i * 3 + 1] = q16[i * 3 + 1] / 30000; pos[i * 3 + 2] = q16[i * 3 + 2] / 30000 - 1; }
    const idx = Uint32Array.from(new Uint16Array(bytes(D.idx).buffer)), bi = Int32Array.from(bytes(D.bi)), bw = Float32Array.from(bytes(D.bw), w => w / 255);
    cache = { sk, M, mesh: { nv: D.nv, nt: D.nt, pos, idx }, W: { bi, bw }, bind: { R: D.R.map(r => r.slice()), P: D.J.map(p => p.slice()) } };
    return cache;
  }
  Human.RefBody = { build };
})();

// ---------------------------------------------------------------- Human.Turn: the whole skier from one function of a few numbers
// The pose of a turning skier is F(phase, amplitude, speed) and nothing else:
//   phase      where in the turn: 0 crossover into a left turn, 0.125 entry, 0.25 apex, 0.375 exit, 0.5 crossover into the right turn, ...
//   amplitude  how hard this turn is (0 = standing straight on the skis, 1 = the turn as written). Letting a turn go takes the amplitude to 0, so
//              the body comes back to the stance whatever the phase: nothing is left over to swing round once more
//   speed      0 = the slow turn as written, 1 = the fast one; between, the two are mixed
// The numbers that make the turn are one "motion set" (Human.Turn.SET0, below): a stance, four key moments of a left turn at each speed (the right
// turn is their mirror), and a few style knobs. A person tunes it in the lab's tuning page; a script can tune it too (tools/turn_check.js measures
// it). The keys are joined by a periodic cubic over the phase, so with smooth inputs every joint moves smoothly: no filter is laid on the pose.
// Different parts of the body may run a little behind the hips on the same phase (lagTrunk, lagArms): the body moves as one wave, never on
// clocks of its own.
(() => {
  const D = Math.PI / 180, V = Human.v3;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const KEYS = ['crossover', 'entry', 'apex', 'exit'];
  // one key moment of a LEFT turn (the hips lean to the body's left of the feet; the outside leg and hand are the right ones)
  //   lean   deg: how far the hips lean inside the feet          ext   the hips' distance from the feet as a share of leg length (0.76-0.94)
  //   fore   hips ahead (+) or behind (-) the feet, share of leg length
  //   tilt   deg: the pelvis tipped forward, on top of what the depth gives
  //   ang    angulation: the trunk leans back toward the outside ski, as a share of the lean
  //   twist  deg: the chest turned toward the outside ski
  //   head   0..1: how much of the lean the head takes back (1 = the eyes stay level)
  //   heading deg: the skis' angle to the way the body faces (+ toward the body's left: in a left turn the skis swing from pointing right of the
  //          fall line, through it at the apex, to pointing left; checked on the skeleton by tools/turn_check.js)
  //   out / in  the outside and inside arm: elev, plane, elbow (deg)
  const K = (lean, ext, heading, ang, twist, out, inn, more) => Object.assign({ lean, ext, fore: -0.03, tilt: 0, ang, twist, head: 0.5, heading,
    out: { elev: out[0], plane: out[1], elbow: out[2] }, in: { elev: inn[0], plane: inn[1], elbow: inn[2] } }, more || {});
  // one key moment of a snowboard turn (regular stance: the left foot leads). Keys: [into toe side, toe edge, into heel side, heel edge]
  //   tilt   deg: the whole body inclined toward the toes (+) or the heels (-): with the legs it decides the edge (edge = tilt - hip + knee + ankle)
  //   hip, kneeF / kneeR, ankleF / ankleR  deg, front and rear leg      spine  deg forward bend      twist  deg the chest turned toward the nose
  //   look   deg the head turned toward the nose      neckFlex / neckLat  deg (neckLat left out: the neck keeps the eyes nearer level by itself)
  //   front / rear  the front (left) and rear (right) arm: elev, plane, elbow
  const B = (tilt, hip, kneeF, kneeR, ankleF, ankleR, spine, front, rear, more) => Object.assign({ tilt, hip, kneeF, kneeR, ankleF, ankleR, spine, twist: 18, look: 65,
    front: { elev: front[0], plane: front[1], elbow: front[2] }, rear: { elev: rear[0], plane: rear[1], elbow: rear[2] } }, more || {});
  const BKEYS = ['toeIn', 'toe', 'heelIn', 'heel'];
  const SET0 = {
    v: 1,
    stance: { ext: 0.9, fore: -0.03, tilt: 0, arms: { elev: 40, plane: 66, elbow: 70 } },
    slow: [K(0, 0.86, -20, 0.15, 0, [42, 66, 72], [42, 66, 72]), K(16, 0.88, -13, 0.25, 4, [48, 58, 64], [38, 72, 80]),
      K(30, 0.86, 0, 0.3, 8, [52, 54, 60], [34, 74, 88]), K(16, 0.83, 13, 0.25, 4, [48, 58, 64], [38, 72, 80])],
    fast: [K(0, 0.84, -12, 0.15, 0, [44, 64, 70], [44, 64, 70]), K(24, 0.86, -8, 0.3, 3, [52, 54, 60], [36, 72, 84]),
      K(44, 0.82, 0, 0.35, 6, [56, 50, 56], [32, 76, 92]), K(24, 0.8, 8, 0.3, 3, [52, 54, 60], [36, 72, 84])],
    style: { exag: 1, quiet: 0, handFwd: 0, handWide: 0, lagTrunk: 0.02, lagArms: 0.05, dwell: 0.3, poleTouch: 1 },
    board: {
      stance: B(6, 40, 60, 64, -24, -28, 16, [40, 10, 25], [35, 0, 20]),
      slow: [B(4, 44, 64, 68, -24, -28, 16, [38, 20, 30], [34, 12, 26]), B(38, 42, 80, 84, -22, -32, 16, [30, 70, 48], [28, 66, 48], { neckFlex: -20 }),
        B(4, 44, 64, 68, -24, -28, 14, [42, 30, 36], [36, 22, 30]), B(-28, 54, 76, 80, -30, -33, 10, [48, 66, 58], [40, 60, 40], { neckFlex: 18, neckLat: -14 })],
      fast: [B(2, 46, 68, 72, -24, -28, 16, [36, 24, 32], [32, 16, 28]), B(46, 44, 88, 92, -22, -34, 16, [26, 76, 50], [24, 72, 50], { neckFlex: -22 }),
        B(2, 46, 68, 72, -24, -28, 12, [44, 34, 40], [38, 26, 32]), B(-34, 58, 82, 85, -33, -35, 8, [50, 70, 60], [42, 62, 40], { neckFlex: 20, neckLat: -16 })],
    },
  };
  const copy = o => JSON.parse(JSON.stringify(o));

  // ---- one key moment as a pose (the legs are solved onto the snow here; parallel skis are made by Motion's solver afterwards)
  let SG = null;
  const signs = sk => SG || (SG = Human.Motion.signs(sk));
  function descend(p, fields, err, step) {
    let e = err(p);
    for (let st = step; st > 0.1; st /= 2) for (let rep = 0; rep < 4; rep++) { let moved = false;
      for (const [o, k] of fields) for (const dv of [st, -st]) { o(p)[k] += dv; const e2 = err(p); if (e2 < e - 1e-12) { e = e2; moved = true; } else o(p)[k] -= dv; }
      if (!moved) break; }
    return e;
  }
  function build(sk, k, set, prev) {
    const I = sk.idx, J = n => sk.bones[I[n]].J, s = signs(sk), M = Human.Motion;
    const legLen = V.len(V.sub(J('shin_L'), J('thigh_L'))) + V.len(V.sub(J('talus_L'), J('shin_L')));
    const latSign = (() => { const p = Human.restPose(); p.spine.lat = 20; return Human.Skeleton.pose(sk, p).P[I.head][0] > 0 ? 1 : -1; })();
    const stance = 0.34 * sk.M.S / 1756, lean = k.lean, ext = clamp(k.ext, 0.7, 0.96), low = clamp(1 - ext, 0.04, 0.24);
    const p = copy(prev || M.SKI);
    p.root.rot = [14 + 22 * low + (k.tilt || 0), 0, -s.roll * 0.35 * lean]; p.root.pos = [0, 0, 0];
    const hipW = [Math.sin(lean * D) * ext * legLen, Math.cos(lean * D) * ext * legLen, (k.fore || 0) * legLen];
    const X = () => Human.Skeleton.pose(sk, p), at = (xf, n) => xf.P[I[n]];
    { const xf = X(), d = V.sub(at(xf, 'thigh_L'), at(xf, 'thigh_R')); if ((d[1] > 0) === (lean > 0)) p.root.rot[2] = -p.root.rot[2]; }
    // the pelvis faces down the fall line (+z); only the legs turn the skis under it (user 2026-11-17: a good skier turns by moving the centre
    // of mass; the body does not turn with the skis, it only sways side to side). The root's lean is a roll after the forward pitch, and a
    // roll of a body bent forward also turns it: the pelvis and chest swung 21 deg each way, more than the skis (15), and led every turn.
    // The root's yaw takes that turn back out
    { const pyaw = () => { const xf = X(), d = V.sub(at(xf, 'thigh_L'), at(xf, 'thigh_R')); return Math.atan2(-d[2], d[0]) / D; };
      for (let it = 0; it < 3; it++) { const e0 = pyaw(); if (Math.abs(e0) < 0.2) break; p.root.rot[1] += 1; const g = pyaw() - e0; p.root.rot[1] -= 1; if (Math.abs(g) < 1e-3) break; p.root.rot[1] -= e0 / g; }
      // (Motion's ski solver sets the root's yaw from the skis' heading: it keeps this fix, and turns the pelvis only `pelvisYaw` of the heading;
      // the hips turn the skis the rest. It had turned the whole pelvis to face between the skis)
      p.yawFix = p.root.rot[1]; p.pelvisYaw = set.style && set.style.pelvisYaw != null ? set.style.pelvisYaw : 0.3; }
    for (const sd of ['L', 'R']) {
      const foot = [(sd === 'L' ? 1 : -1) * stance / 2, 0, 0];
      { const xf = X(), mid = V.lerp(at(xf, 'thigh_L'), at(xf, 'thigh_R'), 0.5), hip = V.sub(at(xf, 'thigh_' + sd), mid);
        const d = Human.q.rot(Human.q.conj(xf.R[I.pelvis]), V.sub(V.sub(foot, hipW), hip)), tl = V.len(V.sub(J('shin_L'), J('thigh_L'))), sl = legLen - tl, r = Math.min(V.len(d), legLen * 0.999);
        const knee = 180 - Math.acos(clamp((tl * tl + sl * sl - r * r) / (2 * tl * sl), -1, 1)) / D, al = Math.acos(clamp((tl * tl + r * r - sl * sl) / (2 * tl * r), -1, 1)) / D;
        Object.assign(p['leg_' + sd], { flex: Math.atan2(d[2], -d[1]) / D + al, abd: Math.atan2(d[0] * (sd === 'L' ? 1 : -1), -d[1]) / D, rot: 0, knee }); }
      Object.assign(p['leg_' + sd], { ankle: -24, inv: 0, toe: 0 });
      descend(p, [[q => q['leg_' + sd], 'flex'], [q => q['leg_' + sd], 'abd'], [q => q['leg_' + sd], 'rot'], [q => q['leg_' + sd], 'knee']], () => { const xf = X();
        const mid = V.lerp(at(xf, 'thigh_L'), at(xf, 'thigh_R'), 0.5), a = V.sub(at(xf, 'talus_' + sd), mid), t = V.sub(foot, hipW);
        const c = M.contacts(sk, xf), o = sd === 'L' ? 0 : 3, f = V.sub(c[o + 1], c[o]), ski = 1 - f[2] / Math.hypot(f[0], f[2]);
        return V.dot(V.sub(a, t), V.sub(a, t)) * 3000 + ski; }, 3);
      for (const q of ['flex', 'abd', 'rot', 'knee']) { const R = Human.ROM.leg[q]; p['leg_' + sd][q] = clamp(p['leg_' + sd][q], R[0], R[1]); }
      descend(p, [[q => q['leg_' + sd], 'ankle']], () => { const c = M.contacts(sk, X()), o = sd === 'L' ? 0 : 3; return (c[o + 1][1] - c[o][1]) ** 2; }, 8);
      p['leg_' + sd].ankle = clamp(p['leg_' + sd].ankle, Human.ROM.leg.ankle[0], Human.ROM.leg.ankle[1]);
    }
    p.spine = { flex: 18 + 30 * low, lat: -latSign * (k.ang || 0) * lean, twist: -s.twist * (k.twist || 0) };
    p.neck = { flex: -(14 + 30 * low), lat: -latSign * (k.head == null ? 0.5 : k.head) * 0.5 * lean, yaw: -s.neck * 0.3 * (k.twist || 0) };
    const A = set.stance.arms, base = { elev: A.elev, plane: A.plane, elbow: A.elbow, pron: 30, grip: 1, thumb: 0.7, wdev: 10 };
    // (the outside arm of a left turn is the right one)
    Object.assign(p.arm_R, base, k.out || {}); Object.assign(p.arm_L, base, k.in || {});
    return p;
  }
  const mirror = p => { const q = copy(p);
    [q.arm_L, q.arm_R] = [q.arm_R, q.arm_L]; [q.leg_L, q.leg_R] = [q.leg_R, q.leg_L];
    q.spine.lat = -q.spine.lat; q.spine.twist = -q.spine.twist; q.neck.lat = -q.neck.lat; q.neck.yaw = -q.neck.yaw;
    q.root.rot = [q.root.rot[0], -q.root.rot[1], -q.root.rot[2]]; if (q.yawFix) q.yawFix = -q.yawFix; q.root.pos = [-q.root.pos[0], q.root.pos[1], q.root.pos[2]]; return q; };

  // ---- the set, solved once per skeleton and per set (a few hundred ms)
  const cache = new WeakMap();
  function solved(sk, set) {
    const key = JSON.stringify([set.stance, set.slow, set.fast, (set.style || {}).elbowMax, (set.style || {}).handUp, (set.style || {}).handOut, set.gear]);
    if (!cache.has(sk)) cache.set(sk, new Map()); const C = cache.get(sk);
    if (C.has(key)) return C.get(key);
    const st = build(sk, { lean: 0, ext: set.stance.ext, fore: set.stance.fore, tilt: set.stance.tilt, ang: 0, twist: 0, head: 0.5, out: {}, in: {} }, set);
    const one = keys => { const out = []; let prev = st; for (const k of keys) { prev = build(sk, k, set, prev); out.push(prev); }
      return { poses: out.concat(out.map(mirror)), heading: keys.map(k => k.heading || 0).concat(keys.map(k => -(k.heading || 0))) }; };
    const r = { stance: st, slow: one(set.slow), fast: one(set.fast) };
    // ---- the arms set by where the hands must be (photos of skiers, see sources in the thread: standing ready and skiing, the hands are at
    // the waist in front of the hips, elbows only a little bent, ready to touch a pole at any moment; the keys had been written as angles and
    // left the hands down at the hip joints with the elbows at 70 deg and the trunk bent over them).
    //   elbowMax  the stance's elbow is brought down to this (deg), every key by the same amount, so a turn's own arm motion is kept
    //   handUp    then the shoulders lift every arm by one amount, so the stance's wrists are this high over the hip joints (m)
    const y = set.style || {}, em = y.elbowMax != null ? y.elbowMax : 50, hu = y.handUp != null ? y.handUp : 0.1;
    const all = [st, ...r.slow.poses.slice(0, set.slow.length), ...r.fast.poses.slice(0, set.fast.length)];
    // handFwdM: and this far in front of the hip joints (m). The elbow and the arm's lift are found together for both (2026-11-17 22:33, owner:
    // "胳膊的动作还是不对", screenshot of a turn): with the elbow only capped at 50 deg and the lift alone set by the height, the fists had ended
    // 59 cm in front of the hips with nearly straight arms, held out like a rail. Good carvers (Reilly McGlashan, frames from his Hokkaido
    // video) keep the upper arms near the trunk, the elbows bent and the fists about a forearm in front of the body at the height of the hips
    const hf = y.handFwdM != null ? y.handFwdM : 0.36;
    const I = sk.idx, at = p => { const xf = Human.Skeleton.pose(sk, p), hc = V.lerp(xf.P[I.thigh_L], xf.P[I.thigh_R], 0.5), h = V.lerp(xf.P[I.hand_L], xf.P[I.hand_R], 0.5); return [h[1] - hc[1], h[2] - hc[2]]; };
    let dB = 0, dE = 0; { let best = 1e9; const t = copy(st);
      for (let b = -30; b <= 50; b += 2) for (let d = -40; d <= 40; d += 2) { for (const sd of ['L', 'R']) { t['arm_' + sd].elbow = Math.max(0, st['arm_' + sd].elbow + b); t['arm_' + sd].elev = st['arm_' + sd].elev + d; }
        const [u, f] = at(t), e = (u - hu) ** 2 + (f - hf) ** 2 + 0.000004 * (st.arm_L.elbow + b - Math.max(em, 70)) ** 2; if (e < best) { best = e; dB = b; dE = d; } } }
    for (const p of all) for (const sd of ['L', 'R']) { p['arm_' + sd].elbow = Math.max(0, p['arm_' + sd].elbow + dB); p['arm_' + sd].elev += dE; }
    // handOut: the stance's wrists this far out from the middle of the hips (m), every key turned out by the same plane angle. Photos of skiers
    // (giant slalom and carving, front and three-quarter, Mac shots 2026-11-17): the fists are wider than the body, so from behind both are seen
    // beside the trunk and a trailing shaft runs down outside the legs; at 33 cm (two fists 1.85 shoulders apart) they hid in front of the trunk
    if (set.gear !== 'board') { const ho = y.handOut != null ? y.handOut : 0.3, outOf = p => { const xf = Human.Skeleton.pose(sk, p), hc = V.lerp(xf.P[I.thigh_L], xf.P[I.thigh_R], 0.5); return (Math.abs(xf.P[I.hand_L][0] - hc[0]) + Math.abs(xf.P[I.hand_R][0] - hc[0])) / 2; };
      let dP = 0, best = 1e9; const t = copy(st); for (let d = -30; d <= 10; d += 1) { t.arm_L.plane = st.arm_L.plane + d; t.arm_R.plane = st.arm_R.plane + d; const e = Math.abs(outOf(t) - ho); if (e < best) { best = e; dP = d; } }
      for (const p of all) { p.arm_L.plane += dP; p.arm_R.plane += dP; } }
    r.slow.poses = r.slow.poses.slice(0, set.slow.length); r.slow.poses = r.slow.poses.concat(r.slow.poses.map(mirror));
    r.fast.poses = r.fast.poses.slice(0, set.fast.length); r.fast.poses = r.fast.poses.concat(r.fast.poses.map(mirror));
    // ---- standing still, ready to go (photos: the body tall, the fists closed on the grips in front of the hips, the poles near upright and a
    // little back, tips beside the boots): a taller stance, and the arms found so the wrists are at the height a shaft about 20 deg off upright
    // reaches from the snow (the pole is 0.68 x stature, gripped 6 cm down) and about 22 cm ahead of the hip joints
    { const rd = build(sk, { lean: 0, ext: 0.97, fore: 0, tilt: -8, ang: 0, twist: 0, head: 0.5, out: {}, in: {} }, set), fl = Math.min(...Human.Motion.contacts(sk, Human.Skeleton.pose(sk, rd)).map(v => v[1]));
      const want = fl + (0.68 * sk.M.S / 1000 - 0.06) * Math.cos(20 * Math.PI / 180) + 0.02;
      // (and the elbows a little out, relaxed: Henrik Harlaut standing on planted poles, owner 2026-11-17 "两个肘要稍微往外翻…放松": the arm
      // had been searched in one plane, 80 deg, and came out with the elbows only 3 cm outside the shoulders, held in against the trunk.
      // Now the plane and the upper arm's roll are searched too, for elbows about 5 cm outside the shoulders, the fists at least 20 cm out from the middle)
      let best = 1e9, pick = null; const t = copy(rd);
      for (let pl = 45; pl <= 80; pl += 5) for (let ax = -30; ax <= 10; ax += 10) for (let e = 10; e <= 80; e += 3) for (let b = 20; b <= 100; b += 3) {
        for (const sd of ['L', 'R']) Object.assign(t['arm_' + sd], { elev: e, elbow: b, plane: pl, axial: ax });
        const xf = Human.Skeleton.pose(sk, t), hc = V.lerp(xf.P[I.thigh_L], xf.P[I.thigh_R], 0.5), h = xf.P[I.hand_L], el = xf.P[I.forearm_L], sh = xf.P[I.upperarm_L];
        const so = Math.sign(sh[0] - hc[0]) || 1, eo = so * (el[0] - sh[0]), ho = so * (h[0] - hc[0]);
        const err = (h[1] - want) ** 2 * 4 + (h[2] - hc[2] - 0.22) ** 2 + (eo - 0.05) ** 2 * 2 + Math.max(0, 0.2 - ho) ** 2 * 2 + 0.00002 * (b - 55) ** 2;
        if (err < best) { best = err; pick = [e, b, pl, ax]; } }
      for (const sd of ['L', 'R']) Object.assign(rd['arm_' + sd], { elev: pick[0], elbow: pick[1], plane: pick[2], axial: pick[3], grip: 1, thumb: 0.7 });
      rd.poleRest = 1; rd.plant = [0, 0]; rd.plantAt = 0.3; r.ready = rd; }
    if (C.size > 24) C.clear(); C.set(key, r); return r;
  }

  // ---- mixing pose trees (every number, weighted)
  function wsum(trees, w) {
    const t0 = trees[0];
    if (typeof t0 === 'number') { let s = 0; for (let i = 0; i < trees.length; i++) s += trees[i] * w[i]; return s; }
    if (Array.isArray(t0)) return t0.map((_, j) => wsum(trees.map(t => t[j]), w));
    if (t0 && typeof t0 === 'object') { const o = {}; for (const k in t0) o[k] = wsum(trees.map(t => t[k]), w); return o; }
    return t0;
  }
  // periodic Catmull-Rom over n evenly spaced keys
  const cr = (arr, x) => { const n = arr.length, i = Math.floor(x) % n, t = x - Math.floor(x), t2 = t * t, t3 = t2 * t, P = k => arr[((i + k) % n + n) % n];
    return [[P(-1), P(0), P(1), P(2)], [(-t + 2 * t2 - t3) / 2, (2 - 5 * t2 + 3 * t3) / 2, (t + 4 * t2 - 3 * t3) / 2, (-t2 + t3) / 2]]; };
  const at = (S, phi) => { const x = (((phi % 1) + 1) % 1) * S.poses.length, [P, w] = cr(S.poses, x), [H] = cr(S.heading, x); return { pose: wsum(P, w), heading: wsum(H, w) }; };
  // the apex is held a little and the edge change is quick: the phase is slowed around each apex (0.25, 0.75) by `dwell`
  const warp = (phi, dwell) => phi - dwell * Math.sin(4 * Math.PI * (phi - 0.25)) / (4 * Math.PI);

  // ---- snowboard keys: written straight as joint angles (the bindings are solved by Motion afterwards, as for the lab's board clips)
  function buildBoard(sk, k) {
    const s = signs(sk), p = Human.restPose();
    p.root.rot = [k.tilt, 0, 0];
    Object.assign(p.leg_L, { flex: k.hip, knee: k.kneeF, ankle: k.ankleF, abd: 6, rot: 0 }); Object.assign(p.leg_R, { flex: k.hip, knee: k.kneeR, ankle: k.ankleR, abd: 6, rot: 0 });
    p.spine.flex = k.spine; p.spine.twist = -s.twist * (k.twist == null ? 18 : k.twist); p.neck.yaw = s.neck * (k.look == null ? 65 : k.look);
    p.neck.flex = k.neckFlex != null ? k.neckFlex : -k.spine * 0.5 - k.tilt * 0.4;
    p.neck.lat = k.neckLat != null ? k.neckLat : k.tilt > 0 ? Math.max(-35, Math.min(35, 0.8 * k.tilt)) : 0;
    const arm = a => ({ elev: a.elev, plane: a.plane, elbow: a.elbow, pron: 30, grip: 0.4, thumb: 0.3 });
    Object.assign(p.arm_L, arm(k.front)); Object.assign(p.arm_R, arm(k.rear));
    return p;
  }
  function solvedBoard(sk, set) {
    const b = set.board, key = 'b' + JSON.stringify(b.stance) + JSON.stringify([b.slow, b.fast]);
    if (!cache.has(sk)) cache.set(sk, new Map()); const C = cache.get(sk);
    if (C.has(key)) return C.get(key);
    const one = keys => ({ poses: keys.map(k => buildBoard(sk, k)), heading: keys.map(() => 0) });
    const r = { stance: buildBoard(sk, b.stance), slow: one(b.slow), fast: one(b.fast) };
    if (C.size > 24) C.clear(); C.set(key, r); return r;
  }

  // ---- the arms through a turn, from a good carver's own (owner 2026-11-17 22:41: "胳膊现在滑行转弯的过程都不对"). Read off Reilly McGlashan's
  // Hokkaido carving video, front on, a whole turn every quarter second (ski/motion-tune/参考_Reilly转弯手臂.jpg): between turns, standing
  // taller, both fists are in front at the height of the hips, a little wider than the shoulders, elbows bent; into the turn the inside arm
  // goes long and down along the leaning body until the fist is by the inside knee, near the snow in a deep carve, while the outside arm
  // reaches forward and out at the height of the chest, nearly straight, poles trailing; out of the turn both come back to the front. The
  // keys had held the arms at the stance (armQuiet) or swung them by angles, and no rule ever put a fist where his are.
  // Targets: from each shoulder, in the trunk's frame (out from the body, up along the spine, forward of the chest), metres.
  // (2026-11-17 23:15, measured in the game: the fists reached these targets to 2-6 cm, yet beside his frames the outside arm still read short and
  // bent; his outside arm at the apex is out about as far as it is forward, at shoulder height, near straight, and his inside fist is by the
  // knee, not below it, so the inside pole, which may not go under the snow, is not laid flat)
  const ARM_REF = { mid: [0.12, -0.38, 0.28], inside: [0.14, -0.46, 0.24], outside: [0.40, -0.10, 0.42] };
  function armsByRef(sk, q, phase, k) {
    const I = sk.idx, xf0 = Human.Skeleton.pose(sk, q), R = xf0.R[I.thorax_hi], Q = Human.q, ax = [Q.rot(R, [1, 0, 0]), Q.rot(R, [0, 1, 0]), Q.rot(R, [0, 0, 1])];
    const sn = Math.sin(2 * Math.PI * phase), wIn = { L: k * Math.pow(Math.max(0, sn), 1.3), R: k * Math.pow(Math.max(0, -sn), 1.3) };
    for (const sd of ['L', 'R']) {
      const o = sd === 'L' ? 1 : -1, wi = wIn[sd], wo = wIn[sd === 'L' ? 'R' : 'L'], m = ARM_REF.mid;
      const loc = [0, 1, 2].map(j => m[j] + (ARM_REF.inside[j] - m[j]) * wi + (ARM_REF.outside[j] - m[j]) * wo);
      const sh = xf0.P[I['upperarm_' + sd]], tgt = [0, 1, 2].map(c => sh[c] + ax[0][c] * o * loc[0] + ax[1][c] * loc[1] + ax[2][c] * loc[2]);
      const a = q['arm_' + sd], keys = ['elev', 'plane', 'elbow'], lo = [0, -60, 5], hi = [170, 135, 150];
      const hand = () => Human.Skeleton.pose(sk, q).P[I['hand_' + sd]], res = h => [h[0] - tgt[0], h[1] - tgt[1], h[2] - tgt[2]];
      // (a few damped Gauss-Newton steps on the arm's three angles; the trunk and the shoulder do not move with them)
      for (let it = 0; it < 6; it++) {
        const r0 = res(hand()); if (Math.hypot(...r0) < 0.005) break;
        const Jc = keys.map(f => { const v = a[f]; a[f] = v + 1; const r = res(hand()); a[f] = v; return [0, 1, 2].map(c => r[c] - r0[c]); });
        const A = [0, 1, 2].map(i => [0, 1, 2].map(j => Jc[i][0] * Jc[j][0] + Jc[i][1] * Jc[j][1] + Jc[i][2] * Jc[j][2] + (i === j ? 1e-5 : 0))), b = [0, 1, 2].map(i => -(Jc[i][0] * r0[0] + Jc[i][1] * r0[1] + Jc[i][2] * r0[2]));
        const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
        const D = det(A); if (!(Math.abs(D) > 1e-14)) break;
        keys.forEach((f, i) => { const Mi = A.map((row, r) => row.map((x, c) => c === i ? b[r] : x)); const d = Math.max(-25, Math.min(25, det(Mi) / D)); a[f] = Math.max(lo[i], Math.min(hi[i], a[f] + d)); });
      }
    }
  }

  // ---- the pose for one moment
  // phase, amp (0..1), speed (0..1); returns { pose, heading } for Motion's ski solver
  // gear 'board': the four board keys run once round the phase (toe edge at 0.25, heel edge at 0.75); the board has no mirror
  function pose(sk, set, phase, amp, speed, gear, rest) {
    const S = gear === 'board' ? solvedBoard(sk, set) : solved(sk, set), y = set.style, w = clamp(speed, 0, 1);
    const ph = g => warp(phase - g, y.dwell);
    const mixed = g => { const a = at(S.slow, ph(g)), b = at(S.fast, ph(g)); return { pose: wsum([a.pose, b.pose], [1 - w, w]), heading: a.heading * (1 - w) + b.heading * w }; };
    const base = mixed(0), tr = y.lagTrunk ? mixed(y.lagTrunk) : base, ar = y.lagArms ? mixed(y.lagArms) : base;
    const p = base.pose; p.spine = tr.pose.spine; p.neck = tr.pose.neck; p.arm_L = ar.pose.arm_L; p.arm_R = ar.pose.arm_R;
    // amplitude and exaggeration: everything is the stance plus the turn's difference from it, scaled
    const k = clamp(amp, 0, 1) * y.exag, q = wsum([S.stance, p], [1 - k, k]);
    // the upper body kept quiet: the trunk's and the head's part of the turn is taken back toward the stance
    if (y.quiet) for (const part of ['spine', 'neck']) for (const f in q[part]) q[part][f] = S.stance[part][f] + (q[part][f] - S.stance[part][f]) * (1 - y.quiet);
    // quiet hands (PSIA-NW "The Touch Zone", youcanski.com pole touch): a good skier's hands stay forward and wide where the eyes can see them
    // turn after turn; the trunk carries them through the turn. Written per key, each arm swung up and back by itself (the inside hand fell back
    // and bent 60 -> 88 deg every turn while the outside one rose: a seesaw of the arms, the "dropped inside hand" coaches correct). `armQuiet`
    // takes that share of the arms' own turn back to the stance (0.35: an arm keeps most of its turn, but no seesaw). In the game the turns had
    // also run backwards (Turn.track), which made the arms lead the body instead of following it
    const aq = y.armQuiet != null ? y.armQuiet : 0.35, ref = gear !== 'board' && y.armRef !== 0;
    if (aq && !ref) for (const sd of ['L', 'R']) for (const f of ['elev', 'plane', 'elbow']) { const a = q['arm_' + sd], s0 = S.stance['arm_' + sd][f]; a[f] = s0 + (a[f] - s0) * (1 - aq); }
    // (no hand falls behind its stance: the dropped inside hand is the error coaches correct; a hand may come forward and up, not back)
    if (ref) armsByRef(sk, q, phase - (y.lagArms || 0), k);
    if (gear !== 'board' && !ref) for (const sd of ['L', 'R']) { const a = q['arm_' + sd], s0 = S.stance['arm_' + sd]; if (a.elev < s0.elev) { const d = s0.elev - a.elev; a.elev = s0.elev; a.elbow = Math.max(s0.elbow - 10, a.elbow - 0.5 * d); } }
    // the pole touch: the only thing a skier's hand does by itself. Just before each crossover the hand on the inside of the coming turn (the
    // downhill hand: the left one before a left turn at phase 0, the right one at 0.5) reaches a little forward and down, the tip touches the
    // snow beside the ski's front at the crossover and the hand moves on forward (it is not left behind). Scaled by the turn's amplitude.
    if (gear !== 'board') { const pt = (y.poleTouch != null ? y.poleTouch : 1) * k, sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
      const bump = c => { const u = ((phase - c) % 1 + 1.5) % 1 - 0.5; return sm(-0.13, -0.04, u) * (1 - sm(0.02, 0.1, u)); };
      // (the tip touches beside the toe of the binding, not out at the ski's front: the hand is ahead of it, so the shaft only swings from
      // trailing to steep and back; aimed at the ski's front it had to swing past the hand, and fell back through the side in one frame)
      const pl = [bump(0) * pt, bump(0.5) * pt]; q.plant = pl; q.plantAt = 0.3;
      ['L', 'R'].forEach((sd, i) => { const a = q['arm_' + sd]; a.elev += 6 * pl[i]; a.elbow -= 6 * pl[i]; a.wdev = (a.wdev || 0) - 15 * pl[i]; }); }
    for (const sd of ['L', 'R']) { q['arm_' + sd].elev += y.handFwd; q['arm_' + sd].plane -= gear === 'board' ? -y.handWide : y.handWide; }
    // standing still (`rest` 1, given by the game at a stop): the poles stand near upright just behind the hands, fists closed on the grips
    if (gear !== 'board' && rest > 0) { const w = Math.min(1, rest); const qq = wsum([q, S.ready], [1 - w, w]); qq.poleRest = w; return { pose: qq, heading: base.heading * k * (1 - w) }; }
    return { pose: q, heading: base.heading * k };
  }

  // ---- a timeline to look at it by (the tuning page and the check tool use the same one)
  //   linked:  turns one after the other, `turn` seconds each
  //   release: one and a quarter cycles of linked turns, let go (the amplitude falls over a quarter cycle), glide, then turning again
  function timeline(o) {
    const Tc = 2 * o.turn, dur = o.mode === 'linked' ? Tc : 2 * Tc;
    const amp = t => { if (o.mode === 'linked') return 1; const c = t / Tc, e = x => x * x * (3 - 2 * x);
      return c < 1.25 ? 1 : c < 1.5 ? 1 - e((c - 1.25) / 0.25) : c < 1.75 ? 0 : e((c - 1.75) / 0.25); };
    return { dur, phase: t => t / Tc, amp };
  }
  // a clip for Human.Motion (so the lab plays it and its solver puts the skis parallel and on the snow)
  function clip(getSet, o) {
    const tl = timeline(o);
    const gear = o.gear === 'board' ? 'board' : 'ski';
    return { name: 'turnfn', zh: '调教中的转弯', group: 'tune', gear, dur: tl.dur, lazy: true,
      at: (u, sk) => { const t = u * tl.dur, r = pose(sk, getSet(), tl.phase(t), tl.amp(t), o.speed, gear); return gear === 'board' ? { pose: r.pose } : { pose: r.pose, heading: r.heading }; } };
  }

  // ---- in a game: the phase and the amplitude from the lean alone
  // The lean and its rate are a point going round a circle (lean = A cos, rate = -A w sin): the radius is the amplitude, the angle the phase.
  // ref = how deep a full turn leans (rad), w = how fast turns go (rad/s). Letting go: the lean falls to 0 with its rate, the radius with them.
  function track(S, lean, dt, ref, w) {
    if (S.prev == null || !(dt > 0)) { S.prev = lean; S.rate = 0; return { amp: Math.min(1, Math.abs(lean) / ref), phase: lean >= 0 ? 0.25 : 0.75 }; }
    const r = (lean - S.prev) / dt; S.prev = lean; S.rate += (r - S.rate) * (1 - Math.exp(-dt / 0.05));
    const x = lean / ref, y = -S.rate / (w * ref);
    // (phase 0.25 = apex of a left turn = most lean to the left. lean = A cos th, rate = -A w sin th with th = 2 pi (phase - 0.25), so
    // y = A sin th / ref and phase = 0.25 + th / 2 pi. It was 0.25 - th / 2 pi: every turn ran backwards in the game, exit before entry, the arms'
    // lag became a lead, and a turn started from straight began at the far end (0.45) of the turn and wound back to its apex)
    return { amp: Math.min(1, Math.hypot(x, y)), phase: ((0.25 + Math.atan2(y, x) / (2 * Math.PI)) % 1 + 1) % 1 };
  }

  Human.Turn = { SET0, KEYS, BKEYS, pose, solved, solvedBoard, timeline, clip, track, mirror, copy };
})();

// ---------------------------------------------------------------- Human.Moves: jumps, air tricks and party tricks from a few numbers per move
// A move is not a list of frames: it is its intent, and the timing comes from the body.
//   load    0..1  how deep the rider sinks before the pop. The pop height follows from it (deeper = higher), plus `kick` (m) from a lip or side hit
//   air     true for a jump; false for a trick done on the snow (a butter, a ground spin): it then takes `groundT` seconds
//   spin / flip   degrees turned about the vertical / tipped over (back flip negative), spread over the air
//   keys    the shape in the air (or through the ground trick), at fractions u of it: tuck, spread, split, cross, twist, shifty, fore, grab, arms, head
// From these: the take-off comes after the sink and a 0.12 s push; the air time is the fall from the height (t = sqrt(8h/g)); the landing sinks fast
// (0.12 s) and as deep as the height asks (landK), then rises slowly back to riding. So a high jump lands deep and a hop lands soft, by construction.
(() => {
  const M = Human.Motion, D = Math.PI / 180, clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const copy = o => JSON.parse(JSON.stringify(o));
  const F0 = { tuck: 0, spread: 0, split: 0, cross: 0, twist: 0, shifty: 0, fore: 0, grab: 0, head: 0, armL: null, armR: null };
  // (fitted 2026-11-17 to the reference clips, tricks_summary.txt: legs nearly straight at take-off (knee 12-30 deg on flat ground), the deepest
// knee after touch-down reached 0.25-0.75 s later at real speed (fastest at touch-down), board landings deeper than ski ones (knee 63-107 vs 40-106))
//   pre   how far the legs straighten at take-off, below the riding depth (ski / board)      landB  board landings this much deeper
const STYLE0 = { pop: 0.45, landK: 1, landB: 1.25, ride: 0.15, lead: 0.5, loadT: 0.35, popT: 0.12, absorbT: 0.3, recoverT: 0.6, tail: 0.5, pre: -0.45, preB: -0.7 };

  // ---- the times of a move
  function timeline(m, st, gear) {
    const y = Object.assign({}, STYLE0, st || {}), g = 9.81;
    const t0 = y.lead, t1 = t0 + y.loadT * (0.4 + 0.6 * (m.load || 0)), to = t1 + y.popT;
    const h = m.air === false ? 0 : (m.kick || 0) + y.pop * Math.pow(m.load || 0, 1.2), T = m.air === false ? (m.groundT || 0.9) : Math.sqrt(8 * h / g);
    const ld = to + T, board = gear === 'board', landC = m.air === false ? y.ride + 0.1 : clamp((0.08 + 0.55 * Math.pow(h, 0.7)) * y.landK * (board ? y.landB : 1), 0.15, 0.97);
    const a1 = ld + y.absorbT, r1 = a1 + y.recoverT * (0.6 + 0.6 * landC), dur = r1 + y.tail;
    return { y, t0, t1, to, ld, a1, r1, dur, h, T, landC, pre: board ? y.preB : y.pre };
  }
  // how deep the body is (0 stand tall .. 1 deepest), through the move
  function crouch(L, m, t) {
    const y = L.y, pre = y.ride + L.pre;
    if (t < L.t0) return y.ride;
    if (t < L.t1) return y.ride + ((m.load || 0) * 0.85 + 0.1 - y.ride) * sm((t - L.t0) / (L.t1 - L.t0));
    const lo = (m.load || 0) * 0.85 + 0.1;
    if (t < L.to) { const x = (t - L.t1) / (L.to - L.t1); return lo + (pre - lo) * (x * x * (3 - 2 * x)); }           // the push: legs straighten by take-off
    if (t < L.ld) return m.air === false ? pre + (y.ride - pre) * sm((t - L.to) / 0.2) : pre + (0.12 - pre) * sm((t - L.to) / 0.25);   // in the air the legs soften (tuck adds on top)
    const c0 = m.air === false ? y.ride : 0.12;
    if (t < L.a1) { const x = (t - L.ld) / (L.a1 - L.ld); return c0 + (L.landC - c0) * (1 - (1 - x) * (1 - x)); }   // the landing: fastest at touch-down
    if (t < L.r1) return L.landC + (y.ride - L.landC) * sm((t - L.a1) / (L.r1 - L.a1));
    return y.ride;
  }
  // the air shape at time t: the keys over the air (or the ground trick), faded in after take-off and out before touch-down
  function shape(L, m, t) {
    const K = (m.keys && m.keys.length ? m.keys : [{ u: 0.5 }]).map(k => Object.assign({}, F0, k)).sort((a, b) => a.u - b.u);
    const a = L.to, b = L.ld, u = clamp((t - a) / Math.max(1e-3, b - a), 0, 1);
    let i = 0; while (i < K.length - 1 && K[i + 1].u <= u) i++;
    const A = K[i], B = K[Math.min(i + 1, K.length - 1)], x = B.u > A.u ? sm((u - A.u) / (B.u - A.u)) : 0;
    const w = sm((t - (a - 0.06)) / 0.16) * (1 - sm((t - (b - 0.16)) / 0.18));
    const o = {}; for (const k in F0) { if (k === 'armL' || k === 'armR') continue; o[k] = ((+A[k] || 0) + ((+B[k] || 0) - (+A[k] || 0)) * x) * w; }
    for (const k of ['armL', 'armR']) { const p = A[k] || B[k] ? Object.assign({}, A[k] || B[k]) : null, q = B[k] || A[k];
      o[k] = p ? { w, v: Object.fromEntries(Object.keys(p).map(f => [f, p[f] + ((q && q[f] != null ? q[f] : p[f]) - p[f]) * x])) } : null; }
    o.w = w; return o;
  }

  // ---- the pose
  function at(sk, m, gear, t, st) {
    const L = timeline(m, st, gear), s = M.signs(sk), c = crouch(L, m, t), f = shape(L, m, t);
    const board = gear === 'board', p = board ? copy(M.sbOf(sk).P.ride) : copy(M.SKI), ride = L.y.ride;
    const dc = c - ride;
    for (const sd of ['L', 'R']) { const g = p['leg_' + sd];
      g.flex += (board ? 48 : 58) * dc + 50 * f.tuck; g.knee += (board ? 52 : 72) * dc + 55 * f.tuck; g.ankle -= (board ? 8 : 12) * Math.max(0, dc); g.ankle += 10 * Math.max(0, -dc);
      g.abd += f.spread; }
    // a daffy: one leg forward and straight, the other back; an iron cross: the legs turned in, tips crossed, tails up
    p.leg_L.flex += f.split; p.leg_R.flex -= f.split; if (f.split) { p.leg_L.knee = Math.max(4, p.leg_L.knee - Math.abs(f.split) * 0.8); }
    p.leg_L.rot += f.cross; p.leg_R.rot += f.cross;
    p.root.rot[0] += (board ? 6 : 9) * dc + f.fore; p.spine.flex += 12 * dc + 15 * f.tuck;
    p.spine.twist += -s.twist * f.twist; p.neck.yaw += s.neck * f.head;
    // board shifty: the lower body turns under a still chest; on skis the shifty is the skis' heading (below)
    if (board && f.shifty) { p.root.rot[1] += s.yaw * f.shifty; p.spine.twist -= s.twist * f.shifty * 0.9; p.neck.yaw -= s.neck * f.shifty * 0.9; }
    for (const [k, sd] of [['armL', 'L'], ['armR', 'R']]) if (f[k]) { const A = p['arm_' + sd]; for (const q in f[k].v) A[q] += (f[k].v[q] - A[q]) * f[k].w; }
    const r = { pose: p };
    if (m.air !== false && L.T > 0) r.lift = M.flight(t, L.to, L.ld);
    const sp = m.air === false ? sm((t - L.to) / Math.max(0.05, L.T)) : sm((t - (L.to - 0.03)) / Math.max(0.05, L.T - 0.05));
    if (m.spin) r.spin = m.spin * sp; if (m.flip) r.flip = m.flip * sp;
    if (!board) r.heading = f.shifty;
    if (board && f.grab) r.reach = { hand: f.grab > 0 ? 'R' : 'L', w: Math.min(1, Math.abs(f.grab)) * f.w };
    return r;
  }
  let ver = 0;
  function clip(m, gear, st) {
    const L = timeline(m, st, gear);
    // (a new name for every edit: Motion keeps solved frames and the centre-of-mass arc of an air by the clip's name)
    return { name: 'mv_' + (m.id || 'x') + '_' + gear + '_' + (++ver), zh: m.zh, group: 'tune', gear: gear === 'board' ? 'board' : 'ski', dur: L.dur, lazy: true, smooth: 0.8,
      at: (u, sk) => at(sk, m, gear, u * L.dur, st) };
  }

  // ---- a first library (fields: see the top). Arms in the air: elev, plane, elbow
  const out = { elev: 80, plane: 10, elbow: 25 }, bal = { elev: 55, plane: 45, elbow: 40 };
  // Fitted to the reference clips (Mac: 滑雪demo/motion_refs/tricks/tricks_summary.txt; tools/moves_check.js measures the same numbers here). The
  // clip each move follows is in `ref`. Flat-ground pops sink little and get their height from the tail's spring (kick), spins wind the shoulders
  // up against the hips before the pop and let them go in the air, grabs fold the legs to a knee of about 100 deg.
  const LIB = {
    board: [
      { id: 'ollie', zh: 'Ollie 平地跳', ref: 'SA 67.5 s：下蹲膝 29°，起跳 20°，空中 88-109°，落地 63-94°', load: 0.15, kick: 0.2,
        keys: [{ u: 0, tuck: 0.1, fore: -6 }, { u: 0.45, tuck: 0.7, armL: bal, armR: bal }, { u: 1, tuck: 0.15 }] },
      { id: 'nollie', zh: 'Nollie 板头起跳', ref: 'SA 110 s：下蹲 47°，起跳 24°，空中 104°，落地 90°', load: 0.25, kick: 0.15,
        keys: [{ u: 0, tuck: 0.1, fore: 8 }, { u: 0.45, tuck: 0.65, armL: bal, armR: bal }, { u: 1, tuck: 0.15 }] },
      { id: 'shifty', zh: 'Shifty 空中扭板', ref: 'SA 124 s（bs180 shifty）：下蹲 88°，空中 102°，上身对胯扭到 93°，落地 107°', load: 0.55,
        keys: [{ u: 0, tuck: 0.2 }, { u: 0.5, shifty: -85, twist: -50, tuck: 0.6 }, { u: 1, tuck: 0.2 }] },
      { id: 'fs180', zh: '正向 180', ref: 'SA 54.5 s：下蹲 52°，起跳 31°，空中 89°，肩先反拧 -27° 再领转到 +56°，落地 92°', load: 0.3, kick: 0.1, spin: 180,
        keys: [{ u: 0, tuck: 0.2, twist: 45 }, { u: 0.5, tuck: 0.55, head: 40, twist: -60 }, { u: 1, tuck: 0.15, twist: -20 }] },
      { id: 'bs180', zh: '反向 180', ref: 'SA 45 s（盲落地）：下蹲 86°，空中 92°，上身扭到 +37°，落地 66°', load: 0.5, spin: -180,
        keys: [{ u: 0, tuck: 0.2, twist: -15 }, { u: 0.5, tuck: 0.55, head: -40, twist: -35 }, { u: 1, tuck: 0.15 }] },
      { id: 'indy', zh: 'Indy 抓板（小跳台）', ref: 'ProCamp 31.5 s：下蹲 62°，起跳 26°，空中 99°，上身扭 +30~42°，落地 96°', load: 0.3, kick: 0.6,
        keys: [{ u: 0, tuck: 0.2, twist: -20 }, { u: 0.3, tuck: 0.75, grab: 1, twist: -35 }, { u: 0.7, tuck: 0.75, grab: 1, twist: -35 }, { u: 1, tuck: 0.2, twist: -20 }] },
      { id: 'method', zh: 'Method 抓板', ref: 'SA 12.9 s + TransWorld 13.8 s：下蹲 71°，空中 97°，上身扭到 +77°，落地 70°', load: 0.55, kick: 0.45,
        keys: [{ u: 0, tuck: 0.2, twist: -10 }, { u: 0.35, tuck: 0.7, grab: -1, fore: -18, twist: -85, armR: out }, { u: 0.65, tuck: 0.7, grab: -1, fore: -18, twist: -85, armR: out }, { u: 1, tuck: 0.2 }] },
      { id: 'fs360', zh: '侧坡正向 360', ref: 'SA 96 s（360 抓板）：下蹲 58°，空中 104°，肩 -20° 反拧后领转到 +50°，落地 84°', load: 0.35, kick: 0.5, spin: 360,
        keys: [{ u: 0, tuck: 0.2, twist: 25 }, { u: 0.5, tuck: 0.75, grab: 1, twist: -45 }, { u: 1, tuck: 0.15, twist: -15 }] },
      { id: 'bs360', zh: '侧坡反向 360', ref: '按正向 360 镜像（SA 71 s 侧面慢放：下蹲 95°，空中 126°，落地 78°）', load: 0.7, kick: 0.5, spin: -360,
        keys: [{ u: 0, tuck: 0.2, twist: -25 }, { u: 0.5, tuck: 0.85, twist: 20 }, { u: 1, tuck: 0.15 }] },
      { id: 'butter180', zh: '平地 Butter 180（板尾）', ref: 'SA 84.5 s：下蹲 34°，最深 44°，上身 -21~+15°，收尾膝 61°', air: false, load: 0.1, spin: 180, groundT: 1.0,
        keys: [{ u: 0, fore: -10, twist: 20 }, { u: 0.5, fore: -14, twist: -15, armL: bal }, { u: 1, twist: 0 }] },
      { id: 'japan', zh: '平地 Drive Spin（日式 butter）', ref: '9.4 s：蹲 54°，上身 -44° 反拧再甩到 +55°', air: false, load: 0.35, spin: 360, groundT: 1.6,
        keys: [{ u: 0, fore: 10, twist: 60, tuck: 0.2 }, { u: 0.4, fore: 14, twist: -65, tuck: 0.3, armL: bal, armR: bal }, { u: 1, fore: 4, twist: -10 }] },
      { id: 'noseroll', zh: '板头 Nose Roll 360', ref: 'SA 5.0 s：蹲 22°，上身 -20~+23°', air: false, load: 0.05, spin: 360, groundT: 1.4,
        keys: [{ u: 0, fore: 12, twist: 20 }, { u: 0.5, fore: 16, twist: -20 }, { u: 1, fore: 4 }] },
      { id: 'tailpress', zh: '板尾 Press', ref: 'SA 15.2 s：蹲 20°，上身扭 -46~+60°（压板时上身对着板头）', air: false, load: 0.05, groundT: 2.0,
        keys: [{ u: 0, fore: -6 }, { u: 0.25, fore: -18, twist: -40, armL: bal, armR: bal }, { u: 0.75, fore: -18, twist: -40, armL: bal, armR: bal }, { u: 1 }] },
      { id: 'bigland', zh: '大跳台落地（深蹲吸收）', ref: '没有好的实拍，按高度算', load: 0.6, kick: 2.2, keys: [{ u: 0, tuck: 0.2 }, { u: 0.5, tuck: 0.5, grab: 1 }, { u: 1, tuck: 0.1, armL: bal, armR: bal }] },
    ],
    ski: [
      { id: 'pop', zh: 'Ollie 平地小跳', ref: 'Ski Addiction 77 s：几乎不蹲（膝 15-17°），尾巴弹起，空中收腿 83-107°，落地 85-106°', load: 0.05, kick: 0.25,
        keys: [{ u: 0, fore: -8 }, { u: 0.45, tuck: 0.75, fore: 4 }, { u: 1, tuck: 0.2 }] },
      { id: 'shifty', zh: 'Shifty 空中扭板', ref: 'Stomp It 219.5 s：下蹲 58°，起跳 18°，空中 105°，最高处上身反拧 49° 再摆正，落地 72°', load: 0.15, kick: 0.2,
        keys: [{ u: 0 }, { u: 0.5, shifty: 45, twist: -55, tuck: 0.55 }, { u: 1 }] },
      { id: 'spread', zh: 'Spread Eagle 大字', ref: '没有好的实拍（手机片太小）', load: 0.65, kick: 0.6, keys: [{ u: 0 }, { u: 0.4, spread: 32, armL: out, armR: out }, { u: 0.65, spread: 32, armL: out, armR: out }, { u: 1 }] },
      { id: 'daffy', zh: 'Daffy 前后劈腿', ref: '没有好的实拍', load: 0.65, kick: 0.6, keys: [{ u: 0 }, { u: 0.45, split: 38, armL: bal, armR: bal }, { u: 0.65, split: 38 }, { u: 1 }] },
      { id: 'ironcross', zh: 'Iron Cross 交叉', ref: '没有好的实拍', load: 0.65, kick: 0.6, keys: [{ u: 0 }, { u: 0.45, tuck: 0.5, cross: 22 }, { u: 0.65, tuck: 0.5, cross: 22 }, { u: 1 }] },
      { id: 'mute', zh: 'Mute / Safety 抓板', ref: 'Ski Addiction 2.9 s：下蹲 98°，空中 85°，上身扭到 +54°，落地 71°', load: 0.6, kick: 0.45,
        keys: [{ u: 0 }, { u: 0.4, tuck: 0.6, twist: -70, armR: { elev: 30, plane: 95, elbow: 20 } }, { u: 0.65, tuck: 0.6, twist: -70, armR: { elev: 30, plane: 95, elbow: 20 } }, { u: 1, twist: -20 }] },
      { id: 'spin360', zh: '侧坡 360', ref: 'Trifes 170.8 s：下蹲 56-82°，空中 123°，肩先反拧 -47° 再领转到 +31°，落地 80°、0.7 s 蹲到底', load: 0.35, kick: 0.5, spin: 360,
        keys: [{ u: 0, twist: 60 }, { u: 0.5, tuck: 1.15, head: 35, twist: -10 }, { u: 1, twist: -40 }] },
      { id: 'flat180', zh: '平地 180 转倒滑', ref: 'Empire 16.2 s：下蹲 26-34°，空中 34-68°，肩反拧 -37°，落地 40-61°', load: 0.05, kick: 0.15, spin: 180,
        keys: [{ u: 0, twist: 60 }, { u: 0.5, tuck: 0.3, head: 40, twist: 0 }, { u: 1, twist: -20 }] },
      { id: 'butter180', zh: '平地 Butter 180（板头）', ref: 'Ski Addiction 68.5 s：蹲很深 74°，上身 -10~+12°，收尾膝 79°', air: false, load: 0.3, spin: 180, groundT: 1.1,
        keys: [{ u: 0, fore: 8, twist: 12 }, { u: 0.5, fore: 12, twist: -10 }, { u: 1 }] },
      { id: 'nosebutter360', zh: '板头 Butter 360', ref: 'Empire 73.4 s：蹲 82°，低而连续地转，上身 -41~+8°，收尾膝 69°', air: false, load: 0.4, spin: 360, groundT: 1.8,
        keys: [{ u: 0, fore: 10, twist: 40, tuck: 0.15 }, { u: 0.5, fore: 14, twist: -5, tuck: 0.25, armL: bal, armR: bal }, { u: 1, fore: 6, twist: -10 }] },
      { id: 'tailpress', zh: '板尾 Press', ref: 'Stomp It 57 s：几乎站直（膝 12°），后压，收尾膝 34°', air: false, load: 0, groundT: 1.5,
        keys: [{ u: 0, fore: -6 }, { u: 0.25, fore: -16, armL: bal, armR: bal }, { u: 0.75, fore: -16, armL: bal, armR: bal }, { u: 1 }] },
      { id: 'bigland', zh: '大跳台落地（深蹲吸收）', ref: '没有好的实拍，按高度算', load: 0.6, kick: 2.2, keys: [{ u: 0 }, { u: 0.5, tuck: 0.4 }, { u: 1, armL: bal, armR: bal }] },
    ],
  };
  // VER: the library's version; the tuning page drops moves saved under an older one
  Human.Moves = { LIB, STYLE0, F0, timeline, at, clip, copy, VER: 2 };
})();

Human.Turn.PRESETS = [{"v":1,"stance":{"ext":0.9,"fore":-0.03,"tilt":0,"arms":{"elev":40,"plane":66,"elbow":70}},"slow":[{"lean":0,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-20,"out":{"elev":42,"plane":66,"elbow":72},"in":{"elev":42,"plane":66,"elbow":72}},{"lean":16,"ext":0.88,"fore":-0.03,"tilt":0,"ang":0.25,"twist":4,"head":0.5,"heading":-13,"out":{"elev":48,"plane":58,"elbow":64},"in":{"elev":38,"plane":72,"elbow":80}},{"lean":30,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.3,"twist":8,"head":0.5,"heading":0,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":34,"plane":74,"elbow":88}},{"lean":16,"ext":0.83,"fore":-0.03,"tilt":0,"ang":0.25,"twist":4,"head":0.5,"heading":13,"out":{"elev":48,"plane":58,"elbow":64},"in":{"elev":38,"plane":72,"elbow":80}}],"fast":[{"lean":0,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-12,"out":{"elev":44,"plane":64,"elbow":70},"in":{"elev":44,"plane":64,"elbow":70}},{"lean":24,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.3,"twist":3,"head":0.5,"heading":-8,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}},{"lean":44,"ext":0.82,"fore":-0.03,"tilt":0,"ang":0.35,"twist":6,"head":0.5,"heading":0,"out":{"elev":56,"plane":50,"elbow":56},"in":{"elev":32,"plane":76,"elbow":92}},{"lean":24,"ext":0.8,"fore":-0.03,"tilt":0,"ang":0.3,"twist":3,"head":0.5,"heading":8,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}}],"style":{"exag":1,"quiet":0,"handFwd":0,"handWide":0,"lagTrunk":0.02,"lagArms":0.05,"dwell":0.3},"board":{"stance":{"tilt":6,"hip":40,"kneeF":60,"kneeR":64,"ankleF":-24,"ankleR":-28,"spine":16,"twist":18,"look":65,"front":{"elev":40,"plane":10,"elbow":25},"rear":{"elev":35,"plane":0,"elbow":20}},"slow":[{"tilt":4,"hip":44,"kneeF":64,"kneeR":68,"ankleF":-24,"ankleR":-28,"spine":16,"twist":18,"look":65,"front":{"elev":38,"plane":20,"elbow":30},"rear":{"elev":34,"plane":12,"elbow":26}},{"tilt":38,"hip":42,"kneeF":80,"kneeR":84,"ankleF":-22,"ankleR":-32,"spine":16,"twist":18,"look":65,"front":{"elev":30,"plane":70,"elbow":48},"rear":{"elev":28,"plane":66,"elbow":48},"neckFlex":-20},{"tilt":4,"hip":44,"kneeF":64,"kneeR":68,"ankleF":-24,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":42,"plane":30,"elbow":36},"rear":{"elev":36,"plane":22,"elbow":30}},{"tilt":-28,"hip":54,"kneeF":76,"kneeR":80,"ankleF":-30,"ankleR":-33,"spine":10,"twist":18,"look":65,"front":{"elev":48,"plane":66,"elbow":58},"rear":{"elev":40,"plane":60,"elbow":40},"neckFlex":18,"neckLat":-14}],"fast":[{"tilt":2,"hip":46,"kneeF":68,"kneeR":72,"ankleF":-24,"ankleR":-28,"spine":16,"twist":18,"look":65,"front":{"elev":36,"plane":24,"elbow":32},"rear":{"elev":32,"plane":16,"elbow":28}},{"tilt":46,"hip":44,"kneeF":88,"kneeR":92,"ankleF":-22,"ankleR":-34,"spine":16,"twist":18,"look":65,"front":{"elev":26,"plane":76,"elbow":50},"rear":{"elev":24,"plane":72,"elbow":50},"neckFlex":-22},{"tilt":2,"hip":46,"kneeF":68,"kneeR":72,"ankleF":-24,"ankleR":-28,"spine":12,"twist":18,"look":65,"front":{"elev":44,"plane":34,"elbow":40},"rear":{"elev":38,"plane":26,"elbow":32}},{"tilt":-34,"hip":58,"kneeF":82,"kneeR":85,"ankleF":-33,"ankleR":-35,"spine":8,"twist":18,"look":65,"front":{"elev":50,"plane":70,"elbow":60},"rear":{"elev":42,"plane":62,"elbow":40},"neckFlex":20,"neckLat":-16}]},"name":"默认（第一版）"},{"v":1,"stance":{"ext":0.9,"fore":-0.03,"tilt":0,"arms":{"elev":40,"plane":66,"elbow":70}},"slow":[{"lean":0,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-20,"out":{"elev":44,"plane":60,"elbow":66},"in":{"elev":44,"plane":60,"elbow":66}},{"lean":22,"ext":0.87,"fore":-0.03,"tilt":0,"ang":0.35,"twist":4,"head":0.5,"heading":-13,"out":{"elev":52,"plane":50,"elbow":58},"in":{"elev":40,"plane":66,"elbow":70}},{"lean":40,"ext":0.85,"fore":-0.03,"tilt":0,"ang":0.45,"twist":8,"head":0.5,"heading":0,"out":{"elev":58,"plane":44,"elbow":50},"in":{"elev":36,"plane":62,"elbow":60}},{"lean":22,"ext":0.83,"fore":-0.03,"tilt":0,"ang":0.35,"twist":4,"head":0.5,"heading":13,"out":{"elev":52,"plane":50,"elbow":58},"in":{"elev":40,"plane":66,"elbow":70}}],"fast":[{"lean":0,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-12,"out":{"elev":46,"plane":58,"elbow":64},"in":{"elev":46,"plane":58,"elbow":64}},{"lean":38,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.45,"twist":4,"head":0.5,"heading":-8,"out":{"elev":56,"plane":44,"elbow":52},"in":{"elev":38,"plane":60,"elbow":56}},{"lean":64,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.5,"twist":8,"head":0.5,"heading":0,"out":{"elev":62,"plane":36,"elbow":44},"in":{"elev":30,"plane":52,"elbow":40}},{"lean":38,"ext":0.8,"fore":-0.03,"tilt":0,"ang":0.45,"twist":4,"head":0.5,"heading":8,"out":{"elev":56,"plane":44,"elbow":52},"in":{"elev":38,"plane":60,"elbow":56}}],"style":{"exag":1,"quiet":0,"handFwd":0,"handWide":0,"lagTrunk":0.03,"lagArms":0.06,"dwell":0.42},"board":{"stance":{"tilt":6,"hip":40,"kneeF":60,"kneeR":64,"ankleF":-24,"ankleR":-28,"spine":16,"twist":18,"look":65,"front":{"elev":40,"plane":10,"elbow":25},"rear":{"elev":35,"plane":0,"elbow":20}},"slow":[{"tilt":4,"hip":44,"kneeF":64,"kneeR":68,"ankleF":-24,"ankleR":-28,"spine":16,"twist":18,"look":65,"front":{"elev":38,"plane":22,"elbow":30},"rear":{"elev":34,"plane":14,"elbow":26}},{"tilt":44,"hip":44,"kneeF":72,"kneeR":90,"ankleF":-22,"ankleR":-32,"spine":26,"twist":18,"look":65,"front":{"elev":26,"plane":80,"elbow":36},"rear":{"elev":24,"plane":76,"elbow":38},"neckFlex":-22},{"tilt":4,"hip":44,"kneeF":64,"kneeR":68,"ankleF":-24,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":42,"plane":30,"elbow":36},"rear":{"elev":36,"plane":22,"elbow":30}},{"tilt":-30,"hip":58,"kneeF":70,"kneeR":84,"ankleF":-31,"ankleR":-33,"spine":14,"twist":18,"look":65,"front":{"elev":46,"plane":64,"elbow":58},"rear":{"elev":56,"plane":20,"elbow":34},"neckFlex":20,"neckLat":-15}],"fast":[{"tilt":2,"hip":48,"kneeF":66,"kneeR":72,"ankleF":-24,"ankleR":-28,"spine":18,"twist":18,"look":65,"front":{"elev":34,"plane":30,"elbow":34},"rear":{"elev":30,"plane":20,"elbow":30}},{"tilt":52,"hip":44,"kneeF":88,"kneeR":96,"ankleF":-22,"ankleR":-34,"spine":28,"twist":24,"look":65,"front":{"elev":18,"plane":92,"elbow":18},"rear":{"elev":16,"plane":88,"elbow":22},"neckFlex":-28},{"tilt":2,"hip":48,"kneeF":66,"kneeR":72,"ankleF":-24,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":44,"plane":34,"elbow":40},"rear":{"elev":38,"plane":26,"elbow":32}},{"tilt":-38,"hip":58,"kneeF":80,"kneeR":84,"ankleF":-33,"ankleR":-35,"spine":10,"twist":18,"look":65,"front":{"elev":46,"plane":60,"elbow":56},"rear":{"elev":70,"plane":-10,"elbow":20},"neckFlex":24,"neckLat":-18}]},"name":"深压刻滑（参考 Reilly McGlashan）"},{"v":1,"stance":{"ext":0.9,"fore":-0.03,"tilt":0,"arms":{"elev":40,"plane":66,"elbow":70}},"slow":[{"lean":0,"ext":0.85,"fore":-0.03,"tilt":0,"ang":0,"twist":0,"head":0.5,"heading":-22,"out":{"elev":38,"plane":70,"elbow":76},"in":{"elev":38,"plane":70,"elbow":76}},{"lean":20,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.04,"twist":2,"head":0.5,"heading":-15,"out":{"elev":42,"plane":64,"elbow":72},"in":{"elev":36,"plane":74,"elbow":82}},{"lean":34,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.05,"twist":4,"head":0.5,"heading":0,"out":{"elev":44,"plane":60,"elbow":70},"in":{"elev":34,"plane":76,"elbow":86}},{"lean":20,"ext":0.82,"fore":-0.03,"tilt":0,"ang":0.04,"twist":2,"head":0.5,"heading":15,"out":{"elev":42,"plane":64,"elbow":72},"in":{"elev":36,"plane":74,"elbow":82}}],"fast":[{"lean":0,"ext":0.83,"fore":-0.03,"tilt":0,"ang":0,"twist":0,"head":0.5,"heading":-14,"out":{"elev":40,"plane":68,"elbow":74},"in":{"elev":40,"plane":68,"elbow":74}},{"lean":30,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.05,"twist":2,"head":0.5,"heading":-9,"out":{"elev":44,"plane":62,"elbow":70},"in":{"elev":34,"plane":74,"elbow":84}},{"lean":58,"ext":0.8,"fore":-0.03,"tilt":0,"ang":0.05,"twist":4,"head":0.5,"heading":0,"out":{"elev":46,"plane":58,"elbow":68},"in":{"elev":30,"plane":78,"elbow":90}},{"lean":30,"ext":0.79,"fore":-0.03,"tilt":0,"ang":0.05,"twist":2,"head":0.5,"heading":9,"out":{"elev":44,"plane":62,"elbow":70},"in":{"elev":34,"plane":74,"elbow":84}}],"style":{"exag":1,"quiet":0.25,"handFwd":0,"handWide":0,"lagTrunk":0.05,"lagArms":0.09,"dwell":0.22},"board":{"stance":{"tilt":6,"hip":40,"kneeF":60,"kneeR":64,"ankleF":-24,"ankleR":-28,"spine":16,"twist":18,"look":65,"front":{"elev":40,"plane":10,"elbow":25},"rear":{"elev":35,"plane":0,"elbow":20}},"slow":[{"tilt":4,"hip":44,"kneeF":64,"kneeR":68,"ankleF":-24,"ankleR":-28,"spine":16,"twist":18,"look":65,"front":{"elev":38,"plane":20,"elbow":30},"rear":{"elev":34,"plane":12,"elbow":26}},{"tilt":38,"hip":42,"kneeF":80,"kneeR":84,"ankleF":-22,"ankleR":-32,"spine":16,"twist":18,"look":65,"front":{"elev":30,"plane":70,"elbow":48},"rear":{"elev":28,"plane":66,"elbow":48},"neckFlex":-20},{"tilt":4,"hip":44,"kneeF":64,"kneeR":68,"ankleF":-24,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":42,"plane":30,"elbow":36},"rear":{"elev":36,"plane":22,"elbow":30}},{"tilt":-28,"hip":54,"kneeF":76,"kneeR":80,"ankleF":-30,"ankleR":-33,"spine":10,"twist":18,"look":65,"front":{"elev":48,"plane":66,"elbow":58},"rear":{"elev":40,"plane":60,"elbow":40},"neckFlex":18,"neckLat":-14}],"fast":[{"tilt":2,"hip":44,"kneeF":60,"kneeR":64,"ankleF":-24,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":40,"plane":20,"elbow":30},"rear":{"elev":34,"plane":10,"elbow":26}},{"tilt":50,"hip":40,"kneeF":40,"kneeR":60,"ankleF":-18,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":36,"plane":70,"elbow":30},"rear":{"elev":30,"plane":50,"elbow":30},"neckFlex":-18},{"tilt":2,"hip":44,"kneeF":60,"kneeR":64,"ankleF":-24,"ankleR":-28,"spine":12,"twist":18,"look":65,"front":{"elev":44,"plane":30,"elbow":36},"rear":{"elev":36,"plane":20,"elbow":30}},{"tilt":-38,"hip":58,"kneeF":80,"kneeR":84,"ankleF":-31,"ankleR":-33,"spine":8,"twist":18,"look":65,"front":{"elev":50,"plane":70,"elbow":60},"rear":{"elev":44,"plane":60,"elbow":40},"neckFlex":20,"neckLat":-16}]},"name":"整体倾倒、松弛（参考 Henrik Harlaut）"},{"v":1,"stance":{"ext":0.9,"fore":-0.03,"tilt":0,"arms":{"elev":70,"plane":35,"elbow":45}},"slow":[{"lean":0,"ext":0.8,"fore":-0.03,"tilt":0,"ang":0.1,"twist":0,"head":0.5,"heading":-30,"out":{"elev":72,"plane":35,"elbow":45},"in":{"elev":72,"plane":35,"elbow":45}},{"lean":14,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.2,"twist":-6,"head":0.5,"heading":-18,"out":{"elev":82,"plane":30,"elbow":42},"in":{"elev":66,"plane":40,"elbow":50}},{"lean":22,"ext":0.9,"fore":-0.03,"tilt":0,"ang":0.3,"twist":-12,"head":0.5,"heading":0,"out":{"elev":88,"plane":28,"elbow":40},"in":{"elev":62,"plane":42,"elbow":55}},{"lean":14,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.2,"twist":-6,"head":0.5,"heading":18,"out":{"elev":82,"plane":30,"elbow":42},"in":{"elev":66,"plane":40,"elbow":50}}],"fast":[{"lean":0,"ext":0.78,"fore":-0.03,"tilt":0,"ang":0.1,"twist":0,"head":0.5,"heading":-34,"out":{"elev":74,"plane":32,"elbow":42},"in":{"elev":74,"plane":32,"elbow":42}},{"lean":18,"ext":0.85,"fore":-0.03,"tilt":0,"ang":0.2,"twist":-8,"head":0.5,"heading":-20,"out":{"elev":86,"plane":28,"elbow":40},"in":{"elev":66,"plane":40,"elbow":52}},{"lean":28,"ext":0.88,"fore":-0.03,"tilt":0,"ang":0.3,"twist":-14,"head":0.5,"heading":0,"out":{"elev":94,"plane":25,"elbow":38},"in":{"elev":60,"plane":44,"elbow":58}},{"lean":18,"ext":0.82,"fore":-0.03,"tilt":0,"ang":0.2,"twist":-8,"head":0.5,"heading":20,"out":{"elev":86,"plane":28,"elbow":40},"in":{"elev":66,"plane":40,"elbow":52}}],"style":{"exag":1,"quiet":0,"handFwd":0,"handWide":0,"lagTrunk":0.04,"lagArms":0.14,"dwell":0.15},"name":"双板 · 甩雪松弛（Henrik 猛犸）","gear":"ski","play":{"turn":0.5,"speed":0.7},"note":"Henrik Harlaut 猛犸跟拍 34.8–40 s：每 0.4–0.5 s 换刃，倾角只有 20–30°，板子横甩、手高高张开飘着，膝盖一沉一起（60–80°）。从背后逆光拍，数字偏粗。"},{"v":1,"stance":{"ext":0.94,"fore":-0.03,"tilt":0,"arms":{"elev":26,"plane":70,"elbow":55}},"slow":[{"lean":0,"ext":0.9,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-16,"out":{"elev":24,"plane":70,"elbow":58},"in":{"elev":24,"plane":70,"elbow":58}},{"lean":16,"ext":0.93,"fore":-0.03,"tilt":0,"ang":0.35,"twist":8,"head":0.5,"heading":-10,"out":{"elev":28,"plane":66,"elbow":55},"in":{"elev":22,"plane":74,"elbow":62}},{"lean":26,"ext":0.9,"fore":-0.03,"tilt":0,"ang":0.45,"twist":14,"head":0.5,"heading":0,"out":{"elev":30,"plane":62,"elbow":52},"in":{"elev":20,"plane":76,"elbow":66}},{"lean":16,"ext":0.88,"fore":-0.03,"tilt":0,"ang":0.35,"twist":8,"head":0.5,"heading":10,"out":{"elev":28,"plane":66,"elbow":55},"in":{"elev":22,"plane":74,"elbow":62}}],"fast":[{"lean":0,"ext":0.88,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-12,"out":{"elev":26,"plane":68,"elbow":56},"in":{"elev":26,"plane":68,"elbow":56}},{"lean":22,"ext":0.92,"fore":-0.03,"tilt":0,"ang":0.4,"twist":10,"head":0.5,"heading":-8,"out":{"elev":30,"plane":64,"elbow":54},"in":{"elev":22,"plane":74,"elbow":64}},{"lean":36,"ext":0.88,"fore":-0.03,"tilt":0,"ang":0.5,"twist":18,"head":0.5,"heading":0,"out":{"elev":32,"plane":60,"elbow":50},"in":{"elev":20,"plane":78,"elbow":68}},{"lean":22,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.4,"twist":10,"head":0.5,"heading":8,"out":{"elev":30,"plane":64,"elbow":54},"in":{"elev":22,"plane":74,"elbow":64}}],"style":{"exag":1,"quiet":0.5,"handFwd":0,"handWide":0,"lagTrunk":0.02,"lagArms":0.04,"dwell":0.3},"name":"双板 · 高姿态安静（Phil Casabon）","gear":"ski","play":{"turn":0.5,"speed":0.6},"note":"Phil Casabon “Changes” 72–77.5 s：一个来回约 1 s，倾角 25–37°，站得高（外膝 25–55°），手低、贴着胯，上身扭向外侧 5–24°，上身几乎不动。"},{"v":1,"stance":{"ext":0.86,"fore":-0.03,"tilt":0,"arms":{"elev":45,"plane":60,"elbow":65}},"slow":[{"lean":0,"ext":0.72,"fore":-0.03,"tilt":0,"ang":0.2,"twist":0,"head":0.5,"heading":-20,"out":{"elev":44,"plane":62,"elbow":70},"in":{"elev":44,"plane":62,"elbow":70}},{"lean":18,"ext":0.8,"fore":-0.03,"tilt":0,"ang":0.4,"twist":6,"head":0.5,"heading":-12,"out":{"elev":50,"plane":56,"elbow":64},"in":{"elev":38,"plane":70,"elbow":80}},{"lean":28,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.5,"twist":10,"head":0.5,"heading":0,"out":{"elev":54,"plane":52,"elbow":60},"in":{"elev":34,"plane":74,"elbow":86}},{"lean":18,"ext":0.78,"fore":-0.03,"tilt":0,"ang":0.4,"twist":6,"head":0.5,"heading":12,"out":{"elev":50,"plane":56,"elbow":64},"in":{"elev":38,"plane":70,"elbow":80}}],"fast":[{"lean":0,"ext":0.7,"fore":-0.03,"tilt":0,"ang":0.2,"twist":0,"head":0.5,"heading":-16,"out":{"elev":46,"plane":60,"elbow":68},"in":{"elev":46,"plane":60,"elbow":68}},{"lean":24,"ext":0.78,"fore":-0.03,"tilt":0,"ang":0.45,"twist":8,"head":0.5,"heading":-10,"out":{"elev":54,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}},{"lean":36,"ext":0.8,"fore":-0.03,"tilt":0,"ang":0.55,"twist":12,"head":0.5,"heading":0,"out":{"elev":58,"plane":50,"elbow":56},"in":{"elev":32,"plane":76,"elbow":90}},{"lean":24,"ext":0.75,"fore":-0.03,"tilt":0,"ang":0.45,"twist":8,"head":0.5,"heading":10,"out":{"elev":54,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}}],"style":{"exag":1,"quiet":0.1,"handFwd":0,"handWide":0,"lagTrunk":0.03,"lagArms":0.07,"dwell":0.25},"name":"双板 · 粉雪深蹲起伏（Sammy Carlson）","gear":"ski","play":{"turn":0.85,"speed":0.7},"note":"Sammy Carlson 粉雪 71.7 s：倾角约 35°，外膝 55–100°、内膝 100–135°，换刃时收到最低（膝约 120°），起伏 80–90°：经典的粉雪沉-起。"},{"v":1,"stance":{"ext":0.8,"fore":-0.03,"tilt":0,"arms":{"elev":34,"plane":76,"elbow":72}},"slow":[{"lean":0,"ext":0.76,"fore":-0.03,"tilt":0,"ang":0.2,"twist":0,"head":0.5,"heading":-16,"out":{"elev":34,"plane":76,"elbow":72},"in":{"elev":34,"plane":76,"elbow":72}},{"lean":22,"ext":0.74,"fore":-0.03,"tilt":0,"ang":0.45,"twist":8,"head":0.5,"heading":-10,"out":{"elev":38,"plane":72,"elbow":70},"in":{"elev":30,"plane":80,"elbow":78}},{"lean":34,"ext":0.72,"fore":-0.03,"tilt":0,"ang":0.55,"twist":12,"head":0.5,"heading":0,"out":{"elev":40,"plane":70,"elbow":68},"in":{"elev":28,"plane":82,"elbow":82}},{"lean":22,"ext":0.72,"fore":-0.03,"tilt":0,"ang":0.45,"twist":8,"head":0.5,"heading":10,"out":{"elev":38,"plane":72,"elbow":70},"in":{"elev":30,"plane":80,"elbow":78}}],"fast":[{"lean":0,"ext":0.74,"fore":-0.03,"tilt":0,"ang":0.2,"twist":0,"head":0.5,"heading":-12,"out":{"elev":34,"plane":76,"elbow":72},"in":{"elev":34,"plane":76,"elbow":72}},{"lean":28,"ext":0.72,"fore":-0.03,"tilt":0,"ang":0.5,"twist":10,"head":0.5,"heading":-8,"out":{"elev":38,"plane":72,"elbow":70},"in":{"elev":30,"plane":80,"elbow":80}},{"lean":44,"ext":0.7,"fore":-0.03,"tilt":0,"ang":0.6,"twist":14,"head":0.5,"heading":0,"out":{"elev":40,"plane":70,"elbow":66},"in":{"elev":26,"plane":84,"elbow":86}},{"lean":28,"ext":0.7,"fore":-0.03,"tilt":0,"ang":0.5,"twist":10,"head":0.5,"heading":8,"out":{"elev":38,"plane":72,"elbow":70},"in":{"elev":30,"plane":80,"elbow":80}}],"style":{"exag":1,"quiet":0.35,"handFwd":0,"handWide":0,"lagTrunk":0.02,"lagArms":0.04,"dwell":0.3},"name":"双板 · 低重心快节奏（Markus Eder）","gear":"ski","play":{"turn":0.65,"speed":0.9},"note":"Markus Eder Homeruns 74.7 s：倾角约 44°，折身很大，膝约 90°/120°，手在胯的高度、贴身。低、紧凑、快。"},{"v":1,"stance":{"ext":0.9,"fore":-0.03,"tilt":0,"arms":{"elev":40,"plane":66,"elbow":70}},"slow":[{"lean":0,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-20,"out":{"elev":42,"plane":66,"elbow":72},"in":{"elev":42,"plane":66,"elbow":72}},{"lean":16,"ext":0.88,"fore":-0.03,"tilt":0,"ang":0.25,"twist":4,"head":0.5,"heading":-13,"out":{"elev":48,"plane":58,"elbow":64},"in":{"elev":38,"plane":72,"elbow":80}},{"lean":30,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.3,"twist":8,"head":0.5,"heading":0,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":34,"plane":74,"elbow":88}},{"lean":16,"ext":0.83,"fore":-0.03,"tilt":0,"ang":0.25,"twist":4,"head":0.5,"heading":13,"out":{"elev":48,"plane":58,"elbow":64},"in":{"elev":38,"plane":72,"elbow":80}}],"fast":[{"lean":0,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-12,"out":{"elev":44,"plane":64,"elbow":70},"in":{"elev":44,"plane":64,"elbow":70}},{"lean":24,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.3,"twist":3,"head":0.5,"heading":-8,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}},{"lean":44,"ext":0.82,"fore":-0.03,"tilt":0,"ang":0.35,"twist":6,"head":0.5,"heading":0,"out":{"elev":56,"plane":50,"elbow":56},"in":{"elev":32,"plane":76,"elbow":92}},{"lean":24,"ext":0.8,"fore":-0.03,"tilt":0,"ang":0.3,"twist":3,"head":0.5,"heading":8,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}}],"style":{"exag":1,"quiet":0,"handFwd":0,"handWide":0,"lagTrunk":0.02,"lagArms":0.05,"dwell":0.3},"board":{"stance":{"tilt":6,"hip":40,"kneeF":50,"kneeR":56,"ankleF":-24,"ankleR":-28,"spine":14,"twist":30,"look":65,"front":{"elev":55,"plane":15,"elbow":30},"rear":{"elev":50,"plane":5,"elbow":25}},"slow":[{"tilt":4,"hip":42,"kneeF":52,"kneeR":58,"ankleF":-24,"ankleR":-28,"spine":14,"twist":30,"look":65,"front":{"elev":55,"plane":20,"elbow":32},"rear":{"elev":48,"plane":10,"elbow":26}},{"tilt":40,"hip":40,"kneeF":62,"kneeR":74,"ankleF":-22,"ankleR":-30,"spine":20,"twist":32,"look":65,"front":{"elev":40,"plane":70,"elbow":40},"rear":{"elev":44,"plane":60,"elbow":40},"neckFlex":-20},{"tilt":4,"hip":44,"kneeF":56,"kneeR":62,"ankleF":-24,"ankleR":-28,"spine":12,"twist":30,"look":65,"front":{"elev":60,"plane":25,"elbow":34},"rear":{"elev":52,"plane":12,"elbow":28}},{"tilt":-30,"hip":54,"kneeF":70,"kneeR":76,"ankleF":-30,"ankleR":-33,"spine":6,"twist":26,"look":65,"front":{"elev":70,"plane":15,"elbow":30},"rear":{"elev":64,"plane":5,"elbow":28},"neckFlex":16,"neckLat":-12}],"fast":[{"tilt":2,"hip":44,"kneeF":54,"kneeR":60,"ankleF":-24,"ankleR":-28,"spine":14,"twist":30,"look":65,"front":{"elev":56,"plane":22,"elbow":32},"rear":{"elev":50,"plane":12,"elbow":28}},{"tilt":50,"hip":40,"kneeF":66,"kneeR":78,"ankleF":-22,"ankleR":-32,"spine":22,"twist":34,"look":65,"front":{"elev":34,"plane":80,"elbow":36},"rear":{"elev":38,"plane":70,"elbow":38},"neckFlex":-24},{"tilt":2,"hip":46,"kneeF":58,"kneeR":64,"ankleF":-24,"ankleR":-28,"spine":12,"twist":30,"look":65,"front":{"elev":62,"plane":26,"elbow":34},"rear":{"elev":54,"plane":14,"elbow":30}},{"tilt":-38,"hip":58,"kneeF":76,"kneeR":82,"ankleF":-32,"ankleR":-35,"spine":6,"twist":26,"look":65,"front":{"elev":74,"plane":12,"elbow":30},"rear":{"elev":66,"plane":4,"elbow":28},"neckFlex":18,"neckLat":-14}]},"name":"单板 · 冲浪式刻滑（Arthur Longo）","gear":"board","play":{"turn":0.65,"speed":0.7},"note":"Arthur Longo SHE 第 3 章 105–120 s（15 s 不剪，11 次换刃）：一个来回约 1.3 s，前刃倾 35–70°、腿伸得直，后刃 27–41°、膝深，手张开抬高，肩一直朝板头打开约 20°。"},{"v":1,"stance":{"ext":0.9,"fore":-0.03,"tilt":0,"arms":{"elev":40,"plane":66,"elbow":70}},"slow":[{"lean":0,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-20,"out":{"elev":42,"plane":66,"elbow":72},"in":{"elev":42,"plane":66,"elbow":72}},{"lean":16,"ext":0.88,"fore":-0.03,"tilt":0,"ang":0.25,"twist":4,"head":0.5,"heading":-13,"out":{"elev":48,"plane":58,"elbow":64},"in":{"elev":38,"plane":72,"elbow":80}},{"lean":30,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.3,"twist":8,"head":0.5,"heading":0,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":34,"plane":74,"elbow":88}},{"lean":16,"ext":0.83,"fore":-0.03,"tilt":0,"ang":0.25,"twist":4,"head":0.5,"heading":13,"out":{"elev":48,"plane":58,"elbow":64},"in":{"elev":38,"plane":72,"elbow":80}}],"fast":[{"lean":0,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-12,"out":{"elev":44,"plane":64,"elbow":70},"in":{"elev":44,"plane":64,"elbow":70}},{"lean":24,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.3,"twist":3,"head":0.5,"heading":-8,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}},{"lean":44,"ext":0.82,"fore":-0.03,"tilt":0,"ang":0.35,"twist":6,"head":0.5,"heading":0,"out":{"elev":56,"plane":50,"elbow":56},"in":{"elev":32,"plane":76,"elbow":92}},{"lean":24,"ext":0.8,"fore":-0.03,"tilt":0,"ang":0.3,"twist":3,"head":0.5,"heading":8,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}}],"style":{"exag":1,"quiet":0.3,"handFwd":0,"handWide":0,"lagTrunk":0.02,"lagArms":0.03,"dwell":0.35},"board":{"stance":{"tilt":6,"hip":40,"kneeF":46,"kneeR":52,"ankleF":-24,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":38,"plane":15,"elbow":25},"rear":{"elev":34,"plane":5,"elbow":20}},"slow":[{"tilt":4,"hip":42,"kneeF":48,"kneeR":54,"ankleF":-24,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":38,"plane":18,"elbow":26},"rear":{"elev":34,"plane":8,"elbow":22}},{"tilt":44,"hip":42,"kneeF":60,"kneeR":70,"ankleF":-22,"ankleR":-30,"spine":22,"twist":18,"look":65,"front":{"elev":32,"plane":50,"elbow":30},"rear":{"elev":30,"plane":44,"elbow":30},"neckFlex":-20},{"tilt":4,"hip":44,"kneeF":50,"kneeR":56,"ankleF":-24,"ankleR":-28,"spine":12,"twist":18,"look":65,"front":{"elev":38,"plane":20,"elbow":26},"rear":{"elev":34,"plane":10,"elbow":22}},{"tilt":-38,"hip":58,"kneeF":66,"kneeR":74,"ankleF":-30,"ankleR":-33,"spine":4,"twist":18,"look":65,"front":{"elev":40,"plane":25,"elbow":28},"rear":{"elev":36,"plane":15,"elbow":24},"neckFlex":18,"neckLat":-14}],"fast":[{"tilt":2,"hip":44,"kneeF":50,"kneeR":56,"ankleF":-24,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":38,"plane":20,"elbow":26},"rear":{"elev":34,"plane":10,"elbow":22}},{"tilt":54,"hip":42,"kneeF":64,"kneeR":74,"ankleF":-22,"ankleR":-32,"spine":24,"twist":18,"look":65,"front":{"elev":30,"plane":55,"elbow":30},"rear":{"elev":28,"plane":48,"elbow":30},"neckFlex":-26},{"tilt":2,"hip":46,"kneeF":52,"kneeR":58,"ankleF":-24,"ankleR":-28,"spine":12,"twist":18,"look":65,"front":{"elev":38,"plane":22,"elbow":26},"rear":{"elev":34,"plane":12,"elbow":22}},{"tilt":-46,"hip":62,"kneeF":70,"kneeR":78,"ankleF":-32,"ankleR":-35,"spine":2,"twist":18,"look":65,"front":{"elev":42,"plane":28,"elbow":28},"rear":{"elev":38,"plane":18,"elbow":24},"neckFlex":20,"neckLat":-16}]},"name":"单板 · 大倾角刻滑（Terje Haakonsen）","gear":"board","play":{"turn":1.1,"speed":0.9},"note":"Terje Haakonsen Montafon 66.3 s：两边都压到很低（视频里倾角约 80°），一个来回约 2.2 s，后刃折身大，膝 31–51°，手几乎不动。这里把倾角收在不抖的范围里。"},{"v":1,"stance":{"ext":0.9,"fore":-0.03,"tilt":0,"arms":{"elev":40,"plane":66,"elbow":70}},"slow":[{"lean":0,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-20,"out":{"elev":42,"plane":66,"elbow":72},"in":{"elev":42,"plane":66,"elbow":72}},{"lean":16,"ext":0.88,"fore":-0.03,"tilt":0,"ang":0.25,"twist":4,"head":0.5,"heading":-13,"out":{"elev":48,"plane":58,"elbow":64},"in":{"elev":38,"plane":72,"elbow":80}},{"lean":30,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.3,"twist":8,"head":0.5,"heading":0,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":34,"plane":74,"elbow":88}},{"lean":16,"ext":0.83,"fore":-0.03,"tilt":0,"ang":0.25,"twist":4,"head":0.5,"heading":13,"out":{"elev":48,"plane":58,"elbow":64},"in":{"elev":38,"plane":72,"elbow":80}}],"fast":[{"lean":0,"ext":0.84,"fore":-0.03,"tilt":0,"ang":0.15,"twist":0,"head":0.5,"heading":-12,"out":{"elev":44,"plane":64,"elbow":70},"in":{"elev":44,"plane":64,"elbow":70}},{"lean":24,"ext":0.86,"fore":-0.03,"tilt":0,"ang":0.3,"twist":3,"head":0.5,"heading":-8,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}},{"lean":44,"ext":0.82,"fore":-0.03,"tilt":0,"ang":0.35,"twist":6,"head":0.5,"heading":0,"out":{"elev":56,"plane":50,"elbow":56},"in":{"elev":32,"plane":76,"elbow":92}},{"lean":24,"ext":0.8,"fore":-0.03,"tilt":0,"ang":0.3,"twist":3,"head":0.5,"heading":8,"out":{"elev":52,"plane":54,"elbow":60},"in":{"elev":36,"plane":72,"elbow":84}}],"style":{"exag":1,"quiet":0,"handFwd":0,"handWide":0,"lagTrunk":0.04,"lagArms":0.12,"dwell":0.2},"board":{"stance":{"tilt":6,"hip":44,"kneeF":66,"kneeR":70,"ankleF":-24,"ankleR":-28,"spine":12,"twist":18,"look":65,"front":{"elev":60,"plane":5,"elbow":30},"rear":{"elev":55,"plane":0,"elbow":25}},"slow":[{"tilt":4,"hip":50,"kneeF":72,"kneeR":76,"ankleF":-24,"ankleR":-28,"spine":14,"twist":18,"look":65,"front":{"elev":58,"plane":10,"elbow":30},"rear":{"elev":54,"plane":0,"elbow":26}},{"tilt":34,"hip":46,"kneeF":92,"kneeR":98,"ankleF":-22,"ankleR":-32,"spine":18,"twist":18,"look":65,"front":{"elev":40,"plane":60,"elbow":40},"rear":{"elev":40,"plane":50,"elbow":40},"neckFlex":-18},{"tilt":4,"hip":50,"kneeF":72,"kneeR":76,"ankleF":-24,"ankleR":-28,"spine":12,"twist":18,"look":65,"front":{"elev":60,"plane":10,"elbow":30},"rear":{"elev":56,"plane":0,"elbow":26}},{"tilt":-30,"hip":62,"kneeF":96,"kneeR":100,"ankleF":-32,"ankleR":-35,"spine":6,"twist":18,"look":65,"front":{"elev":72,"plane":0,"elbow":30},"rear":{"elev":66,"plane":-10,"elbow":28},"neckFlex":16,"neckLat":-12}],"fast":[{"tilt":2,"hip":44,"kneeF":52,"kneeR":56,"ankleF":-24,"ankleR":-28,"spine":10,"twist":18,"look":65,"front":{"elev":62,"plane":8,"elbow":28},"rear":{"elev":58,"plane":0,"elbow":24}},{"tilt":36,"hip":40,"kneeF":58,"kneeR":66,"ankleF":-22,"ankleR":-30,"spine":14,"twist":18,"look":65,"front":{"elev":44,"plane":60,"elbow":36},"rear":{"elev":44,"plane":50,"elbow":36},"neckFlex":-18},{"tilt":2,"hip":44,"kneeF":52,"kneeR":56,"ankleF":-24,"ankleR":-28,"spine":8,"twist":18,"look":65,"front":{"elev":64,"plane":8,"elbow":28},"rear":{"elev":60,"plane":0,"elbow":24}},{"tilt":-42,"hip":46,"kneeF":50,"kneeR":58,"ankleF":-30,"ankleR":-33,"spine":0,"twist":18,"look":65,"front":{"elev":80,"plane":-5,"elbow":26},"rear":{"elev":76,"plane":-15,"elbow":24},"neckFlex":10,"neckLat":-10}]},"name":"单板 · 粉雪甩尾（Austen Sweetin）","gear":"board","play":{"turn":0.5,"speed":0.4},"note":"Austen Sweetin Wind Slab：慢档是 149.8 s 的短甩（一个来回约 0.9 s，膝 70–100°）；快档是 235.2 s 的粉雪后刃，腿倒很多、上身几乎直立，手张很开，起伏约 80°。"}];
