/**
 * Icelandic Volumetric-Style Storm Sky Dome, Multi-Layer Nimbostratus Clouds,
 * 3D Ray-Marched Aurora Borealis, Stratified Aerial Perspective & Height Fog,
 * Weather Controller & Throttled PMREM IBL.
 */
import * as THREE from 'three';
import { clamp, mix, smoothstep } from './noise.js';

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
    fogDensity: 0.00235,
    fogLowDensity: 0.00310,
    rainIntensity: 1.0,
    wetness: 1.0,
    windStrength: 1.45,
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
    cloudCoverage: 0.14,
    cloudDarkness: 0.06,
    fogDensity: 0.00028,
    fogLowDensity: 0.00030,
    rainIntensity: 0.0,
    wetness: 0.04,
    windStrength: 0.24,
    sunGain: 1.38,
    ambientGain: 0.98
  }
};

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
  uRainWetness: { value: 0.42 },
  uNightFactor: { value: 0.0 },
  uAuroraStrength: { value: 0.0 },
  uAuroraTime: { value: 0.0 },
  uSiderealAngle: { value: 0.0 },
  uLightning: { value: 0.0 },
  uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  uWindStrength: { value: 0.55 },
  uScanOrigin: { value: new THREE.Vector3(0, 0, 0) },
  uScanRadius: { value: -10.0 },
  uScanStrength: { value: 0.0 },
  uPlayerPos: { value: new THREE.Vector3(-7.5, 22, 12.8) }
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
uniform float uLightning;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform vec3 uScanOrigin;
uniform float uScanRadius;
uniform float uScanStrength;

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

// Sample flowing 3D volumetric cloud-mist density at any world position (non-uniform billowing cloud banks that visibly drift!)
float sampleFlowingCloudFog(vec3 p) {
  vec2 flowMacro = uWindDir * (uTime * (2.6 + uWindStrength * 3.8));
  vec2 flowWisp  = uWindDir * (uTime * (4.6 + uWindStrength * 6.2));
  vec2 uvM = p.xz * 0.0022 - flowMacro * 0.0022;
  vec2 warp = vec2(
    atmoGNoise(uvM * 1.35 + vec2(3.1, -5.2)) - 0.5,
    atmoGNoise(uvM * 1.35 + vec2(-6.4, 2.7)) - 0.5
  ) * 0.95;

  // Macro cloud banks with genuine clear gaps between drifting mist patches!
  float bankMacro = atmoGNoise(uvM + warp + vec2(p.y * 0.0040, -p.y * 0.0032));
  float bankBillow = atmoGNoise(p.xz * 0.0056 - flowWisp * 0.0056 + warp * 1.15 + vec2(p.y * 0.011, 4.7));
  float bankFine = atmoGNoise(p.xz * 0.0140 - flowWisp * 0.0140 + vec2(-2.3, p.y * 0.017));
  float rawCloud = bankMacro * 0.50 + bankBillow * 0.35 + bankFine * 0.15;

  // Threshold shifts with weather humidity: separated drifting cloud patches in overcast -> lush rolling cloud sea with organic breaks in storm
  float thresh = mix(0.44, 0.30, clamp(uRainWetness * 0.85, 0.0, 1.0));
  float cloudShape = smoothstep(thresh, thresh + 0.42, rawCloud);

  // Two authentic Icelandic altitude cloud strata: flowing low valley mist sea + mountain-hugging orographic cloud belt!
  // Widen the mountain belt in heavy rain/storm so high peaks sit smoothly inside the storm cloud veil!
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
  if (dist < 20.0) return col;

  // Keep immediate foreground crisp, then integrate non-uniform flowing volumetric cloud-mist along the view ray!
  float fogDist = max(dist - 22.0, 0.0);
  float marchLen = min(dist, 1650.0);
  vec3 rayDir = toFrag / max(dist, 0.001);

  // 10-step smooth C2 ray-marched flowing volumetric cloud-fog (silky smooth across all distances & mountain slopes!)
  float cloudAccum = 0.0;
  float litAccum = 0.0;
  float stepLen = marchLen * 0.10;
  for (int i = 0; i < 10; i++) {
    float t = (float(i) + 0.5) * stepLen;
    vec3 p = cameraPosition + rayDir * t;
    float dCloud = sampleFlowingCloudFog(p);
    float hLit = smoothstep(14.0, 185.0, p.y) * 0.58 + dCloud * 0.42;
    cloudAccum += dCloud;
    litAccum += dCloud * hLit;
  }
  float avgCloud = cloudAccum * 0.10;
  float avgLit = litAccum / max(cloudAccum, 0.001);

  // Subtle clean atmospheric depth perspective (stronger in heavy storm so distant silhouettes truly melt into sky!)
  float stormAmt = smoothstep(0.55, 0.96, uCloudDarkness) * smoothstep(0.40, 1.0, uRainWetness);
  float baseAir = (1.0 - exp(-fogDist * uFogDensity * mix(0.36, 0.52, stormAmt))) * mix(0.44, 0.66, stormAmt);

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

  // Subtle emerald-teal mist tint when Aurora Borealis shines at night
  scatterCol += vec3(0.012, 0.048, 0.036) * uAuroraStrength * uNightFactor;

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
          // Sustained directional wind bend + long-lasting rolling gust waves (8-14s fronts!) + natural blade flutter
          float gustFront = 0.54 + 0.46 * sin(uTime * 0.46 - dot(wOrigin, uWindDir) * 0.042);
          float longSurge = 0.72 + 0.28 * sin(uTime * 0.21 - dot(wOrigin, uWindDir) * 0.016 + 1.4);
          float sustained = (0.30 + 0.44 * gustFront * longSurge) * uWindStrength;
          float flutter = sin(uTime * (2.0 + uWindStrength * 1.1) + instSeed) * (0.20 + 0.10 * gustFront);
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
        '#include <dithering_fragment>',
        /* glsl */`
        gl_FragColor.rgb += sampleOdradekScan(vLsWorldPos, normalize(vLsWorldNorm));
        gl_FragColor.rgb = applyIcelandAtmo(gl_FragColor.rgb, vLsWorldPos);
        #include <dithering_fragment>
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
  const skyGeo = new THREE.SphereGeometry(12000, 64, 40);
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

      // Photorealistic Milky Way Galaxy (golden-silver star clouds, Great Rift dark dust lanes & subtle nebulae!)
      vec3 renderMilkyWay(vec3 celDir, float elev) {
        if (uNightFactor < 0.08 || elev < -0.02) return vec3(0.0);
        // Real Galactic Plane tilted ~62.9 deg to Celestial Equator so the band arches dynamically over Iceland!
        vec3 galNorth = normalize(vec3(0.42, 0.45, 0.788));
        vec3 galCore  = normalize(vec3(-0.76, -0.28, 0.585));
        vec3 galEast = normalize(cross(galNorth, galCore));

        float gLat = dot(celDir, galNorth);
        float gLon = atan(dot(celDir, galEast), dot(celDir, galCore));

        float bandBroad = exp(-gLat * gLat * 14.0);
        float bandCore  = exp(-gLat * gLat * 42.0);
        if (bandBroad < 0.008) return vec3(0.0);

        // Seamless 2D galactic coordinates for star clouds & dark dust rifts
        vec2 gUv = vec2(gLon * 2.15, gLat * 7.2);
        vec2 w = vec2(
          cloudFbm(gUv * 0.75 + vec2(3.1, -1.7)) - 0.5,
          cloudFbm(gUv * 0.75 + vec2(-4.3, 2.9)) - 0.5
        );
        float starCloud = cloudFbm(gUv * 1.45 + w * 1.1);
        float fineDust  = cloudFbm(gUv * 3.8 - w * 0.8 + vec2(7.4, -2.2));

        // Iconic Great Rift dark dust lane splitting the Milky Way down the middle
        float riftD = (gLat + (w.y * 0.14)) * 9.5;
        float riftBand = exp(-(riftD * riftD));
        float riftMask = smoothstep(0.32, 0.74, cloudFbm(gUv * 2.1 + vec2(11.2, -5.4) + w * 0.9)) * riftBand;

        // Warm golden-amber Galactic Core bulge vs cool silvery-blue outer Milky Way arms
        float coreBulge = pow(clamp(dot(celDir, galCore) * 0.5 + 0.5, 0.0, 1.0), 3.4);
        vec3 outerArmCol = vec3(0.24, 0.34, 0.52);
        vec3 coreGoldCol = vec3(0.72, 0.58, 0.40);
        vec3 nebulaPink  = vec3(0.56, 0.24, 0.42);

        float nebulaKnots = smoothstep(0.64, 0.86, fineDust) * bandCore * (0.4 + 0.6 * coreBulge);
        vec3 galCol = mix(outerArmCol, coreGoldCol, coreBulge * 0.82);
        galCol = mix(galCol, nebulaPink, nebulaKnots * 0.38);

        float lum = (bandBroad * (0.28 + 0.85 * starCloud) + bandCore * (0.45 + 0.75 * fineDust) * (0.65 + 0.85 * coreBulge));
        lum *= (1.0 - riftMask * 0.76);

        // Dense fine unresolved galactic star shimmer sprinkled along the band
        vec3 gp = celDir * 360.0;
        vec3 gc = floor(gp);
        float gh = hash31(gc);
        float microStar = step(0.91, gh) * (1.0 - smoothstep(0.0, 0.28, length(fract(gp) - 0.5))) * bandCore * (1.0 - riftMask * 0.65);

        float horizFade = smoothstep(-0.01, 0.16, elev);
        float nightVis = smoothstep(0.14, 0.82, uNightFactor) * (1.0 - uCloudCoverage * 0.86);
        return (galCol * lum * 0.34 + vec3(0.86, 0.91, 1.0) * microStar * 0.72) * horizFade * nightVis;
      }

      vec3 renderStars(vec3 celDir, float elev) {
        if (uNightFactor < 0.08 || elev < 0.005) return vec3(0.0);
        vec3 p = celDir * 220.0;
        vec3 cell = floor(p);
        vec3 f = fract(p) - 0.5;
        float h = hash31(cell);
        vec3 acc = vec3(0.0);
        if (h >= 0.962) {
          float size = mix(0.10, 0.24, fract(h * 71.3));
          float d = length(f - (vec3(hash31(cell + 1.1), hash31(cell + 2.3), hash31(cell + 3.7)) - 0.5) * 0.45);
          float star = 1.0 - smoothstep(0.0, size, d);
          float twinkle = 0.68 + 0.32 * sin(uTime * (2.2 + h * 5.0) + h * 90.0);
          vec3 tint = mix(vec3(0.75, 0.86, 1.0), vec3(1.0, 0.90, 0.78), fract(h * 19.7));
          acc += tint * star * star * twinkle * 1.55;
        }
        // Subtle crisp Polaris (North Star) anchored at Iceland's North Celestial Pole!
        const vec3 NCP = vec3(0.0, 0.89994, -0.43601);
        float polCos = max(dot(celDir, NCP), 0.0);
        acc += vec3(0.96, 0.95, 0.88) * smoothstep(0.99992, 0.999995, polCos) * 2.2;
        return acc * smoothstep(0.005, 0.14, elev) * smoothstep(0.10, 0.80, uNightFactor);
      }

      vec3 renderAurora(vec3 rd) {
        if (uAuroraStrength <= 0.005 || rd.y < -0.02) return vec3(0.0);
        float t = uAuroraTime;
        vec3 accum = vec3(0.0);
        float horizFade = smoothstep(-0.02, 0.10, rd.y) * (1.0 - smoothstep(0.30, 0.96, rd.y));
        if (horizFade <= 0.001) return vec3(0.0);

        float dither = hash21(gl_FragCoord.xy + fract(t) * 37.0) / 28.0;
        for (int i = 0; i < 28; i++) {
          float fi = float(i) / 28.0 + dither;
          float alt = 1.05 + fi * 1.55;
          float rayLen = alt / max(rd.y + 0.16, 0.07);
          vec2 p = rd.xz * rayLen;

          float warp = gnoise(p * 0.55 + vec2(t * 0.04, -t * 0.03)) * 2.1;
          float waveA = sin(p.x * 0.58 + p.y * 0.34 + t * 0.18 + warp);
          float waveB = sin(p.x * 1.05 - p.y * 0.72 - t * 0.14 + warp * 1.3);

          float ribbonA = exp(-waveA * waveA * 4.4);
          float ribbonB = exp(-(waveB + 0.3) * (waveB + 0.3) * 5.2) * 0.72;
          float curtain = max(ribbonA, ribbonB);

          float rays = 0.42 + 1.05 * pow(gnoise(vec2(p.x * 4.8 + p.y * 3.1 + t * 0.24, p.y * 1.5 - t * 0.12)), 1.7);
          float macroPatch = smoothstep(0.16, 0.72, gnoise(p * 0.34 - vec2(t * 0.03, 0.0)));
          float density = curtain * rays * macroPatch;

          vec3 emerald = vec3(0.08, 1.00, 0.42);
          vec3 teal = vec3(0.06, 0.80, 0.88);
          vec3 violet = vec3(0.68, 0.16, 0.92);
          vec3 altCol = mix(emerald, teal, smoothstep(0.0, 0.44, fi));
          altCol = mix(altCol, violet, smoothstep(0.40, 0.90, fi));

          float vertWeight = smoothstep(0.0, 0.10, fi) * exp(-fi * 1.75) * (1.0 - fi * 0.30);
          accum += altCol * density * vertWeight * 0.175;
        }
        return accum * uAuroraStrength * horizFade;
      }

      void main() {
        vec3 rd = normalize(vDir);
        float elev = clamp(rd.y, -0.25, 1.0);

        // Base Nordic Rayleigh/Mie sky gradient
        float hMix = pow(clamp(1.0 - max(elev, 0.0), 0.0, 1.0), 2.1);
        vec3 sky = mix(uSkyZenith, uSkyHorizon, hMix);

        float sunCos = max(dot(rd, uSunDir), 0.0);
        float sunScatter = pow(sunCos, 5.0) * 0.44 + pow(sunCos, 36.0) * 0.50;
        float sunDisc = smoothstep(0.9993, 0.99985, sunCos) * (1.0 - smoothstep(0.45, 0.92, uCloudCoverage));
        sky += uSunColor * (sunScatter * (1.0 - uCloudCoverage * 0.48) + sunDisc * 4.2) * (1.0 - uNightFactor * 0.92);

        // Night Milky Way Galaxy & rotating Icelandic starfield (rotates around Polaris 64.15 deg N; Aurora stays Earth-fixed!)
        vec3 celDir = toIcelandCelestial(rd);
        sky += renderMilkyWay(celDir, rd.y);
        sky += renderStars(celDir, rd.y);
        float moonCos = max(dot(rd, uMoonDir), 0.0);
        float moonDisc = smoothstep(0.99945, 0.9998, moonCos) * uNightFactor;
        float moonHalo = pow(moonCos, 24.0) * 0.22 * uNightFactor;
        sky += vec3(0.75, 0.86, 1.0) * (moonDisc * 2.5 + moonHalo) * (1.0 - uCloudCoverage * 0.72);

        vec3 aurora = renderAurora(rd);

        // Fast 4-step 3D Volumetric-Shaded Icelandic Storm Clouds (~6x faster, identical dramatic rolling storm billows!)
        if (rd.y > -0.02) {
          vec2 drift = uWindDir * (uTime * 0.011);
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

          for (int i = 0; i < 4; i++) {
            float fi = float(i) / 3.0;
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

          float totalAlpha = clamp((1.0 - accumTrans) * smoothstep(-0.02, 0.055, rd.y), 0.0, 0.98);
          vec3 finalCloud = accumLight / max(1.0 - accumTrans, 0.001);

          sky += aurora * (1.0 - totalAlpha * 0.72);
          sky = mix(sky, finalCloud, totalAlpha);
        } else {
          sky += aurora;
        }

        // Seamless luminous overcast sky horizon (decoupled from darker terrain aerial-perspective haze!)
        float horizonBand = 1.0 - smoothstep(-0.02, 0.075, rd.y);
        sky = mix(sky, uSkyHorizon, horizonBand);

        // Subtle ethereal inverted Death Stranding chiral rainbow arc high in misty overcast daytime sky
        float bowVis = smoothstep(0.38, 0.85, uCloudCoverage) * (1.0 - uNightFactor);
        if (bowVis > 0.02 && rd.y > 0.06 && rd.y < 0.44) {
          vec3 bowCenter = normalize(vec3(0.25, 0.62, -0.74));
          float ang = acos(clamp(dot(rd, bowCenter), -1.0, 1.0));
          float bowT = (ang - 0.34) / 0.055;
          float bowD = (bowT - 0.5) * 3.1;
          float bowMask = exp(-(bowD * bowD)) * smoothstep(0.06, 0.16, rd.y) * (1.0 - smoothstep(0.22, 0.42, rd.y));
          vec3 spectrum = vec3(
            smoothstep(0.0, 0.45, bowT) * (1.0 - smoothstep(0.55, 0.95, bowT)),
            smoothstep(0.18, 0.55, bowT) * (1.0 - smoothstep(0.65, 1.0, bowT)),
            smoothstep(0.45, 0.88, bowT)
          );
          sky += spectrum * bowMask * bowVis * 0.13;
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

  function setAuroraMode(mode) {
    state.auroraMode = mode;
    if (mode === 'on') {
      state.auroraWave = 1.0;
    } else if (mode === 'off') {
      state.auroraWave = 0.0;
    }
  }

  function triggerAuroraBurst() {
    state.auroraMode = 'auto';
    state.auroraWaveAge = 0.01;
    state.auroraWaveDuration = 42.0;
    state.auroraWave = 1.0;
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
    const blendRate = state.manualWeatherBlend > 0 ? 1.8 : 0.42;
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

    if (state.auroraMode === 'on') {
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
    _cA.setRGB(0.042, 0.165, 0.54); // Rich deep azure clear zenith
    _cB.setRGB(0.11, 0.14, 0.18);   // Moody storm zenith
    _zenithCol.copy(_cA).lerp(_cB, overcastFrac);

    _cA.setRGB(0.34, 0.56, 0.84);   // Crisp bright sky-blue clear horizon
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
    _cA.setRGB(0.20, 0.33, 0.50); // Crisp Nordic clear-air azure haze
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

    // Directional key light: WARMER golden sunlight on clear days -> cool silver overcast -> amber dusk -> pale arctic moon
    _cA.setRGB(1.0, 0.90, 0.74); // Warm golden clear-day sun
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

    const dayKeyInt = (2.15 - overcastFrac * 0.62) * curWx.sunGain * (1.0 - nightFactor * 0.92);
    const nightKeyInt = 0.26 * nightFactor;
    sunLight.intensity = dayKeyInt + nightKeyInt + state.lightningFlash * 1.6;

    // Soft overcast Nordic sky fill + natural warm-olive ground bounce (eliminates harsh pitch-black shadow spots!)
    _hemiSky.copy(_horizonCol).lerp(new THREE.Color(0.88, 0.92, 0.96), (1.0 - nightFactor) * 0.48);
    _hemiGnd.setRGB(0.16, 0.19, 0.10).lerp(new THREE.Color(0.022, 0.028, 0.036), nightFactor);
    hemiLight.color.copy(_hemiSky);
    hemiLight.groundColor.copy(_hemiGnd);
    hemiLight.intensity = mix(1.12 * curWx.ambientGain, 0.30, nightFactor) + state.lightningFlash * 0.8;

    auroraBounceLight.intensity = auroraIntensity * 0.42;

    skyDome.mesh.position.copy(playerPos);

    // Throttled PMREM environment bake for PBR wet basalt & metal
    const envKey = `${Math.round(state.timeOfDay * 6)}_${state.weather}_${Math.round(auroraIntensity * 4)}`;
    const now = ATMO_UNIFORMS.uTime.value;
    if (now - lastEnvUpdate > 2.2 || envKey !== lastEnvStateKey) {
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
    triggerAuroraBurst,
    update
  };
}
