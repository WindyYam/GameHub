'use strict';

/* =====================================================================
   STEP 2 — THE BACKDROP: sun · ringed giant + moons · black hole · spiral galaxy
            (placed from the home camera's view so the composition matches the concept art)
   ===================================================================== */

const GLSL_NOISE = `
  float h11(float n){ return fract(sin(n*127.1)*43758.5453); }
  float h21_(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float h31(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
  float n1(float x){ float i=floor(x),f=fract(x); f=f*f*(3.-2.*f); return mix(h11(i),h11(i+1.),f); }
  float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21_(i),h21_(i+vec2(1,0)),f.x),mix(h21_(i+vec2(0,1)),h21_(i+vec2(1,1)),f.x),f.y); }
  float f2(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.02+vec2(5.2,1.3); a*=.5; } return s; }
  float n3(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
    return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float f3(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
  mat2 rot2(float a){ float c=cos(a),s=sin(a); return mat2(c,s,-s,c); }
`;
const RING_GLSL = `
  float ringDensity(float r){
    float x=(r-1.24)/1.06; if(x<0.||x>1.) return 0.;
    float d=.14;
    d=mix(d,.95,smoothstep(.12,.2,x));
    d=mix(d,.04,smoothstep(.5,.54,x));
    d=mix(d,.62,smoothstep(.6,.64,x));
    d*=1.-.9*(1.-smoothstep(0.,.015,abs(x-.9)));
    d*=smoothstep(0.,.05,x)*(1.-smoothstep(.95,1.,x));
    d*=.6+.55*n1(x*70.)+.25*n1(x*260.);
    return clamp(d,0.,1.);
  }
`;

const homeCam = new THREE.PerspectiveCamera(34, 16 / 9, 1.5, 60000);
homeCam.position.copy(CAM_HOME); homeCam.lookAt(CAM_TARGET); homeCam.updateMatrixWorld(); homeCam.updateProjectionMatrix();
const BG_DIST = 20000, BG_K = BG_DIST / 2800 * 1.8;   // sizes below were authored for 2800; the extra 1.8 makes the bodies loom larger
const BG = {};
function skyAt(nx, ny, dist = BG_DIST) { return V3(nx, ny, .5).unproject(homeCam).sub(CAM_HOME).normalize().multiplyScalar(dist).add(CAM_HOME); }

const billboards = [];
const BB_VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
function makeBillboard(frag, size, { blending = THREE.AdditiveBlending, premult = false, order = 0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending, premultipliedAlpha: premult, fog: false,
    vertexShader: BB_VERT, fragmentShader: 'varying vec2 vUv; uniform float uTime;' + GLSL_NOISE + frag
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.scale.setScalar(size); m.renderOrder = order; m.frustumCulled = false; scene.add(m); billboards.push(m);
  return m;
}
onFrame((dt, t) => { for (const b of billboards) { b.quaternion.copy(camera.quaternion); b.material.uniforms.uTime.value = t; } });

// azimuth 0 = the home camera's heading, positive = to the right; degrees
function skyDir(az, el, dist = BG_DIST) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return V3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(dist).add(CAM_HOME);
}
const BG_POS = {
  planet: skyAt(.62, .66), sun: skyDir(-60, 3), hole: skyDir(125, -2), galaxy: skyDir(-145, 4)
};
// snap the galaxy onto the galactic belt so the belt visibly runs through it
{ const gd = BG_POS.galaxy.clone().sub(CAM_HOME).normalize(); gd.addScaledVector(SKY.beltN, -gd.dot(SKY.beltN)).normalize(); BG_POS.galaxy.copy(gd.multiplyScalar(BG_DIST).add(CAM_HOME)); }
SKY.uniforms.uSunDir.value.copy(BG_POS.sun.clone().sub(CAM_HOME).normalize());
SKY.uniforms.uGalDir.value.copy(BG_POS.galaxy.clone().sub(CAM_HOME).normalize());
SKY.uniforms.uHoleDir.value.copy(BG_POS.hole.clone().sub(CAM_HOME).normalize());
sunLight.position.copy(BG_POS.sun).normalize().multiplyScalar(1800); sunLight.target.position.set(0, 0, 0);   // parallel rays seen from the battle; kept close so the shadow frustum fits

// ---------- the sun: granulated disc, corona, rays, diffraction spikes ----------
BG.sun = makeBillboard(`
  void main(){
    const float SZ=7.;
    vec2 p=(vUv-.5)*2.*SZ; float r=length(p);
    float edge=1.-smoothstep(SZ*.5,SZ,r);
    vec2 dir=p/max(r,1e-3);
    float disc=1.-smoothstep(.97,1.,r);
    float mu=sqrt(max(1.-r*r,0.));
    float gran=f2(p*5.+uTime*.15)*.6+f2(p*14.-uTime*.2)*.4;
    vec3 surf=mix(vec3(5.,2.8,.9),vec3(9.,7.,4.),smoothstep(.15,.9,mu)*(.55+.9*gran));
    float d=max(r-1.,0.);
    float glow=exp(-d*2.6)*.8+exp(-d*.9)*.16;
    float rays=f2(dir*3.2+vec2(r*.08,uTime*.03))*1.5; rays*=rays;
    float spikes=(exp(-abs(p.x)*9.)*exp(-abs(p.y)*.35)+exp(-abs(p.y)*9.)*exp(-abs(p.x)*.35))*.5;
    vec3 halo=(vec3(1.,.62,.28)*glow+vec3(1.,.8,.55)*rays*exp(-d*.9)*.9+vec3(1.,.9,.7)*spikes*.9)*(1.-disc);
    gl_FragColor=vec4((surf*disc+halo*.85)*edge*.7,1.);
  }`, 150 * 7 * BG_K, { order: -4 });
BG.sun.position.copy(BG_POS.sun);

// ---------- black hole: lensed accretion disk, photon ring, doppler-boosted turbulence ----------
BG.hole = makeBillboard(`
  void main(){
    vec2 p=rot2(.34)*((vUv-.5)*2.);
    float R0=.2, r=length(p), lr=r/R0;
    float inc=.17;
    vec2 dp=vec2(p.x,p.y/inc); float rho=length(dp);
    float rin=R0*1.35, rout=.93;
    float band=smoothstep(rin,rin*1.25,rho)*(1.-smoothstep(rout*.5,rout,rho));
    float spin=uTime*.7/pow(max(rho/R0,1.),1.5);
    vec2 dd=rot2(spin)*(dp/max(rho,1e-3));
    float turb=f2(dd*3.5+vec2(rho*14.,0.))*.9+.3;
    float streak=f2(vec2(rho*60.,3.)+dd*1.2);
    float dop=1.+.8*(-dp.x/max(rho,1e-3));
    float heat=1.-smoothstep(rin,rout,rho);
    vec3 dcol=mix(vec3(1.,.36,.09),vec3(1.,.9,.7),pow(heat,1.5))*(1.+4.*heat*heat);
    vec3 disk=dcol*band*turb*(.45+streak)*dop*dop*2.6;
    float front=step(dp.y,0.);
    float inShadow=1.-smoothstep(R0*.97,R0,r);
    // lensed image of the far side of the disk wrapping over / under the shadow
    vec2 dirp=p/max(r,1e-3);
    float spin2=uTime*.5/pow(max(lr,1.),1.5);
    float tex=.65+.7*f2(rot2(spin2)*dirp*4.+vec2(lr*6.,0.));
    float topArc=exp(-pow((lr-1.13)/.24,2.))*(.35+1.0*smoothstep(-.3,1.,p.y/R0));
    float botArc=exp(-pow((lr-1.09)/.13,2.))*.45*smoothstep(.2,-1.,p.y/R0);
    float sideDop=1.+.7*(-p.x/max(r,1e-3));
    vec3 arcCol=mix(vec3(1.,.5,.16),vec3(1.,.95,.8),.55);
    vec3 arcs=arcCol*(topArc*1.5+botArc)*tex*sideDop*3.2;
    vec3 photon=vec3(1.,.95,.85)*exp(-pow((lr-1.015)/.028,2.))*6.;
    vec3 halo=vec3(1.,.5,.2)*exp(-(lr-1.)*3.2)*.2*step(1.,lr)+vec3(.55,.65,1.)*exp(-lr*.9)*.03;
    vec3 col=disk*(1.-front)*(1.-inShadow)+arcs+photon+halo*(1.-inShadow);
    vec3 fdisk=disk*front;
    float fcov=clamp(dot(fdisk,vec3(.33))*3.,0.,1.);
    float a=inShadow*(1.-fcov);
    float edge=1.-smoothstep(.8,1.,length((vUv-.5)*2.));
    gl_FragColor=vec4((col+fdisk)*edge*.55,a);
  }`, 620 * BG_K, { blending: THREE.NormalBlending, premult: true, order: -6 });
BG.hole.position.copy(BG_POS.hole);

// ---------- spiral galaxy: painted into the sky dome shader (see SKY), not a billboard ----------

// ---------- the ringed giant (own lighting from the sun, ring shadow on the globe and globe shadow on the rings) ----------
(() => {
  const R = 215 * BG_K, sunW = BG_POS.sun.clone().sub(BG_POS.planet).normalize();
  const axis = V3(-.404, .867, .292).applyQuaternion(homeCam.quaternion).normalize();
  const group = new THREE.Group(); group.position.copy(BG_POS.planet); group.scale.setScalar(R);
  group.quaternion.setFromUnitVectors(V3(0, 1, 0), axis); group.updateMatrixWorld(true);
  const sunO = sunW.clone().applyQuaternion(group.quaternion.clone().invert());
  const vert = `varying vec3 vNw,vPo,vWp; void main(){ vPo=position; vNw=mat3(modelMatrix)*normal; vWp=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vWp,1.); }`;
  const U = () => ({ uTime: { value: 0 }, uSunW: { value: sunW.clone() }, uSunO: { value: sunO.clone() } });
  const planetMat = new THREE.ShaderMaterial({
    uniforms: U(), vertexShader: vert, fog: false,
    fragmentShader: 'varying vec3 vNw,vPo,vWp; uniform vec3 uSunW,uSunO; uniform float uTime;' + GLSL_NOISE + RING_GLSL + `
      void main(){
        vec3 N=normalize(vNw), P=normalize(vPo);
        float warp=f3(P*3.+vec3(0.,uTime*.01,0.))*.5+f3(P*9.)*.15;
        float v=P.y*7.5+warp*1.1;
        float b1=n1(v*1.7), b2=n1(v*5.+3.);
        vec3 cA=vec3(.86,.74,.52), cB=vec3(.72,.56,.36), cC=vec3(.95,.88,.7), cD=vec3(.56,.42,.28);
        vec3 alb=mix(mix(cA,cB,b1),mix(cC,cD,b2),.45);
        alb*=.85+.3*f3(P*vec3(30.,6.,30.));
        alb*=mix(1.,.78,smoothstep(.55,1.,abs(P.y)));
        vec3 V=normalize(cameraPosition-vWp), L=normalize(uSunW);
        float ndl=dot(N,L);
        // the atmosphere wraps and softens the terminator, which turns warm where sunlight grazes a long slant path
        float lit=smoothstep(-.10,.42,ndl)*.55+max(ndl,0.)*.45;
        vec3 Lo=normalize(uSunO); float rs=1.;
        float t=-vPo.y/Lo.y;
        if(abs(Lo.y)>.001&&t>0.){ vec3 Q=vPo+Lo*t; rs=1.-ringDensity(length(Q.xz))*.92; }
        float nv=max(dot(N,V),0.), fres=pow(1.-nv,3.);
        vec3 sunC=vec3(1.7,1.55,1.35);
        vec3 diff=alb*lit*rs*sunC;
        diff*=mix(vec3(1.),vec3(1.28,.78,.5),exp(-pow(ndl/.2,2.))*.7);
        // limb in-scattering: Rayleigh phase x slant path, brightest on the sunlit limb
        float cs=dot(-V,L), ray=.75*(1.+cs*cs), path=1./(nv+.18);
        vec3 atm=vec3(.34,.5,.95)*ray*smoothstep(-.15,.5,ndl)*(1.-exp(-path*path*.045))*.55*fres*2.2;
        vec3 col=diff+alb*vec3(.015,.02,.04)+vec3(.9,.7,.4)*fres*lit*.35+atm+vec3(.15,.25,.5)*fres*.1;
        gl_FragColor=vec4(col,1.);
      }`
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), planetMat); planet.frustumCulled = false; group.add(planet);
  const ringGeo = new THREE.RingGeometry(1.24, 2.3, 160, 1); ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: U(), vertexShader: vert, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    fragmentShader: 'varying vec3 vNw,vPo,vWp; uniform vec3 uSunO,uSunW;' + GLSL_NOISE + RING_GLSL + `
      float hg(float c,float g){ return (1.-g*g)/pow(1.+g*g-2.*g*c,1.5); }
      void main(){
        float r=length(vPo.xz); float dens=ringDensity(r);
        vec3 Lo=normalize(uSunO);
        float b=dot(vPo,Lo), c=dot(vPo,vPo)-1., disc=b*b-c, sh=1.;
        if(disc>0.&&(-b-sqrt(disc))>0.) sh=.07;
        float x=(r-1.24)/1.06;
        vec3 base=mix(vec3(.82,.7,.5),vec3(.95,.88,.72),n1(x*30.))*(.7+.5*n1(x*140.));
        // icy particles: strong forward scattering (the lit rings glow when seen against the sun) plus a diffuse back lobe;
        // thin regions transmit more light than dense ones
        vec3 V=normalize(cameraPosition-vWp);
        float cs=dot(-normalize(uSunW),V);
        float ph=min(mix(hg(cs,-.2),hg(cs,.62),.35)*.55,2.6);
        float trans=1.+(1.-dens)*.6;
        gl_FragColor=vec4(base*sh*vec3(2.2,2.0,1.7)*(.45+ph)*trans,dens*.93);
      }`
  });
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.frustumCulled = false; ring.renderOrder = -3; group.add(ring);
  scene.add(group);

  const moonMat = tint => new THREE.ShaderMaterial({
    uniforms: { uSunW: { value: sunW.clone() }, uTint: { value: tint } }, vertexShader: vert, fog: false,
    fragmentShader: 'varying vec3 vNw,vPo,vWp; uniform vec3 uSunW,uTint;' + GLSL_NOISE + `
      void main(){
        vec3 N=normalize(vNw), V=normalize(cameraPosition-vWp), L=normalize(uSunW);
        float n=f3(vPo*5.)*.6+f3(vPo*18.)*.4, cr=smoothstep(.45,.55,f3(vPo*9.+3.));
        vec3 alb=uTint*(.55+.7*n)*(.8+.2*cr);
        // Lommel-Seeliger regolith: dusty bodies stay bright towards the limb and at full phase instead of falling off like Lambert
        float ndl=max(dot(N,L),0.), ndv=max(dot(N,V),.02);
        float l=ndl/(ndl+ndv)*2.1*smoothstep(0.,.06,dot(N,L)+.04);
        gl_FragColor=vec4(alb*l*vec3(2.2,2.,1.8)+alb*.02,1.);
      }`
  });
  BG.moons = [
    { r: .17, orbit: 2.75, ph: 3.9, inc: .05, sp: .006, m: new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), moonMat(V3(.85, .78, .7))) },
    { r: .12, orbit: 3.3, ph: 5.1, inc: .5, sp: .004, m: new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), moonMat(V3(.6, .6, .66))) }
  ];
  for (const mo of BG.moons) { mo.m.scale.setScalar(mo.r); mo.m.frustumCulled = false; group.add(mo.m); }
  onFrame((dt, t) => {
    planetMat.uniforms.uTime.value = t;
    for (const mo of BG.moons) { const a = mo.ph + t * mo.sp; mo.m.position.set(Math.cos(a) * mo.orbit, Math.sin(a) * mo.orbit * Math.sin(mo.inc), Math.sin(a) * mo.orbit * Math.cos(mo.inc)); }
  });
  BG.planetGroup = group;
})();
