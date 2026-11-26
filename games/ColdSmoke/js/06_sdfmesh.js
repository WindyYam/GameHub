"use strict";
// ---------------------------------------------------------------- distance fields -> triangle meshes (surface nets on a narrow band)
// Solid objects (skier, trees, animals) are modelled as signed distance functions and meshed once at boot,
// so they can be skinned, instanced and shadow-mapped cheaply. Nothing is loaded: the shapes are these functions.

// (plain square roots, not Math.hypot: the same numbers at twice the speed, and these are asked for hundreds of thousands of times while the page loads)
const sd = {
  // (written with comparisons, not Math.min / max / abs: the same numbers, NaN included, but V8 ran the Math version some thirty times slower here,
  // and the skier's body alone asks for it millions of times while the page loads: 4.1 s of its 4.2 s mesh in node, 1.5 s now)
  smin(a, b, k) { const d = a - b, h = k - (d < 0 ? -d : d), m = a < b ? a : b <= a ? b : NaN; if (!(h > 0)) return m; const q = h / k; return m - q * q * k * 0.25; },
  smax(a, b, k) { const d = a - b, h = k - (d < 0 ? -d : d), m = a > b ? a : b >= a ? b : NaN; if (!(h > 0)) return m; const q = h / k; return m + q * q * k * 0.25; },
  sphere(x, y, z, cx, cy, cz, r) { const dx = x - cx, dy = y - cy, dz = z - cz; return Math.sqrt(dx * dx + dy * dy + dz * dz) - r; },
  ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) { const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz, k0 = Math.sqrt(px * px + py * py + pz * pz), ax = px / rx, ay = py / ry, az = pz / rz, k1 = Math.sqrt(ax * ax + ay * ay + az * az); return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz); },
  // capsule between a and b with radii ra -> rb (linear taper)
  capsule(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
    const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    const ex = pax - bax * h, ey = pay - bay * h, ez = paz - baz * h;
    return Math.sqrt(ex * ex + ey * ey + ez * ez) - (ra + (rb - ra) * h);
  },
  rbox(x, y, z, cx, cy, cz, hx, hy, hz, r) {
    const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
    const ax = qx > 0 ? qx : 0, ay = qy > 0 ? qy : 0, az = qz > 0 ? qz : 0;
    return Math.sqrt(ax * ax + ay * ay + az * az) + Math.min(Math.max(qx, qy, qz), 0) - r;
  },
  // cone-ish drooping disc: a "tier" of a snow-laden conifer (see trees)
  torusY(x, y, z, cx, cy, cz, R, r) { const q = Math.hypot(x - cx, z - cz) - R; return Math.hypot(q, y - cy) - r; },
};

// meshSDF(f, bmin, bmax, cell, {band, attr, stride, repair}) -> { verts: Float32Array (px,py,pz,nx,ny,nz,a0,a1,a2,a3)*, idx: Uint32Array, nv }
function meshSDF(f, bmin, bmax, cell, opt = {}) {
  const S = opt.stride || 4, band = opt.band || 0;
  const cnt = d => Math.ceil((bmax[d] - bmin[d]) / cell / S) * S + 1;
  const nx = cnt(0), ny = cnt(1), nz = cnt(2), nxy = nx * ny, total = nxy * nz;
  const vals = new Float32Array(total).fill(NaN);
  const X = i => bmin[0] + i * cell, Y = j => bmin[1] + j * cell, Z = k => bmin[2] + k * cell;
  // coarse pass
  for (let k = 0; k < nz; k += S) for (let j = 0; j < ny; j += S) for (let i = 0; i < nx; i += S) vals[i + j * nx + k * nxy] = f(X(i), Y(j), Z(k));
  const thr = S * cell * 1.75 + band;
  // refine coarse cells that may contain the surface
  for (let k = 0; k < nz - 1; k += S) for (let j = 0; j < ny - 1; j += S) for (let i = 0; i < nx - 1; i += S) {
    let m = 1e9, anyNeg = false, anyPos = false;
    for (let c = 0; c < 8; c++) { const v = vals[(i + (c & 1) * S) + (j + ((c >> 1) & 1) * S) * nx + (k + (c >> 2) * S) * nxy]; if (Math.abs(v) < m) m = Math.abs(v); if (v < 0) anyNeg = true; else anyPos = true; }
    if (m > thr && !(anyNeg && anyPos)) continue;
    for (let c = k; c <= k + S; c++) for (let b = j; b <= j + S; b++) { let o = i + b * nx + c * nxy; for (let a = i; a <= i + S; a++, o++) if (vals[o] !== vals[o]) vals[o] = f(X(a), Y(b), Z(c)); }
  }
  // one vertex per sign-changing cell
  const cellV = new Int32Array(total).fill(-1);
  let verts = new Float32Array(1 << 16), nv = 0;
  const corner = new Float32Array(8);
  const E0 = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3], E1 = [1, 3, 3, 2, 5, 7, 7, 6, 4, 5, 6, 7];   // cube edges (corner bit0=x, bit1=y, bit2=z) -> pairs differing in one bit
  const EA = [[0, 1], [1, 3], [2, 3], [0, 2], [4, 5], [5, 7], [6, 7], [4, 6], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const o = i + j * nx + k * nxy; let mask = 0, ok = true;
    for (let c = 0; c < 8; c++) { const v = vals[o + (c & 1) + ((c >> 1) & 1) * nx + (c >> 2) * nxy]; if (v !== v) { ok = false; break; } corner[c] = v; if (v < 0) mask |= 1 << c; }
    if (!ok || mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 12; e++) {
      const a = EA[e][0], b = EA[e][1], va = corner[a], vb = corner[b]; if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t; n++;
    }
    if (nv * 10 + 10 > verts.length) { const nvb = new Float32Array(verts.length * 2); nvb.set(verts); verts = nvb; }
    verts[nv * 10] = X(i + sx / n); verts[nv * 10 + 1] = Y(j + sy / n); verts[nv * 10 + 2] = Z(k + sz / n);
    cellV[o] = nv++;
  }
  // normals from the field gradient (tetrahedral differences)
  const e = cell * 0.5, at = [0, 0, 0, 0], conf = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const x = verts[v * 10], y = verts[v * 10 + 1], z = verts[v * 10 + 2];
    const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
    let gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d; const l = Math.hypot(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
    verts[v * 10 + 3] = gx; verts[v * 10 + 4] = gy; verts[v * 10 + 5] = gz;
    // where a sheet is thinner than the grid the four samples straddle both of its faces and the gradient means little: it is
    // short there (a true distance field gives 4e), and neither it nor the step below is to be trusted
    const q = conf[v] = Math.min(1, Math.max(0, (l / (4 * e) - 0.45) / 0.35));
    // pull the vertex onto the true surface (one Newton step) — tightens thin features
    const d0 = Math.max(-e, Math.min(e, (a + b + c + d) * 0.25)) * 0.8 * q; verts[v * 10] -= gx * d0; verts[v * 10 + 1] -= gy * d0; verts[v * 10 + 2] -= gz * d0;
  }
  // quads across every sign-changing grid edge
  let idx = new Uint32Array(1 << 17), ni = 0;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (ni + 6 > idx.length) { const n2 = new Uint32Array(idx.length * 2); n2.set(idx); idx = n2; }
    // a quad of the net is rarely flat: it is cut along whichever diagonal folds it least
    if (bend(a, b, c, a, c, d) < bend(b, c, d, b, d, a)) { const t = a; a = b; b = c; c = d; d = t; }
    if (flip) { idx[ni++] = a; idx[ni++] = c; idx[ni++] = b; idx[ni++] = a; idx[ni++] = d; idx[ni++] = c; } else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
  };
  const tn = (a, b, c, o) => {
    a *= 10; b *= 10; c *= 10;
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2], wx = verts[c] - verts[a], wy = verts[c + 1] - verts[a + 1], wz = verts[c + 2] - verts[a + 2];
    o[0] = uy * wz - uz * wy; o[1] = uz * wx - ux * wz; o[2] = ux * wy - uy * wx; const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l;
  };
  const _n1 = [0, 0, 0], _n2 = [0, 0, 0];
  const bend = (a, b, c, d, e2, g) => { tn(a, b, c, _n1); tn(d, e2, g, _n2); return _n1[0] * _n2[0] + _n1[1] * _n2[1] + _n1[2] * _n2[2]; };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const o = i + j * nx + k * nxy, v0 = vals[o]; if (v0 !== v0) continue; const s0 = v0 < 0;
    let v1 = vals[o + 1]; if (v1 === v1 && (v1 < 0) !== s0) quad(cellV[o - nx - nxy], cellV[o - nxy], cellV[o], cellV[o - nx], !s0);
    v1 = vals[o + nx]; if (v1 === v1 && (v1 < 0) !== s0) quad(cellV[o - 1 - nxy], cellV[o - 1], cellV[o], cellV[o - nxy], !s0);
    v1 = vals[o + nxy]; if (v1 === v1 && (v1 < 0) !== s0) quad(cellV[o - 1 - nx], cellV[o - nx], cellV[o], cellV[o - 1], !s0);
  }
  // the mesh has an opinion about its normals too (the faces round each vertex). Where the field's is unsure, or the two disagree, the mesh wins:
  // one vertex lit from the wrong side is a dark diamond on the surface
  const fn = new Float32Array(nv * 3), unsure = new Uint8Array(nv);
  const faceNormals = () => {
    fn.fill(0);
    for (let i = 0; i < ni; i += 3) {
      const a = idx[i] * 10, b = idx[i + 1] * 10, c = idx[i + 2] * 10;
      const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2], wx = verts[c] - verts[a], wy = verts[c + 1] - verts[a + 1], wz = verts[c + 2] - verts[a + 2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      for (const q of [a, b, c]) { const o = q / 10 * 3; fn[o] += cx; fn[o + 1] += cy; fn[o + 2] += cz; }
    }
  };
  faceNormals();
  for (let v = 0; v < nv; v++) {
    const mx = fn[v * 3], my = fn[v * 3 + 1], mz = fn[v * 3 + 2], ml = Math.hypot(mx, my, mz);
    if (conf[v] < 0.5 || ml < 1e-12 || (verts[v * 10 + 3] * mx + verts[v * 10 + 4] * my + verts[v * 10 + 5] * mz) / ml < 0.45) unsure[v] = 1;
  }
  // such a vertex was also stepped "onto the surface" along a direction that meant nothing, and now sits in a pit or on a spike:
  // it goes back to the middle of its neighbours
  if (opt.repair) {
    const acc = new Float32Array(nv * 4);
    for (let pass = 0; pass < 2; pass++) {
      acc.fill(0);
      for (let i = 0; i < ni; i += 3) for (let q = 0; q < 3; q++) {
        const a = idx[i + q]; if (!unsure[a]) continue;
        for (let r = 1; r < 3; r++) { const b = idx[i + (q + r) % 3] * 10; acc[a * 4] += verts[b]; acc[a * 4 + 1] += verts[b + 1]; acc[a * 4 + 2] += verts[b + 2]; acc[a * 4 + 3]++; }
      }
      for (let v = 0; v < nv; v++) if (unsure[v] && acc[v * 4 + 3] > 0) { const k = 1 / acc[v * 4 + 3]; verts[v * 10] = acc[v * 4] * k; verts[v * 10 + 1] = acc[v * 4 + 1] * k; verts[v * 10 + 2] = acc[v * 4 + 2] * k; }
    }
    faceNormals();
  }
  for (let v = 0; v < nv; v++) {
    let mx = fn[v * 3], my = fn[v * 3 + 1], mz = fn[v * 3 + 2]; const ml = Math.hypot(mx, my, mz);
    let gx = verts[v * 10 + 3], gy = verts[v * 10 + 4], gz = verts[v * 10 + 5];
    if (ml > 1e-12) {
      mx /= ml; my /= ml; mz /= ml;
      const agree = gx * mx + gy * my + gz * mz, w = unsure[v] ? 0 : conf[v] * Math.min(1, Math.max(0, (agree - 0.2) / 0.5));
      gx = mx + (gx - mx) * w; gy = my + (gy - my) * w; gz = mz + (gz - mz) * w; const l = Math.hypot(gx, gy, gz) || 1;
      verts[v * 10 + 3] = gx /= l; verts[v * 10 + 4] = gy /= l; verts[v * 10 + 5] = gz /= l;
    }
    if (opt.attr) { at[0] = at[1] = at[2] = at[3] = 0; opt.attr(verts[v * 10], verts[v * 10 + 1], verts[v * 10 + 2], gx, gy, gz, at); verts[v * 10 + 6] = at[0]; verts[v * 10 + 7] = at[1]; verts[v * 10 + 8] = at[2]; verts[v * 10 + 9] = at[3]; }
  }
  // what such a vertex says about itself (how much sky it sees, what it is made of) was measured from a place between two faces
  // of a thin sheet: it takes its neighbours' word instead
  if (opt.attr && opt.repair) {
    const acc = new Float32Array(nv * 5);
    for (let i = 0; i < ni; i += 3) for (let q = 0; q < 3; q++) {
      const a = idx[i + q]; if (!unsure[a]) continue;
      for (let r = 1; r < 3; r++) { const b = idx[i + (q + r) % 3]; if (unsure[b]) continue; acc[a * 5] += verts[b * 10 + 6]; acc[a * 5 + 1] += verts[b * 10 + 7]; acc[a * 5 + 2] += verts[b * 10 + 8]; acc[a * 5 + 3] += verts[b * 10 + 9]; acc[a * 5 + 4]++; }
    }
    for (let v = 0; v < nv; v++) if (unsure[v] && acc[v * 5 + 4] > 0) { const k = 1 / acc[v * 5 + 4]; for (let c = 0; c < 4; c++) verts[v * 10 + 6 + c] = acc[v * 5 + c] * k; }
  }
  return { verts: verts.subarray(0, nv * 10), idx: idx.subarray(0, ni), nv, ni };
}

// append parametric geometry (same 10-float vertex layout) — used for skis and poles, which are too thin for the grid
function meshBuilder() {
  const v = [], idx = [];
  const B = {
    v, idx,
    vert(p, n, a) { v.push(p[0], p[1], p[2], n[0], n[1], n[2], a[0], a[1], a[2], a[3]); return v.length / 10 - 1; },
    quad(a, b, c, d) { idx.push(a, b, c, a, c, d); },
    tri(a, b, c) { idx.push(a, b, c); },
    // swept closed loop: rings[i] = array of [p, n]; connects consecutive rings
    sweep(rings, attr, capStart, capEnd) {
      const m = rings[0].length, base = v.length / 10;
      for (const r of rings) for (const pn of r) B.vert(pn[0], pn[1], attr);
      for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < m; j++) { const a = base + i * m + j, b = base + i * m + (j + 1) % m, c = base + (i + 1) * m + (j + 1) % m, d = base + (i + 1) * m + j; B.quad(a, d, c, b); }
      const cap = (ri, flip, nrm) => { const c0 = [0, 0, 0]; for (const pn of rings[ri]) { c0[0] += pn[0][0] / m; c0[1] += pn[0][1] / m; c0[2] += pn[0][2] / m; } const ci = B.vert(c0, nrm, attr), b0 = v.length / 10; for (const pn of rings[ri]) B.vert(pn[0], nrm, attr); for (let j = 0; j < m; j++) { const a = b0 + j, b = b0 + (j + 1) % m; if (flip) B.tri(ci, b, a); else B.tri(ci, a, b); } };
      if (capStart) cap(0, false, capStart); if (capEnd) cap(rings.length - 1, true, capEnd);
    },
    merge(mesh) { const base = v.length / 10; for (let i = 0; i < mesh.verts.length; i++) v.push(mesh.verts[i]); for (let i = 0; i < mesh.idx.length; i++) idx.push(mesh.idx[i] + base); },
    done() { return { verts: new Float32Array(v), idx: new Uint32Array(idx), nv: v.length / 10, ni: idx.length }; },
  };
  return B;
}
