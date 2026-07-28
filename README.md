# Chickens vs Raccoons

A family of raccoons raided the coop in the middle of the night. Eenie and Moe didn't make it.

So this is a simulator built to answer the question that comes after it: how many chickens would it have taken?

**[▶ Play it](https://animagix77.github.io/chickens-vs-raccoons/)**

The whole thing is one HTML file. No build step required to play it, no dependencies to install, no network access needed — Three.js is inlined, every sound is synthesized in the browser, every model is generated from primitives at load time. Open `index.html` and it runs.

## What it does

Set a matchup — up to 4000 birds against 500 raccoons, on an open field in daylight or inside a coop at night — and watch it play out with a cinematic camera that holds on the front of the flock before contact and on the clash line once the fight joins. Then command the farm live.

**The war chest.** You don't pick your reinforcements up front. A points pool fills while the fight runs, and a bar of deploy chips lets you spend it as things develop: eight guinea fowl for 8 points, two capybaras for 16, a donkey for 26, a bull for 44. Animals walk in from your line and join the fight immediately. Over a typical match you'll get four or five packets, so it's a real decision rather than a menu.

**Three abilities**, each on a cooldown: sound the horn (everything you own moves and swings faster), scatter feed (birds converge and hold their nerve), and the floodlight (predators flinch, hit softer, swing slower).

**Heavy animals swing, they don't jab.** A bear clears a 6.4 metre arc and sends up to sixteen birds cartwheeling through the air at once; a bull manages six, a donkey four. Throw force is divided by the target's bulk, so a hen sails the width of the pen and a bull on the receiving end merely gets rocked. Anything still alive when it lands takes the fall.

**Recorded score, synthesized fallback.** The music is now seven recorded cues — a menu air, a tension bed for the matchup cards, a battle bed with a separate intensity stem that rides the kill rate, and fanfares for winning and losing — loaded behind a progress bar over Eenie and Moe. If the assets can't be reached, because the file was opened straight off disk or the network is gone, `SAMPLED` stays false and the procedural score takes over with nothing else changing. The single-file build still works on its own; the audio folder is an upgrade, not a dependency.

**Detail tiers.** Every animal is built from five primitives, so their segment counts are the entire polygon budget. Past 650 units the tier drops, past 1500 it drops again, and above that the limbs stop being transformed separately since you cannot resolve a chicken's legs in a mob anyway. Measured: 5.86M triangles down to 3.78M at 1100 units, and 10.56M down to 4.56M at 2200. The instanced meshes are deliberately `frustumCulled=false`, which means every unit is drawn every frame whether or not it's on screen — that's what makes polygon count the highest-leverage knob in the renderer.

**Everything has a voice.** Twenty animals, each with three: what it says charging onto the field, what it says when something connects and it lives, and what it says unprompted mid-fight. A dog barks constantly, a bear roars every few seconds, a hen only ever reacts. All of it is synthesized — a buzzy source at the animal's pitch pushed through parallel bandpass resonators standing in for a throat, where the difference between a goat and a donkey is mostly vibrato rate and where those resonances sit. Two separate voice budgets keep a thousand dying birds from becoming white noise, and an audibility floor stops a death sixty metres away from spending budget a nearer one should get.

**Call it before the countdown.** Pick a side on the matchup card. It locks when the countdown hits zero, and the verdict tells you whether you were right and how you're doing across the session. Most people are confident and wrong, which is the entire appeal.

**Every fight has a link.** The matchup and a seed live in the URL, so a fight can be sent to someone and it replays exactly — same spawns, same crits, same result, on any machine at any frame rate. Copy link is on the verdict card.

**It explains itself.** A short card after the story covers the war chest, what each of the three abilities actually does, and the keyboard shortcuts. Both it and the story are reachable again from the panel.

**Reel mode** crops to 9:16 and hides the chrome, because the point of this was always short-form video.

**Blood is off by default.** Kids watch this. With it off, hits read through feathers and kicked-up dust instead, and the sim plays exactly the same. The Blood button in the corner turns it on — and turning it back off scrubs the field clean rather than just stopping new marks. Keyboard: `B`.

## What the simulator actually says

Every number below is measured, not asserted — the sim is deterministic, so these are repeatable. Each figure is the share of seeded runs the birds won, under the game's own verdict rules.

The original question, gamecocks against a single raccoon:

| Gamecocks | Birds win |
|---|---|
| 4 | 0 of 9 |
| 5 | 1 of 9 |
| 6 | 6 of 9 |
| **7** | **9 of 9** |

**Seven.** Six is a coin flip that usually comes off. Five almost never does.

The headline matchup is genuinely balanced on a knife edge:

| Matchup | Birds win | Typical result |
|---|---|---|
| 850 roosters v 100 raccoons | 0 of 5 | wiped out, ~50 raccoons still standing |
| **1000 roosters v 100 raccoons** | **6 of 13** | ~32s, ~46 birds left |
| 1200 roosters v 100 raccoons | 5 of 5 | ~560 birds walk away |

Hens are not roosters. A thousand of them lose to a hundred raccoons every time, and the raccoons take **zero** casualties doing it. In the night coop, 1200 hens against 60 raccoons is the same story.

And a black bear is not a raccoon problem:

| Hens | Result |
|---|---|
| 400 | bear wins, 32s |
| 700 | bear wins, 53s |
| 1000 | bear falls in 4 of 5 |
| 1500 | bear falls every time |

## Is any of this realistic?

Partly, and it's worth being exact about which parts.

The behaviour is grounded. Raccoons really do surplus-kill. Hens really don't fight back. Donkeys and llamas really are used as livestock guardians. Guinea fowl really do raise the alarm before anything else notices. Capybaras really are that calm.

The durability numbers are now grounded too, which they weren't at first. Health scales as mass^0.75 — the usual structural exponent — times a factor for what the animal actually is, with predators worth roughly twice a prey mammal of the same weight because they have the weapons. The raccoon anchors the scale. Damage follows the same shape: a donkey's kick and a bull's horns are lethal to a 7kg animal in one or two connections, and the numbers say so now.

The first pass got this badly wrong in a way worth recording. A 50kg goat had less health than a 7kg raccoon. A 700kg bull had less than a farm dog and swung for less damage than its target had health, so it could stand in a crowd of raccoons for ten seconds and kill none of them. Fixing it meant halving every predator's health and halving the three flock birds' damage together, which leaves flock-versus-raccoon exactly where it was — the answers above are unchanged — while doubling what a bull or a donkey is worth.

The swing was the other half of the bear problem, and it was a bug rather than a balance choice. Cleave scanned a fixed three-by-three block of the spatial hash — about 3.6 metres — while the bear's reach was 4.6, so most of its arc was silently ignored and the largest animal on the field connected with almost nothing. The scan is now sized from the actual radius.

What is *not* realistic is speed and scale. The real raccoon-to-chicken speed ratio is about 1.7×; the sim uses 1.06×, because a fight where one side simply outruns the other isn't worth watching. And a real bear would never be brought down by any number of chickens.

Masses used, in kilograms: hen 2.5, rooster 3.5, guinea fowl 1.3, goose 5.5, turkey 8, barn cat 4.5, capybara 55, goat 50, pig 90, llama 160, donkey 210, farm dog 50, bull 700, raccoon 7, possum 4, fox 5, coyote 12, hawk 1.1, black bear 180.

## How it's built

| | |
|---|---|
| Renderer | Three.js r128, inlined |
| Geometry | Procedural — primitives merged into instanced meshes with baked vertex colors |
| Agents | Structure-of-arrays storage, counting-sort spatial hash for neighbor queries |
| Determinism | Two separate random streams and a fixed 60Hz sim step, so a seed reproduces a fight anywhere |
| Lighting | PBR materials, ACES filmic tone mapping, PMREM environment, tracked sun shadow frustum |
| Post | Custom chain — HDR target → bright pass → 4 blur passes → composite with grade, vignette, chromatic aberration and grain |
| Sky | Shader dome with two fbm cloud layers, sun disc, stars and moon |
| Audio | 32 formant-model animal voices (buzzy source into parallel resonant bandpass filters), stereo panning, synthetic convolution reverb, two-bucket voice budgeting |
| Music | Procedural, 16th-note lookahead scheduler decoupled from frame rate, D minor i–VI–III–VII with adaptive layer gating |

Everything runs in one thread at 60 FPS with a thousand-plus animated units.

The two random streams are the load-bearing idea behind shareable links. One stream feeds the simulation and is advanced only inside the fixed step, so after N steps the state is identical everywhere. The other feeds everything you merely look at — camera shake, blood spatter, music, clouds — which is drawn a different number of times on a fast machine than a slow one, and so must never touch the first.

## Working on it

`index.html` is generated, not edited. The sources live in `parts/`, and `build.py` concatenates them in dependency order and inlines Three.js:

```
python3 build.py
```

That writes `index.html`. The part files are ordinary HTML and JS with no module system — they share one scope by design, which keeps the hot loop free of import indirection.

| File | What's in it |
|---|---|
| `parts/01_shell.html` | Markup, all CSS, HUD, setup panel, commander bar, story card |
| `parts/02_core.js` | Renderer, lights, the two random streams, geometry helpers, bird builders |
| `parts/02b_quad.js` | One parameterized builder covering all twelve quadrupeds |
| `parts/02c_units.js` | The 20-unit roster table, its stats, and how they were derived |
| `parts/03_world.js` | Arena, terrain, props, particles, blood and gore |
| `parts/04_sim.js` | Combat, steering, morale, the commander and deploy system |
| `parts/05_view.js` | Sound engine and its iOS unlock, music engine, kill feed, camera director |
| `parts/06_ui.js` | Sequencer, seeds and links, calling the winner, controls, main loop |
| `parts/07_sky.js` | Sky shader, environment bake, post-processing chain |

## Support

If this made you laugh, [buy me a coffee](https://buymeacoffee.com/wfhpapa).

## License

MIT — see [LICENSE](LICENSE).

---

*for Eenie & Moe*
