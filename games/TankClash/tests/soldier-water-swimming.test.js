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
}

class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.set(x, y, z, w); }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    copy(q) { return this.set(q.x, q.y, q.z, q.w); }
    clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
    setFromUnitVectors() { return this; }
}

class Euler {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

function makeMockRig() {
    function makeNode(x = 0, y = 0, z = 0) {
        return {
            position: new Vector3(x, y, z),
            rotation: new Euler(),
            quaternion: new Quaternion(),
            updateMatrixWorld() {},
            getWorldQuaternion(q) { return q; },
            getWorldPosition(p) { return p; },
            localToWorld(v) { return v; },
            worldToLocal(v) { return v; },
            attach() {}
        };
    }

    return {
        root: makeNode(),
        hips: makeNode(0, 0.95, 0),
        torso: makeNode(0, 0.34, 0),
        head: makeNode(0, 0.52, 0),
        rightArm: {
            shoulder: makeNode(-0.215, 0.375, -0.005),
            elbow: makeNode(0, -0.265, 0),
            wrist: makeNode(0, -0.24, 0),
            hand: makeNode()
        },
        leftArm: {
            shoulder: makeNode(0.215, 0.375, -0.005),
            elbow: makeNode(0, -0.265, 0),
            wrist: makeNode(0, -0.24, 0),
            hand: makeNode()
        },
        rightLeg: { hipJoint: makeNode(), kneeJoint: makeNode() },
        leftLeg: { hipJoint: makeNode(), kneeJoint: makeNode() },
        rifle: Object.assign(makeNode(0.05, -0.04, 0.06), {
            userData: { muzzleOffset: new Vector3(0, 0.02, 0.6) },
            updateWorldMatrix() {}
        })
    };
}

function createPlayerSoldierContext(terrainFn) {
    const hudArmor = { textContent: '', className: '' };
    const elements = {
        'hud-armor': hudArmor,
        'hud-interact-prompt': { className: 'hidden', style: {}, classList: { add() {}, remove() {} } },
        'btn-interact-action': { addEventListener() {} },
        'soldier-crosshair': { style: {}, classList: { add() {}, remove() {} } }
    };

    let shockwaves = [];

    const windowObj = {
        SEA_LEVEL: -2.5,
        worldObstacles: [],
        worldBuildings: [],
        activeEnemyTanks: [],
        tankState: { x: 0, y: 0, z: 0, heading: 0, hasTank: false },
        camOrbit: { theta: 0, phi: 1.40, distance: 3.2 },
        keys: {},
        getTerrainHeight: terrainFn || (() => 0),
        getBuildingFloorHeight: (x, z, gh) => gh,
        poseSoldierWeapon: () => {},
        spawnShockwave: (pos, rad, dur, col) => {
            shockwaves.push({ pos, rad, dur, col });
        },
        addEventListener() {},
        removeEventListener() {}
    };

    const camera = {
        position: new Vector3(0, 2, -3),
        getWorldDirection(target) { target.set(0, 0, 1); return target; },
        lookAt() {},
        updateMatrixWorld() {}
    };

    const context = {
        window: windowObj,
        document: {
            getElementById: (id) => elements[id] || null,
            createElement: () => ({ style: {}, className: '', classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {} }),
            body: { appendChild() {} }
        },
        setTimeout: () => {},
        clearTimeout: () => {},
        performance: { now: () => 1000 },
        THREE: {
            Vector3,
            Quaternion,
            Euler,
            MathUtils: {
                clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
                lerp: (a, b, t) => a + (b - a) * t,
                degToRad: (deg) => deg * Math.PI / 180
            }
        },
        console
    };

    vm.createContext(context);
    vm.runInContext(readScript('playerSoldier.js'), context);

    return { context, window: windowObj, camera, shockwaves, hudArmor };
}

test('soldier in deep water enters swimming state and moves freely without being blocked', () => {
    // Water level is -2.5. Terrain is at -4.5 (deep sea, waterDepth = 2.0m)
    const { context, window, camera } = createPlayerSoldierContext((x, z) => -4.5);

    const rig = makeMockRig();
    const soldier = {
        x: 0,
        y: -3.75, // Floating surface
        z: 0,
        vy: 0,
        speed: 0,
        heading: 0,
        health: 100,
        maxHealth: 100,
        isGrounded: false,
        isSwimming: false,
        animTime: 0,
        rig,
        soldierType: 'rifleman'
    };
    context.playerSoldier = soldier;
    window.playerSoldier = soldier;
    context.playerMode = 'soldier';
    window.playerMode = 'soldier';

    // Press 'W' to swim forward
    window.keys['w'] = true;

    // Run physics update for 10 frames (dt = 0.05s)
    for (let i = 0; i < 10; i++) {
        window.updatePlayerSoldier(0.05, camera);
    }

    assert.equal(soldier.isSwimming, true, 'Soldier in deep water (waterDepth >= 1.15) must be swimming');
    assert.equal(soldier.isGrounded, false, 'Swimming soldier must not be grounded');
    assert.ok(Math.abs(soldier.z) > 0.5, 'Soldier must move forward in water (not blocked or stuck!)');
    assert.ok(soldier.speed > 1.0, 'Soldier swim speed should be active');
});

test('buoyancy keeps soldier floating near water surface and prevents sinking to ocean floor', () => {
    // Ocean floor at -8.0m, water level at -2.5m
    const { context, window, camera } = createPlayerSoldierContext((x, z) => -8.0);

    const rig = makeMockRig();
    // Soldier initially submerged below floating level (e.g. at -6.0m)
    const soldier = {
        x: 0,
        y: -6.0,
        z: 0,
        vy: 0,
        speed: 0,
        heading: 0,
        health: 100,
        maxHealth: 100,
        isGrounded: false,
        isSwimming: true,
        animTime: 0,
        rig,
        soldierType: 'rifleman'
    };
    context.playerSoldier = soldier;
    window.playerSoldier = soldier;
    context.playerMode = 'soldier';
    window.playerMode = 'soldier';

    // Update for 1 second of simulation
    for (let i = 0; i < 20; i++) {
        window.updatePlayerSoldier(0.05, camera);
    }

    // Floating target Y is WATER_LEVEL - 1.25 = -3.75
    assert.ok(soldier.y > -4.0, `Soldier should float up near -3.75, actual y: ${soldier.y}`);
    assert.ok(soldier.y < -3.5, `Soldier should not fly into sky, actual y: ${soldier.y}`);
});

test('soldier jump in water gives swim stroke surge', () => {
    const { context, window } = createPlayerSoldierContext((x, z) => -5.0);

    const rig = makeMockRig();
    const soldier = {
        x: 0,
        y: -3.75,
        z: 0,
        vy: 0,
        speed: 0,
        isGrounded: false,
        isSwimming: true,
        lastJumpTime: 0,
        rig
    };
    context.playerSoldier = soldier;
    window.playerSoldier = soldier;
    context.playerMode = 'soldier';
    window.playerMode = 'soldier';

    window.soldierJump();
    assert.ok(soldier.vy > 3.0, 'Jump while swimming should give upward surface stroke velocity');
});

test('procedural bone animation applies swimming flutter kick and torso lean', () => {
    const { context, window, camera } = createPlayerSoldierContext((x, z) => -5.0);

    const rig = makeMockRig();
    const soldier = {
        x: 0,
        y: -3.75,
        z: 0,
        vy: 0,
        speed: 2.5,
        heading: 0,
        health: 100,
        maxHealth: 100,
        isGrounded: false,
        isSwimming: true,
        animTime: 1.0,
        rig,
        soldierType: 'rifleman'
    };
    context.playerSoldier = soldier;
    window.playerSoldier = soldier;
    context.playerMode = 'soldier';
    window.playerMode = 'soldier';

    window.keys['w'] = true;
    for (let i = 0; i < 5; i++) {
        window.updatePlayerSoldier(0.05, camera);
    }

    // Swimming flutter kick alternates: average leg angle is extended backward (>0.3), and at least one leg is extended (>0.35)
    const avgLegRot = (rig.rightLeg.hipJoint.rotation.x + rig.leftLeg.hipJoint.rotation.x) * 0.5;
    assert.ok(avgLegRot > 0.25, `Average leg extension should be backward in swimming posture, got ${avgLegRot}`);
    assert.ok(Math.max(rig.rightLeg.hipJoint.rotation.x, rig.leftLeg.hipJoint.rotation.x) > 0.35, 'At least one leg should be kicking backward');
    // Torso should lean forward into water
    assert.ok(rig.torso.rotation.x < -0.15, 'Swimmer torso should lean forward in water');
});

test('getPlayerRespawnPosition prioritizes dry land and keeps safe float Y in water', () => {
    const envSrc = readScript('environment.js');
    const startIdx = envSrc.indexOf('function getPlayerRespawnPosition()');
    const endIdx = envSrc.indexOf('window.getPlayerRespawnPosition = getPlayerRespawnPosition;', startIdx);
    const code = envSrc.slice(startIdx, endIdx);

    // Island with water: terrain is dry (0.5m) to the north (z > 0), water (-4.5m) to the south (z < 0)
    const ctx = vm.createContext({
        window: {
            SEA_LEVEL: -2.5,
            worldObstacles: [],
            activeEnemyTanks: [],
            lastPlayerDeathPosition: { x: 0, z: 0, heading: 0 } // facing north (+Z)
        },
        getTerrainHeight: (x, z) => (z < 0 ? -4.5 : 1.5),
        Math
    });

    vm.runInContext(code, ctx);
    const spawnPos = ctx.getPlayerRespawnPosition();

    // Directly behind facing north is -Z (south, water). But land is north (+Z) or sides.
    // getPlayerRespawnPosition must pick a candidate on dry land!
    assert.ok(spawnPos.y >= -2.0, `Spawn Y should be on dry land, got ${spawnPos.y}`);

    // If completely surrounded by deep water:
    ctx.getTerrainHeight = () => -6.0;
    const waterSpawnPos = ctx.getPlayerRespawnPosition();
    // Must return safe floating surface Y (-3.75), not seabed (-6.0)
    assert.ok(waterSpawnPos.y >= -2.5 - 1.25, `Water spawn Y should float at surface, got ${waterSpawnPos.y}`);
});
