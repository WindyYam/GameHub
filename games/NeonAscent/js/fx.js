/* FX — instanced-billboard particle system (jet mist, ground blast, landing purge smoke) + jet cones / nozzle glow */
(function () {
'use strict';
const NA = window.NA, P = NA.P, V3 = NA.V3, glsl = NA.GLSL, scene = NA.scene;
const F = NA.fx = {};
const SMOKE_TOP = .3;                              // ground smoke never rises above this height (car roof is ~1.1 m)
const N = 7000;
const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
const age = new Float32Array(N), life = new Float32Array(N).fill(1), s0 = new Float32Array(N), s1 = new Float32Array(N);
const a0 = new Float32Array(N), g0 = new Float32Array(N), drag = new Float32Array(N), rise = new Float32Array(N);
const flat = new Float32Array(N).fill(1), ceil = new Float32Array(N).fill(1e9), gdec = new Float32Array(N).fill(16);
const iPos = new Float32Array(N * 3), iSize = new Float32Array(N), iCol = new Float32Array(N * 3), iA = new Float32Array(N), iGlow = new Float32Array(N), iSeed = new Float32Array(N), iFlat = new Float32Array(N).fill(1);
for (let i = 0; i < N; i++) { age[i] = 9; iSeed[i] = Math.random(); }
let head = 0;

// flt: vertical squash of the sprite; cap: highest y the particle may reach (used to keep ground smoke below the car); gd: glow decay rate
function spawn(px, py, pz, vx, vy, vz, lf, size0, size1, r, g, b, alpha, glow, dr, rs, flt = 1, cap = 1e9, gd = 16) {
  const i = head; head = (head + 1) % N;
  pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = pz; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
  age[i] = 0; life[i] = lf; s0[i] = size0; s1[i] = size1; iCol[i * 3] = r; iCol[i * 3 + 1] = g; iCol[i * 3 + 2] = b;
  a0[i] = alpha; g0[i] = glow; drag[i] = dr; rise[i] = rs; iSeed[i] = Math.random(); flat[i] = iFlat[i] = flt; ceil[i] = cap; gdec[i] = gd;
}
F.spawn = spawn;

F.build = function () {
  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  geo.index = base.index; geo.setAttribute('position', base.attributes.position);
  const mk = (arr, n, dyn = true) => { const a = new THREE.InstancedBufferAttribute(arr, n); if (dyn) a.setUsage(THREE.DynamicDrawUsage); return a; };
  geo.setAttribute('iPos', mk(iPos, 3)); geo.setAttribute('iSize', mk(iSize, 1)); geo.setAttribute('iCol', mk(iCol, 3));
  geo.setAttribute('iA', mk(iA, 1)); geo.setAttribute('iGlow', mk(iGlow, 1)); geo.setAttribute('iSeed', mk(iSeed, 1)); geo.setAttribute('iFlat', mk(iFlat, 1));
  geo.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...NA.shared, uNearFade: { value: 1 } }, transparent: true, depthWrite: false, premultipliedAlpha: true,
    vertexShader: `attribute vec3 iPos; attribute float iSize; attribute vec3 iCol; attribute float iA; attribute float iGlow; attribute float iSeed; attribute float iFlat;
      varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vG; varying float vSeed; varying vec3 vWp;
      void main(){ vec4 mv=viewMatrix*vec4(iPos,1.); mv.xy+=position.xy*vec2(iSize,iSize*iFlat); vWp=iPos; vUv=position.xy+.5; vCol=iCol; vA=iA; vG=iGlow; vSeed=iSeed; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: glsl + `uniform float uNearFade; varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vG; varying float vSeed; varying vec3 vWp;
      void main(){
        vec2 p=vUv-.5; float r=length(p)*2.;
        float n=vn(vUv*3.+vSeed*17.)*.6+vn(vUv*8.+vSeed*5.)*.4;
        float a=(1.-smoothstep(.2,1.,r+(n-.5)*.8))*(1.-smoothstep(.6,1.,r))*vA;
        a*=mix(1.,.18+.82*smoothstep(2.5,10.,length(vWp-uCarPos)),uNearFade);
        if(a<.002&&vG<.01) discard;
        vec3 lit=vCol*(.5+.35*n)+vCol*carLight(vWp)*.3;
        // fire particles carry a colour channel above 1: they glow in their own colour instead of the jets' blue-white
        vec3 glowCol=max(vCol.r,max(vCol.g,vCol.b))>1.05?vCol:vec3(.55,.85,1.);
        vec3 glow=glowCol*3.*vG*(1.-smoothstep(0.,1.,r));
        vec3 c=lit*a+glow;
        c=applyFog(c,vWp)*1.;
        gl_FragColor=vec4(c,a*(1.-clamp(vG,0.,.85)));
      }`
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 10;
  scene.add(mesh); F.mesh = mesh; F.geo = geo;
};

const _m = new THREE.Matrix4(), _wp = V3(), _dir = V3(), _q = new THREE.Quaternion(), _ex = V3(), _ey = V3(), _ez = V3();
const tmpC = new THREE.Color();
let acc = [0, 0, 0, 0], accGround = [0, 0, 0, 0], accPurge = [0, 0, 0, 0], purgeBurst = false, wreck = null, accFlame = 0, accSmoke = 0;
F.wreck = () => wreck;

// per-frame: emit, integrate, upload
F.update = function (dt, sim, car, t) {
  const a = F.geo.attributes;
  car.root.updateMatrixWorld(true);
  const q = sim.q;
  _ex.set(1, 0, 0).applyQuaternion(q); _ey.set(0, 1, 0).applyQuaternion(q); _ez.set(0, 0, 1).applyQuaternion(q);
  const SX = [1, 1, -1, -1], SZ = [-1, 1, -1, 1];
  let sumT = 0;
  for (let i = 0; i < 4; i++) {
    const th = sim.thr[i] / P.Tmax; sumT += th;
    const gx = sim.gim[i][0], gz = sim.gim[i][1], Ti = Math.max(sim.thr[i], 1);
    // plume direction (local): opposite to the thrust vector
    const ld = V3(-gx, -Ti, -gz).normalize();
    const jet = car.jets[i], mats = car.jetMats[i];
    const on = th > .015;
    jet.jet.visible = jet.core.visible = on;
    car.nozzles[i].glow.material.opacity = Math.min(1, th * 2.2);
    if (on) {
      _q.setFromUnitVectors(V3(0, -1, 0), ld);
      jet.jet.quaternion.copy(_q); jet.core.quaternion.copy(_q);
      const len = .5 + 6.2 * Math.pow(th, .8), r = .1 + .2 * th;
      jet.jet.scale.set(r, len, r); jet.core.scale.set(r * .45, len * .75, r * .45);
      mats[0].uniforms.uI.value = Math.min(1.1, th * 1.7); mats[1].uniforms.uI.value = Math.min(1.4, th * 2.4);
      mats[0].uniforms.uT.value = mats[1].uniforms.uT.value = t;
      // particles
      _wp.set(SX[i] * P.wbHalf, P.nozzleY - .17, SZ[i] * P.nozzleZ).applyMatrix4(car.root.matrixWorld);
      _dir.copy(ld).applyQuaternion(q);
      acc[i] += (900 * th + 60) * dt;
      while (acc[i] >= 1) {
        acc[i] -= 1;
        const sp = 14 + 12 * th, j = () => (Math.random() - .5) * 2.2;
        spawn(_wp.x + j() * .04, _wp.y, _wp.z + j() * .04,
          sim.vel.x * .9 + _dir.x * sp + j() * .6, sim.vel.y * .9 + _dir.y * sp + j() * .6, sim.vel.z * .9 + _dir.z * sp + j() * .6,
          .45 + Math.random() * .5, .16, .9 + 1.0 * th, .86, .93, 1, .42, .12 + .1 * th, 1.7, 0);
      }
      // ground blast
      const hgt = _wp.y;
      if (_dir.y < -.3 && hgt < 15 && hgt > .05) {
        const k = th * (1 - hgt / 15);
        accGround[i] += 260 * k * dt;
        const hx = _wp.x + _dir.x * hgt / -_dir.y, hz = _wp.z + _dir.z * hgt / -_dir.y;
        while (accGround[i] >= 1) {
          accGround[i] -= 1;
          const ang = Math.random() * 6.283, spd = (2 + Math.random() * 6) * (.5 + k * 1.2);
          spawn(hx, .12 + Math.random() * .12, hz, Math.cos(ang) * spd + sim.vel.x * .2, 0, Math.sin(ang) * spd + sim.vel.z * .2,
            1 + Math.random() * 1, .5, 1.1 + 1.1 * k, .9, .95, 1, .14 + .14 * k, 0, 1.5, 0, .4, SMOKE_TOP);
        }
      }
    }
  }
  car.jetLight.intensity = sumT * 2.4;
  // landing purge: dump valves vent a low mist hugging the ground, kept below the car's wheel line
  if (purgeBurst) {
    purgeBurst = false;
    for (let k = 0; k < 110; k++) {
      const ang = Math.random() * 6.283, spd = 2 + Math.random() * 5.5;
      spawn(sim.pos.x + Math.cos(ang) * 1.6, .12 + Math.random() * .15, sim.pos.z + Math.sin(ang) * 1.6, Math.cos(ang) * spd + sim.vel.x * .3, 0, Math.sin(ang) * spd + sim.vel.z * .3,
        2.5 + Math.random() * 2, .8 + Math.random() * .5, 1.6 + Math.random() * .8, .95, .97, 1, .14, 0, 1.1, 0, .4, SMOKE_TOP);
    }
  }
  if (sim.purge > 0) {
    for (let i = 0; i < 4; i++) {
      accPurge[i] += 90 * sim.purge * dt;
      _wp.set(SX[i] * P.wbHalf, -P.comH + .3, SZ[i] * (P.trackHalf + .1)).applyMatrix4(car.root.matrixWorld);
      while (accPurge[i] >= 1) {
        accPurge[i] -= 1;
        const ang = Math.atan2(SZ[i], SX[i] * .6) + (Math.random() - .5) * 2.4, spd = 1 + Math.random() * 4;
        spawn(_wp.x, .12 + Math.random() * .15, _wp.z, Math.cos(ang) * spd + sim.vel.x * .3, 0, Math.sin(ang) * spd + sim.vel.z * .3,
          2.2 + Math.random() * 1.8, .7 + Math.random() * .5, 1.5 + Math.random() * .7, .96, .98, 1, .12, 0, 1.2, 0, .4, SMOKE_TOP);
      }
    }
  }
  // integrate
  if (wreck) {
    wreck.t += dt; wreck.p.copy(sim.pos);
    const k = .35 + .65 * Math.max(0, 1 - wreck.t / 10), j = () => Math.random() - .5;
    const at = (lx, ly, lz) => _wp.copy(sim.pos).addScaledVector(_ex, lx).addScaledVector(_ey, ly).addScaledVector(_ez, lz);
    accFlame += 90 * k * dt; accSmoke += 70 * k * dt;
    while (accFlame >= 1) {                       // flames lick out of the body shell (engine bay, cabin, rear)
      accFlame -= 1;
      const p = at(j() * 3.6, .15 + Math.random() * .5, j() * 1.3);
      spawn(p.x, Math.max(p.y, .15), p.z, sim.vel.x * .5 + j() * 1.4, 2 + Math.random() * 3.5, sim.vel.z * .5 + j() * 1.4,
        .4 + Math.random() * .6, .6, .3 + 1.1 * k, 2.4, .75 + .5 * Math.random(), .12, .8, .8, 1.2, 4, 1, 1e9, 2.6);
    }
    while (accSmoke >= 1) {
      accSmoke -= 1;
      const p = at(j() * 3, .5 + Math.random() * .4, j() * 1.1);
      spawn(p.x, Math.max(p.y, .2), p.z, .9 + j() * 1.4, 2.5 + Math.random() * 3, .3 + j() * 1.4,
        3 + Math.random() * 2.5, 2, 8 + 4 * k, .21, .2, .19, .75, 0, .5, 1.3);
    }
  }
  for (let i = 0; i < N; i++) {
    if (age[i] >= life[i]) { iSize[i] = 0; iA[i] = 0; iGlow[i] = 0; continue; }
    age[i] += dt;
    const t01 = Math.min(age[i] / life[i], 1), dm = Math.exp(-drag[i] * dt);
    vel[i * 3] *= dm; vel[i * 3 + 1] = vel[i * 3 + 1] * dm + rise[i] * dt; vel[i * 3 + 2] *= dm;
    pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    if (pos[i * 3 + 1] < .1) { pos[i * 3 + 1] = .1; vel[i * 3 + 1] = Math.abs(vel[i * 3 + 1]) * .2; }
    if (pos[i * 3 + 1] > ceil[i]) { pos[i * 3 + 1] = ceil[i]; vel[i * 3 + 1] = 0; }
    iPos[i * 3] = pos[i * 3]; iPos[i * 3 + 1] = pos[i * 3 + 1]; iPos[i * 3 + 2] = pos[i * 3 + 2];
    iSize[i] = s0[i] + (s1[i] - s0[i]) * Math.pow(t01, .7);
    iA[i] = a0[i] * Math.pow(1 - t01, 1.3) * Math.min(1, age[i] * 12);
    iGlow[i] = g0[i] * Math.exp(-age[i] * gdec[i]);
  }
  a.iPos.needsUpdate = a.iSize.needsUpdate = a.iA.needsUpdate = a.iGlow.needsUpdate = a.iCol.needsUpdate = a.iSeed.needsUpdate = a.iFlat.needsUpdate = true;
};
F.burst = () => { purgeBurst = true; };

// crash: white flash, fireball, sparks and a billowing smoke column; the wreck keeps burning (see the emitter in update)
F.explode = function (p, v) {
  F.mesh.material.uniforms.uNearFade.value = 0;
  wreck = { p: p.clone(), t: 0 };
  const r = (a, b) => a + Math.random() * (b - a), dir = () => { const z = r(-1, 1), a = r(0, 6.283), s = Math.sqrt(1 - z * z); return [s * Math.cos(a), z, s * Math.sin(a)]; };
  for (let k = 0; k < 14; k++) { const d = dir(), sp = r(0, 3); spawn(p.x, p.y, p.z, d[0] * sp, d[1] * sp, d[2] * sp, r(.2, .4), 4, r(14, 20), 3, 2.7, 2, 1, 1.5, 1, 0, 1, 1e9, 6); }
  for (let k = 0; k < 110; k++) { const d = dir(), sp = r(3, 17); spawn(p.x + d[0], p.y + d[1], p.z + d[2], d[0] * sp + v.x * .3, d[1] * sp * .8 + v.y * .3 + 2, d[2] * sp + v.z * .3, r(.7, 1.7), 2.5, r(7, 11), 2.6, r(.8, 1.1), .18, .9, 1.2, 2.2, 2, 1, 1e9, 1.8); }
  for (let k = 0; k < 130; k++) { const d = dir(), sp = r(2, 10); spawn(p.x + d[0], p.y + d[1], p.z + d[2], d[0] * sp + v.x * .2, Math.abs(d[1]) * sp + 2, d[2] * sp + v.z * .2, r(3.5, 6.5), 2.5, r(10, 16), .21, .2, .19, .8, 0, 1, 1.4); }
  for (let k = 0; k < 130; k++) { const d = dir(), sp = r(8, 28); spawn(p.x, p.y, p.z, d[0] * sp + v.x * .3, Math.abs(d[1]) * sp + 3, d[2] * sp + v.z * .3, r(1, 2.4), .45, .25, 2.6, r(1.2, 2), .5, 1, 1.5, .1, -16, 1, 1e9, .8); }
};
F.wreckLight = function (outPos, outGlow) {
  outPos.copy(wreck.p); outPos.y += .6;
  const k = (.35 + .65 * Math.max(0, 1 - wreck.t / 10)) * (1.1 + .5 * Math.sin(wreck.t * 37) * Math.random());
  outGlow.set(1, .42, .1).multiplyScalar(6 * k);
};
F.clear = () => { age.fill(9); iSize.fill(0); iA.fill(0); iGlow.fill(0); acc = [0, 0, 0, 0]; accGround = [0, 0, 0, 0]; accPurge = [0, 0, 0, 0]; wreck = null; accFlame = accSmoke = 0; F.mesh.material.uniforms.uNearFade.value = 1; };
})();
