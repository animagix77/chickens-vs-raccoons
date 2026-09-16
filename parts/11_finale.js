/* Presentation-only finish. The winning simulation tick is frozen; the final
   casualty gets a separate visual clock, so camera speed never changes a replay. */
const FINALE={active:false,hold:false,t:0,duration:3.6,target:null,who:'',how:'',
  deaths:[null,null],hen:null,startPos:null,startAim:null,startFov:46,angle:0};
function rememberFinalDeath(i){
  FINALE.deaths[A.team[i]]={type:'unit',i,x:A.x[i],z:A.z[i],y:A.fy[i]||0,rad:UNITS[A.kind[i]].rad};
}
function rememberFinalHen(i){
  const h=COOP.hens[i];FINALE.hen={type:'hen',i,x:h.x,z:h.z,y:0,rad:.8};
}
function resetFinale(){
  FINALE.active=false;FINALE.hold=false;FINALE.t=0;FINALE.target=null;
  FINALE.deaths=[null,null];FINALE.hen=null;
  const banner=$('finaleBanner');if(banner)banner.hidden=true;
  document.body.classList.remove('finishing');
}
function chooseFinaleAngle(target){
  const base=Math.atan2(camera.position.z-target.z,camera.position.x-target.x);
  if(target.type==='hen')return Math.atan2(1,target.x*.35);
  let best=base,bestScore=Infinity;
  // Prefer a clear view through the crowd without moving any simulation actors.
  for(let k=0;k<8;k++){
    const angle=base+k*Math.PI/4,dx=Math.cos(angle),dz=Math.sin(angle);
    let score=.15*Math.min(k,8-k);
    for(let i=0;i<N;i++){
      if(i===target.i||(A.st[i]===2&&A.dead[i]>30))continue;
      const x=A.x[i]-target.x,z=A.z[i]-target.z,front=x*dx+z*dz,side=Math.abs(x*dz-z*dx);
      const width=UNITS[A.kind[i]].rad+1;
      if(front>0&&front<8&&side<width)score+=(1-side/width)*(1-front/8)*(A.st[i]===2?.3:1);
    }
    if(score<bestScore){bestScore=score;best=angle;}
  }
  return best;
}
function beginFinale(who,how){
  if(FINALE.active||REPLAY.seeking)return false;
  let target=null;
  if(COOP.active&&who==='coons'&&coopHensAlive()===0)target=FINALE.hen;
  else if(who==='birds'&&initB>0&&aliveB<=0)target=FINALE.deaths[1];
  else if(!COOP.active&&who==='coons'&&initA>0&&aliveA<=0)target=FINALE.deaths[0];
  // Timed/stalemate/uncontested outcomes do not invent a last casualty.
  if(!target)return false;
  if(target.type==='unit')target=Object.assign({},target,{x:A.x[target.i],z:A.z[target.i]});
  FINALE.active=true;FINALE.hold=false;FINALE.t=0;FINALE.target=target;
  FINALE.who=who;FINALE.how=how;FINALE.duration=VIEW.reducedMotion?.8:3.6;
  FINALE.startPos=camera.position.clone();FINALE.startAim=camAim.clone();FINALE.startFov=camera.fov;FINALE.angle=chooseFinaleAngle(target);
  BATTLE.over=true;BATTLE.running=false;BATTLE.winner=who;VIEW.paused=false;
  REPLAY.last=copyFight(REPLAY.current);
  hideCard();document.body.classList.remove('fighting');document.body.classList.add('finishing');
  $('finaleLabel').textContent=target.type==='hen'?'The last hen fell':who==='birds'?'The last predator falls':'The last defender falls';
  $('finaleBanner').hidden=false;
  setPhase('finale');
  if(typeof highlightFinish==='function')highlightFinish(who,how);
  if(!VIEW.reducedMotion)sting('slow');
  $('finaleSkip').focus({preventScroll:true});
  return true;
}
function finishFinale(){
  if(!FINALE.active)return;
  FINALE.t=FINALE.duration;FINALE.active=false;FINALE.hold=true;
  $('finaleBanner').hidden=true;document.body.classList.remove('finishing');
  BATTLE.timeScale=1;BATTLE.slowT=0;$('slowmo').classList.remove('on');
  showVerdict(FINALE.who,FINALE.how);
}
function stepFinale(wall){
  if(!FINALE.active)return;
  FINALE.t+=Math.max(0,wall);
  if(FINALE.t>=FINALE.duration)finishFinale();
}
function finaleSubject(type,i){return (FINALE.active||FINALE.hold)&&FINALE.target&&FINALE.target.type===type&&FINALE.target.i===i;}
function finaleDeathTime(){return FINALE.hold?.7:VIEW.reducedMotion?.7:Math.max(0,FINALE.t-.75)*.18;}
function finaleCamera(){
  if(!(FINALE.active||FINALE.hold)||!FINALE.target)return false;
  if(VIEW.reducedMotion)return true; // retain the last frame's camera without a push-in
  const target=FINALE.target,fit=1/Math.sqrt(Math.min(1,camera.aspect));
  const distance=(5.5+target.rad*1.8)*fit;
  const dx=Math.cos(FINALE.angle),dz=Math.sin(FINALE.angle);
  const zoom=clamp(FINALE.t/1.15,0,1),ease=1-Math.pow(1-zoom,3);
  const height=Math.max(.5,Math.min(1.5,target.rad));
  camPos.copy(FINALE.startPos).lerp(new THREE.Vector3(target.x+dx*distance,height+distance*.9,target.z+dz*distance),ease);
  camAim.copy(FINALE.startAim).lerp(new THREE.Vector3(target.x,height,target.z),ease);
  camera.position.copy(camPos);camera.lookAt(camAim);
  camera.fov=lerp(FINALE.startFov,38,ease);camera.updateProjectionMatrix();
  return true;
}
function initFinaleUI(){
  $('finaleSkip').addEventListener('click',e=>{e.stopPropagation();finishFinale();});
  $('finaleSkip').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finishFinale();}});
}
