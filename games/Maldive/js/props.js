// ============================================================================
// 5C. SHIPWRECK BUILDER, STATIC BATCHING & GEOMETRY MERGING
// ============================================================================
// Half-submerged on the flat north-east shelf (seabed about -1.9 m, footprint spread about 0.26 m)
const WRECK_SITE = { x: 168.0, z: -82.0, yaw: 1.2217, scale: 1.2 };
const WRECK_HULL = { length: 22.0, beam: 6.8, depth: 4.4, stations: 24, quarter: 9 };

function lerp3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Deck (sheer) height: highest at bow and stern, lower amidships
function wreckSheerBase(s, depth) {
    return depth * (0.82 + 0.18 * Math.pow(Math.abs(2.0 * s - 1.0), 2.0));
}

// Broken-back zone amidships where the hull has snapped and sagged
function wreckBreakZone(s) {
    return smoothstep(0.40, 0.46, s) * (1.0 - smoothstep(0.54, 0.60, s));
}

// Profile of one hull station, shared by the hull, deck and frame geometry
function wreckStation(i) {
    const { length, beam, depth, stations } = WRECK_HULL;
    const s = i / stations;
    const brk = wreckBreakZone(s);
    return {
        s,
        brk,
        x: (s - 0.5) * length,
        halfBeam: (beam * 0.5) * Math.max(0.16, Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 0.5)),
        sheer: wreckSheerBase(s, depth) - brk * 1.1 + (valueNoise2D(i * 1.37 + 3.1, 2.7) - 0.5) * 0.22,
        keel: 0.30 * Math.pow(Math.abs(2.0 * s - 1.0), 2.4) - brk * 0.35
    };
}

// Point j on a station's cross-section: 0 = port sheer, K = keel, 2K = starboard sheer
function wreckSectionPoint(st, j) {
    const K = WRECK_HULL.quarter;
    const side = j <= K ? -1.0 : 1.0;
    const theta = (j <= K ? (K - j) : (j - K)) / K * (Math.PI / 2);
    return new THREE.Vector3(
        st.x,
        st.keel + (st.sheer - st.keel) * (1.0 - Math.cos(theta)),
        side * st.halfBeam * Math.pow(Math.sin(theta), 0.72)
    );
}

// Lofted, open-topped hull with rounded bilges and per-vertex weathering colours
function buildWreckHullGeometry() {
    const { stations, quarter } = WRECK_HULL;
    const M = 2 * quarter + 1;
    const woodDark = [0.20, 0.14, 0.09];
    const woodGrey = [0.42, 0.36, 0.28];
    const bleached = [0.56, 0.47, 0.34];
    const algae = [0.17, 0.26, 0.15];
    const barnacle = [0.66, 0.64, 0.58];
    const positions = [];
    const colors = [];

    for (let i = 0; i <= stations; i++) {
        const st = wreckStation(i);
        for (let j = 0; j < M; j++) {
            const p = wreckSectionPoint(st, j);
            positions.push(p.x, p.y, p.z);

            // Sun-bleached planks at the top, algae and barnacles low on the hull
            const t = Math.min(1.0, Math.max(0.0, (p.y - st.keel) / Math.max(0.001, st.sheer - st.keel)));
            const n = valueNoise2D(p.x * 0.9 + j * 0.37, p.y * 1.7 + i * 0.13);
            let c = lerp3(woodDark, woodGrey, smoothstep(0.0, 0.8, t));
            c = lerp3(c, bleached, smoothstep(0.7, 1.0, t) * 0.55);
            c = lerp3(c, algae, (1.0 - smoothstep(0.0, 0.35, t)) * smoothstep(0.35, 0.7, n) * 0.75);
            if (n > 0.8 && t < 0.5) c = lerp3(c, barnacle, 0.55);
            const grain = 0.86 + 0.26 * n;
            colors.push(c[0] * grain, c[1] * grain, c[2] * grain);
        }
    }

    const indices = [];
    for (let i = 0; i < stations; i++) {
        for (let j = 0; j < M - 1; j++) {
            const a = i * M + j;
            const b = a + 1;
            const d = (i + 1) * M + j;
            const c = d + 1;
            indices.push(a, d, b, b, d, c);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

// Planked deck strips at the stern castle and forecastle only; the amidships deck is open
function buildWreckDeckGeometry() {
    const { stations, quarter } = WRECK_HULL;
    const positions = [];
    for (let i = 0; i < stations; i++) {
        const sMid = (i + 0.5) / stations;
        if (sMid > 0.38 && sMid < 0.6) continue;
        const a = wreckSectionPoint(wreckStation(i), 0);
        const b = wreckSectionPoint(wreckStation(i), 2 * quarter);
        const c = wreckSectionPoint(wreckStation(i + 1), 2 * quarter);
        const d = wreckSectionPoint(wreckStation(i + 1), 0);
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
}

// Exposed frames: thin bands following the hull cross-section, pushed slightly outside the planking
function buildWreckRibGeometry() {
    const { stations, quarter } = WRECK_HULL;
    const M = 2 * quarter + 1;
    const halfW = 0.14;
    const positions = [];
    for (let i = 1; i < stations; i += 3) {
        const st = wreckStation(i);
        if (st.brk > 0.5) continue; // no frames survive in the broken section
        const center = new THREE.Vector3(st.x, (st.keel + st.sheer) * 0.5, 0.0);
        const pts = [];
        for (let j = 0; j < M; j++) {
            const p = wreckSectionPoint(st, j);
            const n = p.clone().sub(center).normalize();
            pts.push(p.addScaledVector(n, 0.16));
        }
        for (let j = 0; j < M - 1; j++) {
            const p0 = pts[j];
            const p1 = pts[j + 1];
            const A = [p0.x - halfW, p0.y, p0.z];
            const B = [p0.x + halfW, p0.y, p0.z];
            const C = [p1.x + halfW, p1.y, p1.z];
            const D = [p1.x - halfW, p1.y, p1.z];
            positions.push(...A, ...B, ...C, ...A, ...C, ...D);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
}

// Keel line following the hull rocker
function buildWreckKeelCurve() {
    const pts = [];
    for (let i = 0; i <= WRECK_HULL.stations; i += 2) {
        const st = wreckStation(i);
        pts.push(new THREE.Vector3(st.x, st.keel + 0.1, 0.0));
    }
    return new THREE.CatmullRomCurve3(pts);
}

// Square sail that hangs from its yard (top edge at y = 0), billowed in x, torn along the bottom edge
function buildTatteredSailGeometry(width, height, seed) {
    const geo = new THREE.PlaneGeometry(width, height, 12, 8);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k);
        const y = pos.getY(k);
        const bottom = y < -height * 0.5 + 1e-3;
        const tear = bottom ? hash2D(x * 3.7 + seed, seed) * 0.95 : 0.0;
        const billow = Math.sin(x * 1.1 + seed) * 0.42 + Math.sin(y * 0.9 + x * 0.5) * 0.18;
        pos.setXYZ(k, x, y - tear, billow);
    }
    geo.rotateY(Math.PI / 2);
    geo.translate(0, -height * 0.5, 0);
    geo.computeVertexNormals();
    return geo;
}

// Straight spar between two points (rBottom at `from`, rTop at `to`)
function addWreckSpar(parent, from, to, rBottom, rTop, mat, radialSegs) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(rTop, rBottom, len, radialSegs, 1);
    geo.translate(0, len * 0.5, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function buildShipwreckGroup() {
    const { length, depth } = WRECK_HULL;
    const group = new THREE.Group();
    group.rotation.set(0.10, WRECK_SITE.yaw, 0.03, 'YXZ'); // list (roll), heading, slight pitch
    group.scale.setScalar(WRECK_SITE.scale);
    group.position.set(WRECK_SITE.x, 0.0, WRECK_SITE.z);

    const darkTimberMat = new THREE.MeshStandardMaterial({ color: 0x3b2818, roughness: 0.92 });
    const bleachedTimberMat = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.88 });
    const tatteredSailMat = new THREE.MeshStandardMaterial({ color: 0xc2b59b, roughness: 0.9, side: THREE.DoubleSide });
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });
    const wreckDeckMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9, side: THREE.DoubleSide });
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.85, side: THREE.DoubleSide });

    const addMesh = (geo, mat, name) => {
        const mesh = new THREE.Mesh(geo, mat);
        if (name) mesh.name = name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    };

    addMesh(buildWreckHullGeometry(), hullMat, 'wreckHull');
    addMesh(buildWreckDeckGeometry(), wreckDeckMat);
    addMesh(buildWreckRibGeometry(), ribMat);
    addMesh(new THREE.TubeGeometry(buildWreckKeelCurve(), 48, 0.18, 6, false), darkTimberMat);

    // Two snapped masts with splintered tops, yards and tattered sails
    const deckY = (s) => wreckSheerBase(s, depth);
    const mastSpecs = [
        { s: 0.60, height: 11.6, lean: [-0.05, 0.10], snap: 0.84 },
        { s: 0.32, height: 8.6, lean: [0.06, -0.22], snap: 0.70 }
    ];
    const mastTops = [];
    mastSpecs.forEach((m, idx) => {
        const base = new THREE.Vector3((m.s - 0.5) * length, deckY(m.s), 0.0);
        const dir = new THREE.Vector3(m.lean[0], 1.0, m.lean[1]).normalize();
        const top = base.clone().addScaledVector(dir, m.height * m.snap);
        mastTops.push(top);
        addWreckSpar(group, base, top, 0.24, 0.13, bleachedTimberMat, 8);

        const spike = top.clone().addScaledVector(dir, 0.8).add(new THREE.Vector3(0.22, 0.0, 0.12));
        addWreckSpar(group, top, spike, 0.13, 0.0, bleachedTimberMat, 6);

        const yardCenter = base.clone().addScaledVector(dir, m.height * 0.62);
        addWreckSpar(
            group,
            yardCenter.clone().add(new THREE.Vector3(0.0, 0.0, -3.7)),
            yardCenter.clone().add(new THREE.Vector3(0.0, 0.3, 3.6)),
            0.09, 0.07, darkTimberMat, 7
        );

        const sail = addMesh(buildTatteredSailGeometry(6.8, m.height * 0.42, idx * 3.1 + 1.0), tatteredSailMat);
        sail.position.copy(yardCenter);
    });

    // Bowsprit out past the bow
    const bowBase = new THREE.Vector3((0.92 - 0.5) * length, deckY(0.92) - 0.2, 0.0);
    addWreckSpar(group, bowBase, bowBase.clone().add(new THREE.Vector3(6.2, 1.1, 0.0)), 0.22, 0.08, bleachedTimberMat, 7);

    // Surviving rigging lines from mast tops to the deck
    const deckPoint = (s) => new THREE.Vector3((s - 0.5) * length, deckY(s) + 0.15, 0.0);
    const rigPositions = [];
    const addRigLine = (a, b) => rigPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    addRigLine(mastTops[0], deckPoint(0.90));
    addRigLine(mastTops[0], deckPoint(0.08));
    addRigLine(mastTops[1], deckPoint(0.62));
    addRigLine(mastTops[1], deckPoint(0.12));
    const rigGeo = new THREE.BufferGeometry();
    rigGeo.setAttribute('position', new THREE.Float32BufferAttribute(rigPositions, 3));
    group.add(new THREE.LineSegments(rigGeo, new THREE.LineBasicMaterial({ color: 0x2b2118 })));

    return group;
}

// Drops the wreck so its lowest hull point sits just below the seabed (keel buried in sand).
// The waterline (y = 0) then cuts through roughly the middle of the hull.
function seatWreckOnSeabed(group, embed) {
    group.position.y = 0.0;
    group.updateMatrixWorld(true);
    const hull = group.getObjectByName('wreckHull');
    const pos = hull.geometry.attributes.position;
    const v = new THREE.Vector3();
    let worstDrop = -Infinity;
    for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(group.matrixWorld);
        worstDrop = Math.max(worstDrop, getIslandHeight(v.x, v.z) - v.y);
    }
    group.position.y = worstDrop - embed;
    group.updateMatrixWorld(true);
}


function createShipwreckAndProps() {
    // ========================================================================
    // 1. WEATHERED GALLEON / SCHOONER SHIPWRECK, HALF-SUBMERGED ON THE NE SHELF
    // ========================================================================
    const wreckGroup = buildShipwreckGroup();
    scene.add(wreckGroup);
    seatWreckOnSeabed(wreckGroup, 0.12);

    // Shared timber materials for the pier, cabin, outriggers and driftwood below
    const darkTimberMat = new THREE.MeshStandardMaterial({ color: 0x3b2818, roughness: 0.92 });
    const bleachedTimberMat = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.88 });

    // ========================================================================
    // 2. MALDIVES OVERWATER THATCH BUNGALOW & TIMBER BOARDWALK PIER
    // ========================================================================
    const pierGroup = new THREE.Group();
    const px = 42.0, pz = 28.0;
    pierGroup.position.set(px, 0.0, pz);
    pierGroup.rotation.y = -0.58; // Extend from sandy beach out into the turquoise lagoon

    const deckMat = new THREE.MeshStandardMaterial({ color: 0x785b3c, roughness: 0.85 });
    const thatchMat = new THREE.MeshStandardMaterial({ color: 0x9c7e44, roughness: 0.92 });
    const lanternMat = new THREE.MeshStandardMaterial({
        color: 0xffb74d,
        emissive: 0xff9800,
        emissiveIntensity: 1.8
    });

    // Boardwalk stilts & planks (26m long walkway)
    const postGeo = new THREE.CylinderGeometry(0.14, 0.16, 4.2, 8);
    const plankGeo = new THREE.BoxGeometry(2.6, 0.12, 0.42);
    for (let d = 0; d <= 26; d += 2.2) {
        for (let side = -1; side <= 1; side += 2) {
            const post = new THREE.Mesh(postGeo, darkTimberMat);
            post.position.set(side * 1.15, 0.2, d);
            post.castShadow = true;
            pierGroup.add(post);
        }
        // Glowing pier lanterns every 6.6 meters
        if (d > 4 && Math.round(d) % 6 === 0) {
            const lPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 6), darkTimberMat);
            lPost.position.set(1.22, 2.2, d);
            pierGroup.add(lPost);

            const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), lanternMat);
            lantern.position.set(1.22, 2.95, d);
            pierGroup.add(lantern);
        }
    }
    for (let d = 0; d <= 26; d += 0.52) {
        const plank = new THREE.Mesh(plankGeo, deckMat);
        plank.position.set(0, 1.55, d);
        plank.receiveShadow = true;
        plank.castShadow = true;
        pierGroup.add(plank);
    }

    // Overwater Thatch Pavilion / Bungalow at the end of the boardwalk (d = 30)
    const hutDeck = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.22, 8.2), deckMat);
    hutDeck.position.set(0, 1.6, 30.2);
    hutDeck.castShadow = true;
    hutDeck.receiveShadow = true;
    pierGroup.add(hutDeck);

    // Corner support pillars for the pavilion
    for (let cx = -3.4; cx <= 3.4; cx += 6.8) {
        for (let cz = 26.8; cz <= 33.6; cz += 6.8) {
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 6.2, 8), darkTimberMat);
            pillar.position.set(cx, 1.8, cz);
            pillar.castShadow = true;
            pierGroup.add(pillar);
        }
    }

    // Timber cabin walls & tiered palm-thatch pyramid roof
    const cabinWalls = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.8, 5.2), bleachedTimberMat);
    cabinWalls.position.set(0, 3.0, 30.2);
    cabinWalls.castShadow = true;
    cabinWalls.receiveShadow = true;
    pierGroup.add(cabinWalls);

    const roofTier1 = new THREE.Mesh(new THREE.ConeGeometry(6.8, 2.6, 4), thatchMat);
    roofTier1.position.set(0, 5.2, 30.2);
    roofTier1.rotation.y = Math.PI / 4;
    roofTier1.castShadow = true;
    pierGroup.add(roofTier1);

    const roofTier2 = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4), thatchMat);
    roofTier2.position.set(0, 6.4, 30.2);
    roofTier2.rotation.y = Math.PI / 4;
    roofTier2.castShadow = true;
    pierGroup.add(roofTier2);

    scene.add(pierGroup);
    pierGroup.children.forEach((o) => { if (o.isMesh) batchableMeshes.push(o); });

    // Warm point light inside the overwater bungalow that illuminates the lagoon at dusk/night
    const hutWorldLightPos = new THREE.Vector3(0, 3.2, 26.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.58).add(new THREE.Vector3(px, 0, pz));
    const hutLight = new THREE.PointLight(0xff9d3b, 6.0, 38.0, 1.6);
    hutLight.position.copy(hutWorldLightPos);
    scene.add(hutLight);
    dynamicLights.push({ light: hutLight, baseIntensity: 7.5, phase: 0.0 });

    // ========================================================================
    // 3. BEACHED OUTRIGGER CANOES, DRIFTWOOD LOGS & FLICKERING CAMPFIRE
    // ========================================================================
    const canoeSpots = [
        { x: 64.0, z: 34.0, rotY: 0.85 },
        { x: -38.0, z: 48.0, rotY: -1.25 }
    ];
    canoeSpots.forEach(cs => {
        const cy = getIslandHeight(cs.x, cs.z);
        const canoeGroup = new THREE.Group();
        canoeGroup.position.set(cs.x, cy + 0.18, cs.z);
        canoeGroup.rotation.y = cs.rotY;

        const bodyGeo = new THREE.CylinderGeometry(0.45, 0.35, 5.6, 10, 8);
        bodyGeo.rotateZ(Math.PI / 2);
        bodyGeo.scale(1.0, 0.65, 0.85);
        const body = new THREE.Mesh(bodyGeo, bleachedTimberMat);
        body.castShadow = true;
        canoeGroup.add(body);

        const outriggerFloat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8), darkTimberMat);
        outriggerFloat.rotation.z = Math.PI / 2;
        outriggerFloat.position.set(0, -0.05, 1.65);
        canoeGroup.add(outriggerFloat);

        for (let s = -1.2; s <= 1.2; s += 2.4) {
            const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.75, 6), darkTimberMat);
            strut.rotation.x = Math.PI / 2;
            strut.position.set(s, 0.1, 0.82);
            canoeGroup.add(strut);
        }
        scene.add(canoeGroup);
    });

    // Sun-bleached driftwood logs & giant clam shells along the high-tide mark
    const driftLogGeo = new THREE.CylinderGeometry(0.18, 0.28, 4.8, 7);
    driftLogGeo.rotateZ(Math.PI / 2);
    for (let d = 0; d < 24; d++) {
        const ang = (d / 24) * Math.PI * 2 + 0.2;
        let dx = Math.cos(ang) * (54.0 + hash2D(d, 3.1) * 32.0);
        let dz = Math.sin(ang) * (54.0 + hash2D(d, 8.7) * 32.0);
        if (d % 4 === 0) {
            dx = 95.0 + hash2D(d, 2.3) * 45.0;
            dz = 28.0 + (hash2D(d, 5.9) - 0.5) * 28.0;
        }
        const dy = getIslandHeight(dx, dz);
        if (dy > 0.12 && dy < 0.85 && !isNearCampOrCabin(dx, dz, 11.0)) {
            const log = new THREE.Mesh(driftLogGeo, bleachedTimberMat);
            log.position.set(dx, dy + 0.08, dz);
            log.rotation.y = hash2D(dx, dz) * Math.PI * 2;
            log.rotation.z = (hash2D(dz, dx) - 0.5) * 0.15;
            log.scale.setScalar(0.65 + hash2D(d, 4.4) * 0.85);
            log.castShadow = true;
            log.receiveShadow = true;
            scene.add(log);
            batchableMeshes.push(log);
        }
    }

    // Cozy Beach Campfire with grounded Stone Hearth, Natural Firewood Logs & Barbeque Spit-Roast Rig
    const fireX = CAMPFIRE_POS.x, fireZ = CAMPFIRE_POS.z;
    const fireY = getIslandHeight(fireX, fireZ);
    const fireGroup = new THREE.Group();
    fireGroup.position.set(fireX, fireY + 0.02, fireZ);

    const fireStoneMat = new THREE.MeshStandardMaterial({ color: 0x4b4843, roughness: 0.92 });
    const charredBarkMat = new THREE.MeshStandardMaterial({ color: 0x2a1b10, roughness: 0.94 });
    const splitHeartwoodMat = new THREE.MeshStandardMaterial({ color: 0x7c5330, roughness: 0.85 });
    const emberBedMat = new THREE.MeshStandardMaterial({
        color: 0xff5500,
        emissive: 0xff2a00,
        emissiveIntensity: 2.3,
        roughness: 0.65
    });
    const ironBBQMat = new THREE.MeshStandardMaterial({ color: 0x1f2429, roughness: 0.45, metalness: 0.78 });
    const roastMeatMat = new THREE.MeshStandardMaterial({ color: 0x9e3f19, roughness: 0.42 });
    const roastGoldenMat = new THREE.MeshStandardMaterial({ color: 0xd97724, roughness: 0.38 });
    const herbPepperMat = new THREE.MeshStandardMaterial({ color: 0x2e6f28, roughness: 0.55 });

    // 1. Ring of natural beach fire-stones enclosing the bonfire pit
    for (let s = 0; s < 14; s++) {
        const sa = (s / 14) * Math.PI * 2;
        const sr = 1.05 + (s % 2) * 0.06;
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.20 + (s % 3) * 0.03, 1), fireStoneMat);
        stone.scale.set(1.2, 0.72, 1.0);
        stone.position.set(Math.cos(sa) * sr, 0.09, Math.sin(sa) * sr);
        stone.rotation.y = sa + 0.4;
        stone.castShadow = true;
        stone.receiveShadow = true;
        fireGroup.add(stone);
    }

    // 2. Glowing bed of red-hot charcoal embers at the center of the pit
    const emberMound = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.92, 0.16, 14), emberBedMat);
    emberMound.position.y = 0.07;
    fireGroup.add(emberMound);

    for (let c = 0; c < 12; c++) {
        const ca = c * 2.39996;
        const cr = Math.sqrt(c / 12) * 0.68;
        const coal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), c % 3 === 0 ? charredBarkMat : emberBedMat);
        coal.scale.set(1.2, 0.65, 0.95);
        coal.position.set(Math.cos(ca) * cr, 0.13, Math.sin(ca) * cr);
        coal.rotation.set(c * 0.7, c * 1.1, 0);
        fireGroup.add(coal);
    }

    // 3. Grounded base logs lying flat across the ember bed (no upside-down floating cones!)
    const baseLogSpecs = [
        { x:  0.00, y: 0.15, z: -0.22, rotY:  0.22, len: 1.65, r: 0.13 },
        { x:  0.00, y: 0.15, z:  0.22, rotY:  0.14, len: 1.60, r: 0.125 },
        { x: -0.18, y: 0.27, z:  0.00, rotY:  1.72, len: 1.55, r: 0.12 },
        { x:  0.20, y: 0.27, z:  0.02, rotY: -1.42, len: 1.50, r: 0.115 }
    ];
    baseLogSpecs.forEach((spec, idx) => {
        const logMesh = new THREE.Mesh(new THREE.CylinderGeometry(spec.r * 0.94, spec.r, spec.len, 9), idx % 2 === 0 ? charredBarkMat : darkTimberMat);
        logMesh.rotation.order = 'YXZ';
        logMesh.rotation.y = spec.rotY;
        logMesh.rotation.z = Math.PI / 2;
        logMesh.position.set(spec.x, spec.y, spec.z);
        logMesh.castShadow = true;
        logMesh.receiveShadow = true;
        fireGroup.add(logMesh);

        // Glowing charred inner core on the base logs
        const endDisk = new THREE.Mesh(new THREE.CylinderGeometry(spec.r * 0.76, spec.r * 0.76, spec.len + 0.01, 8), splitHeartwoodMat);
        endDisk.rotation.copy(logMesh.rotation);
        endDisk.position.copy(logMesh.position);
        fireGroup.add(endDisk);
    });

    // 4. Properly oriented teepee firewood logs with thick base planted on the ground & leaning inward to the center
    const teepeeLogs = 7;
    for (let l = 0; l < teepeeLogs; l++) {
        const la = (l / teepeeLogs) * Math.PI * 2 + 0.18;
        const logLen = 1.28 + (l % 2) * 0.12;
        const rBottom = 0.115;
        const rTop = 0.085;
        // Translate cylinder so y=0 is the heavy bottom butt resting on the ground/stones
        const tLogGeo = new THREE.CylinderGeometry(rTop, rBottom, logLen, 8);
        tLogGeo.translate(0, logLen * 0.5, 0);

        const basePt = new THREE.Vector3(Math.cos(la) * 0.74, 0.08, Math.sin(la) * 0.74);
        const topPt = new THREE.Vector3(
            Math.cos(la + 0.35) * 0.11,
            0.68 + (l % 3) * 0.05,
            Math.sin(la + 0.35) * 0.11
        );
        const dir = new THREE.Vector3().subVectors(topPt, basePt).normalize();

        const fLog = new THREE.Mesh(tLogGeo, l % 2 === 0 ? darkTimberMat : charredBarkMat);
        fLog.position.copy(basePt);
        fLog.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        fLog.castShadow = true;
        fLog.receiveShadow = true;
        fireGroup.add(fLog);
    }

    // 5. High-Detail Tribal Barbeque / Spit-Roast & Swing-Grill Rig over the Campfire
    const bbqGroup = new THREE.Group();
    bbqGroup.rotation.y = 0.32; // Aligned comfortably with the cabin veranda & beach path
    fireGroup.add(bbqGroup);

    const forkSpan = 1.28;
    const forkHeight = 1.36;
    const ropeLashBBQMat = new THREE.MeshStandardMaterial({ color: 0xc2a36b, roughness: 0.9 });

    // Two sturdy Y-forked wooden support posts driven into the sand on either side of the fire
    for (let side = -1; side <= 1; side += 2) {
        const px = side * forkSpan;
        const mainPost = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, forkHeight, 8), darkTimberMat);
        mainPost.position.set(px, forkHeight * 0.5 - 0.05, 0);
        mainPost.castShadow = true;
        bbqGroup.add(mainPost);

        // Y-fork branches at top of each upright post cradling the spit crossbar
        for (let branch = -1; branch <= 1; branch += 2) {
            const tines = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.36, 7), darkTimberMat);
            tines.position.set(px, forkHeight - 0.02, branch * 0.09);
            tines.rotation.x = branch * 0.42;
            tines.castShadow = true;
            bbqGroup.add(tines);
        }

        // Hemp rope lashings around the fork neck
        for (let r = 0; r < 3; r++) {
            const lash = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.014, 6, 10), ropeLashBBQMat);
            lash.rotation.x = Math.PI / 2;
            lash.position.set(px, forkHeight - 0.14 - r * 0.03, 0);
            bbqGroup.add(lash);
        }
    }

    // Rotating Horizontal Spit-Roast Skewer Rod with Hand-Crank Handle & Roasted Feast
    const spitPivot = new THREE.Group();
    spitPivot.position.set(0, forkHeight + 0.02, 0);
    bbqGroup.add(spitPivot);
    bbqSpitRod = spitPivot;

    const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, forkSpan * 2.25, 8), ironBBQMat);
    rodMesh.rotation.z = Math.PI / 2;
    rodMesh.castShadow = true;
    spitPivot.add(rodMesh);

    // Hand-crank arm & wooden grip on the right end of the spit
    const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.03), ironBBQMat);
    crankArm.position.set(forkSpan * 1.12, -0.10, 0);
    spitPivot.add(crankArm);
    const crankHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 7), splitHeartwoodMat);
    crankHandle.rotation.z = Math.PI / 2;
    crankHandle.position.set(forkSpan * 1.22, -0.20, 0);
    spitPivot.add(crankHandle);

    // Whole Skewered & Seasoned Reef Snapper / Roast Haunch & Kebab Chunks on the Spit
    const wholeFishBody = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), roastGoldenMat);
    wholeFishBody.scale.set(2.15, 0.85, 0.55);
    wholeFishBody.position.set(-0.32, 0, 0);
    wholeFishBody.castShadow = true;
    spitPivot.add(wholeFishBody);

    // Crispy grill-sear stripes on the whole roasted fish
    for (let g = -2; g <= 2; g++) {
        const searBand = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 5, 10), charredBarkMat);
        searBand.rotation.y = Math.PI / 2;
        searBand.scale.set(0.55, 0.88, 1.0);
        searBand.position.set(-0.32 + g * 0.09, 0, 0);
        spitPivot.add(searBand);
    }
    const fishTail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.24, 4), roastMeatMat);
    fishTail.rotation.z = -Math.PI / 2;
    fishTail.scale.set(1.0, 1.0, 0.35);
    fishTail.position.set(-0.78, 0, 0);
    spitPivot.add(fishTail);

    // Skewered Tropical Meat Haunch & Vegetable/Pineapple Kebabs on the right half of the spit
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10), roastMeatMat);
    haunch.scale.set(1.55, 0.92, 0.88);
    haunch.position.set(0.32, 0, 0);
    haunch.castShadow = true;
    spitPivot.add(haunch);

    const kebabOffsets = [-0.88, 0.04, 0.68, 0.82];
    kebabOffsets.forEach((kx, kIdx) => {
        const chunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.085, 0.085, 0.09, 7),
            kIdx % 2 === 0 ? herbPepperMat : roastGoldenMat
        );
        chunk.rotation.z = Math.PI / 2;
        chunk.position.set(kx, 0, 0);
        spitPivot.add(chunk);
    });

    // Suspended Iron Grill Grate over the front coals with Sizzling steaks & fish fillets
    const grateY = 0.72;
    const grateZ = 0.42;
    const grateW = 0.86, grateD = 0.54;
    const grateGroup = new THREE.Group();
    grateGroup.position.set(0.28, grateY, grateZ);
    bbqGroup.add(grateGroup);

    // Outer rectangular iron grate frame + grill bars
    for (let sideZ of [-grateD * 0.5, grateD * 0.5]) {
        const frameBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, grateW, 6), ironBBQMat);
        frameBar.rotation.z = Math.PI / 2;
        frameBar.position.set(0, 0, sideZ);
        grateGroup.add(frameBar);
    }
    for (let bx = -grateW * 0.48; bx <= grateW * 0.48; bx += 0.085) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, grateD, 5), ironBBQMat);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(bx, 0, 0);
        grateGroup.add(bar);
    }
    // Corner iron support legs resting on the hearth stones
    for (let lx of [-grateW * 0.45, grateW * 0.45]) {
        for (let lz of [-grateD * 0.45, grateD * 0.45]) {
            const gLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, grateY - 0.05, 5), ironBBQMat);
            gLeg.position.set(lx, -(grateY - 0.05) * 0.5, lz);
            grateGroup.add(gLeg);
        }
    }
    // Sizzling grilled steaks & fish fillets on top of the grate
    for (let m = 0; m < 3; m++) {
        const steak = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.045, 8), m === 1 ? roastGoldenMat : roastMeatMat);
        steak.scale.set(1.35, 1.0, 0.85);
        steak.position.set(-0.24 + m * 0.24, 0.03, (m % 2 === 0 ? -0.06 : 0.06));
        steak.rotation.y = m * 0.5;
        steak.castShadow = true;
        grateGroup.add(steak);
    }

    // Hanging Cast-Iron Herb & Coconut-Marinade Cauldron on a hooked side arm
    const potArm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.72, 6), ironBBQMat);
    potArm.position.set(-forkSpan + 0.25, 1.02, -0.25);
    potArm.rotation.z = -0.95;
    potArm.rotation.y = 0.4;
    bbqGroup.add(potArm);

    const bbqPot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), ironBBQMat);
    bbqPot.scale.set(1.0, 0.88, 1.0);
    bbqPot.position.set(-0.68, 0.78, -0.36);
    bbqPot.castShadow = true;
    bbqGroup.add(bbqPot);

    // Carved Wooden Bench Logs around the campfire for tribal gatherings
    const benchSpots = [
        { x: -1.85, z:  1.45, rotY:  0.68 },
        { x:  2.05, z:  1.25, rotY: -0.78 }
    ];
    benchSpots.forEach(bs => {
        const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 2.25, 10), bleachedTimberMat);
        bench.rotation.order = 'YXZ';
        bench.rotation.y = bs.rotY;
        bench.rotation.z = Math.PI / 2;
        bench.position.set(bs.x, 0.20, bs.z);
        bench.castShadow = true;
        bench.receiveShadow = true;
        fireGroup.add(bench);
    });

    const flameVertexShader = `
        uniform float uTime;
        uniform float uPhase;
        varying vec2 vUv;
        varying float vFlameHeight;
        void main() {
            vec3 p = position;
            float h = clamp(position.y + 0.5, 0.0, 1.0);
            float sway = sin(uTime * 8.0 + h * 7.0 + uPhase) * 0.085
                       + sin(uTime * 4.5 - h * 5.0 + uPhase * 1.7) * 0.045;
            p.x += sway * h;
            p.z += cos(uTime * 7.2 + h * 8.0 + uPhase) * 0.055 * h;
            p.xz *= 1.0 + sin(uTime * 8.5 + h * 6.0 + uPhase) * 0.075 * h;
            vUv = uv;
            vFlameHeight = h;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
    `;
    const flameFragmentShader = `
        uniform float uTime;
        uniform float uPhase;
        uniform float uCore;
        varying vec2 vUv;
        varying float vFlameHeight;

        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
                f.y
            );
        }
        float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 3; i++) {
                value += noise(p) * amplitude;
                p *= 2.03;
                amplitude *= 0.5;
            }
            return value;
        }
        void main() {
            float h = vFlameHeight;
            vec2 flowUv = vec2(vUv.x * 7.0 + uPhase, vUv.y * 4.5 - uTime * 1.8);
            float turbulence = fbm(flowUv);
            float tongues = noise(vec2(vUv.x * 13.0 + uPhase * 1.9, vUv.y * 5.0 - uTime * 2.7));
            float tip = 0.79 + (turbulence - 0.5) * 0.28 + (tongues - 0.5) * 0.12;
            float alpha = smoothstep(0.015, 0.13, h) * (1.0 - smoothstep(tip - 0.08, tip + 0.08, h));
            alpha *= 0.78 + turbulence * 0.32;

            vec3 color = mix(
                vec3(0.82, 0.018, 0.001),
                vec3(1.7, 0.28, 0.012),
                smoothstep(0.12, 0.82, h)
            );
            float hotCore = uCore * (1.0 - smoothstep(0.08, 0.72, h));
            color = mix(color, vec3(2.0, 1.25, 0.22), hotCore * (0.72 + tongues * 0.28));
            color *= 0.78 + turbulence * 0.36 + (tongues - 0.5) * 0.18;
            gl_FragColor = vec4(color * alpha, alpha);
        }
    `;
    const flameGeometry = new THREE.ConeGeometry(0.5, 1.0, 16, 12);
    const flameCount = 8;
    for (let f = 0; f < flameCount; f++) {
        const isCore = f >= 5;
        const phase = f * 1.71;
        const width = isCore ? 0.55 + hash2D(f, 1.3) * 0.12 : 0.82 + hash2D(f, 2.8) * 0.24;
        const height = isCore ? 1.35 + hash2D(f, 4.7) * 0.35 : 1.65 + hash2D(f, 6.1) * 0.55;
        const angle = f * 2.39996;
        const radius = isCore ? 0.12 : 0.24 + hash2D(f, 8.2) * 0.14;
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPhase: { value: phase },
                uCore: { value: isCore ? 1.0 : 0.24 }
            },
            vertexShader: flameVertexShader,
            fragmentShader: flameFragmentShader,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        const flame = new THREE.Mesh(flameGeometry, material);
        flame.position.set(Math.cos(angle) * radius, height * 0.47, Math.sin(angle) * radius);
        flame.scale.set(width, height, width);
        fireGroup.add(flame);
        flameMeshes.push({ mesh: flame, material, phase, width, height });
        fireRenderItems.push({ mesh: flame, distance: 0 });
    }

    const sparkGeometry = new THREE.SphereGeometry(0.045, 6, 6);
    for (let i = 0; i < 9; i++) {
        const phase = i / 9;
        const material = new THREE.MeshBasicMaterial({
            color: i % 3 === 0 ? 0xffe28a : 0xff8a32,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        const spark = new THREE.Mesh(sparkGeometry, material);
        fireGroup.add(spark);
        fireSparks.push({ mesh: spark, material, phase });
        fireRenderItems.push({ mesh: spark, distance: 0 });
    }
    fireGroup.scale.setScalar(1.3);
    scene.add(fireGroup);

    const smokeGroup = new THREE.Group();
    smokeGroup.position.set(fireX, fireY + 0.05, fireZ);
    const smokeCanvas = document.createElement('canvas');
    smokeCanvas.width = 128;
    smokeCanvas.height = 128;
    const smokeContext = smokeCanvas.getContext('2d');
    if (!smokeContext) throw new Error('Could not create the campfire smoke texture.');
    const smokeImage = smokeContext.createImageData(smokeCanvas.width, smokeCanvas.height);
    for (let y = 0; y < smokeCanvas.height; y++) {
        for (let x = 0; x < smokeCanvas.width; x++) {
            const nx = (x / 63.5) - 1.0;
            const ny = (y / 63.5) - 1.0;
            const radius = Math.sqrt(nx * nx + ny * ny);
            const cloudNoise = valueNoise2D(nx * 5.2 + 14.7, ny * 5.2 - 6.3);
            const detailNoise = valueNoise2D(nx * 12.0 - 2.4, ny * 12.0 + 8.1);
            const edge = 0.88 + (cloudNoise - 0.5) * 0.38;
            const density = 1.0 - smoothstep(edge * 0.42, edge, radius);
            const alpha = Math.pow(Math.max(0, density), 1.35) * (0.38 + cloudNoise * 0.38 + detailNoise * 0.24);
            const pixel = (y * smokeCanvas.width + x) * 4;
            smokeImage.data[pixel] = 255;
            smokeImage.data[pixel + 1] = 255;
            smokeImage.data[pixel + 2] = 255;
            smokeImage.data[pixel + 3] = Math.round(alpha * 255);
        }
    }
    smokeContext.putImageData(smokeImage, 0, 0);
    const smokeTexture = new THREE.CanvasTexture(smokeCanvas);
    const smokePlaneGeometry = new THREE.PlaneGeometry(1, 1);
    const smokeCount = 13;
    for (let i = 0; i < smokeCount; i++) {
        const smokeMat = new THREE.MeshBasicMaterial({
            map: smokeTexture,
            color: 0x959c99,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            toneMapped: false
        });
        const puff = new THREE.Mesh(smokePlaneGeometry, smokeMat);
        smokeGroup.add(puff);
        smokePuffs.push({ mesh: puff, material: smokeMat, phase: i / smokeCount, distance: 0 });
        fireRenderItems.push({ mesh: puff, distance: 0 });
    }
    scene.add(smokeGroup);

    const fireLight = new THREE.PointLight(0xff5722, 11.0, 40.0, 1.5);
    fireLight.position.set(fireX, fireY + 1.6, fireZ);
    scene.add(fireLight);
    dynamicLights.push({ light: fireLight, baseIntensity: 14.0, phase: 2.4 });
}
