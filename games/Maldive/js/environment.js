// ============================================================================
// 4. SCENE INITIALIZATION & PROCEDURAL ISLAND ASSETS
// ============================================================================
function initScene() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.3, 250000);
    camera.position.set(145, 34, 155);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio));
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = CONFIG.shadowType;
    container.appendChild(renderer.domElement);

    // OrbitControls allowing full upward sky tilt & canopy inspection
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(12, 4.0, 4);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI * 0.98;
    controls.minDistance = 0.5;
    controls.maxDistance = 520;

    controls.addEventListener('start', () => {
        STATE.cameraAnimating = false;
    });

    setupLighting();
    createSkyDome();
    createCumulusPatches();
    createTropicalVegetation();
    createIslandTerrain();
    createUnderwaterCoralReefs();
    createMarineLife();
    createSeagulls();
    createShipwreckAndProps();
    createTribalCabinAndGadgets();
    createAAAOcean();
    createCoastalRocks();

    // Collapse thousands of single-mesh draw calls (fronds, coconuts, flowers, coral, pier, driftwood) into instanced batches
    batchStaticMeshes(batchableMeshes);
    batchableMeshes = [];

    window.addEventListener('resize', onWindowResize);
}

function setupLighting() {
    // Physically calibrated Directional Sun Light with high-res shadows covering the much larger island
    sunLight = new THREE.DirectionalLight(0xfff5e0, 2.15);
    sunLight.position.copy(STATE.sunDirection).multiplyScalar(CELESTIAL_LIGHT_DISTANCE);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = CONFIG.shadowMapSize;
    sunLight.shadow.mapSize.height = CONFIG.shadowMapSize;
    sunLight.shadow.camera.near = CELESTIAL_LIGHT_DISTANCE - 800;
    sunLight.shadow.camera.far = CELESTIAL_LIGHT_DISTANCE + 800;
    const d = 145;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    // Secondary Moon Directional Light
    moonLight = new THREE.DirectionalLight(0x8ab4f8, 0.0);
    moonLight.position.copy(STATE.moonDirection).multiplyScalar(CELESTIAL_LIGHT_DISTANCE);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = CONFIG.shadowMapSize;
    moonLight.shadow.mapSize.height = CONFIG.shadowMapSize;
    moonLight.shadow.camera.near = CELESTIAL_LIGHT_DISTANCE - 800;
    moonLight.shadow.camera.far = CELESTIAL_LIGHT_DISTANCE + 800;
    moonLight.shadow.camera.left = -d;
    moonLight.shadow.camera.right = d;
    moonLight.shadow.camera.top = d;
    moonLight.shadow.camera.bottom = -d;
    moonLight.shadow.camera.updateProjectionMatrix();
    moonLight.shadow.bias = -0.0004;
    moonLight.shadow.normalBias = 0.02;
    scene.add(moonLight);

    // Physically balanced Hemisphere Light
    hemiLight = new THREE.HemisphereLight(0x5ca4d6, 0x6e5d45, 0.45);
    scene.add(hemiLight);
}

function createSkyDome() {
    const skyGeo = new THREE.SphereGeometry(1200, 64, 48);
    const skyFragShader = SKY_FRAGMENT_SHADER.replace(
        'const int STEPS = 64;',
        'const int STEPS = ' + CONFIG.skyRaymarchSteps + ';'
    );
    skyMat = new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX_SHADER,
        fragmentShader: skyFragShader,
        uniforms: {
            uSunDir: { value: STATE.sunDirection },
            uMoonDir: { value: STATE.moonDirection },
            uSkyHorizonColor: { value: STATE.skyHorizonColor },
            uSkyRotation: { value: 0 },
            uTime: { value: 0 },
            uCloudCoverage: { value: STATE.cloudCoverage }
        },
        side: THREE.BackSide,
        depthWrite: false
    });
    skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.position.copy(camera.position);
    skyMesh.renderOrder = 1; // drawn after opaque terrain and foliage so covered sky pixels fail the depth test early
    scene.add(skyMesh);
}

function createCumulusPatches() {
    const patchGeometry = new THREE.PlaneGeometry(1200, 800);
    const cumulusFragShader = CUMULUS_PATCH_FRAGMENT_SHADER.replace(
        'const int PATCH_STEPS = 64;',
        'const int PATCH_STEPS = ' + CONFIG.skyRaymarchSteps + ';'
    );
    cumulusMat = new THREE.ShaderMaterial({
        vertexShader: CUMULUS_PATCH_VERTEX_SHADER,
        fragmentShader: cumulusFragShader,
        uniforms: {
            uTime: { value: 0 },
            uCumulusCoverage: { value: STATE.cumulusCoverage },
            uCumulusSeed: { value: CUMULUS_SEED },
            uSunDir: { value: STATE.sunDirection },
            uMoonDir: { value: STATE.moonDirection },
            uSunColor: { value: STATE.sunColor }
        },
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false
    });
    cumulusMesh = new THREE.Mesh(patchGeometry, cumulusMat);
    cumulusMesh.renderOrder = 11;
    scene.add(cumulusMesh);
}

function createIslandTerrain() {
    // Optimized terrain mesh covering island and shallow lagoon floor
    const size = 860;
    const segments = CONFIG.terrainSegments;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    colors.fill(1.0);

    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        posAttr.setY(i, getIslandHeight(x, z));
    }

    // High-performance O(K) spatial bounding-box AO (thousands of times faster than O(N*M) brute force loop)
    function applyGroundAO(cx, cz, radius, maxDistSq, factor, expDiv) {
        const minIx = Math.max(0, Math.floor(((cx - radius) / size + 0.5) * segments));
        const maxIx = Math.min(segments, Math.ceil(((cx + radius) / size + 0.5) * segments));
        const minIz = Math.max(0, Math.floor(((cz - radius) / size + 0.5) * segments));
        const maxIz = Math.min(segments, Math.ceil(((cz + radius) / size + 0.5) * segments));

        for (let iz = minIz; iz <= maxIz; iz++) {
            const rowOffset = iz * (segments + 1);
            for (let ix = minIx; ix <= maxIx; ix++) {
                const idx = rowOffset + ix;
                const vx = posAttr.getX(idx);
                const vz = posAttr.getZ(idx);
                const dx = vx - cx;
                const dz = vz - cz;
                const d2 = dx * dx + dz * dz;
                if (d2 < maxDistSq) {
                    const aoMod = 1.0 - factor * Math.exp(-d2 / expDiv);
                    colors[idx * 3]     *= aoMod;
                    colors[idx * 3 + 1] *= aoMod;
                    colors[idx * 3 + 2] *= aoMod;
                }
            }
        }
    }

    applyGroundAO(CABIN_SITE.x, CABIN_SITE.z, 11.0, 120.0, 0.30, 48.0);
    for (let t = 0; t < treeLocations.length; t++) {
        applyGroundAO(treeLocations[t].x, treeLocations[t].z, 6.0, 36.0, 0.16, 5.0);
    }
    for (let b = 0; b < bushLocations.length; b++) {
        applyGroundAO(bushLocations[b].x, bushLocations[b].z, 4.0, 16.0, 0.18, 2.2);
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    sandMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.0,
        vertexColors: true
    });

    sandMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uSunDir = { value: STATE.sunDirection };
        shader.uniforms.uMoonDir = { value: STATE.moonDirection };
        shader.uniforms.uSunColor = { value: STATE.sunColor };
        sandMat.userData.shader = shader;

        shader.vertexShader = `
            varying vec3 vSandWorldPos;
        ` + shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
            vSandWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

        shader.fragmentShader = `
            varying vec3 vSandWorldPos;
            uniform float uTime;
            uniform vec3 uSunDir;
            uniform vec3 uMoonDir;
            uniform vec3 uSunColor;

            float sandHash(vec2 p) {
                vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.x + p3.y) * p3.z);
            }
            float sandNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(sandHash(i), sandHash(i + vec2(1.0, 0.0)), f.x),
                    mix(sandHash(i + vec2(0.0, 1.0)), sandHash(i + vec2(1.0, 1.0)), f.x),
                    f.y
                );
            }
        ` + shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float h = vSandWorldPos.y;

            // Multi-scale coral sand grain, wind-rippled beach dunes, and subtle shell/coral detritus
            float grainFine = sandNoise(vSandWorldPos.xz * 16.0);
            float grainMicro = sandNoise(vSandWorldPos.xz * 42.0);
            float grainMacro = sandNoise(vSandWorldPos.xz * 1.8);
            float sandDetailFade = 1.0 - smoothstep(0.025, 0.12, fwidth(vSandWorldPos.x) + fwidth(vSandWorldPos.z));
            float grain = mix(grainMacro, grainFine * 0.62 + grainMicro * 0.38, sandDetailFade);

            float swashLine = 0.05 * sin(uTime * 2.4 + vSandWorldPos.x * 0.4 + vSandWorldPos.z * 0.4);
            float wetness = 1.0 - smoothstep(-0.06, 0.36 + swashLine, h);
            float ripplePhase = dot(vSandWorldPos.xz, vec2(0.82, 0.57)) * 1.8
                              + (sandNoise(vSandWorldPos.xz * 0.12) - 0.5) * 1.3
                              + (sandNoise(vSandWorldPos.xz * 0.035) - 0.5) * 2.0;
            float rippleFade = 1.0 - smoothstep(0.45, 1.2, fwidth(ripplePhase));
            float rippleBand = mix(0.5, pow(0.5 + 0.5 * sin(ripplePhase), 6.0), rippleFade);
            float windRipples = 0.5 + 0.5 * sin(ripplePhase);
            float rippleShade = (rippleBand - 0.12) * 0.04 * (1.0 - wetness * 0.35);

            // Authentic Maldives high-albedo warm coral-white sand & golden-tan wet swash zone
            vec3 dryCoralSand = vec3(0.84, 0.78, 0.67) * (0.91 + 0.12 * grain + 0.02 * windRipples + rippleShade);
            vec3 wetShoreSand = vec3(0.50, 0.44, 0.35) * (0.92 + 0.10 * grain + rippleShade * 0.6);
            vec3 inlandVegetatedSand = vec3(0.58, 0.56, 0.44) * (0.88 + 0.16 * grain);

            vec3 sandCol = mix(dryCoralSand, wetShoreSand, wetness);
            float shellSpecks = step(0.995, sandHash(floor(vSandWorldPos.xz * 5.0)));
            sandCol += vec3(0.045, 0.032, 0.016) * shellSpecks * (1.0 - wetness * 0.8);

            // Subtle organic coastal soil blend at the highest central palm grove
            float inlandMask = smoothstep(1.15, 1.85, h);
            sandCol = mix(sandCol, inlandVegetatedSand, inlandMask * 0.45);

            // Subtle quartz/aragonite crystal micro-sparkles on sunlit dry coral sand
            vec3 viewDir = normalize(cameraPosition - vSandWorldPos);
            float sparkleCell = sandHash(floor(vSandWorldPos.xz * 65.0) + floor(viewDir.xz * 14.0));
            float sparkle = step(0.988, sparkleCell) * (1.0 - wetness * 0.8) * max(0.0, uSunDir.y);
            sandCol += vec3(0.95, 0.90, 0.78) * sparkle * 0.35;

            diffuseColor.rgb *= sandCol;
            `
        ).replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            float bumpPhaseX = vSandWorldPos.x * 12.0 + sin(vSandWorldPos.z * 6.0) * 0.4;
            float bumpPhaseZ = vSandWorldPos.z * 10.0 + sin(vSandWorldPos.x * 5.0) * 0.3;
            float rippleSlope = cos(ripplePhase) * 1.8 * mix(0.002, 0.006, wetness);
            float grainSlope = 0.0007;
            float bumpGradX = (rippleSlope * 0.82
                            + grainSlope * (cos(bumpPhaseX) * 12.0 + cos(bumpPhaseZ) * cos(vSandWorldPos.x * 5.0) * 1.5)) * sandDetailFade;
            float bumpGradZ = (rippleSlope * 0.57
                            + grainSlope * (cos(bumpPhaseX) * cos(vSandWorldPos.z * 6.0) * 2.4 + cos(bumpPhaseZ) * 10.0)) * sandDetailFade;
            normal = normalize(normal + mat3(viewMatrix) * vec3(-bumpGradX, 0.0, -bumpGradZ));
            `
        ).replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            roughnessFactor = mix(0.58, 0.16, wetness) + rippleBand * 0.035;
            `
        ).replace(
            '#include <opaque_fragment>',
            `vec3 sandViewDirection = normalize(-vViewPosition);
            vec3 sandSunDirection = normalize(mat3(viewMatrix) * uSunDir);
            vec3 sandMoonDirection = normalize(mat3(viewMatrix) * uMoonDir);
            float sunWetSpec = pow(max(dot(normal, normalize(sandSunDirection + sandViewDirection)), 0.0), 110.0)
                             * wetness * smoothstep(-0.06, 0.08, uSunDir.y) * 0.12;
            float moonWetSpec = pow(max(dot(normal, normalize(sandMoonDirection + sandViewDirection)), 0.0), 90.0)
                              * wetness * smoothstep(-0.06, 0.08, uMoonDir.y) * 0.08;
            outgoingLight += uSunColor * sunWetSpec + vec3(0.48, 0.68, 1.0) * moonWetSpec;
            #include <opaque_fragment>
            `
        );
    };

    const terrainMesh = new THREE.Mesh(geo, sandMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
}

function createAAAOcean() {
    // Preserve dense near-shore water while stretching the outer mesh well beyond the visible horizon.
    const oceanRadius = 3200;
    const oceanFarRadius = 200000;
    const oceanSegments = CONFIG.oceanSegments;
    const oceanGeo = new THREE.PlaneGeometry(oceanRadius * 2, oceanRadius * 2, oceanSegments, oceanSegments);
    oceanGeo.rotateX(-Math.PI / 2);

    // Keep the detailed inner waves unchanged and progressively spread only the distant vertices.
    const pos = oceanGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let z = pos.getZ(i);
        const r = Math.sqrt(x * x + z * z);
        if (r > 0.001) {
            const normR = r / oceanRadius;
            const nearWarpedR = Math.pow(normR, 1.42) * oceanRadius;
            const farFieldBlend = smoothstep(0.78, 1.0, normR);
            const warpedR = nearWarpedR + farFieldBlend * (oceanFarRadius - oceanRadius);
            const scale = warpedR / r;
            pos.setX(i, x * scale);
            pos.setZ(i, z * scale);
        }
    }
    oceanGeo.computeVertexNormals();

    const oceanFragShader = OCEAN_FRAGMENT_SHADER.replace(
        'const int REFLECTION_STEPS = 40;',
        'const int REFLECTION_STEPS = ' + CONFIG.oceanReflectionSteps + ';'
    );

    oceanMat = new THREE.ShaderMaterial({
        vertexShader: OCEAN_VERTEX_SHADER,
        fragmentShader: oceanFragShader,
        uniforms: {
            uTime: { value: 0 },
            uWaveScale: { value: STATE.waveScale },
            uCloudCoverage: { value: STATE.cloudCoverage },
            uCumulusCoverage: { value: STATE.cumulusCoverage },
            uCumulusSeed: { value: CUMULUS_SEED },
            uSunDir: { value: STATE.sunDirection },
            uMoonDir: { value: STATE.moonDirection },
            uSunColor: { value: STATE.sunColor },
            uSkyTopColor: { value: STATE.skyTopColor },
            uSkyHorizonColor: { value: STATE.skyHorizonColor }
        },
        transparent: true,
        depthWrite: true
    });

    oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.y = 0.0;
    oceanMesh.renderOrder = 10;
    scene.add(oceanMesh);
}


function createCoastalRocks() {
    const rockMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.02,
        vertexColors: true
    });

    const rockClusters = [
        { x: -72.0, z: -42.0, count: 7, spread: 8.0, scale: 1.45 },
        { x:  66.0, z: -52.0, count: 6, spread: 7.2, scale: 1.30 },
        { x: -55.0, z:  62.5, count: 6, spread: 6.5, scale: 1.20 },
        { x: 152.0, z:  54.0, count: 6, spread: 6.2, scale: 1.10 },
        { x: -115.0, z: 48.0, count: 5, spread: 6.0, scale: 1.25 }
    ];

    const rockParts = [];
    rockClusters.forEach((cluster, cIdx) => {
        for (let i = 0; i < cluster.count; i++) {
            const rx = cluster.x + (hash2D(cIdx, i * 3.1) - 0.5) * cluster.spread;
            const rz = cluster.z + (hash2D(i * 7.3, cIdx) - 0.5) * cluster.spread;
            const ry = getIslandHeight(rx, rz);

            const rockGeo = new THREE.DodecahedronGeometry(1.1, 3);
            const pos = rockGeo.attributes.position;
            const colors = new Float32Array(pos.count * 3);
            for (let v = 0; v < pos.count; v++) {
                let vx = pos.getX(v);
                let vy = pos.getY(v);
                let vz = pos.getZ(v);
                const n = fbm2D(vx * 2.4 + i * 3.1, vz * 2.4 + cIdx * 5.7);
                const strata = Math.sin(vy * 9.0 + n * 4.0) * 0.08;
                vx *= (0.78 + 0.42 * n + strata);
                vy *= (0.48 + 0.28 * n);
                vz *= (0.78 + 0.42 * n - strata);
                pos.setXYZ(v, vx, vy, vz);

                // Weathered coastal coral limestone coloration (warm sun-bleached top, dark wet base)
                const wetMask = smoothstep(-0.4, 0.25, vy);
                const shade = (0.32 + 0.42 * wetMask) * (0.75 + 0.35 * n);
                colors[v * 3]     = shade * 0.92;
                colors[v * 3 + 1] = shade * 0.86;
                colors[v * 3 + 2] = shade * 0.76;
            }
            rockGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            rockGeo.computeVertexNormals();

            const s = cluster.scale * (0.55 + hash2D(rx, rz) * 0.9);
            const rockMatrix = new THREE.Matrix4().compose(
                new THREE.Vector3(rx, ry + s * 0.12, rz),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hash2D(rz, rx) * Math.PI * 2, 0)),
                new THREE.Vector3(s * 1.35, s * 0.72, s)
            );
            rockParts.push({ geometry: rockGeo, matrix: rockMatrix });
        }
    });

    // All rocks share one material, so they are merged into a single mesh
    const rockMesh = new THREE.Mesh(mergeGeometryParts(rockParts), rockMat);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    scene.add(rockMesh);
}
