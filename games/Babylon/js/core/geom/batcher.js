// geom/batcher.js — the tile batcher: static geometry submitted by material is merged into INDEXED geometry
// per tile (256 m by default) and per material, with bounding volumes, frustum culling, shadow and reflection
// flags, baked vertex AO, LOD bands chosen per frame from the camera distance, and far-field merging:
// tiles without an LOD band are also kept as one mesh per 1024 m cell and material, which is drawn instead of
// its (up to 16) tiles once the whole cell is farther than `mergeAt` metres. That is what keeps the wide
// shots inside the draw-call budget without any effort from the builders.
// OWNER: geometry engineer. Contract: ENGINE.md 5.4; additions: docs/geom.md.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { geometryArrays, toRGB } from './mesh.js';

export const TILE = 256, MERGE = 1024;

/** Index a plain triangle list: collapses the (a, b, c, a, c, d) pattern of quad soups into 4 vertices. */
function indexSoup(a) {
  const n = a.nv, P = a.pos, Nn = a.nor, C = a.col, U = a.uv, A = a.ao;
  const map = new Uint32Array(n), same = (i, j) => {
    const p = i * 3, q = j * 3;
    if (P[p] !== P[q] || P[p + 1] !== P[q + 1] || P[p + 2] !== P[q + 2] || Nn[p] !== Nn[q] || Nn[p + 1] !== Nn[q + 1] || Nn[p + 2] !== Nn[q + 2]) return false;
    if (C && (C[p] !== C[q] || C[p + 1] !== C[q + 1] || C[p + 2] !== C[q + 2])) return false;
    if (U && (U[i * 2] !== U[j * 2] || U[i * 2 + 1] !== U[j * 2 + 1])) return false;
    return !(A && A[i] !== A[j]);
  };
  let m = 0;
  const keep = new Uint32Array(n);
  for (let t = 0; t < n; t += 3) {
    if (t + 5 < n && same(t, t + 3) && same(t + 2, t + 4)) {
      keep[m] = t; keep[m + 1] = t + 1; keep[m + 2] = t + 2; keep[m + 3] = t + 5;
      map[t] = m; map[t + 1] = m + 1; map[t + 2] = m + 2; map[t + 3] = m; map[t + 4] = m + 2; map[t + 5] = m + 3;
      m += 4; t += 3;
    } else { keep[m] = t; keep[m + 1] = t + 1; keep[m + 2] = t + 2; map[t] = m; map[t + 1] = m + 1; map[t + 2] = m + 2; m += 3; }
  }
  const take = (src, size) => { if (!src) return null; const out = new Float32Array(m * size); for (let i = 0; i < m; i++) { const s = keep[i] * size; for (let k = 0; k < size; k++) out[i * size + k] = src[s + k]; } return out; };
  return { pos: take(P, 3), nor: take(Nn, 3), col: take(C, 3), uv: take(U, 2), ao: take(A, 1), idx: map, nv: m, ni: n };
}

export function makeBatcher(ctx, root, ao) {
  const LAYERS = ctx.LAYERS;
  const buckets = new Map(), families = new Map(), ownerStats = new Map();
  const lodBuckets = new Set(), lodObjects = [];
  // mergeAt 800 (was 1100): the same triangles in a sixteenth of the draw calls from 800 m on; with the debug fabric the
  // main pass of shot 2 goes from 567 calls to 433 and the coarsest shadow map from 385 to 285
  // lodMergeAt (audit): a 1024 m cell whose tiles carry an LOD band is drawn as ONE mesh whenever every tile of the
  // cell is inside the band and the cell is at least this far away. 0 = always: the cells round the camera's own
  // are then one call per material instead of sixteen (20,000 houses in three levels: 600 calls -> 150 in the
  // coarsest shadow map of an eye-level shot). The pixels do not change: a merged cell holds exactly its tiles.
  const state = { owner: null, mergeAt: 800, lodMergeAt: 0, lodMergeMin: 1500, dither: 0.06, aoBaker: null, built: 0, mergedTris: 0 };
  const statOf = (owner) => { let s = ownerStats.get(owner); if (!s) ownerStats.set(owner, (s = { tris: 0, buckets: new Set(), instances: 0, instancedTris: 0, sets: 0 })); return s; };
  let proxyMaterial = null;
  const getProxyMaterial = () => proxyMaterial || (proxyMaterial = ctx.materials.register(Object.assign(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), { name: 'geom:shadowProxy' }), { owner: 'geom', skipHooks: true }));

  // ---------------------------------------------------------------------------------------- LOD distance ----
  /** Scale on every LOD distance of this sub-frame: 1 for single-sub-frame renders, 1 +/- dither spread over the sub-frames otherwise. */
  function lodJitter() {
    const f = ctx.frame, n = f.subCount || 1;
    return n > 1 ? 1 + state.dither * (((f.sub + 0.5) / n) * 2 - 1) : 1;
  }
  function lodDistance(x, y, z) {
    const f = ctx.frame, lod = f.lod || {};
    if (lod.fixed !== null && lod.fixed !== undefined) return lod.fixed;
    return Math.hypot(x - f.camera.pos[0], y - f.camera.pos[1], z - f.camera.pos[2]) * (lod.scale || 1) * lodJitter();
  }
  function tileDistance(tx, tz, size = TILE) {
    const f = ctx.frame, lod = f.lod || {};
    if (lod.fixed !== null && lod.fixed !== undefined) return lod.fixed;
    const c = f.camera.pos, x0 = tx * size, z0 = tz * size;
    const dx = Math.max(x0 - c[0], 0, c[0] - (x0 + size)), dz = Math.max(z0 - c[2], 0, c[2] - (z0 + size));
    return Math.hypot(dx, c[1], dz) * (lod.scale || 1) * lodJitter();
  }
  /** Distance of the grid cell of size `grid` that contains the tile (tx, tz, size): the reference of a LOD bound. */
  const gridDistance = (tx, tz, size, grid) => (grid === size ? tileDistance(tx, tz, size) : tileDistance(Math.floor(((tx + 0.5) * size) / grid), Math.floor(((tz + 0.5) * size) / grid), grid));

  // ---------------------------------------------------------------------------------------- submission ----
  function bucketFor(tx, tz, T, mat, o) {
    const lodKey = o.lod ? o.lod[0] + '-' + o.lod[1] : '', grid = o.lodGrid ? (Array.isArray(o.lodGrid) ? o.lodGrid.join('/') : o.lodGrid) : '';
    const flags = `${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}${o.reflect ? 1 : 0}${o.proxy ? 'P' : ''}${o.occluder === false ? 'n' : ''}|${lodKey}|${grid}|${o.layer ?? ''}|${o.shadowFar ?? ''}|${o.merge === false ? 'x' : ''}|${o.shadowTexel ?? ''}`;
    const key = `${T}:${tx},${tz}|${mat.uuid}|${flags}`;
    let b = buckets.get(key);
    if (!b) {
      const g = o.lodGrid ? (Array.isArray(o.lodGrid) ? o.lodGrid : [o.lodGrid, o.lodGrid]) : [T, T];
      b = { key, tx, tz, tile: T, material: mat, opts: { ...o }, lodGrid: g, chunks: [], data: null, mesh: null, dirty: false, family: null, visible: true };
      // far-field merging: plain 256 m tiles, and tiles whose LOD band reaches far enough to hold a whole 1024 m cell
      const banded = !!o.lod;
      if (T === TILE && (!banded || (!o.proxy && o.lod[1] >= state.lodMergeMin && o.lod[1] - o.lod[0] >= state.lodMergeMin * 0.75)) && (o.layer === undefined || o.layer === null) && o.merge !== false) {
        const cx = Math.floor(tx / (MERGE / TILE)), cz = Math.floor(tz / (MERGE / TILE)), fk = `${cx},${cz}|${mat.uuid}|${flags}`;
        let fam = families.get(fk);
        if (!fam) families.set(fk, (fam = { key: fk, cx, cz, material: mat, opts: b.opts, members: [], group: null, parent: null, showing: 'tiles', dirty: false, lod: banded }));
        fam.members.push(b); b.family = fam;
      }
      buckets.set(key, b);
    }
    return b;
  }

  /**
   * Submit static world-space geometry (see ENGINE.md 5.4 and docs/geom.md).
   * material: palette id or Material. geometry: BufferGeometry (indexed or not) or a geom.writer(); consumed.
   * opts: castShadow: true, receiveShadow: true, reflect: false, lod: [min, max] | null, tint, ao: true, tile: 256, layer,
   *   and beyond the contract:
   *   lodGrid: G | [Gmin, Gmax]   grid (m) on which the two bounds of `lod` are measured (default: the tile size). Give
   *                               the members of one LOD family the same grid at the bound they share.
   *   shadowFar: metres           the mesh stops casting shadows beyond this distance (small casters)
   *   shadowTexel: metres         the mesh casts only into shadow maps whose texel is at most this fine
   *                               (ctx.lighting.limitShadow: props 0.15, people 0.3, palms 1.0); keeps small casters out of the far maps
   *   merge: false                opt out of far-field merging (only plain 256 m tiles without `lod` are merged)
   *   occluder: false             do not rasterise this geometry into the AO height field
   *   tileKey: [tx, tz]           the geometry is already binned: put all of it into this tile (fast path)
   */
  function addStatic(material, geometry, opts = {}) {
    const mat = typeof material === 'string' ? ctx.materials.get(material) : ctx.materials.register(material);
    const o = { castShadow: true, receiveShadow: true, reflect: false, lod: null, ao: true, ...opts };
    let a = geometryArrays(geometry);
    if (!a.nv || !a.ni) return;
    if (!a.idx) a = indexSoup(a);
    const tint = o.tint === undefined || o.tint === null ? null : toRGB(o.tint), T = o.tile || TILE, owner = state.owner || 'unknown';
    const st = statOf(owner); st.tris += a.ni / 3;
    const push = (tx, tz, c) => {
      const b = bucketFor(tx, tz, T, mat, o);
      c.tint = tint; c.bake = o.ao !== false; c.owner = owner;
      b.chunks.push(c); b.dirty = true; if (b.family) b.family.dirty = true;
      st.buckets.add(b.key);
    };
    if (o.tileKey) { push(o.tileKey[0], o.tileKey[1], a); return; }
    const pos = a.pos, n = a.nv;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) { const x = pos[i * 3], z = pos[i * 3 + 2]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
    if (Math.floor(minX / T) === Math.floor(maxX / T) && Math.floor(minZ / T) === Math.floor(maxZ / T)) { push(Math.floor(minX / T), Math.floor(minZ / T), a); return; }
    // split by triangle centroid; vertices are re-indexed per tile
    const idx = a.idx, nt = a.ni / 3, groups = new Map(), triGroup = new Array(nt);
    for (let t = 0; t < nt; t++) {
      const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
      const tx = Math.floor((pos[i0] + pos[i1] + pos[i2]) / (3 * T)), tz = Math.floor((pos[i0 + 2] + pos[i1 + 2] + pos[i2 + 2]) / (3 * T)), k = tx * 100003 + tz;
      let g = groups.get(k); if (!g) groups.set(k, (g = { tx, tz, tris: [] }));
      g.tris.push(t); triGroup[t] = g;
    }
    const stamp = new Int32Array(n).fill(-1), remap = new Uint32Array(n);
    let gid = 0;
    for (const g of groups.values()) {
      const m = g.tris.length * 3, gi = new Uint32Array(m), verts = [];
      for (let q = 0; q < g.tris.length; q++) for (let k = 0; k < 3; k++) {
        const v = idx[g.tris[q] * 3 + k];
        if (stamp[v] !== gid) { stamp[v] = gid; remap[v] = verts.length; verts.push(v); }
        gi[q * 3 + k] = remap[v];
      }
      const nv = verts.length, take = (src, size) => { if (!src) return null; const out = new Float32Array(nv * size); for (let i = 0; i < nv; i++) { const s = verts[i] * size; for (let k = 0; k < size; k++) out[i * size + k] = src[s + k]; } return out; };
      push(g.tx, g.tz, { pos: take(a.pos, 3), nor: take(a.nor, 3), col: take(a.col, 3), uv: take(a.uv, 2), ao: take(a.ao, 1), idx: gi, nv, ni: m });
      gid++;
    }
  }

  /**
   * Geometry that is drawn ONLY into the shadow maps (never in the main or the reflection pass): one merged,
   * simplified caster per tile for things whose visible meshes are submitted with castShadow: false.
   * opts: lod, lodGrid, tile, tileKey, shadowFar as for addStatic.
   */
  function addShadowProxy(geometry, opts = {}) {
    addStatic(getProxyMaterial(), geometry, { ...opts, castShadow: true, receiveShadow: false, reflect: false, ao: false, proxy: true, occluder: false, merge: false });
  }

  // ---------------------------------------------------------------------------------------- building ----
  const isOccluder = (b) => b.opts.occluder !== false && b.opts.castShadow && !b.opts.proxy && b.tile <= 512 && (!b.opts.lod || b.opts.lod[0] === 0) && !(b.material.alphaTest > 0);

  function bakeAO(dirty) {
    const custom = state.aoBaker;
    let any = false, minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const b of dirty) for (const c of b.chunks) if (c.bake) { any = true; const x0 = b.tx * b.tile, z0 = b.tz * b.tile; minX = Math.min(minX, x0); minZ = Math.min(minZ, z0); maxX = Math.max(maxX, x0 + b.tile); maxZ = Math.max(maxZ, z0 + b.tile); }
    if (!any) return;
    if (!custom) {
      // the height field of everything static around the vertices to bake (nearest level of detail only)
      const pad = 24;
      for (const b of buckets.values()) {
        if (!isOccluder(b)) continue;
        const x0 = b.tx * b.tile, z0 = b.tz * b.tile;
        if (x0 > maxX + pad || x0 + b.tile < minX - pad || z0 > maxZ + pad || z0 + b.tile < minZ - pad) continue;
        if (b.data) ao.rasterize(b.data.pos, b.data.idx, b.data.ni);
        for (const c of b.chunks) ao.rasterize(c.pos, c.idx, c.ni);
      }
    }
    for (const b of dirty) for (const c of b.chunks) {
      if (!c.bake) continue;
      c.baked = new Float32Array(c.nv).fill(1);
      if (custom) custom(c.pos, c.nor, c.baked, c.nv, { tx: b.tx, tz: b.tz, material: b.material, tile: b.tile });
      else ao.bake(c.pos, c.nor, c.baked, c.nv, c.idx, c.ni);
    }
  }

  // merge the built data of a bucket with its new chunks into final arrays
  function buildData(b) {
    const old = b.data, proxy = !!b.opts.proxy;
    let nv = old ? old.nv : 0, ni = old ? old.ni : 0, hasUV = !!(old && old.uv);
    for (const c of b.chunks) { nv += c.nv; ni += c.ni; hasUV = hasUV || !!c.uv; }
    if (!nv) { b.data = null; b.chunks = []; return; }
    const pos = new Float32Array(nv * 3), nor = proxy ? null : new Int8Array(nv * 3), col = proxy ? null : new Uint8Array(nv * 3), uv = hasUV && !proxy ? new Float32Array(nv * 2) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v0 = 0, i0 = 0;
    if (old) {
      pos.set(old.pos); if (nor) nor.set(old.nor); if (col) col.set(old.col); if (uv && old.uv) uv.set(old.uv);
      idx.set(old.idx); v0 = old.nv; i0 = old.ni;
    }
    for (const c of b.chunks) {
      pos.set(c.pos.subarray(0, c.nv * 3), v0 * 3);
      if (!proxy) {
        const cn = c.nor, cc = c.col, ce = c.ao, cb = c.baked, t = c.tint;
        for (let i = 0; i < c.nv; i++) {
          const p = i * 3, q = (v0 + i) * 3, k = (ce ? ce[i] : 1) * (cb ? cb[i] : 1) * 255;
          nor[q] = Math.round(cn[p] * 127); nor[q + 1] = Math.round(cn[p + 1] * 127); nor[q + 2] = Math.round(cn[p + 2] * 127);
          let r = k, g = k, bl = k;
          if (cc) { r *= cc[p]; g *= cc[p + 1]; bl *= cc[p + 2]; }
          if (t) { r *= t[0]; g *= t[1]; bl *= t[2]; }
          col[q] = r > 255 ? 255 : r < 0 ? 0 : r + 0.5; col[q + 1] = g > 255 ? 255 : g < 0 ? 0 : g + 0.5; col[q + 2] = bl > 255 ? 255 : bl < 0 ? 0 : bl + 0.5;
        }
        if (uv && c.uv) uv.set(c.uv.subarray(0, c.nv * 2), v0 * 2);
      }
      const ci = c.idx;
      for (let i = 0; i < c.ni; i++) idx[i0 + i] = ci[i] + v0;
      v0 += c.nv; i0 += c.ni;
    }
    b.data = { pos, nor, col, uv, idx, nv, ni };
    b.chunks = [];
  }

  function makeGeometry(d) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    if (d.nor) g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3, true));
    if (d.col) g.setAttribute('color', new THREE.BufferAttribute(d.col, 3, true));
    if (d.uv) g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
    g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  function styleMesh(mesh, o) {
    mesh.castShadow = !!o.castShadow; mesh.receiveShadow = !!o.receiveShadow;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    if (o.reflect) mesh.layers.enable(LAYERS.REFLECT);
    if (o.layer !== undefined && o.layer !== null) mesh.layers.set(o.layer);
    if (o.proxy) {
      mesh.userData.shadowProxy = true;
      // never drawn by a perspective camera (main and reflection passes): an empty draw range makes three skip
      // the draw call. three's shadow pass does not call onBeforeRender; a custom depth pass uses an orthographic camera.
      mesh.onBeforeRender = function (renderer, scene, camera, geometry) { if (!camera.isOrthographicCamera) geometry.setDrawRange(1, -2); };
      mesh.onAfterRender = function (renderer, scene, camera, geometry) { geometry.setDrawRange(0, Infinity); };
    }
  }
  function disposeMesh(mesh) { if (!mesh) return; if (mesh.userData.shadowLimit) { mesh.userData.shadowLimit.remove(); mesh.userData.shadowLimit = null; } if (mesh.parent) mesh.parent.remove(mesh); mesh.geometry.dispose(); }
  /** opts.shadowTexel: register the caster with lighting so that it is drawn only into the fine shadow maps. */
  function limitShadow(mesh, o) {
    if (o.shadowTexel > 0 && o.castShadow && ctx.lighting && typeof ctx.lighting.limitShadow === 'function') mesh.userData.shadowLimit = ctx.lighting.limitShadow(mesh, o.shadowTexel);
  }

  function buildMesh(b) {
    disposeMesh(b.mesh); b.mesh = null; lodBuckets.delete(b);
    if (!b.data) return;
    const mesh = new THREE.Mesh(makeGeometry(b.data), b.material);
    mesh.name = `tile${b.tile} ${b.tx},${b.tz} ${b.material.name}`;
    styleMesh(mesh, b.opts); limitShadow(mesh, b.opts);
    mesh.userData.tile = [b.tx, b.tz, b.tile]; mesh.userData.lod = b.opts.lod;
    b.mesh = mesh;
    if (b.family) { if (!b.family.group) { b.family.group = new THREE.Group(); b.family.group.name = `cell${MERGE} ${b.family.cx},${b.family.cz} tiles`; b.family.group.matrixAutoUpdate = false; if (b.family.showing === 'tiles') root.add(b.family.group); } b.family.group.add(mesh); }
    else root.add(mesh);
    if (b.opts.lod || b.opts.shadowFar) lodBuckets.add(b);
  }

  // the merged mesh of a 1024 m cell: the built data of its tiles, concatenated
  function buildFamily(fam) {
    if (fam.parent) { state.mergedTris -= fam.parent.geometry.index.count / 3; disposeMesh(fam.parent); fam.parent = null; }
    fam.dirty = false;
    const live = fam.members.filter((b) => b.data);
    if (live.length < 2) { if (fam.showing !== 'tiles') { fam.showing = 'tiles'; if (fam.group) root.add(fam.group); } return; }
    let nv = 0, ni = 0, hasUV = false;
    for (const b of live) { nv += b.data.nv; ni += b.data.ni; hasUV = hasUV || !!b.data.uv; }
    const d = { pos: new Float32Array(nv * 3), nor: new Int8Array(nv * 3), col: new Uint8Array(nv * 3), uv: hasUV ? new Float32Array(nv * 2) : null, idx: nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), nv, ni };
    let v0 = 0, i0 = 0;
    for (const b of live) {
      const s = b.data;
      d.pos.set(s.pos, v0 * 3); d.nor.set(s.nor, v0 * 3); d.col.set(s.col, v0 * 3); if (d.uv && s.uv) d.uv.set(s.uv, v0 * 2);
      for (let i = 0; i < s.ni; i++) d.idx[i0 + i] = s.idx[i] + v0;
      v0 += s.nv; i0 += s.ni;
    }
    const mesh = new THREE.Mesh(makeGeometry(d), fam.material);
    mesh.name = `cell${MERGE} ${fam.cx},${fam.cz} ${fam.material.name}`;
    styleMesh(mesh, fam.opts); limitShadow(mesh, fam.opts);
    mesh.userData.cell = [fam.cx, fam.cz, MERGE]; mesh.userData.merged = true; mesh.userData.lod = fam.opts.lod || null;
    fam.parent = mesh; state.mergedTris += ni / 3;
    if (fam.showing === 'cell') root.add(mesh);
  }

  /** Build (or rebuild) the tile meshes of everything submitted so far; returns the number of buckets built. */
  function finalize() {
    const dirty = [];
    for (const b of buckets.values()) if (b.dirty) dirty.push(b);
    if (!dirty.length) return 0;
    bakeAO(dirty);
    for (const b of dirty) { buildData(b); buildMesh(b); b.dirty = false; }
    for (const fam of families.values()) if (fam.dirty) buildFamily(fam);
    state.built += dirty.length;
    return dirty.length;
  }

  /** Drop everything a module submitted that has not been built into meshes yet. */
  function discard(owner) {
    for (const b of buckets.values()) {
      const keep = b.chunks.filter((c) => c.owner !== owner);
      if (keep.length !== b.chunks.length) { b.chunks = keep; if (!keep.length && !b.data) b.dirty = false; }
    }
    ownerStats.delete(owner);
  }

  // ---------------------------------------------------------------------------------------- per frame ----
  const _sphere = new THREE.Sphere(), _v = new THREE.Vector3();
  function registerLOD(object, range, cell = null, grid = null) { lodObjects.push({ object, range, cell, grid }); }
  function unregisterLOD(object) { const i = lodObjects.findIndex((l) => l.object === object); if (i >= 0) lodObjects.splice(i, 1); }

  function update() {
    for (const b of lodBuckets) {
      const m = b.mesh, lod = b.opts.lod;
      let d = -1;
      if (lod) {
        const dMin = gridDistance(b.tx, b.tz, b.tile, b.lodGrid[0]), dMax = b.lodGrid[1] === b.lodGrid[0] ? dMin : gridDistance(b.tx, b.tz, b.tile, b.lodGrid[1]);
        m.visible = dMin >= lod[0] && dMax < lod[1]; d = dMin;
      }
      if (b.opts.shadowFar) { if (d < 0) d = tileDistance(b.tx, b.tz, b.tile); m.castShadow = b.opts.castShadow && d < b.opts.shadowFar; }
    }
    for (const fam of families.values()) {
      if (!fam.parent) continue;
      const dc = tileDistance(fam.cx, fam.cz, MERGE);
      let want;
      if (fam.lod) {
        // a banded cell is drawn merged only while EVERY tile of it is inside the band (then the merged mesh is exactly
        // what the tiles would draw: never both, never neither, no change in the picture)
        let all = dc >= state.lodMergeAt;
        if (all) for (const b of fam.members) if (b.mesh && !b.mesh.visible) { all = false; break; }
        want = all ? 'cell' : 'tiles';
        if (fam.opts.shadowFar) fam.parent.castShadow = !!fam.opts.castShadow && dc < fam.opts.shadowFar;
      } else want = dc >= state.mergeAt ? 'cell' : 'tiles';
      if (want === fam.showing) continue;
      fam.showing = want;
      if (want === 'cell') { root.remove(fam.group); root.add(fam.parent); } else { root.remove(fam.parent); root.add(fam.group); }
    }
    for (const l of lodObjects) {
      const o = l.object;
      let dMin, dMax;
      if (l.cell) {
        const g = l.grid || [l.cell[2], l.cell[2]];
        dMin = gridDistance(l.cell[0], l.cell[1], l.cell[2], g[0]); dMax = g[1] === g[0] ? dMin : gridDistance(l.cell[0], l.cell[1], l.cell[2], g[1]);
      } else {
        if (o.boundingSphere) _sphere.copy(o.boundingSphere).applyMatrix4(o.matrixWorld);
        else if (o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); _sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); }
        else { o.getWorldPosition(_v); _sphere.set(_v, 0); }
        dMin = dMax = Math.max(0, lodDistance(_sphere.center.x, _sphere.center.y, _sphere.center.z) - _sphere.radius);
      }
      o.visible = dMin >= l.range[0] && dMax < l.range[1];
      if (l.shadowFar) o.castShadow = l.castShadow && dMin < l.shadowFar;
    }
  }

  // ---------------------------------------------------------------------------------------- statistics ----
  function stats() {
    let tiles = 0, tris = 0, verts = 0, bytes = 0, cells = 0;
    for (const b of buckets.values()) if (b.data) { tiles++; tris += b.data.ni / 3; verts += b.data.nv; bytes += b.data.pos.byteLength + (b.data.nor ? b.data.nor.byteLength + b.data.col.byteLength : 0) + b.data.idx.byteLength + (b.data.uv ? b.data.uv.byteLength : 0); }
    let mergedBytes = 0;
    for (const f of families.values()) if (f.parent) { cells++; const g = f.parent.geometry; for (const k of Object.keys(g.attributes)) mergedBytes += g.attributes[k].array.byteLength; mergedBytes += g.index.array.byteLength; }
    return { tiles, tris, vertices: verts, geometryMB: +(bytes / 1048576).toFixed(1), mergedCells: cells, mergedTris: state.mergedTris, mergedMB: +(mergedBytes / 1048576).toFixed(1), lodObjects: lodBuckets.size + lodObjects.length, built: state.built };
  }
  const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4();
  /**
   * What the current frame draws from geom.root: { main: { calls, tris }, shadow: { casters, tris }, reflect: { calls, tris } }.
   * main = visible and inside the camera frustum; shadow = visible shadow casters before per-cascade culling.
   */
  function drawStats() {
    const cam = ctx.camera; cam.updateMatrixWorld(); _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pm);
    const out = { main: { calls: 0, tris: 0 }, shadow: { casters: 0, tris: 0 }, reflect: { calls: 0, tris: 0 } };
    const walk = (o) => {
      if (!o.visible) return;
      if (o.isMesh) {
        const g = o.geometry, n = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
        if (o.isInstancedMesh && !o.count) return;
        const bs = o.isInstancedMesh && o.boundingSphere ? o.boundingSphere : g.boundingSphere;
        const inView = !o.frustumCulled || !bs || _frustum.intersectsSphere(bs);
        if (o.castShadow) { out.shadow.casters++; out.shadow.tris += n; }
        if (inView && !o.userData.shadowProxy && o.layers.mask & 1) {
          out.main.calls++; out.main.tris += n;
          if (o.layers.mask & (1 << LAYERS.REFLECT)) { out.reflect.calls++; out.reflect.tris += n; }
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(root);
    return out;
  }
  const statsFor = (owner) => { const s = ownerStats.get(owner); return s ? { tris: s.tris, draws: s.buckets.size + s.sets, instances: s.instances, instancedTris: s.instancedTris, sets: s.sets } : { tris: 0, draws: 0, instances: 0, instancedTris: 0, sets: 0 }; };

  return { state, buckets, families, statOf, limitShadow, addStatic, addShadowProxy, finalize, discard, update, registerLOD, unregisterLOD, lodObjects, lodDistance, tileDistance, gridDistance, lodJitter, stats, drawStats, statsFor, isOccluder };
}
