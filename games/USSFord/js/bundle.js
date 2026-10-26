// ../game/GameHub/games/USSFord/js/main.js
import * as THREE8 from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// ../game/GameHub/games/USSFord/js/config.js
import * as THREE from "three";
var DECK_MIN_X = -40;
var DECK_MAX_X = 44;
var DECK_MIN_Z = -155;
var DECK_MAX_Z = 155;
var DECK_Y = 12.2;
var RUNWAY_START = new THREE.Vector2(-4.5, -152);
var RUNWAY_END = new THREE.Vector2(36.5, 42);
var RUNWAY_DIR = new THREE.Vector2(36.5 - -4.5, 42 - -152).normalize();
var RUNWAY_YAW = Math.atan2(RUNWAY_DIR.x, RUNWAY_DIR.y);
var ORTHO_FRUSTUM_HEIGHT = 165;
var CAMERA_PRESETS = {
  iso: { pos: new THREE.Vector3(-245, 195, 235), target: new THREE.Vector3(-2, 12, 5), zoom: 1.18 },
  bow: { pos: new THREE.Vector3(-185, 138, 225), target: new THREE.Vector3(0, 12, 82), zoom: 2.15 },
  island: { pos: new THREE.Vector3(-220, 148, 35), target: new THREE.Vector3(-22, 22, -52), zoom: 2.35 },
  stern: { pos: new THREE.Vector3(-210, 152, -165), target: new THREE.Vector3(6, 12, -60), zoom: 1.85 }
};
function lerpYaw(a, b, t) {
  let diff = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
function angleDiff(a, b) {
  let diff = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// ../game/GameHub/games/USSFord/js/ocean.js
import * as THREE2 from "three";
var oceanUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE2.Vector3(-135, 260, 130).normalize() },
  uSunColor: { value: new THREE2.Color(16776949) },
  uDeepColor: { value: new THREE2.Color(532285) },
  // Deep North Atlantic indigo navy
  uMidColor: { value: new THREE2.Color(1325407) },
  // Sunlit navy wave face
  uSkyColor: { value: new THREE2.Color(5405595) },
  // Muted steel-blue sky reflection
  uWakeTurquoise: { value: new THREE2.Color(9021887) },
  // Cool blue-white aerated sea edge
  uFoamWhite: { value: new THREE2.Color(16185852) }
  // Brilliant sunlit sea froth
};
function createOceanMaterial() {
  return new THREE2.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: `
            uniform float uTime;
            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying float vWaveHeight;
            varying float vCrestFactor;

            float vHash(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float vNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(vHash(i), vHash(i + vec2(1.0, 0.0)), u.x),
                    mix(vHash(i + vec2(0.0, 1.0)), vHash(i + vec2(1.0, 1.0)), u.x),
                    u.y
                );
            }

            void addCurvedGerstnerWave(
                vec2 dir, float steepness, float wavelength, float speedScale,
                vec2 warpedXZ, float phaseJitter, float time,
                inout vec3 disp, inout vec3 tangent, inout vec3 binormal, inout float jacobian
            ) {
                float k = 6.28318530718 / wavelength;
                float c = sqrt(9.81 / k) * speedScale;
                float theta = k * (dot(dir, warpedXZ) - c * time) + phaseJitter;
                float a = steepness / k;

                float s = sin(theta);
                float cs = cos(theta);

                disp.x += dir.x * (a * cs);
                disp.y += a * s;
                disp.z += dir.y * (a * cs);

                float wa = k * a;
                tangent.x  -= dir.x * dir.x * wa * s;
                tangent.y  += dir.x * wa * cs;
                tangent.z  -= dir.x * dir.y * wa * s;

                binormal.x -= dir.x * dir.y * wa * s;
                binormal.y += dir.y * wa * cs;
                binormal.z -= dir.y * dir.y * wa * s;

                jacobian -= wa * s;
            }

            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vec2 posXZ = wp.xz;
                float t = uTime;

                vec2 warp1 = vec2(
                    vNoise(posXZ * 0.0045 + vec2(t * 0.015, -t * 0.012)),
                    vNoise(posXZ * 0.0045 + vec2(19.3, 47.1) - t * 0.014)
                ) - 0.5;
                vec2 warp2 = vec2(
                    vNoise(posXZ * 0.014 - vec2(t * 0.03, t * 0.02)),
                    vNoise(posXZ * 0.014 + vec2(73.7, 11.9) + t * 0.025)
                ) - 0.5;

                vec2 swellXZ = posXZ + warp1 * 30.0 + warp2 * 8.5;
                vec2 chopXZ  = posXZ + warp1 * 14.0 + warp2 * 9.5;
                float phaseMod = (warp1.x + warp2.y) * 2.2;

                vec3 disp = vec3(0.0);
                vec3 tangent = vec3(1.0, 0.0, 0.0);
                vec3 binormal = vec3(0.0, 0.0, 1.0);
                float jacobian = 1.0;

                // Directional wind-wave spectrum aligned with diagonal sea state
                addCurvedGerstnerWave(normalize(vec2( 0.62,  0.78)), 0.135, 165.0, 1.15, swellXZ, phaseMod * 0.6,  t, disp, tangent, binormal, jacobian);
                addCurvedGerstnerWave(normalize(vec2(-0.48,  0.88)), 0.115, 112.0, 1.25, swellXZ, phaseMod * 0.8 + 1.7, t, disp, tangent, binormal, jacobian);
                addCurvedGerstnerWave(normalize(vec2( 0.82,  0.57)), 0.105,  76.0, 1.38, swellXZ, phaseMod * 1.1 + 3.1, t, disp, tangent, binormal, jacobian);

                addCurvedGerstnerWave(normalize(vec2(-0.22,  0.97)), 0.095,  52.0, 1.52, chopXZ,  phaseMod * 1.3 + 0.9, t, disp, tangent, binormal, jacobian);
                addCurvedGerstnerWave(normalize(vec2( 0.88, -0.47)), 0.085,  37.0, 1.68, chopXZ,  phaseMod * 1.5 + 4.2, t, disp, tangent, binormal, jacobian);
                addCurvedGerstnerWave(normalize(vec2(-0.72,  0.69)), 0.078,  26.3, 1.85, chopXZ,  phaseMod * 1.7 + 2.3, t, disp, tangent, binormal, jacobian);
                addCurvedGerstnerWave(normalize(vec2( 0.35,  0.94)), 0.068,  18.1, 2.05, chopXZ,  phaseMod * 1.9 + 5.4, t, disp, tangent, binormal, jacobian);

                addCurvedGerstnerWave(normalize(vec2(-0.85, -0.52)), 0.058,  12.4, 2.30, chopXZ,  phaseMod * 2.1 + 1.2, t, disp, tangent, binormal, jacobian);
                addCurvedGerstnerWave(normalize(vec2( 0.66, -0.75)), 0.048,   8.3, 2.60, chopXZ,  phaseMod * 2.4 + 3.8, t, disp, tangent, binormal, jacobian);
                addCurvedGerstnerWave(normalize(vec2(-0.38,  0.92)), 0.042,   5.7, 2.95, chopXZ,  phaseMod * 2.7 + 0.4, t, disp, tangent, binormal, jacobian);

                float hullDistX = abs(wp.x);
                float hullDistZ = abs(wp.z);
                float hullMask = smoothstep(18.0, 38.0, hullDistX) + smoothstep(145.0, 178.0, hullDistZ);
                hullMask = clamp(hullMask, 0.22, 1.0);

                wp.xyz += disp * hullMask;
                vWorldPos = wp.xyz;

                vec3 geoNormal = normalize(cross(binormal, tangent));
                vNormal = normalize(mix(vec3(0.0, 1.0, 0.0), geoNormal, hullMask));

                vWaveHeight = disp.y * hullMask;
                vCrestFactor = clamp((1.0 - jacobian) * 0.88 + disp.y * 0.25, 0.0, 1.6) * hullMask;

                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
    fragmentShader: `
            uniform float uTime;
            uniform vec3 uSunDir;
            uniform vec3 uSunColor;
            uniform vec3 uDeepColor;
            uniform vec3 uMidColor;
            uniform vec3 uSkyColor;
            uniform vec3 uWakeTurquoise;
            uniform vec3 uFoamWhite;

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying float vWaveHeight;
            varying float vCrestFactor;

            const mat2 mRot = mat2(0.80, -0.60, 0.60, 0.80);

            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

            float snoise(vec2 v) {
                const vec4 C = vec4(
                    0.211324865405187,
                    0.366025403784439,
                   -0.577350269189626,
                    0.024390243902439
                );
                vec2 i  = floor(v + dot(v, C.yy));
                vec2 x0 = v - i + dot(i, C.xx);
                vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                vec4 x12 = x0.xyxy + C.xxzz;
                x12.xy -= i1;
                i = mod289(i);
                vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
                vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
                m = m * m;
                m = m * m;
                vec3 x = 2.0 * fract(p * C.www) - 1.0;
                vec3 h = abs(x) - 0.5;
                vec3 ox = floor(x + 0.5);
                vec3 a0 = x - ox;
                m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
                vec3 g;
                g.x  = a0.x  * x0.x  + h.x  * x0.y;
                g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                return 130.0 * dot(m, g);
            }

            float capillaryHeight(vec2 p, float t) {
                float h = 0.0;
                float amp = 0.54;
                vec2 q = vec2(p.x * 0.24 + p.y * 0.09, p.y * 0.17 - p.x * 0.06);

                vec2 windA = vec2(t * 0.45, -t * 0.82);
                vec2 windB = vec2(-t * 0.38, -t * 0.64);

                for (int i = 0; i < 5; i++) {
                    float n1 = snoise(q + windA);
                    float n2 = snoise(q * 1.42 - windB + vec2(17.3, 9.1));
                    float waveFacet = (n1 * 0.62 + n2 * 0.38);
                    waveFacet = waveFacet - 0.28 * abs(waveFacet);
                    h += waveFacet * amp;
                    q = (mRot * q) * 2.12 + vec2(13.7, 29.3);
                    windA *= 1.32;
                    windB *= 1.28;
                    amp *= 0.48;
                }
                return h;
            }

            float wakeTurbulence(vec2 p, float speed) {
                vec2 q = p * 0.18 + vec2(0.0, uTime * speed * 0.08);
                float w1 = snoise(q * 0.55);
                float w2 = snoise(mRot * q * 0.58 + vec2(4.2, -3.1));
                vec2 warped = q + vec2(w1, w2) * 0.90;

                float f = 0.0;
                float a = 0.52;
                for (int i = 0; i < 4; i++) {
                    f += a * (0.5 + 0.5 * snoise(warped));
                    warped = (mRot * warped) * 2.12 + vec2(7.1, 19.4);
                    a *= 0.48;
                }
                return f;
            }

            float foamCellularLace(vec2 p) {
                float n1 = abs(snoise(p * 0.45));
                float n2 = abs(snoise((mRot * p) * 1.05 + vec2(11.3, 5.7)));
                float n3 = abs(snoise(p * 2.35 - vec2(3.4, 14.8)));
                float web1 = 1.0 - smoothstep(0.0, 0.52, n1);
                float web2 = 1.0 - smoothstep(0.0, 0.46, n2);
                float web3 = 1.0 - smoothstep(0.0, 0.40, n3);
                return clamp(web1 * 0.54 + web2 * 0.32 + web3 * 0.26, 0.0, 1.0);
            }

            void main() {
                float x = vWorldPos.x;
                float z = vWorldPos.z;
                float absX = abs(x);

                vec2 advectedXZ = vec2(x, z - uTime * 19.0);

                vec2 macroWarp = vec2(
                    snoise(advectedXZ * 0.008 + vec2(uTime * 0.04, 0.0)),
                    snoise(advectedXZ * 0.008 + vec2(31.4, 15.9))
                ) * 8.5;
                vec2 sampleXZ = advectedXZ + macroWarp;

                float eps = 0.30;
                float hC = capillaryHeight(sampleXZ, uTime);
                float hX = capillaryHeight(sampleXZ + vec2(eps, 0.0), uTime);
                float hZ = capillaryHeight(sampleXZ + vec2(0.0, eps), uTime);

                vec3 microNormal = normalize(vec3((hC - hX) / eps * 0.44, 1.0, (hC - hZ) / eps * 0.44));
                vec3 normal = normalize(vec3(
                    vNormal.x + microNormal.x * 0.90,
                    vNormal.y * microNormal.y,
                    vNormal.z + microNormal.z * 0.90
                ));

                vec3 viewDir = normalize(cameraPosition - vWorldPos);
                vec3 lightDir = normalize(uSunDir);
                float NdotV = max(dot(normal, viewDir), 0.001);
                float NdotL = max(dot(normal, lightDir), 0.0);

                float F0 = 0.0204;
                float fresnel = F0 + (1.0 - F0) * pow(clamp(1.0 - NdotV, 0.0, 1.0), 4.2);

                float heightFactor = clamp((vWaveHeight + 2.2) / 4.8, 0.0, 1.0);
                float slopeFactor = clamp(1.0 - normal.y, 0.0, 1.0);
                float colorMix = clamp(heightFactor * 0.58 + slopeFactor * 0.58 + hC * 0.22, 0.0, 1.0);
                vec3 waterBodyCol = mix(uDeepColor, uMidColor, colorMix);
                waterBodyCol *= (0.82 + 0.28 * NdotL);

                // Subsurface oceanic scattering in wave crests
                float crestThinness = smoothstep(0.20, 0.92, vCrestFactor + hC * 0.35);
                float backLight = pow(clamp(dot(viewDir, -lightDir) * 0.5 + 0.5, 0.0, 1.0), 2.0);
                float upwardScatter = clamp(normal.y * 0.6 + 0.4, 0.0, 1.0);
                float sssIntensity = crestThinness * (0.42 + 0.58 * backLight) * upwardScatter;
                vec3 crestSSSCol = mix(uMidColor * 1.15, uWakeTurquoise * 0.65, 0.22);
                waterBodyCol = mix(waterBodyCol, crestSSSCol, clamp(sssIntensity * 0.35, 0.0, 0.40));

                vec3 reflDir = reflect(-viewDir, normal);
                float skyGrad = clamp(reflDir.y * 0.65 + 0.35, 0.0, 1.0);
                vec3 skyReflCol = mix(uSkyColor * 1.12, uMidColor * 0.85, skyGrad * 0.50);
                vec3 oceanCol = mix(waterBodyCol, skyReflCol, clamp(fresnel * 0.78, 0.0, 0.70));

                // Crisp sun glint sparkles on wind wavelets
                vec3 halfVec = normalize(lightDir + viewDir);
                float NdotH = max(dot(normal, halfVec), 0.0);
                float specCore = pow(NdotH, 420.0) * 2.4;
                float specBroad = pow(NdotH, 48.0) * 0.18;
                oceanCol += uSunColor * (specCore + specBroad) * (0.35 + 0.65 * fresnel);

                // Sparse, natural wind-driven breaking whitecaps across open sea
                float laceOpen = foamCellularLace(sampleXZ * 0.42);
                float patchNoise = snoise(sampleXZ * 0.024 + vec2(5.2, -8.1));
                float whitecapMask = smoothstep(0.92, 1.45, vCrestFactor + hC * 0.42 + patchNoise * 0.32);
                float openWhitecaps = whitecapMask * smoothstep(0.40, 0.82, laceOpen) * 0.42;

                float totalWhiteFoam = openWhitecaps;
                float totalTurquoise = crestThinness * 0.18;

                float hullHalfW = 20.2;
                if (z > 70.0) {
                    float tb = clamp((z - 70.0) / 78.0, 0.0, 1.0);
                    hullHalfW = mix(20.2, 0.8, pow(tb, 1.35));
                } else if (z < -95.0) {
                    float ts = clamp((-95.0 - z) / 55.0, 0.0, 1.0);
                    hullHalfW = mix(20.2, 16.0, ts);
                }

                // A. Submerged Bulbous Bow Glow at Forward Stem
                float bulbDist = length(vec2(x * 1.35, z - 153.5));
                float bulbGlow = exp(-pow(bulbDist / 7.2, 2.0));
                oceanCol = mix(oceanCol, vec3(0.34, 0.50, 0.62), bulbGlow * 0.48);

                float distFromBow = 148.0 - z;

                // B. Tight Bow Stem Splash & Subtle Kelvin Bow Wave Ribbons
                if (z <= 154.0 && z >= -35.0) {
                    float bowWaveAngle = 0.25;
                    float armWobble = snoise(vec2(z * 0.075 - uTime * 1.4, absX * 0.08)) * (1.2 + distFromBow * 0.015);
                    float bowWaveDist = abs(absX - (distFromBow * bowWaveAngle + 1.0 + armWobble));
                    float bowWaveRibbon = exp(-pow(bowWaveDist / (2.0 + distFromBow * 0.025), 2.0));
                    bowWaveRibbon *= smoothstep(154.0, 144.0, z);
                    bowWaveRibbon *= smoothstep(-35.0, 75.0, z);

                    float bowFroth = wakeTurbulence(vec2(absX * 1.6, z * 1.0), 25.0);
                    float bowFoam = bowWaveRibbon * smoothstep(0.24, 0.68, bowFroth);

                    totalWhiteFoam = max(totalWhiteFoam, bowFoam * 1.28);
                    totalTurquoise = max(totalTurquoise, bowWaveRibbon * 0.92);
                }

                // C. Intermittent Billowing Hull-Side Breaking Wave Clusters
                if (z <= 148.0 && z >= -150.0) {
                    float edgeWobble = snoise(vec2(z * 0.12 - uTime * 1.9, x * 0.15)) * 1.4;
                    float dHull = absX - (hullHalfW + edgeWobble);

                    float clusterEnv = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(z * 0.085 - uTime * 1.1 + snoise(vec2(z * 0.04, uTime * 0.3)) * 1.8), 1.6);
                    float sideBand = exp(-pow((dHull - 2.6) / (5.8 * clusterEnv + 2.2), 2.0)) * step(-2.0, dHull);

                    float rollerBillow = snoise(vec2(absX * 0.20, z * 0.10 - uTime * 1.3));
                    float contactTurb = wakeTurbulence(vec2(absX * 1.55, z * 0.95), 22.0);

                    float contactFoam = sideBand * clusterEnv * smoothstep(0.22, 0.64, contactTurb + rollerBillow * 0.30);
                    float tightContact = exp(-pow(abs(dHull) / 2.1, 2.0));

                    float wispCoord = absX - hullHalfW - (110.0 - z) * 0.08;
                    float wispBand = exp(-pow((dHull - 9.5) / 7.5, 2.0)) * step(0.0, dHull);
                    float wispPattern = snoise(vec2(wispCoord * 0.28, z * 0.14 - uTime * 1.2));
                    float sideWisps = wispBand * smoothstep(0.32, 0.72, wispPattern) * 0.68;

                    totalWhiteFoam = max(totalWhiteFoam, contactFoam * 1.35 + tightContact * 0.88 + sideWisps);
                    totalTurquoise = max(totalTurquoise, sideBand * 0.95 + tightContact * 0.85 + sideWisps * 0.55);
                }

                // D. Refined Stern Propeller Churning Wake Trace
                if (z <= -136.0 && z >= -1050.0) {
                    float distBehindStern = -146.0 - z;

                    float wakeMeander = snoise(vec2(0.0, z * 0.018 - uTime * 0.45)) * (1.6 + max(0.0, distBehindStern) * 0.016);
                    float wx = x + wakeMeander;
                    float absWX = abs(wx);

                    float wakeWidth = mix(15.5, 48.0, clamp(distBehindStern / 360.0, 0.0, 1.0));
                    float centerWash = exp(-pow(absWX / wakeWidth, 1.95));

                    float screwOuter = exp(-pow((absWX - 7.8) / (4.5 + max(0.0, distBehindStern) * 0.028), 2.0));
                    float screwInner = exp(-pow((absWX - 2.6) / (4.2 + max(0.0, distBehindStern) * 0.024), 2.0));
                    float screwWash = (screwOuter * 0.85 + screwInner * 1.05);

                    float turbSpeed = 32.0;
                    float sternFroth1 = wakeTurbulence(vec2(wx * 0.42, z * 0.24), turbSpeed);
                    float sternFroth2 = wakeTurbulence(vec2(wx * 1.25, z * 0.62), turbSpeed * 1.25);
                    float combinedFroth = sternFroth1 * 0.56 + sternFroth2 * 0.44;

                    float sternFade = smoothstep(-136.0, -148.0, z) * smoothstep(-1050.0, -680.0, z);

                    float washEnvelope = (centerWash * 0.82 + screwWash * 0.76) * sternFade;
                    float foamIntensity = washEnvelope * smoothstep(0.18, 0.56, combinedFroth * 1.38);

                    float transomBoil = exp(-pow(max(0.0, distBehindStern) / 115.0, 1.5)) * exp(-pow(absWX / 14.5, 2.2)) * sternFade;

                    totalWhiteFoam = max(totalWhiteFoam, foamIntensity * 1.62 + transomBoil * 0.92);
                    totalTurquoise = max(totalTurquoise, washEnvelope * 1.42);

                    float kelvinArm = abs(absWX - (max(0.0, distBehindStern) * 0.22 + 14.0));
                    float kelvinShock = exp(-pow(kelvinArm / (3.8 + max(0.0, distBehindStern) * 0.020), 2.0)) * sternFade;
                    totalWhiteFoam = max(totalWhiteFoam, kelvinShock * smoothstep(0.28, 0.68, combinedFroth) * 0.85);
                }

                float wakeLace = foamCellularLace(advectedXZ * 0.76);
                float foamFactor = smoothstep(0.11, 0.72, totalWhiteFoam) * (0.60 + 0.40 * wakeLace);
                foamFactor = clamp(foamFactor, 0.0, 0.95);

                float aquaFactor = clamp(totalTurquoise, 0.0, 0.96) * (0.68 + 0.32 * wakeLace);

                oceanCol = mix(oceanCol, uWakeTurquoise * 1.08, aquaFactor * 0.62);

                vec3 shadedFoam = uFoamWhite * (0.84 + 0.16 * NdotL);
                oceanCol = mix(oceanCol, shadedFoam, foamFactor);

                float dist = length(cameraPosition - vWorldPos);
                float fogF = 1.0 - exp(-pow(dist * 0.00018, 2.0));
                oceanCol = mix(oceanCol, vec3(0.07, 0.21, 0.40), clamp(fogF, 0.0, 1.0));

                gl_FragColor = vec4(oceanCol, 1.0);
            }
        `
  });
}
function createOcean(scene2) {
  const oceanMaterial = createOceanMaterial();
  const oceanGeo = new THREE2.PlaneGeometry(2800, 2800, 380, 380);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMesh2 = new THREE2.Mesh(oceanGeo, oceanMaterial);
  scene2.add(oceanMesh2);
  return { oceanMesh: oceanMesh2, oceanMaterial, oceanUniforms };
}
function buildMaritimeEnvironment(renderer2, scene2, isDay = true) {
  const pmremGenerator = new THREE2.PMREMGenerator(renderer2);
  pmremGenerator.compileEquirectangularShader();
  const envScene = new THREE2.Scene();
  const skyGeo = new THREE2.SphereGeometry(500, 32, 24);
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 512;
  skyCanvas.height = 256;
  const sCtx = skyCanvas.getContext("2d");
  const grad = sCtx.createLinearGradient(0, 0, 0, 256);
  if (isDay) {
    grad.addColorStop(0, "#1e4f8a");
    grad.addColorStop(0.42, "#5c95ce");
    grad.addColorStop(0.49, "#c7def4");
    grad.addColorStop(0.51, "#123966");
    grad.addColorStop(1, "#06172e");
  } else {
    grad.addColorStop(0, "#1c1635");
    grad.addColorStop(0.42, "#7c3f58");
    grad.addColorStop(0.49, "#f59e0b");
    grad.addColorStop(0.51, "#27203d");
    grad.addColorStop(1, "#090d1a");
  }
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 512, 256);
  sCtx.fillStyle = isDay ? "#ffffff" : "#fde047";
  sCtx.beginPath();
  sCtx.arc(160, 75, 16, 0, Math.PI * 2);
  sCtx.fill();
  const skyTex = new THREE2.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE2.SRGBColorSpace;
  const skyMat = new THREE2.MeshBasicMaterial({ map: skyTex, side: THREE2.BackSide });
  envScene.add(new THREE2.Mesh(skyGeo, skyMat));
  const envRT = pmremGenerator.fromScene(envScene, 0.02);
  scene2.environment = envRT.texture;
  pmremGenerator.dispose();
  skyTex.dispose();
  skyGeo.dispose();
  skyMat.dispose();
}
function setOceanLightingMode(mode, sunLight2, hemiLight2, fillLight2, scene2, renderer2) {
  if (mode === "day") {
    buildMaritimeEnvironment(renderer2, scene2, true);
    scene2.background.setHex(664127);
    scene2.fog.color.setHex(928589);
    hemiLight2.color.setHex(8302826);
    hemiLight2.groundColor.setHex(598333);
    hemiLight2.intensity = 0.76;
    sunLight2.color.setHex(16776949);
    sunLight2.intensity = 3.05;
    sunLight2.position.set(-135, 260, 130);
    fillLight2.color.setHex(5934264);
    fillLight2.intensity = 0.28;
    fillLight2.position.set(160, 75, -120);
    oceanUniforms.uSunDir.value.copy(sunLight2.position).normalize();
    oceanUniforms.uDeepColor.value.setHex(532285);
    oceanUniforms.uMidColor.value.setHex(1325407);
    oceanUniforms.uSkyColor.value.setHex(5405595);
    oceanUniforms.uWakeTurquoise.value.setHex(9021887);
    oceanUniforms.uFoamWhite.value.setHex(16185852);
    oceanUniforms.uSunColor.value.setHex(16776949);
  } else {
    buildMaritimeEnvironment(renderer2, scene2, false);
    scene2.background.setHex(1709094);
    scene2.fog.color.setHex(2627890);
    hemiLight2.color.setHex(16628340);
    hemiLight2.intensity = 0.75;
    sunLight2.color.setHex(16486972);
    sunLight2.intensity = 3.2;
    sunLight2.position.set(-220, 85, -110);
    fillLight2.intensity = 0.3;
    oceanUniforms.uSunDir.value.copy(sunLight2.position).normalize();
    oceanUniforms.uDeepColor.value.setHex(332066);
    oceanUniforms.uMidColor.value.setHex(1255490);
    oceanUniforms.uSkyColor.value.setHex(4861522);
    oceanUniforms.uWakeTurquoise.value.setHex(947828);
    oceanUniforms.uFoamWhite.value.setHex(14412542);
    oceanUniforms.uSunColor.value.setHex(16628340);
  }
}

// ../game/GameHub/games/USSFord/js/carrier.js
import * as THREE4 from "three";

// ../game/GameHub/games/USSFord/js/textures.js
import * as THREE3 from "three";
function heightCanvasToNormalTex(heightCanvas, strength = 2.6, repeatS = 1, repeatT = 1, maxAniso = 4) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext("2d");
  const srcData = srcCtx.getImageData(0, 0, w, h).data;
  const normCanvas = document.createElement("canvas");
  normCanvas.width = w;
  normCanvas.height = h;
  const nCtx = normCanvas.getContext("2d");
  const nImg = nCtx.createImageData(w, h);
  const dst = nImg.data;
  const sampleH = (x, y) => {
    const cx = (x + w) % w;
    const cy = Math.max(0, Math.min(h - 1, y));
    return srcData[(cy * w + cx) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hL = sampleH(x - 1, y);
      const hR = sampleH(x + 1, y);
      const hU = sampleH(x, y - 1);
      const hD = sampleH(x, y + 1);
      let dx = (hL - hR) * strength;
      let dy = (hU - hD) * strength;
      let dz = 1;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
      dx *= invLen;
      dy *= invLen;
      dz *= invLen;
      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((dx * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((dy * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((dz * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  const normalTex = new THREE3.CanvasTexture(normCanvas);
  normalTex.anisotropy = maxAniso;
  if (repeatS > 1 || repeatT > 1) {
    normalTex.wrapS = THREE3.RepeatWrapping;
    normalTex.wrapT = THREE3.RepeatWrapping;
    normalTex.repeat.set(repeatS, repeatT);
  }
  normalTex.needsUpdate = true;
  return normalTex;
}
function createAircraftSurfaceMaps(baseHex = "#b8c2ce", seamAlpha = 0.28, maxAniso = 4) {
  const size = 512;
  const cCanvas = document.createElement("canvas");
  cCanvas.width = size;
  cCanvas.height = size;
  const cCtx = cCanvas.getContext("2d");
  const hCanvas = document.createElement("canvas");
  hCanvas.width = size;
  hCanvas.height = size;
  const hCtx = hCanvas.getContext("2d");
  cCtx.fillStyle = baseHex;
  cCtx.fillRect(0, 0, size, size);
  hCtx.fillStyle = "#808080";
  hCtx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 64) {
    for (let x = 0; x < size; x += 64) {
      const shade = (x + y) % 128 === 0 ? "rgba(255,255,255,0.045)" : "rgba(15,23,42,0.035)";
      cCtx.fillStyle = shade;
      cCtx.fillRect(x + 2, y + 2, 60, 60);
      hCtx.fillStyle = (x + y) % 128 === 0 ? "#868686" : "#7a7a7a";
      hCtx.fillRect(x + 2, y + 2, 60, 60);
      cCtx.strokeStyle = `rgba(30, 41, 59, ${seamAlpha})`;
      cCtx.lineWidth = 1.5;
      cCtx.strokeRect(x, y, 64, 64);
      hCtx.strokeStyle = "#525252";
      hCtx.lineWidth = 2;
      hCtx.strokeRect(x, y, 64, 64);
      cCtx.fillStyle = `rgba(30, 41, 59, ${seamAlpha * 0.75})`;
      hCtx.fillStyle = "#606060";
      for (let r = 8; r < 60; r += 12) {
        cCtx.fillRect(x + r, y + 4, 1.5, 1.5);
        cCtx.fillRect(x + 4, y + r, 1.5, 1.5);
        hCtx.fillRect(x + r, y + 4, 2, 2);
        hCtx.fillRect(x + 4, y + r, 2, 2);
      }
    }
  }
  for (let i = 0; i < 65; i++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    cCtx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(30,41,59,0.035)";
    cCtx.fillRect(sx, sy, 3 + Math.random() * 6, 40 + Math.random() * 85);
  }
  const colorTex = new THREE3.CanvasTexture(cCanvas);
  colorTex.wrapS = THREE3.RepeatWrapping;
  colorTex.wrapT = THREE3.RepeatWrapping;
  colorTex.repeat.set(2, 2);
  colorTex.anisotropy = maxAniso;
  colorTex.colorSpace = THREE3.SRGBColorSpace;
  const normalTex = heightCanvasToNormalTex(hCanvas, 1.9, 2, 2, maxAniso);
  return { colorTex, normalTex };
}
function createUSNavyInsigniaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.arc(128, 64, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cbd5e1";
  ctx.fillRect(20, 48, 216, 32);
  ctx.fillStyle = "#475569";
  ctx.fillRect(20, 58, 216, 12);
  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.arc(128, 64, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e2e8f0";
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const aOuter = -Math.PI / 2 + i * Math.PI * 2 / 5;
    const aInner = aOuter + Math.PI / 5;
    const rOuter = 38;
    const rInner = 15;
    const ox = 128 + Math.cos(aOuter) * rOuter;
    const oy = 64 + Math.sin(aOuter) * rOuter;
    const ix = 128 + Math.cos(aInner) * rInner;
    const iy = 64 + Math.sin(aInner) * rInner;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE3.CanvasTexture(canvas);
  tex.colorSpace = THREE3.SRGBColorSpace;
  return tex;
}
function createFlightDeckMaps(maxAniso = 4) {
  const width = 2048;
  const height = 4096;
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext("2d");
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext("2d");
  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext("2d");
  const toPx = (x) => (x - DECK_MIN_X) / (DECK_MAX_X - DECK_MIN_X) * width;
  const toPy = (z) => (1 - (z - DECK_MIN_Z) / (DECK_MAX_Z - DECK_MIN_Z)) * height;
  ctx.fillStyle = "#545d67";
  ctx.fillRect(0, 0, width, height);
  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, width, height);
  rCtx.fillStyle = "#e2e2e2";
  rCtx.fillRect(0, 0, width, height);
  const wearZones = [
    { x: -1, z: 75, r: 1150, c1: "rgba(120, 130, 142, 0.22)", c2: "rgba(84, 93, 103, 0.0)" },
    { x: 8, z: -25, r: 1050, c1: "rgba(122, 132, 144, 0.20)", c2: "rgba(84, 93, 103, 0.0)" },
    { x: -18, z: 25, r: 760, c1: "rgba(72, 80, 90, 0.20)", c2: "rgba(84, 93, 103, 0.0)" },
    { x: 2, z: -115, r: 880, c1: "rgba(118, 128, 138, 0.18)", c2: "rgba(84, 93, 103, 0.0)" }
  ];
  wearZones.forEach((wz) => {
    const g = ctx.createRadialGradient(toPx(wz.x), toPy(wz.z), 40, toPx(wz.x), toPy(wz.z), wz.r);
    g.addColorStop(0, wz.c1);
    g.addColorStop(1, wz.c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  });
  for (let x = 0; x < width; x += 12) {
    const stripTone = x % 24 === 0 ? "rgba(240, 245, 250, 0.055)" : "rgba(55, 62, 70, 0.038)";
    ctx.fillStyle = stripTone;
    ctx.fillRect(x, 0, 6, height);
    bCtx.fillStyle = x % 24 === 0 ? "#888888" : "#747474";
    bCtx.fillRect(x, 0, 4, height);
  }
  for (let s = 0; s < 160; s++) {
    const sx = toPx(-28 + Math.random() * 60);
    const sy = Math.random() * height;
    const sLen = 140 + Math.random() * 520;
    const sW = 3 + Math.random() * 14;
    const isLight = Math.random() > 0.42;
    ctx.fillStyle = isLight ? "rgba(235, 240, 246, 0.075)" : "rgba(65, 72, 80, 0.048)";
    ctx.fillRect(sx, sy, sW, sLen);
  }
  for (let gx = -38; gx <= 42; gx += 3.2) {
    const px = toPx(gx);
    ctx.strokeStyle = "rgba(58, 65, 74, 0.20)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
    bCtx.strokeStyle = "#626262";
    bCtx.beginPath();
    bCtx.moveTo(px, 0);
    bCtx.lineTo(px, height);
    bCtx.stroke();
  }
  for (let gz = -150; gz <= 150; gz += 8) {
    const py = toPy(gz);
    const isExpJoint = Math.abs(gz % 32) < 1;
    ctx.strokeStyle = isExpJoint ? "rgba(48, 54, 62, 0.36)" : "rgba(62, 68, 78, 0.16)";
    ctx.lineWidth = isExpJoint ? 2.6 : 1.1;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
    bCtx.strokeStyle = isExpJoint ? "#424242" : "#686868";
    bCtx.lineWidth = isExpJoint ? 2.8 : 1.1;
    bCtx.beginPath();
    bCtx.moveTo(0, py);
    bCtx.lineTo(width, py);
    bCtx.stroke();
  }
  for (let i = 0; i < 115e3; i++) {
    const rx = Math.random() * width;
    const ry = Math.random() * height;
    const isLight = Math.random() > 0.45;
    ctx.fillStyle = isLight ? "rgba(241, 245, 249, 0.068)" : "rgba(50, 56, 64, 0.048)";
    ctx.fillRect(rx, ry, 2 + Math.random() * 2, 2 + Math.random() * 4);
    bCtx.fillStyle = isLight ? "#989898" : "#646464";
    bCtx.fillRect(rx, ry, 2, 2);
  }
  function drawWeatheredBlastPatch(xM, zM, wM, lM, rotRad = 0) {
    const px = toPx(xM);
    const py = toPy(zM);
    const pw = wM / (DECK_MAX_X - DECK_MIN_X) * width;
    const pl = lM / (DECK_MAX_Z - DECK_MIN_Z) * height;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-rotRad);
    ctx.fillStyle = "rgba(126, 88, 58, 0.88)";
    ctx.fillRect(-pw * 0.5, -pl * 0.5, pw, pl);
    ctx.fillStyle = "rgba(96, 64, 40, 0.76)";
    ctx.fillRect(-pw * 0.42, -pl * 0.42, pw * 0.84, pl * 0.84);
    ctx.strokeStyle = "rgba(224, 185, 112, 0.88)";
    ctx.lineWidth = 3.6;
    ctx.strokeRect(-pw * 0.5, -pl * 0.5, pw, pl);
    ctx.strokeStyle = "rgba(52, 38, 26, 0.48)";
    ctx.lineWidth = 1.8;
    for (let r = -pw * 0.35; r <= pw * 0.35; r += pw * 0.23) {
      ctx.beginPath();
      ctx.moveTo(r, -pl * 0.5);
      ctx.lineTo(r, pl * 0.5);
      ctx.stroke();
    }
    ctx.restore();
    rCtx.save();
    rCtx.translate(px, py);
    rCtx.rotate(-rotRad);
    rCtx.fillStyle = "#909090";
    rCtx.fillRect(-pw * 0.5, -pl * 0.5, pw, pl);
    rCtx.restore();
  }
  drawWeatheredBlastPatch(-12.5, 32, 7.6, 10.5, 0.02);
  drawWeatheredBlastPatch(-3.5, 26, 7.2, 9.8, 0.02);
  drawWeatheredBlastPatch(-11.8, 14, 7.4, 9.5, 0.02);
  drawWeatheredBlastPatch(22, -48, 6.8, 9.2, -0.16);
  drawWeatheredBlastPatch(31.5, -56, 6.5, 8.8, -0.16);
  function drawOilStain(xM, zM, radPx = 38) {
    const px = toPx(xM);
    const py = toPy(zM);
    const g = ctx.createRadialGradient(px, py, 4, px, py, radPx);
    g.addColorStop(0, "rgba(38, 42, 48, 0.28)");
    g.addColorStop(0.6, "rgba(52, 58, 66, 0.13)");
    g.addColorStop(1, "rgba(70, 76, 84, 0.0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, radPx, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let z = -135; z <= 135; z += 11) {
    drawOilStain(-26 + (Math.random() - 0.5) * 6, z, 30 + Math.random() * 18);
  }
  for (let gz = -148; gz <= 148; gz += 4.5) {
    const rowOffset = Math.abs(Math.round(gz / 4.5)) % 2 * 2.25;
    for (let gx = -35 + rowOffset; gx <= 39; gx += 4.5) {
      const px = toPx(gx);
      const py = toPy(gz);
      if (px > 70 && px < width - 70 && py > 65 && py < height - 65) {
        ctx.fillStyle = "rgba(54, 60, 68, 0.45)";
        ctx.fillRect(px - 2.2, py - 2.2, 4.4, 4.4);
        ctx.fillStyle = "rgba(220, 228, 236, 0.52)";
        ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
        bCtx.fillStyle = "#484848";
        bCtx.fillRect(px - 2, py - 2, 4, 4);
      }
    }
  }
  const rStartX = toPx(-4.5), rStartY = toPy(-152);
  const rEndX = toPx(36.5), rEndY = toPy(42);
  const rAngle = Math.atan2(rEndY - rStartY, rEndX - rStartX);
  const rLen = Math.hypot(rEndX - rStartX, rEndY - rStartY);
  ctx.save();
  ctx.translate(rStartX, rStartY);
  ctx.rotate(rAngle);
  const trapGrad = ctx.createLinearGradient(0, 0, rLen, 0);
  trapGrad.addColorStop(0, "rgba(140, 148, 158, 0.12)");
  trapGrad.addColorStop(0.12, "rgba(18, 22, 26, 0.62)");
  trapGrad.addColorStop(0.32, "rgba(26, 31, 38, 0.52)");
  trapGrad.addColorStop(0.6, "rgba(38, 44, 52, 0.28)");
  trapGrad.addColorStop(1, "rgba(130, 138, 148, 0.10)");
  ctx.fillStyle = trapGrad;
  ctx.fillRect(0, -210, rLen, 420);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, -216, rLen * 0.97, 16);
  ctx.fillRect(0, 200, rLen * 0.97, 16);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fillRect(40, -190, rLen * 0.92, 8);
  ctx.fillRect(40, 182, rLen * 0.92, 8);
  for (let d = 70; d < rLen - 45; d += 125) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(d, -9, 72, 18);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(d + 72, -5, 24, 10);
  }
  for (let s = 0; s < 420; s++) {
    const sProgress = 0.06 + Math.random() * 0.76;
    const sx = sProgress * rLen;
    const spread = sProgress < 0.45 ? 235 : 170;
    const sy = (Math.random() - 0.5) * spread;
    const sLen = 65 + Math.random() * 260;
    const sThick = 1.6 + Math.random() * 4.2;
    ctx.fillStyle = s % 5 === 0 ? "rgba(235, 240, 246, 0.10)" : "rgba(24, 28, 34, 0.22)";
    ctx.fillRect(sx, sy, sLen, sThick);
    bCtx.save();
    bCtx.translate(rStartX, rStartY);
    bCtx.rotate(rAngle);
    bCtx.fillStyle = "#5e5e5e";
    bCtx.fillRect(sx, sy, sLen, sThick);
    bCtx.restore();
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(toPx(-15.5), toPy(-150));
  ctx.lineTo(toPx(-1), toPy(-32));
  ctx.lineTo(toPx(15.5), toPy(46));
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();
  ctx.setLineDash([32, 32]);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(toPx(-14.2), toPy(-150));
  ctx.lineTo(toPx(0.2), toPy(-32));
  ctx.lineTo(toPx(16.7), toPy(46));
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
  function drawCatapultTrack(x1, z1, x2, z2) {
    const p1x = toPx(x1), p1y = toPy(z1);
    const p2x = toPx(x2), p2y = toPy(z2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineWidth = 44;
    ctx.strokeStyle = "rgba(175, 182, 192, 0.22)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p1x - 14, p1y);
    ctx.lineTo(p2x - 14, p2y);
    ctx.moveTo(p1x + 14, p1y);
    ctx.lineTo(p2x + 14, p2y);
    ctx.lineWidth = 4.2;
    ctx.strokeStyle = "rgba(248, 250, 252, 0.78)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#1e2228";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = "#cbd5e1";
    ctx.stroke();
    ctx.restore();
    bCtx.save();
    bCtx.beginPath();
    bCtx.moveTo(p1x, p1y);
    bCtx.lineTo(p2x, p2y);
    bCtx.lineWidth = 12;
    bCtx.strokeStyle = "#303030";
    bCtx.stroke();
    bCtx.restore();
    rCtx.save();
    rCtx.beginPath();
    rCtx.moveTo(p1x, p1y);
    rCtx.lineTo(p2x, p2y);
    rCtx.lineWidth = 14;
    rCtx.strokeStyle = "#555555";
    rCtx.stroke();
    rCtx.restore();
  }
  drawCatapultTrack(-7.5, 48, -6.5, 148);
  drawCatapultTrack(8.5, 42, 7.5, 148);
  drawCatapultTrack(16, -55, 25.5, 42);
  drawCatapultTrack(26.5, -65, 36.5, 28);
  function drawBowHullNumber(x, z) {
    const px = toPx(x);
    const py = toPy(z);
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(0.92, -1.65);
    ctx.font = '800 220px "JetBrains Mono", "Inter", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(30, 35, 42, 0.78)";
    ctx.strokeText("78", 0, 0);
    ctx.fillStyle = "rgba(248, 250, 252, 0.92)";
    ctx.fillText("78", 0, 0);
    ctx.restore();
    for (let i = 0; i < 32; i++) {
      const sx = px + (Math.random() - 0.5) * 240;
      const sy = py - 140 + Math.random() * 280;
      ctx.fillStyle = "rgba(72, 78, 86, 0.32)";
      ctx.fillRect(sx, sy, 3 + Math.random() * 6, 40 + Math.random() * 90);
    }
  }
  drawBowHullNumber(0.5, 136.5);
  function drawElevatorOutline(x, z, wM, lM) {
    const px = toPx(x);
    const py = toPy(z);
    const pw = wM / (DECK_MAX_X - DECK_MIN_X) * width;
    const pl = lM / (DECK_MAX_Z - DECK_MIN_Z) * height;
    ctx.save();
    ctx.translate(px, py);
    ctx.strokeStyle = "rgba(234, 179, 8, 0.82)";
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 14]);
    ctx.strokeRect(-pw * 0.5, -pl * 0.5, pw, pl);
    ctx.restore();
  }
  drawElevatorOutline(-36.2, 22, 5.2, 15.5);
  drawElevatorOutline(-36.2, -18, 5.2, 15.5);
  drawElevatorOutline(-33.2, -92, 5.2, 15.5);
  drawElevatorOutline(33.2, -65, 5.2, 15.5);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(toPx(-5.5), toPy(-78));
  ctx.lineTo(toPx(-4.5), toPy(48));
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(234, 179, 8, 0.72)";
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(248, 250, 252, 0.90)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(toPx(-17.5), toPy(152.8));
  ctx.lineTo(toPx(17.5), toPy(152.8));
  ctx.moveTo(toPx(-22.5), toPy(-151.2));
  ctx.lineTo(toPx(26.5), toPy(-151.2));
  ctx.stroke();
  ctx.restore();
  const colorTex = new THREE3.CanvasTexture(colorCanvas);
  colorTex.anisotropy = maxAniso;
  colorTex.colorSpace = THREE3.SRGBColorSpace;
  colorTex.needsUpdate = true;
  const bumpTex = new THREE3.CanvasTexture(bumpCanvas);
  bumpTex.anisotropy = maxAniso;
  bumpTex.needsUpdate = true;
  const roughTex = new THREE3.CanvasTexture(roughCanvas);
  roughTex.anisotropy = maxAniso;
  roughTex.needsUpdate = true;
  const normalTex = heightCanvasToNormalTex(bumpCanvas, 2.8, 1, 1, maxAniso);
  return { colorTex, bumpTex, roughTex, normalTex };
}
function createNavalSteelHullTexture(maxAniso = 4) {
  const cCanvas = document.createElement("canvas");
  cCanvas.width = 1024;
  cCanvas.height = 512;
  const ctx = cCanvas.getContext("2d");
  const bCanvas = document.createElement("canvas");
  bCanvas.width = 1024;
  bCanvas.height = 512;
  const bCtx = bCanvas.getContext("2d");
  ctx.fillStyle = "#b8c2ce";
  ctx.fillRect(0, 0, 1024, 512);
  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, 1024, 512);
  for (let y = 0; y < 512; y += 32) {
    ctx.fillStyle = y % 64 === 0 ? "rgba(255,255,255,0.08)" : "rgba(30,41,59,0.038)";
    ctx.fillRect(0, y, 1024, 16);
    ctx.strokeStyle = "rgba(45, 55, 72, 0.26)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
    bCtx.strokeStyle = "#525252";
    bCtx.lineWidth = 2.2;
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.lineTo(1024, y);
    bCtx.stroke();
    const offset = y / 32 % 2 === 0 ? 0 : 32;
    for (let x = offset; x < 1024; x += 64) {
      ctx.strokeStyle = "rgba(45, 55, 72, 0.22)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 32);
      ctx.stroke();
      bCtx.strokeStyle = "#5a5a5a";
      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.lineTo(x, y + 32);
      bCtx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.065)";
      ctx.fillRect(x + 6, y + 4, 52, 24);
      bCtx.fillStyle = "#8e8e8e";
      bCtx.fillRect(x + 6, y + 4, 52, 24);
    }
  }
  for (let i = 0; i < 180; i++) {
    const sx = Math.random() * 1024;
    const sy = Math.random() * 380;
    const sh = 40 + Math.random() * 130;
    const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
    const isSalt = Math.random() > 0.42;
    grad.addColorStop(0, isSalt ? "rgba(248,250,252,0.16)" : "rgba(51,65,85,0.12)");
    grad.addColorStop(1, "rgba(184,194,206,0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(sx, sy, 2 + Math.random() * 4, sh);
  }
  for (let x = 24; x < 1024; x += 48) {
    ctx.fillStyle = "#475569";
    ctx.fillRect(x, 82, 8, 5);
    ctx.fillRect(x + 20, 146, 6, 6);
    bCtx.fillStyle = "#383838";
    bCtx.fillRect(x, 82, 8, 5);
  }
  const colorTex = new THREE3.CanvasTexture(cCanvas);
  colorTex.wrapS = THREE3.RepeatWrapping;
  colorTex.wrapT = THREE3.RepeatWrapping;
  colorTex.repeat.set(4, 2);
  colorTex.anisotropy = maxAniso;
  colorTex.colorSpace = THREE3.SRGBColorSpace;
  const bumpTex = new THREE3.CanvasTexture(bCanvas);
  bumpTex.wrapS = THREE3.RepeatWrapping;
  bumpTex.wrapT = THREE3.RepeatWrapping;
  bumpTex.repeat.set(4, 2);
  bumpTex.anisotropy = maxAniso;
  const normalTex = heightCanvasToNormalTex(bCanvas, 2.4, 4, 2, maxAniso);
  return { colorTex, bumpTex, normalTex };
}
function createIslandNumberTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#bcc6d2";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(45, 55, 72, 0.22)";
  ctx.lineWidth = 2;
  for (let y = 24; y < 512; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  for (let x = 32; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  ctx.font = '900 245px "Inter", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1e293b";
  ctx.fillText("78", 266, 292);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("78", 256, 282);
  const tex = new THREE3.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE3.SRGBColorSpace;
  return tex;
}
function createUSFlagTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 144;
  const ctx = canvas.getContext("2d");
  const sh = canvas.height / 13;
  for (let i = 0; i < 13; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#dc2626" : "#ffffff";
    ctx.fillRect(0, i * sh, canvas.width, sh);
  }
  ctx.fillStyle = "#1e3a8a";
  ctx.fillRect(0, 0, canvas.width * 0.42, sh * 7);
  ctx.fillStyle = "#ffffff";
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      ctx.fillRect(8 + c * 16, 6 + r * 13, 4, 4);
    }
  }
  const tex = new THREE3.CanvasTexture(canvas);
  tex.colorSpace = THREE3.SRGBColorSpace;
  return tex;
}
function createRotodomeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 256, 240, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(256, 16);
  ctx.lineTo(256, 496);
  ctx.moveTo(16, 256);
  ctx.lineTo(496, 256);
  ctx.stroke();
  const tex = new THREE3.CanvasTexture(canvas);
  tex.colorSpace = THREE3.SRGBColorSpace;
  return tex;
}

// ../game/GameHub/games/USSFord/js/carrier.js
function getStarboardEdgeX(z) {
  if (z >= 98) return THREE4.MathUtils.lerp(-26.5, -18, (z - 98) / 56);
  if (z >= 36) return THREE4.MathUtils.lerp(-38.5, -26.5, (z - 36) / 62);
  if (z >= -72) return -38.5;
  if (z >= -112) return THREE4.MathUtils.lerp(-32.5, -38.5, (z - -112) / 40);
  return THREE4.MathUtils.lerp(-23.5, -32.5, (z - -152) / 40);
}
function getPortEdgeX(z) {
  if (z >= 96) return THREE4.MathUtils.lerp(23.5, 18, (z - 96) / 58);
  if (z >= 34) return THREE4.MathUtils.lerp(43, 23.5, (z - 34) / 62);
  if (z >= -36) return 43;
  if (z >= -75) return THREE4.MathUtils.lerp(33.5, 43, (z - -75) / 39);
  return THREE4.MathUtils.lerp(27.5, 33.5, (z - -152) / 77);
}
function buildCarrier(scene2) {
  const carrierGroup = new THREE4.Group();
  scene2.add(carrierGroup);
  const deckAssetsGroup = new THREE4.Group();
  deckAssetsGroup.position.y = DECK_Y;
  carrierGroup.add(deckAssetsGroup);
  const hullSteelMaps = createNavalSteelHullTexture();
  const hullGreyMat = new THREE4.MeshStandardMaterial({
    color: 10003378,
    map: hullSteelMaps.colorTex,
    normalMap: hullSteelMaps.normalTex,
    normalScale: new THREE4.Vector2(0.45, 0.45),
    bumpMap: hullSteelMaps.bumpTex,
    bumpScale: 0.1,
    roughness: 0.48,
    metalness: 0.16,
    side: THREE4.DoubleSide
  });
  const hullDarkGreyMat = new THREE4.MeshStandardMaterial({
    color: 5923954,
    normalMap: hullSteelMaps.normalTex,
    normalScale: new THREE4.Vector2(0.35, 0.35),
    roughness: 0.54,
    metalness: 0.22
  });
  const catwalkMat = new THREE4.MeshStandardMaterial({
    color: 8161430,
    map: hullSteelMaps.colorTex,
    normalMap: hullSteelMaps.normalTex,
    normalScale: new THREE4.Vector2(0.38, 0.38),
    roughness: 0.52,
    metalness: 0.18
  });
  const islandMat = new THREE4.MeshStandardMaterial({
    color: 10200756,
    map: hullSteelMaps.colorTex,
    normalMap: hullSteelMaps.normalTex,
    normalScale: new THREE4.Vector2(0.42, 0.42),
    roughness: 0.46,
    metalness: 0.16
  });
  const bootToppingMat = new THREE4.MeshStandardMaterial({ color: 1316895, roughness: 0.72, metalness: 0.15, side: THREE4.DoubleSide });
  const antiFoulingRedMat = new THREE4.MeshStandardMaterial({ color: 7218720, roughness: 0.65, metalness: 0.12 });
  const radarWhiteMat2 = new THREE4.MeshStandardMaterial({ color: 15528696, roughness: 0.32, metalness: 0.1 });
  const dbrPanelMat = new THREE4.MeshStandardMaterial({ color: 3359061, roughness: 0.62, metalness: 0.18 });
  const bridgeGlassMat = new THREE4.MeshStandardMaterial({ color: 594204, roughness: 0.08, metalness: 0.92 });
  const nozzleDarkMat2 = new THREE4.MeshStandardMaterial({ color: 2238254, roughness: 0.35, metalness: 0.85 });
  const yellowGearMat2 = new THREE4.MeshStandardMaterial({ color: 15381256, roughness: 0.4, metalness: 0.22 });
  const deckContour = [
    [-18, 154],
    [18, 154],
    [23.5, 96],
    [43, 34],
    [43, -36],
    [33.5, -75],
    [27.5, -152],
    [-23.5, -152],
    [-32.5, -112],
    [-38.5, -72],
    [-38.5, 36],
    [-26.5, 98]
  ];
  const deckShape = new THREE4.Shape();
  deckContour.forEach(([x, z], idx) => {
    if (idx === 0) deckShape.moveTo(x, -z);
    else deckShape.lineTo(x, -z);
  });
  deckShape.closePath();
  const deckTopGeo = new THREE4.ShapeGeometry(deckShape, 1);
  deckTopGeo.rotateX(-Math.PI / 2);
  const posAttr = deckTopGeo.attributes.position;
  const uvArray = new Float32Array(posAttr.count * 2);
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const u = (vx - DECK_MIN_X) / (DECK_MAX_X - DECK_MIN_X);
    const v = (vz - DECK_MIN_Z) / (DECK_MAX_Z - DECK_MIN_Z);
    uvArray[i * 2] = u;
    uvArray[i * 2 + 1] = v;
  }
  deckTopGeo.setAttribute("uv", new THREE4.BufferAttribute(uvArray, 2));
  deckTopGeo.computeVertexNormals();
  const deckMaps = createFlightDeckMaps();
  const deckTopMat = new THREE4.MeshStandardMaterial({
    color: 15264751,
    map: deckMaps.colorTex,
    normalMap: deckMaps.normalTex,
    normalScale: new THREE4.Vector2(0.55, 0.55),
    bumpMap: deckMaps.bumpTex,
    bumpScale: 0.12,
    roughnessMap: deckMaps.roughTex,
    roughness: 0.88,
    metalness: 0.04
  });
  const flightDeckMesh = new THREE4.Mesh(deckTopGeo, deckTopMat);
  flightDeckMesh.position.y = DECK_Y;
  flightDeckMesh.receiveShadow = true;
  carrierGroup.add(flightDeckMesh);
  const galleryExtrudeGeo = new THREE4.ExtrudeGeometry(deckShape, { depth: 2.3, bevelEnabled: false });
  galleryExtrudeGeo.rotateX(-Math.PI / 2);
  const galleryMesh = new THREE4.Mesh(galleryExtrudeGeo, hullDarkGreyMat);
  galleryMesh.position.y = DECK_Y - 2.32;
  galleryMesh.castShadow = true;
  galleryMesh.receiveShadow = true;
  carrierGroup.add(galleryMesh);
  function createLoftedCarrierHull() {
    const levels = [
      { y: -0.6, bowZ: 144, sternZ: -148, bowW: 0.6, midW: 19.5, sternW: 15 },
      { y: 3.2, bowZ: 147.5, sternZ: -150, bowW: 2.8, midW: 21.5, sternW: 18 },
      { y: 6.8, bowZ: 151, sternZ: -151, bowW: 8.5, midW: 25, sternW: 21 },
      { y: 10.1, bowZ: 153.8, sternZ: -152, bowW: 17.5, midW: 31, sternW: 23.5 }
    ];
    const zSamples = 32;
    const ringVerts = [];
    levels.forEach((lvl) => {
      const ring = [];
      for (let i = 0; i <= zSamples; i++) {
        const t = i / zSamples;
        const z = THREE4.MathUtils.lerp(lvl.bowZ, lvl.sternZ, t);
        let w;
        if (t < 0.28) {
          const tb = t / 0.28;
          w = THREE4.MathUtils.lerp(lvl.bowW, lvl.midW, Math.pow(tb, 0.72));
        } else if (t > 0.78) {
          const ts = (t - 0.78) / 0.22;
          w = THREE4.MathUtils.lerp(lvl.midW, lvl.sternW, ts);
        } else {
          w = lvl.midW;
        }
        ring.push(new THREE4.Vector3(-w, lvl.y, z));
      }
      for (let i = zSamples; i >= 0; i--) {
        const t = i / zSamples;
        const z = THREE4.MathUtils.lerp(lvl.bowZ, lvl.sternZ, t);
        let w;
        if (t < 0.28) {
          const tb = t / 0.28;
          w = THREE4.MathUtils.lerp(lvl.bowW, lvl.midW, Math.pow(tb, 0.72));
        } else if (t > 0.78) {
          const ts = (t - 0.78) / 0.22;
          w = THREE4.MathUtils.lerp(lvl.midW, lvl.sternW, ts);
        } else {
          w = lvl.midW;
        }
        ring.push(new THREE4.Vector3(w, lvl.y, z));
      }
      ringVerts.push(ring);
    });
    const verts = [];
    const uvs = [];
    const indices = [];
    const ptsPerRing = ringVerts[0].length;
    ringVerts.forEach((ring, rIdx) => {
      ring.forEach((v, iIdx) => {
        verts.push(v.x, v.y, v.z);
        uvs.push(iIdx / ptsPerRing * 8, rIdx / (ringVerts.length - 1) * 2);
      });
    });
    for (let r = 0; r < ringVerts.length - 1; r++) {
      for (let i = 0; i < ptsPerRing - 1; i++) {
        const a2 = r * ptsPerRing + i;
        const b2 = r * ptsPerRing + i + 1;
        const c2 = (r + 1) * ptsPerRing + i + 1;
        const d2 = (r + 1) * ptsPerRing + i;
        indices.push(a2, c2, b2);
        indices.push(a2, d2, c2);
      }
      const a = r * ptsPerRing + (ptsPerRing - 1);
      const b = r * ptsPerRing;
      const c = (r + 1) * ptsPerRing;
      const d = (r + 1) * ptsPerRing + (ptsPerRing - 1);
      indices.push(a, c, b);
      indices.push(a, d, c);
    }
    const geo = new THREE4.BufferGeometry();
    geo.setAttribute("position", new THREE4.Float32BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE4.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE4.Mesh(geo, hullGreyMat);
  }
  const loftedHull = createLoftedCarrierHull();
  loftedHull.castShadow = true;
  loftedHull.receiveShadow = true;
  carrierGroup.add(loftedHull);
  const bulbousBow = new THREE4.Mesh(new THREE4.SphereGeometry(2.6, 16, 12), antiFoulingRedMat);
  bulbousBow.scale.set(0.85, 0.72, 3.2);
  bulbousBow.position.set(0, -1.2, 150.5);
  carrierGroup.add(bulbousBow);
  const hullDetailsGroup = new THREE4.Group();
  carrierGroup.add(hullDetailsGroup);
  for (let z = -148; z <= 148; z += 4.5) {
    const edgeX = getStarboardEdgeX(z);
    const cw = new THREE4.Mesh(new THREE4.BoxGeometry(2.4, 0.9, 4.3), catwalkMat);
    cw.position.set(edgeX - 0.9, DECK_Y - 0.75, z);
    cw.castShadow = true;
    cw.receiveShadow = true;
    hullDetailsGroup.add(cw);
    const railing = new THREE4.Mesh(new THREE4.BoxGeometry(0.25, 0.85, 4.4), hullGreyMat);
    railing.position.set(edgeX - 1.95, DECK_Y - 0.25, z);
    hullDetailsGroup.add(railing);
    const rib = new THREE4.Mesh(new THREE4.BoxGeometry(4.6, 3.6, 0.75), hullDarkGreyMat);
    rib.position.set(edgeX + 0.8, DECK_Y - 2.6, z);
    rib.castShadow = true;
    rib.receiveShadow = true;
    hullDetailsGroup.add(rib);
    if (Math.abs(z) % 9 < 4.5) {
      for (let c = -1.2; c <= 1.2; c += 1.2) {
        const canister = new THREE4.Mesh(new THREE4.CylinderGeometry(0.38, 0.38, 1.15, 10), radarWhiteMat2);
        canister.rotation.x = Math.PI / 2;
        canister.position.set(edgeX - 2.05, DECK_Y - 0.45, z + c);
        canister.castShadow = true;
        hullDetailsGroup.add(canister);
      }
    }
  }
  for (let z = -146; z <= 146; z += 5.5) {
    const edgeX = getPortEdgeX(z);
    const cw = new THREE4.Mesh(new THREE4.BoxGeometry(2.2, 0.85, 5.2), catwalkMat);
    cw.position.set(edgeX + 0.9, DECK_Y - 0.75, z);
    cw.castShadow = true;
    cw.receiveShadow = true;
    hullDetailsGroup.add(cw);
    const railing = new THREE4.Mesh(new THREE4.BoxGeometry(0.25, 0.85, 5.3), hullGreyMat);
    railing.position.set(edgeX + 1.85, DECK_Y - 0.25, z);
    hullDetailsGroup.add(railing);
    if (Math.abs(z) % 11 < 5.5) {
      const canister = new THREE4.Mesh(new THREE4.CylinderGeometry(0.36, 0.36, 1.15, 10), radarWhiteMat2);
      canister.rotation.x = Math.PI / 2;
      canister.position.set(edgeX + 1.95, DECK_Y - 0.45, z);
      canister.castShadow = true;
      hullDetailsGroup.add(canister);
    }
  }
  const bowCatwalk = new THREE4.Mesh(new THREE4.BoxGeometry(35.5, 0.85, 2.4), catwalkMat);
  bowCatwalk.position.set(0, DECK_Y - 0.65, 154.8);
  hullDetailsGroup.add(bowCatwalk);
  [-98, -42, 4, 48, 86].forEach((hz) => {
    const sx = getStarboardEdgeX(hz);
    const sponsonBox = new THREE4.Mesh(new THREE4.BoxGeometry(5.8, 4.4, 15.5), hullGreyMat);
    sponsonBox.position.set(sx + 2.2, DECK_Y - 4.4, hz);
    sponsonBox.castShadow = true;
    sponsonBox.receiveShadow = true;
    hullDetailsGroup.add(sponsonBox);
    const recessCavity = new THREE4.Mesh(new THREE4.BoxGeometry(1.6, 2.9, 11.2), bootToppingMat);
    recessCavity.position.set(sx - 0.2, DECK_Y - 4.4, hz);
    hullDetailsGroup.add(recessCavity);
  });
  function addCarrierElevator(x, z, width, length, isStarboard = true) {
    const elevGroup = new THREE4.Group();
    elevGroup.position.set(x, DECK_Y - 0.35, z);
    const plat = new THREE4.Mesh(new THREE4.BoxGeometry(width, 0.65, length), hullDarkGreyMat);
    plat.castShadow = true;
    plat.receiveShadow = true;
    elevGroup.add(plat);
    const rail = new THREE4.Mesh(new THREE4.BoxGeometry(0.22, 0.9, length - 0.6), hullGreyMat);
    rail.position.set(isStarboard ? -width * 0.46 : width * 0.46, 0.65, 0);
    elevGroup.add(rail);
    const truss = new THREE4.Mesh(new THREE4.BoxGeometry(width - 1, 2.8, length - 2), hullGreyMat);
    truss.position.set(isStarboard ? 0.8 : -0.8, -1.7, 0);
    elevGroup.add(truss);
    const guideRail = new THREE4.Mesh(new THREE4.BoxGeometry(0.35, 7.5, length), hullDarkGreyMat);
    guideRail.position.set(isStarboard ? width * 0.5 - 0.2 : -width * 0.5 + 0.2, -3.2, 0);
    elevGroup.add(guideRail);
    hullDetailsGroup.add(elevGroup);
  }
  [-92, -18, 22].forEach((elevZ) => {
    const ex = getStarboardEdgeX(elevZ);
    addCarrierElevator(ex - 2.4, elevZ, 6.8, 16, true);
  });
  addCarrierElevator(getPortEdgeX(-65) + 2.4, -65, 6.8, 16, false);
  function addPhalanxCIWS(x, y, z) {
    const ciws = new THREE4.Group();
    ciws.position.set(x, y, z);
    const base = new THREE4.Mesh(new THREE4.CylinderGeometry(1.6, 1.8, 1.4, 12), hullGreyMat);
    ciws.add(base);
    const turret = new THREE4.Mesh(new THREE4.BoxGeometry(1.8, 1.6, 2), hullDarkGreyMat);
    turret.position.y = 1.4;
    ciws.add(turret);
    const dome = new THREE4.Mesh(new THREE4.CylinderGeometry(0.85, 0.85, 1.8, 14), radarWhiteMat2);
    dome.position.set(0, 2.8, -0.2);
    dome.castShadow = true;
    ciws.add(dome);
    const domeCap = new THREE4.Mesh(new THREE4.SphereGeometry(0.85, 14, 10), radarWhiteMat2);
    domeCap.position.set(0, 3.7, -0.2);
    ciws.add(domeCap);
    const gun = new THREE4.Mesh(new THREE4.CylinderGeometry(0.12, 0.16, 2.2, 8), nozzleDarkMat2);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, 1.35, 1.6);
    gun.castShadow = true;
    ciws.add(gun);
    hullDetailsGroup.add(ciws);
  }
  function addRAMLauncher(x, y, z, rotY) {
    const ram = new THREE4.Group();
    ram.position.set(x, y, z);
    ram.rotation.y = rotY;
    const pedestal = new THREE4.Mesh(new THREE4.CylinderGeometry(1.4, 1.6, 1.2, 10), hullGreyMat);
    ram.add(pedestal);
    const box = new THREE4.Mesh(new THREE4.BoxGeometry(2.4, 1.8, 3.2), radarWhiteMat2);
    box.position.set(0, 1.8, 0);
    box.rotation.x = -0.55;
    box.castShadow = true;
    ram.add(box);
    hullDetailsGroup.add(ram);
  }
  addPhalanxCIWS(getStarboardEdgeX(36) - 3.2, DECK_Y - 2.6, 36);
  addRAMLauncher(getStarboardEdgeX(-6) - 3.4, DECK_Y - 2.8, -6, -Math.PI / 2);
  addPhalanxCIWS(getStarboardEdgeX(-124) - 3.2, DECK_Y - 2.8, -124);
  addRAMLauncher(getPortEdgeX(62) + 3.2, DECK_Y - 2.8, 62, Math.PI / 2);
  const aftFantailDome = new THREE4.Group();
  aftFantailDome.position.set(16.5, DECK_Y, -142.5);
  const aftCylinder = new THREE4.Mesh(new THREE4.CylinderGeometry(3.2, 3.2, 2.4, 20), radarWhiteMat2);
  aftCylinder.position.y = 1.2;
  aftCylinder.castShadow = true;
  aftFantailDome.add(aftCylinder);
  const aftCap = new THREE4.Mesh(new THREE4.CylinderGeometry(2.9, 2.9, 0.2, 20), hullDarkGreyMat);
  aftCap.position.y = 2.42;
  aftFantailDome.add(aftCap);
  hullDetailsGroup.add(aftFantailDome);
  const bootBand = new THREE4.Mesh(new THREE4.BoxGeometry(40.5, 1.8, 286), bootToppingMat);
  bootBand.position.set(0, 0.85, -2);
  hullDetailsGroup.add(bootBand);
  [-3.8, 3.8].forEach((ax) => {
    const hawse = new THREE4.Mesh(new THREE4.CylinderGeometry(0.95, 1.15, 1.4, 12), nozzleDarkMat2);
    hawse.rotation.z = ax > 0 ? -0.55 : 0.55;
    hawse.position.set(ax, 6.2, 146.5);
    hullDetailsGroup.add(hawse);
    const fluke = new THREE4.Mesh(new THREE4.BoxGeometry(0.65, 2.2, 1.4), nozzleDarkMat2);
    fluke.position.set(ax * 1.08, 5.4, 146.5);
    fluke.rotation.z = ax > 0 ? -0.35 : 0.35;
    hullDetailsGroup.add(fluke);
  });
  for (let z = -140; z <= 135; z += 9.5) {
    const sx = getStarboardEdgeX(z);
    const px = getPortEdgeX(z);
    const stbdStrut = new THREE4.Mesh(new THREE4.BoxGeometry(0.65, 6.8, 0.85), hullDarkGreyMat);
    stbdStrut.position.set(sx + 3.6, DECK_Y - 4.2, z);
    stbdStrut.rotation.z = -0.52;
    stbdStrut.castShadow = true;
    hullDetailsGroup.add(stbdStrut);
    const portStrut = new THREE4.Mesh(new THREE4.BoxGeometry(0.65, 6.8, 0.85), hullDarkGreyMat);
    portStrut.position.set(px - 3.6, DECK_Y - 4.2, z);
    portStrut.rotation.z = 0.52;
    portStrut.castShadow = true;
    hullDetailsGroup.add(portStrut);
  }
  [-115, -45, 5, 68, 118].forEach((az) => {
    const sx = getStarboardEdgeX(az) - 2.1;
    const whipS = new THREE4.Mesh(new THREE4.CylinderGeometry(0.04, 0.12, 9.5, 6), hullDarkGreyMat);
    whipS.position.set(sx - 1.8, DECK_Y + 2.2, az);
    whipS.rotation.z = 0.48;
    hullDetailsGroup.add(whipS);
    const px = getPortEdgeX(az) + 2;
    const whipP = new THREE4.Mesh(new THREE4.CylinderGeometry(0.04, 0.12, 9.5, 6), hullDarkGreyMat);
    whipP.position.set(px + 1.8, DECK_Y + 2.2, az);
    whipP.rotation.z = -0.48;
    hullDetailsGroup.add(whipP);
  });
  const iflolsGroup = new THREE4.Group();
  iflolsGroup.position.set(getPortEdgeX(-48) + 1.8, DECK_Y - 0.3, -48);
  const iflolsBox = new THREE4.Mesh(new THREE4.BoxGeometry(2.6, 3.2, 1.8), hullDarkGreyMat);
  iflolsBox.position.y = 1.6;
  iflolsBox.castShadow = true;
  iflolsGroup.add(iflolsBox);
  [-0.85, 0.85].forEach((dx) => {
    const datum = new THREE4.Mesh(new THREE4.BoxGeometry(0.55, 0.16, 0.12), new THREE4.MeshBasicMaterial({ color: 2278750 }));
    datum.position.set(dx, 1.8, -0.92);
    iflolsGroup.add(datum);
  });
  const meatball = new THREE4.Mesh(new THREE4.SphereGeometry(0.22, 10, 10), new THREE4.MeshBasicMaterial({ color: 16498468 }));
  meatball.position.set(0, 1.8, -0.95);
  iflolsGroup.add(meatball);
  hullDetailsGroup.add(iflolsGroup);
  const craneGroup = new THREE4.Group();
  craneGroup.position.set(-29.5, DECK_Y, -39.5);
  craneGroup.rotation.y = 0.25;
  const craneBase = new THREE4.Mesh(new THREE4.BoxGeometry(3.8, 1.7, 6.2), yellowGearMat2);
  craneBase.position.y = 0.95;
  craneBase.castShadow = true;
  craneGroup.add(craneBase);
  const craneCab = new THREE4.Mesh(new THREE4.BoxGeometry(1.7, 1.5, 2.4), nozzleDarkMat2);
  craneCab.position.set(0.7, 2.2, 0.9);
  craneGroup.add(craneCab);
  const craneBoom = new THREE4.Mesh(new THREE4.BoxGeometry(1.05, 1.05, 13.5), yellowGearMat2);
  craneBoom.position.set(-0.2, 3.3, 4.2);
  craneBoom.rotation.x = -0.18;
  craneBoom.castShadow = true;
  craneGroup.add(craneBoom);
  [-1.8, 1.8].forEach((wx) => {
    [-2.1, 0, 2.1].forEach((wz) => {
      const w = new THREE4.Mesh(new THREE4.CylinderGeometry(0.62, 0.62, 0.42, 14), new THREE4.MeshStandardMaterial({ color: 1316896, roughness: 0.86 }));
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.62, wz);
      craneGroup.add(w);
    });
  });
  hullDetailsGroup.add(craneGroup);
  const islandGroup = new THREE4.Group();
  islandGroup.position.set(-30.2, DECK_Y, -56);
  carrierGroup.add(islandGroup);
  const islandNumTex = createIslandNumberTexture();
  const islandNumMat = new THREE4.MeshStandardMaterial({
    map: islandNumTex,
    normalMap: hullSteelMaps.normalTex,
    normalScale: new THREE4.Vector2(0.32, 0.32),
    roughness: 0.42,
    metalness: 0.2
  });
  const baseMaterials = [islandNumMat, islandNumMat, islandMat, islandMat, islandNumMat, islandMat];
  const lowerIsland = new THREE4.Mesh(new THREE4.BoxGeometry(9.6, 16, 23.5), baseMaterials);
  lowerIsland.position.set(0, 8, 0);
  lowerIsland.castShadow = true;
  lowerIsland.receiveShadow = true;
  islandGroup.add(lowerIsland);
  const fwdSponson = new THREE4.Mesh(new THREE4.BoxGeometry(8.6, 9.8, 6.2), islandMat);
  fwdSponson.position.set(-0.4, 4.9, 13.8);
  fwdSponson.castShadow = true;
  islandGroup.add(fwdSponson);
  const aftSponson = new THREE4.Mesh(new THREE4.BoxGeometry(8.6, 10.8, 5.8), islandMat);
  aftSponson.position.set(-0.4, 5.4, -13.5);
  aftSponson.castShadow = true;
  islandGroup.add(aftSponson);
  const bridgeCoreTrunk = new THREE4.Mesh(new THREE4.BoxGeometry(9, 12.2, 16), islandMat);
  bridgeCoreTrunk.position.set(0.1, 20.8, 0.2);
  bridgeCoreTrunk.castShadow = true;
  bridgeCoreTrunk.receiveShadow = true;
  islandGroup.add(bridgeCoreTrunk);
  const dbrPedestal = new THREE4.Mesh(new THREE4.CylinderGeometry(5.2, 6, 5.4, 8), islandMat);
  dbrPedestal.position.set(0, 23.5, -0.5);
  dbrPedestal.castShadow = true;
  dbrPedestal.receiveShadow = true;
  islandGroup.add(dbrPedestal);
  [
    { y: 15.4, w: 10.2, z: 20.5, glassH: 0.85 },
    { y: 19.8, w: 10.8, z: 17.2, glassH: 0.82 }
  ].forEach((tier) => {
    const underSupport = new THREE4.Mesh(new THREE4.BoxGeometry(tier.w - 0.8, 2.2, tier.z - 1.2), islandMat);
    underSupport.position.set(0.2, tier.y - 1.5, 0.5);
    underSupport.castShadow = true;
    underSupport.receiveShadow = true;
    islandGroup.add(underSupport);
    const levelBox = new THREE4.Mesh(new THREE4.BoxGeometry(tier.w, 1.6, tier.z), islandMat);
    levelBox.position.set(0.2, tier.y, 0.5);
    levelBox.castShadow = true;
    islandGroup.add(levelBox);
    const glassBox = new THREE4.Mesh(new THREE4.BoxGeometry(tier.w + 0.22, tier.glassH, tier.z + 0.22), bridgeGlassMat);
    glassBox.position.set(0.2, tier.y + 0.98, 0.5);
    glassBox.castShadow = true;
    islandGroup.add(glassBox);
    const roofOverhang = new THREE4.Mesh(new THREE4.BoxGeometry(tier.w + 0.8, 0.42, tier.z + 0.8), islandMat);
    roofOverhang.position.set(0.2, tier.y + 0.98 + tier.glassH * 0.5 + 0.2, 0.5);
    roofOverhang.castShadow = true;
    islandGroup.add(roofOverhang);
    const galleryWalkway = new THREE4.Mesh(new THREE4.BoxGeometry(tier.w + 1.5, 0.45, tier.z + 1.5), catwalkMat);
    galleryWalkway.position.set(0.2, tier.y - 0.65, 0.5);
    galleryWalkway.castShadow = true;
    islandGroup.add(galleryWalkway);
  });
  const dbrTower = new THREE4.Mesh(new THREE4.CylinderGeometry(4.4, 5.2, 9.8, 8), islandMat);
  dbrTower.position.set(0, 29.8, -0.5);
  dbrTower.castShadow = true;
  islandGroup.add(dbrTower);
  for (let a = 0; a < 4; a++) {
    const panel = new THREE4.Mesh(new THREE4.BoxGeometry(3.6, 4.6, 0.45), dbrPanelMat);
    const ang = a * Math.PI / 2 + Math.PI / 4;
    panel.position.set(Math.sin(ang) * 4.6, 29.8, -0.5 + Math.cos(ang) * 4.6);
    panel.rotation.y = ang;
    islandGroup.add(panel);
  }
  const radomeSpecs = [
    { x: -1.6, y: 10.9, z: 14.2, rad: 2.05, baseH: 2.4, sponson: true },
    { x: -3.2, y: 18, z: 9, rad: 1.75, baseH: 2.2, sponson: false },
    { x: -3.2, y: 18, z: -8, rad: 1.75, baseH: 2.2, sponson: false },
    { x: -1.6, y: 11.8, z: -13.6, rad: 2.05, baseH: 2.4, sponson: true },
    { x: 2.4, y: 22.8, z: 6.6, rad: 1.65, baseH: 2.6, sponson: false },
    { x: -1.8, y: 35.8, z: 2, rad: 2.15, baseH: 2.8, sponson: true },
    { x: 1.8, y: 35.8, z: -3, rad: 1.98, baseH: 2.8, sponson: true }
  ];
  radomeSpecs.forEach(({ x: rx, y: ry, z: rz, rad, baseH, sponson }) => {
    const base = new THREE4.Mesh(new THREE4.CylinderGeometry(rad * 0.65, rad * 0.85, baseH, 12), islandMat);
    base.position.set(rx, ry - rad * 0.45, rz);
    base.castShadow = true;
    islandGroup.add(base);
    if (sponson) {
      const collar = new THREE4.Mesh(new THREE4.CylinderGeometry(rad * 1.05, rad * 0.8, 1.2, 12), hullDarkGreyMat);
      collar.position.set(rx, ry - rad * 0.9, rz);
      islandGroup.add(collar);
    }
    const sphere = new THREE4.Mesh(new THREE4.SphereGeometry(rad, 18, 18), radarWhiteMat2);
    sphere.position.set(rx, ry + rad * 0.35, rz);
    sphere.castShadow = true;
    islandGroup.add(sphere);
  });
  const upperMast = new THREE4.Mesh(new THREE4.CylinderGeometry(0.75, 2.4, 21, 8), islandMat);
  upperMast.position.set(0, 43.8, -1);
  upperMast.castShadow = true;
  islandGroup.add(upperMast);
  [-38, -43, -49].forEach((y, idx) => {
    const yard = new THREE4.Mesh(new THREE4.BoxGeometry(16.5 - idx * 3.5, 0.5, 0.9), islandMat);
    yard.position.set(0, -y, -1);
    yard.castShadow = true;
    islandGroup.add(yard);
    [-1, 1].forEach((side) => {
      const sensorPod = new THREE4.Mesh(new THREE4.CylinderGeometry(0.2, 0.2, 1.3, 8), radarWhiteMat2);
      sensorPod.position.set(side * (7.5 - idx * 1.6), -y + 0.6, -1);
      sensorPod.castShadow = true;
      islandGroup.add(sensorPod);
    });
  });
  const tacanDome = new THREE4.Mesh(new THREE4.CylinderGeometry(0.9, 1, 2.2, 12), radarWhiteMat2);
  tacanDome.position.set(0, 54.8, -1);
  tacanDome.castShadow = true;
  islandGroup.add(tacanDome);
  [3.5, 8.2, 12.8].forEach((stairY, idx) => {
    const stairFlight = new THREE4.Mesh(new THREE4.BoxGeometry(0.65, 0.25, 4.8), hullDarkGreyMat);
    stairFlight.position.set(4.95, stairY, -6 + idx * 3.5);
    stairFlight.rotation.x = 0.62;
    stairFlight.castShadow = true;
    islandGroup.add(stairFlight);
  });
  const gaffPole = new THREE4.Mesh(new THREE4.CylinderGeometry(0.1, 0.18, 8.5, 8), hullDarkGreyMat);
  gaffPole.position.set(0, 38.5, -4.2);
  gaffPole.rotation.x = -0.68;
  gaffPole.castShadow = true;
  islandGroup.add(gaffPole);
  const flagGeo = new THREE4.PlaneGeometry(9.6, 5.4, 16, 10);
  const flagMesh = new THREE4.Mesh(
    flagGeo,
    new THREE4.MeshStandardMaterial({ map: createUSFlagTexture(), side: THREE4.DoubleSide, roughness: 0.48 })
  );
  flagMesh.position.set(0.5, 38.2, -9.8);
  flagMesh.rotation.y = Math.PI / 2 - 0.28;
  islandGroup.add(flagMesh);
  function createJBD(x, z, rotY) {
    const group = new THREE4.Group();
    group.position.set(x, DECK_Y + 0.06, z);
    group.rotation.y = rotY;
    const panelPivot = new THREE4.Group();
    panelPivot.position.set(0, 0.05, 2.2);
    const panel = new THREE4.Mesh(
      new THREE4.BoxGeometry(9.2, 0.28, 4.4),
      new THREE4.MeshStandardMaterial({ color: 6048056, roughness: 0.68, metalness: 0.28 })
    );
    panel.position.set(0, 0, -2.2);
    panel.castShadow = true;
    panelPivot.add(panel);
    const hazardEdge = new THREE4.Mesh(
      new THREE4.BoxGeometry(9.3, 0.3, 0.35),
      new THREE4.MeshStandardMaterial({ color: 14251782 })
    );
    hazardEdge.position.set(0, 0, -4.2);
    panelPivot.add(hazardEdge);
    group.add(panelPivot);
    carrierGroup.add(group);
    return { panelPivot, targetAngle: 0, currentAngle: 0 };
  }
  const jbdCat1 = createJBD(-7.5, 44, 0.01);
  const jbdCat2 = createJBD(8.5, 38, -0.01);
  const wireMat = new THREE4.LineBasicMaterial({ color: 1976635, linewidth: 2 });
  const wirePts = [
    new THREE4.Vector3(-8.5, 0.16, -95),
    new THREE4.Vector3(3.5, 0.16, -98),
    new THREE4.Vector3(15.5, 0.16, -101)
  ];
  const wireGeo = new THREE4.BufferGeometry().setFromPoints(wirePts);
  const arrestingWireLine = new THREE4.Line(wireGeo, wireMat);
  deckAssetsGroup.add(arrestingWireLine);
  [-119, -107, -83].forEach((wz) => {
    const shiftX = (wz - -98) * 0.21;
    const pPts = [
      new THREE4.Vector3(-8.5 + shiftX, 0.15, wz + 3),
      new THREE4.Vector3(3.5 + shiftX, 0.15, wz),
      new THREE4.Vector3(15.5 + shiftX, 0.15, wz - 3)
    ];
    const pLine = new THREE4.Line(new THREE4.BufferGeometry().setFromPoints(pPts), wireMat);
    deckAssetsGroup.add(pLine);
    [-9.2 + shiftX, 16.2 + shiftX].forEach((sx, sIdx) => {
      const damper = new THREE4.Mesh(new THREE4.CylinderGeometry(0.42, 0.48, 0.35, 10), yellowGearMat2);
      damper.position.set(sx, 0.18, sIdx === 0 ? wz + 3.2 : wz - 3.2);
      deckAssetsGroup.add(damper);
    });
  });
  const deckObstacleList = [
    { x: -29, z: -56, radius: 13.5 }
  ];
  function updateCarrier(elapsed, dt) {
    const pitch = Math.sin(elapsed * 0.48) * 8e-3;
    const roll = Math.cos(elapsed * 0.36) * 7e-3;
    const heave = Math.sin(elapsed * 0.62) * 0.2;
    carrierGroup.rotation.x = pitch;
    carrierGroup.rotation.z = roll;
    carrierGroup.position.y = heave;
    const fPos = flagGeo.attributes.position;
    for (let i = 0; i < fPos.count; i++) {
      const vx = fPos.getX(i);
      const wave = Math.sin(vx * 0.8 - elapsed * 6.5) * ((vx + 4.8) * 0.06);
      fPos.setZ(i, wave);
    }
    fPos.needsUpdate = true;
    jbdCat1.currentAngle = THREE4.MathUtils.lerp(jbdCat1.currentAngle, jbdCat1.targetAngle, dt * 4);
    jbdCat1.panelPivot.rotation.x = jbdCat1.currentAngle;
    jbdCat2.currentAngle = THREE4.MathUtils.lerp(jbdCat2.currentAngle, jbdCat2.targetAngle, dt * 4);
    jbdCat2.panelPivot.rotation.x = jbdCat2.currentAngle;
  }
  return {
    carrierGroup,
    deckAssetsGroup,
    flightDeckMesh,
    jbdCat1,
    jbdCat2,
    arrestingWireLine,
    deckObstacleList,
    flagMesh,
    updateCarrier,
    getStarboardEdgeX,
    getPortEdgeX
  };
}

// ../game/GameHub/games/USSFord/js/flightOps.js
import * as THREE6 from "three";

// ../game/GameHub/games/USSFord/js/aircraft.js
import * as THREE5 from "three";
var spinningPropsAndDomes = [];
var allHeliRotors = [];
var fa18SurfMaps = createAircraftSurfaceMaps("#c0c9d4", 0.26);
var f35SurfMaps = createAircraftSurfaceMaps("#545b66", 0.22);
var e2SurfMaps = createAircraftSurfaceMaps("#dce3ec", 0.22);
var heloSurfMaps = createAircraftSurfaceMaps("#525c6a", 0.25);
var f35DarkMat = new THREE5.MeshStandardMaterial({
  color: 5660008,
  map: f35SurfMaps.colorTex,
  normalMap: f35SurfMaps.normalTex,
  normalScale: new THREE5.Vector2(0.35, 0.35),
  roughness: 0.44,
  metalness: 0.26
});
var f35LightRamMat = new THREE5.MeshStandardMaterial({ color: 8555414, roughness: 0.4, metalness: 0.22 });
var f35NoseMat = new THREE5.MeshStandardMaterial({ color: 3883338, roughness: 0.48, metalness: 0.2 });
var fa18GreyMat = new THREE5.MeshStandardMaterial({
  color: 12766166,
  map: fa18SurfMaps.colorTex,
  normalMap: fa18SurfMaps.normalTex,
  normalScale: new THREE5.Vector2(0.38, 0.38),
  roughness: 0.36,
  metalness: 0.24
});
var fa18NoseMat = new THREE5.MeshStandardMaterial({ color: 8555674, roughness: 0.42, metalness: 0.22 });
var e2BodyMat = new THREE5.MeshStandardMaterial({
  color: 14476268,
  map: e2SurfMaps.colorTex,
  normalMap: e2SurfMaps.normalTex,
  normalScale: new THREE5.Vector2(0.32, 0.32),
  roughness: 0.34,
  metalness: 0.2
});
var heloDarkMat = new THREE5.MeshStandardMaterial({
  color: 5397610,
  map: heloSurfMaps.colorTex,
  normalMap: heloSurfMaps.normalTex,
  normalScale: new THREE5.Vector2(0.34, 0.34),
  roughness: 0.44,
  metalness: 0.28
});
var canopyGoldMat = new THREE5.MeshStandardMaterial({ color: 1778220, roughness: 0.06, metalness: 0.92 });
var canopyBlueMat = new THREE5.MeshStandardMaterial({ color: 923428, roughness: 0.08, metalness: 0.9 });
var tireBlackMat = new THREE5.MeshStandardMaterial({ color: 1316896, roughness: 0.86, metalness: 0.08 });
var nozzleDarkMat = new THREE5.MeshStandardMaterial({ color: 2238254, roughness: 0.35, metalness: 0.85 });
var foldHingeRedMat = new THREE5.MeshStandardMaterial({ color: 14427686, roughness: 0.5, metalness: 0.2 });
var radarWhiteMat = new THREE5.MeshStandardMaterial({ color: 15528696, roughness: 0.32, metalness: 0.1 });
var yellowGearMat = new THREE5.MeshStandardMaterial({ color: 15381256, roughness: 0.4, metalness: 0.22 });
var usNavyInsigniaTex = createUSNavyInsigniaTexture();
var insigniaDecalMat = new THREE5.MeshBasicMaterial({ map: usNavyInsigniaTex, transparent: true, depthWrite: false });
function addLandingGear(parent, noseZ, mainX, mainZ) {
  const gearGroup = new THREE5.Group();
  const nStrut = new THREE5.Mesh(new THREE5.CylinderGeometry(0.09, 0.09, 0.95), radarWhiteMat);
  nStrut.position.set(0, 0.48, noseZ);
  nStrut.rotation.x = -0.15;
  gearGroup.add(nStrut);
  const launchBar = new THREE5.Mesh(new THREE5.BoxGeometry(0.08, 0.08, 0.72), radarWhiteMat);
  launchBar.position.set(0, 0.25, noseZ + 0.35);
  launchBar.rotation.x = 0.55;
  gearGroup.add(launchBar);
  const holdbackLink = new THREE5.Mesh(new THREE5.BoxGeometry(0.06, 0.06, 0.5), nozzleDarkMat);
  holdbackLink.position.set(0, 0.28, noseZ - 0.25);
  holdbackLink.rotation.x = -0.45;
  gearGroup.add(holdbackLink);
  [-0.14, 0.14].forEach((offset) => {
    const nTire = new THREE5.Mesh(new THREE5.CylinderGeometry(0.24, 0.24, 0.13, 14), tireBlackMat);
    nTire.rotation.z = Math.PI / 2;
    nTire.position.set(offset, 0.24, noseZ);
    nTire.castShadow = true;
    gearGroup.add(nTire);
    const nHub = new THREE5.Mesh(new THREE5.CylinderGeometry(0.12, 0.12, 0.15, 10), radarWhiteMat);
    nHub.rotation.z = Math.PI / 2;
    nHub.position.set(offset, 0.24, noseZ);
    gearGroup.add(nHub);
  });
  [-0.24, 0.24].forEach((dOffset) => {
    const door = new THREE5.Mesh(new THREE5.BoxGeometry(0.04, 0.36, 0.95), radarWhiteMat);
    door.position.set(dOffset, 0.65, noseZ);
    door.rotation.z = dOffset > 0 ? 0.35 : -0.35;
    gearGroup.add(door);
  });
  [-mainX, mainX].forEach((gx) => {
    const mStrut = new THREE5.Mesh(new THREE5.CylinderGeometry(0.12, 0.11, 0.98), radarWhiteMat);
    mStrut.position.set(gx * 0.92, 0.5, mainZ);
    gearGroup.add(mStrut);
    const mTrailingLink = new THREE5.Mesh(new THREE5.BoxGeometry(0.12, 0.14, 0.52), radarWhiteMat);
    mTrailingLink.position.set(gx, 0.35, mainZ - 0.18);
    gearGroup.add(mTrailingLink);
    const brakeCaliper = new THREE5.Mesh(new THREE5.BoxGeometry(0.14, 0.24, 0.22), nozzleDarkMat);
    brakeCaliper.position.set(gx + (gx > 0 ? -0.1 : 0.1), 0.35, mainZ);
    gearGroup.add(brakeCaliper);
    const mTire = new THREE5.Mesh(new THREE5.CylinderGeometry(0.35, 0.35, 0.25, 16), tireBlackMat);
    mTire.rotation.z = Math.PI / 2;
    mTire.position.set(gx, 0.35, mainZ);
    mTire.castShadow = true;
    gearGroup.add(mTire);
    const mHub = new THREE5.Mesh(new THREE5.CylinderGeometry(0.17, 0.17, 0.27, 10), radarWhiteMat);
    mHub.rotation.z = Math.PI / 2;
    mHub.position.set(gx, 0.35, mainZ);
    gearGroup.add(mHub);
  });
  parent.add(gearGroup);
  parent.userData.gearGroup = gearGroup;
}
function setWingFoldRatio(mesh, ratio) {
  mesh.userData.wingFoldRatio = ratio;
  if (!mesh.userData.wingFoldPivots) return;
  mesh.userData.wingFoldPivots.forEach((w) => {
    w.pivot.rotation.z = w.side * w.maxAngle * ratio;
  });
}
function createF35C({ foldedWings = false } = {}) {
  const jet = new THREE5.Group();
  const stations = [
    { z: 4.6, wMid: 0.16, yTop: 0.92, yBot: 0.72, wChine: 0.22 },
    { z: 3.2, wMid: 0.52, yTop: 1.25, yBot: 0.58, wChine: 0.78 },
    { z: 1.6, wMid: 1.05, yTop: 1.55, yBot: 0.52, wChine: 1.35 },
    { z: -0.2, wMid: 1.28, yTop: 1.48, yBot: 0.5, wChine: 1.58 },
    { z: -2, wMid: 1.2, yTop: 1.35, yBot: 0.54, wChine: 1.45 },
    { z: -3.8, wMid: 0.95, yTop: 1.22, yBot: 0.62, wChine: 1.15 },
    { z: -5.1, wMid: 0.62, yTop: 1.12, yBot: 0.72, wChine: 0.7 }
  ];
  const bodyVerts = [];
  const bodyIndices = [];
  const numPts = 8;
  stations.forEach((s, r) => {
    const yMid = (s.yTop + s.yBot) * 0.5;
    const h = (s.yTop - s.yBot) * 0.5;
    const ring = [
      [0, s.yTop, s.z],
      [s.wMid * 0.75, yMid + h * 0.6, s.z],
      [s.wChine, yMid, s.z],
      [s.wMid * 0.75, yMid - h * 0.6, s.z],
      [0, s.yBot, s.z],
      [-s.wMid * 0.75, yMid - h * 0.6, s.z],
      [-s.wChine, yMid, s.z],
      [-s.wMid * 0.75, yMid + h * 0.6, s.z]
    ];
    ring.forEach((pt) => bodyVerts.push(...pt));
    if (r < stations.length - 1) {
      for (let i = 0; i < numPts; i++) {
        const iNext = (i + 1) % numPts;
        const a = r * numPts + i;
        const b = r * numPts + iNext;
        const c = (r + 1) * numPts + iNext;
        const d = (r + 1) * numPts + i;
        bodyIndices.push(a, b, c);
        bodyIndices.push(a, c, d);
      }
    }
  });
  const bodyGeo = new THREE5.BufferGeometry();
  bodyGeo.setAttribute("position", new THREE5.Float32BufferAttribute(bodyVerts, 3));
  bodyGeo.setIndex(bodyIndices);
  bodyGeo.computeVertexNormals();
  const bodyMesh = new THREE5.Mesh(bodyGeo, f35DarkMat);
  bodyMesh.castShadow = true;
  jet.add(bodyMesh);
  const radomeCap = new THREE5.Mesh(new THREE5.ConeGeometry(0.38, 1.35, 8), f35NoseMat);
  radomeCap.rotation.x = Math.PI / 2;
  radomeCap.position.set(0, 0.85, 5.25);
  radomeCap.scale.set(0.65, 1, 0.45);
  jet.add(radomeCap);
  const eots = new THREE5.Mesh(new THREE5.ConeGeometry(0.18, 0.55, 4), canopyGoldMat);
  eots.rotation.x = -Math.PI / 2;
  eots.position.set(0, 0.56, 4.45);
  jet.add(eots);
  const canopy = new THREE5.Mesh(new THREE5.SphereGeometry(0.56, 16, 12), canopyGoldMat);
  canopy.position.set(0, 1.48, 2);
  canopy.scale.set(0.72, 0.52, 2.65);
  jet.add(canopy);
  const canopyArch = new THREE5.Mesh(new THREE5.TorusGeometry(0.48, 0.035, 6, 14, Math.PI), f35LightRamMat);
  canopyArch.position.set(0, 1.35, 2.05);
  canopyArch.scale.set(0.74, 0.72, 1);
  jet.add(canopyArch);
  [-1.02, 1.02].forEach((ix) => {
    const intake = new THREE5.Mesh(new THREE5.BoxGeometry(0.55, 0.58, 2.8), f35DarkMat);
    intake.position.set(ix, 1.08, 1.55);
    intake.rotation.z = ix > 0 ? -0.25 : 0.25;
    intake.rotation.y = ix > 0 ? 0.06 : -0.06;
    jet.add(intake);
    const cowlLip = new THREE5.Mesh(new THREE5.BoxGeometry(0.58, 0.12, 0.8), f35LightRamMat);
    cowlLip.position.set(ix, 1.35, 2.75);
    cowlLip.rotation.z = ix > 0 ? -0.25 : 0.25;
    jet.add(cowlLip);
  });
  [-1, 1].forEach((side) => {
    const innerWingGeo = new THREE5.BufferGeometry();
    const v0 = [side * 1.4, 1.08, 2.2];
    const v1 = [side * 3.8, 1.08, 0.52];
    const v2 = [side * 3.8, 1.08, -1.12];
    const v3 = [side * 1.4, 1.08, -1.76];
    const b0 = [side * 1.4, 0.96, 2.2];
    const b1 = [side * 3.8, 0.96, 0.52];
    const b2 = [side * 3.8, 0.96, -1.12];
    const b3 = [side * 1.4, 0.96, -1.76];
    const verts = [...v0, ...v1, ...v2, ...v3, ...b0, ...b1, ...b2, ...b3];
    const indices = side === 1 ? [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0] : [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 5, 4, 0, 1, 5, 1, 6, 5, 1, 2, 6, 2, 7, 6, 2, 3, 7, 3, 4, 7, 3, 0, 4];
    innerWingGeo.setAttribute("position", new THREE5.Float32BufferAttribute(verts, 3));
    innerWingGeo.setIndex(indices);
    innerWingGeo.computeVertexNormals();
    const innerMesh = new THREE5.Mesh(innerWingGeo, f35DarkMat);
    innerMesh.castShadow = true;
    jet.add(innerMesh);
    const hingeStrip = new THREE5.Mesh(new THREE5.BoxGeometry(0.12, 0.16, 1.8), foldHingeRedMat);
    hingeStrip.position.set(side * 3.8, 1.02, -0.3);
    jet.add(hingeStrip);
  });
  const wingFoldPivots = [];
  [-1, 1].forEach((side) => {
    const foldPivot = new THREE5.Group();
    foldPivot.position.set(side * 3.8, 1.05, 0);
    const outerWingGeo = new THREE5.BufferGeometry();
    const w0 = [0, 0.06, 0.52];
    const w1 = [side * 1.6, 0.06, -0.6];
    const w2 = [side * 1.6, 0.06, -1.55];
    const w3 = [0, 0.06, -1.12];
    const ub0 = [0, -0.06, 0.52];
    const ub1 = [side * 1.6, -0.06, -0.6];
    const ub2 = [side * 1.6, -0.06, -1.55];
    const ub3 = [0, -0.06, -1.12];
    const verts = [...w0, ...w1, ...w2, ...w3, ...ub0, ...ub1, ...ub2, ...ub3];
    const indices = side === 1 ? [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0] : [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 5, 4, 0, 1, 5, 1, 6, 5, 1, 2, 6, 2, 7, 6, 2, 3, 7, 3, 4, 7, 3, 0, 4];
    outerWingGeo.setAttribute("position", new THREE5.Float32BufferAttribute(verts, 3));
    outerWingGeo.setIndex(indices);
    outerWingGeo.computeVertexNormals();
    const outerMesh = new THREE5.Mesh(outerWingGeo, f35DarkMat);
    outerMesh.castShadow = true;
    foldPivot.add(outerMesh);
    const rail = new THREE5.Mesh(new THREE5.BoxGeometry(0.08, 0.12, 1.15), f35LightRamMat);
    rail.position.set(side * 1.62, 0, -1.05);
    foldPivot.add(rail);
    jet.add(foldPivot);
    wingFoldPivots.push({ pivot: foldPivot, side, maxAngle: Math.PI * 0.52 });
  });
  jet.userData.wingFoldPivots = wingFoldPivots;
  [-1, 1].forEach((side) => {
    const stabShape = new THREE5.Shape();
    stabShape.moveTo(0, 0);
    stabShape.lineTo(side * 2.35, -1.1);
    stabShape.lineTo(side * 2.15, -1.95);
    stabShape.lineTo(0, -1.45);
    stabShape.closePath();
    const stabGeo = new THREE5.ExtrudeGeometry(stabShape, { depth: 0.1, bevelEnabled: false });
    stabGeo.rotateX(Math.PI / 2);
    const hTail = new THREE5.Mesh(stabGeo, f35DarkMat);
    hTail.position.set(side * 1.05, 1.02, -3.8);
    hTail.castShadow = true;
    jet.add(hTail);
    const finShape = new THREE5.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(-0.85, 2.15);
    finShape.lineTo(0.55, 2.15);
    finShape.lineTo(1.85, 0);
    finShape.closePath();
    const finGeo = new THREE5.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
    const vTail = new THREE5.Mesh(finGeo, f35DarkMat);
    vTail.rotation.y = Math.PI / 2;
    vTail.rotation.z = side * 0.32;
    vTail.position.set(side * 1.25, 1.15, -3.4);
    vTail.castShadow = true;
    jet.add(vTail);
  });
  const nozzle = new THREE5.Mesh(new THREE5.CylinderGeometry(0.58, 0.68, 1.45, 16), nozzleDarkMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.96, -4.9);
  jet.add(nozzle);
  [-1, 1].forEach((side) => {
    const wingDecal = new THREE5.Mesh(new THREE5.PlaneGeometry(1.15, 0.58), insigniaDecalMat);
    wingDecal.rotation.x = -Math.PI / 2;
    wingDecal.position.set(side * 2.65, 1.15, -0.32);
    jet.add(wingDecal);
  });
  const burner = new THREE5.Mesh(
    new THREE5.CylinderGeometry(0.38, 0.08, 2.6, 12),
    new THREE5.MeshBasicMaterial({ color: 3718648, transparent: true, opacity: 0.92 })
  );
  burner.rotation.x = -Math.PI / 2;
  burner.position.set(0, 0.96, -6);
  burner.visible = false;
  jet.add(burner);
  jet.userData.afterburners = [burner];
  addLandingGear(jet, 3.8, 1.65, -0.6);
  setWingFoldRatio(jet, foldedWings ? 1 : 0);
  return jet;
}
function createFA18({ foldedWings = false, tailColor = 1976635 } = {}) {
  const jet = new THREE5.Group();
  const body = new THREE5.Mesh(new THREE5.BoxGeometry(2.05, 0.88, 8.8), fa18GreyMat);
  body.position.set(0, 1.1, 0.2);
  body.castShadow = true;
  jet.add(body);
  const spine = new THREE5.Mesh(new THREE5.CylinderGeometry(0.56, 0.7, 6, 12), fa18GreyMat);
  spine.rotation.x = Math.PI / 2;
  spine.position.set(0, 1.58, -0.4);
  jet.add(spine);
  [-0.92, 0.92].forEach((ix) => {
    const caretIntake = new THREE5.Mesh(new THREE5.BoxGeometry(0.68, 0.65, 4.5), fa18NoseMat);
    caretIntake.position.set(ix, 0.95, 0.6);
    caretIntake.rotation.z = ix > 0 ? -0.15 : 0.15;
    jet.add(caretIntake);
  });
  const lex = new THREE5.Mesh(new THREE5.BoxGeometry(3.45, 0.15, 5.2), fa18GreyMat);
  lex.position.set(0, 1.12, 1.5);
  jet.add(lex);
  const nose = new THREE5.Mesh(new THREE5.ConeGeometry(0.9, 4.4, 14), fa18NoseMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.96, 5.8);
  nose.scale.set(0.85, 1, 0.55);
  jet.add(nose);
  const canopy = new THREE5.Mesh(new THREE5.SphereGeometry(0.7, 14, 12), canopyBlueMat);
  canopy.position.set(0, 1.62, 2.2);
  canopy.scale.set(0.65, 0.58, 2.4);
  jet.add(canopy);
  const wingShape = new THREE5.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(3.4, -1.8);
  wingShape.lineTo(3.4, -3.2);
  wingShape.lineTo(0, -3.2);
  wingShape.closePath();
  const wingGeo = new THREE5.ExtrudeGeometry(wingShape, { depth: 0.15, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);
  [-1, 1].forEach((side) => {
    const wing = new THREE5.Mesh(wingGeo, fa18GreyMat);
    wing.position.set(side * 0.95, 1.15, 0.8);
    if (side === -1) wing.scale.x = -1;
    wing.castShadow = true;
    jet.add(wing);
    const wingDecal = new THREE5.Mesh(new THREE5.PlaneGeometry(1.2, 0.6), insigniaDecalMat);
    wingDecal.rotation.x = -Math.PI / 2;
    wingDecal.position.set(side * 2.4, 1.24, -0.4);
    jet.add(wingDecal);
  });
  const wingFoldPivots = [];
  [-1, 1].forEach((side) => {
    const foldPivot = new THREE5.Group();
    foldPivot.position.set(side * 4.35, 1.15, -0.5);
    const tipShape = new THREE5.Shape();
    tipShape.moveTo(0, 0.5);
    tipShape.lineTo(side * 1.55, -0.3);
    tipShape.lineTo(side * 1.55, -1.2);
    tipShape.lineTo(0, -0.9);
    tipShape.closePath();
    const tipGeo = new THREE5.ExtrudeGeometry(tipShape, { depth: 0.14, bevelEnabled: false });
    tipGeo.rotateX(Math.PI / 2);
    const tipMesh = new THREE5.Mesh(tipGeo, fa18GreyMat);
    tipMesh.castShadow = true;
    foldPivot.add(tipMesh);
    const rail = new THREE5.Mesh(new THREE5.BoxGeometry(0.12, 0.14, 1.8), fa18NoseMat);
    rail.position.set(side * 1.55, 0.05, -0.75);
    foldPivot.add(rail);
    const aim9 = new THREE5.Mesh(new THREE5.CylinderGeometry(0.08, 0.08, 1.6, 8), radarWhiteMat);
    aim9.rotation.x = Math.PI / 2;
    aim9.position.set(side * 1.55, -0.05, -0.75);
    foldPivot.add(aim9);
    jet.add(foldPivot);
    wingFoldPivots.push({ pivot: foldPivot, side, maxAngle: Math.PI * 0.5 });
  });
  jet.userData.wingFoldPivots = wingFoldPivots;
  [-1.85, 1.85].forEach((px) => {
    const pylon = new THREE5.Mesh(new THREE5.BoxGeometry(0.12, 0.32, 1.5), fa18NoseMat);
    pylon.position.set(px, 0.88, -0.4);
    jet.add(pylon);
    const dropTank = new THREE5.Mesh(new THREE5.CylinderGeometry(0.24, 0.24, 2.8, 10), fa18GreyMat);
    dropTank.rotation.x = Math.PI / 2;
    dropTank.position.set(px, 0.65, -0.4);
    jet.add(dropTank);
  });
  [-1, 1].forEach((side) => {
    const stab = new THREE5.Mesh(new THREE5.BoxGeometry(1.95, 0.13, 1.9), fa18GreyMat);
    stab.position.set(side * 2.15, 0.98, -3.8);
    stab.rotation.y = -side * 0.22;
    stab.castShadow = true;
    jet.add(stab);
    const tailFlashMat = new THREE5.MeshStandardMaterial({ color: tailColor, roughness: 0.45 });
    const vTail = new THREE5.Mesh(new THREE5.BoxGeometry(0.15, 2.15, 2.35), fa18GreyMat);
    vTail.position.set(side * 1.15, 2.15, -2.6);
    vTail.rotation.z = -side * 0.35;
    vTail.rotation.y = -side * 0.08;
    vTail.castShadow = true;
    jet.add(vTail);
    const tailCap = new THREE5.Mesh(new THREE5.BoxGeometry(0.18, 0.38, 2.05), tailFlashMat);
    tailCap.position.set(side * 1.52, 3.12, -2.7);
    tailCap.rotation.z = -side * 0.35;
    jet.add(tailCap);
  });
  const burners = [];
  [-0.52, 0.52].forEach((nx) => {
    const noz = new THREE5.Mesh(new THREE5.CylinderGeometry(0.38, 0.44, 1.1, 12), nozzleDarkMat);
    noz.rotation.x = Math.PI / 2;
    noz.position.set(nx, 1.08, -4.2);
    jet.add(noz);
    const ab = new THREE5.Mesh(
      new THREE5.CylinderGeometry(0.32, 0.06, 2.4, 10),
      new THREE5.MeshBasicMaterial({ color: 3718648, transparent: true, opacity: 0.92 })
    );
    ab.rotation.x = -Math.PI / 2;
    ab.position.set(nx, 1.08, -5.4);
    ab.visible = false;
    jet.add(ab);
    burners.push(ab);
  });
  jet.userData.afterburners = burners;
  addLandingGear(jet, 3.6, 1.55, -0.6);
  setWingFoldRatio(jet, foldedWings ? 1 : 0);
  return jet;
}
function createE2DHawkeye({ foldedWings = false } = {}) {
  const awacs = new THREE5.Group();
  const body = new THREE5.Mesh(new THREE5.CylinderGeometry(1.15, 0.95, 11.6, 18), e2BodyMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 1.62, 0.2);
  body.scale.set(1, 1, 1.05);
  body.castShadow = true;
  awacs.add(body);
  const dorsalScoop = new THREE5.Mesh(new THREE5.BoxGeometry(0.88, 0.48, 5.4), e2BodyMat);
  dorsalScoop.position.set(0, 2.65, -0.2);
  awacs.add(dorsalScoop);
  const nose = new THREE5.Mesh(new THREE5.SphereGeometry(1.1, 16, 14), e2BodyMat);
  nose.position.set(0, 1.62, 5.8);
  nose.scale.set(1, 0.88, 1.45);
  awacs.add(nose);
  const radomeTip = new THREE5.Mesh(new THREE5.SphereGeometry(0.66, 12, 10), tireBlackMat);
  radomeTip.position.set(0, 1.48, 7.05);
  awacs.add(radomeTip);
  const cockpit = new THREE5.Mesh(new THREE5.BoxGeometry(1.68, 0.6, 1.6), canopyBlueMat);
  cockpit.position.set(0, 2.45, 4.2);
  awacs.add(cockpit);
  const centerWing = new THREE5.Mesh(new THREE5.BoxGeometry(8.4, 0.28, 2.4), e2BodyMat);
  centerWing.position.set(0, 2.38, 0.5);
  centerWing.castShadow = true;
  awacs.add(centerWing);
  const wingFoldPivots = [];
  [-1, 1].forEach((side) => {
    const outerWing = new THREE5.Mesh(new THREE5.BoxGeometry(4.4, 0.24, 1.9), e2BodyMat);
    outerWing.position.set(side * 2.2, 0, 0);
    outerWing.castShadow = true;
    const foldPivot = new THREE5.Group();
    foldPivot.position.set(side * 4.2, 2.38, 0.5);
    foldPivot.add(outerWing);
    awacs.add(foldPivot);
    wingFoldPivots.push({ pivot: foldPivot, side, maxAngle: Math.PI * 0.48 });
  });
  awacs.userData.wingFoldPivots = wingFoldPivots;
  [-2.8, 2.8].forEach((nx) => {
    const nacelle = new THREE5.Mesh(new THREE5.CylinderGeometry(0.62, 0.5, 4, 14), e2BodyMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(nx, 2.05, 0.5);
    nacelle.castShadow = true;
    awacs.add(nacelle);
    const propGroup = new THREE5.Group();
    propGroup.position.set(nx, 2.05, 2.65);
    const spinner = new THREE5.Mesh(new THREE5.ConeGeometry(0.36, 0.92, 14), radarWhiteMat);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = 0.46;
    propGroup.add(spinner);
    for (let b = 0; b < 8; b++) {
      const blade = new THREE5.Mesh(new THREE5.BoxGeometry(2.95, 0.18, 0.05), tireBlackMat);
      blade.rotation.z = b * Math.PI / 4;
      const tipStripe = new THREE5.Mesh(new THREE5.BoxGeometry(0.45, 0.19, 0.06), radarWhiteMat);
      tipStripe.position.x = 1.25;
      blade.add(tipStripe);
      propGroup.add(blade);
    }
    awacs.add(propGroup);
    spinningPropsAndDomes.push({ mesh: propGroup, speed: 24, axis: "z" });
  });
  [-0.65, 0.65].forEach((sx) => {
    const strut = new THREE5.Mesh(new THREE5.CylinderGeometry(0.08, 0.11, 1.6, 8), e2BodyMat);
    strut.position.set(sx, 3.25, -0.6);
    strut.rotation.z = sx > 0 ? -0.22 : 0.22;
    awacs.add(strut);
  });
  const rotodome = new THREE5.Group();
  rotodome.position.set(0, 4.15, -0.6);
  const rotodomeTex = createRotodomeTexture();
  const dishMat = new THREE5.MeshStandardMaterial({ map: rotodomeTex, roughness: 0.38 });
  const dish = new THREE5.Mesh(new THREE5.CylinderGeometry(4.05, 4.05, 0.68, 36), dishMat);
  dish.castShadow = true;
  rotodome.add(dish);
  const topCap = new THREE5.Mesh(new THREE5.CircleGeometry(4.02, 36), dishMat);
  topCap.rotation.x = -Math.PI / 2;
  topCap.position.y = 0.35;
  rotodome.add(topCap);
  awacs.add(rotodome);
  spinningPropsAndDomes.push({ mesh: rotodome, speed: 1.25, axis: "y" });
  const hTail = new THREE5.Mesh(new THREE5.BoxGeometry(6, 0.18, 1.7), e2BodyMat);
  hTail.position.set(0, 2.55, -4.8);
  awacs.add(hTail);
  [-2.6, -0.9, 0.9, 2.6].forEach((fx) => {
    const vFin = new THREE5.Mesh(new THREE5.BoxGeometry(0.16, 2.15, 1.85), e2BodyMat);
    vFin.position.set(fx, 3.2, -4.8);
    vFin.castShadow = true;
    awacs.add(vFin);
    const finCap = new THREE5.Mesh(new THREE5.BoxGeometry(0.18, 0.3, 1.7), tireBlackMat);
    finCap.position.set(fx, 4.25, -4.8);
    awacs.add(finCap);
  });
  addLandingGear(awacs, 4.2, 2.1, 0.3);
  setWingFoldRatio(awacs, foldedWings ? 1 : 0);
  return awacs;
}
function createSeahawk() {
  const heli = new THREE5.Group();
  const cabin = new THREE5.Mesh(new THREE5.BoxGeometry(2.2, 1.7, 6.6), heloDarkMat);
  cabin.position.set(0, 1.4, 0.6);
  cabin.castShadow = true;
  heli.add(cabin);
  [-1.11, 1.11].forEach((side) => {
    const sideWin = new THREE5.Mesh(new THREE5.BoxGeometry(0.05, 0.6, 2.9), canopyBlueMat);
    sideWin.position.set(side, 1.54, 0.9);
    heli.add(sideWin);
  });
  const doghouse = new THREE5.Mesh(new THREE5.BoxGeometry(1.7, 0.68, 3.9), heloDarkMat);
  doghouse.position.set(0, 2.42, 0.35);
  heli.add(doghouse);
  [-0.58, 0.58].forEach((ex) => {
    const exhaust = new THREE5.Mesh(new THREE5.CylinderGeometry(0.26, 0.3, 0.95, 10), nozzleDarkMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(ex, 2.36, -1.7);
    heli.add(exhaust);
  });
  const nose = new THREE5.Mesh(new THREE5.SphereGeometry(1.08, 16, 12), heloDarkMat);
  nose.scale.set(0.96, 0.8, 1.48);
  nose.position.set(0, 1.24, 3.8);
  heli.add(nose);
  const flirBall = new THREE5.Mesh(new THREE5.SphereGeometry(0.3, 12, 10), nozzleDarkMat);
  flirBall.position.set(0, 0.96, 5.05);
  heli.add(flirBall);
  const windshield = new THREE5.Mesh(new THREE5.BoxGeometry(1.96, 0.7, 1.4), canopyBlueMat);
  windshield.position.set(0, 1.7, 3.3);
  windshield.rotation.x = -0.24;
  heli.add(windshield);
  const tailBoom = new THREE5.Mesh(new THREE5.BoxGeometry(0.78, 0.88, 6), heloDarkMat);
  tailBoom.position.set(0, 1.6, -4.6);
  tailBoom.castShadow = true;
  heli.add(tailBoom);
  const tailPylon = new THREE5.Mesh(new THREE5.BoxGeometry(0.38, 2.3, 1.4), heloDarkMat);
  tailPylon.position.set(0, 2.46, -7.2);
  tailPylon.rotation.x = -0.18;
  heli.add(tailPylon);
  const stabilator = new THREE5.Mesh(new THREE5.BoxGeometry(3.4, 0.12, 0.92), heloDarkMat);
  stabilator.position.set(0, 1.38, -7.35);
  heli.add(stabilator);
  [-1.28, 1.28].forEach((side) => {
    const sponson = new THREE5.Mesh(new THREE5.BoxGeometry(0.48, 0.38, 1.45), heloDarkMat);
    sponson.position.set(side * 0.95, 0.84, 1.15);
    heli.add(sponson);
    const wheel = new THREE5.Mesh(new THREE5.CylinderGeometry(0.35, 0.35, 0.24, 14), tireBlackMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side, 0.35, 1.2);
    heli.add(wheel);
  });
  const tailWheel = new THREE5.Mesh(new THREE5.CylinderGeometry(0.19, 0.19, 0.15, 10), tireBlackMat);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, 0.25, -4.9);
  heli.add(tailWheel);
  const mainRotor = new THREE5.Group();
  mainRotor.position.set(0, 2.92, 0.85);
  const hub = new THREE5.Mesh(new THREE5.CylinderGeometry(0.45, 0.45, 0.46, 14), nozzleDarkMat);
  mainRotor.add(hub);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE5.Mesh(new THREE5.BoxGeometry(10.6, 0.06, 0.42), tireBlackMat);
    blade.rotation.y = i * Math.PI / 2;
    blade.castShadow = true;
    mainRotor.add(blade);
  }
  const rotorBlur = new THREE5.Mesh(
    new THREE5.RingGeometry(0.95, 5.3, 32),
    new THREE5.MeshBasicMaterial({ color: 13358561, side: THREE5.DoubleSide, transparent: true, opacity: 0.16 })
  );
  rotorBlur.rotation.x = Math.PI / 2;
  mainRotor.add(rotorBlur);
  heli.add(mainRotor);
  const tailRotor = new THREE5.Group();
  tailRotor.position.set(0.36, 3.02, -7.42);
  for (let i = 0; i < 4; i++) {
    const tBlade = new THREE5.Mesh(new THREE5.BoxGeometry(0.06, 2.3, 0.22), tireBlackMat);
    tBlade.rotation.x = i * Math.PI / 4;
    tailRotor.add(tBlade);
  }
  heli.add(tailRotor);
  const rotorEntry = { mainRotor, tailRotor, speed: 17.5 };
  allHeliRotors.push(rotorEntry);
  heli.userData.rotorEntry = rotorEntry;
  return heli;
}
function createDeckTractor(colorHex = 15381256) {
  const tug = new THREE5.Group();
  const bodyMat = new THREE5.MeshStandardMaterial({ color: colorHex, roughness: 0.45 });
  const chassis = new THREE5.Mesh(new THREE5.BoxGeometry(1.95, 0.75, 3.5), bodyMat);
  chassis.position.y = 0.52;
  chassis.castShadow = true;
  tug.add(chassis);
  const hood = new THREE5.Mesh(new THREE5.BoxGeometry(1.78, 0.3, 1.4), bodyMat);
  hood.position.set(0, 0.98, 0.88);
  hood.castShadow = true;
  tug.add(hood);
  const grille = new THREE5.Mesh(new THREE5.BoxGeometry(1.38, 0.48, 0.08), tireBlackMat);
  grille.position.set(0, 0.52, 1.76);
  tug.add(grille);
  const cab = new THREE5.Mesh(new THREE5.BoxGeometry(1.44, 0.5, 1.28), tireBlackMat);
  cab.position.set(0, 1.08, -0.65);
  cab.castShadow = true;
  tug.add(cab);
  [-1.02, 1.02].forEach((wx) => {
    const tire = new THREE5.Mesh(new THREE5.CylinderGeometry(0.39, 0.39, 0.29, 14), tireBlackMat);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(wx, 0.39, 0.85);
    tire.castShadow = true;
    tug.add(tire);
  });
  [-1.02, 1.02].forEach((wx) => {
    [-0.85, -1.35].forEach((wz) => {
      const tire = new THREE5.Mesh(new THREE5.CylinderGeometry(0.39, 0.39, 0.25, 14), tireBlackMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(wx, 0.39, wz);
      tire.castShadow = true;
      tug.add(tire);
      const rim = new THREE5.Mesh(new THREE5.CylinderGeometry(0.19, 0.19, 0.31, 10), radarWhiteMat);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(wx, 0.39, wz);
      tug.add(rim);
    });
  });
  return tug;
}
var crewPantsMat = new THREE5.MeshStandardMaterial({ color: 1516884, roughness: 0.78 });
var crewBootMat = new THREE5.MeshStandardMaterial({ color: 988970, roughness: 0.85 });
var crewSkinMat = new THREE5.MeshStandardMaterial({ color: 14067590, roughness: 0.65 });
var crewVisorMat = new THREE5.MeshStandardMaterial({ color: 593174, roughness: 0.15, metalness: 0.85 });
var wandGlowMat = new THREE5.MeshBasicMaterial({ color: 16638023 });
function createNavyPersonnel(spec) {
  const person = new THREE5.Group();
  const jerseyMat = new THREE5.MeshStandardMaterial({ color: spec.jersey, roughness: 0.62 });
  const vestMat = new THREE5.MeshStandardMaterial({ color: spec.vest, roughness: 0.52 });
  const helmetMat = new THREE5.MeshStandardMaterial({ color: spec.helmet, roughness: 0.38 });
  const leftLeg = new THREE5.Group();
  leftLeg.position.set(-0.11, 0.72, 0);
  const lThigh = new THREE5.Mesh(new THREE5.CylinderGeometry(0.085, 0.075, 0.62, 8), crewPantsMat);
  lThigh.position.y = -0.31;
  lThigh.castShadow = true;
  leftLeg.add(lThigh);
  const lBoot = new THREE5.Mesh(new THREE5.BoxGeometry(0.14, 0.12, 0.24), crewBootMat);
  lBoot.position.set(0, -0.66, 0.04);
  leftLeg.add(lBoot);
  person.add(leftLeg);
  const rightLeg = new THREE5.Group();
  rightLeg.position.set(0.11, 0.72, 0);
  const rThigh = new THREE5.Mesh(new THREE5.CylinderGeometry(0.085, 0.075, 0.62, 8), crewPantsMat);
  rThigh.position.y = -0.31;
  rThigh.castShadow = true;
  rightLeg.add(rThigh);
  const rBoot = new THREE5.Mesh(new THREE5.BoxGeometry(0.14, 0.12, 0.24), crewBootMat);
  rBoot.position.set(0, -0.66, 0.04);
  rightLeg.add(rBoot);
  person.add(rightLeg);
  const torso = new THREE5.Mesh(new THREE5.BoxGeometry(0.38, 0.56, 0.22), jerseyMat);
  torso.position.set(0, 1, 0);
  torso.castShadow = true;
  person.add(torso);
  const floatVest = new THREE5.Mesh(new THREE5.BoxGeometry(0.42, 0.44, 0.27), vestMat);
  floatVest.position.set(0, 1.03, 0);
  person.add(floatVest);
  const reflectTape = new THREE5.Mesh(new THREE5.BoxGeometry(0.43, 0.05, 0.28), radarWhiteMat);
  reflectTape.position.set(0, 1.14, 0);
  person.add(reflectTape);
  const headGroup = new THREE5.Group();
  headGroup.position.set(0, 1.42, 0);
  const head = new THREE5.Mesh(new THREE5.SphereGeometry(0.13, 10, 10), crewSkinMat);
  headGroup.add(head);
  const cranial = new THREE5.Mesh(new THREE5.SphereGeometry(0.155, 10, 10), helmetMat);
  cranial.position.set(0, 0.02, -0.01);
  cranial.scale.set(1, 1.05, 1.08);
  cranial.castShadow = true;
  headGroup.add(cranial);
  const goggles = new THREE5.Mesh(new THREE5.BoxGeometry(0.24, 0.08, 0.14), crewVisorMat);
  goggles.position.set(0, 0.02, 0.1);
  headGroup.add(goggles);
  [-0.16, 0.16].forEach((ex) => {
    const earCup = new THREE5.Mesh(new THREE5.SphereGeometry(0.065, 8, 8), crewBootMat);
    earCup.scale.set(0.65, 1.15, 0.9);
    earCup.position.set(ex, 0, 0);
    headGroup.add(earCup);
  });
  person.add(headGroup);
  const leftArm = new THREE5.Group();
  leftArm.position.set(-0.25, 1.22, 0);
  const lSleeve = new THREE5.Mesh(new THREE5.CylinderGeometry(0.065, 0.055, 0.48, 8), jerseyMat);
  lSleeve.position.y = -0.22;
  leftArm.add(lSleeve);
  const rightArm = new THREE5.Group();
  rightArm.position.set(0.25, 1.22, 0);
  const rSleeve = new THREE5.Mesh(new THREE5.CylinderGeometry(0.065, 0.055, 0.48, 8), jerseyMat);
  rSleeve.position.y = -0.22;
  rightArm.add(rSleeve);
  if (spec.pose === "MARSHAL") {
    [leftArm, rightArm].forEach((arm) => {
      const wand = new THREE5.Mesh(new THREE5.CylinderGeometry(0.02, 0.02, 0.36, 6), wandGlowMat);
      wand.position.set(0, -0.52, 0.06);
      wand.rotation.x = 0.35;
      arm.add(wand);
    });
  } else if (spec.pose === "CARRY") {
    const chock = new THREE5.Mesh(new THREE5.BoxGeometry(0.18, 0.14, 0.32), wandGlowMat);
    chock.position.set(0, -0.46, 0.08);
    rightArm.add(chock);
  }
  person.add(leftArm);
  person.add(rightArm);
  person.scale.setScalar(1.08);
  person.userData.limbs = { leftLeg, rightLeg, leftArm, rightArm, headGroup, pose: spec.pose };
  return person;
}
function createParkingChocksGroup(x, z, rotY) {
  const g = new THREE5.Group();
  g.position.set(x, 0.08, z);
  g.rotation.y = rotY;
  [-1.45, 1.45].forEach((wx) => {
    const chockF = new THREE5.Mesh(new THREE5.BoxGeometry(0.65, 0.16, 0.22), yellowGearMat);
    chockF.position.set(wx, 0, -0.45);
    g.add(chockF);
    const chockB = new THREE5.Mesh(new THREE5.BoxGeometry(0.65, 0.16, 0.22), yellowGearMat);
    chockB.position.set(wx, 0, -1.25);
    g.add(chockB);
  });
  return g;
}

// ../game/GameHub/games/USSFord/js/flightOps.js
var FlightOpsSystem = class {
  constructor(carrierContext, onStatusLog, onRosterChanged) {
    this.carrierContext = carrierContext;
    this.deckAssetsGroup = carrierContext.deckAssetsGroup;
    this.deckObstacleList = carrierContext.deckObstacleList;
    this.jbdCat1 = carrierContext.jbdCat1;
    this.jbdCat2 = carrierContext.jbdCat2;
    this.arrestingWireLine = carrierContext.arrestingWireLine;
    this.onStatusLog = onStatusLog || (() => {
    });
    this.onRosterChanged = onRosterChanged || (() => {
    });
    this.airWingUnits = [];
    this.mobileDeckVehicles = [];
    this.deckCrewList = [];
    this.autoOpsTimer = 0;
    this.initAirWing();
    this.initDeckSupportVehicles();
    this.initDeckCrew();
  }
  log(msg) {
    this.onStatusLog(msg);
  }
  notifyRoster() {
    this.onRosterChanged();
  }
  registerAircraft({
    id,
    callsign,
    type,
    label,
    homeX,
    homeZ,
    homeRot,
    homeFolded = true,
    canCycleJet = true,
    catPref = 1,
    tailColor = 1976635
  }) {
    let mesh;
    if (type === "F-35C") mesh = createF35C({ foldedWings: homeFolded });
    else if (type === "F/A-18E") mesh = createFA18({ foldedWings: homeFolded, tailColor });
    else if (type === "E-2D") mesh = createE2DHawkeye({ foldedWings: homeFolded });
    else mesh = createSeahawk();
    mesh.position.set(homeX, 0, homeZ);
    mesh.rotation.set(0, homeRot, 0);
    this.deckAssetsGroup.add(mesh);
    const chocks = createParkingChocksGroup(homeX, homeZ, homeRot);
    this.deckAssetsGroup.add(chocks);
    const unit = {
      id,
      callsign,
      type,
      label,
      mesh,
      chocks,
      homePos: new THREE6.Vector3(homeX, 0, homeZ),
      homeRot,
      homeFolded,
      canCycleJet,
      catIndex: catPref,
      state: "PARKED",
      stateTimer: 0,
      patrolAngle: Math.random() * Math.PI * 2,
      patrolLaps: 0,
      taxiCurve: null,
      taxiDuration: 6,
      taxiTargetRot: homeRot,
      currentYaw: homeRot,
      taxiAvoidOffset: new THREE6.Vector2(0, 0),
      prevTaxiPos: null
    };
    unit.mesh.userData.unit = unit;
    this.airWingUnits.push(unit);
    return unit;
  }
  initAirWing() {
    const starboardEdgeLineSpecs = [
      { cs: "VFA-31 #101", type: "F/A-18E", x: -16.8, z: 108, rot: 1.05, cat: 1 },
      { cs: "VFA-31 #102", type: "F/A-18E", x: -19.8, z: 94, rot: 1.08, cat: 1 },
      { cs: "VFA-31 #103", type: "F/A-18E", x: -23, z: 80, rot: 1.1, cat: 1 },
      { cs: "VFA-31 #104", type: "F/A-18E", x: -26.2, z: 66, rot: 1.12, cat: 1 },
      { cs: "VFA-87 #201", type: "F/A-18E", x: -29.2, z: 52, rot: 1.14, cat: 1 },
      { cs: "VFA-87 #202", type: "F/A-18E", x: -31.8, z: 38, rot: 1.15, cat: 2 },
      { cs: "VFA-87 #203", type: "F/A-18E", x: -35.2, z: 24, rot: 1.48, cat: 2 },
      { cs: "VFA-87 #204", type: "F/A-18E", x: -34.8, z: 12, rot: 1.48, cat: 2 },
      { cs: "VFA-213 #205", type: "F/A-18E", x: -31.8, z: -2, rot: 1.15, cat: 2 },
      { cs: "VFA-213 #206", type: "F/A-18E", x: -34.8, z: -15, rot: 1.16, cat: 2 },
      { cs: "VFA-213 #207", type: "F/A-18E", x: -31.6, z: -27, rot: 1.12, cat: 1 },
      { cs: "VMFA-211 #301", type: "F-35C", x: -28.5, z: -38, rot: 1.08, cat: 1 }
    ];
    starboardEdgeLineSpecs.forEach((s, idx) => {
      this.registerAircraft({
        id: `stbd-line-${idx}`,
        callsign: s.cs,
        type: s.type,
        label: s.type === "F-35C" ? "F-35C Lightning II" : "F/A-18E Super Hornet",
        homeX: s.x,
        homeZ: s.z,
        homeRot: s.rot,
        homeFolded: true,
        canCycleJet: true,
        catPref: s.cat
      });
    });
    const midDeckSpecs = [
      { cs: "VMFA-211 #302", type: "F-35C", folded: false, x: -11.5, z: 4, rot: -0.22, cat: 1 },
      { cs: "VFA-213 #401", type: "F/A-18E", folded: false, x: -12, z: -9.5, rot: -0.25, cat: 2 }
    ];
    midDeckSpecs.forEach((s, idx) => {
      this.registerAircraft({
        id: `mid-jet-${idx}`,
        callsign: s.cs,
        type: s.type,
        label: s.type === "F-35C" ? "F-35C Lightning II" : "F/A-18E Super Hornet",
        homeX: s.x,
        homeZ: s.z,
        homeRot: s.rot,
        homeFolded: s.folded,
        canCycleJet: true,
        catPref: s.cat
      });
    });
    const aftStarboardSpecs = [
      { cs: "VFA-147 #304", type: "F/A-18E", x: -30.5, z: -82, rot: 0.92, cat: 1 },
      { cs: "VFA-147 #305", type: "F/A-18E", x: -29.2, z: -96, rot: 0.95, cat: 2 },
      { cs: "VMFA-211 #306", type: "F-35C", x: -25.8, z: -126, rot: 1.05, cat: 1 },
      { cs: "VFA-87 #403", type: "F/A-18E", x: -21.8, z: -140, rot: 1.15, cat: 2 }
    ];
    aftStarboardSpecs.forEach((s, idx) => {
      this.registerAircraft({
        id: `aft-stbd-${idx}`,
        callsign: s.cs,
        type: s.type,
        label: s.type === "F-35C" ? "F-35C Lightning II" : "F/A-18E Super Hornet",
        homeX: s.x,
        homeZ: s.z,
        homeRot: s.rot,
        homeFolded: true,
        canCycleJet: true,
        catPref: s.cat
      });
    });
    this.registerAircraft({
      id: "awacs-1",
      callsign: "VAW-124 #601",
      type: "E-2D",
      label: "E-2D Adv. Hawkeye",
      homeX: -27.5,
      homeZ: -111,
      homeRot: 0.85,
      homeFolded: true,
      canCycleJet: false
    });
    this.registerAircraft({
      id: "awacs-2",
      callsign: "VAW-124 #602",
      type: "E-2D",
      label: "E-2D Adv. Hawkeye",
      homeX: 25.5,
      homeZ: -102,
      homeRot: -0.68,
      homeFolded: true,
      canCycleJet: false
    });
    const portAftHornets = [
      { cs: "VFA-213 #501", x: 28.5, z: -84, rot: -0.78, cat: 2 },
      { cs: "VFA-213 #502", x: 31.8, z: -68, rot: -0.82, cat: 2 }
    ];
    portAftHornets.forEach((s, idx) => {
      this.registerAircraft({
        id: `port-hornet-${idx}`,
        callsign: s.cs,
        type: "F/A-18E",
        label: "F/A-18E Super Hornet",
        homeX: s.x,
        homeZ: s.z,
        homeRot: s.rot,
        homeFolded: true,
        canCycleJet: true,
        catPref: s.cat
      });
    });
    const seahawkSpecs = [
      { cs: "HSC-9 #610", x: 19.5, z: -116, rot: -0.75 },
      { cs: "HSC-9 #611", x: 17.5, z: -125, rot: -0.75 },
      { cs: "HSC-9 #612", x: 15.5, z: -134, rot: -0.75 },
      { cs: "HSC-9 #613", x: 13.5, z: -143, rot: -0.75 }
    ];
    seahawkSpecs.forEach((s, idx) => {
      this.registerAircraft({
        id: `seahawk-${idx}`,
        callsign: s.cs,
        type: "MH-60S",
        label: "MH-60S Seahawk",
        homeX: s.x,
        homeZ: s.z,
        homeRot: s.rot,
        homeFolded: false,
        canCycleJet: false
      });
    });
  }
  initDeckSupportVehicles() {
    const islandSupportVehicles = [
      { color: 16317180, x: -24, z: -48, rot: 1.57 },
      { color: 16317180, x: -24, z: -44.2, rot: 1.57 },
      { color: 16317180, x: -21.2, z: -41.5, rot: 0.45 },
      { color: 16317180, x: -24.5, z: -36.5, rot: 1.25 },
      { color: 16317180, x: -21.5, z: -33.8, rot: 0.85 },
      { color: 15381256, x: -26.2, z: -38, rot: 0.35 },
      { color: 15381256, x: -24.2, z: -54, rot: 1.57 },
      { color: 15381256, x: -30.5, z: -70, rot: 0.1 },
      { color: 15381256, x: 25.5, z: 20, rot: -0.15, speed: 4, route: [
        { x: 16, z: 19 },
        { x: 18, z: 24 },
        { x: 14, z: 28 },
        { x: 11, z: 22 },
        { x: 12, z: 16 }
      ] },
      { color: 15381256, x: 4.5, z: -78, rot: 0.4, speed: 4, route: [
        { x: -15, z: -78 },
        { x: -17, z: -72 },
        { x: -19, z: -77 },
        { x: -18, z: -84 },
        { x: -15, z: -88 }
      ] },
      { color: 16317180, x: 16.5, z: -64, rot: -0.6, speed: 3.6, route: [
        { x: -7, z: -61 },
        { x: -9, z: -56 },
        { x: -13, z: -60 },
        { x: -12, z: -66 }
      ] }
    ];
    islandSupportVehicles.forEach((t) => {
      const tug = createDeckTractor(t.color);
      tug.position.set(t.x, 0, t.z);
      tug.rotation.y = t.rot;
      this.deckAssetsGroup.add(tug);
      if (t.route) {
        this.mobileDeckVehicles.push({ mesh: tug, route: t.route, routeIndex: 0, speed: t.speed });
      } else {
        this.deckObstacleList.push({ x: t.x, z: t.z, radius: 2.8 });
      }
    });
  }
  initDeckCrew() {
    const crewRoleSpecs = [
      { role: "DIRECTOR", jersey: 15381256, vest: 16436245, helmet: 15381256, pose: "MARSHAL" },
      { role: "CAT_CREW", jersey: 1483594, vest: 1409085, helmet: 1483594, pose: "INSPECT" },
      { role: "SAFETY", jersey: 16317180, vest: 14870768, helmet: 16317180, pose: "CLIPBOARD" },
      { role: "CHOCKS", jersey: 2450411, vest: 1920728, helmet: 2450411, pose: "CARRY" },
      { role: "ORDNANCE", jersey: 14427686, vest: 12131356, helmet: 14427686, pose: "WALK" },
      { role: "FUELS", jersey: 9647082, vest: 8266446, helmet: 9647082, pose: "WALK" }
    ];
    const isPointInRunwayOrCatapultZone = (x, z, buffer = 2) => {
      const rAx = -4.5, rAz = -152;
      const rBx = 36.5, rBz = 42;
      const rDx = rBx - rAx, rDz = rBz - rAz;
      const rLenSq = rDx * rDx + rDz * rDz;
      const tRunway = THREE6.MathUtils.clamp(((x - rAx) * rDx + (z - rAz) * rDz) / rLenSq, 0, 1);
      const closeRx = rAx + tRunway * rDx;
      const closeRz = rAz + tRunway * rDz;
      const distRunway = Math.hypot(x - closeRx, z - closeRz);
      if (distRunway < 11.8 + buffer) return true;
      if (z >= 40 - buffer && z <= 152 + buffer && Math.abs(x - -7) < 4.5 + buffer) return true;
      if (z >= 34 - buffer && z <= 152 + buffer && Math.abs(x - 8) < 4.5 + buffer) return true;
      return false;
    };
    const clampOutOfRunwayZone = (pos, minClearance = 12.2) => {
      const rAx = -4.5, rAz = -152;
      const rBx = 36.5, rBz = 42;
      const rDx = rBx - rAx, rDz = rBz - rAz;
      const rLenSq = rDx * rDx + rDz * rDz;
      const tRunway = THREE6.MathUtils.clamp(((pos.x - rAx) * rDx + (pos.z - rAz) * rDz) / rLenSq, 0, 1);
      const closeRx = rAx + tRunway * rDx;
      const closeRz = rAz + tRunway * rDz;
      const dx = pos.x - closeRx;
      const dz = pos.z - closeRz;
      const dist = Math.hypot(dx, dz);
      if (dist < minClearance) {
        const pushDirX = dx < 2 ? -1 : 1;
        const nx = dist > 1e-3 ? dx / dist : pushDirX;
        const nz = dist > 1e-3 ? dz / dist : 0;
        pos.x = closeRx + nx * minClearance;
        pos.z = closeRz + nz * minClearance;
      }
      pos.x = THREE6.MathUtils.clamp(pos.x, -33, 34);
      pos.z = THREE6.MathUtils.clamp(pos.z, -142, 145);
    };
    const strategicCrewZones = [
      { xMin: -25.5, xMax: -13, zMin: -25, zMax: 95, count: 28 },
      { xMin: -2.2, xMax: 3.2, zMin: 42, zMax: 128, count: 18 },
      { xMin: -24.5, xMax: -14.5, zMin: -78, zMax: -28, count: 18 },
      { xMin: -23.5, xMax: -15.5, zMin: -128, zMax: -80, count: 14 }
    ];
    let crewCounter = 0;
    strategicCrewZones.forEach((zone) => {
      for (let i = 0; i < zone.count; i++) {
        const spec = crewRoleSpecs[crewCounter % crewRoleSpecs.length];
        crewCounter++;
        const crew = createNavyPersonnel(spec);
        let bx = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
        let bz = zone.zMin + Math.random() * (zone.zMax - zone.zMin);
        for (let attempt = 0; attempt < 15; attempt++) {
          if (!isPointInRunwayOrCatapultZone(bx, bz, 2.2)) break;
          bx = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
          bz = zone.zMin + Math.random() * (zone.zMax - zone.zMin);
        }
        const safePt = { x: bx, z: bz };
        clampOutOfRunwayZone(safePt, 12.8);
        bx = safePt.x;
        bz = safePt.z;
        const initRot = Math.random() * Math.PI * 2;
        crew.position.set(bx, 0, bz);
        crew.rotation.y = initRot;
        this.deckAssetsGroup.add(crew);
        const isStationary = (spec.pose === "MARSHAL" || spec.pose === "CLIPBOARD") && Math.random() < 0.65;
        this.deckCrewList.push({
          mesh: crew,
          baseX: bx,
          baseZ: bz,
          evadeOffsetX: 0,
          evadeOffsetZ: 0,
          evadeVelX: 0,
          evadeVelZ: 0,
          isEvading: false,
          baseRot: initRot,
          stationary: isStationary,
          radius: isStationary ? 0.12 : 0.8 + Math.random() * 1.6,
          speed: 0.75 + Math.random() * 1.15,
          phase: Math.random() * Math.PI * 2
        });
      }
    });
  }
  isCatapultBusy(catIdx) {
    return this.airWingUnits.some(
      (u) => u.catIndex === catIdx && (u.state === "TAXI_TO_CAT" || u.state === "PRE_LAUNCH" || u.state === "LAUNCHING")
    );
  }
  isLandingStripBusy() {
    return this.airWingUnits.some(
      (u) => u.state === "APPROACH" || u.state === "TOUCHDOWN_ROLLOUT" || u.state === "TAXI_TO_PARK"
    );
  }
  gatherDynamicDeckObstacles(excludeUnit) {
    const obs = this.deckObstacleList.map((o) => ({ x: o.x, z: o.z, r: o.radius }));
    this.mobileDeckVehicles.forEach((vehicle) => {
      obs.push({ x: vehicle.mesh.position.x, z: vehicle.mesh.position.z, r: 4 });
    });
    this.airWingUnits.forEach((other) => {
      if (other === excludeUnit) return;
      if (other.state === "PARKED" || other.state === "TAXI_TO_CAT" || other.state === "PRE_LAUNCH" || other.state === "TAXI_TO_PARK" || other.state === "TOUCHDOWN_ROLLOUT") {
        const rad = other.type === "E-2D" ? 8.5 : 6.4;
        obs.push({ x: other.mesh.position.x, z: other.mesh.position.z, r: rad });
      }
    });
    if (this.jbdCat1.targetAngle > 0.1) obs.push({ x: -7.5, z: 44, r: 5.8 });
    if (this.jbdCat2.targetAngle > 0.1) obs.push({ x: 8.5, z: 38, r: 5.8 });
    return obs;
  }
  relaxControlPointsAgainstObstacles(pts, obstacles, iterations = 16) {
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        obstacles.forEach((ob) => {
          const dx = p.x - ob.x;
          const dz = p.z - ob.z;
          const dist = Math.hypot(dx, dz);
          const minClearance = ob.r + 5.2;
          if (dist < minClearance && dist > 1e-3) {
            const push = (minClearance - dist) * 0.75;
            p.x += dx / dist * push;
            p.z += dz / dist * push;
          }
        });
        const prev = pts[i - 1];
        const next = pts[i + 1];
        const smoothWeight = i === 1 || i === pts.length - 2 ? 0.16 : 0.25;
        p.x = THREE6.MathUtils.lerp(p.x, (prev.x + next.x) * 0.5, smoothWeight);
        p.z = THREE6.MathUtils.lerp(p.z, (prev.z + next.z) * 0.5, smoothWeight);
        p.x = THREE6.MathUtils.clamp(p.x, -21, 22);
        p.z = THREE6.MathUtils.clamp(p.z, -125, 130);
      }
    }
  }
  planTaxiRouteToCatapult(unit, chosenCat) {
    const startPos = unit.mesh.position.clone();
    const startYaw = unit.mesh.rotation.y;
    const fwdDir = new THREE6.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));
    const catX = chosenCat === 1 ? -7.5 : 8.5;
    const catZ = chosenCat === 1 ? 52 : 46;
    const pullOutDist = 8.5;
    const p1 = startPos.clone().addScaledVector(fwdDir, pullOutDist);
    p1.x = THREE6.MathUtils.clamp(p1.x, -21, 22);
    const controlPts = [startPos.clone(), p1];
    const corridorX = chosenCat === 1 ? -4.2 : 2.8;
    if (p1.z < catZ - 14) {
      const zStep1 = THREE6.MathUtils.lerp(p1.z, catZ - 16, 0.35);
      const zStep2 = THREE6.MathUtils.lerp(p1.z, catZ - 16, 0.72);
      controlPts.push(new THREE6.Vector3(corridorX, 0, zStep1));
      controlPts.push(new THREE6.Vector3(corridorX, 0, zStep2));
    } else if (p1.z > catZ - 4) {
      const turnX = chosenCat === 1 ? -1.5 : 1.5;
      controlPts.push(new THREE6.Vector3(turnX, 0, Math.max(p1.z - 14, catZ - 12)));
      controlPts.push(new THREE6.Vector3(catX, 0, catZ - 15));
    }
    const leadIn = new THREE6.Vector3(catX, 0, catZ - 9.5);
    const endPos = new THREE6.Vector3(catX, 0, catZ);
    controlPts.push(leadIn, endPos);
    const obstacles = this.gatherDynamicDeckObstacles(unit);
    this.relaxControlPointsAgainstObstacles(controlPts, obstacles, 16);
    const curve = new THREE6.CatmullRomCurve3(controlPts, false, "centripetal", 0.5);
    const totalLen = curve.getLength();
    const taxiSpeed = 13.5;
    unit.taxiCurve = curve;
    unit.taxiDuration = Math.max(2.4, totalLen / taxiSpeed);
    unit.taxiTargetRot = 0;
    unit.currentYaw = startYaw;
    unit.taxiAvoidOffset = new THREE6.Vector2(0, 0);
    unit.prevTaxiPos = null;
  }
  planTaxiRouteToPark(unit) {
    const startPos = unit.mesh.position.clone();
    const startYaw = unit.mesh.rotation.y;
    const fwdDir = new THREE6.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));
    const homePos = unit.homePos.clone();
    const homeYaw = unit.homeRot;
    const homeDir = new THREE6.Vector3(Math.sin(homeYaw), 0, Math.cos(homeYaw));
    const p1 = startPos.clone().addScaledVector(fwdDir, 10);
    const controlPts = [startPos.clone(), p1];
    const streetX = homePos.x < 0 ? -5 : 4.5;
    const approachPos = homePos.clone().addScaledVector(homeDir, -9.5);
    approachPos.x = THREE6.MathUtils.clamp(approachPos.x, -21, 21);
    const midZ1 = THREE6.MathUtils.lerp(p1.z, approachPos.z, 0.35);
    const midZ2 = THREE6.MathUtils.lerp(p1.z, approachPos.z, 0.72);
    controlPts.push(new THREE6.Vector3(streetX, 0, midZ1));
    controlPts.push(new THREE6.Vector3(streetX, 0, midZ2));
    controlPts.push(approachPos, homePos);
    const obstacles = this.gatherDynamicDeckObstacles(unit);
    this.relaxControlPointsAgainstObstacles(controlPts, obstacles, 16);
    const curve = new THREE6.CatmullRomCurve3(controlPts, false, "centripetal", 0.5);
    const totalLen = curve.getLength();
    const taxiSpeed = 13.5;
    unit.taxiCurve = curve;
    unit.taxiDuration = Math.max(4.5, totalLen / taxiSpeed);
    unit.taxiTargetRot = homeYaw;
    unit.currentYaw = startYaw;
    unit.taxiAvoidOffset = new THREE6.Vector2(0, 0);
    unit.prevTaxiPos = null;
  }
  stepAircraftAlongTaxiSpline(unit, dt) {
    const m = unit.mesh;
    const dur = unit.taxiDuration || 6;
    const rawT = Math.min(unit.stateTimer / dur, 1);
    const s = rawT * rawT * (3 - 2 * rawT);
    if (unit.taxiCurve) {
      const pos = unit.taxiCurve.getPointAt(s);
      const tan = unit.taxiCurve.getTangentAt(s).normalize();
      if (!unit.taxiAvoidOffset) unit.taxiAvoidOffset = new THREE6.Vector2(0, 0);
      const obstacles = this.gatherDynamicDeckObstacles(unit);
      const myRadius = unit.type === "E-2D" ? 8.2 : 5.8;
      let targetAvoidX = 0;
      let targetAvoidZ = 0;
      const normX = -tan.z;
      const normZ = tan.x;
      const curX = pos.x + unit.taxiAvoidOffset.x;
      const curZ = pos.z + unit.taxiAvoidOffset.y;
      obstacles.forEach((ob) => {
        const dx = curX - ob.x;
        const dz = curZ - ob.z;
        const dist = Math.hypot(dx, dz);
        const safeDist = ob.r + myRadius + 1.2;
        if (dist < safeDist && dist > 1e-3) {
          const overlap = safeDist - dist;
          const pushX = dx / dist;
          const pushZ = dz / dist;
          const latSign = pushX * normX + pushZ * normZ >= 0 ? 1 : -1;
          targetAvoidX += (pushX * 0.75 + normX * latSign * 0.65) * overlap;
          targetAvoidZ += (pushZ * 0.75 + normZ * latSign * 0.65) * overlap;
        }
      });
      let blend = 1;
      if (rawT < 0.15) {
        blend = rawT / 0.15;
      } else if (rawT > 0.82) {
        blend = Math.max(0, (1 - rawT) / 0.18);
      }
      targetAvoidX *= blend;
      targetAvoidZ *= blend;
      const maxDeflect = 6;
      targetAvoidX = THREE6.MathUtils.clamp(targetAvoidX, -maxDeflect, maxDeflect);
      targetAvoidZ = THREE6.MathUtils.clamp(targetAvoidZ, -maxDeflect, maxDeflect);
      const lerpFactor = Math.min(1, dt * 4.5);
      unit.taxiAvoidOffset.x = THREE6.MathUtils.lerp(unit.taxiAvoidOffset.x, targetAvoidX, lerpFactor);
      unit.taxiAvoidOffset.y = THREE6.MathUtils.lerp(unit.taxiAvoidOffset.y, targetAvoidZ, lerpFactor);
      const finalX = THREE6.MathUtils.clamp(pos.x + unit.taxiAvoidOffset.x, -21, 22);
      const finalZ = THREE6.MathUtils.clamp(pos.z + unit.taxiAvoidOffset.y, -125, 130);
      m.position.set(finalX, pos.y, finalZ);
      let desiredYaw;
      if (rawT > 0.88) {
        const endBlend = (rawT - 0.88) / 0.12;
        const baseYaw = Math.atan2(tan.x, tan.z);
        desiredYaw = lerpYaw(baseYaw, unit.taxiTargetRot, endBlend);
      } else if (unit.prevTaxiPos) {
        const moveX = finalX - unit.prevTaxiPos.x;
        const moveZ = finalZ - unit.prevTaxiPos.z;
        const moveDist = Math.hypot(moveX, moveZ);
        if (moveDist > 0.015) {
          desiredYaw = Math.atan2(moveX, moveZ);
        } else {
          desiredYaw = Math.atan2(tan.x, tan.z);
        }
      } else {
        desiredYaw = Math.atan2(tan.x, tan.z);
      }
      if (!unit.prevTaxiPos) unit.prevTaxiPos = new THREE6.Vector3();
      unit.prevTaxiPos.set(finalX, pos.y, finalZ);
      const prevYaw = unit.currentYaw;
      unit.currentYaw = lerpYaw(unit.currentYaw, desiredYaw, Math.min(1, dt * 8.5));
      const yawRate = angleDiff(prevYaw, unit.currentYaw) / Math.max(dt, 1e-3);
      const turnRoll = THREE6.MathUtils.clamp(-yawRate * 0.018, -0.04, 0.04);
      const brakePitch = rawT > 0.85 ? Math.sin((rawT - 0.85) / 0.15 * Math.PI) * 0.018 : 0;
      m.rotation.set(brakePitch, unit.currentYaw, turnRoll);
    }
    return rawT;
  }
  commandJetLaunch(unit) {
    if (!unit || !unit.canCycleJet || unit.state !== "PARKED") return false;
    let chosenCat = unit.catIndex;
    if (this.isCatapultBusy(chosenCat)) {
      chosenCat = chosenCat === 1 ? 2 : 1;
      if (this.isCatapultBusy(chosenCat)) {
        this.log(`PRI-FLY: BOTH CATAPULTS OCCUPIED \u2014 STAND BY FOR ${unit.callsign}`);
        return false;
      }
    }
    unit.catIndex = chosenCat;
    unit.state = "TAXI_TO_CAT";
    unit.stateTimer = 0;
    this.planTaxiRouteToCatapult(unit, chosenCat);
    this.log(`${unit.callsign} (${unit.type}): TAXIING TO CAT ${chosenCat}`);
    this.notifyRoster();
    return true;
  }
  commandJetRecovery(unit) {
    if (!unit || !unit.canCycleJet || unit.state !== "AIRBORNE_PATROL") return false;
    if (this.isLandingStripBusy()) {
      this.log(`LSO: FOUL DECK \u2014 ${unit.callsign} WAVE OFF`);
      return false;
    }
    const touchdown = new THREE6.Vector3(3.5, 0, -98);
    const approachEntry = touchdown.clone().addScaledVector(
      new THREE6.Vector3(RUNWAY_DIR.x, 0, RUNWAY_DIR.y),
      -215
    );
    approachEntry.y = 32;
    unit.approachStartPosition = unit.mesh.position.clone();
    unit.approachStartRotation = unit.mesh.rotation.clone();
    unit.approachJoinDuration = Math.max(2.5, unit.mesh.position.distanceTo(approachEntry) / 85);
    unit.state = "APPROACH";
    unit.stateTimer = 0;
    this.log(`LSO: "${unit.callsign} ON FINAL GLIDE SLOPE \u2014 CALLING THE BALL"`);
    this.notifyRoster();
    return true;
  }
  commandHeliSortie(unit) {
    if (!unit || unit.type !== "MH-60S") return false;
    if (unit.state === "PARKED") {
      unit.liftoffStartY = unit.mesh.position.y;
      unit.state = "LIFTOFF";
      unit.stateTimer = 0;
      this.log(`${unit.callsign}: LIFTING OFF FOR PATROL ORBIT`);
      this.notifyRoster();
      return true;
    } else if (unit.state === "PATROL_ORBIT") {
      unit.heliReturnStartPosition = unit.mesh.position.clone();
      unit.heliReturnStartRotation = unit.mesh.rotation.clone();
      unit.heliReturnDuration = Math.max(4, unit.mesh.position.distanceTo(unit.homePos) / 14);
      unit.state = "RETURN_APPROACH";
      unit.stateTimer = 0;
      this.log(`${unit.callsign}: RETURNING TO FLIGHT DECK`);
      this.notifyRoster();
      return true;
    }
    return false;
  }
  updateVehicles(dt, hazards) {
    const stepTime = Math.min(dt, 0.05);
    this.mobileDeckVehicles.forEach((vehicle) => {
      let waypoint = vehicle.route[vehicle.routeIndex];
      let toX = waypoint.x - vehicle.mesh.position.x;
      let toZ = waypoint.z - vehicle.mesh.position.z;
      let goalDistance = Math.hypot(toX, toZ);
      if (goalDistance < 1.8) {
        vehicle.routeIndex = (vehicle.routeIndex + 1) % vehicle.route.length;
        waypoint = vehicle.route[vehicle.routeIndex];
        toX = waypoint.x - vehicle.mesh.position.x;
        toZ = waypoint.z - vehicle.mesh.position.z;
        goalDistance = Math.hypot(toX, toZ);
      }
      let avoidX = 0;
      let avoidZ = 0;
      let yieldToAircraft = false;
      hazards.forEach((hazard) => {
        const dx = vehicle.mesh.position.x - hazard.x;
        const dz = vehicle.mesh.position.z - hazard.z;
        const distance = Math.hypot(dx, dz);
        const clearance = hazard.radius + 3.5;
        if (distance >= clearance) return;
        if (hazard.urgent && distance < hazard.radius + 5) yieldToAircraft = true;
        const strength = (clearance - distance) / clearance;
        const awayX = distance > 1e-3 ? dx / distance : vehicle.routeIndex % 2 ? 1 : -1;
        const awayZ = distance > 1e-3 ? dz / distance : 0;
        avoidX += awayX * strength;
        avoidZ += awayZ * strength;
      });
      this.deckObstacleList.forEach((obstacle) => {
        const dx = vehicle.mesh.position.x - obstacle.x;
        const dz = vehicle.mesh.position.z - obstacle.z;
        const distance = Math.hypot(dx, dz);
        const clearance = obstacle.radius + 3.2;
        if (distance >= clearance || distance < 1e-3) return;
        const strength = (clearance - distance) / clearance;
        avoidX += dx / distance * strength;
        avoidZ += dz / distance * strength;
      });
      this.mobileDeckVehicles.forEach((other) => {
        if (other === vehicle) return;
        const dx = vehicle.mesh.position.x - other.mesh.position.x;
        const dz = vehicle.mesh.position.z - other.mesh.position.z;
        const distance = Math.hypot(dx, dz);
        const clearance = 6;
        if (distance >= clearance || distance < 1e-3) return;
        const strength = (clearance - distance) / clearance;
        avoidX += dx / distance * strength;
        avoidZ += dz / distance * strength;
      });
      if (yieldToAircraft || goalDistance < 1e-3) return;
      const steerX = toX / goalDistance + avoidX * 2.4;
      const steerZ = toZ / goalDistance + avoidZ * 2.4;
      const steerLength = Math.hypot(steerX, steerZ);
      if (steerLength < 1e-3) return;
      const desiredYaw = Math.atan2(steerX, steerZ);
      const turnBlend = 1 - Math.exp(-4 * stepTime);
      vehicle.mesh.rotation.y = lerpYaw(vehicle.mesh.rotation.y, desiredYaw, turnBlend);
      const yawError = Math.abs(angleDiff(vehicle.mesh.rotation.y, desiredYaw));
      const driveFactor = Math.max(0.18, Math.cos(yawError));
      const driveDistance = vehicle.speed * driveFactor * stepTime;
      const moveX = Math.sin(vehicle.mesh.rotation.y) * driveDistance;
      const moveZ = Math.cos(vehicle.mesh.rotation.y) * driveDistance;
      vehicle.mesh.position.x += moveX;
      vehicle.mesh.position.z += moveZ;
    });
  }
  updateCrew(dt, elapsed, hazards) {
    const clampOutOfRunwayZone = (pos, minClearance = 12.2) => {
      const rAx = -4.5, rAz = -152;
      const rBx = 36.5, rBz = 42;
      const rDx = rBx - rAx, rDz = rBz - rAz;
      const rLenSq = rDx * rDx + rDz * rDz;
      const tRunway = THREE6.MathUtils.clamp(((pos.x - rAx) * rDx + (pos.z - rAz) * rDz) / rLenSq, 0, 1);
      const closeRx = rAx + tRunway * rDx;
      const closeRz = rAz + tRunway * rDz;
      const dx = pos.x - closeRx;
      const dz = pos.z - closeRz;
      const dist = Math.hypot(dx, dz);
      if (dist < minClearance) {
        const pushDirX = dx < 2 ? -1 : 1;
        const nx = dist > 1e-3 ? dx / dist : pushDirX;
        const nz = dist > 1e-3 ? dz / dist : 0;
        pos.x = closeRx + nx * minClearance;
        pos.z = closeRz + nz * minClearance;
      }
      pos.x = THREE6.MathUtils.clamp(pos.x, -33, 34);
      pos.z = THREE6.MathUtils.clamp(pos.z, -142, 145);
    };
    this.deckCrewList.forEach((c) => {
      const a = elapsed * c.speed + c.phase;
      const limbs = c.mesh.userData.limbs;
      const patrolX = c.stationary ? c.baseX : c.baseX + Math.cos(a) * c.radius;
      const patrolZ = c.stationary ? c.baseZ : c.baseZ + Math.sin(a) * c.radius;
      let curX = patrolX + c.evadeOffsetX;
      let curZ = patrolZ + c.evadeOffsetZ;
      let fleeDirX = 0;
      let fleeDirZ = 0;
      let maxUrgency = 0;
      for (let h = 0; h < hazards.length; h++) {
        const haz = hazards[h];
        const dx = curX - haz.x;
        const dz = curZ - haz.z;
        const dist = Math.hypot(dx, dz);
        if (dist < haz.radius && dist > 1e-4) {
          const urgency = (1 - dist / haz.radius) * (haz.urgent ? 1.8 : 0.7);
          if (haz.urgent) maxUrgency = Math.max(maxUrgency, urgency);
          const latX = haz.fwdZ;
          const latZ = -haz.fwdX;
          const sideDot = dx * latX + dz * latZ;
          const sideSign = sideDot >= 0 ? 1 : -1;
          const radialX = dx / dist;
          const radialZ = dz / dist;
          fleeDirX += (radialX * 0.55 + latX * sideSign * 0.85) * urgency;
          fleeDirZ += (radialZ * 0.55 + latZ * sideSign * 0.85) * urgency;
        }
      }
      const fleeMag = Math.hypot(fleeDirX, fleeDirZ);
      if (fleeMag > 0.01 && maxUrgency > 0.02) {
        const runSpeed = 9.5 + Math.min(maxUrgency * 6, 6.5);
        const targetVx = fleeDirX / fleeMag * runSpeed;
        const targetVz = fleeDirZ / fleeMag * runSpeed;
        c.evadeVelX = THREE6.MathUtils.lerp(c.evadeVelX, targetVx, Math.min(1, dt * 12));
        c.evadeVelZ = THREE6.MathUtils.lerp(c.evadeVelZ, targetVz, Math.min(1, dt * 12));
        c.evadeOffsetX += c.evadeVelX * dt;
        c.evadeOffsetZ += c.evadeVelZ * dt;
        c.isEvading = true;
      } else {
        const offsetDist = Math.hypot(c.evadeOffsetX, c.evadeOffsetZ);
        if (offsetDist > 0.15) {
          const returnSpeed = 3.6;
          const rVx = -c.evadeOffsetX / offsetDist * Math.min(returnSpeed, offsetDist * 3);
          const rVz = -c.evadeOffsetZ / offsetDist * Math.min(returnSpeed, offsetDist * 3);
          c.evadeVelX = THREE6.MathUtils.lerp(c.evadeVelX, rVx, Math.min(1, dt * 6));
          c.evadeVelZ = THREE6.MathUtils.lerp(c.evadeVelZ, rVz, Math.min(1, dt * 6));
          c.evadeOffsetX += c.evadeVelX * dt;
          c.evadeOffsetZ += c.evadeVelZ * dt;
          c.isEvading = offsetDist > 0.6;
        } else {
          c.evadeOffsetX = THREE6.MathUtils.lerp(c.evadeOffsetX, 0, Math.min(1, dt * 5));
          c.evadeOffsetZ = THREE6.MathUtils.lerp(c.evadeOffsetZ, 0, Math.min(1, dt * 5));
          c.evadeVelX *= 0.8;
          c.evadeVelZ *= 0.8;
          c.isEvading = false;
        }
      }
      const finalPt = { x: patrolX + c.evadeOffsetX, z: patrolZ + c.evadeOffsetZ };
      clampOutOfRunwayZone(finalPt, 12.2);
      c.evadeOffsetX = finalPt.x - patrolX;
      c.evadeOffsetZ = finalPt.z - patrolZ;
      const prevX = c.mesh.position.x;
      const prevZ = c.mesh.position.z;
      c.mesh.position.set(finalPt.x, 0, finalPt.z);
      const moveDx = finalPt.x - prevX;
      const moveDz = finalPt.z - prevZ;
      const moveSpeed = Math.hypot(moveDx, moveDz) / Math.max(dt, 1e-3);
      if (c.isEvading && moveSpeed > 0.8) {
        const runHeading = Math.atan2(moveDx, moveDz);
        c.mesh.rotation.y = lerpYaw(c.mesh.rotation.y, runHeading, Math.min(1, dt * 14));
        if (limbs) {
          const sprintCycle = Math.sin(elapsed * 18 + c.phase) * 0.95;
          limbs.leftLeg.rotation.x = sprintCycle;
          limbs.rightLeg.rotation.x = -sprintCycle;
          limbs.leftArm.rotation.x = -sprintCycle * 1.1;
          limbs.rightArm.rotation.x = sprintCycle * 1.1;
          limbs.leftArm.rotation.z = -0.15;
          limbs.rightArm.rotation.z = 0.15;
        }
      } else if (c.stationary) {
        c.mesh.rotation.y = c.baseRot + Math.sin(a * 0.7) * 0.25;
        if (limbs) {
          limbs.leftLeg.rotation.x = 0;
          limbs.rightLeg.rotation.x = 0;
          if (limbs.pose === "MARSHAL") {
            limbs.leftArm.rotation.x = -2.35 + Math.sin(elapsed * 4.5 + c.phase) * 0.45;
            limbs.rightArm.rotation.x = -2.35 + Math.cos(elapsed * 4.5 + c.phase) * 0.45;
            limbs.leftArm.rotation.z = -0.35 + Math.sin(elapsed * 4.5) * 0.25;
            limbs.rightArm.rotation.z = 0.35 - Math.sin(elapsed * 4.5) * 0.25;
          } else {
            limbs.leftArm.rotation.x = -0.45;
            limbs.rightArm.rotation.x = -0.65 + Math.sin(elapsed * 2.5 + c.phase) * 0.15;
          }
        }
      } else {
        const dx = -Math.sin(a) * c.radius + c.evadeVelX * 0.2;
        const dz = Math.cos(a) * c.radius + c.evadeVelZ * 0.2;
        c.mesh.rotation.y = Math.atan2(dx, dz);
        if (limbs) {
          const stride = Math.sin(elapsed * c.speed * 5.2 + c.phase) * 0.52;
          limbs.leftLeg.rotation.x = stride;
          limbs.rightLeg.rotation.x = -stride;
          limbs.leftArm.rotation.x = -stride * 0.75;
          limbs.rightArm.rotation.x = limbs.pose === "CARRY" ? -0.45 : stride * 0.75;
        }
      }
    });
  }
  update(dt, elapsed, spawnParticle2) {
    this.autoOpsTimer += dt;
    if (this.autoOpsTimer > 9) {
      this.autoOpsTimer = 0;
      if (!this.isCatapultBusy(1) && !this.isCatapultBusy(2)) {
        const parkedJets = this.airWingUnits.filter((u) => u.canCycleJet && u.state === "PARKED" && u.id.startsWith("mid-jet"));
        if (parkedJets.length > 0) {
          const pick = parkedJets[Math.floor(Math.random() * parkedJets.length)];
          this.commandJetLaunch(pick);
        }
      }
      if (!this.isLandingStripBusy()) {
        const readyToLand = this.airWingUnits.find((u) => u.state === "AIRBORNE_PATROL" && u.patrolLaps >= 1);
        if (readyToLand) this.commandJetRecovery(readyToLand);
      }
    }
    this.jbdCat1.targetAngle = 0;
    this.jbdCat2.targetAngle = 0;
    const wPos = this.arrestingWireLine.geometry.attributes.position;
    let wireStretched = false;
    const activeDeckHazards = [];
    this.airWingUnits.forEach((u) => {
      u.stateTimer += dt;
      const m = u.mesh;
      if (u.canCycleJet) {
        const isCat1 = u.catIndex === 1;
        const catStartX = isCat1 ? -7.5 : 8.5;
        const catEndX = isCat1 ? -6.5 : 7.5;
        const catStartZ = isCat1 ? 52 : 46;
        const catEndZ = 148;
        if (u.state === "PARKED") {
          m.position.copy(u.homePos);
          m.rotation.set(0, u.homeRot, 0);
          u.currentYaw = u.homeRot;
          if (u.chocks) u.chocks.visible = true;
          if (m.userData.gearGroup) m.userData.gearGroup.visible = true;
          if (m.userData.afterburners) m.userData.afterburners.forEach((ab) => ab.visible = false);
          setWingFoldRatio(m, u.homeFolded ? 1 : 0);
        } else if (u.state === "TAXI_TO_CAT") {
          if (u.chocks) u.chocks.visible = false;
          const t = this.stepAircraftAlongTaxiSpline(u, dt);
          if (u.homeFolded) {
            setWingFoldRatio(m, Math.max(0, 1 - t * 2));
          } else {
            setWingFoldRatio(m, 0);
          }
          if (t >= 1) {
            u.state = "PRE_LAUNCH";
            u.stateTimer = 0;
            m.position.set(catStartX, 0, catStartZ);
            m.rotation.set(0, 0, 0);
            this.log(`CAT ${u.catIndex}: ${u.callsign} LOCKED IN SHUTTLE`);
            this.notifyRoster();
          }
        } else if (u.state === "PRE_LAUNCH") {
          if (isCat1) this.jbdCat1.targetAngle = 0.82;
          else this.jbdCat2.targetAngle = 0.82;
          m.position.set(catStartX, 0, catStartZ);
          m.rotation.set(0.025, 0, 0);
          setWingFoldRatio(m, 0);
          if (u.stateTimer > 0.45 && m.userData.afterburners) {
            m.userData.afterburners.forEach((ab) => {
              ab.visible = true;
              ab.scale.z = 0.85 + Math.sin(u.stateTimer * 45) * 0.22;
            });
            if (spawnParticle2 && Math.random() < 0.55) {
              spawnParticle2(
                new THREE6.Vector3(catStartX + (Math.random() - 0.5), DECK_Y + 0.8, catStartZ - 5.5),
                new THREE6.Vector3((Math.random() - 0.5) * 4, 2.5 + Math.random() * 3, -10),
                0.4,
                2.1,
                0.6,
                14870768,
                0.35
              );
            }
          }
          if (u.stateTimer >= 2.2) {
            u.state = "LAUNCHING";
            u.stateTimer = 0;
            this.log(`CAT ${u.catIndex} LAUNCH! ${u.callsign} AIRBORNE`);
            this.notifyRoster();
          }
        } else if (u.state === "LAUNCHING") {
          const strokeDur = 1.45;
          if (u.stateTimer <= strokeDur) {
            if (isCat1) this.jbdCat1.targetAngle = 0.82;
            else this.jbdCat2.targetAngle = 0.82;
            const t = u.stateTimer / strokeDur;
            const accel = t * t;
            const cx = THREE6.MathUtils.lerp(catStartX, catEndX, accel);
            const cz = THREE6.MathUtils.lerp(catStartZ, catEndZ, accel);
            m.position.set(cx, 0, cz);
            m.rotation.set(t > 0.82 ? -0.14 : 0, 0, 0);
            if (spawnParticle2) {
              spawnParticle2(
                new THREE6.Vector3(cx, DECK_Y + 0.25, cz - 3),
                new THREE6.Vector3((Math.random() - 0.5) * 1.5, 0.8 + Math.random(), -6),
                0.35,
                1.8,
                0.75,
                16317180,
                0.38
              );
            }
          } else {
            const climbT = (u.stateTimer - strokeDur) / 3;
            if (climbT > 0.25 && m.userData.gearGroup) m.userData.gearGroup.visible = false;
            const cz = catEndZ + climbT * 135;
            const cy = Math.pow(climbT, 1.35) * 38;
            const turnDir = isCat1 ? -1 : 1;
            const cx = catEndX + turnDir * Math.pow(climbT, 1.8) * 55;
            m.position.set(cx, cy, cz);
            m.rotation.set(-0.22 * (1 - climbT * 0.5), turnDir * climbT * 0.85, -turnDir * 0.42);
            if (climbT >= 1) {
              u.state = "AIRBORNE_PATROL";
              u.stateTimer = 0;
              u.patrolLaps = 0;
              u.patrolAngle = Math.atan2(m.position.x / 145, m.position.z / 245);
              u.patrolTransitionStartPosition = m.position.clone();
              u.patrolTransitionStartRotation = m.rotation.clone();
              u.patrolTransitionTimer = 0;
              if (m.userData.afterburners) m.userData.afterburners.forEach((ab) => ab.visible = false);
              this.notifyRoster();
            }
          }
        } else if (u.state === "AIRBORNE_PATROL") {
          const angularSpeed = 0.42;
          const prevAngle = u.patrolAngle;
          u.patrolAngle += angularSpeed * dt;
          if (Math.floor(u.patrolAngle / (Math.PI * 2)) > Math.floor(prevAngle / (Math.PI * 2))) {
            u.patrolLaps++;
          }
          const rx = 145;
          const rz = 245;
          const px = Math.sin(u.patrolAngle) * rx;
          const pz = Math.cos(u.patrolAngle) * rz;
          const py = 42 + Math.sin(u.patrolAngle * 2) * 4;
          const dx = Math.cos(u.patrolAngle) * rx;
          const dz = -Math.sin(u.patrolAngle) * rz;
          const heading = Math.atan2(dx, dz);
          if (u.patrolTransitionStartPosition) {
            u.patrolTransitionTimer = Math.min(u.patrolTransitionTimer + dt, 2.5);
            const transitionProgress = u.patrolTransitionTimer / 2.5;
            const easedProgress = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
            m.position.lerpVectors(u.patrolTransitionStartPosition, new THREE6.Vector3(px, py, pz), easedProgress);
            m.rotation.x = THREE6.MathUtils.lerp(u.patrolTransitionStartRotation.x, 0.03, easedProgress);
            m.rotation.y = lerpYaw(u.patrolTransitionStartRotation.y, heading, easedProgress);
            m.rotation.z = THREE6.MathUtils.lerp(u.patrolTransitionStartRotation.z, 0.28, easedProgress);
            if (transitionProgress >= 1) u.patrolTransitionStartPosition = null;
          } else {
            m.position.set(px, py, pz);
            m.rotation.set(0.03, heading, 0.28);
          }
        } else if (u.state === "APPROACH") {
          if (m.userData.gearGroup) m.userData.gearGroup.visible = true;
          const touchdown = new THREE6.Vector3(3.5, 0, -98);
          const approachEntry = touchdown.clone().addScaledVector(
            new THREE6.Vector3(RUNWAY_DIR.x, 0, RUNWAY_DIR.y),
            -215
          );
          approachEntry.y = 32;
          const joinDur = u.approachJoinDuration || 3;
          if (u.stateTimer <= joinDur) {
            const t = u.stateTimer / joinDur;
            const s = t * t * (3 - 2 * t);
            m.position.lerpVectors(u.approachStartPosition, approachEntry, s);
            m.rotation.y = lerpYaw(u.approachStartRotation.y, RUNWAY_YAW, s);
            m.rotation.x = THREE6.MathUtils.lerp(u.approachStartRotation.x, 0.07, s);
            m.rotation.z = THREE6.MathUtils.lerp(u.approachStartRotation.z, 0, s);
          } else {
            const slopeDur = 4.8;
            const tSlope = Math.min((u.stateTimer - joinDur) / slopeDur, 1);
            m.position.lerpVectors(approachEntry, touchdown, tSlope);
            m.rotation.set(0.07, RUNWAY_YAW, 0);
            if (tSlope >= 1) {
              u.state = "TOUCHDOWN_ROLLOUT";
              u.stateTimer = 0;
              this.log(`TRAP! ${u.callsign} CAUGHT 3-WIRE OK`);
              this.notifyRoster();
            }
          }
        } else if (u.state === "TOUCHDOWN_ROLLOUT") {
          const dur = 1.75;
          const t = Math.min(u.stateTimer / dur, 1);
          const decel = 1 - Math.pow(1 - t, 2.6);
          const runDist = decel * 74;
          const touchX = 3.5;
          const touchZ = -98;
          const jx = touchX + RUNWAY_DIR.x * runDist;
          const jz = touchZ + RUNWAY_DIR.y * runDist;
          m.position.set(jx, 0, jz);
          m.rotation.set(Math.sin(t * Math.PI) * 0.055, RUNWAY_YAW, 0);
          wireStretched = true;
          wPos.setXYZ(1, jx - RUNWAY_DIR.x * 4.2, 0.2, jz - RUNWAY_DIR.y * 4.2);
          wPos.needsUpdate = true;
          if (t >= 1) {
            u.state = "TAXI_TO_PARK";
            u.stateTimer = 0;
            this.planTaxiRouteToPark(u);
            this.log(`${u.callsign}: TAXIING BACK TO HOME SPOT & FOLDING WINGS`);
            this.notifyRoster();
          }
        } else if (u.state === "TAXI_TO_PARK") {
          const t = this.stepAircraftAlongTaxiSpline(u, dt);
          if (u.homeFolded) {
            setWingFoldRatio(m, Math.max(0, (t - 0.35) / 0.65));
          }
          if (t >= 1) {
            u.state = "PARKED";
            u.stateTimer = 0;
            m.position.copy(u.homePos);
            m.rotation.set(0, u.homeRot, 0);
            setWingFoldRatio(m, u.homeFolded ? 1 : 0);
            this.log(`${u.callsign}: SECURED AT HOME POSITION`);
            this.notifyRoster();
          }
        }
        if (u.state === "TAXI_TO_CAT" || u.state === "TAXI_TO_PARK" || u.state === "TOUCHDOWN_ROLLOUT" || u.state === "PRE_LAUNCH") {
          const fwdX = Math.sin(m.rotation.y);
          const fwdZ = Math.cos(m.rotation.y);
          activeDeckHazards.push({
            x: m.position.x + fwdX * 3.5,
            z: m.position.z + fwdZ * 3.5,
            fwdX,
            fwdZ,
            radius: 11.5,
            urgent: true
          });
        }
      } else if (u.type === "MH-60S") {
        if (m.userData.rotorEntry) {
          const targetRotorSpeed = u.state === "PARKED" ? 2.5 : 24;
          m.userData.rotorEntry.speed = THREE6.MathUtils.lerp(m.userData.rotorEntry.speed, targetRotorSpeed, dt * 1.5);
        }
        if (u.state === "PARKED") {
          m.position.copy(u.homePos);
          m.rotation.set(0, u.homeRot, 0);
          if (u.chocks) u.chocks.visible = true;
        } else if (u.state === "LIFTOFF") {
          if (u.chocks) u.chocks.visible = false;
          const dur = 2.8;
          const progress = Math.min(u.stateTimer / dur, 1);
          const easedProgress = progress * progress * (3 - 2 * progress);
          m.position.y = THREE6.MathUtils.lerp(u.liftoffStartY || 0, 24, easedProgress);
          m.rotation.y += dt * 0.45;
          m.rotation.x = Math.sin(progress * Math.PI) * 0.08;
          if (progress >= 1) {
            u.state = "PATROL_ORBIT";
            u.stateTimer = 0;
            this.notifyRoster();
          }
        } else if (u.state === "PATROL_ORBIT") {
          const a = u.stateTimer * 0.45;
          const orbitProgress = Math.min(u.stateTimer / 3, 1);
          const orbitRadius = 45 * orbitProgress * orbitProgress * (3 - 2 * orbitProgress);
          m.position.x = u.homePos.x + Math.sin(a) * orbitRadius;
          m.position.z = u.homePos.z + Math.cos(a) * orbitRadius;
          m.position.y = 24 + Math.sin(a * 2) * 2.8 * orbitProgress;
          m.rotation.y = lerpYaw(m.rotation.y, a + Math.PI / 2, 1 - Math.exp(-2.5 * dt));
          m.rotation.z = -0.12 * Math.sin(a);
        } else if (u.state === "RETURN_APPROACH") {
          const duration = u.heliReturnDuration || 4.5;
          const progress = Math.min(u.stateTimer / duration, 1);
          const easedProgress = progress * progress * (3 - 2 * progress);
          m.position.lerpVectors(u.heliReturnStartPosition, u.homePos, easedProgress);
          m.rotation.x = THREE6.MathUtils.lerp(u.heliReturnStartRotation.x, 0, easedProgress);
          m.rotation.y = lerpYaw(u.heliReturnStartRotation.y, u.homeRot, easedProgress);
          m.rotation.z = THREE6.MathUtils.lerp(u.heliReturnStartRotation.z, 0, easedProgress);
          if (progress >= 1) {
            u.state = "PARKED";
            u.stateTimer = 0;
            m.position.copy(u.homePos);
            m.rotation.set(0, u.homeRot, 0);
            if (u.chocks) u.chocks.visible = true;
            this.log(`${u.callsign}: SAFELY TOUCHED DOWN & SECURED`);
            this.notifyRoster();
          }
        }
      }
    });
    if (!wireStretched) {
      wPos.setXYZ(1, 3.5, 0.14, -98);
      wPos.needsUpdate = true;
    }
    spinningPropsAndDomes.forEach((sp) => {
      if (sp.axis === "z") sp.mesh.rotation.z += sp.speed * dt;
      else sp.mesh.rotation.y += sp.speed * dt;
    });
    allHeliRotors.forEach((hr) => {
      hr.mainRotor.rotation.y += hr.speed * dt;
      hr.tailRotor.rotation.x += hr.speed * dt * 1.5;
    });
    this.updateVehicles(dt, activeDeckHazards);
    this.updateCrew(dt, elapsed, activeDeckHazards);
  }
};

// ../game/GameHub/games/USSFord/js/selection.js
import * as THREE7 from "three";
function createSelectionBracket(deckAssetsGroup) {
  const selectionBracket = new THREE7.Group();
  selectionBracket.userData = {
    pulseTimer: 0,
    deckGroup: null,
    targetRing: null,
    overheadBeacon: null
  };
  const deckSelGroup = new THREE7.Group();
  deckSelGroup.position.y = 0.22;
  selectionBracket.add(deckSelGroup);
  selectionBracket.userData.deckGroup = deckSelGroup;
  const greenBracketMat = new THREE7.MeshBasicMaterial({
    color: 65348,
    transparent: true,
    opacity: 0.98,
    side: THREE7.DoubleSide,
    depthWrite: false
  });
  const greenGlowMat = new THREE7.MeshBasicMaterial({
    color: 65365,
    transparent: true,
    opacity: 0.28,
    side: THREE7.DoubleSide,
    depthWrite: false
  });
  const innerDiscGeo = new THREE7.RingGeometry(0.2, 6.5, 48);
  innerDiscGeo.rotateX(-Math.PI / 2);
  deckSelGroup.add(new THREE7.Mesh(innerDiscGeo, greenGlowMat));
  const ringGroup = new THREE7.Group();
  const mainRingGeo = new THREE7.RingGeometry(6, 7.2, 48);
  mainRingGeo.rotateX(-Math.PI / 2);
  ringGroup.add(new THREE7.Mesh(mainRingGeo, greenBracketMat));
  [
    { x: 0, z: 8, w: 0.7, l: 2 },
    { x: 0, z: -8, w: 0.7, l: 2 },
    { x: 8, z: 0, w: 2, l: 0.7 },
    { x: -8, z: 0, w: 2, l: 0.7 }
  ].forEach((tk) => {
    const tickGeo = new THREE7.PlaneGeometry(tk.w, tk.l);
    tickGeo.rotateX(-Math.PI / 2);
    const tm = new THREE7.Mesh(tickGeo, greenBracketMat);
    tm.position.set(tk.x, 0.01, tk.z);
    ringGroup.add(tm);
  });
  deckSelGroup.add(ringGroup);
  selectionBracket.userData.targetRing = ringGroup;
  const bSizeX = 7.4;
  const bSizeZ = 9;
  const armLen = 3.6;
  const armWidth = 0.75;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
    const armZGeo = new THREE7.PlaneGeometry(armWidth, armLen);
    armZGeo.rotateX(-Math.PI / 2);
    const meshZ = new THREE7.Mesh(armZGeo, greenBracketMat);
    meshZ.position.set(sx * bSizeX, 0.02, sz * (bSizeZ - armLen * 0.5));
    deckSelGroup.add(meshZ);
    const armXGeo = new THREE7.PlaneGeometry(armLen, armWidth);
    armXGeo.rotateX(-Math.PI / 2);
    const meshX = new THREE7.Mesh(armXGeo, greenBracketMat);
    meshX.position.set(sx * (bSizeX - armLen * 0.5), 0.02, sz * bSizeZ);
    deckSelGroup.add(meshX);
  });
  const chevronGeo = new THREE7.ConeGeometry(1.2, 2.2, 3);
  chevronGeo.rotateX(-Math.PI / 2);
  const chevronMesh = new THREE7.Mesh(chevronGeo, greenBracketMat);
  chevronMesh.position.set(0, 0.03, 9.8);
  deckSelGroup.add(chevronMesh);
  const overheadBeacon = new THREE7.Group();
  overheadBeacon.position.y = 6.8;
  const beaconGeo = new THREE7.OctahedronGeometry(1.6, 0);
  const beaconMesh = new THREE7.Mesh(beaconGeo, new THREE7.MeshBasicMaterial({
    color: 65348,
    transparent: true,
    opacity: 0.95
  }));
  overheadBeacon.add(beaconMesh);
  const haloGeo = new THREE7.RingGeometry(2, 2.6, 32);
  haloGeo.rotateX(-Math.PI / 2);
  const haloMesh = new THREE7.Mesh(haloGeo, greenBracketMat);
  overheadBeacon.add(haloMesh);
  const beamGeo = new THREE7.CylinderGeometry(0.12, 0.12, 6, 8);
  const beamMat = new THREE7.MeshBasicMaterial({
    color: 65382,
    transparent: true,
    opacity: 0.65
  });
  const beamMesh = new THREE7.Mesh(beamGeo, beamMat);
  beamMesh.position.y = -3;
  overheadBeacon.add(beamMesh);
  selectionBracket.add(overheadBeacon);
  selectionBracket.userData.overheadBeacon = overheadBeacon;
  selectionBracket.visible = false;
  deckAssetsGroup.add(selectionBracket);
  return selectionBracket;
}
var SelectionManager = class {
  constructor(scene2, camera2, renderer2, deckAssetsGroup, onSelectionChanged) {
    this.camera = camera2;
    this.renderer = renderer2;
    this.airWingUnits = [];
    this.selectedUnit = null;
    this.followUnit = null;
    this.onSelectionChanged = onSelectionChanged;
    this.selectionBracket = createSelectionBracket(deckAssetsGroup);
    this.raycaster = new THREE7.Raycaster();
    this.pointer = new THREE7.Vector2();
    this.downPos = { x: 0, y: 0 };
    this.initEvents();
  }
  setUnits(units) {
    this.airWingUnits = units;
  }
  selectUnit(unit) {
    this.selectedUnit = unit;
    if (!unit) {
      this.followUnit = null;
      this.selectionBracket.visible = false;
    }
    if (this.onSelectionChanged) {
      this.onSelectionChanged(this.selectedUnit);
    }
  }
  toggleFollow(unit) {
    if (!unit) {
      this.followUnit = null;
      return false;
    }
    if (this.followUnit === unit) {
      this.followUnit = null;
      return false;
    } else {
      this.followUnit = unit;
      return true;
    }
  }
  initEvents() {
    this.renderer.domElement.addEventListener("pointerdown", (e) => {
      this.downPos = { x: e.clientX, y: e.clientY };
    });
    this.renderer.domElement.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > 6) return;
      this.pointer.x = e.clientX / window.innerWidth * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const meshes = this.airWingUnits.map((u) => u.mesh);
      const hits = this.raycaster.intersectObjects(meshes, true);
      let pickedUnit = null;
      if (hits.length > 0) {
        let obj = hits[0].object;
        while (obj && !obj.userData.unit) obj = obj.parent;
        if (obj && obj.userData.unit) pickedUnit = obj.userData.unit;
      }
      this.selectUnit(pickedUnit);
    });
  }
  update(dt) {
    if (this.selectedUnit) {
      this.selectionBracket.position.copy(this.selectedUnit.mesh.position);
      this.selectionBracket.rotation.y = this.selectedUnit.mesh.rotation.y;
      this.selectionBracket.visible = true;
      this.selectionBracket.userData.pulseTimer = (this.selectionBracket.userData.pulseTimer || 0) + dt;
      const pt = this.selectionBracket.userData.pulseTimer;
      if (this.selectionBracket.userData.targetRing) {
        this.selectionBracket.userData.targetRing.rotation.y += dt * 0.75;
      }
      if (this.selectionBracket.userData.overheadBeacon) {
        this.selectionBracket.userData.overheadBeacon.rotation.y += dt * 1.6;
        const baseBeaconY = this.selectedUnit.type === "E-2D" ? 7.2 : 5.4;
        this.selectionBracket.userData.overheadBeacon.position.y = baseBeaconY + Math.sin(pt * 3.5) * 0.35;
      }
      if (this.selectionBracket.userData.deckGroup) {
        const pulseScale = 1 + Math.sin(pt * 4) * 0.035;
        this.selectionBracket.userData.deckGroup.scale.set(pulseScale, 1, pulseScale);
      }
    } else {
      this.selectionBracket.visible = false;
    }
  }
};

// ../game/GameHub/games/USSFord/js/ui.js
var UIManager = class {
  constructor() {
    this.statusLogEl = document.getElementById("ops-status-log");
    this.rosterListEl = document.getElementById("roster-list");
    this.rosterSummaryEl = document.getElementById("roster-summary");
    this.selCallsignEl = document.getElementById("sel-callsign");
    this.selTypeEl = document.getElementById("sel-type");
    this.selStateEl = document.getElementById("sel-state");
    this.btnUnitAction = document.getElementById("btn-unit-action");
    this.btnUnitFollow = document.getElementById("btn-unit-follow");
    this.btnLaunch = document.getElementById("btn-launch");
    this.btnRecover = document.getElementById("btn-recover");
    this.btnHeli = document.getElementById("btn-heli");
    this.btnToggleRoster = document.getElementById("btn-toggle-roster");
    this.btnToggleHud = document.getElementById("btn-toggle-hud");
    this.hudRoster = document.getElementById("hud-roster");
    this.hudBottom = document.getElementById("hud-bottom");
    this.hudLogPill = document.getElementById("hud-log-pill");
    this.rosterVisible = true;
    this.hudVisible = true;
    this.initToggles();
  }
  setStatusLog(text) {
    if (this.statusLogEl) {
      this.statusLogEl.textContent = text;
    }
  }
  initToggles() {
    if (this.btnToggleRoster && this.hudRoster) {
      this.btnToggleRoster.addEventListener("click", () => {
        this.rosterVisible = !this.rosterVisible;
        this.hudRoster.style.display = this.rosterVisible ? "flex" : "none";
        this.btnToggleRoster.classList.toggle("hud-btn-active", this.rosterVisible);
      });
    }
    if (this.btnToggleHud) {
      this.btnToggleHud.addEventListener("click", () => {
        this.hudVisible = !this.hudVisible;
        if (this.hudBottom) this.hudBottom.style.display = this.hudVisible ? "block" : "none";
        if (this.hudLogPill) this.hudLogPill.style.display = this.hudVisible ? "flex" : "none";
        if (this.hudRoster) this.hudRoster.style.display = this.hudVisible && this.rosterVisible ? "flex" : "none";
      });
    }
  }
  renderRosterUI(airWingUnits, selectedUnit, followUnit, onSelectUnit) {
    if (!this.rosterListEl) return;
    this.rosterListEl.innerHTML = "";
    let countParked = 0;
    let countAirborne = 0;
    airWingUnits.forEach((u) => {
      if (u.state === "PARKED") countParked++;
      else countAirborne++;
      const item = document.createElement("div");
      const isSelected = u === selectedUnit;
      item.className = `flex items-center justify-between p-2 rounded cursor-pointer transition-all ${isSelected ? "bg-transparent border border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)] ring-1 ring-emerald-400/50" : "bg-transparent hover:bg-slate-800/20 border border-transparent hover:border-slate-400/35"}`;
      let badgeColor = "text-slate-400";
      if (u.state === "PARKED") badgeColor = "text-slate-300";
      else if (u.state === "AIRBORNE_PATROL" || u.state === "PATROL_ORBIT") badgeColor = "text-emerald-300";
      else badgeColor = "text-sky-300";
      item.innerHTML = `
                <div class="flex items-center gap-2">
                    ${isSelected ? '<span class="w-2.5 h-2.5 rounded-full border border-emerald-300 bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>' : '<span class="w-1.5 h-1.5 rounded-full border border-slate-600 bg-transparent"></span>'}
                    <span class="font-bold ${isSelected ? "text-emerald-100 font-extrabold text-[12px]" : "text-white"}">${u.callsign}</span>
                    <span class="text-[9px] px-1.5 py-0.2 rounded border border-slate-400/35 bg-transparent ${isSelected ? "text-emerald-200 font-bold border-emerald-400/50" : "text-slate-300"}">${u.type}</span>
                </div>
                <span class="text-[10px] font-bold ${isSelected ? "text-emerald-200" : badgeColor}">${u.state}</span>
            `;
      item.addEventListener("click", () => {
        if (onSelectUnit) onSelectUnit(u);
      });
      this.rosterListEl.appendChild(item);
    });
    if (this.rosterSummaryEl) {
      this.rosterSummaryEl.textContent = `${airWingUnits.length} UNITS \u2022 ${countParked} PARKED \u2022 ${countAirborne} AIRBORNE`;
    }
    if (selectedUnit) {
      if (this.btnUnitAction) this.btnUnitAction.disabled = false;
      if (this.btnUnitFollow) this.btnUnitFollow.disabled = false;
      if (this.selCallsignEl) this.selCallsignEl.textContent = selectedUnit.callsign;
      if (this.selTypeEl) this.selTypeEl.textContent = selectedUnit.label;
      if (this.selStateEl) this.selStateEl.textContent = selectedUnit.state;
      if (this.btnUnitFollow) {
        if (followUnit === selectedUnit) {
          this.btnUnitFollow.textContent = "FOLLOW: ON";
          this.btnUnitFollow.classList.add("hud-btn-green-active");
        } else {
          this.btnUnitFollow.textContent = "FOLLOW: OFF";
          this.btnUnitFollow.classList.remove("hud-btn-green-active");
        }
      }
      if (this.btnUnitAction) {
        if (selectedUnit.type === "MH-60S") {
          if (selectedUnit.state === "PARKED") this.btnUnitAction.textContent = "LIFT OFF";
          else if (selectedUnit.state === "PATROL_ORBIT") this.btnUnitAction.textContent = "LAND & PARK";
          else this.btnUnitAction.textContent = "SORTIE ACTIVE";
        } else if (selectedUnit.canCycleJet) {
          if (selectedUnit.state === "PARKED") this.btnUnitAction.textContent = "TAXI & LAUNCH";
          else if (selectedUnit.state === "AIRBORNE_PATROL") this.btnUnitAction.textContent = "RECOVER / LAND";
          else this.btnUnitAction.textContent = "OPS IN PROGRESS";
        } else {
          this.btnUnitAction.textContent = "AWACS STATION";
        }
      }
    } else {
      if (this.selCallsignEl) this.selCallsignEl.textContent = "NO TARGET SELECTED";
      if (this.selTypeEl) this.selTypeEl.textContent = "NONE";
      if (this.selStateEl) this.selStateEl.textContent = "STANDBY";
      if (this.btnUnitAction) {
        this.btnUnitAction.textContent = "SELECT AIRCRAFT";
        this.btnUnitAction.disabled = true;
      }
      if (this.btnUnitFollow) {
        this.btnUnitFollow.textContent = "FOLLOW: OFF";
        this.btnUnitFollow.classList.remove("hud-btn-green-active");
        this.btnUnitFollow.disabled = true;
      }
    }
  }
  bindActions({ onUnitAction, onUnitFollow, onLaunch, onRecover, onHeli, onCameraChange, onTimeChange }) {
    if (this.btnUnitAction && onUnitAction) {
      this.btnUnitAction.addEventListener("click", onUnitAction);
    }
    if (this.btnUnitFollow && onUnitFollow) {
      this.btnUnitFollow.addEventListener("click", onUnitFollow);
    }
    if (this.btnLaunch && onLaunch) {
      this.btnLaunch.addEventListener("click", onLaunch);
    }
    if (this.btnRecover && onRecover) {
      this.btnRecover.addEventListener("click", onRecover);
    }
    if (this.btnHeli && onHeli) {
      this.btnHeli.addEventListener("click", onHeli);
    }
    const camBtns = document.querySelectorAll(".cam-btn");
    camBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        camBtns.forEach((b) => b.classList.remove("hud-btn-active"));
        btn.classList.add("hud-btn-active");
        const key = btn.getAttribute("data-cam");
        if (onCameraChange) onCameraChange(key);
      });
    });
    const timeBtns = document.querySelectorAll(".time-btn");
    timeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        timeBtns.forEach((b) => b.classList.remove("hud-btn-active"));
        btn.classList.add("hud-btn-active");
        const mode = btn.getAttribute("data-time");
        if (onTimeChange) onTimeChange(mode);
      });
    });
  }
};

// ../game/GameHub/games/USSFord/js/main.js
var container = document.getElementById("canvas-container");
var scene = new THREE8.Scene();
scene.background = new THREE8.Color(796742);
scene.fog = new THREE8.FogExp2(1193048, 12e-5);
var aspect = window.innerWidth / window.innerHeight;
var camera = new THREE8.OrthographicCamera(
  -ORTHO_FRUSTUM_HEIGHT * aspect / 2,
  ORTHO_FRUSTUM_HEIGHT * aspect / 2,
  ORTHO_FRUSTUM_HEIGHT / 2,
  -ORTHO_FRUSTUM_HEIGHT / 2,
  -2e3,
  4e3
);
camera.position.copy(CAMERA_PRESETS.iso.pos);
camera.zoom = CAMERA_PRESETS.iso.zoom;
camera.updateProjectionMatrix();
var renderer = new THREE8.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE8.PCFSoftShadowMap;
renderer.toneMapping = THREE8.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);
var hemiLight = new THREE8.HemisphereLight(8302826, 598333, 0.76);
scene.add(hemiLight);
var sunLight = new THREE8.DirectionalLight(16776949, 3.05);
sunLight.position.set(-135, 260, 130);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 50;
sunLight.shadow.camera.far = 680;
var shadowD = 195;
sunLight.shadow.camera.left = -shadowD;
sunLight.shadow.camera.right = shadowD;
sunLight.shadow.camera.top = shadowD;
sunLight.shadow.camera.bottom = -shadowD;
sunLight.shadow.bias = -18e-5;
sunLight.shadow.normalBias = 0.024;
scene.add(sunLight);
var fillLight = new THREE8.DirectionalLight(5934264, 0.28);
fillLight.position.set(160, 75, -120);
scene.add(fillLight);
buildMaritimeEnvironment(renderer, scene, true);
var controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CAMERA_PRESETS.iso.target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minZoom = 0.2;
controls.maxZoom = 10;
var composer = new EffectComposer(renderer);
var renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
var gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
gtaoPass.updateGtaoMaterial({ radius: 2, scale: 10, samples: 16 });
gtaoPass.blendIntensity = 0.92;
gtaoPass.setSceneClipBox(new THREE8.Box3(
  new THREE8.Vector3(-46, -3, -160),
  new THREE8.Vector3(46, 90, 160)
));
composer.addPass(gtaoPass);
var bloomPass = new UnrealBloomPass(
  new THREE8.Vector2(window.innerWidth, window.innerHeight),
  0.045,
  0.2,
  0.94
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
var oceanMesh = createOcean(scene);
var carrier = buildCarrier(scene);
var particles = [];
var puffGeo = new THREE8.SphereGeometry(0.65, 7, 7);
function spawnParticle(pos, vel, s0, s1, maxLife, colorHex = 16317180, alpha0 = 0.45) {
  const mat = new THREE8.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: alpha0,
    depthWrite: false
  });
  const m = new THREE8.Mesh(puffGeo, mat);
  m.position.copy(pos);
  m.scale.setScalar(s0);
  carrier.carrierGroup.add(m);
  particles.push({ mesh: m, vel: vel.clone(), s0, s1, life: 0, maxLife, alpha0 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      carrier.carrierGroup.remove(p.mesh);
      p.mesh.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    const t = p.life / p.maxLife;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.setScalar(THREE8.MathUtils.lerp(p.s0, p.s1, t));
    p.mesh.material.opacity = p.alpha0 * (1 - t);
  }
}
var ui = new UIManager();
var flightOps = new FlightOpsSystem(
  carrier,
  (msg) => ui.setStatusLog(msg),
  () => {
    ui.renderRosterUI(
      flightOps.airWingUnits,
      selection.selectedUnit,
      selection.followUnit,
      (unit) => selection.selectUnit(unit)
    );
  }
);
var selection = new SelectionManager(
  scene,
  camera,
  renderer,
  carrier.deckAssetsGroup,
  (unit) => {
    if (unit) {
      ui.setStatusLog(`TRACKING ${unit.callsign} (${unit.label})`);
    } else {
      ui.setStatusLog("NO AIRCRAFT SELECTED \u2022 CLICK ANY AIRCRAFT");
    }
    ui.renderRosterUI(
      flightOps.airWingUnits,
      selection.selectedUnit,
      selection.followUnit,
      (u) => selection.selectUnit(u)
    );
  }
);
selection.setUnits(flightOps.airWingUnits);
selection.selectUnit(flightOps.airWingUnits[0]);
var desiredCamPos = null;
var desiredCamTarget = null;
var desiredCamZoom = null;
controls.addEventListener("start", () => {
  desiredCamPos = null;
  desiredCamTarget = null;
  desiredCamZoom = null;
  if (selection.followUnit) {
    selection.followUnit = null;
    ui.renderRosterUI(
      flightOps.airWingUnits,
      selection.selectedUnit,
      selection.followUnit,
      (u) => selection.selectUnit(u)
    );
  }
});
ui.bindActions({
  onUnitAction: () => {
    const u = selection.selectedUnit;
    if (!u) return;
    if (u.type === "MH-60S") {
      flightOps.commandHeliSortie(u);
    } else if (u.state === "PARKED") {
      flightOps.commandJetLaunch(u);
    } else if (u.state === "AIRBORNE_PATROL") {
      flightOps.commandJetRecovery(u);
    }
  },
  onUnitFollow: () => {
    const u = selection.selectedUnit;
    if (!u) return;
    selection.toggleFollow(u);
    ui.renderRosterUI(
      flightOps.airWingUnits,
      selection.selectedUnit,
      selection.followUnit,
      (unit) => selection.selectUnit(unit)
    );
  },
  onLaunch: () => {
    const candidate = selection.selectedUnit && selection.selectedUnit.canCycleJet && selection.selectedUnit.state === "PARKED" ? selection.selectedUnit : flightOps.airWingUnits.find((u) => u.canCycleJet && u.state === "PARKED");
    if (candidate) {
      selection.selectUnit(candidate);
      flightOps.commandJetLaunch(candidate);
    }
  },
  onRecover: () => {
    const candidate = selection.selectedUnit && selection.selectedUnit.state === "AIRBORNE_PATROL" ? selection.selectedUnit : flightOps.airWingUnits.find((u) => u.state === "AIRBORNE_PATROL");
    if (candidate) {
      selection.selectUnit(candidate);
      flightOps.commandJetRecovery(candidate);
    } else {
      ui.setStatusLog("LSO: NO AIRCRAFT IN CAP ORBIT YET");
    }
  },
  onHeli: () => {
    const helis = flightOps.airWingUnits.filter((u) => u.type === "MH-60S");
    const activeOrParked = helis.find((h) => h.state === "PATROL_ORBIT") || helis.find((h) => h.state === "PARKED");
    if (activeOrParked) {
      selection.selectUnit(activeOrParked);
      flightOps.commandHeliSortie(activeOrParked);
    }
  },
  onCameraChange: (key) => {
    selection.followUnit = null;
    if (CAMERA_PRESETS[key]) {
      desiredCamPos = CAMERA_PRESETS[key].pos.clone();
      desiredCamTarget = CAMERA_PRESETS[key].target.clone();
      desiredCamZoom = CAMERA_PRESETS[key].zoom;
    }
    ui.renderRosterUI(
      flightOps.airWingUnits,
      selection.selectedUnit,
      selection.followUnit,
      (u) => selection.selectUnit(u)
    );
  },
  onTimeChange: (mode) => {
    const isDay = mode === "day";
    buildMaritimeEnvironment(renderer, scene, isDay);
    setOceanLightingMode(scene, hemiLight, sunLight, fillLight, isDay);
  }
});
window.addEventListener("resize", () => {
  const newAspect = window.innerWidth / window.innerHeight;
  camera.left = -ORTHO_FRUSTUM_HEIGHT * newAspect / 2;
  camera.right = ORTHO_FRUSTUM_HEIGHT * newAspect / 2;
  camera.top = ORTHO_FRUSTUM_HEIGHT / 2;
  camera.bottom = -ORTHO_FRUSTUM_HEIGHT / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
window.airWingUnits = flightOps.airWingUnits;
window.flightOps = flightOps;
window.selection = selection;
window.commandJetLaunch = (u) => flightOps.commandJetLaunch(u);
window.commandJetRecovery = (u) => flightOps.commandJetRecovery(u);
window.commandHeliSortie = (u) => flightOps.commandHeliSortie(u);
var clock = new THREE8.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  oceanUniforms.uTime.value = elapsed;
  carrier.updateCarrier(elapsed, dt);
  flightOps.update(dt, elapsed, spawnParticle);
  selection.update(dt);
  updateParticles(dt);
  if (selection.followUnit) {
    const worldTarget = new THREE8.Vector3();
    selection.followUnit.mesh.getWorldPosition(worldTarget);
    controls.target.lerp(worldTarget, dt * 6);
  } else if (desiredCamPos && desiredCamTarget) {
    camera.position.lerp(desiredCamPos, dt * 3.5);
    controls.target.lerp(desiredCamTarget, dt * 3.5);
    if (desiredCamZoom !== null) {
      camera.zoom = THREE8.MathUtils.lerp(camera.zoom, desiredCamZoom, dt * 3.5);
      camera.updateProjectionMatrix();
    }
    if (camera.position.distanceTo(desiredCamPos) < 0.4) {
      desiredCamPos = null;
      desiredCamTarget = null;
      desiredCamZoom = null;
    }
  }
  controls.update();
  composer.render();
}
window.onload = animate;
