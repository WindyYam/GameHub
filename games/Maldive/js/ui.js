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
        skyMat.uniforms.uCumulusCoverage.value = STATE.cumulusCoverage;
        oceanMat.uniforms.uCumulusCoverage.value = STATE.cumulusCoverage;
        document.getElementById('cumulus-val').textContent = Math.round(STATE.cumulusCoverage * 100) + '%';
    });

    speedSlider.addEventListener('input', (e) => {
        STATE.cycleSpeed = parseFloat(e.target.value);
        document.getElementById('speed-val').textContent = STATE.cycleSpeed.toFixed(1) + 'x';
    });
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
        STATE.cameraTargetPos.set(145, 34, 155);
        STATE.cameraTargetLook.set(12, 3.5, 4);
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
        // Scenic view of the overwater thatch bungalow pier, outrigger canoes & beach campfire
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
