# Metaballs / Lava-lamp — design spec

**Issue:** #34 · **kind:** `webgl` · **Family:** smooth organic figure-ground
**Date:** 2026-06-26

Gooey blobs that merge and split — the canonical lava-lamp aesthetic. A
fullscreen fragment shader sums N center fields (`field = Σ rᵢ²/dist²`) and
draws a `smoothstep` isoline; the centers rise and fall via a buoyant +
viscous CPU simulation. Fills the "smooth organic figure-ground" gallery
slot nothing else covers (distinct from Plasma's sinusoidal wash and
Reaction-Diffusion's Turing micro-patterns via clear blob **topology**).

## Why `webgl`, not `2d`

Marching-squares on a 2D canvas loses on both axes: per-pixel field eval in
JS at 1080p is too slow, and a coarse grid gives flat faceted polygons — a
"molecular surface," not a lava lamp. The gooey gradients, glow, and
color-blending at merges are inherently a per-pixel shading job. A fragment
shader looping over N≤16 center uniforms is full-res @60fps and trivial GLSL.
This rides the proven WebGL host path established by Plasma (#36) + the
WebGL framework hardening (#8).

## Architecture

Unlike Plasma (a pure shader whose every param is a uniform), Metaballs
carries **CPU simulation state** — the blob centers evolve each frame and
the shader consumes their live positions:

```
frame(state, gl, t, dt):
  1. step the CPU sim (blob centers) using dt        ← the motion model
  2. upload live centers as uniform array u_blobs[16]
  3. draw the fullscreen triangle (field-sum shader) ← Plasma's host path
```

**Blob MERGE and SPLIT are automatic** from the field-sum + threshold — two
centers drifting close visually merge with gooey gradients for free. The
motion model therefore only needs to produce convincing *center* motion; no
explicit merge/split topology logic is required.

### State shape

Seeded deterministically at `setup` from the integer `seed`:

```
type Blob = {
  y: number          // vertical position, normalized field-space
  vy: number         // vertical velocity
  T: number          // temperature (drives buoyancy)
  radius: number     // rolled once from [radiusMin, radiusMax]
  kCool: number      // per-blob cooling rate — the anti-synchronization key
  x0: number         // horizontal rest position
  xPhase: number     // horizontal noise phase offset
}

type MetaballsState = {
  gl: WebGL2RenderingContext  // stashed so teardown() can free GL resources
  res: MetaballsGL            // program + vao + uniform locations
  cfg: MetaballsConfig
  blobs: Blob[]
  t: number                   // accumulated sim time (wrapped, for noise)
}
```

## Motion model — vertical thermal + horizontal noise

The make-or-break decision (issue MUST: "buoyant + viscous … NOT random
bouncing"). Chosen via a three-way dueling-agent evaluation (phase-driven
sine vs thermal convection vs force integration). Outcome:

- **Force integration (C) eliminated** — constant upward force pools
  everything at the ceiling; adding the height-dependent cooling needed for
  a *cycle* turns it into the thermal model with extra steps, and its
  mutual-avoidance term fights the merges we want. Most stability risk,
  least unique payoff.
- **Phase-driven sine (A) rejected as the sole model** — its own champion
  conceded it cannot produce "stretch under acceleration" (a single
  radially-symmetric center never elongates) and gets "merge near top /
  pinch-split near bottom" only by bolted-on scripting. Blobs on independent
  rails make merges *coincidences, not behavior* — the exact "floating
  molecules" failure the issue forbids.
- **Winner: a hybrid** that two independent agents converged on from
  opposite corners — thermal buoyancy on the **vertical** axis (carries the
  whole identity) + cheap seeded noise on the **horizontal** axis (A's
  dead-simple, float32-safe part). Captures ~90% of the authentic-thermal
  payoff at half the tuning + stability surface.

### Per-frame update

`dt` is clamped to ≤33ms (a backgrounded-tab stall can't inject a huge
step) and scaled by `speed`:

```
yNorm  = y mapped to 0 (bottom) .. 1 (top)
T_env  = lerp(T_HOT, T_COLD, yNorm)        // hot floor → cold ceiling
T     += kCool * (T_env - T) * dt          // relax toward local ambient
vy    += buoyancy * (T - T_NEUTRAL) * dt   // warm rises, cool sinks
vy    *= exp(-viscK * viscosity * dt)      // multiplicative damp (contraction)
y     += vy * dt                            // soft-clamped to a wall band
x      = x0 + noiseAmp * seededDrift(t * speed, xPhase)
```

**Why the MUST markers fall out emergently:**
- *Merge near top* — as a blob rises, `T → T_COLD`, so buoyancy → 0: it
  decelerates and lingers at the ceiling. Several lingering blobs converge →
  the field-sum auto-merges them.
- *Pinch-split near bottom* — at the bottom a blob reheats and gets a
  buoyancy kick; differing `kCool` per blob means they launch at different
  times → centers diverge → the isoline pinches and splits.
- *Stretch under acceleration* — adjacent blobs at different temperatures
  have different `vy`, so a faster-rising blob smears the bridging isoline
  before it snaps.
- *Sometimes merge / sometimes separate* — per-blob random `kCool` keeps
  blobs from phase-locking; the `T_env(y)` gradient prevents the
  all-pool-at-top degeneracy. The two boring extremes are designed out.

**Float32-stable for hours by construction:** every state variable is bounded
by a contraction — `T` relaxes toward a bounded ambient, `vy` uses
multiplicative `exp(-…·dt)` damping ∈ (0,1) (no stiff explicit spring to
blow up), `y` is wall-clamped. No integrator energy injection, no unbounded
accumulator (the noise phase wraps).

### Internal constants (not exposed as sliders)

`T_HOT`, `T_COLD`, `T_NEUTRAL`, the `kCool` range, `viscK`, `noiseAmp`, and
the wall-band width are tuned internals, not public params. Proposed
starting values are dialed in during the verify soak (see Verification).
The three public motion sliders map cleanly: `buoyancy` → thermal-force
gain, `viscosity` → damping coefficient, `speed` → time scale.

## Shader (follows the Plasma reference)

A fullscreen triangle from `gl_VertexID` (no attribute buffers), `#version
300 es`. Uniforms:

```
uniform vec3  u_blobs[16];   // xy = center (normalized), z = radius
uniform int   u_count;
uniform float u_threshold;
uniform float u_edge;        // isoline softness (edgeSoftness)
uniform float u_glow;
uniform vec3  u_colorA;      // rim / cooler
uniform vec3  u_colorB;      // core / hotter
uniform vec3  u_bg;          // background
uniform vec2  u_res;
```

Same normalized-coordinate convention as Plasma
(`uv = (gl_FragCoord.xy*2 - u_res) / min(u_res.x, u_res.y)`). The shader
loops `field = Σ rᵢ²/dist²` over `u_count` blobs, computes the isoline via
`smoothstep(u_threshold - u_edge, u_threshold + u_edge, field)`, blends
`u_colorA → u_colorB` by field intensity over `u_bg`, and adds a bounded
sub-threshold `u_glow` halo (clamped to avoid white-out).

## Color — 2-stop gradient mapped to field value

`colorA` (rim/cooler) → `colorB` (core/hotter) by field intensity, over a
flat `background`. Matches Plasma's proven 2-color pattern; the issue's
"gradient mapped to field value" is honestly served by a 2-stop for v1.

*Backlog:* multi-stop gradient and temperature-driven color (pass per-blob
`T` to the shader) — deferred, not v1.

## Schema (single source of truth)

Flat fields (Plasma pattern, not a nested group). Exactly the issue's
sketch:

```
blobCount     slider 3..16   step 1     default 8
radiusMin     slider 0.02..0.2  step 0.005  default 0.06  (fraction of min screen dim)
radiusMax     slider 0.05..0.4  step 0.005  default 0.16
threshold     slider 0.5..3   step 0.05  default 1.0   help "blob fatness"
edgeSoftness  slider 0..0.3   step 0.01  default 0.06  help "rim softness"
buoyancy      slider 0..1     step 0.01  default 0.4   help "vertical rise/fall vs random drift"
viscosity     slider 0..1     step 0.01  default 0.6   help "how slowly blobs move and merge"
glow          slider 0..1     step 0.01  default 0.3
speed         slider 0..2     step 0.01  default 0.6
seed          number int
colorA        color  default #ff2e63  (rim / cooler — field-low)
colorB        color  default #ffd56b  (core / hotter — field-high)
background    color  default #05060a
```

## CPU/GPU split for `update?()`

```
live (return true, swap cfg):  threshold, edgeSoftness, glow, buoyancy,
                               viscosity, speed, colorA, colorB, background
structural (return false → framework re-runs setup + re-seeds):
                               blobCount, seed, radiusMin, radiusMax
```

Radii are rolled per-blob at `setup`, so changing `blobCount`/`seed`/the
radius range requires a re-seed → return false and let the host fall back to
a full `setup`. All visual + motion params are read from `cfg` each frame,
so they apply live.

## Testing (Vitest, co-located)

- **`schema.test.ts`** — defaults parse; field UI metadata present (Plasma
  pattern).
- **`motion.test.ts`** ⭐ anti-regression must-have:
  - *Determinism* — same `seed` + same step sequence → identical blob
    positions (motion is a pure function of seed + dt).
  - *Bounded state* — `T` and `y` stay within range over many steps (the
    float32-immortality guarantee; catches a sign error or runaway).
- Field/merge logic lives in GLSL (not unit-testable) → covered by the
  Chrome soak below.

## Verification (the MUST gate)

Chrome (chrome-devtools MCP), dev server on port 5180. Beyond the standard
render check:

1. **`speed=2` multi-minute soak** — confirm blobs *sometimes merge and
   sometimes separate*; the rise/cool/fall/reheat reads as lava, **not**
   bouncing molecules; no synchronized-elevator and no permanent
   ceiling-pool degeneracy. A 30-second glance is insufficient — the
   degenerate steady states only surface minutes in.
2. **Slider live-apply** — drag threshold/glow/colors/motion sliders and
   confirm live update without a re-setup flash; change blobCount/seed and
   confirm a clean re-seed.
3. **URL round-trip** — config encodes to a short URL and decodes back
   (framework codec; defaults omitted).
4. **GL teardown** — navigate away and back; no GL resource leak across
   gallery navigation (Plasma's stash-gl-in-state pattern).

## Risks

- **Biggest:** coupled internal tuning landing in a degenerate steady state
  (synchronized elevator / ceiling-pool) that only shows minutes in.
  *Mitigation, baked into the design:* strictly height-dependent cooling +
  per-blob seeded `kCool`, and the `speed=2` long soak in the verify step.
- WebGL `u_blobs[16]` array sizing — fixed at 16 (matches `blobCount` max);
  `u_count` bounds the loop so unused slots are ignored.

## Out of scope (backlog)

- Multi-stop gradient / temperature-driven color.
- Per-blob radius pulsing.
- Pointer interaction (a blob that follows the cursor) — gated on the
  framework pointer seam (#9).
