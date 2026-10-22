#!/usr/bin/env node
// Judge Dean LLC — arrivals, challenge validation and recorded player choices.
const assert=require('node:assert/strict');
const {runtime,checksum}=require('./regression.cjs');
const r=runtime(process.cwd());
r.eval("bootTest([{k:'rooster',n:260}],77,[],'raid');CMD.pts=80");
assert.equal(r.eval("rosterList().every(r=>UNITS[UI_[r.k]].team===0)"),true);
assert.equal(r.eval('aliveB'),8,'only first wave packet is present at start');
const n=r.eval('N');
assert.equal(r.eval("queueBattleAction('deploy','goose',{x:ARENA_R*.88,z:0})"),true);
r.eval('tickTest()');
assert.equal(r.eval('N'),n);assert.equal(r.eval('DEPLOYMENT.pending.length'),1);
assert.ok(r.eval('CMD.pts<69'),'supplies charged at order');
r.eval('while(BATTLE.tick<110)tickTest()');
assert.equal(r.eval('DEPLOYMENT.pending.length'),0);assert.equal(r.eval('N'),n+6,'arrival is delayed by 1.8s');
assert.equal(r.eval('TALE.spent'),12,'arrival does not charge twice');
assert.equal(r.eval('TALE.bought.goose'),6);
const actions=JSON.parse(r.eval('JSON.stringify(REPLAY.current.actions)'));
assert.ok(Number.isFinite(actions[0].x));
const expected=checksum(r);
for(const batch of [1,2,4]){
 const replay=runtime(process.cwd());replay.eval(`bootTest([{k:'rooster',n:260}],77,${JSON.stringify(actions)},'raid');CMD.pts=80;while(BATTLE.tick<110){for(let n=0;n<${batch}&&BATTLE.tick<110;n++)tickTest()}`);
 assert.deepEqual(checksum(replay),expected,'recorded position and arrival clock replay exactly');
}
r.eval('VIEW.paused=true');assert.equal(r.eval("queueBattleAction('deploy','goose',{x:ARENA_R*.88,z:0})"),false);
r.eval('VIEW.paused=false;REPLAY.playback=true');assert.equal(r.eval("queueBattleAction('command','horn')"),false);
r.eval("bootTest([{k:'rooster',n:260}],77,[],'raid');CMD.pts=80");
assert.equal(r.eval("applyDeploy(DEPLOY.find(d=>d.k==='goose'),{x:0,z:0})"),false,'interior invalidarrival cannot spend');
assert.equal(r.eval('CMD.pts'),80);
r.eval("queueBattleAction('deploy','goose',{x:ARENA_R*.88,z:0});tickTest();bootTest([{k:'rooster',n:260}],77,[],'raid')");assert.equal(r.eval('DEPLOYMENT.pending.length'),0,'new raid cancels pending arrivals');
r.eval("configureDaily('2026-10-21');REPLAY.current=null");
assert.equal(r.eval("validDailyDate('2026-02-30')"),false);
assert.equal(r.eval("JSON.stringify(validateFight(configFight()))===JSON.stringify(configFight())"),true);
assert.throws(()=>r.eval("validateFight({...configFight(),seed:1})"),/daily/);
assert.throws(()=>r.eval("validateFight({...configFight(),roster:[{k:'rooster',n:4000}]})"),/daily/);
assert.throws(()=>r.eval("validateFight({...configFight(),actions:[{tick:2,type:'deploy',k:'goose'}]})"),/arrival/);
assert.throws(()=>r.eval("validateFight({...configFight(),actions:[{tick:2,type:'deploy',k:'goose',x:Infinity,z:0}]})"),/arrival/);
r.eval("location.search='?daily=2026-10-21';decodeFight()");assert.equal(r.eval('CFG.challenge'),'2026-10-21');assert.equal(r.eval('CFG.seed'),r.eval("dailySeed('2026-10-21')"));
assert.equal(r.eval("JSON.stringify(rosterList())"),'[{"k":"rooster","n":260}]');
assert.equal(r.eval("validateFight({...configFight(),challenge:null,roster:[{k:'rooster',n:4000},{k:'goose',n:125}]}).roster[0].n"),4000,'large valid custom raids can be shared');
assert.throws(()=>r.eval("validateRoster([{k:'rooster',n:MAXA}], 'raid')"),/reserved/,'setup reserves all future predators');
assert.throws(()=>r.eval("validateFight({...configFight(),challenge:null,roster:[{k:'rooster',n:MAXA}]})"),/reserved/,'replay uses the same capacity rule');
assert.equal(r.eval("validateFight({...configFight(),sim:'2026-10-21.1'}).sim"),'2026-10-21.1','previous raid links keep their recorded rules');
assert.equal(r.eval("validateFight({...configFight(),sim:'2026-10-22.1'}).sim"),'2026-10-22.1','editable-choice replays keep their recorded wave sizes');
for(const sim of ['2026-10-21.1','2026-10-22.1']){
  assert.equal(r.eval(`validateFight({...configFight(),sim:'${sim}',challenge:null,roster:[{k:'rooster',n:5155}]}).roster[0].n`),5155,'legacy capacity is retained');
}
const raidLimit=r.eval("rosterLimit('raid')");
assert.ok(raidLimit>=4125,'large supported flocks retain room for their scaled raid');
assert.ok(r.eval(`raidPlanTotal(${raidLimit})+${raidLimit}+80<=MAXA`),'current limit includes all waves and reinforcement space');
assert.ok(r.eval(`raidPlanTotal(${raidLimit+1})+${raidLimit+1}+80>MAXA`),'the next starting unit exceeds the planned capacity');
assert.equal(r.eval(`validateRoster([{k:'rooster',n:${raidLimit}}],'raid')`),raidLimit);
assert.throws(()=>r.eval(`validateRoster([{k:'rooster',n:${raidLimit+1}}],'raid')`),/reserved/);
assert.equal(r.eval("rosterLimit('battle')"),r.eval('MAXA'),'Open Battle capacity is unchanged');
assert.throws(()=>r.eval("validateFight({...configFight(),sim:'unsupported'})"),/different simulator/);
console.log('PASS raid arrival payment/delay/coordinates/reset, fixed-frame recorded replay, daily seed/roster/date validation, pause/playback guards');

// A paused countdown is a safe place to reconsider; inputs still take effect on
// a fixed tick so the eventual choice can be replayed without wall-clock timing.
r.eval("bootTest([{k:'rooster',n:260}],77,[],'raid');RAID.phase='prep';RAID.prepLeft=8;VIEW.paused=true");
const pausedState=r.eval('JSON.stringify({tick:BATTLE.tick,time:RAID.prepLeft,n:N,pts:CMD.pts,sections:COOP.sections})');
assert.equal(r.eval("queueBattleAction('choice','repair')"),true);
assert.equal(r.eval("queueBattleAction('choice','recruit')"),true);
assert.equal(r.eval("queueBattleAction('choice','save')"),true);
assert.equal(r.eval("queueBattleAction('choice','save')"),false,'same selection is a no-op');
assert.equal(r.eval('REPLAY.pending.length'),1,'rapid changes coalesce before a simulation tick');
assert.equal(r.eval('REPLAY.pending[0].k'),'save');
assert.equal(r.eval('REPLAY.current.actions.length'),0,'paused edits are not prematurely recorded');
r.eval('tickTest()');
assert.equal(r.eval('JSON.stringify({tick:BATTLE.tick,time:RAID.prepLeft,n:N,pts:CMD.pts,sections:COOP.sections})'),pausedState,'paused selections cannot change the timer or grant rewards');
r.eval('VIEW.paused=false;tickTest()');
assert.equal(r.eval('RAID.choice'),'save');
assert.equal(r.eval('REPLAY.current.actions.length'),1);
assert.equal(r.eval('RAID.choices.length'),0,'selected reward is not committed before zero');
assert.equal(r.eval("queueBattleAction('choice','recruit')"),true);
assert.equal(r.eval("queueBattleAction('choice','save')"),true,'returning to current selection cancels the pending change');
assert.equal(r.eval('REPLAY.pending.length'),0);
r.eval('tickTest()');assert.equal(r.eval('REPLAY.current.actions.length'),1,'cancelled changes cannot cause a replay no-op failure');
r.eval('COOP.sections[0].hp=20;COOP.sections[1].hp=40;RAID.prepLeft=1/60');
assert.equal(r.eval("queueBattleAction('choice','repair')"),true);
r.eval('tickTest()');
assert.equal(r.eval('RAID.wave'),2);
assert.equal(r.eval('RAID.choices.length'),1);
assert.equal(r.eval('RAID.choices[0].choice'),'repair','the last eligible tick wins');
assert.equal(r.eval('COOP.sections[0].hp'),260);assert.equal(r.eval('COOP.sections[1].hp'),280);
assert.equal(r.eval("TALE.bought.goose||0"),0,'abandoned recruits never spawn');
assert.equal(r.eval("queueBattleAction('choice','save')"),false,'the next wave closes editing');
r.eval("bootTest([{k:'rooster',n:260}],77,[],'raid')");
assert.equal(r.eval('RAID.choice'),null);assert.equal(r.eval('REPLAY.pending.length'),0,'new fights clear pending selections');
console.log('PASS editable regroup choices, paused staging, rapid changes/cancellation, final-tick commit, single reward and reset');
