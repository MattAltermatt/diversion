# Salvage: cap a piece at a fraction of the free space — the mound then packs (#320, #321)

**Decision (owner, 2026-09-02): option B.** The cap ships as a safety net at `PIECE_FREE_FRACTION = 0.025` with
floor-`k` — it binds on no roster sprite at the shipped arena and fixes the tile's 1/696 stall. The fuller
picture (nearest-fill `k` + 0.015) was built, measured, and set aside because it halves the pieces and the
crews; #320 stays open with the mechanism in place and the fill one constant away.

**Date:** 2026-09-02 · **Issues:** #320 (fill the box further), #321 (the tile never finishes a 16 px sprite) ·
**Size:** S · **Branch:** `feature/salvage-piece-cap` · **Evidence:** a headless investigation
(bench scripts in the session scratchpad; numbers below are its).

## What the investigation found

- **#321's premise was wrong.** At the 300×190 tile with the test fixture, generation 0 completes 4/4 seeds
  in ~500 steps. Across all 92 roster sprites × 8 seeds: **1/696** stalls (`beer-mug`, 14×16, one seed).
  16×16 sprites get one cell per pixel there (9% of the free space); a 14- or 15-px-tall sprite gets two
  (38%), and that is the only class that ever stalls at the tile.
- **The drop-site search is not at fault.** Every one of the 225 `findDropSite` failures in a stalled run
  was audited against an exhaustive scan of all 2,376 anchors: **zero** had a site that existed. Not the
  ring cap, not `siteHint`, not the bbox prefilter, not standability. The last piece needed 48 contiguous
  free cells and the largest free rectangle was 71×4 — genuine fragmentation.
- **What decides it is a piece's cells as a fraction of the free area**, and the boundary sits at ≈2% in
  both arenas. Piece size alone is harmless (288-cell pieces complete 4/4 at the shipped 23% picture
  pressure); pressure alone is harmless with small pieces (52% pressure completes 4/4 at 91-cell pieces
  and 1/4 at 160-cell pieces — #320's stall).

## Mechanism

**Cap the cut at a fraction of the arena's free space**, in `buildArena` (`salvage.ts`): build the forbidden
mask first (it depends only on `geo`), count the free cells, and pass
`min(cfg.chunkSize, max(1, floor(free · PIECE_FREE_FRACTION / k²)))` to `partitionBlocks`. `PIECE_FREE_FRACTION
= 0.015` (`state.ts`). `chunkSize` stays "largest piece in picture pixels"; the cap is in cells (k² cells per
pixel), which is why it divides by `k²`.

With the cap in place the fuller picture becomes safe, so **`k` returns to the nearest whole fill of the
box** (the rule the #319 branch built and had to withdraw), under the same composition cap and one-scale
fallback.

Validated over 92 sprites × 8 seeds × {1440×900, 300×190}, floor-`k` and nearest-fill `k`:

```text
                       no cap        F=0.025      F=0.020      F=0.015
tile,  floor k        1/696 stuck    0/696        0/696        0/696
1440,  floor k        0/736          0/736        0/736        0/736
tile,  nearest fill  24/696          6/696        0/696        0/696
1440,  nearest fill  33/736         17/736       10/736        0/736
mean box fill: floor k 71–78%; nearest fill 91–94%
```

## What a viewer sees (owner veto at the merge)

- The picture fills its box: mean fill 78% → 94% at 1440×900 (a 16 px sprite 480 → 640 px; a 32 px sprite
  320 → 640 px). The same visible change #319's "round" table described.
- **Corrected by the naysayer:** at the default piece size the cap binds on **58 of 90** roster sprites on
  desktop and 64 of 90 at the tile — every 16 px sprite at 1440×900 cuts 6-pixel pieces, not 12 (free 7,416
  cells × 0.015 / k² 16 = 6). The fixture cuts into 42 pieces instead of 24 (mean mass 10 → 5.7), and at the
  default `strength` 3 a piece needs **2 drones instead of 4**; `MIN_CARRY_FACTOR` stops binding, so pieces
  move faster. The cooperative gather — "waits, with drones latched on and pulsing, until enough have
  gathered" — happens at half the scale. This is the trade the fuller picture costs, and it is the owner's
  call (see the merge hand-off). F = 0.025 binds on no desktop sprite but leaves the fuller fill unavailable
  (17/736 stalls); with floor-`k` it is a pure safety net for the 1/696 tile stall.
- Also new: the same sprite, seed and `k` cut differently on different aspect ratios (cap 6 at 1440×900,
  12 at 3440×1440, 23 at 768×1024), since `free` depends on the arena's shape. `k` already varied the cut
  by viewport; this adds aspect at constant `k`.
- `Piece size` help gains a clause: on a small arena the piece is capped so the mound can pack.

## Tests

- `salvage.test.ts`: the shipped-arena dismantle (1440×900, default piece size) now runs at `k 4` / 64 cells
  and must complete — it is the test that would have caught #320's stall; mutation-check by setting the
  fraction to 1. A cap-is-active test: at 1440×900 with the 16 px fixture the largest piece is under the uncapped 192 cells (a `largest ≤ free·F` assertion is a tautology of the formula and was replaced).
  `geometry` literals back to the nearest-fill values (16 px `k 4`, 32 px `k 2`). Layout test at 1000×600:
  `picCols 64`, hole at `7 · 4`.
- The investigator's roster sweep (scratchpad `bench320/sweep.test.ts`) re-run against the branch: 0 stalls
  at both viewports.
- Chrome: 1440×900 Play, the sword and a 16 px sprite fill their box; a tile-sized window completes a
  16 px sprite.
