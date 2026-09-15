# Caustics: sunlight refracted through a pool surface onto the floor

**Date:** 2026-09-12 · **Issue:** #338 · `kind: 'webgl'` · **Size: M** (the issue said S–M; see *Renderer*) ·
**Mockup:** `docs/mockups/2026-09-12-caustics.html` (interactive, and the source of every default below)

## What it is

The whole screen is pool floor, seen straight down. No horizon, no pool edge, no visible water surface — just
tiling and the bright web of refracted sunlight moving over it. Nothing in the gallery bends light through
matter yet.

The owner's brief, verbatim: *"something that is calm, slow, to divert your attention a bit"*, and
*"keep it slow from the get-go"* — meaning the shipped default is a crawl, not a Tempo knob you have to
find and turn down.

## Decisions, and what each one rests on

Three agents were dispatched (eventless-calm advocate, rhythmic-events advocate, naysayer briefed to kill the
piece). The naysayer returned *"build Komorebi instead; Caustics is a lava lamp at zen speed and a different
piece at pool speed."* Its claims were checked by numeric probe rather than relayed, because a verdict that
large decides whether the piece exists. **Three of its six attacks failed, two survived and changed the
design, one was rejected on its own reasoning.**

### 1. The frame: floor only (owner, A over B/C)

Rejected: a visible pool wall and waterline (more literal, but pins one composition forever), and an
underwater looking-up view (a different piece). The pool-geometry variant is **deferred to its own
`future-diversion` issue** rather than dropped — the owner's words were *"B may be neat down the road."*

### 2. Eventless, with gusts — no drips (panel, then owner)

No discrete events: no drip rings, no rain, nothing with an onset. Two independent findings agreed:

- **A drip ring collides with a shipped piece.** `hexadrop` already is *"drops land at random cells and send
  concentric rings expanding outward… overlapping ripples interfering"*, with `rain-on-glass` adjacent.
  Caustics-with-drips is Hexadrop with refraction.
- **A rhythm you can learn captures attention rather than diverting it** — you begin waiting for the next
  ring.

The rhythmic-events advocate's counter was the strongest thing either advocate said, and it is recorded here
because it constrains the design: *the inverse Jacobian already generates events for free — cusps born,
merging, annihilating — but those events are **stationary**: same rate, same scale, everywhere, forever, and
stationary statistics are what the eye discards.* That is the real failure mode, and it is what the gust field
exists to answer.

### 3. The renderer is a SCATTER, and the issue's stated mechanism is wrong

#338 says *"intensity is the inverse Jacobian of the refracted position"* **and** *"fullscreen fragment pass;
ping-pong not needed."* Those are mutually exclusive, and this is the naysayer's one fully-surviving attack.
Inverse-Jacobian intensity is defined on the **surface** grid and must be deposited at the **landing** point.
A fragment shader runs per *floor* pixel and would need the inverse map — a root-find that is **three-valued
exactly where caustics exist**, because the fold *is* the caustic.

So: one vertex per surface sample, refracted to its landing point, `gl_PointSize = 1`, additively blended into
a float accumulation buffer.

**Corrected 2026-09-14 by the round-4 plan panel.** This paragraph claimed the technique was *"a different
renderer class from every existing `webgl` diversion in the gallery, all of which are fullscreen fragment
passes"*, and made that the whole basis of the S–M → M re-size. **It is false.** Additive unit-point splat
into an `R16F` accumulation buffer followed by a resolve pass is already the renderer of two shipped pieces —
`physarum/gl.ts` and `labyrinth/gl.ts` (both `gl_PointSize = 1.0`, both `blendFunc(ONE, ONE)`, both
`R16F`/`RED`/`HALF_FLOAT`/`LINEAR`), with `galaxy-collision` adjacent. The piece may still be M — the
two-pass structure, the ray budget and the spectrum are all real work — but **the stated reason for the
resize does not survive**, and the implementation should start from `labyrinth/gl.ts`'s
`initGL`/`makeTex`/`fboFor`/`disposeGL` shapes rather than re-deriving them from a standalone HTML file.

Measured in the mockup at 1440×900: **9.6M rays/frame at 60 fps**, accumulating at 0.42× canvas with 14
rays/px. Below ~14 rays/px the floor sparkles black.

### 4. "Calm" means slow, never shallow — but the web does NOT need a fold

**Revised 2026-09-12 after the plan panel.** This section originally asserted that a crisp web requires the
surface to *fold* (`det J < 0`). That is false for the configuration that actually shipped, and the plan's
first draft encoded it as a test that would have halted the build. Measured with an analytic Hessian at
n=400–512, on every seed:

```text
config                    folds    min det    peak density gain
SHIPPED default           0.00%     +0.155           6.4x
min ripple, min depth     0.00%     +0.758           1.3x
Breezy                    4.14%     -0.735      (diverges)
```

The owner-approved default **never folds** and still reads as a pool: the web is produced by sub-fold
**contraction** of the ray bundle, not by catastrophe folds.

Read the last column carefully — the large figures there are an **artifact of the probe grid, not a property
of Breezy**. `1/|det J|` diverges at any fold by definition, so the number is only how close the densest
sample fell to the caustic sheet, and it grows without bound with probe resolution. The renderer never
evaluates it: the resolve pass applies a bounded shoulder. The sound statement is the weaker one — **a
fold-sign metric has no scale**, which is a second reason not to guard on it.

The surviving constraint is unchanged in force, only in mechanism: **amplitude must stay high enough to
compress the rays**, and only time gets dilated. At the slider floor the peak gain is 1.3x and the render is
mottle. The guard is therefore a *brightness* metric (fraction of floor at >= 2x undisturbed density),
sampled at several instants and asserted on the worst, never a fold-sign test.

Also corrected: `land = p - depth*K*grad(h)` is the **small-slope linearisation** of refraction, not Snell
as #338 and the first draft of this spec both said.

### 4a. The original argument, which still stands

The naysayer claimed *"there is no setting that is both calm and a pool"* — that a crisp web needs steep waves
and steep waves shimmer fast. **Falsified: it conflated spatial steepness with temporal rate.** Folds are a
property of the *instantaneous* surface. Four probe frames under heavy time dilation carried the identical
crisp web character with completely different detail.

**Half of it survived and is a hard constraint:** low amplitude genuinely is a lava lamp. The original probe
that established this ran at `ripple 0.004, depth 2.0` and rendered blurry mottle at 2.3x contrast — **but
those numbers are in pre-normalisation units and are NOT comparable to the table in section 4.** Taken at
face value they describe a configuration 2.3x *stronger* than the shipped one in the product that drives
everything, which would make them evidence against themselves. They predate `CURV_TARGET`; read them only as
the qualitative finding. Read that
result as a statement about **density compression**, not about folding — section 4 above corrects the
mechanism, and the numbers there supersede the "fold threshold" phrasing this paragraph originally used. The
constraint stands: amplitude must stay high enough to compress the ray bundle; only time gets dilated. A
Tempo knob is the calm control, and a Ripple knob turned down is a bug the viewer can reach.

### 5. It does not collide with `interference`

The naysayer's strongest-looking collision: *"the same generator with a different colormap; a gallery viewer
does not read Snell's law."* **Falsified visually.** The same height field colour-mapped in place is a soft
blobby wash; refracted it is a hard filamentary web. The transfer function does not tint the picture, it
replaces it. `docs/mockups/2026-09-12-caustics-chainlink.jpeg` carries the comparison, with
`2026-09-12-caustics.jpeg` and `2026-09-12-caustics-openwater.jpeg` — those three committed captures *are*
the "triptych probe" this section used to cite by a name that matched no file.

### 5a. Nor with `hopalong`, which already uses the word "caustic"

Raised twice by the naysayer and not answered until now. `hopalong`'s gallery entry sells itself as a
*"log-density caustic"* with the same bright-filament-over-dark-ground read. But it plots the visit-density
of an **iterated map**: the word is used by analogy for a tone curve. There is no surface, no refraction, no
second medium and no time-varying interface — and the two look nothing alike, because one is a space-filling
attractor whose structure is fixed by its coefficients and the other is a fluid surface that reorganises
continuously. Since section 4 retired "the fold" as the distinguishing claim, the claim is now simply
**refraction through a moving interface**, which `hopalong` has no analogue of.

### 6. "Build Komorebi instead" — rejected on its own reasoning

It recommends #356 Komorebi *because* Komorebi is a shadow mask with no fold. That is precisely the property
that makes Caustics a different picture. Both should exist; neither substitutes for the other.

## The spectrum — the thing that decides whether it looks like water

The first build gave every train the same amplitude. Focusing power goes as `a·k²`, so the **shortest
wavelength dominated by 13×**: one scale won everywhere and the owner's verdict was immediate and correct —
*"it looks like a wavey chain link fence and not waves."*

Amplitude therefore falls with wavelength, `a ∝ λ^tilt`:

| `tilt` | curvature ∝ | reads as |
| --- | --- | --- |
| < 2.0 | `λ^(tilt−2)`, short-dominant | chain-link fence — one cell size everywhere |
| = 2.0 | flat — every scale focuses equally | organic, multi-scale |
| > 2.0 | long-dominant | cracked glass — huge sparse structures, no fine detail |

Eleven trains over **1.15 m → 0.09 m**. Three further rules, each of which was wrong once before it was right:

- **Normalise on CURVATURE against an ABSOLUTE target** (`CURV_TARGET`). Strictly this is a *unit choice*,
  not physics: the shader only ever uses the product `ripple x trainsB[i]`, so the constant is a free scale
  factor. It is wrong to drop it only because `ripple`'s bounds and defaults are owner-tuned and pinned —
  with those fixed, unit-RMS normalisation drops the entire field under the brightness threshold. The
  screen goes almost blank with no error anywhere.
- **Directional spreading**: swell holds the wind line, chop fans out around it (`spread ∝ grain·(0.16 +
  1.30·f)·π`). Isotropic headings are half of what makes a lattice.
- **The gust ruffles short waves only** (`susceptibility = f^1.5`). A gust that scales every train equally
  changes brightness; a gust that scales only the chop changes the local **cell size**, which is what breaks
  the stationarity the events advocate warned about. **Author the gust field at IN-FRAME wavelength** — the
  first attempt used ~20 m gusts against a 6 m field and did visibly nothing.

## Slosh — a pool is a closed basin

Owner, unprompted and correct: *"a pool normally doesn't have waves, it just kind of splashes water back and
forth."* A pool does not carry travelling wind waves. Its long modes are **seiches** — standing waves sloshing
between the walls, with nodes that stay put. The caustic then breathes in place instead of marching across the
floor.

`slosh` is the fraction of the spectrum that stands rather than travels, **long modes first** (a basin's
seiches are its long modes; fine chop stays local and travelling).

It costs nothing, because a standing wave's time factor is uniform over the surface:

```
travelling:  h = a·sin(k·p + φ − ωt)   ->  ∇h = a·k·cos(k·p + φ + off)·w,  off = −ωt,      w = 1
standing:    h = a·sin(k·p + φ)·cos(ωt) ->  ∇h = a·k·cos(k·p + φ + off)·w,  off = 0,        w = cos(ωt)
```

Both collapse to the same **one-trig** form with a per-frame `(off, w)` computed on the CPU. Standing is free.

**`off` must be wrapped to `[0, 2π)` on the CPU.** An unbounded accumulated phase loses float32 precision
over a long unattended run, which is exactly the run this gallery is built for.

## Schema (canon per `CLAUDE.md` §"Schema UX canon")

Section **Water**: `tempo`, `ripple`, `gust`, `slosh`, `depth`, `scale`.
Section **Color**: `background`, `light`, `floor`.
Section **Advanced** (collapsed): `seed`, `tilt`, `spread`, `tileSize`.

| field | ui | range | default | note |
| --- | --- | --- | --- | --- |
| `tempo` | slider | 0 – 0.006 | **0.0010** | dilates the clock and nothing else. Ceiling is deliberate — the owner judged anything faster too fast |
| `ripple` | slider | 0.0015 – 0.026, step **0.0002** | **0.0035** | help must say a low value dissolves the web, because it does |
| `gust` | slider | 0 – 0.9 | **0.22** | |
| `slosh` | slider | 0 – 1 | **0.70** | help: "how much of the water stands and sloshes rather than travels" |
| `depth` | slider | 0.6 – 3.4 m | **1.00** | |
| `scale` | slider | 3 – 14 m | **9.6** | owner-set; 6–7 gives bigger, more varied cells and was explicitly not chosen |
| `tilt` | slider | 1.60 – 2.60 | **1.78** | label **Swell** |
| `spread` | slider | 0 – 1 | **0.28** | label **Spread** |
| `background` | color | — | **`#2f626b`** | canon name for the ground colour; the water *is* the ground. This is the sRGB of what the mockup renders — it bakes linear triples and gamma-encodes on output, so the value is uploaded as `pow(hexToRgb(c), 2.2)`. A raw upload renders a different colour than the picker shows |
| `light` | color | — | **`#fffef6`** | the sRGB of the mockup's linear `1.000, 0.990, 0.920`; uploaded as `pow(hexToRgb(c), 2.2)`, same rule as `background`. An earlier revision converted only `background` |
| `floor` | segmented | Tile / Plain / Sand | **Tile** | |
| `tileSize` | slider | 0.1 – 1 m | 0.30 | `showWhen: { field: 'floor', equals: 'Tile' }` (members are capitalised so `Segmented` renders readable buttons) — canon for a mode-dependent control |
| `seed` | number | — | randomised | `randomizeOnFreshLoad`, `collapsed: true` |

**Tiling stays faint.** Owner: *"please have the tiling a little less obvious."* Narrow grout line
(`smoothstep(0.470, 0.500)`), ~10% darkening, per-tile variation ±3%. The caustic is the subject; a hard grid
competes with it.

**Preset axes:** *Water* (Calm / Open water / Breezy / **Deep end**) × *Palette* (Pool / Deep / Lagoon). Both must open on a
**name** at defaults, not "Custom" (#311) — Calm and Pool are defined as the shipped defaults.

## Framework contract

- `update()` returns **true for every field**. Nothing here is structural: every knob is either a uniform or a
  CPU-side spectrum rebuild, so no config edit ever re-runs `setup()`. This matters more than usual —
  `ConfigScreen.update` runs synchronously on every intermediate value of a slider drag, and a restart there
  is visible under the cursor.
- `teardown(state)` **does not receive the context**, so stash `gl` in state and free the FBO, accumulation
  texture and both programs. The `webgl2` context persists on the canvas across gallery navigation, so
  unfreed resources leak.
- `gl.viewport(...)` per frame inside `frame`, against `drawingBufferWidth/Height`.
- **The ray count must be capped.** Rays scale with accumulation area, which scales with device pixels
  without bound, and `AnimationHost.tsx:180` clamps DPR to **2** where the mockup clamped to 1.75 — so the
  shipped piece runs ~31% more rays than was measured, and a 5K display would ask for 36M point primitives
  per frame. `ACC_MAX_PX` caps the accumulation buffer and the field soft-scales instead. The gallery end
  needs no budget (a tile is ~484k rays); the large end is the one that does.
- Accumulation target is **`R16F`, never `R32F`.** Float32 textures are not filterable in core WebGL2, so a
  `LINEAR` sampler over `R32F` returns **0** with no GL error and the entire caustic silently vanishes. Cost
  one debugging round in the mockup. Fall back to `R8` only if neither float extension is present.
- Rays scale with accumulation area, so a gallery tile is cheap by construction; no separate tile budget.
  ⚠️ **Corrected 2026-09-14:** the "a tile is ~484k rays" figure above is a **DPR-1** number. `AnimationHost`
  clamps DPR to 2, so a ~380 px tile is ~902k rays. Still cheap against `gpuBudget.MAX_LIVE_GPU = 6`, but do
  not re-derive a budget from the smaller figure.

## Tests

Pure logic, co-located, per project convention:

1. **`tilt` moves the long-to-short focusing RATIO, monotonically** — that ratio is
   `(LAM_MAX/LAM_MIN)^(tilt-2)`, so it is below 1 at `tilt < 2` (short waves dominate: the chain-link look),
   exactly 1 at 2, above 1 beyond. **Not** "total focusing power is invariant to tilt", which this spec asked
   for until 2026-09-12: `trainsB[i] = (amp[i]/rms) * CURV_TARGET` makes that an algebraic identity for *any*
   tilt including nonsense values, so it is a tautology. Pair it with one narrow absolute-level assertion
   whose comment states the single mutation it catches — a dropped `CURV_TARGET` factor — and nothing more.
2. **Slosh partitions long-modes-first** — the standing mask for a given `slosh` is a prefix of the spectrum
   ordered by descending wavelength.
3. **A standing train holds its phase and moves its weight; a travelling train holds its weight and moves its
   phase.** This is the one that proves the mechanism, and it can only be checked at the uniform level — a
   pixel read-back is blank, because the canvas has no `preserveDrawingBuffer`.
4. **Phase stays wrapped** — `|off| ≤ 2π` for any elapsed time, including hours.
5. **Bright enough at defaults** — assert the shipped config puts a non-trivial fraction of the floor above
   2x undisturbed density, at the *worst* of several sampled instants (at `t = 0` every standing train sits
   at its coherent peak and the figure reads 2-9x high). Not a fold test — see section 4.
6. Codec round-trip, seed contract, url-key uniqueness: the framework sweeps cover these once the folder
   exists with both `meta.ts` and `index.ts`.

## Deliberately not in scope

Drip rings and any other discrete event (§2). A visible pool edge or waterline (§1, deferred to its own
issue). Sun-angle drift. Dispersion / chromatic fringing on the filaments. Depth variation across the floor.
