import * as THREE from 'three';
import {
  getTerrainHeight,
  getTerrainNormal,
  getPathCenterX,
  isInCityBounds,
  isOnRoadOrHighway,
  fbm2,
  ridgedFbm2,
  worley2,
  hash2,
  smoothstep,
  clamp,
  WATER_LEVEL,
  VOLCANO_POS
} from './noise.js';
import { ATMO_UNIFORMS, ATMO_GLSL_PARS, enhancePBRMaterial, getCloudNoiseTexture } from './atmosphere.js';
import { createLODInstancedBatch } from './assets.js';

/**
 * Generates an angular fractured granite rock outcrop using multi-plane cleavage
 * & ridged rock erosion (never smooth sphere blobs or honeycomb plates).
 */
function createCragRockGeometry(seed = 1, detail = 3) {
  const geo = new THREE.IcosahedronGeometry(1.0, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = v.x + seed * 3.7;
    const ny = v.y - seed * 2.1;
    const nz = v.z + seed * 5.3;

    const macro = fbm2(nx * 0.9 + ny * 0.4, nz * 0.9 - ny * 0.35, 3);
    const ridge = ridgedFbm2(nx * 1.45, nz * 1.45 + ny * 1.1, 3);
    // Subtle stratified cliff step & cleaved angular sides
    const ledge = Math.sin(v.y * 5.2 + macro * 2.5) * 0.055;
    const cleave = Math.abs(v.x * 0.6 + v.z * 0.8) * 0.08;
    const scale = 0.88 + macro * 0.22 + (ridge - 0.5) * 0.26 + ledge - cleave;

    v.multiplyScalar(scale);
    if (v.y < -0.22) v.y *= 0.65;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Creates a subtly chipped, weathered masonry block geometry (no razor-sharp CG corners). */
function createWeatheredBlockGeo(w, h, d, seed = 1) {
  const geo = new THREE.BoxGeometry(w, h, d, 4, 4, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const edgeFactor =
      (Math.abs(x) / (w * 0.5) > 0.72 ? 1 : 0) +
      (Math.abs(y) / (h * 0.5) > 0.72 ? 1 : 0) +
      (Math.abs(z) / (d * 0.5) > 0.72 ? 1 : 0);
    const chip = fbm2(x * 2.4 + y * 1.9 + seed, z * 2.4 - y * 1.5, 2) * (0.018 + edgeFactor * 0.025);
    pos.setXYZ(i, x + chip, y + chip * 0.6, z - chip);
  }
  geo.computeVertexNormals();
  return geo;
}

function createTriplanarRockMaterial(texLib) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.03
  });
  mat.fog = false;
  mat.customProgramCacheKey = () => 'botw_triplanar_rock_moss_v2';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMO_UNIFORMS);
    shader.uniforms.uRockMap = { value: texLib.cliffRock.map };
    shader.uniforms.uRockNorm = { value: texLib.cliffRock.normalMap };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAtmoWPos;\nvarying vec3 vAtmoWNorm;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\n{\nvec4 awp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nawp = instanceMatrix * awp;\n#endif\nawp = modelMatrix * awp;\nvAtmoWPos = awp.xyz;\nvec3 awn = objectNormal;\n#ifdef USE_INSTANCING\nawn = mat3(instanceMatrix) * awn;\n#endif\nvAtmoWNorm = normalize(mat3(modelMatrix) * awn);\n}`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform sampler2D uRockMap;\nuniform sampler2D uRockNorm;\nvarying vec3 vAtmoWPos;\nvarying vec3 vAtmoWNorm;\n${ATMO_GLSL_PARS}`
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */`
        #include <color_fragment>
        vec3 rPerturbedNorm = normalize(vAtmoWNorm);
        {
          vec3 wPos = vAtmoWPos;
          vec3 wn = normalize(vAtmoWNorm);
          vec3 tw = pow(abs(wn), vec3(4.0));
          tw /= max(tw.x + tw.y + tw.z, 0.0001);
          float rs = 0.22;
          vec3 cx = texture2D(uRockMap, wPos.zy * rs).rgb;
          vec3 cy = texture2D(uRockMap, wPos.xz * rs).rgb;
          vec3 cz = texture2D(uRockMap, wPos.xy * rs).rgb;
          vec3 col = cx * tw.x + cy * tw.y + cz * tw.z;

          vec3 nx = texture2D(uRockNorm, wPos.zy * rs).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(uRockNorm, wPos.xz * rs).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(uRockNorm, wPos.xy * rs).xyz * 2.0 - 1.0;
          vec3 nOff = vec3(0.0, nx.y, nx.x) * tw.x + vec3(ny.x, 0.0, ny.y) * tw.y + vec3(nz.x, nz.y, 0.0) * tw.z;
          rPerturbedNorm = normalize(wn + nOff * 0.9);

          // Brighter sunlit granite strata & lush emerald-olive moss so foreground crags read clearly even in shadow
          col *= 1.54;
          float mNoise = atmoFbm(wPos.xz * 0.42);
          float topMask = smoothstep(0.36, 0.78, wn.y + (mNoise - 0.5) * 0.38);
          vec3 mossCol = mix(vec3(0.16, 0.24, 0.045), vec3(0.32, 0.40, 0.08), mNoise);
          diffuseColor.rgb = mix(col, mossCol, topMask * 0.52);
        }
        `
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\nnormal = normalize(mat3(viewMatrix) * rPerturbedNorm);`
      )
      .replace(
        '#include <lights_fragment_begin>',
        `#include <lights_fragment_begin>\nfloat cShad = sampleCloudShadow(vAtmoWPos.xz, uTime, uSunDir);\nreflectedLight.directDiffuse *= cShad;\nreflectedLight.directSpecular *= cShad;`
      )
      .replace(
        '#include <fog_fragment>',
        `gl_FragColor.rgb = applyRealisticAtmosphere(gl_FragColor.rgb, vAtmoWPos, cameraPosition);`
      );
  };
  return mat;
}

export function createLandmarks(texLib, assetManager, lodManager) {
  const root = new THREE.Group();

  // Shared PBR Materials
  const cragRockMat = createTriplanarRockMaterial(texLib);

  const masonryMat = new THREE.MeshStandardMaterial({
    map: texLib.masonry.map,
    normalMap: texLib.masonry.normalMap,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughnessMap: texLib.masonry.roughnessMap,
    roughness: 0.84,
    metalness: 0.04
  });
  enhancePBRMaterial(masonryMat, {
    cacheKey: 'botw_masonry_moss',
    mossStrength: 0.52
  });

  const castleStoneMat = new THREE.MeshStandardMaterial({
    map: texLib.masonry.map,
    normalMap: texLib.masonry.normalMap,
    color: 0x626c7d,
    roughness: 0.82,
    metalness: 0.08
  });
  enhancePBRMaterial(castleStoneMat, { cacheKey: 'botw_castle_stone', cloudShadows: false });

  const castleRoofMat = new THREE.MeshStandardMaterial({
    color: 0x2c3b54,
    roughness: 0.55,
    metalness: 0.22
  });
  enhancePBRMaterial(castleRoofMat, { cacheKey: 'botw_castle_roof', cloudShadows: false });

  const calamityPillarMat = new THREE.MeshStandardMaterial({
    map: texLib.sheikah.map,
    normalMap: texLib.sheikah.normalMap,
    emissive: new THREE.Color(0xff421c),
    emissiveMap: texLib.sheikah.emissiveMap,
    emissiveIntensity: 0.65,
    color: 0x3b3440,
    roughness: 0.65,
    metalness: 0.28
  });
  enhancePBRMaterial(calamityPillarMat, { cacheKey: 'botw_calamity_pillar', cloudShadows: false });

  const mesaMat = new THREE.MeshStandardMaterial({
    map: texLib.cliffRock.map,
    normalMap: texLib.cliffRock.normalMap,
    color: 0xc29372,
    roughness: 0.88,
    metalness: 0.02
  });
  enhancePBRMaterial(mesaMat, { cacheKey: 'botw_mesa_rock', cloudShadows: false });

  const woodMat = new THREE.MeshStandardMaterial({
    map: texLib.barkOak.map,
    normalMap: texLib.barkOak.normalMap,
    roughness: 0.88
  });
  enhancePBRMaterial(woodMat, { cacheKey: 'botw_prop_wood' });

  // =========================================================================
  // 1. HERO FOREGROUND CRAGGY BOULDERS, CLIFF LEDGES & SCATTERED VALLEY STONES
  // =========================================================================
  const rockGeoA = createCragRockGeometry(1, 3);
  const rockGeoB = createCragRockGeometry(7, 3);

  const heroRocks = [
    // Right foreground rocky cliff lip outcrops framing the overlook
    { x: 4.4, z: -3.6, sx: 1.55, sy: 0.92, sz: 1.3, ry: 0.4, g: rockGeoA },
    { x: 6.4, z: -1.3, sx: 2.35, sy: 1.45, sz: 1.9, ry: 1.3, g: rockGeoB },
    { x: 8.6, z: 1.4, sx: 2.6, sy: 1.75, sz: 2.1, ry: 2.1, g: rockGeoA },
    { x: 11.4, z: 3.1, sx: 1.85, sy: 1.15, sz: 1.65, ry: 0.8, g: rockGeoB },
    { x: 3.2, z: -5.4, sx: 1.05, sy: 0.58, sz: 0.85, ry: 2.6, g: rockGeoB },
    // Left cliff edge rock outcrop near ruins
    { x: -3.5, z: -4.8, sx: 1.15, sy: 0.62, sz: 0.95, ry: 1.7, g: rockGeoA },
    { x: -7.6, z: -3.8, sx: 1.7, sy: 1.05, sz: 1.45, ry: 0.5, g: rockGeoB },
    // Small grounding trail stones near player feet
    { x: 2.1, z: -1.4, sx: 0.42, sy: 0.24, sz: 0.38, ry: 0.9, g: rockGeoA },
    { x: -2.0, z: 1.1, sx: 0.36, sy: 0.20, sz: 0.32, ry: 2.2, g: rockGeoB }
  ];

  heroRocks.forEach((r) => {
    const m = new THREE.Mesh(r.g, cragRockMat);
    const y = getTerrainHeight(r.x, r.z);
    m.position.set(r.x, y - r.sy * 0.32, r.z);
    m.scale.set(r.sx, r.sy, r.sz);
    m.rotation.set(0.06, r.ry, -0.08);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  });

  // Dramatic stratified granite cliff-wall rock ledges & buttresses plunging below the overlook lip
  const cliffLedges = [
    { x: -1.8, z: -6.8, sx: 3.4, sy: 2.2, sz: 2.6, ry: 0.3 },
    { x: 2.6, z: -7.5, sx: 3.8, sy: 2.6, sz: 2.8, ry: 1.2 },
    { x: -6.5, z: -6.5, sx: 3.2, sy: 2.4, sz: 2.5, ry: 2.0 },
    { x: 7.4, z: -6.2, sx: 3.5, sy: 2.5, sz: 2.7, ry: 0.7 },
    { x: -10.5, z: -8.2, sx: 4.0, sy: 3.0, sz: 3.0, ry: 1.6 },
    { x: 11.2, z: -8.8, sx: 4.2, sy: 3.1, sz: 3.1, ry: 2.5 },
    // Rocky outcrop ledge feeding the distant waterfall at (338, -295) & lake islet boulders
    { x: 342.0, z: -296.0, sx: 14.0, sy: 9.5, sz: 11.0, ry: 0.8 },
    { x: 109.0, z: -242.0, sx: 3.8, sy: 2.0, sz: 3.2, ry: 0.5 },
    { x: 119.0, z: -248.0, sx: 3.1, sy: 1.7, sz: 2.8, ry: 1.9 }
  ];
  cliffLedges.forEach((cl, idx) => {
    const m = new THREE.Mesh(idx % 2 === 0 ? rockGeoA : rockGeoB, cragRockMat);
    const y = getTerrainHeight(cl.x, cl.z);
    m.position.set(cl.x, y - cl.sy * 0.42, cl.z);
    m.scale.set(cl.sx, cl.sy, cl.sz);
    m.rotation.set(0.12, cl.ry, -0.06);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  });

  // Scattered valley boulders & cliff talus stones (2-LOD Spatial Batch across 3.36 km world)
  const rockGeoLod1 = createCragRockGeometry(7, 1);
  const rockInsts = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < 1600 && rockInsts.length < 680; i++) {
    const isFG = i < 120;
    const rx = isFG ? (hash2(i, 11) - 0.42) * 44 : (hash2(i, 13) - 0.5) * 1850;
    const rz = isFG ? (hash2(i, 17) - 0.52) * 32 : (hash2(i, 19) - 0.54) * 1850;
    if (Math.hypot(rx - 0.4, rz - 7.6) < 4.5 || Math.hypot(rx, rz) < 3.0) continue;
    if (isInCityBounds(rx, rz, 6.0) || isOnRoadOrHighway(rx, rz, 6.0)) continue;
    const ry = getTerrainHeight(rx, rz);
    if (ry < WATER_LEVEL - 0.4) continue;

    const s = isFG ? (0.16 + hash2(i, 23) * 0.42) : (0.95 + hash2(i, 29) * 2.8);
    dummy.position.set(rx, ry - s * 0.30, rz);
    dummy.rotation.set(hash2(i, 31) * 0.4, hash2(i, 37) * Math.PI * 2, hash2(i, 41) * 0.4);
    dummy.scale.set(s * (0.9 + hash2(i, 43) * 0.45), s * 0.62, s * (0.9 + hash2(i, 47) * 0.45));
    dummy.updateMatrix();
    rockInsts.push({ x: rx, y: ry, z: rz, matrix: dummy.matrix.clone() });
  }

  if (assetManager && lodManager) {
    assetManager.registerPrefab('scatter_rock', {
      lods: [
        { geo: rockGeoB, mat: cragRockMat, dist: 140, castShadow: true, maxVisible: 260 },
        { geo: rockGeoLod1, mat: cragRockMat, dist: 460, castShadow: false, maxVisible: 520 }
      ]
    });
    const rockBatch = createLODInstancedBatch(assetManager, 'scatter_rock', rockInsts, { cellSize: 130, maxDist: 460 });
    root.add(rockBatch.group);
    lodManager.addBatch(rockBatch);
  }

  // =========================================================================
  // 2. MASTERCRAFTED CLASSICAL OVERLOOK TEMPLE RUINS & OPEN SHRINE LANTERN
  // =========================================================================
  const ruinGroup = new THREE.Group();
  root.add(ruinGroup);

  function addGroundedBlock(parent, w, h, d, wx, wz, rotY = 0, rotZ = 0, sink = 0.28, seed = 1) {
    const g = createWeatheredBlockGeo(w, h, d, seed);
    const m = new THREE.Mesh(g, masonryMat);
    const gy = getTerrainHeight(wx, wz);
    m.position.set(wx, gy + h * 0.5 - sink, wz);
    m.rotation.set(0, rotY, rotZ);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function createFlutedColumnGeo(rTop, rBot, height, flutes = 12) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, height, flutes * 3, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const ang = Math.atan2(z, x);
      const r = Math.hypot(x, z);
      if (r > rTop * 0.45) {
        const fluteWave = Math.max(0, Math.cos(ang * flutes));
        const endMask = smoothstep(-height * 0.45, -height * 0.32, y) * smoothstep(height * 0.45, height * 0.32, y);
        const chip = fbm2(x * 3.1 + y * 2.2, z * 3.1, 2) * 0.018;
        const scale = 1.0 - fluteWave * 0.085 * endMask + chip;
        p.setXYZ(i, x * scale, y, z * scale);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Flagstone terrace slabs along left-foreground edge
  const slabs = [
    { x: -5.4, z: -2.2, w: 2.3, h: 0.24, d: 1.7, ry: 0.18 },
    { x: -3.7, z: -1.4, w: 1.6, h: 0.22, d: 1.5, ry: -0.22 },
    { x: -6.4, z: -0.6, w: 2.0, h: 0.24, d: 1.8, ry: 0.42 },
    { x: -4.8, z: -3.6, w: 1.7, h: 0.24, d: 1.4, ry: -0.1 }
  ];
  slabs.forEach((s, i) => addGroundedBlock(ruinGroup, s.w, s.h, s.d, s.x, s.z, s.ry, 0, 0.12, i + 3));

  // Mastercrafted Fluted Classical Stone Archway framing left foreground (-5.6, -2.5)
  const archX = -5.6;
  const archZ = -2.5;
  const archBaseY = getTerrainHeight(archX, archZ);
  const archSub = new THREE.Group();
  archSub.position.set(archX, archBaseY - 0.35, archZ);
  archSub.rotation.y = 0.42;

  function buildColumnAssembly(xPos, colH) {
    const colG = new THREE.Group();
    colG.position.set(xPos, 0, 0);

    const plinth = new THREE.Mesh(createWeatheredBlockGeo(1.06, 0.32, 1.06, 11 + xPos), masonryMat);
    plinth.position.y = 0.16;
    plinth.castShadow = plinth.receiveShadow = true;
    colG.add(plinth);

    const torusBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.49, 0.22, 16), masonryMat);
    torusBase.position.y = 0.42;
    torusBase.castShadow = torusBase.receiveShadow = true;
    colG.add(torusBase);

    const shaft = new THREE.Mesh(createFlutedColumnGeo(0.34, 0.39, colH, 12), masonryMat);
    shaft.position.y = 0.52 + colH * 0.5;
    shaft.castShadow = shaft.receiveShadow = true;
    colG.add(shaft);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.24, 16), masonryMat);
    neck.position.y = 0.52 + colH + 0.10;
    neck.castShadow = neck.receiveShadow = true;
    colG.add(neck);

    const abacus = new THREE.Mesh(createWeatheredBlockGeo(1.04, 0.26, 1.04, 19 + xPos), masonryMat);
    abacus.position.y = 0.52 + colH + 0.34;
    abacus.castShadow = abacus.receiveShadow = true;
    colG.add(abacus);

    return colG;
  }

  archSub.add(buildColumnAssembly(-1.35, 2.35));
  archSub.add(buildColumnAssembly(1.35, 1.95));

  // Curved Segmented Voussoir Stone Arch spanning from tall left capital into weathered broken crown
  const archRadius = 1.38;
  const archCenterY = 2.96;
  const voussoirs = 9;
  for (let v = 0; v < voussoirs - 1; v++) {
    // Omit final stone near right edge for authentic weathered ruin break
    const frac = (v + 0.5) / voussoirs;
    const ang = Math.PI - frac * Math.PI * 0.92;
    const vx = Math.cos(ang) * archRadius;
    const vy = archCenterY + Math.sin(ang) * (archRadius * 0.88);
    const stone = new THREE.Mesh(createWeatheredBlockGeo(0.44, 0.52, 0.82, 41 + v), masonryMat);
    stone.position.set(vx, vy, 0);
    stone.rotation.z = ang - Math.PI * 0.5;
    stone.castShadow = stone.receiveShadow = true;
    archSub.add(stone);
  }

  // Fallen stone arch segment resting diagonally atop the right capital
  const brokenCapStone = new THREE.Mesh(createWeatheredBlockGeo(0.66, 0.44, 0.82, 49), masonryMat);
  brokenCapStone.position.set(1.36, 3.04, 0.02);
  brokenCapStone.rotation.z = -0.32;
  brokenCapStone.castShadow = brokenCapStone.receiveShadow = true;
  archSub.add(brokenCapStone);

  // Clinging ivy / moss foliage tufts draped naturally over ruin capitals & broken arch
  const ivyMat = new THREE.MeshStandardMaterial({
    map: texLib.shrubCard,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.78
  });
  enhancePBRMaterial(ivyMat, { cacheKey: 'botw_ruin_ivy', isFoliage: true, windStrength: 0.04 });

  for (const [ix, iy, iz, sc, ry] of [
    [-1.35, 3.22, 0.42, 0.95, 0.2],
    [1.35, 2.84, 0.38, 0.85, -0.5],
    [-0.55, 4.18, 0.22, 0.90, 0.8],
    [0.25, 4.25, -0.22, 0.82, 2.2]
  ]) {
    const ivy = new THREE.Mesh(new THREE.PlaneGeometry(sc, sc * 0.85), ivyMat);
    ivy.position.set(ix, iy, iz);
    ivy.rotation.set(0.25, ry, 0.12);
    archSub.add(ivy);
  }

  // Fallen fluted column drum & carved stone rubble beside archway
  const fallenDrum = new THREE.Mesh(createFlutedColumnGeo(0.36, 0.38, 1.35, 12), masonryMat);
  const fY = getTerrainHeight(-4.1, -0.5);
  fallenDrum.position.set(-4.1, fY + 0.16, -0.5);
  fallenDrum.rotation.set(0.18, 0.85, 1.45);
  fallenDrum.castShadow = fallenDrum.receiveShadow = true;
  ruinGroup.add(fallenDrum);

  addGroundedBlock(ruinGroup, 1.15, 0.68, 0.65, -7.1, -1.0, 0.35, 0.04, 0.25, 22);
  addGroundedBlock(ruinGroup, 0.55, 0.42, 0.52, -4.6, -2.9, 0.5, 0.12, 0.18, 23);
  ruinGroup.add(archSub);

  // Open Carved Stone Shrine Lantern with Softly Glowing Sheikah Crystal Core (-3.35, -2.55)
  const wayX = -3.35;
  const wayZ = -2.55;
  const wayY = getTerrainHeight(wayX, wayZ);
  const wayGroup = new THREE.Group();
  wayGroup.position.set(wayX, wayY - 0.16, wayZ);
  wayGroup.rotation.y = 0.5;

  const wayPlinth = new THREE.Mesh(createWeatheredBlockGeo(0.95, 0.28, 0.95, 51), masonryMat);
  wayPlinth.position.y = 0.14;
  wayPlinth.castShadow = wayPlinth.receiveShadow = true;
  wayGroup.add(wayPlinth);

  const wayPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.62, 6), masonryMat);
  wayPedestal.position.y = 0.58;
  wayPedestal.castShadow = wayPedestal.receiveShadow = true;
  wayGroup.add(wayPedestal);

  // 4 carved corner stone mullions housing glowing cyan-gold crystal orb
  for (let p = 0; p < 4; p++) {
    const a = (p / 4) * Math.PI * 2 + Math.PI * 0.25;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.48, 0.10), masonryMat);
    post.position.set(Math.cos(a) * 0.24, 1.12, Math.sin(a) * 0.24);
    post.castShadow = true;
    wayGroup.add(post);
  }

  const crystalOrb = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14, 1),
    new THREE.MeshBasicMaterial({ color: 0x5be8ff })
  );
  crystalOrb.position.y = 1.12;
  wayGroup.add(crystalOrb);

  const wayCapBase = new THREE.Mesh(createWeatheredBlockGeo(0.76, 0.14, 0.76, 52), masonryMat);
  wayCapBase.position.y = 1.42;
  wayCapBase.castShadow = true;
  wayGroup.add(wayCapBase);

  const wayCap = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.34, 4), masonryMat);
  wayCap.rotation.y = Math.PI * 0.25;
  wayCap.position.y = 1.66;
  wayCap.castShadow = true;
  wayGroup.add(wayCap);
  ruinGroup.add(wayGroup);

  // Weathered flat stepping stones leading subtly across the overlook crest trail
  [
    { x: -1.1, z: -0.9, w: 0.72, d: 0.54, ry: 0.2 },
    { x: 0.9, z: -1.8, w: 0.65, d: 0.48, ry: -0.35 },
    { x: -2.2, z: -1.7, w: 0.78, d: 0.58, ry: 0.55 },
    { x: 0.3, z: 1.9, w: 0.62, d: 0.52, ry: 0.15 }
  ].forEach((st, idx) => addGroundedBlock(ruinGroup, st.w, 0.14, st.d, st.x, st.z, st.ry, 0, 0.085, 31 + idx));

  // =========================================================================
  // 3. MIDGROUND VALLEY STONE BRIDGE & RUSTIC TRAIL FENCES
  // =========================================================================
  const bridgeGroup = new THREE.Group();
  const brX = 320;
  const brZ = -340;
  bridgeGroup.position.set(brX, WATER_LEVEL + 0.5, brZ);
  bridgeGroup.rotation.y = 0.28;

  const brDeck = new THREE.Mesh(new THREE.BoxGeometry(22, 0.8, 4.8), masonryMat);
  brDeck.position.y = 1.6;
  brDeck.castShadow = brDeck.receiveShadow = true;
  bridgeGroup.add(brDeck);

  for (const sx of [-7.5, 0, 7.5]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.6, 5.1), masonryMat);
    pier.position.set(sx, -0.5, 0);
    pier.castShadow = pier.receiveShadow = true;
    bridgeGroup.add(pier);
  }
  for (const sz of [-2.1, 2.1]) {
    for (let px = -9.6; px <= 9.6; px += 3.2) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 0.45), masonryMat);
      post.position.set(px, 2.35, sz);
      bridgeGroup.add(post);
    }
  }
  root.add(bridgeGroup);

  // Split-rail timber fence segments along winding valley trail (skipping Ring Highway crossing!)
  for (let z = -42; z >= -190; z -= 16) {
    const px = getPathCenterX(z) + (z % 32 === 0 ? 5.6 : -5.6);
    if (isOnRoadOrHighway(px, z, 6.5)) continue;
    const py = getTerrainHeight(px, z);
    const pyNext = getTerrainHeight(px, z - 4.2);
    const fGroup = new THREE.Group();
    fGroup.position.set(px, py - 0.15, z);

    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6), woodMat);
    p1.position.y = 0.65;
    p1.castShadow = true;
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6), woodMat);
    p2.position.set(0, 0.65 + (pyNext - py), -4.2);
    p2.castShadow = true;

    const railA = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 4.4, 5), woodMat);
    railA.rotation.x = Math.PI / 2;
    railA.position.set(0, 0.95 + (pyNext - py) * 0.5, -2.1);
    const railB = railA.clone();
    railB.position.y -= 0.35;

    fGroup.add(p1, p2, railA, railB);
    root.add(fGroup);
  }

  // =========================================================================
  // 4. DEATH MOUNTAIN VOLCANO + LAVA CRACKS + VOLUMETRIC ASH PLUME
  // =========================================================================
  const volcanoMat = new THREE.MeshStandardMaterial({
    map: texLib.volcanoRock.map,
    normalMap: texLib.volcanoRock.normalMap,
    normalScale: new THREE.Vector2(1.5, 1.5),
    emissive: new THREE.Color(0xff5a18),
    emissiveMap: texLib.volcanoRock.emissiveMap,
    emissiveIntensity: 0.9,
    roughness: 0.88,
    metalness: 0.05
  });
  enhancePBRMaterial(volcanoMat, { cacheKey: 'botw_volcano_pbr', cloudShadows: false });

  function buildDeathMountain() {
    const group = new THREE.Group();
    group.position.set(VOLCANO_POS.x, 0, VOLCANO_POS.z);

    // Colossal ~1,080m tall Mount Eldin Stratovolcano 4.7km across the lake!
    const coneH = 1080;
    const radialSegs = 96;
    const heightSegs = 36;
    const coneGeo = new THREE.CylinderGeometry(145, 1480, coneH, radialSegs, heightSegs, false);
    const pos = coneGeo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i);
      let vy = pos.getY(i) + coneH * 0.5;
      let vz = pos.getZ(i);
      const hNorm = clamp(vy / coneH, 0, 1);
      const ang = Math.atan2(vz, vx);

      const warpAng = ang + fbm2(Math.cos(ang) * 1.6 + hNorm * 2.6, Math.sin(ang) * 1.6 - hNorm * 2.1, 3) * 0.62;
      const gullies = (Math.sin(warpAng * 7.0 + 0.4) * 0.12 + Math.cos(warpAng * 13.0 - hNorm * 2.4) * 0.06) * (1.0 - hNorm * 0.35);
      const ridgeDisp = (ridgedFbm2(vx * 0.0022, vz * 0.0022 + vy * 0.0016, 4) - 0.35) * 185.0 * (1.0 - hNorm * 0.42);
      const flare = Math.pow(1.0 - hNorm, 1.55) * 1.15 + 0.22;

      vx = vx * (1.0 + gullies) * (0.72 + flare * 0.34) + ridgeDisp * Math.cos(ang);
      vz = vz * (1.0 + gullies) * (0.72 + flare * 0.34) + ridgeDisp * Math.sin(ang);

      if (hNorm > 0.93) {
        const rimJag = Math.sin(ang * 5.0) * 32.0 + Math.cos(ang * 11.0) * 18.0;
        if (Math.hypot(vx, vz) < 110) vy -= 68.0;
        else vy += rimJag;
      }
      pos.setXYZ(i, vx, vy, vz);
    }

    const stride = radialSegs + 1;
    for (let iy = 0; iy <= heightSegs; iy++) {
      const i0 = iy * stride;
      const iEnd = i0 + radialSegs;
      pos.setXYZ(iEnd, pos.getX(i0), pos.getY(i0), pos.getZ(i0));
    }
    coneGeo.computeVertexNormals();

    const normAttr = coneGeo.attributes.normal;
    for (let iy = 0; iy <= heightSegs; iy++) {
      const i0 = iy * stride;
      const iEnd = i0 + radialSegs;
      const nx = normAttr.getX(i0) + normAttr.getX(iEnd);
      const ny = normAttr.getY(i0) + normAttr.getY(iEnd);
      const nz = normAttr.getZ(i0) + normAttr.getZ(iEnd);
      const nLen = Math.hypot(nx, ny, nz) || 1.0;
      normAttr.setXYZ(i0, nx / nLen, ny / nLen, nz / nLen);
      normAttr.setXYZ(iEnd, nx / nLen, ny / nLen, nz / nLen);
    }
    normAttr.needsUpdate = true;
    const mainPeak = new THREE.Mesh(coneGeo, volcanoMat);
    mainPeak.rotation.y = Math.PI;
    group.add(mainPeak);

    const spurs = [
      { x: -920, z: 190, w: 680, h: 680, seed: 1.4 },
      { x: -1520, z: 360, w: 560, h: 510, seed: 3.1 },
      { x: 900, z: 210, w: 660, h: 640, seed: 5.7 },
      { x: 1480, z: 390, w: 580, h: 480, seed: 7.2 },
      { x: 120, z: 480, w: 480, h: 420, seed: 9.1 }
    ];
    spurs.forEach((sp) => {
      const sg = new THREE.CylinderGeometry(68, sp.w * 1.05, sp.h, 28, 12);
      const spPos = sg.attributes.position;
      for (let i = 0; i < spPos.count; i++) {
        let px = spPos.getX(i);
        let py = spPos.getY(i) + sp.h * 0.5;
        let pz = spPos.getZ(i);
        const hNorm = clamp(py / sp.h, 0, 1);
        const flare = Math.pow(1.0 - hNorm, 1.55) * 0.85 + 0.30;
        const rDisp = (ridgedFbm2(px * 0.0038 + sp.seed, pz * 0.0038 + py * 0.0024, 3) - 0.3) * 115.0;
        px = px * (0.65 + flare * 0.48) + rDisp * 0.65;
        pz = pz * (0.65 + flare * 0.48) + rDisp * 0.65;
        spPos.setXYZ(i, px, py, pz);
      }
      sg.computeVertexNormals();
      const sm = new THREE.Mesh(sg, volcanoMat);
      sm.position.set(sp.x, -18, sp.z);
      group.add(sm);
    });

    const lavaGlowMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      uniforms: Object.assign({}, ATMO_UNIFORMS),
      vertexShader: `varying vec2 vUv; varying vec3 vWorldPos; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorldPos;
        ${ATMO_GLSL_PARS}
        void main() {
          float d = length((vUv - 0.5) * vec2(1.8, 2.4));
          float pulse = 0.85 + 0.15 * sin(uTime * 1.9);
          float a = smoothstep(1.0, 0.08, d) * 0.85 * pulse;
          vec3 col = mix(vec3(1.1, 0.18, 0.02), vec3(1.6, 0.75, 0.18), smoothstep(0.65, 0.0, d));
          col *= bblAerialFade(vWorldPos);
          gl_FragColor = vec4(col, a);
        }
      `
    });
    const lavaGlow = new THREE.Mesh(new THREE.PlaneGeometry(460, 220), lavaGlowMat);
    lavaGlow.position.set(0, 1068, 60);
    group.add(lavaGlow);

    const ashGroup = new THREE.Group();
    ashGroup.position.set(0, 1020, 0);

    const ashMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: Object.assign({}, ATMO_UNIFORMS, { uCloudNoise: { value: getCloudNoiseTexture() } }),
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uCloudNoise;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        ${ATMO_GLSL_PARS}

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          vec2 drift = vec2(uTime * 0.006, -uTime * 0.014);
          float billow = texture2D(uCloudNoise, vUv * 0.95 + drift).g;
          float detail = texture2D(uCloudNoise, vUv * 2.1 - drift * 1.4 + vec2(0.23, 0.41)).a;
          float warp = (billow - 0.5) * 0.28 + (detail - 0.5) * 0.14;
          vec2 q = vec2(p.x * (0.95 - 0.25 * clamp(p.y + 0.5, 0.0, 1.0)) + warp, (p.y - 0.02) * 1.18 + warp * 0.45);
          float radial = smoothstep(0.92, 0.18, length(q));
          float bottomBase = smoothstep(-0.92, -0.45, p.y);
          float density = radial * bottomBase * smoothstep(0.22, 0.78, billow * 0.62 + detail * 0.38 + radial * 0.22);
          if (density < 0.012) discard;

          float sunSide = clamp(p.x * uSunDir.x * 1.2 + p.y * 0.55 + 0.40, 0.0, 1.0);
          float dayLight = mix(0.18, 1.0, 1.0 - uNightFactor * 0.80);
          vec3 darkAsh = vec3(0.055, 0.06, 0.085) * mix(0.38, 1.0, 1.0 - uNightFactor * 0.65);
          vec3 litAsh = mix(vec3(0.28, 0.25, 0.27), uHazeWarm * 0.88, 0.50) * dayLight;
          vec3 col = mix(darkAsh, litAsh, smoothstep(0.18, 0.90, sunSide * 0.7 + detail * 0.35));

          float calderaGlow = exp(-p.x * p.x * 8.5) * (1.0 - smoothstep(-0.88, -0.10, p.y));
          col += vec3(1.15, 0.28, 0.05) * calderaGlow * mix(0.55, 0.95, uNightFactor);

          col = bblAerial(col, vWorldPos);
          gl_FragColor = vec4(col, clamp(density * mix(0.76, 0.62, uNightFactor), 0.0, 0.82));
        }
      `
    });

    const plume = new THREE.Mesh(new THREE.PlaneGeometry(1650, 820), ashMat);
    plume.position.set(0, 240, 0);
    ashGroup.add(plume);
    group.add(ashGroup);

    root.add(group);
    return ashGroup;
  }
  const volcanicPlume = buildDeathMountain();

  // =========================================================================
  // 5. HYRULE CASTLE (THREE.LOD GOTHIC CITADEL + CALAMITY PILLARS + MIST)
  // =========================================================================
  function buildHyruleCastle() {
    const castleX = -1350;
    const castleZ = -2850;
    const baseY = getTerrainHeight(castleX, castleZ) - 10;

    const lod = new THREE.LOD();
    lod.position.set(castleX, baseY, castleZ);
    lod.scale.setScalar(1.65);

    const hiGroup = new THREE.Group();
    const baseRock = new THREE.Mesh(createCragRockGeometry(14, 3), cragRockMat);
    baseRock.scale.set(48, 28, 42);
    baseRock.position.y = 11;
    hiGroup.add(baseRock);

    const wallRing = new THREE.Mesh(new THREE.CylinderGeometry(34, 38, 16, 10), castleStoneMat);
    wallRing.position.y = 26;
    hiGroup.add(wallRing);

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3.2, 2.2), castleStoneMat);
      merlon.position.set(Math.cos(a) * 34, 35.2, Math.sin(a) * 34);
      merlon.rotation.y = -a;
      hiGroup.add(merlon);
    }

    const lowerKeep = new THREE.Mesh(new THREE.CylinderGeometry(12, 16, 36, 8), castleStoneMat);
    lowerKeep.position.y = 48;
    const upperKeep = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 10.5, 24, 8), castleStoneMat);
    upperKeep.position.y = 75;
    const centralSpire = new THREE.Mesh(new THREE.ConeGeometry(8.2, 34, 8), castleRoofMat);
    centralSpire.position.y = 103;
    hiGroup.add(lowerKeep, upperKeep, centralSpire);

    const finialMat = new THREE.MeshStandardMaterial({ color: 0xc9a350, roughness: 0.42, metalness: 0.65 });
    enhancePBRMaterial(finialMat, { cacheKey: 'botw_castle_finial', cloudShadows: false });
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, 7.5, 6), finialMat);
    finial.position.y = 122;
    hiGroup.add(finial);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(2.6, 44, 4.8), castleStoneMat);
      buttress.position.set(Math.cos(a) * 15.5, 52, Math.sin(a) * 15.5);
      buttress.rotation.y = -a + Math.PI * 0.5;
      buttress.rotation.x = 0.14;
      const pinnacle = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9.0, 6), castleRoofMat);
      pinnacle.position.set(Math.cos(a) * 14.0, 77, Math.sin(a) * 14.0);
      hiGroup.add(buttress, pinnacle);
    }

    const viaduct = new THREE.Mesh(new THREE.BoxGeometry(6.5, 8.0, 38), castleStoneMat);
    viaduct.position.set(22, 16, 42);
    viaduct.rotation.y = 0.38;
    hiGroup.add(viaduct);

    const winMat = new THREE.MeshBasicMaterial({ color: 0xffb85c });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.2), winMat);
      win.position.set(Math.cos(a) * 12.6, 52, Math.sin(a) * 12.6);
      win.rotation.y = -a + Math.PI / 2;
      hiGroup.add(win);
    }

    const turrets = [
      { x: -18, z: 8, r: 5.0, h: 36, sh: 22 },
      { x: 18, z: 7, r: 5.2, h: 34, sh: 20 },
      { x: -11, z: -12, r: 4.5, h: 42, sh: 25 },
      { x: 12, z: -11, r: 4.6, h: 39, sh: 22 },
      { x: -27, z: 14, r: 3.8, h: 25, sh: 15 },
      { x: 27, z: 13, r: 4.0, h: 26, sh: 16 }
    ];
    turrets.forEach((t) => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.85, t.r, t.h, 8), castleStoneMat);
      body.position.set(t.x, 30 + t.h * 0.5, t.z);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(t.r * 1.06, t.sh, 8), castleRoofMat);
      roof.position.set(t.x, 30 + t.h + t.sh * 0.5, t.z);
      hiGroup.add(body, roof);
    });

    const pillars = [
      { x: -46, z: 14, rz: -0.34, h: 72 },
      { x: 46, z: 12, rz: 0.36, h: 68 },
      { x: -34, z: -24, rz: -0.22, h: 60 },
      { x: 35, z: -22, rz: 0.25, h: 58 }
    ];
    pillars.forEach((p) => {
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 5.2, p.h, 6), calamityPillarMat);
      pil.position.set(p.x, p.h * 0.45, p.z);
      pil.rotation.z = p.rz;
      hiGroup.add(pil);
    });

    // Simplified LOD1 Castle Silhouette (> 650m)
    const loGroup = new THREE.Group();
    const loBase = new THREE.Mesh(new THREE.CylinderGeometry(34, 38, 22, 8), castleStoneMat);
    loBase.position.y = 22;
    const loKeep = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 16, 56, 6), castleStoneMat);
    loKeep.position.y = 58;
    const loSpire = new THREE.Mesh(new THREE.ConeGeometry(8.5, 36, 6), castleRoofMat);
    loSpire.position.y = 104;
    loGroup.add(loBase, loKeep, loSpire);
    pillars.forEach((p) => {
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 5.0, p.h, 5), calamityPillarMat);
      pil.position.set(p.x, p.h * 0.45, p.z);
      pil.rotation.z = p.rz;
      loGroup.add(pil);
    });

    const calamityMistMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: ATMO_UNIFORMS.uTime },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec2 vUv;
        float cHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(cHash(i), cHash(i+vec2(1,0)), f.x), mix(cHash(i+vec2(0,1)), cHash(i+vec2(1,1)), f.x), f.y); }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(vec2(p.x * 0.95, p.y * 1.15));
          float ring = smoothstep(0.18, 0.45, r) * smoothstep(0.95, 0.42, r);
          float ang = atan(p.y, p.x) + r * 4.5 - uTime * 0.48;
          float n = cNoise(vUv * 6.5 + vec2(cos(ang), sin(ang)) * 1.1 + vec2(0.0, -uTime * 0.22));
          float wisp = ring * smoothstep(0.36, 0.80, n);
          float a = wisp * 0.22;
          vec3 col = mix(vec3(0.08, 0.04, 0.10), vec3(0.42, 0.06, 0.16), n);
          gl_FragColor = vec4(col, a);
        }
      `
    });
    const calamityAura = new THREE.Mesh(new THREE.PlaneGeometry(88, 60), calamityMistMat);
    calamityAura.position.set(0, 82, 12);
    lod.add(calamityAura);

    lod.addLevel(hiGroup, 0);
    lod.addLevel(loGroup, 1200);
    root.add(lod);
    if (lodManager) lodManager.addLODObject(lod);
    return calamityAura;
  }
  const calamityAura = buildHyruleCastle();

  // =========================================================================
  // 6. 3 SHEIKAH WATCHTOWERS (THREE.LOD ANCIENT TOWERS + GLOWING RUNES)
  // =========================================================================
  const towerMat = new THREE.MeshStandardMaterial({
    map: texLib.sheikah.map,
    normalMap: texLib.sheikah.normalMap,
    emissive: new THREE.Color(0x28c8e8),
    emissiveMap: texLib.sheikah.emissiveMap,
    emissiveIntensity: 0.65,
    roughness: 0.68,
    metalness: 0.22
  });
  enhancePBRMaterial(towerMat, { cacheKey: 'botw_sheikah_tower', mossStrength: 0.18 });
  const cyanGlowMat = new THREE.MeshBasicMaterial({ color: 0x62f2ff });

  function buildSheikahTower(tx, tz) {
    const ty = getTerrainHeight(tx, tz);
    const lod = new THREE.LOD();
    lod.position.set(tx, ty - 1.4, tz);

    const hi = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 6.2, 4.0, 8), masonryMat);
    plinth.position.y = 2.0;
    plinth.castShadow = plinth.receiveShadow = true;
    hi.add(plinth);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.9, 36, 8), towerMat);
    shaft.position.y = 20;
    shaft.castShadow = shaft.receiveShadow = true;
    hi.add(shaft);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.65, 34, 0.9), towerMat);
      rib.position.set(Math.cos(a) * 2.4, 19, Math.sin(a) * 2.4);
      rib.rotation.y = -a;
      hi.add(rib);
    }

    for (const ry of [12, 22, 30]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.9, 1.4, 8), towerMat);
      collar.position.y = ry;
      hi.add(collar);
    }

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 2.8, 4.4, 8), towerMat);
    crown.position.y = 38.2;
    crown.castShadow = true;
    hi.add(crown);

    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.26, 8, 24), cyanGlowMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 39.8;
    hi.add(glowRing);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      const prong = new THREE.Mesh(new THREE.ConeGeometry(0.95, 7.5, 5), towerMat);
      prong.position.set(Math.cos(a) * 4.5, 43.2, Math.sin(a) * 4.5);
      prong.rotation.z = -Math.cos(a) * 0.25;
      prong.rotation.x = Math.sin(a) * 0.25;
      hi.add(prong);
    }

    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.75, 10.5, 6), towerMat);
    spire.position.y = 45.2;
    hi.add(spire);

    // Simplified LOD1 Watchtower (> 420m)
    const lo = new THREE.Group();
    const loShaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.6, 38, 6), towerMat);
    loShaft.position.y = 19;
    const loCrown = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 2.6, 4.6, 6), towerMat);
    loCrown.position.y = 38.5;
    const loSpire = new THREE.Mesh(new THREE.ConeGeometry(2.0, 11, 5), towerMat);
    loSpire.position.y = 45.5;
    lo.add(loShaft, loCrown, loSpire);

    lod.addLevel(hi, 0);
    lod.addLevel(lo, 420);
    root.add(lod);
    if (lodManager) lodManager.addLODObject(lod);
    return glowRing;
  }
  const towerGlowRings = [
    buildSheikahTower(-520, -1980),
    buildSheikahTower(1820, -2450),
    buildSheikahTower(-1920, -780)
  ];

  // =========================================================================
  // 7. EASTERN RED-ROCK CANYON MESAS & DISTANT RUINED CITADEL
  // =========================================================================
  function buildRightMesas() {
    const mesas = [
      { x: 2340, z: -1350, rTop: 95, rBot: 165, h: 210, seed: 1.1 },
      { x: 2620, z: -880, rTop: 155, rBot: 240, h: 265, seed: 3.7 },
      { x: 2880, z: -420, rTop: 180, rBot: 265, h: 295, seed: 6.2 },
      { x: 2260, z: -1840, rTop: 80, rBot: 145, h: 195, seed: 8.4 }
    ];
    mesas.forEach((m) => {
      const g = new THREE.CylinderGeometry(m.rTop, m.rBot, m.h, 28, 12);
      const gp = g.attributes.position;
      for (let k = 0; k < gp.count; k++) {
        let px = gp.getX(k);
        let py = gp.getY(k);
        let pz = gp.getZ(k);
        const terrace = Math.sin(py * 0.08) * 9.5;
        const crag = (ridgedFbm2(px * 0.012 + m.seed, pz * 0.012, 3) - 0.35) * 34.0;
        const ang = Math.atan2(pz, px);
        px += Math.cos(ang) * (terrace + crag);
        pz += Math.sin(ang) * (terrace + crag);
        gp.setXYZ(k, px, py, pz);
      }
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mesaMat);
      const gy = getTerrainHeight(m.x, m.z);
      mesh.position.set(m.x, gy + m.h * 0.36, m.z);
      root.add(mesh);
    });

    const cY = getTerrainHeight(2260, -1840);
    const citKeep = new THREE.Mesh(new THREE.CylinderGeometry(9.0, 12.0, 42, 8), castleStoneMat);
    citKeep.position.set(2260, cY + 178, -1840);
    const citSpire = new THREE.Mesh(new THREE.ConeGeometry(10.0, 28, 8), castleRoofMat);
    citSpire.position.set(2260, cY + 212, -1840);
    root.add(citKeep, citSpire);
  }
  buildRightMesas();

  // =========================================================================
  // 9. RESTRAINED MORNING VALLEY MIST WISPS (LOW & TRANSLUCENT — NO WASHOUT!)
  // =========================================================================
  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uTime: ATMO_UNIFORMS.uTime,
      uSunDir: ATMO_UNIFORMS.uSunDir,
      uHazeWarm: ATMO_UNIFORMS.uHazeWarm,
      uMistColor: ATMO_UNIFORMS.uMistColor
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uHazeWarm;
      uniform vec3 uMistColor;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbmM(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.04 + vec2(5.2, 1.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 c = vUv * 2.0 - 1.0;
        float rad = 1.0 - dot(c, c);
        if (rad <= 0.0) discard;
        float n = fbmM(vUv * vec2(3.4, 2.0) + vec2(uTime * 0.016, 0.0));
        float alpha = pow(rad, 1.8) * smoothstep(0.32, 0.80, n) * 0.14;
        vec3 vDir = normalize(vWorldPos - cameraPosition);
        float sunAmt = pow(max(dot(vDir, uSunDir), 0.0), 2.2);
        vec3 col = mix(uMistColor, uHazeWarm, sunAmt * 0.55);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const mistGeo = new THREE.PlaneGeometry(1, 1);
  const mistBillboards = [];
  for (let i = 0; i < 24; i++) {
    const mx = -80 + hash2(i, 401) * 2100;
    const mz = -260 - hash2(i, 409) * 1850;
    const my = 9.0 + hash2(i, 419) * 14.0;
    const w = 240 + hash2(i, 421) * 260;
    const h = 30 + hash2(i, 431) * 28;
    const m = new THREE.Mesh(mistGeo, mistMat);
    m.position.set(mx, my, mz);
    m.scale.set(w, h, 1);
    root.add(m);
    mistBillboards.push({ mesh: m, baseX: mx, speed: 0.4 + hash2(i, 433) * 0.65 });
  }

  // =========================================================================
  // 9. SOARING HAWKS, SPIRAL THERMAL WIND STREAMERS & GOLDEN POLLEN
  // =========================================================================
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x252d38, side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Group();
    const lw = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.34, 2, 1), birdMat);
    lw.position.x = -0.65;
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.34, 2, 1), birdMat);
    rw.position.x = 0.65;
    b.add(lw, rw);
    b.position.set(-40 + i * 18.0, 84 + (i % 3) * 4.5, -185 - i * 26.0);
    root.add(b);
    birds.push({ group: b, lw, rw, phase: i * 1.15, basePos: b.position.clone() });
  }

  // Floating sunlit pollen motes
  const POLLEN_COUNT = 280;
  const pollenGeo = new THREE.BufferGeometry();
  const pollenPos = new Float32Array(POLLEN_COUNT * 3);
  const pollenSeed = new Float32Array(POLLEN_COUNT);
  for (let i = 0; i < POLLEN_COUNT; i++) {
    pollenPos[i * 3] = (Math.random() - 0.5) * 80;
    pollenPos[i * 3 + 1] = 28 + Math.random() * 28;
    pollenPos[i * 3 + 2] = (Math.random() - 0.5) * 80 - 10;
    pollenSeed[i] = Math.random() * 6.283;
  }
  pollenGeo.setAttribute('position', new THREE.BufferAttribute(pollenPos, 3));
  pollenGeo.setAttribute('aSeed', new THREE.BufferAttribute(pollenSeed, 1));

  const pollenMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uTime: ATMO_UNIFORMS.uTime,
      uSunColor: ATMO_UNIFORMS.uSunColor,
      uPlayerPos: ATMO_UNIFORMS.uPlayerPos
    },
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uPlayerPos;
      varying float vAlpha;
      void main() {
        vec3 off = position - uPlayerPos;
        vec3 wrapped = mod(off + 40.0, 80.0) - 40.0;
        vec3 p = uPlayerPos + wrapped;
        p.x += sin(uTime * 0.48 + aSeed) * 1.8;
        p.y += cos(uTime * 0.38 + aSeed * 1.3) * 1.2;
        p.z += sin(uTime * 0.32 + aSeed * 0.7) * 1.6;
        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(20.0 / max(-mvPos.z, 1.0), 1.5, 4.5);
        vAlpha = (0.3 + 0.45 * sin(uTime * 1.6 + aSeed)) * smoothstep(38.0, 10.0, length(p - uPlayerPos));
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSunColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(uSunColor * 0.9, (1.0 - d * d) * vAlpha * 0.75);
      }
    `
  });
  const pollenPoints = new THREE.Points(pollenGeo, pollenMat);
  pollenPoints.frustumCulled = false;
  root.add(pollenPoints);

  // Delicate upward-spiraling sparkling wind-mote streams for paraglider thermals across the world
  const thermals = [
    { x: -12, z: -72, radius: 14, strength: 18 },
    { x: 95, z: -245, radius: 15, strength: 18 },
    { x: 340, z: -680, radius: 18, strength: 19 },
    { x: -135, z: -560, radius: 16, strength: 18 },
    { x: -460, z: -560, radius: 16, strength: 18 },
    { x: 750, z: -1200, radius: 18, strength: 19 },
    { x: -920, z: -560, radius: 16, strength: 18 },
    { x: 210, z: -125, radius: 16, strength: 18 }
  ];

  const MOTE_PER_THERMAL = 44;
  const totalMotes = thermals.length * MOTE_PER_THERMAL;
  const thPos = new Float32Array(totalMotes * 3);
  const thPhase = new Float32Array(totalMotes);
  let mPtr = 0;
  thermals.forEach((th, tIdx) => {
    const baseY = getTerrainHeight(th.x, th.z);
    for (let m = 0; m < MOTE_PER_THERMAL; m++) {
      thPos[mPtr * 3] = th.x;
      thPos[mPtr * 3 + 1] = baseY;
      thPos[mPtr * 3 + 2] = th.z;
      thPhase[mPtr] = (m / MOTE_PER_THERMAL) + tIdx * 0.37;
      mPtr++;
    }
  });
  const thermalGeo = new THREE.BufferGeometry();
  thermalGeo.setAttribute('position', new THREE.BufferAttribute(thPos, 3));
  thermalGeo.setAttribute('aPhase', new THREE.BufferAttribute(thPhase, 1));

  const thermalMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uTime: ATMO_UNIFORMS.uTime },
    vertexShader: /* glsl */`
      attribute float aPhase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        float life = fract(aPhase + uTime * 0.14);
        float ang = life * 12.566 + aPhase * 6.283;
        float rad = 2.6 + life * 3.4;
        vec3 p = position + vec3(cos(ang) * rad, life * 24.0, sin(ang) * rad);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(24.0 / max(-mv.z, 1.0), 1.5, 5.5);
        vAlpha = sin(life * 3.14159) * 0.42;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(vec3(0.95, 0.94, 0.80), (1.0 - d * d) * vAlpha);
      }
    `
  });
  const thermalPoints = new THREE.Points(thermalGeo, thermalMat);
  thermalPoints.frustumCulled = false;
  root.add(thermalPoints);

  function update(time, camera) {
    birds.forEach((b) => {
      const flap = Math.sin(time * 6.2 + b.phase) * 0.45;
      b.lw.rotation.z = flap;
      b.rw.rotation.z = -flap;
      b.group.position.x = b.basePos.x + Math.sin(time * 0.14 + b.phase * 0.25) * 22;
      b.group.position.y = b.basePos.y + Math.cos(time * 0.24 + b.phase) * 2.4;
      b.group.position.z = b.basePos.z + Math.cos(time * 0.11 + b.phase * 0.2) * 14;
    });

    mistBillboards.forEach((mb) => {
      mb.mesh.position.x = mb.baseX + Math.sin(time * 0.045 * mb.speed) * 18;
      mb.mesh.lookAt(camera.position.x, mb.mesh.position.y, camera.position.z);
    });

    volcanicPlume.position.y = 1020 + Math.sin(time * 0.25) * 6.0;
    volcanicPlume.lookAt(camera.position.x, volcanicPlume.position.y, camera.position.z);
    calamityAura.lookAt(camera.position.x, calamityAura.position.y, camera.position.z);
    for (let i = 0; i < towerGlowRings.length; i++) {
      towerGlowRings[i].rotation.z = time * 0.65 + i;
    }
  }

  return { root, thermals, update };
}
