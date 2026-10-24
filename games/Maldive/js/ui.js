// ============================================================================
// 7. UI CONTROLS & CAMERA PRESETS
// ============================================================================
function setupUIControls() {
    const timeSlider = document.getElementById('time-slider');
    const waveSlider = document.getElementById('wave-slider');
    const cloudSlider = document.getElementById('cloud-slider');
    const cumulusSlider = document.getElementById('cumulus-slider');
    const speedSlider = document.getElementById('speed-slider');
    const deckToggle = document.getElementById('control-deck-toggle');
    const deckDetails = document.getElementById('control-deck-details');
    const deckToggleLabel = document.getElementById('control-deck-toggle-label');
    const deckToggleIcon = document.getElementById('control-deck-toggle-icon');

    deckToggle.addEventListener('click', () => {
        const expanded = deckToggle.getAttribute('aria-expanded') !== 'true';
        deckToggle.setAttribute('aria-expanded', String(expanded));
        deckToggle.setAttribute('aria-label', expanded ? 'Collapse controls' : 'Expand controls');
        deckToggle.title = expanded ? 'Collapse controls' : 'Expand controls';
        deckToggleLabel.textContent = expanded ? 'Close' : 'Controls';
        deckToggleIcon.classList.toggle('rotate-180', expanded);
        deckDetails.classList.toggle('hidden', !expanded);
    });

    timeSlider.addEventListener('input', (e) => {
        STATE.timeOfDay = parseFloat(e.target.value);
        updateDayNightAtmosphere(STATE.timeOfDay);
    });

    waveSlider.addEventListener('input', (e) => {
        STATE.waveScale = parseFloat(e.target.value);
        oceanMat.uniforms.uWaveScale.value = STATE.waveScale;
        document.getElementById('wave-val').textContent = STATE.waveScale.toFixed(2) + 'x';
    });

    cloudSlider.addEventListener('input', (e) => {
        STATE.cloudCoverage = parseFloat(e.target.value);
        skyMat.uniforms.uCloudCoverage.value = STATE.cloudCoverage;
        oceanMat.uniforms.uCloudCoverage.value = STATE.cloudCoverage;
        document.getElementById('cloud-val').textContent = Math.round(STATE.cloudCoverage * 100) + '%';
    });

    cumulusSlider.addEventListener('input', (e) => {
        STATE.cumulusCoverage = parseFloat(e.target.value);
        cumulusMat.uniforms.uCumulusCoverage.value = STATE.cumulusCoverage;
        oceanMat.uniforms.uCumulusCoverage.value = STATE.cumulusCoverage;
        document.getElementById('cumulus-val').textContent = Math.round(STATE.cumulusCoverage * 100) + '%';
    });

    speedSlider.addEventListener('input', (e) => {
        STATE.cycleSpeed = parseFloat(e.target.value);
        document.getElementById('speed-val').textContent = STATE.cycleSpeed.toFixed(1) + 'x';
    });

    updateMobileUI(CONFIG.isMobile);
}

function setIsMobile(isMobile, reload = false) {
    CONFIG.isMobile = isMobile;
    IS_MOBILE = isMobile;
    try {
        localStorage.setItem('isMobile', String(isMobile));
    } catch (e) {}

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const targetDPR = isMobile ? 1.0 : Math.min(dpr, CONFIG.maxPixelRatio || 1.5);
    CONFIG.maxPixelRatio = targetDPR;
    if (typeof MAX_PIXEL_RATIO !== 'undefined') {
        MAX_PIXEL_RATIO = targetDPR;
    }
    if (typeof renderer !== 'undefined' && renderer) {
        renderer.setPixelRatio(targetDPR);
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (typeof depthRenderTarget !== 'undefined' && depthRenderTarget) {
            const size = new THREE.Vector2();
            renderer.getDrawingBufferSize(size);
            depthRenderTarget.setSize(Math.max(256, Math.round(size.x * 0.5)), Math.max(256, Math.round(size.y * 0.5)));
        }
    }
    updateMobileUI(isMobile);

    if (reload) {
        window.location.reload();
    }
}

function updateMobileUI(isMobile) {
    const valEl = document.getElementById('mobile-val');
    if (valEl) {
        valEl.textContent = isMobile ? 'Mobile' : 'Desktop';
    }
    const btnDesktop = document.getElementById('mode-desktop');
    const btnMobile = document.getElementById('mode-mobile');
    const activeClass = 'flex-1 py-1 rounded bg-cyan-500/25 border border-cyan-400/50 text-[10px] text-cyan-200 font-bold transition';
    const inactiveClass = 'flex-1 py-1 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-[10px] text-slate-300 transition';
    if (btnDesktop) btnDesktop.className = !isMobile ? activeClass : inactiveClass;
    if (btnMobile) btnMobile.className = isMobile ? activeClass : inactiveClass;
}

function setResolutionScale(scale) {
    setIsMobile(scale <= 1.05);
}

function toggleAutoCycle() {
    STATE.autoCycle = !STATE.autoCycle;
    document.getElementById('icon-play').classList.toggle('hidden', STATE.autoCycle);
    document.getElementById('icon-pause').classList.toggle('hidden', !STATE.autoCycle);
}

function jumpToTime(targetHour) {
    STATE.timeOfDay = targetHour;
    updateDayNightAtmosphere(STATE.timeOfDay);
}

function setCameraPreset(presetName) {
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`cam-${presetName}`);
    if (activeBtn) activeBtn.classList.add('active');

    STATE.cameraAnimating = true;
    if (presetName === 'overview') {
        // Grand panoramic overview showing island, overwater villas and ocean
        STATE.cameraTargetPos.set(155, 62, 160);
        STATE.cameraTargetLook.set(-20, 2.0, -45);
    } else if (presetName === 'aerial') {
        // High elevated aerial reference view matching the reference photo
        STATE.cameraTargetPos.set(165, 95, 175);
        STATE.cameraTargetLook.set(-40, 2.0, -90);
    } else if (presetName === 'villas') {
        // Scenic boardwalk view along the curving overwater bungalows extending into the water
        STATE.cameraTargetPos.set(-25, 7.5, -92);
        STATE.cameraTargetLook.set(-85, 2.0, -200);
    } else if (presetName === 'distantIsland') {
        // Panorama framed directly toward the distant atoll island & turquoise reef ring
        STATE.cameraTargetPos.set(-75, 18, -210);
        STATE.cameraTargetLook.set(-130, 4.0, -510);
    } else if (presetName === 'beach') {
        STATE.cameraTargetPos.set(92, 4.2, 52);
        STATE.cameraTargetLook.set(8, 5.5, 4);
    } else if (presetName === 'reef') {
        // Close lagoon vantage point looking down into the living 3D coral gardens & swimming manta rays
        STATE.cameraTargetPos.set(74, 6.8, 58);
        STATE.cameraTargetLook.set(62, -1.2, 36);
    } else if (presetName === 'shipwreck') {
        // Starboard-beam view of the listing galleon, half-submerged on the north-east shelf
        STATE.cameraTargetPos.set(189, 7.5, -74.5);
        STATE.cameraTargetLook.set(168, 0.8, -82);
    } else if (presetName === 'village') {
        // Scenic view of the campfire, canoes & beach
        STATE.cameraTargetPos.set(74, 8.2, 52);
        STATE.cameraTargetLook.set(48, 2.8, 18);
    } else if (presetName === 'cabin') {
        // Close view showcasing the grand wooden tribal cabin with its golden hay roof, totem pole & BBQ campfire
        STATE.cameraTargetPos.set(60.5, 5.2, 30.8);
        STATE.cameraTargetLook.set(43.5, 3.6, 13.5);
    } else if (presetName === 'cabinInterior') {
        // Veranda threshold view looking directly inside the spacious cabin at the bed, stick-chart navigator, masks & brazier
        STATE.cameraTargetPos.set(49.2, 4.15, 19.6);
        STATE.cameraTargetLook.set(40.5, 3.10, 10.5);
    } else if (presetName === 'sky') {
        // Low-angle beach view tilting directly upward through the wind-swept palm canopy into the clouds & Milky Way
        STATE.cameraTargetPos.set(-14.5, 2.8, 24.5);
        STATE.cameraTargetLook.set(4.0, 15.5, -4.0);
    } else if (presetName === 'horizon') {
        // Beachfront view framed directly toward the towering giant tropical cumulus horizon clouds
        STATE.cameraTargetPos.set(-88, 3.8, -58);
        STATE.cameraTargetLook.set(160, 28.0, 115);
    }
}
