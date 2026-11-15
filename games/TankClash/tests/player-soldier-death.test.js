const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function vector(x = 0, y = 0, z = 0) {
    return { x, y, z, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
}

function makeRig() {
    const joint = () => ({ rotation: vector() });
    const hips = { position: vector(0, 0.95, 0), rotation: vector() };
    return {
        root: { position: vector(), rotation: vector(), userData: {} },
        hips,
        torso: joint(),
        head: joint(),
        rightArm: { shoulder: joint() },
        leftArm: { shoulder: joint() },
        rightLeg: { hipJoint: joint(), kneeJoint: joint() },
        leftLeg: { hipJoint: joint(), kneeJoint: joint() },
        rifle: { visible: false, position: vector(), rotation: vector() },
        handGrenade: { visible: true }
    };
}

function createHarness() {
    const timers = [];
    const rig = makeRig();
    const window = {
        tankState: { x: 0, z: 0, heading: 0 },
        buildSoldier: () => rig,
        getTerrainHeight: () => 2,
        addEventListener() {},
        scene: { add() {}, remove() {} },
        showKnockoutModal() { this.modalCount = (this.modalCount || 0) + 1; }
    };
    const context = {
        window,
        document: { getElementById: () => null },
        THREE: { Vector3: function(x, y, z) { Object.assign(this, { x, y, z }); } },
        setTimeout: (callback, delay) => timers.push({ callback, delay }),
        console
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'playerSoldier.js'), 'utf8'), context);
    window.dismountTank();
    return { window, rig, timers };
}

test('death smoothly collapses from the current pose and blocks controls', () => {
    const { window, rig, timers } = createHarness();
    const soldier = window.playerSoldier;
    rig.hips.rotation.x = 0.2;
    rig.rightLeg.kneeJoint.rotation.x = 0.8;
    window.damagePlayerSoldier(100);
    window.damagePlayerSoldier(100);

    assert.equal(soldier.isDead, true);
    assert.equal(soldier.health, 0);
    assert.equal(timers.filter(timer => timer.delay === 1200).length, 1);
    assert.equal(rig.hips.position.y, 0.95);
    assert.equal(rig.hips.rotation.x, 0.2);
    assert.equal(rig.handGrenade.visible, false);
    assert.equal(rig.rifle.visible, true);
    window.mountTank();
    window.hijackTank({ x: 0, z: 0 });
    window.triggerInteract();
    assert.equal(window.playerSoldier, soldier);

    let lookTarget;
    const camera = { lookAt(target) { lookTarget = target; }, updateMatrixWorld() {} };
    window.updatePlayerSoldier(0.4, camera, { w: true });
    assert.ok(rig.hips.position.y < 0.95 && rig.hips.position.y > 0.14);
    assert.ok(rig.hips.rotation.x < 0.2 && rig.hips.rotation.x > -Math.PI * 0.48);
    assert.equal(soldier.x, -2.4);
    assert.equal(lookTarget.x, soldier.x);
    window.updatePlayerSoldier(0.4, camera, {});
    assert.ok(Math.abs(rig.hips.position.y - 0.14) < 1e-10);
    assert.ok(Math.abs(rig.hips.rotation.x + Math.PI * 0.48) < 1e-10);
    assert.ok(Math.abs(rig.rightLeg.kneeJoint.rotation.x - 0.05) < 1e-10);
    window.updatePlayerSoldier(1, camera, {});
    assert.ok(Math.abs(rig.hips.position.y - 0.14) < 1e-10);
    timers.find(timer => timer.delay === 1200).callback();
    assert.equal(window.modalCount, 1);
});

test('airborne death lands on terrain and reset prevents a stale knockout modal', () => {
    const { window, rig, timers } = createHarness();
    const soldier = window.playerSoldier;
    soldier.y = 3;
    soldier.vy = 2;
    soldier.isGrounded = false;
    soldier.die();

    for (let i = 0; i < 30; i++) window.updatePlayerSoldier(0.05, null, {});
    assert.equal(soldier.y, 2);
    assert.equal(soldier.vy, 0);
    assert.equal(soldier.isGrounded, true);
    assert.equal(rig.root.position.y, 2);

    window.resetPlayerSoldier();
    timers.find(timer => timer.delay === 1200).callback();
    assert.equal(window.modalCount, undefined);
});

test('shared death animation collapses any soldier rig smoothly', () => {
    const { window, rig } = createHarness();
    const enemy = { rig: makeRig() };
    enemy.rig.hips.position.y = 1;
    enemy.rig.rightArm.shoulder.rotation.z = -0.2;

    window.startSoldierDeathAnimation(enemy);
    assert.equal(enemy.rig.hips.position.y, 1);
    assert.equal(enemy.rig.rifle.visible, true);
    assert.equal(enemy.rig.handGrenade.visible, false);

    window.updateSoldierDeathAnimation(enemy, 0.4);
    assert.ok(enemy.rig.hips.position.y < 1 && enemy.rig.hips.position.y > 0.14);
    assert.ok(enemy.rig.rightArm.shoulder.rotation.z < -0.2);
    assert.equal(enemy.rig.root.position.y, 0);
    assert.equal(rig.hips.position.y, 0.95);

    window.updateSoldierDeathAnimation(enemy, 0.4);
    assert.ok(Math.abs(enemy.rig.hips.position.y - 0.14) < 1e-10);
    assert.ok(Math.abs(enemy.rig.rifle.position.x - 0.25) < 1e-10);
});
