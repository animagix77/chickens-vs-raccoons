/* Meaningful battle moments. Read-only observers: no simulation RNG or mutations.
   This file may be declared before 06_ui; initialize its UI after every part loads.
   Events are rebuilt during replay, so the recording needs no per-tick snapshots. */
const HIGHLIGHTS={events:[],seen:Object.create(null),startTotal:0,lastKills:0,
  lastTick:-1,lastMoraleTick:-15,milestones:[],finished:false,replayMomentUntil:0};
const HIGHLIGHT_LIMIT=12;
const HIGHLIGHT_RULES={
  firstclash:{priority:110,limit:1},firstloss:{priority:110,limit:1},
  fencehit:{priority:90,limit:1},breach:{priority:105,limit:2},
  henlost:{priority:105,limit:2},moralebreak:{priority:90,limit:1},
  loss25:{priority:55,limit:1},loss50:{priority:65,limit:1},loss75:{priority:75,limit:1},
  deploy:{priority:40,limit:2},command:{priority:35,limit:2},final:{priority:120,limit:1}
};
function highlightTimestamp(tick){
  const seconds=Math.max(0,Math.floor(tick/60));
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
function highlightReset(){
  HIGHLIGHTS.events=[]; HIGHLIGHTS.seen=Object.create(null);
  HIGHLIGHTS.startTotal=typeof initA==='number'&&typeof initB==='number'?initA+initB:0;
  HIGHLIGHTS.lastKills=0; HIGHLIGHTS.lastTick=-1; HIGHLIGHTS.lastMoraleTick=-15;
  HIGHLIGHTS.finished=false; HIGHLIGHTS.replayMomentUntil=0;
  HIGHLIGHTS.milestones=[.25,.50,.75].map((fraction,i)=>({
    type:['loss25','loss50','loss75'][i],kills:Math.max((i+1)*10,Math.ceil(HIGHLIGHTS.startTotal*fraction)),done:false
  }));
  if(typeof document!=='undefined'){
    const section=document.getElementById('replayHighlights'); if(section) section.hidden=true;
    const moment=document.getElementById('replayMoment'); if(moment) moment.hidden=true;
  }
}
function highlightEvent(type,label,x,z,tick){
  if(HIGHLIGHTS.finished) return null;
  type=String(type||'moment').toLowerCase().replace(/[_-]/g,'');
  const rule=HIGHLIGHT_RULES[type]||{priority:60,limit:1};
  if((HIGHLIGHTS.seen[type]||0)>=rule.limit) return null;
  const now=tick===undefined?(typeof BATTLE!=='undefined'?BATTLE.tick:0):tick;
  if(!Number.isInteger(now)||now<0||typeof label!=='string'||!label.trim()) return null;
  const event={type,label:label.trim().slice(0,160),tick:now,
    x:Number.isFinite(x)?x:0,z:Number.isFinite(z)?z:0,priority:rule.priority};
  if(HIGHLIGHTS.events.length>=HIGHLIGHT_LIMIT){
    // Prefer objective events over repetitive purchases or intermediate loss totals.
    let remove=-1;
    for(let i=0;i<HIGHLIGHTS.events.length;i++){
      const candidate=HIGHLIGHTS.events[i];
      if(candidate.priority<event.priority&&(remove<0||candidate.priority<=HIGHLIGHTS.events[remove].priority)) remove=i;
    }
    if(remove<0) return null;
    HIGHLIGHTS.events.splice(remove,1);
  }
  HIGHLIGHTS.seen[type]=(HIGHLIGHTS.seen[type]||0)+1;
  HIGHLIGHTS.events.push(event);
  HIGHLIGHTS.events.sort((a,b)=>a.tick-b.tick); // Stable order for multiple events on one tick.
  if(rule.priority>=75) highlightReplayMoment(event);
  return event;
}
function highlightReplayMoment(event){
  if(typeof document==='undefined'||typeof REPLAY==='undefined'||!REPLAY.playback||REPLAY.seeking) return;
  const moment=document.getElementById('replayMoment'); if(!moment) return;
  moment.textContent='Replay · '+highlightTimestamp(event.tick)+' · '+event.label;
  moment.hidden=false; HIGHLIGHTS.replayMomentUntil=event.tick+180;
}
function highlightTick(){
  if(typeof BATTLE==='undefined'||!BATTLE.running||BATTLE.over||HIGHLIGHTS.finished) return;
  const tick=BATTLE.tick;
  if(!Number.isInteger(tick)||tick<1||tick===HIGHLIGHTS.lastTick) return;
  HIGHLIGHTS.lastTick=tick;
  if(BATTLE.conN>0) highlightEvent('firstclash','First contact: the armies meet',BATTLE.conX,BATTLE.conZ);
  const kills=BATTLE.totalKills;
  if(kills>0&&!HIGHLIGHTS.seen.firstloss){
    let x=BATTLE.cx,z=BATTLE.cz;
    // Find a real casualty location once; possums playing dead are not casualties.
    if(typeof A!=='undefined'&&typeof N==='number') for(let i=0;i<N;i++){
      if(A.st[i]===2&&(!A.rev||A.rev[i]===0)){x=A.x[i];z=A.z[i];break;}
    }
    highlightEvent('firstloss','First casualty: '+(initA-aliveA>0?'the farm loses an animal':'a predator falls'),x,z);
  }
  for(const milestone of HIGHLIGHTS.milestones){
    if(!milestone.done&&kills>=milestone.kills){
      milestone.done=true;
      highlightEvent(milestone.type,milestone.kills.toLocaleString()+' casualties: losses mount',BATTLE.cx,BATTLE.cz);
    }
  }
  HIGHLIGHTS.lastKills=kills;
  // Morale changes on a 0.45s cadence; scanning four times/second avoids another
  // full crowd walk on every 60Hz tick. Count living fleeing animals, not panicCount.
  if(!HIGHLIGHTS.seen.moralebreak&&tick-HIGHLIGHTS.lastMoraleTick>=15){
    HIGHLIGHTS.lastMoraleTick=tick;
    let fleeing=0,fx=0,fz=0;
    if(typeof A!=='undefined'&&typeof N==='number') for(let i=0;i<N;i++){
      if(A.team[i]===0&&A.st[i]===1){fleeing++;fx+=A.x[i];fz+=A.z[i];}
    }
    if(aliveA>0&&fleeing>=Math.max(3,Math.ceil(aliveA*.25)))
      highlightEvent('moralebreak','Farm morale breaks: '+fleeing+' living animals flee',fx/fleeing,fz/fleeing);
  }
  if(typeof document!=='undefined'){
    const moment=document.getElementById('replayMoment');
    if(moment&&tick>HIGHLIGHTS.replayMomentUntil) moment.hidden=true;
  }
}
function highlightFinish(who,how){
  if(HIGHLIGHTS.finished) return;
  const winner=who==='birds'?'Farm victory':who==='coons'?'Predator victory':'Battle finished';
  highlightEvent('final',winner+(how?': '+how:''),typeof BATTLE!=='undefined'?BATTLE.cx:0,typeof BATTLE!=='undefined'?BATTLE.cz:0);
  HIGHLIGHTS.finished=true;
  if(typeof document!=='undefined'){
    const moment=document.getElementById('replayMoment');if(moment) moment.hidden=true;
    renderHighlights();
  }
}
function initHighlightsUI(){
  if(typeof document==='undefined') return;
  const tale=document.getElementById('cardTale');if(!tale) return;
  if(!document.getElementById('highlightsStyle')){
    const style=document.createElement('style');style.id='highlightsStyle';
    style.textContent=`
      #replayHighlights{width:min(560px,100%);margin:18px 0 0;text-align:left;pointer-events:auto}
      #replayHighlights[hidden],#replayMoment[hidden]{display:none!important}
      #replayHighlights h3{margin:0 0 6px;font-size:13px;letter-spacing:.04em;color:var(--paper,#eee)}
      #highlightHint{margin:0 0 10px;font-size:11px;line-height:1.5;color:#c9c2b8}
      #highlightList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      #highlightList button{min-height:48px;padding:10px 12px;text-align:left;background:#282531cc;
        border:1px solid #ffffff25;border-radius:10px;color:var(--paper,#eee);font:inherit;
        font-size:11px;line-height:1.45;letter-spacing:0;cursor:pointer;display:flex;gap:9px;align-items:flex-start}
      #highlightList button:hover{background:#3a3040;border-color:#edc78580}
      #highlightList button:focus-visible{outline:2px solid #edc785;outline-offset:3px}
      #highlightList button:disabled{opacity:.65;cursor:wait}
      #highlightList .highlightTime{flex-shrink:0;font-variant-numeric:tabular-nums;color:#edc785;font-weight:700}
      #replayMoment{position:absolute;top:94px;left:50%;transform:translateX(-50%);z-index:12;
        width:max-content;max-width:calc(100% - 28px);padding:7px 10px;border-radius:8px;
        background:#191721dc;color:#ede5d8;box-sizing:border-box;font:11px/1.4 system-ui;
        text-align:center;pointer-events:none;border:1px solid #ffffff20}
      @media(max-width:600px){#highlightList{grid-template-columns:1fr}#replayMoment{top:108px;font-size:10px}}
    `;
    document.head.appendChild(style);
  }
  if(!document.getElementById('replayHighlights')){
    const section=document.createElement('section');section.id='replayHighlights';section.hidden=true;
    section.setAttribute('aria-labelledby','highlightHeading');
    const heading=document.createElement('h3');heading.id='highlightHeading';heading.textContent='Moments to replay';
    const hint=document.createElement('p');hint.id='highlightHint';hint.textContent='Choose a moment to replay from a few seconds before it.';
    hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
    const list=document.createElement('div');list.id='highlightList';
    section.appendChild(heading);section.appendChild(hint);section.appendChild(list);(document.getElementById('cardBtns')||tale).after(section);
  }
  const frameElement=document.getElementById('frame');
  if(frameElement&&!document.getElementById('replayMoment')){
    const moment=document.createElement('div');moment.id='replayMoment';moment.hidden=true;
    moment.setAttribute('role','status');moment.setAttribute('aria-live','polite');frameElement.appendChild(moment);
  }
  if(HIGHLIGHTS.finished) renderHighlights();
}
function renderHighlights(){
  const section=document.getElementById('replayHighlights'),list=document.getElementById('highlightList');
  if(!section||!list) return;
  list.replaceChildren();section.hidden=HIGHLIGHTS.events.length===0;
  const hint=document.getElementById('highlightHint');if(hint)hint.textContent='Choose a moment to replay from a few seconds before it.';
  for(const event of HIGHLIGHTS.events){
    const button=document.createElement('button');button.type='button';
    button.setAttribute('aria-label','Replay shortly before '+highlightTimestamp(event.tick)+': '+event.label);
    const time=document.createElement('span');time.className='highlightTime';time.textContent=highlightTimestamp(event.tick);
    const label=document.createElement('span');label.textContent=event.label;button.appendChild(time);button.appendChild(label);
    button.addEventListener('click',()=>{
      const hint=document.getElementById('highlightHint');
      if(typeof seekReplayHighlight!=='function'){hint.textContent='Replay is unavailable for this battle.';return;}
      button.disabled=true;hint.textContent='Opening '+highlightTimestamp(event.tick)+' · '+event.label;
      try{
        const result=seekReplayHighlight(event.tick);
        if(result===false){button.disabled=false;hint.textContent='This battle could not be replayed.';}
        else if(result&&typeof result.catch==='function') result.catch(()=>{button.disabled=false;hint.textContent='This battle could not be replayed.';});
      }catch(e){button.disabled=false;hint.textContent='This battle could not be replayed.';}
    });
    list.appendChild(button);
  }
}
