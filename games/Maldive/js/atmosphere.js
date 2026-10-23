// ============================================================================
// 6. DYNAMIC 24-HOUR SOLAR, LUNAR & ATMOSPHERIC CYCLE UPDATE
// ============================================================================
// Day/night palette colours are allocated once here instead of every frame
const DAY_NIGHT_COLORS = {
    noonSun: new THREE.Color(0xfff8eb),
    goldenHour: new THREE.Color(0xff6b2b),
    dayTop: new THREE.Color(0x062b68),
    dayHor: new THREE.Color(0x397cca),
    sunTop: new THREE.Color(0x16193b),
    sunHor: new THREE.Color(0xe05a1e),
    nitTop: new THREE.Color(0x03091e),
    nitHor: new THREE.Color(0x0d1b35),
    groundDay: new THREE.Color(0x9e8f75),
    groundNight: new THREE.Color(0x24354b)
};

function updateDayNightAtmosphere(hours) {
    // Convert 0..24h to strictly periodic 2*PI solar angle so 24:00 and 00:00 are 100% identical
    const solarAngle = ((hours - 6.0) / 24.0) * Math.PI * 2.0;
    const sunY = Math.sin(solarAngle);
    const sunX = Math.cos(solarAngle);
    // Use integer harmonic (1.0 * solarAngle) instead of 0.5 * solarAngle so sunZ is periodic over 24h!
    const sunZ = 0.32 * Math.sin(solarAngle + 0.4);

    STATE.sunDirection.set(sunX, sunY, sunZ).normalize();
    STATE.moonDirection.set(-sunX, -sunY, -sunZ).normalize();
    skyMat.uniforms.uSkyRotation.value = solarAngle;

    sunLight.position.copy(STATE.sunDirection).multiplyScalar(CELESTIAL_LIGHT_DISTANCE);
    moonLight.position.copy(STATE.moonDirection).multiplyScalar(CELESTIAL_LIGHT_DISTANCE);

    const dayFactor = smoothstep(-0.10, 0.28, sunY);
    const twilightFactor = smoothstep(-0.20, 0.06, sunY) * (1.0 - smoothstep(0.04, 0.34, sunY));
    const nightFactor = 1.0 - smoothstep(-0.14, 0.04, sunY);

    const noonSunCol = DAY_NIGHT_COLORS.noonSun;
    const goldenHourCol = DAY_NIGHT_COLORS.goldenHour;
    STATE.sunColor.copy(noonSunCol).lerp(goldenHourCol, twilightFactor * 0.92);

    sunLight.color.copy(STATE.sunColor);
    sunLight.intensity = Math.max(0.0, smoothstep(-0.06, 0.28, sunY) * 3.4 + twilightFactor * 0.85);

    moonLight.intensity = nightFactor * 1.05;

    // Sky Top & Horizon Colors synced for Ocean Fresnel reflections
    const dayTop = DAY_NIGHT_COLORS.dayTop;
    const dayHor = DAY_NIGHT_COLORS.dayHor;
    const sunTop = DAY_NIGHT_COLORS.sunTop;
    const sunHor = DAY_NIGHT_COLORS.sunHor;
    const nitTop = DAY_NIGHT_COLORS.nitTop;
    const nitHor = DAY_NIGHT_COLORS.nitHor;

    STATE.skyTopColor.copy(nitTop).lerp(dayTop, dayFactor).lerp(sunTop, twilightFactor * 0.8);
    STATE.skyHorizonColor.copy(nitHor).lerp(dayHor, dayFactor).lerp(sunHor, twilightFactor * 0.9);

    // Warm coral-sand bounce light from below + tropical sky fill from above
    const groundDay = DAY_NIGHT_COLORS.groundDay;
    const groundNight = DAY_NIGHT_COLORS.groundNight;
    hemiLight.color.copy(STATE.skyHorizonColor);
    hemiLight.groundColor.copy(groundNight).lerp(groundDay, dayFactor);
    hemiLight.intensity = 0.42 + dayFactor * 0.56 + twilightFactor * 0.28;

    renderer.toneMappingExposure = 0.84 + dayFactor * 0.14 + twilightFactor * 0.08;

    updateClockUI(hours);
}

function updateClockUI(hours) {
    const wrappedH = ((hours % 24) + 24) % 24;
    const hh = Math.floor(wrappedH);
    const mm = Math.floor((wrappedH - hh) * 60);
    const formatted = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

    const timeDisplay = document.getElementById('time-display');
    const phaseLabel = document.getElementById('phase-label');
    const timeSlider = document.getElementById('time-slider');

    if (timeDisplay && timeDisplay.textContent !== formatted) timeDisplay.textContent = formatted;
    if (timeSlider && document.activeElement !== timeSlider) {
        const sliderValue = wrappedH.toFixed(2);
        if (timeSlider.value !== sliderValue) timeSlider.value = sliderValue;
    }

    if (phaseLabel) {
        let phase = 'Starlit Night';
        if (wrappedH >= 5.2 && wrappedH < 7.2) phase = 'Golden Sunrise';
        else if (wrappedH >= 7.2 && wrappedH < 11.0) phase = 'Morning Lagoon';
        else if (wrappedH >= 11.0 && wrappedH < 15.5) phase = 'Tropical Midday';
        else if (wrappedH >= 15.5 && wrappedH < 17.3) phase = 'Warm Afternoon';
        else if (wrappedH >= 17.3 && wrappedH < 19.2) phase = 'Magenta Sunset';
        else if (wrappedH >= 19.2 && wrappedH < 20.5) phase = 'Blue Dusk';
        if (phaseLabel.textContent !== phase) phaseLabel.textContent = phase;
    }
}
