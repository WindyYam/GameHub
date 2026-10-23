// ============================================================================
// 5D. HIGH-DETAIL WOODEN TRIBAL CABIN, INTERIOR & ARTIFACTS BESIDE THE FIRE
// ============================================================================
function createTribalRugTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Woven pandanus reed base
    ctx.fillStyle = '#b9935a';
    ctx.fillRect(0, 0, 256, 256);

    // Fine cross-hatch weave lines
    ctx.strokeStyle = 'rgba(82, 54, 24, 0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 256; i += 6) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    }

    // Tribal borders in crimson terracotta, charcoal & ochre
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 12;
    ctx.strokeRect(18, 18, 220, 220);

    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 5;
    ctx.strokeRect(32, 32, 192, 192);

    // Geometric tribal diamond & chevron motifs
    const colors = ['#991b1b', '#0f766e', '#d97706', '#1c1917'];
    for (let r = 0; r < 3; r++) {
        const rad = 75 - r * 22;
        ctx.fillStyle = colors[r % colors.length];
        ctx.beginPath();
        ctx.moveTo(128, 128 - rad);
        ctx.lineTo(128 + rad, 128);
        ctx.lineTo(128, 128 + rad);
        ctx.lineTo(128 - rad, 128);
        ctx.closePath();
        ctx.fill();
    }

    // Corner tribal sun/chevron ticks
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 3;
    for (let i = 44; i <= 212; i += 14) {
        ctx.beginPath();
        ctx.moveTo(i, 20);
        ctx.lineTo(i + 7, 28);
        ctx.lineTo(i + 14, 20);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(i, 236);
        ctx.lineTo(i + 7, 228);
        ctx.lineTo(i + 14, 236);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

function createHayStrawTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Warm sun-cured golden hay base
    ctx.fillStyle = '#c89d4c';
    ctx.fillRect(0, 0, 256, 256);

    // Thousands of layered golden straw/hay stalks running down the roof pitch
    const hayPalette = ['#e2be6b', '#d4a84f', '#b58938', '#8c6422', '#edd082', '#9e742b'];
    for (let i = 0; i < 1600; i++) {
        ctx.strokeStyle = hayPalette[i % hayPalette.length];
        ctx.lineWidth = 1 + (i % 2);
        const x = (hash2D(i, 1.3) * 256);
        const y = (hash2D(i, 7.9) * 256);
        const len = 18 + hash2D(i, 3.7) * 28;
        const tilt = (hash2D(i, 5.1) - 0.5) * 4.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + tilt, y + len);
        ctx.stroke();
    }

    // Horizontal bundle shadow bands where hay sheaves overlap
    for (let y = 32; y < 256; y += 64) {
        const grad = ctx.createLinearGradient(0, y - 10, 0, y + 12);
        grad.addColorStop(0, 'rgba(58, 38, 12, 0.0)');
        grad.addColorStop(0.5, 'rgba(42, 26, 8, 0.42)');
        grad.addColorStop(1, 'rgba(58, 38, 12, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - 10, 256, 22);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

function createTribalMaskTexture(seedHue = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Dark carved ironwood base
    ctx.fillStyle = '#3a2212';
    ctx.fillRect(0, 0, 128, 256);

    // Tribal warpaint stripes & chevrons
    const accent = seedHue === 0 ? '#dc2626' : (seedHue === 1 ? '#0ea5e9' : '#eab308');
    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    for (let y = 30; y < 230; y += 36) {
        ctx.beginPath();
        ctx.moveTo(12, y);
        ctx.lineTo(64, y + 18);
        ctx.lineTo(116, y);
        ctx.stroke();
    }

    // White lime-ash tribal dots
    ctx.fillStyle = '#f8fafc';
    for (let y = 24; y < 235; y += 18) {
        ctx.beginPath(); ctx.arc(22, y, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(106, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

function createTribalCabinAndGadgets() {
    const cabinGroup = new THREE.Group();
    const groundY = getIslandHeight(CABIN_SITE.x, CABIN_SITE.z);
    cabinGroup.position.set(CABIN_SITE.x, groundY - 0.08, CABIN_SITE.z);
    cabinGroup.rotation.y = CABIN_SITE.rotY; // Faces +Z directly toward the campfire at (52, 22)
    cabinGroup.scale.setScalar(CABIN_SITE.scale); // Grand, imposing Chieftain Lodge scale (1.85x)

    // Materials
    const darkLogMat = new THREE.MeshStandardMaterial({ color: 0x3b2514, roughness: 0.90 });
    const medWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c3c22, roughness: 0.85 });
    const plankFloorMat = new THREE.MeshStandardMaterial({ color: 0x6e4b2b, roughness: 0.82 });
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0xa68b4b, roughness: 0.72 });
    const ropeLashMat = new THREE.MeshStandardMaterial({ color: 0xc2a36b, roughness: 0.92 });
    const hayTexture = createHayStrawTexture();
    const thatchRoofMat = new THREE.MeshStandardMaterial({
        map: hayTexture,
        bumpMap: hayTexture,
        bumpScale: 0.045,
        color: 0xf5deb3,
        roughness: 0.92,
        side: THREE.DoubleSide
    });
    const thatchUnderMat = new THREE.MeshStandardMaterial({
        map: hayTexture,
        bumpMap: hayTexture,
        bumpScale: 0.035,
        color: 0xc9a66b,
        roughness: 0.95,
        side: THREE.DoubleSide
    });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.92 });
    const obsidianMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.22, metalness: 0.35 });
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe7e2d3, roughness: 0.62 });
    const terracottaMat = new THREE.MeshStandardMaterial({ color: 0x9a3e25, roughness: 0.76 });
    const peltMat = new THREE.MeshStandardMaterial({ color: 0x78593c, roughness: 0.95 });
    const turquoiseGemMat = new THREE.MeshStandardMaterial({
        color: 0x2dd4bf,
        emissive: 0x0d9488,
        emissiveIntensity: 0.85,
        roughness: 0.25
    });
    const emberGlowMat = new THREE.MeshStandardMaterial({
        color: 0xff6d00,
        emissive: 0xff3d00,
        emissiveIntensity: 2.2,
        roughness: 0.5
    });
    const gourdGlowMat = new THREE.MeshStandardMaterial({
        color: 0xffca64,
        emissive: 0xff8f00,
        emissiveIntensity: 2.0,
        roughness: 0.4
    });

    const addPart = (mesh, parent = cabinGroup) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    };

    const floorY = 0.62;
    const wallH = 2.65;
    const cabinW = 6.2;   // X: -3.1 to +3.1
    const cabinD = 5.0;   // Z: -2.5 (back) to +2.5 (front wall)
    const porchD = 2.15;  // Z: +2.5 to +4.65 (front veranda facing campfire)

    // ====================================================================
    // 1. ELEVATED TIMBER FOUNDATION STILTS, FLOOR PLANKS & VERANDA STEPS
    // ====================================================================
    const stiltGeo = new THREE.CylinderGeometry(0.15, 0.19, 1.35, 8);
    const stiltX = [-2.95, -1.0, 1.0, 2.95];
    const stiltZ = [-2.35, 0.0, 2.35, 4.45];
    stiltX.forEach(sx => {
        stiltZ.forEach(sz => {
            const stilt = addPart(new THREE.Mesh(stiltGeo, darkLogMat));
            stilt.position.set(sx, floorY - 0.52, sz);
        });
    });

    // Cross-bearer foundation joists & rope lashings
    const joistGeo = new THREE.CylinderGeometry(0.11, 0.11, cabinW + 0.5, 8);
    joistGeo.rotateZ(Math.PI / 2);
    stiltZ.forEach(sz => {
        const joist = addPart(new THREE.Mesh(joistGeo, darkLogMat));
        joist.position.set(0, floorY - 0.12, sz);
    });

    // Individual bevelled hardwood floor planks (interior + front veranda porch)
    const totalDepth = cabinD + porchD;
    const numPlanks = 26;
    const plankDepth = totalDepth / numPlanks;
    const floorPlankGeo = new THREE.BoxGeometry(cabinW + 0.3, 0.10, plankDepth - 0.025);
    for (let i = 0; i < numPlanks; i++) {
        const pz = -2.5 + (i + 0.5) * plankDepth;
        const plank = addPart(new THREE.Mesh(floorPlankGeo, i % 2 === 0 ? plankFloorMat : medWoodMat));
        plank.position.set((hash2D(i, 1.7) - 0.5) * 0.06, floorY, pz);
    }

    // Wide front veranda entry steps leading toward the campfire
    for (let s = 0; s < 3; s++) {
        const stepW = 2.55;
        const stepLog = addPart(new THREE.Mesh(new THREE.BoxGeometry(stepW, 0.11, 0.34), plankFloorMat));
        stepLog.position.set(0, floorY - (s + 1) * 0.17, 4.78 + s * 0.34);

        for (let side = -1; side <= 1; side += 2) {
            const stringer = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.45, 6), darkLogMat));
            stringer.position.set(side * (stepW * 0.46), floorY - (s + 1) * 0.17 - 0.12, 4.78 + s * 0.34);
        }
    }

    // ====================================================================
    // 2. LOG & BAMBOO-FRAMED CABIN WALLS (OPEN FRONT DOOR & LARGE WINDOWS)
    // ====================================================================
    const cornerPostGeo = new THREE.CylinderGeometry(0.15, 0.17, wallH + 0.25, 10);
    const lashingRingGeo = new THREE.TorusGeometry(0.165, 0.028, 6, 12);
    lashingRingGeo.rotateX(Math.PI / 2);

    const mainCorners = [
        [-3.0, -2.4], [3.0, -2.4], // Back corners
        [-3.0,  2.4], [3.0,  2.4], // Front wall corners
        [-1.12, 2.4], [1.12, 2.4], // Wide open doorway posts
        [-3.0,  4.45], [3.0, 4.45], // Porch outer corners
        [-1.25, 4.45], [1.25, 4.45] // Porch entry posts
    ];
    mainCorners.forEach(([cx, cz], idx) => {
        const isPorch = cz > 3.0;
        const pH = isPorch ? wallH - 0.22 : wallH + 0.15;
        const post = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, pH, 9), darkLogMat));
        post.position.set(cx, floorY + pH * 0.5, cz);

        // Hemp rope lashings at base and top of every structural column
        const lashTop = addPart(new THREE.Mesh(lashingRingGeo, ropeLashMat));
        lashTop.position.set(cx, floorY + pH - 0.18, cz);
        const lashBot = addPart(new THREE.Mesh(lashingRingGeo, ropeLashMat));
        lashBot.position.set(cx, floorY + 0.16, cz);
    });

    // Helper to stack horizontal notched timber logs between two points
    const addLogWallSegment = (x1, z1, x2, z2, yStart, yEnd, logRadius = 0.105) => {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        const ang = Math.atan2(dx, dz);
        const stepY = logRadius * 1.82;
        const count = Math.max(1, Math.floor((yEnd - yStart) / stepY));
        for (let i = 0; i < count; i++) {
            const ly = yStart + (i + 0.5) * stepY;
            const logGeo = new THREE.CylinderGeometry(logRadius * 0.95, logRadius, len, 8);
            logGeo.rotateX(Math.PI / 2);
            const logMesh = addPart(new THREE.Mesh(logGeo, i % 2 === 0 ? medWoodMat : darkLogMat));
            logMesh.position.set((x1 + x2) * 0.5, ly, (z1 + z2) * 0.5);
            logMesh.rotation.y = ang;
        }
    };

    // Back Wall (Z = -2.4): full height with central horizontal bamboo slat window
    addLogWallSegment(-3.0, -2.4, 3.0, -2.4, floorY + 0.05, floorY + 1.15);
    addLogWallSegment(-3.0, -2.4, -1.3, -2.4, floorY + 1.15, floorY + wallH);
    addLogWallSegment( 1.3, -2.4,  3.0, -2.4, floorY + 1.15, floorY + wallH);
    addLogWallSegment(-3.0, -2.4, 3.0, -2.4, floorY + 2.15, floorY + wallH);

    // Back window vertical bamboo bars
    for (let bx = -1.05; bx <= 1.05; bx += 0.35) {
        const bar = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 6), bambooMat));
        bar.position.set(bx, floorY + 1.65, -2.4);
    }

    // Left Wall (X = -3.0) & Right Wall (X = +3.0): wainscot logs + wide open view windows with propped thatch shutters
    [-3.0, 3.0].forEach(wx => {
        // Lower log wall up to waist height
        addLogWallSegment(wx, -2.4, wx, 2.4, floorY + 0.05, floorY + 1.05);
        // Corner wall piers flanking the large side window
        addLogWallSegment(wx, -2.4, wx, -1.15, floorY + 1.05, floorY + wallH);
        addLogWallSegment(wx,  1.15, wx,  2.4, floorY + 1.05, floorY + wallH);
        // Top wall plate lintel
        addLogWallSegment(wx, -2.4, wx, 2.4, floorY + 2.18, floorY + wallH);

        // Propped-open woven bamboo window shutter & support struts
        const sideSign = Math.sign(wx);
        const shutterGroup = new THREE.Group();
        shutterGroup.position.set(wx + sideSign * 0.08, floorY + 2.15, 0.0);
        shutterGroup.rotation.z = sideSign * 1.12; // Propped outward to invite viewing inside
        const shutterFrame = addPart(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 2.25), bambooMat), shutterGroup);
        shutterFrame.position.set(0, -0.55, 0);
        cabinGroup.add(shutterGroup);
    });

    // Front Wall (Z = +2.4): Wide 2.24m open entryway in the center + low side half-walls so the interior is completely visible
    addLogWallSegment(-3.0, 2.4, -1.12, 2.4, floorY + 0.05, floorY + 1.05);
    addLogWallSegment( 1.12, 2.4,  3.0, 2.4, floorY + 0.05, floorY + 1.05);
    addLogWallSegment(-3.0, 2.4,  3.0, 2.4, floorY + 2.25, floorY + wallH);

    // Porch handrail balusters & bamboo rails on left & right sides of the veranda
    [-3.0, 3.0].forEach(px => {
        addLogWallSegment(px, 2.4, px, 4.45, floorY + 0.78, floorY + 0.95, 0.075);
        for (let bz = 2.75; bz <= 4.15; bz += 0.45) {
            const bal = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.80, 6), bambooMat));
            bal.position.set(px, floorY + 0.42, bz);
        }
    });
    // Front porch left & right railings flanking the steps
    addLogWallSegment(-3.0, 4.45, -1.25, 4.45, floorY + 0.78, floorY + 0.95, 0.075);
    addLogWallSegment( 1.25, 4.45,  3.0, 4.45, floorY + 0.78, floorY + 0.95, 0.075);

    // ====================================================================
    // 3. EXPOSED TIMBER ROOF TRUSSES, LAYERED PALM-THATCH ROOF & TOTEM GABLE
    // ====================================================================
    const eaveY = floorY + wallH;
    const ridgeY = eaveY + 1.95;
    const roofZStart = -3.05;
    const roofZEnd = 5.05;
    const roofLen = roofZEnd - roofZStart;
    const roofCenterZ = (roofZStart + roofZEnd) * 0.5;

    // Heavy carved ridgepole beam extending out past the front & back gables with horn finials
    const ridgeGeo = new THREE.CylinderGeometry(0.13, 0.14, roofLen + 0.9, 8);
    ridgeGeo.rotateX(Math.PI / 2);
    const ridgeBeam = addPart(new THREE.Mesh(ridgeGeo, darkLogMat));
    ridgeBeam.position.set(0, ridgeY, roofCenterZ);

    // Exposed A-frame timber rafters & collar ties visible from inside the cabin
    const slopeSpan = 3.95;
    const slopeAngle = Math.atan2(ridgeY - (eaveY - 0.25), slopeSpan);
    const rafterLen = Math.hypot(slopeSpan, ridgeY - (eaveY - 0.25));

    for (let rz = -2.7; rz <= 4.7; rz += 0.92) {
        for (let side = -1; side <= 1; side += 2) {
            const rafterGeo = new THREE.CylinderGeometry(0.065, 0.075, rafterLen, 6);
            const rafter = addPart(new THREE.Mesh(rafterGeo, medWoodMat));
            rafter.position.set(side * slopeSpan * 0.5, (ridgeY + eaveY - 0.25) * 0.5, rz);
            rafter.rotation.z = side * (Math.PI / 2 - slopeAngle);
        }
        // Horizontal collar tie beam & king-post strut
        const collar = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.8, 6), darkLogMat));
        collar.rotation.z = Math.PI / 2;
        collar.position.set(0, eaveY + 0.72, rz);

        const kingPost = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.18, 6), darkLogMat));
        kingPost.position.set(0, eaveY + 1.32, rz);
    }

    // Horizontal bamboo purlins across the rafters
    for (let p = 0.2; p <= 0.88; p += 0.22) {
        for (let side = -1; side <= 1; side += 2) {
            const purlinGeo = new THREE.CylinderGeometry(0.04, 0.04, roofLen, 6);
            purlinGeo.rotateX(Math.PI / 2);
            const purlin = addPart(new THREE.Mesh(purlinGeo, bambooMat));
            purlin.position.set(side * p * slopeSpan, mix(ridgeY, eaveY - 0.25, p) + 0.05, roofCenterZ);
        }
    }

    // Multi-tiered overlapping Golden Hay / Straw Thatch Roof with thick bundled sheaves & shaggy eave fringe
    const tiers = 5;
    for (let side = -1; side <= 1; side += 2) {
        for (let t = 0; t < tiers; t++) {
            const t0 = t / tiers;
            const t1 = (t + 1.14) / tiers;
            const segSpan = (t1 - t0) * rafterLen;
            const tMid = (t0 + t1) * 0.5;
            const tierMat = t % 2 === 0 ? thatchRoofMat : thatchUnderMat;

            // Thick sculpted hay layer with natural organic sag & bundled straw volume
            const hayGeo = new THREE.BoxGeometry(segSpan, 0.18, roofLen + 0.28, 6, 2, 14);
            const hPos = hayGeo.attributes.position;
            for (let k = 0; k < hPos.count; k++) {
                const vx = hPos.getX(k);
                const vy = hPos.getY(k);
                const vz = hPos.getZ(k);
                const bundleRipple = Math.sin(vz * 4.5 + t * 1.7) * 0.035 + (valueNoise2D(vx * 3.2, vz * 3.2) - 0.5) * 0.045;
                const eaveTuft = (vx * side > segSpan * 0.35) ? Math.sin(vz * 14.0 + t) * 0.04 : 0.0;
                hPos.setY(k, vy + bundleRipple + eaveTuft);
            }
            hayGeo.computeVertexNormals();

            const thatchSlab = addPart(new THREE.Mesh(hayGeo, tierMat));
            const midX = side * tMid * slopeSpan;
            const midY = mix(ridgeY + 0.14, eaveY - 0.24, tMid) + (tiers - t) * 0.04;
            thatchSlab.position.set(midX, midY, roofCenterZ);
            thatchSlab.rotation.z = -side * (slopeAngle - 0.025);
        }

        // Shaggy overhanging golden hay fringe tufts along the lower drip eaves
        const eaveX = side * (slopeSpan + 0.12);
        const eaveDropY = eaveY - 0.26;
        for (let fz = roofZStart + 0.25; fz <= roofZEnd - 0.25; fz += 0.38) {
            const tuft = addPart(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 6), thatchRoofMat));
            tuft.scale.set(0.65, 1.0, 1.35);
            tuft.position.set(eaveX, eaveDropY, fz);
            tuft.rotation.z = side * (Math.PI - 0.48);
        }
    }

    // Bundled Golden Hay Ridge Cap & Crossed Timber Hold-Down Spars along the Roof Crest
    const ridgeHayBundleGeo = new THREE.CylinderGeometry(0.28, 0.28, roofLen + 0.36, 12, 16);
    ridgeHayBundleGeo.rotateX(Math.PI / 2);
    const rPos = ridgeHayBundleGeo.attributes.position;
    for (let k = 0; k < rPos.count; k++) {
        const vz = rPos.getZ(k);
        const pinch = 1.0 - 0.14 * Math.pow(Math.sin(vz * 2.8), 2.0);
        rPos.setX(k, rPos.getX(k) * pinch);
        rPos.setY(k, rPos.getY(k) * pinch);
    }
    ridgeHayBundleGeo.computeVertexNormals();
    const ridgeHayCap = addPart(new THREE.Mesh(ridgeHayBundleGeo, thatchRoofMat));
    ridgeHayCap.position.set(0, ridgeY + 0.22, roofCenterZ);

    // Traditional crossed wooden wind-weights (katsuogi / thatch rider spars) pinning the hay ridge
    for (let rz = roofZStart + 0.65; rz <= roofZEnd - 0.65; rz += 1.15) {
        const lashRing = addPart(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.026, 6, 12), ropeLashMat));
        lashRing.position.set(0, ridgeY + 0.22, rz);
        for (let side = -1; side <= 1; side += 2) {
            const riderSpar = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.95, 6), darkLogMat));
            riderSpar.position.set(side * 0.18, ridgeY + 0.36, rz);
            riderSpar.rotation.z = -side * 0.62;
        }
    }

    // Carved Spirit-Bird Gable Crest & Crossed Ceremonial Horns above the front veranda
    for (let side = -1; side <= 1; side += 2) {
        const horn = addPart(new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.45, 7), boneMat));
        horn.position.set(side * 0.35, ridgeY + 0.42, roofZEnd + 0.25);
        horn.rotation.z = -side * 0.55;
        horn.rotation.x = 0.22;
    }
    const sunDiscGable = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.09, 14), terracottaMat));
    sunDiscGable.rotation.x = Math.PI / 2;
    sunDiscGable.position.set(0, ridgeY - 0.32, roofZEnd + 0.05);
    const sunGem = addPart(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), turquoiseGemMat));
    sunGem.position.set(0, ridgeY - 0.32, roofZEnd + 0.10);

    // ====================================================================
    // 4. DETAILED CABIN INTERIOR (RUG, BED, WORKBENCH, BRAZIER & LANTERNS)
    // ====================================================================
    // 4A. Woven Pandanus Floor Mat with geometric tribal patterns
    const rugMat = new THREE.MeshStandardMaterial({
        map: createTribalRugTexture(),
        roughness: 0.88
    });
    const rugMesh = addPart(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.025, 2.7), rugMat));
    rugMesh.position.set(0.0, floorY + 0.06, 0.05);

    // 4B. Raised Timber & Bamboo Sleeping Platform / Bed (Left side of cabin interior, X = -1.85)
    const bedGroup = new THREE.Group();
    bedGroup.position.set(-1.82, floorY + 0.05, -0.85);
    cabinGroup.add(bedGroup);

    const bedW = 1.65, bedL = 2.65, bedH = 0.48;
    for (let bx of [-bedW * 0.45, bedW * 0.45]) {
        for (let bz of [-bedL * 0.45, bedL * 0.45]) {
            const leg = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, bedH, 7), darkLogMat), bedGroup);
            leg.position.set(bx, bedH * 0.5, bz);
        }
    }
    const bedFrame = addPart(new THREE.Mesh(new THREE.BoxGeometry(bedW, 0.09, bedL), medWoodMat), bedGroup);
    bedFrame.position.set(0, bedH, 0);

    // Animal pelt / hide throw & woven pandanus mattress
    const mattress = addPart(new THREE.Mesh(new THREE.BoxGeometry(bedW - 0.14, 0.12, bedL - 0.16), ropeLashMat), bedGroup);
    mattress.position.set(0, bedH + 0.09, 0);

    const furPelt = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.74, 0.05, 9), peltMat), bedGroup);
    furPelt.scale.set(1.0, 1.0, 1.35);
    furPelt.position.set(0.04, bedH + 0.16, 0.15);

    // Traditional carved wooden tribal headrest / pillow & rolled woven blanket
    const pillowRoll = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.15, 10), terracottaMat), bedGroup);
    pillowRoll.rotation.z = Math.PI / 2;
    pillowRoll.position.set(0, bedH + 0.22, -0.95);

    // 4C. Shaman / Navigator's Workbench Table (Right side of cabin interior, X = +1.78)
    const tableGroup = new THREE.Group();
    tableGroup.position.set(1.78, floorY + 0.05, -0.55);
    cabinGroup.add(tableGroup);

    const tabW = 1.45, tabL = 2.35, tabH = 0.78;
    for (let tx of [-tabW * 0.42, tabW * 0.42]) {
        for (let tz of [-tabL * 0.42, tabL * 0.42]) {
            const tLeg = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, tabH, 7), darkLogMat), tableGroup);
            tLeg.position.set(tx, tabH * 0.5, tz);
        }
    }
    const tableTop = addPart(new THREE.Mesh(new THREE.BoxGeometry(tabW, 0.08, tabL), plankFloorMat), tableGroup);
    tableTop.position.set(0, tabH, 0);

    // Carved wooden stool beside the workbench
    const stool = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.46, 10), darkLogMat), tableGroup);
    stool.position.set(-0.92, 0.23, 0.15);

    // 4D. Micronesian / Polynesian Stick-Chart Wave Navigator Gadget on the Workbench!
    const chartGroup = new THREE.Group();
    chartGroup.position.set(-0.12, tabH + 0.06, -0.35);
    chartGroup.rotation.y = 0.18;
    tableGroup.add(chartGroup);

    // Perimeter bamboo frame + diagonal curved ocean-swell sticks
    const stickPaths = [
        [[-0.38, -0.45], [0.38, -0.45]],
        [[-0.38,  0.45], [0.38,  0.45]],
        [[-0.38, -0.45], [-0.38, 0.45]],
        [[ 0.38, -0.45], [ 0.38, 0.45]],
        [[-0.38, -0.45], [0.38,  0.45]],
        [[-0.38,  0.45], [0.38, -0.45]],
        [[-0.38,  0.0],  [0.38,  0.0]],
        [[ 0.0,  -0.45], [0.0,   0.45]]
    ];
    stickPaths.forEach(([p1, p2]) => {
        const sdx = p2[0] - p1[0], sdz = p2[1] - p1[1];
        const slen = Math.hypot(sdx, sdz);
        const stick = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, slen, 5), bambooMat), chartGroup);
        stick.rotation.x = Math.PI / 2;
        stick.rotation.z = -Math.atan2(sdx, sdz);
        stick.position.set((p1[0] + p2[0]) * 0.5, 0.015, (p1[1] + p2[1]) * 0.5);
    });
    // Cowrie shell & turquoise island markers tied at stick intersections
    const shellNodes = [[0, 0], [-0.22, -0.26], [0.24, 0.28], [-0.24, 0.25], [0.28, -0.18], [0, 0.32]];
    shellNodes.forEach(([nx, nz], idx) => {
        const shell = addPart(new THREE.Mesh(new THREE.SphereGeometry(0.032, 7, 7), idx === 0 ? turquoiseGemMat : boneMat), chartGroup);
        shell.scale.set(1.2, 0.65, 0.9);
        shell.position.set(nx, 0.028, nz);
    });

    // 4E. Stone Mortar & Pestle with Bioluminescent Herbal Paste + Painted Gourd Vessels on Workbench
    const mortar = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.13, 0.16, 10), stoneMat), tableGroup);
    mortar.position.set(0.24, tabH + 0.11, 0.52);
    const herbalPaste = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.05, 10), turquoiseGemMat), tableGroup);
    herbalPaste.position.set(0.24, tabH + 0.17, 0.52);
    const pestle = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.048, 0.28, 7), stoneMat), tableGroup);
    pestle.position.set(0.28, tabH + 0.24, 0.54);
    pestle.rotation.z = -0.42;

    // Gourd water bottle & ceramic tribal bowl
    const gourdBot = addPart(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), terracottaMat), tableGroup);
    gourdBot.position.set(-0.26, tabH + 0.16, 0.72);
    const gourdTop = addPart(new THREE.Mesh(new THREE.SphereGeometry(0.095, 9, 9), terracottaMat), tableGroup);
    gourdTop.position.set(-0.26, tabH + 0.32, 0.72);
    const gourdNeck = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 7), ropeLashMat), tableGroup);
    gourdNeck.position.set(-0.26, tabH + 0.25, 0.72);

    // 4F. Back Storage Shelves with Tribal Skulls, Conch Shells, Coiled Rope & Scrolls
    for (let shY of [floorY + 1.05, floorY + 1.68]) {
        const shelf = addPart(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.42), plankFloorMat));
        shelf.position.set(0.0, shY, -2.14);

        for (let side = -0.8; side <= 0.8; side += 1.6) {
            const bracket = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), darkLogMat));
            bracket.position.set(side, shY - 0.14, -2.20);
            bracket.rotation.x = 0.6;
        }
    }
    // Artifacts on shelves: Conch shell horn, terracotta urns, glowing crystal Cluster
    for (let p = 0; p < 4; p++) {
        const pot = addPart(new THREE.Mesh(new THREE.SphereGeometry(0.15, 9, 9), p % 2 === 0 ? terracottaMat : bambooMat));
        pot.scale.set(1.0, 1.2, 1.0);
        pot.position.set(-0.72 + p * 0.48, floorY + 1.22, -2.12);
    }
    const crystalCluster = addPart(new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), turquoiseGemMat));
    crystalCluster.position.set(0.25, floorY + 1.84, -2.12);

    const conchHorn = addPart(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 9), boneMat));
    conchHorn.rotation.z = Math.PI / 2.2;
    conchHorn.position.set(-0.38, floorY + 1.80, -2.12);

    // 4G. Indoor Ceremonial Stone Hearth / Brazier with Glowing Embers
    const brazierGroup = new THREE.Group();
    brazierGroup.position.set(0.0, floorY + 0.05, -0.35);
    cabinGroup.add(brazierGroup);

    const brazierBowl = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.34, 0.22, 12), stoneMat), brazierGroup);
    brazierBowl.position.set(0, 0.11, 0);
    for (let s = 0; s < 10; s++) {
        const sa = (s / 10) * Math.PI * 2;
        const rimStone = addPart(new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), stoneMat), brazierGroup);
        rimStone.position.set(Math.cos(sa) * 0.42, 0.20, Math.sin(sa) * 0.42);
    }
    const embers = addPart(new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), emberGlowMat), brazierGroup);
    embers.scale.set(1.0, 0.38, 1.0);
    embers.position.set(0, 0.19, 0);

    // Wooden tripod cooking rack over the indoor brazier with suspended herb kettle
    for (let leg = 0; leg < 3; leg++) {
        const la = (leg / 3) * Math.PI * 2 + 0.3;
        const pole = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.15, 6), darkLogMat), brazierGroup);
        pole.position.set(Math.cos(la) * 0.24, 0.58, Math.sin(la) * 0.24);
        pole.rotation.y = -la;
        pole.rotation.z = 0.32;
    }
    const herbPot = addPart(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), darkLogMat), brazierGroup);
    herbPot.position.set(0, 0.54, 0);

    // ====================================================================
    // 5. TRIBAL GADGETS: CARVED TIKI MASKS, WEAPON RACK, DRUMS & TRAPS
    // ====================================================================
    // Helper to build a detailed 3D Carved Tribal Tiki Mask with glowing eyes & feathered crest
    const createTribalMask = (seed = 0, scale = 1.0) => {
        const mGroup = new THREE.Group();
        mGroup.scale.setScalar(scale);

        const maskMat = new THREE.MeshStandardMaterial({
            map: createTribalMaskTexture(seed),
            roughness: 0.75
        });
        const shieldPlate = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.92, 10), maskMat), mGroup);
        shieldPlate.scale.set(1.0, 1.0, 0.35);

        // Heavy carved brow ridge & nose bridge
        const brow = addPart(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.09, 0.18), darkLogMat), mGroup);
        brow.position.set(0, 0.16, 0.08);
        const nose = addPart(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.18), darkLogMat), mGroup);
        nose.position.set(0, 0.02, 0.10);

        // Glowing shell/amber eyes
        const eyeMat = seed === 1 ? turquoiseGemMat : gourdGlowMat;
        for (let side = -1; side <= 1; side += 2) {
            const eye = addPart(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat), mGroup);
            eye.scale.set(1.3, 0.8, 0.6);
            eye.position.set(side * 0.14, 0.08, 0.11);
        }

        // Carved grimacing mouth rim & bone teeth
        const mouth = addPart(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.16), terracottaMat), mGroup);
        mouth.position.set(0, -0.22, 0.08);
        for (let t = -2; t <= 2; t++) {
            const tooth = addPart(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.05), boneMat), mGroup);
            tooth.position.set(t * 0.06, -0.22, 0.15);
        }

        // Fan of painted ceremonial feathers crowning the mask
        const featherCols = [0xef4444, 0xfbbf24, 0x38bdf8, 0xf97316, 0x10b981];
        for (let f = -3; f <= 3; f++) {
            const fMat = new THREE.MeshStandardMaterial({ color: featherCols[Math.abs(f + seed) % featherCols.length], roughness: 0.6, side: THREE.DoubleSide });
            const feather = addPart(new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.42, 4), fMat), mGroup);
            feather.scale.set(1.0, 1.0, 0.22);
            const fang = f * 0.24;
            feather.position.set(Math.sin(fang) * 0.38, 0.48 + Math.cos(fang) * 0.16, -0.02);
            feather.rotation.z = -fang;
        }
        return mGroup;
    };

    // Mount 2 Guardian Tiki Masks on the Front Doorway Posts facing the campfire, plus 1 Chieftain Mask inside on the back wall
    const leftDoorMask = createTribalMask(0, 0.82);
    leftDoorMask.position.set(-1.12, floorY + 1.58, 2.58);
    cabinGroup.add(leftDoorMask);

    const rightDoorMask = createTribalMask(1, 0.82);
    rightDoorMask.position.set(1.12, floorY + 1.58, 2.58);
    cabinGroup.add(rightDoorMask);

    const innerChiefMask = createTribalMask(2, 1.05);
    innerChiefMask.position.set(0.0, floorY + 2.28, -2.22);
    cabinGroup.add(innerChiefMask);

    // 5B. Tribal Weapon & Fishing Spear Rack (on the Front Porch left side, Z = 2.58, X = -2.05)
    const rackGroup = new THREE.Group();
    rackGroup.position.set(-2.05, floorY + 0.05, 2.68);
    cabinGroup.add(rackGroup);

    for (let rx of [-0.55, 0.55]) {
        const rPost = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.45, 6), darkLogMat), rackGroup);
        rPost.position.set(rx, 0.72, 0);
    }
    const rCrossTop = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35, 6), bambooMat), rackGroup);
    rCrossTop.rotation.z = Math.PI / 2;
    rCrossTop.position.set(0, 1.15, 0.06);
    const rCrossBot = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.35, 6), bambooMat), rackGroup);
    rCrossBot.rotation.z = Math.PI / 2;
    rCrossBot.position.set(0, 0.25, 0.14);

    // 4 Obsidian & Bone-barbed Fishing Spears / Harpoons resting in the rack
    for (let s = 0; s < 4; s++) {
        const spX = -0.39 + s * 0.26;
        const spearShaft = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 2.35, 6), bambooMat), rackGroup);
        spearShaft.position.set(spX, 1.18, 0.10);
        spearShaft.rotation.x = -0.08;

        // Obsidian / bone spearhead
        const spearTip = addPart(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 4), s % 2 === 0 ? obsidianMat : boneMat), rackGroup);
        spearTip.position.set(spX, 2.40, 0.01);
        spearTip.rotation.x = -0.08;
    }

    // Ceremonial Carved War Club & Tribal Hunting Bow leaning against the rack
    const clubHandle = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.15, 7), darkLogMat), rackGroup);
    clubHandle.position.set(0.72, 0.56, 0.18);
    clubHandle.rotation.z = 0.22;
    const clubHead = addPart(new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 1), obsidianMat), rackGroup);
    clubHead.scale.set(1.2, 1.8, 0.55);
    clubHead.position.set(0.60, 1.05, 0.18);

    // 5C. Tribal Drums (Hollowed Log Slit-Drum & Hide-Stretched Djembe Drums on the Veranda & by the Fire)
    const createDjembeDrum = (scale = 1.0) => {
        const dGroup = new THREE.Group();
        dGroup.scale.setScalar(scale);
        const base = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.20, 0.34, 10), darkLogMat), dGroup);
        base.position.y = 0.17;
        const bowl = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.14, 0.38, 12), terracottaMat), dGroup);
        bowl.position.y = 0.52;
        const skinHead = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.29, 0.05, 12), boneMat), dGroup);
        skinHead.position.y = 0.72;
        const ropeRing = addPart(new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.022, 6, 12), ropeLashMat), dGroup);
        ropeRing.rotation.x = Math.PI / 2;
        ropeRing.position.y = 0.68;
        return dGroup;
    };

    const porchDrum1 = createDjembeDrum(0.95);
    porchDrum1.position.set(2.15, floorY + 0.05, 3.35);
    cabinGroup.add(porchDrum1);

    const porchDrum2 = createDjembeDrum(0.76);
    porchDrum2.position.set(2.52, floorY + 0.05, 3.82);
    cabinGroup.add(porchDrum2);

    // Carved Hollowed Slit-Log Drum beside the porch steps
    const slitDrumGroup = new THREE.Group();
    slitDrumGroup.position.set(-2.35, 0.22, 5.15);
    slitDrumGroup.rotation.y = 0.38;
    cabinGroup.add(slitDrumGroup);

    const slitLogGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.85, 12);
    slitLogGeo.rotateZ(Math.PI / 2);
    addPart(new THREE.Mesh(slitLogGeo, darkLogMat), slitDrumGroup);
    const slitSlot = addPart(new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 0.12), obsidianMat), slitDrumGroup);
    slitSlot.position.set(0, 0.29, 0);

    // 5D. Woven Conical Bamboo Fish Traps & Drying Rack with Cured Fish beside the Cabin & Fire
    const createFishTrap = (x, y, z, rotZ = 0) => {
        const trapGroup = new THREE.Group();
        trapGroup.position.set(x, y, z);
        trapGroup.rotation.z = rotZ;
        const coneTrap = addPart(new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.15, 10, 4, true), bambooMat), trapGroup);
        coneTrap.position.y = 0.55;
        for (let r = 0; r < 3; r++) {
            const hoop = addPart(new THREE.Mesh(new THREE.TorusGeometry(0.34 * (1 - r * 0.26), 0.018, 5, 10), ropeLashMat), trapGroup);
            hoop.rotation.x = Math.PI / 2;
            hoop.position.y = 0.18 + r * 0.32;
        }
        cabinGroup.add(trapGroup);
    };
    createFishTrap(-2.38, floorY + 0.05, 3.85, 0.0);
    createFishTrap(-1.82, floorY + 0.36, 4.05, 1.38);

    // Outdoor Tribal Fish & Herb Drying Frame + Towering Carved Totem Pole between the Cabin and Campfire
    const dryRackGroup = new THREE.Group();
    dryRackGroup.position.set(3.85, 0.0, 3.45);
    dryRackGroup.rotation.y = -0.35;
    cabinGroup.add(dryRackGroup);

    for (let side = -1; side <= 1; side += 2) {
        for (let slant = -1; slant <= 1; slant += 2) {
            const leg = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.25, 6), darkLogMat), dryRackGroup);
            leg.position.set(side * 1.05, 1.02, slant * 0.38);
            leg.rotation.x = -slant * 0.22;
        }
    }
    const dryBar = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.55, 7), bambooMat), dryRackGroup);
    dryBar.rotation.z = Math.PI / 2;
    dryBar.position.set(0, 1.98, 0);

    // Hanging cured fish & dried herb bundles on the rack
    const fishCureGeo = new THREE.ConeGeometry(0.11, 0.48, 5);
    fishCureGeo.scale(0.45, 1.0, 1.0);
    for (let f = -0.75; f <= 0.75; f += 0.38) {
        const curedFish = addPart(new THREE.Mesh(fishCureGeo, terracottaMat), dryRackGroup);
        curedFish.position.set(f, 1.62, 0);
    }

    // Towering 3-Tier Carved Totem Pole with Glowing Eyes standing sentinel beside the porch and campfire
    const totemGroup = new THREE.Group();
    totemGroup.position.set(3.55, 0.0, 5.45);
    totemGroup.rotation.y = -0.25;
    cabinGroup.add(totemGroup);

    const totemPillar = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 3.65, 10), darkLogMat), totemGroup);
    totemPillar.position.y = 1.82;
    for (let tier = 0; tier < 3; tier++) {
        const ty = 0.85 + tier * 0.98;
        const tMask = createTribalMask(tier, 0.65);
        tMask.position.set(0, ty, 0.22);
        totemGroup.add(tMask);
    }
    // Totem wings at the top
    for (let side = -1; side <= 1; side += 2) {
        const wing = addPart(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 0.08), terracottaMat), totemGroup);
        wing.position.set(side * 0.58, 3.15, 0);
        wing.rotation.z = side * 0.24;
    }

    // ====================================================================
    // 6. ANIMATED BAMBOO WIND CHIMES, SHELL TALISMANS & HANGING GOURD LANTERNS
    // ====================================================================
    const createWindChime = (lx, ly, lz, phaseOffset) => {
        const chimeGroup = new THREE.Group();
        chimeGroup.position.set(lx, ly, lz);

        const topRing = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 8), darkLogMat), chimeGroup);
        topRing.position.y = -0.15;

        for (let c = 0; c < 6; c++) {
            const ca = (c / 6) * Math.PI * 2;
            const tubeLen = 0.32 + (c % 3) * 0.11;
            const tube = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, tubeLen, 6), bambooMat), chimeGroup);
            tube.position.set(Math.cos(ca) * 0.12, -0.18 - tubeLen * 0.5, Math.sin(ca) * 0.12);
        }
        // Central turquoise shell pendulum
        const shellPendulum = addPart(new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), turquoiseGemMat), chimeGroup);
        shellPendulum.position.set(0, -0.62, 0);

        cabinGroup.add(chimeGroup);
        windChimeGroups.push({ group: chimeGroup, phase: phaseOffset });
    };

    createWindChime(-2.15, eaveY - 0.05, 4.45, 0.0);
    createWindChime( 2.15, eaveY - 0.05, 4.45, 2.1);

    // Hanging Carved Gourd Lanterns (1 inside main cabin, 1 over the front veranda porch)
    const createHangingLantern = (lx, ly, lz, lightIntensity, phase) => {
        const lGroup = new THREE.Group();
        lGroup.position.set(lx, ly, lz);

        const cord = addPart(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.58, 5), ropeLashMat), lGroup);
        cord.position.y = -0.29;

        const cap = addPart(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 8), darkLogMat), lGroup);
        cap.position.y = -0.58;

        const glowOrb = addPart(new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), gourdGlowMat), lGroup);
        glowOrb.scale.set(1.0, 1.25, 1.0);
        glowOrb.position.y = -0.76;

        // Bamboo cage ribs around the glowing gourd
        for (let r = 0; r < 4; r++) {
            const ring = addPart(new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.014, 5, 10), darkLogMat), lGroup);
            ring.rotation.y = (r / 4) * Math.PI;
            ring.position.y = -0.76;
        }

        cabinGroup.add(lGroup);
        windChimeGroups.push({ group: lGroup, phase: phase + 1.1 });

        // Compute world position for the dynamic PointLight so it illuminates the cabin interior & beach
        cabinGroup.updateMatrixWorld(true);
        const worldPos = new THREE.Vector3(0, -0.76, 0).applyMatrix4(lGroup.matrixWorld);
        const ptLight = new THREE.PointLight(0xff9829, lightIntensity, 26.0, 1.5);
        ptLight.position.copy(worldPos);
        scene.add(ptLight);
        dynamicLights.push({ light: ptLight, baseIntensity: lightIntensity, phase });
    };

    scene.add(cabinGroup);
    createHangingLantern(0.0, ridgeY - 0.45, -0.20, 9.5, 1.2); // Warm interior cabin light
    createHangingLantern(0.0, ridgeY - 0.65,  3.65, 7.5, 3.8); // Warm veranda porch light
}
