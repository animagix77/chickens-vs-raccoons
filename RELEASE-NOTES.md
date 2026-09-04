# Sound effects upgrade — September 4, 2026

- Added 13 locally hosted samples for chicken calls, raccoon chatter, wings and impacts (about 96 KB total). Samples vary gently in level/pitch and avoid immediate repeats where alternatives exist.
- Replaced saw/square vocal excitation with a soft harmonic pulse; smoothed chatter modulation, lowered throat resonances and replaced arcade cue melodies with tactile cues.
- Shortened reverb, separated crowd/voice/impact event budgets, added repetition cooldowns and bounded transient audio buses.
- Fixed muted reverb leakage, Tactical/reduced-motion hearing distance, species-specific background voices and missing-file music fallback. Preserved the existing soundtrack, gameplay and replay version.
- Included creator attribution and licenses in `sound-credits.html`, linked from the story panel.

Validation: `node tests/audio.cjs` covers scheduling for all 41 procedural effects, sample selection/fallback/cleanup, routing, partial downloads, independent budgets, overview hearing and transient resource limits. Native Web Audio decoded all 13 MP3 files and rendered 82 sampled/fallback voice cases with finite, audible output and no individual clipping (maximum observed peak 0.219 at test gain 0.8). Browser battle ran in Auto and Tactical without reported errors. Replay/command/capacity regression checks passed. Timbre remains a listening judgment; waveform and graph checks do not certify subjective realism.

# Battle readability and character upgrade — September 4, 2026

Release prepared for [chickensvraccoons.com](https://chickensvraccoons.com/).

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
- Six complete seeded fights across Classic, Massacre and Fair Fight, plus same-context repeats, matched the original build's combat-state checksums and outcomes at intermediate checkpoints and the end.
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
