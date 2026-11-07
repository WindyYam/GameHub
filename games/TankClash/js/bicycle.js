// ============================================================================
// 1943 BSA Military Dispatch Bicycle — Model & Rider Controller
// Authentic WWII Dispatch Roadster with Pedal Kinematics & One-Handed Combat
// ============================================================================

(function () {
    let cachedTextures = null;
    let cachedMaterials = null;

    // ------------------------------------------------------------------------
    // 1. PROCEDURAL TEXTURES (Cached single-pass generation)
    // ------------------------------------------------------------------------
    function createBicycleTextures() {
        if (cachedTextures) return cachedTextures;
        if (typeof document === 'undefined' || typeof THREE === 'undefined') return {};

        const textures = {};

        // 1. Weathered Olive Drab Paint + Metallic Scratches
        const odCanvas = document.createElement('canvas');
        odCanvas.width = 512; odCanvas.height = 512;
        const odCtx = odCanvas.getContext('2d');
        odCtx.fillStyle = '#3d452e';
        odCtx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 1800; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const r = 2 + Math.random() * 18;
            odCtx.fillStyle = Math.random() > 0.45 ? 'rgba(42, 48, 31, 0.18)' : 'rgba(85, 76, 52, 0.14)';
            odCtx.beginPath();
            odCtx.arc(x, y, r, 0, Math.PI * 2);
            odCtx.fill();
        }
        for (let i = 0; i < 450; i++) {
            odCtx.strokeStyle = Math.random() > 0.5 ? 'rgba(130, 135, 125, 0.35)' : 'rgba(92, 52, 28, 0.4)';
            odCtx.lineWidth = 0.8 + Math.random() * 1.5;
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            odCtx.beginPath();
            odCtx.moveTo(x, y);
            odCtx.lineTo(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 16);
            odCtx.stroke();
        }
        textures.oliveDrab = new THREE.CanvasTexture(odCanvas);
        textures.oliveDrab.wrapS = textures.oliveDrab.wrapT = THREE.RepeatWrapping;

        // 2. Worn Brooks Leather Saddle Texture
        const leatherCanvas = document.createElement('canvas');
        leatherCanvas.width = 512; leatherCanvas.height = 512;
        const lCtx = leatherCanvas.getContext('2d');
        const grad = lCtx.createRadialGradient(256, 256, 30, 256, 256, 320);
        grad.addColorStop(0, '#6e3b1e');
        grad.addColorStop(0.7, '#4c2611');
        grad.addColorStop(1, '#2b1408');
        lCtx.fillStyle = grad;
        lCtx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 2200; i++) {
            lCtx.strokeStyle = i % 3 === 0 ? 'rgba(25, 10, 3, 0.22)' : 'rgba(145, 88, 45, 0.12)';
            lCtx.lineWidth = 1;
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            lCtx.beginPath();
            lCtx.moveTo(x, y);
            lCtx.quadraticCurveTo(x + 8, y + (Math.random() - 0.5) * 14, x + 16, y);
            lCtx.stroke();
        }
        textures.leather = new THREE.CanvasTexture(leatherCanvas);

        // 3. Woven Khaki Military Canvas + Stencil
        const canvasTex = document.createElement('canvas');
        canvasTex.width = 512; canvasTex.height = 512;
        const cCtx = canvasTex.getContext('2d');
        cCtx.fillStyle = '#7c7454';
        cCtx.fillRect(0, 0, 512, 512);

        for (let y = 0; y < 512; y += 4) {
            cCtx.fillStyle = y % 8 === 0 ? 'rgba(40, 36, 24, 0.16)' : 'rgba(210, 200, 165, 0.1)';
            cCtx.fillRect(0, y, 512, 2);
        }
        for (let x = 0; x < 512; x += 4) {
            cCtx.fillStyle = x % 8 === 0 ? 'rgba(40, 36, 24, 0.16)' : 'rgba(210, 200, 165, 0.1)';
            cCtx.fillRect(x, 0, 2, 512);
        }
        cCtx.save();
        cCtx.font = 'bold 36px "Courier New", Courier, monospace';
        cCtx.fillStyle = 'rgba(228, 222, 195, 0.78)';
        cCtx.textAlign = 'center';
        cCtx.fillText('WD ↑ 43', 256, 235);
        cCtx.font = 'bold 24px "Courier New", Courier, monospace';
        cCtx.fillText('SIG. CORPS', 256, 275);
        cCtx.restore();
        textures.canvasBag = new THREE.CanvasTexture(canvasTex);

        // 4. Heavy Duty Block Tire Tread Map
        const tireCanvas = document.createElement('canvas');
        tireCanvas.width = 512; tireCanvas.height = 128;
        const tCtx = tireCanvas.getContext('2d');
        tCtx.fillStyle = '#1c1d1b';
        tCtx.fillRect(0, 0, 512, 128);

        for (let x = 0; x < 512; x += 16) {
            tCtx.fillStyle = '#2d2b26';
            tCtx.fillRect(x + 2, 12, 11, 42);
            tCtx.fillRect(x + 8, 74, 11, 42);
            tCtx.fillStyle = '#121312';
            tCtx.fillRect(x + 4, 16, 8, 34);
            tCtx.fillRect(x + 10, 78, 8, 34);
        }
        textures.tire = new THREE.CanvasTexture(tireCanvas);
        textures.tire.wrapS = textures.tire.wrapT = THREE.RepeatWrapping;
        textures.tire.repeat.set(14, 1);

        // 5. Cross-Laced 36-Spoke Wheel Disc (Alpha Cutout)
        const spokeColorCanvas = document.createElement('canvas');
        spokeColorCanvas.width = 512; spokeColorCanvas.height = 512;
        const scCtx = spokeColorCanvas.getContext('2d');

        const spokeAlphaCanvas = document.createElement('canvas');
        spokeAlphaCanvas.width = 512; spokeAlphaCanvas.height = 512;
        const saCtx = spokeAlphaCanvas.getContext('2d');

        saCtx.fillStyle = '#000000';
        saCtx.fillRect(0, 0, 512, 512);

        const cx = 256, cy = 256;
        const hubR = 26;
        const rimR = 248;
        const numSpokes = 18;

        for (let i = 0; i < numSpokes; i++) {
            const angle1 = (i / numSpokes) * Math.PI * 2;
            const crossOffset = (i % 2 === 0 ? 1 : -1) * 0.42;
            const angle2 = angle1 + crossOffset;

            const x1 = cx + Math.cos(angle1) * hubR;
            const y1 = cy + Math.sin(angle1) * hubR;
            const x2 = cx + Math.cos(angle2) * rimR;
            const y2 = cy + Math.sin(angle2) * rimR;

            saCtx.strokeStyle = '#ffffff';
            saCtx.lineWidth = 4.2;
            saCtx.beginPath();
            saCtx.moveTo(x1, y1);
            saCtx.lineTo(x2, y2);
            saCtx.stroke();

            scCtx.strokeStyle = i % 2 === 0 ? '#787266' : '#5c5549';
            scCtx.lineWidth = 4.5;
            scCtx.beginPath();
            scCtx.moveTo(x1, y1);
            scCtx.lineTo(x2, y2);
            scCtx.stroke();
        }

        saCtx.strokeStyle = '#ffffff';
        saCtx.lineWidth = 7;
        saCtx.beginPath();
        saCtx.arc(cx, cy, hubR, 0, Math.PI * 2);
        saCtx.stroke();

        scCtx.strokeStyle = '#4e483f';
        scCtx.lineWidth = 8;
        scCtx.beginPath();
        scCtx.arc(cx, cy, hubR, 0, Math.PI * 2);
        scCtx.stroke();

        textures.spokeColor = new THREE.CanvasTexture(spokeColorCanvas);
        textures.spokeAlpha = new THREE.CanvasTexture(spokeAlphaCanvas);

        // 6. Helical Saddle Spring Alpha Map
        const springAlphaCanvas = document.createElement('canvas');
        springAlphaCanvas.width = 64; springAlphaCanvas.height = 128;
        const spCtx = springAlphaCanvas.getContext('2d');
        spCtx.fillStyle = '#000000';
        spCtx.fillRect(0, 0, 64, 128);
        spCtx.fillStyle = '#ffffff';
        for (let y = 6; y < 128; y += 24) {
            spCtx.fillRect(0, y, 64, 13);
        }
        textures.springAlpha = new THREE.CanvasTexture(springAlphaCanvas);

        cachedTextures = textures;
        return textures;
    }

    // ------------------------------------------------------------------------
    // 2. MATERIALS
    // ------------------------------------------------------------------------
    function getBicycleMaterials() {
        if (cachedMaterials) return cachedMaterials;
        if (typeof THREE === 'undefined') return {};

        const textures = createBicycleTextures();
        const mats = {
            matOlive: new THREE.MeshStandardMaterial({
                map: textures.oliveDrab,
                roughness: 0.72,
                metalness: 0.22
            }),
            matDarkSteel: new THREE.MeshStandardMaterial({
                color: 0x2c2f29,
                roughness: 0.48,
                metalness: 0.78
            }),
            matRustedSteel: new THREE.MeshStandardMaterial({
                map: textures.oliveDrab,
                color: 0x564c42,
                roughness: 0.62,
                metalness: 0.65
            }),
            matBrass: new THREE.MeshStandardMaterial({
                color: 0xb89952,
                roughness: 0.35,
                metalness: 0.85
            }),
            matLeather: new THREE.MeshStandardMaterial({
                map: textures.leather,
                roughness: 0.58,
                metalness: 0.08
            }),
            matCanvas: new THREE.MeshStandardMaterial({
                map: textures.canvasBag,
                color: 0x8d8a6f,
                roughness: 0.92,
                metalness: 0.02
            }),
            matTire: new THREE.MeshStandardMaterial({
                map: textures.tire,
                roughness: 0.88,
                metalness: 0.05
            }),
            matSpokeDisc: new THREE.MeshStandardMaterial({
                map: textures.spokeColor,
                alphaMap: textures.spokeAlpha,
                alphaTest: 0.35,
                roughness: 0.45,
                metalness: 0.75,
                side: THREE.DoubleSide
            }),
            matSpringCoil: new THREE.MeshStandardMaterial({
                color: 0x2c2f29,
                alphaMap: textures.springAlpha,
                alphaTest: 0.4,
                roughness: 0.4,
                metalness: 0.85,
                side: THREE.DoubleSide
            }),
            matWhiteTip: new THREE.MeshStandardMaterial({
                color: 0xdcd9cd,
                roughness: 0.75
            }),
            matReflector: new THREE.MeshStandardMaterial({
                color: 0xaa1111,
                emissive: 0x330000,
                roughness: 0.2
            })
        };

        Object.values(mats).forEach(m => {
            if (m.isMeshStandardMaterial) m.envMapIntensity = 0.3;
        });

        cachedMaterials = mats;
        return mats;
    }

    // ------------------------------------------------------------------------
    // 3. GEOMETRY BUILDER HELPERS
    // ------------------------------------------------------------------------
    function createCylinderBetween(p1, p2, rTop, rBottom, radialSegs, material, openEnded = true) {
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        const geo = new THREE.CylinderGeometry(rTop, rBottom, len, radialSegs, 1, openEnded);
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    function buildPedal(matSteel, matRubber, side) {
        const pGroup = new THREE.Group();
        const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 5, 1, true), matSteel);
        spindle.rotation.x = Math.PI / 2;
        pGroup.add(spindle);

        [-0.022, 0.022].forEach(xOff => {
            const block = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.075), matRubber);
            block.position.set(xOff, 0, 0);
            block.castShadow = true;
            pGroup.add(block);
        });
        return pGroup;
    }

    function buildSpokedWheel(radius, matTire, matRim, matHub, matSpokeDisc) {
        const wGroup = new THREE.Group();

        const tireGeo = new THREE.TorusGeometry(radius - 0.028, 0.032, 8, 20);
        const tireMesh = new THREE.Mesh(tireGeo, matTire);
        tireMesh.castShadow = true;
        wGroup.add(tireMesh);

        const rimGeo = new THREE.TorusGeometry(radius - 0.052, 0.012, 6, 20);
        const rimMesh = new THREE.Mesh(rimGeo, matRim);
        rimMesh.castShadow = true;
        wGroup.add(rimMesh);

        const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.095, 8), matHub);
        hubMesh.rotation.x = Math.PI / 2;
        hubMesh.castShadow = true;
        wGroup.add(hubMesh);

        const spokeRadius = radius - 0.052;
        const spokeDiscGeo = new THREE.RingGeometry(0.018, spokeRadius, 16);
        [-1, 1].forEach(flangeSide => {
            const discMesh = new THREE.Mesh(spokeDiscGeo, matSpokeDisc);
            discMesh.position.z = flangeSide * 0.008;
            discMesh.rotation.z = flangeSide === 1 ? 0 : (Math.PI / 18);
            discMesh.castShadow = true;
            wGroup.add(discMesh);
        });

        return wGroup;
    }

    // ------------------------------------------------------------------------
    // 4. COMPLETE BICYCLE MODEL CONSTRUCTION
    // ------------------------------------------------------------------------
    function buildMilitaryBicycle() {
        const mats = getBicycleMaterials();

        const bikeRoot = new THREE.Group();
        bikeRoot.userData.isBicycle = true;

        // Proportional scale to authentically match TankClash adult infantry character (~1.85m height)
        const BIKE_SCALE = 1.18;

        // Inner group rotated by -PI/2 so +X (front) maps to +Z (forward in TankClash)
        // In this orientation:
        // inner +X -> root +Z (forward)
        // inner -X -> root -Z (rearward)
        // inner -Z -> root +X (soldier's left)
        // inner +Z -> root -X (soldier's right)
        const inner = new THREE.Group();
        inner.rotation.y = -Math.PI / 2;
        inner.scale.set(BIKE_SCALE, BIKE_SCALE, BIKE_SCALE);
        bikeRoot.add(inner);

        const wheelR = 0.35;
        const rearHub = new THREE.Vector3(-0.56, wheelR, 0);
        const frontHub = new THREE.Vector3(0.60, wheelR, 0);
        const bbPos = new THREE.Vector3(-0.04, 0.31, 0);
        const seatCluster = new THREE.Vector3(-0.22, 0.74, 0);
        const headTop = new THREE.Vector3(0.42, 0.79, 0);
        const headBottom = new THREE.Vector3(0.46, 0.65, 0);

        // 1. Frame
        const frameGroup = new THREE.Group();
        inner.add(frameGroup);

        frameGroup.add(createCylinderBetween(bbPos, seatCluster, 0.017, 0.017, 6, mats.matOlive));
        frameGroup.add(createCylinderBetween(seatCluster, headTop, 0.016, 0.016, 6, mats.matOlive));
        frameGroup.add(createCylinderBetween(bbPos, headBottom, 0.018, 0.018, 6, mats.matOlive));

        const headTube = createCylinderBetween(
            headBottom.clone().add(new THREE.Vector3(0.01, -0.02, 0)),
            headTop.clone().add(new THREE.Vector3(-0.01, 0.02, 0)),
            0.022, 0.022, 8, mats.matOlive, false
        );
        frameGroup.add(headTube);

        const bbShell = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.085, 8), mats.matOlive);
        bbShell.rotation.x = Math.PI / 2;
        bbShell.position.copy(bbPos);
        frameGroup.add(bbShell);

        [-1, 1].forEach(side => {
            const zHub = side * 0.058;
            const zFrame = side * 0.028;
            const csStart = new THREE.Vector3(bbPos.x, bbPos.y, zFrame);
            const csEnd = new THREE.Vector3(rearHub.x, rearHub.y, zHub);
            frameGroup.add(createCylinderBetween(csStart, csEnd, 0.011, 0.013, 5, mats.matOlive));

            const ssStart = new THREE.Vector3(seatCluster.x, seatCluster.y - 0.02, zFrame);
            const ssEnd = new THREE.Vector3(rearHub.x, rearHub.y + 0.015, zHub);
            frameGroup.add(createCylinderBetween(ssStart, ssEnd, 0.010, 0.011, 5, mats.matOlive));
        });

        // Frame pump
        const pumpPos1 = bbPos.clone().lerp(seatCluster, 0.18).add(new THREE.Vector3(0.032, 0, 0));
        const pumpPos2 = bbPos.clone().lerp(seatCluster, 0.85).add(new THREE.Vector3(0.032, 0, 0));
        frameGroup.add(createCylinderBetween(pumpPos1, pumpPos2, 0.011, 0.011, 6, mats.matDarkSteel, false));
        frameGroup.add(createCylinderBetween(pumpPos2.clone().lerp(pumpPos1, 0.2), pumpPos2, 0.014, 0.014, 6, mats.matLeather, false));

        // 2. Canvas Frame Pouch
        const frameBagGroup = new THREE.Group();
        const bagMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.17, 0.065), mats.matCanvas);
        bagMesh.position.set(0.10, 0.64, 0);
        bagMesh.rotation.z = 0.07;
        bagMesh.castShadow = true;
        frameBagGroup.add(bagMesh);

        [-0.10, 0.10].forEach(offsetX => {
            const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.014, 6, 1, true), mats.matLeather);
            strap.position.set(0.10 + offsetX, 0.73 + offsetX * 0.07, 0);
            strap.rotation.z = Math.PI / 2;
            frameBagGroup.add(strap);
        });
        inner.add(frameBagGroup);

        // 3. Front Steering Assembly (Fork, Raised Handlebars, Headlamp, Front Mudguard & Wheel)
        // Authentic Steering Axis: Head tube runs from headBottom to headTop (raked backward by ~15°)
        const steerPivot = headBottom.clone().lerp(headTop, 0.5);
        // Head tube leans back toward the top; rotating the group by +rake tilts its local +Y back over the rider
        const rakeAngle = Math.atan2(-(headTop.x - headBottom.x), headTop.y - headBottom.y); // ~ +0.28 rad

        const forkSteererGroup = new THREE.Group();
        forkSteererGroup.position.copy(steerPivot);
        forkSteererGroup.rotation.z = rakeAngle;
        inner.add(forkSteererGroup);

        // This group yaws left/right when steering; ALL front parts turn together as one mechanism
        const steeringGroup = new THREE.Group();
        forkSteererGroup.add(steeringGroup);

        // Fork Crown just below lower head cup
        const crownMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.032, 0.11), mats.matOlive);
        crownMesh.position.set(0, -0.095, 0);
        crownMesh.castShadow = true;
        steeringGroup.add(crownMesh);

        // Front Wheel Axle position in steering local space (offset forward with authentic fork rake)
        const localFrontHub = new THREE.Vector3(0.055, -0.405, 0);

        // Fork Blades
        [-1, 1].forEach(side => {
            const bladeTop = new THREE.Vector3(0, -0.095, side * 0.048);
            const bladeBottom = new THREE.Vector3(localFrontHub.x, localFrontHub.y, side * 0.052);
            steeringGroup.add(createCylinderBetween(bladeTop, bladeBottom, 0.015, 0.010, 6, mats.matOlive));
        });

        // Front Mudguard (Fender) attached to fork crown & dropouts
        const frontFenderGeo = new THREE.TorusGeometry(wheelR + 0.024, 0.024, 5, 16, Math.PI * 0.92);
        const frontFender = new THREE.Mesh(frontFenderGeo, mats.matOlive);
        frontFender.scale.set(1, 1, 0.65);
        frontFender.position.copy(localFrontHub);
        frontFender.rotation.z = Math.PI * 0.04;
        frontFender.castShadow = true;
        steeringGroup.add(frontFender);

        [-1, 1].forEach(side => {
            const z = side * 0.052;
            steeringGroup.add(createCylinderBetween(
                new THREE.Vector3(localFrontHub.x, localFrontHub.y, z),
                new THREE.Vector3(localFrontHub.x - 0.28, localFrontHub.y - 0.22, side * 0.022),
                0.0035, 0.0035, 4, mats.matDarkSteel
            ));
        });

        // Front Wheel (spins around its axle)
        const frontWheelGroup = buildSpokedWheel(wheelR, mats.matTire, mats.matOlive, mats.matRustedSteel, mats.matSpokeDisc);
        frontWheelGroup.position.copy(localFrontHub);
        steeringGroup.add(frontWheelGroup);

        // Raised Stem & High-Rise Swept Handlebars
        const STEM_TOP_Y = 0.30;
        steeringGroup.add(createCylinderBetween(new THREE.Vector3(0, 0.06, 0), new THREE.Vector3(0, STEM_TOP_Y, 0), 0.013, 0.013, 6, mats.matDarkSteel, false));
        const stemCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.022, 8), mats.matBrass);
        stemCollar.position.set(0, 0.08, 0);
        steeringGroup.add(stemCollar);

        steeringGroup.add(createCylinderBetween(new THREE.Vector3(0, STEM_TOP_Y, 0), new THREE.Vector3(0.045, STEM_TOP_Y, 0), 0.013, 0.013, 6, mats.matDarkSteel));

        const leftGripAnchor = new THREE.Group();
        [-1, 1].forEach(side => {
            // side = -1: rider's left (z < 0 in inner coords)
            // side = +1: rider's right (z > 0 in inner coords)
            const p0 = new THREE.Vector3(0.045, STEM_TOP_Y, 0);
            const p1 = new THREE.Vector3(0.045, STEM_TOP_Y + 0.02, side * 0.14);
            const p2 = new THREE.Vector3(-0.04, STEM_TOP_Y, side * 0.21);
            const p3 = new THREE.Vector3(-0.11, STEM_TOP_Y - 0.02, side * 0.22);

            steeringGroup.add(createCylinderBetween(p0, p1, 0.011, 0.011, 6, mats.matDarkSteel));
            steeringGroup.add(createCylinderBetween(p1, p2, 0.011, 0.011, 6, mats.matDarkSteel));

            const grip = createCylinderBetween(p2, p3, 0.015, 0.015, 6, mats.matLeather, false);
            steeringGroup.add(grip);

            if (side === -1) {
                // Anchor object for left hand analytical 2-bone IK
                leftGripAnchor.position.copy(p2).lerp(p3, 0.5);
                steeringGroup.add(leftGripAnchor);
            }
        });

        // Brass Bell on right bar (side = +1)
        const bellDome = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), mats.matBrass);
        bellDome.scale.set(1, 0.65, 1);
        bellDome.position.set(0.02, STEM_TOP_Y + 0.02, 0.11);
        steeringGroup.add(bellDome);

        // Blackout Masked Headlamp
        const lampPos = new THREE.Vector3(0.09, 0.05, 0);
        steeringGroup.add(createCylinderBetween(new THREE.Vector3(0, 0.05, 0), lampPos, 0.006, 0.006, 5, mats.matDarkSteel));

        const lampBody = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), mats.matOlive);
        lampBody.scale.set(1.25, 1, 1);
        lampBody.position.copy(lampPos);
        lampBody.castShadow = true;
        steeringGroup.add(lampBody);

        const visorGeo = new THREE.CylinderGeometry(0.053, 0.053, 0.05, 8, 1, true, -Math.PI * 0.5, Math.PI);
        const visorMesh = new THREE.Mesh(visorGeo, mats.matOlive);
        visorMesh.rotation.z = Math.PI / 2;
        visorMesh.rotation.x = Math.PI / 2;
        visorMesh.position.copy(lampPos).add(new THREE.Vector3(0.055, 0.008, 0));
        steeringGroup.add(visorMesh);

        const lensMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
        const lensMesh = new THREE.Mesh(new THREE.CircleGeometry(0.046, 10), lensMat);
        lensMesh.rotation.y = Math.PI / 2;
        lensMesh.position.copy(lampPos).add(new THREE.Vector3(0.064, 0, 0));
        steeringGroup.add(lensMesh);

        // 4. Sprung Leather Saddle (Brooks B33 Pattern)
        const saddleGroup = new THREE.Group();
        inner.add(saddleGroup);

        const seatpostTop = seatCluster.clone().add(new THREE.Vector3(-0.02, 0.08, 0));
        saddleGroup.add(createCylinderBetween(seatCluster, seatpostTop, 0.013, 0.013, 6, mats.matDarkSteel));

        const saddleShape = new THREE.Group();
        saddleShape.position.copy(seatpostTop).add(new THREE.Vector3(-0.01, 0.025, 0));

        const rearCantle = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), mats.matLeather);
        rearCantle.scale.set(1.15, 0.28, 0.95);
        rearCantle.position.set(-0.045, 0, 0);
        rearCantle.castShadow = true;
        saddleShape.add(rearCantle);

        const saddleNose = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.048, 0.15, 8), mats.matLeather);
        saddleNose.rotation.z = Math.PI / 2 - 0.06;
        saddleNose.scale.set(0.55, 1, 0.85);
        saddleNose.position.set(0.055, 0.004, 0);
        saddleNose.castShadow = true;
        saddleShape.add(saddleNose);

        [-1, 1].forEach(side => {
            const springCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 6, 1, true), mats.matSpringCoil);
            springCyl.position.set(-0.08, -0.022, side * 0.052);
            saddleShape.add(springCyl);
        });
        saddleGroup.add(saddleShape);

        // 5. Rear Mudguard (Fender)
        const rearFenderGeo = new THREE.TorusGeometry(wheelR + 0.024, 0.024, 5, 16, Math.PI * 0.95);
        const rearFender = new THREE.Mesh(rearFenderGeo, mats.matOlive);
        rearFender.scale.set(1, 1, 0.65);
        rearFender.position.copy(rearHub);
        rearFender.rotation.z = Math.PI * 0.02;
        rearFender.castShadow = true;
        inner.add(rearFender);

        const rearTipGeo = new THREE.TorusGeometry(wheelR + 0.025, 0.0245, 5, 6, Math.PI * 0.22);
        const rearTip = new THREE.Mesh(rearTipGeo, mats.matWhiteTip);
        rearTip.scale.set(1, 1, 0.66);
        rearTip.position.copy(rearHub);
        rearTip.rotation.z = Math.PI * 0.88;
        inner.add(rearTip);

        const reflector = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.015, 6), mats.matReflector);
        reflector.rotation.z = Math.PI / 2 - 0.25;
        reflector.position.set(rearHub.x - wheelR - 0.028, rearHub.y + 0.08, 0);
        inner.add(reflector);

        [-1, 1].forEach(side => {
            const z = side * 0.052;
            inner.add(createCylinderBetween(
                new THREE.Vector3(rearHub.x, rearHub.y, z),
                new THREE.Vector3(rearHub.x - 0.33, rearHub.y + 0.12, side * 0.022),
                0.0035, 0.0035, 4, mats.matDarkSteel
            ));
        });

        // 6. Rear Cargo Carrier & Canvas Panniers
        const rackGroup = new THREE.Group();
        inner.add(rackGroup);

        const rackY = rearHub.y + wheelR + 0.055;
        const rackFrontX = seatCluster.x - 0.03;
        const rackRearX = rearHub.x - 0.12;

        [-0.065, 0, 0.065].forEach(zOff => {
            rackGroup.add(createCylinderBetween(new THREE.Vector3(rackFrontX, rackY, zOff), new THREE.Vector3(rackRearX, rackY, zOff), 0.006, 0.006, 5, mats.matOlive));
        });
        [-1, 1].forEach(side => {
            rackGroup.add(createCylinderBetween(
                new THREE.Vector3(rearHub.x, rearHub.y, side * 0.058),
                new THREE.Vector3(rearHub.x - 0.04, rackY, side * 0.065),
                0.0065, 0.0065, 5, mats.matOlive
            ));
            const pannierBox = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.23, 0.095), mats.matCanvas);
            pannierBox.position.set(rearHub.x - 0.01, rackY - 0.11, side * 0.115);
            pannierBox.castShadow = true;
            rackGroup.add(pannierBox);

            const flap = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.08, 0.102), mats.matCanvas);
            flap.position.set(rearHub.x - 0.01, rackY - 0.03, side * 0.115);
            rackGroup.add(flap);
        });

        const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 8), mats.matCanvas);
        bedroll.rotation.x = Math.PI / 2;
        bedroll.position.set(rearHub.x - 0.01, rackY + 0.058, 0);
        rackGroup.add(bedroll);

        // 7. Folding Drop Stand
        const rearStandGroup = new THREE.Group();
        rearStandGroup.position.copy(rearHub);
        inner.add(rearStandGroup);

        const standLen = wheelR + 0.045;
        [-1, 1].forEach(side => {
            rearStandGroup.add(createCylinderBetween(
                new THREE.Vector3(0, 0, side * 0.072),
                new THREE.Vector3(-standLen, -0.02, side * 0.072),
                0.006, 0.006, 5, mats.matDarkSteel
            ));
        });
        rearStandGroup.add(createCylinderBetween(
            new THREE.Vector3(-standLen, -0.02, -0.072),
            new THREE.Vector3(-standLen, -0.02, 0.072),
            0.006, 0.006, 5, mats.matDarkSteel
        ));

        // 8. Drivetrain & Pedals
        const guardGroup = new THREE.Group();
        inner.add(guardGroup);

        const guardFront = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.022, 12, 1, false, 0, Math.PI * 1.35), mats.matOlive);
        guardFront.rotation.x = Math.PI / 2;
        guardFront.rotation.y = Math.PI * 0.45;
        guardFront.position.set(bbPos.x, bbPos.y, 0.052);
        guardGroup.add(guardFront);

        const guardWing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.055, 0.018), mats.matOlive);
        guardWing.position.set((bbPos.x + rearHub.x) * 0.5 + 0.02, bbPos.y + 0.068, 0.052);
        guardWing.rotation.z = -0.07;
        guardGroup.add(guardWing);

        inner.add(createCylinderBetween(new THREE.Vector3(bbPos.x, bbPos.y + 0.082, 0.036), new THREE.Vector3(rearHub.x, rearHub.y + 0.038, 0.036), 0.0055, 0.0055, 5, mats.matRustedSteel));
        inner.add(createCylinderBetween(new THREE.Vector3(bbPos.x, bbPos.y - 0.082, 0.036), new THREE.Vector3(rearHub.x, rearHub.y - 0.038, 0.036), 0.0055, 0.0055, 5, mats.matRustedSteel));

        const crankGroup = new THREE.Group();
        crankGroup.position.copy(bbPos);
        inner.add(crankGroup);

        const chainring = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.086, 12), mats.matDarkSteel);
        chainring.position.z = 0.036;
        crankGroup.add(chainring);

        const crankLen = 0.165;
        // Right Crank & Pedal (soldier's right, z = +0.115 in inner coords)
        crankGroup.add(createCylinderBetween(new THREE.Vector3(0, 0, 0.045), new THREE.Vector3(0, -crankLen, 0.055), 0.011, 0.009, 6, mats.matDarkSteel, false));
        const pedalRightGroup = buildPedal(mats.matDarkSteel, mats.matTire, 1);
        pedalRightGroup.position.set(0, -crankLen, 0.115);
        crankGroup.add(pedalRightGroup);

        // Left Crank & Pedal (soldier's left, z = -0.115 in inner coords)
        crankGroup.add(createCylinderBetween(new THREE.Vector3(0, 0, -0.045), new THREE.Vector3(0, crankLen, -0.055), 0.011, 0.009, 6, mats.matDarkSteel, false));
        const pedalLeftGroup = buildPedal(mats.matDarkSteel, mats.matTire, -1);
        pedalLeftGroup.position.set(0, crankLen, -0.115);
        crankGroup.add(pedalLeftGroup);

        // 9. Rear Wheel
        const rearWheelGroup = buildSpokedWheel(wheelR, mats.matTire, mats.matOlive, mats.matRustedSteel, mats.matSpokeDisc);
        rearWheelGroup.position.copy(rearHub);
        inner.add(rearWheelGroup);

        // Derived world offsets for rider seating and handlebar grip
        const saddleWorldY = (seatCluster.y + 0.10) * BIKE_SCALE;
        const saddleWorldZ = (seatCluster.x - 0.03) * BIKE_SCALE;

        return {
            root: bikeRoot,
            inner,
            steeringGroup,
            leftGripAnchor,
            headlightAnchor: lensMesh,
            frontWheelGroup,
            rearWheelGroup,
            crankGroup,
            pedalLeftGroup,
            pedalRightGroup,
            rearStandGroup,
            saddleShape,
            lensMat,
            wheelR: wheelR * BIKE_SCALE,
            crankLen: crankLen * BIKE_SCALE,
            pedalSideX: 0.115 * BIKE_SCALE,
            bbPos: new THREE.Vector3(0, bbPos.y * BIKE_SCALE, bbPos.x * BIKE_SCALE),
            saddleLocalPos: new THREE.Vector3(0, saddleWorldY, saddleWorldZ),
            leftGripLocalPos: new THREE.Vector3(0.24, 1.12, 0.48),
            rightGripLocalPos: new THREE.Vector3(-0.24, 1.12, 0.48)
        };
    }
    // ------------------------------------------------------------------------
    // 5. BICYCLE ENTITY WRAPPER
    // ------------------------------------------------------------------------
    const BICYCLE_COLLISION_RADIUS = 0.48;

    function segmentVsCircleEntry(ax, az, bx, bz, cx, cz, radius) {
        const fx = ax - cx, fz = az - cz;
        const c = fx * fx + fz * fz - radius * radius;
        if (c <= 0) return 0;

        const dx = bx - ax, dz = bz - az;
        const a = dx * dx + dz * dz;
        if (a < 1e-9) return -1;

        const b = 2 * (fx * dx + fz * dz);
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return -1;

        const t = (-b - Math.sqrt(discriminant)) / (2 * a);
        return t >= 0 && t <= 1 ? t : -1;
    }

    function segmentVsOrientedBoxEntry(ax, az, bx, bz, centerX, centerZ, heading, minX, maxX, minZ, maxZ, padding) {
        const cos = Math.cos(heading), sin = Math.sin(heading);
        const toLocal = (x, z) => {
            const dx = x - centerX, dz = z - centerZ;
            return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
        };
        const start = toLocal(ax, az);
        const end = toLocal(bx, bz);
        const dx = end.x - start.x, dz = end.z - start.z;
        const bounds = [
            [start.x, dx, minX - padding, maxX + padding],
            [start.z, dz, minZ - padding, maxZ + padding]
        ];
        let entry = 0, exit = 1;

        for (const [origin, direction, min, max] of bounds) {
            if (Math.abs(direction) < 1e-9) {
                if (origin < min || origin > max) return -1;
                continue;
            }
            let near = (min - origin) / direction;
            let far = (max - origin) / direction;
            if (near > far) [near, far] = [far, near];
            entry = Math.max(entry, near);
            exit = Math.min(exit, far);
            if (entry > exit) return -1;
        }

        return entry >= 0 && entry <= 1 ? entry : -1;
    }

    function findBicycleCollisionEntry(ax, az, bx, bz) {
        let earliestEntry = Infinity;

        const obstacles = window.worldObstacles || [];
        for (let i = 0; i < obstacles.length; i++) {
            const obstacle = obstacles[i];
            if (!obstacle || typeof obstacle.x !== 'number' || typeof obstacle.z !== 'number') continue;
            const radius = obstacle.radius || 0;
            if (Math.abs(bx - obstacle.x) > radius + BICYCLE_COLLISION_RADIUS + Math.abs(bx - ax) ||
                Math.abs(bz - obstacle.z) > radius + BICYCLE_COLLISION_RADIUS + Math.abs(bz - az)) continue;

            const entry = obstacle.box
                ? segmentVsOrientedBoxEntry(
                    ax, az, bx, bz, obstacle.x, obstacle.z, obstacle.box.rot || 0,
                    obstacle.box.minX, obstacle.box.maxX, obstacle.box.minZ, obstacle.box.maxZ,
                    BICYCLE_COLLISION_RADIUS
                )
                : segmentVsCircleEntry(ax, az, bx, bz, obstacle.x, obstacle.z, radius + BICYCLE_COLLISION_RADIUS);
            if (entry >= 0) earliestEntry = Math.min(earliestEntry, entry);
        }

        const trees = window.swayTrees || [];
        for (let i = 0; i < trees.length; i++) {
            const tree = trees[i];
            if (!tree || tree.isFallen || typeof tree.x !== 'number' || typeof tree.z !== 'number') continue;
            const trunkRadius = Math.max(0.4, Math.min(1, (tree.radius || 1.2) * 0.45 * (tree.scale || 1)));
            if (Math.abs(bx - tree.x) > trunkRadius + BICYCLE_COLLISION_RADIUS + Math.abs(bx - ax) ||
                Math.abs(bz - tree.z) > trunkRadius + BICYCLE_COLLISION_RADIUS + Math.abs(bz - az)) continue;
            const entry = segmentVsCircleEntry(ax, az, bx, bz, tree.x, tree.z, trunkRadius + BICYCLE_COLLISION_RADIUS);
            if (entry >= 0) earliestEntry = Math.min(earliestEntry, entry);
        }

        const wrecks = (window.activeEnemyTanks || []).filter(tank => tank && tank.isDestroyed);
        const playerTank = window.tankState;
        if (playerTank && playerTank.isKnockedOut && playerTank.hasTank !== false &&
            (!window.tankRoot || window.tankRoot.visible !== false)) {
            wrecks.push(playerTank);
        }
        for (let i = 0; i < wrecks.length; i++) {
            const wreck = wrecks[i];
            if (typeof wreck.x !== 'number' || typeof wreck.z !== 'number') continue;
            const dims = (typeof window.getTankHitboxDims === 'function')
                ? window.getTankHitboxDims(wreck.tankType || wreck.spec || window.currentTankId || 'tiger')
                : { halfW: 1.8, halfL: 3.3 };
            const entry = segmentVsOrientedBoxEntry(
                ax, az, bx, bz, wreck.x, wreck.z, wreck.heading || 0,
                -(dims.halfW || 1.8), dims.halfW || 1.8,
                -(dims.halfL || 3.3), dims.halfL || 3.3,
                BICYCLE_COLLISION_RADIUS
            );
            if (entry >= 0) earliestEntry = Math.min(earliestEntry, entry);
        }

        return earliestEntry;
    }

    class Bicycle {
        constructor(x, y, z, heading = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.heading = heading;
            this.speed = 0;
            this.turnRate = 0;
            this.steerAngle = 0;
            this.crankAngle = 0;
            this.terrainPitch = 0;
            this.terrainPitchVel = 0;
            this.terrainRoll = 0;
            this.terrainRollVel = 0;
            this.isMounted = false;
            this.rider = null;
            this.isStandDown = true;
            this.targetStandAngle = 1.48;
            this.currentStandAngle = 1.48;

            this.model = buildMilitaryBicycle();
            this.root = this.model.root;
            this.inner = this.model.inner;

            // Pitch is applied in the bike's own frame before heading yaw
            this.root.rotation.order = 'YXZ';
            this.root.position.set(this.x, this.y, this.z);
            this.root.rotation.y = this.heading;

            if (this.model.rearStandGroup) {
                this.model.rearStandGroup.rotation.z = this.currentStandAngle;
            }

            if (window.scene) {
                window.scene.add(this.root);
            }
        }

        update(dt, fwdInput = 0, strInput = 0, isSprinting = false) {
            // Drop stand deployment animation
            this.targetStandAngle = (this.isMounted || Math.abs(this.speed) > 0.1) ? 0.0 : 1.48;
            this.currentStandAngle += (this.targetStandAngle - this.currentStandAngle) * Math.min(1, dt * 8);
            if (this.model.rearStandGroup) {
                this.model.rearStandGroup.rotation.z = this.currentStandAngle;
            }

            if (this.isMounted) {
                // Pedaling force, rolling resistance, and gravity along the terrain slope
                const maxSpeed = isSprinting ? 9.8 : 7.2; // ~35 km/h sprint, ~26 km/h cruise
                const mass = 105; // bicycle and rider
                const gravity = 9.81;
                const enginePower = isSprinting ? 600 : 400;
                const slopePitch = this.terrainPitch;
                const normalForce = mass * gravity * Math.cos(slopePitch);
                const gravityForce = -mass * gravity * Math.sin(slopePitch);
                const isMoving = Math.abs(this.speed) > 0.05;
                const rollingResistance = -(isMoving ? Math.sign(this.speed) : fwdInput) * 0.015 * normalForce;
                const aerodynamicDrag = -0.36 * this.speed * Math.abs(this.speed);
                let driveForce = 0;

                if (fwdInput > 0.05) {
                    if (this.speed < -0.2) {
                        driveForce = mass * 3.5 * fwdInput;
                    } else {
                        const effectiveSpeed = Math.max(Math.abs(this.speed), 1.4);
                        const tractionLimit = 0.65 * normalForce;
                        const tractiveForce = Math.min(tractionLimit, (enginePower * 0.85) / effectiveSpeed);
                        driveForce = tractiveForce * fwdInput;
                    }
                } else if (fwdInput < -0.05) {
                    if (this.speed > 0.2) {
                        driveForce = -mass * 3.5 * Math.abs(fwdInput);
                    } else {
                        const effectiveSpeed = Math.max(Math.abs(this.speed), 1.4);
                        const reverseSpeed = Math.max(0, -this.speed / 1.8);
                        const reverseForce = Math.min(0.65 * normalForce, (enginePower * 0.4 * 0.85) / effectiveSpeed);
                        driveForce = -reverseForce * Math.max(0, 1 - reverseSpeed * reverseSpeed) * Math.abs(fwdInput);
                    }
                } else {
                    driveForce = -this.speed * mass * 0.18;
                }

                const acceleration = (driveForce + gravityForce + rollingResistance + aerodynamicDrag) / mass;
                this.speed += acceleration * dt;
                this.speed = THREE.MathUtils.clamp(this.speed, -1.8, maxSpeed * 1.45);
                if (Math.abs(this.speed) < 0.01 && Math.abs(acceleration) < 0.05) this.speed = 0;

                // Steering
                const speedFactor = Math.min(1.0, Math.abs(this.speed) / 2.5);
                const targetSteer = strInput * 0.45;
                this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, dt * 9.0);
                if (this.model.steeringGroup) {
                    this.model.steeringGroup.rotation.y = -this.steerAngle;
                }

                // Turning yaw rate: higher when moving, zero when stationary
                if (Math.abs(this.speed) > 0.1) {
                    const turnSpeed = 2.4 * (this.speed >= 0 ? 1 : -1);
                    this.turnRate = -this.steerAngle * turnSpeed * (0.45 + 0.55 * speedFactor);
                    this.heading += this.turnRate * dt;
                } else {
                    this.turnRate = 0;
                }

                // Dynamic bicycle banking/lean in turns
                const bankAngle = -this.steerAngle * THREE.MathUtils.clamp(this.speed / 5.5, -1, 1) * 0.26;
                this.inner.rotation.z = THREE.MathUtils.lerp(this.inner.rotation.z, bankAngle, dt * 8.0);
            } else {
                // Free coasting / deceleration when rider dismounts
                if (Math.abs(this.speed) > 0.05) {
                    const dragDir = Math.sign(this.speed);
                    this.speed -= dragDir * 6.0 * dt;
                    if (Math.sign(this.speed) !== dragDir) this.speed = 0;
                } else {
                    this.speed = 0;
                }
                this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, 0, dt * 5.0);
                if (this.model.steeringGroup) {
                    this.model.steeringGroup.rotation.y = 0;
                }
                this.inner.rotation.z = THREE.MathUtils.lerp(this.inner.rotation.z, (this.currentStandAngle / 1.48) * 0.08, dt * 6.0);
            }

            const startX = this.x, startZ = this.z;
            const nextX = startX + Math.sin(this.heading) * this.speed * dt;
            const nextZ = startZ + Math.cos(this.heading) * this.speed * dt;
            const collisionEntry = findBicycleCollisionEntry(startX, startZ, nextX, nextZ);
            let dDist = this.speed * dt;
            if (collisionEntry !== Infinity) {
                const travelLength = Math.hypot(nextX - startX, nextZ - startZ);
                const safeEntry = Math.max(0, collisionEntry - 0.02 / Math.max(travelLength, 0.02));
                this.x = startX + (nextX - startX) * safeEntry;
                this.z = startZ + (nextZ - startZ) * safeEntry;
                this.speed = 0;
                dDist = 0;
            } else {
                this.x = nextX;
                this.z = nextZ;
            }

            // Wheel rotation & distance travelled
            if (Math.abs(dDist) > 0.0001) {
                const wheelOmega = dDist / this.model.wheelR;
                this.model.frontWheelGroup.rotation.z -= wheelOmega;
                this.model.rearWheelGroup.rotation.z -= wheelOmega;

                // Crank rotation (gear ratio ~0.42: 1 wheel rev = 0.42 crank rev)
                const crankDelta = wheelOmega * 0.42;
                this.crankAngle += crankDelta;
                this.model.crankGroup.rotation.z = -this.crankAngle;
                // Weighted pedals remain horizontal
                this.model.pedalLeftGroup.rotation.z = this.crankAngle;
                this.model.pedalRightGroup.rotation.z = this.crankAngle;
            }

            // Height on terrain
            if (typeof window.getTerrainHeight === 'function') {
                const gh = window.getTerrainHeight(this.x, this.z);
                this.y = gh;

                // Terrain slope from averaged stations under the wheels, then spring-damper smoothing (same as tanks)
                const fwdX = Math.sin(this.heading), fwdZ = Math.cos(this.heading);
                const rightX = Math.cos(this.heading), rightZ = -Math.sin(this.heading);
                const AXLE = 0.55, HALF_TRACK = 0.3;
                const sampleAt = (f, l) => window.getTerrainHeight(
                    this.x + fwdX * f + rightX * l,
                    this.z + fwdZ * f + rightZ * l);
                const frontH = (sampleAt(AXLE, -HALF_TRACK) + sampleAt(AXLE, HALF_TRACK)) * 0.5;
                const rearH = (sampleAt(-AXLE, -HALF_TRACK) + sampleAt(-AXLE, HALF_TRACK)) * 0.5;
                const rightH = (sampleAt(0, HALF_TRACK) + sampleAt(AXLE, HALF_TRACK) + sampleAt(-AXLE, HALF_TRACK)) / 3;
                const leftH = (sampleAt(0, -HALF_TRACK) + sampleAt(AXLE, -HALF_TRACK) + sampleAt(-AXLE, -HALF_TRACK)) / 3;
                // Front (+Z) higher than rear => nose must rise, which is negative rotation.x
                const targetPitch = Math.atan2(frontH - rearH, AXLE * 2);
                // Roll is held near level; only a small side-slope allowance is kept
                const targetRoll = THREE.MathUtils.clamp(Math.atan2(rightH - leftH, HALF_TRACK * 2), -0.05, 0.05);

                const pitchForce = (targetPitch - this.terrainPitch) * 40.0 - this.terrainPitchVel * 8.5;
                this.terrainPitchVel += pitchForce * dt;
                this.terrainPitch += this.terrainPitchVel * dt;

                const rollForce = (targetRoll - this.terrainRoll) * 44.0 - this.terrainRollVel * 9.0;
                this.terrainRollVel += rollForce * dt;
                this.terrainRoll += this.terrainRollVel * dt;

                this.root.rotation.x = -this.terrainPitch;
                this.root.rotation.z = this.terrainRoll;
            }

            this.root.position.set(this.x, this.y, this.z);
            this.root.rotation.y = this.heading;
        }

        dispose() {
            if (this.root && this.root.parent) {
                this.root.parent.remove(this.root);
            }
        }
    }
    window.buildMilitaryBicycle = buildMilitaryBicycle;
    window.Bicycle = Bicycle;

    // ------------------------------------------------------------------------
    // 6. WORLD BICYCLE MANAGER
    // ------------------------------------------------------------------------
    const worldBicycles = [];
    window.worldBicycles = worldBicycles;

    function spawnBicycle(x, z, heading = 0) {
        const gh = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(x, z) : 0;
        const bike = new Bicycle(x, gh, z, heading);
        worldBicycles.push(bike);
        return bike;
    }
    window.spawnBicycle = spawnBicycle;

    function initWorldBicycles() {
        worldBicycles.forEach(b => b.dispose());
        worldBicycles.length = 0;
    }
    window.initWorldBicycles = initWorldBicycles;

    function getNearbyBicycle(x, z, maxDist = 3.2) {
        let closest = null;
        let closestDist = maxDist;
        for (let i = 0; i < worldBicycles.length; i++) {
            const b = worldBicycles[i];
            if (b.isMounted) continue;
            const d = Math.hypot(x - b.x, z - b.z);
            if (d < closestDist) {
                closestDist = d;
                closest = b;
            }
        }
        return closest;
    }
    window.getNearbyBicycle = getNearbyBicycle;

    function updateBicycles(dt) {
        for (let i = 0; i < worldBicycles.length; i++) {
            const b = worldBicycles[i];
            if (!b.isMounted) {
                b.update(dt, 0, 0, false);
            }
        }
    }
    window.updateBicycles = updateBicycles;

    // ------------------------------------------------------------------------
    // 7. MOUNT / DISMOUNT DISPATCHER
    // ------------------------------------------------------------------------
    function mountBicycle(soldier, bike) {
        if (!soldier || !bike || soldier.isDead) return;
        bike.isMounted = true;
        bike.rider = soldier;
        soldier.isMountedBicycle = true;
        soldier.currentBicycle = bike;
        soldier.healTimer = 0;

        // Start behind the bicycle with the same follow framing as on foot
        if (window.camOrbit) {
            window.camOrbit.theta = bike.heading + Math.PI;
            window.camOrbit.phi = 1.40;
            window.camOrbit.distance = 3.2;
        }

    }
    window.mountBicycle = mountBicycle;

    function dismountBicycle(soldier) {
        if (!soldier || !soldier.currentBicycle) return;
        const bike = soldier.currentBicycle;
        bike.isMounted = false;
        bike.rider = null;
        bike.speed = 0;

        // Step off to the left side
        const cosH = Math.cos(bike.heading);
        const sinH = Math.sin(bike.heading);
        soldier.x = bike.x - cosH * 0.75;
        soldier.z = bike.z + sinH * 0.75;
        soldier.y = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(soldier.x, soldier.z) : bike.y;
        soldier.speed = 0;
        soldier.isMountedBicycle = false;
        soldier.currentBicycle = null;
        soldier.healTimer = 0;
        if (bike.model && bike.model.lensMat && bike.model.lensMat.color && typeof bike.model.lensMat.color.setHex === 'function') {
            bike.model.lensMat.color.setHex(0x334155);
        }

        // Restore soldier upright pose
        if (soldier.rig && soldier.rig.hips) {
            soldier.rig.hips.position.set(0, 0.95, 0);
            soldier.rig.hips.rotation.set(0, 0, 0);
            soldier.rig.torso.rotation.set(0, 0, 0);
        }
        if (soldier.rig && soldier.rig.root) {
            soldier.rig.root.rotation.x = 0;
            soldier.rig.root.rotation.z = 0;
        }

        if (typeof window.showKillFeedBanner === 'function') {
            window.showKillFeedBanner('🚶 DISMOUNTED BICYCLE', '#94a3b8');
        }
    }
    window.dismountBicycle = dismountBicycle;

    // ------------------------------------------------------------------------
    // 8. REAL FOOT CYCLING KINEMATICS & ONE-HANDED SHOOTING RIG
    // ------------------------------------------------------------------------
    const _tempVecA = new THREE.Vector3();
    const _tempVecB = new THREE.Vector3();
    const _leftGripWorld = new THREE.Vector3();
    const _camLook = new THREE.Vector3();
    const _rightVec = new THREE.Vector3();
    const _realUp = new THREE.Vector3();
    const _rotMat = new THREE.Matrix4();
    const _targetQuat = new THREE.Quaternion();
    const _wristQuat = new THREE.Quaternion();
    const _saddleW = new THREE.Vector3();

    function updateBicycleRider(s, bike, dt, currentActiveCam, fwdInput = 0, strInput = 0, isSprinting = false) {
        if (!s || !bike || !s.rig) return;
        const rig = s.rig;

        // 1. Advance bicycle physics
        bike.update(dt, fwdInput, strInput, isSprinting);

        // 2. Lock soldier world coordinates & orientation to bicycle
        s.x = bike.x;
        s.y = bike.y;
        s.z = bike.z;
        s.heading = bike.heading;
        s.speed = bike.speed;

        if (rig.root) {
            // Rider follows the bicycle's terrain pitch, heading and banking
            rig.root.rotation.order = 'YXZ';
            rig.root.position.set(bike.x, bike.y, bike.z);
            rig.root.rotation.set(bike.root.rotation.x, bike.heading, bike.inner.rotation.z + bike.root.rotation.z);
            rig.root.updateMatrixWorld(true);
        }

        // 3. Seated Saddle Pose (Natural height matching bicycle saddle cantle)
        // Pelvis origin sits above the saddle top so the hips rest on the seat instead of sinking into it
        // Anchored to the saddle's real world transform so banking and steering stay in sync with the bike mesh
        if (bike.model.saddleShape && rig.root) {
            bike.root.updateMatrixWorld(true);
            bike.model.saddleShape.getWorldPosition(_saddleW);
            const saddleLocal = rig.root.worldToLocal(_saddleW);
            rig.hips.position.set(saddleLocal.x, saddleLocal.y + 0.11, saddleLocal.z);
        } else {
            const saddlePos = bike.model.saddleLocalPos || new THREE.Vector3(0, 0.96, -0.28);
            rig.hips.position.set(saddlePos.x, saddlePos.y + 0.11, saddlePos.z);
        }
        rig.hips.rotation.set(-0.10, 0, 0);

        // 4. REAL FOOT CYCLING KINEMATICS (Analytical 2-Bone Inverse Kinematics)
        // Pedal axle positions follow the crank analytically (same math as the crank group),
        // so the ankle targets track the pedal stroke even before the next bike.update()
        const PEDAL_ANKLE_LIFT = 0.06;
        const crankR = bike.model.crankLen || 0.195;
        const pedalSideX = bike.model.pedalSideX || 0.136;
        const bbY = bike.model.bbPos ? bike.model.bbPos.y : 0.366;
        const bbZ = bike.model.bbPos ? bike.model.bbPos.z : -0.047;
        const crankCos = Math.cos(bike.crankAngle || 0);
        const crankSin = Math.sin(bike.crankAngle || 0);
        // Left pedal (soldier's left, +X) and right pedal (soldier's right, -X) are 180 degrees apart
        _tempVecA.set(pedalSideX, bbY + crankR * crankCos + PEDAL_ANKLE_LIFT, bbZ + crankR * crankSin);
        _tempVecB.set(-pedalSideX, bbY - crankR * crankCos + PEDAL_ANKLE_LIFT, bbZ - crankR * crankSin);

        const L1 = 0.40; // Thigh length (hip to knee)
        const L2 = 0.43; // Calf length (knee to ankle)

        function solveLegIK(hipPos, pedalPos) {
            const dY = pedalPos.y - hipPos.y;
            const dZ = pedalPos.z - hipPos.z;
            const dist = Math.hypot(dY, dZ);
            const clampedDist = THREE.MathUtils.clamp(dist, 0.32, L1 + L2 - 0.005);

            const cosKnee = THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - clampedDist * clampedDist) / (2 * L1 * L2), -1, 1);
            const kneeAngle = Math.PI - Math.acos(cosKnee);

            const gamma = Math.atan2(dZ, -dY);
            const cosAlpha = THREE.MathUtils.clamp((L1 * L1 + clampedDist * clampedDist - L2 * L2) / (2 * L1 * clampedDist), -1, 1);
            const alpha = Math.acos(cosAlpha);
            const thighForward = gamma + alpha;

            return {
                thighAngle: -thighForward, // Negative rotation.x swings thigh forward in Three.js
                kneeAngle: kneeAngle,      // Positive rotation.x bends knee downward/backward
                ankleAngle: -( -thighForward + kneeAngle ), // Keeps boot sole level with pedal
                // Lateral splay so the leg reaches the pedal's side offset
                spreadAngle: Math.atan2(pedalPos.x - hipPos.x, dist)
            };
        }

        // Left leg (soldier's left is +X = +0.105)
        const leftHipPos = new THREE.Vector3(0.105, rig.hips.position.y - 0.04, rig.hips.position.z);
        const leftLeg = solveLegIK(leftHipPos, _tempVecA);

        // Right leg (soldier's right is -X = -0.105)
        const rightHipPos = new THREE.Vector3(-0.105, rig.hips.position.y - 0.04, rig.hips.position.z);
        const rightLeg = solveLegIK(rightHipPos, _tempVecB);

        const lHip = rig.leftLeg.hipJoint || rig.leftLeg.hip;
        const lKnee = rig.leftLeg.kneeJoint || rig.leftLeg.knee;
        const rHip = rig.rightLeg.hipJoint || rig.rightLeg.hip;
        const rKnee = rig.rightLeg.kneeJoint || rig.rightLeg.knee;

        // Splay (Z) is applied outermost so the thigh pitch stays in the sagittal plane.
        // Thigh X is compensated for the pelvis pitch inherited from rig.hips.
        if (lHip) {
            lHip.rotation.order = 'ZXY';
            lHip.rotation.set(leftLeg.thighAngle - rig.hips.rotation.x, 0, leftLeg.spreadAngle);
        }
        if (lKnee) lKnee.rotation.set(leftLeg.kneeAngle, 0, 0);
        if (rig.leftLeg.ankle) rig.leftLeg.ankle.rotation.set(leftLeg.ankleAngle, 0, 0);

        if (rHip) {
            rHip.rotation.order = 'ZXY';
            rHip.rotation.set(rightLeg.thighAngle - rig.hips.rotation.x, 0, rightLeg.spreadAngle);
        }
        if (rKnee) rKnee.rotation.set(rightLeg.kneeAngle, 0, 0);
        if (rig.rightLeg.ankle) rig.rightLeg.ankle.rotation.set(rightLeg.ankleAngle, 0, 0);

        // 5. UPPER BODY AIMING & ONE-HANDED SHOOTING RIG
        // Camera look vector
        if (currentActiveCam) {
            currentActiveCam.getWorldDirection(_camLook);
        } else {
            _camLook.set(Math.sin(bike.heading), 0, Math.cos(bike.heading));
        }

        const camPitch = Math.asin(THREE.MathUtils.clamp(_camLook.y, -0.99, 0.99));
        const camYaw = Math.atan2(_camLook.x, _camLook.z);

        // Relative yaw difference between camera and bicycle heading
        let diffYaw = camYaw - bike.heading;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;

        // Wide aiming arc (±105 degrees)
        const aimYawClamped = THREE.MathUtils.clamp(diffYaw, -1.85, 1.85);

        // Torso posture: forward lean + twist toward aim target
        if (rig.torso) {
            // Forward lean over the handlebars (+Z is forward); looking up straightens the back
            rig.torso.rotation.x = 0.42 - camPitch * 0.40;
            rig.torso.rotation.y = aimYawClamped * 0.55;
            rig.torso.updateMatrixWorld(true);
        }
        if (rig.head) {
            rig.head.rotation.x = -camPitch * 0.35;
            rig.head.rotation.y = aimYawClamped * 0.45;
        }

        let grenadeArmLift = 0;
        if (s.grenadeAnimTimer > 0) {
            s.grenadeAnimTimer = Math.max(0, s.grenadeAnimTimer - dt);
            const p = 1.0 - (s.grenadeAnimTimer / (s.grenadeAnimDuration || 0.40));
            grenadeArmLift = Math.sin(p * Math.PI);
        }

        // Update matrices for upper body IK
        if (rig.rightArm && rig.rightArm.shoulder) {
            rig.rightArm.shoulder.updateMatrixWorld(true);
            rig.rightArm.elbow.updateMatrixWorld(true);
            rig.rightArm.wrist.updateMatrixWorld(true);
        }

        // 6. LEFT ARM: FIRMLY HOLDING LEFT HANDLEBAR GRIP (Analytical 2-Bone IK)
        // Dynamically follows the handlebar grip as the fork turns
        if (bike.model.leftGripAnchor) {
            bike.model.leftGripAnchor.getWorldPosition(_tempVecA);
        } else {
            _tempVecA.set(0.24, 1.12, 0.48);
            bike.root.localToWorld(_tempVecA);
        }
        const gripTorso = rig.torso.worldToLocal(_tempVecA);

        const leftShoulderPos = rig.leftArm.shoulder.position;
        if (grenadeArmLift > 0) {
            const throwHandTarget = leftShoulderPos.clone().add(new THREE.Vector3(0.08, 0.38, 0.12));
            gripTorso.lerp(throwHandTarget, grenadeArmLift);
        }
        const armD = gripTorso.clone().sub(leftShoulderPos);
        const armDist = armD.length();
        const armL1 = 0.265;
        const armL2 = 0.24;
        const targetArmDist = Math.min(armDist, armL1 + armL2 - 0.005);
        const cosArmAlpha = THREE.MathUtils.clamp((armL1 * armL1 + targetArmDist * targetArmDist - armL2 * armL2) / (2 * armL1 * targetArmDist), -1, 1);
        const armAlpha = Math.acos(cosArmAlpha);

        const armD_norm = armD.clone().normalize();
        const armPole = new THREE.Vector3(0.5, -0.6, 0.4).normalize();
        let armN = armPole.clone().sub(armD_norm.clone().multiplyScalar(armPole.dot(armD_norm)));
        if (armN.lengthSq() < 0.001) armN = new THREE.Vector3(1, 0, 0);
        armN.normalize();

        const armE = leftShoulderPos.clone()
            .add(armD_norm.clone().multiplyScalar(armL1 * Math.cos(armAlpha)))
            .add(armN.clone().multiplyScalar(armL1 * Math.sin(armAlpha)));

        const vUpper = armE.clone().sub(leftShoulderPos).normalize();
        const qUpper = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), vUpper);
        rig.leftArm.shoulder.quaternion.copy(qUpper);
        rig.leftArm.shoulder.updateMatrixWorld(true);

        const vForearmTorso = gripTorso.clone().sub(armE).normalize();
        const vForearmShoulder = vForearmTorso.clone().applyQuaternion(qUpper.clone().invert());
        const qForearm = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), vForearmShoulder);
        rig.leftArm.elbow.quaternion.copy(qForearm);
        rig.leftArm.elbow.updateMatrixWorld(true);

        // 7. RIGHT ARM: ONE-HANDED COMBAT MARKSMANSHIP STANCE
        // 7. RIGHT ARM: ONE-HANDED COMBAT MARKSMANSHIP STANCE (Analytical 2-Bone IK)
        // Wrist target in rig root space: raised and pushed forward onto the rifle stock
        if (rig.rifle && rig.rightArm) {
            if (rig.rifle.parent !== rig.rightArm.wrist) {
                rig.rightArm.wrist.attach(rig.rifle);
            }
            const yawOffset = (aimYawClamped - rig.torso.rotation.y) * 0.90;

            // The arm reaches along the unclamped aim direction from the shoulder, so it can swing to the rear.
            // The target lies beyond arm length, so the solver keeps the arm straight.
            const armElev = THREE.MathUtils.clamp(camPitch, -0.4, 0.4);
            const armReach = 0.56;
            rig.root.updateMatrixWorld(true);
            const shoulderRoot = rig.root.worldToLocal(rig.rightArm.shoulder.getWorldPosition(new THREE.Vector3()));
            _tempVecB.set(
                shoulderRoot.x + Math.sin(diffYaw) * Math.cos(armElev) * armReach,
                shoulderRoot.y + Math.sin(armElev) * armReach,
                shoulderRoot.z + Math.cos(diffYaw) * Math.cos(armElev) * armReach
            );
            rig.root.localToWorld(_tempVecB);
            const gunTorso = rig.torso.worldToLocal(_tempVecB);

            const rightShoulderPos = rig.rightArm.shoulder.position;
            const armR = gunTorso.clone().sub(rightShoulderPos);
            const armRDist = armR.length();
            const targetRDist = Math.min(armRDist, armL1 + armL2 - 0.005);
            const cosRAlpha = THREE.MathUtils.clamp((armL1 * armL1 + targetRDist * targetRDist - armL2 * armL2) / (2 * armL1 * targetRDist), -1, 1);
            const rAlpha = Math.acos(cosRAlpha);

            const armR_norm = armR.clone().normalize();
            const armRPole = new THREE.Vector3(-0.5, -0.6, 0.4).normalize();
            let armRN = armRPole.clone().sub(armR_norm.clone().multiplyScalar(armRPole.dot(armR_norm)));
            if (armRN.lengthSq() < 0.001) armRN = new THREE.Vector3(-1, 0, 0);
            armRN.normalize();

            const armRE = rightShoulderPos.clone()
                .add(armR_norm.clone().multiplyScalar(armL1 * Math.cos(rAlpha)))
                .add(armRN.clone().multiplyScalar(armL1 * Math.sin(rAlpha)));

            const vRUpper = armRE.clone().sub(rightShoulderPos).normalize();
            const qRUpper = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), vRUpper);
            rig.rightArm.shoulder.quaternion.copy(qRUpper);
            rig.rightArm.shoulder.updateMatrixWorld(true);

            const vRForearmTorso = gunTorso.clone().sub(armRE).normalize();
            const vRForearmShoulder = vRForearmTorso.clone().applyQuaternion(qRUpper.clone().invert());
            const qRForearm = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), vRForearmShoulder);
            rig.rightArm.elbow.quaternion.copy(qRForearm);
            rig.rightArm.elbow.updateMatrixWorld(true);

            rig.rightArm.wrist.rotation.set(-0.15, yawOffset * 0.25, -0.10);

            rig.rightArm.shoulder.updateMatrixWorld(true);
            rig.rightArm.elbow.updateMatrixWorld(true);
            rig.rightArm.wrist.updateMatrixWorld(true);

            // Align rifle along world camera look vector
            const fwd = _camLook.clone().normalize();
            const worldUp = new THREE.Vector3(0, 1, 0);
            _rightVec.crossVectors(worldUp, fwd);
            if (_rightVec.lengthSq() < 0.0001) {
                _rightVec.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
            } else {
                _rightVec.normalize();
            }
            _realUp.crossVectors(fwd, _rightVec).normalize();
            _rotMat.makeBasis(_rightVec, _realUp, fwd);
            _targetQuat.setFromRotationMatrix(_rotMat);

            rig.rightArm.wrist.getWorldQuaternion(_wristQuat);
            const localRifleQuat = _wristQuat.clone().invert().multiply(_targetQuat);
            rig.rifle.quaternion.copy(localRifleQuat);
            window.placeSoldierWeaponInHand(rig, localRifleQuat);
            rig.rifle.updateMatrixWorld(true);
        }
    }
    window.updateBicycleRider = updateBicycleRider;

    // Vintage Brass Bell sound synthesizer (Web Audio API)
    function playBicycleBell() {
        if (!window.soundFX || !window.soundFX.ctx) return;
        const ctx = window.soundFX.ctx;
        if (ctx.state === 'suspended') ctx.resume();

        const now = ctx.currentTime;
        [1760, 2093, 2637].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);

            gain.gain.setValueAtTime(0.18, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.45);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.46);
        });
    }
    if (window.soundFX) {
        window.soundFX.playBicycleBell = playBicycleBell;
    }

})();
