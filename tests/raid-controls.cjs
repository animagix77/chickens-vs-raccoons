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
console.log('PASS raid arrival payment/delay/coordinates/reset, fixed-frame recorded replay, daily seed/roster/date validation, pause/playback guards');
