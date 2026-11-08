// ============================================================================
// TigerTank Audio Synthesizer (Web Audio API)
// Maybach HL230 V12 Engine, 8.8cm KwK 36 Cannon, MG34, Low-Pitch Reload Sequence
// ============================================================================
const RELOAD_PITCH = 0.75;

const soundFX = {
    ctx: null,
    enabled: true,
    engineOsc: null,
    engineSub: null,
    engineGain: null,
    initialized: false,
    currentProfile: 'tiger',

    setTankSoundProfile(spec) {
        if (!spec) return;
        this.currentProfile = spec.id || 'tiger';
    },

    // Calculate 3D Euclidean distance to the player (in meters)
    getPlayerDistance(posOrDist) {
        if (posOrDist === undefined || posOrDist === null) return 0;
        if (typeof posOrDist === 'number') return Math.max(0, posOrDist);
        if (typeof posOrDist === 'object') {
            let px = 0, py = 0, pz = 0;
            if (window.playerMode === 'soldier' && window.playerSoldier) {
                px = window.playerSoldier.x;
                py = window.playerSoldier.y || 0;
                pz = window.playerSoldier.z;
            } else if (window.tankState) {
                px = window.tankState.x;
                py = window.tankState.y || 0;
                pz = window.tankState.z;
            }
            let tx = 0, ty = 0, tz = 0;
            if (posOrDist.position && typeof posOrDist.position.x === 'number') {
                tx = posOrDist.position.x;
                ty = posOrDist.position.y !== undefined ? posOrDist.position.y : 0;
                tz = posOrDist.position.z !== undefined ? posOrDist.position.z : 0;
            } else {
                tx = posOrDist.x !== undefined ? posOrDist.x : 0;
                ty = posOrDist.y !== undefined ? posOrDist.y : 0;
                tz = posOrDist.z !== undefined ? posOrDist.z : 0;
            }
            return Math.hypot(tx - px, ty - py, tz - pz);
        }
        return 0;
    },

    // Speed of sound in dry air at 20°C (m/s)
    SPEED_OF_SOUND: 343,

    // Calculate propagation delay in seconds from sound origin to player
    getSoundDelay(posOrDist) {
        const dist = this.getPlayerDistance(posOrDist);
        if (dist <= 0.1) return 0;
        return dist / (this.SPEED_OF_SOUND || 343.0);
    },

    // Create 3D spatial attenuation node graph (Inverse-distance falloff + air absorption lowpass filter + acoustic propagation delay)
    createSpatialGain(posOrDist, refDist = 28.0, rolloff = 1.15, minGain = 0.0, maxCutoff = 8000) {
        const dist = this.getPlayerDistance(posOrDist);
        const delay = this.getSoundDelay(dist);
        if (dist <= 0.1) {
            // Near or at player's own position: full volume, zero filtering, immediate playback
            return {
                input: this.ctx.destination,
                gainNode: null,
                filter: null,
                gain: 1.0,
                cutoff: maxCutoff,
                dist: 0,
                delay: 0
            };
        }

        // Distance attenuation: physically calibrated inverse distance curve
        const gainVal = Math.max(minGain, 1.0 / (1.0 + Math.pow(dist / refDist, rolloff)));
        // Atmospheric high-frequency damping (air absorption over distance)
        const cutoff = Math.max(380, maxCutoff / (1.0 + (dist / 50.0)));

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cutoff, this.ctx.currentTime);

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(gainVal, this.ctx.currentTime);

        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        // Auto-cleanup node connections when delayed playback completes
        if (typeof setTimeout === 'function') {
            setTimeout(() => {
                try {
                    filter.disconnect();
                    gainNode.disconnect();
                } catch (e) {}
            }, Math.ceil((delay + 3.0) * 1000));
        }

        return {
            input: filter,
            gainNode,
            filter,
            gain: gainVal,
            cutoff,
            dist,
            delay
        };
    },

    init() {
        if (this.initialized) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();

            // Maybach HL230 P45 V12 Idle & Throttle Rumble
            this.engineOsc = this.ctx.createOscillator();
            this.engineSub = this.ctx.createOscillator();
            this.engineGain = this.ctx.createGain();

            this.engineOsc.type = 'sawtooth';
            this.engineSub.type = 'triangle';
            this.engineOsc.frequency.value = 36;
            this.engineSub.frequency.value = 18;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 140;

            this.engineGain.gain.value = 0.04;
            this.engineOsc.connect(filter);
            this.engineSub.connect(filter);
            filter.connect(this.engineGain);
            this.engineGain.connect(this.ctx.destination);

            this.engineOsc.start();
            this.engineSub.start();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not available:', e);
        }
    },

    updateListenerPosition() {
        if (!this.ctx || !this.ctx.listener) return;
        const soldier = window.playerMode === 'soldier' ? window.playerSoldier : null;
        const actor = soldier || window.tankState || { x: 0, y: 0, z: 0 };
        const x = actor.x || 0;
        const y = (actor.y || 0) + 1.5;
        const z = actor.z || 0;
        const listener = this.ctx.listener;
        const now = this.ctx.currentTime;

        if (listener.positionX && typeof listener.positionX.setTargetAtTime === 'function') {
            listener.positionX.setTargetAtTime(x, now, 0.025);
            listener.positionY.setTargetAtTime(y, now, 0.025);
            listener.positionZ.setTargetAtTime(z, now, 0.025);
        } else if (typeof listener.setPosition === 'function') {
            listener.setPosition(x, y, z);
        }
    },

    updateEngine(speedRatio, isDriving) {
        if (!this.initialized || !this.ctx) return;
        this.updateListenerPosition();
        if (!this.enabled) {
            this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
            return;
        }
        let baseFreq = 34 + speedRatio * 58 + (isDriving ? 6 : 0);
        if (this.currentProfile === 'sherman') {
            baseFreq = 42 + speedRatio * 64 + (isDriving ? 8 : 0);
        } else if (this.currentProfile === 't34') {
            baseFreq = 28 + speedRatio * 52 + (isDriving ? 7 : 0);
        } else if (this.currentProfile === 'kv2') {
            baseFreq = 24 + speedRatio * 44 + (isDriving ? 6 : 0);
        } else if (this.currentProfile === 'pershing') {
            baseFreq = 38 + speedRatio * 60 + (isDriving ? 8 : 0);
        }
        this.engineOsc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.08);
        this.engineSub.frequency.setTargetAtTime(baseFreq * 0.5, this.ctx.currentTime, 0.08);
        this.engineGain.gain.setTargetAtTime(0.035 + speedRatio * 0.045, this.ctx.currentTime, 0.1);
    },

    playMainCannon(spec, posOrDist = 0) {
        const id = (spec && spec.id) || this.currentProfile || 'tiger';
        if (id === 'sherman') {
            this.playShermanCannon(posOrDist);
        } else if (id === 't34') {
            this.playT34Cannon(posOrDist);
        } else if (id === 'kv2') {
            this.playKV2Howitzer(posOrDist);
        } else {
            this.play88mmCannon(posOrDist);
        }
    },

    playShermanCannon(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 42.0, 1.25, 0.05, 8000);
        const now = this.ctx.currentTime + (spatial.delay || 0);

        const bufferSize = Math.floor(this.ctx.sampleRate * 1.1);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.22));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1250, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + 0.9);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.58, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(spatial.input);
        noise.start(now);

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.35);
        oscGain.gain.setValueAtTime(0.48, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(oscGain);
        oscGain.connect(spatial.input);
        osc.start(now);
        osc.stop(now + 0.38);
    },

    playRocketLaunch(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 35.0, 1.3, 0.05, 8000);
        const now = this.ctx.currentTime + (spatial.delay || 0);

        // 1. Initial Launch Ignition Pop
        const popOsc = this.ctx.createOscillator();
        const popGain = this.ctx.createGain();
        popOsc.type = 'triangle';
        popOsc.frequency.setValueAtTime(260, now);
        popOsc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
        popGain.gain.setValueAtTime(0.55, now);
        popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        popOsc.connect(popGain);
        popGain.connect(spatial.input);
        popOsc.start(now);
        popOsc.stop(now + 0.15);

        // 2. High-Velocity Rocket Motor Exhaust Whoosh (bandpass noise sweep)
        const dur = 0.95;
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.45));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(450, now);
        bp.frequency.exponentialRampToValueAtTime(1400, now + 0.18);
        bp.frequency.exponentialRampToValueAtTime(220, now + dur);
        bp.Q.value = 1.8;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.68, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        noise.connect(bp);
        bp.connect(gain);
        gain.connect(spatial.input);
        noise.start(now);
    },

    playRocketReload(posOrDist = 0) {
        // Tank cannon stage 2 reload sound (shell slide into breech)
        if (typeof this.playShellSlide === 'function') {
            this.playShellSlide();
        }
    },

    playT34Cannon(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 42.0, 1.25, 0.05, 8000);
        const now = this.ctx.currentTime + (spatial.delay || 0);

        const bufferSize = Math.floor(this.ctx.sampleRate * 1.35);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.25));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1450, now);
        filter.frequency.exponentialRampToValueAtTime(70, now + 1.1);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.62, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(spatial.input);
        noise.start(now);

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(128, now);
        osc.frequency.exponentialRampToValueAtTime(26, now + 0.42);
        oscGain.gain.setValueAtTime(0.52, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(oscGain);
        oscGain.connect(spatial.input);
        osc.start(now);
        osc.stop(now + 0.45);
    },

    playKV2Howitzer(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 55.0, 1.45, 0.08, 9500);
        const now = this.ctx.currentTime + (spatial.delay || 0);

        // Colossal 152mm M-10T Howitzer Concussion: deep seismic boom + thunderous rolling echo
        const bufferSize = Math.floor(this.ctx.sampleRate * 2.2);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.42));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1100, now);
        filter.frequency.exponentialRampToValueAtTime(45, now + 1.8);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.85, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(spatial.input);
        noise.start(now);

        // Sub-bass thump (38Hz -> 18Hz) shaking the ground
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(95, now);
        subOsc.frequency.exponentialRampToValueAtTime(20, now + 0.65);
        subGain.gain.setValueAtTime(0.75, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.70);
        subOsc.connect(subGain);
        subGain.connect(spatial.input);
        subOsc.start(now);
        subOsc.stop(now + 0.70);
    },

    play88mmCannon(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 45.0, 1.25, 0.06, 8500);
        const now = this.ctx.currentTime + (spatial.delay || 0);

        // High-velocity 8.8cm KwK 36 breech crack + booming low-end shockwave
        const bufferSize = this.ctx.sampleRate * 1.4;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.28));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(950, now);
        filter.frequency.exponentialRampToValueAtTime(65, now + 1.2);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(spatial.input);
        noise.start(now);

        // Punchy sub-bass thump
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(115, now);
        osc.frequency.exponentialRampToValueAtTime(22, now + 0.45);
        oscGain.gain.setValueAtTime(0.55, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(oscGain);
        oscGain.connect(spatial.input);
        osc.start(now);
        osc.stop(now + 0.5);
    },

    playMG34Shot(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 35.0, 1.2, 0.02, 7500);
        if (spatial.gain < 0.01) return;
        const now = this.ctx.currentTime + (spatial.delay || 0);

        // 1. Visceral Chamber Blast & Low Thud (Punchy chamber pressure: 195Hz down to 55Hz)
        const punch = this.ctx.createOscillator();
        const punchGain = this.ctx.createGain();
        punch.type = 'triangle';
        punch.frequency.setValueAtTime(195, now);
        punch.frequency.exponentialRampToValueAtTime(55, now + 0.055);
        punchGain.gain.setValueAtTime(0.72, now);
        punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
        punch.connect(punchGain);
        punchGain.connect(spatial.input);
        punch.start(now);
        punch.stop(now + 0.065);

        // 2. High-Pressure Muzzle Blast & Supersonic Bullet Snap (Fast, biting transient)
        if (!this.cachedSnapBuf || this.cachedSnapRate !== this.ctx.sampleRate) {
            const snapLen = Math.floor(this.ctx.sampleRate * 0.05);
            this.cachedSnapBuf = this.ctx.createBuffer(1, snapLen, this.ctx.sampleRate);
            const snapData = this.cachedSnapBuf.getChannelData(0);
            for (let i = 0; i < snapLen; i++) {
                snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapLen * 0.22));
            }
            const clickLen = Math.floor(this.ctx.sampleRate * 0.025);
            this.cachedClickBuf = this.ctx.createBuffer(1, clickLen, this.ctx.sampleRate);
            const clickData = this.cachedClickBuf.getChannelData(0);
            for (let i = 0; i < clickLen; i++) {
                clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickLen * 0.15));
            }
            this.cachedSnapRate = this.ctx.sampleRate;
        }
        const snapSrc = this.ctx.createBufferSource();
        snapSrc.buffer = this.cachedSnapBuf;
        const snapFilt = this.ctx.createBiquadFilter();
        snapFilt.type = 'bandpass';
        snapFilt.frequency.setValueAtTime(1650, now);
        snapFilt.Q.value = 1.6;
        const snapGain = this.ctx.createGain();
        snapGain.gain.setValueAtTime(0.78, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        snapSrc.connect(snapFilt);
        snapFilt.connect(snapGain);
        snapGain.connect(spatial.input);
        snapSrc.start(now);

        // 3. Metallic Receiver / Bolt Action Click
        const clickSrc = this.ctx.createBufferSource();
        clickSrc.buffer = this.cachedClickBuf;
        const clickFilt = this.ctx.createBiquadFilter();
        clickFilt.type = 'highpass';
        clickFilt.frequency.setValueAtTime(2800, now);
        const clickGain = this.ctx.createGain();
        clickGain.gain.setValueAtTime(0.40, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
        clickSrc.connect(clickFilt);
        clickFilt.connect(clickGain);
        clickGain.connect(spatial.input);
        clickSrc.start(now);

        // 4. Short Barrel Resonance & Body Combustion
        const body = this.ctx.createOscillator();
        const bodyGain = this.ctx.createGain();
        body.type = 'sine';
        body.frequency.setValueAtTime(360, now + 0.005);
        body.frequency.exponentialRampToValueAtTime(120, now + 0.07);
        bodyGain.gain.setValueAtTime(0.35, now + 0.005);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
        body.connect(bodyGain);
        bodyGain.connect(spatial.input);
        body.start(now + 0.005);
        body.stop(now + 0.075);
    },

    playRifleShot(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 40.0, 1.25, 0.02, 8000);
        if (spatial.gain < 0.01) return;
        const now = this.ctx.currentTime + (spatial.delay || 0);

        // 1. Deep Concussive Chamber Blast (Heavy, visceral recoil boom: 280Hz down to 42Hz)
        const boom = this.ctx.createOscillator();
        const boomGain = this.ctx.createGain();
        boom.type = 'triangle';
        boom.frequency.setValueAtTime(280, now);
        boom.frequency.exponentialRampToValueAtTime(42, now + 0.13);
        boomGain.gain.setValueAtTime(0.85, now);
        boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        boom.connect(boomGain);
        boomGain.connect(spatial.input);
        boom.start(now);
        boom.stop(now + 0.16);

        // 2. High-Velocity Supersonic Bullet Whip & Muzzle Crack (Sharp, biting crack: 2200Hz bandpass)
        if (!this.cachedCrackBuf || this.cachedRifleRate !== this.ctx.sampleRate) {
            const crackLen = Math.floor(this.ctx.sampleRate * 0.08);
            this.cachedCrackBuf = this.ctx.createBuffer(1, crackLen, this.ctx.sampleRate);
            const crackData = this.cachedCrackBuf.getChannelData(0);
            for (let i = 0; i < crackLen; i++) {
                crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crackLen * 0.18));
            }
            const roarLen = Math.floor(this.ctx.sampleRate * 0.22);
            this.cachedRoarBuf = this.ctx.createBuffer(1, roarLen, this.ctx.sampleRate);
            const roarData = this.cachedRoarBuf.getChannelData(0);
            for (let i = 0; i < roarLen; i++) {
                roarData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (roarLen * 0.25));
            }
            const tailLen = Math.floor(this.ctx.sampleRate * 0.42);
            this.cachedTailBuf = this.ctx.createBuffer(1, tailLen, this.ctx.sampleRate);
            const tailData = this.cachedTailBuf.getChannelData(0);
            for (let i = 0; i < tailLen; i++) {
                tailData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (tailLen * 0.35));
            }
            this.cachedRifleRate = this.ctx.sampleRate;
        }
        const crackSrc = this.ctx.createBufferSource();
        crackSrc.buffer = this.cachedCrackBuf;
        const crackFilt = this.ctx.createBiquadFilter();
        crackFilt.type = 'bandpass';
        crackFilt.frequency.setValueAtTime(2200, now);
        crackFilt.Q.value = 1.8;
        const crackGain = this.ctx.createGain();
        crackGain.gain.setValueAtTime(0.92, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        crackSrc.connect(crackFilt);
        crackFilt.connect(crackGain);
        crackGain.connect(spatial.input);
        crackSrc.start(now);

        // 3. Gunpowder Combustion Body & Steel Receiver Ring (Thick mid-range roar)
        const roarSrc = this.ctx.createBufferSource();
        roarSrc.buffer = this.cachedRoarBuf;
        const roarFilt = this.ctx.createBiquadFilter();
        roarFilt.type = 'lowpass';
        roarFilt.frequency.setValueAtTime(850, now);
        roarFilt.frequency.exponentialRampToValueAtTime(220, now + 0.20);
        const roarGain = this.ctx.createGain();
        roarGain.gain.setValueAtTime(0.68, now);
        roarGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        roarSrc.connect(roarFilt);
        roarFilt.connect(roarGain);
        roarGain.connect(spatial.input);
        roarSrc.start(now);

        // 4. Open-Field Rolling Acoustic Reverb Tail (Diffuse distant report)
        const tailSrc = this.ctx.createBufferSource();
        tailSrc.buffer = this.cachedTailBuf;
        const tailFilt = this.ctx.createBiquadFilter();
        tailFilt.type = 'lowpass';
        tailFilt.frequency.setValueAtTime(600, now + 0.04);
        tailFilt.frequency.exponentialRampToValueAtTime(110, now + 1.45);
        const tailGain = this.ctx.createGain();
        tailGain.gain.setValueAtTime(0.001, now);
        tailGain.gain.linearRampToValueAtTime(0.56, now + 0.05);
        tailGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
        tailSrc.connect(tailFilt);
        tailFilt.connect(tailGain);
        tailGain.connect(spatial.input);
        tailSrc.start(now + 0.02);
    },

    playImpactExplosion(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 38.0, 1.15, 0.04, 7500);
        const now = this.ctx.currentTime + (spatial.delay || 0);

        // 1. Initial High-Energy Supersonic Shockwave Crack (Deep, heavy low-pitch shockwave transient)
        const crackBufferSize = Math.floor(this.ctx.sampleRate * 0.16);
        const crackBuf = this.ctx.createBuffer(1, crackBufferSize, this.ctx.sampleRate);
        const crackData = crackBuf.getChannelData(0);
        for (let i = 0; i < crackBufferSize; i++) {
            crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.032));
        }
        const crackSrc = this.ctx.createBufferSource();
        crackSrc.buffer = crackBuf;

        const crackFilter = this.ctx.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime(650, now);
        crackFilter.Q.setValueAtTime(1.4, now);

        const crackGain = this.ctx.createGain();
        crackGain.gain.setValueAtTime(1.05, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        crackSrc.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(spatial.input);
        crackSrc.start(now);

        // 2. Heavy HE Blast Roar & Debris Rumble (Deep, thundering broad noise blast - Low-Pitch Heavy Rumbling)
        const rumbleBufferSize = Math.floor(this.ctx.sampleRate * 2.0);
        const rumbleBuf = this.ctx.createBuffer(1, rumbleBufferSize, this.ctx.sampleRate);
        const rumbleData = rumbleBuf.getChannelData(0);
        for (let i = 0; i < rumbleBufferSize; i++) {
            rumbleData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.52));
        }
        const rumbleSrc = this.ctx.createBufferSource();
        rumbleSrc.buffer = rumbleBuf;

        const rumbleFilter = this.ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.setValueAtTime(360, now);
        rumbleFilter.frequency.exponentialRampToValueAtTime(70, now + 1.8);

        const rumbleGain = this.ctx.createGain();
        rumbleGain.gain.setValueAtTime(1.35, now);
        rumbleGain.gain.exponentialRampToValueAtTime(0.002, now + 1.95);

        rumbleSrc.connect(rumbleFilter);
        rumbleFilter.connect(rumbleGain);
        rumbleGain.connect(spatial.input);
        rumbleSrc.start(now);

        // 3. Sub-Bass Concussion Thump (Deep visceral chest-hitting shock: 100Hz down to 22Hz)
        const subOsc = this.ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(100, now);
        subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.65);

        const subGain = this.ctx.createGain();
        subGain.gain.setValueAtTime(1.25, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

        subOsc.connect(subGain);
        subGain.connect(spatial.input);
        subOsc.start(now);
        subOsc.stop(now + 0.72);

        // 4. Secondary Ground Debris Spatter (Pebbles and scorched earth fallout - Low resonant spatter)
        const debrisSize = Math.floor(this.ctx.sampleRate * 0.9);
        const debrisBuf = this.ctx.createBuffer(1, debrisSize, this.ctx.sampleRate);
        const dData = debrisBuf.getChannelData(0);
        for (let i = 0; i < debrisSize; i++) {
            dData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.28));
        }
        const dSrc = this.ctx.createBufferSource();
        dSrc.buffer = debrisBuf;

        const dFilter = this.ctx.createBiquadFilter();
        dFilter.type = 'bandpass';
        dFilter.frequency.setValueAtTime(520, now);
        dFilter.Q.setValueAtTime(1.8, now);

        const dGain = this.ctx.createGain();
        dGain.gain.setValueAtTime(0.001, now);
        dGain.gain.linearRampToValueAtTime(0.45, now + 0.08);
        dGain.gain.exponentialRampToValueAtTime(0.001, now + 0.88);

        dSrc.connect(dFilter);
        dFilter.connect(dGain);
        dGain.connect(spatial.input);
        dSrc.start(now + 0.05);
    },

    playExplosion(posOrDist = 0) {
        this.playImpactExplosion(posOrDist);
    },

    playHit(posOrDist = 0, isSoldier = false, volumeScale = 1.0) {
        if (isSoldier) {
            this.playSoldierHit(posOrDist, volumeScale);
        } else {
            this.playArmorRicochet(posOrDist, volumeScale);
        }
    },

    // Realistic Multi-Stage Tree Toppling & Canopy Ground Crash (Deep Low-Pitch Timber Snap)

    // Bullet impact on soldier: muted organic flesh & fabric punch (soft low-frequency thud, non-fatiguing)
    playSoldierHit(posOrDist = 0, volumeScale = 1.0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 20.0, 1.35, 0.0, 5000);
        if (spatial.gain < 0.01) return;
        const now = this.ctx.currentTime + (spatial.delay || 0);

        // Soldier Hit Master Bus (Controlled, gentle volume)
        const hitBus = this.ctx.createGain();
        hitBus.gain.setValueAtTime(0.24 * Math.max(0.1, volumeScale), now);
        hitBus.connect(spatial.input);

        // 1. Organic body impact thud (140Hz down to 42Hz)
        const thud = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thud.type = 'triangle';
        thud.frequency.setValueAtTime(140, now);
        thud.frequency.exponentialRampToValueAtTime(42, now + 0.07);
        thudGain.gain.setValueAtTime(0.38, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        thud.connect(thudGain);
        thudGain.connect(hitBus);
        thud.start(now);
        thud.stop(now + 0.08);

        // 2. Cloth/fabric impact transient (soft bandpass crackle: 650Hz)
        const snapLen = Math.floor(this.ctx.sampleRate * 0.045);
        const snapBuf = this.ctx.createBuffer(1, snapLen, this.ctx.sampleRate);
        const snapData = snapBuf.getChannelData(0);
        for (let i = 0; i < snapLen; i++) {
            snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapLen * 0.25));
        }
        const snapSrc = this.ctx.createBufferSource();
        snapSrc.buffer = snapBuf;
        const snapFilt = this.ctx.createBiquadFilter();
        snapFilt.type = 'bandpass';
        snapFilt.frequency.setValueAtTime(650, now);
        snapFilt.Q.value = 1.4;
        const snapGain = this.ctx.createGain();
        snapGain.gain.setValueAtTime(0.28, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        snapSrc.connect(snapFilt);
        snapFilt.connect(snapGain);
        snapGain.connect(hitBus);
        snapSrc.start(now);
    },

    // Deep heavy-armor impact thud & low resonant steel plate gong (Visceral low pitch hit, comfortably balanced volume)
    playArmorRicochet(posOrDist = 0, volumeScale = 1.0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const spatial = this.createSpatialGain(posOrDist, 28.0, 1.30, 0.0, 9000);
        if (spatial.gain < 0.01) return;
        const now = this.ctx.currentTime + (spatial.delay || 0);

        // Master impact bus to prevent clipping and reduce loud jarring bursts
        const hitMaster = this.ctx.createGain();
        hitMaster.gain.setValueAtTime(0.28 * Math.max(0.1, volumeScale), now);
        hitMaster.connect(spatial.input);

        // 1. Heavy Armor Solid Mass Thud (Punchy deep hull substrate: 90Hz down to 32Hz)
        const thud = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thud.type = 'triangle';
        thud.frequency.setValueAtTime(90, now);
        thud.frequency.exponentialRampToValueAtTime(32, now + 0.10);
        thudGain.gain.setValueAtTime(0.36, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        thud.connect(thudGain);
        thudGain.connect(hitMaster);
        thud.start(now);
        thud.stop(now + 0.11);

        // Sub-Bass Body Concussion (Dense 68Hz -> 25Hz low-frequency thump)
        const subThud = this.ctx.createOscillator();
        const subThudGain = this.ctx.createGain();
        subThud.type = 'sine';
        subThud.frequency.setValueAtTime(68, now);
        subThud.frequency.exponentialRampToValueAtTime(25, now + 0.15);
        subThudGain.gain.setValueAtTime(0.28, now);
        subThudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        subThud.connect(subThudGain);
        subThudGain.connect(hitMaster);
        subThud.start(now);
        subThud.stop(now + 0.16);

        // 2. Heavy Steel Impact Transient (Weighty mid-low hammer crack: 820Hz bandpass)
        const snapLen = Math.floor(this.ctx.sampleRate * 0.07);
        const snapBuf = this.ctx.createBuffer(1, snapLen, this.ctx.sampleRate);
        const snapData = snapBuf.getChannelData(0);
        for (let i = 0; i < snapLen; i++) {
            snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapLen * 0.22));
        }
        const snapSrc = this.ctx.createBufferSource();
        snapSrc.buffer = snapBuf;
        const snapFilt = this.ctx.createBiquadFilter();
        snapFilt.type = 'bandpass';
        snapFilt.frequency.setValueAtTime(820, now);
        snapFilt.Q.value = 1.8;
        const snapGain = this.ctx.createGain();
        snapGain.gain.setValueAtTime(0.32, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
        snapSrc.connect(snapFilt);
        snapFilt.connect(snapGain);
        snapGain.connect(hitMaster);
        snapSrc.start(now);

        // 3. Resonant Low-Q Metallic Hull Gong (Vibrating heavy 80-100mm armor plate: 580Hz)
        const clangLen = Math.floor(this.ctx.sampleRate * 0.35);
        const clangBuf = this.ctx.createBuffer(1, clangLen, this.ctx.sampleRate);
        const clangData = clangBuf.getChannelData(0);
        for (let i = 0; i < clangLen; i++) {
            clangData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clangLen * 0.28));
        }
        const clangSrc = this.ctx.createBufferSource();
        clangSrc.buffer = clangBuf;
        const clangFilt = this.ctx.createBiquadFilter();
        clangFilt.type = 'bandpass';
        clangFilt.frequency.setValueAtTime(580, now);
        clangFilt.Q.value = 12.0; // Resonant low ringing gong
        const clangGain = this.ctx.createGain();
        clangGain.gain.setValueAtTime(0.30, now);
        clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        clangSrc.connect(clangFilt);
        clangFilt.connect(clangGain);
        clangGain.connect(hitMaster);
        clangSrc.start(now);

        // 4. Inharmonic Low Steel Armor Plate Modes (Low deep hull gonging)
        // Mode 1: Primary deep steel resonance (~280Hz -> 265Hz)
        const ring1 = this.ctx.createOscillator();
        const ring1Gain = this.ctx.createGain();
        ring1.type = 'sine';
        ring1.frequency.setValueAtTime(280, now + 0.002);
        ring1.frequency.exponentialRampToValueAtTime(265, now + 0.40);
        ring1Gain.gain.setValueAtTime(0.18, now + 0.002);
        ring1Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.40);
        ring1.connect(ring1Gain);
        ring1Gain.connect(hitMaster);
        ring1.start(now + 0.002);
        ring1.stop(now + 0.40);

        // Mode 2: Secondary plate overtone (~440Hz -> 415Hz)
        const ring2 = this.ctx.createOscillator();
        const ring2Gain = this.ctx.createGain();
        ring2.type = 'sine';
        ring2.frequency.setValueAtTime(440, now + 0.002);
        ring2.frequency.exponentialRampToValueAtTime(415, now + 0.28);
        ring2Gain.gain.setValueAtTime(0.14, now + 0.002);
        ring2Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        ring2.connect(ring2Gain);
        ring2Gain.connect(hitMaster);
        ring2.start(now + 0.002);
        ring2.stop(now + 0.28);

        // Mode 3: Low metallic overtone (~620Hz -> 580Hz)
        const ring3 = this.ctx.createOscillator();
        const ring3Gain = this.ctx.createGain();
        ring3.type = 'sine';
        ring3.frequency.setValueAtTime(620, now + 0.001);
        ring3Gain.gain.setValueAtTime(0.09, now + 0.001);
        ring3Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        ring3.connect(ring3Gain);
        ring3Gain.connect(hitMaster);
        ring3.start(now + 0.001);
        ring3.stop(now + 0.16);

        // 5. Heavy Glance Deflection Groan (Low deflection sweep: 520Hz down to 160Hz)
        const whine = this.ctx.createOscillator();
        const whineGain = this.ctx.createGain();
        whine.type = 'triangle';
        whine.frequency.setValueAtTime(520, now + 0.005);
        whine.frequency.exponentialRampToValueAtTime(160, now + 0.22);
        whineGain.gain.setValueAtTime(0.11, now + 0.005);
        whineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        whine.connect(whineGain);
        whineGain.connect(hitMaster);
        whine.start(now + 0.005);
        whine.stop(now + 0.22);
    },

    playTreeCrack(posOrDist = 0) {
        if (!this.enabled || !this.ctx) return;
        try {
            const spatial = this.createSpatialGain(posOrDist, 20.0, 1.35, 0.0, 6000);
            if (spatial.dist > 180) return; // Completely silent beyond 180m
            const now = this.ctx.currentTime + (spatial.delay || 0);

            // 1. Deep Lower-Pitch Timber Splintering Cracks (Lowered pitch from ~950Hz to 360Hz..180Hz)
            const crackMoments = [
                { delay: 0.00, freq: 360, decay: 0.075, gain: 0.72 },
                { delay: 0.06, freq: 260, decay: 0.095, gain: 0.85 },
                { delay: 0.14, freq: 175, decay: 0.120, gain: 0.95 }
            ];

            crackMoments.forEach(cm => {
                const cTime = now + cm.delay;
                const cLen = Math.floor(this.ctx.sampleRate * cm.decay);
                const cBuf = this.ctx.createBuffer(1, cLen, this.ctx.sampleRate);
                const cDat = cBuf.getChannelData(0);
                for (let i = 0; i < cLen; i++) {
                    cDat[i] = (Math.random() * 2 - 1) * Math.exp(-i / (cLen * 0.28));
                }
                const cSrc = this.ctx.createBufferSource();
                cSrc.buffer = cBuf;
                const cFilt = this.ctx.createBiquadFilter();
                cFilt.type = 'bandpass';
                cFilt.frequency.setValueAtTime(cm.freq, cTime);
                cFilt.Q.setValueAtTime(2.2, cTime);

                const cGain = this.ctx.createGain();
                cGain.gain.setValueAtTime(cm.gain, cTime);
                cGain.gain.exponentialRampToValueAtTime(0.001, cTime + cm.decay);

                cSrc.connect(cFilt);
                cFilt.connect(cGain);
                cGain.connect(spatial.input);
                cSrc.start(cTime);
            });

            // 2. Heavy Wood Tension Groan & Torsion Strain (Sawtooth 150Hz -> 42Hz)
            const groanOsc = this.ctx.createOscillator();
            const groanFilt = this.ctx.createBiquadFilter();
            const groanGain = this.ctx.createGain();
            groanOsc.type = 'sawtooth';
            groanOsc.frequency.setValueAtTime(150, now);
            groanOsc.frequency.exponentialRampToValueAtTime(42, now + 0.45);

            groanFilt.type = 'lowpass';
            groanFilt.frequency.setValueAtTime(280, now);

            groanGain.gain.setValueAtTime(0.42, now);
            groanGain.gain.exponentialRampToValueAtTime(0.005, now + 0.48);

            groanOsc.connect(groanFilt);
            groanFilt.connect(groanGain);
            groanGain.connect(spatial.input);
            groanOsc.start(now);
            groanOsc.stop(now + 0.48);

            // 3. Rushing Canopy Needles & Foliage Air Whoosh (0.15s - 0.75s)
            const whooshLen = Math.floor(this.ctx.sampleRate * 0.65);
            const whooshBuf = this.ctx.createBuffer(1, whooshLen, this.ctx.sampleRate);
            const wData = whooshBuf.getChannelData(0);
            for (let i = 0; i < whooshLen; i++) {
                const prog = i / whooshLen;
                const env = Math.sin(prog * Math.PI);
                wData[i] = (Math.random() * 2 - 1) * env * 0.45;
            }
            const wSrc = this.ctx.createBufferSource();
            wSrc.buffer = whooshBuf;
            const wFilt = this.ctx.createBiquadFilter();
            wFilt.type = 'bandpass';
            wFilt.frequency.setValueAtTime(1050, now + 0.12);
            wFilt.frequency.exponentialRampToValueAtTime(480, now + 0.75);
            wFilt.Q.setValueAtTime(1.4, now + 0.12);

            const wGain = this.ctx.createGain();
            wGain.gain.setValueAtTime(0.01, now + 0.12);
            wGain.gain.linearRampToValueAtTime(0.55, now + 0.38);
            wGain.gain.exponentialRampToValueAtTime(0.005, now + 0.77);

            wSrc.connect(wFilt);
            wFilt.connect(wGain);
            wGain.connect(spatial.input);
            wSrc.start(now + 0.12);

            // 4. Heavy Earth Impact & Branch Breaking Crash at t = now + 0.55s
            const tImpact = now + 0.55;
            const thudOsc = this.ctx.createOscillator();
            const thudGain = this.ctx.createGain();
            thudOsc.type = 'sine';
            thudOsc.frequency.setValueAtTime(80, tImpact);
            thudOsc.frequency.exponentialRampToValueAtTime(22, tImpact + 0.48);
            thudGain.gain.setValueAtTime(0.85, tImpact);
            thudGain.gain.exponentialRampToValueAtTime(0.001, tImpact + 0.52);
            thudOsc.connect(thudGain);
            thudGain.connect(spatial.input);
            thudOsc.start(tImpact);
            thudOsc.stop(tImpact + 0.52);

            // Crunchy bough ground impact noise
            const boughLen = Math.floor(this.ctx.sampleRate * 0.35);
            const boughBuf = this.ctx.createBuffer(1, boughLen, this.ctx.sampleRate);
            const bData = boughBuf.getChannelData(0);
            for (let i = 0; i < boughLen; i++) {
                bData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (boughLen * 0.3));
            }
            const bSrc = this.ctx.createBufferSource();
            bSrc.buffer = boughBuf;
            const bFilt = this.ctx.createBiquadFilter();
            bFilt.type = 'bandpass';
            bFilt.frequency.setValueAtTime(540, tImpact);
            bFilt.Q.setValueAtTime(1.8, tImpact);
            const bGain = this.ctx.createGain();
            bGain.gain.setValueAtTime(0.58, tImpact);
            bGain.gain.exponentialRampToValueAtTime(0.001, tImpact + 0.35);
            bSrc.connect(bFilt);
            bFilt.connect(bGain);
            bGain.connect(spatial.input);
            bSrc.start(tImpact);
        } catch (e) {}
    },

    playTankExplosion() {
        this.playExplosion();
    },
    createSteelReverb(duration, wetLevel, startTime) {
        const length = Math.floor(this.ctx.sampleRate * duration);
        const impulse = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = impulse.getChannelData(0);
        const decay = duration * 0.30;
        const reflections = [0.013, 0.027, 0.044, 0.069, 0.101, 0.138];

        for (let i = 0; i < length; i++) {
            const t = i / this.ctx.sampleRate;
            data[i] = (Math.random() * 2 - 1) * Math.exp(-t / decay) * 0.22;
        }
        reflections.forEach((time, index) => {
            const sample = Math.floor(time * this.ctx.sampleRate);
            if (sample < length) {
                data[sample] += (index % 2 ? -1 : 1) * (0.72 - index * 0.08);
            }
        });

        const convolver = this.ctx.createConvolver();
        convolver.buffer = impulse;
        const wetGain = this.ctx.createGain();
        wetGain.gain.setValueAtTime(wetLevel, startTime);
        convolver.connect(wetGain);
        wetGain.connect(this.ctx.destination);
        return convolver;
    },
    playShellEject() {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        const steelReverb = this.createSteelReverb(0.95, 0.34, now);

        const playSteelNoise = (startTime, duration, startHz, endHz, volume, q, rattleHz = 0) => {
            const length = Math.floor(this.ctx.sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                const t = i / this.ctx.sampleRate;
                const envelope = Math.exp(-i / (length * 0.38));
                const rattle = rattleHz ? 0.45 + 0.55 * Math.abs(Math.sin(t * 2 * Math.PI * rattleHz)) : 1;
                data[i] = (Math.random() * 2 - 1) * envelope * rattle;
            }

            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(startHz * RELOAD_PITCH, startTime);
            filter.frequency.exponentialRampToValueAtTime(endHz * RELOAD_PITCH, startTime + duration);
            filter.Q.value = q;
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(volume, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            source.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            gain.connect(steelReverb);

            [{ ratio: 1.53, q: 5.2, level: 0.30 }, { ratio: 2.27, q: 7.0, level: 0.18 }].forEach(band => {
                const metalFilter = this.ctx.createBiquadFilter();
                metalFilter.type = 'bandpass';
                metalFilter.frequency.setValueAtTime(startHz * band.ratio * RELOAD_PITCH, startTime);
                metalFilter.frequency.exponentialRampToValueAtTime(endHz * band.ratio * RELOAD_PITCH, startTime + duration);
                metalFilter.Q.value = band.q;
                const metalGain = this.ctx.createGain();
                metalGain.gain.setValueAtTime(volume * band.level, startTime);
                metalGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                source.connect(metalFilter);
                metalFilter.connect(metalGain);
                metalGain.connect(this.ctx.destination);
                metalGain.connect(steelReverb);
            });

            source.start(startTime);
        };

        // Bolt handle releases, the breech slides open, and the block hits its stop.
        playSteelNoise(now, 0.045, 3200, 1300, 0.70, 4.0);
        playSteelNoise(now + 0.035, 0.22, 2000, 520, 0.56, 3.4, 72);
        playSteelNoise(now + 0.26, 0.12, 3400, 720, 0.86, 4.2, 110);

        // The spent case drops out in a loose series of metallic clatters.
        playSteelNoise(now + 0.36, 0.055, 3600, 1500, 0.48, 3.0, 95);
        playSteelNoise(now + 0.45, 0.05, 3100, 1250, 0.36, 2.8, 82);
        playSteelNoise(now + 0.54, 0.045, 2700, 1000, 0.26, 2.6, 70);
        playSteelNoise(now + 0.37, 0.11, 520, 150, 0.34, 1.3, 42);
    },

    playShellSlide() {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        const steelReverb = this.createSteelReverb(1.15, 0.28, now);

        // 1. Heavy shell ram scraping across steel guide rails
        const slideDuration = 0.70;
        const bufferSize = Math.floor(this.ctx.sampleRate * slideDuration);
        const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            const env = Math.pow(Math.sin(t * Math.PI * 0.95), 1.2);
            const grain = (Math.random() * 2 - 1) * ((i % 11 < 6) ? 1.0 : 0.45);
            d[i] = grain * env * 0.42;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        // Low-mid body of the shell moving through the chamber
        const bp1 = this.ctx.createBiquadFilter();
        bp1.type = 'bandpass';
        bp1.frequency.setValueAtTime(180 * RELOAD_PITCH, now);
        bp1.frequency.exponentialRampToValueAtTime(360 * RELOAD_PITCH, now + slideDuration);
        bp1.Q.value = 2.8;

        const bp2 = this.ctx.createBiquadFilter();
        bp2.type = 'bandpass';
        bp2.frequency.setValueAtTime(420 * RELOAD_PITCH, now);
        bp2.frequency.exponentialRampToValueAtTime(680 * RELOAD_PITCH, now + slideDuration);
        bp2.Q.value = 2.2;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(820 * RELOAD_PITCH, now);

        const slideGain = this.ctx.createGain();
        slideGain.gain.setValueAtTime(0.42, now);
        slideGain.gain.linearRampToValueAtTime(0.60, now + slideDuration * 0.75);
        slideGain.gain.exponentialRampToValueAtTime(0.01, now + slideDuration);

        src.connect(bp1);
        src.connect(bp2);
        bp1.connect(lp);
        bp2.connect(lp);
        lp.connect(slideGain);
        slideGain.connect(this.ctx.destination);
        slideGain.connect(steelReverb);
        src.start(now);

        // Brighter steel-on-steel friction rides above the low shell movement.
        const scrapeMetal = this.ctx.createBiquadFilter();
        scrapeMetal.type = 'bandpass';
        scrapeMetal.frequency.setValueAtTime(1900 * RELOAD_PITCH, now);
        scrapeMetal.frequency.exponentialRampToValueAtTime(3200 * RELOAD_PITCH, now + slideDuration * 0.55);
        scrapeMetal.frequency.exponentialRampToValueAtTime(1250 * RELOAD_PITCH, now + slideDuration);
        scrapeMetal.Q.value = 3.8;
        const scrapeMetalGain = this.ctx.createGain();
        scrapeMetalGain.gain.setValueAtTime(0.0001, now);
        scrapeMetalGain.gain.linearRampToValueAtTime(0.24, now + 0.12);
        scrapeMetalGain.gain.linearRampToValueAtTime(0.32, now + slideDuration * 0.65);
        scrapeMetalGain.gain.exponentialRampToValueAtTime(0.001, now + slideDuration);
        src.connect(scrapeMetal);
        scrapeMetal.connect(scrapeMetalGain);
        scrapeMetalGain.connect(this.ctx.destination);
        scrapeMetalGain.connect(steelReverb);

        // 2. Shell seats with a sharp metallic rim strike and hollow chamber body.
        const tSeat = now + 0.54;

        // Solid low-frequency metallic rim impact against chamber rifling throat
        const rimSnap = this.ctx.createOscillator();
        const rimGain = this.ctx.createGain();
        rimSnap.type = 'triangle';
        rimSnap.frequency.setValueAtTime(380 * RELOAD_PITCH, tSeat);
        rimSnap.frequency.exponentialRampToValueAtTime(110 * RELOAD_PITCH, tSeat + 0.08);
        rimGain.gain.setValueAtTime(0.58, tSeat);
        rimGain.gain.exponentialRampToValueAtTime(0.001, tSeat + 0.09);
        rimSnap.connect(rimGain);
        rimGain.connect(this.ctx.destination);
        rimGain.connect(steelReverb);
        rimSnap.start(tSeat);
        rimSnap.stop(tSeat + 0.09);

        // Short steel impact noise adds a hard edge without a pitched ring.
        const impactDuration = 0.075;
        const impactLength = Math.floor(this.ctx.sampleRate * impactDuration);
        const impactBuffer = this.ctx.createBuffer(1, impactLength, this.ctx.sampleRate);
        const impactData = impactBuffer.getChannelData(0);
        for (let i = 0; i < impactLength; i++) {
            impactData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (impactLength * 0.20));
        }
        const impactSource = this.ctx.createBufferSource();
        impactSource.buffer = impactBuffer;
        const impactFilter = this.ctx.createBiquadFilter();
        impactFilter.type = 'bandpass';
        impactFilter.frequency.setValueAtTime(2700 * RELOAD_PITCH, tSeat);
        impactFilter.Q.value = 2.8;
        const impactGain = this.ctx.createGain();
        impactGain.gain.setValueAtTime(0.48, tSeat);
        impactGain.gain.exponentialRampToValueAtTime(0.001, tSeat + impactDuration);
        impactSource.connect(impactFilter);
        impactFilter.connect(impactGain);
        impactGain.connect(this.ctx.destination);
        impactGain.connect(steelReverb);
        impactSource.start(tSeat);

        // A final hard steel-on-steel collision as the ram reaches the end of its travel.
        const tRamStop = now + slideDuration;
        const stopDuration = 0.055;
        const stopLength = Math.floor(this.ctx.sampleRate * stopDuration);
        const stopBuffer = this.ctx.createBuffer(1, stopLength, this.ctx.sampleRate);
        const stopData = stopBuffer.getChannelData(0);
        for (let i = 0; i < stopLength; i++) {
            stopData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (stopLength * 0.16));
        }
        const stopSource = this.ctx.createBufferSource();
        stopSource.buffer = stopBuffer;
        [2100, 3650].forEach((frequency, index) => {
            const stopFilter = this.ctx.createBiquadFilter();
            stopFilter.type = 'bandpass';
            stopFilter.frequency.setValueAtTime(frequency * RELOAD_PITCH, tRamStop);
            stopFilter.Q.value = index === 0 ? 2.8 : 4.2;
            const stopGain = this.ctx.createGain();
            stopGain.gain.setValueAtTime(index === 0 ? 0.88 : 0.48, tRamStop);
            stopGain.gain.exponentialRampToValueAtTime(0.001, tRamStop + stopDuration);
            stopSource.connect(stopFilter);
            stopFilter.connect(stopGain);
            stopGain.connect(this.ctx.destination);
            stopGain.connect(steelReverb);
        });
        stopSource.start(tRamStop);

        // Deep hollow barrel body keeps the ram's mass.
        const barrel = this.ctx.createOscillator();
        const barrelGain = this.ctx.createGain();
        barrel.type = 'sine';
        barrel.frequency.setValueAtTime(125 * RELOAD_PITCH, tSeat);
        barrel.frequency.exponentialRampToValueAtTime(42 * RELOAD_PITCH, tSeat + 0.28);
        barrelGain.gain.setValueAtTime(0.65, tSeat);
        barrelGain.gain.exponentialRampToValueAtTime(0.001, tSeat + 0.30);
        barrel.connect(barrelGain);
        barrelGain.connect(this.ctx.destination);
        barrel.start(tSeat);
        barrel.stop(tSeat + 0.30);
    },

    playBreechLock() {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        const steelReverb = this.createSteelReverb(1.8, 0.38, now);

        // 1. Short steel-on-steel bolt travel
        const rushLen = Math.floor(this.ctx.sampleRate * 0.065);
        const rushBuf = this.ctx.createBuffer(1, rushLen, this.ctx.sampleRate);
        const rushData = rushBuf.getChannelData(0);
        for (let i = 0; i < rushLen; i++) {
            rushData[i] = (Math.random() * 2 - 1) * Math.sin((i / rushLen) * Math.PI);
        }
        const rushSrc = this.ctx.createBufferSource();
        rushSrc.buffer = rushBuf;
        const rushFilter = this.ctx.createBiquadFilter();
        rushFilter.type = 'bandpass';
        rushFilter.frequency.setValueAtTime(620 * RELOAD_PITCH, now);
        rushFilter.frequency.linearRampToValueAtTime(1350 * RELOAD_PITCH, now + 0.06);
        rushFilter.Q.value = 2.4;
        const rushGain = this.ctx.createGain();
        rushGain.gain.setValueAtTime(0.30, now);
        rushGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
        rushSrc.connect(rushFilter);
        rushFilter.connect(rushGain);
        rushGain.connect(this.ctx.destination);
        rushSrc.start(now);

        // 2. Heavy breech block seats with a compact steel-on-steel clunk
        const tSlam = now + 0.06;

        // A. Low mechanical body impact
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(105 * RELOAD_PITCH, tSlam);
        sub.frequency.exponentialRampToValueAtTime(42 * RELOAD_PITCH, tSlam + 0.22);
        subGain.gain.setValueAtTime(0.55, tSlam);
        subGain.gain.exponentialRampToValueAtTime(0.001, tSlam + 0.24);
        sub.connect(subGain);
        subGain.connect(this.ctx.destination);
        sub.start(tSlam);
        sub.stop(tSlam + 0.24);

        // B. Short metallic contact as the bolt reaches its stop
        const strikeLen = Math.floor(this.ctx.sampleRate * 0.03);
        const strikeBuf = this.ctx.createBuffer(1, strikeLen, this.ctx.sampleRate);
        const strikeData = strikeBuf.getChannelData(0);
        for (let i = 0; i < strikeLen; i++) {
            strikeData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (strikeLen * 0.20));
        }
        const strikeSrc = this.ctx.createBufferSource();
        strikeSrc.buffer = strikeBuf;
        const strikeBp = this.ctx.createBiquadFilter();
        strikeBp.type = 'bandpass';
        strikeBp.frequency.setValueAtTime(2450 * RELOAD_PITCH, tSlam);
        strikeBp.Q.value = 3.6;
        const strikeGain = this.ctx.createGain();
        strikeGain.gain.setValueAtTime(0.66, tSlam);
        strikeGain.gain.exponentialRampToValueAtTime(0.001, tSlam + 0.03);
        strikeSrc.connect(strikeBp);
        strikeBp.connect(strikeGain);
        strikeGain.connect(this.ctx.destination);
        strikeGain.connect(steelReverb);
        strikeSrc.start(tSlam);

        // C. Midrange mechanical clunk
        const mid = this.ctx.createOscillator();
        const midFilter = this.ctx.createBiquadFilter();
        const midGain = this.ctx.createGain();
        mid.type = 'triangle';
        mid.frequency.setValueAtTime(270 * RELOAD_PITCH, tSlam);
        mid.frequency.exponentialRampToValueAtTime(85 * RELOAD_PITCH, tSlam + 0.16);
        midFilter.type = 'lowpass';
        midFilter.frequency.setValueAtTime(900 * RELOAD_PITCH, tSlam);
        midGain.gain.setValueAtTime(0.42, tSlam);
        midGain.gain.exponentialRampToValueAtTime(0.001, tSlam + 0.16);
        mid.connect(midFilter);
        midFilter.connect(midGain);
        midGain.connect(this.ctx.destination);
        midGain.connect(steelReverb);
        mid.start(tSlam);
        mid.stop(tSlam + 0.16);

        // D. Bright steel-body resonance as the breech locks home
        const steelModes = [620, 1180, 2050, 3100, 4200].map(frequency => frequency * RELOAD_PITCH);
        const modeWeights = [0.36, 0.28, 0.22, 0.15, 0.10];
        const modeDecays = [0.28, 0.24, 0.20, 0.16, 0.12];
        steelModes.forEach((rf, idx) => {
            const ringOsc = this.ctx.createOscillator();
            const ringG = this.ctx.createGain();
            ringOsc.type = (idx === 0) ? 'triangle' : 'sine';
            ringOsc.frequency.setValueAtTime(rf, tSlam + 0.002);
            ringG.gain.setValueAtTime(0.40 * modeWeights[idx], tSlam + 0.002);
            ringG.gain.exponentialRampToValueAtTime(0.0001, tSlam + modeDecays[idx]);
            ringOsc.connect(ringG);
            ringG.connect(this.ctx.destination);
            ringG.connect(steelReverb);
            ringOsc.start(tSlam + 0.002);
            ringOsc.stop(tSlam + modeDecays[idx]);
        });

        // 3. Bolt latch clicks into place
        const tLatch = tSlam + 0.075;
        const latchClickLen = Math.floor(this.ctx.sampleRate * 0.018);
        const latchClickBuf = this.ctx.createBuffer(1, latchClickLen, this.ctx.sampleRate);
        const latchClickData = latchClickBuf.getChannelData(0);
        for (let i = 0; i < latchClickLen; i++) {
            latchClickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (latchClickLen * 0.18));
        }
        const latchClickSrc = this.ctx.createBufferSource();
        latchClickSrc.buffer = latchClickBuf;
        const latchClickFilter = this.ctx.createBiquadFilter();
        latchClickFilter.type = 'bandpass';
        latchClickFilter.frequency.setValueAtTime(2200 * RELOAD_PITCH, tLatch);
        latchClickFilter.Q.value = 3.2;
        const latchClickGain = this.ctx.createGain();
        latchClickGain.gain.setValueAtTime(0.38, tLatch);
        latchClickGain.gain.exponentialRampToValueAtTime(0.001, tLatch + 0.022);
        latchClickSrc.connect(latchClickFilter);
        latchClickFilter.connect(latchClickGain);
        latchClickGain.connect(this.ctx.destination);
        latchClickGain.connect(steelReverb);
        latchClickSrc.start(tLatch);

        // Latch sear mechanical tone
        const latchOsc = this.ctx.createOscillator();
        const latchGain = this.ctx.createGain();
        latchOsc.type = 'triangle';
        latchOsc.frequency.setValueAtTime(900 * RELOAD_PITCH, tLatch);
        latchOsc.frequency.exponentialRampToValueAtTime(260 * RELOAD_PITCH, tLatch + 0.045);
        latchGain.gain.setValueAtTime(0.27, tLatch);
        latchGain.gain.exponentialRampToValueAtTime(0.001, tLatch + 0.05);
        latchOsc.connect(latchGain);
        latchGain.connect(this.ctx.destination);
        latchGain.connect(steelReverb);
        latchOsc.start(tLatch);
        latchOsc.stop(tLatch + 0.05);
    },

    // Soft descending whistle with an octave overtone
    playBombWhistle(duration = 1.4, sourcePosition = null) {
        this.init();
        if (!this.enabled || !this.ctx) return null;
        this.updateListenerPosition();
        const now = this.ctx.currentTime;
        const dur = Math.max(0.6, Math.min(8.0, duration));
        const panner = (typeof this.ctx.createPanner === 'function') ? this.ctx.createPanner() : null;
        if (panner) {
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 2;
            panner.maxDistance = 180;
            panner.rolloffFactor = 1;
        }

        // 1. Clean fundamental whistle oscillator (pure sine tone descending smoothly)
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(720, now);
        osc1.frequency.exponentialRampToValueAtTime(300, now + dur);

        // 2. Subtle octave overtone for acoustic body
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1440, now);
        osc2.frequency.exponentialRampToValueAtTime(600, now + dur);

        const osc2Gain = this.ctx.createGain();
        osc2Gain.gain.setValueAtTime(0.18, now);

        // 3. Master gain envelope (smooth click-free entry and clean sustain)
        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.linearRampToValueAtTime(0.09, now + 0.12);
        masterGain.gain.setValueAtTime(0.09, now + dur * 0.75);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc1.connect(masterGain);
        osc2.connect(osc2Gain);
        osc2Gain.connect(masterGain);
        if (panner) {
            masterGain.connect(panner);
            panner.connect(this.ctx.destination);
        } else {
            masterGain.connect(this.ctx.destination);
        }

        const setPosition = (position) => {
            if (!panner || !position) return;
            if (panner.positionX && typeof panner.positionX.setTargetAtTime === 'function') {
                const positionTime = this.ctx.currentTime;
                panner.positionX.setTargetAtTime(position.x, positionTime, 0.025);
                panner.positionY.setTargetAtTime(position.y, positionTime, 0.025);
                panner.positionZ.setTargetAtTime(position.z, positionTime, 0.025);
            } else if (typeof panner.setPosition === 'function') {
                panner.setPosition(position.x, position.y, position.z);
            }
        };
        setPosition(sourcePosition);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + dur + 0.05);
        osc2.stop(now + dur + 0.05);

        let stopped = false;
        return {
            setPosition,
            stop: () => {
                if (stopped) return;
                stopped = true;
                const stopTime = this.ctx.currentTime;
                masterGain.gain.cancelScheduledValues(stopTime);
                masterGain.gain.setValueAtTime(masterGain.gain.value, stopTime);
                masterGain.gain.exponentialRampToValueAtTime(0.0001, stopTime + 0.02);
            }
        };
    }
};

window.soundFX = soundFX;
