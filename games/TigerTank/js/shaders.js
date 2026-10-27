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
// 64x64 Void-and-Cluster Blue Noise Matrix Generator (Robert Ulichney)
// Mathematically engineered with zero low-frequency energy for minimum grain.
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

    // Toroidal Gaussian energy filter for Void-and-Cluster spatial relaxation
    const sigma = 1.9;
    const R = 3;
    const lut = [];
    for (let y = -R; y <= R; y++) {
        for (let x = -R; x <= R; x++) {
            lut.push({ dx: x, dy: y, w: Math.exp(-(x * x + y * y) / (2 * sigma * sigma)) });
        }
    }

    const energy = new Float32Array(total);

    for (let i = 0; i < total; i++) {
        // Find largest void (minimum Gaussian energy location)
        let minIdx = 0, minE = energy[0];
        for (let j = 1; j < total; j++) {
            if (energy[j] < minE) {
                minE = energy[j];
                minIdx = j;
            }
        }

        // Assign normalized threshold [0, 255]
        const threshold = Math.floor(((i + 0.5) / total) * 255);
        const pIdx = minIdx * 4;
        imgData.data[pIdx]     = threshold;
        imgData.data[pIdx + 1] = threshold;
        imgData.data[pIdx + 2] = threshold;
        imgData.data[pIdx + 3] = 255;

        // Mark as occupied and diffuse Gaussian energy into toroidal neighborhood
        energy[minIdx] += 999999;
        const mx = minIdx % size;
        const my = Math.floor(minIdx / size);
        for (let k = 0; k < lut.length; k++) {
            const nx = (mx + lut[k].dx + size) % size;
            const ny = (my + lut[k].dy + size) % size;
            energy[ny * size + nx] += lut[k].w;
        }
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

// Procedural Multi-Lobed Volumetric Smoke Puff Geometry
let _volumetricSmokeGeo = null;

function createVolumetricSmokeGeometry() {
    if (_volumetricSmokeGeo) return _volumetricSmokeGeo;

    // Use an icosahedron base (detail 2: 80 faces, 42 vertices) for crisp, low-overhead billows
    const geo = new THREE.IcosahedronGeometry(1.0, 2);
    const pos = geo.attributes.position;

    // 6 Primary billowing cloud lobe centers (asymmetric bulging puffs)
    const lobes = [
        { x:  0.55, y:  0.42, z:  0.22, r: 0.58 },
        { x: -0.52, y:  0.38, z:  0.32, r: 0.54 },
        { x:  0.08, y:  0.68, z: -0.42, r: 0.52 },
        { x: -0.32, y: -0.35, z:  0.48, r: 0.46 },
        { x:  0.42, y: -0.28, z: -0.38, r: 0.48 },
        { x:  0.02, y: -0.52, z:  0.15, r: 0.44 }
    ];

    for (let i = 0; i < pos.count; i++) {
        let vx = pos.getX(i);
        let vy = pos.getY(i);
        let vz = pos.getZ(i);
        const len = Math.hypot(vx, vy, vz) || 1.0;
        const nx = vx / len;
        const ny = vy / len;
        const nz = vz / len;

        // Proximity displacement from billowing lobes
        let lobeDisp = 0.0;
        for (let j = 0; j < lobes.length; j++) {
            const lb = lobes[j];
            const dot = Math.max(0, nx * lb.x + ny * lb.y + nz * lb.z);
            lobeDisp += lb.r * Math.pow(dot, 2.2);
        }

        // Multi-frequency 3D sinusoidal turbulence for organic billowing ridges
        const turb = (
            Math.sin(nx * 3.4 + ny * 1.2) * Math.cos(nz * 3.1) * 0.16 +
            Math.cos(ny * 6.2 - nz * 2.5) * 0.10 +
            Math.sin(nx * 9.5 + nz * 8.1) * 0.05
        );

        const r = 1.0 + lobeDisp * 0.72 + turb;
        pos.setXYZ(i, nx * r, ny * r, nz * r);
    }

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
                for (int i = 0; i < 3; i++) {
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

                // 2. Band-Limited Void-and-Cluster Blue Noise Sampling:
                // Core of the cloud (finalDensity >= 0.82) is completely SOLID (Zero grain / Zero noise!)
                // Only the feathered outer ~18% perimeter and late evaporative wisps use Blue Noise!
                if (finalDensity < 0.82) {
                    vec2 ditherCoord = (gl_FragCoord.xy + ditherOffset) / 64.0;
                    float blueNoiseThreshold = texture2D(blueNoiseMap, ditherCoord).r;

                    // Normalize edge band [0.0, 0.82] to [0.0, 1.0] for optimal high-frequency dispersion
                    float edgeFactor = finalDensity / 0.82;
                    if (edgeFactor < blueNoiseThreshold) {
                        discard;
                    }
                }

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

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        blending: THREE.NoBlending
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

            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);

                vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
                vWorldPos = worldPos.xyz;

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

            void main() {
                // Vertical botanical gradient from damp roots to golden sunlit tips
                vec3 bladeColor = mix(rootColor, mix(midColor, tipColor, smoothstep(0.35, 1.0, vUv.y)), smoothstep(0.0, 0.35, vUv.y));

                // Natural wrap lighting for foliage translucency
                float NdotL = max(abs(dot(vNormal, sunDirection)), 0.28);
                vec3 finalColor = bladeColor * (sunColor * NdotL + skyColor * 0.38);

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
                // Fluid river currents and gentle rolling riverbed waves
                float flow = uTime * 0.35;
                float wave1 = sin((position.x + flow * 2.2) * 0.55 + position.z * 0.35) * 0.038;
                float wave2 = cos((position.x - flow * 1.4) * 0.95 + position.z * 0.75) * 0.022;

                vec3 pos = position;
                pos.y += wave1 + wave2;

                vec4 worldPos = modelMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos.xyz;
                vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                vViewDir = normalize(cameraPosition - worldPos.xyz);

                // Riverbed width is 26m, z coordinates range -13 to +13 relative to river center
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
                // Dual flowing ripple layers
                vec2 uv1 = vWorldPos.xz * 0.22 + vec2(uTime * 0.14, uTime * 0.03);
                vec2 uv2 = vWorldPos.xz * 0.38 - vec2(uTime * 0.08, -uTime * 0.06);

                // Animated wave normal perturbations
                vec3 n1 = vec3(sin(uv1.x * 14.0) * 0.18, 1.0, cos(uv1.y * 14.0) * 0.18);
                vec3 n2 = vec3(cos(uv2.x * 18.0) * 0.14, 1.0, sin(uv2.y * 18.0) * 0.14);
                vec3 waveNormal = normalize(vNormal + n1 * 0.45 + n2 * 0.45);

                // Fresnel reflectance (steep angle = transparent water; shallow grazing = sky reflection)
                float NdotV = max(dot(waveNormal, vViewDir), 0.0);
                float fresnel = clamp(pow(1.0 - NdotV, 3.2), 0.12, 0.96);

                // Water Depth Color (Emerald shallows vs Deep navy riverbed channel)
                float depthFactor = clamp(vShoreDist / 7.5, 0.0, 1.0);
                vec3 shallowCol = vec3(0.18, 0.38, 0.36);
                vec3 deepCol    = vec3(0.06, 0.18, 0.26);
                vec3 waterBase  = mix(shallowCol, deepCol, depthFactor);

                // Sky mirror reflection
                vec3 reflectSky = mix(skyColor * 0.85, vec3(0.92, 0.96, 1.0), fresnel);

                // Glistening Sun / Moon Specular Glints
                vec3 halfVec = normalize(sunDirection + vViewDir);
                float spec = pow(max(dot(waveNormal, halfVec), 0.0), 96.0);
                vec3 specGlint = sunColor * spec * 2.4;

                // Shoreline white foam / froth pulsing along riverbanks
                float foamNoise = sin(vWorldPos.x * 3.5 + uTime * 2.2) * cos(vWorldPos.z * 4.2);
                float shoreFoam = smoothstep(1.3, 0.1, vShoreDist) * clamp(0.5 + 0.5 * foamNoise, 0.0, 1.0);
                vec3 foamColor = vec3(0.94, 0.97, 0.99);

                // Composite final river water
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

        float composite = baseFronts * 0.62 + billowingTurbulence * 0.25 + wispyEdges * 0.13;
        float threshold = mix(0.66, 0.35, uCloudCoverage);
        return smoothstep(threshold, threshold + 0.22, composite);
    }

    void main() {
        vec3 dir = normalize(vWorldPos - cameraPosition);
        float y = max(dir.y, 0.001);

        float sunAlt = uSunDir.y;
        float dayFactor = smoothstep(-0.12, 0.25, sunAlt);
        float twilightFactor = smoothstep(-0.22, 0.08, sunAlt) * (1.0 - smoothstep(0.05, 0.38, sunAlt));
        float nightFactor = 1.0 - smoothstep(-0.18, 0.05, sunAlt);

        // Rayleigh-Mie realistic sky gradient
        vec3 dayZenith = vec3(0.008, 0.09, 0.34);
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

                vec3 sunlitTop = mix(vec3(0.10, 0.16, 0.28), vec3(0.98, 0.99, 1.0), dayFactor);
                sunlitTop = mix(sunlitTop, vec3(1.0, 0.52, 0.24), twilightFactor * 0.94);

                vec3 ambientBelly = mix(vec3(0.02, 0.035, 0.08), vec3(0.46, 0.58, 0.74), dayFactor);
                ambientBelly = mix(ambientBelly, vec3(0.26, 0.14, 0.28), twilightFactor * 0.92);

                vec3 cloudCol = mix(ambientBelly, sunlitTop, clamp(transmittance * 0.85 + (1.0 - density) * 0.25, 0.0, 1.0));

                float hgPhase = pow(sunDot, 6.0) * smoothstep(-0.1, 0.4, sunAlt);
                float silverLining = (1.0 - exp(-density * 2.5)) * exp(-opticalDepth * 0.9) * hgPhase;
                cloudCol += mieTint * silverLining * 0.95;

                float moonDotCloud = max(dot(dir, uMoonDir), 0.0);
                float lunarSilver = (1.0 - exp(-density * 2.2)) * exp(-opticalDepth * 0.8) * pow(moonDotCloud, 7.0) * nightFactor;
                cloudCol += vec3(0.55, 0.72, 1.0) * lunarSilver * 0.55;

                float horizonFade = smoothstep(0.015, 0.22, dir.y);
                cloudCol = mix(horizonCol, cloudCol, horizonFade);

                float cloudAlpha = smoothstep(0.01, 0.42, density) * smoothstep(0.015, 0.08, dir.y) * 0.94;
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
            uCloudCoverage:   { value: 0.42 }
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
window.createMaldiveSkyDome = createMaldiveSkyDome;
