const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', fileName), 'utf8');
}

test('enemyAI.js gives up when player loses sight or remains outside detection range after 5 seconds', () => {
    const aiSrc = readScript('enemyAI.js');

    // 1. Check provokedTimer setup
    assert.ok(aiSrc.includes('e.provokedTimer = 5.0'), 'enemyAI.js must initialize provokedTimer to 5.0 on fire alert');
    assert.ok(aiSrc.includes('this.provokedTimer = 5.0'), 'enemyAI.js must initialize provokedTimer to 5.0 on hit');

    // 2. Check loss of sight condition outside detection range
    assert.ok(aiSrc.includes('isHitAlert && !inDetectRange'), 'enemyAI.js must handle hit/provoked state when outside detection range');
    assert.ok(aiSrc.includes('!hasSight'), 'enemyAI.js must detect loss of sight from enemy');
    assert.ok(aiSrc.includes("e.state = 'PATROL'"), 'enemyAI.js must revert to PATROL when losing sight or timing out');

    // 3. Check 5 second timeout condition
    assert.ok(aiSrc.includes('e.provokedTimer <= 0'), 'enemyAI.js must check 5 second provoked timeout');
});

test('enemy hit and player fire alert ranges use the soldier and tank ratios', () => {
    const aiSrc = readScript('enemyAI.js');
    const soldiersSrc = readScript('soldiers.js');

    assert.ok(aiSrc.includes('const ENEMY_HIT_ALERT_RANGE = 225'), 'enemy tank hit alert range must be 75% of 300m');
    assert.ok(aiSrc.includes('const TANK_NEARBY_ENEMY_PROVOKE_RANGE = 75'), 'nearby tank provoke range must be 75m');
    assert.ok(aiSrc.includes('const SOLDIER_NEARBY_ENEMY_PROVOKE_RANGE = 100'), 'nearby soldier provoke range must be 100m');
    assert.ok(aiSrc.includes('const TANK_FIRE_PROVOKE_RANGE = 60'), 'tank fire provoke range must be 75% of 80m');
    assert.ok(aiSrc.includes('const maxDetectRange = playerShotRecently ? TANK_FIRE_PROVOKE_RANGE'), 'recent fire must not widen tank detection beyond its 60m provoke range');
    assert.ok(aiSrc.includes('window.provokeNearbyEnemies(this)'), 'enemy tank hits must alert nearby units');
    assert.ok(aiSrc.includes('distToPlayer <= ENEMY_HIT_ALERT_RANGE'), 'hit enemy tanks must pursue within the expanded range');
    assert.ok(aiSrc.includes('soldier.alertOnHitTimer = Math.max(soldier.alertOnHitTimer || 0, 8.0)'), 'nearby enemy infantry must be provoked');
    assert.ok(soldiersSrc.includes('if (!hasLOS || dP > 300)'), 'hit enemy infantry must pursue within 300m');
    assert.ok(soldiersSrc.includes('playerFiredRecently ? 80'), 'player fire must alert enemy infantry within 80m');
    assert.ok(soldiersSrc.includes('window.provokeNearbyEnemies(this)'), 'enemy infantry hits must alert nearby units');
});

test('soldiers.js gives up when player loses sight or remains outside detection range after 5 seconds', () => {
    const soldiersSrc = readScript('soldiers.js');

    assert.ok(soldiersSrc.includes('this.provokedTimer = 5.0'), 'soldiers.js takeDamage must initialize provokedTimer to 5.0');
    assert.ok(soldiersSrc.includes('!inDetectRange'), 'soldiers.js evaluateCombatTarget must handle outside detection range check');
    assert.ok(soldiersSrc.includes('!hasLOS'), 'soldiers.js evaluateCombatTarget must check loss of line of sight');
    assert.ok(soldiersSrc.includes('this.provokedTimer <= 0'), 'soldiers.js evaluateCombatTarget must check 5 second provoked timeout');
    assert.ok(soldiersSrc.includes('this.currentTarget = null'), 'soldiers.js must clear currentTarget to give up chase and return to wander');
});
