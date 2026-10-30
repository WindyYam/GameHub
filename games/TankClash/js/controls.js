// ============================================================================
// TigerTank Input, Camera & UI Controls
// Active Control Mode by Default, Multi-Touch Virtual Joystick + Turret Aim
// ============================================================================

var cameraMode = 'orbit'; // 'orbit' (Follow Aim) | 'fpv' (First Person)
var isFpvZoomed = false;

var camOrbit = {
    theta: Math.PI + 0.16,
    phi: 1.34,
    distance: 11.5
};

var aimCursorNDC = new THREE.Vector2(0, 0);
var raycaster = new THREE.Raycaster();
var worldAimPoint = new THREE.Vector3(0, 1.5, 60);
var actualGunHitPoint = new THREE.Vector3(0, 1.5, 60);

var keys = {};
var isFiringCoaxMG = false;
var isFiringBowMG = false;
var touchDrive = { forward: 0, turn: 0, strafe: 0, magnitude: 0, isMax: false };

function isMobileBrowser() {
    const ua = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|crios|tablet/i.test(ua);
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    return isMobileUA && hasTouch;
}
window.isMobileBrowser = isMobileBrowser;

function isMobileDevice() {
    return isMobileBrowser();
}
window.isMobileDevice = isMobileDevice;

function setCameraMode(mode) {
    if (window.playerMode === 'soldier' && mode === 'fpv') return;
    cameraMode = mode;
    window.cameraMode = mode;
    ['cam-orbit', 'cam-fpv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', mode === id.replace('cam-', ''));
    });

    const fpvEl = document.getElementById('fpv-overlay');
    if (fpvEl) fpvEl.classList.toggle('hidden', mode !== 'fpv');
    const extReticle = document.getElementById('external-reticle');
    if (extReticle) extReticle.classList.remove('hidden');

    if (window.perspCamera) {
        if (mode === 'fpv') {
            isFpvZoomed = false;
            window.perspCamera.fov = 46;
            if (window.tankState) {
                camOrbit.theta = tankState.heading + (tankState.turretYaw || 0) + Math.PI;
                camOrbit.phi = THREE.MathUtils.clamp(Math.PI / 2 + (tankState.gunElevation || 0), 0.95, 2.20);
            }
        } else {
            window.perspCamera.fov = 42;
            camOrbit.phi = THREE.MathUtils.clamp(camOrbit.phi, 0.45, 1.85);
        }
        window.perspCamera.updateProjectionMatrix();
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
    // ------------------------------------------------------------------------
    // 1. KEYBOARD CONTROLS
    // ------------------------------------------------------------------------
    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        keys[k] = true;
        if (k === ' ') {
            e.preventDefault();
            if (window.playerMode === 'soldier') {
                if (typeof window.soldierJump === 'function') window.soldierJump();
            } else {
                fireMainCannon();
            }
        }
        if (k === 'g') {
            e.preventDefault();
            if (window.playerMode === 'soldier') {
                if (typeof window.throwPlayerGrenade === 'function') window.throwPlayerGrenade();
            } else {
                isFiringBowMG = true;
                window.isFiringBowMG = true;
            }
        }
        if (k === 'f') {
            if (window.playerMode !== 'soldier') {
                isFiringCoaxMG = true;
                window.isFiringCoaxMG = true;
            }
        }
        if (k === 'x') { if (window.playerMode !== 'soldier') fireSmokeDischargers(); }
        if (k === 'h') { if (window.playerMode !== 'soldier') toggleHeadlights(); }
        if (k === 'b') { if (typeof window.toggleGrass === 'function') window.toggleGrass(); }
        if (k === 'e') { if (typeof window.triggerInteract === 'function') window.triggerInteract(); }
        if (k === 'r') { if (typeof window.restartGame === 'function') window.restartGame(); }
        if (k === 't') { if (window.dayNight && window.dayNight.cycleNext) window.dayNight.cycleNext(); }
        if (window.playerMode !== 'soldier' && typeof window.switchTank === 'function') {
            if (k === '1') {
                window.switchTank('tiger');
                if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('Switched to Pz.VI Tiger Ausf. E', '#fbbf24');
            }
            if (k === '2') {
                window.switchTank('kingtiger');
                if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('Switched to Pz.VI Ausf. B King Tiger (Ambush Camo)', '#fbbf24');
            }
            if (k === '3') {
                window.switchTank('sherman');
                if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('Switched to M4 Sherman', '#84cc16');
            }
            if (k === '4') {
                window.switchTank('t34');
                if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('Switched to T-34-85', '#ef4444');
            }
            if (k === '5') {
                window.switchTank('kv2');
                if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('Switched to KV-2 Heavy Tank ("ЗА РОДИНУ")', '#ef4444');
            }
            if (k === '6') {
                window.switchTank('pershing');
                if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('Switched to M26 Pershing Heavy Tank', '#d97706');
            }
        }
        if (k === 'v' || k === 'c') {
            if (window.playerMode !== 'soldier') {
                setCameraMode(cameraMode === 'fpv' ? 'orbit' : 'fpv');
            }
        }
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
        if (k === 'g') { isFiringBowMG = false; window.isFiringBowMG = false; }
        if (k === 'f') { isFiringCoaxMG = false; window.isFiringCoaxMG = false; }
    });

    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // ------------------------------------------------------------------------
    // 2. DESKTOP MOUSE LOOK & DEFAULT ACTIVE CONTROL MODE
    // Move mouse directly pans view / aims turret from the start without clicking first.
    // Left-click immediately fires 8.8cm KwK 36 cannon on the first click!
    // ------------------------------------------------------------------------
    let lastMouseX = null;
    let lastMouseY = null;

    renderer.domElement.addEventListener('mousedown', (e) => {
        soundFX.init();
        if (e.button === 0) {
            // Left click: Fire player rifle in soldier mode or main cannon in tank mode
            if (window.playerMode === 'soldier') {
                if (typeof window.firePlayerRifle === 'function') window.firePlayerRifle();
            } else {
                fireMainCannon();
            }
            // Also acquire pointer lock if available so mouse doesn't leave window
            if (document.pointerLockElement !== renderer.domElement && renderer.domElement.requestPointerLock) {
                renderer.domElement.requestPointerLock();
            }
        } else if (e.button === 2) {
            e.preventDefault();
            if (window.playerMode === 'soldier') {
                // In infantry mode, right click throws the grenade
                if (typeof window.throwPlayerGrenade === 'function') window.throwPlayerGrenade();
            } else if (cameraMode === 'fpv') {
                isFpvZoomed = true;
                window.perspCamera.fov = 15;
                window.perspCamera.updateProjectionMatrix();
                const zoomEl = document.getElementById('fpv-svg-zoom');
                if (zoomEl) zoomEl.textContent = 'OPTICAL 3.5× [ZOOMED]';
            } else {
                isFiringCoaxMG = true;
                window.isFiringCoaxMG = true;
            }
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
            isFiringCoaxMG = false;
            window.isFiringCoaxMG = false;
            if (window.playerMode !== 'soldier') {
                if (cameraMode === 'fpv') {
                    isFpvZoomed = false;
                    window.perspCamera.fov = 46;
                    window.perspCamera.updateProjectionMatrix();
                    const zoomEl = document.getElementById('fpv-svg-zoom');
                    if (zoomEl) zoomEl.textContent = 'OPTICAL 1.0× [HOLD RMB / SCROLL: 3.5× ZOOM]';
                }
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        const locked = (document.pointerLockElement === renderer.domElement);
        let dx = 0;
        let dy = 0;

        if (locked) {
            dx = e.movementX || 0;
            dy = e.movementY || 0;
        } else {
            if (lastMouseX !== null && lastMouseY !== null) {
                const stepX = (e.movementX !== undefined && Math.abs(e.movementX) > 0) ? e.movementX : (e.clientX - lastMouseX);
                const stepY = (e.movementY !== undefined && Math.abs(e.movementY) > 0) ? e.movementY : (e.clientY - lastMouseY);
                // Filter large jumps when cursor re-enters window
                if (Math.abs(stepX) < 120 && Math.abs(stepY) < 120) {
                    dx = stepX;
                    dy = stepY;
                }
            }
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }

        if (dx !== 0 || dy !== 0) {
            if (cameraMode === 'fpv') {
                const sens = isFpvZoomed ? 0.0012 : 0.0028;
                camOrbit.theta -= dx * sens;
                const minPhi = 0.95;
                const maxPhi = 2.20;
                camOrbit.phi = THREE.MathUtils.clamp(camOrbit.phi - dy * sens, minPhi, maxPhi);
            } else {
                const sens = 0.0032;
                camOrbit.theta -= dx * sens;
                const minPhi = (window.playerMode === 'soldier') ? 0.18 : 0.45;
                const maxPhi = (window.playerMode === 'soldier') ? 2.90 : 1.85;
                camOrbit.phi = THREE.MathUtils.clamp(camOrbit.phi - dy * sens, minPhi, maxPhi);
            }
        }
        aimCursorNDC.set(0, 0);
    });

    window.addEventListener('wheel', (e) => {
        if (window.playerMode === 'soldier') {
            camOrbit.distance = THREE.MathUtils.clamp(camOrbit.distance + e.deltaY * 0.004, 1.8, 6.0);
            return;
        }
        if (cameraMode === 'fpv') {
            window.perspCamera.fov = THREE.MathUtils.clamp(window.perspCamera.fov + e.deltaY * 0.03, 12, 55);
            window.perspCamera.updateProjectionMatrix();
            const zoomRatio = (46 / window.perspCamera.fov).toFixed(1);
            const zoomEl = document.getElementById('fpv-svg-zoom');
            if (zoomEl) zoomEl.textContent = `OPTICAL ${zoomRatio}× [HOLD RMB / SCROLL ZOOM]`;
        } else {
            camOrbit.distance = THREE.MathUtils.clamp(camOrbit.distance + e.deltaY * 0.007, 4.2, 28.0);
        }
    }, { passive: true });

    // ------------------------------------------------------------------------
    // 3. MULTI-TOUCH CONTROLS: VIRTUAL JOYSTICK + SIMULTANEOUS TURRET AIM
    // Thumb 1 controls driving on virtual joystick, while Thumb 2 freely swipes
    // to steer camera/turret at the same time without mutual interference.
    // ------------------------------------------------------------------------
    let activeAimTouchId = null;
    let activeJoystickTouchId = null;
    let touchAimLastX = 0;
    let touchAimLastY = 0;
    let initialPinchDist = 0;
    let initialOrbitDist = 0;
    let initialFovDist = 0;

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
        const mag = Math.min(1.0, Math.hypot(normX, normY));

        // Deadzone threshold of 0.08
        touchDrive.forward   = (Math.abs(normY) > 0.08) ? -normY : 0;
        touchDrive.turn      = (Math.abs(normX) > 0.08) ? -normX : 0;
        touchDrive.strafe    = (Math.abs(normX) > 0.08) ? normX : 0;
        touchDrive.magnitude = (mag > 0.08) ? mag : 0;
        touchDrive.isMax     = mag >= 0.85;
    }

    function resetJoystick() {
        if (joystickKnob) joystickKnob.style.transform = 'translate(-50%, -50%)';
        touchDrive.forward   = 0;
        touchDrive.turn      = 0;
        touchDrive.strafe    = 0;
        touchDrive.magnitude = 0;
        touchDrive.isMax     = false;
        activeJoystickTouchId = null;
    }

    // Joystick Touch Acquisition on joystickBase
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
    }

    // Window-level touch tracking for seamless multi-finger gameplay
    window.addEventListener('touchstart', (e) => {
        soundFX.init();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === activeJoystickTouchId) continue;

            const target = t.target;
            const isControlUI = target && (
                target.closest('#mobile-actions') ||
                target.closest('#panel-views') ||
                target.closest('#portrait-orientation-prompt') ||
                target.closest('#joystick-base')
            );
            if (isControlUI) continue;

            // Touch anywhere else on screen is an aim touch!
            if (activeAimTouchId === null) {
                activeAimTouchId = t.identifier;
                touchAimLastX = t.clientX;
                touchAimLastY = t.clientY;
            }
        }

        // Handle pinch-to-zoom if two non-joystick touches are active
        const nonJoyTouches = Array.from(e.touches).filter(t => t.identifier !== activeJoystickTouchId);
        if (nonJoyTouches.length === 2) {
            const dx = nonJoyTouches[0].clientX - nonJoyTouches[1].clientX;
            const dy = nonJoyTouches[0].clientY - nonJoyTouches[1].clientY;
            initialPinchDist = Math.hypot(dx, dy);
            initialOrbitDist = camOrbit.distance;
            initialFovDist = window.perspCamera.fov;
        }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        // 1. Update Joystick if active
        if (activeJoystickTouchId !== null) {
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === activeJoystickTouchId) {
                    e.preventDefault();
                    updateJoystick(e.touches[i].clientX, e.touches[i].clientY);
                    break;
                }
            }
        }

        // 2. Update Turret Aim / Camera Orbit if active
        if (activeAimTouchId !== null) {
            for (let i = 0; i < e.touches.length; i++) {
                const t = e.touches[i];
                if (t.identifier === activeAimTouchId) {
                    e.preventDefault();
                    const dx = t.clientX - touchAimLastX;
                    const dy = t.clientY - touchAimLastY;
                    touchAimLastX = t.clientX;
                    touchAimLastY = t.clientY;

                    if (cameraMode === 'fpv') {
                        const sens = isFpvZoomed ? 0.0020 : 0.0045;
                        camOrbit.theta -= dx * sens;
                        const minPhi = 0.95;
                        const maxPhi = 2.20;
                        camOrbit.phi = THREE.MathUtils.clamp(camOrbit.phi - dy * sens, minPhi, maxPhi);
                    } else {
                        const sens = 0.0055;
                        camOrbit.theta -= dx * sens;
                        const minPhi = (window.playerMode === 'soldier') ? 0.18 : 0.45;
                        const maxPhi = (window.playerMode === 'soldier') ? 2.90 : 1.85;
                        camOrbit.phi = THREE.MathUtils.clamp(camOrbit.phi - dy * sens, minPhi, maxPhi);
                    }
                    break;
                }
            }
        }

        // 3. Handle Two-finger pinch zoom
        const nonJoyTouches = Array.from(e.touches).filter(t => t.identifier !== activeJoystickTouchId);
        if (nonJoyTouches.length === 2 && initialPinchDist > 0) {
            e.preventDefault();
            const dx = nonJoyTouches[0].clientX - nonJoyTouches[1].clientX;
            const dy = nonJoyTouches[0].clientY - nonJoyTouches[1].clientY;
            const dist = Math.hypot(dx, dy);
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
    }, { passive: false });

    const handleTouchEndOrCancel = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const id = e.changedTouches[i].identifier;
            if (id === activeJoystickTouchId) {
                resetJoystick();
            }
            if (id === activeAimTouchId) {
                activeAimTouchId = null;
            }
        }
        if (e.touches.length < 2) {
            initialPinchDist = 0;
        }
    };

    window.addEventListener('touchend', handleTouchEndOrCancel, { passive: false });
    window.addEventListener('touchcancel', handleTouchEndOrCancel, { passive: false });

    // ------------------------------------------------------------------------
    // 4. TOP VIEWS & AUDIO CONTROLS
    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // 4b. TANK SELECTOR BUTTONS
    // ------------------------------------------------------------------------
    document.querySelectorAll('.tank-select-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tid = btn.getAttribute('data-tank');
            if (tid && typeof window.switchTank === 'function') {
                window.switchTank(tid);
            }
        });
    });

    const btnOrbit = document.getElementById('cam-orbit');
    if (btnOrbit) btnOrbit.onclick = () => setCameraMode('orbit');

    const btnFpv = document.getElementById('cam-fpv');
    if (btnFpv) btnFpv.onclick = () => { if (window.playerMode !== 'soldier') setCameraMode('fpv'); };

    const audioBtn = document.getElementById('audio-toggle');
    if (audioBtn) {
        audioBtn.onclick = (e) => {
            soundFX.init();
            soundFX.enabled = !soundFX.enabled;
            e.target.textContent = soundFX.enabled ? '🔊' : '🔇';
            e.target.classList.toggle('text-emerald-400', soundFX.enabled);
            e.target.classList.toggle('text-slate-400', !soundFX.enabled);
        };
    }

    // ------------------------------------------------------------------------
    // 5. MOBILE COMBAT BUTTONS
    // ------------------------------------------------------------------------
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

    const mob88 = document.getElementById('mob-fire-88');
    if (mob88) mob88.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        soundFX.init();
        if (window.playerMode === 'soldier') {
            if (typeof window.firePlayerRifle === 'function') window.firePlayerRifle();
        } else {
            fireMainCannon();
        }
    });

    const mobInteract = document.getElementById('mob-btn-interact');
    if (mobInteract) {
        mobInteract.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            soundFX.init();
            if (typeof window.triggerInteract === 'function') window.triggerInteract();
        });
    }

    bindPointerAction('mob-fire-coax', () => {
        if (window.playerMode !== 'soldier') {
            isFiringCoaxMG = true;
            window.isFiringCoaxMG = true;
        }
    }, () => {
        isFiringCoaxMG = false;
        window.isFiringCoaxMG = false;
    });
    bindPointerAction('mob-fire-bow',  () => {
        if (window.playerMode !== 'soldier') {
            isFiringBowMG = true;
            window.isFiringBowMG = true;
        }
    }, () => {
        isFiringBowMG = false;
        window.isFiringBowMG = false;
    });

    const mobJump = document.getElementById('mob-btn-jump');
    if (mobJump) {
        mobJump.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            soundFX.init();
            if (typeof window.soldierJump === 'function') window.soldierJump();
        });
    }

    const mobGrenade = document.getElementById('mob-btn-grenade');
    if (mobGrenade) {
        mobGrenade.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            soundFX.init();
            if (typeof window.throwPlayerGrenade === 'function') window.throwPlayerGrenade();
        });
    }

    const mobZoom = document.getElementById('mob-btn-zoom');
    if (mobZoom) {
        mobZoom.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            soundFX.init();
            if (window.playerMode === 'soldier') return;
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
    if (mobSmoke) mobSmoke.addEventListener('pointerdown', (e) => { e.preventDefault(); soundFX.init(); if (window.playerMode !== 'soldier') fireSmokeDischargers(); });

    const btnGrass = document.getElementById('btn-grass-toggle');
    if (btnGrass) {
        btnGrass.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.toggleGrass === 'function') window.toggleGrass();
        });
    }

    const btnTimeCycle = document.getElementById('btn-time-cycle');
    if (btnTimeCycle) btnTimeCycle.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.dayNight && window.dayNight.cycleNext) window.dayNight.cycleNext();
    });

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) btnRestart.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.restartGame === 'function') window.restartGame();
    });

    const mobBtnRestart = document.getElementById('mob-btn-restart');
    if (mobBtnRestart) mobBtnRestart.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (typeof window.restartGame === 'function') window.restartGame();
    });

    // ------------------------------------------------------------------------
    // 6. FULLSCREEN & LANDSCAPE HELPER
    // ------------------------------------------------------------------------
    function requestLandscapeFullscreen() {
        const el = document.documentElement;
        if (el.requestFullscreen) {
            el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
        const prompt = document.getElementById('portrait-orientation-prompt');
        if (prompt) prompt.classList.add('hidden');

        if (typeof window.onWindowResize === 'function') {
            window.onWindowResize();
            setTimeout(window.onWindowResize, 100);
            setTimeout(window.onWindowResize, 300);
            setTimeout(window.onWindowResize, 600);
        }
    }

    const btnReqLandscape = document.getElementById('btn-request-landscape');
    if (btnReqLandscape) btnReqLandscape.onclick = requestLandscapeFullscreen;

    const btnFsLandscape = document.getElementById('btn-fullscreen-landscape');
    if (btnFsLandscape) btnFsLandscape.onclick = requestLandscapeFullscreen;

    // Mobile Overlay Display Check
    const mobWrapper = document.getElementById('mobile-controls-wrapper');
    if (mobWrapper) {
        if (isMobileBrowser()) {
            document.body.classList.add('is-mobile');
            mobWrapper.classList.remove('hidden');
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            }
        } else {
            mobWrapper.classList.add('hidden');
        }
    }
}

window.cameraMode = cameraMode;
window.isFpvZoomed = isFpvZoomed;
window.camOrbit = camOrbit;
window.aimCursorNDC = aimCursorNDC;
window.raycaster = raycaster;
window.worldAimPoint = worldAimPoint;
window.actualGunHitPoint = actualGunHitPoint;
window.keys = keys;
window.isFiringCoaxMG = isFiringCoaxMG;
window.isFiringBowMG = isFiringBowMG;
window.touchDrive = touchDrive;
window.setCameraMode = setCameraMode;
window.toggleHeadlights = toggleHeadlights;
window.initControls = initControls;
