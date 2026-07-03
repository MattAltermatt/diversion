# Hextrail — design spec

**Port of** xscreensaver's `hextrail` by Jamie Zawinski (clean-room, MIT, credited).
**Issue:** #108. **kind:** `2d`. **Look:** glowing colored arms grow outward along a
hex lattice, branching hex→hex into a sparse tree, filling the field, then the whole
thing fades on a slow breath and reseeds.

## Verified mechanic (from the real `hacks/glx/hextrail.c`)

- **Pointy-top hex lattice, axial coords.** Each hex has 6 `neighbors` and 6 `arms`
  (index-aligned). Every **edge** between two hexes is **two arm records**:
  `h0.arms[j]` and `h1.arms[(j+3)%6]`.
- **Arm state machine:** `EMPTY → OUT → DONE` on the origin hex; the paired arm goes
  `EMPTY → WAIT → IN → DONE` on the neighbor. `ratio` is **monotonic 0→1** in both
  `OUT` and `IN` (IN is a *second forward leg*, NOT a retraction).
  - `OUT`: draws a segment from h0 **center → shared-edge midpoint** as ratio 0→1.
  - On `OUT` complete: arm→`DONE`; the neighbor's paired `WAIT` arm flips to `IN`
    (ratio reset 0). liveCount unchanged.
  - `IN`: draws from shared-edge midpoint → **h1 center** as ratio 0→1.
  - On `IN` complete: arm→`DONE`; `liveCount--`; call `addArms(h1)` → h1 sprouts.
- **`addArms(h)`** picks `1..N` random neighbors that are **entirely empty**
  (`isHexAvailable` = all 6 of the neighbor's arms `EMPTY`) → keeps the structure a
  **tree (no cycles)**. Branch count weighted toward 1: `p(1)=.6 p(2)=.25 p(3)=.1
  p(4)=.05`, clamped to available-empty-neighbor count, forced ≥1 if any empty.
- **Color drift:** each hex carries a scalar `u ∈ [0,1]`. A child inherits the
  parent's `u`; with `driftChance` (default 0.2 = jwz's 1-in-5) it steps `+1` palette
  stop. Segment color = `sampleGradientRGBA(colors, u)`; edge endpoints blend the two
  hexes' `u`. Ramp mode clamps at 1; cyclic mode (`colorWrap`) wraps.

## Lifecycle — 4-phase breath (LOAD-BEARING, guards the collapse/strobe bugs)

`GROWING → HOLD (~2s) → FADING (~3s eased) → reseed → GROWING`

- **`liveCount == 0` is a fill-progress signal, NOT a reset trigger.** On
  `liveCount==0`: if coverage < `fillFraction` **and** empty hexes remain → inject a
  fresh seed at a random empty hex and continue growing. Only when coverage is high /
  no reachable empties → enter HOLD then FADING. (Absolute coverage gate, not
  proportional — CA-quiescence gotcha.)
- Fade is a **fixed-duration eased wash** to `background` on the accumulation buffer
  (not a one-frame clear, not exponential decay) — reads as a breath.
- Reseed derives `nextSeed = floor(rng()*2^32)` from the **persistent** mulberry32
  stream → same `?seed=N` reproduces the whole sequence at a fixed canvas size.

## Calm knobs (default = ZEN end)

```
hexSize      28    12–60   px radius — STRUCTURAL; a LOOK-in-Chrome default
growthSpeed  10    2–60    arms activated/sec (fixed-timestep accumulator, frame-indep)
branchiness  0.35  0–1     P(extra arms beyond 1)
maxDoing     220   40–800  global active-arm cap — the master calm lever
seeds        1     1–6     simultaneous origins (1 = one coherent bloom)
fillFraction 0.9   0.3–1   reachable coverage before HOLD
holdSeconds  2     0–6
fadeSeconds  3     1–6
driftChance  0.2   0–0.6
glow         0.6   0–1     halo shadowBlur (tinted to segment color)
coreWidth    2.5   1–4     bright core stroke px (DPR-constant)
colors       colorList (palette)      background  color
colorWrap    bool  (ramp vs cyclic)
seed         randomizeOnFreshLoad
```

## Render (2D, accumulate-once)

- Private **DPR-scaled offscreen canvas**, `WeakMap<State>`-cached, rebuilt on resize.
  Completed delta segments are stroked **once** into it; blitted 1:1 each frame.
- **Two-layer glow, source-over (never `'lighter'` — blowout gotcha):** HALO first
  (fat ~`hexSize*0.45`, alpha ~0.12, `shadowBlur=glow*14`, `shadowColor=segColor`),
  then CORE (thin `coreWidth`, alpha 1, no blur). Keeps hue at 6-arm hex junctions.
- FADING washes the buffer; active tips optionally redrawn brighter on the main ctx
  post-blit (O(active), never baked).
- `lineCap/lineJoin = 'round'` to hide sub-pixel seams. Grid overscanned one ring.

## Presets (two axes, mirrors differential-growth)

- **Palette:** Neon (`#0b1e5c…#ff9de8`), Ember (`#3a0a06…#ffe9b0`), Aurora
  (`#052b1a…#b98cff`), Prism (cyclic). Landing = **Neon**.
- **Pace:** Zen (1 seed, slow, big hex) / Bloom (3 seeds) / Cascade (5 seeds, fast).

## Files & tests

```
src/diversions/hextrail/{schema,hex,grow,render,index,presets}.ts + *.test.ts
```

- `hex.test`: axial↔pixel round-trip; `ARM_DIRS[j]` matches neighbor-j delta;
  **neighbor symmetry** (`h.neighbors[j]===B ⇒ B.neighbors[(j+3)%6]===h`);
  **edge-midpoint equality keystone** (`edgeMid(h,j)===edgeMid(B,(j+3)%6)`).
- `grow.test`: determinism (same seed → identical segment sequence); tree invariant
  (a hex is never re-targeted once any arm ≠ EMPTY); branch count within bounds;
  `liveCount` reaches 0 / fade fires on a finite lattice; reseed never wedges.
- `index.test`: smoke-mount a few frames, no throw; render uses only
  `moveTo/lineTo/stroke` (no Path2D — jsdom smoke gotcha).

## Front-loaded de-risking (adversarial probes)

1. **Headless fill-curve harness** before rendering — sweep branch dist × `maxDoing`,
   confirm coverage climbs smoothly and `liveCount` only tapers to 0 at high coverage.
2. **Verify the DENSE frame** (fast-forward to full fill) — screenshot for white-soup
   center / muddy joints; perf-trace at max arm count.
3. **Geometry equality test FIRST** — makes seam-free joints structural.
