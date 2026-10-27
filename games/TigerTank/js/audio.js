// ============================================================================
// TigerTank Audio Synthesizer (Web Audio API)
// Maybach HL230 V12 Engine, 8.8cm KwK 36 Cannon, MG34, Low-Pitch Reload Sequence
// ============================================================================

const soundFX = {
    ctx: null,
    enabled: true,
    engineOsc: null,
    engineSub: null,
    engineGain: null,
    initialized: false,

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
        const baseFreq = 34 + speedRatio * 58 + (isDriving ? 6 : 0);
        this.engineOsc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.08);
        this.engineSub.frequency.setTargetAtTime(baseFreq * 0.5, this.ctx.currentTime, 0.08);
        this.engineGain.gain.setTargetAtTime(0.035 + speedRatio * 0.045, this.ctx.currentTime, 0.1);
    },

    play88mmCannon() {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;

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
        gain.connect(this.ctx.destination);
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
        oscGain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
    },

    playMG34Shot() {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;

        const bufferSize = Math.floor(this.ctx.sampleRate * 0.065);
        const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        const bandpass = this.ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 1100;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

        src.connect(bandpass);
        bandpass.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(now);
    },

    playImpactExplosion() {
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.9);
        const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 320;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.38, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.85);

        src.connect(lp);
        lp.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(now);
    },

    playShellEject() {
        this.init();
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;

        // 1. Initial mechanical extractor kick & deep metallic scrape transient
        const kickLen = Math.floor(this.ctx.sampleRate * 0.08);
        const kickBuf = this.ctx.createBuffer(1, kickLen, this.ctx.sampleRate);
        const kickData = kickBuf.getChannelData(0);
        for (let i = 0; i < kickLen; i++) {
            kickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (kickLen * 0.28));
        }
        const kickSrc = this.ctx.createBufferSource();
        kickSrc.buffer = kickBuf;
        const kickFilter = this.ctx.createBiquadFilter();
        kickFilter.type = 'bandpass';
        kickFilter.frequency.setValueAtTime(680, now);
        kickFilter.Q.value = 2.0;
        const kickGain = this.ctx.createGain();
        kickGain.gain.setValueAtTime(0.48, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        kickSrc.connect(kickFilter);
        kickFilter.connect(kickGain);
        kickGain.connect(this.ctx.destination);
        kickSrc.start(now);

        // 2. Heavy hollow 8.8cm brass cartridge casing clatter and bounce (deep resonant chute bounces)
        const bounces = [
            { time: now + 0.02, freq: 320, decay: 0.36, vol: 0.40 },
            { time: now + 0.15, freq: 360, decay: 0.26, vol: 0.28 },
            { time: now + 0.29, freq: 290, decay: 0.20, vol: 0.20 }
        ];

        bounces.forEach(b => {
            // Brass hollow cylinder modal resonance (fundamental + low inharmonics)
            const modes = [b.freq, b.freq * 1.52, b.freq * 2.18];
            const modeGains = [0.55, 0.30, 0.15];
            modes.forEach((f, idx) => {
                const osc = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                osc.type = (idx === 0) ? 'triangle' : 'sine';
                osc.frequency.setValueAtTime(f, b.time);
                g.gain.setValueAtTime(b.vol * modeGains[idx], b.time);
                g.gain.exponentialRampToValueAtTime(0.0001, b.time + b.decay);
                osc.connect(g);
                g.connect(this.ctx.destination);
                osc.start(b.time);
                osc.stop(b.time + b.decay);
            });
        });

        // 3. Heavy hollow casing thump on turret basket floor
        const thud = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(95, now + 0.05);
        thud.frequency.exponentialRampToValueAtTime(32, now + 0.28);
        thudGain.gain.setValueAtTime(0.42, now + 0.05);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        thud.connect(thudGain);
        thudGain.connect(this.ctx.destination);
        thud.start(now + 0.05);
        thud.stop(now + 0.28);
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
        bp1.frequency.setValueAtTime(180, now);
        bp1.frequency.exponentialRampToValueAtTime(360, now + slideDuration);
        bp1.Q.value = 2.8;

        const bp2 = this.ctx.createBiquadFilter();
        bp2.type = 'bandpass';
        bp2.frequency.setValueAtTime(420, now);
        bp2.frequency.exponentialRampToValueAtTime(680, now + slideDuration);
        bp2.Q.value = 2.2;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(820, now);

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
        rimSnap.frequency.setValueAtTime(380, tSeat);
        rimSnap.frequency.exponentialRampToValueAtTime(110, tSeat + 0.08);
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
        barrel.frequency.setValueAtTime(125, tSeat);
        barrel.frequency.exponentialRampToValueAtTime(42, tSeat + 0.28);
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

        // 1. Deep mechanical sliding rush as the spring-loaded wedge releases (first 35ms)
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
        rushFilter.frequency.setValueAtTime(320, now);
        rushFilter.linearRampToValueAtTime(520, now + 0.035);
        const rushGain = this.ctx.createGain();
        rushGain.gain.setValueAtTime(0.32, now);
        rushGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
        rushSrc.connect(rushFilter);
        rushFilter.connect(rushGain);
        rushGain.connect(this.ctx.destination);
        rushSrc.start(now);

        // 2. Colossal Krupp Forged Steel Breech Slam ("CHUNCK!") at t = now + 0.035
        const tSlam = now + 0.035;

        // A. Deep sub-bass kinetic impact shockwave (70kg forged steel block)
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(115, tSlam);
        sub.frequency.exponentialRampToValueAtTime(26, tSlam + 0.30);
        subGain.gain.setValueAtTime(0.90, tSlam);
        subGain.gain.exponentialRampToValueAtTime(0.001, tSlam + 0.34);
        sub.connect(subGain);
        subGain.connect(this.ctx.destination);
        sub.start(tSlam);
        sub.stop(tSlam + 0.34);

        // B. Hardened armor steel impact punch (mid-body metal collision, no shrill highs)
        const mid = this.ctx.createOscillator();
        const midFilter = this.ctx.createBiquadFilter();
        const midGain = this.ctx.createGain();
        mid.type = 'sawtooth';
        mid.frequency.setValueAtTime(240, tSlam);
        mid.frequency.exponentialRampToValueAtTime(70, tSlam + 0.16);
        midFilter.type = 'lowpass';
        midFilter.frequency.setValueAtTime(420, tSlam);
        midGain.gain.setValueAtTime(0.70, tSlam);
        midGain.gain.exponentialRampToValueAtTime(0.001, tSlam + 0.18);
        mid.connect(midFilter);
        midFilter.connect(midGain);
        midGain.connect(this.ctx.destination);
        mid.start(tSlam);
        mid.stop(tSlam + 0.18);

        // C. Solid mechanical contact transient crack (grounded 720 Hz bandpass, no screech)
        const crackLen = Math.floor(this.ctx.sampleRate * 0.03);
        const crackBuf = this.ctx.createBuffer(1, crackLen, this.ctx.sampleRate);
        const crackData = crackBuf.getChannelData(0);
        for (let i = 0; i < crackLen; i++) {
            crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crackLen * 0.25));
        }
        const crackSrc = this.ctx.createBufferSource();
        crackSrc.buffer = crackBuf;
        const crackBp = this.ctx.createBiquadFilter();
        crackBp.type = 'bandpass';
        crackBp.frequency.setValueAtTime(720, tSlam);
        crackBp.Q.value = 2.5;
        const crackGain = this.ctx.createGain();
        crackGain.gain.setValueAtTime(0.55, tSlam);
        crackGain.gain.exponentialRampToValueAtTime(0.001, tSlam + 0.035);
        crackSrc.connect(crackBp);
        crackBp.connect(crackGain);
        crackGain.connect(this.ctx.destination);
        crackSrc.start(tSlam);

        // D. Armored turret ringing resonance (low reverberation inside Tiger hull)
        const ringModes = [92, 185, 310];
        ringModes.forEach((rf, idx) => {
            const ringOsc = this.ctx.createOscillator();
            const ringG = this.ctx.createGain();
            ringOsc.type = 'sine';
            ringOsc.frequency.setValueAtTime(rf, tSlam + 0.01);
            ringG.gain.setValueAtTime(0.30 / (idx + 1), tSlam + 0.01);
            ringG.gain.exponentialRampToValueAtTime(0.0001, tSlam + 0.35);
            ringOsc.connect(ringG);
            ringG.connect(this.ctx.destination);
            ringOsc.start(tSlam + 0.01);
            ringOsc.stop(tSlam + 0.35);
        });

        // 3. Heavy mechanical latch sear clack ("KLACK!") as safety interlock engages
        const tLatch = tSlam + 0.065;
        const latchOsc = this.ctx.createOscillator();
        const latchGain = this.ctx.createGain();
        latchOsc.type = 'triangle';
        latchOsc.frequency.setValueAtTime(520, tLatch);
        latchOsc.frequency.exponentialRampToValueAtTime(160, tLatch + 0.06);
        latchGain.gain.setValueAtTime(0.45, tLatch);
        latchGain.gain.exponentialRampToValueAtTime(0.001, tLatch + 0.07);
        latchOsc.connect(latchGain);
        latchGain.connect(this.ctx.destination);
        latchOsc.start(tLatch);
        latchOsc.stop(tLatch + 0.07);
    }
};

window.soundFX = soundFX;
