import * as THREE from 'three';
import { getTerrainHeight, getTerrainNormal, WATER_LEVEL, hash2 } from './noise.js';
import { ATMO_UNIFORMS, ATMO_GLSL_PARS, enhancePBRMaterial } from './atmosphere.js';
import { createLODInstancedBatch } from './assets.js';

export function createWaterSystem(texLib, assetManager, lodManager) {
  const group = new THREE.Group();

  const waterW = 3100;
  const waterD = 3000;
  const centerX = 960;
  const centerZ = -1460;

  const waterGeo = new THREE.PlaneGeometry(waterW, waterD, 200, 200);
  waterGeo.rotateX(-Math.PI / 2);

  const pos = waterGeo.attributes.position;
  const depths = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + centerX;
    const wz = pos.getZ(i) + centerZ;
    const terrainY = getTerrainHeight(wx, wz);
    depths[i] = WATER_LEVEL - terrainY;
  }
  waterGeo.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));

  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: ATMO_UNIFORMS.uTime,
      uSunDir: ATMO_UNIFORMS.uSunDir,
      uBSunDir: ATMO_UNIFORMS.uBSunDir,
      uSunColor: ATMO_UNIFORMS.uSunColor,
      uHazeCool: ATMO_UNIFORMS.uHazeCool,
      uHazeWarm: ATMO_UNIFORMS.uHazeWarm,
      uMistColor: ATMO_UNIFORMS.uMistColor,
      uFogDensity: ATMO_UNIFORMS.uFogDensity,
      uCloudCoverage: ATMO_UNIFORMS.uCloudCoverage,
      uCloudShadowStrength: ATMO_UNIFORMS.uCloudShadowStrength,
      uNightFactor: ATMO_UNIFORMS.uNightFactor,
      uBAerialColor: ATMO_UNIFORMS.uBAerialColor,
      uBAerialSunColor: ATMO_UNIFORMS.uBAerialSunColor,
      uBAerialSunColor2: ATMO_UNIFORMS.uBAerialSunColor2,
      uBAerialDensity: ATMO_UNIFORMS.uBAerialDensity,
      uBAerialFalloff: ATMO_UNIFORMS.uBAerialFalloff,
      uBAerialHigh: ATMO_UNIFORMS.uBAerialHigh,
      uBAerialLobe: ATMO_UNIFORMS.uBAerialLobe,
      uBAerialFar: ATMO_UNIFORMS.uBAerialFar,
      uBAerialFlat: ATMO_UNIFORMS.uBAerialFlat,
      uBAerialCore: ATMO_UNIFORMS.uBAerialCore,
      uNormalA: { value: texLib.waterNormalA },
      uNormalB: { value: texLib.waterNormalB }
    },
    vertexShader: /* glsl */`
      attribute float aDepth;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vDepth;
      void main() {
        vDepth = aDepth;
        vec3 p = position;
        // Subtle wind wave amplitude damped near shallow shoreline
        float waveMask = smoothstep(0.0, 1.4, aDepth);
        p.y += (sin(p.x * 0.19 + uTime * 1.65) * 0.055 + cos(p.z * 0.23 - uTime * 1.25) * 0.045) * waveMask;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uNormalA;
      uniform sampler2D uNormalB;
      varying vec3 vWorldPos;
      varying float vDepth;
      ${ATMO_GLSL_PARS}

      void main() {
        if (vDepth <= 0.005) discard;

        vec3 vDir = normalize(cameraPosition - vWorldPos);
        float camDist = length(cameraPosition - vWorldPos);
        mat2 rotA = mat2(0.80, 0.60, -0.60, 0.80);
        mat2 rotB = mat2(0.50, -0.866, 0.866, 0.50);
        vec2 uvA = (rotA * vWorldPos.xz) * 0.017 + vec2(uTime * 0.016, uTime * 0.010);
        vec2 uvB = (rotB * vWorldPos.xz) * 0.039 + vec2(-uTime * 0.014, uTime * 0.019);
        vec2 uvC = vWorldPos.xz * 0.097 + vec2(uTime * 0.023, -uTime * 0.018);

        vec3 nA = texture2D(uNormalA, uvA).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(uNormalB, uvB).xyz * 2.0 - 1.0;
        vec3 nC = texture2D(uNormalA, uvC).xyz * 2.0 - 1.0;

        float distRippleAtten = mix(1.0, 0.22, smoothstep(80.0, 900.0, camDist));
        float rippleScale = mix(0.20, 0.34, smoothstep(0.0, 2.2, vDepth)) * distRippleAtten;
        vec3 n = normalize(vec3(
          (nA.x + nB.x * 0.82 + nC.x * 0.20 * distRippleAtten) * rippleScale,
          1.0,
          (nA.y + nB.y * 0.82 + nC.y * 0.20 * distRippleAtten) * rippleScale
        ));

        // Beer-Lambert optical water depth absorption (deep sapphire/cerulean inland lake)
        float shallow = exp(-vDepth * 0.60);
        vec3 shallowTint = vec3(0.035, 0.18, 0.20);
        vec3 midTint = vec3(0.014, 0.095, 0.165);
        vec3 deepTint = vec3(0.008, 0.040, 0.105);
        vec3 waterBody = mix(deepTint, midTint, exp(-vDepth * 0.24));
        waterBody = mix(waterBody, shallowTint, shallow);
        waterBody *= mix(1.0, 0.52, uNightFactor);

        // Sky reflection synchronized with calibrated day/night sky & Babylon haze
        vec3 reflDir = reflect(-vDir, n);
        vec3 skyHaze = mix(bblHazeColor(reflDir), vec3(0.06, 0.16, 0.32), 0.32 * (1.0 - uNightFactor));
        vec3 skyZen = mix(vec3(0.08, 0.21, 0.42), vec3(0.014, 0.032, 0.088), uNightFactor);
        vec3 skyRefl = mix(skyHaze, skyZen, smoothstep(0.0, 0.30, max(reflDir.y, 0.04)));
        float cosTheta = clamp(dot(n, vDir), 0.0, 1.0);
        float fresnel = 0.025 + 0.975 * pow(1.0 - cosTheta, 5.0);

        float cloudShad = sampleCloudShadow(vWorldPos.xz, uTime, uSunDir);
        vec3 col = mix(waterBody * (0.45 + 0.55 * cloudShad), skyRefl, clamp(fresnel * 0.72, 0.10, 0.56));

        // Sun glitter crossfading to lunar shimmer across twilight
        vec3 halfV = normalize(uSunDir + vDir);
        float specTight = pow(max(dot(n, halfV), 0.0), 320.0);
        float specBroad = pow(max(dot(n, halfV), 0.0), 38.0);
        float dayGlint = 1.0 - smoothstep(0.10, 0.55, uNightFactor);
        col += uSunColor * (specTight * 1.85 + specBroad * 0.14) * cloudShad * dayGlint;

        vec3 moonDir = normalize(vec3(0.538, 0.707, 0.459));
        vec3 moonHalf = normalize(moonDir + vDir);
        float moonSpec = pow(max(dot(n, moonHalf), 0.0), 180.0) * 0.42 + pow(max(dot(n, moonHalf), 0.0), 26.0) * 0.06;
        col += vec3(0.58, 0.74, 0.96) * moonSpec * smoothstep(0.35, 0.90, uNightFactor);

        // Organic pulsing shoreline foam
        float foamNoise = atmoFbm(vWorldPos.xz * 0.42 + vec2(uTime * 0.18, -uTime * 0.12));
        float waveEdge = 0.28 + 0.12 * sin(uTime * 1.9 + vWorldPos.x * 0.35 + vWorldPos.z * 0.3);
        float foamBand = smoothstep(waveEdge, 0.03, vDepth) * smoothstep(0.42, 0.74, foamNoise + (0.20 - vDepth) * 0.75);
        vec3 foamCol = mix(vec3(0.42, 0.48, 0.52), uSunColor * 0.65, 0.32 * dayGlint) * mix(1.0, 0.35, uNightFactor);
        col = mix(col, foamCol, clamp(foamBand * 0.72, 0.0, 0.75));

        col = bblAerial(col, vWorldPos);

        float alpha = smoothstep(0.005, 0.35, vDepth) * mix(0.76, 0.96, clamp(1.0 - shallow + fresnel, 0.0, 1.0));
        alpha = max(alpha, foamBand * 0.78);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.97));
      }
    `
  });

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(centerX, WATER_LEVEL, centerZ);
  group.add(waterMesh);

  // Shoreline cattails / marsh reeds via LODInstancedBatch
  const reedGeo = createReedClusterGeo();
  const reedMat = new THREE.MeshStandardMaterial({
    color: 0x627332,
    roughness: 0.78,
    side: THREE.DoubleSide
  });
  enhancePBRMaterial(reedMat, {
    cacheKey: 'botw_reed_pbr',
    isFoliage: true,
    windStrength: 0.09,
    subsurfaceStrength: 0.3
  });

  const dummy = new THREE.Object3D();
  const norm = new THREE.Vector3();
  const reedInsts = [];

  for (let i = 0; i < 3200 && reedInsts.length < 340; i++) {
    const rx = -125.0 + hash2(i, 701) * 2150.0;
    const rz = -2550.0 + hash2(i, 709) * 2380.0;
    const ry = getTerrainHeight(rx, rz);
    if (ry < WATER_LEVEL - 0.55 || ry > WATER_LEVEL + 0.55) continue;
    getTerrainNormal(rx, rz, norm);
    if (norm.y < 0.85) continue;

    const s = 0.75 + hash2(i, 719) * 0.7;
    dummy.position.set(rx, ry - 0.05, rz);
    dummy.rotation.set(0, hash2(i, 727) * Math.PI * 2, 0);
    dummy.scale.set(s, s * (0.85 + hash2(i, 733) * 0.45), s);
    dummy.updateMatrix();
    reedInsts.push({ x: rx, y: ry, z: rz, matrix: dummy.matrix.clone() });
  }

  if (assetManager && lodManager && reedInsts.length > 0) {
    assetManager.registerPrefab('shore_reeds', {
      lods: [{ geo: reedGeo, mat: reedMat, dist: 145, castShadow: false, maxVisible: 260 }]
    });
    const reedBatch = createLODInstancedBatch(assetManager, 'shore_reeds', reedInsts, { cellSize: 110, maxDist: 145 });
    group.add(reedBatch.group);
    lodManager.addBatch(reedBatch);
  }

  // Shimmering Distant Waterfall Cascade plunging down eastern bay cliffs
  const wfGeo = new THREE.PlaneGeometry(36.0, 56.0, 10, 22);
  const wfPos = wfGeo.attributes.position;
  for (let i = 0; i < wfPos.count; i++) {
    const x = wfPos.getX(i);
    const y = wfPos.getY(i);
    const t = 1.0 - (y + 13.0) / 26.0;
    const zCurve = Math.sin(t * Math.PI * 0.52) * 6.5;
    const spread = 1.0 + t * 0.32;
    wfPos.setXYZ(i, x * spread, y, zCurve);
  }
  wfGeo.computeVertexNormals();

  const wfMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uTime: ATMO_UNIFORMS.uTime,
      uSunDir: ATMO_UNIFORMS.uSunDir,
      uBSunDir: ATMO_UNIFORMS.uBSunDir,
      uSunColor: ATMO_UNIFORMS.uSunColor,
      uHazeCool: ATMO_UNIFORMS.uHazeCool,
      uHazeWarm: ATMO_UNIFORMS.uHazeWarm,
      uMistColor: ATMO_UNIFORMS.uMistColor,
      uFogDensity: ATMO_UNIFORMS.uFogDensity,
      uCloudCoverage: ATMO_UNIFORMS.uCloudCoverage,
      uCloudShadowStrength: ATMO_UNIFORMS.uCloudShadowStrength,
      uNightFactor: ATMO_UNIFORMS.uNightFactor,
      uBAerialColor: ATMO_UNIFORMS.uBAerialColor,
      uBAerialSunColor: ATMO_UNIFORMS.uBAerialSunColor,
      uBAerialSunColor2: ATMO_UNIFORMS.uBAerialSunColor2,
      uBAerialDensity: ATMO_UNIFORMS.uBAerialDensity,
      uBAerialFalloff: ATMO_UNIFORMS.uBAerialFalloff,
      uBAerialHigh: ATMO_UNIFORMS.uBAerialHigh,
      uBAerialLobe: ATMO_UNIFORMS.uBAerialLobe,
      uBAerialFar: ATMO_UNIFORMS.uBAerialFar,
      uBAerialFlat: ATMO_UNIFORMS.uBAerialFlat,
      uBAerialCore: ATMO_UNIFORMS.uBAerialCore
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
      varying vec2 vUv;
      varying vec3 vWorldPos;
      ${ATMO_GLSL_PARS}
      void main() {
        vec2 fUv = vec2(vUv.x * 5.5, vUv.y * 3.0 + uTime * 1.45);
        float n1 = atmoFbm(fUv);
        float n2 = atmoFbm(fUv * 2.3 + vec2(0.0, uTime * 1.1));
        float streaks = smoothstep(0.32, 0.72, n1 * 0.6 + n2 * 0.4);
        float edgeMask = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float bottomSplash = smoothstep(0.28, 0.0, vUv.y);
        float alpha = clamp((streaks * 0.75 + bottomSplash * 0.45 + 0.18) * edgeMask, 0.0, 0.88);
        vec3 baseWater = mix(vec3(0.18, 0.34, 0.38), vec3(0.75, 0.85, 0.90), streaks * 0.8 + bottomSplash * 0.5);
        vec3 lit = baseWater * mix(vec3(0.45, 0.55, 0.70), uSunColor * 1.05, 0.65 * (1.0 - uNightFactor * 0.75));
        lit = applyRealisticAtmosphere(lit, vWorldPos, cameraPosition);
        gl_FragColor = vec4(lit, alpha);
      }
    `
  });

  const wfMesh = new THREE.Mesh(wfGeo, wfMat);
  wfMesh.position.set(1985, WATER_LEVEL + 24.0, -1155);
  wfMesh.rotation.y = -0.78; // facing southwest toward the overlook camera
  group.add(wfMesh);

  // Waterfall plunge mist cloud at splash pool base
  const splashMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uTime: ATMO_UNIFORMS.uTime,
      uSunDir: ATMO_UNIFORMS.uSunDir,
      uBSunDir: ATMO_UNIFORMS.uBSunDir,
      uSunColor: ATMO_UNIFORMS.uSunColor,
      uHazeCool: ATMO_UNIFORMS.uHazeCool,
      uHazeWarm: ATMO_UNIFORMS.uHazeWarm,
      uMistColor: ATMO_UNIFORMS.uMistColor,
      uFogDensity: ATMO_UNIFORMS.uFogDensity,
      uCloudCoverage: ATMO_UNIFORMS.uCloudCoverage,
      uCloudShadowStrength: ATMO_UNIFORMS.uCloudShadowStrength,
      uNightFactor: ATMO_UNIFORMS.uNightFactor,
      uBAerialColor: ATMO_UNIFORMS.uBAerialColor,
      uBAerialSunColor: ATMO_UNIFORMS.uBAerialSunColor,
      uBAerialSunColor2: ATMO_UNIFORMS.uBAerialSunColor2,
      uBAerialDensity: ATMO_UNIFORMS.uBAerialDensity,
      uBAerialFalloff: ATMO_UNIFORMS.uBAerialFalloff,
      uBAerialHigh: ATMO_UNIFORMS.uBAerialHigh,
      uBAerialLobe: ATMO_UNIFORMS.uBAerialLobe,
      uBAerialFar: ATMO_UNIFORMS.uBAerialFar,
      uBAerialFlat: ATMO_UNIFORMS.uBAerialFlat,
      uBAerialCore: ATMO_UNIFORMS.uBAerialCore
    },
    vertexShader: `varying vec2 vUv; varying vec3 vWorldPos; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWorldPos;
      ${ATMO_GLSL_PARS}
      void main() {
        vec2 c = vUv * 2.0 - 1.0;
        float r = 1.0 - dot(c, c);
        if (r <= 0.0) discard;
        float n = atmoFbm(vUv * 4.5 + vec2(0.0, -uTime * 0.45));
        float a = pow(r, 1.7) * smoothstep(0.28, 0.75, n) * 0.55;
        vec3 col = mix(uMistColor, uSunColor * 0.9, 0.4 * (1.0 - uNightFactor));
        col = applyRealisticAtmosphere(col, vWorldPos, cameraPosition);
        gl_FragColor = vec4(col, a);
      }
    `
  });
  const splashMesh = new THREE.Mesh(new THREE.PlaneGeometry(58, 28), splashMat);
  splashMesh.position.set(1972, WATER_LEVEL + 4.5, -1145);
  splashMesh.rotation.y = -0.78;
  group.add(splashMesh);

  return group;
}

function createReedClusterGeo() {
  const positions = [];
  const normals = [];
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + (b % 2) * 0.3;
    const lean = 0.18 + (b % 3) * 0.08;
    const h = 1.25 + (b % 3) * 0.35;
    const w = 0.045;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * w;
    const pz = dx * w;

    const x0 = dx * 0.12;
    const z0 = dz * 0.12;
    const xt = x0 + dx * lean;
    const zt = z0 + dz * lean;

    // Tapered quad strip (2 triangles)
    positions.push(
      x0 - px, 0, z0 - pz,
      x0 + px, 0, z0 + pz,
      xt, h, zt
    );
    for (let k = 0; k < 3; k++) normals.push(dx * 0.3, 0.9, dz * 0.3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}
