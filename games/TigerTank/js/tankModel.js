// ============================================================================
// TigerTank 3D Model Construction (Pz.Kpfw. VI Tiger Ausf. E "3818")
// Detailed Hull, Turret, Mantlet, 8.8cm KwK 36, Schachtellaufwerk Tracks
// ============================================================================

var tankModel = null;
var tankRoot = null;
var hullGroup = null;
var turretGroup = null;
var gunElevationPivot = null;
var barrelRecoilGroup = null;
var mainGunMuzzleTip = null;
var coaxMuzzleRef = null;
var bowMgGroup = null;
var bowMgBarrel = null;
var headlightLights = [];
var smokeTubes = [];
var roadWheelStations = { left: [], right: [] };
var driveSprockets = [];
var idlerWheels = [];
var trackChains = { left: [], right: [] };
var evaluateTrackPoint = null;
var updateTracksGeometry = null;

function addPart(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    if (geo.attributes.uv && !geo.attributes.uv2) {
        geo.setAttribute('uv2', geo.attributes.uv);
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

function buildTigerTank(scene, mats) {
    tankRoot = new THREE.Group();
    scene.add(tankRoot);

    // Chassis group (pitches/rolls/heaves dynamically on torsion bar springs)
    hullGroup = new THREE.Group();
    hullGroup.position.y = 0.92;
    tankRoot.add(hullGroup);

    // --- 1. LOWER HULL, STEPPED SUPERSTRUCTURE & FRONT GLACIS ---
    // Lower Hull Tub (Wanne)
    addPart(hullGroup, new THREE.BoxGeometry(2.15, 0.56, 5.85), mats.armorDark, 0, -0.1, 0);

    // Upper Hull Superstructure (Wide Box over Sponsons)
    addPart(hullGroup, new THREE.BoxGeometry(3.12, 0.56, 4.95), mats.armor, 0, 0.42, -0.15);

    // Vertical Stepped Front Hull Plate (Fahrerfrontplatte - 100mm armor)
    addPart(hullGroup, new THREE.BoxGeometry(3.12, 0.54, 0.25), mats.armor, 0, 0.43, 2.38, 0.14, 0, 0);

    // Sloped Front Glacis Deck (Vorpanzer roof connecting step to nose)
    addPart(hullGroup, new THREE.BoxGeometry(3.10, 0.12, 0.82), mats.armor, 0, 0.14, 2.75, 0.22, 0, 0);

    // Upper & Lower Nose Plates (Bugplatte)
    addPart(hullGroup, new THREE.BoxGeometry(2.22, 0.36, 0.22), mats.armor, 0, -0.02, 3.08, -0.42, 0, 0);
    addPart(hullGroup, new THREE.BoxGeometry(2.16, 0.36, 0.20), mats.armorDark, 0, -0.26, 2.98, 0.45, 0, 0);

    // --- 2. FRONT GLACIS DETAILS: SPARE TRACKS, SHOVEL, KUGELBLENDE MG34 & DRIVER VISOR ---
    // Lower Front Spare Track Bracket + 14 Track Links
    addPart(hullGroup, new THREE.BoxGeometry(1.78, 0.06, 0.08), mats.armor, 0, -0.06, 3.21);
    for (let i = -6; i <= 6; i++) {
        addPart(hullGroup, new THREE.BoxGeometry(0.11, 0.32, 0.08), mats.trackSteel, i * 0.13, -0.05, 3.17, -0.40, 0, 0);
        addPart(hullGroup, new THREE.BoxGeometry(0.04, 0.06, 0.12), mats.trackSteel, i * 0.13, 0.04, 3.21, -0.40, 0, 0);
    }

    // Front Glacis Pioneer Shovel
    addPart(hullGroup, new THREE.CylinderGeometry(0.022, 0.022, 1.25, 8), mats.woodHandle, 0.12, 0.16, 2.86, 0, 0, Math.PI / 2);
    addPart(hullGroup, new THREE.BoxGeometry(0.22, 0.02, 0.26), mats.muzzleBlack, -0.56, 0.16, 2.86, 0.2, 0, 0);
    addPart(hullGroup, new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), mats.woodHandle, 0.75, 0.16, 2.86);

    // Driver's Armored Visor Port (Fahrersehklappe on Front-Left, +X)
    const visorGroup = new THREE.Group();
    visorGroup.position.set(0.68, 0.44, 2.51);
    hullGroup.add(visorGroup);
    addPart(visorGroup, new THREE.BoxGeometry(0.48, 0.24, 0.12), mats.armor, 0, 0, 0);
    addPart(visorGroup, new THREE.BoxGeometry(0.32, 0.045, 0.14), mats.muzzleBlack, 0, 0.02, 0.01);

    // Kugelblende 50 Ball-Mounted Bow MG34 (Front-Right, -X)
    bowMgGroup = new THREE.Group();
    bowMgGroup.position.set(-0.74, 0.44, 2.51);
    hullGroup.add(bowMgGroup);
    addPart(bowMgGroup, new THREE.CylinderGeometry(0.18, 0.21, 0.12, 18), mats.armor, 0, 0, 0, Math.PI / 2, 0, 0);
    addPart(bowMgGroup, new THREE.SphereGeometry(0.13, 16, 16), mats.armorDark, 0, 0, 0.04);
    bowMgBarrel = addPart(bowMgGroup, new THREE.CylinderGeometry(0.024, 0.028, 0.42, 10), mats.muzzleBlack, 0, 0, 0.22, Math.PI / 2, 0, 0);

    // Twin Bosch Blackout Headlights on Front Hull Corners + Spotlights
    headlightLights = [];
    [-1.28, 1.28].forEach((hx) => {
        const hlGroup = new THREE.Group();
        hlGroup.position.set(hx, 0.76, 2.28);
        hullGroup.add(hlGroup);
        addPart(hlGroup, new THREE.BoxGeometry(0.08, 0.12, 0.08), mats.armorDark, 0, -0.06, 0);
        addPart(hlGroup, new THREE.CylinderGeometry(0.095, 0.085, 0.14, 16), mats.armor, 0, 0.03, 0, Math.PI / 2, 0, 0);
        addPart(hlGroup, new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16), mats.muzzleBlack, 0, 0.03, 0.075, Math.PI / 2, 0, 0);
        
        const slitMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        addPart(hlGroup, new THREE.BoxGeometry(0.09, 0.022, 0.02), slitMat, 0, 0.03, 0.082);

        const spot = new THREE.SpotLight(0xfef08a, 0.0, 38, Math.PI / 5, 0.45, 1.5);
        spot.position.set(0, 0.03, 0.1);
        spot.target.position.set(0, -0.5, 12);
        hlGroup.add(spot);
        hlGroup.add(spot.target);
        headlightLights.push({ spot, slitMat });
    });

    // Upper Hull Roof Pioneer Tools, Driver/Radio Hatches
    [-0.72, 0.72].forEach((hx) => {
        addPart(hullGroup, new THREE.CylinderGeometry(0.28, 0.28, 0.05, 18), mats.armor, hx, 0.71, 1.85);
        addPart(hullGroup, new THREE.CylinderGeometry(0.05, 0.05, 0.09, 10), mats.armorDark, hx * 0.85, 0.73, 2.02);
    });
    addPart(hullGroup, new THREE.BoxGeometry(0.32, 0.11, 0.24), mats.woodHandle, -0.22, 0.74, 2.02, 0, 0.12, 0);
    addPart(hullGroup, new THREE.CylinderGeometry(0.016, 0.016, 0.85, 8), mats.woodHandle, 0.25, 0.72, 1.98, 0, 0.08, Math.PI / 2);
    addPart(hullGroup, new THREE.CylinderGeometry(0.016, 0.016, 0.75, 8), mats.woodHandle, 0.28, 0.72, 1.84, 0, -0.05, Math.PI / 2);

    // --- 3. SEGMENTED SIDE MUDGUARDS (SCHÜRZEN) & SIDE TOW CABLES ---
    [-1, 1].forEach((side) => {
        const sx = side * 1.66;
        for (let seg = 0; seg < 5; seg++) {
            const sz = 1.65 - seg * 0.92;
            addPart(hullGroup, new THREE.BoxGeometry(0.22, 0.035, 0.89), mats.armor, sx, 0.16, sz);
            addPart(hullGroup, new THREE.BoxGeometry(0.04, 0.24, 0.89), mats.armor, sx + side * 0.11, 0.05, sz, 0, 0, -side * 0.22);
        }
        addPart(hullGroup, new THREE.BoxGeometry(0.72, 0.04, 0.56), mats.armor, side * 1.42, 0.12, 2.52, 0.34, 0, 0);
        addPart(hullGroup, new THREE.BoxGeometry(0.72, 0.04, 0.48), mats.armor, side * 1.42, 0.12, -2.55, -0.34, 0, 0);

        const hullWallX = side * 1.58;
        for (let r = 0; r < 2; r++) {
            addPart(hullGroup, new THREE.CylinderGeometry(0.015, 0.015, 2.8, 8), mats.cableSteel, hullWallX, 0.58 - r * 0.07, -0.2, Math.PI / 2, 0, 0);
            addPart(hullGroup, new THREE.CylinderGeometry(0.024, 0.024, 3.1, 10), mats.cableSteel, hullWallX, 0.38 - r * 0.08, -0.35, Math.PI / 2, 0.02 * (r ? 1 : -1), 0);
        }
        addPart(hullGroup, new THREE.TorusGeometry(0.09, 0.024, 8, 16), mats.cableSteel, hullWallX, 0.35, 1.18, 0, Math.PI / 2, 0);
        addPart(hullGroup, new THREE.TorusGeometry(0.09, 0.024, 8, 16), mats.cableSteel, hullWallX, 0.35, -1.88, 0, Math.PI / 2, 0);
    });

    // --- 4. REAR ENGINE DECK, PERFORATED GRILLES, FEIFEL AIR FILTERS & EXHAUSTS ---
    [-0.85, 0.85].forEach((gx) => {
        addPart(hullGroup, new THREE.BoxGeometry(0.86, 0.03, 1.75), mats.grille, gx, 0.70, -1.45);
    });
    addPart(hullGroup, new THREE.BoxGeometry(0.82, 0.05, 1.65), mats.armor, 0, 0.71, -1.45);

    [-0.65, 0.65].forEach((cx) => {
        addPart(hullGroup, new THREE.TorusGeometry(0.45, 0.028, 8, 24), mats.cableSteel, cx, 0.73, -1.45, Math.PI / 2, 0, 0);
    });

    [-0.52, 0.52].forEach((ex) => {
        addPart(hullGroup, new THREE.CylinderGeometry(0.19, 0.19, 0.78, 16), mats.armorDark, ex, 0.32, -2.72);
        addPart(hullGroup, new THREE.CylinderGeometry(0.07, 0.07, 0.88, 12), mats.muzzleBlack, ex, 0.38, -2.72);
        addPart(hullGroup, new THREE.CylinderGeometry(0.16, 0.16, 0.56, 16), mats.armor, ex * 2.1, 0.52, -2.66);
        addPart(hullGroup, new THREE.CylinderGeometry(0.045, 0.045, 0.95, 10), mats.muzzleBlack, ex * 1.3, 0.78, -2.15, 1.35, ex * 0.45, 0);
    });

    // --- 5. TURRET, "3818" DECALS, CUPOLA, NEBELWURFGERÄT & 8.8cm BARREL ---
    turretGroup = new THREE.Group();
    turretGroup.position.set(0, 0.70, 0.12);
    hullGroup.add(turretGroup);

    // Asymmetric Horseshoe-Shaped Tiger I Turret Shell
    addPart(turretGroup, new THREE.CylinderGeometry(1.26, 1.28, 0.76, 36), mats.armor, 0, 0.38, -0.08);
    addPart(turretGroup, new THREE.BoxGeometry(2.14, 0.74, 0.95), mats.armor, 0, 0.38, 0.42);
    addPart(turretGroup, new THREE.CylinderGeometry(1.22, 1.25, 0.06, 36), mats.armor, 0, 0.77, -0.08);

    [-1, 1].forEach((side) => {
        addPart(turretGroup, new THREE.CylinderGeometry(0.14, 0.14, 0.06, 16), mats.armor, side * 1.25, 0.35, 0.18, 0, 0, Math.PI / 2);
        addPart(turretGroup, new THREE.BoxGeometry(0.08, 0.18, 0.18), mats.armorDark, side * 1.11, 0.36, 0.62);
    });

    // Stenciled "3818" Curved Decals on Turret Sides
    const leftDecalGeo = new THREE.CylinderGeometry(1.286, 1.286, 0.46, 24, 1, true, Math.PI * 0.25, Math.PI * 0.36);
    addPart(turretGroup, leftDecalGeo, mats.decal3818, 0, 0.42, -0.08);

    const rightDecalGeo = new THREE.CylinderGeometry(1.286, 1.286, 0.46, 24, 1, true, -Math.PI * 0.61, Math.PI * 0.36);
    addPart(turretGroup, rightDecalGeo, mats.decal3818, 0, 0.42, -0.08);

    // Rear Stowage Bin (Rommelkiste)
    addPart(turretGroup, new THREE.BoxGeometry(1.68, 0.56, 0.52), mats.armor, 0, 0.38, -1.36);
    addPart(turretGroup, new THREE.CylinderGeometry(0.84, 0.84, 0.56, 20), mats.armor, 0, 0.38, -1.16);

    // Commander's Drum Cupola
    const cupolaGroup = new THREE.Group();
    cupolaGroup.position.set(0.46, 0.78, -0.22);
    turretGroup.add(cupolaGroup);
    addPart(cupolaGroup, new THREE.CylinderGeometry(0.42, 0.44, 0.34, 24), mats.armor, 0, 0.17, 0);
    addPart(cupolaGroup, new THREE.CylinderGeometry(0.44, 0.44, 0.05, 24), mats.armorDark, 0, 0.33, 0);
    for (let v = 0; v < 5; v++) {
        const ang = (v / 5) * Math.PI * 2;
        addPart(cupolaGroup, new THREE.BoxGeometry(0.14, 0.04, 0.06), mats.muzzleBlack, Math.sin(ang) * 0.42, 0.22, Math.cos(ang) * 0.42, 0, ang, 0);
    }
    addPart(cupolaGroup, new THREE.CylinderGeometry(0.38, 0.38, 0.04, 20), mats.armor, 0, 0.36, 0);

    // Loader's Hatch & Extractor Fan
    addPart(turretGroup, new THREE.BoxGeometry(0.46, 0.06, 0.46), mats.armor, -0.48, 0.80, 0.12);
    addPart(turretGroup, new THREE.CylinderGeometry(0.18, 0.20, 0.07, 16), mats.armorDark, 0.0, 0.80, 0.25);

    // Nebelwurfgerät Smoke Grenade Dischargers
    smokeTubes = [];
    [-1, 1].forEach((side) => {
        const rack = new THREE.Group();
        rack.position.set(side * 1.14, 0.52, 0.62);
        rack.rotation.y = side * 0.18;
        turretGroup.add(rack);

        addPart(rack, new THREE.BoxGeometry(0.10, 0.30, 0.12), mats.armorDark, 0, 0, 0);
        for (let t = -1; t <= 1; t++) {
            const tube = new THREE.Group();
            tube.position.set(side * 0.05, t * 0.095, 0.06);
            tube.rotation.x = -0.38;
            rack.add(tube);
            addPart(tube, new THREE.CylinderGeometry(0.042, 0.042, 0.22, 12), mats.armorDark, 0, 0, 0, Math.PI / 2, 0, 0);
            addPart(tube, new THREE.CylinderGeometry(0.032, 0.032, 0.23, 10), mats.muzzleBlack, 0, 0, 0.01, Math.PI / 2, 0, 0);
            smokeTubes.push(tube);
        }
    });

    // Gun Elevation Pivot & Walzenblende Mantlet
    gunElevationPivot = new THREE.Group();
    gunElevationPivot.position.set(0, 0.39, 0.92);
    turretGroup.add(gunElevationPivot);

    addPart(gunElevationPivot, new THREE.BoxGeometry(1.96, 0.64, 0.32), mats.armor, 0, 0, 0.08);
    addPart(gunElevationPivot, new THREE.BoxGeometry(0.62, 0.54, 0.24), mats.armor, 0.52, 0, 0.20);
    addPart(gunElevationPivot, new THREE.BoxGeometry(0.58, 0.54, 0.22), mats.armor, -0.52, 0, 0.19);
    addPart(gunElevationPivot, new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), mats.muzzleBlack, 0.44, 0.04, 0.28, Math.PI / 2, 0, 0);
    addPart(gunElevationPivot, new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), mats.muzzleBlack, 0.58, 0.04, 0.28, Math.PI / 2, 0, 0);
    coaxMuzzleRef = addPart(gunElevationPivot, new THREE.CylinderGeometry(0.032, 0.032, 0.22, 12), mats.muzzleBlack, -0.54, 0.04, 0.30, Math.PI / 2, 0, 0);
    addPart(gunElevationPivot, new THREE.CylinderGeometry(0.24, 0.28, 0.48, 24), mats.armor, 0, 0, 0.32, Math.PI / 2, 0, 0);

    // Recoiling 8.8 cm KwK 36 L/56 Barrel Assembly
    barrelRecoilGroup = new THREE.Group();
    gunElevationPivot.add(barrelRecoilGroup);

    addPart(barrelRecoilGroup, new THREE.CylinderGeometry(0.155, 0.175, 1.15, 24), mats.barrelSteel, 0, 0, 1.05, Math.PI / 2, 0, 0);
    addPart(barrelRecoilGroup, new THREE.CylinderGeometry(0.162, 0.162, 0.14, 24), mats.armorDark, 0, 0, 1.62, Math.PI / 2, 0, 0);
    addPart(barrelRecoilGroup, new THREE.CylinderGeometry(0.108, 0.138, 2.55, 24), mats.barrelSteel, 0, 0, 2.92, Math.PI / 2, 0, 0);

    // Double-Baffle Muzzle Brake
    const muzzleGroup = new THREE.Group();
    muzzleGroup.position.set(0, 0, 4.35);
    barrelRecoilGroup.add(muzzleGroup);

    addPart(muzzleGroup, new THREE.CylinderGeometry(0.15, 0.11, 0.18, 20), mats.muzzleBlack, 0, 0, -0.14, Math.PI / 2, 0, 0);
    addPart(muzzleGroup, new THREE.CylinderGeometry(0.165, 0.165, 0.42, 24), mats.muzzleBlack, 0, 0, 0.14, Math.PI / 2, 0, 0);
    addPart(muzzleGroup, new THREE.BoxGeometry(0.35, 0.16, 0.13), mats.trackSteel, 0, 0, 0.06);
    addPart(muzzleGroup, new THREE.BoxGeometry(0.35, 0.16, 0.13), mats.trackSteel, 0, 0, 0.24);
    addPart(muzzleGroup, new THREE.CylinderGeometry(0.14, 0.165, 0.08, 24), mats.muzzleBlack, 0, 0, 0.38, Math.PI / 2, 0, 0);
    mainGunMuzzleTip = addPart(muzzleGroup, new THREE.CylinderGeometry(0.095, 0.095, 0.12, 20), new THREE.MeshBasicMaterial({ color: 0x050608 }), 0, 0, 0.39, Math.PI / 2, 0, 0);

    // --- 6. SCHACHTELLAUFWERK WHEELS & ARTICULATED TRACKS ---
    roadWheelStations = { left: [], right: [] };
    driveSprockets = [];
    idlerWheels = [];
    trackChains = { left: [], right: [] };

    const dishTireGeo = new THREE.CylinderGeometry(0.41, 0.41, 0.09, 28);
    dishTireGeo.rotateZ(Math.PI / 2);
    const dishRimGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.10, 28);
    dishRimGeo.rotateZ(Math.PI / 2);
    const dishInnerRecessGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.106, 24);
    dishInnerRecessGeo.rotateZ(Math.PI / 2);
    const hubCapGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.13, 16);
    hubCapGeo.rotateZ(Math.PI / 2);

    function createInterleavedWheelCluster(sideSign, stationIndex) {
        const cluster = new THREE.Group();
        const spinGroup = new THREE.Group();
        cluster.add(spinGroup);

        const isOuter = (stationIndex % 2 === 0);
        const lateralOffsets = isOuter
            ? [sideSign * 0.22, -sideSign * 0.08]
            : [sideSign * 0.07, -sideSign * 0.20];

        lateralOffsets.forEach((lx, idx) => {
            const tire = new THREE.Mesh(dishTireGeo, mats.rubberTire);
            tire.position.x = lx;
            tire.castShadow = true;
            spinGroup.add(tire);

            const rim = new THREE.Mesh(dishRimGeo, mats.armor);
            rim.position.x = lx;
            spinGroup.add(rim);

            if (idx === 0) {
                const recess = new THREE.Mesh(dishInnerRecessGeo, mats.armorDark);
                recess.position.x = lx;
                spinGroup.add(recess);

                const hub = new THREE.Mesh(hubCapGeo, mats.armor);
                hub.position.x = lx + sideSign * 0.015;
                spinGroup.add(hub);

                for (let h = -1; h <= 1; h += 2) {
                    const hole = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.024, 0.024, 0.12, 10),
                        mats.muzzleBlack
                    );
                    hole.rotation.z = Math.PI / 2;
                    hole.position.set(lx + sideSign * 0.01, h * 0.17, 0);
                    spinGroup.add(hole);
                }
            }
        });
        return { cluster, spinGroup };
    }

    function createDriveSprocket(sideSign) {
        const group = new THREE.Group();
        addPart(group, new THREE.CylinderGeometry(0.39, 0.39, 0.52, 24), mats.armorDark, 0, 0, 0, 0, 0, Math.PI / 2);
        addPart(group, new THREE.CylinderGeometry(0.28, 0.28, 0.56, 20), mats.muzzleBlack, 0, 0, 0, 0, 0, Math.PI / 2);
        addPart(group, new THREE.CylinderGeometry(0.14, 0.14, 0.60, 16), mats.armor, sideSign * 0.02, 0, 0, 0, 0, Math.PI / 2);

        for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2;
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.045, 0.24), mats.armor);
            spoke.rotation.x = ang;
            group.add(spoke);
        }
        for (let t = 0; t < 18; t++) {
            const ang = (t / 18) * Math.PI * 2;
            const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.05, 0.08), mats.trackSteel);
            tooth.position.set(0, Math.sin(ang) * 0.42, Math.cos(ang) * 0.42);
            tooth.rotation.x = ang;
            group.add(tooth);
        }
        return group;
    }

    function createIdlerWheel() {
        const group = new THREE.Group();
        addPart(group, new THREE.CylinderGeometry(0.35, 0.35, 0.48, 24), mats.armorDark, 0, 0, 0, 0, 0, Math.PI / 2);
        addPart(group, new THREE.CylinderGeometry(0.24, 0.24, 0.52, 18), mats.muzzleBlack, 0, 0, 0, 0, 0, Math.PI / 2);
        return group;
    }

    const trackLinkGeo = new THREE.BoxGeometry(0.68, 0.045, 0.14);
    const trackGrouserGeo = new THREE.BoxGeometry(0.69, 0.028, 0.035);

    ['left', 'right'].forEach((sideKey) => {
        const sideSign = (sideKey === 'left') ? 1 : -1;
        const trackX = sideSign * 1.38;

        const sprocket = createDriveSprocket(sideSign);
        sprocket.position.set(trackX, -0.16, 2.56);
        hullGroup.add(sprocket);
        driveSprockets.push({ mesh: sprocket, side: sideKey });

        const idler = createIdlerWheel();
        idler.position.set(trackX, -0.12, -2.56);
        hullGroup.add(idler);
        idlerWheels.push({ mesh: idler, side: sideKey });

        for (let i = 0; i < 8; i++) {
            const wz = 1.82 - i * 0.53;
            const { cluster, spinGroup } = createInterleavedWheelCluster(sideSign, i);
            cluster.position.set(trackX, -0.50, wz);
            hullGroup.add(cluster);

            roadWheelStations[sideKey].push({
                cluster,
                spinGroup,
                baseY: -0.50,
                currentOffset: 0,
                velocityY: 0,
                z: wz,
                x: trackX
            });
        }

        const numLinks = 74;
        for (let k = 0; k < numLinks; k++) {
            const linkGroup = new THREE.Group();
            const plate = new THREE.Mesh(trackLinkGeo, mats.trackSteel);
            plate.castShadow = true;
            plate.receiveShadow = true;
            linkGroup.add(plate);

            const cleat = new THREE.Mesh(trackGrouserGeo, mats.muzzleBlack);
            cleat.position.y = -0.032;
            linkGroup.add(cleat);

            linkGroup.position.x = trackX;
            hullGroup.add(linkGroup);
            trackChains[sideKey].push(linkGroup);
        }
    });

    evaluateTrackPoint = function(sideKey, uNorm) {
        const stations = roadWheelStations[sideKey];
        const u = ((uNorm % 1.0) + 1.0) % 1.0;

        if (u < 0.36) {
            const t = u / 0.36;
            const z = 1.88 - t * 3.80;
            const exactIdx = t * 7.0;
            const i0 = Math.max(0, Math.min(7, Math.floor(exactIdx)));
            const i1 = Math.max(0, Math.min(7, i0 + 1));
            const frac = exactIdx - i0;
            const wheelOffset = stations[i0].currentOffset * (1 - frac) + stations[i1].currentOffset * frac;
            const y = -0.92 + wheelOffset;
            return { y, z, pitch: 0 };
        } else if (u < 0.49) {
            const t = (u - 0.36) / 0.13;
            const rearWheelY = -0.92 + stations[7].currentOffset;
            if (t < 0.45) {
                const st = t / 0.45;
                const z = -1.92 - st * 0.64;
                const y = rearWheelY + st * (-0.42 - rearWheelY);
                return { y, z, pitch: -0.62 };
            } else {
                const st = (t - 0.45) / 0.55;
                const ang = -Math.PI * 0.65 - st * Math.PI * 0.85;
                const z = -2.56 + Math.sin(ang) * 0.38;
                const y = -0.12 + Math.cos(ang) * 0.38;
                return { y, z, pitch: ang };
            }
        } else if (u < 0.85) {
            const t = (u - 0.49) / 0.36;
            const z = -2.56 + t * 5.12;
            const sag = Math.sin(t * Math.PI * 4) * 0.018;
            const y = 0.27 - t * 0.02 - sag;
            return { y, z, pitch: Math.PI };
        } else {
            const t = (u - 0.85) / 0.15;
            const frontWheelY = -0.92 + stations[0].currentOffset;
            if (t < 0.55) {
                const st = t / 0.55;
                const ang = st * Math.PI * 0.78;
                const z = 2.56 + Math.sin(ang) * 0.43;
                const y = -0.16 + Math.cos(ang) * 0.43;
                return { y, z, pitch: Math.PI - ang };
            } else {
                const st = (t - 0.55) / 0.45;
                const z = 2.82 - st * 0.94;
                const y = -0.45 + st * (frontWheelY - (-0.45));
                return { y, z, pitch: 0.52 };
            }
        }
    }

    updateTracksGeometry = function(leftPhase, rightPhase) {
        ['left', 'right'].forEach((sideKey) => {
            const links = trackChains[sideKey];
            const phase = (sideKey === 'left') ? leftPhase : rightPhase;
            const n = links.length;
            const du = 0.005;

            for (let i = 0; i < n; i++) {
                const u = (i / n + phase) % 1.0;
                const p0 = evaluateTrackPoint(sideKey, u);
                const p1 = evaluateTrackPoint(sideKey, u + du);
                const dz = p1.z - p0.z;
                const dy = p1.y - p0.y;
                const angle = Math.atan2(dy, -dz);

                links[i].position.y = p0.y;
                links[i].position.z = p0.z;
                links[i].rotation.x = angle;
            }
        });
    }

    window.tankRoot = tankRoot;
    window.hullGroup = hullGroup;
    window.turretGroup = turretGroup;
    window.gunElevationPivot = gunElevationPivot;
    window.barrelRecoilGroup = barrelRecoilGroup;
    window.mainGunMuzzleTip = mainGunMuzzleTip;
    window.coaxMuzzleRef = coaxMuzzleRef;
    window.bowMgGroup = bowMgGroup;
    window.bowMgBarrel = bowMgBarrel;
    window.headlightLights = headlightLights;
    window.smokeTubes = smokeTubes;
    window.roadWheelStations = roadWheelStations;
    window.driveSprockets = driveSprockets;
    window.idlerWheels = idlerWheels;
    window.trackChains = trackChains;
    window.evaluateTrackPoint = evaluateTrackPoint;
    window.updateTracksGeometry = updateTracksGeometry;

    tankModel = {
        tankRoot,
        hullGroup,
        turretGroup,
        gunElevationPivot,
        barrelRecoilGroup,
        mainGunMuzzleTip,
        coaxMuzzleRef,
        bowMgGroup,
        bowMgBarrel,
        headlightLights,
        smokeTubes,
        roadWheelStations,
        driveSprockets,
        idlerWheels,
        trackChains,
        evaluateTrackPoint,
        updateTracksGeometry
    };
    window.tankModel = tankModel;

    return tankModel;
}

window.addPart = addPart;
window.buildTigerTank = buildTigerTank;
window.updateTracksGeometry = updateTracksGeometry;
window.evaluateTrackPoint = evaluateTrackPoint;
