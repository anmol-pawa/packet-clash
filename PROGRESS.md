# packet-clash progress log

Each hourly routine run appends an entry: date (IST), task, what changed, how it was verified, and what's next.

## 2026-10-12: planning
- Added CLAUDE.md (run protocol, art quality bar, rules) and ROADMAP.md. The hourly routine starts from the first unchecked task.

## 2026-10-12 (06:45 IST): 0.1 scaffold
- Next.js 16 + React 19 + TypeScript + Tailwind 4 + Vitest + ESLint, configs copied from Query Clash (PGlite/CodeMirror parts dropped; pixi.js installed for 0.2). Static export with `BASE_PATH=/packet-clash`, manifest, `PwaRegister`, offline `scripts/gen-sw.mjs` (worker `#fragment` fix kept, cache prefix `packet-clash-`). `ci.yml` runs lint/typecheck/test/`build:pages`; `pages.yml` deploys to gh-pages.
- Pixel art pipeline: `lib/pixel.ts` (palette + character-grid sprites, parse/validate, flip, nearest-neighbour RGBA), `components/ui/PixelSprite.tsx` (canvas renderer with frame cycling), `scripts/png.mjs` + `scripts/gen-icons.mjs` (`npm run icons`) render all icons from the sprite in-repo.
- Original mascot **Bitling** (32×32, shaded body/envelope/LED ramps, outline, 2-frame LED blink) used for the title screen and the app icons (instead of literal "PC" letters: the creature reads better at icon size).
- Title screen: banded pixel night sky with twinkling stars, Press Start 2P title + Pixelify Sans body font, bobbing mascot on a grass platform, handheld-style PRESS START button and message box; 404 page.
- Verified: lint, typecheck, 5 tests, `build:pages` (44 files precached). Playwright at 1280×800 and iPhone 14: no console errors, no horizontal overflow, service worker registers, manifest 200.
- Next: 0.2 port the Pixi battle engine and get a demo battle running.

## 2026-10-12 (11:15 IST): 0.2 battle engine + demo battle
- Ported from Query Clash: `game/render/{tween,particles,fx,textures}.ts` (tween engine, pooled particles, camera shake / hit-stop / flash), `game/audio/synth.ts` (Web Audio SFX + music; `cast(pitch)` replaces SQL attack kinds), `lib/save.ts` (localStorage save with XP, badges, Packetdex seen/caught, settings). The UI kit was rewritten as pixel components instead of copied (Query Clash's kit depends on `motion` and a glassy look).
- New pure reducer `game/engine/battle.ts`: intro → menu → player-move / foe-move → resolve → victory / defeat. One question per turn: a right answer is your move (streak bonus, crit from the 3rd right answer in a row), a wrong one gives the foe a free hit. 7 reducer tests.
- `game/render/stage.ts`: Pixi stage at 256×192 logical pixels: banded dithered sky, drifting clouds, stepped hills, relay towers with blinking LEDs, grass with tufts, pixel-ellipse platforms with soil rims. Intro = 8-bar screen wipe + flash, then both creatures slide in. Moves: lunge, a pixel **packet** sprite flies on an arc, a 3-frame spark sprite, white-flash blinks + recoil, shake, hit-stop and pixel damage numbers ("CRITICAL!"); faint = sink + fade. `pixelTex.ts` turns palette-grid sprites into nearest-neighbour textures with white silhouettes.
- `/battle` demo: Bitling vs Glitchling (a palette-swapped stand-in foe), HP boxes, typed-out message box, a 2×2 tap-friendly move menu of answers, explanation after every answer, NEXT, then AGAIN/TITLE. PRESS START on the title now opens it.
- Content: 6 demo questions (`content/demo.ts`); numeric answers come from `lib/net/basics.ts` (`usableHosts`, `transmissionDelay`, `propagationDelay`), tested against textbook values (/26 → 62 hosts, 1,000 B on 1 Mbps → 8 ms). Every answer has a test.
- Verified: lint, typecheck, 18 tests, `build:pages` (66 files precached). Playwright on the static export at 1280×800 and iPhone 14: played a whole battle (one wrong answer, then right answers to victory), no console errors, no horizontal overflow; screenshots reviewed.
- Next: 0.3 real creature art: a starter and a boss at 64×64/96×96 with front + back sprites and idle/attack/hurt/faint/evolve frames, plus an illustrated background (replace the Bitling stand-ins on the stage; the player should show a back sprite).

## 2026-10-12 (11:50 IST): 0.3a starter creature + sprite viewer
- Split 0.3 into 0.3a–d in ROADMAP (starter, boss, illustrated background, evolve).
- `lib/paint.ts`: a pure pixel painter. Ellipsoids, tapered tubes and polygons are shaded as 3-D volumes lit from the upper left and quantised onto palette ramps (light 2×2 dither between steps), parts get darker rim lines where they overlap earlier parts, and `outline()` closes the silhouette with a 1-px outline. Poses are just numbers, so every animation frame is the same drawing re-posed.
- **Pingkit**, the starter (`game/art/creatures/pingkit.ts`): an original teal kit fox with a glowing fibre-optic tail tip, ear-tip signal LEDs, a Wi-Fi-arc forehead mark and a red collar with a gold jack tag. 64×64, 5-step body ramp + cream/glow/collar ramps. Front and back sprites, each with idle (4 frames: breathing, tail sway, glow pulse, ear twitch), attack (wind-up, open-mouth lunge), hurt (eyes squeezed, ears flattened, glow dims) and faint (KO eyes, ears drooping, slump).
- Stage: `PixelActor` now takes a named animation set; idle loops and `play()` runs attack/hurt/faint once (faint holds). The demo battle uses Pingkit's back sprite for the player (attack frames on the lunge, hurt frames under the white flash, faint before the sink); Glitchling stays as the foe until 0.3b.
- `/dev/sprites`: every creature's front/back animations, the white evolve silhouette and move effects, on a grass checkerboard with ×2/×3/×4 zoom.
- Tests: 8 new (every anim present at 64×64 for front and back, 2–4 distinct idle frames, poses differ from idle, palette ≤ 26 colours, every edge pixel is outline; painter shading, outline, rim and silhouette).
- Verified: lint, typecheck, 26 tests, `build:pages` (73 files precached). Playwright on the static export at 1280×800 and iPhone 14: sprite viewer + 4 battle turns, no console errors, no horizontal overflow; screenshots reviewed (hurt silhouette shows the flattened-ear frame).
- Next: 0.3b a 96×96 boss creature to replace the Glitchling stand-in.

## 2026-10-12 (16:25 IST): 0.3b boss creature Braidwyrm
- **Braidwyrm** (`game/art/creatures/braidwyrm.ts`), the Physical-layer boss: an original coiled cable serpent, 96×96. Violet jacket (5-step ramp) ringed with copper bands, white dielectric belly plates down the neck, a cobra-like hood lined with woven copper braid (cross-hatch weave), copper contact pins on its crown, slit yellow eyes, and a tail that ends in a screw-on connector (shaded hex nut + copper centre pin) throwing cyan sparks. The back sprite shows the hood's coax cross-section emblem (jacket → braid → dielectric → core). 24-colour palette.
- Animations, front and back: idle 4 frames (head sway, coil breathing, tongue flick, hood pulse, sparks flicker), attack 2 (rear back with the hood flared and mouth open, then strike with copper-pin fangs), hurt 2 (recoil, eyes squeezed, gritted teeth, sparks out), faint 2 (head sinks onto the coil, KO eyes, hood folds).
- Demo battle: Braidwyrm (Lv 8) replaces the Glitchling stand-in as the foe at scale 1; its move is now SPARK COIL. The foe platform moved down and widened (190,97 r50) and the foe's home is y=102 so the 96-px boss fits the 256×192 stage. Glitchling's sprite stays in `mascot.ts` (still tested) but is no longer used in battle.
- `/dev/sprites` lists Braidwyrm under Pingkit. Tests: the shared creature checks now run on Braidwyrm too (sizes, 2–4 distinct idle frames, poses differ, palette ≤ 26, closed outline), plus a boss test (96×96, top 8 rows empty so rearing up never clips, coil anchored to the frame bottom).
- Verified: lint, typecheck, 37 tests, `build:pages` (74 files precached). Playwright on the static export at 1280×800 and iPhone 14: battle intro, two turns (foe strike + hurt flash and damage numbers), sprite viewer; no console errors, no horizontal overflow; screenshots reviewed.
- Next: 0.3c an illustrated pixel battle background (sky, terrain, props) replacing the vector-ish demo field.
