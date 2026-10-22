#!/usr/bin/env node
'use strict';
// Judge Dean LLC — deterministic waves, preparation choices and predator roles.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {runtime,checksum}=require('./regression.cjs');
const dir=path.resolve(__dirname,'..');
function boot(seed=3,rows=[{k:'rooster',n:260}],actions=[]){
 const r=runtime(dir);
 if(r.eval("typeof RAID==='undefined'"))r.eval(fs.readFileSync(path.join(dir,'parts/04c_raid.js'),'utf8'));
 r.eval(`CFG.seed=${seed};buildOneSquad=function(k){SQUADS[UI_[k]]={dispose(){}}};bootTest(${JSON.stringify(rows)},${seed},${JSON.stringify(actions)},'raid');if(!RAID.active)raidReset();
 function tickRaid(){tickTest();}
 function clearRaidPredators(){for(let i=0;i<N;i++)if(A.team[i]===1&&A.st[i]!==2){A.st[i]=2;A.hp[i]=0;aliveB--}}
 function raidSnapshot(){return {phase:RAID.phase,wave:RAID.wave,pending:RAID.pending,choices:RAID.choices,prepLeft:RAID.prepLeft,wind:Array.from(RAID.bearWind.slice(0,N)),ready:Array.from(RAID.bearReady.slice(0,N)),section:Array.from(RAID.bearSection.slice(0,N))}}
 `);return r;
}
const read=(r,s)=>JSON.parse(r.eval('JSON.stringify('+s+')'));
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
assert.deepEqual(read(opening,'COOP.sections.slice(0,2).map(s=>s.hp)'),[240,250]);assert.equal(opening.eval('COOP.breaches'),0);
assert.equal(opening.eval('COOP.hens[0].hp'),30,'supplies never heal objective hens');
assert.ok(opening.eval('Math.hypot(A.x[0],A.z[0])>COOP.radius'),'closing panel clears boundary overlap');
assert.equal(opening.eval("raidChoose('recruit')"),false,'only one reward each intermission');
opening.eval("while(RAID.phase==='prep')tickRaid()");assert.equal(opening.eval('RAID.wave'),2);assert.equal(opening.eval('RAID.choice'),null);
console.log('PASS scheduled packets, no premature victory, prep movement freeze, repair/overlap and one-choice guard');

const auto=boot();auto.eval("clearRaidPredators();RAID.pending=[];RAID.pendingRemaining=0;raidCheckWin();CMD.pts=0;while(RAID.phase==='prep')tickRaid()");
assert.equal(auto.eval('RAID.wave'),2);assert.equal(auto.eval('RAID.choices[0].choice'),'save');assert.ok(auto.eval('CMD.pts>=18'));
const recruit=boot();recruit.eval("clearRaidPredators();RAID.pending=[];RAID.pendingRemaining=0;raidCheckWin()");
const birds=recruit.eval('aliveA');assert.equal(recruit.eval("raidChoose('recruit')"),true);assert.equal(recruit.eval('aliveA'),birds+6);
assert.equal(recruit.eval('TALE.bought.goose'),6);assert.ok(recruit.eval('SQUAD_NEED.goose>=6'));
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
 const r=boot(seed);r.eval(`while(BATTLE.tick<9000&&!BATTLE.over){
  if(RAID.phase==='prep'&&!RAID.choice)queueBattleAction('choice','recruit');
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
 assert.equal(r.eval('BATTLE.over'),true,'full scenario reaches hen-loss or last-wave-clear verdict');
 assert.equal(r.eval('BATTLE.winner'),'birds','the assisted defense policy can protect the hens');
 assert.ok(r.eval('BATTLE.t>=60&&BATTLE.t<100'),'sampled assisted raids keep the short-session pacing');
 runs.push({seed,winner:r.eval('BATTLE.winner'),seconds:r.eval('BATTLE.t'),wave:r.eval('RAID.wave'),hens:r.eval('coopHensAlive()'),birds:r.eval('aliveA'),predators:r.eval('aliveB')});
 if(seed===3)recordedRun={state:checksum(r),actions:read(r,'REPLAY.current.actions')};
}
console.log('INFO complete assisted raid results:',JSON.stringify(runs));
assert.ok(recordedRun.actions.some(a=>a.type==='choice')&&recordedRun.actions.some(a=>a.type==='deploy'&&Number.isFinite(a.x)),'actual raid records choices and placed arrivals');
for(const batch of [1,4]){
 const r=boot(3,undefined,recordedRun.actions);
 r.eval(`while(BATTLE.tick<9000&&!BATTLE.over){for(let n=0;n<${batch}&&BATTLE.tick<9000&&!BATTLE.over;n++)tickRaid()}`);
 assert.equal(r.eval('VIEW.paused'),false,'all recorded choices/arrivals/commands are accepted');
 assert.deepEqual(checksum(r),recordedRun.state,'complete recorded action replay matches');
}
console.log('PASS full accepted-action replay: preparation choices, placed arrivals and commands');

let baseline;
for(const batch of [1,2,4]){
 const r=boot(29);r.eval(`while(BATTLE.tick<7200&&!BATTLE.over){for(let n=0;n<${batch}&&BATTLE.tick<7200&&!BATTLE.over;n++)tickRaid()}`);
 const result={battle:checksum(r),raid:read(r,'raidSnapshot()')};
 if(baseline)assert.deepEqual(result,baseline);else baseline=result;
}
console.log('PASS deterministic complete raid across 1/2/4 fixed ticks per presentation frame');
