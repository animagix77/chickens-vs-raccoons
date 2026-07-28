
/* ============================================================
   NAMES + KILL FEED
   ============================================================ */
const BIRD_NAMES=['Nugget','Cluck Norris','Sir Pecksalot','Beakzilla','Hen Solo','Gregory',
 'Attila the Hen','Yolko Ono','Mother Clucker','Elvis Poultry','Sergeant Squawk','Beyoncluck',
 'Rooster Cogburn','Napoleon Bonapecked','El Gallo Diablo','Winglord','Sir Nibbles','Feathernando',
 'Clucky Balboa','Karen','The Undertaker','Big Chungus','Colonel Regret','Doom Hen','Kevin',
 'Marshal Drumstick','Gary the Terrible','Poultrygeist','Wingus','Dwayne the Cock','Chairman Miao',
 'Steve','Lil Beak','The Omelette Ender','Bartholomew','Cocktopus Prime','Nugget II: Revenge'];
const COON_NAMES=['Bandito','Trash Panda Prime','Dumpster Dave','Rocket','Meatball','Trashley',
 'Garbage Gary','The Hamburglar','Ring King','Nocturne','Snackrifice','Lord Rummage','Bin Laden Jr',
 'Pillage','Tiny Hands McGee','Mask','Chonk','The Night Shift','Debris','Nacho','Sir Rummages-a-Lot'];

const KILL_VERBS_BIRD=['spurred','flogged','erased','dismantled','pecked into orbit','unmade',
 'sent to the shadow realm','deleted','beaked','folded','ratio’d','turned into a hat'];
const KILL_VERBS_COON=['unhinged','disassembled','turned into confetti','yeeted','uninstalled',
 'cracked open','made into a nugget','processed','shredded','filed away','ended'];

const feedEl=$('feed');
let feedLock=0;
function killFeed(by,victim,crit){
  if(!BATTLE.running) return;
  feedLock--;
  if(feedLock>0) return;
  feedLock=Math.max(2,(BATTLE.totalKills/40)|0);
  const byBird=A.team[by]===0;
  const nm=A.name[by]||('A '+UNITS[A.kind[by]].label.replace(/s$/,'').toLowerCase());
  const vn=A.name[victim]||('a '+UNITS[A.kind[victim]].label.replace(/s$/,'').toLowerCase());
  const v=pick(byBird?KILL_VERBS_BIRD:KILL_VERBS_COON);
  const d=document.createElement('div');
  d.className='kf'+(crit||A.kills[by]>=5?' big':'');
  d.innerHTML=(byBird?'<b>':'<i>')+nm+(byBird?'</b>':'</i>')+' '+v+' '+
              (byBird?'<i>':'<b>')+vn+(byBird?'</i>':'</b>')+
              (crit?' <span style="color:#ffb020">✦ SPUR</span>':'');
  feedEl.appendChild(d);
  while(feedEl.children.length>5) feedEl.removeChild(feedEl.firstChild);
}
function killFeedRaw(html){
  const d=document.createElement('div'); d.className='kf big'; d.innerHTML=html;
  feedEl.appendChild(d);
  while(feedEl.children.length>5) feedEl.removeChild(feedEl.firstChild);
}
function clearFeed(){ feedEl.innerHTML=''; feedLock=0; }

/* ============================================================
   SOUND
   Every noise below is built from oscillators and noise at runtime —
   no samples. Animal calls use a formant model: a buzzy glottal source
   pushed through 2-4 resonant bandpass filters, which is roughly what a
   real syrinx does and why it reads as "bird" rather than "synth".
   Events are positioned: panned by screen position, attenuated and
   low-passed by distance, and fed to a synthetic room reverb.
   ============================================================ */
let AC=null, master=null, mFilter=null, revSend=null,
    soundOn=true, noiseBuf=null, sfxTokens=9, murmurT=0, farT=0,
    voxTokens=6, cryT=0;
const amb={};
const _ap=new THREE.Vector3(), _ap2=new THREE.Vector3();

/* synthetic impulse response — noise with a decaying, darkening tail */
function makeIR(sec,decay,dark){
  const len=(AC.sampleRate*sec)|0, b=AC.createBuffer(2,len,AC.sampleRate);
  for(let c=0;c<2;c++){
    const d=b.getChannelData(c); let lp=0;
    for(let i=0;i<len;i++){
      const n=(Math.random()*2-1)*Math.pow(1-i/len,decay);
      lp+=(n-lp)*dark; d[i]=lp*1.4;
    }
  }
  return b;
}

function audioInit(){
  if(AC) return;
  const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx) return;
  AC=new Ctx();

  const comp=AC.createDynamicsCompressor();
  comp.threshold.value=-19; comp.knee.value=14; comp.ratio.value=6;
  comp.attack.value=.004; comp.release.value=.26;
  mFilter=AC.createBiquadFilter(); mFilter.type='lowpass'; mFilter.frequency.value=18000;
  master=AC.createGain(); master.gain.value=0.0001;
  master.connect(mFilter); mFilter.connect(comp); comp.connect(AC.destination);

  noiseBuf=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);
  const nd=noiseBuf.getChannelData(0);
  for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;

  const conv=AC.createConvolver(); conv.buffer=makeIR(1.25,3.0,0.32);
  revSend=AC.createGain(); revSend.gain.value=0.10;
  const wet=AC.createGain(); wet.gain.value=0.85;
  revSend.connect(conv); conv.connect(wet); wet.connect(mFilter);

  const loop=(type,freq,q,gain)=>{
    const s=AC.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
    const f=AC.createBiquadFilter(); f.type=type; f.frequency.value=freq; if(q)f.Q.value=q;
    const g=AC.createGain(); g.gain.value=gain;
    s.connect(f); f.connect(g); s.start();
    return {src:s,filter:f,gain:g};
  };

  amb.wind=loop('lowpass',430,0,0.05); amb.wind.gain.connect(master);
  const wl=AC.createOscillator(); wl.frequency.value=0.09;
  const wg=AC.createGain(); wg.gain.value=0.028;
  wl.connect(wg); wg.connect(amb.wind.gain.gain); wl.start();

  amb.crick=loop('bandpass',4700,17,0.5);
  const cOut=AC.createGain(); cOut.gain.value=0;
  amb.crick.gain.connect(cOut); cOut.connect(master); amb.crickOut=cOut;
  const tr=AC.createOscillator(); tr.type='square'; tr.frequency.value=10.5;
  const trg=AC.createGain(); trg.gain.value=0.5;
  tr.connect(trg); trg.connect(amb.crick.gain.gain); tr.start();

  amb.roar=loop('bandpass',1150,1.1,0); amb.roar.gain.connect(master);
  const rl=AC.createOscillator(); rl.type='sine'; rl.frequency.value=5.5;
  const rlg=AC.createGain(); rlg.gain.value=0.4;
  rl.connect(rlg); rlg.connect(amb.roar.filter.detune); rl.start();

  musicInit();
  master.gain.setTargetAtTime(soundOn?0.85:0.0001, AC.currentTime, 0.5);
}
/* ---------- getting sound out of iOS Safari ----------
   Three separate things have to go right on an iPad and only the first is
   obvious. The context has to be created and resumed inside a real user
   gesture. It also has to actually play a source inside that gesture or
   Safari reports 'running' and stays silent. And WebAudio alone is filed
   under the ambient audio session, which the ringer switch mutes — a muted
   iPad plays nothing no matter how correct the rest of it is, unless a
   media element has claimed a playback session first.

   The old code hooked one listener with {once:true}. A single failed attempt
   meant silence for the rest of the visit, with no way back. */
let audioPrimed=false, silentEl=null;
/* 0.35s of digital silence — enough for iOS to grant a playback session */
const SILENT_WAV='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';
function audioPrime(){
  if(audioPrimed||!AC) return;
  try{
    const b=AC.createBuffer(1,1,AC.sampleRate);
    const src=AC.createBufferSource();
    src.buffer=b; src.connect(AC.destination); src.start(0);
  }catch(e){}
  try{
    if(!silentEl){
      silentEl=new Audio(SILENT_WAV);
      silentEl.loop=true; silentEl.volume=0.0001;
      silentEl.setAttribute('playsinline','');
    }
    const pr=silentEl.play(); if(pr&&pr.catch) pr.catch(()=>{});
  }catch(e){}
  audioPrimed=true;
}
function audioResume(){
  audioInit();
  if(!AC) return;
  if(AC.state!=='running'){
    const pr=AC.resume(); if(pr&&pr.catch) pr.catch(()=>{});
  }
  audioPrime();
  audioBadge();
  /* the context has only just appeared — start whatever should be playing */
  if(AC&&AC.state==='running'&&MUS.bus&&MUS.next<AC.currentTime) MUS.next=AC.currentTime+.05;
}
/* a visible way back if the browser refused the first time */
function audioBadge(){
  const el=$('sndhint'); if(!el) return;
  el.classList.toggle('on', !!AC && AC.state!=='running' && (soundOn||MUS.on));
}

/* ---------- primitives ---------- */
function outBus(pan){
  const g=AC.createGain(); let n=g;
  if(AC.createStereoPanner){ const p=AC.createStereoPanner(); p.pan.value=pan||0; g.connect(p); n=p; }
  n.connect(master); n.connect(revSend);
  return g;
}
function env(dest,t,a,d,peak){
  const g=AC.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0003,peak),t+a);
  g.gain.exponentialRampToValueAtTime(0.0001,t+a+d);
  g.connect(dest); return g;
}
function nz(dest,t,dur,type,freq,q,peak,rate){
  const s=AC.createBufferSource(); s.buffer=noiseBuf;
  s.playbackRate.value=rate||1;
  const f=AC.createBiquadFilter(); f.type=type; f.frequency.value=freq; if(q)f.Q.value=q;
  const g=env(dest,t,Math.min(.008,dur*.25),dur,peak);
  s.connect(f); f.connect(g); s.start(t); s.stop(t+dur+.06);
  return f;
}
/* the formant voice: source -> parallel resonators -> envelope */
function vox(dest,t,o){
  const src=AC.createOscillator(); src.type=o.wave||'sawtooth';
  src.frequency.setValueAtTime(o.f0,t);
  (o.pitch||[]).forEach(pm=>src.frequency.exponentialRampToValueAtTime(Math.max(28,o.f0*pm[1]),t+o.dur*pm[0]));
  if(o.vib){
    const lv=AC.createOscillator(); lv.frequency.value=o.vib[0];
    const lg=AC.createGain(); lg.gain.value=o.vib[1];
    lv.connect(lg); lg.connect(src.frequency); lv.start(t); lv.stop(t+o.dur+.06);
  }
  const sum=AC.createGain();
  (o.form||[[1100,6,1],[2600,8,.5]]).forEach(fm=>{
    const bp=AC.createBiquadFilter(); bp.type='bandpass';
    bp.frequency.setValueAtTime(fm[0],t); bp.Q.value=fm[1];
    if(o.glide) bp.frequency.exponentialRampToValueAtTime(fm[0]*o.glide,t+o.dur);
    const ag=AC.createGain(); ag.gain.value=fm[2];
    src.connect(bp); bp.connect(ag); ag.connect(sum);
  });
  if(o.noise){
    const s=AC.createBufferSource(); s.buffer=noiseBuf; s.playbackRate.value=rnd(.7,1.4);
    const nf=AC.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=o.noiseF||2800; nf.Q.value=1.1;
    const ng=AC.createGain(); ng.gain.value=o.noise;
    s.connect(nf); nf.connect(ng); ng.connect(sum); s.start(t); s.stop(t+o.dur+.06);
  }
  let tail=sum;
  if(o.am){                                   // rapid tremolo = chitter / growl rasp
    const lo=AC.createOscillator(); lo.type='square'; lo.frequency.value=o.am;
    const lg=AC.createGain(); lg.gain.value=.5;
    const amG=AC.createGain(); amG.gain.value=.5;
    lo.connect(lg); lg.connect(amG.gain); sum.connect(amG);
    lo.start(t); lo.stop(t+o.dur+.06); tail=amG;
  }
  tail.connect(env(dest,t,o.atk||.012,o.dur,o.vol));
  src.start(t); src.stop(t+o.dur+.07);
}

/* ---------- the bestiary ---------- */
const VOX={
  thud(d,v,t){ t=t||AC.currentTime;
    const o=AC.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(rnd(135,195),t);
    o.frequency.exponentialRampToValueAtTime(38,t+.16);
    o.connect(env(d,t,.004,.17,.30*v)); o.start(t); o.stop(t+.25);
    nz(d,t,.06,'lowpass',rnd(300,520),0,.15*v,1);
  },
  peck(d,v){ const t=AC.currentTime;
    nz(d,t,.032,'bandpass',rnd(1700,3300),3.6,.30*v,rnd(.85,1.35));
    const o=AC.createOscillator(); o.type='triangle'; o.frequency.value=rnd(560,1000);
    o.connect(env(d,t,.003,.028,.10*v)); o.start(t); o.stop(t+.06);
    if(Math.random()<.10) VOX.buk(d,v*.75);
  },
  slash(d,v){ const t=AC.currentTime;
    const f=nz(d,t,.13,'bandpass',2700,1.4,.24*v,rnd(.8,1.2));
    f.frequency.setValueAtTime(rnd(2400,3200),t);
    f.frequency.exponentialRampToValueAtTime(rnd(600,900),t+.12);
    VOX.thud(d,v*.9,t+.02);
    const r=Math.random();
    if(r<.10) VOX.chitter(d,v*.7); else if(r<.16) VOX.growl(d,v*.7);
  },
  flap(d,v){ const t=AC.currentTime;
    for(let i=0;i<3;i++) nz(d,t+i*rnd(.05,.085),.05,'lowpass',rnd(480,900),0,.15*v,rnd(.6,1));
  },
  buk(d,v){ vox(d,AC.currentTime,{f0:rnd(295,435),dur:.10,vol:.20*v,
    pitch:[[.25,1.45],[1,.62]], noise:.05, noiseF:2600,
    form:[[rnd(940,1260),7,1],[rnd(2250,2850),9,.55],[3900,11,.24]]}); },
  squawk(d,v){ const f0=rnd(420,730); vox(d,AC.currentTime,{f0,dur:.30,vol:.23*v,
    pitch:[[.09,2.25],[.4,1.7],[1,.52]], vib:[rnd(18,32),rnd(25,70)], noise:.14, noiseF:3200,
    form:[[rnd(1140,1460),4,1],[rnd(2650,3250),6,.72],[4400,9,.34]]}); },
  cackle(d,v){ const t=AC.currentTime, f=rnd(315,435), n=2+((Math.random()*2)|0);
    for(let i=0;i<n;i++) vox(d,t+i*rnd(.10,.13),{f0:f*(1+i*.12),dur:.075,vol:.17*v,
      pitch:[[.3,1.4],[1,.65]], noise:.05, form:[[1150,7,1],[2600,9,.5]]});
    vox(d,t+n*.12+.02,{f0:f*1.7,dur:.34,vol:.24*v, pitch:[[.1,1.9],[.45,1.5],[1,.5]],
      vib:[24,50], noise:.15, form:[[1300,4,1],[2900,6,.7],[4300,9,.3]]});
  },
  birddeath(d,v){ const t=AC.currentTime;
    vox(d,t,{f0:rnd(510,830),dur:.42,vol:.27*v, glide:.55, noise:.22, noiseF:3400,
      pitch:[[.05,2.4],[.28,1.15],[.6,.7],[1,.28]], vib:[rnd(22,38),rnd(50,110)],
      form:[[rnd(1180,1520),3.5,1],[rnd(2750,3450),5,.8],[4600,8,.4]]});
    VOX.thud(d,v*.8,t+.03);
    for(let i=0;i<2;i++) nz(d,t+.06+i*.07,.05,'lowpass',700,0,.11*v,rnd(.6,1));
  },

  /* ---------- the barnyard proper ----------
     Each of these is the same trick: a buzzy source at the animal's pitch,
     pushed through parallel bandpass resonators standing in for a throat.
     What separates a goat from a donkey is mostly the vibrato rate and where
     those resonances sit, so the numbers below are the whole characterisation. */
  bawk(d,v){ const t=AC.currentTime, f=rnd(400,560);   // BAWK-buk-buk-buk
    vox(d,t,{f0:f,dur:.20,vol:.28*v, pitch:[[.08,2.1],[.35,1.5],[1,.58]],
      vib:[rnd(20,30),rnd(40,80)], noise:.16, noiseF:3100,
      form:[[rnd(1150,1450),4,1],[rnd(2700,3300),6,.7],[4400,9,.32]]});
    const n=2+((Math.random()*3)|0);
    for(let i=0;i<n;i++) vox(d,t+.24+i*rnd(.11,.15),{f0:f*rnd(.62,.74),dur:.08,
      vol:.19*v, pitch:[[.3,1.35],[1,.66]], noise:.05,
      form:[[1080,7,1],[2500,9,.5]]});
  },
  bark(d,v){ const t=AC.currentTime, n=1+((Math.random()*3)|0);
    for(let i=0;i<n;i++){ const f=rnd(230,420);
      vox(d,t+i*rnd(.15,.24),{f0:f,dur:.11,vol:.30*v, wave:'square',
        pitch:[[.12,1.7],[1,.5]], noise:.22, noiseF:1900,
        form:[[rnd(620,820),3.5,1],[rnd(1500,1900),5,.65],[2900,7,.3]]});
      nz(d,t+i*.19,.05,'bandpass',rnd(900,1500),1.6,.12*v,1);
    }
  },
  bleat(d,v){ vox(d,AC.currentTime,{f0:rnd(215,330),dur:rnd(.45,.62),vol:.26*v,
    pitch:[[.15,1.12],[1,.78]], vib:[rnd(22,30),rnd(60,105)],   // the wobble is the goat
    noise:.10, noiseF:2400, form:[[rnd(880,1120),5,1],[rnd(1950,2400),7,.6],[3400,9,.25]]}); },
  bray(d,v){ const t=AC.currentTime;                  // hee-HAW
    vox(d,t,{f0:rnd(300,400),dur:.30,vol:.26*v, pitch:[[.2,1.5],[1,1.15]],
      am:rnd(15,22), noise:.14, noiseF:2200, form:[[1000,4,1],[2300,6,.5]]});
    vox(d,t+.32,{f0:rnd(150,200),dur:.62,vol:.31*v, pitch:[[.15,.92],[1,.55]],
      am:rnd(24,34), noise:.18, noiseF:1100,
      form:[[rnd(480,640),3,1],[rnd(1200,1500),5,.55],[2400,8,.22]]});
  },
  bellow(d,v){ const t=AC.currentTime;                // bull
    vox(d,t,{f0:rnd(92,132),dur:rnd(.85,1.20),vol:.34*v, glide:.72,
      pitch:[[.10,1.16],[.5,1.02],[1,.72]], vib:[rnd(6,10),rnd(6,14)],
      am:rnd(11,17), noise:.13, noiseF:520,
      form:[[rnd(330,430),2.6,1],[rnd(760,940),4,.5],[1700,7,.2]]});
    nz(d,t+.05,.5,'lowpass',260,0,.10*v,.7);
  },
  squeal(d,v){ vox(d,AC.currentTime,{f0:rnd(620,1000),dur:rnd(.26,.40),vol:.25*v,
    wave:'square', pitch:[[.08,1.7],[.45,1.25],[1,.62]], vib:[rnd(26,40),rnd(70,150)],
    noise:.14, noiseF:3400, form:[[rnd(1250,1650),3.5,1],[rnd(2800,3400),5,.55]]}); },
  orgle(d,v){ vox(d,AC.currentTime,{f0:rnd(175,245),dur:rnd(.50,.72),vol:.22*v,
    pitch:[[.3,1.08],[1,.86]], am:rnd(13,20), noise:.05, noiseF:1400,
    form:[[rnd(520,660),4,1],[rnd(1150,1450),6,.45],[2600,9,.18]]}); },
  yowl(d,v){ vox(d,AC.currentTime,{f0:rnd(420,640),dur:rnd(.42,.60),vol:.24*v,
    pitch:[[.18,1.5],[.55,1.28],[1,.62]], vib:[rnd(11,18),rnd(30,65)],
    noise:.09, noiseF:2800, form:[[rnd(960,1240),4,1],[rnd(2100,2650),6,.6],[3800,9,.25]]}); },
  honk(d,v){ const t=AC.currentTime, n=1+((Math.random()*2)|0);
    for(let i=0;i<n;i++) vox(d,t+i*rnd(.18,.26),{f0:rnd(330,470),dur:.19,vol:.27*v,
      wave:'sawtooth', pitch:[[.15,1.3],[1,.74]], noise:.12, noiseF:2600,
      form:[[rnd(760,980),3,1],[rnd(1900,2350),5,.8],[3300,8,.35]]});   // nasal 2nd formant
  },
  gobble(d,v){ const t=AC.currentTime;
    vox(d,t,{f0:rnd(270,360),dur:rnd(.38,.55),vol:.25*v,
      pitch:[[.2,1.25],[.6,1.05],[1,.8]], am:rnd(19,27),      // the wattle rattle
      noise:.12, noiseF:2500, form:[[rnd(900,1150),4,1],[rnd(2000,2500),6,.6],[3600,9,.28]]});
  },
  howl(d,v){ const t=AC.currentTime;                  // coyote
    vox(d,t,{f0:rnd(380,520),dur:rnd(1.0,1.5),vol:.28*v, glide:1.25,
      pitch:[[.12,1.55],[.35,1.72],[.75,1.62],[1,1.05]], vib:[rnd(5,9),rnd(14,30)],
      noise:.06, noiseF:3000, form:[[rnd(900,1150),3,1],[rnd(2000,2500),5,.55],[3800,8,.2]]});
    if(Math.random()<.5) for(let i=0;i<3;i++)
      vox(d,t+rnd(1.5,1.8)+i*.13,{f0:rnd(500,700),dur:.09,vol:.19*v,
        pitch:[[.3,1.4],[1,.6]], noise:.10, form:[[1200,5,1],[2600,7,.5]]});
  },
  foxscream(d,v){ vox(d,AC.currentTime,{f0:rnd(680,980),dur:rnd(.40,.58),vol:.27*v,
    wave:'square', pitch:[[.06,1.5],[.3,1.22],[1,.55]], vib:[rnd(14,24),rnd(45,95)],
    noise:.26, noiseF:3600, form:[[rnd(1300,1700),3,1],[rnd(2900,3500),5,.6]]}); },
  roar(d,v){ const t=AC.currentTime;                  // bear: the big one
    vox(d,t,{f0:rnd(68,104),dur:rnd(1.0,1.45),vol:.38*v, glide:.68,
      pitch:[[.08,1.22],[.45,1.05],[1,.66]], am:rnd(17,26), vib:[rnd(4,8),rnd(4,10)],
      noise:.20, noiseF:420,
      form:[[rnd(260,350),2.2,1],[rnd(640,820),3.5,.6],[1400,6,.26],[2600,9,.1]]});
    nz(d,t,.7,'lowpass',rnd(200,300),0,.16*v,.6);
    const sub=AC.createOscillator(); sub.type='sine';
    sub.frequency.setValueAtTime(rnd(52,68),t);
    sub.frequency.exponentialRampToValueAtTime(rnd(34,44),t+1.0);
    sub.connect(env(d,t,.05,1.0,.22*v)); sub.start(t); sub.stop(t+1.2);
  },
  huff(d,v){ const t=AC.currentTime;                  // bear, close up and unhappy
    for(let i=0;i<2+((Math.random()*2)|0);i++)
      nz(d,t+i*rnd(.13,.19),.09,'lowpass',rnd(380,620),0,.20*v,rnd(.5,.8));
  },
  screech(d,v){ const t=AC.currentTime;              // raptor
    vox(d,t,{f0:rnd(1100,1650),dur:rnd(.45,.65),vol:.26*v, wave:'sawtooth',
      glide:.62, pitch:[[.05,1.35],[.3,1.1],[1,.5]], vib:[rnd(30,48),rnd(80,170)],
      noise:.30, noiseF:4600, form:[[rnd(2100,2700),3,1],[rnd(4200,5000),5,.5]]});
    nz(d,t,.28,'highpass',3800,0,.10*v,1);
  },
  peep(d,v){ vox(d,AC.currentTime,{f0:rnd(900,1400),dur:.09,vol:.17*v,
    pitch:[[.3,1.3],[1,.72]], noise:.06, form:[[2100,6,1],[3800,8,.4]]}); },
  chitter(d,v){ vox(d,AC.currentTime,{f0:rnd(205,325),dur:rnd(.22,.42),vol:.19*v,
    pitch:[[.5,1.25],[1,.85]], am:rnd(36,58), noise:.08, noiseF:2200,
    form:[[rnd(790,1060),4,1],[rnd(1850,2450),6,.5]]}); },
  growl(d,v){ vox(d,AC.currentTime,{f0:rnd(82,132),dur:rnd(.34,.56),vol:.26*v,
    pitch:[[1,.85]], am:rnd(21,34), noise:.05, noiseF:600,
    form:[[380,3,1],[820,5,.45],[1500,7,.2]]}); },
  hiss(d,v){ nz(d,AC.currentTime,rnd(.17,.30),'highpass',rnd(3100,4700),0,.17*v,1); },
  coondeath(d,v){ const t=AC.currentTime;
    vox(d,t,{f0:rnd(600,990),dur:.34,vol:.25*v,wave:'square', noise:.20, noiseF:2600,
      pitch:[[.07,1.9],[.35,1.2],[1,.35]], vib:[28,80], form:[[1000,3,1],[2400,5,.6]]});
    VOX.thud(d,v,t+.02);
    if(Math.random()<.4) VOX.hiss(d,v*.6);
  },
  spur(d,v){ const t=AC.currentTime;
    const o=AC.createOscillator(); o.type='triangle';
    o.frequency.setValueAtTime(rnd(1900,2500),t);
    o.frequency.exponentialRampToValueAtTime(680,t+.12);
    o.connect(env(d,t,.002,.14,.19*v)); o.start(t); o.stop(t+.2);
    nz(d,t,.05,'highpass',5200,0,.13*v,1);
    VOX.squawk(d,v*.95);
  },
  crow(d,v){ const t=AC.currentTime, f=rnd(325,405);   // er-er-er-ERRRRR
    vox(d,t,    {f0:f*1.15,dur:.20,vol:.26*v,pitch:[[.3,1.10],[1,.90]],noise:.07,
      form:[[1050,5,1],[2400,7,.6],[3600,9,.3]]});
    vox(d,t+.26,{f0:f*1.35,dur:.16,vol:.26*v,pitch:[[.3,1.15],[1,.95]],noise:.07,
      form:[[1150,5,1],[2600,7,.6]]});
    vox(d,t+.46,{f0:f*1.55,dur:.28,vol:.29*v,pitch:[[.15,1.25],[1,1.0]],noise:.09,
      form:[[1250,4,1],[2800,6,.65],[4000,9,.3]]});
    vox(d,t+.80,{f0:f*1.25,dur:.85,vol:.29*v,glide:.7,noise:.10,
      pitch:[[.08,1.5],[.35,1.35],[.75,1.1],[1,.55]], vib:[15,28],
      form:[[1180,3.5,1],[2700,5,.7],[4200,8,.35]]});
  },
  owl(d,v){ const t=AC.currentTime, f=rnd(285,340);
    [0,.42].forEach((at,i)=>vox(d,t+at,{f0:f,dur:.30,vol:.16*v,wave:'triangle',
      pitch:[[.25,1.06],[1,.93]], noise:.02, noiseF:700, form:[[f*2.1,9,1],[f*3.4,12,.3]]}));
  },
  chirp(d,v){ const t=AC.currentTime;
    for(let i=0,n=2+((Math.random()*3)|0);i<n;i++){
      const o=AC.createOscillator(); o.type='sine';
      const at=t+i*rnd(.06,.11), f=rnd(2900,4300);
      o.frequency.setValueAtTime(f,at); o.frequency.exponentialRampToValueAtTime(f*rnd(1.2,1.7),at+.05);
      o.connect(env(d,at,.006,.06,.075*v)); o.start(at); o.stop(at+.14);
    }
  }
};

/* ---------- positional dispatch ---------- */
/* mode: undefined = an ordinary blow, thinned out with distance
        'soft'  = background murmur, quiet, unlimited
        'cry'   = a creature using its voice — own budget, never thinned
        'key'   = something that must be heard (a death), never thinned */
function sfx(kind,x,z,mode){
  if(mode===true) mode='soft';
  if(!soundOn||!AC||!VOX[kind]) return;
  const always=(mode==='soft'||mode==='cry'||mode==='key');
  let v=1, pan=0, bright=15000;
  if(x!==undefined){
    _ap.set(x,0.55,z);
    const dist=_ap.distanceTo(camera.position);
    const near=clamp(1-dist/62,0,1);
    if(near<=0.03) return;
    _ap2.copy(_ap).project(camera);
    if(_ap2.z>1) return;                       // behind the lens
    // the close fight is the one you hear; distant scuffles thin out
    if(!always && Math.random()>near*0.9+0.05) return;
    /* An always-play sound still costs a token, so a death 60 metres away
       would spend budget on something inaudible and starve the one happening
       in front of the lens. Cries and deaths have to clear a hearing floor. */
    if(mode!=='soft' && always && near<0.24) return;
    v=near*near; pan=clamp(_ap2.x*0.9,-1,1); bright=lerp(850,15000,near);
  }
  if(mode==='soft') v*=0.42;
  else if(mode==='cry'){ if(voxTokens<1) return; voxTokens--; }
  else { if(sfxTokens<1) return; sfxTokens--; }
  const bus=outBus(pan);
  const tn=AC.createBiquadFilter(); tn.type='lowpass'; tn.frequency.value=bright;
  tn.connect(bus);
  VOX[kind](tn,v);
}

/* ---------- non-positional stings ---------- */
function sting(kind){
  if(!soundOn||!AC) return;
  const t=AC.currentTime, d=outBus(0);
  const note=(freq,at,dur,type,vol)=>{
    const o=AC.createOscillator(); o.type=type||'triangle';
    o.frequency.setValueAtTime(freq,t+at);
    o.connect(env(d,t+at,.02,dur,vol||.22)); o.start(t+at); o.stop(t+at+dur+.06);
  };
  if(kind==='beep') note(660,0,.14,'triangle',.18);
  if(kind==='go'){
    [104,156,208].forEach((f,i)=>{
      const o=AC.createOscillator(); o.type='sawtooth'; o.frequency.value=f*(1+i*.002);
      const fl=AC.createBiquadFilter(); fl.type='lowpass';
      fl.frequency.setValueAtTime(300,t); fl.frequency.linearRampToValueAtTime(2600,t+.25);
      const g=AC.createGain();
      g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.14,t+.04);
      g.gain.setValueAtTime(.14,t+.45); g.gain.exponentialRampToValueAtTime(.0001,t+.9);
      o.connect(fl); fl.connect(g); g.connect(d); o.start(t); o.stop(t+.95);
    });
    setTimeout(()=>{ const b=outBus(rnd(-.4,.4)); VOX.crow(b,1.0); },260);
  }
  if(kind==='win'){
    [523,659,784,1046].forEach((f,i)=>note(f,i*.11,.5,'triangle',.19));
    setTimeout(()=>{ VOX.crow(outBus(-.3),1.0); },140);
    setTimeout(()=>{ VOX.crow(outBus(.42),.75); },720);
  }
  if(kind==='lose'){
    [415,392,311,261].forEach((f,i)=>note(f,i*.15,.6,'sawtooth',.13));
    for(let i=0;i<5;i++) setTimeout(()=>VOX.chitter(outBus(rnd(-.8,.8)),rnd(.5,.95)),i*160+90);
    setTimeout(()=>VOX.growl(outBus(0),1.0),380);
  }
  if(kind==='slow'){
    const s=AC.createBufferSource(); s.buffer=noiseBuf;
    s.playbackRate.setValueAtTime(1.6,t); s.playbackRate.exponentialRampToValueAtTime(.25,t+.7);
    const f=AC.createBiquadFilter(); f.type='bandpass'; f.Q.value=2.5;
    f.frequency.setValueAtTime(2200,t); f.frequency.exponentialRampToValueAtTime(160,t+.7);
    s.connect(f); f.connect(env(d,t,.06,.75,.24)); s.start(t); s.stop(t+.85);
  }
}

/* ---------- per-frame mix + the background barnyard ---------- */
function audioUpdate(dt){
  if(!AC) return;
  musicUpdate(dt);
  recentKills*=Math.exp(-dt*1.6);
  sfxTokens=Math.min(9,sfxTokens+dt*20);
  voxTokens=Math.min(6,voxTokens+dt*7);
  master.gain.setTargetAtTime(soundOn?0.85:0.0001, AC.currentTime, 0.25);
  if(!soundOn) return;

  const heat=clamp(recentKills/22,0,1);
  amb.roar.gain.gain.setTargetAtTime(heat*0.075, AC.currentTime, 0.25);
  amb.crickOut.gain.setTargetAtTime(NIGHT?0.05*(1-heat*0.7):0, AC.currentTime, 0.6);
  amb.wind.filter.frequency.setTargetAtTime(NIGHT?260:430, AC.currentTime, 0.6);
  mFilter.frequency.setTargetAtTime(BATTLE.slowT>0?620:18000, AC.currentTime, 0.08);
  revSend.gain.setTargetAtTime(NIGHT?0.30:0.09, AC.currentTime, 0.8);

  /* a crowd only sounds like a crowd if individuals keep piping up */
  murmurT-=dt;
  if(murmurT<=0 && N>0){
    murmurT=rnd(.10,.55)/(0.35+heat*2.6);
    const i=(Math.random()*N)|0;
    if(A.st[i]!==2){
      const bird=A.team[i]===0;
      const k=bird ? (A.st[i]===1 ? (Math.random()<.45?'cackle':'squawk') : (Math.random()<.82?'buk':'squawk'))
                   : (Math.random()<.55?'chitter':(Math.random()<.6?'growl':'hiss'));
      sfx(k,A.x[i],A.z[i],true);
    }
  }
  /* Battle cries. Every so often pick a living combatant and let whatever it
     is speak up — this is what makes a field of dogs and bears feel occupied
     rather than like one crowd loop. Rarer, bigger animals get heard more
     because there are fewer of them to notice. */
  cryT-=dt;
  if(cryT<=0 && N>0 && BATTLE.running && !BATTLE.over){
    cryT=rnd(.22,.55);
    for(let a=0;a<4;a++){
      const i=(Math.random()*N)|0;
      if(A.st[i]===2) continue;
      const u=UNITS[A.kind[i]];
      if(!u.cry) continue;
      if(Math.random()<u.cry[1]){ sfx(u.cry[0],A.x[i],A.z[i],'cry'); break; }
    }
  }

  /* and the world keeps making noise around it */
  farT-=dt;
  if(farT<=0){
    farT=rnd(3.5,9);
    const a=Math.random()*TAU, r=ARENA_R*rnd(1.1,1.7);
    if(NIGHT){ if(Math.random()<.55) sfx('owl',Math.cos(a)*r,Math.sin(a)*r,true); }
    else sfx('chirp',Math.cos(a)*r,Math.sin(a)*r,true);
  }
}


/* ============================================================
   MUSIC — a procedural trailer score. No files, no loops on disk:
   a 16th-note scheduler runs on its own timer (decoupled from the
   frame rate) and builds the arrangement out of the same oscillators
   everything else uses. Layers gate in as the body count climbs.
   ============================================================ */
const MUS={on:true,bpm:126,step:0,next:0,mode:'idle',intensity:0,target:0,bus:null,g:{},timer:null};
const mtof=n=>440*Math.pow(2,(n-69)/12);

/* D minor: i – VI – III – VII, two bars each */
const CHORDS=[
  {bass:38, pad:[57,62,65], stab:[38,50,57], lead:[62,65,69]},   // Dm
  {bass:34, pad:[53,58,62], stab:[34,46,53], lead:[58,62,65]},   // Bb
  {bass:41, pad:[57,60,65], stab:[41,53,60], lead:[60,65,69]},   // F
  {bass:36, pad:[55,60,64], stab:[36,48,55], lead:[60,64,67]}    // C
];
/* the hook, in 16ths: null = rest */
const MOTIF=[0,null,null,2,null,1,null,null,0,null,2,null,1,null,0,null];
/* The menu air, in quarter notes. Slower and more stepwise than the battle
   hook because it has to bear repeating while someone fiddles with sliders.
   3 means the root an octave up. */
const MENU_AIR=[0,null,1,2,null,1,null,null, 3,null,2,1,null,0,null,null];

function musicInit(){
  MUS.bus=AC.createGain(); MUS.bus.gain.value=0.0001;
  MUS.bus.connect(master);
  ['drum','bass','brass','pad','lead'].forEach(k=>{
    const g=AC.createGain(); g.gain.value=k==='drum'?1:0.0001;
    g.connect(MUS.bus); MUS.g[k]=g;
  });
  MUS.g.pad.connect(revSend);
  MUS.g.brass.connect(revSend);
  // an independent clock: music must not stutter when the renderer hitches
  MUS.timer=setInterval(musicTick,45);
}

/* ---------- instruments ---------- */
function taiko(t,v,mid){
  const f=mtof(mid||45);
  const o=AC.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(f*2.6,t);
  o.frequency.exponentialRampToValueAtTime(f*0.72,t+.1);
  const g=AC.createGain();
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v,t+.006);
  g.gain.exponentialRampToValueAtTime(.0001,t+.46);
  o.connect(g); g.connect(MUS.g.drum); o.start(t); o.stop(t+.5);
  const n=AC.createBufferSource(); n.buffer=noiseBuf; n.playbackRate.value=.55;
  const nf=AC.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value=800;
  const ng=AC.createGain(); ng.gain.setValueAtTime(v*.55,t);
  ng.gain.exponentialRampToValueAtTime(.0001,t+.08);
  n.connect(nf); nf.connect(ng); ng.connect(MUS.g.drum); n.start(t); n.stop(t+.11);
}
function anvil(t,v){
  const n=AC.createBufferSource(); n.buffer=noiseBuf; n.playbackRate.value=.9+Math.random()*.25;
  const f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1750; f.Q.value=.8;
  const g=AC.createGain(); g.gain.setValueAtTime(v,t);
  g.gain.exponentialRampToValueAtTime(.0001,t+.2);
  n.connect(f); f.connect(g); g.connect(MUS.g.drum); n.start(t); n.stop(t+.24);
  const o=AC.createOscillator(); o.type='triangle';
  o.frequency.setValueAtTime(430,t); o.frequency.exponentialRampToValueAtTime(180,t+.14);
  const g2=AC.createGain(); g2.gain.setValueAtTime(v*.35,t);
  g2.gain.exponentialRampToValueAtTime(.0001,t+.16);
  o.connect(g2); g2.connect(MUS.g.drum); o.start(t); o.stop(t+.2);
}
function shake(t,v){
  const n=AC.createBufferSource(); n.buffer=noiseBuf; n.playbackRate.value=1.4+Math.random()*.5;
  const f=AC.createBiquadFilter(); f.type='highpass'; f.frequency.value=6200;
  const g=AC.createGain(); g.gain.setValueAtTime(v,t);
  g.gain.exponentialRampToValueAtTime(.0001,t+.05);
  n.connect(f); f.connect(g); g.connect(MUS.g.drum); n.start(t); n.stop(t+.07);
}
function bassNote(t,mid,dur,v){
  const f=AC.createBiquadFilter(); f.type='lowpass'; f.Q.value=5;
  f.frequency.setValueAtTime(1500,t);
  f.frequency.exponentialRampToValueAtTime(300,t+dur*.9);
  const g=AC.createGain();
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v,t+.008);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  f.connect(g); g.connect(MUS.g.bass);
  [['sawtooth',1],['square',.4995]].forEach(([w,m])=>{
    const o=AC.createOscillator(); o.type=w; o.frequency.value=mtof(mid)*m*(1+(Math.random()-.5)*.002);
    o.connect(f); o.start(t); o.stop(t+dur+.06);
  });
}
function brassStab(t,mids,dur,v){
  mids.forEach(m=>{
    for(let d=0;d<2;d++){
      const o=AC.createOscillator(); o.type='sawtooth';
      o.frequency.value=mtof(m)*(d?1.007:.993);
      const f=AC.createBiquadFilter(); f.type='lowpass'; f.Q.value=1.4;
      f.frequency.setValueAtTime(500,t);
      f.frequency.linearRampToValueAtTime(3400,t+.055);
      f.frequency.exponentialRampToValueAtTime(800,t+dur);
      const g=AC.createGain();
      g.gain.setValueAtTime(.0001,t);
      g.gain.exponentialRampToValueAtTime(v/mids.length,t+.028);
      g.gain.exponentialRampToValueAtTime(.0001,t+dur);
      o.connect(f); f.connect(g); g.connect(MUS.g.brass); o.start(t); o.stop(t+dur+.06);
    }
  });
}
/* choir-ish pad: sawtooth through vowel formants, slightly detuned per voice */
function padChord(t,mids,dur,v){
  mids.forEach(m=>{
    const o=AC.createOscillator(); o.type='sawtooth';
    o.frequency.value=mtof(m)*(1+(Math.random()-.5)*.004);
    const lfo=AC.createOscillator(); lfo.frequency.value=4.2+Math.random()*1.6;
    const lg=AC.createGain(); lg.gain.value=1.6+Math.random()*2.4;
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t+dur+.15);
    const sum=AC.createGain();
    [[720,7,1],[1150,9,.55],[2650,11,.28]].forEach(fm=>{
      const bp=AC.createBiquadFilter(); bp.type='bandpass';
      bp.frequency.value=fm[0]; bp.Q.value=fm[1];
      const ag=AC.createGain(); ag.gain.value=fm[2];
      o.connect(bp); bp.connect(ag); ag.connect(sum);
    });
    const g=AC.createGain();
    g.gain.setValueAtTime(.0001,t);
    g.gain.linearRampToValueAtTime(v/mids.length,t+dur*.3);
    g.gain.setValueAtTime(v/mids.length,t+dur*.68);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    sum.connect(g); g.connect(MUS.g.pad); o.start(t); o.stop(t+dur+.18);
  });
}
function leadNote(t,mid,dur,v){
  const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=3600; f.Q.value=2.2;
  const g=AC.createGain();
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v,t+.014);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  f.connect(g); g.connect(MUS.g.lead);
  [['square',1],['sawtooth',1.005]].forEach(([w,m])=>{
    const o=AC.createOscillator(); o.type=w; o.frequency.value=mtof(mid)*m;
    o.connect(f); o.start(t); o.stop(t+dur+.06);
  });
}
function braam(t,mid,dur,v){
  for(let i=0;i<5;i++){
    const o=AC.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(mtof(mid)*(1+(i-2)*.006)*1.02,t);
    o.frequency.exponentialRampToValueAtTime(mtof(mid)*(1+(i-2)*.006),t+.35);
    const f=AC.createBiquadFilter(); f.type='lowpass';
    f.frequency.setValueAtTime(340,t);
    f.frequency.linearRampToValueAtTime(2100,t+.22);
    f.frequency.exponentialRampToValueAtTime(420,t+dur);
    const g=AC.createGain();
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v/5,t+.05);
    g.gain.setValueAtTime(v/5,t+dur*.55);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(f); f.connect(g); g.connect(MUS.g.brass); o.start(t); o.stop(t+dur+.1);
  }
  taiko(t,.9,33);
}
function riser(t,dur){
  const n=AC.createBufferSource(); n.buffer=noiseBuf; n.loop=true;
  const f=AC.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.6;
  f.frequency.setValueAtTime(240,t);
  f.frequency.exponentialRampToValueAtTime(7200,t+dur);
  const g=AC.createGain();
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.22,t+dur*.92);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur+.14);
  n.connect(f); f.connect(g); g.connect(MUS.g.drum); n.start(t); n.stop(t+dur+.2);
  const o=AC.createOscillator(); o.type='sawtooth';
  o.frequency.setValueAtTime(mtof(38),t);
  o.frequency.exponentialRampToValueAtTime(mtof(62),t+dur);
  const lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2400;
  const g2=AC.createGain();
  g2.gain.setValueAtTime(.0001,t); g2.gain.exponentialRampToValueAtTime(.13,t+dur*.9);
  g2.gain.exponentialRampToValueAtTime(.0001,t+dur+.1);
  o.connect(lp); lp.connect(g2); g2.connect(MUS.g.brass); o.start(t); o.stop(t+dur+.15);
  // accelerating drum roll into the downbeat.
  // the gap MUST have a floor: with a pure geometric decay the total time
  // converges (0.30/(1-0.88) = 2.5s) and any dur above that loops forever.
  let at=0, gap=.30, guard=0;
  while(at<dur && guard++<128){ taiko(t+at,.34+at/dur*.5,45); at+=gap; gap=Math.max(gap*0.88,0.055); }
}

/* ---------- the arrangement ---------- */
function schedStep(s,t){
  const st=s%16, chord=CHORDS[(s/32|0)%4], I=MUS.intensity;

  /* The setup screen used to be silent, which made the game feel like it
     hadn't started yet. A pipe air over a drone: the drone never stops, which
     is the whole character of the idiom, and the melody wanders above it. */
  if(MUS.mode==='menu'){
    if(s%32===0){
      padChord(t,chord.pad,(60/MUS.bpm)*9,.20);
      bassNote(t,chord.bass-12,(60/MUS.bpm)*8.5,.34);
    }
    if(st===0) taiko(t,.26,54);            // bodhran, felt more than heard
    if(st===10) taiko(t,.13,60);
    if(s%4===0){
      const n=MENU_AIR[(s/4|0)%16];
      if(n!==null&&n!==undefined)
        leadNote(t, n>=3?chord.lead[0]+12:chord.lead[n], (60/MUS.bpm)*.88, .24);
    }
    return;
  }
  if(MUS.mode==='tension'){
    if(st===0) taiko(t,.42+I*.2,45);
    if(st===7) taiko(t,.2,45);
    if(s%32===0) padChord(t,chord.pad,(60/MUS.bpm)*8,.16);
    if(s%32===0) bassNote(t,chord.bass-12,(60/MUS.bpm)*7,.14);
    return;
  }
  if(MUS.mode!=='battle') return;

  /* drums — the spine, always present */
  if(st===0){ taiko(t,.95,38); anvil(t,.28); }
  else if(st===3||st===6||st===11) taiko(t,.5,45);
  else if(st===8){ taiko(t,.8,38); }
  else if(st===14) taiko(t,.44,45);
  if(st===4||st===12) anvil(t,.30+I*.16);
  if(I>.72 && st%2===1) shake(t,.055+I*.05);
  if(I>.5 && (st===15) && Math.random()<.5) { taiko(t,.3,50); }

  /* bass — straight eighths under everything */
  if(st%2===0) bassNote(t,chord.bass,(60/MUS.bpm)/2*.92,.5);

  /* brass — syncopated stabs */
  if(st===0||st===6||st===10) brassStab(t,chord.stab,(60/MUS.bpm)*(st===0?1.1:.55),.42);

  /* choir pad — one long chord every two bars */
  if(s%32===0) padChord(t,chord.pad,(60/MUS.bpm)*8,.30);

  /* the hook */
  const note=MOTIF[st];
  if(note!==null && note!==undefined) leadNote(t,chord.lead[note],(60/MUS.bpm)*.42,.30);
}

function musicTick(){
  if(!AC||MUS.mode==='idle') return;
  const sp16=(60/MUS.bpm)/4, look=AC.currentTime+0.45;
  if(MUS.next<AC.currentTime) MUS.next=AC.currentTime+.06;
  let guard=0;
  while(MUS.next<look && guard++<64){
    schedStep(MUS.step,MUS.next);
    MUS.step=(MUS.step+1)%128;
    MUS.next+=sp16;
  }
}

function musicMode(m){
  /* Remember the mode even before there's an audio context. standby() runs at
     boot, long before the first gesture unlocks audio — bailing out here left
     the menu silent for the whole visit, because nothing called it again. */
  const fresh=MUS.mode!==m;
  MUS.mode=m;
  if(!AC) return;
  if(fresh&&(m==='battle'||m==='tension'||m==='menu')){
    MUS.step=0; MUS.next=AC.currentTime+.04;
  }
}
function musicCountIn(sec){
  if(!AC) return;
  musicMode('tension');
  riser(AC.currentTime+.05,sec);
}
function musicFinish(won){
  if(!AC) return;
  const t=AC.currentTime+.05, beat=60/MUS.bpm;
  musicMode('idle');
  if(won){
    braam(t,38,1.5,.5);
    /* picardy third — the flock earns a major chord */
    [[0,[50,54,57]],[beat*1.5,[52,55,59]],[beat*3,[50,57,62,66]]].forEach(([at,ch])=>{
      brassStab(t+at,ch,beat*2.2,.44); taiko(t+at,.8,38);
    });
    padChord(t,[62,66,69],beat*8,.30);
  }else{
    braam(t,31,2.2,.55);
    [[0,[38,41,45]],[beat*2,[36,39,43]],[beat*4,[33,36,40]]].forEach(([at,ch])=>{
      brassStab(t+at,ch,beat*2.6,.34); taiko(t+at,.6,33);
    });
    padChord(t,[53,56,60],beat*9,.26);
  }
}

function musicUpdate(dt){
  if(!AC||!MUS.bus) return;
  const live=soundOn&&MUS.on;
  if(MUS.mode==='battle'){
    const progA=1-clamp(aliveA/Math.max(1,initA),0,1);
    const progB=1-clamp(aliveB/Math.max(1,initB),0,1);
    const prog=Math.max(progA,progB);
    const heat=clamp(recentKills/22,0,1);
    MUS.target=clamp(.28+prog*.46+heat*.40,0,1);
  }else if(MUS.mode==='tension') MUS.target=.18;
  /* high enough to open the lead voice — the menu schedules no brass, so
     that channel being open costs nothing */
  else if(MUS.mode==='menu') MUS.target=.58;
  else MUS.target=0;
  MUS.intensity+=(MUS.target-MUS.intensity)*Math.min(1,dt*1.1);
  MUS.bpm=MUS.mode==='menu'?96:124+MUS.intensity*24;   // the air wants room

  const I=MUS.intensity, T=AC.currentTime, k=.5;
  const set=(g,v)=>g.gain.setTargetAtTime(Math.max(.0001,v),T,k);
  set(MUS.g.bass ,clamp((I-.04)/.18,0,1));
  set(MUS.g.brass,clamp((I-.26)/.26,0,1)*.95);
  set(MUS.g.pad  ,clamp((I-.08)/.30,0,1));
  set(MUS.g.lead ,clamp((I-.52)/.26,0,1));
  MUS.bus.gain.setTargetAtTime(live?0.34+I*0.16:0.0001,T,.35);
}

/* ============================================================
   AGENT RENDER
   ============================================================ */
const _mL=new THREE.Matrix4(), _mF=new THREE.Matrix4();
function renderAgents(){
  if(!SQUADS.length) return;
  for(let q=0;q<SQUADS.length;q++) if(SQUADS[q]) SQUADS[q].begin();
  let sN=0;

  for(let i=0;i<N;i++){
    const ki=A.kind[i], sq=SQUADS[ki];
    if(!sq) continue;
    const u=UNITS[ki], kit=KIT_PIV[ki][A.vr[i]];
    const st=A.st[i], bird=u.build==='bird';
    let y=A.fy[i]||0, roll=0, pitch=0, amp, fr;

    /* thrown: ignore the gait and the corpse pose entirely and just cartwheel.
       A dead bird keeps its arc — dying mid-flight shouldn't stop it. */
    if(!u.fly && A.fy[i]>0.02){
      pitch=A.tum[i]; roll=A.tum[i]*0.63;
      amp=bird?0.95:0.35; fr=15;
      const yaw2=A.yaw[i]+A.tum[i]*0.25;
      _e.set(pitch,yaw2,roll,'YXZ'); _q.setFromEuler(_e);
      _v.set(A.x[i],y,A.z[i]); _s.set(1,1,1);
      _m.compose(_v,_q,_s);
      const ang2=Math.sin(A.ph[i]*fr)*amp;
      const c2=Math.cos(ang2), s3=Math.sin(ang2), py2=kit.y, pz2=kit.z;
      _mL.set(1,0,0,0,
              0,c2,-s3, py2-c2*py2+s3*pz2,
              0,s3, c2, pz2-s3*py2-c2*pz2,
              0,0,0,1);
      _mF.multiplyMatrices(_m,_mL);
      sq.push(A.vr[i],_m,_mF);
      continue;                       // no blob shadow while it's off the ground
    }

    if(st===2){
      const d=A.dead[i];
      if(d>30) continue;
      if(A.rev[i]===2){                       // playing dead: flat on its side, no sinking
        roll=1.5; y=-0.05;
      }else{
        roll=Math.min(1,d/0.32)*1.5;
        y+=-clamp((d-26)/3.5,0,1)*1.4;
        if(u.fly) y=Math.max(0,(u.fly)*(1-Math.min(1,d/0.6)));
        if(y<-1.3) continue;
        y+=Math.min(1,d/0.32)*(bird?-0.06:-0.03);
      }
      amp=0; fr=0;
    }else{
      const sp=Math.hypot(A.vx[i],A.vz[i]);
      y+=Math.abs(Math.sin(A.ph[i]))*(bird?0.05:0.035)*(0.35+sp*0.2);
      pitch=-clamp(sp*0.045,0,0.26)+Math.sin(A.ph[i]*2)*(bird?0.028:0.02);
      if(A.hit[i]>0){ roll=Math.sin(A.hit[i]*70)*0.28; pitch+=0.12; }
      amp=st===1?(bird?0.62:0.40):(bird?0.24:0.16); fr=st===1?11:5.2;
    }

    const yaw=A.yaw[i]+(st===1?Math.sin(A.ph[i]*3.1)*0.28:0);
    _e.set(pitch,yaw,roll,'YXZ'); _q.setFromEuler(_e);
    _v.set(A.x[i],y,A.z[i]); _s.set(1,1,1);
    _m.compose(_v,_q,_s);

    const ang=amp?Math.sin(A.ph[i]*fr)*amp:(st===2?0.35:0);
    const c=Math.cos(ang), s2=Math.sin(ang), py=kit.y, pz=kit.z;
    _mL.set(1,0,0,0,
            0,c,-s2, py-c*py+s2*pz,
            0,s2, c, pz-s2*py-c*pz,
            0,0,0,1);
    _mF.multiplyMatrices(_m,_mL);
    sq.push(A.vr[i],_m,_mF);

    if(sN<6000){
      const sc=u.rad*(bird?0.46:0.55)*(st===2?0.8:1)*(A.fy[i]>0.4?0.6:1);
      _v.set(A.x[i],0.024,A.z[i]); _q.identity(); _s.set(sc,1,sc*1.2);
      _m2.compose(_v,_q,_s);
      shadowIM.setMatrixAt(sN++,_m2);
    }
  }
  for(let q=0;q<SQUADS.length;q++) if(SQUADS[q]) SQUADS[q].end();
  shadowIM.count=sN; shadowIM.instanceMatrix.needsUpdate=true;
}

/* ============================================================
   CAMERA DIRECTOR
   ============================================================ */
const DIR={shot:'wide',t:0,dur:5,ang:0,seed:0,manual:false,snap:false,
  orbA:0.9,orbH:0.55,orbD:1.0,drag:false,px:0,py:0};
const camPos=new THREE.Vector3(0,30,60), camAim=new THREE.Vector3(0,0,0);

function pickShot(){
  const r=Math.random();
  const hasChamp=BATTLE.champ>=0&&A.st[BATTLE.champ]!==2;
  let s;
  if(r<0.24) s='wide';
  else if(r<0.46) s='clash';
  else if(r<0.66) s='low';
  else if(r<0.82) s=hasChamp?'champ':'clash';
  else if(r<0.92) s='top';
  else s='sweep';
  DIR.shot=s; DIR.t=0; DIR.dur=s==='wide'?rnd(5,7):rnd(3.2,5.2);
  DIR.ang=Math.random()*TAU; DIR.seed=Math.random()*100;
}

function director(dt,real,wall){
  const reel=document.body.classList.contains('reel');
  const R=ARENA_R;
  const zoom=reel?1.62:1.0;
  let tx,ty,tz,ax,ay,az,fov=46;

  if(DIR.manual){
    const d=R*2.0*DIR.orbD;
    ax=BATTLE.cx; ay=1.5; az=BATTLE.cz;
    tx=ax+Math.cos(DIR.orbA)*d*Math.cos(DIR.orbH);
    ty=Math.max(1.2,d*Math.sin(DIR.orbH));
    tz=az+Math.sin(DIR.orbA)*d*Math.cos(DIR.orbH);
    camPos.lerp(_v.set(tx,ty,tz),1-Math.pow(0.001,real));
    camAim.lerp(_v.set(ax,ay,az),1-Math.pow(0.004,real));
    camera.position.copy(camPos); camera.lookAt(camAim);
    if(camera.fov!==46){camera.fov=46;camera.updateProjectionMatrix();}
    return;
  }

  DIR.t+=(wall||real);
  if(DIR.t>DIR.dur && SEQ.phase==='battle') pickShot();

  const t=BATTLE.t;
  /* Where to point. Once the lines meet, the contact centroid IS the fight and
     every shot aims there. Before contact, fall back to the flock's leading edge
     — the front rank closing the distance, not the middle of the crowd. */
  let fx,fz;
  if(BATTLE.conSeen && BATTLE.conAge<2.5){ fx=BATTLE.conX; fz=BATTLE.conZ; }
  else { fx=TC.afx; fz=TC.afz; }   // not joined yet — watch the front of the flock
  const kh=1-Math.pow(0.30,real);
  BATTLE.hsx=lerp(BATTLE.hsx,fx,kh);
  BATTLE.hsz=lerp(BATTLE.hsz,fz,kh);
  const hx=BATTLE.hsx, hz=BATTLE.hsz;
  /* every shot LOOKS at the fight. The wide setups only orbit from a point
     pulled back toward the middle of the field, so both armies stay in frame
     while the focal point stays on the clash. */
  const wx=lerp(BATTLE.cx,hx,0.45), wz=lerp(BATTLE.cz,hz,0.45);

  switch(DIR.shot){
    case 'wide':{
      const a=DIR.ang+t*0.09, d=R*1.24*zoom;
      tx=wx+Math.cos(a)*d; ty=R*0.50; tz=wz+Math.sin(a)*d;
      ax=hx; ay=0; az=hz; fov=44;
      break;}
    case 'top':{
      tx=hx+Math.sin(t*0.16)*R*0.35; ty=R*1.45*zoom;
      tz=hz+Math.cos(t*0.16)*R*0.35;
      ax=hx; ay=0; az=hz; fov=42;
      break;}
    case 'low':{
      const a=DIR.ang+DIR.t*0.10, d=(R*0.34+7)*zoom;
      tx=hx+Math.cos(a)*d; ty=(NIGHT?3.4:1.15)+Math.sin(DIR.t*0.6)*0.25; tz=hz+Math.sin(a)*d;
      ax=hx; ay=NIGHT?0.9:0.75; az=hz; fov=52;
      break;}
    case 'clash':{
      const a=DIR.ang+DIR.t*0.22, d=8.6*zoom;
      tx=hx+Math.cos(a)*d; ty=NIGHT?3.6:2.5; tz=hz+Math.sin(a)*d;
      ax=hx; ay=0.85; az=hz; fov=40;
      break;}
    case 'champ':{
      const c=BATTLE.champ>=0?BATTLE.champ:0;
      const yw=A.yaw[c]||0;
      const cd=5.0*zoom;
      tx=A.x[c]-Math.sin(yw)*cd; ty=(NIGHT?3.2:2.1)*(reel?1.25:1); tz=A.z[c]-Math.cos(yw)*cd;
      ax=A.x[c]+Math.sin(yw)*2.5; ay=0.85; az=A.z[c]+Math.cos(yw)*2.5; fov=44;
      break;}
    default:{ // sweep — long dolly across the front
      const p=(DIR.t/DIR.dur)*2-1;
      const a=DIR.ang;
      tx=wx+Math.cos(a)*R*0.95*zoom-Math.sin(a)*p*R*0.9;
      ty=(NIGHT?3.5:2.0)+Math.sin(DIR.t)*0.3;
      tz=wz+Math.sin(a)*R*0.95*zoom+Math.cos(a)*p*R*0.9;
      ax=hx; ay=0.9; az=hz; fov=48;   // dolly past the arena, but look at the fight
    }
  }

  /* ---------- the opening: walk the line of each army before the bell ---------- */
  if(SEQ.phase==='introA'||SEQ.phase==='introB'){
    const isA=SEQ.phase==='introA';
    /* aim at the leading edge — the birds at the front of the flock, the ones
       the viewer is about to watch walk into it — with the mass behind them */
    const cx=isA?TC.afx:TC.bfx, cz=isA?TC.afz:TC.bfz;
    const p=clamp(SEQ.t/(isA?INTRO_A:INTRO_B),0,1);
    const ang=Math.atan2(isA?TC.az:TC.bz,isA?TC.ax:TC.bx)||0;   // outward normal
    const ca=Math.cos(ang), sa=Math.sin(ang);
    // stand inside the arena facing them, track sideways along the front, push in
    const inset=R*(isA?0.46:0.34)*zoom*(1-p*0.24);
    const side =(p-0.5)*R*(isA?1.0:0.62);
    tx=cx-ca*inset-sa*side;
    tz=cz-sa*inset+ca*side;
    ty=1.30+p*0.80;
    ax=cx-sa*side*0.30; ay=0.80; az=cz+ca*side*0.30;
    fov=lerp(51,43,p);
  }else if(SEQ.phase!=='battle'&&SEQ.phase!=='result'){
    const a=-1.57+Math.sin(t*0.2)*0.25, d=R*1.15*zoom;
    tx=Math.cos(a)*d; ty=R*0.30; tz=Math.sin(a)*d;
    ax=TC.afx*0.5; ay=0.6; az=TC.afz*0.5; fov=42;
  }

  // handheld
  const n=DIR.seed+t;
  tx+=Math.sin(n*1.7)*0.16+Math.sin(n*0.53)*0.3;
  ty+=Math.cos(n*1.3)*0.12;
  tz+=Math.cos(n*1.9)*0.16+Math.cos(n*0.47)*0.3;

  if(DIR.snap){                                  // hard cut, no swooping between setups
    DIR.snap=false;
    camPos.set(tx,ty,tz); camAim.set(ax,ay,az);
    camera.fov=fov; camera.updateProjectionMatrix();
  }
  const kp=BATTLE.slowT>0?0.02:(SEQ.phase==='introA'||SEQ.phase==='introB'?0.25:0.006);
  camPos.lerp(_v.set(tx,ty,tz),1-Math.pow(kp,real));
  camAim.lerp(_v.set(ax,ay,az),1-Math.pow(0.008,real));
  camera.position.copy(camPos); camera.lookAt(camAim);
  if(Math.abs(camera.fov-fov)>0.05){ camera.fov=lerp(camera.fov,fov,1-Math.pow(0.05,real)); camera.updateProjectionMatrix(); }
}
