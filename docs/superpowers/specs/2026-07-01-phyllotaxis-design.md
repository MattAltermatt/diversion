# Phyllotaxis — design spec (#184)

**Date:** 2026-07-01 · **Kind:** `2d` · **Size:** ~M (was S; Voronoi mesh + dep bump it)

A golden-angle spiral lattice rendered as a **filled Voronoi mesh** that slowly
**sweeps** the divergence angle — locking into interlocking Fibonacci spirals at
~137.5° and shattering into a sea-urchin burst of thin radial slivers away from it,
then re-forming. Emulates Milan Lajtoš's 2012 "Golden angle – Phyllotaxis" video
(YouTube `ZounsLXxnDw`), which forensics on its storyboard frames confirmed is a
rainbow-by-index Voronoi tessellation on white — NOT a dot plot.

## Why these calls (SME + dueling-agent synthesis)

- **Mechanic = slow angle SWEEP, not a tiny breathe.** Adversarial agent + the video
  frames agree: the shatter-into-spokes-and-reform IS the show. Grow-in intro, then a
  perpetual eased sweep that *dwells* near golden and *glides* through the shatter zones.
- **Render = filled Voronoi mesh** (via `d3-delaunay`), flat/hard-edged. The radial-sliver
  shatter is a natural consequence of Voronoi cells stretching when sites line up radially
  — you cannot get that look from dots. Per-frame retriangulation (~1000 sites, <1ms).
- **Fully adjustable look (director pick "C — hybrid, tunable").** Every look decision is a
  schema knob + a palette preset group, so the piece slides from a gallery-tuned dark
  jewel-tone default to the exact white/rainbow video look via one dropdown.
- **Constant site spacing `c·√k`** = equal-area packing; do NOT grow cell/dot size outward.
- **Seeded, closed-form.** Positions are deterministic from k; a tiny per-site angular jitter
  (seeded) softens mechanical perfection. `seed` is `randomizeOnFreshLoad`.

## Geometry (`phyllotaxis.ts`, pure + unit-tested)

- `sitePositions(count, divergenceDeg, spacing, jitter, seed) → Float64Array[x0,y0,x1,y1,…]`
  centered at origin: site k at angle `k·divergenceDeg (+ seeded jitter)`, radius `spacing·√k`.
- Disk radius `R = spacing·√count`. Render clips to a circle of the *current* grown radius.

## Motion

- **Growth intro:** `shown` ramps `min(count, shown + count/growSeconds · dt/1000)`; only the
  first `floor(shown)` sites are tessellated, so the mesh accretes from the center outward.
  `growSeconds` default 12.
- **Sweep (after full):** `divergence = goldenBase + sweepAmp · ease(sin(2π t / sweepPeriod))`
  where `ease` spends more time near 0 (dwell at golden) — use `sin` fed through a soft
  ease-out so it lingers at the extremes-are-golden midpoint. `goldenBase = 137.507`,
  `sweepAmp` default **0.9°** (visibly shatters + reforms), `sweepPeriod` default **60 s**.
  `sweepAmp = 0` → static seed head.

## Color

- `colorBy`: `index` (default — rainbow along k, matches video) | `radius`.
- Palette **group**: gradient `stops` sampled at the colorBy t; `background`; `strokeColor` +
  `strokeWidth` (the leaded-glass mesh lines; width 0 = no stroke).
- **Default palette "Nightglass":** dark plum bg `#0b0713`, jewel-tone spectral stops, thin
  dark stroke — reads as backlit stained glass on dark.
- **Preset group "Palette":** `Nightglass` (default), `Faithful (Lajtoš)` (white bg `#f4f2ee`,
  pure rainbow stops, hairline light stroke), `Mono Gold`, `Dusk`.

## Schema (calm defaults)

```text
field          ui        default     min   max   step  note
count          slider    900         200   3000  50    ~cells; legibility ceiling
divergence     number    137.507     —     —     .001  golden; sweep oscillates around it
spacing        slider    11          4     24    0.5   px per √k
jitter         slider    0.15        0     1     .05   seeded angular softening (deg-ish)
colorBy        segmented index       —     —     —     index | radius
sweepAmp       slider    0.9         0     6     0.1   ° off golden (0 = static)
sweepPeriod    slider    60          10    180   5     seconds per sweep cycle
growSeconds    slider    12          0     30    1     accretion duration (0 = instant)
speed          slider    0.6         0.1   3     0.1   global time scale (zen-slow)
strokeWidth    slider    0.6         0     3     0.1   mesh line width (0 = no lines)
background     color     #0b0713     —     —     —     6-hex
strokeColor    color     #05030a     —     —     —     6-hex
color (group)  group     spectral    —     —     —     gradient stops (8-hex, alpha ok)
seed           number    1           —     —     1     randomizeOnFreshLoad
```

## Render recipe (`index.ts`)

Each frame: advance clock by `dt·speed`; compute live `divergence`; compute `shown`; build
`sitePositions(shown, …)` → `Delaunay.from` → `voronoi([−R,−R,R,R])`; `ctx.save()`, translate
to center, clip to circle radius = current grown R; for each cell `i`: `fillStyle` =
`sampleGradient(stops, t_i)`, `voronoi.renderCell(i, ctx); ctx.fill()`; stroke the mesh once if
`strokeWidth>0`; `ctx.restore()`. Repaint full background each frame (closed-form, crisp — no
trail buffer). `update()` applies look knobs live; `count`/`seed` structural → re-setup.

## Tests

- Geometry determinism: same (count, seed) → identical positions; different seed → different.
- Golden-angle radius law: site k radius ≈ `spacing·√k` (within jitter).
- Sweep bounds: `divergence(t)` stays within `[golden−amp, golden+amp]`.
- Codec round-trip inherited from framework sweeps (auto).

## Verify (Chrome, port 5180)

Gallery tile animates · sweep visibly shatters→reforms · "Faithful" preset snaps to white/rainbow
· stroke/background/palette all live-adjustable · fullscreen + pause clean · console clean · looks
good at full size (the real gate).
