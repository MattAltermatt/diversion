# Differential Growth — design spec

**Issue:** #144 · **kind:** `2d` Canvas · **slug:** `differential-growth`

A closed self-avoiding polyline that slowly buckles into brain-coral / intestinal /
lettuce-edge / Floraform folds from purely local attraction + repulsion + node
insertion. Refs: Nervous System "Floraform", Anders Hoff (inconvergent), Jason Webb.

Design settled by three dueling agents (algorithm / rendering / adversarial). Their
convergence + the surviving constraints are recorded below so the reasoning is
traceable.

## Load-bearing calls (survived the adversarial pass)

1. **`repulsionRadius / splitLength ≈ 2–5×` is THE fold lever.** Below ~2× the curve
   only feels its chain-neighbors → it inflates into a smooth balloon and never folds.
   Long-range repulsion between *non-adjacent* strands is the only force uniform
   inflation can't satisfy, so excess perimeter has to buckle. **Default 22 / 9 = 2.44×.**
2. **Overdamped position-based model — no velocity.** Every force is a bounded, damped
   displacement, magnitude-clamped to `maxStep = 1px` before it's applied → structurally
   cannot blow up (no momentum to accumulate). Linear repulsion falloff, never
   inverse-square (that spikes at small d).
3. **Fixed-timestep accumulator, not wall-clock dt.** `speed` = sub-steps/sec; one
   machine at 30fps and another at 144fps grow identically. `MAX_SUBSTEPS_PER_FRAME = 4`
   + drop-backlog guards the spiral-of-death when backgrounded. This single choice
   serves determinism, frame-rate independence, AND buzz-free zen at once.
4. **Seeded symmetry-breaking jitter is a hard contract, not a nicety.** A perfectly
   symmetric ring stays a circle to machine precision. Init jitter + injection
   tie-breaks + brownian ALL draw from one `mulberry32(seed)` stream → same seed
   reproduces the same growth (sub-step-count reproducible; frame-exact not required).
5. **Screensaver loop, not a demo that freezes.** Grow to `maxNodes` → STOP inserting
   but KEEP relaxing (tiny brownian keeps perpetual micro-motion) → after a settle-hold,
   `shouldRestart` reseeds a fresh world. Never freeze at the cap (dead screen); never
   relax-forever-alone (a settled coral is static).
6. **Slow-lerped autofit/recenter.** Asymmetric growth walks the centroid to a corner
   and clips. A view transform lerps (slowly — snapping "swims") toward framing the
   live bounds with a margin, so the piece stays composed as it grows and after a reset.
   This + color-by-age are the gallery-vs-programmer-art line.

## Simulation (framework-agnostic `growth.ts`)

Ring of `Node = { x, y, born }` (born = global sub-step index at insertion → age).
Scratch `dx,dy` accumulators reused per sub-step (no per-frame alloc).

**Init:** `N0 = 48` nodes, radius `r0 = min(w,h)*0.05`, per-node jitter `±r0*0.12`.

**One sub-step** (`desiredDist = 0.5*splitLength`):
1. zero all `(dx,dy)`
2. **attraction** (one-sided spring): for each neighbor, only pull when `d > desiredDist`
   → `+= attraction*(d-desiredDist)*(e/d)`. Never pushes (repulsion owns "too close").
3. **repulsion** (spatial hash, cell = `repulsionRadius`, 3×3 block query, exclude i±1):
   linear falloff `+= repulsion*(R-d)/R*(v/d)` for `0 < d < R`.
4. **alignment** (Laplacian smoothing): `+= alignment*(midpoint(nbrs) - p)`. Small — high
   rounds folds back to a circle.
5. **brownian**: `+= (prng*2-1)*0.03` per axis (keeps it alive at the cap).
6. **integrate**: clamp `|(dx,dy)| ≤ maxStep`, then `p += (dx,dy)`.
7. **insertion**: split every edge `> splitLength` at its midpoint (collect, splice once).
   Plus rate-limited curvature-biased injection (`growthBias`): seeded weighted pick by
   `|p_{i-1} - 2p_i + p_{i+1}|`, insert on the longer adjacent edge → organic asymmetry.
8. at `maxNodes`: stop insertion, keep relaxing.

**Frame loop:** `acc += dt; while (acc >= 1000/speed && n < 4) { step(); acc -= 1000/speed }`.

**Perf:** spatial hash → repulsion effectively O(n) (1-D manifold, bounded local density).
`maxNodes` default 2500, ceiling 6000 (honest cap; folds pack nodes locally so the hash
degrades where it's densest — verify 6000 holds 60fps in Chrome, don't assume 10k).
Insertions collected + spliced in ONE pass/frame (mid-walk splice is O(n) each).

## Rendering

**Smooth curve:** quadratic-through-midpoints (Chaikin-style) — node = control point,
curve passes through segment midpoints. Never overshoots (Catmull-Rom loops on tight
folds). One closed path/frame; `smoothing` toggle (off = faceted "Ink/woodcut").

**`renderStyle`** (segmented): `Line` (default — iconic, safe, no fill-rule risk) ·
`Fill` · `Fill+Edge` · `Membrane` (radial-gradient fill for organic volume).

**`history`** (slider 0..1): frame persistence. `1` = clear each frame (live curve only) ·
`~0.85` = trailing ghost (default) · `0` = accumulate (layered topographic strata).
One slider spans all three regimes.

**`colorMode`** (segmented): `Ink` (single) · `Age` (default — growth front glows;
newest→last palette color) · `Sweep` (palette cycled by ring index — marbling) ·
`Curvature` · `Depth` (dist-from-centroid). Per-node color batched into ~32 color-bin
subpaths (never per-segment `stroke()`).

**`glow`** (slider 0..1): `shadowBlur` soft bloom (prefer over additive — a folded ring
whites out instantly under `'lighter'`). Cap/verify framerate at high node counts.

**`lineWidth`** 1.25 (0.5–3) — thin keeps dense folds legible (UX #1). **`background`**
color (never pure #000 — glow needs something to sit in). Palettes ordered old→young.

## Preset axes (mirrors Flow Field's Flow + Color)

- **Growth** (sim feel): Coral (tight) · Cerebral (brain wrinkles) · Kelp (loose) · Fine Weave.
- **Style** (render + palette): Bioluma (Line/Age/deep-sea neon — landing) · Ember Coral
  (Membrane/Depth/warm — showpiece) · Ink (Line/mono etching — safe) · Topographic
  (accumulate/Sweep) · Porcelain (Fill+Edge/light paper — proves not-dark-only).

## Schema (sliders unless noted)

```
SIM   repulsionRadius ★ 22 (6–60)   splitLength ★ 9 (4–20)   speed ★ 40 (5–120)
      repulsionStrength 0.55        attractionStrength 0.45  alignment 0.12 (0–0.5)
      growthBias 0.2                maxNodes 2500 (200–6000)
RENDER renderStyle(seg) smoothing(toggle) lineWidth 1.25 glow 0.4 history 0.85
       colorMode(seg)  background(color)  color group{ colors: colorList }
SEED  seed (number, randomizeOnFreshLoad)
```
★ = hero knobs (repulsionRadius = wrinkle wavelength, the biggest lever).

## Tests
- Determinism: same seed → identical initial ring AND identical curve after N sub-steps;
  different seed → different. (Keystone — the seed contract.)
- Spatial-hash neighbor query returns exactly the nodes within R (vs brute-force).
- Curvature + smoothing helpers unit-tested.
