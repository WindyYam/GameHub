// js/modules/people/rig.js — GPU-skinned instanced figures.
//
// One float texture holds bone matrices: one ROW per pose (16 bones x three texels = the three rows of a 3 x 4
// matrix). An instance carries its root transform (instanceMatrix: place, heading, size), the row of its pose,
// a part mask and four colours. The vertex shader skins with two bones, collapses the parts whose bit is not
// set and tints by colour slot. The same patch is in the depth material, so shadows move with the figure.
// Everything written here is a pure function of the frame: nothing is kept from one frame to the next.

export const NB = 16;

const HEADER = /* glsl */ `
uniform sampler2D uPplBones;
attribute vec4 aPplBone;
attribute float aPplSlot;
attribute vec4 aPplA;
attribute vec4 aPplB;
attribute vec4 aPplC;
attribute vec4 aPplD;
attribute vec4 aPplE;
mat4 pplBone( float b, float row ) {
	int x = int( b + 0.5 ) * 3; int y = int( row + 0.5 );
	vec4 r0 = texelFetch( uPplBones, ivec2( x, y ), 0 );
	vec4 r1 = texelFetch( uPplBones, ivec2( x + 1, y ), 0 );
	vec4 r2 = texelFetch( uPplBones, ivec2( x + 2, y ), 0 );
	return mat4( r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0 );
}
mat4 pplSkin() {
	return pplBone( aPplBone.x, aPplA.a ) * aPplBone.z + pplBone( aPplBone.y, aPplA.a ) * ( 1.0 - aPplBone.z );
}
float pplOn() {
	int bit = int( aPplBone.w + 0.5 ) - 1;
	if ( bit < 0 ) return 1.0;
	return float( ( int( aPplB.a + 0.5 ) >> bit ) & 1 );
}
`;
const COLOR = /* glsl */ `
{
	int pplSlot = int( aPplSlot + 0.5 );
	vec3 pplTint = vec3( 1.0 );
	if ( pplSlot == 1 ) pplTint = aPplA.rgb;
	else if ( pplSlot == 2 ) pplTint = aPplB.rgb;
	else if ( pplSlot == 3 ) pplTint = aPplC.rgb;
	else if ( pplSlot == 4 ) pplTint = mix( vec3( 0.014, 0.011, 0.009 ), vec3( 0.42, 0.40, 0.37 ), aPplC.a );
	else if ( pplSlot == 5 ) pplTint = aPplD.rgb;
	else if ( pplSlot == 6 ) pplTint = aPplE.rgb;
	vColor.xyz *= pplTint;
}
`;
const NORMAL = /* glsl */ `
mat4 pplM = pplSkin();
objectNormal = mat3( pplM ) * objectNormal;
`;
const POSITION = /* glsl */ `
transformed = ( pplM * vec4( transformed, 1.0 ) ).xyz * pplOn();
`;
const POSITION_DEPTH = /* glsl */ `
transformed = ( pplSkin() * vec4( transformed, 1.0 ) ).xyz * pplOn();
`;

export function createRig(ctx, { rows = 1024 } = {}) {
  const THREE = ctx.THREE, W = NB * 3;
  const data = new Float32Array(W * rows * 4);
  const tex = new THREE.DataTexture(data, W, rows, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false; tex.needsUpdate = true;
  tex.name = 'people:bones';
  const uniform = { value: tex };
  // identity in every row, so an unwritten row is a rest pose and never a collapsed figure
  for (let r = 0; r < rows; r++) for (let b = 0; b < NB; b++) { const o = (r * W + b * 3) * 4; data[o] = 1; data[o + 5] = 1; data[o + 10] = 1; }

  ctx.materials.addHook({
    name: 'people-skin', order: 20,
    filter: (m, info) => !!info.pplSkin,
    shader(shader, m, renderer, patch) {
      patch.uniforms({ uPplBones: uniform });
      patch.vertex.header(HEADER);
      patch.vertex.after('<color_vertex>', COLOR);
      patch.vertex.after('<beginnormal_vertex>', NORMAL);
      patch.vertex.after('<begin_vertex>', POSITION);
    },
  });

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.name = 'people:depth';
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uPplBones = uniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + HEADER).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + POSITION_DEPTH);
  };
  depth.customProgramCacheKey = () => 'people-depth-1';
  ctx.materials.register(depth, { owner: 'people', depth: true, skipHooks: true });

  let cannedEnd = 0, next = 0, overflow = 0;
  const sets = [];

  const rig = {
    rows, data, tex, uniform, depth,
    /** A material for skinned figures: a white variant of a palette id (its texture rides in the rest pose). */
    material(id, name, opts = {}) { return ctx.materials.variant(id, { name, color: 0xffffff, ...opts, info: { pplSkin: true } }); },
    /** Reserve a row for a pose that never changes (written once). */
    canned(bones) { const r = cannedEnd++; rig.write(r, bones); next = cannedEnd; return r; },
    get cannedEnd() { return cannedEnd; },
    /** Start a frame: every dynamic row is free again. */
    begin() { next = cannedEnd; overflow = 0; for (const s of sets) s.n = 0; },
    /** A row for this frame, or -1 when the texture is full (the caller falls back to a canned pose). */
    alloc() { if (next >= rows) { overflow++; return -1; } return next++; },
    get used() { return next; }, get overflow() { return overflow; },
    /** Write 16 bones (Float32Array of 16 x 12: rows of [R | t]) into a row. */
    write(row, bones) { data.set(bones, row * W * 4); },
    /** Upload the texture and the instance buffers. */
    commit() {
      tex.needsUpdate = true;
      for (const s of sets) {
        s.mesh.count = s.n;
        s.mesh.instanceMatrix.needsUpdate = true; s.aA.needsUpdate = true; s.aB.needsUpdate = true; s.aC.needsUpdate = true; s.aD.needsUpdate = true; s.aE.needsUpdate = true;
        s.mesh.visible = s.n > 0;
        if (s.n > s.peak) s.peak = s.n;
      }
    },
    /**
     * An instanced, skinned set. geometry: from meshkit (position, normal, color, aPplBone, aPplSlot).
     * push(x, y, z, heading (model azimuth, degrees), scale, row, mask, A, B, C, D, E, hair, pitch): colours are linear [r, g, b];
     * hair = 0 (black) .. 1 (grey); pitch tilts the root about its own right axis (radians).
     */
    set({ name, geometry, material, capacity, castShadow = true, shadowTexel = 0.3, reflect = false }) {
      const mk = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
      const aA = mk(), aB = mk(), aC = mk(), aD = mk(), aE = mk();
      geometry.setAttribute('aPplA', aA); geometry.setAttribute('aPplB', aB); geometry.setAttribute('aPplC', aC); geometry.setAttribute('aPplD', aD); geometry.setAttribute('aPplE', aE);
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = 'people:' + name; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false;
      mesh.castShadow = castShadow; mesh.receiveShadow = true; mesh.customDepthMaterial = depth; mesh.matrixAutoUpdate = false;
      if (reflect) mesh.layers.enable(ctx.LAYERS.REFLECT);
      if (castShadow && shadowTexel > 0 && ctx.lighting && ctx.lighting.limitShadow) ctx.lighting.limitShadow(mesh, shadowTexel);
      ctx.module.group.add(mesh);
      const im = mesh.instanceMatrix.array, a = aA.array, b = aB.array, c = aC.array, d = aD.array, e = aE.array;
      const tris = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      const s = {
        name, mesh, capacity, n: 0, peak: 0, aA, aB, aC, aD, aE, tris, dropped: 0,
        push(x, y, z, azDeg, scale, row, mask, A, B, C, D, E, hair, pitch) {
          const i = s.n; if (i >= capacity) { s.dropped++; return false; }
          const th = -azDeg * 0.017453292519943295, co = Math.cos(th), si = Math.sin(th), o = i * 16;
          if (pitch) {
            // R = Ry(th) . Rx(pitch)
            const cp = Math.cos(pitch), sp = Math.sin(pitch);
            im[o] = co * scale; im[o + 1] = 0; im[o + 2] = -si * scale; im[o + 3] = 0;
            im[o + 4] = si * sp * scale; im[o + 5] = cp * scale; im[o + 6] = co * sp * scale; im[o + 7] = 0;
            im[o + 8] = si * cp * scale; im[o + 9] = -sp * scale; im[o + 10] = co * cp * scale; im[o + 11] = 0;
          } else {
            im[o] = co * scale; im[o + 1] = 0; im[o + 2] = -si * scale; im[o + 3] = 0;
            im[o + 4] = 0; im[o + 5] = scale; im[o + 6] = 0; im[o + 7] = 0;
            im[o + 8] = si * scale; im[o + 9] = 0; im[o + 10] = co * scale; im[o + 11] = 0;
          }
          im[o + 12] = x; im[o + 13] = y; im[o + 14] = z; im[o + 15] = 1;
          const q = i * 4;
          a[q] = A[0]; a[q + 1] = A[1]; a[q + 2] = A[2]; a[q + 3] = row;
          b[q] = B[0]; b[q + 1] = B[1]; b[q + 2] = B[2]; b[q + 3] = mask;
          c[q] = C[0]; c[q + 1] = C[1]; c[q + 2] = C[2]; c[q + 3] = hair || 0;
          d[q] = D[0]; d[q + 1] = D[1]; d[q + 2] = D[2]; d[q + 3] = 0;
          e[q] = E[0]; e[q + 1] = E[1]; e[q + 2] = E[2]; e[q + 3] = 0;
          s.n = i + 1;
          return true;
        },
      };
      sets.push(s);
      return s;
    },
    sets,
  };
  return rig;
}

// ---- forward kinematics ----------------------------------------------------------------------------------------
// A pose: per bone pitch (about x: a hanging limb swings forward, toward -z), yaw (about the parent's y), roll
// (about z: a hanging limb swings toward +x) and twist (about the bone's own y, applied first), plus a root
// offset. local = Ry(yaw) . Rx(pitch) . Rz(roll) . Ry(twist). abs[b] = 1: the angles are the bone's rotation in
// figure space, whatever its parents do (a lance or a lamp held upright).
export function makePose() {
  return { rx: new Float32Array(NB), ry: new Float32Array(NB), rz: new Float32Array(NB), tw: new Float32Array(NB), sc: new Float32Array(NB).fill(1), abs: new Uint8Array(NB), px: 0, py: 0, pz: 0 };
}
export function clearPose(P) { P.rx.fill(0); P.ry.fill(0); P.rz.fill(0); P.tw.fill(0); P.sc.fill(1); P.abs.fill(0); P.px = 0; P.py = 0; P.pz = 0; return P; }

const _R = new Float32Array(NB * 9), _T = new Float32Array(NB * 3), _L = new Float32Array(9);
/**
 * skeleton: { parent: Int8Array-like, pivot: [[x, y, z], ...], roll0: per-bone roll added to the pose (rest
 * compensation), n }. Writes n bones as rows of [R | t] into out (Float32Array NB * 12).
 */
export function fk(skel, P, out) {
  const n = skel.n, par = skel.parent, piv = skel.pivot, roll0 = skel.roll0;
  for (let b = 0; b < n; b++) {
    const cx = Math.cos(P.rx[b]), sx = Math.sin(P.rx[b]), cy = Math.cos(P.ry[b]), sy = Math.sin(P.ry[b]);
    const rz = P.rz[b] + (roll0 ? roll0[b] : 0), cz = Math.cos(rz), sz = Math.sin(rz);
    // Ry . Rx . Rz
    let m0 = cy * cz + sy * sx * sz, m1 = -cy * sz + sy * sx * cz, m2 = sy * cx;
    let m3 = cx * sz, m4 = cx * cz, m5 = -sx;
    let m6 = -sy * cz + cy * sx * sz, m7 = sy * sz + cy * sx * cz, m8 = cy * cx;
    const tw = P.tw[b];
    if (tw !== 0) {                                           // . Ry(twist)
      const ct = Math.cos(tw), st = Math.sin(tw);
      const a0 = m0 * ct - m2 * st, a2 = m0 * st + m2 * ct, a3 = m3 * ct - m5 * st, a5 = m3 * st + m5 * ct, a6 = m6 * ct - m8 * st, a8 = m6 * st + m8 * ct;
      m0 = a0; m2 = a2; m3 = a3; m5 = a5; m6 = a6; m8 = a8;
    }
    const o = b * 9, p = par[b], pv = piv[b];
    if (p < 0) {
      _R[o] = m0; _R[o + 1] = m1; _R[o + 2] = m2; _R[o + 3] = m3; _R[o + 4] = m4; _R[o + 5] = m5; _R[o + 6] = m6; _R[o + 7] = m7; _R[o + 8] = m8;
      _T[b * 3] = pv[0] + P.px; _T[b * 3 + 1] = pv[1] + P.py; _T[b * 3 + 2] = pv[2] + P.pz;
    } else {
      const q = p * 9, pp = piv[p];
      const r0 = _R[q], r1 = _R[q + 1], r2 = _R[q + 2], r3 = _R[q + 3], r4 = _R[q + 4], r5 = _R[q + 5], r6 = _R[q + 6], r7 = _R[q + 7], r8 = _R[q + 8];
      if (P.abs[b]) {                                         // the pose gives this bone's rotation in figure space (things held upright)
        _R[o] = m0; _R[o + 1] = m1; _R[o + 2] = m2; _R[o + 3] = m3; _R[o + 4] = m4; _R[o + 5] = m5; _R[o + 6] = m6; _R[o + 7] = m7; _R[o + 8] = m8;
      } else {
        _R[o] = r0 * m0 + r1 * m3 + r2 * m6; _R[o + 1] = r0 * m1 + r1 * m4 + r2 * m7; _R[o + 2] = r0 * m2 + r1 * m5 + r2 * m8;
        _R[o + 3] = r3 * m0 + r4 * m3 + r5 * m6; _R[o + 4] = r3 * m1 + r4 * m4 + r5 * m7; _R[o + 5] = r3 * m2 + r4 * m5 + r5 * m8;
        _R[o + 6] = r6 * m0 + r7 * m3 + r8 * m6; _R[o + 7] = r6 * m1 + r7 * m4 + r8 * m7; _R[o + 8] = r6 * m2 + r7 * m5 + r8 * m8;
      }
      const dx = pv[0] - pp[0], dy = pv[1] - pp[1], dz = pv[2] - pp[2];
      _T[b * 3] = _T[p * 3] + r0 * dx + r1 * dy + r2 * dz; _T[b * 3 + 1] = _T[p * 3 + 1] + r3 * dx + r4 * dy + r5 * dz; _T[b * 3 + 2] = _T[p * 3 + 2] + r6 * dx + r7 * dy + r8 * dz;
    }
    // bone matrix = [s R | T - s R pivot]
    const s = P.sc[b], w = b * 12;
    const R0 = _R[o] * s, R1 = _R[o + 1] * s, R2 = _R[o + 2] * s, R3 = _R[o + 3] * s, R4 = _R[o + 4] * s, R5 = _R[o + 5] * s, R6 = _R[o + 6] * s, R7 = _R[o + 7] * s, R8 = _R[o + 8] * s;
    out[w] = R0; out[w + 1] = R1; out[w + 2] = R2; out[w + 3] = _T[b * 3] - (R0 * pv[0] + R1 * pv[1] + R2 * pv[2]);
    out[w + 4] = R3; out[w + 5] = R4; out[w + 6] = R5; out[w + 7] = _T[b * 3 + 1] - (R3 * pv[0] + R4 * pv[1] + R5 * pv[2]);
    out[w + 8] = R6; out[w + 9] = R7; out[w + 10] = R8; out[w + 11] = _T[b * 3 + 2] - (R6 * pv[0] + R7 * pv[1] + R8 * pv[2]);
  }
  for (let b = n; b < NB; b++) { const w = b * 12; out.fill(0, w, w + 12); out[w] = 1; out[w + 5] = 1; out[w + 10] = 1; }
  return out;
}
/** World position (figure space) of a point given in the rest pose, moved by bone b of the last fk() result `bones`. */
export function boneApply(bones, b, p, out) {
  const w = b * 12, x = p[0], y = p[1], z = p[2];
  out[0] = bones[w] * x + bones[w + 1] * y + bones[w + 2] * z + bones[w + 3];
  out[1] = bones[w + 4] * x + bones[w + 5] * y + bones[w + 6] * z + bones[w + 7];
  out[2] = bones[w + 8] * x + bones[w + 9] * y + bones[w + 10] * z + bones[w + 11];
  return out;
}
