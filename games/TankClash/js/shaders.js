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

    // Procedural Scratch Generation for Tiger I RHA Armor
    let tigerSeed = 5129;
    function tRand() {
        tigerSeed = (tigerSeed * 16807) % 2147483647;
        return (tigerSeed - 1) / 2147483646;
    }

    const tigerScratches = [];
    // 70 major scratches & glancing ricochet furrows
    for (let s = 0; s < 70; s++) {
        const x0 = Math.floor(tRand() * size);
        const y0 = Math.floor(tRand() * size);
        const angle = tRand() * Math.PI * 2;
        const length = 16 + tRand() * 60;
        const curvature = (tRand() - 0.5) * 0.04;
        tigerScratches.push({ x0, y0, angle, length, curvature, isMajor: true });
    }
    // 200 micro-scratches & abrasions
    for (let s = 0; s < 200; s++) {
        const x0 = Math.floor(tRand() * size);
        const y0 = Math.floor(tRand() * size);
        const angle = tRand() * Math.PI * 2;
        const length = 4 + tRand() * 14;
        tigerScratches.push({ x0, y0, angle, length, curvature: 0, isMajor: false });
    }

    // Etch 3D scratch grooves into heightField for Sobel normal map
    tigerScratches.forEach(sc => {
        const steps = Math.floor(sc.length * 1.5);
        let cx = sc.x0, cy = sc.y0, curAngle = sc.angle;
        for (let step = 0; step < steps; step++) {
            cx += Math.cos(curAngle) * 0.7;
            cy += Math.sin(curAngle) * 0.7;
            curAngle += sc.curvature;
            const px = Math.floor((cx % size + size) % size);
            const py = Math.floor((cy % size + size) % size);
            heightField[py * size + px] = Math.max(0.08, heightField[py * size + px] - (sc.isMajor ? 0.16 : 0.08));
        }
    });

    // 3. Raw Homogeneous Armor Steel (RHA) Micro-Texture (Achromatic Gunmetal Steel, Zero Color Cast)
    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const aoImg = aoCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
        const verticalGrime = Math.sin(y * 0.06) * 2.5 + (y / size) * 5.0; // subtle steel mill scale / oxidation
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            const h = heightField[i];
            const pIndex = i * 4;

            // Pure neutral cold steel grey (r ≈ g ≈ b) - genuine Krupp rolled armor steel
            let r = 122 + (h - 0.5) * 26 - verticalGrime * 0.4;
            let g = 125 + (h - 0.5) * 26 - verticalGrime * 0.4;
            let b = 130 + (h - 0.5) * 28 - verticalGrime * 0.3;

            // Edge chipping & exposed burnished steel where welds / edges protrude
            if (h > 0.68) {
                // Burnished steel edge / micro heat-tint
                r = 100 + Math.random() * 16;
                g = 103 + Math.random() * 16;
                b = 108 + Math.random() * 18;
            }

            // Subtle vertical steel weathering / oil drainage
            const streak = Math.sin(x * 0.6) * Math.sin(x * 1.8 + y * 0.05);
            if (streak > 0.85) {
                const darkening = (streak - 0.85) * 25;
                r = Math.max(40, r - darkening);
                g = Math.max(42, g - darkening);
                b = Math.max(48, b - darkening);
            }

            aImg.data[pIndex + 0] = Math.min(255, Math.max(0, Math.floor(r)));
            aImg.data[pIndex + 1] = Math.min(255, Math.max(0, Math.floor(g)));
            aImg.data[pIndex + 2] = Math.min(255, Math.max(0, Math.floor(b)));
            aImg.data[pIndex + 3] = 255;

            // Roughness Map (Machined rolled steel: smooth specular plates with micro-pitting)
            let rough = 110 + Math.floor((1.0 - h) * 45);
            if (h > 0.68) rough = 80; // burnished steel edge is smoother/shinier
            rImg.data[pIndex + 0] = rough;
            rImg.data[pIndex + 1] = rough;
            rImg.data[pIndex + 2] = rough;
            rImg.data[pIndex + 3] = 255;

            // Multi-scale structural crevice ambient occlusion (wide radii: 8, 18, 36 texels)
            const r1 = 8, r2 = 18, r3 = 36;
            const hN1 = heightField[((y - r1 + size) % size) * size + x];
            const hS1 = heightField[((y + r1) % size) * size + x];
            const hE1 = heightField[y * size + ((x + r1) % size)];
            const hW1 = heightField[y * size + ((x - r1 + size) % size)];
            const avg1 = (hN1 + hS1 + hE1 + hW1) * 0.25;

            const hN2 = heightField[((y - r2 + size) % size) * size + x];
            const hS2 = heightField[((y + r2) % size) * size + x];
            const hE2 = heightField[y * size + ((x + r2) % size)];
            const hW2 = heightField[y * size + ((x - r2 + size) % size)];
            const avg2 = (hN2 + hS2 + hE2 + hW2) * 0.25;

            const hN3 = heightField[((y - r3 + size) % size) * size + x];
            const hS3 = heightField[((y + r3) % size) * size + x];
            const hE3 = heightField[y * size + ((x + r3) % size)];
            const hW3 = heightField[y * size + ((x - r3 + size) % size)];
            const avg3 = (hN3 + hS3 + hE3 + hW3) * 0.25;

            // Broad-scale ambient occlusion factor
            const broadCavity = Math.max(0, (avg2 - h) * 1.6 + (avg3 - h) * 1.1);
            const fineCavity = Math.max(0, (avg1 - h) * 1.9);
            const totalCavity = (broadCavity * 0.65 + fineCavity * 0.35);

            // Large-scale structural ambient occlusion map
            const aoVal = Math.min(255, Math.max(120, Math.floor(242 - totalCavity * 100 + (h - 0.5) * 35)));
            aoImg.data[pIndex + 0] = aoVal;
            aoImg.data[pIndex + 1] = aoVal;
            aoImg.data[pIndex + 2] = aoVal;
            aoImg.data[pIndex + 3] = 255;
        }
    }

    // Render bright bare steel scratches & ricochet gouges
    tigerScratches.forEach(sc => {
        const steps = Math.floor(sc.length * 1.5);
        let cx = sc.x0, cy = sc.y0, curAngle = sc.angle;
        for (let step = 0; step < steps; step++) {
            cx += Math.cos(curAngle) * 0.7;
            cy += Math.sin(curAngle) * 0.7;
            curAngle += sc.curvature;
            const px = Math.floor((cx % size + size) % size);
            const py = Math.floor((cy % size + size) % size);
            const p = (py * size + px) * 4;

            const scratchBright = sc.isMajor ? (175 + Math.floor(tRand() * 25)) : (155 + Math.floor(tRand() * 20));
            aImg.data[p + 0] = scratchBright;
            aImg.data[p + 1] = scratchBright + 2;
            aImg.data[p + 2] = scratchBright + 5;

            // Polished metallic scratch groove has low roughness (sharp specular glint)
            rImg.data[p + 0] = 55;
            rImg.data[p + 1] = 55;
            rImg.data[p + 2] = 55;

            if (sc.isMajor) {
                [-1, 1].forEach(offset => {
                    const nx = Math.floor((px - Math.sin(curAngle) * offset + size) % size);
                    const ny = Math.floor((py + Math.cos(curAngle) * offset + size) % size);
                    const np = (ny * size + nx) * 4;
                    aImg.data[np + 0] = Math.max(45, aImg.data[np + 0] - 22);
                    aImg.data[np + 1] = Math.max(48, aImg.data[np + 1] - 22);
                    aImg.data[np + 2] = Math.max(54, aImg.data[np + 2] - 22);
                });
            }
        }
    });

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

    const makeTex = (canvas, repeat = 3, isSRGB = false) => {
        const t = new THREE.CanvasTexture(canvas);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        if (isSRGB) t.encoding = THREE.sRGBEncoding;
        return t;
    };

    return {
        albedo: makeTex(albedoCanvas, 2, true),
        normal: makeTex(normalCanvas, 2.5, false),
        roughness: makeTex(roughCanvas, 2, false),
        ao: makeTex(aoCanvas, 1, false),
        albedoFine: makeTex(albedoCanvas, 4, true),
        normalFine: makeTex(normalCanvas, 5, false)
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

// ============================================================================
// Low-Discrepancy 2D Halton Sequence (bases 2, 3) 64x64 Sampling Texture & Shader
// Replaces heavy alpha-blending with low-discrepancy Halton sampling.
// Zero GPU alpha-overdraw, zero framebuffer read-modify-write, full Early-Z.
// ============================================================================

function haltonRadicalInverse(index, base) {
    let f = 1.0;
    let r = 0.0;
    let i = index;
    while (i > 0) {
        f /= base;
        r += f * (i % base);
        i = Math.floor(i / base);
    }
    return r;
}

let _haltonPatternTexture = null;

function createHaltonPatternTexture() {
    if (_haltonPatternTexture) return _haltonPatternTexture;

    // High-resolution 64x64 grid = 4,096 continuous Halton threshold levels
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);

    const total = size * size;
    const occupied = new Uint8Array(total);
    let count = 0;
    let i = 1;

    while (count < total && i < 200000) {
        const x = Math.floor(haltonRadicalInverse(i, 2) * size);
        const y = Math.floor(haltonRadicalInverse(i, 3) * size);
        const idx = y * size + x;
        if (!occupied[idx]) {
            occupied[idx] = 1;
            const threshold = Math.floor(((count + 0.5) / total) * 255);
            const pIdx = idx * 4;
            imgData.data[pIdx]     = threshold;
            imgData.data[pIdx + 1] = threshold;
            imgData.data[pIdx + 2] = threshold;
            imgData.data[pIdx + 3] = 255;
            count++;
        }
        i++;
    }

    if (count < total) {
        for (let idx = 0; idx < total; idx++) {
            if (!occupied[idx]) {
                const threshold = Math.floor((count / total) * 255);
                const pIdx = idx * 4;
                imgData.data[pIdx]     = threshold;
                imgData.data[pIdx + 1] = threshold;
                imgData.data[pIdx + 2] = threshold;
                imgData.data[pIdx + 3] = 255;
                count++;
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    _haltonPatternTexture = tex;
    return tex;
}

// ============================================================================
// 64x64 Void-and-Cluster Blue Noise Matrix Generator (Robert Ulichney 1993)
// Mathematically isotropic with zero directional bias and seamless toroidal
// boundary conditions across both horizontal (X) and vertical (Y) seams.
// Completely eliminates horizontal scanline banding and edge discontinuities.
// ============================================================================
let _blueNoiseTexture = null;

function createBlueNoiseTexture() {
    if (_blueNoiseTexture) return _blueNoiseTexture;

    const size = 64;
    const total = size * size;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);

    // Standard Void-and-Cluster Gaussian energy filter (Ulichney 1993)
    // with toroidal wrapping across top, bottom, left, and right borders.
    const sigma = 1.9;
    const R = 7; // Truncation radius > 3.5 * sigma
    const lut = [];
    for (let y = -R; y <= R; y++) {
        for (let x = -R; x <= R; x++) {
            const d2 = x * x + y * y;
            lut.push({ dx: x, dy: y, w: Math.exp(-d2 / (2 * sigma * sigma)) });
        }
    }

    // Deterministic LCG pseudo-random generator for reproducible isotropic seeds
    let seedVal = 1337;
    function sRand() {
        seedVal = (seedVal * 16807) % 2147483647;
        return (seedVal - 1) / 2147483646;
    }

    const pattern = new Uint8Array(total);
    const energy = new Float32Array(total);

    function addEnergy(idx, mult, enArr) {
        const mx = idx % size;
        const my = Math.floor(idx / size);
        for (let k = 0; k < lut.length; k++) {
            const nx = (mx + lut[k].dx + size) % size;
            const ny = (my + lut[k].dy + size) % size;
            enArr[ny * size + nx] += mult * lut[k].w;
        }
    }

    // Phase I: Initial random minority pattern (~10% ones = 409 points)
    const M = Math.floor(total * 0.1);
    const ones = [];
    while (ones.length < M) {
        const idx = Math.floor(sRand() * total);
        if (!pattern[idx]) {
            pattern[idx] = 1;
            ones.push(idx);
            addEnergy(idx, 1, energy);
        }
    }

    // Phase I Relaxation: Iteratively replace the tightest cluster point with largest void
    for (let iter = 0; iter < 150; iter++) {
        let maxOnePos = 0, maxE = -1e9;
        for (let j = 0; j < ones.length; j++) {
            const idx = ones[j];
            if (energy[idx] > maxE) {
                maxE = energy[idx];
                maxOnePos = j;
            }
        }
        const maxIdx = ones[maxOnePos];
        pattern[maxIdx] = 0;
        addEnergy(maxIdx, -1, energy);

        let minIdx = -1, minE = 1e9;
        for (let i = 0; i < total; i++) {
            if (!pattern[i] && energy[i] < minE) {
                minE = energy[i];
                minIdx = i;
            }
        }

        pattern[minIdx] = 1;
        addEnergy(minIdx, 1, energy);
        ones[maxOnePos] = minIdx;

        if (maxIdx === minIdx) break; // Reached stable isotropic equilibrium
    }

    // Phase II: Rank remaining zeros from M to total - 1 (sequentially pick largest void)
    const ditherArray = new Uint8Array(total);
    const p2_pattern = new Uint8Array(pattern);
    const p2_energy = new Float32Array(energy);

    for (let rank = M; rank < total; rank++) {
        let minIdx = -1, minE = 1e9;
        for (let i = 0; i < total; i++) {
            if (!p2_pattern[i] && p2_energy[i] < minE) {
                minE = p2_energy[i];
                minIdx = i;
            }
        }
        p2_pattern[minIdx] = 1;
        ditherArray[minIdx] = Math.floor(((rank + 0.5) / total) * 255);
        addEnergy(minIdx, 1, p2_energy);
    }

    // Phase III: Rank initial ones from M - 1 down to 0 (sequentially pick tightest cluster)
    const p3_pattern = new Uint8Array(pattern);
    const p3_energy = new Float32Array(energy);
    const p3_ones = [...ones];

    for (let rank = M - 1; rank >= 0; rank--) {
        let maxOnePos = 0, maxE = -1e9;
        for (let j = 0; j < p3_ones.length; j++) {
            const idx = p3_ones[j];
            if (p3_energy[idx] > maxE) {
                maxE = p3_energy[idx];
                maxOnePos = j;
            }
        }
        const maxIdx = p3_ones[maxOnePos];
        p3_ones.splice(maxOnePos, 1);
        p3_pattern[maxIdx] = 0;
        ditherArray[maxIdx] = Math.floor(((rank + 0.5) / total) * 255);
        addEnergy(maxIdx, -1, p3_energy);
    }

    // Write pristine blue noise thresholds into texture
    for (let i = 0; i < total; i++) {
        const val = ditherArray[i];
        const pIdx = i * 4;
        imgData.data[pIdx]     = val;
        imgData.data[pIdx + 1] = val;
        imgData.data[pIdx + 2] = val;
        imgData.data[pIdx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    _blueNoiseTexture = tex;
    return tex;
}

// Global celestial lighting uniforms shared across shaders (dynamic day/night cycle)
const celestialLighting = {
    sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.4).normalize() },
    sunColor:     { value: new THREE.Color(0xfff1db) },
    skyColor:     { value: new THREE.Color(0x3a7bd5) },
    groundColor:  { value: new THREE.Color(0x3f4e3d) },
    time:         { value: 0.0 }
};
window.celestialLighting = celestialLighting;

// Procedural Multi-Lobed Volumetric Smoke Puff Geometry (Watertight Indexed Geodesic Manifold)
// 100% Shared Vertices & Averaged Smooth Normals — Zero Seams / Cracks on Vertex Inflation
let _volumetricSmokeGeo = null;

function buildWeldedGeodesicSphere(subdivisions) {
    const t = (1.0 + Math.sqrt(5.0)) / 2.0;
    const initialVerts = [
        [-1,  t,  0], [ 1,  t,  0], [-1, -t,  0], [ 1, -t,  0],
        [ 0, -1,  t], [ 0,  1,  t], [ 0, -1, -t], [ 0,  1, -t],
        [ t,  0, -1], [ t,  0,  1], [-t,  0, -1], [-t,  0,  1]
    ];
    let vertices = initialVerts.map(v => {
        const len = Math.hypot(v[0], v[1], v[2]);
        return [v[0] / len, v[1] / len, v[2] / len];
    });

    let faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];

    const midpointCache = new Map();
    function getMidpoint(p1, p2) {
        const key = p1 < p2 ? p1 + '_' + p2 : p2 + '_' + p1;
        if (midpointCache.has(key)) return midpointCache.get(key);
        const v1 = vertices[p1];
        const v2 = vertices[p2];
        const mx = v1[0] + v2[0];
        const my = v1[1] + v2[1];
        const mz = v1[2] + v2[2];
        const len = Math.hypot(mx, my, mz);
        const idx = vertices.length;
        vertices.push([mx / len, my / len, mz / len]);
        midpointCache.set(key, idx);
        return idx;
    }

    for (let s = 0; s < subdivisions; s++) {
        const newFaces = [];
        for (let i = 0; i < faces.length; i++) {
            const f = faces[i];
            const a = getMidpoint(f[0], f[1]);
            const b = getMidpoint(f[1], f[2]);
            const c = getMidpoint(f[2], f[0]);
            newFaces.push([f[0], a, c]);
            newFaces.push([f[1], b, a]);
            newFaces.push([f[2], c, b]);
            newFaces.push([a, b, c]);
        }
        faces = newFaces;
    }
    return { vertices, faces };
}

function createVolumetricSmokeGeometry() {
    if (_volumetricSmokeGeo) return _volumetricSmokeGeo;

    // Subdivided welded geodesic sphere (162 shared vertices, 320 indexed faces)
    const { vertices, faces } = buildWeldedGeodesicSphere(2);

    // 6 Primary billowing cloud lobe centers (asymmetric bulging puffs)
    const lobes = [
        { x:  0.55, y:  0.42, z:  0.22, r: 0.55 },
        { x: -0.52, y:  0.38, z:  0.32, r: 0.50 },
        { x:  0.08, y:  0.68, z: -0.42, r: 0.48 },
        { x: -0.32, y: -0.35, z:  0.48, r: 0.44 },
        { x:  0.42, y: -0.28, z: -0.38, r: 0.45 },
        { x:  0.02, y: -0.52, z:  0.15, r: 0.40 }
    ];

    const positions = new Float32Array(vertices.length * 3);

    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const nx = v[0];
        const ny = v[1];
        const nz = v[2];

        // Proximity displacement from billowing lobes
        let lobeDisp = 0.0;
        for (let j = 0; j < lobes.length; j++) {
            const lb = lobes[j];
            const dot = Math.max(0, nx * lb.x + ny * lb.y + nz * lb.z);
            lobeDisp += lb.r * Math.pow(dot, 2.2);
        }

        // Multi-frequency 3D sinusoidal turbulence for organic billowing ridges
        const turb = (
            Math.sin(nx * 3.4 + ny * 1.2) * Math.cos(nz * 3.1) * 0.14 +
            Math.cos(ny * 5.8 - nz * 2.5) * 0.08 +
            Math.sin(nx * 8.5 + nz * 7.1) * 0.04
        );

        const r = 1.0 + lobeDisp * 0.65 + turb;
        positions[i * 3]     = nx * r;
        positions[i * 3 + 1] = ny * r;
        positions[i * 3 + 2] = nz * r;
    }

    const indices = [];
    for (let i = 0; i < faces.length; i++) {
        indices.push(faces[i][0], faces[i][1], faces[i][2]);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    _volumetricSmokeGeo = geo;
    return geo;
}

// ============================================================================
// Band-Limited 64x64 Void-and-Cluster Blue Noise Volumetric Smoke Material
// Solid Opaque Core (Zero Grain) + Feathered Blue Noise Perimeter (Zero Hard Edge)
// Zero GPU alpha-overdraw, zero framebuffer read-modify-write, full Early-Z.
// ============================================================================

function createHaltonSmokeMaterial(colorHex = 0x94a3b8) {
    const blueNoiseTex = createBlueNoiseTexture();
    const color = (colorHex && colorHex.isColor) ? colorHex.clone() : new THREE.Color(colorHex);

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            diffuse:      { value: color },
            opacity:      { value: 0.88 },
            uAgeProgress: { value: 0.0 },
            ditherOffset: { value: new THREE.Vector2(0, 0) },
            blueNoiseMap: { value: blueNoiseTex },
            haltonMap:    { value: blueNoiseTex },
            uTime:        celestialLighting.time,
            sunDirection: celestialLighting.sunDirection,
            sunColor:     celestialLighting.sunColor,
            skyColor:     celestialLighting.skyColor,
            groundColor:  celestialLighting.groundColor
        },
        vertexShader: `
            uniform float uAgeProgress;
            uniform float uTime;
            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying vec3 vLocalPos;
            varying float vLobeDisplacement;

            void main() {
                vec3 pos = position;

                // Convective Expansion: hot smoke upper lobes billow outward dynamically
                float verticalExpand = smoothstep(-0.4, 0.75, pos.y);
                float swell = sin(clamp(uAgeProgress / 0.7, 0.0, 1.0) * 3.14159);
                pos.xyz += normal * (verticalExpand * 0.16 * swell);

                vNormal = normalize(normalMatrix * normal);
                vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
                vViewDir = -normalize(mvPos.xyz);
                vLocalPos = pos;
                vLobeDisplacement = length(pos);

                gl_Position = projectionMatrix * mvPos;
            }
        `,
        fragmentShader: `
            uniform vec3 diffuse;
            uniform float opacity;
            uniform float uAgeProgress;
            uniform vec2 ditherOffset;
            uniform sampler2D blueNoiseMap;
            uniform float uTime;
            uniform vec3 sunDirection;
            uniform vec3 sunColor;
            uniform vec3 skyColor;
            uniform vec3 groundColor;

            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying vec3 vLocalPos;
            varying float vLobeDisplacement;

            float hash(vec3 p) {
                p = fract(p * 0.1031);
                p += dot(p, p.yzx + 33.33);
                return fract((p.x + p.y) * p.z);
            }

            float noise(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float n000 = hash(i);
                float n100 = hash(i + vec3(1.0, 0.0, 0.0));
                float n010 = hash(i + vec3(0.0, 1.0, 0.0));
                float n110 = hash(i + vec3(1.0, 1.0, 0.0));
                float n001 = hash(i + vec3(0.0, 0.0, 1.0));
                float n101 = hash(i + vec3(1.0, 0.0, 1.0));
                float n011 = hash(i + vec3(0.0, 1.0, 1.0));
                float n111 = hash(i + vec3(1.0, 1.0, 1.0));
                float nx00 = mix(n000, n100, f.x);
                float nx10 = mix(n010, n110, f.x);
                float nx01 = mix(n001, n101, f.x);
                float nx11 = mix(n011, n111, f.x);
                float nxy0 = mix(nx00, nx10, f.y);
                float nxy1 = mix(nx01, nx11, f.y);
                return mix(nxy0, nxy1, f.z);
            }

            float fbmSmoke(vec3 p) {
                float v = 0.0;
                float a = 0.55;
                for (int i = 0; i < 2; i++) {
                    v += a * noise(p);
                    p = p * 2.12 + vec3(2.3, 1.7, 5.1);
                    a *= 0.48;
                }
                return v;
            }

            void main() {
                // 1. True Volumetric Ray Path Thickness (Eliminates the "solid object" look)
                float r = length(vLocalPos);
                float NdotV = clamp(dot(vNormal, vViewDir), 0.0, 1.0);
                
                // Path length through the cloud volume: thickest in center, fading smoothly to 0 at perimeter
                float pathThickness = sqrt(clamp(1.0 - pow(r / 1.72, 2.0), 0.0, 1.0)) * pow(NdotV, 0.55);

                // Multi-scale 3D fractal noise (convective billowing turbulence)
                float billowNoise = fbmSmoke(vLocalPos * 2.0 + vec3(0.0, uTime * 0.12, 0.0));
                float turbulentDensity = pathThickness * (0.65 + billowNoise * 0.55);

                // Dissipation decay as smoke ages over its lifecycle
                float lifeFactor = 1.0 - smoothstep(0.45, 1.0, uAgeProgress);
                float finalDensity = clamp(turbulentDensity * opacity * lifeFactor * 1.5, 0.0, 1.0);

                // 2. Smooth Volumetric Alpha Feathering (Zero stipple dots!)
                if (finalDensity < 0.015) discard;

                // 3. Maldive Henyey-Greenstein Dual-Lobe Scattering on Surviving Fragments
                float cosTheta = dot(-vViewDir, sunDirection);
                float g1 = 0.65;
                float hgForward = (1.0 - g1 * g1) / pow(1.0 + g1 * g1 - 2.0 * g1 * cosTheta, 1.5) / 12.56637;
                float g2 = -0.22;
                float hgBack = (1.0 - g2 * g2) / pow(1.0 + g2 * g2 - 2.0 * g2 * cosTheta, 1.5) / 12.56637;
                float hgPhase = mix(hgForward, hgBack, 0.28) * 3.14159;

                // 4. Half-Lambert Wrap Lighting
                float NdotL = dot(vNormal, sunDirection);
                float wrapL = clamp((NdotL + 0.52) / 1.52, 0.0, 1.0);

                // Crevice self-shadowing
                float creviceAO = clamp((vLobeDisplacement - 0.72) / 0.58, 0.0, 1.0);
                float selfShadow = mix(0.45, 1.0, creviceAO);

                vec3 directLight = sunColor * (wrapL * 0.82 + hgPhase * 0.45) * selfShadow;

                // 5. Multi-Hemisphere Ambient Lighting (Sky above, Ground below)
                float upFactor = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
                vec3 ambientLight = mix(groundColor * 0.65, skyColor * 0.75, upFactor);

                // 6. Backlight Forward Scattering Rim Glow
                float rim = pow(1.0 - NdotV, 2.5);
                vec3 rimGlow = sunColor * rim * (hgPhase * 0.65 + 0.25);

                vec3 finalColor = diffuse * (directLight + ambientLight) + rimGlow;
                float smoothAlpha = clamp(smoothstep(0.015, 0.65, finalDensity) * 0.85, 0.0, 0.88);

                gl_FragColor = vec4(finalColor, smoothAlpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending
    });

    Object.defineProperty(mat, 'opacity', {
        get() { return this.uniforms.opacity.value; },
        set(v) { this.uniforms.opacity.value = v; }
    });

    Object.defineProperty(mat, 'color', {
        get() { return this.uniforms.diffuse.value; },
        set(v) {
            if (typeof v === 'number') this.uniforms.diffuse.value.setHex(v);
            else if (v && v.isColor) this.uniforms.diffuse.value.copy(v);
        }
    });

    return mat;
}

const createMaldiveSmokeMaterial = createHaltonSmokeMaterial;
const createOpaqueVolumetricSmokeMaterial = createHaltonSmokeMaterial;
const createBlueNoiseSmokeMaterial = createHaltonSmokeMaterial;

// ============================================================================
// Realistic 3D Grass Blade Tuft Geometry & Botanical Shader
// ============================================================================

let _grassTuftGeo = null;

function createGrassTuftGeometry() {
    if (_grassTuftGeo) return _grassTuftGeo;

    const geo = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const indices = [];

    // 3 intersecting blades curved outward into a natural tuft
    const bladeAngles = [0, Math.PI / 3, Math.PI * 2 / 3];
    let vertOffset = 0;

    bladeAngles.forEach((ang) => {
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const wBase = 0.085;
        const wMid  = 0.052;
        const hMid  = 0.28;
        const hTip  = 0.55;
        const lean  = 0.12;

        // Base 2 vertices
        positions.push(-cosA * wBase, 0.0, -sinA * wBase);
        uvs.push(0.0, 0.0);

        positions.push(cosA * wBase, 0.0, sinA * wBase);
        uvs.push(1.0, 0.0);

        // Mid 2 vertices (slight outward bend)
        const bendX = sinA * lean;
        const bendZ = -cosA * lean;
        positions.push(-cosA * wMid + bendX, hMid, -sinA * wMid + bendZ);
        uvs.push(0.0, 0.5);

        positions.push(cosA * wMid + bendX, hMid, sinA * wMid + bendZ);
        uvs.push(1.0, 0.5);

        // Tip 1 vertex (tapered point)
        positions.push(bendX * 1.8, hTip, bendZ * 1.8);
        uvs.push(0.5, 1.0);

        // 3 triangles per blade (2 for base quad, 1 for tip triangle)
        indices.push(
            vertOffset + 0, vertOffset + 1, vertOffset + 2,
            vertOffset + 2, vertOffset + 1, vertOffset + 3,
            vertOffset + 2, vertOffset + 3, vertOffset + 4
        );
        vertOffset += 5;
    });

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    _grassTuftGeo = geo;
    return geo;
}

function createGrassMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime:        celestialLighting.time,
            sunDirection: celestialLighting.sunDirection,
            sunColor:     celestialLighting.sunColor,
            skyColor:     celestialLighting.skyColor,
            groundColor:  celestialLighting.groundColor,
            rootColor:    { value: new THREE.Color(0x1a2712) }, // Dark fertile earth root
            midColor:     { value: new THREE.Color(0x3e5723) }, // Vibrant wild meadow green
            tipColor:     { value: new THREE.Color(0x7c9938) }  // Sunlit golden-olive tip
        },
        vertexShader: `
            uniform float uTime;
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            varying vec3 vViewDir;

            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);

                vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
                vWorldPos = worldPos.xyz;
                vViewDir = cameraPosition - vWorldPos;

                // Natural wind sway on upper blade (scaled by uv.y)
                float swayH = pow(uv.y, 1.4);
                float sway1 = sin(uTime * 2.3 + worldPos.x * 0.45 + worldPos.z * 0.35) * 0.14 * swayH;
                float sway2 = cos(uTime * 1.7 + worldPos.z * 0.55) * 0.09 * swayH;

                vec3 transformed = position;
                transformed.x += sway1;
                transformed.z += sway2;

                gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 rootColor;
            uniform vec3 midColor;
            uniform vec3 tipColor;
            uniform vec3 sunDirection;
            uniform vec3 sunColor;
            uniform vec3 skyColor;

            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            varying vec3 vViewDir;

            void main() {
                // Vertical botanical gradient from damp roots to golden sunlit tips
                vec3 bladeColor = mix(rootColor, mix(midColor, tipColor, smoothstep(0.35, 1.0, vUv.y)), smoothstep(0.0, 0.35, vUv.y));

                // Warm sunlight subsurface scattering, strictly on blade edges (grazing Fresnel silhouette)
                vec3 viewNorm = normalize(vViewDir);
                float fresnel = pow(1.0 - abs(dot(vNormal, viewNorm)), 2.2);
                vec3 sunDir = normalize(sunDirection);
                float backLight = pow(max(dot(-viewNorm, sunDir), 0.0), 2.2);
                vec3 sss = sunColor * backLight * fresnel * smoothstep(0.15, 1.0, vUv.y) * 0.75;
                
                vec3 finalColor = bladeColor * (skyColor * 0.38 + 0.30) + sss;

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
        side: THREE.DoubleSide
    });
}

// ============================================================================
// Realistic River Water Shader with Flowing Currents, Caustics & Bank Foam
// ============================================================================

function createRiverWaterMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime:        celestialLighting.time,
            sunDirection: celestialLighting.sunDirection,
            sunColor:     celestialLighting.sunColor,
            skyColor:     celestialLighting.skyColor
        },
        vertexShader: `
            uniform float uTime;
            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying float vShoreDist;

            void main() {
                float flow = uTime * 0.35;
                float wave1 = sin((position.x + flow * 2.2) * 0.55 + position.z * 0.35) * 0.038;
                float wave2 = cos((position.x - flow * 1.4) * 0.95 + position.z * 0.75) * 0.022;

                vec3 pos = position;
                pos.y += wave1 + wave2;

                vec4 worldPos = modelMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos.xyz;
                vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                vViewDir = normalize(cameraPosition - worldPos.xyz);
                vShoreDist = 13.0 - abs(position.z);

                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 sunDirection;
            uniform vec3 sunColor;
            uniform vec3 skyColor;

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying float vShoreDist;

            void main() {
                vec2 uv1 = vWorldPos.xz * 0.22 + vec2(uTime * 0.14, uTime * 0.03);
                vec2 uv2 = vWorldPos.xz * 0.38 - vec2(uTime * 0.08, -uTime * 0.06);

                vec3 n1 = vec3(sin(uv1.x * 14.0) * 0.18, 1.0, cos(uv1.y * 14.0) * 0.18);
                vec3 n2 = vec3(cos(uv2.x * 18.0) * 0.14, 1.0, sin(uv2.y * 18.0) * 0.14);
                vec3 waveNormal = normalize(vNormal + n1 * 0.45 + n2 * 0.45);

                float NdotV = max(dot(waveNormal, vViewDir), 0.0);
                float fresnel = clamp(pow(1.0 - NdotV, 3.2), 0.12, 0.96);

                float depthFactor = clamp(vShoreDist / 7.5, 0.0, 1.0);
                vec3 shallowCol = vec3(0.18, 0.38, 0.36);
                vec3 deepCol    = vec3(0.06, 0.18, 0.26);
                vec3 waterBase  = mix(shallowCol, deepCol, depthFactor);

                vec3 reflectSky = mix(skyColor * 0.85, vec3(0.92, 0.96, 1.0), fresnel);

                vec3 halfVec = normalize(sunDirection + vViewDir);
                float spec = pow(max(dot(waveNormal, halfVec), 0.0), 96.0);
                vec3 specGlint = sunColor * spec * 2.4;

                float foamNoise = sin(vWorldPos.x * 3.5 + uTime * 2.2) * cos(vWorldPos.z * 4.2);
                float shoreFoam = smoothstep(1.3, 0.1, vShoreDist) * clamp(0.5 + 0.5 * foamNoise, 0.0, 1.0);
                vec3 foamColor = vec3(0.94, 0.97, 0.99);

                vec3 finalColor = mix(waterBase, reflectSky, fresnel) + specGlint;
                finalColor = mix(finalColor, foamColor, shoreFoam * 0.75);

                gl_FragColor = vec4(finalColor, 0.88);
            }
        `,
        transparent: true,
        depthWrite: false
    });
}

// ============================================================================
// Photorealistic Coastal Seaside Ocean Shader
// Features:
// - Exact GPU Bathymetry Depth (1:1 terrain height evaluation for contour surf)
// - Multi-Directional Gerstner Swells + Rotated Multi-Octave Capillary Normals
// - Subsurface Wave Crest Scattering, Turquoise Shallows & Deep Sapphire Sea
// - Rhythmic Contour-Following Shore Breakers, Cellular Foam Lace & Sun Glitter
// ============================================================================
function createCoastalOceanMaterial(seedOffsetVec, roadBaseXVal) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime:        celestialLighting.time,
            sunDirection: celestialLighting.sunDirection,
            sunColor:     celestialLighting.sunColor,
            skyColor:     celestialLighting.skyColor,
            uSeedOffset:  { value: seedOffsetVec || new THREE.Vector2(0, 0) },
            uRoadBaseX:   { value: roadBaseXVal || 0.0 }
        },
        vertexShader: `
            uniform float uTime;
            uniform vec2 uSeedOffset;
            uniform float uRoadBaseX;

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying float vWaveHeight;
            varying float vCrestFactor;

            void addGerstnerWave(vec2 dir, float steepness, float wavelength, float speed, vec2 xz, float t, inout vec3 disp, inout vec3 tangent, inout vec3 binormal, inout float crest) {
                float k = 6.2831853 / wavelength;
                float c = sqrt(9.81 / k) * speed;
                float theta = k * (dot(dir, xz) - c * t);
                float a = steepness / k;
                float s = sin(theta);
                float cs = cos(theta);

                disp.x += dir.x * (a * cs);
                disp.y += a * s;
                disp.z += dir.y * (a * cs);

                float wa = k * a;
                tangent.y  += dir.x * wa * cs;
                binormal.y += dir.y * wa * cs;
                crest += wa * max(0.0, s);
            }

            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vec2 xz = wp.xz;
                float t = uTime;

                vec3 disp = vec3(0.0);
                vec3 tangent = vec3(1.0, 0.0, 0.0);
                vec3 binormal = vec3(0.0, 0.0, 1.0);
                float crest = 0.0;

                // Multi-directional coastal swell rolling in from the open sea (+Z toward -Z coast)
                addGerstnerWave(normalize(vec2( 0.24, -0.97)), 0.14, 68.0, 1.05, xz, t, disp, tangent, binormal, crest);
                addGerstnerWave(normalize(vec2(-0.35, -0.94)), 0.11, 42.0, 1.15, xz, t + 1.7, disp, tangent, binormal, crest);
                addGerstnerWave(normalize(vec2( 0.52, -0.85)), 0.09, 26.0, 1.25, xz, t + 3.1, disp, tangent, binormal, crest);
                addGerstnerWave(normalize(vec2(-0.61, -0.79)), 0.07, 22.0, 1.38, xz, t + 4.8, disp, tangent, binormal, crest);

                // Smoothly attenuate vertical wave displacement near the shoreline so waves kiss the beach cleanly
                float shoreDamp = smoothstep(175.0, 255.0, wp.z);
                wp.xyz += disp * (0.18 + 0.82 * shoreDamp);

                vWorldPos = wp.xyz;
                vNormal = normalize(cross(binormal, tangent));
                vViewDir = normalize(cameraPosition - wp.xyz);
                vWaveHeight = disp.y * shoreDamp;
                vCrestFactor = crest * shoreDamp;

                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 sunDirection;
            uniform vec3 sunColor;
            uniform vec3 skyColor;
            uniform vec2 uSeedOffset;
            uniform float uRoadBaseX;

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying float vWaveHeight;
            varying float vCrestFactor;

            float mod289_o(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289_o(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            float permute_o(float x) { return mod289_o(((x * 34.0) + 1.0) * x); }

            float hash2D_o(vec2 p) {
                vec2 ip = floor(p);
                return permute_o(permute_o(ip.x) + ip.y) * (1.0 / 288.0);
            }

            float valueNoise2D_o(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                float a = hash2D_o(i);
                float b = hash2D_o(i + vec2(1.0, 0.0));
                float c = hash2D_o(i + vec2(0.0, 1.0));
                float d = hash2D_o(i + vec2(1.0, 1.0));
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
            }

            float fbm3_o(vec2 p) {
                float total = 0.0, freq = 1.0, amp = 1.0, maxVal = 0.0;
                for (int i = 0; i < 3; i++) {
                    total += valueNoise2D_o(p * freq) * amp;
                    maxVal += amp;
                    amp *= 0.45;
                    freq *= 2.1;
                }
                return total / maxVal;
            }

            float fbm4_o(vec2 p) {
                float total = 0.0, freq = 1.0, amp = 1.0, maxVal = 0.0;
                for (int i = 0; i < 4; i++) {
                    total += valueNoise2D_o(p * freq) * amp;
                    maxVal += amp;
                    amp *= 0.48;
                    freq *= 2.02;
                }
                return total / maxVal;
            }

            // Evaluate exact coastal seabed height matching terrain 1:1
            float getSeabedHeight(float x, float z) {
                vec2 s = vec2(x, z) + uSeedOffset;
                float rollingHills = fbm4_o(s * 0.0042) * 4.5;
                float mediumUndulation = fbm3_o(s * 0.016) * 1.8;
                float h = 6.8 + rollingHills + mediumUndulation;
                float coastalDist = z + (fbm3_o(s * 0.009) * 28.0);
                float coastalSlope = smoothstep(110.0, 360.0, coastalDist) * 12.8;
                float headland = smoothstep(60.0, 200.0, abs(x)) * smoothstep(60.0, 420.0, coastalDist) * 6.5;
                return h - coastalSlope + headland;
            }

            // Isotropic rotated multi-octave capillary wave heightfield (zero grid artifacts)
            const mat2 waveRot1 = mat2(0.80, -0.60, 0.60, 0.80);
            const mat2 waveRot2 = mat2(0.60,  0.80, -0.80, 0.60);

            float capillaryWaveField(vec2 xz, float t) {
                vec2 p1 = waveRot1 * (xz * 0.14) + vec2(t * 0.42, -t * 0.68);
                vec2 p2 = waveRot2 * (xz * 0.34) + vec2(-t * 0.55, -t * 0.48);
                vec2 p3 = waveRot1 * (xz * 0.82) + vec2(t * 0.95, t * 0.62);
                vec2 p4 = waveRot2 * (xz * 1.95) - vec2(t * 1.35, -t * 1.10);

                float w1 = valueNoise2D_o(p1);
                float w2 = valueNoise2D_o(p2);
                float w3 = valueNoise2D_o(p3);
                float w4 = valueNoise2D_o(p4);

                // Sharpen wave crests slightly
                return (w1 - 0.22 * abs(w1)) * 0.48
                     + (w2 - 0.20 * abs(w2)) * 0.28
                     + w3 * 0.16
                     + w4 * 0.08;
            }

            void main() {
                float seabedY = getSeabedHeight(vWorldPos.x, vWorldPos.z);
                float waterDepth = (-2.5) - seabedY;
                if (waterDepth < -0.25) discard;

                float distToCam = length(cameraPosition - vWorldPos);
                float detailFade = 1.0 - smoothstep(180.0, 1400.0, distToCam);

                // Compute finite-difference capillary normal
                float eps = mix(0.28, 1.2, 1.0 - detailFade);
                float h0 = capillaryWaveField(vWorldPos.xz, uTime);
                float hx = capillaryWaveField(vWorldPos.xz + vec2(eps, 0.0), uTime);
                float hz = capillaryWaveField(vWorldPos.xz + vec2(0.0, eps), uTime);

                vec3 microNorm = normalize(vec3((h0 - hx) / eps * 0.42, 1.0, (h0 - hz) / eps * 0.42));
                vec3 waveNormal = normalize(vec3(
                    vNormal.x + microNorm.x * (0.45 + 0.55 * detailFade),
                    vNormal.y * microNorm.y,
                    vNormal.z + microNorm.z * (0.45 + 0.55 * detailFade)
                ));

                vec3 viewDir = normalize(vViewDir);
                vec3 lightDir = normalize(sunDirection);
                float NdotV = max(dot(waveNormal, viewDir), 0.001);
                float NdotL = max(dot(waveNormal, lightDir), 0.0);

                // Physically-based Schlick Fresnel (water IOR = 1.333 -> F0 = 0.02)
                float F0 = 0.0204;
                float fresnel = F0 + (1.0 - F0) * pow(clamp(1.0 - NdotV, 0.0, 1.0), 4.2);

                // Multi-zone coastal bathymetry color palette
                float dShallow = smoothstep(0.0, 2.2, max(0.0, waterDepth));
                float dDeep    = smoothstep(1.8, 7.5, max(0.0, waterDepth));

                vec3 shoreSandTint = vec3(0.42, 0.48, 0.40);
                vec3 turquoiseCol  = vec3(0.05, 0.40, 0.48);
                vec3 azureMidCol   = vec3(0.04, 0.24, 0.44);
                vec3 navyDeepCol   = vec3(0.015, 0.09, 0.24);

                vec3 waterBody = mix(shoreSandTint, turquoiseCol, smoothstep(0.0, 0.85, max(0.0, waterDepth)));
                waterBody = mix(waterBody, azureMidCol, dShallow);
                waterBody = mix(waterBody, navyDeepCol, dDeep);

                // Subtle wind-streak bands across the open sea
                float windStreak = valueNoise2D_o(vec2(vWorldPos.x * 0.018 + vWorldPos.z * 0.008, vWorldPos.z * 0.032 - uTime * 0.05)) * 0.5 + 0.5;
                waterBody = mix(waterBody, waterBody * 1.18, windStreak * 0.35 * dShallow);
                waterBody *= (0.78 + 0.32 * NdotL);

                // Subsurface Scattering (SSS) emerald-turquoise glow in sunlit wave crests
                float crestThickness = clamp(vCrestFactor * 1.2 + max(0.0, h0) * 0.45, 0.0, 1.0);
                float backLight = pow(clamp(dot(viewDir, -lightDir) * 0.5 + 0.5, 0.0, 1.0), 2.2);
                vec3 sssCol = vec3(0.08, 0.56, 0.58) * sunColor;
                waterBody = mix(waterBody, sssCol, crestThickness * (0.25 + 0.45 * backLight) * dShallow);

                // Sky reflection with horizon gradient
                vec3 reflDir = reflect(-viewDir, waveNormal);
                float reflElev = clamp(reflDir.y, 0.0, 1.0);
                vec3 skyRefl = mix(skyColor * 1.05, skyColor * 0.62, pow(reflElev, 0.55));
                vec3 oceanColor = mix(waterBody, skyRefl, clamp(fresnel * 0.85, 0.0, 0.82));

                // Dual-lobe Sun Glitter Path (Broad warm glade + crisp diamond micro-sparkles)
                vec3 halfVec = normalize(lightDir + viewDir);
                float NdotH = max(dot(waveNormal, halfVec), 0.0);
                float specBroad = pow(NdotH, 42.0) * 0.55;
                float specCore  = pow(NdotH, 380.0) * 4.2;
                float sparkleFacet = valueNoise2D_o(waveRot1 * vWorldPos.xz * 2.2 + vec2(uTime * 1.8, -uTime * 1.4));
                float specSparkle = pow(NdotH, 95.0) * smoothstep(0.45, 0.82, sparkleFacet) * 3.8 * detailFade;
                oceanColor += sunColor * (specBroad + specCore + specSparkle) * (0.35 + 0.65 * fresnel);

                // Contour-Following Rhythmic Shoreline Surf & Cellular Foam Lace
                float foamNoise = valueNoise2D_o(vWorldPos.xz * 0.38 + vec2(uTime * 0.25, -uTime * 0.35)) * 0.5 + 0.5;
                float laceDetail = 1.0 - abs(valueNoise2D_o(waveRot2 * vWorldPos.xz * 1.15 - vec2(0.0, uTime * 0.45)));
                float shoreZone = 1.0 - smoothstep(0.0, 2.4, max(0.0, waterDepth));
                float surfWave = sin(max(0.0, waterDepth) * 6.2 + uTime * 2.6 + foamNoise * 2.8);
                float surfLine = smoothstep(0.42, 0.88, surfWave) * shoreZone * (0.45 + 0.55 * laceDetail);
                float beachEdgeFoam = (1.0 - smoothstep(-0.05, 0.38, waterDepth)) * (0.65 + 0.35 * laceDetail);

                // Open-water breaking whitecaps on steep wave crests
                float openWhitecap = smoothstep(0.52, 0.92, vCrestFactor + h0 * 0.38 + (foamNoise - 0.5) * 0.25)
                                   * smoothstep(0.45, 0.85, laceDetail) * dShallow * 0.55;

                float totalFoam = clamp(max(surfLine * 0.82, beachEdgeFoam * 0.92) + openWhitecap, 0.0, 1.0);
                vec3 foamCol = mix(vec3(0.88, 0.94, 0.98), vec3(1.0, 0.99, 0.97), clamp(sunDirection.y * 1.5, 0.2, 1.0));
                oceanColor = mix(oceanColor, foamCol, totalFoam);

                // Atmospheric distance fog blend toward horizon
                float fogFactor = 1.0 - exp(-distToCam * 0.00055);
                oceanColor = mix(oceanColor, skyColor, clamp(fogFactor * 0.85, 0.0, 0.88));

                // Smooth alpha feathering at the very edge of the wet beach sand
                float shoreAlpha = smoothstep(-0.18, 0.22, waterDepth);
                gl_FragColor = vec4(oceanColor, clamp(max(shoreAlpha, totalFoam), 0.0, 0.97));
            }
        `,
        transparent: true,
        depthWrite: true
    });
}

// ============================================================================
// High-Resolution Procedural Botanical Foliage & Bark Atlas (512x512, 2x2 UV)
// Quadrant 0 [0.0..0.5, 0.5..1.0] (Top-Left):     Conifer Spruce/Pine Needle Bough Frond
// Quadrant 1 [0.5..1.0, 0.5..1.0] (Top-Right):    Broadleaf Deciduous Leaf Cluster
// Quadrant 2 [0.0..0.5, 0.0..0.5] (Bottom-Left):  Flowering Hawthorn / Meadow Bush Cluster
// Quadrant 3 [0.5..1.0, 0.0..0.5] (Bottom-Right): Fissured Forest Bark with Moss & Knots
// ============================================================================
let _botanicalAtlasTex = null;

function createBotanicalFoliageAtlas() {
    if (_botanicalAtlasTex) return _botanicalAtlasTex;

    const size = 512;
    const half = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    let bSeed = 4099;
    function bRand() {
        bSeed = (bSeed * 16807) % 2147483647;
        return (bSeed - 1) / 2147483646;
    }

    // ------------------------------------------------------------------------
    // Q0: Top-Left (0..256, 0..256 in canvas = UV [0..0.5, 0.5..1.0])
    // Conifer Needle Bough Spray (Radiating woody twigs + dense pine/spruce needles)
    // ------------------------------------------------------------------------
    ctx.save();
    ctx.beginPath();
    ctx.rect(2, 2, half - 4, half - 4);
    ctx.clip();

    // Central woody branch stem and lateral sub-twigs
    const subTwigs = [
        { x0: 128, y0: 244, x1: 128, y1: 22, w: 6.5 },
        { x0: 128, y0: 215, x1: 42,  y1: 125, w: 4.0 },
        { x0: 128, y0: 215, x1: 214, y1: 125, w: 4.0 },
        { x0: 128, y0: 175, x1: 28,  y1: 75,  w: 3.5 },
        { x0: 128, y0: 175, x1: 228, y1: 75,  w: 3.5 },
        { x0: 128, y0: 130, x1: 48,  y1: 38,  w: 3.0 },
        { x0: 128, y0: 130, x1: 208, y1: 38,  w: 3.0 },
        { x0: 128, y0: 85,  x1: 78,  y1: 20,  w: 2.4 },
        { x0: 128, y0: 85,  x1: 178, y1: 20,  w: 2.4 }
    ];

    // Pass 1: Deep interior shadow needles (AO base)
    subTwigs.forEach(tw => {
        const steps = 38;
        const dx = tw.x1 - tw.x0;
        const dy = tw.y1 - tw.y0;
        const twigAng = Math.atan2(dy, dx);

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const bx = tw.x0 + dx * t;
            const by = tw.y0 + dy * t;
            const needleLen = (22 + (1.0 - t * 0.45) * 18) * (tw.w / 4.5);

            for (let side = -1; side <= 1; side += 2) {
                for (let n = 0; n < 4; n++) {
                    const spread = (0.32 + bRand() * 0.65) * side;
                    const ang = twigAng + spread;
                    const len = needleLen * (0.65 + bRand() * 0.45);
                    ctx.strokeStyle = `rgba(${18 + Math.floor(bRand() * 14)}, ${38 + Math.floor(bRand() * 20)}, ${16 + Math.floor(bRand() * 12)}, 0.95)`;
                    ctx.lineWidth = 2.4;
                    ctx.beginPath();
                    ctx.moveTo(bx, by);
                    ctx.lineTo(bx + Math.cos(ang) * len, by + Math.sin(ang) * len);
                    ctx.stroke();
                }
            }
        }
    });

    // Draw woody stems over base shadow needles
    subTwigs.forEach(tw => {
        ctx.strokeStyle = '#3d281a';
        ctx.lineWidth = tw.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tw.x0, tw.y0);
        ctx.lineTo(tw.x1, tw.y1);
        ctx.stroke();
    });

    // Pass 2: Lush mid-tone and sunlit outer conifer needles
    subTwigs.forEach(tw => {
        const steps = 46;
        const dx = tw.x1 - tw.x0;
        const dy = tw.y1 - tw.y0;
        const twigAng = Math.atan2(dy, dx);

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const bx = tw.x0 + dx * t;
            const by = tw.y0 + dy * t;
            const needleLen = (20 + (1.0 - t * 0.4) * 16) * (tw.w / 4.5);

            for (let side = -1; side <= 1; side += 2) {
                for (let n = 0; n < 5; n++) {
                    const spread = (0.22 + bRand() * 0.72) * side;
                    const ang = twigAng + spread;
                    const len = needleLen * (0.6 + bRand() * 0.5);
                    const isSunTip = (t > 0.45 && n >= 3) || bRand() > 0.68;
                    const r = isSunTip ? (68 + Math.floor(bRand() * 35)) : (36 + Math.floor(bRand() * 22));
                    const g = isSunTip ? (118 + Math.floor(bRand() * 38)) : (72 + Math.floor(bRand() * 28));
                    const b = isSunTip ? (34 + Math.floor(bRand() * 20)) : (24 + Math.floor(bRand() * 16));
                    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.96)`;
                    ctx.lineWidth = isSunTip ? 1.6 : 2.0;
                    ctx.beginPath();
                    ctx.moveTo(bx, by);
                    ctx.lineTo(bx + Math.cos(ang) * len, by + Math.sin(ang) * len);
                    ctx.stroke();
                }
            }
        }
    });
    ctx.restore();

    // ------------------------------------------------------------------------
    // Q1: Top-Right (256..512, 0..256 in canvas = UV [0.5..1.0, 0.5..1.0])
    // Broadleaf Deciduous Leaf Cluster (Oak/Beech/Birch overlapping leaves)
    // ------------------------------------------------------------------------
    ctx.save();
    ctx.beginPath();
    ctx.rect(half + 2, 2, half - 4, half - 4);
    ctx.clip();

    function drawLeaf(cx, cy, radius, angle, rCol, gCol, bCol) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = `rgba(${rCol}, ${gCol}, ${bCol}, 0.98)`;
        ctx.beginPath();
        ctx.moveTo(0, -radius);
        ctx.bezierCurveTo(radius * 0.82, -radius * 0.55, radius * 0.88, radius * 0.45, 0, radius);
        ctx.bezierCurveTo(-radius * 0.88, radius * 0.45, -radius * 0.82, -radius * 0.55, 0, -radius);
        ctx.closePath();
        ctx.fill();

        // Subtle leaf midrib vein highlight
        ctx.strokeStyle = `rgba(${Math.min(255, rCol + 28)}, ${Math.min(255, gCol + 32)}, ${Math.min(255, bCol + 14)}, 0.55)`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(0, -radius * 0.75);
        ctx.lineTo(0, radius * 0.85);
        ctx.stroke();
        ctx.restore();
    }

    // Multi-lobed botanical branchlet (5 distinct leaf sub-clusters with natural sky gaps)
    const q1Cx = half + 128;
    const q1Cy = 128;
    const subLobes = [
        { x: q1Cx,      y: 148, r: 58 }, // Central lower-mid lobe
        { x: q1Cx - 52, y: 136, r: 52 }, // Left spreading lobe
        { x: q1Cx + 52, y: 134, r: 52 }, // Right spreading lobe
        { x: q1Cx - 26, y: 80,  r: 48 }, // Upper-left crown lobe
        { x: q1Cx + 28, y: 78,  r: 48 }  // Upper-right crown lobe
    ];

    ctx.strokeStyle = '#38291d';
    ctx.lineWidth = 3.2;
    subLobes.forEach(lb => {
        ctx.beginPath();
        ctx.moveTo(q1Cx, 224);
        ctx.lineTo(lb.x, lb.y);
        ctx.stroke();
    });

    // 340 layered leaves distributed across the 5 organic sub-lobes
    const leafCount = 340;
    for (let i = 0; i < leafCount; i++) {
        const layerFrac = i / leafCount;
        const lb = subLobes[i % subLobes.length];
        const ang = bRand() * Math.PI * 2;
        const dist = Math.pow(bRand(), 0.62) * lb.r;
        const lx = lb.x + Math.cos(ang) * dist;
        const ly = lb.y + Math.sin(ang) * dist;
        const heightNorm = Math.max(0, Math.min(1, (220 - ly) / 180));

        const leafRad = 10 + bRand() * 10 * (1.0 - (dist / lb.r) * 0.2);
        const shade = layerFrac * 0.55 + heightNorm * 0.30 + (dist / lb.r) * 0.15;
        const r = Math.floor(24 + shade * 68 + (bRand() - 0.5) * 14);
        const g = Math.floor(48 + shade * 92 + (bRand() - 0.5) * 18);
        const b = Math.floor(15 + shade * 26 + (bRand() - 0.5) * 8);
        drawLeaf(lx, ly, leafRad, ang + Math.PI * 0.5 + (bRand() - 0.5) * 0.7, r, g, b);
    }
    ctx.restore();

    // ------------------------------------------------------------------------
    // Q2: Bottom-Left (0..256, 256..512 in canvas = UV [0.0..0.5, 0.0..0.5])
    // Flowering Meadow Shrub / Hawthorn Bush Cluster
    // ------------------------------------------------------------------------
    ctx.save();
    ctx.beginPath();
    ctx.rect(2, half + 2, half - 4, half - 4);
    ctx.clip();

    const q2Cx = 128;
    const q2Cy = half + 128;
    for (let i = 0; i < 290; i++) {
        const layerFrac = i / 290;
        const ang = bRand() * Math.PI * 2;
        const dist = Math.pow(bRand(), 0.55) * 104;
        const lx = q2Cx + Math.cos(ang) * dist;
        const ly = q2Cy + Math.sin(ang) * dist;
        const shade = layerFrac * 0.65 + (dist / 104) * 0.35;
        const r = Math.floor(32 + shade * 82 + (bRand() - 0.5) * 15);
        const g = Math.floor(58 + shade * 98 + (bRand() - 0.5) * 18);
        const b = Math.floor(20 + shade * 28 + (bRand() - 0.5) * 10);
        drawLeaf(lx, ly, 10 + bRand() * 10, ang + Math.PI * 0.5, r, g, b);
    }
    // Delicate white/cream hawthorn blossom clusters on outer bush tips
    for (let f = 0; f < 34; f++) {
        const ang = bRand() * Math.PI * 2;
        const dist = 30 + bRand() * 68;
        const fx = q2Cx + Math.cos(ang) * dist;
        const fy = q2Cy + Math.sin(ang) * dist;
        const isYellow = (f % 3 === 0);
        ctx.fillStyle = isYellow ? 'rgba(252, 224, 72, 0.95)' : 'rgba(248, 250, 242, 0.94)';
        for (let p = 0; p < 5; p++) {
            const pa = (p / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(fx + Math.cos(pa) * 3.2, fy + Math.sin(pa) * 3.2, 2.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ------------------------------------------------------------------------
    // Q3: Bottom-Right (256..512, 256..512 in canvas = UV [0.5..1.0, 0.0..0.5])
    // Fissured Tree Trunk Bark with Vertical Ridges & Lichen/Moss
    // ------------------------------------------------------------------------
    ctx.save();
    ctx.beginPath();
    ctx.rect(half, half, half, half);
    ctx.clip();

    ctx.fillStyle = '#463527';
    ctx.fillRect(half, half, half, half);

    // Vertical bark ridges & deep crevices
    for (let x = 0; x < half; x += 4) {
        const ridge = Math.sin(x * 0.25) * 14 + (bRand() - 0.5) * 18;
        const r = Math.min(255, Math.max(20, Math.floor(72 + ridge)));
        const g = Math.min(255, Math.max(15, Math.floor(54 + ridge * 0.8)));
        const b = Math.min(255, Math.max(10, Math.floor(40 + ridge * 0.65)));
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(half + x, half, 4, half);
    }
    // Deep vertical bark fissures
    for (let i = 0; i < 140; i++) {
        const fx = half + bRand() * half;
        const fy = half + bRand() * (half - 30);
        const fh = 18 + bRand() * 48;
        ctx.fillStyle = (i % 3 === 0) ? 'rgba(24, 16, 11, 0.78)' : 'rgba(98, 76, 58, 0.55)';
        ctx.fillRect(fx, fy, 2 + bRand() * 3, fh);
    }
    // Subtle mossy green tint near bottom of bark
    const mossGrad = ctx.createLinearGradient(0, size - 65, 0, size);
    mossGrad.addColorStop(0, 'rgba(42, 62, 28, 0.0)');
    mossGrad.addColorStop(1, 'rgba(34, 52, 22, 0.55)');
    ctx.fillStyle = mossGrad;
    ctx.fillRect(half, size - 65, half, 65);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    _botanicalAtlasTex = tex;
    return tex;
}

// ============================================================================
// High-Resolution Meadow Grass & Wildflower Tuft Texture Atlas (512x256, 4 Columns)
// Col 0 [0.00..0.25]: Lush Dense Meadow Grass Tuft (22 overlapping blades)
// Col 1 [0.25..0.50]: Sunlit Ryegrass & Golden Seed-Head Plumes
// Col 2 [0.50..0.75]: Meadow Grass with White Chamomile / Daisy Wildflowers
// Col 3 [0.75..1.00]: Meadow Grass with Golden Buttercup / Dandelion Wildflowers
// ============================================================================
let _grassTuftAtlasTex = null;
let _grassTuftEdgeTex = null;

function createGrassTuftAtlasTexture() {
    if (_grassTuftAtlasTex && _grassTuftEdgeTex) return _grassTuftAtlasTex;

    const width = 512;
    const height = 256;
    const colW = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    // Dedicated edge-mask canvas for blade edge subsurface scattering
    const edgeCanvas = document.createElement('canvas');
    edgeCanvas.width = width;
    edgeCanvas.height = height;
    const edgeCtx = edgeCanvas.getContext('2d');
    edgeCtx.clearRect(0, 0, width, height);

    let gSeed = 8191;
    function gRand() {
        gSeed = (gSeed * 16807) % 2147483647;
        return (gSeed - 1) / 2147483646;
    }

    for (let col = 0; col < 4; col++) {
        const xOffset = col * colW;
        ctx.save();
        ctx.beginPath();
        ctx.rect(xOffset + 2, 0, colW - 4, height);
        ctx.clip();

        edgeCtx.save();
        edgeCtx.beginPath();
        edgeCtx.rect(xOffset + 2, 0, colW - 4, height);
        edgeCtx.clip();

        // Draw 52 dense overlapping grass blades spanning full column width
        const numBlades = 52;
        for (let b = 0; b < numBlades; b++) {
            const depthFrac = b / (numBlades - 1);
            const rootX = xOffset + 6 + (b / (numBlades - 1)) * (colW - 12) + (gRand() - 0.5) * 6;
            const rootY = height + 4;
            const edgeFactor = 1.0 - Math.pow(Math.abs((b / (numBlades - 1)) - 0.5) * 1.85, 2.0) * 0.25;
            // Higher grass blades reaching 80% to 98% of the tuft height
            const bladeH = height * (0.80 + gRand() * 0.18) * edgeFactor;
            const lean = ((rootX - (xOffset + colW * 0.5)) / (colW * 0.5)) * 16 + (gRand() - 0.5) * 18;
            const tipX = Math.max(xOffset + 4, Math.min(xOffset + colW - 4, rootX + lean));
            const tipY = height - bladeH;
            const ctrlX = (rootX + tipX) * 0.5 + (gRand() - 0.5) * 5;
            const ctrlY = height - bladeH * 0.55;
            const baseHalfW = 3.0 + gRand() * 1.8;

            const grad = ctx.createLinearGradient(rootX, rootY, tipX, tipY);
            const brightness = 0.52 + depthFrac * 0.52;
            const rRoot = Math.floor(28 * brightness);
            const gRoot = Math.floor(54 * brightness);
            const bRoot = Math.floor(16 * brightness);

            const isGolden = (col === 1 && b % 3 === 0) || gRand() > 0.80;
            const rTip = Math.min(255, Math.floor((isGolden ? 132 : 86) * brightness));
            const gTip = Math.min(255, Math.floor((isGolden ? 152 : 134) * brightness));
            const bTip = Math.min(255, Math.floor((isGolden ? 44  : 32)  * brightness));

            grad.addColorStop(0.0, `rgb(${rRoot}, ${gRoot}, ${bRoot})`);
            grad.addColorStop(0.45, `rgb(${Math.floor((rRoot + rTip) * 0.48)}, ${Math.floor((gRoot + gTip) * 0.52)}, ${Math.floor((bRoot + bTip) * 0.45)})`);
            grad.addColorStop(1.0, `rgb(${rTip}, ${gTip}, ${bTip})`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(rootX - baseHalfW, rootY);
            ctx.quadraticCurveTo(ctrlX - baseHalfW * 0.48, ctrlY, tipX, tipY);
            ctx.quadraticCurveTo(ctrlX + baseHalfW * 0.48, ctrlY, rootX + baseHalfW, rootY);
            ctx.closePath();
            ctx.fill();

            // Razor-sharp fine edge mask (1.0px) strictly on blade contours & tips
            edgeCtx.lineWidth = 1.0;
            edgeCtx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
            edgeCtx.beginPath();
            edgeCtx.moveTo(rootX - baseHalfW, rootY);
            edgeCtx.quadraticCurveTo(ctrlX - baseHalfW * 0.48, ctrlY, tipX, tipY);
            edgeCtx.quadraticCurveTo(ctrlX + baseHalfW * 0.48, ctrlY, rootX + baseHalfW, rootY);
            edgeCtx.stroke();

            edgeCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            edgeCtx.beginPath();
            edgeCtx.arc(tipX, tipY, 1.4, 0, Math.PI * 2);
            edgeCtx.fill();

            // Seed head plumes in Column 1
            if (col === 1 && depthFrac > 0.5 && b % 4 === 0) {
                ctx.fillStyle = 'rgba(218, 198, 112, 0.95)';
                ctx.save();
                ctx.translate(tipX, tipY + 8);
                ctx.rotate(lean * 0.015);
                ctx.beginPath();
                ctx.ellipse(0, 0, 3.2, 12.0, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                edgeCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                edgeCtx.lineWidth = 1.8;
                edgeCtx.save();
                edgeCtx.translate(tipX, tipY + 8);
                edgeCtx.rotate(lean * 0.015);
                edgeCtx.beginPath();
                edgeCtx.ellipse(0, 0, 3.2, 12.0, 0, 0, Math.PI * 2);
                edgeCtx.stroke();
                edgeCtx.restore();
            }
        }

        // Column 2: White Chamomile / Daisy Blossoms
        if (col === 2) {
            const daisyPositions = [
                { x: xOffset + 36, y: 68, r: 10.5 },
                { x: xOffset + 68, y: 52, r: 12.0 },
                { x: xOffset + 94, y: 78, r: 9.5 },
                { x: xOffset + 52, y: 96, r: 8.5 }
            ];
            daisyPositions.forEach(fl => {
                ctx.fillStyle = '#fdfefc';
                edgeCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                edgeCtx.lineWidth = 1.6;
                for (let p = 0; p < 10; p++) {
                    const pa = (p / 10) * Math.PI * 2;
                    ctx.save();
                    ctx.translate(fl.x + Math.cos(pa) * (fl.r * 0.55), fl.y + Math.sin(pa) * (fl.r * 0.55));
                    ctx.rotate(pa);
                    ctx.beginPath();
                    ctx.ellipse(0, 0, fl.r * 0.48, fl.r * 0.22, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    edgeCtx.save();
                    edgeCtx.translate(fl.x + Math.cos(pa) * (fl.r * 0.55), fl.y + Math.sin(pa) * (fl.r * 0.55));
                    edgeCtx.rotate(pa);
                    edgeCtx.beginPath();
                    edgeCtx.ellipse(0, 0, fl.r * 0.48, fl.r * 0.22, 0, 0, Math.PI * 2);
                    edgeCtx.stroke();
                    edgeCtx.restore();
                }
                ctx.fillStyle = '#f59e0b';
                ctx.beginPath();
                ctx.arc(fl.x, fl.y, fl.r * 0.34, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Column 3: Golden Buttercup Wildflowers
        if (col === 3) {
            const buttercupPositions = [
                { x: xOffset + 34, y: 64, r: 10.0 },
                { x: xOffset + 64, y: 48, r: 11.5 },
                { x: xOffset + 92, y: 72, r: 9.5 },
                { x: xOffset + 48, y: 94, r: 8.5 },
                { x: xOffset + 80, y: 98, r: 8.0 }
            ];
            buttercupPositions.forEach(fl => {
                ctx.fillStyle = '#facc15';
                edgeCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                edgeCtx.lineWidth = 1.6;
                for (let p = 0; p < 5; p++) {
                    const pa = (p / 5) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(fl.x + Math.cos(pa) * (fl.r * 0.42), fl.y + Math.sin(pa) * (fl.r * 0.42), fl.r * 0.44, 0, Math.PI * 2);
                    ctx.fill();

                    edgeCtx.beginPath();
                    edgeCtx.arc(fl.x + Math.cos(pa) * (fl.r * 0.42), fl.y + Math.sin(pa) * (fl.r * 0.42), fl.r * 0.44, 0, Math.PI * 2);
                    edgeCtx.stroke();
                }
                ctx.fillStyle = '#ca8a04';
                ctx.beginPath();
                ctx.arc(fl.x, fl.y, fl.r * 0.25, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        ctx.restore();
        edgeCtx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    _grassTuftAtlasTex = tex;

    const edgeTex = new THREE.CanvasTexture(edgeCanvas);
    edgeTex.encoding = THREE.LinearEncoding;
    edgeTex.wrapS = THREE.ClampToEdgeWrapping;
    edgeTex.wrapT = THREE.ClampToEdgeWrapping;
    edgeTex.anisotropy = 4;
    _grassTuftEdgeTex = edgeTex;

    return tex;
}

function getGrassTuftEdgeTexture() {
    if (!_grassTuftEdgeTex) {
        createGrassTuftAtlasTexture();
    }
    return _grassTuftEdgeTex;
}


// ============================================================================
// High-Resolution European Architectural PBR Atlas (1024x1024, 2x2 Quadrant UV)
// Generates synchronized Albedo + Tangent-Space Normal Map + Roughness Map:
// Q0 [0.0..0.5, 0.5..1.0] (Top-Left):     Half-Timbered Limewashed Stucco Facade,
//                                         Casement Windows, Shutters, Stone Plinth & Door
// Q1 [0.5..1.0, 0.5..1.0] (Top-Right):    Scalloped Terracotta Barrel Clay Roof Tiles
// Q2 [0.0..0.5, 0.0..0.5] (Bottom-Left):  Coursed Fieldstone Masonry & Chimney Brickwork
// Q3 [0.5..1.0, 0.0..0.5] (Bottom-Right): Weathered Barn Timber Planks & Stone Slate
// ============================================================================
let _villagePBRAtlas = null;

function createVillagePBRAtlas() {
    if (_villagePBRAtlas) return _villagePBRAtlas;

    const size = 1024;
    const half = 512;
    const albedoCanvas = document.createElement('canvas');
    const normalCanvas = document.createElement('canvas');
    const roughCanvas  = document.createElement('canvas');
    albedoCanvas.width = normalCanvas.width = roughCanvas.width = size;
    albedoCanvas.height = normalCanvas.height = roughCanvas.height = size;

    const aCtx = albedoCanvas.getContext('2d');
    const nCtx = normalCanvas.getContext('2d');
    const rCtx = roughCanvas.getContext('2d');

    let vSeed = 3187;
    function vRand() {
        vSeed = (vSeed * 16807) % 2147483647;
        return (vSeed - 1) / 2147483646;
    }

    // ------------------------------------------------------------------------
    // Q0: Top-Left (0..512, 0..512 in canvas = UV [0.0..0.5, 0.5..1.0])
    // Half-Timbered Stucco Wall + Stone Plinth + Casement Windows + Oak Door
    // ------------------------------------------------------------------------
    aCtx.save();
    aCtx.beginPath();
    aCtx.rect(0, 0, half, half);
    aCtx.clip();

    // Warm aged limewashed stucco plaster background
    const stuccoGrad = aCtx.createLinearGradient(0, 0, 0, half);
    stuccoGrad.addColorStop(0.0, '#d8d0c2'); // Under-eave shadow AO
    stuccoGrad.addColorStop(0.12, '#ede6d8');
    stuccoGrad.addColorStop(0.74, '#e5decb');
    stuccoGrad.addColorStop(1.0, '#c6bda8');
    aCtx.fillStyle = stuccoGrad;
    aCtx.fillRect(0, 0, half, half);

    // Subtle plaster trowel mottling & vertical rain stains
    for (let i = 0; i < 900; i++) {
        const px = vRand() * half;
        const py = vRand() * 390;
        const pr = 4 + vRand() * 18;
        aCtx.fillStyle = (i % 2 === 0) ? 'rgba(165, 152, 132, 0.14)' : 'rgba(255, 252, 245, 0.14)';
        aCtx.beginPath();
        aCtx.arc(px, py, pr, 0, Math.PI * 2);
        aCtx.fill();
    }

    // Lower Stone Plinth Course (y = 392..512)
    aCtx.fillStyle = '#5a554c';
    aCtx.fillRect(0, 392, half, 120);
    for (let row = 0; row < 4; row++) {
        const ry = 394 + row * 29;
        let rx = (row % 2) * -24;
        while (rx < half) {
            const bw = 38 + Math.floor(vRand() * 28);
            const shade = 92 + Math.floor((vRand() - 0.5) * 34);
            aCtx.fillStyle = `rgb(${shade + 6}, ${shade + 2}, ${shade - 4})`;
            aCtx.fillRect(rx + 2, ry + 2, bw - 4, 25);
            rx += bw;
        }
    }
    // Ground contact damp moss AO at bottom of plinth
    const plinthAO = aCtx.createLinearGradient(0, 465, 0, 512);
    plinthAO.addColorStop(0, 'rgba(30, 36, 24, 0.0)');
    plinthAO.addColorStop(1, 'rgba(22, 28, 18, 0.65)');
    aCtx.fillStyle = plinthAO;
    aCtx.fillRect(0, 465, half, 47);

    // Authentic Dark Oak Half-Timbering Framework (Fachwerk)
    function drawTimberBeam(x, y, w, h) {
        aCtx.fillStyle = '#38281c';
        aCtx.fillRect(x, y, w, h);
        aCtx.strokeStyle = 'rgba(22, 15, 10, 0.65)';
        aCtx.lineWidth = 2;
        aCtx.strokeRect(x, y, w, h);
    }
    // Horizontal sill, mid-plate, and top-plate beams
    drawTimberBeam(0, 0, half, 16);
    drawTimberBeam(0, 188, half, 16);
    drawTimberBeam(0, 378, half, 16);
    // Vertical posts
    [0, 166, 334, 496].forEach(vx => drawTimberBeam(vx, 0, 16, 392));

    // Diagonal corner braces
    aCtx.strokeStyle = '#38281c';
    aCtx.lineWidth = 13;
    [[12, 188, 72, 16], [498, 188, 438, 16], [12, 204, 72, 378], [498, 204, 438, 378]].forEach(([x0, y0, x1, y1]) => {
        aCtx.beginPath();
        aCtx.moveTo(x0, y0);
        aCtx.lineTo(x1, y1);
        aCtx.stroke();
    });

    // Recessed Multi-Pane Casement Windows with Wooden Shutters & Stone Sills
    function drawCasementWindow(wx, wy, ww, wh) {
        // Louvered wooden shutters on left and right
        const shutW = Math.floor(ww * 0.34);
        [-shutW - 4, ww + 4].forEach(sxOff => {
            const sx = wx + sxOff;
            aCtx.fillStyle = '#2d4a34'; // Classic European forest-green shutter
            aCtx.fillRect(sx, wy + 2, shutW, wh - 4);
            aCtx.strokeStyle = '#1b2e20';
            aCtx.lineWidth = 2;
            aCtx.strokeRect(sx, wy + 2, shutW, wh - 4);
            for (let ly = wy + 8; ly < wy + wh - 6; ly += 6) {
                aCtx.fillStyle = 'rgba(18, 32, 22, 0.65)';
                aCtx.fillRect(sx + 3, ly, shutW - 6, 2);
            }
        });

        // Heavy oak outer window frame
        aCtx.fillStyle = '#322216';
        aCtx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

        // Dark reflective glass interior with subtle sky reflection gradient
        const glassGrad = aCtx.createLinearGradient(wx, wy, wx + ww, wy + wh);
        glassGrad.addColorStop(0.0, '#1e2c3a');
        glassGrad.addColorStop(0.45, '#2b3e50');
        glassGrad.addColorStop(0.55, '#16202a');
        glassGrad.addColorStop(1.0, '#22303e');
        aCtx.fillStyle = glassGrad;
        aCtx.fillRect(wx, wy, ww, wh);

        // Warm interior curtain/candlelight hint
        aCtx.fillStyle = 'rgba(215, 175, 110, 0.16)';
        aCtx.fillRect(wx + 4, wy + wh * 0.45, ww - 8, wh * 0.5);

        // Whitewashed wooden casement muntin bars (6-pane grid)
        aCtx.fillStyle = '#dfd8c8';
        aCtx.fillRect(wx + ww * 0.5 - 2, wy, 4, wh);
        aCtx.fillRect(wx, wy + wh * 0.34 - 1.5, ww, 3);
        aCtx.fillRect(wx, wy + wh * 0.67 - 1.5, ww, 3);

        // Protruding stone window sill & lintel shadow
        aCtx.fillStyle = '#8c8578';
        aCtx.fillRect(wx - 8, wy + wh + 3, ww + 16, 8);
        aCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        aCtx.fillRect(wx - 6, wy + wh + 11, ww + 12, 4);
    }

    // Upper floor windows (3 bays)
    drawCasementWindow(62, 54, 56, 82);
    drawCasementWindow(228, 54, 56, 82);
    drawCasementWindow(394, 54, 56, 82);

    // Lower floor windows (left & right bays)
    drawCasementWindow(62, 242, 56, 86);
    drawCasementWindow(394, 242, 56, 86);

    // Center Bay: Heavy Planked Oak Cottage Door with Stone Arch Surround
    const dx = 216, dy = 236, dw = 80, dh = 154;
    aCtx.fillStyle = '#787166';
    aCtx.fillRect(dx - 10, dy - 10, dw + 20, dh + 12);
    aCtx.fillStyle = '#4e3422';
    aCtx.fillRect(dx, dy, dw, dh);
    for (let px = dx + 10; px < dx + dw; px += 12) {
        aCtx.fillStyle = 'rgba(24, 15, 9, 0.55)';
        aCtx.fillRect(px, dy, 2, dh);
    }
    // Wrought-iron strap hinges & ring handle
    aCtx.fillStyle = '#1e2226';
    aCtx.fillRect(dx + 2, dy + 28, 42, 6);
    aCtx.fillRect(dx + 2, dy + 112, 42, 6);
    aCtx.beginPath();
    aCtx.arc(dx + dw - 14, dy + 76, 5, 0, Math.PI * 2);
    aCtx.fill();
    // Small glazed transom window in door top
    aCtx.fillStyle = '#243442';
    aCtx.fillRect(dx + 16, dy + 14, dw - 32, 28);
    aCtx.strokeStyle = '#322216';
    aCtx.lineWidth = 3;
    aCtx.strokeRect(dx + 16, dy + 14, dw - 32, 28);
    aCtx.restore();

    // ------------------------------------------------------------------------
    // Q1: Top-Right (512..1024, 0..512 in canvas = UV [0.5..1.0, 0.5..1.0])
    // Authentic Scalloped Terracotta Barrel Clay Roof Tiles (Imbrex & Tegula)
    // ------------------------------------------------------------------------
    aCtx.save();
    aCtx.beginPath();
    aCtx.rect(half, 0, half, half);
    aCtx.clip();

    aCtx.fillStyle = '#8c3820';
    aCtx.fillRect(half, 0, half, half);

    const tileRows = 16;
    const tileCols = 20;
    const rowH = half / tileRows;
    const colW = half / tileCols;

    for (let r = 0; r < tileRows; r++) {
        const ty = r * rowH;
        for (let c = 0; c < tileCols; c++) {
            const tx = half + c * colW;
            const hueJitter = (vRand() - 0.5) * 28;
            const isWeathered = vRand() > 0.82;
            const baseR = isWeathered ? (112 + hueJitter) : (164 + hueJitter);
            const baseG = isWeathered ? (68 + hueJitter * 0.6) : (72 + hueJitter * 0.6);
            const baseB = isWeathered ? (48 + hueJitter * 0.4) : (42 + hueJitter * 0.4);

            // Curved barrel tile gradient (lit crest, shaded trough)
            const tGrad = aCtx.createLinearGradient(tx, ty, tx + colW, ty);
            tGrad.addColorStop(0.0, `rgb(${Math.floor(baseR * 0.68)}, ${Math.floor(baseG * 0.68)}, ${Math.floor(baseB * 0.68)})`);
            tGrad.addColorStop(0.42, `rgb(${Math.min(255, Math.floor(baseR * 1.15))}, ${Math.min(255, Math.floor(baseG * 1.12))}, ${Math.min(255, Math.floor(baseB * 1.08))})`);
            tGrad.addColorStop(1.0, `rgb(${Math.floor(baseR * 0.58)}, ${Math.floor(baseG * 0.58)}, ${Math.floor(baseB * 0.58)})`);

            aCtx.fillStyle = tGrad;
            aCtx.fillRect(tx, ty, colW + 1, rowH + 1);

            // Scalloped bottom overlap shadow under each tile course
            aCtx.fillStyle = 'rgba(28, 12, 8, 0.52)';
            aCtx.beginPath();
            aCtx.arc(tx + colW * 0.5, ty + rowH, colW * 0.52, 0, Math.PI);
            aCtx.fill();
        }
    }
    // Subtle golden-green roof moss patches
    for (let m = 0; m < 45; m++) {
        const mx = half + vRand() * half;
        const my = vRand() * half;
        const mr = 8 + vRand() * 24;
        const mGrad = aCtx.createRadialGradient(mx, my, 1, mx, my, mr);
        mGrad.addColorStop(0, 'rgba(78, 92, 38, 0.38)');
        mGrad.addColorStop(1, 'rgba(78, 92, 38, 0.0)');
        aCtx.fillStyle = mGrad;
        aCtx.beginPath();
        aCtx.arc(mx, my, mr, 0, Math.PI * 2);
        aCtx.fill();
    }
    aCtx.restore();

    // ------------------------------------------------------------------------
    // Q2: Bottom-Left (0..512, 512..1024 in canvas = UV [0.0..0.5, 0.0..0.5])
    // Coursed European Fieldstone & Weathered Chimney Brick Masonry
    // ------------------------------------------------------------------------
    aCtx.save();
    aCtx.beginPath();
    aCtx.rect(0, half, half, half);
    aCtx.clip();

    // Mortar base
    aCtx.fillStyle = '#48433c';
    aCtx.fillRect(0, half, half, half);

    const stoneRows = 14;
    const sRowH = half / stoneRows;
    for (let r = 0; r < stoneRows; r++) {
        const sy = half + r * sRowH;
        let sx = (r % 2) * -28;
        while (sx < half) {
            const sw = 44 + Math.floor(vRand() * 38);
            const isBrickTone = vRand() > 0.65;
            const shade = 95 + Math.floor((vRand() - 0.5) * 42);
            const sr = isBrickTone ? Math.min(255, shade + 26) : (shade + 6);
            const sg = isBrickTone ? (shade - 6) : (shade + 3);
            const sb = isBrickTone ? (shade - 16) : (shade - 3);

            aCtx.fillStyle = `rgb(${sr}, ${sg}, ${sb})`;
            aCtx.fillRect(sx + 3, sy + 3, sw - 5, sRowH - 5);

            // Top bevel highlight & bottom shadow for 3D relief
            aCtx.fillStyle = 'rgba(255, 250, 240, 0.16)';
            aCtx.fillRect(sx + 3, sy + 3, sw - 5, 3);
            aCtx.fillStyle = 'rgba(15, 12, 10, 0.35)';
            aCtx.fillRect(sx + 3, sy + sRowH - 5, sw - 5, 3);
            sx += sw;
        }
    }
    aCtx.restore();

    // ------------------------------------------------------------------------
    // Q3: Bottom-Right (512..1024, 512..1024 in canvas = UV [0.5..1.0, 0.0..0.5])
    // Weathered Barn Timber Planks & Beams
    // ------------------------------------------------------------------------
    aCtx.save();
    aCtx.beginPath();
    aCtx.rect(half, half, half, half);
    aCtx.clip();

    aCtx.fillStyle = '#523b28';
    aCtx.fillRect(half, half, half, half);

    const plankCols = 16;
    const pColW = half / plankCols;
    for (let c = 0; c < plankCols; c++) {
        const px = half + c * pColW;
        const delta = Math.floor((vRand() - 0.5) * 24);
        aCtx.fillStyle = `rgb(${84 + delta}, ${60 + Math.floor(delta * 0.75)}, ${42 + Math.floor(delta * 0.55)})`;
        aCtx.fillRect(px + 2, half, pColW - 3, half);

        // Vertical wood grain streaks
        for (let g = 0; g < 12; g++) {
            const gx = px + 3 + vRand() * (pColW - 6);
            const gy = half + vRand() * (half - 60);
            aCtx.fillStyle = (g % 2 === 0) ? 'rgba(32, 20, 12, 0.28)' : 'rgba(135, 102, 72, 0.18)';
            aCtx.fillRect(gx, gy, 1.5, 45 + vRand() * 80);
        }
        // Dark seam gap between boards
        aCtx.fillStyle = '#1e140c';
        aCtx.fillRect(px, half, 2, half);
    }
    // Horizontal barn battens
    [half + 90, half + 256, half + 420].forEach(by => {
        aCtx.fillStyle = '#3b2819';
        aCtx.fillRect(half, by, half, 18);
    });
    aCtx.restore();

    // ------------------------------------------------------------------------
    // Compute Sobel Normal Map & Roughness Map from Albedo Luminance
    // ------------------------------------------------------------------------
    const aData = aCtx.getImageData(0, 0, size, size).data;
    const nImg = nCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const lum = new Float32Array(size * size);

    for (let i = 0; i < size * size; i++) {
        const p = i * 4;
        lum[i] = (aData[p] * 0.299 + aData[p + 1] * 0.587 + aData[p + 2] * 0.114) / 255.0;
    }

    const bumpScale = 3.2;
    for (let y = 0; y < size; y++) {
        const ym = Math.max(0, y - 1);
        const yp = Math.min(size - 1, y + 1);
        for (let x = 0; x < size; x++) {
            const xm = Math.max(0, x - 1);
            const xp = Math.min(size - 1, x + 1);

            const tl = lum[ym * size + xm], t = lum[ym * size + x], tr = lum[ym * size + xp];
            const l  = lum[y  * size + xm],                         r  = lum[y  * size + xp];
            const bl = lum[yp * size + xm], b = lum[yp * size + x], br = lum[yp * size + xp];

            const dX = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
            const dY = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);

            let nx = -dX * bumpScale;
            let ny = -dY * bumpScale;
            let nz = 1.0;
            const invLen = 1.0 / Math.hypot(nx, ny, nz);
            nx *= invLen; ny *= invLen; nz *= invLen;

            const idx = (y * size + x) * 4;
            nImg.data[idx]     = Math.floor((nx * 0.5 + 0.5) * 255);
            nImg.data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
            nImg.data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
            nImg.data[idx + 3] = 255;

            // Window glass panes in Q0 have low roughness (shiny reflection)
            const val = lum[y * size + x];
            let rough = Math.floor(185 + (1.0 - val) * 55);
            if (x < half && y < half && aData[idx + 2] > aData[idx] + 10) {
                rough = 45; // Glass pane specular glint
            }
            rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = Math.min(255, rough);
            rImg.data[idx + 3] = 255;
        }
    }

    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);

    const albedoTex = new THREE.CanvasTexture(albedoCanvas);
    albedoTex.encoding = THREE.sRGBEncoding;
    albedoTex.anisotropy = 4;

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    const roughTex  = new THREE.CanvasTexture(roughCanvas);

    _villagePBRAtlas = { albedo: albedoTex, normal: normalTex, roughness: roughTex };
    return _villagePBRAtlas;
}

// ============================================================================
// Photorealistic Maldive-Grade Atmospheric Sky, Sun, High Clouds & Moon Shader
// Features Rayleigh/Mie scattering, Solar disc/corona, Milky Way galaxy,
// high-altitude wispy cumulus/cirrus clouds with Henyey-Greenstein scattering
// ============================================================================

const TIGER_SKY_VERTEX_SHADER = `
    varying vec3 vWorldPos;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

const TIGER_SKY_FRAGMENT_SHADER = `
    uniform vec3 uSunDir;
    uniform vec3 uMoonDir;
    uniform vec3 uSkyHorizonColor;
    uniform float uSkyRotation;
    uniform float uTime;
    uniform float uCloudCoverage;
    varying vec3 vWorldPos;

    float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float hash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
    }

    float noise(vec3 p) {
        vec2 i = floor(p.xy);
        vec2 f = fract(p.xy);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p = p.yzx * 2.03 + vec3(13.4, 7.1, 9.2);
            a *= 0.5;
        }
        return v;
    }

    float ridgedFbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
            float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
            v += a * (n * n);
            p = p.yzx * 2.12 + vec3(5.2, 19.8, 7.4);
            a *= 0.48;
        }
        return v;
    }

    float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
        for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p = rot * p * 2.03 + vec2(13.4, 7.1);
            a *= 0.5;
        }
        return v;
    }

    float ridgedFbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 4; i++) {
            float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
            v += a * (n * n);
            p = rot * p * 2.12 + vec2(5.2, 19.8);
            a *= 0.48;
        }
        return v;
    }

    float sampleCloudDensity(vec2 uv) {
        vec2 windMacro = vec2(uTime * 0.016, uTime * 0.006);
        vec2 windMicro = vec2(uTime * 0.038, -uTime * 0.012);

        vec2 warp = vec2(
            fbm(uv * 0.85 + windMacro),
            fbm(uv * 0.85 - windMacro + vec2(11.7, 4.3))
        ) - 0.5;

        vec2 p = uv + warp * 0.55 + windMacro;
        float baseFronts = fbm(p * 0.55);
        float billowingTurbulence = ridgedFbm(p * 1.45 + windMicro * 0.5);
        float wispyEdges = fbm(p * 3.8 - windMicro);

        float composite = baseFronts * 0.65 + billowingTurbulence * 0.28 + wispyEdges * 0.15;
        float threshold = mix(0.56, 0.30, uCloudCoverage);
        return smoothstep(threshold, threshold + 0.18, composite);
    }

    void main() {
        vec3 dir = normalize(vWorldPos - cameraPosition);
        float y = max(dir.y, 0.001);

        float sunAlt = uSunDir.y;
        float dayFactor = smoothstep(-0.12, 0.25, sunAlt);
        float twilightFactor = smoothstep(-0.22, 0.08, sunAlt) * (1.0 - smoothstep(0.05, 0.38, sunAlt));
        float nightFactor = 1.0 - smoothstep(-0.18, 0.05, sunAlt);

        // Rayleigh-Mie realistic coastal sky gradient
        vec3 dayZenith = vec3(0.045, 0.34, 0.76);
        vec3 sunsetZenith = vec3(0.08, 0.12, 0.32);
        vec3 nightZenith = vec3(0.005, 0.012, 0.038);

        vec3 zenithCol = mix(nightZenith, dayZenith, dayFactor);
        zenithCol = mix(zenithCol, sunsetZenith, twilightFactor * 0.85);

        vec3 horizonCol = uSkyHorizonColor;

        if (dir.y < -0.05) {
            gl_FragColor = vec4(horizonCol, 1.0);
            return;
        }
        float horizonVisibility = smoothstep(-0.05, 0.04, dir.y);
        float horizonGlow = pow(1.0 - y, 2.8);
        vec3 skyCol = mix(zenithCol, horizonCol, horizonGlow);

        // Mie forward scattering around the sun
        float sunDot = max(dot(dir, uSunDir), 0.0);
        vec3 mieTint = mix(vec3(1.0, 0.36, 0.10), vec3(1.0, 0.92, 0.78), smoothstep(-0.05, 0.35, sunAlt));
        float mieScatter = pow(sunDot, 5.0) * (0.30 + 0.70 * twilightFactor) * smoothstep(-0.18, 0.2, sunAlt) * horizonVisibility;
        skyCol += mieTint * mieScatter * (0.25 + 0.75 * horizonGlow);

        // Solar disc + soft corona
        float sunDisc = smoothstep(0.99945, 0.99985, dot(dir, uSunDir));
        float sunCorona = pow(sunDot, 180.0) * 1.1;
        skyCol += (sunDisc * 8.0 + sunCorona) * mieTint * smoothstep(-0.08, 0.02, sunAlt) * horizonVisibility;

        // Nighttime Milky Way Galaxy Belt, Nebulae, Starfield & Moon
        if (nightFactor > 0.01 && dir.y > -0.02) {
            float horizonVis = smoothstep(-0.02, 0.03, dir.y);
            float skyCos = cos(uSkyRotation);
            float skySin = sin(uSkyRotation);
            vec3 starDir = vec3(
                skyCos * dir.x + skySin * dir.y,
                -skySin * dir.x + skyCos * dir.y,
                dir.z
            );

            mat3 galRot = mat3(
                 0.80, -0.46,  0.38,
                 0.52,  0.85, -0.10,
                -0.30,  0.26,  0.92
            );
            vec3 galDir = galRot * starDir;
            float galLat = galDir.y;
            vec3 galPos = galDir * vec3(2.4, 5.2, 2.4);

            vec2 galWarp = vec2(
                fbm(galPos * 1.3 + vec3(3.1, 7.4, 0.0)),
                fbm(galPos * 1.3 + vec3(12.8, 1.9, 0.0))
            ) - 0.5;
            vec3 warpedGalPos = galPos + vec3(galWarp, 0.0) * 0.55;

            float bandProfile = exp(-pow(galLat * 3.8 + galWarp.y * 0.45, 2.0));
            float coreAlignment = dot(normalize(galDir), vec3(cos(0.45), 0.0, sin(0.45)));
            float coreBulge = exp((coreAlignment - 1.0) * 3.2) * exp(-pow(galLat * 2.8, 2.0));

            float starCloudStructure = fbm(warpedGalPos * 1.8);
            float fineFilaments = ridgedFbm(warpedGalPos * 3.4);
            float darkDustRift = smoothstep(0.36, 0.66, fbm(warpedGalPos * 2.5 + vec3(5.2, -3.7, 0.0)));
            float riftMask = darkDustRift * exp(-pow(galLat * 6.8, 2.0)) * 0.80;

            float mwIntensity = clamp((bandProfile * (0.45 + 0.85 * starCloudStructure) + coreBulge * 0.65) * (1.0 - riftMask), 0.0, 1.4);

            vec3 coreColor = vec3(1.0, 0.76, 0.52);
            vec3 outerWingColor = vec3(0.28, 0.52, 0.96);
            vec3 nebulaPink = vec3(0.88, 0.26, 0.58);
            vec3 nebulaCyan = vec3(0.18, 0.78, 0.85);

            float nebulaSpots = pow(clamp(fbm(warpedGalPos * 4.2 + vec3(8.1, 2.3, 0.0)) - 0.42, 0.0, 1.0) * 1.8, 2.2) * bandProfile;
            float cyanWisps = pow(clamp(fineFilaments - 0.48, 0.0, 1.0) * 1.9, 2.0) * bandProfile;

            vec3 galaxyCol = mix(outerWingColor, coreColor, clamp(coreBulge * 1.2 + starCloudStructure * 0.45, 0.0, 1.0)) * mwIntensity * 0.58;
            galaxyCol += nebulaPink * nebulaSpots * (1.0 - riftMask * 0.6) * 0.85;
            galaxyCol += nebulaCyan * cyanWisps * (1.0 - riftMask * 0.5) * 0.42;

            vec2 dustUV = starDir.xz / (starDir.y + 0.18) * 320.0;
            float microStarNoise = pow(hash(floor(dustUV)), 18.0) * (bandProfile * 1.5 + 0.12) * (1.0 - riftMask * 0.7);
            galaxyCol += vec3(0.86, 0.92, 1.0) * microStarNoise * 1.15;

            skyCol += galaxyCol * nightFactor * horizonVis;

            // Twinkling stars
            for (int layer = 0; layer < 2; layer++) {
                float scale = (layer == 0) ? 135.0 : 220.0;
                vec2 starUV = starDir.xz / (starDir.y + 0.15) * scale + float(layer) * 41.7;
                vec2 starCell = floor(starUV);
                float sVal = hash(starCell);
                float densityThreshold = mix(0.9925, 0.976, bandProfile * 0.85);
                if (sVal > densityThreshold) {
                    vec2 center = starCell + 0.3 + 0.4 * vec2(fract(sVal * 17.3), fract(sVal * 31.7));
                    float dStar = length(starUV - center);
                    float twinkle = 0.65 + 0.35 * sin(uTime * (2.5 + float(layer) * 1.5) + sVal * 120.0);
                    float starSpark = smoothstep(0.34, 0.015, dStar) * twinkle * horizonVis;
                    vec3 starColor = mix(vec3(0.70, 0.85, 1.0), vec3(1.0, 0.88, 0.72), fract(sVal * 53.0));
                    skyCol += starColor * starSpark * nightFactor * (layer == 0 ? 1.65 : 0.95);
                }
            }

            // Crisp Moon disc & atmospheric lunar halo
            float moonDot = max(dot(dir, uMoonDir), 0.0);
            float moonDisc = smoothstep(0.9991, 0.99955, dot(dir, uMoonDir));
            float moonHalo = pow(moonDot, 48.0) * 0.38 + pow(moonDot, 8.0) * 0.06;
            skyCol += vec3(0.76, 0.86, 1.0) * (moonDisc * 3.5 + moonHalo) * nightFactor;
        }

        // High-altitude cloud deck with Henyey-Greenstein scattering
        if (dir.y > 0.015 && uCloudCoverage > 0.01) {
            float planeDist = 1.9 / (pow(dir.y, 0.82) + 0.06);
            vec2 cloudUV = dir.xz * planeDist * 0.32;

            float d1 = sampleCloudDensity(cloudUV);
            float d2 = sampleCloudDensity(cloudUV * 1.85 + vec2(21.4, -11.8)) * 0.45;
            float density = clamp(d1 + d2 * 0.5, 0.0, 1.0);

            if (density > 0.004) {
                vec3 primaryLightDir = sunAlt > 0.0 ? uSunDir : uMoonDir;
                vec2 lightStep = primaryLightDir.xz * 0.085;
                float s1 = sampleCloudDensity(cloudUV + lightStep * 0.5);
                float s2 = sampleCloudDensity(cloudUV + lightStep * 1.2);
                float s3 = sampleCloudDensity(cloudUV + lightStep * 2.2);
                float opticalDepth = (s1 * 0.45 + s2 * 0.35 + s3 * 0.20) * 1.35;
                float transmittance = exp(-opticalDepth * 1.65);

                vec3 sunlitTop = mix(vec3(0.10, 0.16, 0.28), vec3(1.0, 1.0, 1.0), dayFactor);
                sunlitTop = mix(sunlitTop, vec3(1.0, 0.65, 0.35), twilightFactor * 0.94);

                vec3 ambientBelly = mix(vec3(0.02, 0.035, 0.08), vec3(0.52, 0.64, 0.78), dayFactor);
                ambientBelly = mix(ambientBelly, vec3(0.30, 0.18, 0.30), twilightFactor * 0.92);

                vec3 cloudCol = mix(ambientBelly, sunlitTop, clamp(transmittance * 0.92 + (1.0 - density) * 0.35, 0.0, 1.0));

                float hgPhase = pow(sunDot, 5.0) * smoothstep(-0.1, 0.4, sunAlt);
                float silverLining = (1.0 - exp(-density * 2.8)) * exp(-opticalDepth * 0.85) * hgPhase;
                cloudCol += mieTint * silverLining * 1.15;

                float moonDotCloud = max(dot(dir, uMoonDir), 0.0);
                float lunarSilver = (1.0 - exp(-density * 2.2)) * exp(-opticalDepth * 0.8) * pow(moonDotCloud, 7.0) * nightFactor;
                cloudCol += vec3(0.55, 0.72, 1.0) * lunarSilver * 0.55;

                float horizonFade = smoothstep(0.012, 0.18, dir.y);
                cloudCol = mix(horizonCol, cloudCol, horizonFade);

                float cloudAlpha = smoothstep(0.01, 0.36, density) * smoothstep(0.012, 0.08, dir.y) * 0.96;
                skyCol = mix(skyCol, cloudCol, cloudAlpha);
            }
        }

        gl_FragColor = vec4(skyCol, 1.0);
    }
`;

function createMaldiveSkyDome() {
    const skyGeo = new THREE.SphereGeometry(720, 64, 32);
    const skyMat = new THREE.ShaderMaterial({
        vertexShader: TIGER_SKY_VERTEX_SHADER,
        fragmentShader: TIGER_SKY_FRAGMENT_SHADER,
        uniforms: {
            uSunDir:          { value: new THREE.Vector3(0.5, 0.8, 0.4).normalize() },
            uMoonDir:         { value: new THREE.Vector3(-0.5, -0.8, -0.4).normalize() },
            uSkyHorizonColor: { value: new THREE.Color(0x397cca) },
            uSkyRotation:     { value: 0 },
            uTime:            { value: 0 },
            uCloudCoverage:   { value: 0.02 }
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    return { skyMesh, skyMat };
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

    // Scratches across the Tiger decal
    ctx.save();
    for (let i = 0; i < 22; i++) {
        const sx0 = 60 + Math.random() * 390;
        const sy0 = 40 + Math.random() * 170;
        const slen = 15 + Math.random() * 55;
        const sAngle = (Math.random() - 0.5) * 0.45;
        ctx.strokeStyle = 'rgba(25, 30, 36, 0.75)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(sx0, sy0 + 1);
        ctx.lineTo(sx0 + Math.cos(sAngle) * slen, sy0 + Math.sin(sAngle) * slen + 1);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(180, 190, 200, 0.85)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(sx0, sy0);
        ctx.lineTo(sx0 + Math.cos(sAngle) * slen, sy0 + Math.sin(sAngle) * slen);
        ctx.stroke();
    }
    ctx.restore();

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

// ----------------------------------------------------------------------------
// Sherman "COUGAR" Sponson Decal Canvas Texture (2048x512)
// ----------------------------------------------------------------------------
function createShermanSponsonDecalTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#444b37');
    grad.addColorStop(0.5, '#3b4230');
    grad.addColorStop(1, '#313728');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2048, 512);

    for (let i = 0; i < 650; i++) {
        const x = Math.random() * 2048;
        const y = Math.random() * 512;
        ctx.fillStyle = (i % 2 === 0) ? 'rgba(25, 30, 18, 0.14)' : 'rgba(95, 105, 78, 0.08)';
        ctx.fillRect(x, y, 2 + Math.random() * 4, 30 + Math.random() * 140);
    }

    ctx.fillStyle = 'rgba(130, 140, 110, 0.25)';
    ctx.fillRect(0, 0, 2048, 8);

    // "T212125" Serial Number
    ctx.save();
    ctx.font = 'bold 62px "Inter", "Arial Narrow", sans-serif';
    ctx.fillStyle = '#e7eadf';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 2;
    ctx.transform(0.86, 0, 0, 1, 1105, 84);
    ctx.fillText('T212125', 0, 0);
    ctx.restore();

    // "COUGAR" bold white stencil
    ctx.save();
    ctx.font = '700 112px "Inter", "Arial Narrow", sans-serif';
    ctx.fillStyle = '#eef0e8';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3;
    ctx.transform(0.76, 0, 0, 1, 560, 255);
    ctx.fillText('COUGAR', 0, 0);
    ctx.restore();

    // Small Allied maintenance stencil
    ctx.fillStyle = '#d8e2ec';
    ctx.fillRect(1685, 385, 68, 36);
    ctx.fillStyle = '#2d4b73';
    ctx.fillRect(1689, 389, 60, 14);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
}

// ----------------------------------------------------------------------------
// Sherman Turret Number "13" Decal Texture (512x512)
// ----------------------------------------------------------------------------
function createShermanTurretDecalTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);

    const radGrad = ctx.createRadialGradient(256, 256, 40, 256, 256, 220);
    radGrad.addColorStop(0, 'rgba(38, 62, 44, 0.85)');
    radGrad.addColorStop(0.78, 'rgba(42, 68, 48, 0.72)');
    radGrad.addColorStop(1, 'rgba(42, 68, 48, 0.0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(256, 256, 220, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.font = '900 285px "Inter", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(256, 268);
    ctx.scale(0.75, 1.05);

    ctx.lineWidth = 28;
    ctx.strokeStyle = '#141813';
    ctx.strokeText('13', 0, 0);

    ctx.fillStyle = '#f2f4ed';
    ctx.fillText('13', 0, 0);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

// ----------------------------------------------------------------------------
// T-34-85 Turret Stencil "311" + Polish Eagle / Star Decal (1024x512)
// ----------------------------------------------------------------------------
function createT34TurretDecalTexture(isLeftSide) {
    const w = 1024;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#20271b');
    grad.addColorStop(0.5, '#242d1f');
    grad.addColorStop(1, '#1b2116');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const numX = isLeftSide ? 420 : 600;
    const eagleX = isLeftSide ? 690 : 330;
    const centerY = 265;

    ctx.save();
    ctx.fillStyle = 'rgba(238, 240, 235, 0.94)';
    ctx.font = 'bold 165px "Inter", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(numX, centerY);
    ctx.scale(0.82, 1.15);
    ctx.fillText('311', 0, 0);
    ctx.restore();

    // Polish Piast Eagle
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

    // Chipping & cast marks
    for (let i = 0; i < 300; i++) {
        const rx = (isLeftSide ? 280 : 220) + Math.random() * 520;
        const ry = 130 + Math.random() * 250;
        const rr = 1 + Math.random() * 3.5;
        ctx.fillStyle = Math.random() > 0.4 ? '#474c3b' : '#313628';
        ctx.beginPath();
        ctx.arc(rx, ry, rr, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
    return new THREE.CanvasTexture(canvas);
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

    const shermanSponsonTex = createShermanSponsonDecalTexture();
    const shermanTurretDecalTex = createShermanTurretDecalTexture();
    const t34DecalLeftTex = createT34TurretDecalTexture(true);
    const t34DecalRightTex = createT34TurretDecalTexture(false);

    return {
        // --- German Pz.VI Tiger I PBR Materials ---
        // Authentic Rolled Homogeneous Armor (RHA) Steel — Uncolored, Raw Gunmetal Metallic Finish
        armor: new THREE.MeshStandardMaterial({
            color: new THREE.Color(0xa6afba).convertSRGBToLinear(),
            map: pbrMaps.albedo,
            normalMap: pbrMaps.normal,
            normalScale: new THREE.Vector2(0.75, 0.75),
            roughnessMap: pbrMaps.roughness,
            roughness: 0.46,
            metalness: 0.22,
            aoMap: pbrMaps.ao,
            aoMapIntensity: 0.55
        }),
        armorDark: new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x8a94a0).convertSRGBToLinear(),
            map: pbrMaps.albedoFine,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.80, 0.80),
            roughness: 0.50,
            metalness: 0.25,
            aoMap: pbrMaps.ao,
            aoMapIntensity: 0.58
        }),
        barrelSteel: new THREE.MeshStandardMaterial({
            color: 0x646972,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.35, 0.35),
            roughness: 0.34,
            metalness: 0.72
        }),
        muzzleBlack: new THREE.MeshStandardMaterial({
            color: 0x1e2024,
            roughness: 0.55,
            metalness: 0.45
        }),
        rubberTire: new THREE.MeshStandardMaterial({
            color: 0x1a1c1e,
            roughness: 0.85,
            metalness: 0.04
        }),
        trackSteel: new THREE.MeshStandardMaterial({
            color: 0x3c4046,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.65, 0.65),
            roughness: 0.48,
            metalness: 0.76
        }),
        woodHandle: new THREE.MeshStandardMaterial({
            map: woodTex,
            roughness: 0.72,
            metalness: 0.04
        }),
        cableSteel: new THREE.MeshStandardMaterial({
            color: 0x6c727a,
            roughness: 0.38,
            metalness: 0.82
        }),
        grille: new THREE.MeshStandardMaterial({
            map: grilleTex,
            roughness: 0.42,
            metalness: 0.75
        }),
        decal3818: new THREE.MeshStandardMaterial({
            map: decal3818Tex,
            transparent: true,
            roughness: 0.52,
            metalness: 0.10,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2
        }),

        // --- US M4 Sherman PBR Materials ---
        shermanOlive: new THREE.MeshStandardMaterial({
            color: 0x626c50,
            map: pbrMaps.albedo,
            normalMap: pbrMaps.normal,
            normalScale: new THREE.Vector2(0.35, 0.35),
            roughnessMap: pbrMaps.roughness,
            roughness: 0.65,
            metalness: 0.08,
            aoMap: pbrMaps.ao,
            aoMapIntensity: 0.28
        }),
        shermanCast: new THREE.MeshStandardMaterial({
            color: 0x525c42,
            map: pbrMaps.albedoFine,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.40, 0.40),
            roughness: 0.68,
            metalness: 0.08,
            aoMap: pbrMaps.ao,
            aoMapIntensity: 0.30
        }),
        shermanSponson: new THREE.MeshStandardMaterial({
            map: shermanSponsonTex,
            roughness: 0.62,
            metalness: 0.08,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.30, 0.30),
            aoMap: pbrMaps.ao,
            aoMapIntensity: 0.25
        }),
        shermanTurretDecal: new THREE.MeshStandardMaterial({
            map: shermanTurretDecalTex,
            transparent: true,
            roughness: 0.45,
            metalness: 0.10,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2
        }),
        shermanTrackPad: new THREE.MeshStandardMaterial({
            color: 0x2e302e,
            roughness: 0.78,
            metalness: 0.04
        }),
        shermanTrackSteel: new THREE.MeshStandardMaterial({
            color: 0x60666c,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.30, 0.30),
            roughness: 0.45,
            metalness: 0.55
        }),

        // --- Soviet T-34-85 PBR Materials ---
        t34Green: new THREE.MeshStandardMaterial({
            color: 0x546644,
            map: pbrMaps.albedo,
            normalMap: pbrMaps.normal,
            normalScale: new THREE.Vector2(0.55, 0.55),
            roughnessMap: pbrMaps.roughness,
            roughness: 0.66,
            metalness: 0.08,
            aoMap: pbrMaps.ao,
            aoMapIntensity: 0.28
        }),
        t34Cast: new THREE.MeshStandardMaterial({
            color: 0x465838,
            map: pbrMaps.albedoFine,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.8, 0.8),
            roughness: 0.70,
            metalness: 0.08,
            aoMap: pbrMaps.ao,
            aoMapIntensity: 0.30
        }),
        t34DecalLeft: new THREE.MeshStandardMaterial({
            map: t34DecalLeftTex,
            roughness: 0.56,
            metalness: 0.28
        }),
        t34DecalRight: new THREE.MeshStandardMaterial({
            map: t34DecalRightTex,
            roughness: 0.56,
            metalness: 0.28
        }),
        t34TrackMetal: new THREE.MeshStandardMaterial({
            color: 0x2a2e28,
            normalMap: pbrMaps.normalFine,
            normalScale: new THREE.Vector2(0.7, 0.7),
            roughness: 0.45,
            metalness: 0.78
        }),
        t34Rubber: new THREE.MeshStandardMaterial({
            color: 0x16181b,
            roughness: 0.88,
            metalness: 0.08
        }),
        t34Rust: new THREE.MeshStandardMaterial({
            color: 0x4d3222,
            roughness: 0.85,
            metalness: 0.2
        }),
        t34Log: new THREE.MeshStandardMaterial({
            map: woodTex,
            roughness: 0.88,
            metalness: 0.02
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
window.createShermanSponsonDecalTexture = createShermanSponsonDecalTexture;
window.createShermanTurretDecalTexture = createShermanTurretDecalTexture;
window.createT34TurretDecalTexture = createT34TurretDecalTexture;
window.createGrilleTexture = createGrilleTexture;
window.createMaterials = createMaterials;
window.haltonRadicalInverse = haltonRadicalInverse;
window.createHaltonPatternTexture = createHaltonPatternTexture;
window.createBlueNoiseTexture = createBlueNoiseTexture;
window.createHaltonSmokeMaterial = createHaltonSmokeMaterial;
window.createMaldiveSmokeMaterial = createMaldiveSmokeMaterial;
window.createOpaqueVolumetricSmokeMaterial = createOpaqueVolumetricSmokeMaterial;
window.createBlueNoiseSmokeMaterial = createBlueNoiseSmokeMaterial;
window.createVolumetricSmokeGeometry = createVolumetricSmokeGeometry;
window.createGrassTuftGeometry = createGrassTuftGeometry;
window.createGrassMaterial = createGrassMaterial;
window.createRiverWaterMaterial = createRiverWaterMaterial;
window.createCoastalOceanMaterial = createCoastalOceanMaterial;
window.createMaldiveSkyDome = createMaldiveSkyDome;
window.createBotanicalFoliageAtlas = createBotanicalFoliageAtlas;
window.createGrassTuftAtlasTexture = createGrassTuftAtlasTexture;
window.getGrassTuftEdgeTexture = getGrassTuftEdgeTexture;
window.createVillagePBRAtlas = createVillagePBRAtlas;
