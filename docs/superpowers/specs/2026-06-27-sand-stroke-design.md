# Sand Stroke — design spec

**Issue:** #48 · **Date:** 2026-06-27 · **Status:** approved, ready for plan

A faithful, clean-room reimplementation of **Jared Tarbell's _Sand Stroke_**
(complexification.net, Jan 2004) as a Diversion. Parallel horizontal "sweeps"
advance across the canvas, each laying a perpendicular column of translucent
sand grains whose count is fixed but whose height random-walks — producing
wavy, density-modulated ribbons of colour that accrete on a never-cleared
ground.

## Provenance & licensing

The algorithm below was recovered from Tarbell's **actual primary source**
(`sandStrokem.pde`, Wayback snapshot `20040812143915`), cross-verified by two
independent research passes.

- **complexification.net carries no Creative Commons license** — only a bare
  `© Jared Tarbell` notice plus an informal "source is open, modifications
  encouraged" ethos. (The widely-repeated "CC BY-NC-SA" claim is unverified and
  not present on the site.)
- **Algorithms are not copyrightable** (17 U.S.C. §102(b)); only a specific code
  _expression_ is. This is a **clean-room reimplementation** written from the
  algorithm description — **not** a line-by-line port of his `.pde` — so it is
  not a derivative work and is unencumbered. The repo stays **MIT**.
- **Credit** (community norm, verified against 3 real MIT ports of his work):
  - Source-header comment in `index.ts` / `sandStroke.ts`:
    `// Sand Stroke — clean-room reimplementation of the algorithm from Jared`
    `// Tarbell's "Sand Stroke" (complexification.net). Not a code port.`
  - README "Credits / Inspiration" line crediting Tarbell with a link to
    `http://www.complexification.net/gallery/machines/sandstroke/`.

## The original algorithm (verified)

```text
• White canvas, painted ONCE, NEVER cleared — pure accretion.
• ~22 sweeps (gallery caption says ~42 — it is purely a count). Each starts at
  the LEFT edge at a random height y, advances RIGHT 1px/frame (vx = 1).
• Per frame, at column x, a sweep lays:
    - 1 center grain at (x, y), alpha 0.07
    - wd = 200 grains PER SIDE at  y ± gage·sin(i·w),  i = 0..wd-1
      where gage ≈ 220 (amplitude scale = int(dim/k)·10), w = sg/wd
    - per-grain alpha = 0.1 − i/(wd·10 + 10)  → 0.1 at the spine, ~0.001 at edges
• sg ("gain") random-walks: sg += random(−0.042, 0.042), clamped to [−0.3, +0.3].
  This pulses the column height → wavy ribbons. A FIXED grain count over a
  VARIABLE height is the signature "density modulation": thin wave = dense/dark,
  tall wave = faint/diffuse.
• When |sg| < 0.01 (wave near flat): ~1% chance to recolor (somecolor()).
• Palette = uniform-random pick from a colour set (originally harvested from an
  image asset + padded with whites/blacks; we substitute our own).
• Reaches right edge (x > dim) → respawn at left, new colour, fresh gain. Forever.
• Compositing = manual per-pixel lerp toward the grain colour ("tpoint": read
  pixel, move it a fraction α toward the grain colour, write). NOT additive —
  mathematically the over-operator with a constant source colour.
```

## Adaptation to the framework

Faithful to the **look**, scaled to a responsive canvas (decision **A**): the
500×500 hardcoded constants (`gage=220`, `vx=1`, `k=22`) become canvas-relative
and exposed as config.

- `gage` is derived so `gage·sin(0.3) = bandHeight · canvasHeight` (band height
  scales with the canvas; the gain clamp stays the internal `0.3` that defines
  the wave _character_). `bandHeight` folds `gage` + clamp into one knob.
- Horizontal advance is `dt`-driven (px/sec from `speed`) instead of 1px/frame,
  with sub-pixel accumulation, so cross-time is framerate-independent.
- A colour swatch's per-channel **alpha multiplies** the grain falloff alpha
  (default `ff` = pure-faithful; lowering it thins that colour).

## Config schema (single source of truth)

One Zod schema drives the config form, URL codec, and `Config` type. Sections
render in first-appearance order; `seed` is **last** so "Advanced" renders last.

```text
STROKES
  strokes      int  4..80     default 40    slider   parallel horizontal sweeps
  speed        0.2..4         default 1     slider   cross speed (sec-to-cross ∝ 1/speed)

THE WAVE
  bandHeight   0.02..0.4      default 0.13  slider   max half-thickness, fraction of canvas H
  waviness     0.005..0.12    default 0.042 slider   how fast a sweep's thickness wanders
                                                     (0 ≈ constant width; high = busy waves)

GRAIN
  density      int 40..400    default 200   slider   grains/side/column — more = denser, smoother
  opacity      0.02..0.3 step .005 default 0.1 slider spine alpha; feathers to ~0 at the edges

COLOR
  background   color          default #ffffff        the never-cleared ground (faithful = white)
  color (group: palette | gradient)   reuses the flow-field colour-group pattern
     mode      palette | gradient      default palette
     colors    1..8 hex8     default warm dunes: #7c3f1eff #c8762fff #e0a458ff
                                                  #9c5a3cff #3a4a6bff #b0402eff
                             (palette mode; uniform-random pick per sweep — faithful)
     source    y | x          default y               (gradient mode: lane height | column progress)
     stops     2..8 hex8     default #7c3f1eff #c8762fff #3a4a6bff   (gradient mode)
  colorDrift   int 0..100     default 8     slider   chance a sweep recolors mid-pass near a
                                                     flat point (0 = one colour per pass)

ADVANCED
  seed         int            default 4823  number   same seed → same painting
```

Field `.meta({ ui, label, help, min, max, step, options, section, showWhen })`
follows the flow-field schema idioms (palette/gradient `showWhen` swaps, the
`color` group as a `.default().meta({ ui:'group' })`-wrapped `z.object`).

**Codec note:** leaf names need only be unique _within this schema_. `mode`,
`source`, `colors`, `stops` live inside the `color` group (same as flow-field's
own schema) — fine. `urlKeys.test.ts` guards the leaf-uniqueness invariant.

## Architecture

`kind: '2d'`. Unlike the other 2D diversions this one **never clears** and
**blends per-pixel**, so it owns an offscreen accumulation buffer.

```text
• OFFSCREEN CSS-sized canvas holds an ImageData buffer = the accreting painting.
  Grains blend in via the manual lerp (Tarbell's tpoint). Never cleared.
  Each frame: drawImage(offscreen → main ctx). One call; DPR-correct (the main
  2D ctx is DPR-scaled, so the CSS-res buffer upscales — slight softening, which
  is on-aesthetic for sand).
• State:
    interface SandState {
      cfg: SandStrokeConfig
      rng: () => number          // seeded mulberry32(seed)
      off: HTMLCanvasElement     // offscreen, CSS-sized
      offCtx: CanvasRenderingContext2D
      img: ImageData; buf: Uint8ClampedArray   // off's pixels
      sweeps: Sweep[]
      palette: RGBA[]            // parsed once from cfg.color.colors
      gage: number               // derived from bandHeight · h
      w: number; h: number       // CSS px
    }
    interface Sweep { x: number; y: number; gain: number; color: RGBA }
• frame(state, ctx, _t, dt):
    for each sweep:
      advance xAccum += dt·pxPerSec(speed); for each whole pixel column crossed:
        deposit center grain (alpha 0.7·opacity) + `density` grains per side at
        y ± gage·sin(i·w), alpha = opacity·(1 − i/(density·10+10))·color.a, lerp
        into buf; random-walk + clamp gain; colorDrift recolor roll near flat;
        respawn at right edge (x→0, new colour from palette, fresh gain).
    putImageData(img) into off; drawImage(off, 0, 0, w, h) onto main ctx.
• update(state, cfg, size):
    LIVE (swap cfg, recompute palette + gage), return true:
      speed, bandHeight, waviness, density, opacity, color.*, colorDrift
    STRUCTURAL, return false → framework re-runs setup:
      strokes (sweep array), seed (RNG), background (already-painted pixels can't
      be recoloured → rebuild buffer)
• resize(state, size):
    rebuild offscreen buffer at the new CSS size, fill with background, reseed
    sweeps (fresh y, gain, colour). Accretion resets on resize — acceptable for
    a screensaver. (Possible later enhancement: blit the old buffer to preserve.)
• teardown: none required (no GL). Offscreen canvas is GC'd with state.
```

### Determinism

A single `mulberry32(seed)` stream feeds every random draw (sweep init y, gain
init + walk, colorDrift roll, colour pick), so **same seed → same painting**.
Sub-pixel `dt` advance keeps cross-time framerate-independent; exact
frame-for-frame identity across machines is approximate (as with the other
accretive diversions) but the seeded layout + colour sequence is fixed.

## Files

```text
src/diversions/sand-stroke/
  index.ts        Diversion contract {id:'sand-stroke', title:'Sand Stroke',
                  description (credits Tarbell), kind:'2d', schema, setup, frame,
                  update, resize}. Auto-registered by import.meta.glob.
  schema.ts       the Zod schema above + exported SandStrokeConfig type.
  sandStroke.ts   pure core + state: seeded RNG, RGBA parse, palette build, gage
                  derive, grain-alpha falloff, gain walk+clamp, lerp/tpoint blend,
                  sweep advance + respawn, createSandState / updateSandState /
                  stepSand / resizeSandState. Clean-room credit header.
  sandStroke.test.ts   pure-logic unit tests (below).
  schema.test.ts       defaults valid + ranges + section/meta presence.
README.md          add a "Credits / Inspiration" line crediting Jared Tarbell.
```

## Testing (anti-regression must-haves)

Vitest, co-located. Pure logic only (no canvas needed for the core math):

- **schema:** all defaults parse; ranges/enums enforced; `color` group defaults
  valid; `seed` is last field (Advanced renders last).
- **grain alpha falloff:** `grainAlpha(i, density, opacity)` = spine `opacity` at
  `i=0`, monotonic decreasing, ~0 at `i=density-1`.
- **gain walk + clamp:** stays within `[−0.3, +0.3]`; deterministic for a fixed
  RNG sequence.
- **lerp blend (tpoint):** blending colour C over pixel P by α moves each channel
  exactly `α·(C−P)`; α=0 is a no-op; α=1 replaces.
- **sweep respawn:** crossing the right edge resets `x→0`, assigns a new palette
  colour, resets gain; `y` stays a valid in-bounds lane.
- **determinism:** two `createSandState` + N `stepSand` runs with the same seed
  produce identical first-N grain positions/colours; a different seed differs.
- **RGBA parse:** `#rrggbbaa` → `{r,g,b,a 0..1}` round-trips like the flow-field
  helper.

Codec round-trip + `urlKeys` leaf-uniqueness are covered by the framework's
existing tests once the schema is registered.

## Verify-pass refinements (2026-06-27)

Changes made during Chrome verification, after the original design above:

- **Lanes are stratified, not uniform-random.** One sweep is jittered within each of
  `strokes` equal height bands (`laneFor`). Plain uniform y clustered badly at low stroke
  counts (seed 4823 piled the first four lanes into the top 150px). Stratified guarantees an
  even vertical spread at any seed/count while staying random within the band.
- **Sweeps enter from the left with a jittered start time** — a random negative phase offset
  (`x = -rng()·w`) so they don't launch in lockstep (no aligned vertical front). Each still
  crosses in from the left edge; the offset survives the wrap, so they stay decorrelated.
- **Fresh in-band y on every respawn** — a new jittered lane within the sweep's band each pass
  (they respawn at staggered times now, and per-band keeps them spread).
- **Per-sweep RNG streams** (`seedFor(seed, i)`). Each sweep consumes its gain/colour walk from
  its own stream in column order, so one sweep's frame timing can't perturb another's (a shared
  interleaved stream drifted as rAF dt jittered). Guarantee: **same seed at a given frame cadence
  → the same painting**; across different frame rates the lanes/palette/wave character reproduce
  but exact pixels can drift (the cumulative gain walk is consumed one draw per column). Locked by
  a fixed-cadence determinism test.
- **Default ground is warm ivory `#f4efe4`**, not pure white — lower glare, harmonises with the
  warm dune palette, and keeps faint grains legible (character-first colour harmony).
- **Shipped defaults:** `strokes 4`, `speed 0.2`, `bandHeight 0.17`, `waviness 0.02`,
  `density 200`, `opacity 0.1`, `colorDrift 21`, `seed 4823` — a slow, sparse, meditative
  left-to-right accretion.

## Out of scope (backlog candidates)

- Presets (Motion / Colour groups) like Gravity Wells & Flow Field — add later.
- Preserving accreted art across resize (blit old buffer).
- A "reset / regrow" control or periodic full reset.
- Sharing a sand-painter helper with Substrate (#47) — revisit when #47 lands;
  the two pieces' geometries differ enough that premature sharing isn't worth it.
```
