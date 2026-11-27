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
import { CELL_SIZE, getCellFeatures, getTerrainHeight } from './world.js';
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
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.78,
    metalness: 0.04
  }, 'ls_tarred_church', 0.7);

  const weatheredBarnMat = makeMat({
    color: 0xc2c6c8,
    map: texLib.weatheredWood.map,
    normalMap: texLib.weatheredWood.normalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.88,
    metalness: 0.02
  }, 'ls_weathered_barn', 0.65);

  const darkWeatheredTimberMat = makeMat({
    color: 0x58534d,
    map: texLib.weatheredWood.map,
    normalMap: texLib.weatheredWood.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 0.90,
    metalness: 0.02
  }, 'ls_dark_weathered_wood', 0.7);

  const dryStoneMat = makeMat({
    color: 0xa2a8ac,
    map: texLib.dryStone.map,
    normalMap: texLib.dryStone.normalMap,
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughness: 0.92,
    metalness: 0.02
  }, 'ls_dry_stone', 0.75);

  const turfRoofMat = makeMat({
    color: 0x7c962e,
    map: texLib.moss.map,
    normalMap: texLib.moss.normalMap,
    normalScale: new THREE.Vector2(1.7, 1.7),
    roughness: 0.96,
    metalness: 0.0
  }, 'ls_turf_roof_v3', 0.15);

  const roofCharcoalMat = makeMat({
    color: 0x353c42,
    map: texLib.corrugatedIron.map,
    normalMap: texLib.corrugatedIron.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.74,
    metalness: 0.24
  }, 'ls_roof_charcoal_v3', 0.65);

  const roofZincMat = makeMat({
    color: 0x828c92,
    map: texLib.corrugatedIron.map,
    normalMap: texLib.corrugatedIron.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.70,
    metalness: 0.30
  }, 'ls_roof_zinc_v3', 0.65);

  const roofMossTinMat = makeMat({
    color: 0x566a50,
    map: texLib.corrugatedIron.map,
    normalMap: texLib.corrugatedIron.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.74,
    metalness: 0.22
  }, 'ls_roof_mosstin_v3', 0.62);

  const trimWhiteMat = makeMat({
    color: 0xcfd4d6,
    roughness: 0.80,
    metalness: 0.02
  }, 'ls_trim_white_v2', 0.45);

  const doorRedMat = makeMat({
    color: 0x5a1d19,
    roughness: 0.72,
    metalness: 0.06
  }, 'ls_door_red', 0.6);

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
    color: 0x262b30,
    roughness: 0.48,
    metalness: 0.74
  }, 'ls_dark_steel', 0.6);

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
        // Daytime: dark interior glass softly reflecting cool silver overcast sky
        vec3 dayGlass = mix(vec3(0.024, 0.032, 0.038), uFogColor * 0.48, clamp(fres * 0.75 + 0.12, 0.0, 0.65));
        // Subtle warm interior hearth light emerges softly at twilight & night
        float duskGlow = smoothstep(0.05, 0.55, uNightFactor) * 0.85 + 0.06;
        vec3 warmHearth = vec3(1.45, 0.88, 0.36) * mix(0.65, 1.15, 1.0 - vUv.y);
        vec3 col = mix(dayGlass, warmHearth, duskGlow);
        col = applyIcelandAtmo(col, vWPos);
        gl_FragColor = vec4(col, 1.0);
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

  /**
   * 1. Iconic Pitch-Black Tarred Timber Icelandic Church (Búðakirkja style!)
   * Matches reference: black tarred siding, crisp white window muntins, white-trimmed dark-red door,
   * steep dark-slate corrugated gable roof, slender black square bell tower + spire + cross.
   */
  function buildIcelandicChurch(spec) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;

    const w = 5.6;
    const h = 3.5;
    const len = 10.2;
    const roofH = 3.1;

    // Deep dry-stone basalt plinth sunk solidly into hillside
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.55, 2.8, len + 0.55), dryStoneMat);
    plinth.position.y = -0.35;
    plinth.receiveShadow = true;
    grp.add(plinth);

    // Pitch-black tarred timber nave
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), tarredChurchMat);
    body.position.y = 1.05 + h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    grp.add(body);

    // Front & rear gable end triangles
    const gableGeo = createGableEndGeo(w, roofH);
    const gFront = new THREE.Mesh(gableGeo, tarredChurchMat);
    gFront.position.set(0, 1.05 + h, len * 0.5 + 0.01);
    grp.add(gFront);
    const gBack = new THREE.Mesh(gableGeo, tarredChurchMat);
    gBack.position.set(0, 1.05 + h, -len * 0.5 - 0.01);
    gBack.rotation.y = Math.PI;
    grp.add(gBack);

    // Crisp delicate white eaves cornice strips along both flanks
    for (const sx of [-w * 0.5 - 0.04, w * 0.5 + 0.04]) {
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, len + 0.4), trimWhiteMat);
      cornice.position.set(sx, 1.05 + h - 0.04, 0);
      grp.add(cornice);
    }

    // Steep charcoal-slate corrugated gable roof + dark ridge cap
    const roof = createThickPitchedRoof(w, len, roofH, roofCharcoalMat, darkSteelMat, 0.36, 0.18);
    roof.position.y = 1.05 + h;
    grp.add(roof);

    // Slender black square bell tower steeple rising from front ridge
    const towerZ = len * 0.5 - 1.35;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.75, 3.2, 1.75), tarredChurchMat);
    tower.position.set(0, 1.05 + h + 2.35, towerZ);
    tower.castShadow = true;
    grp.add(tower);

    // White belt trim & tiny white-framed belfry window on tower
    const towerTrim = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.12, 1.88), trimWhiteMat);
    towerTrim.position.set(0, 1.05 + h + 3.92, towerZ);
    grp.add(towerTrim);
    const belfryWin = createNordicWindow(0.55, 0.75, trimWhiteMat, windowGlassMat, 2);
    belfryWin.position.set(0, 1.05 + h + 3.15, towerZ + 0.89);
    grp.add(belfryWin);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.38, 3.3, 4), roofCharcoalMat);
    spire.position.set(0, 1.05 + h + 5.6, towerZ);
    spire.rotation.y = Math.PI * 0.25;
    spire.castShadow = true;
    grp.add(spire);

    // Delicate iron cross finial
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.08), trimWhiteMat);
    crossV.position.set(0, 1.05 + h + 7.7, towerZ);
    grp.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.08), trimWhiteMat);
    crossH.position.set(0, 1.05 + h + 7.9, towerZ);
    grp.add(crossH);

    // Crisp white-trimmed dark-red arched front doorway + stone entry step
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.48, 2.30, 0.12), trimWhiteMat);
    doorFrame.position.set(0, 2.20, len * 0.5 + 0.04);
    grp.add(doorFrame);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.20, 2.12, 0.16), doorRedMat);
    door.position.set(0, 2.14, len * 0.5 + 0.06);
    grp.add(door);
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 0.9), dryStoneMat);
    step.position.set(0, 0.95, len * 0.5 + 0.45);
    grp.add(step);

    // Small gable window above front door
    const gableWin = createNordicWindow(0.70, 0.90, trimWhiteMat, windowGlassMat, 2);
    gableWin.position.set(0, 1.05 + h + 1.05, len * 0.5 + 0.05);
    grp.add(gableWin);

    // Three tall narrow crisp white-muntin church windows along each flank
    for (const side of [-1, 1]) {
      for (const wz of [-2.9, 0.0, 2.9]) {
        const win = createNordicWindow(0.86, 1.48, trimWhiteMat, windowGlassMat, 3);
        win.position.set(side * (w * 0.5 + 0.04), 2.85, wz);
        win.rotation.y = side * Math.PI * 0.5;
        grp.add(win);
      }
    }

    return grp;
  }

  /**
   * 2. Traditional Low-Slung Icelandic Turf-Roof Farmhouse (Torfbær)
   * Matches reference: hunkering low proportions, battered dry-stacked mossy stone walls,
   * dark tarred wood gables, thick organic undulating mossy turf roof, stone chimney + smoke emitter.
   */
  function buildTurfCottage(spec, smokeOrigins) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    const sc = spec.scale || 1.0;
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;
    grp.scale.setScalar(sc);

    // Authentic low, elongated turf-farmhouse proportions (NOT a tall cube!)
    const w = 5.4;
    const h = 1.85;
    const len = 8.4;
    const roofH = 2.15;

    // Thick battered dry-stacked mossy basalt stone side walls & sunken foundation
    const stoneLower = new THREE.Mesh(new THREE.BoxGeometry(w + 0.85, 2.6, len + 0.35), dryStoneMat);
    stoneLower.position.y = 0.05;
    stoneLower.castShadow = true;
    stoneLower.receiveShadow = true;
    grp.add(stoneLower);

    // Upper stone side walls flanking dark tarred timber gable ends
    const stoneUpper = new THREE.Mesh(new THREE.BoxGeometry(w + 0.45, h, len - 0.15), dryStoneMat);
    stoneUpper.position.y = 0.95 + h * 0.5;
    stoneUpper.castShadow = true;
    stoneUpper.receiveShadow = true;
    grp.add(stoneUpper);

    // Dark tarred timber front & rear gable faces recessed neatly inside the stone side walls
    const frontGableWall = new THREE.Mesh(new THREE.BoxGeometry(w - 0.35, h, 0.25), tarredChurchMat);
    frontGableWall.position.set(0, 0.95 + h * 0.5, len * 0.5 - 0.04);
    grp.add(frontGableWall);
    const backGableWall = new THREE.Mesh(new THREE.BoxGeometry(w - 0.35, h, 0.25), tarredChurchMat);
    backGableWall.position.set(0, 0.95 + h * 0.5, -len * 0.5 + 0.04);
    grp.add(backGableWall);

    const gGeo = createGableEndGeo(w - 0.30, roofH);
    const gf = new THREE.Mesh(gGeo, tarredChurchMat);
    gf.position.set(0, 0.95 + h, len * 0.5 + 0.09);
    grp.add(gf);
    const gb = new THREE.Mesh(gGeo, tarredChurchMat);
    gb.position.set(0, 0.95 + h, -len * 0.5 - 0.09);
    gb.rotation.y = Math.PI;
    grp.add(gb);

    // Thick sculpted mossy Icelandic turf roof blending naturally with hillside moss!
    const turfRoof = createOrganicTurfRoof(w + 0.45, len + 0.2, roofH, turfRoofMat, darkWeatheredTimberMat);
    turfRoof.position.y = 0.92 + h;
    grp.add(turfRoof);

    // Traditional battered mossy turf-and-earth side buttress embankments tucked neatly along the stone flanks
    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(1.15, h + 0.55, len - 0.55), turfRoofMat);
      bank.position.set(side * (w * 0.5 + 0.46), 0.95, 0);
      bank.rotation.z = side * 0.34;
      bank.castShadow = true;
      bank.receiveShadow = true;
      grp.add(bank);
    }

    // Weathered stone chimney
    const chX = -0.85;
    const chY = 0.95 + h + roofH + 0.55;
    const chZ = -1.1;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.9, 0.68), dryStoneMat);
    chimney.position.set(chX, chY - 0.55, chZ);
    chimney.castShadow = true;
    grp.add(chimney);

    if (spec.hasSmoke) {
      // Transform local chimney top into world position for drifting woodsmoke plume
      const cosY = Math.cos(spec.yaw);
      const sinY = Math.sin(spec.yaw);
      const wx = spec.x + (chX * cosY + chZ * sinY) * sc;
      const wz = spec.z + (-chX * sinY + chZ * cosY) * sc;
      const wy = (gy - 0.35) + (chY + 0.45) * sc;
      smokeOrigins.push({ x: wx, y: wy, z: wz });
    }

    // Small weathered wooden door & crisp white-framed multi-pane windows (on both front & rear gables!)
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.65, 0.14), darkWeatheredTimberMat);
    door.position.set(-0.9, 1.72, len * 0.5 + 0.08);
    grp.add(door);

    const winF = createNordicWindow(0.82, 0.88, trimWhiteMat, windowGlassMat, 2);
    winF.position.set(1.05, 1.95, len * 0.5 + 0.10);
    grp.add(winF);

    const winAttic = createNordicWindow(0.58, 0.62, trimWhiteMat, windowGlassMat, 2);
    winAttic.position.set(0.0, 0.95 + h + 0.95, len * 0.5 + 0.11);
    grp.add(winAttic);

    const winRear = createNordicWindow(0.76, 0.82, trimWhiteMat, windowGlassMat, 2);
    winRear.position.set(0.0, 1.92, -(len * 0.5 + 0.10));
    winRear.rotation.y = Math.PI;
    grp.add(winRear);

    return grp;
  }

  /**
   * 3. Weathered Silver-Grey Driftwood Vertical-Plank Barn / Boathouse
   * Matches reference front-left & right outbuildings: bleached grey timber boards,
   * zinc-silver or mossy-green corrugated metal roof, dark stone footing & rustic barn door.
   */
  function buildWeatheredBarn(spec) {
    const grp = new THREE.Group();
    const gy = getTerrainHeight(spec.x, spec.z);
    const sc = spec.scale || 1.0;
    grp.position.set(spec.x, gy - 0.35, spec.z);
    grp.rotation.y = spec.yaw;
    grp.scale.setScalar(sc);

    const w = 5.2;
    const h = 2.45;
    const len = 7.8;
    const roofH = 1.95;

    // Sunken dry-stone rubble footing
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.38, 2.4, len + 0.38), dryStoneMat);
    base.position.y = -0.25;
    base.receiveShadow = true;
    grp.add(base);

    // Bleached silver-grey vertical board timber walls
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), weatheredBarnMat);
    body.position.y = 0.95 + h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    grp.add(body);

    const gGeo = createGableEndGeo(w, roofH);
    const gf = new THREE.Mesh(gGeo, weatheredBarnMat);
    gf.position.set(0, 0.95 + h, len * 0.5 + 0.01);
    grp.add(gf);
    const gb = new THREE.Mesh(gGeo, weatheredBarnMat);
    gb.position.set(0, 0.95 + h, -len * 0.5 - 0.01);
    gb.rotation.y = Math.PI;
    grp.add(gb);

    // Weathered zinc-silver or oxidized moss-green corrugated roof (matching reference left barns!)
    const roofMat = spec.roofStyle < 0.52 ? roofZincMat : spec.roofStyle < 0.84 ? roofMossTinMat : roofCharcoalMat;
    const roof = createThickPitchedRoof(w, len, roofH, roofMat, darkWeatheredTimberMat, 0.36, 0.16);
    roof.position.y = 0.95 + h;
    grp.add(roof);

    // Rustic dark-timber barn double doors with cross-bracing
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.05, 0.14), darkWeatheredTimberMat);
    door.position.set(0, 1.98, len * 0.5 + 0.03);
    grp.add(door);

    // Small weathered side window
    const sideWin = createNordicWindow(0.74, 0.78, trimWhiteMat, windowGlassMat, 2);
    sideWin.position.set(w * 0.5 + 0.04, 2.35, 1.2);
    sideWin.rotation.y = Math.PI * 0.5;
    grp.add(sideWin);

    return grp;
  }

  /** Build complete photorealistic Icelandic village hamlet with crooked paddock fences, stone walls & hearth smoke. */
  function buildIcelandicVillage(village, colliders, disposables) {
    const grp = new THREE.Group();
    const smokeOrigins = [];

    for (const b of village.buildings) {
      if (b.kind === 'church') grp.add(buildIcelandicChurch(b));
      else if (b.kind === 'turf_cottage') grp.add(buildTurfCottage(b, smokeOrigins));
      else grp.add(buildWeatheredBarn(b));
      colliders.push({ x: b.x, z: b.z, r: b.radius });
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

    // Grazing Icelandic Sheep Flock scattered peacefully in the paddock & green valley meadow (matching reference!)
    const sheepCount = 12;
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
    const gy = getTerrainHeight(spec.x, spec.z);
    grp.position.set(spec.x, gy + 1.95, spec.z);
    grp.rotation.y = spec.yaw;

    const span = spec.span || 20.0;
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

    rawGroup.traverse((obj) => {
      if (obj.isInstancedMesh || obj.isSprite) {
        specialChildren.push(obj);
        return;
      }
      if (!obj.isMesh || !obj.geometry || !obj.material) return;
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
    });

    // Preserve dynamic InstancedMeshes (chimney smoke) & Sprites (beacons) with baked world transform
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

  function buildCellLandmarks(cx, cz) {
    const f = getCellFeatures(cx, cz);
    const rawGroup = new THREE.Group();
    const colliders = [];
    const disposables = [];

    if (f.village) rawGroup.add(buildIcelandicVillage(f.village, colliders, disposables));
    for (const o of f.outposts) rawGroup.add(buildOutpostDome(o, colliders));
    for (const r of f.relays) rawGroup.add(buildRustedRelayTower(r, colliders));
    for (const b of f.beacons) rawGroup.add(buildBeaconPost(b));
    for (const bc of f.basaltColumns) rawGroup.add(buildBasaltColumnCluster(bc, colliders));
    for (const br of f.bridges) rawGroup.add(buildTimberFootbridge(br));
    for (const ca of f.cairns) rawGroup.add(buildStoneCairn(ca));

    const group = batchStaticCellGroup(rawGroup, disposables);
    root.add(group);
    return { key: `${cx},${cz}`, group, colliders, disposables };
  }

  let lastLmPcx = 1e9;
  let lastLmPcz = 1e9;

  function rebuildAll(centerX, centerZ) {
    for (const c of activeCells.values()) {
      root.remove(c.group);
      if (c.disposables) c.disposables.forEach((d) => d.dispose && d.dispose());
    }
    activeCells.clear();
    lastLmPcx = 1e9;
    lastLmPcz = 1e9;
    update(centerX, centerZ);
  }

  function update(centerX, centerZ) {
    const pcx = Math.round(centerX / CELL_SIZE);
    const pcz = Math.round(centerZ / CELL_SIZE);
    if (pcx === lastLmPcx && pcz === lastLmPcz) return;
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
        root.remove(cell.group);
        if (cell.disposables) cell.disposables.forEach((d) => d.dispose && d.dispose());
        activeCells.delete(key);
      }
    }
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

  return { update, rebuildAll, getCollidersNear };
}
