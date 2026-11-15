// glazed/testscene.js — debug scene of the "glazed" subsystem. OWNER: relief artist.
// Switched on by the URL flag with=glazedtest (render.mjs --with glazedtest); never part of the film.
// It stands far outside the city (around x = 6000, z = 4000) on its own floor, built from plain meshes so that it
// needs no other subsystem than materials: use --massing 0 for a clean frame.
//
//   north-facing wall (raking afternoon sun, as on the real gate front; n.sun = 0.28):
//     A  a gate-tower face 6.2 x 17.3 m: socle, six rows of bulls and dragons
//     B  figures at eye level: a row of four bulls, a row of four dragons
//     B2 the lion frieze, a turquoise and a lapis division (all four lion variants)
//   the south face of the same wall: B and B2 again, in shade
//   a street 21.5 m wide: C its east wall (faces west, sunlit), D its west wall (faces east, open shade), each
//     with 26 m of lion frieze in four divisions; the lions stride north on both.
// buildTestScene returns { cams: { name: "x,y,z;lx,ly,lz;fov" }, center, y0 } for render.mjs --cam.

export function buildTestScene(ctx, G) {
  const THREE = ctx.THREE, group = new THREE.Group();
  group.name = 'glazed:testscene';
  ctx.scene.add(group);
  const cx = 6000, cz = 4000, y0 = Math.round(ctx.ground.height(cx, cz)) + 3;
  const cams = {};
  const fmt = (v) => v.map((n) => +n.toFixed(2)).join(',');
  const cam = (name, pos, look, fov = 40) => { cams[name] = `${fmt(pos)};${fmt(look)};${fov}`; };

  const mat = (id) => ctx.materials.get(ctx.materials.has(id) ? id : 'mudPlaster');
  const box = (id, x0, x1, ya, yb, z0, z1, cast = true) => {
    const g = new THREE.BoxGeometry(x1 - x0, yb - ya, z1 - z0);
    g.translate((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    const m = new THREE.Mesh(g, mat(id));
    m.castShadow = cast; m.receiveShadow = true; m.name = 'glazed:test-' + id;
    group.add(m);
    return m;
  };
  const skin = (p) => {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.castShadow = false; m.receiveShadow = true; m.name = 'glazed:test-panel';
    group.add(m);
    return p;
  };

  // floor
  box('limestone', cx - 40, cx + 80, y0 - 1.5, y0, cz - 50, cz + 30, false);

  // ---------------------------------------------------------------- the north / south wall (faces at z = cz and cz + 2)
  const T = 2, PROUD = 0.02;
  const N = [-1, 0, 0], S = [1, 0, 0];           // viewer's right on the north face / on the south face
  // A: gate-tower face
  const aW = 6.2, aH = 17.3, aX = cx - 10;      // viewer's-left (east) end
  box('bakedBrickBuff', aX - aW, aX, y0 - 1, y0 + aH, cz + PROUD, cz + T);
  skin(G.gatePanel({ origin: [aX, y0, cz], right: N, width: aW, height: aH, facing: 'R', corners: 'both' }));
  cam('tower25', [aX - aW / 2, y0 + 1.7, cz - 25], [aX - aW / 2, y0 + 8.4, cz], 45);
  cam('tower12', [aX - aW / 2 + 5, y0 + 1.7, cz - 11], [aX - aW / 2, y0 + 4.2, cz], 50);

  // B: bulls and dragons at eye level (north = raking sun, south = shade)
  const bW = 14, bX = cx + 8;
  const xs = G.spread(bW, { count: 4 });
  const rowOf = (figure, flip) => ({ type: 'figures', figure, courses: 13, ground: 'glazeBlue', items: xs.map((x, i) => ({ x, facing: (i < 2) !== flip ? 'R' : 'L', variant: i % 2 })) });
  const bBands = (flip) => [
    { type: 'field', courses: 2 }, { type: 'checker' }, { type: 'rosette' }, { type: 'checker' },
    rowOf('bull', flip), { type: 'field', courses: 11 }, rowOf('dragon', flip), { type: 'field', courses: 5 },
  ];
  const bH = (13 + 13 + 11 + 13 + 5) * G.COURSE;
  box('bakedBrickBuff', bX - bW, bX, y0 - 1, y0 + 6, cz + PROUD, cz + T - PROUD);
  const bN = skin(G.panel({ origin: [bX, y0, cz], right: N, width: bW, bands: bBands(false), seed: 1 }));
  const bS = skin(G.panel({ origin: [bX - bW, y0, cz + T], right: S, width: bW, bands: bBands(true), seed: 2 }));
  for (const [tag, p, sign, z, ox] of [['sun', bN, -1, cz, bX], ['shade', bS, 1, cz + T, bX - bW]]) {
    for (const it of p.items) {
      const wx = ox + (sign < 0 ? -it.x : it.x), wy = y0 + it.y + 0.56;
      cam(`${it.figure}-${it.variant ? 'ochre' : 'white'}-${it.facing}-${tag}`, [wx, wy, z + sign * 3], [wx, wy, z], 40);
    }
  }

  // B2: the lion frieze on the same wall, one turquoise and one lapis division
  const lW = 6, lX = cx + 22;
  box('bakedBrickBuff', lX - 2 * lW, lX, y0 - 1, y0 + 6, cz + PROUD, cz + T - PROUD);
  const lions = [];
  lions.push(['sun', -1, cz, lX, skin(G.lionFrieze({ origin: [lX, y0, cz], right: N, width: lW, count: 2, facing: 'L', ground: 'turquoise', seed: 3 }))]);
  lions.push(['sun', -1, cz, lX - lW, skin(G.lionFrieze({ origin: [lX - lW, y0, cz], right: N, width: lW, count: 2, facing: 'R', ground: 'lapis', variantStart: 1, seed: 4 }))]);
  lions.push(['shade', 1, cz + T, lX - 2 * lW, skin(G.lionFrieze({ origin: [lX - 2 * lW, y0, cz + T], right: S, width: lW, count: 2, facing: 'L', ground: 'lapis', seed: 5 }))]);
  lions.push(['shade', 1, cz + T, lX - lW, skin(G.lionFrieze({ origin: [lX - lW, y0, cz + T], right: S, width: lW, count: 2, facing: 'R', ground: 'turquoise', variantStart: 1, seed: 6 }))]);
  for (const [tag, sign, z, ox, p] of lions) {
    for (const it of p.items) {
      const wx = ox + (sign < 0 ? -it.x : it.x), wy = y0 + it.y + 0.47;
      cam(`lion-v${it.variant}-${it.facing}-${tag}`, [wx, wy, z + sign * 3], [wx, wy, z], 40);
    }
  }
  cam('wall-sun', [cx + 4, y0 + 1.7, cz - 14], [cx + 6, y0 + 2.2, cz], 50);
  cam('wall-shade', [cx + 6, y0 + 1.7, cz + T + 14], [cx + 6, y0 + 2.2, cz + T], 50);

  // ---------------------------------------------------------------- the street: D west wall (faces east), C east wall (faces west)
  const sx0 = cx + 40, sx1 = sx0 + 21.5, zN = cz - 30, zS = cz - 4, div = 6.5, DIV = 0.11;
  box('bakedBrickBuff', sx0 - T, sx0 - PROUD, y0 - 1, y0 + 6, zN, zS);
  box('bakedBrickBuff', sx1 + PROUD, sx1 + T, y0 - 1, y0 + 12, zN, zS);
  for (let i = 0; i < 4; i++) {
    const ground = i % 2 ? 'lapis' : 'turquoise', w = div - (i < 3 ? DIV : 0);
    // east wall C: viewer looks east, right = south; the lions stride north = to the viewer's LEFT
    const zc = zN + i * div;
    skin(G.lionFrieze({ origin: [sx1, y0, zc], right: [0, 0, 1], width: w, count: 2, facing: 'L', ground, variantStart: i % 2, seed: 10 + i }));
    // west wall D: viewer looks west, right = north; the lions stride north = to the viewer's RIGHT
    const zd = zS - i * div;
    skin(G.lionFrieze({ origin: [sx0, y0, zd], right: [0, 0, -1], width: w, count: 2, facing: 'R', ground, variantStart: i % 2, seed: 20 + i }));
    if (i < 3) {   // the black and white line that divides the frieze at a tower edge
      for (const [k, id] of [[0, 'course:glazeBlack'], [1, 'course:glazeWhite']]) {
        const mk = (g) => { const m = new THREE.Mesh(g, G.material); m.receiveShadow = true; group.add(m); };
        mk(G.quad(id, [sx1, y0, zc + w + k * DIV / 2], [0, 0, 1], [0, 1, 0], { width: DIV / 2, height: G.frieze.height }));
        mk(G.quad(id, [sx0, y0, zd - w - k * DIV / 2], [0, 0, -1], [0, 1, 0], { width: DIV / 2, height: G.frieze.height }));
      }
    }
  }
  const zm = (zN + zS) / 2;
  cam('frieze-sun-20m', [sx0 + 2.6, y0 + 1.6, zm], [sx1, y0 + 1.75, zm], 35);
  cam('frieze-shade-20m', [sx1 - 2.6, y0 + 1.6, zm], [sx0, y0 + 1.75, zm], 35);
  cam('street', [sx0 + 9.5, y0 + 1.6, zS + 6], [sx0 + 12, y0 + 2.2, zN], 50);
  cam('frieze-sun-oblique', [sx1 - 7, y0 + 1.6, zS + 1], [sx1, y0 + 1.7, zm - 3], 42);
  cam('frieze-shade-oblique', [sx0 + 7, y0 + 1.6, zS + 1], [sx0, y0 + 1.7, zm - 3], 42);
  cam('frieze-sun-6m', [sx1 - 6, y0 + 1.6, zm - 1], [sx1, y0 + 1.7, zm - 1.6], 45);

  console.info('[glazed] test scene at', cx, y0, cz, '\n' + Object.entries(cams).map(([k, v]) => `  ${k}: --cam "${v}"`).join('\n'));
  return { cams, center: [cx, y0, cz], group };
}
