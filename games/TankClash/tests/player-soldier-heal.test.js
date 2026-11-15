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
    crossVectors(a, b) {
        this.x = a.y * b.z - a.z * b.y;
        this.y = a.z * b.x - a.x * b.z;
        this.z = a.x * b.y - a.y * b.x;
        return this;
    }
    applyQuaternion(q) { return this; }
}

class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.set(x, y, z, w); }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    copy(q) { return this.set(q.x, q.y, q.z, q.w); }
    clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
    setFromUnitVectors() { return this; }
    invert() { return this; }
    multiply() { return this; }
    setFromAxisAngle() { return this; }
    setFromRotationMatrix() { return this; }
    setFromEuler() { return this; }
    slerpQuaternions() { return this; }
}

class Euler {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
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

function createPlayerSoldierContext() {
    const hudArmor = { textContent: '', className: '' };
    const promptEl = { id: 'hud-interact-prompt', className: 'hidden', style: {}, classList: { add() {}, remove() {} }, appendChild() {} };
    const elements = {
        'hud-armor': hudArmor,
        'hud-interact-prompt': promptEl,
        'btn-interact-action': { addEventListener() {} },
        'soldier-crosshair': { style: {} }
    };

    const windowObj = {
        activeEnemyTanks: [],
        worldObstacles: [],
        worldBuildings: [],
        swayTrees: [],
        activeSoldiers: [],
        activeGrenades: [],
        tankState: { x: 0, z: 0, heading: 0, hasTank: false },
        getTerrainHeight: () => 0,
        addEventListener() {},
        removeEventListener() {}
    };

    const context = {
        window: windowObj,
        document: {
            getElementById: (id) => elements[id] || null,
            createElement: () => ({ style: {}, className: '', classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {} }),
            body: { appendChild() {} }
        },
        setTimeout: (cb) => { cb(); },
        clearTimeout: () => {},
        THREE: {
            Vector3,
            Quaternion,
            Euler,
            Matrix4,
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
    vm.runInContext(readScript('soldierGrip.js'), context);
    vm.runInContext(readScript('playerSoldier.js'), context);
    return { context, window: windowObj, hudArmor };
}

function makeMockSoldier(overrides = {}) {
    return Object.assign({
        health: 80,
        maxHealth: 100,
        healTimer: 0,
        isDead: false,
        invulnerableTimer: 0,
        animTime: 0,
        fireCooldown: 0,
        recoilKick: 0,
        soldierType: 'rifleman',
        x: 0,
        y: 0,
        z: 0,
        heading: 0,
        speed: 0,
        rig: makeMockRig()
    }, overrides);
}

const mockCam = {
    getWorldDirection: (target) => target.set(0, 0, 1),
    position: new Vector3(0, 2, -3),
    lookAt() {},
    updateMatrixWorld() {}
};

test('right elbow flares outward while preserving both arm segment lengths', () => {
    const { window } = createPlayerSoldierContext();
    const shoulder = new Vector3(-0.215, 0.375, -0.005);
    const wrist = new Vector3(-0.1224, 0.4052, 0.2035);
    const elbow = window.getSoldierRightElbowPosition(shoulder, wrist);

    assert.ok(elbow.x < shoulder.x - 0.1, 'Right elbow should extend outward from the shoulder');
    assert.ok(Math.abs(elbow.clone().sub(shoulder).length() - 0.265) < 1e-10);
    assert.ok(Math.abs(elbow.clone().sub(wrist).length() - 0.24) < 1e-10);
});

test('player soldier heals 1hp every 1 second when no enemy has detected the player', () => {
    const { window, hudArmor } = createPlayerSoldierContext();
    window.playerMode = 'soldier';
    const s = makeMockSoldier({ health: 50, maxHealth: 100 });
    window.playerSoldier = s;

    // No enemies detected player
    window.activeEnemyTanks = [];
    window.activeSoldiers = [];

    // Advance 0.5s: health should still be 50, healTimer is 0.5
    window.updatePlayerSoldier(0.5, mockCam);
    assert.equal(s.health, 50, 'Health should not change before full 1.0s elapsed');
    assert.ok(Math.abs(s.healTimer - 0.5) < 0.001);

    // Advance another 0.5s (total 1.0s elapsed): health should increase by 1 to 51
    window.updatePlayerSoldier(0.5, mockCam);
    assert.equal(s.health, 51, 'Health should heal 1hp after 1 full second without detection');
    assert.equal(hudArmor.textContent, 'HP: 51/100', 'HUD text should reflect updated HP');
    assert.equal(hudArmor.className, 'text-emerald-400 font-bold', 'HUD color should be emerald green when HP > 40');

    // Advance another 1.0s: health should heal to 52
    window.updatePlayerSoldier(1.0, mockCam);
    assert.equal(s.health, 52, 'Health should heal another 1hp after another 1 second');
    assert.equal(hudArmor.textContent, 'HP: 52/100');
});

test('player soldier does not heal on a bicycle or carry riding time into on-foot healing', () => {
    const { window } = createPlayerSoldierContext();
    window.playerMode = 'soldier';
    const s = makeMockSoldier({ health: 50, maxHealth: 100, healTimer: 0.8 });
    s.isMountedBicycle = true;
    s.currentBicycle = {};
    window.playerSoldier = s;
    window.updateBicycleRider = (soldier) => { soldier.speed = 0; };
    window.activeEnemyTanks = [];
    window.activeSoldiers = [];

    window.updatePlayerSoldier(10, mockCam);
    assert.equal(s.health, 50, 'riding must not regenerate health');
    assert.equal(s.healTimer, 0, 'riding must not accumulate on-foot healing time');

    s.isMountedBicycle = false;
    s.currentBicycle = null;
    window.updatePlayerSoldier(0.5, mockCam);
    assert.equal(s.health, 50, 'dismounting must not trigger delayed healing');
    assert.equal(s.healTimer, 0.5, 'on-foot healing time should start after dismount');

    window.updatePlayerSoldier(0.5, mockCam);
    assert.equal(s.health, 51, 'normal on-foot healing should resume after one second');
});

test('player soldier does not heal past maxHealth (100)', () => {
    const { window } = createPlayerSoldierContext();
    window.playerMode = 'soldier';
    const s = makeMockSoldier({ health: 99, maxHealth: 100 });
    window.playerSoldier = s;

    // Advance 1.0s -> reaches 100
    window.updatePlayerSoldier(1.0, mockCam);
    assert.equal(s.health, 100);

    // Advance another 5.0s -> remains at 100, timer resets
    window.updatePlayerSoldier(5.0, mockCam);
    assert.equal(s.health, 100, 'Health must not exceed maxHealth (100)');
    assert.equal(s.healTimer, 0, 'healTimer must reset when already at maxHealth');
});

test('player soldier does NOT heal when an active enemy tank detected the player', () => {
    const { window } = createPlayerSoldierContext();
    window.playerMode = 'soldier';
    const s = makeMockSoldier({ health: 50, maxHealth: 100, healTimer: 0.8 });
    window.playerSoldier = s;

    // Active enemy tank is engaging the player
    window.activeEnemyTanks = [{
        x: 10, y: 0, z: 10,
        isDestroyed: false,
        state: 'ENGAGING'
    }];

    assert.equal(window.isPlayerDetected(), true, 'isPlayerDetected must return true when enemy tank is engaging');

    // Update for 1.0s
    window.updatePlayerSoldier(1.0, mockCam);
    assert.equal(s.health, 50, 'Player soldier must not heal while detected by enemy tank');
    assert.equal(s.healTimer, 0, 'healTimer must reset to 0 while detected');
});

test('player soldier does NOT heal when an active enemy soldier detected the player', () => {
    const { window } = createPlayerSoldierContext();
    window.playerMode = 'soldier';
    const s = makeMockSoldier({ health: 70, maxHealth: 100 });
    window.playerSoldier = s;

    // Active enemy soldier is targeting player
    window.activeSoldiers = [{
        isEnemy: true,
        isDead: false,
        currentTarget: { type: 'soldier', ref: s }
    }];

    assert.equal(window.isPlayerDetected(), true, 'isPlayerDetected must return true when enemy soldier targets player');

    window.updatePlayerSoldier(1.5, mockCam);
    assert.equal(s.health, 70, 'Player soldier must not heal while detected by enemy soldier');
    assert.equal(s.healTimer, 0, 'healTimer must reset while detected');
});

test('player soldier resumes healing 1s after escaping enemy detection', () => {
    const { window } = createPlayerSoldierContext();
    window.playerMode = 'soldier';
    const s = makeMockSoldier({ health: 60, maxHealth: 100 });
    window.playerSoldier = s;

    const enemyTank = {
        x: 10, y: 0, z: 10,
        isDestroyed: false,
        state: 'ENGAGING'
    };
    window.activeEnemyTanks = [enemyTank];

    // Frame while detected: no heal
    window.updatePlayerSoldier(1.0, mockCam);
    assert.equal(s.health, 60);

    // Player escapes behind cover / breaks sight: enemy tank returns to PATROL
    enemyTank.state = 'PATROL';
    enemyTank.detectionTimer = 0;
    enemyTank.wasHitAlert = false;
    assert.equal(window.isPlayerDetected(), false, 'isPlayerDetected must return false after breaking detection');

    // 0.6s after escape: still 60 HP
    window.updatePlayerSoldier(0.6, mockCam);
    assert.equal(s.health, 60);

    // 0.5s more (total 1.1s after escape): heals to 61 HP!
    window.updatePlayerSoldier(0.5, mockCam);
    assert.equal(s.health, 61, 'Player soldier heals 1hp after 1 second without detection');
});

test('dead player soldier does not heal', () => {
    const { window } = createPlayerSoldierContext();
    window.playerMode = 'soldier';
    const s = makeMockSoldier({ health: 0, isDead: true });
    window.playerSoldier = s;

    window.updatePlayerSoldier(2.0, mockCam);
    assert.equal(s.health, 0, 'Dead player soldier must never heal');
});

test('player soldier does NOT heal while moving even if not detected by enemies', () => {
    const { window } = createPlayerSoldierContext();
    window.playerMode = 'soldier';
    const s = makeMockSoldier({ health: 50, maxHealth: 100, healTimer: 0.8 });
    window.playerSoldier = s;
    window.activeEnemyTanks = [];
    window.activeSoldiers = [];

    // Player is moving via WASD keys
    window.keys = { 'w': true };
    assert.equal(window.isPlayerStandingStill(), false, 'isPlayerStandingStill must return false when keys pressed');

    window.updatePlayerSoldier(1.0, mockCam);
    assert.equal(s.health, 50, 'Player soldier must not heal while moving');
    assert.equal(s.healTimer, 0, 'healTimer must reset to 0 while moving');

    // Advance another 2 seconds while moving
    window.updatePlayerSoldier(2.0, mockCam);
    assert.equal(s.health, 50, 'Player soldier must remain unhealed while continuously moving');
    assert.equal(s.healTimer, 0);
});

test('player soldier resumes healing 1s after standing still', () => {
    const { window, hudArmor } = createPlayerSoldierContext();
    window.playerMode = 'soldier';
    const s = makeMockSoldier({ health: 50, maxHealth: 100 });
    window.playerSoldier = s;
    window.activeEnemyTanks = [];
    window.activeSoldiers = [];

    // Moving first: no heal
    window.keys = { 'w': true };
    window.updatePlayerSoldier(1.0, mockCam);
    assert.equal(s.health, 50);

    // Player stops moving (releases WASD)
    window.keys = {};
    s.speed = 0;
    assert.equal(window.isPlayerStandingStill(), true, 'isPlayerStandingStill must return true when stationary');

    // 0.5s after stopping: health is still 50, healTimer is 0.5
    window.updatePlayerSoldier(0.5, mockCam);
    assert.equal(s.health, 50);
    assert.ok(Math.abs(s.healTimer - 0.5) < 0.001);

    // Another 0.5s after stopping (1.0s total standing still): heals to 51!
    window.updatePlayerSoldier(0.5, mockCam);
    assert.equal(s.health, 51, 'Player soldier must heal 1hp after standing still for 1 full second');
    assert.equal(hudArmor.textContent, 'HP: 51/100');

    // Another 1.0s standing still: heals to 52!
    window.updatePlayerSoldier(1.0, mockCam);
    assert.equal(s.health, 52);
    assert.equal(hudArmor.textContent, 'HP: 52/100');
});
