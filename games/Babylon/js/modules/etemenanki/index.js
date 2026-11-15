// js/modules/etemenanki/index.js — world module "etemenanki": the ziggurat of Marduk and its precinct.
// SPEC 3.10, 3.11; world.json monuments[etemenanki], [etemenankiPrecinct]; research/R3. Notes: docs/mod-etemenanki.md.
//   ziggurat.js   the tower: six niched stages, parapets, the triple south stair with true steps, the blue temple
//   precinct.js   the enclosure: casemate wall with pilasters, towers and merlons, twelve gates, two storehouses,
//                 the south range of priests' houses, the inner west wall, the paved court
//   tools.js      the geometry tools both use
// Publishes ctx.modules.etemenanki = { stairs, terraces, ... } (ENGINE.md section 4).
import { makeTools } from './tools.js';
import { buildZiggurat } from './ziggurat.js';
import { buildPrecinct } from './precinct.js';

const FIRE_SLOTS = 64;

export default {
  name: 'etemenanki',
  claims: ['monument:etemenanki', 'monument:etemenankiPrecinct'],

  async build(ctx) {
    const { geom, materials, THREE, lighting } = ctx;
    const T = makeTools(ctx);
    const parts = { brick: [], brickDeco: [], glaze: [], white: [], roof: [], paving: [], cedar: [], breccia: [], bronze: [] };

    const zig = buildZiggurat(ctx, T, parts);
    const pre = buildPrecinct(ctx, T, parts);

    // ---- fires: bowls on brick stands (static), declared as emitters (nightfx draws flame, glow and smoke) ----
    const fireColor = new THREE.Color(ctx.world.lighting.fires ? ctx.world.lighting.fires.lampColor : '#FF9A3C');
    const mkFireU = () => ({ uEtemFires: { value: Array.from({ length: FIRE_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)) }, uEtemFire: { value: new THREE.Vector4(0, 0, 1, 0) }, uEtemFireColor: { value: fireColor } });
    const towerU = mkFireU(), wallU = mkFireU();
    const standW = geom.writer(), bowlAt = [];
    const stand = (p, h, sz) => { if (h > 0) T.boxInto(standW, [[p[0] - sz, p[2] - sz], [p[0] + sz, p[2] - sz], [p[0] + sz, p[2] + sz], [p[0] - sz, p[2] + sz]], p[1] - 0.3, p[1] + h); return [p[0], p[1] + h, p[2]]; };
    zig.fires.forEach((f, i) => {
      const top = stand(f.p, f.plinth ?? 1.0, 0.42);
      bowlAt.push({ p: top, s: 1.0 });
      ctx.emitters.add({ kind: 'fireBowl', pos: [top[0], top[1] + 0.5, top[2]], size: 1.6, data: { conjectural: true, on: 'etemenanki' } });
      if (i < FIRE_SLOTS) towerU.uEtemFires.value[i].set(top[0], top[1] + 0.8, top[2], f.kind === 'temple' || f.kind === 'landing' ? 1.25 : 1.0);
    });
    let slot = 0;
    const wallFire = (x, y, z, k) => { if (slot < FIRE_SLOTS) wallU.uEtemFires.value[slot++].set(x, y, z, k); };
    pre.fires.forEach((f) => {
      const top = stand(f.p, 0.9, 0.36);
      bowlAt.push({ p: top, s: 0.8 });
      ctx.emitters.add({ kind: 'brazier', pos: [top[0], top[1] + 0.45, top[2]], size: 1.2, data: { on: 'etemenankiPrecinct', gate: f.gate } });
      wallFire(top[0], top[1] + 0.7, top[2], f.gate === 'tower' ? 0.6 : 0.8);
    });
    // oil lamps in the courts of the priests' houses and the storehouses (the precinct's houses are not layout houses: nightfx finds them here)
    for (const l of pre.lamps) { ctx.emitters.add({ kind: 'lamp', pos: l.p, size: 1, data: { on: 'etemenankiPrecinct' } }); wallFire(l.p[0], l.p[1] + 0.3, l.p[2], 0.45); }
    // the bowls at the foot of the central stair also light the paving
    zig.fires.filter((f) => f.kind === 'foot').forEach((f) => wallFire(f.p[0], f.p[1] + 2.0, f.p[2], 1.0));
    parts.brick.push(standW);

    // ---- materials: six in all, one tile mesh each ----
    const mat = {
      brick: materials.variant('bakedBrickBuff', { name: 'etemenanki-brick', joint: 'bitumen', info: { etemFires: 'tower' } }),
      glaze: materials.variant('glazeBlue', { name: 'etemenanki-glaze', spec: 0.5, specGrazing: 0.14, color: materials.color('glazeBlue').lerp(materials.color('glazeBlueLight'), 0.12), info: { etemFires: 'tower' } }),
      white: materials.variant('templePlasterWhite', { name: 'etemenanki-plaster', info: { etemFires: 'wall' } }),
      roof: materials.get('roofEarth'),
      paving: materials.variant('courtBrickPaving', { name: 'etemenanki-paving', rotDeg: zig.api.rotationDeg, origin: [0, 0], color: materials.color('courtBrickPaving').multiplyScalar(1.34), info: { etemFires: 'wall' } }),
      cedar: materials.preset('planks', { name: 'etemenanki-doors', vertical: true }),
    };
    // fire light on the tower and at the gates: a diffuse term per fire, added in the shader of these three materials
    // (the engine's pool of twelve point lights is shared by the whole city; the tower alone carries thirty bowls)
    materials.addHook({
      name: 'etemenankiFires', order: 260,
      filter: (m, info) => !!info.etemFires,
      shader(shader, material, renderer, patch) {
        const info = typeof materials.info === 'function' ? materials.info(material) : null;
        patch.uniforms(info && info.etemFires === 'wall' ? wallU : towerU);
        patch.fragment.header(`uniform vec4 uEtemFires[ ${FIRE_SLOTS} ];\nuniform vec4 uEtemFire;\nuniform vec3 uEtemFireColor;`);
        patch.fragment.after('<emissivemap_fragment>', /* glsl */ `
	if ( uEtemFire.x > 0.002 ) {
		vec3 etN = normalize( vBWorldNormal );
		float etAcc = 0.0;
		for ( int i = 0; i < ${FIRE_SLOTS}; i ++ ) {
			vec4 etF = uEtemFires[ i ];
			if ( etF.w <= 0.0 ) continue;
			vec3 etD = etF.xyz - vBWorldPos;
			float etR2 = dot( etD, etD );
			if ( etR2 > 1600.0 ) continue;
			float etR = sqrt( etR2 );
			float etNL = max( dot( etN, etD ) / max( etR, 0.05 ), 0.0 ) * 0.85 + 0.15;
			float etFl = 0.86 + 0.14 * sin( uEtemFire.y * ( 6.3 + 0.41 * float( i ) ) + 1.7 * float( i ) ) * sin( uEtemFire.y * 2.9 + 0.9 * float( i ) );
			etAcc += etF.w * etNL * etFl * smoothstep( 40.0, 14.0, etR ) / ( 1.0 + etR2 / 16.0 );
		}
		totalEmissiveRadiance += diffuseColor.rgb * uEtemFireColor * ( etAcc * uEtemFire.x * uEtemFire.z );
	}`);
      },
      key: (m, info) => 'v1:' + info.etemFires,
    });

    // ---- submit: everything of a material in one mesh (the tower straddles four 256 m tiles at the origin) ----
    const TILE = { tile: 512, tileKey: [0, 0] };
    const sub = (id, opts) => { const list = parts[id].filter(Boolean); if (list.length) geom.addStatic(mat[id], geom.merge(list), { ...TILE, ...opts }); };
    sub('brick', { reflect: true });
    sub('glaze', { reflect: true });
    sub('white', { reflect: true });
    sub('roof', {});
    sub('paving', { castShadow: false });
    sub('cedar', { castShadow: false });
    if (parts.brickDeco.length) geom.addDecal(materials.variant('bakedBrickBuff', { name: 'etemenanki-brick-deco', joint: 'bitumen', polygonOffset: 1, info: { etemFires: 'tower' } }), geom.merge(parts.brickDeco), { ...TILE });
    if (parts.breccia.length) geom.addDecal(materials.variant('breccia', { name: 'etemenanki-breccia', polygonOffset: 1, rotDeg: 90 }), geom.merge(parts.breccia), { ...TILE });

    // fire bowls: one bronze dish and its bed of embers per stand
    const dish = new THREE.LatheGeometry([[0.0, 0.0], [0.16, 0.0], [0.2, 0.06], [0.34, 0.14], [0.52, 0.3], [0.56, 0.36], [0.5, 0.36], [0.3, 0.2], [0.0, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
    const bed = new THREE.CylinderGeometry(0.47, 0.3, 0.1, 12).translate(0, 0.29, 0);
    const bowls = geom.instanced({ name: 'etemenanki-bowls', geometry: dish, material: 'bronzePatina', cell: 0, shadowTexel: 0.3 });
    const embers = geom.instanced({ name: 'etemenanki-embers', geometry: bed, material: materials.variant('ember', { name: 'etemenanki-embers', night: 9, day: 0.0, vertexColors: true }), cell: 0, castShadow: false });
    for (const b of bowlAt) { bowls.add({ x: b.p[0], y: b.p[1], z: b.p[2], scale: b.s }); embers.add({ x: b.p[0], y: b.p[1], z: b.p[2], scale: b.s }); }

    const fireGain = 1.2;
    return {
      update(frame) {
        const night = frame.light ? frame.light.night : 0;
        towerU.uEtemFire.value.set(night, frame.t, fireGain, 0);
        wallU.uEtemFire.value.set(night, frame.t, fireGain, 0);
      },
      stats: { ...zig.stats, ...pre.stats, fireBowls: zig.fires.length, braziers: pre.fires.length, courtLamps: pre.lamps.length },
      checks: [...zig.checks, ...pre.checks],
      api: { ...zig.api, precinct: pre.api },
    };
  },
};
