// js/modules/people/meshkit.js — a small loft builder for skinned figures.
// A figure is a set of closed shells ("lofts": stacks of elliptical rings) that interpenetrate: hair is a shell
// that passes inside the skull at the face, a beard a shell that bulges out of the lower face, a shawl a shell
// round the torso. Every vertex carries two bones and a weight, a part id (switched per instance by a bit mask)
// and a colour slot (which per-instance colour tints it). Normals are smooth inside one loft.
//
// Ring: { y | c: [x, y, z], rx, rz, cx, cz, tilt, tiltZ, w: [b0, b1, w0] | (th, x, y, z) => [b0, b1, w0],
//         col: [r, g, b] | (th, k) => [r, g, b], f: (th, k) => radial factor, dy: (th, k) => y offset,
//         edge: true (split the normals here; slotUp / colUp: slot and colour of the upper copy),
//         l: highest lod that keeps the ring (default: all) }
// Loft options: { seg, th0, angles (explicit ring angles in radians, ascending, instead of seg), part (bit index, -1 = always), slot, col, w, capTop, capBottom, u, v (ring axes), flip,
//         rot: 3x3 row-major, pivot, move }
// Winding: with ring axes u, v the rings must advance along v x u (default u = +x, v = +z: upward); `flip` reverses.

export class Buf {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.bone = []; this.slot = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  get tris() { return this.idx.length / 3; }

  loft(ringsIn, o = {}) {
    const lod = o.lod || 0;
    const rings = [];
    for (const r of ringsIn) { if (r.l !== undefined && lod > r.l) continue; rings.push(r); if (r.edge) rings.push({ ...r, _dup: true, slot: r.slotUp !== undefined ? r.slotUp : r.slot, col: r.colUp || r.col }); }
    if (rings.length < 2) return this;
    const seg = o.angles ? o.angles.length : (o.seg || 8), th0 = (o.th0 !== undefined ? o.th0 : 0.5) * (2 * Math.PI / seg);
    const u = o.u || [1, 0, 0], v = o.v || [0, 0, 1], ax = [v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2], v[0] * u[1] - v[1] * u[0]];
    const P = [], C = [], Bn = [], S = [], I = [];
    const part = o.part === undefined ? -1 : o.part, defSlot = o.slot || 0, defCol = o.col || [1, 1, 1], defW = o.w || [0, 0, 1];
    const put = (x, y, z, col, w, slot) => { P.push(x, y, z); C.push(col[0], col[1], col[2]); Bn.push(w[0], w[1], w[2], part + 1); S.push(slot); return P.length / 3 - 1; };
    const centre = (r) => {
      const c = r.c || [0, r.y, 0];
      return [c[0] + u[0] * (r.cx || 0) + v[0] * (r.cz || 0), c[1] + u[1] * (r.cx || 0) + v[1] * (r.cz || 0), c[2] + u[2] * (r.cx || 0) + v[2] * (r.cz || 0)];
    };
    const start = [];
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i], c = centre(r);
      start.push(P.length / 3);
      for (let k = 0; k < seg; k++) {
        const th = o.angles ? o.angles[k] : th0 + 2 * Math.PI * k / seg, f = r.f ? r.f(th, k) : 1;
        const a = Math.cos(th) * r.rx * f, b = Math.sin(th) * r.rz * f;
        const lift = (r.tilt || 0) * a + (r.tiltZ || 0) * b + (r.dy ? r.dy(th, k) : 0);
        const x = c[0] + u[0] * a + v[0] * b + ax[0] * lift, y = c[1] + u[1] * a + v[1] * b + ax[1] * lift, z = c[2] + u[2] * a + v[2] * b + ax[2] * lift;
        const col = typeof r.col === 'function' ? r.col(th, k) : (r.col || (typeof defCol === 'function' ? defCol(th, k) : defCol));
        const w0 = r.w || defW, w = typeof w0 === 'function' ? w0(th, x, y, z) : w0;
        put(x, y, z, col, w, r.slot !== undefined ? r.slot : defSlot);
      }
    }
    const tri = (a, b, c) => { if (o.flip) I.push(a, c, b); else I.push(a, b, c); };
    for (let i = 0; i + 1 < rings.length; i++) {
      if (rings[i + 1]._dup) continue;                       // the two copies of an edge ring are not joined
      for (let k = 0; k < seg; k++) {
        const a = start[i] + k, b = start[i] + (k + 1) % seg, c = start[i + 1] + k, d = start[i + 1] + (k + 1) % seg;
        tri(a, c, b); tri(b, c, d);
      }
    }
    const cap = (i, top, spec) => {
      const r = rings[i], c = centre(r), col = (spec && spec.col) || (typeof r.col === 'function' ? r.col(0, 0) : (r.col || (typeof defCol === 'function' ? defCol(0, 0) : defCol)));
      const w0 = r.w || defW, w = typeof w0 === 'function' ? w0(0, c[0], c[1], c[2]) : w0;
      const bulge = (spec && spec.bulge) || 0;
      let base = start[i];
      if (spec && spec.sharp) {                              // a flat cap with its own vertices
        base = P.length / 3;
        for (let k = 0; k < seg; k++) { const s = (start[i] + k) * 3; put(P[s], P[s + 1], P[s + 2], col, [Bn[(start[i] + k) * 4], Bn[(start[i] + k) * 4 + 1], Bn[(start[i] + k) * 4 + 2]], r.slot !== undefined ? r.slot : defSlot); }
      }
      const cc = put(c[0] + ax[0] * bulge * (top ? 1 : -1), c[1] + ax[1] * bulge * (top ? 1 : -1), c[2] + ax[2] * bulge * (top ? 1 : -1), col, w, r.slot !== undefined ? r.slot : defSlot);
      for (let k = 0; k < seg; k++) { const a = base + k, b = base + (k + 1) % seg; if (top) tri(cc, b, a); else tri(cc, a, b); }
    };
    if (o.capTop) cap(rings.length - 1, true, o.capTop === true ? null : o.capTop);
    if (o.capBottom) cap(0, false, o.capBottom === true ? null : o.capBottom);
    // smooth normals inside this loft
    const N = new Float32Array(P.length);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; }
    }
    // vertices of an edge pair and of the seam share positions: give coincident duplicates of an edge their own normal (already so)
    for (let q = 0; q < N.length; q += 3) { const l = Math.hypot(N[q], N[q + 1], N[q + 2]) || 1; N[q] /= l; N[q + 1] /= l; N[q + 2] /= l; }
    // transform and append
    const R = o.rot, pv = o.pivot || [0, 0, 0], mv = o.move || [0, 0, 0], off = this.count;
    for (let q = 0; q < P.length; q += 3) {
      let x = P[q], y = P[q + 1], z = P[q + 2], nx = N[q], ny = N[q + 1], nz = N[q + 2];
      if (R) {
        const dx = x - pv[0], dy = y - pv[1], dz = z - pv[2];
        x = pv[0] + R[0] * dx + R[1] * dy + R[2] * dz; y = pv[1] + R[3] * dx + R[4] * dy + R[5] * dz; z = pv[2] + R[6] * dx + R[7] * dy + R[8] * dz;
        const mx = R[0] * nx + R[1] * ny + R[2] * nz, my = R[3] * nx + R[4] * ny + R[5] * nz, mz = R[6] * nx + R[7] * ny + R[8] * nz; nx = mx; ny = my; nz = mz;
      }
      this.pos.push(x + mv[0], y + mv[1], z + mv[2]); this.nrm.push(nx, ny, nz);
    }
    for (const c of C) this.col.push(c);
    for (const b of Bn) this.bone.push(b);
    for (const s of S) this.slot.push(s);
    for (const i of I) this.idx.push(i + off);
    return this;
  }

  /** A box as a 4-sided loft (flat faces): centre, size, optional rotation. */
  box(c, size, o = {}) {
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2, k = Math.SQRT2;
    return this.loft([{ c: [c[0], c[1] - hy, c[2]], rx: hx * k, rz: hz * k, edge: true }, { c: [c[0], c[1] + hy, c[2]], rx: hx * k, rz: hz * k, edge: true }],
      { seg: 4, th0: 0.5, capTop: { sharp: true }, capBottom: { sharp: true }, ...o, pivot: o.pivot || c });
  }

  /** Mirror everything added since (v0, i0) in x: positions, normals, winding; bones through `map`. */
  mirror(v0, i0, map) {
    const v1 = this.count, i1 = this.idx.length, off = v1 - v0;
    for (let v = v0; v < v1; v++) {
      this.pos.push(-this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]);
      this.nrm.push(-this.nrm[v * 3], this.nrm[v * 3 + 1], this.nrm[v * 3 + 2]);
      this.col.push(this.col[v * 3], this.col[v * 3 + 1], this.col[v * 3 + 2]);
      const b0 = this.bone[v * 4], b1 = this.bone[v * 4 + 1];
      this.bone.push(map[b0] !== undefined ? map[b0] : b0, map[b1] !== undefined ? map[b1] : b1, this.bone[v * 4 + 2], this.bone[v * 4 + 3]);
      this.slot.push(this.slot[v]);
    }
    for (let i = i0; i < i1; i += 3) this.idx.push(this.idx[i] + off, this.idx[i + 2] + off, this.idx[i + 1] + off);
    return this;
  }

  toGeometry(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPplBone', new THREE.Float32BufferAttribute(this.bone, 4));
    g.setAttribute('aPplSlot', new THREE.Float32BufferAttribute(this.slot, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4);
    return g;
  }
}

export const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
export const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
export const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
export const mul3 = (A, B) => [
  A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7], A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
  A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7], A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
  A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7], A[6] * B[2] + A[7] * B[5] + A[8] * B[8]];
