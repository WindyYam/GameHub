/* CAR — procedurally modelled white wedge hypercar (lofted body + glasshouse, aero-disc wheels, wheel-mounted compressed-air nozzles) */
(function () {
'use strict';
const NA = window.NA, P = NA.P, { clamp, lerp } = NA.M, V3 = NA.V3;
const H0 = P.comH;                                   // geometry authored as height-above-ground (hg); body origin = centre of mass
const SX = [1, 1, -1, -1], SZ = [-1, 1, -1, 1];

// ---------- helpers ----------
function keyInterp(keys) {                           // cubic Hermite through (x,y) keys
  const n = keys.length;
  const tan = keys.map((k, i) => { const a = keys[Math.max(i - 1, 0)], b = keys[Math.min(i + 1, n - 1)]; return (b[1] - a[1]) / ((b[0] - a[0]) || 1); });
  return x => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (x > keys[i + 1][0]) i++;
    const x0 = keys[i][0], x1 = keys[i + 1][0], h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * keys[i][1] + (t3 - 2 * t2 + t) * h * tan[i] + (-2 * t3 + 3 * t2) * keys[i + 1][1] + (t3 - t2) * h * tan[i + 1];
  };
}
function catmull(pts, sub) {
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(c => .5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[n - 1].slice());
  return out;
}
// loft: strips are independent vertex sets (hard creases between strips, smooth shading inside); material index per strip per station
function loft(xs, stripsAt) {
  const st = xs.map(stripsAt), nS = st[0].length, S = xs.length;
  const pos = [], idx = []; let base = 0;
  for (let si = 0; si < nS; si++) {
    const rows = st.map(s => catmull(s[si].pts, s[si].sub || 2)), cnt = rows[0].length;
    for (const r of rows) for (const p of r) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < S - 1; i++) {
      const mat = st[i][si].mat;
      for (let j = 0; j < cnt - 1; j++) {
        const a = base + i * cnt + j, b = a + 1, c = a + cnt, d = c + 1;
        (idx[mat] = idx[mat] || []).push(a, b, c, b, d, c);
      }
    }
    base += S * cnt;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const all = []; let off = 0;
  idx.forEach((list, m) => { if (!list) return; g.addGroup(off, list.length, m); off += list.length; all.push(...list); });
  g.setIndex(all); g.computeVertexNormals();
  return g;
}
function fan(poly) {                                  // flat cap from a closed polygon
  const c = [0, 0, 0]; poly.forEach(p => { c[0] += p[0] / poly.length; c[1] += p[1] / poly.length; c[2] += p[2] / poly.length; });
  const pos = [...c], idx = [];
  poly.forEach(p => pos.push(...p));
  for (let i = 0; i < poly.length; i++) idx.push(0, 1 + i, 1 + (i + 1) % poly.length);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; return t;
}

// ---------- materials ----------
const M = {
  paint: new THREE.MeshPhysicalMaterial({ color: 0xf1f3f6, metalness: .28, roughness: .3, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.05, side: THREE.DoubleSide }),
  carbon: new THREE.MeshPhysicalMaterial({ color: 0x0b0d11, metalness: .55, roughness: .38, clearcoat: .6, clearcoatRoughness: .2, envMapIntensity: .9, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x06090f, metalness: .1, roughness: .04, transparent: true, opacity: .8, envMapIntensity: 2.6, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
  black: new THREE.MeshStandardMaterial({ color: 0x050608, metalness: .3, roughness: .6, side: THREE.DoubleSide }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0b0b0d, metalness: 0, roughness: .92, envMapIntensity: .3 }),
  alloy: new THREE.MeshStandardMaterial({ color: 0x8a919b, metalness: .95, roughness: .28, envMapIntensity: 1.2, side: THREE.DoubleSide }),
  gun: new THREE.MeshStandardMaterial({ color: 0x1b1f26, metalness: .9, roughness: .35, envMapIntensity: 1.1, side: THREE.DoubleSide }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x9a6a3a, metalness: .95, roughness: .3, envMapIntensity: 1.2, side: THREE.DoubleSide }),
  seat: new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: .2, roughness: .7 }),
  tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1020).multiplyScalar(3.2) }),
  drl: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcfe9ff).multiplyScalar(4) }),
  neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30c8ff).multiplyScalar(3) }),
  screen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35b6ff).multiplyScalar(1.6) })
};
NA.carMat = M;

const wheelTex = canvasTex(512, 512, (g, w, h) => {      // aero-disc cover with turbine slits (transparent slits)
  g.clearRect(0, 0, w, h); const c = w / 2;
  const grad = g.createRadialGradient(c, c, 20, c, c, c); grad.addColorStop(0, '#d8dde5'); grad.addColorStop(.6, '#9aa1ac'); grad.addColorStop(1, '#6f7681');
  g.fillStyle = grad; g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out';
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    g.save(); g.translate(c, c); g.rotate(a);
    g.beginPath(); g.moveTo(c * .36, -7); g.quadraticCurveTo(c * .62, -22, c * .9, -12); g.lineTo(c * .9, 2); g.quadraticCurveTo(c * .62, -8, c * .36, 7); g.closePath(); g.fill();
    g.restore();
  }
  g.beginPath(); g.arc(c, c, c * .2, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(20,24,30,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(c, c, c * .33, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(c, c, c * .93, 0, Math.PI * 2); g.stroke();
});
M.disc = new THREE.MeshStandardMaterial({ map: wheelTex, alphaTest: .5, metalness: .85, roughness: .32, side: THREE.DoubleSide, envMapIntensity: 1.3 });

// ---------- body profile functions (hg = height above ground) ----------
const fYt = keyInterp([[-2.27, .86], [-2.0, .95], [-1.375, .98], [-.6, .97], [.2, .94], [.95, .90], [1.375, .90], [1.8, .70], [2.1, .53], [2.27, .42]]);
const fWb = keyInterp([[-2.27, .80], [-2.0, .93], [-1.4, .99], [-.4, .97], [.6, .96], [1.4, .96], [1.9, .86], [2.27, .60]]);
const fYb = keyInterp([[-2.27, .32], [-2.0, .20], [-1.7, .15], [1.6, .15], [2.0, .18], [2.27, .24]]);
const fYr = keyInterp([[-1.95, .97], [-1.7, 1.04], [-1.3, 1.13], [-.8, 1.2], [-.3, 1.2], [.1, 1.17], [.5, 1.06], [.98, .92]]);
const fWl = keyInterp([[-1.95, .55], [-1.5, .74], [-.8, .82], [.2, .80], [.7, .66], [.98, .50]]);
const fWr = keyInterp([[-1.95, .35], [-1.4, .50], [-.7, .58], [0, .56], [.5, .44], [.98, .30]]);
const WHEEL_X = P.wbHalf, ARCH_R = P.R + .07;
const archTop = x => { let y = -1e9; for (const xc of [WHEEL_X, -WHEEL_X]) { const d = Math.abs(x - xc); if (d < ARCH_R) y = Math.max(y, P.R + Math.sqrt(ARCH_R * ARCH_R - d * d)); } return y; };
const Y = hg => hg - H0;

function bodyRing(x) {
  const yt = fYt(x), wb = fWb(x), yb = fYb(x), ya = Math.max(yb, archTop(x));
  const wt = wb - .12, ws = wb - .05, ys = yt - .08;
  const y5 = Math.min(ya + .13, ys - .015), ym = (ys + y5) / 2;
  const mir = pts => pts.map(p => [p[0], p[1], -p[2]]).reverse();
  const c0 = [x, Y(yt + .03), 0], c1 = [x, Y(yt + .016), wt * .5], c2 = [x, Y(yt), wt];
  const top = [[x, Y(yt), -wt], [x, Y(yt + .016), -wt * .5], c0, c1, c2];
  const shR = [c2, [x, Y(ys), ws]];
  const sd1 = [[x, Y(ys), ws], [x, Y(ym), wb - .012], [x, Y(y5), wb]];
  const sd2 = [[x, Y(y5), wb], [x, Y(ya), wb - .05]];
  const und = [[x, Y(ya), -(wb - .05)], [x, Y(ya), -.70], [x, Y(yb), -.45], [x, Y(yb), .45], [x, Y(ya), .70], [x, Y(ya), wb - .05]];
  return [
    { pts: top, sub: 3, mat: 0 }, { pts: shR, sub: 1, mat: 0 }, { pts: mir(shR), sub: 1, mat: 0 },
    { pts: sd1, sub: 3, mat: 0 }, { pts: mir(sd1), sub: 3, mat: 0 },
    { pts: sd2, sub: 1, mat: 1 }, { pts: mir(sd2), sub: 1, mat: 1 }, { pts: und, sub: 2, mat: 1 }
  ];
}
function bodyPolygon(x) {
  const yt = fYt(x), wb = fWb(x), yb = fYb(x), ya = Math.max(yb, archTop(x)), wt = wb - .12, ws = wb - .05, ys = yt - .08, y5 = Math.min(ya + .13, ys - .015), ym = (ys + y5) / 2;
  return [
    [x, Y(yt), -wt], [x, Y(yt + .03), 0], [x, Y(yt), wt], [x, Y(ys), ws], [x, Y(ym), wb - .012], [x, Y(y5), wb], [x, Y(ya), wb - .05],
    [x, Y(ya), .70], [x, Y(yb), .45], [x, Y(yb), -.45], [x, Y(ya), -.70], [x, Y(ya), -(wb - .05)],
    [x, Y(y5), -wb], [x, Y(ym), -(wb - .012)], [x, Y(ys), -ws]
  ];
}
function cabinRing(x) {
  const yr = fYr(x), yb = fYt(x) + .02, wl = fWl(x), wr = fWr(x);
  const roofMat = (x < .12 && x > -1.15) ? 0 : 1;
  const q = [[0, yr + .02], [wr * .6, yr + .012], [wr, yr - .025], [lerp(wr, wl, .3), lerp(yr, yb, .3)], [lerp(wr, wl, .85), lerp(yr, yb, .8)], [wl, yb]];
  const R = q.map(p => [x, Y(p[1]), p[0]]), L = q.map(p => [x, Y(p[1]), -p[0]]);
  return [
    { pts: [L[2], L[1], [x, Y(yr + .02), 0], R[1], R[2]], sub: 3, mat: roofMat },
    { pts: [R[2], R[3]], sub: 1, mat: 0 }, { pts: [L[3], L[2]], sub: 1, mat: 0 },
    { pts: [R[3], R[4], R[5]], sub: 2, mat: 1 }, { pts: [L[5], L[4], L[3]], sub: 2, mat: 1 }
  ];
}

// ---------- builders ----------
function box(w, h, d, mat, x, hg, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, Y(hg), z); m.rotation.set(rx, ry, rz); return m;
}
function latheAxisZ(pts, seg) { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); g.rotateX(Math.PI / 2); return g; }

function makeWheel(side) {                                // side +1: outer face towards +z
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const tire = latheAxisZ([[.215, -.14], [.235, -.147], [.29, -.152], [.325, -.128], [.338, -.08], [.34, -.03], [.34, .03], [.338, .08], [.325, .128], [.29, .152], [.235, .147], [.215, .14]], 72);
  spin.add(new THREE.Mesh(tire, M.rubber));
  for (const s of [-1, 1]) {                              // sidewall lettering ring + tread grooves
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.27, .004, 6, 72), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: .8 })); ring.position.z = s * .148; spin.add(ring);
  }
  for (const gz of [-.07, 0, .07]) { const gr = new THREE.Mesh(new THREE.TorusGeometry(.339, .004, 6, 72), M.black); gr.position.z = gz; spin.add(gr); }
  const barrel = new THREE.Mesh(latheAxisZ([[.23, -.12], [.226, 0], [.23, .12]], 40), M.gun); spin.add(barrel);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(.262, 64), M.disc); disc.position.z = .152 * side; if (side < 0) disc.rotation.y = Math.PI; spin.add(disc);
  const dish = new THREE.Mesh(latheAxisZ([[.0, .105], [.06, .11], [.12, .125], [.235, .15]], 40), M.gun); dish.scale.z = side; spin.add(dish);
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(.205, .205, .02, 48), M.alloy); brake.rotation.x = Math.PI / 2; brake.position.z = .06 * side; spin.add(brake);
  const hub = new THREE.Mesh(new THREE.TorusGeometry(.055, .011, 8, 32), M.neon); hub.position.z = .158 * side; spin.add(hub);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .02, 20), M.alloy); cap.rotation.x = Math.PI / 2; cap.position.z = .16 * side; spin.add(cap);
  const cal = box(.2, .11, .05, new THREE.MeshStandardMaterial({ color: 0xff3a1a, metalness: .4, roughness: .35, emissive: 0x330800 }), 0, 0, 0);
  cal.position.set(-.02, .15, .09 * side); g.add(cal);        // caliper stays with the hub (does not spin)
  return g;
}

function makeNozzle() {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(new THREE.LatheGeometry([[.05, 0], [.052, -.03], [.07, -.08], [.1, -.14], [.112, -.17], [.1, -.17], [.088, -.14], [.06, -.08], [.042, -.03], [.04, 0]].map(p => new THREE.Vector2(p[0], p[1])), 28), M.bronze);
  g.add(bell);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .035, 24), M.gun); collar.position.y = .02; g.add(collar);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(.098, 24), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = Math.PI / 2; glow.position.y = -.172; g.add(glow);
  return { group: g, glow };
}

function jetMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uT: { value: 0 }, uSeed: { value: Math.random() * 10 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT=-position.y; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: `uniform float uI,uT,uSeed; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge=pow(abs(dot(normalize(vN),normalize(vV))),1.4);
        float f=.85+.15*sin(uT*60.+uSeed+vT*14.)*sin(uT*37.+uSeed*2.);
        float a=pow(clamp(1.-vT,0.,1.),1.6)*edge*uI*f;
        vec3 c=mix(vec3(.85,.97,1.)*3.2,vec3(.25,.55,1.)*1.1,smoothstep(0.,.9,vT));
        gl_FragColor=vec4(c*a,a);
      }`
  });
}

NA.buildCar = function () {
  const car = { root: new THREE.Group(), wheels: [], nozzles: [], jets: [], jetMats: [] };
  const body = new THREE.Group(); car.root.add(body); car.body = body;

  // lower body + glasshouse
  const xs = []; for (let i = 0; i <= 260; i++) xs.push(-2.27 + 4.54 * i / 260);
  const bg = loft(xs, bodyRing);
  body.add(new THREE.Mesh(bg, [M.paint, M.carbon]));
  body.add(new THREE.Mesh(fan(bodyPolygon(2.27)), M.paint), new THREE.Mesh(fan(bodyPolygon(-2.27)), M.paint));
  const cxs = []; for (let i = 0; i <= 110; i++) cxs.push(-1.95 + 2.93 * i / 110);
  body.add(new THREE.Mesh(loft(cxs, cabinRing), [M.paint, M.glass]));
  // dark cabin floor + seats + dash
  const fl = new THREE.Mesh(new THREE.BoxGeometry(2.3, .02, 1.3), M.black); fl.position.set(-.5, Y(.965), 0); body.add(fl);
  for (const z of [-.36, .36]) {
    body.add(box(.42, .1, .46, M.seat, -.55, 1.0, z), box(.1, .22, .44, M.seat, -.8, 1.06, z, 0, 0, -.18), box(.1, .08, .22, M.seat, -.85, 1.14, z));
  }
  body.add(box(.5, .08, 1.3, M.black, .42, .98, 0, 0, 0, .12));
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.14, .014, 8, 24), M.black); wheel.position.set(.2, Y(1.08), -.36); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = .35; body.add(wheel);
  const scr = box(.01, .09, .26, M.screen, .16, 1.04, 0); body.add(scr);

  // aero furniture
  const spl = box(.62, .035, 1.7, M.carbon, 2.13, .17, 0); spl.geometry.translate(0, 0, 0); body.add(spl);
  body.add(box(.55, .03, 1.2, M.carbon, 2.08, .20, 0, 0, 0, -.18));
  for (const z of [-.8, .8]) body.add(box(.34, .02, .2, M.carbon, 2.1, .22, z * 1.0, 0, .0, 0));
  const dif = box(.46, .02, 1.4, M.carbon, -1.97, .2, 0, 0, 0, .3); body.add(dif);
  for (let i = -3; i <= 3; i++) body.add(box(.4, .1, .012, M.carbon, -1.96, .22, i * .19, 0, 0, .3));
  body.add(box(.34, .035, 1.7, M.paint, -2.2, .9, 0, 0, 0, -.08));                         // lip spoiler
  // lights
  body.add(box(.03, .045, 1.28, M.tail, -2.268, .75, 0));
  for (const z of [-1, 1]) {
    body.add(box(.03, .14, .05, M.tail, -2.262, .66, z * .67), box(.02, .02, .3, M.tail, -2.0, .955, z * .62, 0, 0, 0));
    body.add(box(.34, .02, .026, M.drl, 2.06, .5, z * .5, 0, -z * .38, .0));
    body.add(box(.24, .02, .026, M.drl, 1.95, .56, z * .66, 0, -z * .62, 0));
    body.add(box(.44, .03, .03, M.drl, 1.6, .82, z * .74, 0, -z * .12, .0));
  }
  // intakes, vents, shut lines (dark inlays)
  for (const z of [-1, 1]) {
    const wz = (x) => z * (fWb(x) + .003);
    body.add(box(.5, .16, .008, M.black, -.82, .62, wz(-.82)), box(.4, .05, .008, M.black, 1.02, .66, wz(1.02), 0, 0, -.1));
    for (let i = 0; i < 5; i++) body.add(box(.014, .15, .01, M.carbon, -1.0 + i * .12, .62, wz(-.82) + z * .004));
    body.add(box(.006, .34, .006, M.black, .05, .74, wz(.05) - z * .002), box(.006, .34, .006, M.black, -1.14, .74, wz(-1.14) - z * .002));
    body.add(box(1.2, .006, .006, M.black, -.55, .58, wz(-.55) - z * .002));
    const stalk = box(.05, .05, .13, M.carbon, .58, .98, z * .93), mir = box(.14, .07, .04, M.paint, .58, 1.02, z * 1.0, 0, z * .35, 0);
    body.add(stalk, mir, box(.02, .05, .12, M.black, .59, 1.02, z * 1.0 - z * .03, 0, z * .35, 0));
    body.add(box(2.4, .012, .012, M.neon, -.2, .73, z * (fWb(-.2) + .004)));
    body.add(box(2.2, .018, .02, M.neon, -.1, .17, z * .64));                              // underglow
  }
  body.add(box(.012, .012, 1.3, M.neon, 1.7, .93, 0, 0, 0, -.2));                           // hood accent

  // wheels, nozzles, jets
  const jetGeo = new THREE.ConeGeometry(1, 1, 18, 1, true); jetGeo.translate(0, -.5, 0);
  for (let i = 0; i < 4; i++) {
    const w = makeWheel(SZ[i]); body.add(w); car.wheels.push(w);
    const nz = makeNozzle(); nz.group.position.set(SX[i] * P.wbHalf, P.nozzleY, SZ[i] * P.nozzleZ); body.add(nz.group); car.nozzles.push(nz);
    const jm = jetMaterial(); const jet = new THREE.Mesh(jetGeo, jm); jet.frustumCulled = false; jet.position.copy(nz.group.position).y -= .17; jet.renderOrder = 5; body.add(jet);
    const jm2 = jetMaterial(); const core = new THREE.Mesh(jetGeo, jm2); core.frustumCulled = false; core.position.copy(jet.position); core.renderOrder = 6; body.add(core);
    car.jets.push({ jet, core }); car.jetMats.push([jm, jm2]);
    // wheel-arch plenum / hose: a small tank bulb above each nozzle
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .2, 14), M.alloy); tank.position.set(SX[i] * P.wbHalf, P.nozzleY + .13, SZ[i] * (P.nozzleZ - .02)); body.add(tank);
  }
  // lights
  car.head = new THREE.SpotLight(0xcfe4ff, 5, 110, .5, .6, 1.4); car.head.position.set(2.0, Y(.5), 0); car.head.target.position.set(40, Y(.1), 0);
  body.add(car.head, car.head.target);
  car.hueTop = new THREE.PointLight(0x33aaff, 1.4, 26, 1.6); car.hueTop.position.set(0, 1.8, 0); body.add(car.hueTop);
  car.hueLow = new THREE.PointLight(0xff33cc, 3.5, 20, 1.6); car.hueLow.position.set(0, Y(.05), 0); body.add(car.hueLow);
  car.jetLight = new THREE.PointLight(0x8fd4ff, 0, 30, 1.6); car.jetLight.position.set(0, -1.2, 0); body.add(car.jetLight);
  car.root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });

  // wreck look: every surface turns to burnt black, lights and jets go out (reversible)
  const char = new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: .95, metalness: .15 });
  const lights = [[car.head, car.head.intensity], [car.hueTop, car.hueTop.intensity], [car.hueLow, car.hueLow.intensity]];
  car.setWreck = on => {
    car.root.traverse(o => {
      if (!o.isMesh) return;
      const m = o.userData.m0 || o.material;
      if (!Array.isArray(m) && (m.transparent || m.blending === THREE.AdditiveBlending)) return;   // jets and glows stay as they are (they are off)
      if (on) { if (!o.userData.m0) o.userData.m0 = o.material; o.material = Array.isArray(o.userData.m0) ? o.userData.m0.map(() => char) : char; }
      else if (o.userData.m0) o.material = o.userData.m0;
    });
    lights.forEach(([l, i]) => { l.intensity = on ? 0 : i; });
    car.wrecked = on;
  };
  return car;
};
})();
