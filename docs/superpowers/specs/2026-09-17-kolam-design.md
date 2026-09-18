# Kolam — design spec

**Issue:** #349. **Date:** 2026-09-17. **Size:** L. **Branch:** `feature/kolam`.

> **Revision 2 (2026-09-17) — consolidated, not stacked.** A third panellist ran the probe rather
> than reading it, and found that **Revision 1 itself contained three fabricated constants and a
> symmetry claim resting on a measurement of mine that was structurally incapable of detecting the
> defect.** Those are corrected in the body. The lesson is the one already in CLAUDE.md and ignored
> twice here: numbers authored in prose, against a document, are not measurements.
>
> **Revision 1 (2026-09-17) — consolidated, not stacked.** A three-agent panel refuted the
> foundation of the first draft: it justified the folder with four "exists nowhere else" claims,
> **three of which were false**, having been greped across two folders rather than 142. Worse, it
> *disclaimed* the one argument that actually holds. Rather than layer a correction on top — the
> failure this repo already recorded, where a long document becomes the defect source because an
> implementer greps and finds the old sentence — the body below is rewritten. There is no superseded
> layer above it. What the panel changed is listed once at the end.

**Evidence, all committed and runnable:**

| file | what it establishes |
| --- | --- |
| `docs/mockups/2026-09-17-kolam-bundle.html` | **the probe** — every rule and constant below |
| `docs/mockups/2026-09-17-kolam.html` | the **rejected** single-line construction, kept for its evidence |
| `docs/mockups/2026-09-17-refs/349-kolam/` | reference photographs |
| `docs/mockups/2026-09-17-refs/montages/montage-349-kolam.jpg` | the wider candidate set |

## What it is

A threshold drawing. On a swept courtyard floor an unseen hand lays out a symmetric figure in rice
flour — a hatched centre, broad banded rings drawn as bundles of parallel strokes, rings of small
motifs between them, spiral terminals, and a scalloped lace edge closed with a red-ochre *kaavi*
line. Drawn at pen speed from the middle outward, held, then replaced.

## Why it is its own piece — the argument, restated

The first draft argued from four rendering differences. Under a gallery-wide grep, **three are
false**, and the spec states that plainly:

| claim | verdict |
| --- | --- |
| "nothing draws along a path at hand speed" | ❌ `spirograph`, `pedal-rose`, `epicycle`, `harmonograph` all trace a pen at a user-set speed |
| "powder on a warm light ground, against a gallery of jewel-on-black" | ❌ five pieces ship warm light grounds; `sand-stroke` is grain-deposit painting on `#f4efe4` |
| "a drawing that is swept away rather than fading" | ❌ `squiral` ships `clearMode: ['fade','wipe','rolling']` with a dt-driven sweep — **and kolam's sweep is not built** |
| **bundle stroking** | ✅ **survives.** No offset-polyline / miter / bisector machinery anywhere in `src/` |

**The real argument is the one the first draft threw away.** It asserted "the composition here is
Mandala's (#49)… Kolam does not invent that". That is **wrong**, and it is the thing worth building:

- **Mandala** is one register type — rings of motifs at increasing radii, `{motif, count, angle0,
  radius, size}`, revealed by a growing alpha.
- **Kolam is a grammar.** Registers are of **two kinds** — continuous bundled **bands** that act as
  the composition's armature, and **motif rings** hung off them — closed by a **scalloped lace
  edge**, punctuated by **spiral terminals**, bounded by a **kaavi** line, with **nested** motifs
  inside motifs and **interstitial** fill computed from the actual generated radii. None of that
  exists in Mandala, and the two-kind band/ring distinction is what makes it read as a drawing
  rather than as ornament.
- **Plus a per-drawing vocabulary rule** (below), which Mandala solves only per-*style*.

So: one novel renderer, one novel generator, one novel subject. The rendering is supporting
evidence, not the case.

## Mechanism

### The grammar is fixed; the content is generated

Always, drawn outward: **centre → middle registers → terminals → lace → kaavi**. Randomising the
*structure* buys variety and spends the identity. What varies: register count (3–5), radii, band vs
motif ring, angular repeat, phase, bundle weight, motif choice, chalk, symmetry, ground.

Measured over **1000 seeds** at defaults:

```text
strokes   min 45   p5 65   p25 87   median 109   p75 139   p95 213   max 321
distinct vocabularies: 79 over 400 seeds
```

⚠️ **The sparse tail is real and must be handled.** 15.7% of draws fall below 80 strokes and 2.7%
below 60 — the thin, scattered drawing that bands exist to prevent. The piece re-rolls its seed on
every visit (`randomizeOnFreshLoad`), so a 1-in-37 bad draw *ships*, and a 12-seed sample cannot see
it — which is exactly how the first draft came to quote "73–226" for a range that is really 45–321.
**Required:** a stroke-count floor enforced at generation time (raise register count or density
until the count clears p5), with a test asserting the floor over ≥ 400 seeds.

### Two anti-mush rules — these are the design

**Per-drawing vocabulary.** Each drawing picks **2–3 motifs** and builds every register from only
those. Registers drawing freely from the full set give a stack of unrelated ornament no single hand
would have drawn — more varied, much worse.

**Per-drawing chalk set.** Identically: **2–3 chalks**, reused. A free pick per register reads as a
colour test card.

⚠️ Both are currently **aesthetic assertions, not measurements.** Before they become hard rules,
render N drawings each way and put the captures to the owner. Do not write a test that enshrines an
unfalsifiable claim.

### Symmetry — a DEFECT, not an exception

Both earlier drafts got this wrong, in opposite directions, and the second was wrong because of a
flawed measurement of my own: I tested rotational symmetry over stroke **centroids**, and a band is
a single closed stroke whose centroid sits at the origin whatever its lobe count — the detector was
structurally blind to the thing that breaks symmetry. It reported "closed structure is always
≥ N-fold". That is false.

Measured directly on the radius function, and independently over 171,638 angular-repeat events:

```text
source        events   non-multiples of N
placeRing      27386        0          correct
lace            8400        0          correct
laceNest        8400        0          correct
bandLobes      21371    12921 (60.5%)  N/2 is a DIVISOR, not a multiple
terminals       4567     1937 (42.4%)  k = 4 on any N

a band drawn with N/2 lobes, under a 2pi/N rotation: 54.00 px radius mismatch
(with N lobes: 0.00 px)

effective symmetry (gcd over every repeat), 3000 seeds per N:
N=8  {4:2719, 8:281}   ->  only 9.4% of draws are actually 8-fold
N=6  {1:692, 2:84, 3:1978, 6:246}  ->  8.2%, and 23% have NO rotational symmetry
```

**Roughly 8–12% of draws were N-fold.** The two lines are **not** equally guilty, and separating
them is the fix:

- **`k = rng() < 0.5 ? 4 : N` (terminals) was the entire defect.** A literal 4 shares no factor with
  N/2 when N is 6 or 10, driving `gcd` to **1** — no rotational symmetry at all — in 31% of draws at
  those symmetries. **Fixed:** `k = rng() < 0.5 ? N / 2 : N`.
- **`lobes = N/2` is not a defect.** It yields N/2-fold, which is a real, legible symmetry and a
  legitimate hierarchy device — a 4-fold band inside an 8-fold drawing. At N = 8 it is what every
  approved render already did, and the terminal fix leaves it untouched.

**The guarantee, measured on exact integer repeat counts** (gcd over every recorded angular repeat —
no geometry, so no quantisation or float error; two earlier geometric detectors of mine were wrong,
one of them failing its own positive control):

```text
              effective symmetry, 2000 seeds each
N=4    2:92%   4:8%      min 2  = N/2
N=6    3:92%   6:8%      min 3  = N/2
N=8    4:92%   8:8%      min 4  = N/2
N=10   5:93%  10:7%      min 5  = N/2
N=12   6:93%  12:7%      min 6  = N/2
N=16   8:93%  16:7%      min 8  = N/2
```

**Every draw is now at least N/2-fold, and never below.** 12,000 draws, zero violations — against
gcd 1 in 31% before.

**So the piece claims "at least N/2-fold, often N-fold", not "N-fold".** The help text must say so.
The test asserts `gcd(all repeats) >= N/2` over ≥ 400 seeds per symmetry; mutating terminals back to
a literal 4 turns it red at N = 6 and N = 10, so it is mutation-killable.

Open strokes remain a separate, genuine exception: the centre's parallel hatching is 2-fold at best.

### Bands are the armature

A mostly-ring draw reads as scattered. Band probability **0.58**, **≥ 2 guaranteed** — verified min
2 over **42,000 draws** (7 symmetries × 4 register counts × 1,500 seeds), zero violations. Removing
the forcing loop drops 22.9% of draws below two bands, so the guarantee does real work and the test
is mutation-killable.

⚠️ But the **0.58 is not pinned by that test** — mutating it to 0.20 or 0.95 still yields min 2
every time. The two claims need separate tests; the probability is only observable as a sweep
statistic over ≥ 200 seeds.

### Motif vocabulary

`leaf` (symmetric lens), `drop` (asymmetric teardrop — the asymmetry is what makes it read as
sitting *inside* something), `tri` (outward triangle **plus separately returned hatch lines**; the
outline wants a bundle, the hatching does not, because hatching a bundle is a solid block), `curl`
(log spiral), `diamond`.

### Density

One knob ramping **nesting** (a child motif inside each parent) and **interstitial fill** (motifs in
the bare annuli, computed from the *actual* generated radii). Default **0.45**.

⚠️ **Three of the five thresholds both earlier drafts documented do not exist.** Grepped: the probe
contains `D > 0.18`, `D > 0.62` and `D > 0.7` and nothing else. 0.34, 0.40 and 0.52 were written
into the spec and never into the code — a fabrication carried through two revisions, and exactly the
failure mode of authoring numbers in prose instead of reading them off running code.

The real behaviour, and it contains a defect:

```text
D      strokes   interstitial rings   lace 2nd-level
0.00     95.1          0.000              20.11
0.18     95.1          0.000              20.11   <- the slider's bottom 18% is a NO-OP
0.181   112.4          1.335              20.11   <- real cliff
0.62    122.6          2.133              20.11
0.621   142.9          2.154              40.21   <- real cliff
0.701   158.9          2.299              40.21   <- real cliff, previously undocumented
```

**Required:** remap so the bottom of the slider does something, and document all three real gates.

## Rendering

### Bundle stroking — the novel renderer

⚠️ **The load-bearing parameter is the gap : width RATIO.** At **1.2×** the strokes fuse into one fat
band and the effect is invisible with the mechanism correctly implemented; at **~4×** they read.
Shipped default: width 1.9, gap 7.0 — a ratio of **3.68**, so the help text must say 3.68 or the
defaults must move. *This is a perceptual constant: it is a Chrome-verify value, not a suite
assertion, and any test of it is a tautology of the two defaults.*

⚠️ **And the 4× only holds for BANDS.** Per-feature `gapScale` puts every other bundle at or below
the 1.2× figure quoted as the failure case: lace 2.03, centre 1.55, terminal 1.47, motif ring 1.25,
interstitial 1.11. Either the 1.2× "fuses into one fat band" number is wrong, or the motif bundles
are all in the failure regime and nobody noticed because they are small. Resolve before the plan —
it invalidates one of the two numbers the renderer is specified by.

⚠️ **Spread is `(count − 1) · gap` and must scale with the feature.** Six strokes at the ring's gap
spread ~45 px, wider than the centre square's 57 px radius — the square's bundle swallowed the
square. Every small motif carries its own count and gap scale.

⚠️ **Both `gap` and `lineWidth` are normalised by `Rmax / 400`.** That shared factor is what makes
the ratio scale-invariant at the framework's arbitrary canvas sizes. Keep it or the rule above
silently stops holding.

Offsetting a polyline is **not** "move each point along its normal":

- vertices move along the **angle bisector** scaled by `1/cos(θ/2)` (a miter). ⚠️ **`MITER_CAP` is
  redundant and the spike rationale was wrong.** The line above it — `1 / Math.max(0.2, …)` —
  already bounds `scale ≤ 5`, so removing the cap cannot produce an unbounded miter; and a true
  hairpin is caught by the `bl < 1e-6` guard, yielding an empty path rather than a spike. Measured
  at shipping settings: removing the cap moves **395 of 660,983 vertices (0.06%)** by at most
  **2.38 px**. Keep the `0.2` floor — that is the real bound — and stop justifying 3.2;
- where the offset exceeds the local **radius of curvature** the curve turns inside out and traces a
  loop backwards; culled by testing each offset segment against its source direction. ⚠️ **The cull
  is partial:** it removes ~34% of self-intersections, and **29.1% of bundle strokes still
  self-intersect with it on**. "Left in, every tight motif grows a bow-tie" overstates what turning
  it off does and understates what remains.

⚠️ `offsetPath` returns `[]` below 3 surviving points, so an even bundle count makes a straight
2-point stroke **vanish silently**. Hatch and centre-frame lines bypass `bundle()` for this reason.
Assert it.

### Ground

**fbm → domain warp → `sin(f·k)`**, mildly **anisotropic at 17:15**. ⚠️ **The probe's comment —
"x ≈ 3.4× coarser, bands run across the frame" — is wrong in both magnitude and DIRECTION.** Its
code spans 17 units across the width against 15 down the height, so x is sampled *finer* and the
bands elongate **downward**. Measured, aggregated over 6 seeds × 6 offsets: faithful `fx/fy = 1.146`,
isotropic `0.996`, the comment's 3.4 `3.377`. A single scanline cannot see it (per-line ranges
overlap completely) — a draft of the plan measured on one line, concluded it was unseparable, and
deleted the test. Aggregate, and assert `fx/fy` within 1.10–1.60. The domain warp is what
makes the bands braid rather than merely wobble.

⚠️ **Use `framework/rng.ts`** — `mulberry32` and `makeNoise3D` (at fixed z, remapped from `[-1,1]`
to `[0,1)`; get that remap right or the fbm normalisation is silently half-scale). CLAUDE.md is
categorical and the Lichen `>>` bug is why. The probe hand-rolls both; the port must not.

⚠️ **Seed the ground.** The probe hardcodes three fbm seeds, so every drawing at every seed sits on
the identical floor.

⚠️ **The probe's 63–75 ms build was measured at 1.5 Mpx because the probe chooses its own DPR.**
`AnimationHost` fixes `dpr = min(devicePixelRatio, 2)` and hands a 2D diversion CSS pixels — 1440×900
at dpr 2 is **4.2 Mpx, 2.8× the probe**, so the honest figure is **~200 ms**. State the resolution
each offscreen layer is built at (half-res is fine and is what the probe does), recover dpr the
shipped way (`ablation/render.ts`'s `ctx.canvas.width / w`), and **include `background` in the ground
cache key** — the probe keys on `ground|W×H`, which with a free-form hex is a stale-cache hit.

### Powder

Streaks along the **tangent** with jittered length, weight, opacity and angle, offset perpendicular
so the edge frays. A stamped disc knows nothing about which way the hand was going.

### Colour

Chalk lands on **motif rings only**. Bands, centre frame and lace are always rice white — verified 0
violations over 400 seeds at `colouredChalk 0.95`. A band in coloured chalk is simultaneously the
lowest-contrast form the generator can make and the line the eye reads the composition from.

⚠️ **Contrast is a stated, deliberate exception to invariant #5, and the spec owns it rather than
labelling it away.** Measured (SC 1.4.11, 3:1):

```text
                concrete   earth   ochre  |  dusk   slate
rice flour          3.07    3.99    2.88  | 12.13   12.04
kaavi               2.01    1.55    2.15  |  1.96    1.95
gold  #e8b43c       1.79    2.32    1.67  |  7.05    7.00
red   #d9604a       1.08    1.20    1.15  |  3.66    3.63
cream #f0e3b0       2.64    3.43    2.48  | 10.44   10.36
```

Three facts the owner is choosing between, stated up front:

1. On the warm grounds **nothing clears 3:1**, including the white structure on ochre (2.88) — so
   the "white carries the composition" argument is false *on that one ground*.
2. **The kaavi is 1.55–2.15 on every warm ground** and is the compositional terminator. It is the
   second-least-visible element in the piece.
3. **A passing configuration already exists and is built.** On `dusk`/`slate` rice flour is 12:1 and
   every chalk clears 3:1 (7.05 / 3.66 / 6.63 / 6.70 / 6.36 / 6.45 / 10.44).

⚠️ **Correction to both earlier drafts.** The "dusk: green 3.02, yellow 6.34, cyan 4.56, magenta
3.33; red, blue, purple do not pass" line was wrong twice over: those are `FILLS`, not `CHALKS` —
the wrong palette for an argument about *lines* — and they are FILLS at an **unstated pastel of
0.10**. At a pastel of 0.45 every colour clears 3:1 on dusk (4.37–8.17), so "red, blue and
purple do not pass" is false at the settings the piece ships with. Also: the rice-flour row in that
table was ~1% low throughout, having been computed against `L = 0.8894` when `POWDER #f7f3ea` is
`L = 0.8982`. The corrected row is 3.07 / 2.88 / 3.99 / 12.04 / 12.13.

⚠️ **One counterexample to "no chalk clears 3:1 on a warm ground":** `#f0e3b0` on `earth` is
**3.43**. It is a pale cream rather than a saturated chalk, so the spirit holds, but the sentence as
written is falsifiable — say "no saturated chalk".

**Decision (owner, 2026-09-17): `concrete #8e8b84` is the default**, chosen from a rendered A/B at
one seed (`docs/mockups/2026-09-17-kolam-ground-ab.jpeg`). It is warm, the white armature clears
3:1 at **3.07**, and unlike ochre it does not share a hue with the palette's turmeric and cream —
on ochre those chalks vanish into the floor. An earlier draft of this section defaulted to ochre
and argued "warm vs dusk", which was a strawman: a warm ground that passes was available all along.

**The residual exception is narrower:** The piece is a drawing on a daylit floor; that is the
subject, and the owner has approved every warm-ground render. `dusk` ships as a preset. This is a
look decision knowingly taken against a computed invariant, in a place where no test looks —
recorded here so it is a choice and not an oversight.

⚠️ **Pastelling makes it worse before better** — blue on ochre 2.48 → **1.09** at pastel 0.45 → 2.66
at 0.95, because contrast against a fixed ground is V-shaped in luminance and pastel walks the
pigment *into* the minimum. Do not "fix" contrast with pastel. (Kept as the reasoning; the `pastel`
field itself is **cut from v1** along with `cellFills` — see the plan's accepted risk 2.)

**Cell fills — CUT FROM v1** (plan accepted risk 2); kept here as the reasoning for the follow-up. Reject **thin** regions as well as small ones, or the channels
between bundle strokes fill as coloured hairlines threading the band; and reject **big** regions by
**absolute size against the drawing's radius**, not as a fraction of the canvas — the open field
inside a band is ~6% of the canvas and sails past an `n * 0.25` cap, filling as a flat slab.

## Live-apply, resize, determinism

### `update()` per field — the framework has NO debounce

⚠️ The probe routes every knob through a **110 ms debounce**, which CLAUDE.md forbids relying on
(a diversion-side quiet period never fires on a paused Config preview). In the framework, **every
intermediate value of a drag** hits `update()`. A port that returns falsy re-runs `setup()` plus the
~200 ms ground build on every pointermove, restarting the drawing under the cursor — Salvage #319.

| live via `update()` | structural (returns false, full `setup()`) |
| --- | --- |
| `background` / ground, `holdSeconds`, `penSpeed` — ⚠️ `palette`, `kaavi` and `colouredChalk` MOVED to structural: stroke colour is baked at build time and powder is already rasterised, so recolouring mid-draw never heals | `seed`, `symmetry`, `registers`, `density`, `strokesPerBundle`, `bundleSpacing`, `lineWidth`, `grain`, `handWobble` |

`lineWidth` / `grain` / bundle count are honestly structural: they cannot retroactively change
powder already deposited.

⚠️ **Colour runs on its own RNG stream, and that is a correctness requirement.** `chalkFor` consumes
one draw when it returns white and two when it returns a chalk, interleaved with `wobble()`. Sharing
the main stream made `colouredChalk` re-generate the **geometry** in **101 of 200 seeds** — a colour
slider silently re-rolling the drawing. Fixed and verified: **0 of 200**. Any future colour field
draws from `colRng`.

**Required:** a **golden draw-order vector**. Transposing two `rng()` calls changes every world with
the whole suite green.

### Resize

`resize` is ResizeObserver-driven with no debounce and fires on container reflow and fullscreen. The
probe restarts the drawing; that would wipe a drawing on entering fullscreen. **Decide and state:**
rescale composition + ink layer, or restart.
**DECIDED (plan Task 10): re-composite at a fixed `Rmax`.** An isotropic rescale by
`k = min(W',H')/min(W,H)` is well-defined and was the real alternative; it was rejected for
resampling rasterised 2 px streaks into a visible seam and for rebuild cost under an undebounced
ResizeObserver — not, as an earlier draft argued, because "there is no single factor". There is.

### Determinism

The drawn picture must be independent of how the draw is chunked. Two mechanisms, both already
wrong once: **carry the sub-step remainder** (stepping by `min(budget, step)` places an extra,
partially-offset stamp at every frame boundary — 0.47% more ink), and **seed each stamp from its own
index** (one RNG per `advance()` call makes the grain a function of the call pattern).

⚠️ **A determinism test that compares only "1 call vs 20 calls" PASSES AGAINST THE BROKEN
VERSION** for 3 of 4 seeds. The regime that actually kills both mutants is **per-frame chunking at a
realistic `dt`** (~3,500 frames at 60 fps, including the 50 ms clamp). Include it, or the test is
one of the green-and-worthless ones this repo already has a rule about. Under the restored bug,
per-frame chunking shows **+12% stamps** — a far stronger and cheaper signal than the ink-pixel
delta, which is only +0.17–0.21% (the "0.47%" both drafts quoted was not reproduced).

⚠️ **The verification as first written cannot run in CI** — jsdom has no rasterizer and
`test-setup.ts` stubs `getImageData`. Restate the test over the **stamp stream** (index, x, y,
tangent, colour, seed) under deliberately irregular chunkings. That form is fully mutation-killable
and both named mutants die.

## Schema (canon #256)

| field | ui | section | notes |
| --- | --- | --- | --- |
| `symmetry` | `slider` 4–16 step 2 | Composition | **not `number`** — bounded uis need `meta.min`/`max` |
| `registers` | `slider` 3–6 | Composition | the maximum; each draw picks 3..this |
| `density` | `slider` 0–1 | Composition | default 0.45 |
| `strokesPerBundle` | `slider` 1–10 | The hand | default 6 |
| `bundleSpacing` | `slider` 1–20 | The hand | **bounds required**; normalised by `Rmax/400`; help states the ratio |
| `lineWidth`, `grain`, `penSpeed`, `handWobble`, `holdSeconds` | `slider` | The hand | all need min/max (invariant #4) |
| `background` | `color` | Color | label `'Background'`; see ground note below |
| `palette` | `colorList` | Color | **lowercase field name** (33 diversions do this); the chalk set |
| `kaaviColor` | `color` | Color | distinct semantic role |
| `kaavi` | `toggle` | Color | **`toggle`, not `boolean`** — `boolean` is not a `FieldUi` |
| `colouredChalk` | `slider` 0–1 | Color | default 0.40 |
| `seed` | `number` | Advanced | `randomizeOnFreshLoad`, `collapsed: true` |

⚠️ **RESOLVED (plan Task 7):** `background` is one colour with warm/dark derived from it in OKLab, plus a `groundGrain` amplitude. The original text follows for the reasoning.

⚠️ **The ground was unresolved at Revision 2.** The probe's ground is an enum
of `{base, dark, grain, warm}` — four values driving a gradient plus a noise amplitude — and every
contrast number above was measured against that structure. A single `background` hex cannot express
it. Either derive warm/dark/grain from one hex (state how) or declare the extra fields. And a
`Ground` **preset group wrapping a single enum is the anti-pattern #363 just added to CLAUDE.md** —
two controls, same name, same options, same effect. `presetSweep.test.ts` additionally requires every
group to open on a **name** at defaults or carry a declared `UNMATCHED_AT_DEFAULTS` reason.

## Testability — what can actually catch a regression

**Mutation-killable:** ≥ 2 bands (structural); chunk-independence over the stamp stream; the miter
**bound**; cusp culling; each density threshold as presence/absence either side; bundle spread and
per-motif gap scale; closed-structure symmetry as a multiple of `N`; chalk-never-on-structure; the
stroke-count floor; `colRng` isolation (mutate it back to the shared stream and the geometry-stability
test must go red).

**NOT testable as written — say so rather than writing a green, worthless test:** the 4× gap:width
ratio (perceptual, and `default gap / default width ≈ 4` is a tautology); `MITER_CAP` as a *value*;
band probability 0.58 except as a sweep statistic over ≥ 200 seeds; exact stroke counts (assert
monotonicity in density over a pinned seed set); wall-clock timings.

## Out of scope

The sweep (**unbuilt — and no longer claimed as a distinguishing feature**; design it as a follow-up
or accept the hard cut). Hexagonal/triangular lattices. A visible *pulli* armature. Making the
single-line construction one register's texture.

⚠️ Those last three all require the **rejected** graph-on-a-lattice construction, not this polar
grammar. They are a second architecture, not increments — do not sell them as increments.

**Ship dependencies:** `docs/gallery.md` entry and the README count line (enforced by
`.claude/hooks/diversion-count-guard.sh`), and the `meta.ts` + `index.ts` spread pair — an
`index.ts` with no `meta.ts` vanishes from the gallery with no type error.

## Rejected: the single-continuous-line construction

Dots are the **vertices** of a grid graph, the cells between them its **edges**; a spanning tree
merges every dot's circle into exactly one closed curve. Verified: 121 dots → 120 merges → 1 closed
line, 484 arcs (= 121 × 4), every node degree 2. The boundary needs no special case.

Not the piece: every part is the same quarter-arc at the same scale, so it yields one uniform
loop-weave and can never produce registers or motif variety. A *random* spanning tree also reads as
a wandering maze.

⚠️ Correction to the first draft: it said "this generator family already ships as Celtic (#89)".
Celtic is a **45° billiard producing many loops**, not a spanning-tree merge into one curve. The
*visual family* claim holds; the algorithm claim does not.

## What the panel changed

1. **Three of four novelty claims deleted**; the argument moved to the composition grammar, which
   the first draft had wrongly conceded to Mandala.
2. **Size M–L → L.**
3. **Symmetry constraint rewritten** from "always a multiple of N" to the measured, scoped truth.
4. **A real bug found and fixed** — `colouredChalk` re-rolled the geometry in 101/200 seeds.
5. **Variety re-measured** at 1000 seeds (45–321, not 73–226) and the **sparse tail** given a
   required floor.
6. **Contrast exception made an explicit owner decision** rather than a risk bullet.
7. Schema corrections: `toggle` not `boolean`, `bundleSpacing` bounds, `symmetry` as slider,
   lowercase `palette`, ground left flagged as unresolved. (`pastel` was restored here and then
   **cut entirely** with `cellFills` — see the plan's accepted risk 2.)
8. `framework/rng.ts` mandated; ground seeded; perf restated at the real canvas size.
9. Determinism test restated over the stamp stream so it can run in jsdom.
10. `update()`-per-field table, resize policy, and the golden draw-order vector added.

**Revision 2, after the third panellist ran the code:**

11. **Three density thresholds (0.34 / 0.40 / 0.52) never existed** — fabricated in prose and
    carried through two revisions. The real gates are 0.18 / 0.62 / 0.70, and the slider's bottom
    18% is a no-op.
12. **Symmetry: my own correction was wrong, twice.** A centroid-based detector cannot see a band's
    lobe count; a second point-cloud detector failed its own positive control. Measured exactly on
    integer repeat counts, the defect was **one line** — terminals at a literal `4`, which drives
    gcd to 1 at N = 6 and 10. Fixed to `N/2 | N`; every draw is now ≥ N/2-fold over 12,000 draws.
    `lobes = N/2` is kept — it is a hierarchy device, not a bug.
13. **`MITER_CAP` is redundant** — `Math.max(0.2, …)` one line above already bounds it, and the
    "spike across the picture" rationale is false.
14. **The dusk contrast numbers were the wrong palette at an unstated pastel**; at shipping defaults
    every colour passes on dusk. The rice-flour row was ~1% low.
15. **The 4× gap:width ratio holds only for bands**; every motif bundle sits at or below the quoted
    failure threshold.
16. **A 1-call vs 20-call determinism test passes against the broken version** — per-frame chunking
    is the regime that kills it.
17. The cusp cull is **partial** (29% of strokes still self-intersect), and the ≥2-bands test does
    not pin the 0.58 probability.
