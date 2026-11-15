// js/core/occlusion.js — Conservative Software Hi-Z Occlusion Culler (128x72 depth pyramid).
import * as M from './mathx.js';

const W = 128;
const H = 72;

export function createOcclusion(ctx) {
  // Build mip chain: L0 (128x72), L1 (64x36), L2 (32x18), L3 (16x9), L4 (8x5)
  const mips = [];
  let mw = W, mh = H;
  while (mw >= 8 && mh >= 4) {
    mips.push({ w: mw, h: mh, buf: new Float32Array(mw * mh) });
    if (mw === 8) break;
    mw = Math.ceil(mw / 2);
    mh = Math.ceil(mh / 2);
  }
  const L0 = mips[0].buf;

  // Pre-collect static wall & monument occluder AABBs (shrunk conservatively)
  const staticOccluders = [];
  if (ctx.world) {
    // Monuments (etemenanki, southPalace, esagila, etc.)
    for (const mon of ctx.world.monuments || []) {
      const fp = mon.footprint;
      if (!Array.isArray(fp) || fp.length < 3) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const p of fp) {
        if (p[0] < x0) x0 = p[0];
        if (p[0] > x1) x1 = p[0];
        if (p[1] < z0) z0 = p[1];
        if (p[1] > z1) z1 = p[1];
      }
      const d = mon.dims || {};
      const top = d.wallTopLevel || d.wallTop || d.summitLevel || ((d.floorLevel || 4) + (d.wallHeight || d.height || 12));
      const base = d.floorLevel ?? ctx.ground.height((x0 + x1) * 0.5, (z0 + z1) * 0.5);
      // Shrink conservatively by 2m horizontally and 1.2m vertically
      if (x1 - x0 > 8 && z1 - z0 > 8 && top - base > 4) {
        staticOccluders.push([x0 + 2, base, z0 + 2, x1 - 2, top - 1.2, z1 - 2]);
      }
    }

    // Inner wall segments
    const iw = ctx.world.innerWalls;
    if (iw && iw.profile) {
      const addWallLine = (line, thick, h) => {
        if (!line || line.length < 2) return;
        const hw = Math.max(1.5, thick * 0.35);
        for (let i = 0; i < line.length - 1; i++) {
          const a = line[i], b = line[i + 1];
          const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
          const gy = ctx.ground.height(mx, mz);
          const x0 = Math.min(a[0], b[0]) - hw, x1 = Math.max(a[0], b[0]) + hw;
          const z0 = Math.min(a[1], b[1]) - hw, z1 = Math.max(a[1], b[1]) + hw;
          staticOccluders.push([x0, gy - 1, z0, x1, gy + h * 0.85, z1]);
        }
      };
      const pr = iw.profile;
      const tIn = (pr.imgurEnlil && pr.imgurEnlil.thickness) || 6.5;
      const hIn = (pr.imgurEnlil && pr.imgurEnlil.height) || 14;
      const tOut = (pr.nemettiEnlil && pr.nemettiEnlil.thickness) || 3.7;
      const hOut = (pr.nemettiEnlil && pr.nemettiEnlil.height) || 10;
      for (const side of ['east', 'west']) {
        if (!iw[side]) continue;
        addWallLine(iw[side].innerLine, tIn, hIn);
        addWallLine(iw[side].outerLine, tOut, hOut);
      }
    }
  }

  // Scratch arrays for projecting 8 box corners
  const sx = new Float32Array(8);
  const sy = new Float32Array(8);
  const sz = new Float32Array(8);
  const sw = new Float32Array(8);

  function projectBox(m, x0, y0, z0, x1, y1, z1) {
    const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3];
    const m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7];
    const m8 = m[8], m9 = m[9], m10 = m[10], m11 = m[11];
    const m12 = m[12], m13 = m[13], m14 = m[14], m15 = m[15];

    for (let i = 0; i < 8; i++) {
      const x = (i & 1) ? x1 : x0;
      const y = (i & 2) ? y1 : y0;
      const z = (i & 4) ? z1 : z0;
      const cw = m3 * x + m7 * y + m11 * z + m15;
      if (cw <= 0.05) return false;
      const invW = 1 / cw;
      const cx = (m0 * x + m4 * y + m8 * z + m12) * invW;
      const cy = (m1 * x + m5 * y + m9 * z + m13) * invW;
      const cz = (m2 * x + m6 * y + m10 * z + m14) * invW;
      sx[i] = (cx * 0.5 + 0.5) * W;
      sy[i] = (cy * 0.5 + 0.5) * H;
      sz[i] = cz * 0.5 + 0.5;
      sw[i] = cw;
    }
    return true;
  }

  function rasterTri(i0, i1, i2) {
    const x0 = sx[i0], y0 = sy[i0], z0 = sz[i0];
    const x1 = sx[i1], y1 = sy[i1], z1 = sz[i1];
    const x2 = sx[i2], y2 = sy[i2], z2 = sz[i2];

    const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (Math.abs(area) < 0.25) return;
    const invA = 1 / area;

    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) return;

    const sgn = area > 0 ? 1 : -1;
    const dx12 = (y1 - y2) * sgn, dy12 = (x2 - x1) * sgn;
    const dx20 = (y2 - y0) * sgn, dy20 = (x0 - x2) * sgn;
    const dx01 = (y0 - y1) * sgn, dy01 = (x1 - x0) * sgn;

    for (let py = minY; py <= maxY; py++) {
      const cy = py + 0.5;
      const rowOff = py * W;
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const w0 = ((cx - x1) * (y2 - y1) - (cy - y1) * (x2 - x1)) * sgn;
        if (w0 < 0) continue;
        const w1 = ((cx - x2) * (y0 - y2) - (cy - y2) * (x0 - x2)) * sgn;
        if (w1 < 0) continue;
        const w2 = ((cx - x0) * (y1 - y0) - (cy - y0) * (x1 - x0)) * sgn;
        if (w2 < 0) continue;

        const b0 = (w0 * sgn) * invA;
        const b1 = (w1 * sgn) * invA;
        const b2 = 1 - b0 - b1;
        const z = b0 * z0 + b1 * z1 + b2 * z2;
        if (z < L0[rowOff + px]) L0[rowOff + px] = z;
      }
    }
  }

  function rasterBox(pm, camX, camY, camZ, x0, y0, z0, x1, y1, z1) {
    if (!projectBox(pm, x0, y0, z0, x1, y1, z1)) return;
    // Rasterize only the front-facing faces of the AABB
    // Corner indices: bit0=x(0/1), bit1=y(0/2), bit2=z(0/4)
    if (camX < x0) { rasterTri(0, 4, 6); rasterTri(0, 6, 2); }
    else if (camX > x1) { rasterTri(1, 3, 7); rasterTri(1, 7, 5); }
    if (camY < y0) { rasterTri(0, 1, 5); rasterTri(0, 5, 4); }
    else if (camY > y1) { rasterTri(2, 6, 7); rasterTri(2, 7, 3); }
    if (camZ < z0) { rasterTri(0, 2, 3); rasterTri(0, 3, 1); }
    else if (camZ > z1) { rasterTri(4, 5, 7); rasterTri(4, 7, 6); }
  }

  function buildPyramid() {
    for (let l = 1; l < mips.length; l++) {
      const prev = mips[l - 1], cur = mips[l];
      const pw = prev.w, ph = prev.h, pb = prev.buf;
      const cw = cur.w, ch = cur.h, cb = cur.buf;
      for (let y = 0; y < ch; y++) {
        const py0 = y * 2, py1 = Math.min(ph - 1, py0 + 1);
        for (let x = 0; x < cw; x++) {
          const px0 = x * 2, px1 = Math.min(pw - 1, px0 + 1);
          const d00 = pb[py0 * pw + px0];
          const d10 = pb[py0 * pw + px1];
          const d01 = pb[py1 * pw + px0];
          const d11 = pb[py1 * pw + px1];
          cb[y * cw + x] = Math.max(d00, d10, d01, d11);
        }
      }
    }
  }

  let active = false;
  const activeBoxes = [];

  function prepare(projScreenMatrix, camX, camY, camZ) {
    const gy = ctx.ground ? ctx.ground.height(camX, camZ) : 0;
    // High aerial cameras see over walls/houses; disable occlusion culling above 45m AGL
    if (camY - gy > 45) {
      active = false;
      return false;
    }
    active = true;
    L0.fill(1.0);
    activeBoxes.length = 0;

    // Gather nearby house occluders (conservative inner box)
    if (ctx.layout && ctx.layout.housesNear) {
      const houses = ctx.layout.housesNear(camX, camZ, 240);
      for (let i = 0; i < houses.length; i++) {
        const h = houses[i];
        if (!ctx.layout.isBuilt(h) || !h.footprint) continue;
        const fp = h.footprint;
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let k = 0; k < fp.length; k++) {
          const p = fp[k];
          if (p[0] < x0) x0 = p[0];
          if (p[0] > x1) x1 = p[0];
          if (p[1] < z0) z0 = p[1];
          if (p[1] > z1) z1 = p[1];
        }
        const dx = (x1 - x0) * 0.15, dz = (z1 - z0) * 0.15;
        const top = (h.roofLevel || (h.groundLevel + 4.5)) - 0.5;
        const base = h.groundLevel ?? gy;
        if (top - base > 2.5 && x1 - x0 > 4 && z1 - z0 > 4) {
          const cx = (x0 + x1) * 0.5, cz = (z0 + z1) * 0.5;
          const d2 = (cx - camX) * (cx - camX) + (cz - camZ) * (cz - camZ);
          if (d2 > 25) {
            activeBoxes.push({ d2, box: [x0 + dx, base, z0 + dz, x1 - dx, top, z1 - dz] });
          }
        }
      }
    }

    // Gather nearby static wall/monument occluders
    for (let i = 0; i < staticOccluders.length; i++) {
      const b = staticOccluders[i];
      const cx = (b[0] + b[3]) * 0.5, cz = (b[2] + b[5]) * 0.5;
      const d2 = (cx - camX) * (cx - camX) + (cz - camZ) * (cz - camZ);
      if (d2 < 900 * 900) {
        activeBoxes.push({ d2, box: b });
      }
    }

    // Sort front-to-back and rasterize top ~100 closest occluders
    activeBoxes.sort((a, b) => a.d2 - b.d2);
    const pm = projScreenMatrix.elements;
    const count = Math.min(activeBoxes.length, 100);
    for (let i = 0; i < count; i++) {
      const b = activeBoxes[i].box;
      if (camX >= b[0] && camX <= b[3] && camY >= b[1] && camY <= b[4] && camZ >= b[2] && camZ <= b[5]) continue;
      rasterBox(pm, camX, camY, camZ, b[0], b[1], b[2], b[3], b[4], b[5]);
    }

    buildPyramid();
    return true;
  }

  /** Returns true if the given world-space AABB is completely occluded by closer geometry. */
  function isOccluded(projScreenMatrix, box, camX, camY, camZ) {
    if (!active) return false;
    const min = box.min, max = box.max;
    // Never cull if camera is inside or very close to the AABB
    if (camX >= min.x - 16 && camX <= max.x + 16 &&
        camY >= min.y - 16 && camY <= max.y + 16 &&
        camZ >= min.z - 16 && camZ <= max.z + 16) {
      return false;
    }

    if (!projectBox(projScreenMatrix.elements, min.x, min.y, min.z, max.x, max.y, max.z)) {
      return false;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
    for (let i = 0; i < 8; i++) {
      if (sx[i] < minX) minX = sx[i];
      if (sx[i] > maxX) maxX = sx[i];
      if (sy[i] < minY) minY = sy[i];
      if (sy[i] > maxY) maxY = sy[i];
      if (sz[i] < minZ) minZ = sz[i];
    }

    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(W - 1, Math.floor(maxX));
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.floor(maxY));
    if (x0 > x1 || y0 > y1) return false;

    const span = Math.max(x1 - x0 + 1, y1 - y0 + 1);
    let level = 0;
    while (level < mips.length - 1 && (span >> level) > 2) level++;

    const mip = mips[level];
    const mw = mip.w, mh = mip.h, buf = mip.buf;
    const mx0 = Math.max(0, x0 >> level), mx1 = Math.min(mw - 1, x1 >> level);
    const my0 = Math.max(0, y0 >> level), my1 = Math.min(mh - 1, y1 >> level);

    let hiZ = 0;
    for (let y = my0; y <= my1; y++) {
      const row = y * mw;
      for (let x = mx0; x <= mx1; x++) {
        const d = buf[row + x];
        if (d > hiZ) hiZ = d;
      }
    }

    return minZ > hiZ + 0.0025;
  }

  return {
    prepare,
    isOccluded,
    get occluderCount() { return Math.min(activeBoxes.length, 100); },
  };
}
