# Substrate curvature (circular cracks) — design spec

**Issue:** #50 · **Date:** 2026-06-27 · **Status:** approved, ready for plan

Adds **curved cracks** to the existing Substrate diversion (#47) — a curvature
term on the crack heading so some cracks sweep along arcs instead of straight
lines, producing the swirling "Interactive Substrate" character (curved, nested,
spiralling cells) alongside the straight-edged grid. Additive: a new set of
Growth knobs, **not** a new diversion. At the default the look stays mostly
Substrate-grid with curved districts woven through.

## The model

Each crack is **either straight or curved**, decided once per crack-life (on
seed and on every relocate) by a single mix percentage:

- **`straightPct`** (0–100): the share of cracks that grow straight. The
  remaining `100 − straightPct` curve. They are complementary, so they always
  total 100% and can never both be 0 — one slider enforces this with no extra
  validation. `100` = today's all-straight Substrate; `0` = all curved.
- A crack rolls its type from its **own per-crack RNG**: `straight` iff
  `rng() < straightPct/100`.

A **curved** crack additionally picks, per life:

- **`radius`** = a uniform random value in `[minRadius, maxRadius]` (treated as
  an unordered pair — if `minRadius > maxRadius` they're swapped, no error).
- **`direction`** = `+1` or `−1` at random (curves left or right; always-on,
  not a knob), so curved cracks don't all spiral the same way.
- Internally: **`curvature = direction · STEP / radius`** radians per step
  (`STEP = 0.42` px). Smaller radius → tighter arc. A straight crack has
  `curvature = 0`.

Radius → look (over a crack's typical sub-canvas length):

```text
~400px  barely-there gentle bend
~100px  clear sweeping arc
~25px   tight curl that loops into its own trail and stops (short spiral)
~10px   tiny hooks, self-collide almost immediately
```

## How it plugs into the existing engine

One new `Crack` field and one line in the stepper; **everything else is
untouched** (occupancy-grid collision, perpendicular sand-painter fill,
grow/fade/regrow lifecycle, offscreen-blit/DPR).

- `Crack` gains **`curvature: number`** (rad/step; 0 = straight).
- `advanceCrack` rotates the heading **before** moving:
  `cr.angle += cr.curvature` then the existing `cr.x/y += STEP·cos/sin(angle)`.
- `seedCracks` and `findStart` assign `cr.curvature` when they set the crack's
  angle, via a shared helper `rollCurvature(cfg, rng) → number` using the
  crack's own RNG stream. `makeCrack`'s placeholder literal gets
  `curvature: 0` (overwritten by its `findStart`).
- A tight curved crack that spirals into its own earlier arc simply hits an
  occupied cell whose stored angle differs > the collision tolerance and
  **stops** — no special handling; this is the desired terminating-spiral
  behaviour.

### Determinism

`rollCurvature` consumes from the crack's own seeded stream, so the
same-seed-same-cadence determinism contract holds (two instances roll
identically). Note this **does** shift the generative sequence relative to
pre-#50 Substrate — the same `seed` now yields a different (curve-bearing)
network. That is expected for a new feature and acceptable.

## Config schema additions (Growth section)

```text
straightPct   int  slider  0–100    step 1   default 80    % of cracks that grow straight
minRadius     int  slider  10–400   step 5   default 25    min arc radius (px) for curved cracks
maxRadius     int  slider  20–800   step 5   default 400   max arc radius (px) for curved cracks
```

- All three are **live-apply visual params** (added to `updateSubstrateState`'s
  live path → returns `true`): changing them affects future seed/relocate rolls;
  existing cracks keep their assigned curvature until they next relocate. No
  re-setup, no structural reset.
- All carry `min`/`max`/`step` (sliders, UX invariant 4) + persistent `help`.
- New leaf names `straightPct` / `minRadius` / `maxRadius` are unique → the
  flat-key URL codec is unaffected (guarded by `urlKeys.test.ts`).

### Default look & share-links

Default `straightPct = 80` shows the feature (a fifth of cracks curve) while
keeping Substrate's recognisable grid character dominant. Existing pre-#50
Substrate share-links omit the three new fields, so they decode to these
defaults — old links will now render with the 80/20 mix rather than all-straight.
This was accepted at design time (Substrate shipped minutes earlier; no links in
the wild; the feature should be visible by default).

## Testing (anti-regression)

Co-located Vitest, pure logic:

- **Mix split:** `rollCurvature` with `straightPct = 100` always returns 0;
  with `straightPct = 0` never returns 0; with `50`, counted over many rolls at
  a fixed seed, lands near half (loose bounds).
- **Curvature magnitude & sign:** a curved roll's `|curvature|` lies within
  `[STEP/maxRadius, STEP/minRadius]`; over many rolls both signs occur.
- **Unordered radius:** `minRadius > maxRadius` still produces valid curvature
  in the same band (no crash, swap-safe).
- **Heading integration:** a crack with constant nonzero `curvature` has
  `angle ≈ angle0 + N·curvature` after N `advanceCrack` steps (within fuzz);
  a `curvature = 0` crack holds its heading.
- **Determinism preserved:** existing same-seed-same-cadence buffer-equality
  tests still pass.
- **Schema:** new defaults parse (`straightPct 80`, `minRadius 25`,
  `maxRadius 400`); the existing slider-bounds test auto-covers the three new
  sliders; a range test rejects out-of-bounds (`straightPct 101`).

## Out of scope

- Per-crack curvature that *varies along its length* (e.g. noise-bent radius) —
  constant-curvature arcs only.
- Exposing direction bias (all-left / all-right) as a knob — direction stays
  random.
