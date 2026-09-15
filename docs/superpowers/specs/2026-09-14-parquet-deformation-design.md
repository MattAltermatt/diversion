# Parquet Deformation — design spec

**Issue:** [#383](https://github.com/MattAltermatt/diversion/issues/383) · **Date:** 2026-09-14 · **Slug:** `parquet-deformation` · **Kind:** `2d`

A field of tiles that is quietly not identical: the tiling is a plain square
lattice, and the *shape of its edges* is a function of where you are on the
plane. Read across the screen, squares loosen into curling lace and back again.
Nothing jumps; the whole catalogue drifts slowly through the frame forever.

## Provenance

- **William Huff**, the Basic Design Studio, 1960–1980 — the form. Unpublished
  (Huff, *The Parquet Deformations*); described in Hofstadter, *Metamagical
  Themas*, ch. 10.
- **Craig S. Kaplan**, *Curve Evolution Schemes for Parquet Deformations*,
  Bridges 2010, pp. 95–102 — the construction this piece implements.
  <https://archive.bridgesmathart.org/2010/bridges2010-95.pdf>
- **Hans Pedersen & Karan Singh**, *Organic Labyrinths and Mazes*, NPAR 2006 —
  the growth model behind the shipped default scheme.

Clean-room: implemented from the published descriptions of the algorithms. No
code is taken from any of the above, and no Huff drawing is reproduced.

## The mechanism

Kaplan restricts the problem to isohedral tilings of topological type (4⁴) —
all tiles quadrilaterals, four meeting at each vertex — with **the tiling
vertices pinned to a plain square lattice**. Every such tiling is a systematic
modification of the *edges* of a regular grid of unit squares. So the tiling
machinery collapses to one thing: an edge curve.

- An **edge curve** is a polyline from (0,0) to (1,0) with a perpendicular
  offset `v`, parameterised by a time value `t ∈ [0,1]`.
- A **parameter space** assigns a `t` to every point of the plane. **Each edge
  reads `t` at its own midpoint.** That is the load-bearing detail: the two
  tiles that share an edge independently compute the *identical* curve, so the
  tiling is gap-free at every `t` by construction — there is no seam to police
  and no stitching step.
- A tile's boundary is its four edges concatenated: bottom and right traversed
  forward, top and left traversed in reverse. **The reversed traversal walks the
  curve from its canonical far end — it emits the same points in reverse order.
  It does NOT negate the offset.** Getting this wrong puts a straight chord
  across every tile (observed, and fixed, in the mockup).

### Parameter fields

`t = tri(f(x, y) + phase)` where `tri` is a 0→1→0 triangle wave. The triangle is
what removes the seam a one-way ramp would leave, and it is also Kaplan's own
"tent" (his Figure 4).

- **Ramp** — `f = x / rampWidth`. The canonical Huff read, left to right.
- **Radial** — `f = dist(p, centre) / rampWidth`. Concentric shells of shape.
- **Diagonal** — `f = (x + y) / (rampWidth · 1.35)`.

`phase` advances with `drift`. **Drift must not be 0 by default** — the review
guardrail on #383 is that this piece is one config value away from a static
print. It must be slow enough to be calm and fast enough that a viewer sees the
tiling *arrive somewhere else* within a minute. Owner direction 2026-09-14:
**slower than the mockup's default.** Tune in Chrome against a stopwatch, not
from the number.

### Evolution schemes

All three of Kaplan's schemes ship as a `scheme` field. They are three genuinely
different looks, not three settings of one look.

1. **Organic** *(shipped default — owner call 2026-09-14: "organic is very
   unique")*. Kaplan §5, after Pedersen & Singh. The edge grows under smoothing,
   attraction and self-repulsion with its endpoints pinned (they are tiling
   vertices). Snapshots of the sim are the keyframes; the sim is smooth enough
   that no interpolation between them is needed. **Repulsion must include the
   curve's copies one lattice step away** — every edge in the tiling is this
   same curve, so a curve that ignored them would grow through its own
   neighbour. Two traps, both hit in the mockup and both to be carried as
   comments in the source:
   - **Per-iteration displacement must stay well under the repulsion radius.**
     At `step · force > REP` a point jumps clean through what is repelling it and
     oscillates; the result is a spiky tangle, not curls. Clamp the step.
   - **A straight line is an equilibrium.** The initial polyline needs a small
     seeded perturbation (enveloped to zero at both pinned ends) or nothing
     buckles. Brownian noise is then kept tiny — what convolutes the curve is
     growth against repulsion, not noise.
2. **Grid keys.** Kaplan §3. The path walks the edges of a fine square grid;
   each step picks a cell adjacent to the path and pushes the path around it.
   The three legal local moves of Kaplan's Figure 2 fall out of one rule —
   *replace the on-path arc of the cell with the other arc* — provided the
   on-path edges are contiguous along the path. Reject any move that repeats a
   point (the path must stay simple) or moves an endpoint.
3. **Fractal.** Kaplan §4. Each segment is replaced by a similarity-transformed
   copy of the whole rule path; generations are spaced evenly over `t` and
   linearly interpolated between. Squares → jigsaw → dragon-curve tiles.

### Amplitude

`amplitude` scales the edge curve's perpendicular offset — how much of the tile
the deformation occupies rather than hugging the lattice line. Owner ask,
2026-09-14; approved at **~1.7×** for organic after driving the mockup.

Safe by construction: both tiles sharing an edge scale it identically, so the
tiling stays gap-free. Bounded above because a tile's own four edges begin to
overlap each other — measured in the mockup, the two-colour checkerboard read
collapses by 2.5×. **Slider max 2.0.**

⚠️ **A plain scale is the wrong mechanism for `grid`.** It stretches the
perpendicular grid step and leaves the parallel one alone, so the right-angle
keys stop being square and pick up off-axis edges. The rectilinear scheme's
excursion widens in *grid units* — a taller fine grid, which rebuilds the curve
rather than scaling it. Two different knobs behind one label; the schema exposes
`amplitude` for `organic`/`fractal` and a `reach` (integer grid rows) for `grid`,
each with `showWhen` on the scheme.

## Framework shape

- `kind: '2d'`. The host DPR-scales the context, so the sim draws in CSS pixels.
- **State is a keyframe stack plus a 256-entry curve LUT.** `setup` runs the
  scheme's generator once and caches the keyframes; the LUT resolves `t` to a
  curve by index. `t` is quantised to 1/256, which is imperceptible and makes
  the drift cheap.
- **The expensive generator runs only on `seed`, `scheme` and `family`.** The
  organic sim is O(n²) repulsion over tens of keyframes and cannot run on a
  slider drag — and the framework has **no debounce anywhere** between a slider
  and `update()`. So `detail` must NOT rebuild: the generator runs to its
  maximum length once, and `detail` selects how far along that stack the ramp
  maps. Every other field is a live read.
- `update(state, config, size)` therefore returns true for every field, with a
  regenerate branch for the ones that need it. No teardown, no reseeded world
  under the cursor.
- **`reach` regenerates on a slider drag, and that is allowed only because the
  grid generator is cheap** — a few dozen path pushes, no O(n²) anything.
  Benchmark it before shipping; if it is not comfortably sub-millisecond it must
  become a select, not gain a debounce. The organic generator must never sit
  behind a slider at all.
- **Per-frame cost is the open perf question.** A screen of ~200 tiles × 4 edges
  × ~160 points is ~128k points per frame, which is a lot for Canvas 2D. The
  intended mitigation is a `Path2D` memoised on the tile's four quantised `t`
  indices: under the **Ramp** field `t` depends on `x` alone, so every tile in a
  column is the identical shape and one path is stamped down the column — ~20
  distinct paths per frame instead of 200. Radial and Diagonal do not collapse
  that way and are the cases to measure. **Measure in Chrome and pick the point
  budget from the measurement**; if 160 points per edge will not hold 60 fps at
  full screen, reduce the resample count before reducing the tile count — but
  note the count must still out-sample the most convoluted keyframe, or
  resampling cuts chords across the curls (observed in the mockup at 96).

## Schema

Canon per `CLAUDE.md` §"Schema UX canon". Colours here are **distinct semantic
roles**, not a cycling palette, so they are discrete `ui:'color'` fields in a
`ui:'group'` — not a `colorList`.

| Field | UI | Section | Notes |
| --- | --- | --- | --- |
| `scheme` | `segmented` | Deformation | Organic / Grid keys / Fractal. Regenerates. |
| `family` | `select` | Deformation | Options depend on scheme; regenerates. |
| `detail` | `slider` | Deformation | How far along the keyframe stack the ramp reaches. Live. |
| `amplitude` | `slider` 0.2–2.0 | Deformation | `showWhen` scheme ≠ grid. Live. |
| `reach` | `slider` (int) | Deformation | `showWhen` scheme = grid. Regenerates. |
| `field` | `segmented` | Deformation | Ramp / Radial / Diagonal. Live. |
| `rampWidth` | `slider` | Deformation | Tiles per traverse of the catalogue. Live. |
| `drift` | `slider` | Deformation | Bounded; **not zero at default**. Live. |
| `tileSize` | `slider` | Look | CSS px. Live. |
| `renderMode` | `segmented` | Look | Fill + line / Fill / Line. Live. |
| `color.tileA` `color.tileB` | `color` | Color | The two checkerboard tiles. |
| `color.line` | `color` | Color | Stroke. |
| `background` | `color` | Color | Label `'Background'`, dark default. |
| `lineWidth` | `slider` | Look | Live. |
| `seed` | `number` | Advanced | `randomizeOnFreshLoad: true`, `collapsed: true`. |

Two preset groups: **Deformation** (one option per scheme at its good settings,
including a `Huff plate` that snaps grid-keys to the canonical ink-on-cream
read) and **Palette**. Every group must open on a *named* option against the
shipped defaults — `presetSweep.test.ts` enforces it.

## Distinct from

`penrose`, `crystal`, `hyperbolic-tiling`, `quasicrystal`, `abstractile` and
`truchet-flow` all render a **fixed** tiling and animate only the camera, the
fill, or the placement order. This is the only piece in the gallery where the
tile's *shape* is a function of position. `differential-growth` shares the
organic scheme's force model but grows one free closed curve; here the curve is
pinned at both ends, repelled by its own lattice copies, and is the boundary of
a tiling.

## Testing

Co-located `*.test.ts`. The guarantees worth pinning:

- **Gap-free tiling.** For a lattice of tiles under each field, the shared edge
  of two neighbours resolves to the identical point list. This is the keystone —
  it is what the whole "read `t` at the midpoint" design buys, and the chord bug
  the mockup hit would fail it.
- **Reversed traversal** returns the forward points in reverse order, offsets
  unchanged.
- **Grid moves stay legal** — path simple, endpoints pinned, on-path edges
  contiguous; an illegal move is rejected rather than applied.
- **Organic step clamp** — assert the per-iteration displacement never exceeds
  the repulsion radius, the invariant whose violation produces the tangle.
- **Amplitude is a pure scale** — curve at `a` equals curve at 1 with offsets
  multiplied, and the gap-free property holds at the slider's bounds.
- **Determinism** — same seed, same keyframe stack.
- Codec round-trip and seed contract come from the framework sweeps.

## Open, deliberately

- **Drift default** is a look call to be made in Chrome against a stopwatch, not
  a number chosen here. Owner has asked for slower than the mockup.
- **Slow seed cross-fade.** `tri(u + phase)` is periodic, so the picture exactly
  repeats after drifting two ramp widths — visible over a long session. A slow
  cross-fade to a fresh keyframe stack fixes it and is cheap (lerp two stacks).
  Ship it only if it costs nothing in complexity; otherwise file it.

## Mockup

`docs/mockups/2026-09-14-parquet-deformation.html` (interactive, all three
schemes) with captures for each scheme and for the amplitude sweep. Indexed in
`docs/mockups/README.md`.
