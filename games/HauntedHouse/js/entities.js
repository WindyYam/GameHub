// ============================================================================
// HAUNTED HOUSE — ANIMATED ENTITIES & SCARE ACTORS WITH SHADOWS & LATHE SCULPTS
// ============================================================================
(() => {
  'use strict';
  const { clamp, lerp, smooth, rand, rr, MAT, PROPS, createGhostMaterial, registerLightAnchor, enableShadows, mergeStaticGroup } = window.HH;

  const V2 = (x, y) => new THREE.Vector2(x, y);
  const SKEL_SOCKET_MAT = new THREE.MeshBasicMaterial({ color: 0x070403 });

  // Shared high-detail Lathe & Buffer Geometries for Entities
  const GHOST_DRESS_GEO = window.HH.smoothLathe([
    V2(0.76, 0.02),
    V2(0.64, 0.25),
    V2(0.50, 0.55),
    V2(0.38, 0.88),
    V2(0.26, 1.18),
    V2(0.155, 1.42), // Cinched Victorian waist
    V2(0.215, 1.66), // Bust / bodice
    V2(0.24, 1.84),  // Shoulders
    V2(0.11, 1.94),  // Collar
    V2(0.075, 2.02)  // Neck
  ], 48, 8);
  GHOST_DRESS_GEO._shared = true;

  const GHOST_VEIL_GEO = window.HH.smoothLathe([
    V2(0.46, 1.25),
    V2(0.38, 1.58),
    V2(0.28, 1.88),
    V2(0.19, 2.12),
    V2(0.15, 2.26),
    V2(0.01, 2.32)
  ], 40, 8);
  GHOST_VEIL_GEO._shared = true;

  const GEO_ENT = {
    vertebra: new THREE.CylinderGeometry(0.028, 0.030, 0.036, 8),
    jointBall: new THREE.SphereGeometry(0.028, 8, 8),
    smallJoint: new THREE.SphereGeometry(0.014, 6, 6),
    tooth: new THREE.BoxGeometry(0.010, 0.018, 0.010),
    fingerBone: new THREE.CylinderGeometry(0.0055, 0.004, 0.052, 6),
    armorGreave: window.HH.smoothLathe([
      V2(0.055, 0.0), V2(0.048, 0.08), V2(0.068, 0.24),
      V2(0.064, 0.36), V2(0.058, 0.42)
    ], 14, 4),
    armorCuirass: window.HH.smoothLathe([
      V2(0.15, 0.0), V2(0.175, 0.08), V2(0.145, 0.16),
      V2(0.225, 0.36), V2(0.245, 0.50), V2(0.19, 0.62), V2(0.12, 0.66)
    ], 18, 4),
    armorHelm: window.HH.smoothLathe([
      V2(0.115, 0.0), V2(0.135, 0.05), V2(0.125, 0.12),
      V2(0.142, 0.22), V2(0.125, 0.32), V2(0.06, 0.38), V2(0.0, 0.40)
    ], 16, 4)
  };
  Object.values(GEO_ENT).forEach(g => { g._shared = true; });

  // --------------------------------------------------------------------------
  // 1. ETHEREAL SPECTRAL GHOST (Sculpted Victorian Lady in Flowing Gown)
  // --------------------------------------------------------------------------
  function createGhostActor(mode = 'corridor_lunge', tag = '') {
    const root = new THREE.Group();
    const matOuter = createGhostMaterial(0x68c8f5);
    const matInner = createGhostMaterial(0xa8e8ff);
    matInner.uniforms.uOpacity.value = 0.52;

    // Continuous sculpted Victorian gown + bodice + ruffled lace collar
    const dress = new THREE.Mesh(GHOST_DRESS_GEO, matOuter);
    root.add(dress);

    const laceCollar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20), matInner);
    laceCollar.rotation.x = Math.PI * 0.5 + 0.12;
    laceCollar.scale.set(1.0, 0.92, 0.55);
    laceCollar.position.set(0, 1.93, 0.02);
    root.add(laceCollar);

    // Flowing translucent veil & hair over head and shoulders
    const veil = new THREE.Mesh(GHOST_VEIL_GEO, matInner);
    veil.position.z = -0.05;
    root.add(veil);

    // Sculpted Head & Haunted Face with cheekbones, nose bridge & brow
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 2.13, 0.03);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 16), matInner);
    head.scale.set(0.86, 1.12, 0.94);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.055, 5), matInner);
    nose.position.set(0, -0.005, 0.126);
    nose.rotation.x = 0.25;
    headGroup.add(head, nose);

    // Softly glowing spectral eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xcff8ff, transparent: true, opacity: 0.9 });
    const eyeGeo = new THREE.SphereGeometry(0.015, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.042, 0.015, 0.118);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.042, 0.015, 0.118);
    headGroup.add(eyeL, eyeR);
    root.add(headGroup);

    // Graceful Draped Sleeves & Reaching Hands with Spectral Fingers
    const armL = new THREE.Group();
    armL.position.set(-0.22, 1.82, 0.02);
    const shoulderPuffL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), matOuter);
    shoulderPuffL.scale.set(0.9, 1.15, 0.95);
    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.34, 10), matInner);
    upperArmL.position.set(-0.08, -0.10, 0.10);
    upperArmL.rotation.set(0.55, 0, -0.42);
    const foreArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.15, 0.38, 12, 4, true), matOuter);
    foreArmL.position.set(-0.15, -0.04, 0.30);
    foreArmL.rotation.set(Math.PI * 0.42, 0, -0.2);
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), matInner);
    handL.scale.set(0.75, 0.55, 1.3);
    handL.position.set(-0.17, 0.02, 0.47);
    armL.add(shoulderPuffL, upperArmL, foreArmL, handL);

    for (let f = -2; f <= 2; f++) {
      const finger = new THREE.Mesh(GEO_ENT.fingerBone, matInner);
      finger.position.set(-0.17 + f * 0.011, 0.022 - Math.abs(f) * 0.004, 0.52);
      finger.rotation.set(Math.PI * 0.45 + Math.abs(f) * 0.08, f * 0.12, 0);
      armL.add(finger);
    }

    const armR = armL.clone();
    armR.position.x = 0.22;
    armR.scale.x = -1;
    root.add(armL, armR);

    const lightAnchor = registerLightAnchor({
      pos: new THREE.Vector3(0, 1.8, 0),
      color: 0x4cc4f0,
      intensity: mode === 'balcony_watcher' ? 0.65 : 0.70,
      distance: 4.2,
      flickerSpeed: 4.5,
      flickerAmp: 0.18,
      priority: 1.4,
      tag
    });

    const basePos = new THREE.Vector3();
    let initialized = false;
    let scared = false;
    let scareTimer = 0;
    let banished = false;

    function update(time, dt, camPos, onScareTrigger) {
      if (!initialized) {
        root.getWorldPosition(basePos);
        initialized = true;
      }
      matOuter.uniforms.uTime.value = time;
      matInner.uniforms.uTime.value = time;

      const worldPos = new THREE.Vector3();
      root.getWorldPosition(worldPos);
      const dist = worldPos.distanceTo(camPos);

      if (banished) {
        const op = Math.max(0, matOuter.uniforms.uOpacity.value - dt * 2.5);
        matOuter.uniforms.uOpacity.value = op;
        matInner.uniforms.uOpacity.value = op * 0.65;
        eyeMat.opacity = op;
        root.position.y += dt * 2.2;
        root.rotation.y += dt * 5.0;
        lightAnchor.intensity = op * 1.2;
        if (op <= 0.01) {
          root.visible = false;
          lightAnchor.active = false;
        }
        return;
      }

      const hover = Math.sin(time * 2.0 + basePos.x) * 0.14;

      if (mode === 'balcony_watcher') {
        root.position.y = root.userData.baseY + hover;
        root.position.x = root.userData.baseX + Math.sin(time * 0.85 + basePos.z) * 0.55;
        const dx = camPos.x - worldPos.x, dz = camPos.z - worldPos.z;
        root.rotation.y = Math.atan2(dx, dz);
        armL.rotation.x = -0.25 + Math.sin(time * 2.2) * 0.18;
        armR.rotation.x = -0.25 + Math.cos(time * 2.2) * 0.18;
        headGroup.rotation.z = Math.sin(time * 1.6) * 0.10;
      } else {
        const dx = camPos.x - worldPos.x, dz = camPos.z - worldPos.z;
        root.rotation.y = Math.atan2(dx, dz);

        if (!scared && dist < 11.5 && dist > 2.5) {
          scared = true;
          scareTimer = 0;
          if (onScareTrigger) onScareTrigger('ghost', worldPos);
        }

        if (scared) {
          scareTimer += dt;
          const lungeT = clamp(scareTimer / 1.55, 0, 1);
          matOuter.uniforms.uAgitation.value = smooth(0, 0.4, lungeT);
          matInner.uniforms.uAgitation.value = smooth(0, 0.4, lungeT);

          const rushRatio = smooth(0.0, 0.65, lungeT);
          root.position.x = lerp(root.userData.baseX, camPos.x * 0.65, rushRatio) + Math.sin(time * 16.0) * 0.05;
          root.position.y = root.userData.baseY + hover + Math.sin(lungeT * Math.PI) * 0.22;
          root.position.z = lerp(root.userData.baseZ, camPos.z - 2.2, rushRatio * 0.65);

          armL.rotation.x = -0.85 + Math.sin(time * 14) * 0.18;
          armR.rotation.x = -0.85 + Math.cos(time * 14) * 0.18;
          headGroup.rotation.x = 0.15;

          lightAnchor.intensity = 1.25 * (1.0 - smooth(0.75, 1.0, lungeT));
          const fadeAlpha = 1.0 - smooth(0.80, 1.0, lungeT);
          matOuter.uniforms.uOpacity.value = 0.82 * fadeAlpha;
          matInner.uniforms.uOpacity.value = 0.54 * fadeAlpha;
          eyeMat.opacity = 0.9 * fadeAlpha;
          if (fadeAlpha <= 0.01) {
            root.visible = false;
            lightAnchor.active = false;
          }
        } else {
          root.position.y = root.userData.baseY + hover;
          armL.rotation.x = -0.15 + Math.sin(time * 2.0) * 0.12;
          armR.rotation.x = -0.15 + Math.cos(time * 2.0) * 0.12;
        }
      }

      root.getWorldPosition(lightAnchor.pos);
      lightAnchor.pos.y += 1.6;
    }

    root.userData.update = update;
    root.userData.banish = () => { banished = true; };
    root.userData.triggerScareNow = (camPos, onScareTrigger) => {
      if (!scared && mode !== 'balcony_watcher') {
        scared = true;
        scareTimer = 0;
        const wp = new THREE.Vector3();
        root.getWorldPosition(wp);
        if (onScareTrigger) onScareTrigger('ghost', wp);
      }
    };
    return root;
  }

  // --------------------------------------------------------------------------
  // 2. ANATOMICAL ARTICULATED SKELETON (Seated in Victorian Armchair or Crypt Ambush)
  // --------------------------------------------------------------------------
  function createSkeletonActor(seated = true) {
    const root = new THREE.Group();
    if (!seated) root.add(PROPS.makeAODecal(0.85, 0.85));

    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    const pelvisY = seated ? 0.60 : 0.94;
    const pelvisZ = seated ? -0.06 : 0.0;

    // --- A. Sculpted Anatomical Pelvis (Sacrum, Iliac Crests & Pubic Arch) ---
    const pelvisGroup = new THREE.Group();
    pelvisGroup.position.set(0, pelvisY, pelvisZ);
    bodyGroup.add(pelvisGroup);

    const sacrum = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.14, 6), MAT.bone);
    sacrum.rotation.x = Math.PI;
    sacrum.scale.z = 0.55;
    sacrum.position.set(0, 0.0, -0.04);
    pelvisGroup.add(sacrum);

    for (const sx of [-1, 1]) {
      const ilium = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.024, 8, 14, Math.PI * 1.15), MAT.bone);
      ilium.position.set(sx * 0.085, 0.02, -0.01);
      ilium.rotation.set(0.35, sx * 0.45, sx < 0 ? 0.2 : -0.2);
      const hipSocket = new THREE.Mesh(GEO_ENT.jointBall, MAT.bone);
      hipSocket.position.set(sx * 0.115, -0.035, 0.02);
      pelvisGroup.add(ilium, hipSocket);
    }

    // --- B. Articulated Vertebral Column, Ribcage, Sternum & Clavicles ---
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, pelvisY, pelvisZ);
    if (seated) torsoGroup.rotation.x = -0.07; // Reclined against tufted armchair backrest
    bodyGroup.add(torsoGroup);

    const torsoBones = new THREE.Group();
    torsoGroup.add(torsoBones);

    // 12 Individual Vertebrae along the S-curved Spine
    for (let v = 0; v < 12; v++) {
      const vt = v / 11;
      const vert = new THREE.Mesh(GEO_ENT.vertebra, MAT.bone);
      const sCurveZ = Math.sin(vt * Math.PI * 1.6) * -0.028;
      vert.position.set(0, 0.04 + v * 0.046, -0.03 + sCurveZ);
      vert.scale.setScalar(1.0 - vt * 0.22);
      torsoBones.add(vert);
    }

    // Sculpted Sternum (Manubrium + Body) at front of Ribcage
    const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.24, 0.018), MAT.bone);
    sternum.position.set(0, 0.39, 0.115);
    sternum.rotation.x = -0.10;
    torsoBones.add(sternum);

    // 7 Pairs of Anatomically Curved Ribs + 2 Floating Lower Ribs
    for (let r = 0; r < 8; r++) {
      const rt = r / 7;
      const ribScaleX = 0.145 - Math.abs(rt - 0.35) * 0.055;
      const ribY = 0.50 - r * 0.046;
      const arcLen = r < 6 ? Math.PI * 1.72 : Math.PI * 1.32;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(ribScaleX, 0.0125, 7, 16, arcLen), MAT.bone);
      rib.scale.set(1.05, 0.86, 1.0);
      rib.position.set(0, ribY, -0.01);
      rib.rotation.x = Math.PI * 0.5 + 0.18;
      rib.rotation.z = -arcLen * 0.5 - Math.PI * 0.5;
      torsoBones.add(rib);
    }

    // S-Curved Clavicles (Collarbones) & Shoulder Scapulae
    for (const sx of [-1, 1]) {
      const clavicle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.18, 8), MAT.bone);
      clavicle.rotation.z = Math.PI * 0.5 - sx * 0.12;
      clavicle.position.set(sx * 0.095, 0.535, 0.06);
      const shoulderJoint = new THREE.Mesh(GEO_ENT.jointBall, MAT.bone);
      shoulderJoint.position.set(sx * 0.195, 0.525, 0.01);
      torsoBones.add(clavicle, shoulderJoint);
    }

    // --- C. High-Detail Anatomical Skull with Zygomatic Arches, Nasal Cavity & 16 Teeth ---
    const skullGroup = new THREE.Group();
    skullGroup.position.set(0, 0.65, 0.02);
    torsoGroup.add(skullGroup);

    const skullBones = new THREE.Group();
    skullGroup.add(skullBones);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 14), MAT.bone);
    cranium.scale.set(0.88, 1.04, 1.12);
    cranium.position.set(0, 0.065, -0.01);

    // Supraorbital Brow Ridge & Zygomatic Cheekbones
    const browRidge = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.145, 10), MAT.bone);
    browRidge.rotation.z = Math.PI * 0.5;
    browRidge.scale.set(0.8, 1.0, 1.2);
    browRidge.position.set(0, 0.064, 0.102);

    const cheekbones = new THREE.Mesh(new THREE.BoxGeometry(0.154, 0.056, 0.105), MAT.bone);
    cheekbones.position.set(0, 0.002, 0.052);

    const maxilla = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.048, 0.048, 12), MAT.bone);
    maxilla.position.set(0, -0.026, 0.068);
    skullBones.add(cranium, browRidge, cheekbones, maxilla);

    const glowEyeMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.0 });
    for (const sx of [-0.043, 0.043]) {
      const orbitRim = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 12), MAT.bone);
      orbitRim.position.set(sx, 0.032, 0.105);
      orbitRim.rotation.y = sx * 0.22;
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.027, 10, 8), SKEL_SOCKET_MAT);
      sock.position.set(sx, 0.032, 0.098);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 6), glowEyeMat);
      pupil.position.set(sx, 0.032, 0.118);
      skullBones.add(orbitRim, sock);
      skullGroup.add(pupil);
    }

    // Hollow Piriform Nasal Cavity
    const nasalCavity = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.038, 3), SKEL_SOCKET_MAT);
    nasalCavity.scale.z = 0.5;
    nasalCavity.position.set(0, 0.002, 0.118);
    skullBones.add(nasalCavity);

    // Upper Row of Individual 3D Teeth
    for (let t = -3; t <= 3; t++) {
      const a = t * 0.22;
      const tooth = new THREE.Mesh(GEO_ENT.tooth, MAT.bone);
      tooth.position.set(Math.sin(a) * 0.048, -0.052, 0.068 + Math.cos(a) * 0.048);
      tooth.rotation.y = a;
      skullBones.add(tooth);
    }

    // Articulated Mandible (Lower Jaw) with Ascending Rami & Lower Teeth Row
    const jawGroup = new THREE.Group();
    jawGroup.position.set(0, -0.025, 0.02);
    const jawChin = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.042, 0.036, 12, 1, false, -Math.PI * 0.55, Math.PI * 1.1), MAT.bone);
    jawChin.position.set(0, -0.048, 0.046);
    jawGroup.add(jawChin);

    for (const sx of [-0.048, 0.048]) {
      const ramus = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.062, 0.032), MAT.bone);
      ramus.position.set(sx, -0.022, 0.018);
      ramus.rotation.x = 0.25;
      jawGroup.add(ramus);
    }
    for (let t = -3; t <= 3; t++) {
      const a = t * 0.22;
      const tooth = new THREE.Mesh(GEO_ENT.tooth, MAT.bone);
      tooth.position.set(Math.sin(a) * 0.045, -0.026, 0.046 + Math.cos(a) * 0.045);
      tooth.rotation.y = a;
      jawGroup.add(tooth);
    }
    skullGroup.add(jawGroup);

    // --- D. Articulated Arms (Humerus, Double Forearm Radius/Ulna & 5-Fingered Hands) ---
    function buildSkeletonArm(side) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.20, 0.52, 0.01);

      // Upper Arm (Humerus) angled outward toward chair armrest
      const hum = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.016, 0.32, 8), MAT.bone);
      hum.position.set(side * 0.09, -0.13, 0.06);
      hum.rotation.set(-0.35, 0, side * 0.52);

      const elbow = new THREE.Mesh(GEO_ENT.jointBall, MAT.bone);
      elbow.scale.setScalar(0.82);
      elbow.position.set(side * 0.175, -0.26, 0.12);

      // Double Forearm Bones (Radius & Ulna) resting along the scrolled armrest
      const radiusBone = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.29, 8), MAT.bone);
      radiusBone.position.set(side * 0.185, -0.245, 0.265);
      radiusBone.rotation.set(Math.PI * 0.48, 0, 0);

      const ulnaBone = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.010, 0.29, 8), MAT.bone);
      ulnaBone.position.set(side * 0.208, -0.252, 0.265);
      ulnaBone.rotation.set(Math.PI * 0.48, 0, 0);

      // Wrist Carpals & 5 Articulated Bony Fingers Draped Over Front of Armrest
      const handGroup = new THREE.Group();
      handGroup.position.set(side * 0.195, -0.24, 0.415);
      const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.018, 0.038), MAT.bone);
      handGroup.add(wrist);

      for (let f = -2; f <= 2; f++) {
        const meta = new THREE.Mesh(GEO_ENT.fingerBone, MAT.bone);
        meta.scale.y = 0.78;
        meta.position.set(f * 0.010, -0.008, 0.032);
        meta.rotation.set(Math.PI * 0.36, f * 0.08, 0);

        const phal = new THREE.Mesh(GEO_ENT.fingerBone, MAT.bone);
        phal.scale.set(0.85, 0.72, 0.85);
        phal.position.set(f * 0.012, -0.036, 0.056);
        phal.rotation.set(Math.PI * 0.12, f * 0.08, 0);
        handGroup.add(meta, phal);
      }

      arm.add(hum, elbow, radiusBone, ulnaBone, handGroup);
      return arm;
    }

    const armL = buildSkeletonArm(-1);
    const armR = buildSkeletonArm(1);
    torsoGroup.add(armL, armR);

    // --- E. Articulated Legs (Femur, Patella, Double Tibia/Fibula & Skeletal Feet) ---
    const legsBones = new THREE.Group();
    bodyGroup.add(legsBones);
    for (const side of [-1, 1]) {
      const sx = side * 0.115;
      const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.020, 0.42, 10), MAT.bone);
      const patella = new THREE.Mesh(GEO_ENT.jointBall, MAT.bone);
      patella.scale.set(0.85, 0.95, 0.65);
      const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.015, 0.43, 8), MAT.bone);
      const fibula = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.009, 0.41, 6), MAT.bone);

      const footGroup = new THREE.Group();
      const heel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), MAT.bone);
      heel.scale.set(0.85, 0.75, 1.35);
      footGroup.add(heel);
      for (let t = -2; t <= 2; t++) {
        const toe = new THREE.Mesh(GEO_ENT.fingerBone, MAT.bone);
        toe.scale.y = 1.15 - Math.abs(t) * 0.1;
        toe.rotation.x = Math.PI * 0.48;
        toe.position.set(t * 0.011, -0.006, 0.055);
        footGroup.add(toe);
      }

      if (seated) {
        femur.position.set(sx * 1.08, 0.56, 0.16);
        femur.rotation.set(Math.PI * 0.47, side * 0.08, 0);
        patella.position.set(sx * 1.22, 0.53, 0.385);
        tibia.position.set(sx * 1.20, 0.30, 0.42);
        tibia.rotation.x = 0.16;
        fibula.position.set(sx * 1.34, 0.30, 0.41);
        fibula.rotation.x = 0.16;
        footGroup.position.set(sx * 1.22, 0.06, 0.46);
        footGroup.rotation.y = side * 0.12;
      } else {
        femur.position.set(sx, 0.68, 0);
        patella.position.set(sx, 0.47, 0.03);
        tibia.position.set(sx, 0.25, 0);
        fibula.position.set(sx * 1.18, 0.25, -0.01);
        footGroup.position.set(sx, 0.03, 0.02);
      }
      legsBones.add(femur, patella, tibia, fibula, footGroup);
    }

    enableShadows(bodyGroup, true, true);
    // Merge each rigid anatomical sub-assembly into a single draw call while keeping all animation pivots!
    mergeStaticGroup(pelvisGroup, false);
    mergeStaticGroup(torsoBones, false);
    mergeStaticGroup(skullBones, false);
    mergeStaticGroup(jawGroup, false);
    mergeStaticGroup(armL, false);
    mergeStaticGroup(armR, false);
    mergeStaticGroup(legsBones, false);

    const web = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), MAT.cobweb);
    web.position.set(-0.18, 0.85, 0.18);
    web.rotation.y = 0.4;
    bodyGroup.add(web);

    let scared = false;
    let scareTimer = 0;

    function update(time, dt, camPos, onScareTrigger) {
      const wp = new THREE.Vector3();
      root.getWorldPosition(wp);
      const dist = wp.distanceTo(camPos);

      if (!scared && dist < 8.5 && dist > 1.8) {
        scared = true;
        scareTimer = 0;
        if (onScareTrigger) onScareTrigger('skeleton', wp);
      }

      if (scared) {
        scareTimer += dt;
        const t = clamp(scareTimer / 1.2, 0, 1);
        glowEyeMat.opacity = 0.95;

        skullGroup.rotation.y = Math.sin(time * 22.0) * 0.18;
        skullGroup.rotation.x = -0.15 + Math.cos(time * 18.0) * 0.1;
        jawGroup.rotation.x = 0.48 + Math.sin(time * 32.0) * 0.22;

        const lunge = Math.sin(t * Math.PI);
        torsoGroup.rotation.x = -0.07 + 0.62 * lunge;
        bodyGroup.position.z = 0.38 * lunge;
        bodyGroup.position.y = (seated ? 0.22 : 0.08) * lunge;
        armL.rotation.x = -1.35 * lunge + Math.sin(time * 25.0) * 0.25;
        armR.rotation.x = -1.35 * lunge + Math.cos(time * 25.0) * 0.25;
      } else {
        jawGroup.rotation.x = 0.10 + Math.max(0, Math.sin(time * 2.5)) * 0.06;
        skullGroup.rotation.z = -0.16;
        skullGroup.rotation.y = 0.12;
      }
    }

    root.userData.update = update;
    root.userData.triggerScareNow = (camPos, onScareTrigger) => {
      if (!scared) {
        scared = true;
        scareTimer = 0;
        const wp = new THREE.Vector3();
        root.getWorldPosition(wp);
        if (onScareTrigger) onScareTrigger('skeleton', wp);
      }
    };
    return root;
  }

  // --------------------------------------------------------------------------
  // 3. TWISTED JACK-O'-LANTERN SCARECROW (Sculpted Tattered Coat & Carved Pumpkin Head)
  // --------------------------------------------------------------------------
  const SCARECROW_COAT_GEO = window.HH.smoothLathe([
    V2(0.44, 0.0),
    V2(0.35, 0.26),
    V2(0.22, 0.56),
    V2(0.17, 0.76),
    V2(0.29, 0.96),
    V2(0.12, 1.06)
  ], 20, 4);
  SCARECROW_COAT_GEO._shared = true;

  function createScarecrowActor() {
    const root = new THREE.Group();
    root.add(PROPS.makeAODecal(1.15, 1.15));

    const postV = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.30, 10), MAT.darkWood);
    postV.position.set(0, 1.15, -0.14);
    const postH = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.38, 10), MAT.darkWood);
    postH.rotation.z = Math.PI * 0.5 + 0.06;
    postH.position.set(0, 1.66, -0.12);
    // Rope lashing at crossbar intersection
    const ropeLash = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 6, 12), MAT.straw);
    ropeLash.position.set(0, 1.66, -0.13);
    root.add(postV, postH, ropeLash);

    const puppet = new THREE.Group();
    puppet.position.set(0, 0.68, 0);
    root.add(puppet);

    // Sculpted tattered Victorian overcoat + waist rope belt + brass buttons + straw hem
    const coat = new THREE.Mesh(SCARECROW_COAT_GEO, MAT.burlap);
    const ropeBelt = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.022, 8, 16), MAT.straw);
    ropeBelt.rotation.x = Math.PI * 0.5;
    ropeBelt.position.y = 0.72;
    const strawTuft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.36, 0.28, 14), MAT.straw);
    strawTuft.position.y = -0.05;
    puppet.add(coat, ropeBelt, strawTuft);

    for (let b = 0; b < 4; b++) {
      const btn = new THREE.Mesh(GEO_ENT.smallJoint, MAT.agedBrass);
      btn.position.set(0, 0.52 + b * 0.11, 0.21 + (b - 1.5) * 0.015);
      puppet.add(btn);
    }

    // Carved Jack-o'-Lantern Head with crooked Witch Hat & Brass Hat Buckle
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.04, 0.04);
    headGroup.rotation.z = 0.18;
    puppet.add(headGroup);

    const pumpkinHead = PROPS.makeJackOLantern(0.88);
    pumpkinHead.position.y = -0.04;
    headGroup.add(pumpkinHead);

    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.025, 18), MAT.darkWood);
    brim.position.y = 0.28;
    brim.rotation.z = -0.12;
    const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.016, 6, 16), MAT.goldTrim);
    hatBand.rotation.x = Math.PI * 0.5;
    hatBand.rotation.y = -0.12;
    hatBand.position.set(0.01, 0.30, 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.48, 14), MAT.darkWood);
    cone.position.set(0.03, 0.51, -0.02);
    cone.rotation.z = -0.22;
    headGroup.add(brim, hatBand, cone);

    const armL = new THREE.Group();
    armL.position.set(-0.24, 0.92, 0);
    const sleeveL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.095, 0.56, 12), MAT.burlap);
    sleeveL.rotation.z = Math.PI * 0.44;
    sleeveL.position.set(-0.25, -0.04, 0);
    const strawHandL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 10), MAT.straw);
    strawHandL.rotation.z = Math.PI * 0.48;
    strawHandL.position.set(-0.54, -0.07, 0);
    armL.add(sleeveL, strawHandL);

    // Gnarled twig claws protruding from straw cuff
    for (let c = -1; c <= 1; c++) {
      const twig = new THREE.Mesh(GEO_ENT.fingerBone, MAT.darkWood);
      twig.scale.set(1.2, 2.2, 1.2);
      twig.position.set(-0.62, -0.08 + c * 0.03, c * 0.03);
      twig.rotation.set(c * 0.25, 0, Math.PI * 0.5 + c * 0.2);
      armL.add(twig);
    }

    const armR = armL.clone();
    armR.position.x = 0.24;
    armR.scale.x = -1;
    puppet.add(armL, armR);

    enableShadows(root, true, true);

    let scared = false;
    let scareTimer = 0;

    function update(time, dt, camPos, onScareTrigger) {
      const wp = new THREE.Vector3();
      root.getWorldPosition(wp);
      const dist = wp.distanceTo(camPos);

      if (!scared && dist < 9.5 && dist > 2.0) {
        scared = true;
        scareTimer = 0;
        if (onScareTrigger) onScareTrigger('scarecrow', wp);
      }

      if (scared) {
        scareTimer += dt;
        const t = clamp(scareTimer / 1.35, 0, 1);
        const lunge = Math.sin(t * Math.PI);

        headGroup.rotation.z = Math.sin(time * 28.0) * 0.45;
        headGroup.rotation.y = Math.cos(time * 20.0) * 0.35;
        puppet.position.z = lunge * 1.15;
        puppet.position.y = 0.68 - lunge * 0.14 + Math.abs(Math.sin(time * 16.0)) * 0.12;
        puppet.rotation.x = lunge * 0.35;

        armL.rotation.y = lunge * 1.15 + Math.sin(time * 22.0) * 0.2;
        armR.rotation.y = -lunge * 1.15 - Math.cos(time * 22.0) * 0.2;
      } else {
        if (Math.sin(time * 3.7) > 0.96) {
          headGroup.rotation.z = 0.24 + rr(-0.15, 0.15);
        }
      }
    }

    root.userData.update = update;
    root.userData.triggerScareNow = (camPos, onScareTrigger) => {
      if (!scared) {
        scared = true;
        scareTimer = 0;
        const wp = new THREE.Vector3();
        root.getWorldPosition(wp);
        if (onScareTrigger) onScareTrigger('scarecrow', wp);
      }
    };
    return root;
  }

  // --------------------------------------------------------------------------
  // 4. VAMPIRE BAT SWARM (Scalloped Wing Membranes & Finger Spars)
  // --------------------------------------------------------------------------
  const batMat = new THREE.MeshStandardMaterial({
    color: 0x16121a,
    roughness: 0.52,
    metalness: 0.12,
    side: THREE.DoubleSide
  });
  const batEyeMat = new THREE.MeshBasicMaterial({ color: 0xff2211 });

  const batWingGeo = new THREE.BufferGeometry();
  const batVerts = new Float32Array([
    // Inner patagium
    0, 0, 0.06,      0.20, 0.045, 0.09,   0.15, 0, -0.09,
    // Mid finger web
    0.20, 0.045, 0.09, 0.36, 0.03, 0.06,  0.29, 0, -0.07,
    0.20, 0.045, 0.09, 0.29, 0, -0.07,    0.15, 0, -0.09,
    // Outer wingtip web
    0.36, 0.03, 0.06,  0.50, 0.00, 0.01,  0.29, 0, -0.07
  ]);
  batWingGeo.setAttribute('position', new THREE.BufferAttribute(batVerts, 3));
  batWingGeo.computeVertexNormals();
  batWingGeo._shared = true;

  function createSingleBat() {
    const bat = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), batMat);
    body.scale.set(0.82, 0.76, 1.42);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), batMat);
    head.position.set(0, 0.025, 0.075);
    bat.add(body, head);

    for (const sx of [-0.026, 0.026]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.062, 4), batMat);
      ear.position.set(sx, 0.068, 0.065);
      ear.rotation.z = -sx * 4.5;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 4, 4), batEyeMat);
      eye.position.set(sx * 0.85, 0.032, 0.108);
      bat.add(ear, eye);
    }

    const wingR = new THREE.Mesh(batWingGeo, batMat);
    const wingL = new THREE.Mesh(batWingGeo, batMat);
    wingL.scale.x = -1;
    bat.add(wingL, wingR);

    bat.scale.setScalar(2.15);
    bat.userData.wingL = wingL;
    bat.userData.wingR = wingR;
    return bat;
  }

  function createBatSwarmActor(count = 9) {
    const root = new THREE.Group();
    const bats = [];
    for (let i = 0; i < count; i++) {
      const b = createSingleBat();
      b.userData.offset = new THREE.Vector3(rr(-3.4, 3.4), rr(-0.9, 0.8), rr(-2.6, 2.6));
      b.userData.phase = rand() * Math.PI * 2;
      b.userData.speed = rr(15, 22);
      b.userData.radius = rr(0.6, 1.8);
      b.position.copy(b.userData.offset);
      root.add(b);
      bats.push(b);
    }

    let swooping = false;
    let swoopTimer = 0;

    function update(time, dt, camPos, onScareTrigger) {
      const wp = new THREE.Vector3();
      root.getWorldPosition(wp);
      const dist = wp.distanceTo(camPos);

      if (!swooping && dist < 13.5 && dist > 2.0) {
        swooping = true;
        swoopTimer = 0;
        if (onScareTrigger) onScareTrigger('bats', wp);
      }

      for (let i = 0; i < bats.length; i++) {
        const b = bats[i];
        const flap = Math.sin(time * b.userData.speed + b.userData.phase) * 0.85;
        b.userData.wingL.rotation.z = -flap;
        b.userData.wingR.rotation.z = flap;

        if (swooping) {
          swoopTimer += dt / bats.length;
          const t = swoopTimer;
          const a = time * 3.8 + b.userData.phase;
          b.position.x = b.userData.offset.x + Math.cos(a) * b.userData.radius;
          b.position.y = lerp(0, -2.35, clamp(t * 0.75, 0, 1)) + Math.sin(time * 6.0 + i) * 0.35;
          b.position.z = b.userData.offset.z + t * 5.8;
          b.rotation.y = Math.sin(a) * 0.4;
        } else {
          const a = time * 1.4 + b.userData.phase;
          b.position.x = b.userData.offset.x + Math.cos(a) * 0.85;
          b.position.y = b.userData.offset.y + Math.sin(a * 2) * 0.18;
          b.position.z = b.userData.offset.z + Math.sin(a) * 0.65;
          b.rotation.y = -a;
        }
      }
    }

    root.userData.update = update;
    root.userData.triggerScareNow = (camPos, onScareTrigger) => {
      if (!swooping) {
        swooping = true;
        swoopTimer = 0;
        const wp = new THREE.Vector3();
        root.getWorldPosition(wp);
        if (onScareTrigger) onScareTrigger('bats', wp);
      }
    };
    return root;
  }

  // --------------------------------------------------------------------------
  // 5. PERCHED RAVEN / CROW (Folded Wings, Fanned Tail Feathers & Talons)
  // --------------------------------------------------------------------------
  function createRavenActor() {
    const root = new THREE.Group();
    const bird = new THREE.Group();
    root.add(bird);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), batMat);
    body.scale.set(0.82, 0.92, 1.55);
    body.rotation.x = -0.38;
    body.position.y = 0.15;
    bird.add(body);

    // Folded side wings & fanned tail feathers
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), batMat);
      wing.scale.set(0.32, 0.72, 1.65);
      wing.position.set(sx * 0.068, 0.15, -0.02);
      wing.rotation.set(-0.42, -sx * 0.12, 0);
      bird.add(wing);

      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.09, 6), MAT.darkIron);
      leg.position.set(sx * 0.036, 0.045, 0.02);
      bird.add(leg);
    }

    for (let f = -1; f <= 1; f++) {
      const feather = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.012, 0.21), batMat);
      feather.position.set(f * 0.026, 0.06, -0.17);
      feather.rotation.set(-0.36, f * 0.14, 0);
      bird.add(feather);
    }

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.25, 0.09);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), batMat);
    const beakUpper = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.10, 6), MAT.darkIron);
    beakUpper.rotation.x = Math.PI * 0.54;
    beakUpper.position.set(0, -0.006, 0.085);
    const beakLower = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.082, 5), MAT.darkIron);
    beakLower.rotation.x = Math.PI * 0.48;
    beakLower.position.set(0, -0.020, 0.075);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), batEyeMat);
    eyeL.position.set(-0.045, 0.015, 0.032);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.045;
    headGroup.add(head, beakUpper, beakLower, eyeL, eyeR);
    bird.add(headGroup);

    enableShadows(bird, true, true);

    let startled = false;
    let flyTimer = 0;

    function update(time, dt, camPos) {
      const wp = new THREE.Vector3();
      root.getWorldPosition(wp);
      const dist = wp.distanceTo(camPos);

      if (!startled && dist < 5.5) {
        startled = true;
        flyTimer = 0;
        if (window.HH.AUDIO) window.HH.AUDIO.playScareSFX('raven');
      }

      if (startled) {
        flyTimer += dt;
        bird.position.y = flyTimer * 2.8 + Math.sin(time * 28.0) * 0.08;
        bird.position.z = flyTimer * 2.2;
        bird.position.x = Math.sin(flyTimer * 5.0) * 0.8;
      } else {
        headGroup.rotation.y = Math.sin(time * 3.1) > 0.4 ? 0.45 : -0.35;
        headGroup.rotation.z = Math.cos(time * 4.7) * 0.22;
      }
    }

    root.userData.update = update;
    return root;
  }

  // --------------------------------------------------------------------------
  // 6. HAUNTED GOTHIC MAXIMILIAN SUIT OF ARMOR (Articulated Plate, Visor & Halberd)
  // --------------------------------------------------------------------------
  function createArmorActor() {
    const root = new THREE.Group();
    root.add(PROPS.makeAODecal(1.15, 1.15));

    const armorStatic = new THREE.Group();
    root.add(armorStatic);

    // Stepped Octagonal Pedestal Plinth with Gilded Trim
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.20, 8), MAT.darkWood);
    plinth.position.y = 0.10;
    const plinthTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.47, 0.04, 8), MAT.goldTrim);
    plinthTrim.position.y = 0.21;
    armorStatic.add(plinth, plinthTrim);

    // --- A. Two Distinct Armored Legs (Sabatons, Greaves, Poleyns & Cuisses) ---
    for (const sx of [-0.135, 0.135]) {
      const legGroup = new THREE.Group();
      legGroup.position.set(sx, 0.22, 0);

      // Pointed Gothic Sabaton (Armored Boot)
      const sabaton = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.22, 6), MAT.darkIron);
      sabaton.rotation.x = Math.PI * 0.5;
      sabaton.scale.y = 0.65;
      sabaton.position.set(0, 0.038, 0.065);

      // Lathe-turned Greave (Shin Armor)
      const greave = new THREE.Mesh(GEO_ENT.armorGreave, MAT.darkIron);
      greave.position.y = 0.04;

      // Fluted Poleyn (Knee Cop with Side Fan Wing & Gold Trim)
      const poleyn = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), MAT.darkIron);
      poleyn.scale.set(0.95, 1.1, 1.15);
      poleyn.position.set(0, 0.46, 0.025);
      const poleynRing = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.009, 6, 12), MAT.goldTrim);
      poleynRing.rotation.x = Math.PI * 0.5;
      poleynRing.position.set(0, 0.46, 0.01);

      // Cuisse (Thigh Plate)
      const cuisse = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.068, 0.36, 12), MAT.darkIron);
      cuisse.position.set(0, 0.66, 0);

      legGroup.add(sabaton, greave, poleyn, poleynRing, cuisse);
      armorStatic.add(legGroup);
    }

    // --- B. Waist Fauld, Fluted Tassets & Sculpted Peascod Cuirass ---
    const tassetSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.22, 12), MAT.darkIron);
    tassetSkirt.position.y = 1.06;
    armorStatic.add(tassetSkirt);

    for (const sx of [-0.12, 0.12]) {
      const tassetPlate = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.035), MAT.darkIron);
      tassetPlate.position.set(sx, 1.04, 0.16);
      tassetPlate.rotation.set(-0.18, sx * 0.25, 0);
      const tassetTrim = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.022, 0.04), MAT.goldTrim);
      tassetTrim.position.set(sx, 0.94, 0.175);
      tassetTrim.rotation.copy(tassetPlate.rotation);
      armorStatic.add(tassetPlate, tassetTrim);
    }

    const cuirass = new THREE.Mesh(GEO_ENT.armorCuirass, MAT.darkIron);
    cuirass.scale.z = 0.86;
    cuirass.position.y = 1.12;
    const beltGold = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.016, 8, 18), MAT.goldTrim);
    beltGold.rotation.x = Math.PI * 0.5;
    beltGold.scale.y = 0.88;
    beltGold.position.y = 1.18;
    armorStatic.add(cuirass, beltGold);

    // --- C. Multi-Lame Pauldrons, Vambraces & Broadsword at Left Hip ---
    for (const side of [-1, 1]) {
      const sx = side * 0.27;
      for (let l = 0; l < 3; l++) {
        const lame = new THREE.Mesh(new THREE.SphereGeometry(0.115 - l * 0.012, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), MAT.darkIron);
        lame.position.set(sx, 1.68 - l * 0.055, 0);
        lame.rotation.z = -side * (0.35 + l * 0.15);
        armorStatic.add(lame);
      }
      const hautePiece = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.11, 0.16), MAT.goldTrim);
      hautePiece.position.set( side * 0.20, 1.75, 0);
      hautePiece.rotation.z = -side * 0.18;
      armorStatic.add(hautePiece);
    }

    // Left Arm resting on sheathed Gothic Broadsword
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.48, 10), MAT.darkIron);
    armL.position.set(-0.29, 1.38, 0.06);
    armL.rotation.set(0.32, 0, 0.15);
    const swordScabbard = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.014, 0.92, 8), MAT.darkWood);
    swordScabbard.position.set(-0.26, 0.82, -0.04);
    swordScabbard.rotation.x = -0.28;
    const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.024, 0.032), MAT.goldTrim);
    crossguard.position.set(-0.26, 1.24, 0.08);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), MAT.goldTrim);
    pommel.position.set(-0.26, 1.38, 0.12);
    armorStatic.add(armL, swordScabbard, crossguard, pommel);

    // --- D. Gothic Close-Helm with Fluted Comb, Pointed Bellows Visor & Glowing Slit ---
    const helmGroup = new THREE.Group();
    helmGroup.position.set(0, 1.74, 0);
    const helm = new THREE.Mesh(GEO_ENT.armorHelm, MAT.darkIron);
    const helmComb = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.018, 6, 14, Math.PI), MAT.goldTrim);
    helmComb.rotation.y = Math.PI * 0.5;
    helmComb.position.set(0, 0.25, 0);
    const visorProw = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.18, 4), MAT.darkIron);
    visorProw.rotation.x = Math.PI * 0.5;
    visorProw.rotation.z = Math.PI * 0.25;
    visorProw.scale.set(1.0, 1.0, 0.72);
    visorProw.position.set(0, 0.16, 0.12);
    const visorGlow = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.022, 0.06), batEyeMat);
    visorGlow.position.set(0, 0.205, 0.135);
    helmGroup.add(helm, helmComb, visorProw, visorGlow);
    root.add(helmGroup);

    // --- E. Right Arm & Ornate Gothic Halberd Pivot ---
    const halberdPivot = new THREE.Group();
    halberdPivot.position.set(0.29, 1.55, 0.05);

    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.44, 10), MAT.darkIron);
    armR.position.set(0, -0.14, 0.04);
    armR.rotation.x = 0.35;

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 2.38, 10), MAT.darkWood);
    pole.position.y = 0.15;

    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.42, 6), MAT.darkIron);
    spearTip.position.set(0, 1.48, 0);

    const axeBlade = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 4, 12, Math.PI * 0.85), MAT.darkIron);
    axeBlade.scale.set(0.85, 1.15, 0.18);
    axeBlade.position.set(-0.04, 1.08, 0);
    axeBlade.rotation.z = Math.PI * 0.58;

    const rearFluke = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.20, 4), MAT.darkIron);
    rearFluke.rotation.z = -Math.PI * 0.55;
    rearFluke.position.set(0.11, 1.08, 0);

    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.16, 10), MAT.velvetDrape);
    tassel.position.set(0, 0.88, 0);
    const collarGold = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.010, 6, 12), MAT.goldTrim);
    collarGold.rotation.x = Math.PI * 0.5;
    collarGold.position.set(0, 0.96, 0);

    halberdPivot.add(armR, pole, spearTip, axeBlade, rearFluke, tassel, collarGold);
    root.add(halberdPivot);

    enableShadows(root, true, true);
    mergeStaticGroup(armorStatic, false);
    mergeStaticGroup(helmGroup, false);
    mergeStaticGroup(halberdPivot, false);

    let swung = false;
    let swingTimer = 0;

    function update(time, dt, camPos, onScareTrigger) {
      const wp = new THREE.Vector3();
      root.getWorldPosition(wp);
      const dist = wp.distanceTo(camPos);

      if (!swung && dist < 7.5 && dist > 1.5) {
        swung = true;
        swingTimer = 0;
        if (onScareTrigger) onScareTrigger('armor', wp);
      }

      if (swung) {
        swingTimer += dt;
        const s = Math.sin(clamp(swingTimer / 0.85, 0, 1) * Math.PI);
        halberdPivot.rotation.x = s * 1.45;
        halberdPivot.rotation.z = s * 0.35;
        helmGroup.rotation.y = -s * 0.32;
      }
    }

    root.userData.update = update;
    return root;
  }

  window.HH.ENTITIES = {
    createGhostActor,
    createSkeletonActor,
    createScarecrowActor,
    createBatSwarmActor,
    createRavenActor,
    createArmorActor
  };
})();
