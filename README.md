# Chickens vs Raccoons

A 3D battle simulator that answers a question nobody asked: how many chickens does it take to beat a raccoon?

The whole thing is one HTML file. No build step required to play it, no dependencies to install, no network access needed — Three.js is inlined, every sound is synthesized in the browser, every model is generated from primitives at load time. Open `index.html` and it runs.

**[▶ Play it](https://animagix77.github.io/chickens-vs-raccoons/)**

## What it does

Set a matchup — up to 4000 birds against 500 raccoons, on an open field in daylight or inside a coop at night — and watch it play out with a cinematic camera that hunts for the best angle on its own. Then command the farm live.

**The war chest.** You don't pick your reinforcements up front. A points pool fills while the fight runs, and a bar of deploy chips lets you spend it as things develop: 8 guinea fowl for 10 points, 4 goats for 15, a bull for 25, two farm dogs for 28. Animals walk in from your line and join the fight immediately. Over a typical match you'll get three or four packets, so it's a real decision rather than a menu.

**Three abilities**, each on a cooldown: sound the horn (everything you own moves and swings faster), scatter feed (birds converge and hold their nerve), and the floodlight (predators flinch, hit softer, swing slower).

**Reel mode** crops to 9:16 and hides the chrome, because the point of this was always short-form video.

**Blood is off by default.** Kids watch this. With it off, hits read through feathers and kicked-up dust instead, and the sim plays exactly the same. The Blood button in the corner turns it on — and turning it back off scrubs the field clean rather than just stopping new marks. Keyboard: `B`.

## Is any of this realistic?

No. The proportions are grounded — a raccoon really is 15–20 lb against a 6–8 lb rooster, real raccoons really do surplus-kill, hens really don't fight back, and donkeys and llamas really are used as livestock guardians — but every combat number is invented and tuned for drama. The real raccoon-to-chicken speed ratio is about 1.7×; the sim uses 1.06×, because a fight where one side simply outruns the other isn't worth watching.

For what it's worth, the sim's answer to the original question is **seven**. Five gamecocks lose to a single raccoon every time, six win about 90% of the time, seven win always.

And 1000 roosters against 100 raccoons is a genuine coin flip.

## How it's built

| | |
|---|---|
| Renderer | Three.js r128, inlined |
| Geometry | Procedural — primitives merged into instanced meshes with baked vertex colors |
| Agents | Structure-of-arrays storage, counting-sort spatial hash for neighbor queries |
| Lighting | PBR materials, ACES filmic tone mapping, PMREM environment, tracked sun shadow frustum |
| Post | Custom chain — HDR target → bright pass → 4 blur passes → composite with grade, vignette, chromatic aberration and grain |
| Sky | Shader dome with two fbm cloud layers, sun disc, stars and moon |
| Audio | Formant-model animal voices (buzzy source into parallel resonant bandpass filters), stereo panning, synthetic convolution reverb |
| Music | Procedural, 16th-note lookahead scheduler decoupled from frame rate, D minor i–VI–III–VII with adaptive layer gating |

Everything runs in one thread at 60 FPS with a thousand-plus animated units.

## Working on it

`index.html` is generated, not edited. The sources live in `parts/`, and `build.py` concatenates them in dependency order and inlines Three.js:

```
python3 build.py
```

That writes `index.html`. The part files are ordinary HTML and JS with no module system — they share one scope by design, which keeps the hot loop free of import indirection.

| File | What's in it |
|---|---|
| `parts/01_shell.html` | Markup, all CSS, HUD, setup panel, commander bar |
| `parts/02_core.js` | Renderer, lights, geometry helpers, bird builders |
| `parts/02b_quad.js` | One parameterized builder covering all eleven quadrupeds |
| `parts/02c_units.js` | The 19-unit roster table and its stats |
| `parts/03_world.js` | Arena, terrain, props, particles, blood and gore |
| `parts/04_sim.js` | Combat, steering, morale, the commander and deploy system |
| `parts/05_view.js` | Sound engine, music engine, kill feed, camera director |
| `parts/06_ui.js` | Sequencer, controls, main loop |
| `parts/07_sky.js` | Sky shader, environment bake, post-processing chain |

## Support

If this made you laugh, [buy me a coffee](https://buymeacoffee.com/wfhpapa).

## License

MIT — see [LICENSE](LICENSE).

---

*for Eenie & Moe*
