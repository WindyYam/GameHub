// ============================================================================
// TankClash — Player Infantry Dismount, Mount & Tank Hijacking System
// ============================================================================
(function () {
    'use strict';

    let playerMode = 'tank'; // 'tank' or 'soldier'
    let playerSoldier = null;

    function onPlayerSoldierDamage(amount) {
        if (!playerSoldier || playerSoldier.isDead) return;
        if (playerSoldier.invulnerableTimer > 0) return;
        playerSoldier.health = Math.max(0, playerSoldier.health - Math.round(amount));

        // Flinch / kickback impulse
        playerSoldier.speed = -0.8;
        playerSoldier.recoilKick = 0.45;

        const pPos = new THREE.Vector3(playerSoldier.x, playerSoldier.y + 1.1, playerSoldier.z);
        // Blood/impact dust particles
        if (typeof window.spawnParticle === 'function') {
            for (let i = 0; i < 4; i++) {
                const pVel = new THREE.Vector3((Math.random() - 0.5) * 2.0, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 2.0);
                window.spawnParticle(pPos, pVel, 0x881111, 0.12, 0.32, 0.4, false, 'smoke');
            }
        }

        // Red damage screen flash
        if (typeof window.showDamageFlash === 'function') {
            window.showDamageFlash(playerSoldier.health <= 0 ? 0.8 : 0.45);
        }

        // Ricochet / hit sound
        if (window.soundFX && typeof window.soundFX.playArmorRicochet === 'function') {
            window.soundFX.playArmorRicochet(pPos);
        }

        // Update HUD
        const hudArmor = document.getElementById('hud-armor');
        if (hudArmor) {
            hudArmor.textContent = `HP: ${playerSoldier.health}/100`;
            hudArmor.className = playerSoldier.health > 40 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold';
        }

        if (playerSoldier.health <= 0) {
            onPlayerSoldierDie();
        } else {
            if (typeof window.showKillFeedBanner === 'function') {
                window.showKillFeedBanner(`⚠️ INFANTRY HIT! (HP: ${playerSoldier.health}/100)`);
            }
        }
    }
    window.damagePlayerSoldier = onPlayerSoldierDamage;

    function startSoldierDeathAnimation(soldier) {
        const rig = soldier && soldier.rig;
        if (!rig) return;
        const pose = [
            [rig.hips.position, 'y', 0.14],
            [rig.hips.rotation, 'x', -Math.PI * 0.48],
            [rig.hips.rotation, 'z', (Math.random() - 0.5) * 0.35],
            [rig.torso.rotation, 'x', 0],
            [rig.torso.rotation, 'y', 0],
            [rig.head.rotation, 'x', -0.3],
            [rig.head.rotation, 'y', 0],
            [rig.rightArm.shoulder.rotation, 'x', -0.25],
            [rig.rightArm.shoulder.rotation, 'y', 0],
            [rig.rightArm.shoulder.rotation, 'z', -1.2],
            [rig.leftArm.shoulder.rotation, 'x', -0.35],
            [rig.leftArm.shoulder.rotation, 'y', 0],
            [rig.leftArm.shoulder.rotation, 'z', 1.15],
            [rig.rightLeg.hipJoint.rotation, 'x', 0.12],
            [rig.rightLeg.hipJoint.rotation, 'z', 0.25],
            [rig.leftLeg.hipJoint.rotation, 'x', -0.18],
            [rig.leftLeg.hipJoint.rotation, 'z', -0.3],
            [rig.rightLeg.kneeJoint.rotation, 'x', 0.05],
            [rig.leftLeg.kneeJoint.rotation, 'x', 0.1]
        ];
        if (rig.rifle && rig.rifle.position) {
            pose.push(
                [rig.rifle.position, 'x', 0.25],
                [rig.rifle.position, 'y', 0.05],
                [rig.rifle.position, 'z', 0.2]
            );
        }
        if (rig.rifle && rig.rifle.rotation) {
            pose.push(
                [rig.rifle.rotation, 'x', 0],
                [rig.rifle.rotation, 'y', (Math.random() - 0.5) * 2],
                [rig.rifle.rotation, 'z', 1.57]
            );
        }
        soldier.deathAnimation = {
            elapsed: 0,
            pose: pose.map(([object, axis, target]) => ({ object, axis, start: object[axis], target }))
        };
        if (rig.handGrenade) rig.handGrenade.visible = false;
        if (rig.rifle) rig.rifle.visible = true;
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
        playerSoldier.isDead = true;
        playerSoldier.speed = 0;

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

        // Add top bar dismount button if not present
        const panelViewsContent = document.getElementById('panel-views-content');
        if (panelViewsContent && !document.getElementById('btn-dismount-toggle')) {
            const dismountBtn = document.createElement('button');
            dismountBtn.id = 'btn-dismount-toggle';
            dismountBtn.className = 'hud-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold text-amber-300 hover:text-white';
            dismountBtn.title = 'Get off/on Tank as Soldier [Key: E]';
            dismountBtn.innerHTML = '🚶 <span id="hud-dismount-label">Exit [E]</span>';
            panelViewsContent.insertBefore(dismountBtn, panelViewsContent.firstChild);

            dismountBtn.addEventListener('click', (e) => {
                e.preventDefault();
                triggerInteract();
            });
        }
    }

    // ------------------------------------------------------------------------
    // INFANTRY HUD & CONTROLS SYNCHRONIZATION
    // ------------------------------------------------------------------------
    function syncInfantryUI(isInfantry) {
        // 1. Force orbit camera and hide FPV mode button in infantry mode
        if (isInfantry) {
            if (typeof window.setCameraMode === 'function') {
                window.setCameraMode('orbit');
            }
        }
        const camFpvBtn = document.getElementById('cam-fpv');
        if (camFpvBtn) camFpvBtn.classList.toggle('hidden', isInfantry);
        const tankSelector = document.getElementById('panel-tank-selector');
        if (tankSelector) tankSelector.classList.toggle('hidden', isInfantry);

        // 2. Mobile Jump & Grenade buttons
        const mobJump = document.getElementById('mob-btn-jump');
        if (mobJump) mobJump.classList.toggle('hidden', !isInfantry);

        const mobGrenade = document.getElementById('mob-btn-grenade');
        if (mobGrenade) mobGrenade.classList.toggle('hidden', !isInfantry);

        // 3. Mobile Tank-specific buttons (hide in infantry mode)
        ['mob-fire-coax', 'mob-fire-bow', 'mob-btn-smoke', 'mob-btn-zoom'].forEach(id => {
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

        // 4. Update Main Fire button label/icon
        const mobFireIcon = document.getElementById('mob-fire-icon');
        const mobFireCaliber = document.getElementById('mob-fire-caliber');
        if (mobFireIcon) mobFireIcon.textContent = isInfantry ? '🎯' : '💥';
        if (mobFireCaliber) {
            if (isInfantry) {
                mobFireCaliber.textContent = 'RIFLE';
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
            soundHandle = window.soundFX.playBombWhistle(1.6);
        }
        grenade.soundHandle = soundHandle;
        if (typeof window.showKillFeedBanner === 'function') {
            window.showKillFeedBanner('💣 GRENADE OUT!');
        }
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
                // Direct anti-tank grenade strike knocks out the enemy tank!
                const hitDir = new THREE.Vector3(et.x - blastPos.x, 0.4, et.z - blastPos.z).normalize();
                et.onHit(blastPos, hitDir);
                if (typeof window.showKillFeedBanner === 'function') {
                    window.showKillFeedBanner('💥 ENEMY TANK DESTROYED BY GRENADE!');
                }
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
                    window.showKillFeedBanner('🎯 ENEMY INFANTRY ELIMINATED BY GRENADE');
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
            g.pos.addScaledVector(g.vel, dt);

            // Mesh rotation
            g.mesh.rotation.x += g.rotVel.x * dt;
            g.mesh.rotation.y += g.rotVel.y * dt;
            g.mesh.rotation.z += g.rotVel.z * dt;
            g.mesh.position.copy(g.pos);

            let shouldExplode = false;

            // 1. Explode immediately upon touching ground / terrain
            if (typeof window.getTerrainHeight === 'function') {
                const gh = window.getTerrainHeight(g.pos.x, g.pos.z);
                if (g.pos.y <= gh + 0.12) {
                    g.pos.y = gh + 0.05;
                    shouldExplode = true;
                }
            }

            // 2. Explode immediately upon hitting enemy tanks or player tank
            if (!shouldExplode) {
                const enemies = window.activeEnemyTanks || [];
                for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
                    const et = enemies[eIdx];
                    if (!et || et.isDestroyed) continue;
                    const d = Math.hypot(g.pos.x - et.x, g.pos.z - et.z);
                    if (d < 2.8 && Math.abs(g.pos.y - et.y) < 2.6) {
                        shouldExplode = true;
                        break;
                    }
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
        if (typeof window.buildSoldier !== 'function') {
            console.error('[PlayerSoldier] buildSoldier not available');
            return;
        }

        const rig = window.buildSoldier(faction);
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
            isDead: false,
            invulnerableTimer: isTankDestroyed ? 1.0 : 0.0, // 1s invincibility when tank is destroyed
            animTime: 0,
            recoilKick: 0,
            fireCooldown: 0,
            faction,
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
            window.showKillFeedBanner('🚶 INFANTRY (WASD: Move, Space: Jump, RMB/G: Grenade, LMB: Shoot)');
        }
    }

    // ------------------------------------------------------------------------
    // 2. MOUNT TANK (Return to Tank Command)
    // ------------------------------------------------------------------------
    function mountTank() {
        if (playerMode !== 'soldier' || !playerSoldier || playerSoldier.isDead) return;
        if (window.tankState && window.tankState.isKnockedOut) {
            if (typeof window.showKillFeedBanner === 'function') {
                window.showKillFeedBanner('⚠️ TANK IS DESTROYED! SNEAK & HIJACK AN ENEMY TANK [E]');
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

        // 4. Position player tank at captured tank's exact coordinates
        if (window.tankState) {
            window.tankState.x = capturedX;
            window.tankState.y = capturedY;
            window.tankState.z = capturedZ;
            window.tankState.heading = capturedHeading;
            window.tankState.speed = 0;
            window.tankState.turnRate = 0;
            window.tankState.isKnockedOut = false;
        }
        if (window.tankRoot) {
            window.tankRoot.position.set(capturedX, capturedY, capturedZ);
            window.tankRoot.rotation.y = capturedHeading;
        }

        // 5. Reset armor/health to full
        if (typeof window.resetPlayerHealth === 'function') {
            window.resetPlayerHealth();
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
    // 4. FIRE PLAYER RIFLE
    // ------------------------------------------------------------------------
    function firePlayerRifle() {
        if (playerMode !== 'soldier' || !playerSoldier || playerSoldier.isDead) return;
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
                onSoldierKilled: () => {
                    if (typeof window.showKillFeedBanner === 'function') {
                        window.showKillFeedBanner('🎯 ENEMY INFANTRY ELIMINATED');
                    }
                }
            });
        }
    }

    // ------------------------------------------------------------------------
    // 5. UPDATE PLAYER SOLDIER (Simulation Frame)
    // ------------------------------------------------------------------------
    function updatePlayerSoldier(dt, currentActiveCam, keys) {
        if (playerMode !== 'soldier' || !playerSoldier) return;

        const s = playerSoldier;
        if (s.isDead) {
            updateSoldierDeathAnimation(s, dt, currentActiveCam);
            return;
        }

        s.animTime += dt;
        s.fireCooldown = Math.max(0, s.fireCooldown - dt);
        s.recoilKick = Math.max(0, s.recoilKick - dt * 5.0);

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

        const stickMag = window.touchDrive ? (window.touchDrive.magnitude || Math.hypot(stickForward, stickStrafe)) : 0;
        const isStickRunning = (window.touchDrive && window.touchDrive.isMax) || (stickMag >= 0.85);

        const isSprinting = !!k['shift'] || isStickRunning;
        const moveSpeed = isSprinting ? 5.2 : 2.8;

        const camTheta = (window.camOrbit && window.camOrbit.theta !== undefined) ? window.camOrbit.theta : s.heading;
        // Camera horizontal forward and right vectors
        const camFwdX = -Math.sin(camTheta);
        const camFwdZ = -Math.cos(camTheta);
        const camRightX = -camFwdZ;
        const camRightZ = camFwdX;

        let moveX = camFwdX * fwdInput + camRightX * strInput;
        let moveZ = camFwdZ * fwdInput + camRightZ * strInput;
        const moveLen = Math.hypot(moveX, moveZ);

        if (moveLen > 0.05) {
            moveX = (moveX / moveLen) * moveSpeed;
            moveZ = (moveZ / moveLen) * moveSpeed;

            s.x += moveX * dt;
            s.z += moveZ * dt;
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
            s.speed = THREE.MathUtils.lerp(s.speed, 0, dt * 10.0);
            s.heading = Math.atan2(camFwdX, camFwdZ);
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
            let rShX = -0.70;
            let rShY = 0.12;
            let rShZ = -0.22;
            let rElX = -1.70;

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

            rig.rightArm.shoulder.rotation.set(rShX, rShY, rShZ);
            rig.rightArm.elbow.rotation.x = rElX;
            rig.rightArm.wrist.rotation.set(0, 0, 0);

            // Update world matrices for torso and right arm/wrist
            rig.torso.updateMatrixWorld(true);
            rig.rightArm.shoulder.updateMatrixWorld(true);
            rig.rightArm.elbow.updateMatrixWorld(true);
            rig.rightArm.wrist.updateMatrixWorld(true);

            // Orient rifle and solve left arm IK only when not throwing (left arm remains completely unchanged during throw)
            if (!isThrowingGrenade) {
                const fwd = camLookDir.clone().normalize();
                const worldUp = new THREE.Vector3(0, 1, 0);
                let right = new THREE.Vector3().crossVectors(worldUp, fwd);
                if (right.lengthSq() < 0.0001) {
                    const camTheta = (window.camOrbit && window.camOrbit.theta !== undefined) ? window.camOrbit.theta : s.heading;
                    right.set(Math.cos(camTheta), 0, -Math.sin(camTheta));
                } else {
                    right.normalize();
                }
                const realUp = new THREE.Vector3().crossVectors(fwd, right).normalize();
                const rotMat = new THREE.Matrix4().makeBasis(right, realUp, fwd);
                const targetWorldQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);

                const wristWorldQuat = new THREE.Quaternion();
                rig.rightArm.wrist.getWorldQuaternion(wristWorldQuat);
                const localRifleQuat = wristWorldQuat.clone().invert().multiply(targetWorldQuat);
                rig.rifle.quaternion.copy(localRifleQuat);
                rig.rifle.updateMatrixWorld(true);

                // 2-Bone Analytical Inverse Kinematics for Left Arm holding wooden forend
                const gripWorld = rig.rifle.localToWorld(new THREE.Vector3(0, -0.02, 0.15));
                const leftShoulderPos = rig.leftArm.shoulder.position; // in torso space
                const gripTorso = rig.torso.worldToLocal(gripWorld.clone());

                const D = gripTorso.clone().sub(leftShoulderPos);
                const dist = D.length();
                const L1 = 0.265; // upper arm length
                const L2 = 0.24; // forearm length

                const targetDist = Math.min(dist, L1 + L2 - 0.005);
                const cosAlpha = Math.max(-1, Math.min(1, (L1 * L1 + targetDist * targetDist - L2 * L2) / (2 * L1 * targetDist)));
                const alpha = Math.acos(cosAlpha);

                const D_norm = D.clone().normalize();
                const pole = new THREE.Vector3(0.5, -0.6, 0.4).normalize();
                let n = pole.clone().sub(D_norm.clone().multiplyScalar(pole.dot(D_norm)));
                if (n.lengthSq() < 0.001) n = new THREE.Vector3(1, 0, 0);
                n.normalize();

                const E = leftShoulderPos.clone()
                    .add(D_norm.clone().multiplyScalar(L1 * Math.cos(alpha)))
                    .add(n.clone().multiplyScalar(L1 * Math.sin(alpha)));

                // Shoulder orientation (upper arm points to elbow E)
                const vUpper = E.clone().sub(leftShoulderPos).normalize();
                const qUpper = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), vUpper);
                rig.leftArm.shoulder.quaternion.copy(qUpper);
                rig.leftArm.shoulder.updateMatrixWorld(true);

                // Elbow orientation (forearm points to gripTorso)
                const vForearmTorso = gripTorso.clone().sub(E).normalize();
                const vForearmShoulder = vForearmTorso.clone().applyQuaternion(qUpper.clone().invert());
                const qForearm = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), vForearmShoulder);
                rig.leftArm.elbow.quaternion.copy(qForearm);
                rig.leftArm.elbow.updateMatrixWorld(true);
                rig.leftArm.wrist.updateMatrixWorld(true);
            }
        }

        // 3. Update Camera Position to follow player soldier
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
            const dOwn = (window.tankState) ? Math.hypot(pX - window.tankState.x, pZ - window.tankState.z) : 999;

            // Prioritize hijacking enemy tank when in range!
            if (closestEnemy && closestEnemyDist < 4.8) {
                currentInteractAction = { type: 'hijack', enemyTank: closestEnemy };
                const tName = closestEnemy.tankType ? closestEnemy.tankType.toUpperCase() : 'TANK';
                showInteractPrompt(`⚡ HIJACK ${tName}`, '⚡', true);
                return;
            }

            const ownTankDestroyed = !!(window.tankState && window.tankState.isKnockedOut);
            if (dOwn < 4.2 && !ownTankDestroyed) {
                currentInteractAction = { type: 'mount' };
                showInteractPrompt('🚗 MOUNT TANK', '🚗', false);
                return;
            }

            // Neither in range
            currentInteractAction = null;
            hideInteractPrompt();
        } else {
            // Player is in tank
            currentInteractAction = { type: 'dismount' };
            // In tank mode, show dismount button when stationary/slow
            if (window.tankState && Math.abs(window.tankState.speed || 0) < 3.5) {
                showInteractPrompt('DISMOUNT TANK', '🚶', false);
            } else {
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
            mobInteract.innerHTML = `<span>${icon}</span><span class="text-[9px] font-bold">${isHijack ? 'HIJACK' : (playerMode === 'soldier' ? 'MOUNT' : 'EXIT')}</span>`;
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
        }
    }

    // ------------------------------------------------------------------------
    // WINDOW EXPORTS
    // ------------------------------------------------------------------------
    function resetPlayerSoldier() {
        if (playerSoldier && playerSoldier.rig && playerSoldier.rig.root && window.scene) {
            window.scene.remove(playerSoldier.rig.root);
        }
        playerSoldier = null;
        window.playerSoldier = null;
        playerMode = 'tank';
        window.playerMode = 'tank';
        if (crosshairEl) crosshairEl.classList.add('hidden');
        syncInfantryUI(false);
        if (typeof window.hideKnockoutModal === 'function') window.hideKnockoutModal();
    }
    window.resetPlayerSoldier = resetPlayerSoldier;
    window.playerMode = playerMode;
    window.dismountTank = dismountTank;
    window.mountTank = mountTank;
    window.hijackTank = hijackTank;
    window.firePlayerRifle = firePlayerRifle;
    window.updatePlayerSoldier = updatePlayerSoldier;
    window.triggerInteract = triggerInteract;
    window.initPlayerSoldierUI = initPlayerSoldierUI;

    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(initPlayerSoldierUI, 400);
    });
})();

    // Initialize UI in tank mode on startup
    if (typeof window !== 'undefined') {
        setTimeout(() => syncInfantryUI(false), 100);
    }
