// debug.js — debug camera helpers, scene statistics, frame hash, plan poses. Engine instrumentation only:
// nothing here may influence a film pixel.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/** Scene totals: triangles in memory (instances multiplied out), meshes, instances, geometry and texture bytes. */
export function collectStats(ctx) {
  const geos = new Set(), texs = new Set();
  let tris = 0, meshes = 0, instances = 0;
  const addTex = (t) => { if (t && t.isTexture) texs.add(t); };
  ctx.scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine) || !o.geometry) return;
    const g = o.geometry; geos.add(g);
    const n = o.isMesh && g.attributes.position ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0;
    tris += n * (o.isInstancedMesh ? o.count : 1); meshes++;
    if (o.isInstancedMesh) instances += o.count;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap']) addTex(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) addTex(u && u.value);
    }
  });
  let geoBytes = 0;
  for (const g of geos) { for (const a of Object.values(g.attributes)) geoBytes += a.array ? a.array.byteLength : 0; if (g.index) geoBytes += g.index.array.byteLength; }
  let texBytes = 0;
  for (const t of texs) { const im = t.image; if (im && im.width) texBytes += im.width * im.height * 4 * (t.generateMipmaps ? 1.33 : 1); }
  texBytes = Math.max(texBytes, 0);
  // render targets: post's own figure when it has one (MSAA scene, accumulation, AO, bloom, canvas), the shadow maps
  // (24-bit depth + the R8 colour attachment three needs: 5 bytes per texel), the water reflection (half-size RGBA16F + depth, mip-mapped)
  const W = ctx.post.width || 1, H = ctx.post.height || 1, sm = ctx.lighting.shadow;
  const postBytes = typeof ctx.post.memory === 'function' ? ctx.post.memory().total * 1048576 : W * H * 8 * 5 + W * H * 4 * 4 + W * H * 8;
  const rf = ctx.water.reflection, reflBytes = rf && rf.enabled && rf.width ? rf.width * rf.height * (8 * 1.33 + 4) : 0;
  const targetBytes = postBytes + sm.mapSize * sm.mapSize * 5 * (sm.cascades || 1) + reflBytes;
  const extraTex = (typeof ctx.materials.memory === 'function' ? ctx.materials.memory().MB : 0) * 1048576;
  const info = ctx.renderer.info;
  return {
    triangles: Math.round(tris), meshes, instances, geometries: geos.size, textures: texs.size,
    gpuMemoryEstimateMB: Math.round((geoBytes + texBytes + extraTex + targetBytes) / 1048576),
    geometryMB: Math.round(geoBytes / 1048576), textureMB: Math.round((texBytes + extraTex) / 1048576), renderTargetMB: Math.round(targetBytes / 1048576),
    shadowMapMB: Math.round(sm.mapSize * sm.mapSize * 5 * (sm.cascades || 1) / 1048576),
    lastFrame: { calls: info.render.calls, triangles: info.render.triangles },
    programs: info.programs ? info.programs.length : 0,
  };
}

/** FNV-1a hash of the canvas pixels (needs preserveDrawingBuffer). Identical frames give identical strings. */
export function frameHash(ctx) {
  const gl = ctx.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  ctx.renderer.setRenderTarget(null);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < px.length; i++) { a = Math.imul(a ^ px[i], 16777619); if ((i & 1023) === 0) b = Math.imul(b ^ a, 2246822519); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/**
 * Top-down "plan" pose with grid north up (a very long lens from 100 km: orthographic to within 0.1 %).
 * which: 'inner' (inner city, both banks) | 'outer' (whole outer wall and Summer Palace) | [minX, minZ, maxX, maxZ].
 */
export function planPose(ctx, which = 'inner') {
  const box = Array.isArray(which) ? which : which === 'outer' ? [-1800, -3500, 3500, 1750] : [-1500, -1230, 1650, 1230];
  const cx = (box[0] + box[2]) / 2, cz = (box[1] + box[3]) / 2, aspect = ctx.size.width / ctx.size.height;
  const halfH = Math.max((box[3] - box[1]) / 2, (box[2] - box[0]) / 2 / aspect) * 1.03, D = 100000;
  return {
    pos: [cx, D, cz], look: [cx, 0, cz], up: [0, 0, -1], fov: 2 * Math.atan(halfH / D) * (180 / Math.PI),
    near: D - 600, far: D + 400, mode: 'afternoon', fog: 0, lod: { fixed: 300 }, shadowRadius: Math.min(halfH * aspect * 1.05, 5200), debug: true,
    box, metresPerPixel: (2 * halfH) / (ctx.size.height * ctx.size.dpr),
  };
}

/** Parse "x,y,z;lx,ly,lz;fov" into an override pose. */
export function parseCam(str) {
  const [p, l, f] = String(str).split(';');
  const pos = p.split(',').map(Number), look = l.split(',').map(Number);
  if (pos.length !== 3 || look.length !== 3 || [...pos, ...look].some((v) => !Number.isFinite(v))) throw new Error(`bad camera '${str}' (want "x,y,z;lx,ly,lz;fov")`);
  return { pos, look, fov: f ? Number(f) : 50 };
}

/** window.DEBUG: console helpers for interactive work in a normal browser tab. */
export function installDebug(ctx) {
  const D = {
    ctx,
    /** DEBUG.cam(x, y, z, lx, ly, lz, fov, mode) then DEBUG.draw(t) */
    cam(x, y, z, lx, ly, lz, fov = 50, mode) { ctx.film.setOverride({ pos: [x, y, z], look: [lx, ly, lz], fov, mode }); return D.draw(D.t); },
    free() { ctx.film.setOverride(null); return D.draw(D.t); },
    t: 0,
    draw(t = 0, sub) { D.t = t; return window.renderAt(t, { sub }); },
    stats: () => collectStats(ctx),
    hash: () => frameHash(ctx),
    plan(which) { ctx.film.setOverride(planPose(ctx, which)); return D.draw(D.t); },
    /** Ground probe: DEBUG.at(x, z) -> { y, zone } */
    at: (x, z) => ({ y: ctx.ground.height(x, z), ...ctx.ground.zone(x, z) }),
  };
  window.DEBUG = D;

  // ?play=1: play the film in real time. ?orbit=1: drag to orbit around the current look target, wheel to dolly.
  // Wall-clock time is used here for interactive preview only; the film path never goes through this code.
  if (ctx.flags.play) {
    const t0 = performance.now();
    const tick = () => { D.draw(((performance.now() - t0) / 1000) % ctx.film.duration); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  if (ctx.flags.orbit) {
    const pose = ctx.film.poseAt(ctx.flags.t || 0);
    const target = new THREE.Vector3(...pose.look), sph = new THREE.Spherical().setFromVector3(new THREE.Vector3(...pose.pos).sub(target));
    const apply = () => { const p = new THREE.Vector3().setFromSpherical(sph).add(target); ctx.film.setOverride({ pos: p.toArray(), look: target.toArray(), fov: pose.fov }); D.draw(ctx.flags.t || 0); };
    let drag = null;
    const c = ctx.canvas;
    c.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; });
    window.addEventListener('pointerup', () => { drag = null; });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      sph.theta -= (e.clientX - drag[0]) * 0.005; sph.phi = Math.min(Math.PI / 2 - 0.01, Math.max(0.05, sph.phi - (e.clientY - drag[1]) * 0.005));
      drag = [e.clientX, e.clientY]; apply();
    });
    c.addEventListener('wheel', (e) => { sph.radius *= Math.exp(e.deltaY * 0.001); apply(); e.preventDefault(); }, { passive: false });
    apply();
  }
  return D;
}
