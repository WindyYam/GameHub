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
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    lengthSq() { return this.dot(this); }
    length() { return Math.sqrt(this.lengthSq()); }
    normalize() { const n = this.length(); return n ? this.multiplyScalar(1 / n) : this; }
    distanceToSquared(v) {
        const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
        return dx * dx + dy * dy + dz * dz;
    }
    lerp(v, t) {
        return this.set(
            this.x + (v.x - this.x) * t,
            this.y + (v.y - this.y) * t,
            this.z + (v.z - this.z) * t
        );
    }
}

class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.set(x, y, z, w); }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    setFromUnitVectors() { return this; }
}

class MockGeo {
    constructor() { this.attributes = { position: { array: [] } }; }
    rotateX() { return this; }
}
class MockMaterial {
    constructor(cfg) { this.color = { setHex: () => {} }; }
}
class MockLight {
    constructor() { this.position = new Vector3(); }
}
class MockMesh {
    constructor() {
        this.position = new Vector3();
        this.quaternion = new Quaternion();
        this.scale = new Vector3(1, 1, 1);
        this.visible = true;
    }
}
class MockRaycaster {
    constructor() { this.far = 100; }
    set() {}
    intersectObject() { return []; }
}

function createPhysicsContext() {
    const soundFX = {
        playArmorRicochet: () => {},
        playImpactExplosion: () => {}
    };
    const windowObj = {
        activeEnemyTanks: [],
        worldObstacles: [],
        worldBuildings: [],
        swayTrees: [],
        activeSoldiers: [],
        currentTankId: 'tiger',
        tankState: { x: 0, y: 0, z: 0, heading: 0, hitsCount: 0, isKnockedOut: false, hasTank: true },
        tankRoot: { visible: true },
        soundFX,
        scene: {
            add: () => {},
            remove: () => {}
        }
    };
    const context = {
        window: windowObj,
        soundFX,
        document: { getElementById: () => ({ textContent: '', style: {} }) },
        THREE: {
            Vector3,
            Quaternion,
            DodecahedronGeometry: MockGeo,
            BoxGeometry: MockGeo,
            RingGeometry: MockGeo,
            CylinderGeometry: MockGeo,
            MeshBasicMaterial: MockMaterial,
            PointLight: MockLight,
            Mesh: MockMesh,
            Raycaster: MockRaycaster,
            AdditiveBlending: 2,
            MathUtils: {
                clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
                lerp: (a, b, t) => a + (b - a) * t,
                degToRad: (deg) => deg * Math.PI / 180
            }
        },
        getTerrainHeight: (x, z) => 0,
        console
    };
    vm.createContext(context);
    vm.runInContext(readScript('physics.js'), context);
    return context;
}

test('physics.js cannon shells are blocked by enemy tank wrecks and player tank wrecks', () => {
    const ctx = createPhysicsContext();
    const { window } = ctx;

    let detonationTriggered = false;
    let detonationPos = null;
    ctx.triggerHeavyDetonation = (pos) => {
        detonationTriggered = true;
        detonationPos = pos.clone();
    };
    window.triggerHeavyDetonation = ctx.triggerHeavyDetonation;

    // Place destroyed enemy tank at (0, 0, 50)
    window.activeEnemyTanks = [{
        x: 0, y: 0, z: 50,
        heading: 0,
        isDestroyed: true,
        tankType: 'tiger'
    }];

    // Player shell flying towards (0, 0, 50) from (0, 1.5, 40)
    const shellMesh = { position: new Vector3(), quaternion: new Quaternion(), visible: true };
    window.shells.push({
        pos: new Vector3(0, 1.5, 40),
        vel: new Vector3(0, 0, 50),
        life: 2.0,
        isEnemy: false,
        mesh: shellMesh
    });

    // Update projectiles for dt = 0.3s (travels 15m, past z=50)
    window.updateProjectiles(0.3);

    assert.equal(detonationTriggered, true, 'Detonation must be triggered on hitting tank wreck');
    assert.ok(Math.abs(detonationPos.z - 50) <= 3.5, `Impact point should be on the wreck hull: ${detonationPos.z}`);
    assert.equal(window.shells.length, 0, 'Shell must be destroyed upon impact with wreck, not pass through');
});

test('physics.js enemy cannon shells are blocked by destroyed enemy tank wrecks', () => {
    const ctx = createPhysicsContext();
    const { window } = ctx;

    let detonationTriggered = false;
    ctx.triggerHeavyDetonation = () => { detonationTriggered = true; };
    window.triggerHeavyDetonation = ctx.triggerHeavyDetonation;

    // Destroyed enemy tank wreck sits between enemy shooter and player
    window.activeEnemyTanks = [{
        x: 0, y: 0, z: 25,
        heading: 0,
        isDestroyed: true,
        tankType: 'tiger'
    }];

    // Enemy shell flying towards player at z=0 from z=35
    const shellMesh = { position: new Vector3(), quaternion: new Quaternion(), visible: true };
    window.shells.push({
        pos: new Vector3(0, 1.5, 35),
        vel: new Vector3(0, 0, -40),
        life: 2.0,
        isEnemy: true,
        mesh: shellMesh
    });

    window.updateProjectiles(0.3);

    assert.equal(detonationTriggered, true, 'Enemy shell must detonate upon hitting enemy wreck');
    assert.equal(window.shells.length, 0, 'Enemy shell must be blocked by wreck');
});

test('physics.js tracers (bullets) are blocked by tank wrecks with armor ricochet sparks', () => {
    const ctx = createPhysicsContext();
    const { window } = ctx;

    let ricochetSoundPlayed = false;
    let sparkSpawned = false;
    window.soundFX.playArmorRicochet = () => { ricochetSoundPlayed = true; };
    ctx.spawnParticle = (pos, vel, col, size, endSize, life, isSpark, type) => {
        if (type === 'spark') sparkSpawned = true;
    };

    // Tank wreck at (0, 0, 20)
    window.activeEnemyTanks = [{
        x: 0, y: 0, z: 20,
        heading: 0,
        isDestroyed: true,
        tankType: 'tiger'
    }];

    // Tracer flying from z=15 through wreck at z=20
    const trMesh = { position: new Vector3(), quaternion: new Quaternion(), visible: true };
    window.tracers.push({
        pos: new Vector3(0, 1.5, 15),
        vel: new Vector3(0, 0, 100),
        life: 1.0,
        isEnemy: false,
        mesh: trMesh
    });

    window.updateProjectiles(0.1);

    assert.equal(ricochetSoundPlayed, true, 'Ricochet sound must be played when bullet hits tank wreck');
    assert.equal(sparkSpawned, true, 'Sparks must spawn when bullet hits tank wreck');
    assert.equal(window.tracers.length, 0, 'Tracer must be terminated and not pass through tank wreck');
});

test('playerSoldier.js grenades detonate upon impact with tank wrecks', () => {
    let tankDamage = null;
    const windowObj = {
        activeEnemyTanks: [
            {
                x: 0, y: 0, z: 15,
                isDestroyed: true,
                tankType: 'tiger'
            },
            {
                x: 0, y: 0, z: 15.5,
                isDestroyed: false,
                tankType: 'sherman',
                onHit(_impactPos, _hitDir, damage) { tankDamage = damage; }
            }
        ],
        worldObstacles: [],
        worldBuildings: [],
        swayTrees: [],
        activeSoldiers: [],
        activeGrenades: [],
        tankState: { x: 0, z: 0, heading: 0 },
        getTerrainHeight: () => -100, // Ground far below
        addEventListener() {},
        removeEventListener() {}
    };
    let detonationTriggered = false;
    windowObj.triggerHeavyDetonation = () => { detonationTriggered = true; };

    const context = {
        window: windowObj,
        document: { getElementById: () => null },
        setTimeout: (cb) => { cb(); },
        clearTimeout: () => {},
        THREE: {
            Vector3,
            Quaternion,
            MathUtils: {
                clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
                lerp: (a, b, t) => a + (b - a) * t,
                degToRad: (deg) => deg * Math.PI / 180
            }
        },
        performance: { now: () => 1000 },
        console
    };
    vm.createContext(context);
    vm.runInContext(readScript('playerSoldier.js'), context);

    // Add active grenade moving towards the wreck at (0, 0, 15)
    const grenadeMesh = {
        position: new Vector3(0, 1.0, 14.5),
        rotation: new Vector3(),
        visible: true
    };
    windowObj.activeGrenades.push({
        pos: new Vector3(0, 1.0, 14.5),
        vel: new Vector3(0, 0, 10),
        rotVel: new Vector3(0.5, 0.5, 0),
        timer: 3.0,
        mesh: grenadeMesh,
        isPlayerGrenade: true
    });

    windowObj.updateGrenades(0.1);

    assert.equal(detonationTriggered, true, 'Grenade must detonate upon impacting tank wreck');
    assert.equal(tankDamage, 0.5, 'Grenade must deal only 0.5 armor damage to a nearby live tank');
    assert.equal(windowObj.activeGrenades.length, 0, 'Grenade must be removed from active grenades upon exploding on wreck');
});

test('playerSoldier.js resolveSoldierObstacleCollisions blocks player soldier from passing through enemy tank wreck', () => {
    const windowObj = {
        activeEnemyTanks: [{
            x: 0, y: 0, z: 10,
            heading: 0,
            isDestroyed: true,
            tankType: 'tiger'
        }],
        worldObstacles: [],
        worldBuildings: [],
        swayTrees: [],
        activeSoldiers: [],
        activeGrenades: [],
        tankState: { x: 100, z: 100, heading: 0, hasTank: false },
        getTerrainHeight: () => 0,
        addEventListener() {},
        removeEventListener() {}
    };
    const context = {
        window: windowObj,
        document: { getElementById: () => null },
        setTimeout: (cb) => { cb(); },
        clearTimeout: () => {},
        THREE: {
            Vector3,
            Quaternion,
            MathUtils: {
                clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
                lerp: (a, b, t) => a + (b - a) * t
            }
        },
        performance: { now: () => 1000 },
        console
    };
    vm.createContext(context);
    vm.runInContext(readScript('playerSoldier.js'), context);

    const resolve = windowObj.resolveSoldierObstacleCollisions;
    assert.equal(typeof resolve, 'function');

    // Soldier tries to walk to (1.0, 0, 10), inside the tank's side hull (halfW = 1.80, soldierRadius = 0.40 -> min clearance = 2.20)
    const soldier = { x: 1.0, y: 0, z: 10 };
    resolve(soldier);

    // Soldier must be pushed outside the wreck's hull boundary
    assert.ok(soldier.x >= 2.19, `Soldier must be blocked outside tank wreck lateral boundary (expected >= 2.19, got ${soldier.x})`);
});

test('playerSoldier.js resolveSoldierObstacleCollisions blocks player soldier from passing through knocked out player tank wreck', () => {
    const windowObj = {
        activeEnemyTanks: [],
        worldObstacles: [],
        worldBuildings: [],
        swayTrees: [],
        activeSoldiers: [],
        activeGrenades: [],
        tankState: { x: 0, y: 0, z: 0, heading: 0, isKnockedOut: true, hasTank: true },
        tankRoot: { visible: true },
        playerMode: 'soldier',
        getTerrainHeight: () => 0,
        addEventListener() {},
        removeEventListener() {}
    };
    const context = {
        window: windowObj,
        document: { getElementById: () => null },
        setTimeout: (cb) => { cb(); },
        clearTimeout: () => {},
        THREE: {
            Vector3,
            Quaternion,
            MathUtils: {
                clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
                lerp: (a, b, t) => a + (b - a) * t
            }
        },
        performance: { now: () => 1000 },
        console
    };
    vm.createContext(context);
    vm.runInContext(readScript('playerSoldier.js'), context);

    const resolve = windowObj.resolveSoldierObstacleCollisions;

    // Soldier tries to walk to front of knocked out player tank (0, 0, 2.5) where halfL = 3.30 + 0.40 = 3.70
    const soldier = { x: 0, y: 0, z: 2.5 };
    resolve(soldier);

    assert.ok(soldier.z >= 3.69, `Soldier must be blocked outside knocked out player tank wreck (expected >= 3.69, got ${soldier.z})`);
});

test('enemyAI.js checkObstacleLineOfSight is blocked by tank wrecks', () => {
    const windowObj = {
        worldObstacles: [],
        tankState: { x: 0, y: 0, z: 0 }
    };
    const context = {
        window: windowObj,
        document: { getElementById: () => null },
        THREE: {
            Vector3,
            MathUtils: {
                clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
                lerp: (a, b, t) => a + (b - a) * t
            }
        },
        console
    };
    vm.createContext(context);
    vm.runInContext(readScript('enemyAI.js'), context);

    const checkLOS = windowObj.checkObstacleLineOfSight;
    assert.equal(typeof checkLOS, 'function', 'checkObstacleLineOfSight should be exposed on window');

    windowObj.activeEnemyTanks.push({
        x: 0, y: 0, z: 10,
        isDestroyed: true
    });

    // Looking from (0, 0) to (0, 20) with tank wreck at (0, 10)
    const hasSight = checkLOS(0, 0, 0, 20);
    assert.equal(hasSight, false, 'Line of sight between shooter and target must be blocked by tank wreck');

    // Looking along a clear path at x=20
    const clearSight = checkLOS(20, 0, 20, 20);
    assert.equal(clearSight, true, 'Line of sight must be clear when no tank wreck or obstacle intervenes');
});

test('main.js contains tank vs tank wreck collision resolution stopping player tank passthrough', () => {
    const mainSrc = readScript('main.js');
    assert.ok(mainSrc.includes('TANK VS TANK WRECK COLLISION'), 'main.js must contain tank vs tank wreck collision block');
    assert.ok(mainSrc.includes('wreck.isDestroyed'), 'main.js must check destroyed tank wrecks');
    assert.ok(mainSrc.includes('tankState.speed *= 0.6'), 'main.js must decelerate tank on impact with wreck');
});

