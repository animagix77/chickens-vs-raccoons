# Chickens vs Raccoons — Handoff

A single-file 3D battle simulator. It's one self-contained HTML page built with
three.js r128, with no framework and no npm. The animals are modelled, rigged
and animated in Blender and exported into the page.

**Live:** https://chickensvraccoons.com
**Repo:** https://github.com/animagix77/chickens-vs-raccoons (GitHub Pages serves `main`)
**Working folder:** `LaCie ssd/vibe_coding/chics vs coons`
**Simulation version:** `2026-09-17.1` (`SIM_VERSION` in `parts/06_ui.js`)

Last updated 2026-09-27. For what changed and when, see `RELEASE-NOTES.md`
(newest first). This file covers how the project works and how to work on it.

---

## Quick start

```
python3 build.py                       # writes index.html and chickens-vs-raccoons.html
python3 -m http.server 8000            # then open http://localhost:8000/
node tests/regression.cjs --checks-only
```

Serve it; don't double-click it. Under `file://` the browser blocks `fetch()`,
so none of the recorded music or sound effects load. The game then falls back
to its procedural score, which is the most common reason people think the audio
is broken.

---

## What the game is now

- **Two modes.** *Coop Defense* is the default. Two hens shelter in a central
  coop and roofed run, eight fence sections take damage and collapse into
  breaches, and you win by stopping every predator. You lose if both hens fall.
  *Open Battle* is the original flock-versus-raccoons fight: 1000 roosters
  against 100 raccoons is the headline question.
- **Commander bar:** Sound the Horn (1), Scatter Feed (2), Floodlight (3),
  Repair Fence (4, defense only), Rally to Coop (5, defense only), plus paid
  reinforcements from a war chest that fills during the fight.
- **Replays.** Battle links record the seed, the roster and every command.
  Results show up to 12 highlight moments, and you can seek to any of them. Old
  simulation versions are rejected rather than replayed wrong.
- **Final moment.** A true elimination plays a slow-motion push-in on the last
  casualty before the result card (`parts/11_finale.js`). Reduced Motion gets a
  short steady hold instead.
- **The animals** are 20 species on two Blender rigs, GPU-skinned, each with
  its own attack animation. See "Animals" below.

---

## Layout

```
parts/01_shell.html     Markup, all CSS, HUD, setup panel, commander bar, story card
parts/02_core.js        Renderer, lights, the two RNG streams, detail tiers, geometry helpers
parts/02c_units.js      THE UNITS TABLE: every animal's stats and how they were derived
parts/02d_models.js     GENERATED from blender/animals.blend: meshes, skeletons, clips
parts/03_world.js       Arena, terrain, props, particles, blood
parts/03b_skin.js       GPU-skinned instanced renderer for the animals (SkinSquad)
parts/07_sky.js         Sky shader, environment, post-processing
parts/04_sim.js         Combat, steering, morale, commander, deploys
parts/04b_coop.js       Coop objective: fences, breaches, routes, repair, hen health, verdicts
parts/05_view.js        Audio + music engine, renderAgents() (per-animal pose), camera director
parts/09_highlights.js  Ranked battle moments and the replay timeline
parts/10_coop_view.js   The coop, run, fence damage and the protected hens
parts/11_finale.js      Final-casualty camera and slow visual clock
parts/06_ui.js          Sequencer, seeds/links/replays, verdict, main loop
parts/06b_tale.js       The after-action dispatch on the result card
parts/08_controls.js    Pause, speed, tactical view, phone controls

blender/animals.py      Builds every animal/rig/clip in Blender and exports 02d_models.js
blender/animals.blend   The model source (Blender 4.2+)
blender/README.md       Rig rules and the edit -> export -> build workflow
tests/*.cjs             Headless test suites (see Testing)
assets/audio, assets/img  Runtime audio and images
src/three.min.js        Inlined at build time (build.py also looks in ./)
```

`build.py` concatenates the parts in the order given by `ORDER` into one
`<script>`. **All parts share one JavaScript scope**, with no modules. Order
matters for top-level `const`/`let`, but not for function declarations.

The folder on the LaCie drive also holds things that aren't in the repo: the raw
ElevenLabs exports (`*.mp3` at the root, documented in `ELEVENLABS-AUDIO.md` and
`generate-audio.py`), `ENHANCEMENT-REVIEW.md`, `.review-backups/` (snapshots
from earlier sessions) and `_to_delete/` (safe to delete).

---

## Invariants — do not break these

**1. The simulation is deterministic per seed.** Shared links and replays must
reproduce a fight exactly on any machine at any frame rate.
- `SR()` / `srnd()` / `spick()` are the fight's stream. Advance it only inside
  the fixed 1/60 step.
- `VR()` / `rnd()` / `pick()` are cosmetic only: camera, blood, clouds, music.
- Never call `VR` or `Math.random()` from anything `stepSim` reaches. Reordering
  draws also breaks replays, even when the logic looks equivalent.
- Any change that can alter outcomes must bump `SIM_VERSION`, so old links are
  refused rather than replayed wrong.

**2. The headline matchup sits on a cliff.** Rooster damage is pinned at 4.3.
In Open Battle, 1000 roosters v 100 raccoons flips between "almost always
loses" and "almost always wins" across a tenth of a point. Don't nudge it.

**3. Stats are derived, not chosen.** Durability is `mass^0.75 × role factor`;
damage follows the same shape. The derivation is in the header of
`02c_units.js`. A new animal gets a real mass and the model, not guessed numbers.

**4. Rendering never feeds back.** `renderAgents()`, the skin renderer, the
camera and the finale read simulation state and never write it.

**5. Check against the previous release.** `node tests/regression.cjs
--baseline-dir <checkout of the previous main>` compares six seeded battles
checkpoint by checkpoint. It must say "baseline identical" unless the change is
*meant* to alter fights.

---

## Animals

Every animal is built in `blender/animals.py`: chunky low-poly, three levels of
detail (about 1000 / 500 / 270 triangles), on one of two rigs.

| Rig | Animals | Bones |
|---|---|---|
| `bird` | hen, rooster, gamecock, guinea, goose, turkey, hawk | 12: body, neck, head, wing/wingtip ×2, tail, leg/foot ×2 |
| `quad` | cat, capybara, goat, pig, llama, donkey, dog, bull, raccoon, possum, fox, coyote, bear | 15: body, chest, neck, head, jaw, tail ×2, 4 legs × upper/lower |

There are 23 clips: idle, walk, run, flail (thrown), flinch, die, fly and glide
(hawk), and attacks. The bird attacks are peck, flog (gamecock), wingatk (goose,
turkey) and strike (hawk). The quad attacks are bite, butt (goat, pig, bull),
kick (donkey), swipe (bear, cat, raccoon) and spit (llama).

**How it's drawn** (`parts/03b_skin.js`):
- At load, each species' rest skeleton is walked through every clip frame and
  the bone matrices are baked into a small half-float texture: one row per
  frame, three texels per bone.
- Every vertex belongs 100% to one bone.
- Each animal is one instance carrying four numbers: two clip rows, a blend
  weight and a colour variant. The vertex shader blends two bone matrices.
- All colour variants of a species share one mesh and one draw call.
- A matching depth material skins the shadow pass.
- When a big fight puts the crowd on a coarse mesh, a second small squad draws
  the 24 animals nearest the camera with the finest mesh
  (`selectHeroAnimals()` in `05_view.js`).

**What it plays** (`renderAgents()` in `05_view.js`):
- idle and walk, blended by speed; run when panicking;
- the species' attack, timed so the clip's contact frame (40% through) lands on
  the step the sim applies damage (`sw === swC`);
- flinch on a hit, die when dead, flail when thrown, fly/glide for the hawk.

The whole-body motion (position, heading, lean, lunge, recoil, tumble, rolling
onto its side, the finale's slowed death) is still computed there.

**To change an animal**, edit `blender/animals.py` and run it (`pip install
bpy`), or edit `animals.blend` by hand and run it with `--export-only`. Then
run `build.py`. The rules the game relies on are in `blender/README.md`:
- bones stay world-aligned;
- clips are rotation-only;
- weights are rigid;
- at most 16 colour slots and 4 variants per animal.

Variant counts also live in `VARIANTS` in `02c_units.js`, so the simulation
doesn't depend on the renderer.

**Measured against the previous primitive models** (headless, 8s into a
fight):

| Fight | Draw calls | Animation CPU per frame | Triangles |
|---|---|---|---|
| 1000 v 100 | 59 → 27 | 1.25 → 0.77 ms | +9% |
| Max Chaos | 99 → 34 | 2.67 → 2.01 ms | +11% |

The model data adds about 400 KB to the page, which is now about 1.36 MB
(GitHub Pages serves it gzipped).

---

## Other architecture notes

- **Agents are a structure of arrays** (`A.x`, `A.hp`, `A.st`…, capacity
  `MAXA` = 5200). `A.st` is 0 fighting, 1 panicking, 2 dead.
- **A fresh `InstancedMesh` has `count === max`.** `SkinSquad` starts at
  `count = 0`, and `setDetailLive()` calls `renderAgents()` right after a
  rebuild. Keep both, or one frame will show thousands of garbage instances.
- **Detail tiers** come from `detailFor(total)` at spawn. Tier 0 uses model
  LOD0; tiers 1–2 use LOD1; tier 3 uses LOD2 (`SKIN_LOD`). A tier change only
  rebuilds instance buffers. Meshes and bone textures are cached per species.
- **Defense raids grow render capacity on demand** in `applyDeploy`, because
  they have no time limit.
- **Music:** eight recorded beds in `assets/audio`, with procedural fallback.
  `trackSync()` stops every track the new phase doesn't want. The victory and
  defeat cues used to bleed into the next fight and the menu.

---

## Testing

| Command | Covers |
|---|---|
| `node tests/regression.cjs --checks-only` | codecs, presets, capacity, replay across 1/2/4 steps per frame |
| `node tests/regression.cjs --baseline-dir DIR` | six complete seeded battles vs another checkout |
| `node tests/coop.cjs` | fences, breaches, repair, Rally, hen verdicts, defense replays |
| `node tests/targeting.cjs` | nearest-predator pursuit, fence routing, RNG isolation |
| `node tests/finale.cjs` | final-casualty hooks, frozen outcome, reduced motion, seeking |
| `node tests/highlights.cjs` | highlight ledger, bounds, determinism across frame rates |
| `node tests/audio.cjs` | mixing, mute, sample fallback, voice budgets |

The suites stub rendering. Visual checks were done in headless Chromium with
Playwright. The useful trick: set `window.requestAnimationFrame = () => 0` to
stop the page's own loop, then drive `slowmo()`, the fixed sim steps,
`checkWin()`, `director()` and `renderFrame()` yourself at an exact 1/60.
SwiftShader frame rates are meaningless; draw calls, triangles and CPU timings
are not.

---

## Deploying

GitHub Pages serves `main`. Commit the `parts/` sources together with both
generated HTML files. The repo must always rebuild the deployed page byte for
byte:

```
git clone https://github.com/animagix77/chickens-vs-raccoons.git /tmp/check
cd /tmp/check && python3 build.py && md5sum index.html   # must match the live page
```

From a Claude cloud session, `git push` to this repo is refused by the session
proxy. Pushes have gone through the GitHub web upload page in the user's Chrome,
using files from the connected LaCie folder: `/upload/main`, plus
`/upload/main/parts`, `/upload/main/blender` and so on for subfolders. The
destination folder comes from the URL, not the file names. Deleting a file needs
the file's own page on GitHub → Delete.

Claude commits end with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TAWzqntXZAnyche3sKfSnk
```

---

## Known open items

- **Animal polish.** Chicken wings read best from the front and sit close to
  the body from the side. The bear and capybara are passable rather than great.
  The turkey fan is edge-on from the side. All of these are quick to iterate in
  `blender/animals.py`: render one animal in seven poses into a contact sheet.
- **Balance was sampled, not swept.** Coop Defense tuning (fence strength,
  Rally, targeting) was checked on a handful of seeds per the release notes.
- **Two lines of work merged on 2026-09-27.** One session built Coop Defense,
  replays, the cinematic finale and targeting (Sept 4–17). Another built the
  Blender animals and a separate coop wall and finale on the older code. Only the
  animals and the music fix were carried over; the other coop and finale were
  superseded by what was already live.

---

## Quick reference

| Thing | Where |
|---|---|
| Unit stats, variant counts | `parts/02c_units.js` — `UNITS`, `VARIANTS` |
| Animal models, rigs, clips | `blender/animals.py`, `blender/animals.blend` |
| Skinning / bone textures | `parts/03b_skin.js` — `skinSpecies()`, `SkinSquad`, `skinSingle()` |
| Per-animal clip choice and body pose | `parts/05_view.js` — `renderAgents()` |
| Reinforcement bar | `parts/04_sim.js` — `DEPLOY` |
| Coop rules | `parts/04b_coop.js` |
| Combat | `parts/04_sim.js` — `attack()`, `hurt()` |
| Morale and panic | `parts/04_sim.js` — `moraleTick()` |
| Replays and sim version | `parts/06_ui.js` — `REPLAY_VERSION`, `SIM_VERSION` |
| Final moment | `parts/11_finale.js` |
| Music tracks | `parts/05_view.js` — `ASSET_LIST`, `trackSync()` |
| Analytics (GA4 `G-EYGKSG41H1`) | `parts/01_shell.html` — `GA_ID` |
