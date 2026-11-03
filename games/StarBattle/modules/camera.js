'use strict';

/* =====================================================================
   STEP 8 — CAMERA DIRECTOR: a button (or C) cycles epic angles; any drag or wheel hands control back
   ===================================================================== */

const CAMDIR = { i: 0, pos: V3(), look: V3(), wp: V3(), wl: V3(), tIn: 0, fresh: false, chase: null, until: 0, side: 1, dt: .016, anc: V3(), hdg: V3(0, 0, 1), anchorFor: null };
const _cc = V3(), _cd = V3(), _cr = V3();

function pickFlight() {
  let best = null, bs = -1;
  for (const fl of FLIGHTS) {
    if (!canLead(fl.lead)) continue;
    const n = fl.m.filter(f => f.state === 1).length, s = n + (fl.lead.mode <= 1 ? 3 : 0) + rnd();
    if (n >= 3 && s > bs) { bs = s; best = fl; }
  }
  return best;
}
// ride behind and above a flight of interceptors, looking ahead of the formation
function shotChase(t, o) {
  if (!canLead(CAMDIR.chase && CAMDIR.chase.lead) || t > CAMDIR.until) { CAMDIR.chase = pickFlight(); CAMDIR.until = t + rr2(18, 28); CAMDIR.side = rnd() < .5 ? -1 : 1; }
  const fl = CAMDIR.chase; if (!fl) return shotGrand(t, o);
  _cc.set(0, 0, 0); let n = 0;
  for (const f of fl.m) if (f.state === 1) { _cc.add(f.pos); n++; }
  _cc.multiplyScalar(1 / Math.max(n, 1));
  // low-pass the anchor and heading so fighters banking, dying or respawning never jolt the camera
  const a = 1 - Math.exp(-1.6 * CAMDIR.dt);
  if (CAMDIR.anchorFor !== fl) { CAMDIR.anchorFor = fl; CAMDIR.anc.copy(_cc); CAMDIR.hdg.copy(fl.lead.dir); }
  else { CAMDIR.anc.lerp(_cc, a); CAMDIR.hdg.lerp(fl.lead.dir, a * .6); }
  _cd.copy(CAMDIR.hdg).normalize(); _cr.crossVectors(_u, _cd).normalize();
  o.wp.copy(CAMDIR.anc).  addScaledVector(_cd, -12).addScaledVector(_cr, CAMDIR.side * 5).addScaledVector(_u, 3.5);
    o.wl.copy(CAMDIR.anc).addScaledVector(_cd, 28);
}
// low over ship A's spine, watching the broadside
function shotDeckA(t, o) {
  const z = -80 + 150 * (.5 + .5 * Math.sin(t * .07)), x = 26 * Math.sin(t * .05);
  SHIP_A.root.localToWorld(o.wp.set(x, SHIP_A.top(z) + 16, z));
  o.wl.copy(SHIP_A.root.position).lerp(SHIP_B.root.position, .3); o.wl.y += 20;
}
// slow orbit of the dark dreadnought
function shotDreadnought(t, o) {
  const a = t * .045 + 1, p = SHIP_B.root.position;
  o.wp.set(p.x + Math.cos(a) * 340, p.y + 110 + 40 * Math.sin(t * .07), p.z + Math.sin(a) * 340);
  o.wl.copy(p); o.wl.y += 25;
}
// off to the side of the gap, panning between the fleets as the fire crosses
function shotCrossfire(t, o) {
  const A = SHIP_A.root.position, B = SHIP_B.root.position;
  _cd.copy(B).sub(A); _cr.set(-_cd.z, 0, _cd.x).normalize();
  o.wp.copy(A).lerp(B, .5).addScaledVector(_cr, 170); o.wp.y += 55;
  o.wl.copy(A).lerp(B, .5 + .42 * Math.sin(t * .06)); o.wl.y += 10;
}
// wide, slow orbit of the whole battle with the backdrop turning behind it
function shotGrand(t, o) {
  const a = t * .02 + .6;
  o.wp.set(Math.cos(a) * 1900, 380 + 120 * Math.sin(t * .03), Math.sin(a) * 1900); o.wl.set(0, 0, 0);
}
const SHOTS = [
  { name: 'Free camera' },
  { name: 'Chase · interceptor flight', fn: shotChase, k: 3, fov: 1.35 },
  { name: 'Flagship deck run', fn: shotDeckA, k: 1.6, fov: 1.15 },
  { name: 'Dreadnought orbit', fn: shotDreadnought, k: 1.6, fov: 1 },
  { name: 'Crossfire', fn: shotCrossfire, k: 1.4, fov: 1.1 },
  { name: 'Grand overview', fn: shotGrand, k: 1.2, fov: 1 }
];
const camBtn = document.createElement('button');
document.getElementById('tools').appendChild(camBtn);
const pilotBtn = document.createElement('button');
pilotBtn.id = 'pilot-mode-button';
document.getElementById('tools').appendChild(pilotBtn);
pilotBtn.textContent = 'Pilot · random interceptor';
function setShot(i, quiet) {
  CAMDIR.i = i; CAMDIR.fresh = true; CAMDIR.tIn = T; CAMDIR.until = 0; controls.enabled = i === 0;
  camBtn.textContent = 'Camera · ' + SHOTS[i].name; camBtn.classList.toggle('on', i !== 0);
  if (!quiet) toast(SHOTS[i].name);
}
camBtn.onclick = () => { if (!PILOT.fighter) setShot((CAMDIR.i + 1) % SHOTS.length); };
pilotBtn.onclick = () => {
  if (PILOT.fighter) {
    stopPilot();
  } else {
    setShot(0, true);
    startPilot();
  }
};
addEventListener('keydown', e => {
  if ((e.key === 'c' || e.key === 'C') && !PILOT.fighter) setShot((CAMDIR.i + 1) % SHOTS.length);
  if (e.code === 'KeyP' && !e.repeat) pilotBtn.click();
});
for (const ev of ['pointerdown', 'wheel']) addEventListener(ev, e => { if (CAMDIR.i && !(e.target.closest && e.target.closest('#tools'))) setShot(0, true); }, true);
setShot(0, true);
onFrame((dt, t) => {
  const sh = SHOTS[CAMDIR.i];
  fovMul = damp(fovMul, sh.fov || 1, 2.5, dt);
  const f = baseFov() * fovMul; if (Math.abs(camera.fov - f) > .02) { camera.fov = f; camera.updateProjectionMatrix(); }
  if (!sh.fn) return;
  CAMDIR.dt = dt; sh.fn(t, CAMDIR);
  if (CAMDIR.fresh) { CAMDIR.pos.copy(camera.position); CAMDIR.look.copy(controls.target); CAMDIR.fresh = false; }
  const k = lerp(1.2, sh.k, smooth(0, 3, t - CAMDIR.tIn));
  CAMDIR.pos.lerp(CAMDIR.wp, 1 - Math.exp(-k * dt)); CAMDIR.look.lerp(CAMDIR.wl, 1 - Math.exp(-(k + 2) * dt));
  camera.position.copy(CAMDIR.pos); controls.target.copy(CAMDIR.look); camera.lookAt(CAMDIR.look);
});
