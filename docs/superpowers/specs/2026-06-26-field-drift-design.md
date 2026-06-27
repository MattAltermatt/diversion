# Field Drift — organic morph over time (#28)

**Issue:** #28 — animate the Flow Field over time so the field itself slowly morphs (sinks drift, streams bifurcate and rejoin), continuously — not the discontinuous jump a seed change causes.

**Decisions locked in brainstorm (2026-06-26):**
- **Feel = organic morph (B)**, not directional drift. The field deforms continuously; streamlines bifurcate and rejoin. No snapping.
- **Static handling = fresh hash-based 3D noise (B).** Not preserving today's exact per-seed field. Acceptable: the diversion is unreleased (looks free to change pre-release).
- **Control = a variable `Field Drift` slider.** `0` = frozen (nothing moves), higher = obviously moving. Default `0`.
- **Seed kept.** At `drift = 0` the seed is the only source of field variety (+ URL reproducibility); dropping it would leave one identical static field. The 3D noise is seeded, so seed picks the field family / evolution path.

---

## Mechanism

Replace the 2D value noise with a **hash-based 3D value noise** sampled at
`(x·noiseScale, y·noiseScale, fieldTime)`. The flow angle at a point becomes:

```
angle = noise3(p.x·noiseScale, p.y·noiseScale, fieldTime) · 2π
```

Smooth (Hermite, `x²(3−2x)`) interpolation on **all three axes**. Because the
time axis is smoothly interpolated like x/y, advancing `fieldTime` rotates each
cell's vector continuously — streamlines bend, bifurcate, and rejoin with no
discontinuity.

**Hash-based** (no precomputed grid): hash the 8 integer lattice corners
`(xi, yi, zi)` (folding in the seed) → pseudo-random value in `[-1, 1]`, then
trilinear-smooth interpolate. No memory cost, infinite non-looping z, fully
deterministic per seed. (The current `makeNoise2D` precomputes a 256² grid; the
3D version goes hash-based to avoid a 256³ grid and to allow unbounded z.)

## Control

New schema field `fieldDrift`:
- `z.number().min(0).max(1).default(0)`
- `.meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Field Drift', help: 'Slowly morphs the flow field over time. 0 = frozen.' })`
- Read **live** in `stepFlow` from `cfg.fieldDrift` (composes with the #5 update
  hook — adjusting it never re-runs setup or resets the morph).

## State + per-frame flow

`FlowState` gains `fieldTime: number` (the morph clock), initialised to `0` in
`createFlowState`. `noise` becomes a 3-arg sampler `(x, y, z) => number`.

Each frame in `stepFlow`, before the particle loop:

```
state.fieldTime += dt * cfg.fieldDrift * DRIFT_RATE
```

then per particle:

```
const angle = noise(p.x * cfg.noiseScale, p.y * cfg.noiseScale, state.fieldTime) * Math.PI * 2
```

At `fieldDrift = 0`, `fieldTime` never advances → the field is static (identical
behavior to a frozen field, just a different specific pattern than today's 2D
noise).

`DRIFT_RATE` is a module constant tuned so `fieldDrift = 1` reads as "obviously
moving" but still organic — target ≈ one noise-cell of z-advance every few
seconds. Starting value `DRIFT_RATE = 0.00008` (per ms): at `fieldDrift = 1`,
z advances ~1.0 every ~12.5 s. 🎚️ Tunable live; refine during Chrome verify.

## Determinism / fps independence

`fieldTime` accumulates real `dt` (ms), so morph speed is **fps-independent**
(same wall-clock evolution at any framerate), consistent with how lifespan is
handled. The seed determines the 3D field (hash seeded) and therefore the
evolution path.

## Lifecycle (update hook, #5)

- `fieldDrift` change → **live** (`updateFlowState` swaps `cfg`; `stepFlow`
  reads the new rate next frame). Must **not** reset `state.fieldTime` — the
  morph continues smoothly from where it is, just faster/slower.
- `seed` / `particles` change → re-setup (unchanged). The 3D noise fn is rebuilt
  in `setup`.
- `noiseScale` stays live (read per frame), as today.

## Files

- `src/diversions/flow-field/noise.ts` — add `makeNoise3D(seed): (x, y, z) => number`
  (hash-based value noise, trilinear-smooth, range `[-1, 1]`). Keep `mulberry32`.
  Remove `makeNoise2D` — flow-field is its only consumer, so it's dead after the
  migration; its determinism test is replaced by `makeNoise3D`'s (the
  noise-determinism anti-regression must-have moves to 3D).
- `src/diversions/flow-field/schema.ts` — add the `fieldDrift` field.
- `src/diversions/flow-field/flowField.ts` — `FlowState.fieldTime`, `noise` as
  3D sampler; `createFlowState` builds the 3D noise + `fieldTime = 0`; `stepFlow`
  advances `fieldTime` and samples 3D; `updateFlowState` keeps `fieldDrift` live
  (no `fieldTime` reset).
- `src/diversions/flow-field/index.ts` — unchanged (still `kind: '2d'`).

## Testing

- **`makeNoise3D`** (`noise.test.ts`):
  - deterministic: same seed + coords → same value; different seed → differs.
  - range: sampled values within `[-1, 1]`.
  - continuity: `|noise(x, y, z) − noise(x, y, z + ε)|` is small for small `ε`
    (e.g. `ε = 0.01` → Δ below a modest bound) — the no-jump guarantee.
- **`fieldTime` accumulation** (`flowField.test.ts`):
  - `fieldDrift = 0` → `fieldTime` stays `0` after stepping frames (static).
  - `fieldDrift > 0` → `fieldTime` advances ∝ `dt · fieldDrift · DRIFT_RATE`.
- **`updateFlowState`**: changing `fieldDrift` returns `true` (live) and does
  **not** reset `fieldTime`; changing `seed`/`particles` still returns `false`.
- **Schema**: `fieldDrift` default `0`; codec round-trip of a non-zero value.

## Out of scope

- Directional drift (the scrolling-offset feel) — explicitly rejected (we want
  morph, not translation).
- 3D-noise GPU/perf optimisation — value-noise hashing per particle per frame is
  fine at current particle counts; revisit only if profiling shows a problem.
- Preserving today's exact per-seed static field — rejected (unreleased; fresh
  3D noise chosen).
