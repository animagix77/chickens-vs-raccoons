
/* ============================================================
   SKY, ENVIRONMENT LIGHT, AND POST
   The sky is a single shader dome: gradient + sun + two raymarched-ish
   cloud layers (a plane intersection per layer, sampled with fbm), and
   stars/moon for night. That dome is also baked into a PMREM cube and
   used as the scene's environment, so every bird picks up real sky
   bounce instead of a flat hemisphere fake.
   ============================================================ */

const SKY_FRAG = `
precision highp float;
varying vec3 vW;
uniform vec3 uCam,uSun,uMoon,uZenith,uHorizon,uHaze,uCloudLo,uCloudHi,uSunCol;
uniform float uTime,uCover,uNight,uSunPow;

float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float h31(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123); }
float vn(vec2 p){
  vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),
             mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.0,a=0.5;
  for(int i=0;i<5;i++){ v+=a*vn(p); p=p*2.07+vec2(1.7,9.2); a*=0.5; }
  return v;
}
/* intersect the view ray with a horizontal slab and sample noise there —
   gives correct perspective convergence toward the horizon */
float layer(vec3 dir,float hgt,float scale,vec2 wind,float cover,float soft){
  if(dir.y<0.015) return 0.0;
  float t=(hgt-uCam.y)/dir.y;
  if(t<=0.0) return 0.0;
  vec2 p=(uCam.xz+dir.xz*t)*scale+wind*uTime;
  float n=fbm(p);
  return smoothstep(cover,cover+soft,n)*smoothstep(0.015,0.13,dir.y);
}

void main(){
  vec3 dir=normalize(vW-uCam);
  float up=clamp(dir.y,-1.0,1.0);

  /* ---- day ---- */
  vec3 sky=mix(uHorizon,uZenith,pow(clamp(up,0.0,1.0),0.52));
  sky=mix(uHaze,sky,smoothstep(-0.10,0.07,up));
  float sd=max(dot(dir,uSun),0.0);
  sky+=uSunCol*pow(max(sd,1e-5),uSunPow)*22.0;
  sky+=uSunCol*pow(sd,7.0)*0.30;
  sky+=uSunCol*pow(sd,1.6)*0.07;

  float c1=layer(dir,170.0,0.01050,vec2( 0.55,0.22),1.03-uCover,0.26);
  float c2=layer(dir,380.0,0.00420,vec2( 0.22,0.09),1.15-uCover,0.32);
  float lit=pow(max(dot(dir,uSun),0.0),3.5);
  vec3 cc=mix(uCloudLo,uCloudHi,0.30+0.70*lit);
  sky=mix(sky,cc,clamp(c1*0.94,0.0,1.0));
  sky=mix(sky,mix(uCloudLo,uCloudHi,0.55),clamp(c2*0.45,0.0,1.0));

  /* ---- night ---- */
  vec3 nk=mix(vec3(0.045,0.058,0.095),vec3(0.012,0.018,0.045),pow(clamp(up,0.0,1.0),0.55));
  nk=mix(vec3(0.030,0.032,0.052),nk,smoothstep(-0.08,0.09,up));
  vec3 sp=floor(dir*260.0);
  float star=smoothstep(0.9965,1.0,h31(sp))*smoothstep(0.0,0.22,up);
  star*=0.5+0.5*sin(uTime*2.6+h31(sp+3.0)*30.0);
  nk+=vec3(0.85,0.90,1.0)*star*1.5;
  float md=max(dot(dir,uMoon),0.0);
  nk+=vec3(0.85,0.88,1.0)*pow(max(md,1e-5),2600.0)*7.0;
  nk+=vec3(0.30,0.36,0.55)*pow(md,9.0)*0.35;
  float nc=layer(dir,200.0,0.00760,vec2(0.18,0.07),0.70,0.34);
  nk=mix(nk,vec3(0.075,0.085,0.125),clamp(nc*0.75,0.0,1.0));

  gl_FragColor=vec4(mix(sky,nk,uNight),1.0);
}`;

const SKY_VERT = `
varying vec3 vW;
void main(){ vW=(modelMatrix*vec4(position,1.0)).xyz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

const SKY_U = {
  uTime  :{value:0},
  uCam   :{value:new THREE.Vector3()},
  uSun   :{value:new THREE.Vector3(-0.42,0.55,0.38).normalize()},
  uMoon  :{value:new THREE.Vector3(-0.38,0.62,-0.32).normalize()},
  uZenith:{value:new THREE.Color(0x2a63b4).convertSRGBToLinear()},
  uHorizon:{value:new THREE.Color(0xbcd6ea).convertSRGBToLinear()},
  uHaze  :{value:new THREE.Color(0xc8cfc0).convertSRGBToLinear()},
  uCloudLo:{value:new THREE.Color(0x7e8798).convertSRGBToLinear()},
  uCloudHi:{value:new THREE.Color(0xfffaf2).convertSRGBToLinear()},
  uSunCol:{value:new THREE.Color(0xfff2d6).convertSRGBToLinear()},
  uCover :{value:0.52},
  uSunPow:{value:1400.0},
  uNight :{value:0.0}
};
const skyMat=new THREE.ShaderMaterial({
  uniforms:SKY_U, vertexShader:SKY_VERT, fragmentShader:SKY_FRAG,
  side:THREE.BackSide, depthWrite:false, fog:false
});
const skyMesh=new THREE.Mesh(new THREE.SphereGeometry(420,32,20),skyMat);
skyMesh.frustumCulled=false; skyMesh.renderOrder=-1000;
scene.add(skyMesh);

/* ---------- environment map ----------
   Built in JS as a small equirect rather than baked from the dome shader:
   PMREM-convolving that shader produced NaN on some drivers (the sun-disc
   pow term blows up under the roughness filter), and the environment only
   needs low-frequency sky colour anyway — the sun itself is a real light. */
let pmrem=null, envRT=null, envTex=null;
function skyEquirect(night){
  const W=128,H=64,d=new Uint8Array(W*H*4);
  const sd=SKY_U.uSun.value;
  const zn=night?[0.030,0.042,0.085]:[0.165,0.388,0.706];
  const hz=night?[0.055,0.070,0.115]:[0.737,0.839,0.918];
  const gr=night?[0.030,0.030,0.040]:[0.235,0.255,0.150];
  const sc=night?[0.30,0.34,0.50]:[1.00,0.95,0.82];
  for(let y=0;y<H;y++){
    const th=(y+0.5)/H*Math.PI, dy=Math.cos(th), rr=Math.sin(th);
    for(let x=0;x<W;x++){
      const ph=(x+0.5)/W*TAU, dx=Math.cos(ph)*rr, dz=Math.sin(ph)*rr;
      const up=Math.max(dy,0), t=Math.pow(up,0.55);
      let c=[lerp(hz[0],zn[0],t),lerp(hz[1],zn[1],t),lerp(hz[2],zn[2],t)];
      if(dy<0){ const k=clamp(-dy*1.7,0,1); c=[lerp(c[0],gr[0],k),lerp(c[1],gr[1],k),lerp(c[2],gr[2],k)]; }
      const dot=Math.max(0,dx*sd.x+dy*sd.y+dz*sd.z);
      const glow=Math.pow(dot,14)*(night?0.25:0.85)+Math.pow(dot,3)*(night?0.04:0.16);
      const i=(y*W+x)*4;
      d[i  ]=clamp((c[0]+sc[0]*glow)*255,0,255);
      d[i+1]=clamp((c[1]+sc[1]*glow)*255,0,255);
      d[i+2]=clamp((c[2]+sc[2]*glow)*255,0,255);
      d[i+3]=255;
    }
  }
  const t=new THREE.DataTexture(d,W,H,THREE.RGBAFormat,THREE.UnsignedByteType);
  t.mapping=THREE.EquirectangularReflectionMapping;
  t.minFilter=THREE.LinearFilter; t.magFilter=THREE.LinearFilter;
  t.encoding=THREE.sRGBEncoding; t.needsUpdate=true;
  return t;
}
function bakeEnv(night){
  if(!pmrem){ pmrem=new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader(); }
  if(envTex) envTex.dispose();
  envTex=skyEquirect(!!night);
  const rt=pmrem.fromEquirectangular(envTex);
  if(envRT) envRT.dispose();
  envRT=rt; scene.environment=rt.texture;
  renderer.setRenderTarget(null);
}

/* day / night dressing for the sky itself */
/* The grade was tuned for daylight and then reused after dark, so the bulb
   and the moon both punched straight through the bloom threshold. Night gets
   its own: less exposure, a higher threshold so only the bulb itself blooms,
   and a deeper vignette to keep the eye in the middle of the coop. */
function setGrade(night){
  if(typeof matComp==='undefined'||!matComp) return;
  const u=matComp.uniforms;
  u.uExposure.value = night?0.88:0.95;
  u.uBloom.value    = night?0.22:0.30;
  u.uVig.value      = night?0.44:0.40;
  u.uSat.value      = night?0.97:1.10;   // the bulb goes orange fast; pull it back
  u.uContrast.value = night?1.06:1.075;
  if(typeof matBright!=='undefined'&&matBright) matBright.uniforms.uThresh.value = night?1.30:1.10;
}
function setSky(night){
  SKY_U.uNight.value=night?1:0;
  SKY_U.uCover.value=night?0.34:0.52;
  setGrade(night);
  bakeEnv(night);
}

/* ============================================================
   POST — scene renders linear into a float buffer, bloom is taken
   in linear light, then one composite pass does ACES, grade,
   vignette, chromatic aberration and grain in a single shader.
   ============================================================ */
const FS_VERT=`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

const BRIGHT_FRAG=`
precision highp float; varying vec2 vUv;
uniform sampler2D tSrc; uniform float uThresh,uKnee;
void main(){
  vec3 c=texture2D(tSrc,vUv).rgb;
  float l=dot(c,vec3(0.2126,0.7152,0.0722));
  float s=smoothstep(uThresh,uThresh+uKnee,l);
  gl_FragColor=vec4(c*s,1.0);
}`;

const BLUR_FRAG=`
precision highp float; varying vec2 vUv;
uniform sampler2D tSrc; uniform vec2 uDir;
void main(){
  vec3 s=texture2D(tSrc,vUv).rgb*0.227027;
  s+=texture2D(tSrc,vUv+uDir*1.3846).rgb*0.316216;
  s+=texture2D(tSrc,vUv-uDir*1.3846).rgb*0.316216;
  s+=texture2D(tSrc,vUv+uDir*3.2308).rgb*0.070270;
  s+=texture2D(tSrc,vUv-uDir*3.2308).rgb*0.070270;
  gl_FragColor=vec4(s,1.0);
}`;

const COMP_FRAG=`
precision highp float; varying vec2 vUv;
uniform sampler2D tScene,tBloom;
uniform float uBloom,uExposure,uVig,uGrain,uCA,uSat,uTime,uContrast;
vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
}
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
void main(){
  vec2 uv=vUv;
  vec2 off=(uv-0.5)*uCA*0.004;
  vec3 col;
  col.r=texture2D(tScene,uv+off).r;
  col.g=texture2D(tScene,uv).g;
  col.b=texture2D(tScene,uv-off).b;
  col+=texture2D(tBloom,uv).rgb*uBloom;
  col*=uExposure;
  col=aces(col);
  float l=dot(col,vec3(0.2126,0.7152,0.0722));
  col=mix(vec3(l),col,uSat);
  col=clamp((col-0.5)*uContrast+0.5,0.0,1.0);
  float d=length(uv-0.5);
  col*=1.0-uVig*smoothstep(0.32,0.95,d);
  col+=(h21(uv*vec2(1920.0,1080.0)+uTime)-0.5)*uGrain;
  col=pow(clamp(col,0.0,1.0),vec3(1.0/2.2));   // linear -> sRGB
  gl_FragColor=vec4(col,1.0);
}`;

const POST={on:true,scale:0.25};
const fsGeo=new THREE.BufferGeometry();
fsGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,0, 3,-1,0, -1,3,0]),3));
fsGeo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array([0,0, 2,0, 0,2]),2));
const fsCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const fsScene=new THREE.Scene();
const fsMesh=new THREE.Mesh(fsGeo,null); fsMesh.frustumCulled=false; fsScene.add(fsMesh);
function blit(mat,target){ fsMesh.material=mat; renderer.setRenderTarget(target||null); renderer.render(fsScene,fsCam); }

const matBright=new THREE.RawShaderMaterial({vertexShader:'precision highp float;\nattribute vec3 position;\nattribute vec2 uv;\n'+FS_VERT,
  fragmentShader:BRIGHT_FRAG, uniforms:{tSrc:{value:null},uThresh:{value:1.10},uKnee:{value:0.55}}, depthTest:false, depthWrite:false});
const matBlur=new THREE.RawShaderMaterial({vertexShader:'precision highp float;\nattribute vec3 position;\nattribute vec2 uv;\n'+FS_VERT,
  fragmentShader:BLUR_FRAG, uniforms:{tSrc:{value:null},uDir:{value:new THREE.Vector2()}}, depthTest:false, depthWrite:false});
const matComp=new THREE.RawShaderMaterial({vertexShader:'precision highp float;\nattribute vec3 position;\nattribute vec2 uv;\n'+FS_VERT,
  fragmentShader:COMP_FRAG, depthTest:false, depthWrite:false,
  uniforms:{tScene:{value:null},tBloom:{value:null},uBloom:{value:0.30},uExposure:{value:0.95},
    uVig:{value:0.40},uGrain:{value:0.026},uCA:{value:1.0},uSat:{value:1.10},
    uContrast:{value:1.075},uTime:{value:0}}});

let rtScene=null, rtA=null, rtB=null;
function makeRT(w,h,type){
  const t=new THREE.WebGLRenderTarget(Math.max(2,w|0),Math.max(2,h|0),{
    minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
    format:THREE.RGBAFormat, type:type, depthBuffer:true, stencilBuffer:false});
  t.texture.generateMipmaps=false;
  return t;
}
function postResize(){
  const sz=renderer.getDrawingBufferSize(new THREE.Vector2());
  const ft=(renderer.capabilities.isWebGL2||renderer.extensions.get('OES_texture_half_float'))
    ? THREE.HalfFloatType : THREE.UnsignedByteType;
  [rtScene,rtA,rtB].forEach(t=>t&&t.dispose());
  rtScene=makeRT(sz.x,sz.y,ft);
  rtA=makeRT(sz.x*POST.scale,sz.y*POST.scale,ft);
  rtB=makeRT(sz.x*POST.scale,sz.y*POST.scale,ft);
}

/* keep the sun's shadow box tight around wherever the fighting is */
function trackShadow(){
  if(!sun.castShadow) return;
  const d=clamp(ARENA_R*1.35,28,72);   // wide enough for the props and treeline edge
  const c=sun.shadow.camera;
  if(c.right!==d){ c.left=-d; c.right=d; c.top=d; c.bottom=-d; c.updateProjectionMatrix(); }
  sun.target.position.set(BATTLE.cx,0,BATTLE.cz);
  sun.target.updateMatrixWorld();
  sun.position.set(BATTLE.cx+SUN_OFF.x, SUN_OFF.y, BATTLE.cz+SUN_OFF.z);
}
const SUN_OFF=new THREE.Vector3(-52,74,44);

let postT=0;
function renderFrame(dt){
  SKY_U.uTime.value+=dt;
  SKY_U.uCam.value.copy(camera.position);
  if(GRASS_MAT.userData.u) GRASS_MAT.userData.u.uTime.value+=dt;
  trackShadow();

  if(!POST.on||!rtScene){ renderer.setRenderTarget(null); renderer.render(scene,camera); return; }
  postT+=dt;
  renderer.setRenderTarget(rtScene);
  renderer.clear();
  renderer.render(scene,camera);

  matBright.uniforms.tSrc.value=rtScene.texture; blit(matBright,rtA);
  const sz=rtA.width, szy=rtA.height;
  matBlur.uniforms.tSrc.value=rtA.texture; matBlur.uniforms.uDir.value.set(1/sz,0); blit(matBlur,rtB);
  matBlur.uniforms.tSrc.value=rtB.texture; matBlur.uniforms.uDir.value.set(0,1/szy); blit(matBlur,rtA);
  matBlur.uniforms.tSrc.value=rtA.texture; matBlur.uniforms.uDir.value.set(2/sz,0); blit(matBlur,rtB);
  matBlur.uniforms.tSrc.value=rtB.texture; matBlur.uniforms.uDir.value.set(0,2/szy); blit(matBlur,rtA);

  matComp.uniforms.tScene.value=rtScene.texture;
  matComp.uniforms.tBloom.value=rtA.texture;
  matComp.uniforms.uTime.value=postT;
  blit(matComp,null);
}
