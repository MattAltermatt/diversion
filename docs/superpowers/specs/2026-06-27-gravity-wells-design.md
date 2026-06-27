# Gravity Wells — design

A new diversion. Working title **"Gravity Wells"**, id `gravity-wells`, `kind: '2d'`.

## Identity

> **Pivot (2026-06-27, during verify):** the original 2nd-order momentum
> model produced random criss-crossing chaos — "not pleasing to watch." Pivoted
> to a **1st-order flow field bent by gravity** (option B from the course-
> correction). What follows is the current, authoritative design.

A **flow field, influenced by gravity.** Particles follow a smooth vector field
(`velocity = field(position)`, 1st-order — the same reason Flow Field reads as
coherent laminar streams). The field is **Flow Field's noise flow BENT by a set
of transient gravity wells** that appear, live, and expire. Far from the wells
the flow is the pleasing noise current; near a well it's pulled toward (or
shoved away from) the well, so the stream swirls and diverts around the wells.
Because the wells keep turning over, the bend keeps reshaping — perpetual,
coherent, alive.

**Relationship to Flow Field.** Same 1st-order coherence, but the field is
`noise ⊕ gravity` instead of pure noise: the gravity wells are moving features
that warp the current. At `gravityInfluence = 0` it degenerates to Flow Field;
turning it up bends the flow toward attractors / away from repulsors.

Particles carry **no momentum** and **do not** interact with each other — they
simply follow the blended field at their current position. (No N-body, no
ballistic integration.)

## Wells (the new machinery)

- **Count:** up to `maxWells` active at once. When one expires, a replacement
  spawns at a fresh random position. Spawns are staggered by per-well lifespan
  jitter so they don't all flip together.
- **Force:** each well's force is drawn from a **signed range**
  `[forceMin, forceMax]`. Negative = repulsor (pushes particles away),
  positive = attractor (pulls them in). One range therefore spans attract-only
  (min ≥ 0), mostly-attract-with-occasional-shove (min slightly negative), or
  chaotic push-pull (wide signed range).
- **Fade envelope:** force ramps in over a short fade-in, holds, then ramps out
  as the well expires. No instant force step (which would snap particles).
- **Position:** fixed for the well's life. The appear/expire churn supplies the
  motion; drifting wells are a backlog idea, not v1.
- **Marker:** a **subtle ring** at each well, opacity tracking the fade
  envelope so its appearance and expiry are legible. Warm hue = attractor,
  cool hue = repulsor. Particles remain the visual star (markers are a hint,
  not a spotlight).

## Particles (1st-order field followers; reuses Flow Field idioms)

- Particles carry **only a position** — no velocity, no momentum.
- **Field at a point** = blend of the noise direction and the gravity bend:
  - **Noise base:** `a = noise(x·noiseScale, y·noiseScale, z)·2π` → unit vector
    `(cos a, sin a)` — Flow Field's exact base. `z` advances with `fieldDrift`
    so the base flow morphs over time.
  - **Gravity bend:** `g = Σ over active wells of
    force·envelope·G / (dist² + SOFTENING²)^½ · dir` (inverse-LINEAR, softened,
    whole-field reach), `dir` = unit vector toward the well, sign = attract/repel.
  - **Blend:** `fieldVec = noiseVec + g · (gravityInfluence · K)`, then
    **normalize** and step the particle along it at `speed` (1st-order — no
    momentum). `K` is an internal scale so the `gravityInfluence` slider reads
    0–2; near a well the bend dominates, far away the noise dominates.
- **Softening:** `+ SOFTENING²` removes the `r→0` blow-up; the field stays
  finite everywhere. Baked-in mechanism constant. No velocity clamp needed
  (constant step speed — nothing to diverge).
- **Respawn (lifecycle):**
  - **Lifespan timer** — reused verbatim from Flow Field
    (`age ≥ life → reseed at random pos, reset age/life`). Keeps fresh particles
    cycling through the evolving field.
  - **Escaped-bounds recycle** — a particle pushed off-canvas (repulsor shove or
    a whole-field lean) outside a **padded box** (50% margin each side) is
    reseeded. Only truly-escaped ones recycle; those arcing through the gutter
    survive to return.
- **Trails:** reuse Flow Field's `fadeTrails` + `trailLength` (via
  `trailFadeAlpha`) — flowing ribbons with fading trails are the appeal.

## Coloring

Reuse Flow Field's **color group** (palette mode: each particle keeps a color
for life; gradient mode: sampled along a source). Gradient sources, tuned to
this piece:

- **`flow-angle`** (default) — the blended field direction at the particle
  (cyclic), exactly like Flow Field.
- **`field`** — the gravity-bend strength at the particle (normalized 0–1), so
  particles caught in a well's strong influence flare a different hue — makes
  the gravity influence *visible*.
- **`x` / `y`** — screen position.

(The old `speed` source is dropped — particles move at constant step speed now,
so speed-coloring would be flat.)

## Schema / form controls

```text
particles*       slider    particle count           structural → re-setup
particleSize     slider    stroke px
noiseScale       slider    base-flow feature size (like Flow Field)
fieldDrift       slider    0–1   how fast the base flow morphs over time
gravityInfluence slider    0–2, default 1  how strongly the wells bend the flow
speed            slider    0–3, default 1  flow speed (0 freezes)
maxWells         slider    1–12, default 5          help: "max gravity fields at once"
wellLifespan     slider    1–60 s, default 18       help: "how long each field lasts"
forceMin         slider    −2…+2, default −0.4      help: "signed bend — negative repels,
forceMax         slider    −2…+2, default +1.5            positive attracts"
fadeTrails       toggle    (reused)
trailLength      slider    0–100, default 88 (reused)
blend            segmented lighten | screen | normal (reused enum)
color            group     reused color group; sources flow-angle | field | x | y
background       color     near-black default
seed*            number    int, structural → re-setup
```

`*` = structural: `update?()` returns false for these → framework re-runs
`setup`. Everything else live-applies inside `update?()`.

## Reuse vs new

- **Reused verbatim:** color group (+ gradient machinery + `sampleGradient`),
  trail mechanism (`trailFadeAlpha`/`toHex2`), blend enum, background, seed, the
  lifespan-respawn, the noise field (`makeNoise3D` from flow-field).
- **Genuinely new:** the transient well system (spawn / fade envelope / ring
  markers), the `noise ⊕ gravity` field blend, the inverse-linear softened
  gravity vector with whole-field reach, the padded-bounds recycle, the `field`
  (gravity-strength) gradient color source.

## MUST (from the project's vetting ethos)

- **Unattended-death guard:** wells must keep turning over. `maxWells ≥ 1` and
  a finite `wellLifespan` are enforced by schema bounds, so the field always
  evolves and never freezes into a static poster. (Inherent to the design.)
- **Softening is non-negotiable** — never divide by raw `r²`; always
  `r² + SOFTENING²`. Guard the stepped position against non-finite (recycle if so).
- **Coherence over chaos** — particles are 1st-order field followers (no
  per-particle momentum / random launch velocity); that is the whole reason this
  reads as a pleasing flow rather than criss-crossing noise.
- **HiDPI:** 2D context is DPR-scaled (size backing store to `cssW*dpr`,
  `setTransform(dpr,…)`), reapplied on resize — same as Flow Field.
- **Sliders need min/max** (all do); **persistent help** on `maxWells`,
  `wellLifespan`, `gravityInfluence`, and the force range.

## update() seam

`speed` / `noiseScale` / `fieldDrift` / `gravityInfluence` / force range /
`maxWells` (grow/shrink active set) / fade / trail / blend / color → apply live
(swap `state.cfg`, adjust the live well pool), return true. `particles` count /
`seed` → return false → teardown + setup.

## Out of scope (backlog)

- Drifting / orbiting wells (move during their life).
- True N-body (particles attracting each other).
- Curl/tangential gravity term (would add true orbiting swirl around wells).
- Per-well lifespan as a user-visible *range* (v1 uses a single `wellLifespan`
  with internal jitter for stagger).
</content>
