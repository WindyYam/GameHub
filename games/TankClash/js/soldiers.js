// ============================================================================
// WWII Infantry Simulation & Combat System (Germany, US, Soviet Union)
// Procedurally rigged, animated soldiers that wander, patrol, take cover,
// and engage opposing factions & armor with service rifles.
// ============================================================================

(function () {
    'use strict';

    // ------------------------------------------------------------------------
    // 1. PROCEDURAL SCULPT ENGINE (Lofted BufferGeometries & Anatomical Mesh)
    // ------------------------------------------------------------------------
    const SculptEngine = {
        createLoftedMesh(slices, radSegs = 20, capTop = true, capBottom = true) {
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
                    const sinT = Math.sin(theta);
                    const cosT = Math.cos(theta);

                    const sq = s.squareness || 0;
                    let nx = sinT;
                    let nz = cosT;
                    if (sq > 0) {
                        nx = Math.sign(sinT) * Math.pow(Math.abs(sinT), 1 - sq * 0.45);
                        nz = Math.sign(cosT) * Math.pow(Math.abs(cosT), 1 - sq * 0.45);
                    }

                    let rMod = 1.0;
                    if (s.foldAmp) {
                        rMod += Math.sin(theta * (s.foldFreq || 6) + (s.foldPhase || 0)) * s.foldAmp;
                        rMod += Math.cos(theta * ((s.foldFreq || 6) * 2 - 1) + 1.3) * (s.foldAmp * 0.4);
                    }
                    if (s.frontBulge && cosT > 0) rMod += Math.pow(cosT, 2) * s.frontBulge;
                    if (s.backBulge && cosT < 0)  rMod += Math.pow(-cosT, 2) * s.backBulge;
                    if (s.pecGroove && cosT > 0.5) rMod -= Math.exp(-Math.pow(sinT * 5.0, 2)) * s.pecGroove;

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

        createRealisticHeadGeometry(facialVariant = 0) {
            const radSegs = 20;
            const ySegs = 16;
            const geo = new THREE.BufferGeometry();
            const positions = [];
            const uvs = [];
            const indices = [];

            const jawWidthMod = facialVariant === 0 ? 1.02 : (facialVariant === 1 ? 1.05 : 0.97);

            for (let iy = 0; iy <= ySegs; iy++) {
                const v = iy / ySegs;
                const y = (v - 0.35) * 0.255;

                for (let ix = 0; ix <= radSegs; ix++) {
                    const u = ix / radSegs;
                    const theta = (u - 0.5) * Math.PI * 2;
                    const sinT = Math.sin(theta);
                    const cosT = Math.cos(theta);

                    let rx = 0.076;
                    let rz = 0.092;
                    let oz = -0.005;

                    if (v < 0.2) {
                        const t = v / 0.2;
                        rx = THREE.MathUtils.lerp(0.056, 0.070 * jawWidthMod, t);
                        rz = THREE.MathUtils.lerp(0.058, 0.080, t);
                    } else if (v < 0.7) {
                        const t = (v - 0.2) / 0.5;
                        rx = THREE.MathUtils.lerp(0.070 * jawWidthMod, 0.078, t);
                        rz = THREE.MathUtils.lerp(0.080, 0.093, t);
                    } else {
                        const t = (v - 0.7) / 0.3;
                        const dome = Math.cos(t * Math.PI * 0.48);
                        rx = 0.078 * dome;
                        rz = 0.093 * dome;
                    }

                    let x = sinT * rx;
                    let z = oz + cosT * rz;

                    if (cosT > 0) {
                        // Nose & brow ridge
                        if (v >= 0.35 && v <= 0.62) {
                            const nv = (v - 0.35) / 0.27;
                            const noseProfile = Math.sin(nv * Math.PI * 0.85);
                            const noseCenterMask = Math.exp(-Math.pow(theta / 0.18, 2));
                            z += noseCenterMask * 0.022 * noseProfile;
                        }
                        if (v >= 0.58 && v <= 0.70) {
                            const browMask = Math.exp(-Math.pow(theta / 0.45, 2));
                            z += browMask * 0.010;
                        }
                    }

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
                    indices.push(a, b, d);
                    indices.push(b, c, d);
                }
            }

            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setIndex(indices);
            geo.computeVertexNormals();
            return geo;
        },

        createSculptedBootGeometry() {
            const geo = new THREE.BoxGeometry(0.10, 0.085, 0.25, 6, 4, 8);
            const pos = geo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                let x = pos.getX(i);
                let y = pos.getY(i);
                let z = pos.getZ(i);
                const zn = (z + 0.125) / 0.25;
                if (zn < 0.35) x *= 0.85 + zn * 0.30;
                else if (zn > 0.65) x *= (1.05 - Math.pow((zn - 0.65) / 0.35, 2) * 0.35);
                if (y > 0 && zn > 0.30) y -= (zn - 0.30) * 0.028;
                pos.setXYZ(i, x, y, z);
            }
            geo.translate(0, -0.042, 0.052);
            geo.computeVertexNormals();
            return geo;
        },

        createArticulatedHand(isRight, skinMat) {
            const handGroup = new THREE.Group();
            const palm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.075, 0.065), skinMat);
            palm.position.set(0, -0.036, 0.004);
            handGroup.add(palm);

            const fingers = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.055, 8), skinMat);
            fingers.position.set(0, -0.075, 0.005);
            fingers.rotation.x = 0.45;
            handGroup.add(fingers);

            const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.007, 0.038, 7), skinMat);
            thumb.position.set(isRight ? -0.018 : 0.018, -0.040, 0.024);
            thumb.rotation.set(0.4, isRight ? -0.5 : 0.5, 0);
            handGroup.add(thumb);

            return handGroup;
        }
    };

    // ------------------------------------------------------------------------
    // 2. SHARED TEXTURES & PBR MATERIALS (Cached Once)
    // ------------------------------------------------------------------------
    const MATS = {};
    let materialsInitialized = false;

    function createPatternTexture(colorHex, noiseAmp = 0.08) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const ctx = c.getContext('2d');
        const col = new THREE.Color(colorHex);
        ctx.fillStyle = `#${col.getHexString()}`;
        ctx.fillRect(0, 0, 64, 64);

        for (let y = 0; y < 64; y += 4) {
            for (let x = 0; x < 64; x += 4) {
                const n = (Math.random() - 0.5) * noiseAmp;
                const oc = col.clone().offsetHSL(0, 0, n);
                ctx.fillStyle = `#${oc.getHexString()}`;
                ctx.fillRect(x, y, 4, 4);
            }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        return tex;
    }

    function initMaterials() {
        if (materialsInitialized) return;

        MATS.usJacket = new THREE.MeshStandardMaterial({ color: 0x635b3d, roughness: 0.90, metalness: 0.0, map: createPatternTexture(0x635b3d) });
        MATS.usPants  = new THREE.MeshStandardMaterial({ color: 0x554c33, roughness: 0.90, metalness: 0.0, map: createPatternTexture(0x554c33) });
        MATS.sovietTunic = new THREE.MeshStandardMaterial({ color: 0x6d5a36, roughness: 0.90, metalness: 0.0, map: createPatternTexture(0x6d5a36) });
        MATS.germanTunic = new THREE.MeshStandardMaterial({ color: 0x454f46, roughness: 0.88, metalness: 0.0, map: createPatternTexture(0x454f46) });
        MATS.germanPants = new THREE.MeshStandardMaterial({ color: 0x49514b, roughness: 0.88, metalness: 0.0, map: createPatternTexture(0x49514b) });

        MATS.usHelmet     = new THREE.MeshStandardMaterial({ color: 0x454836, roughness: 0.70, metalness: 0.25, map: createPatternTexture(0x454836, 0.12) });
        MATS.sovietHelmet = new THREE.MeshStandardMaterial({ color: 0x485237, roughness: 0.60, metalness: 0.35, map: createPatternTexture(0x485237, 0.10) });
        MATS.germanHelmet = new THREE.MeshStandardMaterial({ color: 0x343a38, roughness: 0.55, metalness: 0.40, map: createPatternTexture(0x343a38, 0.08) });

        MATS.webGear      = new THREE.MeshStandardMaterial({ color: 0x7a6e4a, roughness: 0.92, metalness: 0.0 });
        MATS.blackLeather = new THREE.MeshStandardMaterial({ color: 0x181615, roughness: 0.55, metalness: 0.1 });
        MATS.brownLeather = new THREE.MeshStandardMaterial({ color: 0x472c1a, roughness: 0.58, metalness: 0.08 });
        MATS.wood         = new THREE.MeshStandardMaterial({ color: 0x4e3119, roughness: 0.65, metalness: 0.05 });
        MATS.gunMetal     = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.35, metalness: 0.82 });
        MATS.brass        = new THREE.MeshStandardMaterial({ color: 0xb59449, roughness: 0.35, metalness: 0.75 });
        MATS.skin         = new THREE.MeshStandardMaterial({ color: 0xd8ad8d, roughness: 0.75, metalness: 0.0 });
        MATS.redStar      = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.60, metalness: 0.1 });
        MATS.silver       = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.40, metalness: 0.75 });

        materialsInitialized = true;
    }

    // ------------------------------------------------------------------------
    // 3. WEAPONS BUILDER (M1 Garand, Mosin-Nagant, Karabiner 98k)
    // ------------------------------------------------------------------------
    function buildRifle(type) {
        const rifle = new THREE.Group();

        // Wooden stock
        const stockGeo = new THREE.BoxGeometry(0.038, 0.080, 0.66, 2, 4, 12);
        const pos = stockGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            let y = pos.getY(i);
            let z = pos.getZ(i);
            if (z < -0.10) {
                y -= (-0.10 - z) * 0.18;
            } else {
                y *= 0.65;
            }
            pos.setY(i, y);
        }
        stockGeo.computeVertexNormals();
        const stock = new THREE.Mesh(stockGeo, MATS.wood);
        rifle.add(stock);

        // Buttplate
        const butt = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.015), MATS.gunMetal);
        butt.position.set(0, -0.026, -0.33);
        rifle.add(butt);

        // Steel receiver
        const receiver = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.16, 8), MATS.gunMetal);
        receiver.rotation.x = Math.PI / 2;
        receiver.position.set(0, 0.024, 0.06);
        rifle.add(receiver);

        // Barrel length varies by rifle
        const barrelLen = (type === 'mosin') ? 0.52 : ((type === 'garand') ? 0.44 : 0.42);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, barrelLen, 8), MATS.gunMetal);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.022, 0.33 + barrelLen * 0.5);
        rifle.add(barrel);

        // Front sight post
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.020, 0.010), MATS.gunMetal);
        sight.position.set(0, 0.038, 0.33 + barrelLen - 0.02);
        rifle.add(sight);

        // Trigger guard
        const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 8, Math.PI), MATS.gunMetal);
        guard.rotation.y = Math.PI / 2;
        guard.position.set(0, -0.038, 0.02);
        rifle.add(guard);

        // Muzzle locator point
        const muzzlePoint = new THREE.Vector3(0, 0.022, 0.33 + barrelLen);
        rifle.userData.muzzleOffset = muzzlePoint;

        return rifle;
    }

    // ------------------------------------------------------------------------
    // 4. HELMET BUILDER (M1, SSh-40, Stahlhelm M42)
    // ------------------------------------------------------------------------
    function buildHelmet(faction) {
        const helmetGroup = new THREE.Group();

        if (faction === 'us') {
            const domeGeo = new THREE.SphereGeometry(0.116, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
            domeGeo.scale(0.96, 0.94, 1.10);
            const dome = new THREE.Mesh(domeGeo, MATS.usHelmet);
            helmetGroup.add(dome);
        } else if (faction === 'soviet') {
            const domeGeo = new THREE.SphereGeometry(0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
            domeGeo.scale(0.96, 0.92, 1.08);
            const dome = new THREE.Mesh(domeGeo, MATS.sovietHelmet);
            helmetGroup.add(dome);

            // Red Star
            const star = new THREE.Mesh(new THREE.CircleGeometry(0.018, 5), MATS.redStar);
            star.position.set(0, 0.052, 0.12);
            star.rotation.x = -0.3;
            helmetGroup.add(star);
        } else {
            // German Stahlhelm with characteristic side & neck flared rim
            const stahlSlices = [
                { y: -0.030, rx: 0.126, rz: 0.146, squareness: 0.08 },
                { y:  0.010, rx: 0.108, rz: 0.126, squareness: 0.05 },
                { y:  0.060, rx: 0.098, rz: 0.112, squareness: 0.02 },
                { y:  0.105, rx: 0.030, rz: 0.035, squareness: 0.0 }
            ];
            const dome = new THREE.Mesh(SculptEngine.createLoftedMesh(stahlSlices, 18, true, false), MATS.germanHelmet);
            helmetGroup.add(dome);
        }

        // Chinstrap
        const strapGeo = new THREE.TorusGeometry(0.075, 0.004, 6, 12, Math.PI);
        strapGeo.rotateX(Math.PI / 2);
        const strap = new THREE.Mesh(strapGeo, MATS.brownLeather);
        strap.position.set(0, -0.045, 0.02);
        helmetGroup.add(strap);

        return helmetGroup;
    }

    // ------------------------------------------------------------------------
    // 5. SOLDIER CHARACTER RIG BUILDER
    // ------------------------------------------------------------------------
    function buildSoldier(faction) {
        initMaterials();
        const root = new THREE.Group();

        const tunicMat = faction === 'us' ? MATS.usJacket : (faction === 'soviet' ? MATS.sovietTunic : MATS.germanTunic);
        const pantsMat = faction === 'us' ? MATS.usPants  : (faction === 'soviet' ? MATS.sovietTunic : MATS.germanPants);
        const bootMat  = faction === 'us' ? MATS.brownLeather : MATS.blackLeather;
        const variantIdx = faction === 'us' ? 0 : (faction === 'soviet' ? 1 : 2);

        // Hips
        const hips = new THREE.Group();
        hips.position.y = 0.95;
        root.add(hips);

        // Tunic skirt
        const skirtSlices = [
            { y: -0.11, rx: 0.190, rz: 0.135, foldAmp: 0.035, foldFreq: 6, squareness: 0.25 },
            { y:  0.04, rx: 0.162, rz: 0.115, foldAmp: 0.015, foldFreq: 6, squareness: 0.30 },
            { y:  0.10, rx: 0.154, rz: 0.108, squareness: 0.32 }
        ];
        const tunicSkirt = new THREE.Mesh(SculptEngine.createLoftedMesh(skirtSlices, 18, true, true), tunicMat);
        hips.add(tunicSkirt);

        // Torso
        const torso = new THREE.Group();
        torso.position.y = 0.09;
        hips.add(torso);

        const torsoSlices = [
            { y: 0.00, rx: 0.152, rz: 0.106, squareness: 0.32 },
            { y: 0.10, rx: 0.170, rz: 0.122, frontBulge: 0.05, squareness: 0.35 },
            { y: 0.28, rx: 0.205, rz: 0.134, frontBulge: 0.08, pecGroove: 0.06, squareness: 0.40 },
            { y: 0.43, rx: 0.120, rz: 0.098, squareness: 0.20 }
        ];
        const chestMesh = new THREE.Mesh(SculptEngine.createLoftedMesh(torsoSlices, 18, true, false), tunicMat);
        torso.add(chestMesh);

        // Belt & Pouches
        const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.160, 0.160, 0.055, 14), faction === 'us' ? MATS.webGear : MATS.blackLeather);
        belt.position.y = 0.01;
        torso.add(belt);

        const pouchMat = faction === 'us' ? MATS.webGear : (faction === 'soviet' ? MATS.brownLeather : MATS.blackLeather);
        [-0.45, -0.20, 0.20, 0.45].forEach(ang => {
            const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.075, 0.040), pouchMat);
            pouch.position.set(Math.sin(ang) * 0.165, 0.005, Math.cos(ang) * 0.122);
            pouch.rotation.y = ang;
            torso.add(pouch);
        });

        // Neck & Head
        const neck = new THREE.Group();
        neck.position.set(0, 0.44, 0);
        torso.add(neck);

        const head = new THREE.Group();
        head.position.set(0, 0.065, 0.008);
        neck.add(head);

        const headMesh = new THREE.Mesh(SculptEngine.createRealisticHeadGeometry(variantIdx), MATS.skin);
        headMesh.position.y = 0.052;
        head.add(headMesh);

        // Helmet
        const helmet = buildHelmet(faction);
        helmet.position.set(0, 0.122, 0);
        helmet.rotation.x = -0.04;
        head.add(helmet);

        // Arms
        function createArm(isRight) {
            const side = isRight ? -1 : 1;
            const shoulder = new THREE.Group();
            shoulder.position.set(side * 0.21, 0.36, 0);
            torso.add(shoulder);

            const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.048, 0.25, 8), tunicMat);
            upperArm.position.y = -0.125;
            shoulder.add(upperArm);

            const elbow = new THREE.Group();
            elbow.position.y = -0.25;
            shoulder.add(elbow);

            const foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.040, 0.22, 8), tunicMat);
            foreArm.position.y = -0.11;
            elbow.add(foreArm);

            const wrist = new THREE.Group();
            wrist.position.y = -0.22;
            elbow.add(wrist);

            const hand = SculptEngine.createArticulatedHand(isRight, MATS.skin);
            wrist.add(hand);

            return { shoulder, elbow, wrist, hand };
        }

        const rightArm = createArm(true);
        const leftArm  = createArm(false);

        // Rifle
        const rifleType = (faction === 'us') ? 'garand' : ((faction === 'soviet') ? 'mosin' : 'kar98k');
        const rifle = buildRifle(rifleType);
        rifle.position.set(0.04, -0.04, 0.06);
        rifle.rotation.set(-0.85, -0.42, -0.38);
        rightArm.wrist.add(rifle);

        // Legs
        function createLeg(isRight) {
            const side = isRight ? -1 : 1;
            const hipJoint = new THREE.Group();
            hipJoint.position.set(side * 0.10, -0.04, 0);
            hips.add(hipJoint);

            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.068, 0.38, 8), pantsMat);
            thigh.position.y = -0.19;
            hipJoint.add(thigh);

            const kneeJoint = new THREE.Group();
            kneeJoint.position.y = -0.38;
            hipJoint.add(kneeJoint);

            const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.052, 0.38, 8), faction === 'us' ? MATS.webGear : MATS.blackLeather);
            calf.position.y = -0.19;
            kneeJoint.add(calf);

            const ankle = new THREE.Group();
            ankle.position.y = -0.38;
            kneeJoint.add(ankle);

            const foot = new THREE.Mesh(SculptEngine.createSculptedBootGeometry(), bootMat);
            ankle.add(foot);

            return { hipJoint, kneeJoint, ankle };
        }

        const rightLeg = createLeg(true);
        const leftLeg  = createLeg(false);

        return {
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
    }

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

            const targetScene = window.scene || null;
            if (targetScene) targetScene.add(this.rig.root);
        }

        update(dt, playerX, playerZ, nowSec) {
            if (this.isDead) return;

            this.animTime += dt;
            this.fireCooldown = Math.max(0, this.fireCooldown - dt);
            this.recoilKick = Math.max(0, this.recoilKick - dt * 5.0);

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

            // 4. Procedural Joint Animation (Cull detailed bones if far away on mobile)
            const isFar = distToPlayer > 110;
            this.animateJoints(isFar, dt);
        }

        evaluateCombatTarget(playerX, playerZ, distToPlayer) {
            this.currentTarget = null;

            // A. Check Player Tank
            if (this.isEnemy && !window.tankState.isKnockedOut && distToPlayer < 55) {
                this.currentTarget = {
                    type: 'tank',
                    x: playerX,
                    y: (window.tankState.y || 0) + 1.2,
                    z: playerZ,
                    dist: distToPlayer
                };
                return;
            }

            // B. Check Allied Tank (if soldier is allied to player, check enemy tanks)
            if (!this.isEnemy && window.combatTanks) {
                for (let i = 0; i < window.combatTanks.length; i++) {
                    const et = window.combatTanks[i];
                    if (!et.isDestroyed) {
                        const d = Math.hypot(et.x - this.x, et.z - this.z);
                        if (d < 55) {
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
            let closestDist = 48; // Max infantry engagement range

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
            const targetHeading = Math.atan2(dx, dz);

            // Turn towards target
            let angleDiff = targetHeading - this.heading;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
            this.heading += THREE.MathUtils.clamp(angleDiff, -3.2 * dt, 3.2 * dt);

            // Stop walking while firing
            this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 6.0);
            this.aimWeight = THREE.MathUtils.lerp(this.aimWeight, 1.0, dt * 4.5);

            // Fire when aligned and cooldown expires
            if (Math.abs(angleDiff) < 0.28 && this.fireCooldown <= 0) {
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

            // World position of rifle muzzle
            const muzzleWorldPos = new THREE.Vector3();
            if (this.rig.rifle) {
                this.rig.rifle.localToWorld(muzzleWorldPos.copy(this.rig.rifle.userData.muzzleOffset || new THREE.Vector3(0, 0.02, 0.6)));
            } else {
                muzzleWorldPos.set(this.x, this.y + 1.2, this.z);
            }

            // Direction towards target with slight authentic spread
            const aimTargetPos = new THREE.Vector3(
                target.x + (Math.random() - 0.5) * 0.45,
                target.y + (Math.random() - 0.5) * 0.35,
                target.z + (Math.random() - 0.5) * 0.45
            );
            const shootDir = aimTargetPos.clone().sub(muzzleWorldPos).normalize();

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
                window.spawnTracerRound(muzzleWorldPos, shootDir, tracerQuat);
            }

            // 3. Bullet Impact on Target
            const flightTime = target.dist / 750.0;
            setTimeout(() => {
                if (target.type === 'tank') {
                    // Ricochet sparks off steel armor
                    if (typeof window.spawnParticle === 'function') {
                        const hitPos = aimTargetPos.clone();
                        for (let s = 0; s < 4; s++) {
                            const sparkVel = new THREE.Vector3((Math.random() - 0.5) * 3.5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3.5);
                            window.spawnParticle(hitPos, sparkVel, 0xffcc33, 0.08, 0.03, 0.25, true, 'spark');
                        }
                    }
                } else if (target.type === 'soldier' && target.ref && !target.ref.isDead) {
                    // Deal infantry damage
                    target.ref.takeDamage(35);
                }
            }, Math.round(flightTime * 1000));
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
            this.speed = 0;
            // Drop to ground
            this.rig.hips.position.y = 0.15;
            this.rig.hips.rotation.x = -Math.PI * 0.45;
            this.rig.hips.rotation.z = (Math.random() - 0.5) * 0.5;
            this.rig.head.rotation.x = -0.3;
            // Dust puff on collapse
            if (typeof window.spawnParticle === 'function') {
                const groundPos = new THREE.Vector3(this.x, this.y + 0.1, this.z);
                for (let i = 0; i < 6; i++) {
                    const dVel = new THREE.Vector3((Math.random() - 0.5) * 2.5, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 2.5);
                    window.spawnParticle(groundPos, dVel, 0x5a4d41, 0.20, 0.75, 0.85, false, 'dirt');
                }
            }
        }

        handleWander(dt) {
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

            // 1. Leg Walk Cycle
            if (isMoving) {
                const stride = Math.sin(walk);
                const rHipX = stride * 0.45;
                const lHipX = -stride * 0.45;
                const rKneeX = Math.max(0.05, -Math.cos(walk) * 0.50);
                const lKneeX = Math.max(0.05, Math.cos(walk) * 0.50);

                rig.rightLeg.hipJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.hipJoint.rotation.x, rHipX, 0.25);
                rig.leftLeg.hipJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.hipJoint.rotation.x, lHipX, 0.25);
                rig.rightLeg.kneeJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.kneeJoint.rotation.x, rKneeX, 0.25);
                rig.leftLeg.kneeJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.kneeJoint.rotation.x, lKneeX, 0.25);
                rig.hips.position.y = 0.95 + Math.abs(Math.cos(walk)) * 0.025;
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

            rig.torso.rotation.y = THREE.MathUtils.lerp(patrolTorsoY, aimTorsoY, w);
            rig.head.rotation.y  = THREE.MathUtils.lerp(patrolHeadY, aimHeadY, w);

            rig.rightArm.shoulder.rotation.x = THREE.MathUtils.lerp(patrolRShX, aimRShX, w);
            rig.rightArm.shoulder.rotation.z = THREE.MathUtils.lerp(-0.20, -0.42, w);
            rig.rightArm.elbow.rotation.x    = THREE.MathUtils.lerp(-1.22, -1.42, w);

            rig.leftArm.shoulder.rotation.x  = THREE.MathUtils.lerp(patrolLShX, aimLShX, w);
            rig.leftArm.shoulder.rotation.y  = THREE.MathUtils.lerp(-0.55, -0.42, w);
            rig.leftArm.elbow.rotation.x     = THREE.MathUtils.lerp(-0.82, -0.88, w);

            rig.rifle.rotation.x = THREE.MathUtils.lerp(patrolRifleRotX, aimRifleRotX, w);
            rig.rifle.rotation.y = THREE.MathUtils.lerp(-0.40, -0.20, w);
            rig.rifle.rotation.z = THREE.MathUtils.lerp(0.50, 0.28, w);
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

        const currentTank = window.currentTankId || 'tiger';
        const { allied, enemy } = getFactionsForPlayerTank(currentTank);

        // Tactical Squad Spawns across key terrain points:
        const spawnPoints = [
            // 1. Allied Infantry Fireteam (Guarding near player spawn meadow)
            { id: 'allied:1', faction: allied, isEnemy: false, x: 14.0, z: -8.0, heading: 0.2, patrolRadius: 22 },
            { id: 'allied:2', faction: allied, isEnemy: false, x: 19.5, z: -14.0, heading: -0.4, patrolRadius: 18 },
            { id: 'allied:3', faction: allied, isEnemy: false, x: -16.0, z: -12.0, heading: 0.6, patrolRadius: 20 },

            // 2. Crossroads Village Entrenched Garrison (Defending cottages & stone walls)
            { id: 'village:1', faction: enemy, isEnemy: true, x: -14.0, z: -88.0, heading: 3.1, patrolRadius: 24 },
            { id: 'village:2', faction: enemy, isEnemy: true, x: -8.0,  z: -96.0, heading: 2.8, patrolRadius: 20 },
            { id: 'village:3', faction: enemy, isEnemy: true, x: 16.0,  z: -92.0, heading: 3.4, patrolRadius: 25 },
            { id: 'village:4', faction: enemy, isEnemy: true, x: 4.0,   z: -108.0, heading: 3.0, patrolRadius: 22 },

            // 3. Enemy Armor Support Fireteams (Advancing near the 2 initial enemy tanks)
            { id: 'tankEscort:1', faction: enemy, isEnemy: true, x: 46.0, z: 68.0, heading: -2.4, patrolRadius: 25 },
            { id: 'tankEscort:2', faction: enemy, isEnemy: true, x: 59.0, z: 60.0, heading: -2.2, patrolRadius: 22 },
            { id: 'tankEscort:3', faction: enemy, isEnemy: true, x: -55.0, z: 74.0, heading: -1.2, patrolRadius: 25 },
            { id: 'tankEscort:4', faction: enemy, isEnemy: true, x: -68.0, z: 82.0, heading: -0.9, patrolRadius: 22 },

            // 4. East Road Checkpoint & Meadow Patrol
            { id: 'eastPatrol:1', faction: enemy, isEnemy: true, x: 78.0, z: -15.0, heading: -1.5, patrolRadius: 26 },
            { id: 'eastPatrol:2', faction: enemy, isEnemy: true, x: 88.0, z: -25.0, heading: -1.8, patrolRadius: 24 }
        ];

        spawnPoints.forEach(sp => {
            const soldier = new SoldierAI(sp.id, sp.faction, sp.x, sp.z, {
                isEnemy: sp.isEnemy,
                heading: sp.heading,
                patrolRadius: sp.patrolRadius
            });
            activeSoldiers.push(soldier);
        });

        console.log(`[Infantry] Deployed ${activeSoldiers.length} WWII soldiers (Allied: ${allied}, Enemy: ${enemy})`);
    }

    function updateSoldiers(dt) {
        if (!dt || dt <= 0) return;
        const pState = window.tankState;
        if (!pState) return;

        const playerX = pState.x || 0;
        const playerZ = pState.z || 0;
        const nowSec = performance.now() * 0.001;

        for (let i = 0; i < activeSoldiers.length; i++) {
            activeSoldiers[i].update(dt, playerX, playerZ, nowSec);
        }
    }

    // Expose public API
    window.spawnBattlefieldInfantry = spawnBattlefieldInfantry;
    window.updateSoldiers = updateSoldiers;
    window.clearSoldiers = clearSoldiers;
    window.resetSoldiers = spawnBattlefieldInfantry;

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
