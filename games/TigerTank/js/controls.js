// ============================================================================
// TigerTank Input, Camera & UI Controls
// Follow-Aim, First-Person View (FPV), Sniper Optics, Mobile Touch & Collapsibles
// ============================================================================

var cameraMode = 'orbit'; // 'orbit' (Follow Aim) | 'fpv' (First Person) | 'sniper' (TZF 9b) | 'inspect' (Free Orbit) | 'suspension'
var isFpvZoomed = false;
var isOrthographic = false;

var camOrbit = {
    theta: Math.PI + 0.38,
    phi: 1.42,
    distance: 10.5,
    isDragging: false,
    dragMoved: false,
    lastX: 0,
    lastY: 0
};

var aimCursorNDC = new THREE.Vector2(0, 0);
var raycaster = new THREE.Raycaster();
var worldAimPoint = new THREE.Vector3(0, 1.5, 60);
var actualGunHitPoint = new THREE.Vector3(0, 1.5, 60);

var keys = {};
var isFiringCoaxMG = false;
var isFiringBowMG = false;
var touchDrive = { forward: 0, turn: 0 };

function isMobileBrowser() {
    const ua = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|crios|tablet/i.test(ua);
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    return isMobileUA && hasTouch;
}

function toggleProjection(forceOrtho = null) {
    isOrthographic = (forceOrtho !== null) ? forceOrtho : !isOrthographic;
    window.activeCamera = isOrthographic ? window.orthoCamera : window.perspCamera;

    const btn = document.getElementById('proj-toggle');
    if (btn) {
        btn.textContent = isOrthographic ? '📐 View: Orthogonal (O)' : '📐 View: Perspective (O)';
        btn.classList.toggle('active', isOrthographic);
    }
    updateCameraProjectionAspect();
}

function updateCameraProjectionAspect() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const asp = w / h;

    if (window.perspCamera) {
        window.perspCamera.aspect = asp;
        window.perspCamera.updateProjectionMatrix();
    }

    if (window.orthoCamera) {
        const orthoFrustumSize = window.orthoFrustumSize || 18;
        window.orthoCamera.left   = -orthoFrustumSize * asp / 2;
        window.orthoCamera.right  =  orthoFrustumSize * asp / 2;
        window.orthoCamera.top    =  orthoFrustumSize / 2;
        window.orthoCamera.bottom = -orthoFrustumSize / 2;
        window.orthoCamera.updateProjectionMatrix();
    }
}

function applyOrthoPreset(presetName) {
    toggleProjection(true);
    setCameraMode('inspect');
    const h = tankState.heading;
    if (presetName === 'iso') {
        camOrbit.theta = h + Math.PI * 0.25;
        camOrbit.phi = 1.05;
        window.orthoCamera.zoom = 1.25;
    } else if (presetName === 'side') {
        camOrbit.theta = h + Math.PI * 0.5;
        camOrbit.phi = Math.PI * 0.49;
        window.orthoCamera.zoom = 1.45;
    } else if (presetName === 'front') {
        camOrbit.theta = h;
        camOrbit.phi = Math.PI * 0.49;
        window.orthoCamera.zoom = 1.55;
    } else if (presetName === 'top') {
        camOrbit.theta = h + Math.PI;
        camOrbit.phi = 0.05;
        window.orthoCamera.zoom = 1.15;
    }
    window.orthoCamera.updateProjectionMatrix();
}

function setCameraMode(mode) {
    cameraMode = mode;
    window.cameraMode = mode;
    ['cam-orbit', 'cam-fpv', 'cam-sniper', 'cam-inspect', 'cam-suspension'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', mode === id.replace('cam-', ''));
    });

    const fpvEl = document.getElementById('fpv-overlay');
    if (fpvEl) fpvEl.classList.toggle('hidden', mode !== 'fpv');
    const sniperEl = document.getElementById('sniper-overlay');
    if (sniperEl) sniperEl.classList.toggle('hidden', mode !== 'sniper');
    const extReticle = document.getElementById('external-reticle');
    if (extReticle) extReticle.classList.toggle('hidden', mode === 'fpv' || mode === 'sniper' || mode === 'suspension');

    if (window.perspCamera) {
        if (mode === 'sniper') {
            window.perspCamera.fov = 18;
        } else if (mode === 'fpv') {
            isFpvZoomed = false;
            window.perspCamera.fov = 46;
        } else {
            window.perspCamera.fov = 42;
        }
        window.perspCamera.updateProjectionMatrix();
    }

    const indicator = document.getElementById('aim-mode-indicator');
    const banner = document.getElementById('aim-banner-text');
    if (mode === 'inspect') {
        if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-purple-400';
        if (banner) banner.textContent = 'FREE INSPECT MODE — Turret Locked • Drag to Inspect 360° • Press [1] for Follow Aim';
    } else if (mode === 'fpv') {
        if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
        if (banner) banner.textContent = 'FIRST PERSON GUNNER VIEW (773 m/s) — Direct Turret Aim • RMB/Scroll/Pinch: Zoom • Left-Click: Fire';
    } else if (mode === 'sniper') {
        if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
        if (banner) banner.textContent = 'TZF 9b GUNNER SIGHT (2.5×) — Move Mouse or Arrow Keys to Fine-Aim • Space/Click to Fire 8.8cm';
    } else {
        if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
        if (banner) banner.textContent = 'FOLLOW AIM ACTIVE — Move Mouse/Touch to Aim • Click Canvas to Lock • [G]: Front Bow MG • [5] FPV';
    }
}

function toggleHeadlights() {
    tankState.headlightsOn = !tankState.headlightsOn;
    if (window.tankModel && window.tankModel.headlightLights) {
        window.tankModel.headlightLights.forEach((hl) => {
            hl.spot.intensity = tankState.headlightsOn ? 3.2 : 0.0;
            hl.slitMat.color.setHex(tankState.headlightsOn ? 0xfef08a : 0x334155);
        });
    }
}

function initControls(renderer) {
    document.querySelectorAll('.ortho-preset-btn').forEach((btn) => {
        btn.addEventListener('click', () => applyOrthoPreset(btn.getAttribute('data-ortho')));
    });

    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        keys[k] = true;
        if (k === ' ') { e.preventDefault(); fireMainCannon(); }
        if (k === 'g') { e.preventDefault(); isFiringBowMG = true; }
        if (k === 'x') fireSmokeDischargers();
        if (k === 'h') toggleHeadlights();
        if (k === 'o') toggleProjection();
        if (k === 'v') setCameraMode(cameraMode === 'sniper' ? 'orbit' : 'sniper');
        if (k === 'c') setCameraMode(cameraMode === 'inspect' ? 'orbit' : 'inspect');
        if (k === 'u') toggleTelemetry();
        if (k === '1') setCameraMode('orbit');
        if (k === '2') setCameraMode('sniper');
        if (k === '3') setCameraMode('inspect');
        if (k === '4') setCameraMode('suspension');
        if (k === '5') setCameraMode('fpv');
        if (k === 'z' && cameraMode === 'fpv') {
            isFpvZoomed = !isFpvZoomed;
            window.perspCamera.fov = isFpvZoomed ? 15 : 46;
            window.perspCamera.updateProjectionMatrix();
            const zoomEl = document.getElementById('fpv-svg-zoom');
            if (zoomEl) zoomEl.textContent = isFpvZoomed ? 'OPTICAL 3.5× [ZOOMED]' : 'OPTICAL 1.0× [HOLD RMB / SCROLL: 3.5× ZOOM]';
        }
    });

    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        keys[k] = false;
        if (k === 'g') isFiringBowMG = false;
    });

    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    renderer.domElement.addEventListener('mousedown', (e) => {
        soundFX.init();
        if (e.button === 0) {
            if (document.pointerLockElement === renderer.domElement) {
                fireMainCannon();
            } else {
                camOrbit.isDragging = true;
                camOrbit.dragMoved = false;
                camOrbit.lastX = e.clientX;
                camOrbit.lastY = e.clientY;
            }
        } else if (e.button === 2) {
            if (cameraMode === 'fpv') {
                isFpvZoomed = true;
                window.perspCamera.fov = 15;
                window.perspCamera.updateProjectionMatrix();
                const zoomEl = document.getElementById('fpv-svg-zoom');
                if (zoomEl) zoomEl.textContent = 'OPTICAL 3.5× [ZOOMED]';
            } else {
                isFiringCoaxMG = true;
            }
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            if (camOrbit.isDragging && !camOrbit.dragMoved && document.pointerLockElement !== renderer.domElement) {
                if (renderer.domElement.requestPointerLock) {
                    renderer.domElement.requestPointerLock();
                } else {
                    fireMainCannon();
                }
            }
            camOrbit.isDragging = false;
        }
        if (e.button === 2) {
            if (cameraMode === 'fpv') {
                isFpvZoomed = false;
                window.perspCamera.fov = 46;
                window.perspCamera.updateProjectionMatrix();
                const zoomEl = document.getElementById('fpv-svg-zoom');
                if (zoomEl) zoomEl.textContent = 'OPTICAL 1.0× [HOLD RMB / SCROLL: 3.5× ZOOM]';
            }
            isFiringCoaxMG = false;
        }
    });

    document.addEventListener('pointerlockchange', () => {
        const locked = (document.pointerLockElement === renderer.domElement);
        const banner = document.getElementById('aim-banner-text');
        if (banner) {
            if (locked) {
                aimCursorNDC.set(0, 0);
                if (cameraMode === 'fpv') {
                    banner.textContent = 'FIRST PERSON VIEW (773 m/s) — Direct Turret Aim • Left-Click: Fire • Right-Click: Zoom • [G]: Front Bow MG • [ESC] Unlock';
                } else {
                    banner.textContent = 'MOUSE LOCKED — Move Mouse to Aim • Left-Click: Fire • Right-Click: Coax MG • [G]: Front Bow MG • [5] FPV • [ESC] Unlock';
                }
            } else {
                banner.textContent = 'FOLLOW AIM ACTIVE — Move Mouse to Aim • Click Canvas to Lock Mouse • [G]: Front Bow MG • [5] First Person';
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        const locked = (document.pointerLockElement === renderer.domElement);
        if (locked) {
            if (cameraMode === 'fpv') {
                const sens = isFpvZoomed ? 0.0008 : 0.0022;
                tankState.targetTurretYaw -= e.movementX * sens;
                tankState.targetGunElevation = THREE.MathUtils.clamp(
                    tankState.targetGunElevation - e.movementY * sens,
                    tankState.MIN_ELEV_RAD,
                    tankState.MAX_ELEV_RAD
                );
                camOrbit.theta = tankState.heading + tankState.targetTurretYaw + Math.PI;
                aimCursorNDC.set(0, 0);
            } else {
                const sensitivity = (cameraMode === 'sniper') ? 0.0012 : 0.0028;
                camOrbit.theta -= e.movementX * sensitivity;
                camOrbit.phi = THREE.MathUtils.clamp(camOrbit.phi - e.movementY * sensitivity, 0.45, 1.85);
                aimCursorNDC.set(0, 0);
            }
        } else if (camOrbit.isDragging) {
            const dx = e.clientX - camOrbit.lastX;
            const dy = e.clientY - camOrbit.lastY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) camOrbit.dragMoved = true;
            camOrbit.lastX = e.clientX;
            camOrbit.lastY = e.clientY;

            if (cameraMode === 'fpv') {
                const sens = isFpvZoomed ? 0.0008 : 0.0022;
                tankState.targetTurretYaw -= dx * sens;
                tankState.targetGunElevation = THREE.MathUtils.clamp(
                    tankState.targetGunElevation - dy * sens,
                    tankState.MIN_ELEV_RAD,
                    tankState.MAX_ELEV_RAD
                );
                camOrbit.theta = tankState.heading + tankState.targetTurretYaw + Math.PI;
            } else {
                const sensitivity = (cameraMode === 'sniper') ? 0.0022 : 0.0055;
                camOrbit.theta -= dx * sensitivity;
                camOrbit.phi = THREE.MathUtils.clamp(camOrbit.phi - dy * sensitivity, 0.45, 1.85);
            }
        } else if (cameraMode === 'orbit' || cameraMode === 'sniper') {
            aimCursorNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
            aimCursorNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
        }
    });

    renderer.domElement.addEventListener('wheel', (e) => {
        if (isOrthographic) {
            window.orthoCamera.zoom = THREE.MathUtils.clamp(window.orthoCamera.zoom - e.deltaY * 0.0012, 0.35, 3.8);
            window.orthoCamera.updateProjectionMatrix();
        } else if (cameraMode === 'fpv') {
            window.perspCamera.fov = THREE.MathUtils.clamp(window.perspCamera.fov + e.deltaY * 0.03, 12, 55);
            window.perspCamera.updateProjectionMatrix();
            const zoomRatio = (46 / window.perspCamera.fov).toFixed(1);
            const zoomEl = document.getElementById('fpv-svg-zoom');
            if (zoomEl) zoomEl.textContent = `OPTICAL ${zoomRatio}× [HOLD RMB / SCROLL ZOOM]`;
        } else {
            camOrbit.distance = THREE.MathUtils.clamp(camOrbit.distance + e.deltaY * 0.007, 4.2, 28.0);
        }
    }, { passive: true });

    // Touch controls
    renderer.domElement.style.touchAction = 'none';
    let activeAimTouchId = null;
    let activeJoystickTouchId = null;
    let touchAimLastX = 0;
    let touchAimLastY = 0;
    let initialPinchDist = 0;
    let initialOrbitDist = 0;
    let initialFovDist = 0;

    renderer.domElement.addEventListener('touchstart', (e) => {
        soundFX.init();
        const nonJoyTouches = Array.from(e.touches).filter(t => t.identifier !== activeJoystickTouchId);
        if (nonJoyTouches.length === 1 && activeAimTouchId === null) {
            const t = nonJoyTouches[0];
            activeAimTouchId = t.identifier;
            touchAimLastX = t.clientX;
            touchAimLastY = t.clientY;
        } else if (nonJoyTouches.length >= 2) {
            const dx = nonJoyTouches[0].clientX - nonJoyTouches[1].clientX;
            const dy = nonJoyTouches[0].clientY - nonJoyTouches[1].clientY;
            initialPinchDist = Math.hypot(dx, dy);
            initialOrbitDist = camOrbit.distance;
            initialFovDist = window.perspCamera.fov;
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeAimTouchId) {
                activeAimTouchId = null;
                break;
            }
        }
    }, { passive: true });

    renderer.domElement.addEventListener('touchcancel', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeAimTouchId) {
                activeAimTouchId = null;
                break;
            }
        }
    }, { passive: true });

    renderer.domElement.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && activeAimTouchId !== null) {
            e.preventDefault();
            for (let i = 0; i < e.touches.length; i++) {
                const t = e.touches[i];
                if (t.identifier === activeAimTouchId) {
                    const dx = t.clientX - touchAimLastX;
                    const dy = t.clientY - touchAimLastY;
                    touchAimLastX = t.clientX;
                    touchAimLastY = t.clientY;

                    if (cameraMode === 'fpv') {
                        const sens = isFpvZoomed ? 0.0012 : 0.0028;
                        tankState.targetTurretYaw -= dx * sens;
                        tankState.targetGunElevation = THREE.MathUtils.clamp(
                            tankState.targetGunElevation - dy * sens,
                            tankState.MIN_ELEV_RAD,
                            tankState.MAX_ELEV_RAD
                        );
                        camOrbit.theta = tankState.heading + tankState.targetTurretYaw + Math.PI;
                    } else {
                        const sens = 0.0045;
                        camOrbit.theta -= dx * sens;
                        camOrbit.phi = THREE.MathUtils.clamp(camOrbit.phi - dy * sens, 0.45, 1.85);
                    }
                    break;
                }
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            if (initialPinchDist > 0) {
                const scale = dist / initialPinchDist;
                if (cameraMode === 'fpv') {
                    window.perspCamera.fov = THREE.MathUtils.clamp(initialFovDist / scale, 12, 55);
                    window.perspCamera.updateProjectionMatrix();
                    const ratio = (46 / window.perspCamera.fov).toFixed(1);
                    const zoomEl = document.getElementById('fpv-svg-zoom');
                    if (zoomEl) zoomEl.textContent = `OPTICAL ${ratio}× [PINCH ZOOM]`;
                } else {
                    camOrbit.distance = THREE.MathUtils.clamp(initialOrbitDist / scale, 4.2, 28.0);
                }
            }
        }
    }, { passive: false });

    const endTouchAim = (e) => {
        if (e.touches.length === 0) {
            activeAimTouchId = null;
            initialPinchDist = 0;
        } else if (e.touches.length === 1) {
            activeAimTouchId = e.touches[0].identifier;
            touchAimLastX = e.touches[0].clientX;
            touchAimLastY = e.touches[0].clientY;
            initialPinchDist = 0;
        }
    };
    renderer.domElement.addEventListener('touchend', endTouchAim);
    renderer.domElement.addEventListener('touchcancel', endTouchAim);

    // Camera Mode Toolbar Buttons
    const camBtnMap = {
        'cam-orbit': 'orbit',
        'cam-fpv': 'fpv',
        'cam-sniper': 'sniper',
        'cam-inspect': 'inspect',
        'cam-suspension': 'suspension'
    };
    Object.keys(camBtnMap).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onclick = () => setCameraMode(camBtnMap[id]);
    });

    const projBtn = document.getElementById('proj-toggle');
    if (projBtn) projBtn.onclick = () => toggleProjection();

    const envBtn = document.getElementById('env-toggle');
    if (envBtn) {
        envBtn.onclick = (e) => {
            environmentMode = (environmentMode === 'wild') ? 'studio' : 'wild';
            e.target.textContent = (environmentMode === 'wild') ? '🌲 Scene: Wild Valley' : '⬜ Scene: Studio White';
            buildEnvironment();
        };
    }

    const audioBtn = document.getElementById('audio-toggle');
    if (audioBtn) {
        audioBtn.onclick = (e) => {
            soundFX.init();
            soundFX.enabled = !soundFX.enabled;
            e.target.textContent = soundFX.enabled ? '🔊 Audio ON' : '🔇 Audio OFF';
            e.target.classList.toggle('text-emerald-400', soundFX.enabled);
            e.target.classList.toggle('text-slate-400', !soundFX.enabled);
        };
    }

    function bindPointerAction(id, onStart, onEnd) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            soundFX.init();
            onStart();
        });
        const stop = (e) => {
            e.preventDefault();
            if (onEnd) onEnd();
        };
        el.addEventListener('pointerup', stop);
        el.addEventListener('pointercancel', stop);
        el.addEventListener('pointerleave', stop);
    }

    // Virtual Analog Joystick Logic
    const joystickBase = document.getElementById('joystick-base');
    const joystickKnob = document.getElementById('joystick-knob');

    function updateJoystick(clientX, clientY) {
        if (!joystickBase || !joystickKnob) return;
        const rect = joystickBase.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = clientX - centerX;
        let dy = clientY - centerY;
        const dist = Math.hypot(dx, dy);
        const maxRadius = rect.width * 0.38; // ~48px limit
        if (dist > maxRadius) {
            dx = (dx / dist) * maxRadius;
            dy = (dy / dist) * maxRadius;
        }
        joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        const normX = dx / maxRadius;
        const normY = dy / maxRadius;

        // Deadzone threshold of 0.08
        touchDrive.forward = (Math.abs(normY) > 0.08) ? -normY : 0;
        touchDrive.turn    = (Math.abs(normX) > 0.08) ? -normX : 0;
    }

    function resetJoystick() {
        if (joystickKnob) joystickKnob.style.transform = 'translate(-50%, -50%)';
        touchDrive.forward = 0;
        touchDrive.turn = 0;
        activeJoystickTouchId = null;
    }

    if (joystickBase) {
        joystickBase.addEventListener('touchstart', (e) => {
            e.preventDefault();
            soundFX.init();
            if (activeJoystickTouchId === null && e.changedTouches.length > 0) {
                const t = e.changedTouches[0];
                activeJoystickTouchId = t.identifier;
                updateJoystick(t.clientX, t.clientY);
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (activeJoystickTouchId !== null) {
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].identifier === activeJoystickTouchId) {
                        e.preventDefault();
                        updateJoystick(e.touches[i].clientX, e.touches[i].clientY);
                        break;
                    }
                }
            }
        }, { passive: false });

        const onTouchEnd = (e) => {
            if (activeJoystickTouchId !== null) {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === activeJoystickTouchId) {
                        resetJoystick();
                        break;
                    }
                }
            }
        };

        window.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    const mob88 = document.getElementById('mob-fire-88');
    if (mob88) mob88.addEventListener('pointerdown', (e) => { e.preventDefault(); soundFX.init(); fireMainCannon(); });

    bindPointerAction('mob-fire-coax', () => { isFiringCoaxMG = true; }, () => { isFiringCoaxMG = false; });
    bindPointerAction('mob-fire-bow',  () => { isFiringBowMG = true; },  () => { isFiringBowMG = false; });

    const mobZoom = document.getElementById('mob-btn-zoom');
    if (mobZoom) {
        mobZoom.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            soundFX.init();
            if (cameraMode !== 'fpv') {
                setCameraMode('fpv');
            } else {
                isFpvZoomed = !isFpvZoomed;
                window.perspCamera.fov = isFpvZoomed ? 15 : 46;
                window.perspCamera.updateProjectionMatrix();
                const zoomEl = document.getElementById('fpv-svg-zoom');
                if (zoomEl) zoomEl.textContent = isFpvZoomed ? 'OPTICAL 3.5× [ZOOMED]' : 'OPTICAL 1.0× [HOLD RMB / SCROLL ZOOM]';
            }
        });
    }

    const mobSmoke = document.getElementById('mob-btn-smoke');
    if (mobSmoke) mobSmoke.addEventListener('pointerdown', (e) => { e.preventDefault(); soundFX.init(); fireSmokeDischargers(); });

    const btnFire88 = document.getElementById('btn-fire-88');
    if (btnFire88) btnFire88.onclick = () => fireMainCannon();

    const triggerCoaxBurst = () => {
        let shots = 0;
        const iv = setInterval(() => {
            fireCoaxMG();
            shots++;
            if (shots > 8) clearInterval(iv);
        }, 75);
    };
    const btnCoax = document.getElementById('btn-fire-coax');
    if (btnCoax) btnCoax.onclick = triggerCoaxBurst;

    const triggerBowBurst = () => {
        let shots = 0;
        const iv = setInterval(() => {
            fireBowMG();
            shots++;
            if (shots > 8) clearInterval(iv);
        }, 75);
    };
    const btnBow = document.getElementById('btn-fire-bow');
    if (btnBow) btnBow.onclick = triggerBowBurst;

    const btnSmoke = document.getElementById('btn-smoke');
    if (btnSmoke) btnSmoke.onclick = () => fireSmokeDischargers();
    const btnHeadlights = document.getElementById('btn-headlights');
    if (btnHeadlights) btnHeadlights.onclick = () => toggleHeadlights();

    // Collapsible UI Controls
    let isControlsCollapsed = false;
    const panelControlsBody = document.getElementById('panel-controls-body');
    const btnCollapseControls = document.getElementById('btn-collapse-controls');
    function toggleControls() {
        isControlsCollapsed = !isControlsCollapsed;
        if (panelControlsBody) panelControlsBody.classList.toggle('hidden', isControlsCollapsed);
        if (btnCollapseControls) btnCollapseControls.textContent = isControlsCollapsed ? '▼ Show' : '▲ Hide';
    }
    if (btnCollapseControls) btnCollapseControls.onclick = (e) => { e.stopPropagation(); toggleControls(); };
    const headerPanelControls = document.getElementById('header-panel-controls');
    if (headerPanelControls) headerPanelControls.onclick = toggleControls;

    let isViewsCollapsed = false;
    const panelViewsContent = document.getElementById('panel-views-content');
    const btnCollapseViews = document.getElementById('btn-collapse-views');
    const viewsCollapseIndicator = document.getElementById('views-collapse-indicator');
    function toggleViews() {
        isViewsCollapsed = !isViewsCollapsed;
        if (panelViewsContent) panelViewsContent.classList.toggle('hidden', isViewsCollapsed);
        if (viewsCollapseIndicator) viewsCollapseIndicator.textContent = isViewsCollapsed ? '▼' : '▲';
    }
    if (btnCollapseViews) btnCollapseViews.onclick = toggleViews;

    let isTelemetryCollapsed = false;
    const hudDrivetrain = document.getElementById('hud-drivetrain-panel');
    const hudWeapons = document.getElementById('hud-weapons-panel');
    const btnCollapseTelemetry = document.getElementById('btn-collapse-telemetry');
    const telemetryCollapseIcon = document.getElementById('telemetry-collapse-icon');
    function toggleTelemetry() {
        isTelemetryCollapsed = !isTelemetryCollapsed;
        if (hudDrivetrain) hudDrivetrain.classList.toggle('hidden', isTelemetryCollapsed);
        if (hudWeapons) hudWeapons.classList.toggle('hidden', isTelemetryCollapsed);
        if (telemetryCollapseIcon) telemetryCollapseIcon.textContent = isTelemetryCollapsed ? '▼ Show' : '▲ Hide';
    }
    if (btnCollapseTelemetry) btnCollapseTelemetry.onclick = toggleTelemetry;

    // Only display mobile controls on actual mobile / touch browsers
    const mobWrapper = document.getElementById('mobile-controls-wrapper');
    if (mobWrapper) {
        if (isMobileBrowser()) {
            mobWrapper.classList.remove('hidden');
        } else {
            mobWrapper.classList.add('hidden');
        }
    }

    let isMobileCollapsed = false;
    const mobJoyContainer = document.getElementById('mobile-joystick-container');
    const mobActions = document.getElementById('mobile-actions');
    const btnCollapseMobile = document.getElementById('btn-collapse-mobile');
    function toggleMobileControls() {
        isMobileCollapsed = !isMobileCollapsed;
        if (mobJoyContainer) mobJoyContainer.classList.toggle('hidden', isMobileCollapsed);
        if (mobActions) mobActions.classList.toggle('hidden', isMobileCollapsed);
        if (btnCollapseMobile) btnCollapseMobile.textContent = isMobileCollapsed ? '🎮 Controls ▼' : '🎮 Controls ▲';
    }
    if (btnCollapseMobile) btnCollapseMobile.onclick = toggleMobileControls;
}

window.cameraMode = cameraMode;
window.isFpvZoomed = isFpvZoomed;
window.isOrthographic = isOrthographic;
window.camOrbit = camOrbit;
window.aimCursorNDC = aimCursorNDC;
window.raycaster = raycaster;
window.worldAimPoint = worldAimPoint;
window.actualGunHitPoint = actualGunHitPoint;
window.keys = keys;
window.isFiringCoaxMG = isFiringCoaxMG;
window.isFiringBowMG = isFiringBowMG;
window.touchDrive = touchDrive;
window.toggleProjection = toggleProjection;
window.updateCameraProjectionAspect = updateCameraProjectionAspect;
window.applyOrthoPreset = applyOrthoPreset;
window.setCameraMode = setCameraMode;
window.toggleHeadlights = toggleHeadlights;
window.initControls = initControls;
