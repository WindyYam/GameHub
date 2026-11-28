/**
 * Pure Web Audio Procedural Icelandic Soundscape:
 * Valley wind, spatial 3D waterfall roar, glacial river stream, Timefall rain hiss,
 * surface-aware footsteps (moss / gravel / water), Odradek pulse, and Aurora shimmer pad.
 */
import { clamp } from './noise.js';

export function createAudioSystem() {
  let ctx = null;
  let masterGain = null;
  let windGain = null;
  let windFilter = null;
  let wfGain = null;
  let rainGain = null;
  let auroraGain = null;
  let laserOsc = null;
  let laserGain = null;
  let laserNoiseGain = null;
  let laserNoiseFilter = null;
  let bikeOsc1 = null;
  let bikeOsc2 = null;
  let bikeGain = null;
  let bikeRumbleGain = null;
  let noiseBuf = null;
  let thunderBus = null;
  let thunderReverb = null;
  let muted = false;
  let started = false;

  function makeWhiteNoiseBuffer(audioCtx) {
    const len = audioCtx.sampleRate * 3;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // Pink-ish noise shaping for natural wind & water roar
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = clamp(b0 + b1 + b2 + white * 0.04, -1, 1);
    }
    return buf;
  }

  function startLoopNode(filterType, freq, q) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start();
    return { filter, gain };
  }

  function init() {
    if (started) {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 0.42;
    masterGain.connect(ctx.destination);

    noiseBuf = makeWhiteNoiseBuffer(ctx);

    // Dedicated compressed thunder bus + 4.8s dark valley reverb impulse response
    thunderBus = ctx.createDynamicsCompressor();
    thunderBus.threshold.value = -10;
    thunderBus.knee.value = 12;
    thunderBus.ratio.value = 6;
    thunderBus.attack.value = 0.005;
    thunderBus.release.value = 0.35;
    const thunderBusGain = ctx.createGain();
    thunderBusGain.gain.value = 1.65;
    thunderBus.connect(thunderBusGain);
    thunderBusGain.connect(masterGain);

    const irLen = Math.floor(ctx.sampleRate * 4.8);
    const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const chData = irBuf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < irLen; i++) {
        const tSec = i / ctx.sampleRate;
        const env = Math.exp(-tSec * 0.72) * (1.0 - Math.exp(-tSec * 28.0));
        // Add distinct mountain-wall echo reflections at ~0.35s, ~0.85s, ~1.55s
        const echo =
          1.0 +
          0.45 * Math.exp(-Math.pow((tSec - 0.36) * 8.0, 2.0)) +
          0.35 * Math.exp(-Math.pow((tSec - 0.88) * 5.0, 2.0)) +
          0.25 * Math.exp(-Math.pow((tSec - 1.58) * 3.5, 2.0));
        const white = Math.random() * 2 - 1;
        lp = lp * 0.78 + white * 0.22;
        chData[i] = lp * env * echo;
      }
    }
    thunderReverb = ctx.createConvolver();
    thunderReverb.buffer = irBuf;
    const revWet = ctx.createGain();
    revWet.gain.value = 1.45;
    thunderReverb.connect(revWet);
    revWet.connect(thunderBus);

    const wind = startLoopNode('bandpass', 320, 1.8);
    windFilter = wind.filter;
    windGain = wind.gain;

    const wf = startLoopNode('lowpass', 580, 0.7);
    wfGain = wf.gain;

    const rain = startLoopNode('highpass', 1800, 0.5);
    rainGain = rain.gain;

    // Gentle ethereal fifth-chord drone when Aurora Borealis appears
    auroraGain = ctx.createGain();
    auroraGain.gain.value = 0;
    auroraGain.connect(masterGain);
    [146.83, 220.0, 293.66].forEach((hz) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = 0.04;
      osc.connect(g);
      g.connect(auroraGain);
      osc.start();
    });

    // 3D Laser Printer continuous harmonic hum + crisp sintering crackle
    laserGain = ctx.createGain();
    laserGain.gain.value = 0;
    laserGain.connect(masterGain);
    laserOsc = ctx.createOscillator();
    laserOsc.type = 'sawtooth';
    laserOsc.frequency.value = 180;
    const laserFilter = ctx.createBiquadFilter();
    laserFilter.type = 'bandpass';
    laserFilter.frequency.value = 880;
    laserFilter.Q.value = 3.2;
    laserOsc.connect(laserFilter);
    laserFilter.connect(laserGain);
    laserOsc.start();

    const laserNoise = startLoopNode('bandpass', 2400, 4.0);
    laserNoiseFilter = laserNoise.filter;
    laserNoiseGain = laserNoise.gain;

    // Electric Bridges RT-04 Motorcycle futuristic turbine drive + tire gravel rumble
    bikeGain = ctx.createGain();
    bikeGain.gain.value = 0;
    bikeGain.connect(masterGain);
    const bikeFilter = ctx.createBiquadFilter();
    bikeFilter.type = 'lowpass';
    bikeFilter.frequency.value = 720;
    bikeFilter.connect(bikeGain);

    bikeOsc1 = ctx.createOscillator();
    bikeOsc1.type = 'triangle';
    bikeOsc1.frequency.value = 68;
    bikeOsc1.connect(bikeFilter);
    bikeOsc1.start();

    bikeOsc2 = ctx.createOscillator();
    bikeOsc2.type = 'sine';
    bikeOsc2.frequency.value = 136;
    const bikeOsc2G = ctx.createGain();
    bikeOsc2G.gain.value = 0.35;
    bikeOsc2.connect(bikeOsc2G);
    bikeOsc2G.connect(bikeFilter);
    bikeOsc2.start();

    const bikeRumble = startLoopNode('lowpass', 260, 0.9);
    bikeRumbleGain = bikeRumble.gain;

    started = true;
  }

  function setMuted(m) {
    muted = !!m;
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, ctx.currentTime, 0.08);
    }
  }

  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  function playFootstep(surface, sprinting) {
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();

    if (surface === 'water') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1150, now);
      g.gain.setValueAtTime(sprinting ? 0.16 : 0.11, now);
    } else if (surface === 'gravel') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(920, now);
      g.gain.setValueAtTime(sprinting ? 0.13 : 0.08, now);
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, now);
      g.gain.setValueAtTime(sprinting ? 0.12 : 0.075, now);
    }

    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(now, Math.random() * 1.5, 0.16);
  }

  function playOdradekChime() {
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.16);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.45);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  function playPrintCompleteChime() {
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 1046.5].forEach((hz, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + idx * 0.065;
      osc.frequency.setValueAtTime(hz, t0);
      g.gain.setValueAtTime(0.085, t0);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.55);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.58);
    });
  }

  function setLaserPrintAudio(active, progress) {
    if (!started || !ctx || !laserGain) return;
    const now = ctx.currentTime;
    if (active && !muted) {
      const freq = 175 + progress * 240 + Math.sin(now * 28.0) * 26;
      laserOsc.frequency.setTargetAtTime(freq, now, 0.03);
      laserGain.gain.setTargetAtTime(0.11, now, 0.05);
      laserNoiseFilter.frequency.setTargetAtTime(1900 + progress * 1400 + Math.sin(now * 42.0) * 350, now, 0.03);
      laserNoiseGain.gain.setTargetAtTime(0.075, now, 0.05);
    } else {
      laserGain.gain.setTargetAtTime(0.0, now, 0.06);
      laserNoiseGain.gain.setTargetAtTime(0.0, now, 0.06);
    }
  }

  function setBikeAudio(riding, speedAbs, boosting) {
    if (!started || !ctx || !bikeGain) return;
    const now = ctx.currentTime;
    if (riding && !muted) {
      const spNorm = clamp(speedAbs / 24.0, 0, 1.0);
      const baseHz = 62 + spNorm * 145 + (boosting ? 28 : 0);
      bikeOsc1.frequency.setTargetAtTime(baseHz, now, 0.06);
      bikeOsc2.frequency.setTargetAtTime(baseHz * (boosting ? 2.25 : 2.02), now, 0.06);
      bikeGain.gain.setTargetAtTime((0.065 + spNorm * 0.13) * (boosting ? 0.88 : 1.0), now, 0.08);
      bikeRumbleGain.gain.setTargetAtTime(clamp(spNorm * 0.15, 0, 0.15), now, 0.08);
    } else {
      bikeGain.gain.setTargetAtTime(0.0, now, 0.12);
      bikeRumbleGain.gain.setTargetAtTime(0.0, now, 0.12);
    }
  }

  function update(playerPos, waterfallPositions, windStrength, rainIntensity, auroraStrength) {
    if (!started || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    const windVol = clamp(0.08 + windStrength * 0.16, 0.05, 0.44);
    windGain.gain.setTargetAtTime(windVol, now, 0.25);
    windFilter.frequency.setTargetAtTime(240 + windStrength * 290 + Math.sin(now * 0.45) * 85, now, 0.2);

    let minWfDist = 9999;
    for (const p of waterfallPositions) {
      const d = playerPos.distanceTo(p);
      if (d < minWfDist) minWfDist = d;
    }
    const wfVol = clamp(1.0 - minWfDist / 320, 0, 1);
    wfGain.gain.setTargetAtTime(wfVol * wfVol * 0.28, now, 0.2);

    const stormRainBoost = rainIntensity > 0.85 ? 1.55 : 1.0;
    rainGain.gain.setTargetAtTime(rainIntensity * 0.16 * stormRainBoost, now, 0.25);
    auroraGain.gain.setTargetAtTime(auroraStrength * 0.35, now, 0.5);
  }

  function playThunder(distanceM = 350, intensity = 1.0) {
    if (!started || !ctx || muted || !noiseBuf || !thunderBus) return;
    if (ctx.state === 'suspended') ctx.resume();
    const dist = clamp(distanceM, 60, 1200);
    const distNorm = clamp((dist - 150) / 600, 0, 1); // 0 = close violent strike, 1 = distant rolling rumble
    const delay = clamp(dist / 343.0, 0.06, 2.6);
    const atten = clamp(1.22 - dist / 1250, 0.35, 1.15) * clamp(intensity, 0.6, 1.4);
    const t0 = ctx.currentTime + delay;

    // 1) Sharp initial thunderclap crack (bright & violent when close; air-absorbed & absent when far)
    if (dist < 580) {
      const closeFactor = 1.0 - dist / 580;
      const crackCount = Math.random() < 0.42 ? 2 : 1;
      for (let c = 0; c < crackCount; c++) {
        const ct = t0 + c * (0.06 + Math.random() * 0.09);
        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = noiseBuf;
        crackSrc.loop = true;
        crackSrc.playbackRate.value = 0.85 + Math.random() * 0.35;
        const crackFilter = ctx.createBiquadFilter();
        crackFilter.type = 'bandpass';
        const startHz = (1800 - distNorm * 1100) * (0.85 + Math.random() * 0.3);
        crackFilter.frequency.setValueAtTime(Math.max(320, startHz), ct);
        crackFilter.frequency.exponentialRampToValueAtTime(120 + Math.random() * 70, ct + 0.34);
        crackFilter.Q.value = 0.65 + Math.random() * 0.35;
        const crackGain = ctx.createGain();
        const crackPeak = (2.8 * closeFactor * atten) * (c === 0 ? 1.0 : 0.62);
        crackGain.gain.setValueAtTime(0.0001, ct);
        crackGain.gain.linearRampToValueAtTime(crackPeak, ct + 0.008 + distNorm * 0.025);
        crackGain.gain.exponentialRampToValueAtTime(0.0001, ct + 0.38 + Math.random() * 0.22);
        crackSrc.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(thunderBus);
        if (thunderReverb) crackGain.connect(thunderReverb);
        crackSrc.start(ct, Math.random() * 2.5);
        crackSrc.stop(ct + 0.65);
      }
    }

    // 2) Sub-bass shockwave (stronger & punchier on close strikes, softer & deeper on distant ones)
    const subOsc = ctx.createOscillator();
    subOsc.type = Math.random() < 0.5 ? 'triangle' : 'sine';
    const subStartHz = (72 - distNorm * 22) * (0.88 + Math.random() * 0.24);
    subOsc.frequency.setValueAtTime(subStartHz, t0);
    subOsc.frequency.exponentialRampToValueAtTime(22 + Math.random() * 8, t0 + 1.8 + distNorm * 0.8);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t0);
    subGain.gain.linearRampToValueAtTime((0.85 - distNorm * 0.40) * atten, t0 + 0.025 + distNorm * 0.09);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0 + distNorm * 0.8);
    subOsc.connect(subGain);
    subGain.connect(thunderBus);
    subOsc.start(t0);
    subOsc.stop(t0 + 2.9);

    // 3) Randomized, distance-shaped rolling valley thunder (close = crisp & punchy; far = deep, muffled & long-rolling)
    const dur = 4.6 + distNorm * 2.4 + Math.random() * 1.8;
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = noiseBuf;
    rumbleSrc.loop = true;
    rumbleSrc.playbackRate.value = 0.78 + Math.random() * 0.42;

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    const startCut = (520 - distNorm * 340) * (0.85 + Math.random() * 0.30);
    rumbleFilter.frequency.setValueAtTime(Math.max(130, startCut), t0);
    rumbleFilter.frequency.exponentialRampToValueAtTime(42 + Math.random() * 18, t0 + dur);
    rumbleFilter.Q.value = 0.70 + Math.random() * 0.45;

    const attackTime = 0.03 + distNorm * 0.26;
    const swell1T = 0.65 + Math.random() * 0.45;
    const swell2T = swell1T + 0.7 + Math.random() * 0.6;
    const swell3T = swell2T + 0.9 + Math.random() * 0.8;
    const peak = 2.8 * atten;

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, t0);
    rumbleGain.gain.linearRampToValueAtTime(peak, t0 + attackTime);
    rumbleGain.gain.exponentialRampToValueAtTime(peak * (0.38 + Math.random() * 0.16), t0 + swell1T);
    rumbleGain.gain.linearRampToValueAtTime(peak * (0.55 + Math.random() * 0.22), t0 + swell1T + 0.32);
    rumbleGain.gain.exponentialRampToValueAtTime(peak * (0.24 + Math.random() * 0.12), t0 + swell2T);
    rumbleGain.gain.linearRampToValueAtTime(peak * (0.28 + Math.random() * 0.18), t0 + swell2T + 0.42);
    rumbleGain.gain.exponentialRampToValueAtTime(peak * 0.12, t0 + Math.min(dur - 0.4, swell3T));
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1.0 - distNorm * 0.45; // Close strikes are drier/punchier; distant strikes are wetter
    rumbleSrc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(dryGain);
    dryGain.connect(thunderBus);
    if (thunderReverb) {
      const wetSend = ctx.createGain();
      wetSend.gain.value = 0.85 + distNorm * 0.75;
      rumbleGain.connect(wetSend);
      wetSend.connect(thunderReverb);
    }
    rumbleSrc.start(t0, Math.random() * 2.5);
    rumbleSrc.stop(t0 + dur + 0.05);
  }

  return {
    init,
    setMuted,
    toggleMute,
    isMuted: () => muted,
    playFootstep,
    playOdradekChime,
    playPrintCompleteChime,
    playThunder,
    setLaserPrintAudio,
    setBikeAudio,
    update
  };
}
