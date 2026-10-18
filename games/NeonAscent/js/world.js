/* WORLD — damp reflective asphalt (normal-mapped), night sky + stars + crescent moon, distant skyline. Only the track carries neon light. */
(function () {
'use strict';
const NA = window.NA, V3 = NA.V3, glsl = NA.GLSL, scene = NA.scene;
const W = NA.world = {};

// periodic (tileable) multi-octave value noise on a size x size grid; octs = [[cells, amplitude], ...]
function periodicNoise(size, octs, seed) {
  const rand = NA.M.mulberry32(seed), h = new Float32Array(size * size);
  for (const [cells, amp] of octs) {
    const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rand();
    for (let y = 0; y < size; y++) {
      const fy = y / size * cells, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % cells) * cells, yb = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < size; x++) {
        const fx = x / size * cells, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xb = (x0 + 1) % cells;
        const a = g[ya + x0 % cells], b = g[ya + xb], c = g[yb + x0 % cells], d = g[yb + xb];
        h[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
  }
  return h;
}
function tileTexture(data, size, aniso) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = aniso ? NA.renderer.capabilities.getMaxAnisotropy() : 1; tex.needsUpdate = true;
  return tex;
}
// cloud density map (r channel, 0..1)
function makeCloudMap(size = 256) {
  const h = periodicNoise(size, [[3, 1], [6, .55], [12, .3], [24, .17], [48, .09], [96, .05]], 9001);
  let lo = 1e9, hi = -1e9; for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < h.length; i++) { const v = (h[i] - lo) / (hi - lo) * 255; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  return tileTexture(data, size, false);
}

// tileable procedural tangent-space normal map: periodic value-noise height field -> central-difference slopes.
// texel layout: r = n.x (u = world +x), g = n.y (v = world +z), b = n.z (up); decoded in the shader as world (x, up, z)
function makeNormalMap(size = 512) {
  const h = periodicNoise(size, [[4, 1], [8, .7], [16, .5], [32, .36], [64, .26], [128, .2], [256, .14]], 4242);
  const data = new Uint8Array(size * size * 4), K = 2.2, at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = -(at(x + 1, y) - at(x - 1, y)) * .5 * K, ny = -(at(x, y + 1) - at(x, y - 1)) * .5 * K, l = Math.hypot(nx, ny, 1), o = (y * size + x) * 4;
    data[o] = (nx / l * .5 + .5) * 255; data[o + 1] = (ny / l * .5 + .5) * 255; data[o + 2] = (1 / l * .5 + .5) * 255; data[o + 3] = 255;
  }
  return tileTexture(data, size, true);
}

// asphalt with damp patches: normal-mapped, planar reflection offset by the surface slope, Fresnel, moon glint
function groundMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...NA.shared, tNormal: { value: makeNormalMap() } },
    vertexShader: 'varying vec3 vWp; void main(){ vec4 p=modelMatrix*vec4(position,1.); vWp=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }',
    fragmentShader: glsl + `
      uniform sampler2D tRefl; uniform sampler2D tNormal; uniform mat4 uTexMat; uniform vec4 uSpot; varying vec3 vWp;
      vec2 slope(vec3 t){ return t.xy/max(t.z,.25); }
      void main(){
        vec2 p=vWp.xz;
        float dist=length(vWp-cameraPosition);
        vec3 V=normalize(cameraPosition-vWp);
        float m=vn(p*.02)*.6+vn(p*.07+9.)*.3+vn(p*.31)*.1;
        float wet=smoothstep(.44,.6,m);
        vec2 s=slope(texture2D(tNormal,p*.05).xyz*2.-1.)*.55
              +slope(texture2D(tNormal,p*.29+.37).xyz*2.-1.)*.7
              +slope(texture2D(tNormal,p*1.7+.11).xyz*2.-1.)*.35*(1.-smoothstep(20.,80.,dist));
        s*=mix(1.,.1,wet);
        vec3 N=normalize(vec3(s.x,1.,s.y));
        float cosT=clamp(dot(N,V),.001,1.);
        float F=.04+.96*pow(1.-cosT,5.);
        vec4 pr=uTexMat*vec4(vWp+vec3(s.x,0.,s.y)*1.8,1.); vec2 uv=pr.xy/pr.w;
        float blur=mix(.02,.0025,wet);
        vec3 refl=vec3(0.);
        for(int i=0;i<9;i++){
          float a=float(i)*2.39996, r=sqrt((float(i)+.5)/9.)*blur;
          refl+=texture2D(tRefl,uv+vec2(cos(a),sin(a))*r).rgb;
        }
        refl/=9.;
        float kr=F*mix(.5,1.,wet);
        float alb=.7+.6*vn(p*2.3)*vn(p*.45+4.);
        vec3 base=vec3(.05,.052,.06)*alb*mix(1.,.45,wet);
        vec3 L=normalize(vec3(-.15,.17,-.95)), H=normalize(L+V);
        float dif=max(dot(N,L),0.);
        float spec=pow(max(dot(N,H),0.),mix(70.,500.,wet))*mix(.35,2.,wet);
        vec3 col=base*(.45+dif*2.)+refl*kr+vec3(.55,.62,.9)*spec*.25;
        vec2 sd=vWp.xz-uSpot.xy; float pool=exp(-dot(sd,sd)/(uSpot.z*uSpot.z))*uSpot.w;
        col+=(base*16.+vec3(.05))*pool*vec3(1.,.93,.8)*(1.+wet);
        col+=carLight(vWp)*.05*(.6+wet);
        col*=1.-.92*carAO(vWp);
        gl_FragColor=vec4(applyFog(col,vWp),1.);
      }`
  });
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: NA.shared.uTime, tCloud: { value: makeCloudMap() } }, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `
      uniform float uTime; uniform sampler2D tCloud; varying vec3 vD;
      float h3(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      void main(){
        vec3 d=normalize(vD); float y=d.y;
        vec3 hor=vec3(.03,.035,.07), zen=vec3(.004,.006,.02);
        vec3 c=mix(hor,zen,pow(clamp(y,0.,1.),.45));
        vec3 q=floor(d*220.); float hs=h3(q);
        vec3 cc=(q+.2+.6*vec3(h3(q+3.),h3(q+5.),h3(q+9.)))/220.;
        float sd=length(d-cc)*220.;
        float st=step(.992,hs)*smoothstep(.04,.25,y)*(1.-smoothstep(.05,.55,sd));
        float tw=.6+.4*sin(uTime*2.+hs*80.);
        c+=vec3(.8,.9,1.)*st*tw*(.35+.9*h3(q+7.));
        // big crescent moon
        vec3 mc=normalize(vec3(-.15,.17,-.95));
        float md=dot(d,mc);
        if(md>.2){
          vec3 mr=normalize(cross(mc,vec3(0.,1.,0.))), mu=cross(mr,mc);
          vec2 uv=vec2(dot(d,mr),dot(d,mu))/md;
          float R=.0425;
          float disc=1.-smoothstep(R-.0025,R,length(uv));
          float bite=1.-smoothstep(R*.9-.003,R*.9,length(uv-vec2(R*.5,R*.28)));
          float cres=disc*(1.-bite);
          float halo=exp(-length(uv)/R*1.6)*.07;
          c+=vec3(1.,.96,.82)*cres*1.7+vec3(.45,.55,.9)*halo;
        }
        // drifting cloud layer: dark bodies (the moon is behind them), silver lining on the edges facing the moon
        float hz=smoothstep(.03,.2,y);
        if(hz>0.){
          vec2 cuv=d.xz/(y+.35);
          float dens=texture2D(tCloud,cuv*.11+vec2(uTime*.009,0.)).r*.62+texture2D(tCloud,cuv*.27+vec2(uTime*.015,.002*uTime)+.37).r*.5;
          float cover=smoothstep(.56,.72,dens)*hz;
          float toMoon=max(dot(d,mc),0.);
          float edge=4.*cover*(1.-cover);
          float lining=edge*edge*(.012+pow(toMoon,45.)*.6);
          c=c*(1.-cover*.97)+vec3(.003,.004,.01)*cover+vec3(.7,.76,1.)*lining+vec3(.5,.55,.8)*cover*pow(toMoon,60.)*.15;
        }
        gl_FragColor=vec4(c,1.);
      }`
  });
}

// =====================  AUDIENCE: cheering crowd on the camera side of the scene  =====================
// one merged low-poly person (legs, torso, head, two swinging arms) instanced ~1000 times; arms and bounce are animated in the vertex shader
function personGeometry() {
  const parts = [];
  const add = (geo, part, arm = 0) => parts.push({ geo, part, arm });
  for (const s of [-1, 1]) { const l = new THREE.CylinderGeometry(.085, .075, .86, 7); l.translate(s * .1, .43, 0); add(l, 2); }
  const torso = new THREE.CylinderGeometry(.2, .17, .66, 8); torso.scale(1, 1, .62); torso.translate(0, 1.19, 0); add(torso, 0);
  const head = new THREE.SphereGeometry(.115, 8, 6); head.translate(0, 1.7, 0); add(head, 1);
  for (const s of [-1, 1]) { const a = new THREE.CylinderGeometry(.052, .045, .62, 6); a.translate(0, -.31, 0); a.translate(s * .235, 1.46, 0); add(a, 0, s); }
  const P = [], N = [], I = [], PT = [], AR = []; let base = 0;
  for (const { geo, part, arm } of parts) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); PT.push(part); AR.push(arm); }
    for (const k of geo.index.array) I.push(k + base);
    base += p.count;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(PT, 1)); g.setAttribute('aArm', new THREE.Float32BufferAttribute(AR, 1));
  g.setIndex(I);
  return g;
}
let crowdMat = null, crowdMesh = null, crowdSpots = null, crowdLaunchTime = null, crowdLaunchVel = null, cheerK = .15;
function buildCrowd() {
  const rand = NA.M.mulberry32(31337), geo = personGeometry();
  const skins = [[.9, .7, .56], [.75, .55, .42], [.55, .38, .28], [.36, .24, .17], [.95, .78, .66]];
  const suits = [0x152033, 0x25272b, 0x30343a, 0x302a2b, 0x29323a];
  const spots = [], groups = [];
  for (let x = -350; x < 40; x += 13 + rand() * 6) groups.push({ x, n: 26 + Math.floor(rand() * 22), len: 9 + rand() * 4 });
  for (const gp of groups) for (let i = 0; i < gp.n; i++) spots.push([gp.x + (rand() - .5) * gp.len, 25.4 + Math.pow(rand(), .9) * 8, rand()]);
  const n = spots.length, im = new THREE.InstancedMesh(geo, null, n), seed = new Float32Array(n), cloth = new Float32Array(n * 3), skin = new Float32Array(n * 3);
  crowdSpots = spots; crowdMesh = im;
  crowdLaunchTime = new Float32Array(n).fill(-1000); crowdLaunchVel = new Float32Array(n * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = V3(), sc = V3(), col = new THREE.Color();
  spots.forEach((s, i) => {
    pp.set(s[0], 0, s[1]); q.setFromAxisAngle(V3(0, 1, 0), Math.PI + (rand() - .5) * .9);
    const k = .93 + rand() * .17; sc.set(k * (.95 + rand() * .15), k, k); m.compose(pp, q, sc); im.setMatrixAt(i, m);
    seed[i] = rand(); col.setHex(suits[Math.floor(rand() * suits.length)]); cloth.set([col.r, col.g, col.b], i * 3);
    skin.set(skins[Math.floor(rand() * skins.length)], i * 3);
  });
  geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 1)); geo.setAttribute('iCloth', new THREE.InstancedBufferAttribute(cloth, 3)); geo.setAttribute('iSkin', new THREE.InstancedBufferAttribute(skin, 3));
  geo.setAttribute('iLaunch', new THREE.InstancedBufferAttribute(crowdLaunchTime, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('iLaunchVel', new THREE.InstancedBufferAttribute(crowdLaunchVel, 3).setUsage(THREE.DynamicDrawUsage));
  crowdMat = new THREE.ShaderMaterial({
    uniforms: { ...NA.shared, uCheer: { value: cheerK } },
    vertexShader: `
      uniform float uTime; uniform float uCheer;
      attribute float aPart; attribute float aArm; attribute float iSeed; attribute vec3 iCloth; attribute vec3 iSkin;
      attribute float iLaunch; attribute vec3 iLaunchVel;
      varying vec3 vWp; varying vec3 vN; varying vec3 vC; varying float vPart;
      void main(){
        vec3 p=position; float ph=iSeed*6.283, launched=step(-999.,iLaunch), flightT=max(uTime-iLaunch,0.)*launched;
        if(aArm!=0.){
          float ang=mix(.12+.05*sin(uTime*1.3+ph),2.55,uCheer*(1.-launched))+sin(uTime*(8.+iSeed*5.)+ph)*.38*uCheer*(1.-launched);
          vec3 sh=vec3(aArm*.235,1.46,0.); vec3 r=p-sh; float th=aArm*ang;
          p=sh+vec3(r.x*cos(th)-r.y*sin(th), r.x*sin(th)+r.y*cos(th), r.z);
        }
        p.y+=abs(sin(uTime*(5.+iSeed*3.)+ph))*.2*uCheer*uCheer*(1.-launched);
        if(launched>.5){
          vec3 pivot=vec3(0.,.85,0.), r=p-pivot, axis=normalize(vec3(sin(ph*1.7),cos(ph*2.1),sin(ph*3.3)));
          float angle=flightT*(6.+iSeed*6.);
          p=pivot+r*cos(angle)+cross(axis,r)*sin(angle)+axis*dot(axis,r)*(1.-cos(angle));
          p*=1.-smoothstep(5.,9.,flightT);
        }
        vec4 wp=modelMatrix*instanceMatrix*vec4(p,1.);
        wp.xyz+=iLaunchVel*flightT+vec3(0.,10.*flightT+.45*flightT*flightT,0.);
        vWp=wp.xyz;
        vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
        vPart=aPart; vC=aPart<.5?iCloth:(aPart<1.5?iSkin:vec3(.05,.055,.09));
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: glsl + `
      varying vec3 vWp; varying vec3 vN; varying vec3 vC; varying float vPart;
      void main(){
        vec3 n=normalize(vN);
        float moon=max(dot(n,normalize(vec3(-.15,.17,-.95))),0.);
        float amb=.22+.14*n.y;
        vec3 c=vC*(amb*.9+moon*.35)+vC*carLight(vWp)*.25+vec3(.008,.01,.018);
        gl_FragColor=vec4(applyFog(c,vWp),1.);
      }`
  });
  im.material = crowdMat; im.frustumCulled = false; scene.add(im);
}

function skylineMesh(center, rand) {
  const n = 300, material = new THREE.ShaderMaterial({
    uniforms: { ...NA.shared },
    vertexShader: 'varying vec3 vWp; varying vec3 vN; void main(){ vec4 p=instanceMatrix*vec4(position,1.); p=modelMatrix*p; vWp=p.xyz; vN=normalize(mat3(instanceMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*p; }',
    fragmentShader: glsl + `varying vec3 vWp; varying vec3 vN;
      void main(){
        float u=abs(vN.x)>.5?vWp.z:vWp.x;
        vec2 cell=vec2(floor(u/3.4),floor(vWp.y/4.2));
        vec2 f=vec2(fract(u/3.4),fract(vWp.y/4.2));
        float lit=step(.52,h21(cell))*step(.15,f.x)*step(f.x,.85)*step(.12,f.y)*step(f.y,.82)*step(.5,abs(vN.x)+abs(vN.z));
        float palette=h21(cell+9.);
        vec3 tint=mix(vec3(1.,.62,.32),vec3(.28,.72,1.),smoothstep(.15,.62,palette));
        tint=mix(tint,vec3(1.,.38,.58),smoothstep(.72,.98,palette));
        vec3 c=vec3(.01,.012,.02)+tint*lit*1.05*(.6+.4*h21(cell+3.));
        gl_FragColor=vec4(applyFog(c,vWp),1.);
      }`
  });
  const stepped = new THREE.BufferGeometry(), positions = [], normals = [], indices = [];
  let base = 0;
  for (const [part, y] of [[new THREE.BoxGeometry(.88, .68, .88), .34], [new THREE.BoxGeometry(.66, .22, .66), .79], [new THREE.BoxGeometry(.38, .1, .38), .95]]) {
    part.translate(0, y, 0);
    const pos = part.attributes.position, norm = part.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
    for (const index of part.index.array) indices.push(index + base);
    base += pos.count;
  }
  stepped.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  stepped.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  stepped.setIndex(indices);
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const tapered = new THREE.CylinderGeometry(.3, .5, 1, 8); tapered.translate(0, .5, 0);
  const round = new THREE.CylinderGeometry(.5, .5, 1, 12); round.translate(0, .5, 0);
  const geometries = [box, tapered, round, stepped], group = new THREE.Group();
  const instances = geometries.map(geo => new THREE.InstancedMesh(geo, material, n)), counts = geometries.map(() => 0);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V3(), s = V3();
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = 1500 + rand() * 1100, w = 40 + rand() * 70, h = 50 + Math.pow(rand(), 2.2) * 260;
    const style = rand(), type = style < .48 ? 0 : style < .66 ? 1 : style < .8 ? 2 : 3;
    p.set(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r); s.set(w, h, w * (.6 + rand() * .8));
    q.setFromAxisAngle(V3(0, 1, 0), rand() * Math.PI * 2);
    m.compose(p, q, s); instances[type].setMatrixAt(counts[type]++, m);
  }
  instances.forEach((im, i) => { im.count = counts[i]; im.frustumCulled = false; group.add(im); });
  return group;
}

W.build = function (rh) {
  const rand = NA.M.mulberry32(777);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), groundMaterial());
  ground.rotation.x = -Math.PI / 2; ground.frustumCulled = false; ground.renderOrder = -10;
  scene.add(ground); W.ground = NA.groundMesh = ground;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6500, 128, 64), skyMaterial()); sky.renderOrder = -1000; sky.frustumCulled = false; scene.add(sky); W.sky = sky;
  const a = NA.track.START, c = rh.land;
  scene.add(skylineMesh(V3((a.x + c.x) / 2, 0, (a.z + c.z) / 2), rand));
  buildStack(); buildSpot(); buildCrowd();
};

W.update = function (t, cam, sim) {
  W.ground.position.set(cam.position.x, 0, cam.position.z);
  W.sky.position.copy(cam.position);
  if (!sim || !crowdMesh) return;
  let changed = false;
  for (let i = 0; i < crowdSpots.length; i++) {
    if (crowdLaunchTime[i] > -999) continue;
    const [x, z] = crowdSpots[i];
    if (Math.abs(sim.pos.x - x) > 2.5 || Math.abs(sim.pos.z - z) > 2 || sim.pos.y < -1 || sim.pos.y > 2.8) continue;
    const dx = x - sim.pos.x, dz = z - sim.pos.z, d = Math.hypot(dx, dz) || 1, o = i * 3;
    crowdLaunchTime[i] = t;
    const speed = Math.hypot(sim.vel.x, sim.vel.z), dirX = speed > 2 ? sim.vel.x / speed : dx / d, dirZ = speed > 2 ? sim.vel.z / speed : dz / d;
    const launchSpeed = Math.max(speed * 2.4, 32);
    crowdLaunchVel[o] = dirX * launchSpeed;
    crowdLaunchVel[o + 1] = 0;
    crowdLaunchVel[o + 2] = dirZ * launchSpeed;
    changed = true;
  }
  if (changed) {
    crowdMesh.geometry.attributes.iLaunch.needsUpdate = true;
    crowdMesh.geometry.attributes.iLaunchVel.needsUpdate = true;
  }
};

// =====================  ENCORE PROPS: stack of trucks + cars, overhead spotlight  =====================
// vehicles are built from bevelled extruded side profiles, glass quads, tyres with rims and lamps. +x = driving direction, y = 0 on the ground
const PAINT = [0xb5382e, 0x2e6fb5, 0xd9a21b, 0xcfd3d8, 0x3a8f5a, 0x7a4fb0];
const stdM = (col, m, r, env = .5) => new THREE.MeshStandardMaterial({ color: col, metalness: m, roughness: r, envMapIntensity: env });
const paintM = col => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(col).multiplyScalar(.7), metalness: .5, roughness: .38, clearcoat: .8, clearcoatRoughness: .18, envMapIntensity: .55 });
const blackM = stdM(0x0a0b0e, .1, .85, .2), trimM = stdM(0x15171b, .3, .6, .15), chromeM = stdM(0xb8bec8, .95, .25, .8), tyreM = stdM(0x08090b, 0, .95, .1);
const glassM = new THREE.MeshStandardMaterial({ color: 0x0b1118, metalness: .9, roughness: .08, envMapIntensity: .9, side: THREE.DoubleSide });
const headM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .95, .85).multiplyScalar(1.4) });
const tailM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .08, .05).multiplyScalar(.7) });

const geoCache = new Map();
function profileGeo(key, pts, width, bevel) {
  if (!geoCache.has(key)) {
    const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    const depth = Math.max(width - 2 * bevel, .001);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
    g.translate(0, 0, -depth / 2); geoCache.set(key, g);
  }
  return geoCache.get(key);
}
function addProfile(g, key, pts, width, m, bevel = .06) { const o = new THREE.Mesh(profileGeo(key, pts, width, bevel), m); g.add(o); return o; }
function addBox(g, l, h, w, m, x, y, z) { const b = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), m); b.position.set(x, y, z); g.add(b); return b; }
function addCyl(g, r, len, m, x, y, z, axis = 'z', seg = 20) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m); c.position.set(x, y, z);
  if (axis === 'z') c.rotation.x = Math.PI / 2; else if (axis === 'x') c.rotation.z = Math.PI / 2;
  g.add(c); return c;
}
// glass panel following a profile edge a→b (profiles run clockwise, so the outward normal is (-dy, dx))
function addQuad(g, a, b, halfW, off = .012) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l * off, ny = dx / l * off;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([a[0] + nx, a[1] + ny, -halfW, b[0] + nx, b[1] + ny, -halfW, b[0] + nx, b[1] + ny, halfW, a[0] + nx, a[1] + ny, halfW], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, glassM));
}
function addWheel(g, r, w, x, z) {
  addCyl(g, r, w, tyreM, x, r, z, 'z', 28);
  addCyl(g, r * .66, w + .02, chromeM, x, r, z, 'z', 24);
  addCyl(g, r * .5, w + .035, trimM, x, r, z, 'z', 24);
  addCyl(g, r * .2, w + .06, chromeM, x, r, z, 'z', 6);
}

const CARS = {
  sedan: {
    pts: [[-2.25, .32], [-2.28, .78], [-2.1, .92], [-1.5, .97], [-1.05, 1.0], [-.72, 1.42], [.5, 1.45], [1.0, 1.02], [1.9, .92], [2.2, .78], [2.3, .55], [2.2, .32]],
    side: [[-.97, 1.04], [-.71, 1.38], [.48, 1.4], [.93, 1.05]], front: [[.5, 1.45], [1.0, 1.02]], rear: [[-1.05, 1.0], [-.72, 1.42]],
    w: 1.82, wb: 1.4, r: .34, headY: .72, tailY: .8, xf: 2.3, xr: -2.28
  },
  suv: {
    pts: [[-2.3, .42], [-2.3, 1.0], [-2.2, 1.62], [-1.0, 1.72], [.6, 1.72], [1.15, 1.22], [2.0, 1.06], [2.3, .86], [2.3, .42]],
    side: [[-2.1, 1.22], [-2.05, 1.64], [.55, 1.66], [1.05, 1.24]], front: [[.6, 1.72], [1.15, 1.22]], rear: [[-2.3, 1.1], [-2.2, 1.62]],
    w: 1.95, wb: 1.5, r: .39, headY: .92, tailY: 1.0, xf: 2.3, xr: -2.3
  },
  coupe: {
    pts: [[-2.1, .3], [-2.15, .72], [-1.6, .95], [-.8, 1.28], [.3, 1.3], [1.0, .98], [2.0, .82], [2.2, .6], [2.15, .3]],
    side: [[-.72, 1.0], [-.7, 1.25], [.26, 1.27], [.86, 1.0]], front: [[.3, 1.3], [1.0, .98]], rear: [[-1.6, .95], [-.8, 1.28]],
    w: 1.86, wb: 1.32, r: .33, headY: .66, tailY: .78, xf: 2.2, xr: -2.15
  }
};
function makeCar(col, type = 'sedan') {
  const c = CARS[type], g = new THREE.Group(), hw = c.w / 2;
  addProfile(g, 'car-' + type, c.pts, c.w, paintM(col), .07);
  addProfile(g, 'glass-' + type, c.side, c.w + .035, glassM, 0);
  addQuad(g, c.front[0], c.front[1], hw * .84); addQuad(g, c.rear[0], c.rear[1], hw * .8);
  addBox(g, c.xf - c.xr - .5, .1, c.w - .25, blackM, (c.xf + c.xr) / 2, .3, 0);                  // underbody
  for (const s of [-1, 1]) {
    addBox(g, .07, .15, .4, headM, c.xf - .02, c.headY, s * (hw - .3));
    addBox(g, .07, .12, .44, tailM, c.xr + .02, c.tailY, s * (hw - .27));
    addBox(g, .2, .1, .13, paintM(col), c.side[3][0] - .05, c.side[3][1] + .06, s * (hw + .1));    // door mirrors
    for (const x of [-.15, .75]) addBox(g, .02, .5, .02, trimM, x, .72, s * (hw + .012));          // door seams
    addBox(g, 1.6, .06, .03, trimM, .3, .45, s * (hw + .01));                                      // sill
    for (const x of [-c.wb, c.wb]) addWheel(g, c.r, .28, x, s * (hw - .06));
  }
  addBox(g, .05, .16, .75, blackM, c.xf - .005, c.headY - .17, 0);                                // grille
  addBox(g, .05, .1, .45, stdM(0xdedede, .2, .6), c.xr - .005, c.tailY - .22, 0);                 // number plate
  return g;
}

function makeTruck(cabCol, boxCol) {
  const g = new THREE.Group(), cab = paintM(cabCol), boxM = stdM(new THREE.Color(boxCol).multiplyScalar(.62), 0, .8, .1);
  addBox(g, 8.5, .26, 1.5, blackM, -.35, .8, 0);                                                  // chassis rails
  const cabPts = [[1.0, .85], [1.0, 3.0], [2.75, 3.05], [3.35, 2.25], [3.5, 2.0], [3.5, .95], [3.3, .85]];
  addProfile(g, 'cab', cabPts, 2.4, cab, .08);
  addQuad(g, [2.75, 3.05], [3.35, 2.25], 1.0);
  for (const s of [-1, 1]) {
    addBox(g, 1.5, .62, .04, glassM, 2.2, 2.5, s * 1.205);                                         // side windows
    addBox(g, .03, 1.5, .03, trimM, 1.45, 1.9, s * 1.205);                                         // door seam
    addBox(g, .05, .05, .3, trimM, 3.2, 2.45, s * 1.35); addBox(g, .14, .5, .1, blackM, 3.2, 2.45, s * 1.5);   // mirror arm + head
    addBox(g, .07, .2, .42, headM, 3.52, 1.2, s * .9);                                             // headlights
    addBox(g, .07, .09, .5, stdM(0xff8a1a, 0, .5), 3.52, 1.02, s * .9);                            // indicators
    addBox(g, .07, .26, .32, tailM, -4.42, 1.4, s * 1.0);                                          // tail lights
    addCyl(g, .3, 1.3, chromeM, -.4, .72, s * 1.05, 'x');                                          // fuel / air tanks
    for (const x of [-4.4 + .4, -3.2, -2.0]) { addBox(g, .5, .5, .03, blackM, x + .05, .98, s * 1.1); } // mudflaps
    addWheel(g, .55, .34, 2.55, s * 1.02);                                                         // steer axle
    for (const x of [-2.9, -1.65]) for (const z of [.85, 1.22]) addWheel(g, .55, .3, x, s * z);    // dual rear axles
  }
  addBox(g, .06, .75, 1.3, trimM, 3.52, 1.55, 0);                                                  // grille
  for (let i = 0; i < 4; i++) addBox(g, .02, .035, 1.3, chromeM, 3.56, 1.3 + i * .19, 0);
  addBox(g, .25, .3, 2.5, chromeM, 3.55, .78, 0);                                                  // front bumper
  addBox(g, .06, .2, .6, stdM(0xdedede, .2, .6), 3.6, .78, 0);
  addBox(g, .07, .1, .3, chromeM, 3.2, 3.12, 0);                                                   // roof lamp bar
  // cargo box with ribbed panels, roof trim and a livery stripe
  addBox(g, 5.25, 2.6, 2.5, boxM, -1.775, 2.35, 0);
  addBox(g, 5.35, .08, 2.58, trimM, -1.775, 3.67, 0);
  addBox(g, 5.35, .1, 2.58, trimM, -1.775, 1.04, 0);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) addBox(g, .07, 2.5, .05, stdM(0x8d939c, 0, .7, .15), -4.25 + i * .98, 2.35, s * 1.27);
  for (const s of [-1, 1]) addBox(g, 5.2, .4, .02, stdM(cabCol, .2, .5), -1.775, 1.75, s * 1.26);
  addBox(g, .04, 2.4, .04, trimM, -4.42, 2.35, 0); addBox(g, .04, 2.4, .04, trimM, -4.42, 2.35, .62); addBox(g, .04, 2.4, .04, trimM, -4.42, 2.35, -.62);
  addBox(g, .25, .25, 2.5, trimM, -4.5, .9, 0);                                                    // rear bumper
  return g;
}

let stack = null, stackInfo = null, stackT = 0;
function buildStack() {
  stack = new THREE.Group(); stack.visible = false;
  const put = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; stack.add(o); };
  put(makeTruck(PAINT[0], PAINT[3]), .4, 0, -1.8);
  put(makeTruck(PAINT[1], PAINT[2]), 1.0, 0, 1.8);
  put(makeCar(PAINT[4], 'sedan'), -.2, 3.7, -1.8);
  put(makeCar(PAINT[5], 'coupe'), .6, 3.7, 1.8, .06);
  put(makeCar(PAINT[2], 'suv'), 7.8, 0, .6, .12);          // cars parked against the stack on both sides
  put(makeCar(PAINT[0], 'sedan'), -7.6, 0, -.5, -.1);
  scene.add(stack);
}
W.placeStack = info => {
  stackInfo = info; stackT = 0; stack.visible = true;
  stack.rotation.y = -Math.atan2(info.dir.z, info.dir.x);
};

const spot = { k: 0, light: null, cone: null };
function buildSpot() {
  spot.light = new THREE.SpotLight(0xfff0d8, 0, 0, .22, .55, 0); spot.light.position.set(0, 32, 0); scene.add(spot.light, spot.light.target);
  const geo = new THREE.CylinderGeometry(.5, 6, 32, 28, 1, true); geo.translate(0, 16, 0);
  spot.cone = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: { ...NA.shared, uK: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vWp; void main(){ vH=position.y/32.; vec4 p=modelMatrix*vec4(position,1.); vWp=p.xyz; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-p.xyz); gl_Position=projectionMatrix*viewMatrix*p; }',
    fragmentShader: glsl + `uniform float uK; varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vWp;
      void main(){
        float edge=pow(abs(dot(normalize(vN),normalize(vV))),1.5);
        float a=edge*(.08+.2*vH)*uK;
        vec3 c=vec3(1.,.94,.82)*1.4;
        gl_FragColor=vec4(applyFog(c,vWp)*a,a);
      }`
  }));
  spot.cone.frustumCulled = false; spot.cone.visible = false; scene.add(spot.cone);
}

// per frame: slide the stack in, and switch the spotlight on once the encore landing is done
W.updateShow = function (dt, sim) {
  if (stackInfo) {
    stackT += dt;
    const e = 1 - Math.pow(1 - Math.min(stackT / 1.8, 1), 3), off = (1 - e) * 45;
    stack.position.set(stackInfo.x - stackInfo.dir.z * off, 0, stackInfo.z + stackInfo.dir.x * off);
  }
  const on = sim.act === 2 && sim.touched ? 1 : 0;
  const cheerT = on ? 1 : sim.act === 2 && sim.state === 'JUMP' ? .65 : sim.act === 1 && sim.touched ? .45 : .12;
  cheerK = NA.M.damp(cheerK, cheerT, 1.8, dt); crowdMat.uniforms.uCheer.value = cheerK;
  spot.k = NA.M.damp(spot.k, on, on ? 2.4 : 8, dt);
  const sx = sim.pos.x, sz = sim.pos.z;
  spot.light.intensity = spot.k * 2.2; spot.light.position.set(sx, 32, sz); spot.light.target.position.set(sx, 0, sz);
  spot.cone.visible = spot.k > .01; spot.cone.position.set(sx, 0, sz); spot.cone.material.uniforms.uK.value = spot.k;
  NA.shared.uSpot.value.set(sx, sz, 5.5, spot.k);
};
W.resetShow = function () {
  stackInfo = null; stack.visible = false; spot.k = 0;
  if (crowdLaunchTime) {
    crowdLaunchTime.fill(-1000); crowdLaunchVel.fill(0);
    crowdMesh.geometry.attributes.iLaunch.needsUpdate = true;
    crowdMesh.geometry.attributes.iLaunchVel.needsUpdate = true;
  }
};
})();
