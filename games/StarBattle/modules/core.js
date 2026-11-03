'use strict';

/* =====================================================================
   STEP 1 — CORE: renderer, HDR bloom pipeline, camera, lights, frame loop,
            deep-space dome (nebula + stars)
   ===================================================================== */

// ---------- math / random ----------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rad = d => d * Math.PI / 180;
const damp = (cur, tgt, k, dt) => lerp(cur, tgt, 1 - Math.exp(-k * dt));
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(20260917);            // deterministic scene layout
const rr = (a, b) => a + (b - a) * rand();
const pick = arr => arr[Math.floor(rand() * arr.length)];
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = Math.random;                      // run-time (non-layout) randomness

// ---------- noise ----------
function hash(x, y, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function vnoise(x, y, s = 0, px = 0, py = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let ix = x0, iy = y0, jx = x0 + 1, jy = y0 + 1;
  if (px) { ix = ((ix % px) + px) % px; jx = ((jx % px) + px) % px; }
  if (py) { iy = ((iy % py) + py) % py; jy = ((jy % py) + py) % py; }
  const a = hash(ix, iy, s), b = hash(jx, iy, s), c = hash(ix, jy, s), d = hash(jx, jy, s);
  const u = fade(fx), v = fade(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4, s = 0, px = 0, py = 0) {
  let a = .5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, s + i * 17, px * f, py * f); n += a; a *= .5; f *= 2; }
  return sum / n;
}

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;     // tone mapping happens in the final pass (HDR bloom)
renderer.physicallyCorrectLights = true;        // lights in lux / candela with inverse-square falloff
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 1.5, 60000);
const CAM_HOME = V3(0, 190, 1400), CAM_TARGET = V3(0, -4, 0);
camera.position.copy(CAM_HOME);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.target.copy(CAM_TARGET);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.minDistance = 30; controls.maxDistance = 3000;
controls.autoRotateSpeed = 0.3;
controls.update();

const updaters = [];
const onFrame = fn => updaters.push(fn);

// ---------- HDR post pipeline (own bloom chain + grade) ----------
const isGL2 = renderer.capabilities.isWebGL2;
const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
const mkRT = (w, h, ms) => {
  const t = (ms && isGL2) ? new THREE.WebGLMultisampleRenderTarget(w, h, rtOpts) : new THREE.WebGLRenderTarget(w, h, { ...rtOpts, depthBuffer: false });
  if (ms && isGL2) t.samples = 4;
  return t;
};
const BLOOM_LEVELS = 6;
let sceneRT, bloomRTs = [];
function buildTargets() {
  const w = Math.floor(innerWidth * DPR), h = Math.floor(innerHeight * DPR);
  if (sceneRT) { sceneRT.dispose(); bloomRTs.forEach(r => r.dispose()); }
  sceneRT = mkRT(w, h, true);
  bloomRTs = [];
  for (let i = 0; i < BLOOM_LEVELS; i++) bloomRTs.push(mkRT(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1)), false));
}
buildTargets();

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false; quadScene.add(quad);
const FS_VERT = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
function fsPass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

const downMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, texel: { value: new THREE.Vector2() }, first: { value: 0 }, thr: { value: 1.0 }, knee: { value: 0.6 } },
  vertexShader: FS_VERT, depthTest: false, depthWrite: false,
  fragmentShader: `
    uniform sampler2D tex; uniform vec2 texel; uniform float first,thr,knee; varying vec2 vUv;
    vec3 pf(vec3 c){ if(first<.5) return c; c=min(c,vec3(24.)); float br=max(c.r,max(c.g,c.b)); float s=clamp(br-thr+knee,0.,2.*knee); s=s*s/(4.*knee+1e-4); return c*(max(br-thr,s)/max(br,1e-4)); }
    vec3 S(vec2 o){ return pf(texture2D(tex,vUv+o*texel).rgb); }
    void main(){
      vec3 a=S(vec2(-2,2)),b=S(vec2(0,2)),c=S(vec2(2,2)),d=S(vec2(-2,0)),e=S(vec2(0,0)),f=S(vec2(2,0)),g=S(vec2(-2,-2)),h=S(vec2(0,-2)),i=S(vec2(2,-2));
      vec3 j=S(vec2(-1,1)),k=S(vec2(1,1)),l=S(vec2(-1,-1)),m=S(vec2(1,-1));
      gl_FragColor=vec4(e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125,1.);
    }`
});
const upMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, texel: { value: new THREE.Vector2() }, w: { value: 1 } },
  vertexShader: FS_VERT, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  fragmentShader: `
    uniform sampler2D tex; uniform vec2 texel; uniform float w; varying vec2 vUv;
    vec3 S(vec2 o){ return texture2D(tex,vUv+o*texel).rgb; }
    void main(){
      vec3 c=S(vec2(-1,1))+S(vec2(1,1))+S(vec2(-1,-1))+S(vec2(1,-1))+2.*(S(vec2(0,1))+S(vec2(0,-1))+S(vec2(-1,0))+S(vec2(1,0)))+4.*S(vec2(0));
      gl_FragColor=vec4(c/16.*w,1.);
    }`
});
const finalMat = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: null }, tBloom: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() },
    uExposure: { value: 0.82 }, uBloom: { value: 0.32 }, uBlur: { value: 3.5 }, uVignette: { value: 0.62 },
    uGrain: { value: 0.03 }, uAberr: { value: 0.0018 }, uFlash: { value: 0 }
  },
  vertexShader: FS_VERT, depthTest: false, depthWrite: false,
  fragmentShader: `
    uniform sampler2D tScene,tBloom; uniform vec2 uRes; uniform float uTime,uExposure,uBloom,uBlur,uVignette,uGrain,uAberr,uFlash; varying vec2 vUv;
    float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-.055, step(.0031308,c)); }
    void main(){
      vec2 uv=vUv; vec2 cc=uv-.5;
      // miniature tilt-shift: sharp focal band, soft top / bottom
      float d=abs(uv.y-.5); float band=smoothstep(.2,.62,d);
      float rad=uBlur*band*(uRes.y/1000.);
      vec3 col=vec3(0.); float wsum=0.;
      vec2 px=1./uRes; float ab=uAberr*dot(cc,cc)*4.;
      for(int i=0;i<14;i++){
        float fi=float(i); float a=fi*2.39996; float r=sqrt((fi+.5)/14.)*rad;
        vec2 o=vec2(cos(a),sin(a))*r*px;
        vec3 s=vec3(texture2D(tScene,uv+o+cc*ab).r,texture2D(tScene,uv+o).g,texture2D(tScene,uv+o-cc*ab).b);
        float wt=1.+dot(s,vec3(.3));
        col+=s*wt; wsum+=wt;
      }
      col/=wsum;
      col+=texture2D(tBloom,uv).rgb*uBloom;
      col+=vec3(1.,.8,.6)*uFlash;
      col*=uExposure;
      vec3 t=aces(col);
      float l=dot(t,vec3(.2126,.7152,.0722));
      t=mix(t,t*vec3(.88,1.0,1.16),1.-smoothstep(0.,.5,l));           // cold shadows
      t=mix(t,t*vec3(1.07,1.0,.92),smoothstep(.4,.95,l));              // warm highlights
      t=mix(vec3(l),t,1.1);
      t*=1.-uVignette*smoothstep(.3,.98,length(cc*vec2(1.1,1.25)));
      t=toSRGB(t);
      t+=(h21(uv*uRes+fract(uTime)*91.7)-.5)*uGrain;
      gl_FragColor=vec4(t,1.);
    }`
});
const finalUniforms = finalMat.uniforms;

function renderFrame() {
  renderer.setRenderTarget(sceneRT); renderer.clear();
  renderer.render(scene, camera);
  let src = sceneRT;
  for (let i = 0; i < BLOOM_LEVELS; i++) {
    downMat.uniforms.tex.value = src.texture;
    downMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
    downMat.uniforms.first.value = i === 0 ? 1 : 0;
    fsPass(downMat, bloomRTs[i]); src = bloomRTs[i];
  }
  for (let i = BLOOM_LEVELS - 1; i > 0; i--) {
    upMat.uniforms.tex.value = bloomRTs[i].texture;
    upMat.uniforms.texel.value.set(1 / bloomRTs[i].width, 1 / bloomRTs[i].height);
    upMat.uniforms.w.value = 1.0;
    fsPass(upMat, bloomRTs[i - 1]);
  }
  finalUniforms.tScene.value = sceneRT.texture;
  finalUniforms.tBloom.value = bloomRTs[0].texture;
  finalUniforms.uRes.value.set(sceneRT.width, sceneRT.height);
  fsPass(finalMat, null);
}

let fovMul = 1;                                   // camera director widens the lens for some shots
const baseFov = () => innerWidth / innerHeight < 1.3 ? 34 * Math.min(1.9, 1.3 / (innerWidth / innerHeight)) : 34;
function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = baseFov() * fovMul;
  camera.updateProjectionMatrix();
  buildTargets();
}
addEventListener('resize', onResize);
onResize();

// ---------- UI helpers ----------
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg, ms = 3200) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms); }

// ---------- lights ----------
// physically motivated rig (physicallyCorrectLights): the star is the dominant light, the ringed giant and the
// nebula bounce soft coloured light into the shadows, and image-based lighting (built from the real sky at the
// end of the file) supplies ambient + reflections. Both directional lights cast shadows.
const hemi = new THREE.HemisphereLight(0x4f6fb8, 0x180c20, 0.12); scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xc9dbff, 1.5);          // nebula / planet-shine bounce from the camera side
keyLight.position.set(-825, 750, 950); keyLight.target.position.set(0, 0, 0);
keyLight.castShadow = true; keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700, near: 10, far: 3200 });
keyLight.shadow.bias = -0.0006; keyLight.shadow.normalBias = 0.35;
scene.add(keyLight, keyLight.target);
const sunLight = new THREE.DirectionalLight(0xffe2bd, 6.5); scene.add(sunLight, sunLight.target);   // the star: direction set once the sun is positioned
sunLight.castShadow = true; sunLight.shadow.mapSize.set(4096, 4096);
Object.assign(sunLight.shadow.camera, { left: -680, right: 680, top: 680, bottom: -680, near: 10, far: 3600 });
sunLight.shadow.bias = -0.0005; sunLight.shadow.normalBias = 0.3;
const fillLight = new THREE.DirectionalLight(0x5a7cff, 0.5); fillLight.position.set(420, -120, 260); scene.add(fillLight);

// explosion lights: a small pool re-used by every blast (fixed count => no shader recompiles); inverse-square falloff
const BLAST_LIGHTS = [];
const BLAST_CD = 22;                                              // peak → candela
for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xff9a50, 0, 190, 2); l.userData = { t: 9, dur: 1, peak: 0 }; scene.add(l); BLAST_LIGHTS.push(l); }

// ---------- deep-space dome: nebula + stars (follows the camera, never parallaxes) ----------
const SKY = {};
// the galactic belt: a great circle spanning the whole sky; the spiral galaxy object sits on it (see BG_POS)
SKY.beltN = V3(.38, .8, -.46).normalize();
(() => {
  SKY.uniforms = { uTime: { value: 0 }, uSunDir: { value: V3(0, 1, 0) }, uGalDir: { value: V3(0, 1, 0) }, uHoleDir: { value: V3(0, 1, 0) }, uBeltN: { value: SKY.beltN } };
  const mat = new THREE.ShaderMaterial({
    uniforms: SKY.uniforms, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `
      varying vec3 vDir; uniform float uTime;       uniform vec3 uSunDir,uGalDir,uHoleDir,uBeltN;
      float h(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      float n3(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      const mat3 RM=mat3(0.,.8,.6,-.8,.36,-.48,-.6,-.48,.64);
      float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n3(p); p=RM*p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
      float rid(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ float n=1.-abs(2.*n3(p)-1.); s+=a*n*n; p=RM*p*2.1+vec3(3.1,1.3,7.7); a*=.5; } return s; }
      float h2(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
      float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
      float f2(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.02+vec2(5.2,1.3); a*=.5; } return s; }
      // a distant spiral galaxy painted straight onto the sky: fixed in space, tilted, tiny and faint
      vec3 galaxy(vec3 d){
        float gz=dot(d,uGalDir); if(gz<.3) return vec3(0.);
        vec3 gu=normalize(cross(uBeltN,uGalDir)), gv=cross(uGalDir,gu);
        vec2 p=vec2(dot(d,gu),dot(d,gv))/gz/.17;
        float len=length(p); if(len>1.) return vec3(0.);
        float a0=.62; vec2 q=mat2(cos(a0),sin(a0),-sin(a0),cos(a0))*p; q.y/=.45;
        float r=length(q);
        float wob=f2(q*3.+7.)*.9;
        float ph=2.*atan(q.y,q.x)-5.2*log(r+.03)+uTime*.004+wob;
        float arm=pow(.5+.5*cos(ph),2.2);
        float fall=smoothstep(1.,.25,r)*smoothstep(0.,.1,r);
        float bulge=exp(-r*r*34.)*1.9+exp(-r*5.)*.55;
        float dust=smoothstep(.55,.9,f2(q*6.+vec2(arm*2.,3.)))*smoothstep(.12,.3,r)*.85;
        float dots=step(.97,h2(floor(q*60.)))*arm*fall*.8;
        vec3 core=vec3(1.25,.95,.6);
        vec3 armc=mix(vec3(.28,.42,1.15),vec3(.8,.6,1.),f2(q*3.));
        vec3 c=core*bulge+armc*arm*fall*.9*(1.-dust)+vec3(.9,.95,1.)*dots;
        c*=1.-dust*.5;
        return c*(1.-smoothstep(.75,1.,len))*.45;
      }
      void main(){
        vec3 d=normalize(vDir);
        vec3 col=mix(vec3(.002,.004,.012),vec3(.014,.006,.022),fbm(d*1.2+vec3(3.,1.,7.)));
        // domain-warped nebula field: emission (red/magenta/amber + teal filaments) and blue reflection clouds
        vec3 w=d*1.7; w+=.7*vec3(fbm(w+vec3(1.,5.,2.)),fbm(w+vec3(7.,3.,9.)),fbm(w+vec3(4.,8.,6.)))-.35;
        float eA=smoothstep(.46,.72,fbm(w*.9+vec3(2.,4.,1.)));
        float eB=smoothstep(.5,.75,fbm(w*.9+vec3(11.,2.,5.)));
        float fil=rid(w*3.2), cl=fbm(w*6.+3.);
        vec3 hue=mix(vec3(.9,.14,.34),vec3(.95,.5,.15),smoothstep(.3,.7,fbm(w*1.1+9.)));
        vec3 neb=hue*eA*(.25+fil*.9)*cl*1.4;
        neb+=vec3(.04,.55,.65)*eA*smoothstep(.62,.9,fil)*.7;
        neb+=vec3(.12,.28,.9)*eB*(.3+.7*cl)*(.4+.6*fil);
        col+=neb*.3;
        // galactic belt: a luminous band wrapping the whole sky, brightest toward the galaxy, split by a dust rift
        float lat=dot(d,uBeltN);
        float lon=dot(d,uGalDir);
        float wide=exp(-pow(lat/.26,2.));
        float core=exp(-pow(lat/.09,2.));
        float clump=.45+.9*fbm(d*3.2+vec3(2.,6.,1.));
        float fine=.6+.8*fbm(d*14.);
        float rift=smoothstep(.45,.8,fbm(vec3(d*7.+vec3(4.,1.,8.)))) * exp(-pow((lat-.02*sin(lon*9.))/.05,2.));
        vec3 beltCol=mix(vec3(.18,.22,.5),vec3(.62,.38,.2),smoothstep(-.3,1.,lon)*.8);
        float belt=(wide*.45+core*.9)*clump*fine;
        col+=beltCol*belt*.24*(1.-rift*.85);
        col+=vec3(.55,.35,.2)*pow(max(lon,0.),5.)*core*.14;
        // dark dust lanes swallow the nebulae and the belt behind them
        float dustM=smoothstep(.46,.85,fbm(w*2.6+vec3(5.,9.,2.)));
        col*=1.-dustM*.7;
        col+=galaxy(d);
        // glows around the big landmarks
        col+=vec3(.03,.045,.14)*pow(max(dot(d,uGalDir),0.),12.)*.5;
        col+=vec3(.3,.16,.07)*pow(max(dot(d,uSunDir),0.),40.)*.15;
        col+=vec3(.5,.2,.08)*pow(max(dot(d,uHoleDir),0.),160.)*.15;
        gl_FragColor=vec4(col,1.);
      }`
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4600, 48, 32), mat);
  dome.renderOrder = -20; dome.frustumCulled = false; scene.add(dome); SKY.dome = dome;

  // star points
  const N_FIELD = 9000, N_BELT = 9000, N = N_FIELD + N_BELT;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N), ph = new Float32Array(N);
  const tints = [[.62, .76, 1], [1, 1, 1], [1, .88, .7], [1, .68, .45], [.5, .68, 1]];
  const bn = SKY.beltN, be1 = V3().crossVectors(bn, V3(0, 0, 1)).normalize(), be2 = V3().crossVectors(bn, be1), brand = mulberry32(4242);
  for (let i = 0; i < N; i++) {
    let x, y, z;
    const belt = i >= N_FIELD, R = belt ? brand : rand;   // belt stars use their own generator so the rest of the scene layout is unchanged
    if (!belt) {
      const u = R() * 2 - 1, a = R() * 6.2832, s = Math.sqrt(1 - u * u);
      x = s * Math.cos(a); y = u; z = s * Math.sin(a);
    } else {
      // belt stars: uniform along the great circle, gaussian spread across it (denser, finer, dimmer)
      const a = R() * 6.2832, g = (R() + R() + R() - 1.5) * (R() < .7 ? .2 : .55), c = Math.cos(g), sg = Math.sin(g);
      x = c * (Math.cos(a) * be1.x + Math.sin(a) * be2.x) + sg * bn.x;
      y = c * (Math.cos(a) * be1.y + Math.sin(a) * be2.y) + sg * bn.y;
      z = c * (Math.cos(a) * be1.z + Math.sin(a) * be2.z) + sg * bn.z;
    }
    pos.set([x * 4400, y * 4400, z * 4400], i * 3);
    const t = tints[Math.floor(R() * tints.length)], b = (Math.pow(R(), 3.2) * 1.8 + .25) * (belt ? .7 : 1); col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    siz[i] = belt ? .8 + R() * .7 : R() < .03 ? 2.6 + R() * 1.4 : .9 + R() * 1.1; ph[i] = R() * 40;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  SKY.starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPix: { value: DPR } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec3 aCol; attribute float aSize,aPh; uniform float uTime,uPix; varying vec3 vC;
      void main(){ float tw=.78+.22*sin(uTime*(1.2+fract(aPh)*2.)+aPh); vC=aCol*tw; gl_PointSize=aSize*uPix; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 p=gl_PointCoord-.5; float r=length(p)*2.; float a=1.-smoothstep(0.,1.,r); gl_FragColor=vec4(vC*a*a*1.6,1.); }`
  });
  SKY.stars = new THREE.Points(g, SKY.starMat); SKY.stars.frustumCulled = false; SKY.stars.renderOrder = -19; scene.add(SKY.stars);
  onFrame((dt, t) => {
    dome.position.copy(camera.position); SKY.stars.position.copy(camera.position);
    SKY.uniforms.uTime.value = t; SKY.starMat.uniforms.uTime.value = t;
  });
})();

// ---------- frame loop ----------
const clock = new THREE.Clock();
let T = 0, timeScale = 1;
function frame() {
  requestAnimationFrame(frame);
  const rdt = Math.min(clock.getDelta(), 0.05), dt = rdt * timeScale; T += dt;
  controls.update();
  for (let i = 0; i < updaters.length; i++) updaters[i](dt, T, rdt);
  finalUniforms.uTime.value = T;
  renderFrame();
}
