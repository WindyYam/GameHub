// ============================================================================
// World War 2 Simulator — Player Infantry Dismount, Mount & Tank Hijacking System
// ============================================================================
(function () {
    'use strict';

    let playerMode = 'tank'; // 'tank' or 'soldier'
    let playerSoldier = null;

    function onPlayerSoldierDamage(amount) {
        const s = playerSoldier || window.playerSoldier;
        if (!s || s.isDead) return;
        if (!playerSoldier) playerSoldier = s;
        if (playerSoldier.invulnerableTimer > 0) return;
        s.health = Math.max(0, s.health - Math.round(amount));
        s.healTimer = 0;

        // Flinch / kickback impulse
        s.speed = -0.8;
        s.recoilKick = 0.45;

        const pPos = new THREE.Vector3(s.x, s.y + 1.1, s.z);
        // Blood/impact dust particles
        if (typeof window.spawnParticle === 'function') {
            for (let i = 0; i < 4; i++) {
                const pVel = new THREE.Vector3((Math.random() - 0.5) * 2.0, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 2.0);
                window.spawnParticle(pPos, pVel, 0x881111, 0.12, 0.32, 0.4, false, 'smoke');
            }
        }

        // Red damage screen flash
        if (typeof window.showDamageFlash === 'function') {
            window.showDamageFlash(s.health <= 0 ? 0.8 : 0.45);
        }

        // Ricochet / hit sound
        if (window.soundFX && typeof window.soundFX.playArmorRicochet === 'function') {
            window.soundFX.playArmorRicochet(pPos);
        }

        // Update HUD
        const hudArmor = document.getElementById('hud-armor');
        if (hudArmor) {
            hudArmor.textContent = `HP: ${s.health}/100`;
            hudArmor.className = s.health > 40 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold';
        }

        if (s.health <= 0) {
            onPlayerSoldierDie();
        } else {
            if (typeof window.showKillFeedBanner === 'function') {
                window.showKillFeedBanner(`⚠️ INFANTRY HIT! (HP: ${s.health}/100)`);
            }
        }
    }
    window.damagePlayerSoldier = onPlayerSoldierDamage;

    function startSoldierDeathAnimation(soldier) {
        const rig = soldier && soldier.rig;
        if (!rig) return;
        const pose = [];
        function addPose(object, axis, target) {
            if (object && typeof object[axis] === 'number') {
                pose.push([object, axis, target]);
            }
        }
        if (rig.hips) {
            addPose(rig.hips.position, 'y', 0.14);
            addPose(rig.hips.rotation, 'x', -Math.PI * 0.48);
            addPose(rig.hips.rotation, 'z', (Math.random() - 0.5) * 0.35);
        }
        if (rig.torso) {
            addPose(rig.torso.rotation, 'x', 0);
            addPose(rig.torso.rotation, 'y', 0);
        }
        if (rig.head) {
            addPose(rig.head.rotation, 'x', -0.3);
            addPose(rig.head.rotation, 'y', 0);
        }
        if (rig.rightArm && rig.rightArm.shoulder) {
            addPose(rig.rightArm.shoulder.rotation, 'x', -0.25);
            addPose(rig.rightArm.shoulder.rotation, 'y', 0);
            addPose(rig.rightArm.shoulder.rotation, 'z', -1.2);
        }
        if (rig.leftArm && rig.leftArm.shoulder) {
            addPose(rig.leftArm.shoulder.rotation, 'x', -0.35);
            addPose(rig.leftArm.shoulder.rotation, 'y', 0);
            addPose(rig.leftArm.shoulder.rotation, 'z', 1.15);
        }
        if (rig.rightLeg && rig.rightLeg.hipJoint) {
            addPose(rig.rightLeg.hipJoint.rotation, 'x', 0.12);
            addPose(rig.rightLeg.hipJoint.rotation, 'z', 0.25);
        }
        if (rig.leftLeg && rig.leftLeg.hipJoint) {
            addPose(rig.leftLeg.hipJoint.rotation, 'x', -0.18);
            addPose(rig.leftLeg.hipJoint.rotation, 'z', -0.3);
        }
        if (rig.rightLeg && rig.rightLeg.kneeJoint) {
            addPose(rig.rightLeg.kneeJoint.rotation, 'x', 0.05);
        }
        if (rig.leftLeg && rig.leftLeg.kneeJoint) {
            addPose(rig.leftLeg.kneeJoint.rotation, 'x', 0.1);
        }
        if (rig.rifle && rig.rifle.position) {
            addPose(rig.rifle.position, 'x', 0.25);
            addPose(rig.rifle.position, 'y', 0.05);
            addPose(rig.rifle.position, 'z', 0.2);
        }
        if (rig.rifle && rig.rifle.rotation) {
            addPose(rig.rifle.rotation, 'x', 0);
            addPose(rig.rifle.rotation, 'y', (Math.random() - 0.5) * 2);
            addPose(rig.rifle.rotation, 'z', 1.57);
        }
        soldier.deathAnimation = {
            elapsed: 0,
            pose: pose.map(([object, axis, target]) => ({ object, axis, start: object[axis], target }))
        };
        if (rig.handGrenade) rig.handGrenade.visible = false;
        if (rig.rifle) rig.rifle.visible = soldier.soldierType !== 'mortar';
    }
    window.startSoldierDeathAnimation = startSoldierDeathAnimation;

    function updateSoldierDeathAnimation(s, dt, camera) {
        const animation = s.deathAnimation;
        if (animation) {
            animation.elapsed = Math.min(animation.elapsed + dt, 0.8);
            const progress = animation.elapsed / 0.8;
            const eased = progress * progress * (3 - 2 * progress);
            for (const joint of animation.pose) {
                joint.object[joint.axis] = joint.start + (joint.target - joint.start) * eased;
            }
        }

        if (s.isGrounded === false) {
            s.vy -= 18.0 * dt;
            s.y += s.vy * dt;
            const ground = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(s.x, s.z) : 0;
            if (s.y <= ground) {
                s.y = ground;
                s.vy = 0;
                s.isGrounded = true;
            }
            s.rig.root.position.set(s.x, s.y, s.z);
        }

        if (camera) {
            camera.lookAt(new THREE.Vector3(s.x, s.y + s.rig.hips.position.y + 0.25, s.z));
            camera.updateMatrixWorld();
        }
    }
    window.updateSoldierDeathAnimation = updateSoldierDeathAnimation;

    function onPlayerSoldierDie() {
        if (!playerSoldier || playerSoldier.isDead) return;
        if (playerSoldier.isMountedBicycle && typeof window.dismountBicycle === 'function') {
            window.dismountBicycle(playerSoldier);
        }
        if (playerSoldier.rig && playerSoldier.rig.deployedMortar && window.scene) {
            window.scene.remove(playerSoldier.rig.deployedMortar);
            playerSoldier.rig.deployedMortar = null;
            playerSoldier.mortarDeployed = false;
        }
        playerSoldier.isDead = true;
        playerSoldier.speed = 0;

        if (typeof window.onPlayerDeath === 'function') {
            window.onPlayerDeath();
        }

        const soldier = playerSoldier;
        startSoldierDeathAnimation(soldier);
        currentInteractAction = null;
        hideInteractPrompt();
        if (crosshairEl) crosshairEl.classList.add('hidden');

        if (typeof window.showKillFeedBanner === 'function') {
            window.showKillFeedBanner('☠️ KILLED IN ACTION (INFANTRY CASUALTY)');
        }

        setTimeout(() => {
            if (playerSoldier === soldier && typeof window.showKnockoutModal === 'function') {
                window.                showKnockoutModal();
            }
        }, 1200);
        }
    let currentInteractAction = null; // null, { type: 'mount' }, { type: 'hijack', enemyTank }, { type: 'dismount' }
    let lastInteractCheck = 0;

    // Crosshair and interact DOM elements
    let interactPromptEl = null;
    let crosshairEl = null;

    function getPlayerFaction() {
        const tid = window.currentTankId || 'tiger';
        if (tid === 'tiger' || tid === 'kingtiger' || tid === 'tiger2' || tid === 'king_tiger') return 'german';
        if (tid === 'sherman' || tid === 'pershing' || tid === 'm26' || tid === 'm26_pershing') return 'us';
        return 'soviet';
    }

    function createMortarMetalMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const scratchContext = canvas.getContext('2d');
        if (scratchContext) {
            scratchContext.fillStyle = '#252a23';
            scratchContext.fillRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < 36; i++) {
                const x = (i * 47 + 11) % canvas.width;
                const y = (i * 71 + 23) % canvas.height;
                const length = 3 + (i * 13) % 17;
                scratchContext.strokeStyle = i % 4 === 0 ? 'rgba(139, 143, 126, 0.72)' : 'rgba(8, 11, 8, 0.86)';
                scratchContext.lineWidth = i % 7 === 0 ? 1 : 0.55;
                scratchContext.beginPath();
                scratchContext.moveTo(x, y);
                scratchContext.lineTo(Math.min(canvas.width - 1, x + length), y + (i % 3 - 1) * 1.5);
                scratchContext.stroke();
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
        return new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, roughness: 0.94, metalness: 0.18 });
    }

    function createCarriedMortar(rig) {
        const mortar = createMortarEmplacement();
        mortar.name = 'CarriedMortarPack';
        mortar.rotation.x = -Math.PI / 2;
        mortar.position.set(0, -0.13, 0.34);
        mortar.userData.barrelPivot.rotation.x = 0;

        mortar.userData.baseRing.position.set(0, 0.49, 0.02);
        mortar.userData.baseRing.rotation.x = 0;
        mortar.userData.basePlate.position.set(0, 0.49, 0.02);
        mortar.userData.basePlate.rotation.x = Math.PI / 2;
        mortar.userData.baseBolts.forEach((bolt, index) => {
            const angle = index * Math.PI / 3;
            bolt.position.set(Math.cos(angle) * 0.115, 0.49 + Math.sin(angle) * 0.115, 0.02);
            bolt.rotation.x = Math.PI / 2;
        });

        mortar.userData.sideLegs.forEach(({ mesh, side }) => {
            mesh.position.set(side * 0.075, 0.49, 0.32);
            mesh.rotation.set(Math.PI / 2, 0, 0);
        });
        mortar.userData.thirdLeg.position.set(0, 0.40, 0.32);
        mortar.userData.thirdLeg.rotation.set(Math.PI / 2, 0, 0);
        mortar.userData.supportStruts.forEach(strut => { strut.visible = false; });

        const wrapCanvas = document.createElement('canvas');
        wrapCanvas.width = 64;
        wrapCanvas.height = 64;
        const wrapContext = wrapCanvas.getContext('2d');
        if (wrapContext) {
            wrapContext.fillStyle = '#414438';
            wrapContext.fillRect(0, 0, 64, 64);
            for (let i = 0; i < 64; i += 4) {
                wrapContext.strokeStyle = i % 8 === 0 ? 'rgba(126, 125, 97, 0.22)' : 'rgba(20, 24, 19, 0.2)';
                wrapContext.lineWidth = 1;
                wrapContext.beginPath();
                wrapContext.moveTo(i, 0);
                wrapContext.lineTo(i, 64);
                wrapContext.moveTo(0, i);
                wrapContext.lineTo(64, i);
                wrapContext.stroke();
            }
        }
        const wrapTexture = new THREE.CanvasTexture(wrapCanvas);
        if (THREE.sRGBEncoding !== undefined) wrapTexture.encoding = THREE.sRGBEncoding;
        const wrapMaterial = new THREE.MeshStandardMaterial({ map: wrapTexture, roughness: 1, metalness: 0 });
        const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.20, 16, 1, true), wrapMaterial);
        wrap.rotation.x = Math.PI / 2;
        wrap.position.set(0, 0.49, 0.32);
        mortar.add(wrap);

        const strapMaterial = new THREE.MeshStandardMaterial({ color: 0x303329, roughness: 1, metalness: 0 });
        [0.225, 0.415].forEach(z => {
            const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 16, 1, true), strapMaterial);
            strap.rotation.x = Math.PI / 2;
            strap.position.set(0, 0.49, z);
            mortar.add(strap);
        });

        rig.torso.add(mortar);
        rig.carriedMortar = mortar;
    }

    function createMortarEmplacement() {
        const emplacement = new THREE.Group();
        const metal = createMortarMetalMaterial();
        const hardware = new THREE.MeshStandardMaterial({ color: 0x383c34, roughness: 0.82, metalness: 0.35 });
        const scratchMaterial = new THREE.MeshStandardMaterial({ color: 0x73776b, roughness: 0.9, metalness: 0.25 });
        const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 24), metal);
        baseRing.rotation.x = Math.PI / 2;
        baseRing.position.y = 0.045;
        emplacement.add(baseRing);

        const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.055, 20), metal);
        basePlate.position.y = 0.04;
        emplacement.add(basePlate);

        const baseBolts = [];
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8), hardware);
            bolt.position.set(Math.cos(angle) * 0.115, 0.074, Math.sin(angle) * 0.115);
            baseBolts.push(bolt);
            emplacement.add(bolt);
        }

        [[-0.06, 0.02, 0.045], [0.03, -0.05, 0.035], [-0.015, -0.09, 0.032]].forEach(([x, z, length]) => {
            const scratch = new THREE.Mesh(new THREE.BoxGeometry(length, 0.0012, 0.002), scratchMaterial);
            scratch.position.set(x, 0.0685, z);
            scratch.rotation.y = x * 2.5;
            basePlate.add(scratch);
        });

        const supportHead = new THREE.Group();
        const headPlate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.24), metal);
        headPlate.position.set(0, 0.41, 0.02);
        supportHead.add(headPlate);
        [-1, 1].forEach(side => {
            const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.13, 0.12), hardware);
            cheek.position.set(side * 0.08, 0.49, 0.02);
            supportHead.add(cheek);

            const bearing = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 6, 16), hardware);
            bearing.rotation.y = Math.PI / 2;
            bearing.position.set(side * 0.095, 0.49, 0.02);
            supportHead.add(bearing);
        });
        emplacement.add(supportHead);

        const sideLegs = [];
        [-1, 1].forEach(side => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.48, 0.045), metal);
            leg.position.set(side * 0.18, 0.24, -0.08);
            leg.rotation.z = side * 0.45;
            emplacement.add(leg);
            sideLegs.push({ mesh: leg, side });
        });

        const thirdLeg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.48, 0.045), metal);
        thirdLeg.position.set(0, 0.24, 0.18);
        thirdLeg.rotation.x = -0.45;
        emplacement.add(thirdLeg);

        const supportStruts = Array.from({ length: 3 }, () => {
            const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), hardware);
            strut.castShadow = true;
            emplacement.add(strut);
            return strut;
        });

        const tubeLength = 0.76;
        const barrelPivot = new THREE.Group();
        barrelPivot.position.set(0, 0.49, 0.02);
        barrelPivot.rotation.x = -Math.PI / 4;
        emplacement.add(barrelPivot);

        [-1, 1].forEach(side => {
            const trunnion = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.055, 10), hardware);
            trunnion.rotation.z = Math.PI / 2;
            trunnion.position.x = side * 0.067;
            barrelPivot.add(trunnion);
        });

        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, tubeLength, 12), metal);
        tube.rotation.x = Math.PI / 2;
        tube.position.z = tubeLength * 0.5;
        tube.castShadow = true;
        barrelPivot.add(tube);

        [
            { x: -0.025, z: 0.14, length: 0.075, angle: 0.16 },
            { x: 0.014, z: 0.28, length: 0.055, angle: -0.12 },
            { x: -0.016, z: 0.43, length: 0.068, angle: 0.09 },
            { x: 0.012, z: 0.58, length: 0.045, angle: -0.18 }
        ].forEach(mark => {
            const centerZ = mark.z + mark.length * 0.5;
            const radius = 0.06 - 0.015 * centerZ / tubeLength;
            const surfaceY = Math.sqrt(Math.max(0, radius * radius - mark.x * mark.x));
            const scratch = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0015, mark.length), scratchMaterial);
            scratch.position.set(mark.x, surfaceY + 0.0008, centerZ);
            scratch.rotation.y = mark.angle;
            barrelPivot.add(scratch);
        });

        [0.22, 0.49].forEach(z => {
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.049, 0.005, 6, 16), hardware);
            band.position.z = z;
            barrelPivot.add(band);
        });

        const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, 6, 16), hardware);
        muzzleRing.position.z = tubeLength;
        barrelPivot.add(muzzleRing);

        const muzzle = new THREE.Object3D();
        muzzle.position.z = tubeLength;
        barrelPivot.add(muzzle);
        emplacement.userData.barrelPivot = barrelPivot;
        emplacement.userData.muzzle = muzzle;
        emplacement.userData.baseRing = baseRing;
        emplacement.userData.basePlate = basePlate;
        emplacement.userData.baseBolts = baseBolts;
        emplacement.userData.sideLegs = sideLegs;
        emplacement.userData.thirdLeg = thirdLeg;
        emplacement.userData.supportStruts = supportStruts;
        return emplacement;
    }

    function getMortarPosition(s) {
        const heading = s.heading || 0;
        return {
            x: s.x + Math.sin(heading) * 0.15 - Math.cos(heading) * 0.72,
            z: s.z + Math.cos(heading) * 0.15 + Math.sin(heading) * 0.72
        };
    }

    function packPlayerMortar() {
        const s = playerSoldier || window.playerSoldier;
        if (!s || s.soldierType !== 'mortar' || !s.mortarDeployed) return;
        if (s.rig.deployedMortar && window.scene) window.scene.remove(s.rig.deployedMortar);
        s.rig.deployedMortar = null;
        s.mortarDeployed = false;
        if (s.rig.carriedMortar) s.rig.carriedMortar.visible = true;
        if (s.rig.rifle) s.rig.rifle.visible = false;
        syncInfantryUI(true);
        if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('MORTAR PACKED');
    }
    window.packPlayerMortar = packPlayerMortar;

    function deployPlayerMortar(s) {
        if (s.isMountedBicycle) {
            if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('DISMOUNT TO DEPLOY MORTAR', '#f59e0b');
            return;
        }
        if (s.mortarDeployed) return;
        s.mortarDeployed = true;
        s.mortarElevation = Math.PI / 4;
        s.speed = 0;
        s.rig.deployedMortar = createMortarEmplacement();
        if (s.rig.carriedMortar) s.rig.carriedMortar.visible = false;
        if (s.rig.rifle) s.rig.rifle.visible = false;
        if (window.scene) window.scene.add(s.rig.deployedMortar);
        syncInfantryUI(true);
        if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('MORTAR DEPLOYED: W/S ADJUST ELEVATION, FIRE TO LAUNCH, E OR X TO PACK');
    }

    function applyMortarElevationPose(emplacement, elevation) {
        if (!emplacement || !emplacement.userData || !emplacement.userData.barrelPivot) return;
        const angle = Number.isFinite(elevation) ? elevation : Math.PI / 4;
        const elevationOffset = angle - Math.PI / 4;
        const { sideLegs, thirdLeg } = emplacement.userData;
        emplacement.userData.barrelPivot.rotation.x = -angle;

        const setStrutBetween = (strut, start, end) => {
            const direction = new THREE.Vector3().subVectors(end, start);
            const length = direction.length();
            strut.position.copy(start).add(end).multiplyScalar(0.5);
            strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
            strut.scale.set(1, length, 1);
        };

        const sideSplay = 0.45 + elevationOffset * 0.24;
        (sideLegs || []).forEach(({ mesh, side }) => {
            mesh.rotation.z = side * sideSplay;
            mesh.position.y = 0.24 * Math.cos(sideSplay) + 0.0225 * Math.abs(Math.sin(sideSplay));
        });

        if (thirdLeg) {
            const forwardTilt = -0.45 - elevationOffset * 0.45;
            thirdLeg.rotation.x = forwardTilt;
            thirdLeg.position.y = 0.24 * Math.cos(forwardTilt) + 0.0225 * Math.abs(Math.sin(forwardTilt));
        }

        if (emplacement.userData.supportStruts && sideLegs && thirdLeg) {
            sideLegs.forEach(({ mesh, side }, index) => {
                const tilt = mesh.rotation.z;
                const legTop = new THREE.Vector3(
                    mesh.position.x - Math.sin(tilt) * 0.24,
                    mesh.position.y + Math.cos(tilt) * 0.24,
                    mesh.position.z
                );
                setStrutBetween(emplacement.userData.supportStruts[index], new THREE.Vector3(side * 0.095, 0.49, 0.02), legTop);
            });

            const legTop = new THREE.Vector3(
                0,
                thirdLeg.position.y + Math.cos(thirdLeg.rotation.x) * 0.24,
                thirdLeg.position.z + Math.sin(thirdLeg.rotation.x) * 0.24
            );
            setStrutBetween(emplacement.userData.supportStruts[2], new THREE.Vector3(0, 0.41, 0.08), legTop);
        }
    }

    function adjustMortarElevation(s, forwardInput, dt) {
        if (!s.mortarDeployed) return;
        const minElevation = Math.PI / 36;
        const maxElevation = Math.PI / 2;
        const input = THREE.MathUtils.clamp(forwardInput, -1, 1);
        s.mortarElevation = THREE.MathUtils.clamp(
            (s.mortarElevation || Math.PI / 4) + input * 0.8 * dt,
            minElevation,
            maxElevation
        );
    }

    function initPlayerSoldierUI() {
        if (!document.getElementById('hud-interact-prompt')) {
            interactPromptEl = document.createElement('div');
            interactPromptEl.id = 'hud-interact-prompt';
            interactPromptEl.className = 'hidden fixed bottom-24 left-1/2 -translate-x-1/2 z-40 pointer-events-auto select-none transition-all duration-150';
            interactPromptEl.innerHTML = `
                <button id="btn-interact-action" class="px-5 py-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 active:scale-95 text-amber-300 hover:text-white font-extrabold text-xs tracking-wider border-2 border-amber-400/80 hover:border-amber-300 backdrop-blur-md shadow-2xl transition-all flex items-center gap-2 cursor-pointer">
                    <span id="interact-icon" class="text-base">🚶</span>
                    <span id="interact-label">DISMOUNT TANK</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/25 text-amber-200 border border-amber-400/40 mono">[E]</span>
                </button>
            `;
            document.body.appendChild(interactPromptEl);

            const btn = document.getElementById('btn-interact-action');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    triggerInteract();
                });
            }
        } else {
            interactPromptEl = document.getElementById('hud-interact-prompt');
        }

        if (!document.getElementById('soldier-crosshair')) {
            crosshairEl = document.createElement('div');
            crosshairEl.id = 'soldier-crosshair';
            crosshairEl.className = 'hidden fixed inset-0 pointer-events-none flex items-center justify-center z-20';
            crosshairEl.innerHTML = `
                <div class="relative w-8 h-8 flex items-center justify-center opacity-85">
                    <div class="absolute w-1.5 h-1.5 rounded-full bg-amber-400/90 shadow-sm"></div>
                    <div class="absolute w-6 h-[1.5px] bg-amber-400/70"></div>
                    <div class="absolute h-6 w-[1.5px] bg-amber-400/70"></div>
                </div>
            `;
            document.body.appendChild(crosshairEl);
        } else {
            crosshairEl = document.getElementById('soldier-crosshair');
        }
    }

    // ------------------------------------------------------------------------
    // INFANTRY HUD & CONTROLS SYNCHRONIZATION
    // ------------------------------------------------------------------------
    function syncInfantryUI(isInfantry) {
        // 1. Force orbit camera in infantry mode; restore default FOV when leaving it
        if (isInfantry) {
            if (typeof window.setCameraMode === 'function') {
                window.setCameraMode('orbit');
            }
        } else if (window.perspCamera) {
            window.perspCamera.fov = 42;
            window.perspCamera.updateProjectionMatrix();
        }
        const tankSelector = document.getElementById('panel-tank-selector');
        if (tankSelector) tankSelector.classList.toggle('hidden', isInfantry);

        // 2. Mobile Jump & Grenade buttons
        const mobJump = document.getElementById('mob-btn-jump');
        if (mobJump) mobJump.classList.toggle('hidden', !isInfantry);

        const mobGrenade = document.getElementById('mob-btn-grenade');
        if (mobGrenade) mobGrenade.classList.toggle('hidden', !isInfantry);

        // 3. Mobile Tank-specific buttons (hide in infantry mode)
        ['mob-fire-coax', 'mob-fire-bow', 'mob-btn-smoke'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('hidden', isInfantry);
        });

        const hudArmor = document.getElementById('hud-armor');
        if (hudArmor) {
            if (isInfantry && playerSoldier) {
                hudArmor.textContent = `HP: ${playerSoldier.health}/100`;
                hudArmor.className = playerSoldier.health > 40 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold';
            }
        }

        // 4. Update Main Fire button label/icon & SMG heat gauge
        const isSMG = (playerSoldier && (playerSoldier.soldierType === 'smg' || playerSoldier.soldierType === 'submachine_gunner')) || (!playerSoldier && window.selectedSoldierType === 'smg');
        const isMortar = (playerSoldier && playerSoldier.soldierType === 'mortar') || (!playerSoldier && window.selectedSoldierType === 'mortar');
        const heatContainer = document.getElementById('hud-soldier-heat-container');
        if (heatContainer) {
            heatContainer.classList.toggle('hidden', !(isInfantry && isSMG));
            heatContainer.classList.toggle('flex', !!(isInfantry && isSMG));
        }
        const mobFireIcon = document.getElementById('mob-fire-icon');
        const mobFireCaliber = document.getElementById('mob-fire-caliber');
        if (mobFireIcon) mobFireIcon.textContent = isInfantry ? (isMortar ? '💣' : (isSMG ? '⚡' : '🎯')) : '💥';
        if (mobFireCaliber) {
            if (isInfantry) {
                mobFireCaliber.textContent = isMortar ? (playerSoldier && playerSoldier.mortarDeployed ? 'MORTAR' : 'DEPLOY') : (isSMG ? 'SMG MG' : 'RIFLE');
            } else {
                const type = (window.tankState && window.tankState.type) || 'tiger';
                const cal = (window.TANK_SPECS && window.TANK_SPECS[type]) ? window.TANK_SPECS[type].caliber : '8.8cm';
                mobFireCaliber.textContent = cal;
            }
        }
    }
    window.syncInfantryUI = syncInfantryUI;

    // ------------------------------------------------------------------------
    // ANTI-TANK GRENADE WEAPON SYSTEM
    // ------------------------------------------------------------------------
    const activeGrenades = [];
    window.activeGrenades = activeGrenades;

    function buildGrenadeMesh() {
        const group = new THREE.Group();
        
        // Mk II Pineapple ribbed cast-iron body
        const bodyGeo = new THREE.CylinderGeometry(0.045, 0.050, 0.105, 10, 4);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x3d4332,
            roughness: 0.75,
            metalness: 0.35
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);

        // Brass Fuze neck
        const fuzeGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.038, 8);
        const fuzeMat = new THREE.MeshStandardMaterial({
            color: 0x8a7f50,
            roughness: 0.45,
            metalness: 0.65
        });
        const fuze = new THREE.Mesh(fuzeGeo, fuzeMat);
        fuze.position.y = 0.065;
        group.add(fuze);

        // Safety lever / spoon
        const leverGeo = new THREE.BoxGeometry(0.012, 0.080, 0.005);
        const leverMat = new THREE.MeshStandardMaterial({
            color: 0x475569,
            roughness: 0.5,
            metalness: 0.5
        });
        const lever = new THREE.Mesh(leverGeo, leverMat);
        lever.position.set(0.024, 0.038, 0);
        lever.rotation.z = -0.15;
        group.add(lever);

        group.scale.setScalar(1.25);
        return group;
    }

    function throwPlayerGrenade() {
        if (playerMode !== 'soldier' || !playerSoldier || playerSoldier.isDead) return;
        const now = performance.now();
        if (playerSoldier.lastGrenadeTime && (now - playerSoldier.lastGrenadeTime < 400)) return;
        playerSoldier.lastGrenadeTime = now;

        const s = playerSoldier;
        const rig = s.rig;

        // Trigger simple right hand lift up animation
        s.grenadeAnimDuration = 0.40;
        s.grenadeAnimTimer = 0.40;

        const cam = window.activeCamera || window.perspCamera;
        if (!cam) return;

        const camDir = new THREE.Vector3();
        cam.getWorldDirection(camDir);

        // Spawn grenade slightly in front of soldier chest immediately
        const spawnPos = new THREE.Vector3(s.x, s.y + 1.35, s.z).add(camDir.clone().multiplyScalar(0.45));
        
        // 3D aim-directed trajectory: launched noticeably higher than cursor direction with stronger velocity
        const aimDist = 32.0;
        const aimTarget = cam.position.clone().add(camDir.clone().multiplyScalar(aimDist));
        const throwDir = aimTarget.clone().sub(spawnPos).normalize();
        // Pitch launch vector higher than cursor (+0.26 upward lob bias)
        throwDir.y += 0.26;
        throwDir.normalize();
        throwDir.multiplyScalar(25.0); // Strong throw velocity (25 m/s)

        const mesh = buildGrenadeMesh();
        mesh.position.copy(spawnPos);
        if (window.scene) window.scene.add(mesh);

        const grenade = {
            mesh,
            pos: spawnPos.clone(),
            vel: throwDir,
            rotVel: new THREE.Vector3((Math.random() - 0.5) * 12 + 6, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
            timer: 3.0, // 3.0s fuse for high-arc 25m/s throw
            exploded: false,
            isPlayerGrenade: true
        };

        activeGrenades.push(grenade);

        // Soft descending grenade whistle
        let soundHandle = null;
        if (window.soundFX && typeof window.soundFX.playBombWhistle === 'function') {
            soundHandle = window.soundFX.playBombWhistle(1.6, grenade.pos);
        }
        grenade.soundHandle = soundHandle;
    }
    window.throwPlayerGrenade = throwPlayerGrenade;

    function detonateGrenade(g) {
        if (g.exploded) return;
        g.exploded = true;

        if (g.soundHandle && typeof g.soundHandle.stop === 'function') {
            g.soundHandle.stop();
            g.soundHandle = null;
        }

        if (g.mesh && g.mesh.parent) {
            g.mesh.parent.remove(g.mesh);
        }

        const blastPos = g.pos;

        // 1. Heavy Detonation Effects (Flash, Shockwave, Fireball, Billowing Smoke)
        if (typeof window.triggerHeavyDetonation === 'function') {
            // ignorePlayer = true so player's own grenade won't kill/damage player soldier
            window.triggerHeavyDetonation(blastPos, true);
        } else if (window.soundFX && typeof window.soundFX.playExplosion === 'function') {
            window.soundFX.playExplosion(blastPos);
        }

        // Screen shake if near player
        if (typeof window.screenShake === 'function') {
            const pX = (playerMode === 'soldier' && playerSoldier) ? playerSoldier.x : (window.tankState ? window.tankState.x : 0);
            const pZ = (playerMode === 'soldier' && playerSoldier) ? playerSoldier.z : (window.tankState ? window.tankState.z : 0);
            const pDist = Math.hypot(blastPos.x - pX, blastPos.z - pZ);
            if (pDist < 35.0) {
                const intensity = Math.max(0.1, (1.0 - pDist / 35.0) * 0.45);
                window.screenShake(intensity);
            }
        }

        // 2. Anti-Tank Damage: Check all enemy tanks within 5.0m lethal blast radius
        const enemies = window.activeEnemyTanks || [];
        for (let i = 0; i < enemies.length; i++) {
            const et = enemies[i];
            if (!et || et.isDestroyed) continue;
            const d = Math.hypot(et.x - blastPos.x, et.z - blastPos.z);
            const dy = Math.abs((et.y + 1.2) - blastPos.y);
            if (d < 5.0 && dy < 3.5) {
                // Grenades chip tank armor without destroying it in one blast.
                const hitDir = new THREE.Vector3(et.x - blastPos.x, 0.4, et.z - blastPos.z).normalize();
                et.onHit(blastPos, hitDir, 0.5);
            }
        }

        // 3. Anti-Infantry Damage: Check enemy soldiers within 6.8m blast radius
        const soldiers = (window.activeSoldiers || []).filter(s => s.isEnemy && !s.isDead);
        for (let i = 0; i < soldiers.length; i++) {
            const es = soldiers[i];
            const dist = Math.hypot(es.x - blastPos.x, es.z - blastPos.z);
            if (dist < 6.8) {
                const dmg = Math.round(180 * (1.0 - dist / 6.8));
                es.takeDamage(dmg);
                if (typeof window.showKillFeedBanner === 'function' && es.isDead) {
                    const sTypeLabel = (es.soldierType === 'smg' || es.soldierType === 'submachine_gunner')
                        ? 'Infantry (SMG)'
                        : 'Infantry';
                    const reward = window.UNIT_KILL_REWARDS.soldier;
                    window.showKillFeedBanner(`TARGET DESTROYED: ${sTypeLabel} (+$${reward})`);
                }
            }
        }
    }

    function updateGrenades(dt) {
        if (!dt || dt <= 0) return;
        for (let i = activeGrenades.length - 1; i >= 0; i--) {
            const g = activeGrenades[i];
            if (g.exploded) {
                activeGrenades.splice(i, 1);
                continue;
            }

            g.timer -= dt;

            // Gravity (smoother trajectory for far throws)
            g.vel.y -= 12.0 * dt;
            const prevPos = g.pos.clone();
            g.pos.addScaledVector(g.vel, dt);

            // Mesh rotation
            g.mesh.rotation.x += g.rotVel.x * dt;
            g.mesh.rotation.y += g.rotVel.y * dt;
            g.mesh.rotation.z += g.rotVel.z * dt;
            g.mesh.position.copy(g.pos);
            if (g.soundHandle && typeof g.soundHandle.setPosition === 'function') {
                g.soundHandle.setPosition(g.pos);
            }

            let shouldExplode = false;

            // 1. Explode immediately upon touching ground / terrain
            if (typeof window.getTerrainHeight === 'function') {
                const gh = window.getTerrainHeight(g.pos.x, g.pos.z);
                if (g.pos.y <= gh + 0.12) {
                    g.pos.y = gh + 0.05;
                    shouldExplode = true;
                }
            }

            // 2. Explode immediately upon hitting enemy tanks, player tank, or tank wrecks
            if (!shouldExplode) {
                const enemies = window.activeEnemyTanks || [];
                for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
                    const et = enemies[eIdx];
                    if (!et) continue;
                    const d = Math.hypot(g.pos.x - et.x, g.pos.z - et.z);
                    if (d < 2.8 && Math.abs(g.pos.y - et.y) < 2.6) {
                        shouldExplode = true;
                        break;
                    }
                }
            }
            if (!shouldExplode && window.tankState && window.tankState.hasTank !== false && (!window.tankRoot || window.tankRoot.visible !== false)) {
                const ts = window.tankState;
                const d = Math.hypot(g.pos.x - ts.x, g.pos.z - ts.z);
                if (d < 2.8 && Math.abs(g.pos.y - (ts.y || 0)) < 2.6) {
                    shouldExplode = true;
                }
            }

            // 3. Explode upon hitting enemy soldiers
            if (!shouldExplode && window.activeSoldiers) {
                for (let sIdx = 0; sIdx < window.activeSoldiers.length; sIdx++) {
                    const es = window.activeSoldiers[sIdx];
                    if (es.isDead) continue;
                    const d = Math.hypot(g.pos.x - es.x, g.pos.z - es.z);
                    if (d < 1.1 && Math.abs(g.pos.y - es.y) < 1.9) {
                        shouldExplode = true;
                        break;
                    }
                }
            }

            // 4. Explode immediately upon hitting obstacles: Buildings, Walls, Rocks
            if (!shouldExplode) {
                const obstacles = window.worldObstacles || [];
                const bldgs = window.worldBuildings || [];
                const allObs = [...obstacles];
                for (let bIdx = 0; bIdx < bldgs.length; bIdx++) {
                    if (!allObs.includes(bldgs[bIdx])) allObs.push(bldgs[bIdx]);
                }

                const segX = g.pos.x - prevPos.x;
                const segY = g.pos.y - prevPos.y;
                const segZ = g.pos.z - prevPos.z;
                const segLen = Math.hypot(segX, segY, segZ);

                for (let ob = 0; ob < allObs.length; ob++) {
                    const obs = allObs[ob];
                    if (!obs || typeof obs.x !== 'number' || typeof obs.z !== 'number') continue;

                    const obsR = (obs.radius || 3.5);
                    const obsY = (typeof obs.y === 'number') ? obs.y : 0;
                    const obsH = (typeof obs.height === 'number') ? obs.height : 6.5;

                    const dCenterSq = (g.pos.x - obs.x) ** 2 + (g.pos.z - obs.z) ** 2;
                    if (dCenterSq > (obsR + segLen + 0.5) ** 2) continue;

                    let hitPoint = null;
                    if (obs.mesh && typeof THREE !== 'undefined' && typeof THREE.Raycaster === 'function') {
                        const segDir = (segLen > 0.0001)
                            ? new THREE.Vector3(segX / segLen, segY / segLen, segZ / segLen)
                            : new THREE.Vector3(0, 0, 1);
                        const raycaster = new THREE.Raycaster(prevPos, segDir, 0, segLen + 0.2);
                        const hits = raycaster.intersectObject(obs.mesh, true);
                        if (hits.length > 0 && hits[0].distance <= segLen + 0.2) {
                            hitPoint = hits[0].point.clone();
                        }
                    }

                    if (!hitPoint) {
                        const inY = g.pos.y >= obsY - 0.5 && g.pos.y <= obsY + obsH + 0.5;
                        if (typeof obstacleSegmentEntry === 'function') {
                            // Measured footprint: find where the flight segment enters the box.
                            const entry = obstacleSegmentEntry(obs, prevPos.x, prevPos.z, g.pos.x, g.pos.z, 0);
                            if (entry >= 0 && inY) {
                                hitPoint = new THREE.Vector3(
                                    prevPos.x + (g.pos.x - prevPos.x) * entry,
                                    g.pos.y,
                                    prevPos.z + (g.pos.z - prevPos.z) * entry
                                );
                            }
                        } else {
                            const dNow = Math.hypot(g.pos.x - obs.x, g.pos.z - obs.z);
                            if (dNow <= obsR && inY) {
                                hitPoint = g.pos.clone();
                                if (dNow > 0.001) {
                                    hitPoint.x = obs.x + ((g.pos.x - obs.x) / dNow) * obsR;
                                    hitPoint.z = obs.z + ((g.pos.z - obs.z) / dNow) * obsR;
                                }
                            }
                        }
                    }

                    if (hitPoint) {
                        g.pos.copy(hitPoint);
                        shouldExplode = true;
                        break;
                    }
                }
            }

            // 5. Explode immediately upon hitting trees
            if (!shouldExplode) {
                const trees = window.swayTrees || [];
                for (let tr = 0; tr < trees.length; tr++) {
                    const tree = trees[tr];
                    if (!tree || tree.isFallen || typeof tree.x !== 'number' || typeof tree.z !== 'number') continue;

                    const treeY = (typeof tree.y === 'number') ? tree.y : 0;
                    const treeH = ((typeof tree.trunkHeight === 'number') ? tree.trunkHeight : 5.0) * (tree.scale || 1.0) + 3.0;
                    if (g.pos.y < treeY - 0.3 || g.pos.y > treeY + treeH) continue;

                    const treeRad = (tree.radius || 1.2) * (tree.scale || 1.0);
                    const td = Math.hypot(g.pos.x - tree.x, g.pos.z - tree.z);
                    if (td <= treeRad) {
                        shouldExplode = true;
                        break;
                    }
                }
            }

            // 4. Safety fuse timeout (e.g. if thrown straight into deep void or sky)
            if (g.timer <= 0) {
                shouldExplode = true;
            }

            if (shouldExplode) {
                detonateGrenade(g);
                activeGrenades.splice(i, 1);
            }
        }
    }
    window.updateGrenades = updateGrenades;

    function resolveSoldierObstacleCollisions(s) {
        if (!s || typeof s.x !== 'number' || typeof s.z !== 'number') return;
        const soldierRadius = 0.40;

        // 1. Tactical Cover Obstacles: Buildings, Ruins, Kasbahs, Bunkers, Cottages, Barns, Walls, Rocks
        const obstacles = window.worldObstacles || [];
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            if (!obs || typeof obs.x !== 'number' || typeof obs.z !== 'number') continue;

            const minClearance = (obs.radius || 3.5) + soldierRadius;
            const dx = s.x - obs.x;
            if (Math.abs(dx) > minClearance) continue;
            const dz = s.z - obs.z;
            if (Math.abs(dz) > minClearance) continue;

            const obsY = (typeof obs.y === 'number') ? obs.y : 0;
            const obsH = (typeof obs.height === 'number') ? obs.height : 6.5;
            if (s.y < obsY - 1.0 || s.y > obsY + obsH + 0.5) continue;

            if (typeof obstaclePushOut === 'function') {
                const push = obstaclePushOut(obs, s.x, s.z, soldierRadius);
                if (push) { s.x += push.x; s.z += push.z; }
                continue;
            }

            const dist = Math.hypot(dx, dz);
            if (dist < minClearance && dist > 0.0001) {
                const overlap = minClearance - dist;
                s.x += (dx / dist) * overlap;
                s.z += (dz / dist) * overlap;
            }
        }

        // Also check window.worldBuildings
        const buildings = window.worldBuildings || [];
        for (let i = 0; i < buildings.length; i++) {
            const b = buildings[i];
            if (!b || typeof b.x !== 'number' || typeof b.z !== 'number') continue;

            if (typeof obstaclePushOut === 'function') {
                const push = obstaclePushOut(b, s.x, s.z, soldierRadius);
                if (push) { s.x += push.x; s.z += push.z; }
                continue;
            }

            const minClearance = (b.radius || 3.5) + soldierRadius;
            const dx = s.x - b.x;
            if (Math.abs(dx) > minClearance) continue;
            const dz = s.z - b.z;
            if (Math.abs(dz) > minClearance) continue;

            const dist = Math.hypot(dx, dz);
            if (dist < minClearance && dist > 0.0001) {
                const overlap = minClearance - dist;
                s.x += (dx / dist) * overlap;
                s.z += (dz / dist) * overlap;
            }
        }

        // 2. Forest Trees & Palms (swayTrees)
        const trees = window.swayTrees || [];
        for (let i = 0; i < trees.length; i++) {
            const tree = trees[i];
            if (!tree || tree.isFallen || typeof tree.x !== 'number' || typeof tree.z !== 'number') continue;

            const trunkRadius = Math.max(0.40, Math.min(1.0, (tree.radius || 1.2) * 0.45 * (tree.scale || 1.0)));
            const minTreeClearance = trunkRadius + soldierRadius;
            const dx = s.x - tree.x;
            if (Math.abs(dx) > minTreeClearance) continue;
            const dz = s.z - tree.z;
            if (Math.abs(dz) > minTreeClearance) continue;

            const treeY = (typeof tree.y === 'number') ? tree.y : 0;
            const treeH = ((typeof tree.trunkHeight === 'number') ? tree.trunkHeight : 5.0) * (tree.scale || 1.0) + 3.0;
            if (s.y < treeY - 0.5 || s.y > treeY + treeH) continue;

            const dist = Math.hypot(dx, dz);
            if (dist < minTreeClearance && dist > 0.0001) {
                const overlap = minTreeClearance - dist;
                s.x += (dx / dist) * overlap;
                s.z += (dz / dist) * overlap;
            }
        }

        // 3. Tank Wrecks and World Tanks
        const checkTanks = [];
        const enemyTanks = window.activeEnemyTanks || [];
        for (let i = 0; i < enemyTanks.length; i++) {
            const et = enemyTanks[i];
            if (et && typeof et.x === 'number' && typeof et.z === 'number') {
                checkTanks.push(et);
            }
        }
        if (window.tankState && typeof window.tankState.x === 'number' && typeof window.tankState.z === 'number') {
            if (window.tankState.isKnockedOut || window.playerMode === 'soldier') {
                if (window.tankState.hasTank !== false && (!window.tankRoot || window.tankRoot.visible !== false)) {
                    checkTanks.push(window.tankState);
                }
            }
        }

        for (let i = 0; i < checkTanks.length; i++) {
            const t = checkTanks[i];
            const tY = (typeof t.y === 'number') ? t.y : 0;
            const dims = (typeof window.getTankHitboxDims === 'function')
                ? window.getTankHitboxDims(t.tankType || t.spec || window.currentTankId || 'tiger')
                : { halfW: 1.80, halfH: 1.40, halfL: 3.30 };
            const tankH = (dims.halfH || 1.40) * 2;
            if (s.y < tY - 0.5 || s.y > tY + tankH + 0.8) continue;

            const tHeading = (typeof t.heading === 'number') ? t.heading : 0;
            const cosH = Math.cos(tHeading);
            const sinH = Math.sin(tHeading);

            const dx = s.x - t.x;
            const dz = s.z - t.z;

            // Longitudinal offset along tank heading
            const v = dx * sinH + dz * cosH;
            // Lateral offset along tank right flank
            const u = dx * cosH - dz * sinH;

            const halfW = dims.halfW || 1.80;
            const halfL = dims.halfL || 3.30;

            const clampedU = Math.max(-halfW, Math.min(halfW, u));
            const clampedV = Math.max(-halfL, Math.min(halfL, v));

            const diffU = u - clampedU;
            const diffV = v - clampedV;
            const distSq = diffU * diffU + diffV * diffV;

            if (distSq < soldierRadius * soldierRadius) {
                let pushU = 0;
                let pushV = 0;
                if (distSq > 1e-6) {
                    const dist = Math.sqrt(distSq);
                    const overlap = soldierRadius - dist;
                    pushU = (diffU / dist) * overlap;
                    pushV = (diffV / dist) * overlap;
                } else {
                    const penLeft = u - (-halfW);
                    const penRight = halfW - u;
                    const penBack = v - (-halfL);
                    const penFront = halfL - v;
                    const minPenW = Math.min(penLeft, penRight);
                    const minPenL = Math.min(penBack, penFront);

                    if (minPenW < minPenL) {
                        pushU = (penLeft < penRight ? -penLeft : penRight) + (penLeft < penRight ? -soldierRadius : soldierRadius);
                    } else {
                        pushV = (penBack < penFront ? -penBack : penFront) + (penBack < penFront ? -soldierRadius : soldierRadius);
                    }
                }

                const pushX = pushU * cosH + pushV * sinH;
                const pushZ = -pushU * sinH + pushV * cosH;
                s.x += pushX;
                s.z += pushZ;
            }
        }
    }
    window.resolveSoldierObstacleCollisions = resolveSoldierObstacleCollisions;

    // ------------------------------------------------------------------------
    // INFANTRY JUMP MECHANIC
    // ------------------------------------------------------------------------
    function soldierJump() {
        if (playerMode !== 'soldier' || !playerSoldier || playerSoldier.isDead) return;
        if (!playerSoldier.isGrounded) return;
        const now = performance.now();
        if (now - (playerSoldier.lastJumpTime || 0) < 350) return;
        playerSoldier.lastJumpTime = now;
        playerSoldier.vy = 6.8; // Vertical velocity (~0.9m jump clearance)
        playerSoldier.isGrounded = false;
    }
    window.soldierJump = soldierJump;

    // ------------------------------------------------------------------------
    // 1. DISMOUNT TANK (Become Infantry)
    // ------------------------------------------------------------------------
    function dismountTank(isBailout = false) {
        if (playerMode === 'soldier') return;
        if (!window.tankState) return;

        const isTankDestroyed = Boolean(isBailout || (window.tankState && window.tankState.isKnockedOut));

        // Bring tank to a standstill and clear all weapon firing flags
        window.tankState.speed = 0;
        window.tankState.turnRate = 0;
        if (typeof window.isFiringCoaxMG !== 'undefined') window.isFiringCoaxMG = false;
        if (typeof window.isFiringBowMG !== 'undefined') window.isFiringBowMG = false;
        if (window.keys) {
            window.keys['f'] = false;
            window.keys['g'] = false;
            window.keys[' '] = false;
        }

        const faction = getPlayerFaction();
        const sType = window.selectedSoldierType || 'smg';
        if (typeof window.buildSoldier !== 'function') {
            console.error('[PlayerSoldier] buildSoldier not available');
            return;
        }

        const rig = window.buildSoldier(faction, sType);
        if (sType === 'mortar') {
            rig.rifle.visible = false;
            createCarriedMortar(rig);
        }
        if (rig.rightArm && rig.rightArm.wrist) {
            const hg = buildGrenadeMesh();
            hg.scale.setScalar(0.9);
            hg.position.set(-0.02, -0.06, 0.05);
            hg.rotation.set(0.2, 0, 0.4);
            hg.visible = false;
            rig.rightArm.wrist.add(hg);
            rig.handGrenade = hg;
        }
        const tH = window.tankState.heading || 0;

        // Spawn player soldier 2.4 meters to the left of the tank hull
        const spawnX = window.tankState.x - Math.cos(tH) * 2.4;
        const spawnZ = window.tankState.z + Math.sin(tH) * 2.4;
        const spawnY = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(spawnX, spawnZ) : 0;

        rig.root.position.set(spawnX, spawnY, spawnZ);
        rig.root.rotation.y = tH;
        rig.root.userData.isPlayerSoldier = true;

        if (window.scene) {
            window.scene.add(rig.root);
        }

        playerSoldier = {
            x: spawnX,
            y: spawnY,
            z: spawnZ,
            vy: 0,
            isGrounded: true,
            lastJumpTime: 0,
            lastGrenadeTime: 0,
            grenadeAnimTimer: 0,
            grenadeAnimDuration: 0.65,
            grenadeThrown: false,
            lastFireTime: 0,
            heading: tH,
            speed: 0,
            health: 100,
            maxHealth: 100,
            healTimer: 0,
            isDead: false,
            invulnerableTimer: isTankDestroyed ? 1.0 : 0.0, // 1s invincibility when tank is destroyed
            animTime: 0,
            recoilKick: 0,
            fireCooldown: 0,
            faction,
            soldierType: sType,
            mortarDeployed: false,
            smgHeat: 0,
            rig,
            takeDamage: function(amount) { onPlayerSoldierDamage(amount); },
            die: function() { onPlayerSoldierDie(); }
        };

        playerMode = 'soldier';
        window.playerMode = 'soldier';
        window.playerSoldier = playerSoldier;

        // Setup over-the-shoulder third-person camera
        if (window.camOrbit) {
            window.camOrbit.distance = 3.2;
            window.camOrbit.phi = 1.40;
        }

        if (crosshairEl) crosshairEl.classList.remove('hidden');

        const hudDismountLabel = document.getElementById('hud-dismount-label');
        if (hudDismountLabel) hudDismountLabel.textContent = 'Enter [E]';

        syncInfantryUI(true);

        if (typeof window.showKillFeedBanner === 'function') {
            if (sType === 'smg' || sType === 'submachine_gunner') {
                window.showKillFeedBanner('⚡ SUBMACHINE GUNNER (WASD: Move, Space: Jump, LMB/F: Machine Gun, RMB/G: Grenade)');
            } else {
                window.showKillFeedBanner('🚶 INFANTRY (WASD: Move, Space: Jump, RMB/G: Grenade, LMB: Shoot)');
            }
        }
    }

    // ------------------------------------------------------------------------
    // 2. MOUNT TANK (Return to Tank Command)
    // ------------------------------------------------------------------------
    function mountTank() {
        if (playerMode !== 'soldier' || !playerSoldier || playerSoldier.isDead) return;
        packPlayerMortar();
        if ((window.tankRoot && !window.tankRoot.visible) || (window.tankState && (window.tankState.isKnockedOut || window.tankState.hasTank === false))) {
            if (typeof window.showKillFeedBanner === 'function') {
                window.showKillFeedBanner('⚠️ NO OPERATIONAL TANK! SNEAK & HIJACK AN ENEMY TANK [E]');
            }
            return;
        }

        if (playerSoldier.rig && playerSoldier.rig.root && window.scene) {
            window.scene.remove(playerSoldier.rig.root);
        }
        playerSoldier = null;
        window.playerSoldier = null;

        playerMode = 'tank';
        window.playerMode = 'tank';
        if (typeof window.isFiringCoaxMG !== 'undefined') window.isFiringCoaxMG = false;
        if (typeof window.isFiringBowMG !== 'undefined') window.isFiringBowMG = false;
        if (window.keys) {
            window.keys['f'] = false;
            window.keys['g'] = false;
            window.keys[' '] = false;
        }

        if (window.camOrbit) {
            window.camOrbit.distance = 10.5;
            window.camOrbit.phi = 0.35;
        }

        if (crosshairEl) crosshairEl.classList.add('hidden');

        const hudDismountLabel = document.getElementById('hud-dismount-label');
        if (hudDismountLabel) hudDismountLabel.textContent = 'Exit [E]';
        currentInteractAction = { type: 'dismount' };
        hideInteractPrompt();

        syncInfantryUI(false);
        if (typeof window.updateArmorHUD === 'function') window.updateArmorHUD();

        if (typeof window.showKillFeedBanner === 'function') {
            window.showKillFeedBanner('🚗 TANK HIJACKED! ENEMY CREW DRIVER EJECTED!');
        }
    }

    // ------------------------------------------------------------------------
    // 3. HIJACK ENEMY TANK (Sneak up & Capture Enemy Vehicle)
    // ------------------------------------------------------------------------
    function hijackTank(enemyTank) {
        if (playerMode !== 'soldier' || !playerSoldier || playerSoldier.isDead || !enemyTank || enemyTank.isDestroyed) return;

        const capturedType = enemyTank.tankType || 'sherman';
        const capturedX = enemyTank.x;
        const capturedY = enemyTank.y;
        const capturedZ = enemyTank.z;
        const capturedHeading = enemyTank.heading;

        // 1. Completely remove and clean up the hijacked enemy tank
        enemyTank.isDestroyed = true;
        if (enemyTank.targetCursor) {
            enemyTank.targetCursor.visible = false;
            if (enemyTank.targetCursor.parent) {
                enemyTank.targetCursor.parent.remove(enemyTank.targetCursor);
            }
        }
        if (enemyTank.enemyRoot) {
            enemyTank.enemyRoot.visible = false;
            if (enemyTank.enemyRoot.parent) {
                enemyTank.enemyRoot.parent.remove(enemyTank.enemyRoot);
            }
            if (window.scene) {
                window.scene.remove(enemyTank.enemyRoot);
            }
        }
        if (typeof enemyTank.dispose === 'function') {
            enemyTank.dispose();
        }
        if (window.activeEnemyTanks) {
            const idx = window.activeEnemyTanks.indexOf(enemyTank);
            if (idx !== -1) window.activeEnemyTanks.splice(idx, 1);
        }
        if (window.sessionDestroyedEnemyTanks && enemyTank.id) {
            window.sessionDestroyedEnemyTanks.add(enemyTank.id);
        }

        // 2. Sound effect & sparks
        if (window.soundFX && typeof window.soundFX.playArmorRicochet === 'function') {
            window.soundFX.playArmorRicochet();
        }

        // Eject the enemy driver soldier out onto the battlefield!
        const enemyFaction = enemyTank.faction || ((capturedType === 'tiger' || capturedType === 'kingtiger' || capturedType === 'tiger2' || capturedType === 'king_tiger') ? 'german' : ((capturedType === 't34' || capturedType === 'kv2') ? 'soviet' : 'us'));
        if (typeof window.spawnEjectedDriver === 'function') {
            window.spawnEjectedDriver(capturedX, capturedZ, capturedHeading, enemyFaction);
        }

        // 3. Switch player tank to captured vehicle type
        if (typeof window.switchTank === 'function') {
            window.switchTank(capturedType);
        }

        // 4. Position player tank at captured tank's exact coordinates & reactivate vehicle
        if (window.tankState) {
            window.tankState.hasTank = true;
            window.tankState.isKnockedOut = false;
            window.tankState.reloadTimer = 0;
            window.tankState.reloadStage = 0;
            window.tankState.mgHeat = 0;
            window.tankState.mgCooldown = 0;
            window.tankState.bowMgCooldown = 0;
            window.tankState.ammo = 40;
            window.tankState.x = capturedX;
            window.tankState.y = capturedY;
            window.tankState.z = capturedZ;
            window.tankState.heading = capturedHeading;
            window.tankState.speed = 0;
            window.tankState.turnRate = 0;
        }
        if (window.tankRoot) {
            window.tankRoot.visible = true;
            window.tankRoot.position.set(capturedX, capturedY, capturedZ);
            window.tankRoot.rotation.y = capturedHeading;
            if (typeof window.tankRoot.updateMatrixWorld === 'function') {
                window.tankRoot.updateMatrixWorld(true);
            }
        }

        if (typeof window.isFiringCoaxMG !== 'undefined') window.isFiringCoaxMG = false;
        if (typeof window.isFiringBowMG !== 'undefined') window.isFiringBowMG = false;
        if (typeof window.isFiringSoldierWeapon !== 'undefined') window.isFiringSoldierWeapon = false;
        if (window.keys) {
            window.keys['f'] = false;
            window.keys['g'] = false;
            window.keys[' '] = false;
        }

        // 5. Reset armor/health to full
        if (typeof window.resetPlayerHealth === 'function') {
            window.resetPlayerHealth();
        }
        if (typeof window.updateArmorHUD === 'function') {
            window.updateArmorHUD();
        }
        if (typeof window.updateTankHUD === 'function' && window.tankState && window.tankState.currentTankSpec) {
            window.updateTankHUD(window.tankState.currentTankSpec);
        }

        // 6. Remove player soldier rig
        if (playerSoldier && playerSoldier.rig && playerSoldier.rig.root && window.scene) {
            window.scene.remove(playerSoldier.rig.root);
        }
        playerSoldier = null;
        window.playerSoldier = null;

        playerMode = 'tank';
        window.playerMode = 'tank';

        if (window.camOrbit) {
            window.camOrbit.distance = 10.5;
            window.camOrbit.phi = 0.35;
        }

        if (crosshairEl) crosshairEl.classList.add('hidden');

        const hudDismountLabel = document.getElementById('hud-dismount-label');
        if (hudDismountLabel) hudDismountLabel.textContent = 'Exit [E]';
        currentInteractAction = { type: 'dismount' };
        hideInteractPrompt();

        const specName = (window.TANK_SPECS && window.TANK_SPECS[capturedType])
            ? window.TANK_SPECS[capturedType].name
            : capturedType.toUpperCase();

        syncInfantryUI(false);

        if (typeof window.showKillFeedBanner === 'function') {
            window.showKillFeedBanner(`💥 TANK HIJACKED: CAPTURED ${specName}!`);
        }
    }

    // ------------------------------------------------------------------------
    // 4. FIRE PLAYER WEAPONS (SMG & RIFLE)
    // ------------------------------------------------------------------------
    function firePlayerSMGRound() {
        if (playerMode !== 'soldier' || !playerSoldier || playerSoldier.isDead) return;
        if (playerSoldier.fireCooldown > 0) return;

        // Overheat check (same heat up mechanism problem as tank machine gun: blocks firing when heat >= 100)
        if ((playerSoldier.smgHeat || 0) >= 100) return;

        // Rapid fire rate matching tank machine gun (cooldown 0.075s ~13.3 rounds/sec)
        playerSoldier.fireCooldown = 0.075;
        playerSoldier.recoilKick = 0.14;
        playerSoldier.lastFireTime = (window.performance && window.performance.now) ? window.performance.now() * 0.001 : Date.now() * 0.001;

        // Heat accumulation: same mechanism as tank MG (+1.8 per shot), but heats up faster (+3.6 per shot)
        playerSoldier.smgHeat = Math.min(100, (playerSoldier.smgHeat || 0) + 3.6);
        if (window.tankState) {
            window.tankState.mgHeat = playerSoldier.smgHeat;
        }

        // Same gunshot audio as tank machine gun
        if (window.soundFX && typeof window.soundFX.playMG34Shot === 'function') {
            window.soundFX.playMG34Shot();
        }

        const rig = playerSoldier.rig;
        if (!rig || !rig.rifle) return;

        rig.rifle.updateWorldMatrix(true, false);
        const muzzleWorldPos = new THREE.Vector3();
        rig.rifle.localToWorld(muzzleWorldPos.copy(rig.rifle.userData.muzzleOffset || new THREE.Vector3(0, 0.02, 0.45)));

        const shootDir = new THREE.Vector3();
        const rQuat = new THREE.Quaternion();
        rig.rifle.getWorldQuaternion(rQuat);
        shootDir.set(0, 0, 1).applyQuaternion(rQuat).normalize();

        // Submachine gun accuracy: slightly worse accuracy than rifle (0.005) and tank MG (0.015)
        // High conical dispersion plus dynamic bloom as the gun heats up
        const heatBloom = ((playerSoldier.smgHeat || 0) / 100) * 0.045;
        const spreadH = 0.015 + heatBloom;
        const spreadV = 0.025 + heatBloom;
        shootDir.x += (Math.random() - 0.5) * spreadH;
        shootDir.y += (Math.random() - 0.5) * spreadV;
        shootDir.normalize();

        // 1. Muzzle Flash & Smoke VFX
        if (typeof window.spawnParticle === 'function') {
            const flashVel = shootDir.clone().multiplyScalar(4.5);
            window.spawnParticle(muzzleWorldPos, flashVel, 0xffe066, 0.12, 0.28, 0.05, true, 'fire');
            const smokeVel = new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25);
            window.spawnParticle(muzzleWorldPos, smokeVel, 0xcccccc, 0.08, 0.25, 0.35, false, 'smoke');
        }

        // 2. High-speed Tracer Round (Machine Gun round)
        if (typeof window.spawnTracerRound === 'function') {
            const tracerQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), shootDir);
            window.spawnTracerRound(muzzleWorldPos, shootDir, tracerQuat, false, {
                damage: 22,
                onSoldierKilled: (targetSol) => {
                    if (typeof window.showKillFeedBanner === 'function') {
                        const sTypeLabel = targetSol && (targetSol.soldierType === 'smg' || targetSol.soldierType === 'submachine_gunner')
                            ? 'Infantry (SMG)'
                            : 'Infantry';
                        const reward = (window.UNIT_KILL_REWARDS && window.UNIT_KILL_REWARDS.soldier) || 25;
                        window.showKillFeedBanner(`TARGET DESTROYED: ${sTypeLabel} (+$${reward})`);
                    }
                }
            });
        }
    }
    window.firePlayerSMGRound = firePlayerSMGRound;

    function firePlayerRifle() {
        if (playerMode !== 'soldier' || !playerSoldier || playerSoldier.isDead) return;
        if (playerSoldier.soldierType === 'mortar') {
            const s = playerSoldier;
            if (s.isMountedBicycle) {
                if (typeof window.showKillFeedBanner === 'function') window.showKillFeedBanner('DISMOUNT TO USE MORTAR', '#f59e0b');
                return;
            }
            if (!s.mortarDeployed) {
                deployPlayerMortar(s);
                return;
            }
            if (s.fireCooldown > 0) return;

            const emplacement = s.rig.deployedMortar;
            if (!emplacement) return;
            emplacement.updateMatrixWorld(true);
            const muzzlePos = new THREE.Vector3();
            emplacement.userData.muzzle.getWorldPosition(muzzlePos);
            const fireDir = emplacement.userData.barrelPivot.getWorldDirection(new THREE.Vector3()).normalize();

            s.fireCooldown = 2.2;
            s.lastFireTime = (window.performance && window.performance.now) ? window.performance.now() * 0.001 : Date.now() * 0.001;
            if (window.soundFX && typeof window.soundFX.playMainCannon === 'function') {
                window.soundFX.playMainCannon(window.currentTankId || 'tiger');
            }
            if (typeof window.spawnPlayerMortarShell === 'function') window.spawnPlayerMortarShell(muzzlePos, fireDir, s);
            if (typeof window.notifyPlayerFired === 'function') window.notifyPlayerFired();
            return;
        }
        if (playerSoldier.soldierType === 'smg' || playerSoldier.soldierType === 'submachine_gunner') {
            firePlayerSMGRound();
            return;
        }
        if (playerSoldier.fireCooldown > 0) return;

        playerSoldier.fireCooldown = 0.65;
        playerSoldier.recoilKick = 0.35;
        playerSoldier.lastFireTime = (window.performance && window.performance.now) ? window.performance.now() * 0.001 : Date.now() * 0.001;

        // Gunshot audio
        if (window.soundFX && typeof window.soundFX.playRifleShot === 'function') {
            window.soundFX.playRifleShot(0);
        }

        const rig = playerSoldier.rig;
        if (!rig || !rig.rifle) return;

        rig.rifle.updateWorldMatrix(true, false);
        const muzzleWorldPos = new THREE.Vector3();
        rig.rifle.localToWorld(muzzleWorldPos.copy(rig.rifle.userData.muzzleOffset || new THREE.Vector3(0, 0.02, 0.6)));

        const shootDir = new THREE.Vector3();
        const rQuat = new THREE.Quaternion();
        rig.rifle.getWorldQuaternion(rQuat);
        shootDir.set(0, 0, 1).applyQuaternion(rQuat).normalize();

        // 1. Muzzle Flash & Smoke VFX
        if (typeof window.spawnParticle === 'function') {
            const flashVel = shootDir.clone().multiplyScalar(4.5);
            window.spawnParticle(muzzleWorldPos, flashVel, 0xffe066, 0.14, 0.32, 0.06, true, 'fire');
            const smokeVel = new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
            window.spawnParticle(muzzleWorldPos, smokeVel, 0xcccccc, 0.12, 0.38, 0.45, false, 'smoke');
        }

        // 2. High-speed Tracer Round
        if (typeof window.spawnTracerRound === 'function') {
            const tracerQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), shootDir);
            window.spawnTracerRound(muzzleWorldPos, shootDir, tracerQuat, false, {
                damage: 52,
                onSoldierKilled: (targetSol) => {
                    if (typeof window.showKillFeedBanner === 'function') {
                        const sTypeLabel = targetSol && (targetSol.soldierType === 'smg' || targetSol.soldierType === 'submachine_gunner')
                            ? 'Infantry (SMG)'
                            : 'Infantry';
                        const reward = (window.UNIT_KILL_REWARDS && window.UNIT_KILL_REWARDS.soldier) || 25;
                        window.showKillFeedBanner(`TARGET DESTROYED: ${sTypeLabel} (+$${reward})`);
                    }
                }
            });
        }
    }

    // ------------------------------------------------------------------------
    // 5. UPDATE PLAYER SOLDIER (Simulation Frame)
    // ------------------------------------------------------------------------
    function updatePlayerSoldier(dt, currentActiveCam, keys) {
        const currentMode = (typeof window !== 'undefined' && window.playerMode) ? window.playerMode : playerMode;
        const s = (typeof window !== 'undefined' && window.playerSoldier) ? window.playerSoldier : playerSoldier;
        if (currentMode !== 'soldier' || !s) return;

        if (s.isDead) {
            updateSoldierDeathAnimation(s, dt, currentActiveCam);
            return;
        }

        s.animTime += dt;
        s.fireCooldown = Math.max(0, s.fireCooldown - dt);
        s.recoilKick = Math.max(0, s.recoilKick - dt * 5.0);

        // Continuous automatic firing & heat management for Submachine Gunner (same heat up mechanism as tank MG, just faster)
        const isSMG = (s.soldierType === 'smg' || s.soldierType === 'submachine_gunner');
        if (isSMG && !s.isDead) {
            const isFiring = window.isFiringSoldierWeapon || window.isFiringCoaxMG || (keys && (keys['f'] || keys['F']));
            if (isFiring && s.fireCooldown <= 0) {
                firePlayerSMGRound();
            }
            if (!isFiring) {
                // Cools down when not firing (same heat up mechanism problem as tank machine gun)
                s.smgHeat = Math.max(0, (s.smgHeat || 0) - 25 * dt);
                if (window.tankState) {
                    window.tankState.mgHeat = s.smgHeat;
                }
            }

            // Sync HUD telemetry for SMG heat
            const heatEl = document.getElementById('hud-soldier-heat');
            if (heatEl) {
                const heatVal = Math.round(s.smgHeat || 0);
                if (heatVal >= 100) {
                    heatEl.textContent = 'OVERHEAT!';
                    heatEl.className = 'text-red-500 font-extrabold animate-pulse';
                } else if (heatVal > 60) {
                    heatEl.textContent = `${heatVal}%`;
                    heatEl.className = 'text-amber-400 font-bold';
                } else {
                    heatEl.textContent = `${heatVal}%`;
                    heatEl.className = 'text-emerald-400 font-bold';
                }
            }
            const mobFireCaliber = document.getElementById('mob-fire-caliber');
            if (mobFireCaliber) {
                if ((s.smgHeat || 0) >= 100) {
                    mobFireCaliber.textContent = 'HOT!';
                    mobFireCaliber.className = 'text-[10px] mono font-extrabold text-red-400 uppercase tracking-wider animate-pulse';
                } else {
                    mobFireCaliber.textContent = 'SMG MG';
                    mobFireCaliber.className = 'text-[10px] mono font-extrabold text-white uppercase tracking-wider';
                }
            }
        }

        if (s.invulnerableTimer > 0) {
            s.invulnerableTimer = Math.max(0, s.invulnerableTimer - dt);
            const hudArmor = document.getElementById('hud-armor');
            if (hudArmor) {
                if (s.invulnerableTimer > 0) {
                    const sec = s.invulnerableTimer.toFixed(1);
                    hudArmor.textContent = `HP: ${s.health}/100 🛡️ [${sec}s]`;
                    hudArmor.className = 'text-amber-300 font-bold';
                } else {
                    hudArmor.textContent = `HP: ${s.health}/100`;
                    hudArmor.className = 'text-emerald-400 font-bold';
                }
            }
        }

        // 1. WASD Input relative to Camera Look Direction
        const stickForward = window.touchDrive ? (window.touchDrive.forward || 0) : 0;
        const stickStrafe  = window.touchDrive ? ((window.touchDrive.strafe !== undefined) ? window.touchDrive.strafe : -(window.touchDrive.turn || 0)) : 0;

        const k = window.keys || (typeof keys !== 'undefined' ? keys : {});
        const fwdInput = ((k['w'] ? 1 : 0) - (k['s'] ? 1 : 0)) + stickForward;
        const strInput = ((k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)) + stickStrafe;
        adjustMortarElevation(s, fwdInput, dt);

        const stickMag = window.touchDrive ? (window.touchDrive.magnitude || Math.hypot(stickForward, stickStrafe)) : 0;
        const isStickRunning = (window.touchDrive && window.touchDrive.isMax) || (stickMag >= 0.85);

        // PC keyboard: Default is max run speed (5.2 m/s) with WASD, Shift makes it walk speed (2.8 m/s)
        const isKeyboardMoving = !!(k['w'] || k['s'] || k['a'] || k['d']);
        let moveSpeed = 5.2; // Max running speed by default on keyboard
        if (k['shift']) {
            moveSpeed = 2.8; // Shift key makes it walk speed
        } else if (stickMag > 0 && !isStickRunning && !isKeyboardMoving) {
            moveSpeed = 2.8; // Gentle virtual stick tilt walks
        }

        const isSprinting = moveSpeed > 3.5;

        // Mounted Dispatch Bicycle Locomotion, Pedaling Kinematics & Combat
        if (s.isMountedBicycle && s.currentBicycle && typeof window.updateBicycleRider === 'function') {
            window.updateBicycleRider(s, s.currentBicycle, dt, currentActiveCam, fwdInput, strInput, isSprinting);

            // Third-person camera follow for mounted bicycle (same framing as on foot)
            if (currentActiveCam && window.camOrbit) {
                const anchor = new THREE.Vector3(s.x, s.y + 1.45, s.z);
                const phi = (window.camOrbit.phi !== undefined) ? window.camOrbit.phi : 1.40;
                const theta = window.camOrbit.theta || 0;
                const dist = window.camOrbit.distance || 3.2;

                const lookDir = new THREE.Vector3(
                    -Math.sin(phi) * Math.sin(theta),
                    -Math.cos(phi),
                    -Math.sin(phi) * Math.cos(theta)
                ).normalize();
                const rightOffset = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta)).multiplyScalar(0.45);

                const groundAtSoldier = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(s.x, s.z) : 0;
                const minCamY = groundAtSoldier + 0.35;
                let effectiveDist = dist;
                if (lookDir.y > 0.05) {
                    const maxDrop = (anchor.y + 0.35) - minCamY;
                    if (maxDrop > 0.4) effectiveDist = Math.max(1.1, Math.min(dist, maxDrop / lookDir.y));
                }

                const camPos = anchor.clone().addScaledVector(lookDir, -effectiveDist).add(rightOffset).add(new THREE.Vector3(0, 0.35, 0));
                const terrainUnderCam = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(camPos.x, camPos.z) + 0.30 : 0.8;
                if (camPos.y < terrainUnderCam) camPos.y = terrainUnderCam;

                const lookTarget = anchor.clone().add(rightOffset.clone().multiplyScalar(0.4)).addScaledVector(lookDir, 50.0);
                currentActiveCam.position.copy(camPos);
                currentActiveCam.lookAt(lookTarget);
                currentActiveCam.updateMatrixWorld();
            }

            s.healTimer = 0;

            updateInteractProximity();
            return;
        }

        const camTheta = (window.camOrbit && window.camOrbit.theta !== undefined) ? window.camOrbit.theta : s.heading;
        // Camera horizontal forward and right vectors
        const camFwdX = -Math.sin(camTheta);
        const camFwdZ = -Math.cos(camTheta);
        const camRightX = -camFwdZ;
        const camRightZ = camFwdX;

        let moveX = camFwdX * fwdInput + camRightX * strInput;
        let moveZ = camFwdZ * fwdInput + camRightZ * strInput;
        if (s.mortarDeployed) {
            moveX = 0;
            moveZ = 0;
        }
        const moveLen = Math.hypot(moveX, moveZ);

        if (moveLen > 0.05) {
            moveX = (moveX / moveLen) * moveSpeed;
            moveZ = (moveZ / moveLen) * moveSpeed;

            s.x += moveX * dt;
            s.z += moveZ * dt;

            // Blocked by obstacles (buildings, walls, rocks, trees)
            resolveSoldierObstacleCollisions(s);

            if (typeof window.getTerrainHeight === 'function') {
                const gh = window.getTerrainHeight(s.x, s.z);
                if (gh < -2.2) { // Edge of sea
                    s.x -= moveX * dt;
                    s.z -= moveZ * dt;
                }
            }
            s.speed = THREE.MathUtils.lerp(s.speed, moveSpeed, dt * 8.0);
            s.heading = Math.atan2(camFwdX, camFwdZ);
        } else {
            // Also ensure collision resolution even when standing still / idle against moving into obstacle
            resolveSoldierObstacleCollisions(s);
            s.speed = THREE.MathUtils.lerp(s.speed, 0, dt * 10.0);
            s.heading = Math.atan2(camFwdX, camFwdZ);
        }

        // Natural Health Regeneration: heal 1 HP every 1 second when no enemy has detected the player AND player stands still
        const isDetected = (typeof window.isPlayerDetected === 'function') ? window.isPlayerDetected() : isPlayerDetected();
        const isStandingStill = (moveLen <= 0.05) && (Math.abs(s.speed || 0) < 0.15);
        if (!isDetected && isStandingStill && s.health < (s.maxHealth || 100)) {
            s.healTimer = (s.healTimer || 0) + dt;
            if (s.healTimer >= 1.0) {
                const healAmount = Math.floor(s.healTimer);
                s.healTimer -= healAmount;
                s.health = Math.min(s.maxHealth || 100, s.health + healAmount);

                const hudArmor = document.getElementById('hud-armor');
                if (hudArmor && (!s.invulnerableTimer || s.invulnerableTimer <= 0)) {
                    hudArmor.textContent = `HP: ${s.health}/100`;
                    hudArmor.className = s.health > 40 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold';
                }
            }
        } else {
            s.healTimer = 0;
        }

        // Vertical physics (gravity and jump clearance)
        s.vy = (s.vy !== undefined ? s.vy : 0) - 18.0 * dt;
        s.y += s.vy * dt;
        if (typeof window.getTerrainHeight === 'function') {
            const gh = window.getTerrainHeight(s.x, s.z);
            if (s.y <= gh) {
                s.y = gh;
                s.vy = 0;
                s.isGrounded = true;
            } else {
                s.isGrounded = false;
            }
        }

        // Update root position and rotation
        const rig = s.rig;
        rig.root.position.set(s.x, s.y, s.z);
        rig.root.rotation.y = s.heading;

        // 2. Procedural Bone Animation (Airborne jump / Leg sprint cycle / ADS Rifle Aim)
        const isMoving = s.speed > 0.15;
        if (!s.isGrounded) {
            // Airborne jump tuck
            rig.rightLeg.hipJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.hipJoint.rotation.x, -0.42, dt * 12.0);
            rig.leftLeg.hipJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.hipJoint.rotation.x, -0.32, dt * 12.0);
            rig.rightLeg.kneeJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.kneeJoint.rotation.x, 0.55, dt * 12.0);
            rig.leftLeg.kneeJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.kneeJoint.rotation.x, 0.40, dt * 12.0);
            rig.hips.position.y = THREE.MathUtils.lerp(rig.hips.position.y, 0.98, dt * 12.0);
        } else if (s.mortarDeployed) {
            rig.rightLeg.hipJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.hipJoint.rotation.x, -1.0, dt * 8.0);
            rig.leftLeg.hipJoint.rotation.x = THREE.MathUtils.lerp(rig.leftLeg.hipJoint.rotation.x, -0.12, dt * 8.0);
            rig.rightLeg.kneeJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.kneeJoint.rotation.x, 1.82, dt * 8.0);
            rig.leftLeg.kneeJoint.rotation.x = THREE.MathUtils.lerp(rig.leftLeg.kneeJoint.rotation.x, 1.42, dt * 8.0);
            rig.hips.position.y = THREE.MathUtils.lerp(rig.hips.position.y, 0.78, dt * 8.0);
        } else if (isMoving) {
            const runMult = isSprinting ? 6.2 : 4.4;
            const walk = s.animTime * runMult;
            const strideAmp = isSprinting ? 0.65 : 0.45;
            const stride = Math.sin(walk);

            rig.rightLeg.hipJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.hipJoint.rotation.x, stride * strideAmp, 0.35);
            rig.leftLeg.hipJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.hipJoint.rotation.x, -stride * strideAmp, 0.35);
            rig.rightLeg.kneeJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.kneeJoint.rotation.x, Math.max(0.1, -Math.cos(walk) * strideAmp * 1.3), 0.35);
            rig.leftLeg.kneeJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.kneeJoint.rotation.x, Math.max(0.1, Math.cos(walk) * strideAmp * 1.3), 0.35);
            rig.hips.position.y = 0.95 + Math.abs(Math.cos(walk)) * 0.04;
        } else {
            rig.rightLeg.hipJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.hipJoint.rotation.x, -0.05, 0.15);
            rig.leftLeg.hipJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.hipJoint.rotation.x, 0.06, 0.15);
            rig.rightLeg.kneeJoint.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.kneeJoint.rotation.x, 0.08, 0.15);
            rig.leftLeg.kneeJoint.rotation.x  = THREE.MathUtils.lerp(rig.leftLeg.kneeJoint.rotation.x, 0.08, 0.15);
            rig.hips.position.y = 0.95;
        }

        // Aim rifle directly along camera look vector with authentic 2-handed grip (with simple right hand lift up on grenade throw)
        if (currentActiveCam && rig.rifle && rig.rightArm && rig.rightArm.wrist && rig.leftArm && rig.leftArm.shoulder) {
            // Natural bladed firing stance
            rig.torso.rotation.y = -0.40;
            rig.head.rotation.y = 0.40;

            // Pitch upper body & head according to camera look direction
            const camLookDir = new THREE.Vector3();
            currentActiveCam.getWorldDirection(camLookDir);
            const camPitch = Math.asin(THREE.MathUtils.clamp(camLookDir.y, -0.99, 0.99));
            rig.torso.rotation.x = -camPitch * 0.45;
            rig.head.rotation.x = -camPitch * 0.35;

            const isThrowingGrenade = (s.grenadeAnimTimer > 0);

            // Right arm firmly shoulders the rifle (lifts up simply when throwing grenade)
            let rShX = -0.65;
            let rShY = 0.12;
            let rShZ = 0.60;
            let rElX = -2.20;

            if (isThrowingGrenade) {
                s.grenadeAnimTimer = Math.max(0, s.grenadeAnimTimer - dt);
                const p = 1.0 - (s.grenadeAnimTimer / (s.grenadeAnimDuration || 0.40));
                const lift = Math.sin(p * Math.PI); // smooth 0 -> 1 -> 0 arch
                rShX -= lift * 1.55; // lifts right arm and hand up
                rShZ -= lift * 0.45; // lifts outward and up
                rElX += lift * 0.50; // adjusts elbow

                // Keep rifle held firmly by left hand on torso so left arm doesn't move with right arm
                if (rig.rifle.parent === rig.rightArm.wrist) {
                    rig.torso.attach(rig.rifle);
                }
            } else {
                if (rig.rifle.parent !== rig.rightArm.wrist) {
                    rig.rightArm.wrist.attach(rig.rifle);
                }
            }

            if (isThrowingGrenade) {
                rig.rightArm.shoulder.rotation.set(rShX, rShY, rShZ);
                rig.rightArm.elbow.rotation.set(rElX, 0, 0);
                rig.rightArm.wrist.rotation.set(0, 0, 0);
                rig.root.updateMatrixWorld(true);
            } else {
                const camTheta = (window.camOrbit && window.camOrbit.theta !== undefined) ? window.camOrbit.theta : s.heading;
                if (s.mortarDeployed) {
                    rig.torso.rotation.x = 0.18;
                    rig.rightArm.shoulder.rotation.set(-0.25, 0.08, 0.4);
                    rig.rightArm.elbow.rotation.set(-1.0, 0, 0);
                    rig.leftArm.shoulder.rotation.set(-0.35, -0.08, -0.35);
                    rig.leftArm.elbow.rotation.set(-0.75, 0, 0);
                } else {
                    window.poseSoldierWeapon(rig, camLookDir, camTheta);
                }
            }
        }

        if (s.mortarDeployed && rig.deployedMortar) {
            const heading = s.heading || 0;
            const mortarPosition = getMortarPosition(s);
            const mortarX = mortarPosition.x;
            const mortarZ = mortarPosition.z;
            const groundY = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(mortarX, mortarZ) : s.y;
            rig.deployedMortar.position.set(mortarX, groundY, mortarZ);
            rig.deployedMortar.rotation.y = heading;
            applyMortarElevationPose(rig.deployedMortar, s.mortarElevation);
        }

        // 3. Update Camera Position to follow player soldier
        if (currentActiveCam && window.camOrbit) {
            const anchorHeight = s.mortarDeployed ? 0.70 : 1.45;
            const anchor = new THREE.Vector3(s.x, s.y + anchorHeight, s.z);
            const phi = (window.camOrbit.phi !== undefined) ? window.camOrbit.phi : 1.40;
            const theta = window.camOrbit.theta || 0;
            const dist = window.camOrbit.distance || 3.2;

            const lookDir = new THREE.Vector3(
                -Math.sin(phi) * Math.sin(theta),
                -Math.cos(phi),
                -Math.sin(phi) * Math.cos(theta)
            ).normalize();

            // Over-the-shoulder right offset: stable at all phi angles
            const rightOffset = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta)).multiplyScalar(0.45);

            // Dynamically adjust distance if camera descends close to ground when looking high up
            const groundAtSoldier = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(s.x, s.z) : 0;
            const minCamY = groundAtSoldier + 0.35;

            let effectiveDist = dist;
            if (lookDir.y > 0.05) {
                const maxDrop = (anchor.y + 0.35) - minCamY;
                if (maxDrop > 0.4) {
                    effectiveDist = Math.max(1.1, Math.min(dist, maxDrop / lookDir.y));
                }
            }

            const camPos = anchor.clone().addScaledVector(lookDir, -effectiveDist).add(rightOffset).add(new THREE.Vector3(0, 0.35, 0));

            // Terrain safety clearance
            const terrainUnderCam = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(camPos.x, camPos.z) + 0.30 : 0.8;
            if (camPos.y < terrainUnderCam) camPos.y = terrainUnderCam;

            const lookTarget = anchor.clone().add(rightOffset.clone().multiplyScalar(0.4)).addScaledVector(lookDir, 50.0);
            currentActiveCam.position.copy(camPos);
            currentActiveCam.lookAt(lookTarget);
            currentActiveCam.updateMatrixWorld();
        }

        // 4. Proximity Check for Tank Mount or Hijack
        updateInteractProximity();
    }

    // ------------------------------------------------------------------------
    // 6. PROXIMITY & INTERACTION MANAGER
    // ------------------------------------------------------------------------
    function updateInteractProximity() {
        const now = performance.now();
        // Continuous per-frame check
        lastInteractCheck = now;

        initPlayerSoldierUI();

        if (playerMode === 'soldier' && playerSoldier) {
            // Bicycle has no dismount button; E still steps off
            if (playerSoldier.isMountedBicycle) {
                currentInteractAction = { type: 'dismount_bicycle' };
                hideInteractPrompt();
                return;
            }

            const pX = playerSoldier.x;
            const pZ = playerSoldier.z;

            // Check distance to active enemy tanks
            let closestEnemy = null;
            let closestEnemyDist = 4.8; // Hijack radius
            if (window.activeEnemyTanks) {
                for (let i = 0; i < window.activeEnemyTanks.length; i++) {
                    const et = window.activeEnemyTanks[i];
                    if (et.isDestroyed) continue;
                    const d = Math.hypot(pX - et.x, pZ - et.z);
                    if (d < closestEnemyDist) {
                        closestEnemyDist = d;
                        closestEnemy = et;
                    }
                }
            }

            // Check distance to own tank
            const hasOperationalTank = Boolean(
                window.tankState &&
                window.tankState.hasTank !== false &&
                window.tankRoot &&
                window.tankRoot.visible &&
                !window.tankState.isKnockedOut
            );

            if (playerSoldier.soldierType === 'mortar' && playerSoldier.mortarDeployed) {
                currentInteractAction = { type: 'pack_mortar' };
                showInteractPrompt('PACK MORTAR', '📦', false);
                return;
            }

            // Prioritize hijacking enemy tank when in range!
            if (closestEnemy && closestEnemyDist < 4.8) {
                currentInteractAction = { type: 'hijack', enemyTank: closestEnemy };
                const tName = closestEnemy.tankType ? closestEnemy.tankType.toUpperCase() : 'TANK';
                showInteractPrompt(`⚡ HIJACK ${tName}`, '⚡', true);
                return;
            }

            if (hasOperationalTank) {
                const dOwn = Math.hypot(pX - window.tankState.x, pZ - window.tankState.z);
                if (dOwn < 4.2) {
                    currentInteractAction = { type: 'mount' };
                    showInteractPrompt('🚗 MOUNT TANK', '🚗', false);
                    return;
                }
            }

            // Check nearby military dispatch bicycle
            if (typeof window.getNearbyBicycle === 'function') {
                const nearbyBike = window.getNearbyBicycle(pX, pZ, 3.2);
                if (nearbyBike) {
                    currentInteractAction = { type: 'mount_bicycle', bicycle: nearbyBike };
                    showInteractPrompt('🚲 MOUNT BICYCLE', '🚲', false);
                    return;
                }
            }

            // Neither in range
            currentInteractAction = null;
            hideInteractPrompt();
        } else {
            // Player is in tank
            if (window.tankState && window.tankState.hasTank !== false) {
                currentInteractAction = { type: 'dismount' };
                // In tank mode, show dismount button when stationary/slow
                if (Math.abs(window.tankState.speed || 0) < 3.5) {
                    showInteractPrompt('DISMOUNT TANK', '🚶', false);
                } else {
                    hideInteractPrompt();
                }
            } else {
                currentInteractAction = null;
                hideInteractPrompt();
            }
        }
    }

    function showInteractPrompt(label, icon, isHijack = false) {
        if (!interactPromptEl) return;
        const iconEl = document.getElementById('interact-icon');
        const labelEl = document.getElementById('interact-label');
        const btn = document.getElementById('btn-interact-action');

        if (iconEl) iconEl.textContent = icon;
        if (labelEl) labelEl.textContent = label;

        if (btn) {
            if (isHijack) {
                btn.className = 'px-6 py-2.5 rounded-2xl bg-red-950/85 hover:bg-red-900 active:scale-95 text-amber-300 hover:text-white font-extrabold text-xs tracking-wider border-2 border-red-500 hover:border-amber-300 backdrop-blur-md shadow-2xl transition-all flex items-center gap-2 cursor-pointer animate-pulse';
            } else {
                btn.className = 'px-5 py-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 active:scale-95 text-amber-300 hover:text-white font-extrabold text-xs tracking-wider border-2 border-amber-400/80 hover:border-amber-300 backdrop-blur-md shadow-2xl transition-all flex items-center gap-2 cursor-pointer';
            }
        }

        interactPromptEl.classList.remove('hidden');

        // Also update mobile button if exists
        const mobInteract = document.getElementById('mob-btn-interact');
        if (mobInteract) {
            const actionLabel = currentInteractAction && currentInteractAction.type === 'pack_mortar' ? 'PACK' : (playerMode === 'soldier' ? 'MOUNT' : 'EXIT');
            mobInteract.innerHTML = `<span>${icon}</span><span class="text-[9px] font-bold">${isHijack ? 'HIJACK' : actionLabel}</span>`;
        }
    }

    function hideInteractPrompt() {
        if (interactPromptEl) interactPromptEl.classList.add('hidden');
    }

    // Triggered when pressing 'E' or tapping interact button
    function triggerInteract() {
        if (playerSoldier && playerSoldier.isDead) return;
        if (!currentInteractAction) {
            // Fallback default based on playerMode
            if (playerMode === 'tank') dismountTank();
            return;
        }

        if (currentInteractAction.type === 'dismount') {
            dismountTank();
        } else if (currentInteractAction.type === 'mount') {
            mountTank();
        } else if (currentInteractAction.type === 'hijack' && currentInteractAction.enemyTank) {
            hijackTank(currentInteractAction.enemyTank);
        } else if (currentInteractAction.type === 'mount_bicycle' && currentInteractAction.bicycle) {
            if (typeof window.mountBicycle === 'function') {
                window.mountBicycle(playerSoldier, currentInteractAction.bicycle);
            }
        } else if (currentInteractAction.type === 'dismount_bicycle') {
            if (typeof window.dismountBicycle === 'function') {
                window.dismountBicycle(playerSoldier);
            }
        } else if (currentInteractAction.type === 'pack_mortar') {
            packPlayerMortar();
        }
    }

    // ------------------------------------------------------------------------
    // DETECTION CHECK & HEALTH REGENERATION
    // ------------------------------------------------------------------------
    function isPlayerDetected() {
        const s = playerSoldier || window.playerSoldier;
        if (!s || s.isDead) return false;

        // 1. Check active enemy tanks
        const enemyTanks = window.activeEnemyTanks || [];
        for (let i = 0; i < enemyTanks.length; i++) {
            const et = enemyTanks[i];
            if (!et || et.isDestroyed) continue;
            // Engaging state, alert or active detection timer indicates tank detected player
            if (et.state === 'ENGAGING' || (et.detectionTimer && et.detectionTimer >= 0.8) || et.wasHitAlert) {
                return true;
            }
        }

        // 2. Check active enemy soldiers
        const soldiers = window.activeSoldiers || [];
        for (let i = 0; i < soldiers.length; i++) {
            const es = soldiers[i];
            if (!es || !es.isEnemy || es.isDead) continue;
            // Target set or alerted/provoked indicates soldier detected player
            if ((es.currentTarget && (!es.currentTarget.ref || es.currentTarget.ref === s || es.currentTarget.ref === window.playerSoldier)) ||
                (es.alertOnHitTimer && es.alertOnHitTimer > 0) ||
                (es.provokedTimer && es.provokedTimer > 0)) {
                return true;
            }
        }

        return false;
    }
    window.isPlayerDetected = isPlayerDetected;

    function healPlayerSoldier(amount = 1) {
        const s = playerSoldier || window.playerSoldier;
        if (!s || s.isDead) return 0;
        const maxH = s.maxHealth || 100;
        if (s.health >= maxH) return 0;
        const prev = s.health;
        s.health = Math.min(maxH, s.health + amount);
        const hudArmor = document.getElementById('hud-armor');
        if (hudArmor && (!s.invulnerableTimer || s.invulnerableTimer <= 0)) {
            hudArmor.textContent = `HP: ${s.health}/100`;
            hudArmor.className = s.health > 40 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold';
        }
        return s.health - prev;
    }
    window.healPlayerSoldier = healPlayerSoldier;

    function isPlayerStandingStill() {
        const s = (typeof window !== 'undefined' && window.playerSoldier) ? window.playerSoldier : playerSoldier;
        if (!s || s.isDead) return false;
        if (Math.abs(s.speed || 0) >= 0.15) return false;
        const k = (typeof window !== 'undefined' && window.keys) ? window.keys : {};
        if (k['w'] || k['s'] || k['a'] || k['d']) return false;
        if (typeof window !== 'undefined' && window.touchDrive) {
            const td = window.touchDrive;
            if ((td.magnitude || 0) > 0.05 || Math.abs(td.forward || 0) > 0.05 || Math.abs(td.turn || 0) > 0.05 || Math.abs(td.strafe || 0) > 0.05) {
                return false;
            }
        }
        return true;
    }
    window.isPlayerStandingStill = isPlayerStandingStill;

    // ------------------------------------------------------------------------
    // WINDOW EXPORTS
    // ------------------------------------------------------------------------
    function resetPlayerSoldier() {
        if (playerSoldier && playerSoldier.isMountedBicycle && typeof window.dismountBicycle === 'function') {
            window.dismountBicycle(playerSoldier);
        }
        if (playerSoldier && playerSoldier.rig && playerSoldier.rig.deployedMortar && window.scene) {
            window.scene.remove(playerSoldier.rig.deployedMortar);
        }
        if (playerSoldier && playerSoldier.rig && playerSoldier.rig.root && window.scene) {
            window.scene.remove(playerSoldier.rig.root);
        }
        playerSoldier = null;
        window.playerSoldier = null;
        playerMode = 'tank';
        window.playerMode = 'tank';
        if (crosshairEl) crosshairEl.classList.add('hidden');
        syncInfantryUI(false);
        window.playerIsDead = false;
        if (typeof window.hideKnockoutModal === 'function') window.hideKnockoutModal();
    }
    window.resetPlayerSoldier = resetPlayerSoldier;
    window.playerMode = playerMode;
    window.dismountTank = dismountTank;
    window.mountTank = mountTank;
    window.hijackTank = hijackTank;
    window.firePlayerRifle = firePlayerRifle;
    window.firePlayerSoldierWeapon = firePlayerRifle;
    window.updatePlayerSoldier = updatePlayerSoldier;
    window.isPlayerDetected = isPlayerDetected;
    window.isPlayerStandingStill = isPlayerStandingStill;
    window.healPlayerSoldier = healPlayerSoldier;
    window.triggerInteract = triggerInteract;
    window.initPlayerSoldierUI = initPlayerSoldierUI;

    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(initPlayerSoldierUI, 400);
    });
})();

    // Initialize UI in tank mode on startup
    if (typeof window !== 'undefined') {
        setTimeout(() => {
            if (typeof window.syncInfantryUI === 'function') window.syncInfantryUI(false);
        }, 100);
    }
