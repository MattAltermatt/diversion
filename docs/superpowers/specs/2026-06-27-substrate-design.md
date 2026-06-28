# Substrate — design spec

**Issue:** #47 · **Date:** 2026-06-27 · **Status:** approved, ready for plan

A clean-room reimplementation of **Jared Tarbell's _Substrate_**
(complexification.net) as a Diversion. Straight "cracks" grow across the canvas,
branch off one another at right angles, and stop when they meet an existing
crack or the edge. As each crack travels it shoots a **perpendicular sand-painter
ray** outward to its nearest neighbouring crack, washing the cell beside it with
soft translucent colour. The result is an organic crack network — dried mud,
city street-maps, nervous systems — with watercolour-filled cells, growing on a
never-cleared ground until a timer or coverage threshold triggers a fade and a
fresh regrow.

## Provenance & licensing

Same posture as Sand Stroke (#48), per [[reference-tarbell-ports]]:

- complexification.net carries **no Creative Commons license** — only a bare
  `© Jared Tarbell` notice plus an informal "source open, modifications
  encouraged, please credit" ethos.
- **Algorithms are not copyrightable** (17 U.S.C. §102(b)); only a specific code
  _expression_ is. This is a **clean-room reimplementation** written from the
  published algorithm — **not** a line-by-line port of his `.pde` — so it is not
  a derivative work. The repo stays **MIT**.
- **Credit:**
  - Source-header comment in `index.ts` / `substrate.ts`:
    `// Substrate — clean-room reimplementation of the algorithm from Jared`
    `// Tarbell's "Substrate" (complexification.net). Not a code port.`
  - README "Credits / Inspiration" line crediting Tarbell with a link to
    `http://www.complexification.net/gallery/machines/substrate/`.

## The original algorithm (verified)

```text
• Light canvas, painted ONCE, NEVER cleared during growth — pure accretion.
• Seed a few cracks at random positions + angles.
• Each frame, every active crack advances a small step (~0.42px) along its
  straight heading and inks a dark point at its head.
• An occupancy grid (1 cell / pixel) stores the QUANTIZED ANGLE (0..360) of the
  crack occupying that cell; a sentinel marks empty.
    - Cell ahead is empty OR holds an angle within ~5° of the crack's own
      heading (its own line / a near-parallel neighbour) → continue; write this
      crack's angle into the cell.
    - Cell holds a clearly different angle (another crack) → STOP this crack.
    - Off the canvas edge → STOP.
• On STOP, the crack RELOCATES (Tarbell recycles the object): pick a random
  already-inked point, head off perpendicular (±90°) to that point's crack,
  plus a small branch-angle jitter. The active-crack count therefore stays
  roughly constant; new cracks are also activated over time up to a cap.
• Perpendicular watercolour fill (the Substrate signature): from the crack head,
  march perpendicular to its heading, pixel by pixel, until an inked cell or the
  edge is reached → that endpoint bounds the wash. A sand painter then lays
  grains along the segment head→endpoint:
    - grains ≈ 64; per-grain position = lerp(head, endpoint, sin(sin(i·w)))
      where w = gain/(grains−1), gain random-walks in [−0.22, 0.22].
    - per-grain alpha falls off ≈ 0.1 − i/(grains·10) toward the far end.
    - colour = a per-crack palette pick (somecolor()).
  Filling to the NEAREST NEIGHBOUR is what gives each polygon cell its bounded
  watercolour wash.
• In the original this runs forever (cracks perpetually relocate). It never
  stops or clears on its own.
```

## Adaptation to the framework

Faithful to the **look**, scaled to a responsive canvas and given a
screensaver lifecycle the original lacks.

### Lifecycle (our addition)

A two-phase state machine drives the screensaver loop:

```text
GROWING ──(Draw-time timer expired  ‖  coverage ≥ ~55%)──▶ FADING
FADING  ──(buffer faded to background)──────────────────▶ GROWING (reseed)
```

- **GROWING** — cracks advance, ink, fill, and relocate-on-stop as above, up to
  the active-crack cap (`Max cracks`). The buffer is never cleared.
- **Reset triggers** (whichever fires first):
  1. **Draw time** — a user-set duration (seconds) since this cycle began.
  2. **Saturation** — "no open space left for new rays," measured directly: an
     exponential moving average of the **perpendicular ray length** (steps each
     `regionFill` marches before hitting a neighbour or edge). When the average
     ray falls below a hardcoded **~3 px** — after a short warm-up (cycle elapsed
     > ~2 s, so an empty early canvas can't false-trigger) — the canvas is full
     → auto-restart. This is canvas-size-independent and matches the literal
     "nowhere left to place a ray" rule far better than a crack-cell coverage
     fraction would (the grid marks only the thin crack lines — a fraction of
     the canvas even when visually packed).
- **FADING** — over `Fade time` seconds, the whole accretion buffer lerps toward
  `background`. When fully faded, the grid + ray-average reset, fresh cracks are
  seeded (with a per-cycle-varied seed so each cycle is a *new* network yet the
  whole sequence is reproducible from `seed`), and the cycle restarts.

### Buffer & rendering (reuse Sand Stroke's proven approach)

- A never-cleared **`Uint8ClampedArray` RGBA buffer in CSS pixels** holds the
  painting (both the dark crack ink and the colour washes), written via a local
  `blendPixel` (`tpoint`-style lerp toward a colour).
- Blitted through a cached **offscreen canvas + `drawImage`** so the DPR-scaled
  main 2D context upscales the CSS-px buffer crisply (the `index.ts` pattern from
  Sand Stroke, including the `offscreens` WeakMap and resize-aware rebuild).
- `setup` paints `background` once on the visible canvas to avoid a first-frame
  flash, then builds state.

### Occupancy grid

- An **`Int16Array` of `w·h`**, initialised to a sentinel (empty). Stores each
  inked cell's quantized crack angle (0..360). Used for both collision (the
  angle-difference test) and the perpendicular-ray endpoint search.
- A **`rayAvg`** exponential moving average of `regionFill` ray lengths feeds the
  saturation test (see Lifecycle).

### Determinism

- **Per-crack seeded RNG streams** (`mulberry32(seedFor(seed, i))`), as in Sand
  Stroke's per-sweep streams — so the gain/colour walk of each crack is consumed
  in its own order, independent of how many steps *other* cracks take per frame.
  Same seed at a given frame cadence → the same network; across frame rates the
  network character reproduces though exact pixels can drift.

### Sand-painter fill (decision A — faithful ray-march)

Each step, ray-march perpendicular from the crack head until an inked cell or the
edge is hit, then sand-paint head→endpoint with the `sin(sin(i·w))` grain
distribution and alpha falloff. Self-limiting (rays shorten as the canvas fills)
and guarded by a **max-ray-length cap** so per-step cost never spikes. The
rejected alternative (fixed-length perpendicular band) was cheaper but loses the
fill-to-neighbour cell wash that *is* Substrate.

## Config schema (single source of truth)

`schema.ts` — one Zod object, grouped into subpanel `section`s, reusing the
shared palette/gradient `color` group shape from Sand Stroke.

```text
GROWTH
  initialCracks   int   2–10    default 3     seed lines at cycle start            (structural → re-setup)
  maxCracks       int   50–500  default 200   cap on SIMULTANEOUSLY-ACTIVE cracks  (structural → re-setup)
  speed           num   slider  default ~30   crack advance, px/sec
  branchJitter    num°  0–8     default 2     angle wobble off the ±90° spawn

LIFECYCLE
  drawTime        num s 5–180   default 30    seconds before the timed reset
  fadeTime        num s 1–6     default 3     fade-out duration

SAND
  grainDensity    int   16–128  default 64    grains per perpendicular ray
  grainOpacity    num   0.02–0.3 default 0.1  alpha at the ray's dense end

LINE
  crackColor      #rrggbb       default #2a2a2a   the thin dark crack ink

COLOR (reused palette/gradient group)
  background      #rrggbb       default #f4efe4   cream ground (never-cleared)
  color.mode      palette | gradient
  color.colors    hex8[]        wash colours, palette mode (each crack picks one)
  color.source    y | x         gradient source
  color.stops     hex8[]        gradient stops

ADVANCED
  seed            int           default 2917          same seed → same network     (structural → re-setup)
```

- **`maxCracks` help text** must state it is the *active-crack cap*, not a stop
  condition (saturation is the coverage threshold, a separate thing).
- The **~55% coverage threshold** and Tarbell's **±0.22 sand-gain clamp** are
  hardcoded faithfulness constants, not knobs.
- Slider fields all carry `min`/`max`/`step`; open-ended `seed` is `ui:'number'`
  (UX invariant #4).

## Live-apply vs re-setup (`update`)

`update(state, config, size)` returns `true` after live-applying **visual**
params (speed, branchJitter, drawTime, fadeTime, grainDensity, grainOpacity,
crackColor, the whole `color` group). It returns **false** — forcing a full
teardown + `setup` — for **structural** changes that can't be applied to an
in-progress network: `initialCracks`, `maxCracks`, `seed`, `background`.
`resize` rebuilds buffer + grid and reseeds (accretion resets), as Sand Stroke.

## Module layout

```text
src/diversions/substrate/
  schema.ts        Zod schema above + SubstrateConfig type
  substrate.ts     pure, DOM-free, unit-tested:
                     • createSubstrateState / stepSubstrate / updateSubstrateState
                       / resizeSubstrateState
                     • crack advance + collision (occupancy grid, angle test)
                     • relocate-on-stop (findStart) + active-crack ramp
                     • perpendicular ray-march + sand-painter deposit
                     • lifecycle state machine (phase, elapsed, covered, fade)
                     • LOCAL copies of mulberry32 / parseHex8 / blendPixel /
                       sampleGradientRGBA / seedFor (self-contained, per
                       convention — NOT a shared geometry helper)
  index.ts         Diversion contract + offscreen-canvas blit (DPR), header credit
  substrate.test.ts   unit tests (below)
  schema.test.ts      schema defaults / meta / slider-bounds
```

The registry auto-discovers the new folder via `import.meta.glob` — no
registration needed.

## Testing (anti-regression)

Vitest, co-located. Pure logic only (no canvas):

- **Collision:** a crack stepping into a cell holding a clearly-different angle
  STOPS; a crack stepping into empty / near-parallel (±5°) cells CONTINUES and
  writes its angle.
- **Relocate-on-stop:** a stopped crack repositions onto an already-inked point
  with a perpendicular (±90° ± jitter) heading; active-crack count is preserved
  and ramps toward `maxCracks`.
- **Ray-march:** the perpendicular endpoint search stops at the first inked cell
  and at the edge; respects the max-ray-length cap.
- **Sand grain math:** `sin(sin(i·w))` lerp positions and the alpha falloff are
  monotone / within expected bounds at representative `grainDensity`.
- **Lifecycle:** `elapsed ≥ drawTime` → enters FADING; a forced-low `rayAvg`
  (after warm-up) → enters FADING before the timer; FADING completes after
  `fadeTime` (buffer ≈ background) and reseeds with a varied per-cycle seed.
- **Determinism:** same seed + same dt sequence → identical crack headings /
  palette picks (per-crack stream check).
- **Schema:** defaults parse; every slider field has min/max/step; `seed` is
  `ui:'number'`; structural-vs-visual split matches `update`.
- **Codec:** covered by the global `urlKeys.test.ts` leaf-name guard — confirm
  no leaf-name collision with existing diversions' schemas.

## The five UX invariants

1. **Readability** — high-contrast dark ink on a light ground; washes feather.
2. **Discoverable** — every param in a labelled subpanel; gradient-only fields
   use `showWhen`.
3. **Inline help** — `.meta({ help })` on each field; especially the `maxCracks`
   "active cap" clarification and the speed/draw-time relationship.
4. **Sliders only with bounds** — all bounded fields are sliders; `seed` is a
   number input.
5. **Contrast** — default cream ground + dark crack ink + saturated washes.

## Out of scope (backlog)

- **Circular / curved cracks** — filed as **#50** (depends on #47). A curvature
  term on the heading update; everything else (grid, fill, lifecycle) unchanged.
- **Crossfade between networks** (instead of fade-to-background) — richer reset,
  noted during brainstorm; revisit if the fade feels abrupt.
