
/* ============================================================
   QUADRUPEDS — one parameterised builder covering dog, goat,
   donkey, llama, pig, cat, bull, fox, coyote, possum and bear.
   Same trick as the birds: primitives, baked vertex colour,
   merged into a "core" chunk and a "flap" chunk that swings
   about a pivot (here it's the tail and head bob).
   ============================================================ */
function buildQuad(o){
  const B=o.body, D=o.dark||o.body, L=o.legs||o.dark||o.body, M=o.muzzle||o.body,
        K='#131118', E=o.eye||'#f4e6c2';
  const s=o.scale||1;
  const bl=o.len||0.52, bh=o.high||0.42, bw=o.wide||0.24, lg=o.leg||0.34;
  const core=[];

  /* legs — front pair set slightly wider, as most of these are chest-heavy */
  const lx=bw*0.86, lz=bl*0.62, lr=o.legR||0.05;
  [[ lx,  lz],[-lx,  lz],[ lx*0.92, -lz],[-lx*0.92, -lz]].forEach((p,i)=>{
    core.push(P(G.cyl,L, p[0],lg*0.5,p[1], 0,0,0, lr,lg,lr));
    core.push(P(G.box,o.hoof||K, p[0],lg*0.06,p[1]+0.02, 0,0,0, lr*2.1,lg*0.16,lr*3.0));
  });

  /* barrel + chest + haunch */
  core.push(P(G.sph,B, 0,lg+bh*0.42,0,        0,0,0, bw,bh*0.5,bl));
  core.push(P(G.sph,B, 0,lg+bh*0.46,bl*0.52,  0,0,0, bw*0.94,bh*0.48,bl*0.34));
  core.push(P(G.sph,o.rump||B, 0,lg+bh*0.44,-bl*0.60, 0,0,0, bw*0.92,bh*0.46,bl*0.32));

  /* neck + head */
  const nk=o.neck||0.26, na=o.neckA===undefined?-0.55:o.neckA;
  const hx=0, hy=lg+bh*0.52+Math.cos(na)*nk*0.9, hz=bl*0.72+Math.sin(-na)*nk*0.9;
  core.push(P(G.cyl,B, 0,lg+bh*0.50+Math.cos(na)*nk*0.45, bl*0.66+Math.sin(-na)*nk*0.45,
    na,0,0, (o.neckR||0.10),nk,(o.neckR||0.10)*0.9));
  const hs=o.head||0.14;
  core.push(P(G.sph,B, hx,hy,hz, 0,0,0, hs,hs*0.92,hs*1.05));

  /* muzzle: cone for dog/fox, box for cattle, blunt for bear */
  const ml=o.snout===undefined?0.20:o.snout;
  if(ml>0.01){
    if(o.blunt) core.push(P(G.box,M, 0,hy-hs*0.25,hz+hs*0.72, 0,0,0, hs*1.05,hs*0.72,ml));
    else core.push(P(G.cone,M, 0,hy-hs*0.20,hz+hs*0.52, 1.55,0,0, hs*0.62,ml*1.5,hs*0.55));
    core.push(P(G.sph,K, 0,hy-hs*0.20,hz+hs*0.55+ml*1.05, 0,0,0, hs*0.20,hs*0.16,hs*0.14));
  }

  /* ears */
  const ey=hy+hs*0.72, ex=hs*0.62, ez=hz-hs*0.18;
  if(o.ear==='prick'){
    core.push(P(G.cone,B,  ex,ey,ez, .12,0, .22, hs*0.36,hs*0.86,hs*0.20));
    core.push(P(G.cone,B, -ex,ey,ez, .12,0,-.22, hs*0.36,hs*0.86,hs*0.20));
    core.push(P(G.cone,o.inner||'#e5b9bd',  ex,ey+hs*.03,ez+hs*.06, .12,0, .22, hs*0.20,hs*0.58,hs*0.11));
    core.push(P(G.cone,o.inner||'#e5b9bd', -ex,ey+hs*.03,ez+hs*.06, .12,0,-.22, hs*0.20,hs*0.58,hs*0.11));
  }else if(o.ear==='long'){                                   // donkey / llama
    core.push(P(G.cyl,B,  ex*0.8,ey+hs*0.55,ez, .1,0, .30, hs*0.20,hs*1.5,hs*0.13));
    core.push(P(G.cyl,B, -ex*0.8,ey+hs*0.55,ez, .1,0,-.30, hs*0.20,hs*1.5,hs*0.13));
    core.push(P(G.sph,o.inner||'#d8b2a8',  ex*0.8,ey+hs*1.15,ez+hs*.06, 0,0, .30, hs*0.11,hs*0.55,hs*0.06));
    core.push(P(G.sph,o.inner||'#d8b2a8', -ex*0.8,ey+hs*1.15,ez+hs*.06, 0,0,-.30, hs*0.11,hs*0.55,hs*0.06));
  }else if(o.ear==='flop'){                                   // pig / hound
    core.push(P(G.sph,D,  ex,ey-hs*0.18,ez, .2,0, .5, hs*0.16,hs*0.60,hs*0.34));
    core.push(P(G.sph,D, -ex,ey-hs*0.18,ez, .2,0,-.5, hs*0.16,hs*0.60,hs*0.34));
  }else{                                                      // round — bear, cat kitten-ish
    core.push(P(G.sph,B,  ex,ey,ez, 0,0,0, hs*0.30,hs*0.30,hs*0.14));
    core.push(P(G.sph,B, -ex,ey,ez, 0,0,0, hs*0.30,hs*0.30,hs*0.14));
  }

  /* horns */
  if(o.horn==='goat'){
    core.push(P(G.cone,'#c9bda0',  hs*0.38,ey+hs*0.42,ez-hs*0.30, -0.9,0, .25, hs*0.16,hs*1.25,hs*0.16));
    core.push(P(G.cone,'#c9bda0', -hs*0.38,ey+hs*0.42,ez-hs*0.30, -0.9,0,-.25, hs*0.16,hs*1.25,hs*0.16));
  }else if(o.horn==='bull'){
    core.push(P(G.cone,'#d9d2bd',  hs*0.85,ey+hs*0.12,ez, 0,0, 1.35, hs*0.19,hs*1.05,hs*0.19));
    core.push(P(G.cone,'#d9d2bd', -hs*0.85,ey+hs*0.12,ez, 0,0,-1.35, hs*0.19,hs*1.05,hs*0.19));
  }

  /* eyes — same oversized forward-set treatment as the birds */
  const eox=hs*0.52, eoy=hy+hs*0.14, eoz=hz+hs*0.62;
  core.push(P(G.sphLo,E,  eox,eoy,eoz, 0,0,0, hs*0.26,hs*0.26,hs*0.20));
  core.push(P(G.sphLo,E, -eox,eoy,eoz, 0,0,0, hs*0.26,hs*0.26,hs*0.20));
  core.push(P(G.sphLo,K,  eox*1.05,eoy,eoz+hs*0.13, 0,0,0, hs*0.15,hs*0.15,hs*0.10));
  core.push(P(G.sphLo,K, -eox*1.05,eoy,eoz+hs*0.13, 0,0,0, hs*0.15,hs*0.15,hs*0.10));

  /* markings */
  if(o.mask){ // fox/coyote/possum cheek flash, raccoon-ish
    core.push(P(G.sph,o.mask,  eox*1.1,eoy+hs*.08,eoz-hs*.10, 0,-.3,0, hs*0.34,hs*0.22,hs*0.14));
    core.push(P(G.sph,o.mask, -eox*1.1,eoy+hs*.08,eoz-hs*.10, 0, .3,0, hs*0.34,hs*0.22,hs*0.14));
  }
  if(o.bib) core.push(P(G.sph,o.bib, 0,lg+bh*0.30,bl*0.66, 0,0,0, bw*0.55,bh*0.30,bl*0.20));

  /* tail lives in the swinging chunk */
  const flap=[];
  const tz=-bl*0.80, ty=lg+bh*0.48;
  if(o.tail==='bush'){
    for(let i=0;i<5;i++){ const t=i/4;
      flap.push(P(G.sph,i>2&&o.tailTip?o.tailTip:(o.tailC||B),
        0,ty+t*0.10,tz-t*0.34, 0,0,0, 0.10-t*0.02,0.10-t*0.02,0.13)); }
  }else if(o.tail==='ring'){
    for(let i=0;i<6;i++){ const t=i/5;
      flap.push(P(G.sph,(i%2?D:B), 0,ty+t*0.16,tz-t*0.40, -0.5-t*0.4,0,0, 0.085-t*0.03,0.085-t*0.03,0.10)); }
  }else if(o.tail==='tuft'){
    flap.push(P(G.cyl,L, 0,ty,tz-0.06, -0.5,0,0, 0.026,0.26,0.026));
    flap.push(P(G.sph,o.tailC||D, 0,ty-0.14,tz-0.19, 0,0,0, 0.07,0.10,0.07));
  }else if(o.tail==='curl'){
    flap.push(P(G.cyl,B, 0,ty+0.06,tz-0.02, -1.1,0,0, 0.024,0.18,0.024));
    flap.push(P(G.sph,B, 0,ty+0.15,tz-0.10, 0,0,0, 0.05,0.05,0.05));
  }else if(o.tail==='stub'){
    flap.push(P(G.sph,o.tailC||B, 0,ty+0.03,tz-0.03, 0,0,0, 0.07,0.07,0.09));
  }
  /* every quadruped gets a little shoulder mass in the swinging chunk so the
     gait reads even when the tail is a stub */
  flap.push(P(G.sph,B, 0,lg+bh*0.55,bl*0.18, 0,0,0, bw*0.80,bh*0.26,bl*0.22));

  const gc=mergeAll(core), gf=mergeAll(flap);
  gc.scale(s,s,s); gf.scale(s,s,s);
  return {core:gc, flap:gf, pivot:new THREE.Vector3(0,(lg+bh*0.45)*s,-bl*0.25*s)};
}
