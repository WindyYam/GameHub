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
  // 1. Ultra-Thin, Dense, Soft-Blurred Slanted Rain & Heavy Storm Curtains (16,000 GPU-instanced drops, 1 draw call!)
  const RAIN_COUNT = 16000;
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
      uSunColor: ATMO_UNIFORMS.uSunColor,
      uNightFactor: ATMO_UNIFORMS.uNightFactor
    },
    vertexShader: /* glsl */`
      attribute vec3 aOffset;
      attribute vec3 aSeed;
      uniform float uTime;
      uniform vec3 uCamPos;
      uniform float uRainIntensity;
      uniform vec2 uWindDir;
      uniform float uWindStrength;
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

        float fallSpeed = (22.0 + uWindStrength * 10.5) * aSeed.y;
        float t = uTime + aSeed.x;

        vec3 rel = aOffset;
        rel.y = mod(aOffset.y - t * fallSpeed, ${BOX_H.toFixed(1)}) - 5.5;
        rel.x = mod(aOffset.x + t * uWindDir.x * (3.5 + uWindStrength * 9.5) - uCamPos.x + ${(BOX_W * 0.5).toFixed(1)}, ${BOX_W.toFixed(1)}) - ${(BOX_W * 0.5).toFixed(1)};
        rel.z = mod(aOffset.z + t * uWindDir.y * (3.5 + uWindStrength * 9.5) - uCamPos.z + ${(BOX_W * 0.5).toFixed(1)}, ${BOX_W.toFixed(1)}) - ${(BOX_W * 0.5).toFixed(1)};

        vec3 worldCenter = vec3(uCamPos.x + rel.x, uCamPos.y + rel.y, uCamPos.z + rel.z);

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
        vFade = farFade * nearFade * smoothstep(0.02, 0.40, uRainIntensity) * mix(1.0, 1.35, stormFactor);

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
      }
    `
  });

  const rainMesh = new THREE.InstancedMesh(dropGeo, rainMat, RAIN_COUNT);
  rainMesh.frustumCulled = false;
  rainMesh.renderOrder = 15;
  scene.add(rainMesh);

  // 2. Wave-After-Wave Flowing Volumetric Storm Cloud / Water-Stream Billboards!
  // 16 independent rolling gust waves x 10 overlapping ultra-soft cloud billboards per wave (160 puffs, 1 draw call!)
  // Bottom-anchored cleanly above 5-point local terrain footprint -> lush billowing clouds with ZERO low-poly shapes & ZERO hard cuts!
  const WAVE_COUNT = 16;
  const PUFFS_PER_WAVE = 10;
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
        latOff: latFrac * (22.0 + Math.random() * 14.0) + (Math.random() - 0.5) * 4.5,
        alongOff: -Math.abs(latFrac) * 6.0 + (Math.random() - 0.5) * 9.0,
        yLift: 0.25 + Math.random() * 1.4,
        w: 10.5 + Math.random() * 10.0,
        h: 4.0 + Math.random() * 3.8,
        seed: Math.random() * 90.0,
        phaseOff: (Math.random() - 0.5) * 0.14
      });
    }
    stormWaves.push({
      x: 0,
      z: 0,
      speed: 7.2 + Math.random() * 4.4, // brisk rolling storm-cloud wave front
      age: w / WAVE_COUNT,              // evenly staggered -> wave after wave continuously rolls over random ground spots!
      life: 9.5 + Math.random() * 6.5,
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
      uRainIntensity: { value: 0.0 }
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
        vec3 upAxis = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, 0.34));
        vec3 wp = center + camRight * (position.x * aWave.z) + upAxis * ((position.y + 0.5) * aWave.w);
        vWorldPos = wp;

        float d = length(center - cameraPosition);
        float nearF = smoothstep(5.0, 15.0, d);
        float farF = 1.0 - smoothstep(68.0, 112.0, d);
        float stormGate = smoothstep(0.60, 0.98, uRainIntensity);
        vFade = nearF * farF * aWave.y * stormGate;

        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying float vFade;
      varying float vSeed;
      varying vec3 vWorldPos;
      ${ATMO_GLSL_PARS}

      void main() {
        if (vFade <= 0.002) discard;

        // Ultra-soft Gaussian elliptical cloud silhouette + deep bottom feathering (zero quad or ground edges!)
        vec2 c = (vUv - 0.5) * 2.0;
        float r2 = dot(c, c);
        if (r2 >= 0.95) discard;
        float radial = exp(-r2 * 2.95) * (1.0 - smoothstep(0.28, 0.95, r2));
        float baseSoft = smoothstep(0.0, 0.40, vUv.y);

        // Domain-warped flowing volumetric cloud billows + rapid wind-sheared mist wisps
        vec2 streamFlow = vec2(-uTime * (0.45 + uWindStrength * 0.42), -uTime * 0.05);
        vec2 q = vUv * vec2(1.65, 2.45) + vec2(vSeed, vSeed * 0.41);
        vec2 warp = vec2(
          atmoGNoise(q * 1.4 + streamFlow * 0.65) - 0.5,
          atmoGNoise(q * 1.4 + vec2(4.3, -2.7) + streamFlow * 0.65) - 0.5
        ) * 0.55;
        float cloudMacro = atmoFbm(q + warp + streamFlow * 0.90);
        float streamFine = atmoFbm(vUv * vec2(2.3, 5.8) + warp * 0.6 + streamFlow * 1.55 + vec2(vSeed * 0.3, 1.9));
        float density = smoothstep(0.22, 0.78, cloudMacro * 0.60 + streamFine * 0.40);

        float alpha = radial * baseSoft * density * vFade * 0.25;
        if (alpha < 0.004) discard;

        // Soft 3D cloud self-shading harmonized with storm sky luminance
        float topLit = smoothstep(0.14, 0.88, vUv.y + (cloudMacro - 0.5) * 0.34);
        vec3 darkBelly = mix(uFogColor * 0.78, vec3(0.035, 0.055, 0.080), uNightFactor * 0.88);
        vec3 brightCrest = mix(uFogLowColor * mix(1.14, 1.02, uCloudDarkness), vec3(0.085, 0.125, 0.175), uNightFactor * 0.85);
        vec3 col = mix(darkBelly, brightCrest, topLit);
        col = applyIcelandAtmo(col, vWorldPos);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const waveMesh = new THREE.InstancedMesh(waveGeo, waveMat, TOTAL_WAVE_PUFFS);
  waveMesh.frustumCulled = false;
  waveMesh.renderOrder = 14;
  scene.add(waveMesh);

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
      uRainIntensity: { value: 0.0 }
    },
    vertexShader: /* glsl */`
      attribute vec4 aDrop;
      uniform float uTime;
      uniform vec3 uPlayerPos;
      uniform vec2 uWindDir;
      uniform float uWindStrength;
      uniform float uRainIntensity;
      varying vec2 vUv;
      varying float vFade;
      varying float vSeed;

      void main() {
        vUv = uv;
        float lifeSpeed = (1.85 + uWindStrength * 0.75) * aDrop.y;
        float age = fract(uTime * lifeSpeed + aDrop.x);
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
      }
    `
  });

  const playerDropletMesh = new THREE.InstancedMesh(dropletGeo, playerDropletMat, DROPLET_COUNT);
  playerDropletMesh.frustumCulled = false;
  playerDropletMesh.renderOrder = 16;
  scene.add(playerDropletMesh);

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
    _clearOut.baseY = maxH + 0.12;
    _clearOut.clearFade = 1.0 - t * t * (3.0 - 2.0 * t);
    return _clearOut;
  }

  function update(camera, rainIntensity, playerPos, dt = 0.016) {
    const safeDt = Math.min(dt || 0.016, 0.05);
    const windX = ATMO_UNIFORMS.uWindDir.value.x;
    const windZ = ATMO_UNIFORMS.uWindDir.value.y;
    const sideX = -windZ;
    const sideZ = windX;
    const windStr = ATMO_UNIFORMS.uWindStrength.value;

    const ax = playerPos ? playerPos.x : camera.position.x;
    const az = playerPos ? playerPos.z : camera.position.z;

    rainMat.uniforms.uCamPos.value.copy(camera.position);
    rainMat.uniforms.uRainIntensity.value = rainIntensity;
    rainMesh.visible = rainIntensity > 0.02;

    // Update Wave-After-Wave Flowing Storm Cloud Billboards
    waveMat.uniforms.uRainIntensity.value = rainIntensity;
    waveMesh.visible = rainIntensity > 0.58;
    if (waveMesh.visible) {
      let idx = 0;
      for (let w = 0; w < WAVE_COUNT; w++) {
        const wave = stormWaves[w];
        if (!wave.init) {
          spawnRandomSpot(wave, ax, az, 12.0, 92.0, windX, windZ, false);
        } else {
          const step = wave.speed * (0.58 + windStr * 0.62) * safeDt;
          wave.x += windX * step;
          wave.z += windZ * step;
          wave.age += safeDt / wave.life;
          if (wave.age >= 1.0 || Math.hypot(wave.x - ax, wave.z - az) > 108.0) {
            spawnRandomSpot(wave, ax, az, 14.0, 86.0, windX, windZ, true);
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
    playerDropletMesh.visible = rainIntensity > 0.50;
  }

  return { update };
}
