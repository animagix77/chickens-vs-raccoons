
/* ============================================================
   ARENA
   ============================================================ */
let arenaGroup=null, ARENA_R=30, NIGHT=false;

function disposeGroup(g){
  if(!g) return;
  g.traverse(o=>{ if(o.geometry) o.geometry.dispose(); });
  scene.remove(g);
}

/* value noise, matched between the terrain mesh and whatever we scatter on it */
function h2(x,z){ const s=Math.sin(x*127.1+z*311.7)*43758.5453; return s-Math.floor(s); }
function vnoise(x,z){
  const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz;
  const ux=fx*fx*(3-2*fx), uz=fz*fz*(3-2*fz);
  return lerp(lerp(h2(ix,iz),h2(ix+1,iz),ux), lerp(h2(ix,iz+1),h2(ix+1,iz+1),ux), uz);
}
function fbm2(x,z){
  let v=0,a=1,f=0.014,n=0;
  for(let i=0;i<4;i++){ v+=a*vnoise(x*f,z*f); n+=a; a*=0.5; f*=2.13; }
  return v/n;
}
/* the arena floor stays dead flat; the land only starts rolling outside the fence */
function terrainY(x,z,R){
  const r=Math.hypot(x,z);
  const k=clamp((r-(R+9))/(R*1.5),0,1);
  return (fbm2(x,z)-0.45)*R*0.34*k*k;
}

function buildArena(R,night){
  disposeGroup(arenaGroup);
  ARENA_R=R; NIGHT=night;
  setSky(night);
  const g=new THREE.Group();

  /* ---- lighting mood ---- */
  if(night){
    scene.background=null;
    scene.fog=new THREE.FogExp2(0,0.0055); scene.fog.color.setHex(0x0e1422).convertSRGBToLinear();
    hemi.color.setHex(0x2a3a58); hemi.groundColor.setHex(0x1c1409); hemi.intensity=0.21;
    sun.color.setHex(0x9db6e2); sun.intensity=0.34; SUN_OFF.set(-34,62,-30);
    rim.color.setHex(0x486a9c); rim.intensity=0.13;
    /* One bare bulb over a dirt floor. It was flooding the whole arena at 26
       with a soft falloff, which is why night looked blown out rather than
       lit — a quarter of the power with true inverse-square decay makes it
       pool under the fixture and leave the edges to the moon. */
    bulb.color.setHex(0xffc98a);
    bulb.intensity=6.0; bulb.distance=R*2.8; bulb.decay=1.85; bulb.position.set(0,R*0.24,0);
    SKY_U.uSun.value.set(-0.34,0.62,-0.30).normalize();
  }else{
    scene.background=null;
    scene.fog=new THREE.FogExp2(0,0.0022); scene.fog.color.setHex(0xa9c6e0).convertSRGBToLinear();
    hemi.color.setHex(0xbcd8ff); hemi.groundColor.setHex(0x4a3a20); hemi.intensity=0.20;
    sun.color.setHex(0xfff1d2); sun.intensity=1.55; SUN_OFF.set(-52,74,44);
    rim.color.setHex(0x9fc8ff); rim.intensity=0.16;
    bulb.intensity=0;
    SKY_U.uSun.value.set(-0.52,0.74,0.44).normalize();
  }

  /* ---- rolling country, with a flat pan where the fight happens ---- */
  const SPAN=R*7, SEG=96;
  const tGeo=new THREE.PlaneGeometry(SPAN,SPAN,SEG,SEG);
  tGeo.rotateX(-Math.PI/2);
  const tp=tGeo.attributes.position, tc=new Float32Array(tp.count*3);
  const cGrass=new THREE.Color(night?0x1d2a17:0x53612f).convertSRGBToLinear();
  const cDry  =new THREE.Color(night?0x2a2418:0x6f7038).convertSRGBToLinear();
  for(let i=0;i<tp.count;i++){
    const x=tp.getX(i), z=tp.getZ(i);
    const y=terrainY(x,z,R);
    tp.setY(i,y);
    const t=clamp(y/(R*0.16)*0.5+0.5+ (vnoise(x*0.09,z*0.09)-0.5)*0.6, 0,1);
    tc[i*3]  =lerp(cGrass.r,cDry.r,t);
    tc[i*3+1]=lerp(cGrass.g,cDry.g,t);
    tc[i*3+2]=lerp(cGrass.b,cDry.b,t);
  }
  tGeo.setAttribute('color',new THREE.BufferAttribute(tc,3));
  tGeo.computeVertexNormals();
  const tMesh=new THREE.Mesh(tGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1.0}));
  tMesh.receiveShadow=true; g.add(tMesh);

  // the trodden pan itself
  const groundGeo=new THREE.CircleGeometry(R+12,72); groundGeo.rotateX(-Math.PI/2);
  const gm=new THREE.Mesh(groundGeo,new THREE.MeshStandardMaterial({
    color:new THREE.Color(night?0x3d2f20:0x6f6047).convertSRGBToLinear(),roughness:1.0}));
  gm.position.y=0.004; gm.receiveShadow=true; g.add(gm);

  const patch=new THREE.CircleGeometry(R*0.74,56); patch.rotateX(-Math.PI/2);
  const pm=new THREE.Mesh(patch,new THREE.MeshStandardMaterial({
    color:new THREE.Color(night?0x4a3826:0x827152).convertSRGBToLinear(),roughness:1.0}));
  pm.position.y=0.009; pm.receiveShadow=true; g.add(pm);

  /* ---- scatter: grass tufts or straw ---- */
  const bits=[];
  const N=Math.min(2600,(R*R*0.9)|0);
  for(let i=0;i<N;i++){
    const a=Math.random()*TAU, r=Math.sqrt(Math.random())*(R+11);
    const x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(night){
      bits.push(P(G.box,i%3?'#a8862f':'#8d6f26', x,0.02,z, 0,Math.random()*TAU,0, rnd(.03,.06),.02,rnd(.25,.6)));
    }else{
      const inner=r<R*0.75;
      bits.push(P(G.cone,inner?(i%4?'#6d6234':'#7d7040'):(i%3?'#4e6b32':'#5d7a3a'),
        x,rnd(.05,.14),z, rnd(-.2,.2),Math.random()*TAU,rnd(-.2,.2), rnd(.05,.12),rnd(.18,.42),rnd(.05,.12)));
    }
  }
  if(bits.length){
    const gm2=new THREE.Mesh(mergeAll(bits),GRASS_MAT);
    gm2.castShadow=!night; gm2.receiveShadow=true; g.add(gm2);
  }

  /* ---- perimeter ---- */
  const wall=[];
  const posts=Math.max(24,(TAU*R/2.1)|0);
  for(let i=0;i<posts;i++){
    const a=i/posts*TAU, x=Math.cos(a)*R, z=Math.sin(a)*R;
    if(night){
      // coop planking
      wall.push(P(G.box, i%2?'#4a3520':'#553d25', x,1.10,z, 0,-a,0, .16,2.2,2.24));
      wall.push(P(G.box,'#3a2a18', x*1.006,2.14,z*1.006, 0,-a,0, .20,.16,2.3));
    }else{
      wall.push(P(G.cyl,'#5a4428', x,.62,z, 0,0,0, .085,1.25,.085));
      const a2=(i+1)/posts*TAU, x2=Math.cos(a2)*R, z2=Math.sin(a2)*R;
      const mx=(x+x2)/2, mz=(z+z2)/2, len=Math.hypot(x2-x,z2-z);
      wall.push(P(G.box,'#6b5330', mx,.92,mz, 0,-Math.atan2(z2-z,x2-x),0, len,.075,.05));
      wall.push(P(G.box,'#6b5330', mx,.52,mz, 0,-Math.atan2(z2-z,x2-x),0, len,.075,.05));
    }
  }
  const wm=new THREE.Mesh(mergeAll(wall),MAT); wm.castShadow=true; wm.receiveShadow=true; g.add(wm);

  /* ---- set dressing ---- */
  const props=[];
  if(night){
    // hanging bulb + cage
    props.push(P(G.sph,'#ffdca8', 0,R*0.30,0, 0,0,0, .34));
    props.push(P(G.cyl,'#2a2530', 0,R*0.30+.55,0, 0,0,0, .05,1.1,.05));
    // feed trough + nesting boxes
    for(let i=0;i<5;i++){
      const a=i/5*TAU+0.4, x=Math.cos(a)*(R-2.4), z=Math.sin(a)*(R-2.4);
      props.push(P(G.box,'#4a3520', x,.45,z, 0,-a,0, 1.9,.9,1.1));
      props.push(P(G.box,'#241a10', x,.86,z, 0,-a,0, 1.7,.1,.95));
    }
  }else{
    // barn, silo, water trough, bales
    const by=terrainY(-R*1.35,-R*1.05,R);
    props.push(P(G.box,'#7a2a22', -R*1.35,by+4.2,-R*1.05, 0,.5,0, 13,8.4,9));
    props.push(P(G.box,'#4a1c16', -R*1.35,by+8.9,-R*1.05, 0,.5,0, 13.6,1.6,9.4));
    props.push(P(G.box,'#2e120e', -R*1.35+3.2,by+2.2,-R*1.05+4.3, 0,.5,0, 2.6,4.4,.3));
    const sy=terrainY(R*1.25,-R*0.9,R);
    props.push(P(G.cyl,'#8a9aa8', R*1.25,sy+3.2,-R*0.9, 0,0,0, 2.4,6.4,2.4));
    props.push(P(G.cone,'#6d7d8a', R*1.25,sy+7.2,-R*0.9, 0,0,0, 2.7,2.0,2.7));
    // trough
    props.push(P(G.box,'#5a5f66', R*0.55,.28,-R*0.72, 0,.7,0, 3.2,.55,.9));
    props.push(P(G.box,'#3f444a', R*0.55,.48,-R*0.72, 0,.7,0, 2.9,.12,.7));
    for(let i=0;i<14;i++){
      const a=Math.random()*TAU, r=R+rnd(3,26);
      const x=Math.cos(a)*r, z=Math.sin(a)*r;
      props.push(P(G.box,'#c4aa24', x,terrainY(x,z,R)+.5,z, 0,Math.random()*TAU,0, 1.5,1.0,1.0));
    }
  }
  /* ---- treeline: a broken hedgerow band sitting on the terrain ---- */
  const trees=[];
  const TN=night?70:150;
  for(let i=0;i<TN;i++){
    const a=Math.random()*TAU, rr=R+rnd(24,R*2.4);
    const x=Math.cos(a)*rr, z=Math.sin(a)*rr;
    const y=terrainY(x,z,R);
    const hgt=rnd(4.5,11), wid=hgt*rnd(0.26,0.40);
    trees.push(P(G.cyl,night?'#1a1410':'#3d2c1c', x,y+hgt*0.22,z, 0,0,0, hgt*.045,hgt*.45,hgt*.045));
    const cCol=night?(i%3?'#141f18':'#101a14'):(i%3?'#2f4a24':'#3a5a2b');
    trees.push(P(G.cone,cCol, x,y+hgt*0.55,z, 0,Math.random()*TAU,0, wid,hgt*.55,wid));
    trees.push(P(G.cone,cCol, x,y+hgt*0.82,z, 0,Math.random()*TAU,0, wid*.72,hgt*.42,wid*.72));
  }
  const tm=new THREE.Mesh(mergeAll(trees),MAT); tm.castShadow=!night; g.add(tm);
  const pmn=new THREE.Mesh(mergeAll(props),MAT); pmn.castShadow=true; pmn.receiveShadow=true; g.add(pmn);

  scene.add(g); arenaGroup=g;
}

/* ============================================================
   INSTANCED SQUAD RENDERER
   ============================================================ */
/* ============================================================
   THE FLOODLIGHT

   This had no visual at all — the ability changed the numbers and nothing
   else, which is why it never felt like it did anything. It is a spotlight
   on a pole now, with a pool of light on the dirt under it.

   It is also deliberately weak in daylight, because that is the truth about
   floodlights: switching one on at noon accomplishes very little. The night
   coop is where it earns its cooldown, and that gives the two arenas
   genuinely different tactics instead of the same button twice.
   ============================================================ */
const floodLight=new THREE.SpotLight(0xf2f6ff,0,120,Math.PI*0.26,0.42,1.1);
floodLight.position.set(0,46,0);
floodLight.target.position.set(0,0,0);
scene.add(floodLight); scene.add(floodLight.target);

/* the pool it throws, as a soft additive disc so it reads even where the
   spotlight falloff is subtle */
const floodPoolTex=(()=>{
  const c=document.createElement('canvas'); c.width=c.height=128;
  const g=c.getContext('2d').createRadialGradient(64,64,0,64,64,64);
  /* cool and restrained — the post chain has a bright pass on it, and warm
     white on pale dirt blooms straight to a white screen */
  g.addColorStop(0,'rgba(206,224,255,0.80)');
  g.addColorStop(.42,'rgba(186,208,246,0.30)');
  g.addColorStop(1,'rgba(170,196,240,0)');
  const x=c.getContext('2d'); x.fillStyle=g; x.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(c); return t;
})();
const floodPool=new THREE.Mesh(
  new THREE.CircleGeometry(1,40),
  new THREE.MeshBasicMaterial({map:floodPoolTex,transparent:true,opacity:0,
    depthWrite:false,blending:THREE.AdditiveBlending}));
floodPool.rotation.x=-Math.PI/2; floodPool.position.y=0.04;
floodPool.renderOrder=-1; scene.add(floodPool);

let floodLvl=0;
/* how much good a floodlight actually does, given how light it already is */
function floodPower(){ return NIGHT?1:0.34; }
function floodStep(dt,on,cx,cz){
  const want=on?floodPower():0;
  /* snaps on like a switch, fades off like a filament */
  floodLvl+=(want-floodLvl)*Math.min(1,dt*(want>floodLvl?9:2.4));
  const lit=floodLvl>0.002;
  floodLight.visible=lit; floodPool.visible=lit;
  if(!lit) return;
  const r=Math.min(26,ARENA_R*0.62);
  floodLight.position.set(cx,46,cz);
  floodLight.target.position.set(cx,0,cz);
  floodLight.target.updateMatrixWorld();
  floodLight.intensity=floodLvl*(NIGHT?8.5:3.2);
  floodPool.position.set(cx,0.04,cz);
  floodPool.scale.setScalar(r);
  /* a faint mains hum in the flicker, strongest at night */
  const flick=1+Math.sin(BATTLE.t*37)*0.03+Math.sin(BATTLE.t*11.3)*0.02;
  floodPool.material.opacity=floodLvl*(NIGHT?0.30:0.07)*flick;
  hemi.intensity=(NIGHT?0.21:0.20)+floodLvl*(NIGHT?0.12:0.03);
}

class Squad{
  constructor(kits,max){
    this.kits=kits; this.max=max;
    this.core=[]; this.flap=[]; this.n=new Int32Array(kits.length);
    for(let i=0;i<kits.length;i++){
      const c=new THREE.InstancedMesh(kits[i].core,MAT,max);
      const f=new THREE.InstancedMesh(kits[i].flap,MAT,max);
      c.frustumCulled=false; f.frustumCulled=false;
      c.castShadow=true; f.castShadow=true;
      c.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      f.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(c); scene.add(f);
      this.core.push(c); this.flap.push(f);
    }
  }
  begin(){ this.n.fill(0); }
  push(v,mCore,mFlap){
    const i=this.n[v]++;
    if(i>=this.max) return;
    this.core[v].setMatrixAt(i,mCore);
    this.flap[v].setMatrixAt(i,mFlap);
  }
  end(){
    for(let v=0;v<this.core.length;v++){
      /* push() refuses to write past the buffer but still counts, so clamp here
         — a count above capacity makes three.js draw uninitialised matrices */
      const c=Math.min(this.n[v],this.max), on=c>0;
      this.core[v].visible=on; this.flap[v].visible=on;
      this.core[v].count=c; this.flap[v].count=c;
      this.core[v].instanceMatrix.needsUpdate=true;
      this.flap[v].instanceMatrix.needsUpdate=true;
    }
  }
  dispose(){   /* geometries are cached and reused — only drop the instance buffers */
    for(let v=0;v<this.core.length;v++){
      scene.remove(this.core[v]); scene.remove(this.flap[v]);
      this.core[v].dispose(); this.flap[v].dispose();
    }
  }
}

/* ============================================================
   BLOB SHADOWS
   ============================================================ */
const shadowGeo=new THREE.CircleGeometry(1,12); shadowGeo.rotateX(-Math.PI/2);
const shadowIM=new THREE.InstancedMesh(shadowGeo,
  new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.33,depthWrite:false}),6000);
shadowIM.frustumCulled=false; shadowIM.renderOrder=-2;
shadowIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(shadowIM);

/* ============================================================
   PARTICLES — feathers, dust, and small red regrets
   ============================================================ */
const FEATHER_MAX=4200;
const featherGeo=mergeAll([P(G.sphLo,'#efe7d6',0,0,0,0,0,0,.025,.007,.070)]);
const featherIM=new THREE.InstancedMesh(featherGeo,
  new THREE.MeshLambertMaterial({vertexColors:true,transparent:true,opacity:.9,depthWrite:false}),FEATHER_MAX);
featherIM.frustumCulled=false;
featherIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(featherIM);

const PUFF_MAX=600;
const puffGeo=mergeAll([P(G.sph,'#d8c9a8',0,0,0,0,0,0,1)]);
const puffIM=new THREE.InstancedMesh(puffGeo,
  new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.075,depthWrite:false}),PUFF_MAX);
puffIM.frustumCulled=false;
puffIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(puffIM);

const F={x:new Float32Array(FEATHER_MAX),y:new Float32Array(FEATHER_MAX),z:new Float32Array(FEATHER_MAX),
  vx:new Float32Array(FEATHER_MAX),vy:new Float32Array(FEATHER_MAX),vz:new Float32Array(FEATHER_MAX),
  rx:new Float32Array(FEATHER_MAX),ry:new Float32Array(FEATHER_MAX),ph:new Float32Array(FEATHER_MAX),
  sp:new Float32Array(FEATHER_MAX),life:new Float32Array(FEATHER_MAX),g:new Uint8Array(FEATHER_MAX)};
let fHead=0;
const PU={x:new Float32Array(PUFF_MAX),y:new Float32Array(PUFF_MAX),z:new Float32Array(PUFF_MAX),
  r:new Float32Array(PUFF_MAX),life:new Float32Array(PUFF_MAX)};
let pHead=0;

function spawnFeathers(x,y,z,n,force){
  for(let i=0;i<n;i++){
    const k=fHead++%FEATHER_MAX;
    F.x[k]=x; F.y[k]=y+rnd(-.1,.3); F.z[k]=z;
    const a=Math.random()*TAU, sp=rnd(.35,1.7)*force;
    F.vx[k]=Math.cos(a)*sp; F.vz[k]=Math.sin(a)*sp;
    F.vy[k]=rnd(1.7,3.6)*force;          // kicked up, not launched
    F.rx[k]=Math.random()*TAU; F.ry[k]=Math.random()*TAU;
    F.ph[k]=Math.random()*TAU;
    F.sp[k]=rnd(-5,5); F.life[k]=rnd(2.6,4.6); F.g[k]=0;
  }
}
function spawnPuff(x,y,z,r){
  const k=pHead++%PUFF_MAX;
  PU.x[k]=x; PU.y[k]=y; PU.z[k]=z; PU.r[k]=r; PU.life[k]=rnd(.5,.9);
}

let pTime=0;
function stepParticles(dt){
  pTime+=dt;
  let n=0;
  for(let i=0;i<FEATHER_MAX;i++){
    if(F.life[i]<=0) continue;
    F.life[i]-=dt;
    if(F.g[i]){                                   // settled: just lie there and fade
      F.rx[i]+=F.sp[i]*dt*0.15; F.sp[i]*=1-2*dt;
    }else{
      // a feather has almost no mass and enormous drag, so it rises fast,
      // stalls, then see-saws down at a near-constant crawl
      F.vy[i]-=2.7*dt;
      if(F.vy[i]<-1.05) F.vy[i]=-1.05;
      const sway=Math.sin(pTime*2.6+F.ph[i])*1.5;
      F.vx[i]+=Math.cos(F.ph[i])*sway*dt;
      F.vz[i]+=Math.sin(F.ph[i])*sway*dt;
      F.vx[i]*=1-1.7*dt; F.vz[i]*=1-1.7*dt;
      F.x[i]+=F.vx[i]*dt; F.y[i]+=F.vy[i]*dt; F.z[i]+=F.vz[i]*dt;
      if(F.y[i]<0.022){
        F.y[i]=0.022; F.g[i]=1; F.vx[i]=F.vy[i]=F.vz[i]=0;
        F.rx[i]=Math.PI/2*(Math.random()<.5?1:-1)+rnd(-.25,.25);   // flat on the dirt
        if(F.life[i]>2.6) F.life[i]=2.6;
      }
      F.rx[i]+=F.sp[i]*dt; F.ry[i]+=F.sp[i]*0.5*dt;
    }
    if(n<FEATHER_MAX){
      _v.set(F.x[i],F.y[i],F.z[i]);
      _e.set(F.rx[i],F.ry[i],F.rx[i]*0.5); _q.setFromEuler(_e);
      const s=clamp(F.life[i]*1.3,0,1);
      _s.set(s,s,s); _m.compose(_v,_q,_s);
      featherIM.setMatrixAt(n++,_m);
    }
  }
  featherIM.count=n; featherIM.instanceMatrix.needsUpdate=true;

  let m=0;
  for(let i=0;i<PUFF_MAX;i++){
    if(PU.life[i]<=0) continue;
    PU.life[i]-=dt; PU.y[i]+=0.35*dt; PU.r[i]+=1.15*dt;
    if(m<PUFF_MAX){
      _v.set(PU.x[i],PU.y[i],PU.z[i]); _q.identity();
      const s=PU.r[i]*clamp(PU.life[i]*1.4,0,1);
      _s.set(s,s*0.7,s); _m.compose(_v,_q,_s);
      puffIM.setMatrixAt(m++,_m);
    }
  }
  puffIM.count=m; puffIM.instanceMatrix.needsUpdate=true;
}

/* ============================================================
   GORE — airborne droplets that land and permanently stain the dirt.
   Off by default: plenty of people watching this would rather it
   weren't there, and the fight reads fine on feathers and dust alone.
   Every emitter below checks this one flag.
   ============================================================ */
let GORE=false;
const STAIN_MAX=3400;
function splatGeo(seed){
  const bits=[];
  for(let i=0;i<6;i++){
    const a=Math.random()*TAU, r=Math.random()*0.55;
    const c=new THREE.CircleGeometry(rnd(.22,.5),7); c.rotateX(-Math.PI/2);
    bits.push(P(c,'#000000', Math.cos(a)*r,0,Math.sin(a)*r, 0,Math.random()*TAU,0, 1,1,rnd(.7,1.3)));
  }
  return mergeAll(bits);
}
const stainIM=[];
for(let v=0;v<3;v++){
  const m=new THREE.InstancedMesh(splatGeo(v),
    new THREE.MeshBasicMaterial({color:0x4b0a05,transparent:true,opacity:.19,depthWrite:false}),STAIN_MAX);
  m.frustumCulled=false; m.renderOrder=-4; m.count=0;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m); stainIM.push(m);
}
/* ring buffers: a very long fight overwrites its own oldest marks rather than
   silently stopping, so the ground never freezes mid-battle */
let stainN=[0,0,0], stainW=[0,0,0], stainHead=0;
function addStain(x,z,scale){
  if(!GORE) return;
  const v=stainHead%3, i=stainW[v]%STAIN_MAX;
  _v.set(x,0.014+v*0.0012,z); _e.set(0,Math.random()*TAU,0); _q.setFromEuler(_e);
  const s=scale*rnd(.75,1.35);
  _s.set(s,1,s*rnd(.8,1.25));
  _m2.compose(_v,_q,_s);
  stainIM[v].setMatrixAt(i,_m2);
  stainW[v]++; stainN[v]=Math.min(stainW[v],STAIN_MAX);
  stainIM[v].count=stainN[v]; stainIM[v].instanceMatrix.needsUpdate=true;
  stainHead++;
}
function clearStains(){ for(let v=0;v<3;v++){ stainN[v]=0; stainW[v]=0; stainIM[v].count=0; } }

const DROP_MAX=2200;
const dropGeo=mergeAll([P(G.sphLo,'#780b05',0,0,0,0,0,0,.034,.034,.05)]);
const dropIM=new THREE.InstancedMesh(dropGeo,MAT,DROP_MAX);
dropIM.frustumCulled=false; dropIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(dropIM);
const D={x:new Float32Array(DROP_MAX),y:new Float32Array(DROP_MAX),z:new Float32Array(DROP_MAX),
  vx:new Float32Array(DROP_MAX),vy:new Float32Array(DROP_MAX),vz:new Float32Array(DROP_MAX),
  sc:new Float32Array(DROP_MAX),life:new Float32Array(DROP_MAX)};
let dHead=0;

/* dx,dz = direction of the blow, so spray throws the right way */
function spawnBlood(x,y,z,n,force,dx,dz){
  /* blood off — a kick of dust stands in, so a hit still reads as a hit */
  if(!GORE){ if(n>6) spawnPuff(x,Math.max(0.1,y*0.5),z,0.20+n*0.006); return; }
  for(let i=0;i<n;i++){
    const k=dHead++%DROP_MAX;
    D.x[k]=x; D.y[k]=y+rnd(-.1,.2); D.z[k]=z;
    const a=Math.random()*TAU, sp=rnd(.6,2.5)*force;
    D.vx[k]=Math.cos(a)*sp+(dx||0)*rnd(.8,2.6)*force;
    D.vz[k]=Math.sin(a)*sp+(dz||0)*rnd(.8,2.6)*force;
    D.vy[k]=rnd(1.1,3.3)*force;
    D.sc[k]=rnd(.5,1.25); D.life[k]=rnd(.45,1.0);
  }
}
const MIST_MAX=420;
const mistGeo=mergeAll([P(G.sph,'#8e1108',0,0,0,0,0,0,1)]);
const mistIM=new THREE.InstancedMesh(mistGeo,
  new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.17,depthWrite:false}),MIST_MAX);
mistIM.frustumCulled=false; mistIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mistIM);
const MI={x:new Float32Array(MIST_MAX),y:new Float32Array(MIST_MAX),z:new Float32Array(MIST_MAX),
  r:new Float32Array(MIST_MAX),life:new Float32Array(MIST_MAX)};
let miHead=0;
function spawnMist(x,y,z,r){
  if(!GORE) return;
  const k=miHead++%MIST_MAX;
  MI.x[k]=x; MI.y[k]=y; MI.z[k]=z; MI.r[k]=r; MI.life[k]=rnd(.3,.55);
}

/* toggling off wipes what's already on the field and on the ground, so the
   switch is a real undo rather than just stopping new marks */
function setGore(on){
  GORE=!!on;
  for(let v=0;v<3;v++) stainIM[v].visible=GORE;
  dropIM.visible=GORE; mistIM.visible=GORE;
  if(!GORE){ clearStains(); D.life.fill(0); MI.life.fill(0);
    dropIM.count=0; mistIM.count=0; }
}
setGore(false);

function stepGore(dt){
  let n=0;
  for(let i=0;i<DROP_MAX;i++){
    if(D.life[i]<=0) continue;
    D.life[i]-=dt;
    D.vy[i]-=17*dt;
    D.x[i]+=D.vx[i]*dt; D.y[i]+=D.vy[i]*dt; D.z[i]+=D.vz[i]*dt;
    if(D.y[i]<=0.02){                       // it landed — most drops leave a mark
      D.life[i]=0;
      if(Math.random()<0.30) addStain(D.x[i],D.z[i],D.sc[i]*rnd(.13,.30));
      continue;
    }
    if(n<DROP_MAX){
      _v.set(D.x[i],D.y[i],D.z[i]);
      // stretch the droplet along its own velocity so fast spray reads as streaks
      const sp=Math.hypot(D.vx[i],D.vy[i],D.vz[i]);
      _e.set(0,Math.atan2(D.vx[i],D.vz[i]),0); _q.setFromEuler(_e);
      const st=clamp(sp*0.26,1,5.5), sc=D.sc[i];
      _s.set(sc,sc,sc*st); _m2.compose(_v,_q,_s);
      dropIM.setMatrixAt(n++,_m2);
    }
  }
  dropIM.count=n; dropIM.instanceMatrix.needsUpdate=true;

  let m=0;
  for(let i=0;i<MIST_MAX;i++){
    if(MI.life[i]<=0) continue;
    MI.life[i]-=dt; MI.r[i]+=1.9*dt; MI.y[i]+=0.55*dt;
    if(m<MIST_MAX){
      _v.set(MI.x[i],MI.y[i],MI.z[i]); _q.identity();
      const s=MI.r[i]*clamp(MI.life[i]*2.4,0,1);
      _s.set(s,s*.8,s); _m2.compose(_v,_q,_s);
      mistIM.setMatrixAt(m++,_m2);
    }
  }
  mistIM.count=m; mistIM.instanceMatrix.needsUpdate=true;
}

function clearParticles(){ F.life.fill(0); PU.life.fill(0); D.life.fill(0); MI.life.fill(0);
  featherIM.count=0; puffIM.count=0; dropIM.count=0; mistIM.count=0; clearStains(); }
