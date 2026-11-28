/**
 * Icelandic Volumetric-Style Storm Sky Dome, Multi-Layer Nimbostratus Clouds,
 * 3D Ray-Marched Aurora Borealis, Stratified Aerial Perspective & Height Fog,
 * Weather Controller & Throttled PMREM IBL.
 */
import * as THREE from 'three';
import { clamp, mix, smoothstep } from './noise.js';
import { getTerrainHeight } from './world.js';

export const WEATHER_PRESETS = {
  overcast: {
    name: 'Overcast Mist',
    cloudCoverage: 0.82,
    cloudDarkness: 0.76,
    fogDensity: 0.00105,
    fogLowDensity: 0.00118,
    rainIntensity: 0.0,
    wetness: 0.36,
    windStrength: 0.52,
    sunGain: 0.96,
    ambientGain: 1.02
  },
  rain: {
    name: 'Timefall Rain',
    cloudCoverage: 0.94,
    cloudDarkness: 0.90,
    fogDensity: 0.00155,
    fogLowDensity: 0.00195,
    rainIntensity: 0.78,
    wetness: 0.92,
    windStrength: 0.85,
    sunGain: 0.58,
    ambientGain: 0.92
  },
  storm: {
    name: 'North Atlantic Gale',
    cloudCoverage: 0.99,
    cloudDarkness: 0.97,
    fogDensity: 0.00245,
    fogLowDensity: 0.00335,
    rainIntensity: 1.0,
    wetness: 1.0,
    windStrength: 2.25,
    sunGain: 0.30,
    ambientGain: 0.78
  },
  clearing: {
    name: 'Parting Clouds',
    cloudCoverage: 0.42,
    cloudDarkness: 0.28,
    fogDensity: 0.00058,
    fogLowDensity: 0.00066,
    rainIntensity: 0.0,
    wetness: 0.16,
    windStrength: 0.38,
    sunGain: 1.18,
    ambientGain: 1.02
  },
  clear: {
    name: 'Crisp Arctic Sky',
    cloudCoverage: 0.10,
    cloudDarkness: 0.04,
    fogDensity: 0.00024,
    fogLowDensity: 0.00025,
    rainIntensity: 0.0,
    wetness: 0.02,
    windStrength: 0.24,
    sunGain: 1.85,
    ambientGain: 0.98
  }
};

const SHADOW_MAP_RES = 80;
const SHADOW_MAP_HALF = 2400.0;
const _terrainShadowPixels = new Uint8Array(SHADOW_MAP_RES * SHADOW_MAP_RES * 4);
const _terrainShadowTex = new THREE.DataTexture(
  _terrainShadowPixels,
  SHADOW_MAP_RES,
  SHADOW_MAP_RES,
  THREE.RGBAFormat,
  THREE.UnsignedByteType
);
_terrainShadowTex.minFilter = THREE.LinearFilter;
_terrainShadowTex.magFilter = THREE.LinearFilter;
_terrainShadowTex.wrapS = THREE.ClampToEdgeWrapping;
_terrainShadowTex.wrapT = THREE.ClampToEdgeWrapping;
_terrainShadowTex.flipY = false;
_terrainShadowTex.generateMipmaps = false;
_terrainShadowTex.needsUpdate = true;

export const ATMO_UNIFORMS = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.62, 0.46, -0.64).normalize() },
  uSunColor: { value: new THREE.Color(0.95, 0.97, 0.99) },
  uMoonDir: { value: new THREE.Vector3(-0.35, 0.52, -0.78).normalize() },
  uSkyZenith: { value: new THREE.Color(0.14, 0.18, 0.22) },
  uSkyHorizon: { value: new THREE.Color(0.58, 0.63, 0.67) },
  uFogColor: { value: new THREE.Color(0.56, 0.61, 0.66) },
  uFogLowColor: { value: new THREE.Color(0.64, 0.69, 0.73) },
  uFogDensity: { value: 0.00072 },
  uFogLowDensity: { value: 0.00115 },
  uFogHeightFalloff: { value: 0.022 },
  uCloudCoverage: { value: 0.86 },
  uCloudDarkness: { value: 0.88 },
  uCloudSteps: { value: 4.0 },
  uRainWetness: { value: 0.42 },
  uNightFactor: { value: 0.0 },
  uAuroraStrength: { value: 0.0 },
  uAuroraTime: { value: 0.0 },
  uAuroraProfile: { value: new THREE.Vector4(0.72, 0.34, 0.58, 0.46) },
  uAuroraTint: { value: new THREE.Color(0.12, 0.92, 0.52) },
  uSiderealAngle: { value: 0.0 },
  uLightning: { value: 0.0 },
  uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  uWindStrength: { value: 0.55 },
  uWindTime: { value: 0 },
  uCloudFlowDist: { value: 0 },
  uScanOrigin: { value: new THREE.Vector3(0, 0, 0) },
  uScanRadius: { value: -10.0 },
  uScanStrength: { value: 0.0 },
  uPlayerPos: { value: new THREE.Vector3(-7.5, 22, 12.8) },
  uInReflection: { value: 0.0 },
  uTerrainShadowTex: { value: _terrainShadowTex },
  uTerrainShadowRect: { value: new THREE.Vector4(0, 0, 1.0 / SHADOW_MAP_HALF, 0.0) }
};

export const ATMO_GLSL_PARS = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform vec3 uFogLowColor;
uniform float uFogDensity;
uniform float uFogLowDensity;
uniform float uFogHeightFalloff;
uniform float uCloudCoverage;
uniform float uCloudDarkness;
uniform float uRainWetness;
uniform float uNightFactor;
uniform float uAuroraStrength;
uniform float uAuroraTime;
uniform vec4 uAuroraProfile;
uniform vec3 uAuroraTint;
uniform float uLightning;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uWindTime;
uniform float uCloudFlowDist;
uniform vec3 uScanOrigin;
uniform float uScanRadius;
uniform float uScanStrength;
uniform float uInReflection;
uniform sampler2D uTerrainShadowTex;
uniform vec4 uTerrainShadowRect;

// Precision-safe polynomial hash (eliminates GPU sin() float32 cell-edge discontinuities on ANGLE/D3D11!)
float atmoHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float atmoNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(atmoHash(i), atmoHash(i + vec2(1.0, 0.0)), u.x),
    mix(atmoHash(i + vec2(0.0, 1.0)), atmoHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float atmoFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * atmoNoise(p);
    p = rot * p * 2.03 + vec2(13.1, -7.7);
    a *= 0.5;
  }
  return v;
}

float sampleCloudShadow(vec2 worldXZ) {
  vec2 drift = uWindDir * (uTime * 1.4);
  float n = atmoFbm(worldXZ * 0.0018 + drift * 0.002);
  float cov = smoothstep(1.0 - uCloudCoverage, 1.06 - uCloudCoverage * 0.45, n);
  return mix(1.0, 0.46, cov * (0.45 + 0.55 * uCloudDarkness));
}

float sampleTerrainShadow(vec3 worldPos) {
  if (uTerrainShadowRect.w < 0.5) return 1.0;
  vec2 suv = (worldPos.xz - uTerrainShadowRect.xy) * uTerrainShadowRect.z * 0.5 + 0.5;
  if (suv.x <= 0.01 || suv.x >= 0.99 || suv.y <= 0.01 || suv.y >= 0.99) return 1.0;
  float edgeFade = smoothstep(0.01, 0.08, suv.x) * smoothstep(0.01, 0.08, 1.0 - suv.x)
                 * smoothstep(0.01, 0.08, suv.y) * smoothstep(0.01, 0.08, 1.0 - suv.y);
  float ceilY = texture2D(uTerrainShadowTex, suv).r * 400.0 - 20.0;
  float sh = smoothstep(ceilY - 8.0, ceilY + 10.0, worldPos.y);
  return mix(1.0, sh, edgeFade);
}

vec2 atmoHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

// Smooth C2 quintic gradient noise (zero grid creases, zero sin-hash precision artifacts!)
float atmoGNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(atmoHash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(atmoHash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(atmoHash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(atmoHash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return clamp(mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.72 + 0.5, 0.0, 1.0);
}

// Fast, smooth flowing 3D volumetric cloud-mist density at any world position (3 noise taps instead of 5 -> ~2x faster!)
float sampleFlowingCloudFog(vec3 p) {
  vec2 flowMacro = uWindDir * uCloudFlowDist;
  vec2 uvM = p.xz * 0.0022 - flowMacro * 0.0022;
  float wN = atmoGNoise(uvM * 1.35 + vec2(3.1, -5.2)) - 0.5;
  vec2 warp = vec2(wN, -wN * 0.85) * 0.90;

  // Macro cloud banks with genuine clear gaps between drifting mist patches!
  float bankMacro = atmoGNoise(uvM + warp + vec2(p.y * 0.0040, -p.y * 0.0032));
  float bankBillow = atmoGNoise(p.xz * 0.0062 - flowMacro * 0.0095 + warp * 1.1 + vec2(p.y * 0.012, 4.7));
  float rawCloud = bankMacro * 0.60 + bankBillow * 0.40;

  float thresh = mix(0.44, 0.30, clamp(uRainWetness * 0.85, 0.0, 1.0));
  float cloudShape = smoothstep(thresh, thresh + 0.42, rawCloud);

  float valleyBand = exp(-max(p.y - 10.0, 0.0) * 0.020);
  float mtSpread = mix(88.0, 175.0, smoothstep(0.35, 1.0, uRainWetness));
  float mtD = (p.y - 178.0) / mtSpread;
  float mountainBand = exp(-(mtD * mtD)) * (0.30 + 0.78 * uCloudCoverage);
  float strataWeight = clamp(valleyBand * 1.18 + mountainBand * 1.02 + mix(0.16, 0.34, uRainWetness), 0.0, 1.42);

  return cloudShape * strataWeight;
}

vec3 applyIcelandAtmo(vec3 col, vec3 worldPos) {
  vec3 toFrag = worldPos - cameraPosition;
  float dist = length(toFrag);
  if (dist < 22.0) return col;

  float fogDist = max(dist - 22.0, 0.0);
  float stormAmt = smoothstep(0.55, 0.96, uCloudDarkness) * smoothstep(0.40, 1.0, uRainWetness);
  float baseAir = (1.0 - exp(-fogDist * uFogDensity * mix(0.36, 0.52, stormAmt))) * mix(0.44, 0.66, stormAmt);

  // Fast analytical clear-air path on crisp clear skies (skips volumetric raymarch completely!)
  if (uFogLowDensity < 0.00038 && uRainWetness < 0.12) {
    vec3 clearAir = uFogColor * vec3(0.92, 0.97, 1.04) + uAuroraTint * 0.024 * uAuroraStrength * uNightFactor;
    return mix(col, clearAir, clamp(baseAir * 1.18, 0.0, 0.72));
  }

  // Optimized 3-step smooth C2 ray-marched flowing volumetric cloud-fog
  float marchLen = min(dist, 1650.0);
  vec3 rayDir = toFrag / max(dist, 0.001);
  float cloudAccum = 0.0;
  float litAccum = 0.0;
  float stepLen = marchLen / 3.0;
  for (int i = 0; i < 3; i++) {
    float t = (float(i) + 0.5) * stepLen;
    vec3 p = cameraPosition + rayDir * t;
    float dCloud = sampleFlowingCloudFog(p);
    float hLit = smoothstep(14.0, 185.0, p.y) * 0.58 + dCloud * 0.42;
    cloudAccum += dCloud;
    litAccum += dCloud * hLit;
  }
  float avgCloud = cloudAccum / 3.0;
  float avgLit = litAccum / max(cloudAccum, 0.001);

  // Dominant non-uniform flowing volumetric cloud-mist optical thickness!
  float cloudOpt = fogDist * (uFogLowDensity * 1.72 + uFogDensity * 0.62) * avgCloud;
  float cloudFog = (1.0 - exp(-cloudOpt)) * mix(0.93, 0.985, stormAmt);

  float maxFog = mix(0.76, 0.975, clamp(uRainWetness * 0.92, 0.0, 1.0));
  float totalFog = clamp(max(baseAir, baseAir * 0.32 + cloudFog), 0.0, maxFog);

  // Harmonize fog inscattering with sky storm luminance: sunlit silver crests on overcast/parting days -> brooding Nordic storm slate in gales!
  float sunBreak = (1.0 - uNightFactor) * mix(0.26, 0.03, smoothstep(0.35, 0.96, uCloudDarkness));
  vec3 stormSlate = mix(uFogLowColor, uSkyHorizon * mix(0.68, 0.52, uCloudDarkness), smoothstep(0.45, 0.95, uCloudDarkness) * 0.48);
  vec3 airCol = mix(uFogColor * vec3(0.90, 0.96, 1.04), stormSlate * 0.94, stormAmt * 0.55);
  vec3 cloudBelly = mix(uFogColor * 0.86, stormSlate * 0.92, 0.50);
  vec3 cloudCrest = mix(stormSlate * mix(1.16, 1.01, uCloudDarkness), vec3(0.87, 0.91, 0.95) * uSunColor, sunBreak);
  vec3 cloudCol = mix(cloudBelly, cloudCrest, clamp(avgLit, 0.0, 1.0));

  float cloudMix = clamp(cloudFog / max(totalFog, 0.001), 0.0, 1.0);
  vec3 scatterCol = mix(airCol, cloudCol, cloudMix);

  // Subtle multi-hued mist tint matching live Aurora Borealis palette at night
  scatterCol += uAuroraTint * 0.024 * uAuroraStrength * uNightFactor;

  return mix(col, scatterCol, totalFog);
}

vec3 sampleOdradekScan(vec3 worldPos, vec3 worldNorm) {
  if (uScanStrength <= 0.001 || uScanRadius < 0.0) return vec3(0.0);
  float d = length(worldPos.xz - uScanOrigin.xz);
  float ringD = (d - uScanRadius) * 0.26;
  float ring = exp(-(ringD * ringD));
  float trail = smoothstep(uScanRadius - 26.0, uScanRadius, d) * (1.0 - smoothstep(uScanRadius, uScanRadius + 4.0, d));
  float gridX = abs(fract(worldPos.x * 0.35) - 0.5);
  float gridZ = abs(fract(worldPos.z * 0.35) - 0.5);
  float topo = smoothstep(0.46, 0.495, max(gridX, gridZ));
  float steep = 1.0 - smoothstep(0.38, 0.75, worldNorm.y);
  vec3 scanCol = mix(vec3(0.05, 0.85, 1.0), vec3(1.0, 0.52, 0.12), steep);
  float intensity = (ring * 1.35 + trail * (0.28 + topo * 0.45)) * uScanStrength;
  return scanCol * intensity;
}
`;

/**
 * Inject Icelandic dual-layer aerial perspective, rain darkening/gloss,
 * and Odradek scan pulse into standard PBR materials.
 */
export function enhanceMaterialWithAtmo(mat, { cacheKey, windSway = 0.0, wetnessBoost = 0.65 } = {}) {
  mat.fog = false;
  mat.customProgramCacheKey = () => `ls_atmo_${cacheKey || 'std'}_${windSway > 0 ? 'wind' : 'nowind'}`;
  const prevCompile = mat.onBeforeCompile;

  mat.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    Object.assign(shader.uniforms, ATMO_UNIFORMS);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        varying vec3 vLsWorldPos;
        varying vec3 vLsWorldNorm;
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;
        uniform float uWindTime;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */`
        #include <begin_vertex>
        ${windSway > 0 ? /* glsl */`
        {
          vec2 wOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          float instSeed = position.x * 0.7 + position.z * 0.5;
          #ifdef USE_INSTANCING
            vec4 instCol = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            wOrigin = (modelMatrix * instCol).xz;
            instSeed += instCol.x * 0.37 + instCol.z * 0.41;
          #endif
          #ifdef USE_BATCHING
            vec4 batchCol = batchingMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            wOrigin = (modelMatrix * batchCol).xz;
            instSeed += batchCol.x * 0.37 + batchCol.z * 0.41;
          #endif
          // Sustained directional wind bend + long-lasting rolling gust waves (8-14s fronts!) + natural blade flutter
          float gustFront = 0.54 + 0.46 * sin(uTime * 0.46 - dot(wOrigin, uWindDir) * 0.042);
          float longSurge = 0.72 + 0.28 * sin(uTime * 0.21 - dot(wOrigin, uWindDir) * 0.016 + 1.4);
          float sustained = (0.30 + 0.44 * gustFront * longSurge) * uWindStrength;
          float flutter = sin(uWindTime * 2.0 + instSeed) * (0.20 + 0.10 * gustFront);
          float bend = clamp(position.y, 0.0, 1.5) * ${windSway.toFixed(4)} * (sustained + flutter);
          transformed.x += bend * uWindDir.x;
          transformed.z += bend * uWindDir.y;
          transformed.y -= abs(bend) * 0.12;
        }` : ''}
        `
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */`
        #include <project_vertex>
        {
          vec4 lsWp = vec4(transformed, 1.0);
          vec3 lsWn = objectNormal;
          #ifdef USE_INSTANCING
            lsWp = instanceMatrix * lsWp;
            lsWn = mat3(instanceMatrix) * lsWn;
          #endif
          #ifdef USE_BATCHING
            lsWp = batchingMatrix * lsWp;
            lsWn = mat3(batchingMatrix) * lsWn;
          #endif
          lsWp = modelMatrix * lsWp;
          vLsWorldPos = lsWp.xyz;
          vLsWorldNorm = normalize(mat3(modelMatrix) * lsWn);
        }
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        varying vec3 vLsWorldPos;
        varying vec3 vLsWorldNorm;
        ${ATMO_GLSL_PARS}
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, max(0.18, roughnessFactor * 0.45), uRainWetness * ${wetnessBoost.toFixed(3)});
        `
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */`
        #include <lights_fragment_end>
        {
          float tShadow = sampleTerrainShadow(vLsWorldPos);
          reflectedLight.directDiffuse *= tShadow;
          reflectedLight.directSpecular *= tShadow;
        }
        `
      )
      .replace(
        '#include <tonemapping_fragment>',
        /* glsl */`
        gl_FragColor.rgb += sampleOdradekScan(vLsWorldPos, normalize(vLsWorldNorm));
        gl_FragColor.rgb = applyIcelandAtmo(gl_FragColor.rgb, vLsWorldPos);
        #include <tonemapping_fragment>
        `
      );
  };
  return mat;
}

/**
 * Sky Dome with Volumetric-Shaded Sculpted Icelandic Nimbostratus Storm Clouds,
 * Beer-Lambert Self-Shadowing, Silver-Lining Directional Scattering,
 * Twinkling Starfield, Lunar Halo, and 3D Ray-Marched Aurora Borealis.
 */
export function createSkyDome() {
  const skyGeo = new THREE.SphereGeometry(12000, 48, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      ...ATMO_UNIFORMS
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = position;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${ATMO_GLSL_PARS}
      uniform float uSiderealAngle;
      uniform float uCloudSteps;
      varying vec3 vDir;

      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
      }

      float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      // Smooth quintic 2D gradient noise (zero grid artifacts)
      float gnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
        float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
        float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
        float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
        return clamp(mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.72 + 0.5, 0.0, 1.0);
      }

      float cloudFbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 r = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 4; i++) {
          v += a * gnoise(p);
          p = r * p * 2.03 + vec2(13.7, -7.9);
          a *= 0.5;
        }
        return v;
      }

      float cloudDensityAt(vec2 uv, vec2 drift, float cov) {
        // Domain-warped billowing storm cumulus/nimbostratus structure
        vec2 w = vec2(
          cloudFbm(uv * 0.48 + drift * 0.45) - 0.5,
          cloudFbm(uv * 0.48 + vec2(4.7, -3.1) + drift * 0.45) - 0.5
        );
        float base = cloudFbm(uv * 0.78 + w * 0.92 + drift);
        float billow = cloudFbm(uv * 1.85 - drift * 0.35 + w * 0.45 + vec2(8.3, 2.1));
        float fine = gnoise(uv * 4.4 + drift * 1.4);
        float field = base * 0.62 + billow * 0.28 + fine * 0.10;
        float thresh = mix(0.68, 0.22, cov);
        return smoothstep(thresh, thresh + 0.44, field);
      }

      // Rodrigues rotation around Iceland's North Celestial Pole (64.15 deg N above northern horizon -Z!)
      // Stars & Milky Way wheel counter-clockwise around Polaris as Earth rotates 360 deg per 24 game hours!
      vec3 toIcelandCelestial(vec3 rd) {
        const vec3 NCP = vec3(0.0, 0.89994, -0.43601); // sin(64.15 deg), -cos(64.15 deg)
        float c = cos(uSiderealAngle);
        float s = sin(uSiderealAngle);
        return rd * c + cross(NCP, rd) * s + NCP * dot(NCP, rd) * (1.0 - c);
      }

      // Isotropic 3D quintic celestial noise & rotated 4-octave FBM (zero 2D UV ribbon stretch, zero +/-PI seam!)
      float galNoise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
        return mix(
          mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
          mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
          u.z
        );
      }

      float galFbm3(vec3 p) {
        const mat3 m = mat3(
           0.00,  0.80,  0.60,
          -0.80,  0.36, -0.48,
          -0.60, -0.48,  0.64
        );
        float v = 0.0;
        float a = 0.5333;
        for (int i = 0; i < 3; i++) {
          v += a * galNoise3(p);
          p = m * p * 2.11 + vec3(7.3, -4.9, 11.1);
          a *= 0.5;
        }
        return v;
      }

      // Dense pinpoint galactic star-cloud layer (concentrated inside star clouds, occluded by foreground dust rifts)
      vec3 galStarClusterLayer(vec3 celDir, float N, float densityMask, float coreWeight, float seed) {
        vec3 p = celDir * N;
        vec3 cell = floor(p);
        float h = hash31(cell + seed);
        float thresh = mix(0.997, 0.74, clamp(densityMask, 0.0, 1.0));
        if (h < thresh) return vec3(0.0);
        float r = (h - thresh) / max(1.0 - thresh, 0.001);
        vec3 off = (vec3(hash31(cell + 1.3 + seed), hash31(cell + 2.7 + seed), hash31(cell + 4.1 + seed)) - 0.5) * 0.62;
        float d = length(fract(p) - 0.5 - off);
        float rad = mix(0.055, 0.145, r * r);
        float core = 1.0 - smoothstep(0.0, rad, d);
        if (core <= 0.001) return vec3(0.0);
        float halo = exp(-d * d / (rad * rad * 4.2)) * r * 0.28;
        float temp = fract(h * 73.9);
        vec3 popI  = mix(vec3(0.64, 0.80, 1.0), vec3(0.96, 0.97, 1.0), smoothstep(0.0, 0.65, temp));
        vec3 popII = mix(vec3(1.0, 0.89, 0.72), vec3(1.0, 0.70, 0.45), smoothstep(0.32, 1.0, temp));
        vec3 col = mix(popI, popII, clamp(coreWeight * 0.72 + smoothstep(0.66, 1.0, temp) * 0.45, 0.0, 1.0));
        float scint = 0.76 + 0.24 * sin(uTime * (1.5 + r * 3.4) + h * 150.0);
        return col * (core * core + halo) * (0.35 + 1.45 * r * r) * scint;
      }

      // Astronomical Bortle-1 Milky Way: warm Sagittarius-Scutum Galactic Bulge, clumpy isotropic star clouds
      // (Cygnus, Scutum, Cassiopeia), asymmetric fractal Beer-Lambert Great Rift & Pipe Nebula dust extinction
      // with interstellar reddening, jewel-like H-II emission knots, and thousands of pinpoint cluster stars.
      vec3 renderMilkyWay(vec3 celDir, float elev) {
        if (uNightFactor < 0.08 || elev < -0.02) return vec3(0.0);

        // Galactic Core rises over SSE volcanic ridges around midnight while Cygnus & Cassiopeia arch high overhead
        const vec3 galCore = vec3(0.43644, 0.26186, 0.86066);
        const vec3 galCygn = vec3(-0.24000, 0.93000, -0.27839);
        vec3 galNorth = normalize(cross(galCore, galCygn));
        vec3 galEast  = cross(galNorth, galCore);

        float gLat = dot(celDir, galNorth);
        if (abs(gLat) > 0.58) return vec3(0.0);

        float coreCos = dot(celDir, galCore);
        float eastCos = dot(celDir, galEast);

        // 3D isotropic domain warp on the celestial sphere (zero longitudinal cloth-ribbon stretching!)
        float wA = galFbm3(celDir * 2.35 + vec3(1.7, -2.3, 0.9)) - 0.5;
        float wB = galFbm3(celDir * 2.35 + vec3(-3.1, 1.4, 2.8)) - 0.5;
        vec3 w3 = vec3(wA, wB, (wA - wB) * 0.7);

        // Asymmetric Sagittarius Star Cloud & boxy central Bulge (brighter southern/eastern lobe like real Sagittarius!)
        float bulgeLon = exp(-max(1.0 - coreCos, 0.0) * 8.8);
        float bulgeAsym = gLat + 0.028 * bulgeLon - w3.z * 0.035;
        float bulgeLat = exp(-bulgeAsym * bulgeAsym * 20.0);
        float bulge = bulgeLon * bulgeLat;
        float sagStarCloud = exp(-max(1.0 - coreCos, 0.0) * 20.0) * exp(-pow(gLat + 0.042, 2.0) * 75.0);

        // Distinct spiral-arm star-cloud condensations (Cygnus Star Cloud overhead, Scutum, Cassiopeia-Perseus)
        float cygnusSpot = exp(-max(1.0 - dot(celDir, galCygn), 0.0) * 6.2);
        float scutumSpot = exp(-pow(coreCos - 0.74, 2.0) * 13.0) * step(0.0, eastCos + 0.35);
        float cassSpot   = exp(-max(1.0 - dot(celDir, normalize(vec3(-0.62, 0.66, -0.42))), 0.0) * 7.0);
        float armPatchiness = smoothstep(0.22, 0.76, galFbm3(celDir * 1.85 + vec3(4.2, -1.1, 2.6)));
        float armActivity = clamp(0.42 + 0.78 * armPatchiness + 0.72 * cygnusSpot + 0.55 * scutumSpot + 0.48 * cassSpot + 0.70 * bulgeLon, 0.0, 1.95);

        // Irregular feathery latitude envelope with detached star-cloud spurs & bays (never a straight ribbon!)
        float latPerturb = gLat + w3.x * 0.092 + (galNoise3(celDir * 6.2 + w3 * 1.4) - 0.5) * 0.042;
        float diskSigma = mix(0.052, 0.148, clamp(bulgeLon * 0.68 + (armPatchiness + cygnusSpot * 0.4) * 0.38, 0.0, 1.0));
        float diskOuter = exp(-(latPerturb * latPerturb) / (2.0 * diskSigma * diskSigma * 2.5));
        float diskInner = exp(-(latPerturb * latPerturb) / (2.0 * diskSigma * diskSigma * 0.66));
        if (diskOuter < 0.005 && bulge < 0.005) return vec3(0.0);

        // Multi-scale isotropic star-cloud condensations & fine crystalline stellar granulation
        float cMacro = galFbm3(celDir * 4.6 + w3 * 1.15);
        float cClump = galFbm3(celDir * 11.4 - w3 * 0.80 + vec3(5.2, -3.4, 1.8));
        float cKnots = galNoise3(celDir * 28.0 + w3 * 1.5);
        float gran1  = galNoise3(celDir * 74.0);
        float gran2  = galNoise3(celDir * 165.0);

        float cloudBillow = smoothstep(0.24, 0.78, cMacro * 0.52 + cClump * 0.48);
        float denseKnots  = pow(max(cClump * 0.52 + cKnots * 0.48, 0.0), 2.3);
        float particulate = 0.64 + 0.44 * gran1 * gran1 + 0.38 * pow(gran2, 2.1);

        // Detached outer stellar spurs & star-cloud islands (Ophiuchus, Cepheus & Vela spurs)
        float spurs = smoothstep(0.52, 0.82, cMacro * 0.62 + cKnots * 0.38) * diskOuter * 0.52;

        float rawStarCloud = (diskInner * (0.28 + 1.02 * cloudBillow + 0.84 * denseKnots) * armActivity
                           + spurs
                           + bulge * (0.74 + 0.64 * cloudBillow)
                           + sagStarCloud * 0.85) * particulate;

        // Asymmetric fractal Beer-Lambert dark molecular dust rifts (Great Rift, Cygnus Rift, Pipe & Dark Horse)
        float riftCenter = 0.022 - 0.035 * sin(eastCos * 3.4) + w3.y * 0.068 + (cMacro - 0.5) * 0.042;
        float riftOffset = gLat - riftCenter;
        float molDisk = exp(-(riftOffset * riftOffset) / (2.0 * 0.044 * 0.044));
        float ridgeA = 1.0 - abs(galFbm3(celDir * 5.8 + w3 * 1.45 + vec3(8.4, -4.1, 3.3)) * 2.0 - 1.0);
        float ridgeB = 1.0 - abs(galFbm3(celDir * 14.6 - w3 * 1.00 + vec3(-2.7, 6.8, -5.1)) * 2.0 - 1.0);
        // Diagonal dark dust branches (Pipe Nebula / Northern Coalsack / Le Gentil 3)
        float darkBranch = smoothstep(0.62, 0.85, galFbm3(celDir * 8.6 + w3 * 0.9 + vec3(-6.1, 2.3, 7.4)));
        float dustZone = 0.48 + 0.78 * clamp(bulgeLon * 0.95 + cygnusSpot * 0.90 + scutumSpot * 0.65, 0.0, 1.25);

        float tauDust = (pow(max(ridgeA, 0.0), 2.3) * 2.15 + pow(max(ridgeB, 0.0), 2.7) * 1.20) * molDisk * dustZone
                      + darkBranch * exp(-pow(gLat - 0.035, 2.0) * 36.0) * 1.65
                      + smoothstep(0.66, 0.90, cClump) * diskOuter * 0.40;
        float dustTrans = exp(-tauDust);

        // Realistic astronomical color: warm golden-ivory Population II core, silvery-milk Cygnus star clouds, cool blue outer OB arms
        float coreWarmth = clamp(bulgeLon * 0.86 + sagStarCloud * 0.50, 0.0, 1.0);
        vec3 spiralArmCol = mix(vec3(0.48, 0.62, 0.90), vec3(0.82, 0.87, 0.97), cloudBillow);
        vec3 bulgeGoldCol = mix(vec3(0.96, 0.74, 0.48), vec3(1.00, 0.90, 0.74), smoothstep(0.25, 0.88, sagStarCloud + denseKnots * 0.55));
        vec3 starCloudCol = mix(spiralArmCol, bulgeGoldCol, coreWarmth);

        // Interstellar dust reddening along dark molecular cloud borders
        float dustEdgeRedden = clamp(tauDust * 0.50, 0.0, 0.70) * (1.0 - dustTrans * 0.45);
        starCloudCol *= mix(vec3(1.0), vec3(1.12, 0.73, 0.46), dustEdgeRedden);

        // Compact jewel-like H-II emission nebulae (NGC 7000 North America in Cygnus, Lagoon M8, Heart & Soul)
        float hAlphaKnot = smoothstep(0.73, 0.90, galNoise3(celDir * 19.5 + w3 * 1.2 + vec3(3.7, -8.2, 4.4)))
                         * smoothstep(0.42, 0.76, cClump) * diskInner * dustTrans;
        float obCluster  = smoothstep(0.75, 0.91, galNoise3(celDir * 24.0 - w3 * 1.1 + vec3(-5.5, 4.1, -2.9)))
                         * (1.0 - coreWarmth * 0.60) * diskInner * dustTrans;

        vec3 diffuseGal = starCloudCol * rawStarCloud * dustTrans * 0.152;
        diffuseGal += vec3(0.95, 0.28, 0.48) * hAlphaKnot * (0.090 + 0.060 * coreWarmth);
        diffuseGal += vec3(0.50, 0.74, 1.00) * obCluster * 0.080;

        // Dense resolved + semi-resolved pinpoint stars & open clusters packed inside bright star clouds
        float clusterMask = clamp((rawStarCloud * 0.66 + denseKnots * diskInner * 0.62) * mix(0.08, 1.0, dustTrans), 0.0, 1.0);
        vec3 galStars = vec3(0.0);
        if (clusterMask > 0.025) {
          galStars += galStarClusterLayer(celDir, 310.0, clusterMask * 0.72, coreWarmth, 13.7) * 0.72;
          galStars += galStarClusterLayer(celDir, 620.0, clusterMask * 0.90, coreWarmth, 37.3) * 0.58;
          galStars += galStarClusterLayer(celDir, 1180.0, clusterMask, coreWarmth, 81.9) * 0.45;
        }

        float horizFade = smoothstep(-0.01, 0.15, elev);
        float nightVis = smoothstep(0.14, 0.82, uNightFactor) * (1.0 - uCloudCoverage * 0.88);
        return (diffuseGal + galStars) * horizFade * nightVis;
      }

      // One layer of procedural stars: cell density N, hash threshold, size range and brightness
      vec3 starLayer(vec3 celDir, float N, float thresh, float sizeLo, float sizeHi, float bright, float seed) {
        vec3 p = celDir * N;
        vec3 cell = floor(p);
        vec3 f = fract(p) - 0.5;
        float h = hash31(cell + seed);
        if (h < thresh) return vec3(0.0);
        float r = (h - thresh) / (1.0 - thresh);
        float size = mix(sizeLo, sizeHi, r * r);
        vec3 off = (vec3(hash31(cell + 1.1 + seed), hash31(cell + 2.3 + seed), hash31(cell + 3.7 + seed)) - 0.5) * 0.3;
        float d = length(f - off);
        float core = 1.0 - smoothstep(0.0, size, d);
        float halo = exp(-d * d / (size * size * 5.0)) * r * 0.35;
        float twinkle = 0.62 + 0.38 * sin(uTime * (1.8 + r * 5.0) + h * 190.0 + sin(uTime * 0.7 + h * 40.0));
        float temp = fract(h * 91.7);
        vec3 tint = temp < 0.2 ? vec3(0.62, 0.78, 1.0) : (temp < 0.65 ? vec3(0.95, 0.96, 1.0) : (temp < 0.88 ? vec3(1.0, 0.92, 0.74) : vec3(1.0, 0.68, 0.48)));
        float mag = bright * (0.35 + 1.4 * r);
        return tint * (core * core + halo) * twinkle * mag;
      }

      vec3 renderStars(vec3 celDir, float elev) {
        if (uNightFactor < 0.08 || elev < 0.005) return vec3(0.0);
        vec3 acc = vec3(0.0);
        acc += starLayer(celDir, 95.0, 0.987, 0.05, 0.14, 1.5, 0.0);
        acc += starLayer(celDir, 210.0, 0.986, 0.07, 0.17, 0.9, 17.0);
        acc += starLayer(celDir, 440.0, 0.985, 0.10, 0.22, 0.6, 41.0);
        acc += starLayer(celDir, 900.0, 0.992, 0.16, 0.30, 0.4, 73.0);

        const vec3 NCP = vec3(0.0, 0.89994, -0.43601);
        float polCos = max(dot(celDir, NCP), 0.0);
        acc += vec3(0.96, 0.95, 0.88) * smoothstep(0.99992, 0.999995, polCos) * 2.6;

        return acc * smoothstep(0.005, 0.12, elev) * smoothstep(0.10, 0.80, uNightFactor) * (1.0 - uCloudCoverage * 0.6);
      }

      // Isometric 2D Kelvin-Helmholtz vortex twist in geomagnetic sheet coordinates
      // Wraps auroral curtains into genuine 3D S-folds, horseshoe bends, and spiral surges without pinching width!
      vec2 auroraSwirl(vec2 p, vec2 c, float invR2, float angle) {
        vec2 d = p - c;
        float w = exp(-dot(d, d) * invR2);
        float a = angle * w;
        float s = sin(a);
        float co = cos(a);
        return c + vec2(co * d.x - s * d.y, s * d.x + co * d.y);
      }

      float fastErf(float x) {
        float s = x < 0.0 ? -1.0 : 1.0;
        float ax = min(abs(x), 6.0);
        float t = 1.0 / (1.0 + 0.3275911 * ax);
        float poly = (((((1.0614054 * t - 1.4531520) * t) + 1.4214137) * t - 0.2844967) * t + 0.2548296) * t;
        return s * (1.0 - poly * exp(-ax * ax));
      }

      // Analytical line-segment Gaussian sheet integral balanced for defined yet softly feathered auroral curtains
      vec2 integrateCurtainSeg(float d0, float d1, float w, float du, float raySpan) {
        float dd = d1 - d0;
        float a = d0 / w;
        float b = d1 / w;
        float ba = b - a;
        float ab = abs(ba);
        float safeBa = ab > 1e-4 ? ba : (ba >= 0.0 ? 1e-4 : -1e-4);
        float tSharp = clamp(-a / safeBa, 0.0, 1.0);
        float tCross = mix(0.5, tSharp, smoothstep(0.20, 1.60, ab));
        float dMinNorm = abs(a + ba * tCross);
        if (dMinNorm > 3.9) return vec2(0.0, tCross);
        float win = 1.0 - smoothstep(2.6, 3.9, dMinNorm);
        float segInt = ab > 0.025
          ? (0.8862269 * abs(fastErf(b) - fastErf(a)) / ab) * du
          : exp(-0.25 * (a + b) * (a + b)) * du;
        float normFactor = max(raySpan, 0.26) / (1.7724538 * w);
        return vec2(min(segInt * normFactor, 0.72) * win, tCross);
      }

      // Shade one 3D auroral curtain with softly defined folds, gentle vertical ray shafts & restrained intensity
      vec3 shadeAuroraCurtainHit(
        float wInt, float u, float sx, vec2 magAzDir, float magAz, float t,
        float foldDrive, float ionDrive, float crimsonDrive,
        float cyanBias, float seed
      ) {
        if (wInt <= 0.002 || abs(sx) > 3.5) return vec3(0.0);

        float segEnv = smoothstep(0.10, 0.58, gnoise(vec2(sx * 0.36 + seed, t * 0.018)) + 0.18) * exp(-sx * sx * 0.070);
        if (segEnv <= 0.002) return vec3(0.0);

        // Gently defined vertical magnetic-field ray shafts (readable curtain rays without harsh pinstripes)
        float rBundle = gnoise(vec2(sx * 2.6 + seed, t * 0.10));
        float rBroad  = gnoise(magAzDir * 8.5 + vec2(seed * 1.7 + t * 0.16, -t * 0.12));
        float rSoft   = gnoise(magAzDir * 21.0 + vec2(-t * 0.28 + seed * 3.1, t * 0.22));

        float rayness = smoothstep(0.18, 0.74, gnoise(vec2(sx * 0.62 - t * 0.022 + seed, 2.9)) + foldDrive * 0.16);
        float softPillars = 0.24 + 1.32 * pow(smoothstep(0.18, 0.84, rBroad * 0.55 + rSoft * 0.45), 1.35);
        float rays = mix(0.72 + 0.30 * rBundle, softPillars * (0.64 + 0.52 * rBundle), rayness * 0.84);

        // Softly defined lower curtain base & smooth upper fade
        float topU = mix(0.42, 0.95, clamp(rBundle * 0.70 + rBroad * 0.30, 0.0, 1.0) * (0.60 + 0.40 * max(crimsonDrive, cyanBias)));
        float botSoft = smoothstep(0.006, 0.115, u);
        float lowerWarmth = 1.0 + 0.58 * exp(-u * 13.0) * (0.45 + 0.55 * rays);
        float greenBody = botSoft * lowerWarmth * exp(-u / max(topU * 0.48, 0.17)) * (1.0 - smoothstep(topU * 0.52, topU, u));

        float crownStrength = crimsonDrive * crimsonDrive * 0.98 + cyanBias * 0.45;
        float upperCrown = smoothstep(0.12, 0.44, u) * exp(-max(u - 0.36, 0.0) * (2.3 - 0.75 * crimsonDrive))
                         * (0.44 + 0.68 * rBundle) * crownStrength;

        // Soft N2/N2+ rose-violet lower border wash in active zones
        float ionPatch = smoothstep(0.32, 0.76, gnoise(vec2(sx * 0.95 + t * 0.045 + seed * 2.0, 5.4))) * ionDrive;
        float fringeMix = clamp(ionPatch * exp(-u * 12.5) * 1.05, 0.0, 0.78);

        vec3 oxyChartreuse = vec3(0.40, 0.96, 0.35);
        vec3 oxyEmerald    = vec3(0.09, 0.94, 0.44);
        vec3 n2Turquoise   = vec3(0.09, 0.80, 0.90);
        vec3 n2CobaltViolet= vec3(0.43, 0.25, 0.92);
        vec3 n2MagentaWash = mix(vec3(0.90, 0.24, 0.64), vec3(0.60, 0.23, 0.94), cyanBias * 0.6);
        vec3 oxyCrimson    = vec3(0.92, 0.12, 0.23);

        vec3 mainCol = mix(oxyChartreuse, oxyEmerald, smoothstep(0.015, 0.14, u));
        mainCol = mix(mainCol, n2Turquoise, clamp(cyanBias * 0.80 + ionDrive * 0.16, 0.0, 0.85) * smoothstep(0.03, 0.26, u));
        mainCol = mix(mainCol, n2MagentaWash, fringeMix);

        vec3 crownCol = mix(oxyCrimson, n2CobaltViolet, clamp(cyanBias * 0.88 - crimsonDrive * 0.55, 0.0, 1.0));
        vec3 overlapGold = vec3(0.90, 0.65, 0.28) * (crimsonDrive * crimsonDrive * greenBody * upperCrown * 0.32);

        vec3 totalEmission = mainCol * greenBody + crownCol * upperCrown + overlapGold;
        return totalEmission * (wInt * segEnv * rays);
      }

      // Soft, large-scale atmospheric 3D Geomagnetic Aurora Borealis:
      // Broad blurry draperies, gentle arcs, diffuse pulsating glows & soft coronal convergence at restrained night-sky intensity.
      vec3 renderAurora(vec3 rd) {
        if (uAuroraStrength <= 0.004 || rd.y < -0.025) return vec3(0.0);

        float foldDrive    = uAuroraProfile.x;
        float coronaDrive  = uAuroraProfile.y;
        float ionDrive     = uAuroraProfile.z;
        float crimsonDrive = uAuroraProfile.w;
        float cyanBias     = smoothstep(0.62, 0.95, ionDrive) * (1.0 - crimsonDrive * 0.65);

        float skySector = smoothstep(0.86, -0.18, rd.z - rd.y * (0.80 + coronaDrive * 0.70));
        if (skySector <= 0.002) return vec3(0.0);

        float t = uAuroraTime;
        float el = max(rd.y, -0.02);

        const float H_BOT = 0.020;
        float H_TOP = mix(0.054, 0.072, crimsonDrive);
        float sBot = sqrt(max(el * el + 2.0 * H_BOT + H_BOT * H_BOT, 0.0001)) - el;
        float sTop = sqrt(max(el * el + 2.0 * H_TOP + H_TOP * H_TOP, 0.0001)) - el;
        vec3 pBot = rd * sBot;
        vec3 pTop = rd * sTop;

        const vec2 bTilt = vec2(0.052, 0.242);
        const vec3 magZen = vec3(0.05046, 0.96999, 0.23484);
        const vec3 magEast = vec3(0.99869, -0.05116, 0.00000);
        vec3 magNorth = cross(magZen, magEast);
        vec2 magPlane = vec2(dot(rd, magEast), dot(rd, magNorth));
        vec2 magAzDir = normalize(magPlane + vec2(1e-5, 0.0));
        float magAz = atan(magAzDir.x, -magAzDir.y);

        vec2 qBot = (pBot.xz - bTilt * (pBot.y - H_BOT)) * 10.5;
        vec2 qTop = (pTop.xz - bTilt * (pTop.y - H_BOT)) * 10.5;
        float raySpan = length(qTop - qBot);

        // Gentle, large-scale vortex folds & broad blurry sheet widths (4x-5x wider for atmospheric softness!)
        float latBase = mix(-0.58, -0.10, coronaDrive);
        vec2 vortA1 = vec2(-0.38 + 0.24 * sin(t * 0.038), latBase - 0.04 + 0.09 * cos(t * 0.031));
        vec2 vortA2 = vec2( 0.42 + 0.24 * cos(t * 0.034), latBase - 0.10 + 0.10 * sin(t * 0.037));
        vec2 vortB1 = vec2(-0.02 + 0.34 * sin(t * 0.043 + 1.4), latBase - 0.36 + 0.11 * cos(t * 0.039));
        float twistA1 =  1.42 * foldDrive * (0.76 + 0.24 * sin(t * 0.065));
        float twistA2 = -1.32 * foldDrive * (0.78 + 0.22 * cos(t * 0.058 + 1.1));
        float twistB1 =  1.18 * (0.35 + 0.65 * foldDrive) * cos(t * 0.052 + 0.5);

        float widthA = mix(0.056, 0.038, foldDrive);
        float widthB = 0.044;
        float widthC = mix(0.078, 0.098, coronaDrive);

        vec2 P0 = qBot;
        vec2 pA0 = auroraSwirl(auroraSwirl(P0, vortA1, 1.65, twistA1), vortA2, 1.75, twistA2);
        float dA0 = pA0.y - (latBase - 0.10 * pA0.x * pA0.x + 0.16 * sin(pA0.x * 1.6 + t * 0.055) + 0.06 * sin(pA0.x * 3.4 - t * 0.09) * foldDrive);
        vec2 pB0 = auroraSwirl(P0, vortB1, 1.85, twistB1);
        float dB0 = pB0.y - ((latBase - 0.36) + 0.17 * pB0.x - 0.09 * pB0.x * pB0.x + 0.09 * sin(pB0.x * 2.5 - t * 0.09) * (0.35 + 0.65 * foldDrive));
        vec2 zD0 = P0 - vec2(0.005, 0.053);
        float azZ0 = atan(zD0.x, zD0.y - 0.0001);
        float dCor0 = length(zD0) - (0.22 + 0.07 * sin(azZ0 * 3.0 + t * 0.07) + 0.04 * cos(azZ0 * 5.0 - t * 0.10));
        float dArc0 = P0.y - (-1.16 - 0.09 * P0.x * P0.x + 0.10 * sin(P0.x * 1.4 - t * 0.04));

        vec3 hitAFront = vec3(0.0);
        vec3 hitABack  = vec3(0.0);
        vec3 hitB      = vec3(0.0);
        vec4 hitCor    = vec4(0.0);
        vec3 hitArc    = vec3(0.0);

        const int SEGS = 8;
        float u0 = 0.0;
        for (int i = 0; i < SEGS; i++) {
          float fn = float(i + 1) / float(SEGS);
          float u1 = fn * fn * 0.30 + fn * 0.70;
          float du = u1 - u0;
          vec2 P1 = mix(qBot, qTop, u1);

          vec2 pA1 = auroraSwirl(auroraSwirl(P1, vortA1, 1.65, twistA1), vortA2, 1.75, twistA2);
          float dA1 = pA1.y - (latBase - 0.10 * pA1.x * pA1.x + 0.16 * sin(pA1.x * 1.6 + t * 0.055) + 0.06 * sin(pA1.x * 3.4 - t * 0.09) * foldDrive);

          vec2 pB1 = auroraSwirl(P1, vortB1, 1.85, twistB1);
          float dB1 = pB1.y - ((latBase - 0.36) + 0.17 * pB1.x - 0.09 * pB1.x * pB1.x + 0.09 * sin(pB1.x * 2.5 - t * 0.09) * (0.35 + 0.65 * foldDrive));

          vec2 zD1 = P1 - vec2(0.005, 0.053);
          float azZ1 = atan(zD1.x, zD1.y - 0.0001);
          float dCor1 = length(zD1) - (0.22 + 0.07 * sin(azZ1 * 3.0 + t * 0.07) + 0.04 * cos(azZ1 * 5.0 - t * 0.10));
          float dArc1 = P1.y - (-1.16 - 0.09 * P1.x * P1.x + 0.10 * sin(P1.x * 1.4 - t * 0.04));

          vec2 intA = integrateCurtainSeg(dA0, dA1, widthA, du, raySpan);
          if (intA.x > 0.0) {
            float uA = mix(u0, u1, intA.y);
            float sxA = mix(pA0.x, pA1.x, intA.y);
            float backSplit = smoothstep(-0.015, 0.015, dA1 - dA0);
            hitAFront += vec3(1.0, uA, sxA) * (intA.x * (1.0 - backSplit));
            hitABack  += vec3(1.0, uA, sxA) * (intA.x * backSplit);
          }

          vec2 intB = integrateCurtainSeg(dB0, dB1, widthB, du, raySpan);
          if (intB.x > 0.0) {
            hitB += vec3(1.0, mix(u0, u1, intB.y), mix(pB0.x, pB1.x, intB.y)) * intB.x;
          }

          if (coronaDrive > 0.18) {
            vec2 intCor = integrateCurtainSeg(dCor0, dCor1, widthC, du, raySpan);
            if (intCor.x > 0.0) {
              vec2 zDC = mix(zD0, zD1, intCor.y);
              hitCor += vec4(1.0, mix(u0, u1, intCor.y), zDC.x, zDC.y) * (intCor.x * smoothstep(0.18, 0.72, coronaDrive));
            }
          }

          vec2 intArc = integrateCurtainSeg(dArc0, dArc1, 0.068, du, raySpan);
          if (intArc.x > 0.0) {
            hitArc += vec3(1.0, mix(u0, u1, intArc.y), mix(P0.x, P1.x, intArc.y)) * (intArc.x * (1.0 - coronaDrive * 0.45));
          }

          u0 = u1;
          P0 = P1;
          pA0 = pA1; dA0 = dA1;
          pB0 = pB1; dB0 = dB1;
          zD0 = zD1; dCor0 = dCor1;
          dArc0 = dArc1;
        }

        vec3 accum = vec3(0.0);

        // Restrained, ghostly curtain intensities with softly readable folds & ray structure
        if (hitAFront.x > 0.002) {
          float inv = 1.0 / hitAFront.x;
          accum += shadeAuroraCurtainHit(hitAFront.x * 0.26, hitAFront.y * inv, hitAFront.z * inv, magAzDir, magAz, t, foldDrive, ionDrive * 0.85, crimsonDrive, cyanBias * 0.65, 1.7);
        }
        if (hitABack.x > 0.002) {
          float inv = 1.0 / hitABack.x;
          accum += shadeAuroraCurtainHit(hitABack.x * 0.23, hitABack.y * inv, hitABack.z * inv, magAzDir, magAz + 0.7, t, foldDrive, min(ionDrive * 1.05, 1.0), crimsonDrive, cyanBias * 0.65, 1.7);
        }
        if (hitB.x > 0.002) {
          float inv = 1.0 / hitB.x;
          accum += shadeAuroraCurtainHit(hitB.x * 0.21, hitB.y * inv, hitB.z * inv, magAzDir, magAz + 1.9, t, foldDrive, min(ionDrive * 1.15, 1.0), crimsonDrive * 0.9, min(cyanBias + ionDrive * 0.35, 1.0), -3.4);
        }
        if (hitArc.x > 0.002) {
          float inv = 1.0 / hitArc.x;
          accum += shadeAuroraCurtainHit(hitArc.x * 0.13, hitArc.y * inv, hitArc.z * inv, magAzDir, magAz - 1.1, t, foldDrive * 0.35, ionDrive * 0.30, crimsonDrive * 0.80, cyanBias * 0.5, 6.2);
        }
        if (hitCor.x > 0.002) {
          float inv = 1.0 / hitCor.x;
          float uC = hitCor.y * inv;
          vec2 zMean = hitCor.zw * inv;
          float cenFade = smoothstep(0.02, 0.13, length(zMean));
          vec2 azU = normalize(zMean + vec2(1e-4, 0.0));
          float nSpoke = gnoise(azU * 6.5 + vec2(t * 0.14, -t * 0.10)) * 0.56
                       + gnoise(azU * 16.0 - vec2(t * 0.24, 2.1)) * 0.44;
          float corSpokes = 0.26 + 1.35 * pow(smoothstep(0.20, 0.84, nSpoke), 1.35);
          float vertCor = smoothstep(0.008, 0.13, uC) * (1.0 + 0.42 * exp(-uC * 12.0)) * exp(-uC / (0.44 + 0.24 * crimsonDrive));
          float corIon = smoothstep(0.36, 0.78, gnoise(azU * 2.2 + vec2(t * 0.05, 1.3))) * ionDrive;
          vec3 colCor = mix(vec3(0.10, 0.94, 0.46), vec3(0.86, 0.25, 0.68), corIon * exp(-uC * 11.0));
          colCor = mix(colCor, mix(vec3(0.32, 0.50, 0.92), vec3(0.90, 0.12, 0.24), 0.35 + 0.65 * crimsonDrive), smoothstep(0.18, 0.56, uC));
          accum += colCor * (hitCor.x * corSpokes * vertCor * cenFade * 0.22);
        }

        // Large-scale blurry diffuse auroral cloud veil & gently breathing patches across the ionosphere
        vec2 pVeil = mix(qBot, qTop, 0.28);
        float veilBroad = gnoise(pVeil * 0.68 + vec2(t * 0.014, -t * 0.011));
        float veilMid   = gnoise(pVeil * 1.55 + vec2(-t * 0.020 + 2.4, t * 0.016));
        float pulseWave = 0.62 + 0.38 * sin(t * 0.65 + veilBroad * 8.0);
        float veilEnv   = exp(-pow((pVeil.y - (latBase - 0.18)) / 0.68, 2.0)) * exp(-pVeil.x * pVeil.x * 0.14);
        float veilMask  = smoothstep(0.32, 0.82, veilBroad * 0.65 + veilMid * 0.35) * veilEnv * pulseWave;
        vec3 veilCol    = mix(vec3(0.09, 0.86, 0.46), vec3(0.14, 0.68, 0.86), cyanBias * 0.65);
        veilCol         = mix(veilCol, vec3(0.76, 0.20, 0.42), crimsonDrive * 0.32 * smoothstep(0.45, 0.85, veilMid));
        accum += veilCol * veilMask * 0.048;

        // Soft subauroral mauve glow (STEVE-inspired misty arch) during high ionization
        float steveVis = smoothstep(0.68, 0.95, ionDrive) * (0.50 + 0.50 * sin(t * 0.045 + 0.8));
        if (steveVis > 0.01) {
          vec2 pSteve = mix(qBot, qTop, 0.34);
          float dSteve = pSteve.y - (-0.04 - 0.05 * pSteve.x * pSteve.x + 0.04 * sin(pSteve.x * 1.7 - t * 0.05));
          float steveArc = exp(-(dSteve * dSteve) / (0.042 * 0.042)) * exp(-pSteve.x * pSteve.x * 0.20);
          accum += vec3(0.80, 0.58, 0.88) * (steveArc * 0.11 * steveVis);
        }

        // Faint low poleward airglow mist above distant mountain ridges
        float airglow = smoothstep(-0.01, 0.12, el) * exp(-max(el, 0.0) * 4.2) * smoothstep(-0.1, 0.8, -rd.z);
        accum += vec3(0.08, 0.74, 0.40) * airglow * 0.020;

        // Gentle soft-knee ceiling so aurora stays restrained, atmospheric & translucent
        float peak = max(accum.r, max(accum.g, accum.b));
        if (peak > 0.001) {
          float compressed = (peak * 0.96) / (1.0 + peak * 1.32);
          accum *= compressed / peak;
        }

        float horizFade = smoothstep(-0.02, 0.08, rd.y);
        return accum * uAuroraStrength * horizFade * skySector;
      }

      void main() {
        vec3 rd = normalize(vDir);
        float elev = clamp(rd.y, -0.25, 1.0);

        // Base Nordic Rayleigh/Mie sky gradient
        float hMix = pow(clamp(1.0 - max(elev, 0.0), 0.0, 1.0), 2.1);
        vec3 sky = mix(uSkyZenith, uSkyHorizon, hMix);

        float sunCos = max(dot(rd, uSunDir), 0.0);
        float clearSunBoost = 1.0 - smoothstep(0.10, 0.55, uCloudCoverage);
        float sunScatter = pow(sunCos, 5.0) * (0.44 + clearSunBoost * 0.18) + pow(sunCos, 36.0) * (0.50 + clearSunBoost * 0.35);
        float sunDisc = smoothstep(0.9993, 0.99985, sunCos) * (1.0 - smoothstep(0.45, 0.92, uCloudCoverage));
        sky += uSunColor * (sunScatter * (1.0 - uCloudCoverage * 0.48) + sunDisc * (4.2 + clearSunBoost * 2.0)) * (1.0 - uNightFactor * 0.92);

        vec3 aurora = renderAurora(rd);

        // Fast 4-step 3D Volumetric-Shaded Icelandic Storm Clouds (~6x faster, identical dramatic rolling storm billows!)
        float totalAlpha = 0.0;
        vec3 finalCloud = vec3(0.0);
        if (rd.y > -0.02) {
          vec2 drift = uWindDir * (uTime * 0.007 + uCloudFlowDist * 0.0024);
          vec2 sunStep = normalize(vec2(uSunDir.x + 0.55, uSunDir.z - 0.10)) * 0.24;

          float accumTrans = 1.0;
          vec3 accumLight = vec3(0.0);

          float upperLeftStorm = (1.0 - smoothstep(-0.45, 0.42, rd.x * 0.85 - rd.y * 0.16)) * smoothstep(0.03, 0.20, rd.y);
          float rightSilverBreak = smoothstep(-0.14, 0.56, rd.x * 0.85 - rd.z * 0.22 + (sunCos - 0.12) * 0.48);

          // Shared macro domain warp computed once per sky pixel instead of per slab
          vec2 baseUv = rd.xz * (1.0 / (max(rd.y, 0.025) + 0.24)) * 0.88;
          vec2 sharedWarp = vec2(
            (cloudFbm(baseUv * 0.68 + drift * 0.7) - 0.5) * 1.55,
            (cloudFbm(baseUv * 0.68 + vec2(4.7, 3.2) + drift * 0.7) - 0.5) * 1.55
          );

          int cloudSteps = uCloudSteps < 2.5 ? 2 : 4;
          for (int i = 0; i < 4; i++) {
            if (i >= cloudSteps) break;
            float fi = cloudSteps == 2 ? float(i) : float(i) / 3.0;
            float hSlab = mix(0.68, 1.55, fi);
            vec2 pUv = baseUv * hSlab + drift * mix(1.4, 0.6, fi);
            vec2 w = sharedWarp * mix(1.0, 0.72, fi);

            float nMacro = cloudFbm(pUv * 1.05 + w);
            float nPuff  = gnoise(pUv * 2.75 - w * 0.45 + vec2(6.4, -2.8));

            float billow = clamp((nMacro - 0.5) * 2.6 + 0.5, 0.0, 1.0) * 0.72 +
                           clamp((nPuff  - 0.5) * 2.2 + 0.5, 0.0, 1.0) * 0.28;
            float rawField = billow + upperLeftStorm * 0.22 * (1.0 - fi * 0.65) * uCloudDarkness;

            // Clear days (low coverage) keep wide blue sky with a few crisp scattered white cumulus clouds!
            float thresh = mix(0.74, 0.24, uCloudCoverage);
            float dens = smoothstep(thresh, thresh + mix(0.22, 0.42, uCloudCoverage), rawField);

            if (dens > 0.01) {
              float dLitRaw = cloudFbm((pUv + sunStep * (1.1 + fi)) * 1.05 + w);
              float dLit = clamp((dLitRaw - 0.5) * 2.6 + 0.5, 0.0, 1.0);
              float shadowDens = smoothstep(thresh, thresh + 0.38, dLit);

              float heightLit = mix(0.14, 1.0, pow(fi, 0.78));
              float beer = exp(-shadowDens * (1.35 + 1.55 * uCloudDarkness)) * heightLit;
              float edgeRim = clamp((billow - dLit) * 2.2 + 0.25, 0.0, 1.0);

              // Fair-weather sunlit white cumulus with soft sky-blue shaded undersides vs moody dark Icelandic storm clouds
              vec3 darkBelly = mix(vec3(0.42, 0.52, 0.66), vec3(0.036, 0.046, 0.056), smoothstep(0.12, 0.75, uCloudDarkness));
              vec3 midStorm  = mix(vec3(0.74, 0.80, 0.88), vec3(0.24,  0.29,  0.34),  smoothstep(0.12, 0.75, uCloudDarkness));
              vec3 silverLit = mix(vec3(1.00, 0.97, 0.91), vec3(0.92,  0.95,  0.98),  smoothstep(0.12, 0.75, uCloudDarkness));

              float bellyCore = smoothstep(0.42, 0.85, billow) * (1.0 - fi * 0.72) * uCloudDarkness;
              vec3 stepCol = mix(midStorm, darkBelly, clamp(bellyCore * 0.92 + (1.0 - beer) * mix(0.24, 0.48, uCloudDarkness), 0.0, 1.0));
              float silverAmt = clamp(
                rightSilverBreak * (0.28 + 0.72 * fi) * (1.0 - bellyCore * 0.78) +
                pow(beer, 1.20) * mix(0.84, 0.58, uCloudDarkness) +
                edgeRim * 0.26 * (1.0 - bellyCore * 0.6),
                0.0,
                1.0
              );
              stepCol = mix(stepCol, silverLit, silverAmt);
              stepCol *= mix(uSunColor * 1.06, mix(vec3(0.88, 0.92, 0.96), uSunColor * 1.12, 0.45), smoothstep(0.15, 0.75, uCloudDarkness));

              vec3 nightStep = mix(vec3(0.012, 0.018, 0.026), vec3(0.056, 0.074, 0.102), clamp(beer * 1.1 + rightSilverBreak * 0.3, 0.0, 1.0));
              nightStep += aurora * 0.24;
              stepCol = mix(stepCol, nightStep, uNightFactor);
              stepCol += vec3(0.68, 0.80, 1.0) * uLightning * (0.35 + 0.65 * beer);

              float stepAlpha = dens * mix(0.56, 0.42, fi) * clamp(0.45 + uCloudCoverage * 0.65, 0.0, 1.0);
              accumLight += accumTrans * stepCol * stepAlpha;
              accumTrans *= (1.0 - stepAlpha);
              if (accumTrans < 0.03) break;
            }
          }

          totalAlpha = clamp((1.0 - accumTrans) * smoothstep(-0.02, 0.055, rd.y), 0.0, 0.98);
          finalCloud = accumLight / max(1.0 - accumTrans, 0.001);
        }

        // Night Milky Way Galaxy & rotating Icelandic starfield (skipped when occluded by opaque storm clouds!)
        if (uNightFactor >= 0.08 && totalAlpha < 0.95) {
          vec3 celDir = toIcelandCelestial(rd);
          vec3 nightSky = renderMilkyWay(celDir, rd.y) + renderStars(celDir, rd.y);
          float moonCos = max(dot(rd, uMoonDir), 0.0);
          float moonDisc = smoothstep(0.99945, 0.9998, moonCos) * uNightFactor;
          float moonHalo = (pow(moonCos, 38.0) * 0.17 + pow(moonCos, 9.0) * 0.022) * uNightFactor;
          nightSky += vec3(0.75, 0.86, 1.0) * (moonDisc * 2.5 + moonHalo) * (1.0 - uCloudCoverage * 0.72);
          sky += nightSky;
        }

        if (rd.y > -0.02) {
          sky += aurora * (1.0 - totalAlpha * 0.72);
          sky = mix(sky, finalCloud, totalAlpha);
        } else {
          sky += aurora;
        }

        // Seamless luminous overcast sky horizon (decoupled from darker terrain aerial-perspective haze!)
        float horizonBand = 1.0 - smoothstep(-0.02, 0.075, rd.y);
        sky = mix(sky, uSkyHorizon, horizonBand);

        // Physically accurate antisolar primary (~42 deg) & subtle secondary (~51 deg) rainbow when sun & moisture align
        float sunBowVis = smoothstep(0.01, 0.09, uSunDir.y) * (1.0 - smoothstep(0.58, 0.72, uSunDir.y));
        float moistVis = smoothstep(0.10, 0.30, uRainWetness + uCloudCoverage * 0.45) * (1.0 - smoothstep(0.88, 0.99, uCloudDarkness));
        float bowVis = sunBowVis * moistVis * (1.0 - uNightFactor);
        if (bowVis > 0.02 && rd.y > 0.0) {
          vec3 antiSun = normalize(-uSunDir);
          float ang = acos(clamp(dot(rd, antiSun), -1.0, 1.0));
          float horizFade = smoothstep(0.0, 0.055, rd.y);

          // Primary bow (40.1 deg inner violet -> 42.5 deg outer red)
          float bowT1 = (ang - 0.700) / 0.042;
          float bowD1 = (bowT1 - 0.5) * 2.85;
          float bowMask1 = exp(-(bowD1 * bowD1));
          vec3 spec1 = vec3(
            smoothstep(0.42, 0.85, bowT1) * (1.0 - smoothstep(0.88, 1.08, bowT1)),
            smoothstep(0.20, 0.50, bowT1) * (1.0 - smoothstep(0.58, 0.88, bowT1)),
            smoothstep(-0.04, 0.22, bowT1) * (1.0 - smoothstep(0.30, 0.58, bowT1))
          );
          spec1 += vec3(0.22, 0.05, 0.32) * exp(-pow((bowT1 - 0.08) * 5.0, 2.0)); // Inner violet

          // Faint secondary bow (50.5 deg outer red -> 53.5 deg inner violet, reversed order)
          float bowT2 = 1.0 - (ang - 0.881) / 0.052;
          float bowD2 = (bowT2 - 0.5) * 2.85;
          float bowMask2 = exp(-(bowD2 * bowD2)) * 0.32;
          vec3 spec2 = vec3(
            smoothstep(0.42, 0.85, bowT2) * (1.0 - smoothstep(0.88, 1.08, bowT2)),
            smoothstep(0.20, 0.50, bowT2) * (1.0 - smoothstep(0.58, 0.88, bowT2)),
            smoothstep(-0.04, 0.22, bowT2) * (1.0 - smoothstep(0.30, 0.58, bowT2))
          );

          vec3 rainbowCol = (spec1 * bowMask1 + spec2 * bowMask2) * mix(vec3(1.0), uSunColor, 0.45);
          sky += rainbowCol * bowVis * horizFade * 0.26;
        }

        // Apply the EXACT SAME flowing 3D volumetric atmospheric cloud-fog to the sky dome
        // so distant mountain ridges dissolve organically into heavy rain & storm skies (zero paper-cutout border!)
        if (rd.y > -0.06) {
          float skyFogDist = min(1650.0, 440.0 / max(rd.y, 0.05));
          vec3 skyFogPos = cameraPosition + rd * skyFogDist;
          // 100% seamless match across all mountain elevations, smoothly fading overhead above the mist layer
          float skyFogWeight = (1.0 - smoothstep(0.28, 0.72, rd.y)) * smoothstep(0.10, 0.65, uCloudCoverage + uRainWetness * 0.5);
          if (skyFogWeight > 0.005) {
            vec3 foggedSky = applyIcelandAtmo(sky, skyFogPos);
            sky = mix(sky, foggedSky, skyFogWeight);
          }
        }

        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const mesh = new THREE.Mesh(skyGeo, skyMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, material: skyMat };
}

/**
 * Full 24h Day/Night, Stochastic Aurora Borealis & Weather Lighting Controller.
 */
export function createEnvironmentController(scene, renderer, skyDome) {
  const sunLight = new THREE.DirectionalLight(0xe4eaf0, 1.85);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 360;
  const shadowHalf = 68;
  sunLight.shadow.camera.left = -shadowHalf;
  sunLight.shadow.camera.right = shadowHalf;
  sunLight.shadow.camera.top = shadowHalf;
  sunLight.shadow.camera.bottom = -shadowHalf;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.032;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Crisp cool overcast sky hemisphere vs very dark earthy ground bounce for dramatic crevice depth
  const hemiLight = new THREE.HemisphereLight(0x96a6b2, 0x101508, 0.88);
  scene.add(hemiLight);

  const auroraBounceLight = new THREE.HemisphereLight(0x18e080, 0x0e1824, 0.0);
  scene.add(auroraBounceLight);

  // Throttled PMREM generator using a tiny mirror sky sphere
  const pmremGen = new THREE.PMREMGenerator(renderer);
  pmremGen.compileEquirectangularShader();
  const iblScene = new THREE.Scene();
  const iblMat = skyDome.material.clone();
  const iblSphere = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), iblMat);
  iblScene.add(iblSphere);
  let currentEnvRT = null;
  let lastEnvUpdate = -99;
  let lastEnvStateKey = '';

  let lastShadowX = 1e9;
  let lastShadowZ = 1e9;
  const lastShadowDir = new THREE.Vector3(0, 1, 0);
  let shadowJob = null;
  const SHADOW_STEPS = [120, 240, 360, 480, 620, 780, 960, 1180, 1440, 1750];

  function updateTerrainShadowMap(playerPos, keyDir) {
    const res = SHADOW_MAP_RES;
    const half = SHADOW_MAP_HALF;
    const snap = 240.0;
    const sx = Math.round(playerPos.x / snap) * snap;
    const sz = Math.round(playerPos.z / snap) * snap;
    const isInit = lastShadowX > 1e8;
    const dirDot = keyDir.x * lastShadowDir.x + keyDir.y * lastShadowDir.y + keyDir.z * lastShadowDir.z;

    const isSwitch = isInit || dirDot < 0.5;
    if (!shadowJob && (isSwitch || Math.hypot(playerPos.x - lastShadowX, playerPos.z - lastShadowZ) > 320.0 || dirDot < 0.996)) {
      lastShadowX = sx;
      lastShadowZ = sz;
      lastShadowDir.copy(keyDir);
      const horizLen = Math.hypot(keyDir.x, keyDir.z);
      const dx = horizLen > 1e-4 ? keyDir.x / horizLen : 0.0;
      const dz = horizLen > 1e-4 ? keyDir.z / horizLen : 0.0;
      const tanElev = Math.max(keyDir.y, 0.045) / Math.max(horizLen, 0.045);
      shadowJob = { sx, sz, dx, dz, tanElev, iz: 0, sync: isSwitch };
    }
    if (!shadowJob) return;

    const rowsBudget = shadowJob.sync ? res : 10;
    const endIz = Math.min(res - 1, shadowJob.iz + rowsBudget - 1);
    const stepSize = (half * 2.0) / res;
    const minX = shadowJob.sx - half;
    const minZ = shadowJob.sz - half;

    for (let iz = shadowJob.iz; iz <= endIz; iz++) {
      const wz = minZ + (iz + 0.5) * stepSize;
      const row = iz * res;
      for (let ix = 0; ix < res; ix++) {
        const wx = minX + (ix + 0.5) * stepSize;
        let maxCeilY = -20.0;
        for (let s = 0; s < SHADOW_STEPS.length; s++) {
          const d = SHADOW_STEPS[s];
          const mh = getTerrainHeight(wx + shadowJob.dx * d, wz + shadowJob.dz * d);
          const ceilY = mh - d * shadowJob.tanElev;
          if (ceilY > maxCeilY) maxCeilY = ceilY;
        }
        const enc = Math.round(clamp((maxCeilY + 20.0) / 400.0, 0.0, 1.0) * 255.0);
        const pIdx = (row + ix) * 4;
        _terrainShadowPixels[pIdx] = enc;
        _terrainShadowPixels[pIdx + 1] = enc;
        _terrainShadowPixels[pIdx + 2] = enc;
        _terrainShadowPixels[pIdx + 3] = 255;
      }
    }

    shadowJob.iz = endIz + 1;
    if (shadowJob.iz >= res) {
      _terrainShadowTex.needsUpdate = true;
      ATMO_UNIFORMS.uTerrainShadowRect.value.set(shadowJob.sx, shadowJob.sz, 1.0 / half, 1.0);
      shadowJob = null;
    }
  }

  // Signature real-world geomagnetic storm morphologies:
  // [foldCurl, coronaExpansion, n2Ionization, crimsonCrown]
  const AURORA_REGIMES = {
    drapery: [0.88, 0.22, 0.34, 0.24], // Classic Icelandic 557.7nm emerald S-folded draperies with subtle rose fold-accents
    corona:  [0.76, 0.96, 0.58, 0.52], // Substorm breakup sweeping overhead into a 360-deg magnetic-zenith Corona
    crimson: [0.72, 0.44, 0.64, 1.00], // G4/G5 solar storm with towering 630nm scarlet pillars, gold overlap & magenta hems
    glacial: [0.34, 0.32, 0.96, 0.16]  // Homogeneous & picket-fence arcs in 428nm cyan-turquoise, cobalt-violet & STEVE
  };
  const AURORA_REGIME_KEYS = ['drapery', 'corona', 'crimson', 'glacial'];

  const state = {
    timeOfDay: 13.4,
    timeSpeed: 60.0, // Default: 1 real second = 1 game minute (60 game seconds / real second!)
    weather: 'overcast',
    autoWeather: true,
    weatherTimer: 65,
    manualWeatherBlend: 0.0,
    auroraMode: 'auto',
    auroraWave: 0.0,
    auroraCooldown: 6.0,
    auroraWaveAge: 0.0,
    auroraWaveDuration: 28.0,
    auroraPhaseIdx: 0,
    auroraWaveProfile: [0.80, 0.32, 0.60, 0.46],
    lightningFlash: 0.0,
    lightningTimer: 8.0
  };

  // Meteorologically reasonable Markov weather transition graph (no abrupt clear <-> storm jumps!)
  const WEATHER_TRANSITIONS = {
    clear:    [['clearing', 0.72], ['clear', 0.28]],
    clearing: [['overcast', 0.58], ['clear', 0.42]],
    overcast: [['rain', 0.46], ['clearing', 0.34], ['overcast', 0.20]],
    rain:     [['overcast', 0.44], ['storm', 0.36], ['rain', 0.20]],
    storm:    [['rain', 0.78], ['overcast', 0.22]]
  };

  const curWx = { ...WEATHER_PRESETS.overcast };

  const _sunCol = new THREE.Color();
  const _zenithCol = new THREE.Color();
  const _horizonCol = new THREE.Color();
  const _fogCol = new THREE.Color();
  const _fogLowCol = new THREE.Color();
  const _hemiSky = new THREE.Color();
  const _hemiGnd = new THREE.Color();
  const _cA = new THREE.Color();
  const _cB = new THREE.Color();

  function setTimeOfDay(hours) {
    state.timeOfDay = ((hours % 24) + 24) % 24;
  }

  function setWeather(presetName) {
    if (WEATHER_PRESETS[presetName]) {
      state.weather = presetName;
      // Keep user-selected weather active for ~1.5-2.5 real minutes before natural weather drift resumes
      state.weatherTimer = 95 + Math.random() * 55;
      state.manualWeatherBlend = 3.5;
    }
  }

  function pickRandomAuroraProfile() {
    const baseKey = AURORA_REGIME_KEYS[Math.floor(Math.random() * AURORA_REGIME_KEYS.length)];
    const b = AURORA_REGIMES[baseKey];
    state.auroraWaveProfile = [
      clamp(b[0] + (Math.random() - 0.5) * 0.24, 0.18, 1.0),
      clamp(b[1] + (Math.random() - 0.5) * 0.28, 0.08, 1.0),
      clamp(b[2] + (Math.random() - 0.5) * 0.24, 0.12, 1.0),
      clamp(b[3] + (Math.random() - 0.5) * 0.26, 0.12, 1.0)
    ];
  }

  function setAuroraMode(mode) {
    state.auroraMode = mode;
    if (mode === 'off') {
      state.auroraWave = 0.0;
    } else if (mode !== 'auto') {
      state.auroraWave = 1.0;
      if (AURORA_REGIMES[mode]) {
        const r = AURORA_REGIMES[mode];
        ATMO_UNIFORMS.uAuroraProfile.value.set(r[0], r[1], r[2], r[3]);
      }
    }
  }

  function stepAuroraPhase() {
    state.auroraPhaseIdx = (state.auroraPhaseIdx + 1) % AURORA_REGIME_KEYS.length;
    ATMO_UNIFORMS.uAuroraTime.value += 19.5;
    const r = AURORA_REGIMES[AURORA_REGIME_KEYS[state.auroraPhaseIdx]];
    ATMO_UNIFORMS.uAuroraProfile.value.set(r[0], r[1], r[2], r[3]);
  }

  function triggerAuroraBurst() {
    state.auroraMode = 'auto';
    state.auroraWaveAge = 0.01;
    state.auroraWaveDuration = 42.0;
    state.auroraWave = 1.0;
    pickRandomAuroraProfile();
  }

  function update(dt, playerPos) {
    ATMO_UNIFORMS.uTime.value += dt;
    ATMO_UNIFORMS.uPlayerPos.value.copy(playerPos);

    if (state.timeSpeed > 0) {
      // Exact real-to-game time scaling: timeSpeed = 60 -> 60 game seconds (1 game minute) per 1 real second!
      state.timeOfDay = (state.timeOfDay + (dt * state.timeSpeed) / 3600.0) % 24.0;
    }

    if (state.autoWeather) {
      state.weatherTimer -= dt;
      if (state.weatherTimer <= 0) {
        const table = WEATHER_TRANSITIONS[state.weather] || WEATHER_TRANSITIONS.overcast;
        let roll = Math.random();
        let nextWx = table[0][0];
        for (let i = 0; i < table.length; i++) {
          roll -= table[i][1];
          if (roll <= 0) {
            nextWx = table[i][0];
            break;
          }
        }
        state.weather = nextWx;
        // Reasonable Icelandic weather dwell time (45-95 real seconds = ~45-95 game minutes per phase)
        state.weatherTimer = nextWx === 'storm' ? (40 + Math.random() * 40) : (55 + Math.random() * 55);
      }
    }

    const targetWx = WEATHER_PRESETS[state.weather] || WEATHER_PRESETS.overcast;
    state.manualWeatherBlend = Math.max(0, state.manualWeatherBlend - dt);
    const blendRate = state.manualWeatherBlend > 0 ? 1.05 : 0.25;
    const blend = 1.0 - Math.exp(-dt * blendRate);
    for (const k of Object.keys(curWx)) {
      if (typeof curWx[k] === 'number') {
        curWx[k] = mix(curWx[k], targetWx[k], blend);
      }
    }

    // Real sidereal Earth rotation angle (full 2PI rotation per 24 game hours around Iceland's North Celestial Pole!)
    ATMO_UNIFORMS.uSiderealAngle.value = (state.timeOfDay / 24.0) * Math.PI * 2.0;

    const dayAngle = ((state.timeOfDay - 6.0) / 24.0) * Math.PI * 2.0;
    const sunElev = Math.sin(dayAngle) * 0.64 - 0.03;
    const sunAzim = 0.78 + Math.cos(dayAngle) * 0.52;
    const cosEl = Math.cos(sunElev);
    ATMO_UNIFORMS.uSunDir.value.set(
      Math.sin(sunAzim) * cosEl,
      Math.sin(sunElev),
      -Math.cos(sunAzim) * cosEl
    ).normalize();

    const moonElev = clamp(-sunElev * 0.65 + 0.32, 0.14, 0.62);
    const moonAzim = sunAzim - 2.35;
    ATMO_UNIFORMS.uMoonDir.value.set(
      Math.sin(moonAzim) * Math.cos(moonElev),
      Math.sin(moonElev),
      -Math.cos(moonAzim) * Math.cos(moonElev)
    ).normalize();

    const nightFactor = smoothstep(0.08, -0.18, sunElev);
    const twilightFactor = smoothstep(0.24, 0.04, sunElev) * (1.0 - smoothstep(-0.04, -0.22, sunElev));
    ATMO_UNIFORMS.uNightFactor.value = nightFactor;

    const isFixedPreset = Boolean(AURORA_REGIMES[state.auroraMode]);
    if (state.auroraMode === 'on' || isFixedPreset) {
      state.auroraWave = mix(state.auroraWave, 1.0, 1.0 - Math.exp(-dt * 2.5));
    } else if (state.auroraMode === 'off') {
      state.auroraWave = mix(state.auroraWave, 0.0, 1.0 - Math.exp(-dt * 2.5));
    } else {
      if (nightFactor > 0.35) {
        if (state.auroraWaveAge > 0) {
          state.auroraWaveAge += dt;
          const p = state.auroraWaveAge / state.auroraWaveDuration;
          state.auroraWave = Math.sin(clamp(p, 0, 1) * Math.PI);
          if (p >= 1.0) {
            state.auroraWaveAge = 0;
            state.auroraWave = 0;
            state.auroraCooldown = 12 + Math.random() * 25;
          }
        } else {
          state.auroraCooldown -= dt;
          if (state.auroraCooldown <= 0) {
            if (Math.random() < 0.72) {
              state.auroraWaveAge = 0.01;
              state.auroraWaveDuration = 28 + Math.random() * 24;
              pickRandomAuroraProfile();
            } else {
              state.auroraCooldown = 14 + Math.random() * 18;
            }
          }
        }
      } else {
        state.auroraWave = mix(state.auroraWave, 0.0, 1.0 - Math.exp(-dt * 2.0));
      }
    }

    const auroraIntensity = state.auroraWave * smoothstep(0.20, 0.75, nightFactor);
    ATMO_UNIFORMS.uAuroraStrength.value = auroraIntensity;
    ATMO_UNIFORMS.uAuroraTime.value += dt * (0.85 + curWx.windStrength * 0.4);

    // Evolve geomagnetic storm shape & color profile smoothly across distinct real-world regimes
    const tAur = ATMO_UNIFORMS.uAuroraTime.value;
    let tgtFold = 0.78, tgtCorona = 0.34, tgtIon = 0.58, tgtCrimson = 0.46;
    if (isFixedPreset) {
      const r = AURORA_REGIMES[state.auroraMode];
      tgtFold = clamp(r[0] + 0.08 * Math.sin(tAur * 0.07), 0.12, 1.0);
      tgtCorona = clamp(r[1] + 0.07 * Math.cos(tAur * 0.05), 0.05, 1.0);
      tgtIon = clamp(r[2] + 0.08 * Math.sin(tAur * 0.06 + 1.1), 0.08, 1.0);
      tgtCrimson = clamp(r[3] + 0.08 * Math.cos(tAur * 0.055 + 2.0), 0.08, 1.0);
    } else if (state.auroraMode === 'on') {
      // Smooth continuous tour across all 4 geomagnetic morphologies (drapery -> corona -> crimson storm -> cyan-violet)
      const cyc = ((tAur * 0.042 + state.auroraPhaseIdx) % 4.0 + 4.0) % 4.0;
      const idx0 = Math.floor(cyc);
      const idx1 = (idx0 + 1) % 4;
      const f = smoothstep(0.15, 0.85, cyc - idx0);
      const r0 = AURORA_REGIMES[AURORA_REGIME_KEYS[idx0]];
      const r1 = AURORA_REGIMES[AURORA_REGIME_KEYS[idx1]];
      tgtFold = mix(r0[0], r1[0], f);
      tgtCorona = mix(r0[1], r1[1], f);
      tgtIon = mix(r0[2], r1[2], f);
      tgtCrimson = mix(r0[3], r1[3], f);
    } else {
      // Stochastic substorm lifecycle: quiet arc onset -> folded/coronal peak -> pulsating recovery
      const subP = state.auroraWaveDuration > 0 ? clamp(state.auroraWaveAge / state.auroraWaveDuration, 0.0, 1.0) : 0.5;
      const breakup = Math.sin(subP * Math.PI);
      const wp = state.auroraWaveProfile;
      tgtFold = mix(0.26, wp[0], breakup);
      tgtCorona = wp[1] * Math.pow(breakup, 1.3);
      tgtIon = mix(0.28, wp[2], breakup);
      tgtCrimson = mix(0.20, wp[3], breakup);
    }
    const profLerp = 1.0 - Math.exp(-dt * 1.6);
    const ap = ATMO_UNIFORMS.uAuroraProfile.value;
    ap.set(
      mix(ap.x, tgtFold, profLerp),
      mix(ap.y, tgtCorona, profLerp),
      mix(ap.z, tgtIon, profLerp),
      mix(ap.w, tgtCrimson, profLerp)
    );

    // Couple ground bounce light, mist, and water tint to live spectroscopic aurora palette
    _cA.setRGB(0.10, 0.92, 0.48); // 557.7nm oxygen emerald base
    _cB.setRGB(0.18, 0.72, 0.94); // 427.8nm ionized cyan-violet shift
    _cA.lerp(_cB, ap.z * 0.42);
    _cB.setRGB(0.76, 0.24, 0.48); // 630nm crimson + N2 magenta storm shift
    _cA.lerp(_cB, ap.w * 0.30);
    ATMO_UNIFORMS.uAuroraTint.value.copy(_cA);

    if (state.weather === 'storm') {
      state.lightningTimer -= dt;
      if (state.lightningTimer <= 0) {
        state.lightningFlash = 0.85 + Math.random() * 0.45;
        state.lightningTimer = 4.5 + Math.random() * 9.0;
      }
    }
    state.lightningFlash *= Math.exp(-dt * 9.0);
    ATMO_UNIFORMS.uLightning.value = state.lightningFlash;

    const overcastFrac = smoothstep(0.25, 0.88, curWx.cloudCoverage);

    // Clear crisp Nordic Azure Blue Sky vs Moody Storm Icelandic Overcast
    _cA.setRGB(0.048, 0.22, 0.72); // Rich bright azure clear zenith
    _cB.setRGB(0.11, 0.14, 0.18);   // Moody storm zenith
    _zenithCol.copy(_cA).lerp(_cB, overcastFrac);

    _cA.setRGB(0.22, 0.50, 0.90);   // Crisp vibrant sky-blue clear horizon
    _cB.setRGB(0.58, 0.63, 0.67);   // Luminous overcast silver horizon
    _horizonCol.copy(_cA).lerp(_cB, overcastFrac);

    // Dusk / Dawn Nordic amber-rose wash
    _cA.setRGB(0.22, 0.23, 0.34);
    _zenithCol.lerp(_cA, twilightFactor * 0.65);
    _cA.setRGB(0.86, 0.56, 0.36);
    _horizonCol.lerp(_cA, twilightFactor * (1.0 - overcastFrac * 0.55) * 0.72);

    // Deep Arctic starry night
    _cA.setRGB(0.014, 0.024, 0.045);
    _zenithCol.lerp(_cA, nightFactor);
    _cA.setRGB(0.040, 0.060, 0.090);
    _horizonCol.lerp(_cA, nightFactor);

    // Natural humid Icelandic misty blue-grey aerial perspective (crisp blue sky haze on clear days!)
    _cA.setRGB(0.18, 0.36, 0.62); // Crisp Nordic clear-air azure haze
    _cB.setRGB(0.25, 0.30, 0.34); // Humid overcast Icelandic blue-grey mist
    _fogCol.copy(_cA).lerp(_cB, overcastFrac);
    _fogCol.lerp(_cA.setRGB(0.46, 0.33, 0.26), twilightFactor * 0.55);
    _fogCol.lerp(_cA.setRGB(0.014, 0.022, 0.036), nightFactor);

    _fogLowCol.copy(_fogCol).multiplyScalar(1.24);
    if (nightFactor > 0.01) {
      _fogLowCol.lerp(_cA.setRGB(0.018, 0.028, 0.044), nightFactor);
    }

    ATMO_UNIFORMS.uSkyZenith.value.copy(_zenithCol);
    ATMO_UNIFORMS.uSkyHorizon.value.copy(_horizonCol);
    ATMO_UNIFORMS.uFogColor.value.copy(_fogCol);
    ATMO_UNIFORMS.uFogLowColor.value.copy(_fogLowCol);
    ATMO_UNIFORMS.uFogDensity.value = curWx.fogDensity;
    ATMO_UNIFORMS.uFogLowDensity.value = curWx.fogLowDensity;
    ATMO_UNIFORMS.uCloudCoverage.value = curWx.cloudCoverage;
    ATMO_UNIFORMS.uCloudDarkness.value = curWx.cloudDarkness;
    ATMO_UNIFORMS.uRainWetness.value = curWx.wetness;
    // Dynamic long-lasting storm squall gusts layered gently over base weather windStrength
    const tWind = ATMO_UNIFORMS.uTime.value;
    const stormBoost = smoothstep(0.75, 1.0, curWx.rainIntensity) * (0.14 + 0.20 * (0.5 + 0.5 * Math.sin(tWind * 0.32 + Math.sin(tWind * 0.14) * 1.4)));
    ATMO_UNIFORMS.uWindStrength.value = curWx.windStrength + stormBoost;
    const windS = ATMO_UNIFORMS.uWindStrength.value;
    const stormSurge = Math.max(0, windS - 1.0);
    ATMO_UNIFORMS.uWindTime.value += dt * (0.85 + windS * 0.72 + stormSurge * 0.65);
    ATMO_UNIFORMS.uCloudFlowDist.value += dt * (2.6 + windS * 4.6 + stormSurge * stormSurge * 8.5);

    // Directional key light: WARMER bright sunlight on clear days -> cool silver overcast -> amber dusk -> pale arctic moon
    _cA.setRGB(1.0, 0.92, 0.78); // Bright warm clear-day sun
    _cB.setRGB(0.95, 0.97, 1.0); // Cool silver overcast diffuse light
    _sunCol.copy(_cA).lerp(_cB, overcastFrac);
    _sunCol.lerp(_cA.setRGB(1.0, 0.62, 0.34), twilightFactor * 0.85);
    _sunCol.lerp(_cA.setRGB(0.50, 0.65, 0.88), nightFactor);
    ATMO_UNIFORMS.uSunColor.value.copy(_sunCol);

    const keyDir = nightFactor > 0.5 ? ATMO_UNIFORMS.uMoonDir.value : ATMO_UNIFORMS.uSunDir.value;
    const keyElev = Math.max(keyDir.y, 0.16);
    const texelSize = (shadowHalf * 2) / 1024;
    const snapX = Math.round(playerPos.x / texelSize) * texelSize;
    const snapZ = Math.round(playerPos.z / texelSize) * texelSize;

    sunLight.target.position.set(snapX, playerPos.y, snapZ);
    sunLight.position.set(
      snapX + keyDir.x * 180,
      playerPos.y + keyElev * 180,
      snapZ + keyDir.z * 180
    );
    sunLight.color.copy(_sunCol);

    const dayKeyInt = (2.35 - overcastFrac * 0.82) * curWx.sunGain * (1.0 - nightFactor * 0.92);
    const nightKeyInt = 0.26 * nightFactor;
    sunLight.intensity = dayKeyInt + nightKeyInt + state.lightningFlash * 1.6;

    // Soft overcast Nordic sky fill + natural warm-olive ground bounce (eliminates harsh pitch-black shadow spots!)
    _hemiSky.copy(_horizonCol).lerp(new THREE.Color(0.88, 0.92, 0.96), (1.0 - nightFactor) * 0.48);
    _hemiGnd.setRGB(0.16, 0.19, 0.10).lerp(new THREE.Color(0.022, 0.028, 0.036), nightFactor);
    hemiLight.color.copy(_hemiSky);
    hemiLight.groundColor.copy(_hemiGnd);
    hemiLight.intensity = mix(1.12 * curWx.ambientGain, 0.30, nightFactor) + state.lightningFlash * 0.8;

    auroraBounceLight.color.copy(ATMO_UNIFORMS.uAuroraTint.value);
    auroraBounceLight.intensity = auroraIntensity * 0.24;

    skyDome.mesh.position.copy(playerPos);

    updateTerrainShadowMap(playerPos, keyDir);

    // Throttled PMREM environment bake for PBR wet basalt & metal (only rebake when sky/weather state actually changes!)
    const envKey = `${Math.round(state.timeOfDay * 6)}_${state.weather}_${Math.round(auroraIntensity * 4)}_${Math.round(ap.z * 2)}_${Math.round(ap.w * 2)}`;
    const now = ATMO_UNIFORMS.uTime.value;
    if (envKey !== lastEnvStateKey && (now - lastEnvUpdate > 2.5 || lastEnvStateKey === '')) {
      lastEnvUpdate = now;
      lastEnvStateKey = envKey;
      for (const u of Object.keys(iblMat.uniforms)) {
        if (ATMO_UNIFORMS[u]) {
          iblMat.uniforms[u].value = ATMO_UNIFORMS[u].value;
        }
      }
      const nextRT = pmremGen.fromScene(iblScene, 0.035);
      if (currentEnvRT) currentEnvRT.dispose();
      currentEnvRT = nextRT;
      scene.environment = currentEnvRT.texture;
      scene.environmentIntensity = mix(0.62, 0.42, nightFactor);
    }
  }

  return {
    state,
    curWx,
    sunLight,
    hemiLight,
    setTimeOfDay,
    setWeather,
    setAuroraMode,
    stepAuroraPhase,
    triggerAuroraBurst,
    update
  };
}
