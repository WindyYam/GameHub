'use strict';

/* =====================================================================
   STEP 7 — DISTANT ASTEROIDS
   ===================================================================== */

// ---------- asteroids: a few huge rocks and a wide belt far out, so they read as scenery ----------
const ROCKS = (() => {
  const hsh = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const L = (a, b, t) => a + (b - a) * t;
    return L(L(L(hsh(ix, iy, iz), hsh(ix + 1, iy, iz), ux), L(hsh(ix, iy + 1, iz), hsh(ix + 1, iy + 1, iz), ux), uy),
      L(L(hsh(ix, iy, iz + 1), hsh(ix + 1, iy, iz + 1), ux), L(hsh(ix, iy + 1, iz + 1), hsh(ix + 1, iy + 1, iz + 1), ux), uy), uz);
  };
  const mkGeo = seed => {
    // dense, welded sphere so normals can be smoothed; lumpy silhouette + craters + fine surface grain
    let g = new THREE.IcosahedronGeometry(1, 9); g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = THREE.BufferGeometryUtils.mergeVertices(g, 1e-4);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), crt = [];
    const cr = mulberry32(Math.floor(seed * 1000) + 5), cu = (a, b) => a + (b - a) * cr();   // local RNG: keeps the scene layout sequence untouched
    for (let i = 0; i < 26; i++) { const u = cu(-1, 1), a = cu(0, 6.2832), s = Math.sqrt(1 - u * u), k = Math.pow(cr(), 1.8); crt.push({ x: s * Math.cos(a), y: u, z: s * Math.sin(a), r: .07 + k * .3, d: .025 + k * .08 }); }
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ridge = 1 - Math.abs(noise(x * 5 + seed, y * 5, z * 5 + 3) * 2 - 1);
      let r = 1 + .5 * (noise(x * 1.2 + seed, y * 1.2 + seed * 2, z * 1.2) - .5) + .2 * (noise(x * 3 + seed, y * 3, z * 3 + seed) - .5)
        + .07 * (ridge * ridge - .4) + .05 * (noise(x * 11 + seed, y * 11 + 4, z * 11) - .5) + .025 * (noise(x * 26, y * 26 + seed, z * 26) - .5);
      for (const c of crt) {
        const d = Math.hypot(x - c.x, y - c.y, z - c.z) / c.r;
        if (d < 1.3) r -= d < 1 ? c.d * (1 - d * d) * (1 - d * d * .35) : 0, r += c.d * .45 * Math.exp(-Math.pow((d - 1.02) / .1, 2));   // bowl with a raised rim
      }
      p.setXYZ(i, x * r, y * r, z * r);
      const sh = .55 + .5 * noise(x * 3 + 9, y * 3, z * 3 + seed) + .12 * (noise(x * 14, y * 14, z * 14 + seed) - .5); col[i * 3] = sh; col[i * 3 + 1] = sh * .96; col[i * 3 + 2] = sh * .92;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
  };
  const rocks = [];
  const add = (x, y, z, s, tint) => {
    const b = tint * rr(.8, 1.2) * .5, t = pick([[.55, .5, .45], [.42, .4, .4], [.5, .42, .35], [.35, .36, .4]]);
    rocks.push({
      p: V3(x, y, z), sc: V3(rr(.75, 1.25), rr(.65, 1.1), rr(.8, 1.3)).multiplyScalar(s), ax: V3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(),
      spin: rr(-1, 1) * .25 / Math.sqrt(1 + s / 8), a0: rr(0, 6.28), dr: V3(rr(-1, 1), rr(-.3, .3), rr(-1, 1)).normalize(), amp: rr(4, 22), ph: rr(0, 6.28), c: [t[0] * b, t[1] * b, t[2] * b]
    });
  };
  for (const [x, y, z, s] of [[-2400, -150, -1800, 110], [2600, 200, -2000, 90], [-900, 320, -3000, 130], [2000, -250, -2800, 85], [-3000, 100, 300, 100]]) add(x, y, z, s, .9);
  for (let i = 0; i < 220; i++) {                                    // wide belt behind the battle
    const a = rr(0, 6.2832), r = rr(3400, 4600);
    add(Math.cos(a) * r, rr(-300, 300) + Math.sin(a * 3) * 150, Math.sin(a) * r - 300, 18 + Math.pow(rand(), 2.5) * 65, .8);
  }
  const batches = [0, 1, 2].map(k => {
    const mine = rocks.filter((_, i) => i % 3 === k);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: .05 });
    const im = new THREE.InstancedMesh(mkGeo(k * 7.3 + 1), mat, mine.length); im.frustumCulled = false;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 3), 3);
    mine.forEach((r, i) => im.setColorAt(i, new THREE.Color(...r.c)));
    scene.add(im); return { im, mine };
  });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = V3();
  onFrame((dt, t) => {
    for (const { im, mine } of batches) {
      for (let i = 0; i < mine.length; i++) {
        const r = mine[i], o = Math.sin(t * .03 + r.ph) * r.amp;
        Q.setFromAxisAngle(r.ax, r.a0 + r.spin * t);
        M.compose(P.set(r.p.x + r.dr.x * o, r.p.y + r.dr.y * o, r.p.z + r.dr.z * o), Q, r.sc); im.setMatrixAt(i, M);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  });
  return rocks;
})();
