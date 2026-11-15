const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8').replace(/\r\n/g, '\n');
}

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
    sub(v) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
    addScaledVector(v, s) { return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s); }
    multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
    setScalar(s) { return this.set(s, s, s); }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    lengthSq() { return this.dot(this); }
    length() { return Math.sqrt(this.lengthSq()); }
    normalize() { const n = this.length(); return n ? this.multiplyScalar(1 / n) : this; }
}

class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.set(x, y, z, w); }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    setFromUnitVectors() { return this; }
}

class MockMesh {
    constructor(geo = null, mat = null) {
        this.position = new Vector3();
        this.rotation = new Vector3();
        this.quaternion = new Quaternion();
        this.scale = new Vector3(1, 1, 1);
        this.visible = true;
        this.userData = {};
        this.geometry = geo;
        this.material = mat;
    }
}

class MockRaycaster {
    constructor(origin, direction, near = 0, far = 100) {
        this.origin = origin || new Vector3();
        this.direction = direction || new Vector3(0, 0, 1);
        this.near = near;
        this.far = far;
    }
    set(origin, direction) {
        this.origin = origin.clone();
        this.direction = direction.clone();
    }
    intersectObject(obj, recursive) {
        if (!obj || !obj.userData || !obj.userData.hitTester) return [];
        return obj.userData.hitTester(this.origin, this.direction, this.far);
    }
}

function createBuildingObstacle(x = 0, y = 0, z = 30) {
    // 5m wide (X: -2.5 to 2.5), 6.6m long (Z: -3.3 to 3.3), 3.4m high (Y: 0 to 3.4)
    // Back window at local Z = -3.3: X in [-0.7, 0.7], Y in [1.31, 2.36]
    const spec = {
        w: 5.0,
        h: 3.4,
        l: 6.6,
        wallThick: 0.32,
        doorW: 1.65,
        doorH: 2.45,
        floorY: 0.16,
        winW: 1.4,
        winH: 1.05,
        winSillH: 1.15,
        sideWinL: 1.5
    };
    const bldgMesh = new MockMesh();
    bldgMesh.position.set(x, y, z);

    // Hit tester simulates 3D building mesh:
    // Window opening has no solid geometry (or only a 0.06m mullion).
    // Surrounding walls are solid boxes.
    bldgMesh.userData.hitTester = (rayOrigin, rayDir, maxDist) => {
        const hits = [];
        // Test intersection with back wall (Z = z - 3.3)
        const wallZ = z - 3.3;
        if (Math.abs(rayDir.z) > 1e-5) {
            const t = (wallZ - rayOrigin.z) / rayDir.z;
            if (t >= 0 && t <= maxDist) {
                const hitPt = rayOrigin.clone().addScaledVector(rayDir, t);
                const localX = hitPt.x - x;
                const localY = hitPt.y - y;
                // Check if hit point is inside the back wall bounds
                if (Math.abs(localX) <= 2.5 && localY >= 0 && localY <= 3.4) {
                    // Check if hit point is inside the window opening: X in [-0.7, 0.7], Y in [1.31, 2.36]
                    const isWinOpening = Math.abs(localX) < 0.7 && localY > 1.31 && localY < 2.36;
                    if (isWinOpening) {
                        // At the center x=0 is the 0.06m mullion bar
                        if (Math.abs(localX) <= 0.03) {
                            hits.push({ distance: t, point: hitPt, object: bldgMesh });
                        }
                        // Open space otherwise (no hit)
                    } else {
                        // Solid wall
                        hits.push({ distance: t, point: hitPt, object: bldgMesh });
                    }
                }
            }
        }

        // Test intersection with left wall (X = x - 2.5)
        const leftWallX = x - 2.5;
        if (Math.abs(rayDir.x) > 1e-5) {
            const t = (leftWallX - rayOrigin.x) / rayDir.x;
            if (t >= 0 && t <= maxDist) {
                const hitPt = rayOrigin.clone().addScaledVector(rayDir, t);
                const localZ = hitPt.z - z;
                const localY = hitPt.y - y;
                if (Math.abs(localZ) <= 3.3 && localY >= 0 && localY <= 3.4) {
                    const isWinOpening = Math.abs(localZ) < 0.75 && localY > 1.31 && localY < 2.36;
                    if (isWinOpening) {
                        if (Math.abs(localZ) <= 0.03) {
                            hits.push({ distance: t, point: hitPt, object: bldgMesh });
                        }
                    } else {
                        hits.push({ distance: t, point: hitPt, object: bldgMesh });
                    }
                }
            }
        }

        // Test intersection with right wall (X = x + 2.5)
        const rightWallX = x + 2.5;
        if (Math.abs(rayDir.x) > 1e-5) {
            const t = (rightWallX - rayOrigin.x) / rayDir.x;
            if (t >= 0 && t <= maxDist) {
                const hitPt = rayOrigin.clone().addScaledVector(rayDir, t);
                const localZ = hitPt.z - z;
                const localY = hitPt.y - y;
                if (Math.abs(localZ) <= 3.3 && localY >= 0 && localY <= 3.4) {
                    const isWinOpening = Math.abs(localZ) < 0.75 && localY > 1.31 && localY < 2.36;
                    if (isWinOpening) {
                        if (Math.abs(localZ) <= 0.03) {
                            hits.push({ distance: t, point: hitPt, object: bldgMesh });
                        }
                    } else {
                        hits.push({ distance: t, point: hitPt, object: bldgMesh });
                    }
                }
            }
        }

        hits.sort((a, b) => a.distance - b.distance);
        return hits;
    };

    const hw = spec.w * 0.5;
    const hl = spec.l * 0.5;
    const wt = spec.wallThick;
    const flY = spec.floorY;

    const bldgObj = {
        mesh: bldgMesh,
        x, y, z,
        radius: 4.8,
        height: spec.h,
        enterable: true,
        enterableSpec: spec,
        floorHeight: flY,
        ceilingHeight: spec.h,
        box: { minX: -hw, maxX: hw, minZ: -hl, maxZ: hl, c: 1, s: 0, rot: 0 },
        wallBoxes: [
            { minX: -hw, maxX: hw, minZ: -hl, maxZ: -hl + wt },
            { minX: -hw, maxX: -hw + wt, minZ: -hl, maxZ: hl },
            { minX: hw - wt, maxX: hw, minZ: -hl, maxZ: hl },
            { minX: -hw, maxX: -spec.doorW * 0.5, minZ: hl - wt, maxZ: hl },
            { minX: spec.doorW * 0.5, maxX: hw, minZ: hl - wt, maxZ: hl }
        ],
        windows: [
            {
                type: 'back',
                minX: -spec.winW * 0.5 - 0.20,
                maxX: spec.winW * 0.5 + 0.20,
                minY: flY + spec.winSillH - 0.15,
                maxY: flY + spec.winSillH + spec.winH + 0.15,
                minZ: -hl - 0.80,
                maxZ: -hl + wt + 0.80
            },
            {
                type: 'left',
                minX: -hw - 0.80,
                maxX: -hw + wt + 0.80,
                minY: flY + spec.winSillH - 0.15,
                maxY: flY + spec.winSillH + spec.winH + 0.15,
                minZ: -spec.sideWinL * 0.5 - 0.25,
                maxZ: spec.sideWinL * 0.5 + 0.25
            },
            {
                type: 'right',
                minX: hw - wt - 0.80,
                maxX: hw + 0.80,
                minY: flY + spec.winSillH - 0.15,
                maxY: flY + spec.winSillH + spec.winH + 0.15,
                minZ: -spec.sideWinL * 0.5 - 0.25,
                maxZ: spec.sideWinL * 0.5 + 0.25
            }
        ]
    };
    bldgMesh.userData.obstacle = bldgObj;
    return bldgObj;
}

function createRockObstacle(x = 0, y = 0, z = 30, physicalRadius = 2.0, maxCylinderRadius = 4.8) {
    const rockMesh = new MockMesh();
    rockMesh.position.set(x, y, z);
    rockMesh.userData.hitTester = (rayOrigin, rayDir, maxDist) => {
        // Physical rock is a sphere of physicalRadius at (x, y, z)
        const dx = rayOrigin.x - x;
        const dy = rayOrigin.y - y;
        const dz = rayOrigin.z - z;
        const a = rayDir.lengthSq();
        const b = 2 * (dx * rayDir.x + dy * rayDir.y + dz * rayDir.z);
        const c = dx * dx + dy * dy + dz * dz - physicalRadius * physicalRadius;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return [];
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t >= 0 && t <= maxDist) {
            return [{ distance: t, point: rayOrigin.clone().addScaledVector(rayDir, t), object: rockMesh }];
        }
        return [];
    };

    const rockObj = {
        mesh: rockMesh,
        x, y, z,
        radius: maxCylinderRadius, // large bounding footprint radius
        height: 4.4,
        type: 'rock',
        isRock: true
    };
    rockMesh.userData.obstacle = rockObj;
    return rockObj;
}

function createTestHarness() {
    const windowObj = {
        activeEnemyTanks: [],
        worldObstacles: [],
        worldBuildings: [],
        swayTrees: [],
        activeSoldiers: [],
        currentTankId: 'tiger',
        tankState: { x: 0, y: 0, z: 0, heading: 0, hitsCount: 0, isKnockedOut: false, hasTank: true },
        tankRoot: { visible: true },
        soundFX: { playArmorRicochet: () => {}, playImpactExplosion: () => {} },
        scene: { add: () => {}, remove: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {}
    };
    const context = {
        window: windowObj,
        soundFX: windowObj.soundFX,
        document: { getElementById: () => ({ textContent: '', style: {} }) },
        THREE: {
            Vector3,
            Quaternion,
            DodecahedronGeometry: class {
                constructor() {
                    this.attributes = {
                        position: { count: 12, getX: () => 0, getY: () => 0, getZ: () => 0, setXYZ: () => {} }
                    };
                }
                rotateX() { return this; }
                computeVertexNormals() { return this; }
            },
            BoxGeometry: class { rotateX() { return this; } },
            RingGeometry: class { rotateX() { return this; } },
            CylinderGeometry: class { rotateX() { return this; } },
            MeshBasicMaterial: class { constructor() { this.color = { setHex: () => {} }; } },
            MeshLambertMaterial: class { constructor() { this.color = { setHex: () => {} }; } },
            PointLight: class { constructor() { this.position = new Vector3(); } },
            Mesh: MockMesh,
            Raycaster: MockRaycaster,
            AdditiveBlending: 2,
            MathUtils: {
                clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
                lerp: (a, b, t) => a + (b - a) * t,
                degToRad: (deg) => deg * Math.PI / 180
            }
        },
        createHaltonSmokeMaterial: () => ({ color: {}, map: null, clone: () => ({ color: {} }) }),
        getTerrainHeight: () => 0,
        setTimeout: () => {},
        clearTimeout: () => {},
        console
    };
    vm.createContext(context);
    vm.runInContext(readScript('physics.js'), context);
    vm.runInContext(readScript('playerSoldier.js'), context);
    return context;
}

test('bullet (tracer) passes through building window without collision', () => {
    const ctx = createTestHarness();
    const { window } = ctx;
    const bldg = createBuildingObstacle(0, 0, 30);
    window.worldObstacles.push(bldg);

    // 1. Tracer aimed directly through the back window opening at x = 0.3, y = 1.8 (window opening is [-0.7, 0.7], Y: [1.31, 2.36])
    window.tracers.push({
        pos: new Vector3(0.3, 1.8, 10),
        vel: new Vector3(0, 0, 500),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });

    ctx.updateProjectiles(0.05); // travels 25m, reaching z = 35 (past the back wall at z = 26.7)

    assert.equal(window.tracers.length, 1, 'Tracer passing through window must not be blocked');
    assert.ok(window.tracers[0].pos.z > 28, 'Tracer should continue past the window into the building');

    // 2. Tracer aimed at the center mullion bar inside the window: must ALSO pass through window!
    window.tracers.length = 0;
    window.tracers.push({
        pos: new Vector3(0, 1.8, 10),
        vel: new Vector3(0, 0, 500),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });

    ctx.updateProjectiles(0.05);
    assert.equal(window.tracers.length, 1, 'Tracer hitting mullion inside window opening must pass through window');

    // 3. Tracer aimed at the solid wall sill below the window (y = 0.5): must be BLOCKED!
    window.tracers.length = 0;
    window.tracers.push({
        pos: new Vector3(0, 0.5, 10),
        vel: new Vector3(0, 0, 500),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });

    ctx.updateProjectiles(0.05);
    assert.equal(window.tracers.length, 0, 'Tracer aimed at solid wall sill below window must be blocked');
});

test('tank cannon shell passes through building window without detonating on window', () => {
    const ctx = createTestHarness();
    const { window } = ctx;
    const bldg = createBuildingObstacle(0, 0, 30);
    window.worldObstacles.push(bldg);

    let detonated = false;
    ctx.triggerHeavyDetonation = () => { detonated = true; };
    window.triggerHeavyDetonation = ctx.triggerHeavyDetonation;

    // Shell fired through window at (x = 0.25, y = 1.8)
    const shellMesh = new MockMesh();
    window.shells.push({
        pos: new Vector3(0.25, 1.8, 10),
        vel: new Vector3(0, 0, 200),
        mesh: shellMesh,
        life: 5.0,
        isEnemy: false
    });

    ctx.updateProjectiles(0.09); // travels 18m, passing back wall at z = 26.7
    assert.equal(detonated, false, 'Cannon shell should not detonate on window');
    assert.equal(window.shells.length, 1, 'Cannon shell should continue flight inside the building');
    assert.ok(window.shells[0].pos.z > 27, 'Cannon shell position should be inside building');

    // Shell fired at solid wall pier beside window (x = 2.0, y = 1.8): must detonate!
    window.shells.length = 0;
    detonated = false;
    window.shells.push({
        pos: new Vector3(2.0, 1.8, 10),
        vel: new Vector3(0, 0, 200),
        mesh: shellMesh,
        life: 5.0,
        isEnemy: false
    });

    ctx.updateProjectiles(0.09);
    assert.equal(detonated, true, 'Cannon shell hitting solid wall beside window must detonate');
    assert.equal(window.shells.length, 0, 'Cannon shell hitting solid wall should be consumed');
});

test('grenade passes through building window without detonating on window', () => {
    const ctx = createTestHarness();
    const { window } = ctx;
    const bldg = createBuildingObstacle(0, 0, 30);
    window.worldObstacles.push(bldg);

    // Grenade thrown from (0.2, 1.8, 20) with slight upward pitch into window at z = 26.7
    const gMesh = new MockMesh();
    window.activeGrenades.push({
        pos: new Vector3(0.2, 1.8, 20),
        vel: new Vector3(0, 2.5, 30),
        rotVel: new Vector3(1, 1, 1),
        mesh: gMesh,
        timer: 4.0,
        owner: 'player'
    });

    window.updateGrenades(0.25); // travels 7.5m, reaching z = 27.5 (inside building past back window)
    assert.equal(window.activeGrenades.length, 1, 'Grenade passing through window should not detonate');
    assert.ok(window.activeGrenades[0].pos.z > 26.8, 'Grenade should have passed through the window');

    // Grenade thrown at solid wall (x = 2.2, y = 1.8): must detonate!
    window.activeGrenades.length = 0;
    window.activeGrenades.push({
        pos: new Vector3(2.2, 1.8, 20),
        vel: new Vector3(0, 0, 30),
        rotVel: new Vector3(1, 1, 1),
        mesh: gMesh,
        timer: 4.0,
        owner: 'player'
    });

    window.updateGrenades(0.25);
    assert.equal(window.activeGrenades.length, 0, 'Grenade impacting solid wall must detonate');
});

test('rock obstacle does not have invisible collision blocking projectiles that miss the mesh', () => {
    const ctx = createTestHarness();
    const { window } = ctx;
    // Rock at (0, 0, 30) with physical rock radius 2.0m, but bounding cylinder radius 4.8m
    const rock = createRockObstacle(0, 0, 30, 2.0, 4.8);
    window.worldObstacles.push(rock);

    // 1. Tracer fired at x = 3.2m (outside the 2.0m physical rock, but inside 4.8m bounding cylinder)
    window.tracers.push({
        pos: new Vector3(3.2, 1.0, 10),
        vel: new Vector3(0, 0, 500),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });

    ctx.updateProjectiles(0.05); // travels 25m to z = 35 past the rock
    assert.equal(window.tracers.length, 1, 'Tracer missing physical rock must NOT hit invisible cylinder');
    assert.ok(window.tracers[0].pos.z > 30, 'Tracer should continue past the rock');

    // 2. Cannon shell fired at x = 3.2m (outside physical rock, inside cylinder)
    let detonated = false;
    ctx.triggerHeavyDetonation = () => { detonated = true; };
    window.triggerHeavyDetonation = ctx.triggerHeavyDetonation;

    window.shells.push({
        pos: new Vector3(3.2, 1.0, 10),
        vel: new Vector3(0, 0, 200),
        mesh: new MockMesh(),
        life: 5.0,
        isEnemy: false
    });

    ctx.updateProjectiles(0.12); // travels 24m past the rock
    assert.equal(detonated, false, 'Cannon shell missing physical rock must NOT hit invisible cylinder');
    assert.equal(window.shells.length, 1, 'Cannon shell should continue past the rock');

    // 3. Grenade thrown at x = 3.2m
    window.activeGrenades.push({
        pos: new Vector3(3.2, 1.0, 20),
        vel: new Vector3(0, 0, 30),
        rotVel: new Vector3(1, 1, 1),
        mesh: new MockMesh(),
        timer: 4.0,
        owner: 'player'
    });

    window.updateGrenades(0.4); // travels 12m to z = 32 past rock
    assert.equal(window.activeGrenades.length, 1, 'Grenade missing physical rock must NOT detonate on invisible cylinder');

    // 4. Projectile aimed directly at the physical rock (x = 0.5, y = 0.5): MUST be blocked!
    window.tracers.length = 0;
    window.tracers.push({
        pos: new Vector3(0.5, 0.5, 10),
        vel: new Vector3(0, 0, 500),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.05);
    assert.equal(window.tracers.length, 0, 'Tracer directly hitting rock mesh must be blocked');
});

test('environment.js exports isPointInObstacleWindow and correctly detects window openings on unrotated and rotated buildings', () => {
    const envSrc = readScript('environment.js');
    const startIdx = envSrc.indexOf('function getGeometryFootprint(geo)');
    const endIdx = envSrc.indexOf('function ensureSharedGeometries()', startIdx);
    const collisionSection = envSrc.slice(startIdx, endIdx);

    const ctx = vm.createContext({
        window: {},
        Math,
        THREE: {
            Vector3,
            BoxGeometry: class {
                constructor() { this.attributes = { position: { count: 0 } }; }
                translate() {}
                rotateY() {}
                computeVertexNormals() {}
            },
            BufferAttribute: class {},
            MeshStandardMaterial: class {},
            Color: class { convertSRGBToLinear() { return this; } }
        }
    });
    vm.runInContext(collisionSection, ctx);
    assert.equal(typeof ctx.window.isPointInObstacleWindow, 'function', 'isPointInObstacleWindow must be exported on window');

    // Test obstacle with windows at (10, 0, 20)
    const bldg = {
        x: 10, y: 0, z: 20,
        box: { c: 1, s: 0, rot: 0 },
        windows: [
            { type: 'back', minX: -0.7, maxX: 0.7, minY: 1.3, maxY: 2.4, minZ: -3.5, maxZ: -3.0 }
        ]
    };

    // Point in window
    assert.equal(ctx.window.isPointInObstacleWindow(bldg, { x: 10.2, y: 1.8, z: 16.8 }), true, 'Point in back window should return true');
    // Point on wall sill below window
    assert.equal(ctx.window.isPointInObstacleWindow(bldg, { x: 10.2, y: 0.8, z: 16.8 }), false, 'Point on wall below window should return false');
    // Point outside building
    assert.equal(ctx.window.isPointInObstacleWindow(bldg, { x: 15.0, y: 1.8, z: 16.8 }), false, 'Point outside window should return false');

    // Rotated building: rotated 90 degrees (c = 0, s = 1)
    const rotatedBldg = {
        x: 0, y: 0, z: 0,
        box: { c: 0, s: 1, rot: Math.PI / 2 },
        windows: [
            { type: 'back', minX: -0.7, maxX: 0.7, minY: 1.3, maxY: 2.4, minZ: -3.5, maxZ: -3.0 }
        ]
    };
    // In local coords, local (x=0, z=-3.3) rotated 90 deg world is (x = -(-3.3) = 3.3, z = 0)
    // l.x = x*c - z*s = 0 - 0 = 0
    // l.z = x*s + z*c = 3.3 * 1 = 3.3? wait, obstacleLocalCoords:
    // dx*c - dz*s and dx*s + dz*c
    const local = ctx.window.obstacleLocalCoords(rotatedBldg, -3.3, 0);
    // dx = -3.3, dz = 0 => l.x = -3.3*0 - 0*1 = 0, l.z = -3.3*1 + 0*0 = -3.3
    assert.ok(Math.abs(local.x) < 0.01 && Math.abs(local.z - (-3.3)) < 0.01, 'obstacleLocalCoords must correctly invert 90 degree rotation');
    assert.equal(ctx.window.isPointInObstacleWindow(rotatedBldg, { x: -3.3, y: 1.8, z: 0 }), true, 'Point in window of rotated building should return true');
});

test('solid house walls reliably block tank shells, bullet tracers, and grenades', () => {
    const ctx = createTestHarness();
    const { window } = ctx;
    const bldg = createBuildingObstacle(0, 0, 30);
    bldg.height = 6.6;
    window.worldObstacles = [bldg];

    // 1. Tank cannon shell fired at solid back wall (x = 1.8, y = 1.5, z = 10 -> heading +Z towards z = 30)
    // Local wall is at z = -3.3 (world z = 26.7). At local x = 1.8 it's solid wall, not window.
    let detonatedPos = null;
    ctx.triggerHeavyDetonation = (pos) => { detonatedPos = pos; };
    window.triggerHeavyDetonation = ctx.triggerHeavyDetonation;

    window.shells.push({
        pos: new Vector3(1.8, 1.5, 10),
        vel: new Vector3(0, 0, 200),
        life: 5.0,
        mesh: new MockMesh(),
        isEnemy: false
    });

    ctx.updateProjectiles(0.1); // travels 20m to z = 30 (crossing wall at 26.7)
    assert.equal(window.shells.length, 0, 'Shell hitting solid wall must be destroyed');
    assert.ok(detonatedPos, 'Shell hitting solid wall must detonate');
    assert.ok(Math.abs(detonatedPos.z - 26.7) < 1.0, 'Shell should detonate near the solid wall');

    // 2. Tank cannon shell fired at the solid wall sill below window (x = 0, y = 0.5, z = 10 -> heading +Z)
    detonatedPos = null;
    window.shells.push({
        pos: new Vector3(0, 0.5, 10),
        vel: new Vector3(0, 0, 200),
        life: 5.0,
        mesh: new MockMesh(),
        isEnemy: false
    });
    ctx.updateProjectiles(0.1);
    assert.equal(window.shells.length, 0, 'Shell hitting below window sill must be destroyed');
    assert.ok(detonatedPos, 'Shell hitting below window sill must detonate');

    // 3. Bullet tracer fired at solid wall beside window (x = 1.8, y = 1.5)
    window.tracers.push({
        pos: new Vector3(1.8, 1.5, 10),
        vel: new Vector3(0, 0, 500),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.06); // travels 30m
    assert.equal(window.tracers.length, 0, 'Bullet hitting solid wall must be blocked');

    // 4. Bullet tracer fired below window sill (x = 0, y = 0.5)
    window.tracers.push({
        pos: new Vector3(0, 0.5, 10),
        vel: new Vector3(0, 0, 500),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.06);
    assert.equal(window.tracers.length, 0, 'Bullet hitting below window sill must be blocked');

    // 5. Grenade thrown at solid wall (x = 1.8, y = 1.5)
    window.activeGrenades.push({
        pos: new Vector3(1.8, 1.5, 20),
        vel: new Vector3(0, 0, 30),
        rotVel: new Vector3(1, 1, 1),
        mesh: new MockMesh(),
        timer: 4.0,
        owner: 'player'
    });
    window.updateGrenades(0.4); // travels 12m to z = 32
    assert.equal(window.activeGrenades.length, 0, 'Grenade hitting solid wall must explode');

    // 6. Test analytical fallback when obs.mesh is completely absent (e.g. headless)
    delete bldg.mesh;
    window.shells.push({
        pos: new Vector3(1.8, 1.5, 10),
        vel: new Vector3(0, 0, 200),
        life: 5.0,
        mesh: new MockMesh(),
        isEnemy: false
    });
    detonatedPos = null;
    ctx.updateProjectiles(0.1);
    assert.equal(window.shells.length, 0, 'Shell must block on analytical wall even without mesh');
    assert.ok(detonatedPos, 'Shell must detonate on analytical wall even without mesh');
});

test('projectiles pass through BOTH left and right side windows, while side walls and sills block', () => {
    const ctx = createTestHarness();
    const { window } = ctx;
    const bldg = createBuildingObstacle(0, 0, 30);
    // Add 2D interior boxes representing furniture along side walls
    bldg.interiorBoxes = [
        { minX: -2.3, maxX: -1.2, minZ: -1.0, maxZ: 1.0 }, // table/bed in front of left window
        { minX: 1.2, maxX: 2.3, minZ: -1.0, maxZ: 1.0 }    // furniture in front of right window
    ];
    window.worldObstacles.push(bldg);

    let detonated = false;
    ctx.triggerHeavyDetonation = () => { detonated = true; };
    window.triggerHeavyDetonation = ctx.triggerHeavyDetonation;

    // --- LEFT SIDE WINDOW (-X at x = -2.5, window in z: [-0.75, 0.75], y: [1.31, 2.36]) ---
    // 1. Tracer through left window from x = -10, y = 1.8, z = 30 heading +X (vel.x = 500)
    window.tracers.push({
        pos: new Vector3(-10, 1.8, 30),
        vel: new Vector3(500, 0, 0),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.03); // travels 15m to x = 5.0 (crossing left wall at -2.5 and right wall at +2.5!)
    assert.equal(window.tracers.length, 1, 'Tracer fired through left window must pass through cleanly');
    assert.ok(window.tracers[0].pos.x > 0, 'Tracer should travel completely through the building');

    // 2. Tank shell through left window from x = -10, y = 1.8, z = 30 heading +X (vel.x = 200)
    window.shells.push({
        pos: new Vector3(-10, 1.8, 30),
        vel: new Vector3(200, 0, 0),
        mesh: new MockMesh(),
        life: 5.0,
        isEnemy: false
    });
    detonated = false;
    ctx.updateProjectiles(0.045); // travels 9m to x = -1.0 (inside building)
    assert.equal(detonated, false, 'Shell should not detonate when passing through left window');
    assert.equal(window.shells.length, 1, 'Shell should remain active inside building');
    assert.ok(window.shells[0].pos.x > -2.0, 'Shell position should be inside building');

    // 3. Grenade through left window from x = -5, y = 1.8, z = 30 heading +X (vel.x = 30)
    window.activeGrenades.push({
        pos: new Vector3(-5, 1.8, 30),
        vel: new Vector3(30, 0, 0),
        rotVel: new Vector3(1, 1, 1),
        mesh: new MockMesh(),
        timer: 4.0,
        owner: 'player'
    });
    window.updateGrenades(0.12); // travels 3.6m to x = -1.4 (inside building)
    assert.equal(window.activeGrenades.length, 1, 'Grenade should pass through left window without exploding');
    assert.ok(window.activeGrenades[0].pos.x > -2.4, 'Grenade should be inside building');

    // 4. Shell hitting Left Wall Sill below window (y = 0.5): must detonate!
    window.shells.length = 0;
    detonated = false;
    window.shells.push({
        pos: new Vector3(-10, 0.5, 30),
        vel: new Vector3(200, 0, 0),
        mesh: new MockMesh(),
        life: 5.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.05);
    assert.equal(detonated, true, 'Shell hitting left wall sill must detonate');
    assert.equal(window.shells.length, 0, 'Shell hitting left wall sill must be destroyed');

    // 5. Shell hitting Left Wall Pier beside window (z = 32.0): must detonate!
    window.shells.length = 0;
    detonated = false;
    window.shells.push({
        pos: new Vector3(-10, 1.8, 32.0),
        vel: new Vector3(200, 0, 0),
        mesh: new MockMesh(),
        life: 5.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.05);
    assert.equal(detonated, true, 'Shell hitting left wall pier beside window must detonate');
    assert.equal(window.shells.length, 0, 'Shell hitting left wall pier must be destroyed');

    // --- RIGHT SIDE WINDOW (+X at x = 2.5, window in z: [-0.75, 0.75], y: [1.31, 2.36]) ---
    // 6. Tracer through right window from x = 10, y = 1.8, z = 30 heading -X (vel.x = -500)
    window.tracers.length = 0;
    window.tracers.push({
        pos: new Vector3(10, 1.8, 30),
        vel: new Vector3(-500, 0, 0),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.03); // travels 15m to x = -5.0
    assert.equal(window.tracers.length, 1, 'Tracer fired through right window must pass through cleanly');
    assert.ok(window.tracers[0].pos.x < 0, 'Tracer should travel completely through right window and out the left window');

    // 7. Tank shell through right window from x = 10, y = 1.8, z = 30 heading -X (vel.x = -200)
    window.shells.length = 0;
    detonated = false;
    window.shells.push({
        pos: new Vector3(10, 1.8, 30),
        vel: new Vector3(-200, 0, 0),
        mesh: new MockMesh(),
        life: 5.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.045); // reaches x = 1.0 (inside building)
    assert.equal(detonated, false, 'Shell should not detonate when passing through right window');
    assert.equal(window.shells.length, 1, 'Shell should remain active inside building');
    assert.ok(window.shells[0].pos.x < 2.0, 'Shell position should be inside building');

    // 8. Grenade through right window from x = 5, y = 1.8, z = 30 heading -X (vel.x = -30)
    window.activeGrenades.length = 0;
    window.activeGrenades.push({
        pos: new Vector3(5, 1.8, 30),
        vel: new Vector3(-30, 0, 0),
        rotVel: new Vector3(1, 1, 1),
        mesh: new MockMesh(),
        timer: 4.0,
        owner: 'player'
    });
    window.updateGrenades(0.12); // reaches x = 1.4 (inside building)
    assert.equal(window.activeGrenades.length, 1, 'Grenade should pass through right window without exploding');
    assert.ok(window.activeGrenades[0].pos.x < 2.4, 'Grenade should be inside building');

    // 9. Shell hitting Right Wall Pier beside window (z = 32.0): must detonate!
    window.shells.length = 0;
    detonated = false;
    window.shells.push({
        pos: new Vector3(10, 1.8, 32.0),
        vel: new Vector3(-200, 0, 0),
        mesh: new MockMesh(),
        life: 5.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.05);
    assert.equal(detonated, true, 'Shell hitting right wall pier beside window must detonate');
    assert.equal(window.shells.length, 0, 'Shell hitting right wall pier must be destroyed');
});

test('tight multi-circle and multi-box collision prevents invisible air blocking around rocks and open arches', () => {
    const envCode = readScript('environment.js');
    const helperMatch = envCode.match(/function getGeometryFootprint[\s\S]*?window\.isPointInObstacleWindow = isPointInObstacleWindow;/);
    assert.ok(helperMatch, 'environment.js should define collision helpers');

    const sandbox = { window: {}, Math };
    vm.createContext(sandbox);
    vm.runInContext(helperMatch[0], sandbox);

    const { attachObstacleCircle, attachObstacleBox, obstaclePushOut, obstacleSegmentEntry } = sandbox.window;

    // 1. Oblong 3-boulder rock cluster: wide along X (~9m), narrow along Z (~4.4m)
    const mockRockGeo = {
        boundingBox: { min: { x: -4.5, y: 0, z: -2.2 }, max: { x: 4.5, y: 3.8, z: 2.2 } },
        computeBoundingBox() {},
        userData: {
            isRock: true,
            useMeshRaycastOnly: true,
            collisionCircles: [
                { x: 0, z: 0, r: 2.15 },
                { x: 2.1, z: 0.7, r: 1.55 },
                { x: -2.2, z: -0.6, r: 1.35 }
            ]
        }
    };
    const rockObs = attachObstacleCircle({ x: 0, y: 0, z: 0, isRock: true, type: 'rock' }, mockRockGeo, 1.0, 0);
    assert.equal(rockObs.useMeshRaycastOnly, true, 'Rock obstacle should preserve useMeshRaycastOnly');
    assert.equal(rockObs.collisionCircles.length, 3, 'Rock obstacle should have 3 tight scaled collision circles');

    // A soldier (pad = 0.42m) standing at (0, 3.2) is well outside the Z=2.15m boulder, even though the old 4.5m maxR circle would have pushed them out!
    const airFlankPush = obstaclePushOut(rockObs, 0, 3.2, 0.42);
    assert.equal(airFlankPush, null, 'Soldier at (0, 3.2) in open air beside narrow Z flank of oblong rock must NOT be blocked');

    // A soldier walking into the actual central boulder at (0, 1.8) MUST be pushed out
    const solidBoulderPush = obstaclePushOut(rockObs, 0, 1.8, 0.42);
    assert.ok(solidBoulderPush !== null, 'Soldier walking into physical rock boulder at (0, 1.8) must be pushed out');

    // 2. Roman Triumphal Arch with 4 pier collision boxes and open central archway (X in [-2.0, 2.0])
    const mockArchGeo = {
        attributes: {
            position: {
                count: 2,
                getX: i => (i ? 8.2 : -8.2),
                getY: () => 1.0,
                getZ: i => (i ? 3.1 : -3.1)
            }
        },
        boundingBox: { min: { x: -8.2, y: 0, z: -3.1 }, max: { x: 8.2, y: 12.6, z: 3.1 } },
        computeBoundingBox() {},
        userData: {
            useMeshRaycastOnly: true,
            collisionBoxes: [
                { minX: -8.0, maxX: -5.6, minZ: -2.8, maxZ: 2.8 },
                { minX: -3.8, maxX: -2.0, minZ: -2.8, maxZ: 2.8 },
                { minX:  2.0, maxX:  3.8, minZ: -2.8, maxZ: 2.8 },
                { minX:  5.6, maxX:  8.0, minZ: -2.8, maxZ: 2.8 }
            ]
        }
    };
    const archObs = attachObstacleBox({ x: 0, y: 0, z: 0, type: 'romanArch' }, mockArchGeo, 1.0, 0);
    // Soldier or tank driving straight through the central archway (x = 0, z = 0) must NOT be blocked
    const archwayCenterPush = obstaclePushOut(archObs, 0, 0, 0.42);
    assert.equal(archwayCenterPush, null, 'Soldier walking through open central archway must NOT be blocked');
    const archwayRay = obstacleSegmentEntry(archObs, 0, -10, 0, 10, 0);
    assert.equal(archwayRay, -1, 'Line of sight through open central archway must NOT be obstructed');

    // Hitting the solid travertine pier at x = 2.9, z = 0 MUST push out and block segment
    const pierPush = obstaclePushOut(archObs, 2.9, 0, 0.42);
    assert.ok(pierPush !== null, 'Soldier walking into solid arch pier at x=2.9 must be pushed out');
    const pierRay = obstacleSegmentEntry(archObs, 2.9, -10, 2.9, 10, 0);
    assert.ok(pierRay > 0 && pierRay < 1, 'Segment hitting solid arch pier must register entry');
});

test('tapered monuments with useMeshRaycastOnly do not block projectiles that miss the 3D mesh, and Greece & Rome zones are defined', () => {
    const ctx = createTestHarness();
    const { window } = ctx;

    // Tapered monument (e.g., Pyramid / Butte / Spire / Parthenon) where 3D mesh at upper altitude is narrower than ground footprint
    const monumentMesh = new MockMesh((origin, dir, far) => {
        // Upper spire/pyramid at y > 4 only occupies radius 1.5m around (0, 30)
        const dz = 30 - origin.z;
        if (dir.z <= 0) return [];
        const t = dz / dir.z;
        if (t < 0 || t > far) return [];
        const hitX = origin.x + dir.x * t;
        const hitY = origin.y + dir.y * t;
        if (Math.abs(hitX) <= 1.5 && hitY <= 12.0) {
            return [{ distance: t, point: new Vector3(hitX, hitY, 30) }];
        }
        return [];
    });

    const monumentObs = {
        mesh: monumentMesh,
        x: 0,
        y: 0,
        z: 30,
        radius: 14.0,
        height: 22.0,
        type: 'pyramid',
        useMeshRaycastOnly: true,
        box: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }
    };
    window.worldObstacles.push(monumentObs);
    window.worldBuildings.push(monumentObs);

    // 1. Tracer fired at x = 6.0, y = 8.0 (misses tapered upper pyramid mesh, though inside [-12, 12] ground box)
    window.tracers.push({
        pos: new Vector3(6.0, 8.0, 10),
        vel: new Vector3(0, 0, 500),
        mesh: new MockMesh(),
        life: 1.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.06);
    assert.equal(window.tracers.length, 1, 'Tracer missing tapered monument 3D mesh must NOT be blocked by ground box');

    // 2. Cannon shell fired at x = 6.0, y = 8.0
    let detonated = false;
    ctx.triggerHeavyDetonation = () => { detonated = true; };
    window.triggerHeavyDetonation = ctx.triggerHeavyDetonation;
    window.shells.push({
        pos: new Vector3(6.0, 8.0, 10),
        vel: new Vector3(0, 0, 200),
        mesh: new MockMesh(),
        life: 5.0,
        isEnemy: false
    });
    ctx.updateProjectiles(0.15);
    assert.equal(detonated, false, 'Shell missing tapered monument 3D mesh must NOT detonate on invisible air');

    // 3. Verify Greece and Rome zones and landmark generators exist in environment.js
    const envCode = readScript('environment.js');
    assert.match(envCode, /id:\s*'greece'/, 'environment.js should define Ancient Greece zone');
    assert.match(envCode, /id:\s*'rome'/, 'environment.js should define Imperial Rome zone');
    assert.match(envCode, /function createGreekParthenonGeometry\b/, 'environment.js should define Parthenon generator');
    assert.match(envCode, /function createGreekTholosGeometry\b/, 'environment.js should define Greek Tholos generator');
    assert.match(envCode, /function createGreekStoaGeometry\b/, 'environment.js should define Greek Stoa generator');
    assert.match(envCode, /function createRomanColosseumGeometry\b/, 'environment.js should define Roman Colosseum generator');
    assert.match(envCode, /function createRomanPantheonGeometry\b/, 'environment.js should define Roman Pantheon generator');
    assert.match(envCode, /function createRomanTriumphalArchGeometry\b/, 'environment.js should define Roman Triumphal Arch generator');
});

test('Egypt pyramid top uses uniform stepped BoxGeometry courses and pyramids/ruins support walkable platforms and height-capped collision', () => {
    const envCode = readScript('environment.js');

    // 1. Verify createEgyptianGreatPyramidGeometry uses uniform stepped BoxGeometry courses all the way to the top (no ConeGeometry / CylinderGeometry casing frustum)
    const pyramidFnMatch = envCode.match(/function createEgyptianGreatPyramidGeometry\b[\s\S]*?return merged;\s*\}/);
    assert.ok(pyramidFnMatch, 'createEgyptianGreatPyramidGeometry must be defined');
    const pyramidFnBody = pyramidFnMatch[0];
    assert.doesNotMatch(pyramidFnBody, /ConeGeometry|CylinderGeometry/, 'Great Pyramid must not use ConeGeometry or CylinderGeometry that causes mismatched top shading');
    assert.match(pyramidFnBody, /stepTiers\s*=\s*38/, 'Great Pyramid should build all 38 stepped limestone courses to the summit');
    assert.match(pyramidFnBody, /walkablePlatforms:/, 'Great Pyramid should define walkablePlatforms for court, socle, and causeway steps');

    // 2. Test height-capped collisionBoxes and walkablePlatforms via environment.js obstaclePushOut & getBuildingFloorHeight
    const helperMatch = envCode.match(/function getGeometryFootprint[\s\S]*?window\.getBuildingFloorHeight = getBuildingFloorHeight;/);
    assert.ok(helperMatch, 'environment.js should define collision & floor height helpers');
    const worldBuildings = [];
    const worldObstacles = [];
    const sandbox = { window: { worldBuildings, worldObstacles }, worldBuildings, worldObstacles, Math };
    vm.createContext(sandbox);
    vm.runInContext(helperMatch[0], sandbox);
    const { window } = sandbox;

    const ruinObs = {
        mesh: { position: { y: 4.85 } },
        x: 20,
        y: 5.0,
        z: 40,
        scale: 1.0,
        rotationY: 0,
        radius: 12.0,
        height: 8.2,
        type: 'colonnade',
        collisionCircles: [
            { x: -3.8, z: 0, r: 1.08 }
        ],
        collisionBoxes: [
            { minX: 3.89, maxX: 5.99, minZ: -3.9, maxZ: -1.3, maxY: 1.38 }
        ],
        walkablePlatforms: [
            { minX: -6.65, maxX: 6.65, minZ: -8.65, maxZ: 8.65, y: 0.70 },
            { minX: 3.89, maxX: 5.99, minZ: -3.9, maxZ: -1.3, y: 1.38 }
        ]
    };
    worldBuildings.push(ruinObs);
    worldObstacles.push(ruinObs);

    // Column blocks soldier at any ground/platform height
    const colPush = window.obstaclePushOut(ruinObs, 20 - 3.8, 40, 0.4, 0.70);
    assert.ok(colPush !== null, 'Colonnade column must block player/enemy movement');

    // Ruined block blocks soldier when walking into its side from low height (relY = 0.2 < 1.38 - 0.65)
    const blockSidePush = window.obstaclePushOut(ruinObs, 20 + 4.94, 40 - 2.6, 0.4, 0.2);
    assert.ok(blockSidePush !== null, 'Ruined sandstone block must block player walking into it from ground level');

    // Ruined block allows soldier to stand on top of it when elevated (relY = 1.35 >= 1.38 - 0.65)
    const blockTopPush = window.obstaclePushOut(ruinObs, 20 + 4.94, 40 - 2.6, 0.4, 1.35);
    assert.equal(blockTopPush, null, 'Soldier standing on top of ruined block must not be pushed off');

    // getBuildingFloorHeight returns platform height (4.85 + 0.70 = 5.55) on colonnade floor, and block height (4.85 + 1.38 = 6.23) on block
    const floorOnPlatform = window.getBuildingFloorHeight(20, 40, 5.0, 5.4);
    assert.ok(Math.abs(floorOnPlatform - 5.55) < 1e-4, 'Soldier must stand solidly on colonnade platform at y = 5.55');

    const floorOnBlock = window.getBuildingFloorHeight(20 + 4.94, 40 - 2.6, 5.0, 6.1);
    assert.ok(Math.abs(floorOnBlock - 6.23) < 1e-4, 'Soldier must stand solidly on top of ruined sandstone block at y = 6.23');
});




