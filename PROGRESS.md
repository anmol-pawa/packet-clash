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
