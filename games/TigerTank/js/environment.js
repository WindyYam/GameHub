// ============================================================================
// TigerTank Battlefield Environment Builder
// Multi-Layered Natural Terrain, River Valley, Forest, Obstacles & Targets
// ============================================================================

var environmentMode = 'wild'; // 'wild' or 'studio'
var envGroup = null;
var obstacles = [];       // Boulders, moguls, river banks for suspension physics
var targets = [];         // Destructible enemy armored hulls / target wrecks
var swayTrees = [];       // Instanced or grouped trees that sway & react to shockwaves
var terrainMeshRef = null;  // Used for 3D camera aim raycasting
var waterMeshRef = null;
var terrainBumpTex = null;

// Generate rich organic micro-relief texture for wild terrain (grass blades, pebbles, dark loam)
function createTerrainDetailTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    // Multi-frequency noise for earthy soil and clumps
    for (let i = 0; i < 35000; i++) {
        const v = Math.floor(100 + Math.random() * 65);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // Organic fine grass blade strokes
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4000; i++) {
        const gx = Math.random() * 512;
        const gy = Math.random() * 512;
        const gl = 3 + Math.random() * 6;
        const ga = -Math.PI * 0.5 + (Math.random() - 0.5) * 0.8;
        const bright = 120 + Math.floor(Math.random() * 50);
        ctx.strokeStyle = `rgb(${bright}, ${bright + 15}, ${bright - 10})`;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + Math.cos(ga) * gl, gy + Math.sin(ga) * gl);
        ctx.stroke();
    }

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(55, 55);
    return t;
}

// Mathematical Wild Terrain Height Sampler (Rolling hills, muddy tank ruts, shallow river ford, rocky ridges)
function getTerrainHeight(x, z) {
    if (environmentMode === 'studio') return 0;

    // Smooth spawn clearing around (0,0) so tank starts level
    const distFromSpawn = Math.sqrt(x * x + z * z);
    const spawnBlend = THREE.MathUtils.smoothstep(distFromSpawn, 4.5, 14.0);

    // Multi-octave rolling European countryside hills
    let h = (
        Math.sin(x * 0.032) * Math.cos(z * 0.028) * 2.6 +
        Math.sin(x * 0.085 + z * 0.065) * 0.72 +
        Math.cos(x * 0.19 - z * 0.16) * 0.22
    ) * spawnBlend;

    // Winding shallow river valley / stream bed cutting across Z ~ 26..34
    const riverCenterZ = 28.0 + Math.sin(x * 0.05) * 6.5;
    const distToRiver = Math.abs(z - riverCenterZ);
    if (distToRiver < 7.5) {
        const riverDepth = Math.cos((distToRiver / 7.5) * Math.PI * 0.5);
        h -= riverDepth * 1.15;
    }

    // Muddy tank track ruts along the main dirt road (X ~ -2.5 to +2.5)
    const roadCenterX = Math.sin(z * 0.035) * 4.5;
    const distToRoad = Math.abs(x - roadCenterX);
    if (distToRoad < 3.2) {
        const rut = Math.sin((distToRoad / 3.2) * Math.PI * 2) * 0.08;
        h -= Math.abs(rut);
    }

    // Add structured boulders / earth mounds registered in obstacles[]
    for (let i = 0; i < obstacles.length; i++) {
        const ob = obstacles[i];
        const dx = x - ob.x;
        const dz = z - ob.z;
        if (Math.abs(dx) < ob.rx && Math.abs(dz) < ob.rz) {
            const nx = dx / ob.rx;
            const nz = dz / ob.rz;
            const r2 = nx * nx + nz * nz;
            if (r2 < 1.0) {
                const bump = Math.cos(r2 * Math.PI * 0.5) * ob.h;
                h += bump;
            }
        }
    }
    return h;
}

function initEnvironment(scene) {
    if (!envGroup) {
        envGroup = new THREE.Group();
        scene.add(envGroup);
    }
    if (!terrainBumpTex) {
        terrainBumpTex = createTerrainDetailTexture();
    }
}

function buildEnvironment(scene) {
    initEnvironment(scene || window.scene);

    while (envGroup.children.length > 0) {
        envGroup.remove(envGroup.children[0]);
    }
    obstacles.length = 0;
    targets.length = 0;
    swayTrees.length = 0;
    terrainMeshRef = null;
    waterMeshRef = null;

    const currentScene = scene || window.scene;

    if (environmentMode === 'studio') {
        currentScene.background.setHex(0xf3f5f8);
        currentScene.fog.color.setHex(0xf3f5f8);
        currentScene.fog.density = 0.002;

        const studioGeo = new THREE.PlaneGeometry(360, 360);
        studioGeo.rotateX(-Math.PI / 2);
        const studioMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.35,
            metalness: 0.05
        });
        const floor = new THREE.Mesh(studioGeo, studioMat);
        floor.receiveShadow = true;
        envGroup.add(floor);
        terrainMeshRef = floor;
        window.terrainMeshRef = floor;
        return;
    }

    // --- WILD COUNTRYSIDE BATTLEFIELD SCENE ---
    currentScene.background.setHex(0xc7d4e0);
    currentScene.fog.color.setHex(0xc2d0dc);
    currentScene.fog.density = 0.0032;

    // 1. Atmospheric Sky Dome with Horizon Glow
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 64; skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext('2d');
    const grad = sCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#4b6584');
    grad.addColorStop(0.55, '#95afc0');
    grad.addColorStop(0.82, '#dfe4ea');
    grad.addColorStop(1.0, '#f6e58d');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 64, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const skyDome = new THREE.Mesh(
        new THREE.SphereGeometry(420, 32, 20),
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
    );
    envGroup.add(skyDome);

    // 2. Register Earth Mounds / Tank Berms for Suspension Articulation
    const bermCoords = [
        { x: -1.4, z: 10.5, rx: 1.8, rz: 1.6, h: 0.36 },
        { x:  1.4, z: 14.0, rx: 1.8, rz: 1.6, h: 0.38 },
        { x: -1.4, z: 17.5, rx: 1.8, rz: 1.6, h: 0.36 },
        { x:  8.5, z: 12.0, rx: 3.2, rz: 3.2, h: 0.65 },
        { x: -9.5, z: 18.0, rx: 3.5, rz: 3.0, h: 0.72 }
    ];
    bermCoords.forEach(b => obstacles.push(b));

    // 3. Multi-Layered Natural Terrain Mesh (Grass, Dark Mud, Dirt Road, Wet Riverbank, Highland Rock)
    const groundGeo = new THREE.PlaneGeometry(320, 320, 220, 220);
    groundGeo.rotateX(-Math.PI / 2);
    const pos = groundGeo.attributes.position;
    const colors = [];

    const cMeadow = new THREE.Color(0x4d613c);
    const cLush   = new THREE.Color(0x3b4d2e);
    const cMud    = new THREE.Color(0x4a3f35);
    const cRiver  = new THREE.Color(0x363932);
    const cRock   = new THREE.Color(0x6c6f6d);

    for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const vy = getTerrainHeight(vx, vz);
        pos.setY(i, vy);

        const roadCenterX = Math.sin(vz * 0.035) * 4.5;
        const distToRoad = Math.abs(vx - roadCenterX);
        const riverCenterZ = 28.0 + Math.sin(vx * 0.05) * 6.5;
        const distToRiver = Math.abs(vz - riverCenterZ);

        const col = cMeadow.clone();
        // Organic grass variation
        const noise = Math.sin(vx * 0.25) * Math.cos(vz * 0.25) * 0.5 + 0.5;
        col.lerp(cLush, noise * 0.65);

        // Muddy tank road & spawn pad
        if (distToRoad < 3.4 || (vx * vx + vz * vz) < 30) {
            const roadFactor = distToRoad < 3.4 ? (1.0 - distToRoad / 3.4) : 0.7;
            col.lerp(cMud, Math.min(1, roadFactor * 0.9));
        }
        // Wet river bed & banks
        if (distToRiver < 8.0) {
            col.lerp(cRiver, 1.0 - distToRiver / 8.0);
        }
        // Rocky highland outcrops
        if (vy > 1.65) {
            col.lerp(cRock, Math.min(1, (vy - 1.65) / 1.5));
        }
        colors.push(col.r, col.g, col.b);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        bumpMap: terrainBumpTex,
        bumpScale: 0.08,
        roughness: 0.88,
        metalness: 0.04
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.receiveShadow = true;
    envGroup.add(groundMesh);
    terrainMeshRef = groundMesh;
    window.terrainMeshRef = groundMesh;

    // 4. Semi-Transparent Shallow River Water Plane along the Valley Ford
    const waterGeo = new THREE.PlaneGeometry(320, 26, 80, 12);
    waterGeo.rotateX(-Math.PI / 2);
    const wPos = waterGeo.attributes.position;
    for (let i = 0; i < wPos.count; i++) {
        const wx = wPos.getX(i);
        const wz = wPos.getZ(i);
        const riverCenterZ = 28.0 + Math.sin(wx * 0.05) * 6.5;
        wPos.setZ(i, wz + riverCenterZ);
        wPos.setY(i, -0.42);
    }
    waterGeo.computeVertexNormals();
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x385a64,
        roughness: 0.18,
        metalness: 0.65,
        transparent: true,
        opacity: 0.78
    });
    waterMeshRef = new THREE.Mesh(waterGeo, waterMat);
    waterMeshRef.receiveShadow = true;
    envGroup.add(waterMeshRef);

    // 5. Realistic Pine & Silver Birch Forest Clusters + Boulders + Czech Hedgehogs
    const mats = window.mats || {};
    const pineBarkMat = mats.pineBark || new THREE.MeshStandardMaterial({ color: 0x3d281a, roughness: 0.95 });
    const birchBarkMat = mats.birchBark || new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 });
    const pineNeedlesMat = mats.pineNeedles || new THREE.MeshStandardMaterial({ color: 0x1f3624, roughness: 0.85 });
    const birchLeavesMat = mats.birchLeaves || new THREE.MeshStandardMaterial({ color: 0x5a7d36, roughness: 0.8 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x586064, roughness: 0.82, bumpMap: terrainBumpTex, bumpScale: 0.16 });
    const rustSteelMat = new THREE.MeshStandardMaterial({ color: 0x3d352e, roughness: 0.7, metalness: 0.6 });

    // Deterministic pseudo-random helper for rich placement
    let seed = 1337;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };

    // Spawn 105 Realistic Conifer Pine and Silver Birch Trees
    for (let i = 0; i < 105; i++) {
        const tx = (rand() - 0.5) * 230;
        const tz = (rand() - 0.5) * 230;
        const roadCenterX = Math.sin(tz * 0.035) * 4.5;
        const riverCenterZ = 28.0 + Math.sin(tx * 0.05) * 6.5;

        if (Math.hypot(tx, tz) < 14) continue;
        if (Math.abs(tx - roadCenterX) < 5.8) continue;
        if (Math.abs(tz - riverCenterZ) < 6.8) continue;

        const ty = getTerrainHeight(tx, tz);
        const treeGroup = new THREE.Group();
        treeGroup.position.set(tx, ty, tz);
        const scale = 0.85 + rand() * 0.65;
        treeGroup.scale.setScalar(scale);

        if (rand() > 0.35) {
            // Realistic Tiered Conifer Spruce / Pine Tree
            // Tapered trunk with root flare
            const trunkHeight = 4.2;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, trunkHeight, 8), pineBarkMat);
            trunk.position.y = trunkHeight * 0.5;
            trunk.castShadow = true;
            treeGroup.add(trunk);

            // 5 Layered Conical Needle Skirts with staggered diameter and drooping angle
            const tiers = 5;
            for (let tier = 0; tier < tiers; tier++) {
                const tFrac = tier / (tiers - 1);
                const bottomRadius = 2.1 - tFrac * 1.35;
                const coneHeight   = 2.1 - tFrac * 0.35;
                const tierY        = 1.8 + tier * 0.95;

                // Main needle cone
                const cone = new THREE.Mesh(
                    new THREE.ConeGeometry(bottomRadius, coneHeight, 10),
                    pineNeedlesMat
                );
                cone.position.y = tierY;
                cone.rotation.y = tier * 0.85 + rand() * 0.4;
                cone.castShadow = true;
                cone.receiveShadow = true;
                treeGroup.add(cone);

                // Secondary drooping bough skirt for dense, feathered conifer foliage
                if (tier < 4) {
                    const skirt = new THREE.Mesh(
                        new THREE.ConeGeometry(bottomRadius * 1.12, 0.45, 8),
                        pineNeedlesMat
                    );
                    skirt.position.y = tierY - coneHeight * 0.32;
                    skirt.rotation.y = tier * 0.85 + Math.PI / 8;
                    skirt.castShadow = true;
                    treeGroup.add(skirt);
                }
            }
        } else {
            // Realistic Multi-Stem European Silver Birch Tree
            // Lower Trunk with papery white bark
            const trunkHeight = 3.6;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.19, trunkHeight, 8), birchBarkMat);
            trunk.position.y = trunkHeight * 0.5;
            trunk.rotation.z = (rand() - 0.5) * 0.08;
            trunk.castShadow = true;
            treeGroup.add(trunk);

            // 2-3 Natural Curved Birch Limb Branches
            for (let b = 0; b < 3; b++) {
                const limbLen = 2.2 + rand() * 0.8;
                const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.095, limbLen, 6), birchBarkMat);
                const ang = b * (Math.PI * 2 / 3) + (rand() - 0.5) * 0.5;
                limb.position.set(Math.cos(ang) * 0.25, trunkHeight * 0.75 + b * 0.35, Math.sin(ang) * 0.25);
                limb.rotation.set((rand() - 0.5) * 0.35, ang, 0.45 + rand() * 0.25);
                limb.castShadow = true;
                treeGroup.add(limb);

                // Leaf cluster clouds
                for (let c = 0; c < 2; c++) {
                    const leafCloud = new THREE.Mesh(
                        new THREE.DodecahedronGeometry(1.05 + rand() * 0.4, 1),
                        birchLeavesMat
                    );
                    leafCloud.position.set(
                        limb.position.x + Math.sin(ang) * (0.8 + c * 0.7),
                        limb.position.y + 0.9 + c * 0.8,
                        limb.position.z + Math.cos(ang) * (0.8 + c * 0.7)
                    );
                    leafCloud.scale.set(1.15, 0.85, 1.05);
                    leafCloud.castShadow = true;
                    treeGroup.add(leafCloud);
                }
            }
        }

        envGroup.add(treeGroup);
        swayTrees.push({ group: treeGroup, phase: rand() * Math.PI * 2 });
    }

    // Spawn Weathered Boulders & Anti-Tank Czech Hedgehogs (Tschechenigel) along the valley
    for (let i = 0; i < 40; i++) {
        const rx = (rand() - 0.5) * 160;
        const rz = (rand() - 0.5) * 160;
        if (Math.hypot(rx, rz) < 10) continue;
        const ry = getTerrainHeight(rx, rz);

        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 + rand() * 0.85, 1), rockMat);
        rock.position.set(rx, ry + 0.15, rz);
        rock.scale.set(1.2, 0.65 + rand() * 0.4, 1.1);
        rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        rock.castShadow = true;
        rock.receiveShadow = true;
        envGroup.add(rock);
    }

    // Czech Hedgehogs & Wooden Farm Fence Line near the river crossing
    const hedgehogCoords = [
        { x: -6.5, z: 21 }, { x: -8.5, z: 22.5 }, { x: 6.8, z: 20.5 },
        { x: 9.2, z: 22.0 }, { x: -5.5, z: 36.0 }, { x: 7.5, z: 37.5 }
    ];
    hedgehogCoords.forEach((hc) => {
        const hg = new THREE.Group();
        const hy = getTerrainHeight(hc.x, hc.z);
        hg.position.set(hc.x, hy + 0.55, hc.z);
        hg.rotation.y = rand() * Math.PI;
        const beamGeo = new THREE.BoxGeometry(0.14, 1.65, 0.14);
        const b1 = new THREE.Mesh(beamGeo, rustSteelMat); b1.rotation.set(0.6, 0, 0.6); b1.castShadow = true; hg.add(b1);
        const b2 = new THREE.Mesh(beamGeo, rustSteelMat); b2.rotation.set(-0.6, 0, 0.6); b2.castShadow = true; hg.add(b2);
        const b3 = new THREE.Mesh(beamGeo, rustSteelMat); b3.rotation.set(0, 0.6, -0.75); b3.castShadow = true; hg.add(b3);
        envGroup.add(hg);
    });

    // 6. Destructible Enemy Armored Target Hulls / Bunkers across the Wild Valley
    const targetCoords = [
        { x: 0, z: 46 },
        { x: -18, z: 54 },
        { x: 20, z: 50 },
        { x: 8, z: 78 },
        { x: -28, z: 38 },
        { x: 28, z: 32 },
        { x: -12, z: 88 },
        { x: 24, z: 82 }
    ];

    targetCoords.forEach((tc) => {
        const tg = new THREE.Group();
        const ty = getTerrainHeight(tc.x, tc.z);
        tg.position.set(tc.x, ty, tc.z);

        // Armored Target Hull Base (Olive/Rust Enemy Tank Silhouette)
        const hullMat = new THREE.MeshStandardMaterial({ color: 0x4b5338, roughness: 0.65, metalness: 0.35 });
        const baseHull = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.05, 4.4), hullMat);
        baseHull.position.y = 0.52;
        baseHull.castShadow = true;
        baseHull.receiveShadow = true;
        tg.add(baseHull);

        // Hinged Turret / Reactive Target Plate on top
        const platePivot = new THREE.Group();
        platePivot.position.y = 1.05;
        tg.add(platePivot);

        const plateMat = new THREE.MeshStandardMaterial({
            color: 0xb91c1c,
            roughness: 0.5,
            metalness: 0.4
        });
        const turretBox = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.85, 12), plateMat);
        turretBox.position.y = 0.42;
        turretBox.castShadow = true;
        platePivot.add(turretBox);

        // White Recognition Cross on Target Turret
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 2.35), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
        crossH.position.y = 0.42;
        platePivot.add(crossH);

        tg.lookAt(0, ty, 0);
        envGroup.add(tg);

        targets.push({
            group: tg,
            pivot: platePivot,
            plateMat: plateMat,
            x: tc.x,
            y: ty + 1.25,
            z: tc.z,
            hitAngle: 0,
            recoverTimer: 0
        });
    });
}

window.environmentMode = environmentMode;
window.envGroup = envGroup;
window.obstacles = obstacles;
window.targets = targets;
window.swayTrees = swayTrees;
window.terrainMeshRef = terrainMeshRef;
window.waterMeshRef = waterMeshRef;
window.getTerrainHeight = getTerrainHeight;
window.initEnvironment = initEnvironment;
window.buildEnvironment = buildEnvironment;
