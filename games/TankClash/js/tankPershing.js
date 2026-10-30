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
    const castHeightData = new Float32Array(size * size);

    let pSeed = 9261;
    function pRand() {
        pSeed = (pSeed * 16807) % 2147483647;
        return (pSeed - 1) / 2147483646;
    }

    // A. Multi-Frequency Fine Rolling Grain & High-Detail Surface Texture for Rolled Plate
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            const micro1 = Math.sin(x * 0.85) * Math.cos(y * 0.85) * 0.012;
            const micro2 = Math.sin(x * 1.95 + y * 1.45) * 0.008;
            const micro3 = Math.cos(x * 3.80 - y * 2.20) * 0.005;
            const rollingGrain = Math.sin(x * 0.55) * 0.006;
            heightData[idx] = 0.50 + micro1 + micro2 + micro3 + rollingGrain;

            // Cast steel base: organic sand-casting porosity and rough surface flow
            const castR1 = (Math.sin(x * 0.42 + y * 0.38) + Math.cos(x * 0.78 - y * 0.62)) * 0.024;
            const castR2 = (Math.sin(x * 2.2 - y * 1.8) * Math.cos(x * 1.7 + y * 2.3)) * 0.018;
            castHeightData[idx] = 0.50 + castR1 + castR2;
        }
    }

    // B. Cast Steel Heavy Pitting & Stippling (Orange-peel cast texture for Turret, Mantlet & Blisters)
    for (let i = 0; i < 64000; i++) {
        const x = Math.floor(pRand() * size);
        const y = Math.floor(pRand() * size);
        const val = (pRand() - 0.5) * 0.15;
        const idx = y * size + x;
        castHeightData[idx] = Math.max(0.12, Math.min(0.88, castHeightData[idx] + val));
        const nx = (x + 1) % size;
        const ny = (y + 1) % size;
        castHeightData[y * size + nx] = Math.max(0.12, Math.min(0.88, castHeightData[y * size + nx] + val * 0.52));
        castHeightData[ny * size + x] = Math.max(0.12, Math.min(0.88, castHeightData[ny * size + x] + val * 0.38));
    }

    // Fine stippling and micro-abrasions for rolled hull plate
    for (let i = 0; i < 32000; i++) {
        const x = Math.floor(pRand() * size);
        const y = Math.floor(pRand() * size);
        const val = (pRand() - 0.5) * 0.06;
        const idx = y * size + x;
        heightData[idx] = Math.max(0.2, Math.min(0.8, heightData[idx] + val));
    }

    // C. Realistic Multi-Tier Combat Scratches, Ricochet Gouges & Armor Abrasions
    const scratches = [];
    // 1. Major deep combat gouges (ricochets, sharp steel impacts)
    for (let s = 0; s < 30; s++) {
        scratches.push({
            x0: Math.floor(pRand() * size),
            y0: Math.floor(pRand() * size),
            angle: pRand() * Math.PI * 2,
            length: 32 + Math.floor(pRand() * 56),
            curvature: (pRand() - 0.5) * 0.04,
            depth: 0.16 + pRand() * 0.14,
            width: 2.2,
            isMajor: true
        });
    }
    // 2. Medium abrasions, tree branch and shrapnel scrapes
    for (let s = 0; s < 95; s++) {
        scratches.push({
            x0: Math.floor(pRand() * size),
            y0: Math.floor(pRand() * size),
            angle: pRand() * Math.PI * 2,
            length: 16 + Math.floor(pRand() * 28),
            curvature: (pRand() - 0.5) * 0.06,
            depth: 0.08 + pRand() * 0.08,
            width: 1.4,
            isMajor: false
        });
    }
    // 3. Fine hairline scratches (brush and field wear)
    for (let s = 0; s < 280; s++) {
        scratches.push({
            x0: Math.floor(pRand() * size),
            y0: Math.floor(pRand() * size),
            angle: pRand() * Math.PI * 2,
            length: 6 + Math.floor(pRand() * 16),
            curvature: (pRand() - 0.5) * 0.08,
            depth: 0.04 + pRand() * 0.04,
            width: 0.8,
            isMajor: false,
            isHairline: true
        });
    }

    // Carve 3D scratch grooves into heightData and castHeightData
    scratches.forEach(sc => {
        const steps = Math.floor(sc.length * 1.6);
        let cx = sc.x0, cy = sc.y0, curAngle = sc.angle;
        for (let step = 0; step < steps; step++) {
            cx += Math.cos(curAngle) * 0.7;
            cy += Math.sin(curAngle) * 0.7;
            curAngle += sc.curvature;
            const px = Math.floor((cx % size + size) % size);
            const py = Math.floor((cy % size + size) % size);
            const idx = py * size + px;

            heightData[idx] = Math.max(0.12, heightData[idx] - sc.depth);
            castHeightData[idx] = Math.max(0.10, castHeightData[idx] - sc.depth * 1.15);

            if (sc.isMajor) {
                // Raised pushed-metal lip along gouge edges
                const perpX = -Math.sin(curAngle);
                const perpY = Math.cos(curAngle);
                const lx1 = Math.floor((px + perpX * 1.5 + size) % size);
                const ly1 = Math.floor((py + perpY * 1.5 + size) % size);
                const lx2 = Math.floor((px - perpX * 1.5 + size) % size);
                const ly2 = Math.floor((py - perpY * 1.5 + size) % size);
                heightData[ly1 * size + lx1] = Math.min(0.95, heightData[ly1 * size + lx1] + sc.depth * 0.45);
                heightData[ly2 * size + lx2] = Math.min(0.95, heightData[ly2 * size + lx2] + sc.depth * 0.45);
                castHeightData[ly1 * size + lx1] = Math.min(0.95, castHeightData[ly1 * size + lx1] + sc.depth * 0.50);
                castHeightData[ly2 * size + lx2] = Math.min(0.95, castHeightData[ly2 * size + lx2] + sc.depth * 0.50);
            }
        }
    });

    // D. Heavy Beaded Weld Seams on Rolled Plates
    function drawFineWeld(x0, y0, x1, y1, width = 2.4) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        const steps = Math.floor(len * 2.8);
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const wobble = Math.sin(s * 1.3) * 0.45;
            const cx = Math.floor(x0 + dx * t + wobble);
            const cy = Math.floor(y0 + dy * t + wobble);
            for (let rx = -Math.ceil(width); rx <= Math.ceil(width); rx++) {
                for (let ry = -Math.ceil(width); ry <= Math.ceil(width); ry++) {
                    const px = (cx + rx + size) % size;
                    const py = (cy + ry + size) % size;
                    const dist = Math.hypot(rx, ry);
                    if (dist < width) {
                        const idx = py * size + px;
                        const bead = Math.cos(dist / width * Math.PI * 0.5) * 0.16 * (0.85 + Math.sin(s * 0.8) * 0.15);
                        heightData[idx] = Math.min(0.96, heightData[idx] + bead);
                    }
                }
            }
        }
    }
    drawFineWeld(14, 14, size - 14, 14, 2.5);
    drawFineWeld(size - 14, 14, size - 14, size - 14, 2.5);
    drawFineWeld(14, size - 14, size - 14, size - 14, 2.5);
    drawFineWeld(14, 14, 14, size - 14, 2.5);
    drawFineWeld(Math.floor(size * 0.38), 14, Math.floor(size * 0.38), size - 14, 2.2);
    drawFineWeld(14, Math.floor(size * 0.65), size - 14, Math.floor(size * 0.65), 2.2);

    // E. High-Definition Tangent-Space Sobel Normal Filter
    function computeSobelNormal(hData, strength) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(size, size);
        const data = img.data;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const xm = (x - 1 + size) % size;
                const xp = (x + 1) % size;
                const ym = (y - 1 + size) % size;
                const yp = (y + 1) % size;

                const tl = hData[ym * size + xm];
                const l  = hData[y  * size + xm];
                const bl = hData[yp * size + xm];
                const t  = hData[ym * size + x];
                const b  = hData[yp * size + x];
                const tr = hData[ym * size + xp];
                const r  = hData[y  * size + xp];
                const br = hData[yp * size + xp];

                const dX = ((tr + 2 * r + br) - (tl + 2 * l + bl)) * strength;
                const dY = ((bl + 2 * b + br) - (tl + 2 * t + tr)) * strength;
                const dZ = 1.0;

                const len = Math.hypot(dX, dY, dZ);
                const idx = (y * size + x) * 4;
                data[idx]     = Math.floor(((dX / len) * 0.5 + 0.5) * 255);
                data[idx + 1] = Math.floor(((-dY / len) * 0.5 + 0.5) * 255);
                data[idx + 2] = Math.floor(((dZ / len) * 0.5 + 0.5) * 255);
                data[idx + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    const normCanvas = computeSobelNormal(heightData, 2.2);
    const castNormCanvas = computeSobelNormal(castHeightData, 2.6);

    const normalTex = new THREE.CanvasTexture(normCanvas);
    const castNormalTex = new THREE.CanvasTexture(castNormCanvas);
    [normalTex, castNormalTex].forEach(t => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 2);
    });

    // F. Roughness Maps: PBR Matte Olive Drab finish with high-contrast scratches & burnished wear
    function computeRoughness(hData, isCast = false) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(size, size);
        for (let i = 0; i < img.data.length; i += 4) {
            const pixIdx = i / 4;
            const hVal = hData[pixIdx];
            let rVal = Math.max(130, Math.min(210, Math.floor(172 - (hVal - 0.50) * 85)));
            if (isCast) {
                rVal = Math.max(120, Math.min(220, Math.floor(164 - (hVal - 0.50) * 110)));
            }
            img.data[i] = img.data[i + 1] = img.data[i + 2] = rVal;
            img.data[i + 3] = 255;
        }

        // Apply low roughness (metallic sheen: 55-75) directly onto scratches
        scratches.forEach(sc => {
            const steps = Math.floor(sc.length * 1.6);
            let cx = sc.x0, cy = sc.y0, curAngle = sc.angle;
            for (let step = 0; step < steps; step++) {
                cx += Math.cos(curAngle) * 0.7;
                cy += Math.sin(curAngle) * 0.7;
                curAngle += sc.curvature;
                const px = Math.floor((cx % size + size) % size);
                const py = Math.floor((cy % size + size) % size);
                const p = (py * size + px) * 4;

                const sheen = sc.isMajor ? 58 : sc.isHairline ? 110 : 78;
                img.data[p] = img.data[p + 1] = img.data[p + 2] = sheen;
            }
        });

        ctx.putImageData(img, 0, 0);
        return c;
    }

    const roughCanvas = computeRoughness(heightData, false);
    const castRoughCanvas = computeRoughness(castHeightData, true);
    const roughTex = new THREE.CanvasTexture(roughCanvas);
    const castRoughTex = new THREE.CanvasTexture(castRoughCanvas);
    [roughTex, castRoughTex].forEach(t => {
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

    // Realistic combat scratches and paint chips cutting across decal stencil
    for (let sc = 0; sc < 48; sc++) {
        const sx = 140 + Math.random() * 230;
        const sy = 100 + Math.random() * 320;
        const sLen = 8 + Math.random() * 28;
        gCtx.fillStyle = 'rgba(30, 36, 24, 0.92)';
        gCtx.fillRect(sx, sy, sLen, 1.8);
        if (sc % 2 === 0) {
            gCtx.fillStyle = 'rgba(175, 178, 172, 0.78)';
            gCtx.fillRect(sx + 2, sy + 0.4, sLen * 0.65, 1.0);
        }
    }
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

    // Weathering scratches cutting across skirt markings
    for (let sc = 0; sc < 28; sc++) {
        const sx = 90 + Math.random() * 840;
        const sy = 25 + Math.random() * 80;
        const sLen = 6 + Math.random() * 24;
        skCtx.fillStyle = 'rgba(28, 33, 22, 0.90)';
        skCtx.fillRect(sx, sy, sLen, 1.6);
        if (sc % 2 === 0) {
            skCtx.fillStyle = 'rgba(165, 168, 164, 0.75)';
            skCtx.fillRect(sx + 1, sy + 0.3, sLen * 0.6, 1.0);
        }
    }
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

    // Scratches on turret emblem
    for (let sc = 0; sc < 18; sc++) {
        const sx = 60 + Math.random() * 135;
        const sy = 60 + Math.random() * 135;
        const sLen = 5 + Math.random() * 18;
        eCtx.fillStyle = 'rgba(26, 31, 20, 0.90)';
        eCtx.fillRect(sx, sy, sLen, 1.5);
    }
    const emblemTex = new THREE.CanvasTexture(emblemCanvas);

    pershingSharedBase = {
        heightData,
        castHeightData,
        scratches,
        normalTex,
        castNormalTex,
        roughTex,
        castRoughTex,
        crateTex,
        glacisDecalTex,
        skirtDecalTex,
        emblemTex
    };
    return pershingSharedBase;
}

// ============================================================================
// 2. MATERIALS & VARIANT ASSETS (Prewarmed for zero-lag enemy spawns)
//    Tone matching Tamiya 35254 Reference: Authentic US Army Olive Drab (0x5a6048)
// ============================================================================
function getPershingSharedAssets(isEnemy) {
    const key = isEnemy ? 'enemy' : 'player';
    if (pershingAssetCache[key]) return pershingAssetCache[key];

    const base = initPershingSharedBase();
    const size = 512;

    // Authentic WWII US Army Dark Olive Drab (Specification 3-1 / Tamiya XF-62, palette: 0x5a6048):
    // Deep military olive drab with muted low-reflectance armor tone
    const baseR = isEnemy ? 34 : 42;
    const baseG = isEnemy ? 40 : 48;
    const baseB = isEnemy ? 28 : 34;

    function buildAlbedo(hData, isCast = false) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(size, size);
        const data = img.data;

        for (let i = 0; i < data.length; i += 4) {
            const pixIdx = i / 4;
            const hVal = hData[pixIdx];
            const hDiff = (hVal - 0.50) * 22;
            const noise = (Math.random() - 0.5) * 5;

            // Micro-tonal variation across steel plate
            let r = Math.max(0, Math.min(255, Math.floor(baseR + hDiff + noise)));
            let g = Math.max(0, Math.min(255, Math.floor(baseG + hDiff * 1.05 + noise)));
            let b = Math.max(0, Math.min(255, Math.floor(baseB + hDiff * 0.78 + noise)));

            // Dark dirt wash in crevices / low cavities
            if (hVal < 0.45) {
                const cavity = (0.45 - hVal) * 75;
                r = Math.max(12, r - cavity);
                g = Math.max(14, g - cavity);
                b = Math.max(10, b - cavity * 0.8);
            }

            // Weld seam burnt oxide & rust wash
            if (!isCast && hVal > 0.68) {
                const rustFactor = Math.min(1.0, (hVal - 0.68) * 4.0);
                r = Math.floor(r * (1.0 - rustFactor * 0.3) + 48 * rustFactor * 0.3);
                g = Math.floor(g * (1.0 - rustFactor * 0.4) + 30 * rustFactor * 0.4);
                b = Math.floor(b * (1.0 - rustFactor * 0.4) + 20 * rustFactor * 0.4);
            }

            data[i]     = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
        }

        // Render exposed metallic steel scratches & gouges
        base.scratches.forEach(sc => {
            const steps = Math.floor(sc.length * 1.6);
            let cx = sc.x0, cy = sc.y0, curAngle = sc.angle;
            for (let step = 0; step < steps; step++) {
                cx += Math.cos(curAngle) * 0.7;
                cy += Math.sin(curAngle) * 0.7;
                curAngle += sc.curvature;
                const px = Math.floor((cx % size + size) % size);
                const py = Math.floor((cy % size + size) % size);
                const p = (py * size + px) * 4;

                // Bare metallic steel scratch core: bright silver glint
                const steelVal = sc.isMajor ? (175 + Math.floor(Math.random() * 25))
                               : sc.isHairline ? (115 + Math.floor(Math.random() * 18))
                               : (145 + Math.floor(Math.random() * 22));

                data[p]     = steelVal;
                data[p + 1] = Math.min(255, steelVal + 2);
                data[p + 2] = Math.min(255, steelVal + 4);

                // Flanking dark oxidized paint & red oxide primer rim along scratch edges
                if (sc.isMajor || !sc.isHairline) {
                    const perpX = -Math.sin(curAngle);
                    const perpY = Math.cos(curAngle);
                    [-1, 1].forEach(offset => {
                        const nx = Math.floor((px + perpX * offset + size) % size);
                        const ny = Math.floor((py + perpY * offset + size) % size);
                        const np = (ny * size + nx) * 4;

                        // Red oxide primer / dark oxidized border
                        data[np]     = Math.max(18, Math.min(52, Math.floor(data[np] * 0.55 + 16)));
                        data[np + 1] = Math.max(16, Math.floor(data[np + 1] * 0.45));
                        data[np + 2] = Math.max(12, Math.floor(data[np + 2] * 0.40));
                    });
                }
            }
        });

        ctx.putImageData(img, 0, 0);

        // Weathering grime, rain wash, and road dust gradients
        for (let s = 0; s < 35; s++) {
            const sx = Math.random() * size;
            const sy = Math.random() * size;
            const rad = 20 + Math.random() * 70;
            const grad = ctx.createRadialGradient(sx, sy, 2, sx, sy, rad);
            grad.addColorStop(0, 'rgba(24, 20, 16, 0.28)');
            grad.addColorStop(0.6, 'rgba(32, 28, 20, 0.12)');
            grad.addColorStop(1, 'rgba(42, 48, 34, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sx, sy, rad, 0, Math.PI * 2);
            ctx.fill();
        }

        // Vertical oil streaks and rain wash
        for (let str = 0; str < 18; str++) {
            const stX = Math.random() * size;
            const stY = Math.random() * (size * 0.4);
            const stLen = 30 + Math.random() * 90;
            const strGrad = ctx.createLinearGradient(stX, stY, stX, stY + stLen);
            strGrad.addColorStop(0, 'rgba(16, 13, 9, 0.52)');
            strGrad.addColorStop(0.5, 'rgba(24, 20, 14, 0.26)');
            strGrad.addColorStop(1, 'rgba(34, 40, 28, 0)');
            ctx.fillStyle = strGrad;
            ctx.fillRect(stX - 1, stY, 2 + Math.random() * 2, stLen);
        }

        return c;
    }

    const albedoCanvas = buildAlbedo(base.heightData, false);
    const castAlbedoCanvas = buildAlbedo(base.castHeightData, true);

    const albedoTex = new THREE.CanvasTexture(albedoCanvas);
    const castAlbedoTex = new THREE.CanvasTexture(castAlbedoCanvas);
    [albedoTex, castAlbedoTex].forEach(t => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 2);
    });

    // Muzzle Soot Barrel Texture
    const barrelCanvas = document.createElement('canvas');
    barrelCanvas.width = barrelCanvas.height = 256;
    const barCtx = barrelCanvas.getContext('2d');
    barCtx.drawImage(albedoCanvas, 0, 0, 256, 256);
    const sootGrad = barCtx.createLinearGradient(0, 0, 0, 256);
    sootGrad.addColorStop(0, '#0d0f0c');
    sootGrad.addColorStop(0.20, '#181b14');
    sootGrad.addColorStop(0.40, 'rgba(28, 34, 24, 0.45)');
    sootGrad.addColorStop(0.65, 'rgba(38, 44, 30, 0)');
    barCtx.fillStyle = sootGrad;
    barCtx.fillRect(0, 0, 256, 256);
    const barrelTex = new THREE.CanvasTexture(barrelCanvas);

    // Materials Palette matching Tamiya 35254 Pershing reference:
    // Color: #5a6048 (authentic semi-matte WWII US Army Olive Drab)
    const materials = {
        brownArmor: new THREE.MeshStandardMaterial({
            map: albedoTex,
            normalMap: base.normalTex,
            normalScale: new THREE.Vector2(0.65, 0.65),
            roughnessMap: base.roughTex,
            roughness: 0.62,
            metalness: 0.36,
            envMapIntensity: 0.45
        }),
        castTurretArmor: new THREE.MeshStandardMaterial({
            map: castAlbedoTex,
            normalMap: base.castNormalTex,
            normalScale: new THREE.Vector2(0.85, 0.85),
            roughnessMap: base.castRoughTex,
            roughness: 0.58,
            metalness: 0.40,
            envMapIntensity: 0.50
        }),
        darkRubber: new THREE.MeshStandardMaterial({
            color: 0x161718,
            roughness: 0.88,
            metalness: 0.08
        }),
        trackSteel: new THREE.MeshStandardMaterial({
            color: 0x2e2f2c,
            normalMap: base.normalTex,
            normalScale: new THREE.Vector2(0.50, 0.50),
            roughnessMap: base.roughTex,
            roughness: 0.52,
            metalness: 0.68
        }),
        gunMetal: new THREE.MeshStandardMaterial({
            color: 0x222426,
            roughness: 0.38,
            metalness: 0.82
        }),
        barrelMuzzleMat: new THREE.MeshStandardMaterial({
            color: isEnemy ? 0x242a1d : 0x5a6048,
            map: barrelTex,
            normalMap: base.normalTex,
            normalScale: new THREE.Vector2(0.50, 0.50),
            roughness: 0.58,
            metalness: 0.28
        }),
        sprocketHub: new THREE.MeshStandardMaterial({
            color: isEnemy ? 0x20281a : 0x2a3523,
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
