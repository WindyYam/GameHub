// ============================================================================
// M26 Pershing Heavy Tank ("VANGUARD" / "ARMORED" / Turret #26)
// High-Fidelity WWII American Heavy Assault Tank for TankClash
// Features:
// - 90mm Gun M3 with Double-Baffle Muzzle Brake (2 HP Damage, Rapid 2.7s Reload)
// - Sloped Glacis with Driver/Co-Driver Blisters, Bow .30 Cal MG & Tow Shackles
// - Authentic Tamiya M26 (Item 35254) Olive Drab PBR Armor & White Star Decals
// - High-Detail, Reduced-Strength Normal Map: Fine Cast Steel Stippling, Mill Grain & Welds
// - 6 Torsion-Bar Road Wheels, Raised Front Idler, Rear Toothed Sprocket,
//   5 Return Rollers & Instanced T80E1 Double-Pin Articulated Chevron Tracks
// - Working Headlights (player only to keep scene lights fixed), Roof .50 Cal M2
// - Zero-Lag Shared Geometry & Prewarmed Materials Caching
// ============================================================================

const pershingAssetCache = {};
let pershingSharedBase = null;
let pershingGeometries = null;

// ============================================================================
// 1. PROCEDURAL TEXTURES & HIGH-DETAIL NORMAL MAP BASE (Generated once globally)
// ============================================================================
function initPershingSharedBase() {
    if (pershingSharedBase) return pershingSharedBase;

    const size = 512;
    const heightData = new Float32Array(size * size);
    let pSeed = 9261;
    function pRand() {
        pSeed = (pSeed * 16807) % 2147483647;
        return (pSeed - 1) / 2147483646;
    }

    // A. Multi-Frequency Fine Rolling Grain & High-Detail Surface Texture
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            const micro1 = Math.sin(x * 0.85) * Math.cos(y * 0.85) * 0.012;
            const micro2 = Math.sin(x * 1.95 + y * 1.45) * 0.008;
            const micro3 = Math.cos(x * 3.80 - y * 2.20) * 0.005;
            const rollingGrain = Math.sin(x * 0.55) * 0.006;
            heightData[idx] = 0.50 + micro1 + micro2 + micro3 + rollingGrain;
        }
    }

    // B. Dense Cast Steel Micro-Stippling (Fine orange-peel cast texture, 1px - 2px scale)
    for (let i = 0; i < 48000; i++) {
        const x = Math.floor(pRand() * size);
        const y = Math.floor(pRand() * size);
        const val = (pRand() - 0.5) * 0.08;
        const idx = y * size + x;
        heightData[idx] = Math.max(0.2, Math.min(0.8, heightData[idx] + val));
        const nx = (x + 1) % size;
        heightData[y * size + nx] = Math.max(0.2, Math.min(0.8, heightData[y * size + nx] + val * 0.45));
    }

    // C. Very Fine Scale Micro-Scratches & Hairline Scuffs
    for (let s = 0; s < 180; s++) {
        const sx = Math.floor(pRand() * size);
        const sy = Math.floor(pRand() * size);
        const angle = pRand() * Math.PI * 2;
        const length = 8 + Math.floor(pRand() * 32);
        const depth = 0.035 + pRand() * 0.045;
        for (let step = 0; step < length; step++) {
            const cx = Math.floor((sx + Math.cos(angle) * step + size) % size);
            const cy = Math.floor((sy + Math.sin(angle) * step + size) % size);
            const idx = cy * size + cx;
            heightData[idx] = Math.max(0.2, heightData[idx] - depth);
        }
    }

    // D. Precise, Tight Weld Seams
    function drawFineWeld(x0, y0, x1, y1, width = 2.2) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        const steps = Math.floor(len * 2.5);
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const wobble = Math.sin(s * 1.2) * 0.35;
            const cx = Math.floor(x0 + dx * t + wobble);
            const cy = Math.floor(y0 + dy * t + wobble);
            for (let rx = -width; rx <= width; rx++) {
                for (let ry = -width; ry <= width; ry++) {
                    const px = (cx + rx + size) % size;
                    const py = (cy + ry + size) % size;
                    const dist = Math.hypot(rx, ry);
                    if (dist < width) {
                        const idx = py * size + px;
                        const bead = Math.cos(dist / width * Math.PI * 0.5) * 0.12;
                        heightData[idx] = Math.min(0.95, heightData[idx] + bead);
                    }
                }
            }
        }
    }
    drawFineWeld(14, 14, size - 14, 14, 2.2);
    drawFineWeld(size - 14, 14, size - 14, size - 14, 2.2);
    drawFineWeld(14, size - 14, size - 14, size - 14, 2.2);
    drawFineWeld(14, 14, 14, size - 14, 2.2);
    drawFineWeld(Math.floor(size * 0.38), 14, Math.floor(size * 0.38), size - 14, 2.0);
    drawFineWeld(14, Math.floor(size * 0.65), size - 14, Math.floor(size * 0.65), 2.0);

    // E. High-Detail, Reduced-Strength Tangent-Space Sobel Normal Filter
    const normCanvas = document.createElement('canvas');
    normCanvas.width = normCanvas.height = size;
    const nCtx = normCanvas.getContext('2d');
    const nImg = nCtx.createImageData(size, size);
    const nData = nImg.data;
    const normalStrength = 1.35; // Gentle, crisp scale-model strength

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const xm = (x - 1 + size) % size;
            const xp = (x + 1) % size;
            const ym = (y - 1 + size) % size;
            const yp = (y + 1) % size;

            const tl = heightData[ym * size + xm];
            const l  = heightData[y  * size + xm];
            const bl = heightData[yp * size + xm];
            const t  = heightData[ym * size + x];
            const b  = heightData[yp * size + x];
            const tr = heightData[ym * size + xp];
            const r  = heightData[y  * size + xp];
            const br = heightData[yp * size + xp];

            const dX = ((tr + 2 * r + br) - (tl + 2 * l + bl)) * normalStrength;
            const dY = ((bl + 2 * b + br) - (tl + 2 * t + tr)) * normalStrength;
            const dZ = 1.0;

            const len = Math.hypot(dX, dY, dZ);
            const idx = (y * size + x) * 4;
            nData[idx]     = Math.floor(((dX / len) * 0.5 + 0.5) * 255);
            nData[idx + 1] = Math.floor(((-dY / len) * 0.5 + 0.5) * 255);
            nData[idx + 2] = Math.floor(((dZ / len) * 0.5 + 0.5) * 255);
            nData[idx + 3] = 255;
        }
    }
    nCtx.putImageData(nImg, 0, 0);

    // Roughness Map (Matte military finish matching Tamiya scale model ~ 0.58-0.65)
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d');
    const rImg = rCtx.createImageData(size, size);
    for (let i = 0; i < rImg.data.length; i += 4) {
        const pixIdx = i / 4;
        const hVal = heightData[pixIdx];
        const v = Math.max(90, Math.min(210, Math.floor(155 - (hVal - 0.50) * 75)));
        rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = v;
        rImg.data[i + 3] = 255;
    }
    rCtx.putImageData(rImg, 0, 0);

    const normalTex = new THREE.CanvasTexture(normCanvas);
    const roughTex  = new THREE.CanvasTexture(roughCanvas);
    [normalTex, roughTex].forEach(t => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 2);
    });

    // Wooden Crate Texture (Rear Stowage)
    const crateCanvas = document.createElement('canvas');
    crateCanvas.width = crateCanvas.height = 256;
    const cCtx = crateCanvas.getContext('2d');
    cCtx.fillStyle = '#62462e';
    cCtx.fillRect(0, 0, 256, 256);
    cCtx.fillStyle = '#4c331e';
    for (let y = 0; y < 256; y += 8) {
        cCtx.fillRect(0, y, 256, 2 + Math.random() * 2);
    }
    cCtx.strokeStyle = '#2d1c0e';
    cCtx.lineWidth = 6;
    cCtx.strokeRect(4, 4, 248, 248);
    const crateTex = new THREE.CanvasTexture(crateCanvas);

    // Decal Textures (Front Glacis White Star + "VANGUARD", Side Skirt "ARMORED", Turret Emblem)
    const glacisCanvas = document.createElement('canvas');
    glacisCanvas.width = glacisCanvas.height = 512;
    const gCtx = glacisCanvas.getContext('2d');
    gCtx.clearRect(0, 0, 512, 512);

    // 5-Point White Star
    gCtx.save();
    gCtx.translate(256, 195);
    gCtx.fillStyle = '#f0eee6';
    gCtx.beginPath();
    const spikes = 5, outerR = 95, innerR = 38;
    for (let i = 0; i < spikes * 2; i++) {
        const r = (i % 2 === 0) ? outerR : innerR;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) gCtx.moveTo(x, y);
        else gCtx.lineTo(x, y);
    }
    gCtx.closePath();
    gCtx.fill();
    gCtx.restore();

    // "VANGUARD" Stencil
    gCtx.fillStyle = '#f0eee6';
    gCtx.font = 'bold 52px "Arial Black", sans-serif';
    gCtx.textAlign = 'center';
    gCtx.fillText('VANGUARD', 256, 405);
    const glacisDecalTex = new THREE.CanvasTexture(glacisCanvas);

    // Side Skirt Decal ("ARMORED" + Ordnance Technical Data)
    const skirtCanvas = document.createElement('canvas');
    skirtCanvas.width = 1024;
    skirtCanvas.height = 128;
    const skCtx = skirtCanvas.getContext('2d');
    skCtx.clearRect(0, 0, 1024, 128);
    skCtx.fillStyle = '#e5e3d8';
    skCtx.font = 'bold 18px monospace';
    skCtx.fillText('ORDNANCE DEPT U.S.A.', 110, 46);
    skCtx.fillText('TANK HEAVY M26 PERSHING', 110, 70);
    skCtx.fillText('WT 92,000 LBS  90MM M3', 110, 94);
    skCtx.font = 'bold 54px "Arial Black", sans-serif';
    skCtx.fillText('ARMORED', 540, 82);
    const skirtDecalTex = new THREE.CanvasTexture(skirtCanvas);

    // Turret Emblem (White Star with Yellow Armor Circle #26)
    const emblemCanvas = document.createElement('canvas');
    emblemCanvas.width = emblemCanvas.height = 256;
    const eCtx = emblemCanvas.getContext('2d');
    eCtx.clearRect(0, 0, 256, 256);
    eCtx.save();
    eCtx.translate(128, 128);
    eCtx.fillStyle = '#f2f0e8';
    eCtx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = (i % 2 === 0) ? 75 : 30;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        eCtx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    eCtx.closePath();
    eCtx.fill();
    eCtx.fillStyle = '#eab308';
    eCtx.beginPath();
    eCtx.arc(0, 5, 32, 0, Math.PI * 2);
    eCtx.fill();
    eCtx.fillStyle = '#222';
    eCtx.font = 'bold 24px sans-serif';
    eCtx.textAlign = 'center';
    eCtx.fillText('26', 0, 14);
    eCtx.restore();
    const emblemTex = new THREE.CanvasTexture(emblemCanvas);

    pershingSharedBase = {
        heightData,
        normalTex,
        roughTex,
        crateTex,
        glacisDecalTex,
        skirtDecalTex,
        emblemTex
    };
    return pershingSharedBase;
}

// ============================================================================
// 2. MATERIALS & VARIANT ASSETS (Prewarmed for zero-lag enemy spawns)
//    Tone matching Tamiya 35254 Reference: Authentic US Army Olive Drab (XF-62)
// ============================================================================
function getPershingSharedAssets(isEnemy) {
    const key = isEnemy ? 'enemy' : 'player';
    if (pershingAssetCache[key]) return pershingAssetCache[key];

    const base = initPershingSharedBase();
    const size = 512;

    // Authentic WWII US Army Olive Drab (matching Tamiya 35254 reference photo):
    // Desaturated military olive drab with earthy undertone: Red ~ 88-92, Green ~ 94-98, Blue ~ 72-76
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = albedoCanvas.height = size;
    const aCtx = albedoCanvas.getContext('2d');

    const baseR = isEnemy ? 76 : 90;
    const baseG = isEnemy ? 82 : 96;
    const baseB = isEnemy ? 62 : 74;

    const aImg = aCtx.createImageData(size, size);
    const aData = aImg.data;
    for (let i = 0; i < aData.length; i += 4) {
        const pixIdx = i / 4;
        const hVal = base.heightData[pixIdx];
        const hDiff = (hVal - 0.50) * 28;
        const noise = (Math.random() - 0.5) * 6;

        aData[i]     = Math.max(0, Math.min(255, Math.floor(baseR + hDiff + noise)));
        aData[i + 1] = Math.max(0, Math.min(255, Math.floor(baseG + hDiff * 1.05 + noise)));
        aData[i + 2] = Math.max(0, Math.min(255, Math.floor(baseB + hDiff * 0.80 + noise)));
        aData[i + 3] = 255;
    }
    aCtx.putImageData(aImg, 0, 0);

    // Weathering dust gradients & micro-grime
    for (let s = 0; s < 25; s++) {
        const sx = Math.random() * size;
        const sy = Math.random() * size;
        const rad = 25 + Math.random() * 60;
        const grad = aCtx.createRadialGradient(sx, sy, 2, sx, sy, rad);
        grad.addColorStop(0, 'rgba(64, 68, 50, 0.22)');
        grad.addColorStop(0.6, 'rgba(78, 84, 62, 0.08)');
        grad.addColorStop(1, 'rgba(90, 96, 74, 0)');
        aCtx.fillStyle = grad;
        aCtx.beginPath();
        aCtx.arc(sx, sy, rad, 0, Math.PI * 2);
        aCtx.fill();
    }

    const albedoTex = new THREE.CanvasTexture(albedoCanvas);
    albedoTex.wrapS = THREE.RepeatWrapping;
    albedoTex.wrapT = THREE.RepeatWrapping;
    albedoTex.repeat.set(2, 2);

    // Muzzle Soot Barrel Texture
    const barrelCanvas = document.createElement('canvas');
    barrelCanvas.width = barrelCanvas.height = 256;
    const barCtx = barrelCanvas.getContext('2d');
    barCtx.drawImage(albedoCanvas, 0, 0, 256, 256);
    const sootGrad = barCtx.createLinearGradient(0, 0, 0, 256);
    sootGrad.addColorStop(0, '#161814');
    sootGrad.addColorStop(0.20, '#2c3026');
    sootGrad.addColorStop(0.40, 'rgba(56, 62, 46, 0.35)');
    sootGrad.addColorStop(0.65, 'rgba(90, 96, 74, 0)');
    barCtx.fillStyle = sootGrad;
    barCtx.fillRect(0, 0, 256, 256);
    const barrelTex = new THREE.CanvasTexture(barrelCanvas);

    // Materials Palette matching Tamiya 35254 Pershing reference:
    // Color: #5a6048 (authentic semi-matte WWII US Army Olive Drab)
    const materials = {
        brownArmor: new THREE.MeshStandardMaterial({
            color: isEnemy ? 0x4a503b : 0x5a6048,
            map: albedoTex,
            normalMap: base.normalTex,
            normalScale: new THREE.Vector2(0.35, 0.35), // Reduced strength for refined, non-chunky surface
            roughnessMap: base.roughTex,
            roughness: 0.62,
            metalness: 0.20,
            envMapIntensity: 0.28
        }),
        castTurretArmor: new THREE.MeshStandardMaterial({
            color: isEnemy ? 0x464c38 : 0x565c44,
            map: albedoTex,
            normalMap: base.normalTex,
            normalScale: new THREE.Vector2(0.55, 0.55), // Fine stippled cast steel
            roughnessMap: base.roughTex,
            roughness: 0.58,
            metalness: 0.24,
            envMapIntensity: 0.30
        }),
        darkRubber: new THREE.MeshStandardMaterial({
            color: 0x161718,
            roughness: 0.88,
            metalness: 0.08
        }),
        trackSteel: new THREE.MeshStandardMaterial({
            color: 0x2e2f2c,
            normalMap: base.normalTex,
            normalScale: new THREE.Vector2(0.40, 0.40),
            roughness: 0.52,
            metalness: 0.68
        }),
        gunMetal: new THREE.MeshStandardMaterial({
            color: 0x222426,
            roughness: 0.38,
            metalness: 0.82
        }),
        barrelMuzzleMat: new THREE.MeshStandardMaterial({
            color: isEnemy ? 0x4a503b : 0x5a6048,
            map: barrelTex,
            normalMap: base.normalTex,
            normalScale: new THREE.Vector2(0.40, 0.40),
            roughness: 0.58,
            metalness: 0.25
        }),
        sprocketHub: new THREE.MeshStandardMaterial({
            color: isEnemy ? 0x3d5032 : 0x495e3c,
            roughness: 0.55,
            metalness: 0.30
        }),
        woodCrate: new THREE.MeshStandardMaterial({
            map: base.crateTex,
            roughness: 0.84,
            metalness: 0.04
        }),
        glacisDecalMat: new THREE.MeshBasicMaterial({
            map: base.glacisDecalTex,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2
        }),
        skirtDecalMat: new THREE.MeshBasicMaterial({
            map: base.skirtDecalTex,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2
        }),
        emblemMat: new THREE.MeshBasicMaterial({
            map: base.emblemTex,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2
        }),
        boreMat: new THREE.MeshBasicMaterial({
            color: 0x090908
        }),
        slitMat: new THREE.MeshBasicMaterial({
            color: 0x222222
        })
    };

    Object.values(materials).forEach(m => {
        m.userData.shared = true;
    });

    pershingAssetCache[key] = {
        materials,
        textures: { albedoTex, normalTex: base.normalTex, roughTex: base.roughTex, crateTex: base.crateTex, glacisDecalTex: base.glacisDecalTex, skirtDecalTex: base.skirtDecalTex, emblemTex: base.emblemTex, barrelTex }
    };
    return pershingAssetCache[key];
}

// ============================================================================
// 3. CACHED GEOMETRIES (Allocated once globally to prevent runtime allocation lag)
// ============================================================================
function getPershingGeometries(H_OFF) {
    if (pershingGeometries) return pershingGeometries;

    const mergeFn = (typeof window !== 'undefined' && window.mergeBufferGeometries) || (typeof mergeBufferGeometries === 'function' ? mergeBufferGeometries : null);

    // Main Hull Profile (Z, Y): +X nose slopes back to roof; translated & rotated by -PI/2
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-2.75, 0.48 - H_OFF);  // Rear bottom belly
    hullShape.lineTo(1.75, 0.48 - H_OFF);   // Front bottom belly
    hullShape.lineTo(2.68, 1.05 - H_OFF);   // Lower glacis plate angled up to nose
    hullShape.lineTo(1.62, 1.56 - H_OFF);   // Upper glacis sloped back (46 deg)
    hullShape.lineTo(-2.65, 1.56 - H_OFF);  // Hull roof & engine deck
    hullShape.lineTo(-2.85, 1.15 - H_OFF);  // Rear upper slope
    hullShape.closePath();

    const hullWidth = 2.04;
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
        depth: hullWidth,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.05,
        bevelThickness: 0.05
    });
    // Center width and rotate by -PI/2 so that +X of hullShape aligns with +Z (Forward sloped glacis)
    hullGeo.translate(0, 0, -hullWidth / 2);
    hullGeo.rotateY(-Math.PI / 2);
    hullGeo.computeVertexNormals();

    // Glacis blisters
    const bulgeGeo = new THREE.SphereGeometry(0.32, 20, 16);
    bulgeGeo.scale(1.0, 0.72, 1.25);
    const hoodGeo = new THREE.BoxGeometry(0.22, 0.12, 0.24);

    // MG & Headlight parts
    const mgSocketGeo = new THREE.SphereGeometry(0.14, 16, 16);
    const bowBarrelGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.46, 12);
    bowBarrelGeo.rotateX(Math.PI / 2);

    const lampBodyGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.14, 14);
    lampBodyGeo.rotateX(-Math.PI / 2);
    const lampGuardGeo = new THREE.TorusGeometry(0.13, 0.015, 8, 20);
    const slitLensGeo = new THREE.CircleGeometry(0.075, 14);

    const shackleLGeo = new THREE.TorusGeometry(0.09, 0.025, 10, 18);
    const shackleUGeo = new THREE.TorusGeometry(0.075, 0.02, 10, 18);

    const grilleGeo = new THREE.BoxGeometry(1.65, 0.04, 0.28);
    const crateGeo = new THREE.BoxGeometry(0.55, 0.26, 0.42);
    const canisterGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.56, 16);
    canisterGeo.rotateX(Math.PI / 2);

    // Fenders & Stowage
    const fenderPlateGeo = new THREE.BoxGeometry(0.68, 0.06, 5.45);
    const frontHoodGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.68, 20, 1, false, 0, Math.PI * 0.65);
    frontHoodGeo.rotateZ(Math.PI / 2);
    const frontSkirtGeo = new THREE.BoxGeometry(0.05, 0.36, 1.45);
    const sideEdgeGeo = new THREE.BoxGeometry(0.05, 0.24, 4.35);
    const box1Geo = new THREE.BoxGeometry(0.46, 0.22, 0.92);
    const box2Geo = new THREE.BoxGeometry(0.46, 0.22, 0.78);
    const smallBoxGeo = new THREE.BoxGeometry(0.32, 0.21, 0.26);

    // Turret & Gun
    const collarGeo = new THREE.CylinderGeometry(1.06, 1.10, 0.18, 32);
    const mainDomeGeo = new THREE.SphereGeometry(1.04, 36, 28);
    mainDomeGeo.scale(0.96, 0.56, 1.18);
    const bustleGeo = new THREE.BoxGeometry(1.36, 0.62, 1.15);
    const bustleRoundGeo = new THREE.CylinderGeometry(0.68, 0.64, 0.62, 24);

    const mantletGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.38, 28);
    mantletGeo.rotateZ(Math.PI / 2);
    mantletGeo.scale(1.0, 0.92, 0.85);

    const mantletCapGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 18);
    mantletCapGeo.rotateZ(Math.PI / 2);

    const sleeveGeo = new THREE.CylinderGeometry(0.17, 0.28, 0.52, 24);
    sleeveGeo.rotateX(Math.PI / 2);

    const barrelGeo = new THREE.CylinderGeometry(0.095, 0.135, 3.85, 28);
    barrelGeo.rotateX(Math.PI / 2);

    const collarRingGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.18, 24);
    collarRingGeo.rotateX(Math.PI / 2);

    const brakeBodyGeo = new THREE.CylinderGeometry(0.165, 0.13, 0.52, 24);
    brakeBodyGeo.rotateX(Math.PI / 2);

    const ventBoxGeo = new THREE.BoxGeometry(0.35, 0.13, 0.12);
    const boreGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.56, 20);
    boreGeo.rotateX(Math.PI / 2);

    const coaxBarrelGeo = new THREE.CylinderGeometry(0.02, 0.024, 0.28, 10);
    coaxBarrelGeo.rotateX(Math.PI / 2);

    // Browning .50 Cal M2
    const pintlePostGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.52, 12);
    const m2ReceiverGeo = new THREE.BoxGeometry(0.09, 0.12, 0.45);
    const m2BarrelGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.72, 12);
    m2BarrelGeo.rotateX(Math.PI / 2);
    const ammoBoxGeo = new THREE.BoxGeometry(0.22, 0.16, 0.28);
    const spadeGripsGeo = new THREE.TorusGeometry(0.06, 0.012, 8, 12);

    // Wheels & Suspension
    const suspArmGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.45, 10);
    const roadTireGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.16, 24);
    roadTireGeo.rotateZ(Math.PI / 2);
    const roadRimGeo = new THREE.CylinderGeometry(0.39 * 0.76, 0.39 * 0.76, 0.175, 24);
    roadRimGeo.rotateZ(Math.PI / 2);
    const roadHubGeo = new THREE.CylinderGeometry(0.39 * 0.28, 0.39 * 0.32, 0.45, 14);
    roadHubGeo.rotateZ(Math.PI / 2);

    const idlerTireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.16, 24);
    idlerTireGeo.rotateZ(Math.PI / 2);
    const idlerRimGeo = new THREE.CylinderGeometry(0.35 * 0.76, 0.35 * 0.76, 0.175, 24);
    idlerRimGeo.rotateZ(Math.PI / 2);
    const idlerHubGeo = new THREE.CylinderGeometry(0.35 * 0.28, 0.35 * 0.32, 0.45, 14);
    idlerHubGeo.rotateZ(Math.PI / 2);

    const rollerTireGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.14, 20);
    rollerTireGeo.rotateZ(Math.PI / 2);
    const rollerRimGeo = new THREE.CylinderGeometry(0.16 * 0.76, 0.16 * 0.76, 0.155, 20);
    rollerRimGeo.rotateZ(Math.PI / 2);
    const rollerHubGeo = new THREE.CylinderGeometry(0.16 * 0.28, 0.16 * 0.32, 0.37, 12);
    rollerHubGeo.rotateZ(Math.PI / 2);

    const sprocketDrumGeo = new THREE.CylinderGeometry(0.39 * 0.78, 0.39 * 0.78, 0.34, 20);
    sprocketDrumGeo.rotateZ(Math.PI / 2);
    const sprocketRingGeo = new THREE.CylinderGeometry(0.39 * 0.88, 0.39 * 0.88, 0.04, 20);
    sprocketRingGeo.rotateZ(Math.PI / 2);
    const sprocketToothGeo = new THREE.BoxGeometry(0.04, 0.11, 0.07);

    // Track Link InstancedMesh Geometry
    const padGeo = new THREE.BoxGeometry(0.56, 0.045, 0.13);
    const grouserGeo = new THREE.BoxGeometry(0.58, 0.032, 0.035);
    grouserGeo.translate(0, -0.03, 0);
    const hornGeo = new THREE.BoxGeometry(0.04, 0.08, 0.05);
    hornGeo.translate(0, 0.04, 0);

    const mergedTrackLinkGeo = mergeFn ? mergeFn([padGeo, grouserGeo, hornGeo]) : padGeo;

    pershingGeometries = {
        hullGeo,
        bulgeGeo,
        hoodGeo,
        mgSocketGeo,
        bowBarrelGeo,
        lampBodyGeo,
        lampGuardGeo,
        slitLensGeo,
        shackleLGeo,
        shackleUGeo,
        grilleGeo,
        crateGeo,
        canisterGeo,
        fenderPlateGeo,
        frontHoodGeo,
        frontSkirtGeo,
        sideEdgeGeo,
        box1Geo,
        box2Geo,
        smallBoxGeo,
        collarGeo,
        mainDomeGeo,
        bustleGeo,
        bustleRoundGeo,
        mantletGeo,
        mantletCapGeo,
        sleeveGeo,
        barrelGeo,
        collarRingGeo,
        brakeBodyGeo,
        ventBoxGeo,
        boreGeo,
        coaxBarrelGeo,
        pintlePostGeo,
        m2ReceiverGeo,
        m2BarrelGeo,
        ammoBoxGeo,
        spadeGripsGeo,
        suspArmGeo,
        roadTireGeo,
        roadRimGeo,
        roadHubGeo,
        idlerTireGeo,
        idlerRimGeo,
        idlerHubGeo,
        rollerTireGeo,
        rollerRimGeo,
        rollerHubGeo,
        sprocketDrumGeo,
        sprocketRingGeo,
        sprocketToothGeo,
        mergedTrackLinkGeo
    };
    return pershingGeometries;
}

// ============================================================================
// 4. M26 PERSHING 3D MODEL CONSTRUCTION
// Natural TankClash orientation: +Z is Forward, -Z is Rear, +X is Right, -X is Left
// ============================================================================
function buildPershingTank(scene, mats, options = {}) {
    const H_OFF = 0.88; // Height offset aligning suspension with TankClash terrain physics

    const tankRoot = new THREE.Group();
    const sc = scene || (typeof window !== 'undefined' ? window.scene : null);
    if (sc && typeof sc.add === 'function') sc.add(tankRoot);

    const hullGroup = new THREE.Group();
    hullGroup.position.y = H_OFF;
    tankRoot.add(hullGroup);

    const isEnemy = !!options.isEnemy;
    const { materials } = getPershingSharedAssets(isEnemy);
    const geos = getPershingGeometries(H_OFF);

    function regPart(mesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    const roadWheelStations = { left: [], right: [] };
    const driveSprockets = [];
    const idlerWheels = [];
    const trackChains = {};
    const headlightLights = [];

    // ----------------------------------------------------------------------------
    // A. MAIN WELDED HULL & SLOPED GLACIS (+Z is Forward, -Z is Rear)
    // ----------------------------------------------------------------------------
    const hullChassis = new THREE.Group();
    hullGroup.add(hullChassis);

    const mainHullMesh = regPart(new THREE.Mesh(geos.hullGeo, materials.brownArmor));
    hullChassis.add(mainHullMesh);

    // Cast Front Glacis Bulges (Driver & Co-driver / Bow MG blisters on upper glacis at +Z)
    [-0.54, 0.54].forEach(xPos => {
        const bulge = regPart(new THREE.Mesh(geos.bulgeGeo, materials.castTurretArmor));
        bulge.position.set(xPos, 1.28 - H_OFF, 1.98);
        hullChassis.add(bulge);

        const hood = regPart(new THREE.Mesh(geos.hoodGeo, materials.brownArmor));
        hood.position.set(xPos, 1.58 - H_OFF, 1.52);
        hullChassis.add(hood);
    });

    // Bow .30 Cal Browning Machine Gun Ball Mount (Front Right / Starboard side)
    const bowMgGroup = new THREE.Group();
    bowMgGroup.position.set(0.54, 1.25 - H_OFF, 2.25);
    hullChassis.add(bowMgGroup);

    const mgSocket = regPart(new THREE.Mesh(geos.mgSocketGeo, materials.castTurretArmor));
    bowMgGroup.add(mgSocket);

    const bowMgBarrel = regPart(new THREE.Mesh(geos.bowBarrelGeo, materials.gunMetal));
    bowMgBarrel.position.set(0, 0, 0.23);
    bowMgGroup.add(bowMgBarrel);

    // Headlights on Front Glacis
    [-0.78, 0.78].forEach(xPos => {
        const lampGroup = new THREE.Group();
        lampGroup.position.set(xPos, 1.38 - H_OFF, 2.08);

        const body = regPart(new THREE.Mesh(geos.lampBodyGeo, materials.brownArmor));
        lampGroup.add(body);

        const guard = regPart(new THREE.Mesh(geos.lampGuardGeo, materials.brownArmor));
        guard.position.z = 0.04;
        lampGroup.add(guard);

        // Headlight Slit Lens
        const slitMesh = new THREE.Mesh(geos.slitLensGeo, materials.slitMat);
        slitMesh.position.z = 0.072;
        lampGroup.add(slitMesh);

        // Only add SpotLight for the player tank; omitting for enemies keeps the scene light count fixed across spawns!
        if (!options.isEnemy) {
            const spot = new THREE.SpotLight(0xfff6dd, 0, 55, Math.PI / 5, 0.35, 1.2);
            spot.position.set(0, 0, 0.12);
            spot.target.position.set(0, -0.15, 8.0);
            lampGroup.add(spot);
            lampGroup.add(spot.target);
            headlightLights.push({ spot, slitMat: materials.slitMat });
        }

        hullChassis.add(lampGroup);
    });

    // Four Heavy Front Tow Shackles / Lifting Eyes on Glacis
    [-0.42, 0.42].forEach(xPos => {
        const shackleL = regPart(new THREE.Mesh(geos.shackleLGeo, materials.brownArmor));
        shackleL.position.set(xPos, 0.96 - H_OFF, 2.52);
        shackleL.rotation.y = Math.PI / 2;
        hullChassis.add(shackleL);

        const shackleU = regPart(new THREE.Mesh(geos.shackleUGeo, materials.brownArmor));
        shackleU.position.set(xPos * 1.15, 1.24 - H_OFF, 2.22);
        shackleU.rotation.y = Math.PI / 2;
        hullChassis.add(shackleU);
    });

    // Front Glacis Decal ("VANGUARD" + White Star)
    const glacisDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), materials.glacisDecalMat);
    glacisDecal.position.set(0, 1.32 - H_OFF, 2.16);
    glacisDecal.rotation.x = -0.49;
    hullChassis.add(glacisDecal);

    // Rear Engine Deck Louvers / Grilles & Wooden Box (at -Z rear)
    for (let z = -0.7; z >= -2.3; z -= 0.38) {
        const grille = regPart(new THREE.Mesh(geos.grilleGeo, materials.trackSteel));
        grille.position.set(0, 1.61 - H_OFF, z);
        hullChassis.add(grille);
    }

    const crate = regPart(new THREE.Mesh(geos.crateGeo, materials.woodCrate));
    crate.position.set(0.62, 1.73 - H_OFF, -1.65);
    hullChassis.add(crate);

    const canister = regPart(new THREE.Mesh(geos.canisterGeo, materials.brownArmor));
    canister.position.set(-0.75, 1.68 - H_OFF, -1.85);
    hullChassis.add(canister);

    // ----------------------------------------------------------------------------
    // B. SIDE FENDERS, MUDGUARDS & STOWAGE BOXES
    // ----------------------------------------------------------------------------
    const fenderGroup = new THREE.Group();
    hullGroup.add(fenderGroup);

    [-1, 1].forEach(sideSign => {
        const xCenter = sideSign * 1.38;

        // Main Full-Length Horizontal Fender Plate
        const fenderPlate = regPart(new THREE.Mesh(geos.fenderPlateGeo, materials.brownArmor));
        fenderPlate.position.set(xCenter, 1.18 - H_OFF, 0.05);
        fenderGroup.add(fenderPlate);

        // Curved Front Mudguard Skirt over front idler wheel (+Z)
        const frontHood = regPart(new THREE.Mesh(geos.frontHoodGeo, materials.brownArmor));
        frontHood.position.set(xCenter, 0.85 - H_OFF, 2.48);
        frontHood.rotation.x = -0.25;
        fenderGroup.add(frontHood);

        // Front inner side skirt drop panel
        const frontSkirt = regPart(new THREE.Mesh(geos.frontSkirtGeo, materials.brownArmor));
        frontSkirt.position.set(sideSign * 1.71, 1.04 - H_OFF, 1.95);
        frontSkirt.rotation.x = -0.06;
        fenderGroup.add(frontSkirt);

        // Continuous side sand-shield lip along outer fender edge
        const sideEdge = regPart(new THREE.Mesh(geos.sideEdgeGeo, materials.brownArmor));
        sideEdge.position.set(sideSign * 1.70, 1.11 - H_OFF, 0.35);
        fenderGroup.add(sideEdge);

        // Fender Toolboxes
        const box1 = regPart(new THREE.Mesh(geos.box1Geo, materials.brownArmor));
        box1.position.set(xCenter, 1.31 - H_OFF, -0.72);
        fenderGroup.add(box1);

        const box2 = regPart(new THREE.Mesh(geos.box2Geo, materials.brownArmor));
        box2.position.set(xCenter, 1.31 - H_OFF, 0.18);
        fenderGroup.add(box2);

        // Row of 5 small ammunition boxes along mid-forward fender
        for (let i = 0; i < 5; i++) {
            const smallBox = regPart(new THREE.Mesh(geos.smallBoxGeo, materials.brownArmor));
            smallBox.position.set(sideSign * 1.48, 1.30 - H_OFF, 0.78 + i * 0.32);
            fenderGroup.add(smallBox);
        }

        // Side Skirt Decal ("ARMORED" + Stencil)
        const sideDecal = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.30), materials.skirtDecalMat);
        sideDecal.position.set(sideSign * 1.73, 1.10 - H_OFF, 1.05);
        sideDecal.rotation.y = sideSign > 0 ? Math.PI / 2 : -Math.PI / 2;
        fenderGroup.add(sideDecal);
    });

    // ----------------------------------------------------------------------------
    // C. CAST TURRET & 90MM M3 GUN
    // ----------------------------------------------------------------------------
    const turretPivot = new THREE.Group();
    turretPivot.position.set(0, 1.62 - H_OFF, 0.25);
    hullGroup.add(turretPivot);

    const collar = regPart(new THREE.Mesh(geos.collarGeo, materials.castTurretArmor));
    collar.position.y = 0.06;
    turretPivot.add(collar);

    const mainDome = regPart(new THREE.Mesh(geos.mainDomeGeo, materials.castTurretArmor));
    mainDome.position.set(0, 0.44, 0.06);
    turretPivot.add(mainDome);

    // Rear turret bustle counterweight overhang (at -Z)
    const bustle = regPart(new THREE.Mesh(geos.bustleGeo, materials.castTurretArmor));
    bustle.position.set(0, 0.48, -0.78);
    turretPivot.add(bustle);

    const bustleRound = regPart(new THREE.Mesh(geos.bustleRoundGeo, materials.castTurretArmor));
    bustleRound.position.set(0, 0.48, -1.22);
    turretPivot.add(bustleRound);

    // Turret side stowage racks & emblems
    [-1, 1].forEach(sideSign => {
        const rackGroup = new THREE.Group();
        rackGroup.position.set(sideSign * 0.99, 0.48, 0.05);
        rackGroup.rotation.y = sideSign * 0.08;
        rackGroup.rotation.z = sideSign * 0.12;

        const rackBarGeo = new THREE.BoxGeometry(0.08, 0.13, 0.64);
        const rackHornGeo = new THREE.BoxGeometry(0.13, 0.10, 0.06);
        for (let row = -1.5; row <= 1.5; row += 1) {
            const bar = regPart(new THREE.Mesh(rackBarGeo, materials.brownArmor));
            bar.position.set(0, row * 0.15, 0);
            rackGroup.add(bar);

            [-0.18, 0.18].forEach(zHorn => {
                const horn = regPart(new THREE.Mesh(rackHornGeo, materials.brownArmor));
                horn.position.set(sideSign * 0.03, row * 0.15, zHorn);
                rackGroup.add(horn);
            });
        }
        turretPivot.add(rackGroup);

        // Pistol port
        const portGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.10, 16);
        portGeo.rotateZ(Math.PI / 2);
        const port = regPart(new THREE.Mesh(portGeo, materials.castTurretArmor));
        port.position.set(sideSign * 0.88, 0.50, -0.68);
        port.rotation.y = -sideSign * 0.25;
        turretPivot.add(port);

        // Emblem decal
        const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), materials.emblemMat);
        emblem.position.set(sideSign * 0.72, 0.50, -1.10);
        emblem.rotation.y = sideSign > 0 ? Math.PI / 2 - 0.32 : -Math.PI / 2 + 0.32;
        turretPivot.add(emblem);
    });

    // Commander's Cupola with Periscopes (Rear-Right of roof)
    const cupolaGroup = new THREE.Group();
    cupolaGroup.position.set(-0.32, 0.96, -0.18);
    const cupolaBaseGeo = new THREE.CylinderGeometry(0.34, 0.38, 0.18, 20);
    const cupolaBase = regPart(new THREE.Mesh(cupolaBaseGeo, materials.castTurretArmor));
    cupolaGroup.add(cupolaBase);
    const cupolaLidGeo = new THREE.CylinderGeometry(0.28, 0.33, 0.08, 20);
    const cupolaLid = regPart(new THREE.Mesh(cupolaLidGeo, materials.brownArmor));
    cupolaLid.position.y = 0.11;
    cupolaGroup.add(cupolaLid);
    turretPivot.add(cupolaGroup);

    // Loader's Oval Hatch (Forward-Left of roof)
    const loaderHatchGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.07, 18);
    const loaderHatch = regPart(new THREE.Mesh(loaderHatchGeo, materials.brownArmor));
    loaderHatch.position.set(0.34, 0.94, 0.18);
    turretPivot.add(loaderHatch);

    // Canvas Cover Attaching Studs around mantlet opening
    const studGeo = new THREE.SphereGeometry(0.028, 6, 6);
    for (let xStud = -0.56; xStud <= 0.56; xStud += 0.14) {
        const stud = regPart(new THREE.Mesh(studGeo, materials.brownArmor));
        stud.position.set(xStud, 0.80, 0.98);
        turretPivot.add(stud);
    }

    // Roof Pintle-Mounted .50 Cal M2 Browning Heavy Machine Gun
    const browningGunGroup = new THREE.Group();
    browningGunGroup.position.set(-0.18, 0.98, -0.62);
    turretPivot.add(browningGunGroup);

    const pintlePost = regPart(new THREE.Mesh(geos.pintlePostGeo, materials.brownArmor));
    pintlePost.position.y = 0.24;
    browningGunGroup.add(pintlePost);

    const receiver = regPart(new THREE.Mesh(geos.m2ReceiverGeo, materials.gunMetal));
    receiver.position.set(0, 0.52, 0.06);
    browningGunGroup.add(receiver);

    const m2Barrel = regPart(new THREE.Mesh(geos.m2BarrelGeo, materials.gunMetal));
    m2Barrel.position.set(0, 0.53, 0.58);
    browningGunGroup.add(m2Barrel);

    const ammoBox = regPart(new THREE.Mesh(geos.ammoBoxGeo, materials.gunMetal));
    ammoBox.position.set(-0.16, 0.50, -0.02);
    browningGunGroup.add(ammoBox);

    const spadeGrips = regPart(new THREE.Mesh(geos.spadeGripsGeo, materials.gunMetal));
    spadeGrips.position.set(0, 0.52, -0.20);
    browningGunGroup.add(spadeGrips);

    // ----------------------------------------------------------------------------
    // D. HEAVY CAST M67 GUN MANTLET & 90MM M3 CANNON
    // ----------------------------------------------------------------------------
    const gunElevationPivot = new THREE.Group();
    gunElevationPivot.position.set(0, 0.48, 1.05);
    turretPivot.add(gunElevationPivot);

    const mantlet = regPart(new THREE.Mesh(geos.mantletGeo, materials.castTurretArmor));
    gunElevationPivot.add(mantlet);

    [-0.72, 0.72].forEach(xSide => {
        const cap = regPart(new THREE.Mesh(geos.mantletCapGeo, materials.brownArmor));
        cap.position.set(xSide, 0, 0);
        gunElevationPivot.add(cap);
    });

    const sleeve = regPart(new THREE.Mesh(geos.sleeveGeo, materials.castTurretArmor));
    sleeve.position.set(0, 0.02, 0.36);
    gunElevationPivot.add(sleeve);

    // Coaxial .30 cal MG port & barrel stub (+X side of mantlet)
    const coaxMuzzleRef = regPart(new THREE.Mesh(geos.coaxBarrelGeo, materials.gunMetal));
    coaxMuzzleRef.position.set(0.35, 0.02, 0.52);
    gunElevationPivot.add(coaxMuzzleRef);

    // Recoiling 90mm M3 Cannon Assembly
    const barrelRecoilGroup = new THREE.Group();
    gunElevationPivot.add(barrelRecoilGroup);

    const barrel = regPart(new THREE.Mesh(geos.barrelGeo, materials.brownArmor));
    barrel.position.set(0, 0.02, 2.35);
    barrelRecoilGroup.add(barrel);

    const collarRing = regPart(new THREE.Mesh(geos.collarRingGeo, materials.brownArmor));
    collarRing.position.set(0, 0.02, 4.18);
    barrelRecoilGroup.add(collarRing);

    // Double-Baffle Muzzle Brake
    const muzzleGroup = new THREE.Group();
    muzzleGroup.position.set(0, 0.02, 4.48);
    barrelRecoilGroup.add(muzzleGroup);

    const brakeBody = regPart(new THREE.Mesh(geos.brakeBodyGeo, materials.barrelMuzzleMat));
    muzzleGroup.add(brakeBody);

    [-0.08, 0.10].forEach(zVent => {
        const ventBox = new THREE.Mesh(geos.ventBoxGeo, materials.boreMat);
        ventBox.position.set(0, 0, zVent);
        muzzleGroup.add(ventBox);
    });

    const bore = new THREE.Mesh(geos.boreGeo, materials.boreMat);
    muzzleGroup.add(bore);

    // Main Gun Muzzle Tip
    const mainGunMuzzleTip = new THREE.Object3D();
    mainGunMuzzleTip.position.set(0, 0.02, 4.78);
    barrelRecoilGroup.add(mainGunMuzzleTip);

    // ----------------------------------------------------------------------------
    // E. SUSPENSION, WHEELS & ARTICULATED T80E1 TRACKS
    // ----------------------------------------------------------------------------
    function createRoadWheelAssembly(isIdler, isRoller) {
        const group = new THREE.Group();
        const sep = isRoller ? 0.09 : 0.12;

        const tireGeo = isRoller ? geos.rollerTireGeo : (isIdler ? geos.idlerTireGeo : geos.roadTireGeo);
        const rimGeo  = isRoller ? geos.rollerRimGeo  : (isIdler ? geos.idlerRimGeo  : geos.roadRimGeo);
        const hubGeo  = isRoller ? geos.rollerHubGeo  : (isIdler ? geos.idlerHubGeo  : geos.roadHubGeo);

        [-sep, sep].forEach(xOff => {
            const tire = regPart(new THREE.Mesh(tireGeo, materials.darkRubber));
            tire.position.x = xOff;
            group.add(tire);

            const rim = regPart(new THREE.Mesh(rimGeo, materials.brownArmor));
            rim.position.x = xOff;
            group.add(rim);
        });

        const hub = regPart(new THREE.Mesh(hubGeo, materials.brownArmor));
        group.add(hub);

        if (!isRoller) {
            const radius = isIdler ? 0.35 : 0.39;
            const boltGeo = new THREE.BoxGeometry(0.42, 0.035, 0.035);
            for (let b = 0; b < 6; b++) {
                const ang = (b / 6) * Math.PI * 2;
                const bolt = regPart(new THREE.Mesh(boltGeo, materials.trackSteel));
                bolt.position.set(0, Math.cos(ang) * radius * 0.52, Math.sin(ang) * radius * 0.52);
                group.add(bolt);
            }
        }
        return group;
    }

    function createDriveSprocketAssembly() {
        const group = new THREE.Group();
        const drum = regPart(new THREE.Mesh(geos.sprocketDrumGeo, materials.sprocketHub));
        group.add(drum);

        [-0.15, 0.15].forEach(xOff => {
            const ring = regPart(new THREE.Mesh(geos.sprocketRingGeo, materials.brownArmor));
            ring.position.x = xOff;
            group.add(ring);

            const numTeeth = 13;
            for (let t = 0; t < numTeeth; t++) {
                const angle = (t / numTeeth) * Math.PI * 2;
                const tooth = regPart(new THREE.Mesh(geos.sprocketToothGeo, materials.trackSteel));
                tooth.position.set(xOff, Math.cos(angle) * (0.39 + 0.02), Math.sin(angle) * (0.39 + 0.02));
                tooth.rotation.x = -angle;
                group.add(tooth);
            }
        });
        return group;
    }

    // 2D Track Loop Waypoints in (Z, Y): +Z is Front Idler, -Z is Rear Drive Sprocket
    const PERSHING_TRACK_WAYPOINTS = [
        new THREE.Vector2( 1.72, 0.08 - H_OFF),  // 0: Under 1st road wheel (front ground contact)
        new THREE.Vector2(-1.63, 0.08 - H_OFF),  // 1: Under 6th road wheel (rear ground contact)
        new THREE.Vector2(-2.35, 0.46 - H_OFF),  // 2: Sloping up to rear drive sprocket
        new THREE.Vector2(-2.74, 0.82 - H_OFF),  // 3: Rear-most edge of drive sprocket
        new THREE.Vector2(-2.35, 1.14 - H_OFF),  // 4: Top of rear drive sprocket
        new THREE.Vector2(-1.10, 1.12 - H_OFF),  // 5: Upper track run over rear return rollers
        new THREE.Vector2( 0.00, 1.12 - H_OFF),  // 6: Upper track run over mid return roller
        new THREE.Vector2( 1.15, 1.12 - H_OFF),  // 7: Upper track run over forward return roller
        new THREE.Vector2( 2.40, 1.12 - H_OFF),  // 8: Top of front idler
        new THREE.Vector2( 2.75, 0.80 - H_OFF),  // 9: Front-most nose of idler
        new THREE.Vector2( 2.38, 0.45 - H_OFF)   // 10: Sloping down to 1st road wheel
    ];

    const evaluateTrackPoint = function(sideKey, u) {
        const loop = PERSHING_TRACK_WAYPOINTS;
        const n = loop.length;
        let totalLen = 0;
        const segLens = [];
        for (let i = 0; i < n; i++) {
            const p0 = loop[i];
            const p1 = loop[(i + 1) % n];
            const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            segLens.push(d);
            totalLen += d;
        }

        const normU = ((u % 1.0) + 1.0) % 1.0;
        let targetDist = normU * totalLen;

        for (let i = 0; i < n; i++) {
            const segLen = segLens[i];
            if (targetDist <= segLen || i === n - 1) {
                const frac = segLen > 0 ? targetDist / segLen : 0;
                const p0 = loop[i];
                const p1 = loop[(i + 1) % n];
                const z = p0.x + (p1.x - p0.x) * frac;
                let y = p0.y + (p1.y - p0.y) * frac;

                // Terrain suspension deflection interpolation on bottom ground run
                const st = roadWheelStations[sideKey];
                if (st && st.length >= 2 && z <= 1.75 && z >= -1.75) {
                    const spanZ = 1.72 - (-1.63);
                    const normZ = THREE.MathUtils.clamp((1.72 - z) / spanZ, 0, 1);
                    const fIdx = normZ * (st.length - 1);
                    const i0 = Math.floor(fIdx);
                    const i1 = Math.min(st.length - 1, i0 + 1);
                    const f = fIdx - i0;
                    const offset = st[i0].currentOffset * (1.0 - f) + st[i1].currentOffset * f;
                    y += offset;
                }

                const dz = p1.x - p0.x;
                const dy = p1.y - p0.y;
                const pitch = Math.atan2(dy, -dz);
                return { z, y, pitch };
            }
            targetDist -= segLen;
        }
        return { z: loop[0].x, y: loop[0].y, pitch: 0 };
    };

    const numLinksPerSide = 74;

    ['left', 'right'].forEach(sideKey => {
        const sideSign = sideKey === 'left' ? -1 : 1;
        const xWheelCenter = sideSign * 1.36;

        // 6 Road Wheel Stations + Torsion Bar Arms
        const roadWheelZ = [1.72, 1.05, 0.38, -0.29, -0.96, -1.63];
        roadWheelZ.forEach((zPos) => {
            const arm = regPart(new THREE.Mesh(geos.suspArmGeo, materials.trackSteel));
            arm.position.set(sideSign * 1.12, 0.62 - H_OFF, zPos - 0.14);
            arm.rotation.x = -0.75;
            hullGroup.add(arm);

            const wheelAssembly = createRoadWheelAssembly(false, false);
            wheelAssembly.position.set(xWheelCenter, 0.45 - H_OFF, zPos);
            hullGroup.add(wheelAssembly);

            roadWheelStations[sideKey].push({
                cluster: wheelAssembly,
                spinGroup: wheelAssembly,
                baseY: 0.45 - H_OFF,
                currentOffset: 0,
                velocityY: 0,
                z: zPos,
                x: xWheelCenter
            });
        });

        // Front Raised Idler Wheel
        const idlerWheel = createRoadWheelAssembly(true, false);
        idlerWheel.position.set(xWheelCenter, 0.78 - H_OFF, 2.38);
        hullGroup.add(idlerWheel);
        idlerWheels.push({ mesh: idlerWheel, side: sideKey });

        // Rear Toothed Drive Sprocket
        const sprocketWheel = createDriveSprocketAssembly();
        sprocketWheel.position.set(xWheelCenter, 0.80 - H_OFF, -2.35);
        hullGroup.add(sprocketWheel);
        driveSprockets.push({ mesh: sprocketWheel, side: sideKey });

        // 5 Upper Return Rollers
        [-1.4, -0.7, 0.0, 0.7, 1.4].forEach(rZ => {
            const roller = createRoadWheelAssembly(false, true);
            roller.position.set(xWheelCenter, 0.98 - H_OFF, rZ);
            hullGroup.add(roller);
        });

        // Articulated Instanced Track Loop
        const trackInstMesh = new THREE.InstancedMesh(geos.mergedTrackLinkGeo, materials.trackSteel, numLinksPerSide);
        trackInstMesh.castShadow = true;
        trackInstMesh.receiveShadow = true;
        trackInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        hullGroup.add(trackInstMesh);

        trackChains[sideKey] = {
            instMesh: trackInstMesh,
            trackX: xWheelCenter,
            count: numLinksPerSide
        };
    });

    const dummyPershingLink = new THREE.Object3D();
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
                dummyPershingLink.position.set(trackX, pt.y, pt.z);
                dummyPershingLink.rotation.set(pt.pitch, 0, 0);
                dummyPershingLink.updateMatrix();
                chain.instMesh.setMatrixAt(i, dummyPershingLink.matrix);
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
        barrelRecoilGroup,
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

// Prewarm both player and enemy material caches immediately at script load
if (typeof document !== 'undefined') {
    try {
        getPershingSharedAssets(false);
        getPershingSharedAssets(true);
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.buildPershingTank = buildPershingTank;
    window.getPershingSharedAssets = getPershingSharedAssets;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildPershingTank, getPershingSharedAssets };
}
