# Salvage: a Drone size knob (#318 remainder)

**Date:** 2026-09-02 · **Issue:** #318 ("can everything be scaled down") · **Size:** XS ·
**Branch:** `feature/salvage-drone-size`

## What is left of #318

The trails half shipped (`ca0643e`, a render-only fine field). The picture half is bounded by the mound's
packing (#320). The cell is now derived from the viewport (#319, `28f6d0b`), so the arena cannot be made
finer by a knob. The one "scale it down" lever left is the **drone glyph**, which draws at a fixed fraction
of the cell (`render.ts` `drawDrones`: body 0.45 of a cell, legs 0.55, line width 0.08).

## Design

- **`droneSize`**: `z.number().min(0.6).max(1.5).default(1)` (the naysayer: 0.5 on a 4 px cell is a sub-pixel body), section **Colony**, `ui: 'slider'`, step 0.05,
  label **Drone size**, help: *"How big a drone draws, as a multiple of its natural size. Looks only — the
  colony, its speed and its reach are unchanged."*
- **Render only.** `drawDrones` computes `g = cell · droneSize` and hands `g` to the glyph painters (`dot`,
  `spider`, `ant`) and the line width; positions still use the cell (`d.x · cell`). Nothing else reads it —
  not `HOME_NEAR`, not the latch distance, not the trail deposit. A drone is a point; the glyph is a picture
  of it.
- **Live.** `applyConfig` already stores a non-structural `cfg` and returns true; no rebuild, no `dirty`
  (drones draw on the main canvas every frame, not into a cached layer).
- **Default 0.8.** The owner delegated the number ("whatever makes sense"); judged from three captures at
  1440×880 (`docs/mockups/2026-09-02-salvage-drone-size-{100,080,065}.jpeg`): at 1.0 the spiders read as
  creatures, at 0.8 they still do, at 0.65 they are specks and the shape is gone. 0.8 is the visible step
  toward #318's "smaller" that keeps legibility. Old share links carry no `droneSize` and so decode to 0.8.
- URL: a plain number leaf, full-snapshot codec, nothing special. Presets: none names it (a `Palette` group
  is not a place for a glyph size).

## Tests

- `render.test.ts`: with the recording context, the `Spider` body ellipse radius at `droneSize 0.75` is three
  quarters of the radius at `1`, and the drone's position (translate) is unchanged — proves the scale reaches the glyph
  and not the placement. Every glyph still renders and leaves `globalAlpha` at 1.
- `schema.test.ts` / meta sweeps: bounds present, help present (automatic).
- Chrome: drag Drone size on the Config page — glyphs grow and shrink in place, no rebuild (mound kept).

**Phone note (naysayer, kept for the Chrome session):** #319 derives cell 4 on a portrait phone, so a drone body is 1.8 px there at 1.0 — smaller than the 4.5 px it had at cell 10. If the owner wants phones bigger, the mechanism is a glyph-pixel floor, not this knob.

## Out of scope

Picture size (#320 first), seam width, trail width (already ~2.5 px).
