# Gray-Scott Reaction-Diffusion (#35) — design spec

**Status:** approved 2026-06-29 · **Issue:** #35 · **kind:** `webgl` · **Family:** reaction-diffusion / organic Turing patterns · **emergent** cohort

Two virtual chemicals **U** and **V** diffuse and react across a grid in ping-ponged float
textures, growing spots / stripes / maze / mitosis patterns that never settle. The strongest
*distinctness* on the slate (cellular Turing patterns are unlike anything shipped) and the best
unattended performer — mitosis/healing churn forever. Now unblocked: its hard dependency
(*"requires a proven FBO / ping-pong pattern"*) is satisfied by the shipped **Physarum** host.

## Reaction model

```
∂u/∂t = Du·∇²u − u·v²   + F·(1−u)
∂v/∂t = Dv·∇²v + u·v²   − (F+k)·v
```

- `∇²` is a 9-point Laplacian (4-neighbor weight 0.2, diagonal 0.05, center −1).
- Baseline diffusion `Du ≈ 0.16`, `Dv ≈ 0.08`, `dt = 1.0` (🎚️ tuning, confirm at verify).
- `F` (feed) and `k` (kill) are the entire visual character — same code, different worlds.

## Architecture

- **Host:** WebGL2, `kind: 'webgl'`, reusing the Physarum ping-pong-FBO host pattern.
- **State textures:** two `RG32F` textures holding `(U, V)`; ping-pong each sub-step.
  Full float (not `RG16F`) — Gray-Scott's slow feed/kill accumulation on the thin viable
  manifold is precision-sensitive, and half-float banding can destabilize the reaction.
  Capability-gated on `EXT_color_buffer_float` — if render-to-float is unavailable, fail
  gracefully (skip the diversion / static notice), never a hard crash.
- **Frame:** run `simSpeed` sub-steps of the sim shader (Laplacian + reaction, ping-ponging),
  then one display pass mapping the **V** channel through the gradient sampler.
- **Resolution:** sim grid capped to **~640 texels on the long edge, aspect-preserved,
  decoupled from canvas DPR**. Bounds GPU cost on 4K/retina and keeps patterns isotropic.
  `~640` is a 🎚️ tunable confirmed at verify; internal constant in v1 (no user knob).
- **Per-frame** `gl.viewport(0,0,drawingBufferWidth,drawingBufferHeight)`; `teardown(state)`
  frees GL resources (program/VAO/FBO/textures) — host leak rule, the `webgl2` context
  persists across gallery navigation.
- **Resize is destructive:** reallocates both state textures + reseeds → the pattern visibly
  restarts. Acceptable; noted in the diversion's `resize`.

## Schema (single source of truth)

```
pattern    enum  coral | mitosis | maze | spots | worms     PRIMARY — each = a feed/kill/diffusion triple
simSpeed   slider 1..24  default 12    sub-steps per frame
  ── Advanced (collapsed subpanel, showWhen) ──
  feed     slider, clamped to the live band, per-preset default, persistent help
  kill     slider, clamped to the live band, per-preset default, persistent help
color      gradient palette group (see Presets)
seed       number
```

### MUST (carried from the issue's vetting gauntlet)

1. **Feed/kill UX is the killer.** Viable Gray-Scott params live on a thin curved manifold;
   ~80–90% of the raw `F`×`k` rectangle is a dead-gray screen, and `F`/`k` are coupled.
   The PRIMARY control MUST be the **named-pattern enum**. Raw `feed`/`kill` are advanced,
   **clamped to the live band**, with persistent help: *"most values outside the preset give a
   blank field — nudge gently."*
2. **`update?()` seam is load-bearing.** `feed` / `kill` / `color` → swap uniforms,
   **return true** (sim keeps evolving). `pattern` (reseed) / `seed` / resolution →
   **return false** → teardown + setup. Without this, every slider nudge wipes the pattern.
3. **Float-texture renderability:** WebGL2 render-to-float needs `EXT_color_buffer_float` —
   capability-check + graceful fallout. **Cap sim resolution** (decouple from canvas device-px).
4. **Resize is destructive** — note in `resize`.

## Presets — two independent axes (declared `PresetGroup` data)

**Pattern** (sets feed/kill/diffusion; reseed → `update?()` returns false):

```
pattern   feed    kill    note
coral     0.0545  0.0620  iconic labyrinth / coral
mitosis   0.0367  0.0649  cells endlessly divide
maze      0.0290  0.0570  winding corridors
spots     0.0140  0.0540  moving spots / u-skate gliders
worms     0.0260  0.0510  worms / fingerprints
```
(Values are 🎚️ starting points from Pearson's classification — confirm at Chrome-verify.)

**Color** (gradient palette; live-swap → `update?()` returns true):

```
Deep Coral   #06121f → #0a4f6e → #58d8ff    glowing structures in deep water
Ink Bloom    #f5f1e6 → #6b5b4a → #14110d    sumi-e on light substrate
Magma        #0a0500 → #b23a00 → #ffd27f
Bone         #0c0c10 → #5a5a66 → #f0f0f5
```

Defaults: `pattern = coral`, `color = Deep Coral`. High contrast (UX invariant #5).

## Files

Mirror `src/diversions/plasma/` and `src/diversions/physarum/`:

```
src/diversions/grayscott/
  index.ts      diversion contract { id, title, description, kind, schema, setup, frame, resize, update, teardown }
  schema.ts     Zod schema + presets (PresetGroup[])
  *.glsl|.ts    sim shader (Laplacian + reaction) + display shader (V → gradient)
```

## Tests (Vitest, co-located)

- URL codec round-trip + per-field resilience (the keystone) for the new schema.
- Preset-patch application (`matchPresets` flips to Custom on manual drift).
- Capability-fallback path (no `EXT_color_buffer_float` → graceful, no throw).
- Pure-logic determinism where extractable: Laplacian kernel weights, reaction step,
  seeded-init reproducibility.

## Out of scope → backlog

- User-facing **"Detail"** resolution enum (Coarse/Medium/Fine).
- Raw `F`/`k` free-roam beyond the per-preset clamped bands.
- Additional patterns beyond the five (e.g. "u-skate world", "solitons").
