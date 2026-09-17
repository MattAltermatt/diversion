# Lichen — design spec

**Issue:** #358. **Date:** 2026-09-17. **Size:** M. **Branch:** `feature/lichen`.

> **Revision 2 (2026-09-17) — consolidated.** Revisions 1 and 2 were folded into the body rather
> than stacked on top of it. A panel found that Revision 1's header refuted seven claims the body
> still asserted verbatim, which is how a long document becomes the defect source: an implementer
> greps, finds the old sentence, and builds it. What changed across both rounds is listed once under
> **What the panels changed**, at the end. Believe this body; there is no superseded layer above it.

**Evidence, all committed and runnable:**

| file | what it establishes |
| --- | --- |
| `docs/mockups/2026-09-17-lichen-tide.html` | the probe — carries every approved constant, plus a `window.__probe` hook |
| `docs/mockups/2026-09-17-lichen-longrun-storms.mjs` | the second-act table below |
| `docs/mockups/2026-09-17-lichen-longrun-tide.mjs` | the **rejected** moving-waterline design's evidence |
| `docs/mockups/2026-09-17-lichen-seedsweep.mjs` | per-year coverage extremes, per seed |
| `docs/mockups/2026-09-17-refs/358-lichen/` | reference photographs (see the caveat in Provenance) |

## What it is

A sea cliff colonised by lichen, seen close up, over centuries. Five species arrive as scattered
founders, spread outward at their own rates, and stop where they meet each other — the rock fills
with a mosaic of contested borders, each patch outlined by a dark contact margin. They sort into
**horizontal bands** by height above the water, because that is what sets how much salt spray
reaches them: black at the fringe, orange and yellow through the splash zone, grey and pale green in
the dry zone above. Quartz veins and smooth unweathered faces run through it all, and nothing ever
grows on those.

Every few decades a **storm** scrubs part of the cliff. It is an event you watch, not a cut: a sweep
spirals through the struck area over several seconds, stripping as it goes and leaving a sparse
remnant behind, and then the race to refill starts again from whatever survived.

## Provenance

The mechanism's motivation and the habitat are documented. **The code is not an implementation of
the cited model**, and this section says so explicitly rather than implying otherwise.

- **Competition — motivation, not description.**
  [Competition on the Rocks: Community Growth and Tessellation](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0012820)
  (PLOS One) models colonies nucleating at points and growing radially at species-specific velocity,
  with boundaries holding where fronts meet — a **Johnson–Mehl tessellation**. That is where the
  idea comes from. ⚠️ **What this piece implements is not Johnson–Mehl.** It is stochastic
  single-neighbour lattice invasion with a per-cell acceptance probability — an **Eden / Richardson**
  growth process, whose fronts are lattice-rough rather than conic, and whose `lobe` term varies
  growth by *location* rather than giving each colony a velocity of its own. Cite the paper for the
  idea; do not describe the code as Johnson–Mehl.
- **Boundaries hold; nobody eats anybody.** Armstrong's
  [Competition in lichen communities](https://www.researchgate.net/profile/Richard-Armstrong-17/publication/43626955_Competition_in_lichen_communities/links/65e97cefadf2362b637d2710/Competition-in-lichen-communities.pdf)
  and [Competitive equivalence in a community of lichens on rock](https://link.springer.com/article/10.1007/BF00329040)
  (Oecologia) find many species pairs competitively equivalent, producing stable contact boundaries.
- **The contact margin is the look's signature.** The common name *map lichen* belongs to
  **[*Rhizocarpon geographicum*](https://en.wikipedia.org/wiki/Rhizocarpon_geographicum)** — named
  for the dark lines that make a colonised rock read like a political map. (An earlier draft of this
  spec attributed that name to *Xanthoria parietina*, which is wrong; *Xanthoria* is the common
  orange or yellow wall lichen.) The piece draws those margins, and they are what make five species
  of similar value legible against one another.
- **Zonation.** [MarLIN: Yellow and grey lichens on supralittoral rock](https://www.marlin.ac.uk/habitats/detail/96/yellow_and_grey_lichens_on_supralittoral_rock)
  and the [British Lichen Society](https://britishlichensociety.org.uk/conservation/seashore-habitats)
  give the band sequence and that **wave exposure sets band width**.
- **Substrate.** Rock type, texture and **degree of weathering** control what can colonise at all;
  quartz and smooth unweathered faces resist it, and early colonisation aggregates in cracks. That
  is what the sterile ground models.
- ⚠️ **Reference photographs caveat.** The five images in `358-lichen/` are inland and montane
  saxicolous lichen — *Rhizocarpon geographicum* on Czech quartzite, *Rusavskia elegans*,
  *Lecanora campestris*. **None is a sea cliff and none shows any of the five species below.** They
  are evidence about thallus form, contact margins and palette; they are **not** evidence about
  supralittoral zonation, and must not be cited as endorsing the zoned composition.

## The species

| species | growth form | zone | wetness band | colour | rate |
|---|---|---|---|---|---|
| *Verrucaria maura* | crustose | littoral fringe | `0.72 – 1.00` | near-black `#1a1916` | 1.00 |
| *Caloplaca marina* | crustose | splash | `0.46 – 0.80` | orange `#d66a1a` | 0.86 |
| *Xanthoria parietina* | **foliose** | upper splash | `0.33 – 0.62` | yellow `#e2a830` | 0.74 |
| *Lecanora atra* | crustose | upper splash | `0.16 – 0.44` | pale grey `#b0b4ac` | 0.60 |
| *Ramalina siliquosa* | **fruticose** | dry zone | `0.02 – 0.28` | grey-green `#8a9880` | 0.52 |

**The bands overlap deliberately** — the overlap is what creates contested margins instead of five
clean stripes.

⚠️ **Two of the five are not crusts**, and the piece renders all five as flat cells. *Xanthoria* is
foliose (leafy lobes) and *Ramalina siliquosa* is fruticose (a tufted shrub — "sea ivory"). The
flat-mosaic conceit is therefore accurate for three of five. This is a **known, accepted
simplification**, not an oversight: see Accepted risks.

## The mechanism

A grid of cells, each bare, sterile, or held by one species, plus a per-cell wetness fixed when the
rock is built.

### Wetness sorts the species

`wet` falls off exponentially with height above a **fixed** water line, over a reach set by
`exposure`; the rock's relief perturbs it locally so band edges wander.

**The water line does not move, and two measurements say so.** A *daily* tide is unrepresentable —
at 40 years/minute one cycle is ~40 ms of screen time and aliases into per-frame jitter (built,
shown, rejected as "rough on the eyes"). A *slow multi-year* swing was then measured over 800
simulated years and changed nothing: coverage pinned at ~100% from year 60 and shares froze at
25/15/14/25/20 for seven centuries. The swing was ±16 rows against bands 30–50 rows wide.

⚠️ Note *why* that second experiment came out flat, because the reasoning is what a future pass will
reopen: a living cell is never displaced, and habitability is fixed at build time, so a moving
waterline had **no mechanism to act through**. It did not test "does a moving waterline help"; it
tested "does it help given that nothing can displace a living organism". Keep the conclusion, but do
not cite the 800 years as proof of more than that.

### Habitability

A **tent** inside the species' band — `0.72 + 0.28·(1 − |w − mid| / half)`, peaking at 1.0 at band
centre and falling to 0.72 at either edge — then a **discontinuous step** down to a shoulder
`max(0, 1 − d/0.11) · 0.55` outside it, reaching zero 0.11 beyond the edge. The step from 0.72 to
0.55 is deliberate: it keeps a species near its zone while letting it hold a contested margin. It is
**not** a plateau, and die-back's `stress > 0.46` threshold (i.e. `h < 0.54`) sits immediately below
the shoulder's top.

### Growth, and the invariant

Bare, non-sterile cells adjacent to an occupied cell may be taken by that neighbour's species with
probability proportional to `rate × habitability × lobe`.

**The invariant is that a LIVING cell is never overwritten in place — only bare cells are claimed.**
That is what produces the map pattern. Note what it does *not* say: cells **do** change species over
time, because die-back and storms return them to bare and whoever arrives next may be somebody else.
"A cell once taken is never reassigned" is false, and a test asserting it would either fail or have
to disable die-back, at which point it guards nothing.

### Die-back

With the water line fixed, habitability does not change **on its own**, so die-back is not a
response to a moving environment. Its job is narrower: growth pushes into the *shoulder* of a
species' range, and die-back prunes that overreach so band edges stay crisp rather than bleeding
over centuries.

⚠️ **It does change when the viewer moves a slider.** `exposure` and `relief` recompute `wet` in
place, so dragging either shifts habitability and *will* start a die-back wave that kills living
lichen over the next few seconds. That is intended — the bands are meant to migrate when you change
the shore — but it means the "do not clear living cells" rule that guards `bareRock` does **not**
apply here, and a Chrome check asserting "living lichen is not cleared under the cursor" would be
true at the instant of the drag and false two seconds later. Verify the two paths differently.

### Sterile ground

A fraction of the rock (`bareRock`, default 12%) can never be colonised — quartz veins and smooth
unweathered faces. Two fields rank every cell (a ridged-noise **vein** field and a mid-frequency
**speckle** field), blended by `veinStyle`, and thresholded **against a histogram** to hit the
requested fraction. ⚠️ The threshold must be a histogram, not a fixed noise cutoff: a mostly-zero
field cannot supply the requested fraction, the threshold collapses to 0, and `f >= 0` marks the
**whole rock** sterile. That shipped once in the probe and is why the vein field ranks continuously.

Sterile ground never heals, so it stays visible through every storm and regrowth and gives each seed
a permanent signature. It also guarantees bare stone is always on screen, which is what the earlier
100%-coverage behaviour destroyed.

### Storms — the second act

Every `stormEvery` years ± a wide jitter (mean multiplier 1.15), a storm begins. **A storm is an
event with duration, not an instantaneous mask.**

- Severity `0.04 + u^2.4 × 0.92`. **~54%** of storms fall under a quarter strength (analytic and
  2M-draw Monte Carlo agree); median severity **0.214**. Not 70% — an earlier draft said so, and a
  skew test written to 70% would fail and invite "fixing" the exponent to ≈4.14, which would change
  the distribution the second act depends on.
- The struck region is a **mask** — every shape costs the same, which is what the Whimsy control
  spends. **Natural:** `band`, `plume`, `spatter`, `slab` (fracture-jittered at two scales — a clean
  rotated rectangle reads as geometry, i.e. as whimsy, which the natural family must never do),
  `swath`. **Whimsy:** `checker`, `smiley` (carve the *features*, not the disc), `spiral`, `dots`,
  `bite`.
- The sweep **spirals** out from the storm's centre, ~2.6 revolutions over the storm's life, with
  noise so the front is ragged rather than a clock hand. Duration `1.4 + sev × 4.2` simulated years,
  so a scratch is over in ~2 s and a cliff-taker grinds for ~7 s at default tempo.
- **~8.5% of struck lichen survives**, scattered. Beyond looking right, this is load-bearing: total
  clearance made every recolonisation restart identically, whereas survivors mean each regrowth
  begins from a different scatter.
- One storm runs at a time; the next one's clock starts when the current finishes.

**Measured, storms on, 800 simulated years, defaults:**

```text
years  cover%   storms
  120    99.9        5     fully colonised
  180    20.5        8     one storm strips 71.8% in a single event
  240    82.2       10     recolonised
  400    87.1       17
  800    62.6       38     Verrucaria 9.3%, down from 25% — territory changes hands
```

Across 12 seeds sampled every simulated year, coverage ranges **41.0–97.8% at worst** and never
pins. This is the evidence the piece has an indefinite second act, and the claim most worth
re-checking if anything about storms changes.

### Contact margins

Where a cell touches a cell of a **different** species (4-neighbourhood, symmetric — checking only
right and down would put the margin on one side of each border), it darkens by `margins`. Default
**50**, owner-approved. Without it the frame is ~81% adjacent greys and the mosaic dissolves into a
wash; the margin makes similar values legible without touching a single species colour, and it is
the reference photographs' signature feature.

## Framework shape

`kind: '2d'`, `src/diversions/lichen/` with `meta.ts` **and** `index.ts` (both required — a folder
with only `index.ts` silently vanishes from the gallery, and `contract.test.ts` is the only thing
that catches it). `index.ts` spreads `...meta`.

- `setup` builds the rock, computes wetness and sterile ground, primes founders.
- `frame` steps the sim and paints. Cells go into an `ImageData` on a **separate** offscreen canvas,
  scaled onto the display context — never `drawImage` a canvas onto itself.
- `update` live-applies `yearsPerMinute`, `stormEvery`, `whimsy`, `sporeRate`, `margins` and the
  colours. `exposure` and `relief` recompute the **wetness field in place**; `bareRock` and
  `veinStyle` recompute the sterile field in place, and must **not** clear living cells — newly
  sterile ground only stops future growth, or a slider wipes lichen out under the cursor.
  `seed` is structural → return false.
- `resize?(state, size, ctx)` — the grid is a **fixed cell count**, so a resize changes the cell's
  on-screen size and nothing else. Rebuild the offscreen canvas and repaint; carry occupancy, ages,
  `simYears`, the rng and the storm clock across untouched. Reallocating here is #319's "the image
  dances", and the Config preview re-lays-out below 820px.
- `dt` is **milliseconds**, clamped at 50. `dYears = dt/60000 × yearsPerMinute`. Porting the probe's
  loop without converting runs it 1000× fast and nothing catches it.
- The host hands `kind:'2d'` a `size` in **CSS pixels** and applies `setTransform(dpr, …)`. All grid
  arithmetic and the final `drawImage` use CSS pixels; using `canvas.width` draws at 2× on retina.

### The grid is a fixed cell COUNT, and founding is per-area

Founding was authored as founders **per year**, independent of cell count, while growth is per
**area**. The founder:growth balance *is* the owner-approved scatter, so it moved with grid size —
measured: at 40k cells the rock is 95% covered by year 40; at 160k cells, 65%. The probe also
derived its grid from **device** pixels, spanning ~16k cells on a gallery tile to ~324k on a retina
play canvas.

So: a fixed `ARENA_COLS × ARENA_ROWS` (the shipped `salvage` pattern from #319), and founding
expressed **per 1000 cells per year**. The composition is then identical at every window size and a
4K display is cheaper than a small one.

⚠️ **Residual, stated rather than hidden:** pinning the count lets the cell's apparent *size* float
by ~5× between a gallery tile and full screen, and `lobe` is authored in cells, so the lobed-margin
wavelength scales with it. This trades a 20× behaviour drift for a ~5× texture drift. It is not
fully solved, and #319 killed two designs before its third shipped.

## Schema

Per the #256 canon. Sections `Tempo`, `Rock`, `Life`, `Storms`, `Color`, `Advanced`.

| field | ui | range | step | default | section |
|---|---|---|---|---|---|
| `yearsPerMinute` | slider | 5–140 | 1 | 40 | Tempo |
| `exposure` | slider | 0.15–1 | 0.01 | 0.55 | Rock |
| `relief` | slider | 0–1 | 0.01 | 0.5 | Rock |
| `bareRock` | slider | 0–40 | 1 | 12 | Rock |
| `veinStyle` | slider | 0–100 | 1 | 35 | Rock |
| `sporeRate` | slider | 0–3 | 0.05 | 1 | Life |
| `stormEvery` | slider | 2–90 | 1 | 18 | Storms |
| `whimsy` | slider | 0–100 | 1 | 15 | Storms |
| `margins` | slider | 0–100 | 1 | 50 | Color |
| `species` | group of 5 `ui:'color'` | — | — | table above | Color |
| `rock` | color | — | — | `#3c4148` | Color |
| `sea` | color | — | — | `#0e2834` | Color |
| `seed` | number | — | — | `1` | Advanced, `collapsed` |

- **Every slider declares `step`** — `diversionMeta.test.ts` requires it and `Slider` otherwise falls
  back to 1, which is unusable for `exposure` and `relief`.
- **No `background` field, deliberately.** The sim paints every pixel, so a background swatch would
  have no visible effect, which invariant #2 makes worse than its absence; canon #256 sanctions this
  exception for a full-field simulation. `rock` and `sea` are exposed instead. ⚠️ Invariant #5:
  *Verrucaria* `#1a1916` on mid-shade rock is **1.74:1**, the piece's lowest-contrast pairing —
  which is why the rock colour is a field and why `margins` exists.
- **`seed` has a literal integer default (`1`).** `schema.parse({})` must be deterministic for the
  codec sweeps; freshness comes from `applyFreshLoadRandomization`.
- **Species colours are a `ui:'group'` of five `ui:'color'` fields, not a `colorList`** — canon #256
  uses discrete fields for distinct semantic roles and names "species A/B/C" as the example. The
  group carries `ui:'group'`, its label and `section:'Color'`; its **children carry no `section`**,
  or SchemaForm nests subpanels (`cyclic-dominance/schema.ts` is the precedent).
- **`stormEvery`'s readout shows wall-clock seconds beside simulated years**, derived from
  `yearsPerMinute` too. This is required, not decorative: the piece's entire pacing was once
  reasoned in simulated years and never converted, which hid the fact that the default is a storm
  every **31 seconds**. The owner reviewed that figure and kept the default; the control must keep
  telling the truth.

## Distinct from

The nearest neighbours are **not** `voronoi` — they are the grain-growth and lattice-domain pieces,
and one sentence separates all of them: **their boundaries keep moving; ours stop.**

- **`potts`** — Potts grain growth, dark-leaded walls, coarsening forever toward fewer, larger
  grains. Lichen boundaries freeze on contact and the mosaic gets *finer* as founders land. Opposite
  direction of travel.
- **`foam`** — curvature-driven coarsening; small cells are eaten by large ones. Nothing here eats
  anything; competitive equivalence is the documented finding the piece rests on.
- **`cyclic-dominance` / `voter`** — domains whose fronts advance and retreat as one species beats
  another. Here no species can take a cell another holds.
- **`morphogen`** — a soft-Voronoi territory map with fate-from-gradient positional information;
  the closest thing to the zonation mechanism already shipped. It has no colonisation history, no
  contested frozen borders, and no disturbance regime.
- **`voronoi`** — recomputes a full-plane straight-edged tessellation every frame from drifting
  sites. Here coverage is neither instantaneous nor permanent.
- **`dla`** has a green "Lichen" *preset* but grows dendrites. **`camouflage`** uses a lichen
  *texture* as a static habitat.
- **#367 Watercolour** (open) steers a spreading front with a height field — nearest mechanism twin,
  but its washes *merge* and its field is paper tooth doing granulation.
- **#378 Glacier** (open) flows ice over a bed heightfield; no bulk flow here, and succession rather
  than advance/retreat.

## Locked by the owner (2026-09-17)

Each is the kind of thing a later pass would "fix" back.

1. **The scatter stays.** Founders outpace growth, so the rock reads as many small-to-medium thalli
   rather than a few big discs. Offered as a defect; the owner declined — *"it looks more realistic
   than I thought it would"*. ⚠️ Stated precisely, because the grid fix changes the arithmetic: **the
   owner approved this thallus density at the probe's cell size on 2026-09-17**, and it must be
   re-checked after founding becomes per-area. It is not an ecology claim, and the reference
   photographs cannot support it (they show a different community).
2. **No moving water line** — see the two measurements, and the caveat about what the second one
   actually tested.
3. **Whimsy is a slider, not a toggle**, default 15. Owner's call, made with the rate known.
4. **Storms are events** — spiral scrub over seconds, sparse survivors. Owner-directed. Restoring
   the instant mask, or clearing to zero, both undo an explicit request.
5. **Contact margins default 50.** Owner-approved after seeing 0 vs 55 on the same rock.
6. **The cadence readout shows wall clock.** Owner chose to keep `stormEvery: 18` *with* the
   31-second figure visible, rather than change the default.

## Testing

Pure modules, co-located. Thresholds are measured off running code and then mutation-checked — a
green test no mutation kills is not a test.

- `rock.test.ts` — falloff monotone **in the row mean**, not per cell (the `relief` term is ±0.2
  against a per-row falloff of ~0.016, so per-cell monotonicity is simply false at the default).
  `exposure` widens the reach. The 0..1 clamp is asserted under `relief: 1` on a hollow, where it
  binds. **Sterile ground hits its requested fraction within 1% across 20 seeds and both style
  extremes** — the histogram-collapse bug marked 100% of the rock and must stay dead.
- `species.test.ts` — tent inside the band, step to a 0.55 shoulder, zero at 0.11 beyond. Every
  species is the strict argmax at some wetness, and the argmax is **monotone** so bands cannot
  interleave.
- `colony.test.ts` — keystone: **a living cell is never overwritten in place.** Record `occ` every
  step over a long run; only `-1 → species` and `species → -1` transitions occur. Growth never
  enters zero habitability or sterile ground. Die-back is slow.
- `storm.test.ts` — every mask strips a non-trivial area at mid severity (measured: all ten select
  3–46%; a mask matching nothing or everything is invisible on a screenshot of mostly-bare rock).
  Severity skew asserted on the **median** (0.214) — a mean test passes for a uniform distribution.
  `whimsy` probed at 0, 100 **and a mid value statistically**, since a mutant halving the
  probability passes both endpoints. **The scrub**: a storm takes more than one step to complete,
  survivors are non-zero and under 15%, and a storm in progress blocks the next one.
- `longrun.test.ts` — pinned seed, explicit `testTimeout`, headless to **400+ years**, sampling
  **every simulated year**, asserting coverage of *colonisable* cells both exceeds 90% and drops
  below 60%. Three measured facts drive this: sparse year-mark sampling misses the peaks and makes
  the gate look flaky; one seed of twelve does not first exceed 90% until **year 242**; and with
  12% sterile ground, coverage of the *whole grid* tops out near 88%, so measuring the whole grid
  would fail the 90% gate for the wrong reason.
- Codec round-trip and `seedContract` come free from the sweeps.

## Accepted risks — panel objections deliberately not fixed

1. **"Don't build it; it's `potts` with extra steps."** The system has one attractor (full
   coverage), reaches it in ~90 s, and thereafter changes because a timer deletes a region — where
   `potts` and `foam` coarsen forever by their own physics with no external driver. *Cheaper
   alternative:* a palette plus gradient-biased seeding plus one storm mask on `potts`.

   ⚠️ **An earlier version of this entry claimed the objection was "weaker after the storm rework"
   because survivors and sterile ground enrich the long run. That was wrong, and it was argued from
   a harness that did not implement either feature.** Measured on the corrected harness across eight
   seeds: survivors heal a scar from the inside and the spiral scrub lets regrowth begin before the
   storm ends, so scars close *faster*; sterile ground removes 12% of cells from the denominator, so
   the coverage metric saturates. The owner-directed features **damp** the hour-scale swing. The
   honest statement is: *the second act got quieter, not livelier; it is accepted because a storm is
   worth watching.*

   *Why built anyway, with the numbers on the table:* median coverage 97.9–99.4%, at or above 90%
   for ~85% of years — but coverage is a saturating metric and a poor proxy for motion. **Churn**
   is the honest one: a median 0.22% of cells change per simulated year, p90 2.76%, i.e. roughly
   **9% of the cliff turns over per minute** of screen time. Slow, calm and always beautiful is the
   stated ethos, not a failure of it. The owner was shown these figures and chose to ship at this
   tempo (2026-09-17). What `potts` still cannot express is zonation by habitat, species with
   meaning, frozen contested borders, and permanent sterile ground.
2. **Two of five species are rendered in the wrong growth form.** *Alternative:* drop *Ramalina* and
   *Xanthoria* for crustose species, or render lobes and tufts. *Why rejected:* the documented
   supralittoral sequence is the thing being depicted and those two are in it; dropping them loses
   the yellow and the grey-green that carry most of the frame's colour. Recorded as a simplification
   in the description rather than papered over.
3. **~81% of the frame is desaturated.** Partly addressed by `margins` (legibility without changing
   colours) and by warm quartz. Not fully solved: wetness is exponential in height, so the two warm
   species' bands compress into a narrow strip while the grey species span most of the cliff. Fixing
   it properly means changing band geometry, which is owner tuning, not an agent's call.
4. **`relief` was measured as barely working — and that was a symptom, not a verdict.** The panel
   found its stated mechanic ("hollows hold water, ridges shed it") did not exist: the field was
   centred on 0.25, so the `hold` term was always positive and the slider's dominant effect was a
   uniform shift of the whole band stack, i.e. a second weak `exposure`. Root cause was the `hash2`
   arithmetic-shift bug, now fixed — the field centres on 0.441 and the term is two-sided (68%
   positive, 32% negative), so the documented mechanic is real. **The earlier "±4.6 rows" and
   "~1.2% of cliff height" figures were measured against the broken field and are withdrawn**;
   re-measure off `rock.ts` before writing any assertion about it. Deciding whether the slider earns
   its place was the wrong question while the thing it controls was broken.

## Open, deliberately

- **Palette presets** are not designed yet; a `Palette` group per canon follows once it is on screen.
- **Whether `relief` earns its slider** — measured at ±4.6 rows on the black/orange edge. If it
  reads as noise, fold it to a constant.
- **No pointer interaction.** Nothing here wants a cursor.

## What the panels changed

Three panellists over two rounds; every empirical claim was independently re-run. Corrected: the
severity skew (70% → **54%**), year 180's storm (four fifths → **71.8%**), habitability (plateau →
**tent with a discontinuous step**), the frozen-boundary keystone (**false as written**), coverage
"never complete", the *map lichen* species attribution, the Johnson–Mehl label, the growth forms of
two species, and the reference photographs' provenance. Added: a `resize` policy, per-area founding
with a fixed cell count, `step` on every slider, a literal `seed` default, the species wetness
bands, and a distinct-from argument against the pieces this actually resembles. Removed:
`background`. A provenance failure was fixed by committing the storms harness the spec cited but
which did not exist in the repo.
