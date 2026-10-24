// ============================================================================
// 3. CUSTOM GLSL SHADERS (SKY DOME, CUMULUS PATCH, AAA OCEAN, SAND)
// ============================================================================

const SKY_VERTEX_SHADER = `
    varying vec3 vWorldPos;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

const CUMULUS_DENSITY_GLSL = `
    float hash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
    }

    float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float lower = mix(
            mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
        float upper = mix(
            mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
        return mix(lower, upper, f.z);
    }

    float fbm3DLow(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
            v += a * noise(p);
            p = p.yzx * 2.04 + vec3(13.4, 7.1, 9.2);
            a *= 0.5;
        }
        return v;
    }

    float ridged3DLow(vec3 p) {
        float v = 0.0;
        float a = 0.52;
        for (int i = 0; i < 3; i++) {
            float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
            v += a * (n * n);
            p = p.zxy * 2.12 + vec3(5.2, 19.8, 7.4);
            a *= 0.48;
        }
        return v;
    }

    bool getCloudRayBounds(vec3 origin, vec3 dir, float Rout, float Rin, float Ymin, float Ymax, out float tStart, out float tEnd) {
        float tyMin = 0.0;
        float tyMax = 100000.0;

        if (abs(dir.y) > 0.0001) {
            float t1 = (Ymin - origin.y) / dir.y;
            float t2 = (Ymax - origin.y) / dir.y;
            tyMin = max(0.0, min(t1, t2));
            tyMax = max(t1, t2);
            if (tyMax <= 0.0) return false;
        } else {
            if (origin.y < Ymin || origin.y > Ymax) return false;
        }

        float A = dot(dir.xz, dir.xz);
        if (A < 0.00001) return false;

        float B = dot(origin.xz, dir.xz);
        float C_out = dot(origin.xz, origin.xz) - Rout * Rout;
        float disc_out = B * B - A * C_out;
        if (disc_out < 0.0) return false;

        float sqrtDisc_out = sqrt(disc_out);
        float tEnter = (-B - sqrtDisc_out) / A;
        float tExit = (-B + sqrtDisc_out) / A;
        if (tExit <= 0.0) return false;

        float trMin = max(0.0, tEnter);
        float trMax = tExit;

        float C_in = dot(origin.xz, origin.xz) - Rin * Rin;
        if (C_in < 0.0) {
            float disc_in = B * B - A * C_in;
            if (disc_in >= 0.0) {
                float tInnerExit = (-B + sqrt(disc_in)) / A;
                trMin = max(trMin, tInnerExit);
            }
        }

        tStart = max(tyMin, trMin);
        tEnd = min(tyMax, trMax);

        return (tEnd > tStart);
    }

    float sampleGiantCumulus3D(vec3 pos, out float outHeightFrac, out float outTowerCore) {
        float hFrac = (pos.y - 30.0) / 530.0;
        outHeightFrac = clamp(hFrac, 0.0, 1.0);
        outTowerCore = 0.0;
        if (hFrac <= 0.001 || uCumulusCoverage <= 0.01) return 0.0;

        // Polar horizontal coordinates relative to island center (0, 0)
        float r = max(length(pos.xz), 0.001);
        float distBounds = smoothstep(320.0, 520.0, r) * (1.0 - smoothstep(1050.0, 1350.0, r));
        if (distBounds <= 0.001) return 0.0;

        float theta = atan(pos.z, pos.x);
        // Gentle orbital flow rate circulating around the island (~16 min per full orbit)
        float flowRate = 0.0065;
        // Upper-altitude wind shear tilting plumes downwind along the flow direction
        float windShearAngle = pow(hFrac, 1.45) * 0.14;
        float relAngle = theta - (uTime * flowRate + windShearAngle);

        // Generate 2 distinct, separate cumulus cloud formations spaced around the island
        float towerOffset = 0.72 + (hash(vec2(uCumulusSeed + 4.7, 12.1)) - 0.5) * 1.4;

        float minTowerDist = 9999.0;
        for (int i = 0; i < 2; i++) {
            float towerIndex = float(i);
            float towerSeed = hash(vec2(uCumulusSeed + towerIndex * 13.7 + 2.1, 12.1));
            // Cloud 0 and Cloud 1 spaced ~140 degrees apart around the island
            float angleOffset = towerIndex < 0.5 ? 0.0 : (2.45 + (hash(vec2(uCumulusSeed + 55.4, 21.7)) - 0.5) * 0.7);
            float towerJitter = (hash(vec2(uCumulusSeed + towerIndex * 7.3 + 6.2, 13.4)) - 0.5) * 0.16;
            float towerAngle = towerOffset + angleOffset + towerJitter;
            float dAngle = atan(sin(relAngle - towerAngle), cos(relAngle - towerAngle));
            float targetRadius = 720.0 + towerSeed * 90.0;
            float radialOffset = r - targetRadius;
            float tangentOffset = dAngle * r;
            float radialRadius = 195.0 + towerSeed * 49.0;
            float tangentRadius = 218.0 + towerSeed * 62.0;
            float localRadius = length(vec2(radialOffset / radialRadius, tangentOffset / tangentRadius));
            minTowerDist = min(minTowerDist, localRadius);
        }

        // Expansive base bounds up to 3.15, while convective towers above hFrac 0.38 taper to 1.65
        float maxRadiusLimit = mix(3.15, 1.65, smoothstep(0.08, 0.38, hFrac));
        if (minTowerDist > maxRadiusLimit) return 0.0;

        // Local co-rotating coordinates so the cloud body and detail noises travel together smoothly around the island
        float cosA = cos(relAngle);
        float sinA = sin(relAngle);
        vec2 localXZ = vec2(r * cosA, r * sinA);
        vec3 sampleP = vec3(localXZ.x, pos.y - uTime * 0.85, localXZ.y) * 0.0058;
        float broadShapeNoise = fbm3DLow(sampleP * 0.85);
        float billowMacro = fbm3DLow(sampleP * 1.7);
        float cauliflower = ridged3DLow(sampleP * 3.1 + vec3(0.0, -uTime * 0.10, 0.0));
        float cloudMass = 0.0;
        float towerCore = 0.0;
        float covBoost = smoothstep(0.0, 0.18, uCumulusCoverage) * mix(0.72, 1.12, uCumulusCoverage);

        for (int i = 0; i < 2; i++) {
            float towerIndex = float(i);
            float towerSeed = hash(vec2(uCumulusSeed + towerIndex * 13.7 + 2.1, 12.1));
            float angleOffset = towerIndex < 0.5 ? 0.0 : (2.45 + (hash(vec2(uCumulusSeed + 55.4, 21.7)) - 0.5) * 0.7);
            float towerJitter = (hash(vec2(uCumulusSeed + towerIndex * 7.3 + 6.2, 13.4)) - 0.5) * 0.16;
            float towerAngle = towerOffset + angleOffset + towerJitter;
            float dAngle = atan(sin(relAngle - towerAngle), cos(relAngle - towerAngle));
            float targetRadius = 720.0 + towerSeed * 90.0;
            float radialOffset = r - targetRadius;
            float tangentOffset = dAngle * r;
            float radialRadius = 195.0 + towerSeed * 49.0;
            float tangentRadius = 218.0 + towerSeed * 62.0;
            float localRadius = length(vec2(radialOffset / radialRadius, tangentOffset / tangentRadius));

            float lobePhase = atan(tangentOffset / tangentRadius, radialOffset / radialRadius) * 4.0
                            + hFrac * 19.0 + broadShapeNoise * 6.0;
            float sideLobes = 0.5 + 0.5 * sin(lobePhase);
            // Convective side billows are pronounced on the rising tower, not breaking the cohesive base
            float lobeBulge = (sideLobes - 0.5) * 0.28
                            * smoothstep(0.20, 0.40, hFrac)
                            * (1.0 - smoothstep(0.72, 0.92, hFrac));

            // Base width scale: significantly wider than the tower column (typically 1.8x to 2.4x)
            float baseScale = mix(1.20, 2.30, hash(vec2(uCumulusSeed + towerIndex * 3.7 + 7.1, 14.3)));

            // Convective tower column profile: narrow waist, billowing cauliflower head
            float towerWidth = 0.86
                - 0.14 * smoothstep(0.22, 0.48, hFrac)
                + 0.26 * smoothstep(0.50, 0.80, hFrac)
                - 0.16 * smoothstep(0.80, 0.98, hFrac);

            // Smoothly taper from the expansive cloud base up into the convective column
            float baseDecay = 1.0 - smoothstep(0.06, 0.32, hFrac);
            float widthProfile = mix(towerWidth, baseScale, baseDecay);

            float shapeDistortion = clamp(
                (billowMacro - 0.42) * 0.70 + (cauliflower - 0.36) * 0.42 + lobeBulge,
                -0.34,
                0.34
            );
            float bodyMask = 1.0 - smoothstep(widthProfile * 0.68, widthProfile * 1.10, localRadius + shapeDistortion);

            float topHeight = (
                0.72 + towerSeed * 0.28
                + (broadShapeNoise - 0.45) * 0.15
                + (billowMacro - 0.42) * 0.14
                + (cauliflower - 0.36) * 0.20
                + (sideLobes - 0.5) * 0.10
            ) * covBoost;

            // Parabolic dome rounding prevents flat-ceiling cylinder look
            float domeRadiusFrac = clamp(localRadius / max(0.001, towerWidth * 1.08), 0.0, 1.25);
            float domeDrop = pow(domeRadiusFrac, 2.2) * 0.26;
            float effectiveTop = topHeight - domeDrop;
            float topCap = 1.0 - smoothstep(effectiveTop - 0.045, effectiveTop + 0.035, hFrac);

            // Sharp, flat condensation base hovering parallel to the horizon
            float flatBase = smoothstep(0.0, 0.035, hFrac);

            float towerMass = bodyMask * topCap * flatBase;
            cloudMass = max(cloudMass, towerMass);
            towerCore = max(towerCore, towerMass);
        }
        float macroEnvelope = cloudMass * distBounds;
        outTowerCore = clamp(towerCore * distBounds, 0.0, 1.0);
        if (macroEnvelope <= 0.01) return 0.0;

        float wispyPlume = noise(sampleP * 5.6 + vec3(uTime * 0.14, 0.0, 0.0));
        float anvilSoftness = smoothstep(0.72, 0.98, hFrac);
        float baseSoftness = 1.0 - smoothstep(0.06, 0.28, hFrac);
        float detailNoise = mix(
            mix(billowMacro * 0.40 + cauliflower * 0.60, billowMacro * 0.65 + wispyPlume * 0.35, anvilSoftness),
            billowMacro * 0.70 + broadShapeNoise * 0.30,
            baseSoftness * 0.65
        );
        float density = smoothstep(0.28, 0.68, macroEnvelope * 0.82 + detailNoise * 0.48);
        return density * macroEnvelope;
    }
`;

const SKY_FRAGMENT_SHADER = `
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uSkyHorizonColor;
    uniform float uSkyRotation;
    uniform float uTime;
    uniform float uCloudCoverage;
    varying vec3 vWorldPos;

    float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float hash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
    }

    float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float lower = mix(
            mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
        float upper = mix(
            mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
        return mix(lower, upper, f.z);
    }

    float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 6; i++) {
            v += a * noise(p);
            p = p.yzx * 2.03 + vec3(13.4, 7.1, 9.2);
            a *= 0.5;
        }
        return v;
    }

    float ridgedFbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
            float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
            v += a * (n * n);
            p = p.yzx * 2.12 + vec3(5.2, 19.8, 7.4);
            a *= 0.48;
        }
        return v;
    }

    // 6-octave fractal Brownian motion for natural wispy & billowing cloud structure
    float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
        for (int i = 0; i < 6; i++) {
            v += a * noise(p);
            p = rot * p * 2.03 + vec2(13.4, 7.1);
            a *= 0.5;
        }
        return v;
    }

    // Ridged multifractal turbulence for crisp cauliflower cumulus tops
    float ridgedFbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 4; i++) {
            float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
            v += a * (n * n);
            p = rot * p * 2.12 + vec2(5.2, 19.8);
            a *= 0.48;
        }
        return v;
    }

    // ============================================================================
    // 3D VOLUMETRIC GIANT TROPICAL CUMULUS CONGESTUS / CUMULONIMBUS DENSITY FIELD
    // Inspired by towering oceanic trade-wind cumulus with:
    //  - Flat condensation base hovering over the horizon
    //  - Steeply stacked, boiling cauliflower turret lobes
    // Photorealistic multi-scale cumulus density field with wind shear & wispy edges (no circular Worley bubbles)
    float sampleCloudDensity(vec2 uv) {
        vec2 windMacro = vec2(uTime * 0.018, uTime * 0.007);
        vec2 windMicro = vec2(uTime * 0.042, -uTime * 0.015);

        // Fluid atmospheric curl warp
        vec2 warp = vec2(
            fbm(uv * 0.85 + windMacro),
            fbm(uv * 0.85 - windMacro + vec2(11.7, 4.3))
        ) - 0.5;

        vec2 p = uv + warp * 0.55 + windMacro;

        // Broad weather-front cloud formations separated by open blue sky channels
        float baseFronts = fbm(p * 0.55);
        float billowingTurbulence = ridgedFbm(p * 1.45 + windMicro * 0.5);
        float wispyEdges = fbm(p * 3.8 - windMicro);

        float composite = baseFronts * 0.62 + billowingTurbulence * 0.25 + wispyEdges * 0.13;
        float threshold = mix(0.68, 0.34, uCloudCoverage);
        return smoothstep(threshold, threshold + 0.22, composite);
    }

    // The same density shader is injected into the ocean shader for matching reflections.

    void main() {
        vec3 dir = normalize(vWorldPos - cameraPosition);
        float y = max(dir.y, 0.001);

        float sunAlt = uSunDir.y;
        float dayFactor = smoothstep(-0.12, 0.25, sunAlt);
        float twilightFactor = smoothstep(-0.22, 0.08, sunAlt) * (1.0 - smoothstep(0.05, 0.38, sunAlt));
        float nightFactor = 1.0 - smoothstep(-0.18, 0.05, sunAlt);

        // Physically calibrated Rayleigh-Mie tropical sky gradient
        vec3 dayZenith = vec3(0.008, 0.09, 0.34);

        vec3 sunsetZenith = vec3(0.08, 0.12, 0.32);

        vec3 nightZenith = vec3(0.005, 0.012, 0.038);

        vec3 zenithCol = mix(nightZenith, dayZenith, dayFactor);
        zenithCol = mix(zenithCol, sunsetZenith, twilightFactor * 0.85);

        vec3 horizonCol = uSkyHorizonColor;

        // Match the ocean's horizon color exactly, then fade atmospheric scattering in above it.
        if (dir.y < 0.0) {
            gl_FragColor = vec4(horizonCol, 1.0);
            return;
        }
        float horizonVisibility = smoothstep(0.0, 0.04, dir.y);

        float horizonGlow = pow(1.0 - y, 2.8);
        vec3 skyCol = mix(zenithCol, horizonCol, horizonGlow);

        // Mie forward scattering around the sun
        float sunDot = max(dot(dir, uSunDir), 0.0);
        vec3 mieTint = mix(vec3(1.0, 0.36, 0.10), vec3(1.0, 0.92, 0.78), smoothstep(-0.05, 0.35, sunAlt));
        float mieScatter = pow(sunDot, 5.0) * (0.30 + 0.70 * twilightFactor) * smoothstep(-0.18, 0.2, sunAlt) * horizonVisibility;
        skyCol += mieTint * mieScatter * (0.25 + 0.75 * horizonGlow);

        // Solar disc + soft corona
        float sunDisc = smoothstep(0.99945, 0.99985, dot(dir, uSunDir));
        float sunCorona = pow(sunDot, 180.0) * 1.1;
        skyCol += (sunDisc * 8.0 + sunCorona) * mieTint * smoothstep(-0.08, 0.02, sunAlt) * horizonVisibility;

        // Epic Nighttime Milky Way Galaxy Belt, Nebulae, Starfield & Moon
        if (nightFactor > 0.01 && dir.y > 0.0) {
            float horizonVis = smoothstep(0.0, 0.015, dir.y);
            float skyCos = cos(uSkyRotation);
            float skySin = sin(uSkyRotation);
            vec3 starDir = vec3(
                skyCos * dir.x + skySin * dir.y,
                -skySin * dir.x + skyCos * dir.y,
                dir.z
            );

            // Rotate celestial coordinates to tilt the Milky Way arch gracefully across the sky
            mat3 galRot = mat3(
                 0.80, -0.46,  0.38,
                 0.52,  0.85, -0.10,
                -0.30,  0.26,  0.92
            );
            vec3 galDir = galRot * starDir;

            // Continuous spherical coordinates retain detail across the entire galactic belt.
            float galLat = galDir.y;
            vec3 galPos = galDir * vec3(2.4, 5.2, 2.4);

            // Organic warp for swirling interstellar gas & nebula filaments
            vec2 galWarp = vec2(
                fbm(galPos * 1.3 + vec3(3.1, 7.4, 0.0)),
                fbm(galPos * 1.3 + vec3(12.8, 1.9, 0.0))
            ) - 0.5;
            vec3 warpedGalPos = galPos + vec3(galWarp, 0.0) * 0.55;

            // Core galactic plane profile + Sagittarius-like bright galactic center bulge
            float bandProfile = exp(-pow(galLat * 3.8 + galWarp.y * 0.45, 2.0));
            float coreAlignment = dot(normalize(galDir), vec3(cos(0.45), 0.0, sin(0.45)));
            float coreBulge = exp((coreAlignment - 1.0) * 3.2) * exp(-pow(galLat * 2.8, 2.0));

            // Multi-scale star-cloud glow & dark Great Rift cosmic dust lanes
            float starCloudStructure = fbm(warpedGalPos * 1.8);
            float fineFilaments = ridgedFbm(warpedGalPos * 3.4);
            float darkDustRift = smoothstep(0.36, 0.66, fbm(warpedGalPos * 2.5 + vec3(5.2, -3.7, 0.0)));
            float riftMask = darkDustRift * exp(-pow(galLat * 6.8, 2.0)) * 0.80;

            float mwIntensity = clamp((bandProfile * (0.45 + 0.85 * starCloudStructure) + coreBulge * 0.65) * (1.0 - riftMask), 0.0, 1.4);

            // Rich astrophotography palette: warm golden-amber galactic core, sapphire star clouds, and magenta H-II emission nebulae
            vec3 coreColor = vec3(1.0, 0.76, 0.52);
            vec3 outerWingColor = vec3(0.28, 0.52, 0.96);
            vec3 nebulaPink = vec3(0.88, 0.26, 0.58);
            vec3 nebulaCyan = vec3(0.18, 0.78, 0.85);

            float nebulaSpots = pow( clamp(fbm(warpedGalPos * 4.2 + vec3(8.1, 2.3, 0.0)) - 0.42, 0.0, 1.0) * 1.8, 2.2 ) * bandProfile;
            float cyanWisps = pow( clamp(fineFilaments - 0.48, 0.0, 1.0) * 1.9, 2.0 ) * bandProfile;

            vec3 galaxyCol = mix(outerWingColor, coreColor, clamp(coreBulge * 1.2 + starCloudStructure * 0.45, 0.0, 1.0)) * mwIntensity * 0.58;
            galaxyCol += nebulaPink * nebulaSpots * (1.0 - riftMask * 0.6) * 0.85;
            galaxyCol += nebulaCyan * cyanWisps * (1.0 - riftMask * 0.5) * 0.42;

            // Dense unresolved micro-star dust glittering along the Milky Way spine
            vec2 dustUV = starDir.xz / (starDir.y + 0.18) * 320.0;
            float microStarNoise = pow(hash(floor(dustUV)), 18.0) * (bandProfile * 1.5 + 0.12) * (1.0 - riftMask * 0.7);
            galaxyCol += vec3(0.86, 0.92, 1.0) * microStarNoise * 1.15;

            skyCol += galaxyCol * nightFactor * horizonVis;

            // Multi-layered bright stars (dense near galactic plane + scattered all-sky constellations)
            for (int layer = 0; layer < 2; layer++) {
                float scale = (layer == 0) ? 135.0 : 220.0;
                vec2 starUV = starDir.xz / (starDir.y + 0.15) * scale + float(layer) * 41.7;
                vec2 starCell = floor(starUV);
                float sVal = hash(starCell);
                float densityThreshold = mix(0.9925, 0.976, bandProfile * 0.85);
                if (sVal > densityThreshold) {
                    vec2 center = starCell + 0.3 + 0.4 * vec2(fract(sVal * 17.3), fract(sVal * 31.7));
                    float dStar = length(starUV - center);
                    float twinkle = 0.65 + 0.35 * sin(uTime * (2.5 + float(layer) * 1.5) + sVal * 120.0);
                    float starSpark = smoothstep(0.34, 0.015, dStar) * twinkle * horizonVis;
                    vec3 starColor = mix(vec3(0.70, 0.85, 1.0), vec3(1.0, 0.88, 0.72), fract(sVal * 53.0));
                    skyCol += starColor * starSpark * nightFactor * (layer == 0 ? 1.65 : 0.95);
                }
            }

            // Crisp Moon disc & atmospheric lunar halo
            float moonDot = max(dot(dir, uMoonDir), 0.0);
            float moonDisc = smoothstep(0.9991, 0.99955, dot(dir, uMoonDir));
            float moonHalo = pow(moonDot, 48.0) * 0.38 + pow(moonDot, 8.0) * 0.06;
            skyCol += vec3(0.76, 0.86, 1.0) * (moonDisc * 3.5 + moonHalo) * nightFactor;
        }

        // LAYER 1: High-altitude raymarched cloud deck with Henyey-Greenstein scattering
        if (dir.y > 0.015 && uCloudCoverage > 0.01) {
            float planeDist = 1.9 / (pow(dir.y, 0.82) + 0.06);
            vec2 cloudUV = dir.xz * planeDist * 0.32;

            float d1 = sampleCloudDensity(cloudUV);
            float d2 = sampleCloudDensity(cloudUV * 1.85 + vec2(21.4, -11.8)) * 0.45;
            float density = clamp(d1 + d2 * 0.5, 0.0, 1.0);

            if (density > 0.004) {
                vec3 primaryLightDir = sunAlt > 0.0 ? uSunDir : uMoonDir;
                vec2 lightStep = primaryLightDir.xz * 0.085;
                float s1 = sampleCloudDensity(cloudUV + lightStep * 0.5);
                float s2 = sampleCloudDensity(cloudUV + lightStep * 1.2);
                float s3 = sampleCloudDensity(cloudUV + lightStep * 2.2);
                float opticalDepth = (s1 * 0.45 + s2 * 0.35 + s3 * 0.20) * 1.35;
                float transmittance = exp(-opticalDepth * 1.65);

                vec3 sunlitTop = mix(vec3(0.10, 0.16, 0.28), vec3(0.98, 0.99, 1.0), dayFactor);
                sunlitTop = mix(sunlitTop, vec3(1.0, 0.52, 0.24), twilightFactor * 0.94);

                vec3 ambientBelly = mix(vec3(0.02, 0.035, 0.08), vec3(0.46, 0.58, 0.74), dayFactor);
                ambientBelly = mix(ambientBelly, vec3(0.26, 0.14, 0.28), twilightFactor * 0.92);

                vec3 cloudCol = mix(ambientBelly, sunlitTop, clamp(transmittance * 0.85 + (1.0 - density) * 0.25, 0.0, 1.0));

                // Powder sugar effect & silver-lining forward scatter near the sun (day) and moon (night)
                float hgPhase = pow(sunDot, 6.0) * smoothstep(-0.1, 0.4, sunAlt);
                float silverLining = (1.0 - exp(-density * 2.5)) * exp(-opticalDepth * 0.9) * hgPhase;
                cloudCol += mieTint * silverLining * 0.95;

                float moonDotCloud = max(dot(dir, uMoonDir), 0.0);
                float lunarSilver = (1.0 - exp(-density * 2.2)) * exp(-opticalDepth * 0.8) * pow(moonDotCloud, 7.0) * nightFactor;
                cloudCol += vec3(0.55, 0.72, 1.0) * lunarSilver * 0.55;

                // Atmospheric perspective fade toward the horizon
                float horizonFade = smoothstep(0.015, 0.22, dir.y);
                cloudCol = mix(horizonCol, cloudCol, horizonFade);

                float cloudAlpha = smoothstep(0.01, 0.42, density) * smoothstep(0.015, 0.08, dir.y) * 0.94;
                skyCol = mix(skyCol, cloudCol, cloudAlpha);
            }
        }

        gl_FragColor = vec4(skyCol, 1.0);
    }
`;

const CUMULUS_PATCH_VERTEX_SHADER = `
    varying vec3 vWorldPos;

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

const CUMULUS_PATCH_FRAGMENT_SHADER = `
    uniform float uTime;
    uniform float uCumulusCoverage;
    uniform float uCumulusSeed;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyHorizonColor;
    uniform sampler2D uDepthTexture;
    uniform vec2 uResolution;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform vec3 uCameraForward;
    varying vec3 vWorldPos;

    float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    ${CUMULUS_DENSITY_GLSL}

    void main() {
        if (uCumulusCoverage <= 0.01) discard;
        vec3 dir = normalize(vWorldPos - cameraPosition);

        float sunAlt = uSunDir.y;
        float dayFactor = smoothstep(-0.10, 0.28, sunAlt);
        float twilightFactor = smoothstep(-0.20, 0.06, sunAlt)
                             * (1.0 - smoothstep(0.04, 0.34, sunAlt));
        float nightFactor = 1.0 - smoothstep(-0.14, 0.04, sunAlt);
        vec3 primaryLightDir = normalize(sunAlt > -0.04 ? uSunDir : uMoonDir);

        vec3 towerSunTop = mix(vec3(0.14, 0.22, 0.38), vec3(1.0, 0.99, 0.98), dayFactor);
        towerSunTop = mix(towerSunTop, vec3(1.0, 0.56, 0.26), twilightFactor * 0.95);
        vec3 towerMidShadow = mix(vec3(0.04, 0.07, 0.15), vec3(0.50, 0.65, 0.84), dayFactor);
        towerMidShadow = mix(towerMidShadow, vec3(0.45, 0.24, 0.38), twilightFactor * 0.90);
        vec3 towerDarkBase = mix(vec3(0.015, 0.03, 0.07), vec3(0.24, 0.36, 0.54), dayFactor);
        towerDarkBase = mix(towerDarkBase, vec3(0.20, 0.11, 0.24), twilightFactor * 0.92);
        vec3 mieTint = mix(vec3(0.72, 0.84, 1.0), uSunColor, twilightFactor);
        float hgSun = pow(max(dot(dir, uSunDir), 0.0), 5.0) * smoothstep(-0.1, 0.4, sunAlt);
        float hgMoon = pow(max(dot(dir, uMoonDir), 0.0), 6.0) * nightFactor;

        float tMin, tMax;
        if (!getCloudRayBounds(cameraPosition, dir, 1350.0, 320.0, 28.0, 560.0, tMin, tMax)) discard;

        // Depth buffer clipping: prevent clouds from blocking solid foreground geometry (island, trees, etc.)
        vec2 screenUV = gl_FragCoord.xy / uResolution;
        float zBuf = texture2D(uDepthTexture, screenUV).r;
        if (zBuf < 0.999999) {
            float viewZ = (uCameraNear * uCameraFar) / (uCameraFar - zBuf * (uCameraFar - uCameraNear));
            float cosViewAngle = max(dot(dir, uCameraForward), 0.0001);
            float tScene = viewZ / cosViewAngle;
            tMax = min(tMax, tScene);
            if (tMax <= tMin) discard;
        }

        const int PATCH_STEPS = 64;
        float stepSize = (tMax - tMin) / float(PATCH_STEPS);
        float dither = hash(gl_FragCoord.xy);
        float tRay = tMin + mix(0.5, dither, 0.25) * stepSize;
        vec3 accumColor = vec3(0.0);
        float transmittance = 1.0;

        for (int i = 0; i < PATCH_STEPS; i++) {
            if (transmittance < 0.015 || tRay > tMax) break;
            vec3 p = cameraPosition + dir * tRay;
            float hFrac, towerCore;
            float density = sampleGiantCumulus3D(p, hFrac, towerCore);

            if (density > 0.008) {
                float shadowH, shadowCore;
                float shadowDensity = sampleGiantCumulus3D(p + primaryLightDir * 72.0, shadowH, shadowCore);
                float shadowOD = shadowDensity * 3.1;
                float powder = 1.0 - exp(-density * 4.2);
                float directLight = exp(-shadowOD) * (0.42 + 0.58 * powder);
                float baseDarkening = smoothstep(0.0, 0.26, hFrac);
                vec3 ambientVoxel = mix(towerDarkBase, towerMidShadow, baseDarkening);
                ambientVoxel += vec3(0.03, 0.14, 0.18) * (1.0 - baseDarkening) * dayFactor * 0.45;
                vec3 voxelColor = mix(ambientVoxel, towerSunTop, clamp(directLight + hFrac * 0.18, 0.0, 1.0));
                float rimScatter = (1.0 - exp(-density * 2.8)) * exp(-shadowOD * 0.65);
                voxelColor += mieTint * rimScatter * hgSun * 1.15;
                voxelColor += vec3(0.56, 0.74, 1.0) * rimScatter * hgMoon * 0.65;

                float distHaze = smoothstep(450.0, 1300.0, tRay) * 0.35;
                voxelColor = mix(voxelColor, uSkyHorizonColor, distHaze);
                float stepAlpha = 1.0 - exp(-density * stepSize * 0.080);
                accumColor += transmittance * voxelColor * stepAlpha;
                transmittance *= (1.0 - stepAlpha);
            }
            tRay += stepSize;
        }

        float rawAlpha = 1.0 - transmittance;
        float cloudAlpha = smoothstep(0.005, 0.20, rawAlpha);
        if (cloudAlpha < 0.003) discard;
        gl_FragColor = vec4(accumColor / max(rawAlpha, 0.0001), cloudAlpha);
    }
`;

const OCEAN_VERTEX_SHADER = `
    uniform float uTime;
    uniform float uWaveScale;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vFoamCrest;
    varying float vWaveHeight;
    varying float vSeabedY;

    float vHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    float vNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(vHash(i), vHash(i + vec2(1.0, 0.0)), f.x),
            mix(vHash(i + vec2(0.0, 1.0)), vHash(i + vec2(1.0, 1.0)), f.x),
            f.y
        );
    }

    vec2 domainWarp2D(vec2 p, float t) {
        float w1 = vNoise(p * 0.022 + vec2(t * 0.04, -t * 0.03)) - 0.5;
        float w2 = vNoise(p * 0.022 + vec2(19.7 - t * 0.03, 41.3 + t * 0.04)) - 0.5;
        return vec2(w1, w2);
    }

    vec3 gerstnerWaveDisrupted(vec4 waveParams, vec2 pos, float phaseJitter, float ampMod, inout vec3 tangent, inout vec3 binormal) {
        float steepness = waveParams.z * uWaveScale * ampMod;
        float wavelength = waveParams.w;
        float k = 6.28318530718 / wavelength;
        float c = sqrt(9.8 / k);

        float angleJitter = phaseJitter * 0.14;
        float ca = cos(angleJitter);
        float sa = sin(angleJitter);
        vec2 baseDir = normalize(waveParams.xy);
        vec2 d = vec2(baseDir.x * ca - baseDir.y * sa, baseDir.x * sa + baseDir.y * ca);

        float f = k * (dot(d, pos) - c * uTime) + phaseJitter;
        float a = steepness / k;

        tangent += vec3(
            -d.x * d.x * (steepness * sin(f)),
             d.x * (steepness * cos(f)),
            -d.x * d.y * (steepness * sin(f))
        );
        binormal += vec3(
            -d.x * d.y * (steepness * sin(f)),
             d.y * (steepness * cos(f)),
            -d.y * d.y * (steepness * sin(f))
        );
        return vec3(
            d.x * (a * cos(f)),
            a * sin(f),
            d.y * (a * cos(f))
        );
    }

    float seabedRidgeMask(vec2 p, vec2 start, vec2 end) {
        vec2 axis = end - start;
        float t = clamp(dot(p - start, axis) / dot(axis, axis), 0.0, 1.0);
        float distanceToRidge = length(p - (start + axis * t));
        float ridgeWidth = 120.0 + 35.0 * sin(p.x * 0.007 + p.y * 0.004)
                          + 24.0 * sin(p.y * 0.013 - p.x * 0.009);
        float edgeWobble = 20.0 * sin(p.x * 0.012 + p.y * 0.008)
                         + 12.0 * sin(p.y * 0.014 - p.x * 0.009);
        float organicDistance = max(0.0, distanceToRidge + edgeWobble);
        return 1.0 - smoothstep(ridgeWidth * 0.22, ridgeWidth * 1.85, organicDistance);
    }

    float sampleSeabed(vec2 p) {
        float angle = atan(p.y, p.x);
        float rMain = length(p);
        float coastWave = sin(angle * 3.0 + 0.8) * 16.5 + cos(angle * 2.0 - 0.5) * 22.0 + sin(angle * 5.0) * 6.2;
        float effectiveR = rMain + coastWave;

        vec2 dSpit = p - vec2(138.0, 44.0);
        float rSpit = sqrt(dSpit.x * dSpit.x * 0.42 + dSpit.y * dSpit.y * 1.32);

        vec2 dCove = p + vec2(92.0, -52.0);
        float rCove = sqrt(dCove.x * dCove.x * 0.85 + dCove.y * dCove.y * 0.75);

        float mainMound = 9.35 * exp(-(effectiveR * effectiveR) / (112.0 * 112.0));
        float spitMound = 4.65 * exp(-(rSpit * rSpit) / (82.0 * 82.0));
        float coveMound = 4.25 * exp(-(rCove * rCove) / (68.0 * 68.0));
        float lagoonAtollPlatform = 7.45 * exp(-pow(rMain / 370.0, 2.6));

        // Distant Island, moved twice as far from the main atoll.
        vec2 dDist = p - vec2(-260.0, -1020.0);
        float rotDistX = dDist.x * 0.92 - dDist.y * 0.38;
        float rotDistZ = dDist.x * 0.38 + dDist.y * 0.92;
        float rDistLand = sqrt((rotDistX * 0.72) * (rotDistX * 0.72) + (rotDistZ * 1.45) * (rotDistZ * 1.45));
        float distIslandMound = 11.2 * exp(-(rDistLand * rDistLand) / (46.0 * 46.0));
        float rDistLagoon = sqrt((rotDistX * 0.58) * (rotDistX * 0.58) + (rotDistZ * 1.05) * (rotDistZ * 1.05));
        float distLagoonShelf = 7.8 * exp(-pow(rDistLagoon / 125.0, 3.0));

        vec2 dSeabed3 = p - vec2(-650.0, -1350.0);
        float seabed3RotX = dSeabed3.x * 0.92 - dSeabed3.y * 0.38;
        float seabed3RotZ = dSeabed3.x * 0.38 + dSeabed3.y * 0.92;
        float seabed3Land = sqrt((seabed3RotX * 0.72) * (seabed3RotX * 0.72) + (seabed3RotZ * 1.45) * (seabed3RotZ * 1.45));
        float seabed3Shelf = sqrt((seabed3RotX * 0.58) * (seabed3RotX * 0.58) + (seabed3RotZ * 1.05) * (seabed3RotZ * 1.05));
        float seabed3Mound = 5.4 * exp(-(seabed3Land * seabed3Land) / (62.0 * 62.0)) + 2.5 * exp(-pow(seabed3Shelf / 145.0, 3.0));

        vec2 dSeabed4 = p - vec2(-1120.0, -1570.0);
        float seabed4RotX = dSeabed4.x * 0.92 - dSeabed4.y * 0.38;
        float seabed4RotZ = dSeabed4.x * 0.38 + dSeabed4.y * 0.92;
        float seabed4Land = sqrt((seabed4RotX * 0.72) * (seabed4RotX * 0.72) + (seabed4RotZ * 1.45) * (seabed4RotZ * 1.45));
        float seabed4Shelf = sqrt((seabed4RotX * 0.58) * (seabed4RotX * 0.58) + (seabed4RotZ * 1.05) * (seabed4RotZ * 1.05));
        float seabed4Mound = 5.4 * exp(-(seabed4Land * seabed4Land) / (62.0 * 62.0)) + 2.5 * exp(-pow(seabed4Shelf / 145.0, 3.0));

        float h = -9.2 + mainMound + spitMound + coveMound + lagoonAtollPlatform + distIslandMound + distLagoonShelf + seabed3Mound + seabed4Mound;
        vec2 residentialOffset = p + vec2(96.0, 214.0);
        float residentialAlong = dot(residentialOffset, vec2(-0.39, -0.92));
        float residentialAcross = dot(residentialOffset, vec2(0.92, -0.39));
        float residentialRadius = length(vec2(residentialAlong / 155.0, residentialAcross / 75.0));
        float residentialShelf = 1.0 - smoothstep(0.72, 1.0, residentialRadius);
        float residentialBedTarget = mix(-2.2, -1.1, smoothstep(-10.0, 50.0, residentialAlong));
        h = max(h, mix(h, residentialBedTarget, residentialShelf));
        float ridgeMask = 0.0;
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(0.0, -100.0), vec2(-110.0, -190.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-110.0, -190.0), vec2(-250.0, -300.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-250.0, -300.0), vec2(-420.0, -430.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-420.0, -430.0), vec2(-590.0, -570.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-590.0, -570.0), vec2(-720.0, -720.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-720.0, -720.0), vec2(-760.0, -850.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-760.0, -850.0), vec2(-690.0, -950.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-690.0, -950.0), vec2(-520.0, -1000.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-520.0, -1000.0), vec2(-260.0, -1020.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-260.0, -1020.0), vec2(-380.0, -1060.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-380.0, -1060.0), vec2(-530.0, -1130.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-530.0, -1130.0), vec2(-670.0, -1220.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-670.0, -1220.0), vec2(-760.0, -1310.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-760.0, -1310.0), vec2(-650.0, -1350.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-650.0, -1350.0), vec2(-800.0, -1410.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-800.0, -1410.0), vec2(-930.0, -1470.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-930.0, -1470.0), vec2(-1120.0, -1570.0)));
        float ridgeBedTarget = -4.4 + 0.45 * sin(p.x * 0.008 + sin(p.y * 0.006) * 1.5) + 0.2 * sin(p.y * 0.015 - p.x * 0.01);
        h = max(h, mix(h, ridgeBedTarget, ridgeMask));
        return h;
    }

    void main() {
        vec4 worldInitial = modelMatrix * vec4(position, 1.0);
        vec2 xz = worldInitial.xz;

        float seabedY = sampleSeabed(xz);
        vSeabedY = seabedY;
        float waterDepth = max(0.0, -seabedY);
        float shoalingFactor = smoothstep(0.0, 3.2, waterDepth);
        float camDist = length(cameraPosition.xz - xz);
        float distDamp = 1.0 - smoothstep(40.0, 6000.0, camDist);

        vec2 warpMacro = domainWarp2D(xz, uTime);
        vec2 warpMeso  = domainWarp2D(xz * 2.7 + vec2(37.2, 11.8), uTime * 1.4);
        vec2 warpedXZ1 = xz + warpMacro * 14.0;
        vec2 warpedXZ2 = xz + warpMeso * 5.5;

        float nMacro = vNoise(xz * 0.015 + vec2(uTime * 0.025, -uTime * 0.018));
        float nMeso  = vNoise(xz * 0.048 - vec2(uTime * 0.05,  uTime * 0.035));
        float phaseWarp1 = (nMacro - 0.5) * 5.2;
        float phaseWarp2 = (nMeso - 0.5) * 4.4;
        float envelope1 = (0.55 + 0.70 * nMacro) * shoalingFactor * distDamp;
        float envelope2 = (0.50 + 0.75 * nMeso) * (0.35 + 0.65 * shoalingFactor) * distDamp;

        vec3 tangent = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);
        vec3 disp = vec3(0.0);

        // LAYER 1: Large-Scale Open-Ocean Swell
        disp += gerstnerWaveDisrupted(vec4( 0.94,  0.34, 0.062, 68.0), warpedXZ1, phaseWarp1, envelope1, tangent, binormal);
        disp += gerstnerWaveDisrupted(vec4(-0.67,  0.74, 0.052, 43.0), warpedXZ1, -phaseWarp1 * 0.85, envelope1, tangent, binormal);
        disp += gerstnerWaveDisrupted(vec4( 0.12, -0.99, 0.045, 29.5), warpedXZ1, phaseWarp1 * 1.15, envelope1, tangent, binormal);
        disp += gerstnerWaveDisrupted(vec4( 0.79, -0.61, 0.038, 19.8), warpedXZ1, phaseWarp2 * 0.75, envelope1, tangent, binormal);

        // LAYER 2: Secondary Mesoscale Cross-Chop Layer
        disp += gerstnerWaveDisrupted(vec4(-0.91, -0.41, 0.034, 12.4), warpedXZ2, phaseWarp2, envelope2, tangent, binormal);
        disp += gerstnerWaveDisrupted(vec4( 0.46,  0.88, 0.028,  7.6), warpedXZ2, -phaseWarp2 * 1.1, envelope2, tangent, binormal);
        disp += gerstnerWaveDisrupted(vec4(-0.29,  0.95, 0.024,  4.7), warpedXZ2, phaseWarp1 + phaseWarp2, envelope2, tangent, binormal);
        disp += gerstnerWaveDisrupted(vec4( 0.85,  0.52, 0.018,  2.9), warpedXZ2, -phaseWarp1, envelope2, tangent, binormal);

        vec3 displacedWorld = worldInitial.xyz + disp;
        vWorldPos = displacedWorld;
        vNormal = normalize(cross(binormal, tangent));
        vWaveHeight = disp.y;

        float jacobian = 1.0 - vNormal.y;
        vFoamCrest = smoothstep(0.045, 0.18, jacobian * nMeso * nMacro * 2.1) * shoalingFactor;

        gl_Position = projectionMatrix * viewMatrix * vec4(displacedWorld, 1.0);
    }
`;

const OCEAN_FRAGMENT_SHADER = `
    uniform float uTime;
    uniform float uWaveScale;
    uniform float uCloudCoverage;
    uniform float uCumulusCoverage;
    uniform float uCumulusSeed;
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyTopColor;
    uniform vec3 uSkyHorizonColor;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vFoamCrest;
    varying float vWaveHeight;
    varying float vSeabedY;

    float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
        );
    }

    float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p = rot * p * 2.03 + vec2(17.1, 13.7);
            a *= 0.5;
        }
        return v;
    }

    ${CUMULUS_DENSITY_GLSL}

    float seabedRidgeMask(vec2 p, vec2 start, vec2 end) {
        vec2 axis = end - start;
        float t = clamp(dot(p - start, axis) / dot(axis, axis), 0.0, 1.0);
        float distanceToRidge = length(p - (start + axis * t));
        float ridgeWidth = 120.0 + 35.0 * sin(p.x * 0.007 + p.y * 0.004)
                          + 24.0 * sin(p.y * 0.013 - p.x * 0.009);
        float edgeWobble = 20.0 * sin(p.x * 0.012 + p.y * 0.008)
                         + 12.0 * sin(p.y * 0.014 - p.x * 0.009);
        float organicDistance = max(0.0, distanceToRidge + edgeWobble);
        return 1.0 - smoothstep(ridgeWidth * 0.22, ridgeWidth * 1.85, organicDistance);
    }

    float getExactSeabedHeight(vec2 p) {
        float angle = atan(p.y, p.x);
        float rMain = length(p);
        float coastWave = sin(angle * 3.0 + 0.8) * 16.5 + cos(angle * 2.0 - 0.5) * 22.0 + sin(angle * 5.0) * 6.2;
        float effectiveR = rMain + coastWave;

        vec2 dSpit = p - vec2(138.0, 44.0);
        float rSpit = sqrt(dSpit.x * dSpit.x * 0.42 + dSpit.y * dSpit.y * 1.32);

        vec2 dCove = p + vec2(92.0, -52.0);
        float rCove = sqrt(dCove.x * dCove.x * 0.85 + dCove.y * dCove.y * 0.75);

        float mainMound = 9.35 * exp(-(effectiveR * effectiveR) / (112.0 * 112.0));
        float spitMound = 4.65 * exp(-(rSpit * rSpit) / (82.0 * 82.0));
        float coveMound = 4.25 * exp(-(rCove * rCove) / (68.0 * 68.0));
        float lagoonAtollPlatform = 7.45 * exp(-pow(rMain / 370.0, 2.6));
        float duneDetail = (fbm(p * 0.018) - 0.5) * 1.65 * exp(-(rMain * rMain) / (195.0 * 195.0));
        float reefDetail = (fbm(p * 0.014 + vec2(11.3, -7.9)) - 0.5) * 1.25 * (1.0 - exp(-(rMain * rMain) / (110.0 * 110.0)));

        // Distant Island, moved twice as far from the main atoll.
        vec2 dDist = p - vec2(-260.0, -1020.0);
        float rotDistX = dDist.x * 0.92 - dDist.y * 0.38;
        float rotDistZ = dDist.x * 0.38 + dDist.y * 0.92;
        float rDistLand = sqrt((rotDistX * 0.72) * (rotDistX * 0.72) + (rotDistZ * 1.45) * (rotDistZ * 1.45));
        float distIslandMound = 11.2 * exp(-(rDistLand * rDistLand) / (46.0 * 46.0));
        float rDistLagoon = sqrt((rotDistX * 0.58) * (rotDistX * 0.58) + (rotDistZ * 1.05) * (rotDistZ * 1.05));
        float distLagoonShelf = 7.8 * exp(-pow(rDistLagoon / 125.0, 3.0));

        vec2 dSeabed3 = p - vec2(-650.0, -1350.0);
        float seabed3RotX = dSeabed3.x * 0.92 - dSeabed3.y * 0.38;
        float seabed3RotZ = dSeabed3.x * 0.38 + dSeabed3.y * 0.92;
        float seabed3Land = sqrt((seabed3RotX * 0.72) * (seabed3RotX * 0.72) + (seabed3RotZ * 1.45) * (seabed3RotZ * 1.45));
        float seabed3Shelf = sqrt((seabed3RotX * 0.58) * (seabed3RotX * 0.58) + (seabed3RotZ * 1.05) * (seabed3RotZ * 1.05));
        float seabed3Mound = 5.4 * exp(-(seabed3Land * seabed3Land) / (62.0 * 62.0)) + 2.5 * exp(-pow(seabed3Shelf / 145.0, 3.0));

        vec2 dSeabed4 = p - vec2(-1120.0, -1570.0);
        float seabed4RotX = dSeabed4.x * 0.92 - dSeabed4.y * 0.38;
        float seabed4RotZ = dSeabed4.x * 0.38 + dSeabed4.y * 0.92;
        float seabed4Land = sqrt((seabed4RotX * 0.72) * (seabed4RotX * 0.72) + (seabed4RotZ * 1.45) * (seabed4RotZ * 1.45));
        float seabed4Shelf = sqrt((seabed4RotX * 0.58) * (seabed4RotX * 0.58) + (seabed4RotZ * 1.05) * (seabed4RotZ * 1.05));
        float seabed4Mound = 5.4 * exp(-(seabed4Land * seabed4Land) / (62.0 * 62.0)) + 2.5 * exp(-pow(seabed4Shelf / 145.0, 3.0));

        float h = -9.2 + mainMound + spitMound + coveMound + lagoonAtollPlatform + duneDetail + reefDetail + distIslandMound + distLagoonShelf + seabed3Mound + seabed4Mound;
        vec2 residentialOffset = p + vec2(96.0, 214.0);
        float residentialAlong = dot(residentialOffset, vec2(-0.39, -0.92));
        float residentialAcross = dot(residentialOffset, vec2(0.92, -0.39));
        float residentialRadius = length(vec2(residentialAlong / 155.0, residentialAcross / 75.0));
        float residentialShelf = 1.0 - smoothstep(0.72, 1.0, residentialRadius);
        float residentialBedTarget = mix(-2.2, -1.1, smoothstep(-10.0, 50.0, residentialAlong));
        h = max(h, mix(h, residentialBedTarget, residentialShelf));
        float ridgeMask = 0.0;
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(0.0, -100.0), vec2(-110.0, -190.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-110.0, -190.0), vec2(-250.0, -300.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-250.0, -300.0), vec2(-420.0, -430.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-420.0, -430.0), vec2(-590.0, -570.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-590.0, -570.0), vec2(-720.0, -720.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-720.0, -720.0), vec2(-760.0, -850.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-760.0, -850.0), vec2(-690.0, -950.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-690.0, -950.0), vec2(-520.0, -1000.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-520.0, -1000.0), vec2(-260.0, -1020.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-260.0, -1020.0), vec2(-380.0, -1060.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-380.0, -1060.0), vec2(-530.0, -1130.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-530.0, -1130.0), vec2(-670.0, -1220.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-670.0, -1220.0), vec2(-760.0, -1310.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-760.0, -1310.0), vec2(-650.0, -1350.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-650.0, -1350.0), vec2(-800.0, -1410.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-800.0, -1410.0), vec2(-930.0, -1470.0)));
        ridgeMask = max(ridgeMask, seabedRidgeMask(p, vec2(-930.0, -1470.0), vec2(-1120.0, -1570.0)));
        float ridgeBedTarget = -4.4 + 0.45 * sin(p.x * 0.008 + sin(p.y * 0.006) * 1.5) + 0.2 * sin(p.y * 0.015 - p.x * 0.01);
        h = max(h, mix(h, ridgeBedTarget, ridgeMask));
        if (h > 1.95) {
            h = 1.95 + (h - 1.95) * 0.36;
        }
        return h;
    }

    // Sharp directional trochoidal wave-chop + capillary ripple heightfield for realistic faceted water reflections
    float waveChopOctave(vec2 p, vec2 dir, float freq, float speed) {
        float phase = dot(p, dir) * freq + uTime * speed;
        float s = sin(phase) * 0.5 + 0.5;
        return pow(s, 1.65);
    }

    float sampleMultiScaleWaveSurface(vec2 pos, float mediumFade, float fineFade) {
        // Both octaves fade to zero beyond their distance limits, so skip all noise work in that case
        if (mediumFade <= 0.0 && fineFade <= 0.0) return 0.0;

        // Non-repeating domain warp
        vec2 warp = vec2(
            noise(pos * 0.045 + vec2(uTime * 0.05, -uTime * 0.04)),
            noise(pos * 0.045 + vec2(19.3 - uTime * 0.04, 7.1 + uTime * 0.05))
        ) - 0.5;
        vec2 wp = pos + warp * 4.2;

        // Scale 1: Directional wind-driven wave chop (creates distinct shimmering water facets)
        float h1 = 0.0;
        if (mediumFade > 0.0) {
            h1 += waveChopOctave(wp, vec2(0.88, 0.47), 0.42, 1.45) * 0.42;
            h1 += waveChopOctave(wp, vec2(-0.53, 0.85), 0.68, -1.75) * 0.32;
            h1 += waveChopOctave(wp, vec2(0.31, -0.95), 1.15, 2.20) * 0.26;
            h1 += (fbm(wp * 0.28 + vec2(uTime * 0.22, -uTime * 0.16)) - 0.5) * 0.55;
        }

        // Scale 2: Fine capillary ripples at a much higher spatial frequency
        mat2 rot = mat2(0.60, 0.80, -0.80, 0.60);
        vec2 wpFine = rot * pos + warp * 1.1;
        float h2 = 0.0;
        if (fineFade > 0.0) {
            h2 += (fbm(wpFine * 1.65 + vec2(uTime * 0.68, uTime * 0.45)) - 0.5) * 0.55;
            h2 += (fbm(wpFine * 3.80 - vec2(uTime * 0.85, -uTime * 0.62)) - 0.5) * 0.45;
        }

        float gustEnvelope = 0.55 + 0.45 * noise(pos * 0.022 - vec2(uTime * 0.04, uTime * 0.02));
        return h1 * mediumFade + h2 * 0.36 * gustEnvelope * fineFade;
    }

    vec3 getHighDetailWaveNormal(vec2 pos, float camDist) {
        float mediumFade = 1.0 - smoothstep(18.0, 420.0, camDist);
        float fineFade   = 1.0 - smoothstep(5.0, 160.0, camDist);
        if (mediumFade <= 0.0) return vec3(0.0, 1.0, 0.0); // beyond the medium fade distance all wave terms are zero
        float eps = mix(0.06, 0.24, clamp(camDist / 240.0, 0.0, 1.0));

        float h0 = sampleMultiScaleWaveSurface(pos, mediumFade, fineFade);
        float hx = sampleMultiScaleWaveSurface(pos + vec2(eps, 0.0), mediumFade, fineFade);
        float hz = sampleMultiScaleWaveSurface(pos + vec2(0.0, eps), mediumFade, fineFade);

        float normalStrength = (0.38 + 0.18 * uWaveScale) * (0.32 + 0.68 * mediumFade);
        return normalize(vec3((h0 - hx) * normalStrength / eps, 1.0, (h0 - hz) * normalStrength / eps));
    }

    void main() {
        vec3 viewVec = cameraPosition - vWorldPos;
        float camDist = length(viewVec);
        vec3 V = viewVec / camDist;

        // Bathymetry test first: pixels over land or beyond the shoreline exit before any wave work
        float seabedY = vSeabedY;
        float waterDepth = vWorldPos.y - seabedY;
        if (waterDepth < -0.18) discard;
        float clampedDepth = max(0.0, waterDepth);

        // Crisp multi-scale surface normal so water shows realistic individual wave facets all the way to the mid-ground
        vec3 detailN = getHighDetailWaveNormal(vWorldPos.xz, camDist);
        float macroFade = 1.0 - smoothstep(15.0, 480.0, camDist);
        vec3 N = normalize(mix(vec3(0.0, 1.0, 0.0), vNormal, macroFade * 0.92) + vec3(detailN.x, 0.0, detailN.z) * 0.95);
        float sunAlt = uSunDir.y;
        float dayBrightness = smoothstep(-0.14, 0.25, sunAlt);
        float twilight = smoothstep(-0.20, 0.06, sunAlt) * (1.0 - smoothstep(0.05, 0.35, sunAlt));

        vec3 activeLightDir = sunAlt > 0.0 ? uSunDir : uMoonDir;

        // Refracted seabed coordinate using the wave surface normal (eliminates artificial grid caustics!)
        vec2 refractedXZ = vWorldPos.xz - N.xz * clamp(clampedDepth * 0.45, 0.08, 1.4);

        // Vibrant Submerged Coral Reef Bommies, Rainbow Bio-Herms & Sand Channels inside the Maldives Lagoon
        float coralNoise = fbm(refractedXZ * 0.11) * 0.65 + noise(refractedXZ * 0.38) * 0.35;
        float coralBioHue = noise(refractedXZ * 0.24 + vec2(7.3, -4.1));
        float coralPatchMask = smoothstep(0.46, 0.66, coralNoise) * smoothstep(0.35, 1.35, clampedDepth) * (1.0 - smoothstep(4.2, 7.8, clampedDepth));

        // Photorealistic Maldives Atoll Color Palette with living coral accents
        vec3 submergedSandCol = vec3(0.78, 0.74, 0.62);
        vec3 aquaLagoonCol    = vec3(0.03, 0.64, 0.70);
        vec3 coralReefCol     = mix(vec3(0.04, 0.18, 0.24), vec3(0.28, 0.16, 0.22), smoothstep(0.45, 0.75, coralBioHue));
        vec3 outerReefBlue    = vec3(0.015, 0.24, 0.48);
        vec3 deepPelagicBlue  = vec3(0.005, 0.055, 0.18);

        // Fine, high-frequency optical caustics refracted onto the shallow sandy floor
        float c1 = noise(refractedXZ * 3.8 + vec2(uTime * 0.65, -uTime * 0.45));
        float c2 = noise(refractedXZ * 4.4 - vec2(uTime * 0.52,  uTime * 0.70));
        float fineCaustics = pow(clamp(1.0 - abs(c1 - c2) * 2.2, 0.0, 1.0), 4.0);
        float causticWeight = smoothstep(0.02, 0.25, clampedDepth) * (1.0 - smoothstep(1.2, 3.6, clampedDepth)) * (1.0 - coralPatchMask * 0.8) * dayBrightness;

        // Beer-Lambert optical depth absorption transitions
        float absorbShore  = 1.0 - exp(-clampedDepth * 1.35);
        float absorbLagoon = smoothstep(1.8, 5.2, clampedDepth);
        float absorbDeep   = smoothstep(4.5, 9.2, clampedDepth);

        vec3 seabedFloor = mix(submergedSandCol, coralReefCol, coralPatchMask * 0.82);
        seabedFloor += vec3(0.22, 0.58, 0.56) * fineCaustics * causticWeight * 0.42;

        vec3 waterBody = mix(seabedFloor, aquaLagoonCol, absorbShore);
        waterBody = mix(waterBody, coralReefCol, coralPatchMask * 0.55);
        waterBody = mix(waterBody, outerReefBlue, absorbLagoon);
        waterBody = mix(waterBody, deepPelagicBlue, absorbDeep);

        float ambientLum = mix(0.12, 0.90, dayBrightness) + twilight * 0.16;
        waterBody *= ambientLum;

        // Subsurface Scattering (SSS) through backlit turquoise wave crests
        float backLight = pow(max(0.0, dot(V, -activeLightDir + N * 0.5)), 3.2);
        float slopeFactor = clamp(length(N.xz) * 1.8, 0.0, 1.0);
        float crestFactor = (smoothstep(0.0, 0.42, vWaveHeight) * 0.6 + slopeFactor * 0.4) * macroFade;
        vec3 sssColor = mix(vec3(0.04, 0.68, 0.62), vec3(0.95, 0.45, 0.18), twilight * 0.7);
        vec3 sssContribution = sssColor * (backLight * 0.75 + 0.25) * crestFactor * (0.2 + 0.8 * dayBrightness) * 0.35;

        // Physically based Schlick Fresnel with sky-gradient reflections on wave facets
        float NdotV = max(dot(N, V), 0.001);
        float maxFresnel = mix(1.0, 0.84, macroFade);
        float fresnel = 0.02 + (maxFresnel - 0.02) * pow(1.0 - NdotV, 4.5);

        vec3 R = reflect(-V, N);
        float reflY = clamp(R.y, 0.0, 1.0);
        vec3 skyReflection = mix(uSkyHorizonColor, uSkyTopColor, pow(reflY, 0.58));

        // Raymarch the same cumulus density field as the sky along the reflected view ray.
        if (fresnel > 0.04 && reflY > 0.002 && reflY < 0.999 && uCumulusCoverage > 0.01) {
            float tMin, tMax;
            if (getCloudRayBounds(vWorldPos, R, 1350.0, 320.0, 28.0, 560.0, tMin, tMax)) {
                const int REFLECTION_STEPS = 40;
                float stepSize = (tMax - tMin) / float(REFLECTION_STEPS);
                float dither = hash(gl_FragCoord.xy);
                float tRay = tMin + mix(0.5, dither, 0.25) * stepSize;
                vec3 accumColor = vec3(0.0);
                float transmittance = 1.0;

                vec3 towerSunTop = mix(vec3(0.14, 0.22, 0.38), vec3(1.0, 0.99, 0.98), dayBrightness);
                towerSunTop = mix(towerSunTop, vec3(1.0, 0.56, 0.26), twilight * 0.95);
                vec3 towerMidShadow = mix(vec3(0.04, 0.07, 0.15), vec3(0.50, 0.65, 0.84), dayBrightness);
                towerMidShadow = mix(towerMidShadow, vec3(0.45, 0.24, 0.38), twilight * 0.90);
                vec3 towerDarkBase = mix(vec3(0.015, 0.03, 0.07), vec3(0.24, 0.36, 0.54), dayBrightness);
                towerDarkBase = mix(towerDarkBase, vec3(0.20, 0.11, 0.24), twilight * 0.92);

                for (int i = 0; i < REFLECTION_STEPS; i++) {
                    if (transmittance < 0.025 || tRay > tMax) break;
                    float hFrac, towerCore;
                    float density = sampleGiantCumulus3D(vWorldPos + R * tRay, hFrac, towerCore);
                    if (density > 0.008) {
                        float baseDarkening = smoothstep(0.0, 0.26, hFrac);
                        vec3 ambientVoxel = mix(towerDarkBase, towerMidShadow, baseDarkening);
                        vec3 voxelColor = mix(ambientVoxel, towerSunTop, clamp(0.68 + hFrac * 0.18, 0.0, 1.0));
                        float stepAlpha = 1.0 - exp(-density * stepSize * 0.024);
                        accumColor += transmittance * voxelColor * stepAlpha;
                        transmittance *= (1.0 - stepAlpha);
                    }
                    tRay += stepSize;
                }

                float cloudAlpha = (1.0 - transmittance) * smoothstep(0.002, 0.022, reflY);
                if (cloudAlpha > 0.001) {
                    vec3 reflectedCloud = accumColor / max(1.0 - transmittance, 0.0001);
                    skyReflection = mix(skyReflection, reflectedCloud, cloudAlpha);
                }
            }
        }

        float sunVisibility = smoothstep(-0.08, 0.06, sunAlt);
        float moonVisibility = smoothstep(-0.08, 0.06, uMoonDir.y) * (1.0 - dayBrightness);
        vec3 moonLightColor = vec3(0.48, 0.68, 1.0) * 0.55;
        float sunReflAlign = max(dot(R, uSunDir), 0.0);
        float moonReflAlign = max(dot(R, uMoonDir), 0.0);
        skyReflection += uSunColor * pow(sunReflAlign, 16.0) * sunVisibility * (0.28 + 0.52 * twilight);
        skyReflection += moonLightColor * pow(moonReflAlign, 16.0) * moonVisibility * 0.72;

        vec3 surfaceColor = mix(waterBody + sssContribution, skyReflection, fresnel);

        // Glittering Sun & Moon Specular Glints across individual water facets
        vec3 sunH = normalize(uSunDir + V);
        vec3 moonH = normalize(uMoonDir + V);
        float sunNdotH = max(dot(N, sunH), 0.0);
        float moonNdotH = max(dot(N, moonH), 0.0);
        float sunSpec = (pow(sunNdotH, 90.0) * 0.32 + pow(sunNdotH, 750.0) * 6.5) * macroFade * sunVisibility;
        float moonSpec = (pow(moonNdotH, 90.0) * 0.32 + pow(moonNdotH, 750.0) * 6.5) * macroFade * moonVisibility;
        surfaceColor += uSunColor * sunSpec + moonLightColor * moonSpec;
        float distantSunReflection = pow(sunReflAlign, 64.0) * sunVisibility
                                  * (1.0 - macroFade) * (0.55 + 0.65 * twilight);

        // Realistic Lacy Shoreline Swash Foam & Breaking Wave Lace
        float foamFbm = fbm(vWorldPos.xz * 2.2 + N.xz * 1.4 + vec2(uTime * 0.28, -uTime * 0.22));
        float foamBubbles = noise(vWorldPos.xz * 9.5 - vec2(uTime * 0.45, uTime * 0.30));
        float swashPulse = sin(clampedDepth * 9.5 - uTime * 2.6 + foamFbm * 5.2);

        float waterEdgeFoam = smoothstep(0.22, 0.0, clampedDepth) * smoothstep(0.25, 0.72, foamFbm * 0.65 + foamBubbles * 0.35);
        float breakingRippleFoam = smoothstep(0.95, 0.04, clampedDepth) * smoothstep(0.48, 0.86, swashPulse * 0.5 + foamFbm * 0.6) * (0.45 + 0.55 * foamBubbles);

        float highSwellFactor = smoothstep(0.95, 1.9, uWaveScale);
        float whitecapMask = smoothstep(0.45, 0.85, vFoamCrest * (0.5 + 0.7 * foamFbm)) * smoothstep(2.5, 7.0, clampedDepth) * macroFade * highSwellFactor;
        float totalFoam = clamp(waterEdgeFoam * 0.88 + breakingRippleFoam * 0.62 + whitecapMask * 0.55, 0.0, 0.92);

        vec3 foamColor = mix(vec3(0.14, 0.20, 0.30), vec3(0.92, 0.95, 0.98), dayBrightness);
        foamColor = mix(foamColor, vec3(0.92, 0.60, 0.46), twilight * 0.75);
        surfaceColor = mix(surfaceColor, foamColor, totalFoam);

        surfaceColor += uSunColor * distantSunReflection * 1.8;
        float horizonAtmosphere = (1.0 - smoothstep(0.0, 0.055, NdotV)) * 0.35;
        surfaceColor = mix(surfaceColor, uSkyHorizonColor, horizonAtmosphere);

        // Keep distant water up to the visual horizon, even from elevated viewpoints.
        float horizonEdgeBlend = smoothstep(50000.0, 200000.0, camDist);
        float horizonFade = horizonEdgeBlend;

        // Semi-transparent crystal-clear lagoon water in the shallows so 3D underwater corals & swimming marine life are visible!
        float underwaterVisibility = mix(0.66, 0.97, clamp(clampedDepth / 4.2, 0.0, 1.0));
        float shoreAlpha = smoothstep(-0.12, 0.08, waterDepth) * mix(underwaterVisibility, 1.0, clamp(fresnel * 1.2 + totalFoam, 0.0, 1.0));
        shoreAlpha = max(shoreAlpha, distantSunReflection * 0.8) * (1.0 - horizonFade);

        gl_FragColor = vec4(surfaceColor, shoreAlpha);
    }
`;
