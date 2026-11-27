import {
  getQuayX,
  getCityTerraceY,
  getTerrainHeight,
  getHighwayInfo,
  mulberry32,
  clamp,
  mix,
  setExtraRoadChecker
} from './noise.js';

// ============================================================================
// 1. TAGGED-EDGE POLYGON KERNEL (Ported from Babylon core/layout/poly.js)
// ============================================================================

/** Shoelace sum * 2: negative in XZ (East->South->West->North) means CW when viewing -Z up. */
export function polySignedArea2(pts) {
  let s = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    s += (b[0] - a[0]) * (b[1] + a[1]);
  }
  return s;
}

export function polyArea(pts) {
  return Math.abs(polySignedArea2(pts)) * 0.5;
}

export function polyCentroid(pts) {
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < pts.length; i++) {
    cx += pts[i][0];
    cz += pts[i][1];
  }
  return [cx / Math.max(pts.length, 1), cz / Math.max(pts.length, 1)];
}

export function ensureCW(pts, tags = null) {
  if (polySignedArea2(pts) <= 0) return { p: pts, t: tags };
  const rp = pts.slice().reverse();
  let rt = null;
  if (tags) {
    const n = tags.length;
    rt = new Array(n);
    for (let i = 0; i < n; i++) {
      rt[i] = tags[(n - 2 - i + n) % n];
    }
  }
  return { p: rp, t: rt };
}

export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const zi = pts[i][1];
    const xj = pts[j][0];
    const zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function cleanRing(p, t, minEdge = 0.65) {
  const outP = [];
  const outT = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= minEdge) {
      outP.push(a);
      if (t) outT.push(t[i]);
    }
  }
  return { p: outP, t: t ? outT : null };
}

/** Splits tagged polygon along line dot([x,z] - O, N) = 0 -> returns [negSide (dot<=0), posSide (dot>=0)]. */
export function splitPolyByLine(poly, ox, oz, nx, nz, cutTag) {
  const { p, t } = poly;
  const n = p.length;
  if (n < 3) return [null, null];

  const negP = [];
  const negT = [];
  const posP = [];
  const posT = [];
  const EPS = 1e-4;

  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const tag = t[i];
    const da = (a[0] - ox) * nx + (a[1] - oz) * nz;
    const db = (b[0] - ox) * nx + (b[1] - oz) * nz;

    if (da <= EPS) {
      negP.push([a[0], a[1]]);
      negT.push(da <= EPS && db <= EPS ? tag : (Math.abs(db) < EPS ? tag : tag));
    }
    if (da >= -EPS) {
      posP.push([a[0], a[1]]);
      posT.push(tag);
    }

    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const s = da / (da - db);
      const ix = a[0] + (b[0] - a[0]) * s;
      const iz = a[1] + (b[1] - a[1]) * s;
      const mid = [ix, iz];
      if (da > 0) {
        // a is + -> enters -
        posP.push(mid);
        posT.push(cutTag);
        negP.push(mid);
        negT.push(tag);
      } else {
        // a is - -> enters +
        negP.push(mid);
        negT.push(cutTag);
        posP.push(mid);
        posT.push(tag);
      }
    }
  }

  // Ensure cut edge tag points along cut boundary accurately
  const fixTags = (rp, rt, sideSign) => {
    if (rp.length < 3) return null;
    const c = cleanRing(rp, rt, 0.45);
    if (c.p.length < 3 || polyArea(c.p) < 8.0) return null;
    // Any edge whose midpoint lies on the split line and has both endpoints on it gets cutTag
    for (let i = 0; i < c.p.length; i++) {
      const a = c.p[i];
      const b = c.p[(i + 1) % c.p.length];
      const da = Math.abs((a[0] - ox) * nx + (a[1] - oz) * nz);
      const db = Math.abs((b[0] - ox) * nx + (b[1] - oz) * nz);
      if (da < 0.15 && db < 0.15) c.t[i] = cutTag;
    }
    void sideSign;
    return ensureCW(c.p, c.t);
  };

  return [fixTags(negP, negT, -1), fixTags(posP, posT, 1)];
}

/** Safe mitred inward offset of a CW polygon by per-edge or scalar margin dFn(tag). */
export function insetPoly(poly, dFn, minArea = 25.0) {
  const { p, t } = ensureCW(poly.p, poly.t);
  const n = p.length;
  if (n < 3) return null;

  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.2) continue;
    // In CW (right/down XZ), inward normal is (-dz/len, +dx/len)
    const inx = -dz / len;
    const inz = dx / len;
    const d = typeof dFn === 'function' ? dFn(t ? t[i] : { k: 'edge', hw: 0 }) : dFn;
    lines.push({
      ax: a[0] + inx * d,
      az: a[1] + inz * d,
      ux: dx / len,
      uz: dz / len,
      inx,
      inz,
      tag: t ? t[i] : { k: 'edge', hw: 0 }
    });
  }
  if (lines.length < 3) return null;

  // Clip sequentially against all half-planes or compute intersections of surviving half-planes
  let outP = [];
  const m = lines.length;
  for (let i = 0; i < m; i++) {
    const l1 = lines[i];
    const l2 = lines[(i + 1) % m];
    const det = l1.ux * l2.uz - l1.uz * l2.ux;
    if (Math.abs(det) < 1e-4) {
      outP.push([l2.ax, l2.az]);
    } else {
      const rx = l2.ax - l1.ax;
      const rz = l2.az - l1.az;
      const s = (rx * l2.uz - rz * l2.ux) / det;
      outP.push([l1.ax + l1.ux * s, l1.az + l1.uz * s]);
    }
  }

  // Clamp extreme acute mitres and clean tiny segments
  const cleaned = cleanRing(outP, t ? lines.map((l) => l.tag) : null, 0.55);
  if (cleaned.p.length < 3) return null;
  if (polySignedArea2(cleaned.p) >= -minArea * 2.0) return null;
  // Reject self-flipped inset polygons if centroid falls outside original polygon
  const c = polyCentroid(cleaned.p);
  if (!pointInPoly(c[0], c[1], p)) return null;
  return cleaned;
}

// ============================================================================
// 2. BABYLON ORGANIC STREET & PARCEL GENERATOR
// ============================================================================
function polyExtentOnAxis(pts, ax, az) {
  let lo = 1e9;
  let hi = -1e9;
  for (let i = 0; i < pts.length; i++) {
    const v = pts[i][0] * ax + pts[i][1] * az;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

function getDistrictParams(cx, cz) {
  const qx = getQuayX(clamp(cz, -1760, -140));
  if (cx >= qx - 190 && cz >= -1140 && cz <= -220) {
    return { name: 'waterfront', B: 68, sd: 0.18, pc: 0.72, tilt: 0.04, skew: -0.04, hw: 5.5, floorRange: [15, 34] };
  }
  if (cx >= -745 && cx < qx - 190 && cz >= -860 && cz <= -260) {
    return { name: 'citadel', B: 82, sd: 0.16, pc: 0.80, tilt: 0.028, skew: 0.05, hw: 6.8, floorRange: [30, 96] };
  }
  if (cx >= -1160 && cx <= -160 && cz >= -1140 && cz <= -210) {
    return { name: 'midtown', B: 58, sd: 0.24, pc: 0.48, tilt: 0.068, skew: -0.18, hw: 4.5, floorRange: [12, 26] };
  }
  return { name: 'urban_sea', B: 52, sd: 0.28, pc: 0.42, tilt: 0.078, skew: 0.12, hw: 3.8, floorRange: [7, 14] };
}

export function generateCityLayout() {
  const rng = mulberry32(20261119);
  const streets = [];
  const blocks = [];

  // Build curved Lakefront Quay Boulevard boundary polygon covering [-1600..quay-12, -1680..-245]
  const outerRing = [[-1580, -245]];
  const outerTags = [{ k: 'street', hw: 9.0, main: true }];

  // Along curved waterfront east edge (northward from z = -245 to -1680)
  for (let z = -245; z >= -1680; z -= 120) {
    outerRing.push([getQuayX(z) - 16.0, z]);
    outerTags.push({ k: 'street', hw: 10.5, main: true });
  }
  outerRing.push([-1580, -1680]);
  outerTags.push({ k: 'street', hw: 8.5, main: true });
  // Replace last point->first edge tag
  const basePatch = ensureCW(outerRing, [
    ...outerTags.slice(0, outerRing.length - 1),
    { k: 'street', hw: 8.5, main: true }
  ]);

  // Extract coastal & arterial street polylines for rendering and traffic
  // A) Curved Lakefront Quay Boulevard
  const quayRoadPts = [];
  for (let z = -1700; z <= -180; z += 40) {
    quayRoadPts.push([getQuayX(z) - 18.0, z]);
  }
  streets.push({ pts: quayRoadPts, hw: 8.5, kind: 'boulevard', name: 'Lakefront Quay Blvd' });

  // B) Macro Arterial Collectors splitting city into organic districts
  const fixedArterials = [
    { ox: -225, oz: -560, nx: 0.08, nz: 0.9968, hw: 11.0, kind: 'boulevard' }, // Grand Civic Axis anchored right at Waterfront Plaza & Marina Pier!
    { ox: -460, oz: -1700, nx: 0.999, nz: -0.044, hw: 9.5, kind: 'boulevard' }, // Citadel N-S Blvd
    { ox: -920, oz: -1700, nx: 0.996, nz: 0.088, hw: 8.0, kind: 'main' },       // West Midtown Spine
    { ox: -1580, oz: -1080, nx: -0.05, nz: 0.9987, hw: 8.0, kind: 'main' }      // North Crosstown Ave
  ];

  let patches = [basePatch];
  for (const art of fixedArterials) {
    const cutTag = { k: 'street', hw: art.hw, main: true };
    const next = [];
    for (const p of patches) {
      const [a, b] = splitPolyByLine(p, art.ox, art.oz, art.nx, art.nz, cutTag);
      if (a) next.push(a);
      if (b) next.push(b);
    }
    patches = next;

    // Record continuous street segment across city bounds for asphalt paving
    const tx = -art.nz;
    const tz = art.nx;
    const p1 = [art.ox - tx * 1650, art.oz - tz * 1650];
    const p2 = [art.ox + tx * 1650, art.oz + tz * 1650];
    // Clip line to roughly x in [-1600, quay-16], z in [-1690, -245]
    const clipPts = [];
    for (let u = 0; u <= 60; u++) {
      const x = mix(p1[0], p2[0], u / 60);
      const z = mix(p1[1], p2[1], u / 60);
      const qx = getQuayX(clamp(z, -1700, -180)) - 16.0;
      if (x >= -1590 && x <= qx && z >= -1690 && z <= -235) clipPts.push([x, z]);
    }
    if (clipPts.length >= 2) {
      streets.push({ pts: [clipPts[0], clipPts[clipPts.length - 1]], hw: art.hw, kind: art.kind });
    }
  }

  // Recursive Babylon gridSplit across each district patch
  function splitBlockRec(poly, depth) {
    const area = polyArea(poly.p);
    const [cx, cz] = polyCentroid(poly.p);
    const prm = getDistrictParams(cx, cz);

    // Measure oriented extent along primary axis
    const baseAng = prm.skew + (rng() - 0.5) * prm.tilt;
    const ax0 = Math.cos(baseAng);
    const az0 = Math.sin(baseAng);
    const ax1 = -az0;
    const az1 = ax0;

    const [lo0, hi0] = polyExtentOnAxis(poly.p, ax0, az0);
    const [lo1, hi1] = polyExtentOnAxis(poly.p, ax1, az1);
    const len0 = hi0 - lo0;
    const len1 = hi1 - lo1;
    const longAlong0 = len0 >= len1;
    const Ll = longAlong0 ? len0 : len1;
    const Ls = longAlong0 ? len1 : len0;

    if (area < prm.B * prm.B * 1.15 || (Ll <= prm.B * 1.48 && Ls <= prm.B * 1.42) || depth > 7) {
      blocks.push({ poly, params: prm, cx, cz, area });
      return;
    }

    const ax = longAlong0 ? ax0 : ax1;
    const az = longAlong0 ? az0 : az1;
    const lo = longAlong0 ? lo0 : lo1;
    const hi = longAlong0 ? hi0 : hi1;

    // Anti-sliver guard: keep cut at least 24m from both extremes
    if (hi - lo < 48.0) {
      blocks.push({ poly, params: prm, cx, cz, area });
      return;
    }

    // Coarse cuts vs fine local cuts + lognormal jitter + T-junction offset
    const coarse = Ll > prm.B * 2.8;
    const streetHw = coarse ? prm.hw * 0.85 : clamp(prm.hw * 0.56 + (rng() - 0.5) * 0.9, 3.0, 5.2);
    const jitter = (rng() - 0.5) * prm.sd * 0.45;
    // With probability (1 - pc), deliberately kick cut away from symmetry for authentic T-junctions!
    const asym = rng() > prm.pc ? (rng() < 0.5 ? -0.11 : 0.11) : 0.0;
    const tSplit = clamp(0.5 + jitter + asym, 0.30, 0.70);
    const sVal = clamp(mix(lo, hi, tSplit), lo + 24.0, hi - 24.0);

    // Slight bend/fanning angle variance on local cuts
    const aJit = (rng() - 0.5) * prm.tilt * (coarse ? 0.4 : 1.0);
    const c = Math.cos(aJit);
    const sn = Math.sin(aJit);
    const nx = ax * c - az * sn;
    const nz = ax * sn + az * c;
    const ox = nx * sVal;
    const oz = nz * sVal;

    const cutTag = { k: 'street', hw: streetHw, main: coarse };
    const [leftPoly, rightPoly] = splitPolyByLine(poly, ox, oz, nx, nz, cutTag);

    // Record exact street center segment intersecting this block
    const tVecX = -nz;
    const tVecZ = nx;
    const segPts = [];
    for (let i = 0; i < poly.p.length; i++) {
      const a = poly.p[i];
      const b = poly.p[(i + 1) % poly.p.length];
      const da = (a[0] - ox) * nx + (a[1] - oz) * nz;
      const db = (b[0] - ox) * nx + (b[1] - oz) * nz;
      if ((da >= 0 && db <= 0) || (da <= 0 && db >= 0)) {
        const d = da - db;
        const f = Math.abs(d) > 1e-5 ? da / d : 0.5;
        segPts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    if (segPts.length >= 2) {
      segPts.sort((p, q) => (p[0] * tVecX + p[1] * tVecZ) - (q[0] * tVecX + q[1] * tVecZ));
      streets.push({ pts: [segPts[0], segPts[segPts.length - 1]], hw: streetHw, kind: coarse ? 'main' : 'lane' });
    }

    if (leftPoly) splitBlockRec(leftPoly, depth + 1);
    if (rightPoly) splitBlockRec(rightPoly, depth + 1);
  }

  for (const p of patches) {
    splitBlockRec(p, 0);
  }

  // ============================================================================
  // 3. BLOCK-TO-PARCEL PACKING (Party-Walled Zero-Gap Architecture + Courtyards)
  // ============================================================================
  const parcels = [];
  const plazas = [];
  const treeAnchors = [];
  const lampAnchors = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const blk = blocks[bi];
    // Inset block to outer curb line (street half-width + 0.35m) for sidewalks, and +3.2m further for building facades!
    const sidewalkPoly = insetPoly(blk.poly, (tag) => (tag ? tag.hw : 4.0) + 0.35, 180.0);
    blk.sidewalkPoly = sidewalkPoly;
    const buildBlock = insetPoly(blk.poly, (tag) => (tag ? tag.hw : 4.0) + 3.2, 160.0);
    if (!buildBlock || !sidewalkPoly) continue;

    // Reserve Grand Waterfront Civic Plaza strictly at waterfront edge near (-175, -560) and ~8% pocket greens
    const qxHere = getQuayX(clamp(blk.cz, -1760, -140));
    const distPlaza = Math.hypot(blk.cx + 175, blk.cz + 560);
    if ((distPlaza < 58.0 && blk.cx >= qxHere - 90.0) || (blk.params.name === 'urban_sea' && rng() < 0.085)) {
      plazas.push({ poly: sidewalkPoly, cx: blk.cx, cz: blk.cz, baseY: getCityTerraceY(blk.cx, blk.cz), isCivic: distPlaza < 58.0 });
      treeAnchors.push([blk.cx, blk.cz]);
      continue;
    }

    // Subdivide block into party-walled rows & individual building parcels!
    const rawParcels = [];
    function subdivideParcel(pPoly, pDepth) {
      const pArea = polyArea(pPoly.p);
      const [pcx, pcz] = polyCentroid(pPoly.p);
      const distName = blk.params.name;
      const targetArea =
        distName === 'citadel' ? mix(520, 1450, Math.pow(rng(), 1.25)) :
        distName === 'waterfront' ? mix(380, 960, Math.pow(rng(), 1.3)) :
        distName === 'midtown' ? mix(260, 740, Math.pow(rng(), 1.3)) :
        mix(160, 480, Math.pow(rng(), 1.35));

      if (pArea <= targetArea * 1.45 || pDepth >= 4) {
        if (pArea >= 105.0) rawParcels.push(pPoly);
        return;
      }

      // Split longest axis with slight party-wall organic skew (Babylon parcels.js!)
      const e0x = pPoly.p[1][0] - pPoly.p[0][0];
      const e0z = pPoly.p[1][1] - pPoly.p[0][1];
      const baseTheta = Math.atan2(e0z, e0x);
      const ax0 = Math.cos(baseTheta);
      const az0 = Math.sin(baseTheta);
      const ax1 = -az0;
      const az1 = ax0;
      const [l0, h0] = polyExtentOnAxis(pPoly.p, ax0, az0);
      const [l1, h1] = polyExtentOnAxis(pPoly.p, ax1, az1);
      const use0 = (h0 - l0) >= (h1 - l1);
      const ax = use0 ? ax0 : ax1;
      const az = use0 ? az0 : az1;
      const lo = use0 ? l0 : l1;
      const hi = use0 ? h0 : h1;
      if (hi - lo < 18.0) {
        if (pArea >= 105.0) rawParcels.push(pPoly);
        return;
      }

      const cutFrac = clamp(0.5 + (rng() - 0.5) * 0.28, 0.33, 0.67);
      const sVal = clamp(mix(lo, hi, cutFrac), lo + 9.0, hi - 9.0);
      const skew = (rng() - 0.5) * 0.05;
      const nx = ax * Math.cos(skew) - az * Math.sin(skew);
      const nz = ax * Math.sin(skew) + az * Math.cos(skew);
      const ox = nx * sVal;
      const oz = nz * sVal;

      // Occasionally insert a 3.2m mid-block service alley on deep blocks
      const isAlley = pDepth === 0 && (hi - lo) > 48.0 && rng() < 0.42;
      const cutTag = isAlley ? { k: 'street', hw: 1.7, main: false } : { k: 'party', hw: 0.0, main: false };
      const [pA, pB] = splitPolyByLine(pPoly, ox, oz, nx, nz, cutTag);
      if (isAlley) {
        const aA = pA ? insetPoly(pA, (tg) => tg === cutTag ? 1.7 : 0.0, 90.0) : null;
        const aB = pB ? insetPoly(pB, (tg) => tg === cutTag ? 1.7 : 0.0, 90.0) : null;
        if (aA) subdivideParcel(aA, pDepth + 1);
        if (aB) subdivideParcel(aB, pDepth + 1);
      } else {
        if (pA) subdivideParcel(pA, pDepth + 1);
        if (pB) subdivideParcel(pB, pDepth + 1);
      }
      void pcx; void pcz;
    }
    subdivideParcel(buildBlock, 0);

    // Convert each subdivided lot into a rich multi-volume architectural building record
    for (let li = 0; li < rawParcels.length; li++) {
      const lot = rawParcels[li];
      const lArea = polyArea(lot.p);
      const [lx, lz] = polyCentroid(lot.p);
      const prm = getDistrictParams(lx, lz);
      const qx = getQuayX(clamp(lz, -1760, -140));
      if (lx > qx - 10.0) continue; // never extend into seawall/water

      // Exclude buildings directly overlapping Ring Expressway outside streets
      const hw = getHighwayInfo(lx, lz);
      if (hw.dist < 16.0) continue;

      // Occasional small landscaped pocket garden / parking courtyard inside huge blocks (~10% of urban_sea / midtown)
      if ((prm.name === 'urban_sea' || prm.name === 'midtown') && rng() < 0.105) {
        plazas.push({ poly: lot, cx: lx, cz: lz, baseY: getCityTerraceY(lx, lz), isCivic: false });
        if (rng() < 0.72) treeAnchors.push([lx, lz]);
        continue;
      }

      // Measure ground elevation span across parcel polygon corners + centroid -> slope-proof foundations!
      let minG = 1e9;
      let maxG = -1e9;
      for (let vi = 0; vi < lot.p.length; vi++) {
        const gy = getTerrainHeight(lot.p[vi][0], lot.p[vi][1]);
        if (gy < minG) minG = gy;
        if (gy > maxG) maxG = gy;
      }
      const cGy = getTerrainHeight(lx, lz);
      minG = Math.min(minG, cGy);
      maxG = Math.max(maxG, cGy);
      const baseY = maxG;
      const minY = minG;

      // Choose realistic height + massing archetype
      const distName = prm.name;
      let archetype = 'lowrise';
      let height = mix(prm.floorRange[0], prm.floorRange[1], Math.pow(rng(), 1.4));
      let materialClass = 'travertine';

      const distCitadel = Math.hypot(lx + 420, lz + 560);
      if (distName === 'citadel') {
        const centralBias = clamp(1.0 - distCitadel / 340.0, 0.0, 1.0);
        height = mix(24.0, 88.0 + centralBias * 42.0, Math.pow(rng(), 1.15));
        archetype = height > 52.0 ? 'setback_tower' : 'podium_tower';
        const rMat = rng();
        materialClass = rMat < 0.42 ? 'glass' : (rMat < 0.76 ? 'concrete' : 'travertine');
      } else if (distName === 'waterfront') {
        height = mix(14.0, 34.0, Math.pow(rng(), 1.15));
        archetype = rng() < 0.55 ? 'courtyard_mid' : 'podium_mid';
        materialClass = rng() < 0.36 ? 'glass' : (rng() < 0.74 ? 'travertine' : 'concrete');
      } else if (distName === 'midtown') {
        height = mix(11.0, 25.0, rng());
        archetype = 'courtyard_mid';
        materialClass = rng() < 0.62 ? 'travertine' : 'concrete';
      } else {
        height = mix(6.8, 13.5, rng());
        archetype = 'courtyard_low';
        materialClass = rng() < 0.74 ? 'travertine' : 'concrete';
      }

      // Compute carved interior courtyard polygon (Babylon courtyard architecture!)
      let courtPoly = null;
      if ((archetype === 'courtyard_mid' || archetype === 'courtyard_low') && lArea > 230.0) {
        const insetDist = archetype === 'courtyard_low' ? mix(4.2, 6.2, rng()) : mix(5.5, 8.0, rng());
        const cp = insetPoly(lot, insetDist, 32.0);
        if (cp && polyArea(cp.p) > 28.0 && polyArea(cp.p) < lArea * 0.44) {
          courtPoly = cp;
        }
      }

      // Compute upper stepped volume (Babylon multi-volume massing!)
      let upperPoly = null;
      let upperHeight = 0;
      if (archetype === 'setback_tower' || archetype === 'podium_tower' || (archetype === 'courtyard_low' && rng() < 0.45)) {
        const stepInset = archetype === 'courtyard_low' ? 2.4 : mix(3.2, 5.8, rng());
        const up = insetPoly(lot, stepInset, 42.0);
        if (up) {
          upperPoly = up;
          upperHeight = archetype === 'courtyard_low' ? mix(2.2, 3.6, rng()) : height * mix(0.28, 0.48, rng());
        }
      }

      // Calibrated desaturated Babylon-style architectural stone/concrete/slate color tones
      const palette =
        materialClass === 'glass'
          ? [0xcad6e0, 0xb8c8d6, 0xd2dce4, 0xc2ccd4]
          : materialClass === 'concrete'
          ? [0xc8c5be, 0xbab7b0, 0xd4d0c7, 0xb2afa8, 0xc2bcb4]
          : [0xdad2c4, 0xcebfa9, 0xe2dacb, 0xc4b59f, 0xd2c4af, 0xc5a892];
      const baseHex = palette[Math.floor(rng() * palette.length)];
      const shadeJitter = 0.89 + rng() * 0.22;

      parcels.push({
        id: parcels.length,
        poly: lot,
        cx: lx,
        cz: lz,
        area: lArea,
        district: distName,
        archetype,
        materialClass,
        baseHex,
        shadeJitter,
        baseY,
        minY,
        height,
        podiumH: archetype.includes('tower') ? 8.2 : (height >= 14 ? 4.8 : 0.0),
        courtPoly,
        upperPoly,
        upperHeight,
        staggerSeed: rng()
      });
    }
  }

  // Flag Signature 148m Skyline Monument Landmark right behind the Grand Waterfront Plaza
  if (parcels.length > 0) {
    let bestTower = null;
    let bestDist = 1e9;
    for (let i = 0; i < parcels.length; i++) {
      const p = parcels[i];
      if (p.district !== 'citadel') continue;
      const d = Math.hypot(p.cx + 390, p.cz + 560);
      if (d < bestDist && p.area > 600) {
        bestDist = d;
        bestTower = p;
      }
    }
    if (bestTower) {
      bestTower.height = 128.0;
      bestTower.upperHeight = 36.0;
      bestTower.archetype = 'setback_tower';
      bestTower.materialClass = 'glass';
      bestTower.isSignatureSpire = true;
    }
  }

  // Place streetlamps cleanly along main arterial streets and Lakefront Quay promenade
  for (let z = -1680; z <= -200; z += 36) {
    lampAnchors.push([getQuayX(z) - 6.0, z, 0]);
  }
  for (let i = 0; i < streets.length; i++) {
    const st = streets[i];
    if (st.kind === 'boulevard' || st.kind === 'main') {
      const pts = st.pts;
      for (let j = 0; j < pts.length - 1; j++) {
        const ax = pts[j][0];
        const az = pts[j][1];
        const bx = pts[j + 1][0];
        const bz = pts[j + 1][1];
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.floor(len / 44.0));
        const nx = -(bz - az) / Math.max(len, 1);
        const nz = (bx - ax) / Math.max(len, 1);
        for (let k = 1; k < steps; k++) {
          const f = k / steps;
          const sx = mix(ax, bx, f);
          const sz = mix(az, bz, f);
          const side = (k % 2 === 0 ? 1 : -1) * (st.hw + 1.4);
          lampAnchors.push([sx + nx * side, sz + nz * side, 0]);
        }
      }
    }
  }

  // Build spatial grid of streets for fast O(1) road-exclusion by foliage & props
  const streetGrid = new Map();
  const ST_CELL = 90.0;
  for (let si = 0; si < streets.length; si++) {
    const st = streets[si];
    for (let j = 0; j < st.pts.length - 1; j++) {
      const a = st.pts[j];
      const b = st.pts[j + 1];
      const pad = st.hw + 12.0;
      const minX = Math.floor((Math.min(a[0], b[0]) - pad) / ST_CELL);
      const maxX = Math.floor((Math.max(a[0], b[0]) + pad) / ST_CELL);
      const minZ = Math.floor((Math.min(a[1], b[1]) - pad) / ST_CELL);
      const maxZ = Math.floor((Math.max(a[1], b[1]) + pad) / ST_CELL);
      for (let cz = minZ; cz <= maxZ; cz++) {
        for (let cx = minX; cx <= maxX; cx++) {
          const key = `${cx},${cz}`;
          let list = streetGrid.get(key);
          if (!list) {
            list = [];
            streetGrid.set(key, list);
          }
          list.push([a[0], a[1], b[0], b[1], st.hw]);
        }
      }
    }
  }

  function isPointOnCityStreetOrParcel(x, z, pad = 0.0) {
    const qx = getQuayX(clamp(z, -1760, -140));
    if (x >= qx - 16.0 - pad && x <= qx + 4.0 + pad && z >= -1760 - pad && z <= -140 + pad) return true;
    const segs = streetGrid.get(`${Math.floor(x / ST_CELL)},${Math.floor(z / ST_CELL)}`);
    if (segs) {
      for (let i = 0; i < segs.length; i++) {
        const [ax, az, bx, bz, hw] = segs[i];
        const abx = bx - ax;
        const abz = bz - az;
        const lenSq = abx * abx + abz * abz;
        const t = lenSq > 1e-4 ? clamp(((x - ax) * abx + (z - az) * abz) / lenSq, 0, 1) : 0;
        const px = ax + abx * t;
        const pz = az + abz * t;
        if (Math.hypot(x - px, z - pz) <= hw + 2.5 + pad) return true;
      }
    }
    return false;
  }

  setExtraRoadChecker(isPointOnCityStreetOrParcel);

  // Build autonomous traffic routes following main boulevards & curved Lakefront Blvd
  const quayRouteFwd = quayRoadPts.map(([x, z]) => ({ x: x + 3.2, z }));
  const quayRouteRev = quayRoadPts.slice().reverse().map(([x, z]) => ({ x: x - 3.2, z }));
  const citadelLoop = [
    { x: -195, z: -560 },
    { x: -740, z: -518 },
    { x: -740, z: -245 },
    { x: -195, z: -245 }
  ];
  const midtownLoop = [
    { x: -460, z: -1075 },
    { x: -920, z: -1050 },
    { x: -920, z: -245 },
    { x: -460, z: -245 }
  ];
  const civicAxisLoop = [
    { x: -190, z: -563 },
    { x: -1420, z: -464 },
    { x: -1420, z: -492 },
    { x: -190, z: -588 }
  ];

  return {
    streets,
    blocks,
    parcels,
    plazas,
    treeAnchors,
    lampAnchors,
    quayRoadPts,
    trafficRoutes: [citadelLoop, midtownLoop, civicAxisLoop, quayRouteFwd, quayRouteRev]
  };
}
