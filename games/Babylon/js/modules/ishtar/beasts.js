// js/modules/ishtar/beasts.js — the copper beasts "at the door-jambs" (Nebuchadnezzar's inscription; SPEC 3.6):
// an aurochs bull (rimu) and a snake-dragon (mushhushshu) as free-standing statues, about the size of the relief
// animals (1.5 m long, 1.1 m at the back). Nothing of them survives: form and size are reconstruction.
// Built from ellipsoids, tapered limbs and cones; local frame: origin under the middle of the body on the plinth
// top, the animal looks along local -z, y up. Returned as one geometry (position, normal).
/** makeBeasts(THREE, geom) -> { bull(), dragon(), brazier() } */
export function makeBeasts(THREE, geom) {
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function ellipsoid(c, r, seg = 9) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
  g.applyMatrix4(new THREE.Matrix4().compose(V(...c), new THREE.Quaternion(), V(...r)));
  return g;
}
/** Tapered limb from a to b with radii ra, rb, rounded at both ends. */
function limb(a, b, ra, rb = ra, seg = 7, capA = true) {
  const pa = V(...a), pb = V(...b), d = pb.clone().sub(pa), h = d.length();
  const g = new THREE.CylinderGeometry(rb, ra, h, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(pa.clone().add(pb).multiplyScalar(0.5), q, V(1, 1, 1)));
  return capA ? [g, ellipsoid(a, [ra, ra, ra], seg), ellipsoid(b, [rb, rb, rb], seg)] : [g, ellipsoid(b, [rb, rb, rb], seg)];
}
function cone(a, b, r, seg = 7) {
  const pa = V(...a), pb = V(...b), d = pb.clone().sub(pa), h = d.length();
  const g = new THREE.ConeGeometry(r, h, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(pa.clone().add(pb).multiplyScalar(0.5), q, V(1, 1, 1)));
  return g;
}
const chain = (pts, radii, seg = 7) => { const out = []; for (let i = 0; i + 1 < pts.length; i++) out.push(...limb(pts[i], pts[i + 1], radii[i], radii[i + 1], seg, i === 0)); return out; };

function finish(parts) {
  const list = parts.flat();
  for (const g of list) { g.deleteAttribute('uv'); }
  return geom.merge(list.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** Striding aurochs bull: one long horn swept forward (the two horns overlap in profile, as on the reliefs), tail hanging. */
function bull() {
  const p = [];
  p.push(ellipsoid([0, 0.74, 0.05], [0.25, 0.27, 0.6]));                    // barrel
  p.push(ellipsoid([0, 0.78, -0.4], [0.27, 0.32, 0.3]));                    // chest and shoulder
  p.push(ellipsoid([0, 0.9, -0.32], [0.2, 0.2, 0.24]));                     // withers
  p.push(ellipsoid([0, 0.74, 0.46], [0.25, 0.28, 0.27]));                   // rump
  p.push(chain([[0, 0.88, -0.56], [0, 0.98, -0.78], [0, 1.0, -0.93]], [0.2, 0.15, 0.12]));   // neck
  p.push(ellipsoid([0, 0.97, -1.02], [0.105, 0.125, 0.19]));                // head
  p.push(ellipsoid([0, 0.9, -1.16], [0.075, 0.075, 0.09]));                 // muzzle
  for (const s of [-1, 1]) {
    p.push(chain([[s * 0.08, 1.07, -0.98], [s * 0.13, 1.17, -1.1], [s * 0.12, 1.3, -1.2]], [0.04, 0.03, 0.012], 6));   // horn
    p.push(cone([s * 0.12, 1.3, -1.2], [s * 0.1, 1.36, -1.22], 0.012, 5));
    p.push(ellipsoid([s * 0.13, 1.03, -0.9], [0.05, 0.03, 0.07], 6));       // ear
    // legs: striding, the near fore and the far hind leg forward
    const f = s < 0 ? -0.1 : 0.08, h = s < 0 ? 0.08 : -0.1;
    p.push(chain([[s * 0.15, 0.62, -0.42], [s * 0.15, 0.34, -0.44 + f * 0.5], [s * 0.15, 0.06, -0.44 + f]], [0.085, 0.055, 0.045]));
    p.push(ellipsoid([s * 0.15, 0.045, -0.46 + f], [0.06, 0.045, 0.075], 6));   // hoof
    p.push(chain([[s * 0.15, 0.62, 0.46], [s * 0.15, 0.36, 0.52 + h * 0.4], [s * 0.15, 0.06, 0.46 + h]], [0.1, 0.06, 0.045]));
    p.push(ellipsoid([s * 0.15, 0.045, 0.44 + h], [0.06, 0.045, 0.075], 6));
  }
  p.push(chain([[0, 0.86, 0.68], [0, 0.6, 0.76], [0, 0.3, 0.74]], [0.035, 0.025, 0.02], 6));   // tail
  p.push(ellipsoid([0, 0.22, 0.74], [0.04, 0.09, 0.04], 6));                // tuft
  return finish(p);
}

/** Snake-dragon: scaled snake body and neck, horned viper's head, lion forelegs, eagle hind legs, tail raised with a sting. */
function dragon() {
  const p = [];
  p.push(ellipsoid([0, 0.66, 0.06], [0.17, 0.2, 0.6]));                     // body
  p.push(ellipsoid([0, 0.7, -0.4], [0.18, 0.22, 0.24]));                    // shoulder
  p.push(ellipsoid([0, 0.66, 0.5], [0.17, 0.2, 0.22]));                     // haunch
  p.push(chain([[0, 0.76, -0.52], [0, 1.0, -0.7], [0, 1.24, -0.72], [0, 1.38, -0.78]], [0.13, 0.1, 0.085, 0.07]));   // neck, upright
  p.push(ellipsoid([0, 1.4, -0.9], [0.06, 0.06, 0.16]));                    // head
  p.push(cone([0, 1.43, -0.84], [0, 1.66, -0.78], 0.028, 6));               // the straight horn
  p.push(chain([[0, 1.42, -0.76], [0, 1.5, -0.66], [0, 1.44, -0.58]], [0.03, 0.025, 0.02], 6));   // the curl behind the horn
  p.push(cone([0, 1.37, -1.04], [0, 1.35, -1.2], 0.012, 4));                // tongue
  for (const s of [-1, 1]) {
    const f = s < 0 ? -0.1 : 0.06, h = s < 0 ? 0.06 : -0.1;
    // lion forelegs
    p.push(chain([[s * 0.11, 0.56, -0.42], [s * 0.11, 0.3, -0.44 + f * 0.5], [s * 0.11, 0.06, -0.44 + f]], [0.07, 0.05, 0.045]));
    p.push(ellipsoid([s * 0.11, 0.04, -0.48 + f], [0.06, 0.04, 0.085], 6));  // paw
    // eagle hind legs: thigh, shank, taloned foot
    p.push(chain([[s * 0.11, 0.56, 0.5], [s * 0.11, 0.3, 0.6 + h * 0.5], [s * 0.11, 0.07, 0.5 + h]], [0.085, 0.04, 0.03]));
    for (const t of [-1, 0, 1]) p.push(cone([s * 0.11, 0.05, 0.5 + h], [s * 0.11 + t * 0.06, 0.0, 0.36 + h], 0.022, 5));
  }
  p.push(chain([[0, 0.7, 0.68], [0, 0.98, 0.92], [0, 1.26, 0.9], [0, 1.4, 0.76]], [0.07, 0.05, 0.035, 0.025]));   // tail, raised
  p.push(cone([0, 1.4, 0.76], [0, 1.36, 0.6], 0.03, 5));                    // sting
  return finish(p);
}

/** Bronze brazier: tripod stand with a shallow bowl, about 1.15 m high. Local origin on the ground. */
function brazier() {
  const p = [];
  for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a); p.push(limb([c * 0.34, 0, s * 0.34], [c * 0.16, 0.95, s * 0.16], 0.022, 0.022, 5)); }
  const ring = new THREE.TorusGeometry(0.22, 0.015, 5, 14); ring.rotateX(Math.PI / 2); ring.translate(0, 0.5, 0); p.push(ring);
  const bowl = new THREE.CylinderGeometry(0.36, 0.2, 0.2, 14, 1, false); bowl.translate(0, 1.05, 0); p.push(bowl);
  const lip = new THREE.TorusGeometry(0.36, 0.022, 5, 16); lip.rotateX(Math.PI / 2); lip.translate(0, 1.15, 0); p.push(lip);
  return finish(p);
}
return { bull, dragon, brazier };
}
