// js/modules/esagila/night.js — "Esagila lit from within" (SPEC 7, shot 10).
//
// Two things, both a pure function of the frame:
//   1. A material hook ('esagila-fires', order 400) on the module's OWN material variants (info.esagilaFire): the
//      fires of the temple (court fire bowls, braziers, lamps, the lit rooms behind open doors) shade walls, floors
//      and roofs per pixel, with distance falloff and N.L, scaled by the night factor. It does not use the engine's
//      pool of twelve fire lights (ENGINE.md 5.5), so the temple reads the same whatever else burns in the frame;
//      no THREE.Light is created.
//   2. One additive mesh on LAYERS.FX for what is not a lit surface of ours: the glow of lamp-lit rooms seen through
//      open doorways and the spill of light on the ground before the gates (radiance below the bloom threshold).
// The flames themselves are declared with ctx.emitters.add() in index.js and drawn by nightfx.

const MAX_FIRES = 80;

const HEADER = /* glsl */ `
uniform vec4 uEsgFire[ ${MAX_FIRES} ];   // xyz = position, w = reach (m)
uniform vec4 uEsgCol[ ${MAX_FIRES} ];    // rgb = colour x power x flicker
uniform float uEsgNight;
`;

const CHUNK = /* glsl */ `
	if ( uEsgNight > 0.001 ) {
		vec3 esgN = normalize( vBWorldNormal );
		vec3 esgSum = vec3( 0.0 );
		for ( int i = 0; i < ${MAX_FIRES}; i ++ ) {
			float esgReach = uEsgFire[ i ].w;
			vec3 esgD = uEsgFire[ i ].xyz - vBWorldPos;
			float esgR2 = dot( esgD, esgD ), esgCut = 2.6 * esgReach;
			if ( esgReach > 0.0 && esgR2 < esgCut * esgCut ) {
				float esgDist = sqrt( esgR2 );
				// half-Lambert near the flame (a flame is a volume, not a point), plain Lambert beyond
				float esgNdl = dot( esgN, esgD ) / max( esgDist, 0.05 );
				esgNdl = max( mix( esgNdl, 0.5 + 0.5 * esgNdl, clamp( 1.0 - esgDist / ( 0.35 * esgReach ), 0.0, 1.0 ) * 0.6 ), 0.0 );
				float esgAtt = 1.0 / ( 1.0 + 4.0 * esgR2 / ( esgReach * esgReach ) );
				esgAtt *= 1.0 - smoothstep( 0.55 * esgCut, esgCut, esgDist );
				esgSum += uEsgCol[ i ].rgb * ( esgNdl * esgAtt );
			}
		}
		reflectedLight.directDiffuse += esgSum * uEsgNight * BRDF_Lambert( material.diffuseColor );
	}
`;

/**
 * fires: [{ pos: [x, y, z], reach, power, color: [r, g, b] (linear), seed }]
 * glow:  { position: number[], color: number[], index: number[] } additive geometry (radiance at full night)
 * Returns { update(frame), count, dropped, mesh }.
 */
export function installNight(ctx, fires, glow) {
  const { THREE, materials, LAYERS } = ctx;
  const list = fires.slice().sort((a, b) => b.power * b.reach * b.reach - a.power * a.reach * a.reach).slice(0, MAX_FIRES);
  const pos = [], col = [];
  for (let i = 0; i < MAX_FIRES; i++) {
    const f = list[i];
    pos.push(f ? new THREE.Vector4(f.pos[0], f.pos[1], f.pos[2], f.reach) : new THREE.Vector4(0, -1e5, 0, 0));
    col.push(new THREE.Vector4(0, 0, 0, 0));
  }
  const uni = { uEsgFire: { value: pos }, uEsgCol: { value: col }, uEsgNight: { value: 0 } };

  materials.addHook({
    name: 'esagila-fires', order: 400,
    filter: (m, info) => !!(info && info.esagilaFire) && m.isMeshStandardMaterial === true,
    shader(shader, m, renderer, patch) {
      patch.uniforms(uni);
      patch.fragment.header(HEADER);
      patch.fragment.after('<lights_fragment_end>', CHUNK);
    },
    key: () => 'n' + MAX_FIRES,
  });

  // the additive glow: doorways into lit rooms, spill on the ground outside the gates
  let mesh = null;
  if (glow && glow.position.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(glow.position, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow.color, 3));
    g.setIndex(glow.index);
    g.computeBoundingSphere();
    const mat = materials.register(new THREE.ShaderMaterial({
      name: 'esagila-glow', transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uEsgNight: uni.uEsgNight },
      vertexShader: /* glsl */ `
        #include <bbl_world_pars_vertex>
        attribute vec3 aGlow; varying vec3 vGlow;
        void main() {
          vec4 wp = modelMatrix * vec4( position, 1.0 );
          vBWorldPos = wp.xyz; vBWorldNormal = vec3( 0.0, 1.0, 0.0 );
          vGlow = aGlow;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <bbl_world_pars_fragment>
        #include <bbl_aerial_pars_fragment>
        uniform float uEsgNight; varying vec3 vGlow;
        void main() {
          gl_FragColor = vec4( vGlow * uEsgNight * bblAerialFade( vBWorldPos ), 1.0 );
        }`,
    }), { owner: 'esagila', aerial: true });
    mesh = new THREE.Mesh(g, mat);
    mesh.name = 'esagila:glow'; mesh.layers.set(LAYERS.FX); mesh.castShadow = false; mesh.receiveShadow = false;
    ctx.module.group.add(mesh);
  }

  const smooth = (a, b, v) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
  return {
    count: list.length, dropped: Math.max(0, fires.length - MAX_FIRES), mesh,
    /** Per sub-frame: night factor and the flicker of every fire, both closed forms of frame.t. */
    update(frame) {
      const night = frame.light ? frame.light.night : 0, lit = smooth(0.22, 0.72, night), t = frame.t;
      uni.uEsgNight.value = lit;
      if (mesh) mesh.visible = lit > 0.001;
      if (lit <= 0.001) return;
      for (let i = 0; i < list.length; i++) {
        const f = list[i], ph = f.seed * 6.2831853;
        const k = f.steady ? 1 : 1 + 0.085 * Math.sin(t * 7.3 + ph) + 0.05 * Math.sin(t * 12.9 + 2.3 * ph) + 0.03 * Math.sin(t * 21.7 + 4.1 * ph);
        col[i].set(f.color[0] * f.power * k, f.color[1] * f.power * k, f.color[2] * f.power * k, 0);
      }
    },
  };
}
