'use strict';

/* =====================================================================
   STEP 4 — VFX CORE: GPU laser bolts (live + looping), GPU fire / smoke particles,
            flash + shock-ring sprites, tumbling debris chunks, blast lights, explosions
   ===================================================================== */

const later = [];                                              // tiny scheduler: [time, fn]
const schedule = (delay, fn) => later.push([T + delay, fn]);
onFrame((dt, t) => { for (let i = later.length - 1; i >= 0; i--) if (later[i][0] <= t) { const f = later[i][1]; later.splice(i, 1); f(); } });

// ---------- laser bolts: camera-facing ribbons moved entirely in the vertex shader ----------
const BOLT_VERT = `
  uniform float uTime; attribute vec3 aStart,aVel,aCol; attribute vec4 aPar;
  varying vec2 vC; varying vec3 vCol; varying float vI;
  void main(){
    float life=aPar.y;
    #ifdef LOOP
      float age=mod(uTime+aPar.x,life);
    #else
      float age=uTime-aPar.x;
    #endif
    vec3 dir=normalize(aVel);
    vec3 head=aStart+aVel*age;
    float dist=length(cameraPosition-head);
    float len=max(aPar.z,dist*.004), wid=max(aPar.w,dist*.0011);
    vec3 p=mix(head-dir*len,head,position.x);
    vec3 toC=cameraPosition-p; vec3 side=cross(dir,toC); float sl=length(side); side=sl>1e-4?side/sl:vec3(0.,1.,0.);
    p+=side*position.y*wid;
    vC=position.xy; vCol=aCol;
    #ifdef LOOP
      float alive=1.; vI=smoothstep(0.,life*.07,age)*(1.-smoothstep(life*.88,life,age));
    #else
      float alive=step(0.,age)*step(age,life); vI=alive;
    #endif
    gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
    if(alive<.5) gl_Position=vec4(2.,2.,2.,1.);
  }`;
const BOLT_FRAG = `
  varying vec2 vC; varying vec3 vCol; varying float vI;
  void main(){
    float a=abs(vC.y);
    float core=exp(-a*a*10.), glow=exp(-a*a*2.4);
    float along=smoothstep(0.,.4,vC.x)*(1.+1.4*smoothstep(.82,1.,vC.x));
    vec3 c=(vCol*glow*1.5+vec3(1.,.96,.9)*core*1.6)*along*vI;
    gl_FragColor=vec4(c,1.);
  }`;
function makeBoltSet(max, loop) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const A = { aStart: new Float32Array(max * 3), aVel: new Float32Array(max * 3), aCol: new Float32Array(max * 3), aPar: new Float32Array(max * 4) };
  for (let i = 0; i < max; i++) { A.aPar[i * 4] = -1e6; A.aPar[i * 4 + 1] = 1; A.aVel[i * 3 + 2] = 1; }
  const attrs = {};
  for (const [k, n] of [['aStart', 3], ['aVel', 3], ['aCol', 3], ['aPar', 4]]) { const at = new THREE.InstancedBufferAttribute(A[k], n); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, at); attrs[k] = at; }
  geo.instanceCount = max;
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG, defines: loop ? { LOOP: 1 } : {}, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
  return { geo, A, attrs, mat, mesh, max, i: 0, dirty: false };
}
const BOLTS = makeBoltSet(2600, false);
function fireBolt(sx, sy, sz, vx, vy, vz, life, len, wid, r, g, b) {
  const S = BOLTS, i = S.i; S.i = (i + 1) % S.max; const A = S.A;
  A.aStart[i * 3] = sx; A.aStart[i * 3 + 1] = sy; A.aStart[i * 3 + 2] = sz;
  A.aVel[i * 3] = vx; A.aVel[i * 3 + 1] = vy; A.aVel[i * 3 + 2] = vz;
  A.aCol[i * 3] = r; A.aCol[i * 3 + 1] = g; A.aCol[i * 3 + 2] = b;
  A.aPar[i * 4] = T; A.aPar[i * 4 + 1] = life; A.aPar[i * 4 + 2] = len; A.aPar[i * 4 + 3] = wid; S.dirty = true;
}
const spark = (p, vx, vy, vz, life = .9) => fireBolt(p.x, p.y, p.z, vx, vy, vz, life, 1.5 + Math.hypot(vx, vy, vz) * .05, .1, 3.2, 1.3, .35);
onFrame((dt, t) => {
  BOLTS.mat.uniforms.uTime.value = t;
  if (BOLTS.dirty) { for (const k in BOLTS.attrs) BOLTS.attrs[k].needsUpdate = true; BOLTS.dirty = false; }
});

// ---------- fire / smoke particles (analytic motion in the vertex shader, one draw call each) ----------
const PART_VERT = `
  uniform float uTime,uDrag; attribute vec3 aPos,aVel; attribute vec4 aPar,aCol;
  varying vec2 vUv; varying float vK; varying vec4 vCol;
  void main(){
    float age=uTime-aPar.x, k=age/aPar.y;
    float alive=step(0.,age)*step(age,aPar.y);
    vec3 p=aPos+aVel*((1.-exp(-uDrag*age))/uDrag);
    float s=mix(aPar.z,aPar.w,1.-pow(1.-clamp(k,0.,1.),2.));
    vec4 mv=viewMatrix*vec4(p,1.); mv.xy+=position.xy*s;
    gl_Position=projectionMatrix*mv; if(alive<.5) gl_Position=vec4(2.,2.,2.,1.);
    vUv=position.xy; vK=k; vCol=aCol;
  }`;
const FIRE_FRAG = `
  varying vec2 vUv; varying float vK; varying vec4 vCol;
  void main(){
    float r2=dot(vUv,vUv); if(r2>1.) discard;
    float n=f2(vUv*2.3+vCol.a*13.+vK*1.4);
    float a=clamp(1.-r2-(n-.5)*.75,0.,1.);
    vec3 hot=mix(vec3(3.4,2.4,1.3),vec3(1.7,.55,.1),smoothstep(0.,.3,vK));
    hot=mix(hot,vec3(.3,.05,.02),smoothstep(.3,.9,vK));
    float fade=(1.-vK); fade*=fade;
    gl_FragColor=vec4(hot*vCol.rgb*a*a*fade*.8,1.);
  }`;
const SMOKE_FRAG = `
  varying vec2 vUv; varying float vK; varying vec4 vCol;
  void main(){
    float r2=dot(vUv,vUv); if(r2>1.) discard;
    float n=f2(vUv*2.1+vCol.a*17.+vK*.6);
    float a=clamp(1.-r2-(n-.5)*.8,0.,1.)*smoothstep(0.,.1,vK)*(1.-smoothstep(.35,1.,vK))*.6;
    vec3 c=vCol.rgb*(.5+.7*n)+vec3(1.4,.5,.12)*(1.-smoothstep(0.,.22,vK))*.9*(1.-r2);
    gl_FragColor=vec4(c,a);
  }`;
function makeParticles(max, frag, blending, drag) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const A = { aPos: new Float32Array(max * 3), aVel: new Float32Array(max * 3), aCol: new Float32Array(max * 4), aPar: new Float32Array(max * 4) };
  for (let i = 0; i < max; i++) { A.aPar[i * 4] = -1e6; A.aPar[i * 4 + 1] = 1; }
  const attrs = {};
  for (const [k, n] of [['aPos', 3], ['aVel', 3], ['aCol', 4], ['aPar', 4]]) { const at = new THREE.InstancedBufferAttribute(A[k], n); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, at); attrs[k] = at; }
  geo.instanceCount = max;
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uDrag: { value: drag } }, vertexShader: PART_VERT, fragmentShader: GLSL_NOISE + frag, transparent: true, depthWrite: false, blending, fog: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);
  const S = { geo, A, attrs, mat, mesh, max, i: 0, dirty: false };
  S.emit = (x, y, z, vx, vy, vz, life, s0, s1, r, g, b, seed) => {
    const i = S.i; S.i = (i + 1) % max;
    A.aPos[i * 3] = x; A.aPos[i * 3 + 1] = y; A.aPos[i * 3 + 2] = z; A.aVel[i * 3] = vx; A.aVel[i * 3 + 1] = vy; A.aVel[i * 3 + 2] = vz;
    A.aCol[i * 4] = r; A.aCol[i * 4 + 1] = g; A.aCol[i * 4 + 2] = b; A.aCol[i * 4 + 3] = seed === undefined ? Math.random() : seed;
    A.aPar[i * 4] = T; A.aPar[i * 4 + 1] = life; A.aPar[i * 4 + 2] = s0; A.aPar[i * 4 + 3] = s1; S.dirty = true;
  };
  onFrame((dt, t) => { mat.uniforms.uTime.value = t; if (S.dirty) { for (const k in attrs) attrs[k].needsUpdate = true; S.dirty = false; } });
  return S;
}
const FIRE = makeParticles(5000, FIRE_FRAG, THREE.AdditiveBlending, 1.1); FIRE.mesh.renderOrder = 6;
const SMOKE = makeParticles(1600, SMOKE_FRAG, THREE.NormalBlending, .7); SMOKE.mesh.renderOrder = 4;

// ---------- sprites: soft glows, star flares, shock rings ----------
const TX = {};
TX.halo = canvasTex(128, (g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.18, 'rgba(255,255,255,.55)'); gr.addColorStop(.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }, { srgb: false });
TX.flare = canvasTex(256, (g, S) => {
  const c = S / 2; let gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.12, 'rgba(255,255,255,.6)'); gr.addColorStop(.4, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  for (const [a, l] of [[0, 1], [Math.PI / 2, 1], [Math.PI / 4, .5], [-Math.PI / 4, .5]]) {
    g.save(); g.translate(c, c); g.rotate(a); gr = g.createLinearGradient(-c * l, 0, c * l, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-c * l, -2.2, c * 2 * l, 4.4); g.restore();
  }
}, { srgb: false });
TX.ring = canvasTex(256, (g, S) => { const c = S / 2, gr = g.createRadialGradient(c, c, c * .6, c, c, c); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.55, 'rgba(255,255,255,.25)'); gr.addColorStop(.8, 'rgba(255,255,255,1)'); gr.addColorStop(.92, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }, { srgb: false });
for (const k in TX) TX[k].wrapS = TX[k].wrapT = THREE.ClampToEdgeWrapping;

const GLOWS = [];                                              // pooled additive sprites with a life
function makeSpritePool(n, map) {
  const pool = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    s.visible = false; s.renderOrder = 7; s.userData = { t0: -1, dur: 1, size: 1, grow: 1, col: [1, 1, 1], kind: 0 }; scene.add(s); pool.push(s); GLOWS.push(s);
  }
  let k = 0;
  return (x, y, z, size, col, dur, grow = 1, kind = 0) => {
    const s = pool[k]; k = (k + 1) % n; const u = s.userData;
    s.position.set(x, y, z); u.t0 = T; u.dur = dur; u.size = size; u.grow = grow; u.col = col; u.kind = kind; s.visible = true;
  };
}
const flashGlow = makeSpritePool(90, TX.halo), flashStar = makeSpritePool(40, TX.flare), flashRing = makeSpritePool(30, TX.ring);
onFrame((dt, t) => {
  for (const s of GLOWS) {
    if (!s.visible) continue; const u = s.userData, k = (t - u.t0) / u.dur;
    if (k >= 1) { s.visible = false; continue; }
    const f = u.kind === 1 ? Math.pow(1 - k, 1.5) : (1 - k) * (1 - k), sc = u.size * (u.kind === 1 ? (.15 + .85 * (1 - Math.pow(1 - k, 3)) * u.grow) : (1 + k * (u.grow - 1) * .6));
    s.scale.set(sc, sc, 1); s.material.color.setRGB(u.col[0] * f, u.col[1] * f, u.col[2] * f);
  }
});

// ---------- debris chunks (tumbling hull fragments, hot at first) ----------
const CHUNKS = (() => {
  const max = 420, geo = new THREE.BoxGeometry(1, 1, 1);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: .6, metalness: .5 }), max);
  im.frustumCulled = false; im.castShadow = false; scene.add(im);
  const col = new Float32Array(max * 3).fill(0); im.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
  const d = [], zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) { d.push({ t0: -1, life: 0, p: V3(), v: V3(), ax: V3(1, 0, 0), sp: 0, a0: 0, s: V3(1, 1, 1) }); im.setMatrixAt(i, zero); }
  let k = 0; const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = V3();
  im.spawn = (p, v, scale, life) => {
    const o = d[k]; k = (k + 1) % max; o.t0 = T; o.life = life; o.p.copy(p); o.v.copy(v); o.ax.set(rnd() - .5, rnd() - .5, rnd() - .5).normalize(); o.sp = (rnd() - .5) * 6; o.a0 = rnd() * 6;
    o.s.set(scale * (.5 + rnd() * 1.5), scale * (.2 + rnd() * .6), scale * (.4 + rnd() * 1.2));
  };
  onFrame((dt, t) => {
    for (let i = 0; i < max; i++) {
      const o = d[i]; const age = t - o.t0;
      if (o.t0 < 0 || age > o.life) { if (o.t0 >= 0) { o.t0 = -1; im.setMatrixAt(i, zero); } continue; }
      const kk = age / o.life, sc = 1 - Math.pow(kk, 6);
      Q.setFromAxisAngle(o.ax, o.a0 + o.sp * age); S3.copy(o.s).multiplyScalar(sc);
      M4.compose(V3(o.p.x + o.v.x * age, o.p.y + o.v.y * age, o.p.z + o.v.z * age), Q, S3); im.setMatrixAt(i, M4);
      const h = Math.max(0, 1 - age * .9); col[i * 3] = .5 + 4 * h * h; col[i * 3 + 1] = .5 + 1.5 * h * h * h; col[i * 3 + 2] = .5 + .2 * h;
    }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  });
  return im;
})();

// ---------- blast lights ----------
onFrame((dt, t) => {
  finalUniforms.uFlash.value *= Math.exp(-dt * 3.5);
  for (const l of BLAST_LIGHTS) { const u = l.userData, k = (t - u.t) / u.dur; l.intensity = k >= 0 && k < 1 ? BLAST_CD * u.peak * Math.pow(1 - k, 2) * (.8 + .2 * Math.sin(t * 60)) : 0; }
});
function blastLight(p, peak, dur, color = 0xff9a50, dist = 190) {
  let best = BLAST_LIGHTS[0], bv = 1e9;
  for (const l of BLAST_LIGHTS) { const u = l.userData, rem = Math.max(0, u.dur - (T - u.t)) * u.peak; if (rem < bv) { bv = rem; best = l; } }
  best.position.copy(p); best.color.setHex(color); best.distance = dist; best.userData = { t: T, dur, peak };
}

// ---------- the explosion kit ----------
const _v = V3(), _w = V3();
function randDir(out) { const u = rnd() * 2 - 1, a = rnd() * 6.2832, s = Math.sqrt(1 - u * u); return out.set(s * Math.cos(a), u, s * Math.sin(a)); }
// size ≈ fireball radius / 6 ; n = surface normal (hull blasts burst outwards)
function explode(p, size = 1, n = null, { chunks = 1, light = true, smoke = 1, color = [1, 1, 1] } = {}) {
  flashGlow(p.x, p.y, p.z, 20 * size, [2.6 * color[0], 1.8 * color[1], .9 * color[2]], .5, 1.6);
  flashGlow(p.x, p.y, p.z, 48 * size, [.7 * color[0], .3 * color[1], .1 * color[2]], .9, 1.4);
  flashStar(p.x, p.y, p.z, 40 * size, [2.6, 2, 1.2], .4, 1.2, 1);
  flashRing(p.x, p.y, p.z, 54 * size, [.9, .6, .35], .8, 1, 1);
  const nF = Math.round(12 + 14 * size);
  for (let i = 0; i < nF; i++) {
    randDir(_v); if (n) { _v.addScaledVector(n, 1.1); _v.normalize(); }
    const sp = rr2(3, 17) * size, off = rr2(0, 1.6) * size;
    FIRE.emit(p.x + _v.x * off, p.y + _v.y * off, p.z + _v.z * off, _v.x * sp, _v.y * sp, _v.z * sp, rr2(.6, 1.7) * (.7 + size * .3), rr2(2.5, 5) * size, rr2(8, 15) * size, color[0], color[1], color[2]);
  }
  const nS = Math.round(5 * size * smoke + 2);
  for (let i = 0; i < nS; i++) {
    randDir(_v); if (n) { _v.addScaledVector(n, .8); _v.normalize(); }
    const sp = rr2(1, 6) * size;
    SMOKE.emit(p.x + _v.x * size, p.y + _v.y * size, p.z + _v.z * size, _v.x * sp, _v.y * sp, _v.z * sp, rr2(3, 6.5), rr2(3, 5) * size, rr2(9, 17) * size, .07, .065, .07);
  }
  const nK = Math.round(8 + 12 * size);
  for (let i = 0; i < nK; i++) { randDir(_v); if (n) { _v.addScaledVector(n, .9); _v.normalize(); } const sp = rr2(10, 60) * (.6 + size * .4); spark(p, _v.x * sp, _v.y * sp, _v.z * sp, rr2(.5, 1.5)); }
  const nC = Math.round((5 + 8 * size) * chunks);
  for (let i = 0; i < nC; i++) { randDir(_v); if (n) { _v.addScaledVector(n, .9); _v.normalize(); } const sp = rr2(3, 16) * (.6 + size * .4); CHUNKS.spawn(p, _w.copy(_v).multiplyScalar(sp), rr2(.35, 1.3) * (.6 + size * .5), rr2(2.5, 6)); }
  if (light) blastLight(p, 38 * size * size + 22, .5 + size * .35);
}
function rr2(a, b) { return a + (b - a) * rnd(); }
// a small hit: flash + a few sparks + a puff
function impact(p, n, s = 1) {
  flashGlow(p.x, p.y, p.z, 9 * s, [4, 2.6, 1.3], .22, 1.8);
  flashStar(p.x, p.y, p.z, 16 * s, [3, 2.2, 1.2], .16, 1, 1);
  for (let i = 0; i < 4; i++) { randDir(_v); _v.addScaledVector(n, 1.2).normalize(); const sp = rr2(8, 38) * s; spark(p, _v.x * sp, _v.y * sp, _v.z * sp, rr2(.3, .9)); }
  const q = _v.copy(n).multiplyScalar(2.5 * s);
  FIRE.emit(p.x, p.y, p.z, q.x, q.y, q.z, rr2(.4, .8), 1.6 * s, 4.2 * s, 1, 1, 1);
  if (rnd() < .5) SMOKE.emit(p.x, p.y, p.z, q.x * .5, q.y * .5, q.z * .5, rr2(2.5, 4.5), 1.4 * s, 5 * s, .08, .075, .08);
}
