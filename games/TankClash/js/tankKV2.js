// ============================================================================
// KV-2 Heavy Artillery Tank (Model 1940 / MT-1 Turret, "ЗА РОДИНУ")
// High-Fidelity WWII Soviet Heavy Assault Tank for TankClash Russia Campaign
// Features:
// - 152mm M-10T Howitzer (4 HP Devastating Damage, Colossal 24m HE Blast)
// - Fixed MT-1 Turret Geometry (Flat rear armor plate & loading hatch, angled front cheeks)
// - Procedural Soviet 4BO Olive PBR Textures, Normal Maps & "ЗА РОДИНУ" Stencils
// - 6 Torsion-Sprung Perforated Dual Road Wheels & Dynamic Articulated Tracks
// ============================================================================

const kv2AssetCache = {};

function getKV2SharedAssets(isEnemy) {
    const key = isEnemy ? 'enemy' : 'player';
    if (kv2AssetCache[key]) return kv2AssetCache[key];

    const size = 1024;
    const albedoCanvas = document.createElement('canvas');
    const normalCanvas = document.createElement('canvas');
    const roughCanvas  = document.createElement('canvas');
    albedoCanvas.width = normalCanvas.width = roughCanvas.width = size;
    albedoCanvas.height = normalCanvas.height = roughCanvas.height = size;

    const aCtx = albedoCanvas.getContext('2d');
    const nCtx = normalCanvas.getContext('2d');
    const rCtx = roughCanvas.getContext('2d');

    // Base Soviet 4BO Olive Green coat (deep matte dark green-brown)
    const baseColor = isEnemy ? '#172214' : '#1f2b1b';
    aCtx.fillStyle = baseColor;
    aCtx.fillRect(0, 0, size, size);

    // Base Roughness (matte military paint ~0.66)
    rCtx.fillStyle = '#a8a8a8';
    rCtx.fillRect(0, 0, size, size);

    // Height map buffer for computing tangent-space normal map
    const heightData = new Float32Array(size * size);

    let seed = 1941;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };

    // 1. Rolled / Cast Steel Micro-Pitting & Mottled Paint Variation
    for (let i = 0; i < 16000; i++) {
        const x = Math.floor(rand() * size);
        const y = Math.floor(rand() * size);
        const r = 1 + rand() * 5;
        const val = (rand() - 0.5) * 0.35;

        aCtx.fillStyle = val > 0 ? 'rgba(38, 52, 32, 0.12)' : 'rgba(10, 16, 8, 0.18)';
        aCtx.beginPath();
        aCtx.arc(x, y, r * 2.2, 0, Math.PI * 2);
        aCtx.fill();

        rCtx.fillStyle = val > 0 ? 'rgba(195,195,195,0.06)' : 'rgba(105,105,105,0.06)';
        rCtx.fillRect(x, y, r * 2, r * 2);

        const idx = y * size + x;
        heightData[idx] += val * 0.45;
    }

    // 2. Weathering Grime & Soot Airbrushed Blotches
    for (let i = 0; i < 60; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const rad = 30 + rand() * 85;
        const grad = aCtx.createRadialGradient(x, y, 2, x, y, rad);
        grad.addColorStop(0, 'rgba(14, 11, 8, 0.38)');
        grad.addColorStop(0.5, 'rgba(20, 16, 12, 0.18)');
        grad.addColorStop(1, 'rgba(31, 43, 27, 0)');
        aCtx.fillStyle = grad;
        aCtx.beginPath();
        aCtx.arc(x, y, rad, 0, Math.PI * 2);
        aCtx.fill();
    }

    // 3. Rivets & Weld Seams in heightfield
    const drawRivetRow = (yPos, spacing) => {
        for (let x = spacing / 2; x < size; x += spacing) {
            const rx = Math.floor(x);
            const ry = Math.floor(yPos);
            const rGrad = aCtx.createRadialGradient(rx, ry, 1, rx, ry, 12);
            rGrad.addColorStop(0, 'rgba(12, 10, 8, 0.55)');
            rGrad.addColorStop(1, 'rgba(31, 43, 27, 0)');
            aCtx.fillStyle = rGrad;
            aCtx.beginPath();
            aCtx.arc(rx, ry, 12, 0, Math.PI * 2);
            aCtx.fill();

            for (let dy = -5; dy <= 5; dy++) {
                for (let dx = -5; dx <= 5; dx++) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= 5) {
                        const ny = (ry + dy + size) % size;
                        const nx = (rx + dx + size) % size;
                        heightData[ny * size + nx] += Math.cos((dist / 5) * (Math.PI / 2)) * 2.2;
                    }
                }
            }
        }
    };
    drawRivetRow(32, 64);
    drawRivetRow(size - 32, 64);

    // 3b. Armor Scratches & Bare Steel Gouges
    for (let s = 0; s < 75; s++) {
        const x0 = rand() * size;
        const y0 = rand() * size;
        const angle = rand() * Math.PI * 2;
        const len = 10 + rand() * 38;
        const isMajor = (s < 20);
        const steps = Math.floor(len * 1.5);

        for (let st = 0; st < steps; st++) {
            const t = st / steps;
            const px = (x0 + Math.cos(angle) * len * t + size) % size;
            const py = (y0 + Math.sin(angle) * len * t + size) % size;

            // Dark oxidized primer border
            aCtx.fillStyle = 'rgba(10, 14, 8, 0.85)';
            aCtx.fillRect(px - 0.8, py - 0.8, 1.6, 1.6);

            // Bright bare steel core
            aCtx.fillStyle = isMajor ? 'rgba(175, 182, 172, 0.85)' : 'rgba(135, 144, 134, 0.65)';
            aCtx.fillRect(px - 0.4, py - 0.4, 0.8, 0.8);

            // Carve into heightfield for normal map
            const idx = Math.floor(py) * size + Math.floor(px);
            heightData[idx] -= isMajor ? 0.35 : 0.18;
        }
    }

    // Convert Height Map to Tangent-Space RGB Normal Map
    const nImg = nCtx.createImageData(size, size);
    const nData = nImg.data;
    const strength = 3.0;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const left  = heightData[y * size + ((x - 1 + size) % size)];
            const right = heightData[y * size + ((x + 1) % size)];
            const up    = heightData[((y - 1 + size) % size) * size + x];
            const down  = heightData[((y + 1) % size) * size + x];

            let dx = (left - right) * strength;
            let dy = (up - down) * strength;
            let dz = 1.0;

            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            dx /= len;
            dy /= len;
            dz /= len;

            const idx = (y * size + x) * 4;
            nData[idx]     = Math.floor((dx * 0.5 + 0.5) * 255);
            nData[idx + 1] = Math.floor((dy * 0.5 + 0.5) * 255);
            nData[idx + 2] = Math.floor((dz * 0.5 + 0.5) * 255);
            nData[idx + 3] = 255;
        }
    }
    nCtx.putImageData(nImg, 0, 0);

    const armorAlbedoTex = new THREE.CanvasTexture(albedoCanvas);
    const armorNormalTex = new THREE.CanvasTexture(normalCanvas);
    const armorRoughTex  = new THREE.CanvasTexture(roughCanvas);
    [armorAlbedoTex, armorNormalTex, armorRoughTex].forEach(t => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
    });

    // 4. Turret Side Textures with "ЗА РОДИНУ" ("For the Motherland")
    const turretLeftCanvas = document.createElement('canvas');
    turretLeftCanvas.width = 1024;
    turretLeftCanvas.height = 512;
    const tlCtx = turretLeftCanvas.getContext('2d');
    tlCtx.drawImage(albedoCanvas, 0, 0, 1024, 512);

    const edgeGradTop = tlCtx.createLinearGradient(0, 0, 0, 85);
    edgeGradTop.addColorStop(0, 'rgba(16, 13, 9, 0.65)');
    edgeGradTop.addColorStop(1, 'rgba(31, 43, 27, 0)');
    tlCtx.fillStyle = edgeGradTop;
    tlCtx.fillRect(0, 0, 1024, 85);

    const edgeGradBottom = tlCtx.createLinearGradient(0, 430, 0, 512);
    edgeGradBottom.addColorStop(0, 'rgba(31, 43, 27, 0)');
    edgeGradBottom.addColorStop(1, 'rgba(12, 10, 7, 0.70)');
    tlCtx.fillStyle = edgeGradBottom;
    tlCtx.fillRect(0, 430, 1024, 82);

    // Vertical soot smudge
    const smudgeGrad = tlCtx.createRadialGradient(410, 250, 20, 410, 250, 190);
    smudgeGrad.addColorStop(0, 'rgba(18, 15, 11, 0.52)');
    smudgeGrad.addColorStop(0.6, 'rgba(24, 20, 15, 0.25)');
    smudgeGrad.addColorStop(1, 'rgba(31, 43, 27, 0)');
    tlCtx.fillStyle = smudgeGrad;
    tlCtx.fillRect(200, 30, 420, 450);

    // Bold Cyrillic Inscription "ЗА РОДИНУ"
    tlCtx.save();
    tlCtx.font = '900 92px "Arial Narrow", "Impact", sans-serif';
    tlCtx.fillStyle = '#ededeb';
    tlCtx.textAlign = 'center';
    tlCtx.textBaseline = 'middle';
    tlCtx.translate(710, 275);
    tlCtx.scale(0.76, 1.18);
    tlCtx.shadowColor = 'rgba(10, 14, 8, 0.75)';
    tlCtx.shadowBlur = 4;
    tlCtx.fillText('ЗА РОДИНУ', 0, 0);
    tlCtx.restore();

    // Paint wear scratches cutting across lettering
    for (let i = 0; i < 45; i++) {
        const sx = 530 + rand() * 360;
        const sy = 210 + rand() * 130;
        const sl = 2 + rand() * 14;
        tlCtx.fillStyle = 'rgba(16, 22, 13, 0.90)';
        tlCtx.fillRect(sx, sy, sl, 1.8);
        if (i % 2 === 0) {
            tlCtx.fillStyle = 'rgba(150, 158, 150, 0.65)';
            tlCtx.fillRect(sx + 1, sy + 0.3, sl * 0.6, 1.0);
        }
    }
    const turretLeftTex = new THREE.CanvasTexture(turretLeftCanvas);

    // Right Side Turret Texture (mirrored layout so inscription is correctly oriented)
    const turretRightCanvas = document.createElement('canvas');
    turretRightCanvas.width = 1024;
    turretRightCanvas.height = 512;
    const trCtx = turretRightCanvas.getContext('2d');
    trCtx.drawImage(albedoCanvas, 0, 0, 1024, 512);
    trCtx.fillStyle = edgeGradTop;
    trCtx.fillRect(0, 0, 1024, 85);
    trCtx.fillStyle = edgeGradBottom;
    trCtx.fillRect(0, 430, 1024, 82);

    trCtx.save();
    trCtx.font = '900 92px "Arial Narrow", "Impact", sans-serif';
    trCtx.fillStyle = '#ededeb';
    trCtx.textAlign = 'center';
    trCtx.textBaseline = 'middle';
    trCtx.translate(315, 275);
    trCtx.scale(0.76, 1.18);
    trCtx.shadowColor = 'rgba(10, 14, 8, 0.75)';
    trCtx.shadowBlur = 4;
    trCtx.fillText('ЗА РОДИНУ', 0, 0);
    trCtx.restore();

    for (let i = 0; i < 45; i++) {
        const sx = 140 + rand() * 360;
        const sy = 210 + rand() * 130;
        const sl = 2 + rand() * 14;
        trCtx.fillStyle = 'rgba(16, 22, 13, 0.90)';
        trCtx.fillRect(sx, sy, sl, 1.8);
        if (i % 2 === 0) {
            trCtx.fillStyle = 'rgba(150, 158, 150, 0.65)';
            trCtx.fillRect(sx + 1, sy + 0.3, sl * 0.6, 1.0);
        }
    }
    const turretRightTex = new THREE.CanvasTexture(turretRightCanvas);

    // 5. 152mm Muzzle Barrel Texture with Charred Black Soot
    const barrelCanvas = document.createElement('canvas');
    barrelCanvas.width = 512;
    barrelCanvas.height = 512;
    const bCtx = barrelCanvas.getContext('2d');
    bCtx.drawImage(albedoCanvas, 0, 0, 512, 512);
    const sootGrad = bCtx.createLinearGradient(0, 0, 0, 512);
    sootGrad.addColorStop(0, '#0a0a08');
    sootGrad.addColorStop(0.16, '#141310');
    sootGrad.addColorStop(0.32, 'rgba(24, 22, 18, 0.45)');
    sootGrad.addColorStop(0.50, 'rgba(31, 43, 27, 0)');
    bCtx.fillStyle = sootGrad;
    bCtx.fillRect(0, 0, 512, 512);
    const barrelTex = new THREE.CanvasTexture(barrelCanvas);

    // Materials Palette matching TankClash lighting & shader environment
    const materials = {
        armor: new THREE.MeshStandardMaterial({
            map: armorAlbedoTex,
            normalMap: armorNormalTex,
            normalScale: new THREE.Vector2(0.60, 0.60),
            roughnessMap: armorRoughTex,
            roughness: 0.62,
            metalness: 0.32,
            envMapIntensity: 0.38
        }),
        darkAccent: new THREE.MeshStandardMaterial({
            map: armorAlbedoTex,
            color: isEnemy ? 0x141a11 : 0x1a2317,
            normalMap: armorNormalTex,
            normalScale: new THREE.Vector2(0.50, 0.50),
            roughness: 0.68,
            metalness: 0.28,
            envMapIntensity: 0.30
        }),
        turretLeftMat: new THREE.MeshStandardMaterial({
            map: turretLeftTex,
            normalMap: armorNormalTex,
            normalScale: new THREE.Vector2(0.55, 0.55),
            roughnessMap: armorRoughTex,
            roughness: 0.62,
            metalness: 0.32,
            envMapIntensity: 0.38
        }),
        turretRightMat: new THREE.MeshStandardMaterial({
            map: turretRightTex,
            normalMap: armorNormalTex,
            normalScale: new THREE.Vector2(0.55, 0.55),
            roughnessMap: armorRoughTex,
            roughness: 0.62,
            metalness: 0.32,
            envMapIntensity: 0.38
        }),
        barrelMat: new THREE.MeshStandardMaterial({
            map: barrelTex,
            normalMap: armorNormalTex,
            normalScale: new THREE.Vector2(0.40, 0.40),
            roughness: 0.54,
            metalness: 0.42,
            envMapIntensity: 0.35
        }),
        trackMetal: new THREE.MeshStandardMaterial({
            color: 0x252726,
            normalMap: armorNormalTex,
            normalScale: new THREE.Vector2(0.70, 0.70),
            roughness: 0.62,
            metalness: 0.68,
            envMapIntensity: 0.30
        }),
        wheelHubSteel: new THREE.MeshStandardMaterial({
            color: 0x54585c,
            roughness: 0.42,
            metalness: 0.78,
            envMapIntensity: 0.30
        }),
        rubberRim: new THREE.MeshStandardMaterial({
            color: 0x161819,
            roughness: 0.88,
            metalness: 0.08,
            envMapIntensity: 0.20
        }),
        cableSteel: new THREE.MeshStandardMaterial({
            color: 0x303438,
            normalMap: armorNormalTex,
            normalScale: new THREE.Vector2(1.0, 1.0),
            roughness: 0.44,
            metalness: 0.78,
            envMapIntensity: 0.30
        }),
        gunBore: new THREE.MeshBasicMaterial({
            color: 0x090a08
        })
    };

    Object.values(materials).forEach(m => {
        m.userData.shared = true;
    });

    kv2AssetCache[key] = { materials, textures: { armorAlbedoTex, armorNormalTex, armorRoughTex, turretLeftTex, turretRightTex, barrelTex } };
    return kv2AssetCache[key];
}

// ============================================================================
// KV-2 3D Model Construction Function
// ============================================================================
function buildKV2Tank(scene, mats, options = {}) {
    const H_OFF = 0.88; // Height offset aligning suspension with TankClash terrain physics

    const tankRoot = new THREE.Group();
    const sc = scene || (typeof window !== 'undefined' ? window.scene : null);
    if (sc && typeof sc.add === 'function') sc.add(tankRoot);

    const hullGroup = new THREE.Group();
    hullGroup.position.y = H_OFF;
    tankRoot.add(hullGroup);

    const isEnemy = !!options.isEnemy;
    const { materials } = getKV2SharedAssets(isEnemy);

    function regPart(mesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    // Helper for bolted / riveted lines
    const boltGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.022, 6);
    function addBoltRow(parent, startPos, endPos, count, normalAxis = 'y', mat = materials.darkAccent) {
        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0.5 : i / (count - 1);
            const b = regPart(new THREE.Mesh(boltGeo, mat));
            b.position.lerpVectors(startPos, endPos, t);
            if (normalAxis === 'x') b.rotation.z = Math.PI / 2;
            if (normalAxis === 'z') b.rotation.x = Math.PI / 2;
            parent.add(b);
        }
    }

    // ----------------------------------------------------------------------------
    // 1. HULL, STEPPED FRONT GLACIS, FENDERS & TOOLBOXES
    // ----------------------------------------------------------------------------
    const hullChassis = new THREE.Group();
    hullGroup.add(hullChassis);

    const hullWidth = 1.96;
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-2.75, 0.58 - H_OFF);  // Rear bottom corner
    hullShape.lineTo(2.30, 0.58 - H_OFF);   // Bottom hull floor
    hullShape.lineTo(2.92, 1.02 - H_OFF);   // Lower front glacis plate
    hullShape.lineTo(2.58, 1.38 - H_OFF);   // Upper front glacis plate
    hullShape.lineTo(2.02, 1.44 - H_OFF);   // Glacis deck transition
    hullShape.lineTo(1.75, 1.82 - H_OFF);   // Stepped front driver superstructure wall
    hullShape.lineTo(-1.10, 1.82 - H_OFF);  // Turret ring deck
    hullShape.lineTo(-1.25, 1.72 - H_OFF);  // Engine deck step
    hullShape.lineTo(-2.68, 1.66 - H_OFF);  // Rear engine deck
    hullShape.lineTo(-2.95, 1.32 - H_OFF);  // Rear upper slope
    hullShape.lineTo(-2.75, 0.58 - H_OFF);  // Close loop

    const hullExtrudeGeo = new THREE.ExtrudeGeometry(hullShape, {
        depth: hullWidth,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.025,
        bevelThickness: 0.025
    });
    hullExtrudeGeo.translate(0, 0, -hullWidth / 2);
    hullExtrudeGeo.rotateY(Math.PI / 2); // Align profile along Z (+Z is forward)

    const mainHullMesh = regPart(new THREE.Mesh(hullExtrudeGeo, materials.armor));
    hullChassis.add(mainHullMesh);

    // Front Nose Angle Bar & Bolts
    const noseSeamBar = regPart(new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.09, 0.09), materials.darkAccent));
    noseSeamBar.position.set(0, 1.02 - H_OFF, 2.91);
    noseSeamBar.rotation.x = 0.45;
    hullChassis.add(noseSeamBar);

    addBoltRow(
        hullChassis,
        new THREE.Vector3(-0.86, 1.05 - H_OFF, 2.93),
        new THREE.Vector3(0.86, 1.05 - H_OFF, 2.93),
        12,
        'z'
    );

    // Driver's Vision Port
    const driverVisorFrame = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.12), materials.armor));
    driverVisorFrame.position.set(-0.46, 1.63 - H_OFF, 1.87);
    driverVisorFrame.rotation.x = -0.52;
    hullChassis.add(driverVisorFrame);

    const driverVisorSlit = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.14), materials.gunBore));
    driverVisorSlit.position.set(-0.46, 1.64 - H_OFF, 1.88);
    driverVisorSlit.rotation.x = -0.52;
    hullChassis.add(driverVisorSlit);

    // Bow DT Machine Gun in Armored Ball Mount
    const bowMgGroup = new THREE.Group();
    bowMgGroup.position.set(0.48, 1.60 - H_OFF, 1.88);
    hullChassis.add(bowMgGroup);

    const mgCollar = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.1, 20), materials.armor));
    mgCollar.rotation.x = Math.PI / 2 - 0.5;
    bowMgGroup.add(mgCollar);

    const mgBall = regPart(new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), materials.armor));
    mgBall.position.set(0, 0.01, 0.04);
    bowMgGroup.add(mgBall);

    const mgBarrelJacket = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.22, 12), materials.darkAccent));
    mgBarrelJacket.rotation.x = Math.PI / 2;
    mgBarrelJacket.position.set(0, 0.01, 0.15);
    bowMgGroup.add(mgBarrelJacket);

    const bowMgBarrel = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 10), materials.trackMetal));
    bowMgBarrel.rotation.x = Math.PI / 2;
    bowMgBarrel.position.set(0, 0.01, 0.25);
    bowMgGroup.add(bowMgBarrel);

    // Headlight & Lights Array
    const headlightLights = [];
    const headlightGroup = new THREE.Group();
    headlightGroup.position.set(-0.76, 1.62 - H_OFF, 1.95);
    hullChassis.add(headlightGroup);

    // Armored mounting bracket foot connecting to hull
    const hlMount = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08), materials.darkAccent));
    hlMount.position.set(0, -0.09, -0.02);
    headlightGroup.add(hlMount);

    // Cylindrical armored housing
    const lightHousing = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.082, 0.13, 20), materials.armor));
    lightHousing.rotation.x = Math.PI / 2;
    headlightGroup.add(lightHousing);

    // Rim ring around lens
    const lightRim = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.024, 20), materials.darkAccent));
    lightRim.rotation.x = Math.PI / 2;
    lightRim.position.z = 0.056;
    headlightGroup.add(lightRim);

    // Protective horseshoe brush guard (wire cage)
    const guardCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.115, -0.06, 0.08),
        new THREE.Vector3(-0.115, 0.11, 0.08),
        new THREE.Vector3(0.0, 0.135, 0.08),
        new THREE.Vector3(0.115, 0.11, 0.08),
        new THREE.Vector3(0.115, -0.06, 0.08)
    ]);
    const guardMesh = regPart(new THREE.Mesh(new THREE.TubeGeometry(guardCurve, 16, 0.012, 6, false), materials.darkAccent));
    headlightGroup.add(guardMesh);

    // Glass Slit / Lens
    const isLit = Boolean(typeof window !== 'undefined' && window.tankState && window.tankState.headlightsOn);
    const slitMat = new THREE.MeshBasicMaterial({ color: isLit ? 0xfef08a : 0x334155 });
    const lightLens = new THREE.Mesh(new THREE.CircleGeometry(0.082, 20), slitMat);
    lightLens.position.z = 0.068;
    headlightGroup.add(lightLens);

    // Player Night SpotLight
    if (!options.isEnemy) {
        const spot = new THREE.SpotLight(0xfef08a, isLit ? 3.2 : 0.0, 42, Math.PI / 4.5, 0.45, 1.5);
        spot.position.set(0, 0, 0.08);
        spot.target.position.set(0, -0.5, 14);
        headlightGroup.add(spot);
        headlightGroup.add(spot.target);
        headlightLights.push({ spot, slitMat });
    }

    // Hull Hatch
    const hullHatch = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.30, 0.05, 24), materials.armor));
    hullHatch.position.set(-0.32, 1.84 - H_OFF, 1.22);
    hullChassis.add(hullHatch);

    // Front Tow Shackles & Cables
    [-0.68, 0.68].forEach((xPos, idx) => {
        const shackleBase = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.18), materials.armor));
        shackleBase.position.set(xPos, 0.90 - H_OFF, 2.86);
        shackleBase.rotation.x = 0.45;
        hullChassis.add(shackleBase);

        const shackleLoop = regPart(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.026, 10, 20), materials.armor));
        shackleLoop.position.set(xPos, 0.88 - H_OFF, 2.95);
        shackleLoop.rotation.y = Math.PI / 4;
        hullChassis.add(shackleLoop);

        const dir = idx === 0 ? -1 : 1;
        const cableCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(xPos, 0.91 - H_OFF, 2.95),
            new THREE.Vector3(xPos + dir * 0.14, 1.18 - H_OFF, 2.74),
            new THREE.Vector3(xPos + dir * 0.26, 1.41 - H_OFF, 2.28),
            new THREE.Vector3(xPos + dir * 0.16, 1.56 - H_OFF, 1.65),
            new THREE.Vector3(xPos + dir * 0.25, 1.68 - H_OFF, 0.95)
        ]);
        const cableGeo = new THREE.TubeGeometry(cableCurve, 32, 0.023, 8, false);
        const cableMesh = regPart(new THREE.Mesh(cableGeo, materials.cableSteel));
        hullChassis.add(cableMesh);

        const rearEye = regPart(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 16), materials.cableSteel));
        rearEye.position.set(xPos + dir * 0.25, 1.69 - H_OFF, 0.89);
        rearEye.rotation.x = Math.PI / 2;
        hullChassis.add(rearEye);
    });

    // Fenders, Mud Flaps, Brackets & Toolboxes
    [-1, 1].forEach(side => {
        const fenderX = side * 1.32;

        const fenderPlate = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.038, 5.82), materials.armor));
        fenderPlate.position.set(fenderX, 1.42 - H_OFF, 0.04);
        hullChassis.add(fenderPlate);

        const fenderLip = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.075, 5.84), materials.darkAccent));
        fenderLip.position.set(side * 1.65, 1.405 - H_OFF, 0.04);
        hullChassis.add(fenderLip);

        const frontFlap = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.038, 0.36), materials.armor));
        frontFlap.position.set(fenderX, 1.36 - H_OFF, 3.08);
        frontFlap.rotation.x = 0.36;
        hullChassis.add(frontFlap);

        const rearFlap = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.038, 0.36), materials.armor));
        rearFlap.position.set(fenderX, 1.36 - H_OFF, -2.99);
        rearFlap.rotation.x = -0.36;
        hullChassis.add(rearFlap);

        const bracketZPositions = [2.15, 1.15, 0.05, -1.05, -2.15];
        bracketZPositions.forEach(zPos => {
            const bShape = new THREE.Shape();
            bShape.moveTo(0, 0);
            bShape.lineTo(0.54, 0);
            bShape.lineTo(0, 0.26);
            bShape.closePath();
            const bGeo = new THREE.ExtrudeGeometry(bShape, { depth: 0.025, bevelEnabled: false });
            const bracket = regPart(new THREE.Mesh(bGeo, materials.armor));
            bracket.position.set(side * 0.99, 1.435 - H_OFF, zPos);
            if (side < 0) {
                bracket.rotation.y = Math.PI;
                bracket.position.z += 0.025;
            }
            hullChassis.add(bracket);
        });

        const toolbox = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.92), materials.armor));
        toolbox.position.set(side * 1.28, 1.54 - H_OFF, -1.35);
        hullChassis.add(toolbox);

        const toolboxLid = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.94), materials.darkAccent));
        toolboxLid.position.set(side * 1.28, 1.66 - H_OFF, -1.35);
        hullChassis.add(toolboxLid);
    });

    // Engine Deck & Exhausts
    const engineCover = regPart(new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 1.25), materials.armor));
    engineCover.position.set(0, 1.74 - H_OFF, -1.85);
    hullChassis.add(engineCover);

    [-0.45, 0.45].forEach(xPos => {
        const exhaust = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.32, 12), materials.trackMetal));
        exhaust.position.set(xPos, 1.82 - H_OFF, -1.42);
        exhaust.rotation.x = -0.35;
        hullChassis.add(exhaust);
    });

    // ----------------------------------------------------------------------------
    // 2. ICONIC TALL KV-2 TURRET (MT-1) WITH FIXED SIDE BACK PLATE GEOMETRY
    // ----------------------------------------------------------------------------
    const turretPivot = new THREE.Group();
    turretPivot.position.set(0, 1.82 - H_OFF, 0.34);
    hullGroup.add(turretPivot);

    // Cylindrical Turret Ring Collar
    const turretRing = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.88, 0.14, 36), materials.armor));
    turretRing.position.y = 0.06;
    turretPivot.add(turretRing);

    // Fixed KV-2 MT-1 Turret Footprint:
    // In THREE.ExtrudeGeometry, rotateX(-PI/2) transforms 3D Z = -Shape Y.
    // Therefore:
    // Shape Y = +1.18 produces 3D Z = -1.18 (FLAT REAR WALL)
    // Shape Y = -0.56 produces 3D Z = +0.56 (MID-FRONT TRANSITION)
    // Shape Y = -1.05 produces 3D Z = +1.05 (FRONT FACE CHEEKS)
    // This correctly places the angled cheeks at the FRONT and makes the side back plate solid and flat!
    const turretHeight = 1.32;
    const tFootprint = new THREE.Shape();
    tFootprint.moveTo(-0.84, 1.18);  // Rear Left (3D Z = -1.18)
    tFootprint.lineTo(0.84, 1.18);   // Rear Right (3D Z = -1.18)
    tFootprint.lineTo(0.84, -0.56);  // Mid-Front Right (3D Z = +0.56)
    tFootprint.lineTo(0.62, -1.05);  // Angled Front Cheek Right (3D Z = +1.05)
    tFootprint.lineTo(-0.62, -1.05); // Angled Front Cheek Left (3D Z = +1.05)
    tFootprint.lineTo(-0.84, -0.56); // Mid-Front Left (3D Z = +0.56)
    tFootprint.closePath();

    const turretCoreGeo = new THREE.ExtrudeGeometry(tFootprint, {
        depth: turretHeight,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.025,
        bevelThickness: 0.025
    });
    turretCoreGeo.rotateX(-Math.PI / 2); // Extrude upwards along +Y
    const turretCoreMesh = regPart(new THREE.Mesh(turretCoreGeo, materials.armor));
    turretCoreMesh.position.y = 0.11;
    turretPivot.add(turretCoreMesh);

    // Left & Right Turret Side Armor Plates with "ЗА РОДИНУ"
    // Spanning the flat side wall from Z = -1.18 to Z = +0.56 (length 1.74m, center Z = -0.31)
    const sidePlateGeo = new THREE.PlaneGeometry(1.74, 1.30);

    const leftDecalPlate = regPart(new THREE.Mesh(sidePlateGeo, materials.turretLeftMat));
    leftDecalPlate.position.set(0.868, 0.77, -0.31);
    leftDecalPlate.rotation.y = Math.PI / 2;
    turretPivot.add(leftDecalPlate);

    const rightDecalPlate = regPart(new THREE.Mesh(sidePlateGeo, materials.turretRightMat));
    rightDecalPlate.position.set(-0.868, 0.77, -0.31);
    rightDecalPlate.rotation.y = -Math.PI / 2;
    turretPivot.add(rightDecalPlate);

    // Turret Seam Bolts
    [-1, 1].forEach(side => {
        addBoltRow(
            turretPivot,
            new THREE.Vector3(side * 0.868, 0.22, 0.52),
            new THREE.Vector3(side * 0.868, 1.32, 0.52),
            6,
            'x'
        );
        addBoltRow(
            turretPivot,
            new THREE.Vector3(side * 0.868, 0.22, -1.12),
            new THREE.Vector3(side * 0.868, 1.32, -1.12),
            6,
            'x'
        );

        // Ladder Rungs on Turret Wall
        [0.45, 0.92].forEach(yRung => {
            const rungBar = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.30, 8), materials.armor));
            rungBar.rotation.x = Math.PI / 2;
            rungBar.position.set(side * 0.89, yRung, 0.14);
            turretPivot.add(rungBar);

            [-0.14, 0.14].forEach(zOff => {
                const standoff = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), materials.armor));
                standoff.rotation.z = Math.PI / 2;
                standoff.position.set(side * 0.87, yRung, 0.14 + zOff);
                turretPivot.add(standoff);
            });
        });

        // Vision Slit
        const visionSlit = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, 0.14), materials.gunBore));
        visionSlit.position.set(side * 0.865, 1.13, -0.02);
        turretPivot.add(visionSlit);
    });

    // Turret Roof Details: 4 Heavy Lifting Lugs, Hatches, Periscopes & Ventilator
    const createLiftingLug = (x, z, rotY = 0) => {
        const lugGroup = new THREE.Group();
        lugGroup.position.set(x, 1.44, z);
        lugGroup.rotation.y = rotY;
        const lugBase = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.18), materials.armor));
        lugGroup.add(lugBase);
        const lugArch = regPart(new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.024, 10, 18, Math.PI), materials.armor));
        lugArch.rotation.y = Math.PI / 2;
        lugArch.position.y = 0.02;
        lugGroup.add(lugArch);
        turretPivot.add(lugGroup);
    };
    createLiftingLug(0.58, 0.68, 0.15);
    createLiftingLug(-0.58, 0.68, -0.15);
    createLiftingLug(0.62, -0.82, 0);
    createLiftingLug(-0.62, -0.82, 0);

    const roofHatch = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.33, 0.06, 24), materials.armor));
    roofHatch.position.set(0, 1.45, -0.52);
    turretPivot.add(roofHatch);

    const roofVent = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.09, 18), materials.darkAccent));
    roofVent.position.set(0, 1.46, 0.25);
    turretPivot.add(roofVent);

    // Rear Turret Ammo Loading Hatch & Rear Ball MG on Flat Back Plate (Z = -1.18)
    const rearAmmoDoor = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.74, 0.035), materials.darkAccent));
    rearAmmoDoor.position.set(0, 0.76, -1.19);
    turretPivot.add(rearAmmoDoor);

    const rearDoorHinge1 = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), materials.armor));
    rearDoorHinge1.position.set(-0.33, 0.98, -1.19);
    turretPivot.add(rearDoorHinge1);

    const rearDoorHinge2 = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), materials.armor));
    rearDoorHinge2.position.set(-0.33, 0.54, -1.19);
    turretPivot.add(rearDoorHinge2);

    const rearTurretMG = regPart(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), materials.armor));
    rearTurretMG.position.set(0.48, 0.82, -1.19);
    turretPivot.add(rearTurretMG);

    const rearMgBarrel = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), materials.trackMetal));
    rearMgBarrel.rotation.x = Math.PI / 2;
    rearMgBarrel.position.set(0.48, 0.82, -1.28);
    turretPivot.add(rearMgBarrel);

    // Rounded Curved Gun Mantlet Shield
    const mantletShield = regPart(
        new THREE.Mesh(
            new THREE.CylinderGeometry(0.56, 0.56, 1.06, 32, 1, false, 0, Math.PI),
            materials.turretLeftMat
        )
    );
    mantletShield.position.set(0, 0.78, 0.94);
    mantletShield.rotation.y = -Math.PI / 2;
    turretPivot.add(mantletShield);

    // Top Brow Plate over Mantlet
    const mantletBrow = regPart(new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.09, 0.44), materials.armor));
    mantletBrow.position.set(0, 1.33, 1.08);
    mantletBrow.rotation.x = 0.14;
    turretPivot.add(mantletBrow);

    // ----------------------------------------------------------------------------
    // 3. ELEVATING 152MM M-10T HOWITZER & RECOIL ASSEMBLY
    // ----------------------------------------------------------------------------
    const gunElevationPivot = new THREE.Group();
    gunElevationPivot.position.set(0, 0.80, 1.12);
    turretPivot.add(gunElevationPivot);

    const gunRecoilGroup = new THREE.Group();
    gunElevationPivot.add(gunRecoilGroup);

    // Boxy Armored Recuperator / Recoil Block
    const housingBlock = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.62), materials.armor));
    housingBlock.position.set(0, 0, 0.28);
    gunRecoilGroup.add(housingBlock);

    const housingChin = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.18, 0.54), materials.darkAccent));
    housingChin.position.set(0, -0.30, 0.24);
    housingChin.rotation.x = -0.24;
    gunRecoilGroup.add(housingChin);

    // Coaxial Sight Aperture / Machine Gun Port
    const coaxMuzzleRef = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 12), materials.trackMetal));
    coaxMuzzleRef.rotation.x = Math.PI / 2;
    coaxMuzzleRef.position.set(-0.18, 0.16, 0.60);
    gunRecoilGroup.add(coaxMuzzleRef);

    const sightPort = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 12), materials.gunBore));
    sightPort.rotation.x = Math.PI / 2;
    sightPort.position.set(0.18, 0.16, 0.58);
    gunRecoilGroup.add(sightPort);

    // 152mm M-10T Stepped Barrel
    const barrelBaseCollar = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.18, 0.22, 28), materials.armor));
    barrelBaseCollar.rotation.x = Math.PI / 2;
    barrelBaseCollar.position.set(0, 0.03, 0.66);
    gunRecoilGroup.add(barrelBaseCollar);

    const mainBarrel = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.138, 0.152, 1.38, 32), materials.barrelMat));
    mainBarrel.rotation.x = Math.PI / 2;
    mainBarrel.position.set(0, 0.03, 1.36);
    gunRecoilGroup.add(mainBarrel);

    [1.12, 1.56].forEach(zRing => {
        const seamRing = regPart(new THREE.Mesh(new THREE.TorusGeometry(0.143, 0.008, 8, 28), materials.darkAccent));
        seamRing.position.set(0, 0.03, zRing);
        gunRecoilGroup.add(seamRing);
    });

    const muzzleRing = regPart(new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.02, 12, 28), materials.trackMetal));
    muzzleRing.position.set(0, 0.03, 2.05);
    gunRecoilGroup.add(muzzleRing);

    const hollowBore = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.55, 24, 1, true), materials.gunBore));
    hollowBore.rotation.x = Math.PI / 2;
    hollowBore.position.set(0, 0.03, 1.78);
    gunRecoilGroup.add(hollowBore);

    // Muzzle tip for shell spawning & fire particle positioning
    const mainGunMuzzleTip = new THREE.Object3D();
    mainGunMuzzleTip.position.set(0, 0.03, 2.08);
    gunRecoilGroup.add(mainGunMuzzleTip);

    // ----------------------------------------------------------------------------
    // 4. RUNNING GEAR: ROAD WHEELS, SPROCKETS, IDLERS & ARTICULATED TRACKS
    // ----------------------------------------------------------------------------
    const roadWheelStations = { left: [], right: [] };
    const driveSprockets = [];
    const idlerWheels = [];
    const trackChains = { left: null, right: null };

    // Reusable Road Wheel Builder (6 dual perforated road wheels per side)
    function createKVRoadWheel() {
        const cluster = new THREE.Group();
        const spinGroup = new THREE.Group();
        cluster.add(spinGroup);

        [-0.08, 0.08].forEach(xOffset => {
            const rim = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.11, 28), materials.rubberRim));
            rim.rotation.z = Math.PI / 2;
            rim.position.x = xOffset;
            spinGroup.add(rim);

            const greenDisc = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.116, 28), materials.armor));
            greenDisc.rotation.z = Math.PI / 2;
            greenDisc.position.x = xOffset;
            spinGroup.add(greenDisc);
        });

        // 8 Perforated Holes & Radial Ribs on outer wheel face
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const holeMesh = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.13, 10), materials.gunBore));
            holeMesh.rotation.z = Math.PI / 2;
            holeMesh.position.set(0.082, Math.cos(angle) * 0.185, Math.sin(angle) * 0.185);
            spinGroup.add(holeMesh);

            const rib = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.02), materials.darkAccent));
            rib.position.set(0.135, Math.cos(angle + Math.PI / 8) * 0.18, Math.sin(angle + Math.PI / 8) * 0.18);
            rib.rotation.x = -(angle + Math.PI / 8);
            spinGroup.add(rib);
        }

        const hubCap = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.09, 18), materials.armor));
        hubCap.rotation.z = Math.PI / 2;
        hubCap.position.x = 0.145;
        spinGroup.add(hubCap);

        return { cluster, spinGroup };
    }

    function createReturnRoller() {
        const rollerGroup = new THREE.Group();
        const rim = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.18, 20), materials.rubberRim));
        rim.rotation.z = Math.PI / 2;
        rollerGroup.add(rim);

        const disc = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.19, 20), materials.armor));
        disc.rotation.z = Math.PI / 2;
        rollerGroup.add(disc);

        const cap = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 12), materials.darkAccent));
        cap.rotation.z = Math.PI / 2;
        rollerGroup.add(cap);
        return rollerGroup;
    }

    function createIdlerWheel() {
        const idlerGroup = new THREE.Group();
        const outerRim = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.22, 28), materials.armor));
        outerRim.rotation.z = Math.PI / 2;
        idlerGroup.add(outerRim);

        const recess = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.23, 24), materials.gunBore));
        recess.rotation.z = Math.PI / 2;
        idlerGroup.add(recess);

        for (let i = 0; i < 8; i++) {
            const spoke = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.66, 0.045), materials.armor));
            spoke.rotation.x = (i / 8) * Math.PI;
            idlerGroup.add(spoke);
        }

        const hub = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.27, 18), materials.armor));
        hub.rotation.z = Math.PI / 2;
        idlerGroup.add(hub);
        return idlerGroup;
    }

    function createDriveSprocket() {
        const sprocketGroup = new THREE.Group();
        const drum = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.24, 28), materials.armor));
        drum.rotation.z = Math.PI / 2;
        sprocketGroup.add(drum);

        [-0.10, 0.10].forEach(xRing => {
            for (let i = 0; i < 14; i++) {
                const angle = (i / 14) * Math.PI * 2;
                const tooth = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.055), materials.trackMetal));
                tooth.position.set(xRing, Math.cos(angle) * 0.40, Math.sin(angle) * 0.40);
                tooth.rotation.x = -angle;
                sprocketGroup.add(tooth);
            }
        });

        const hub = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.28, 20), materials.darkAccent));
        hub.rotation.z = Math.PI / 2;
        sprocketGroup.add(hub);
        return sprocketGroup;
    }

    // Closed Loop Track Spline Path in Hull Frame
    const trackLoopWaypoints = [
        new THREE.Vector2( 3.04,  0.90 - H_OFF),  // Front idler tip
        new THREE.Vector2( 2.86,  0.56 - H_OFF),  // Lower front curve
        new THREE.Vector2( 2.15,  0.06 - H_OFF),  // 1st Road Wheel ground
        new THREE.Vector2( 1.30,  0.05 - H_OFF),  // 2nd Road Wheel ground
        new THREE.Vector2( 0.45,  0.05 - H_OFF),  // 3rd Road Wheel ground
        new THREE.Vector2(-0.40,  0.05 - H_OFF),  // 4th Road Wheel ground
        new THREE.Vector2(-1.25,  0.05 - H_OFF),  // 5th Road Wheel ground
        new THREE.Vector2(-2.10,  0.06 - H_OFF),  // 6th Road Wheel ground
        new THREE.Vector2(-2.82,  0.52 - H_OFF),  // Lower rear sprocket curve
        new THREE.Vector2(-3.00,  0.90 - H_OFF),  // Rear sprocket tip
        new THREE.Vector2(-2.68,  1.24 - H_OFF),  // Top rear sprocket
        new THREE.Vector2(-1.55,  1.19 - H_OFF),  // Return roller 3
        new THREE.Vector2( 0.05,  1.19 - H_OFF),  // Return roller 2
        new THREE.Vector2( 1.55,  1.19 - H_OFF),  // Return roller 1
        new THREE.Vector2( 2.74,  1.24 - H_OFF)   // Top front idler
    ];

    const numTrackWaypoints = trackLoopWaypoints.length;
    const trackSegLengths = [];
    let totalTrackPerimeter = 0;
    for (let i = 0; i < numTrackWaypoints; i++) {
        const p0 = trackLoopWaypoints[i];
        const p1 = trackLoopWaypoints[(i + 1) % numTrackWaypoints];
        const l = p0.distanceTo(p1);
        trackSegLengths.push(l);
        totalTrackPerimeter += l;
    }

    function evaluateTrackPoint(sideKey, uNorm) {
        let u = ((uNorm % 1.0) + 1.0) % 1.0;
        let targetDist = u * totalTrackPerimeter;

        for (let i = 0; i < numTrackWaypoints; i++) {
            const segLen = trackSegLengths[i];
            if (targetDist <= segLen || i === numTrackWaypoints - 1) {
                const t = Math.min(1.0, Math.max(0.0, targetDist / segLen));
                const p0 = trackLoopWaypoints[i];
                const p1 = trackLoopWaypoints[(i + 1) % numTrackWaypoints];
                const z = p0.x + (p1.x - p0.x) * t;
                const y = p0.y + (p1.y - p0.y) * t;
                const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
                return { z, y, pitch: -angle };
            }
            targetDist -= segLen;
        }
        return { z: trackLoopWaypoints[0].x, y: trackLoopWaypoints[0].y, pitch: 0 };
    }

    // Merged Track Link Geometry for High-Performance InstancedMesh Rendering
    const mergeFn = (typeof window !== 'undefined' && window.mergeBufferGeometries) || (typeof mergeBufferGeometries === 'function' ? mergeBufferGeometries : null);
    const linkPlateGeo = new THREE.BoxGeometry(0.58, 0.032, 0.15);
    const cleatGeo1 = new THREE.BoxGeometry(0.56, 0.026, 0.032);
    cleatGeo1.translate(0, 0.025, 0.038);
    const cleatGeo2 = new THREE.BoxGeometry(0.24, 0.026, 0.032);
    cleatGeo2.translate(0, 0.025, -0.038);
    const guideHornGeo = new THREE.BoxGeometry(0.04, 0.085, 0.07);
    guideHornGeo.translate(0, -0.05, 0);

    const mergedKVLinkGeo = mergeFn ? mergeFn([linkPlateGeo, cleatGeo1, cleatGeo2, guideHornGeo]) : linkPlateGeo;
    const numLinksPerSide = 74;

    ['left', 'right'].forEach(sideKey => {
        const sideSign = sideKey === 'left' ? 1 : -1;
        const wheelX = sideSign * 1.31;

        // 6 Road Wheels per side with Torsion Bar Swing Arms
        const roadWheelZ = [2.15, 1.30, 0.45, -0.40, -1.25, -2.10];
        roadWheelZ.forEach(zPos => {
            const swingArm = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.36), materials.armor));
            swingArm.position.set(sideSign * 1.10, 0.46 - H_OFF, zPos + 0.14);
            swingArm.rotation.x = 0.35;
            hullGroup.add(swingArm);

            const axleHousing = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.24, 16), materials.wheelHubSteel));
            axleHousing.rotation.z = Math.PI / 2;
            axleHousing.position.set(sideSign * 1.08, 0.54 - H_OFF, zPos + 0.24);
            hullGroup.add(axleHousing);

            const { cluster, spinGroup } = createKVRoadWheel();
            if (sideSign < 0) spinGroup.rotation.y = Math.PI;
            cluster.position.set(wheelX, 0.38 - H_OFF, zPos);
            hullGroup.add(cluster);

            roadWheelStations[sideKey].push({
                cluster,
                spinGroup,
                baseY: 0.38 - H_OFF,
                currentOffset: 0,
                velocityY: 0,
                z: zPos,
                x: wheelX
            });
        });

        // 3 Return Rollers
        const rollerZ = [1.55, 0.05, -1.55];
        rollerZ.forEach(zPos => {
            const mountStud = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.28, 12), materials.armor));
            mountStud.rotation.z = Math.PI / 2;
            mountStud.position.set(sideSign * 1.12, 1.01 - H_OFF, zPos);
            hullGroup.add(mountStud);

            const rr = createReturnRoller();
            if (sideSign < 0) rr.rotation.y = Math.PI;
            rr.position.set(wheelX, 1.01 - H_OFF, zPos);
            hullGroup.add(rr);
        });

        // Front Spoked Idler
        const idler = createIdlerWheel();
        if (sideSign < 0) idler.rotation.y = Math.PI;
        idler.position.set(wheelX, 0.88 - H_OFF, 2.66);
        hullGroup.add(idler);
        idlerWheels.push({ mesh: idler, side: sideKey });

        // Rear Drive Sprocket
        const sprocket = createDriveSprocket();
        if (sideSign < 0) sprocket.rotation.y = Math.PI;
        sprocket.position.set(wheelX, 0.85 - H_OFF, -2.62);
        hullGroup.add(sprocket);
        driveSprockets.push({ mesh: sprocket, side: sideKey });

        // Instanced Articulated Track
        const trackInstMesh = new THREE.InstancedMesh(mergedKVLinkGeo, materials.trackMetal, numLinksPerSide);
        trackInstMesh.castShadow = true;
        trackInstMesh.receiveShadow = true;
        trackInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        hullGroup.add(trackInstMesh);

        trackChains[sideKey] = {
            instMesh: trackInstMesh,
            trackX: wheelX,
            count: numLinksPerSide
        };
    });

    const dummyKVLink = new THREE.Object3D();
    const updateTracksGeometry = function(leftPhase, rightPhase) {
        ['left', 'right'].forEach(sideKey => {
            const chain = trackChains[sideKey];
            if (!chain || !chain.instMesh) return;
            const phase = (sideKey === 'left') ? leftPhase : rightPhase;
            const n = chain.count;
            const trackX = chain.trackX;

            for (let i = 0; i < n; i++) {
                const u = (i / n + phase) % 1.0;
                const pt = evaluateTrackPoint(sideKey, u);
                dummyKVLink.position.set(trackX, pt.y, pt.z);
                dummyKVLink.rotation.set(pt.pitch, 0, 0);
                dummyKVLink.updateMatrix();
                chain.instMesh.setMatrixAt(i, dummyKVLink.matrix);
            }
            chain.instMesh.instanceMatrix.needsUpdate = true;
        });
    };
    updateTracksGeometry(0, 0);

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

if (typeof document !== 'undefined') {
    try {
        getKV2SharedAssets(false);
        getKV2SharedAssets(true);
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.buildKV2Tank = buildKV2Tank;
    window.getKV2SharedAssets = getKV2SharedAssets;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildKV2Tank, getKV2SharedAssets };
}
