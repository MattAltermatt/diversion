# Particle Life — design spec (#133)

**Family:** agent / self-organizing particles · **kind:** `2d` · **status:** design locked 2026-06-30

N colored particles obey a per-species-pair attraction/repulsion **interaction
matrix**. From random soup, cell-like "creatures," membranes, chasers, and
self-replicating blobs emerge. A strong 60-second-unattended, zen-screensaver
performer whose control surface is legible.

## The five UX invariants — how this piece honors them
1. **Readability** — luminous particles on a near-black field; distinct categorical
   species hues.
2. **Discoverable** — all knobs live in collapsible sections (`Life`, `Forces`,
   `Look`, `Motion`, `Advanced`); no bespoke always-on-screen chrome.
3. **Inline help** — every non-obvious field carries `.meta({ help })`.
4. **Sliders only when bounded** — all ranges are closed except `seed` (`ui:'number'`).
5. **Contrast** — palette presets emit maximally distinct hues; default dark bg.

## Force model — CodeParade / Tom Mohr "beta model" (load-bearing)

For an ordered pair (i, j) at normalized distance `q = dist / rMax`, with matrix
entry `a = A[type_i][type_j] ∈ [-1, 1]` and repulsion-core fraction `beta`:

```
force(q, a, beta):
  if q < beta:            return q / beta - 1          # hard repulsion, [-1, 0], species-independent
  else if q < 1:          return a * (1 - |2q - 1 - beta| / (1 - beta))   # triangular attract/repel band
  else:                   return 0
```

- The species-independent repulsion core below `beta` is why particles never
  collapse to a point — it gives every piece "personal space" and keeps the sim
  perpetually alive (no frozen/dead frame). This is the algorithmic reason the
  beta model looks alive where the naive `F = g/r` model collapses.
- Acceleration `= Σ_j (dir_ij) · force(q, a, beta) · rMax · forceScale`.
- Integration (fixed `dt = 1/60`, matches flock-vs-hunter's fixed-step loop):
  - `frictionFactor = 0.5 ^ (dt / friction)`  (`friction` = velocity half-life, seconds)
  - `v = v · frictionFactor + accel · dt`
  - `pos += v · dt`, then wrap toroidally into the world.

## World & neighbors
- Fixed toroidal world **1280×800** (world units). Rendered via `coverFit` (scale =
  `max`, edges cropped) exactly like `flock-vs-hunter/render.ts` → wrap seams sit
  off-screen; determinism is independent of viewport size.
- **`ParticleGrid`** (new, in-folder — diversions never import each other): uniform
  grid, intrusive linked list over preallocated typed arrays, ZERO per-frame alloc,
  toroidal 3×3 block with minimum-image deltas. Cell size = `rMax`. The force
  accumulation is fused into the sim's neighbor loop (no `out[]` array). Modeled on
  the proven `flock-vs-hunter/spatialHash.ts` but purpose-built for pairwise forces.

## Interaction matrix — derived from seed + flavor knobs (Option A)
- `A` is an 8×8 `Float32Array` (max species); only the top-left `colors×colors`
  block is used. Generated deterministically from `seed`:
  - each entry `= rng()*2 - 1` via `mulberry32(seed ^ SALT)`.
  - `symmetry === 'Symmetric'` → mirror upper triangle onto lower (calmer, mutual).
  - `attractBias` added to every entry, then clamp to `[-1, 1]` (net attraction vs
    repulsion → clumpy vs skittery).
- No editable NxN grid in MVP. Rerolling `seed` = a new "world." The bespoke matrix
  editor (shared with demon #77) is a BACKLOG follow-up.

## Species colors — palette preset × count
`paletteColors(name, n)` → `n` distinct hex hues (HSL→hex):
- `Spectrum` hues 0..360 · `Neon` bright high-sat · `Pastel` high-light ·
  `Ice` hues 180..260 · `Fire` hues 0..60. Evenly spaced across the range at fixed
  S/L per preset. Deterministic, contrasty, URL-clean (just the preset name + count).

## Render — luminous glow + trails (zero per-frame alloc)
- Pre-render one small **radial-gradient glow sprite per species color** into an
  offscreen canvas in `setup`/sprite-rebuild (not per frame).
- Per frame: (1) `source-over`, fill bg at `alpha = 1 - trailFade` (alpha-fade
  trails, same trick as flock); (2) `globalCompositeOperation = 'lighter'`,
  `drawImage` each particle's glow sprite at its position. Overlaps bloom naturally.
- `glow: false` → draw crisp filled dots instead of sprites.

## Schema (single source of truth)
```
Life:     count (200..4000, 1500) · colors/Species (3..8, 6)
Forces:   rMax (30..160, 80) · beta (0.1..0.5, 0.3) · forceScale (0.1..3, 1)
          friction (0.01..0.2 s, 0.04) · symmetry (Asymmetric|Symmetric)
          attractBias (-1..1, 0.1)
Look:     palette (Spectrum|Neon|Pastel|Ice|Fire) · dotSize (1..5, 2.5)
          glow (bool, true) · trailFade (0..0.6, 0.15) · background (#hex, #05070d)
Motion:   speed (int 1..4, 1)  — sim steps per frame; watch-speed only
Advanced: seed (int, randomizeOnFreshLoad)
```

## Lifecycle: setup / update / teardown
- **setup**: alloc SoA typed arrays (`px,py,vx,vy` Float32, `type` Uint8) sized to
  `count`; seed positions + species (rng); build matrix; build `ParticleGrid`;
  render glow sprites.
- **update** (live-apply, return `false` → framework re-runs setup):
  - structural (return false): `count`, `colors`, `seed`.
  - live (return true): recompute matrix (`symmetry`/`attractBias`), recreate grid if
    `rMax` changed, re-render sprites if `palette`/`dotSize`/`glow` changed, swap cfg
    for `beta`/`forceScale`/`friction`/`trailFade`/`background`/`speed`.
- **teardown**: null the SoA arrays for GC (nothing GPU in 2D).

## Determinism & performance
- Fully deterministic given `seed` + config (seeded positions, species, matrix;
  fixed `dt`). Same link → same evolution.
- O(n) neighbor queries via the grid; zero per-frame allocation in sim and render;
  targets 60fps at `count = 1500`.

## Tests (Vitest, co-located)
- `force.test.ts` — beta-model boundaries: repulsion at `q<beta`, zero at `q≥1`,
  peak at band center, sign follows `a`.
- `matrix.test.ts` — determinism (same seed → same matrix), symmetry mirroring,
  bias shift + clamp, only top-left block used.
- `grid.test.ts` — rebuild membership, toroidal neighbor finding + min-image delta.
- `sim.test.ts` — determinism (same seed → identical positions after N steps),
  no NaN, particles stay finite, zero-alloc smoke.
- `palette.test.ts` — `n` distinct valid hex colors per preset.
- `schema.test.ts` — bounds/meta sanity (mirrors repo convention).
- Plus the framework-level codec round-trip / control-from-schema sweeps pick the
  piece up automatically via the registry glob.

## Out of scope → BACKLOG
- Bespoke editable NxN matrix grid control (shared with demon #77).
- `contrast` matrix knob; per-species count/size; auto-cycle worlds on stagnation.
- Extra render modes (bonds/membranes overlay).
