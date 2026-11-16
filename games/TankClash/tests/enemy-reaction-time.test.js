const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', fileName), 'utf8');
}

test('enemyAI.js defines 1.0s shoot-notice and 0.5s hit-provoke reaction times', () => {
    const aiSrc = readScript('enemyAI.js');
    assert.ok(aiSrc.includes('const ENEMY_SHOOT_NOTICE_REACT_TIME = 1.0;'));
    assert.ok(aiSrc.includes('const ENEMY_HIT_PROVOKE_REACT_TIME = 0.5;'));
    assert.ok(aiSrc.includes('playerFireBurstStartTime'));
    assert.ok(aiSrc.includes('nowSec - playerFireBurstStartTime >= ENEMY_SHOOT_NOTICE_REACT_TIME'));
});

test('soldiers.js and playerSoldier.js enforce 1.0s shoot-notice and 0.5s hit-provoke reaction times', () => {
    const soldiersSrc = readScript('soldiers.js');
    const playerSrc = readScript('playerSoldier.js');

    assert.ok(soldiersSrc.includes('const SOLDIER_SHOOT_NOTICE_REACT_TIME = 1.0;'));
    assert.ok(soldiersSrc.includes('const SOLDIER_HIT_PROVOKE_REACT_TIME = 0.5;'));
    assert.ok(soldiersSrc.includes('function hasPlayerSoldierFiredRecently(ps, nowSec)'));
    assert.ok(playerSrc.includes('function recordPlayerFireTime(s)'));
    assert.ok(playerSrc.includes('s.fireBurstStartTime = nowSec'));
});

test('pendingProvokeTimer simulation: 1.0s for player shooting, 0.5s for getting shot, 1.0s for nearby allies', () => {
    const ENEMY_SHOOT_NOTICE_REACT_TIME = 1.0;
    const ENEMY_HIT_PROVOKE_REACT_TIME = 0.5;

    function stepPendingProvoke(entity, dt) {
        if (typeof entity.pendingProvokeTimer === 'number' && entity.pendingProvokeTimer > 0) {
            entity.pendingProvokeTimer -= dt;
            if (entity.pendingProvokeTimer <= 0) {
                entity.pendingProvokeTimer = 0;
                entity.wasHitAlert = true;
                entity.provokedTimer = Math.max(entity.provokedTimer || 0, 5.0);
                entity.detectionTimer = Math.max(entity.detectionTimer || 0, 7.0);
                entity.state = 'ENGAGING';
            }
        }
    }

    // 1. Noticing player shooting takes 1.0s
    const tankHearingShot = { wasHitAlert: false, state: 'PATROL', pendingProvokeTimer: ENEMY_SHOOT_NOTICE_REACT_TIME };
    stepPendingProvoke(tankHearingShot, 0.5);
    assert.equal(tankHearingShot.wasHitAlert, false);
    assert.equal(tankHearingShot.state, 'PATROL');
    stepPendingProvoke(tankHearingShot, 0.45);
    assert.equal(tankHearingShot.wasHitAlert, false);
    stepPendingProvoke(tankHearingShot, 0.05);
    assert.equal(tankHearingShot.wasHitAlert, true);
    assert.equal(tankHearingShot.state, 'ENGAGING');

    // 2. Getting shot takes 0.5s to notice and provoke
    const tankShotDirectly = { wasHitAlert: false, state: 'PATROL', pendingProvokeTimer: ENEMY_HIT_PROVOKE_REACT_TIME };
    stepPendingProvoke(tankShotDirectly, 0.4);
    assert.equal(tankShotDirectly.wasHitAlert, false);
    assert.equal(tankShotDirectly.state, 'PATROL');
    stepPendingProvoke(tankShotDirectly, 0.1);
    assert.equal(tankShotDirectly.wasHitAlert, true);
    assert.equal(tankShotDirectly.state, 'ENGAGING');

    // 3. Direct hit overrides a pending 1.0s shot-notice timer down to 0.5s
    const tankShotAfterFiring = { wasHitAlert: false, state: 'PATROL', pendingProvokeTimer: ENEMY_SHOOT_NOTICE_REACT_TIME };
    tankShotAfterFiring.pendingProvokeTimer = Math.min(tankShotAfterFiring.pendingProvokeTimer, ENEMY_HIT_PROVOKE_REACT_TIME);
    stepPendingProvoke(tankShotAfterFiring, 0.5);
    assert.equal(tankShotAfterFiring.wasHitAlert, true);
});

test('burst fire still triggers shoot notice 1.0s after first shot in burst', () => {
    const REACT = 1.0;
    const ps = { lastFireTime: 0, fireBurstStartTime: 0 };

    function recordFire(t) {
        if (!ps.lastFireTime || (t - ps.lastFireTime >= 3.0)) {
            ps.fireBurstStartTime = t;
        }
        ps.lastFireTime = t;
    }

    function firedRecentlyAt(t) {
        return Boolean(ps.lastFireTime && (t - ps.lastFireTime < 3.0) && (t - ps.fireBurstStartTime >= REACT));
    }

    recordFire(10.0);
    assert.equal(firedRecentlyAt(10.0), false);
    recordFire(10.2);
    assert.equal(firedRecentlyAt(10.5), false);
    recordFire(10.8);
    assert.equal(firedRecentlyAt(10.9), false);
    assert.equal(firedRecentlyAt(11.0), true);
    assert.equal(firedRecentlyAt(13.7), true);
    assert.equal(firedRecentlyAt(13.9), false);
});
