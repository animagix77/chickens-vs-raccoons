# Final-moment cinematic — September 16, 2026

- A true elimination now plays a 3.6-second camera push-in and slow-motion fall before the results card appears. Open Battle follows the losing army’s final unit; Coop Defense follows the last predator or protected hen.
- The camera favors a clear angle through the crowd, keeps its final framing behind the result card, and fits phone screens. The UI clears during the shot, with an accessible Show results button to skip it.
- Reduced Motion keeps the camera steady and uses a short 0.8-second hold. Timed, stalled, and uncontested outcomes do not invent a death sequence; replay seeking bypasses the presentation while reconstructing earlier ticks.
- The winner, casualties, clock, and action recording stop at the original winning tick. Only the visual death pose, camera, and particles continue; gameplay statistics, random draws, and simulation version are unchanged.

Validation: `node tests/finale.cjs` covers actual death hooks, final-unit/hen targeting, fake-dead possums, frozen state/clock/RNG, camera framing, single completion, skip/reset, reduced motion, and seeking. Defense, replay/capacity, highlight, and audio checks passed. Browser review covered the predator close-up, delayed results, and phone-sized final-hen presentation.

# Instructions readability — September 16, 2026

- Increased the How this works heading, instruction text, label sizes, contrast, line spacing, and section spacing. Phone layouts stack labels above paragraphs for a comfortable reading width.
- Replaced hard scrolling edges with soft opacity fades. The top fade appears only after scrolling, and the bottom fade clears at the end so the final instruction remains readable.
- The instructions support keyboard scrolling, with a persistent Got it button and layouts for short screens. Gameplay and replay version are unchanged.

Validation: browser checks covered desktop and phone typography, scrolling fades, keyboard navigation, and reachable dismissal controls. Both HTML entry points are rebuilt from the same sources.

# Hen health and Rally — September 16, 2026

- Added a labeled health bar and percentage for each protected hen. Critical health changes color and a lost hen is explicitly marked Lost; values reset on a new raid.
- Rally to coop (key 5) sends defenders within 24 metres toward the weakest fence or intruders inside for eight seconds. Defenders still fight targets within reach and follow real breaches through the fencing. The command recharges in 22 seconds and is available only in Coop Defense.
- Rally is recorded in battle links/replays, respects pause and replay input guards, and displays its active duration and cooldown. Added two-row phone controls so all five commands remain easy to reach.
- Simulation version is `2026-09-16.3`; previous recorded simulator versions remain explicitly rejected.

Validation: objective tests cover Rally queueing, cooldown, expiry/reset, nearby-versus-distant steering, combat in reach, breach routing, pause/mode guards, and exact replay at 1/2/4 ticks per frame. Health display tests cover damage, critical/lost labels, accessibility values, and reset. Existing defense outcomes, collision/repair checks, highlight, audio, and replay/capacity suites passed. Browser checks exercised key 5, active/paused status, health bars, and the 390×844 command layout.

# Coop rescue window — September 16, 2026

- Removed the automatic 90-second victory from Coop Defense. A breached fence, intruder, or first hen casualty leaves play and reinforcements active. Stop all predators to win; losing both protected hens ends the raid in defeat.
- Replaced the countdown with objective status and an intruder warning. Updated setup and rules to explain the rescue window.
- Reinforcement rendering grows on demand for longer defense raids, while the existing overall animal limit remains enforced. Open Battle keeps its existing end rules.
- Simulation version is now `2026-09-16.2`; older recorded replay versions remain explicitly rejected rather than silently changing their result.

Validation: objective tests passed for play beyond 90/120/125 seconds, reinforcement accrual and deployment after the first hen is lost, render-capacity growth, both-hen defeat, predator-clear victory, and command replay. Existing collision, repair, reset, highlight, and replay/capacity checks passed.

# Coop defense, replay highlights, and bird models — September 16, 2026

- Added Coop Defense as the default mode: two hens shelter inside a central wooden coop and roofed run. Eight fence sections show damage, collapse into breaches, and block ground, flying, and launched animals while intact.
- Predators attack the run and enter through breaches; defenders can reach intruders through openings. Repair fence (key 4) restores half a section every 20 seconds. Stop all predators or keep at least one hen alive for 90 seconds to win; losing both hens ends the raid immediately.
- Added a compact hen/fence/time HUD, coop-focused camera, and mobile controls. Open Battle remains available; its unit stats and seeded battle outcomes are unchanged.
- Results now include up to 12 meaningful replay moments. Select a moment to resume three seconds before it, with recorded commands and reinforcements reproduced. Seeking suppresses transient audio and particles and yields between batches to keep the interface responsive.
- Added distinct hen, goose, and turkey models across all crowd detail tiers, with recognizable silhouettes, animated joints, and existing variant counts.
- Replay version 2 records the selected mode and simulation version. Historical engines are not bundled; unsupported recorded replay versions are rejected with a visible explanation, while legacy seed links load as Open Battle setups.

Validation: objective tests cover swept fence collision, flying and launched units, fake-dead possum revival, sheltered targets, defender breach routing, repair cooldowns, hen/timer verdicts, reset state, and exact command replay at 1/2/4 simulation ticks per frame. Three complete default seeded raids and an assisted raid passed; six complete classic battles matched the prior release at intermediate and final checkpoints. Highlight, audio, and replay/capacity tests passed. Desktop and 390×844 browser checks covered the central run, commands, reinforcements, results, and interactive highlight seeking with no reported browser errors. Balance was sampled, not exhaustively tuned across every roster or device.

Run `node tests/coop.cjs`, `node tests/highlights.cjs`, `node tests/audio.cjs`, and `node tests/regression.cjs --checks-only`. Build with `python3 build.py`.

# Sound effects upgrade — September 4, 2026

- Added 13 locally hosted samples for chicken calls, raccoon chatter, wings and impacts (about 96 KB total). Samples vary gently in level/pitch and avoid immediate repeats where alternatives exist.
- Replaced saw/square vocal excitation with a soft harmonic pulse; smoothed chatter modulation, lowered throat resonances and replaced arcade cue melodies with tactile cues.
- Shortened reverb, separated crowd/voice/impact event budgets, added repetition cooldowns and bounded transient audio buses.
- Fixed muted reverb leakage, Tactical/reduced-motion hearing distance, species-specific background voices and missing-file music fallback. Preserved the existing soundtrack, gameplay and replay version.
- Included creator attribution and licenses in `sound-credits.html`, linked from the story panel.

Validation: `node tests/audio.cjs` covers scheduling for all 41 procedural effects, sample selection/fallback/cleanup, routing, partial downloads, independent budgets, overview hearing and transient resource limits. Native Web Audio decoded all 13 MP3 files and rendered 82 sampled/fallback voice cases with finite, audible output and no individual clipping (maximum observed peak 0.219 at test gain 0.8). Browser battle ran in Auto and Tactical without reported errors. Replay/command/capacity regression checks passed. Timbre remains a listening judgment; waveform and graph checks do not certify subjective realism.

# Battle readability and character upgrade — September 4, 2026

Published to https://chickensvraccoons.com/ on September 4, 2026. The live HTML was verified byte-for-byte against the tested local build.

## What changed

- Full-roster, versioned replays record accepted reinforcement and command actions at simulation ticks. Copy link includes the actions already taken; Replay battle reproduces them with live commands disabled. New rematch uses a fresh seed.
- Max Chaos keeps all 4,877 animals, including 600 raccoons, the mixed flock, and starting farm allies. The setup slider now supports its raccoon count. Unsupported replay versions produce a visible message; older seed links load as matchup setups.
- Rosters are validated against the 5,200-agent capacity before spawning. Reinforcement packets reserve capacity before charging points. Delayed animal cries use cosmetic randomness and are invalidated on reset.
- Presets preview the full roster. Quick start keeps a two-second prediction window. Pause, 0.5×/1×/2× playback, tactical overhead view, and manual camera controls work alongside existing commands.
- The HUD uses accurate mixed-army names, living farm fleeing counts, survivor percentages, visible costs and cooldowns. Peak panic in the dispatch now counts living farm units, rather than the old accumulated panic counter.
- Phones and short landscape screens have a collapsible reinforcement drawer, larger touch targets, and a compact settings menu. Sliders have labels, toggles expose state, dialogs manage focus, and offscreen controls leave the tab order.
- Roosters have authored scalloped combs and curved tail feathers. Raccoons have a continuous torso and tapered ringed tail. Tagged vertex joints animate legs, pecks, and paw swipes in both the visible and shadow passes.
- Up to 24 nearby visible roosters/raccoons use finer geometry in place of their crowd instance. Distant animals keep inexpensive geometry. No combat stats or geometry-variant counts changed.
- Cleaner default post-processing removes color fringing and reduces grain. Film look and reduced motion are optional settings.
- Arena-owned materials and per-squad/hero resources are disposed on rebuild. Both public HTML entry points are rebuilt together.

## Validation

- `node tests/regression.cjs --checks-only`: four-preset codec round trips; malformed/future replay rejection; atomic capacity and spending; command recording; stale audio callbacks; cosmetic RNG isolation; living morale counts; matching replays with 1/2/4 simulation ticks per presentation frame.
- Six complete seeded fights across Classic, Massacre and Fair Fight, plus same-context repeats, matched the original build's combat-state checksums and outcomes at intermediate checkpoints and the end. Results are in `.review-backups/validation-results.json`.
- The unit-stat source is byte-identical to the backup, including rooster damage 4.3.
- Browser inspection covered 1280×720, 390×844 and 844×390; setup, Max Chaos preview, pause/resume, deployment, Horn, 2× playback, tactical view, and verdict/replay. A recorded browser battle with capybaras and Horn reproduced 300 farm survivors, zero raccoons, 803 casualties and 23.8 seconds in replay. The inspected browser reported no WebGL/JavaScript warnings or errors.
- The 3D agent checked finite geometry across 368 species/tier meshes, surface winding, main/shadow shader deformation, hero replacement/count limits and resource disposal.

Default crowd animal geometry is 486,600 triangles per main pass, down from 522,800 (about 6.9%), before up to 24 close-up substitutions. Hero models are 1,796 triangles per rooster and 1,572 per raccoon. These are geometry measurements, not device FPS guarantees.

## Build and run

```sh
python3 build.py
python3 -m http.server 8943 --bind 127.0.0.1
```

Open `http://127.0.0.1:8943/`. Serve the directory so audio assets can load.

Run the full local suite with `node tests/regression.cjs`. Add `--full` for 36 seeded battles, or `--baseline-dir PATH` to compare an original source tree. The harness stubs graphics/audio and is not a GPU benchmark or a cross-browser test.

## Follow-on work

Placement zones, a battle-event timeline, dedicated goose/turkey silhouettes, general spatial LOD, and device-specific graphics presets remain follow-on enhancements. The first release uses a bounded close-up promotion pool rather than rebuilding the entire crowd renderer. Legacy engine versions are not bundled for historical replay compatibility.

Original files are preserved in `.review-backups/before-enhancements-20260904.tar.gz`.
