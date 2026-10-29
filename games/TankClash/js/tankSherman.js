// ============================================================================
// M4 Sherman Medium Tank ("COUGAR" / Turret #13 / T212125)
// Exact 1:1 Architectural Port of the High-Fidelity Monument Simulation Model
// Welded Hull with Custom Extruded Glacis Profile, Cast Differential Nose,
// 3-Row Glacis Spare Tracks, "COUGAR" Sponson Decal & Memorial Plaques,
// Authentic Cast Turret with #13 Decal, M34A1 Mantlet, 75mm M3 Cannon,
// 6 VVSS Bogies (Crab Housing, Volute Coils, Scissor Arms, Skid Straps),
// 13-Tooth Drive Sprockets, Ribbed Idlers, and Articulated Chevron Tracks
// ============================================================================

const shermanAssetCache = {};

// Textures and materials are built once per variant (enemy/player) and reused by every tank of that variant.
function getShermanSharedAssets(isEnemy) {
    const key = isEnemy ? 'enemy' : 'player';
    if (shermanAssetCache[key]) return shermanAssetCache[key];

    // ============================================================================
    // 1. PROCEDURAL PBR MAPS (Rolled & Cast Armor, Scratch Textures & Sobel Normals)
    // ============================================================================
    function generateShermanPBRMaps() {
        const size = 512;
        const rolledHF = new Float32Array(size * size);
        const castHF   = new Float32Array(size * size);

        // Reproducible PRNG for scratch placement
        let sSeed = 7391;
        function sRand() {
            sSeed = (sSeed * 16807) % 2147483647;
            return (sSeed - 1) / 2147483646;
        }

        // A. Rolled Homogeneous Armor (RHA) Base Heightfield:
        // Smooth steel rolling mill texture, subtle plate waviness
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = y * size + x;
                const wave = Math.sin(x * 0.05) * Math.cos(y * 0.05) * 0.025;
                const grain = Math.sin(x * 0.30) * 0.012; // longitudinal mill rolling grain
                rolledHF[idx] = 0.50 + wave + grain;
            }
        }

        // Add authentic clean, rounded weld seams on rolled armor
        function drawShermanWeld(x0, y0, x1, y1, width = 4.0) {
            const dx = x1 - x0;
            const dy = y1 - y0;
            const len = Math.hypot(dx, dy);
            const steps = Math.floor(len * 1.6);
            for (let s = 0; s < steps; s++) {
                const t = s / steps;
                const cx = Math.floor(x0 + dx * t + Math.sin(s * 0.9) * 0.8);
                const cy = Math.floor(y0 + dy * t + Math.cos(s * 0.9) * 0.8);
                for (let rx = -width; rx <= width; rx++) {
                    for (let ry = -width; ry <= width; ry++) {
                        const px = (cx + rx + size) % size;
                        const py = (cy + ry + size) % size;
                        const dist = Math.hypot(rx, ry);
                        if (dist < width) {
                            const idx = py * size + px;
                            const bead = Math.cos(dist / width * Math.PI * 0.5) * 0.22;
                            rolledHF[idx] = Math.min(1.0, rolledHF[idx] + bead);
                        }
                    }
                }
            }
        }

        // Weld perimeter & transverse plate joints
        drawShermanWeld(12, 12, size - 12, 12, 4.0);
        drawShermanWeld(size - 12, 12, size - 12, size - 12, 4.0);
        drawShermanWeld(12, size - 12, size - 12, size - 12, 4.0);
        drawShermanWeld(12, 12, 12, size - 12, 4.0);
        drawShermanWeld(Math.floor(size * 0.44), 12, Math.floor(size * 0.44), size - 12, 3.5);

        // B. Cast Steel Heightfield: Smooth curved cast metal with gentle low-frequency undulations
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = y * size + x;
                const castWaves = Math.sin(x * 0.12) * Math.cos(y * 0.12) * 0.035
                                + Math.sin(x * 0.32 + y * 0.22) * 0.02
                                + Math.sin(x * 0.65 - y * 0.55) * 0.012;
                castHF[idx] = 0.50 + castWaves;
            }
        }

        // C. Procedural Scratch Patterns (Glancing scratches, ricochets & micro-scuffs)
        const rolledScratches = [];
        // 80 prominent linear scratches & branch/cable scrapes
        for (let s = 0; s < 80; s++) {
            const x0 = Math.floor(sRand() * size);
            const y0 = Math.floor(sRand() * size);
            const angle = sRand() * Math.PI * 2;
            const length = 16 + sRand() * 65;
            const curvature = (sRand() - 0.5) * 0.035;
            rolledScratches.push({ x0, y0, angle, length, curvature, isMajor: true });
        }
        // 240 fine micro-scratches & abrasions
        for (let s = 0; s < 240; s++) {
            const x0 = Math.floor(sRand() * size);
            const y0 = Math.floor(sRand() * size);
            const angle = sRand() * Math.PI * 2;
            const length = 3 + sRand() * 12;
            rolledScratches.push({ x0, y0, angle, length, curvature: 0, isMajor: false });
        }

        // Etch scratch grooves into rolledHF so Sobel normal map produces 3D grooves
        rolledScratches.forEach(sc => {
            const steps = Math.floor(sc.length * 1.5);
            let cx = sc.x0;
            let cy = sc.y0;
            let curAngle = sc.angle;
            for (let step = 0; step < steps; step++) {
                cx += Math.cos(curAngle) * 0.7;
                cy += Math.sin(curAngle) * 0.7;
                curAngle += sc.curvature;
                const px = Math.floor((cx % size + size) % size);
                const py = Math.floor((cy % size + size) % size);
                rolledHF[py * size + px] = Math.max(0.08, rolledHF[py * size + px] - (sc.isMajor ? 0.15 : 0.08));
            }
        });

        // 50 Cast steel scratches & ricochet scrapes
        const castScratches = [];
        for (let s = 0; s < 50; s++) {
            const x0 = Math.floor(sRand() * size);
            const y0 = Math.floor(sRand() * size);
            const angle = sRand() * Math.PI * 2;
            const length = 10 + sRand() * 45;
            castScratches.push({ x0, y0, angle, length });
        }
        castScratches.forEach(sc => {
            const steps = Math.floor(sc.length * 1.5);
            let cx = sc.x0, cy = sc.y0;
            for (let step = 0; step < steps; step++) {
                cx += Math.cos(sc.angle) * 0.7;
                cy += Math.sin(sc.angle) * 0.7;
                const px = Math.floor((cx % size + size) % size);
                const py = Math.floor((cy % size + size) % size);
                castHF[py * size + px] = Math.max(0.08, castHF[py * size + px] - 0.14);
            }
        });

        // D. Tangent-Space Sobel Normal Filter Function
        function computeSobelNormalMap(hf, strength) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            const img = ctx.createImageData(size, size);

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const xm = (x - 1 + size) % size;
                    const xp = (x + 1) % size;
                    const ym = (y - 1 + size) % size;
                    const yp = (y + 1) % size;

                    const tl = hf[ym * size + xm];
                    const l  = hf[y  * size + xm];
                    const bl = hf[yp * size + xm];
                    const t  = hf[ym * size + x];
                    const b  = hf[yp * size + x];
                    const tr = hf[ym * size + xp];
                    const r  = hf[y  * size + xp];
                    const br = hf[yp * size + xp];

                    const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
                    const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);

                    let nx = -dX * strength;
                    let ny = -dY * strength;
                    let nz = 1.0;
                    const len = Math.hypot(nx, ny, nz);
                    nx /= len; ny /= len; nz /= len;

                    const p = (y * size + x) * 4;
                    img.data[p + 0] = Math.floor((nx * 0.5 + 0.5) * 255);
                    img.data[p + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
                    img.data[p + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
                    img.data[p + 3] = 255;
                }
            }
            ctx.putImageData(img, 0, 0);
            return canvas;
        }

        // E. Rolled Armor Albedo, Roughness & Ambient Occlusion Maps
        const rolledAlbedoCanvas    = document.createElement('canvas');
        const rolledRoughnessCanvas = document.createElement('canvas');
        const rolledAOCanvas        = document.createElement('canvas');
        rolledAlbedoCanvas.width = rolledRoughnessCanvas.width = rolledAOCanvas.width = size;
        rolledAlbedoCanvas.height = rolledRoughnessCanvas.height = rolledAOCanvas.height = size;

        const aCtx  = rolledAlbedoCanvas.getContext('2d');
        const rCtx  = rolledRoughnessCanvas.getContext('2d');
        const aoCtx = rolledAOCanvas.getContext('2d');

        const aImg  = aCtx.createImageData(size, size);
        const rImg  = rCtx.createImageData(size, size);
        const aoImg = aoCtx.createImageData(size, size);

        for (let y = 0; y < size; y++) {
            const verticalTension = Math.sin(y * 0.04) * 2.5 + (y / size) * 4.0;
            for (let x = 0; x < size; x++) {
                const i = y * size + x;
                const h = rolledHF[i];
                const p = i * 4;

                // Weathered dark green military steel
                let r = 18 + (h - 0.5) * 18 - verticalTension * 0.35;
                let g = 28 + (h - 0.5) * 20 - verticalTension * 0.28;
                let b = 20 + (h - 0.5) * 18 - verticalTension * 0.22;

                // Bare steel sheen on weld peaks
                if (h > 0.64) {
                    r = 40 + Math.random() * 8;
                    g = 52 + Math.random() * 8;
                    b = 42 + Math.random() * 6;
                }

                // Subtle edge sheen
                const edgeSheen = Math.sin(x * 0.15) * Math.cos(y * 0.15);
                if (edgeSheen > 0.72) {
                    r += 6; g += 7; b += 6;
                }

                aImg.data[p + 0] = Math.min(255, Math.max(0, Math.floor(r)));
                aImg.data[p + 1] = Math.min(255, Math.max(0, Math.floor(g)));
                aImg.data[p + 2] = Math.min(255, Math.max(0, Math.floor(b)));
                aImg.data[p + 3] = 255;

                // Roughness: Subdued satin eggshell finish (reduced specular highlight)
                let rough = 126 + Math.floor((1.0 - h) * 30);
                if (h > 0.64) rough = 92; // smooth bare steel welds
                rImg.data[p + 0] = rough;
                rImg.data[p + 1] = rough;
                rImg.data[p + 2] = rough;
                rImg.data[p + 3] = 255;

                // Gentle ambient occlusion
                const r1 = 8, r2 = 20;
                const hN1 = rolledHF[((y - r1 + size) % size) * size + x];
                const hS1 = rolledHF[((y + r1) % size) * size + x];
                const hE1 = rolledHF[y * size + ((x + r1) % size)];
                const hW1 = rolledHF[y * size + ((x - r1 + size) % size)];
                const avg1 = (hN1 + hS1 + hE1 + hW1) * 0.25;

                const hN2 = rolledHF[((y - r2 + size) % size) * size + x];
                const hS2 = rolledHF[((y + r2) % size) * size + x];
                const hE2 = rolledHF[y * size + ((x + r2) % size)];
                const hW2 = rolledHF[y * size + ((x - r2 + size) % size)];
                const avg2 = (hN2 + hS2 + hE2 + hW2) * 0.25;

                const cavity = Math.max(0, (avg1 - h) * 1.5 + (avg2 - h) * 1.0);
                const aoVal = Math.min(255, Math.max(140, Math.floor(255 - cavity * 80)));
                aoImg.data[p + 0] = aoVal;
                aoImg.data[p + 1] = aoVal;
                aoImg.data[p + 2] = aoVal;
                aoImg.data[p + 3] = 255;
            }
        }

        // Render exposed bright bare-steel scratches onto Albedo & Roughness
        rolledScratches.forEach(sc => {
            const steps = Math.floor(sc.length * 1.5);
            let cx = sc.x0, cy = sc.y0, curAngle = sc.angle;
            for (let step = 0; step < steps; step++) {
                cx += Math.cos(curAngle) * 0.7;
                cy += Math.sin(curAngle) * 0.7;
                curAngle += sc.curvature;
                const px = Math.floor((cx % size + size) % size);
                const py = Math.floor((cy % size + size) % size);
                const p = (py * size + px) * 4;

                // Bare steel scratch core: bright metallic silver highlight
                const scratchBright = sc.isMajor ? (138 + Math.floor(sRand() * 26)) : (115 + Math.floor(sRand() * 20));
                aImg.data[p + 0] = scratchBright;
                aImg.data[p + 1] = scratchBright + 2;
                aImg.data[p + 2] = scratchBright + 4;

                // Bare steel scratch has tasteful subtle sheen (not blinding white specular)
                rImg.data[p + 0] = 68;
                rImg.data[p + 1] = 68;
                rImg.data[p + 2] = 68;

                // Flanking dark paint primer rim on scratch edges
                if (sc.isMajor) {
                    [-1, 1].forEach(offset => {
                        const nx = Math.floor((px - Math.sin(curAngle) * offset + size) % size);
                        const ny = Math.floor((py + Math.cos(curAngle) * offset + size) % size);
                        const np = (ny * size + nx) * 4;
                        aImg.data[np + 0] = Math.max(24, aImg.data[np + 0] - 20);
                        aImg.data[np + 1] = Math.max(26, aImg.data[np + 1] - 20);
                        aImg.data[np + 2] = Math.max(24, aImg.data[np + 2] - 20);
                    });
                }
            }
        });

        aCtx.putImageData(aImg, 0, 0);
        rCtx.putImageData(rImg, 0, 0);
        aoCtx.putImageData(aoImg, 0, 0);

        // F. Cast Steel Albedo & Roughness Maps
        const castAlbedoCanvas    = document.createElement('canvas');
        const castRoughnessCanvas = document.createElement('canvas');
        castAlbedoCanvas.width = castRoughnessCanvas.width = size;
        castAlbedoCanvas.height = castRoughnessCanvas.height = size;
        const caCtx = castAlbedoCanvas.getContext('2d');
        const crCtx = castRoughnessCanvas.getContext('2d');
        const caImg = caCtx.createImageData(size, size);
        const crImg = crCtx.createImageData(size, size);

        for (let i = 0; i < size * size; i++) {
            const h = castHF[i];
            const p = i * 4;

            // Deep dark green cast armor
            const cr = Math.min(255, Math.max(8, Math.floor(14 + (h - 0.5) * 18)));
            const cg = Math.min(255, Math.max(12, Math.floor(26 + (h - 0.5) * 20)));
            const cb = Math.min(255, Math.max(8, Math.floor(16 + (h - 0.5) * 18)));

            caImg.data[p + 0] = cr;
            caImg.data[p + 1] = cg;
            caImg.data[p + 2] = cb;
            caImg.data[p + 3] = 255;

            // Cast steel roughness: subdued satin finish
            const cRough = Math.min(255, Math.max(90, Math.floor(122 + (1.0 - h) * 28)));
            crImg.data[p + 0] = cRough;
            crImg.data[p + 1] = cRough;
            crImg.data[p + 2] = cRough;
            crImg.data[p + 3] = 255;
        }

        // Render cast steel scratch gouges
        castScratches.forEach(sc => {
            const steps = Math.floor(sc.length * 1.5);
            let cx = sc.x0, cy = sc.y0;
            for (let step = 0; step < steps; step++) {
                cx += Math.cos(sc.angle) * 0.7;
                cy += Math.sin(sc.angle) * 0.7;
                const px = Math.floor((cx % size + size) % size);
                const py = Math.floor((cy % size + size) % size);
                const p = (py * size + px) * 4;

                const scratchBright = 130 + Math.floor(sRand() * 24);
                caImg.data[p + 0] = scratchBright;
                caImg.data[p + 1] = scratchBright;
                caImg.data[p + 2] = scratchBright + 2;
                crImg.data[p + 0] = 72;
                crImg.data[p + 1] = 72;
                crImg.data[p + 2] = 72;
            }
        });

        caCtx.putImageData(caImg, 0, 0);
        crCtx.putImageData(crImg, 0, 0);

        // Compute high-definition smooth normal maps via Sobel convolution (includes 3D scratch grooves)
        const rolledNormalCanvas = computeSobelNormalMap(rolledHF, 2.0);
        const castNormalCanvas   = computeSobelNormalMap(castHF, 2.4);

        const makeTex = (canvas, repeat = 2.0) => {
            const t = new THREE.CanvasTexture(canvas);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(repeat, repeat);
            t.anisotropy = 8;
            return t;
        };

        return {
            rolledAlbedo:     makeTex(rolledAlbedoCanvas, 2.0),
            rolledAlbedoFine: makeTex(rolledAlbedoCanvas, 4.0),
            rolledNormal:     makeTex(rolledNormalCanvas, 2.0),
            rolledNormalFine: makeTex(rolledNormalCanvas, 4.0),
            rolledRoughness:  makeTex(rolledRoughnessCanvas, 2.0),
            rolledAO:         makeTex(rolledAOCanvas, 1.5),
            castAlbedo:       makeTex(castAlbedoCanvas, 2.5),
            castNormal:       makeTex(castNormalCanvas, 2.5),
            castRoughness:    makeTex(castRoughnessCanvas, 2.5)
        };
    }

    const shermanMaps = generateShermanPBRMaps();

    function createRightSponsonTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Weathered cool slate-grey steel gradient (grayer!)
        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, '#444b46');
        grad.addColorStop(0.5, '#383e3a');
        grad.addColorStop(1, '#2c322e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2048, 512);

        // Subtle vertical plate sheen
        for (let i = 0; i < 400; i++) {
            const x = Math.random() * 2048;
            const y = Math.random() * 512;
            ctx.fillStyle = (i % 2 === 0) ? 'rgba(25, 30, 28, 0.14)' : 'rgba(120, 130, 125, 0.08)';
            ctx.fillRect(x, y, 2 + Math.random() * 3, 20 + Math.random() * 100);
        }

        // Top weld edge highlight
        ctx.fillStyle = 'rgba(145, 155, 150, 0.35)';
        ctx.fillRect(0, 0, 2048, 8);

        // Allied White Star inside broken yellow circle on front-mid sponson
        ctx.save();
        ctx.translate(1420, 256);
        ctx.strokeStyle = 'rgba(225, 185, 55, 0.85)';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(0, 0, 110, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#f0f3eb';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a1 = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const r1 = 95;
            const x1 = Math.cos(a1) * r1;
            const y1 = Math.sin(a1) * r1;
            if (i === 0) ctx.moveTo(x1, y1);
            else ctx.lineTo(x1, y1);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // "T212125" Serial Number near upper edge
        ctx.save();
        ctx.font = 'bold 64px "Inter", "Arial Narrow", sans-serif';
        ctx.fillStyle = '#eef3e8';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 3;
        ctx.transform(0.86, 0, 0, 1, 1080, 88);
        ctx.fillText('T212125', 0, 0);
        ctx.restore();

        // "COUGAR" bold white stencil on mid-rear hull side
        ctx.save();
        ctx.font = '700 118px "Inter", "Arial Narrow", sans-serif';
        ctx.fillStyle = '#f4f7ef';
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 4;
        ctx.transform(0.76, 0, 0, 1, 540, 260);
        ctx.fillText('COUGAR', 0, 0);
        ctx.restore();

        // Allied division tactical marking (Blue & Red patch)
        ctx.fillStyle = '#2b588a';
        ctx.fillRect(1750, 375, 75, 45);
        ctx.fillStyle = '#b83232';
        ctx.fillRect(1750, 420, 75, 45);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(1748, 373, 79, 94);

        // High-definition realistic scratches cutting through sponson armor & stencils
        ctx.save();
        for (let i = 0; i < 70; i++) {
            const sx0 = Math.random() * 2048;
            const sy0 = Math.random() * 512;
            const slen = 25 + Math.random() * 95;
            const sAngle = (Math.random() - 0.5) * 0.40;
            const sx1 = sx0 + Math.cos(sAngle) * slen;
            const sy1 = sy0 + Math.sin(sAngle) * slen;

            // Dark groove shadow
            ctx.strokeStyle = 'rgba(18, 22, 20, 0.70)';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(sx0, sy0 + 1);
            ctx.lineTo(sx1, sy1 + 1);
            ctx.stroke();

            // Bright bare silver steel highlight
            ctx.strokeStyle = 'rgba(175, 185, 188, 0.88)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(sx0, sy0);
            ctx.lineTo(sx1, sy1);
            ctx.stroke();
        }
        ctx.restore();

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 8;
        return tex;
    }

    function createTurretNumberDecal() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 512, 512);

        // Dark charcoal-grey circular patch around "13"
        const radGrad = ctx.createRadialGradient(256, 256, 40, 256, 256, 220);
        radGrad.addColorStop(0, 'rgba(26, 32, 28, 0.90)');
        radGrad.addColorStop(0.78, 'rgba(30, 36, 32, 0.78)');
        radGrad.addColorStop(1, 'rgba(30, 36, 32, 0.0)');
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(256, 256, 220, 0, Math.PI * 2);
        ctx.fill();

        // Bold "13" with black border
        ctx.save();
        ctx.font = '900 285px "Inter", "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.translate(256, 268);
        ctx.scale(0.75, 1.05);

        ctx.lineWidth = 28;
        ctx.strokeStyle = '#0e120d';
        ctx.strokeText('13', 0, 0);

        ctx.fillStyle = '#f4f7ef';
        ctx.fillText('13', 0, 0);
        ctx.restore();

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 8;
        return tex;
    }

    function createBronzePlaqueTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 320;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 256, 320);
        grad.addColorStop(0, '#d8aa4a');
        grad.addColorStop(0.3, '#be8e36');
        grad.addColorStop(0.7, '#9e7324');
        grad.addColorStop(1, '#6e4f16');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 320);

        ctx.strokeStyle = '#f5d47e';
        ctx.lineWidth = 10;
        ctx.strokeRect(12, 12, 232, 296);

        ctx.fillStyle = '#fae19c';
        ctx.beginPath();
        ctx.arc(128, 70, 26, 0, Math.PI * 2);
        ctx.fill();

        for (let y = 125; y < 275; y += 22) {
            const w = 140 + (y % 40);
            ctx.fillStyle = (y % 44 === 0) ? '#ffeec0' : '#eed086';
            ctx.fillRect(128 - w / 2, y, w, 8);
        }

        return new THREE.CanvasTexture(canvas);
    }

    const rightSponsonTex = createRightSponsonTexture();
    const turretNumberTex = createTurretNumberDecal();
    const bronzePlaqueTex = createBronzePlaqueTexture();

    // ============================================================================
    // 2. PBR MATERIALS (Grayer Slate-Grey Military Armor with Scratches & Sheen)
    // ============================================================================
    const materials = {
        oliveDrab: new THREE.MeshStandardMaterial({
            map: shermanMaps.rolledAlbedo,
            normalMap: shermanMaps.rolledNormal,
            normalScale: new THREE.Vector2(0.35, 0.35),
            roughnessMap: shermanMaps.rolledRoughness,
            roughness: 0.46,
            metalness: 0.35,
            aoMap: shermanMaps.rolledAO,
            aoMapIntensity: 0.55
        }),
        castOlive: new THREE.MeshStandardMaterial({
            map: shermanMaps.castAlbedo,
            normalMap: shermanMaps.castNormal,
            normalScale: new THREE.Vector2(0.40, 0.40),
            roughnessMap: shermanMaps.castRoughness,
            roughness: 0.43,
            metalness: 0.38,
            aoMap: shermanMaps.rolledAO,
            aoMapIntensity: 0.60
        }),
        rightSponsonMat: new THREE.MeshStandardMaterial({
            map: rightSponsonTex,
            normalMap: shermanMaps.rolledNormalFine,
            normalScale: new THREE.Vector2(0.30, 0.30),
            roughnessMap: shermanMaps.rolledRoughness,
            roughness: 0.45,
            metalness: 0.34,
            aoMap: shermanMaps.rolledAO,
            aoMapIntensity: 0.50
        }),
        gunSteel: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#22272e'), // Blued ordnance gunmetal steel
            normalMap: shermanMaps.rolledNormalFine,
            normalScale: new THREE.Vector2(0.20, 0.20),
            roughness: 0.28,
            metalness: 0.80
        }),
        machineGunMat: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#191c20'), // Dark parkerized gunmetal
            normalMap: shermanMaps.rolledNormalFine,
            normalScale: new THREE.Vector2(0.18, 0.18),
            roughness: 0.30,
            metalness: 0.82
        }),
        brassAmmoMat: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#c89d42'), // Polished golden brass ammo box & feed
            roughness: 0.26,
            metalness: 0.86
        }),
        rubberTireMat: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#181a17'), // Deep vulcanized charcoal rubber tire
            roughness: 0.62,
            metalness: 0.10
        }),
        wheelDiscMat: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#3e4540'), // Weathered slate-grey stamped wheel disc
            map: shermanMaps.castAlbedo,
            normalMap: shermanMaps.castNormal,
            normalScale: new THREE.Vector2(0.30, 0.30),
            roughness: 0.45,
            metalness: 0.36
        }),
        hubCapMat: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#b89046'), // Machined brass/bronze center grease hub
            roughness: 0.26,
            metalness: 0.84
        }),
        machinedSteel: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#8e9ca0'), // Bright bare friction steel (sprocket teeth, pins, bolts)
            roughness: 0.22,
            metalness: 0.88
        }),
        sprocketRingMat: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#3c433e'), // Slate-grey forged drive sprocket body
            normalMap: shermanMaps.castNormal,
            normalScale: new THREE.Vector2(0.35, 0.35),
            roughness: 0.44,
            metalness: 0.36
        }),
        wornTrackSteel: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#545b60'), // Hardened steel track grousers & end connectors
            normalMap: shermanMaps.castNormal,
            normalScale: new THREE.Vector2(0.30, 0.30),
            roughness: 0.32,
            metalness: 0.78
        }),
        trackPadMat: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#1a1c19'), // Black vulcanized track block rubber
            roughness: 0.65,
            metalness: 0.15
        }),
        spareTrackSteel: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#6c4f3c'), // Weathered oxidized rusty iron spare track links on glacis
            normalMap: shermanMaps.castNormal,
            normalScale: new THREE.Vector2(0.40, 0.40),
            roughness: 0.42,
            metalness: 0.65
        }),
        suspensionMat: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#363c38'), // Oily cast slate-grey VVSS bogie housings
            map: shermanMaps.castAlbedo,
            normalMap: shermanMaps.castNormal,
            normalScale: new THREE.Vector2(0.35, 0.35),
            roughness: 0.48,
            metalness: 0.35
        }),
        periscopeGlass: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#0c3a35'), // High-index optical prism glass
            roughness: 0.08,
            metalness: 0.94
        }),
        exhaustMuffler: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#38302b'), // Heat-scorched exhaust mufflers & air canisters
            roughness: 0.40,
            metalness: 0.65
        }),
        bronzePlaqueMat: new THREE.MeshStandardMaterial({
            map: bronzePlaqueTex,
            roughness: 0.22,
            metalness: 0.90
        }),
        darkPlaqueMat: new THREE.MeshStandardMaterial({
            color: new THREE.Color('#161816'),
            roughness: 0.28,
            metalness: 0.68
        }),
        muzzleBlack: new THREE.MeshBasicMaterial({
            color: 0x050608
        })
    };
    Object.values(materials).forEach((mat) => {
        mat.userData.shared = true;
        if (isEnemy && mat.isMeshStandardMaterial) mat.envMapIntensity = 0.3;
    });

    shermanAssetCache[key] = { materials, turretNumberTex };
    return shermanAssetCache[key];
}

function buildShermanTank(scene, mats, options = {}) {
    const H_OFF = 0.92; // Align chassis with TankClash physics frame

    const tankRoot = new THREE.Group();
    const sc = scene || (typeof window !== 'undefined' ? window.scene : null);
    if (sc && typeof sc.add === 'function') sc.add(tankRoot);

    const hullGroup = new THREE.Group();
    hullGroup.position.y = H_OFF;
    tankRoot.add(hullGroup);

    const { materials, turretNumberTex } = getShermanSharedAssets(!!options.isEnemy);

    function regPart(mesh) {
        if (mesh && mesh.geometry) {
            if (mesh.geometry.attributes.uv && !mesh.geometry.attributes.uv2) {
                mesh.geometry.setAttribute('uv2', mesh.geometry.attributes.uv);
            }
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    // ============================================================================
    // 3. LOWER HULL & ROUNDED CAST DIFFERENTIAL NOSE
    // ============================================================================
    const lowerHullGroup = new THREE.Group();
    hullGroup.add(lowerHullGroup);

    // Main lower hull tub between tracks
    const tubGeo = new THREE.BoxGeometry(1.72, 0.68, 4.25);
    const tub = regPart(new THREE.Mesh(tubGeo, materials.oliveDrab));
    tub.position.set(0, -0.14, -0.18);
    lowerHullGroup.add(tub);

    // Sponson underside shelves overhanging tracks
    const shelfGeo = new THREE.BoxGeometry(2.56, 0.04, 4.45);
    const shelf = regPart(new THREE.Mesh(shelfGeo, materials.oliveDrab));
    shelf.position.set(0, 0.20, -0.15);
    lowerHullGroup.add(shelf);

    // Rounded 3-piece bolted cast transmission & differential nose housing at front (+Z)
    const noseGroup = new THREE.Group();
    noseGroup.position.set(0, -0.16, 1.98);
    lowerHullGroup.add(noseGroup);

    // Transverse rounded cylinder forming bulbous Sherman lower nose
    const noseCylGeo = new THREE.CylinderGeometry(0.39, 0.39, 1.72, 16);
    noseCylGeo.rotateZ(Math.PI / 2);
    const noseCyl = regPart(new THREE.Mesh(noseCylGeo, materials.castOlive));
    noseCyl.scale.set(1.0, 0.96, 1.35);
    noseGroup.add(noseCyl);

    // Central bulging differential housing boss
    const diffBossGeo = new THREE.SphereGeometry(0.41, 24, 18);
    const diffBoss = regPart(new THREE.Mesh(diffBossGeo, materials.castOlive));
    diffBoss.scale.set(0.85, 0.92, 1.38);
    diffBoss.position.set(0, 0, 0.05);
    noseGroup.add(diffBoss);

    // Bolted flange seam strip along top of differential housing
    const flangeGeo = new THREE.BoxGeometry(1.70, 0.08, 0.14);
    const flange = regPart(new THREE.Mesh(flangeGeo, materials.castOlive));
    flange.position.set(0, 0.35, 0.12);
    noseGroup.add(flange);

    // 14 Hex bolts along top differential flange
    const boltGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6);
    boltGeo.rotateX(Math.PI / 2);
    for (let i = -7; i <= 7; i++) {
        const bolt = new THREE.Mesh(boltGeo, materials.machinedSteel);
        bolt.position.set(i * 0.105, 0.39, 0.14);
        noseGroup.add(bolt);
    }

    // Twin Lower Nose Towing Shackles
    [-0.36, 0.36].forEach((xPos) => {
        const lugGroup = new THREE.Group();
        lugGroup.position.set(xPos, -0.04, 0.49);
        noseGroup.add(lugGroup);

        [-0.04, 0.04].forEach((offsetX) => {
            const cheek = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.13, 0.18), materials.castOlive));
            cheek.position.set(offsetX, 0, 0);
            lugGroup.add(cheek);
        });

        const pinGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.14, 10);
        pinGeo.rotateZ(Math.PI / 2);
        const pin = new THREE.Mesh(pinGeo, materials.machinedSteel);
        pin.position.set(0, 0, 0.05);
        lugGroup.add(pin);

        const shackleGeo = new THREE.TorusGeometry(0.055, 0.018, 10, 18);
        shackleGeo.rotateY(Math.PI / 2);
        const shackle = new THREE.Mesh(shackleGeo, materials.machinedSteel);
        shackle.position.set(0, -0.05, 0.08);
        lugGroup.add(shackle);
    });

    // ============================================================================
    // 4. UPPER HULL, 47° SLOPED GLACIS, "COUGAR" SPONSON & MEMORIAL PLAQUES
    // ============================================================================
    const upperGroup = new THREE.Group();
    hullGroup.add(upperGroup);

    // Custom extruded welded M4 upper hull profile matching monument simulation
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-2.42, 0.20);
    hullShape.lineTo(2.18, 0.20);   // Bottom sponson line
    hullShape.lineTo(1.22, 0.96);   // 47-degree sloped front glacis
    hullShape.lineTo(-0.95, 0.96);  // Flat turret roof deck
    hullShape.lineTo(-2.28, 0.80);  // Sloped rear engine deck
    hullShape.lineTo(-2.42, 0.56);  // Upper rear hull chamfer
    hullShape.closePath();

    const hullExtrudeSettings = {
        steps: 1,
        depth: 2.56,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.02,
        bevelSegments: 2
    };

    const mainHullGeo = new THREE.ExtrudeGeometry(hullShape, hullExtrudeSettings);
    mainHullGeo.translate(0, 0, -1.28);
    mainHullGeo.rotateY(-Math.PI / 2); // Orient depth along X (-1.28 to +1.28), length along Z (-2.42 to +2.18)
    const mainHull = regPart(new THREE.Mesh(mainHullGeo, materials.oliveDrab));
    upperGroup.add(mainHull);

    // Exact Right Side Sponson Plate with "COUGAR" & "T212125" texture (Right = -X side)
    const rightPlateShape = new THREE.Shape();
    rightPlateShape.moveTo(-2.40, 0.21);
    rightPlateShape.lineTo(2.14, 0.21);
    rightPlateShape.lineTo(1.21, 0.95);
    rightPlateShape.lineTo(-0.95, 0.95);
    rightPlateShape.lineTo(-2.27, 0.79);
    rightPlateShape.lineTo(-2.40, 0.56);
    rightPlateShape.closePath();

    const rightPlateGeo = new THREE.ShapeGeometry(rightPlateShape);
    const posAttr = rightPlateGeo.attributes.position;
    const uvs = [];
    for (let i = 0; i < posAttr.count; i++) {
        const vz = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const u = (vz + 2.40) / 4.54;
        const v = (vy - 0.21) / 0.74;
        uvs.push(u, v);
    }
    rightPlateGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rightPlateGeo.rotateY(-Math.PI / 2); // Rotate to face outward towards -X

    const rightSponsonMesh = new THREE.Mesh(rightPlateGeo, materials.rightSponsonMat);
    rightSponsonMesh.position.set(-1.302, 0, 0); // Outward face on Right (-X) side
    rightSponsonMesh.receiveShadow = true;
    upperGroup.add(rightSponsonMesh);

    // Physical 3D Bronze Memorial Plaque & Dark Plaque on Right Hull Side
    const bronzePlaque = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.29, 0.24), materials.bronzePlaqueMat));
    bronzePlaque.position.set(-1.308, 0.60, 0.68);
    upperGroup.add(bronzePlaque);

    const smallDarkPlaque = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.16, 0.21), materials.darkPlaqueMat));
    smallDarkPlaque.position.set(-1.308, 0.56, 0.32);
    upperGroup.add(smallDarkPlaque);

    // Front Sand Shield / Fender Lips over drive sprockets
    [-1, 1].forEach((sideSign) => {
        const fenderGroup = new THREE.Group();
        fenderGroup.position.set(sideSign * 1.15, 0.24, 1.96);
        upperGroup.add(fenderGroup);

        const fenderPlate = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.03, 0.55), materials.oliveDrab));
        fenderPlate.position.set(0, 0, 0.12);
        fenderPlate.rotation.x = 0.28;
        fenderGroup.add(fenderPlate);

        // Side skirt lip strip running along outer bottom sponson edge (clear of tracks)
        const sideStrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 4.35), materials.oliveDrab);
        sideStrip.position.set(sideSign * 1.29, 0.18, -0.16);
        upperGroup.add(sideStrip);
    });

    // ============================================================================
    // 5. GLACIS DETAILS: CAST HOODS, BOW MG, TRAVEL LOCK, HEADLIGHTS & SPARE TRACKS
    // ============================================================================
    const glacisAngle = Math.atan2(0.76, 0.96); // ~38.4 deg pitch of front glacis

    // Cast driver & co-driver hoods with swiveling periscopes on front glacis
    [-0.58, 0.58].forEach((xOffset) => {
        const hoodGroup = new THREE.Group();
        hoodGroup.position.set(xOffset, 0.74, 1.52);
        upperGroup.add(hoodGroup);

        const hoodCylinder = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.26, 18), materials.castOlive));
        hoodCylinder.scale.set(0.95, 1.0, 1.35);
        hoodCylinder.position.set(0, 0.12, -0.08);
        hoodGroup.add(hoodCylinder);

        const visorBlock = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.18), materials.castOlive));
        visorBlock.position.set(0, 0.08, 0.08);
        visorBlock.rotation.x = 0.35;
        hoodGroup.add(visorBlock);

        const periCover = regPart(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.14), materials.oliveDrab));
        periCover.position.set(0, 0.26, -0.14);
        hoodGroup.add(periCover);

        // High-index optical prism glass in periscope view slit
        const periGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.035), materials.periscopeGlass);
        periGlass.position.set(0, 0.27, -0.07);
        hoodGroup.add(periGlass);
    });

    // Ball-mounted Bow .30 cal Machine Gun on Right/Co-driver Glacis (-X side)
    const bowMgGroup = new THREE.Group();
    bowMgGroup.position.set(-0.26, 0.56, 1.72);
    upperGroup.add(bowMgGroup);

    const bowMgMount = regPart(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), materials.castOlive));
    bowMgGroup.add(bowMgMount);

    const bowMgBarrel = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.28, 12), materials.gunSteel));
    bowMgBarrel.rotation.x = Math.PI / 2;
    bowMgBarrel.position.set(0, 0.02, 0.14);
    bowMgGroup.add(bowMgBarrel);

    // 4 Glacis Shoulder Lifting Eye Rings
    const hookPositions = [
        { x: -1.29, y: 0.74, z: 1.32, rotY: Math.PI / 2 },
        { x: -1.29, y: 0.60, z: 1.56, rotY: Math.PI / 2 },
        { x: -1.05, y: 0.90, z: 1.35, rotY: 0 },
        { x:  1.05, y: 0.90, z: 1.35, rotY: 0 }
    ];
    hookPositions.forEach((hp) => {
        const ring = regPart(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.015, 8, 16), materials.castOlive));
        ring.position.set(hp.x, hp.y, hp.z);
        ring.rotation.y = hp.rotY;
        upperGroup.add(ring);
    });

    // Headlights with Brush Guards & Functional Spotlights
    const headlightLights = [];
    [-0.95, 0.95].forEach((hx) => {
        const hlGroup = new THREE.Group();
        hlGroup.position.set(hx, 0.56, 1.78);
        upperGroup.add(hlGroup);

        const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12, 1, true), materials.oliveDrab);
        guard.rotation.x = glacisAngle;
        hlGroup.add(guard);

        const hlBody = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.12, 16), materials.castOlive));
        hlBody.rotation.x = Math.PI / 2;
        hlGroup.add(hlBody);

        const slitMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        const slitMesh = new THREE.Mesh(new THREE.CircleGeometry(0.065, 16), slitMat);
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
    });

    // Center Glacis Folding Barrel Travel Lock U-Frame
    const lockGroup = new THREE.Group();
    lockGroup.position.set(0.05, 0.62, 1.68);
    lockGroup.rotation.x = glacisAngle;
    upperGroup.add(lockGroup);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.04), materials.castOlive);
    armL.position.set(-0.12, 0.12, 0);
    const armR = armL.clone();
    armR.position.set(0.12, 0.12, 0);
    const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 16, Math.PI), materials.castOlive);
    clamp.position.set(0, 0.24, 0);
    lockGroup.add(armL, armR, clamp);

    function createShermanTrackBlockGeometry(includeGuideTooth = true, isSpare = false) {
        const mergeFn = (typeof window !== 'undefined' && window.mergeBufferGeometries) || (typeof mergeBufferGeometries === 'function' ? mergeBufferGeometries : null);
        const padGeo = new THREE.BoxGeometry(0.42, 0.042, 0.115);
        const chevY = isSpare ? 0.026 : -0.026;

        const chevLeft = new THREE.BoxGeometry(0.20, 0.024, 0.032);
        chevLeft.rotateY(0.36);
        chevLeft.translate(-0.085, chevY, 0.008);

        const chevRight = new THREE.BoxGeometry(0.20, 0.024, 0.032);
        chevRight.rotateY(-0.36);
        chevRight.translate(0.085, chevY, 0.008);

        const earLeft = new THREE.BoxGeometry(0.042, 0.052, 0.135);
        earLeft.translate(-0.225, 0.004, 0);

        const earRight = new THREE.BoxGeometry(0.042, 0.052, 0.135);
        earRight.translate(0.225, 0.004, 0);

        const geos = [padGeo, chevLeft, chevRight, earLeft, earRight];
        if (includeGuideTooth) {
            const tooth = new THREE.BoxGeometry(0.022, 0.058, 0.055);
            tooth.translate(0, 0.042, 0);
            geos.push(tooth);
        }
        return mergeFn ? mergeFn(geos) : padGeo;
    }

    const shermanTrackGeo = createShermanTrackBlockGeometry(true, false);
    const shermanSpareTrackGeo = createShermanTrackBlockGeometry(false, true);

    function createTrackBlockGroup(includeGuideTooth = true, isSpare = false) {
        const geo = isSpare ? shermanSpareTrackGeo : shermanTrackGeo;
        const mat = isSpare ? materials.spareTrackSteel : materials.trackPadMat;
        return regPart(new THREE.Mesh(geo, mat));
    }

    // 3 Rows of Spare Chevron Track Links on the Right-Front Glacis (Exact match to monument reference)
    const spareRackGroup = new THREE.Group();
    if (!options.isEnemy) upperGroup.add(spareRackGroup);

    const rackConfigs = [
        { xCenter: -0.02, numLinks: 7, startDist: -0.38 },
        { xCenter: -0.44, numLinks: 5, startDist: -0.14 },
        { xCenter: -0.88, numLinks: 5, startDist: -0.14 }
    ];

    rackConfigs.forEach((cfg) => {
        const rowGroup = new THREE.Group();
        rowGroup.position.set(cfg.xCenter, 0.58, 1.74);
        rowGroup.rotation.x = glacisAngle;
        spareRackGroup.add(rowGroup);

        // Retainer channel bar
        const barGeo = new THREE.BoxGeometry(0.46, 0.025, cfg.numLinks * 0.142 + 0.06);
        const baseBar = new THREE.Mesh(barGeo, materials.oliveDrab);
        baseBar.position.set(0, 0.015, cfg.startDist + (cfg.numLinks * 0.142) * 0.35);
        rowGroup.add(baseBar);

        for (let i = 0; i < cfg.numLinks; i++) {
            const link = createTrackBlockGroup(false, true);
            link.scale.set(0.92, 1.0, 0.95);
            const s = cfg.startDist + i * 0.135;
            link.position.set(0, 0.048, s);
            rowGroup.add(link);
        }
    });

    // Rear engine deck louver grilles, muffler guards & air cleaner canisters
    const grilleGeo = new THREE.BoxGeometry(1.55, 0.03, 0.65);
    const grille = new THREE.Mesh(grilleGeo, materials.exhaustMuffler);
    grille.position.set(0, 0.89, -1.35);
    upperGroup.add(grille);

    // Twin angled cylindrical muffler guards on rear deck
    [-0.68, 0.68].forEach((xPos) => {
        const cylGuard = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.26, 20), materials.oliveDrab));
        cylGuard.position.set(xPos, 0.94, -1.92);
        cylGuard.rotation.x = -0.24;
        upperGroup.add(cylGuard);

        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.016, 8, 20), materials.exhaustMuffler);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.13;
        cylGuard.add(rim);
    });

    // Rear air cleaner canisters
    [-0.45, 0.45].forEach((xPos) => {
        const cleaner = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 16), materials.exhaustMuffler));
        cleaner.position.set(xPos, 0.40, -2.46);
        upperGroup.add(cleaner);
    });

    // ============================================================================
    // 6. CAST M4 TURRET ("13"), M34A1 MANTLET & 75MM M3 CANNON
    // ============================================================================
    const turretGroup = new THREE.Group();
    turretGroup.position.set(0, 0.96, 0.08);
    hullGroup.add(turretGroup);

    // Main rounded cast turret dome with authentic compound lathe curve
    const turretPoints = [
        new THREE.Vector2(0.88, 0.0),
        new THREE.Vector2(0.89, 0.14),
        new THREE.Vector2(0.86, 0.35),
        new THREE.Vector2(0.79, 0.56),
        new THREE.Vector2(0.66, 0.70),
        new THREE.Vector2(0.45, 0.76),
        new THREE.Vector2(0.0,  0.77)
    ];
    const turretDomeGeo = new THREE.LatheGeometry(turretPoints, 36);
    turretDomeGeo.scale(0.96, 1.0, 1.14);
    turretDomeGeo.translate(0, 0, -0.08);
    const turretDome = regPart(new THREE.Mesh(turretDomeGeo, materials.castOlive));
    turretGroup.add(turretDome);

    // Rear turret bustle counterweight overhang
    const bustleGeo = new THREE.CylinderGeometry(0.64, 0.56, 0.54, 16);
    bustleGeo.scale(1.12, 1.0, 1.15);
    const bustle = regPart(new THREE.Mesh(bustleGeo, materials.castOlive));
    bustle.position.set(0, 0.42, -0.56);
    turretGroup.add(bustle);

    // Turret number "13" curved decal patch on Right cheek (-X side)
    const decalMat = new THREE.MeshStandardMaterial({
        map: turretNumberTex,
        transparent: true,
        roughness: 0.42,
        metalness: 0.20,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
    });
    // Curved cylinder patch conforming tightly to right turret wall
    const decalGeo = new THREE.CylinderGeometry(0.88, 0.92, 0.58, 24, 1, true, Math.PI * 0.78, Math.PI * 0.44);
    decalGeo.scale(0.96, 1.0, 1.14);
    const decalMesh = new THREE.Mesh(decalGeo, decalMat);
    decalMesh.position.set(-0.005, 0.38, -0.06);
    turretGroup.add(decalMesh);

    // Commander's Cupola with 6 Periscope Vision Blocks & Split Hatch Lid (Rear-Right)
    const cupolaGroup = new THREE.Group();
    cupolaGroup.position.set(-0.24, 0.75, -0.24);
    turretGroup.add(cupolaGroup);

    const cupolaRing = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.16, 20), materials.castOlive));
    cupolaGroup.add(cupolaRing);

    for (let v = 0; v < 6; v++) {
        const va = (v / 6) * Math.PI * 2;
        const vBlock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), materials.periscopeGlass);
        vBlock.position.set(Math.sin(va) * 0.31, 0.05, Math.cos(va) * 0.31);
        vBlock.rotation.y = va;
        cupolaGroup.add(vBlock);
    }

    const cupolaLid = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.30, 0.05, 18), materials.castOlive));
    cupolaLid.position.y = 0.10;
    cupolaGroup.add(cupolaLid);

    // .50 cal Browning M2 Machine Gun on Cupola Pintle
    const mgGroup = new THREE.Group();
    mgGroup.position.set(-0.15, 0.24, -0.15);
    cupolaGroup.add(mgGroup);
    const pintlePost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8), materials.machinedSteel);
    pintlePost.position.y = 0.14;
    mgGroup.add(pintlePost);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), materials.machineGunMat);
    receiver.position.set(0, 0.30, 0);
    mgGroup.add(receiver);
    const b50Barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.48, 8), materials.gunSteel);
    b50Barrel.rotation.x = Math.PI / 2;
    b50Barrel.position.set(0, 0.32, 0.23);
    mgGroup.add(b50Barrel);

    // Golden brass ammunition feed box mounted on .50 cal
    const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.16), materials.brassAmmoMat);
    ammoBox.position.set(-0.08, 0.30, 0.05);
    mgGroup.add(ammoBox);

    // Loader's Hatch on Left Turret Roof (+X side)
    const loaderHatch = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.06, 16), materials.castOlive));
    loaderHatch.position.set(0.32, 0.76, -0.15);
    turretGroup.add(loaderHatch);

    // 3 Turret Lifting Rings
    [
        { x: -0.68, y: 0.66, z: 0.32 },
        { x:  0.68, y: 0.66, z: 0.32 },
        { x:  0.0,  y: 0.62, z: -0.88 }
    ].forEach((pos) => {
        const ear = regPart(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 8, 16), materials.castOlive));
        ear.position.set(pos.x, pos.y, pos.z);
        turretGroup.add(ear);
    });

    // M34A1 Mantlet Cheek Armor Wings welded to front of turret
    const cheekHousing = regPart(new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.48, 0.55), materials.castOlive));
    cheekHousing.position.set(0, 0.38, 0.68);
    turretGroup.add(cheekHousing);

    // Elevating Gun Mantlet & Barrel Pivot Group
    const gunElevationPivot = new THREE.Group();
    gunElevationPivot.position.set(0, 0.39, 0.84);
    turretGroup.add(gunElevationPivot);

    // Outer Curved M34A1 Cast Mantlet Shield
    const mantletCylGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.96, 24);
    mantletCylGeo.rotateZ(Math.PI / 2);
    const mantletCyl = regPart(new THREE.Mesh(mantletCylGeo, materials.castOlive));
    mantletCyl.scale.set(1.0, 1.0, 1.15);
    gunElevationPivot.add(mantletCyl);

    // Central Thick Rounded Rotor Drum around barrel root
    const rotorDrum = regPart(new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 18), materials.castOlive));
    rotorDrum.scale.set(1.1, 0.95, 1.15);
    rotorDrum.position.set(0, 0, 0.10);
    gunElevationPivot.add(rotorDrum);

    // Prominent Top Lifting Hooks / Ears on M34A1 Mantlet
    [-0.28, 0.28].forEach((xHook) => {
        const hookEar = regPart(new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.020, 10, 18), materials.castOlive));
        hookEar.position.set(xHook, 0.28, 0.04);
        hookEar.rotation.y = Math.PI / 4;
        gunElevationPivot.add(hookEar);
    });

    // Mantlet Shield Corner Bolts
    [-0.42, 0.42].forEach((xb) => {
        [-0.18, 0.18].forEach((yb) => {
            const mBolt = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.05), materials.machinedSteel);
            mBolt.position.set(xb, yb, 0.24);
            gunElevationPivot.add(mBolt);
        });
    });

    // Coaxial .30 cal Machine Gun port & barrel stub on left side of mantlet (+X side)
    const coaxMuzzleRef = regPart(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.24, 10), materials.gunSteel));
    coaxMuzzleRef.rotation.x = Math.PI / 2;
    coaxMuzzleRef.position.set(0.26, 0.02, 0.32);
    gunElevationPivot.add(coaxMuzzleRef);

    // Recoiling 75mm Gun M3 Barrel Assembly
    const barrelRecoilGroup = new THREE.Group();
    gunElevationPivot.add(barrelRecoilGroup);

    // Tapered 75mm M3 gun barrel tube (L/40 caliber length) in blued ordnance gunmetal
    const barrelGeo = new THREE.CylinderGeometry(0.072, 0.108, 1.88, 16);
    barrelGeo.rotateX(Math.PI / 2);
    barrelGeo.translate(0, 0, 1.06);
    const barrel = regPart(new THREE.Mesh(barrelGeo, materials.gunSteel));
    barrelRecoilGroup.add(barrel);

    // Muzzle collar lip
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 12, 24), materials.machinedSteel);
    muzzleRing.position.set(0, 0, 2.00);
    barrelRecoilGroup.add(muzzleRing);

    // Dark hollow 75mm bore interior & muzzle tip
    const mainGunMuzzleTip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.12, 20), materials.muzzleBlack);
    mainGunMuzzleTip.rotation.x = Math.PI / 2;
    mainGunMuzzleTip.position.set(0, 0, 2.04);
    barrelRecoilGroup.add(mainGunMuzzleTip);

    // ============================================================================
    // 7. VVSS SUSPENSION (6 BOGIES), 13-TOOTH SPROCKETS, IDLERS & ARTICULATED TRACKS
    // ============================================================================
    const roadWheelStations = { left: [], right: [] };
    const driveSprockets = [];
    const idlerWheels = [];
    const trackChains = { left: [], right: [] };

    // Builds a pressed-spoke road wheel or idler wheel with radial ribs & hub cap
    function buildRoadOrIdlerWheel(radius, sideSign, isIdler) {
        const wheelGroup = new THREE.Group();
        const spinGroup = new THREE.Group();
        wheelGroup.add(spinGroup);

        const rimMat = isIdler ? materials.wornTrackSteel : materials.rubberTireMat;
        const tireGeo = new THREE.CylinderGeometry(radius, radius, 0.26, 14);
        tireGeo.rotateZ(Math.PI / 2);
        const tire = regPart(new THREE.Mesh(tireGeo, rimMat));
        spinGroup.add(tire);

        const discGeo = new THREE.CylinderGeometry(radius * 0.78, radius * 0.78, 0.27, 12);
        discGeo.rotateZ(Math.PI / 2);
        const disc = new THREE.Mesh(discGeo, materials.wheelDiscMat);
        spinGroup.add(disc);

        // 6 Radial reinforcement ribs & lightening recesses (skipped on distant enemy tanks)
        if (!options.isEnemy) {
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const ribGeo = new THREE.BoxGeometry(0.04, 0.042, radius * 0.65);
                const rib = new THREE.Mesh(ribGeo, materials.oliveDrab);
                rib.position.set(
                    sideSign * 0.125,
                    Math.sin(angle) * (radius * 0.42),
                    Math.cos(angle) * (radius * 0.42)
                );
                rib.rotation.x = angle;
                spinGroup.add(rib);
            }
        }

        const hubGeo = new THREE.CylinderGeometry(0.085, 0.095, 0.31, 14);
        hubGeo.rotateZ(Math.PI / 2);
        const hub = new THREE.Mesh(hubGeo, materials.hubCapMat);
        spinGroup.add(hub);

        return { wheelGroup, spinGroup };
    }

    // Constructs an authentic M4 VVSS Bogie Assembly matching the monument reference
    function buildSingleVVSSBogie(sideSign, bogieZ) {
        const bogieGroup = new THREE.Group();

        // Central vertical volute spring "crab" housing casting
        const crabGeo = new THREE.BoxGeometry(0.26, 0.44, 0.42);
        const crab = regPart(new THREE.Mesh(crabGeo, materials.suspensionMat));
        crab.position.set(sideSign * 0.04, 0.16, 0);
        bogieGroup.add(crab);

        // Twin recessed spring pockets with conical volute spring coils (omitted on enemy LOD)
        if (!options.isEnemy) {
            [-0.10, 0.10].forEach((sz) => {
                const pocketGeo = new THREE.BoxGeometry(0.06, 0.28, 0.13);
                const pocket = new THREE.Mesh(pocketGeo, materials.trackPadMat);
                pocket.position.set(sideSign * 0.155, 0.18, sz);
                bogieGroup.add(pocket);

                const coilGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.24, 12);
                const coil = new THREE.Mesh(coilGeo, materials.machinedSteel);
                coil.position.set(sideSign * 0.15, 0.18, sz);
                bogieGroup.add(coil);
            });
        }

        // Articulated scissor/walking-beam arms
        [-1, 1].forEach((dir) => {
            const lowerArmGeo = new THREE.BoxGeometry(0.06, 0.075, 0.40);
            const lowerArm = new THREE.Mesh(lowerArmGeo, materials.suspensionMat);
            lowerArm.position.set(sideSign * 0.15, -0.08, dir * 0.18);
            lowerArm.rotation.x = dir * 0.12;
            bogieGroup.add(lowerArm);

            const upperArmGeo = new THREE.BoxGeometry(0.055, 0.065, 0.38);
            const upperArm = new THREE.Mesh(upperArmGeo, materials.suspensionMat);
            upperArm.position.set(sideSign * 0.15, 0.01, dir * 0.17);
            upperArm.rotation.x = dir * 0.35;
            bogieGroup.add(upperArm);
        });

        const pivotPlate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.18), materials.castOlive);
        pivotPlate.position.set(sideSign * 0.15, -0.06, 0);
        bogieGroup.add(pivotPlate);

        // Swept-back return roller arm & top return roller
        const rollerArmGeo = new THREE.BoxGeometry(0.12, 0.09, 0.32);
        const rollerArm = new THREE.Mesh(rollerArmGeo, materials.suspensionMat);
        rollerArm.position.set(0, 0.34, -0.18);
        rollerArm.rotation.x = 0.25;
        bogieGroup.add(rollerArm);

        const returnRollerGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.22, 16);
        returnRollerGeo.rotateZ(Math.PI / 2);
        const returnRoller = new THREE.Mesh(returnRollerGeo, materials.rubberTireMat);
        returnRoller.position.set(0, 0.39, -0.28);
        bogieGroup.add(returnRoller);

        // Heavy top track skid strap arching over the bogie housing
        const skidGeo = new THREE.BoxGeometry(0.14, 0.032, 0.54);
        const skid = new THREE.Mesh(skidGeo, materials.machinedSteel);
        skid.position.set(0, 0.49, -0.04);
        skid.rotation.x = 0.05;
        bogieGroup.add(skid);

        return bogieGroup;
    }

    // Front 13-Tooth Sherman Drive Sprocket
    function buildDriveSprocket(sideSign) {
        const sprocketGroup = new THREE.Group();

        [-0.14, 0.14].forEach((xRing) => {
            const ringGeo = new THREE.TorusGeometry(0.32, 0.032, 6, 14);
            ringGeo.rotateY(Math.PI / 2);
            const ring = new THREE.Mesh(ringGeo, materials.sprocketRingMat);
            ring.position.x = xRing;
            sprocketGroup.add(ring);

            for (let t = 0; t < 13; t++) {
                const a = (t / 13) * Math.PI * 2;
                const toothGeo = new THREE.ConeGeometry(0.048, 0.11, 4);
                toothGeo.rotateZ(Math.PI / 2);
                const tooth = new THREE.Mesh(toothGeo, materials.machinedSteel);
                tooth.position.set(xRing, Math.sin(a) * 0.365, Math.cos(a) * 0.365);
                tooth.rotation.x = a;
                sprocketGroup.add(tooth);
            }
        });

        const hubDrumGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.30, 14);
        hubDrumGeo.rotateZ(Math.PI / 2);
        const hubDrum = new THREE.Mesh(hubDrumGeo, materials.sprocketRingMat);
        sprocketGroup.add(hubDrum);

        const capGeo = new THREE.CylinderGeometry(0.14, 0.15, 0.34, 12);
        capGeo.rotateZ(Math.PI / 2);
        const cap = new THREE.Mesh(capGeo, materials.hubCapMat);
        sprocketGroup.add(cap);

        for (let b = 0; b < 12; b++) {
            const ba = (b / 12) * Math.PI * 2;
            const bGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.36, 6);
            bGeo.rotateZ(Math.PI / 2);
            const bMesh = new THREE.Mesh(bGeo, materials.machinedSteel);
            bMesh.position.set(0, Math.sin(ba) * 0.175, Math.cos(ba) * 0.175);
            sprocketGroup.add(bMesh);
        }

        return sprocketGroup;
    }

    // Rear Idler Wheel with trailing tensioning arm
    function buildIdlerAssembly(sideSign) {
        const idlerGroup = new THREE.Group();
        const { wheelGroup, spinGroup } = buildRoadOrIdlerWheel(0.31, sideSign, true);
        idlerGroup.add(wheelGroup);

        const armGeo = new THREE.BoxGeometry(0.10, 0.12, 0.32);
        const arm = new THREE.Mesh(armGeo, materials.suspensionMat);
        arm.position.set(sideSign * 0.08, 0.03, 0.16);
        arm.rotation.x = 0.25;
        idlerGroup.add(arm);

        return { idlerGroup, spinGroup };
    }

    // Continuous closed 2D track loop in (Z, Y) plane
    const SHERMAN_TRACK_WAYPOINTS = [
        new THREE.Vector2( 1.62, -0.88),  // 0: Bottom front ground contact
        new THREE.Vector2(-1.65, -0.88),  // 1: Bottom rear ground contact
        new THREE.Vector2(-2.15, -0.64),  // 2: Lower rear ramp up to idler
        new THREE.Vector2(-2.51, -0.34),  // 3: Rear-most lower curve of idler
        new THREE.Vector2(-2.51, -0.07),  // 4: Rear-most upper curve of idler
        new THREE.Vector2(-2.22,  0.11),  // 5: Top of rear idler
        new THREE.Vector2(-1.50,  0.03),  // 6: Rear return roller skid
        new THREE.Vector2(-0.28,  0.03),  // 7: Mid return roller skid
        new THREE.Vector2( 0.95,  0.03),  // 8: Front return roller skid
        new THREE.Vector2( 2.10,  0.14),  // 9: Top of drive sprocket
        new THREE.Vector2( 2.42,  0.04),  // 10: Upper-front curve of drive sprocket
        new THREE.Vector2( 2.52, -0.20),  // 11: Front-most tip of drive sprocket
        new THREE.Vector2( 2.49, -0.40),  // 12: Front-bottom curve of drive sprocket
        new THREE.Vector2( 2.15, -0.66)   // 13: Lower front ramp from sprocket to ground
    ];

    const totalWaypoints = SHERMAN_TRACK_WAYPOINTS.length;
    const trackSegmentLengths = [];
    let totalTrackLength = 0;
    for (let i = 0; i < totalWaypoints; i++) {
        const p0 = SHERMAN_TRACK_WAYPOINTS[i];
        const p1 = SHERMAN_TRACK_WAYPOINTS[(i + 1) % totalWaypoints];
        const len = p0.distanceTo(p1);
        trackSegmentLengths.push(len);
        totalTrackLength += len;
    }

    // Build suspension bogies, wheels, and articulated track links
    ['left', 'right'].forEach((sideKey) => {
        const sideSign = (sideKey === 'left') ? 1 : -1;
        const trackX = sideSign * 1.15;

        // Front 13-tooth Drive Sprocket at Z = 2.10, Y = -0.25
        const sprocket = buildDriveSprocket(sideSign);
        sprocket.position.set(trackX, -0.25, 2.10);
        hullGroup.add(sprocket);
        driveSprockets.push({ mesh: sprocket, side: sideKey });

        // Rear Idler Wheel at Z = -2.18, Y = -0.20
        const { idlerGroup, spinGroup: idlerSpin } = buildIdlerAssembly(sideSign);
        idlerGroup.position.set(trackX, -0.20, -2.18);
        hullGroup.add(idlerGroup);
        idlerWheels.push({ mesh: idlerSpin, side: sideKey });

        // 3 VVSS Bogies per side, each with volute crab housing & 2 road wheel pairs
        const bogieCenters = [1.22, 0.0, -1.22];
        bogieCenters.forEach((bz) => {
            const bogie = buildSingleVVSSBogie(sideSign, bz);
            bogie.position.set(trackX, -0.50, bz);
            hullGroup.add(bogie);

            // 2 Road Wheel pairs per bogie ordered front-to-back (+0.36 then -0.36)
            [0.36, -0.36].forEach((wOffset) => {
                const wz = bz + wOffset;
                const { wheelGroup, spinGroup } = buildRoadOrIdlerWheel(0.285, sideSign, false);
                wheelGroup.position.set(trackX, -0.60, wz);
                hullGroup.add(wheelGroup);

                roadWheelStations[sideKey].push({
                    cluster: wheelGroup,
                    spinGroup,
                    baseY: -0.60,
                    currentOffset: 0,
                    velocityY: 0,
                    z: wz,
                    x: trackX
                });
            });
        });

        // 76 Articulated Chevron Track Links per side (Single InstancedMesh per side!)
        const numLinks = 76;
        const trackInstMesh = new THREE.InstancedMesh(shermanTrackGeo, materials.wornTrackSteel || materials.trackPadMat, numLinks);
        trackInstMesh.castShadow = true;
        trackInstMesh.receiveShadow = true;
        trackInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        hullGroup.add(trackInstMesh);
        trackChains[sideKey] = {
            instMesh: trackInstMesh,
            trackX: trackX,
            count: numLinks
        };
    });

    const evaluateTrackPoint = function(sideKey, uNorm) {
        let u = ((uNorm % 1.0) + 1.0) % 1.0;
        let targetDist = u * totalTrackLength;

        for (let i = 0; i < totalWaypoints; i++) {
            const segLen = trackSegmentLengths[i];
            if (targetDist <= segLen || i === totalWaypoints - 1) {
                const p0 = SHERMAN_TRACK_WAYPOINTS[i];
                const p1 = SHERMAN_TRACK_WAYPOINTS[(i + 1) % totalWaypoints];
                const t = segLen > 0 ? targetDist / segLen : 0;
                let z = THREE.MathUtils.lerp(p0.x, p1.x, t);
                let y = THREE.MathUtils.lerp(p0.y, p1.y, t);

                if (i === 0 && sideKey && roadWheelStations[sideKey] && roadWheelStations[sideKey].length >= 6) {
                    const st = roadWheelStations[sideKey];
                    const exactIdx = t * 5.0;
                    const i0 = Math.max(0, Math.min(5, Math.floor(exactIdx)));
                    const i1 = Math.max(0, Math.min(5, i0 + 1));
                    const f = exactIdx - i0;
                    const offset = st[i0].currentOffset * (1.0 - f) + st[i1].currentOffset * f;
                    y += offset;
                }

                const dz = p1.x - p0.x;
                const dy = p1.y - p0.y;
                const angle = Math.atan2(dy, -dz);
                return { z, y, pitch: angle };
            }
            targetDist -= segLen;
        }
        return { z: SHERMAN_TRACK_WAYPOINTS[0].x, y: SHERMAN_TRACK_WAYPOINTS[0].y, pitch: 0 };
    };

    const dummyShermanLink = new THREE.Object3D();
    const updateTracksGeometry = function(leftPhase, rightPhase) {
        ['left', 'right'].forEach((sideKey) => {
            const chain = trackChains[sideKey];
            if (!chain || !chain.instMesh) return;
            const phase = (sideKey === 'left') ? leftPhase : rightPhase;
            const n = chain.count;
            const trackX = chain.trackX;

            for (let i = 0; i < n; i++) {
                const u = (i / n + phase) % 1.0;
                const pt = evaluateTrackPoint(sideKey, u);
                dummyShermanLink.position.set(trackX, pt.y, pt.z);
                dummyShermanLink.rotation.set(pt.pitch, 0, 0);
                dummyShermanLink.updateMatrix();
                chain.instMesh.setMatrixAt(i, dummyShermanLink.matrix);
            }
            chain.instMesh.instanceMatrix.needsUpdate = true;
        });
    };
    updateTracksGeometry(0, 0);

    tankRoot.traverse((obj) => {
        if (obj.isMesh) {
            if (obj.geometry && obj.geometry.attributes.uv && !obj.geometry.attributes.uv2) {
                obj.geometry.setAttribute('uv2', obj.geometry.attributes.uv);
            }
            obj.castShadow = true;
            obj.receiveShadow = true;
        }
    });

    return {
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
        smokeTubes: [],
        roadWheelStations,
        driveSprockets,
        idlerWheels,
        trackChains,
        evaluateTrackPoint,
        updateTracksGeometry
    };
}

window.buildShermanTank = buildShermanTank;
