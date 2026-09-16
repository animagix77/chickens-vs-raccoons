#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','parts','09_highlights.js'),'utf8');
function context(ui=false){
  const c=vm.createContext({console});
  // Declaration order is intentional: the part must load before UI/simulation globals.
  vm.runInContext(source,c);
  const run=code=>vm.runInContext(code,c);
  run(`const BATTLE={tick:0,running:true,over:false,conN:0,conX:2,conZ:3,totalKills:0,cx:0,cz:0};
    let initA=80,initB=20,aliveA=80,aliveB=20,N=8;
    const A={st:[0,0,0,0,0,0,0,0],team:[0,0,0,0,0,0,1,1],rev:[0,0,0,0,0,0,0,0],x:[1,2,3,4,5,6,7,8],z:[8,7,6,5,4,3,2,1]};
    const REPLAY={playback:false,seeking:false};
    function SR(){throw Error('Highlight observers must not use simulation RNG');}
    function srnd(){throw Error('Highlight observers must not use simulation RNG');}
    function VR(){throw Error('Highlight ledger must not use cosmetic RNG');}
    highlightReset();
  `);
  if(ui){
    const elements=new Map();
    class Element{
      constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.hidden=false;this.textContent='';}
      set id(id){this._id=id;elements.set(id,this);}get id(){return this._id;}
      set innerHTML(_){throw Error('UI must render labels with textContent');}
      setAttribute(k,v){this.attrs[k]=v;}appendChild(e){this.children.push(e);return e;}
      after(e){this.afterElement=e;}replaceChildren(){this.children=[];}
      addEventListener(k,fn){this.listeners[k]=fn;}
    }
    const document={head:new Element('head'),createElement:t=>new Element(t),getElementById:id=>elements.get(id)||null};
    for(const id of ['cardTale','frame']){const e=new Element('div');e.id=id;}
    c.document=document;c.seekCalls=[];c.seekReplayHighlight=tick=>{c.seekCalls.push(tick);return true;};
    run('initHighlightsUI()');return {c,run,elements};
  }
  return {c,run};
}
const json=(h,code)=>JSON.parse(h.run(`JSON.stringify(${code})`));
const h=context();
assert.equal(h.run('HIGHLIGHTS.events.length'),0);
assert.equal(h.run('highlightTimestamp(3659)'),'1:00');
assert.equal(h.run('highlightTimestamp(0)'),'0:00');
assert.equal(h.run("highlightEvent('test','Invalid',NaN,Infinity,-1)"),null);
assert.equal(h.run("highlightEvent('test','',0,0,1)"),null);
h.run('BATTLE.tick=1;BATTLE.conN=5;highlightTick()');
assert.equal(h.run('HIGHLIGHTS.events[0].type'),'firstclash');
assert.deepEqual(json(h,'HIGHLIGHTS.events[0]'),{type:'firstclash',label:'First contact: the armies meet',tick:1,x:2,z:3,priority:110});
h.run('highlightTick()');assert.equal(h.run('HIGHLIGHTS.events.length'),1,'duplicate tick cannot create another event');
// A possum pretending to be dead is not the first casualty location.
h.run('A.st[0]=2;A.rev[0]=2;A.st[6]=2;BATTLE.totalKills=1;aliveB=19;BATTLE.tick=2;highlightTick()');
assert.equal(h.run("HIGHLIGHTS.events.find(e=>e.type==='firstloss').x"),7);
assert.match(h.run("HIGHLIGHTS.events.find(e=>e.type==='firstloss').label"),/predator/);
// Living farm animals only. A dead animal still represented in historical panic is ignored.
h.run('aliveA=6;A.st[0]=2;A.st[1]=1;A.st[2]=1;BATTLE.tick=16;highlightTick()');
assert.equal(h.run('!!HIGHLIGHTS.seen.moralebreak'),false);
h.run('A.st[3]=1;BATTLE.tick=31;highlightTick()');
assert.equal(h.run('HIGHLIGHTS.seen.moralebreak'),1);
assert.match(h.run("HIGHLIGHTS.events.find(e=>e.type==='moralebreak').label"),/3 living/);
h.run('BATTLE.totalKills=76;BATTLE.tick=32;highlightTick()');
assert.equal(h.run('HIGHLIGHTS.events.filter(e=>e.type.startsWith("loss")).length'),3);
const observed=json(h,'{BATTLE,A,aliveA,aliveB,initA,initB,N}');
h.run('BATTLE.tick=33;highlightTick()');
const after=json(h,'{BATTLE,A,aliveA,aliveB,initA,initB,N}');observed.BATTLE.tick=33;
assert.deepEqual(after,observed,'observer must not mutate battle or agents');
console.log('PASS declaration order, meaningful contact/casualty/morale/loss events, no state mutation or RNG');

const cap=context();
cap.run("highlightEvent('firstclash','Contact',1,1,1);highlightEvent('firstloss','Casualty',2,2,2)");
cap.run("for(let i=0;i<20;i++)highlightEvent('command','Horn '+i,0,0,i+3)");
assert.equal(cap.run('HIGHLIGHTS.events.filter(e=>e.type===\'command\').length'),2,'commands are summarized, not spammed');
cap.run("for(let i=0;i<30;i++)highlightEvent('optional'+i,'Optional '+i,0,0,i+3)");
assert.equal(cap.run('HIGHLIGHTS.events.length'),12);
cap.run("highlightEvent('fence_hit','Fence under attack',3,4,40);highlightEvent('breach','Fence breached',3,4,41);highlightEvent('hen_lost','Protected hen lost',5,6,42)");
assert.ok(cap.run("HIGHLIGHTS.events.some(e=>e.type==='fencehit')"));
assert.ok(cap.run("HIGHLIGHTS.events.some(e=>e.type==='breach')"));
assert.ok(cap.run("HIGHLIGHTS.events.some(e=>e.type==='henlost')"));
cap.run("BATTLE.tick=43;highlightFinish('birds','Held the coop')");
assert.equal(cap.run('HIGHLIGHTS.events.length'),12);
assert.equal(cap.run('HIGHLIGHTS.events.at(-1).type'),'final');
cap.run("highlightFinish('coons','duplicate');highlightEvent('breach','late',0,0,44)");
assert.equal(cap.run('HIGHLIGHTS.events.length'),12);
assert.equal(cap.run('HIGHLIGHTS.events.at(-1).label'),'Farm victory: Held the coop');
cap.run('highlightReset()');assert.equal(cap.run('HIGHLIGHTS.events.length'),0);assert.equal(cap.run('HIGHLIGHTS.finished'),false);
console.log('PASS 12-event bound, protected objective/final moments, deduplication and reset');

const logs=[];
for(const batch of [1,2,5]){
  const d=context();
  for(let frame=0;frame<90;frame+=batch){d.run(`for(let j=0;j<${Math.min(batch,90-frame)};j++){
    BATTLE.tick++;if(BATTLE.tick===8)BATTLE.conN=4;
    if(BATTLE.tick===20){BATTLE.totalKills=1;aliveB--;A.st[6]=2;}
    if(BATTLE.tick===30)highlightEvent('breach','Fence breached',3,4);
    if(BATTLE.tick===45)BATTLE.totalKills=26;
    highlightTick();
  }`);}
  d.run("highlightFinish('birds','Time expired')");logs.push(json(d,'HIGHLIGHTS.events'));
}
assert.deepEqual(logs[1],logs[0]);assert.deepEqual(logs[2],logs[0]);
console.log('PASS same event ledger across 1/2/5 ticks per presentation frame');

const ui=context(true);
ui.run('initHighlightsUI()');assert.equal(ui.c.document.head.children.length,1,'style/UI initialization idempotent');
ui.run("BATTLE.tick=240;highlightEvent('breach','Fence <img onerror=alert(1)>',3,4);highlightFinish('birds','Held')");
const buttons=ui.elements.get('highlightList').children;
assert.equal(buttons[0].type,'button');assert.equal(buttons[0].children[0].textContent,'0:04');
assert.match(buttons[0].attrs['aria-label'],/Replay shortly before 0:04/);
buttons[0].listeners.click();assert.deepEqual(ui.c.seekCalls,[240],'seek receives original event tick, not wall time');
assert.equal(ui.elements.get('replayHighlights').hidden,false);
ui.run('highlightReset()');assert.equal(ui.elements.get('replayHighlights').hidden,true);
ui.run("REPLAY.playback=true;BATTLE.tick=60;highlightEvent('breach','Fence breached',0,0)");
assert.equal(ui.elements.get('replayMoment').hidden,false);
ui.run('BATTLE.tick=241;highlightTick()');assert.equal(ui.elements.get('replayMoment').hidden,true,'replay caption expires by simulation tick');
console.log('PASS accessible safe-text cards, event seek hook, idempotent UI and replay caption lifecycle');
