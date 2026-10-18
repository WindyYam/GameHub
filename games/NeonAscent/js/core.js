/* CORE — renderer, HDR bloom pipeline, planar ground reflection, shared neon shader code, env map */
(function () {
'use strict';
if (!window.THREE) {
  document.getElementById('loading').innerHTML = '<span>Three.js failed to load (network?)</span>';
  throw new Error('three.js missing');
}
const NA = window.NA = {};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (cur, tgt, k, dt) => lerp(cur, tgt, 1 - Math.exp(-k * dt));
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
NA.M = { clamp, lerp, smooth, damp, mulberry32, rad: d => d * Math.PI / 180 };
NA.rand = mulberry32(20261017);
NA.V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------- renderer ----------
const renderer = NA.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const DPR = NA.DPR = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;     // tone mapping happens in the final pass
renderer.autoClear = false;
document.body.insertBefore(renderer.domElement, document.body.firstChild);

const scene = NA.scene = new THREE.Scene();
const FOG_COL = new THREE.Color(0x04060e);
scene.fog = new THREE.FogExp2(FOG_COL, 0.00055);
const camera = NA.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.4, 12000);
camera.position.set(0, 30, 200);
scene.add(camera);
NA.updaters = [];

// ---------- shared uniforms + GLSL ----------
NA.shared = {
  uTime: { value: 0 }, uFogCol: { value: FOG_COL }, uFogD: { value: 0.00055 },
  uCarInv: { value: new THREE.Matrix4() }, uCarPos: { value: new THREE.Vector3(0, -999, 0) }, uCarFwd: { value: new THREE.Vector3(1, 0, 0) },
  uGlow: { value: new THREE.Color(0x2299ff) }, uGlowK: { value: 1 }, uHead: { value: 1 },
  uTexMat: { value: new THREE.Matrix4() }, tRefl: { value: null }, uSpot: { value: new THREE.Vector4(0, 0, 4.4, 0) }
};
NA.GLSL = `
uniform float uTime; uniform vec3 uFogCol; uniform float uFogD;
uniform mat4 uCarInv; uniform vec3 uCarPos; uniform vec3 uCarFwd; uniform vec3 uGlow; uniform float uGlowK; uniform float uHead;
vec3 hsv2rgb(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
float neonHue(float s){ return fract(.55+s*.0021-uTime*.045+.06*sin(s*.011+uTime*.4)); }
vec3 neonCol(float s){ return hsv2rgb(vec3(neonHue(s),.9,1.)); }
float chase(float s){ return pow(.5+.5*sin((s-uTime*34.)*.21),5.); }
vec3 applyFog(vec3 c, vec3 wp){ float d=length(wp-cameraPosition); float f=1.-exp(-pow(uFogD*d,2.)); return mix(c,uFogCol,f); }
float carAO(vec3 wp){
  vec3 l=(uCarInv*vec4(wp,1.)).xyz;
  vec3 q=abs(vec3(l.x,0.,l.z))-vec3(2.0,0.,.85);
  float d=length(max(q,0.));
  float fp=1.-smoothstep(0.,.9+max(-l.y,0.)*.25,d);
  return fp*(1.-smoothstep(-.1,.5,l.y))*exp(-max(-l.y-.35,0.)*.22);
}
vec3 carLight(vec3 wp){
  vec3 d=wp-uCarPos; float r2=dot(d,d);
  vec3 c=uGlow*uGlowK*(2.2/(1.+r2*.045));
  float along=dot(d,uCarFwd); float cosA=along/max(sqrt(r2),.001);
  c+=vec3(.55,.75,1.)*uHead*smoothstep(.9,.985,cosA)*exp(-max(along,0.)/38.)*step(1.,along)*.9;
  return c;
}
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
`;
// JS mirror of neonHue / neonCol (used for lights, HUD tint, particles)
NA.neonHue = (s, t) => { const h = .55 + s * .0021 - t * .045 + .06 * Math.sin(s * .011 + t * .4); return h - Math.floor(h); };
NA.neonColor = (s, t, out, l = .5) => out.setHSL(NA.neonHue(s, t), 1, l);

// ---------- HDR post pipeline (own bloom chain + grade) ----------
const isGL2 = renderer.capabilities.isWebGL2;
const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
const mkRT = (w, h, ms) => {
  const t = (ms && isGL2) ? new THREE.WebGLMultisampleRenderTarget(w, h, rtOpts) : new THREE.WebGLRenderTarget(w, h, { ...rtOpts, depthBuffer: false });
  if (ms && isGL2) t.samples = 4;
  return t;
};
const BLOOM_LEVELS = 6;
let sceneRT, bloomRTs = [], reflRT;
function buildTargets() {
  const w = Math.floor(innerWidth * DPR), h = Math.floor(innerHeight * DPR);
  if (sceneRT) { sceneRT.dispose(); bloomRTs.forEach(r => r.dispose()); reflRT.dispose(); }
  sceneRT = mkRT(w, h, true);
  bloomRTs = [];
  for (let i = 0; i < BLOOM_LEVELS; i++) bloomRTs.push(mkRT(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1)), false));
  reflRT = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), { ...rtOpts, depthBuffer: true });
  NA.shared.tRefl.value = reflRT.texture;
}
buildTargets();

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false; quadScene.add(quad);
const FS_VERT = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
function fsPass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

const downMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, texel: { value: new THREE.Vector2() }, first: { value: 0 }, thr: { value: 1.25 }, knee: { value: 0.8 } },
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
    uExposure: { value: 0.95 }, uBloom: { value: 0.34 }, uVignette: { value: 0.5 }, uGrain: { value: 0.025 }, uAberr: { value: 0.0009 },
    uFlash: { value: 0 }, uFade: { value: 0 }
  },
  vertexShader: FS_VERT, depthTest: false, depthWrite: false,
  fragmentShader: `
    uniform sampler2D tScene,tBloom; uniform vec2 uRes; uniform float uTime,uExposure,uBloom,uVignette,uGrain,uAberr,uFlash,uFade; varying vec2 vUv;
    float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-.055, step(.0031308,c)); }
    void main(){
      vec2 uv=vUv; vec2 cc=uv-.5; float ab=uAberr*dot(cc,cc)*4.;
      vec3 col=vec3(texture2D(tScene,uv+cc*ab).r,texture2D(tScene,uv).g,texture2D(tScene,uv-cc*ab).b);
      col+=texture2D(tBloom,uv).rgb*uBloom;
      col+=vec3(.7,.9,1.)*uFlash;
      col*=uExposure;
      vec3 t=aces(col);
      float l=dot(t,vec3(.2126,.7152,.0722));
      t=mix(t,t*vec3(.9,1.0,1.14),1.-smoothstep(0.,.45,l));
      t=mix(vec3(l),t,1.12);
      t*=1.-uVignette*smoothstep(.3,1.0,length(cc*vec2(1.1,1.2)));
      t=toSRGB(t);
      t+=(h21(uv*uRes+fract(uTime)*91.7)-.5)*uGrain;
      t*=1.-uFade;
      gl_FragColor=vec4(t,1.);
    }`
});
NA.post = finalMat.uniforms;

// ---------- planar ground reflection (scene rendered from the camera mirrored in the y = 0 plane) ----------
const reflCam = new THREE.PerspectiveCamera();
const _f = new THREE.Vector3(), _u = new THREE.Vector3();
NA.groundMesh = null;
function renderReflection() {
  const c = camera, v = reflCam;
  v.position.set(c.position.x, -c.position.y, c.position.z);
  _f.set(0, 0, -1).applyQuaternion(c.quaternion);
  _u.set(0, 1, 0).applyQuaternion(c.quaternion);
  v.up.set(_u.x, -_u.y, _u.z);
  v.lookAt(v.position.x + _f.x, v.position.y - _f.y, v.position.z + _f.z);
  v.fov = c.fov; v.aspect = c.aspect; v.near = c.near; v.far = c.far;
  v.updateProjectionMatrix(); v.updateMatrixWorld();
  v.matrixWorldInverse.copy(v.matrixWorld).invert();
  const tm = NA.shared.uTexMat.value;
  tm.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
  tm.multiply(v.projectionMatrix); tm.multiply(v.matrixWorldInverse);
  if (NA.groundMesh) NA.groundMesh.visible = false;
  renderer.setRenderTarget(reflRT); renderer.clear();
  renderer.render(scene, v);
  if (NA.groundMesh) NA.groundMesh.visible = true;
}

NA.renderFrame = function () {
  renderReflection();
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
    fsPass(upMat, bloomRTs[i - 1]);
  }
  finalMat.uniforms.tScene.value = sceneRT.texture;
  finalMat.uniforms.tBloom.value = bloomRTs[0].texture;
  finalMat.uniforms.uRes.value.set(sceneRT.width, sceneRT.height);
  fsPass(finalMat, null);
};

NA.fovBase = 50;
function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  buildTargets();
}
addEventListener('resize', onResize);
onResize();

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x3a4f88, 0x0a0a14, 0.55));
const moon = new THREE.DirectionalLight(0x7f9bdc, 0.55); moon.position.set(-150, 170, -950); scene.add(moon);

// ---------- neon environment map (reflections on the paint / glass) ----------
NA.makeEnv = function () {
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.BoxGeometry(90, 40, 90), new THREE.MeshBasicMaterial({ color: 0x03050c, side: THREE.BackSide })));
  const add = (col, k, w, h, d, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k) }));
    m.position.set(x, y, z); m.rotation.y = ry; es.add(m);
  };
  add(0xffffff, 5, 26, .3, 8, 0, 18, 0);                     // overhead softbox
  add(0xcfe6ff, 2.2, 10, .3, 30, -20, 10, 0);
  for (let i = 0; i < 5; i++) {                              // neon pillars, hue-spread
    const a = i / 5 * Math.PI * 2 + .4, c = new THREE.Color().setHSL(i / 5, 1, .55);
    add(c, 8, .8, 22, .8, Math.cos(a) * 30, 2, Math.sin(a) * 30);
  }
  add(0xff2bd6, 6, 40, .5, .5, 0, 4, -34); add(0x18d4ff, 6, 40, .5, .5, 0, 2, 34);
  add(0xffb347, 3, .5, .5, 30, 36, 6, 0);
  add(0x2038ff, 2, 80, .2, 80, 0, -19, 0);                   // faint floor bounce
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(es, 0.02).texture;
  pm.dispose();
  return tex;
};
NA.envTex = NA.makeEnv();
scene.environment = NA.envTex;

NA.DEFAULT_RIG = null;
})();
