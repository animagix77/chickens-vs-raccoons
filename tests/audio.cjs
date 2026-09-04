#!/usr/bin/env node
'use strict';
// Executes the real audio engine against a strict WebAudio graph mock.
// Verifies routing, budgets, asset fallback and scheduled-node ownership; does not evaluate timbre.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=path.resolve(process.argv[process.argv.indexOf('--source-dir')+1]&&process.argv.includes('--source-dir')?process.argv[process.argv.indexOf('--source-dir')+1]:path.join(__dirname,'..'));
const text=fs.readFileSync(path.join(dir,'parts','05_view.js'),'utf8');
const block=text.slice(text.indexOf('let AC=null'),text.indexOf('/* ============================================================\n   AGENT RENDER'));
assert.ok(block.length>10000,'audio source boundary exists');
function finite(value){assert.ok(Number.isFinite(value),`finite audio value required: ${value}`);}
class Param{
  constructor(value=0){this.value=value;this.events=[];}
  set value(v){finite(v);this._value=v;}get value(){return this._value;}
  setValueAtTime(value,time){finite(value);finite(time);this.value=value;this.events.push(['set',value,time]);return this;}
  setTargetAtTime(value,time,tau){finite(value);finite(time);finite(tau);assert.ok(tau>0);this.value=value;this.events.push(['target',value,time,tau]);return this;}
  linearRampToValueAtTime(value,time){finite(value);finite(time);this.value=value;this.events.push(['linear',value,time]);return this;}
  exponentialRampToValueAtTime(value,time){finite(value);finite(time);assert.ok(value>0,'exponential endpoint > 0');this.value=value;this.events.push(['exp',value,time]);return this;}
  setValueCurveAtTime(values,time,duration){values.forEach(finite);finite(time);assert.ok(duration>0);return this;}
  cancelScheduledValues(){return this;}cancelAndHoldAtTime(){return this;}
}
class Node{
  constructor(ctx,type){this.context=ctx;this.type=type;this.kind=type;this.edges=[];this.disconnected=false;ctx.nodes.push(this);
    for(const k of ['gain','frequency','Q','detune','pan','playbackRate','threshold','knee','ratio','attack','release'])this[k]=new Param(k==='gain'||k==='playbackRate'?1:0);
  }
  connect(target){assert.ok(target instanceof Node||target instanceof Param,'connect target');this.edges.push(target);return target;}
  disconnect(){this.edges=[];this.disconnected=true;}
  start(time=0,offset=0,duration){assert.equal(this.started,undefined,'source starts once');finite(time);finite(offset);this.started=time;if(duration!==undefined){finite(duration);assert.ok(duration>0);this.duration=duration;}this.context.sources.push(this);}
  stop(time=0){finite(time);assert.ok(time>=0);this.stopped=time;}
  setPeriodicWave(wave){assert.ok(wave);this.wave=wave;}
}
class Context{
  constructor(){this.currentTime=0;this.sampleRate=8000;this.state='running';this.nodes=[];this.sources=[];this.destination=new Node(this,'destination');}
  createGain(){return new Node(this,'gain');}createBiquadFilter(){return new Node(this,'filter');}
  createDynamicsCompressor(){return new Node(this,'compressor');}createConvolver(){return new Node(this,'convolver');}
  createStereoPanner(){return new Node(this,'panner');}createOscillator(){return new Node(this,'oscillator');}
  createBufferSource(){return new Node(this,'bufferSource');}createWaveShaper(){return new Node(this,'waveshaper');}
  createPeriodicWave(real,imag){assert.equal(real.length,imag.length);Array.from(real).forEach(finite);Array.from(imag).forEach(finite);return {real,imag};}
  createBuffer(channels,length,sampleRate){assert.ok(channels>0&&length>0);const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:i=>data[i]};}
  decodeAudioData(buffer){assert.ok(buffer.byteLength);return Promise.resolve(this.createBuffer(1,800,8000));}
  resume(){this.state='running';return Promise.resolve();}
  advance(time){this.currentTime=time;for(const s of this.sources){const end=s.stopped??(s.loop?Infinity:s.buffer?s.started+(s.duration??s.buffer.duration)/s.playbackRate.value:Infinity);if(!s.ended&&end<=time){s.ended=true;if(s.onended)s.onended();}}}
}
class Vec{
  constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){return this.set(v.x,v.y,v.z);}distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
  project(){this.x/=50;this.z=.5;return this;}
}
function harness({failPath=null}={}){
  const requests=[],timers=[];
  const element={textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){}};
  const c=vm.createContext({console,Promise,Math,Date,Float32Array,Uint8Array,ArrayBuffer,Set,Map,
    window:{AudioContext:Context},THREE:{Vector3:Vec},camera:{position:new Vec(0,8,8)},
    document:{body:{classList:{add(){}}}},$:()=>element,
    setInterval:()=>1,clearInterval(){},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
    requestAnimationFrame:()=>1,Audio:class{constructor(){this.style={};this.paused=true;}setAttribute(){}play(){return Promise.resolve();}},
    fetch:async url=>{requests.push(url);return {ok:!failPath||!url.includes(failPath),status:404,headers:{get:()=>null},body:null,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};},
    SR:()=>{throw Error('Audio must not draw seeded simulation RNG');},srnd:()=>{throw Error('Audio must not draw seeded simulation RNG');},
    rnd:(a,b)=>a+(b-a)*.43,VR:()=>.43,pick:a=>a[0],clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),lerp:(a,b,t)=>a+(b-a)*t,
    TAU:Math.PI*2,BATTLE:{running:false,over:false,t:0,slowT:0,cx:0,cz:0},
    VIEW:{tactical:false,reducedMotion:false,paused:false},DIR:{manual:false},REPLAY:{generation:1},
    recentKills:0,NIGHT:false,ARENA_R:40,aliveA:100,aliveB:10,initA:100,initB:10,N:0,
    A:{st:[],x:[],z:[],kind:[],team:[]},UNITS:[],CMD:{light:0},floodStep(){},
  });
  vm.runInContext(block,c,{filename:'audio-engine.js'});
  const run=code=>vm.runInContext(code,c);run('audioInit()');
  return {c,run,requests,timers,ctx:run('AC')};
}
function reachable(start,target,blocked=new Set()){
  const todo=[start],seen=new Set();while(todo.length){const n=todo.pop();if(blocked.has(n)||seen.has(n))continue;if(n===target)return true;seen.add(n);if(n.edges)todo.push(...n.edges);}return false;
}
async function main(){
  const h=harness();
  const voices=h.run('Object.keys(VOX)');
  for(const name of voices){
    const before=h.ctx.sources.length;
    h.run(`VOX[${JSON.stringify(name)}](outBus(0),.5)`);
    assert.ok(h.ctx.sources.length>before,`${name} creates sound`);
  }
  console.log(`PASS ${voices.length} procedural voices: valid source/envelope scheduling, no simulation RNG`);
  const wet=h.ctx.nodes.find(n=>n.kind==='convolver');
  assert.ok(reachable(wet,h.ctx.destination),'wet audible when enabled');
  assert.equal(reachable(wet,h.ctx.destination,new Set([h.run('master')])),false,'reverb must pass master mute');
  console.log('PASS dry/wet master mute routing');
  const before=h.ctx.sources.length;
  h.run("BUF.horn=AC.createBuffer(1,800,8000);soundOn=false;sfx('buk',0,0,'cry');oneShot('horn',1);sting('go')");
  assert.equal(h.ctx.sources.length,before,'mute creates no new sources');
  h.run('soundOn=true');
  const partial=harness({failPath:'menu.mp3'});
  await partial.run('loadAssets()'); await new Promise(resolve=>setImmediate(resolve)); await partial.run('decodeAssets()');
  assert.ok(partial.run('!!BUF.battle'),'one missing sample must not discard successful assets');
  assert.equal(partial.run('!!BUF.menu'),false);
  console.log('PASS mute gating and independent partial-fetch fallback');
  // Asset map integrity: every mapped effect has one shipped local asset.
  const paths=partial.run("ASSET_LIST.filter(([k])=>k.startsWith('fx_')).map(([,p])=>p)");
  assert.ok(paths.length>=1);
  for(const rel of paths)assert.ok(fs.statSync(path.join(dir,'assets',rel)).size>0,`${rel} exists`);
  assert.equal(new Set(paths).size,paths.length,'sample manifest does not duplicate buffers');
  const samples=harness();
  assert.equal(samples.run("sampleSfx('buk',outBus(0),1)"),false,'missing optional bank reports fallback');
  const fallbackBefore=samples.ctx.sources.length;
  samples.run("VOX.buk(outBus(0),1)");
  assert.ok(samples.ctx.sources.length>fallbackBefore,'missing sample still produces a procedural voice');
  samples.run("Object.values(SFX_BANKS).flat().forEach(k=>BUF['fx_'+k]=AC.createBuffer(1,800,8000))");
  const banks=samples.run('Object.keys(SFX_BANKS)');
  for(const kind of banks){
    const count=samples.ctx.sources.length;
    assert.equal(samples.run(`sampleSfx(${JSON.stringify(kind)},outBus(0),.6,2)`),true);
    assert.equal(samples.ctx.sources.length,count+1,`${kind} dispatches exactly one recorded source`);
    assert.equal(samples.ctx.sources.at(-1).started,2,'requested audio-clock onset preserved');
  }
  let previous=null;
  for(let i=0;i<9;i++){
    samples.run("sampleSfx('buk',outBus(0),1)");
    const buffer=samples.ctx.sources.at(-1).buffer;
    assert.notEqual(buffer,previous,'no immediate repeat in multi-sample bank');previous=buffer;
  }
  const recorded=samples.ctx.sources.at(-1),recordedGain=recorded.edges[0];
  samples.ctx.advance(1);
  assert.ok(recorded.ended&&recorded.disconnected&&recordedGain.disconnected,'sample and gain disconnect on natural end');
  const mutedCount=samples.ctx.sources.length;
  assert.equal(samples.run("soundOn=false;sampleSfx('buk',outBus(0),1)"),false);
  assert.equal(samples.ctx.sources.length,mutedCount);
  samples.run('soundOn=true');
  // A partial bank is usable even when sibling variants fail to load.
  const one=harness();one.run('BUF.fx_cluck2=AC.createBuffer(1,800,8000)');
  assert.equal(one.run("sampleSfx('buk',outBus(0),1)"),true);
  assert.equal(one.ctx.sources.at(-1).buffer,one.run('BUF.fx_cluck2'));
  console.log(`PASS ${banks.length} sample mappings/${paths.length} assets: fallback, partial bank, scheduling, nonrepeat and onended cleanup`);

  // Budgets bound creation at a frozen audio-clock time even for different calls.
  for(const [mode,limit] of [['soft',2],['cry',3],[undefined,6]]){
    const b=harness();b.run('VIEW.paused=true');
    const before=b.run('fxBuses.length');
    b.run(`for(let i=0;i<1000;i++)sfx(Object.keys(VOX)[i%Object.keys(VOX).length],undefined,undefined,${JSON.stringify(mode)||'undefined'})`);
    assert.equal(b.run('fxBuses.length')-before,limit,`${mode||'impact'} burst capped`);
    b.ctx.advance(1);b.run('audioUpdate(1)');
    const refilled=b.run('fxBuses.length');
    b.run(`for(const k of Object.keys(VOX))sfx(k,undefined,undefined,${JSON.stringify(mode)||'undefined'})`);
    assert.equal(b.run('fxBuses.length')-refilled,limit,`${mode||'impact'} token refill usable`);
  }
  for(const [kind,mode,gap] of [['buk','cry',.24],['peck',undefined,.045],['crow','cry',1.8],['roar','cry',2.5]]){
    const b=harness();b.run(`sfx('${kind}',undefined,undefined,${JSON.stringify(mode)||'undefined'})`);
    const before=b.run('fxBuses.length');
    b.ctx.advance(gap*.99);b.run(`sfx('${kind}',undefined,undefined,${JSON.stringify(mode)||'undefined'})`);
    assert.equal(b.run('fxBuses.length'),before,`${kind} cooldown holds`);
    b.ctx.advance(gap+.001);b.run(`sfx('${kind}',undefined,undefined,${JSON.stringify(mode)||'undefined'})`);
    assert.equal(b.run('fxBuses.length'),before+1,`${kind} audible after cooldown`);
  }
  // Tactical and reduced-motion camera height must not mute the battlefield.
  for(const mode of ['tactical','reducedMotion']){
    const b=harness();b.run(`VIEW.${mode}=true;camera.position.set(0,160,30);sfx('buk',0,0,'cry')`);
    assert.equal(b.run('fxBuses.length'),1,`${mode} has an audible virtual listener`);
  }
  console.log('PASS independent burst/refill budgets, per-kind cooldowns, Tactical/reduced-motion hearing');

  const lifecycle=harness();lifecycle.run('VIEW.paused=true');
  const oldest=lifecycle.run('outBus(0)');
  lifecycle.run('for(let i=0;i<100;i++)outBus(0)');
  assert.equal(lifecycle.run('fxBuses.length'),48,'transient bus pool bounded under cue spam');
  assert.ok(oldest.disconnected,'oldest bus disconnected on eviction');
  const retained=lifecycle.run('fxBuses.flatMap(b=>b.nodes)');
  lifecycle.run('audioUpdate(100)');
  assert.equal(lifecycle.run('fxBuses.length'),48,'wall dt cannot expire suspended audio-clock tails');
  lifecycle.ctx.advance(6.1);lifecycle.run('audioUpdate(0)');
  assert.equal(lifecycle.run('fxBuses.length'),0,'audioUpdate sweeps expired buses even while paused');
  assert.ok(retained.every(n=>n.disconnected),'every retained transient bus node disconnected');
  assert.ok(!lifecycle.run('master').disconnected,'shared master survives transient cleanup');
  const noise=lifecycle.run("nz(outBus(0),AC.currentTime,.2,'lowpass',900,.7,.5,1)");
  const source=lifecycle.ctx.sources.at(-1),gain=source.edges[0].edges[0];
  lifecycle.ctx.advance(7);
  assert.ok(source.disconnected&&noise.disconnected&&gain.disconnected,'noise source/filter/envelope cleanup');
  console.log('PASS bounded transient pool, eviction, audio-clock expiry, pause cleanup and noise-node disposal');
  const menuBefore=partial.ctx.sources.length;
  partial.run("musicMode('menu');schedStep(0,AC.currentTime)");
  assert.ok(partial.ctx.sources.length>menuBefore,'missing menu recording falls back to procedural music despite another recorded track being available');
  console.log('PASS missing music mode uses procedural fallback while other samples stay available');


}
main().catch(e=>{console.error(e);process.exitCode=1;});
