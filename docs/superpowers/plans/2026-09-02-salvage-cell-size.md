# Plan: Salvage Cell size — re-grid, not restart (#319)

**Spec:** `docs/superpowers/specs/2026-09-02-salvage-cell-size.md` · **Branch:** `feature/salvage-cell-size`
· **Size:** S (was M before the review panel removed the snap and the debounce).

The review panel (two reviewers + naysayer, 2026-09-02) killed the first plan's Tasks 1–4 as written: the
"picCols constant" assertion was false by construction, the drone carry ran after `buildArena` had already
respawned a roster, the placeholder cold-store snap left a piece that never showed a picture behind a green
suite, and the snap/debounce design itself was rejected (see the spec's Decision). What survived is one
mechanism commit.

## Done — `22b5781`

`regrid()` (generation, rng, clock, drones carried), `applyConfig` treats `cellSize` as a live re-grid,
`resizeState` routes through `regrid`, `geometry()` exported with the one-scale fallback and the (non-binding)
nearest-fill cap. Tests as the spec lists; mutation-checked. Salvage suite 86 green, typecheck clean.

## Task A — derive the cell from the viewport, drop the knob (spec Revision 3)

Two commits, each green.

**Commit 1 — derive, ignore the field.** `state.ts`: `ARENA_CELLS`, `CELL_MIN = 4`, `CELL_MAX = 24`,
`cell` on `SalvageState`. `salvage.ts`: `cellFor(size)`; `emptyState(cfg, size)` derives `cell` and uses it
for cols/rows/`fineSub`; sprite `k` → `Math.round` (both non-Contours branches keep the cap and fallback
already there); `regrid(s, size)` (drop `cfg`; `scale = s.cell / cellFor(size)`); `applyConfig` loses the
cell branch, **keeps** the size branch; `buildArena`'s trails rebuild reads `s.cell`. `render.ts`: five
sites (`Layers.cellSize` field + compare + construct, `cs`, trail blit ×2) → `s.cell`. `testArena.ts`: cell
10. Stale comments at `index.ts:25`, `render.ts:93`, `salvage.ts` (the #319 comment in `applyConfig`).
Tests: the three `#319` tests → `resizeState` cases (scale `oldCell/newCell`; a 1000→1400 sweep replaces
the drag; literals from the rule, e.g. 1400×900 → cell 10, 140×90); `createState` layout literal (cell 7,
142×85, `picCols` 64, hole `7 * 4`); the Contours literals; `geometry` tests per the spec plus `cellFor`;
`trails.test.ts:39` loop → `CELL_MIN..CELL_MAX`. Re-measure the loop budgets. Green. Commit.

**Commit 2 — remove the field.** `schema.ts`: delete `cellSize`, extend `chunkSize` help. Delete every
`cellSize:` from `salvage.test.ts` parses. `npm test` (codec/meta sweeps), typecheck. Commit.

## Task B — docs, gotcha

- `docs/gallery.md` Salvage entry: nothing names Cell size; check Ablation's sentence about it is Ablation-only (it is).
- `CLAUDE.md` gotcha (short): *a structural key that changes per input event restarts the piece per tick —
  re-grid the run in place (generation, rng, drones carried) rather than fall back to `setup()`; and a
  fallback that clamps two axes independently distorts the fit — fit by one scale.*
- Spec: revision notes for anything found in Chrome.

Green: `npm test`, `npm run lint`, `npx tsc -b --noEmit`, `npm run build && npm run size`. Commit.

## Task C — Chrome verify (inline)

`npm run dev`; `http://localhost:5180/d/salvage?seed=7` — the picture fills its box for the sword, a 16 px sprite, a tall
sprite and Contours at the default window and at 390×700 emulation; a window resize keeps the run (probe:
generation and drones carried, cell moves with the viewport). Play at cell 4, 10, 24 with a 16 px
sprite, a 48 px sprite and Contours (pin `picture`); 390×700 emulation at cell 10 with a tall sprite — the
forbidden box hugs the art.

## Task D — review, verify, merge

`diversion-reviewer` + `perf-analyzer` over the branch diff (fresh); apply what survives; re-run gates. Hand
the URL to the owner. On approval: squash, FF-merge, delete both branch ends, close #319 with a comment
naming the commit; comment on #318 that the picture half wants a `Picture size` knob (filed as its own issue).
