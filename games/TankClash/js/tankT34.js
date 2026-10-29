// ============================================================================
// T-34-85 Medium Tank (1944 Pattern, Tactical "No. 311")
// Exact 1:1 Architectural Port of the Interactive Museum Scene Model
// Sloped 60° Upper Glacis, Cast 1944 Turret with "311" & Polish Piast Eagle,
// Spoked Starfish Christie Road Wheels & Articulated Caterpillar Tracks
// ============================================================================

const t34AssetCache = {};

// Textures and materials are built once per variant (enemy/player) and reused by every tank of that variant.
function getT34SharedAssets(isEnemy) {
    const key = isEnemy ? 'enemy' : 'player';
    if (t34AssetCache[key]) return t34AssetCache[key];

    // ============================================================================
    // 1. PROCEDURAL PBR TEXTURES (Mottled 4BO Olive Green, Cast Bump, "311" Decals)
    // ============================================================================
    let seedVal = 1337;
    function sRand() {
        seedVal = (seedVal * 16807) % 2147483647;
        return (seedVal - 1) / 2147483646;
    }

    function createArmorTextures() {
        const size = 512;
        const diffCanvas = document.createElement('canvas');
        diffCanvas.width = diffCanvas.height = size;
        const dCtx = diffCanvas.getContext('2d');

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');

        // Base olive drab / weathered Soviet-Polish 4BO dark green-brown
        dCtx.fillStyle = '#131a12';
        dCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        // Add mottled paint variation, dust, and rust patches
        for (let i = 0; i < 3200; i++) {
            const x = sRand() * size;
            const y = sRand() * size;
            const r = 3 + sRand() * 26;
            const pick = sRand();
            if (pick < 0.45) {
                dCtx.fillStyle = `rgba(14, 18, 12, ${0.05 + sRand() * 0.08})`;
            } else if (pick < 0.8) {
                dCtx.fillStyle = `rgba(24, 31, 20, ${0.04 + sRand() * 0.07})`;
            } else {
                dCtx.fillStyle = `rgba(28, 22, 16, ${0.03 + sRand() * 0.06})`;
            }
            dCtx.beginPath();
            dCtx.arc(x, y, r, 0, Math.PI * 2);
            dCtx.fill();
        }

        // Fine cast steel pitting for bump map
        for (let i = 0; i < 9000; i++) {
            const x = sRand() * size;
            const y = sRand() * size;
            const rad = 0.8 + sRand() * 2.5;
            const shade = Math.floor(95 + (sRand() - 0.5) * 90);
            bCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
            bCtx.beginPath();
            bCtx.arc(x, y, rad, 0, Math.PI * 2);
            bCtx.fill();
        }

        // Rain streaks (vertical weathering)
        for (let i = 0; i < 180; i++) {
            const x = sRand() * size;
            const y = sRand() * size;
            const h = 30 + sRand() * 90;
            dCtx.fillStyle = `rgba(10, 14, 9, 0.08)`;
            dCtx.fillRect(x, y, 1.5, h);
        }

        // Procedural Scratches & Ricochet Scrapes for Soviet T-34-85 Armor
        // 75 prominent linear scratches with bare steel highlights and 3D bump grooves
        for (let s = 0; s < 75; s++) {
            const x0 = sRand() * size;
            const y0 = sRand() * size;
            const angle = sRand() * Math.PI * 2;
            const len = 16 + sRand() * 65;
            const x1 = x0 + Math.cos(angle) * len;
            const y1 = y0 + Math.sin(angle) * len;

            // Bump map scratch furrow
            bCtx.save();
            bCtx.strokeStyle = 'rgb(40, 40, 40)';
            bCtx.lineWidth = 2.0;
            bCtx.beginPath();
            bCtx.moveTo(x0, y0);
            bCtx.lineTo(x1, y1);
            bCtx.stroke();

            bCtx.strokeStyle = 'rgb(215, 215, 215)';
            bCtx.lineWidth = 1.0;
            bCtx.beginPath();
            bCtx.moveTo(x0, y0 - 1);
            bCtx.lineTo(x1, y1 - 1);
            bCtx.stroke();
            bCtx.restore();

            // Diffuse map: dark paint edge + bright bare silver steel core
            dCtx.save();
            dCtx.strokeStyle = 'rgba(12, 16, 11, 0.85)';
            dCtx.lineWidth = 2.2;
            dCtx.beginPath();
            dCtx.moveTo(x0, y0 + 1);
            dCtx.lineTo(x1, y1 + 1);
            dCtx.stroke();

            const bright = 135 + Math.floor(sRand() * 26);
            dCtx.strokeStyle = `rgba(${bright}, ${bright + 4}, ${bright}, 0.92)`;
            dCtx.lineWidth = 1.1;
            dCtx.beginPath();
            dCtx.moveTo(x0, y0);
            dCtx.lineTo(x1, y1);
            dCtx.stroke();
            dCtx.restore();
        }

        // 220 fine micro-scratches & abrasions
        for (let s = 0; s < 220; s++) {
            const x0 = sRand() * size;
            const y0 = sRand() * size;
            const angle = sRand() * Math.PI * 2;
            const len = 4 + sRand() * 12;
            const x1 = x0 + Math.cos(angle) * len;
            const y1 = y0 + Math.sin(angle) * len;

            dCtx.strokeStyle = 'rgba(92, 100, 92, 0.70)';
            dCtx.lineWidth = 0.8;
            dCtx.beginPath();
            dCtx.moveTo(x0, y0);
            dCtx.lineTo(x1, y1);
            dCtx.stroke();
        }

        const diffTex = new THREE.CanvasTexture(diffCanvas);
        diffTex.wrapS = diffTex.wrapT = THREE.RepeatWrapping;
        diffTex.repeat.set(2, 2);

        const bumpTex = new THREE.CanvasTexture(bumpCanvas);
        bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
        bumpTex.repeat.set(3, 3);

        return { diffTex, bumpTex, baseCanvas: diffCanvas };
    }

    function createTurretDecalTexture(baseCanvas, isLeftSide) {
        const w = 1024;
        const h = 512;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(baseCanvas, 0, 0, w, h);

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(14, 18, 12, 0.45)');
        grad.addColorStop(0.2, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(10, 12, 8, 0.62)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        const numX = isLeftSide ? 420 : 600;
        const eagleX = isLeftSide ? 690 : 330;
        const centerY = 265;

        ctx.fillStyle = 'rgba(238, 240, 235, 0.92)';
        ctx.strokeStyle = 'rgba(238, 240, 235, 0.92)';
        ctx.font = 'bold 165px "Inter", "Arial Narrow", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.save();
        ctx.translate(numX, centerY);
        ctx.scale(0.82, 1.15);
        ctx.fillText('311', 0, 0);
        ctx.restore();

        // Polish Piast Eagle (Kurica) in white
        ctx.save();
        ctx.translate(eagleX, centerY - 22);
        ctx.scale(0.95, 1.05);

        ctx.beginPath();
        ctx.ellipse(0, 5, 14, 24, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, -24, 8, 0, Math.PI * 2);
        ctx.fill();

        const beakDir = isLeftSide ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(0, -27);
        ctx.lineTo(beakDir * 14, -23);
        ctx.lineTo(0, -20);
        ctx.fill();

        [-1, 1].forEach((side) => {
            ctx.beginPath();
            ctx.moveTo(side * 8, -8);
            ctx.quadraticCurveTo(side * 36, -34, side * 44, -18);
            ctx.lineTo(side * 38, -8);
            ctx.lineTo(side * 42, 0);
            ctx.lineTo(side * 33, 6);
            ctx.lineTo(side * 36, 14);
            ctx.lineTo(side * 12, 14);
            ctx.closePath();
            ctx.fill();
        });

        ctx.beginPath();
        ctx.moveTo(-10, 22);
        ctx.lineTo(-18, 40);
        ctx.lineTo(0, 34);
        ctx.lineTo(18, 40);
        ctx.lineTo(10, 22);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        for (let i = 0; i < 420; i++) {
            const rx = (isLeftSide ? 300 : 240) + sRand() * 480;
            const ry = 140 + sRand() * 230;
            const rr = 1 + sRand() * 4.5;
            ctx.fillStyle = sRand() > 0.3 ? '#20281b' : '#141a11';
            ctx.beginPath();
            ctx.arc(rx, ry, rr, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(12, 16, 10, 0.85)';
        ctx.font = 'bold 20px monospace';
        ctx.fillText('915', numX - 38, centerY + 95);

        // Linear scratches cutting across decal stencil and turret wall
        ctx.save();
        for (let i = 0; i < 48; i++) {
            const sx0 = 120 + sRand() * 780;
            const sy0 = 80 + sRand() * 340;
            const slen = 18 + sRand() * 65;
            const sAngle = (sRand() - 0.5) * 0.40;
            const sx1 = sx0 + Math.cos(sAngle) * slen;
            const sy1 = sy0 + Math.sin(sAngle) * slen;

            ctx.strokeStyle = 'rgba(12, 16, 11, 0.75)';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(sx0, sy0 + 1);
            ctx.lineTo(sx1, sy1 + 1);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(148, 156, 146, 0.88)';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(sx0, sy0);
            ctx.lineTo(sx1, sy1);
            ctx.stroke();
        }
        ctx.restore();

        ctx.restore();
        return new THREE.CanvasTexture(canvas);
    }

    function createMuseumPlaqueTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#e8ece6';
        ctx.fillRect(0, 0, 256, 160);
        ctx.strokeStyle = '#2d3329';
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, 244, 148);

        ctx.fillStyle = '#1b1f18';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.fillText('CZOŁG ŚREDNI T-34-85', 18, 38);
        ctx.font = '15px monospace';
        ctx.fillText('Kaliber: 85 mm ZiS-S-53', 18, 68);
        ctx.fillText('Masa: 32 000 kg', 18, 92);
        ctx.fillText('Silnik: W-2-34 (500 KM)', 18, 116);
        ctx.fillText('Załoga: 5 ludzi | Nr 311', 18, 140);

        return new THREE.CanvasTexture(canvas);
    }

    const armorTextures = createArmorTextures();
    const turretLeftTex = createTurretDecalTexture(armorTextures.baseCanvas, true);
    const turretRightTex = createTurretDecalTexture(armorTextures.baseCanvas, false);
    const plaqueTex = createMuseumPlaqueTexture();

    const materials = {
        hullArmor: new THREE.MeshStandardMaterial({
            map: armorTextures.diffTex,
            bumpMap: armorTextures.bumpTex,
            bumpScale: 0.012,
            roughness: 0.52,
            metalness: 0.30
        }),
        castTurret: new THREE.MeshStandardMaterial({
            map: armorTextures.diffTex,
            bumpMap: armorTextures.bumpTex,
            bumpScale: 0.026,
            roughness: 0.48,
            metalness: 0.34
        }),
        turretSideLeft: new THREE.MeshStandardMaterial({
            map: turretLeftTex,
            bumpMap: armorTextures.bumpTex,
            bumpScale: 0.025,
            roughness: 0.48,
            metalness: 0.34
        }),
        turretSideRight: new THREE.MeshStandardMaterial({
            map: turretRightTex,
            bumpMap: armorTextures.bumpTex,
            bumpScale: 0.025,
            roughness: 0.48,
            metalness: 0.34
        }),
        weatheredFender: new THREE.MeshStandardMaterial({
            map: armorTextures.diffTex,
            bumpMap: armorTextures.bumpTex,
            bumpScale: 0.015,
            roughness: 0.54,
            metalness: 0.30
        }),
        gunBarrel: new THREE.MeshStandardMaterial({
            map: armorTextures.diffTex,
            bumpMap: armorTextures.bumpTex,
            bumpScale: 0.008,
            roughness: 0.45,
            metalness: 0.48
        }),
        darkSteel: new THREE.MeshStandardMaterial({
            color: 0x222620,
            roughness: 0.58,
            metalness: 0.65
        }),
        trackMetal: new THREE.MeshStandardMaterial({
            color: 0x272925,
            bumpMap: armorTextures.bumpTex,
            bumpScale: 0.02,
            roughness: 0.72,
            metalness: 0.60
        }),
        rubberTire: new THREE.MeshStandardMaterial({
            color: 0x16181b,
            roughness: 0.88,
            metalness: 0.08
        }),
        exhaustRust: new THREE.MeshStandardMaterial({
            color: 0x483424,
            bumpMap: armorTextures.bumpTex,
            bumpScale: 0.03,
            roughness: 0.90,
            metalness: 0.20
        }),
        plaqueMat: new THREE.MeshStandardMaterial({
            map: plaqueTex,
            roughness: 0.4,
            metalness: 0.1
        })
    };
    Object.values(materials).forEach((mat) => {
        mat.userData.shared = true;
        if (isEnemy && mat.isMeshStandardMaterial) mat.envMapIntensity = 0.3;
    });

    t34AssetCache[key] = { materials };
    return t34AssetCache[key];
}

function buildT34Tank(scene, mats, options = {}) {
    const H_OFF = 0.92; // Offset to align with game physics suspension frame

    const tankRoot = new THREE.Group();
    const sc = scene || (typeof window !== 'undefined' ? window.scene : null);
    if (sc && typeof sc.add === 'function') sc.add(tankRoot);

    const hullGroup = new THREE.Group();
    hullGroup.position.y = H_OFF;
    tankRoot.add(hullGroup);

    const { materials } = getT34SharedAssets(!!options.isEnemy);

    function regPart(mesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    // ============================================================================
    // 2. SLOPED 60° HULL, EXTRUDED PROFILE, FENDERS & FLAPS
    // ============================================================================
    const lowerTubGeo = new THREE.BoxGeometry(1.92, 0.56, 5.45);
    const lowerTub = regPart(new THREE.Mesh(lowerTubGeo, materials.hullArmor));
    lowerTub.position.set(0, 0.72 - H_OFF, 0);
    hullGroup.add(lowerTub);

    const upperHullGroup = new THREE.Group();
    hullGroup.add(upperHullGroup);

    // Center Upper Hull Core (vertex-accurate extruded profile in Z-Y plane)
    const coreShape = new THREE.Shape();
    coreShape.moveTo(2.96, 0.96 - H_OFF);
    coreShape.lineTo(1.88, 1.58 - H_OFF);
    coreShape.lineTo(-2.15, 1.58 - H_OFF);
    coreShape.lineTo(-2.88, 0.98 - H_OFF);
    coreShape.lineTo(2.96, 0.96 - H_OFF);

    const extrudeSettings = {
        steps: 1,
        depth: 1.84,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 2
    };
    const coreGeo = new THREE.ExtrudeGeometry(coreShape, extrudeSettings);
    coreGeo.rotateY(Math.PI / 2);
    coreGeo.translate(-0.92, 0, 0);
    const coreMesh = regPart(new THREE.Mesh(coreGeo, materials.hullArmor));
    upperHullGroup.add(coreMesh);

    // Left & Right Sloped Upper Side Armor Plates (characteristic 45° angle)
    [-1, 1].forEach((side) => {
        const sidePlateGeo = new THREE.BoxGeometry(0.08, 0.78, 4.75);
        const sidePlate = regPart(new THREE.Mesh(sidePlateGeo, materials.hullArmor));
        sidePlate.position.set(side * 1.13, 1.27 - H_OFF, -0.12);
        sidePlate.rotation.z = side * 0.56;
        upperHullGroup.add(sidePlate);

        // Full-length Track Fenders / Mudguards over tracks
        const fenderGeo = new THREE.BoxGeometry(0.58, 0.035, 5.65);
        const fender = regPart(new THREE.Mesh(fenderGeo, materials.weatheredFender));
        fender.position.set(side * 1.18, 0.97 - H_OFF, 0.02);
        upperHullGroup.add(fender);

        // Folded Hinged Front Mudguard Flaps
        const flapGroup = new THREE.Group();
        flapGroup.position.set(side * 1.18, 0.97 - H_OFF, 2.85);
        flapGroup.rotation.x = 0.52;

        const frontFlapGeo = new THREE.BoxGeometry(0.58, 0.03, 0.46);
        const frontFlap = regPart(new THREE.Mesh(frontFlapGeo, materials.weatheredFender));
        frontFlap.position.set(0, 0, 0.21);
        flapGroup.add(frontFlap);

        const sideSkirtGeo = new THREE.BoxGeometry(0.03, 0.26, 0.46);
        const sideSkirt = regPart(new THREE.Mesh(sideSkirtGeo, materials.weatheredFender));
        sideSkirt.position.set(side * 0.28, -0.12, 0.21);
        flapGroup.add(sideSkirt);

        // Right-side front fender has the white Museum Placard
        if (side === -1) {
            const plaqueGeo = new THREE.PlaneGeometry(0.32, 0.20);
            const plaque = new THREE.Mesh(plaqueGeo, materials.plaqueMat);
            plaque.position.set(-0.298, -0.11, 0.21);
            plaque.rotation.y = -Math.PI / 2;
            flapGroup.add(plaque);
        }

        upperHullGroup.add(flapGroup);
    });

    // Lower Front Glacis Nose & Rounded Nose Casting Beam
    const noseBeamGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.92, 16);
    noseBeamGeo.rotateZ(Math.PI / 2);
    const noseBeam = regPart(new THREE.Mesh(noseBeamGeo, materials.hullArmor));
    noseBeam.position.set(0, 0.95 - H_OFF, 2.94);
    upperHullGroup.add(noseBeam);

    const lowerGlacisGeo = new THREE.BoxGeometry(1.90, 0.58, 0.08);
    const lowerGlacis = regPart(new THREE.Mesh(lowerGlacisGeo, materials.hullArmor));
    lowerGlacis.position.set(0, 0.72 - H_OFF, 2.75);
    lowerGlacis.rotation.x = -0.78;
    upperHullGroup.add(lowerGlacis);

    // Glacis Details (Driver's Hatch, Bow MG, Spare Tracks, Tow Hooks)
    const glacisAngle = Math.atan2(0.62, 1.08);
    const glacisDetails = new THREE.Group();
    glacisDetails.position.set(0, 1.27 - H_OFF, 2.42);
    glacisDetails.rotation.x = glacisAngle;
    upperHullGroup.add(glacisDetails);

    // 1. Driver's Hatch on Left Front Glacis (+X side)
    const driverHatchGroup = new THREE.Group();
    driverHatchGroup.position.set(0.46, 0.04, -0.05);
    glacisDetails.add(driverHatchGroup);

    const hatchPlateGeo = new THREE.BoxGeometry(0.50, 0.05, 0.54);
    const hatchPlate = regPart(new THREE.Mesh(hatchPlateGeo, materials.hullArmor));
    driverHatchGroup.add(hatchPlate);

    [-0.11, 0.11].forEach((px) => {
        const periGeo = new THREE.BoxGeometry(0.14, 0.09, 0.14);
        const peri = regPart(new THREE.Mesh(periGeo, materials.hullArmor));
        peri.position.set(px, 0.05, -0.22);
        driverHatchGroup.add(peri);
    });

    // 2. Ball-mounted 7.62mm DT Bow Machine Gun Blister on Right Glacis (-X side)
    const bowMgGroup = new THREE.Group();
    bowMgGroup.position.set(-0.52, 0.06, -0.02);
    glacisDetails.add(bowMgGroup);

    const mgBlisterGeo = new THREE.SphereGeometry(0.17, 20, 16);
    mgBlisterGeo.scale(1.0, 0.85, 1.15);
    const mgBlister = regPart(new THREE.Mesh(mgBlisterGeo, materials.castTurret));
    bowMgGroup.add(mgBlister);

    const mgMantletGeo = new THREE.CylinderGeometry(0.075, 0.095, 0.12, 16);
    mgMantletGeo.rotateX(Math.PI / 2);
    const mgMantlet = regPart(new THREE.Mesh(mgMantletGeo, materials.castTurret));
    mgMantlet.position.set(0, 0.02, 0.14);
    bowMgGroup.add(mgMantlet);

    const dtBarrelGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.28, 12);
    dtBarrelGeo.rotateX(Math.PI / 2);
    const bowMgBarrel = regPart(new THREE.Mesh(dtBarrelGeo, materials.darkSteel));
    bowMgBarrel.position.set(0, 0.02, 0.24);
    bowMgGroup.add(bowMgBarrel);

    // 3. Spare Waffle Track Links Strapped to Center/Lower Glacis
    const spareTrackGroup = new THREE.Group();
    spareTrackGroup.position.set(0.0, 0.04, 0.28);
    glacisDetails.add(spareTrackGroup);

    for (let i = 0; i < 5; i++) {
        const linkGeo = new THREE.BoxGeometry(0.48, 0.045, 0.11);
        const link = regPart(new THREE.Mesh(linkGeo, materials.trackMetal));
        link.position.set(0, 0.01, (i - 2) * 0.12);
        spareTrackGroup.add(link);

        const toothGeo = new THREE.BoxGeometry(0.04, 0.08, 0.05);
        const tooth = regPart(new THREE.Mesh(toothGeo, materials.trackMetal));
        tooth.position.set((i % 2 === 0 ? -0.08 : 0.08), 0.05, (i - 2) * 0.12);
        spareTrackGroup.add(tooth);
    }

    const strapGeo = new THREE.BoxGeometry(0.56, 0.02, 0.04);
    const strap = regPart(new THREE.Mesh(strapGeo, materials.darkSteel));
    strap.position.set(0, 0.04, 0);
    spareTrackGroup.add(strap);

    // 4. Two Heavy Forged Tow Hooks on Front Glacis
    [-0.62, 0.62].forEach((tx) => {
        const hookGeo = new THREE.TorusGeometry(0.065, 0.024, 10, 18, Math.PI * 1.35);
        const hook = regPart(new THREE.Mesh(hookGeo, materials.darkSteel));
        hook.position.set(tx, 0.04, 0.36);
        hook.rotation.y = Math.PI / 2;
        glacisDetails.add(hook);
    });

    // 5. Hull Side Infantry Handrails
    [-1, 1].forEach((side) => {
        const railGroup = new THREE.Group();
        railGroup.position.set(side * 1.04, 1.48 - H_OFF, 0.25);
        railGroup.rotation.z = side * 0.56;

        const barGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.45, 10);
        barGeo.rotateX(Math.PI / 2);
        const bar = regPart(new THREE.Mesh(barGeo, materials.hullArmor));
        bar.position.set(side * 0.06, 0, 0);
        railGroup.add(bar);

        [-0.65, 0, 0.65].forEach((rz) => {
            const standGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8);
            standGeo.rotateZ(Math.PI / 2);
            const stand = regPart(new THREE.Mesh(standGeo, materials.hullArmor));
            stand.position.set(side * 0.03, 0, rz);
            railGroup.add(stand);
        });

        upperHullGroup.add(railGroup);
    });

    // 6. Rear Engine Deck, Louvers, Exhaust Pipes & Cylindrical Fuel Drums
    const engineCoverGeo = new THREE.BoxGeometry(1.06, 0.05, 1.65);
    const engineCover = regPart(new THREE.Mesh(engineCoverGeo, materials.hullArmor));
    engineCover.position.set(0, 1.61 - H_OFF, -1.15);
    upperHullGroup.add(engineCover);

    [-0.70, 0.70].forEach((vx) => {
        const ventFrameGeo = new THREE.BoxGeometry(0.28, 0.04, 1.35);
        const ventFrame = regPart(new THREE.Mesh(ventFrameGeo, materials.darkSteel));
        ventFrame.position.set(vx, 1.60 - H_OFF, -1.15);
        upperHullGroup.add(ventFrame);

        for (let l = 0; l < 14; l++) {
            const louverGeo = new THREE.BoxGeometry(0.24, 0.015, 0.05);
            const louver = regPart(new THREE.Mesh(louverGeo, materials.hullArmor));
            louver.position.set(vx, 1.62 - H_OFF, -0.55 - l * 0.09);
            louver.rotation.x = 0.35;
            upperHullGroup.add(louver);
        }
    });

    const rearScreenGeo = new THREE.BoxGeometry(1.18, 0.06, 0.55);
    const rearScreen = regPart(new THREE.Mesh(rearScreenGeo, materials.darkSteel));
    rearScreen.position.set(0, 1.59 - H_OFF, -2.02);
    upperHullGroup.add(rearScreen);

    // Twin Rear Armored Exhaust Pipes
    [-0.42, 0.42].forEach((ex) => {
        const exhaustSleeveGeo = new THREE.CylinderGeometry(0.10, 0.11, 0.32, 16);
        exhaustSleeveGeo.rotateX(Math.PI / 3);
        const sleeve = regPart(new THREE.Mesh(exhaustSleeveGeo, materials.hullArmor));
        sleeve.position.set(ex, 1.18 - H_OFF, -2.62);
        upperHullGroup.add(sleeve);

        const pipeGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.38, 14);
        pipeGeo.rotateX(Math.PI / 3);
        const pipe = regPart(new THREE.Mesh(pipeGeo, materials.exhaustRust));
        pipe.position.set(ex, 1.14 - H_OFF, -2.68);
        upperHullGroup.add(pipe);
    });

    // Cylindrical Rear Fuel Drums
    [-1, 1].forEach((side) => {
        const drumGroup = new THREE.Group();
        drumGroup.position.set(side * 1.18, 1.24 - H_OFF, -1.92);
        upperHullGroup.add(drumGroup);

        const drumGeo = new THREE.CylinderGeometry(0.21, 0.21, 1.12, 24);
        drumGeo.rotateX(Math.PI / 2);
        const drum = regPart(new THREE.Mesh(drumGeo, materials.hullArmor));
        drumGroup.add(drum);

        [-0.56, 0.56].forEach((dz) => {
            const rimGeo = new THREE.TorusGeometry(0.205, 0.015, 10, 24);
            const rim = regPart(new THREE.Mesh(rimGeo, materials.darkSteel));
            rim.position.set(0, 0, dz);
            drumGroup.add(rim);
        });

        [-0.34, 0.34].forEach((sz) => {
            const strapRingGeo = new THREE.CylinderGeometry(0.218, 0.218, 0.04, 24);
            strapRingGeo.rotateX(Math.PI / 2);
            const strapRing = regPart(new THREE.Mesh(strapRingGeo, materials.darkSteel));
            strapRing.position.set(0, 0, sz);
            drumGroup.add(strapRing);
        });

        const capGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12);
        const cap = regPart(new THREE.Mesh(capGeo, materials.darkSteel));
        cap.position.set(0, 0.22, 0.15);
        drumGroup.add(cap);
    });

    // Left Front Hull Headlight + Night Spotlight
    const headlightLights = [];
    const hlGroup = new THREE.Group();
    hlGroup.position.set(0.92, 0.98 - H_OFF, 2.65);
    hullGroup.add(hlGroup);
    regPart(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08), materials.darkSteel));
    const hlCyl = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.12, 16), materials.hullArmor));
    hlCyl.rotation.x = Math.PI / 2;
    hlGroup.add(hlCyl);

    const slitMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const slitMesh = new THREE.Mesh(new THREE.CircleGeometry(0.072, 16), slitMat);
    slitMesh.position.set(0, 0, 0.062);
    hlGroup.add(slitMesh);

    // Enemy headlights are never lit; omitting their SpotLights keeps the scene light count fixed across spawns.
    if (!options.isEnemy) {
        const spot = new THREE.SpotLight(0xfef08a, 0.0, 38, Math.PI / 5, 0.45, 1.5);
        spot.position.set(0, 0, 0.08);
        spot.target.position.set(0, -0.5, 12);
        hlGroup.add(spot);
        hlGroup.add(spot.target);
        headlightLights.push({ spot, slitMat });
    }

    // ============================================================================
    // 3. CHRISTIE RUNNING GEAR, SPOKED ROAD WHEELS & CATERPILLAR TRACKS
    // ============================================================================
    const roadWheelStations = { left: [], right: [] };
    const driveSprockets = [];
    const idlerWheels = [];
    const trackChains = { left: [], right: [] };

    function createRoadWheelPair(sideSign, radius = 0.415) {
        const cluster = new THREE.Group();
        const spinGroup = new THREE.Group();
        cluster.add(spinGroup);

        [-0.085, 0.085].forEach((offsetX) => {
            const tireGeo = new THREE.CylinderGeometry(radius, radius, 0.12, 32);
            tireGeo.rotateZ(Math.PI / 2);
            const tire = regPart(new THREE.Mesh(tireGeo, materials.rubberTire));
            tire.position.x = offsetX;
            spinGroup.add(tire);

            const steelRimGeo = new THREE.TorusGeometry(radius - 0.055, 0.025, 6, 14);
            steelRimGeo.rotateY(Math.PI / 2);
            const steelRim = regPart(new THREE.Mesh(steelRimGeo, materials.hullArmor));
            steelRim.position.x = offsetX + (offsetX > 0 ? 0.052 : -0.052);
            spinGroup.add(steelRim);

            const dishGeo = new THREE.CylinderGeometry(radius - 0.06, radius - 0.06, 0.06, 14);
            dishGeo.rotateZ(Math.PI / 2);
            const dish = regPart(new THREE.Mesh(dishGeo, materials.darkSteel));
            dish.position.x = offsetX;
            spinGroup.add(dish);
        });

        // 12 Radial Starfish Ribs / Spokes on visible outer face (omitted on enemy LOD)
        if (!options.isEnemy) {
            const numSpokes = 12;
            const outerX = sideSign * 0.115;
            for (let s = 0; s < numSpokes; s++) {
                const angle = (s / numSpokes) * Math.PI * 2;
                const spokeGeo = new THREE.BoxGeometry(0.035, 0.22, 0.032);
                const spoke = regPart(new THREE.Mesh(spokeGeo, materials.hullArmor));
                spoke.position.set(
                    outerX,
                    Math.cos(angle) * (radius * 0.52),
                    Math.sin(angle) * (radius * 0.52)
                );
                spoke.rotation.x = -angle;
                spinGroup.add(spoke);
            }
        }

        const hubGeo = new THREE.CylinderGeometry(0.115, 0.135, 0.16, 18);
        hubGeo.rotateZ(Math.PI / 2);
        const hub = regPart(new THREE.Mesh(hubGeo, materials.hullArmor));
        hub.position.x = sideSign * 0.095;
        spinGroup.add(hub);

        const hubTipGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.06, 14);
        hubTipGeo.rotateZ(Math.PI / 2);
        const hubTip = regPart(new THREE.Mesh(hubTipGeo, materials.darkSteel));
        hubTip.position.x = sideSign * 0.175;
        spinGroup.add(hubTip);

        return { cluster, spinGroup };
    }

    function createIdlerOrSprocket(radius = 0.30, isSprocket = false) {
        const group = new THREE.Group();
        [-0.08, 0.08].forEach((offsetX) => {
            const discGeo = new THREE.CylinderGeometry(radius, radius, 0.09, 14);
            discGeo.rotateZ(Math.PI / 2);
            const disc = regPart(new THREE.Mesh(discGeo, materials.hullArmor));
            disc.position.x = offsetX;
            group.add(disc);
        });

        const count = isSprocket ? 6 : 8;
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const ribGeo = new THREE.BoxGeometry(0.22, radius * 1.6, 0.04);
            const rib = regPart(new THREE.Mesh(ribGeo, materials.darkSteel));
            rib.rotation.x = a;
            group.add(rib);
        }

        const hubGeo = new THREE.CylinderGeometry(0.10, 0.11, 0.25, 16);
        hubGeo.rotateZ(Math.PI / 2);
        const hub = regPart(new THREE.Mesh(hubGeo, materials.hullArmor));
        group.add(hub);

        return group;
    }

    // Authentic Closed Parametric Track Loop from museum scene
    const trackPts = [
        new THREE.Vector2(1.95, 0.03),
        new THREE.Vector2(0.0, 0.03),
        new THREE.Vector2(-1.85, 0.03),
        new THREE.Vector2(-2.48, 0.32),
        new THREE.Vector2(-2.66, 0.62),
        new THREE.Vector2(-2.44, 0.88),
        new THREE.Vector2(-1.10, 0.87),
        new THREE.Vector2(0.20, 0.86),
        new THREE.Vector2(1.45, 0.88),
        new THREE.Vector2(2.54, 0.90),
        new THREE.Vector2(2.76, 0.63),
        new THREE.Vector2(2.55, 0.35)
    ];

    const totalSegs = trackPts.length;
    const segLengths = [];
    let totalTrackLen = 0;
    for (let i = 0; i < totalSegs; i++) {
        const pA = trackPts[i];
        const pB = trackPts[(i + 1) % totalSegs];
        const len = pA.distanceTo(pB);
        segLengths.push(len);
        totalTrackLen += len;
    }

    function getTrackPathPoint(u) {
        let targetDist = (((u % 1) + 1) % 1) * totalTrackLen;
        for (let i = 0; i < totalSegs; i++) {
            if (targetDist <= segLengths[i] || i === totalSegs - 1) {
                const pA = trackPts[i];
                const pB = trackPts[(i + 1) % totalSegs];
                const localT = segLengths[i] > 0 ? targetDist / segLengths[i] : 0;
                const pos = new THREE.Vector2().lerpVectors(pA, pB, localT);
                const dir = new THREE.Vector2().subVectors(pB, pA).normalize();
                const angle = Math.atan2(dir.y, dir.x);
                return { z: pos.x, y: pos.y, angle };
            }
            targetDist -= segLengths[i];
        }
        return { z: trackPts[0].x, y: trackPts[0].y, angle: 0 };
    }

    // Authentic T-34 Christie road wheel Z positions (wide gap between Wheel 2 and 3!)
    const roadWheelZ = [1.86, 0.95, -0.12, -1.00, -1.86];
    const roadWheelY = 0.445;

    ['left', 'right'].forEach((sideKey) => {
        const sideSign = (sideKey === 'left') ? 1 : -1;
        const sideX = sideSign * 1.15;

        // 5 Large Dual Road Wheels per side
        roadWheelZ.forEach((wz) => {
            const { cluster, spinGroup } = createRoadWheelPair(sideSign, 0.415);
            cluster.position.set(sideX, roadWheelY - H_OFF, wz);
            hullGroup.add(cluster);

            roadWheelStations[sideKey].push({
                cluster,
                spinGroup,
                baseY: roadWheelY - H_OFF,
                currentOffset: 0,
                velocityY: 0,
                z: wz,
                x: sideX
            });
        });

        // Front Spoked Idler Wheel
        const idler = createIdlerOrSprocket(0.28, false);
        idler.position.set(sideX, 0.63 - H_OFF, 2.48);
        hullGroup.add(idler);
        idlerWheels.push({ mesh: idler, side: sideKey });

        // Rear Drive Sprocket
        const sprocket = createIdlerOrSprocket(0.30, true);
        sprocket.position.set(sideX, 0.61 - H_OFF, -2.38);
        hullGroup.add(sprocket);
        driveSprockets.push({ mesh: sprocket, side: sideKey });

        // 76 Articulated Waffle Caterpillar Track Links per side (Single InstancedMesh per side!)
        const mergeFn = (typeof window !== 'undefined' && window.mergeBufferGeometries) || (typeof mergeBufferGeometries === 'function' ? mergeBufferGeometries : null);
        const linkGeo = new THREE.BoxGeometry(0.50, 0.032, 0.14);
        const toothGeo = new THREE.BoxGeometry(0.035, 0.065, 0.05);
        toothGeo.translate(0, 0.035, 0);
        const mergedT34LinkGeo = mergeFn ? mergeFn([linkGeo, toothGeo]) : linkGeo;

        const numLinks = 76;
        const trackInstMesh = new THREE.InstancedMesh(mergedT34LinkGeo, materials.trackMetal, numLinks);
        trackInstMesh.castShadow = true;
        trackInstMesh.receiveShadow = true;
        trackInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        hullGroup.add(trackInstMesh);
        trackChains[sideKey] = {
            instMesh: trackInstMesh,
            trackX: sideX,
            count: numLinks
        };
    });

    const evaluateTrackPoint = function(sideKey, uNorm) {
        const pt = getTrackPathPoint(uNorm);
        return {
            z: pt.z,
            y: pt.y - H_OFF,
            pitch: -pt.angle
        };
    };

    const dummyT34Link = new THREE.Object3D();
    const updateTracksGeometry = function(leftPhase, rightPhase) {
        ['left', 'right'].forEach((sideKey) => {
            const chain = trackChains[sideKey];
            if (!chain || !chain.instMesh) return;
            const phase = (sideKey === 'left') ? leftPhase : rightPhase;
            const n = chain.count;
            const trackX = chain.trackX;
            for (let i = 0; i < n; i++) {
                const u = (i / n + phase) % 1.0;
                const pt = getTrackPathPoint(u);
                dummyT34Link.position.set(trackX, pt.y - H_OFF, pt.z);
                dummyT34Link.rotation.set(-pt.angle, 0, 0);
                dummyT34Link.updateMatrix();
                chain.instMesh.setMatrixAt(i, dummyT34Link.matrix);
            }
            chain.instMesh.instanceMatrix.needsUpdate = true;
        });
    };
    updateTracksGeometry(0, 0);

    // ============================================================================
    // 4. T-34-85 CAST 1944 TURRET, 85MM ZIS-S-53 GUN & "311" DECALS
    // ============================================================================
    const turretPivot = new THREE.Group();
    turretPivot.position.set(0, 1.58 - H_OFF, 0.42);
    hullGroup.add(turretPivot);

    // 1. Recessed Lower Turret Ring Collar / Neck
    const neckGeo = new THREE.CylinderGeometry(0.92, 0.96, 0.24, 32);
    const neck = regPart(new THREE.Mesh(neckGeo, materials.castTurret));
    neck.position.set(0, 0.11, -0.05);
    turretPivot.add(neck);

    // 2. Bulbous Cast T-34-85 Turret Shell with "311" Side Panels
    const turretShellGroup = new THREE.Group();
    turretShellGroup.position.set(0, 0.48, -0.10);
    turretPivot.add(turretShellGroup);

    const lowerBulgeGeo = new THREE.SphereGeometry(1.02, 32, 20);
    lowerBulgeGeo.scale(1.02, 0.42, 1.38);
    const lowerBulge = regPart(new THREE.Mesh(lowerBulgeGeo, materials.castTurret));
    lowerBulge.position.set(0, -0.06, 0.02);
    turretShellGroup.add(lowerBulge);

    // Left & Right Curved Cast Turret Side Panels carrying "311" & Polish Piast Eagle
    const sideArcGeoLeft = new THREE.CylinderGeometry(0.89, 1.03, 0.68, 32, 8, true, Math.PI * 0.12, Math.PI * 0.76);
    sideArcGeoLeft.scale(1.0, 1.0, 1.38);
    const leftSideMesh = regPart(new THREE.Mesh(sideArcGeoLeft, materials.turretSideLeft));
    leftSideMesh.position.set(0, 0.05, 0.02);
    turretShellGroup.add(leftSideMesh);

    const sideArcGeoRight = new THREE.CylinderGeometry(0.89, 1.03, 0.68, 32, 8, true, Math.PI * 1.12, Math.PI * 0.76);
    sideArcGeoRight.scale(1.0, 1.0, 1.38);
    const rightSideMesh = regPart(new THREE.Mesh(sideArcGeoRight, materials.turretSideRight));
    rightSideMesh.position.set(0, 0.05, 0.02);
    turretShellGroup.add(rightSideMesh);

    const mainCoreGeo = new THREE.CylinderGeometry(0.87, 1.01, 0.68, 32);
    mainCoreGeo.scale(0.99, 1.0, 1.37);
    const mainCore = regPart(new THREE.Mesh(mainCoreGeo, materials.castTurret));
    mainCore.position.set(0, 0.05, 0.02);
    turretShellGroup.add(mainCore);

    const roofCrownGeo = new THREE.SphereGeometry(0.89, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45);
    roofCrownGeo.scale(1.0, 0.22, 1.37);
    const roofCrown = regPart(new THREE.Mesh(roofCrownGeo, materials.castTurret));
    roofCrown.position.set(0, 0.34, 0.02);
    turretShellGroup.add(roofCrown);

    const frontNoseGeo = new THREE.SphereGeometry(0.56, 24, 20);
    frontNoseGeo.scale(1.32, 0.72, 1.15);
    const frontNose = regPart(new THREE.Mesh(frontNoseGeo, materials.castTurret));
    frontNose.position.set(0, 0.03, 1.05);
    turretShellGroup.add(frontNose);

    // Cheek Lifting Hooks, Pistol Port Plugs & Rear Infantry Handrail
    [-1, 1].forEach((side) => {
        const cheekHookGeo = new THREE.BoxGeometry(0.04, 0.16, 0.05);
        const cheekHook = regPart(new THREE.Mesh(cheekHookGeo, materials.castTurret));
        cheekHook.position.set(side * 0.88, 0.16, 0.56);
        cheekHook.rotation.z = -side * 0.18;
        turretShellGroup.add(cheekHook);

        const portGeo = new THREE.CylinderGeometry(0.045, 0.065, 0.06, 12);
        portGeo.rotateZ(Math.PI / 2);
        const port = regPart(new THREE.Mesh(portGeo, materials.castTurret));
        port.position.set(side * 0.90, 0.08, -0.48);
        turretShellGroup.add(port);

        const tRailGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.68, 10);
        tRailGeo.rotateX(Math.PI / 2);
        const tRail = regPart(new THREE.Mesh(tRailGeo, materials.castTurret));
        tRail.position.set(side * 0.96, -0.02, -0.52);
        tRail.rotation.y = side * 0.25;
        turretShellGroup.add(tRail);
    });

    // 3. Commander's Cupola on Left Rear Roof (+X side)
    const cupolaGroup = new THREE.Group();
    cupolaGroup.position.set(0.34, 0.50, -0.35);
    turretShellGroup.add(cupolaGroup);

    const cupolaDrumGeo = new THREE.CylinderGeometry(0.32, 0.34, 0.22, 24);
    const cupolaDrum = regPart(new THREE.Mesh(cupolaDrumGeo, materials.castTurret));
    cupolaGroup.add(cupolaDrum);

    for (let v = 0; v < 5; v++) {
        const va = (v / 5) * Math.PI * 2;
        const slitGeo = new THREE.BoxGeometry(0.11, 0.035, 0.04);
        const slit = regPart(new THREE.Mesh(slitGeo, materials.darkSteel));
        slit.position.set(Math.sin(va) * 0.325, 0.03, Math.cos(va) * 0.325);
        slit.rotation.y = va;
        cupolaGroup.add(slit);
    }

    const cupolaRoofGeo = new THREE.CylinderGeometry(0.30, 0.32, 0.04, 24);
    const cupolaRoof = regPart(new THREE.Mesh(cupolaRoofGeo, materials.castTurret));
    cupolaRoof.position.y = 0.12;
    cupolaGroup.add(cupolaRoof);

    // 4. Roof Ventilators, Loader's Hatch & Periscopes
    [-0.12, 0.16].forEach((vx, idx) => {
        const ventGeo = new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const vent = regPart(new THREE.Mesh(ventGeo, materials.castTurret));
        vent.position.set(vx === -0.12 ? -0.22 : 0.28, 0.42, idx === 0 ? -0.68 : 0.12);
        turretShellGroup.add(vent);
    });

    const loaderHatchGeo = new THREE.BoxGeometry(0.42, 0.05, 0.48);
    const loaderHatch = regPart(new THREE.Mesh(loaderHatchGeo, materials.castTurret));
    loaderHatch.position.set(-0.32, 0.44, 0.15);
    turretShellGroup.add(loaderHatch);

    [-0.36, 0.36].forEach((px) => {
        const tPeriGeo = new THREE.CylinderGeometry(0.065, 0.08, 0.09, 14);
        const tPeri = regPart(new THREE.Mesh(tPeriGeo, materials.castTurret));
        tPeri.position.set(px, 0.44, 0.48);
        turretShellGroup.add(tPeri);
    });

    // --------------------------------------------------------------------------
    // 5. 85MM ZIS-S-53 MAIN GUN MANTLET & LONG BARREL
    // --------------------------------------------------------------------------
    const gunElevationPivot = new THREE.Group();
    gunElevationPivot.position.set(0, 0.50, 1.18);
    turretPivot.add(gunElevationPivot);

    const gunRecoilGroup = new THREE.Group();
    gunElevationPivot.add(gunRecoilGroup);

    // Rounded Cast Mantlet & Coaxial Sight Collar
    const mantletGeo = new THREE.CylinderGeometry(0.28, 0.30, 0.72, 24);
    mantletGeo.rotateZ(Math.PI / 2);
    const mantlet = regPart(new THREE.Mesh(mantletGeo, materials.castTurret));
    gunElevationPivot.add(mantlet);

    // Coaxial 7.62mm DT Machine Gun Port on right side (-X side)
    const coaxMuzzleRef = regPart(new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.024, 0.26, 10),
        materials.darkSteel
    ));
    coaxMuzzleRef.rotation.x = Math.PI / 2;
    coaxMuzzleRef.position.set(-0.24, 0.02, 0.22);
    gunElevationPivot.add(coaxMuzzleRef);

    // Forward Bolted Recuperator Sleeve
    const sleeveGeo = new THREE.CylinderGeometry(0.13, 0.22, 0.54, 24);
    sleeveGeo.rotateX(Math.PI / 2);
    const sleeve = regPart(new THREE.Mesh(sleeveGeo, materials.castTurret));
    sleeve.position.set(0, 0.02, 0.32);
    gunRecoilGroup.add(sleeve);

    for (let b = 0; b < 8; b++) {
        const ba = (b / 8) * Math.PI * 2;
        const boltGeo = new THREE.SphereGeometry(0.018, 8, 8);
        const bolt = regPart(new THREE.Mesh(boltGeo, materials.darkSteel));
        bolt.position.set(Math.cos(ba) * 0.19, 0.02 + Math.sin(ba) * 0.19, 0.14);
        gunRecoilGroup.add(bolt);
    }

    // Long 85mm ZiS-S-53 Rifled Barrel
    const barrelLength = 3.15;
    const barrelGeo = new THREE.CylinderGeometry(0.068, 0.095, barrelLength, 24);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = regPart(new THREE.Mesh(barrelGeo, materials.gunBarrel));
    barrel.position.set(0, 0.02, 0.48 + barrelLength / 2);
    gunRecoilGroup.add(barrel);

    const muzzleLipGeo = new THREE.CylinderGeometry(0.073, 0.070, 0.12, 24);
    muzzleLipGeo.rotateX(Math.PI / 2);
    const muzzleLip = regPart(new THREE.Mesh(muzzleLipGeo, materials.gunBarrel));
    muzzleLip.position.set(0, 0.02, 0.48 + barrelLength - 0.05);
    gunRecoilGroup.add(muzzleLip);

    const boreGeo = new THREE.CircleGeometry(0.054, 20);
    const boreMat = new THREE.MeshBasicMaterial({ color: 0x090a08 });
    const mainGunMuzzleTip = new THREE.Mesh(boreGeo, boreMat);
    mainGunMuzzleTip.position.set(0, 0.02, 0.48 + barrelLength + 0.012);
    gunRecoilGroup.add(mainGunMuzzleTip);

    return {
        tankRoot,
        hullGroup,
        turretGroup: turretPivot,
        gunElevationPivot,
        barrelRecoilGroup: gunRecoilGroup,
        mainGunMuzzleTip,
        coaxMuzzleRef,
        bowMgGroup,
        bowMgBarrel,
        headlightLights,
        smokeTubes: [],
        roadWheelStations,
        driveSprockets,
        idlerWheels,
        trackChains,
        evaluateTrackPoint,
        updateTracksGeometry
    };
}

window.buildT34Tank = buildT34Tank;
