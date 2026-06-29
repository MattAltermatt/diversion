# Strange Attractors — design spec

**Issue:** #30 · **kind:** `2d` · **family:** chaotic point-density / fractal math-art
**Date:** 2026-06-28

## 1. Concept

Plot a long chaotic orbit of a self-bounding iterated map (Clifford / de Jong / Hopalong),
accumulating point density on the canvas with low-alpha additive blend — gossamer
filamentary clouds of effectively infinite variety. The canvas is the density accumulator
(faded per frame), so it **reuses Flow Field's buildup/trail rendering idiom** — no new
rendering machinery.

This is "the anti-Flow-Field": *no* velocity field, just an iterated map painting density.
The kinship to Flow Field is purely the rendering/color/codec machinery, which we reuse
wholesale.

## 2. The map kernels

> **SHIPPED AS TWO MAPS (Clifford + de Jong).** Hopalong was scoped for v1 but
> **removed before ship** after Chrome verification — see §Backlog. The design
> below stands; only Hopalong moved out.

Pure functions `(x, y, a, b, c, d) → { x, y }` in `attractors.ts`:

```
clifford:  x' = sin(a·y) + c·cos(a·x)
           y' = sin(b·x) + d·cos(b·y)

de Jong:   x' = sin(a·y) − cos(b·x)
           y' = sin(c·x) − cos(d·y)
```

- Clifford and de Jong are **sin/cos self-bounding by construction** — they cannot
  diverge to NaN/∞.
- A defensive **magnitude guard** (`|x|,|y| > 1e4 → reject`) and a non-finite
  (`Number.isFinite`) guard remain in `isValidOrbit` — cheap insurance against
  pathological coefficients even though the sin/cos maps stay bounded.

## 3. Rejection-sampled seed → coefficients

The `seed` is the discovery knob. `mulberry32(seed)` draws candidate `a,b,c,d ∈ [−3, 3]`.
Validity gate, per candidate:

1. Integrate ~500 warm-up iterations from a fixed start point.
2. **Reject** if any iterate is non-finite (or, for Hopalong, exceeds the magnitude guard).
3. **Reject** if the orbit's bounding-box variance is below a threshold — i.e. it collapsed
   to a point or a short limit cycle (no fractal structure).
4. Resample (next draw from the same seeded stream). Cap at ~40 tries → fall back to a
   per-map known-good signature coefficient set (guarantees we always render something good).

This is the "no bare random → a,b,c,d" MUST from the issue: most random coefficients
collapse or diverge, so every coefficient set passes the gate or is the curated fallback.

## 4. Drift (always-on — the "life")

A converged static density map finishes in ~2s and dies the 60s-unattended test, so drift
is a **core feature, not optional**. Mechanism: **sinusoidal wobble** — each coefficient
orbits its base value:

```
a(t) = a₀ + driftAmp·sin(t·ωₐ)      (and likewise b, c, d)
```

- Four **incommensurate** angular frequencies `ω` → quasi-periodic motion that never
  exactly repeats but always returns near the base (calm breathing, zen ethos).
- `driftAmp` scales with the `drift` slider; `drift = 0` → frozen field (amp 0).
- **Bounded by construction** → never trips the validity gate mid-run, never diverges
  (the wobble stays in a small neighborhood of an already-validated base set). This is
  why wobble was chosen over lerp-to-new-random-target (whose transition midpoints can
  pass through invalid regions).

## 5. Render loop

`index.ts frame(state, ctx, t, dt)` keeps **one persistent orbit** (`state.x, state.y`)
across frames. Each frame:

1. **Fade for trails** — `globalCompositeOperation='source-over'`; fill `background` at
   `trailFadeAlpha(trailLength)` alpha (or hard-clear when `fadeTrails` is off). The decay.
2. **Compute drifted coefficients** for the current time `t` (§4).
3. **Plot `pointsPerFrame` iterations** — set `globalCompositeOperation = blend`
   (`lighter` default, additive) and a low `globalAlpha` per point; for each step iterate
   the current kernel, map attractor-space → screen, draw a `particleSize` dot
   (`fillRect`). The buildup.
4. Equilibrium of decay (step 1) vs buildup (step 3) = the steady gossamer cloud; drift
   (step 2) morphs it continuously.

**Why one orbit, not many:** the map is deterministic, so every orbit converges to the
*same* attractor set regardless of start point — N parallel orbits would just be `N ×
pointsPerFrame` points on one set, identical to raising `pointsPerFrame`. A single orbit
is the clean model.

**Attractor-space → screen mapping:** fixed per-map scale + canvas center + margin. No
auto-fit of the bounding box (that would add a jittery breathing zoom); a fixed scale
keeps the frame calm. Each map gets a nominal scale constant sized to its typical range
(Hopalong spans wider than the sin/cos maps).

## 6. Color — unified on a single scalar `t`

Compute one source value `t ∈ [0,1]` per plotted point (enum `colorSource: radius | x | y`,
default `radius` — radial reads beautifully on a roughly-centered cloud). Then:

- **gradient mode** → `sampleGradient(stops, t)` (smooth ramp).
- **palette mode** → `colors[floor(t · n)]` (radial color bands).

One value drives both modes — the clean unification (attractors have no persistent
entities to carry a per-particle color like Flow Field does).

## 7. update() live-apply split

Mirrors `updateFlowState`:

- **Apply live** (swap `cfg`, recompute precomputed palette styles): `drift`, `color`,
  `blend`, `fadeTrails`, `trailLength`, `pointsPerFrame`, `particleSize`, `colorSource`,
  `background`.
- **Return false → full re-setup** (needs a fresh orbit / new coefficients):
  `attractor`, `seed`.

## 8. Schema (`schema.ts`)

| field          | type / ui                                   | default            | notes |
|----------------|---------------------------------------------|--------------------|-------|
| `attractor`    | enum `clifford\|deJong`, segmented           | `clifford`         | re-setup on change (Hopalong removed — see Backlog) |
| `pointsPerFrame` | slider 1000–50000 step 1000               | `20000`            | density rate |
| `drift`        | slider 0–1 step 0.01                         | `0.15`             | help: morph speed; 0 = frozen |
| `fadeTrails`   | toggle                                       | `true`             | |
| `trailLength`  | slider 0–100 step 1                          | `72`               | reuse density-persistence idiom |
| `blend`        | segmented `lighter\|screen\|normal`          | `lighter`          | **`lighter` = additive** density sum (differs from Flow Field's `lighten`/max — additive is what density accumulation wants) |
| `background`   | color                                        | `#050810`          | near-black; trails fade toward it |
| `color`        | group (mode/colors/source/stops)             | palette            | reuse Flow Field's color group verbatim, `source` enum swapped to `radius\|x\|y` |
| `colorSource`  | (lives inside color group as `source`)       | `radius`           | |
| `seed`         | number, Advanced section                     | a known-good value | the 🎲 discovery knob |

**Dropped from the issue's sketch:** the raw `a,b,c,d` sliders. They are superseded by
seed-rejection-sampling + drift; exposing four raw coefficients that mostly produce
collapsed/divergent garbage fights the validity gate and the "always beautiful" ethos.
Seed = discovery; presets = curated entries. (Could return later as an advanced/collapsible
panel if desired — backlog.)

## 9. Presets (`presets.ts`)

Two independent axes (like Flow Field's Flow + Color):

- **Attractor** group — Clifford / de Jong, each patching `attractor` + a
  hand-tuned signature coefficient seed that lands on a beautiful known orbit.
- **Color** group — patches `background` + `blend` + the whole `color` group.

`seed` (the 🎲 dice) stays independent of both axes.

## 10. Testing (TDD, co-located `*.test.ts`)

- **Kernel determinism** — each map returns identical output for identical inputs; known
  fixture orbits.
- **Rejection gate** — accepts curated known-good coefficient sets; rejects a collapsed
  set (variance ≈ 0) and a divergent Hopalong set; always returns a valid set within the
  try cap (fallback path).
- **Drift** — bounded for all `t` (stays within `driftAmp` of base); `drift = 0` → frozen
  (coefficients constant).
- **Color** — radial `t` mapping correct at center / edge; palette banding picks expected
  index; gradient samples expected color.
- **update() split** — returns `false` on `attractor` / `seed` change, `true` otherwise.
- **Codec** — round-trip + resilience (framework keystone); `urlKeys` leaf-name uniqueness.

## 11. Effort

**M** (~half-day). Fresh diversion folder, but a large fraction is rendering/color/codec
machinery the framework already owns. New logic = 3 small map kernels + rejection sampler +
drift clock + render loop — all pure-testable.

## Backlog (not in v1)

- **Hopalong (Barry Martin) map** — `x' = y − sign(x)·√|b·x − c|`, `y' = a − x`.
  Removed before ship: it is **space-filling, not filamentary**, so at any
  reasonable point count it reads as a flat full-screen mesh (Chrome-measured
  maxLuma ~26 vs Clifford/de Jong's 174–255), and a 6× density boost just spread a
  brighter haze with no luminous filaments and washed-out radial color. Needs its
  own aesthetic pass — likely a different brightness model (per-pixel density
  normalization, or a thinner contour/edge-density render) — to earn gallery grade.
  Tracked as a fast-follow issue.
- **Local-density coloring** — color dense filaments differently from the wispy halo via a
  density accumulation grid (biggest available visual upgrade; whole new subsystem).
- **3D ODE attractors** (Lorenz / Aizawa / Thomas) with projected moving particles —
  inherently animated; adds projection + integration-stability work.
- **"Journey mode"** — lerp-to-new-valid-target drift that explores the whole attractor zoo
  over a long run (alternative to wobble; needs careful mid-transition validity handling).
- **Raw `a,b,c,d` advanced panel** — collapsible expert control over the coefficients.
