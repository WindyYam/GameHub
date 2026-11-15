// js/modules/people/props.js — the few static props the vignettes bring themselves (the roof of the Great House,
// goods beside the figures of the Merkes street and the quay): reed mats, jars, baskets, bedding, a ground loom,
// an awning on poles, a ladder. Four materials, merged per material, through the tile batcher.

export function createProps(ctx) {
  const { geom, materials, THREE, mathx: M } = ctx;
  const cloth = materials.variant('woolCream', { name: 'people-props-cloth', color: 0xffffff });
  const bucket = { reed: [], clay: [], wood: [], cloth: [] };
  const matOf = { reed: 'reedMat', clay: materials.preset('pottery'), wood: 'palmWood', cloth };
  const C = (id, k = 1) => { const c = materials.color(id); return [c.r * k, c.g * k, c.b * k]; };
  let count = 0;

  const lathe = (pts, seg = 10) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const put = (b, g, x, y, z, rotDeg = 0, scale = 1, tint = null) => {
    if (g.attributes.uv) g.deleteAttribute('uv');
    geom.ensureAttributes(g);
    if (tint) geom.paint(g, tint);
    bucket[b].push(geom.transform(g, { x, y, z, rotDeg, scale }));
  };
  const box = (b, x, y, z, sx, sy, sz, rotDeg = 0, tint = null) => { const g = geom.box({ x: 0, z: 0, y0: 0, y1: sy, sx, sz }); put(b, g, x, y, z, rotDeg, 1, tint); };

  const api = {
    get count() { return count; },
    /** A storage jar standing on the floor; size = height in metres (0.3 a water jar ... 0.9 a store jar). */
    jar(x, y, z, size = 0.6, tint = null, rot = 0) {
      const s = size / 0.64;
      put('clay', lathe([[0.001, 0], [0.11, 0], [0.2, 0.1], [0.245, 0.26], [0.225, 0.44], [0.13, 0.56], [0.105, 0.6], [0.135, 0.64], [0.1, 0.63], [0.085, 0.57], [0.001, 0.55]], 10), x, y, z, rot, s, tint);
      count++;
    },
    /** A bowl or dish. */
    bowl(x, y, z, r = 0.16, tint = null) { put('clay', lathe([[0.001, 0], [0.4, 0], [0.9, 0.3], [1, 0.42], [0.92, 0.42], [0.8, 0.28], [0.001, 0.1]], 8), x, y, z, 0, r, tint); count++; },
    /** A round basket, optionally heaped (dates, bread, wool). */
    basket(x, y, z, r = 0.25, heap = null) {
      put('reed', lathe([[0.001, 0], [0.7, 0], [0.95, 0.5], [1, 0.72], [0.9, 0.72], [0.001, 0.6]], 9), x, y, z, 0, r, [0.92, 0.88, 0.8]);
      if (heap) put('cloth', lathe([[0.88, 0.55], [0.6, 0.85], [0.001, 0.98]], 8), x, y, z, 0, r, heap);
      count++;
    },
    /** A reed mat lying flat: w x d metres. */
    mat(x, y, z, w, d, rotDeg = 0, tint = null) { box('reed', x, y + 0.004, z, w, 0.025, d, rotDeg, tint); count++; },
    /** A woven rug or folded blanket. */
    rug(x, y, z, w, d, rotDeg, tint, h = 0.04) { box('cloth', x, y + 0.004, z, w, h, d, rotDeg, tint); count++; },
    /** A bedding roll. */
    roll(x, y, z, len, rotDeg, tint) {
      const g = new THREE.CylinderGeometry(0.13, 0.13, len, 8); g.rotateZ(Math.PI / 2);
      put('cloth', g, x, y + 0.13, z, rotDeg, 1, tint); count++;
    },
    /** A heap (grain, dates, wool) on a mat. */
    heap(x, y, z, r, h, tint) { put('cloth', lathe([[1, 0], [0.7, 0.55], [0.3, 0.9], [0.001, 1]], 9).scale(1, h / r, 1), x, y + 0.02, z, 0, r, tint); count++; },
    /** A horizontal ground loom: two beams on four pegs, the warp stretched between them, the cloth half woven. */
    loom(x, y, z, rotDeg, tint) {
      const L = 2.3, W = 0.9, [fx, fz] = M.rotateXZ(0, 1, rotDeg), [rx, rz] = M.rotateXZ(1, 0, rotDeg);
      for (const e of [-1, 1]) {
        box('wood', x + fx * e * L / 2, y + 0.16, z + fz * e * L / 2, W + 0.3, 0.06, 0.06, rotDeg);
        for (const s of [-1, 1]) box('wood', x + fx * e * L / 2 + rx * s * (W / 2 + 0.1), y, z + fz * e * L / 2 + rz * s * (W / 2 + 0.1), 0.05, 0.24, 0.05, rotDeg);
      }
      box('cloth', x + fx * 0.45, y + 0.19, z + fz * 0.45, W, 0.012, L - 0.95, rotDeg, [0.82, 0.78, 0.68]);       // warp
      box('cloth', x - fx * 0.7, y + 0.192, z - fz * 0.7, W, 0.02, 0.9, rotDeg, tint);                               // the woven part
      box('wood', x - fx * 0.2, y + 0.215, z - fz * 0.2, W + 0.2, 0.03, 0.035, rotDeg);                             // heddle rod
      count++;
    },
    /** An awning: reed matting or cloth on four poles, w x d metres, h high, sagging a little. */
    awning(x, y, z, w, d, rotDeg, h = 2.1, tint = null) {
      const [ax, az] = M.rotateXZ(1, 0, rotDeg), [bx, bz] = M.rotateXZ(0, 1, rotDeg);
      for (const s of [-1, 1]) for (const t of [-1, 1]) box('wood', x + ax * s * w / 2 + bx * t * d / 2, y, z + az * s * w / 2 + bz * t * d / 2, 0.07, h + (t > 0 ? 0 : 0.18), 0.07, rotDeg);
      for (const t of [-1, 1]) box('wood', x + bx * t * d / 2, y + h + (t > 0 ? -0.05 : 0.13), z + bz * t * d / 2, w + 0.3, 0.05, 0.05, rotDeg);
      // the cover in four strips, lower in the middle
      const n = 4;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n - 0.5, sag = 0.10 * (1 - 4 * u * u), yy = y + h + 0.02 + (0.5 - (i + 0.5) / n) * 0.18 - sag;
        box(tint ? 'cloth' : 'reed', x + bx * u * d, yy, z + bz * u * d, w + 0.25, 0.03, d / n + 0.03, rotDeg, tint);
      }
      count++;
    },
    /** A ladder leaning: foot at (x, z), climbing `rise` metres along azimuth az. */
    ladder(x, y, z, azDeg, rise, lean = 0.9) {
      const len = Math.hypot(rise, lean), pitch = Math.atan2(lean, rise), [dx, dz] = M.azToDir(azDeg), [rx, rz] = M.rightOf(dx, dz);
      for (const s of [-1, 1]) {
        const g = new THREE.CylinderGeometry(0.03, 0.035, len, 5); g.translate(0, len / 2, 0); g.rotateX(-pitch); g.rotateY(-azDeg * Math.PI / 180);
        put('wood', g, x + rx * s * 0.24, y, z + rz * s * 0.24);
      }
      const rungs = Math.floor(len / 0.32);
      for (let i = 1; i <= rungs; i++) { const k = i / (rungs + 1); box('wood', x + dx * lean * k, y + rise * k - 0.02, z + dz * lean * k, 0.52, 0.035, 0.035, azDeg); }
      count++;
    },
    /** A low mud-brick bench or a kerb to sit on. */
    block(b, x, y, z, sx, sy, sz, rotDeg, tint) { box(b, x, y, z, sx, sy, sz, rotDeg, tint); count++; },
    C,
    flush() {
      for (const k of Object.keys(bucket)) {
        if (!bucket[k].length) continue;
        geom.addStatic(matOf[k], geom.merge(bucket[k]), { lod: [0, 700], shadowTexel: 0.15 });
        bucket[k] = [];
      }
    },
  };
  return api;
}
