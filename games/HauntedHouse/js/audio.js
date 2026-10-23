// ============================================================================
// HAUNTED HOUSE — PROCEDURAL WEBAUDIO GOTHIC SOUNDSCAPE & SCARE SYNTHESIZER
// ============================================================================
(() => {
  'use strict';
  const { rr, pick } = window.HH;

  let ctx = null;
  let masterGain = null;
  let muted = false;
  let initialized = false;
  let nextMusicNoteTime = 0;

  // D Harmonic Minor scale frequencies for eerie Victorian music-box / harpsichord notes
  const SCALE = [293.66, 329.63, 349.23, 392.00, 440.00, 466.16, 554.37, 587.33, 659.25, 698.46];

  function ensureAudio() {
    if (initialized) {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 0.55;
    masterGain.connect(ctx.destination);

    // Sub-bass Gothic Organ Drone (D1 + A1)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const droneFilter = ctx.createBiquadFilter();
    const droneGain = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 36.71; // D1
    osc2.type = 'triangle';
    osc2.frequency.value = 55.0;  // A1
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 135;
    droneGain.gain.value = 0.16;
    osc1.connect(droneFilter);
    osc2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(masterGain);
    osc1.start();
    osc2.start();

    initialized = true;
    return true;
  }

  function playMusicBoxNote() {
    if (!initialized || muted) return;
    const now = ctx.currentTime;
    const freq = pick(SCALE);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    // Subtle detuned antique music-box warble
    osc.frequency.exponentialRampToValueAtTime(freq * 0.996, now + 1.8);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.065, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 2.1);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 2.15);
  }

  function playFootstep(isStone = false) {
    if (!initialized || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isStone ? 125 : 82, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.09);

    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  function playScareSFX(type) {
    if (!ensureAudio() || muted) return;
    const now = ctx.currentTime;

    if (type === 'ghost') {
      // Spectral banshee choir wail + dissonant shimmer
      for (const fBase of [520, 695, 880]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(fBase * rr(0.95, 1.05), now);
        osc.frequency.exponentialRampToValueAtTime(fBase * 1.38, now + 0.45);
        osc.frequency.exponentialRampToValueAtTime(fBase * 0.72, now + 1.45);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.14, now + 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(now);
        osc.stop(now + 1.55);
      }
    } else if (type === 'skeleton') {
      // Dry bone rattle clatter + low jump stinger
      for (let i = 0; i < 6; i++) {
        const t0 = now + i * 0.055;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(rr(420, 920), t0);
        osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.045);
        g.gain.setValueAtTime(0.11, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.055);
      }
    } else if (type === 'scarecrow') {
      // Deep sinister horror chord + creaking post
      for (const f of [110, 116.5, 233.08, 311.13]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.linearRampToValueAtTime(f * 0.92, now + 0.9);
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(now);
        osc.stop(now + 1.0);
      }
    } else if (type === 'bats') {
      // High-pitched bat screeches & rapid wing-flaps
      for (let i = 0; i < 7; i++) {
        const t0 = now + i * 0.07;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(rr(1800, 2900), t0);
        osc.frequency.exponentialRampToValueAtTime(950, t0 + 0.06);
        g.gain.setValueAtTime(0.07, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.065);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.07);
      }
    } else if (type === 'raven') {
      // Raspy crow "CAW! CAW!"
      for (let c = 0; c < 2; c++) {
        const t0 = now + c * 0.24;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(620, t0);
        osc.frequency.exponentialRampToValueAtTime(340, t0 + 0.18);
        g.gain.setValueAtTime(0.11, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.19);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(t0);
        osc.stop(t0 + 0.20);
      }
    } else if (type === 'armor') {
      // Metallic halberd blade slash & clang
      for (const f of [380, 740, 1190, 1640]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);
        g.gain.setValueAtTime(0.10, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.7);
      }
    } else if (type === 'spirit_flash') {
      // Resonant crystalline exorcise chime
      for (const f of [440, 659.25, 880, 1318.5]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 1.5, now + 0.65);
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.75);
      }
    }
  }

  function updateAudio(time) {
    if (!initialized || muted) return;
    if (time > nextMusicNoteTime) {
      playMusicBoxNote();
      nextMusicNoteTime = time + rr(0.55, 1.45);
    }
  }

  function toggleMute() {
    ensureAudio();
    muted = !muted;
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(muted ? 0 : 0.55, ctx.currentTime);
    }
    return muted;
  }

  // Unlock WebAudio on first user interaction
  window.addEventListener('pointerdown', () => ensureAudio(), { once: true });
  window.addEventListener('keydown', () => ensureAudio(), { once: true });

  window.HH.AUDIO = {
    ensureAudio,
    playFootstep,
    playScareSFX,
    updateAudio,
    toggleMute,
    isMuted: () => muted
  };
})();
