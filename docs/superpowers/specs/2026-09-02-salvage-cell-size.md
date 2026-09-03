# Salvage: the cell is derived, the knob goes; the picture always fills its box

**Date:** 2026-09-02 · **Issues:** #319 (the knob), #318 remainder ("a way to scale everything down") ·
**Supersedes** the *Layout* paragraph and the `cellSize` line of `2026-09-01-salvage-design.md`.

## Problem

The owner: *"cell size doesn't seem to be doing what it should, and just makes the image dance a bit."*

Three defects, all in `salvage.ts`, established by reading `geometry()` and the config path:

1. **The picture's size is a rounding accident of the cell.** The picture is fit into a 40% × 70% box by
   choosing `k = floor(box / img)` cells per sprite pixel, so the on-screen width is `img·k·cs` — non-monotonic
   in `cs`, and with a 2× cliff where `k` drops from 2 to 1 (a 16 px sprite at 1440 wide: 576 px at cell 18,
   304 px at cell 19). The roster's modal sprite is 16 px and `picture` defaults to shuffle-all, so the sprite
   size (16–48 px) changes every generation too.
2. **A drag is a restart per input event.** `cellSize` is structural, `applyConfig` returns false, the host
   re-runs `setup()`; `createState` starts at `generation: 0` with a fresh `mulberry32(seed)`. Every tick snaps
   back to the first sprite, discards the mound and teleports every drone onto the identical spawn layout.
   `resizeState` preserves `generation`; this path does not.
3. **The overflow guard clamps width and height independently** (`bw = min(bw, boxW)`, `bh = min(bh, boxH)`),
   while `quantize(..., fit=true)` re-fits the art by aspect *inside* that grid. On a 390 px phone a 32×63
   sprite gets a 15×49-cell forbidden box around 15×30 cells of art.

The help text ("a finer picture") is true only below cell ~8 and false above.

## Decision (dueling panel + review panel, 2026-09-02)

**Rejected:** *Cell size = screen pixels per picture pixel* (everything zooms together) — it cannot hold a
composition when the sprite shuffles between 16 and 48 px (the picture would be 160 px for the modal sprite
and 480 px for the largest at the default). **Also rejected, by the review panel:** *snapping the cell so the
picture fills its box exactly* — a slider whose middle third does nothing (92/92 sprites had ≥ 50% of
positions redundant; a 32×63 sprite yielded two distinct cells across the whole range), and a 1.9–3.2× swing
in drone size and speed at every generation as each sprite snapped differently. And *a quiet-period
debounce* — the framework deliberately has none (`ConfigScreen.tsx`), and a re-grid counted in `step()` never
lands on a paused Config preview.

**Adopted (shipped in `22b5781`):**

1. **A cell-size change is a re-grid of the SAME run, not a restart.** `cellSize` leaves `applyConfig`'s
   structural list; `regrid(s, cfg, size)` builds fresh state for the new cell and carries `generation` (so
   the sprite), the rng stream, the clock and every drone at its pixel position (rescaled, blanked because
   its path held old-grid indices, nudged off the new picture, trimmed or topped up to capacity).
   `resizeState` routes through it. It runs synchronously on every input event — the same cost the
   per-tick `setup()` already had — so there is no lag and no paused-preview hole. What a re-grid does
   NOT carry is the job: the picture is laid out whole again and the mound is cleared (a piece's cells are
   `k×k` per block, so a mound cannot be mapped across a change of `k`). A drag reads as the colony
   rescaling around the picture, which holds its corner bar the whole-number steps below, and the
   dismantle starts over when the drag ends. Carrying the mound is a possible follow-up, not this issue.
2. **The overflow fallback fits by ONE scale on both axes.** The forbidden box is the art's box on a phone.
3. **The cap for a nearest-fill `k`** (left edge clear of the border at 27%: width ≤ 0.54·cols − 4) is in
   `geometry()` and non-binding under floor.

**Owner decision (2026-09-02, after the `k` table): the knob is not necessary.** *"The number of chunks seems
to be the main thing, as long as the image fills the left hand side as much as possible."* So `cellSize`
leaves the schema and the cell is **derived** per sprite and viewport. Below replaces the Schema and Tests
sections above.

## Revision 2 — the cell derived per SPRITE (rejected by its own naysayer, same day)

The first derivation picked, per sprite, the `k` and integer cell nearest a 10 px target so every picture
filled its box. Its naysayer killed it with the roster: the derived cell ran 7–13 at 1440×900 and 3–13 on a
phone, so drone glyphs swung up to 1.9× (4.3× on a phone) at every generation swap — the knob's dance
replaced by an involuntary one — and a 48 px sprite on a phone derived cell 3, 11× today's grid, with the
`arenaCapacity` on a gallery tile ranging 11–60 drones across sprites. Kept from it: the field goes, the
codec ignores it, `Piece size` is the chunk-count knob.

## Revision 3 — the cell derived from the VIEWPORT

The arena is a fixed number of cells; the cell is whatever makes that many fit the canvas. The whole piece
then scales with the screen like a vector drawing — the same composition, drone size and job pacing on a
phone, a laptop and a 4K wall — and nothing changes between generations.

    ARENA_COLS × ARENA_ROWS = 144 × 90         (the shipped default arena: 1440×900 at cell 10)
    cell = clamp(round(min(H / ARENA_ROWS, W / ARENA_COLS)), CELL_MIN = 4, CELL_MAX = 24)
    cols = floor(W / cell), rows = floor(H / cell)

The cell comes from the **tighter side**, not the area (its naysayer caught the area rule giving an
ultrawide 3440×1440 only 72 rows, so a 63 px-tall sprite was resampled): landscape always has 90 rows and
gains columns; a portrait phone gets more rows. `CELL_MIN`/`CELL_MAX` are the shipped slider's bounds, so
no viewport reaches a regime the piece has not run in. The cell is an integer (crisp blocks, exact
`col·cell`). Worked: 300×190 → 4 (75×47), 390×700 → 4 (97×175), 1000×600 → 7 (142×85), 1440×900 → 10
(144×90), 1920×1080 → 12 (160×90), 3440×1440 → 16 (215×90), 3840×2160 → 24 (160×90). The sim's worst case
is ~19k cells (ultrawide) — a 4K display gets *cheaper* than today's cell 10 there (83k cells), not dearer.

**Measured (final naysayer + code review, 2026-09-02):** the fuller picture's mound pressure — a 16 px sprite
at 4,096 cells, the mound in ~55% of the free space — turned out to STALL (see the `k` paragraph); the
naysayer called it, my headless check used a fixture too fragmented to show it. A gallery tile
runs 75×47 cells at the full 60 drones, 6× today's tile grid; one tile exists. A fullscreen toggle or a
phone URL-bar scroll changes the height by ~15% and can step the cell, which re-grids and clears the mound
— **pre-existing** (a resize always rebuilt the arena; `2026-09-01-salvage-design.md` calls it "rare, and
honest"); carrying the mound across a re-grid is the follow-up if it ever matters.

**`k` stays the whole-number FLOOR of the box fill.** The "round" rule from the table above was built,
and the code review benched it against the test fixture: a 16 px sprite became 64×64 cells, its 12-block
pieces 192 cells, and the last pieces cycled latch → no drop site → disband forever (21/24 in the mound at
12,000 sim-seconds; 3 of 4 seeds stuck at every desktop size; 2 of 45 real roster runs). The mound must
mirror the picture's area in the free space beside it: at k 4 that is 55% of it and does not pack; at k 3
(today's 48×48) it is 25% and finishes in ~870 steps. So the picture fills its box only as far as the mound
can absorb — a packing bound, not a rounding one. The earlier pressure check passed on a fixture with small
scattered pieces; the stall needs big uniform ones. Fill at 1440×900 is therefore today's: 16 px 83%, 32 px
55%, 48 px 84%, 21×40 37% wide. More fill is a follow-up (piece size in cells, or a bigger mound region).

**Nothing re-grids but a resize.** `regrid(s, size)` (shipped) derives the cell from `size`; `resizeState`
is its only caller, and it carries generation, rng, clock and drones as before. `applyConfig` no longer has
a cell branch; its size-mismatch → false branch **stays** (the host can hand `update()` a size `resize()`
never applied, and `setup()` is the right answer there). No speed pinning is needed: `DRONE_SPEED` in
cells/s is uniform in screen fraction now.

**Schema:** `cellSize` is removed. The codec decodes by schema shape, so an old link's `cellSize=…` is
ignored. No preset names it; no framework sweep pins it. `Piece size` (`chunkSize`) help gains a clause:
it is what sets how many pieces there are.

**State:** `cell` replaces every `cfg.cellSize` read — `emptyState` (cols/rows/`fineSub`), `buildArena`'s
trails rebuild, `regrid`'s scale (`oldCell / newCell`), `render.ts` (the `Layers.cellSize` key field, its
compare and construct, `cs`, and the two reads in the trail blit), `testArena.ts` (cell 10).

## Tests

- `geometry`/`cellFor` (exported): the worked cells above pinned; a sweep over sprites {16, 21×40, 32, 32×63,
  48, 64, 200×120} × {300×190, 390×700, 1000×600, 1440×900, 3440×1440, 3840×2160}: `k ≥ 1` whole, inside the
  cap, `originCol ≥ 2` and `originCol + picCols + 2 < seedCol` (the composition holds); the phone aspect case;
  the shipped 1440×900 fill row literally.
- `salvage.test.ts`: the re-grid tests target `resizeState` (a cell can no longer be requested), with the
  literals under this rule (1000×600 is cell 7, 142×85; the 16 px fixture is `k 3`, 48 cells); a resize that
  moves no grid line is a no-op that keeps mound and phase; Contours literals likewise. The loop tests run at
  380×240 (cell 4, 95×60 — the regime they were budgeted on) **plus one dismantle at the shipped 1440×900
  arena with the default piece size**, which is the test that would have caught the stall. `trails.test.ts`'s
  range loop is `CELL_MIN..CELL_MAX`.
- Chrome: Config page at the default window and at 390×700 emulation — the sword, a 16 px sprite, a tall
  sprite, Contours; a window resize keeps the run.

## Out of scope

- Default `cellSize`, drone glyph multiplier, `Picture size` knob — #318 owner tuning, after this lands.
- A frame-budget re-measure at 4K / cell 4 (518k cells) — unchanged from today.
