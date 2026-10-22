#!/usr/bin/env node
'use strict';
// Judge Dean LLC — initial-flock scaling, reserved arrivals and versioned replays.
const assert=require('node:assert/strict'),path=require('node:path');
const {runtime,checksum}=require('./regression.cjs');
const dir=path.resolve(__dirname,'..'),preview=runtime(dir),current=preview.eval('SIM_VERSION');
const read=(r,code)=>JSON.parse(r.eval('JSON.stringify('+code+')'));
function boot(count=260,seed=3,actions=[],sim=current,playback=actions.length>0,source=dir){
 const r=runtime(source);
 r.eval(`function bootScaling(count,seed,actions,sim,playback){
   const rows=[{k:'rooster',n:count}];CFG.mode='raid';CFG.seed=seed;CFG.challenge=null;
   seedSim(seed);BATTLE.running=false;BATTLE.over=false;BATTLE.t=0;BATTLE.tick=0;BATTLE.winner='';BATTLE.reason='';
   winT=0;routT=0;stallT=0;lastKills=-1;resetReplayRuntime();
   REPLAY.loaded=null;REPLAY.current={v:2,sim,seed,arena:'field',mode:'raid',roster:rows,actions};REPLAY.playback=playback;
   // Stamp the replay version before the first spawn, just like startBattle.
   spawnRoster(rows,false);BATTLE.running=true;
 }
 function clearScalingPredators(){for(let i=0;i<N;i++)if(A.team[i]===1&&A.st[i]!==2){A.st[i]=2;A.hp[i]=0;aliveB--}}
 bootScaling(${count},${seed},${JSON.stringify(actions)},${JSON.stringify(sim)},${playback});`);
 return r;
}
function assistUntil(r,tick=9000){
 r.eval(`while(BATTLE.tick<${tick}&&!BATTLE.over){
  if(RAID.phase==='prep'&&!RAID.choice)queueBattleAction('choice','recruit');
  if(RAID.phase==='combat'){
   if(CMD.pts>=12&&BATTLE.tick%120===0){const a=RAID.approach+(RAID.waveTime<15?Math.PI:0),r=ARENA_R*.9;queueBattleAction('deploy','goose',{x:Math.cos(a)*r,z:Math.sin(a)*r});}
   if(cmdReady('horn'))cmdFire('horn');if(cmdReady('light'))cmdFire('light');
   if(COOP.intruders&&cmdReady('rally'))cmdFire('rally');
   if(COOP.sections.some(s=>s.hp<300)&&cmdReady('repair'))cmdFire('repair');
  }
  tickTest();
 }`);
}

const base=read(preview,'RAID_WAVES');
assert.deepEqual(base.map(w=>w.packets.map(p=>p.n)),[[8,6,4],[6,2,6,2],[8,2,1]]);
assert.deepEqual(read(preview,`raidPlanFor(260,'${current}')`),base,'the original 260-bird challenge stays unchanged');
const samples=[];let lastTotal=0,lastPackets=[];
// Check every supported starting count, including packet-rounding boundaries.
for(const plan of read(preview,`Array.from({length:4000},(_,i)=>raidPlanFor(i+1,'${current}'))`)){
 const packets=plan.flatMap(w=>w.packets),total=packets.reduce((n,p)=>n+p.n,0);
 assert.ok(total>=lastTotal,'total predators never shrink as the flock grows');
 packets.forEach((p,i)=>{
  assert.ok(Number.isInteger(p.n)&&p.n>=1);
  assert.ok(p.n>=(lastPackets[i]||0),'each packet scales monotonically');
  if(p.k==='bear')assert.ok(p.n<=4,'large raids keep a bounded heavy group');
 });
 lastTotal=total;lastPackets=packets.map(p=>p.n);
}
for(const count of [1,40,100,260,1000,4000]){
 const plan=read(preview,`raidPlanFor(${count},'${current}')`),total=preview.eval(`raidPlanTotal(${count},'${current}')`);
 assert.equal(total,plan.flatMap(w=>w.packets).reduce((n,p)=>n+p.n,0));
 assert.deepEqual(plan.map(w=>({label:w.label,packets:w.packets.map(({n,...p})=>p)})),base.map(w=>({label:w.label,packets:w.packets.map(({n,...p})=>p)})),'scaling changes counts only');
 samples.push({farm:count,predators:total,bears:plan[2].packets[2].n});
}
assert.ok(samples[2].predators<samples[3].predators&&samples[3].predators<samples[4].predators&&samples[4].predators<samples[5].predators,'larger flocks receive strictly larger raids');
preview.eval(`seedSim(813);var expectedRandom=SR();seedSim(813);var disposablePlan=raidPlanFor(4000,'${current}');disposablePlan[0].packets[0].n=99999;raidPlanTotal(100,'${current}')`);
assert.equal(preview.eval('SR()===expectedRandom'),true,'preview does not consume the simulation RNG');
assert.notEqual(preview.eval(`raidPlanFor(4000,'${current}')[0].packets[0].n`),99999,'callers receive independent plans');
assert.deepEqual(read(preview,'RAID_WAVES'),base,'preview never mutates the base schedule');
console.log('PASS monotonic count-only plans, small-flock floor, bounded heavies and pure preview:',JSON.stringify(samples));

const large=boot(4000),total=large.eval('raidPlanTotal(RAID.startFarm)');
assert.ok(4000+total+80<=large.eval('MAXA'),'maximum slider flock leaves reinforcement headroom');
assert.equal(large.eval('N+raidReserved()'),4000+total,'opening reserves every future scaled predator');
for(let wave=1;wave<=3;wave++){
 large.eval('RAID.waveTime=15;raidSpawnDue();clearScalingPredators();raidCheckWin()');
 if(wave<3){
  assert.equal(large.eval('RAID.phase'),'prep');
  large.eval("raidChoose('save');raidStep(8)");
  assert.equal(large.eval('RAID.wave'),wave+1);
  assert.equal(large.eval('N+raidReserved()'),4000+total,'future reservation shrinks exactly as packets arrive');
 }
}
assert.equal(large.eval('BATTLE.winner'),'birds');assert.equal(large.eval('initB'),total);
assert.equal(large.eval('N'),4000+total);assert.equal(large.eval('raidReserved()'),0);
const capacity=boot(4000);
capacity.eval('CMD.pts=80;N=MAXA-raidReserved()-5');
assert.equal(capacity.eval("canDeploy(DEPLOY.find(d=>d.k==='goose'))"),false,'all future scaled waves retain their slots');
capacity.eval("RAID.phase='prep';RAID.choice=null");
assert.equal(capacity.eval("raidCanChoose('recruit')"),false,'free recruits cannot steal scaled arrivals');
console.log('PASS 4,000-defender full-wave capacity and reinforcement reservations');

const frozen=boot(520),initialPlan=read(frozen,'raidCurrentPlan()'),reserved=frozen.eval('raidReserved()');
frozen.eval("applyDeploy(DEPLOY.find(d=>d.k==='goose'),{x:ARENA_R*.9,z:0});deploymentStep(1.8);for(let i=0;i<20;i++){A.st[i]=2;aliveA--}CFG.birds=4000");
assert.equal(frozen.eval('TALE.bought.goose'),6);assert.equal(frozen.eval('RAID.startFarm'),520);
assert.deepEqual(read(frozen,'raidCurrentPlan()'),initialPlan,'recruits, deaths and setup changes never retune a running raid');
assert.equal(frozen.eval('raidReserved()'),reserved);
frozen.eval('RAID.waveTime=15;raidSpawnDue();clearScalingPredators();raidCheckWin();raidStep(8)');
assert.equal(frozen.eval('aliveB'),initialPlan[1].packets[0].n,'later waves use the original plan');
frozen.eval(`bootScaling(100,3,[],'${current}',false)`);
assert.equal(frozen.eval('RAID.startFarm'),100);assert.equal(frozen.eval('N+raidReserved()'),100+frozen.eval('raidPlanTotal(100)'));
assert.deepEqual(read(frozen,'raidCurrentPlan()'),read(frozen,'raidPlanFor(100)'),'reset takes the new starting flock');
console.log('PASS frozen starting-flock plan across recruits, casualties, waves and reset');

for(const sim of ['2026-10-21.1','2026-10-22.1']){
 for(const count of [1,260,1000,4000]){
  assert.deepEqual(read(preview,`raidPlanFor(${count},'${sim}')`),base,'previous versions retain every original packet');
  assert.equal(preview.eval(`raidPlanTotal(${count},'${sim}')`),45);
 }
 const old=boot(4000,3,[],sim,true);
 assert.equal(old.eval('aliveB'),8,'old playback version is active before initial spawning');
 assert.equal(old.eval('raidReserved()'),37);assert.deepEqual(read(old,'raidCurrentPlan()'),base);
 old.eval('REPLAY.playback=false;REPLAY.loaded=REPLAY.current;REPLAY.current=null;seedSim(3);spawnRoster([{k:"rooster",n:4000}],false)');
 assert.equal(old.eval('aliveB'),8,'loaded old links keep the fixed preview before playback');
 assert.equal(old.eval('raidPlanVersion()'),sim);
 old.eval('REPLAY.loaded=null');
 assert.equal(old.eval('raidPlanVersion()'),current,'leaving a linked replay restores the current rules');
}
console.log('PASS both previous versions keep exact 45-predator replay and setup plans');

// A real scaled raid records input once, then replays at three presentation rates.
const record=boot(390);
assistUntil(record);
assert.equal(record.eval('BATTLE.over'),true,'scaled scenario reaches a verdict');
const actions=read(record,'REPLAY.current.actions'),expected=checksum(record);
assert.ok(actions.some(a=>a.type==='choice')&&actions.some(a=>a.type==='deploy'),'scaled replay includes regroup and reinforcement orders');
for(const batch of [1,2,4]){
 const replay=boot(390,3,actions);
 replay.eval(`while(BATTLE.tick<9000&&!BATTLE.over&&!VIEW.paused){for(let n=0;n<${batch}&&!BATTLE.over&&!VIEW.paused;n++)tickTest()}`);
 assert.equal(replay.eval('VIEW.paused'),false,'recorded actions are accepted');
 assert.deepEqual(checksum(replay),expected,'scaled live battle matches replay at '+batch+' fixed ticks per frame');
}
console.log('PASS complete scaled replay across 1/2/4 fixed ticks per presentation frame');

// Optional comparison uses an actual read-only previous checkout, not a copy of
// the current implementation. Standalone legacy plan checks above always run.
const baselineDir=process.env.RAID_SCALING_BASELINE_DIR;
if(baselineDir){
 const previous=boot(390,3,[],'2026-10-22.1',false,baselineDir),states=[];
 assert.equal(previous.eval('SIM_VERSION'),'2026-10-22.1','scaling baseline must be the regroup-choice release');
 for(let tick=600;tick<=9000;tick+=600){
  assistUntil(previous,tick);states.push({tick,state:checksum(previous)});
  if(previous.eval('BATTLE.over'))break;
 }
 assert.equal(previous.eval('BATTLE.over'),true,'previous full raid reaches a verdict');
 const legacy=boot(390,3,read(previous,'REPLAY.current.actions'),'2026-10-22.1',true);
 for(const {tick,state} of states){
  legacy.eval(`while(BATTLE.tick<${tick}&&!BATTLE.over&&!VIEW.paused)tickTest()`);
  assert.equal(legacy.eval('VIEW.paused'),false,'previous-version inputs remain accepted');
  assert.deepEqual(checksum(legacy),state,'previous-version full replay matches at tick '+tick);
 }
 console.log('PASS complete 2026-10-22.1 replay matches previous release at every checkpoint');
}else console.log('SKIP previous-release comparison: set RAID_SCALING_BASELINE_DIR to a 2026-10-22.1 checkout');
