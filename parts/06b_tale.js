/* ============================================================
   THE DISPATCH

   A short after-action note on the result card, in the farm's voice.

   The rule that makes this work: nothing here is invented. Every line is
   assembled out of numbers the fight actually produced, which is why it can
   be funny more than twice. A joke pool would be charming on the second
   fight and irritating on the tenth, because the reader learns the pool. The
   arithmetic never repeats, so neither does the dispatch.

   It is built as candidates rather than templates. Every observation carries
   a test and a weight; we ask which ones are true of this particular fight,
   sort by how unusual they are, and print the two most interesting. That
   means the card always leads with the strangest thing that happened rather
   than the first thing on a list, and it degrades gracefully — a completely
   unremarkable fight simply falls through to the plainest lines, which is
   itself the correct tone for an unremarkable fight.

   The headline reads the margin, not just the winner. Losing by six birds
   and losing by nine hundred are not the same event and should not print the
   same words.
   ============================================================ */

/* Pick one of a set, varied per fight so a repeated matchup does not repeat
   its phrasing, and keyed off the seed so a shared link reproduces the exact
   card the sender saw.
   The modulo is written the long way on purpose: a 32-bit seed goes negative
   under |0, and JS gives a negative remainder for a negative operand, so the
   naive version indexed off the front of the list and printed undefined. */
let TALE_N=0;
function taleOne(list){
  const n=list.length;
  if(!n) return '';
  const i=(((TALE_N++ + (CFG.seed|0)) % n) + n) % n;
  return list[i];
}
function n0(x){ return Math.max(0,Math.round(x)); }
function plural(n,one,many){ return n===1?one:(many||one+'s'); }

/* ---------- the headline ---------- */
function taleHead(who,ctx){
  if(who==='birds'){
    if(ctx.survFrac<=0.01) return taleOne(['THE FLOCK HOLDS. BARELY.','WON. AT A PRICE.','THE COOP STANDS. JUST.']);
    if(ctx.survFrac>=0.85) return taleOne(['THE FLOCK HOLDS.','NEVER IN DOUBT.','A QUIET NIGHT, ALL THINGS CONSIDERED.']);
    return taleOne(['THE FLOCK HOLDS.','THE FLOCK WINS IT.','THE YARD IS OURS.']);
  }
  if(who==='coons'){
    if(ctx.coonFrac<=0.06) return taleOne(['THE COOP FALLS. NARROWLY.','LOST. ALMOST DIDN’T.','SO CLOSE.']);
    if(ctx.coonFrac>=0.80) return taleOne(['THE COOP FALLS.','A ROUT.','THAT WENT BADLY.']);
    return taleOne(['THE COOP FALLS.','THE TREELINE WINS.','THEY GOT IN.']);
  }
  return taleOne(['THE REFEREE CALLS IT.','NOBODY WON THIS.','TIME.']);
}

/* ---------- the observations ----------
   test() decides whether this is true of the fight; weight is how unusual it
   is, so the rarest true thing gets said first. */
function taleFacts(who,ctx){
  const F=[];
  /* tag groups candidates that are about the same subject. Two lines about
     the capybaras is not twice as funny, it reads as a card that repeated
     itself — so the picker takes at most one from each tag. */
  const add=(w,txt,tag)=>F.push({w,txt,tag:tag||('t'+F.length)});

  /* one bird did most of the work */
  if(ctx.champName && ctx.champKills>=8 && ctx.flockKills>0 &&
     ctx.champKills/ctx.flockKills>=0.18){
    const rest=n0(ctx.flockKills-ctx.champKills);
    add(9, ctx.champName+' accounted for '+ctx.champKills+'. The other '+
           n0(ctx.initA-1).toLocaleString()+' birds managed '+rest+' between them.','champ');
  } else if(ctx.champName && ctx.champKills>=4){
    add(4, ctx.champName+' accounted for '+ctx.champKills+' and has been insufferable since.','champ');
  } else if(who==='birds'){
    add(3, taleOne(['No bird distinguished itself. They simply outnumbered the problem.',
                    'Nobody was a hero. There were just a great many of them.']),'champ');
  }

  /* the shape of the losses */
  if(ctx.early>=ctx.initA*0.30 && ctx.early>=25){
    add(8, n0(ctx.early).toLocaleString()+' birds died in the first ten seconds.','losses');
  }
  if(ctx.firstBlood>=0 && ctx.firstBlood<1.2 && ctx.initA>=50){
    add(5, 'The first casualty was '+ctx.firstBlood.toFixed(1)+' seconds in.','losses');
  }

  /* how close it got */
  if(who==='birds' && ctx.survivors<=12 && ctx.initA>=100){
    add(9, n0(ctx.survivors)+' '+plural(ctx.survivors,'bird')+' still standing out of '+
           n0(ctx.initA).toLocaleString()+'.','margin');
  }
  if(who==='coons' && ctx.coonsLeft<=8 && ctx.initB>=20){
    add(10,'You were '+n0(ctx.coonsLeft)+' '+plural(ctx.coonsLeft,'raccoon')+' short.','margin');
  }
  if(who==='birds' && ctx.lastGasp<=ctx.initA*0.04 && ctx.lastGasp>0 && ctx.survivors>ctx.lastGasp*2){
    add(7, 'It was down to '+n0(ctx.lastGasp)+' at the worst of it.','margin');
  }

  /* the war chest */
  if(ctx.spent===0 && who==='birds' && ctx.initB>=40){
    add(7, taleOne(['You spent nothing and it worked anyway.',
                    'The war chest went untouched. Consider that a verdict on the war chest.']),'chest');
  }
  /* Anything the player chose outranks anything that merely happened. A line
     about the bull you bought is about you; a line about panic is about the
     chickens. The first is what makes the card feel like it watched you. */
  const dud=ctx.duds[0];
  if(dud){
    add(12,'The '+dud+' you called in killed nothing at all.','chest');
  }
  if(ctx.spent>=60 && who==='coons'){
    add(11,n0(ctx.spent)+' points of livestock, and this is what it bought.','chest');
  }

  /* morale */
  if(ctx.peakPanic>=ctx.initA*0.35 && ctx.peakPanic>=40){
    add(7, 'At the worst of it '+n0(ctx.peakPanic).toLocaleString()+
           ' birds were running the wrong way.','morale');
  }

  /* the animals being themselves */
  if(ctx.revived>0){
    add(8, ctx.revived===1
      ? 'A possum that was not, in fact, dead outlived most of them.'
      : n0(ctx.revived)+' possums declined to stay dead.');
  }
  if(ctx.bought.capybara){
    add(11,taleOne(['The capybaras did not participate. The capybaras never do.',
                    'The capybaras held the line by standing in it.']),'chest');
  }
  if(ctx.foes.bear && who==='coons'){
    add(6, 'The bear is still out there.');
  }
  if(ctx.foes.hawk>=10){
    add(4, 'Most of the losses came from directly above.');
  }

  /* Quiet fights qualify for almost nothing above, which would leave the card
     nearly empty on a walkover. These are the low-weight floor: true of any
     fight, so something always fills the second slot. */
  if(who==='birds' && ctx.survFrac>=0.90 && ctx.initB>=10){
    add(2, taleOne(['It was over before the dust settled.',
                    'The raccoons appear to have miscounted.',
                    'Barely worth writing down.']));
  }
  if(ctx.flockKills>0){
    /* Careful with the generic pool: a line like "the fence held" reads as
       filler on a win and as a flat contradiction on a loss, and one
       contradiction destroys the trust the whole card runs on. Anything that
       asserts an outcome is gated; only pure arithmetic is safe both ways. */
    const generic=[n0(ctx.initB-ctx.coonsLeft)+' of them will not be back.',
                   n0(ctx.flockKills)+' dead on their side of the yard.'];
    if(who==='birds') generic.push('The fence held. The fence usually does not.');
    add(1, taleOne(generic));
  }

  /* the setting */
  if(ctx.night && who==='coons'){
    add(5, taleOne(['It was dark and they knew the ground better.',
                    'Nothing good happens in that coop after sundown.']));
  }
  if(ctx.how && /time/i.test(ctx.how)){
    add(6, 'Both sides ran out of clock before they ran out of enemies.');
  }

  return F;
}

/* ---------- the kicker ---------- */
function taleKicker(who,ctx){
  if(who==='birds'){
    if(ctx.champName) return taleOne([ctx.champName+' will not be doing chores.',
      'Somebody put '+ctx.champName+' on the payroll.',
      ctx.champName+' has been told, repeatedly, that it was a team effort.']);
    return taleOne(['The eggs are fine. That was the point.',
                    'Nobody will believe this.','Back to scratching.']);
  }
  if(who==='coons') return taleOne(['Count the eggs. Then count them again.',
    'The fence is a suggestion and they know it.','Try more roosters.']);
  return taleOne(['Everyone went home unhappy.','No eggs were saved. None were lost either.']);
}

/* ---------- assemble ---------- */
function buildTale(who,how){
  /* Reset the phrase cursor per fight, or the card depends on how many
     battles you happened to watch before this one — which would mean a shared
     link showed the recipient different words than the sender saw. Same seed,
     same fight, same dispatch. */
  TALE_N=0;
  const initAv=Math.max(1,initA), initBv=Math.max(1,initB);
  const survivors=Math.max(0,aliveA), coonsLeft=Math.max(0,aliveB);
  const champ=BATTLE.champ;
  const champIsBird=champ>=0 && A.team[champ]===0;
  let flockKills=0;
  for(let i=0;i<N;i++) if(A.team[i]===0) flockKills+=A.kills[i];

  /* Anything you paid for that never killed anything — but only count it
     against units that were supposed to. Calling a capybara a dud for not
     killing is the one joke the card must not make: it is bought for the calm
     aura, its damage is 6 on purpose, and mocking it for that would be the
     card misreading its own game. Same for anything else that steadies rather
     than fights. */
  const duds=[];
  for(const k in TALE.bought){
    if(TALE.boughtKills[k]) continue;
    const u=UNITS[UI_[k]];
    if(!u || u.calm || u.rally || u.dmg<15) continue;
    duds.push(u.label.replace(/s$/,'').toLowerCase());
  }

  const ctx={
    initA:initAv, initB:initBv, survivors, coonsLeft,
    survFrac:survivors/initAv, coonFrac:coonsLeft/initBv,
    champName:(champIsBird && A.name[champ])?A.name[champ]:null,
    champKills:champ>=0?A.kills[champ]:0,
    flockKills,
    early:TALE.early, peakPanic:TALE.peakPanic, spent:TALE.spent,
    revived:TALE.revived, firstBlood:TALE.firstBlood,
    lastGasp:isFinite(TALE.lastGasp)?TALE.lastGasp:survivors,
    bought:TALE.bought, duds, foes:CFG.foes||{},
    night:CFG.arena==='coop', how:how||''
  };

  const used=new Set();
  const facts=taleFacts(who,ctx)
    .sort((a,b)=>b.w-a.w)
    .filter(f=>{ if(used.has(f.tag)) return false; used.add(f.tag); return true; })
    .slice(0,2)
    .map(f=>f.txt);

  return {head:taleHead(who,ctx), body:facts, kick:taleKicker(who,ctx)};
}

function renderTale(who,how){
  const el=$('cardTale');
  if(!el) return;
  const t=buildTale(who,how);
  el.innerHTML='<b>'+t.head+'</b>'+
    t.body.map(l=>'<span>'+l+'</span>').join('')+
    '<i>'+t.kick+'</i>';
}
