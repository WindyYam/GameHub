// ============================================================================
// HAUNTED HOUSE — HALLOWEEN DRESSING PROPS (skulls, pumpkin patches, candle clusters,
// cobwebs, skull tables, bone heaps & velvet drapes) matching the concept art
// ============================================================================
(() => {
  'use strict';
  const { rr, MAT, mergeStaticGroup, enableShadows } = window.HH;
  const PROPS = window.HH.PROPS;
  const CACHE = {};

  function cached(key, build) {
    if (!CACHE[key]) {
      const root = build();
      enableShadows(root, true, true);
      CACHE[key] = mergeStaticGroup(root, true);
    }
    return CACHE[key].clone();
  }

  function buildSkull() {
    const g = new THREE.Group();
    const cr = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), MAT.bone);
    cr.scale.set(1.0, 1.05, 1.12);
    cr.position.y = 0.105;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.04, 0.075), MAT.bone);
    jaw.position.set(0, 0.03, 0.025);
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.04, 0.06), MAT.bone);
    cheek.position.set(0, 0.062, 0.03);
    g.add(cr, jaw, cheek);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), MAT.darkIron);
      eye.scale.set(1, 1.1, 0.7);
      eye.position.set(s * 0.034, 0.108, 0.088);
      g.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.032, 3), MAT.darkIron);
    nose.rotation.x = Math.PI;
    nose.position.set(0, 0.07, 0.098);
    g.add(nose);
    for (let i = -3; i <= 3; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.0095, 0.016, 0.01), MAT.bone);
      tooth.position.set(i * 0.0115, 0.049, 0.088 - Math.abs(i) * 0.004);
      g.add(tooth);
    }
    return g;
  }
  function makeSkull(scale = 1.0) {
    const s = cached('skull', buildSkull);
    s.scale.setScalar(scale);
    return s;
  }

  function buildPlainPumpkin(lobes = 9) {
    const g = new THREE.Group();
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), MAT.pumpkinRind);
      lobe.scale.set(0.56, 0.82, 0.74);
      lobe.position.set(Math.cos(a) * 0.082, 0.17, Math.sin(a) * 0.082);
      lobe.rotation.y = -a;
      g.add(lobe);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.045, 0.08, 7), MAT.darkWood);
    stem.position.set(0, 0.33, 0);
    stem.rotation.z = 0.15;
    g.add(stem);
    return g;
  }
  function makePlainPumpkin(scale = 1.0) {
    const p = cached('plainPumpkin', () => buildPlainPumpkin());
    p.scale.setScalar(scale);
    return p;
  }

  // Cluster of 2-3 jack-o-lanterns + plain pumpkins and gourds
  function makePumpkinPatch() {
    const g = new THREE.Group();
    const spots = [
      [0, 0, 1.15, 'jack'], [0.50, 0.18, 0.78, 'plain'], [-0.46, 0.12, 0.92, 'jack'],
      [0.18, -0.46, 0.62, 'plain'], [-0.30, -0.40, 0.50, 'jack'], [0.72, -0.28, 0.42, 'plain']
    ];
    for (const [x, z, sc, kind] of spots) {
      const p = kind === 'jack' ? PROPS.makeJackOLantern(sc) : makePlainPumpkin(sc);
      p.position.set(x, 0, z);
      p.rotation.y = Math.atan2(-x, 1.0) + rr(-0.5, 0.5);
      g.add(p);
    }
    return g;
  }

  // Dish of mismatched candles dripping wax (floor / table piece)
  function buildCandleCluster() {
    const g = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.23, 0.03, 16), MAT.agedBrass);
    dish.position.y = 0.015;
    g.add(dish);
    const spots = [[0, 0, 1.7], [0.10, 0.08, 1.15], [-0.11, 0.06, 1.0], [0.04, -0.12, 0.7], [-0.09, -0.09, 0.45], [0.14, -0.05, 0.35]];
    for (const [x, z, h] of spots) {
      const c = PROPS.createSingleCandle(h);
      c.position.set(x, 0.03, z);
      g.add(c);
    }
    return g;
  }
  function makeCandleCluster(scale = 1.0) {
    const c = cached('candleCluster', buildCandleCluster);
    c.scale.setScalar(scale);
    return c;
  }

  function buildBoneHeap() {
    const g = new THREE.Group();
    const sk = buildSkull();
    sk.position.set(0, 0.0, 0);
    sk.rotation.set(0.1, 0.6, 0.15);
    g.add(sk);
    const sk2 = buildSkull();
    sk2.scale.setScalar(0.9);
    sk2.position.set(0.30, 0.0, 0.12);
    sk2.rotation.set(0, -0.9, 0.5);
    g.add(sk2);
    for (let i = 0; i < 7; i++) {
      const len = rr(0.22, 0.42);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 6), MAT.bone);
      b.rotation.z = Math.PI * 0.5;
      b.rotation.y = rr(0, Math.PI);
      b.position.set(rr(-0.25, 0.4), 0.014 + (i % 3) * 0.012, rr(-0.2, 0.25));
      const k1 = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), MAT.bone);
      k1.position.copy(b.position);
      k1.position.x += Math.cos(b.rotation.y) * len * 0.5;
      k1.position.z -= Math.sin(b.rotation.y) * len * 0.5;
      g.add(b, k1);
    }
    // rib arcs
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.09 + i * 0.01, 0.007, 5, 10, Math.PI), MAT.bone);
      rib.position.set(-0.28 + i * 0.045, 0.01, -0.22);
      rib.rotation.y = 0.5;
      g.add(rib);
    }
    return g;
  }
  function makeBoneHeap() { return cached('boneHeap', buildBoneHeap); }

  // Small side table (like the concept's occasional tables) carrying skull, candles, pumpkin and a book
  function buildSkullTable() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 20), MAT.darkWood);
    top.position.y = 0.82;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.018, 6, 24), MAT.goldTrim);
    rim.rotation.x = Math.PI * 0.5;
    rim.position.y = 0.845;
    g.add(top, rim);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.034, 0.80, 8), MAT.darkWood);
      leg.position.set(Math.cos(a) * 0.30, 0.40, Math.sin(a) * 0.30);
      leg.rotation.set(Math.sin(a) * -0.09, 0, Math.cos(a) * 0.09);
      g.add(leg);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.014, 6, 20), MAT.darkWood);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = 0.30;
    g.add(ring);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.17), MAT.tuftedVelvet);
    book.position.set(-0.17, 0.87, 0.10);
    book.rotation.y = 0.4;
    g.add(book);
    const sk = buildSkull();
    sk.position.set(-0.17, 0.895, 0.10);
    sk.rotation.y = 0.9;
    g.add(sk);
    const cc = buildCandleCluster();
    cc.scale.setScalar(0.8);
    cc.position.set(0.14, 0.845, -0.08);
    g.add(cc);
    const pk = buildPlainPumpkin(8);
    pk.scale.setScalar(0.55);
    pk.position.set(0.12, 0.845, 0.22);
    g.add(pk);
    return g;
  }
  function makeSkullTable() { return cached('skullTable', buildSkullTable); }

  // Corner cobweb; origin is the corner the spokes radiate from
  function makeCobweb(size = 2.0) {
    const geo = new THREE.PlaneGeometry(size, size);
    geo.translate(size * 0.5, size * 0.5, 0);
    const m = new THREE.Mesh(geo, MAT.cobweb);
    m.renderOrder = 4;
    const g = new THREE.Group();
    g.add(m);
    return g;
  }

  // Folded red velvet curtain hung from a gold rod
  function makeCurtain(h = 5.0, w = 1.7) {
    return cached('curtain_' + h + '_' + w, () => {
      const g = new THREE.Group();
      const geo = new THREE.PlaneGeometry(w, h, 28, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        const t = (y + h * 0.5) / h; // 0 bottom .. 1 top
        p.setZ(i, Math.sin(x * 13.0) * 0.07 * (1.0 - t * 0.55) + (1.0 - t) * 0.04);
        p.setX(i, x * (0.90 + 0.10 * t));
      }
      geo.computeVertexNormals();
      const cur = new THREE.Mesh(geo, MAT.velvetDrape);
      cur.position.set(0, h * 0.5, 0.12);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, w + 0.4, 8), MAT.goldTrim);
      rod.rotation.z = Math.PI * 0.5;
      rod.position.set(0, h + 0.04, 0.12);
      g.add(cur, rod);
      for (const s of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), MAT.goldTrim);
        fin.position.set(s * (w * 0.5 + 0.2), h + 0.04, 0.12);
        g.add(fin);
      }
      const tie = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 8), MAT.goldTrim);
      tie.position.set(0, h * 0.34, 0.2);
      tie.rotation.x = Math.PI;
      g.add(tie);
      return g;
    });
  }

  // Large hanging vampire bat or small bat cluster for arches and chandeliers
  function buildHangingBats() {
    const g = new THREE.Group();
    const spots = [
      [0, 0, 0, 1.35, 0.15],
      [-0.55, 0.22, -0.18, 1.05, -0.35],
      [0.62, 0.18, 0.15, 1.15, 0.42]
    ];
    for (const [x, y, z, sc, ry] of spots) {
      const bat = new THREE.Group();
      bat.position.set(x, y, z);
      bat.rotation.set(0.28, ry, 0);
      bat.scale.setScalar(sc);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), MAT.darkIron);
      body.scale.set(0.85, 0.78, 1.45);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), MAT.darkIron);
      head.position.set(0, 0.03, 0.09);
      bat.add(body, head);
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.075, 4), MAT.darkIron);
        ear.position.set(sx * 0.032, 0.08, 0.08);
        ear.rotation.z = -sx * 0.35;
        bat.add(ear);
        // Sweeping outstretched leathery bat wing
        const wIn = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.012, 0.22), MAT.darkIron);
        wIn.position.set(sx * 0.19, 0.03, -0.01);
        wIn.rotation.set(0.15, -sx * 0.18, sx * 0.28);
        const wOut = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.44, 4), MAT.darkIron);
        wOut.scale.set(1.0, 1.0, 0.12);
        wOut.position.set(sx * 0.48, 0.05, -0.04);
        wOut.rotation.set(0.1, 0, -sx * 1.32);
        bat.add(wIn, wOut);
      }
      g.add(bat);
    }
    return g;
  }
  function makeHangingBats(scale = 1.0) {
    const b = cached('hangingBats', buildHangingBats);
    b.scale.setScalar(scale);
    return b;
  }

  // Ornate Baroque Console Table against colonnades / walls with Candelabra, Pumpkins & Skulls
  function buildConsoleTable() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.07, 0.56), MAT.darkWood);
    top.position.y = 0.86;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.59, 0.03, 0.59), MAT.goldTrim);
    trim.position.y = 0.84;
    g.add(top, trim);
    for (const sx of [-0.66, 0.66]) {
      for (const sz of [-0.20, 0.20]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.024, 0.84, 10), MAT.darkWood);
        leg.position.set(sx, 0.42, sz);
        g.add(leg);
      }
    }
    const apron = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.11, 0.46), MAT.darkWood);
    apron.position.y = 0.78;
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), MAT.goldTrim);
    boss.scale.set(1.5, 0.9, 0.4);
    boss.position.set(0, 0.78, 0.24);
    g.add(apron, boss);
    const pk1 = PROPS.makeJackOLantern(0.76);
    pk1.position.set(-0.46, 0.895, 0.04);
    pk1.rotation.y = 0.35;
    const pk2 = makePlainPumpkin(0.58);
    pk2.position.set(0.48, 0.895, 0.06);
    const cc = buildCandleCluster();
    cc.scale.setScalar(0.95);
    cc.position.set(0.02, 0.895, -0.04);
    const sk = buildSkull();
    sk.position.set(0.28, 0.895, 0.08);
    sk.rotation.y = -0.45;
    g.add(pk1, pk2, cc, sk);
    return g;
  }
  function makeConsoleTable() { return cached('consoleTable', buildConsoleTable); }

  Object.assign(PROPS, {
    makeSkull, makePlainPumpkin, makePumpkinPatch, makeCandleCluster,
    makeBoneHeap, makeSkullTable, makeCobweb, makeCurtain, makeHangingBats, makeConsoleTable
  });
})();
