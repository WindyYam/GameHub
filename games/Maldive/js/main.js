function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio));
    if (depthRenderTarget) {
        const size = new THREE.Vector2();
        renderer.getDrawingBufferSize(size);
        depthRenderTarget.setSize(Math.max(256, Math.round(size.x * 0.5)), Math.max(256, Math.round(size.y * 0.5)));
    }
}

// ============================================================================
// 8. MAIN ANIMATION LOOP
// ============================================================================
function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);
    STATE.elapsedTime += dt;

    // Advance 24h cycle if auto-cycle is enabled
    if (STATE.autoCycle) {
        STATE.timeOfDay = (STATE.timeOfDay + dt * STATE.cycleSpeed) % 24.0;
        updateDayNightAtmosphere(STATE.timeOfDay);
    }

    // Smooth camera preset transitions
    if (STATE.cameraAnimating) {
        camera.position.lerp(STATE.cameraTargetPos, dt * 3.2);
        controls.target.lerp(STATE.cameraTargetLook, dt * 3.2);
        if (camera.position.distanceTo(STATE.cameraTargetPos) < 0.15) {
            STATE.cameraAnimating = false;
        }
    }

    // Soft ocean/terrain floor so camera never clips underwater while allowing full upward sky tilt
    const groundUnderCam = getIslandHeight(camera.position.x, camera.position.z);
    const minCamY = Math.max(1.15, groundUnderCam + 0.75);
    if (camera.position.y < minCamY) {
        camera.position.y = minCamY;
    }

    controls.update();
    skyMesh.position.copy(camera.position);
    camera.getWorldDirection(cumulusForward);
    cumulusMesh.position.copy(camera.position).addScaledVector(cumulusForward, 290);
    cumulusMesh.quaternion.copy(camera.quaternion);

    // Update Shader Uniforms
    skyMat.uniforms.uTime.value = STATE.elapsedTime;
    cumulusMat.uniforms.uTime.value = STATE.elapsedTime;
    cumulusMat.uniforms.uCameraForward.value.copy(cumulusForward);
    cumulusMat.uniforms.uCameraNear.value = camera.near;
    cumulusMat.uniforms.uCameraFar.value = camera.far;
    renderer.getDrawingBufferSize(cumulusMat.uniforms.uResolution.value);
    if (depthRenderTarget && cumulusMat.uniforms.uDepthTexture) {
        cumulusMat.uniforms.uDepthTexture.value = depthRenderTarget.depthTexture;
    }
    oceanMat.uniforms.uTime.value = STATE.elapsedTime;

    if (sandMat && sandMat.userData.shader) {
        sandMat.userData.shader.uniforms.uTime.value = STATE.elapsedTime;
    }

    for (let i = 0; i < frondMaterials.length; i++) {
        const sh = frondMaterials[i].userData.shader;
        if (sh) sh.uniforms.uTime.value = STATE.elapsedTime;
    }

    for (let i = 0; i < trunkMaterials.length; i++) {
        const sh = trunkMaterials[i].userData.shader;
        if (sh) sh.uniforms.uTime.value = STATE.elapsedTime;
    }

    // Animate Underwater Marine Life (Manta Rays & Reef Fish Schools)
    const t = STATE.elapsedTime;
    for (let i = 0; i < marineLifeAgents.length; i++) {
        const a = marineLifeAgents[i];
        const ang = t * a.speed + a.phase;
        const nx = a.cx + Math.cos(ang) * a.rx;
        const nz = a.cz + Math.sin(ang * 0.85) * a.rz;
        const dx = -Math.sin(ang) * a.rx * a.speed;
        const dz = Math.cos(ang * 0.85) * 0.85 * a.rz * a.speed;

        const groundH = getIslandHeight(nx, nz);
        const safeY = Math.min(-0.38, Math.max(groundH + 0.35, a.depth + Math.sin(t * 1.2 + a.phase) * 0.12));

        a.mesh.position.set(nx, safeY, nz);
        a.mesh.rotation.y = Math.atan2(dx, dz);
    }

    // Animate Soaring Seagulls wheeling and banking in the tropical wind
    for (let i = 0; i < seagullAgents.length; i++) {
        const g = seagullAgents[i];
        const ang = t * g.speed + g.phase;
        const gx = g.cx + Math.cos(ang) * g.rx + Math.sin(ang * 0.5) * 8.0;
        const gz = g.cz + Math.sin(ang) * g.rz;
        const gy = g.baseY + Math.sin(t * 0.9 + g.phase) * 2.4;

        const dx = -Math.sin(ang) * g.rx * g.speed + Math.cos(ang * 0.5) * 4.0 * g.speed;
        const dz = Math.cos(ang) * g.rz * g.speed;

        g.mesh.position.set(gx, gy, gz);
        g.mesh.rotation.y = Math.atan2(dx, dz);
        g.mesh.rotation.z = Math.sin(ang) * 0.24; // Natural banking tilt on turns
    }

    // Animate Bamboo Wind Chimes, Hanging Gourd Lanterns & Barbeque Spit-Roast
    for (let i = 0; i < windChimeGroups.length; i++) {
        const wc = windChimeGroups[i];
        wc.group.rotation.z = Math.sin(t * 2.3 + wc.phase) * 0.09 + 0.03;
        wc.group.rotation.x = Math.cos(t * 1.8 + wc.phase) * 0.06;
    }
    if (bbqSpitRod) {
        bbqSpitRod.rotation.x = t * 0.65;
    }

    // Animate flickering Beach Campfire, Cabin Lanterns & Overwater Bungalow Lights (strongest at dusk & night)
    const nightGlowBoost = 1.0 - smoothstep(-0.05, 0.28, STATE.sunDirection.y) * 0.65;
    for (let i = 0; i < dynamicLights.length; i++) {
        const dl = dynamicLights[i];
        const flicker = 0.84 + 0.16 * Math.sin(t * 11.0 + dl.phase) * Math.cos(t * 17.3);
        dl.light.intensity = dl.baseIntensity * flicker * nightGlowBoost;
    }
    for (let i = 0; i < flameMeshes.length; i++) {
        const fm = flameMeshes[i];
        const flicker = 0.92 + 0.12 * Math.sin(t * 13.0 + fm.phase);
        fm.material.uniforms.uTime.value = t;
        fm.mesh.scale.set(fm.width * flicker, fm.height * flicker, fm.width * flicker);
        fm.mesh.rotation.y = t * 0.65 + fm.phase;
    }
    for (let i = 0; i < fireSparks.length; i++) {
        const spark = fireSparks[i];
        const life = (t * 0.38 + spark.phase) % 1.0;
        const angle = spark.phase * Math.PI * 2.0 + t * 0.7;
        const spread = 0.12 + life * 0.7;
        spark.mesh.position.set(
            Math.cos(angle) * spread,
            0.78 + life * 2.4,
            Math.sin(angle) * spread
        );
        const fadeIn = smoothstep(0.0, 0.08, life);
        const fadeOut = 1.0 - smoothstep(0.72, 1.0, life);
        spark.material.opacity = 0.95 * fadeIn * fadeOut;
        const size = 0.45 + (1.0 - life) * 0.65;
        spark.mesh.scale.setScalar(size);
    }
    camera.getWorldPosition(smokeCameraPosition);
    for (let i = 0; i < smokePuffs.length; i++) {
        const puff = smokePuffs[i];
        const life = (t * 0.24 + puff.phase) % 1.0;
        const drift = life * 2.8;
        const turbulence = 0.18 + life * 1.05;
        const fadeIn = smoothstep(0.0, 0.14, life);
        const fadeOut = 1.0 - smoothstep(0.78, 1.0, life);
        puff.mesh.position.set(
            Math.sin(t * 0.55 + puff.phase * 6.0) * turbulence + drift,
            1.5 + life * 7.0,
            Math.cos(t * 0.42 + puff.phase * 5.0) * turbulence * 0.7 - life * 0.9
        );
        puff.mesh.scale.set(1.25 + life * 2.9, 1.4 + life * 2.7, 1);
        puff.material.opacity = 0.34 * fadeIn * fadeOut;
        puff.mesh.quaternion.copy(camera.quaternion);
        puff.mesh.rotateZ(Math.sin(t * 0.22 + puff.phase * 6.0) * 0.16);
    }
    for (let i = 0; i < fireRenderItems.length; i++) {
        const item = fireRenderItems[i];
        item.mesh.getWorldPosition(smokeWorldPosition);
        item.distance = smokeCameraPosition.distanceToSquared(smokeWorldPosition);
    }
    fireRenderItems.sort((a, b) => b.distance - a.distance);
    for (let i = 0; i < fireRenderItems.length; i++) {
        fireRenderItems[i].mesh.renderOrder = 11 + i;
    }

    if (depthRenderTarget) {
        const previousTarget = renderer.getRenderTarget();
        const previousCumulusVisible = cumulusMesh.visible;
        const previousOceanVisible = oceanMesh.visible;
        const prevAutoUpdate = renderer.shadowMap.autoUpdate;
        cumulusMesh.visible = false;
        oceanMesh.visible = false;
        renderer.shadowMap.autoUpdate = false;
        try {
            renderer.setRenderTarget(depthRenderTarget);
            renderer.render(scene, camera);
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.shadowMap.autoUpdate = prevAutoUpdate;
            cumulusMesh.visible = previousCumulusVisible;
            oceanMesh.visible = previousOceanVisible;
        }
    }

    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
}

window.onload = function () {
    const loadingScreen = document.getElementById('loading-screen');
    // Yield a frame so browser paints the loading screen immediately
    requestAnimationFrame(() => {
        setTimeout(() => {
            initScene();
            setupUIControls();
            updateDayNightAtmosphere(STATE.timeOfDay);
            animate();

            // Smoothly dismiss the loading overlay
            if (loadingScreen) {
                loadingScreen.classList.add('loading-fade-out');
                setTimeout(() => {
                    loadingScreen.remove();
                }, 500);
            }
        }, 20);
    });
};
