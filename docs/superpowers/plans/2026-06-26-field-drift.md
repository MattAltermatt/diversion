# Field Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a variable **Field Drift** control that slowly, continuously morphs the Flow Field over time (0 = frozen) via a hash-based 3D value noise.

**Architecture:** Swap the 2D value noise for a hash-based 3D value noise sampled at `(x·noiseScale, y·noiseScale, fieldTime)`, smooth on all three axes so the field deforms continuously. `fieldTime` is a per-run accumulator advanced each frame by `dt · fieldDrift · DRIFT_RATE`. `fieldDrift` is a live config field (composes with the #5 `update` hook); seed still picks the field family.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + Vitest. Co-located `*.test.ts`.

## Global Constraints

- **Tests:** Vitest, co-located `*.test.ts`. Run with `npx vitest run`. Noise determinism is an anti-regression must-have.
- **`fieldDrift` is live, not structural** — read per frame from `cfg.fieldDrift`; `updateFlowState` must NOT reset `fieldTime` on a drift change. `seed`/`particles` stay structural (re-setup).
- **At `fieldDrift = 0` the field is static** — `fieldTime` must not advance.
- **Morph speed is fps-independent** — `fieldTime` accumulates real `dt` (ms).
- **Branch** `feature/field-drift`, FF-merge to `main` after verify. Terse one-line commits, no trailers.
- **DRIFT_RATE is 🎚️ tunable** — starting value `0.00008`; refine during Chrome verify, but don't change other tuning literals.

---

### Task 1: Hash-based 3D value noise

**Files:**
- Modify: `src/diversions/flow-field/noise.ts` (add `makeNoise3D`, remove `makeNoise2D`)
- Test: `src/diversions/flow-field/noise.test.ts` (rewrite for `makeNoise3D`)

**Interfaces:**
- Consumes: `mulberry32` (unchanged), `smooth` (existing module-local helper).
- Produces: `makeNoise3D(seed: number): (x: number, y: number, z: number) => number` — trilinear-smooth value noise, range `[-1, 1]`, deterministic per seed.

- [ ] **Step 1: Rewrite the test file** — replace `src/diversions/flow-field/noise.test.ts` entirely:

```ts
import { describe, it, expect } from 'vitest'
import { makeNoise3D } from './noise'

describe('makeNoise3D', () => {
  it('is deterministic for a given seed', () => {
    const a = makeNoise3D(1234)
    const b = makeNoise3D(1234)
    expect(a(0.3, 0.7, 0.5)).toBeCloseTo(b(0.3, 0.7, 0.5), 10)
  })

  it('differs across seeds', () => {
    expect(makeNoise3D(1)(0.3, 0.7, 0.5)).not.toBeCloseTo(makeNoise3D(2)(0.3, 0.7, 0.5), 6)
  })

  it('varies along the z (time) axis', () => {
    const n = makeNoise3D(7)
    expect(n(0.3, 0.7, 0)).not.toBeCloseTo(n(0.3, 0.7, 3.5), 6)
  })

  it('returns values within [-1, 1]', () => {
    const n = makeNoise3D(42)
    for (let i = 0; i < 200; i++) {
      const v = n(i * 0.13, i * 0.29, i * 0.07)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is continuous along z (no jumps): small Δz → small Δvalue', () => {
    const n = makeNoise3D(99)
    for (let i = 0; i < 50; i++) {
      const z = i * 0.137 // sweep across many z-cell boundaries
      const d = Math.abs(n(0.4, 0.6, z) - n(0.4, 0.6, z + 0.01))
      expect(d).toBeLessThan(0.1)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/diversions/flow-field/noise.test.ts`
Expected: FAIL — `makeNoise3D` is not exported.

- [ ] **Step 3: Implement `makeNoise3D` and remove `makeNoise2D`** — in `src/diversions/flow-field/noise.ts`, keep `mulberry32` and `smooth`; replace the `makeNoise2D` export with:

```ts
// Integer-lattice hash → value in [-1, 1). Folds in the seed; no precomputed
// grid, so z (time) is unbounded and the field never loops.
function hash3(xi: number, yi: number, zi: number, seed: number): number {
  let h = (seed ^ 0x9e3779b9) | 0
  h = Math.imul(h ^ (xi | 0), 0x85ebca6b)
  h = Math.imul(h ^ (yi | 0), 0xc2b2ae35)
  h = Math.imul(h ^ (zi | 0), 0x27d4eb2f)
  h ^= h >>> 13
  h = Math.imul(h, 0x165667b1)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967296) * 2 - 1
}

/** Seeded 3D value noise with trilinear smooth interpolation → value in [-1, 1].
 *  Sampling z as a slowly-advancing time axis morphs the field continuously. */
export function makeNoise3D(seed: number): (x: number, y: number, z: number) => number {
  const s = seed >>> 0
  return (x: number, y: number, z: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z)
    const fx = smooth(x - x0), fy = smooth(y - y0), fz = smooth(z - z0)
    const c000 = hash3(x0, y0, z0, s), c100 = hash3(x0 + 1, y0, z0, s)
    const c010 = hash3(x0, y0 + 1, z0, s), c110 = hash3(x0 + 1, y0 + 1, z0, s)
    const c001 = hash3(x0, y0, z0 + 1, s), c101 = hash3(x0 + 1, y0, z0 + 1, s)
    const c011 = hash3(x0, y0 + 1, z0 + 1, s), c111 = hash3(x0 + 1, y0 + 1, z0 + 1, s)
    const x00 = c000 + fx * (c100 - c000)
    const x10 = c010 + fx * (c110 - c010)
    const x01 = c001 + fx * (c101 - c001)
    const x11 = c011 + fx * (c111 - c011)
    const y0v = x00 + fy * (x10 - x00)
    const y1v = x01 + fy * (x11 - x01)
    return y0v + fz * (y1v - y0v)
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/diversions/flow-field/noise.test.ts && npx tsc --noEmit`
Expected: PASS, typecheck clean. (tsc will flag `makeNoise2D` is gone — fixed in Task 2 when flowField.ts migrates. If running tsc here errors only on flowField.ts's `makeNoise2D` import, that's expected; proceed.)

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flow-field/noise.ts src/diversions/flow-field/noise.test.ts
git commit -m "Flow Field: hash-based 3D value noise (replaces makeNoise2D) (#28)"
```

---

### Task 2: Field Drift control + 3D field integration

**Files:**
- Modify: `src/diversions/flow-field/schema.ts` (add `fieldDrift`)
- Modify: `src/diversions/flow-field/flowField.ts` (`fieldTime`, 3D noise, `advanceFieldTime`, `stepFlow`)
- Test: `src/diversions/flow-field/flowField.test.ts` (drift accumulation, live update, schema)

**Interfaces:**
- Consumes: `makeNoise3D` (Task 1), `updateFlowState` / `createFlowState` / `stepFlow` (existing).
- Produces: `FlowState.fieldTime: number`; `FlowState.noise: (x, y, z) => number`; `advanceFieldTime(fieldTime: number, dt: number, fieldDrift: number): number`; schema field `fieldDrift` (number 0..1, default 0).

- [ ] **Step 1: Write the failing tests** — append to `src/diversions/flow-field/flowField.test.ts`:

```ts
import { advanceFieldTime } from './flowField'

describe('field drift', () => {
  it('does not advance fieldTime when drift is 0 (frozen field)', () => {
    expect(advanceFieldTime(0, 16, 0)).toBe(0)
    expect(advanceFieldTime(42, 16, 0)).toBe(42)
  })

  it('advances fieldTime proportionally to dt and drift', () => {
    const half = advanceFieldTime(0, 16, 0.5)
    expect(half).toBeGreaterThan(0)
    // double the drift → double the advance; double the dt → double the advance
    expect(advanceFieldTime(0, 16, 1.0)).toBeCloseTo(half * 2, 10)
    expect(advanceFieldTime(0, 32, 0.5)).toBeCloseTo(half * 2, 10)
  })

  it('accumulates from the current fieldTime', () => {
    const step = advanceFieldTime(0, 16, 0.5)
    expect(advanceFieldTime(10, 16, 0.5)).toBeCloseTo(10 + step, 10)
  })

  it('createFlowState starts fieldTime at 0', () => {
    expect(createFlowState(base, 800, 600).fieldTime).toBe(0)
  })

  it('updateFlowState applies fieldDrift live without resetting fieldTime', () => {
    const state = createFlowState(base, 800, 600)
    state.fieldTime = 12.5 // pretend it has been drifting
    const ok = updateFlowState(state, { ...base, fieldDrift: 0.5 })
    expect(ok).toBe(true)
    expect(state.cfg.fieldDrift).toBe(0.5)
    expect(state.fieldTime).toBe(12.5) // morph continues, not reset
  })

  it('schema defaults fieldDrift to 0 and round-trips a non-zero value', () => {
    expect(flowFieldSchema.parse({}).fieldDrift).toBe(0)
    const sp = encodeConfig(flowFieldSchema, { ...base, fieldDrift: 0.3 })
    expect(decodeConfig(flowFieldSchema, sp).fieldDrift).toBeCloseTo(0.3, 10)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/diversions/flow-field/flowField.test.ts`
Expected: FAIL — `advanceFieldTime` not exported, `fieldDrift` not in schema, `fieldTime` not on state.

- [ ] **Step 3: Add the `fieldDrift` schema field** — in `src/diversions/flow-field/schema.ts`, insert after the `noiseScale` field (after line 8, before `speed`):

```ts
  fieldDrift: z.number().min(0).max(1).default(0)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Field drift',
            help: 'Slowly morphs the flow field over time. 0 = frozen.' }),
```

- [ ] **Step 4: Migrate flowField.ts to the 3D field + drift clock** — in `src/diversions/flow-field/flowField.ts`:

(a) Update the import:
```ts
import { makeNoise3D, mulberry32 } from './noise'
```

(b) Update the `FlowState` interface — change the `noise` signature and add `fieldTime`:
```ts
export interface FlowState {
  particles: Particle[]
  noise: (x: number, y: number, z: number) => number
  rng: () => number // seeded — keeps respawns deterministic per seed
  styles: string[] // one precomputed rgba() per palette color — see hexToRgba
  cfg: FlowFieldConfig
  fieldTime: number // morph clock; advances by dt·fieldDrift·DRIFT_RATE
  w: number
  h: number
}
```

(c) Add the drift constant + helper near the top (after the imports):
```ts
// fieldTime advance per ms at fieldDrift=1. Tuned so max drift is "obviously
// moving" but organic (~1 noise-cell of z every ~12.5s). 🎚️ tunable.
const DRIFT_RATE = 0.00008
/** Advance the morph clock. drift=0 → unchanged (frozen field). */
export function advanceFieldTime(fieldTime: number, dt: number, fieldDrift: number): number {
  return fieldTime + dt * fieldDrift * DRIFT_RATE
}
```

(d) In `createFlowState`, build the 3D noise and seed `fieldTime`:
```ts
  const noise = makeNoise3D(cfg.seed)
```
and add `fieldTime: 0` to the returned object:
```ts
  return { particles, noise, rng, styles, cfg, fieldTime: 0, w, h }
```

(e) In `stepFlow`, advance the clock once per frame and sample 3D. After the
trail-fade block and the `const speed = ...` line, before the particle loop, add:
```ts
  state.fieldTime = advanceFieldTime(state.fieldTime, dt, cfg.fieldDrift)
  const z = state.fieldTime
```
and change the angle line inside the loop from the 2D call to:
```ts
    const angle = noise(p.x * cfg.noiseScale, p.y * cfg.noiseScale, z) * Math.PI * 2
```

`updateFlowState` needs no change — `fieldDrift` is neither `particles` nor `seed`, so it already falls through to the live path (swaps `cfg`, leaves `fieldTime`).

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/flow-field/schema.ts src/diversions/flow-field/flowField.ts src/diversions/flow-field/flowField.test.ts
git commit -m "Flow Field: Field Drift control morphs the field over time (#28)"
```

---

### Task 3: Chrome verify (tune DRIFT_RATE) + docs

**Files:**
- Modify: `README.md` (control vocabulary, if it lists controls)
- Possibly modify: `src/diversions/flow-field/flowField.ts` (DRIFT_RATE tuning only)

- [ ] **Step 1: Start the dev server**

Run (background): `npm run dev` → http://localhost:5180/

- [ ] **Step 2: Verify frozen at 0** — open `http://localhost:5180/d/flow-field?fieldDrift=0&particles=1500&lifespan=8`. Confirm the field is static (particles trace fixed streamlines; the overall pattern does not morph). This is the default-behavior guard.

- [ ] **Step 3: Verify morph at higher values** — drag **Field Drift** up (or open `?fieldDrift=1&particles=1500&lifespan=8`). Confirm the field **continuously morphs** — streamlines bend, bifurcate, and rejoin smoothly, with NO sudden jumps. Watch for ~20s.

- [ ] **Step 4: Tune `DRIFT_RATE` if needed** — the target is: `fieldDrift = 1` is obviously moving but still organic/slow (not frantic), and low values (~0.1–0.2) are a gentle, barely-there drift. If max feels too fast/slow, adjust `DRIFT_RATE` in `flowField.ts` (only this constant), reload, re-judge. The proportionality tests don't pin the constant, so they stay green.

- [ ] **Step 5: Verify live adjust (no reset)** — with the field mid-morph, drag Field Drift to a different value. Confirm the morph continues smoothly from its current state (speeds up / slows / freezes) without the field resetting — this exercises the #5 live-update path.

- [ ] **Step 6: Docs** — if `README.md` lists the control vocabulary, add a `Field drift` line consistent with the others. Run `grep -n "Noise scale\|Trail length\|colorList" README.md` to find the list. Commit:

```bash
git add -A && git commit -m "docs: add Field drift to control vocabulary (#28)"
```

- [ ] **Step 7: Hand off for user verify before FF-merge.**

---

## Self-Review

**Spec coverage:**
- Mechanism (3D hash noise, sampled at fieldTime, smooth all axes) → Task 1 + Task 2 step 4. ✓
- Control (`fieldDrift` slider 0..1 default 0, live) → Task 2 steps 3–4. ✓
- State + flow (`fieldTime` accumulator, advance, 3D sample) → Task 2 step 4. ✓
- Determinism / fps-independence (accumulate real dt) → `advanceFieldTime` uses `dt`. ✓
- Lifecycle (drift live, no fieldTime reset; seed/particles re-setup) → Task 2 step 4 note + test. ✓
- Remove `makeNoise2D` → Task 1 step 3. ✓
- Testing (noise determinism/continuity/range; fieldTime accumulation; live update; schema) → Tasks 1–2. ✓
- Chrome verify of frozen-vs-morph + DRIFT_RATE tuning → Task 3. ✓

**Placeholder scan:** none — all code shown in full.

**Type consistency:** `makeNoise3D(seed): (x,y,z)=>number` (Task 1) matches `FlowState.noise` (Task 2 step 4b) and the `stepFlow` call (step 4e). `advanceFieldTime(fieldTime, dt, fieldDrift): number` defined in step 4c, used in step 4e and tested in step 1. `fieldDrift` schema field name consistent across schema, tests, and `cfg.fieldDrift` reads.
