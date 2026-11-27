import * as THREE from 'three';
import { WORLD_HALF, WATER_LEVEL, getTerrainHeight, getTerrainNormal, getPathCenterX, getCityDistrict } from './noise.js';
import { ATMO_UNIFORMS, ATMO_GLSL_PARS } from './atmosphere.js';

/**
 * Chunked LOD Terrain Streaming System covering a 3,360m x 3,360m open world
 * (12 x 12 chunks of 280m x 280m, 3 LOD levels with seamless analytic normals & edge skirts).
 */
export function createTerrainSystem(texLib, assetManager) {
  const GRID_N = 16;
  const CHUNK_SIZE = (WORLD_HALF * 2.0) / GRID_N; // 775m
  const LOD_SEGS = [56, 24, 10];
  const SKIRT_DEPTH = 34.0;
  const MAX_CACHE = 160;

  const root = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.02
  });
  mat.fog = false;
  mat.customProgramCacheKey = () => 'botw_terrain_chunk_pbr_v2';

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMO_UNIFORMS);

    shader.uniforms.uGrassMap = { value: texLib.grass.map };
    shader.uniforms.uGrassNormal = { value: texLib.grass.normalMap };
    shader.uniforms.uDirtMap = { value: texLib.dirt.map };
    shader.uniforms.uDirtNormal = { value: texLib.dirt.normalMap };
    shader.uniforms.uRockMap = { value: texLib.cliffRock.map };
    shader.uniforms.uRockNormal = { value: texLib.cliffRock.normalMap };
    shader.uniforms.uShoreMap = { value: texLib.shore.map };
    shader.uniforms.uShoreNormal = { value: texLib.shore.normalMap };
    shader.uniforms.uWaterLevel = { value: WATER_LEVEL };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        varying vec3 vAtmoWPos;
        varying vec3 vAtmoWNorm;
        `
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */`
        #include <project_vertex>
        {
          vec4 awp = modelMatrix * vec4(transformed, 1.0);
          vAtmoWPos = awp.xyz;
          vAtmoWNorm = normalize(mat3(modelMatrix) * objectNormal);
        }
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        uniform sampler2D uGrassMap;
        uniform sampler2D uGrassNormal;
        uniform sampler2D uDirtMap;
        uniform sampler2D uDirtNormal;
        uniform sampler2D uRockMap;
        uniform sampler2D uRockNormal;
        uniform sampler2D uShoreMap;
        uniform sampler2D uShoreNormal;
        uniform float uWaterLevel;
        varying vec3 vAtmoWPos;
        varying vec3 vAtmoWNorm;
        ${ATMO_GLSL_PARS}

        vec3 sampleDualAlbedo(sampler2D tex, vec2 worldXZ, float scaleNear, float scaleFar) {
          vec3 a = texture2D(tex, worldXZ * scaleNear).rgb;
          vec3 b = texture2D(tex, worldXZ * scaleFar + vec2(0.37, 0.71)).rgb;
          return mix(a, b, 0.36);
        }

        vec3 sampleDualNormal(sampler2D tex, vec2 worldXZ, float scaleNear, float scaleFar) {
          vec3 a = texture2D(tex, worldXZ * scaleNear).xyz * 2.0 - 1.0;
          vec3 b = texture2D(tex, worldXZ * scaleFar + vec2(0.37, 0.71)).xyz * 2.0 - 1.0;
          return normalize(vec3(a.xy * 0.72 + b.xy * 0.45, 1.0));
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */`
        #include <color_fragment>
        float tCustomRoughness = 0.88;
        vec3 tPerturbedWorldNorm = normalize(vAtmoWNorm);
        {
          vec3 wPos = vAtmoWPos;
          vec3 wNorm = normalize(vAtmoWNorm);
          float slope = 1.0 - clamp(wNorm.y, 0.0, 1.0);

          float macroA = atmoFbm(wPos.xz * 0.012);
          float macroB = atmoFbm(wPos.xz * 0.052 + vec2(7.3, -4.1));
          float microN = atmoNoise(wPos.xz * 0.25);

          // 1) Emerald Highland & Valley Meadow Grass
          vec3 grassTex = sampleDualAlbedo(uGrassMap, wPos.xz, 0.32, 0.055);
          vec3 grassNormT = sampleDualNormal(uGrassNormal, wPos.xz, 0.32, 0.055);
          vec3 lushTint = mix(vec3(0.68, 0.82, 0.56), vec3(1.16, 1.10, 0.74), smoothstep(0.28, 0.78, macroA * 0.65 + macroB * 0.35));
          float valleyLush = smoothstep(28.0, 10.0, wPos.y);
          lushTint = mix(lushTint, vec3(0.75, 0.93, 0.60), valleyLush * 0.32);
          // Subtle dry ochre transition in far-eastern canyon foothills (x > 1850)
          float desertMask = smoothstep(1850.0, 2600.0, wPos.x) * smoothstep(-2900.0, -1800.0, wPos.z);
          lushTint = mix(lushTint, vec3(1.14, 0.92, 0.62), desertMask * 0.62);
          vec3 grassAlbedo = grassTex * lushTint;

          // 2) Winding Dirt Trail & 74m Overlook Grit
          vec3 dirtTex = sampleDualAlbedo(uDirtMap, wPos.xz, 0.50, 0.10);
          vec3 dirtNormT = sampleDualNormal(uDirtNormal, wPos.xz, 0.50, 0.10);

          float pathX = 18.0 + 28.0 * sin(wPos.z * 0.014 + 0.35) + 16.0 * cos(wPos.z * 0.007) + (wPos.z < -180.0 ? (wPos.z + 180.0) * 0.08 : 0.0);
          float pathDist = abs(wPos.x - pathX) + (macroB - 0.5) * 1.4;
          float valleyZone = smoothstep(-32.0, -68.0, wPos.z) * smoothstep(-480.0, -340.0, wPos.z);
          float pathMask = smoothstep(3.8, 1.4, pathDist) * valleyZone * smoothstep(0.32, 0.10, slope);

          float crestDist = length((wPos.xz - vec2(0.0, 1.0)) * vec2(0.85, 0.7));
          float crestDirt = smoothstep(6.2 + macroB * 2.0, 1.8, crestDist) * smoothstep(68.0, 73.5, wPos.y);
          float ruinPathDist = length((wPos.xz - vec2(-7.5, 0.5)) * vec2(0.6, 0.85));
          float ruinDirt = smoothstep(5.8, 2.2, ruinPathDist) * smoothstep(68.0, 73.0, wPos.y);

          float dirtWeight = clamp(max(pathMask * 0.88 + crestDirt * 0.72 + ruinDirt * 0.55, desertMask * 0.42), 0.0, 0.94);

          // 3) Triplanar Stratified Cliff Rock
          vec3 triW = pow(abs(wNorm), vec3(4.0));
          triW /= max(triW.x + triW.y + triW.z, 0.0001);
          float rScale = 0.075;
          float rScaleFar = 0.014;

          vec3 rColX = mix(texture2D(uRockMap, wPos.zy * rScale).rgb, texture2D(uRockMap, wPos.zy * rScaleFar).rgb, 0.38);
          vec3 rColY = mix(texture2D(uRockMap, wPos.xz * rScale).rgb, texture2D(uRockMap, wPos.xz * rScaleFar).rgb, 0.38);
          vec3 rColZ = mix(texture2D(uRockMap, wPos.xy * rScale).rgb, texture2D(uRockMap, wPos.xy * rScaleFar).rgb, 0.38);
          vec3 rockTint = mix(mix(vec3(0.84, 0.82, 0.86), vec3(1.12, 1.04, 0.94), macroA), vec3(1.18, 0.84, 0.64), desertMask * 0.68);
          vec3 rockAlbedo = (rColX * triW.x + rColY * triW.y + rColZ * triW.z) * rockTint;

          vec3 rnX = texture2D(uRockNormal, wPos.zy * rScale).xyz * 2.0 - 1.0;
          vec3 rnY = texture2D(uRockNormal, wPos.xz * rScale).xyz * 2.0 - 1.0;
          vec3 rnZ = texture2D(uRockNormal, wPos.xy * rScale).xyz * 2.0 - 1.0;
          vec3 triNormOffset = vec3(0.0, rnX.y, rnX.x) * triW.x + vec3(rnY.x, 0.0, rnY.y) * triW.y + vec3(rnZ.x, rnZ.y, 0.0) * triW.z;

          float rockMask = smoothstep(0.14, 0.31, slope + (macroB - 0.5) * 0.14);
          float cliffLipRock = smoothstep(0.09, 0.22, slope) * smoothstep(32.0, 62.0, wPos.y);
          float rimDist = length(wPos.xz + vec2(-150.0, 1500.0));
          float mtnRock = smoothstep(55.0, 145.0, wPos.y + macroA * 24.0) * smoothstep(2300.0, 3250.0, rimDist);
          rockMask = clamp(max(rockMask, max(cliffLipRock * 0.86, mtnRock * 0.94)), 0.0, 1.0);

          // 4) High-Altitude Procedural Snowline on 360-deg Alpine Peaks (r > 2400m)
          float snowMask = smoothstep(185.0, 290.0, wPos.y + macroA * 32.0) * smoothstep(0.28, 0.62, wNorm.y) * smoothstep(2400.0, 3400.0, rimDist);
          vec3 snowAlbedo = vec3(0.76, 0.81, 0.89);

          // 5) Crisp Lake Shoreline Rim
          vec3 shoreAlbedo = sampleDualAlbedo(uShoreMap, wPos.xz, 0.30, 0.08) * vec3(0.84, 0.80, 0.70);
          vec3 shoreNormT = sampleDualNormal(uShoreNormal, wPos.xz, 0.30, 0.08);
          float shoreMask = smoothstep(uWaterLevel + 0.30 + macroB * 0.12, uWaterLevel + 0.02, wPos.y);
          float wetBand = smoothstep(uWaterLevel + 0.22, uWaterLevel - 0.10, wPos.y);
          shoreAlbedo *= mix(1.0, 0.46, wetBand);

          vec3 albedo = mix(grassAlbedo, dirtTex, dirtWeight);
          albedo = mix(albedo, shoreAlbedo, shoreMask * (1.0 - rockMask * 0.65));
          albedo = mix(albedo, rockAlbedo, rockMask);
          albedo = mix(albedo, snowAlbedo, snowMask * 0.90);
          albedo *= (0.93 + 0.14 * microN);
          diffuseColor.rgb = albedo;

          float rVal = mix(0.89, 0.85, dirtWeight);
          rVal = mix(rVal, mix(0.76, 0.20, wetBand), shoreMask * (1.0 - rockMask * 0.65));
          rVal = mix(rVal, 0.78, rockMask);
          rVal = mix(rVal, 0.62, snowMask);
          tCustomRoughness = rVal;

          vec3 tangentW = normalize(vec3(1.0, 0.0, 0.0) - wNorm * wNorm.x);
          vec3 bitangentW = normalize(cross(wNorm, tangentW));
          vec3 planarNormT = normalize(mix(mix(grassNormT, dirtNormT, dirtWeight), shoreNormT, shoreMask * 0.8));
          vec3 planarPerturb = tangentW * planarNormT.x + bitangentW * planarNormT.y;

          tPerturbedWorldNorm = normalize(
            wNorm +
            planarPerturb * (1.0 - rockMask) * 0.86 +
            triNormOffset * (0.40 + rockMask * 1.10)
          );
        }
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = tCustomRoughness;`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\nnormal = normalize(mat3(viewMatrix) * tPerturbedWorldNorm);`
      )
      .replace(
        '#include <lights_fragment_begin>',
        /* glsl */`
        #include <lights_fragment_begin>
        {
          float cShad = sampleCloudShadow(vAtmoWPos.xz, uTime, uSunDir);
          reflectedLight.directDiffuse *= cShad;
          reflectedLight.directSpecular *= cShad;
        }
        `
      )
      .replace(
        '#include <fog_fragment>',
        `gl_FragColor.rgb = applyRealisticAtmosphere(gl_FragColor.rgb, vAtmoWPos, cameraPosition);`
      );
  };

  if (assetManager) {
    assetManager.registerMaterial('terrainChunkPBR', mat);
  }

  const tmpNorm = new THREE.Vector3();

  /**
   * Builds a chunk BufferGeometry with analytic normals along borders + downward 16m
   * perimeter skirts so adjacent LOD0/LOD1/LOD2 chunks never expose T-junction cracks.
   */
  function buildChunkGeometry(cxIdx, czIdx, segs) {
    const startX = -WORLD_HALF + cxIdx * CHUNK_SIZE;
    const startZ = -WORLD_HALF + czIdx * CHUNK_SIZE;
    const step = CHUNK_SIZE / segs;
    const stride = segs + 1;
    const topCount = stride * stride;
    const skirtVerts = stride * 4;
    const totalVerts = topCount + skirtVerts;

    const pos = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);
    const uv = new Float32Array(totalVerts * 2);

    for (let iz = 0; iz <= segs; iz++) {
      const wz = startZ + iz * step;
      for (let ix = 0; ix <= segs; ix++) {
        const wx = startX + ix * step;
        const wy = getTerrainHeight(wx, wz);
        getTerrainNormal(wx, wz, tmpNorm);
        const vi = iz * stride + ix;
        pos[vi * 3] = wx;
        pos[vi * 3 + 1] = wy;
        pos[vi * 3 + 2] = wz;
        norm[vi * 3] = tmpNorm.x;
        norm[vi * 3 + 1] = tmpNorm.y;
        norm[vi * 3 + 2] = tmpNorm.z;
        uv[vi * 2] = wx / CHUNK_SIZE;
        uv[vi * 2 + 1] = wz / CHUNK_SIZE;
      }
    }

    const indices = [];
    for (let iz = 0; iz < segs; iz++) {
      for (let ix = 0; ix < segs; ix++) {
        const a = iz * stride + ix;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    // Perimeter downward skirts along North (iz=0), South (iz=segs), West (ix=0), East (ix=segs)
    let skCursor = topCount;
    function addSkirt(edgeTopIndices, flipWinding) {
      const baseSk = skCursor;
      for (let k = 0; k < edgeTopIndices.length; k++) {
        const ti = edgeTopIndices[k];
        pos[skCursor * 3] = pos[ti * 3];
        pos[skCursor * 3 + 1] = pos[ti * 3 + 1] - SKIRT_DEPTH;
        pos[skCursor * 3 + 2] = pos[ti * 3 + 2];
        norm[skCursor * 3] = norm[ti * 3];
        norm[skCursor * 3 + 1] = norm[ti * 3 + 1];
        norm[skCursor * 3 + 2] = norm[ti * 3 + 2];
        uv[skCursor * 2] = uv[ti * 2];
        uv[skCursor * 2 + 1] = uv[ti * 2 + 1];
        skCursor++;
      }
      for (let k = 0; k < edgeTopIndices.length - 1; k++) {
        const t0 = edgeTopIndices[k];
        const t1 = edgeTopIndices[k + 1];
        const s0 = baseSk + k;
        const s1 = baseSk + k + 1;
        if (flipWinding) {
          indices.push(t0, t1, s0, t1, s1, s0);
        } else {
          indices.push(t0, s0, t1, t1, s0, s1);
        }
      }
    }

    const north = [];
    const south = [];
    const west = [];
    const east = [];
    for (let k = 0; k <= segs; k++) {
      north.push(k);
      south.push(segs * stride + k);
      west.push(k * stride);
      east.push(k * stride + segs);
    }
    addSkirt(north, true);
    addSkirt(south, false);
    addSkirt(west, false);
    addSkirt(east, true);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  // LRU Geometry Cache (never evicts currently active chunk geometry!)
  const geoCache = new Map();
  let useTick = 0;

  function acquireChunkGeo(chunk, lod) {
    const key = `${chunk.cxIdx}_${chunk.czIdx}_${lod}`;
    useTick++;
    let entry = geoCache.get(key);
    if (!entry) {
      if (geoCache.size >= MAX_CACHE) {
        let oldestKey = null;
        let oldestTick = Infinity;
        geoCache.forEach((v, k) => {
          if (!v.pinned && v.lastUsed < oldestTick) {
            oldestTick = v.lastUsed;
            oldestKey = k;
          }
        });
        if (oldestKey) {
          const dead = geoCache.get(oldestKey);
          dead.geo.dispose();
          geoCache.delete(oldestKey);
        }
      }
      entry = {
        geo: buildChunkGeometry(chunk.cxIdx, chunk.czIdx, LOD_SEGS[lod]),
        lastUsed: useTick,
        pinned: false
      };
      geoCache.set(key, entry);
    }
    entry.lastUsed = useTick;
    return entry;
  }

  function applyChunkLod(chunk, lod) {
    if (chunk.activeEntry) chunk.activeEntry.pinned = false;
    const entry = acquireChunkGeo(chunk, lod);
    entry.pinned = true;
    chunk.activeEntry = entry;
    chunk.lod = lod;
    chunk.mesh.geometry = entry.geo;
    chunk.mesh.castShadow = lod === 0;
  }

  const chunks = [];
  for (let czIdx = 0; czIdx < GRID_N; czIdx++) {
    for (let cxIdx = 0; cxIdx < GRID_N; cxIdx++) {
      const centerX = -WORLD_HALF + (cxIdx + 0.5) * CHUNK_SIZE;
      const centerZ = -WORLD_HALF + (czIdx + 0.5) * CHUNK_SIZE;
      const dummyGeo = new THREE.BufferGeometry();
      const mesh = new THREE.Mesh(dummyGeo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      root.add(mesh);
      dummyGeo.dispose();

      const chunk = {
        cxIdx,
        czIdx,
        centerX,
        centerZ,
        lod: -1,
        activeEntry: null,
        mesh
      };
      const dSpawn = Math.hypot(centerX, centerZ);
      const dCity = Math.hypot(centerX + 560, centerZ + 680);
      const initLod = (dSpawn < 1100 || dCity < 1000) ? 0 : (dSpawn < 2450 ? 1 : 2);
      applyChunkLod(chunk, initLod);
      chunks.push(chunk);
    }
  }

  // Dedicated high-resolution Overlook Promontory Cap (240m x 240m @ 3.75m segs) for razor-sharp foreground cliffs!
  {
    const capGeo = new THREE.PlaneGeometry(240, 240, 64, 64);
    capGeo.rotateX(-Math.PI / 2);
    const cp = capGeo.attributes.position;
    const cn = capGeo.attributes.normal;
    for (let i = 0; i < cp.count; i++) {
      const lx = cp.getX(i);
      const lz = cp.getZ(i) - 45.0;
      const edgeFade = Math.max(Math.abs(lx), Math.abs(cp.getZ(i))) / 120.0;
      const drop = edgeFade > 0.92 ? ((edgeFade - 0.92) / 0.08) * 3.5 : 0.0;
      const gy = getTerrainHeight(lx, lz) - drop + 0.04;
      getTerrainNormal(lx, lz, tmpNorm);
      cp.setXYZ(i, lx, gy, lz);
      cn.setXYZ(i, tmpNorm.x, tmpNorm.y, tmpNorm.z);
    }
    const capMat = mat.clone();
    capMat.onBeforeCompile = mat.onBeforeCompile;
    capMat.customProgramCacheKey = () => 'botw_terrain_hero_cap';
    capMat.polygonOffset = true;
    capMat.polygonOffsetFactor = -1;
    capMat.polygonOffsetUnits = -1;
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.receiveShadow = true;
    capMesh.castShadow = true;
    root.add(capMesh);
  }

  const lastCam = new THREE.Vector3(1e9, 1e9, 1e9);

  function update(camera, force = false) {
    if (!force && camera.position.distanceToSquared(lastCam) < 400.0) {
      let anyPending = false;
      for (let i = 0; i < chunks.length; i++) {
        if (chunks[i].pending) {
          anyPending = true;
          break;
        }
      }
      if (!anyPending) return;
    } else {
      lastCam.copy(camera.position);
    }

    const camX = camera.position.x;
    const camZ = camera.position.z;
    const queue = [];

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const d = Math.hypot(c.centerX - camX, c.centerZ - camZ);
      const desiredLod = d < 960.0 ? 0 : d < 2450.0 ? 1 : 2;
      if (desiredLod !== c.lod) {
        c.pending = true;
        queue.push({ chunk: c, desiredLod, dist: d });
      } else {
        c.pending = false;
      }
    }

    if (queue.length > 0) {
      queue.sort((a, b) => a.dist - b.dist);
      const budget = force ? queue.length : 4;
      for (let i = 0; i < Math.min(budget, queue.length); i++) {
        const item = queue[i];
        applyChunkLod(item.chunk, item.desiredLod);
        item.chunk.pending = false;
      }
    }
  }

  function getStats() {
    let lod0 = 0, lod1 = 0, lod2 = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].lod === 0) lod0++;
      else if (chunks[i].lod === 1) lod1++;
      else lod2++;
    }
    return {
      totalChunks: chunks.length,
      lod0,
      lod1,
      lod2,
      worldMeters: WORLD_HALF * 2
    };
  }

  return { root, update, getStats };
}
