/**
 * Weather VFX:
 * 1) Soft Gaussian motion-blurred GPU-instanced Icelandic rain & heavy driving storm lashes (8,600 drops)
 * 2) World-anchored distant drifting valley rain-mist veils (grounded to real terrain height)
 * 3) Wave-after-wave volumetric storm cloud/water-stream fronts (14 independent multi-billboard waves = 112 puffs)
 *    blowing across random world-space ground locations and hugging hills & valleys!
 * 4) Crisp short-range rain-splash & wind-driven water droplet particles shedding right off the player's suit & pack!
 */
import * as THREE from 'three';
import { ATMO_UNIFORMS, ATMO_GLSL_PARS } from './atmosphere.js';
import { getTerrainHeight } from './world.js';

export function createWeatherFX(scene) {
  // 1. Ultra-Thin, Dense, Soft-Blurred Slanted Rain & Heavy Storm Curtains (GPU-instanced, 1 draw call!)
  const RAIN_COUNT = 10000;
  const BOX_W = 46;
  const BOX_H = 26;

  // Very fine hairline rain streak with smooth Gaussian cross-blur
  const dropGeo = new THREE.PlaneGeometry(0.014, 1.32);
  const offsets = new Float32Array(RAIN_COUNT * 3);
  const seeds = new Float32Array(RAIN_COUNT * 3);

  for (let i = 0; i < RAIN_COUNT; i++) {
    offsets[i * 3] = (Math.random() - 0.5) * BOX_W;
    offsets[i * 3 + 1] = Math.random() * BOX_H;
    offsets[i * 3 + 2] = (Math.random() - 0.5) * BOX_W;
    seeds[i * 3] = Math.random() * 100.0;
    seeds[i * 3 + 1] = 0.65 + Math.random() * 0.85;
    seeds[i * 3 + 2] = i / RAIN_COUNT;
  }

  dropGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  dropGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));

  const rainMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: ATMO_UNIFORMS.uTime,
      uCamPos: { value: new THREE.Vector3() },
      uRainIntensity: { value: 0.0 },
      uWindDir: ATMO_UNIFORMS.uWindDir,
      uWindStrength: ATMO_UNIFORMS.uWindStrength,
      uWindTime: ATMO_UNIFORMS.uWindTime,
      uSunColor: ATMO_UNIFORMS.uSunColor,
      uNightFactor: ATMO_UNIFORMS.uNightFactor,
      uShelterCenter: { value: new THREE.Vector4(0, 0, 0, 0) },
      uShelterBounds: { value: new THREE.Vector4(1, 0, 1, 1) }
    },
    vertexShader: /* glsl */`
      attribute vec3 aOffset;
      attribute vec3 aSeed;
      uniform float uTime;
      uniform vec3 uCamPos;
      uniform float uRainIntensity;
      uniform vec2 uWindDir;
      uniform float uWindStrength;
      uniform float uWindTime;
      uniform vec4 uShelterCenter;
      uniform vec4 uShelterBounds;
      varying vec2 vUv;
      varying float vFade;
      varying float vDepthBlur;

      void main() {
        vUv = uv;
        float stormFactor = smoothstep(0.75, 1.0, uRainIntensity);
        float activeFrac = mix(0.20, 1.0, smoothstep(0.05, 0.96, uRainIntensity));
        if (aSeed.z > activeFrac) {
          vFade = 0.0;
          vDepthBlur = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        float t = uTime + aSeed.x;
        float wt = uWindTime + aSeed.x;

        vec3 rel = aOffset;
        rel.y = mod(aOffset.y - (t * 20.0 + wt * 8.5) * aSeed.y, ${BOX_H.toFixed(1)}) - 5.5;
        rel.x = mod(aOffset.x + wt * uWindDir.x * 8.5 - uCamPos.x + ${(BOX_W * 0.5).toFixed(1)}, ${BOX_W.toFixed(1)}) - ${(BOX_W * 0.5).toFixed(1)};
        rel.z = mod(aOffset.z + wt * uWindDir.y * 8.5 - uCamPos.z + ${(BOX_W * 0.5).toFixed(1)}, ${BOX_W.toFixed(1)}) - ${(BOX_W * 0.5).toFixed(1)};

        vec3 worldCenter = vec3(uCamPos.x + rel.x, uCamPos.y + rel.y, uCamPos.z + rel.z);

        if (uShelterCenter.w > 0.5 && worldCenter.y < uShelterCenter.y) {
          float sdx = worldCenter.x - uShelterCenter.x;
          float sdz = worldCenter.z - uShelterCenter.z;
          float slx = sdx * uShelterBounds.x - sdz * uShelterBounds.y;
          float slz = sdx * uShelterBounds.y + sdz * uShelterBounds.x;
          if (abs(slx) < uShelterBounds.z && abs(slz) < uShelterBounds.w) {
            vFade = 0.0;
            vDepthBlur = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
        }

        vec3 toCamVec = vec3(uCamPos.x - worldCenter.x, 0.0, uCamPos.z - worldCenter.z);
        vec3 toCam = toCamVec / max(length(toCamVec), 0.001);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        vec3 slantUp = normalize(vec3(-uWindDir.x * uWindStrength * 0.30, 1.0, -uWindDir.y * uWindStrength * 0.30));

        float camDist = length(worldCenter - uCamPos);
        // Keep close drops very thin & fine; gently soften distant drops so they never alias into harsh lines
        float distSoft = 1.0 + smoothstep(10.0, 24.0, camDist) * 0.55;
        float widthScale = mix(0.75, 1.05, stormFactor) * distSoft;
        float lenScale = aSeed.y * mix(0.80, 1.32, stormFactor);
        vec3 wp = worldCenter + right * (position.x * widthScale) + slantUp * (position.y * lenScale);

        float dist = length(rel.xz);
        float nearFade = smoothstep(2.2, 6.0, camDist);
        float farFade = 1.0 - smoothstep(12.0, 23.0, dist);
        vDepthBlur = clamp(smoothstep(10.0, 22.0, camDist), 0.0, 1.0);
        vFade = farFade * nearFade * smoothstep(0.02, 0.40, uRainIntensity) * mix(1.0, 1.55, stormFactor);

        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSunColor;
      uniform float uNightFactor;
      varying vec2 vUv;
      varying float vFade;
      varying float vDepthBlur;

      void main() {
        if (vFade <= 0.002) discard;
        vec2 uvC = clamp(vUv, 0.0, 1.0);
        // Very thin, softly blurred Gaussian hairline profile (delicate & dense, never thick bars!)
        float dx = (uvC.x - 0.5) * 2.0;
        float blurTight = mix(2.35, 1.85, vDepthBlur);
        float xBlur = exp(-dx * dx * blurTight * blurTight) * (1.0 - smoothstep(0.15, 1.0, abs(dx)));
        float yBlur = pow(max(sin(uvC.y * 3.14159265), 0.0), 1.85);
        float headGlow = mix(0.76, 1.18, 1.0 - smoothstep(0.14, 0.65, uvC.y));
        float alpha = yBlur * xBlur * headGlow * min(vFade * 0.115, 0.175);
        if (alpha < 0.004) discard;
        vec3 col = mix(vec3(0.74, 0.80, 0.85) * uSunColor, vec3(0.30, 0.42, 0.56), uNightFactor * 0.80);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const group = new THREE.Group();
  scene.add(group);
  const rainMesh = new THREE.InstancedMesh(dropGeo, rainMat, RAIN_COUNT);
  rainMesh.frustumCulled = false;
  rainMesh.renderOrder = 15;
  group.add(rainMesh);

  // 2. Wave-After-Wave Flowing Volumetric Storm Cloud / Water-Stream Billboards!
  // 16 independent rolling gust waves x 10 overlapping ultra-soft cloud billboards per wave (160 puffs, 1 draw call!)
  // Bottom-anchored cleanly above 5-point local terrain footprint -> lush billowing clouds with ZERO low-poly shapes & ZERO hard cuts!
  const WAVE_COUNT = 20;
  const PUFFS_PER_WAVE = 8;
  const TOTAL_WAVE_PUFFS = WAVE_COUNT * PUFFS_PER_WAVE;

  const waveGeo = new THREE.PlaneGeometry(1, 1);
  // aWave: x = seed, y = puffFade, z = width, w = height
  const waveAttr = new Float32Array(TOTAL_WAVE_PUFFS * 4);
  const waveAttrBuf = new THREE.InstancedBufferAttribute(waveAttr, 4);
  waveGeo.setAttribute('aWave', waveAttrBuf);

  const stormWaves = [];
  for (let w = 0; w < WAVE_COUNT; w++) {
    const puffs = [];
    for (let p = 0; p < PUFFS_PER_WAVE; p++) {
      const latFrac = (p / (PUFFS_PER_WAVE - 1)) - 0.5; // -0.5..+0.5 across the rolling wave front
      puffs.push({
        latOff: latFrac * (26.0 + Math.random() * 14.0) + (Math.random() - 0.5) * 4.5,
        alongOff: -Math.abs(latFrac) * 6.0 + (Math.random() - 0.5) * 9.0,
        yLift: 0.0,
        w: 13.0 + Math.random() * 12.0,
        h: 3.0 + Math.random() * 2.8,
        seed: Math.random() * 90.0,
        phaseOff: (Math.random() - 0.5) * 0.14
      });
    }
    stormWaves.push({
      x: 0,
      z: 0,
      speed: 10.5 + Math.random() * 6.5, // fast racing storm-cloud wave front
      age: w / WAVE_COUNT,               // evenly staggered -> wave after wave continuously rolls over ground!
      life: 5.5 + Math.random() * 4.0,
      init: false,
      puffs
    });
  }

  const waveMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      ...ATMO_UNIFORMS,
      uRainIntensity: { value: 0.0 },
      uShelterCenter: { value: new THREE.Vector4(0, 0, 0, 0) },
      uShelterBounds: { value: new THREE.Vector4(1, 0, 1, 1) }
    },
    vertexShader: /* glsl */`
      attribute vec4 aWave;
      uniform float uRainIntensity;
      varying vec2 vUv;
      varying float vFade;
      varying float vSeed;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vSeed = aWave.x;
        vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        // Bottom-anchored upright-biased cloud billboard (0..h cleanly above ground -> soft fluffy mist, zero sharp cuts!)
        vec3 upAxis = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, 0.24));
        vec3 wp = center + camRight * (position.x * aWave.z) + upAxis * ((position.y + 0.42) * aWave.w);
        vWorldPos = wp;

        float d = length(center - cameraPosition);
        float nearF = smoothstep(3.0, 10.0, d);
        float farF = 1.0 - smoothstep(55.0, 95.0, d);
        float stormGate = smoothstep(0.55, 0.96, uRainIntensity);
        vFade = nearF * farF * aWave.y * stormGate;

        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec4 uShelterCenter;
      uniform vec4 uShelterBounds;
      varying vec2 vUv;
      varying float vFade;
      varying float vSeed;
      varying vec3 vWorldPos;
      ${ATMO_GLSL_PARS}

      void main() {
        if (vFade <= 0.002) discard;
        if (uShelterCenter.w > 0.5 && vWorldPos.y < uShelterCenter.y) {
          float sdx = vWorldPos.x - uShelterCenter.x;
          float sdz = vWorldPos.z - uShelterCenter.z;
          float slx = sdx * uShelterBounds.x - sdz * uShelterBounds.y;
          float slz = sdx * uShelterBounds.y + sdz * uShelterBounds.x;
          if (abs(slx) < uShelterBounds.z && abs(slz) < uShelterBounds.w) discard;
        }

        // Ultra-soft Gaussian elliptical cloud silhouette + deep bottom feathering (zero quad or ground edges!)
        vec2 c = (vUv - 0.5) * 2.0;
        float r2 = dot(c, c);
        if (r2 >= 0.95) discard;
        float radial = exp(-r2 * 2.95) * (1.0 - smoothstep(0.28, 0.95, r2));
        float baseSoft = smoothstep(0.0, 0.14, vUv.y);

        // Domain-warped flowing volumetric cloud billows + rapid wind-sheared mist wisps
        vec2 streamFlow = vec2(-uWindTime * 1.15, -uTime * 0.08);
        vec2 q = vUv * vec2(1.65, 2.45) + vec2(vSeed, vSeed * 0.41);
        vec2 warp = vec2(
          atmoGNoise(q * 1.4 + streamFlow * 0.65) - 0.5,
          atmoGNoise(q * 1.4 + vec2(4.3, -2.7) + streamFlow * 0.65) - 0.5
        ) * 0.55;
        float cloudMacro = atmoFbm(q + warp + streamFlow * 0.90);
        float streamFine = atmoFbm(vUv * vec2(2.3, 5.8) + warp * 0.6 + streamFlow * 1.55 + vec2(vSeed * 0.3, 1.9));
        float density = smoothstep(0.18, 0.74, cloudMacro * 0.60 + streamFine * 0.40);

        float alpha = radial * baseSoft * density * vFade * 0.42;
        if (alpha < 0.01) discard;

        // Soft 3D cloud self-shading harmonized with storm sky luminance
        float topLit = smoothstep(0.14, 0.88, vUv.y + (cloudMacro - 0.5) * 0.34);
        vec3 darkBelly = mix(uFogColor * 0.78, vec3(0.035, 0.055, 0.080), uNightFactor * 0.88);
        vec3 brightCrest = mix(uFogLowColor * mix(1.14, 1.02, uCloudDarkness), vec3(0.085, 0.125, 0.175), uNightFactor * 0.85);
        vec3 col = mix(darkBelly, brightCrest, topLit);
        col = applyIcelandAtmo(col, vWorldPos);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const waveMesh = new THREE.InstancedMesh(waveGeo, waveMat, TOTAL_WAVE_PUFFS);
  waveMesh.frustumCulled = false;
  waveMesh.renderOrder = 14;
  group.add(waveMesh);

  // 4. Ultra-Thin Short-Range Wind-Blown Water-Stream Filaments Peeling Off the Player's Suit & Pack!
  const DROPLET_COUNT = 88;
  const dropletGeo = new THREE.PlaneGeometry(1, 1);
  const dropletSeeds = new Float32Array(DROPLET_COUNT * 4);
  for (let i = 0; i < DROPLET_COUNT; i++) {
    dropletSeeds[i * 4] = i / DROPLET_COUNT;
    dropletSeeds[i * 4 + 1] = 0.78 + Math.random() * 0.72;
    dropletSeeds[i * 4 + 2] = (Math.random() - 0.5) * 0.48;
    dropletSeeds[i * 4 + 3] = 0.92 + Math.random() * 0.84;
  }
  dropletGeo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(dropletSeeds, 4));

  const playerDropletMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      ...ATMO_UNIFORMS,
      uRainIntensity: { value: 0.0 },
      uShelterCenter: { value: new THREE.Vector4(0, 0, 0, 0) },
      uShelterBounds: { value: new THREE.Vector4(1, 0, 1, 1) }
    },
    vertexShader: /* glsl */`
      attribute vec4 aDrop;
      uniform float uTime;
      uniform vec3 uPlayerPos;
      uniform vec2 uWindDir;
      uniform float uWindStrength;
      uniform float uWindTime;
      uniform float uRainIntensity;
      varying vec2 vUv;
      varying float vFade;
      varying float vSeed;

      void main() {
        vUv = uv;
        float age = fract(uWindTime * 2.0 * aDrop.y + aDrop.x);
        float seed = aDrop.x * 73.1;
        vSeed = seed;

        vec3 windAxis = normalize(vec3(uWindDir.x, 0.0, uWindDir.y));
        vec3 sideAxis = vec3(-windAxis.z, 0.0, windAxis.x);

        // Short-range wind-sheared stream trajectory peeling cleanly off hood, shoulders & cargo pack
        float travel = pow(max(age, 0.0001), 0.80) * (0.18 + uWindStrength * 0.42);
        float dropArc = age * (0.04 + fract(seed * 3.7) * 0.08) - age * age * 0.24;
        float spreadSide = aDrop.z + sin(seed * 5.3 + age * 4.5) * (0.02 + age * 0.07);
        float depthOff = (fract(seed * 1.9) - 0.5) * 0.26;

        vec3 center = uPlayerPos
          + vec3(0.0, aDrop.w + dropArc, 0.0)
          + sideAxis * spreadSide
          + windAxis * (depthOff + travel);

        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 streamDir = normalize(vec3(windAxis.x, -0.14 - age * 0.22, windAxis.z));
        vec3 toCam = cameraPosition - center;
        vec3 toCamN = length(toCam) > 0.001 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
        vec3 rawUp = cross(toCamN, streamDir);
        vec3 safeUp = length(rawUp) > 0.001 ? normalize(rawUp) : camUp;

        // Delicate thin wind-stream filament (sleek length 0.14..0.34m, razor-thin 0.006..0.014m -> zero chunky droplets!)
        float lenSize = mix(0.14, 0.34, age) * (0.75 + fract(seed * 7.1) * 0.55);
        float thinSize = mix(0.006, 0.014, age) * (0.80 + fract(seed * 11.3) * 0.45);
        vec3 wp = center + streamDir * (position.x * lenSize) + safeUp * (position.y * thinSize);

        float lifeFade = smoothstep(0.0, 0.16, age) * (1.0 - smoothstep(0.45, 1.0, age));
        float rainGate = smoothstep(0.55, 0.96, uRainIntensity);
        vFade = lifeFade * rainGate;

        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying float vFade;
      varying float vSeed;
      ${ATMO_GLSL_PARS}

      void main() {
        if (vFade <= 0.004) discard;
        vec2 uvC = clamp(vUv, 0.0, 1.0);
        // Ultra-thin Gaussian cross-section + smooth tapered stream ends (reads as wispy wind-blown water stream!)
        float dy = (uvC.y - 0.5) * 2.0;
        float crossBlur = exp(-dy * dy * 4.8) * (1.0 - smoothstep(0.20, 1.0, abs(dy)));
        float alongTaper = pow(max(sin(uvC.x * 3.14159265), 0.0), 1.45);
        float wisp = 0.72 + 0.28 * sin(uvC.x * 11.0 - uTime * 18.0 + vSeed);
        float alpha = crossBlur * alongTaper * wisp * vFade * 0.19;
        if (alpha < 0.006) discard;
        vec3 col = mix(mix(uFogLowColor * 1.15, vec3(0.80, 0.85, 0.90) * uSunColor, 0.42), vec3(0.14, 0.22, 0.32), uNightFactor * 0.82);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const playerDropletMesh = new THREE.InstancedMesh(dropletGeo, playerDropletMat, DROPLET_COUNT);
  playerDropletMesh.frustumCulled = false;
  playerDropletMesh.renderOrder = 16;
  group.add(playerDropletMesh);

  // 4. 3D Forked Cloud-to-Ground Lightning Bolt (pre-allocated LineSegments, 1 draw call only when striking!)
  const MAX_BOLT_SEGS = 96;
  const boltPos = new Float32Array(MAX_BOLT_SEGS * 2 * 3);
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
  boltGeo.setDrawRange(0, 0);
  const boltMat = new THREE.LineBasicMaterial({
    color: 0xd8ecff,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const boltMesh = new THREE.LineSegments(boltGeo, boltMat);
  boltMesh.frustumCulled = false;
  boltMesh.visible = false;
  boltMesh.renderOrder = 18;
  group.add(boltMesh);

  let boltAge = 99.0;
  const BOLT_LIFE = 0.38;
  const _camFwd = new THREE.Vector3();

  function triggerLightning(camera, playerPos, strength = 1.0) {
    camera.getWorldDirection(_camFwd);
    const baseAng = Math.atan2(_camFwd.z, _camFwd.x);
    const ang = baseAng + (Math.random() - 0.5) * 1.45;
    const distM = 170 + Math.random() * 540;
    const ax = playerPos ? playerPos.x : camera.position.x;
    const az = playerPos ? playerPos.z : camera.position.z;
    const tx = ax + Math.cos(ang) * distM;
    const tz = az + Math.sin(ang) * distM;
    const groundY = getTerrainHeight(tx, tz) - 2.0;
    const topY = groundY + 260 + Math.random() * 110;

    let vIdx = 0;
    const pushSeg = (x0, y0, z0, x1, y1, z1) => {
      if (vIdx + 6 > boltPos.length) return;
      boltPos[vIdx++] = x0;
      boltPos[vIdx++] = y0;
      boltPos[vIdx++] = z0;
      boltPos[vIdx++] = x1;
      boltPos[vIdx++] = y1;
      boltPos[vIdx++] = z1;
    };

    const mainSteps = 22;
    let cx = tx + (Math.random() - 0.5) * 38;
    let cy = topY;
    let cz = tz + (Math.random() - 0.5) * 38;
    for (let i = 1; i <= mainSteps; i++) {
      const t = i / mainSteps;
      const ny = topY + (groundY - topY) * t;
      const jitter = (1.0 - t * 0.65) * 22.0;
      const nx = (tx * t + cx * (1.0 - t)) + (Math.random() - 0.5) * jitter;
      const nz = (tz * t + cz * (1.0 - t)) + (Math.random() - 0.5) * jitter;
      pushSeg(cx, cy, cz, nx, ny, nz);

      if (i > 3 && i < mainSteps - 3 && Math.random() < 0.28) {
        let bx = nx;
        let by = ny;
        let bz = nz;
        const bDirX = (Math.random() - 0.5) * 28.0;
        const bDirZ = (Math.random() - 0.5) * 28.0;
        const bSteps = 5 + Math.floor(Math.random() * 4);
        for (let b = 0; b < bSteps; b++) {
          const nbx = bx + bDirX * 0.45 + (Math.random() - 0.5) * 14.0;
          const nby = by - (14.0 + Math.random() * 12.0);
          const nbz = bz + bDirZ * 0.45 + (Math.random() - 0.5) * 14.0;
          pushSeg(bx, by, bz, nbx, nby, nbz);
          bx = nbx;
          by = nby;
          bz = nbz;
        }
      }
      cx = nx;
      cy = ny;
      cz = nz;
    }

    boltGeo.attributes.position.needsUpdate = true;
    boltGeo.setDrawRange(0, vIdx / 3);
    boltAge = 0.0;
    boltMesh.visible = true;
    boltMat.opacity = Math.min(1.0, 0.85 * strength);
    return distM;
  }

  const _dummy = new THREE.Object3D();
  const _clearOut = { baseY: 0, clearFade: 1 };

  function spawnRandomSpot(obj, anchorX, anchorZ, minR, maxR, windX, windZ, biasUpwind) {
    const ang = Math.random() * Math.PI * 2;
    const rad = minR + Math.sqrt(Math.random()) * (maxR - minR);
    obj.x = anchorX + Math.cos(ang) * rad - (biasUpwind ? windX * (maxR * 0.42) : 0);
    obj.z = anchorZ + Math.sin(ang) * rad - (biasUpwind ? windZ * (maxR * 0.42) : 0);
    obj.age = biasUpwind ? 0.0 : obj.age;
    obj.init = true;
  }

  // Sample 5-point terrain footprint so flowing cloud billboards stay cleanly above rolling ground & fade gently near sheer cliffs!
  function evalTerrainClearance(px, pz, halfR, puffH) {
    const cH = getTerrainHeight(px, pz);
    const hE = getTerrainHeight(px + halfR, pz);
    const hW = getTerrainHeight(px - halfR, pz);
    const hN = getTerrainHeight(px, pz - halfR);
    const hS = getTerrainHeight(px, pz + halfR);
    const maxH = Math.max(cH, hE, hW, hN, hS);
    const minH = Math.min(cH, hE, hW, hN, hS);
    const relief = maxH - minH;
    const t = Math.min(1, Math.max(0, (relief - puffH * 0.55) / Math.max(puffH * 0.95, 2.2)));
    _clearOut.baseY = cH;
    _clearOut.clearFade = 1.0 - t * t * (3.0 - 2.0 * t);
    return _clearOut;
  }

  function update(camera, rainIntensity, playerPos, dt = 0.016, shelter = null) {
    const safeDt = Math.min(dt || 0.016, 0.05);
    const windX = ATMO_UNIFORMS.uWindDir.value.x;
    const windZ = ATMO_UNIFORMS.uWindDir.value.y;
    const sideX = -windZ;
    const sideZ = windX;
    const windStr = ATMO_UNIFORMS.uWindStrength.value;

    const ax = playerPos ? playerPos.x : camera.position.x;
    const az = playerPos ? playerPos.z : camera.position.z;

    if (shelter) {
      rainMat.uniforms.uShelterCenter.value.set(shelter.cx, shelter.roofY, shelter.cz, 1.0);
      rainMat.uniforms.uShelterBounds.value.set(shelter.cosY, shelter.sinY, shelter.halfW, shelter.halfL);
      waveMat.uniforms.uShelterCenter.value.set(shelter.cx, shelter.roofY, shelter.cz, 1.0);
      waveMat.uniforms.uShelterBounds.value.set(shelter.cosY, shelter.sinY, shelter.halfW, shelter.halfL);
    } else {
      rainMat.uniforms.uShelterCenter.value.w = 0.0;
      waveMat.uniforms.uShelterCenter.value.w = 0.0;
    }

    rainMat.uniforms.uCamPos.value.copy(camera.position);
    rainMat.uniforms.uRainIntensity.value = rainIntensity;
    rainMesh.visible = rainIntensity > 0.02;
    if (rainMesh.visible) {
      rainMesh.count = Math.max(1200, Math.floor(RAIN_COUNT * Math.min(1.0, 0.30 + rainIntensity * 0.70)));
    }

    // Update Wave-After-Wave Flowing Storm Cloud Billboards
    waveMat.uniforms.uRainIntensity.value = rainIntensity;
    waveMesh.visible = rainIntensity > 0.58;
    if (waveMesh.visible) {
      let idx = 0;
      for (let w = 0; w < WAVE_COUNT; w++) {
        const wave = stormWaves[w];
        if (!wave.init) {
          spawnRandomSpot(wave, ax, az, 6.0, 62.0, windX, windZ, false);
        } else {
          const step = wave.speed * (0.65 + windStr * 0.95) * safeDt;
          wave.x += windX * step;
          wave.z += windZ * step;
          wave.age += safeDt / wave.life;
          if (wave.age >= 1.0 || Math.hypot(wave.x - ax, wave.z - az) > 84.0) {
            spawnRandomSpot(wave, ax, az, 8.0, 62.0, windX, windZ, true);
          }
        }

        const baseLife = Math.min(1, Math.max(0, wave.age));
        const waveFade = Math.pow(Math.max(Math.sin(baseLife * Math.PI), 0.0), 0.72);
        const swellScale = 0.78 + 0.42 * Math.sin(baseLife * Math.PI);

        for (let p = 0; p < PUFFS_PER_WAVE; p++) {
          const pf = wave.puffs[p];
          const px = wave.x + sideX * pf.latOff + windX * pf.alongOff;
          const pz = wave.z + sideZ * pf.latOff + windZ * pf.alongOff;
          const pw = pf.w * swellScale;
          const ph = pf.h * swellScale;
          const clr = evalTerrainClearance(px, pz, pw * 0.36, ph);
          const puffFade = Math.min(1, Math.max(0, waveFade + pf.phaseOff * waveFade)) * clr.clearFade;

          _dummy.position.set(px, clr.baseY + pf.yLift, pz);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          waveMesh.setMatrixAt(idx, _dummy.matrix);

          waveAttr[idx * 4] = pf.seed;
          waveAttr[idx * 4 + 1] = puffFade;
          waveAttr[idx * 4 + 2] = pw;
          waveAttr[idx * 4 + 3] = ph;
          idx++;
        }
      }
      waveMesh.instanceMatrix.needsUpdate = true;
      waveAttrBuf.needsUpdate = true;
    }

    playerDropletMat.uniforms.uRainIntensity.value = rainIntensity;
    playerDropletMesh.visible = rainIntensity > 0.50 && !(shelter && shelter.inside);

    if (boltMesh.visible) {
      boltAge += safeDt;
      if (boltAge >= BOLT_LIFE) {
        boltMesh.visible = false;
      } else {
        const u = boltAge / BOLT_LIFE;
        const flicker = u < 0.22 ? 1.0 : (u < 0.36 ? 0.25 : (u < 0.54 ? 0.92 : Math.max(0.0, 1.0 - (u - 0.54) / 0.46)));
        boltMat.opacity = flicker;
      }
    }
  }

  function setVisible(v) {
    group.visible = v;
  }

  return { update, setVisible, triggerLightning };
}
