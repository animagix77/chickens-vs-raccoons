/* Judge Dean LLC — raid controls, daily challenges and earned survivor awards. */
const RAID_DIRECTIONS=['East','Southeast','South','Southwest','West','Northwest','North','Northeast'];
function raidDirection(angle){return RAID_DIRECTIONS[((Math.round(angle/(Math.PI/4))%8)+8)%8];}
function cancelDeployment(){DEPLOYMENT.selected=null;DEPLOYMENT.hover=null;raidHud();}
function beginDeployment(d){
  if(!canDeploy(d)||VIEW.paused||REPLAY.playback||RAID.phase==='prep')return false;
  DEPLOYMENT.selected=d.k;DEPLOYMENT.hover=null;
  document.body.classList.remove('deployOpen');$('btnDeploy').setAttribute('aria-expanded','false');
  DIR.drag=false;raidHud();$('deployCancel').focus({preventScroll:true});
  return true;
}
function commitDeployment(point){
  if(!DEPLOYMENT.selected||VIEW.paused||REPLAY.playback)return false;
  const k=DEPLOYMENT.selected;
  if(!queueBattleAction('deploy',k,point))return false;
  track('reinforcement_ordered',{unit:k,mode:CFG.mode});cancelDeployment();return true;
}
function arrivalPoint(angle){return {x:Math.round(Math.cos(angle)*ARENA_R*.88*100)/100,z:Math.round(Math.sin(angle)*ARENA_R*.88*100)/100};}
let raidRay=null,raidPlane=null,raidHit=null;
function pointerArrival(event){
  if(!raidRay){raidRay=new THREE.Raycaster();raidPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);raidHit=new THREE.Vector3();}
  const rect=renderer.domElement.getBoundingClientRect();
  raidRay.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  if(!raidRay.ray.intersectPlane(raidPlane,raidHit))return null;
  return arrivalPoint(Math.atan2(raidHit.z,raidHit.x));
}
function syncRaidSetup(){
  const raid=CFG.mode==='raid';document.body.classList.toggle('raidMode',raid);
  $('dailyBadge').textContent=CFG.challenge?'Daily raid · '+CFG.challenge+' · UTC':'Three waves. Two hens. One farm.';
  $('dailyBadge').hidden=!raid;
  $('go').textContent=raid?'Save the Coop':'Fight';
  // Scripted predators have a fixed roster, visible in the wave preview.
  const enemySlider=$('sB').closest('.row')||$('sB').parentElement;
  $('sB').disabled=raid;$('sB').setAttribute('aria-label',raid?'Predators are set by the three waves':'Raccoons');
  const foe=$('rosterFoe').closest('details');if(foe)foe.hidden=raid;
  if(enemySlider)enemySlider.classList.toggle('scriptedRoster',raid);
}
function raidHud(){
  document.body.classList.toggle('raid',RAID.active);
  const active=RAID.active&&SEQ.phase!=='idle'&&!BATTLE.over;
  $('raidHud').hidden=!active;
  const prep=active&&RAID.phase==='prep';
  document.body.classList.toggle('raidPreparing',prep);
  $('raidPrep').hidden=!prep;
  if(prep){DEPLOYMENT.selected=null;DEPLOYMENT.hover=null;}
  if(active){
    $('raidWave').textContent='Wave '+RAID.wave+' / 3';
    $('raidTitle').textContent=RAID.waveLabel;
    const incoming=RAID.pendingRemaining||0;
    $('raidStatus').textContent=prep?'The farm holds. Choose your next move.':aliveB+' predators · '+incoming+' incoming';
    $('raidDirection').textContent=(prep?'Next attack: ':'Approach: ')+raidDirection(prep?RAID.nextApproach:RAID.approach);
    $('raidProgress').value=((RAID.wave-1)+(prep?1:Math.min(.95,(RAID.waveTime||0)/22)))/3*100;
    $('raidPrepTitle').textContent='Wave '+RAID.wave+' held';
    $('raidPrepHint').textContent=RAID.choice?({repair:'Fence repairs complete.',recruit:'Six geese have joined your defense.',save:'18 supplies banked.'}[RAID.choice]):'Choose one reward. Your survivors stay for the next attack.';
    if($('raidPrepPause'))$('raidPrepPause').textContent=VIEW.paused?'Resume choices':'Pause choices';
    $('raidPrepTimer').textContent=VIEW.paused?'Paused':REPLAY.playback?'Replaying your choice · '+Math.ceil(RAID.prepLeft)+'s':'Next wave in '+Math.ceil(RAID.prepLeft)+'s · no choice banks supplies';
    document.querySelectorAll('[data-raid-choice]').forEach(b=>{
      b.disabled=!!RAID.choice||REPLAY.playback||VIEW.paused;
      b.classList.toggle('chosen',b.dataset.raidChoice===RAID.choice);b.setAttribute('aria-pressed',String(b.dataset.raidChoice===RAID.choice));
    });
  }
  const placing=!!DEPLOYMENT.selected&&active&&!prep;
  $('deployPlacement').hidden=!placing;
  document.body.classList.toggle('placingReinforcements',placing);
  if(placing){
    const d=DEPLOY.find(d=>d.k===DEPLOYMENT.selected);
    $('deployPlacementText').textContent=VIEW.paused?'Paused — resume to place reinforcements':d.n+' '+UNITS[UI_[d.k]].label+' · choose an arrival side · 1.8s ETA';
  }
  document.querySelectorAll('[data-deploy-sector]').forEach(b=>b.disabled=VIEW.paused||REPLAY.playback);
  $('challengeShare').hidden=!CFG.challenge;
  if(raidHud.prep!==prep){
    raidHud.prep=prep;
    if(typeof syncUIDialog==='function')queueMicrotask(()=>syncUIDialog());
  }
}
function startDailyRaid(date=new Date().toISOString().slice(0,10)){
  configureDaily(date);seedHeld=true;syncSliders();
  document.body.classList.remove('story','storyIn','rules','rulesIn','about','aboutIn');
  track('daily_raid_started',{date});startBattle({instant:true});
}
function copyChallenge(){
  const date=CFG.challenge;if(!date)return;
  const url=location.origin+location.pathname+'?daily='+encodeURIComponent(date);
  const button=$('challengeShare');
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(()=>{button.textContent='Challenge link copied';},()=>{button.textContent='Copy unavailable — use Copy link';});
  }else button.textContent='Copy unavailable — use Copy link';
}
function raidScore(){
  return coopHensAlive()*1000000000+Math.round(COOP.hens.reduce((n,h)=>n+h.hp,0))*1000000+Math.floor(CMD.pts)*10000+Math.max(0,aliveA);
}
function renderRaidAwards(){
  const box=$('raidAwards');box.replaceChildren();box.hidden=!RAID.active;if(!RAID.active)return;
  const awards=[];let hero=-1,breach=-1,lastGoose=-1,gooseCount=0;
  for(let i=0;i<N;i++)if(A.team[i]===0){
    if(RAID_AWARDS.breachKills[i]>0&&(breach<0||RAID_AWARDS.breachKills[i]>RAID_AWARDS.breachKills[breach]))breach=i;
    if(A.st[i]===2)continue;
    if(hero<0||A.kills[i]>A.kills[hero])hero=i;
    if(UNITS[A.kind[i]].k==='goose'){lastGoose=i;gooseCount++;}
  }
  const name=i=>A.name[i]||UNITS[A.kind[i]].label.replace(/s$/,'')+' #'+(i+1);
  if(hero>=0&&A.kills[hero]>0)awards.push(['Farm Hero',name(hero)+' · '+A.kills[hero]+' kills · survived']);
  if(breach>=0)awards.push(['Held the Breach',name(breach)+' stopped '+RAID_AWARDS.breachKills[breach]+' predators near the run']);
  if(gooseCount===1)awards.push(['Last Goose Standing',name(lastGoose)+' lived to honk another day']);
  if(coopHensAlive()===2&&BATTLE.winner==='birds')awards.push(['Both Hens Home','Three waves stopped. Two very unimpressed hens.']);
  if(!awards.length)awards.push(['A Farm Worth Defending',coopHensAlive()+' hens survived · reached wave '+RAID.wave]);
  for(const [label,detail] of awards.slice(0,3)){
    const item=document.createElement('div');item.className='raidAward';
    const title=document.createElement('strong');title.textContent=label;
    const text=document.createElement('span');text.textContent=detail;item.append(title,text);box.appendChild(item);
  }
  if(CFG.challenge){
    const score=raidScore(),key='com.judgedeanllc.chickens.daily.'+SIM_VERSION+'.'+CFG.challenge;
    let best=score;
    try{best=Math.max(score,Number(localStorage.getItem(key))||0);if(!REPLAY.playback)localStorage.setItem(key,String(best));}catch(e){}
    const note=document.createElement('p');note.className='dailyScore';
    note.textContent='Daily '+CFG.challenge+' · Score '+score.toLocaleString()+' · Personal best '+best.toLocaleString()+'. Hens, health, supplies, then survivors.';
    box.appendChild(note);
  }
}
function initRaidUI(){
  $('playNow').addEventListener('click',()=>{
    document.body.classList.remove('story','storyIn','rules','rulesIn');
    track('play_now');startBattle({instant:true});
  });
  $('dailyChallenge').addEventListener('click',()=>startDailyRaid());
  $('challengeShare').addEventListener('click',copyChallenge);
  if($('raidPrepPause'))$('raidPrepPause').addEventListener('click',()=>setPaused(!VIEW.paused));
  $('deployCancel').addEventListener('click',cancelDeployment);
  document.querySelectorAll('[data-raid-choice]').forEach(b=>b.addEventListener('click',()=>{
    if(queueBattleAction('choice',b.dataset.raidChoice))track('wave_reward',{choice:b.dataset.raidChoice,wave:RAID.wave});
  }));
  document.querySelectorAll('[data-deploy-sector]').forEach(b=>b.addEventListener('click',()=>commitDeployment(arrivalPoint(Number(b.dataset.deploySector)*Math.PI/4))));
  let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{if(DEPLOYMENT.selected){down={x:e.clientX,y:e.clientY};DEPLOYMENT.hover=pointerArrival(e);}});
  renderer.domElement.addEventListener('pointermove',e=>{if(DEPLOYMENT.selected)DEPLOYMENT.hover=pointerArrival(e);});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!DEPLOYMENT.selected||!down)return;
    const distance=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;
    if(distance<18){const point=pointerArrival(e);if(point)commitDeployment(point);}
  });
  renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
}
