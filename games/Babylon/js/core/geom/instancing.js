// geom/instancing.js — instanced sets bucketed by cell (40,000 palms, 60,000 props, 6,000 lamps): each cell is
// one InstancedMesh with its own bounding sphere (frustum-culled) and its own LOD decision, per-instance
// colour and scale, optional baked occlusion per instance, shadow cut-off distance. Multi-level sets
// (instancedLOD) share one add() and switch on consistent grids.
// OWNER: geometry engineer. Contract: ENGINE.md 5.4 (geom.instanced); additions: docs/geom.md.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from '../mathx.js';
import { ensureAttributes } from './mesh.js';

const MERGE_CELL = 1024;     // = MERGE of batcher.js

export function makeInstancing(ctx, root, batcher, ao) {
  const LAYERS = ctx.LAYERS, sets = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
  function toMatrix(t, out) {
    if (t.isMatrix4) return out.copy(t);
    _p.set(t.x || 0, t.y || 0, t.z || 0);
    _q.setFromAxisAngle(_Y, t.rotY !== undefined ? t.rotY : -(t.rotDeg || 0) * M.DEG);
    const k = t.scale === undefined ? 1 : t.scale;
    _s.set(t.sx === undefined ? k : t.sx, t.sy === undefined ? k : t.sy, t.sz === undefined ? k : t.sz);
    return out.compose(_p, _q, _s);
  }

  /**
   * Instanced set (ENGINE.md 5.4). opts beyond the contract:
   *   lodGrid: G | [Gmin, Gmax]   grid on which the LOD bounds are measured (default: the cell size)
   *   shadowFar: metres            cells farther than this stop casting shadows
   *   shadowTexel: metres          the cells cast only into shadow maps whose texel is at most this fine (ctx.lighting.limitShadow)
   *   merge: false                 opt out of far-field merging
   *   ao: false                    true: every instance is darkened by the baked occlusion at its origin (props in courts and lanes)
   * Far-field merging: a static set on the default 256 m cells and without an `lod` band is drawn as ONE InstancedMesh
   * per 1024 m cell wherever that cell is farther than geom.lod.mergeAt (800 m), exactly as the tile batcher does:
   * a city-wide set costs about 100 calls per pass in an aerial instead of 400 or more. Sets with an `lod` band are not
   * merged: give their far level `cell: 1024` yourself.
   */
  function instanced(opts) {
    const o = { name: 'instances', cell: 256, castShadow: true, receiveShadow: true, reflect: false, lod: null, dynamic: false, capacity: 0, ao: false, ...opts };
    const mat = typeof o.material === 'string' ? ctx.materials.get(o.material) : ctx.materials.register(o.material);
    ensureAttributes(o.geometry);
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    const owner = batcher.state.owner || 'unknown', st = batcher.statOf(owner); st.sets++;
    const grid = o.lodGrid ? (Array.isArray(o.lodGrid) ? o.lodGrid : [o.lodGrid, o.lodGrid]) : null;
    const set = { name: o.name, dynamic: o.dynamic, meshes: [], families: [], count: 0, _dirty: false, owner, opts: o, material: mat, trianglesPerInstance: tris };
    const style = (mesh, cell = null, parent = false) => {
      mesh.name = o.name; mesh.castShadow = o.castShadow; mesh.receiveShadow = o.receiveShadow;
      if (o.reflect) mesh.layers.enable(LAYERS.REFLECT);
      if (o.layer !== undefined && o.layer !== null) mesh.layers.set(o.layer);
      mesh.matrixAutoUpdate = false;
      // the merged stand-in of a banded set is switched by update() below (it shows only while all its cells are in the band)
      if ((o.lod || o.shadowFar) && !(parent && o.lod)) batcher.lodObjects.push({ object: mesh, range: o.lod || [0, Infinity], cell, grid, shadowFar: o.shadowFar || 0, castShadow: o.castShadow });
      batcher.limitShadow(mesh, o);
      if (!parent) { root.add(mesh); set.meshes.push(mesh); }
    };
    const dropMesh = (m) => { if (m.userData.shadowLimit) { m.userData.shadowLimit.remove(); m.userData.shadowLimit = null; } if (m.parent) m.parent.remove(m); batcher.unregisterLOD(m); m.dispose(); };
    set._drop = () => { for (const m of set.meshes) dropMesh(m); for (const f of set.families) dropMesh(f.parent); set.meshes.length = 0; set.families.length = 0; };
    if (o.dynamic) {
      const mesh = new THREE.InstancedMesh(o.geometry, mat, Math.max(1, o.capacity));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false;
      style(mesh);
      set.mesh = mesh;
      set.setAt = (i, t, color) => { mesh.setMatrixAt(i, toMatrix(t, _m)); if (color !== undefined) mesh.setColorAt(i, _c.set(color)); };
      set.commit = () => { mesh.count = Math.min(set.count, o.capacity); mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; };
      st.instances += o.capacity; st.instancedTris += tris * o.capacity;
    } else {
      let cap = 256, mats = new Float32Array(cap * 16), cols = null;
      /** Add one instance: transform = Matrix4 | { x, y, z, rotDeg | rotY, scale | sx, sy, sz }; color = 0xRRGGBB | '#rrggbb' | THREE.Color (sRGB tint). Returns its index. */
      set.add = (t, color) => {
        if (set.count === cap) { cap *= 2; const a = new Float32Array(cap * 16); a.set(mats); mats = a; if (cols) { const c = new Float32Array(cap * 3).fill(1); c.set(cols); cols = c; } }
        toMatrix(t, _m).toArray(mats, set.count * 16);
        if (color !== undefined && color !== null) { if (!cols) cols = new Float32Array(cap * 3).fill(1); _c.set(color); cols[set.count * 3] = _c.r; cols[set.count * 3 + 1] = _c.g; cols[set.count * 3 + 2] = _c.b; }
        set._dirty = true; st.instances++; st.instancedTris += tris;
        return set.count++;
      };
      set._build = () => {
        set._drop();
        const groups = new Map(), cs = o.cell;
        for (let i = 0; i < set.count; i++) {
          const k = cs > 0 ? Math.floor(mats[i * 16 + 12] / cs) * 100003 + Math.floor(mats[i * 16 + 14] / cs) : 0;
          let a = groups.get(k); if (!a) groups.set(k, (a = { tx: Math.floor(mats[i * 16 + 12] / (cs || 1)), tz: Math.floor(mats[i * 16 + 14] / (cs || 1)), idx: [] })); a.idx.push(i);
        }
        const useColor = !!cols || o.ao;
        const makeMesh = (g) => {
          const n = g.idx.length, mesh = new THREE.InstancedMesh(o.geometry, mat, n), im = mesh.instanceMatrix.array;
          for (let j = 0; j < n; j++) { const s = g.idx[j] * 16; for (let k = 0; k < 16; k++) im[j * 16 + k] = mats[s + k]; }
          if (useColor) {
            const ic = new Float32Array(n * 3);
            for (let j = 0; j < n; j++) {
              const s = g.idx[j];
              let k = 1;
              if (o.ao && !batcher.state.aoBaker) { const occ = ao.upAt(mats[s * 16 + 12], mats[s * 16 + 13] + 0.3, mats[s * 16 + 14]); k = 1 - ao.params.strength * (1 - occ); }
              ic[j * 3] = (cols ? cols[s * 3] : 1) * k; ic[j * 3 + 1] = (cols ? cols[s * 3 + 1] : 1) * k; ic[j * 3 + 2] = (cols ? cols[s * 3 + 2] : 1) * k;
            }
            mesh.instanceColor = new THREE.InstancedBufferAttribute(ic, 3);
          }
          mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.computeBoundingBox();
          return mesh;
        };
        const st8 = batcher.state, banded = !!o.lod;
        const fams = new Map(), mergeable = cs === 256 && o.merge !== false && (!banded || (o.lod[1] >= st8.lodMergeMin && o.lod[1] - o.lod[0] >= st8.lodMergeMin * 0.75)), F = MERGE_CELL / 256;
        for (const g of groups.values()) {
          const mesh = makeMesh(g);
          style(mesh, cs > 0 ? [g.tx, g.tz, cs] : null);
          if (mergeable) { const cx = Math.floor(g.tx / F), cz = Math.floor(g.tz / F), k = cx * 100003 + cz; let f = fams.get(k); if (!f) fams.set(k, (f = { cx, cz, idx: [], children: [] })); f.children.push(mesh); for (const i of g.idx) f.idx.push(i); }
        }
        // the far-field stand-in of every 1024 m cell with two or more 256 m cells: the same instances in one mesh
        for (const f of fams.values()) {
          if (f.children.length < 2) continue;
          const parent = makeMesh(f);
          style(parent, [f.cx, f.cz, MERGE_CELL], true);
          parent.userData.merged = true;
          set.families.push({ cx: f.cx, cz: f.cz, children: f.children, parent, showing: 'cells', lod: banded });
        }
        set._dirty = false;
      };
    }
    sets.push(set);
    return set;
  }

  /**
   * One set of instances in several levels of detail with ONE add(): palms near / mid / impostor, people, props.
   * spec: { name, levels: [{ geometry, material, max: metres (upper bound of this level; the last may omit it = Infinity),
   *                          cell: 256, castShadow, shadowFar, shadowTexel, reflect }, ...], reflect, receiveShadow, shadowTexel, ao }
   * Levels switch on a shared grid (the coarser cell of the two neighbours), so exactly one level of every
   * instance is drawn at any camera position. Returns { add(transform, color) -> index, levels: [set, ...], count }.
   */
  function instancedLOD(spec) {
    const lv = spec.levels, levels = [];
    let min = spec.min || 0;
    for (let i = 0; i < lv.length; i++) {
      const l = lv[i], cell = l.cell ?? 256, max = l.max ?? Infinity;
      const gPrev = i > 0 ? Math.max(cell, lv[i - 1].cell ?? 256) : cell, gNext = i < lv.length - 1 ? Math.max(cell, lv[i + 1].cell ?? 256) : cell;
      levels.push(instanced({ name: `${spec.name || 'instances'}-lod${i}`, geometry: l.geometry, material: l.material, cell, lod: [min, max], lodGrid: [gPrev, gNext],
        castShadow: l.castShadow ?? spec.castShadow ?? true, receiveShadow: l.receiveShadow ?? spec.receiveShadow ?? true, reflect: l.reflect ?? spec.reflect ?? false, shadowFar: l.shadowFar ?? spec.shadowFar, shadowTexel: l.shadowTexel ?? spec.shadowTexel, ao: l.ao ?? spec.ao ?? false }));
      min = max;
    }
    const out = { levels, count: 0, add(t, color) { for (const s of levels) s.add(t, color); return out.count++; } };
    return out;
  }

  function finalize() { let n = 0; for (const s of sets) if (!s.dynamic && s._dirty) { s._build(); n++; } return n; }
  function finalizeStep(budgetMs = 4) {
    const t0 = performance.now();
    let n = 0, rem = 0;
    for (const s of sets) {
      if (!s.dynamic && s._dirty) {
        if (n === 0 || performance.now() - t0 < budgetMs) { s._build(); n++; }
        else rem++;
      }
    }
    return { built: n, remaining: rem };
  }
  function hasPending() { for (const s of sets) if (!s.dynamic && s._dirty) return true; return false; }
  function discard(owner) {
    for (let i = sets.length - 1; i >= 0; i--) {
      if (sets[i].owner !== owner) continue;
      if (sets[i]._drop) sets[i]._drop(); else for (const m of sets[i].meshes) { root.remove(m); batcher.unregisterLOD(m); if (m.dispose) m.dispose(); }
      sets.splice(i, 1);
    }
  }
  /** Per frame: far cells of plain sets are drawn merged (one mesh per 1024 m cell), near ones per 256 m cell. */
  function update() {
    const at = batcher.state.mergeAt, lodAt = batcher.state.lodMergeAt;
    for (const s of sets) for (const f of s.families) {
      const dc = batcher.tileDistance(f.cx, f.cz, MERGE_CELL);
      let want;
      if (f.lod) {
        // banded set: the merged cell stands in only while every one of its 256 m cells is inside the band
        let all = dc >= lodAt;
        if (all) for (const m of f.children) if (!m.visible) { all = false; break; }
        want = all ? 'cell' : 'cells';
        if (s.opts.shadowFar) f.parent.castShadow = !!s.opts.castShadow && dc < s.opts.shadowFar;
      } else want = dc >= at ? 'cell' : 'cells';
      if (want === f.showing) continue;
      f.showing = want;
      if (want === 'cell') { for (const m of f.children) root.remove(m); root.add(f.parent); } else { root.remove(f.parent); for (const m of f.children) root.add(m); }
    }
  }
  return { instanced, instancedLOD, finalize, finalizeStep, hasPending, discard, update, sets, toMatrix };
}
