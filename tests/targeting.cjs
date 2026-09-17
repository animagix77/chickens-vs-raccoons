#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {runtime,presetRows}=require('./regression.cjs');
const dir=path.resolve(__dirname,'..');
function boot(rows=[{k:'rooster',n:2},{k:'coon',n:2}],mode='battle'){
 const r=runtime(dir);r.eval(`bootTest(${JSON.stringify(rows)},17,[],${JSON.stringify(mode)})`);return r;
}
// Far apart opposing threats must split the flock instead of attracting it to their midpoint.
for(const mode of ['battle','defense']){
 const r=boot(undefined,mode);
 r.eval('A.x.set([-15,15,-25,25]);A.z.fill(10);A.vx.fill(0);A.vz.fill(0);tickTest()');
 assert.equal(r.eval('A.tgt[0]'),2);assert.equal(r.eval('A.tgt[1]'),3);
 assert.ok(r.eval('A.vx[0]<0&&A.vx[1]>0'),'defenders pursue opposite local threats');
 // A newly closer predator replaces the old target within six fixed ticks.
 r.eval('A.x[3]=-17;A.z[3]=10;for(let n=0;n<6;n++)tickTest()');
 assert.equal(r.eval('A.tgt[0]'),3);
 r.eval('A.st[3]=2;aliveB--;tickTest()');assert.equal(r.eval('A.tgt[0]'),2,'dead targets replaced on next tick');
}
console.log('PASS independent distant targets and movement, closer-threat response, immediate casualty retargeting in both modes');
// The nearest target need not be in the first occupied grid ring.
const ring=boot([{k:'rooster',n:1},{k:'coon',n:2}]);
ring.eval('var edge=10*CS-ARENA_R-12;A.x.set([edge+.05,edge+4.7,edge-2.41]);A.z.set([edge+.05,edge+4.7,edge+.05]);gridBuild()');
assert.equal(ring.eval('nearestPredator(0)'),2,'closer enemy outside first occupied ring wins');
ring.eval('A.x.set([0,4,-4]);A.z.fill(0);gridBuild()');assert.equal(ring.eval('nearestPredator(0)'),1,'equal distances break ties by unit index');
ring.eval('seedSim(987)');const next=ring.eval('SR()');ring.eval('seedSim(987);nearestPredator(0)');assert.equal(ring.eval('SR()'),next,'target choice consumes no random numbers');
const sky=boot([{k:'hen',n:1},{k:'coon',n:1},{k:'hawk',n:1}]);
sky.eval('A.x.set([0,10,1]);A.z.fill(0);A.fy[2]=10;gridBuild()');
assert.equal(sky.eval('nearestPredator(0)'),1,'ignore predators too high to attack');
sky.eval('A.fy[2]=0');assert.equal(sky.eval('nearestPredator(0)'),2,'diving predator becomes a target');
sky.eval('A.st[1]=2;A.fy[2]=10');assert.equal(sky.eval('nearestPredator(0)'),-1,'no eligible enemy has no fabricated target');
console.log('PASS nearest distance across cell rings, stable ties, airborne eligibility and RNG isolation');
// Keep the individual target through blocked line of sight and use the real opening.
const fence=boot([{k:'rooster',n:1},{k:'coon',n:1}],'defense');
fence.eval('A.x.set([-10,0]);A.z.fill(0);COOP.sections[0].hp=0;COOP.breaches=1;tickTest()');
assert.equal(fence.eval('A.tgt[0]'),1,'blocked predator retained for routing');
assert.ok(fence.eval('A.vz[0]>0'),'defender goes around intact panels toward breach');
const rally=boot(undefined,'defense');
rally.eval('A.x.set([-3,3,-5,5]);A.z.fill(0);CMD.rally=8;gridBuild();coopTick(1/60)');
assert.ok(rally.eval('coopHeading(0,-1).x<0&&coopHeading(1,-1).x>0'),'rally defenders intercept their own nearest intruder');
console.log('PASS fence-aware individual pursuit and split intruder interception during Rally');
// Compare varied layouts against an independent exhaustive distance oracle.
const scattered=boot([{k:'rooster',n:80},{k:'coon',n:40}]);
scattered.eval(`for(let i=0;i<N;i++){A.x[i]=Math.sin(i*12.9898)*27;A.z[i]=Math.cos(i*7.233)*27;}gridBuild();
 for(let i=0;i<80;i++){
   const expected=Array.from({length:40},(_,k)=>k+80).sort((a,b)=>
     (A.x[a]-A.x[i])**2+(A.z[a]-A.z[i])**2-((A.x[b]-A.x[i])**2+(A.z[b]-A.z[i])**2)||a-b)[0];
   if(nearestPredator(i)!==expected)throw Error('Nearest target mismatch for '+i);
 }`);
console.log('PASS 80 varied defender positions against independent distance oracle');
// Target-selection cost only: exclude rendering, audio, and the rest of the VM simulation.
const large=boot();const rows=presetRows(large,'silly');
large.eval(`bootTest(${JSON.stringify(rows)},19);gridBuild();function targetPass(){for(let i=0;i<N;i++)if(A.team[i]===0&&i%6===BATTLE.tick%6)nearestPredator(i);BATTLE.tick++}`);
large.eval('for(let n=0;n<12;n++)targetPass()');
const start=performance.now();large.eval('for(let n=0;n<60;n++)targetPass()');
console.log(`INFO Max Chaos target selection: ${((performance.now()-start)/60).toFixed(2)} ms per fixed tick (headless; not GPU/frame performance)`);
