const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', fileName), 'utf8');
}

test('playerSoldier.js sets default keyboard WASD speed to max run (5.2) and shift to walk (2.8)', () => {
    const soldierSrc = readScript('playerSoldier.js');
    assert.ok(soldierSrc.includes("let moveSpeed = 5.2"), 'Default moveSpeed must be 5.2 (max running speed)');
    assert.ok(soldierSrc.includes("if (k['shift']) {\n            moveSpeed = 2.8") || soldierSrc.includes("if (k['shift']) {\r\n            moveSpeed = 2.8"), 'Holding shift must set moveSpeed to 2.8 (walk speed)');
});

test('enemyAI.js increases enemy detection range by 1.2 and alerts/engages on hit while obeying basic AI firing logic', () => {
    const aiSrc = readScript('enemyAI.js');
    assert.ok(aiSrc.includes('* 1.2'), 'enemyAI.js must scale detect ranges by 1.2');
    assert.ok(aiSrc.includes('ENEMY_HIT_PROVOKE_REACT_TIME = 0.5'), 'enemyAI.js must use 0.5s reaction time on hit');
    assert.ok(aiSrc.includes("this.pendingProvokeTimer = ENEMY_HIT_PROVOKE_REACT_TIME") && aiSrc.includes("e.state = 'ENGAGING'"), 'enemyAI.js onHit must schedule pendingProvokeTimer to switch state to ENGAGING');

    const onHitIdx = aiSrc.indexOf('onHit(impactPos, hitDir');
    const onHitSnippet = aiSrc.slice(onHitIdx, onHitIdx + 300);
    assert.ok(!onHitSnippet.includes('reloadTimer'), 'onHit must not artificially force or slash reloadTimer');

    // Cannon firing must strictly require alignment, reloadTimer <= 0, and hasLOS
    assert.ok(aiSrc.includes('yawError < 0.22 && elevError < 0.16 && e.reloadTimer <= 0 && hasLOS && !targetDead'), 'enemyAI.js must enforce proper cannon aim and natural reload time');
});

test('soldiers.js increases detection ranges by 1.2 and alerts/engages on hit while obeying basic AI firing logic', () => {
    const soldiersSrc = readScript('soldiers.js');
    assert.ok(soldiersSrc.includes('* 1.2'), 'soldiers.js must scale detect ranges by 1.2');
    assert.ok(soldiersSrc.includes('this.alertOnHitTimer = 8.0'), 'soldiers.js takeDamage must set alertOnHitTimer when already alerted');
    assert.ok(soldiersSrc.includes('SOLDIER_HIT_PROVOKE_REACT_TIME = 0.5'), 'soldiers.js takeDamage must use 0.5s reaction time before provoking');

    const dmgIdx = soldiersSrc.indexOf('takeDamage(amount)');
    const dmgSnippet = soldiersSrc.slice(dmgIdx, dmgIdx + 500);
    assert.ok(!dmgSnippet.includes('this.fireCooldown ='), 'takeDamage must not artificially force or slash fireCooldown');

    assert.ok(soldiersSrc.includes('facingDiff < 0.65'), 'soldiers.js must require soldier to face target before firing');
});
