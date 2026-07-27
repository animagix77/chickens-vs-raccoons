/* ============================================================
   CHICKENS vs RACCOONS — a deeply unnecessary battle simulator
   ============================================================ */
'use strict';

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const lerp  = (a,b,t) => a+(b-a)*t;
const rnd   = (a,b) => a+Math.random()*(b-a);
const pick  = a => a[(Math.random()*a.length)|0];
const TAU   = Math.PI*2;

/* ---------- film grain (procedural, keeps file self-contained) ---------- */
(function grain(){
  const c=document.createElement('canvas');c.width=c.height=180;
  const x=c.getContext('2d'),d=x.createImageData(180,180);
  for(let i=0;i<d.data.length;i+=4){const v=(Math.random()*255)|0;
    d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}
  x.putImageData(d,0,0);
  document.documentElement.style.setProperty('--grain',`url(${c.toDataURL()})`);
})();

/* ============================================================
   RENDERER / SCENE
   ============================================================ */
const frame = $('frame');
const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputEncoding = THREE.sRGBEncoding;
/* the scene is rendered LINEAR into a float buffer; the composite pass does
   ACES and the sRGB write, so no tone mapping happens in the material shaders */
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
frame.appendChild(renderer.domElement);
let POST_READY=false;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46,1,0.15,900);
const camRig = {pos:new THREE.Vector3(0,30,60), aim:new THREE.Vector3(0,0,0), fov:46};

/* the sky environment map does most of the ambient work now, so the
   hemisphere light is only a floor under it */
const hemi = new THREE.HemisphereLight(0xbcd8ff,0x40331f,0.30); scene.add(hemi);
const sun  = new THREE.DirectionalLight(0xfff0d0,2.6); sun.position.set(-52,74,44); scene.add(sun);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.near=1; sun.shadow.camera.far=230;
sun.shadow.bias=-0.0009; sun.shadow.normalBias=0.030;
scene.add(sun.target);
const rim  = new THREE.DirectionalLight(0x9fc8ff,0.30);  rim.position.set(35,20,-45); scene.add(rim);
const bulb = new THREE.PointLight(0xffb45a,0,70,1.6); bulb.position.set(0,14,0); scene.add(bulb);

let hudDirty=true;   // set on resize so the HUD re-lays out on the very next frame
function resize(){
  const st=document.body.classList.contains('reel');
  const W=innerWidth,H=innerHeight;
  let w=W,h=H;
  if(st){ h=Math.min(H,W*16/9); w=h*9/16; if(w>W){w=W;h=w*16/9;} }
  frame.style.width=w+'px'; frame.style.height=h+'px';
  hudDirty=true;
  document.body.classList.toggle('narrow', w<640);
  document.body.classList.toggle('short',  h<600);
  renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
  if(POST_READY) postResize();
}
addEventListener('resize',resize);
/* the window isn't the only thing that can change size — a docked panel or an
   embedded frame can resize underneath us without ever firing a window event */
if(window.ResizeObserver){
  let last=0;
  new ResizeObserver(()=>{
    const now=performance.now();
    if(now-last<60) return;           // resize() writes to #frame; don't chase our own tail
    last=now; resize();
  }).observe($('stage'));
}

/* ============================================================
   GEOMETRY KIT — vertex-coloured merged primitives
   ============================================================ */
const _v=new THREE.Vector3(), _q=new THREE.Quaternion(), _e=new THREE.Euler(), _s=new THREE.Vector3();
const _m=new THREE.Matrix4(), _m2=new THREE.Matrix4();

const G = {
  sph : new THREE.SphereGeometry(1,9,6),
  sphLo:new THREE.SphereGeometry(1,6,4),
  cyl : new THREE.CylinderGeometry(1,1,1,6),
  cone: new THREE.ConeGeometry(1,1,6),
  box : new THREE.BoxGeometry(1,1,1)
};

/** build a coloured, transformed, non-indexed piece */
function P(base,color,px,py,pz,rx,ry,rz,sx,sy,sz){
  let g = base.clone();
  _v.set(px,py,pz); _e.set(rx||0,ry||0,rz||0); _q.setFromEuler(_e); _s.set(sx,sy===undefined?sx:sy,sz===undefined?sx:sz);
  _m.compose(_v,_q,_s);
  g.applyMatrix4(_m);
  if(g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count, col = new Float32Array(n*3), c = new THREE.Color(color);
  c.convertSRGBToLinear();
  for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  if(g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function mergeAll(list){
  let total=0; for(const g of list) total+=g.attributes.position.count;
  const pos=new Float32Array(total*3), nor=new Float32Array(total*3), col=new Float32Array(total*3);
  let o=0;
  for(const g of list){
    pos.set(g.attributes.position.array,o*3);
    nor.set(g.attributes.normal.array,o*3);
    col.set(g.attributes.color.array,o*3);
    o+=g.attributes.position.count;
    g.dispose();
  }
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3));
  out.setAttribute('normal',  new THREE.BufferAttribute(nor,3));
  out.setAttribute('color',   new THREE.BufferAttribute(col,3));
  out.computeBoundingSphere();
  return out;
}

const MAT = new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.80,metalness:0.0});
const MAT_FLAT = new THREE.MeshBasicMaterial({vertexColors:true});
/* ground cover gets its own material so it can sway without touching the birds */
const GRASS_MAT = new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95,metalness:0.0});
GRASS_MAT.onBeforeCompile = sh => {
  sh.uniforms.uTime={value:0};
  GRASS_MAT.userData.u=sh.uniforms;
  sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>',
    `#include <begin_vertex>
     float sway = transformed.y*transformed.y*0.85;
     transformed.x += sin(uTime*1.7 + transformed.x*0.33 + transformed.z*0.19)*sway;
     transformed.z += cos(uTime*1.35 + transformed.z*0.27 - transformed.x*0.15)*sway*0.7;`);
};

/* ---------- the birds ---------- */
/* Attempted-realistic proportions executed entirely in spheres and cones.
   The eyes are deliberately one size too large. This is the whole joke. */
function buildBird(o){
  const F=o.feather, W=o.wingC||o.feather, T=o.tail, R=o.red, Y='#e8a423', K='#131118';
  const s=o.scale;
  const core=[
    // legs + feet
    P(G.cyl,Y, .085,.14,-.01, .1,0,0, .022,.28,.022),
    P(G.cyl,Y,-.085,.14,-.01, .1,0,0, .022,.28,.022),
    P(G.box,Y, .085,.015,.05, 0,0,0, .07,.03,.15),
    P(G.box,Y,-.085,.015,.05, 0,0,0, .07,.03,.15),
    // plump body
    P(G.sph,F, 0,.44,-.02, -.12,0,0, .30,.28,.40),
    P(G.sph,F, 0,.40,-.20, 0,0,0, .24,.22,.20),          // rump
    // neck
    P(G.cyl,F, 0,.65,.13, -.36,0,0, .095,.30,.085),
    P(G.sph,F, 0,.60,.07, 0,0,0, .13,.13,.13),           // neck base blend
    // head
    P(G.sph,F, 0,.83,.26, 0,0,0, .115,.115,.125),
    // beak (upper + lower, slightly ajar — permanently mid-scream)
    P(G.cone,Y, 0,.825,.40, 1.62,0,0, .055,.15,.045),
    P(G.cone,'#c98a1a', 0,.795,.39, 1.72,0,0, .045,.12,.035),
    // comb
    P(G.sphLo,R, 0,.925,.20, 0,0,0, .035*o.comb,.075*o.comb,.045*o.comb),
    P(G.sphLo,R, 0,.945,.26, 0,0,0, .035*o.comb,.085*o.comb,.045*o.comb),
    P(G.sphLo,R, 0,.935,.32, 0,0,0, .033*o.comb,.070*o.comb,.042*o.comb),
    // wattles
    P(G.sphLo,R, .035,.745,.345, 0,0,0, .030*o.comb,.055*o.comb,.028*o.comb),
    P(G.sphLo,R,-.035,.745,.345, 0,0,0, .030*o.comb,.055*o.comb,.028*o.comb),
    // EYES — too big, forward-set, wrong for a bird. correct for the internet.
    P(G.sphLo,'#fdfcf8', .078,.855,.315, 0,0,0, .052,.052,.046),
    P(G.sphLo,'#fdfcf8',-.078,.855,.315, 0,0,0, .052,.052,.046),
    P(G.sphLo,K, .086,.855,.348, 0,0,0, .030,.030,.022),
    P(G.sphLo,K,-.086,.855,.348, 0,0,0, .030,.030,.022),
  ];
  if(o.spur){ // gamecock leg spurs
    core.push(P(G.cone,'#f2e6c8', .115,.20,-.03, 1.2,0,-.5, .018,.11,.018));
    core.push(P(G.cone,'#f2e6c8',-.115,.20,-.03, 1.2,0, .5, .018,.11,.018));
  }
  const flap=[
    // wings
    P(G.sph,W, .215,.46,.02, 0,0,-.2, .055,.17,.27),
    P(G.sph,W,-.215,.46,.02, 0,0, .2, .055,.17,.27),
    // sickle tail fan
    P(G.cone,T, 0,.52,-.30, -.95+o.tailUp,0,0, .20*o.tailW,.52*o.tailL,.055),
    P(G.cone,T, .07,.50,-.29, -1.15+o.tailUp,0,.22, .12*o.tailW,.44*o.tailL,.05),
    P(G.cone,T,-.07,.50,-.29, -1.15+o.tailUp,0,-.22,.12*o.tailW,.44*o.tailL,.05),
  ];
  const gc=mergeAll(core), gf=mergeAll(flap);
  gc.scale(s,s,s); gf.scale(s,s,s);
  return {core:gc, flap:gf, pivot:new THREE.Vector3(0,.44*s,-.08*s)};
}

/* ---------- the raccoon ---------- */
function buildCoon(o){
  const GY=o.gy, DK=o.dk, LT=o.lt, K='#131118';
  const core=[
    // four legs, planted wide and low
    P(G.cyl,DK, .175,.16,.24, 0,0,0, .046,.32,.046),
    P(G.cyl,DK,-.175,.16,.24, 0,0,0, .046,.32,.046),
    P(G.cyl,DK, .175,.16,-.20, 0,0,0, .046,.32,.046),
    P(G.cyl,DK,-.175,.16,-.20, 0,0,0, .046,.32,.046),
    P(G.box,K, .175,.03,.28, 0,0,0, .10,.05,.16),
    P(G.box,K,-.175,.03,.28, 0,0,0, .10,.05,.16),
    P(G.box,K, .175,.03,-.24, 0,0,0, .10,.05,.16),
    P(G.box,K,-.175,.03,-.24, 0,0,0, .10,.05,.16),
    // long low body
    P(G.sph,GY, 0,.34,.02, 0,0,0, .25,.23,.46),
    P(G.sph,GY, 0,.36,-.30, 0,0,0, .21,.20,.20),
    P(G.sph,DK, 0,.30,-.34, 0,0,0, .19,.14,.16),   // dark haunch
    // head
    P(G.sph,GY, 0,.46,.44, 0,0,0, .17,.16,.17),
    // snout
    P(G.cone,LT, 0,.40,.58, 1.55,0,0, .085,.26,.075),
    P(G.sph,K, 0,.395,.70, 0,0,0, .033,.028,.028),
    // bandit mask
    P(G.sph,K, .085,.48,.545, 0,-.3,0, .075,.055,.035),
    P(G.sph,K,-.085,.48,.545, 0, .3,0, .075,.055,.035),
    P(G.box,K, 0,.50,.55, 0,0,0, .09,.035,.04),
    // eyes
    P(G.sphLo,'#f7e9c8', .085,.482,.560, 0,0,0, .040,.040,.032),
    P(G.sphLo,'#f7e9c8',-.085,.482,.560, 0,0,0, .040,.040,.032),
    P(G.sphLo,K, .090,.482,.585, 0,0,0, .024,.024,.018),
    P(G.sphLo,K,-.090,.482,.585, 0,0,0, .024,.024,.018),
    // ears
    P(G.cone,GY, .115,.58,.38, .1,0,.18, .072,.13,.05),
    P(G.cone,GY,-.115,.58,.38, .1,0,-.18,.072,.13,.05),
    P(G.cone,'#e9c6c9', .115,.585,.395, .1,0,.18, .042,.09,.03),
    P(G.cone,'#e9c6c9',-.115,.585,.395, .1,0,-.18,.042,.09,.03),
  ];
  // ringed tail, built as stacked segments arcing back and up
  const flap=[];
  for(let i=0;i<7;i++){
    const t=i/6, a=-0.55-t*0.55;
    const z=-0.46-t*0.52, y=0.34+t*0.30;
    flap.push(P(G.sph,(i%2?DK:GY), 0,y,z, a,0,0, .105-t*.045,.105-t*.04,.11));
  }
  const s=o.scale||1, gc=mergeAll(core), gf=mergeAll(flap);
  gc.scale(s,s,s); gf.scale(s,s,s);
  return {core:gc, flap:gf, pivot:new THREE.Vector3(0,.34*s,-.10*s)};
}

const COON_KITS=[
  {gy:'#8b8792',dk:'#2a2731',lt:'#c3bfc9',scale:1.00},
  {gy:'#77737e',dk:'#211e28',lt:'#b2aeb8',scale:1.06},
  {gy:'#9a95a2',dk:'#332f3b',lt:'#d0ccd6',scale:0.95},
];

/* ---------- bird species presets ---------- */
const BIRD_KITS = {
  hen:[
    {feather:'#c8b39a',wingC:'#b39d84',tail:'#8a745c',red:'#c2402f',comb:.55,tailUp:.55,tailW:.75,tailL:.55,scale:.90,spur:0},
    {feather:'#efe9dd',wingC:'#e2dbcc',tail:'#cfc6b4',red:'#c2402f',comb:.5, tailUp:.6, tailW:.7, tailL:.5, scale:.86,spur:0},
    {feather:'#4e4a55',wingC:'#3f3c46',tail:'#2e2c35',red:'#b83a2b',comb:.5, tailUp:.55,tailW:.75,tailL:.55,scale:.88,spur:0},
    {feather:'#8a5a33',wingC:'#7a4d2b',tail:'#5a3c22',red:'#c2402f',comb:.6, tailUp:.5, tailW:.8, tailL:.6, scale:.92,spur:0},
  ],
  rooster:[
    {feather:'#8f3a18',wingC:'#b25325',tail:'#1d2a20',red:'#d8342a',comb:1.15,tailUp:.28,tailW:1.15,tailL:1.05,scale:1.0,spur:0},
    {feather:'#22202a',wingC:'#33303d',tail:'#122018',red:'#e03a2c',comb:1.2, tailUp:.22,tailW:1.2, tailL:1.1, scale:1.02,spur:0},
    {feather:'#f2ece0',wingC:'#e4ddce',tail:'#d9d0bd',red:'#e03a2c',comb:1.1, tailUp:.3, tailW:1.1, tailL:1.0, scale:.99,spur:0},
    {feather:'#c98d22',wingC:'#e0a52c',tail:'#2b2418',red:'#d8342a',comb:1.25,tailUp:.25,tailW:1.2, tailL:1.15,scale:1.04,spur:0},
  ],
  gamecock:[
    {feather:'#b0341c',wingC:'#d94f24',tail:'#0f1a14',red:'#ff3b2a',comb:1.35,tailUp:.15,tailW:1.3,tailL:1.3,scale:1.10,spur:1},
    {feather:'#1a1822',wingC:'#2c2836',tail:'#0c140f',red:'#ff3b2a',comb:1.4, tailUp:.12,tailW:1.35,tailL:1.35,scale:1.12,spur:1},
    {feather:'#d9b23a',wingC:'#f0c94a',tail:'#1b1710',red:'#ff4632',comb:1.3, tailUp:.18,tailW:1.3,tailL:1.28,scale:1.08,spur:1},
    {feather:'#6d6f7a',wingC:'#83858f',tail:'#23252c',red:'#ff3b2a',comb:1.35,tailUp:.15,tailW:1.32,tailL:1.3,scale:1.11,spur:1},
  ]
};

/* ---------- combat stats ---------- */
const STATS = {
  hen      :{hp:42, dmg:2.2, rate:1.05,reach:1.15,speed:3.3,accel:9, nerve:0.26,cleave:1,mass:.9},
  rooster  :{hp:70, dmg:8.2, rate:0.74,reach:1.30,speed:3.9,accel:11,nerve:0.68,cleave:1,mass:1.0},
  gamecock :{hp:93, dmg:11.5,rate:0.66,reach:1.45,speed:4.4,accel:13,nerve:0.94,cleave:1,mass:1.1},
  coon     :{hp:545,dmg:27,  rate:0.72,reach:1.75,speed:4.15,accel:12,nerve:0.80,cleave:3,mass:2.6}
};
