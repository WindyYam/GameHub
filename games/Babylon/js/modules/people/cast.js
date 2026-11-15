// js/modules/people/cast.js — who people are: dress, colours and build by role (R5 2.5, 3.3; SPEC 3.18).
// Undyed wool (cream, oatmeal, grey-brown, dark brown) and bleached linen dominate; dyed red, blue, saffron show
// only as sashes, head cloths, wraps and borders. Men: belted tunic to the knee or the ankle, long hair with a
// band or a soft cap, full beard, a staff for citizens. Workers: short tunic or kilt, some bare-chested. Women:
// a long garment and a head cloth. Priests: shaven, white linen. Soldiers: pointed cap, lance, wicker shield.
import { bit } from './human.js';

export function createCast(sys) {
  const pal = sys.palette;
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const wool = (rng) => mul(pal.wool[rng.weighted([0.24, 0.27, 0.22, 0.12, 0.15])], rng.range(0.86, 1.06));
  const accent = (rng, pDye = 0.3) => (rng.chance(pDye) ? mul(pal.dyes[rng.weighted([0.45, 0.30, 0.22, 0.03])], rng.range(0.85, 1.05)) : wool(rng));
  const skin = (rng) => mul(mix(pal.skin, pal.skinDark, rng.range(0, 0.8)), rng.range(0.92, 1.05));

  /**
   * A figure record with dress and colours for a role. Roles: man, elder, worker, porter, woman, girl, child,
   * priest, soldier, boatman, musician. opts override anything (mask, A, B, scale ...).
   */
  function dress(role, rng, opts = {}) {
    const f = { kind: 'human', role, seed: rng.next(), hair: rng.chance(0.12) ? rng.range(0.4, 0.9) : rng.range(0, 0.12) };
    f.C = skin(rng);
    f.A = wool(rng); f.B = accent(rng); f.D = f.A; f.E = wool(rng);
    f.scale = rng.range(0.915, 1.03);                                   // 1.555 to 1.75 m
    let m = 0;
    switch (role) {
      case 'man': {
        const long = rng.chance(0.42);
        m = bit(long ? 'skirtLong' : 'skirtShort', 'hairLong') + (rng.chance(0.88) ? bit('beard') : 0);
        m += rng.chance(0.55) ? bit('headband') : rng.chance(0.5) ? bit('cap') : 0;
        if (rng.chance(0.38)) m += bit('mantle');
        f.amp = long ? 0.33 : 0.42;
        break;
      }
      case 'elder':
        m = bit('skirtLong', 'hairLong', 'beard', 'mantle', 'staff') + (rng.chance(0.5) ? bit('cap') : bit('headband'));
        f.hair = rng.range(0.55, 1); f.amp = 0.27; f.arms = 'staff'; f.lean = 0.10; f.scale = rng.range(0.915, 0.97);
        if (rng.chance(0.5)) f.A = mul(pal.linen, rng.range(0.9, 1));
        break;
      case 'worker': case 'porter': case 'boatman': {
        m = bit('skirtShort') + (rng.chance(0.6) ? bit('hairShort') : bit('hairLong')) + (rng.chance(0.6) ? bit('beard') : 0) + (rng.chance(0.4) ? bit('headband') : 0);
        f.A = mul(pal.wool[rng.weighted([0.2, 0.4, 0.3, 0.1, 0])], rng.range(0.85, 1.0)); f.D = rng.chance(0.45) ? f.C : f.A;
        f.B = rng.chance(0.25) ? accent(rng, 0.6) : mul(f.A, 0.75);
        break;
      }
      case 'woman': {
        m = bit('skirtLong', 'veil', 'hairLong');
        f.scale = rng.range(0.915, 0.975); f.amp = 0.30; f.hair = rng.range(0, 0.1);
        f.A = rng.chance(0.07) ? mul(pal.dyes[rng.weighted([0.6, 0.1, 0.3, 0])], rng.range(0.75, 0.95)) : wool(rng); f.D = f.A;
        f.B = accent(rng, 0.6); f.E = rng.chance(0.22) ? accent(rng, 1) : rng.chance(0.5) ? mul(pal.linen, rng.range(0.85, 1)) : wool(rng);
        break;
      }
      case 'girl': case 'child': {
        m = bit('skirtShort') + (role === 'girl' ? bit('hairLong') : bit('hairShort'));
        f.scale = rng.range(0.56, 0.78); f.headScale = 1.22 - (f.scale - 0.56) * 0.5; f.amp = 0.46; f.hair = rng.range(0, 0.08);
        f.D = rng.chance(0.3) ? f.C : f.A;
        break;
      }
      case 'priest':
        m = bit('skirtLong') + (rng.chance(0.35) ? bit('mantle') : 0);
        f.A = mul(pal.linen, rng.range(0.94, 1.02)); f.D = f.A; f.E = mul(pal.linen, rng.range(0.9, 1)); f.B = rng.chance(0.5) ? mul(pal.linen, 0.88) : mul(pal.red, rng.range(0.85, 1));
        f.amp = 0.28; f.hair = 0;
        break;
      case 'soldier':
        m = bit('skirtShort', 'helmet', 'spear', 'shield', 'hairLong') + (rng.chance(0.9) ? bit('beard') : 0);
        f.A = mul(rng.chance(0.5) ? pal.oat : pal.brown, rng.range(0.9, 1.05)); f.D = f.A; f.B = mul(mix(pal.linen, pal.oat, rng.range(0.2, 0.8)), 0.95);
        f.arms = 'spear'; f.scale = rng.range(0.96, 1.03);
        break;
      case 'musician':
        m = bit('skirtLong', 'hairLong', 'beard', 'headband');
        f.A = rng.chance(0.5) ? mul(pal.linen, 0.97) : wool(rng); f.D = f.A; f.B = accent(rng, 0.9); f.amp = 0.28;
        break;
      default: m = bit('skirtShort', 'hairShort');
    }
    f.mask = m;
    if (m & bit('skirtLong')) f.lift = 0.6;                                // a long garment: the feet are not lifted through its hem
    Object.assign(f, opts);
    if (opts.add) f.mask |= opts.add;
    if (opts.del) f.mask &= ~opts.del;
    delete f.add; delete f.del;
    return f;
  }
  return { dress, wool, accent, skin, mul, mix };
}
