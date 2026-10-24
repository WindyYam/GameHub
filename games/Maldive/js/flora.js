// ============================================================================
// 5. PROCEDURAL PALM TREES, STRONG WIND SWAY & TROPICAL FLORA
// ============================================================================
function createPalmLeafMaterial(isPalmFrond = true) {
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.48,
        metalness: 0.02,
        vertexColors: true,
        side: THREE.DoubleSide,
        alphaTest: 0.0
    });

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uSunDir = { value: STATE.sunDirection };
        shader.uniforms.uIsPalmFrond = { value: isPalmFrond ? 1.0 : 0.0 };
        mat.userData.shader = shader;

        shader.vertexShader = `
            uniform float uTime;
            varying vec2 vLeafUV;
            varying vec3 vLeafWorldPos;
            #ifdef USE_INSTANCING
            attribute vec3 aTreeOrigin;
            #endif
        ` + shader.vertexShader.replace(
            '#include <uv_vertex>',
            `#include <uv_vertex>
            vLeafUV = uv;`
        ).replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
            vec4 wPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
            float treePhase = aTreeOrigin.x * 0.09 + aTreeOrigin.y * 0.07;
            float treeScale = aTreeOrigin.z;
            #else
            vec4 wPos = modelMatrix * vec4(transformed, 1.0);
            float treePhase = wPos.x * 0.09 + wPos.z * 0.07;
            float treeScale = 1.0;
            #endif
            vLeafWorldPos = wPos.xyz;
            float distFromCrown = length(transformed.xz);

            // Strong prevailing trade-wind gusts + high-frequency leaflet flutter
            float strongGust = sin(uTime * 2.1 + treePhase) * 0.55
                             + sin(uTime * 0.95 - treePhase * 0.6) * 0.35
                             + 0.42;
            float whipTurbulence = sin(uTime * 5.8 + wPos.x * 0.45 + wPos.z * 0.35 + distFromCrown * 0.9) * 0.24
                                 + cos(uTime * 9.2 + distFromCrown * 1.8) * 0.10;

            float flexFactor = pow(distFromCrown * 0.24, 1.45);
            transformed.y += (strongGust * 0.45 + whipTurbulence) * flexFactor;
            transformed.x += (strongGust * 0.75 + whipTurbulence * 0.5) * flexFactor;
            transformed.z += (strongGust * 0.32 + whipTurbulence * 0.35) * flexFactor;

            // Sync crown base translation with the bending palm trunk top in strong wind
            float crownSwayX = (sin(uTime * 1.85 + treePhase) * 0.48 + 0.38) * 0.52;
            float crownSwayZ = (cos(uTime * 1.45 + treePhase * 0.8) * 0.30 + 0.18) * 0.52;
            float crownSwayY = -(abs(crownSwayX) + abs(crownSwayZ)) * 0.08;
            vec3 worldCrownSway = vec3(crownSwayX, crownSwayY, crownSwayZ) * treeScale;

            #ifdef USE_INSTANCING
            vec3 axisX = normalize(instanceMatrix[0].xyz);
            vec3 axisY = normalize(instanceMatrix[1].xyz);
            vec3 axisZ = normalize(instanceMatrix[2].xyz);
            vec3 crownLocalSway = vec3(
                dot(worldCrownSway, axisX),
                dot(worldCrownSway, axisY),
                dot(worldCrownSway, axisZ)
            ) / max(0.001, treeScale);
            transformed += crownLocalSway;
            #else
            transformed += worldCrownSway / max(0.001, treeScale);
            #endif
            `
        );

        shader.fragmentShader = `
            uniform float uIsPalmFrond;
            uniform vec3 uSunDir;
            varying vec2 vLeafUV;
            varying vec3 vLeafWorldPos;
        ` + shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            if (uIsPalmFrond > 0.5) {
                // Procedural alpha-cutout pinnae leaflets so every palm frond is composed of ~48 crisp individual leaflets
                float sideX = abs(vLeafUV.x - 0.5) * 2.0;
                float alongZ = clamp(vLeafUV.y, 0.0, 1.0);

                // Central woody rachis spine tapers from base to tip
                float rachisWidth = mix(0.085, 0.014, alongZ);
                if (sideX > rachisWidth) {
                    // Angle individual leaflets forward toward the frond tip
                    float leafletPhase = fract(alongZ * 42.0 - pow(sideX, 0.85) * 3.4);
                    float leafletCenterDist = abs(leafletPhase - 0.5) * 2.0;

                    // Taper each individual leaflet to a sharp botanical point at its outer tip
                    float normSpan = clamp((sideX - rachisWidth) / max(0.05, 1.0 - rachisWidth), 0.0, 1.0);
                    float maxLeafWidth = (1.0 - pow(normSpan, 1.45)) * 0.82;

                    if (leafletCenterDist > maxLeafWidth || alongZ > 0.985) {
                        discard;
                    }

                    // Subtle V-fold shading along each individual leaflet rib
                    float ribShade = 0.82 + 0.26 * (1.0 - leafletCenterDist / max(0.01, maxLeafWidth));
                    diffuseColor.rgb *= ribShade;
                } else {
                    // Woody yellowish-green central petiole/rachis stem
                    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.34, 0.14), 0.65);
                }
            }

            // Botanical translucent subsurface scattering when backlit by the sun
            vec3 viewDir = normalize(cameraPosition - vLeafWorldPos);
            float backScatter = pow(max(0.0, dot(viewDir, -uSunDir)), 2.5) * max(0.0, uSunDir.y);
            diffuseColor.rgb += vec3(0.26, 0.42, 0.08) * (0.25 + 0.75 * backScatter) * max(0.0, uSunDir.y) * 0.45;
            `
        );
    };

    frondMaterials.push(mat);
    return mat;
}

function createWindTrunkMaterial() {
    const trunkMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.0,
        vertexColors: true
    });

    trunkMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        trunkMat.userData.shader = shader;

        shader.vertexShader = `
            uniform float uTime;
        ` + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vec4 wPos = modelMatrix * vec4(transformed, 1.0);
            float hNorm = clamp(transformed.y / 9.4, 0.0, 1.0);
            float bendFactor = pow(hNorm, 1.85);
            float treePhase = (modelMatrix[3].x) * 0.09 + (modelMatrix[3].z) * 0.07;

            float swayX = (sin(uTime * 1.85 + treePhase) * 0.48 + 0.38) * 0.52;
            float swayZ = (cos(uTime * 1.45 + treePhase * 0.8) * 0.30 + 0.18) * 0.52;
            transformed.x += swayX * bendFactor;
            transformed.z += swayZ * bendFactor;
            transformed.y -= (abs(swayX) + abs(swayZ)) * 0.08 * bendFactor;
            `
        );
    };

    trunkMaterials.push(trunkMat);
    return trunkMat;
}

function buildPalmFrondGeometry() {
    const length = 5.5;
    const segmentsL = 14;
    const segmentsW = 4;
    const geo = new THREE.PlaneGeometry(1.65, length, segmentsW, segmentsL);
    geo.translate(0, length / 2, 0);
    geo.rotateX(Math.PI / 2); // Extend outward along +Z

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);

        const t = Math.max(0.0, Math.min(1.0, z / length));
        const widthProfile = Math.sin(Math.pow(t, 0.58) * Math.PI) * (1.0 - t * 0.14);
        const edgeFactor = Math.abs(x) / 0.825;

        x *= widthProfile;
        // Graceful arching coconut frond profile with natural drooping pinnae tips
        y = Math.sin(t * Math.PI * 0.65) * 0.82 - Math.pow(t, 2.05) * 2.15 - Math.pow(edgeFactor, 1.35) * 0.38;

        pos.setXYZ(i, x, y, z);

        // Rich, sunlit tropical palm chlorophyll greens with warm golden-olive tips
        const crownAO = smoothstep(0.0, 0.22, t);
        const tipSunWarmth = smoothstep(0.65, 1.0, t);
        const spineHighlight = 1.0 - smoothstep(0.0, 0.25, edgeFactor);

        const r = 0.085 + 0.145 * crownAO + 0.110 * tipSunWarmth + 0.045 * spineHighlight;
        const g = 0.175 + 0.265 * crownAO + 0.045 * tipSunWarmth + 0.065 * spineHighlight;
        const b = 0.035 + 0.065 * crownAO - 0.015 * tipSunWarmth + 0.015 * spineHighlight;

        colors[i * 3]     = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
}

const sharedTrunkMat = createWindTrunkMaterial();
const sharedFrondGeo = buildPalmFrondGeometry();
const sharedFrondMat = createPalmLeafMaterial(true);

function createCoconutMaterial(color, roughness) {
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: roughness,
        metalness: 0.04
    });

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        mat.userData.shader = shader;

        shader.vertexShader = `
            uniform float uTime;
            #ifdef USE_INSTANCING
            attribute vec3 aTreeOrigin;
            #endif
        ` + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
            float treePhase = aTreeOrigin.x * 0.09 + aTreeOrigin.y * 0.07;
            float treeScale = aTreeOrigin.z;
            #else
            float treePhase = modelMatrix[3].x * 0.09 + modelMatrix[3].z * 0.07;
            float treeScale = length(modelMatrix[0].xyz);
            #endif

            // Exact sway displacement matching the top of the palm trunk
            float swayX = (sin(uTime * 1.85 + treePhase) * 0.48 + 0.38) * 0.52;
            float swayZ = (cos(uTime * 1.45 + treePhase * 0.8) * 0.30 + 0.18) * 0.52;
            float swayY = -(abs(swayX) + abs(swayZ)) * 0.08;

            // Subtle natural coconut bunch pendulum dangle
            float cocoDangleX = sin(uTime * 3.7 + treePhase * 2.1 + transformed.x * 5.0) * 0.022;
            float cocoDangleZ = cos(uTime * 3.3 + treePhase * 1.7 + transformed.z * 5.0) * 0.022;

            vec3 worldSway = vec3(swayX + cocoDangleX, swayY, swayZ + cocoDangleZ) * treeScale;

            #ifdef USE_INSTANCING
            // Un-rotate the world sway into instance local space so that when instanceMatrix
            // is applied, the coconut translates precisely by worldSway in world space:
            // instanceMatrix * (transformed + localSway) = instanceMatrix * transformed + worldSway
            vec3 axisX = normalize(instanceMatrix[0].xyz);
            vec3 axisY = normalize(instanceMatrix[1].xyz);
            vec3 axisZ = normalize(instanceMatrix[2].xyz);
            vec3 localSway = vec3(
                dot(worldSway, axisX),
                dot(worldSway, axisY),
                dot(worldSway, axisZ)
            ) / max(0.001, treeScale);
            transformed += localSway;
            #else
            transformed += worldSway / max(0.001, treeScale);
            #endif
            `
        );
    };

    const depthMat = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking
    });
    depthMat.onBeforeCompile = mat.onBeforeCompile;
    mat.customDepthMaterial = depthMat;

    cocoMaterials.push(mat);
    cocoMaterials.push(depthMat);
    return mat;
}

// Shared coconut geometry and materials (one batch per colour for all palms)
const sharedCocoGeo = new THREE.SphereGeometry(0.19, 8, 8);
const sharedCocoMats = [
    createCoconutMaterial(0x5c441e, 0.65),
    createCoconutMaterial(0x657c24, 0.45)
];

function isNearCampOrCabin(x, z, clearance = 14.0) {
    const fireDx = x - CAMPFIRE_POS.x;
    const fireDz = z - CAMPFIRE_POS.z;
    const cabDx = x - CABIN_SITE.x;
    const cabDz = z - CABIN_SITE.z;
    const cabinRadius = clearance + 6.5;
    return (fireDx * fireDx + fireDz * fireDz < clearance * clearance) ||
           (cabDx * cabDx + cabDz * cabDz < cabinRadius * cabinRadius);
}

function createPalmTree(x, z, scale, leanAngle, leanAmount, heightMultiplier = 1.0) {
    const groundY = getIslandHeight(x, z);
    if (groundY < 0.26 || isNearCampOrCabin(x, z, 18.0)) return;

    treeLocations.push({ x, z });

    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, groundY - 0.15, z);
    treeGroup.scale.setScalar(scale);

    // Variable trunk height ranging from young palms to towering ancient royal coconut trees
    const height = 9.4 * heightMultiplier;
    const trunkSegs = 28;
    const radSegs = 12;
    const topRad = 0.12 * Math.pow(heightMultiplier, 0.25);
    const botRad = 0.42 * Math.pow(heightMultiplier, 0.35);
    const trunkGeo = new THREE.CylinderGeometry(topRad, botRad, height, radSegs, trunkSegs, false);
    trunkGeo.translate(0, height / 2, 0);

    const pos = trunkGeo.attributes.position;
    const trunkColors = new Float32Array(pos.count * 3);
    const dirX = Math.cos(leanAngle);
    const dirZ = Math.sin(leanAngle);

    for (let i = 0; i < pos.count; i++) {
        let vx = pos.getX(i);
        let vy = pos.getY(i);
        let vz = pos.getZ(i);

        const t = Math.max(0.0, Math.min(1.0, vy / height));
        // Graceful S-curve / J-curve coastal coconut trunk profile
        const bend = (Math.pow(t, 1.65) + 0.15 * Math.sin(t * Math.PI)) * leanAmount;
        const ringWave = Math.sin(t * 95.0 * heightMultiplier);
        const rootFlare = (1.0 - smoothstep(0.0, 0.14, t)) * 0.28;
        const ringBulge = 1.0 + 0.048 * ringWave + rootFlare;

        vx = vx * ringBulge + dirX * bend;
        vz = vz * ringBulge + dirZ * bend;
        vy = vy - Math.pow(t, 2.2) * (leanAmount * 0.16);

        pos.setXYZ(i, vx, vy, vz);

        const endAO = (0.65 + 0.35 * smoothstep(0.0, 0.14, t)) * (1.0 - 0.38 * smoothstep(0.84, 1.0, t));
        const barkNoise = valueNoise2D(vx * 8.0 + x, vy * 3.5 + z);
        const ringShade = endAO * (0.78 + 0.22 * ringWave) * (0.85 + 0.30 * barkNoise);
        trunkColors[i * 3]     = ringShade * 0.46;
        trunkColors[i * 3 + 1] = ringShade * 0.41;
        trunkColors[i * 3 + 2] = ringShade * 0.35;
    }
    trunkGeo.setAttribute('color', new THREE.BufferAttribute(trunkColors, 3));
    trunkGeo.computeVertexNormals();

    const trunkMesh = new THREE.Mesh(trunkGeo, sharedTrunkMat);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    treeGroup.add(trunkMesh);

    const crownGroup = new THREE.Group();
    const topBend = leanAmount;
    crownGroup.position.set(
        dirX * topBend,
        height - leanAmount * 0.16,
        dirZ * topBend
    );
    crownGroup.rotation.z = -dirX * 0.20;
    crownGroup.rotation.x = dirZ * 0.20;

    // Scale crown slightly so towering trees have majestic proportional canopies
    const crownScale = 0.88 + 0.22 * Math.min(1.8, heightMultiplier);
    crownGroup.scale.setScalar(crownScale);

    // Abundant clusters of golden-green & ripe brown coconuts under the crown
    for (let c = 0; c < 9; c++) {
        const a = (c / 9) * Math.PI * 2;
        const coco = new THREE.Mesh(sharedCocoGeo, sharedCocoMats[c % 2]);
        coco.scale.set(1.0, 1.25, 1.0);
        coco.position.set(Math.cos(a) * 0.27, -0.15 - (c % 3) * 0.09, Math.sin(a) * 0.27);
        coco.castShadow = true;
        coco.userData.treeOrigin = new THREE.Vector2(x, z);
        coco.userData.treeScale = scale;
        crownGroup.add(coco);
        batchableMeshes.push(coco);
    }

    const numFronds = CONFIG.treeFronds;
    for (let f = 0; f < numFronds; f++) {
        const frondMesh = new THREE.Mesh(sharedFrondGeo, sharedFrondMat);
        const azimuth = (f / numFronds) * Math.PI * 2 + hash2D(f, x) * 0.24;
        const tier = f % 4;

        frondMesh.rotation.y = azimuth;
        frondMesh.rotation.x = -0.54 + tier * 0.24;
        frondMesh.rotation.z = (hash2D(f, z) - 0.5) * 0.26;
        frondMesh.scale.setScalar(0.82 + tier * 0.08);
        frondMesh.castShadow = true;
        frondMesh.receiveShadow = true;
        frondMesh.userData.treeOrigin = new THREE.Vector2(x, z);
        frondMesh.userData.treeScale = scale;
        crownGroup.add(frondMesh);
        batchableMeshes.push(frondMesh);
    }

    treeGroup.add(crownGroup);
    scene.add(treeGroup);
}

const flowerColors = [0xf43f5e, 0xfbbf24, 0xec4899, 0xf97316];
const sharedFlowerGeo = new THREE.DodecahedronGeometry(0.11, 0);
const sharedFlowerMats = flowerColors.map(c => new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.4,
    emissive: c,
    emissiveIntensity: 0.12
}));

function createCoastalBush(x, z, scale, hasFlowers = false) {
    const groundY = getIslandHeight(x, z);
    if (groundY < 0.32 || isNearCampOrCabin(x, z, 9.5)) return;

    bushLocations.push({ x, z });

    const bushGroup = new THREE.Group();
    bushGroup.position.set(x, groundY - 0.06, z);
    bushGroup.scale.setScalar(scale);

    const frondCount = CONFIG.bushFronds;
    for (let i = 0; i < frondCount; i++) {
        const frond = new THREE.Mesh(sharedFrondGeo, sharedFrondMat);
        const ang = (i / frondCount) * Math.PI * 2 + hash2D(i, x) * 0.35;
        const tier = i % 3;
        frond.position.set(Math.cos(ang) * 0.16, 0.12 + tier * 0.09, Math.sin(ang) * 0.16);
        frond.rotation.y = ang;
        frond.rotation.x = -0.42 + tier * 0.22;
        frond.rotation.z = (hash2D(i, z) - 0.5) * 0.25;
        const s = 0.28 + tier * 0.07 + hash2D(x, i) * 0.09;
        frond.scale.set(s * 1.38, s * 0.92, s * 0.74);
        frond.castShadow = true;
        frond.receiveShadow = true;
        frond.userData.treeOrigin = new THREE.Vector2(x, z);
        frond.userData.treeScale = 0.0;
        bushGroup.add(frond);
        batchableMeshes.push(frond);
    }

    // Tropical hibiscus / Plumeria blossoms dotting the bush canopy
    if (hasFlowers) {
        const fMat = sharedFlowerMats[Math.floor(hash2D(x, z) * sharedFlowerMats.length)];
        for (let f = 0; f < 7; f++) {
            const fl = new THREE.Mesh(sharedFlowerGeo, fMat);
            const fa = (f / 7) * Math.PI * 2 + hash2D(f, z);
            const fr = 0.35 + hash2D(x, f) * 0.65;
            fl.position.set(Math.cos(fa) * fr, 0.32 + hash2D(f, x) * 0.38, Math.sin(fa) * fr);
            bushGroup.add(fl);
            batchableMeshes.push(fl);
        }
    }

    scene.add(bushGroup);
}

function createTropicalVegetation() {
    // 135 Coconut Palm Trees concentrated in dense tropical groves across the island
    const totalTrees = CONFIG.totalTrees;
    const palmGroves = [
        { x: -48.0, z: -32.0, spread: 24.0, count: 25 },
        { x: -70.0, z:  30.0, spread: 22.0, count: 23 },
        { x: -18.0, z:  60.0, spread: 19.0, count: 20 },
        { x:  20.0, z: -48.0, spread: 25.0, count: 24 },
        { x:  74.0, z: -30.0, spread: 22.0, count: 23 },
        { x: 118.0, z:  42.0, spread: 25.0, count: 20 }
    ];
    let groveIndex = 0;
    let groveStart = 0;
    for (let i = 0; i < totalTrees; i++) {
        while (groveIndex < palmGroves.length - 1 && i >= groveStart + palmGroves[groveIndex].count) {
            groveStart += palmGroves[groveIndex].count;
            groveIndex++;
        }
        const grove = palmGroves[groveIndex];
        const localIndex = i - groveStart;
        const angle = localIndex * 2.39996 + hash2D(i, 4.1) * 0.8;
        const radius = Math.sqrt(hash2D(i, 6.2)) * grove.spread;
        const px = grove.x + Math.cos(angle) * radius;
        const pz = grove.z + Math.sin(angle) * radius;

        const h = getIslandHeight(px, pz);
        if (h > 0.38) {
            const distFromCenter = Math.sqrt(px * px + pz * pz);
            const outAngle = Math.atan2(pz, px) + (hash2D(i, 2.7) - 0.5) * 0.75;

            // Create striking multi-tier height variation:
            // - 20% Towering King Coconut Trees (1.5x to 2.25x height)
            // - 55% Mature Island Palms (0.9x to 1.4x height)
            // - 25% Young Coastal Palms (0.55x to 0.85x height)
            const hRoll = hash2D(i, 11.7);
            let heightMult = 1.0;
            let scale = 0.9 + hash2D(i, 8.3) * 0.38;
            if (hRoll > 0.78) {
                heightMult = 1.55 + hash2D(i, 19.3) * 0.72; // Towering giants!
                scale = 1.05 + hash2D(i, 8.3) * 0.35;
            } else if (hRoll < 0.25) {
                heightMult = 0.58 + hash2D(i, 14.2) * 0.28; // Young low palms
                scale = 0.72 + hash2D(i, 8.3) * 0.25;
            } else {
                heightMult = 0.92 + hash2D(i, 16.8) * 0.52;
            }

            const lean = (1.3 + smoothstep(10.0, 75.0, distFromCenter) * 2.8) * Math.pow(heightMult, 0.65);
            createPalmTree(px, pz, scale, outAngle, lean, heightMult);
        }
    }

    // 210 Lush Coastal Bushes, Scaevola Shrubs, and Flowering Hibiscus thickets
    const totalBushes = CONFIG.totalBushes;
    for (let i = 0; i < totalBushes; i++) {
        const angle = i * 2.39996 + hash2D(i, 9.1) * 0.35;
        const radius = 3.0 + Math.sqrt(i / totalBushes) * 84.0;
        let bx = Math.cos(angle) * radius + (hash2D(i, 1.3) - 0.5) * 9.0;
        let bz = Math.sin(angle) * radius + (hash2D(i, 7.7) - 0.5) * 9.0;

        if (i % 5 === 0) {
            bx += 42.0;
            bz += 18.0;
        } else if (i % 7 === 0) {
            bx -= 56.0;
            bz += 32.0;
        }

        const bScale = 0.65 + hash2D(bx, bz) * 1.15;
        const hasFlowers = (i % 3 === 0);
        createCoastalBush(bx, bz, bScale, hasFlowers);
    }
}
