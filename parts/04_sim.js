
/* ============================================================
   AGENTS  (structure-of-arrays; thousands of these need to move)
   ============================================================ */
const MAXA=5200;
const A={
  x:new Float32Array(MAXA), z:new Float32Array(MAXA),
  vx:new Float32Array(MAXA), vz:new Float32Array(MAXA),
  hp:new Float32Array(MAXA), hpMax:new Float32Array(MAXA),
  yaw:new Float32Array(MAXA), cd:new Float32Array(MAXA),
  tgt:new Int32Array(MAXA), team:new Uint8Array(MAXA), vr:new Uint8Array(MAXA),
  kind:new Uint8Array(MAXA),        // index into UNITS
  st:new Uint8Array(MAXA),          // 0 fight  1 frenzy  2 dead
  kills:new Uint16Array(MAXA), name:new Array(MAXA),
  ph:new Float32Array(MAXA),        // gait phase
  dead:new Float32Array(MAXA),      // seconds since death
  panicT:new Float32Array(MAXA),
  hit:new Float32Array(MAXA),       // flinch timer
  fy:new Float32Array(MAXA),        // flight height
  rev:new Uint8Array(MAXA),         // possums: one free resurrection
  /* being launched: vertical speed, tumble angle and its rate, and who
     did it, so the landing can be credited to them */
  vy:new Float32Array(MAXA), tum:new Float32Array(MAXA),
  spin:new Float32Array(MAXA), lby:new Int32Array(MAXA),
  vt:new Float32Array(MAXA),        // when this one last used its voice
  cyc:new Float32Array(MAXA)        // fliers: where they are in the soar cycle
};
let N=0;
let aliveA=0, aliveB=0, initA=0, initB=0, panicCount=0;
let SQUADS=[], KIT_PIV=[], ROSTER_USED=[];

/* ---------- spatial hash ---------- */
const CS=2.4;
let gridW=1, cellCount=1;
let cCount=new Int32Array(4), cItems=new Int32Array(MAXA), cCursor=new Int32Array(4);
function gridInit(){
  gridW=Math.max(4,Math.ceil((ARENA_R*2+24)/CS));
  cellCount=gridW*gridW;
  cCount=new Int32Array(cellCount+1);
  cCursor=new Int32Array(cellCount+1);
}
function cellOf(x,z){
  const gx=clamp(((x+ARENA_R+12)/CS)|0,0,gridW-1);
  const gz=clamp(((z+ARENA_R+12)/CS)|0,0,gridW-1);
  return gz*gridW+gx;
}
function gridBuild(){
  cCount.fill(0);
  for(let i=0;i<N;i++){ if(A.st[i]===2) continue; cCount[cellOf(A.x[i],A.z[i])+1]++; }
  for(let i=0;i<cellCount;i++) cCount[i+1]+=cCount[i];
  cCursor.set(cCount);
  for(let i=0;i<N;i++){ if(A.st[i]===2) continue; cItems[cCursor[cellOf(A.x[i],A.z[i])]++]=i; }
}

const KIT_CACHE={};
function kitCache(k,fn){ if(!KIT_CACHE[k]) KIT_CACHE[k]=fn(); return KIT_CACHE[k]; }

/* ============================================================
   THE COMMANDER — four things you can do while it is happening
   ============================================================ */
const CMD={
  horn:0, light:0, feedT:0, feedX:0, feedZ:0,
  cd:{horn:0,light:0,feed:0}, pts:0, ptAcc:0
};
const CMD_DEF=[
  {k:'horn', name:'Sound the horn', key:'1', cool:16, dur:6.0, hint:'Every animal you own moves and swings faster'},
  {k:'feed', name:'Scatter feed',   key:'2', cool:14, dur:7.0, hint:'Birds converge on the pile and hold their nerve'},
  {k:'light',name:'Floodlight',     key:'3', cool:18, dur:5.5, hint:'Predators flinch, hit softer and swing slower'}
];
/* reinforcements are no longer chosen up front — you call them in as it happens,
   paying out of a pool that fills while the fight is going badly for someone */
const DEPLOY=[
  {k:'guinea',  n:8, cost:8},
  {k:'goose',   n:6, cost:12},
  {k:'turkey',  n:5, cost:12},
  {k:'cat',     n:6, cost:14},
  {k:'capybara',n:2, cost:16},
  {k:'goat',    n:3, cost:20},
  {k:'pig',     n:2, cost:20},
  {k:'llama',   n:2, cost:24},
  {k:'donkey',  n:1, cost:26},
  {k:'dog',     n:1, cost:28},
  {k:'bull',    n:1, cost:44}
];
const PTS_START=16, PTS_RATE=1/0.95, PTS_CAP=80;
const CAP_T=125;   /* the referee calls it at 120s — this is the spending ceiling */
function cmdReady(k){ return BATTLE.running && !BATTLE.over && CMD.cd[k]<=0; }
function canDeploy(d){ return BATTLE.running && !BATTLE.over && CMD.pts>=d.cost; }
function deploy(d){
  if(!canDeploy(d)) return false;
  CMD.pts-=d.cost;
  const u=UNITS[UI_[d.k]];
  if(!SQUADS[u.i]) return false;
  const base=Math.atan2(TC.az,TC.ax)||-1.57;
  for(let i=0;i<d.n;i++){
    const a=base+srnd(-0.30,0.30), r=ARENA_R*srnd(0.86,0.95);
    const j=addAgent(Math.cos(a)*r,Math.sin(a)*r,u.i,(SR()*KIT_PIV[u.i].length)|0);
    A.yaw[j]=Math.atan2(-A.x[j],-A.z[j]);
    aliveA++; initA++;
    spawnPuff(A.x[j],0.2,A.z[j],0.3);
  }
  /* they arrive making their own noise — a pack of dogs should sound like a
     pack of dogs, not a generic whoosh. Stagger so it reads as several animals
     rather than one loud one. */
  const vc=u.voice||(u.build==='bird'?'cackle':'growl');
  const voices=Math.min(d.n,4);
  for(let i=0;i<voices;i++)
    setTimeout(()=>sfx(vc,TC.ax+srnd(-2,2),TC.az+srnd(-2,2),'cry'),i*srnd(90,240));
  killFeedRaw('<b>'+(d.n>1?d.n+' ':'')+u.label.toUpperCase()+'</b> joined the line');
  return true;
}
function cmdFire(k){
  if(!cmdReady(k)) return false;
  const d=CMD_DEF.find(c=>c.k===k);
  if(k==='horn'){ CMD.horn=d.dur; sting('go'); }
  if(k==='light'){ CMD.light=d.dur; sfx('spur',BATTLE.cx,BATTLE.cz); }
  if(k==='feed'){
    CMD.feedT=d.dur; CMD.feedX=BATTLE.cx+srnd(-4,4); CMD.feedZ=BATTLE.cz+srnd(-4,4);
    for(let i=0;i<26;i++) spawnPuff(CMD.feedX+srnd(-1.4,1.4),0.15,CMD.feedZ+srnd(-1.4,1.4),0.22);
    sfx('buk',CMD.feedX,CMD.feedZ);
  }
  CMD.cd[k]=d.cool||1e9;
  return true;
}
function cmdStep(dt){
  CMD.horn=Math.max(0,CMD.horn-dt);
  CMD.light=Math.max(0,CMD.light-dt);
  CMD.feedT=Math.max(0,CMD.feedT-dt);
  for(const k in CMD.cd) CMD.cd[k]=Math.max(0,CMD.cd[k]-dt);
  if(BATTLE.running&&!BATTLE.over){
    CMD.ptAcc+=dt*PTS_RATE;
    while(CMD.ptAcc>=1){ CMD.ptAcc-=1; CMD.pts=Math.min(PTS_CAP,CMD.pts+1); }
  }
  if(CMD.feedT>0 && SR()<dt*8) spawnPuff(CMD.feedX+srnd(-1,1),0.12,CMD.feedZ+srnd(-1,1),0.16);
}
function cmdReset(){
  CMD.horn=CMD.light=CMD.feedT=0;
  CMD.pts=PTS_START; CMD.ptAcc=0;
  for(const k in CMD.cd) CMD.cd[k]=0;
}

/* ============================================================
   SPAWNING — roster is a list of {k:'rooster', n:1000}
   ============================================================ */
function spawnRoster(list,night){
  N=0; aliveA=0; aliveB=0; initA=0; initB=0; panicCount=0;
  const rows=list.filter(r=>r.n>0);
  let total=0; rows.forEach(r=>total+=r.n);
  total=Math.max(1,total);

  /* pick the polygon budget before any kit gets built, and throw away the
     cached kits if the tier moved — they bake the primitives in at build time */
  if(setDetail(detailFor(total))){
    for(const k in KIT_CACHE) delete KIT_CACHE[k];
  }

  const R=clamp(Math.sqrt(total*3.4/Math.PI)+10, 20, 78);
  buildArena(R,night); gridInit();

  sun.castShadow = total<=1900;
  const ms = total<=1500?4096:2048;
  if(sun.shadow.mapSize.x!==ms){
    sun.shadow.mapSize.set(ms,ms);
    if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; }
  }

  /* rebuild only the squads this fight actually needs */
  SQUADS.forEach(s=>s&&s.dispose());
  SQUADS=new Array(UNITS.length).fill(null);
  KIT_PIV=new Array(UNITS.length).fill(null);
  ROSTER_USED=rows.map(r=>r.k);

  /* every callable reinforcement needs a squad standing by, even at zero */
  const need={}; rows.forEach(r=>need[r.k]=(need[r.k]||0)+r.n);
  /* the worst case is a player who spends every point of the war chest on one
     packet all match, so size each standby squad for exactly that */
  const purse=PTS_START+CAP_T*PTS_RATE;
  DEPLOY.forEach(d=>{ need[d.k]=(need[d.k]||0)+Math.ceil(purse/d.cost)*d.n; });
  for(const k in need){
    const u=UNITS[UI_[k]];
    const kits=kitCache(u.kit,KITS[u.kit]);
    SQUADS[u.i]=new Squad(kits,Math.max(2,need[k]+4));
    KIT_PIV[u.i]=kits.map(kk=>({y:kk.pivot.y,z:kk.pivot.z}));
  }
  for(const row of rows){
    const u=UNITS[UI_[row.k]];
    const kits=KIT_PIV[u.i];
    /* team 0 forms a broad arc on -Z, team 1 a wedge on +Z */
    for(let i=0;i<row.n;i++){
      const t=row.n<2?0.5:i/(row.n-1);
      let a,r;
      if(u.team===0){ a=lerp(-2.30,-0.86,t)+srnd(-.14,.14); r=lerp(R*0.28,R*0.88,Math.sqrt(SR())); }
      else          { a=srnd(0.52,2.10);                      r=lerp(R*0.40,R*0.86,Math.sqrt(SR())); }
      addAgent(Math.cos(a)*r,Math.sin(a)*r,u.i,(SR()*kits.length)|0);
      if(u.team===0){ aliveA++; initA++; } else { aliveB++; initB++; }
    }
  }
  for(let i=0;i<N;i++) A.yaw[i]=Math.atan2(-A.x[i],-A.z[i])+srnd(-.3,.3);
  /* Nothing may survive from the previous fight. Anything left over shifts
     when the morale tick lands, and because that tick draws from the seeded
     stream, a stale timer is enough to make the same seed play out
     differently the second time you run it. */
  moraleTimer=0; recentKills=0; moraleMul=1;
  BATTLE.totalKills=0; BATTLE.champ=-1; BATTLE.routed=0;
  BATTLE.deathsWindow=0; BATTLE.windowT=0;
  BATTLE.hotX=0; BATTLE.hotZ=0; BATTLE.hotN=0; BATTLE.hsx=0; BATTLE.hsz=0;
  BATTLE.cx=0; BATTLE.cz=0;
  TC.lead[0]=TC.lead[1]=0;
  BATTLE.conSeen=0; BATTLE.conAge=9; BATTLE.conN=0;
  enemyCentroids();
  cmdReset();
}
function addAgent(x,z,kindIdx,vr){
  const u=UNITS[kindIdx], i=N++;
  if(i>=MAXA) { N=MAXA; return MAXA-1; }
  A.x[i]=x; A.z[i]=z; A.vx[i]=0; A.vz[i]=0;
  A.hp[i]=A.hpMax[i]=u.hp*srnd(.9,1.12);
  A.cd[i]=srnd(0,.5); A.tgt[i]=-1; A.team[i]=u.team; A.vr[i]=vr; A.kind[i]=kindIdx;
  A.st[i]=0; A.kills[i]=0; A.name[i]=null;
  A.ph[i]=SR()*TAU; A.dead[i]=0; A.panicT[i]=0; A.hit[i]=0;
  A.fy[i]=u.fly||0; A.rev[i]=u.playDead?1:0;
  A.vy[i]=0; A.tum[i]=0; A.spin[i]=0; A.lby[i]=-1; A.vt[i]=-9;
  A.cyc[i]=SR()*9;                  // stagger them so they don't dive as one
  return i;
}

/* ============================================================
   BATTLE STATE
   ============================================================ */
const BATTLE={
  running:false, t:0, over:false, winner:'', timeScale:1, slowT:0,
  deathsWindow:0, windowT:0, cx:0, cz:0, hotX:0, hotZ:0, hotN:0, hsx:0, hsz:0,
  conX:0, conZ:0, conN:0, conAge:9, conSeen:0,
  champ:-1, totalKills:0, routed:0
};
let moraleMul=1, recentKills=0, moraleTimer=0;

function centroidUpdate(){
  let sx=0,sz=0,n=0;
  for(let i=0;i<N;i++){ if(A.st[i]===2) continue; sx+=A.x[i]; sz+=A.z[i]; n++; }
  if(n){ BATTLE.cx=sx/n; BATTLE.cz=sz/n; }
}
let ecx=[0,0], ecz=[0,0];
/* a/b = centre of each army, af/bf = the front rank — where the army is
   pointed, which is what you want to look at rather than the middle of a crowd */
const TC={ax:0,az:0,bx:0,bz:0,afx:0,afz:0,bfx:0,bfz:0,lead:[0,0]};
function enemyCentroids(){
  let ax=0,az=0,an=0,bx=0,bz=0,bn=0;
  for(let i=0;i<N;i++){
    if(A.st[i]===2) continue;
    if(A.team[i]===0){ax+=A.x[i];az+=A.z[i];an++;} else {bx+=A.x[i];bz+=A.z[i];bn++;}
  }
  if(an){TC.ax=ax/an;TC.az=az/an;} if(bn){TC.bx=bx/bn;TC.bz=bz/bn;}
  ecx[0]=TC.bx; ecz[0]=TC.bz;
  ecx[1]=TC.ax; ecz[1]=TC.az;

  /* how far the leading edge sits ahead of the centre, along the axis each army
     faces. Smoothed, because the single furthest bird jitters every frame. */
  const dax=TC.bx-TC.ax, daz=TC.bz-TC.az, dl=Math.hypot(dax,daz)||1;
  const ux=dax/dl, uz=daz/dl;
  let leadA=0, leadB=0;
  for(let i=0;i<N;i++){
    if(A.st[i]===2) continue;
    if(A.team[i]===0){ const d=(A.x[i]-TC.ax)*ux+(A.z[i]-TC.az)*uz; if(d>leadA) leadA=d; }
    else            { const d=(TC.bx-A.x[i])*ux+(TC.bz-A.z[i])*uz; if(d>leadB) leadB=d; }
  }
  TC.lead[0]=lerp(TC.lead[0],leadA,0.06);
  TC.lead[1]=lerp(TC.lead[1],leadB,0.06);
  const fa=TC.lead[0]*0.72, fb=TC.lead[1]*0.72;   // just short of the very front
  TC.afx=TC.ax+ux*fa; TC.afz=TC.az+uz*fa;
  TC.bfx=TC.bx-ux*fb; TC.bfz=TC.bz-uz*fb;
}

/* ============================================================
   MAIN SIM STEP
   ============================================================ */
function stepSim(dt){
  gridBuild(); enemyCentroids(); cmdStep(dt);
  const cells=[-1,0,1];
  let hotBestN=0, hotX=0, hotZ=0;
  /* the densest point is almost always deep inside the bird mass, which is not
     where the fight is. Track the centroid of everyone actually in contact with
     the other side — that's the front, and it's what the camera should watch. */
  let conX=0, conZ=0, conN=0;

  for(let i=0;i<N;i++){
    if(airborne(i,dt)) continue;      // nothing steers or swings mid-flight
    if(A.st[i]===2){ A.dead[i]+=dt; if(A.rev[i]===2) reviveCheck(i,dt); continue; }

    const mine=UNITS[A.kind[i]];
    const isAlly=mine.team===0;
    const hasted=(isAlly&&CMD.horn>0)?1:0;
    const dimmed=(!isAlly&&CMD.light>0)?1:0;
    A.cd[i]-=dt*(hasted?1.35:1)*(dimmed?(1-0.35*floodPower()):1);
    A.hit[i]=Math.max(0,A.hit[i]-dt);
    const wasHigh=A.fy[i]>SKY_LINE;
    const diving=mine.fly?flierStep(i,mine,dt):false;
    if(mine.soar&&wasHigh&&A.fy[i]<=SKY_LINE) sfx('stoop',A.x[i],A.z[i],'cry');
    /* high and circling: no target, no attack, and nothing can touch it */
    if(mine.fly&&!diving&&A.fy[i]>SKY_LINE){ A.tgt[i]=-1; A.cd[i]=Math.max(A.cd[i],.25); }

    /* ---------- retarget ---------- */
    let tg=A.tgt[i];
    if(tg>=0 && (A.st[tg]===2 || A.team[tg]===A.team[i] || outOfReach(tg,mine))) tg=-1;
    if(tg<0 || ((i+((BATTLE.t*20)|0))&15)===0){
      let best=-1,bd=1e9;
      const gx=clamp(((A.x[i]+ARENA_R+12)/CS)|0,0,gridW-1);
      const gz=clamp(((A.z[i]+ARENA_R+12)/CS)|0,0,gridW-1);
      for(let ring=1;ring<=2 && best<0;ring++){
        for(let dz=-ring;dz<=ring;dz++)for(let dx=-ring;dx<=ring;dx++){
          if(ring>1 && Math.abs(dx)<ring && Math.abs(dz)<ring) continue;
          const cx2=gx+dx, cz2=gz+dz;
          if(cx2<0||cz2<0||cx2>=gridW||cz2>=gridW) continue;
          const c=cz2*gridW+cx2;
          for(let k=cCount[c];k<cCount[c+1];k++){
            const j=cItems[k];
            if(A.team[j]===A.team[i]||A.st[j]===2) continue;
            if(outOfReach(j,mine)) continue;                // still out of reach
            const d=(A.x[j]-A.x[i])**2+(A.z[j]-A.z[i])**2;
            if(d<bd){bd=d;best=j;}
          }
        }
      }
      tg=best;
    }
    A.tgt[i]=tg;

    /* ---------- desired heading ---------- */
    let desX,desZ,spd=mine.speed*(hasted?1.28:1);
    if(A.st[i]===1){ A.panicT[i]-=dt; if(A.panicT[i]<=0){ A.st[i]=0; panicCount--; } }

    /* scattered feed pulls birds in and steadies them */
    let fed=false;
    if(isAlly && CMD.feedT>0 && mine.build==='bird'){
      const fx=CMD.feedX-A.x[i], fz=CMD.feedZ-A.z[i], fd=Math.hypot(fx,fz);
      if(fd<16 && fd>1.6 && (tg<0 || fd<7)){ desX=fx/fd; desZ=fz/fd; fed=true; }
    }

    if(!fed && tg>=0){
      const dx2=A.x[tg]-A.x[i], dz2=A.z[tg]-A.z[i];
      const dist=Math.hypot(dx2,dz2)||1e-4;
      desX=dx2/dist; desZ=dz2/dist;
      const reach=mine.reach+UNITS[A.kind[tg]].rad*0.5;
      if(dist<reach){
        spd*=mine.ranged?0.02:0.12;
        if(A.cd[i]<=0) attack(i,tg,mine,dist);
      }else if(dist<reach*2.2) spd*=0.82;
      if(A.st[i]===1){
        spd*=1.20;
        const wob=Math.sin(BATTLE.t*6.5+i*1.7)*0.6;
        desX+=-desZ*wob; desZ+=desX*wob;
      }
    }else if(!fed){
      const fx=ecx[A.team[i]]-A.x[i], fz=ecz[A.team[i]]-A.z[i];
      const l=Math.hypot(fx,fz)||1; desX=fx/l; desZ=fz/l;
    }

    /* ---------- separation ---------- */
    let sx=0,sz=0;
    const gx=clamp(((A.x[i]+ARENA_R+12)/CS)|0,0,gridW-1);
    const gz=clamp(((A.z[i]+ARENA_R+12)/CS)|0,0,gridW-1);
    let localN=0, touching=0;
    const myR=mine.rad;
    for(let a=0;a<3;a++)for(let b=0;b<3;b++){
      const cx2=gx+cells[a], cz2=gz+cells[b];
      if(cx2<0||cz2<0||cx2>=gridW||cz2>=gridW) continue;
      const c=cz2*gridW+cx2;
      for(let k=cCount[c];k<cCount[c+1];k++){
        const j=cItems[k]; if(j===i) continue;
        const ox=A.x[i]-A.x[j], oz=A.z[i]-A.z[j];
        const d2=ox*ox+oz*oz;
        const rad=(myR+UNITS[A.kind[j]].rad)*0.5;
        if(d2<rad*rad && d2>1e-6){
          const d=Math.sqrt(d2), w=(rad-d)/rad;
          sx+=ox/d*w; sz+=oz/d*w;
        }
        if(d2<9) localN++;
        if(d2<7.3 && A.team[j]!==A.team[i]) touching=1;
      }
    }
    if(localN>hotBestN){ hotBestN=localN; hotX=A.x[i]; hotZ=A.z[i]; }
    if(touching){ conX+=A.x[i]; conZ+=A.z[i]; conN++; }

    const sepW=1.6+myR*0.9;
    desX+=sx*sepW; desZ+=sz*sepW;
    const dl=Math.hypot(desX,desZ)||1;
    desX=desX/dl*spd; desZ=desZ/dl*spd;

    const ac=mine.accel*dt;
    A.vx[i]+=clamp(desX-A.vx[i],-ac,ac);
    A.vz[i]+=clamp(desZ-A.vz[i],-ac,ac);
    A.x[i]+=A.vx[i]*dt; A.z[i]+=A.vz[i]*dt;

    const rr=Math.hypot(A.x[i],A.z[i]), lim=ARENA_R-0.9;
    if(rr>lim){ const k=lim/rr; A.x[i]*=k; A.z[i]*=k; A.vx[i]*=0.3; A.vz[i]*=0.3; }

    const sp=Math.hypot(A.vx[i],A.vz[i]);
    if(sp>0.05){
      const want=Math.atan2(A.vx[i],A.vz[i]);
      let d=want-A.yaw[i];
      while(d>Math.PI)d-=TAU; while(d<-Math.PI)d+=TAU;
      A.yaw[i]+=d*Math.min(1,12*dt);
    }else if(tg>=0){
      const want=Math.atan2(A.x[tg]-A.x[i],A.z[tg]-A.z[i]);
      let d=want-A.yaw[i];
      while(d>Math.PI)d-=TAU; while(d<-Math.PI)d+=TAU;
      A.yaw[i]+=d*Math.min(1,9*dt);
    }
    A.ph[i]+=dt*(4.5+sp*3.4);
  }

  BATTLE.hotX=hotX; BATTLE.hotZ=hotZ; BATTLE.hotN=hotBestN;
  /* hold the last contact point for a moment after the lines separate, so a
     one-frame gap in the melee doesn't fling the camera back into the flock */
  BATTLE.conN=conN;
  if(conN){ BATTLE.conX=conX/conN; BATTLE.conZ=conZ/conN; BATTLE.conAge=0; BATTLE.conSeen=1; }
  else BATTLE.conAge+=dt;
  moraleTimer-=dt;
  if(moraleTimer<=0){ moraleTimer=0.45; moraleTick(); }
  centroidUpdate();
}

const CALM_MAX=24;
const CALM_X=new Float32Array(CALM_MAX), CALM_Z=new Float32Array(CALM_MAX),
      CALM_R=new Float32Array(CALM_MAX), CALM_S=new Float32Array(CALM_MAX);
function moraleTick(){
  const fracA=initA?aliveA/initA:1, fracB=initB?aliveB/initB:1;
  const nightMul=NIGHT?2.35:1;
  /* anything frightening on the field makes the other side jumpy */
  let fearA=0, fearB=0;
  for(let i=0;i<N;i++){ if(A.st[i]===2) continue;
    const f=UNITS[A.kind[i]].fear; if(f){ if(A.team[i]===0) fearB+=f; else fearA+=f; } }
  fearA=clamp(fearA/60,0,0.7); fearB=clamp(fearB/60,0,0.7);
  /* guinea fowl steady whoever is standing near them */
  let rallied=CMD.feedT>0?0.35:0;
  for(let i=0;i<N;i++){ if(A.st[i]===2) continue;
    const u=UNITS[A.kind[i]]; if(u.rally) rallied=Math.max(rallied,u.rally[1]*0.35); }
  /* capybaras don't fight, they just refuse to be worried, and birds standing
     near one hold. A real herd works this way — the calm ones are the reason
     the rest don't scatter. Radius-based, so where you drop it matters. */
  let calmN=0;
  for(let i=0;i<N;i++){ if(A.st[i]===2) continue;
    const u=UNITS[A.kind[i]]; if(!u.calm) continue;
    CALM_X[calmN]=A.x[i]; CALM_Z[calmN]=A.z[i];
    CALM_R[calmN]=u.calm[0]*u.calm[0]; CALM_S[calmN]=u.calm[1];
    if(++calmN>=CALM_MAX) break; }

  for(let i=0;i<N;i++){
    if(A.st[i]===2||A.st[i]===1) continue;
    const u=UNITS[A.kind[i]];
    if(u.boss) continue;
    const isAlly=u.team===0;
    const frac=isAlly?fracA:fracB;
    const pressure=(1-frac)*(isAlly?nightMul:1);
    const wounded=1-A.hp[i]/A.hpMax[i];
    const scared=isAlly?fearA:fearB;
    let steady=isAlly?rallied:0;
    if(isAlly&&calmN){
      for(let c=0;c<calmN;c++){
        const dx=A.x[i]-CALM_X[c], dz=A.z[i]-CALM_Z[c];
        if(dx*dx+dz*dz<CALM_R[c]){ steady=Math.max(steady,CALM_S[c]); break; }
      }
    }
    let p=(1-clamp(u.nerve+steady,0,1))*(pressure*0.85+wounded*0.5+scared)*0.42;
    if(isAlly && aliveB>0 && aliveA/Math.max(1,aliveB)<3) p*=1.5;
    if(SR()<p){ A.st[i]=1; A.panicT[i]=srnd(2.6,6.5); panicCount++;
      if(isAlly&&SR()<0.05) sfx('cackle',A.x[i],A.z[i]); }
  }
}

/* ============================================================
   VIOLENCE
   ============================================================ */
function attack(i,tg,mine,dist){
  const wild=A.st[i]===1?1.28:1;
  /* a floodlight blinds a raccoon at midnight and barely troubles one at
     noon, so the strength follows the arena rather than being flat */
  const dimmed=(mine.team===1&&CMD.light>0)?(1-0.45*floodPower()):1;
  A.cd[i]=mine.rate*srnd(.82,1.2)*wild;
  let dmg=mine.dmg*srnd(.8,1.25)/wild*dimmed*(CMD.horn>0&&mine.team===0?1.15:1);
  let crit=false;
  if(mine.crit && SR()<mine.crit[0]){ dmg*=mine.crit[1]; crit=true; }
  if(mine.pack){                                   // coyotes hit harder in company
    let n=0; for(let k=cCount[cellOf(A.x[i],A.z[i])];k<cCount[cellOf(A.x[i],A.z[i])+1];k++){
      const j=cItems[k]; if(A.kind[j]===A.kind[i]&&j!==i) n++; }
    dmg*=1+Math.min(n,4)*0.12;
  }

  hurt(tg,dmg,i,crit);
  if(mine.shove) shove(tg,A.x[tg]-A.x[i],A.z[tg]-A.z[i],mine.shove);

  /* A wide swing. sweep is [radius, targets, throw force, lift]; without it a
     unit just cleaves. The cell scan is sized from the radius — it used to be
     a fixed 3x3 block, which for a bear meant searching about 3.6 metres for
     targets up to 4.6 metres away, so most of the arc was silently ignored
     and the biggest animal on the field looked harmless. */
  const sw=mine.sweep;
  const cr=sw?sw[0]:(mine.cleave>1?mine.reach*1.5:0);
  if(cr>0){
    let extra=sw?sw[1]:mine.cleave-1;
    const span=Math.max(1,Math.ceil(cr/CS));
    const gx=clamp(((A.x[i]+ARENA_R+12)/CS)|0,0,gridW-1);
    const gz=clamp(((A.z[i]+ARENA_R+12)/CS)|0,0,gridW-1);
    const cr2=cr*cr;
    for(let a=-span;a<=span && extra>0;a++)for(let b=-span;b<=span && extra>0;b++){
      const cx2=gx+a,cz2=gz+b;
      if(cx2<0||cz2<0||cx2>=gridW||cz2>=gridW) continue;
      const c=cz2*gridW+cx2;
      for(let k=cCount[c];k<cCount[c+1] && extra>0;k++){
        const j=cItems[k];
        if(j===tg||A.st[j]===2||A.team[j]===A.team[i]) continue;
        if(outOfReach(j,mine)) continue;
        const ddx=A.x[j]-A.x[i], ddz=A.z[j]-A.z[i];
        if(ddx*ddx+ddz*ddz<cr2){
          hurt(j,dmg*(sw?0.72:0.62),i,false);
          if(sw) launch(j,ddx,ddz,sw[2],sw[3],i);
          else if(mine.shove) shove(j,ddx,ddz,mine.shove*0.6);
          extra--;
        }
      }
    }
    /* the one it actually swung at goes furthest */
    if(sw){
      launch(tg,A.x[tg]-A.x[i],A.z[tg]-A.z[i],sw[2]*1.25,sw[3]*1.15,i);
      if(mine.voice && SR()<0.30) sfx(mine.voice,A.x[i],A.z[i],'cry');
    }
  }
  const hy=0.5+(A.fy[tg]||0);
  spawnFeathers(A.x[tg],hy+0.05,A.z[tg],crit?3:1,crit?1.35:1);
  const bdx=(A.x[tg]-A.x[i])/(dist||1), bdz=(A.z[tg]-A.z[i])/(dist||1);
  spawnBlood(A.x[tg],hy,A.z[tg],crit?8:3,crit?1.35:0.9,bdx,bdz);
  if(crit) spawnMist(A.x[tg],hy+0.05,A.z[tg],0.30);
  if(mine.ranged){                                  // the spit travels
    for(let s=1;s<=4;s++) spawnPuff(lerp(A.x[i],A.x[tg],s/5),1.0,lerp(A.z[i],A.z[tg],s/5),0.13);
  }
  if(SR()<0.10) spawnPuff(A.x[i],0.12,A.z[i],0.18);
  sfx(crit?'spur':(mine.build==='bird'?'peck':'slash'), A.x[tg], A.z[tg]);
  if(mine.sweep&&SR()<0.5) sfx('bonecrack',A.x[tg],A.z[tg]);
  else if(mine.dmg>200&&SR()<0.25) sfx('bonecrack',A.x[tg],A.z[tg]);
}

/* A heavy enough swing doesn't push a chicken, it throws it. Force is divided
   by the target's bulk, so a hen sails across the pen, a goat gets rocked, and
   a bull barely notices — and anything too heavy to lift just gets shoved. */
const GRAV=23;
function launch(j,dx,dz,force,up,by){
  const u=UNITS[A.kind[j]];
  if(u.boss||u.fly) return;
  const m=force/(0.55+u.rad*1.5);
  if(m<1.6){ shove(j,dx,dz,force*0.45); return; }
  const l=Math.hypot(dx,dz)||1;
  A.vx[j]=dx/l*m*srnd(.75,1.25);
  A.vz[j]=dz/l*m*srnd(.75,1.25);
  A.vy[j]=up/(0.55+u.rad*1.0)*srnd(.85,1.3);
  A.fy[j]=Math.max(A.fy[j],0.06);
  A.spin[j]=srnd(-11,11); A.tum[j]=0;
  A.lby[j]=by; A.hit[j]=0.3;
  spawnFeathers(A.x[j],0.75,A.z[j],u.build==='bird'?4:2,1.9);
  if(u.build==='bird'&&SR()<0.55) sfx('wingbeat',A.x[j],A.z[j],'cry');
}
/* returns true when the agent is still in the air and should be left alone */
function airborne(i,dt){
  const u=UNITS[A.kind[i]];
  if(u.fly || A.fy[i]<=0.001) return false;
  A.vy[i]-=GRAV*dt;
  A.fy[i]+=A.vy[i]*dt;
  A.x[i]+=A.vx[i]*dt; A.z[i]+=A.vz[i]*dt;
  const drag=1-1.05*dt; A.vx[i]*=drag; A.vz[i]*=drag;
  A.tum[i]+=A.spin[i]*dt;
  if(A.st[i]===2) A.dead[i]+=dt;
  const rr=Math.hypot(A.x[i],A.z[i]), lim=ARENA_R-0.9;
  if(rr>lim){ const k=lim/rr; A.x[i]*=k; A.z[i]*=k; A.vx[i]*=-0.35; A.vz[i]*=-0.35; }
  if(A.fy[i]<=0){
    const speed=-A.vy[i];
    A.fy[i]=0; A.vy[i]=0; A.tum[i]=0; A.spin[i]=0;
    A.vx[i]*=0.12; A.vz[i]*=0.12;
    spawnPuff(A.x[i],0.12,A.z[i],0.30);
    if(speed>6) sfx('landthud',A.x[i],A.z[i]);
    if(A.st[i]!==2 && speed>7){
      const by=A.lby[i]>=0?A.lby[i]:i;
      hurt(i, A.hpMax[i]*clamp((speed-7)/16,0,0.55), by, false);
    }
    A.lby[i]=-1;
    return false;
  }
  return true;
}

/* A hawk that never comes down is not a threat, it is weather. The soar
   cycle gives the flock a window: high and circling it cannot be touched and
   cannot attack, then it drops, kills, and climbs out. Reach into the sky is
   height-dependent rather than absolute, so anything low enough to bite is
   low enough to be bitten. */
const SKY_LINE=1.7;
function outOfReach(j,mine){
  const u=UNITS[A.kind[j]];
  return u.fly && !mine.aa && A.fy[j]>SKY_LINE;
}
function flierStep(i,mine,dt){
  const so=mine.soar;
  if(!so) { A.fy[i]=mine.fly+Math.sin(BATTLE.t*2.2+i)*0.35; return false; }
  const [cruise,strike,period,dive]=so;
  A.cyc[i]=(A.cyc[i]+dt)%period;
  const t=A.cyc[i];
  let want, diving=false;
  if(t<dive*0.45){                      // stoop: fall out of the sky
    want=lerp(cruise,strike,clamp(t/(dive*0.45),0,1)); diving=true;
  }else if(t<dive){                     // level out and hunt along the ground
    want=strike; diving=true;
  }else if(t<dive+1.5){                 // climb back out
    want=lerp(strike,cruise,clamp((t-dive)/1.5,0,1));
  }else{                                // circle, untouchable, biding
    want=cruise+Math.sin(BATTLE.t*1.6+i)*0.45;
  }
  A.fy[i]+=(want-A.fy[i])*Math.min(1,dt*3.4);
  return diving;
}
function shove(j,dx,dz,f){
  if(UNITS[A.kind[j]].boss) return;
  const l=Math.hypot(dx,dz)||1;
  const m=f/(0.5+UNITS[A.kind[j]].rad);
  A.vx[j]+=dx/l*m; A.vz[j]+=dz/l*m;
  A.hit[j]=0.24;
}

function hurt(j,dmg,by,crit){
  if(A.st[j]===2) return;
  A.hp[j]-=dmg; A.hit[j]=0.18;
  if(A.hp[j]>0){
    /* Getting hit and living should be loud — that panicked BAWK is most of
       what a coop raid actually sounds like. Throttled per bird so a single
       one under sustained attack doesn't machine-gun, and pulled from its own
       small budget so the whole flock can't drown everything else. */
    const uh=UNITS[A.kind[j]];
    /* Birds are the joke, so they get a much shorter leash than anything
       else — a coop under attack should be a wall of indignant chicken. */
    if(BATTLE.t-A.vt[j]>(uh.build==='bird'?srnd(.30,.70):srnd(.75,1.5))
       && SR()<(uh.build==='bird'?.85:.30)){
      A.vt[j]=BATTLE.t;
      sfx(uh.hurtv||(uh.build==='bird'?'bawk':'chitter'),A.x[j],A.z[j],'cry');
    }
    return;
  }
  const u=UNITS[A.kind[j]];
  /* possums take the coward's exit and get back up */
  if(A.rev[j]===1){ A.rev[j]=2; A.st[j]=2; A.dead[j]=0; A.hp[j]=0; return; }
  A.st[j]=2; A.dead[j]=0; A.rev[j]=0;
  if(A.team[j]===0) aliveA--; else aliveB--;
  A.kills[by]++; BATTLE.totalKills++; BATTLE.deathsWindow++; recentKills+=1;
  const hy=0.5+(A.fy[j]||0);
  spawnFeathers(A.x[j],hy,A.z[j],u.build==='bird'?4:2,1.3);
  const kdx=A.x[j]-A.x[by], kdz=A.z[j]-A.z[by], kl=Math.hypot(kdx,kdz)||1;
  spawnBlood(A.x[j],hy,A.z[j],u.rad>1.1?18:13,1.35,kdx/kl,kdz/kl);
  spawnMist(A.x[j],hy,A.z[j],u.rad>1.1?0.6:0.42);
  addStain(A.x[j],A.z[j],clamp(u.rad*0.55,0.4,1.5));
  if(SR()<0.45) spawnPuff(A.x[j],0.1,A.z[j],0.34);
  if(A.name[by]==null && A.kills[by]>=2) A.name[by]=spick(A.team[by]===0?BIRD_NAMES:COON_NAMES);
  if(BATTLE.champ<0 || A.kills[by]>A.kills[BATTLE.champ]) BATTLE.champ=by;
  killFeed(by,j,crit);
  sfx(u.build==='bird'?'birddeath':'coondeath', A.x[j], A.z[j], 'key');
  if(u.fly) A.fy[j]=0;                              // it drops
}
function reviveCheck(i,dt){
  if(A.dead[i]<srnd(2.4,2.6)) return;
  A.rev[i]=0; A.st[i]=0; A.dead[i]=0;
  A.hp[i]=A.hpMax[i]*0.55; A.hit[i]=0;
  sfx('hiss',A.x[i],A.z[i]);
  if(SR()<0.3) killFeedRaw('<i>a possum</i> was not, in fact, dead');
}
