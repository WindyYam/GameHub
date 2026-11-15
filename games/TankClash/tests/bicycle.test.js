const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8').replace(/\r\n/g, '\n');
}

// Minimal THREE.js mock for headless testing
class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
    sub(v) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
    subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
    addVectors(a, b) { return this.set(a.x + b.x, a.y + b.y, a.z + b.z); }
    distanceTo(v) {
        const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    lerp(v, alpha) {
        this.x += (v.x - this.x) * alpha;
        this.y += (v.y - this.y) * alpha;
        this.z += (v.z - this.z) * alpha;
        return this;
    }
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
    normalize() {
        const l = Math.hypot(this.x, this.y, this.z, this.w);
        if (l === 0) { this.set(0, 0, 0, 1); } else { this.x /= l; this.y /= l; this.z /= l; this.w /= l; }
        return this;
    }
    setFromUnitVectors(v1, v2) {
        const dot = v1.dot(v2);
        if (dot < -0.999999) {
            this.set(1, 0, 0, 0);
        } else {
            const cross = new Vector3().crossVectors(v1, v2);
            this.set(cross.x, cross.y, cross.z, 1 + dot).normalize();
        }
        return this;
    }
    invert() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
    multiply() { return this; }
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

class Object3D {
    constructor() {
        this.position = new Vector3();
        this.rotation = new Euler();
        this.quaternion = new Quaternion();
        this.scale = new Vector3(1, 1, 1);
        this.children = [];
        this.parent = null;
        this.castShadow = false;
        this.receiveShadow = false;
        this.userData = {};
    }
    add(child) {
        if (!child) return this;
        this.children.push(child);
        child.parent = this;
        return this;
    }
    remove(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parent = null;
        }
        return this;
    }
    getWorldPosition(out = new Vector3()) {
        let p = this.position.clone();
        let curr = this.parent;
        while (curr) {
            p.add(curr.position);
            curr = curr.parent;
        }
        return out.copy(p);
    }
    getWorldQuaternion(out = new Quaternion()) {
        return out.copy(this.quaternion);
    }
    updateMatrixWorld() {}
    localToWorld(v) {
        const worldPos = this.getWorldPosition();
        return v.add(worldPos);
    }
    worldToLocal(v) {
        const worldPos = this.getWorldPosition();
        return v.sub(worldPos);
    }
}

class Mesh extends Object3D {
    constructor(geometry, material) {
        super();
        this.geometry = geometry;
        this.material = material;
    }
}

class Group extends Object3D {}

const mockTHREE = {
    Vector3,
    Quaternion,
    Euler,
    Matrix4,
    Object3D,
    Mesh,
    Group,
    CylinderGeometry: class {},
    BoxGeometry: class {},
    TorusGeometry: class {},
    SphereGeometry: class {},
    PlaneGeometry: class {},
    RingGeometry: class {},
    CircleGeometry: class {},
    ShapeGeometry: class {},
    Shape: class {
        moveTo() {}
        lineTo() {}
        quadraticCurveTo() {}
        bezierCurveTo() {}
        closePath() {}
    },
    MeshStandardMaterial: class {
        constructor(params = {}) { Object.assign(this, params); }
        dispose() {}
    },
    MeshBasicMaterial: class {
        constructor(params = {}) { Object.assign(this, params); }
        dispose() {}
    },
    CanvasTexture: class {
        constructor() {
            this.wrapS = 0;
            this.wrapT = 0;
            this.repeat = new Vector3(1, 1, 1);
        }
        dispose() {}
    },
    MathUtils: {
        lerp: (a, b, t) => a + (b - a) * t,
        clamp: (v, min, max) => Math.max(min, Math.min(max, v))
    },
    DoubleSide: 2,
    FrontSide: 0,
    RepeatWrapping: 1000
};

function createMockSoldierRig() {
    function makeNode(x = 0, y = 0, z = 0) {
        const obj = new Object3D();
        obj.position.set(x, y, z);
        return obj;
    }

    const root = makeNode(0, 0, 0);
    const hips = makeNode(0, 0.95, 0);
    root.add(hips);
    const torso = makeNode(0, 0.35, 0);
    hips.add(torso);
    const head = makeNode(0, 0.45, 0);
    torso.add(head);

    const leftHip = makeNode(-0.14, -0.05, 0);
    const leftKnee = makeNode(0, -0.42, 0);
    const leftFoot = makeNode(0, -0.40, 0);
    hips.add(leftHip);
    leftHip.add(leftKnee);
    leftKnee.add(leftFoot);
    const leftLeg = {
        hip: leftHip,
        hipJoint: leftHip,
        knee: leftKnee,
        kneeJoint: leftKnee,
        foot: leftFoot
    };

    const rightHip = makeNode(0.14, -0.05, 0);
    const rightKnee = makeNode(0, -0.42, 0);
    const rightFoot = makeNode(0, -0.40, 0);
    hips.add(rightHip);
    rightHip.add(rightKnee);
    rightKnee.add(rightFoot);
    const rightLeg = {
        hip: rightHip,
        hipJoint: rightHip,
        knee: rightKnee,
        kneeJoint: rightKnee,
        foot: rightFoot
    };

    const leftArm = {
        shoulder: makeNode(-0.25, 0.35, 0),
        elbow: makeNode(0, -0.28, 0),
        wrist: makeNode(0, -0.26, 0)
    };
    torso.add(leftArm.shoulder);
    leftArm.shoulder.add(leftArm.elbow);
    leftArm.elbow.add(leftArm.wrist);

    const rightArm = {
        shoulder: makeNode(0.25, 0.35, 0),
        elbow: makeNode(0, -0.28, 0),
        wrist: makeNode(0, -0.26, 0)
    };
    torso.add(rightArm.shoulder);
    rightArm.shoulder.add(rightArm.elbow);
    rightArm.elbow.add(rightArm.wrist);

    const rifle = makeNode(0, 0, 0);
    rifle.userData.muzzleOffset = new Vector3(0, 0.02, 0.6);
    rightArm.wrist.add(rifle);

    return { root, hips, torso, head, leftLeg, rightLeg, leftArm, rightArm, rifle };
}

function createTestContext() {
    const scene = new Group();
    const sandbox = {
        THREE: mockTHREE,
        window: {},
        scene,
        document: {
            createElement: () => ({
                width: 512,
                height: 512,
                getContext: () => new Proxy({
                    createRadialGradient: () => ({ addColorStop: () => {} }),
                    createLinearGradient: () => ({ addColorStop: () => {} }),
                    canvas: {}
                }, {
                    get: (target, prop) => {
                        if (prop in target) return target[prop];
                        return () => {};
                    },
                    set: () => true
                })
            })
        },
        Math,
        Date,
        console
    };
    sandbox.window = sandbox;
    sandbox.window.getTerrainHeight = (x, z) => 0.5;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(readScript('soldierGrip.js'), ctx);
    const bicycleSrc = readScript('bicycle.js');
    vm.runInContext(bicycleSrc, ctx);
    return ctx;
}

test('bicycle.js exports buildMilitaryBicycle, Bicycle, and bicycle lifecycle functions', () => {
    const ctx = createTestContext();
    assert.strictEqual(typeof ctx.buildMilitaryBicycle, 'function', 'buildMilitaryBicycle must be exported');
    assert.strictEqual(typeof ctx.Bicycle, 'function', 'Bicycle entity class must be exported');
    assert.strictEqual(typeof ctx.spawnBicycle, 'function', 'spawnBicycle must be exported');
    assert.strictEqual(typeof ctx.initWorldBicycles, 'function', 'initWorldBicycles must be exported');
    assert.strictEqual(typeof ctx.getNearbyBicycle, 'function', 'getNearbyBicycle must be exported');
    assert.strictEqual(typeof ctx.updateBicycles, 'function', 'updateBicycles must be exported');
    assert.strictEqual(typeof ctx.mountBicycle, 'function', 'mountBicycle must be exported');
    assert.strictEqual(typeof ctx.dismountBicycle, 'function', 'dismountBicycle must be exported');
    assert.strictEqual(typeof ctx.updateBicycleRider, 'function', 'updateBicycleRider must be exported');
});

test('initWorldBicycles clears deployed bicycles without spawning free bicycles', () => {
    const ctx = createTestContext();

    ctx.initWorldBicycles();
    assert.strictEqual(ctx.worldBicycles.length, 0, 'world must start without free bicycles');

    ctx.spawnBicycle(0, 0, 0);
    ctx.initWorldBicycles();
    assert.strictEqual(ctx.worldBicycles.length, 0, 'world reset must clear purchased bicycles');
});

test('buildMilitaryBicycle constructs authentic BSA bicycle model with all components', () => {
    const ctx = createTestContext();
    const bikeModel = ctx.buildMilitaryBicycle();

    assert.ok(bikeModel.root, 'Model must have a root Object3D');
    assert.ok(bikeModel.steeringGroup, 'Model must have steeringGroup for steering');
    assert.ok(bikeModel.frontWheelGroup, 'Model must have frontWheelGroup');
    assert.ok(bikeModel.rearWheelGroup, 'Model must have rearWheelGroup');
    assert.ok(bikeModel.crankGroup, 'Model must have crankGroup');
    assert.ok(bikeModel.pedalLeftGroup, 'Model must have pedalLeftGroup');
    assert.ok(bikeModel.pedalRightGroup, 'Model must have pedalRightGroup');
    assert.ok(bikeModel.rearStandGroup, 'Model must have rearStandGroup (drop stand)');

    // Geometric specs
    assert.ok(bikeModel.wheelR >= 0.34, 'Wheel radius must match authentic roadster spec');
    assert.ok(bikeModel.crankLen >= 0.165, 'Crank length must be >= 165mm');
    assert.ok(bikeModel.saddleLocalPos, 'Saddle position must be defined');
    assert.ok(bikeModel.leftGripLocalPos, 'Left handlebar grip position must be defined');
    assert.ok(bikeModel.rightGripLocalPos, 'Right handlebar grip position must be defined');
});

test('Bicycle accelerates, decelerates, steers, and rotates wheels & pedals with distance travelled', () => {
    const ctx = createTestContext();
    const bike = new ctx.Bicycle(0, 0, 0, 0);

    // Initial state: stationary, stand deployed
    assert.strictEqual(bike.speed, 0);
    assert.strictEqual(bike.isStandDown, true);

    // Mount bicycle to pedal forward
    bike.isMounted = true;
    bike.update(0.1, 1.0, 0, false);
    assert.ok(bike.speed > 0, 'Bicycle should gain forward speed on forward input');
    assert.ok(bike.crankAngle > 0, 'Crank angle should advance when moving forward');
    assert.ok(Math.abs(bike.model.frontWheelGroup.rotation.z) > 0, 'Front wheel should rotate when moving');
    assert.ok(Math.abs(bike.model.rearWheelGroup.rotation.z) > 0, 'Rear wheel should rotate when moving');

    // Steer right with D input
    const initialHeading = bike.heading;
    bike.update(0.1, 1.0, 1.0, false);
    assert.ok(bike.steerAngle > 0, 'Steering angle should turn in direction of input');
    assert.notStrictEqual(bike.heading, initialHeading, 'Bicycle heading should rotate while steering and moving');

    // Sprinting achieves higher top speed than walking pedal cadence
    const normalTopSpeed = 7.3;
    const sprintTopSpeed = 10.0;
    for (let i = 0; i < 60; i++) {
        bike.update(0.1, 1.0, 0, false);
    }
    assert.ok(bike.speed <= normalTopSpeed + 0.1, 'Normal pedaling speed should cap near 7.2 m/s');

    for (let i = 0; i < 60; i++) {
        bike.update(0.1, 1.0, 0, true);
    }
    assert.ok(bike.speed > normalTopSpeed, 'Sprinting on bicycle should exceed regular pedaling speed');
    assert.ok(bike.speed <= sprintTopSpeed + 0.1, 'Sprinting speed should cap near 9.8 m/s');

    // Deceleration when releasing input
    const speedBeforeCoast = bike.speed;
    bike.update(0.1, 0, 0, false);
    assert.ok(bike.speed < speedBeforeCoast, 'Bicycle speed should bleed off from friction when coasting');
});

test('Bicycle stops before buildings and tactical obstacles', () => {
    const ctx = createTestContext();
    ctx.worldObstacles = [{
        x: 0,
        z: 2,
        radius: 2,
        box: { rot: 0, minX: -1, maxX: 1, minZ: -0.5, maxZ: 0.5 }
    }];
    const bike = new ctx.Bicycle(0, 0, 0, 0);
    bike.isMounted = true;

    bike.update(1, 1, 0, false);

    assert.ok(bike.z > 0, 'bicycle should move toward the obstacle');
    assert.ok(bike.z < 1.1, 'bicycle must stop outside the expanded obstacle footprint');
    assert.strictEqual(bike.speed, 0, 'bicycle should stop when it hits an obstacle');
});

test('Bicycle stops before tank wrecks', () => {
    const ctx = createTestContext();
    ctx.activeEnemyTanks = [{ x: 0, z: 5, heading: 0, isDestroyed: true }];
    const bike = new ctx.Bicycle(0, 0, 0, 0);
    bike.isMounted = true;

    bike.update(1, 1, 0, false);

    assert.ok(bike.z > 0, 'bicycle should move toward the wreck');
    assert.ok(bike.z < 1.3, 'bicycle must stop outside the tank wreck hitbox');
    assert.strictEqual(bike.speed, 0, 'bicycle should stop when it hits a wreck');
});

test('Mount and dismount toggles soldier states and stand deployment properly', () => {
    const ctx = createTestContext();
    const mountBanners = [];
    let bicycleBellPlayed = false;
    ctx.showKillFeedBanner = (message) => mountBanners.push(message);
    ctx.soundFX = { playBicycleBell: () => { bicycleBellPlayed = true; } };
    const bike = ctx.spawnBicycle(10, 20, 0);
    const soldier = {
        x: 10,
        y: 0,
        z: 20,
        heading: 0,
        speed: 0,
        isMountedBicycle: false,
        currentBicycle: null,
        rig: createMockSoldierRig()
    };

    // Mount
    ctx.mountBicycle(soldier, bike);
    assert.strictEqual(soldier.isMountedBicycle, true, 'Soldier isMountedBicycle must be true');
    assert.strictEqual(soldier.currentBicycle, bike, 'Soldier currentBicycle must link to bike');
    assert.strictEqual(bike.isMounted, true, 'Bike isMounted must be true');
    assert.strictEqual(bike.rider, soldier, 'Bike rider must link to soldier');
    assert.deepStrictEqual(mountBanners, [], 'Mounting must not show a notification');
    assert.strictEqual(bicycleBellPlayed, false, 'Mounting must not play the bicycle bell');

    // Dismount
    ctx.dismountBicycle(soldier);
    assert.strictEqual(soldier.isMountedBicycle, false, 'Soldier isMountedBicycle must be false after dismount');
    assert.strictEqual(soldier.currentBicycle, null, 'Soldier currentBicycle must be null after dismount');
    assert.strictEqual(bike.isMounted, false, 'Bike isMounted must be false after dismount');
    assert.strictEqual(bike.rider, null, 'Bike rider must be null after dismount');
    assert.strictEqual(soldier.rig.hips.position.y, 0.95, 'Hips should return to upright height (0.95)');
});

test('updateBicycleRider computes analytical leg IK aligned to rotating pedals and one-handed rifle aim', () => {
    const ctx = createTestContext();
    const bike = ctx.spawnBicycle(5, 5, 0);
    const soldier = {
        x: 5,
        y: 0,
        z: 5,
        heading: 0,
        speed: 0,
        isMountedBicycle: true,
        currentBicycle: bike,
        rig: createMockSoldierRig()
    };

    const mockCam = {
        position: new Vector3(5, 2, 2),
        getWorldDirection: (out) => out.set(0, 0, 1)
    };

    // Frame 1: Stationary or initial pedal angle
    ctx.updateBicycleRider(soldier, bike, 0.016, mockCam, 1.0, 0, false);
    const kneeBend1 = soldier.rig.leftLeg.knee.rotation.x;
    const hipAngle1 = soldier.rig.leftLeg.hip.rotation.x;

    // Advance pedal crank by half a rotation (~PI radians)
    bike.crankAngle += Math.PI * 0.5;
    ctx.updateBicycleRider(soldier, bike, 0.016, mockCam, 1.0, 0, false);
    const kneeBend2 = soldier.rig.leftLeg.knee.rotation.x;
    const hipAngle2 = soldier.rig.leftLeg.hip.rotation.x;

    // Both hip and knee should adjust dynamically to follow the rotating pedal
    assert.notStrictEqual(kneeBend1, kneeBend2, 'Knee angle should change dynamically with pedal stroke');
    assert.notStrictEqual(hipAngle1, hipAngle2, 'Thigh angle should change dynamically with pedal stroke');

    // Left arm IK holds handlebar grip
    assert.ok(soldier.rig.leftArm.elbow.quaternion.w !== 1 || soldier.rig.leftArm.elbow.quaternion.x !== 0, 'Left elbow must be rotated holding handlebar grip');

    assert.ok(Math.abs(soldier.rig.rifle.position.x + 0.025) < 1e-10, 'Weapon grip must stay at the right palm');
    assert.ok(Math.abs(soldier.rig.rifle.position.y + 0.001) < 1e-10, 'Weapon grip must stay at palm height');
    assert.ok(Math.abs(soldier.rig.rifle.position.z - 0.104) < 1e-10, 'Weapon grip must stay aligned along the hand');

    // Soldier hips are seated at bicycle saddle
    assert.ok(soldier.rig.hips.position.y >= 0.85, 'Hips position.y must be seated at saddle height');
    assert.ok(Number.isFinite(soldier.rig.hips.position.z), 'Hips position.z must be finite (anchored to saddle mesh)');
});

test('updateBicycleRider raises the left arm during a grenade throw and restores the handlebar grip', () => {
    const ctx = createTestContext();
    const bike = ctx.spawnBicycle(5, 5, 0);
    const soldier = {
        x: 5,
        y: 0,
        z: 5,
        heading: 0,
        speed: 0,
        isMountedBicycle: true,
        currentBicycle: bike,
        grenadeAnimDuration: 0.40,
        grenadeAnimTimer: 0,
        rig: createMockSoldierRig()
    };
    const mockCam = {
        position: new Vector3(5, 2, 2),
        getWorldDirection: (out) => out.set(0, 0, 1)
    };

    ctx.updateBicycleRider(soldier, bike, 0.016, mockCam, 0, 0, false);
    const gripElbow = soldier.rig.leftArm.elbow.quaternion.clone();

    soldier.grenadeAnimTimer = soldier.grenadeAnimDuration;
    ctx.updateBicycleRider(soldier, bike, 0.016, mockCam, 0, 0, false);
    const throwElbow = soldier.rig.leftArm.elbow.quaternion;
    assert.ok(soldier.grenadeAnimTimer < soldier.grenadeAnimDuration, 'mounted grenade animation timer must advance');
    assert.ok(
        throwElbow.x !== gripElbow.x || throwElbow.y !== gripElbow.y ||
        throwElbow.z !== gripElbow.z || throwElbow.w !== gripElbow.w,
        'left arm must move out of its handlebar pose during the grenade throw'
    );

    soldier.grenadeAnimTimer = 0;
    ctx.updateBicycleRider(soldier, bike, 0.016, mockCam, 0, 0, false);
    const restoredElbow = soldier.rig.leftArm.elbow.quaternion;
    assert.ok(
        Math.abs(restoredElbow.x - gripElbow.x) < 1e-10 &&
        Math.abs(restoredElbow.y - gripElbow.y) < 1e-10 &&
        Math.abs(restoredElbow.z - gripElbow.z) < 1e-10 &&
        Math.abs(restoredElbow.w - gripElbow.w) < 1e-10,
        'left arm must return to the handlebar grip after the throw'
    );
});

test('playerSoldier interaction mounts and dismounts nearby bicycle', () => {
    const playerSoldierSrc = readScript('playerSoldier.js');
    assert.ok(playerSoldierSrc.includes('updateInteractProximity'), 'playerSoldier.js must check interaction');
    assert.ok(playerSoldierSrc.includes('getNearbyBicycle'), 'playerSoldier.js must find nearby bicycles');
    assert.ok(playerSoldierSrc.includes('MOUNT BICYCLE'), 'playerSoldier.js must provide MOUNT BICYCLE prompt');
    assert.ok(playerSoldierSrc.includes('mount_bicycle'), 'playerSoldier.js must handle mount_bicycle interact type');
    assert.ok(playerSoldierSrc.includes('dismount_bicycle'), 'playerSoldier.js must handle dismount_bicycle interact type');
});

test('Soldier death and respawn resets bicycle mount cleanly', () => {
    const playerSoldierSrc = readScript('playerSoldier.js');
    assert.ok(playerSoldierSrc.includes('function onPlayerSoldierDie'), 'playerSoldier.js must define onPlayerSoldierDie');
    assert.ok(playerSoldierSrc.includes('function resetPlayerSoldier'), 'playerSoldier.js must define resetPlayerSoldier');

    // Both must verify and call dismountBicycle if riding
    const dieMatch = playerSoldierSrc.match(/function onPlayerSoldierDie\(\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(dieMatch && dieMatch[1].includes('isMountedBicycle') && dieMatch[1].includes('dismountBicycle'), 'onPlayerSoldierDie must dismount bicycle');

    const resetMatch = playerSoldierSrc.match(/function resetPlayerSoldier\(\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(resetMatch && resetMatch[1].includes('isMountedBicycle') && resetMatch[1].includes('dismountBicycle'), 'resetPlayerSoldier must dismount bicycle');
});
