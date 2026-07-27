
/* ============================================================
   SEQUENCER — title card, countdown, battle, verdict
   ============================================================ */
const SEQ={phase:'idle',t:0};
const INTRO_A=3.8, INTRO_B=3.4;
const card=$('card');
function showCard(o){
  card.classList.toggle('thin',!!o.thin);
  card.classList.toggle('result',!!o.result);
  card.classList.toggle('trib',!!o.trib);
  $('cardKick').textContent=o.kick||'';
  $('cardA').textContent=o.a||'';
  $('cardVs').textContent=o.vs||'';
  $('cardB').textContent=o.b||'';
  $('count').textContent=o.count||'';
  $('cardSub').innerHTML=o.sub||'';
  card.classList.add('on');
}
function hideCard(){ card.classList.remove('on'); }

const LABEL=(()=>{ const m={}; UNITS.forEach(u=>m[u.k]=u.label); return m; })();
/* the ally side is no longer picked in the panel — you call those in live, from
   the commander bar, out of the war chest. the panel keeps the predator list
   because that's the difficulty dial you set before you press fight. */
const EXTRA_B=['possum','fox','coyote','hawk','bear'];
const STEPS=[0,1,2,3,5,8,12,20,30,50,80,120,200];
let CFG={birds:1000,coons:100,kind:'rooster',arena:'field',foes:{}};
EXTRA_B.forEach(k=>CFG.foes[k]=0);
function rosterList(){
  const L=[{k:CFG.kind,n:CFG.birds},{k:'coon',n:CFG.coons}];
  EXTRA_B.forEach(k=>{ if(CFG.foes[k]>0)  L.push({k,n:CFG.foes[k]}); });
  return L;
}

function setPhase(p){
  SEQ.phase=p; SEQ.t=0; DIR.snap=(p!=='result');   // let the final shot ride
  if(p==='introA'){ musicMode('tension');
    showCard({thin:true, kick:'The flock', a:CFG.birds+' '+LABEL[CFG.kind].toUpperCase(),
      sub:UNITS[UI_[CFG.kind]].blurb});
  }
  if(p==='introB'){
    const foe=EXTRA_B.filter(k=>CFG.foes[k]>0);
    const big=foe.length?UNITS[UI_[foe[foe.length-1]]]:null;
    showCard({thin:true, kick:'The problem',
      a:big?(CFG.foes[big.k]+' '+big.label.toUpperCase()).replace(/^1 (.*)S$/,'1 $1')
           :CFG.coons+' RACCOONS',
      sub:big?big.blurb:(CFG.arena==='coop'?'They already know the way in.'
        :'Hands. Teeth. No respect for property lines.')});
  }
  if(p==='title'){
    showCard({kick:document.body.classList.contains('reel')?'Tonight, in a barnyard':'Matchup',
      a:CFG.birds+' '+LABEL[CFG.kind].toUpperCase(), vs:'VS', b:CFG.coons+' RACCOONS',
      sub:CFG.arena==='coop'?'Night · inside the coop · nowhere to run':'Daylight · open field'});
  }
  if(p==='count'){ musicCountIn(3.4); showCard({count:'3'}); }
  if(p==='battle'){ hideCard(); BATTLE.running=true; BATTLE.t=0; clearFeed(); pickShot();
    document.body.classList.add('fighting');
    musicMode('battle'); if(AC) braam(AC.currentTime+0.02,38,1.1,0.45); }
}

function verdict(who,how){
  BATTLE.over=true; BATTLE.running=false;
  document.body.classList.remove('fighting');
  const mvp=BATTLE.champ>=0?(A.name[BATTLE.champ]||'an anonymous bird'):'nobody';
  const mk=BATTLE.champ>=0?A.kills[BATTLE.champ]:0;
  const survivors=Math.max(0,aliveA), coonsLeft=Math.max(0,aliveB);
  BATTLE.winner=who;
  showCard({
    result:true,
    trib:who==='birds',          // the flock only gets its dedication when it earns it
    kick:how,
    a:who==='birds'?LABEL[CFG.kind].toUpperCase()+' WIN':(who==='coons'?'RACCOONS WIN':'STALEMATE'),
    vs:'', b:'',
    sub:survivors+' of '+initA+' birds standing &nbsp;·&nbsp; '+coonsLeft+' of '+initB+
        ' raccoons standing<br>MVP: <span style="color:var(--hot)">'+mvp+'</span> — '+mk+' kills &nbsp;·&nbsp; '+
        BATTLE.totalKills+' dead in '+BATTLE.t.toFixed(1)+'s'
  });
  sting(who==='birds'?'win':'lose');
  musicFinish(who==='birds');
  setPhase('result');
  $('go').textContent='Run it back'; $('go').classList.add('rst');
  sfx('flap');
}

function stepSeq(dt){
  SEQ.t+=dt;
  const reel=document.body.classList.contains('reel');
  if(SEQ.phase==='introA' && SEQ.t>INTRO_A) setPhase('introB');
  else if(SEQ.phase==='introB' && SEQ.t>INTRO_B) setPhase('title');
  else if(SEQ.phase==='title' && SEQ.t>(reel?2.6:1.6)) setPhase('count');
  else if(SEQ.phase==='count'){
    const n=3-Math.floor(SEQ.t);
    if(n>0){
      if($('count').textContent!==String(n)){ $('count').textContent=n; sting('beep'); }
    }else{
      if($('count').textContent!=='FIGHT'){ $('count').textContent='FIGHT'; sting('go'); }
      if(SEQ.t>3.5) setPhase('battle');
    }
  }
}

/* ============================================================
   HUD
   ============================================================ */
const champEl=$('champ');
let hudT=0;
function hud(dt){
  hudT-=dt; if(hudT>0 && !hudDirty) return; hudT=0.08; hudDirty=false;
  if(BATTLE.running) cmdHud();
  $('ctA').textContent=Math.max(0,aliveA);
  $('ctB').textContent=Math.max(0,aliveB);
  $('nameA').textContent=LABEL[CFG.kind];
  const tot=Math.max(1,aliveA+aliveB*(initB?initA/Math.max(1,initB)*0.35:1));
  const pa=clamp((aliveA/Math.max(1,initA))/((aliveA/Math.max(1,initA))+(aliveB/Math.max(1,initB))||1),0,1);
  $('barA').style.width=(pa*100).toFixed(1)+'%';
  $('tmr').textContent=BATTLE.t.toFixed(1)+'s';
  $('phase').textContent = BATTLE.over?'Final':
    SEQ.phase==='battle'?(panicCount>aliveA*0.45?'Frenzy':'Engaged'):
    SEQ.phase==='count'?'Bracing':SEQ.phase==='title'?'Staredown':
    SEQ.phase==='introA'?'The flock':SEQ.phase==='introB'?'The problem':'Standby';

  const c=BATTLE.champ;
  if(c>=0 && A.kills[c]>=2 && !BATTLE.over){
    // text first — the element has to be its final width before we measure it
    $('champName').textContent=A.name[c]||'???';
    $('champKills').textContent=(A.st[c]===2?'FALLEN — ':'')+A.kills[c]+' kills';
    $('champName').style.color=A.team[c]===0?'var(--hot)':'var(--cool)';
    _v.set(A.x[c],A.st[c]===2?0.35:1.35,A.z[c]).project(camera);
    if(_v.z<1&&Math.abs(_v.x)<1.05&&Math.abs(_v.y)<1.05){
      const w=frame.clientWidth,h=frame.clientHeight;
      const halfW=Math.min(champEl.offsetWidth/2+8, w/2), hh=champEl.offsetHeight;
      let px=clamp((_v.x*.5+.5)*w, halfW, Math.max(halfW,w-halfW));
      const py=clamp((-_v.y*.5+.5)*h, hh*1.24+8, h-56);
      const top=py-hh*1.24;
      // nudge clear of the kill feed where the feed actually lives
      const fb=getComputedStyle(feedEl).display!=='none'?feedEl.getBoundingClientRect():null;
      if(fb&&fb.width){
        const fr=frame.getBoundingClientRect();
        const fTop=fb.top-fr.top, fBot=fb.bottom-fr.top, fLeft=fb.left-fr.left;
        // compare the label's whole box against the feed's, not just its anchor point
        if(top<fBot+6 && py>fTop-6) px=Math.min(px, Math.max(halfW, fLeft-halfW-10));
      }
      champEl.style.left=px+'px'; champEl.style.top=py+'px';
      // measure the real box rather than predicting it — the transform origin and
      // text metrics make any prediction drift, and drift means visible collisions
      const cb=champEl.getBoundingClientRect(), cf=frame.getBoundingClientRect();
      // it labels one specific bird, so if it lands on the chrome we hide it
      // rather than drag it somewhere it no longer points at anything
      champEl.classList.toggle('on',
        !hudBlocked(cb.left-cf.left, cb.top-cf.top, cb.right-cf.left, cb.bottom-cf.top));
    } else champEl.classList.remove('on');
  } else champEl.classList.remove('on');
}

const NOGO=['panel','feed','teamA','teamB','clock'];
function hudBlocked(l,t,r,b){
  const fr=frame.getBoundingClientRect();
  for(let i=0;i<NOGO.length;i++){
    const e=$(NOGO[i]); if(!e) continue;
    const st=getComputedStyle(e);
    if(st.display==='none'||+st.opacity===0) continue;
    const q=e.getBoundingClientRect(); if(!q.width||!q.height) continue;
    if(l<q.right-fr.left-4 && r>q.left-fr.left+4 && t<q.bottom-fr.top-4 && b>q.top-fr.top+4) return true;
  }
  return false;
}

/* ============================================================
   WIN CHECK
   ============================================================ */
let winT=0, routT=0, stallT=0, lastKills=-1;
function checkWin(dt){
  if(!BATTLE.running||BATTLE.over) return;
  winT-=dt; if(winT>0) return; winT=0.4;
  if(initA===0||initB===0){ verdict(initA?'birds':'coons','Uncontested'); return; }
  if(initB>0&&aliveB<=0){ verdict('birds','The flock holds the field'); return; }
  if(initA>0&&aliveA<=0){ verdict('coons','Total poultry failure'); return; }
  // nothing has died in a while — somebody has effectively won
  if(BATTLE.totalKills===lastKills) stallT+=0.4; else { stallT=0; lastKills=BATTLE.totalKills; }
  const strongerBirds=(aliveA/Math.max(1,initA))>(aliveB/Math.max(1,initB));
  if(stallT>9){ verdict(strongerBirds?'birds':'coons','The killing simply stopped'); return; }
  if(BATTLE.t>120) verdict(strongerBirds?'birds':'coons','Called on time');
}

/* ============================================================
   SLOW MOTION
   ============================================================ */
let slowCool=0;
function slowmo(dt){
  slowCool-=dt;
  BATTLE.windowT+=dt;
  if(BATTLE.windowT>0.3){
    const thresh=Math.max(3,(initA*0.008)|0);
    if(BATTLE.deathsWindow>=thresh&&slowCool<=0&&SEQ.phase==='battle'){
      BATTLE.slowT=1.0; slowCool=6; DIR.shot='clash'; DIR.t=0; DIR.dur=2.4; sting('slow');
      DIR.ang=Math.random()*TAU;
    }
    BATTLE.deathsWindow=0; BATTLE.windowT=0;
  }
  if(BATTLE.slowT>0){
    BATTLE.slowT-=dt; BATTLE.timeScale=0.22;
    $('slowmo').classList.add('on');
  }else{
    BATTLE.timeScale=lerp(BATTLE.timeScale,1,0.08);
    $('slowmo').classList.remove('on');
  }
}

/* ============================================================
   START / RESET
   ============================================================ */
function startBattle(){
  clearTimeout(reSpawn);        // a queued standby must not wipe the sequence we're starting
  document.body.classList.add('live');   // slides the setup panel away immediately
  // the opening is a directed shot — if the viewer had grabbed the camera, take it back
  if(DIR.manual){ DIR.manual=false; $('btnCam').classList.add('on'); $('btnCam').textContent='Auto Cam'; }
  BATTLE.running=false; BATTLE.over=false; BATTLE.t=0; BATTLE.champ=-1;
  BATTLE.totalKills=0; BATTLE.timeScale=1; BATTLE.slowT=0; BATTLE.deathsWindow=0; BATTLE.routed=0; recentKills=0; BATTLE.hsx=0; BATTLE.hsz=0;
  routT=0; slowCool=0; stallT=0; lastKills=-1;
  clearParticles(); clearFeed(); champEl.classList.remove('on');
  spawnRoster(rosterList(),CFG.arena==='coop');
  camPos.set(0,ARENA_R*0.45,-ARENA_R*1.5);
  setPhase('introA');
  $('go').textContent='Reset'; $('go').classList.add('rst');
  audioResume();
}
function standby(){
  musicMode('idle');
  document.body.classList.remove('fighting');
  document.body.classList.remove('live');   // panel comes back only here
  BATTLE.running=false; BATTLE.over=false; BATTLE.t=0; BATTLE.champ=-1; BATTLE.totalKills=0;
  BATTLE.routed=0; recentKills=0; BATTLE.hsx=0; BATTLE.hsz=0;
  clearParticles(); clearFeed(); champEl.classList.remove('on'); hideCard();
  spawnRoster(rosterList(),CFG.arena==='coop');
  SEQ.phase='idle'; SEQ.t=0;
  $('go').textContent='Fight'; $('go').classList.remove('rst');
}

/* ============================================================
   ROSTER PICKERS
   ============================================================ */
function stepVal(v,dir){
  let i=STEPS.indexOf(v);
  if(i<0){ i=0; while(i<STEPS.length-1&&STEPS[i]<v) i++; }
  return STEPS[clamp(i+dir,0,STEPS.length-1)];
}
function buildRoster(el,keys,store,foe){
  el.innerHTML='';
  keys.forEach(k=>{
    const u=UNITS[UI_[k]];
    const row=document.createElement('div');
    row.className='ru'+(foe?' foe':'');
    row.innerHTML='<span class="rn" title="'+u.blurb+'">'+u.label+'</span>'+
      '<button data-d="-1">\u2212</button><span class="rv">0</span><button data-d="1">+</button>';
    row.querySelectorAll('button').forEach(b=>b.addEventListener('click',e=>{
      e.stopPropagation();
      store[k]=stepVal(store[k],+b.dataset.d);
      syncRoster(); queueStandby();
    }));
    el.appendChild(row);
    row.dataset.k=k;
  });
}
function syncRoster(){
  let cb=0;
  const el=$('rosterFoe');
  if(el)[...el.children].forEach(row=>{
    const k=row.dataset.k, n=CFG.foes[k]||0;
    row.querySelector('.rv').textContent=n;
    row.classList.toggle('on',n>0);
    cb+=n*UNITS[UI_[k]].cost;
  });
  $('costB').textContent=cb?cb+' pts':'';
}

/* ============================================================
   COMMANDER BAR
   ============================================================ */
const cmdAct=$('cmdact'), cmdDep=$('cmddep'), ptsEl=$('cmdpts').querySelector('b');
CMD_DEF.forEach(d=>{
  const b=document.createElement('button');
  b.className='cmd'; b.dataset.k=d.k; b.title=d.hint;
  b.innerHTML='<span class="cn">'+d.name+'</span><span class="ck">'+d.key+'</span><i></i>';
  b.addEventListener('click',e=>{ e.stopPropagation(); cmdFire(d.k); });
  cmdAct.appendChild(b);
});
/* one chip per reinforcement packet. cheapest first, so the row reads as a
   ladder — the longer you survive, the further right you can afford */
DEPLOY.slice().sort((a,b)=>a.cost-b.cost).forEach(d=>{
  const u=UNITS[UI_[d.k]];
  const b=document.createElement('button');
  b.className='dep'; b.dataset.k=d.k;
  b.title=u.blurb+'  —  '+d.n+' for '+d.cost;
  const nm = d.n===1 ? u.label.replace(/s$/,'') : u.label;   // "1× Bull", not "1× Bulls"
  b.innerHTML='<span class="dn">'+d.n+'× '+nm+'</span><span class="dc">'+d.cost+'</span>';
  b.addEventListener('click',e=>{
    e.stopPropagation();
    if(deploy(d)){ b.classList.add('flash'); setTimeout(()=>b.classList.remove('flash'),260); cmdHud(); }
  });
  cmdDep.appendChild(b);
});
function cmdHud(){
  for(const b of cmdAct.children){
    const k=b.dataset.k, d=CMD_DEF.find(c=>c.k===k);
    const live = (k==='horn'&&CMD.horn>0)||(k==='light'&&CMD.light>0)||(k==='feed'&&CMD.feedT>0);
    const ready = cmdReady(k);
    b.classList.toggle('ready',ready);
    b.classList.toggle('live',live);
    const bar=b.querySelector('i');
    if(ready) bar.style.width='100%';
    else if(d.cool) bar.style.width=(100*(1-CMD.cd[k]/d.cool)).toFixed(0)+'%';
  }
  ptsEl.textContent=CMD.pts|0;
  for(const b of cmdDep.children){
    if(!b.dataset.k) continue;
    const d=DEPLOY.find(x=>x.k===b.dataset.k);
    b.classList.toggle('ok',canDeploy(d));
  }
}

/* ============================================================
   CONTROLS
   ============================================================ */
const sA=$('sA'), sB=$('sB');
function syncSliders(){
  sA.value=CFG.birds; sB.value=CFG.coons;
  $('vA').textContent=CFG.birds; $('vB').textContent=CFG.coons;
  sA.style.setProperty('--p',(CFG.birds/sA.max*100)+'%');
  sB.style.setProperty('--p',(CFG.coons/sB.max*100)+'%');
  document.querySelectorAll('#segBird button').forEach(b=>b.classList.toggle('on',b.dataset.v===CFG.kind));
  document.querySelectorAll('#segArena button').forEach(b=>b.classList.toggle('on',b.dataset.v===CFG.arena));
  syncRoster();
}
let reSpawn=null;
function queueStandby(){ clearTimeout(reSpawn); reSpawn=setTimeout(standby,220); }

sA.addEventListener('input',()=>{CFG.birds=+sA.value;syncSliders();queueStandby();});
sB.addEventListener('input',()=>{CFG.coons=+sB.value;syncSliders();queueStandby();});
document.querySelectorAll('#segBird button').forEach(b=>
  b.addEventListener('click',()=>{CFG.kind=b.dataset.v;syncSliders();queueStandby();}));
document.querySelectorAll('#segArena button').forEach(b=>
  b.addEventListener('click',()=>{CFG.arena=b.dataset.v;syncSliders();queueStandby();}));

const PRESETS={
  classic :{birds:1000,coons:100,kind:'rooster', arena:'field',foes:{}},
  massacre:{birds:1200,coons:60, kind:'hen',     arena:'coop', foes:{possum:20}},
  even    :{birds:485, coons:100,kind:'gamecock',arena:'field',foes:{fox:8,coyote:4}},
  silly   :{birds:2500,coons:300,kind:'rooster', arena:'field',
            foes:{fox:30,coyote:20,possum:40,hawk:20,bear:1}}
};
document.querySelectorAll('.mini button').forEach(b=>b.addEventListener('click',()=>{
  const P=PRESETS[b.dataset.preset];
  EXTRA_B.forEach(k=>CFG.foes[k]=P.foes[k]||0);
  CFG.birds=P.birds; CFG.coons=P.coons; CFG.kind=P.kind; CFG.arena=P.arena;
  syncSliders(); startBattle();
}));

/* the verdict card is the only screen you can reach with the chrome hidden,
   so it carries its own way out */
function toSetup(){
  if(document.body.classList.contains('reel')){
    document.body.classList.remove('reel');
    $('btnReel').classList.remove('on');
    resize();
  }
  document.body.classList.remove('hideui');
  poke();
  standby();
}
$('again').addEventListener('click',e=>{ e.stopPropagation(); startBattle(); });
$('setup').addEventListener('click',e=>{ e.stopPropagation(); toSetup(); });

$('go').addEventListener('click',()=>{
  if(BATTLE.running||SEQ.phase==='title'||SEQ.phase==='count') standby();
  else startBattle();
});
$('btnReel').addEventListener('click',()=>{
  document.body.classList.toggle('reel');
  $('btnReel').classList.toggle('on',document.body.classList.contains('reel'));
  resize();
});
$('btnCam').addEventListener('click',()=>{
  DIR.manual=!DIR.manual;
  $('btnCam').classList.toggle('on',!DIR.manual);
  $('btnCam').textContent=DIR.manual?'Free Cam':'Auto Cam';
});
$('btnMusic').addEventListener('click',()=>{
  MUS.on=!MUS.on; audioResume();
  $('btnMusic').classList.toggle('on',MUS.on);
});
$('btnSound').addEventListener('click',()=>{
  soundOn=!soundOn; audioResume();
  $('btnSound').classList.toggle('on',soundOn);
});
/* blood ships off. turning it back off mid-fight also scrubs the field clean. */
$('btnBlood').addEventListener('click',()=>{
  setGore(!GORE);
  $('btnBlood').classList.toggle('on',GORE);
});
/* browsers need a gesture before any of this makes a sound */
['pointerdown','keydown','touchstart'].forEach(ev=>
  addEventListener(ev,audioResume,{once:true,passive:true}));

/* ---------- manual orbit ----------
   The drag moves the world with your finger: swipe right and the near side of
   the fight swings right, swipe down and the field tips down as the camera
   climbs. That's what every map and 3D viewer does, and the horizontal axis
   used to do the opposite. Both axes are measured as a fraction of the frame
   height, so one swipe covers the same arc on a phone as on a desktop. */
const el=renderer.domElement;
const ORB_YAW=3.4, ORB_TILT=2.4;    // radians across a full-height drag
let touchId=null, pinchD=0;
function touchAt(e){
  if(!e.touches) return {x:e.clientX,y:e.clientY};
  for(let i=0;i<e.touches.length;i++)
    if(e.touches[i].identifier===touchId) return {x:e.touches[i].clientX,y:e.touches[i].clientY};
  return null;
}
function pinchGap(e){
  const a=e.touches[0], b=e.touches[1];
  return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
}
function grabCam(){
  if(DIR.manual) return;
  DIR.manual=true; $('btnCam').classList.remove('on'); $('btnCam').textContent='Free Cam';
}
function down(e){
  if(e.touches){
    touchId=e.touches[0].identifier;
    if(e.touches.length>1){ pinchD=pinchGap(e); DIR.drag=false; return; }
  }
  const p=touchAt(e); if(!p) return;
  DIR.drag=true; DIR.px=p.x; DIR.py=p.y;
}
function move(e){
  if(e.touches && e.touches.length>1){          // two fingers: pinch to zoom
    const g=pinchGap(e);
    if(pinchD>0) DIR.orbD=clamp(DIR.orbD*(pinchD/g),0.12,2.4);
    pinchD=g; DIR.drag=false; grabCam(); e.preventDefault(); return;
  }
  if(!DIR.drag) return;
  const p=touchAt(e); if(!p) return;
  const h=Math.max(1,frame.clientHeight);
  DIR.orbA+=(p.x-DIR.px)/h*ORB_YAW;
  DIR.orbH=clamp(DIR.orbH+(p.y-DIR.py)/h*ORB_TILT,0.05,1.45);
  DIR.px=p.x; DIR.py=p.y;
  grabCam();
  e.preventDefault();
}
/* lifting one finger of a pinch must hand control to the one still down
   rather than snapping the camera to wherever that finger happens to be */
function up(e){
  if(e && e.touches && e.touches.length){
    touchId=e.touches[0].identifier; pinchD=0;
    DIR.px=e.touches[0].clientX; DIR.py=e.touches[0].clientY; DIR.drag=true;
    return;
  }
  DIR.drag=false; touchId=null; pinchD=0;
}
el.addEventListener('mousedown',down); addEventListener('mousemove',move); addEventListener('mouseup',up);
el.addEventListener('touchstart',down,{passive:true}); el.addEventListener('touchmove',move,{passive:false});
addEventListener('touchend',up); addEventListener('touchcancel',up);
el.addEventListener('wheel',e=>{DIR.orbD=clamp(DIR.orbD*(1+Math.sign(e.deltaY)*0.1),0.12,2.4);e.preventDefault();},{passive:false});
addEventListener('keydown',e=>{
  if(e.code==='Space'){e.preventDefault();$('go').click();}
  if(e.key==='r'||e.key==='R')$('btnReel').click();
  if(e.key==='h'||e.key==='H')document.body.classList.toggle('hideui');
  if(e.key==='b'||e.key==='B')$('btnBlood').click();
  if(e.key==='Escape') toSetup();
  const c=CMD_DEF.find(d=>d.key===e.key); if(c) cmdFire(c.k);
});

/* hide the chrome while recording — moving the mouse brings it back */
let idleT=null;
function poke(){
  document.body.classList.remove('idle');
  clearTimeout(idleT);
  idleT=setTimeout(()=>document.body.classList.add('idle'),2600);
}
['pointermove','pointerdown','keydown','wheel'].forEach(e=>addEventListener(e,poke,{passive:true}));
poke();

/* ============================================================
   MAIN LOOP
   ============================================================ */
let last=performance.now(), fpsAcc=0, fpsN=0;
function loop(now){
  requestAnimationFrame(loop);
  const raw=(now-last)/1000; last=now;
  const real=Math.min(0.05,raw);   // physics/camera: clamped so a hitch can't explode the sim
  const wall=Math.min(0.5,raw);    // the title sequence is a wall clock, not a frame counter

  if(SEQ.phase!=='idle'&&SEQ.phase!=='battle'&&SEQ.phase!=='result') stepSeq(wall);
  slowmo(real);
  const dt=real*BATTLE.timeScale;

  if(BATTLE.running&&!BATTLE.over){ BATTLE.t+=dt; stepSim(dt); checkWin(real); }
  else if(SEQ.phase!=='battle'){ idleSway(dt); }

  stepParticles(dt);
  stepGore(dt);
  renderAgents();
  director(dt,real,wall);
  hud(real);
  audioUpdate(real);

  fpsAcc+=real; fpsN++;
  if(fpsAcc>0.5){ $('fps').textContent=(fpsN/fpsAcc).toFixed(0)+' FPS · '+N+' UNITS'; fpsAcc=0; fpsN=0; }

  renderFrame(real);
}

/* pre-fight fidgeting so the standby screen isn't a morgue */
function idleSway(dt){
  for(let i=0;i<N;i++){
    if(A.st[i]===2) continue;
    A.ph[i]+=dt*2.2;
    A.yaw[i]+=Math.sin(BATTLE.t*0.7+i)*dt*0.35;
  }
  BATTLE.t+=dt;
  centroidUpdate(); enemyCentroids();
}

/* ============================================================
   BOOT
   ============================================================ */
buildRoster($('rosterFoe'), EXTRA_B,CFG.foes,true);
syncSliders();
resize();
standby();
camPos.set(0,ARENA_R*0.45,-ARENA_R*1.5);
requestAnimationFrame(loop);
