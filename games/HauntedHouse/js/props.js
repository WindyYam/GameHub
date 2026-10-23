// ============================================================================
// HAUNTED HOUSE — HIGH-DETAIL 3D ARCHITECTURAL PROPS, LATHE MOLDINGS & SHADOWS
// ============================================================================
(() => {
  'use strict';
  const { rand, rr, MAT, TEX, candleFlameMat, candleCoronaMat, volumetricBeamMat, enableShadows, mergeStaticGroup } = window.HH;

  const V2 = (x, y) => new THREE.Vector2(x, y);
  const PREFABS = {
    columns: new Map()
  };

  // Pre-created shared portrait canvas materials (avoids runtime material/shader compilation)
  const PORTRAIT_MATS = TEX.portraits.map(tex => new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(0x523418),
    emissiveIntensity: 0.36,
    normalMap: TEX.velvetNormal,
    normalScale: new THREE.Vector2(0.08, 0.08),
    roughness: 0.44,
    metalness: 0.04,
    userData: { ssr: 0.0 }
  }));

  // Shared high-detail Lathe & Buffer Geometries
  const GEO = {
    candleBody: new THREE.CylinderGeometry(0.026, 0.031, 0.26, 14),
    candleRim: new THREE.TorusGeometry(0.022, 0.0055, 6, 14),
    candleWick: new THREE.CylinderGeometry(0.0022, 0.003, 0.028, 6),
    waxDrip: new THREE.CylinderGeometry(0.0032, 0.0055, 0.11, 6),
    waxBead: new THREE.SphereGeometry(0.0062, 6, 6),
    flamePlane: new THREE.PlaneGeometry(0.085, 0.18, 1, 4),
    coronaPlane: new THREE.PlaneGeometry(0.34, 0.34),
    cup: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.020, 0.0), V2(0.014, 0.010), V2(0.032, 0.018),
      V2(0.068, 0.028), V2(0.072, 0.038), V2(0.052, 0.044), V2(0.028, 0.036),
      V2(0.032, 0.056), V2(0.024, 0.058)
    ], 16, 4),
    crystalDrop: new THREE.ConeGeometry(0.018, 0.068, 6),
    crystalBead: new THREE.OctahedronGeometry(0.012, 0),
    candelabraStem: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.35, 0.0), V2(0.34, 0.045), V2(0.28, 0.08),
      V2(0.25, 0.14), V2(0.22, 0.22), V2(0.095, 0.34), V2(0.145, 0.44),
      V2(0.062, 0.56), V2(0.082, 0.76), V2(0.046, 0.98), V2(0.115, 1.16),
      V2(0.052, 1.30), V2(0.072, 1.52), V2(0.040, 1.76), V2(0.092, 1.90),
      V2(0.038, 2.04)
    ], 24, 5),
    chandelierSpindle: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.018, 0.05), V2(0.095, 0.18), V2(0.042, 0.28),
      V2(0.21, 0.44), V2(0.16, 0.56), V2(0.055, 0.66), V2(0.135, 0.78),
      V2(0.048, 0.90), V2(0.095, 1.02), V2(0.032, 1.14)
    ], 24, 5),
    canopyRose: window.HH.smoothLathe([
      V2(0.03, 0.0), V2(0.09, 0.04), V2(0.18, 0.09), V2(0.22, 0.12), V2(0.0, 0.12)
    ], 18, 4),
    columnShaft: new THREE.CylinderGeometry(0.25, 0.29, 4.65, 24),
    columnBaseLathe: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.41, 0.0), V2(0.41, 0.12), V2(0.36, 0.18),
      V2(0.39, 0.24), V2(0.31, 0.31), V2(0.35, 0.37), V2(0.29, 0.42)
    ], 24, 4),
    columnCapLathe: window.HH.smoothLathe([
      V2(0.25, 0.0), V2(0.29, 0.05), V2(0.26, 0.12), V2(0.32, 0.24),
      V2(0.39, 0.36), V2(0.45, 0.45), V2(0.46, 0.48), V2(0.0, 0.48)
    ], 24, 4),
    balusterLathe: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.054, 0.0), V2(0.050, 0.07), V2(0.028, 0.15),
      V2(0.064, 0.30), V2(0.056, 0.44), V2(0.024, 0.60), V2(0.045, 0.72),
      V2(0.050, 0.84), V2(0.0, 0.84)
    ], 16, 5),
    chairLegLathe: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.032, 0.015), V2(0.044, 0.045), V2(0.022, 0.09),
      V2(0.030, 0.17), V2(0.056, 0.27), V2(0.062, 0.33), V2(0.042, 0.38),
      V2(0.052, 0.42), V2(0.0, 0.42)
    ], 16, 5),
    chairArmPost: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.042, 0.0), V2(0.026, 0.06), V2(0.048, 0.14),
      V2(0.024, 0.22), V2(0.038, 0.28), V2(0.0, 0.28)
    ], 14, 4),
    chairFinial: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.044, 0.0), V2(0.026, 0.04), V2(0.050, 0.095),
      V2(0.038, 0.145), V2(0.014, 0.18), V2(0.0, 0.195)
    ], 14, 4),
    tuftButton: new THREE.SphereGeometry(0.016, 8, 8),
    nailStud: new THREE.SphereGeometry(0.0085, 6, 6),
    tablePedestal: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.32, 0.0), V2(0.29, 0.05), V2(0.14, 0.14),
      V2(0.068, 0.28), V2(0.125, 0.42), V2(0.058, 0.56), V2(0.095, 0.66),
      V2(0.20, 0.74)
    ], 24, 5),
    tableOutriggerLeg: window.HH.smoothLathe([
      V2(0.0, 0.0), V2(0.028, 0.02), V2(0.018, 0.12), V2(0.036, 0.24),
      V2(0.022, 0.38), V2(0.034, 0.52), V2(0.020, 0.64), V2(0.038, 0.73), V2(0.0, 0.73)
    ], 12, 4),
    aoPlane: new THREE.PlaneGeometry(1, 1)
  };
  GEO.flamePlane.translate(0, 0.09, 0);
  GEO.crystalDrop.rotateX(Math.PI);
  Object.values(GEO).forEach(g => { g._shared = true; });

  function makeAODecal(width, depth, y = 0.008) {
    const m = new THREE.Mesh(GEO.aoPlane, MAT.aoDecal);
    m.rotation.x = -Math.PI * 0.5;
    m.scale.set(width, depth, 1);
    m.position.y = y;
    return m;
  }

  function makeCrystalPendant() {
    const g = new THREE.Group();
    const bead = new THREE.Mesh(GEO.crystalBead, MAT.crystalDrop);
    bead.position.y = -0.014;
    const drop = new THREE.Mesh(GEO.crystalDrop, MAT.crystalDrop);
    drop.position.y = -0.062;
    g.add(bead, drop);
    return g;
  }

  function createSingleCandle(heightScale = 1.0) {
    const g = new THREE.Group();
    const topY = 0.26 * heightScale;

    const wax = new THREE.Mesh(GEO.candleBody, MAT.candleWax);
    wax.scale.y = heightScale;
    wax.position.y = 0.13 * heightScale;
    wax.castShadow = true;
    g.add(wax);

    // Melted top crater rim
    const rim = new THREE.Mesh(GEO.candleRim, MAT.candleWax);
    rim.rotation.x = Math.PI * 0.5;
    rim.position.y = topY;
    g.add(rim);

    // Organic wax drips running down the sides
    for (let d = 0; d < 2; d++) {
      const a = d * Math.PI * 0.85 + 0.4;
      const dripLen = (d === 0 ? 1.0 : 0.68) * heightScale;
      const drip = new THREE.Mesh(GEO.waxDrip, MAT.candleWax);
      drip.scale.y = dripLen;
      drip.position.set(Math.cos(a) * 0.026, topY - 0.055 * dripLen, Math.sin(a) * 0.026);
      const bead = new THREE.Mesh(GEO.waxBead, MAT.candleWax);
      bead.position.set(Math.cos(a) * 0.027, topY - 0.11 * dripLen, Math.sin(a) * 0.027);
      g.add(drip, bead);
    }

    // Charred candle wick
    const wick = new THREE.Mesh(GEO.candleWick, MAT.darkIron);
    wick.position.y = topY + 0.012;
    g.add(wick);

    const phase = rand();
    for (let i = 0; i < 2; i++) {
      const fg = GEO.flamePlane.clone();
      const count = fg.attributes.position.count;
      const phases = new Float32Array(count).fill(phase);
      fg.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      const fm = new THREE.Mesh(fg, candleFlameMat);
      fm.position.y = topY + 0.008;
      fm.rotation.y = i * (Math.PI * 0.5) + rr(-0.2, 0.2);
      g.add(fm);
    }

    // Atmospheric warm golden scattering halo billboard
    const coronaGeo = GEO.coronaPlane.clone();
    const cPhases = new Float32Array(coronaGeo.attributes.position.count).fill(phase);
    coronaGeo.setAttribute('aPhase', new THREE.BufferAttribute(cPhases, 1));
    const coronaMesh = new THREE.Mesh(coronaGeo, candleCoronaMat || candleFlameMat);
    coronaMesh.position.y = topY + 0.055;
    g.add(coronaMesh);

    return g;
  }

  // 1. TALL ORNATE BRASS FLOOR CANDELABRA (Baroque Tripod Base, Lathe Stem, Scrolled Arms & Crystal Drops)
  function makeFloorCandelabra() {
    if (PREFABS.floorCandelabra) return PREFABS.floorCandelabra.clone();
    const root = new THREE.Group();
    root.add(makeAODecal(1.05, 1.05));

    const stem = new THREE.Mesh(GEO.candelabraStem, MAT.agedBrass);
    stem.castShadow = true;
    stem.receiveShadow = true;
    root.add(stem);

    // 3 Baroque S-Scrolled Lion-Paw Tripod Feet around base
    const footAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
    for (const fa of footAngles) {
      const footGroup = new THREE.Group();
      footGroup.rotation.y = -fa;
      const scrollLeg = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.024, 8, 16, Math.PI * 0.95), MAT.goldTrim);
      scrollLeg.position.set(0.24, 0.13, 0);
      scrollLeg.rotation.z = -0.35;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), MAT.goldTrim);
      paw.scale.set(1.35, 0.65, 1.1);
      paw.position.set(0.36, 0.022, 0);
      const kneeBoss = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), MAT.goldTrim);
      kneeBoss.position.set(0.19, 0.25, 0);
      footGroup.add(scrollLeg, paw, kneeBoss);
      root.add(footGroup);
    }

    // Gold decorative collars on the stem
    for (const cy of [0.44, 1.16, 1.90]) {
      const rCol = cy < 0.6 ? 0.148 : (cy < 1.3 ? 0.118 : 0.095);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rCol, 0.016, 8, 18), MAT.goldTrim);
      ring.rotation.x = Math.PI * 0.5;
      ring.position.y = cy;
      root.add(ring);
    }

    const topCup = new THREE.Mesh(GEO.cup, MAT.goldTrim);
    topCup.position.y = 2.04;
    root.add(topCup);
    const cTop = createSingleCandle(1.18);
    cTop.position.y = 2.08;
    root.add(cTop);

    for (let tier = 0; tier < 2; tier++) {
      const yArm = tier === 0 ? 1.70 : 1.88;
      const radArm = tier === 0 ? 0.38 : 0.24;
      const rotOffset = tier * (Math.PI / 3);
      for (const a0 of footAngles) {
        const a = a0 + rotOffset;
        const arm = new THREE.Mesh(new THREE.TorusGeometry(radArm * 0.54, 0.015, 8, 16, Math.PI * 1.12), MAT.agedBrass);
        arm.position.set(Math.cos(a) * radArm * 0.5, yArm, Math.sin(a) * radArm * 0.5);
        arm.rotation.y = -a;
        arm.rotation.z = Math.PI;
        root.add(arm);

        // Secondary Baroque counter-scroll curl under each arm
        const curl = new THREE.Mesh(new THREE.TorusGeometry(radArm * 0.24, 0.010, 6, 12, Math.PI * 1.35), MAT.goldTrim);
        curl.position.set(Math.cos(a) * radArm * 0.34, yArm - 0.12, Math.sin(a) * radArm * 0.34);
        curl.rotation.y = -a;
        root.add(curl);

        const cx = Math.cos(a) * radArm;
        const cz = Math.sin(a) * radArm;
        const cup = new THREE.Mesh(GEO.cup, MAT.goldTrim);
        cup.position.set(cx, yArm + 0.04, cz);
        root.add(cup);

        const drop = makeCrystalPendant();
        drop.position.set(cx, yArm + 0.05, cz);
        root.add(drop);

        const candle = createSingleCandle(rr(0.88, 1.12));
        candle.position.set(cx, yArm + 0.08, cz);
        root.add(candle);
      }
    }

    enableShadows(root, true, true);
    PREFABS.floorCandelabra = mergeStaticGroup(root, true);
    return PREFABS.floorCandelabra.clone();
  }

  // 2. GRAND HANGING DUTCH/VICTORIAN BRASS CHANDELIER (2 Tiers, 12 Candles, Scrolls & Crystal Prisms)
  function makeChandelier() {
    if (PREFABS.chandelier) return PREFABS.chandelier.clone();
    const root = new THREE.Group();

    // Ceiling Canopy Rose & Linked Chain
    const canopy = new THREE.Mesh(GEO.canopyRose, MAT.goldTrim);
    canopy.position.y = -0.12;
    root.add(canopy);

    for (let l = 0; l < 9; l++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 10), MAT.agedBrass);
      link.scale.y = 1.45;
      link.position.y = -0.16 - l * 0.068;
      link.rotation.y = (l % 2) * (Math.PI * 0.5);
      root.add(link);
    }

    // Lathe-turned Baroque Chandelier Spindle Body
    const spindle = new THREE.Mesh(GEO.chandelierSpindle, MAT.goldTrim);
    spindle.position.y = -1.90;
    root.add(spindle);

    // Lower tier (8 arms) + Upper tier (4 arms)
    const tiers = [
      { count: 8, rad: 0.74, y: -1.52 },
      { count: 4, rad: 0.46, y: -1.18 }
    ];
    for (const t of tiers) {
      for (let i = 0; i < t.count; i++) {
        const a = (i / t.count) * Math.PI * 2 + (t.count === 4 ? 0.39 : 0);
        const r = t.rad;
        const arm = new THREE.Mesh(new THREE.TorusGeometry(r * 0.52, 0.015, 8, 16, Math.PI * 1.10), MAT.goldTrim);
        arm.position.set(Math.cos(a) * r * 0.5, t.y, Math.sin(a) * r * 0.5);
        arm.rotation.y = -a;
        arm.rotation.z = Math.PI;
        root.add(arm);

        // Upper decorative scroll volute on each chandelier arm
        const volute = new THREE.Mesh(new THREE.TorusGeometry(r * 0.22, 0.009, 6, 12, Math.PI * 1.4), MAT.agedBrass);
        volute.position.set(Math.cos(a) * r * 0.42, t.y + 0.09, Math.sin(a) * r * 0.42);
        volute.rotation.y = -a;
        root.add(volute);

        const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
        const cup = new THREE.Mesh(GEO.cup, MAT.goldTrim);
        cup.position.set(cx, t.y + 0.035, cz);
        root.add(cup);

        const drop = makeCrystalPendant();
        drop.position.set(cx, t.y + 0.045, cz);
        root.add(drop);

        const candle = createSingleCandle(0.94);
        candle.position.set(cx, t.y + 0.075, cz);
        root.add(candle);
      }
    }

    for (let i = 0; i < 3; i++) {
      const web = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.54), MAT.cobweb);
      const a = (i / 3) * Math.PI * 2 + 0.4;
      web.position.set(Math.cos(a) * 0.36, -1.58, Math.sin(a) * 0.36);
      web.rotation.y = -a + Math.PI * 0.5;
      root.add(web);
    }

    PREFABS.chandelier = mergeStaticGroup(root, true);
    return PREFABS.chandelier.clone();
  }

  // 3. TWIN-CANDLE GILDED BAROQUE WALL SCONCE
  function makeWallSconce() {
    if (PREFABS.wallSconce) return PREFABS.wallSconce.clone();
    const root = new THREE.Group();

    // Sculpted Baroque Cartouche Backplate with Beaded Rim, Shell Crest & Finial Drop
    const backplate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.032, 16), MAT.goldTrim);
    backplate.rotation.x = Math.PI * 0.5;
    backplate.scale.set(1.0, 1.0, 1.72);
    backplate.castShadow = true;

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.016, 8, 18), MAT.agedBrass);
    rim.scale.y = 1.72;
    rim.position.z = 0.015;

    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), MAT.goldTrim);
    boss.scale.set(0.85, 1.35, 0.45);
    boss.position.z = 0.018;

    const topCrest = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 7), MAT.goldTrim);
    topCrest.scale.z = 0.4;
    topCrest.position.set(0, 0.25, 0.015);

    const botFinial = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.14, 8), MAT.agedBrass);
    botFinial.rotation.x = Math.PI;
    botFinial.position.set(0, -0.26, 0.015);

    root.add(backplate, rim, boss, topCrest, botFinial);

    for (const sx of [-0.145, 0.145]) {
      const arm = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 7, 14, Math.PI * 0.92), MAT.agedBrass);
      arm.position.set(sx * 0.72, -0.02, 0.12);
      arm.rotation.y = Math.PI * 0.5 - sx * 1.08;
      arm.rotation.z = Math.PI;
      root.add(arm);

      const scrollUnder = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.009, 6, 10, Math.PI * 1.25), MAT.goldTrim);
      scrollUnder.position.set(sx * 0.45, -0.10, 0.09);
      scrollUnder.rotation.y = Math.PI * 0.5 - sx * 1.08;
      root.add(scrollUnder);

      const cup = new THREE.Mesh(GEO.cup, MAT.goldTrim);
      cup.position.set(sx, 0.015, 0.245);
      root.add(cup);

      const drop = makeCrystalPendant();
      drop.position.set(sx, 0.025, 0.245);
      root.add(drop);

      const candle = createSingleCandle(0.86);
      candle.position.set(sx, 0.05, 0.245);
      root.add(candle);
    }
    PREFABS.wallSconce = mergeStaticGroup(root, true);
    return PREFABS.wallSconce.clone();
  }

  // 4. CARVED GLOWING JACK-O'-LANTERN (Sculpted Ribs, Twisted Vine Stem, Tendril & Carved Features)
  function makeJackOLantern(scale = 1.0) {
    if (!PREFABS.jackOLantern) {
      const root = new THREE.Group();
      root.add(makeAODecal(0.56, 0.56, 0.005));

      const lobes = 14;
      for (let i = 0; i < lobes; i++) {
        const a = (i / lobes) * Math.PI * 2;
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), MAT.pumpkinRind);
        lobe.scale.set(0.56, 0.87, 0.78);
        lobe.position.set(Math.cos(a) * 0.086, 0.19, Math.sin(a) * 0.086);
        lobe.rotation.y = -a;
        lobe.castShadow = false;
        lobe.receiveShadow = true;
        root.add(lobe);
      }

      // Inner glowing core inside the pumpkin
      const innerCore = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 10), MAT.pumpkinGlow);
      innerCore.scale.set(0.95, 0.82, 0.95);
      innerCore.position.set(0, 0.19, 0.02);
      root.add(innerCore);

      // Multi-segment twisted woody pumpkin stem + curling vine tendril
      const stemBase = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.058, 0.07, 8), MAT.darkWood);
      stemBase.position.set(0, 0.36, 0);
      stemBase.rotation.z = 0.14;
      const stemTip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 8), MAT.darkWood);
      stemTip.position.set(-0.022, 0.43, 0.01);
      stemTip.rotation.set(0.15, 0, 0.42);
      const tendril = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, 6, 12, Math.PI * 1.45), MAT.darkWood);
      tendril.position.set(0.055, 0.37, 0.02);
      tendril.rotation.set(0.4, 0.2, -0.3);
      root.add(stemBase, stemTip, tendril);

      const eyeGeo = new THREE.ConeGeometry(0.058, 0.085, 3);
      const eyeL = new THREE.Mesh(eyeGeo, MAT.pumpkinGlow);
      eyeL.position.set(-0.082, 0.242, 0.238);
      eyeL.rotation.set(0.2, 0, -0.16);
      const eyeR = new THREE.Mesh(eyeGeo, MAT.pumpkinGlow);
      eyeR.position.set(0.082, 0.242, 0.238);
      eyeR.rotation.set(0.2, 0, 0.16);

      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.050, 3), MAT.pumpkinGlow);
      nose.position.set(0, 0.182, 0.254);

      for (let i = -4; i <= 4; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.046, 0.042), MAT.pumpkinGlow);
        const arch = Math.abs(i) * 0.011;
        const zig = (i % 2 === 0) ? 0.011 : -0.011;
        tooth.position.set(i * 0.027, 0.104 + arch + zig, 0.240 - Math.abs(i) * 0.011);
        tooth.rotation.y = i * 0.10;
        root.add(tooth);
      }

      root.add(eyeL, eyeR, nose);
      PREFABS.jackOLantern = mergeStaticGroup(root, true);
    }
    const inst = PREFABS.jackOLantern.clone();
    inst.scale.setScalar(scale);
    return inst;
  }

  // 5. MULTI-MOLDED BAROQUE PORTRAIT FRAME WITH CORNER CARTOUCHES & REMBRANDT OIL PAINTING
  function makeHauntedPortrait(portraitIdx = 0, scale = 1.0) {
    const w = 1.38, h = 2.02;
    if (!PREFABS.portraitFrame) {
      const frameRoot = new THREE.Group();
      const backBoard = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), MAT.darkWood);
      backBoard.castShadow = false;
      backBoard.receiveShadow = true;
      frameRoot.add(backBoard);

      const bThick = 0.14, bDepth = 0.115;
      const topB = new THREE.Mesh(new THREE.BoxGeometry(w + bThick * 2, bThick, bDepth), MAT.goldTrim);
      topB.position.set(0, h * 0.5 + bThick * 0.5, 0.035);
      const botB = topB.clone();
      botB.position.y = -h * 0.5 - bThick * 0.5;
      const leftB = new THREE.Mesh(new THREE.BoxGeometry(bThick, h, bDepth), MAT.goldTrim);
      leftB.position.set(-w * 0.5 - bThick * 0.5, 0, 0.035);
      const rightB = leftB.clone();
      rightB.position.x = w * 0.5 + bThick * 0.5;

      const oThick = 0.042;
      const topO = new THREE.Mesh(new THREE.BoxGeometry(w + bThick * 2.1, oThick, bDepth * 1.18), MAT.agedBrass);
      topO.position.set(0, h * 0.5 + bThick * 0.82, 0.042);
      const botO = topO.clone();
      botO.position.y = -h * 0.5 - bThick * 0.82;
      const leftO = new THREE.Mesh(new THREE.BoxGeometry(oThick, h + bThick * 1.6, bDepth * 1.18), MAT.agedBrass);
      leftO.position.set(-w * 0.5 - bThick * 0.82, 0, 0.042);
      const rightO = leftO.clone();
      rightO.position.x = w * 0.5 + bThick * 0.82;

      const iThick = 0.045;
      const topI = new THREE.Mesh(new THREE.BoxGeometry(w + iThick * 2, iThick, bDepth * 0.72), MAT.agedBrass);
      topI.position.set(0, h * 0.5 + iThick * 0.3, 0.03);
      const botI = topI.clone();
      botI.position.y = -h * 0.5 - iThick * 0.3;
      const leftI = new THREE.Mesh(new THREE.BoxGeometry(iThick, h, bDepth * 0.72), MAT.agedBrass);
      leftI.position.set(-w * 0.5 - iThick * 0.3, 0, 0.03);
      const rightI = leftI.clone();
      rightI.position.x = w * 0.5 + iThick * 0.3;

      const cornerGeos = [];
      for (const cx of [-1, 1]) {
        for (const cy of [-1, 1]) {
          const cBoss = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), MAT.goldTrim);
          cBoss.scale.set(1.2, 1.2, 0.55);
          cBoss.position.set(cx * (w * 0.5 + bThick * 0.52), cy * (h * 0.5 + bThick * 0.52), 0.075);
          const cRing = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.022, 6, 12), MAT.agedBrass);
          cRing.position.copy(cBoss.position);
          cRing.position.z += 0.015;
          cornerGeos.push(cBoss, cRing);
        }
      }
      const crestMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 14), MAT.goldTrim);
      crestMedallion.rotation.x = Math.PI * 0.5;
      crestMedallion.scale.set(1.45, 1.0, 0.85);
      crestMedallion.position.set(0, h * 0.5 + bThick * 0.95, 0.072);

      [topB, botB, leftB, rightB, topO, botO, leftO, rightO, topI, botI, leftI, rightI, crestMedallion, ...cornerGeos].forEach(m => {
        m.castShadow = false;
        m.receiveShadow = true;
        frameRoot.add(m);
      });

      const web = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.68), MAT.cobweb);
      web.position.set(-w * 0.36, h * 0.36, 0.082);
      frameRoot.add(web);

      PREFABS.portraitFrame = mergeStaticGroup(frameRoot, true);
      PREFABS.portraitCanvasGeo = new THREE.PlaneGeometry(w, h);
      PREFABS.portraitCanvasGeo._shared = true;
      PREFABS.portraitEyeGeo = new THREE.CircleGeometry(0.0045, 8);
      PREFABS.portraitEyeGeo._shared = true;
    }

    const root = PREFABS.portraitFrame.clone();
    const canvasMat = PORTRAIT_MATS[portraitIdx % PORTRAIT_MATS.length];
    const canvasMesh = new THREE.Mesh(PREFABS.portraitCanvasGeo, canvasMat);
    canvasMesh.position.z = 0.025;
    canvasMesh.receiveShadow = true;
    root.add(canvasMesh);

    const eyeMat = new THREE.MeshBasicMaterial({
      color: portraitIdx % 2 === 0 ? 0xffaa44 : 0xff4820,
      transparent: true,
      opacity: 0.0
    });
    const eyeL = new THREE.Mesh(PREFABS.portraitEyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(PREFABS.portraitEyeGeo, eyeMat);
    eyeL.position.set(-w * 0.046, h * 0.255, 0.028);
    eyeR.position.set(w * 0.046, h * 0.255, 0.028);
    root.add(eyeL, eyeR);

    root.scale.setScalar(scale);
    root.userData.eyeMat = eyeMat;
    return root;
  }

  // 6. TALL GOTHIC ARCHED MOONLIT WINDOW WITH 3D TRACERY & PLEATED VELVET DRAPES
  function makeGothicWindow() {
    if (PREFABS.gothicWindow) return PREFABS.gothicWindow.clone();
    const root = new THREE.Group();
    const w = 2.2, h = 3.8;

    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MAT.windowMoon);
    root.add(pane);

    // 3D Gothic Window Mullions, Transoms & Upper Rose Tracery
    for (let i = 1; i <= 3; i++) {
      const mx = -w * 0.5 + (w * i) / 4;
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.042, h * 0.96, 0.06), MAT.darkWood);
      mullion.position.set(mx, 0, 0.03);
      root.add(mullion);
    }
    for (let j = 1; j <= 4; j++) {
      const ty = -h * 0.5 + (h * j) / 6;
      const transom = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.038, 0.055), MAT.darkWood);
      transom.position.set(0, ty, 0.028);
      root.add(transom);
    }
    const archTracery = new THREE.Mesh(new THREE.TorusGeometry(w * 0.46, 0.045, 8, 24, Math.PI), MAT.darkWood);
    archTracery.position.set(0, h * 0.22, 0.038);
    const roseRing = new THREE.Mesh(new THREE.TorusGeometry(w * 0.17, 0.028, 8, 18), MAT.darkWood);
    roseRing.position.set(0, h * 0.31, 0.038);
    root.add(archTracery, roseRing);

    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.26, h, 0.30), MAT.darkWood);
    pillarL.position.set(-w * 0.5 - 0.11, 0, 0.09);
    const pillarR = pillarL.clone();
    pillarR.position.x = w * 0.5 + 0.11;
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.68, 0.24, 0.42), MAT.darkWood);
    sill.position.set(0, -h * 0.5 - 0.1, 0.14);
    const valance = new THREE.Mesh(new THREE.BoxGeometry(w + 0.72, 0.32, 0.44), MAT.darkWood);
    valance.position.set(0, h * 0.5 + 0.08, 0.16);
    const valanceTrim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.76, 0.08, 0.48), MAT.goldTrim);
    valanceTrim.position.set(0, h * 0.5 - 0.06, 0.17);
    [pillarL, pillarR, sill, valance, valanceTrim].forEach(m => {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    });

    // Scalloped Velvet Pelmet Swags & Gold Fringe along top of window
    for (let s = -2; s <= 2; s++) {
      const swag = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.055, 8, 14, Math.PI), MAT.velvetDrape);
      swag.rotation.z = Math.PI;
      swag.position.set(s * 0.44, h * 0.5 - 0.08, 0.22);
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.12, 8), MAT.goldTrim);
      tassel.position.set(s * 0.44, h * 0.5 - 0.36, 0.24);
      root.add(swag, tassel);
    }

    for (const side of [-1, 1]) {
      const drapeGroup = new THREE.Group();
      for (let fold = 0; fold < 6; fold++) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.145, h * 0.98, 14), MAT.velvetDrape);
        cyl.position.set(side * (w * 0.34 + fold * 0.068), 0, 0.16 + (fold % 2) * 0.038);
        cyl.rotation.z = side * 0.075;
        cyl.castShadow = true;
        cyl.receiveShadow = true;
        drapeGroup.add(cyl);
      }
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.028, 8, 16), MAT.goldTrim);
      tie.position.set(side * (w * 0.43), -h * 0.16, 0.20);
      tie.rotation.x = Math.PI * 0.45;
      const tieTassel = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.16, 10), MAT.goldTrim);
      tieTassel.position.set(side * (w * 0.34), -h * 0.26, 0.26);
      drapeGroup.add(tie, tieTassel);
      root.add(drapeGroup);
    }

    enableShadows(root, true, true);
    PREFABS.gothicWindow = mergeStaticGroup(root, true);
    return PREFABS.gothicWindow.clone();
  }

  // 6b. MODERN VOLUMETRIC MOONBEAM GOD-RAY BEAMS (Correct Cone Orientation: Narrow at Window, Expands into Hall)
  function createVolumetricMoonbeam(scale = 1.0) {
    const root = new THREE.Group();
    const w = 2.2 * scale;
    const beamLen = 14.5 * scale;
    const rTop = w * 0.44;
    const rBottom = w * 1.85;

    // Outer atmospheric mantle cone: soft, expansive volumetric god-ray
    const outerGeo = new THREE.CylinderGeometry(rTop, rBottom, beamLen, 32, 24, true);
    outerGeo.translate(0, -beamLen * 0.5, 0); // top apex cap is at y = 0
    const outerMesh = new THREE.Mesh(outerGeo, volumetricBeamMat);
    outerMesh.position.set(0, 0.20 * scale, 0.08 * scale);
    outerMesh.rotation.x = -Math.PI * 0.26; // Slants down (-Y) and into the room (+Z)
    root.add(outerMesh);

    // Inner intense core cone: brighter, tighter illumination along central beam axis
    const innerGeo = new THREE.CylinderGeometry(rTop * 0.62, rBottom * 0.64, beamLen * 0.92, 24, 16, true);
    innerGeo.translate(0, -beamLen * 0.46, 0);
    const innerMesh = new THREE.Mesh(innerGeo, volumetricBeamMat);
    innerMesh.position.set(0, 0.20 * scale, 0.08 * scale);
    innerMesh.rotation.x = -Math.PI * 0.26;
    root.add(innerMesh);

    root.userData.noMerge = true;
    root.userData.isVolumetric = true;
    return root;
  }

  // 7. HIGH-DETAIL VICTORIAN WINGBACK THRONE ARMCHAIR + CARVED PARLOR TABLE VIGNETTE
  function makeVictorianArmchairSet() {
    if (PREFABS.armchairSet) return PREFABS.armchairSet.clone();
    const root = new THREE.Group();

    const chair = new THREE.Group();
    chair.add(makeAODecal(1.30, 1.30));

    // --- A. Carved Mahogany Cabriole Legs with Brass Casters & Scalloped Apron ---
    for (const sx of [-0.41, 0.41]) {
      for (const sz of [-0.36, 0.36]) {
        const legGroup = new THREE.Group();
        legGroup.position.set(sx, 0, sz);

        // Brass caster wheel at floor contact
        const casterWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.018, 10), MAT.goldTrim);
        casterWheel.rotation.z = Math.PI * 0.5;
        casterWheel.position.y = 0.022;
        const casterCup = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.018, 0.028, 10), MAT.agedBrass);
        casterCup.position.y = 0.042;

        // Lathe-turned Victorian cabriole/bulbous leg
        const legMesh = new THREE.Mesh(GEO.chairLegLathe, MAT.darkWood);
        legMesh.position.y = 0.03;

        // Carved corner knee scroll & gilded rosette on front legs
        if (sz > 0) {
          const kneeScroll = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.016, 7, 12, Math.PI * 1.1), MAT.darkWood);
          kneeScroll.position.set(0, 0.34, 0.035);
          kneeScroll.rotation.y = Math.PI * 0.5;
          const kneeRosette = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), MAT.goldTrim);
          kneeRosette.scale.z = 0.5;
          kneeRosette.position.set(0, 0.38, 0.056);
          legGroup.add(kneeScroll, kneeRosette);
        } else {
          // Slight backward splay on rear legs like authentic Victorian chairs
          legMesh.rotation.x = -0.06;
        }

        legGroup.add(casterWheel, casterCup, legMesh);
        chair.add(legGroup);
      }
    }

    // Carved Mahogany Seat Frame & Scalloped Apron Rails
    const seatDeck = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.09, 0.82), MAT.darkWood);
    seatDeck.position.set(0, 0.41, 0);
    chair.add(seatDeck);

    // Front, Left & Right Carved Apron Rails with Gilded Scroll Trim
    const frontApron = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.86, 12), MAT.darkWood);
    frontApron.rotation.z = Math.PI * 0.5;
    frontApron.scale.set(1.0, 1.0, 0.55);
    frontApron.position.set(0, 0.38, 0.39);
    const frontGoldBead = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.84, 10), MAT.goldTrim);
    frontGoldBead.rotation.z = Math.PI * 0.5;
    frontGoldBead.position.set(0, 0.345, 0.41);

    // Central Baroque Shell Medallion on Front Apron
    const apronCartouche = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), MAT.goldTrim);
    apronCartouche.scale.set(1.55, 0.85, 0.42);
    apronCartouche.position.set(0, 0.37, 0.418);
    chair.add(frontApron, frontGoldBead, apronCartouche);

    for (const sx of [-0.43, 0.43]) {
      const sideApron = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.76, 10), MAT.darkWood);
      sideApron.rotation.x = Math.PI * 0.5;
      sideApron.scale.set(0.55, 1.0, 1.0);
      sideApron.position.set(sx, 0.38, 0);
      const sideGoldBead = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.74, 8), MAT.goldTrim);
      sideGoldBead.rotation.x = Math.PI * 0.5;
      sideGoldBead.position.set(sx + Math.sign(sx) * 0.02, 0.348, 0);
      chair.add(sideApron, sideGoldBead);
    }

    // --- B. Plump Crowned Velvet Seat Cushion with Welt Piping & Bullion Fringe ---
    const cushionCore = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.13, 0.72), MAT.tuftedVelvet);
    cushionCore.position.set(0, 0.50, 0.02);

    //Domed plush top pillow surface of seat cushion
    const cushionDome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), MAT.tuftedVelvet);
    cushionDome.scale.set(0.84, 0.16, 0.76);
    cushionDome.position.set(0, 0.54, 0.02);

    // Rounded front bullnose bolster on seat cushion
    const cushionFrontRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.78, 14), MAT.tuftedVelvet);
    cushionFrontRoll.rotation.z = Math.PI * 0.5;
    cushionFrontRoll.position.set(0, 0.505, 0.365);

    // Gold braided welt cord piping along front of cushion
    const weltTop = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.79, 10), MAT.goldTrim);
    weltTop.rotation.z = Math.PI * 0.5;
    weltTop.position.set(0, 0.565, 0.38);
    const weltBot = weltTop.clone();
    weltBot.position.set(0, 0.445, 0.38);

    chair.add(cushionCore, cushionDome, cushionFrontRoll, weltTop, weltBot);

    // Hanging gold tassel fringe row along front apron
    for (let t = -5; t <= 5; t++) {
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.055, 6), MAT.goldTrim);
      tassel.position.set(t * 0.068, 0.315, 0.405);
      chair.add(tassel);
    }

    // --- C. Sculpted Diamond-Tufted High Backrest & Carved Baroque Crest Rail ---
    const backGroup = new THREE.Group();
    backGroup.position.set(0, 0.48, -0.34);
    backGroup.rotation.x = -0.10; // Authentic ergonomic Victorian recline
    chair.add(backGroup);

    // Solid carved mahogany outer shell & side stiles
    const backWoodShell = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.18, 0.07), MAT.darkWood);
    backWoodShell.position.set(0, 0.62, -0.04);
    backGroup.add(backWoodShell);

    for (const sx of [-0.43, 0.43]) {
      const stile = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.052, 1.22, 12), MAT.darkWood);
      stile.position.set(sx, 0.62, -0.02);
      const goldInlay = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 1.16, 8), MAT.goldTrim);
      goldInlay.position.set(sx * 0.96, 0.62, 0.022);
      // Top corner turned finial urns
      const finial = new THREE.Mesh(GEO.chairFinial, MAT.darkWood);
      finial.position.set(sx, 1.23, -0.02);
      const finialTip = new THREE.Mesh(GEO.nailStud, MAT.goldTrim);
      finialTip.scale.setScalar(1.6);
      finialTip.position.set(sx, 1.425, -0.02);
      backGroup.add(stile, goldInlay, finial, finialTip);
    }

    // Contoured Multi-Bolster Diamond-Tufted Velvet Backrest Padding
    const lumbarRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.78, 14), MAT.tuftedVelvet);
    lumbarRoll.rotation.z = Math.PI * 0.5;
    lumbarRoll.position.set(0, 0.14, 0.04);
    backGroup.add(lumbarRoll);

    // 5 Vertical Plush Velvet Channels + Domed Center Pad
    for (let c = -2; c <= 2; c++) {
      const chH = 1.08 - Math.abs(c) * 0.04;
      const channel = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.092, chH, 14), MAT.tuftedVelvet);
      channel.scale.set(0.95, 1.0, 0.72);
      channel.position.set(c * 0.15, 0.64, 0.035 - Math.abs(c) * 0.008);
      backGroup.add(channel);
    }

    // 13 Sunken Tuft Buttons arranged in a Chesterfield Diamond Grid on the backrest
    const tuftRows = [
      { y: 0.34, xs: [-0.22, 0.0, 0.22] },
      { y: 0.54, xs: [-0.30, -0.10, 0.10, 0.30] },
      { y: 0.74, xs: [-0.22, 0.0, 0.22] },
      { y: 0.94, xs: [-0.30, 0.0, 0.30] }
    ];
    for (const row of tuftRows) {
      for (const tx of row.xs) {
        const btn = new THREE.Mesh(GEO.tuftButton, MAT.goldTrim);
        btn.scale.z = 0.55;
        btn.position.set(tx, row.y, 0.088);
        backGroup.add(btn);
      }
    }

    // Ornate Carved Baroque Crest Rail at top of backrest
    const crestArch = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.11, 20, 1, false, 0, Math.PI), MAT.darkWood);
    crestArch.rotation.y = Math.PI * 0.5;
    crestArch.rotation.z = Math.PI * 0.5;
    crestArch.scale.set(0.42, 1.0, 1.0);
    crestArch.position.set(0, 1.18, -0.02);
    backGroup.add(crestArch);

    // Twin S-Scroll Volutes & Central Gilded Medallion on Crest Rail
    for (const sx of [-1, 1]) {
      const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.024, 8, 16, Math.PI * 1.35), MAT.darkWood);
      scroll.position.set(sx * 0.22, 1.24, 0.0);
      scroll.rotation.z = sx < 0 ? -0.4 : Math.PI + 0.4;
      const goldTrimScroll = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.009, 6, 14, Math.PI * 1.25), MAT.goldTrim);
      goldTrimScroll.position.copy(scroll.position);
      goldTrimScroll.position.z += 0.022;
      goldTrimScroll.rotation.copy(scroll.rotation);
      backGroup.add(scroll, goldTrimScroll);
    }
    const crestBoss = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), MAT.goldTrim);
    crestBoss.scale.set(0.85, 1.25, 0.45);
    crestBoss.position.set(0, 1.31, 0.025);
    const crestCrown = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.09, 7), MAT.goldTrim);
    crestCrown.scale.z = 0.4;
    crestCrown.position.set(0, 1.40, 0.022);
    backGroup.add(crestBoss, crestCrown);

    // --- D. Sweeping S-Contour Side Wings (Cheeks) & Padded Scrolled Armrests ---
    for (const side of [-1, 1]) {
      const sx = side * 0.42;

      // Multi-part S-curved Wing Cheek flaring from crest down to armrest
      const wingGroup = new THREE.Group();
      wingGroup.position.set(sx, 1.16, -0.22);
      wingGroup.rotation.y = -side * 0.22;
      chair.add(wingGroup);

      const wingUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.46, 14), MAT.tuftedVelvet);
      wingUpper.scale.set(0.36, 1.0, 1.15);
      wingUpper.position.set(0, 0.16, 0.02);
      wingUpper.rotation.x = 0.22;

      const wingLower = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.42, 14), MAT.tuftedVelvet);
      wingLower.scale.set(0.36, 1.0, 1.10);
      wingLower.position.set(0, -0.18, 0.06);
      wingLower.rotation.x = -0.28;

      // Curved mahogany show-wood border along front edge of wing
      const wingTrimUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.48, 10), MAT.darkWood);
      wingTrimUpper.position.set(side * 0.03, 0.17, 0.18);
      wingTrimUpper.rotation.x = 0.24;
      const wingTrimLower = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.44, 10), MAT.darkWood);
      wingTrimLower.position.set(side * 0.03, -0.18, 0.18);
      wingTrimLower.rotation.x = -0.30;

      wingGroup.add(wingUpper, wingLower, wingTrimUpper, wingTrimLower);

      // Row of brass nailhead studs along the wing's front curve
      for (let n = 0; n < 9; n++) {
        const nt = n / 8;
        const stud = new THREE.Mesh(GEO.nailStud, MAT.goldTrim);
        const ny = 0.36 - nt * 0.72;
        const nz = 0.15 + Math.sin(nt * Math.PI) * 0.065;
        stud.position.set(side * 0.056, ny, nz);
        wingGroup.add(stud);
      }

      // Plush Rolled Velvet Armrest + Flared Front Scroll Knuckle
      const armRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.76, 14), MAT.tuftedVelvet);
      armRoll.rotation.x = Math.PI * 0.5;
      armRoll.scale.set(1.08, 1.0, 0.88);
      armRoll.position.set(sx, 0.74, 0.02);

      const armKnuckle = new THREE.Mesh(new THREE.SphereGeometry(0.096, 14, 12), MAT.tuftedVelvet);
      armKnuckle.scale.set(1.12, 1.05, 0.85);
      armKnuckle.position.set(sx + side * 0.015, 0.74, 0.40);

      // Carved mahogany scroll face & gold rosette at front of armrest
      const knuckleWoodRing = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.016, 8, 16), MAT.darkWood);
      knuckleWoodRing.position.set(sx + side * 0.015, 0.735, 0.465);
      const knuckleGoldBtn = new THREE.Mesh(GEO.tuftButton, MAT.goldTrim);
      knuckleGoldBtn.position.set(sx + side * 0.015, 0.735, 0.475);

      // Lathe-turned mahogany baluster arm support post
      const armPost = new THREE.Mesh(GEO.chairArmPost, MAT.darkWood);
      armPost.position.set(sx, 0.44, 0.36);

      chair.add(armRoll, armKnuckle, knuckleWoodRing, knuckleGoldBtn, armPost);
    }

    // Cobweb draped between chair wing and armrest
    const chairWeb = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), MAT.cobweb);
    chairWeb.position.set(-0.36, 0.96, 0.08);
    chairWeb.rotation.y = 0.45;
    chair.add(chairWeb);

    enableShadows(chair, true, true);
    root.add(chair);

    // --- E. Ornate Victorian Parlor Side Table with Outrigger Legs, Grimoires, Skull & Pumpkin ---
    const table = new THREE.Group();
    table.position.set(1.02, 0, 0.12);
    table.add(makeAODecal(1.12, 1.12));

    // Central turned pedestal + 4 carved outrigger legs & curved X-stretcher
    const ped = new THREE.Mesh(GEO.tablePedestal, MAT.darkWood);
    table.add(ped);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      const ox = Math.cos(a) * 0.32, oz = Math.sin(a) * 0.32;
      const outLeg = new THREE.Mesh(GEO.tableOutriggerLeg, MAT.darkWood);
      outLeg.position.set(ox, 0, oz);
      table.add(outLeg);

      // Stretcher bar connecting outrigger leg to central pedestal
      const stretcher = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.036, 0.042), MAT.darkWood);
      stretcher.position.set(ox * 0.5, 0.16, oz * 0.5);
      stretcher.rotation.y = -a;
      table.add(stretcher);

      // Carved pendant finial hanging from table apron corner
      const pendant = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.08, 8), MAT.goldTrim);
      pendant.rotation.x = Math.PI;
      pendant.position.set(ox * 1.12, 0.68, oz * 1.12);
      table.add(pendant);
    }

    // Molded tabletop with inlaid dark marble top & gilded brass rim
    const topApron = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.43, 0.065, 24), MAT.darkWood);
    topApron.position.y = 0.745;
    const topWood = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.47, 0.042, 24), MAT.darkWood);
    topWood.position.y = 0.785;
    const topMarble = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.012, 24), MAT.marbleFloor);
    topMarble.position.y = 0.805;
    const topRim = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.018, 8, 28), MAT.goldTrim);
    topRim.rotation.x = Math.PI * 0.5;
    topRim.position.y = 0.79;
    table.add(topApron, topWood, topMarble, topRim);

    // 1. Carved Jack-o'-Lantern on table
    const pumpkin = makeJackOLantern(0.80);
    pumpkin.position.set(-0.14, 0.81, 0.10);
    pumpkin.rotation.y = -0.35;
    table.add(pumpkin);

    // 2. Stack of Antique Leather-Bound Spellbooks + Weathered Skull on table (matching concept art!)
    const bookGroup = new THREE.Group();
    bookGroup.position.set(0.14, 0.81, 0.08);
    bookGroup.rotation.y = 0.38;

    const book1Cover = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.044, 0.18), MAT.velvetDrape);
    book1Cover.position.y = 0.022;
    const book1Pages = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.034, 0.168), MAT.bone);
    book1Pages.position.set(0.006, 0.022, 0);
    const book2Cover = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.038, 0.16), MAT.darkWood);
    book2Cover.position.set(-0.01, 0.063, -0.01);
    book2Cover.rotation.y = -0.22;
    const book2Pages = new THREE.Mesh(new THREE.BoxGeometry(0.196, 0.028, 0.148), MAT.bone);
    book2Pages.position.copy(book2Cover.position);
    book2Pages.rotation.y = -0.22;
    bookGroup.add(book1Cover, book1Pages, book2Cover, book2Pages);

    // Weathered Human Skull resting atop the grimoires
    const tableSkull = new THREE.Group();
    tableSkull.position.set(0, 0.145, 0.01);
    tableSkull.rotation.set(0.08, -0.52, -0.06);
    const tCranium = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), MAT.bone);
    tCranium.scale.set(0.88, 1.02, 1.10);
    const tJaw = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.048, 0.075), MAT.bone);
    tJaw.position.set(0, -0.038, 0.032);
    const sockMat = new THREE.MeshBasicMaterial({ color: 0x080403 });
    for (const ex of [-0.024, 0.024]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), sockMat);
      s.position.set(ex, -0.008, 0.064);
      tableSkull.add(s);
    }
    const nasal = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.022, 3), sockMat);
    nasal.position.set(0, -0.024, 0.072);
    tableSkull.add(tCranium, tJaw, nasal);
    bookGroup.add(tableSkull);
    table.add(bookGroup);

    // 3. Clustered Pillar Candles in Brass Saucers at back of table
    for (let c = 0; c < 3; c++) {
      const cx = 0.08 + (c - 1) * 0.09;
      const cz = -0.16 + (c % 2) * 0.07;
      const saucer = new THREE.Mesh(GEO.cup, MAT.goldTrim);
      saucer.position.set(cx, 0.81, cz);
      const candle = createSingleCandle(rr(0.78, 1.22));
      candle.position.set(cx, 0.84, cz);
      table.add(saucer, candle);
    }

    enableShadows(table, true, true);
    root.add(table);
    PREFABS.armchairSet = mergeStaticGroup(root, true);
    return PREFABS.armchairSet.clone();
  }

  // 8. FLUTED CLASSICAL CORINTHIAN COLUMN WITH ACANTHUS LEAVES, VOLUTES & ATTIC BASE
  function makeColumn(height = 5.4) {
    const key = height.toFixed(2);
    if (PREFABS.columns.has(key)) return PREFABS.columns.get(key).clone();
    const root = new THREE.Group();
    root.add(makeAODecal(1.3, 1.3));

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 0.86), MAT.darkWood);
    plinth.position.y = 0.08;
    const subPlinth = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.78), MAT.goldTrim);
    subPlinth.position.y = 0.18;

    const base = new THREE.Mesh(GEO.columnBaseLathe, MAT.darkWood);
    base.position.y = 0.20;

    const baseTorus = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.026, 8, 20), MAT.goldTrim);
    baseTorus.rotation.x = Math.PI * 0.5;
    baseTorus.position.y = 0.34;

    const shaftH = height - 1.18;
    const shaft = new THREE.Mesh(GEO.columnShaft, MAT.columnWood);
    shaft.scale.y = shaftH / 4.65;
    shaft.position.y = 0.62 + shaftH * 0.5;

    const astragal = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.032, 8, 20), MAT.goldTrim);
    astragal.rotation.x = Math.PI * 0.5;
    astragal.position.y = height - 0.56;

    const cap = new THREE.Mesh(GEO.columnCapLathe, MAT.goldTrim);
    cap.position.y = height - 0.55;

    // 8 Sculpted Corinthian Acanthus Leaves & 4 Corner Volutes around the Capital Bell
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tier = i % 2;
      const rLeaf = tier === 0 ? 0.28 : 0.32;
      const yLeaf = height - (tier === 0 ? 0.44 : 0.32);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.20, 5), MAT.goldTrim);
      leaf.scale.set(1.2, 1.0, 0.45);
      leaf.position.set(Math.cos(a) * rLeaf, yLeaf, Math.sin(a) * rLeaf);
      leaf.rotation.y = -a + Math.PI * 0.5;
      leaf.rotation.x = 0.32;
      root.add(leaf);
    }
    for (let v = 0; v < 4; v++) {
      const a = (v / 4) * Math.PI * 2 + Math.PI * 0.25;
      const volute = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.022, 7, 14, Math.PI * 1.45), MAT.goldTrim);
      volute.position.set(Math.cos(a) * 0.39, height - 0.16, Math.sin(a) * 0.39);
      volute.rotation.y = -a;
      root.add(volute);
    }

    const abacus = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.09, 0.94), MAT.darkWood);
    abacus.position.y = height - 0.045;
    const abacusTrim = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.035, 0.98), MAT.goldTrim);
    abacusTrim.position.y = height - 0.018;

    root.add(plinth, subPlinth, base, baseTorus, shaft, astragal, cap, abacus, abacusTrim);
    enableShadows(root, true, true);
    mergeStaticGroup(root, true);
    PREFABS.columns.set(key, root);
    return root.clone();
  }

  // 9. LATHE-TURNED BALUSTER SPINDLE FOR UPPER BALCONY
  function makeBaluster() {
    const m = new THREE.Mesh(GEO.balusterLathe, MAT.darkWood);
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  }

  // 10. CARVED BAROQUE STAIRCASE NEWEL POST (for Perched Raven)
  function makeNewelPost() {
    if (PREFABS.newelPost) return PREFABS.newelPost.clone();
    const root = new THREE.Group();
    root.add(makeAODecal(0.65, 0.65));

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.42), MAT.darkWood);
    plinth.position.y = 0.12;
    const baseMold = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), MAT.darkWood);
    baseMold.position.y = 0.42;
    const goldBand = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.38), MAT.goldTrim);
    goldBand.position.y = 0.61;

    const turnedShaft = new THREE.Mesh(GEO.balusterLathe, MAT.darkWood);
    turnedShaft.scale.set(2.4, 0.48, 2.4);
    turnedShaft.position.y = 0.63;

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), MAT.darkWood);
    cap.position.y = 1.05;
    const finialBall = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), MAT.darkWood);
    finialBall.scale.y = 0.85;
    finialBall.position.y = 1.15;
    const finialRing = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.016, 6, 14), MAT.goldTrim);
    finialRing.rotation.x = Math.PI * 0.5;
    finialRing.position.y = 1.09;

    root.add(plinth, baseMold, goldBand, turnedShaft, cap, finialBall, finialRing);
    enableShadows(root, true, true);
    PREFABS.newelPost = mergeStaticGroup(root, true);
    return PREFABS.newelPost.clone();
  }

  window.HH.PROPS = {
    makeAODecal,
    createSingleCandle,
    makeFloorCandelabra,
    makeChandelier,
    makeWallSconce,
    makeJackOLantern,
    makeHauntedPortrait,
    makeGothicWindow,
    createVolumetricMoonbeam,
    makeVictorianArmchairSet,
    makeColumn,
    makeBaluster,
    makeNewelPost
  };
})();
