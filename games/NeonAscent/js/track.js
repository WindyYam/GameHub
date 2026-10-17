/* TRACK — flat run-up that sweeps into a concave "J" ramp: up the wall, past vertical, and curling back over towards the start.
   The whole track lies in one vertical plane (x = along the run-up, y = up, z = across the deck). */
(function () {
'use strict';
const NA = window.NA, { clamp, lerp, smooth } = NA.M, V3 = NA.V3;
const T = NA.track = {};
const DS = .25, D2R = Math.PI / 180;

const WIDTH = T.WIDTH = 3.6;             // half width of the driving surface
const THK = .4;                          // deck slab thickness
const S_RUN = 120;                       // flat run-up length
const TH_END = 168 * D2R;                // pitch at the lip (> 90° = the lip leans back over the run-up)
T.START = V3(-150, .02, 0);

// curvature (1/m) as a function of the angle already turned: tight foot, easing near-vertical wall, firm curl, then a long gentle lip
const K_FOOT = 1 / 11, K_WALL = 1 / 17, K_TOP = 1 / 12, K_LIP = 1 / 36;
function curvature(th, u) {
  let k = lerp(K_FOOT, K_WALL, smooth(52 * D2R, 88 * D2R, th));
  k = lerp(k, K_TOP, smooth(100 * D2R, 120 * D2R, th));
  k = lerp(k, K_LIP, smooth(128 * D2R, 146 * D2R, th));
  return k * smooth(0, 9, u);
}

// ----- integrate the centre line (x, y, pitch) once -----
const X = [], Y = [], TH = [];
(function integrate() {
  let x = T.START.x, y = T.START.y, th = 0, s = 0;
  for (let guard = 0; guard < 20000; guard++) {
    X.push(x); Y.push(y); TH.push(th);
    if (th >= TH_END) break;
    const k = s < S_RUN ? 0 : curvature(th, s - S_RUN);
    const thm = th + k * DS / 2;
    x += Math.cos(thm) * DS; y += Math.sin(thm) * DS; th += k * DS; s += DS;
  }
})();
const N = X.length - 1;
const S_END = T.S_END = N * DS;
T.S_RUN = S_RUN;

const sample = (arr, s) => {
  const x = clamp(s, 0, S_END) / DS, i = Math.min(Math.floor(x), N - 1), a = x - i;
  return lerp(arr[i], arr[i + 1], a);
};
T.theta = s => sample(TH, s);
T.kv = s => (T.theta(s + .25) - T.theta(s - .25)) / .5;          // vertical curvature dθ/ds
T.kh = () => 0;

// frame at arc-length s: p (centre line), t (tangent), u (surface normal, towards the inside of the curve), r (across the deck)
T.frame = function (s, f) {
  const th = T.theta(s);
  f.p.set(sample(X, s), sample(Y, s), 0);
  f.t.set(Math.cos(th), Math.sin(th), 0);
  f.u.set(-Math.sin(th), Math.cos(th), 0);
  f.r.set(0, 0, 1);
  f.psi = 0; f.theta = th; f.bank = 0;
  return f;
};
T.newFrame = () => ({ p: V3(), t: V3(), u: V3(), r: V3(), psi: 0, theta: 0, bank: 0 });

// =====================================================================
// MESHES
// =====================================================================
const glsl = NA.GLSL;
function neonMaterial(worldS) {
  return new THREE.ShaderMaterial({
    uniforms: { ...NA.shared, uBoost: { value: 1 } }, side: THREE.DoubleSide,
    vertexShader: `
      attribute float aS; varying float vS; varying vec3 vWp;
      void main(){ vec4 p=vec4(position,1.);
      #ifdef USE_INSTANCING
        p=instanceMatrix*p;
      #endif
        p=modelMatrix*p; vWp=p.xyz; vS=aS; gl_Position=projectionMatrix*viewMatrix*p; }`,
    fragmentShader: glsl + `
      uniform float uBoost; varying float vS; varying vec3 vWp;
      void main(){
        float s=${worldS ? 'vWp.x*1.15+vWp.y*.5+vWp.z*.2' : 'vS'};
        vec3 c=neonCol(s)*(1.0+1.3*chase(s))*uBoost;
        gl_FragColor=vec4(applyFog(c,vWp),1.);
      }`
  });
}
NA.neonMaterial = neonMaterial;

const HW = WIDTH;
const deckMat = new THREE.ShaderMaterial({
  uniforms: { ...NA.shared }, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  vertexShader: `attribute float aS; attribute float aL; varying float vS; varying float vL; varying vec3 vWp;
    void main(){ vS=aS; vL=aL; vec4 p=modelMatrix*vec4(position,1.); vWp=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }`,
  fragmentShader: glsl + `
    varying float vS; varying float vL; varying vec3 vWp;
    void main(){
      float l=vL;
      float n=vn(vec2(vS*.7,l*.9))*.5+vn(vec2(vS*3.,l*3.))*.5;
      vec3 base=vec3(.30,.315,.35)*(.82+.36*n);
      vec3 nc=neonCol(vS);
      float e=abs(abs(l)-${(HW - .14).toFixed(2)});
      float edge=1.-smoothstep(.03,.13,e);
      float glow=exp(-e*2.2)*.16;
      float lane=(1.-smoothstep(0.,.04,abs(abs(l)-${(HW - .62).toFixed(2)})))*.55;
      float dash=step(.5,fract(vS/6.));
      float cl=(1.-smoothstep(.02,.07,abs(l)))*dash;
      vec3 emi=nc*(edge*(1.6+1.6*chase(vS))+glow)+vec3(.9,.95,1.)*(lane+cl)*.9;
      vec3 col=base*.55+base*carLight(vWp)*.5+emi;
      col*=1.-.85*carAO(vWp);
      gl_FragColor=vec4(applyFog(col,vWp),1.);
    }`
});
const slabMat = new THREE.MeshStandardMaterial({ color: 0x8e97a6, metalness: .35, roughness: .55, envMapIntensity: .6, side: THREE.DoubleSide });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a5260, metalness: .85, roughness: .42, envMapIntensity: .7, side: THREE.DoubleSide });
const steelDark = new THREE.MeshStandardMaterial({ color: 0x222831, metalness: .9, roughness: .5, envMapIntensity: .5 });

// generic extrusion of a CCW (lateral,vertical) profile along the track
function extrude(profile, closed, s0, s1, step) {
  const rings = [], f = T.newFrame();
  for (let s = s0; s < s1 + 1e-6; s += step) { T.frame(Math.min(s, S_END), f); rings.push({ s, p: f.p.clone(), u: f.u.clone(), r: f.r.clone() }); }
  const nE = closed ? profile.length : profile.length - 1;
  const R = rings.length, vcount = R * nE * 2;
  const P = new Float32Array(vcount * 3), Nn = new Float32Array(vcount * 3), S = new Float32Array(vcount);
  const idx = [];
  for (let i = 0; i < R; i++) {
    const g = rings[i];
    for (let k = 0; k < nE; k++) {
      const a = profile[k], b = profile[(k + 1) % profile.length];
      const dl = b[0] - a[0], dv = b[1] - a[1], len = Math.hypot(dl, dv) || 1;
      const nl = dv / len, nv = -dl / len;
      for (let e = 0; e < 2; e++) {
        const q = e ? b : a, vi = (i * nE + k) * 2 + e;
        P[vi * 3] = g.p.x + g.r.x * q[0] + g.u.x * q[1];
        P[vi * 3 + 1] = g.p.y + g.r.y * q[0] + g.u.y * q[1];
        P[vi * 3 + 2] = g.p.z + g.r.z * q[0] + g.u.z * q[1];
        Nn[vi * 3] = g.r.x * nl + g.u.x * nv; Nn[vi * 3 + 1] = g.r.y * nl + g.u.y * nv; Nn[vi * 3 + 2] = g.r.z * nl + g.u.z * nv;
        S[vi] = g.s;
      }
      if (i < R - 1) {
        const A = (i * nE + k) * 2, B = A + 1, C = ((i + 1) * nE + k) * 2, D = C + 1;
        idx.push(A, C, B, B, C, D);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(S, 1));
  geo.setIndex(idx);
  return geo;
}
const mirror = pr => pr.map(q => [-q[0], q[1]]).reverse();

function buildDeck(group) {
  const f = T.newFrame(), step = .5;
  const nR = Math.ceil(S_END / step) + 1;
  const P = new Float32Array(nR * 2 * 3), S = new Float32Array(nR * 2), L = new Float32Array(nR * 2), idx = [];
  for (let i = 0; i < nR; i++) {
    const s = Math.min(i * step, S_END); T.frame(s, f);
    for (let e = 0; e < 2; e++) {
      const l = e ? HW + .2 : -HW - .2, vi = i * 2 + e;
      P[vi * 3] = f.p.x + f.r.x * l + f.u.x * .03; P[vi * 3 + 1] = f.p.y + f.r.y * l + f.u.y * .03; P[vi * 3 + 2] = f.p.z + f.r.z * l + f.u.z * .03;
      S[vi] = s; L[vi] = l;
    }
    if (i < nR - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(S, 1));
  g.setAttribute('aL', new THREE.BufferAttribute(L, 1));
  g.setIndex(idx);
  group.add(new THREE.Mesh(g, deckMat));

  const sl = HW + .3, slab = [[-sl, -THK], [sl, -THK], [sl, -.05], [-sl, -.05]];
  group.add(new THREE.Mesh(extrude(slab, true, 0, S_END, step), slabMat));
  // low kerbs + neon rail along the curved part only, so the run-up stays flat and open
  const sw = S_RUN - 8;
  const wall = [[HW + .02, 0], [HW + .3, 0], [HW + .3, .32], [HW + .02, .32]];
  group.add(new THREE.Mesh(extrude(wall, true, sw, S_END, step), slabMat), new THREE.Mesh(extrude(mirror(wall), true, sw, S_END, step), slabMat));
  const nm = neonMaterial(false);
  const topN = [[HW + .04, .32], [HW + .28, .32], [HW + .28, .4], [HW + .04, .4]];
  for (const pr of [topN, mirror(topN)]) group.add(new THREE.Mesh(extrude(pr, true, sw, S_END, step), nm));
  // end cap of the launch lip
  T.frame(S_END, f);
  const cp = [];
  slab.forEach(q => cp.push(f.p.x + f.r.x * q[0] + f.u.x * q[1], f.p.y + f.r.y * q[0] + f.u.y * q[1], f.p.z + f.r.z * q[0] + f.u.z * q[1]));
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setIndex([0, 1, 2, 0, 2, 3]); cg.computeVertexNormals();
  group.add(new THREE.Mesh(cg, slabMat));
}

// ---------- steel lattice: a truss backbone under the curved deck + a tall tower behind the wall ----------
function buildStructure(group) {
  const struts = [], f = T.newFrame();
  const add = (a, b, r) => struts.push(a.x, a.y, a.z, b.x, b.y, b.z, r);
  const D1 = THK + .08, D2 = THK + 1.7, ZL = HW - .3;
  const at = (s, d, z) => { T.frame(s, f); return V3(f.p.x - f.u.x * d, f.p.y - f.u.y * d, z); };

  // outermost x reached by the truss = where the tower stands
  let xmax = -1e9;
  for (let s = S_RUN; s <= S_END; s += .5) { const p = at(s, D2, 0); if (p.x > xmax) xmax = p.x; }
  const TX0 = xmax + .6, TX1 = TX0 + 3.4, TZ = HW + .7;
  let sTop = S_END;
  for (let s = S_END; s > S_RUN; s -= .5) { if (T.theta(s) < 125 * D2R) { sTop = s; break; } }
  const HT = at(sTop, D2, 0).y + 1.2;

  // backbone
  const SP = 2.4, ties = [];
  let prev = null;
  for (let s = S_RUN + 6, i = 0; s <= S_END - 1; s += SP, i++) {
    const cur = { s, A: [], B: [] };
    for (const z of [-ZL, ZL]) { cur.A.push(at(s, D1, z)); cur.B.push(at(s, D2, z)); }
    if (Math.min(cur.A[0].y, cur.B[0].y) < .25) { prev = null; continue; }
    for (let k = 0; k < 2; k++) add(cur.A[k], cur.B[k], .09);
    add(cur.A[0], cur.A[1], .09); add(cur.B[0], cur.B[1], .09);
    add(cur.A[0], cur.B[1], .06);
    if (prev) for (let k = 0; k < 2; k++) {
      add(prev.A[k], cur.A[k], .13); add(prev.B[k], cur.B[k], .13);
      if (i % 2) add(prev.A[k], cur.B[k], .07); else add(prev.B[k], cur.A[k], .07);
    }
    if (i % 2 === 0 && cur.B[0].y < HT + 2 && cur.B[0].x < TX0 - .3) ties.push(cur);
    prev = cur;
  }

  // tower: four legs, ring beams every level, X-bracing on every face
  const nLv = Math.max(3, Math.round(HT / 3.4)), lvH = HT / nLv;
  const corner = [[TX0, -TZ], [TX1, -TZ], [TX1, TZ], [TX0, TZ]];
  const lv = [];
  for (let j = 0; j <= nLv; j++) lv.push(corner.map(c => V3(c[0], j * lvH, c[1])));
  for (let j = 0; j <= nLv; j++) for (let c = 0; c < 4; c++) {
    add(lv[j][c], lv[j][(c + 1) % 4], .11);
    if (j < nLv) {
      add(lv[j][c], lv[j + 1][c], .24);
      add(lv[j][c], lv[j + 1][(c + 1) % 4], .08); add(lv[j][(c + 1) % 4], lv[j + 1][c], .08);
    }
  }
  // tie the backbone into the tower
  for (const cur of ties) for (let k = 0; k < 2; k++) {
    const j = clamp(Math.round(cur.B[k].y / lvH), 0, nLv), tgt = lv[j][k ? 3 : 0];
    add(cur.B[k], V3(TX0, tgt.y, k ? TZ : -TZ), .1);
    add(cur.A[k], V3(TX0, tgt.y, k ? TZ : -TZ), .07);
  }
  for (const sgn of [-1, 1]) {                                   // foot braces off the tower base
    add(V3(TX0, 0, sgn * TZ), V3(TX0 - 3.2, .01, sgn * (TZ + 2.6)), .1);
    add(V3(TX1, 0, sgn * TZ), V3(TX1 + 3.2, .01, sgn * (TZ + 2.6)), .1);
  }
  const foot = new THREE.Mesh(new THREE.BoxGeometry(TX1 - TX0 + 2.4, .4, 2 * TZ + 2.4), steelDark);
  foot.position.set((TX0 + TX1) / 2, .2, 0); group.add(foot);
  T.tower = { x0: TX0, x1: TX1, h: HT, z: TZ };

  const n = struts.length / 7;
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1); geo.translate(0, .5, 0);
  const im = new THREE.InstancedMesh(geo, steelMat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V3(0, 1, 0), d = V3(), sc = V3(), ps = V3();
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    ps.set(struts[o], struts[o + 1], struts[o + 2]); d.set(struts[o + 3] - struts[o], struts[o + 4] - struts[o + 1], struts[o + 5] - struts[o + 2]);
    const len = d.length() || 1e-3; d.multiplyScalar(1 / len);
    q.setFromUnitVectors(up, d); sc.set(struts[o + 6], len, struts[o + 6]);
    m.compose(ps, q, sc); im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
  group.add(im);
}

// ---------- start gantry with countdown lamps ----------
function buildGantry(group) {
  const f = T.newFrame(); T.frame(26, f);
  const base = f.p.clone();
  T.gantry = { x: base.x, z: 7.4, beamY0: 8.95, beamY1: 10.25 };
  for (const sgn of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.3, .4, 9.5, 8), steelMat); m.position.set(base.x, 4.75, sgn * 7.4); group.add(m);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.3, 15.6), steelMat);
  beam.position.set(base.x, 9.6, 0); group.add(beam);
  NA.startLamps = [];
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.6, 20, 12), new THREE.MeshBasicMaterial({ color: 0x220000 }));
    lamp.position.set(base.x, 8.0, (i - 1) * 2.6); group.add(lamp);
    NA.startLamps.push(lamp);
  }
}

T.build = function (scene) {
  const g = new THREE.Group();
  buildDeck(g); buildStructure(g); buildGantry(g);
  scene.add(g);
  T.group = g;
};
})();
