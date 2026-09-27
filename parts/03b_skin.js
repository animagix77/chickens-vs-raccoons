
/* ============================================================
   SKINNED ANIMALS — the Blender models, five thousand at a time
   ------------------------------------------------------------
   Every animal is modelled, rigged and animated in Blender
   (blender/animals.py -> blender/animals.blend) and exported into
   MODELS (parts/02d_models.js). Nothing here decides what an
   animal looks like; this only draws what Blender made.

   A skinned mesh per animal is out of the question at this count,
   so the skinning happens on the GPU from a texture:

   * Each animal is weighted rigidly — every vertex to exactly one
     bone — so a vertex needs one bone matrix, not a blend of four.
   * Every frame of every clip is baked, at load, into a small
     half-float texture per species: one row per frame, three texels
     (a 3x4 matrix) per bone. The clips are stored once per rig as
     bone rotations and the texture is built by walking each
     species' own skeleton, so a hen and a turkey share one walk.
   * Each instance carries four numbers: two row positions, a blend
     weight between them, and its colour variant. Rows are fractional
     and the texture filters linearly down its height, so the GPU
     interpolates between frames for free.
   * Colours are a per-vertex slot looked up in a per-variant palette,
     so all of a species' colour variants are one mesh and one draw.

   All of it is cosmetic. Nothing in here is read by the simulation
   and nothing in here draws from the seeded stream.
   ============================================================ */
const SKIN={};                 // by unit key, built on first use
const SKIN_LOD=[0,1,1,2];      // geometry detail tier -> model level of detail
const SKIN_PAL=16;             // colour slots per variant (matches the exporter's limit)
const SKIN_RIG={};

function b64bytes(s){
  const b=atob(s), u=new Uint8Array(b.length);
  for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i);
  return u;
}
/* float32 -> IEEE half, for the bone textures */
const _hf=new Float32Array(1), _hi=new Uint32Array(_hf.buffer);
function toHalf(v){
  _hf[0]=v; const x=_hi[0];
  const s=(x>>>16)&0x8000; let e=((x>>>23)&0xff)-112, m=x&0x7fffff;
  if(e<=0) return s;                                   // tiny -> signed zero
  if(e>=31) return s|0x7bff;                           // clamp to the largest finite half
  return s|((e<<10)+((m+0x1000)>>>13));      // add, so a rounding carry bumps the exponent
}

function skinRig(name){
  if(SKIN_RIG[name]) return SKIN_RIG[name];
  const R=MODELS.rigs[name], raw=b64bytes(R.q);
  const i16=new Int16Array(raw.buffer,raw.byteOffset,raw.byteLength>>1);
  const q=new Float32Array(i16.length);
  for(let i=0;i<i16.length;i++) q[i]=i16[i]/32767;
  return SKIN_RIG[name]={bones:R.bones, parent:R.parent, clips:R.clips, rows:R.rows, contact:R.contact, q};
}

/* the bone texture: walk the species' rest skeleton through every frame */
function skinBake(rig,head){
  const nb=rig.bones.length, rows=rig.rows, q=rig.q;
  /* WebGL2 filters half floats natively. A WebGL1 browser gets full floats,
     filtered if it can and snapped to the nearest frame if it cannot. */
  const gl2=renderer.capabilities.isWebGL2;
  const W=nb*3, out=gl2?new Uint16Array(W*rows*4):new Float32Array(W*rows*4), enc=gl2?toHalf:(v=>v);
  const G=new Float32Array(nb*12);                     // bone -> world, 3x4 row-major
  for(let r=0;r<rows;r++){
    for(let b=0;b<nb;b++){
      const o=(r*nb+b)*4, w=q[o], x=q[o+1], y=q[o+2], z=q[o+3];
      /* quaternion -> rotation, in the bone's frame (= game axes; see the exporter) */
      const r00=1-2*(y*y+z*z), r01=2*(x*y-w*z),   r02=2*(x*z+w*y),
            r10=2*(x*y+w*z),   r11=1-2*(x*x+z*z), r12=2*(y*z-w*x),
            r20=2*(x*z-w*y),   r21=2*(y*z+w*x),   r22=1-2*(x*x+y*y);
      const p=rig.parent[b], g=b*12;
      let tx=head[b*3], ty=head[b*3+1], tz=head[b*3+2];
      if(p<0){
        G[g]=r00;G[g+1]=r01;G[g+2]=r02;G[g+3]=tx;
        G[g+4]=r10;G[g+5]=r11;G[g+6]=r12;G[g+7]=ty;
        G[g+8]=r20;G[g+9]=r21;G[g+10]=r22;G[g+11]=tz;
      }else{
        tx-=head[p*3]; ty-=head[p*3+1]; tz-=head[p*3+2];
        const P=p*12;
        for(let i=0;i<3;i++){
          const a=G[P+i*4], c=G[P+i*4+1], d=G[P+i*4+2];
          G[g+i*4]  =a*r00+c*r10+d*r20;
          G[g+i*4+1]=a*r01+c*r11+d*r21;
          G[g+i*4+2]=a*r02+c*r12+d*r22;
          G[g+i*4+3]=a*tx+c*ty+d*tz+G[P+i*4+3];
        }
      }
    }
    /* skin = world * inverse(rest), and the rest pose is a pure translation */
    for(let b=0;b<nb;b++){
      const g=b*12, hx=head[b*3], hy=head[b*3+1], hz=head[b*3+2];
      for(let i=0;i<3;i++){
        const o=((r*W)+b*3+i)*4;
        const a=G[g+i*4], c=G[g+i*4+1], d=G[g+i*4+2];
        out[o]=enc(a); out[o+1]=enc(c); out[o+2]=enc(d);
        out[o+3]=enc(G[g+i*4+3]-(a*hx+c*hy+d*hz));
      }
    }
  }
  const tex=new THREE.DataTexture(out,W,rows,THREE.RGBAFormat,gl2?THREE.HalfFloatType:THREE.FloatType);
  const lin=gl2||!!renderer.extensions.get('OES_texture_float_linear');
  tex.magFilter=tex.minFilter=lin?THREE.LinearFilter:THREE.NearestFilter;
  tex.generateMipmaps=false; tex.flipY=false; tex.needsUpdate=true;
  return tex;
}

const SKIN_VS=`
attribute float aBone;
attribute float aSlot;
attribute vec4 aAnim;
uniform sampler2D uBones;
uniform vec2 uBoneTex;
mat4 boneRow(float row){
  float v=(row+0.5)/uBoneTex.y, du=1.0/uBoneTex.x, u=(aBone*3.0+0.5)*du;
  vec4 r0=texture2D(uBones,vec2(u,v)), r1=texture2D(uBones,vec2(u+du,v)), r2=texture2D(uBones,vec2(u+2.0*du,v));
  return mat4(r0.x,r1.x,r2.x,0.0, r0.y,r1.y,r2.y,0.0, r0.z,r1.z,r2.z,0.0, r0.w,r1.w,r2.w,1.0);
}
mat4 skinMat(){
  mat4 a=boneRow(aAnim.x);
  if(aAnim.z>0.001) a=a*(1.0-aAnim.z)+boneRow(aAnim.y)*aAnim.z;
  return a;
}
`;
function skinUniforms(sp,sh){
  sh.uniforms.uBones={value:sp.tex};
  sh.uniforms.uBoneTex={value:new THREE.Vector2(sp.texW,sp.texH)};
}
function skinMaterials(sp){
  const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.82,metalness:0.0,flatShading:true});
  m.onBeforeCompile=sh=>{
    skinUniforms(sp,sh);
    sh.uniforms.uPal={value:sp.pal};
    sh.vertexShader='uniform vec3 uPal['+(4*SKIN_PAL)+'];\n'+SKIN_VS+sh.vertexShader
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n mat4 bm=skinMat(); objectNormal=mat3(bm)*objectNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\n transformed=(bm*vec4(transformed,1.0)).xyz;')
      .replace('#include <color_vertex>','#include <color_vertex>\n vColor.xyz=uPal['+SKIN_PAL+'*int(aAnim.w+0.5)+int(aSlot+0.5)];');
  };
  m.customProgramCacheKey=()=>'skin-std';
  const d=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  d.onBeforeCompile=sh=>{
    skinUniforms(sp,sh);
    sh.vertexShader=SKIN_VS+sh.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\n transformed=(skinMat()*vec4(transformed,1.0)).xyz;');
  };
  d.customProgramCacheKey=()=>'skin-depth';
  sp.mat=m; sp.depth=d;
}

function skinSpecies(k){
  if(SKIN[k]) return SKIN[k];
  const M=MODELS.species[k], rig=skinRig(M.rig);
  const sp={k, M, rig, geo:[], nb:rig.bones.length};
  sp.tex=skinBake(rig,M.head); sp.texW=sp.nb*3; sp.texH=rig.rows;
  /* palettes, linear, one block of SKIN_PAL slots per variant */
  sp.pal=new Float32Array(4*SKIN_PAL*3);
  const c=new THREE.Color();
  M.var.forEach((v,vi)=>v.c.forEach((hex,si)=>{
    c.set(hex).convertSRGBToLinear();
    const o=(vi*SKIN_PAL+si)*3; sp.pal[o]=c.r; sp.pal[o+1]=c.g; sp.pal[o+2]=c.b;
  }));
  sp.scale=M.var.map(v=>v.s);
  if(typeof VARIANTS!=='undefined'&&M.var.length<VARIANTS[k])
    console.warn('model for '+k+' has '+M.var.length+' colour variants, the roster expects '+VARIANTS[k]);
  /* the clips this animal uses: [first row, frames, loops] */
  const C=rig.clips;
  sp.clip={idle:C.idle, walk:C.walk, run:C.run, flail:C.flail, flinch:C.flinch, die:C.die,
           atk:C[M.atk], fly:C.fly||C.walk, glide:C.glide||C.idle};
  sp.contact=rig.contact;
  /* stride: cycles per unit of gait phase, from hip height, so a bull's legs
     turn over slower than a hen's at the same speed */
  sp.gait=0.05/Math.max(0.12,M.hip);
  skinMaterials(sp);
  return SKIN[k]=sp;
}

function skinGeo(sp,lod){
  lod=Math.min(lod,sp.M.lod.length-1);
  if(sp.geo[lod]) return sp.geo[lod];
  const L=sp.M.lod[lod];
  const pb=b64bytes(L.p), p16=new Int16Array(pb.buffer,pb.byteOffset,pb.byteLength>>1);
  const pos=new Float32Array(L.n*3);
  for(let i=0;i<pos.length;i++) pos[i]=p16[i]*L.s;
  const bone=new Float32Array(L.n), slot=new Float32Array(L.n);
  const runs=b64bytes(L.a);
  for(let r=0,v=0;r<runs.length;r+=3) for(let j=0;j<runs[r];j++,v++){ bone[v]=runs[r+1]; slot[v]=runs[r+2]; }
  const gb=b64bytes(L.g), isl=new Uint16Array(gb.buffer,gb.byteOffset,gb.byteLength>>1);
  const ib=b64bytes(L.i), loc=L.w?new Uint16Array(ib.buffer,ib.byteOffset,ib.byteLength>>1):ib;
  const idx=new Uint16Array(L.t*3);
  for(let g=0,base=0,k=0;g<isl.length;g+=2){
    const nv=isl[g], nt=isl[g+1];
    for(let j=0;j<nt*3;j++,k++) idx[k]=loc[k]+base;
    base+=nv;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('aBone',new THREE.BufferAttribute(bone,1));
  geo.setAttribute('aSlot',new THREE.BufferAttribute(slot,1));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  geo.computeVertexNormals();
  return sp.geo[lod]=geo;
}

/* One species on the field: one instanced mesh, one draw, one shadow draw.
   When the crowd tier puts the species on a coarse mesh, a small second squad
   holds the finest mesh for the few animals nearest the camera (see
   selectHeroAnimals in 05_view.js), so a close-up is never of a horde model. */
class SkinSquad{
  constructor(k,max,heroPass=false){
    const sp=skinSpecies(k), lod=heroPass?0:(SKIN_LOD[DETAIL]||0), base=skinGeo(sp,lod);
    const g=new THREE.BufferGeometry();
    g.setIndex(base.index);
    ['position','normal','aBone','aSlot'].forEach(n=>g.setAttribute(n,base.attributes[n]));
    this.anim=new THREE.InstancedBufferAttribute(new Float32Array(max*4),4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAnim',this.anim);
    const im=new THREE.InstancedMesh(g,sp.mat,max);
    im.frustumCulled=false; im.castShadow=true;
    im.customDepthMaterial=sp.depth;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count=0; im.visible=false;     // never draw uninitialised instances
    scene.add(im);
    this.sp=sp; this.mesh=im; this.max=max; this.n=0;
    this.hero=(!heroPass&&lod>0)?new SkinSquad(k,24,true):null;
  }
  begin(){ this.n=0; if(this.hero) this.hero.begin(); }
  push(m,rowA,rowB,wB,v,hero){
    if(hero&&this.hero){ this.hero.push(m,rowA,rowB,wB,v); return; }
    const i=this.n++;
    if(i>=this.max) return;
    this.mesh.setMatrixAt(i,m);
    const a=this.anim.array, o=i*4;
    a[o]=rowA; a[o+1]=rowB; a[o+2]=wB; a[o+3]=v;
  }
  end(){
    const c=Math.min(this.n,this.max);
    this.mesh.count=c; this.mesh.visible=c>0;
    this.mesh.instanceMatrix.needsUpdate=true;
    this.anim.needsUpdate=true;
    if(this.hero) this.hero.end();
  }
  dispose(){
    if(this.hero) this.hero.dispose();
    scene.remove(this.mesh);
    this.mesh.dispose();
    /* the index and vertex buffers are shared with the cached base geometry;
       three re-uploads them for whichever squad next uses them */
    this.mesh.geometry.dispose();
  }
}

/* A single posed animal outside the crowd — the coop's protected hens. It has
   its own material so it can be tinted without tinting the whole species. */
function skinSingle(k,variant){
  const sp=skinSpecies(k), base=skinGeo(sp,0);
  const g=new THREE.BufferGeometry();
  g.setIndex(base.index);
  ['position','normal','aBone','aSlot'].forEach(n=>g.setAttribute(n,base.attributes[n]));
  const anim=new THREE.InstancedBufferAttribute(new Float32Array(4),4);
  anim.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aAnim',anim);
  const mat=sp.mat.clone();
  mat.onBeforeCompile=sp.mat.onBeforeCompile; mat.customProgramCacheKey=sp.mat.customProgramCacheKey;
  const mesh=new THREE.InstancedMesh(g,mat,1);
  mesh.frustumCulled=false; mesh.castShadow=true; mesh.customDepthMaterial=sp.depth;
  mesh.setMatrixAt(0,new THREE.Matrix4());
  const v=Math.min(variant|0,sp.scale.length-1);
  return {mesh, material:mat, sp,
    pose(rowA,rowB,wB){ anim.array[0]=rowA; anim.array[1]=rowB||0; anim.array[2]=wB||0; anim.array[3]=v; anim.needsUpdate=true; }};
}

/* position within a clip -> fractional texture row */
function clipRow(c,t){
  return c[0]+(c[2]?(t-Math.floor(t)):(t<0?0:(t>1?1:t)))*c[1];
}
