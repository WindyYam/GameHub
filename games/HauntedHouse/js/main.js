// ============================================================================
// HAUNTED HOUSE — FIRST-PERSON CINEMATIC CAMERA DIRECTOR, FX & MAIN LOOP
// ============================================================================
(() => {
  'use strict';
  const {
    clamp, lerp, rand, rr,
    scene, camera, TEX, candleFlameMat, floorFogMat,
    finalMat, renderPipeline, lightPool, updateDynamicLights,
    WORLD, AUDIO
  } = window.HH;

  // ---------- Floating Golden Candle Embers & Spectral Dust Motes ----------
  const DUST_COUNT = 260;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustVel = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPos[i * 3] = rr(-8, 8);
    dustPos[i * 3 + 1] = rr(0.2, 5.5);
    dustPos[i * 3 + 2] = rr(-14, 6);
    dustVel.push({
      vx: rr(-0.15, 0.15),
      vy: rr(0.06, 0.28),
      vz: rr(-0.15, 0.15),
      phase: rand() * Math.PI * 2
    });
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: TEX.softGlow,
    color: 0xffd28a,
    size: 0.042,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);

  // ---------- Multi-Layered Volumetric Floor Fog Clusters (4 Strata per Cluster) ----------
  function buildLayeredFogClusterGeo() {
    const strataHeights = [0.06, 0.18, 0.34, 0.52];
    const strataSizes   = [5.4,  4.8,  4.1,  3.4];
    const grid = 8;
    const vertsPerSheet = (grid + 1) * (grid + 1);
    const trisPerSheet = grid * grid * 2;
    const numLayers = strataHeights.length;

    const positions = new Float32Array(numLayers * vertsPerSheet * 3);
    const uvs = new Float32Array(numLayers * vertsPerSheet * 2);
    const layers = new Float32Array(numLayers * vertsPerSheet);
    const seeds = new Float32Array(numLayers * vertsPerSheet);
    const indices = new Uint16Array(numLayers * trisPerSheet * 3);

    let vOut = 0;
    let iOut = 0;

    for (let L = 0; L < numLayers; L++) {
      const layerFrac = L / (numLayers - 1);
      const yBase = strataHeights[L];
      const sz = strataSizes[L];
      const ox = (L % 2 === 0 ? -1 : 1) * 0.28 * L;
      const oz = (L === 1 || L === 2 ? 1 : -1) * 0.24 * L;
      const rot = L * 0.55;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const seedVal = 0.17 + L * 0.23;
      const baseVertex = vOut;

      for (let iy = 0; iy <= grid; iy++) {
        const v = iy / grid;
        const lz = (v - 0.5) * sz;
        for (let ix = 0; ix <= grid; ix++) {
          const u = ix / grid;
          const lx = (u - 0.5) * sz;
          const rx = lx * cosR - lz * sinR + ox;
          const rz = lx * sinR + lz * cosR + oz;
          // Gentle dome camber so the center of each puff swells slightly higher than its feathered rim
          const r2 = (u - 0.5) * (u - 0.5) + (v - 0.5) * (v - 0.5);
          const dome = Math.max(0, 1.0 - r2 * 4.0) * (0.06 + 0.05 * layerFrac);

          positions[vOut * 3]     = rx;
          positions[vOut * 3 + 1] = yBase + dome;
          positions[vOut * 3 + 2] = rz;
          uvs[vOut * 2]           = u;
          uvs[vOut * 2 + 1]       = v;
          layers[vOut]            = layerFrac;
          seeds[vOut]             = seedVal;
          vOut++;
        }
      }

      for (let iy = 0; iy < grid; iy++) {
        for (let ix = 0; ix < grid; ix++) {
          const a = baseVertex + iy * (grid + 1) + ix;
          const b = a + 1;
          const c = a + (grid + 1);
          const d = c + 1;
          indices[iOut++] = a; indices[iOut++] = c; indices[iOut++] = b;
          indices[iOut++] = b; indices[iOut++] = c; indices[iOut++] = d;
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }

  const FOG_CLUSTER_COUNT = 32;
  const clusterFogGeo = buildLayeredFogClusterGeo();
  const mistGroup = new THREE.Group();
  const fogClusters = [];
  for (let i = 0; i < FOG_CLUSTER_COUNT; i++) {
    const mesh = new THREE.Mesh(clusterFogGeo, floorFogMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    const isWideBank = (i % 3 !== 0);
    mesh.userData = {
      sOffset: -5.0 + (i / FOG_CLUSTER_COUNT) * 44.0,
      latFactor: isWideBank ? rr(-0.85, 0.85) : rr(-0.32, 0.32),
      flowSpeed: rr(0.55, 1.15),
      swaySpeed: rr(0.45, 0.90),
      swayAmp: rr(0.65, 1.55),
      scaleBase: rr(0.95, 1.48),
      phase: rand() * Math.PI * 2
    };
    mistGroup.add(mesh);
    fogClusters.push(mesh);
  }
  scene.add(mistGroup);

  // ---------- State & Cinematic Camera Path Variables ----------
  const _urlS = parseFloat(new URLSearchParams(window.location.search).get('s'));
  let distanceS = Number.isFinite(_urlS) ? _urlS : 2.2;
  let walkSpeed = 3.2; // meters per second
  let paused = false;
  let lanternMode = 'warm'; // 'warm' | 'uv' | 'off'
  let freeLookMode = true;  // Hold user's camera offset angle while following the path!

  // Look offsets relative to path forward tangent (radians)
  let userYawOffset = 0;
  let userPitchOffset = 0;
  let targetYawOffset = 0;
  let targetPitchOffset = 0;
  let isPointerDown = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  const heldKeys = new Set();

  // Scare & Heartbeat state
  let scarePulse = 0;
  let spiritFlash = 0;
  let scareCount = 0;
  let heartBPM = 76;
  let stepCycle = 0;
  let prevStepSin = 0;

  // UI Elements
  const elDepth = document.getElementById('vDepth');
  const elScares = document.getElementById('vScares');
  const elBPM = document.getElementById('vBPM');
  const elZone = document.getElementById('zoneBanner');
  const elToast = document.getElementById('scareToast');
  const elSpeedSlider = document.getElementById('speedSlider');
  const elSpeedVal = document.getElementById('speedVal');
  const elYawSlider = document.getElementById('yawSlider');
  const elYawVal = document.getElementById('yawVal');
  const elPitchSlider = document.getElementById('pitchSlider');
  const elPitchVal = document.getElementById('pitchVal');
  const btnResetCam = document.getElementById('btnResetCam');
  const btnLantern = document.getElementById('btnLantern');
  const btnScare = document.getElementById('btnScare');
  const btnPulse = document.getElementById('btnPulse');
  const btnCamMode = document.getElementById('btnCamMode');
  const btnAudio = document.getElementById('btnAudio');

  function wrapAnglePi(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function syncAngleUI() {
    const yawDeg = Math.round(( -targetYawOffset * 180) / Math.PI);
    const pitchDeg = Math.round((targetPitchOffset * 180) / Math.PI);
    if (elYawSlider) elYawSlider.value = String(clamp(yawDeg, -180, 180));
    if (elYawVal) elYawVal.textContent = `${yawDeg > 0 ? '+' : ''}${yawDeg}°`;
    if (elPitchSlider) elPitchSlider.value = String(clamp(pitchDeg, -75, 75));
    if (elPitchVal) elPitchVal.textContent = `${pitchDeg > 0 ? '+' : ''}${pitchDeg}°`;
  }

  function resetCameraOffset() {
    targetYawOffset = 0;
    targetPitchOffset = 0;
    syncAngleUI();
  }

  const THEME_LABELS = {
    GRAND_GALLERY: 'COLOSSAL GRAND STAIRCASE ATRIUM',
    STAIRCASE_HALL: 'IMPERIAL MEZZANINE GREAT HALL',
    CATACOMB_TUNNEL: 'ANCIENT CATACOMB TUNNEL',
    HAUNTED_CONSERVATORY: 'MOONLIT SCARECROW CLOISTER'
  };

  const SCARE_MESSAGES = {
    ghost: 'SPECTRAL APPARITION EMERGES!',
    skeleton: 'SKELETON RISES FROM ITS THRONE!',
    scarecrow: 'TWISTED SCARECROW LURCHES FREE!',
    bats: 'VAMPIRE BAT SWARM DESCENDS!',
    raven: 'OMINOUS RAVEN TAKES FLIGHT!',
    armor: 'CURSED HALBERD SLASHES!'
  };

  let toastTimeout = null;
  function showScareToast(text) {
    if (!elToast) return;
    elToast.textContent = text;
    elToast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => elToast.classList.remove('show'), 2300);
  }

  function onScareTrigger(type) {
    scareCount++;
    if (elScares) elScares.textContent = String(scareCount);
    scarePulse = Math.min(1.0, scarePulse + (type === 'raven' ? 0.25 : 0.65));
    heartBPM = Math.min(168, heartBPM + (type === 'raven' ? 14 : 38));
    showScareToast(SCARE_MESSAGES[type] || 'SOMETHING LURKS IN THE DARK!');
    AUDIO.playScareSFX(type);
  }

  function triggerSpiritPulse() {
    spiritFlash = 1.0;
    AUDIO.playScareSFX('spirit_flash');
    const banished = WORLD.banishNearbyGhosts(camera.position);
    if (banished > 0) {
      showScareToast(`SPIRIT PULSE BANISHED ${banished} PHANTOM${banished > 1 ? 'S' : ''}!`);
    } else {
      showScareToast('LANTERN SPIRIT PULSE UNLEASHED');
    }
  }

  // ---------- Input & UI Event Listeners ----------
  if (elSpeedSlider) {
    elSpeedSlider.addEventListener('input', e => {
      walkSpeed = parseFloat(e.target.value);
      if (elSpeedVal) elSpeedVal.textContent = walkSpeed.toFixed(1);
    });
  }

  if (elYawSlider) {
    elYawSlider.addEventListener('input', e => {
      const deg = parseFloat(e.target.value);
      targetYawOffset = (-deg * Math.PI) / 180;
      if (elYawVal) elYawVal.textContent = `${deg > 0 ? '+' : ''}${Math.round(deg)}°`;
    });
  }

  if (elPitchSlider) {
    elPitchSlider.addEventListener('input', e => {
      const deg = parseFloat(e.target.value);
      targetPitchOffset = (deg * Math.PI) / 180;
      if (elPitchVal) elPitchVal.textContent = `${deg > 0 ? '+' : ''}${Math.round(deg)}°`;
    });
  }

  if (btnResetCam) {
    btnResetCam.addEventListener('click', () => resetCameraOffset());
  }

  if (btnLantern) {
    btnLantern.addEventListener('click', () => {
      if (lanternMode === 'warm') {
        lanternMode = 'uv';
        btnLantern.textContent = 'Lantern · Spectral UV';
        btnLantern.classList.add('on');
      } else if (lanternMode === 'uv') {
        lanternMode = 'off';
        btnLantern.textContent = 'Lantern · Dark';
        btnLantern.classList.remove('on');
      } else {
        lanternMode = 'warm';
        btnLantern.textContent = 'Lantern · Candlelight';
        btnLantern.classList.add('on');
      }
    });
  }

  if (btnScare) {
    btnScare.addEventListener('click', () => {
      const ok = WORLD.triggerNearestScare(camera.position, onScareTrigger);
      if (!ok) {
        onScareTrigger('ghost', camera.position.clone().add(new THREE.Vector3(0, 0, -4)));
      }
    });
  }

  if (btnPulse) {
    btnPulse.addEventListener('click', () => triggerSpiritPulse());
  }

  if (btnCamMode) {
    btnCamMode.addEventListener('click', () => {
      freeLookMode = !freeLookMode;
      btnCamMode.textContent = freeLookMode ? 'Cam · Free Offset' : 'Cam · Auto-Center';
      btnCamMode.classList.toggle('on', freeLookMode);
      if (!freeLookMode) {
        resetCameraOffset();
      }
    });
  }

  if (btnAudio) {
    btnAudio.addEventListener('click', () => {
      const isMuted = AUDIO.toggleMute();
      btnAudio.textContent = isMuted ? 'Audio · Muted' : 'Audio · Haunting ON';
      btnAudio.classList.toggle('on', !isMuted);
    });
  }

  // Mouse & Touch Look Dragging (freely rotates camera offset angle around full 360° yaw & ±75° pitch)
  window.addEventListener('pointerdown', e => {
    if (e.target.closest('.ui-panel, button, input, details')) return;
    isPointerDown = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  });

  window.addEventListener('pointermove', e => {
    if (isPointerDown) {
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      targetYawOffset = wrapAnglePi(targetYawOffset - dx * 0.0048);
      targetPitchOffset = clamp(targetPitchOffset - dy * 0.0038, -1.31, 1.31);
      syncAngleUI();
    }
  });

  window.addEventListener('pointerup', () => {
    isPointerDown = false;
    if (!freeLookMode) {
      resetCameraOffset();
    }
  });

  window.addEventListener('dblclick', e => {
    if (e.target.closest('.ui-panel, button, input, details')) return;
    resetCameraOffset();
  });

  window.addEventListener('keydown', e => {
    heldKeys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      triggerSpiritPulse();
    } else if (e.code === 'KeyR') {
      resetCameraOffset();
    } else if (e.code === 'KeyF') {
      if (btnScare) btnScare.click();
    } else if (e.code === 'KeyL') {
      if (btnLantern) btnLantern.click();
    } else if (e.code === 'KeyC') {
      if (btnCamMode) btnCamMode.click();
    } else if (e.code === 'KeyM') {
      if (btnAudio) btnAudio.click();
    } else if (e.code === 'KeyP') {
      paused = !paused;
    } else if (e.code === 'KeyH') {
      document.getElementById('hud').classList.toggle('off');
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      walkSpeed = clamp(walkSpeed + 0.4, 0.8, 7.5);
      if (elSpeedSlider) elSpeedSlider.value = String(walkSpeed);
      if (elSpeedVal) elSpeedVal.textContent = walkSpeed.toFixed(1);
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      walkSpeed = clamp(walkSpeed - 0.4, 0.8, 7.5);
      if (elSpeedSlider) elSpeedSlider.value = String(walkSpeed);
      if (elSpeedVal) elSpeedVal.textContent = walkSpeed.toFixed(1);
    }
  });

  window.addEventListener('keyup', e => {
    heldKeys.delete(e.code);
  });

  // ---------- Initialize First Segments & Dismiss Loading Screen ----------
  WORLD.updateWorldStream(distanceS, 0, 0.016, camera.position, onScareTrigger);
  setTimeout(() => {
    const ld = document.getElementById('loading');
    if (ld) ld.classList.add('gone');
  }, 450);

  // ---------- Main Animation Loop ----------
  let prevTime = performance.now() * 0.001;
  let currentTheme = '';
  const smoothCamPos = new THREE.Vector3();
  let smoothYaw = 0;
  let smoothPitch = 0;
  let camInitialized = false;

  function animate(nowMs) {
    requestAnimationFrame(animate);
    const time = nowMs * 0.001;
    const dt = Math.min(0.05, Math.max(0.001, time - prevTime));
    prevTime = time;

    candleFlameMat.uniforms.uTime.value = time;

    // Continuous keyboard adjustment of camera offset angle (A/D or Left/Right for Yaw, Q/E for Pitch)
    let angleChanged = false;
    if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) {
      targetYawOffset = wrapAnglePi(targetYawOffset + dt * 1.45);
      angleChanged = true;
    }
    if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) {
      targetYawOffset = wrapAnglePi(targetYawOffset - dt * 1.45);
      angleChanged = true;
    }
    if (heldKeys.has('KeyE')) {
      targetPitchOffset = clamp(targetPitchOffset + dt * 1.15, -1.31, 1.31);
      angleChanged = true;
    }
    if (heldKeys.has('KeyQ')) {
      targetPitchOffset = clamp(targetPitchOffset - dt * 1.15, -1.31, 1.31);
      angleChanged = true;
    }
    if (angleChanged) syncAngleUI();

    if (!paused) {
      // Advance at a steady, rock-solid pace along the manor spline
      distanceS += walkSpeed * dt;

      // Update UI counters
      if (elDepth) elDepth.textContent = `${Math.floor(distanceS)}m`;
      heartBPM = lerp(heartBPM, 76 + walkSpeed * 3.5, dt * 0.85);
      if (elBPM) elBPM.textContent = String(Math.round(heartBPM));

      // Decay scare & spirit flash post-FX
      scarePulse = Math.max(0, scarePulse - dt * 0.65);
      spiritFlash = Math.max(0, spiritFlash - dt * 1.6);
      finalMat.uniforms.uScarePulse.value = scarePulse;
      finalMat.uniforms.uSpiritFlash.value = spiritFlash;

      // Multi-point spline sampling for silky-smooth dolly motion across stairs & halls
      const curSample = WORLD.samplePath(distanceS);
      const backSample = WORLD.samplePath(Math.max(0, distanceS - 1.4));
      const fwdSample = WORLD.samplePath(distanceS + 1.4);
      const lookNear = WORLD.samplePath(distanceS + 8.0);
      const lookFar = WORLD.samplePath(distanceS + 14.0);

      if (curSample.theme !== currentTheme) {
        currentTheme = curSample.theme;
        if (elZone) elZone.textContent = THEME_LABELS[currentTheme] || currentTheme;
      }

      // Footstep audio cadence (no vertical camera bobbing)
      stepCycle += walkSpeed * dt * 1.95;
      const stepSin = Math.sin(stepCycle * Math.PI);
      if (prevStepSin < 0 && stepSin >= 0) {
        AUDIO.playFootstep(currentTheme === 'CATACOMB_TUNNEL');
      }
      prevStepSin = stepSin;

      // Desired eye-level camera position (3-point smoothed along spline, zero shake!)
      const eyeHeight = 1.72;
      const desiredCamPos = new THREE.Vector3(
        curSample.pos.x * 0.5 + (backSample.pos.x + fwdSample.pos.x) * 0.25,
        curSample.pos.y * 0.5 + (backSample.pos.y + fwdSample.pos.y) * 0.25 + eyeHeight,
        curSample.pos.z * 0.5 + (backSample.pos.z + fwdSample.pos.z) * 0.25
      );

      // Compute smooth path forward tangent yaw & pitch
      const baseLookTarget = new THREE.Vector3(
        (lookNear.pos.x + lookFar.pos.x) * 0.5,
        (lookNear.pos.y + lookFar.pos.y) * 0.5 + eyeHeight,
        (lookNear.pos.z + lookFar.pos.z) * 0.5
      );
      const pathDir = baseLookTarget.sub(desiredCamPos).normalize();
      const pathYaw = Math.atan2(-pathDir.x, -pathDir.z);
      const pathPitch = Math.asin(clamp(pathDir.y, -0.85, 0.85));

      const isGrandHall = (currentTheme === 'GRAND_GALLERY' || currentTheme === 'STAIRCASE_HALL');
      const directorPitch = isGrandHall ? 0.055 : 0.020;

      const rotAlpha = 1.0 - Math.exp(-dt * 10.0);
      const yawDiffOffset = Math.atan2(Math.sin(targetYawOffset - userYawOffset), Math.cos(targetYawOffset - userYawOffset));
      userYawOffset = wrapAnglePi(userYawOffset + yawDiffOffset * rotAlpha);
      userPitchOffset = lerp(userPitchOffset, targetPitchOffset, rotAlpha);

      const desiredYaw = pathYaw + userYawOffset;
      const desiredPitch = clamp(pathPitch + directorPitch + userPitchOffset, -1.36, 1.36);

      if (!camInitialized) {
        smoothCamPos.copy(desiredCamPos);
        smoothYaw = desiredYaw;
        smoothPitch = desiredPitch;
        camInitialized = true;
      } else {
        const posAlpha = 1.0 - Math.exp(-dt * 12.0);
        smoothCamPos.lerp(desiredCamPos, posAlpha);
        const gazeAlpha = 1.0 - Math.exp(-dt * 10.0);
        const dYaw = Math.atan2(Math.sin(desiredYaw - smoothYaw), Math.cos(desiredYaw - smoothYaw));
        smoothYaw += dYaw * gazeAlpha;
        smoothPitch = lerp(smoothPitch, desiredPitch, gazeAlpha);
      }
      camera.position.copy(smoothCamPos);
      camera.up.set(0, 1, 0);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(smoothPitch, smoothYaw, 0, 'YXZ');

      // Stream procedural segments & update animated entities
      WORLD.updateWorldStream(distanceS, time, dt, camera.position, onScareTrigger);

      // Update floating golden candle dust motes around the camera
      const posAttr = dustGeo.attributes.position;
      const arr = posAttr.array;
      for (let i = 0; i < DUST_COUNT; i++) {
        const idx = i * 3;
        const v = dustVel[i];
        arr[idx] += (v.vx + Math.sin(time * 1.5 + v.phase) * 0.05) * dt;
        arr[idx + 1] += v.vy * dt;
        arr[idx + 2] += v.vz * dt;

        // Wrap dust particles around camera volume so the air is always full of vivid motes
        if (arr[idx] - camera.position.x > 8) arr[idx] -= 16;
        if (arr[idx] - camera.position.x < -8) arr[idx] += 16;
        if (arr[idx + 1] - curSample.pos.y > 5.5) arr[idx + 1] = curSample.pos.y + 0.2;
        if (arr[idx + 1] - curSample.pos.y < 0.1) arr[idx + 1] = curSample.pos.y + 5.2;
        if (arr[idx + 2] - camera.position.z > 8) arr[idx + 2] -= 16;
        if (arr[idx + 2] - camera.position.z < -8) arr[idx + 2] += 16;
      }
      posAttr.needsUpdate = true;

      // Update Multi-Layered Volumetric Floor Fog Clusters flowing along the floor & cascading down staircases
      floorFogMat.uniforms.uTime.value = time;
      if (candleFlameMat && candleFlameMat.uniforms && candleFlameMat.uniforms.uTime) {
        candleFlameMat.uniforms.uTime.value = time;
      }
      if (window.HH.candleCoronaMat && window.HH.candleCoronaMat.uniforms) {
        window.HH.candleCoronaMat.uniforms.uTime.value = time;
      }
      if (window.HH.pumpkinFireMat && window.HH.pumpkinFireMat.uniforms) {
        window.HH.pumpkinFireMat.uniforms.uTime.value = time;
      }
      for (let i = 0; i < FOG_CLUSTER_COUNT; i++) {
        const fc = fogClusters[i];
        const ud = fc.userData;
        // Drift fog clusters slowly along the manor floor / staircase
        ud.sOffset -= ud.flowSpeed * dt;
        while (ud.sOffset < -6.0) ud.sOffset += 44.0;
        while (ud.sOffset > 38.0) ud.sOffset -= 44.0;

        const sCluster = Math.max(0.2, distanceS + ud.sOffset);
        const ms = WORLD.samplePath(sCluster);
        const msNext = WORLD.samplePath(sCluster + 1.2);
        const isHall = (ms.theme === 'GRAND_GALLERY' || ms.theme === 'STAIRCASE_HALL');

        // Spread wider across the 26m-wide Colossal Hall marble floor; stay tighter inside tunnels & on stairs
        const onStairs = Math.abs(msNext.pos.y - ms.pos.y) > 0.04;
        const maxSpan = onStairs ? 2.2 : (isHall ? 8.2 : 2.3);
        const lateral = ud.latFactor * maxSpan + Math.sin(time * ud.swaySpeed + ud.phase) * ud.swayAmp;

        // When on the side floor of a Colossal Hall while the path is on the stairs, hug the lower marble hall floor
        let baseY = ms.pos.y;
        if (isHall && Math.abs(lateral) > 3.1 && ms.seg && ms.seg.frames.length > 0) {
          const f0Y = ms.seg.frames[0].pos.y;
          const fEndY = ms.seg.frames[ms.seg.frames.length - 1].pos.y;
          baseY = Math.min(f0Y, fEndY);
        }

        fc.position.set(
          ms.pos.x + ms.right.x * lateral,
          baseY,
          ms.pos.z + ms.right.z * lateral
        );

        // Align cluster yaw to path tangent & tilt pitch along staircase slope when cascading down steps
        const slopePitch = (onStairs && Math.abs(lateral) <= 3.1)
          ? Math.atan2(msNext.pos.y - ms.pos.y, 1.2)
          : 0;
        fc.rotation.set(slopePitch, ms.yaw, 0, 'YXZ');

        const pulseScale = ud.scaleBase * (isHall && !onStairs ? 1.28 : 1.0) * (1.0 + 0.08 * Math.sin(time * 0.7 + ud.phase));
        fc.scale.set(pulseScale, 1.0, pulseScale * 1.15);
      }

      // Update Dynamic PointLights + Player Handheld Lantern
      const camForward = new THREE.Vector3();
      camera.getWorldDirection(camForward);
      updateDynamicLights(time, camera.position, camForward, lanternMode);

      // Feed top 8 active candle/fire point lights into the Volumetric Floor Fog Shader
      const fogLightPos = floorFogMat.uniforms.uLightPos.value;
      const fogLightCol = floorFogMat.uniforms.uLightCol.value;
      for (let i = 0; i < 8; i++) {
        const pl = lightPool[i];
        if (pl && pl.intensity > 0.01) {
          fogLightPos[i].set(pl.position.x, pl.position.y, pl.position.z, pl.distance);
          fogLightCol[i].set(
            pl.color.r * pl.intensity,
            pl.color.g * pl.intensity,
            pl.color.b * pl.intensity
          );
        } else {
          fogLightPos[i].set(0, -1000, 0, 0.1);
          fogLightCol[i].set(0, 0, 0);
        }
      }

      // Update procedural horror soundscape
      AUDIO.updateAudio(time);
    }

    renderPipeline(time);
  }

  requestAnimationFrame(animate);
})();
