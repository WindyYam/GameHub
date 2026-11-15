// js/modules/people/stage.js — placing figures: paths with levels, movers that are closed forms of film time, the
// camera-corridor test, small conveniences shared by the crowd and by the staged vignettes.

export function createStage(ctx, sys, cast) {
  const { ground, layout, film, mathx: M } = ctx;
  const LIFT = 0.07;                                                // street surfaces lie 5 to 9 cm above the ground model
  const standY = (x, z) => ground.height(x, z) + LIFT;

  // ---- the camera path near the ground, for the corridor test ---------------------------------------------------
  const HZ = 120, low = [];
  {
    const n = Math.round(film.duration * HZ);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / HZ, p = film.pathPoseAt(t).pos;
      if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) < 0.02) continue;      // standing still: one sample is enough
      const g = ground.height(p[0], p[2]);
      if (p[1] - Math.max(g, ground.waterLevel) < 34) { low.push(t, p[0], p[1], p[2]); prev = p; }
    }
  }
  const lowN = low.length / 4;
  /** Distance from the film camera to an upright figure (a segment of `height` m above its feet), over the whole film. */
  function clearance(posAt, height, reach = 130) {
    // posAt: [x, y, z] (static) or (t, out) => fills out.x, out.y, out.z
    const fn = typeof posAt === 'function' ? posAt : null, S = { x: 0, y: 0, z: 0, az: 0, s: 0, hide: false };
    let best = Infinity, x0, y0, z0;
    if (fn) { fn(0, S); x0 = S.x; z0 = S.z; } else { x0 = posAt[0]; y0 = posAt[1]; z0 = posAt[2]; }
    for (let i = 0; i < lowN; i++) {
      const cx = low[i * 4 + 1], cy = low[i * 4 + 2], cz = low[i * 4 + 3];
      let dx = cx - x0, dz = cz - z0;
      if (fn) { if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue; S.hide = false; fn(low[i * 4], S); if (S.hide) continue; dx = cx - S.x; dz = cz - S.z; y0 = S.y; } else if (dx > 6 || dx < -6 || dz > 6 || dz < -6) continue;
      const dy = cy < y0 ? y0 - cy : cy > y0 + height ? cy - y0 - height : 0, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) best = d;
    }
    return best;
  }
  let dropped = 0;
  /** Add a figure unless the film camera would pass within `min` metres of it. Returns the figure or null. */
  function place(f, min = 1.0) {
    const h = (f.kind === 'quad' ? (sys.SPECIES[f.species] ? sys.SPECIES[f.species].wither + 0.3 : 0.4) : f.kind === 'bird' ? 0.4 : (f.base === 'sit' || f.base === 'squat' ? 1.0 : f.base === 'sitEdge' ? 0.9 + (f.seat || 0.45) : 1.8 + (f.tall || 0))) * (f.scale || 1);
    const t0 = f.t0 === undefined ? -Infinity : f.t0, t1 = f.t1 === undefined ? Infinity : f.t1;
    const c = clearance(f.move ? (t, S) => { if (t < t0 || t >= t1) { S.hide = true; return; } f.move(t, S, f); } : [f.x, f.y, f.z], h);
    if (c < min) { dropped++; return null; }
    return sys.add(f);
  }

  // ---- paths: a polyline resampled at 1 m with the level of the surface ------------------------------------------
  /** line: [[x, z], ...]; offset: metres to the right of travel; yAt(x, z) -> level. */
  function makePath(line, offset = 0, yAt = standY, step = 1.0) {
    const pl = offset ? M.offsetPolyline(line, offset) : line, len = M.polylineLength(pl), n = Math.max(2, Math.ceil(len / step) + 1);
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const h = M.pointAlong(pl, Math.min(len, i * len / (n - 1))); pts[i * 3] = h.x; pts[i * 3 + 1] = yAt(h.x, h.z); pts[i * 3 + 2] = h.z; }
    return { pts, n, len, step: len / (n - 1) };
  }
  /** Position and heading at chainage s (clamped). dir = +1 / -1 for the way of travel. */
  function pathAt(path, s, dir, S) {
    const u = Math.min(path.n - 1.0001, Math.max(0, s / path.step)), i = Math.floor(u), k = u - i, p = path.pts, a = i * 3, b = a + 3;
    S.x = p[a] + (p[b] - p[a]) * k; S.y = p[a + 1] + (p[b + 1] - p[a + 1]) * k; S.z = p[a + 2] + (p[b + 2] - p[a + 2]) * k;
    // heading from a chord round the point, so corners are turned, not snapped
    const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(path.n - 1, i + 2) * 3;
    S.az = Math.atan2((p[i1] - p[i0]) * dir, -(p[i1 + 2] - p[i0 + 2]) * dir) * 57.29577951308232;
    return S;
  }
  /**
   * A walker on a path: starts at s0 at film time tRef, walks at v (m/s, sign = direction), stops at the ends
   * (stands there). Sets f.move.
   */
  function walkOn(f, path, s0, v, tRef = 0) {
    const dir = v >= 0 ? 1 : -1;
    f.base = f.base || 'walk';
    f.move = (t, S) => {
      const s = s0 + v * (t - tRef);
      S.moving = s > 0.05 && s < path.len - 0.05;
      pathAt(path, s, dir, S);
      S.s = Math.abs(v) * t;
    };
    f.x = path.pts[0]; f.y = path.pts[1]; f.z = path.pts[2];
    return f;
  }
  /** A walker on a straight line a -> b (world [x, y, z]), starting at fraction k0 at tRef; `loop`: walk it again and again. */
  function walkLine(f, a, b, v, k0 = 0, tRef = 0, loop = false) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dz), az = Math.atan2(dx, -dz) * 57.29577951308232;
    f.base = f.base || 'walk';
    f.move = (t, S) => {
      let s = k0 * len + v * (t - tRef);
      if (loop) s = ((s % len) + len) % len;
      S.moving = s > 0 && s < len;
      const k = Math.min(1, Math.max(0, s / len));
      S.x = a[0] + dx * k; S.y = a[1] + dy * k; S.z = a[2] + dz * k; S.az = az; S.s = v * t;
    };
    f.x = a[0]; f.y = a[1]; f.z = a[2];
    return f;
  }
  const fixed = (f, x, y, z, az) => { f.x = x; f.y = y; f.z = z; f.az = az; return f; };
  const azTo = (x0, z0, x1, z1) => Math.atan2(x1 - x0, -(z1 - z0)) * 57.29577951308232;

  /** A knot of n people talking: standing in a ring, facing its middle. Returns the figures placed. */
  function group(x, z, y, n, rng, roles, opts = {}) {
    const out = [], r = 0.45 + 0.16 * n, a0 = rng.range(0, 6.283);
    for (let i = 0; i < n; i++) {
      const a = a0 + i * 6.283 / n + rng.range(-0.25, 0.25), px = x + Math.sin(a) * r, pz = z - Math.cos(a) * r;
      const f = cast.dress(typeof roles === 'function' ? roles(i) : rng.pick(roles), rng, { base: 'stand', ...opts }); delete f.tag;
      if (!f.arms && rng.chance(0.45)) f.arms = rng.pick(['talk', 'hips', 'talk', 'point']);
      if (f.arms === 'staff' || f.arms === 'spear') { /* keeps what it holds */ }
      fixed(f, px, y === null ? standY(px, pz) : y, pz, azTo(px, pz, x, z) + rng.range(-15, 15));
      f.tag = opts.tag || 'group';
      const g = place(f); if (g) out.push(g);
    }
    return out;
  }

  return { LIFT, standY, clearance, place, makePath, pathAt, walkOn, walkLine, fixed, azTo, group, get dropped() { return dropped; }, lowSamples: lowN };
}
