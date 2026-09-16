/* Coop defense is a deterministic objective, separate from combat unit stats.
   Eight independently destructible sectors form a roofed circular run. */
const COOP={active:false,radius:7.5,sections:[],hens:[],breaches:0,firstHit:false,
  entered:false,intruders:0,insideX:0,insideZ:0,reason:'',pressure:new Uint8Array(8)};
const COOP_SIDES=['East','Southeast','South','Southwest','West','Northwest','North','Northeast'];
function coopReset(){
  COOP.active=typeof CFG!=='undefined'&&CFG.mode==='defense';
  COOP.sections=Array.from({length:8},()=>({hp:480,maxHp:480,hit:0}));
  COOP.hens=[{x:-1.4,z:1.4,hp:100,maxHp:100},{x:1.4,z:1.4,hp:100,maxHp:100}];
  COOP.breaches=0;COOP.firstHit=false;COOP.entered=false;COOP.intruders=0;COOP.insideX=0;COOP.insideZ=0;COOP.reason='';COOP.pressure.fill(0);
}
function coopSector(x,z){return Math.floor(((Math.atan2(z,x)+TAU)%TAU)/(TAU/8))%8;}
function coopHensAlive(){return COOP.hens.reduce((n,h)=>n+(h.hp>0?1:0),0);}
function coopEvent(type,label,x=0,z=0){if(typeof highlightEvent==='function')highlightEvent(type,label,x,z);}
function coopTick(dt){
  if(!COOP.active)return;
  COOP.pressure.fill(0);COOP.intruders=0;COOP.insideX=0;COOP.insideZ=0;
  for(let i=0;i<N;i++)if(A.st[i]!==2&&A.team[i]===1&&Math.hypot(A.x[i],A.z[i])<COOP.radius-.4){
    COOP.intruders++;COOP.insideX+=A.x[i];COOP.insideZ+=A.z[i];
  }
  if(COOP.intruders){COOP.insideX/=COOP.intruders;COOP.insideZ/=COOP.intruders;}
  for(const s of COOP.sections)s.hit=Math.max(0,s.hit-dt);
}
// True when a straight line would pass through an intact section; roof applies to fliers too.
function coopBlocks(x,z,tx,tz){
  if(!COOP.active)return false;
  const dx=tx-x,dz=tz-z,a=dx*dx+dz*dz;if(a<1e-10)return false;
  const b=2*(x*dx+z*dz),c=x*x+z*z-COOP.radius*COOP.radius,disc=b*b-4*a*c;
  if(disc<0)return false;
  const q=Math.sqrt(disc);
  for(const t of [(-b-q)/(2*a),(-b+q)/(2*a)]){
    if(t>1e-7&&t<1-1e-7&&COOP.sections[coopSector(x+t*dx,z+t*dz)].hp>0)return true;
  }
  return false;
}
function coopNearestBreach(i){
  let best=-1,dist=Infinity;
  for(let k=0;k<8;k++)if(COOP.sections[k].hp<=0){
    const a=(k+.5)*TAU/8, x=Math.cos(a)*COOP.radius,z=Math.sin(a)*COOP.radius;
    const d=(x-A.x[i])**2+(z-A.z[i])**2;
    if(d<dist){dist=d;best=k;}
  }
  return best;
}
// Reuse cooldowns and swing poses. No random draws: cosmetic sounds cannot alter the objective.
function coopStrike(i,target,hen){
  if(A.cd[i]>0||target.hp<=0)return;
  const u=UNITS[A.kind[i]];
  A.cd[i]=u.rate;A.sw[i]=u.swC;
  const damage=(hen?Math.min(36,Math.max(8,u.dmg)):Math.min(80,Math.max(5,u.dmg*.6)))*
    (CMD.light>0?(1-.45*floodPower()):1);
  target.hp=Math.max(0,target.hp-damage);target.hit=.25;
  if(hen){
    if(target.hp<=0){coopEvent('hen-lost','A protected hen was lost',target.x,target.z);sfx('bawk',target.x,target.z,'key');}
  }else{
    const k=COOP.sections.indexOf(target),a=(k+.5)*TAU/8;
    if(!COOP.firstHit){COOP.firstHit=true;coopEvent('fence-hit','Predators reached the run',Math.cos(a)*COOP.radius,Math.sin(a)*COOP.radius);}
    if(target.hp<=0){COOP.breaches++;coopEvent('breach',COOP_SIDES[k]+' fence breached',Math.cos(a)*COOP.radius,Math.sin(a)*COOP.radius);}
    sfx('peck',A.x[i],A.z[i]);
  }
}
// Supplies an objective heading only when a nearby opponent does not demand combat.
function coopHeading(i,tg){
  if(!COOP.active)return null;
  const u=UNITS[A.kind[i]],x=A.x[i],z=A.z[i],r=Math.hypot(x,z),inside=r<COOP.radius-.4;
  const rally=u.team===0&&CMD.rally>0&&r<=24;
  const engage=rally&&tg>=0?u.reach+UNITS[A.kind[tg]].rad*.5:u.team===0?12:3;
  const enemyNear=tg>=0&&(A.x[tg]-x)**2+(A.z[tg]-z)**2<=engage*engage;
  if(enemyNear&&!coopBlocks(x,z,A.x[tg],A.z[tg]))return null;
  if(u.team===1){
    if(inside){
      if(!COOP.entered){COOP.entered=true;coopEvent('intruder','A predator entered the run',x,z);}
      let h=null,d=Infinity;
      for(const hen of COOP.hens)if(hen.hp>0){const q=(hen.x-x)**2+(hen.z-z)**2;if(q<d){h=hen;d=q;}}
      if(!h)return {x:0,z:0,stop:true};
      if(d<2.5){coopStrike(i,h,true);return {x:h.x-x,z:h.z-z,stop:true};}
      return {x:h.x-x,z:h.z-z,stop:false};
    }
    let k=coopNearestBreach(i);
    if(k<0)k=coopSector(x,z);
    const a=(k+.5)*TAU/8,s=COOP.sections[k],intact=s.hp>0;
    // Queue around the panel; only three animals can work on one section per tick.
    const approach=COOP.radius+(intact?u.rad*.5+.5:-1.2);
    const tx=Math.cos(a)*approach,tz=Math.sin(a)*approach;
    if(intact&&Math.hypot(tx-x,tz-z)<1.1){
      if(COOP.pressure[k]<3){COOP.pressure[k]++;coopStrike(i,s,false);}
      return {x:-x,z:-z,stop:true};
    }
    // Go around the outside instead of attempting to walk through another panel.
    if(coopBlocks(x,z,tx,tz)){
      const ang=Math.atan2(z,x),delta=Math.atan2(Math.sin(a-ang),Math.cos(a-ang));
      const next=ang+Math.sign(delta)*.25,rr=COOP.radius+u.rad*.5+1.4;
      return {x:Math.cos(next)*rr-x,z:Math.sin(next)*rr-z,stop:false};
    }
    return {x:tx-x,z:tz-z,stop:false};
  }
  if(rally){
    if(COOP.intruders)return coopRouteHeading(i,COOP.insideX,COOP.insideZ);
    // Guard the weakest panel; spread around the run when every panel is intact.
    let weakest=0;for(let k=1;k<8;k++)if(COOP.sections[k].hp<COOP.sections[weakest].hp)weakest=k;
    const damaged=COOP.sections[weakest].hp<COOP.sections[weakest].maxHp;
    const a=damaged?(weakest+.5)*TAU/8+(i%5-2)*.08:i*2.39996323;
    const rr=COOP.radius+(inside?-1.4:1.6);
    return coopRouteHeading(i,Math.cos(a)*rr,Math.sin(a)*rr,true);
  }
  // Defenders intercept the closest predator; unengaged animals guard the run.
  if(tg>=0&&!coopBlocks(x,z,A.x[tg],A.z[tg]))return null;
  if(aliveB>0){
    let tx=COOP.intruders?COOP.insideX:ecx[0],tz=COOP.intruders?COOP.insideZ:ecz[0];
    if(tg>=0){tx=A.x[tg];tz=A.z[tg];}
    return coopRouteHeading(i,tx,tz);
  }
  const a=i*2.39996323,rr=COOP.radius+2;
  return {x:Math.cos(a)*rr-x,z:Math.sin(a)*rr-z,stop:Math.hypot(x-Math.cos(a)*rr,z-Math.sin(a)*rr)<.6};
}
// Shared path for ordinary defense and Rally; all movement still uses fence collision.
function coopRouteHeading(i,tx,tz,hold=false){
  const x=A.x[i],z=A.z[i],u=UNITS[A.kind[i]],inside=Math.hypot(x,z)<COOP.radius-.4;
  if(coopBlocks(x,z,tx,tz)){
    const breach=coopNearestBreach(i);
    if(breach>=0){
      const ba=(breach+.5)*TAU/8,nearR=COOP.radius+(inside?-1.2:1.4);
      tx=Math.cos(ba)*nearR;tz=Math.sin(ba)*nearR;
      if(Math.hypot(tx-x,tz-z)<.9){const farR=COOP.radius+(inside?1.4:-1.4);tx=Math.cos(ba)*farR;tz=Math.sin(ba)*farR;}
      if(!coopBlocks(x,z,tx,tz))return {x:tx-x,z:tz-z,stop:false};
    }else if(inside)return {x:0,z:0,stop:true};
    const angle=Math.atan2(z,x),goal=breach>=0?(breach+.5)*TAU/8:Math.atan2(tz,tx);
    const delta=Math.atan2(Math.sin(goal-angle),Math.cos(goal-angle));
    const next=angle+Math.sign(delta||1)*.28,rr=COOP.radius+(inside?-1.2:u.rad*.5+1.4);
    tx=Math.cos(next)*rr;tz=Math.sin(next)*rr;
  }
  return {x:tx-x,z:tz-z,stop:hold&&Math.hypot(tx-x,tz-z)<.6};
}
// Swept collision prevents launches, high speed and flying units bypassing the roofed run.
function coopConstrain(i,oldX,oldZ){
  if(!COOP.active||(A.st[i]===2&&A.rev[i]!==2))return;
  const r=Math.hypot(A.x[i],A.z[i]),oldR=Math.hypot(oldX,oldZ),pad=UNITS[A.kind[i]].rad*.35;
  const outside=oldR>=COOP.radius;
  const touching=outside?r<COOP.radius+pad:r>COOP.radius-pad;
  if(!touching&&!coopBlocks(oldX,oldZ,A.x[i],A.z[i]))return;
  let k=coopSector(A.x[i],A.z[i]);
  if(COOP.sections[k].hp<=0&&!coopBlocks(oldX,oldZ,A.x[i],A.z[i]))return;
  // Keep agents on the side they came from, using the old angle for a long crossing.
  const ang=coopBlocks(oldX,oldZ,A.x[i],A.z[i])?Math.atan2(oldZ,oldX):Math.atan2(A.z[i],A.x[i]);
  const rr=COOP.radius+(outside?pad+.02:-pad-.02);
  A.x[i]=Math.cos(ang)*rr;A.z[i]=Math.sin(ang)*rr;
  const nx=Math.cos(ang),nz=Math.sin(ang),dot=A.vx[i]*nx+A.vz[i]*nz;
  if((outside&&dot<0)||(!outside&&dot>0)){A.vx[i]-=dot*nx;A.vz[i]-=dot*nz;}
}
function coopCheckWin(){
  if(!COOP.active)return false;
  const hens=coopHensAlive();
  if(!hens){COOP.reason='Both hens were lost';verdict('coons',COOP.reason);}
  else if(aliveB<=0){COOP.reason='All predators stopped';verdict('birds',COOP.reason);}
  return true; // defense never ends because the old army-elimination/stall rule fired
}
function coopHud(){
  const el=$('coopObjective');if(!el)return;
  el.hidden=!COOP.active;if(!COOP.active)return;
  const weakest=Math.min(...COOP.sections.map(s=>s.hp/s.maxHp));
  $('coopHens').textContent=coopHensAlive()+' / 2 hens safe';
  COOP.hens.forEach((hen,i)=>{
    const value=Math.ceil(clamp(hen.hp/hen.maxHp,0,1)*100),bar=$('henHealth'+i);
    bar.value=value;bar.setAttribute('aria-valuetext',value>0?value+' percent health':'Lost');
    $('henHealthText'+i).textContent=value>0?value+'%':'Lost';
    bar.classList.toggle('critical',value<=30);bar.classList.toggle('lost',value===0);
  });
  $('coopFence').textContent=COOP.breaches?COOP.breaches+' fence breach'+(COOP.breaches===1?'':'es'):'Weakest fence '+Math.ceil(weakest*100)+'%';
  $('coopStatus').textContent=BATTLE.over?COOP.reason:COOP.intruders?'Predators inside!':COOP.breaches?'Defend the hens!':CMD.rally>0?'Rally active · '+Math.ceil(CMD.rally)+'s':'Protect the hens';
  el.classList.toggle('danger',COOP.breaches>0||weakest<.3);
}
