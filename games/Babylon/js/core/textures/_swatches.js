// textures/_swatches.js — the swatch scene of the "materials" subsystem. OWNER: materials engineer. DEBUG ONLY.
// Switched on by the URL flag swatches=1, or in the harness by `--with _swatches` (the harness then also prints
// one harmless warning that js/modules/_swatches.js does not exist). Built by materials.update() on its first
// call, through ctx.geom exactly as a world module would, so it shows what builders get.
//
//   node render.mjs eval --with _swatches --massing 0 --label materials --js "CTX.materials.swatchCameras()"
//   node render.mjs still --with _swatches --massing 0 --cam "<one of those strings>" --mode golden --label materials
//
// Local frame: origin = BASE on the flat fields south-east of the city, +X east, +Z south, everything on one
// level g. Golden light comes from the WNW (west faces lit), morning light from the east (east faces lit), so
// every wall is a slab with a west and an east face, and each view exists from both sides.
//   X = 0            row of wall panels, 4 m high, 6 m long, 0.6 m thick, one per material, a 1.7 m figure beside each
//   X = -75 .. -62   a piece of the Processional Way (asphalt, breccia 4 x 0.66, limestone 5 x 1.05, breccia, asphalt)
//   X = -60.5        baked-brick street wall 6 m high: straight, then turned 25 degrees, then a round tower
//   X = -28 .. -4    paving patches north of the panels (Z = -86 .. -68): court brick paving, roof earth, damp street earth
//   X = +60 .. +200  a block of 64 houses (mud tones by vertex colour, 20 % lime-washed, mud roofs, parapets)
//   X = +34          props in a row running south: trunk, timber, mats, cloth, metals, stones, emitters
//   Z = +150 .. +180 field patches
//   X = -150 .. -95  the orientation fan: seven brick walls turned 0, 25, 50, 75, 90, 115, 155 degrees and one battered
//                    1 : 8 (courses must run level and at 8.6 cm on every one), with a mud-plaster twin behind each
//   X = -120, Z = +60 a glazed block 12 x 12 x 9 m (the summit temple as the low sun sees it), a battered brick stage under it
//   X = -40,  Z = +120 two mud walls running east-west (raking light in both modes) and a wall of each joint kind
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from '../mathx.js';
import { hash2 } from '../rng.js';

export const BASE = [3000, 1500];
export const PANELS = [
  'mudPlaster', 'mudPlasterSunlit', 'mudPlasterWeathered', 'mudPlasterFresh', 'mudPlasterDampBase', 'mudPlasterGrey', 'mudPlasterReddish', 'mudPlasterDark',
  'limewash', 'limewashAged', 'templePlasterWhite',
  'bakedBrickYellow', 'bakedBrickBuff', 'bakedBrickRed', 'bakedBrickOld', 'bakedBrickBuff:bitumen', 'glazeBlue', 'glazeTurquoise',
  // flat references (texture: false) to check that a textured material averages to its palette colour
  'mudPlaster:flat', 'mudPlaster', 'limewash:flat', 'limewash', 'bakedBrickBuff:flat', 'bakedBrickBuff', 'roofEarth:flat', 'roofEarth',
];
const panelZ = (i) => -60 + i * 7;
const FAN = [0, 25, 50, 75, 90, 115, 155, 0], FANX = -150, FANZ = -20;
let level = 2, moving = [];

/** Per frame (called by materials.update): the moving boxes slide 0.8 m/s along x. Pure function of film time. */
export function update(frame) {
  moving.forEach((m, i) => { m.position.x = BASE[0] - 30 + i * 6 + 0.8 * (frame.t % 5); });
}

export function build(ctx) {
  const { geom, materials, ground } = ctx;
  const B = BASE, g = ground.height(B[0], B[1]) + 0.12;
  level = g;
  const prevOwner = geom.owner; geom.owner = '_swatches';
  const rect = (x0, z0, x1, z1) => M.rectRing(B[0] + (x0 + x1) / 2, B[1] + (z0 + z1) / 2, x1 - x0, z1 - z0, 0);
  const floor = (mat, x0, z0, x1, z1, lift = 0.05) => geom.addStatic(mat, geom.cap(rect(x0, z0, x1, z1), g + lift), { castShadow: false });
  const box = (mat, x, z, sx, sz, y0, y1, rot = 0, opts = {}) => geom.addStatic(mat, geom.box({ x: B[0] + x, z: B[1] + z, y0: g + y0, y1: g + y1, sx, sz, rotDeg: rot }), opts);
  const prim = (mat, geo, x, y, z) => { geo.translate(B[0] + x, g + y, B[1] + z); geom.addStatic(mat, geo); };
  const matOf = (name) => { const [id, k] = name.split(':'); return !k ? materials.get(id) : materials.variant(id, k === 'flat' ? { texture: false, name: id + '-flat' } : { joint: k, name: id + '-' + k }); };

  function figure(x, z, robe = 'woolCream', sash = 'dyeMadderRed') {
    prim(robe, new THREE.CylinderGeometry(0.15, 0.25, 1.42, 14), x, 0.71, z);
    prim(sash, new THREE.CylinderGeometry(0.19, 0.2, 0.09, 14), x, 0.98, z);
    prim('skin', new THREE.SphereGeometry(0.112, 14, 10), x, 1.585, z);
    prim('hair', new THREE.SphereGeometry(0.122, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), x, 1.6, z);
    for (const s of [-1, 1]) prim('skin', new THREE.CylinderGeometry(0.04, 0.045, 0.62, 8), x, 1.05, z + s * 0.24);
  }

  // ---- ground ---------------------------------------------------------------------------------------
  floor('streetEarth', -170, -90, 240, 190, 0);

  // ---- row of wall panels -----------------------------------------------------------------------------
  PANELS.forEach((name, i) => {
    box(matOf(name), 0, panelZ(i), 0.6, 6, -0.6, 4);
    figure(-0.9, panelZ(i) - 2.3, i % 2 ? 'woolOatmeal' : 'woolCream', i % 3 ? 'dyeMadderRed' : 'dyeIndigo');
    figure(0.9, panelZ(i) - 2.3, i % 2 ? 'woolBrown' : 'linenWhite', i % 3 ? 'dyeSaffron' : 'dyeIndigo');
  });

  // ---- Processional Way: asphalted brick, breccia 4 x 0.66, limestone 5 x 1.05, breccia, asphalt ----------
  const x0 = -75.1, wz0 = -80, wz1 = 70;
  floor('asphaltedBrickRoad', x0, wz0, x0 + 1.3, wz1, 0.02);
  floor(materials.variant('breccia', { origin: [B[0] + x0 + 1.3, B[1] + wz0], name: 'swatch-breccia-w' }), x0 + 1.3, wz0, x0 + 3.94, wz1, 0.06);
  floor(materials.variant('limestone', { origin: [B[0] + x0 + 3.94, B[1] + wz0], name: 'swatch-limestone' }), x0 + 3.94, wz0, x0 + 9.19, wz1, 0.06);
  floor(materials.variant('breccia', { origin: [B[0] + x0 + 9.19, B[1] + wz0], name: 'swatch-breccia-e' }), x0 + 9.19, wz0, x0 + 11.83, wz1, 0.06);
  floor('asphaltedBrickRoad', x0 + 11.83, wz0, x0 + 13.13, wz1, 0.02);
  figure(x0 + 6.5, -42); figure(x0 + 2.4, -20, 'woolOatmeal', 'dyeIndigo');

  // ---- baked-brick street wall: bitumen joints in the lowest courses, then mud mortar; turned; a round tower ----
  const wx = -60.5;
  box(materials.variant('bakedBrickBuff', { joint: 'bitumen', name: 'swatch-brick-bitumen' }), wx, -45, 1.5, 70, -0.6, 1.6);
  box('bakedBrickBuff', wx, -45, 1.5, 70, 1.6, 6);
  {
    const a = [B[0] + wx, B[1] - 10], d = M.azToDir(180 - 25), b = [a[0] + d[0] * 46, a[1] + d[1] * 46];
    geom.addStatic('bakedBrickYellow', geom.wall([a, b], { thickness: 1.5, base: g - 0.6, top: g + 6 }));
    const tower = new THREE.CylinderGeometry(3.2, 3.4, 8.6, 40); tower.translate(b[0], g + 3.7, b[1]);
    geom.addStatic('bakedBrickRed', tower);
    figure(wx - 2.2, -30); figure(wx + 1.9, -52, 'linenWhite');
  }
  // stairs of baked brick against the wall: treads of one brick, risers of two courses
  geom.addStatic('bakedBrickBuff', geom.stairs({ x: B[0] + wx - 2.6, z: B[1] - 66, azDeg: 0, width: 2.4, steps: 12, riser: 2 * materials.module.course, tread: 0.34, base: g }));

  // ---- paving patches north of the panel row -----------------------------------------------------------------
  floor(materials.variant('courtBrickPaving', { origin: [B[0] - 28, B[1] - 86], name: 'swatch-court' }), -28, -86, -20, -68, 0.06);
  floor('roofEarth', -20, -86, -12, -68, 0.06);
  floor('streetEarthDamp', -12, -86, -4, -68, 0.06);
  figure(-24, -74); figure(-16, -74); figure(-8, -74);

  // ---- a block of houses: tones by vertex colour on ONE material, mud roofs, parapets ------------------------
  const wallMat = materials.variant('mudPlaster', { color: 0xffffff, name: 'swatch-house-walls' });
  const limeMat = materials.variant('limewash', { color: 0xffffff, name: 'swatch-house-lime' });
  const tones = ['mudPlaster', 'mudPlasterSunlit', 'mudPlasterWeathered', 'mudPlasterFresh', 'mudPlasterGrey', 'mudPlasterReddish', 'mudPlasterDark'].map((id) => materials.color(id));
  const lime = materials.color('limewash'), walls = [], limes = [], roofs = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const r = (k) => hash2(i, j, 900 + k);
    const sx = 11 + 5 * r(1), sz = 11 + 5 * r(2), h = 3.6 + 3.6 * r(3) * r(3), rot = (r(4) - 0.5) * 16;
    const cx = B[0] + 68 + i * 17.5 + (r(5) - 0.5) * 2, cz = B[1] - 62 + j * 17.5 + (r(6) - 0.5) * 2;
    const white = r(7) < 0.2, tone = white ? lime.clone() : tones[Math.floor(r(8) * tones.length)].clone();
    tone.multiplyScalar(0.88 + 0.24 * r(9));                         // +/- 12 % value jitter (palette.rules)
    const ring = M.rectRing(cx, cz, sx, sz, rot);
    const shell = geom.merge([
      geom.prism(ring, g - 0.6, g + h, { top: false }),
      geom.wall(ring, { closed: true, thickness: 0.35, offset: -0.175, base: g + h, top: g + h + 0.75 }),
    ]);
    (white ? limes : walls).push(geom.paint(shell, tone));
    roofs.push(geom.cap(ring, g + h + 0.02));
  }
  geom.addStatic(wallMat, geom.merge(walls));
  geom.addStatic(limeMat, geom.merge(limes));
  geom.addStatic('roofEarth', geom.merge(roofs));

  // ---- props: a row running south at X = 34, faces to the west and to the east ---------------------------------
  const PX = 34; let pzc = -62; const next = (w) => { const z = pzc + w / 2; pzc += w + 1.2; return z; };
  prim('palmTrunk', new THREE.CylinderGeometry(0.2, 0.24, 6, 20), PX, 3, next(0.5));
  box(materials.variant('palmWood', { rows: 0.3, vertical: true, name: 'swatch-palm-door' }), PX, next(1.2), 0.1, 1.2, 0, 2.2);
  box(materials.variant('cedar', { rows: 0.22, vertical: true, name: 'swatch-cedar-planks' }), PX, next(1.6), 0.12, 1.6, 0, 2.6);
  box('cedar', PX, next(0.3), 0.3, 0.3, 0, 3.2);
  box('reedMat', PX, next(2), 0.06, 2, 0, 2);
  { const z = next(3); floor('reedMat', PX - 1.5, z - 1.5, PX + 1.5, z + 1.5, 0.08); }
  for (const id of ['woolCream', 'woolOatmeal', 'woolBrown', 'woolDark', 'linenWhite', 'dyeMadderRed', 'dyeIndigo', 'dyeSaffron', 'dyePurple']) box(id, PX, next(1.4), 0.04, 1.4, 0.2, 2.2);
  for (const id of ['bronze', 'bronzePatina', 'gold', 'silver']) { const z = next(1.2); box(id, PX, z, 0.08, 1.2, 0, 1.6); prim(id, new THREE.SphereGeometry(0.35, 28, 18), PX, 2.0, z); }
  for (const id of ['bitumen', 'basalt', 'limestone', 'breccia', 'sandstoneMottled', 'asphaltedBrickRoad']) box(id, PX, next(1.6), 1.0, 1.6, 0, 1.2);
  for (const id of ['lampFlame', 'torchFlame', 'ember']) prim(materials.variant(id, { night: 6, day: 0.15, vertexColors: false, name: 'swatch-' + id }), new THREE.SphereGeometry(0.22, 16, 10), PX, 0.6, next(0.6));
  for (let k = 0; k < 6; k++) { figure(PX - 1.2, -62.9 + k * 12.4); figure(PX + 1.2, -62.9 + k * 12.4, 'woolBrown'); }

  // ---- field patches ---------------------------------------------------------------------------------------
  ['barleyRipe', 'barleyGreen', 'stubble', 'fallow', 'ploughedSoil', 'saltCrust', 'gardenGreen', 'alluvialSoilDry', 'wetBank', 'palmFrond', 'reedsGreen'].forEach((id, i) => {
    floor(id, -160 + i * 32, 150, -130 + i * 32, 180, 0.05);
    figure(-161 + i * 32, 165);
  });
  // ---- the orientation fan: brick courses on walls of every direction, a battered wall, mud twins -----------------
  FAN.forEach((deg, i) => {
    const cx = B[0] + FANX + (i % 4) * 16, cz = B[1] + FANZ + Math.floor(i / 4) * 22, d = M.azToDir(deg), r = M.rightOf(d[0], d[1]);
    const a = [cx - d[0] * 5, cz - d[1] * 5], b = [cx + d[0] * 5, cz + d[1] * 5];
    geom.addStatic(i % 2 ? 'bakedBrickYellow' : 'bakedBrickBuff', geom.wall([a, b], { thickness: 1.2, base: g - 0.6, top: g + 5, batter: i === FAN.length - 1 ? 0.125 : 0 }));
    geom.addStatic('mudPlaster', geom.wall([[a[0] + r[0] * 3, a[1] + r[1] * 3], [b[0] + r[0] * 3, b[1] + r[1] * 3]], { thickness: 0.8, base: g - 0.6, top: g + 3.2 }));
    figure(FANX + (i % 4) * 16 - r[0] * 1.4 + d[0] * 3, FANZ + Math.floor(i / 4) * 22 - r[1] * 1.4 + d[1] * 3);
  });
  // ---- a glazed block on a battered brick stage: what the summit temple and the ziggurat faces do in a low sun ------
  geom.addStatic('bakedBrickBuff', geom.box({ x: B[0] - 120, z: B[1] + 60, y0: g - 0.6, y1: g + 6, sx: 22, sz: 22, batter: 0.06 }));
  geom.addStatic('glazeBlue', geom.box({ x: B[0] - 120, z: B[1] + 60, y0: g + 6, y1: g + 15, sx: 12, sz: 12 }));
  geom.addMerlons('glazeBlue', M.rectRing(B[0] - 120, B[1] + 60, 11.4, 11.4, 0), { y: g + 15, pitch: 1.3, width: 0.8, height: 1.1 });
  figure(-133, 60); figure(-120, 73.5);
  // ---- raking light: mud, lime and brick walls running east-west (their faces look north and south) ------------------
  ['mudPlaster', 'mudPlasterWeathered', 'limewash', 'bakedBrickBuff', 'templePlasterWhite'].forEach((id, i) => {
    box(id, -52 + i * 8, 120, 7, 0.6, -0.6, 4);
    figure(-52 + i * 8 - 2.6, 119); figure(-52 + i * 8 - 2.6, 121, 'woolBrown');
  });
  // ---- the variant API: wear 0 / 0.25 (default) / 0.6 / 1, a tint, a scale: all share the textures of 'mudPlaster' ----
  [{ wear: 0 }, {}, { wear: 0.6 }, { wear: 1 }, { tint: [0.86, 0.9, 1.0] }, { scale: 2.5 }].forEach((o, i) => {
    box(Object.keys(o).length ? materials.variant('mudPlaster', { ...o, name: 'swatch-variant-' + i }) : 'mudPlaster', -52 + i * 8, 108, 7, 0.6, -0.6, 4);
    figure(-52 + i * 8 - 2.6, 107); figure(-52 + i * 8 - 2.6, 109, 'woolBrown');
  });
  // ---- joints: mud mortar, bitumen, lime; a quay face in bitumen ----------------------------------------------------
  ['mud', 'bitumen', 'lime'].forEach((j, i) => box(materials.variant('bakedBrickBuff', { joint: j, name: 'swatch-joint-' + j }), -52 + i * 8, 132, 7, 0.6, -0.6, 3));
  // ---- something that MOVES: the same timber box in world space (wrong: the grain swims) and in object space ---------
  moving = ['world', 'object'].map((space, i) => {
    const mat = materials.variant('cedar', { space, name: 'swatch-moving-' + space, vertexColors: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.4), mat);
    mesh.name = '_swatches:moving-' + space; mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(B[0] - 30 + i * 6, g + 0.7, B[1] + 140);
    ctx.scene.add(mesh);
    return mesh;
  });
  geom.owner = prevOwner;
  return { base: B, level: g };
}

/** Camera strings for `render.mjs still --cam` ("x,y,z;lx,ly,lz;fov"), by name. west = golden light, east = morning. */
export function cameras() {
  const B = BASE, g = level, f = (v) => v.toFixed(2);
  const cam = (x, y, z, lx, ly, lz, fov) => `${f(B[0] + x)},${f(g + y)},${f(B[1] + z)};${f(B[0] + lx)},${f(g + ly)},${f(B[1] + lz)};${fov}`;
  const idx = (name) => panelZ(PANELS.indexOf(name));
  const out = {};
  for (const [tag, name] of [['mud', 'mudPlaster'], ['lime', 'limewash'], ['brick', 'bakedBrickBuff'], ['glaze', 'glazeBlue']]) {
    const z = idx(name);
    out[`${tag}-3m-west`] = cam(-3.3, 1.65, z - 1.2, 0, 1.75, z - 0.6, 55);
    out[`${tag}-3m-east`] = cam(3.3, 1.65, z - 1.2, 0, 1.75, z - 0.6, 55);
  }
  out['panels-30m-west'] = cam(-30, 1.7, -30, 0, 2.2, -32, 45);
  out['panels-30m-west-b'] = cam(-30, 1.7, 18, 0, 2.2, 20, 45);
  out['panels-30m-east'] = cam(30, 1.7, -30, 0, 2.2, -32, 45);
  out['panels-30m-east-b'] = cam(30, 1.7, 18, 0, 2.2, 20, 45);
  out['all-300m-west'] = cam(-300, 42, -10, 60, 0, -5, 26);
  out['all-300m-east'] = cam(420, 42, -10, 60, 0, -5, 26);
  out['block-300m-west'] = cam(-170, 48, 0, 130, 3, 0, 22);
  out['block-300m-east'] = cam(430, 48, 0, 130, 3, 0, 22);
  out['brick-eye-west'] = cam(-62.4, 1.6, -40, -61.25, 1.55, -39.4, 50);        // 1.15 m from the wall
  out['brick-wall-west'] = cam(-66.5, 1.65, -52, -61.25, 2.2, -36, 55);         // along the wall, raking
  out['brick-turn-east'] = cam(-48, 1.7, -2, -58, 2.6, 12, 55);                 // the turned stretch and the tower
  out['brick-stairs'] = cam(-66, 1.6, -62.5, -63, 0.9, -66.5, 50);
  out['paving-eye'] = cam(-68.5, 1.65, -58, -68.3, 0.2, -52, 50);              // standing on the Way, looking along it
  out['paving-close'] = cam(-70.2, 1.2, -30, -69.2, 0.0, -28.6, 50);
  out['paving-way-long'] = cam(-68.5, 1.7, -78, -68.5, 0.6, -20, 45);
  out['court-eye'] = cam(-24, 1.65, -88.5, -24, 0.2, -82, 50);
  out['roof-eye'] = cam(-16, 1.65, -88.5, -16, 0.2, -82, 50);
  out['damp-eye'] = cam(-8, 1.65, -88.5, -8, 0.2, -82, 50);
  out['patches-top'] = cam(-16, 30, -100, -16, 0, -77, 40);
  out['flat-a-west'] = cam(-30, 1.7, 76.5, 0, 2.0, 76.5, 45);     // flat reference beside its textured twin: mud, lime
  out['flat-b-west'] = cam(-30, 1.7, 104.5, 0, 2.0, 104.5, 45);   // brick, roof earth
  out['flat-a-east'] = cam(30, 1.7, 76.5, 0, 2.0, 76.5, 45);
  out['flat-b-east'] = cam(30, 1.7, 104.5, 0, 2.0, 104.5, 45);
  out['earth-eye'] = cam(-45, 1.65, 20, -40, 0.1, 27, 50);
  for (let k = 0; k < 6; k++) {
    out[`props-${k + 1}-west`] = cam(34 - 7, 1.65, -56 + k * 12.4, 34, 1.3, -56 + k * 12.4, 55);
    out[`props-${k + 1}-east`] = cam(34 + 7, 1.65, -56 + k * 12.4, 34, 1.3, -56 + k * 12.4, 55);
  }
  out['fields-west'] = cam(-190, 14, 165, -60, 0, 165, 45);
  out['fields-east'] = cam(215, 14, 165, 80, 0, 165, 45);
  out['fields-eye'] = cam(-166, 1.65, 160, -140, 0, 166, 55);
  out['fields-top'] = cam(16, 260, 164.9, 16, 0, 165, 50);
  out['fan-west'] = cam(FANX - 22, 7, FANZ + 11, FANX + 24, 2, FANZ + 11, 50);
  out['fan-east'] = cam(FANX + 70, 7, FANZ + 11, FANX + 24, 2, FANZ + 11, 50);
  for (let i = 0; i < FAN.length; i++) {
    const d = M.azToDir(FAN[i]), r = M.rightOf(d[0], d[1]), cx = FANX + (i % 4) * 16, cz = FANZ + Math.floor(i / 4) * 22;
    // 2.2 m in front of the left face (the side away from the mud twin), eye level, looking square at it
    out[`fan-${i}-near`] = cam(cx - r[0] * 2.8, 1.65, cz - r[1] * 2.8, cx - r[0] * 0.6, 1.6, cz - r[1] * 0.6, 50);
  }
  out['temple-sun'] = cam(-120 + 0.8771 * 60, 3.0, 60 + 0.4407 * 60, -120, 10.5, 60, 30);       // the sun behind the block: its lit faces mirror the sun
  out['temple-lit'] = cam(-120 - 0.8771 * 60, 3.0, 60 - 0.4407 * 60, -120, 10.5, 60, 30);       // the sun behind the camera
  out['temple-rake'] = cam(-120 - 30, 1.7, 60 + 52, -120, 10.5, 60, 35);
  out['rake-south'] = cam(-36, 1.65, 126.5, -37, 1.7, 120.3, 55);       // the south faces of the east-west walls, 6 m
  out['rake-north'] = cam(-36, 1.65, 113.5, -37, 1.7, 119.7, 55);
  out['rake-mud-3m'] = cam(-50.5, 1.65, 123.3, -52, 1.7, 120.3, 55);
  out['joints'] = cam(-44, 1.65, 137.5, -44, 1.5, 132.3, 60);
  out['variants-north'] = cam(-32, 2.2, 90, -32, 2, 107.7, 75);          // wear 0, 0.25, 0.6, 1, tint, scale 2.5 (their north faces: lit in golden light)
  out['moving'] = cam(-26, 1.6, 144.5, -26, 0.9, 140, 50);
  return out;
}
