/* ============================================================
   CHICKENS vs RACCOONS — a deeply unnecessary battle simulator
   ============================================================ */
'use strict';

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const lerp  = (a,b,t) => a+(b-a)*t;
const TAU   = Math.PI*2;

/* ============================================================
   TWO RANDOM STREAMS

   A shared seed has to reproduce a fight exactly, on any machine, at any
   frame rate. That only works if the numbers the simulation draws depend
   on nothing but the simulation itself — so the draws are split in two.

   SR() is the fight. It is advanced only inside the fixed-timestep sim
   step, so after N steps the state is identical everywhere.

   VR() is everything you merely look at: camera shake, blood spatter,
   music, clouds. It is drawn a different number of times on a fast
   machine than a slow one, which is exactly why it must never touch the
   sim's stream.
   ============================================================ */
function mulberry(seed){
  let a=seed>>>0;
  return function(){
    a=(a+0x6D2B79F5)|0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
let SR=mulberry((Math.random()*4294967296)>>>0);          // simulation
const VR=mulberry((Math.random()*4294967296)>>>0);        // cosmetic
function seedSim(n){ SR=mulberry(n>>>0); }
/* cosmetic helpers — anything that changes only how the fight looks */
const rnd   = (a,b) => a+VR()*(b-a);
const pick  = a => a[(VR()*a.length)|0];
/* simulation helpers — anything that changes who wins */
const srnd  = (a,b) => a+SR()*(b-a);
const spick = a => a[(SR()*a.length)|0];

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

/* Detail tiers. Every animal is built from these five primitives, so the
   segment counts here are the whole polygon budget. At a thousand-plus units
   nothing on screen is more than a few pixels across and the extra segments
   are pure cost — a rooster is under 5 metres tall on a 40 metre field.
   The instanced meshes are frustumCulled=false, so every unit is drawn every
   frame whether or not you can see it; that makes this the highest-leverage
   knob in the renderer. */
const G_TIER=[
  { sph:[1,9,6], sphLo:[1,6,4], cyl:[1,1,1,6], cone:[1,1,6] },   // 0 full
  { sph:[1,7,5], sphLo:[1,5,3], cyl:[1,1,1,5], cone:[1,1,5] },   // 1 crowded
  { sph:[1,5,4], sphLo:[1,4,3], cyl:[1,1,1,4], cone:[1,1,4] },   // 2 a mob
  { sph:[1,4,3], sphLo:[1,3,2], cyl:[1,1,1,3], cone:[1,1,3] }    // 3 a horde
];
const G = { box:new THREE.BoxGeometry(1,1,1) };
let DETAIL=-1;
function setDetail(level){
  level=clamp(level|0,0,G_TIER.length-1);
  if(level===DETAIL) return false;
  DETAIL=level;
  const t=G_TIER[level];
  ['sph','sphLo'].forEach(k=>{ G[k]=new THREE.SphereGeometry(...t[k]); });
  G.cyl =new THREE.CylinderGeometry(...t.cyl);
  G.cone=new THREE.ConeGeometry(...t.cone);
  return true;                       // caller must rebuild anything cached
}
setDetail(0);
/* How crowded is too crowded. These were far too generous: the classic
   preset — 1000 roosters against 100 raccoons, which is the fight most
   people actually play — landed at tier 1 and submitted 1.68M triangles a
   frame, more than a 2600-unit fight sitting at tier 2. The most-played
   preset was the most expensive one on the board.
   The thresholds are lower now because the thing they trade away is close to
   invisible. Field radius grows as sqrt(total), so a bird's size on screen
   falls off much more slowly than the count rises: at a thousand units a
   rooster is already a few dozen pixels, and the difference between a
   nine-segment sphere and a five-segment one at that size is nothing you can
   see. What you can see is the frame rate. */
function detailFor(total){ return total>2400?3:(total>900?2:(total>320?1:0)); }
/* …and once, at the whistle, used to be the only time it was ever asked. A
   fight that starts at four thousand ends at a few hundred, and the tier
   picked for the crowd was still on screen for the champion close-up and the
   verdict card — the two shots with the camera closest to an animal. It is
   asked again mid-scene now, against a load rather than a head count.

   A corpse is the same instance in the same mesh as a live bird and costs
   exactly the same triangles, so it cannot be ignored; but it is lying flat,
   it is behind the survivors, and nobody is looking at it. A third of a live
   one is what the field can honestly be re-measured with — at that weight
   every preset earns exactly one tier before the verdict and none earns two. */
const DEAD_WEIGHT=0.34;

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
  const animated=list.some(g=>g.attributes.animPart);
  const part=animated?new Float32Array(total*4):null;
  let o=0;
  for(const g of list){
    pos.set(g.attributes.position.array,o*3);
    nor.set(g.attributes.normal.array,o*3);
    col.set(g.attributes.color.array,o*3);
    if(part&&g.attributes.animPart) part.set(g.attributes.animPart.array,o*4);
    o+=g.attributes.position.count;
    g.dispose();
  }
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3));
  out.setAttribute('normal',  new THREE.BufferAttribute(nor,3));
  out.setAttribute('color',   new THREE.BufferAttribute(col,3));
  if(part) out.setAttribute('animPart',new THREE.BufferAttribute(part,4));
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

/* The animals themselves used to be built here out of these primitives, with
   a joint shader for the close-up ones. They are modelled, rigged and animated
   in Blender now — blender/animals.py — and drawn by 03b_skin.js. P(),
   mergeAll() and G still build the arena and the coop. */
