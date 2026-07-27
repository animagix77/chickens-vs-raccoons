
/* ============================================================
   THE ROSTER
   Every combatant is a row in one table. team 0 defends the coop,
   team 1 wants what's inside it. Roles matter more than numbers:
   line-holders soak, chargers knock things over, support buffs,
   heroes frighten, and one or two units break the rules entirely.
   ============================================================ */
const UNITS=[
/* ---------------- the flock ---------------- */
{k:'hen',      team:0, label:'Hens',       hp:42,  dmg:2.2, rate:1.05,reach:1.15,speed:3.3, accel:9,  nerve:0.26,cleave:1,rad:0.72,cost:1,
  build:'bird',kit:'hen',   blurb:'No spurs. No plan. No idea.'},
{k:'rooster',  team:0, label:'Roosters',   hp:70,  dmg:8.2, rate:0.74,reach:1.30,speed:3.9, accel:11, nerve:0.68,cleave:1,rad:0.72,cost:2,
  build:'bird',kit:'rooster',crit:[0.08,1.9], blurb:'Loud, territorial, armed at the ankle.'},
{k:'gamecock', team:0, label:'Gamecocks',  hp:93,  dmg:11.5,rate:0.66,reach:1.45,speed:4.4, accel:13, nerve:0.94,cleave:1,rad:0.72,cost:3,
  build:'bird',kit:'gamecock',crit:[0.17,2.4], blurb:'Bred for exactly one thing.'},
{k:'guinea',   team:0, label:'Guinea fowl',hp:34,  dmg:3.0, rate:0.9, reach:1.10,speed:4.6, accel:14, nerve:0.55,cleave:1,rad:0.62,cost:2,
  build:'bird',kit:'guinea', rally:[6.5,0.55], blurb:'Useless in a fight. Screams before anyone else notices.'},
{k:'goose',    team:0, label:'Geese',      hp:210, dmg:14,  rate:0.85,reach:1.70,speed:3.1, accel:8,  nerve:0.90,cleave:2,rad:1.05,cost:6,
  build:'bird',kit:'goose', shove:1.5, blurb:'Genuinely wants to fight you. Always has.'},
{k:'turkey',   team:0, label:'Turkeys',    hp:190, dmg:16,  rate:1.05,reach:1.65,speed:2.7, accel:7,  nerve:0.72,cleave:1,rad:1.00,cost:5,
  build:'bird',kit:'turkey', blurb:'Enormous. Slow. Weirdly confident.'},
{k:'cat',      team:0, label:'Barn cats',  hp:90,  dmg:22,  rate:0.55,reach:1.25,speed:5.6, accel:18, nerve:0.75,cleave:1,rad:0.66,cost:4,
  build:'quad',kit:'cat', crit:[0.30,2.2], blurb:'Will help. Will not be thanked.'},
{k:'goat',     team:0, label:'Goats',      hp:260, dmg:30,  rate:1.10,reach:1.85,speed:4.6, accel:15, nerve:0.85,cleave:1,rad:1.10,cost:7,
  build:'quad',kit:'goat', shove:3.4, blurb:'Arrives head-first. Only knows the one move.'},
{k:'pig',      team:0, label:'Pigs',       hp:340, dmg:20,  rate:0.95,reach:1.70,speed:3.2, accel:9,  nerve:0.80,cleave:2,rad:1.20,cost:7,
  build:'quad',kit:'pig', blurb:'Not a guardian animal. Simply large and hungry.'},
{k:'llama',    team:0, label:'Llamas',     hp:380, dmg:26,  rate:1.20,reach:4.60,speed:3.6, accel:10, nerve:0.95,cleave:1,rad:1.25,cost:9,
  build:'quad',kit:'llama', ranged:1, blurb:'A real livestock guardian. Spits with intent.'},
{k:'donkey',   team:0, label:'Donkeys',    hp:520, dmg:62,  rate:1.15,reach:2.10,speed:3.8, accel:10, nerve:0.98,cleave:2,rad:1.35,cost:12,
  build:'quad',kit:'donkey', shove:3.0, blurb:'Farmers use these on purpose. Kicks like a truck.'},
{k:'dog',      team:0, label:'Farm dogs',  hp:620, dmg:55,  rate:0.55,reach:1.95,speed:6.2, accel:20, nerve:1.00,cleave:2,rad:1.10,cost:16,
  build:'quad',kit:'dog', fear:9.0, blurb:'The reason most nights end quietly.'},
{k:'bull',     team:0, label:'Bulls',      hp:900, dmg:90,  rate:1.30,reach:2.30,speed:4.8, accel:11, nerve:1.00,cleave:3,rad:1.60,cost:22,
  build:'quad',kit:'bull', shove:5.5, blurb:'A bad idea that works.'},

/* ---------------- what comes out of the treeline ---------------- */
{k:'coon',     team:1, label:'Raccoons',   hp:545, dmg:27,  rate:0.72,reach:1.75,speed:4.15,accel:12, nerve:0.80,cleave:3,rad:1.15,cost:10,
  build:'quad',kit:'coon', blurb:'Hands. Teeth. No respect for property lines.'},
{k:'possum',   team:1, label:'Possums',    hp:260, dmg:18,  rate:0.90,reach:1.55,speed:3.4, accel:10, nerve:0.10,cleave:1,rad:1.00,cost:5,
  build:'quad',kit:'possum', playDead:1, blurb:'Dies immediately. Gets up again. Repeat.'},
{k:'fox',      team:1, label:'Foxes',      hp:300, dmg:34,  rate:0.60,reach:1.60,speed:6.0, accel:19, nerve:0.70,cleave:1,rad:1.00,cost:12,
  build:'quad',kit:'fox', crit:[0.20,2.0], blurb:'Takes one bird and leaves. Then comes back.'},
{k:'coyote',   team:1, label:'Coyotes',    hp:480, dmg:38,  rate:0.68,reach:1.80,speed:5.2, accel:15, nerve:0.90,cleave:2,rad:1.15,cost:16,
  build:'quad',kit:'coyote', pack:1, blurb:'Never arrives alone.'},
{k:'hawk',     team:1, label:'Hawks',      hp:180, dmg:40,  rate:1.30,reach:1.70,speed:7.0, accel:22, nerve:0.85,cleave:1,rad:0.80,cost:14,
  build:'bird',kit:'hawk', fly:2.6, blurb:'Comes out of the sun. Nothing on the ground can reach it.'},
{k:'bear',     team:1, label:'Bear',       hp:6000,dmg:180, rate:1.40,reach:3.10,speed:3.4, accel:8,  nerve:1.00,cleave:5,rad:2.40,cost:60,
  build:'quad',kit:'bear', shove:6.0, boss:1, blurb:'This is no longer a raccoon problem.'}
];
const UI_=(()=>{ const m={}; UNITS.forEach((u,i)=>{u.i=i; m[u.k]=i;}); return m; })();
const ALLIES=UNITS.filter(u=>u.team===0), FOES=UNITS.filter(u=>u.team===1);
/* anything that can strike something in the air */
UNITS.forEach(u=>{ u.aa = !!(u.fly || u.ranged || u.k==='gamecock' || u.k==='cat' || u.k==='rooster'); });

/* ---------------- geometry kits ---------------- */
const KITS={
  hen:      ()=>BIRD_KITS.hen.map(buildBird),
  rooster:  ()=>BIRD_KITS.rooster.map(buildBird),
  gamecock: ()=>BIRD_KITS.gamecock.map(buildBird),
  guinea:   ()=>[{feather:'#4a4d58',wingC:'#5a5e6a',tail:'#33363f',red:'#c95a3a',comb:.35,tailUp:.7,tailW:.6,tailL:.45,scale:.82,spur:0},
                 {feather:'#5c5f6b',wingC:'#6b6f7c',tail:'#3d404a',red:'#d0623f',comb:.35,tailUp:.7,tailW:.6,tailL:.45,scale:.80,spur:0}].map(buildBird),
  goose:    ()=>[{feather:'#eae6dc',wingC:'#d8d3c6',tail:'#c8c2b3',red:'#e88a12',comb:.15,tailUp:.75,tailW:.7,tailL:.5,scale:1.55,spur:0},
                 {feather:'#5a5f52',wingC:'#6a6f60',tail:'#3f4438',red:'#1a1a1a',comb:.15,tailUp:.75,tailW:.7,tailL:.5,scale:1.52,spur:0}].map(buildBird),
  turkey:   ()=>[{feather:'#3a2f26',wingC:'#4a3c30',tail:'#5a4a38',red:'#d0403a',comb:1.7,tailUp:.05,tailW:2.0,tailL:1.5,scale:1.45,spur:0},
                 {feather:'#2b241d',wingC:'#3a3128',tail:'#4a3e30',red:'#c8382f',comb:1.8,tailUp:.05,tailW:2.1,tailL:1.55,scale:1.48,spur:0}].map(buildBird),
  hawk:     ()=>[{feather:'#6b533a',wingC:'#8a6c48',tail:'#4a3a28',red:'#e8b022',comb:.1,tailUp:.55,tailW:1.4,tailL:.9,scale:1.05,spur:1},
                 {feather:'#514436',wingC:'#6f5c46',tail:'#3c3226',red:'#e8b022',comb:.1,tailUp:.55,tailW:1.4,tailL:.9,scale:1.02,spur:1}].map(buildBird),

  cat:   ()=>[{body:'#3b3a40',dark:'#2a292e',legs:'#33323a',muzzle:'#c9c4bc',ear:'prick',tail:'bush',tailC:'#2a292e',
               len:.34,high:.26,wide:.13,leg:.20,legR:.032,neck:.13,head:.10,snout:.09,scale:1.0,eye:'#bfe36a'},
              {body:'#b8823f',dark:'#8a6030',legs:'#a5743a',muzzle:'#e8dcc4',ear:'prick',tail:'bush',tailC:'#8a6030',
               len:.34,high:.26,wide:.13,leg:.20,legR:.032,neck:.13,head:.10,snout:.09,scale:.97,eye:'#e0c14a'}].map(buildQuad),
  goat:  ()=>[{body:'#e6e0d2',dark:'#b8b0a0',legs:'#c9c2b2',muzzle:'#f2ece0',ear:'flop',tail:'stub',horn:'goat',
               len:.46,high:.38,wide:.19,leg:.34,legR:.042,neck:.22,head:.13,snout:.14,scale:1.05},
              {body:'#57493c',dark:'#3d332a',legs:'#4a3f34',muzzle:'#cbbfa8',ear:'flop',tail:'stub',horn:'goat',
               len:.46,high:.38,wide:.19,leg:.34,legR:.042,neck:.22,head:.13,snout:.14,scale:1.08}].map(buildQuad),
  pig:   ()=>[{body:'#e0a7a4',dark:'#c98d8a',legs:'#c98d8a',muzzle:'#f0c2bf',ear:'flop',tail:'curl',blunt:1,
               len:.52,high:.36,wide:.24,leg:.22,legR:.055,neck:.12,neckA:-.2,head:.15,snout:.12,scale:1.15},
              {body:'#6d5f57',dark:'#524741',legs:'#524741',muzzle:'#9c8b80',ear:'flop',tail:'curl',blunt:1,
               len:.52,high:.36,wide:.24,leg:.22,legR:.055,neck:.12,neckA:-.2,head:.15,snout:.12,scale:1.18}].map(buildQuad),
  llama: ()=>[{body:'#dcc9a8',dark:'#b9a58c',legs:'#c4ae8c',muzzle:'#efe4cf',ear:'long',tail:'tuft',
               len:.44,high:.36,wide:.19,leg:.46,legR:.045,neck:.58,neckA:-.15,neckR:.075,head:.13,snout:.13,scale:1.15},
              {body:'#8b7460',dark:'#6a5748',legs:'#7a6553',muzzle:'#c9b6a0',ear:'long',tail:'tuft',
               len:.44,high:.36,wide:.19,leg:.46,legR:.045,neck:.58,neckA:-.15,neckR:.075,head:.13,snout:.13,scale:1.12}].map(buildQuad),
  donkey:()=>[{body:'#8e8880',dark:'#5f5a54',legs:'#7d7770',muzzle:'#d8d2c6',ear:'long',tail:'tuft',hoof:'#2a2620',
               len:.60,high:.46,wide:.22,leg:.48,legR:.052,neck:.32,neckA:-.5,neckR:.095,head:.16,snout:.17,scale:1.30},
              {body:'#6a5f56',dark:'#463e38',legs:'#5c524a',muzzle:'#c2b8a8',ear:'long',tail:'tuft',hoof:'#2a2620',
               len:.60,high:.46,wide:.22,leg:.48,legR:.052,neck:.32,neckA:-.5,neckR:.095,head:.16,snout:.17,scale:1.33}].map(buildQuad),
  dog:   ()=>[{body:'#4a3a2c',dark:'#2e241b',legs:'#3f3126',muzzle:'#1d1712',bib:'#e8e2d4',ear:'flop',tail:'bush',tailTip:'#e8e2d4',
               len:.54,high:.36,wide:.19,leg:.34,legR:.045,neck:.20,neckA:-.35,head:.145,snout:.19,scale:1.22},
              {body:'#151318',dark:'#0d0c10',legs:'#1a181e',muzzle:'#8a6a3a',bib:'#8a6a3a',ear:'prick',tail:'bush',
               len:.56,high:.38,wide:.20,leg:.36,legR:.046,neck:.21,neckA:-.35,head:.15,snout:.19,scale:1.26}].map(buildQuad),
  bull:  ()=>[{body:'#2b2621',dark:'#191512',legs:'#221e1a',muzzle:'#c9bfae',ear:'round',tail:'tuft',horn:'bull',blunt:1,hoof:'#141210',
               len:.78,high:.60,wide:.32,leg:.50,legR:.070,neck:.20,neckA:-.25,neckR:.15,head:.22,snout:.17,scale:1.55},
              {body:'#8a5a34',dark:'#5f3c22',legs:'#744c2c',muzzle:'#d8cbb4',ear:'round',tail:'tuft',horn:'bull',blunt:1,hoof:'#141210',
               len:.78,high:.60,wide:.32,leg:.50,legR:.070,neck:.20,neckA:-.25,neckR:.15,head:.22,snout:.17,scale:1.58}].map(buildQuad),

  coon:  ()=>COON_KITS.map(buildCoon),
  possum:()=>[{body:'#b9b4ac',dark:'#6e6a64',legs:'#57534d',muzzle:'#f2ece2',ear:'round',tail:'tuft',tailC:'#e8c9b8',mask:'#3a3630',
               len:.44,high:.30,wide:.18,leg:.22,legR:.040,neck:.14,head:.13,snout:.20,scale:1.05},
              {body:'#9a958d',dark:'#5c5852',legs:'#4a4741',muzzle:'#e6dfd2',ear:'round',tail:'tuft',tailC:'#dbbfae',mask:'#332f2a',
               len:.44,high:.30,wide:.18,leg:.22,legR:.040,neck:.14,head:.13,snout:.20,scale:1.02}].map(buildQuad),
  fox:   ()=>[{body:'#c05a1e',dark:'#8a3c12',legs:'#2a2320',muzzle:'#f2eadc',bib:'#f2eadc',ear:'prick',tail:'bush',tailTip:'#f2eadc',
               len:.48,high:.30,wide:.16,leg:.28,legR:.038,neck:.17,neckA:-.35,head:.125,snout:.20,scale:1.10},
              {body:'#a8481a',dark:'#78310f',legs:'#241e1b',muzzle:'#e8dfd0',bib:'#e8dfd0',ear:'prick',tail:'bush',tailTip:'#e8dfd0',
               len:.48,high:.30,wide:.16,leg:.28,legR:.038,neck:.17,neckA:-.35,head:.125,snout:.20,scale:1.07}].map(buildQuad),
  coyote:()=>[{body:'#8f7a5c',dark:'#645440',legs:'#6d5c46',muzzle:'#ddd2bc',bib:'#ddd2bc',ear:'prick',tail:'bush',tailTip:'#3a3128',
               len:.56,high:.36,wide:.18,leg:.38,legR:.042,neck:.21,neckA:-.4,head:.14,snout:.21,scale:1.20},
              {body:'#7a684f',dark:'#544738',legs:'#5d4f3c',muzzle:'#cec3ad',bib:'#cec3ad',ear:'prick',tail:'bush',tailTip:'#332c24',
               len:.56,high:.36,wide:.18,leg:.38,legR:.042,neck:.21,neckA:-.4,head:.14,snout:.21,scale:1.17}].map(buildQuad),
  bear:  ()=>[{body:'#3a2a1e',dark:'#241a12',legs:'#2e2118',muzzle:'#a8875f',ear:'round',tail:'stub',tailC:'#241a12',blunt:1,
               len:1.05,high:.80,wide:.44,leg:.52,legR:.105,neck:.20,neckA:-.2,neckR:.20,head:.30,snout:.22,scale:1.9}].map(buildQuad)
};
