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
    crossVectors(a, b) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
    lerpVectors(a, b, t) {
        return this.set(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + (b.z - a.z) * t
        );
    }
}

class Euler {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    copy(q) { return this.set(q.x, q.y, q.z, q.w); }
    clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
    invert() { return this; }
    multiply(q) { return this; }
    setFromUnitVectors() { return this; }
    setFromRotationMatrix() { return this; }
    setFromEuler() { return this; }
    slerpQuaternions(a, b, t) { return this; }
}

class Matrix4 {
    makeBasis() { return this; }
    lookAt() { return this; }
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
            worldToLocal(v) { return v; }
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

function createPlayerContext() {
    const window = {
        worldObstacles: [],
        worldBuildings: [],
        swayTrees: [],
        activeSoldiers: [],
        activeEnemyTanks: [],
        activeGrenades: [],
        tankState: { x: 0, z: 0, heading: 0 },
        getTerrainHeight: (x, z) => 0,
        addEventListener() {},
        removeEventListener() {}
    };
    const context = {
        window,
        document: { getElementById: () => null },
        setTimeout: (cb) => { cb(); },
        clearTimeout: () => {},
        THREE: {
            Vector3,
            Euler,
            Quaternion,
            Matrix4,
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
    return context;
}

test('player soldier is blocked by building obstacles', () => {
    const ctx = createPlayerContext();
    const resolve = ctx.window.resolveSoldierObstacleCollisions;
    assert.equal(typeof resolve, 'function', 'resolveSoldierObstacleCollisions must be exposed on window');

    // Place a building at (10, 0, 10) with radius 5.0
    ctx.window.worldObstacles = [{ x: 10, y: 0, z: 10, radius: 5.0, height: 6.0, type: 'cottage' }];

    // Player tries to walk inside the building to (10, 0, 12) (distance = 2m < 5.4m min clearance)
    const soldier = { x: 10, y: 0, z: 12 };
    resolve(soldier);

    const dist = Math.hypot(soldier.x - 10, soldier.z - 10);
    assert.ok(dist >= 5.4 - 0.01, `Soldier should be pushed outside building radius 5.0 + 0.4: got dist=${dist}`);
});

test('player soldier is blocked by rock obstacles', () => {
    const ctx = createPlayerContext();
    const resolve = ctx.window.resolveSoldierObstacleCollisions;

    // Rock at (-20, 0, 15) with radius 4.8
    ctx.window.worldObstacles = [{ x: -20, y: 0, z: 15, radius: 4.8, height: 4.0, type: 'rock' }];

    const soldier = { x: -20, y: 0, z: 16 };
    resolve(soldier);

    const dist = Math.hypot(soldier.x - (-20), soldier.z - 15);
    assert.ok(dist >= 5.2 - 0.01, `Soldier should be pushed outside rock radius 4.8 + 0.4: got dist=${dist}`);
});

test('player soldier is blocked by trees', () => {
    const ctx = createPlayerContext();
    const resolve = ctx.window.resolveSoldierObstacleCollisions;

    // Tree at (5, 0, 5) with scale 1.0, radius 1.2
    ctx.window.swayTrees = [{ x: 5, y: 0, z: 5, radius: 1.2, scale: 1.0, trunkHeight: 5.0, isFallen: false }];

    const soldier = { x: 5, y: 0, z: 5.2 };
    resolve(soldier);

    const dist = Math.hypot(soldier.x - 5, soldier.z - 5);
    // trunkRadius = 0.54 + soldierRadius = 0.40 -> ~0.94m
    assert.ok(dist >= 0.90, `Soldier should be pushed outside tree trunk: got dist=${dist}`);
});

test('player grenade is blocked by obstacles and detonates on impact', () => {
    const ctx = createPlayerContext();
    let detonationTriggered = false;
    let detonatedPos = null;
    ctx.window.triggerHeavyDetonation = (pos) => {
        detonationTriggered = true;
        detonatedPos = pos.clone();
    };

    // Building at (0, 0, 10) with radius 4.0
    ctx.window.worldObstacles = [{ x: 0, y: 0, z: 10, radius: 4.0, height: 6.0, type: 'bunker' }];

    // Active grenade flying straight toward the building
    const grenadeMesh = { position: new Vector3(), rotation: new Euler() };
    const grenade = {
        mesh: grenadeMesh,
        pos: new Vector3(0, 2.0, 9.8), // Inside obstacle bounding radius
        vel: new Vector3(0, 0, 15.0),
        rotVel: new Vector3(),
        timer: 3.0,
        exploded: false,
        isPlayerGrenade: true
    };
    ctx.window.activeGrenades.push(grenade);

    ctx.window.updateGrenades(0.05);

    assert.equal(detonationTriggered, true, 'Grenade must detonate upon impacting building');
    assert.equal(grenade.exploded, true, 'Grenade state must be exploded');
});

test('player grenade is blocked by trees and detonates', () => {
    const ctx = createPlayerContext();
    let detonationTriggered = false;
    ctx.window.triggerHeavyDetonation = () => {
        detonationTriggered = true;
    };

    ctx.window.swayTrees = [{ x: 0, y: 0, z: 8, radius: 1.5, scale: 1.0, trunkHeight: 6.0, isFallen: false }];

    const grenadeMesh = { position: new Vector3(), rotation: new Euler() };
    const grenade = {
        mesh: grenadeMesh,
        pos: new Vector3(0, 1.8, 7.8),
        vel: new Vector3(0, 0, 12.0),
        rotVel: new Vector3(),
        timer: 3.0,
        exploded: false,
        isPlayerGrenade: true
    };
    ctx.window.activeGrenades.push(grenade);

    ctx.window.updateGrenades(0.05);

    assert.equal(detonationTriggered, true, 'Grenade must detonate upon hitting tree');
});

test('player delegates the normal weapon pose while retaining the grenade throw', () => {
    const playerSrc = readScript('playerSoldier.js');
    assert.match(playerSrc, /if \(isThrowingGrenade\) \{\s*rig\.rightArm\.shoulder\.rotation\.set/);
    assert.match(playerSrc, /window\.poseSoldierWeapon\(rig, camLookDir, camTheta\)/);
});

test('enemy initializes its shared pose and retains low-ready, aiming, recoil and far-frame behavior', () => {
    const ctx = createPlayerContext();
    const rig = makeMockRig();
    rig.root.userData = {};
    const poses = [];
    ctx.window.makeTestRig = () => rig;
    ctx.window.poseSoldierWeapon = (posedRig, direction, heading, recoil) => {
        poses.push({ rig: posedRig, direction: direction.clone(), heading, recoil });
    };
    const source = readScript('soldiers.js')
        .replace('this.rig = buildSoldier(this.faction, this.soldierType);', 'this.rig = window.makeTestRig();')
        .replace('window.spawnBattlefieldInfantry = spawnBattlefieldInfantry;', 'window.TestSoldierAI = SoldierAI;');
    vm.runInContext(source, ctx);

    const soldier = new ctx.window.TestSoldierAI(1, 'german', 10, 20, { heading: Math.PI / 2 });
    assert.equal(poses.length, 1, 'new soldiers receive a pose even if their first frame is distant');
    assert.equal(poses[0].rig, rig);
    assert.ok(Math.abs(poses[0].direction.x - 1 / Math.hypot(1, 0.52)) < 1e-10);
    assert.ok(Math.abs(poses[0].direction.y + 0.52 / Math.hypot(1, 0.52)) < 1e-10);
    assert.equal(poses[0].recoil, 0);

    soldier.currentTarget = { x: 10, y: 3.25, z: 30 };
    soldier.aimWeight = 1;
    soldier.recoilKick = 0.4;
    soldier.animateJoints(false, 0.016);
    assert.equal(poses.length, 2);
    assert.ok(Math.abs(poses[1].direction.x) < 1e-10);
    assert.ok(Math.abs(poses[1].direction.y - 2 / Math.hypot(2, 10)) < 1e-10);
    assert.ok(Math.abs(poses[1].direction.z - 10 / Math.hypot(2, 10)) < 1e-10);
    assert.equal(poses[1].heading, Math.PI / 2);
    assert.equal(poses[1].recoil, 0.4);
    assert.equal(rig.torso.rotation.y, -0.4);
    assert.equal(rig.head.rotation.y, 0.4);

    soldier.aimWeight = 0.5;
    soldier.animateJoints(false, 0.016);
    assert.ok(poses[2].direction.x > 0 && poses[2].direction.z > 0, 'aim blends patrol and target directions');
    soldier.animateJoints(true, 0.016);
    assert.equal(poses.length, 3, 'distant frames skip the upper-body solver');
});
