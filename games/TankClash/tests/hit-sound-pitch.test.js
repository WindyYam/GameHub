const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', fileName), 'utf8');
}

test('audio.js provides refined low-pitch hit sound and playHit alias', () => {
    const audioSrc = readScript('audio.js');

    assert.ok(audioSrc.includes('playHit('), 'audio.js must define playHit method');
    assert.ok(audioSrc.includes('playArmorRicochet('), 'audio.js must define playArmorRicochet method');

    // High pitch elements (> 2000Hz) should be removed from armor hit/ricochet
    const ricochetSrc = audioSrc.slice(audioSrc.indexOf('playArmorRicochet('), audioSrc.indexOf('playTreeCrack('));
    assert.ok(!ricochetSrc.includes('3600'), 'playArmorRicochet must not use 3600Hz piercing snap');
    assert.ok(!ricochetSrc.includes('2280'), 'playArmorRicochet must not use 2280Hz high clang');
    assert.ok(!ricochetSrc.includes('4380'), 'playArmorRicochet must not use 4380Hz high overtone');
    assert.ok(!ricochetSrc.includes('setValueAtTime(3200'), 'playArmorRicochet must not use 3200Hz high ricochet whine');

    // Verified lowered frequency characteristics
    assert.ok(audioSrc.includes('setValueAtTime(90'), 'audio.js must use deep 90Hz hull thud');
    assert.ok(audioSrc.includes('setValueAtTime(820'), 'audio.js must use lower 820Hz impact transient');
    assert.ok(audioSrc.includes('setValueAtTime(580'), 'audio.js must use 580Hz resonant hull gong');
    assert.ok(audioSrc.includes('setValueAtTime(280'), 'audio.js must use lower inharmonic plate resonance (~280Hz)');
});
