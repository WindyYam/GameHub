/**
 * Photorealistic Procedural Icelandic Settlements & Landscape Objects System:
 * - Authentic Icelandic Villages matching real Westfjords / Búðir architecture:
 *   * Pitch-black tarred-timber Icelandic Church (Búðakirkja) with crisp white window muntins,
 *     dark-red recessed entry door, charcoal corrugated steep gable roof & slender bell spire
 *   * Low-slung traditional Icelandic Turf-Roof Farmhouses (Torfbæir) with dry-stacked mossy
 *     basalt rubble stone walls, dark tarred gables, overhanging lush mossy turf roofs,
 *     stone chimneys & drifting volumetric woodsmoke plumes
 *   * Weathered silver-grey driftwood vertical-plank timber barns with zinc/moss-green roofs
 *   * Rustic crooked wooden sheep-paddock fences, low mossy dry-stone walls, firewood stacks,
 *     and twilight-aware dark reflective glass windows (dark glass by day, warm hearth glow at dusk/night)
 * - Hexagonal Basalt Column Outcrops, Weathered Timber Footbridges, Stone Cairns (Vörður),
 *   Bridges Geothermal Research Domes, Trail Beacons & Rusted Hydro-Relay Towers
 */
import * as THREE from 'three';
import { hash2i } from './noise.js';
import { CELL_SIZE, getCellFeatures, getTerrainHeight, getTerrainNormal } from './world.js';
import { ATMO_UNIFORMS, ATMO_GLSL_PARS, enhanceMaterialWithAtmo } from './atmosphere.js';

/** Build a thick pitched gable roof shell (sloped eaves + ridge cap beam). */
function createThickPitchedRoof(width, length, height, mat, ridgeMat, overhang = 0.38, thickness = 0.22) {
  const grp = new THREE.Group();
  const slopeW = Math.hypot(width * 0.5 + overhang, height);
  const slopeAngle = Math.atan2(height, width * 0.5 + overhang);
  const slabGeo = new THREE.BoxGeometry(slopeW, thickness, length + overhang * 2);

  const left = new THREE.Mesh(slabGeo, mat);
  left.position.set(-(width * 0.5 + overhang) * 0.5, height * 0.5, 0);
  left.rotation.z = slopeAngle;
  left.castShadow = true;
  left.receiveShadow = true;
  grp.add(left);

  const right = new THREE.Mesh(slabGeo, mat);
  right.position.set((width * 0.5 + overhang) * 0.5, height * 0.5, 0);
  right.rotation.z = -slopeAngle;
  right.castShadow = true;
  right.receiveShadow = true;
  grp.add(right);

  if (ridgeMat) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, length + overhang * 2 + 0.08), ridgeMat);
    ridge.position.set(0, height + thickness * 0.35, 0);
    grp.add(ridge);
  }
  return grp;
}

/** Build an organic, subtly mounded thick mossy turf roof for authentic Icelandic turf farmhouses. */
function createOrganicTurfRoof(width, length, height, turfMat, fasciaMat) {
  const grp = new THREE.Group();
  const overhang = 0.44;
  const slopeW = Math.hypot(width * 0.5 + overhang, height);
  const slopeAngle = Math.atan2(height, width * 0.5 + overhang);

  // Subdivided turf slabs with subtle organic pillowy undulation so the roof never looks like a flat plastic plank!
  const makeTurfSlope = (seedSign) => {
    const geo = new THREE.BoxGeometry(slopeW, 0.48, length + overhang * 2, 6, 2, 10);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y > 0) {
        const bump = 0.12 * Math.sin(z * 1.45 + seedSign * 1.2) + 0.08 * Math.cos(x * 2.1 - z * 0.85);
        pos.setY(i, y + bump);
      }
    }
    geo.computeVertexNormals();
    return geo;
  };

  const left = new THREE.Mesh(makeTurfSlope(-1), turfMat);
  left.position.set(-(width * 0.5 + overhang) * 0.5, height * 0.5 + 0.06, 0);
  left.rotation.z = slopeAngle;
  left.castShadow = true;
  left.receiveShadow = true;
  grp.add(left);

  const right = new THREE.Mesh(makeTurfSlope(1), turfMat);
  right.position.set((width * 0.5 + overhang) * 0.5, height * 0.5 + 0.06, 0);
  right.rotation.z = -slopeAngle;
  right.castShadow = true;
  right.receiveShadow = true;
  grp.add(right);

  // Rounded mossy turf crest along roof ridge (hides hard seam between left & right slopes!)
  const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, length + overhang * 2, 7), turfMat);
  crest.rotation.x = Math.PI * 0.5;
  crest.scale.set(1.2, 1.0, 0.75);
  crest.position.set(0, height + 0.14, 0);
  crest.castShadow = true;
  grp.add(crest);

  // Weathered dark timber gable verge bargeboards along front & rear eaves
  for (const sz of [-(length * 0.5 + overhang * 0.85), length * 0.5 + overhang * 0.85]) {
    for (const side of [-1, 1]) {
      const barge = new THREE.Mesh(new THREE.BoxGeometry(slopeW, 0.24, 0.12), fasciaMat);
      barge.position.set(side * (width * 0.5 + overhang) * 0.5, height * 0.5 - 0.05, sz);
      barge.rotation.z = -side * slopeAngle;
      grp.add(barge);
    }
  }
  return grp;
}

/** Build triangular gable end-wall fill with clean UVs matching vertical siding. */
function createGableEndGeo(width, height) {
  const hw = width * 0.5;
  const positions = [-hw, 0, 0, hw, 0, 0, 0, height, 0];
  const uvs = [0, 0, 1, 0, 0.5, 1];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/** Build crisp multi-pane Nordic window (white outer frame + cross muntin bars + recessed glass pane). */
function createNordicWindow(w, h, trimMat, glassMat, panesY = 2) {
  const grp = new THREE.Group();
  const t = 0.065;
  const d = 0.09;

  // Outer white timber casing
  const topB = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, d), trimMat);
  topB.position.y = h * 0.5;
  grp.add(topB);
  const botB = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2.5, t * 1.15, d * 1.25), trimMat);
  botB.position.y = -h * 0.5;
  grp.add(botB);
  for (const sx of [-w * 0.5, w * 0.5]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), trimMat);
    jamb.position.x = sx;
    grp.add(jamb);
  }
  // Delicate muntin mullions (gives unmistakable historic Icelandic cottage/church scale!)
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(t * 0.52, h, d * 0.65), trimMat);
  grp.add(vBar);
  for (let i = 1; i < panesY; i++) {
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(w, t * 0.52, d * 0.65), trimMat);
    hBar.position.y = -h * 0.5 + (i / panesY) * h;
    grp.add(hBar);
  }
  // Recessed glass pane (dark reflective glass by day -> subtle warm hearth glow at dusk/night)
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w - t * 0.4, h - t * 0.4, 0.03), glassMat);
  glass.position.z = -0.02;
  grp.add(glass);

  return grp;
}

export function createLandmarkSystem(texLib, scene) {
  const root = new THREE.Group();
  scene.add(root);

  // Single pre-allocated interior PointLight so opening a door NEVER changes shader light count (zero freeze!)
  const interiorLight = new THREE.PointLight(0xffb45a, 0.0001, 20, 1.5);
  interiorLight.castShadow = false;
  scene.add(interiorLight);

  // Tiny prewarm meshes so all interior-only materials compile during loading screen (zero first-open hitch!)
  const prewarmGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const prewarmGroup = new THREE.Group();
  prewarmGroup.position.set(0, -500, 0);
  scene.add(prewarmGroup);

  const makeMat = (opts, key, wet = 0.65) => {
    const m = new THREE.MeshStandardMaterial(opts);
    enhanceMaterialWithAtmo(m, { cacheKey: key, wetnessBoost: wet });
    return m;
  };

  // Architectural & Landmark PBR Materials
  const tarredChurchMat = makeMat({
    color: 0xffffff,
    map: texLib.tarredWood.map,
    normalMap: texLib.tarredWood.normalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.68,
    metalness: 0.04
  }, 'ls_tarred_church_v2', 0.7);

  const weatheredBarnMat = makeMat({
    color: 0xd8dce0,
    map: texLib.weatheredWood.map,
    normalMap: texLib.weatheredWood.normalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.84,
    metalness: 0.02
  }, 'ls_weathered_barn_v2', 0.65);

  const darkWeatheredTimberMat = makeMat({
    color: 0x8e8478,
    map: texLib.weatheredWood.map,
    normalMap: texLib.weatheredWood.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 0.86,
    metalness: 0.02
  }, 'ls_dark_weathered_wood_v2', 0.7);

  const dryStoneMat = makeMat({
    color: 0xd4dade,
    map: texLib.dryStone.map,
    normalMap: texLib.dryStone.normalMap,
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughness: 0.88,
    metalness: 0.02
  }, 'ls_dry_stone_v2', 0.75);

  const turfRoofMat = makeMat({
    color: 0x849e34,
    map: texLib.moss.map,
    normalMap: texLib.moss.normalMap,
    normalScale: new THREE.Vector2(1.7, 1.7),
    roughness: 0.94,
    metalness: 0.0
  }, 'ls_turf_roof_v3', 0.15);

  const roofCharcoalMat = makeMat({
    color: 0x5e6872,
    map: texLib.corrugatedIron.map,
    normalMap: texLib.corrugatedIron.normalMap,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughness: 0.56,
    metalness: 0.30
  }, 'ls_roof_charcoal_v4', 0.65);

  const roofZincMat = makeMat({
    color: 0xaab4ba,
    map: texLib.corrugatedIron.map,
    normalMap: texLib.corrugatedIron.normalMap,
    normalScale: new THREE.Vector2(0.60, 0.60),
    roughness: 0.60,
    metalness: 0.32
  }, 'ls_roof_zinc_v4', 0.65);

  const roofMossTinMat = makeMat({
    color: 0x728a6a,
    map: texLib.corrugatedIron.map,
    normalMap: texLib.corrugatedIron.normalMap,
    normalScale: new THREE.Vector2(0.60, 0.60),
    roughness: 0.66,
    metalness: 0.24
  }, 'ls_roof_mosstin_v4', 0.62);

  const trimWhiteMat = makeMat({
    color: 0xf0f2f4,
    roughness: 0.72,
    metalness: 0.02
  }, 'ls_trim_white_v3', 0.45);

  const nordicPaintMats = [
    makeMat({
      color: 0x9c382c, // Falu red
      map: texLib.weatheredWood.map,
      normalMap: texLib.weatheredWood.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.74,
      metalness: 0.02
    }, 'ls_nordic_red_v1', 0.55),
    makeMat({
      color: 0xb8853a, // Warm Nordic ochre
      map: texLib.weatheredWood.map,
      normalMap: texLib.weatheredWood.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.74,
      metalness: 0.02
    }, 'ls_nordic_ochre_v1', 0.55),
    makeMat({
      color: 0x425b74, // Slate fjord blue
      map: texLib.weatheredWood.map,
      normalMap: texLib.weatheredWood.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.74,
      metalness: 0.02
    }, 'ls_nordic_blue_v1', 0.55),
    makeMat({
      color: 0x5c7258, // Sage lichen green
      map: texLib.weatheredWood.map,
      normalMap: texLib.weatheredWood.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.74,
      metalness: 0.02
    }, 'ls_nordic_sage_v1', 0.55)
  ];

  const doorRedMat = makeMat({
    color: 0x98342a,
    roughness: 0.64,
    metalness: 0.06
  }, 'ls_door_red_v2', 0.6);

  const brassHardwareMat = makeMat({
    color: 0xd4aa52,
    roughness: 0.34,
    metalness: 0.78
  }, 'ls_brass_hw', 0.3);

  // Warm Interior Materials (shared across on-demand building interiors)
  const floorTimberMat = makeMat({
    color: 0xa6845e,
    map: texLib.weatheredWood.map,
    normalMap: texLib.weatheredWood.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.74,
    metalness: 0.02
  }, 'ls_floor_timber', 0.05);

  const interiorTimberMat = makeMat({
    color: 0x946a42,
    map: texLib.weatheredWood.map,
    normalMap: texLib.weatheredWood.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.66,
    metalness: 0.03
  }, 'ls_int_timber', 0.05);

  const aisleRunnerMat = makeMat({
    color: 0x8a2c26,
    roughness: 0.90,
    metalness: 0.0
  }, 'ls_aisle_runner', 0.02);

  const woolBlanketMat = makeMat({
    color: 0xb2a896,
    roughness: 0.95,
    metalness: 0.0
  }, 'ls_wool_blanket', 0.02);

  const hayStrawMat = makeMat({
    color: 0xc2a24e,
    normalMap: texLib.moss.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.96,
    metalness: 0.0
  }, 'ls_hay_straw', 0.02);

  const emberGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.92, 0.22) });
  const candleGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.65, 0.62) });

  for (const pm of [floorTimberMat, interiorTimberMat, aisleRunnerMat, woolBlanketMat, hayStrawMat, emberGlowMat, candleGlowMat]) {
    const m = new THREE.Mesh(prewarmGeo, pm);
    m.frustumCulled = false;
    prewarmGroup.add(m);
  }

  const outpostMat = makeMat({
    color: 0x9aa4ab,
    map: texLib.outpostMetal.map,
    normalMap: texLib.outpostMetal.normalMap,
    roughness: 0.44,
    metalness: 0.56
  }, 'ls_outpost_dome', 0.7);

  const concreteMat = makeMat({
    color: 0x3b4146,
    map: texLib.scree.map,
    normalMap: texLib.scree.normalMap,
    roughness: 0.88,
    metalness: 0.05
  }, 'ls_outpost_conc', 0.7);

  const basaltColMat = makeMat({
    color: 0x565d65,
    map: texLib.basaltCliff.map,
    normalMap: texLib.basaltCliff.normalMap,
    roughness: 0.78,
    metalness: 0.04
  }, 'ls_basalt_col', 0.75);

  const rustMat = makeMat({
    color: 0x9b5535,
    map: texLib.rustedIron.map,
    normalMap: texLib.rustedIron.normalMap,
    roughness: 0.74,
    metalness: 0.35
  }, 'ls_rusted_relay', 0.6);

  const darkSteelMat = makeMat({
    color: 0x4a525a,
    roughness: 0.44,
    metalness: 0.72
  }, 'ls_dark_steel_v2', 0.6);

  // Icelandic grazing sheep wool (warm textured creamy-oatmeal fleece + charcoal face/legs)
  const sheepWoolMat = makeMat({
    color: 0xc2bdb0,
    normalMap: texLib.moss.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.96,
    metalness: 0.0
  }, 'ls_sheep_wool_v2', 0.12);

  const sheepDarkMat = makeMat({
    color: 0x201e1c,
    roughness: 0.88,
    metalness: 0.02
  }, 'ls_sheep_dark', 0.25);

  // Realistic Time-of-Day Window Glass Shader:
  // Dark cool reflective sky-glass in daytime overcast -> warm cozy hearth glow at dusk/night!
  const windowGlassMat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { ...ATMO_UNIFORMS },
    vertexShader: /* glsl */`
      varying vec3 vWPos;
      varying vec3 vWNorm;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vWNorm = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vWPos;
      varying vec3 vWNorm;
      varying vec2 vUv;
      ${ATMO_GLSL_PARS}
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWPos);
        float fres = pow(1.0 - abs(dot(normalize(vWNorm), viewDir)), 3.0);
        // Daytime: sky-reflective glass with subtle warm interior candle hint -> rich cozy hearth glow at dusk/night
        vec3 dayGlass = mix(vec3(0.06, 0.075, 0.09), uFogColor * 0.68, clamp(fres * 0.78 + 0.16, 0.0, 0.75));
        float duskGlow = smoothstep(0.05, 0.55, uNightFactor) * 0.86 + 0.12;
        vec3 warmHearth = vec3(1.55, 0.96, 0.42) * mix(0.68, 1.18, 1.0 - vUv.y);
        vec3 col = mix(dayGlass, warmHearth, duskGlow);
        col = applyIcelandAtmo(col, vWPos);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  // Drifting Translucent Woodsmoke Plume Shader (for authentic Icelandic turf-house chimneys!)
  const chimneySmokeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      ...ATMO_UNIFORMS,
      uMistTex: { value: texLib.mistPuff }
    },
    vertexShader: /* glsl */`
      attribute vec4 aSmokeSeed;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vLife;
      varying float vSeed;
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uWindStrength;
      void main() {
        vUv = uv;
        vSeed = aSmokeSeed.x;
        // Continuous rising & wind-drifting chimney smoke cycle [0..1]
        float life = fract(uTime * 0.095 + aSmokeSeed.y);
        vLife = life;

        #ifdef USE_INSTANCING
          vec3 origin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif

        float rise = life * 16.5;
        float driftDist = pow(life, 1.25) * (16.0 + uWindStrength * 14.0);
        vec3 center = origin + vec3(
          uWindDir.x * driftDist + sin(uTime * 0.6 + vSeed) * life * 1.4,
          rise,
          uWindDir.y * driftDist + cos(uTime * 0.5 + vSeed) * life * 1.4
        );

        float sz = mix(1.4, 9.8, pow(life, 0.78)) * aSmokeSeed.z;
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = center + camRight * position.x * sz * 1.3 + camUp * position.y * sz;
        vWorldPos = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMistTex;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vLife;
      varying float vSeed;
      ${ATMO_GLSL_PARS}
      void main() {
        vec2 c = (vUv - 0.5) * 2.0;
        float r2 = dot(c, c);
        if (r2 >= 0.94) discard;
        float radial = pow(max(1.0 - r2 / 0.94, 0.0), 2.3);
        float wisp = atmoFbm(vUv * 3.2 + vec2(vSeed, -uTime * 0.22));
        float texA = texture2D(uMistTex, vUv).a;
        float fade = smoothstep(0.0, 0.14, vLife) * (1.0 - smoothstep(0.45, 1.0, vLife));
        float a = radial * mix(texA, wisp, 0.5) * fade * 0.34;
        if (a < 0.008) discard;
        vec3 col = mix(vec3(0.76, 0.80, 0.84) * uSunColor, vec3(0.06, 0.08, 0.11), uNightFactor * 0.88);
        col = applyIcelandAtmo(col, vWorldPos);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const cyanGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.9, 2.35) });
  const amberGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.35, 0.38) });

  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 64;
  const hctx = haloCanvas.getContext('2d');
  const grad = hctx.createRadialGradient(32, 32, 1, 32, 32, 28);
  grad.addColorStop(0, 'rgba(255,250,235,0.92)');
  grad.addColorStop(0.25, 'rgba(130,235,255,0.45)');
  grad.addColorStop(1, 'rgba(0,180,255,0.0)');
  hctx.fillStyle = grad;
  hctx.fillRect(0, 0, 64, 64);
  const haloTex = new THREE.CanvasTexture(haloCanvas);

  const cyanSpriteMat = new THREE.SpriteMaterial({
    map: haloTex, color: 0x38e8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const amberSpriteMat = new THREE.SpriteMaterial({
    map: haloTex, color: 0xffc455, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  });

  function addBoxCollider(colliders, spec, lx, lz, hx, hz, sc = 1.0, extra = {}) {
    const cosY = Math.cos(spec.yaw);
    const sinY = Math.sin(spec.yaw);
    const wx = spec.x + (lx * cosY + lz * sinY) * sc;
    const wz = spec.z + (-lx * sinY + lz * cosY) * sc;
    const col = {
      kind: 'box',
      x: wx,
      z: wz,
      r: Math.hypot(hx, hz) * sc,
      hx: hx * sc,
      hz: hz * sc,
      cosY,
      sinY,
      ...extra
    };
    colliders.push(col);
    return col;
  }

  function addHollowWallShell(grp, colliders, spec, opts) {
    const {
      w, h, len, wt, baseY = 0.95,
      doorX = 0, doorW = 1.4, doorH = 2.2,
      sc = 1.0, sideMat, frontMat, backMat,
      doorState, sideColPad = 0
    } = opts;
    const fMat = frontMat || sideMat;
    const bMat = backMat || sideMat;

    // Left & right structural walls
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wt, h, len), sideMat);
      wall.position.set(side * (w * 0.5 - wt * 0.5), baseY + h * 0.5, 0);
      wall.castShadow = true;
      wall.receiveShadow = true;
      grp.add(wall);
      addBoxCollider(colliders, spec, side * (w * 0.5 - wt * 0.5), 0, wt * 0.5 + sideColPad, len * 0.5, sc);
    }

    // Back wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w - wt * 2, h, wt), bMat);
    backWall.position.set(0, baseY + h * 0.5, -(len * 0.5 - wt * 0.5));
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    grp.add(backWall);
    addBoxCollider(colliders, spec, 0, -(len * 0.5 - wt * 0.5), (w - wt * 2) * 0.5, wt * 0.5, sc);

    // Front wall split around doorway opening
    const frontZ = len * 0.5 - wt * 0.5;
    const innerLeft = -w * 0.5 + wt;
    const innerRight = w * 0.5 - wt;
    const doorLeft = doorX - doorW * 0.5;
    const doorRight = doorX + doorW * 0.5;

    const lw = doorLeft - innerLeft;
    if (lw > 0.05) {
      const fLeft = new THREE.Mesh(new THREE.BoxGeometry(lw, h, wt), fMat);
      fLeft.position.set(innerLeft + lw * 0.5, baseY + h * 0.5, frontZ);
      fLeft.castShadow = true;
      fLeft.receiveShadow = true;
      grp.add(fLeft);
      addBoxCollider(colliders, spec, innerLeft + lw * 0.5, frontZ, lw * 0.5, wt * 0.5, sc);
    }

    const rw = innerRight - doorRight;
    if (rw > 0.05) {
      const fRight = new THREE.Mesh(new THREE.BoxGeometry(rw, h, wt), fMat);
      fRight.position.set(doorRight + rw * 0.5, baseY + h * 0.5, frontZ);
      fRight.castShadow = true;
      fRight.receiveShadow = true;
      grp.add(fRight);
      addBoxCollider(colliders, spec, doorRight + rw * 0.5, frontZ, rw * 0.5, wt * 0.5, sc);
    }

    const lintelH = Math.max(0.18, h - doorH);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.04, lintelH, wt), fMat);
    lintel.position.set(doorX, baseY + doorH + lintelH * 0.5, frontZ);
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    grp.add(lintel);

    if (doorState) {
      addBoxCollider(colliders, spec, doorX, frontZ, doorW * 0.5, wt * 0.5, sc, {
        doorRef: doorState,
        isDoor: true
      });
    }
  }

  /**
   * 1. Iconic Tarred Timber Icelandic Church (Búðakirkja style!) — Full Walkable Interior Scale
   */
  function buildIcelandicChurch(spec, colliders, buildingsList, doorsList) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    const sc = 1.0;
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;

    const w = 7.4;
    const h = 4.2;
    const len = 13.4;
    const roofH = 3.6;
    const wt = 0.28;
    const baseY = 0.95;
    const doorW = 1.68;
    const doorH = 2.48;

    const cosY = Math.cos(spec.yaw);
    const sinY = Math.sin(spec.yaw);
    const doorWorldX = spec.x + (len * 0.5) * sinY;
    const doorWorldZ = spec.z + (len * 0.5) * cosY;

    const doorState = {
      id: `church_${Math.round(spec.x)}_${Math.round(spec.z)}`,
      label: 'Church',
      worldX: doorWorldX,
      worldY: gy - 0.35 + baseY,
      worldZ: doorWorldZ,
      isOpen: false,
      openProgress: 0,
      isDouble: true,
      leftPivot: null,
      rightPivot: null,
      swingAngle: 1.68
    };
    doorsList.push(doorState);

    // Deep dry-stone basalt plinth sunk into hillside (top sits cleanly at baseY = 0.95)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.65, 2.70, len + 0.65), dryStoneMat);
    plinth.position.y = baseY - 1.35;
    plinth.receiveShadow = true;
    grp.add(plinth);

    // Hollow tarred-timber nave with openable doorway
    addHollowWallShell(grp, colliders, spec, {
      w, h, len, wt, baseY,
      doorX: 0, doorW, doorH, sc,
      sideMat: tarredChurchMat,
      doorState
    });

    // Front & rear gable end triangles
    const gableGeo = createGableEndGeo(w, roofH);
    const gFront = new THREE.Mesh(gableGeo, tarredChurchMat);
    gFront.position.set(0, baseY + h, len * 0.5 + 0.01);
    gFront.castShadow = true;
    gFront.receiveShadow = true;
    grp.add(gFront);
    const gBack = new THREE.Mesh(gableGeo, tarredChurchMat);
    gBack.position.set(0, baseY + h, -len * 0.5 - 0.01);
    gBack.rotation.y = Math.PI;
    gBack.castShadow = true;
    gBack.receiveShadow = true;
    grp.add(gBack);

    // Crisp white eaves cornice strips along both flanks + vertical corner pilasters
    for (const sx of [-w * 0.5 - 0.04, w * 0.5 + 0.04]) {
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, len + 0.52), trimWhiteMat);
      cornice.position.set(sx, baseY + h - 0.04, 0);
      grp.add(cornice);
    }
    for (const sx of [-w * 0.5 + 0.04, w * 0.5 - 0.04]) {
      for (const sz of [-len * 0.5 + 0.04, len * 0.5 - 0.04]) {
        const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.16, h + 0.06, 0.16), trimWhiteMat);
        pilaster.position.set(sx, baseY + h * 0.5, sz);
        grp.add(pilaster);
      }
    }

    // Steep charcoal-slate corrugated gable roof + ridge cap + crisp white gable verge fascia boards
    const roofOverhang = 0.42;
    const roof = createThickPitchedRoof(w, len, roofH, roofCharcoalMat, darkSteelMat, roofOverhang, 0.20);
    roof.position.y = baseY + h;
    grp.add(roof);

    const slopeW = Math.hypot(w * 0.5 + roofOverhang, roofH);
    const slopeAngle = Math.atan2(roofH, w * 0.5 + roofOverhang);
    for (const sz of [-(len * 0.5 + roofOverhang * 0.94), len * 0.5 + roofOverhang * 0.94]) {
      for (const side of [-1, 1]) {
        const rake = new THREE.Mesh(new THREE.BoxGeometry(slopeW + 0.08, 0.20, 0.12), trimWhiteMat);
        rake.position.set(side * (w * 0.5 + roofOverhang) * 0.5, baseY + h + roofH * 0.5 - 0.03, sz);
        rake.rotation.z = -side * slopeAngle;
        grp.add(rake);
      }
    }

    // Slender tarred square bell tower steeple rising from front ridge
    const towerZ = len * 0.5 - 1.65;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.6, 2.1), tarredChurchMat);
    tower.position.set(0, baseY + h + 2.65, towerZ);
    tower.castShadow = true;
    tower.receiveShadow = true;
    grp.add(tower);

    for (const sx of [-1.01, 1.01]) {
      for (const sz of [-1.01, 1.01]) {
        const tPil = new THREE.Mesh(new THREE.BoxGeometry(0.11, 3.55, 0.11), trimWhiteMat);
        tPil.position.set(sx, baseY + h + 2.65, towerZ + sz);
        grp.add(tPil);
      }
    }
    const towerTrim = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.15, 2.28), trimWhiteMat);
    towerTrim.position.set(0, baseY + h + 4.42, towerZ);
    grp.add(towerTrim);

    const belfryFront = createNordicWindow(0.66, 0.88, trimWhiteMat, windowGlassMat, 2);
    belfryFront.position.set(0, baseY + h + 3.55, towerZ + 1.07);
    grp.add(belfryFront);
    for (const side of [-1, 1]) {
      const belfrySide = createNordicWindow(0.64, 0.88, trimWhiteMat, windowGlassMat, 2);
      belfrySide.position.set(side * 1.07, baseY + h + 3.55, towerZ);
      belfrySide.rotation.y = side * Math.PI * 0.5;
      grp.add(belfrySide);
    }

    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.62, 3.8, 4), roofCharcoalMat);
    spire.position.set(0, baseY + h + 6.35, towerZ);
    spire.rotation.y = Math.PI * 0.25;
    spire.castShadow = true;
    spire.receiveShadow = true;
    grp.add(spire);

    const finialOrb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), brassHardwareMat);
    finialOrb.position.set(0, baseY + h + 8.22, towerZ);
    grp.add(finialOrb);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.25, 0.09), trimWhiteMat);
    crossV.position.set(0, baseY + h + 8.80, towerZ);
    grp.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.09, 0.09), trimWhiteMat);
    crossH.position.set(0, baseY + h + 9.02, towerZ);
    grp.add(crossH);

    // Crisp white-trimmed oxblood-red double doorway + pediment cap + flanking porch lanterns + stone steps
    const frontZ = len * 0.5;
    for (const sx of [-doorW * 0.5 - 0.07, doorW * 0.5 + 0.07]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, doorH + 0.10, 0.34), trimWhiteMat);
      jamb.position.set(sx, baseY + doorH * 0.5, frontZ - 0.08);
      grp.add(jamb);
    }
    const doorPediment = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.52, 0.18, 0.40), trimWhiteMat);
    doorPediment.position.set(0, baseY + doorH + 0.10, frontZ - 0.04);
    grp.add(doorPediment);

    // Dynamic pivoting double doors wrapped in a mount group (preserves world yaw/scale cleanly!)
    const doorMount = new THREE.Group();
    doorMount.userData.keepDynamic = true;
    doorMount.position.set(0, baseY, frontZ - 0.12);
    grp.add(doorMount);

    const leafW = doorW * 0.5 - 0.015;
    const leftPivot = new THREE.Group();
    leftPivot.position.set(-doorW * 0.5, 0, 0);
    const leftLeaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, doorH - 0.04, 0.09), doorRedMat);
    leftLeaf.position.set(leafW * 0.5, (doorH - 0.04) * 0.5, 0);
    leftLeaf.castShadow = true;
    leftPivot.add(leftLeaf);
    const leftHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.14), brassHardwareMat);
    leftHandle.position.set(leafW - 0.12, 1.05, 0);
    leftPivot.add(leftHandle);
    doorMount.add(leftPivot);

    const rightPivot = new THREE.Group();
    rightPivot.position.set(doorW * 0.5, 0, 0);
    const rightLeaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, doorH - 0.04, 0.09), doorRedMat);
    rightLeaf.position.set(-leafW * 0.5, (doorH - 0.04) * 0.5, 0);
    rightLeaf.castShadow = true;
    rightPivot.add(rightLeaf);
    const rightHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.14), brassHardwareMat);
    rightHandle.position.set(-(leafW - 0.12), 1.05, 0);
    rightPivot.add(rightHandle);
    doorMount.add(rightPivot);

    doorState.leftPivot = leftPivot;
    doorState.rightPivot = rightPivot;

    for (const sx of [-1.28, 1.28]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.24), darkSteelMat);
      bracket.position.set(sx, baseY + 2.15, frontZ + 0.10);
      grp.add(bracket);
      const lanternGlass = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.28, 0.20), windowGlassMat);
      lanternGlass.position.set(sx, baseY + 1.98, frontZ + 0.18);
      grp.add(lanternGlass);
      const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.12, 4), darkSteelMat);
      lanternCap.position.set(sx, baseY + 2.18, frontZ + 0.18);
      lanternCap.rotation.y = Math.PI * 0.25;
      grp.add(lanternCap);
    }

    const stepLower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.36, 1.35), dryStoneMat);
    stepLower.position.set(0, baseY - 0.32, frontZ + 0.65);
    stepLower.receiveShadow = true;
    grp.add(stepLower);
    const stepUpper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.32, 0.72), dryStoneMat);
    stepUpper.position.set(0, baseY - 0.10, frontZ + 0.34);
    stepUpper.receiveShadow = true;
    grp.add(stepUpper);

    // Small gable window above front door
    const gableWin = createNordicWindow(0.82, 1.04, trimWhiteMat, windowGlassMat, 2);
    gableWin.position.set(0, baseY + h + 1.25, frontZ + 0.05);
    grp.add(gableWin);

    // Three tall narrow crisp white-muntin church windows along each flank
    for (const side of [-1, 1]) {
      for (const wz of [-3.8, 0.0, 3.8]) {
        const win = createNordicWindow(0.96, 1.72, trimWhiteMat, windowGlassMat, 3);
        win.position.set(side * (w * 0.5 + 0.04), baseY + 2.25, wz);
        win.rotation.y = side * Math.PI * 0.5;
        grp.add(win);
      }
    }

    buildingsList.push({
      kind: 'church',
      spec, gy, w, h, len, roofH, wt, sc, cosY, sinY,
      floorWorldY: gy - 0.35 + baseY,
      door: doorState,
      interiorBuilt: false,
      interiorGroup: null,
      interiorDisposables: [],
      interiorLights: [],
      interiorColliders: []
    });

    return grp;
  }

  /**
   * 2. Traditional Low-Slung Icelandic Turf-Roof Farmhouse (Torfbær) — Larger Walkable Structure
   */
  function buildTurfCottage(spec, smokeOrigins, colliders, buildingsList, doorsList) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    const sc = spec.scale || 1.0;
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;
    grp.scale.setScalar(sc);

    const w = 7.2;
    const h = 2.65;
    const len = 11.2;
    const roofH = 2.75;
    const wt = 0.44;
    const baseY = 0.95;
    const doorX = -1.15;
    const doorW = 1.25;
    const doorH = 2.15;

    const cosY = Math.cos(spec.yaw);
    const sinY = Math.sin(spec.yaw);
    const doorWorldX = spec.x + (doorX * cosY + (len * 0.5) * sinY) * sc;
    const doorWorldZ = spec.z + (-doorX * sinY + (len * 0.5) * cosY) * sc;

    const doorState = {
      id: `cottage_${Math.round(spec.x)}_${Math.round(spec.z)}`,
      label: 'Turf Farmhouse',
      worldX: doorWorldX,
      worldY: gy - 0.35 + baseY * sc,
      worldZ: doorWorldZ,
      isOpen: false,
      openProgress: 0,
      isDouble: false,
      leftPivot: null,
      rightPivot: null,
      swingAngle: -1.65
    };
    doorsList.push(doorState);

    // Sunken dry-stacked mossy basalt foundation & subfloor (top at baseY)
    const stoneFloor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.85, 2.70, len + 0.45), dryStoneMat);
    stoneFloor.position.y = baseY - 1.35;
    stoneFloor.receiveShadow = true;
    grp.add(stoneFloor);

    // Hollow dry-stone side & back walls + tarred-timber front wall with doorway opening
    addHollowWallShell(grp, colliders, spec, {
      w, h, len, wt, baseY,
      doorX, doorW, doorH, sc,
      sideMat: dryStoneMat,
      backMat: tarredChurchMat,
      frontMat: tarredChurchMat,
      doorState,
      sideColPad: 0.35
    });

    const gGeo = createGableEndGeo(w - 0.24, roofH);
    const gf = new THREE.Mesh(gGeo, tarredChurchMat);
    gf.position.set(0, baseY + h, len * 0.5 + 0.02);
    gf.castShadow = true;
    grp.add(gf);
    const gb = new THREE.Mesh(gGeo, tarredChurchMat);
    gb.position.set(0, baseY + h, -len * 0.5 - 0.02);
    gb.rotation.y = Math.PI;
    gb.castShadow = true;
    grp.add(gb);

    // Thick sculpted mossy Icelandic turf roof
    const turfRoof = createOrganicTurfRoof(w + 0.55, len + 0.3, roofH, turfRoofMat, darkWeatheredTimberMat);
    turfRoof.position.y = baseY + h - 0.04;
    grp.add(turfRoof);

    // Traditional battered mossy turf-and-earth side buttress embankments
    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(1.25, h + 0.45, len - 0.55), turfRoofMat);
      bank.position.set(side * (w * 0.5 + 0.48), baseY + 0.35, 0);
      bank.rotation.z = side * 0.34;
      bank.castShadow = true;
      bank.receiveShadow = true;
      grp.add(bank);
    }

    // Weathered stone chimney
    const chX = -1.35;
    const chY = baseY + h + roofH + 0.55;
    const chZ = -1.6;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.82, 2.2, 0.82), dryStoneMat);
    chimney.position.set(chX, chY - 0.55, chZ);
    chimney.castShadow = true;
    grp.add(chimney);

    if (spec.hasSmoke) {
      const wx = spec.x + (chX * cosY + chZ * sinY) * sc;
      const wz = spec.z + (-chX * sinY + chZ * cosY) * sc;
      const wy = (gy - 0.35) + (chY + 0.55) * sc;
      smokeOrigins.push({ x: wx, y: wy, z: wz });
    }

    // Timber entry door frame, projecting porch hood, stone steps & dynamic pivoting door
    const frontZ = len * 0.5;
    for (const sx of [doorX - doorW * 0.5 - 0.06, doorX + doorW * 0.5 + 0.06]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH + 0.08, 0.38), darkWeatheredTimberMat);
      jamb.position.set(sx, baseY + doorH * 0.5, frontZ - 0.08);
      grp.add(jamb);
    }
    const porchHood = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.55, 0.14, 0.72), darkWeatheredTimberMat);
    porchHood.position.set(doorX, baseY + doorH + 0.10, frontZ + 0.18);
    porchHood.castShadow = true;
    grp.add(porchHood);

    const doorMount = new THREE.Group();
    doorMount.userData.keepDynamic = true;
    doorMount.position.set(doorX - doorW * 0.5, baseY, frontZ - 0.18);
    grp.add(doorMount);

    const doorPivot = new THREE.Group();
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.04, doorH - 0.04, 0.09), darkWeatheredTimberMat);
    doorLeaf.position.set((doorW - 0.04) * 0.5, (doorH - 0.04) * 0.5, 0);
    doorLeaf.castShadow = true;
    doorPivot.add(doorLeaf);
    const doorLatch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.14), brassHardwareMat);
    doorLatch.position.set(doorW - 0.18, 1.0, 0);
    doorPivot.add(doorLatch);
    doorMount.add(doorPivot);
    doorState.leftPivot = doorPivot;

    const cStep = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.34, 0.95), dryStoneMat);
    cStep.position.set(doorX, baseY - 0.24, frontZ + 0.42);
    cStep.receiveShadow = true;
    grp.add(cStep);

    // Crisp white-framed multi-pane windows (front, attic & rear)
    const winF = createNordicWindow(1.05, 1.08, trimWhiteMat, windowGlassMat, 2);
    winF.position.set(1.35, baseY + 1.35, frontZ + 0.04);
    grp.add(winF);

    const winAttic = createNordicWindow(0.72, 0.78, trimWhiteMat, windowGlassMat, 2);
    winAttic.position.set(0.0, baseY + h + 1.15, frontZ + 0.05);
    grp.add(winAttic);

    const winRear = createNordicWindow(0.95, 1.02, trimWhiteMat, windowGlassMat, 2);
    winRear.position.set(0.0, baseY + 1.32, -(frontZ + 0.04));
    winRear.rotation.y = Math.PI;
    grp.add(winRear);

    buildingsList.push({
      kind: 'turf_cottage',
      spec, gy, w, h, len, roofH, wt, sc, cosY, sinY,
      floorWorldY: gy - 0.35 + baseY * sc,
      door: doorState,
      interiorBuilt: false,
      interiorGroup: null,
      interiorDisposables: [],
      interiorLights: [],
      interiorColliders: []
    });

    return grp;
  }

  /**
   * 3. Weathered Silver-Grey Driftwood Vertical-Plank Barn / Boathouse — Larger Walkable Structure
   */
  function buildWeatheredBarn(spec, colliders, buildingsList, doorsList) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    const sc = spec.scale || 1.0;
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;
    grp.scale.setScalar(sc);

    const w = 7.0;
    const h = 3.1;
    const len = 10.4;
    const roofH = 2.45;
    const wt = 0.26;
    const baseY = 0.95;
    const doorW = 2.15;
    const doorH = 2.38;

    const cosY = Math.cos(spec.yaw);
    const sinY = Math.sin(spec.yaw);
    const doorWorldX = spec.x + (len * 0.5) * sinY * sc;
    const doorWorldZ = spec.z + (len * 0.5) * cosY * sc;

    const doorState = {
      id: `barn_${Math.round(spec.x)}_${Math.round(spec.z)}`,
      label: 'Barn',
      worldX: doorWorldX,
      worldY: gy - 0.35 + baseY * sc,
      worldZ: doorWorldZ,
      isOpen: false,
      openProgress: 0,
      isDouble: true,
      leftPivot: null,
      rightPivot: null,
      swingAngle: -1.75
    };
    doorsList.push(doorState);

    // Sunken dry-stone rubble footing/subfloor
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.45, 2.70, len + 0.45), dryStoneMat);
    base.position.y = baseY - 1.35;
    base.receiveShadow = true;
    grp.add(base);

    // Hollow bleached silver-grey vertical board timber walls
    addHollowWallShell(grp, colliders, spec, {
      w, h, len, wt, baseY,
      doorX: 0, doorW, doorH, sc,
      sideMat: weatheredBarnMat,
      doorState
    });

    // Exposed dark-timber corner posts & mid-wall structural posts
    for (const sx of [-w * 0.5 + 0.02, w * 0.5 - 0.02]) {
      for (const sz of [-len * 0.5 + 0.02, 0, len * 0.5 - 0.02]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.18), darkWeatheredTimberMat);
        post.position.set(sx, baseY + h * 0.5, sz);
        grp.add(post);
      }
    }

    const gGeo = createGableEndGeo(w, roofH);
    const gf = new THREE.Mesh(gGeo, weatheredBarnMat);
    gf.position.set(0, baseY + h, len * 0.5 + 0.01);
    gf.castShadow = true;
    grp.add(gf);
    const gb = new THREE.Mesh(gGeo, weatheredBarnMat);
    gb.position.set(0, baseY + h, -len * 0.5 - 0.01);
    gb.rotation.y = Math.PI;
    gb.castShadow = true;
    grp.add(gb);

    // Weathered zinc-silver or oxidized moss-green corrugated roof
    const roofMat = spec.roofStyle < 0.52 ? roofZincMat : spec.roofStyle < 0.84 ? roofMossTinMat : roofCharcoalMat;
    const roof = createThickPitchedRoof(w, len, roofH, roofMat, darkWeatheredTimberMat, 0.42, 0.18);
    roof.position.y = baseY + h;
    grp.add(roof);

    // Dynamic pivoting barn double doors wrapped in mount group
    const frontZ = len * 0.5;
    const doorMount = new THREE.Group();
    doorMount.userData.keepDynamic = true;
    doorMount.position.set(0, baseY, frontZ - 0.08);
    grp.add(doorMount);

    const leafW = doorW * 0.5 - 0.02;
    const leftPivot = new THREE.Group();
    leftPivot.position.set(-doorW * 0.5, 0, 0);
    const leftLeaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, doorH - 0.04, 0.10), darkWeatheredTimberMat);
    leftLeaf.position.set(leafW * 0.5, (doorH - 0.04) * 0.5, 0);
    leftLeaf.castShadow = true;
    leftPivot.add(leftLeaf);
    doorMount.add(leftPivot);

    const rightPivot = new THREE.Group();
    rightPivot.position.set(doorW * 0.5, 0, 0);
    const rightLeaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, doorH - 0.04, 0.10), darkWeatheredTimberMat);
    rightLeaf.position.set(-leafW * 0.5, (doorH - 0.04) * 0.5, 0);
    rightLeaf.castShadow = true;
    rightPivot.add(rightLeaf);
    doorMount.add(rightPivot);

    doorState.leftPivot = leftPivot;
    doorState.rightPivot = rightPivot;

    // Gable hayloft hatch above barn doors + stone entry ramp
    const loftHatch = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 0.10), darkWeatheredTimberMat);
    loftHatch.position.set(0, baseY + h + 0.95, frontZ + 0.02);
    grp.add(loftHatch);

    const bStep = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.36, 1.15), dryStoneMat);
    bStep.position.set(0, baseY - 0.24, frontZ + 0.52);
    bStep.receiveShadow = true;
    grp.add(bStep);

    // Side windows
    for (const wz of [-2.2, 2.2]) {
      const sideWin = createNordicWindow(0.84, 0.88, trimWhiteMat, windowGlassMat, 2);
      sideWin.position.set(w * 0.5 + 0.04, baseY + 1.65, wz);
      sideWin.rotation.y = Math.PI * 0.5;
      grp.add(sideWin);
    }

    buildingsList.push({
      kind: 'weathered_barn',
      spec, gy, w, h, len, roofH, wt, sc, cosY, sinY,
      floorWorldY: gy - 0.35 + baseY * sc,
      door: doorState,
      interiorBuilt: false,
      interiorGroup: null,
      interiorDisposables: [],
      interiorLights: [],
      interiorColliders: []
    });

    return grp;
  }

  /** 3b. Two-Story Painted Nordic Timber House (walkable interior, pivoting door, corrugated-iron gable roof & porch) */
  function buildNordicHouse(spec, smokeOrigins, colliders, buildingsList, doorsList) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    const sc = spec.scale || 1.0;
    const cosY = Math.cos(spec.yaw);
    const sinY = Math.sin(spec.yaw);
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;
    grp.scale.setScalar(sc);

    const w = 6.6;
    const h = 4.2;
    const len = 8.4;
    const roofH = 2.6;
    const wt = 0.28;
    const baseY = 0.95;
    const doorX = 0;
    const doorW = 1.15;
    const doorH = 2.25;
    const wallMat = nordicPaintMats[(spec.paintIdx || 0) % nordicPaintMats.length];
    const roofMat = spec.roofStyle > 0.5 ? roofCharcoalMat : roofZincMat;

    const frontLocalZ = len * 0.5;
    const doorWorldX = spec.x + (doorX * cosY + frontLocalZ * sinY) * sc;
    const doorWorldZ = spec.z + (-doorX * sinY + frontLocalZ * cosY) * sc;
    const doorState = {
      id: `nordic_${Math.round(spec.x)}_${Math.round(spec.z)}`,
      label: 'Nordic House',
      worldX: doorWorldX,
      worldY: (gy - 0.35) + (baseY + 1.1) * sc,
      worldZ: doorWorldZ,
      isOpen: false,
      openProgress: 0,
      isDouble: false,
      leftPivot: null,
      rightPivot: null,
      swingAngle: -1.65
    };
    doorsList.push(doorState);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 1.90, len + 0.5), dryStoneMat);
    plinth.position.y = baseY - 0.95;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    grp.add(plinth);

    addHollowWallShell(grp, colliders, spec, {
      w, h, len, wt, baseY,
      doorX, doorW, doorH, sc,
      sideMat: wallMat,
      backMat: wallMat,
      frontMat: wallMat,
      doorState
    });

    const roofY = baseY + h;
    const gableGeo = createGableEndGeo(w, roofH);
    for (const gz of [len * 0.5, -len * 0.5]) {
      const g = new THREE.Mesh(gableGeo, wallMat);
      g.position.set(0, roofY, gz);
      if (gz < 0) g.rotation.y = Math.PI;
      g.castShadow = true;
      g.receiveShadow = true;
      grp.add(g);
    }

    const slopeLen = Math.hypot(w * 0.5 + 0.55, roofH + 0.18);
    const slopeAng = Math.atan2(roofH, w * 0.5);
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.14, len + 0.75), roofMat);
      slope.position.set(side * (w * 0.25 + 0.16), roofY + roofH * 0.5 - 0.02, 0);
      slope.rotation.z = -side * slopeAng;
      slope.castShadow = true;
      slope.receiveShadow = true;
      grp.add(slope);
    }

    // Crisp white corner trim boards
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.16, h + 0.1, 0.16), trimWhiteMat);
        trim.position.set(sx * (w * 0.5 + 0.02), baseY + h * 0.5, sz * (len * 0.5 + 0.02));
        grp.add(trim);
      }
    }

    // Front porch hood, stone steps, door jambs & dynamic pivoting door
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 1.5), roofMat);
    porchRoof.position.set(0, baseY + 2.48, len * 0.5 + 0.65);
    porchRoof.rotation.x = 0.22;
    porchRoof.castShadow = true;
    grp.add(porchRoof);
    for (const px of [-1.02, 1.02]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.38, 0.14), trimWhiteMat);
      post.position.set(px, baseY + 1.19, len * 0.5 + 1.28);
      post.castShadow = true;
      grp.add(post);
    }
    for (const sx of [doorX - doorW * 0.5 - 0.06, doorX + doorW * 0.5 + 0.06]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH + 0.08, 0.34), trimWhiteMat);
      jamb.position.set(sx, baseY + doorH * 0.5, len * 0.5 - 0.08);
      grp.add(jamb);
    }
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 1.3), dryStoneMat);
    step.position.set(0, baseY - 0.22, len * 0.5 + 0.72);
    step.receiveShadow = true;
    grp.add(step);

    const doorMount = new THREE.Group();
    doorMount.userData.keepDynamic = true;
    doorMount.position.set(doorX - doorW * 0.5, baseY, len * 0.5 - 0.14);
    grp.add(doorMount);
    const doorPivot = new THREE.Group();
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.04, doorH - 0.04, 0.09), tarredChurchMat);
    doorLeaf.position.set((doorW - 0.04) * 0.5, (doorH - 0.04) * 0.5, 0);
    doorLeaf.castShadow = true;
    doorPivot.add(doorLeaf);
    const doorLatch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.14), brassHardwareMat);
    doorLatch.position.set(doorW - 0.18, 1.0, 0);
    doorPivot.add(doorLatch);
    doorMount.add(doorPivot);
    doorState.leftPivot = doorPivot;

    // Two-story white-muntin windows
    for (const wz of [-2.4, 0.0, 2.4]) {
      for (const side of [-1, 1]) {
        const w1 = createNordicWindow(0.88, 1.05, trimWhiteMat, windowGlassMat, 2);
        w1.position.set(side * (w * 0.5 + 0.05), baseY + 1.35, wz);
        w1.rotation.y = side * Math.PI * 0.5;
        grp.add(w1);

        const w2 = createNordicWindow(0.82, 0.92, trimWhiteMat, windowGlassMat, 2);
        w2.position.set(side * (w * 0.5 + 0.05), baseY + 3.15, wz);
        w2.rotation.y = side * Math.PI * 0.5;
        grp.add(w2);
      }
    }
    for (const fx of [-1.9, 1.9]) {
      const fw = createNordicWindow(0.88, 1.05, trimWhiteMat, windowGlassMat, 2);
      fw.position.set(fx, baseY + 1.35, len * 0.5 + 0.05);
      grp.add(fw);
    }
    const gableWin = createNordicWindow(0.86, 0.95, trimWhiteMat, windowGlassMat, 2);
    gableWin.position.set(0, roofY + 1.05, len * 0.5 + 0.05);
    grp.add(gableWin);

    // Stone chimney + optional hearth smoke
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.1, 0.75), dryStoneMat);
    chim.position.set(-1.3, roofY + roofH * 0.55, -1.6);
    chim.castShadow = true;
    grp.add(chim);
    if (spec.hasSmoke) {
      const lx = -1.3 * sc;
      const lz = -1.6 * sc;
      smokeOrigins.push({
        x: spec.x + lx * cosY + lz * sinY,
        y: gy - 0.35 + (roofY + roofH * 0.55 + 1.1) * sc,
        z: spec.z - lx * sinY + lz * cosY
      });
    }

    buildingsList.push({
      kind: 'nordic_house',
      spec, gy, w, h, len, roofH, wt, sc, cosY, sinY,
      floorWorldY: gy - 0.35 + baseY * sc,
      door: doorState,
      interiorBuilt: false,
      interiorGroup: null,
      interiorDisposables: [],
      interiorLights: [],
      interiorColliders: []
    });
    return grp;
  }

  /** 3c. Volcanic Stone Smithy & Forge Workshop (walkable interior, pivoting door, forge chimney & anvil) */
  function buildSmithyWorkshop(spec, smokeOrigins, colliders, buildingsList, doorsList) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    const sc = spec.scale || 1.0;
    const cosY = Math.cos(spec.yaw);
    const sinY = Math.sin(spec.yaw);
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;
    grp.scale.setScalar(sc);

    const w = 6.2;
    const h = 2.9;
    const len = 5.4;
    const roofH = 1.9;
    const wt = 0.34;
    const baseY = 0.95;
    const doorX = 0;
    const doorW = 1.25;
    const doorH = 2.15;

    const frontLocalZ = len * 0.5;
    const doorWorldX = spec.x + (doorX * cosY + frontLocalZ * sinY) * sc;
    const doorWorldZ = spec.z + (-doorX * sinY + frontLocalZ * cosY) * sc;
    const doorState = {
      id: `smithy_${Math.round(spec.x)}_${Math.round(spec.z)}`,
      label: 'Smithy',
      worldX: doorWorldX,
      worldY: (gy - 0.35) + (baseY + 1.1) * sc,
      worldZ: doorWorldZ,
      isOpen: false,
      openProgress: 0,
      isDouble: false,
      leftPivot: null,
      rightPivot: null,
      swingAngle: -1.65
    };
    doorsList.push(doorState);

    const stoneFloor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 1.90, len + 0.5), dryStoneMat);
    stoneFloor.position.y = baseY - 0.95;
    stoneFloor.receiveShadow = true;
    grp.add(stoneFloor);

    addHollowWallShell(grp, colliders, spec, {
      w, h, len, wt, baseY,
      doorX, doorW, doorH, sc,
      sideMat: dryStoneMat,
      backMat: dryStoneMat,
      frontMat: dryStoneMat,
      doorState
    });

    const roofY = baseY + h;
    const gableGeo = createGableEndGeo(w, roofH);
    for (const gz of [len * 0.5, -len * 0.5]) {
      const g = new THREE.Mesh(gableGeo, darkWeatheredTimberMat);
      g.position.set(0, roofY, gz);
      if (gz < 0) g.rotation.y = Math.PI;
      grp.add(g);
    }
    const slopeLen = Math.hypot(w * 0.5 + 0.5, roofH + 0.15);
    const slopeAng = Math.atan2(roofH, w * 0.5);
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.16, len + 0.7), roofCharcoalMat);
      slope.position.set(side * (w * 0.25 + 0.14), roofY + roofH * 0.5, 0);
      slope.rotation.z = -side * slopeAng;
      slope.castShadow = true;
      slope.receiveShadow = true;
      grp.add(slope);
    }

    // Tall stone forge chimney
    const forgeChim = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.8, 1.1), dryStoneMat);
    forgeChim.position.set(1.6, roofY + 0.9, -1.2);
    forgeChim.castShadow = true;
    grp.add(forgeChim);
    if (spec.hasSmoke) {
      const lx = 1.6 * sc;
      const lz = -1.2 * sc;
      smokeOrigins.push({
        x: spec.x + lx * cosY + lz * sinY,
        y: gy - 0.35 + (roofY + 2.35) * sc,
        z: spec.z - lx * sinY + lz * cosY
      });
    }

    // Open timber lean-to forge porch + anvil on stump + quench trough + pivoting door
    const awning = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.12, 2.2), weatheredBarnMat);
    awning.position.set(0, baseY + 2.35, len * 0.5 + 1.05);
    awning.rotation.x = 0.24;
    awning.castShadow = true;
    grp.add(awning);
    for (const px of [-2.4, 2.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), darkWeatheredTimberMat);
      post.position.set(px, baseY + 1.05, len * 0.5 + 1.95);
      post.castShadow = true;
      grp.add(post);
    }
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.65, 8), darkWeatheredTimberMat);
    stump.position.set(-1.35, baseY + 0.32, len * 0.5 + 1.15);
    grp.add(stump);
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.24, 0.28), darkSteelMat);
    anvil.position.set(-1.35, baseY + 0.76, len * 0.5 + 1.15);
    grp.add(anvil);
    const trough = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.42, 0.55), darkWeatheredTimberMat);
    trough.position.set(1.45, baseY + 0.21, len * 0.5 + 1.05);
    grp.add(trough);

    const doorMount = new THREE.Group();
    doorMount.userData.keepDynamic = true;
    doorMount.position.set(doorX - doorW * 0.5, baseY, len * 0.5 - 0.18);
    grp.add(doorMount);
    const doorPivot = new THREE.Group();
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.04, doorH - 0.04, 0.09), tarredChurchMat);
    doorLeaf.position.set((doorW - 0.04) * 0.5, (doorH - 0.04) * 0.5, 0);
    doorLeaf.castShadow = true;
    doorPivot.add(doorLeaf);
    const doorLatch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.14), brassHardwareMat);
    doorLatch.position.set(doorW - 0.18, 1.0, 0);
    doorPivot.add(doorLatch);
    doorMount.add(doorPivot);
    doorState.leftPivot = doorPivot;

    buildingsList.push({
      kind: 'smithy',
      spec, gy, w, h, len, roofH, wt, sc, cosY, sinY,
      floorWorldY: gy - 0.35 + baseY * sc,
      door: doorState,
      interiorBuilt: false,
      interiorGroup: null,
      interiorDisposables: [],
      interiorLights: [],
      interiorColliders: []
    });
    return grp;
  }

  /** 3d. Compact Tarred-Wood & Turf Storehouse / Drying Shed (walkable interior, pivoting door & wooden crates) */
  function buildStorehouseShed(spec, colliders, buildingsList, doorsList) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    const sc = spec.scale || 1.0;
    const cosY = Math.cos(spec.yaw);
    const sinY = Math.sin(spec.yaw);
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;
    grp.scale.setScalar(sc);

    const w = 4.8;
    const h = 2.3;
    const len = 4.2;
    const roofH = 1.65;
    const wt = 0.24;
    const baseY = 0.95;
    const doorX = 0;
    const doorW = 1.25;
    const doorH = 1.95;

    const frontLocalZ = len * 0.5;
    const doorWorldX = spec.x + (doorX * cosY + frontLocalZ * sinY) * sc;
    const doorWorldZ = spec.z + (-doorX * sinY + frontLocalZ * cosY) * sc;
    const doorState = {
      id: `shed_${Math.round(spec.x)}_${Math.round(spec.z)}`,
      label: 'Storehouse',
      worldX: doorWorldX,
      worldY: (gy - 0.35) + (baseY + 1.0) * sc,
      worldZ: doorWorldZ,
      isOpen: false,
      openProgress: 0,
      isDouble: false,
      leftPivot: null,
      rightPivot: null,
      swingAngle: -1.65
    };
    doorsList.push(doorState);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 1.90, len + 0.3), dryStoneMat);
    plinth.position.y = baseY - 0.95;
    grp.add(plinth);

    addHollowWallShell(grp, colliders, spec, {
      w, h, len, wt, baseY,
      doorX, doorW, doorH, sc,
      sideMat: tarredChurchMat,
      backMat: tarredChurchMat,
      frontMat: tarredChurchMat,
      doorState
    });

    const roofY = baseY + h;
    const gableGeo = createGableEndGeo(w, roofH);
    for (const gz of [len * 0.5, -len * 0.5]) {
      const g = new THREE.Mesh(gableGeo, tarredChurchMat);
      g.position.set(0, roofY, gz);
      if (gz < 0) g.rotation.y = Math.PI;
      grp.add(g);
    }
    const slopeLen = Math.hypot(w * 0.5 + 0.45, roofH + 0.15);
    const slopeAng = Math.atan2(roofH, w * 0.5);
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.28, len + 0.6), turfRoofMat);
      slope.position.set(side * (w * 0.25 + 0.12), roofY + roofH * 0.5 + 0.04, 0);
      slope.rotation.z = -side * slopeAng;
      slope.castShadow = true;
      slope.receiveShadow = true;
      grp.add(slope);
    }

    const doorMount = new THREE.Group();
    doorMount.userData.keepDynamic = true;
    doorMount.position.set(doorX - doorW * 0.5, baseY, len * 0.5 - 0.14);
    grp.add(doorMount);
    const doorPivot = new THREE.Group();
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.04, doorH - 0.04, 0.09), weatheredBarnMat);
    doorLeaf.position.set((doorW - 0.04) * 0.5, (doorH - 0.04) * 0.5, 0);
    doorLeaf.castShadow = true;
    doorPivot.add(doorLeaf);
    const doorLatch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.14), brassHardwareMat);
    doorLatch.position.set(doorW - 0.18, 0.95, 0);
    doorPivot.add(doorLatch);
    doorMount.add(doorPivot);
    doorState.leftPivot = doorPivot;

    for (const [cxOff, czOff, sz] of [[-1.6, len * 0.5 + 0.55, 0.62], [-1.0, len * 0.5 + 0.52, 0.48], [1.5, len * 0.5 + 0.50, 0.55]]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), weatheredBarnMat);
      crate.position.set(cxOff, baseY + sz * 0.5 - 0.08, czOff);
      crate.castShadow = true;
      grp.add(crate);
    }

    buildingsList.push({
      kind: 'storehouse',
      spec, gy, w, h, len, roofH, wt, sc, cosY, sinY,
      floorWorldY: gy - 0.35 + baseY * sc,
      door: doorState,
      interiorBuilt: false,
      interiorGroup: null,
      interiorDisposables: [],
      interiorLights: [],
      interiorColliders: []
    });
    return grp;
  }

  /** 3e. Dry-Stacked Volcanic Stone Village Well with timber canopy & windlass bucket */
  function buildStoneWell(well, colliders) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(well.x, well.z);
    grp.position.set(well.x, gy - 0.12, well.z);
    grp.rotation.y = well.yaw || 0;

    // Circular stacked basalt stone wall + 12 coping stones
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.42, 0.95, 14), dryStoneMat);
    wall.position.y = 0.48;
    wall.castShadow = true;
    wall.receiveShadow = true;
    grp.add(wall);

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.44), dryStoneMat);
      cap.position.set(Math.cos(a) * 1.18, 0.98, Math.sin(a) * 1.18);
      cap.rotation.y = -a;
      cap.castShadow = true;
      grp.add(cap);
    }

    const waterDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.06, 12), windowGlassMat);
    waterDisc.position.y = 0.58;
    grp.add(waterDisc);

    // Timber uprights, windlass axle, hanging bucket & pitched canopy
    for (const sx of [-1.18, 1.18]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.85, 0.16), darkWeatheredTimberMat);
      post.position.set(sx, 1.72, 0);
      post.castShadow = true;
      grp.add(post);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.25, 8), weatheredBarnMat);
    axle.rotation.z = Math.PI * 0.5;
    axle.position.y = 1.78;
    grp.add(axle);

    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 5), weatheredBarnMat);
    rope.position.set(0, 1.45, 0);
    grp.add(rope);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.16, 0.34, 8), darkWeatheredTimberMat);
    bucket.position.set(0, 1.08, 0);
    grp.add(bucket);

    for (const side of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 1.65), roofCharcoalMat);
      roof.position.set(0, 2.86, side * 0.56);
      roof.rotation.x = side * 0.58;
      roof.castShadow = true;
      grp.add(roof);
    }

    colliders.push({ x: well.x, z: well.z, r: 1.65 });
    return grp;
  }

  /** 3f. Hand-laid Weathered Basalt Flagstone Path along village lanes & well plaza */
  function buildStonePath(pts, grp, seedOff = 0) {
    if (!pts || pts.length < 2) return;
    const stoneGeo = new THREE.CylinderGeometry(0.62, 0.70, 0.12, 6);
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const yq = new THREE.Quaternion();

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const segLen = Math.hypot(dx, dz);
      const tx = dx / (segLen || 1);
      const tz = dz / (segLen || 1);
      const nx = -tz;
      const nz = tx;
      const steps = Math.max(4, Math.floor(segLen / 1.55));
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const bx = a.x + dx * f;
        const bz = a.z + dz * f;
        // Two staggered flagstones across the lane width
        for (const laneSide of [-0.72, 0.72]) {
          const hA = hash2i(i * 37 + s, laneSide > 0 ? 1 : 2, 613 + seedOff);
          const hB = hash2i(s, i * 19 + (laneSide > 0 ? 3 : 4), 631 + seedOff);
          if (hA < 0.16) continue; // natural organic gaps
          const px = bx + nx * (laneSide + (hA - 0.5) * 0.55) + tx * (hB - 0.5) * 0.45;
          const pz = bz + nz * (laneSide + (hA - 0.5) * 0.55) + tz * (hB - 0.5) * 0.45;
          const py = getTerrainHeight(px, pz);
          getTerrainNormal(px, pz, n, 0.8);
          q.setFromUnitVectors(up, n);
          yq.setFromAxisAngle(up, hB * Math.PI * 2);
          q.multiply(yq);

          const stone = new THREE.Mesh(stoneGeo, dryStoneMat);
          stone.position.set(px, py + 0.01, pz);
          stone.quaternion.copy(q);
          stone.scale.set(0.78 + hA * 0.55, 1.0, 0.72 + hB * 0.55);
          stone.receiveShadow = true;
          grp.add(stone);
        }
      }
    }
  }

  /** Build complete photorealistic Icelandic village hamlet with crooked paddock fences, stone walls & hearth smoke. */
  function buildIcelandicVillage(village, colliders, disposables, buildingsList, doorsList) {
    const grp = new THREE.Group();
    const smokeOrigins = [];

    for (const b of village.buildings) {
      if (b.kind === 'church') grp.add(buildIcelandicChurch(b, colliders, buildingsList, doorsList));
      else if (b.kind === 'turf_cottage') grp.add(buildTurfCottage(b, smokeOrigins, colliders, buildingsList, doorsList));
      else if (b.kind === 'nordic_house') grp.add(buildNordicHouse(b, smokeOrigins, colliders, buildingsList, doorsList));
      else if (b.kind === 'smithy') grp.add(buildSmithyWorkshop(b, smokeOrigins, colliders, buildingsList, doorsList));
      else if (b.kind === 'storehouse') grp.add(buildStorehouseShed(b, colliders, buildingsList, doorsList));
      else grp.add(buildWeatheredBarn(b, colliders, buildingsList, doorsList));
    }

    if (village.well) {
      grp.add(buildStoneWell(village.well, colliders));
    }
    buildStonePath(village.lanePts, grp, 0);
    if (village.crossLanePts) {
      buildStonePath(village.crossLanePts, grp, 97);
    }

    // Animated drifting translucent chimney woodsmoke plumes (iconic visual signature from reference!)
    if (smokeOrigins.length > 0) {
      const puffsPerChimney = 12;
      const totalPuffs = smokeOrigins.length * puffsPerChimney;
      const smokeGeo = new THREE.PlaneGeometry(1, 1);
      const smokeInst = new THREE.InstancedMesh(smokeGeo, chimneySmokeMat, totalPuffs);
      const dummy = new THREE.Object3D();
      const seeds = new Float32Array(totalPuffs * 4);
      let idx = 0;
      for (let s = 0; s < smokeOrigins.length; s++) {
        const orig = smokeOrigins[s];
        for (let k = 0; k < puffsPerChimney; k++) {
          dummy.position.set(orig.x, orig.y, orig.z);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          smokeInst.setMatrixAt(idx, dummy.matrix);
          seeds[idx * 4] = idx * 7.31 + s * 19.7;
          seeds[idx * 4 + 1] = k / puffsPerChimney; // staggered continuous rise phase
          seeds[idx * 4 + 2] = 0.85 + hash2i(k, s, 919) * 0.45;
          seeds[idx * 4 + 3] = 1.0;
          idx++;
        }
      }
      smokeInst.instanceMatrix.needsUpdate = true;
      smokeGeo.setAttribute('aSmokeSeed', new THREE.InstancedBufferAttribute(seeds, 4));
      smokeInst.frustumCulled = false;
      smokeInst.renderOrder = 10;
      grp.add(smokeInst);
      disposables.push(smokeGeo);
    }

    // Rustic crooked weathered sheep-paddock wooden fences (front yard enclosures, matching reference!)
    const tx = village.tx;
    const tz = village.tz;
    const nx = village.nx;
    const nz = village.nz;
    const paddockCorners = [
      { x: village.x - tx * 34 - nx * 24, z: village.z - tz * 34 - nz * 24 },
      { x: village.x - tx * 16 - nx * 26, z: village.z - tz * 16 - nz * 26 },
      { x: village.x - tx * 4  - nx * 22, z: village.z - tz * 4  - nz * 22 },
      { x: village.x - tx * 4  - nx * 10, z: village.z - tz * 4  - nz * 10 }
    ];

    for (let seg = 0; seg < paddockCorners.length - 1; seg++) {
      const a = paddockCorners[seg];
      const b = paddockCorners[seg + 1];
      const subSegs = 5;
      for (let i = 0; i < subSegs; i++) {
        // Leave rustic paddock gate gap in middle
        if (seg === 1 && i === 2) continue;
        const t0 = i / subSegs;
        const t1 = (i + 1) / subSegs;
        const x0 = a.x + (b.x - a.x) * t0;
        const z0 = a.z + (b.z - a.z) * t0;
        const x1 = a.x + (b.x - a.x) * t1;
        const z1 = a.z + (b.z - a.z) * t1;
        const y0 = getTerrainHeight(x0, z0);
        const y1 = getTerrainHeight(x1, z1);
        const mx = (x0 + x1) * 0.5;
        const mz = (z0 + z1) * 0.5;
        const my = (y0 + y1) * 0.5;
        const len = Math.hypot(x1 - x0, z1 - z0);
        const hJitter = 1.05 + hash2i(seg * 10 + i, 1, 773) * 0.35;

        const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, hJitter, 0.11), darkWeatheredTimberMat);
        post.position.set(x0, y0 + hJitter * 0.42, z0);
        // Subtle weathered lean on wooden fence posts
        post.rotation.set(
          (hash2i(i, seg, 787) - 0.5) * 0.14,
          hash2i(seg, i, 797) * 0.5,
          (hash2i(i + 3, seg, 809) - 0.5) * 0.14
        );
        post.castShadow = true;
        grp.add(post);

        const yaw = Math.atan2(x1 - x0, z1 - z0);
        const pitch = Math.atan2(y1 - y0, len);
        for (const railY of [0.36, 0.78]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, len + 0.08), weatheredBarnMat);
          rail.position.set(mx, my + railY, mz);
          rail.rotation.order = 'YXZ';
          rail.rotation.y = yaw;
          rail.rotation.x = -pitch;
          grp.add(rail);
        }
      }
    }

    // Continuous gently curving mossy dry-stacked volcanic stone yard wall beside church & lane
    const wallPts = [];
    for (let i = 0; i <= 6; i++) {
      const wx = village.x + tx * (7.0 + i * 3.6) - nx * (13.5 - Math.sin(i * 0.55) * 2.4);
      const wz = village.z + tz * (7.0 + i * 3.6) - nz * (13.5 - Math.sin(i * 0.55) * 2.4);
      wallPts.push({ x: wx, y: getTerrainHeight(wx, wz), z: wz });
    }
    for (let i = 0; i < wallPts.length - 1; i++) {
      const a = wallPts[i];
      const b = wallPts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const wallSeg = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.05, len + 0.25), dryStoneMat);
      wallSeg.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 + 0.22, (a.z + b.z) * 0.5);
      wallSeg.rotation.order = 'YXZ';
      wallSeg.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      wallSeg.rotation.x = -Math.atan2(b.y - a.y, len);
      wallSeg.castShadow = true;
      wallSeg.receiveShadow = true;
      grp.add(wallSeg);
    }

    // Subtle dark-iron yard lanterns (small dark glass lantern housing, zero oversized daytime yellow orbs!)
    for (const l of village.lamps) {
      const ly = getTerrainHeight(l.x, l.z);
      const post = new THREE.Group();
      post.position.set(l.x, ly - 0.15, l.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.09, 3.1, 6), darkSteelMat);
      pole.position.y = 1.55;
      pole.castShadow = true;
      post.add(pole);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.28, 0.20), windowGlassMat);
      lantern.position.y = 3.18;
      post.add(lantern);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 4), darkSteelMat);
      cap.position.y = 3.40;
      cap.rotation.y = Math.PI * 0.25;
      post.add(cap);
      grp.add(post);
    }

    // Grazing Icelandic Sheep Flock scattered peacefully in the paddock & green valley meadow
    const sheepCount = 16;
    for (let s = 0; s < sheepCount; s++) {
      const inPaddock = s < 5;
      const along = inPaddock
        ? (-28 + hash2i(s, 11, 887) * 20)
        : (-46 + hash2i(s, 13, 887) * 92);
      const depth = inPaddock
        ? (-14 - hash2i(s, 17, 887) * 9)
        : (-28 - hash2i(s, 19, 887) * 34);
      const sx = village.x + tx * along + nx * depth;
      const sz = village.z + tz * along + nz * depth;
      const sy = getTerrainHeight(sx, sz);
      const yaw = hash2i(s, 23, 887) * Math.PI * 2;
      const sc = 0.85 + hash2i(s, 29, 887) * 0.28;
      const isGrazing = hash2i(s, 31, 887) > 0.30;
      const isDarkSheep = hash2i(s, 37, 887) > 0.82;

      const sheep = new THREE.Group();
      sheep.position.set(sx, sy, sz);
      sheep.rotation.y = yaw;
      sheep.scale.setScalar(sc);

      const fleeceMat = isDarkSheep ? sheepDarkMat : sheepWoolMat;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), fleeceMat);
      body.scale.set(0.84, 0.78, 1.32);
      body.position.set(0, 0.72, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      sheep.add(body);

      const rump = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), fleeceMat);
      rump.position.set(0, 0.70, -0.40);
      sheep.add(rump);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.21, 0.36), sheepDarkMat);
      if (isGrazing) {
        head.position.set(0, 0.42, 0.58);
        head.rotation.x = 0.65;
      } else {
        head.position.set(0, 0.90, 0.54);
        head.rotation.x = 0.14;
      }
      sheep.add(head);

      // Tiny horizontal Icelandic sheep ears
      for (const ex of [-0.14, 0.14]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.06), sheepDarkMat);
        ear.position.set(ex, head.position.y + 0.07, head.position.z - 0.06);
        sheep.add(ear);
      }

      for (const lx of [-0.15, 0.15]) {
        for (const lz of [-0.28, 0.28]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.58, 0.085), sheepDarkMat);
          leg.position.set(lx, 0.26, lz);
          sheep.add(leg);
        }
      }
      grp.add(sheep);
    }

    return grp;
  }

  /** 4. Grounded Low-Profile Hexagonal Basalt Column Outcrop (natural volcanic organ-pipe shelf, never a floating tower!) */
  function buildBasaltColumnCluster(spec, colliders) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    grp.position.set(spec.x, gy - 1.15, spec.z);
    const sc = (spec.scale || 1.0) * 0.72;

    const count = 18;
    for (let i = 0; i < count; i++) {
      const ring = i < 6 ? 1 : 2;
      const ang = (i / (ring === 1 ? 6 : 12)) * Math.PI * 2 + hash2i(i, spec.seed, 17) * 0.38;
      const dist = (ring === 1 ? 1.10 : 2.45) * sc * (0.80 + hash2i(i, spec.seed, 31) * 0.42);
      const colR = (0.52 + hash2i(i, spec.seed, 43) * 0.36) * sc;
      const colH = (ring === 1 ? 2.6 + hash2i(i, spec.seed, 59) * 2.4 : 1.3 + hash2i(i, spec.seed, 71) * 1.8) * sc;

      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(colR, colR * 1.08, colH, 6), basaltColMat);
      mesh.position.set(Math.cos(ang) * dist, colH * 0.5, Math.sin(ang) * dist);
      mesh.rotation.y = (i % 6) * (Math.PI / 6);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grp.add(mesh);

      if (hash2i(i, spec.seed, 89) > 0.32) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(colR * 0.96, colR * 1.04, 0.32, 6), turfRoofMat);
        cap.position.set(mesh.position.x, colH + 0.06, mesh.position.z);
        cap.rotation.y = mesh.rotation.y;
        grp.add(cap);
      }
    }
    colliders.push({ x: spec.x, z: spec.z, r: 2.8 * sc });
    return grp;
  }

  /** 5. Weathered Timber Footbridge spanning a procedural river crossing */
  function buildTimberFootbridge(spec) {
    const grp = new THREE.Group();
    const span = spec.span || 28.0;
    const dirX = Math.sin(spec.yaw);
    const dirZ = Math.cos(spec.yaw);
    const gy = getTerrainHeight(spec.x, spec.z);
    const bankA = getTerrainHeight(spec.x + dirX * span * 0.46, spec.z + dirZ * span * 0.46);
    const bankB = getTerrainHeight(spec.x - dirX * span * 0.46, spec.z - dirZ * span * 0.46);
    const deckY = Math.max(gy + 1.95, Math.max(bankA, bankB) + 0.35);
    grp.position.set(spec.x, deckY, spec.z);
    grp.rotation.y = spec.yaw;

    const width = 2.6;

    for (const sx of [-width * 0.42, width * 0.42]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, span), darkWeatheredTimberMat);
      beam.castShadow = true;
      beam.position.set(sx, -0.18, 0);
      grp.add(beam);
    }

    const plankCount = Math.floor(span / 0.48);
    for (let i = 0; i < plankCount; i++) {
      const pz = (i / (plankCount - 1) - 0.5) * span;
      const arch = Math.cos((pz / (span * 0.5)) * Math.PI * 0.5) * 0.55;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.10, 0.38), weatheredBarnMat);
      plank.position.set(0, arch, pz);
      plank.receiveShadow = true;
      grp.add(plank);
    }

    for (const sx of [-width * 0.48, width * 0.48]) {
      for (let i = 0; i <= 6; i++) {
        const pz = (i / 6 - 0.5) * (span - 1.2);
        const arch = Math.cos((pz / (span * 0.5)) * Math.PI * 0.5) * 0.55;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.25, 0.14), darkWeatheredTimberMat);
        post.position.set(sx, arch + 0.55, pz);
        post.castShadow = true;
        grp.add(post);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, span - 1.0), weatheredBarnMat);
      rail.position.set(sx, 1.38, 0);
      grp.add(rail);
    }

    for (const sz of [-span * 0.48, span * 0.48]) {
      const abut = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 2.6, 1.8), dryStoneMat);
      abut.position.set(0, -1.25, sz);
      grp.add(abut);
    }

    return grp;
  }

  /** 6. Bridges Geothermal Research Geodesic Dome Outpost */
  function buildOutpostDome(spec, colliders) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(17.5, 19.0, 2.2, 24), concreteMat);
    pad.position.y = 0.2;
    pad.receiveShadow = true;
    grp.add(pad);

    const shellGeo = new THREE.SphereGeometry(14.5, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52);
    shellGeo.scale(1.18, 0.44, 0.85);
    const shell = new THREE.Mesh(shellGeo, outpostMat);
    shell.position.y = 0.9;
    shell.castShadow = true;
    shell.receiveShadow = true;
    grp.add(shell);

    for (let i = -2; i <= 2; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(14.55, 0.34, 6, 24, Math.PI), darkSteelMat);
      rib.scale.set(1.0, 0.44, 1.0);
      rib.position.z = i * 4.2;
      rib.position.y = 0.85;
      grp.add(rib);
    }

    const entry = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.8, 5.5), concreteMat);
    entry.position.set(0, 2.2, 11.5);
    entry.castShadow = true;
    grp.add(entry);

    const doorLight = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 0.35), cyanGlowMat);
    doorLight.position.set(0, 3.6, 14.3);
    grp.add(doorLight);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 13.5, 8), darkSteelMat);
    mast.position.set(-7.5, 7.2, -5.0);
    mast.castShadow = true;
    grp.add(mast);

    const mastLight = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), cyanGlowMat);
    mastLight.position.set(-7.5, 14.0, -5.0);
    grp.add(mastLight);

    colliders.push({ x: spec.x, z: spec.z, r: 15.5 });
    return grp;
  }

  /** 7. Weathered Rusted Hydro-Relay / Weather Station Tower */
  function buildRustedRelayTower(spec, colliders) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;

    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.6), concreteMat);
    base.position.y = 0.2;
    base.receiveShadow = true;
    grp.add(base);

    const legOffsets = [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.2, 0.18), rustMat);
      leg.position.set(lx, 2.5, lz);
      leg.castShadow = true;
      grp.add(leg);
    }

    const braceA = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.8, 0.1), rustMat);
    braceA.position.set(0, 2.2, 0.85);
    braceA.rotation.z = 0.65;
    grp.add(braceA);
    const braceB = braceA.clone();
    braceB.rotation.z = -0.65;
    grp.add(braceB);

    const midBox = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.35, 1.85), rustMat);
    midBox.position.y = 4.65;
    midBox.castShadow = true;
    grp.add(midBox);

    const upperTank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.85, 2.35, 8), rustMat);
    upperTank.position.y = 6.5;
    upperTank.castShadow = true;
    grp.add(upperTank);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.28, 2.25), darkSteelMat);
    cap.position.y = 7.75;
    cap.castShadow = true;
    grp.add(cap);

    const sidePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), rustMat);
    sidePipe.position.set(1.1, 5.2, 0);
    grp.add(sidePipe);

    colliders.push({ x: spec.x, z: spec.z, r: 1.8 });
    return grp;
  }

  /** 8. Trail Guide Beacon Post */
  function buildBeaconPost(b) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(b.x, b.z);
    grp.position.set(b.x, gy - 0.15, b.z);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 4.2, 6), darkSteelMat);
    pole.position.y = 2.1;
    pole.castShadow = true;
    grp.add(pole);

    const isAmber = b.kind === 'amber';
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), isAmber ? amberGlowMat : cyanGlowMat);
    bulb.position.y = 4.35;
    grp.add(bulb);

    const sprite = new THREE.Sprite(isAmber ? amberSpriteMat : cyanSpriteMat);
    sprite.position.y = 4.35;
    sprite.scale.set(1.85, 1.85, 1);
    grp.add(sprite);

    return grp;
  }

  /** 9. Traditional Stacked Basalt Stone Traveler Cairn (Varða) */
  function buildStoneCairn(spec) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    grp.position.set(spec.x, gy - 0.08, spec.z);
    let yOff = 0.18;
    for (let i = 0; i < 5; i++) {
      const r = 0.44 - i * 0.072;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), basaltColMat);
      stone.scale.set(1.22, 0.54, 1.02);
      stone.position.set((hash2i(i, spec.seed, 91) - 0.5) * 0.08, yOff, (hash2i(spec.seed, i, 97) - 0.5) * 0.08);
      stone.rotation.y = hash2i(i, spec.seed, 103) * 3.14;
      stone.castShadow = true;
      grp.add(stone);
      yOff += r * 0.72;
    }
    return grp;
  }

  const activeCells = new Map();

  /**
   * Static geometry batcher: merges all static village/bridge/column/cairn meshes in a cell
   * sharing the same (material, castShadow, receiveShadow) into 1 BufferGeometry -> slashes draw calls by ~95%!
   */
  function batchStaticCellGroup(rawGroup, disposables) {
    rawGroup.updateMatrixWorld(true);
    const mergedGroup = new THREE.Group();
    const buckets = new Map();
    const specialChildren = [];
    const seenSourceGeos = new Set();

    const collect = (obj) => {
      if (obj.isInstancedMesh || obj.isSprite || (obj.userData && obj.userData.keepDynamic)) {
        specialChildren.push(obj);
        return;
      }
      if (obj.isMesh && obj.geometry && obj.material) {
        seenSourceGeos.add(obj.geometry);
        const mat = obj.material;
        const key = `${mat.uuid}|${obj.castShadow ? 1 : 0}|${obj.receiveShadow ? 1 : 0}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { mat, castShadow: obj.castShadow, receiveShadow: obj.receiveShadow, geos: [] };
          buckets.set(key, bucket);
        }
        const g = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
        g.applyMatrix4(obj.matrixWorld);
        bucket.geos.push(g);
      }
      for (let i = 0; i < obj.children.length; i++) {
        collect(obj.children[i]);
      }
    };
    collect(rawGroup);

    // Preserve dynamic InstancedMeshes, Sprites, and pivoting Doors with baked world transform
    for (const sp of specialChildren) {
      sp.updateMatrixWorld(true);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      sp.matrixWorld.decompose(pos, quat, scl);
      sp.position.copy(pos);
      sp.quaternion.copy(quat);
      sp.scale.copy(scl);
      mergedGroup.add(sp);
    }

    for (const bucket of buckets.values()) {
      let totalVerts = 0;
      let anyUv = false;
      for (const g of bucket.geos) {
        const pa = g.attributes.position;
        if (!pa) continue;
        totalVerts += pa.count;
        if (g.attributes.uv) anyUv = true;
      }
      if (totalVerts === 0) continue;

      const posArr = new Float32Array(totalVerts * 3);
      const normArr = new Float32Array(totalVerts * 3);
      const uvArr = anyUv ? new Float32Array(totalVerts * 2) : null;

      let vOff = 0;
      for (const g of bucket.geos) {
        const pa = g.attributes.position;
        if (!pa) { g.dispose(); continue; }
        const na = g.attributes.normal;
        const ua = g.attributes.uv;
        posArr.set(pa.array, vOff * 3);
        if (na) {
          normArr.set(na.array, vOff * 3);
        } else {
          for (let i = 0; i < pa.count; i++) normArr[(vOff + i) * 3 + 1] = 1;
        }
        if (uvArr && ua) {
          uvArr.set(ua.array, vOff * 2);
        }
        vOff += pa.count;
        g.dispose();
      }

      const mergedGeo = new THREE.BufferGeometry();
      mergedGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      mergedGeo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
      if (uvArr) mergedGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      mergedGeo.computeBoundingSphere();

      const mesh = new THREE.Mesh(mergedGeo, bucket.mat);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mergedGroup.add(mesh);
      disposables.push(mergedGeo);
    }

    for (const sg of seenSourceGeos) sg.dispose();
    return mergedGroup;
  }

  /**
   * On-Demand Detailed Interior Builders (only generated when player opens a door or enters!)
   */
  function buildChurchInterior(b, rawInt, intCols, lights) {
    const { w, h, len, roofH, wt, spec, sc } = b;
    const baseY = 0.95;
    const innerW = w - wt * 2;
    const innerLen = len - wt * 2;

    // Warm oiled timber floorboards + crimson woven central aisle runner
    const floor = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.06, innerLen), floorTimberMat);
    floor.position.set(0, baseY + 0.02, 0);
    floor.receiveShadow = true;
    rawInt.add(floor);

    // Interior gable end walls (seals the triangular roof space from inside!)
    const intGableGeo = createGableEndGeo(innerW, roofH);
    const igBack = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igBack.position.set(0, baseY + h, -innerLen * 0.5 + 0.02);
    rawInt.add(igBack);
    const igFront = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igFront.position.set(0, baseY + h, innerLen * 0.5 - 0.02);
    igFront.rotation.y = Math.PI;
    rawInt.add(igFront);

    const runner = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.02, innerLen - 1.4), aisleRunnerMat);
    runner.position.set(0, baseY + 0.06, 0.2);
    runner.receiveShadow = true;
    rawInt.add(runner);

    // Exposed timber ceiling rafters & wall wainscoting ribs
    for (let z = -innerLen * 0.4; z <= innerLen * 0.4 + 0.01; z += 2.35) {
      const tieBeam = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.16, 0.16), interiorTimberMat);
      tieBeam.position.set(0, baseY + h - 0.12, z);
      rawInt.add(tieBeam);
      for (const side of [-1, 1]) {
        const wallPost = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.16), interiorTimberMat);
        wallPost.position.set(side * (innerW * 0.5 - 0.07), baseY + h * 0.5, z);
        rawInt.add(wallPost);
      }
    }

    // Two rows of 5 carved wooden pews flanking the central aisle
    for (let row = 0; row < 5; row++) {
      const pz = 3.2 - row * 1.45;
      for (const side of [-1, 1]) {
        const px = side * 1.95;
        const pewSeat = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.08, 0.46), interiorTimberMat);
        pewSeat.position.set(px, baseY + 0.48, pz);
        pewSeat.castShadow = true;
        pewSeat.receiveShadow = true;
        rawInt.add(pewSeat);

        const pewBack = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.58, 0.07), interiorTimberMat);
        pewBack.position.set(px, baseY + 0.76, pz + 0.20);
        rawInt.add(pewBack);

        for (const lx of [-0.95, 0.95]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.42), interiorTimberMat);
          leg.position.set(px + lx, baseY + 0.24, pz);
          rawInt.add(leg);
        }
        intCols.push(addBoxCollider([], spec, px, pz, 1.08, 0.28, sc, { isInterior: true }));
      }
    }

    // Raised chancel platform & altar at rear
    const chancelZ = -innerLen * 0.5 + 1.65;
    const dais = new THREE.Mesh(new THREE.BoxGeometry(innerW - 0.4, 0.22, 2.7), interiorTimberMat);
    dais.position.set(0, baseY + 0.11, chancelZ);
    dais.receiveShadow = true;
    rawInt.add(dais);

    const altar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.02, 0.88), interiorTimberMat);
    altar.position.set(0, baseY + 0.72, chancelZ - 0.35);
    rawInt.add(altar);
    const altarCloth = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.14, 0.92), trimWhiteMat);
    altarCloth.position.set(0, baseY + 1.18, chancelZ - 0.35);
    rawInt.add(altarCloth);
    const clothRunner = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.94), aisleRunnerMat);
    clothRunner.position.set(0, baseY + 0.85, chancelZ - 0.35);
    rawInt.add(clothRunner);
    intCols.push(addBoxCollider([], spec, 0, chancelZ - 0.35, 1.10, 0.48, sc, { isInterior: true }));

    // Brass altar cross & glowing candles
    const aCrossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, 0.06), brassHardwareMat);
    aCrossV.position.set(0, baseY + 1.58, chancelZ - 0.42);
    rawInt.add(aCrossV);
    const aCrossH = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.06), brassHardwareMat);
    aCrossH.position.set(0, baseY + 1.72, chancelZ - 0.42);
    rawInt.add(aCrossH);

    for (const cx of [-0.68, 0.68]) {
      const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.18, 6), brassHardwareMat);
      holder.position.set(cx, baseY + 1.33, chancelZ - 0.32);
      rawInt.add(holder);
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), trimWhiteMat);
      candle.position.set(cx, baseY + 1.48, chancelZ - 0.32);
      rawInt.add(candle);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), candleGlowMat);
      flame.position.set(cx, baseY + 1.59, chancelZ - 0.32);
      rawInt.add(flame);
    }

    // Wooden pulpit on left of chancel
    const pulpit = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.35, 0.95), interiorTimberMat);
    pulpit.position.set(-2.35, baseY + 0.88, chancelZ + 0.55);
    rawInt.add(pulpit);
    intCols.push(addBoxCollider([], spec, -2.35, chancelZ + 0.55, 0.50, 0.50, sc, { isInterior: true }));

    // Hanging wrought-iron & brass nave chandelier
    const chandY = baseY + h + roofH * 0.25;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, roofH * 0.55, 6), darkSteelMat);
    chain.position.set(0, chandY + roofH * 0.27, 0.3);
    rawInt.add(chain);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.04, 6, 16), brassHardwareMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.set(0, chandY, 0.3);
    rawInt.add(ring);
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), candleGlowMat);
      fl.position.set(Math.cos(ang) * 0.85, chandY + 0.12, 0.3 + Math.sin(ang) * 0.85);
      rawInt.add(fl);
    }

    // Pre-allocated single interior light target (zero dynamic PointLight creation -> zero shader recompile!)
    b.interiorLightLocal = new THREE.Vector3(0, chandY - 0.15, 0.3);
    b.interiorLightBase = 4.2;
    b.interiorLightColor = 0xffb968;
  }

  function buildTurfCottageInterior(b, rawInt, intCols, lights) {
    const { w, h, len, wt, spec, sc } = b;
    const baseY = 0.95;
    const innerW = w - wt * 2;
    const innerLen = len - wt * 2;

    // Warm timber floorboards & woven rug
    const floor = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.06, innerLen), floorTimberMat);
    floor.position.set(0, baseY + 0.02, 0);
    floor.receiveShadow = true;
    rawInt.add(floor);

    // Interior gable end walls
    const intGableGeo = createGableEndGeo(innerW, b.roofH);
    const igBack = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igBack.position.set(0, baseY + h, -innerLen * 0.5 + 0.02);
    rawInt.add(igBack);
    const igFront = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igFront.position.set(0, baseY + h, innerLen * 0.5 - 0.02);
    igFront.rotation.y = Math.PI;
    rawInt.add(igFront);

    const rug = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.02, 3.6), aisleRunnerMat);
    rug.position.set(0.4, baseY + 0.06, 0.6);
    rug.receiveShadow = true;
    rawInt.add(rug);

    // Exposed dark timber ceiling joists
    for (let z = -innerLen * 0.38; z <= innerLen * 0.38 + 0.01; z += 2.1) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.15, 0.15), interiorTimberMat);
      beam.position.set(0, baseY + h - 0.08, z);
      rawInt.add(beam);
    }

    // Stone Hearth / Fireplace under the chimney (-1.35, -1.6)
    const hX = -1.35;
    const hZ = -1.6;
    const hearthBase = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.28, 1.45), dryStoneMat);
    hearthBase.position.set(hX, baseY + 0.14, hZ);
    rawInt.add(hearthBase);
    const hearthHood = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.65, 1.10), dryStoneMat);
    hearthHood.position.set(hX, baseY + 1.45, hZ);
    rawInt.add(hearthHood);
    const embers = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.65), emberGlowMat);
    embers.position.set(hX, baseY + 0.32, hZ);
    rawInt.add(embers);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.26, 8), darkSteelMat);
    pot.position.set(hX + 0.15, baseY + 0.52, hZ);
    rawInt.add(pot);
    intCols.push(addBoxCollider([], spec, hX, hZ, 0.88, 0.74, sc, { isInterior: true }));

    // Dining Table & Benches in center-right
    const tX = 0.85;
    const tZ = 0.85;
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 2.05), interiorTimberMat);
    tableTop.position.set(tX, baseY + 0.78, tZ);
    rawInt.add(tableTop);
    for (const lx of [-0.45, 0.45]) {
      for (const lz of [-0.82, 0.82]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.76, 0.08), interiorTimberMat);
        leg.position.set(tX + lx, baseY + 0.38, tZ + lz);
        rawInt.add(leg);
      }
    }
    const tLantern = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.22, 6), candleGlowMat);
    tLantern.position.set(tX, baseY + 0.93, tZ);
    rawInt.add(tLantern);
    for (const bx of [-0.88, 0.88]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 1.85), interiorTimberMat);
      bench.position.set(tX + bx, baseY + 0.22, tZ);
      rawInt.add(bench);
    }
    intCols.push(addBoxCollider([], spec, tX, tZ, 1.05, 1.05, sc, { isInterior: true }));

    // Built-in Baðstofa timber beds along rear & right wall
    for (const bz of [-3.4, -1.2]) {
      const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.52, 2.0), interiorTimberMat);
      bedFrame.position.set(innerW * 0.5 - 0.72, baseY + 0.26, bz);
      rawInt.add(bedFrame);
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.12, 1.85), woolBlanketMat);
      blanket.position.set(innerW * 0.5 - 0.72, baseY + 0.56, bz);
      rawInt.add(blanket);
      intCols.push(addBoxCollider([], spec, innerW * 0.5 - 0.72, bz, 0.65, 1.02, sc, { isInterior: true }));
    }

    // Pre-allocated single interior light target
    b.interiorLightLocal = new THREE.Vector3(hX + 0.3, baseY + 1.25, hZ + 0.6);
    b.interiorLightBase = 4.6;
    b.interiorLightColor = 0xff9b42;
  }

  function buildBarnInterior(b, rawInt, intCols, lights) {
    const { w, h, len, wt, spec, sc } = b;
    const baseY = 0.95;
    const innerW = w - wt * 2;
    const innerLen = len - wt * 2;

    // Rough plank floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.06, innerLen), floorTimberMat);
    floor.position.set(0, baseY + 0.02, 0);
    floor.receiveShadow = true;
    rawInt.add(floor);

    // Interior gable end walls
    const intGableGeo = createGableEndGeo(innerW, b.roofH);
    const igBack = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igBack.position.set(0, baseY + h, -innerLen * 0.5 + 0.02);
    rawInt.add(igBack);
    const igFront = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igFront.position.set(0, baseY + h, innerLen * 0.5 - 0.02);
    igFront.rotation.y = Math.PI;
    rawInt.add(igFront);

    // Timber tie-beams & rear hayloft platform
    for (let z = -innerLen * 0.35; z <= innerLen * 0.35 + 0.01; z += 2.6) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.16, 0.16), darkWeatheredTimberMat);
      beam.position.set(0, baseY + h - 0.10, z);
      rawInt.add(beam);
    }

    const loft = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.14, innerLen * 0.38), interiorTimberMat);
    loft.position.set(0, baseY + 2.35, -innerLen * 0.31);
    rawInt.add(loft);

    // Leaning wooden ladder up to hayloft
    for (const lx of [-0.28, 0.28]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.75, 0.06), interiorTimberMat);
      rail.position.set(-1.3 + lx, baseY + 1.30, -innerLen * 0.12 + 0.35);
      rail.rotation.x = -0.30;
      rawInt.add(rail);
    }

    // Stacked golden hay bales & wooden supply crates
    const balePositions = [
      [-1.9, -3.2, 0.55], [-1.9, -2.0, 0.55], [-1.9, -2.6, 1.45],
      [1.9, -3.0, 0.55], [1.9, -1.7, 0.55], [2.0, 1.2, 0.55]
    ];
    for (const [bx, bz, by] of balePositions) {
      const bale = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.85, 1.05), hayStrawMat);
      bale.position.set(bx, baseY + by, bz);
      rawInt.add(bale);
      if (by < 1.0) {
        intCols.push(addBoxCollider([], spec, bx, bz, 0.60, 0.55, sc, { isInterior: true }));
      }
    }

    for (const [cx, cz] of [[-2.0, 1.5], [-2.1, 2.6]]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.88, 0.92), interiorTimberMat);
      crate.position.set(cx, baseY + 0.44, cz);
      rawInt.add(crate);
      intCols.push(addBoxCollider([], spec, cx, cz, 0.48, 0.48, sc, { isInterior: true }));
    }

    // Hanging barn lantern
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.10, 6, 4), candleGlowMat);
    lantern.position.set(0, baseY + h - 0.55, 0.5);
    rawInt.add(lantern);
    // Pre-allocated single interior light target
    b.interiorLightLocal = new THREE.Vector3(0, baseY + h - 0.65, 0.5);
    b.interiorLightBase = 3.8;
    b.interiorLightColor = 0xffb45a;
  }

  function buildNordicHouseInterior(b, rawInt, intCols) {
    const { w, h, len, wt, spec, sc } = b;
    const baseY = 0.95;
    const innerW = w - wt * 2;
    const innerLen = len - wt * 2;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.06, innerLen), floorTimberMat);
    floor.position.set(0, baseY + 0.02, 0);
    floor.receiveShadow = true;
    rawInt.add(floor);

    const intGableGeo = createGableEndGeo(innerW, b.roofH);
    const igBack = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igBack.position.set(0, baseY + h, -innerLen * 0.5 + 0.02);
    rawInt.add(igBack);
    const igFront = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igFront.position.set(0, baseY + h, innerLen * 0.5 - 0.02);
    igFront.rotation.y = Math.PI;
    rawInt.add(igFront);

    const rug = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.02, 3.8), aisleRunnerMat);
    rug.position.set(0.2, baseY + 0.06, 0.8);
    rug.receiveShadow = true;
    rawInt.add(rug);

    // Upper loft floor & ladder
    const loft = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.14, innerLen * 0.42), interiorTimberMat);
    loft.position.set(0, baseY + 2.45, -innerLen * 0.28);
    rawInt.add(loft);
    for (const lx of [-0.26, 0.26]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.75, 0.06), interiorTimberMat);
      rail.position.set(-1.9 + lx, baseY + 1.32, -innerLen * 0.06 + 0.35);
      rail.rotation.x = -0.28;
      rawInt.add(rail);
    }

    // Stone fireplace & embers
    const hX = -1.3;
    const hZ = -1.6;
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 1.1), dryStoneMat);
    hearth.position.set(hX, baseY + 0.85, hZ);
    rawInt.add(hearth);
    const embers = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.16, 0.55), emberGlowMat);
    embers.position.set(hX, baseY + 0.28, hZ + 0.1);
    rawInt.add(embers);
    intCols.push(addBoxCollider([], spec, hX, hZ, 0.80, 0.60, sc, { isInterior: true }));

    // Dining table, chairs & glowing table lantern
    const tX = 1.1;
    const tZ = 0.9;
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 2.1), interiorTimberMat);
    tableTop.position.set(tX, baseY + 0.78, tZ);
    rawInt.add(tableTop);
    for (const lx of [-0.45, 0.45]) {
      for (const lz of [-0.82, 0.82]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.76, 0.08), interiorTimberMat);
        leg.position.set(tX + lx, baseY + 0.38, tZ + lz);
        rawInt.add(leg);
      }
    }
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.22, 6), candleGlowMat);
    lantern.position.set(tX, baseY + 0.93, tZ);
    rawInt.add(lantern);
    intCols.push(addBoxCollider([], spec, tX, tZ, 0.95, 1.05, sc, { isInterior: true }));

    // Bed along rear right wall
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.52, 2.05), interiorTimberMat);
    bedFrame.position.set(innerW * 0.5 - 0.75, baseY + 0.26, -2.5);
    rawInt.add(bedFrame);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.9), woolBlanketMat);
    blanket.position.set(innerW * 0.5 - 0.75, baseY + 0.56, -2.5);
    rawInt.add(blanket);
    intCols.push(addBoxCollider([], spec, innerW * 0.5 - 0.75, -2.5, 0.68, 1.05, sc, { isInterior: true }));

    b.interiorLightLocal = new THREE.Vector3(0.2, baseY + 1.85, 0.4);
    b.interiorLightBase = 4.6;
    b.interiorLightColor = 0xffa852;
  }

  function buildSmithyInterior(b, rawInt, intCols) {
    const { w, h, len, wt, spec, sc } = b;
    const baseY = 0.95;
    const innerW = w - wt * 2;
    const innerLen = len - wt * 2;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.06, innerLen), dryStoneMat);
    floor.position.set(0, baseY + 0.02, 0);
    floor.receiveShadow = true;
    rawInt.add(floor);

    const intGableGeo = createGableEndGeo(innerW, b.roofH);
    const igBack = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igBack.position.set(0, baseY + h, -innerLen * 0.5 + 0.02);
    rawInt.add(igBack);
    const igFront = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igFront.position.set(0, baseY + h, innerLen * 0.5 - 0.02);
    igFront.rotation.y = Math.PI;
    rawInt.add(igFront);

    // Stone forge hearth + glowing coals
    const fX = 1.45;
    const fZ = -1.1;
    const forge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 1.3), dryStoneMat);
    forge.position.set(fX, baseY + 0.65, fZ);
    rawInt.add(forge);
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.20, 0.8), emberGlowMat);
    coals.position.set(fX, baseY + 1.34, fZ);
    rawInt.add(coals);
    intCols.push(addBoxCollider([], spec, fX, fZ, 0.80, 0.70, sc, { isInterior: true }));

    // Workbench & crates along left wall
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.88, 2.4), interiorTimberMat);
    bench.position.set(-innerW * 0.5 + 0.55, baseY + 0.44, -0.4);
    rawInt.add(bench);
    intCols.push(addBoxCollider([], spec, -innerW * 0.5 + 0.55, -0.4, 0.52, 1.25, sc, { isInterior: true }));

    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.10, 6, 4), candleGlowMat);
    lantern.position.set(0, baseY + h - 0.45, 0.3);
    rawInt.add(lantern);

    b.interiorLightLocal = new THREE.Vector3(1.0, baseY + 1.45, -0.8);
    b.interiorLightBase = 5.0;
    b.interiorLightColor = 0xff7b32;
  }

  function buildStorehouseInterior(b, rawInt, intCols) {
    const { w, h, len, wt, spec, sc } = b;
    const baseY = 0.95;
    const innerW = w - wt * 2;
    const innerLen = len - wt * 2;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.06, innerLen), floorTimberMat);
    floor.position.set(0, baseY + 0.02, 0);
    floor.receiveShadow = true;
    rawInt.add(floor);

    const intGableGeo = createGableEndGeo(innerW, b.roofH);
    const igBack = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igBack.position.set(0, baseY + h, -innerLen * 0.5 + 0.02);
    rawInt.add(igBack);
    const igFront = new THREE.Mesh(intGableGeo, interiorTimberMat);
    igFront.position.set(0, baseY + h, innerLen * 0.5 - 0.02);
    igFront.rotation.y = Math.PI;
    rawInt.add(igFront);

    // Stacked supply crates & hay bales
    for (const [cx, cz, sz] of [[-1.3, -1.1, 0.82], [-1.3, -0.1, 0.72], [1.2, -1.0, 0.88]]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), interiorTimberMat);
      crate.position.set(cx, baseY + sz * 0.5, cz);
      rawInt.add(crate);
      intCols.push(addBoxCollider([], spec, cx, cz, sz * 0.52, sz * 0.52, sc, { isInterior: true }));
    }
    const hay = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.0), hayStrawMat);
    hay.position.set(1.2, baseY + 0.4, 0.2);
    rawInt.add(hay);
    intCols.push(addBoxCollider([], spec, 1.2, 0.2, 0.58, 0.52, sc, { isInterior: true }));

    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), candleGlowMat);
    lantern.position.set(0, baseY + h - 0.45, 0.2);
    rawInt.add(lantern);

    b.interiorLightLocal = new THREE.Vector3(0, baseY + h - 0.55, 0.2);
    b.interiorLightBase = 3.5;
    b.interiorLightColor = 0xffb45a;
  }

  function ensureBuildingInterior(b, cell) {
    if (b.interiorBuilt) return;
    b.interiorBuilt = true;
    const rawInt = new THREE.Group();
    rawInt.position.set(b.spec.x, b.gy - 0.35, b.spec.z);
    rawInt.rotation.y = b.spec.yaw;
    rawInt.scale.setScalar(b.sc);

    const intCols = [];
    if (b.kind === 'church') buildChurchInterior(b, rawInt, intCols);
    else if (b.kind === 'turf_cottage') buildTurfCottageInterior(b, rawInt, intCols);
    else if (b.kind === 'nordic_house') buildNordicHouseInterior(b, rawInt, intCols);
    else if (b.kind === 'smithy') buildSmithyInterior(b, rawInt, intCols);
    else if (b.kind === 'storehouse') buildStorehouseInterior(b, rawInt, intCols);
    else buildBarnInterior(b, rawInt, intCols);

    const batched = batchStaticCellGroup(rawInt, b.interiorDisposables);
    b.interiorGroup = batched;
    b.interiorColliders = intCols;
    for (const c of intCols) cell.colliders.push(c);
    cell.group.add(batched);
  }

  function disposeBuildingInterior(b, cell) {
    if (!b.interiorBuilt) return;
    b.interiorBuilt = false;
    if (b.interiorGroup) {
      cell.group.remove(b.interiorGroup);
      b.interiorGroup = null;
    }
    for (const d of b.interiorDisposables) {
      if (d && d.dispose) d.dispose();
    }
    b.interiorDisposables = [];
    b.interiorLights = [];
    if (b.interiorColliders.length > 0) {
      const colSet = new Set(b.interiorColliders);
      cell.colliders = cell.colliders.filter((c) => !colSet.has(c));
      b.interiorColliders = [];
    }
  }

  function buildCellLandmarks(cx, cz) {
    const f = getCellFeatures(cx, cz);
    const rawGroup = new THREE.Group();
    const colliders = [];
    const disposables = [];
    const buildingsList = [];
    const doorsList = [];

    if (f.village) rawGroup.add(buildIcelandicVillage(f.village, colliders, disposables, buildingsList, doorsList));
    for (const o of f.outposts) rawGroup.add(buildOutpostDome(o, colliders));
    for (const r of f.relays) rawGroup.add(buildRustedRelayTower(r, colliders));
    for (const b of f.beacons) rawGroup.add(buildBeaconPost(b));
    for (const bc of f.basaltColumns) rawGroup.add(buildBasaltColumnCluster(bc, colliders));
    for (const br of f.bridges) rawGroup.add(buildTimberFootbridge(br));
    for (const ca of f.cairns) rawGroup.add(buildStoneCairn(ca));

    const group = batchStaticCellGroup(rawGroup, disposables);
    root.add(group);
    return { key: `${cx},${cz}`, group, colliders, disposables, buildings: buildingsList, doors: doorsList };
  }

  let lastLmPcx = 1e9;
  let lastLmPcz = 1e9;

  function rebuildAll(centerX, centerZ) {
    for (const c of activeCells.values()) {
      for (const b of c.buildings) disposeBuildingInterior(b, c);
      root.remove(c.group);
      if (c.disposables) c.disposables.forEach((d) => d.dispose && d.dispose());
    }
    activeCells.clear();
    lastLmPcx = 1e9;
    lastLmPcz = 1e9;
    update(centerX, centerZ, 0.016);
  }

  function update(centerX, centerZ, dt = 0.016) {
    const pcx = Math.round(centerX / CELL_SIZE);
    const pcz = Math.round(centerZ / CELL_SIZE);
    if (pcx !== lastLmPcx || pcz !== lastLmPcz) {
      lastLmPcx = pcx;
      lastLmPcz = pcz;
      const needed = new Set();

      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = pcx + dx;
          const cz = pcz + dz;
          const key = `${cx},${cz}`;
          needed.add(key);
          if (!activeCells.has(key)) {
            activeCells.set(key, buildCellLandmarks(cx, cz));
          }
        }
      }

      for (const [key, cell] of activeCells.entries()) {
        if (!needed.has(key)) {
          for (const b of cell.buildings) disposeBuildingInterior(b, cell);
          root.remove(cell.group);
          if (cell.disposables) cell.disposables.forEach((d) => d.dispose && d.dispose());
          activeCells.delete(key);
        }
      }
    }

    // Animate pivoting doors & manage nearby building interior + single reused interiorLight
    const safeDt = Math.min(dt || 0.016, 0.1);
    const nowT = ATMO_UNIFORMS.uTime.value;
    let activeB = null;
    let activeCell = null;
    let activeDist = 20.0;

    for (const cell of activeCells.values()) {
      for (const d of cell.doors) {
        const target = d.isOpen ? 1.0 : 0.0;
        if (Math.abs(d.openProgress - target) > 0.001) {
          const step = Math.min(1.0, safeDt * 4.5);
          d.openProgress += (target - d.openProgress) * step;
          if (Math.abs(d.openProgress - target) < 0.005) d.openProgress = target;
          const ease = d.openProgress * d.openProgress * (3.0 - 2.0 * d.openProgress);
          if (d.leftPivot) d.leftPivot.rotation.y = ease * d.swingAngle;
          if (d.rightPivot) d.rightPivot.rotation.y = -ease * d.swingAngle;
        }
      }

      for (const b of cell.buildings) {
        const dist = Math.hypot(b.spec.x - centerX, b.spec.z - centerZ);
        if (dist < activeDist) {
          activeDist = dist;
          activeB = b;
          activeCell = cell;
        }
      }
    }

    for (const cell of activeCells.values()) {
      for (const b of cell.buildings) {
        if (b === activeB) {
          ensureBuildingInterior(b, activeCell);
        } else if (b.interiorBuilt) {
          const dist = Math.hypot(b.spec.x - centerX, b.spec.z - centerZ);
          if (dist > 24.0) {
            disposeBuildingInterior(b, cell);
          }
        }
      }
    }

    if (activeB && activeB.interiorLightLocal) {
      const lp = activeB.interiorLightLocal;
      interiorLight.position.set(
        activeB.spec.x + (lp.x * activeB.cosY + lp.z * activeB.sinY) * activeB.sc,
        (activeB.gy - 0.35) + lp.y * activeB.sc,
        activeB.spec.z + (-lp.x * activeB.sinY + lp.z * activeB.cosY) * activeB.sc
      );
      interiorLight.color.setHex(activeB.interiorLightColor);
      const flicker = 1.0 + 0.08 * Math.sin(nowT * 7.3) + 0.04 * Math.sin(nowT * 13.7);
      interiorLight.intensity = activeB.interiorLightBase * flicker;
    } else {
      interiorLight.intensity = 0.0001;
    }
  }

  function getNearestDoor(x, y, z, maxDist = 2.55) {
    let best = null;
    let bestD = maxDist;
    for (const cell of activeCells.values()) {
      for (const d of cell.doors) {
        const dist = Math.hypot(d.worldX - x, d.worldZ - z);
        if (dist < bestD && Math.abs(d.worldY - y) < 3.0) {
          bestD = dist;
          best = d;
        }
      }
    }
    return best;
  }

  function toggleNearestDoor(x, y, z, maxDist = 2.55) {
    const door = getNearestDoor(x, y, z, maxDist);
    if (!door) return null;
    door.isOpen = !door.isOpen;
    return door;
  }

  function getFloorHeightAt(x, z, y) {
    let bestY = -1e9;
    for (const cell of activeCells.values()) {
      for (const b of cell.buildings) {
        if (Math.hypot(b.spec.x - x, b.spec.z - z) > b.len * 0.75 * b.sc) continue;
        const dx = x - b.spec.x;
        const dz = z - b.spec.z;
        const lx = (dx * b.cosY - dz * b.sinY) / b.sc;
        const lz = (dx * b.sinY + dz * b.cosY) / b.sc;

        // Inside building footprint (including doorway threshold)
        if (Math.abs(lx) <= b.w * 0.5 + 0.15 && Math.abs(lz) <= b.len * 0.5 + 0.25) {
          if (y >= b.floorWorldY - 1.2) {
            bestY = Math.max(bestY, b.floorWorldY);
          }
        } else if (lz > b.len * 0.5 && lz <= b.len * 0.5 + 1.45 * b.sc) {
          // Smooth stone entry steps ramp outside front door
          const doorCx = b.kind === 'turf_cottage' ? -1.15 : 0;
          if (Math.abs(lx - doorCx) <= 1.45) {
            const t = Math.max(0, Math.min(1, 1.0 - (lz - b.len * 0.5) / 1.45));
            const stepY = b.floorWorldY - 0.55 * (1.0 - t);
            if (y >= stepY - 1.0) {
              bestY = Math.max(bestY, stepY);
            }
          }
        }
      }
    }
    return bestY > -1e8 ? bestY : null;
  }

  function clampCameraPos(targetPos, desiredPos) {
    for (const cell of activeCells.values()) {
      for (const b of cell.buildings) {
        if (Math.hypot(b.spec.x - targetPos.x, b.spec.z - targetPos.z) > b.len * 0.7 * b.sc) continue;
        const dx = targetPos.x - b.spec.x;
        const dz = targetPos.z - b.spec.z;
        const tlx = (dx * b.cosY - dz * b.sinY) / b.sc;
        const tlz = (dx * b.sinY + dz * b.cosY) / b.sc;
        if (Math.abs(tlx) < b.w * 0.5 - b.wt * 0.5 && Math.abs(tlz) < b.len * 0.5 - b.wt * 0.5 && targetPos.y >= b.floorWorldY - 0.5) {
          // Player is inside this building: keep camera inside the interior room & below ceiling!
          const cdx = desiredPos.x - b.spec.x;
          const cdz = desiredPos.z - b.spec.z;
          let clx = (cdx * b.cosY - cdz * b.sinY) / b.sc;
          let clz = (cdx * b.sinY + cdz * b.cosY) / b.sc;
          const maxLx = b.w * 0.5 - b.wt - 0.25;
          const maxLz = b.len * 0.5 - b.wt - 0.25;
          clx = Math.max(-maxLx, Math.min(maxLx, clx));
          clz = Math.max(-maxLz, Math.min(maxLz, clz));
          desiredPos.x = b.spec.x + (clx * b.cosY + clz * b.sinY) * b.sc;
          desiredPos.z = b.spec.z + (-clx * b.sinY + clz * b.cosY) * b.sc;
          const ceilY = b.floorWorldY + (b.h - 0.35) * b.sc;
          if (desiredPos.y > ceilY) desiredPos.y = ceilY;
          if (desiredPos.y < b.floorWorldY + 0.55) desiredPos.y = b.floorWorldY + 0.55;
          return true;
        }
      }
    }
    return false;
  }

  function getCollidersNear(x, z, radius = 8) {
    const out = [];
    for (const cell of activeCells.values()) {
      for (const col of cell.colliders) {
        if (Math.hypot(col.x - x, col.z - z) < radius + col.r) {
          out.push(col);
        }
      }
    }
    return out;
  }

  const _shelterTmp = { cx: 0, cz: 0, roofY: 0, cosY: 1, sinY: 0, halfW: 0, halfL: 0, inside: false };
  function getNearestShelterBox(x, y, z, maxDist = 28) {
    let bestB = null;
    let bestD = maxDist;
    for (const cell of activeCells.values()) {
      for (const b of cell.buildings) {
        const d = Math.hypot(b.spec.x - x, b.spec.z - z);
        if (d < bestD) {
          bestD = d;
          bestB = b;
        }
      }
    }
    if (!bestB) return null;
    const hw = bestB.w * 0.52 * bestB.sc;
    const hl = bestB.len * 0.52 * bestB.sc;
    const roofY = bestB.floorWorldY + (bestB.h + bestB.roofH * 0.85) * bestB.sc;
    const dx = x - bestB.spec.x;
    const dz = z - bestB.spec.z;
    const lx = dx * bestB.cosY - dz * bestB.sinY;
    const lz = dx * bestB.sinY + dz * bestB.cosY;
    _shelterTmp.cx = bestB.spec.x;
    _shelterTmp.cz = bestB.spec.z;
    _shelterTmp.roofY = roofY;
    _shelterTmp.cosY = bestB.cosY;
    _shelterTmp.sinY = bestB.sinY;
    _shelterTmp.halfW = hw;
    _shelterTmp.halfL = hl;
    _shelterTmp.inside = Math.abs(lx) < hw && Math.abs(lz) < hl && y < roofY;
    return _shelterTmp;
  }

  function finishPrewarm() {
    if (prewarmGroup.parent) {
      scene.remove(prewarmGroup);
      prewarmGeo.dispose();
    }
  }

  return {
    update,
    rebuildAll,
    getCollidersNear,
    getNearestDoor,
    toggleNearestDoor,
    getFloorHeightAt,
    getNearestShelterBox,
    clampCameraPos,
    finishPrewarm
  };
}
