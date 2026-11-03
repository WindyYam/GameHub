'use strict';

/* =====================================================================
   STEP 9 — WRECKS: burnt-out hull sections tumbling slowly through the far background
   ===================================================================== */

(() => {
  const OR = [3, 1.1, .3];
  function wreck(kind) {
    const K = makeKit();
    const greeb = (w, l, y, n) => {
      for (let i = 0; i < n; i++) { const h = rr(.4, 2.2); K.box(rr(.8, 3.5), h, rr(.8, 4), rr(-w, w), y + h / 2, rr(-l, l), pick([COL.W, COL.DARK, COL.LT]), 0, rr(-.3, .3), 0); }
    };
    // torn ribs jutting out of a broken end (dir = +1 / -1 along z)
    const ribs = (z, r, n, len, dir) => {
      for (let i = 0; i < n; i++) {
        const a = rr(0, 6.2832), rad = r * rr(.4, 1), l = rr(6, len);
        K.box(rr(.8, 1.6), l, rr(.8, 1.6), Math.cos(a) * rad, Math.sin(a) * rad * .5, z + dir * l / 2, pick([COL.DARK, COL.W]), dir * Math.PI / 2 + rr(-.35, .35), rr(-.35, .35), 0);
      }
    };
    if (kind === 0) {                       // broken bow, open at the back
      K.loft([{ z: -70, pts: ring(5, 2.5, -2.5, .6, .6, .5) }, { z: -30, pts: ring(15, 6, -5, .62, .62, .5) }, { z: 20, pts: ring(21, 8, -7, .62, .62, .5) }], COL.W);
      greeb(15, 40, 7, 30); K.gbox(30, 11, .6, 0, .5, 20.3, OR); ribs(20, 14, 12, 18, 1); K.box(22, .8, 14, 9, 2, 30, COL.DARK, .5, .3, .2);
      return { geo: K, mat: 'A', hot: V3(0, 1, 22) };
    }
    if (kind === 1) {                       // stern with engine bells and a torn front
      K.loft([{ z: -10, pts: ring(22, 9, -7, .62, .62, .5) }, { z: 40, pts: ring(20, 8, -6, .62, .62, .5) }, { z: 60, pts: ring(19, 7, -6, .62, .62, .5) }], COL.DARK);
      for (const x of [-12, -4, 4, 12]) { K.cyl(3.2, 8, x, 0, 64, COL.DARK, Math.PI / 2, 0, 0, 1.18); if (rand() < .5) K.gcyl(2.8, .3, x, 0, 68.2, [1.2, .5, .2], Math.PI / 2); }
      greeb(16, 25, 8, 24); K.gbox(40, 12, .6, 0, .5, -10.3, OR); ribs(-10, 15, 10, 16, -1);
      return { geo: K, mat: 'B', hot: V3(0, 1, -12) };
    }
    if (kind === 2) {                       // armour slab with a leaning tower stump
      K.box(70, 2.5, 46, 0, 0, 0, COL.W, .08, .1, .05);
      for (let i = 0; i < 6; i++) K.box(1.5, 5, 44, -30 + i * 12, -3.5, 0, COL.DARK);
      for (let i = 0; i < 4; i++) K.box(rr(6, 12), .3, rr(6, 12), rr(-26, 26), 1.4, rr(-14, 14), COL.BLK);
      greeb(30, 18, 1.2, 18);
      K.box(14, 6, 14, 10, 4.5, 5, COL.W); K.box(9, 5, 9, 10, 10, 5, COL.W, 0, .2, .35); K.cyl(.3, 14, 12, 18, 5, COL.DARK, .25);
      K.gbox(20, .5, 1, -10, 1.6, 22, OR);
      return { geo: K, mat: 'A', hot: V3(-10, 3, 20) };
    }
    K.cyl(9, 50, 0, 0, 0, COL.DARK, Math.PI / 2);                // engine pod
    for (let i = 0; i < 4; i++) K.cyl(10, 1.4, 0, 0, -20 + i * 13, COL.W, Math.PI / 2);
    K.cyl(5, 9, 0, 0, -29, COL.DARK, Math.PI / 2, 0, 0, 1.3); K.cyl(8, 9, 0, 0, 29, COL.DARK, Math.PI / 2, 0, 0, .5);
    ribs(29, 8, 10, 14, 1); greeb(7, 20, 9, 12); K.gbox(14, 14, .6, 0, 0, 33, OR);
    for (let i = 0; i < 5; i++) K.box(.5, .5, rr(10, 24), rr(-8, 8), rr(-8, 8), 40 + rr(0, 6), COL.BLK, rr(-.4, .4), rr(-.4, .4), 0);
    return { geo: K, mat: 'B', hot: V3(0, 0, 34) };
  }
  const W = [];
  for (let i = 0; i < 12; i++) {
    const def = wreck(i % 4), g = new THREE.Group(), s = rr(1, 2.2), r = rr(1500, 3200);
    const hullMat = HULL_MAT[def.mat].clone(); hullMat.color.setScalar(.5);   // scorched
    g.add(new THREE.Mesh(def.geo.geometry(), hullMat), new THREE.Mesh(def.geo.glowGeometry(), GLOW_MAT));
    g.scale.setScalar(s); scene.add(g);
    let a0 = rr(0, 6.2832); while (Math.hypot(Math.cos(a0) * r - CAM_HOME.x, Math.sin(a0) * r - CAM_HOME.z) < 900) a0 = rr(0, 6.2832);
    W.push({ g, s, r, a0, w: rr(12, 24) / r * (rand() < .5 ? -1 : 1), y: rr(-350, 450), ph: rr(0, 6.28), ax: V3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), spin: rr(.02, .1) * (rand() < .5 ? -1 : 1), q0: rr(0, 6.28), hot: def.hot, acc: rr(0, .2) });
  }
  const _p = V3();
  onFrame((dt, t) => {
    for (const o of W) {
      const a = o.a0 + o.w * t;
      o.g.position.set(Math.cos(a) * o.r, o.y + Math.sin(t * .02 + o.ph) * 40, Math.sin(a) * o.r);
      o.g.quaternion.setFromAxisAngle(o.ax, o.q0 + o.spin * t); o.g.updateMatrixWorld(true);
      o.acc += dt; if (o.acc < .12) continue; o.acc = 0;
      o.g.localToWorld(_p.copy(o.hot));
      FIRE.emit(_p.x, _p.y, _p.z, rr2(-2, 2), rr2(-2, 2), rr2(-2, 2), rr2(.8, 1.8), 4 * o.s, 12 * o.s, 1, 1, 1);
      if (rnd() < .5) SMOKE.emit(_p.x, _p.y, _p.z, rr2(-2, 2), rr2(-2, 2), rr2(-2, 2), rr2(4, 8), 3 * o.s, 14 * o.s, .07, .065, .07);
    }
  });
})();
