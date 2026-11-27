import * as THREE from 'three';
import { clamp, mix, smoothstep, mulberry32 } from './noise.js';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const HAZE = Object.freeze({
  lowShare: 0.90,
  lowHeight: 160.0,
  highHeight: 3000.0,
  far: 18000.0
});

// ============================================================================
// 1. SHARED BABYLON ATMOSPHERE + LIGHTING UNIFORMS
// ============================================================================
const _sharedSunDir = new THREE.Vector3(0.95, 0.22, 0.11).normalize();

export const ATMO_UNIFORMS = {
  uTime: { value: 0 },
  uSunDir: { value: _sharedSunDir },
  uBSunDir: { value: _sharedSunDir },
  uSunColor: { value: new THREE.Color(1.0, 0.94, 0.86) },
  uHazeCool: { value: new THREE.Color(0.55, 0.66, 0.80) },
  uHazeWarm: { value: new THREE.Color(0.94, 0.82, 0.68) },
  uMistColor: { value: new THREE.Color(0.68, 0.72, 0.78) },
  uFogDensity: { value: 0.00028 },
  uCloudCoverage: { value: 0.25 },
  uCloudShadowStrength: { value: 0.34 },
  uNightFactor: { value: 0.0 },
  uPlayerPos: { value: new THREE.Vector3(0, 74, 0) },

  // Babylon dual-layer analytical aerial perspective
  uBAerialColor: { value: new THREE.Color(0.45, 0.44, 0.46) },
  uBAerialSunColor: { value: new THREE.Color(0.92, 0.86, 0.78) },
  uBAerialSunColor2: { value: new THREE.Color(0.86, 0.74, 0.64) },
  uBAerialDensity: { value: 0.00025 },
  uBAerialFalloff: { value: 1.0 / HAZE.lowHeight },
  uBAerialHigh: { value: new THREE.Vector2(0.000028, 1.0 / HAZE.highHeight) },
  uBAerialLobe: { value: new THREE.Vector4(0.38, 4.0, 0.5, 20.0) },
  uBAerialFar: { value: HAZE.far },
  uBAerialFlat: { value: 6.0 },
  uBAerialCore: { value: 1.0 },
  uBEnvDiffuse: { value: 1.0 },
  uBFillBoost: { value: 1.0 / 0.30 }
};

let _sharedCloudNoiseTex = null;
export function getCloudNoiseTexture() {
  if (_sharedCloudNoiseTex) return _sharedCloudNoiseTex;
  const rng = mulberry32(41827);
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const v = Math.floor(rng() * 256);
    const v2 = Math.floor(rng() * 256);
    data[i * 4] = v;
    data[i * 4 + 1] = v2;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  _sharedCloudNoiseTex = tex;
  return tex;
}

// ============================================================================
// 2. BABYLON DUAL-LAYER ANALYTICAL AERIAL PERSPECTIVE + CLOUD SHADOWS GLSL
// ============================================================================
export const ATMO_GLSL_PARS = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uBSunDir;
uniform vec3 uSunColor;
uniform vec3 uHazeCool;
uniform vec3 uHazeWarm;
uniform vec3 uMistColor;
uniform float uFogDensity;
uniform float uCloudCoverage;
uniform float uCloudShadowStrength;
uniform float uNightFactor;

uniform vec3 uBAerialColor;
uniform vec3 uBAerialSunColor;
uniform vec3 uBAerialSunColor2;
uniform float uBAerialDensity;
uniform float uBAerialFalloff;
uniform vec2 uBAerialHigh;
uniform vec4 uBAerialLobe;
uniform float uBAerialFar;
uniform float uBAerialFlat;
uniform float uBAerialCore;

float atmoHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float atmoNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
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
    p = rot * p * 2.03 + vec2(17.3, 9.2);
    a *= 0.5;
  }
  return v;
}

float sampleCloudShadow(vec2 worldXZ, float t, vec3 sunDir) {
  float elev = max(sunDir.y, 0.16);
  vec2 wind = vec2(t * 9.5, -t * 4.8);
  vec2 proj = worldXZ + sunDir.xz * (260.0 / elev) - wind;
  float n1 = atmoFbm(proj * 0.00095 + vec2(2.4, -1.7));
  float n2 = atmoNoise(proj * 0.0024 + vec2(-5.1, 3.8)) * 0.35;
  float raw = n1 * 0.78 + n2 * 0.22;
  float thresh = mix(0.68, 0.44, uCloudCoverage);
  float cloudMask = smoothstep(thresh - 0.14, thresh + 0.18, raw);
  float dayAmt = 1.0 - smoothstep(0.15, 0.65, uNightFactor);
  return 1.0 - cloudMask * uCloudShadowStrength * dayAmt;
}

float bblSunLobe(float cosAngle, float exponent) {
  float c = max(cosAngle, 0.0);
  return 0.40 * pow(c, 0.3 * exponent) + 0.38 * pow(c, exponent) + 0.22 * pow(c, 5.0 * exponent);
}

vec3 bblHazeColor(vec3 dir) {
  float h = length(dir.xz);
  vec2 a = dir.xz / max(h, 1e-4);
  vec2 b = normalize(uBSunDir.xz + vec2(1e-5, 0.0));
  float az = max(dot(a, b), 0.0);
  float w = uBAerialLobe.x * pow(az, uBAerialLobe.y) * pow(1.0 - abs(dir.y), uBAerialFlat)
          + uBAerialLobe.z * bblSunLobe(dot(dir, uBSunDir), uBAerialLobe.w);
  vec3 warm = mix(uBAerialSunColor2, uBAerialSunColor, pow(az, uBAerialCore));
  return mix(uBAerialColor, warm, clamp(w, 0.0, 1.0));
}

float bblAerialLayer(float rho, float invH, float y0, float y1) {
  float x = (y1 - y0) * invH;
  float e0 = exp(-max(y0, -60.0) * invH);
  if (abs(x) < 1e-3) return rho * e0 * (1.0 - 0.5 * x);
  return rho * (e0 - exp(-max(y1, -60.0) * invH)) / x;
}

float bblAerialDepth(vec3 worldPos) {
  float dist = distance(worldPos, cameraPosition);
  float tau = dist * (
    bblAerialLayer(uBAerialDensity, uBAerialFalloff, cameraPosition.y, worldPos.y) +
    bblAerialLayer(uBAerialHigh.x, uBAerialHigh.y, cameraPosition.y, worldPos.y)
  );
  float k = min(dist / uBAerialFar, 1.0);
  return tau + 9.0 * k * k * k;
}

float bblAerialFade(vec3 worldPos) {
  return exp(-bblAerialDepth(worldPos));
}

vec3 bblAerial(vec3 color, vec3 worldPos) {
  vec3 v = worldPos - cameraPosition;
  float lenV = max(length(v), 1e-4);
  return mix(bblHazeColor(v / lenV), color, bblAerialFade(worldPos));
}

vec3 applyRealisticAtmosphere(vec3 color, vec3 worldPos, vec3 camPos) {
  vec3 v = worldPos - camPos;
  float lenV = max(length(v), 1e-4);
  return mix(bblHazeColor(v / lenV), color, bblAerialFade(worldPos));
}
`;

// ============================================================================
// 3. PBR MATERIAL ENHANCER (Aerial + Cloud Shadows + Direct Specular Knee + Foliage Wind)
// ============================================================================
export function enhancePBRMaterial(material, options = {}) {
  const {
    cacheKey = 'botw_bbl_pbr_v1',
    isFoliage = false,
    windStrength = 0.08,
    subsurfaceColor = new THREE.Color(0x6eb035),
    subsurfaceStrength = 0.30,
    cloudShadows = true,
    noSpecularKnee = false,
    grazingSpec = 0.0,
    aerial = true
  } = options;

  material.fog = false;
  material.customProgramCacheKey = () =>
    `${cacheKey}_${isFoliage ? 'fol' : 'std'}_${cloudShadows ? 'cs' : 'nc'}_${grazingSpec > 0 ? 'gs' : 'ng'}_${aerial ? 'ae' : 'na'}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = ATMO_UNIFORMS.uTime;
    shader.uniforms.uSunDir = ATMO_UNIFORMS.uSunDir;
    shader.uniforms.uBSunDir = ATMO_UNIFORMS.uBSunDir;
    shader.uniforms.uSunColor = ATMO_UNIFORMS.uSunColor;
    shader.uniforms.uHazeCool = ATMO_UNIFORMS.uHazeCool;
    shader.uniforms.uHazeWarm = ATMO_UNIFORMS.uHazeWarm;
    shader.uniforms.uMistColor = ATMO_UNIFORMS.uMistColor;
    shader.uniforms.uFogDensity = ATMO_UNIFORMS.uFogDensity;
    shader.uniforms.uCloudCoverage = ATMO_UNIFORMS.uCloudCoverage;
    shader.uniforms.uCloudShadowStrength = ATMO_UNIFORMS.uCloudShadowStrength;
    shader.uniforms.uNightFactor = ATMO_UNIFORMS.uNightFactor;
    shader.uniforms.uPlayerPos = ATMO_UNIFORMS.uPlayerPos;

    shader.uniforms.uBAerialColor = ATMO_UNIFORMS.uBAerialColor;
    shader.uniforms.uBAerialSunColor = ATMO_UNIFORMS.uBAerialSunColor;
    shader.uniforms.uBAerialSunColor2 = ATMO_UNIFORMS.uBAerialSunColor2;
    shader.uniforms.uBAerialDensity = ATMO_UNIFORMS.uBAerialDensity;
    shader.uniforms.uBAerialFalloff = ATMO_UNIFORMS.uBAerialFalloff;
    shader.uniforms.uBAerialHigh = ATMO_UNIFORMS.uBAerialHigh;
    shader.uniforms.uBAerialLobe = ATMO_UNIFORMS.uBAerialLobe;
    shader.uniforms.uBAerialFar = ATMO_UNIFORMS.uBAerialFar;
    shader.uniforms.uBAerialFlat = ATMO_UNIFORMS.uBAerialFlat;
    shader.uniforms.uBAerialCore = ATMO_UNIFORMS.uBAerialCore;
    shader.uniforms.uBEnvDiffuse = ATMO_UNIFORMS.uBEnvDiffuse;

    shader.uniforms.uWindStrength = { value: windStrength };
    shader.uniforms.uSssColor = { value: subsurfaceColor };
    shader.uniforms.uSssStrength = { value: subsurfaceStrength };
    shader.uniforms.uGrazingSpec = { value: grazingSpec };

    let vs = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        uniform float uTime;
        uniform float uWindStrength;
        varying vec3 vAtmoWPos;
        varying vec3 vAtmoWNorm;
        `
      );

    if (isFoliage) {
      vs = vs.replace(
        '#include <begin_vertex>',
        /* glsl */`
        #include <begin_vertex>
        {
          vec4 wInst = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wInst = instanceMatrix * wInst;
          #endif
          vec4 wPre = modelMatrix * wInst;
          float sway = sin(wPre.x * 0.45 + wPre.z * 0.37 + uTime * 2.1)
                     + 0.45 * cos(wPre.x * 1.15 - wPre.z * 0.85 + uTime * 3.4);
          float hFactor = clamp((transformed.y + 0.5) * 0.35, 0.0, 1.5);
          transformed.x += sway * uWindStrength * hFactor;
          transformed.z += sway * uWindStrength * 0.55 * hFactor;
        }
        `
      );
    }

    vs = vs.replace(
      '#include <project_vertex>',
      /* glsl */`
      #include <project_vertex>
      {
        vec4 atmoWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          atmoWp = instanceMatrix * atmoWp;
        #endif
        atmoWp = modelMatrix * atmoWp;
        vAtmoWPos = atmoWp.xyz;
        vec3 atmoN = objectNormal;
        #ifdef USE_INSTANCING
          atmoN = mat3(instanceMatrix) * atmoN;
        #endif
        vAtmoWNorm = normalize(mat3(modelMatrix) * atmoN);
      }
      `
    );
    shader.vertexShader = vs;

    let fs = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        varying vec3 vAtmoWPos;
        varying vec3 vAtmoWNorm;
        uniform vec3 uSssColor;
        uniform float uSssStrength;
        uniform float uBEnvDiffuse;
        uniform float uGrazingSpec;
        ${ATMO_GLSL_PARS}
        `
      );

    // Diffuse IBL scaled to Babylon mode key:fill solve
    fs = fs.replace(
      '#include <lights_fragment_maps>',
      /* glsl */`
      #include <lights_fragment_maps>
      #if defined( STANDARD ) && defined( USE_ENVMAP )
        iblIrradiance *= uBEnvDiffuse;
      #endif
      `
    );

    if (grazingSpec > 0.01) {
      fs = fs.replace(
        '#include <lights_physical_fragment>',
        /* glsl */`
        #include <lights_physical_fragment>
        {
          vec3 _gN = normal;
          vec3 _gV = (isOrthographic) ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
          material.specularColor *= mix(1.0, uGrazingSpec, pow(1.0 - clamp(dot(_gN, _gV), 0.0, 1.0), 2.5));
          material.specularF90 *= mix(1.0, uGrazingSpec, 0.5);
        }
        `
      );
    }

    let lightsEndExtra = '';
    if (cloudShadows) {
      lightsEndExtra += `
      {
        float cs = sampleCloudShadow(vAtmoWPos.xz, uTime, uSunDir);
        reflectedLight.directDiffuse *= cs;
        reflectedLight.directSpecular *= cs;
      }
      `;
    }
    if (isFoliage && subsurfaceStrength > 0.001) {
      lightsEndExtra += `
      {
        vec3 viewD = normalize(cameraPosition - vAtmoWPos);
        float back = pow(clamp(dot(-viewD, uSunDir), 0.0, 1.0), 2.8);
        float wrap = clamp(dot(vAtmoWNorm, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uSssColor * uSunColor * (back * 0.85 + wrap * 0.25) * uSssStrength * (1.0 - uNightFactor * 0.85);
      }
      `;
    }
    if (!noSpecularKnee) {
      // Babylon HDR direct specular knee: keeps sunlit glass/stone from tripping bloom
      lightsEndExtra += `
      {
        float bblSm = max(reflectedLight.directSpecular.r, max(reflectedLight.directSpecular.g, reflectedLight.directSpecular.b));
        if (bblSm > 0.6) {
          reflectedLight.directSpecular *= (0.6 + (bblSm - 0.6) / (1.0 + (bblSm - 0.6) / 0.8)) / bblSm;
        }
      }
      `;
    }
    if (lightsEndExtra) {
      fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${lightsEndExtra}`);
    }

    if (aerial) {
      fs = fs.replace(
        '#include <fog_fragment>',
        /* glsl */`
        gl_FragColor.rgb = bblAerial(gl_FragColor.rgb, vAtmoWPos);
        #include <fog_fragment>
        `
      );
    }

    shader.fragmentShader = fs;
  };
  return material;
}

// ============================================================================
// 4. INVERSE-ACES COLOR CALIBRATION & ASTRONOMICAL SOLAR ARC (BABYLON ENGINE)
// ============================================================================
const ACES_IN = new THREE.Matrix3().set(
  0.59719, 0.35458, 0.04823,
  0.07600, 0.90834, 0.01566,
  0.02840, 0.13383, 0.83777
);
const ACES_OUT = new THREE.Matrix3().set(
  1.60475, -0.53108, -0.07367,
  -0.10208, 1.10813, -0.00605,
  -0.00327, -0.07276, 1.07602
);
const ACES_IN_INV = ACES_IN.clone().invert();
const ACES_OUT_INV = ACES_OUT.clone().invert();
const _vAces = new THREE.Vector3();

function acesForward(c) {
  _vAces.set(c.r, c.g, c.b).multiplyScalar(1.0 / 0.6).applyMatrix3(ACES_IN);
  const f = (x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.4329510) + 0.238081);
  _vAces.set(f(_vAces.x), f(_vAces.y), f(_vAces.z)).applyMatrix3(ACES_OUT);
  return new THREE.Color(clamp(_vAces.x, 0, 1), clamp(_vAces.y, 0, 1), clamp(_vAces.z, 0, 1));
}

function acesInverse(c) {
  _vAces.set(c.r, c.g, c.b).applyMatrix3(ACES_OUT_INV);
  const g = (y0) => {
    const y = clamp(y0, 0.0004, 0.985);
    const A = 1.0 - 0.983729 * y;
    const B = 0.0245786 - 0.4329510 * y;
    const C = -(0.000090537 + 0.238081 * y);
    return (-B + Math.sqrt(Math.max(0.0, B * B - 4.0 * A * C))) / (2.0 * A);
  };
  _vAces.set(g(_vAces.x), g(_vAces.y), g(_vAces.z)).applyMatrix3(ACES_IN_INV).multiplyScalar(0.6);
  return new THREE.Color(Math.max(_vAces.x, 0), Math.max(_vAces.y, 0), Math.max(_vAces.z, 0));
}

function colFromHex(hex) {
  return new THREE.Color(hex); // converts sRGB hex to linear-sRGB
}

export function displayToScene(hex, exposure = 1.0) {
  return acesInverse(colFromHex(hex)).multiplyScalar(1.0 / Math.max(exposure, 0.05));
}

const colLum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const acesGrey = (x) => acesForward(new THREE.Color(x, x, x)).g;

function solveFill(keyOnWall, ratio, exposure = 1.0, albedo = 0.6) {
  let lo = 1e-5;
  let hi = Math.max(keyOnWall * 6.0, 0.5);
  for (let i = 0; i < 60; i++) {
    const f = 0.5 * (lo + hi);
    const r = acesGrey(((keyOnWall + f) * albedo / Math.PI) * exposure) / Math.max(1e-6, acesGrey((f * albedo / Math.PI) * exposure));
    if (r > ratio) lo = f;
    else hi = f;
  }
  return 0.5 * (lo + hi);
}

// Site ephemeris (Babylon calibrated for warm morning east rake + golden WNW sunset)
const SITE_LAT = 32.54 * DEG;
const SOLAR_DEC = 15.0 * DEG;
const GRID_ROT_DEG = 15.8;

export function sunAtHourAngle(Hdeg) {
  const H = Hdeg * DEG;
  const sinD = Math.sin(SOLAR_DEC);
  const cosD = Math.cos(SOLAR_DEC);
  const sinL = Math.sin(SITE_LAT);
  const cosL = Math.cos(SITE_LAT);
  const E = -cosD * Math.sin(H);
  const N = sinD * cosL - cosD * Math.cos(H) * sinL;
  const U = sinL * sinD + cosL * cosD * Math.cos(H);
  const el = Math.asin(clamp(U, -1.0, 1.0)) * RAD;
  const trueAz = ((Math.atan2(E, N) * RAD) % 360 + 360) % 360;
  const az = ((trueAz + GRID_ROT_DEG) % 360 + 360) % 360;
  const elR = el * DEG;
  const azR = az * DEG;
  const dir = [Math.sin(azR) * Math.cos(elR), Math.sin(elR), -Math.cos(azR) * Math.cos(elR)];
  return { elevationDeg: el, azimuthDeg: az, trueAzimuthDeg: trueAz, hourAngleDeg: Hdeg, dir };
}

function solveHourAngle(targetElDeg, afternoon) {
  let bestH = afternoon ? 60 : -60;
  let bestErr = 1e9;
  const hStart = afternoon ? 0 : -180;
  const hEnd = afternoon ? 180 : 0;
  for (let h = hStart; h <= hEnd; h += 0.25) {
    const s = sunAtHourAngle(h);
    const err = Math.abs(s.elevationDeg - targetElDeg);
    if (err < bestErr) {
      bestErr = err;
      bestH = h;
    }
  }
  return bestH;
}

const RAW_MODES = {
  morning: {
    name: 'morning',
    night: false,
    hourAngleDeg: solveHourAngle(13.0, false), // ~ -84.0° (East raking)
    sunColor: '#FFF4E2',
    sunIntensity: 2.5,
    fillColor: '#B9C6DA',
    keyToFill: 3.5,
    exposure: 0.86,
    skyZenith: '#8CA6CE',
    skyMid: '#A6B5D0',
    skyHorizon: '#D9D2D3',
    skyTowardSun: '#F6F2EA',
    glow: 0.62,
    fogColor: '#CFCBD0',
    fogDensity: 0.00024,
    hazeLobe: [0.38, 4, 0.5, 20, 6, 1],
    cloudCover: 0.22,
    cloudColor: '#EDEBEE',
    cloudShade: '#BAC4D6',
    cloudGlow: '#FFE6C4',
    cloudOpacity: 0.72,
    grade: { saturation: 1.18, contrast: 1.05, balance: [1.03, 1.0, 0.955], warmSat: 1.0 }
  },
  afternoon: {
    name: 'afternoon',
    night: false,
    hourAngleDeg: solveHourAngle(24.8, true), // ~ +69.9° (sweeps through Noon H=0!)
    sunColor: '#FFDDB0',
    sunIntensity: 3.4,
    fillColor: '#A9BCD9',
    keyToFill: 6.0,
    exposure: 1.18,
    skyZenith: '#5878AE',
    skyMid: '#8EA3C6',
    skyHorizon: '#CFC3BC',
    skyTowardSun: '#F4E6CF',
    glow: 0.70,
    fogColor: '#C9B9AA',
    fogDensity: 0.00026,
    hazeLobe: [0.42, 4, 0.5, 20, 6, 1],
    cloudCover: 0.30,
    cloudColor: '#E2D2C6',
    cloudShade: '#98A4BC',
    cloudGlow: '#FFD9AE',
    cloudOpacity: 0.85,
    grade: { saturation: 1.0, contrast: 1.02, balance: [1.0, 1.0, 1.0], warmSat: 0.84 }
  },
  golden: {
    name: 'golden',
    night: false,
    hourAngleDeg: solveHourAngle(11.0, true), // ~ +86.4° (WNW sunset gold)
    sunColor: '#FFC27A',
    sunIntensity: 3.2,
    fillColor: '#9DB4D6',
    keyToFill: 9.0,
    exposure: 1.38,
    skyZenith: '#4D6798',
    skyMid: '#8C8BB0',
    skyHorizon: '#C6AFAF',
    skyTowardSun: '#F2DEC2',
    glow: 0.90,
    fogColor: '#C5AA93',
    fogDensity: 0.00028,
    hazeLobe: [0.5, 4, 0.5, 20, 6, 1],
    cloudCover: 0.30,
    cloudColor: '#D0B3AF',
    cloudShade: '#887D9C',
    cloudGlow: '#FFB068',
    cloudOpacity: 0.85,
    grade: { saturation: 1.04, contrast: 1.03, balance: [1.02, 1.0, 0.97], warmSat: 0.82 }
  },
  blue: {
    name: 'blue',
    night: true,
    hourAngleDeg: solveHourAngle(-3.0, true), // ~ +103.6° (below horizon twilight/night)
    sunColor: '#F0A070',
    sunIntensity: 0.0,
    fillColor: '#5A6CA0',
    fillLumOverride: 0.23,
    exposure: 1.02,
    skyZenith: '#06173F',
    skyMid: '#122760',
    skyHorizon: '#2C3566',
    afterglow: ['#F6E8C6', '#DCAD87', '#C68C76', '#6A5078'],
    glow: 0.0,
    fogColor: '#232A4A',
    fogDensity: 0.00026,
    hazeLobe: [1.0, 1.6, 0.0, 8, 18, 6],
    cloudCover: 0.25,
    cloudColor: '#4A3E6E',
    cloudShade: '#1D2246',
    cloudGlow: '#C68470',
    cloudOpacity: 0.70,
    grade: { saturation: 1.0, contrast: 1.02, balance: [1.0, 1.0, 1.0], warmSat: 1.0 },
    moon: { azimuthDeg: 142.8, elevationDeg: 45.0, color: '#B8C6E0', intensity: 0.28 }
  }
};

function buildCalibratedModes() {
  const out = {};
  for (const [name, raw] of Object.entries(RAW_MODES)) {
    const ex = raw.exposure;
    const sunColor = colFromHex(raw.sunColor);
    const fillColor = colFromHex(raw.fillColor);
    const fillLum = raw.fillLumOverride !== undefined
      ? raw.fillLumOverride
      : solveFill(raw.sunIntensity * colLum(sunColor) * 0.85, raw.keyToFill, ex, 0.6);

    const skyZenith = displayToScene(raw.skyZenith, ex);
    const skyMid = displayToScene(raw.skyMid, ex);
    const skyHorizon = displayToScene(raw.skyHorizon, ex);
    const fogColor = displayToScene(raw.fogColor, ex);

    let after = [fogColor.clone(), fogColor.clone(), fogColor.clone(), fogColor.clone()];
    let hazeSunColor = displayToScene(raw.skyTowardSun || raw.skyHorizon, ex);
    let hazeSunColor2 = hazeSunColor.clone();

    if (raw.afterglow) {
      const a0 = displayToScene(raw.afterglow[0], ex);
      const a1 = displayToScene(raw.afterglow[1], ex);
      const a2 = displayToScene(raw.afterglow[2], ex);
      const a3 = displayToScene(raw.afterglow[3], ex).lerp(skyHorizon, 0.4);
      after = [a0, a1, a2, a3];
      hazeSunColor = a0.clone().lerp(a1, 0.7);
      hazeSunColor2 = a2.clone().lerp(a3, 0.35);
    }

    out[name] = {
      name,
      night: raw.night,
      hourAngleDeg: raw.hourAngleDeg,
      sun: sunAtHourAngle(raw.hourAngleDeg),
      sunColor,
      sunIntensity: raw.sunIntensity,
      fillColor: fillColor.clone().multiplyScalar(1.0 / Math.max(colLum(fillColor), 1e-4)),
      groundColor: new THREE.Color('#B9A27C').multiplyScalar(0.7 / 0.5),
      fillLum,
      hemiIntensity: (fillLum * 0.30) / (0.5 * 1.7),
      envIntensity: 1.0, // overwritten once sky.probe() measures anchor PMREM
      exposure: ex,
      skyZenith,
      skyMid,
      skyHorizon,
      skyTowardSun: raw.skyTowardSun ? displayToScene(raw.skyTowardSun, ex) : after[1].clone(),
      glow: raw.glow,
      fogColor,
      hazeSunColor,
      hazeSunColor2,
      fogDensity: raw.fogDensity,
      hazeLobe: raw.hazeLobe,
      cloudCover: raw.cloudCover,
      cloudColor: displayToScene(raw.cloudColor, ex),
      cloudShade: displayToScene(raw.cloudShade, ex),
      cloudGlow: displayToScene(raw.cloudGlow, ex),
      cloudOpacity: raw.cloudOpacity,
      grade: raw.grade,
      after,
      env: null
    };
  }
  return out;
}

/** Maps normalized 24h cycle time u in [0, 1) -> Babylon { a, b, k, wrapDawn } light transition spec. */
export function dayNightSpec(u) {
  const uu = ((u % 1.0) + 1.0) % 1.0;
  if (uu < 0.16) return { a: 'morning', b: 'afternoon', k: uu / 0.16 };
  if (uu < 0.34) return { a: 'afternoon', b: 'golden', k: (uu - 0.16) / 0.18 };
  if (uu < 0.50) return { a: 'golden', b: 'blue', k: (uu - 0.34) / 0.16 };
  if (uu < 0.88) return { a: 'blue', b: 'blue', k: 0.0 };
  return { a: 'blue', b: 'morning', k: (uu - 0.88) / 0.12, wrapDawn: true };
}

/** Formats normalized u in [0, 1) into Babylon HUD clock + daylight phase string ("07:55 · Morning"). */
export function formatTimeOfDay(u) {
  const uu = ((u % 1.0) + 1.0) % 1.0;
  const h24 = (6.5 + uu * 24.0) % 24.0;
  const hh = Math.floor(h24);
  const mm = Math.floor((h24 - hh) * 60.0);
  const hhStr = String(hh).padStart(2, '0');
  const mmStr = String(mm).padStart(2, '0');
  let phase = 'Night';
  if (uu < 0.14) phase = 'Morning';
  else if (uu < 0.30) phase = 'Afternoon';
  else if (uu < 0.40) phase = 'Golden Hour';
  else if (uu < 0.50) phase = 'Dusk';
  else if (uu < 0.88) phase = 'Night';
  else phase = 'Dawn';
  return `${hhStr}:${mmStr} \u00B7 ${phase}`;
}

// ============================================================================
// 5. BABYLON SKY DOME (3-STOP GRADIENT + 2-LAYER CIRRUS + MOON + MILKY WAY + 400 STARS)
// ============================================================================
const SKY_COMMON_GLSL = /* glsl */`
uniform sampler2D tNoise;
uniform vec4 uCloudA;
uniform vec4 uCloudB;
uniform vec4 uCloudP;
uniform float uCloudTime;
uniform vec4 uNight; // night, milkyWay, moonAmount, afterglow

float bblVN(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(tNoise, (i + f + 0.5) / 256.0, 0.0).r;
}

vec2 bblCloudPlane(vec3 d, float h) {
  const float R = 1500.0;
  float s = max(d.y, -0.01);
  return d.xz * (-R * s + sqrt(R * R * s * s + 2.0 * R * h + h * h));
}

float bblCirrus(vec3 d, float h, vec4 lay, float th, float seed, float speedMul) {
  vec2 p = bblCloudPlane(d, h);
  float fine = clamp(55.0 / max(length(p), 1.0), 0.0, 1.0);
  p += lay.xy * (uCloudP.w * speedMul);
  vec2 perp = vec2(-lay.y, lay.x);
  vec2 q0 = vec2(dot(p, lay.xy) / lay.z, dot(p, perp) / lay.w) + seed;
  vec2 q = q0;
  float mt = uCloudTime * 0.018 * speedMul;
  float field = bblVN(q * 0.21 + vec2(3.7 + mt * 0.35, 3.7 - mt * 0.15));
  vec2 w = vec2(
    bblVN(q * 0.55 + vec2(31.7 + mt, 12.1 - mt * 0.6)),
    bblVN(q * 0.55 + vec2(58.3 - mt * 0.7, 41.9 + mt * 0.8))
  ) - 0.5;
  q += w * vec2(1.35, 1.8);
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    f += a * mix(0.5, bblVN(q + vec2(mt * (0.4 + 0.15 * float(i)), -mt * 0.2)), i < 3 ? 1.0 : fine);
    q = q * vec2(1.93, 2.27) + 19.7;
    a *= 0.45;
  }
  f += (field - 0.5) * 0.72;
  float dens = smoothstep(th - 0.02, th + 0.24, f);
  float fib = bblVN(vec2(q0.x * 1.3 + mt * 0.5, q0.y * 9.0) + 71.3) * 0.65
            + bblVN(vec2(q0.x * 2.9 - mt * 0.4, q0.y * 23.0) + 13.1) * 0.35;
  return clamp(dens * (0.45 + 1.1 * mix(0.5, fib, fine)), 0.0, 1.0);
}

vec2 bblClouds(vec3 d) {
  float a = bblCirrus(d, 8.5, uCloudA, uCloudP.x, 0.0, 1.0);
  float b = bblCirrus(d, 11.5, uCloudB, uCloudP.y, 43.0, 0.58) * 0.72;
  return vec2(1.0 - (1.0 - a) * (1.0 - b), a);
}

vec2 bblAfterglow(vec3 d, vec3 sunDir) {
  vec2 a = normalize(d.xz + vec2(1e-5, 0.0));
  vec2 b = normalize(sunDir.xz + vec2(1e-5, 0.0));
  float dAz = acos(clamp(dot(a, b), -1.0, 1.0));
  float el = asin(clamp(d.y, -1.0, 1.0));
  float sunEl = asin(clamp(sunDir.y, -1.0, 1.0));
  float v = max(el - sunEl, 0.0) / 0.30;
  float r = length(vec2(dAz / (1.15 - 0.55 * min(v, 1.0)), v));
  return vec2(uNight.w * exp(-1.25 * r * r * r), r);
}
`;

function probit(p) {
  const q = Math.min(Math.max(p, 1e-4), 1.0 - 1e-4);
  const t = Math.sqrt(-2.0 * Math.log(q < 0.5 ? q : 1.0 - q));
  const x = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1.0 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return q < 0.5 ? -x : x;
}
const cloudThreshold = (cover) => (cover <= 0 ? 9.0 : 0.47 + 0.193 * probit(1.0 - cover));
const COVER_TABLE = [[0, 0], [0.041, 0.153], [0.086, 0.24], [0.132, 0.301], [0.2, 0.385], [0.3, 0.476], [1, 1]];
function coverToNoise(cover) {
  if (cover <= 0) return 0;
  for (let i = 1; i < COVER_TABLE.length; i++) {
    const [n0, c0] = COVER_TABLE[i - 1];
    const [n1, c1] = COVER_TABLE[i];
    if (cover <= c1) return n0 + (n1 - n0) * ((cover - c0) / (c1 - c0));
  }
  return 1;
}

export function createSkyDome() {
  const noise = getCloudNoiseTexture();
  const dirA = [Math.sin(208 * DEG), -Math.cos(208 * DEG)];
  const dirB = [Math.sin(216 * DEG), -Math.cos(216 * DEG)];
  const col = () => new THREE.Color(0, 0, 0);

  const uniforms = {
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

    tNoise: { value: noise },
    uCloudA: { value: new THREE.Vector4(dirA[0], dirA[1], 9.0, 1.4) },
    uCloudB: { value: new THREE.Vector4(dirB[0], dirB[1], 16.0, 2.5) },
    uCloudP: { value: new THREE.Vector4(0.5, 0.52, 0.8, 0.0) },
    uCloudTime: { value: 0.0 },
    uNight: { value: new THREE.Vector4(0, 0, 0, 0) },
    uZenith: { value: col() },
    uMid: { value: col() },
    uHorizon: { value: col() },
    uTowardSun: { value: col() },
    uSunDisc: { value: col() },
    uAureole: { value: col() },
    uSunP: { value: new THREE.Vector4(0.0058, 0.8, 0.05, 0.0014) },
    uDip: { value: 0.0 },
    uMoonDir: { value: new THREE.Vector3(0.6, 0.7, 0.4).normalize() },
    uMoonColor: { value: col() },
    uAfter0: { value: col() },
    uAfter1: { value: col() },
    uAfter2: { value: col() },
    uAfter3: { value: col() },
    uCloudLit: { value: col() },
    uCloudShade: { value: col() },
    uCloudGlow: { value: col() },
    uGround: { value: col() },
    uEnv: { value: 0.0 }
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      varying vec3 vDir;
      ${ATMO_GLSL_PARS}
      ${SKY_COMMON_GLSL}
      uniform vec3 uZenith, uMid, uHorizon, uTowardSun;
      uniform vec3 uSunDisc, uAureole;
      uniform vec4 uSunP;
      uniform float uDip;
      uniform vec3 uMoonDir, uMoonColor;
      uniform vec3 uAfter0, uAfter1, uAfter2, uAfter3;
      uniform vec3 uCloudLit, uCloudShade, uCloudGlow;
      uniform vec3 uGround;
      uniform float uEnv;

      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        float sd = dot(d, uBSunDir);
        float sdp = max(sd, 0.0);

        // 3-stop sky gradient
        vec3 col = mix(uHorizon, uMid, smoothstep(0.02, 0.23, e));
        col = mix(col, uZenith, smoothstep(0.16, 0.52, e));
        col *= 1.0 - 0.22 * smoothstep(0.5, 1.0, e);

        // Milky Way & phase-lit Moon
        if (uNight.x > 0.001) {
          const vec3 MW = vec3(0.5567, 0.3492, -0.7538);
          float band = exp(-pow(dot(d, MW) / 0.17, 2.0));
          vec2 mq = vec2(atan(d.z, d.x) * 9.0, d.y * 14.0);
          float mott = 0.35 + 0.9 * bblVN(mq) * bblVN(mq * 2.7 + 5.0);
          col += vec3(0.62, 0.72, 1.0) * (0.022 * band * mott * uNight.y * smoothstep(0.02, 0.3, e));

          const float RM = 0.0068;
          float md = dot(d, uMoonDir);
          if (md > 0.85) {
            float inside = 0.0;
            if (md > 0.9998) {
              vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
              vec3 my = cross(uMoonDir, mx);
              vec2 q = vec2(dot(d, mx), dot(d, my)) / RM;
              float r2 = dot(q, q);
              float aa = uSunP.w / RM;
              inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, sqrt(r2));
              vec3 n = q.x * mx + q.y * my - sqrt(max(1.0 - r2, 0.0)) * uMoonDir;
              float lit = smoothstep(-0.04, 0.10, dot(n, uBSunDir));
              float maria = 0.74 + 0.26 * smoothstep(0.25, 0.75, bblVN(q * 2.3 + 40.0) * 0.6 + bblVN(q * 5.1 + 11.0) * 0.4);
              float limb = 0.82 + 0.18 * sqrt(max(1.0 - r2, 0.0));
              col = mix(col, uMoonColor * (lit * maria * limb + 0.012), inside * uNight.z);
            }
            col += uMoonColor * (0.035 * pow(md, 900.0) + 0.012 * pow(md, 120.0)) * uNight.z * (1.0 - inside);
          }
        }

        // Warm daytime solar scatter lobe & 4-stop twilight afterglow arch
        vec2 az = normalize(d.xz + vec2(1e-5, 0.0));
        vec2 sz = normalize(uBSunDir.xz + vec2(1e-5, 0.0));
        float azd = max(dot(az, sz), 0.0);
        float low = 1.0 - smoothstep(0.0, 0.55, e);
        col = mix(col, uTowardSun, clamp(uSunP.y * (0.5 * pow(azd, 5.0) * low + 0.5 * bblSunLobe(sd, 22.0)), 0.0, 1.0));

        if (uNight.w > 0.001) {
          vec2 ag = bblAfterglow(d, uBSunDir);
          vec3 gc = mix(uAfter0, uAfter1, smoothstep(0.0, 0.3, ag.y));
          gc = mix(gc, uAfter2, smoothstep(0.26, 0.62, ag.y));
          gc = mix(gc, uAfter3, smoothstep(0.58, 1.05, ag.y));
          col = mix(col, gc, ag.x);
        }

        // 2-layer curved-shell cirrus clouds
        float cloudCover = 0.0;
        if (e > -0.005 && uCloudP.z > 0.0) {
          vec2 cl = bblClouds(d);
          cloudCover = cl.x;
          vec3 cc = mix(uCloudLit, uCloudShade, 0.45 * cl.x * cl.x);
          cc += uCloudGlow * (0.55 * pow(sdp, 5.0) + 0.9 * pow(sdp, 40.0));
          col = mix(col, cc, cl.x * uCloudP.z * smoothstep(-0.005, 0.06, e));
        }

        // Seam-free horizon haze band matching world bblHazeColor(dir)
        vec3 haze = bblHazeColor(d);
        float hx = max(e + uDip, 0.0) / uSunP.z;
        float hb = pow(1.0 + hx * hx, -1.5);
        col = mix(col, haze, hb);

        // HDR solar aureole & disc
        float ang = length(cross(d, uBSunDir));
        float vis = (1.0 - 0.75 * cloudCover) * smoothstep(-0.004, 0.012, e);
        if (sd > 0.0) {
          col += uAureole * (5.0 * pow(sdp, 5000.0) + 0.9 * pow(sdp, 520.0) + 0.12 * pow(sdp, 60.0)) * (1.0 - 0.5 * cloudCover) * smoothstep(-0.02, 0.03, e);
          if (uEnv < 0.5) {
            float aa = uSunP.w * 0.9;
            float disc = 1.0 - smoothstep(uSunP.x - aa, uSunP.x + aa, ang);
            float limb = 0.72 + 0.28 * sqrt(max(1.0 - (ang * ang) / (uSunP.x * uSunP.x), 0.0));
            col += uSunDisc * (disc * limb * vis);
          }
        }

        // Ground hemisphere bounce for offline PMREM IBL capture
        if (uEnv > 0.5) {
          col = mix(col, uGround, smoothstep(0.0, -0.10, e));
          col = min(col, vec3(6.0));
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const domeGeo = new THREE.SphereGeometry(1, 48, 24);
  const mesh = new THREE.Mesh(domeGeo, skyMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;

  // 400-starfield dynamically occluded by cirrus clouds & twilight afterglow
  const nStars = 400;
  const srng = mulberry32(99103);
  const aStar = new Float32Array(nStars * 4);
  const aTint = new Float32Array(nStars * 3);
  const aPos = new Float32Array(nStars * 3);
  const TINTS = [[0.72, 0.82, 1.0], [0.86, 0.91, 1.0], [1.0, 1.0, 1.0], [1.0, 0.95, 0.84], [1.0, 0.86, 0.68]];
  for (let i = 0; i < nStars; i++) {
    const y = 0.05 + 0.95 * srng();
    const a = srng() * Math.PI * 2;
    const r = Math.sqrt(1.0 - y * y);
    aStar.set([r * Math.cos(a), y, r * Math.sin(a), Math.pow(srng(), 2.6)], i * 4);
    aPos.set([r * Math.cos(a), y, r * Math.sin(a)], i * 3);
    aTint.set(TINTS[Math.floor(srng() * TINTS.length)], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  starGeo.setAttribute('aStar', new THREE.BufferAttribute(aStar, 4));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(aTint, 3));

  const starUniforms = {
    uBSunDir: uniforms.uBSunDir,
    uBTime: uniforms.uTime,
    uPx: { value: 1.0 },
    uStar: { value: 0.0 },
    tNoise: uniforms.tNoise,
    uCloudA: uniforms.uCloudA,
    uCloudB: uniforms.uCloudB,
    uCloudP: uniforms.uCloudP,
    uCloudTime: uniforms.uCloudTime,
    uNight: uniforms.uNight
  };

  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec4 aStar;
      attribute vec3 aTint;
      uniform vec3 uBSunDir;
      uniform float uPx, uStar, uBTime;
      ${SKY_COMMON_GLSL}
      varying vec3 vCol;
      void main() {
        vec3 d = aStar.xyz;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * d, 1.0);
        gl_Position = p.xyww;
        float b = aStar.w;
        gl_PointSize = uPx * (1.8 + 2.6 * sqrt(b));
        float ext = smoothstep(0.035, 0.32, d.y);
        float tw = 1.0 + 0.16 * sin(uBTime * (2.5 + 9.0 * fract(b * 91.7)) + b * 400.0);
        float cl = uCloudP.z > 0.0 ? bblClouds(d).x * uCloudP.z : 0.0;
        float glow = bblAfterglow(d, uBSunDir).x;
        vCol = aTint * ((0.08 + 1.35 * b * b) * tw * ext * (1.0 - min(1.4 * cl, 1.0)) * (1.0 - 0.95 * glow) * uStar);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, r);
        gl_FragColor = vec4(vCol * a * a, 1.0);
      }
    `
  });

  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = 1001;
  stars.visible = false;

  const group = new THREE.Group();
  group.add(mesh, stars);

  // Offscreen rig for probing sky irradiance & baking 4 anchor PMREMs at startup
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(domeGeo, skyMat);
  envDome.frustumCulled = false;
  envScene.add(envDome);

  return {
    mesh: group,
    domeMesh: mesh,
    stars,
    starUniforms,
    skyMat,
    uniforms,
    envScene,
    applyState(st, camY = 74, fovDeg = 46, viewHeightPx = 720, t = 0) {
      uniforms.uZenith.value.copy(st.skyZenith);
      uniforms.uMid.value.copy(st.skyMid);
      uniforms.uHorizon.value.copy(st.skyHorizon);
      uniforms.uTowardSun.value.copy(st.skyTowardSun);
      uniforms.uSunDisc.value.copy(st.sunDisc);
      uniforms.uAureole.value.copy(st.aureole);
      const hBand = 0.05 * (0.7 + 0.3 * Math.exp(-Math.max(camY, 0) / 700.0));
      const pxAng = (2.0 * Math.tan((fovDeg * DEG) * 0.5)) / Math.max(viewHeightPx, 1);
      uniforms.uSunP.value.set(0.0058, st.glow, hBand, pxAng);
      uniforms.uDip.value = (0.6 * Math.max(camY, 0)) / Math.hypot(Math.max(camY, 0), HAZE.far);
      uniforms.uMoonDir.value.copy(st.moonDir);
      uniforms.uMoonColor.value.copy(st.moonDisc);
      uniforms.uNight.value.set(st.night, st.stars, st.moonAmount, st.afterglow);
      uniforms.uAfter0.value.copy(st.after[0]);
      uniforms.uAfter1.value.copy(st.after[1]);
      uniforms.uAfter2.value.copy(st.after[2]);
      uniforms.uAfter3.value.copy(st.after[3]);
      uniforms.uCloudLit.value.copy(st.cloudColor);
      uniforms.uCloudShade.value.copy(st.cloudShade);
      uniforms.uCloudGlow.value.copy(st.cloudGlow);

      const cn = coverToNoise(st.cloudCover);
      const drift = 4.0 + 0.10 * t;
      uniforms.uCloudP.value.set(cloudThreshold(cn * 0.75), cloudThreshold(cn * 0.45), st.cloudOpacity, drift);
      uniforms.uCloudTime.value = t;
      starUniforms.uStar.value = st.stars;
      starUniforms.uPx.value = Math.max(1.0, viewHeightPx / 1080.0);
      stars.visible = st.stars > 0.003;
    },
    probe(renderer) {
      const PN = 16;
      if (!this._probeRT) {
        this._probeRT = new THREE.WebGLRenderTarget(PN, PN, { type: THREE.FloatType, depthBuffer: false });
        this._probeBuf = new Float32Array(PN * PN * 4);
        this._probeCam = new THREE.PerspectiveCamera(90, 1, 0.1, 10);
      }
      const FACES = [[1, 0, 0, 0, 1, 0], [-1, 0, 0, 0, 1, 0], [0, 1, 0, 0, 0, -1], [0, -1, 0, 0, 0, 1], [0, 0, 1, 0, 1, 0], [0, 0, -1, 0, 1, 0]];
      const NORM = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
      const E = { px: [0, 0, 0], nx: [0, 0, 0], py: [0, 0, 0], ny: [0, 0, 0], pz: [0, 0, 0], nz: [0, 0, 0] };
      const prevRT = renderer.getRenderTarget();
      const prevEnv = uniforms.uEnv.value;
      const prevGround = uniforms.uGround.value.clone();
      uniforms.uEnv.value = 1.0;
      uniforms.uGround.value.setRGB(0, 0, 0);

      const f = new THREE.Vector3();
      const r = new THREE.Vector3();
      const u = new THREE.Vector3();
      const dir = new THREE.Vector3();
      for (const F of FACES) {
        this._probeCam.position.set(0, 0, 0);
        this._probeCam.up.set(F[3], F[4], F[5]);
        this._probeCam.lookAt(F[0], F[1], F[2]);
        this._probeCam.updateMatrixWorld(true);
        renderer.setRenderTarget(this._probeRT);
        renderer.clear();
        renderer.render(envScene, this._probeCam);
        renderer.readRenderTargetPixels(this._probeRT, 0, 0, PN, PN, this._probeBuf);
        f.set(F[0], F[1], F[2]);
        u.set(F[3], F[4], F[5]);
        r.crossVectors(f, u);
        for (let j = 0; j < PN; j++) {
          for (let i = 0; i < PN; i++) {
            const x = ((i + 0.5) / PN) * 2 - 1;
            const y = ((j + 0.5) / PN) * 2 - 1;
            const k = (j * PN + i) * 4;
            const dw = (4 / (PN * PN)) / Math.pow(1 + x * x + y * y, 1.5);
            dir.copy(f).addScaledVector(r, x).addScaledVector(u, y).normalize();
            for (const key in E) {
              const n = NORM[key];
              const c = dir.x * n[0] + dir.y * n[1] + dir.z * n[2];
              if (c > 0) {
                E[key][0] += this._probeBuf[k] * c * dw;
                E[key][1] += this._probeBuf[k + 1] * c * dw;
                E[key][2] += this._probeBuf[k + 2] * c * dw;
              }
            }
          }
        }
      }
      renderer.setRenderTarget(prevRT);
      uniforms.uEnv.value = prevEnv;
      uniforms.uGround.value.copy(prevGround);
      const C = (a) => new THREE.Color(a[0], a[1], a[2]);
      const horiz = [0, 1, 2].map((idx) => (E.px[idx] + E.nx[idx] + E.pz[idx] + E.nz[idx]) * 0.25);
      return { up: C(E.py), down: C(E.ny), horiz: C(horiz) };
    },
    capture(renderer, cubeCam, ground) {
      const prevRT = renderer.getRenderTarget();
      const prevEnv = uniforms.uEnv.value;
      uniforms.uEnv.value = 1.0;
      uniforms.uGround.value.copy(ground);
      cubeCam.update(renderer, envScene);
      renderer.setRenderTarget(prevRT);
      uniforms.uEnv.value = prevEnv;
    }
  };
}

// ============================================================================
// 6. COMPLETE BABYLON DAYLIGHT CONTROLLER + 4-MODE PMREM BLENDER
// ============================================================================
const GROUND_ALBEDO = new THREE.Color('#B9A27C');
const HEMI_SHARE = 0.30;
const SKY_SHARE = 0.72;
const SUN_DISC = 95.0;
const MOON_RAD = RAW_MODES.blue.moon;
const _moonElR = MOON_RAD.elevationDeg * DEG;
const _moonAzR = MOON_RAD.azimuthDeg * DEG;
const MOON_DIR = new THREE.Vector3(
  Math.sin(_moonAzR) * Math.cos(_moonElR),
  Math.sin(_moonElR),
  -Math.cos(_moonAzR) * Math.cos(_moonElR)
).normalize();
const MOON_COLOR = colFromHex(MOON_RAD.color);

export function createDaylightSystem(renderer, scene, skyDome) {
  const modes = buildCalibratedModes();
  const modeNames = Object.keys(modes);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
  });
  const cubeCam = new THREE.CubeCamera(0.1, 10, cubeRT);

  function computeRawState(spec) {
    const A = modes[spec.a || 'morning'];
    const B = modes[spec.b || A.name];
    const k = clamp(spec.k || 0, 0, 1);

    let hA = A.hourAngleDeg;
    let hB = B.hourAngleDeg;
    if (spec.wrapDawn && hB < hA) hB += 360.0;
    const h = mix(hA, hB, k);
    const sun = sunAtHourAngle(h);
    const el = sun.elevationDeg;

    const dusk = Math.pow(clamp((8.0 - el) / 11.0, 0.0, 1.0), 1.8);
    const night = (A.night && B.night) ? 1.0 : (A.night !== B.night ? dusk : 0.0);
    const w = (A.night === B.night) ? k : (B.night ? dusk : 1.0 - dusk);

    const mixC = (key) => A[key].clone().lerp(B[key], w);
    const mixN = (key) => mix(A[key], B[key], w);

    const sunFade = smoothstep(-0.3, 4.0, el);
    const redden = (A.night === B.night) ? 0.0 : smoothstep(9.0, 0.0, el);
    const dayMode = A.night ? B : A;
    const sunColor = (A.night === B.night) ? mixC('sunColor') : dayMode.sunColor.clone().lerp(modes.blue.sunColor, redden);
    const sunIntensity = ((A.night && B.night) ? 0.0 : (A.night === B.night ? mixN('sunIntensity') : dayMode.sunIntensity)) * sunFade;

    const moonI = MOON_RAD.intensity * smoothstep(0.55, 1.0, night);
    const sunDir = new THREE.Vector3(...sun.dir).normalize();
    const sunIsKey = sunIntensity * colLum(sunColor) >= moonI * colLum(MOON_COLOR);
    const trans = Math.exp(-0.1 / Math.max(Math.sin(el * DEG) + 0.015, 0.004)) * smoothstep(-0.7, 0.4, el);
    const deep = new THREE.Color(1.0, 0.33, 0.07);
    const discColor = sunColor.clone().lerp(new THREE.Color(1, 1, 1), 0.35).lerp(deep, 1.0 - Math.sqrt(trans));
    const afterglow = smoothstep(0.20, 0.90, night);

    return {
      a: A.name,
      b: B.name,
      k,
      w,
      sunDir,
      sunElevationDeg: el,
      sunAzimuthDeg: sun.azimuthDeg,
      sunColor,
      sunIntensity,
      moonDir: MOON_DIR.clone(),
      moonColor: MOON_COLOR.clone(),
      moonIntensity: moonI,
      keyDir: sunIsKey ? sunDir.clone() : MOON_DIR.clone(),
      keyColor: sunIsKey ? sunColor.clone() : MOON_COLOR.clone(),
      keyIntensity: sunIsKey ? sunIntensity : moonI,
      keyIsMoon: !sunIsKey,
      fillColor: mixC('fillColor'),
      groundColor: mixC('groundColor'),
      fillIntensity: mixN('hemiIntensity'),
      fillLum: mixN('fillLum'),
      envIntensity: mixN('envIntensity'),
      skyZenith: mixC('skyZenith'),
      skyMid: mixC('skyMid'),
      skyHorizon: mixC('skyHorizon'),
      skyTowardSun: mixC('skyTowardSun'),
      glow: mixN('glow') * (1.0 - afterglow),
      fogColor: mixC('fogColor'),
      hazeSunColor: mixC('hazeSunColor'),
      hazeSunColor2: mixC('hazeSunColor2'),
      hazeLobe: A.hazeLobe.map((v, i) => mix(v, B.hazeLobe[i], w)),
      fogDensity: mixN('fogDensity'),
      cloudColor: mixC('cloudColor'),
      cloudShade: mixC('cloudShade'),
      cloudGlow: mixC('cloudGlow').multiplyScalar(A.night === B.night ? 1.0 : mix(1.0, 0.5 + 0.5 * sunFade, 1.0 - night)),
      cloudCover: mixN('cloudCover'),
      cloudOpacity: mixN('cloudOpacity'),
      sunDisc: discColor.multiplyScalar(SUN_DISC * trans),
      aureole: sunColor.clone().multiplyScalar(Math.sqrt(trans) * (1.0 - 0.6 * night)),
      moonDisc: MOON_COLOR.clone().multiplyScalar(1.9),
      moonAmount: smoothstep(0.30, 0.80, night),
      after: modes.blue.after,
      afterglow,
      stars: smoothstep(0.55, 1.0, night),
      night,
      exposure: mixN('exposure'),
      grade: {
        saturation: mix(A.grade.saturation, B.grade.saturation, w),
        contrast: mix(A.grade.contrast, B.grade.contrast, w),
        balance: A.grade.balance.map((v, i) => mix(v, B.grade.balance[i], w)),
        warmSat: mix(A.grade.warmSat, B.grade.warmSat, w)
      }
    };
  }

  function applyAtmosphereAndSky(st, camY = 74, fov = 46, viewH = 720, t = 0) {
    ATMO_UNIFORMS.uSunDir.value.copy(st.sunDir);
    ATMO_UNIFORMS.uSunColor.value.copy(st.sunColor).multiplyScalar(clamp(0.45 + 0.55 * smoothstep(-2, 14, st.sunElevationDeg), 0.15, 1.3));
    ATMO_UNIFORMS.uHazeCool.value.copy(st.fogColor);
    ATMO_UNIFORMS.uHazeWarm.value.copy(st.hazeSunColor);
    ATMO_UNIFORMS.uMistColor.value.copy(st.fogColor);
    ATMO_UNIFORMS.uFogDensity.value = st.fogDensity;
    ATMO_UNIFORMS.uCloudCoverage.value = st.cloudCover;
    ATMO_UNIFORMS.uNightFactor.value = st.night;
    ATMO_UNIFORMS.uBEnvDiffuse.value = st.envIntensity;

    ATMO_UNIFORMS.uBAerialColor.value.copy(st.fogColor);
    ATMO_UNIFORMS.uBAerialSunColor.value.copy(st.hazeSunColor);
    ATMO_UNIFORMS.uBAerialSunColor2.value.copy(st.hazeSunColor2);
    ATMO_UNIFORMS.uBAerialDensity.value = st.fogDensity * HAZE.lowShare;
    ATMO_UNIFORMS.uBAerialFalloff.value = 1.0 / HAZE.lowHeight;
    ATMO_UNIFORMS.uBAerialHigh.value.set(st.fogDensity * (1.0 - HAZE.lowShare), 1.0 / HAZE.highHeight);
    ATMO_UNIFORMS.uBAerialLobe.value.set(st.hazeLobe[0], st.hazeLobe[1], st.hazeLobe[2], st.hazeLobe[3]);
    ATMO_UNIFORMS.uBAerialFar.value = HAZE.far;
    ATMO_UNIFORMS.uBAerialFlat.value = st.hazeLobe[4];
    ATMO_UNIFORMS.uBAerialCore.value = st.hazeLobe[5] === undefined ? 1.0 : st.hazeLobe[5];

    skyDome.applyState(st, camY, fov, viewH, t);
  }

  // Bake all 4 mode PMREMs once at startup
  let envRT = null;
  const prevAuto = renderer.autoClear;
  renderer.autoClear = true;
  for (const name of modeNames) {
    const mode = modes[name];
    const st = computeRawState({ a: name, b: name, k: 0 });
    applyAtmosphereAndSky(st, 74, 46, 720, 0);
    const pr = skyDome.probe(renderer);
    const envFill = mode.fillLum * (1.0 - HEMI_SHARE);
    const scale = (envFill * SKY_SHARE) / Math.max(colLum(pr.horiz), 1e-6);
    const sunDown = mode.night ? 0.0 : mode.sunIntensity * Math.sin(mode.sun.elevationDeg * DEG) * 0.55;
    const tint = mode.sunColor.clone().multiplyScalar(sunDown).add(pr.up.clone().multiplyScalar(scale)).multiply(GROUND_ALBEDO);
    const groundLum = (envFill * (1.0 - SKY_SHARE) * 2.0) / Math.PI;
    const ground = tint.multiplyScalar(groundLum / Math.max(colLum(tint), 1e-9));

    skyDome.capture(renderer, cubeCam, ground.clone().multiplyScalar(1.0 / scale));
    mode.env = pmrem.fromCubemap(cubeRT.texture);
    mode.envIntensity = scale;
    mode.groundColor = ground.clone().multiplyScalar(0.7 / Math.max(colLum(ground), 1e-9));
    mode.hemiIntensity = (mode.fillLum * HEMI_SHARE) / (0.5 * 1.7);
  }
  renderer.autoClear = prevAuto;

  const refEnv = modes[modeNames[0]].env;
  envRT = new THREE.WebGLRenderTarget(refEnv.width, refEnv.height, {
    type: THREE.HalfFloatType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false
  });
  envRT.texture.mapping = THREE.CubeUVReflectionMapping;
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1.0;

  // 1-triangle PMREM blender pass
  const blendU = { tA: { value: null }, tB: { value: null }, uK: { value: 0.0 } };
  const blendMat = new THREE.ShaderMaterial({
    uniforms: blendU,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform sampler2D tA, tB; uniform float uK; void main(){ gl_FragColor=mix(texture2D(tA,vUv),texture2D(tB,vUv),uK); }'
  });
  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  triGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const blendQuad = new THREE.Mesh(triGeo, blendMat);
  blendQuad.frustumCulled = false;
  const blendCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let lastEnvKey = '';

  function blendEnvironment(st) {
    const key = `${st.a}|${st.b}|${st.w.toFixed(4)}`;
    if (key === lastEnvKey) return;
    lastEnvKey = key;
    const prevRT = renderer.getRenderTarget();
    blendU.tA.value = modes[st.a].env.texture;
    blendU.tB.value = modes[st.b].env.texture;
    blendU.uK.value = st.a === st.b ? 0.0 : st.w;
    renderer.setRenderTarget(envRT);
    renderer.render(blendQuad, blendCam);
    renderer.setRenderTarget(prevRT);
  }

  let currentState = null;

  return {
    modes,
    stateAt: computeRawState,
    get state() { return currentState; },
    update(spec, { sunLight, hemiLight, camPos, fov = 46, viewH = 720, t = 0 }) {
      const st = computeRawState(spec);
      // High-altitude clarity relief matching Babylon HIGH_VIEW
      const high = smoothstep(300.0, 800.0, camPos.y) * (1.0 - st.night);
      if (high > 0.001) {
        st.fogDensity *= 1.0 - 0.36 * high;
        st.grade.contrast *= 1.0 + 0.08 * high;
      }
      currentState = st;

      if (sunLight) {
        sunLight.color.copy(st.keyColor);
        sunLight.intensity = st.keyIntensity;
      }
      if (hemiLight) {
        hemiLight.color.copy(st.fillColor);
        hemiLight.groundColor.copy(st.groundColor);
        hemiLight.intensity = st.fillIntensity;
      }

      applyAtmosphereAndSky(st, camPos.y, fov, viewH, t);
      blendEnvironment(st);
      return st;
    }
  };
}

/** Backwards-compatible factory wrapping pre-baked sky IBL if called standalone. */
export function createSkyIBLUpdater(renderer, scene, skyDome) {
  const dl = createDaylightSystem(renderer, scene, skyDome);
  return {
    daylight: dl,
    update(force, spec = { a: 'morning', b: 'morning', k: 0 }, ctx = {}) {
      return dl.update(spec, ctx);
    }
  };
}
