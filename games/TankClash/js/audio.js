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
            const tx = posOrDist.x !== undefined ? posOrDist.x : 0;
            const ty = posOrDist.y !== undefined ? posOrDist.y : 0;
            const tz = posOrDist.z !== undefined ? posOrDist.z : 0;
            return Math.hypot(tx - px, ty - py, tz - pz);
        }
        return 0;
    },

    // Create 3D spatial attenuation node graph (Inverse-distance falloff + air absorption lowpass filter)
    createSpatialGain(posOrDist, refDist = 28.0, rolloff = 1.15, minGain = 0.0, maxCutoff = 8000) {
        const dist = this.getPlayerDistance(posOrDist);
        if (dist <= 0.1) {
            // Near or at player's own position: full volume, zero filtering
            return {
                input: this.ctx.destination,
                gainNode: null,
                gain: 1.0,
                cutoff: maxCutoff,
                dist: 0
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

        return {
            input: filter,
            gainNode,
            gain: gainVal,
            cutoff,
            dist
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

    updateEngine(speedRatio, isDriving) {
        if (!this.initialized || !this.ctx) return;
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
        const now = this.ctx.currentTime;
        const spatial = this.createSpatialGain(posOrDist, 42.0, 1.25, 0.05, 8000);

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

    playT34Cannon(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        const spatial = this.createSpatialGain(posOrDist, 42.0, 1.25, 0.05, 8000);

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
        const now = this.ctx.currentTime;
        const spatial = this.createSpatialGain(posOrDist, 55.0, 1.45, 0.08, 9500);

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
        const now = this.ctx.currentTime;
        const spatial = this.createSpatialGain(posOrDist, 45.0, 1.25, 0.06, 8500);

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
        const now = this.ctx.currentTime;
        const spatial = this.createSpatialGain(posOrDist, 35.0, 1.2, 0.02, 7500);
        if (spatial.gain < 0.01) return;

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
        const snapLen = Math.floor(this.ctx.sampleRate * 0.05);
        const snapBuf = this.ctx.createBuffer(1, snapLen, this.ctx.sampleRate);
        const snapData = snapBuf.getChannelData(0);
        for (let i = 0; i < snapLen; i++) {
            snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapLen * 0.22));
        }
        const snapSrc = this.ctx.createBufferSource();
        snapSrc.buffer = snapBuf;
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
        const clickLen = Math.floor(this.ctx.sampleRate * 0.025);
        const clickBuf = this.ctx.createBuffer(1, clickLen, this.ctx.sampleRate);
        const clickData = clickBuf.getChannelData(0);
        for (let i = 0; i < clickLen; i++) {
            clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickLen * 0.15));
        }
        const clickSrc = this.ctx.createBufferSource();
        clickSrc.buffer = clickBuf;
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
        const now = this.ctx.currentTime;
        const spatial = this.createSpatialGain(posOrDist, 40.0, 1.25, 0.02, 8000);
        if (spatial.gain < 0.01) return;

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
        const crackLen = Math.floor(this.ctx.sampleRate * 0.08);
        const crackBuf = this.ctx.createBuffer(1, crackLen, this.ctx.sampleRate);
        const crackData = crackBuf.getChannelData(0);
        for (let i = 0; i < crackLen; i++) {
            crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crackLen * 0.18));
        }
        const crackSrc = this.ctx.createBufferSource();
        crackSrc.buffer = crackBuf;
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
        const roarLen = Math.floor(this.ctx.sampleRate * 0.22);
        const roarBuf = this.ctx.createBuffer(1, roarLen, this.ctx.sampleRate);
        const roarData = roarBuf.getChannelData(0);
        for (let i = 0; i < roarLen; i++) {
            roarData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (roarLen * 0.25));
        }
        const roarSrc = this.ctx.createBufferSource();
        roarSrc.buffer = roarBuf;
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
        const tailLen = Math.floor(this.ctx.sampleRate * 0.42);
        const tailBuf = this.ctx.createBuffer(1, tailLen, this.ctx.sampleRate);
        const tailData = tailBuf.getChannelData(0);
        for (let i = 0; i < tailLen; i++) {
            tailData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (tailLen * 0.35));
        }
        const tailSrc = this.ctx.createBufferSource();
        tailSrc.buffer = tailBuf;
        const tailFilt = this.ctx.createBiquadFilter();
        tailFilt.type = 'lowpass';
        tailFilt.frequency.setValueAtTime(450, now + 0.04);
        const tailGain = this.ctx.createGain();
        tailGain.gain.setValueAtTime(0.001, now);
        tailGain.gain.setValueAtTime(0.45, now + 0.04);
        tailGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
        tailSrc.connect(tailFilt);
        tailFilt.connect(tailGain);
        tailGain.connect(spatial.input);
        tailSrc.start(now + 0.02);
    },

    playImpactExplosion(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        const spatial = this.createSpatialGain(posOrDist, 38.0, 1.15, 0.04, 7500);

        // 1. Initial High-Energy Supersonic Shockwave Crack (Violent high-pressure transient)
        const crackBufferSize = Math.floor(this.ctx.sampleRate * 0.14);
        const crackBuf = this.ctx.createBuffer(1, crackBufferSize, this.ctx.sampleRate);
        const crackData = crackBuf.getChannelData(0);
        for (let i = 0; i < crackBufferSize; i++) {
            crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.024));
        }
        const crackSrc = this.ctx.createBufferSource();
        crackSrc.buffer = crackBuf;

        const crackFilter = this.ctx.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime(1400, now);
        crackFilter.Q.setValueAtTime(1.8, now);

        const crackGain = this.ctx.createGain();
        crackGain.gain.setValueAtTime(0.95, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

        crackSrc.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(spatial.input);
        crackSrc.start(now);

        // 2. Heavy HE Blast Roar & Debris Rumble (Deep, thundering broad noise blast - High Volume)
        const rumbleBufferSize = Math.floor(this.ctx.sampleRate * 1.9);
        const rumbleBuf = this.ctx.createBuffer(1, rumbleBufferSize, this.ctx.sampleRate);
        const rumbleData = rumbleBuf.getChannelData(0);
        for (let i = 0; i < rumbleBufferSize; i++) {
            rumbleData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.48));
        }
        const rumbleSrc = this.ctx.createBufferSource();
        rumbleSrc.buffer = rumbleBuf;

        const rumbleFilter = this.ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.setValueAtTime(680, now);
        rumbleFilter.frequency.exponentialRampToValueAtTime(110, now + 1.6);

        const rumbleGain = this.ctx.createGain();
        rumbleGain.gain.setValueAtTime(1.25, now); // Significantly increased blast volume
        rumbleGain.gain.exponentialRampToValueAtTime(0.002, now + 1.85);

        rumbleSrc.connect(rumbleFilter);
        rumbleFilter.connect(rumbleGain);
        rumbleGain.connect(spatial.input);
        rumbleSrc.start(now);

        // 3. Sub-Bass Concussion Thump (Visceral chest-hitting shock: 160Hz down to 26Hz)
        const subOsc = this.ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(160, now);
        subOsc.frequency.exponentialRampToValueAtTime(26, now + 0.58);

        const subGain = this.ctx.createGain();
        subGain.gain.setValueAtTime(1.15, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);

        subOsc.connect(subGain);
        subGain.connect(spatial.input);
        subOsc.start(now);
        subOsc.stop(now + 0.68);

        // 4. Secondary Ground Debris Spatter (Pebbles and scorched earth fallout)
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
        dFilter.frequency.setValueAtTime(950, now);
        dFilter.Q.setValueAtTime(2.2, now);

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

    // Realistic Multi-Stage Tree Toppling & Canopy Ground Crash (Deep Low-Pitch Timber Snap)

    // Deep heavy-armor bullet / shell deflection glance & bright metallic clang with distance falloff
    playArmorRicochet(posOrDist = 0) {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        const spatial = this.createSpatialGain(posOrDist, 30.0, 1.25, 0.0, 14000);
        if (spatial.gain < 0.01) return;

        // 1. Heavy Armor Solid Mass Thud (Punchy low-frequency hull substrate: 180Hz down to 50Hz)
        const thud = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thud.type = 'triangle';
        thud.frequency.setValueAtTime(180, now);
        thud.frequency.exponentialRampToValueAtTime(50, now + 0.07);
        thudGain.gain.setValueAtTime(0.70, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        thud.connect(thudGain);
        thudGain.connect(spatial.input);
        thud.start(now);
        thud.stop(now + 0.08);

        // 2. High-Frequency Hard Steel Impact Snap (Biting supersonic metal-on-metal crack)
        const snapLen = Math.floor(this.ctx.sampleRate * 0.05);
        const snapBuf = this.ctx.createBuffer(1, snapLen, this.ctx.sampleRate);
        const snapData = snapBuf.getChannelData(0);
        for (let i = 0; i < snapLen; i++) {
            snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapLen * 0.18));
        }
        const snapSrc = this.ctx.createBufferSource();
        snapSrc.buffer = snapBuf;
        const snapFilt = this.ctx.createBiquadFilter();
        snapFilt.type = 'bandpass';
        snapFilt.frequency.setValueAtTime(3600, now);
        snapFilt.Q.value = 3.2;
        const snapGain = this.ctx.createGain();
        snapGain.gain.setValueAtTime(0.85, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        snapSrc.connect(snapFilt);
        snapFilt.connect(snapGain);
        snapGain.connect(spatial.input);
        snapSrc.start(now);

        // 3. Resonant High-Q Metallic Clang Filter (Vibrating steel plate clang excitation)
        const clangLen = Math.floor(this.ctx.sampleRate * 0.28);
        const clangBuf = this.ctx.createBuffer(1, clangLen, this.ctx.sampleRate);
        const clangData = clangBuf.getChannelData(0);
        for (let i = 0; i < clangLen; i++) {
            clangData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clangLen * 0.25));
        }
        const clangSrc = this.ctx.createBufferSource();
        clangSrc.buffer = clangBuf;
        const clangFilt = this.ctx.createBiquadFilter();
        clangFilt.type = 'bandpass';
        clangFilt.frequency.setValueAtTime(2280, now);
        clangFilt.Q.value = 18.0; // High Q generates unmistakable hollow metallic ring
        const clangGain = this.ctx.createGain();
        clangGain.gain.setValueAtTime(0.75, now);
        clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        clangSrc.connect(clangFilt);
        clangFilt.connect(clangGain);
        clangGain.connect(spatial.input);
        clangSrc.start(now);

        // 4. Inharmonic Armor Plate Chime Modes (Distinctive metallic "PING / TING" anvil ringing)
        // Mode 1: Primary steel chime (~1620Hz)
        const ring1 = this.ctx.createOscillator();
        const ring1Gain = this.ctx.createGain();
        ring1.type = 'sine';
        ring1.frequency.setValueAtTime(1620, now + 0.002);
        ring1.frequency.exponentialRampToValueAtTime(1580, now + 0.35);
        ring1Gain.gain.setValueAtTime(0.48, now + 0.002);
        ring1Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        ring1.connect(ring1Gain);
        ring1Gain.connect(spatial.input);
        ring1.start(now + 0.002);
        ring1.stop(now + 0.35);

        // Mode 2: High inharmonic metallic partial (~2860Hz)
        const ring2 = this.ctx.createOscillator();
        const ring2Gain = this.ctx.createGain();
        ring2.type = 'sine';
        ring2.frequency.setValueAtTime(2860, now + 0.002);
        ring2.frequency.exponentialRampToValueAtTime(2780, now + 0.24);
        ring2Gain.gain.setValueAtTime(0.38, now + 0.002);
        ring2Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        ring2.connect(ring2Gain);
        ring2Gain.connect(spatial.input);
        ring2.start(now + 0.002);
        ring2.stop(now + 0.24);

        // Mode 3: Sharp overtone shimmer (~4380Hz)
        const ring3 = this.ctx.createOscillator();
        const ring3Gain = this.ctx.createGain();
        ring3.type = 'sine';
        ring3.frequency.setValueAtTime(4380, now + 0.001);
        ring3Gain.gain.setValueAtTime(0.24, now + 0.001);
        ring3Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        ring3.connect(ring3Gain);
        ring3Gain.connect(spatial.input);
        ring3.start(now + 0.001);
        ring3.stop(now + 0.12);

        // 5. Classic High-Velocity Bullet Ricochet Whine / Zinger ("Pwwweee-ee-ew")
        const whine = this.ctx.createOscillator();
        const whineGain = this.ctx.createGain();
        whine.type = 'sine';
        whine.frequency.setValueAtTime(3200, now + 0.005);
        whine.frequency.exponentialRampToValueAtTime(820, now + 0.22);
        whineGain.gain.setValueAtTime(0.40, now + 0.005);
        whineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        whine.connect(whineGain);
        whineGain.connect(spatial.input);
        whine.start(now + 0.005);
        whine.stop(now + 0.24);
    },

    playTreeCrack(posOrDist = 0) {
        if (!this.enabled || !this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const spatial = this.createSpatialGain(posOrDist, 20.0, 1.35, 0.0, 6000);
            if (spatial.dist > 180) return; // Completely silent beyond 180m

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
    playShellEject() {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;

        // 1. Mechanical steel extractor claw strike & initial breach scrape
        // Sharp metallic snap transient (extractor grabbing case rim)
        const snapLen = Math.floor(this.ctx.sampleRate * 0.045);
        const snapBuf = this.ctx.createBuffer(1, snapLen, this.ctx.sampleRate);
        const snapData = snapBuf.getChannelData(0);
        for (let i = 0; i < snapLen; i++) {
            snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapLen * 0.22));
        }
        const snapSrc = this.ctx.createBufferSource();
        snapSrc.buffer = snapBuf;
        const snapFilter = this.ctx.createBiquadFilter();
        snapFilter.type = 'bandpass';
        snapFilter.frequency.setValueAtTime(2400 * RELOAD_PITCH, now);
        snapFilter.Q.value = 3.5;
        const snapGain = this.ctx.createGain();
        snapGain.gain.setValueAtTime(0.42, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        snapSrc.connect(snapFilter);
        snapFilter.connect(snapGain);
        snapGain.connect(this.ctx.destination);
        snapSrc.start(now);

        // High-velocity metal slide/friction as shell flies along guide chute
        const scrapeLen = Math.floor(this.ctx.sampleRate * 0.075);
        const scrapeBuf = this.ctx.createBuffer(1, scrapeLen, this.ctx.sampleRate);
        const scrapeData = scrapeBuf.getChannelData(0);
        for (let i = 0; i < scrapeLen; i++) {
            scrapeData[i] = (Math.random() * 2 - 1) * Math.sin((i / scrapeLen) * Math.PI);
        }
        const scrapeSrc = this.ctx.createBufferSource();
        scrapeSrc.buffer = scrapeBuf;
        const scrapeFilter = this.ctx.createBiquadFilter();
        scrapeFilter.type = 'bandpass';
        scrapeFilter.frequency.setValueAtTime(1550 * RELOAD_PITCH, now);
        scrapeFilter.frequency.exponentialRampToValueAtTime(850 * RELOAD_PITCH, now + 0.075);
        scrapeFilter.Q.value = 2.8;
        const scrapeGain = this.ctx.createGain();
        scrapeGain.gain.setValueAtTime(0.35, now);
        scrapeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
        scrapeSrc.connect(scrapeFilter);
        scrapeFilter.connect(scrapeGain);
        scrapeGain.connect(this.ctx.destination);
        scrapeSrc.start(now);

        // 2. Heavy hollow brass casing resonant clinking & bouncing off deflector
        // Metallic modal ringing of heavy brass shell casing:
        const bounces = [
            { time: now + 0.025, baseFreq: 820 * RELOAD_PITCH, decay: 0.26, vol: 0.45 },
            { time: now + 0.130, baseFreq: 940 * RELOAD_PITCH, decay: 0.20, vol: 0.35 },
            { time: now + 0.245, baseFreq: 760 * RELOAD_PITCH, decay: 0.16, vol: 0.25 }
        ];

        bounces.forEach(b => {
            // High-frequency metallic impact transient (clink ping)
            const pingLen = Math.floor(this.ctx.sampleRate * 0.02);
            const pingBuf = this.ctx.createBuffer(1, pingLen, this.ctx.sampleRate);
            const pingData = pingBuf.getChannelData(0);
            for (let i = 0; i < pingLen; i++) {
                pingData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (pingLen * 0.25));
            }
            const pingSrc = this.ctx.createBufferSource();
            pingSrc.buffer = pingBuf;
            const pingFilter = this.ctx.createBiquadFilter();
            pingFilter.type = 'bandpass';
            pingFilter.frequency.setValueAtTime(2800 * RELOAD_PITCH, b.time);
            pingFilter.Q.value = 3.0;
            const pingGain = this.ctx.createGain();
            pingGain.gain.setValueAtTime(b.vol * 0.65, b.time);
            pingGain.gain.exponentialRampToValueAtTime(0.001, b.time + 0.02);
            pingSrc.connect(pingFilter);
            pingFilter.connect(pingGain);
            pingGain.connect(this.ctx.destination);
            pingSrc.start(b.time);

            // Inharmonic resonant modal tones of cylindrical brass casing
            // Brass casing modes: fundamental f, 1.58f, 2.32f, 3.45f
            const modes = [b.baseFreq, b.baseFreq * 1.58, b.baseFreq * 2.32, b.baseFreq * 3.45];
            const modeGains = [0.45, 0.32, 0.18, 0.10];
            modes.forEach((f, idx) => {
                const osc = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                osc.type = (idx % 2 === 0) ? 'triangle' : 'sine';
                osc.frequency.setValueAtTime(f, b.time);
                g.gain.setValueAtTime(b.vol * modeGains[idx], b.time);
                g.gain.exponentialRampToValueAtTime(0.0001, b.time + b.decay);
                osc.connect(g);
                g.connect(this.ctx.destination);
                osc.start(b.time);
                osc.stop(b.time + b.decay);
            });
        });

        // 3. Heavy hollow casing thump & hull contact
        const thud = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thud.type = 'triangle';
        thud.frequency.setValueAtTime(160 * RELOAD_PITCH, now + 0.03);
        thud.frequency.exponentialRampToValueAtTime(45 * RELOAD_PITCH, now + 0.22);
        thudGain.gain.setValueAtTime(0.35, now + 0.03);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        thud.connect(thudGain);
        thudGain.connect(this.ctx.destination);
        thud.start(now + 0.03);
        thud.stop(now + 0.22);
    },

    playShellSlide() {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;

        // 1. Gritty, heavy low-mid metal-on-metal friction as 15kg shell slides along steel guide tray
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

        // Low-mid bandpass filters modeling deep chamber cavity (warm, zero high-pitched hiss)
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
        src.start(now);

        // 2. SHELL SEATING INTO BARREL (Deep mechanical clack & resonant barrel thud)
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
        rimSnap.start(tSeat);
        rimSnap.stop(tSeat + 0.09);

        // Deep hollow barrel resonance ("TUNG-THUD" inside 8.8cm tube)
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

        // 1. High-speed polished steel wedge sliding rush (rising metallic friction slide)
        const rushLen = Math.floor(this.ctx.sampleRate * 0.04);
        const rushBuf = this.ctx.createBuffer(1, rushLen, this.ctx.sampleRate);
        const rushData = rushBuf.getChannelData(0);
        for (let i = 0; i < rushLen; i++) {
            rushData[i] = (Math.random() * 2 - 1) * Math.sin((i / rushLen) * Math.PI);
        }
        const rushSrc = this.ctx.createBufferSource();
        rushSrc.buffer = rushBuf;
        const rushFilter = this.ctx.createBiquadFilter();
        rushFilter.type = 'bandpass';
        rushFilter.frequency.setValueAtTime(750 * RELOAD_PITCH, now);
        rushFilter.frequency.linearRampToValueAtTime(1650 * RELOAD_PITCH, now + 0.038);
        rushFilter.Q.value = 2.4;
        const rushGain = this.ctx.createGain();
        rushGain.gain.setValueAtTime(0.38, now);
        rushGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        rushSrc.connect(rushFilter);
        rushFilter.connect(rushGain);
        rushGain.connect(this.ctx.destination);
        rushSrc.start(now);

        // 2. Colossal Forged Krupp Steel Breech Slam ("CLANG-CHUNCK!") at tSlam
        const tSlam = now + 0.036;

        // A. Heavy kinetic impact mass shockwave (70-90kg hardened steel block)
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(125 * RELOAD_PITCH, tSlam);
        sub.frequency.exponentialRampToValueAtTime(28 * RELOAD_PITCH, tSlam + 0.32);
        subGain.gain.setValueAtTime(0.85, tSlam);
        subGain.gain.exponentialRampToValueAtTime(0.001, tSlam + 0.35);
        sub.connect(subGain);
        subGain.connect(this.ctx.destination);
        sub.start(tSlam);
        sub.stop(tSlam + 0.35);

        // B. Sharp forged steel-on-steel collision impact transient bite (hard metallic strike)
        const strikeLen = Math.floor(this.ctx.sampleRate * 0.035);
        const strikeBuf = this.ctx.createBuffer(1, strikeLen, this.ctx.sampleRate);
        const strikeData = strikeBuf.getChannelData(0);
        for (let i = 0; i < strikeLen; i++) {
            strikeData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (strikeLen * 0.20));
        }
        const strikeSrc = this.ctx.createBufferSource();
        strikeSrc.buffer = strikeBuf;
        const strikeBp = this.ctx.createBiquadFilter();
        strikeBp.type = 'bandpass';
        strikeBp.frequency.setValueAtTime(2500 * RELOAD_PITCH, tSlam);
        strikeBp.Q.value = 3.6;
        const strikeGain = this.ctx.createGain();
        strikeGain.gain.setValueAtTime(0.75, tSlam);
        strikeGain.gain.exponentialRampToValueAtTime(0.001, tSlam + 0.04);
        strikeSrc.connect(strikeBp);
        strikeBp.connect(strikeGain);
        strikeGain.connect(this.ctx.destination);
        strikeSrc.start(tSlam);

        // C. Hardened steel body collision punch (metallic mid crunch)
        const mid = this.ctx.createOscillator();
        const midFilter = this.ctx.createBiquadFilter();
        const midGain = this.ctx.createGain();
        mid.type = 'sawtooth';
        mid.frequency.setValueAtTime(320 * RELOAD_PITCH, tSlam);
        mid.frequency.exponentialRampToValueAtTime(95 * RELOAD_PITCH, tSlam + 0.18);
        midFilter.type = 'lowpass';
        midFilter.frequency.setValueAtTime(1150 * RELOAD_PITCH, tSlam);
        midGain.gain.setValueAtTime(0.65, tSlam);
        midGain.gain.exponentialRampToValueAtTime(0.001, tSlam + 0.20);
        mid.connect(midFilter);
        midFilter.connect(midGain);
        midGain.connect(this.ctx.destination);
        mid.start(tSlam);
        mid.stop(tSlam + 0.20);

        // D. High-tensile steel anvil / breech ring modal chime (distinct metallic ring-out)
        const steelModes = [680, 1280, 1980, 2920, 4150].map(frequency => frequency * RELOAD_PITCH);
        const modeWeights = [0.42, 0.34, 0.24, 0.15, 0.08];
        const modeDecays = [0.38, 0.32, 0.25, 0.18, 0.12];
        steelModes.forEach((rf, idx) => {
            const ringOsc = this.ctx.createOscillator();
            const ringG = this.ctx.createGain();
            ringOsc.type = (idx === 0) ? 'triangle' : 'sine';
            ringOsc.frequency.setValueAtTime(rf, tSlam + 0.002);
            ringG.gain.setValueAtTime(0.40 * modeWeights[idx], tSlam + 0.002);
            ringG.gain.exponentialRampToValueAtTime(0.0001, tSlam + modeDecays[idx]);
            ringOsc.connect(ringG);
            ringG.connect(this.ctx.destination);
            ringOsc.start(tSlam + 0.002);
            ringOsc.stop(tSlam + modeDecays[idx]);
        });

        // 3. Crisp spring-loaded latch sear snap ("TCHICK-KLACK!")
        const tLatch = tSlam + 0.055;
        // High metallic click burst
        const latchClickLen = Math.floor(this.ctx.sampleRate * 0.02);
        const latchClickBuf = this.ctx.createBuffer(1, latchClickLen, this.ctx.sampleRate);
        const latchClickData = latchClickBuf.getChannelData(0);
        for (let i = 0; i < latchClickLen; i++) {
            latchClickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (latchClickLen * 0.18));
        }
        const latchClickSrc = this.ctx.createBufferSource();
        latchClickSrc.buffer = latchClickBuf;
        const latchClickFilter = this.ctx.createBiquadFilter();
        latchClickFilter.type = 'bandpass';
        latchClickFilter.frequency.setValueAtTime(3200 * RELOAD_PITCH, tLatch);
        latchClickFilter.Q.value = 4.0;
        const latchClickGain = this.ctx.createGain();
        latchClickGain.gain.setValueAtTime(0.50, tLatch);
        latchClickGain.gain.exponentialRampToValueAtTime(0.001, tLatch + 0.025);
        latchClickSrc.connect(latchClickFilter);
        latchClickFilter.connect(latchClickGain);
        latchClickGain.connect(this.ctx.destination);
        latchClickSrc.start(tLatch);

        // Latch sear mechanical tone
        const latchOsc = this.ctx.createOscillator();
        const latchGain = this.ctx.createGain();
        latchOsc.type = 'triangle';
        latchOsc.frequency.setValueAtTime(1450, tLatch);
        latchOsc.frequency.exponentialRampToValueAtTime(380, tLatch + 0.05);
        latchGain.gain.setValueAtTime(0.40, tLatch);
        latchGain.gain.exponentialRampToValueAtTime(0.001, tLatch + 0.06);
        latchOsc.connect(latchGain);
        latchGain.connect(this.ctx.destination);
        latchOsc.start(tLatch);
        latchOsc.stop(tLatch + 0.06);
    },

    // Soft descending whistle with an octave overtone
    playBombWhistle(duration = 1.4) {
        this.init();
        if (!this.enabled || !this.ctx) return null;
        const now = this.ctx.currentTime;
        const dur = Math.max(0.6, Math.min(2.5, duration));

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
        masterGain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + dur + 0.05);
        osc2.stop(now + dur + 0.05);

        let stopped = false;
        return {
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
