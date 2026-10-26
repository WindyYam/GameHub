import * as THREE from 'three';

// Realistic Oceanic Uniforms Calibrated to Match Reference Aerial Photograph
export const oceanUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-135, 260, 130).normalize() },
    uSunColor: { value: new THREE.Color(0xfffef5) },
    uDeepColor: { value: new THREE.Color(0x081f3d) },      // Deep North Atlantic indigo navy
    uMidColor: { value: new THREE.Color(0x14395f) },       // Sunlit navy wave face
    uSkyColor: { value: new THREE.Color(0x527b9b) },       // Muted steel-blue sky reflection
    uWakeTurquoise: { value: new THREE.Color(0x89a9bf) },  // Cool blue-white aerated sea edge
    uFoamWhite: { value: new THREE.Color(0xf6f9fc) }       // Brilliant sunlit sea froth
};

export function createOceanMaterial() {
    return new THREE.ShaderMaterial({
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

export function createOcean(scene) {
    const oceanMaterial = createOceanMaterial();
    const oceanGeo = new THREE.PlaneGeometry(2800, 2800, 380, 380);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMaterial);
    scene.add(oceanMesh);
    return { oceanMesh, oceanMaterial, oceanUniforms };
}

// Procedural PMREM Maritime Sky & Environment Map
export function buildMaritimeEnvironment(renderer, scene, isDay = true) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envScene = new THREE.Scene();

    const skyGeo = new THREE.SphereGeometry(500, 32, 24);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext('2d');
    const grad = sCtx.createLinearGradient(0, 0, 0, 256);
    if (isDay) {
        grad.addColorStop(0.0,  '#1e4f8a');
        grad.addColorStop(0.42, '#5c95ce');
        grad.addColorStop(0.49, '#c7def4');
        grad.addColorStop(0.51, '#123966');
        grad.addColorStop(1.0,  '#06172e');
    } else {
        grad.addColorStop(0.0,  '#1c1635');
        grad.addColorStop(0.42, '#7c3f58');
        grad.addColorStop(0.49, '#f59e0b');
        grad.addColorStop(0.51, '#27203d');
        grad.addColorStop(1.0,  '#090d1a');
    }
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 512, 256);

    sCtx.fillStyle = isDay ? '#ffffff' : '#fde047';
    sCtx.beginPath();
    sCtx.arc(160, 75, 16, 0, Math.PI * 2);
    sCtx.fill();

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(skyGeo, skyMat));

    const envRT = pmremGenerator.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
    pmremGenerator.dispose();
    skyTex.dispose();
    skyGeo.dispose();
    skyMat.dispose();
}

export function setOceanLightingMode(mode, sunLight, hemiLight, fillLight, scene, renderer) {
    if (mode === 'day') {
        buildMaritimeEnvironment(renderer, scene, true);
        scene.background.setHex(0x0a223f);
        scene.fog.color.setHex(0x0e2b4d);
        hemiLight.color.setHex(0x7eb0ea);
        hemiLight.groundColor.setHex(0x09213d);
        hemiLight.intensity = 0.76;
        sunLight.color.setHex(0xfffef5);
        sunLight.intensity = 3.05;
        sunLight.position.set(-135, 260, 130);
        fillLight.color.setHex(0x5a8cb8);
        fillLight.intensity = 0.28;
        fillLight.position.set(160, 75, -120);
        oceanUniforms.uSunDir.value.copy(sunLight.position).normalize();
        oceanUniforms.uDeepColor.value.setHex(0x081f3d);
        oceanUniforms.uMidColor.value.setHex(0x14395f);
        oceanUniforms.uSkyColor.value.setHex(0x527b9b);
        oceanUniforms.uWakeTurquoise.value.setHex(0x89a9bf);
        oceanUniforms.uFoamWhite.value.setHex(0xf6f9fc);
        oceanUniforms.uSunColor.value.setHex(0xfffef5);
    } else {
        buildMaritimeEnvironment(renderer, scene, false);
        scene.background.setHex(0x1a1426);
        scene.fog.color.setHex(0x281932);
        hemiLight.color.setHex(0xfdba74);
        hemiLight.intensity = 0.75;
        sunLight.color.setHex(0xfb923c);
        sunLight.intensity = 3.2;
        sunLight.position.set(-220, 85, -110);
        fillLight.intensity = 0.30;
        oceanUniforms.uSunDir.value.copy(sunLight.position).normalize();
        oceanUniforms.uDeepColor.value.setHex(0x051122);
        oceanUniforms.uMidColor.value.setHex(0x132842);
        oceanUniforms.uSkyColor.value.setHex(0x4a2e52);
        oceanUniforms.uWakeTurquoise.value.setHex(0x0e7674);
        oceanUniforms.uFoamWhite.value.setHex(0xdbeafe);
        oceanUniforms.uSunColor.value.setHex(0xfdba74);
    }
}
