// ============================================================================
// TigerTank Shaders, Textures & Materials Palette
// High-Resolution Procedural PBR Maps: Rolled Homogeneous Armor (RHA),
// Flame-Cut Weld Seams, Edge Wear, Exhaust Soot, Mud Spatter, Decals & Grilles
// ============================================================================

function generateTankPBRMaps() {
    const size = 512;
    const albedoCanvas = document.createElement('canvas');
    const normalCanvas = document.createElement('canvas');
    const aoCanvas     = document.createElement('canvas');
    const roughCanvas  = document.createElement('canvas');

    albedoCanvas.width = normalCanvas.width = aoCanvas.width = roughCanvas.width = size;
    albedoCanvas.height = normalCanvas.height = aoCanvas.height = roughCanvas.height = size;

    const aCtx = albedoCanvas.getContext('2d');
    const nCtx = normalCanvas.getContext('2d');
    const aoCtx = aoCanvas.getContext('2d');
    const rCtx = roughCanvas.getContext('2d');

    const heightField = new Float32Array(size * size);

    // 1. Generate Heavy Rolled Steel Micro-Pitting & Rolled Grain
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            // High frequency rolled steel grain + low frequency plate waviness
            const wave = Math.sin(x * 0.08) * Math.cos(y * 0.08) * 0.08;
            const grain = (Math.sin(x * 0.45 + y * 0.2) * Math.cos(y * 0.5 - x * 0.15) * 0.18);
            const noise = (Math.random() - 0.5) * 0.14;
            heightField[idx] = 0.5 + wave + grain + noise;
        }
    }

    // 2. Add Authentic Heavy Interlocking Armor Weld Seams (Krupp stepped welds)
    function drawWeldSeam(x0, y0, x1, y1) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        const steps = Math.floor(len * 1.5);
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const cx = Math.floor(x0 + dx * t + (Math.random() - 0.5) * 3);
            const cy = Math.floor(y0 + dy * t + (Math.random() - 0.5) * 3);
            for (let rx = -4; rx <= 4; rx++) {
                for (let ry = -4; ry <= 4; ry++) {
                    const px = (cx + rx + size) % size;
                    const py = (cy + ry + size) % size;
                    const dist = Math.hypot(rx, ry);
                    if (dist < 4.5) {
                        const idx = py * size + px;
                        const bead = Math.cos(dist / 4.5 * Math.PI * 0.5) * (0.28 + Math.random() * 0.12);
                        heightField[idx] = Math.min(1.0, heightField[idx] + bead);
                    }
                }
            }
        }
    }

    // Heavy plate weld lines on the texture layout
    drawWeldSeam(12, 12, size - 12, 12);
    drawWeldSeam(size - 12, 12, size - 12, size - 12);
    drawWeldSeam(12, size - 12, size - 12, size - 12);
    drawWeldSeam(12, 12, 12, size - 12);
    drawWeldSeam(size * 0.45, 12, size * 0.45, size - 12);

    // 3. Paint Albedo (Authentic RAL 7021 Dunkelgrau with tonal modulation & weathering)
    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const aoImg = aoCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
        const verticalGrime = Math.sin(y * 0.06) * 4.0 + (y / size) * 8.0; // slight grime toward lower hull
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            const h = heightField[i];
            const pIndex = i * 4;

            // Base Dunkelgrau color (Authentic German Panzer Dark Grey)
            let r = 86 + (h - 0.5) * 28 - verticalGrime * 0.5;
            let g = 96 + (h - 0.5) * 28 - verticalGrime * 0.4;
            let b = 108 + (h - 0.5) * 32 - verticalGrime * 0.3;

            // Edge chipping & exposed dark oxidized steel where welds / edges protrude
            if (h > 0.68) {
                // Weld bead bright edge / dark heat oxidation
                r = 60 + Math.random() * 15;
                g = 64 + Math.random() * 15;
                b = 70 + Math.random() * 18;
            }

            // Subtle vertical rain streaks (subtle moisture leaching down Dunkelgrau paint)
            const streak = Math.sin(x * 0.6) * Math.sin(x * 1.8 + y * 0.05);
            if (streak > 0.85) {
                const darkening = (streak - 0.85) * 35;
                r = Math.max(20, r - darkening);
                g = Math.max(22, g - darkening);
                b = Math.max(25, b - darkening);
            }

            aImg.data[pIndex + 0] = Math.min(255, Math.max(0, Math.floor(r)));
            aImg.data[pIndex + 1] = Math.min(255, Math.max(0, Math.floor(g)));
            aImg.data[pIndex + 2] = Math.min(255, Math.max(0, Math.floor(b)));
            aImg.data[pIndex + 3] = 255;

            // Roughness Map (Matte rolled paint with slightly glossier bare steel scratches)
            let rough = 145 + Math.floor((1.0 - h) * 60);
            if (h > 0.68) rough = 90; // exposed polished steel has lower roughness
            rImg.data[pIndex + 0] = rough;
            rImg.data[pIndex + 1] = rough;
            rImg.data[pIndex + 2] = rough;
            rImg.data[pIndex + 3] = 255;

            // Ambient Occlusion Map
            const aoVal = Math.min(255, Math.max(60, Math.floor(215 + (h - 0.5) * 80)));
            aoImg.data[pIndex + 0] = aoVal;
            aoImg.data[pIndex + 1] = aoVal;
            aoImg.data[pIndex + 2] = aoVal;
            aoImg.data[pIndex + 3] = 255;
        }
    }
    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    aoCtx.putImageData(aoImg, 0, 0);

    // 4. Compute High-Definition Sobel Tangent-Space Normal Map
    const nImg = nCtx.createImageData(size, size);
    const strength = 3.6;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const xm = (x - 1 + size) % size;
            const xp = (x + 1) % size;
            const ym = (y - 1 + size) % size;
            const yp = (y + 1) % size;

            const tl = heightField[ym * size + xm];
            const l  = heightField[y  * size + xm];
            const bl = heightField[yp * size + xm];
            const t  = heightField[ym * size + x];
            const b  = heightField[yp * size + x];
            const tr = heightField[ym * size + xp];
            const r  = heightField[y  * size + xp];
            const br = heightField[yp * size + xp];

            const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
            const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);

            let nx = -dX * strength;
            let ny = -dY * strength;
            let nz = 1.0;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            nx /= len; ny /= len; nz /= len;

            const idx = (y * size + x) * 4;
            nImg.data[idx + 0] = Math.floor((nx * 0.5 + 0.5) * 255);
            nImg.data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
            nImg.data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
            nImg.data[idx + 3] = 255;
        }
    }
    nCtx.putImageData(nImg, 0, 0);

    const makeTex = (canvas, repeat = 3) => {
        const t = new THREE.CanvasTexture(canvas);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        return t;
    };

    return {
        albedo: makeTex(albedoCanvas, 2),
        normal: makeTex(normalCanvas, 2.5),
        roughness: makeTex(roughCanvas, 2),
        ao: makeTex(aoCanvas, 1),
        albedoFine: makeTex(albedoCanvas, 4),
        normalFine: makeTex(normalCanvas, 5)
    };
}

// Organic Birch Bark Texture with black lenticels and horizontal knots
function createBirchBarkTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d');

    // Creamy silver-white paper bark background
    ctx.fillStyle = '#eaecee';
    ctx.fillRect(0, 0, 256, 512);

    // Subtle grayish bark grain
    for (let y = 0; y < 512; y++) {
        const shade = 220 + Math.floor(Math.sin(y * 0.12) * 15 + Math.random() * 15);
        ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 4})`;
        ctx.fillRect(0, y, 256, 1);
    }

    // Characteristic black horizontal lenticels / slits & ragged birch knots
    ctx.fillStyle = '#1c1f24';
    for (let i = 0; i < 90; i++) {
        const kx = Math.random() * 230;
        const ky = Math.random() * 500;
        const kw = 12 + Math.random() * 38;
        const kh = 2 + Math.random() * 4;
        ctx.fillRect(kx, ky, kw, kh);

        // Dark feathering around knots
        ctx.fillStyle = 'rgba(45, 49, 56, 0.45)';
        ctx.fillRect(kx - 3, ky - 1, kw + 6, kh + 2);
        ctx.fillStyle = '#1c1f24';
    }

    // Occasional large diamond-shaped peeling black scar
    for (let i = 0; i < 6; i++) {
        const sx = 20 + Math.random() * 200;
        const sy = 30 + Math.random() * 450;
        ctx.fillStyle = '#181b20';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 8);
        ctx.lineTo(sx + 14, sy);
        ctx.lineTo(sx, sy + 8);
        ctx.lineTo(sx - 14, sy);
        ctx.closePath();
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2);
    return tex;
}

// Weathered Pine Bark Texture with rough reddish-brown vertical plates
function createPineBarkTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#3a271d';
    ctx.fillRect(0, 0, 256, 256);

    // Vertical fissured bark plates
    for (let x = 0; x < 256; x += 12) {
        ctx.fillStyle = (x % 24 === 0) ? '#1f140e' : '#4e3323';
        ctx.fillRect(x, 0, 4, 256);
        for (let y = 0; y < 256; y += 8) {
            if (Math.random() < 0.6) {
                const shade = Math.floor(45 + Math.random() * 40);
                ctx.fillStyle = `rgb(${shade + 20}, ${shade}, ${shade - 15})`;
                ctx.fillRect(x + 2, y, 7, 6);
            }
        }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3);
    return tex;
}

// Procedural Pine Needle Cluster Texture for realistic conifer boughs
function createPineNeedleTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);

    // Deep spruce green needle sprays with translucent alpha
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 220; i++) {
        const x = 64 + (Math.random() - 0.5) * 80;
        const y = 64 + (Math.random() - 0.5) * 80;
        const angle = Math.atan2(y - 64, x - 64) + (Math.random() - 0.5) * 0.4;
        const len = 8 + Math.random() * 18;

        const g = 40 + Math.floor(Math.random() * 35);
        ctx.strokeStyle = `rgba(${Math.floor(g * 0.65)}, ${g + 18}, ${Math.floor(g * 0.7)}, 0.88)`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
}

// Procedural Soft Volumetric Particle Texture for Billowing Smoke & Fireballs
function createSmokeParticleTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.35, 'rgba(240, 240, 240, 0.82)');
    grad.addColorStop(0.70, 'rgba(200, 200, 200, 0.35)');
    grad.addColorStop(1.0, 'rgba(150, 150, 150, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    // Organic billowing noise bumps on edges
    for (let i = 0; i < 18; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 25 + Math.random() * 22;
        const bx = 64 + Math.cos(ang) * rad;
        const by = 64 + Math.sin(ang) * rad;
        const bGrad = ctx.createRadialGradient(bx, by, 0, bx, by, 22);
        bGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        bGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.arc(bx, by, 22, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    return tex;
}

// Procedural Oak / Ash Pioneer Tool Wood Handle Texture
function createWoodTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#8a5c36';
    ctx.fillRect(0, 0, 128, 256);

    // Wavy wood grain lines
    ctx.strokeStyle = '#5a381e';
    ctx.lineWidth = 1.5;
    for (let x = 6; x < 128; x += 9) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        for (let y = 0; y < 256; y += 16) {
            const ox = x + Math.sin(y * 0.05) * 4.5;
            ctx.lineTo(ox, y);
        }
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2);
    return tex;
}

function createTurretNumberDecalTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);

    // Authentic Wehrmacht stenciled tactical number "3818"
    ctx.font = '900 134px "Inter", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Weathered black outline with slight chipping
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(20, 24, 30, 0.88)';
    ctx.strokeText('3818', 256, 132);

    ctx.fillStyle = '#f8fafc';
    ctx.fillText('3818', 256, 132);

    // Subtle paint chipping across stencil
    ctx.fillStyle = 'rgba(86, 97, 109, 0.7)';
    for (let i = 0; i < 45; i++) {
        const cx = 110 + Math.random() * 290;
        const cy = 70 + Math.random() * 120;
        ctx.fillRect(cx, cy, 2 + Math.random() * 4, 2 + Math.random() * 3);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function createGrilleTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    // Deep dark interior cavity
    ctx.fillStyle = '#080a0d';
    ctx.fillRect(0, 0, 128, 128);

    // Heavy woven steel mesh grid with metallic highlights
    ctx.fillStyle = '#475569';
    for (let y = 4; y < 124; y += 8) {
        ctx.fillRect(0, y, 128, 2);
    }
    for (let x = 4; x < 124; x += 8) {
        ctx.fillRect(x, 0, 2, 128);
    }
    // High-specular wire cross highlights
    ctx.fillStyle = '#94a3b8';
    for (let y = 4; y < 124; y += 8) {
        for (let x = 4; x < 124; x += 8) {
            ctx.fillRect(x, y, 2, 2);
        }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
}

function createMaterials(pbrMaps, decal3818Tex, grilleTex) {
    if (!pbrMaps) pbrMaps = generateTankPBRMaps();
    if (!decal3818Tex) decal3818Tex = createTurretNumberDecalTexture();
    if (!grilleTex) grilleTex = createGrilleTexture();

    const woodTex = createWoodTexture();
    const birchBarkTex = createBirchBarkTexture();
    const pineBarkTex = createPineBarkTexture();
    const pineNeedleTex = createPineNeedleTexture();
    const smokeSpriteTex = createSmokeParticleTexture();

    return {
        // Authentic Dunkelgrau Rolled Homogeneous Armor
        armor: new THREE.MeshStandardMaterial({
            color: 0x5a6572,
            map: pbrMaps.albedo,
            normalMap: pbrMaps.normal,
            normalScale: new THREE.Vector2(0.55, 0.55),
            roughnessMap: pbrMaps.roughness,
            roughness: 0.50,
            metalness: 0.42,
            aoMap: pbrMaps.ao,
            aoMapIntensity: 0.75
        }),
        armorDark: new THREE.MeshStandardMaterial({
            color: 0x3d454f,
            map: pbrMaps.albedoFine,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.65, 0.65),
            roughness: 0.56,
            metalness: 0.48,
            aoMap: pbrMaps.ao,
            aoMapIntensity: 0.8
        }),
        barrelSteel: new THREE.MeshStandardMaterial({
            color: 0x47515c,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.4, 0.4),
            roughness: 0.38,
            metalness: 0.62
        }),
        muzzleBlack: new THREE.MeshStandardMaterial({
            color: 0x181c20, // Heat-scorched carbon soot black
            roughness: 0.65,
            metalness: 0.50
        }),
        rubberTire: new THREE.MeshStandardMaterial({
            color: 0x16181b, // Weathered German Buna-S synthetic rubber
            roughness: 0.88,
            metalness: 0.08
        }),
        trackSteel: new THREE.MeshStandardMaterial({
            color: 0x22262b, // Cast manganese steel with bright metallic guide horn wear
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.7, 0.7),
            roughness: 0.46,
            metalness: 0.78
        }),
        woodHandle: new THREE.MeshStandardMaterial({
            map: woodTex,
            roughness: 0.72,
            metalness: 0.04
        }),
        cableSteel: new THREE.MeshStandardMaterial({
            color: 0x333940,
            roughness: 0.42,
            metalness: 0.82
        }),
        grille: new THREE.MeshStandardMaterial({
            map: grilleTex,
            roughness: 0.55,
            metalness: 0.65
        }),
        decal3818: new THREE.MeshStandardMaterial({
            map: decal3818Tex,
            transparent: true,
            roughness: 0.52,
            metalness: 0.15,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2
        }),
        // Environment materials
        birchBark: new THREE.MeshStandardMaterial({
            map: birchBarkTex,
            roughness: 0.68,
            metalness: 0.05
        }),
        pineBark: new THREE.MeshStandardMaterial({
            map: pineBarkTex,
            roughness: 0.92,
            metalness: 0.02
        }),
        pineNeedles: new THREE.MeshStandardMaterial({
            color: 0x243b2a,
            map: pineNeedleTex,
            roughness: 0.82,
            metalness: 0.06
        }),
        birchLeaves: new THREE.MeshStandardMaterial({
            color: 0x587834,
            roughness: 0.78,
            metalness: 0.08
        }),
        // Particle sprite texture reference
        smokeSpriteTex: smokeSpriteTex
    };
}

window.generateTankPBRMaps = generateTankPBRMaps;
window.createBirchBarkTexture = createBirchBarkTexture;
window.createPineBarkTexture = createPineBarkTexture;
window.createPineNeedleTexture = createPineNeedleTexture;
window.createSmokeParticleTexture = createSmokeParticleTexture;
window.createWoodTexture = createWoodTexture;
window.createTurretNumberDecalTexture = createTurretNumberDecalTexture;
window.createGrilleTexture = createGrilleTexture;
window.createMaterials = createMaterials;
