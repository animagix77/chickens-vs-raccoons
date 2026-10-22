/* Judge Dean LLC — three-wave Save the Coop scenario.
   All arrivals, choices and warnings advance on fixed simulation ticks. */
const RAID={active:false,wave:0,phase:'complete',waveLabel:'',waveTime:0,
  prepLeft:0,choice:null,approach:0,nextApproach:0,pending:[],pendingRemaining:0,
  threats:[],choices:[],startFarm:0,bearWind:new Float32Array(MAXA),
  bearSection:new Int8Array(MAXA),bearReady:new Float64Array(MAXA)};
const RAID_WAVES=[
  {label:'The fence raiders',packets:[
    {at:0,k:'coon',n:8,flank:0},{at:6,k:'coon',n:6,flank:.55},{at:14,k:'coon',n:4,flank:-.5}]},
  {label:'Foxes on the flank',packets:[
    {at:0,k:'coon',n:6,flank:0},{at:6,k:'fox',n:2,flank:Math.PI},
    {at:11,k:'coon',n:6,flank:.5},{at:15,k:'fox',n:2,flank:-2.4}]},
  {label:'The bear at the gate',packets:[
    {at:0,k:'coon',n:8,flank:-.45},{at:6,k:'fox',n:2,flank:Math.PI},
    {at:15,k:'bear',n:1,flank:0}]}
];
function raidAngle(wave){return ((((CFG.seed>>>0)%8)+.5)*TAU/8+(wave-1)*2.39996323)%TAU;}
function raidReset(){
  RAID.active=CFG.mode==='raid';RAID.wave=0;RAID.phase='complete';RAID.waveLabel='';
  RAID.waveTime=0;RAID.prepLeft=0;RAID.choice=null;RAID.pending=[];RAID.pendingRemaining=0;
  RAID.approach=RAID.nextApproach=0;RAID.threats=[];RAID.choices=[];RAID.startFarm=aliveA;
  RAID.bearWind.fill(0);RAID.bearSection.fill(-1);RAID.bearReady.fill(0);
  if(RAID.active)raidStartWave(1);
}
// Grow only the new species' instance reservation; surviving animals keep their IDs.
function raidReserved(){
  if(!RAID.active||RAID.phase==='complete')return 0;
  let total=RAID.pendingRemaining;
  for(let wave=RAID.wave;wave<RAID_WAVES.length;wave++)
    for(const packet of RAID_WAVES[wave].packets)total+=packet.n;
  return total;
}
function raidReserve(kind,count){
  const ui=UI_[kind];let existing=0;
  for(let i=0;i<N;i++)if(A.kind[i]===ui)existing++;
  const needed=existing+count;
  if(needed>(SQUAD_NEED[kind]||0)){
    SQUAD_NEED[kind]=Math.min(MAXA,Math.max(needed,(SQUAD_NEED[kind]||8)*2));
    if(SQUADS[ui])SQUADS[ui].dispose();SQUADS[ui]=null;
  }
  if(!SQUADS[ui])buildOneSquad(kind);
}
function raidSpawn(kind,count,angle,nearCoop=false){
  // A fixed raid leaves ample capacity, but rejected packets must never be partial.
  if(!Number.isInteger(count)||count<1||N+count>MAXA)return false;
  const u=UNITS[UI_[kind]];raidReserve(kind,count);
  for(let n=0;n<count;n++){
    const a=angle+srnd(-.24,.24),r=nearCoop?COOP.radius+srnd(2,3.3):ARENA_R*srnd(.87,.94);
    const j=addAgent(Math.cos(a)*r,Math.sin(a)*r,u.i,(SR()*VARIANTS[kind])|0);
    A.yaw[j]=Math.atan2(-A.x[j],-A.z[j]);
    if(u.team===0){aliveA++;initA++;}else{aliveB++;initB++;}
  }
  if(!ROSTER_USED.includes(kind))ROSTER_USED.push(kind);
  return true;
}
function raidStartWave(wave){
  RAID.wave=wave;RAID.phase='combat';RAID.waveTime=0;RAID.prepLeft=0;RAID.choice=null;
  RAID.approach=raidAngle(wave);RAID.nextApproach=raidAngle(Math.min(3,wave+1));
  const plan=RAID_WAVES[wave-1];RAID.waveLabel=plan.label;
  RAID.pending=plan.packets.map(p=>({...p}));RAID.pendingRemaining=RAID.pending.reduce((n,p)=>n+p.n,0);
  RAID.threats=[];RAID.bearWind.fill(0);RAID.bearSection.fill(-1);
  coopEvent('wave','Wave '+wave+' · '+plan.label,Math.cos(RAID.approach)*ARENA_R*.9,Math.sin(RAID.approach)*ARENA_R*.9);
  raidSpawnDue();
}
function raidSpawnDue(){
  while(RAID.pending.length&&RAID.pending[0].at<=RAID.waveTime+1e-7){
    const p=RAID.pending.shift();
    // Do not silently win when a malformed/custom roster has filled the field.
    if(!raidSpawn(p.k,p.n,RAID.approach+p.flank)){
      COOP.reason='The field is full. Start a smaller raid.';RAID.phase='complete';
      verdict('coons',COOP.reason);return;
    }
    RAID.pendingRemaining-=p.n;
    if(p.k==='fox')coopEvent('flank','Foxes are flanking the run',Math.cos(RAID.approach+p.flank)*ARENA_R*.9,Math.sin(RAID.approach+p.flank)*ARENA_R*.9);
    if(p.k==='bear')coopEvent('boss','The bear has arrived',Math.cos(RAID.approach)*ARENA_R*.9,Math.sin(RAID.approach)*ARENA_R*.9);
  }
}
function raidStep(dt){
  if(!RAID.active||BATTLE.over)return;
  if(RAID.phase==='prep'){
    // The farm holds still while supplies and command cooldowns keep ticking.
    cmdStep(dt);RAID.prepLeft=Math.max(0,RAID.prepLeft-dt);
    if(RAID.prepLeft<=1e-7){
      if(!RAID.choice)raidChoose('save');
      raidStartWave(RAID.wave+1);
    }
    return;
  }
  if(RAID.phase!=='combat')return;
  RAID.waveTime+=dt;raidSpawnDue();
  // Cancel wind-ups if the bear dies, leaves the panel, or the panel is breached.
  RAID.threats=[];
  for(let i=0;i<N;i++)if(RAID.bearSection[i]>=0){
    const k=RAID.bearSection[i],a=(k+.5)*TAU/8;
    const tx=Math.cos(a)*(COOP.radius+1.7),tz=Math.sin(a)*(COOP.radius+1.7);
    if(A.st[i]===2||COOP.sections[k].hp<=0||Math.hypot(A.x[i]-tx,A.z[i]-tz)>2.1){
      RAID.bearWind[i]=0;RAID.bearSection[i]=-1;continue;
    }
    RAID.bearWind[i]=Math.min(1.8,RAID.bearWind[i]+dt);
    RAID.threats.push({unit:i,section:k,x:Math.cos(a)*COOP.radius,z:Math.sin(a)*COOP.radius,radius:2.8,progress:RAID.bearWind[i]/1.8,kind:'bear'});
  }
}
function raidRepairPanel(k,amount){
  const s=COOP.sections[k],wasOpen=s.hp<=0;s.hp=Math.min(s.maxHp,s.hp+amount);s.hit=.25;
  if(wasOpen&&s.hp>0)COOP.breaches=Math.max(0,COOP.breaches-1);
  for(let i=0;i<N;i++)if(A.st[i]!==2){
    const r=Math.hypot(A.x[i],A.z[i]);
    if(r<COOP.radius+1&&r>COOP.radius-1&&coopSector(A.x[i],A.z[i])===k){
      const a=Math.atan2(A.z[i],A.x[i]);A.x[i]=Math.cos(a)*(COOP.radius+1);A.z[i]=Math.sin(a)*(COOP.radius+1);
    }
  }
}
function raidChoose(choice){
  if(!RAID.active||RAID.phase!=='prep'||RAID.choice||!['repair','recruit','save'].includes(choice))return false;
  if(choice==='recruit'&&N+raidReserved()+6+(typeof deploymentReserved==='function'?deploymentReserved():0)>MAXA)return false;
  if(choice==='repair'){
    const panels=COOP.sections.map((s,k)=>({k,h:s.hp/s.maxHp})).sort((a,b)=>a.h-b.h||a.k-b.k);
    panels.slice(0,2).forEach(p=>raidRepairPanel(p.k,240));
  }else if(choice==='recruit'){
    if(!raidSpawn('goose',6,RAID.nextApproach,true))return false;
    TALE.bought.goose=(TALE.bought.goose||0)+6;
  }else CMD.pts=Math.min(PTS_CAP,CMD.pts+18);
  RAID.choice=choice;RAID.choices.push({wave:RAID.wave,choice,tick:BATTLE.tick});
  coopEvent('supply',choice==='repair'?'Two fence panels reinforced':choice==='recruit'?'Six geese joined the next defense':'18 supplies banked');
  return true;
}
function raidCheckWin(){
  if(!RAID.active)return false;
  if(BATTLE.over)return true;
  if(!coopHensAlive()){
    RAID.phase='complete';RAID.threats=[];COOP.reason='Both hens were lost';verdict('coons',COOP.reason);return true;
  }
  if(RAID.phase==='combat'&&aliveB<=0&&RAID.pendingRemaining===0){
    if(RAID.wave===3){
      RAID.phase='complete';RAID.threats=[];COOP.reason='All three waves stopped';verdict('birds',COOP.reason);
    }else{
      RAID.phase='prep';RAID.prepLeft=8;RAID.choice=null;RAID.threats=[];
      RAID.nextApproach=raidAngle(RAID.wave+1);
      coopEvent('wave-clear','Wave '+RAID.wave+' held · choose your supplies');
    }
  }
  return true;
}
// The large fence strike is telegraphed; killing the bear cancels it completely.
function raidBearStrike(i,k){
  const section=COOP.sections[k];
  if(section.hp<=0||BATTLE.t<RAID.bearReady[i])return;
  if(RAID.bearSection[i]!==k){
    RAID.bearSection[i]=k;RAID.bearWind[i]=0;
    coopEvent('warning','Bear winding up · defend the marked fence',A.x[i],A.z[i]);return;
  }
  if(RAID.bearWind[i]<1.8-1e-6)return;
  RAID.bearSection[i]=-1;RAID.bearWind[i]=0;RAID.bearReady[i]=BATTLE.t+3;
  // A braced bear commits its existing strength to a panel rather than a unit.
  const damage=Math.min(300,UNITS[A.kind[i]].dmg*.6)*(CMD.light>0?(1-.45*floodPower()):1);
  section.hp=Math.max(0,section.hp-damage);section.hit=.45;A.sw[i]=UNITS[A.kind[i]].swC;
  if(!COOP.firstHit){COOP.firstHit=true;coopEvent('fence-hit','Predators reached the run',A.x[i],A.z[i]);}
  if(section.hp<=0){COOP.breaches++;coopEvent('breach',COOP_SIDES[k]+' fence breached by the bear',A.x[i],A.z[i]);}
  sfx('thud',A.x[i],A.z[i],'key');
}
