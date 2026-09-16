#!/usr/bin/env node
'use strict';
// Objective tests execute actual 04_sim, 04b_coop and UI command/replay code.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {runtime,checksum,presetRows}=require('./regression.cjs');
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
const dir=path.resolve(arg('--source-dir')||path.join(__dirname,'..'));
function boot(rows=[{k:'rooster',n:1},{k:'coon',n:1}],seed=1,actions=[]){
 const r=runtime(dir);r.eval(`bootTest(${JSON.stringify(rows)},${seed},${JSON.stringify(actions)},'defense')`);return r;
}
const json=(r,code)=>JSON.parse(r.eval(`JSON.stringify(${code})`));
const collision=boot();
assert.equal(collision.eval('COOP.active'),true);
assert.equal(collision.eval('coopBlocks(10,0,0,0)'),true);
assert.equal(collision.eval('coopBlocks(10,0,-10,0)'),true,'full diameter crossing meets intact fence');
assert.equal(collision.eval('coopBlocks(10,0,10,5)'),false,'outside movement unblocked');
assert.equal(collision.eval('coopBlocks(1,0,2,0)'),false,'movement wholly inside unblocked');
assert.equal(collision.eval('coopBlocks(1,0,1,0)'),false,'zero movement stable');
collision.eval('A.x[1]=-10;A.z[1]=0;A.vx[1]=-1200;A.vz[1]=0;coopConstrain(1,10,0)');
assert.ok(collision.eval('A.x[1]>COOP.radius'),'swept crossing is held on original side');
assert.ok(Math.abs(collision.eval('A.vx[1]'))<1e-6,'inward normal velocity removed');
collision.eval('A.x[0]=10;A.z[0]=0;A.vx[0]=1200;A.vz[0]=0;coopConstrain(0,1,0)');
assert.ok(collision.eval('A.x[0]<COOP.radius'),'inside animal cannot leave through intact panel');
// The nearby target remains out of reach across intact fencing, even for a direct hurt path.
collision.eval('A.x[0]=6.9;A.z[0]=0;A.x[1]=8.1;A.z[1]=0;A.cd[1]=0;');
const hp=collision.eval('A.hp[0]');collision.eval('hurt(0,100,1,false)');assert.equal(collision.eval('A.hp[0]'),hp);
collision.eval('attack(1,0,UNITS[A.kind[1]],1.2)');assert.equal(collision.eval('A.hp[0]'),hp,'combat attack cannot damage through intact fence');
// Actual launched movement crosses an entire run in one step; swept integration must catch it.
const airborne=boot();airborne.eval('A.x[1]=10;A.z[1]=0;A.vx[1]=-1800;A.vz[1]=0;A.fy[1]=2;A.vy[1]=0;tickTest()');
assert.ok(airborne.eval('A.x[1]>COOP.radius'),'airborne step cannot cross the roofed run');
assert.deepEqual(json(airborne,'COOP.hens.map(h=>h.hp)'),[100,100]);
const hawk=boot([{k:'rooster',n:1},{k:'hawk',n:1}]);
hawk.eval('A.x[1]=10;A.z[1]=0;A.vx[1]=-600;A.vz[1]=0;A.fy[1]=10;tickTest()');
assert.ok(hawk.eval('Math.hypot(A.x[1],A.z[1])>=COOP.radius'),'flying movement cannot bypass an intact roof/fence');
// Playing dead is a temporary state, not permission for a launched possum to bypass fencing.
const possum=boot([{k:'rooster',n:1},{k:'possum',n:1}]);
possum.eval('A.x[0]=30;A.z[0]=0;A.x[1]=10;A.z[1]=0;A.st[1]=2;A.rev[1]=2;A.hp[1]=0;A.dead[1]=0;A.fy[1]=2;A.vx[1]=-1800;A.vz[1]=0;A.vy[1]=0;tickTest()');
assert.ok(possum.eval('Math.hypot(A.x[1],A.z[1])>COOP.radius'),'launched fake-dead possum stays outside intact run');
possum.eval('while(BATTLE.tick<240&&A.rev[1]===2)tickTest()');
assert.equal(possum.eval('A.rev[1]'),0,'fixture exercises actual revival');
assert.equal(possum.eval('A.st[1]'),0);assert.ok(possum.eval('A.hp[1]>0'));
assert.ok(possum.eval('Math.hypot(A.x[1],A.z[1])>COOP.radius'),'possum cannot revive inside after a blocked launch');
// A breach opens only its own crossing. Opposite intact sectors still block a swept chord.
collision.eval('COOP.sections[0].hp=0;COOP.breaches=1');
assert.equal(collision.eval('coopBlocks(10,0,0,0)'),false);
assert.equal(collision.eval('coopBlocks(10,0,-10,0)'),true);
collision.eval('A.x[1]=6;A.z[1]=0;A.vx[1]=-10;coopConstrain(1,10,0)');
assert.equal(collision.eval('A.x[1]'),6,'walking through open breach succeeds');
// Near the sector corner, the crossed intact section matters, not merely endpoint sector.
collision.eval('A.x[1]=7;A.z[1]=1;coopConstrain(1,0,10)');
assert.ok(collision.eval('Math.hypot(A.x[1],A.z[1])>COOP.radius'),'open endpoint must not permit crossing a different intact panel');

const boundary=boot();boundary.eval('COOP.sections[0].hp=0;COOP.breaches=1;A.x[1]=5.303230285644531;A.z[1]=5.303229808807373');
assert.equal(boundary.eval('coopBlocks(8,8.1,A.x[1],A.z[1])'),true,'near-endpoint intact corner crossing cannot disappear under endpoint tolerance');
boundary.eval('coopConstrain(1,8,8.1)');assert.ok(boundary.eval('Math.hypot(A.x[1],A.z[1])>COOP.radius'));
// A sweep hitting an exposed bird cannot launch a sheltered secondary target.
const sweep=boot([{k:'rooster',n:2},{k:'bear',n:1}]);
sweep.eval('A.x[0]=8.7;A.z[0]=0;A.x[1]=6.5;A.z[1]=0;A.x[2]=8;A.z[2]=0;A.fy[1]=0;A.vy[1]=0;A.cd[2]=0;gridBuild()');
const shelter=json(sweep,'{hp:A.hp[1],fy:A.fy[1],vy:A.vy[1],vx:A.vx[1],vz:A.vz[1]}');
sweep.eval('attack(2,0,UNITS[A.kind[2]],.7)');
assert.deepEqual(json(sweep,'{hp:A.hp[1],fy:A.fy[1],vy:A.vy[1],vx:A.vx[1],vz:A.vz[1]}'),shelter,'fence blocks both damage and sweep launch');
console.log('PASS fence line/swept collision, near-corner crossing, sheltered sweep blocking and airborne/flying/fake-dead integration');

// Exercise the deterministic objective routing independently of combat damage/target switching.
const routing=boot();routing.eval('A.x[0]=-10;A.z[0]=0;A.x[1]=0;A.z[1]=0;COOP.sections[0].hp=0;COOP.breaches=1;coopTick(1/60)');
assert.ok(routing.eval('coopHeading(0,1).z>0'),'blocked defender takes an outside route toward the available breach');
routing.eval(`let routeSteps=0,illegalCrossings=0;
 while(routeSteps<600&&Math.hypot(A.x[0],A.z[0])>=COOP.radius-.4){
   const oldX=A.x[0],oldZ=A.z[0],h=coopHeading(0,1)||{x:A.x[1]-oldX,z:A.z[1]-oldZ,stop:false};
   if(!h.stop){const d=Math.hypot(h.x,h.z);if(d){A.x[0]+=h.x/d*.08;A.z[0]+=h.z/d*.08;}}
   coopConstrain(0,oldX,oldZ);
   if(coopBlocks(oldX,oldZ,A.x[0],A.z[0]))illegalCrossings++;
   routeSteps++;
 }`);
assert.equal(routing.eval('illegalCrossings'),0,'defender routing never crosses an intact panel');
assert.ok(routing.eval('Math.hypot(A.x[0],A.z[0])<COOP.radius-.4'),'defender follows breach route inside to intercept an intruder');
assert.ok(routing.eval('routeSteps<600'),'breach route makes forward progress');
routing.eval('COOP.sections.forEach(s=>s.hp=s.maxHp);COOP.breaches=0;A.x[0]=0;A.z[0]=0;A.x[1]=10;A.z[1]=0;coopTick(1/60)');
assert.equal(routing.eval('coopHeading(0,1).stop'),true,'sheltered defender waits when every exit is intact');
console.log('PASS defender routes through available breach without crossing intact panels');

const repair=boot();assert.equal(repair.eval("cmdReady('repair')"),false,'full fence needs no repair');
repair.eval('COOP.sections[0].hp=0;COOP.breaches=1;A.x[1]=7;A.z[1]=.1;COOP.hens[0].hp=73');
repair.eval('seedSim(777)');const expectedRepairRandom=repair.eval('SR()');repair.eval('seedSim(777)');
assert.equal(repair.eval("applyCommand('repair')"),true);
assert.equal(repair.eval('SR()'),expectedRepairRandom,'repair does not draw combat RNG');
assert.equal(repair.eval('COOP.sections[0].hp'),240);assert.equal(repair.eval('COOP.breaches'),0);
assert.equal(repair.eval("CMD.cd.repair"),20);assert.equal(repair.eval('coopBlocks(10,0,0,0)'),true,'repair restores collision');
assert.ok(repair.eval('Math.hypot(A.x[1],A.z[1])>COOP.radius'),'repair safely removes boundary overlap');
assert.equal(repair.eval('COOP.hens[0].hp'),73,'fence repair cannot heal objective hens');
assert.equal(repair.eval("applyCommand('repair')"),false,'cooldown prevents repeated free repairs');
repair.eval('cmdStep(20);COOP.sections[1].hp=200');
assert.equal(repair.eval("applyCommand('repair')"),true);assert.equal(repair.eval('COOP.sections[1].hp'),440,'weakest section chosen');
repair.eval('cmdStep(20);COOP.sections.forEach(s=>s.hp=s.maxHp)');
const before=repair.eval('CMD.cd.repair');assert.equal(repair.eval("applyCommand('repair')"),false);assert.equal(repair.eval('CMD.cd.repair'),before);
assert.ok(repair.eval('COOP.sections.every(s=>s.hp>=0&&s.hp<=s.maxHp)&&COOP.breaches>=0'));
repair.eval("bootTest([{k:'rooster',n:1},{k:'coon',n:1}],1,[],'battle')");assert.equal(repair.eval("cmdReady('repair')"),false,'repair unavailable in open battle');
console.log('PASS repair selection, breach closure/collision, overlap correction, HP bounds and cooldown');

const objective=boot();objective.eval('aliveA=0;A.st[0]=2;BATTLE.t=1;checkWin(1/60)');
assert.equal(objective.eval('BATTLE.over'),false,'defender army loss does not end hen defense');
objective.eval('COOP.sections[0].hp=0;COOP.breaches=1;COOP.entered=true;A.x[1]=0;A.z[1]=0;COOP.hens[0].hp=0');
for(const time of [89.999,90,120,125,180]){
 objective.eval(`BATTLE.t=${time};checkWin(1/60)`);
 assert.equal(objective.eval('BATTLE.over'),false,'breach, intruder, first hen loss, and elapsed time leave a rescue window');
}
objective.eval('CMD.pts=0;cmdStep(20)');assert.ok(objective.eval('CMD.pts')>=20,'reinforcement points keep accruing after old deadlines');
assert.equal(objective.eval("canDeploy(DEPLOY.find(d=>d.k==='goose'))"),true,'reinforcements remain available after a breach and first hen loss');
objective.eval('COOP.hens[1].hp=0;checkWin(1/60)');
assert.equal(objective.eval('BATTLE.winner'),'coons');assert.match(objective.eval('BATTLE.reason'),/Both hens/);
objective.eval("bootTest([{k:'rooster',n:1},{k:'coon',n:1}],1,[],'defense');COOP.hens[0].hp=0;aliveB=0;checkWin(1/60)");
assert.equal(objective.eval('BATTLE.winner'),'birds');assert.match(objective.eval('BATTLE.reason'),/predators stopped/);
const timed=boot([{k:'coon',n:1}],8);
// Durable fence isolates elapsed-time behavior without changing animal stats.
timed.eval('COOP.sections.forEach(s=>{s.hp=s.maxHp=1000000});while(BATTLE.tick<7800&&!BATTLE.over)tickTest()');
assert.equal(timed.eval('BATTLE.over'),false);assert.equal(timed.eval('aliveB'),1);assert.equal(timed.eval('coopHensAlive()'),2);
assert.ok(timed.eval('BATTLE.t>125'),'actual fixed steps continue beyond both former time limits');
// Long raids can exceed the original two-minute render reservation for a species.
const capacity=boot();capacity.eval("var growths=0;buildOneSquad=function(k){growths++;SQUADS[UI_[k]]={dispose(){}}};var packet=DEPLOY.find(d=>d.k==='goose');var reserved=SQUAD_NEED.goose;while(TALE.bought.goose===undefined||TALE.bought.goose<=reserved){CMD.pts=80;applyDeploy(packet)}");
assert.ok(capacity.eval('growths>0&&SQUAD_NEED.goose>=TALE.bought.goose'),'late reinforcement packets grow their render reservation');
console.log('PASS rescue window after breach/first hen loss, no timed victory, late reinforcement points/capacity, both-hen defeat and predator-clear victory');

// Rally is a recorded, temporary steering order, with no health/stat changes.
const rally=boot();rally.eval('A.x[0]=16;A.z[0]=0;A.x[1]=22;A.z[1]=0');
assert.equal(rally.eval('coopHeading(0,1)'),null,'ordinary defenders pursue the nearby enemy');
const rallyHp=json(rally,'[A.hp[0],...COOP.hens.map(h=>h.hp)]');
assert.equal(rally.eval("cmdFire('rally')"),true);assert.equal(rally.eval('CMD.rally'),0,'rally waits for a fixed simulation tick');
rally.eval('tickTest()');assert.ok(rally.eval('CMD.rally>7.9&&CMD.cd.rally>21.9'));
assert.ok(rally.eval('coopHeading(0,1).x<0'),'rally redirects a nearby defender toward the coop');
assert.equal(rally.eval("applyCommand('rally')"),false,'cooldown rejects immediate reuse');
assert.deepEqual(json(rally,'[A.hp[0],...COOP.hens.map(h=>h.hp)]'),rallyHp,'rally does not heal or modify health');
rally.eval('A.x[0]=30;A.x[1]=36');assert.equal(rally.eval('coopHeading(0,1)'),null,'distant defenders retain their normal target');
rally.eval('A.x[0]=10;A.x[1]=10.5');assert.equal(rally.eval('coopHeading(0,1)'),null,'defenders keep fighting an enemy in reach');
rally.eval('A.x[0]=-10;A.z[0]=0;A.x[1]=0;A.z[1]=0;COOP.sections[0].hp=0;COOP.breaches=1;coopTick(1/60)');
rally.eval('var rallyCrossings=0;for(var step=0;step<600;step++){const ox=A.x[0],oz=A.z[0],h=coopHeading(0,-1),len=Math.hypot(h.x,h.z)||1;if(len<.1)break;A.x[0]+=h.x/len*.08;A.z[0]+=h.z/len*.08;if(coopBlocks(ox,oz,A.x[0],A.z[0]))rallyCrossings++;coopConstrain(0,ox,oz)}');
assert.equal(rally.eval('rallyCrossings'),0,'rally uses an opening instead of crossing intact fencing');
assert.ok(rally.eval('Math.hypot(A.x[0],A.z[0])<COOP.radius-.4'),'rally reaches intruders inside through a real breach');
rally.eval('cmdStep(8)');assert.equal(rally.eval('CMD.rally'),0);assert.ok(rally.eval('CMD.cd.rally>0'));
rally.eval('cmdStep(22)');assert.equal(rally.eval("cmdReady('rally')"),true);
rally.eval('VIEW.paused=true');assert.equal(rally.eval("cmdFire('rally')"),false,'paused input is rejected');
rally.eval("bootTest([{k:'rooster',n:1},{k:'coon',n:1}],1,[],'battle')");
assert.equal(rally.eval('CMD.rally'),0,'reset clears active rally');assert.equal(rally.eval("cmdReady('rally')"),false,'rally is defense-only');
const rallyActions=[{tick:1,type:'command',k:'rally'},{tick:2,type:'deploy',k:'goose'},{tick:500,type:'command',k:'horn'}];
let rallyBaseline=null;
for(const batch of [1,2,4]){
 const r=boot([{k:'rooster',n:260},{k:'coon',n:24}],3,rallyActions);
 r.eval(`while(BATTLE.tick<900&&!BATTLE.over){for(let n=0;n<${batch}&&BATTLE.tick<900&&!BATTLE.over;n++)tickTest()}`);
 assert.equal(r.eval('VIEW.paused'),false,'rally recording plays back without rejected actions');
 const state=checksum(r);if(rallyBaseline)assert.deepEqual(state,rallyBaseline);else rallyBaseline=state;
}
console.log('PASS rally queue/cooldown/expiry/reset, local regrouping, melee combat, breach routing, pause/mode guards and 1/2/4 replay');
const healthHud=boot();healthHud.eval(`var healthElements={};$=id=>healthElements[id]||(healthElements[id]={textContent:'',value:0,attrs:{},classes:{},setAttribute(k,v){this.attrs[k]=v},classList:{toggle(k,v){healthElements[id].classes[k]=v}}});COOP.hens[0].hp=24;COOP.hens[1].hp=0;COOP.intruders=1;coopHud()`);
assert.equal(healthHud.eval('healthElements.henHealth0.value'),24);
assert.equal(healthHud.eval('healthElements.henHealthText0.textContent'),'24%');
assert.equal(healthHud.eval('healthElements.henHealth0.classes.critical'),true);
assert.equal(healthHud.eval("healthElements.henHealth1.attrs['aria-valuetext']"),'Lost');
assert.equal(healthHud.eval('healthElements.henHealthText1.textContent'),'Lost');
assert.equal(healthHud.eval('healthElements.coopStatus.textContent'),'Predators inside!');
healthHud.eval("bootTest([{k:'rooster',n:1},{k:'coon',n:1}],1,[],'defense');coopHud()");
assert.equal(healthHud.eval('healthElements.henHealth0.value'),100);
assert.equal(healthHud.eval('healthElements.henHealth1.classes.lost'),false);
console.log('PASS individual hen health/critical/lost display, accessible values and new-raid reset');


const codec=boot();codec.eval('CFG.rosterOverride=[{k:"rooster",n:160},{k:"coon",n:24}];CFG.mode="defense";CFG.seed=777;REPLAY.current=null;location.search="?"+encodeFight()');
assert.equal(codec.eval('decodeFight()'),true);assert.equal(codec.eval('CFG.mode'),'defense');assert.equal(codec.eval('REPLAY.loaded.mode'),'defense');
assert.throws(()=>codec.eval("validateFight({...configFight(),mode:'unknown'})"),/objective/);
codec.eval('CFG.mode="battle";REPLAY.current=null;location.search="?"+encodeFight();decodeFight()');assert.equal(codec.eval('CFG.mode'),'battle');
console.log('PASS shared defense/battle modes and invalid-objective rejection');

const unattended=boot([{k:'rooster',n:1},{k:'coon',n:1}],7);
unattended.eval('while(BATTLE.tick<5500&&!BATTLE.over)tickTest()');
assert.equal(unattended.eval('BATTLE.winner'),'coons','unattended predator eventually reaches hens');
assert.ok(unattended.eval('COOP.breaches>0&&COOP.entered'));
assert.equal(unattended.eval('coopHensAlive()'),0);
console.log('PASS unattended predator breaches run, enters and kills objective hens');

const results=[],defaultRows=presetRows(runtime(dir),'defense');
for(const seed of [1,3,7]){
 const r=runtime(dir),rows=defaultRows;r.eval(`bootTest(${JSON.stringify(rows)},${seed},[],'defense');while(BATTLE.tick<5500&&!BATTLE.over)tickTest()`);
 assert.equal(r.eval('BATTLE.over'),true,'default defense reaches an objective verdict');
 const final=checksum(r);results.push({seed,roster:rows,...final});
 r.eval(`bootTest(${JSON.stringify(rows)},${seed},[],'defense');while(BATTLE.tick<5500&&!BATTLE.over)tickTest()`);
 assert.deepEqual(checksum(r),final,'same-context reset includes all coop state');
 console.log(`PASS default defense seed ${seed}: ${final.winner}, ${(final.tick/60).toFixed(1)}s, ${final.coop.hens.filter(h=>h.hp>0).length} hens, ${final.coop.breaches} breaches, ${final.aliveA}/${final.aliveB} army survivors`);
}
// Record intervention decisions once. Replay uses the actual accepted action log,
// including a repair only when fencing first becomes damaged.
const recorder=boot([{k:'rooster',n:160},{k:'coon',n:24}],7);
recorder.eval("cmdFire('horn');deploy(DEPLOY.find(d=>d.k==='goose'));while(BATTLE.tick<5500&&!BATTLE.over){if(cmdReady('repair'))cmdFire('repair');tickTest()}");
const recorded=checksum(recorder),actions=json(recorder,'REPLAY.current.actions');
assert.ok(actions.some(a=>a.type==='deploy')&&actions.some(a=>a.k==='repair'),'intervention log contains deployment and repair');
for(const batch of [1,2,4]){
 const replay=boot([{k:'rooster',n:160},{k:'coon',n:24}],7,actions);
 replay.eval(`while(BATTLE.tick<5500&&!BATTLE.over){for(let j=0;j<${batch}&&!BATTLE.over;j++)tickTest()}`);
 assert.deepEqual(checksum(replay),recorded,`complete defense command replay at ${batch} tick/frame`);
 assert.equal(replay.eval('VIEW.paused'),false,'every recorded action successfully reapplied');
}
console.log(`PASS complete defense intervention replay at 1/2/4 ticks per frame: ${recorded.winner}, ${(recorded.tick/60).toFixed(1)}s, ${actions.length} recorded commands`);
if(arg('--output'))fs.writeFileSync(arg('--output'),JSON.stringify({defaults:results,intervention:{...recorded,actions}},null,2)+'\n');
console.log('PASS all coop objective checks. Rendering/audio/interactive seek UI excluded.');
