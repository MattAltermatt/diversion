# Physarum — design spec

**Issue:** #134 · **Family:** agent + trail field · **kind:** `webgl` · **port:** hard
**Date:** 2026-06-29

Physarum slime-mold simulation (Jones 2010): thousands–millions of agents sense and
follow a pheromone trail field they themselves deposit; the field diffuses and decays.
The emergent result is a constantly-rewiring transport network — branching veins, webs,
and Voronoi-like foams that read as a living organism. Excellent unattended.

This is the project's first multi-pass float-FBO WebGL diversion; it proves the
ping-pong pattern that Gray-Scott (#35) will reuse.

## Locked decisions (from brainstorm)

1. **All-GPU architecture.** Agents live in a float texture; the whole sim runs on the
   GPU across four passes. (Rejected: CPU-agents + GPU-trail — needs a per-frame
   GPU→CPU readback stall and caps at ~50k agents; all-CPU 2d — full-res diffuse in JS
   is the bottleneck.) All-GPU is the canonical Jones-2010 / mxsage approach and the
   scale is what makes it read as alive.
2. **Density → gradient ramp** for color. Normalized trail density maps through a
   multi-stop gradient (baked to a 256px LUT). Mono falls out as a single-hue palette.
   (Rejected: heading/velocity tint — too loud for the Zen ethos; noted in backlog.)
3. **Three behavior presets** — Networks (default) / Coral / Veins — plus a Color
   palette axis. Two independent preset groups, mirroring Flow Field's Flow + Color.
   (Coral/Veins were named Foam/Filaments in the brainstorm; renamed during Chrome
   verify to match the morphology each regime actually produces.)

## Architecture

The framework hands `frame(state, gl, t, dt)` the live `WebGL2RenderingContext` and we
own everything inside it (plasma does one fullscreen pass; Physarum does several passes
into FBOs, ending with a screen blit). The host already handles context-loss/restore
(rebuild via `setup`), per-frame viewport, and `teardown` resource freeing.

### State textures (ping-pong pairs)

```text
agents : RGBA32F   (x, y, heading, _)    dim = nextPow2(ceil(√count))   texelFetch / NEAREST
trail  : R16F      scalar density         sized to backing store         LINEAR
```

- `agents` holds one agent per texel: normalized position `(x, y) ∈ [0,1)` and `heading
  ∈ [0, 2π)`. Read in shaders via `texelFetch` (NEAREST) — no float-linear extension
  needed. The texture is the next power-of-two square ≥ √count, so the texel count ≥
  the agent count; surplus texels are inert (their points deposit but are harmless, or
  are masked by a count uniform — see Open mechanics).
- `trail` is a single-channel half-float density field, ping-ponged. R16F linear
  filtering is core in WebGL2, so sensor taps and the display pass sample it smoothly.

### Per-frame passes (repeated `speed` steps per frame)

```text
1. move           bind agents-dst FBO; render fullscreen over agents-src.
                  Each fragment = one agent: sample trail (LINEAR) at three sensor
                  points — center, +sensorAngle, −sensorAngle, each sensorDist ahead —
                  steer heading toward the strongest by turnSpeed, advance by step size.
                  Write new (x, y, heading). Wrap position at edges. Ping-pong agents.
2. deposit        bind current trail FBO; additive blend (blendFunc ONE, ONE).
                  Draw N GL_POINTS; vertex shader texelFetches each agent's position
                  → gl_Position, gl_PointSize = 1; fragment outputs depositAmount.
3. diffuse+decay  bind trail-dst FBO; read trail-src. 3×3 box blur, mixed with the
                  unblurred value by `diffuse`, then × (1 − decay). Ping-pong trail.

after the steps:
display           bind default framebuffer; fullscreen pass samples current trail,
                  tonemaps density to [0,1], indexes the 256px gradient LUT → opaque
                  screen output. Viewport set here (per-frame, as plasma does).
```

Pass order (move sensing the current field, then deposit, then diffuse+decay) is the
provisional Jones-2010 ordering; final order/tuning is settled in Chrome verify.

### Shipped mechanisms (settled during implementation + research)

Three mechanisms beyond the bare brainstorm sketch turned out to be load-bearing for
producing living morphologies rather than artifacts. They were found by reading the
canonical Jones-2010 / Bleuje / Sage-Jenson sources after the first presets read as
dots and dead striations (user directive: *"research and find the tweaks"*).

1. **Stochastic turn (Jones 2010).** The `move` shader is not deterministic: when the
   center sensor is *strongest*, continue; when it is *weakest*, turn left **or** right
   at random (hashed per-agent per-frame via `u_frame`); otherwise turn toward the
   stronger side. Without the random branch agents march in lockstep and the field
   shows comb/fan artifacts in every regime — a **mechanism** bug, not tuning.
2. **Respawn lifecycle (Sage Jenson `reinitSegment`).** Each agent carries a progress
   phase in channel `w`, randomised at init so respawns are staggered, not synchronous.
   On each step the phase advances; when it wraps (`u_respawn` ≈ 0.002/step ⇒ ~500-step
   lifetime) the agent teleports to a fresh random position. This is the mechanism that
   lets dense regimes (Coral) form at all — without it agents pile onto a few
   streamlines and the morphologies collapse. The single most transformative fix.
3. **Trail-resolution cap (`TRAIL_MAX_SIDE = 2560`).** The trail field is sized to the
   backing store but its longest side is capped (aspect preserved), so 4K/5K displays
   don't pay an unbounded diffuse cost and density reads consistently across screen
   sizes. The display pass samples the capped field in normalized UV with LINEAR, so it
   stretches to fill any viewport — which is also why `resize` can stay a no-op.

### Color LUT

The `Color` group carries a gradient `stops` array (hex). On color change, `buildLUT`
samples the stops via the framework's `sampleGradientRGBA` at 256 evenly-spaced points
into a `Uint8Array(256*4)`, uploaded to a 256×1 RGBA8 texture (LINEAR). The display
shader indexes it by tonemapped density. Stop 0 is the dark/background tone (density 0),
so no separate background field is needed.

### Float-target handling

`setup` requests `EXT_color_buffer_float` (enables R16F **and** RGBA32F as render
targets in WebGL2). If absent, throw `Error('Physarum requires float render targets
(EXT_color_buffer_float)')` — the `DiversionErrorBoundary` catches and surfaces it.
No other extension is required: R16F linear filtering is core WebGL2, and the agent
texture is read by `texelFetch` (NEAREST), so `OES_texture_float_linear` is not needed.

## Lifecycle (`update` / `resize` / `teardown`)

Mirrors the plasma/flow-field split:

- **`update` returns `true`** (live, no re-setup) for uniform params: `sensorAngle`,
  `sensorDist`, `turnSpeed`, `depositAmount`, `decay`, `diffuse`, `speed`. On a `Color`
  change it rebuilds the LUT texture in place.
- **`update` returns `false`** (structural → full re-setup) for `agents` and `seed`,
  which resize/reseed the agent texture.
- **`resize` is a no-op.** The display pass samples trail in normalized UV and always
  covers the screen, so the simulation survives window/fullscreen resizes with no
  reallocation and no reseed (the organism keeps living). Large aspect changes introduce
  mild anisotropy in sensor geometry — acceptable for a screensaver.
- **`teardown`** deletes every program, FBO, and texture. The host keeps the `webgl2`
  context on the canvas across gallery navigation, so anything unfreed leaks.

## Schema (single source of truth)

Sections drive the form layout. Every field carries persistent `help`. Sliders only
where bounds are real (all of these are bounded). Initial defaults below are provisional
and tuned to calm in Chrome verify — the diversion is unreleased, so numbers are set
freely (no balance-change gate until release).

```text
Behavior
  sensorAngle    deg     slider  5 … 60     default 22.5   angle of the L/R sensors off-heading
  sensorDist     texels  slider  1 … 30     default 9      how far ahead the sensors taste
  turnSpeed      deg     slider  5 … 90     default 22     how sharply an agent steers toward food
  depositAmount  —       slider  0.1 … 5    default 1      trail laid per agent per step
  decay          —       slider  0 … 0.3    default 0.10   fraction of trail lost per step
  diffuse        —       slider  0 … 1      default 1      blend toward the 3×3-blurred field (spread)

Simulation
  agents         count   slider  1e4 … 1e6  default 1e6    number of agents (structural — re-setup)
  speed          steps   slider  1 … 3      default 1      sim steps per frame (faster evolution)
  seed           int     number  —          default 7      same seed → same start (structural)

Color  (group)
  stops          hex[]   colorList 2 … 8    default Bioluminescence ramp   density → color ramp
```

`agents` rounds internally to the agent-texture's pow2 capacity; the displayed value is
the requested count.

## Presets (two independent axes)

**Behavior** — patches `sensorAngle, sensorDist, turnSpeed, depositAmount, decay,
diffuse` (agents/speed/seed stay user-controlled):

- **Networks** (default) — moderate sensor angle (~22°), longer reach, gentle decay →
  bold transport cells with reticular fill spanning the screen. The calm unattended
  default. `{22.5, 9, 22, 1, 0.10, 1}`.
- **Coral** — high sensor angle, short reach, fast turn → a dense tangle with radial
  sunbursts, reading as branching coral. `{45, 4, 40, 1.4, 0.06, 0.8}`.
- **Veins** — small sensor angle, long reach → fine dendritic leaf-vein branching that
  re-routes across the field. `{9, 14, 14, 0.8, 0.12, 0.5}`.

**Color** — patches the `color` group:

- **Bioluminescence** (default) — deep-blue → cyan → white.
- **Ember** — near-black → red → gold.
- **Mono** — near-black → single hue → white.

Exact preset numbers are finalized during Chrome verify alongside the defaults.

## Testing

Pure logic is unit-tested (Vitest, co-located); GL passes are verified visually in
Chrome (it must look *alive*, not merely render).

- **`agents.ts`** — `initAgents(seed, count)`: deterministic (same seed → identical
  array; different seed → different), positions ∈ [0,1), headings ∈ [0, 2π).
  `texDimFor(count)`: next-pow2 square with dim² ≥ count. `buildLUT(stops)`: length
  256×4, endpoints match stop[0] / stop[last].
- **`presets.ts`** — every behavior and color preset patch validates against the schema
  (also covered by the framework's `presetSweep`).
- **Codec / URL keys** — covered automatically by the framework's `codecSweep` /
  `urlKeys` auto-discovery sweeps (registry picks up the new folder).
- **Chrome verify** — Networks/Coral/Veins each reach a living, rewiring network;
  palettes read with high contrast on dark; resize keeps the organism alive; no GL
  errors; long-run stability (no NaN blow-up in the float field).

## UX invariants (MUST)

1. **Readable** — density mapped bright-on-dark, high contrast.
2. **Discoverable** — collapsible sections + preset dropdowns; every knob has help.
3. **Inline help** — persistent `.meta({ help })` on every field.
4. **Sliders bounded** — all numeric params have real min/max; no open-ended sliders.
5. **Err toward contrast** — default palettes are dark-ground, luminous-network.

## Open mechanics (settled during implementation)

- **Surplus-texel masking** — whether to mask inert agent texels (count < texel
  capacity) with a count uniform, or let their deposits stand (harmless, they still
  behave as real agents). Default: treat all texels as real agents and snap the
  displayed count to capacity if simpler; decide when wiring `move`/`deposit`.
- **Tonemap curve** — linear vs log/`1−exp(−k·d)` density compression for the display.
  Pick whichever reads best in Chrome (log/exponential likely, to keep dense hubs from
  clipping while faint filaments stay visible).
- **Step size** — agent advance per step (texels/step); provisional ~1, tuned in Chrome.

## Backlog (out of scope)

- Heading/velocity hue tint as an alternate color mode (brainstorm option C).
- Obstacle / mask seeding (agents avoid painted regions).
- Multi-species (two agent populations with cross-deposit rules).
