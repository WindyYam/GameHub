const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadScript(fileName, context) {
    const filePath = path.join(__dirname, '..', 'js', fileName);
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(code, context);
}

function createMockAudioContext() {
    return {
        currentTime: 10.0,
        sampleRate: 44100,
        destination: { name: 'destination' },
        createOscillator() {
            return {
                type: 'sine',
                frequency: {
                    value: 0,
                    setValueAtTime: () => {},
                    exponentialRampToValueAtTime: () => {},
                    setTargetAtTime: () => {}
                },
                connect() {},
                start() {},
                stop() {}
            };
        },
        createGain() {
            return {
                gain: {
                    value: 1,
                    setValueAtTime: () => {},
                    exponentialRampToValueAtTime: () => {},
                    linearRampToValueAtTime: () => {},
                    setTargetAtTime: () => {}
                },
                connect() {},
                disconnect() {}
            };
        },
        createBiquadFilter() {
            return {
                type: 'lowpass',
                frequency: {
                    value: 1000,
                    setValueAtTime: () => {},
                    exponentialRampToValueAtTime: () => {}
                },
                Q: {
                    value: 1,
                    setValueAtTime: () => {}
                },
                connect() {},
                disconnect() {}
            };
        },
        createBuffer(channels, length, sampleRate) {
            return {
                getChannelData: () => new Float32Array(length)
            };
        },
        createBufferSource() {
            return {
                buffer: null,
                connect() {},
                start() {},
                stop() {}
            };
        }
    };
}

test('audio.js defines SPEED_OF_SOUND, getSoundDelay, and accurate distance calculation', () => {
    const sandbox = {
        window: {},
        AudioContext: function() { return createMockAudioContext(); },
        webkitAudioContext: function() { return createMockAudioContext(); },
        setTimeout: (fn) => setTimeout(fn, 100000),
        console
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);

    loadScript('audio.js', sandbox);
    const soundFX = sandbox.soundFX;

    assert.ok(soundFX, 'soundFX object must be defined');
    assert.strictEqual(soundFX.SPEED_OF_SOUND, 343, 'Speed of sound in dry air must be 343 m/s');
    assert.strictEqual(typeof soundFX.getSoundDelay, 'function', 'getSoundDelay method must exist');

    // 1. Zero/near distance yields 0 delay
    assert.strictEqual(soundFX.getSoundDelay(0), 0);
    assert.strictEqual(soundFX.getSoundDelay(null), 0);
    assert.strictEqual(soundFX.getSoundDelay(undefined), 0);
    assert.strictEqual(soundFX.getSoundDelay(0.05), 0);

    // 2. Distance propagation delay calculation: delay = distance / 343
    const delay343m = soundFX.getSoundDelay(343);
    assert.strictEqual(Math.abs(delay343m - 1.0) < 0.001, true, '343m should take 1.0s');

    const delay686m = soundFX.getSoundDelay(686);
    assert.strictEqual(Math.abs(delay686m - 2.0) < 0.001, true, '686m should take 2.0s');

    const delay100m = soundFX.getSoundDelay(100);
    assert.strictEqual(Math.abs(delay100m - (100 / 343)) < 0.001, true, '100m should take 100/343s');

    // 3. Object position calculation relative to player tank
    sandbox.playerMode = 'tank';
    sandbox.tankState = { x: 100, y: 0, z: 200 };
    const enemyPos = { x: 100, y: 0, z: 543 }; // dist = 343m
    assert.strictEqual(Math.abs(soundFX.getPlayerDistance(enemyPos) - 343) < 0.001, true);
    assert.strictEqual(Math.abs(soundFX.getSoundDelay(enemyPos) - 1.0) < 0.001, true);

    // 4. Object position calculation relative to player soldier
    sandbox.playerMode = 'soldier';
    sandbox.playerSoldier = { x: 50, y: 0, z: 50 };
    const distantPos = { x: 50, y: 0, z: 393 }; // dist = 343m
    assert.strictEqual(Math.abs(soundFX.getPlayerDistance(distantPos) - 343) < 0.001, true);
    assert.strictEqual(Math.abs(soundFX.getSoundDelay(distantPos) - 1.0) < 0.001, true);
});

test('createSpatialGain scales gain and cutoff with distance and provides acoustic delay', () => {
    const sandbox = {
        window: {},
        AudioContext: function() { return createMockAudioContext(); },
        webkitAudioContext: function() { return createMockAudioContext(); },
        setTimeout: () => {},
        console
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);

    loadScript('audio.js', sandbox);
    const soundFX = sandbox.soundFX;
    soundFX.init();

    // At player's position (0 distance)
    const localSpatial = soundFX.createSpatialGain(0);
    assert.strictEqual(localSpatial.delay, 0, 'Local sound has 0 delay');
    assert.strictEqual(localSpatial.gain, 1.0, 'Local sound has 1.0 full gain');
    assert.strictEqual(localSpatial.dist, 0);

    // At 100m distance
    const dist100Spatial = soundFX.createSpatialGain(100, 35.0, 1.2, 0.02, 7500);
    assert.strictEqual(Math.abs(dist100Spatial.delay - (100 / 343)) < 0.001, true);
    assert.strictEqual(dist100Spatial.gain < localSpatial.gain, true, 'Distant sound must be attenuated');
    assert.strictEqual(dist100Spatial.cutoff < 7500, true, 'Distant sound must have high frequency air absorption damping');

    // At 300m distance vs 100m distance
    const dist300Spatial = soundFX.createSpatialGain(300, 35.0, 1.2, 0.02, 7500);
    assert.strictEqual(dist300Spatial.delay > dist100Spatial.delay, true, 'Greater distance must have longer delay');
    assert.strictEqual(dist300Spatial.gain < dist100Spatial.gain, true, 'Greater distance must have lower gain');
    assert.strictEqual(dist300Spatial.cutoff < dist100Spatial.cutoff, true, 'Greater distance must have more high-frequency filtering');
});

test('soundFX playback methods schedule distant enemy sounds with acoustic delay', () => {
    const sandbox = {
        window: {},
        AudioContext: function() { return createMockAudioContext(); },
        webkitAudioContext: function() { return createMockAudioContext(); },
        setTimeout: () => {},
        console
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);

    loadScript('audio.js', sandbox);
    const soundFX = sandbox.soundFX;
    soundFX.init();

    // Track scheduled start times for nodes
    const recordedStarts = [];
    const origCreateOsc = soundFX.ctx.createOscillator;
    soundFX.ctx.createOscillator = function() {
        const osc = origCreateOsc.call(soundFX.ctx);
        const origStart = osc.start;
        osc.start = function(when) {
            recordedStarts.push({ type: 'osc', when });
            if (origStart) origStart.call(osc, when);
        };
        return osc;
    };
    const origCreateBuf = soundFX.ctx.createBufferSource;
    soundFX.ctx.createBufferSource = function() {
        const src = origCreateBuf.call(soundFX.ctx);
        const origStart = src.start;
        src.start = function(when) {
            recordedStarts.push({ type: 'buf', when });
            if (origStart) origStart.call(src, when);
        };
        return src;
    };

    // 1. Player tank cannon fire (0 distance -> immediate)
    recordedStarts.length = 0;
    soundFX.ctx.currentTime = 10.0;
    soundFX.playMainCannon({ id: 'tiger' }, 0);
    assert.strictEqual(recordedStarts.length > 0, true);
    assert.strictEqual(recordedStarts[0].when, 10.0, 'Player cannon must play at currentTime (10.0) without delay');

    // 2. Distant enemy cannon fire (343m -> delay = 1.0s)
    recordedStarts.length = 0;
    soundFX.ctx.currentTime = 10.0;
    soundFX.playMainCannon({ id: 'tiger' }, 343);
    assert.strictEqual(recordedStarts.length > 0, true);
    assert.strictEqual(Math.abs(recordedStarts[0].when - 11.0) < 0.001, true, 'Enemy cannon at 343m must start at currentTime + 1.0s (11.0)');

    // 3. Enemy soldier SMG fire (171.5m -> delay = 0.5s)
    recordedStarts.length = 0;
    soundFX.ctx.currentTime = 20.0;
    soundFX.playMG34Shot(171.5);
    assert.strictEqual(recordedStarts.length > 0, true);
    assert.strictEqual(Math.abs(recordedStarts[0].when - 20.5) < 0.001, true, 'MG/SMG shot at 171.5m must start at currentTime + 0.5s (20.5)');

    // 4. Enemy soldier rifle fire (343m -> delay = 1.0s)
    recordedStarts.length = 0;
    soundFX.ctx.currentTime = 30.0;
    soundFX.playRifleShot(343);
    assert.strictEqual(recordedStarts.length > 0, true);
    assert.strictEqual(Math.abs(recordedStarts[0].when - 31.0) < 0.001, true, 'Rifle shot at 343m must start at currentTime + 1.0s (31.0)');

    // 5. Distant explosion (686m -> delay = 2.0s)
    recordedStarts.length = 0;
    soundFX.ctx.currentTime = 40.0;
    soundFX.playExplosion(686);
    assert.strictEqual(recordedStarts.length > 0, true);
    assert.strictEqual(Math.abs(recordedStarts[0].when - 42.0) < 0.001, true, 'Explosion at 686m must start at currentTime + 2.0s (42.0)');
});

test('soldiers.js passes soldier distance to playMG34Shot and playRifleShot on AI fire', () => {
    const soldiersSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'soldiers.js'), 'utf8');

    // Verify soldiers.js passes distance/position to playMG34Shot
    assert.ok(
        soldiersSrc.includes('playMG34Shot(soundPos)') || soldiersSrc.includes('playMG34Shot(distToPlayer)'),
        'soldiers.js must pass distance/soundPos to playMG34Shot for SMG soldiers'
    );

    // Verify soldiers.js passes distance/position to playRifleShot
    assert.ok(
        soldiersSrc.includes('playRifleShot(soundPos)') || soldiersSrc.includes('playRifleShot(distToPlayer)'),
        'soldiers.js must pass distance/soundPos to playRifleShot for rifle soldiers'
    );
});


test('audio.js playRifleShot produces a realistic long-lasting rifle gunshot report (>1.5s)', () => {
    const createdBuffers = [];
    const mockCtx = createMockAudioContext();
    mockCtx.createBuffer = function(channels, length, sampleRate) {
        const buf = { length, sampleRate, getChannelData: () => new Float32Array(length) };
        createdBuffers.push(buf);
        return buf;
    };

    const sandbox = {
        window: {},
        AudioContext: function() { return mockCtx; },
        webkitAudioContext: function() { return mockCtx; },
        setTimeout: (fn) => setTimeout(fn, 100000),
        console
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);

    loadScript('audio.js', sandbox);
    const soundFX = sandbox.soundFX;
    soundFX.cachedCrackBuf = null;
    soundFX.cachedTailBuf = null;

    soundFX.playRifleShot(0);

    // Verify reverberation tail buffer is created and lasts > 1.5s (sampleRate * 1.5 = 66150 samples)
    const tailBuffer = createdBuffers.find(b => b.length >= mockCtx.sampleRate * 1.5) || soundFX.cachedTailBuf;
    assert.ok(tailBuffer && tailBuffer.length >= mockCtx.sampleRate * 1.5, 'playRifleShot must generate an open-field rolling reverb tail lasting >= 1.5s');

    const audioSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8');
    assert.ok(audioSrc.includes('tailLen = Math.floor(this.ctx.sampleRate * 1.65)'), 'tail buffer must be 1.65s');
    assert.ok(audioSrc.includes('Steel Receiver Ring'), 'must include steel receiver resonance ring');
    assert.ok(audioSrc.includes('now + 1.65'), 'tail gain must ramp through 1.65s');
});
