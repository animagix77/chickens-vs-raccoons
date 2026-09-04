/* View controls and accessible UI. Simulation state and commands live in 06_ui. */
function syncControls(){
  const playing=BATTLE.running&&!BATTLE.over;
  $('btnPause').disabled=!playing;
  $('btnPause').textContent=VIEW.paused?'Resume':'Pause';
  $('btnPause').setAttribute('aria-pressed',String(VIEW.paused));
  $('btnTactical').classList.toggle('on',VIEW.tactical);
  $('btnTactical').setAttribute('aria-pressed',String(VIEW.tactical));
  $('playbackSpeed').value=String(VIEW.speed);
  $('btnQuick').checked=VIEW.quick;
  $('btnMotion').checked=VIEW.reducedMotion;
  document.body.classList.toggle('paused',VIEW.paused);
  document.body.classList.toggle('reducedMotion',VIEW.reducedMotion);
  document.body.classList.toggle('finished',BATTLE.over);
  if(!playing){ document.body.classList.remove('deployOpen'); $('btnDeploy').setAttribute('aria-expanded','false'); }
  const label=BATTLE.over?'Battle finished. '+$('cardA').textContent:
    VIEW.paused?'Battle paused.':SEQ.phase==='battle'?(REPLAY.playback?'Replaying recorded battle.':'Battle running.'):
    SEQ.phase==='idle'?'Choose your matchup.':'Battle starting. Make your prediction.';
  if(label&&syncControls.lastAnnouncement!==label){
    $('battleStatus').textContent=label; syncControls.lastAnnouncement=label;
  }
}

function saveViewPreferences(){
  try{ localStorage.setItem('cvr-view',JSON.stringify({quick:VIEW.quick,reducedMotion:VIEW.reducedMotion,film:$('btnFilm').checked})); }catch(e){}
}
let savedView=null;
try{ savedView=JSON.parse(localStorage.getItem('cvr-view')||'null'); }catch(e){}
VIEW.reducedMotion=savedView&&typeof savedView.reducedMotion==='boolean'
  ?savedView.reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches;
if(savedView&&typeof savedView.quick==='boolean') VIEW.quick=savedView.quick;
if(savedView&&savedView.film&&typeof setFilmLook==='function'){ $('btnFilm').checked=true; setFilmLook(true); }

$('btnPause').addEventListener('click',()=>{ setPaused(!VIEW.paused); syncControls(); });
$('playbackSpeed').addEventListener('change',e=>{ setPlaybackSpeed(+e.target.value); syncControls(); });
$('btnTactical').addEventListener('click',()=>{
  VIEW.tactical=!VIEW.tactical; DIR.manual=false; DIR.snap=true;
  $('btnCam').classList.add('on'); $('btnCam').textContent='Auto Cam'; syncControls();
});
$('btnCam').addEventListener('click',()=>{ VIEW.tactical=false; syncControls(); });
$('btnQuick').addEventListener('change',e=>{ VIEW.quick=e.target.checked; saveViewPreferences(); });
$('btnMotion').addEventListener('change',e=>{ VIEW.reducedMotion=e.target.checked; syncControls(); saveViewPreferences(); });
$('btnFilm').addEventListener('change',e=>{ if(typeof setFilmLook==='function') setFilmLook(e.target.checked); saveViewPreferences(); });
$('replay').addEventListener('click',e=>{ e.stopPropagation(); startBattle({replay:true}); syncControls(); });
$('btnDeploy').addEventListener('click',()=>{
  const opened=document.body.classList.toggle('deployOpen');
  $('btnDeploy').setAttribute('aria-expanded',String(opened));
});

/* Roles remain visible on touch screens; title tooltips are supplementary. */
const DEPLOY_ROLES={goose:'Shoves enemies',turkey:'Heavy birds',cat:'Fast critical hits',
  capybara:'Calms nearby allies',goat:'Headfirst charger',pig:'Sturdy brawler',
  llama:'Ranged guardian',donkey:'Sweeping kicks',dog:'Fast guardian',bull:'Breaks crowds'};
for(const b of $('cmddep').children){
  if(!b.dataset.k) continue;
  const role=document.createElement('span'); role.className='dr';
  role.textContent=DEPLOY_ROLES[b.dataset.k]||'Farm ally';
  b.appendChild(role);
}
for(const row of $('rosterFoe').children){
  const name=UNITS[UI_[row.dataset.k]].label;
  row.querySelector('[data-d="-1"]').setAttribute('aria-label','Fewer '+name.toLowerCase());
  row.querySelector('[data-d="1"]').setAttribute('aria-label','More '+name.toLowerCase());
}
function syncToggleSemantics(){
  document.querySelectorAll('#tools button:not(#btnPause),.seg button,.callb').forEach(b=>
    b.setAttribute('aria-pressed',String(b.classList.contains('on'))));
}
const toggleObserver=new MutationObserver(syncToggleSemantics);
for(const id of ['tools','segBird','segArena','callBtns'])
  toggleObserver.observe($(id),{subtree:true,attributes:true,attributeFilter:['class']});
syncToggleSemantics();

/* Overlays keep focus on their own controls, and hidden UI leaves the tab order. */
let activeUIDialog=null, dialogReturnFocus=null;
function syncUIDialog(){
  const body=document.body.classList;
  const next=body.contains('about')?$('about'):body.contains('story')?$('story'):
    body.contains('rules')?$('rules'):$('card').classList.contains('on')&&$('card').classList.contains('result')?$('card'):null;
  for(const child of frame.children){
    const hiddenOverlay=['story','rules','about'].includes(child.id)&&child!==next;
    const hiddenHud=body.contains('hideui')&&['panel','tools','cmdbar','topui','feed','champ'].includes(child.id);
    child.inert=next?child!==next:hiddenOverlay||hiddenHud||(child.id==='panel'&&(body.contains('live')||body.contains('reel')))||
      (child.id==='card'&&!child.classList.contains('on'));
  }
  for(const id of ['story','rules','about']) $(id).setAttribute('aria-hidden',String($(id)!==next));
  if(next===$('card')){
    next.setAttribute('role','dialog');next.setAttribute('aria-modal','true');next.setAttribute('aria-labelledby','cardA');
  }else{
    $('card').removeAttribute('role');$('card').removeAttribute('aria-modal');
  }
  if(next===activeUIDialog) return;
  const previous=activeUIDialog;
  if(!previous&&next) dialogReturnFocus=document.activeElement;
  activeUIDialog=next;
  if(next){
    const first=next.querySelector('button:not(:disabled),a[href]');
    (first||next).focus({preventScroll:true});
  }else if(previous){
    const restore=dialogReturnFocus&&dialogReturnFocus.isConnected&&!dialogReturnFocus.inert&&
      dialogReturnFocus.closest('#panel')&&!body.contains('live')?dialogReturnFocus:$('go');
    if(!body.contains('live')) restore.focus({preventScroll:true});
  }
}
const uiDialogObserver=new MutationObserver(syncUIDialog);
uiDialogObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
uiDialogObserver.observe($('card'),{attributes:true,attributeFilter:['class']});
document.addEventListener('keydown',e=>{
  if($('settings').open&&e.key==='Escape'){
    $('settings').open=false;$('settings').querySelector('summary').focus();e.preventDefault();e.stopPropagation();return;
  }
  const modal=activeUIDialog;
  if(!modal) return;
  e.stopPropagation(); // background game shortcuts must not fire from a dialog
  if(e.key==='Escape'){
    e.preventDefault();
    if(modal.id==='about') aboutHide();
    else if(modal.id==='story') storyHide();
    else if(modal.id==='rules') rulesHide();
    else toSetup();
  }
  if(e.key==='Tab'){
    const items=[...modal.querySelectorAll('button:not(:disabled),a[href],input,select,[tabindex="0"]')]
      .filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
    const first=items[0],last=items[items.length-1];
    if(!first){ e.preventDefault();modal.focus(); }
    else if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){e.preventDefault();first.focus();}
  }
});
document.addEventListener('pointerdown',e=>{ if(!$('settings').contains(e.target)) $('settings').open=false; });
syncControls();
syncUIDialog();
