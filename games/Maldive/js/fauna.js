// ============================================================================
// 5B. 3D UNDERWATER CORAL REEFS, MARINE LIFE & SOARING SEAGULLS
// ============================================================================
function createUnderwaterCoralReefs() {
    // Corals and yellow star meshes removed as requested
}


function createMarineLife() {
    // 1. Graceful Maldives Manta Rays gliding through the turquoise lagoon
    const mantaGeo = new THREE.PlaneGeometry(3.4, 2.6, 16, 12);
    mantaGeo.rotateX(-Math.PI / 2);
    const mPos = mantaGeo.attributes.position;
    for (let i = 0; i < mPos.count; i++) {
        let x = mPos.getX(i);
        let z = mPos.getZ(i);
        // Diamond-wing manta silhouette with sweeping pectoral fins & slender tail
        const span = Math.abs(x) / 1.7;
        const foreAft = z / 1.3;
        const wingLength = Math.max(0.08, 1.0 - Math.pow(span, 0.85));
        z *= wingLength;
        if (span < 0.08 && foreAft < -0.2) {
            z -= 1.2; // Slender whip tail
        }
        const bodyThickness = Math.max(0.0, (1.0 - span * 1.2) * (1.0 - Math.abs(foreAft))) * 0.22;
        mPos.setXYZ(i, x, bodyThickness, z);
    }
    mGeoNormals(mantaGeo);

    const mantaMat = new THREE.MeshStandardMaterial({
        color: 0x162436,
        roughness: 0.35,
        side: THREE.DoubleSide
    });

    mantaMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        mantaMat.userData.shader = shader;
        shader.vertexShader = `
            uniform float uTime;
        ` + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float wingSpan = abs(transformed.x);
            float flap = sin(uTime * 3.2 - wingSpan * 1.15) * pow(wingSpan * 0.58, 1.5) * 0.55;
            transformed.y += flap;
            `
        );
    };
    frondMaterials.push(mantaMat);

    const mantaPaths = [
        { cx:  65, cz:  48, rx: 38, rz: 28, speed: 0.24, depth: -1.15, phase: 0.0 },
        { cx:  98, cz:  12, rx: 44, rz: 32, speed: 0.20, depth: -1.35, phase: 2.1 },
        { cx: -45, cz:  78, rx: 36, rz: 26, speed: 0.22, depth: -1.25, phase: 4.2 },
        { cx:  25, cz: -85, rx: 42, rz: 30, speed: 0.19, depth: -1.40, phase: 1.3 },
        { cx: 145, cz:  65, rx: 35, rz: 25, speed: 0.25, depth: -1.10, phase: 3.7 }
    ];

    mantaPaths.forEach(spec => {
        const manta = new THREE.Mesh(mantaGeo, mantaMat);
        scene.add(manta);
        marineLifeAgents.push({ mesh: manta, type: 'manta', ...spec });
    });

    // 2. Colorful Schools of Tropical Reef Fish (Yellow Tangs, Blue Damselfish, Moorish Idols)
    const fishGeo = new THREE.ConeGeometry(0.16, 0.65, 5);
    fishGeo.rotateX(Math.PI / 2);
    fishGeo.scale(0.45, 1.0, 1.0);

    const fishColors = [0xfacc15, 0x38bdf8, 0xf97316, 0xf43f5e];
    const schoolCenters = [
        { cx:  54, cz:  36, rx: 14, rz: 12, speed: 0.55, depth: -0.75, phase: 0.5, col: 0 },
        { cx:  78, cz:  26, rx: 18, rz: 14, speed: 0.48, depth: -0.90, phase: 1.8, col: 1 },
        { cx: 118, cz:  46, rx: 16, rz: 15, speed: 0.52, depth: -0.80, phase: 3.1, col: 2 },
        { cx: -28, cz:  68, rx: 16, rz: 14, speed: 0.46, depth: -0.85, phase: 4.4, col: 3 },
        { cx:  38, cz: -66, rx: 15, rz: 15, speed: 0.50, depth: -0.95, phase: 2.6, col: 0 },
        { cx: -68, cz: -38, rx: 17, rz: 13, speed: 0.44, depth: -1.05, phase: 5.2, col: 1 }
    ];

    schoolCenters.forEach(s => {
        // Each school is one merged mesh (fish baked in local space) so it still swims as a unit
        const fMat = new THREE.MeshStandardMaterial({
            color: fishColors[s.col],
            roughness: 0.3,
            emissive: fishColors[s.col],
            emissiveIntensity: 0.18
        });

        const fishParts = [];
        for (let f = 0; f < 18; f++) {
            const sc = 0.75 + hash2D(f, s.phase) * 0.55;
            const fishPos = new THREE.Vector3(
                (hash2D(f, s.cx) - 0.5) * 4.2,
                (hash2D(f, s.cz) - 0.5) * 0.45,
                (hash2D(s.cx, f) - 0.5) * 4.2
            );
            fishParts.push({
                geometry: fishGeo,
                matrix: new THREE.Matrix4().compose(fishPos, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc))
            });
        }

        const schoolMesh = new THREE.Mesh(mergeGeometryParts(fishParts), fMat);
        scene.add(schoolMesh);
        marineLifeAgents.push({ mesh: schoolMesh, type: 'school', ...s });
    });
}

function mGeoNormals(geo) {
    geo.computeVertexNormals();
}

function createSeagulls() {
    // Custom V-wing seagull geometry with vertex-shader wing flapping
    const gullGeo = new THREE.PlaneGeometry(2.1, 0.52, 8, 2);
    gullGeo.rotateX(-Math.PI / 2);
    const gPos = gullGeo.attributes.position;
    const gCols = new Float32Array(gPos.count * 3);

    for (let i = 0; i < gPos.count; i++) {
        let x = gPos.getX(i);
        let z = gPos.getZ(i);
        const span = Math.abs(x) / 1.05;
        // Swept-back gull wing profile with dark wingtips
        const sweep = Math.sin(span * Math.PI * 0.85) * 0.22 - Math.pow(span, 1.8) * 0.35;
        const chordScale = Math.max(0.15, 1.0 - Math.pow(span, 1.4));
        z = z * chordScale + sweep;
        const dihedral = Math.sin(span * Math.PI) * 0.14;
        gPos.setXYZ(i, x, dihedral, z);

        // White seagull plumage with slate-grey outer primaries and black wingtips
        const tipDark = smoothstep(0.78, 0.96, span);
        const c = 0.96 - tipDark * 0.78;
        gCols[i * 3]     = c;
        gCols[i * 3 + 1] = c;
        gCols[i * 3 + 2] = c + 0.02;
    }
    gullGeo.setAttribute('color', new THREE.BufferAttribute(gCols, 3));
    gullGeo.computeVertexNormals();

    const gullMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.6,
        vertexColors: true,
        side: THREE.DoubleSide
    });

    gullMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        gullMat.userData.shader = shader;
        shader.vertexShader = `
            uniform float uTime;
        ` + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vec4 wPos = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float birdPhase = wPos.x * 0.15 + wPos.z * 0.15;
            float span = abs(transformed.x);
            float flap = sin(uTime * 6.8 + birdPhase) * pow(span, 1.35) * 0.42;
            transformed.y += flap;
            `
        );
    };
    frondMaterials.push(gullMat);

    for (let i = 0; i < 18; i++) {
        const gull = new THREE.Mesh(gullGeo, gullMat);
        gull.castShadow = true;
        scene.add(gull);

        seagullAgents.push({
            mesh: gull,
            cx: (hash2D(i, 1.1) - 0.35) * 140.0,
            cz: (hash2D(i, 2.2) - 0.4) * 110.0,
            rx: 28.0 + hash2D(i, 3.3) * 65.0,
            rz: 24.0 + hash2D(i, 4.4) * 55.0,
            baseY: 13.5 + hash2D(i, 5.5) * 18.0,
            speed: 0.28 + hash2D(i, 6.6) * 0.22,
            phase: i * 1.15
        });
    }
}
