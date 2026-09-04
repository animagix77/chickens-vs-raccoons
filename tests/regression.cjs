#!/usr/bin/env node
'use strict';
// Headless simulation checks. Rendering and audio are deliberately stubbed, not benchmarked.
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const assert=require('node:assert/strict'), crypto=require('node:crypto');
const args=process.argv.slice(2), arg=k=>{ const i=args.indexOf(k); return i<0?null:args[i+1]; };
const source=path.resolve(arg('--source-dir')||path.join(__dirname,'..'));
const baseline=arg('--baseline-dir');
function runtime(dir){
  const read=n=>fs.readFileSync(path.join(dir,'parts',n),'utf8');
  const core=read('02_core.js'), ui=read('06_ui.js');
  const noop=()=>{}, element={textContent:'',classList:{add:noop,remove:noop,toggle:noop},style:{},setAttribute:noop};
  const timers=[]; let audioCalls=0;
  const c=vm.createContext({console,URLSearchParams,Set,Math,Buffer,
    location:{origin:'https://test.invalid',pathname:'/',search:''},history:{replaceState:noop},
    document:{body:{classList:{contains:()=>false}}},$:()=>element,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:noop,
    sfx:()=>audioCalls++,spawnPuff:noop,spawnFeathers:noop,spawnBlood:noop,spawnMist:noop,addStain:noop,
    killFeed:noop,killFeedRaw:noop,resetNames:noop,earnName:()=> 'Test animal',renderAgents:noop,
    oneShot:()=>true,sting:noop,floodPower:()=>1});
  vm.runInContext(`const TAU=Math.PI*2, clamp=(n,a,b)=>Math.max(a,Math.min(b,n)), lerp=(a,b,t)=>a+(b-a)*t;
    let ARENA_R=30,NIGHT=false,DETAIL=2; const DEAD_WEIGHT=.34;
    const sun={castShadow:true,shadow:{mapSize:{x:2048,set(x){this.x=x;}},map:null}};
    const detailFor=()=>2,setDetail=()=>false;
    function buildArena(r,n){ARENA_R=r;NIGHT=n;}
  `+core.slice(core.indexOf('function mulberry('),core.indexOf('const spick'))+core.slice(core.indexOf('const spick'),core.indexOf('\n',core.indexOf('const spick')))+
  read('02c_units.js')+read('04_sim.js')+ui.slice(0,ui.indexOf('const CALL='))+
  ui.slice(ui.indexOf('const PRESETS='),ui.indexOf("document.querySelectorAll('.mini button')"))+
  ui.slice(ui.indexOf('let winT='),ui.indexOf('let slowCool=')),c);
  vm.runInContext(`
    function buildSquads(need){SQUAD_NEED=need;SQUADS=UNITS.map(()=>({}));KIT_PIV=UNITS.map(()=>[{y:0,z:0},{y:0,z:0}]);}
    function verdict(winner){BATTLE.over=true; BATTLE.running=false; BATTLE.winner=winner;}
    function bootTest(rows,seed,actions=[]){
      seedSim(seed); BATTLE.running=false; BATTLE.over=false; BATTLE.t=0; BATTLE.tick=0; BATTLE.winner='';
      winT=0;routT=0;stallT=0;lastKills=-1;
      if(typeof REPLAY!=='undefined'){
        resetReplayRuntime(); REPLAY.current={v:2,sim:SIM_VERSION,seed,arena:'field',roster:rows,actions};
        REPLAY.playback=actions.length>0;
      }
      spawnRoster(rows,false); BATTLE.running=true;
    }
    function tickTest(){
      if(BATTLE.over) return;
      if(typeof applyBattleActions==='function') applyBattleActions(BATTLE.tick+1);
      BATTLE.tick++;BATTLE.t+=1/60;stepSim(1/60);checkWin(1/60);
    }
    function snapshot(){return {aliveA,aliveB,kills:BATTLE.totalKills,panic:panicCount,tick:BATTLE.tick,winner:BATTLE.winner,
      cx:BATTLE.cx,cz:BATTLE.cz,arrays:['x','z','vx','vz','hp','st','cd','tgt','panicT','fy','rev','vy','kills'].map(k=>Buffer.from(A[k].buffer,0,N*A[k].BYTES_PER_ELEMENT))};}
  `,c);
  return {c,eval:code=>vm.runInContext(code,c),flushTimers:()=>timers.splice(0).forEach(fn=>fn()),audioCalls:()=>audioCalls};
}
function checksum(r){const s=r.eval('snapshot()');const h=crypto.createHash('sha256');s.arrays.forEach(a=>h.update(a));delete s.arrays;return {...s,hash:h.digest('hex')};}
function presetRows(r,p){return JSON.parse(r.eval(`Object.assign(CFG,PRESETS.${p});CFG.rosterOverride=null;CFG.mix=PRESETS.${p}.mix||null;CFG.allies=PRESETS.${p}.allies||{};CFG.foes=PRESETS.${p}.foes||{};JSON.stringify(rosterList())`));}
const r=runtime(source);
if(r.eval("typeof REPLAY!=='undefined'")){
  for(const p of ['classic','massacre','even','silly']){
    const rows=presetRows(r,p);
    r.eval(`CFG.seed=123456; REPLAY.current=null; location.search='?'+encodeFight(); decodeFight();`);
    assert.deepEqual(JSON.parse(r.eval('JSON.stringify(rosterList())')),rows,`${p} roster roundtrip`);
    assert.equal(r.eval('CFG.seed'),123456);
    assert.equal(r.eval('REPLAY.loaded.actions.length'),0);
  }
  const beforeStore=r.eval('CFG.foes');
  r.eval('applyFightConfig(configFight())'); assert.equal(r.eval('CFG.foes'),beforeStore,'codec retains roster picker store identity');
  r.eval("REPLAY.current=null;location.search='?fight='+encodeURIComponent(JSON.stringify({...configFight(),v:999}));");
  assert.equal(r.eval('decodeFight()'),false);assert.match(r.eval('REPLAY.error'),/different simulator version/);
  assert.throws(()=>r.eval("validateRoster([{k:'rooster',n:4000},{k:'coon',n:1201}])"),/holds/);
  assert.throws(()=>r.eval("validateRoster([{k:'not-a-unit',n:1}])"),/Invalid/);
  assert.throws(()=>r.eval("validateRoster([{k:'__proto__',n:1}])"),/Invalid/);
  assert.throws(()=>r.eval("validateFight({...configFight(),actions:[{tick:-1,type:'command',k:'horn'}]})"),/Invalid/);
  r.eval("bootTest([{k:'rooster',n:5199},{k:'coon',n:1}],42); CMD.pts=80;");
  const before=r.eval('JSON.stringify({N,aliveA,aliveB,pts:CMD.pts,spent:TALE.spent,lastX:A.x[MAXA-1]})');
  assert.equal(r.eval("applyDeploy(DEPLOY.find(d=>d.k==='goose'))"),false);
  assert.equal(r.eval('addAgent(9,9,0,0)'),-1);
  assert.equal(r.eval('JSON.stringify({N,aliveA,aliveB,pts:CMD.pts,spent:TALE.spent,lastX:A.x[MAXA-1]})'),before);
  assert.throws(()=>r.eval("spawnRoster([{k:'rooster',n:5201}],false)"),/holds/);
  assert.equal(r.eval('N'),5200,'invalid roster leaves previous army intact');
  // A failed packet must not charge. Exact remaining space accepts the entire packet.
  r.eval("bootTest([{k:'rooster',n:5193},{k:'coon',n:1}],42); CMD.pts=80;");
  assert.equal(r.eval("applyDeploy(DEPLOY.find(d=>d.k==='goose'))"),true);
  assert.equal(r.eval('N'),5200);assert.equal(r.eval('CMD.pts'),68);
  // Audio callbacks use cosmetic randomness and are invalidated by reset.
  r.eval('seedSim(777)');const expected=r.eval('SR()');r.eval('seedSim(777);REPLAY.generation++');const calls=r.audioCalls();r.flushTimers();assert.equal(r.eval('SR()'),expected);assert.equal(r.audioCalls(),calls,'reset cancels stale arrival sound');
  r.eval("bootTest([{k:'rooster',n:80},{k:'coon',n:8}],7);REPLAY.playback=false;");
  r.eval('A.st[0]=1; A.st[1]=2; A.st[80]=1; panicCount=99;');
  assert.equal(r.eval('farmFleeing()'),1,'morale readout excludes dead animals and fleeing predators');
  r.eval("bootTest([{k:'rooster',n:80},{k:'coon',n:8}],7);REPLAY.playback=false;");
  assert.equal(r.eval("cmdFire('horn')"),true);assert.equal(r.eval('CMD.horn'),0,'queued input does not mutate sim');
  r.eval('tickTest()');assert.equal(r.eval('REPLAY.current.actions[0].tick'),1);assert.ok(r.eval('CMD.horn')>0);
  r.eval('REPLAY.playback=true');assert.equal(r.eval("cmdFire('feed')"),false,'replay blocks live commands');
  console.log('PASS codecs: four presets, version rejection, validation; capacity: rejection/atomic packet; tick queue and audio RNG');
  const actions=[{tick:1,type:'command',k:'horn'},{tick:65,type:'command',k:'feed'},{tick:121,type:'deploy',k:'goose'},{tick:361,type:'command',k:'light'}];
  const recorder=runtime(source);recorder.eval('bootTest([{k: "rooster",n:200},{k:"coon",n:20}],83)');
  for(let tick=1;tick<=900;tick++){
    for(const a of actions.filter(a=>a.tick===tick)) recorder.eval(`queueBattleAction('${a.type}','${a.k}')`);
    recorder.eval('tickTest()');
  }
  assert.deepEqual(JSON.parse(recorder.eval('JSON.stringify(REPLAY.current.actions)')),actions,'record accepted commands at intended ticks');
  const states=[];
  for(const batch of [1,2,4]){
    const replay=runtime(source); replay.eval(`bootTest([{k:'rooster',n:200},{k:'coon',n:20}],83,${JSON.stringify(actions)});`);
    for(let t=0;t<900;t+=batch){replay.eval(`for(let j=0;j<${Math.min(batch,900-t)};j++)tickTest();`);replay.flushTimers();}
    states.push(checksum(replay));
  }
  assert.deepEqual(states[1],states[0]);assert.deepEqual(states[2],states[0]);assert.deepEqual(checksum(recorder),states[0],'live command recording matches playback');
  console.log('PASS replay: same action log across 1/2/4 simulation steps per presentation frame');
}
if(args.includes('--checks-only'))process.exit(0);
const seeds=args.includes('--full')?Array.from({length:12},(_,i)=>i+1):[1,7];
const results=[];
for(const p of ['classic','massacre','even']) for(const seed of seeds){
  const current=runtime(source),rows=presetRows(current,p);current.eval(`bootTest(${JSON.stringify(rows)},${seed})`);
  const old=baseline?runtime(path.resolve(baseline)):null;if(old)old.eval(`bootTest(${JSON.stringify(rows)},${seed})`);
  const points=[];
  for(const stop of [600,1800,7300]){
    current.eval(`while(BATTLE.tick<${stop}&&!BATTLE.over)tickTest()`);
    const now=checksum(current);points.push(now);
    if(old){old.eval(`while(BATTLE.tick<${stop}&&!BATTLE.over)tickTest()`);assert.deepEqual(now,checksum(old),`${p} seed ${seed} at tick ${stop}`);}
  }
  // Same-context replay detects stale timers/state between battles.
  current.eval(`bootTest(${JSON.stringify(rows)},${seed})`);current.eval('while(BATTLE.tick<7300&&!BATTLE.over)tickTest()');
  assert.deepEqual(checksum(current),points[2],`${p} same-context reset`);
  results.push({preset:p,seed,...points[2]});
  console.log(`PASS ${p} seed ${seed}: ${points[2].winner}, ${points[2].aliveA}/${points[2].aliveB}, tick ${points[2].tick}${old?' (baseline identical)':''}`);
}
if(arg('--output'))fs.writeFileSync(arg('--output'),JSON.stringify(results,null,2)+'\n');
console.log(`PASS ${results.length} complete seeded battles + same-context resets${baseline?' + baseline state comparisons':''}. Rendering/audio/GPU excluded.`);
