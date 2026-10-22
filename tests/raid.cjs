#!/usr/bin/env node
'use strict';
// Judge Dean LLC — deterministic waves, preparation choices and predator roles.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {runtime,checksum}=require('./regression.cjs');
const dir=path.resolve(__dirname,'..');
function boot(seed=3,rows=[{k:'rooster',n:260}],actions=[],options={}){
 const source=options.dir||dir,r=runtime(source);
 if(r.eval("typeof RAID==='undefined'"))r.eval(fs.readFileSync(path.join(source,'parts/04c_raid.js'),'utf8'));
 r.eval(`CFG.seed=${seed};buildOneSquad=function(k){SQUADS[UI_[k]]={dispose(){}}};bootTest(${JSON.stringify(rows)},${seed},${JSON.stringify(actions)},'raid');if(!RAID.active)raidReset();
 function tickRaid(){tickTest();}
 function clearRaidPredators(){for(let i=0;i<N;i++)if(A.team[i]===1&&A.st[i]!==2){A.st[i]=2;A.hp[i]=0;aliveB--}}
 function raidSnapshot(){return {phase:RAID.phase,wave:RAID.wave,pending:RAID.pending,choices:RAID.choices,prepLeft:RAID.prepLeft,wind:Array.from(RAID.bearWind.slice(0,N)),ready:Array.from(RAID.bearReady.slice(0,N)),section:Array.from(RAID.bearSection.slice(0,N))}}
 `);
 if(options.sim)r.eval(`REPLAY.current.sim=${JSON.stringify(options.sim)}`);
 if(options.playback!==undefined)r.eval(`REPLAY.playback=${options.playback}`);
 return r;
}
const read=(r,s)=>JSON.parse(r.eval('JSON.stringify('+s+')'));
function enterPrep(r){r.eval("clearRaidPredators();RAID.pending=[];RAID.pendingRemaining=0;raidCheckWin()");}
function finishPrep(r){r.eval("while(RAID.phase==='prep')tickRaid()");}
function assistUntil(r,tick=9000,changeChoices=true){
 r.eval(`while(BATTLE.tick<${tick}&&!BATTLE.over){
  if(RAID.phase==='prep'){
    const choice=${changeChoices?"RAID.prepLeft>7?'repair':RAID.prepLeft>6?'save':'recruit'":"'recruit'"};
    if(${changeChoices?'RAID.choice!==choice':'!RAID.choice'})queueBattleAction('choice',choice);
  }
  if(RAID.phase==='combat'&&RAID.wave>=2&&CMD.pts>=12&&BATTLE.tick%120===0){
    const a=RAID.approach+(RAID.waveTime<15?Math.PI:0),r=ARENA_R*.9;
    queueBattleAction('deploy','goose',{x:Math.cos(a)*r,z:Math.sin(a)*r});
  }
  if(RAID.phase==='combat'&&RAID.wave>=2&&cmdReady('horn'))cmdFire('horn');
  if(RAID.phase==='combat'&&RAID.wave>=2&&cmdReady('light'))cmdFire('light');
  if(COOP.intruders&&cmdReady('rally'))cmdFire('rally');
  if(COOP.sections.some(s=>s.hp<300)&&cmdReady('repair'))cmdFire('repair');
  tickRaid();
 }`);
}
const opening=boot();assert.equal(opening.eval('RAID.wave'),1);assert.equal(opening.eval('aliveB'),8);
assert.equal(opening.eval('RAID.pendingRemaining'),10);assert.equal(opening.eval('COOP.active'),true);
opening.eval('clearRaidPredators();raidCheckWin()');assert.equal(opening.eval('RAID.phase'),'combat','later packets prevent premature wave completion');
assert.equal(opening.eval('BATTLE.over'),false);
opening.eval('while(RAID.phase===\'combat\'&&!BATTLE.over){tickRaid();clearRaidPredators();raidCheckWin()}');
assert.equal(opening.eval('RAID.phase'),'prep');assert.equal(opening.eval('RAID.wave'),1);
assert.ok(opening.eval('BATTLE.t>=14'),'wave does not complete before scheduled arrivals');
const positions=opening.eval('JSON.stringify(Array.from(A.x.slice(0,N)))');
opening.eval('tickRaid()');assert.equal(opening.eval('JSON.stringify(Array.from(A.x.slice(0,N)))'),positions,'prep freezes animal movement');
assert.equal(opening.eval("raidChoose('not-a-choice')"),false);
opening.eval('COOP.sections[0].hp=0;COOP.sections[1].hp=10;COOP.breaches=1;COOP.hens[0].hp=30;A.x[0]=7.4;A.z[0]=.1');
assert.equal(opening.eval("raidChoose('repair')"),true);
assert.deepEqual(read(opening,'COOP.sections.slice(0,2).map(s=>s.hp)'),[0,10],'repair waits for the countdown');
assert.equal(opening.eval('RAID.choices.length'),0,'selecting does not commit a reward');
assert.equal(opening.eval("raidCanChoose('repair')"),true,'selected choice remains eligible for queue cancellation');
assert.equal(opening.eval("raidChoose('repair')"),false,'unchanged selection is a no-op');
assert.equal(opening.eval("raidChoose('recruit')"),true,'selection can be replaced');
assert.equal(opening.eval("raidChoose('save')"),true);
assert.equal(opening.eval("raidChoose('repair')"),true);
finishPrep(opening);
assert.deepEqual(read(opening,'COOP.sections.slice(0,2).map(s=>s.hp)'),[240,250]);assert.equal(opening.eval('COOP.breaches'),0);
assert.equal(opening.eval('COOP.hens[0].hp'),30,'supplies never heal objective hens');
assert.ok(opening.eval('Math.hypot(A.x[0],A.z[0])>COOP.radius'),'closing panel clears boundary overlap');
assert.equal(opening.eval('RAID.choices.length'),1,'only the final selection commits');
assert.equal(opening.eval('RAID.choices[0].choice'),'repair');
assert.equal(opening.eval("raidChoose('recruit')"),false,'choices close when combat starts');
assert.equal(opening.eval("raidApplyChoice('repair')"),false,'an expired reward cannot apply twice');
assert.equal(opening.eval('RAID.wave'),2);assert.equal(opening.eval('RAID.choice'),null);
console.log('PASS scheduled packets, prep freeze, replaceable delayed repair, one-time commit and boundary correction');

const auto=boot();auto.eval("clearRaidPredators();RAID.pending=[];RAID.pendingRemaining=0;raidCheckWin();CMD.pts=0;while(RAID.phase==='prep')tickRaid()");
assert.equal(auto.eval('RAID.wave'),2);assert.equal(auto.eval('RAID.choices[0].choice'),'save');assert.ok(auto.eval('CMD.pts>=18'));
const recruit=boot();recruit.eval("clearRaidPredators();RAID.pending=[];RAID.pendingRemaining=0;raidCheckWin()");
const birds=recruit.eval('aliveA');assert.equal(recruit.eval("raidChoose('recruit')"),true);assert.equal(recruit.eval('aliveA'),birds,'recruits wait for the countdown');
assert.equal(recruit.eval('TALE.bought.goose||0'),0);finishPrep(recruit);assert.equal(recruit.eval('aliveA'),birds+6);
assert.equal(recruit.eval('TALE.bought.goose'),6);assert.ok(recruit.eval('SQUAD_NEED.goose>=6'));
assert.equal(recruit.eval('RAID.choices.length'),1);
recruit.eval('for(let n=0;n<60;n++)tickRaid()');assert.equal(recruit.eval('TALE.bought.goose'),6,'reward does not repeat after expiry');
const save=boot();enterPrep(save);save.eval('CMD.pts=0;CMD.ptAcc=0');assert.equal(save.eval("raidChoose('save')"),true);
assert.equal(save.eval('CMD.pts'),0,'saving supplies waits for the countdown');finishPrep(save);assert.equal(save.eval('CMD.pts'),26,'one save reward plus eight seconds of ordinary income');
const abandoned=boot(),direct=boot();
for(const r of [abandoned,direct]){enterPrep(r);r.eval('COOP.sections[0].hp=0;COOP.sections[1].hp=10;COOP.breaches=1;CMD.pts=0');}
abandoned.eval("raidChoose('recruit');raidChoose('repair');raidChoose('save');raidChoose('recruit');raidChoose('repair');raidChoose('save')");
direct.eval("raidChoose('save')");
assert.deepEqual(checksum(abandoned),checksum(direct),'abandoned rewards do not change simulation state');
finishPrep(abandoned);finishPrep(direct);
assert.deepEqual(checksum(abandoned),checksum(direct),'abandoned recruit selections do not consume random numbers');
assert.equal(abandoned.eval('RAID.choices.length'),1);assert.equal(abandoned.eval('TALE.bought.goose||0'),0);
assert.deepEqual(read(abandoned,'COOP.sections.slice(0,2).map(s=>s.hp)'),[0,10],'abandoned repairs never apply');
const reset=boot();enterPrep(reset);reset.eval("raidChoose('recruit');bootTest([{k:'rooster',n:260}],3,[],'raid')");
assert.equal(reset.eval('RAID.choice'),null);assert.equal(reset.eval('RAID.choices.length'),0);assert.equal(reset.eval('TALE.bought.goose||0'),0);
enterPrep(reset);finishPrep(reset);assert.equal(reset.eval('RAID.choices[0].choice'),'save','reset abandons any uncommitted selection');
const defeat=boot();defeat.eval('COOP.hens.forEach(h=>h.hp=0);raidCheckWin()');assert.equal(defeat.eval('BATTLE.winner'),'coons');
assert.equal(defeat.eval('RAID.phase'),'complete');
const final=boot();final.eval("RAID.wave=3;clearRaidPredators();RAID.pending=[];RAID.pendingRemaining=0;raidCheckWin()");assert.equal(final.eval('BATTLE.winner'),'birds');
const reserve=boot();
assert.equal(reserve.eval('raidReserved()'),37,'future wave slots include pending and not-yet-started waves');
reserve.eval('N=MAXA-raidReserved()-5;CMD.pts=80');
assert.equal(reserve.eval("canDeploy(DEPLOY.find(d=>d.k==='goose'))"),false,'normal deployment cannot steal future predator slots');
reserve.eval("RAID.phase='prep';RAID.choice=null");
assert.equal(reserve.eval("raidChoose('recruit')"),false,'free recruits also reserve future waves');
console.log('PASS default saved supplies, free recruits, future-wave capacity, hen-loss defeat and final-wave victory');

// A marked attack has a full warning period and is cancelled when its owner dies.
const bear=boot();bear.eval("raidSpawn('bear',1,0);var b=N-1;A.x[b]=Math.cos(TAU/16)*9.2;A.z[b]=Math.sin(TAU/16)*9.2;raidBearStrike(b,0)");
assert.equal(bear.eval('COOP.sections[0].hp'),480);
bear.eval('for(let n=0;n<100;n++){BATTLE.t+=1/60;raidStep(1/60);raidBearStrike(b,0)}');
assert.equal(bear.eval('COOP.sections[0].hp'),480,'no damage before full windup');assert.ok(bear.eval('RAID.threats.some(t=>t.unit===b&&t.progress>0)'));
bear.eval('for(let n=0;n<10;n++){BATTLE.t+=1/60;raidStep(1/60);raidBearStrike(b,0)}');assert.equal(bear.eval('COOP.sections[0].hp'),228,'heavy strike uses bear strength');
bear.eval('BATTLE.t+=4;raidBearStrike(b,0);A.st[b]=2;raidStep(1/60)');assert.equal(bear.eval('RAID.bearSection[b]'),-1);assert.equal(bear.eval('RAID.threats.some(t=>t.unit===b)'),false);
const fox=boot();fox.eval("raidSpawn('fox',1,Math.PI);var f=N-1;A.x[f]=-10;A.z[f]=0;A.x[0]=-10.5;A.z[0]=0;COOP.sections[0].hp=0;COOP.breaches=1");
assert.notEqual(fox.eval('coopHeading(f,0)'),null,'fox takes breach route despite nearby defender');
fox.eval('RAID.active=false');assert.equal(fox.eval('coopHeading(f,0)'),null,'single-wave defense keeps original combat priority');
console.log('PASS bear warning timing/damage/death cancellation and raid-only fox breach tactics');

// Actual complete runs; use a repeatable intervention policy, then compare full states.
const runs=[];let recordedRun=null;
for(const seed of [1,3,7]){
 const r=boot(seed);assistUntil(r);
 assert.equal(r.eval('BATTLE.over'),true,'full scenario reaches hen-loss or last-wave-clear verdict');
 assert.equal(r.eval('BATTLE.winner'),'birds','the assisted defense policy can protect the hens');
 assert.ok(r.eval('BATTLE.t>=60&&BATTLE.t<100'),'sampled assisted raids keep the short-session pacing');
 runs.push({seed,winner:r.eval('BATTLE.winner'),seconds:r.eval('BATTLE.t'),wave:r.eval('RAID.wave'),hens:r.eval('coopHensAlive()'),birds:r.eval('aliveA'),predators:r.eval('aliveB')});
 if(seed===3)recordedRun={state:checksum(r),actions:read(r,'REPLAY.current.actions')};
}
console.log('INFO complete assisted raid results:',JSON.stringify(runs));
assert.ok(recordedRun.actions.some(a=>a.type==='choice')&&recordedRun.actions.some(a=>a.type==='deploy'&&Number.isFinite(a.x)),'actual raid records choices and placed arrivals');
assert.deepEqual(recordedRun.actions.filter(a=>a.type==='choice').map(a=>a.k),['repair','save','recruit','repair','save','recruit'],'both regroup periods record every accepted replacement');
for(const batch of [1,4]){
 const r=boot(3,undefined,recordedRun.actions);
 r.eval(`while(BATTLE.tick<9000&&!BATTLE.over){for(let n=0;n<${batch}&&BATTLE.tick<9000&&!BATTLE.over;n++)tickRaid()}`);
 assert.equal(r.eval('VIEW.paused'),false,'all recorded choices/arrivals/commands are accepted');
 assert.deepEqual(checksum(r),recordedRun.state,'complete recorded action replay matches');
}
console.log('PASS full accepted-action replay: repeated preparation choices, placed arrivals and commands');

// Replay old accepted actions against the actual previous release, including
// checkpoints during regroup where its immediate reward differs from new games.
const baselineDir=process.env.RAID_BASELINE_DIR;
if(baselineDir){
assert.ok(fs.existsSync(path.join(baselineDir,'parts/04c_raid.js')),'RAID_BASELINE_DIR must contain the previous release');
const previous=boot(3,undefined,[],{dir:baselineDir}),legacyStates=[];
for(let tick=300;tick<=9000;tick+=300){
 assistUntil(previous,tick,false);legacyStates.push({tick,state:checksum(previous)});
 if(previous.eval('BATTLE.over'))break;
}
assert.equal(previous.eval('BATTLE.winner'),'birds');
const oldActions=read(previous,'REPLAY.current.actions'),compat=boot(3,undefined,oldActions,{sim:'2026-10-21.1',playback:true});
assert.equal(compat.eval('raidLegacyChoices()'),true);
for(const expected of legacyStates){
 compat.eval(`while(BATTLE.tick<${expected.tick}&&!BATTLE.over&&!VIEW.paused)tickRaid()`);
 assert.equal(compat.eval('VIEW.paused'),false,'previous-version actions remain accepted');
 assert.deepEqual(checksum(compat),expected.state,'previous-version replay matches released engine at tick '+expected.tick);
}
console.log('PASS previous-version replay matches released engine at all checkpoints');
}else console.log('SKIP previous-release comparison: set RAID_BASELINE_DIR to the 2026-10-21.1 release');
for(const choice of ['repair','recruit','save']){
 const old=baselineDir?boot(3,undefined,[],{dir:baselineDir}):null,now=boot(3,undefined,[],{sim:'2026-10-21.1',playback:true});
 for(const r of [old,now].filter(Boolean)){
  enterPrep(r);r.eval('COOP.sections[0].hp=0;COOP.sections[1].hp=10;COOP.breaches=1;CMD.pts=0');
  assert.equal(r.eval(`raidChoose('${choice}')`),true);
  assert.equal(r.eval("raidChoose('repair')"),false,'legacy choices stay locked');
 }
 if(choice==='repair')assert.deepEqual(read(now,'COOP.sections.slice(0,2).map(s=>s.hp)'),[240,250]);
 if(choice==='recruit')assert.equal(now.eval('TALE.bought.goose'),6);
 if(choice==='save')assert.equal(now.eval('CMD.pts'),18);
 assert.equal(now.eval('RAID.choices.length'),1,'legacy reward applies immediately');
 if(old)assert.deepEqual(checksum(now),checksum(old),'legacy '+choice+' reward matches released engine immediately');
 if(old)finishPrep(old);finishPrep(now);
 assert.equal(now.eval('RAID.choices.length'),1,'legacy reward is not repeated at expiry');
 if(choice==='recruit')assert.equal(now.eval('TALE.bought.goose'),6);
 if(old)assert.deepEqual(checksum(now),checksum(old),'legacy '+choice+' expiry matches released engine');
}
console.log('PASS previous-version immediate locked rewards and one-time commitment preserved');
const newRecording=boot(3,undefined,[],{sim:'2026-10-21.1',playback:false});enterPrep(newRecording);
assert.equal(newRecording.eval('raidLegacyChoices()'),false,'legacy compatibility applies only to playback');
newRecording.eval("raidChoose('recruit')");assert.equal(newRecording.eval('TALE.bought.goose||0'),0);

let baseline;
for(const batch of [1,2,4]){
 const r=boot(29);r.eval(`while(BATTLE.tick<7200&&!BATTLE.over){for(let n=0;n<${batch}&&BATTLE.tick<7200&&!BATTLE.over;n++)tickRaid()}`);
 const result={battle:checksum(r),raid:read(r,'raidSnapshot()')};
 if(baseline)assert.deepEqual(result,baseline);else baseline=result;
}
console.log('PASS deterministic complete raid across 1/2/4 fixed ticks per presentation frame');
