// ============================================================================
// WWII Infantry Simulation & Combat System (Germany, US, Soviet Union)
// Procedurally rigged, animated soldiers that wander, patrol, take cover,
// and engage opposing factions & armor with service rifles.
// ============================================================================

(function () {
    'use strict';


    // ------------------------------------------------------------------------
    // 1. PROCEDURAL SCULPT ENGINE (identical to wwii_infantry_3d_showcase.html)
    // ------------------------------------------------------------------------
            // Creates a vertex-sculpted BufferGeometry by lofting cross-sectional rings
            // Each slice defines: { y, rx, rz, ox, oz, foldAmp, foldFreq, foldPhase, pinchFront, squareness }
            const SculptEngine = {
            createLoftedMesh(slices, radSegs = 24, capTop = true, capBottom = true) {
                const geo = new THREE.BufferGeometry();
                const positions = [];
                const uvs = [];
                const indices = [];

                const numSlices = slices.length;
                for (let i = 0; i < numSlices; i++) {
                    const s = slices[i];
                    const v = i / (numSlices - 1);

                    for (let j = 0; j <= radSegs; j++) {
                        const u = j / radSegs;
                        const theta = u * Math.PI * 2;
                        const sinT = Math.sin(theta); // +X is right, +Z is front (theta=0 is +Z front)
                        const cosT = Math.cos(theta);

                        // Base super-ellipse for muscular/cloth cross-sections (squareness blends circle toward rounded box)
                        const sq = s.squareness || 0;
                        let nx = sinT;
                        let nz = cosT;
                        if (sq > 0) {
                            nx = Math.sign(sinT) * Math.pow(Math.abs(sinT), 1 - sq * 0.45);
                            nz = Math.sign(cosT) * Math.pow(Math.abs(cosT), 1 - sq * 0.45);
                        }

                        // Harmonic cloth folds & anatomical muscle ridges
                        let rMod = 1.0;
                        if (s.foldAmp) {
                            rMod += Math.sin(theta * (s.foldFreq || 6) + (s.foldPhase || 0)) * s.foldAmp;
                            rMod += Math.cos(theta * ((s.foldFreq || 6) * 2 - 1) + 1.3) * (s.foldAmp * 0.4);
                        }

                        // Anatomical chest / back / calf asymmetry
                        if (s.frontBulge && cosT > 0) {
                            rMod += Math.pow(cosT, 2) * s.frontBulge;
                        }
                        if (s.backBulge && cosT < 0) {
                            rMod += Math.pow(-cosT, 2) * s.backBulge;
                        }
                        if (s.pecGroove && cosT > 0.5) {
                            // Sternum center crease between pectorals or tunic placket
                            rMod -= Math.exp(-Math.pow(sinT * 5.0, 2)) * s.pecGroove;
                        }

                        const x = (s.ox || 0) + nx * s.rx * rMod;
                        const z = (s.oz || 0) + nz * s.rz * rMod;
                        const y = s.y;

                        positions.push(x, y, z);
                        uvs.push(u, v);
                    }
                }

                const ringStride = radSegs + 1;
                for (let i = 0; i < numSlices - 1; i++) {
                    for (let j = 0; j < radSegs; j++) {
                        const a = i * ringStride + j;
                        const b = (i + 1) * ringStride + j;
                        const c = (i + 1) * ringStride + (j + 1);
                        const d = i * ringStride + (j + 1);

                        indices.push(a, d, b);
                        indices.push(b, d, c);
                    }
                }

                // Optional top/bottom caps
                if (capBottom) {
                    const s0 = slices[0];
                    const centerIdx = positions.length / 3;
                    positions.push(s0.ox || 0, s0.y, s0.oz || 0);
                    uvs.push(0.5, 0);
                    for (let j = 0; j < radSegs; j++) {
                        indices.push(centerIdx, j + 1, j);
                    }
                }
                if (capTop) {
                    const sTop = slices[numSlices - 1];
                    const baseRing = (numSlices - 1) * ringStride;
                    const centerIdx = positions.length / 3;
                    positions.push(sTop.ox || 0, sTop.y, sTop.oz || 0);
                    uvs.push(0.5, 1);
                    for (let j = 0; j < radSegs; j++) {
                        indices.push(centerIdx, baseRing + j, baseRing + j + 1);
                    }
                }

                geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
                geo.setIndex(indices);
                geo.computeVertexNormals();
                return geo;
            },

            // Sculpt a realistic adult male head with brow ridge, eye sockets, nose bridge, cheekbones, lips, jaw & ears
            createRealisticHeadGeometry(facialVariant = 0) {
                const radSegs = 32;
                const ySegs = 24;
                const geo = new THREE.BufferGeometry();
                const positions = [];
                const uvs = [];
                const indices = [];

                // Slight individual facial bone variation per soldier
                const jawWidthMod = facialVariant === 0 ? 1.02 : (facialVariant === 1 ? 1.05 : 0.97);
                const noseProminence = facialVariant === 2 ? 1.08 : 1.0;

                for (let iy = 0; iy <= ySegs; iy++) {
                    const v = iy / ySegs; // 0 = base of neck/chin, 1 = crown of skull
                    const y = (v - 0.35) * 0.255; // Total head height ~25.5cm

                    for (let ix = 0; ix <= radSegs; ix++) {
                        const u = ix / radSegs;
                        const theta = (u - 0.5) * Math.PI * 2; // theta = 0 is directly front (+Z)
                        const sinT = Math.sin(theta);
                        const cosT = Math.cos(theta);
                        const absAngle = Math.abs(theta);

                        // Base cranial profile envelope
                        let rx = 0.076;
                        let rz = 0.092;
                        let oz = -0.005;

                        if (v < 0.16) {
                            // Upper neck into sub-mental chin transition
                            const t = v / 0.16;
                            rx = THREE.MathUtils.lerp(0.056, 0.068 * jawWidthMod, t);
                            rz = THREE.MathUtils.lerp(0.058, 0.078, t);
                            oz = THREE.MathUtils.lerp(-0.012, 0.004, t);
                        } else if (v < 0.36) {
                            // Mandible / Jawline to Cheekbones
                            const t = (v - 0.16) / 0.20;
                            rx = THREE.MathUtils.lerp(0.068 * jawWidthMod, 0.078, t);
                            rz = THREE.MathUtils.lerp(0.080, 0.090, t);
                            oz = THREE.MathUtils.lerp(0.006, 0.002, t);
                        } else if (v < 0.68) {
                            // Zygomatic arch (cheekbones) through brow ridge
                            const t = (v - 0.36) / 0.32;
                            rx = THREE.MathUtils.lerp(0.079, 0.077, t);
                            rz = THREE.MathUtils.lerp(0.091, 0.094, t);
                            oz = 0.0;
                        } else {
                            // Cranial dome narrowing smoothly at top
                            const t = (v - 0.68) / 0.32;
                            const dome = Math.cos(t * Math.PI * 0.48);
                            rx = 0.077 * dome;
                            rz = 0.094 * dome;
                            oz = -0.006 * t;
                        }

                        let x = sinT * rx;
                        let z = oz + cosT * rz;

                        // --- FACIAL ANATOMY SCULPTING (FRONT HEMISPHERE: cosT > 0) ---
                        if (cosT > 0) {
                            // 1. Flatten face plane slightly for realistic human skull vs sphere
                            z -= Math.pow(cosT, 1.5) * 0.008;

                            // 2. Chin mental protuberance & strong jawline corners (Gonial angle)
                            const chinMask = Math.exp(-Math.pow((v - 0.19) / 0.055, 2)) * Math.exp(-Math.pow(theta / 0.32, 2));
                            z += chinMask * 0.015;

                            const jawCorner = Math.exp(-Math.pow((v - 0.25) / 0.07, 2)) * Math.exp(-Math.pow((absAngle - 0.72) / 0.22, 2));
                            x += Math.sign(sinT) * jawCorner * 0.009 * jawWidthMod;

                            // 3. Mouth / Lips (Upper & Lower Vermilion border + oral commissure)
                            const upperLip = Math.exp(-Math.pow((v - 0.31) / 0.025, 2)) * Math.exp(-Math.pow(theta / 0.28, 2));
                            const lowerLip = Math.exp(-Math.pow((v - 0.27) / 0.025, 2)) * Math.exp(-Math.pow(theta / 0.25, 2));
                            const mouthCrease = Math.exp(-Math.pow((v - 0.29) / 0.010, 2)) * Math.exp(-Math.pow(theta / 0.30, 2));
                            z += (upperLip * 0.011 + lowerLip * 0.009 - mouthCrease * 0.007);

                            // 4. Cheekbones (Zygomatic arch) & subtle gaunt hollow beneath
                            const cheekBone = Math.exp(-Math.pow((v - 0.48) / 0.07, 2)) * Math.exp(-Math.pow((absAngle - 0.52) / 0.22, 2));
                            x += Math.sign(sinT) * cheekBone * 0.007;
                            z += cheekBone * 0.007;

                            const cheekHollow = Math.exp(-Math.pow((v - 0.36) / 0.06, 2)) * Math.exp(-Math.pow((absAngle - 0.58) / 0.20, 2));
                            x -= Math.sign(sinT) * cheekHollow * 0.005;

                            // 5. Prominent Anatomical Nose (Bridge, Tip, Alar Nostrils)
                            if (v >= 0.35 && v <= 0.62) {
                                const nv = (v - 0.35) / 0.27; // 0 = base of nose, 1 = nasion between eyes
                                const noseProfile = Math.sin(nv * Math.PI * 0.85) * (1.0 - nv * 0.35);
                                const bridgeWidth = THREE.MathUtils.lerp(0.16, 0.09, nv);
                                const noseCenterMask = Math.exp(-Math.pow(theta / bridgeWidth, 2));
                                z += noseCenterMask * (0.025 * noseProfile + 0.005) * noseProminence;

                                // Nostril wings at bottom of nose
                                const alarMask = Math.exp(-Math.pow((v - 0.39) / 0.03, 2)) * Math.exp(-Math.pow((absAngle - 0.14) / 0.07, 2));
                                z += alarMask * 0.008;
                                x += Math.sign(sinT) * alarMask * 0.003;
                            }

                            // 6. Deep Orbital Eye Sockets & Eyelid Bulge
                            const eyeSocket = Math.exp(-Math.pow((v - 0.55) / 0.055, 2)) * Math.exp(-Math.pow((absAngle - 0.30) / 0.14, 2));
                            z -= eyeSocket * 0.015;

                            // 7. Supraorbital Brow Ridge & Glabella
                            const browRidge = Math.exp(-Math.pow((v - 0.63) / 0.038, 2)) * Math.exp(-Math.pow(theta / 0.52, 2));
                            z += browRidge * 0.013;
                        }

                        // 8. Sculpted Ears on Left & Right Sides (absAngle ~ PI/2)
                        const earMask = Math.exp(-Math.pow((v - 0.50) / 0.09, 2)) * Math.exp(-Math.pow((absAngle - 1.52) / 0.13, 2));
                        x += Math.sign(sinT) * earMask * 0.013;
                        z -= earMask * 0.004;

                        positions.push(x, y, z);
                        uvs.push(u, v);
                    }
                }

                const stride = radSegs + 1;
                for (let iy = 0; iy < ySegs; iy++) {
                    for (let ix = 0; ix < radSegs; ix++) {
                        const a = iy * stride + ix;
                        const b = (iy + 1) * stride + ix;
                        const c = (iy + 1) * stride + (ix + 1);
                        const d = iy * stride + (ix + 1);

                        indices.push(a, d, b);
                        indices.push(b, d, c);
                    }
                }

                geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
                geo.setIndex(indices);
                geo.computeVertexNormals();
                return geo;
            },

            // Sculpt a combat boot with distinct sole heel, ankle arch, instep, and rounded toe box
            createSculptedBootGeometry() {
                const geo = new THREE.BoxGeometry(0.102, 0.088, 0.255, 8, 6, 12);
                const pos = geo.attributes.position;

                for (let i = 0; i < pos.count; i++) {
                    let x = pos.getX(i);
                    let y = pos.getY(i); // -0.044 to +0.044
                    let z = pos.getZ(i); // -0.1275 (heel) to +0.1275 (toe)

                    const zn = (z + 0.1275) / 0.255; // 0 = heel, 1 = toe
                    const yn = (y + 0.044) / 0.088;  // 0 = sole bottom, 1 = ankle/instep top

                    // Taper heel width and round out toe box
                    if (zn < 0.35) {
                        x *= 0.82 + zn * 0.35;
                    } else if (zn > 0.65) {
                        // Forefoot width and rounded toe tip
                        const t = (zn - 0.65) / 0.35;
                        x *= (1.05 - Math.pow(t, 2) * 0.38);
                        if (t > 0.5) z -= Math.pow((x / 0.05), 2) * 0.018;
                    }

                    // Slope the instep downward from ankle (zn=0.35) toward the toe box (zn=0.85)
                    if (yn > 0.35 && zn > 0.32) {
                        const slope = Math.min(1.0, (zn - 0.32) / 0.45);
                        y -= slope * 0.032 * yn;
                        // Slight upturned toe spring & rounded leather toe cap
                        if (zn > 0.75) {
                            y += Math.sin(((zn - 0.75) / 0.25) * Math.PI) * 0.008;
                        }
                    }

                    // Carve out the mid-foot sole arch on the bottom
                    if (yn < 0.25 && zn > 0.28 && zn < 0.55) {
                        y += 0.010 * (1.0 - yn * 4.0);
                    }

                    // Round top edges so the boot never looks boxy
                    if (yn > 0.5) {
                        x *= 1.0 - Math.pow((yn - 0.5) * 2.0, 2) * 0.18;
                    }

                    pos.setXYZ(i, x, y, z);
                }

                // Shift so ankle pivot is at (0, 0, 0) and foot extends forward (+Z) and down (-Y)
                geo.translate(0, -0.042, 0.052);
                geo.computeVertexNormals();
                return geo;
            },

            // Build an articulated, multi-fingered hand mesh (palm + thumb + curled finger bank)
            createArticulatedHand(isRight, skinMat) {
                const handGroup = new THREE.Group();
                const side = isRight ? -1 : 1;

                // Sculpted palm / metacarpals with rounded knuckles
                const palmGeo = new THREE.BoxGeometry(0.034, 0.078, 0.072, 4, 4, 4);
                const pPos = palmGeo.attributes.position;
                for (let i = 0; i < pPos.count; i++) {
                    let x = pPos.getX(i);
                    let y = pPos.getY(i);
                    let z = pPos.getZ(i);
                    // Taper wrist end (y > 0) and round edges
                    if (y > 0.01) z *= 0.82;
                    x *= 1.0 - Math.pow(z / 0.045, 2) * 0.15;
                    pPos.setXYZ(i, x, y, z);
                }
                palmGeo.computeVertexNormals();
                const palm = new THREE.Mesh(palmGeo, skinMat);
                palm.position.set(0, -0.036, 0.004);
                handGroup.add(palm);

                // 4 Curled Fingers wrapping around rifle grip/forestock
                const fingerOffsets = [-0.024, -0.008, 0.008, 0.023];
                const fingerLengths = [0.052, 0.058, 0.054, 0.044];
                fingerOffsets.forEach((fz, idx) => {
                    const fLen = fingerLengths[idx];
                    const fingerPivot = new THREE.Group();
                    fingerPivot.position.set(0, -0.072, fz + 0.004);
                    // Curl fingers inward toward the palm to grip the weapon
                    fingerPivot.rotation.z = side * (isRight && idx === 0 ? 0.65 : 1.15);

                    const phalanx1 = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.0075, 0.0065, fLen * 0.58, 7),
                        skinMat
                    );
                    phalanx1.position.y = -fLen * 0.28;
                    fingerPivot.add(phalanx1);

                    const phalanx2 = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.0065, 0.0055, fLen * 0.52, 7),
                        skinMat
                    );
                    phalanx2.position.set(side * -0.012, -fLen * 0.48, 0);
                    phalanx2.rotation.z = side * 0.85;
                    fingerPivot.add(phalanx2);

                    handGroup.add(fingerPivot);
                });

                // Opposable Thumb wrapping around the opposite side of stock
                const thumbPivot = new THREE.Group();
                thumbPivot.position.set(side * -0.012, -0.042, 0.032);
                thumbPivot.rotation.set(0.45, side * -0.35, side * -0.65);
                const thumbMesh = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.0095, 0.0075, 0.048, 8),
                    skinMat
                );
                thumbMesh.position.y = -0.022;
                thumbPivot.add(thumbMesh);
                handGroup.add(thumbPivot);

                return handGroup;
            }
        };


    // ------------------------------------------------------------------------
    // 2. COMPACT 128px PBR TEXTURES + NORMAL MAPS (generated once, shared)
    // ------------------------------------------------------------------------
        const TextureFactory = {
            previews: [],

            // Helper to convert a grayscale height canvas into an RGB Tangent-Space Normal Map
            heightToNormalMap(heightCanvas, strength = 2.2) {
                const w = heightCanvas.width;
                const h = heightCanvas.height;
                const ctx = heightCanvas.getContext('2d');
                const src = ctx.getImageData(0, 0, w, h).data;

                const normCanvas = document.createElement('canvas');
                normCanvas.width = w;
                normCanvas.height = h;
                const nCtx = normCanvas.getContext('2d');
                const dstImg = nCtx.createImageData(w, h);
                const dst = dstImg.data;

                const getH = (x, y) => {
                    const wx = (x + w) % w;
                    const wy = (y + h) % h;
                    return src[(wy * w + wx) * 4] / 255.0;
                };

                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const tl = getH(x - 1, y - 1);
                        const t  = getH(x,     y - 1);
                        const tr = getH(x + 1, y - 1);
                        const l  = getH(x - 1, y);
                        const r  = getH(x + 1, y);
                        const bl = getH(x - 1, y + 1);
                        const b  = getH(x,     y + 1);
                        const br = getH(x + 1, y + 1);

                        const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
                        const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);
                        const dZ = 1.0 / strength;

                        const len = Math.sqrt(dX * dX + dY * dY + dZ * dZ);
                        const nx = (-dX / len) * 0.5 + 0.5;
                        const ny = (-dY / len) * 0.5 + 0.5;
                        const nz = (dZ / len) * 0.5 + 0.5;

                        const idx = (y * w + x) * 4;
                        dst[idx]     = Math.floor(nx * 255);
                        dst[idx + 1] = Math.floor(ny * 255);
                        dst[idx + 2] = Math.floor(nz * 255);
                        dst[idx + 3] = 255;
                    }
                }
                nCtx.putImageData(dstImg, 0, 0);
                const tex = new THREE.CanvasTexture(normCanvas);
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                return { texture: tex, canvas: normCanvas };
            },

            // Compact 128x128 Gritty WWII Wool/Cotton Fabric with Baked Seam & Fold AO
            createFabricMaps(baseHex, label, weaveScale = 2, grime = 0.14) {
                const size = 128; // Deliberately compact low-res game-ready texture
                const albedoC = document.createElement('canvas');
                const heightC = document.createElement('canvas');
                albedoC.width = albedoC.height = size;
                heightC.width = heightC.height = size;

                const aCtx = albedoC.getContext('2d');
                const hCtx = heightC.getContext('2d');

                const baseColor = new THREE.Color(baseHex);
                aCtx.fillStyle = `#${baseColor.getHexString()}`;
                aCtx.fillRect(0, 0, size, size);

                hCtx.fillStyle = '#808080';
                hCtx.fillRect(0, 0, size, size);

                // Fine low-res twill weave + organic wool/cotton fiber variation
                const step = weaveScale;
                for (let y = 0; y < size; y += step) {
                    for (let x = 0; x < size; x += step) {
                        const diag = ((x + y) / step) % 3 === 0;
                        const foldWave = Math.sin((x / size) * Math.PI * 6) * 0.03;
                        const noise = (Math.random() - 0.5) * grime;
                        const shade = (diag ? 0.025 : -0.025) + foldWave + noise;

                        const c = baseColor.clone().offsetHSL(0, (Math.random() - 0.5) * 0.04, shade);
                        aCtx.fillStyle = `#${c.getHexString()}`;
                        aCtx.fillRect(x, y, step, step);

                        const hVal = Math.max(0, Math.min(255, Math.floor(128 + (diag ? 28 : -28) + foldWave * 350 + noise * 70)));
                        hCtx.fillStyle = `rgb(${hVal},${hVal},${hVal})`;
                        hCtx.fillRect(x, y, step, step);
                    }
                }

                // Baked ambient occlusion & field dirt near lower garment hems
                const aoGrad = aCtx.createLinearGradient(0, 0, 0, size);
                aoGrad.addColorStop(0, 'rgba(20, 18, 15, 0.18)');
                aoGrad.addColorStop(0.25, 'rgba(20, 18, 15, 0.0)');
                aoGrad.addColorStop(0.75, 'rgba(20, 18, 15, 0.0)');
                aoGrad.addColorStop(1, 'rgba(32, 26, 20, 0.28)');
                aCtx.fillStyle = aoGrad;
                aCtx.fillRect(0, 0, size, size);

                // Combat grime & mud smudges
                for (let i = 0; i < 28; i++) {
                    const rx = Math.random() * size;
                    const ry = Math.random() * size;
                    const rr = 4 + Math.random() * 14;
                    const grad = aCtx.createRadialGradient(rx, ry, 1, rx, ry, rr);
                    grad.addColorStop(0, 'rgba(28, 23, 17, 0.20)');
                    grad.addColorStop(1, 'rgba(28, 23, 17, 0)');
                    aCtx.fillStyle = grad;
                    aCtx.beginPath();
                    aCtx.arc(rx, ry, rr, 0, Math.PI * 2);
                    aCtx.fill();
                }

                const albedoTex = new THREE.CanvasTexture(albedoC); albedoTex.encoding = THREE.sRGBEncoding;
                albedoTex.wrapS = albedoTex.wrapT = THREE.RepeatWrapping;
                albedoTex.repeat.set(2, 2);

                const normalObj = this.heightToNormalMap(heightC, 1.8);
                normalObj.texture.repeat.set(2, 2);

                return { map: albedoTex, normalMap: normalObj.texture };
            },

            // 128x128 Helmet Steel + Optional Netting (for US M1 Helmet)
            createHelmetMaps(baseHex, hasNetting = false, label = "Helmet") {
                const size = 128;
                const albedoC = document.createElement('canvas');
                const heightC = document.createElement('canvas');
                albedoC.width = albedoC.height = size;
                heightC.width = heightC.height = size;

                const aCtx = albedoC.getContext('2d');
                const hCtx = heightC.getContext('2d');

                const baseColor = new THREE.Color(baseHex);
                aCtx.fillStyle = `#${baseColor.getHexString()}`;
                aCtx.fillRect(0, 0, size, size);

                hCtx.fillStyle = '#808080';
                hCtx.fillRect(0, 0, size, size);

                // Matte cork-textured anti-glare combat paint
                for (let i = 0; i < 1600; i++) {
                    const x = Math.random() * size;
                    const y = Math.random() * size;
                    const v = (Math.random() - 0.5) * 0.07;
                    const c = baseColor.clone().offsetHSL(0, 0, v);
                    aCtx.fillStyle = `#${c.getHexString()}`;
                    aCtx.fillRect(x, y, 1.5, 1.5);

                    const hv = Math.floor(128 + v * 400);
                    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
                    hCtx.fillRect(x, y, 1.5, 1.5);
                }

                // Weathered steel scratches & crown wear
                aCtx.strokeStyle = 'rgba(180, 185, 190, 0.25)';
                hCtx.strokeStyle = 'rgb(95,95,95)';
                for (let i = 0; i < 24; i++) {
                    const x = Math.random() * size;
                    const y = Math.random() * size;
                    const a = Math.random() * Math.PI;
                    const l = 4 + Math.random() * 10;
                    aCtx.beginPath();
                    aCtx.moveTo(x, y);
                    aCtx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
                    aCtx.stroke();
                }

                // Woven shrimp-netting overlay for U.S. M1 Helmet
                if (hasNetting) {
                    const grid = 12;
                    aCtx.lineWidth = 2.0;
                    hCtx.lineWidth = 2.4;
                    for (let i = -size; i < size * 2; i += grid) {
                        aCtx.strokeStyle = '#363223';
                        hCtx.strokeStyle = '#f5f5f5';
                        aCtx.beginPath(); aCtx.moveTo(i, 0); aCtx.lineTo(i + size, size); aCtx.stroke();
                        hCtx.beginPath(); hCtx.moveTo(i, 0); aCtx.lineTo(i + size, size); hCtx.stroke();

                        aCtx.strokeStyle = '#45402d';
                        aCtx.beginPath(); aCtx.moveTo(i + size, 0); aCtx.lineTo(i, size); aCtx.stroke();
                        hCtx.beginPath(); hCtx.moveTo(i + size, 0); aCtx.lineTo(i, size); hCtx.stroke();
                    }
                }

                const albedoTex = new THREE.CanvasTexture(albedoC); albedoTex.encoding = THREE.sRGBEncoding;
                albedoTex.wrapS = albedoTex.wrapT = THREE.RepeatWrapping;
                const normalObj = this.heightToNormalMap(heightC, hasNetting ? 3.2 : 1.6);

                if (hasNetting) {
                }

                return { map: albedoTex, normalMap: normalObj.texture };
            },

            // 128x128 Oiled Walnut Wood Stock Texture & Normal Map
            createWoodMaps() {
                const size = 128;
                const albedoC = document.createElement('canvas');
                const heightC = document.createElement('canvas');
                albedoC.width = albedoC.height = size;
                heightC.width = heightC.height = size;

                const aCtx = albedoC.getContext('2d');
                const hCtx = heightC.getContext('2d');

                const base = new THREE.Color(0x522d16);
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const grain = Math.sin(y * 0.35 + Math.sin(x * 0.08) * 2.5) * 0.055 + (Math.random() - 0.5) * 0.025;
                        const c = base.clone().offsetHSL(0, 0, grain);
                        aCtx.fillStyle = `#${c.getHexString()}`;
                        aCtx.fillRect(x, y, 1, 1);

                        const hv = Math.floor(128 + grain * 480);
                        hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
                        hCtx.fillRect(x, y, 1, 1);
                    }
                }

                const albedoTex = new THREE.CanvasTexture(albedoC); albedoTex.encoding = THREE.sRGBEncoding;
                albedoTex.wrapS = albedoTex.wrapT = THREE.RepeatWrapping;
                const normalObj = this.heightToNormalMap(heightC, 1.6);
                return { map: albedoTex, normalMap: normalObj.texture };
            },

            // 128x128 Pebbled Leather Boots & Pouches with Mud Splatter
            createLeatherMaps(baseHex = 0x1a1715) {
                const size = 128;
                const albedoC = document.createElement('canvas');
                const heightC = document.createElement('canvas');
                albedoC.width = albedoC.height = size;
                heightC.width = heightC.height = size;

                const aCtx = albedoC.getContext('2d');
                const hCtx = heightC.getContext('2d');
                const base = new THREE.Color(baseHex);

                aCtx.fillStyle = `#${base.getHexString()}`;
                aCtx.fillRect(0, 0, size, size);
                hCtx.fillStyle = '#808080';
                hCtx.fillRect(0, 0, size, size);

                for (let i = 0; i < 1200; i++) {
                    const x = Math.random() * size;
                    const y = Math.random() * size;
                    const r = 1.0 + Math.random() * 1.8;
                    const v = (Math.random() - 0.5) * 0.05;
                    const c = base.clone().offsetHSL(0, 0, v);
                    aCtx.fillStyle = `#${c.getHexString()}`;
                    aCtx.beginPath(); aCtx.arc(x, y, r, 0, Math.PI * 2); aCtx.fill();

                    const hv = Math.floor(128 + (Math.random() - 0.5) * 65);
                    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
                    hCtx.beginPath(); hCtx.arc(x, y, r, 0, Math.PI * 2); hCtx.fill();
                }

                // Dried mud & dust caked onto lower boots
                const grad = aCtx.createLinearGradient(0, size * 0.45, 0, size);
                grad.addColorStop(0, 'rgba(72, 58, 44, 0)');
                grad.addColorStop(1, 'rgba(72, 58, 44, 0.48)');
                aCtx.fillStyle = grad;
                aCtx.fillRect(0, 0, size, size);

                const albedoTex = new THREE.CanvasTexture(albedoC); albedoTex.encoding = THREE.sRGBEncoding;
                albedoTex.wrapS = albedoTex.wrapT = THREE.RepeatWrapping;
                const normalObj = this.heightToNormalMap(heightC, 2.0);
                return { map: albedoTex, normalMap: normalObj.texture };
            },

            // 256x256 Battlefield Ground Rubble & Dirt Maps
            createGroundMaps() {
                const size = 256;
                const albedoC = document.createElement('canvas');
                const heightC = document.createElement('canvas');
                albedoC.width = albedoC.height = size;
                heightC.width = heightC.height = size;

                const aCtx = albedoC.getContext('2d');
                const hCtx = heightC.getContext('2d');

                aCtx.fillStyle = '#383028';
                aCtx.fillRect(0, 0, size, size);
                hCtx.fillStyle = '#707070';
                hCtx.fillRect(0, 0, size, size);

                for (let i = 0; i < 4500; i++) {
                    const x = Math.random() * size;
                    const y = Math.random() * size;
                    const s = 1 + Math.random() * 3;
                    const palette = ['#2a231d', '#463b31', '#54473b', '#615142', '#221d19'];
                    aCtx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
                    aCtx.fillRect(x, y, s, s);

                    const hv = Math.floor(85 + Math.random() * 95);
                    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
                    hCtx.fillRect(x, y, s, s);
                }

                for (let i = 0; i < 180; i++) {
                    const x = Math.random() * size;
                    const y = Math.random() * size;
                    const r = 1.5 + Math.random() * 4;
                    aCtx.fillStyle = Math.random() > 0.5 ? '#6c6258' : '#4d443b';
                    aCtx.beginPath(); aCtx.arc(x, y, r, 0, Math.PI * 2); aCtx.fill();

                    hCtx.fillStyle = '#d8d8d8';
                    hCtx.beginPath(); hCtx.arc(x, y, r, 0, Math.PI * 2); hCtx.fill();
                }

                const albedoTex = new THREE.CanvasTexture(albedoC); albedoTex.encoding = THREE.sRGBEncoding;
                albedoTex.wrapS = albedoTex.wrapT = THREE.RepeatWrapping;
                albedoTex.repeat.set(10, 10);

                const normalObj = this.heightToNormalMap(heightC, 3.4);
                normalObj.texture.repeat.set(10, 10);
                return { map: albedoTex, normalMap: normalObj.texture };
            },

            // 256x256 Realistic Weathered Male Face Texture + Pore/Stubble Normal Map
            createFaceMaps() {
                const size = 256;
                const c = document.createElement('canvas');
                const h = document.createElement('canvas');
                c.width = c.height = size;
                h.width = h.height = size;
                const ctx = c.getContext('2d');
                const hCtx = h.getContext('2d');

                // Warm sub-dermal Caucasian/olive base skin tone
                ctx.fillStyle = '#bf8b6e';
                ctx.fillRect(0, 0, size, size);

                hCtx.fillStyle = '#808080';
                hCtx.fillRect(0, 0, size, size);

                // Natural skin color zones: forehead warmth, ruddy nose/cheeks, darker eye sockets
                const cheekGrad = ctx.createRadialGradient(size * 0.5, size * 0.52, 8, size * 0.5, size * 0.52, 85);
                cheekGrad.addColorStop(0, 'rgba(155, 72, 55, 0.30)');
                cheekGrad.addColorStop(1, 'rgba(155, 72, 55, 0)');
                ctx.fillStyle = cheekGrad;
                ctx.fillRect(0, 0, size, size);

                // Recessed orbital eye socket shadowing (prevents bug-eyed look)
                [size * 0.42, size * 0.58].forEach(ex => {
                    const eyeShadow = ctx.createRadialGradient(ex, size * 0.44, 2, ex, size * 0.44, 18);
                    eyeShadow.addColorStop(0, 'rgba(42, 28, 22, 0.55)');
                    eyeShadow.addColorStop(1, 'rgba(42, 28, 22, 0)');
                    ctx.fillStyle = eyeShadow;
                    ctx.fillRect(0, 0, size, size);
                });

                // Thick masculine eyebrows above sockets
                ctx.strokeStyle = '#2d231e';
                ctx.lineWidth = 4.5;
                ctx.lineCap = 'round';
                // Left & Right brow
                ctx.beginPath(); ctx.moveTo(size * 0.36, size * 0.38); ctx.quadraticCurveTo(size * 0.42, size * 0.36, size * 0.47, size * 0.385); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(size * 0.64, size * 0.38); ctx.quadraticCurveTo(size * 0.58, size * 0.36, size * 0.53, size * 0.385); ctx.stroke();

                // Nasolabial folds & weathered forehead lines
                ctx.strokeStyle = 'rgba(65, 42, 32, 0.28)';
                ctx.lineWidth = 1.8;
                ctx.beginPath(); ctx.moveTo(size * 0.45, size * 0.56); ctx.lineTo(size * 0.40, size * 0.70); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(size * 0.55, size * 0.56); ctx.lineTo(size * 0.60, size * 0.70); ctx.stroke();

                // Natural muted lips at v ~ 0.30 (canvas y ~ 0.70)
                const lipGrad = ctx.createRadialGradient(size * 0.5, size * 0.70, 2, size * 0.5, size * 0.70, 20);
                lipGrad.addColorStop(0, 'rgba(130, 68, 60, 0.55)');
                lipGrad.addColorStop(1, 'rgba(130, 68, 60, 0)');
                ctx.fillStyle = lipGrad;
                ctx.fillRect(0, 0, size, size);

                // 5-o'clock beard stubble shadow across jaw, chin & upper lip
                const jawGrad = ctx.createRadialGradient(size * 0.5, size * 0.74, 10, size * 0.5, size * 0.74, 65);
                jawGrad.addColorStop(0, 'rgba(38, 34, 30, 0.42)');
                jawGrad.addColorStop(0.7, 'rgba(38, 34, 30, 0.25)');
                jawGrad.addColorStop(1, 'rgba(38, 34, 30, 0)');
                ctx.fillStyle = jawGrad;
                ctx.fillRect(0, size * 0.52, size, size * 0.48);

                // Micro skin pores, stubble follicles & battlefield soot smudges
                for (let i = 0; i < 1800; i++) {
                    const x = Math.random() * size;
                    const y = Math.random() * size;
                    const isBeardZone = y > size * 0.58 && x > size * 0.25 && x < size * 0.75;
                    ctx.fillStyle = isBeardZone ? 'rgba(32, 27, 24, 0.28)' : 'rgba(90, 58, 45, 0.12)';
                    ctx.fillRect(x, y, 1.3, 1.3);

                    const hv = Math.floor(128 + (Math.random() - 0.5) * (isBeardZone ? 75 : 35));
                    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
                    hCtx.fillRect(x, y, 1.5, 1.5);
                }

                const albedoTex = new THREE.CanvasTexture(c); albedoTex.encoding = THREE.sRGBEncoding;
                const normalObj = this.heightToNormalMap(h, 1.4);
                return { map: albedoTex, normalMap: normalObj.texture };
            }
        };


    const MATS = {};
    const SOLDIER_TEMPLATES = {};
    let materialsInitialized = false;

        function initMaterials() {
            if (materialsInitialized) return;
            const usJacketMaps = TextureFactory.createFabricMaps(0x635b3d, "US Olive Drab", 2, 0.14);
            const usPantsMaps  = TextureFactory.createFabricMaps(0x554c33, "US HBT Trousers", 2, 0.16);
            const sovTunicMaps = TextureFactory.createFabricMaps(0x6d5a36, "Soviet Khaki", 2, 0.15);
            const gerTunicMaps = TextureFactory.createFabricMaps(0x454f46, "Feldgrau Wool", 2, 0.14);
            const gerPantsMaps = TextureFactory.createFabricMaps(0x49514b, "Feldgrau Pants", 2, 0.15);

            const usHelmetMaps  = TextureFactory.createHelmetMaps(0x454836, true, "M1 Helmet");
            const sovHelmetMaps = TextureFactory.createHelmetMaps(0x485237, false, "SSh-40");
            const gerHelmetMaps = TextureFactory.createHelmetMaps(0x343a38, false, "Stahlhelm");

            const woodMaps       = TextureFactory.createWoodMaps();
            const blackLeather   = TextureFactory.createLeatherMaps(0x181615);
            const brownLeather   = TextureFactory.createLeatherMaps(0x472c1a);
            const webCanvasMaps  = TextureFactory.createFabricMaps(0x7a6e4a, "Web Gear", 2, 0.18);
            const faceMaps       = TextureFactory.createFaceMaps();

            const registerMat = (mat) => {
                return mat;
            };

            // Matte Wool & Cotton Uniforms (High roughness + zero metalness so they never look like plastic toys)
            MATS.usJacket = registerMat(new THREE.MeshStandardMaterial({
                map: usJacketMaps.map, normalMap: usJacketMaps.normalMap,
                normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.92, metalness: 0.0
            }));
            MATS.usPants = registerMat(new THREE.MeshStandardMaterial({
                map: usPantsMaps.map, normalMap: usPantsMaps.normalMap,
                normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.93, metalness: 0.0
            }));
            MATS.sovietTunic = registerMat(new THREE.MeshStandardMaterial({
                map: sovTunicMaps.map, normalMap: sovTunicMaps.normalMap,
                normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.92, metalness: 0.0
            }));
            MATS.germanTunic = registerMat(new THREE.MeshStandardMaterial({
                map: gerTunicMaps.map, normalMap: gerTunicMaps.normalMap,
                normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.90, metalness: 0.0
            }));
            MATS.germanPants = registerMat(new THREE.MeshStandardMaterial({
                map: gerPantsMaps.map, normalMap: gerPantsMaps.normalMap,
                normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.91, metalness: 0.0
            }));

            // Weathered Combat Steel Helmets
            MATS.usHelmet = registerMat(new THREE.MeshStandardMaterial({
                map: usHelmetMaps.map, normalMap: usHelmetMaps.normalMap,
                normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.72, metalness: 0.22
            }));
            MATS.sovietHelmet = registerMat(new THREE.MeshStandardMaterial({
                map: sovHelmetMaps.map, normalMap: sovHelmetMaps.normalMap,
                normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.58, metalness: 0.32
            }));
            MATS.germanHelmet = registerMat(new THREE.MeshStandardMaterial({
                map: gerHelmetMaps.map, normalMap: gerHelmetMaps.normalMap,
                normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.50, metalness: 0.38
            }));

            // Equipment, Leather, Skin, Weapons
            MATS.webGear = registerMat(new THREE.MeshStandardMaterial({
                map: webCanvasMaps.map, normalMap: webCanvasMaps.normalMap,
                normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.94, metalness: 0.0
            }));
            MATS.blackLeather = registerMat(new THREE.MeshStandardMaterial({
                map: blackLeather.map, normalMap: blackLeather.normalMap,
                normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.52, metalness: 0.08
            }));
            MATS.brownLeather = registerMat(new THREE.MeshStandardMaterial({
                map: brownLeather.map, normalMap: brownLeather.normalMap,
                normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.56, metalness: 0.06
            }));
            MATS.wood = registerMat(new THREE.MeshStandardMaterial({
                map: woodMaps.map, normalMap: woodMaps.normalMap,
                normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.62, metalness: 0.04
            }));
            MATS.gunMetal = registerMat(new THREE.MeshStandardMaterial({
                color: 0x262a2e, normalMap: gerHelmetMaps.normalMap,
                normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.34, metalness: 0.85
            }));
            MATS.brass = registerMat(new THREE.MeshStandardMaterial({
                color: 0xb59449, roughness: 0.38, metalness: 0.78
            }));
            // Realistic Human Skin with subtle dermal sheen & pore normal map (no plastic gloss)
            MATS.skin = registerMat(new THREE.MeshStandardMaterial({
                map: faceMaps.map,
                normalMap: faceMaps.normalMap,
                normalScale: new THREE.Vector2(0.45, 0.45),
                roughness: 0.72,
                metalness: 0.0            }));
            MATS.redInsignia = registerMat(new THREE.MeshStandardMaterial({
                color: 0x991b1b, roughness: 0.75, metalness: 0.05
            }));
            MATS.darkCollar = registerMat(new THREE.MeshStandardMaterial({
                color: 0x1b2821, roughness: 0.85, metalness: 0.02
            }));
            MATS.silverInsignia = registerMat(new THREE.MeshStandardMaterial({
                color: 0xcbd5e1, roughness: 0.38, metalness: 0.72
            }));


            Object.values(MATS).forEach(m => { m.envMapIntensity = 0.4; });
            materialsInitialized = true;
        }

        function buildRifle(type) {
            const rifle = new THREE.Group();

            // Ergonomic Sculpted Wooden Rifle Stock (Buttstock, Wrist/Pistol Grip, Comb, and Fore-end)
            const stockGeo = new THREE.BoxGeometry(0.038, 0.082, 0.68, 4, 6, 22);
            const pos = stockGeo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                let x = pos.getX(i);
                let y = pos.getY(i);
                let z = pos.getZ(i); // -0.34 (butt) to +0.34 (fore-end)

                if (z < -0.10) {
                    // Buttstock drop and cheek comb profile
                    const t = (-0.10 - z) / 0.24; // 0 at wrist, 1 at buttplate
                    if (y < 0) {
                        y -= t * 0.055; // Bottom toe of buttstock drops down
                    } else {
                        // Carved wrist dip right behind receiver (-0.18 to -0.10)
                        const wristDip = Math.exp(-Math.pow((z + 0.13) / 0.045, 2));
                        y -= wristDip * 0.022;
                    }
                    // Round out stock cross-section
                    x *= 1.0 - Math.pow(y / 0.09, 2) * 0.22;
                } else if (z >= -0.10 && z < 0.02) {
                    // Pistol grip / trigger wrist area
                    x *= 0.84;
                    if (y < 0) y *= 0.68;
                } else {
                    // Tapered wooden fore-end and upper handguard barrel channel
                    const t = (z - 0.02) / 0.32;
                    x *= THREE.MathUtils.lerp(0.92, 0.68, t);
                    if (y < 0) y *= THREE.MathUtils.lerp(0.62, 0.38, t);
                    if (y > 0) y *= THREE.MathUtils.lerp(0.55, 0.42, t);
                }
                pos.setXYZ(i, x, y, z);
            }
            stockGeo.computeVertexNormals();
            const stock = new THREE.Mesh(stockGeo, MATS.wood);
            rifle.add(stock);

            // Steel Buttplate
            const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.115, 0.014), MATS.gunMetal);
            buttPlate.position.set(0, -0.028, -0.342);
            rifle.add(buttPlate);

            // Machined Steel Receiver & Bolt Housing
            const receiver = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.17, 12), MATS.gunMetal);
            receiver.rotation.x = Math.PI / 2;
            receiver.position.set(0, 0.026, -0.03);
            rifle.add(receiver);

            // Internal Magazine Floorplate & Trigger Guard
            const magWell = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.11), MATS.gunMetal);
            magWell.position.set(0, -0.022, -0.02);
            rifle.add(magWell);

            const trigGuard = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.0035, 6, 12), MATS.gunMetal);
            trigGuard.rotation.y = Math.PI / 2;
            trigGuard.position.set(0, -0.034, -0.075);
            rifle.add(trigGuard);

            // Trigger blade
            const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.018, 0.008), MATS.gunMetal);
            trigger.position.set(0, -0.028, -0.075);
            trigger.rotation.x = 0.35;
            rifle.add(trigger);

            // Barrel Length & Specific Service Rifle Features
            const barrelLen = type === 'mosin' ? 0.68 : 0.56;
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0135, barrelLen, 12), MATS.gunMetal);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(0, 0.028, 0.28 + (barrelLen - 0.56) * 0.5);
            rifle.add(barrel);

            // Front Sight Post & Protective Hood/Ears
            const frontSightZ = 0.53 + (barrelLen - 0.56);
            const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.024, 0.016), MATS.gunMetal);
            frontSight.position.set(0, 0.042, frontSightZ);
            rifle.add(frontSight);

            // Rear Sight Tangent / Aperture Assembly
            const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.018, 0.045), MATS.gunMetal);
            rearSight.position.set(0, 0.042, type === 'garand' ? -0.09 : 0.06);
            rifle.add(rearSight);

            // Steel Barrel Bands holding wooden handguard
            [0.08, 0.28].forEach(zPos => {
                const band = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.052, 0.015), MATS.gunMetal);
                band.position.set(0, 0.010, zPos);
                rifle.add(band);
            });

            if (type === 'garand') {
                // M1 Garand Gas Cylinder & Operating Rod under barrel
                const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.32, 10), MATS.gunMetal);
                gasTube.rotation.x = Math.PI / 2;
                gasTube.position.set(0, 0.013, 0.36);
                rifle.add(gasTube);
            } else {
                // Bolt Handle for Mosin-Nagant (straight horizontal) or Kar98k (turned-down bent handle)
                const boltStem = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.044, 8), MATS.silverInsignia);
                boltStem.rotation.z = type === 'kar98k' ? Math.PI / 3.2 : Math.PI / 2;
                boltStem.position.set(0.024, 0.026, -0.04);
                rifle.add(boltStem);

                const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 8), MATS.silverInsignia);
                boltKnob.position.set(0.042, type === 'kar98k' ? 0.012 : 0.026, -0.04);
                rifle.add(boltKnob);
            }

            // Taut Leather Rifle Sling with Metal Swivels
            const slingCurve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(0, -0.048, -0.27),
                new THREE.Vector3(0, -0.095, 0.01),
                new THREE.Vector3(0, -0.018, 0.28)
            );
            const slingGeo = new THREE.TubeGeometry(slingCurve, 14, 0.006, 6, false);
            const sling = new THREE.Mesh(slingGeo, MATS.brownLeather);
            rifle.add(sling);

            rifle.userData.muzzleOffset = new THREE.Vector3(0, 0.028, 0.28 + (barrelLen - 0.56) * 0.5 + barrelLen * 0.5);
            return rifle;
        }

        // ============================================================================
        // 6. ACCURATE WWII HELMET BUILDER (M1 NETTED, SSH-40 RED STAR, STAHLHELM M42)
        // ============================================================================
        function buildHelmet(faction) {
            const helmetGroup = new THREE.Group();

            if (faction === 'us') {
                // U.S. M1 "Steel Pot" Helmet with authentic elliptical deep dome & front visor lip
                const domeGeo = new THREE.SphereGeometry(0.118, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
                domeGeo.scale(0.95, 0.94, 1.12);
                const pos = domeGeo.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    let x = pos.getX(i);
                    let y = pos.getY(i);
                    let z = pos.getZ(i);
                    if (y < 0.025) {
                        // Subtle flared rim & front visor dip
                        const rimT = (0.025 - y) / 0.025;
                        x *= 1.0 + rimT * 0.04;
                        if (z > 0.04) {
                            z += rimT * 0.012;
                            y -= rimT * 0.006;
                        }
                    }
                    pos.setXYZ(i, x, y, z);
                }
                domeGeo.computeVertexNormals();
                const m1Mat = MATS.usHelmet.clone();
                m1Mat.side = THREE.DoubleSide;
                const dome = new THREE.Mesh(domeGeo, m1Mat);
                helmetGroup.add(dome);

            } else if (faction === 'soviet') {
                // Soviet SSh-40 Steel Helmet with sloped crown, subtle ear-skirt flare & front brim
                const domeGeo = new THREE.SphereGeometry(0.117, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58);
                domeGeo.scale(0.96, 0.92, 1.10);
                const pos = domeGeo.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    let x = pos.getX(i);
                    let y = pos.getY(i);
                    let z = pos.getZ(i);
                    if (y < 0.03) {
                        const t = (0.03 - y) / 0.03;
                        // Flared side/back ear guard and raised front brow cutout
                        if (z < 0.04) {
                            x *= 1.0 + t * 0.09;
                            z *= 1.0 + t * 0.07;
                            y -= t * 0.010;
                        } else {
                            y += t * 0.008;
                            z += t * 0.009;
                        }
                    }
                    pos.setXYZ(i, x, y, z);
                }
                domeGeo.computeVertexNormals();
                const sshMat = MATS.sovietHelmet.clone();
                sshMat.side = THREE.DoubleSide;
                const dome = new THREE.Mesh(domeGeo, sshMat);
                helmetGroup.add(dome);

                // Embossed 5-Pointed Red Star on front of SSh-40
                const starShape = new THREE.Shape();
                for (let i = 0; i < 10; i++) {
                    const r = i % 2 === 0 ? 0.020 : 0.008;
                    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
                    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                const starGeo = new THREE.ShapeGeometry(starShape);
                const star = new THREE.Mesh(starGeo, MATS.redInsignia);
                star.position.set(0, 0.055, 0.123);
                star.rotation.x = -0.28;
                helmetGroup.add(star);

            } else if (faction === 'german') {
                // German Stahlhelm M42 with authentic deep neck guard flare, brow step & side vent lugs
                const stahlSlices = [
                    { y: -0.032, rx: 0.130, rz: 0.150, oz: -0.010, squareness: 0.08 },
                    { y: -0.010, rx: 0.118, rz: 0.138, oz: -0.005, squareness: 0.06 },
                    { y:  0.012, rx: 0.109, rz: 0.128, oz:  0.000, squareness: 0.05 },
                    { y:  0.042, rx: 0.106, rz: 0.124, oz: -0.002, squareness: 0.04 },
                    { y:  0.072, rx: 0.094, rz: 0.110, oz: -0.004, squareness: 0.02 },
                    { y:  0.096, rx: 0.068, rz: 0.080, oz: -0.005, squareness: 0.0 },
                    { y:  0.110, rx: 0.028, rz: 0.032, oz: -0.005, squareness: 0.0 }
                ];
                const stahlGeo = SculptEngine.createLoftedMesh(stahlSlices, 28, true, false);
                const pos = stahlGeo.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    let x = pos.getX(i);
                    let y = pos.getY(i);
                    let z = pos.getZ(i);
                    // Raise the front brow visor cutout relative to the deep rear neck guard skirt
                    if (y < 0.015 && z > 0.01) {
                        const frontFactor = Math.min(1.0, (z - 0.01) / 0.11);
                        y += frontFactor * 0.028;
                        z += frontFactor * 0.008;
                    }
                    pos.setXYZ(i, x, y, z);
                }
                stahlGeo.computeVertexNormals();
                const stahlMat = MATS.germanHelmet.clone();
                stahlMat.side = THREE.DoubleSide;
                const stahlMesh = new THREE.Mesh(stahlGeo, stahlMat);
                helmetGroup.add(stahlMesh);

                // Side ventilation lugs & split-pin rivets
                [-0.106, 0.106].forEach(vx => {
                    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 8), MATS.germanHelmet);
                    lug.rotation.z = Math.PI / 2;
                    lug.position.set(vx, 0.038, 0.015);
                    helmetGroup.add(lug);
                });
            }

            // Fitted Leather Chinstrap Hugging the Jawline
            const strapCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(-0.082, 0.005, -0.010),
                new THREE.Vector3(-0.068, -0.055, 0.025),
                new THREE.Vector3( 0.000, -0.092, 0.055),
                new THREE.Vector3( 0.068, -0.055, 0.025),
                new THREE.Vector3( 0.082, 0.005, -0.010)
            ]);
            const strapGeo = new THREE.TubeGeometry(strapCurve, 14, 0.0038, 6, false);
            const strap = new THREE.Mesh(strapGeo, MATS.brownLeather);
            helmetGroup.add(strap);

            return helmetGroup;
        }

        // ============================================================================
        // 7. ANATOMICALLY REALISTIC ADULT MALE SOLDIER CHARACTER BUILDER
        // ============================================================================
        function buildSoldierRaw(faction) {
            const root = new THREE.Group();
            root.userData.faction = faction;

            const tunicMat = faction === 'us' ? MATS.usJacket : (faction === 'soviet' ? MATS.sovietTunic : MATS.germanTunic);
            const pantsMat = faction === 'us' ? MATS.usPants : (faction === 'soviet' ? MATS.sovietTunic : MATS.germanPants);
            const bootMat  = faction === 'us' ? MATS.brownLeather : MATS.blackLeather;
            const variantIdx = faction === 'us' ? 0 : (faction === 'soviet' ? 1 : 2);

            // --- 1. PELVIS / HIPS & DRAPED TUNIC SKIRT ---
            const hips = new THREE.Group();
            hips.position.y = 0.96; // Realistic 8-head adult male crotch/hip height
            root.add(hips);

            // Sculpted Pelvis & Tunic Skirt with realistic vertical fabric folds below the waist belt
            const skirtSlices = [
                { y: -0.11, rx: 0.195, rz: 0.138, foldAmp: 0.045, foldFreq: 8, foldPhase: variantIdx, squareness: 0.25 },
                { y: -0.04, rx: 0.182, rz: 0.128, foldAmp: 0.032, foldFreq: 8, foldPhase: variantIdx, squareness: 0.28 },
                { y:  0.04, rx: 0.165, rz: 0.116, foldAmp: 0.018, foldFreq: 8, foldPhase: variantIdx, squareness: 0.30 },
                { y:  0.11, rx: 0.156, rz: 0.110, foldAmp: 0.010, foldFreq: 6, foldPhase: 0, squareness: 0.32 }
            ];
            const skirtGeo = SculptEngine.createLoftedMesh(skirtSlices, 28, true, true);
            const tunicSkirt = new THREE.Mesh(skirtGeo, tunicMat);
            hips.add(tunicSkirt);

            // --- 2. SCULPTED MALE TORSO (CINCHED WAIST, PECTORAL CHEST, BROAD DELTOIDS) ---
            const torso = new THREE.Group();
            torso.position.y = 0.09;
            hips.add(torso);

            const torsoSlices = [
                // Cinched waist under heavy web/leather cartridge belt
                { y: 0.00, rx: 0.154, rz: 0.108, foldAmp: 0.018, foldFreq: 7, squareness: 0.32 },
                // Lower ribcage with bunched fabric blousing just above the belt
                { y: 0.08, rx: 0.172, rz: 0.124, foldAmp: 0.025, foldFreq: 9, frontBulge: 0.05, backBulge: 0.04, squareness: 0.35 },
                // Mid-chest / Latissimus V-taper
                { y: 0.20, rx: 0.188, rz: 0.132, foldAmp: 0.014, foldFreq: 6, frontBulge: 0.08, backBulge: 0.06, pecGroove: 0.06, squareness: 0.38 },
                // Broad pectoral & upper back shelf
                { y: 0.33, rx: 0.212, rz: 0.136, foldAmp: 0.010, foldFreq: 6, frontBulge: 0.09, backBulge: 0.07, pecGroove: 0.08, squareness: 0.42 },
                // Clavicle / Trapezius slope
                { y: 0.42, rx: 0.178, rz: 0.112, oz: -0.006, foldAmp: 0.008, foldFreq: 4, squareness: 0.30 },
                // Base of neck collar opening
                { y: 0.46, rx: 0.086, rz: 0.082, oz: -0.008, squareness: 0.10 }
            ];
            const chestGeo = SculptEngine.createLoftedMesh(torsoSlices, 28, true, false);
            const chestMesh = new THREE.Mesh(chestGeo, tunicMat);
            torso.add(chestMesh);

            // Center Tunic Placket, Buttons & Pleated Breast Pockets
            const placket = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.42, 0.012), tunicMat);
            placket.position.set(0, 0.22, 0.138);
            torso.add(placket);

            [-0.088, 0.088].forEach(px => {
                const pocketGroup = new THREE.Group();
                pocketGroup.position.set(px, 0.26, 0.136);
                pocketGroup.rotation.y = px * -0.18;

                const pocketBody = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.098, 0.018), tunicMat);
                pocketGroup.add(pocketBody);

                const pocketFlap = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.032, 0.022), tunicMat);
                pocketFlap.position.set(0, 0.036, 0.002);
                pocketGroup.add(pocketFlap);

                const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8),
                    faction === 'german' ? MATS.silverInsignia : MATS.brass);
                btn.rotation.x = Math.PI / 2;
                btn.position.set(0, 0.028, 0.012);
                pocketGroup.add(btn);

                torso.add(pocketGroup);
            });

            // Tailored Turn-Down Collar & Faction Insignia
            const collarMat = faction === 'german' ? MATS.darkCollar : (faction === 'soviet' ? MATS.redInsignia : tunicMat);
            const collarSlices = [
                { y: 0.43, rx: 0.092, rz: 0.088, oz: -0.008, squareness: 0.15 },
                { y: 0.48, rx: 0.078, rz: 0.076, oz: -0.006, squareness: 0.10 }
            ];
            const collarMesh = new THREE.Mesh(SculptEngine.createLoftedMesh(collarSlices, 20, false, false), collarMat);
            torso.add(collarMesh);

            // Shoulder Boards / Epaulettes (Soviet & German)
            if (faction !== 'us') {
                [-0.145, 0.145].forEach(sx => {
                    const epMat = faction === 'soviet' ? MATS.sovietTunic : MATS.darkCollar;
                    const board = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.014, 0.042), epMat);
                    board.position.set(sx, 0.425, -0.005);
                    board.rotation.z = sx * -0.95;
                    torso.add(board);
                });
            }

            if (faction === 'german') {
                // Wehrmacht Breast Eagle (Hoheitszeichen) above right pocket & Collar Litzen
                const eagleWing = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.012, 0.008), MATS.silverInsignia);
                eagleWing.position.set(-0.088, 0.34, 0.142);
                eagleWing.rotation.y = 0.18;
                torso.add(eagleWing);
            }

            // --- 3. WEB GEAR, BELT, CONTOURED SUSPENDERS & AMMO POUCHES ---
            const beltMat = faction === 'us' ? MATS.webGear : (faction === 'soviet' ? MATS.brownLeather : MATS.blackLeather);
            const beltSlices = [
                { y: -0.025, rx: 0.164, rz: 0.118, squareness: 0.32 },
                { y:  0.030, rx: 0.164, rz: 0.118, squareness: 0.32 }
            ];
            const belt = new THREE.Mesh(SculptEngine.createLoftedMesh(beltSlices, 24, true, true), beltMat);
            torso.add(belt);

            // Metallic Belt Buckle
            const buckle = new THREE.Mesh(
                new THREE.BoxGeometry(0.050, 0.048, 0.018),
                faction === 'german' ? MATS.silverInsignia : MATS.brass
            );
            buckle.position.set(0, 0.002, 0.122);
            torso.add(buckle);

            // Contoured 3D Load-Bearing Suspenders / Y-Straps Hugging the Chest & Back
            const strapMat = faction === 'german' ? MATS.blackLeather : MATS.webGear;
            [-1, 1].forEach(side => {
                const sx = side * 0.088;
                const strapCurve = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(sx, 0.02, 0.122),
                    new THREE.Vector3(sx * 1.12, 0.22, 0.145),
                    new THREE.Vector3(sx * 1.25, 0.425, 0.045),
                    new THREE.Vector3(sx * 1.18, 0.432, -0.055),
                    new THREE.Vector3(sx * 0.65, 0.22, -0.142),
                    new THREE.Vector3(faction === 'german' ? 0 : sx * 0.55, 0.02, -0.122)
                ]);
                const strapGeo = new THREE.TubeGeometry(strapCurve, 20, 0.014, 6, false);
                strapGeo.scale(1.3, 0.45, 1.0); // Flatten tube into a realistic flat webbing/leather strap
                const strapMesh = new THREE.Mesh(strapGeo, strapMat);
                torso.add(strapMesh);
            });

            // Detailed Cartridge / Ammo Pouches along waist belt
            const pouchMat = faction === 'us' ? MATS.webGear : (faction === 'soviet' ? MATS.brownLeather : MATS.blackLeather);
            const pouchAngles = [-0.62, -0.34, 0.34, 0.62];
            pouchAngles.forEach(ang => {
                const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.082, 0.044), pouchMat);
                pouch.position.set(Math.sin(ang) * 0.168, 0.004, Math.cos(ang) * 0.124);
                pouch.rotation.y = ang;
                torso.add(pouch);
            });

            // Hip Holster (M1911 / P38 / PPSh Drum Pouch) & Field Haversack / Brotbeutel
            const holster = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.165, 0.082),
                faction === 'german' ? MATS.blackLeather : MATS.brownLeather);
            holster.position.set(-0.178, -0.06, 0.025);
            holster.rotation.z = 0.08;
            torso.add(holster);

            const breadBag = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.165, 0.078), MATS.webGear);
            breadBag.position.set(0.162, -0.05, -0.075);
            breadBag.rotation.y = -0.55;
            torso.add(breadBag);

            if (faction === 'soviet') {
                // Soviet Veshmeshok canvas rucksack & rolled greatcoat on back
                const packGeo = new THREE.BoxGeometry(0.25, 0.31, 0.135, 4, 4, 4);
                const pPos = packGeo.attributes.position;
                for (let i = 0; i < pPos.count; i++) {
                    const y = pPos.getY(i);
                    pPos.setX(i, pPos.getX(i) * (0.92 - y * 0.4));
                }
                packGeo.computeVertexNormals();
                const pack = new THREE.Mesh(packGeo, MATS.webGear);
                pack.position.set(0, 0.23, -0.185);
                torso.add(pack);
            }

            // --- 4. SCULPTED STERNOCLEIDOMASTOID NECK, ANATOMICAL HEAD & EYES ---
            const neck = new THREE.Group();
            neck.position.set(0, 0.455, -0.008);
            torso.add(neck);

            const neckSlices = [
                { y: -0.01, rx: 0.066, rz: 0.068, squareness: 0.12 },
                { y:  0.04, rx: 0.056, rz: 0.059, oz: 0.004, squareness: 0.08 },
                { y:  0.08, rx: 0.058, rz: 0.062, oz: 0.008, squareness: 0.08 }
            ];
            const neckMesh = new THREE.Mesh(SculptEngine.createLoftedMesh(neckSlices, 18, false, false), MATS.skin);
            neck.add(neckMesh);

            const head = new THREE.Group();
            head.position.set(0, 0.065, 0.008);
            neck.add(head);

            // Anatomically Sculpted Male Head Mesh
            const headGeo = SculptEngine.createRealisticHeadGeometry(variantIdx);
            const headMesh = new THREE.Mesh(headGeo, MATS.skin);
            headMesh.position.y = 0.055;
            head.add(headMesh);

            // Realistic Recessed Eyes (Sclera + Dark Iris/Pupil) inside the sculpted orbital sockets
            const scleraMat = new THREE.MeshStandardMaterial({ color: 0xdcd6ce, roughness: 0.25 });
            const irisMat   = new THREE.MeshStandardMaterial({ color: 0x231d18, roughness: 0.15 });
            [-0.027, 0.027].forEach(ex => {
                const eyeGroup = new THREE.Group();
                eyeGroup.position.set(ex, 0.106, 0.072);

                const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 10, 10), scleraMat);
                eyeGroup.add(eyeball);

                const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 8), irisMat);
                iris.position.z = 0.0065;
                eyeGroup.add(iris);

                head.add(eyeGroup);
            });

            // Attach Authentic Faction Helmet
            const helmet = buildHelmet(faction);
            helmet.position.set(0, 0.125, -0.002);
            helmet.rotation.x = -0.04; // Slight natural combat tilt over brow
            head.add(helmet);

            // --- 5. SCULPTED MUSCULAR ARMS, CUFFED SLEEVES & MULTI-FINGERED HANDS ---
            function createArm(isRight) {
                const side = isRight ? -1 : 1; // Right arm is on -X, Left arm is on +X
                const shoulder = new THREE.Group();
                shoulder.position.set(side * 0.215, 0.375, -0.005);
                torso.add(shoulder);

                // Sculpted Upper Arm (Deltoid cap tapering into Bicep/Triceps with sleeve creases)
                const upperSlices = [
                    { y: -0.27, rx: 0.052, rz: 0.056, foldAmp: 0.035, foldFreq: 5, foldPhase: side },
                    { y: -0.20, rx: 0.058, rz: 0.062, foldAmp: 0.025, foldFreq: 6, frontBulge: 0.08 },
                    { y: -0.10, rx: 0.066, rz: 0.068, foldAmp: 0.015, foldFreq: 5, frontBulge: 0.06 },
                    { y: -0.01, rx: 0.074, rz: 0.072, foldAmp: 0.010, foldFreq: 4 },
                    { y:  0.045, rx: 0.052, rz: 0.052, ox: -side * 0.018 }
                ];
                const upperArm = new THREE.Mesh(SculptEngine.createLoftedMesh(upperSlices, 18, true, true), tunicMat);
                shoulder.add(upperArm);

                if (faction === 'us' && isRight) {
                    // U.S. Assault Flag brassard on right upper sleeve + Sergeant chevrons
                    const flagPatch = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.032, 0.048), MATS.redInsignia);
                    flagPatch.position.set(-0.068, -0.095, 0.005);
                    shoulder.add(flagPatch);
                }

                const elbow = new THREE.Group();
                elbow.position.y = -0.265;
                shoulder.add(elbow);

                // Sculpted Forearm (Brachioradialis muscle swell tapering down to buttoned cuff)
                const foreSlices = [
                    { y: -0.24, rx: 0.038, rz: 0.044, foldAmp: 0.020, foldFreq: 6 },
                    { y: -0.18, rx: 0.046, rz: 0.050, foldAmp: 0.028, foldFreq: 7 },
                    { y: -0.08, rx: 0.054, rz: 0.056, foldAmp: 0.022, foldFreq: 6 },
                    { y:  0.01, rx: 0.050, rz: 0.054, foldAmp: 0.030, foldFreq: 5 }
                ];
                const foreArm = new THREE.Mesh(SculptEngine.createLoftedMesh(foreSlices, 18, true, true), tunicMat);
                elbow.add(foreArm);

                const wrist = new THREE.Group();
                wrist.position.y = -0.24;
                elbow.add(wrist);

                const hand = SculptEngine.createArticulatedHand(isRight, MATS.skin);
                wrist.add(hand);

                return { shoulder, elbow, wrist, hand };
            }

            const rightArm = createArm(true);
            const leftArm  = createArm(false);

            // Attach Faction Service Rifle to Right Wrist (Aligned for natural 2-handed diagonal grip across chest)
            const rifleType = faction === 'us' ? 'garand' : (faction === 'soviet' ? 'mosin' : 'kar98k');
            const rifle = buildRifle(rifleType);
            rifle.position.set(0.05, -0.04, 0.06);
            rifle.rotation.set(-0.88, -0.46, -0.42);
            rightArm.wrist.add(rifle);

            // --- 6. SCULPTED TROUSERS, BREECHES BLOUSING & COMBAT BOOTS ---
            function createLeg(isRight) {
                const side = isRight ? -1 : 1;
                const hipJoint = new THREE.Group();
                hipJoint.position.set(side * 0.105, -0.04, 0);
                hips.add(hipJoint);

                // Sculpted Thigh with Soviet Sharovary flare or US/German field trousers & knee creases
                const flare = faction === 'soviet' ? 1.22 : 1.04;
                const thighSlices = [
                    { y: -0.41, rx: 0.072, rz: 0.076, foldAmp: 0.035, foldFreq: 6, frontBulge: 0.08 },
                    { y: -0.28, rx: 0.088 * flare, rz: 0.088, foldAmp: 0.032, foldFreq: 7, frontBulge: 0.06 },
                    { y: -0.14, rx: 0.098 * flare, rz: 0.098, foldAmp: 0.025, foldFreq: 6, backBulge: 0.08 },
                    { y:  0.02, rx: 0.102, rz: 0.104, foldAmp: 0.015, foldFreq: 5, backBulge: 0.10 }
                ];
                const thigh = new THREE.Mesh(SculptEngine.createLoftedMesh(thighSlices, 20, true, true), pantsMat);
                hipJoint.add(thigh);

                const kneeJoint = new THREE.Group();
                kneeJoint.position.y = -0.40;
                hipJoint.add(kneeJoint);

                // Upper Calf with dramatic fabric blousing overhanging the top of the boot/gaiter
                const calfUpperSlices = [
                    { y: -0.17, rx: 0.064, rz: 0.066, foldAmp: 0.018, foldFreq: 6 },
                    { y: -0.14, rx: 0.082 * flare, rz: 0.082, foldAmp: 0.045, foldFreq: 8 }, // Bloused fabric overhang
                    { y: -0.07, rx: 0.078, rz: 0.080, foldAmp: 0.025, foldFreq: 6, backBulge: 0.12 },
                    { y:  0.01, rx: 0.072, rz: 0.075, foldAmp: 0.020, foldFreq: 5, frontBulge: 0.06 }
                ];
                const calfUpper = new THREE.Mesh(SculptEngine.createLoftedMesh(calfUpperSlices, 20, true, true), pantsMat);
                kneeJoint.add(calfUpper);

                // Lower Calf: U.S. M1938 Canvas Gaiters or Tall Black Leather Jackboots with ankle wrinkles
                const lowerCalfMat = faction === 'us' ? MATS.webGear : MATS.blackLeather;
                const bootShaftSlices = [
                    { y: -0.43, rx: 0.052, rz: 0.060, oz: 0.004, foldAmp: 0.032, foldFreq: 6 },
                    { y: -0.35, rx: 0.050, rz: 0.056, foldAmp: 0.038, foldFreq: 7 }, // Ankle leather creases
                    { y: -0.24, rx: 0.062, rz: 0.066, foldAmp: 0.015, foldFreq: 5, backBulge: 0.10 },
                    { y: -0.14, rx: 0.065, rz: 0.068, foldAmp: 0.010, foldFreq: 5 }
                ];
                const bootShaft = new THREE.Mesh(SculptEngine.createLoftedMesh(bootShaftSlices, 20, true, true), lowerCalfMat);
                kneeJoint.add(bootShaft);

                // Sculpted Boot Foot, Heel & Toe Box
                const ankle = new THREE.Group();
                ankle.position.y = -0.43;
                kneeJoint.add(ankle);

                const foot = new THREE.Mesh(SculptEngine.createSculptedBootGeometry(), bootMat);
                ankle.add(foot);

                return { hipJoint, kneeJoint, ankle };
            }

            const rightLeg = createLeg(true);
            const leftLeg  = createLeg(false);

            const rig = {
                faction,
                root,
                hips,
                torso,
                neck,
                head,
                rightArm,
                leftArm,
                rightLeg,
                leftLeg,
                rifle,
                rifleType
            };

            return rig;
        }


        // ========================================================================
        // PERFORMANCE LAYER: bake static sub-meshes per bone, cache one template per
        // faction, and clone (shared geometry + materials) for every spawned soldier.
        // ========================================================================
        function mergeGeometries(geos) {
            const merged = new THREE.BufferGeometry();
            let vCount = 0, iCount = 0;
            geos.forEach(g => { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; });
            const pos = new Float32Array(vCount * 3);
            const nor = new Float32Array(vCount * 3);
            const uv = new Float32Array(vCount * 2);
            const idx = new Uint32Array(iCount);
            let vo = 0, io = 0;
            geos.forEach(g => {
                if (!g.attributes.normal) g.computeVertexNormals();
                const n = g.attributes.position.count;
                pos.set(g.attributes.position.array, vo * 3);
                nor.set(g.attributes.normal.array, vo * 3);
                if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
                if (g.index) {
                    for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo;
                } else {
                    for (let i = 0; i < n; i++) idx[io++] = vo + i;
                }
                vo += n;
            });
            merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
            merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
            merged.setIndex(new THREE.BufferAttribute(vCount > 65535 ? idx : new Uint16Array(idx), 1));
            merged.computeBoundingSphere();
            merged.computeBoundingBox();
            return merged;
        }

        function bakeBone(bone, boneSet) {
            const buckets = new Map();
            const walk = (obj, parentMat) => {
                obj.children.forEach(c => {
                    if (boneSet.has(c)) return;
                    c.updateMatrix();
                    const m = parentMat.clone().multiply(c.matrix);
                    if (c.isMesh) {
                        const g = c.geometry.clone();
                        g.applyMatrix4(m);
                        let b = buckets.get(c.material);
                        if (!b) { b = []; buckets.set(c.material, b); }
                        b.push(g);
                    }
                    walk(c, m);
                });
            };
            walk(bone, new THREE.Matrix4());

            bone.children.filter(c => !boneSet.has(c)).forEach(c => bone.remove(c));
            buckets.forEach((geos, mat) => {
                const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
                mesh.matrixAutoUpdate = false;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                bone.add(mesh);
                geos.forEach(g => g.dispose());
            });
        }

        function buildTemplate(faction) {
            const rig = buildSoldierRaw(faction);
            const named = {
                hips: rig.hips, torso: rig.torso, neck: rig.neck, head: rig.head,
                rShoulder: rig.rightArm.shoulder, rElbow: rig.rightArm.elbow, rWrist: rig.rightArm.wrist,
                lShoulder: rig.leftArm.shoulder,  lElbow: rig.leftArm.elbow,  lWrist: rig.leftArm.wrist,
                rHip: rig.rightLeg.hipJoint, rKnee: rig.rightLeg.kneeJoint, rAnkle: rig.rightLeg.ankle,
                lHip: rig.leftLeg.hipJoint,  lKnee: rig.leftLeg.kneeJoint,  lAnkle: rig.leftLeg.ankle,
                rifle: rig.rifle
            };
            const boneSet = new Set(Object.values(named));
            Object.keys(named).forEach(k => { named[k].name = k; });
            boneSet.forEach(b => bakeBone(b, boneSet));
            return { root: rig.root, rifleType: rig.rifleType, muzzle: rig.rifle.userData.muzzleOffset.clone() };
        }

        function buildSoldier(faction) {
            initMaterials();
            if (!SOLDIER_TEMPLATES[faction]) SOLDIER_TEMPLATES[faction] = buildTemplate(faction);
            const tpl = SOLDIER_TEMPLATES[faction];
            const root = tpl.root.clone(true);
            root.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;
                }
            });
            const g = (n) => root.getObjectByName(n);
            const rifle = g('rifle');
            rifle.userData.muzzleOffset = tpl.muzzle.clone();
            return {
                faction,
                root,
                hips: g('hips'),
                torso: g('torso'),
                neck: g('neck'),
                head: g('head'),
                rightArm: { shoulder: g('rShoulder'), elbow: g('rElbow'), wrist: g('rWrist'), hand: g('rWrist') },
                leftArm:  { shoulder: g('lShoulder'), elbow: g('lElbow'), wrist: g('lWrist'), hand: g('lWrist') },
                rightLeg: { hipJoint: g('rHip'), kneeJoint: g('rKnee'), ankle: g('rAnkle') },
                leftLeg:  { hipJoint: g('lHip'), kneeJoint: g('lKnee'), ankle: g('lAnkle') },
                rifle,
                rifleType: tpl.rifleType
            };
        }
    // ------------------------------------------------------------------------
    // 5b. SIMPLE RED TARGET CURSOR SYSTEM
    // ------------------------------------------------------------------------
    // Geometry and materials depend only on size, so they are built once per size and shared by every cursor.
    const redTargetCursorAssets = {};
    function getRedTargetCursorAssets(radius, height) {
        const key = `${radius}|${height}`;
        if (redTargetCursorAssets[key]) return redTargetCursorAssets[key];

        // Downward pointing 3D diamond/pyramid
        const coneGeo = new THREE.ConeGeometry(radius, height, 4);
        coneGeo.rotateX(Math.PI); // Invert so apex points down directly onto target
        coneGeo.rotateY(Math.PI / 4);

        const capGeo = new THREE.ConeGeometry(radius, height * 0.45, 4);
        capGeo.rotateY(Math.PI / 4);

        const ringGeo = new THREE.RingGeometry(radius * 0.35, radius * 0.65, 8);
        ringGeo.rotateX(Math.PI / 2);

        const mat = new THREE.MeshBasicMaterial({
            color: 0xff1e1e,
            wireframe: false,
            side: THREE.DoubleSide,
            depthTest: false
        });
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.90,
            depthTest: false
        });
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff2222,
            side: THREE.DoubleSide,
            depthTest: false
        });

        [coneGeo, capGeo, ringGeo, mat, wireMat, ringMat].forEach((res) => { res.userData.shared = true; });

        redTargetCursorAssets[key] = { coneGeo, capGeo, ringGeo, mat, wireMat, ringMat };
        return redTargetCursorAssets[key];
    }

    function createRedTargetCursor(radius = 0.45, height = 0.72) {
        const cursorGroup = new THREE.Group();
        cursorGroup.renderOrder = 9999;
        const a = getRedTargetCursorAssets(radius, height);

        // Downward pointing 3D diamond/pyramid
        cursorGroup.add(new THREE.Mesh(a.coneGeo, a.mat));

        // Upper diamond cap
        const cap = new THREE.Mesh(a.capGeo, a.mat);
        cap.position.y = height * 0.225;
        cursorGroup.add(cap);

        // Rim wireframe
        const wire = new THREE.Mesh(a.coneGeo, a.wireMat);
        wire.scale.set(1.05, 1.05, 1.05);
        cursorGroup.add(wire);

        // Downward target ring indicator
        const ring = new THREE.Mesh(a.ringGeo, a.ringMat);
        ring.position.y = -height * 0.20;
        cursorGroup.add(ring);

        cursorGroup.userData.baseY = 0;
        cursorGroup.userData.spinSpeed = 2.4;
        return cursorGroup;
    }
    window.createRedTargetCursor = createRedTargetCursor;

    // ------------------------------------------------------------------------
    // 6. SOLDIER AI, WANDERING & COMBAT SIMULATION
    // ------------------------------------------------------------------------
    const activeSoldiers = [];
    window.activeSoldiers = activeSoldiers;

    class SoldierAI {
        constructor(id, faction, x, z, options = {}) {
            this.id = id;
            this.faction = faction; // 'german', 'us', 'soviet'
            this.isEnemy = !!options.isEnemy;
            this.x = x;
            this.z = z;
            this.y = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(x, z) : 0;
            this.heading = options.heading || Math.random() * Math.PI * 2;
            this.health = 100;
            this.isDead = false;
            this.deathTime = 0;
            this.escortTank = options.escortTank || null;

            this.homeX = x;
            this.homeZ = z;
            this.patrolRadius = options.patrolRadius || 28;

            this.state = 'idle'; // 'idle', 'wander', 'aim', 'fire', 'flinch', 'fallen'
            this.stateTimer = 1.0 + Math.random() * 2.0;
            this.wanderTarget = { x, z };
            this.speed = 0;
            this.targetSpeed = 0;

            this.currentTarget = null;
            this.fireCooldown = 1.2 + Math.random() * 1.5;
            this.phaseOffset = Math.random() * Math.PI * 2;
            this.aimWeight = 0; // 0 = patrol/wander, 1 = ADS shouldered firing stance
            this.animTime = Math.random() * 10;
            this.recoilKick = 0;

            this.rig = buildSoldier(this.faction);
            this.rig.root.position.set(this.x, this.y, this.z);
            this.rig.root.rotation.y = this.heading;
            this.rig.root.userData.soldier = this;

            // Simple Red Cursor above target top for enemy combatants
            this.targetCursor = null;
            if (this.isEnemy) {
                this.targetCursor = createRedTargetCursor(0.48, 0.75);
                this.targetCursor.position.set(0, 2.45, 0);
                this.targetCursor.userData.baseY = 2.45;
                this.rig.root.add(this.targetCursor);
            }

            const targetScene = window.scene || null;
            if (targetScene) targetScene.add(this.rig.root);
        }

        update(dt, playerX, playerZ, nowSec) {
            if (this.isDead) {
                if (typeof window.updateSoldierDeathAnimation === 'function') {
                    window.updateSoldierDeathAnimation(this, dt);
                }
                return;
            }

            this.animTime += dt;
            this.fireCooldown = Math.max(0, this.fireCooldown - dt);
            this.recoilKick = Math.max(0, this.recoilKick - dt * 5.0);

            // Animate red target cursor (slow spin & gentle bob)
            if (this.targetCursor) {
                this.targetCursor.rotation.y += dt * 2.2;
                this.targetCursor.position.y = this.targetCursor.userData.baseY + Math.sin(nowSec * 3.5) * 0.06;
            }

            // Tank hull crush check (vehicle running over infantry)
            if (!this.isDead && window.tankState) {
                const crushDist = Math.hypot(window.tankState.x - this.x, window.tankState.z - this.z);
                if (crushDist < 2.3 && Math.abs(window.tankState.speed || 0) > 0.8) {
                    this.die();
                    return;
                }
            }

            const distToPlayer = Math.hypot(playerX - this.x, playerZ - this.z);

            // 1. Target Evaluation (Opposing infantry or opposing tank)
            this.evaluateCombatTarget(playerX, playerZ, distToPlayer);

            // 2. State Logic
            if (this.currentTarget) {
                // Combat / Aim / Fire state
                this.handleCombat(dt, distToPlayer);
            } else {
                // Non-combat wandering & patrolling
                this.handleWander(dt);
            }

            // 3. Movement integration
            if (Math.abs(this.speed) > 0.05) {
                this.x += Math.sin(this.heading) * this.speed * dt;
                this.z += Math.cos(this.heading) * this.speed * dt;
                if (typeof window.getTerrainHeight === 'function') {
                    const gh = window.getTerrainHeight(this.x, this.z);
                    // Avoid walking underwater into deep sea
                    if (gh < -2.2) {
                        this.heading += Math.PI * 0.75;
                        this.wanderTarget.x = this.homeX;
                        this.wanderTarget.z = this.homeZ;
                    } else {
                        this.y = THREE.MathUtils.lerp(this.y, gh, dt * 10);
                    }
                }
            }

            this.rig.root.position.set(this.x, this.y, this.z);
            this.rig.root.rotation.y = this.heading;

            // 4. Procedural Joint Animation (Cull detailed bones if far away on mobile and not engaging)
            const isFar = distToPlayer > 135 && !this.currentTarget;
            this.animateJoints(isFar, dt);
        }

        evaluateCombatTarget(playerX, playerZ, distToPlayer) {
            this.currentTarget = null;

            // In infantry mode, player is on foot as a soldier!
            if (window.playerMode === 'soldier' && window.playerSoldier && !window.playerSoldier.isDead) {
                const ps = window.playerSoldier;
                const dSoldier = Math.hypot(ps.x - this.x, ps.z - this.z);
                const nowSec = performance.now() * 0.001;
                const playerFiredRecently = (nowSec - (ps.lastFireTime || 0) < 3.0) || (nowSec - (ps.lastGrenadeTime || 0) < 3.0);
                // In infantry mode player is hard to detect, only in close range
                const detectDist = playerFiredRecently ? 45 : 22;

                if (this.isEnemy && dSoldier < detectDist) {
                    this.currentTarget = {
                        type: 'soldier',
                        ref: ps,
                        x: ps.x,
                        y: ps.y + 1.2,
                        z: ps.z,
                        dist: dSoldier
                    };
                    return;
                }
            } else {
                // A. Check Player Tank
                if (this.isEnemy && !window.tankState.isKnockedOut && distToPlayer < 135) {
                    this.currentTarget = {
                        type: 'tank',
                        x: playerX,
                        y: (window.tankState.y || 0) + 1.2,
                        z: playerZ,
                        dist: distToPlayer
                    };
                    return;
                }
            }

            // B. Check Allied Tank (if soldier is allied to player, check enemy tanks)
            if (!this.isEnemy && window.combatTanks) {
                for (let i = 0; i < window.combatTanks.length; i++) {
                    const et = window.combatTanks[i];
                    if (!et.isDestroyed) {
                        const d = Math.hypot(et.x - this.x, et.z - this.z);
                        if (d < 135) {
                            this.currentTarget = {
                                type: 'tank',
                                x: et.x,
                                y: et.y + 1.2,
                                z: et.z,
                                dist: d
                            };
                            return;
                        }
                    }
                }
            }

            // C. Check Opposing Infantry
            let closestEnemySoldier = null;
            let closestDist = 120; // Max infantry engagement range

            for (let i = 0; i < activeSoldiers.length; i++) {
                const other = activeSoldiers[i];
                if (other === this || other.isDead) continue;
                if (other.isEnemy !== this.isEnemy) {
                    const d = Math.hypot(other.x - this.x, other.z - this.z);
                    if (d < closestDist) {
                        closestDist = d;
                        closestEnemySoldier = other;
                    }
                }
            }

            if (closestEnemySoldier) {
                this.currentTarget = {
                    type: 'soldier',
                    ref: closestEnemySoldier,
                    x: closestEnemySoldier.x,
                    y: closestEnemySoldier.y + 1.3,
                    z: closestEnemySoldier.z,
                    dist: closestDist
                };
            }
        }

        handleCombat(dt, distToPlayer) {
            const tgt = this.currentTarget;
            const dx = tgt.x - this.x;
            const dz = tgt.z - this.z;
            const targetDist = Math.hypot(dx, dz);
            const targetHeading = Math.atan2(dx, dz);

            // 1. Dynamic Combat Run-and-Gun Tactics
            this.combatManeuverTimer = (this.combatManeuverTimer || 0) - dt;
            if (this.combatManeuverTimer <= 0) {
                this.combatManeuverTimer = 2.0 + Math.random() * 2.5;
                const roll = Math.random();
                if (targetDist > 55) {
                    this.combatManeuver = 'ADVANCE';
                    this.combatTargetSpeed = 3.4 + Math.random() * 0.8; // Combat sprint
                } else if (targetDist < 22 && tgt.type === 'tank') {
                    // Evade charging tank to avoid being crushed
                    this.combatManeuver = (roll < 0.5) ? 'FLANK_LEFT' : 'FLANK_RIGHT';
                    this.combatTargetSpeed = 3.2 + Math.random() * 0.6;
                } else {
                    if (roll < 0.40) {
                        this.combatManeuver = 'FLANK_LEFT';
                        this.combatTargetSpeed = 2.8 + Math.random() * 0.6;
                    } else if (roll < 0.80) {
                        this.combatManeuver = 'FLANK_RIGHT';
                        this.combatTargetSpeed = 2.8 + Math.random() * 0.6;
                    } else {
                        this.combatManeuver = 'ADVANCE';
                        this.combatTargetSpeed = 2.7 + Math.random() * 0.6;
                    }
                }
            }

            let desiredMoveHeading = targetHeading;
            if (this.combatManeuver === 'FLANK_LEFT') {
                desiredMoveHeading = targetHeading - Math.PI * 0.48;
            } else if (this.combatManeuver === 'FLANK_RIGHT') {
                desiredMoveHeading = targetHeading + Math.PI * 0.48;
            } else if (this.combatManeuver === 'ADVANCE') {
                desiredMoveHeading = targetHeading;
            }

            // Heading smoothly turns towards travel heading so soldier runs dynamically,
            // while upper torso and arms track the target precisely
            let angleDiff = desiredMoveHeading - this.heading;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
            this.heading += THREE.MathUtils.clamp(angleDiff, -5.5 * dt, 5.5 * dt);
            this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));

            // Run at combat speed while keeping aim active
            this.speed = THREE.MathUtils.lerp(this.speed, this.combatTargetSpeed || 2.8, dt * 3.5);
            this.aimWeight = THREE.MathUtils.lerp(this.aimWeight, 1.0, dt * 6.0);

            // Fire on the run whenever gun cooldown expires!
            if (this.fireCooldown <= 0) {
                this.shoot(tgt, distToPlayer);
            }
        }

        shoot(target, distToPlayer) {
            // Bolt-action / semi-auto cadence
            this.fireCooldown = 1.6 + Math.random() * 1.2;
            this.recoilKick = 0.25;

            // Audio: distance-attenuated gunshot
            if (window.soundFX && typeof window.soundFX.playRifleShot === 'function') {
                window.soundFX.playRifleShot(distToPlayer);
            }

            // World position of rifle muzzle and physical barrel forward direction
            const muzzleWorldPos = new THREE.Vector3();
            const shootDir = new THREE.Vector3();
            if (this.rig.rifle) {
                this.rig.rifle.updateWorldMatrix(true, false);
                this.rig.rifle.localToWorld(muzzleWorldPos.copy(this.rig.rifle.userData.muzzleOffset || new THREE.Vector3(0, 0.02, 0.6)));
                const rQuat = new THREE.Quaternion();
                this.rig.rifle.getWorldQuaternion(rQuat);
                shootDir.set(0, 0, 1).applyQuaternion(rQuat).normalize();
            } else {
                muzzleWorldPos.set(this.x, this.y + 1.2, this.z);
                shootDir.set(target.x - muzzleWorldPos.x, target.y - muzzleWorldPos.y, target.z - muzzleWorldPos.z).normalize();
            }

            if (this.isEnemy) {
                const right = new THREE.Vector3(shootDir.z, 0, -shootDir.x);
                if (right.lengthSq() < 0.000001) right.set(1, 0, 0);
                right.normalize();
                const up = new THREE.Vector3().crossVectors(shootDir, right).normalize();
                shootDir.addScaledVector(right, (Math.random() - 0.5) * 0.07);
                shootDir.addScaledVector(up, (Math.random() - 0.5) * 0.04);
                shootDir.normalize();
            }

            // 1. Muzzle Flash & Smoke
            if (typeof window.spawnParticle === 'function') {
                const flashVel = shootDir.clone().multiplyScalar(4.0);
                window.spawnParticle(muzzleWorldPos, flashVel, 0xffe066, 0.12, 0.28, 0.05, true, 'fire');
                const smokeVel = new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
                window.spawnParticle(muzzleWorldPos, smokeVel, 0xcccccc, 0.10, 0.35, 0.45, false, 'smoke');
            }

            // 2. High-speed Tracer Round
            if (typeof window.spawnTracerRound === 'function') {
                const tracerQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), shootDir);
                window.spawnTracerRound(muzzleWorldPos, shootDir, tracerQuat, this.isEnemy, { damage: 35 });
            }
        }

        takeDamage(amount) {
            this.health -= amount;
            // Flinch effect
            this.speed = -0.6;
            this.recoilKick = 0.4;
            if (typeof window.spawnParticle === 'function') {
                const puffPos = new THREE.Vector3(this.x, this.y + 1.2, this.z);
                const puffVel = new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.0 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5);
                window.spawnParticle(puffPos, puffVel, 0x882222, 0.12, 0.35, 0.45, false, 'smoke');
            }
            if (this.health <= 0) {
                this.die();
            }
        }

        die() {
            this.isDead = true;
            this.deathTime = (window.performance && window.performance.now) ? window.performance.now() * 0.001 : Date.now() * 0.001;
            this.speed = 0;
            this.currentTarget = null;
            if (this.targetCursor) this.targetCursor.visible = false;

            if (typeof window.startSoldierDeathAnimation === 'function') {
                window.startSoldierDeathAnimation(this);
            }

            // Dust and blood puff on collapse
            if (typeof window.spawnParticle === 'function') {
                const groundPos = new THREE.Vector3(this.x, this.y + 0.1, this.z);
                for (let i = 0; i < 6; i++) {
                    const dVel = new THREE.Vector3((Math.random() - 0.5) * 2.5, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 2.5);
                    window.spawnParticle(groundPos, dVel, 0x5a4d41, 0.20, 0.75, 0.85, false, 'dirt');
                }
                const bPos = new THREE.Vector3(this.x, this.y + 0.35, this.z);
                window.spawnParticle(bPos, new THREE.Vector3(0, 0.5, 0), 0x7f1d1d, 0.18, 0.35, 0.8, false, 'smoke');
            }
        }

        handleWander(dt) {
            // Clustered with escort tank
            if (this.escortTank && !this.escortTank.isDestroyed) {
                this.homeX = this.escortTank.x;
                this.homeZ = this.escortTank.z;
            }

            this.aimWeight = THREE.MathUtils.lerp(this.aimWeight, 0, dt * 3.0);
            this.stateTimer -= dt;

            if (this.stateTimer <= 0) {
                if (this.state === 'idle') {
                    // Switch to wander: choose point within patrol radius
                    this.state = 'wander';
                    this.stateTimer = 4.0 + Math.random() * 5.0;
                    const ang = Math.random() * Math.PI * 2;
                    const rad = Math.random() * this.patrolRadius;
                    this.wanderTarget.x = this.homeX + Math.cos(ang) * rad;
                    this.wanderTarget.z = this.homeZ + Math.sin(ang) * rad;
                    this.targetSpeed = 1.35 + Math.random() * 0.45; // ~1.5 m/s infantry march
                } else {
                    // Switch to idle survey
                    this.state = 'idle';
                    this.stateTimer = 2.5 + Math.random() * 3.5;
                    this.targetSpeed = 0;
                }
            }

            if (this.state === 'wander') {
                const dx = this.wanderTarget.x - this.x;
                const dz = this.wanderTarget.z - this.z;
                const distToTarget = Math.hypot(dx, dz);

                if (distToTarget < 1.5) {
                    this.state = 'idle';
                    this.stateTimer = 2.0 + Math.random() * 2.5;
                    this.targetSpeed = 0;
                } else {
                    const desiredHeading = Math.atan2(dx, dz);
                    let angleDiff = desiredHeading - this.heading;
                    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
                    this.heading += THREE.MathUtils.clamp(angleDiff, -2.4 * dt, 2.4 * dt);
                }
            }

            this.speed = THREE.MathUtils.lerp(this.speed, this.targetSpeed, dt * 2.5);
        }

        animateJoints(isFar, dt) {
            const rig = this.rig;
            const w = this.aimWeight;
            const walk = this.animTime * 3.8 + this.phaseOffset;
            const isMoving = Math.abs(this.speed) > 0.15;

            // 1. Leg Walk/Run Cycle
            if (isMoving) {
                const runMult = (Math.abs(this.speed) > 2.2) ? 5.5 : 3.8;
                const walk = this.animTime * runMult + this.phaseOffset;
                const strideIntensity = Math.min(0.65, Math.abs(this.speed) * 0.16 + 0.32);
                const stride = Math.sin(walk);
                const rHipX = stride * strideIntensity;
                const lHipX = -stride * strideIntensity;
                const rKneeX = Math.max(0.08, -Math.cos(walk) * (strideIntensity * 1.2));
                const lKneeX = Math.max(0.08, Math.cos(walk) * (strideIntensity * 1.2));

                rig.rightLeg.hipJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.hipJoint.rotation.x, rHipX, 0.35);
                rig.leftLeg.hipJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.hipJoint.rotation.x, lHipX, 0.35);
                rig.rightLeg.kneeJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.kneeJoint.rotation.x, rKneeX, 0.35);
                rig.leftLeg.kneeJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.kneeJoint.rotation.x, lKneeX, 0.35);
                rig.hips.position.y = 0.95 + Math.abs(Math.cos(walk)) * 0.035;
            } else {
                rig.rightLeg.hipJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.hipJoint.rotation.x, -0.05, 0.15);
                rig.leftLeg.hipJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.hipJoint.rotation.x, 0.06, 0.15);
                rig.rightLeg.kneeJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.kneeJoint.rotation.x, 0.08, 0.15);
                rig.leftLeg.kneeJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.kneeJoint.rotation.x, 0.08, 0.15);
                rig.hips.position.y = 0.95;
            }

            if (isFar) return; // Skip upper-body micro-rotations at distant ranges on mobile

            // 2. Torso, Head & Arms (Interpolate between Patrol/Wander posture and Aim/ADS posture)
            const breath = Math.sin(this.animTime * 1.5 + this.phaseOffset) * 0.015;

            // Patrol / Low-Ready pose
            const patrolTorsoY = -0.25 + (isMoving ? Math.sin(walk) * 0.08 : 0);
            const patrolHeadY  = 0.20 + Math.sin(this.animTime * 0.8) * 0.10;
            const patrolRShX   = -0.25 + breath - this.recoilKick * 0.4;
            const patrolLShX   = -0.70 + breath;
            const patrolRifleRotX = 0.90 - this.recoilKick * 0.5;

            // Shouldered Aim Down Sights (ADS) pose
            const aimTorsoY = -0.45;
            const aimHeadY  = 0.40;
            const aimRShX   = -0.95 - this.recoilKick * 0.6;
            const aimLShX   = -1.15;
            const aimRifleRotX = 1.48 - this.recoilKick * 0.5;

            // Pitch upper torso towards target elevation
            if (this.currentTarget) {
                const dy = this.currentTarget.y - (this.y + 1.25);
                const dx = this.currentTarget.x - this.x;
                const dz = this.currentTarget.z - this.z;
                const pitch = Math.atan2(dy, Math.max(1, Math.hypot(dx, dz)));
                rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, -pitch, w);
            } else {
                rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, 0, dt * 4.0);
            }

            // Natural shouldered firing stance
            const adsTorsoY = -0.15;
            const adsHeadY  = 0.15;

            rig.torso.rotation.y = THREE.MathUtils.lerp(patrolTorsoY, adsTorsoY, w);
            rig.head.rotation.y  = THREE.MathUtils.lerp(patrolHeadY, adsHeadY, w);

            // Right arm grips receiver at chest level
            rig.rightArm.shoulder.rotation.x = THREE.MathUtils.lerp(patrolRShX, -0.95, w);
            rig.rightArm.shoulder.rotation.z = THREE.MathUtils.lerp(-0.20, -0.28, w);
            rig.rightArm.elbow.rotation.x    = THREE.MathUtils.lerp(-1.22, -1.35, w);

            // Left arm reaches forward to support the wooden forend under the barrel
            rig.leftArm.shoulder.rotation.x  = THREE.MathUtils.lerp(patrolLShX, -0.85, w);
            rig.leftArm.shoulder.rotation.y  = THREE.MathUtils.lerp(-0.55, 0.32, w);
            rig.leftArm.shoulder.rotation.z  = THREE.MathUtils.lerp(0.0, 0.28, w);
            rig.leftArm.elbow.rotation.x     = THREE.MathUtils.lerp(-0.82, -1.15, w);

            // Hold gun pointing directly at target in ADS firing stance
            if (w > 0.05 && this.currentTarget) {
                const targetPos = new THREE.Vector3(this.currentTarget.x, this.currentTarget.y, this.currentTarget.z);
                rig.rightArm.wrist.updateMatrixWorld(true);
                const wristWorldPos = new THREE.Vector3();
                rig.rightArm.wrist.getWorldPosition(wristWorldPos);

                // Build lookAt matrix from wrist to target so +Z points directly at target and +Y stays upright
                const m = new THREE.Matrix4();
                const oppTarget = wristWorldPos.clone().add(wristWorldPos.clone().sub(targetPos));
                m.lookAt(wristWorldPos, oppTarget, new THREE.Vector3(0, 1, 0));
                const targetWorldQuat = new THREE.Quaternion().setFromRotationMatrix(m);

                const wristWorldQuat = new THREE.Quaternion();
                rig.rightArm.wrist.getWorldQuaternion(wristWorldQuat);
                const wristInv = wristWorldQuat.clone().invert();
                const adsQuat = wristInv.multiply(targetWorldQuat);

                const patrolQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(patrolRifleRotX, -0.40, 0.50));
                rig.rifle.quaternion.slerpQuaternions(patrolQuat, adsQuat, w);
            } else {
                rig.rifle.rotation.set(
                    THREE.MathUtils.lerp(patrolRifleRotX, 1.48, w),
                    THREE.MathUtils.lerp(-0.40, -0.20, w),
                    THREE.MathUtils.lerp(0.50, 0.28, w)
                );
            }
        }

        dispose() {
            if (this.rig && this.rig.root) {
                const targetScene = window.scene || null;
                if (targetScene) targetScene.remove(this.rig.root);
            }
        }
    }

    // ------------------------------------------------------------------------
    // 7. BATTLEFIELD SPAWNER & CAMPAIGN COORDINATOR
    // ------------------------------------------------------------------------
    function getFactionsForPlayerTank(playerTankId) {
        if (playerTankId === 'tiger') {
            return { allied: 'german', enemy: 'us' };
        } else if (playerTankId === 'sherman') {
            return { allied: 'us', enemy: 'german' };
        } else {
            return { allied: 'soviet', enemy: 'german' };
        }
    }

    function clearSoldiers() {
        for (let i = activeSoldiers.length - 1; i >= 0; i--) {
            activeSoldiers[i].dispose();
        }
        activeSoldiers.length = 0;
    }

    function spawnBattlefieldInfantry() {
        clearSoldiers();

        // Spawn soldiers always clustered around enemy tanks (Panzergrenadiers / Infantry escorts)
        const tanks = window.activeEnemyTanks || [];
        if (tanks.length > 0) {
            const escortCount = Math.min(tanks.length, 4);
            for (let i = 0; i < escortCount; i++) {
                const tank = tanks[i];
                const tType = (tank && tank.tankType) ? tank.tankType : 'tiger';
                const f = (tType === 'sherman') ? 'us' : ((tType === 't34') ? 'soviet' : 'german');
                spawnSoldierEscortForTank(tank, f);
            }
        }

        console.log(`[Infantry] Deployed ${activeSoldiers.length} WWII infantry escorts accompanying enemy armor`);
    }

    function spawnEjectedDriver(tankX, tankZ, tankHeading, faction) {
        const f = faction || (window.getOpposingFaction ? window.getOpposingFaction() : 'us');
        // Eject 2.5 meters to the side of the hull
        const ejectAngle = (tankHeading || 0) + Math.PI * 0.5;
        const sx = tankX + Math.cos(ejectAngle) * 2.5;
        const sz = tankZ - Math.sin(ejectAngle) * 2.5;
        const sId = `ejected_driver_${Date.now()}`;

        const driver = new SoldierAI(sId, f, sx, sz, {
            isEnemy: true,
            heading: ejectAngle,
            patrolRadius: 25
        });

        // Stagger / disorient reaction upon being thrown out of hatch
        driver.speed = -1.2;
        driver.recoilKick = 0.5;
        driver.fireCooldown = 1.8;

        if (typeof window.spawnParticle === 'function') {
            const gy = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(sx, sz) : 0;
            const pPos = new THREE.Vector3(sx, gy + 0.8, sz);
            for (let i = 0; i < 6; i++) {
                const pVel = new THREE.Vector3((Math.random() - 0.5) * 3, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 3);
                window.spawnParticle(pPos, pVel, 0x8c7853, 0.2, 0.8, 0.6, false, 'dirt');
            }
        }

        activeSoldiers.push(driver);
        return driver;
    }
    window.spawnEjectedDriver = spawnEjectedDriver;

    function spawnSoldierEscortForTank(enemyTank, enemyFaction) {
        if (!enemyTank) return;
        const faction = enemyFaction || (window.getOpposingFaction ? window.getOpposingFaction() : 'us');
        const offsets = [
            { dx: 6.5, dz: 3.5, heading: 0.2 },
            { dx: -6.5, dz: 3.5, heading: -0.2 }
        ];
        offsets.forEach((off, idx) => {
            const sx = enemyTank.x + off.dx;
            const sz = enemyTank.z + off.dz;
            const sId = `${enemyTank.id || 'tank'}:escort:${idx + 1}`;
            const soldier = new SoldierAI(sId, faction, sx, sz, {
                isEnemy: true,
                heading: off.heading,
                patrolRadius: 18,
                escortTank: enemyTank
            });
            activeSoldiers.push(soldier);
        });
    }
    window.spawnSoldierEscortForTank = spawnSoldierEscortForTank;

    function updateSoldiers(dt) {
        if (!dt || dt <= 0) return;
        const pState = window.tankState;
        if (!pState) return;

        const isInfantry = (window.playerMode === 'soldier' && window.playerSoldier);
        const playerX = isInfantry ? window.playerSoldier.x : (pState.x || 0);
        const playerZ = isInfantry ? window.playerSoldier.z : (pState.z || 0);
        const nowSec = (window.performance && window.performance.now) ? window.performance.now() * 0.001 : Date.now() * 0.001;

        for (let i = activeSoldiers.length - 1; i >= 0; i--) {
            const s = activeSoldiers[i];
            const dist = Math.hypot(s.x - playerX, s.z - playerZ);

            // Degenerate soldiers / corpses when player is away (> 260m)
            // or degenerate dead bodies after 15s or when > 75m away
            const shouldDegenerate = (dist > 260) || (s.isDead && (dist > 75 || (nowSec - (s.deathTime || 0) > 15.0)));
            if (shouldDegenerate) {
                s.dispose();
                activeSoldiers.splice(i, 1);
                continue;
            }

            s.update(dt, playerX, playerZ, nowSec);
        }
    }

    // Expose public API
    window.spawnBattlefieldInfantry = spawnBattlefieldInfantry;
    window.updateSoldiers = updateSoldiers;
    window.clearSoldiers = clearSoldiers;
    window.resetSoldiers = spawnBattlefieldInfantry;
    window.buildSoldier = buildSoldier;

    // Listen for player tank changes to switch soldier factions automatically
    const origSwitchTank = window.switchTank;
    if (typeof origSwitchTank === 'function') {
        window.switchTank = function (newTankId) {
            origSwitchTank(newTankId);
            setTimeout(() => {
                spawnBattlefieldInfantry();
            }, 100);
        };
    }

})();
