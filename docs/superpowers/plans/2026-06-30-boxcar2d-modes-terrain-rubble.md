# BoxCar2D — Modes, Terrain Types & Rubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time mode (finite goal, fastest-wins fitness), four switchable terrain types, a resettable rubble obstacle layer, and an ∞ option on Track Lifespan to the BoxCar2D diversion.

**Architecture:** All changes stay inside `src/diversions/boxcar2d/` plus one small shared-`Slider` enhancement. Terrain shape, time-mode fitness, and rubble layout are extracted into pure, separately-tested helpers (`terrain.ts`, `fitness.ts`, `rubble.ts`); `index.ts` wires them into the existing state machine; `render.ts` draws the finish line, rubble blocks, and a mode-aware HUD. The GA loop (`ga.ts`) is untouched — fitness is still a single scalar.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest (co-located `*.test.ts`), phaser-box2d (Box2D v3) via the `physics.ts` seam.

## Global Constraints

- **Determinism is a keystone.** A seed must reproduce a run exactly. Rubble layout and terrain shape must derive from the track seed via `makeNoise3D` (a *pure* hash), never from `state.rng` — they must not perturb the GA rng stream. `index.test.ts` "determinism keystone" must stay green.
- **Schema is the single source of truth** — one Zod field drives form + URL codec + `Config` type. New `segmented` fields: `options` must exactly equal the enum values; any `showWhen.field` must name a real sibling (`framework/diversionMeta.test.ts:57`).
- **URL codec is a keystone** — `framework/codecSweep.test.ts` and `urlKeys.test.ts` auto-cover new fields; they must stay green.
- **5 UX invariants:** readability; discoverable+helped (every field gets `label` + `help`); inline help when confusing; sliders only with min/max; err toward contrast.
- **Coordinate convention:** physics is meters, Y-up; the single conversion to canvas (px, Y-down) is in `render.ts`. Rubble bodies are created in meters via the `physics.ts` seam only.
- **Numeric defaults are 🎚️ tunable** — the values below are sensible starts, adjusted during Chrome verify, not locked balance.
- **Verify in Chrome** (chrome-devtools MCP) on port **5180**, never a built-in preview.
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`; branch `feature/boxcar2d-modes-terrain-rubble` (already created); FF-merge after verify.

---

### Task 1: Shared `Slider` — `maxLabel` ("∞" at the top)

**Files:**
- Modify: `src/framework/fieldMeta.ts:8-18` (add `maxLabel?`)
- Modify: `src/framework/controls/Slider.tsx`
- Test: `src/framework/controls/Slider.test.tsx`

**Interfaces:**
- Produces: `FieldMeta.maxLabel?: string` — when set and `value >= max`, the Slider's readout shows the label instead of the number.

- [ ] **Step 1: Write the failing test** — append to `Slider.test.tsx`:

```tsx
describe('Slider maxLabel', () => {
  const infMeta = { ui: 'slider' as const, label: 'Track lifespan', min: 1, max: 50, step: 1, maxLabel: '∞' }
  it('shows the maxLabel at max instead of the number', () => {
    render(<Slider value={50} onChange={() => {}} meta={infMeta} />)
    expect(screen.getByText('∞')).toBeInTheDocument()
  })
  it('shows the number below max', () => {
    render(<Slider value={20} onChange={() => {}} meta={infMeta} />)
    expect(screen.queryByText('∞')).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toHaveValue(20)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/framework/controls/Slider.test.tsx`
Expected: FAIL — "∞" not found (readout still renders the numeric input).

- [ ] **Step 3: Add `maxLabel` to `FieldMeta`** — in `src/framework/fieldMeta.ts`, inside the `FieldMeta` interface (after `step?`):

```ts
  maxLabel?: string // ui:'slider' — when value is at max, show this text instead of the number (e.g. "∞")
```

- [ ] **Step 4: Render `maxLabel` in `Slider.tsx`** — replace the readout `<input>` block (lines 37-52) so that when at max with a `maxLabel` and not actively editing, a static label renders instead of the numeric input:

```tsx
        {meta.maxLabel != null && meta.max != null && value >= meta.max && draft === null ? (
          <span className="ctl-val ctl-val-max" aria-label={`${meta.label} value`}>{meta.maxLabel}</span>
        ) : (
          <input
            className="ctl-val ctl-val-edit"
            type="number"
            aria-label={`${meta.label} value`}
            min={meta.min}
            max={meta.max}
            step={meta.step ?? 1}
            value={readout}
            onChange={(e) => {
              setDraft(e.target.value)
              if (e.target.value === '') return
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) onChange(clampToBounds(n, meta))
            }}
            onBlur={() => setDraft(null)}
          />
        )}
```

(The range `<input type="range">` below is unchanged — the thumb still sits at max.)

- [ ] **Step 5: Run tests, verify pass**

Run: `npx vitest run src/framework/controls/Slider.test.tsx`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add src/framework/fieldMeta.ts src/framework/controls/Slider.tsx src/framework/controls/Slider.test.tsx
git commit -m "feat(framework): Slider maxLabel — show ∞ (or any text) at the top of the range"
```

---

### Task 2: Terrain types

**Files:**
- Modify: `src/diversions/boxcar2d/terrain.ts`
- Test: `src/diversions/boxcar2d/terrain.test.ts`

**Interfaces:**
- Produces: `TERRAIN_TYPES = ['rolling','dunes','plateaus','ridges'] as const`; `type TerrainType = (typeof TERRAIN_TYPES)[number]`; `makeTerrain(seed: number, roughness: number, type?: TerrainType): (x:number)=>number` — `type` defaults to `'rolling'` and the `'rolling'` branch is byte-identical to the current formula (keeps existing determinism values).

- [ ] **Step 1: Write the failing tests** — append to `terrain.test.ts`:

```ts
import { makeTerrain as mk, TERRAIN_TYPES } from './terrain'

describe('terrain types', () => {
  it('exposes the four types', () => {
    expect([...TERRAIN_TYPES]).toEqual(['rolling', 'dunes', 'plateaus', 'ridges'])
  })
  it('defaults to rolling = the legacy formula (determinism preserved)', () => {
    const legacy = mk(9, 0.7)
    const rolling = mk(9, 0.7, 'rolling')
    for (const x of [0, 5, 12.3, 50, 137.7, 1000]) expect(rolling(x)).toBe(legacy(x))
  })
  it('each type is deterministic and finite over a long sweep', () => {
    for (const t of TERRAIN_TYPES) {
      const a = mk(5, 0.8, t); const b = mk(5, 0.8, t)
      for (let x = 0; x < 500; x += 11) {
        expect(a(x)).toBe(b(x))
        expect(Number.isFinite(a(x))).toBe(true)
      }
      expect(Math.abs(a(0))).toBeLessThan(1e-9) // flat launch ramp preserved for all types
    }
  })
  it('types produce distinct silhouettes', () => {
    const xs = Array.from({ length: 60 }, (_, i) => 20 + i * 6)
    const sig = (t: typeof TERRAIN_TYPES[number]) => xs.map((x) => mk(5, 0.8, t)(x).toFixed(2)).join(',')
    const sigs = new Set(TERRAIN_TYPES.map(sig))
    expect(sigs.size).toBe(TERRAIN_TYPES.length)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/terrain.test.ts`
Expected: FAIL — `TERRAIN_TYPES` not exported.

- [ ] **Step 3: Implement the types** — replace the body of `makeTerrain` in `terrain.ts` (keep `terrainPoints` unchanged):

```ts
export const TERRAIN_TYPES = ['rolling', 'dunes', 'plateaus', 'ridges'] as const
export type TerrainType = (typeof TERRAIN_TYPES)[number]

/** Deterministic endless terrain height (meters) as a function of world-x. */
export function makeTerrain(
  seed: number,
  roughness: number,
  type: TerrainType = 'rolling',
): (x: number) => number {
  const noise = makeNoise3D(seed)
  const n = (x: number, f: number) => noise(x * f, 0, 0) // value noise in [-1,1]
  return (x: number) => {
    // flat launch ramp for the first ~9 m so every car starts on level ground
    const ramp = Math.min(1, Math.max(0, (x - 1) / 8))
    let h: number
    switch (type) {
      case 'dunes': {
        const s = n(x, 0.025) * 3.5 + n(x, 0.06) * 1.2
        h = s > 0 ? Math.pow(s / 4.7, 0.8) * 4.7 : s // sharpen crests
        break
      }
      case 'plateaus': {
        const step = 1.4
        h = Math.round((n(x, 0.04) * 3.2) / step) * step + n(x, 0.5) * 0.18 // tables + cliff edges + tiny jitter
        break
      }
      case 'ridges': {
        h = (1 - Math.abs(n(x, 0.05))) * 3.4 + (1 - Math.abs(n(x, 0.13))) * 1.4 - 2.2 // sharp peaks & V-valleys, centered
        break
      }
      case 'rolling':
      default:
        h = n(x, 0.05) * 2.6 + n(x, 0.14) * 1.6 + n(x, 0.34) * 0.8
    }
    return ramp * h * roughness * 2.0
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/diversions/boxcar2d/terrain.test.ts`
Expected: PASS (including the pre-existing 2-arg tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/boxcar2d/terrain.ts src/diversions/boxcar2d/terrain.test.ts
git commit -m "feat(boxcar2d): four terrain types (rolling/dunes/plateaus/ridges)"
```

---

### Task 3: Time-mode fitness helper

**Files:**
- Create: `src/diversions/boxcar2d/fitness.ts`
- Test: `src/diversions/boxcar2d/fitness.test.ts`

**Interfaces:**
- Produces: `carFitness(opts: { mode: 'distance'|'time'; finished: boolean; distance: number; goalDistance: number; timeCap: number; timeSec: number }): number`. `distance` is `maxX - spawnX` (already ≥ 0 in callers). Finisher (time + finished) → `goalDistance + (timeCap − timeSec)`; everything else → `max(0, distance)`.

- [ ] **Step 1: Write the failing test** — `fitness.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { carFitness } from './fitness'

const base = { goalDistance: 300, timeCap: 20 }

describe('carFitness', () => {
  it('distance mode = distance reached', () => {
    expect(carFitness({ ...base, mode: 'distance', finished: false, distance: 142, timeSec: 9 })).toBe(142)
  })
  it('time-mode non-finisher = distance reached (always < goalDistance)', () => {
    const f = carFitness({ ...base, mode: 'time', finished: false, distance: 250, timeSec: 20 })
    expect(f).toBe(250)
    expect(f).toBeLessThan(base.goalDistance)
  })
  it('time-mode finisher always outranks any non-finisher', () => {
    const slowFinish = carFitness({ ...base, mode: 'time', finished: true, distance: 300, timeSec: 20 })
    expect(slowFinish).toBe(300) // goalDistance + (20-20)
    expect(slowFinish).toBeGreaterThanOrEqual(base.goalDistance)
  })
  it('faster finish ⇒ higher fitness', () => {
    const fast = carFitness({ ...base, mode: 'time', finished: true, distance: 300, timeSec: 7 })
    const slow = carFitness({ ...base, mode: 'time', finished: true, distance: 300, timeSec: 12 })
    expect(fast).toBeGreaterThan(slow)
    expect(fast).toBe(313)
  })
  it('never returns negative', () => {
    expect(carFitness({ ...base, mode: 'distance', finished: false, distance: -5, timeSec: 0 })).toBe(0)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/fitness.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `fitness.ts`:

```ts
/** Single scalar fitness for one car's run (drives roulette + elitism unchanged).
 *
 * The "distance until reachable, then time" rule emerges from one formula: every
 * time-mode finisher scores `> goalDistance`, every non-finisher scores
 * `< goalDistance`, so finishers always outrank stragglers and — once cars start
 * finishing — selection pivots to minimizing time. No mode-switch branch needed. */
export function carFitness(opts: {
  mode: 'distance' | 'time'
  finished: boolean
  distance: number // maxX - spawnX
  goalDistance: number
  timeCap: number
  timeSec: number
}): number {
  if (opts.mode === 'time' && opts.finished) {
    return opts.goalDistance + (opts.timeCap - opts.timeSec)
  }
  return Math.max(0, opts.distance)
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/diversions/boxcar2d/fitness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/boxcar2d/fitness.ts src/diversions/boxcar2d/fitness.test.ts
git commit -m "feat(boxcar2d): time-mode car fitness helper"
```

---

### Task 4: Rubble layout (resettable, deterministic)

**Files:**
- Create: `src/diversions/boxcar2d/rubble.ts`
- Test: `src/diversions/boxcar2d/rubble.test.ts`

**Interfaces:**
- Produces: `makeRubbleLayout(seed: number, density: number): RubbleLayout | null` (null when `density <= 0`). `RubbleLayout = { blockX(slot:number):number; blockSize(slot:number):number; firstSlotAtOrAfter(x:number):number }`. `blockX` is strictly monotonic in `slot`. Pure (uses `makeNoise3D`, not the GA rng).

- [ ] **Step 1: Write the failing test** — `rubble.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeRubbleLayout } from './rubble'

describe('makeRubbleLayout', () => {
  it('is null when density is 0 (no rubble, zero cost)', () => {
    expect(makeRubbleLayout(1, 0)).toBeNull()
  })
  it('is deterministic for a seed (same layout every car / reset)', () => {
    const a = makeRubbleLayout(7, 4)!; const b = makeRubbleLayout(7, 4)!
    for (let s = 0; s < 50; s++) {
      expect(a.blockX(s)).toBe(b.blockX(s))
      expect(a.blockSize(s)).toBe(b.blockSize(s))
    }
  })
  it('different seeds give different layouts', () => {
    const a = makeRubbleLayout(7, 4)!; const c = makeRubbleLayout(8, 4)!
    let differs = false
    for (let s = 0; s < 50; s++) if (a.blockX(s) !== c.blockX(s)) differs = true
    expect(differs).toBe(true)
  })
  it('blockX is strictly increasing in slot', () => {
    const L = makeRubbleLayout(3, 6)!
    for (let s = 0; s < 80; s++) expect(L.blockX(s + 1)).toBeGreaterThan(L.blockX(s))
  })
  it('higher density packs blocks closer', () => {
    const sparse = makeRubbleLayout(2, 2)!; const dense = makeRubbleLayout(2, 8)!
    const spanSparse = sparse.blockX(10) - sparse.blockX(0)
    const spanDense = dense.blockX(10) - dense.blockX(0)
    expect(spanDense).toBeLessThan(spanSparse)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/rubble.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `rubble.ts`:

```ts
import { makeNoise3D } from '../../framework/rng'

export interface RubbleLayout {
  /** world-x of a slot's block center (strictly increasing in slot). */
  blockX(slot: number): number
  /** edge length (meters) of a slot's block. */
  blockSize(slot: number): number
  /** first slot whose blockX is roughly >= x (for repopulating from a spawn point). */
  firstSlotAtOrAfter(x: number): number
}

/** Deterministic, resettable obstacle layout. `density` = blocks per ~10 m.
 *  Returns null when density <= 0. PURE function of `seed` (uses makeNoise3D, not
 *  the GA rng) so it can never perturb run determinism. Jitter stays under
 *  0.3·spacing, which keeps blockX strictly monotonic. */
export function makeRubbleLayout(seed: number, density: number): RubbleLayout | null {
  if (density <= 0) return null
  const spacing = 10 / density
  const j = makeNoise3D((seed ^ 0x5151b10c) >>> 0) // independent stream
  return {
    blockX: (slot) => slot * spacing + j(slot, 0, 0) * spacing * 0.3,
    blockSize: (slot) => 0.5 + (j(slot, 7, 0) * 0.5 + 0.5) * 0.45, // 0.50 .. 0.95 m
    firstSlotAtOrAfter: (x) => Math.ceil(x / spacing),
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/diversions/boxcar2d/rubble.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/boxcar2d/rubble.ts src/diversions/boxcar2d/rubble.test.ts
git commit -m "feat(boxcar2d): deterministic resettable rubble layout"
```

---

### Task 5: Schema fields + ∞ Track Lifespan

**Files:**
- Modify: `src/diversions/boxcar2d/schema.ts`

**Interfaces:**
- Consumes: `TERRAIN_TYPES` from `./terrain` (Task 2).
- Produces: new `BoxCar2DConfig` keys `mode`, `goalDistance`, `timeCap`, `terrainType`, `rubbleDensity`; `trackLifespan` now defaults to its max (∞) with `maxLabel:'∞'`.

- [ ] **Step 1: Write the failing test** — append to `schema.test.ts`:

```ts
import { TERRAIN_TYPES } from './terrain'

describe('boxcar2d schema additions', () => {
  const d = boxcar2dSchema.parse({})
  it('defaults: distance mode, rolling terrain, no rubble, infinite track', () => {
    expect(d.mode).toBe('distance')
    expect(d.terrainType).toBe('rolling')
    expect(d.rubbleDensity).toBe(0)
    expect(d.trackLifespan).toBe(50) // max == infinite
  })
  it('terrainType enum mirrors TERRAIN_TYPES', () => {
    const meta = boxcar2dSchema.shape.terrainType.meta()
    expect(meta?.options).toEqual([...TERRAIN_TYPES])
  })
  it('time-only fields are gated behind mode==="time"', () => {
    expect(boxcar2dSchema.shape.goalDistance.meta()?.showWhen).toEqual({ field: 'mode', equals: 'time' })
    expect(boxcar2dSchema.shape.timeCap.meta()?.showWhen).toEqual({ field: 'mode', equals: 'time' })
  })
  it('trackLifespan carries the ∞ maxLabel', () => {
    expect(boxcar2dSchema.shape.trackLifespan.meta()?.maxLabel).toBe('∞')
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/schema.test.ts`
Expected: FAIL — fields undefined.

- [ ] **Step 3: Edit `schema.ts`** — add the import at the top (after the zod import):

```ts
import { TERRAIN_TYPES } from './terrain'
```

Change `trackLifespan` to default to max with the ∞ label:

```ts
  trackLifespan: z.number().int().min(1).max(50).default(50)
    .meta({ section: 'Evolution', ui: 'slider', min: 1, max: 50, step: 1, label: 'Track lifespan', maxLabel: '∞',
            help: 'Generations before a brand-new track is generated. ∞ (max) = one track, mastered forever.' }),
```

Add `mode` immediately after `trackLifespan`, and `goalDistance` + `timeCap` after it:

```ts
  mode: z.enum(['distance', 'time']).default('distance')
    .meta({ section: 'Evolution', ui: 'segmented', options: ['distance', 'time'], label: 'Mode',
            help: 'Distance = go as far as possible on an endless track. Time = reach the goal as fast as possible.' }),
  goalDistance: z.number().min(50).max(1000).default(300)
    .meta({ section: 'Evolution', ui: 'slider', min: 50, max: 1000, step: 10, label: 'Goal distance (m)',
            help: 'Time mode: where the finish line sits. Cars first evolve to reach it, then to reach it fast.',
            showWhen: { field: 'mode', equals: 'time' } }),
  timeCap: z.number().min(5).max(60).default(20)
    .meta({ section: 'Evolution', ui: 'slider', min: 5, max: 60, step: 1, label: 'Time limit (s)',
            help: 'Time mode: a car that hasn’t reached the goal within this many seconds is culled.',
            showWhen: { field: 'mode', equals: 'time' } }),
```

Add `terrainType` and `rubbleDensity` after `roughness` (both in the `Track` section):

```ts
  terrainType: z.enum(TERRAIN_TYPES).default('rolling')
    .meta({ section: 'Track', ui: 'segmented', options: [...TERRAIN_TYPES], label: 'Terrain',
            help: 'Shape of the hills: rolling, big dunes, stepped plateaus, or sharp ridges.' }),
  rubbleDensity: z.number().min(0).max(8).default(0)
    .meta({ section: 'Track', ui: 'slider', min: 0, max: 8, step: 1, label: 'Rubble',
            help: 'Loose blocks per ~10 m that slow the car. 0 = none. The layout resets for every car — fair for all.' }),
```

> Note: `z.enum(TERRAIN_TYPES)` accepts the readonly tuple; `options: [...TERRAIN_TYPES]` is a mutable copy (the meta test compares by value).

- [ ] **Step 4: Run schema + meta + codec sweeps, verify pass**

Run: `npx vitest run src/diversions/boxcar2d/schema.test.ts src/framework/diversionMeta.test.ts src/framework/codecSweep.test.ts src/framework/urlKeys.test.ts`
Expected: PASS (segmented options match enums; codec round-trips the new fields; leaf keys stay unique or fall back to dotted).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/boxcar2d/schema.ts src/diversions/boxcar2d/schema.test.ts
git commit -m "feat(boxcar2d): schema — mode, goal/timeCap, terrainType, rubble, ∞ track lifespan"
```

---

### Task 6: Wire it all into `index.ts` (terrain type, time mode, rubble bodies, ∞ lifespan, update)

**Files:**
- Modify: `src/diversions/boxcar2d/index.ts`

**Interfaces:**
- Consumes: `makeTerrain`(3-arg) + `TerrainType` (Task 2), `carFitness` (Task 3), `makeRubbleLayout`/`RubbleLayout` (Task 4), new config fields (Task 5), `createPolygonBody` (`physics.ts:97`).
- Produces: behavior only (no new exports). New `BoxCarState` fields: `trackSeed`, `stepsThisCar`, `bestTimeSec`, `rubbleLayout`, `rubbleBlocks`, `rubbleNextSlot`.

- [ ] **Step 1: Add a time-mode behavior test** — append to `index.test.ts`:

```ts
import { makeTerrain } from './terrain'

it('time mode: a car reaching the goal is recorded as a finisher (fitness > goalDistance)', () => {
  // Flat, easy track + tiny goal so a car finishes quickly; force flat terrain via
  // roughness floor and a short goal distance.
  const tcfg = boxcar2dSchema.parse({ mode: 'time', goalDistance: 60, timeCap: 30, roughness: 0.1, population: 6 })
  const s = diversion.setup(fakeCtx(), tcfg, SIZE)
  let guard = 0
  let sawFinisher = false
  while (guard++ < 200000 && !sawFinisher) {
    diversion.frame(s, fakeCtx(), guard * 16, 16)
    if (s.scored.some((sc) => sc.fitness > tcfg.goalDistance)) sawFinisher = true
  }
  diversion.teardown?.(s)
  expect(sawFinisher).toBe(true)
})

it('rubble density > 0 spawns reset-per-car blocks without throwing', () => {
  const rcfg = boxcar2dSchema.parse({ rubbleDensity: 4, population: 4 })
  const s = diversion.setup(fakeCtx(), rcfg, SIZE)
  for (let i = 0; i < 300; i++) diversion.frame(s, fakeCtx(), i * 16, 16)
  expect(s.rubbleBlocks.size).toBeGreaterThan(0)
  diversion.teardown?.(s)
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/index.test.ts`
Expected: FAIL — `s.rubbleBlocks` undefined / time-mode not implemented.

- [ ] **Step 3: Edit imports + constants** — in `index.ts`, extend the `./terrain` and `./physics` imports and add `fitness`/`rubble`:

```ts
import { makeTerrain, terrainPoints, type TerrainType } from './terrain'
import {
  createWorld, destroyWorld, destroyBody, stepWorld, buildTerrainBody,
  getBodyPosition, createPolygonBody, type WorldId, type BodyId,
} from './physics'
import { carFitness } from './fitness'
import { makeRubbleLayout, type RubbleLayout } from './rubble'
```

Add constants near the other mechanism constants (after `REBUILD_MARGIN`):

```ts
// Rubble: dynamic blocks live in a tight pool around the car (created once per car,
// reset on the next spawn). RUBBLE_GROUP 0 collides with the car (CAR_GROUP -1) and
// the static terrain. MAX hard-caps live bodies regardless of density (perf guard).
const RUBBLE_GROUP = 0
const RUBBLE_AHEAD = 70
const RUBBLE_BEHIND = 20
const MAX_RUBBLE_BLOCKS = 90
```

- [ ] **Step 4: Extend `BoxCarState`** — add these fields to the interface (after `skyKey?`):

```ts
  /** Seed of the CURRENT track (terrain + rubble derive from it; reseeded on regen). */
  trackSeed: number
  /** Physics steps elapsed for the current car (time-mode clock). */
  stepsThisCar: number
  /** Best finish time this track (seconds); Infinity until a car finishes. */
  bestTimeSec: number
  rubbleLayout: RubbleLayout | null
  rubbleBlocks: Map<number, { body: BodyId; size: number }>
  rubbleNextSlot: number
```

- [ ] **Step 5: Add rubble helpers** — after `rebuildTerrain`:

```ts
/** Drop all current rubble bodies and repopulate from the car's spawn point.
 *  Called on every car spawn → identical, fair layout for all cars (no car
 *  bulldozes a path for the next). */
function resetRubble(state: BoxCarState): void {
  for (const b of state.rubbleBlocks.values()) destroyBody(b.body)
  state.rubbleBlocks.clear()
  state.rubbleNextSlot = state.rubbleLayout
    ? state.rubbleLayout.firstSlotAtOrAfter(state.spawnX)
    : 0
}

/** Create rubble blocks just ahead of the car (once each) and prune ones far
 *  behind. Blocks are NEVER recreated mid-run, so a knocked-aside block stays put
 *  until the next car resets the field. */
function extendRubble(state: BoxCarState, carX: number): void {
  const L = state.rubbleLayout
  if (!L) return
  const ahead = carX + RUBBLE_AHEAD
  while (
    L.blockX(state.rubbleNextSlot) < ahead &&
    state.rubbleBlocks.size < MAX_RUBBLE_BLOCKS
  ) {
    const slot = state.rubbleNextSlot++
    const x = L.blockX(slot)
    const size = L.blockSize(slot)
    const half = size / 2
    const y = state.terrainHeight(x) + half + 0.05
    const body = createPolygonBody(state.world, {
      position: { x, y },
      vertices: [
        { x: -half, y: -half }, { x: half, y: -half },
        { x: half, y: half }, { x: -half, y: half },
      ],
      density: 0.6, friction: 0.6, groupIndex: RUBBLE_GROUP,
    })
    state.rubbleBlocks.set(slot, { body, size })
  }
  const behind = carX - RUBBLE_BEHIND
  for (const [slot, b] of state.rubbleBlocks) {
    if (L.blockX(slot) < behind) {
      destroyBody(b.body)
      state.rubbleBlocks.delete(slot)
    }
  }
}
```

- [ ] **Step 6: Reset the per-car clock + rubble in `spawnCar`** — at the end of `spawnCar` (after the camera lines), add:

```ts
  state.stepsThisCar = 0
  resetRubble(state)
```

- [ ] **Step 7: Rewrite `endCurrentCar`** to use `carFitness`, track best time, and reseed both terrain + rubble on regen. Replace the function body:

```ts
function endCurrentCar(state: BoxCarState, finished = false): void {
  const distance = Math.max(0, state.maxXThisCar - state.spawnX)
  const timeSec = state.stepsThisCar / 60
  const fitness = carFitness({
    mode: state.cfg.mode,
    finished,
    distance,
    goalDistance: state.cfg.goalDistance,
    timeCap: state.cfg.timeCap,
    timeSec,
  })
  state.scored.push({ genome: state.current.genome, fitness })
  if (state.cfg.mode === 'distance') {
    if (distance > state.bestDistMeters) state.bestDistMeters = distance
  } else if (finished && timeSec < state.bestTimeSec) {
    state.bestTimeSec = timeSec
  }

  // free the finished car's bodies (the long-running leak guard)
  destroyBody(state.current.chassis)
  for (const w of state.current.wheels) destroyBody(w.body)

  state.carIndex++
  if (state.carIndex >= state.population.length) {
    if (state.generation === 1) state.firstGenFitness = state.scored.map((s) => s.fitness)
    if (state.generation === 3) state.thirdGenFitness = state.scored.map((s) => s.fitness)
    state.population = breedGeneration(
      state.scored,
      { eliteCount: state.cfg.eliteCount, mutationRate: state.cfg.mutationRate, ranges: DEFAULT_RANGES },
      state.rng,
    )
    state.generation++
    state.scored = []
    state.carIndex = 0
    // ∞ track lifespan (slider at max) = never regenerate. Otherwise a fresh track
    // every `trackLifespan` gens; terrain + rubble both derive from the new seed.
    const lifespanInfinite = state.cfg.trackLifespan >= TRACK_LIFESPAN_MAX
    if (!lifespanInfinite && (state.generation - 1) % state.cfg.trackLifespan === 0) {
      state.trackSeed = Math.floor(state.rng() * 1e9)
      state.terrainHeight = makeTerrain(state.trackSeed, state.cfg.roughness, state.cfg.terrainType)
      state.rubbleLayout = makeRubbleLayout(state.trackSeed, state.cfg.rubbleDensity)
      state.bestDistMeters = 0
      state.bestTimeSec = Infinity
    }
  }
  spawnCar(state) // rebuilds terrain + rubble around spawn
}
```

Add the lifespan-max constant near the other constants:

```ts
const TRACK_LIFESPAN_MAX = 50 // matches schema trackLifespan max; >= this = never regenerate
```

- [ ] **Step 8: Add time-mode end conditions + rubble extension in `stepCar`** — replace `stepCar` body:

```ts
function stepCar(state: BoxCarState): void {
  stepWorld(state.world, 1)
  state.stepsThisCar++
  const x = getBodyPosition(state.current.chassis).x
  if (x > state.maxXThisCar) state.maxXThisCar = x // furthest reached (fitness + flag)

  // Time mode: finish at the goal, or cull at the time cap.
  if (state.cfg.mode === 'time') {
    if (x >= state.spawnX + state.cfg.goalDistance) {
      endCurrentCar(state, true)
      return
    }
    if (state.stepsThisCar >= state.cfg.timeCap * 60) {
      endCurrentCar(state, false)
      return
    }
  }

  // Progress-rate cull (both modes): gain >= minProgress within progressWindow.
  state.windowSteps++
  if (state.windowSteps >= state.cfg.progressWindow * 60) {
    if (state.maxXThisCar - state.windowStartX < state.cfg.minProgress) {
      endCurrentCar(state, false)
      return
    }
    state.windowStartX = state.maxXThisCar
    state.windowSteps = 0
  }

  if (x + REBUILD_MARGIN > state.terrainEndX) rebuildTerrain(state, x)
  extendRubble(state, x)
}
```

- [ ] **Step 9: Initialize the new state in `setup`** — set `terrainHeight` via the 3-arg form and add the new fields. Replace the relevant lines of the state literal:

```ts
      terrainHeight: makeTerrain(config.seed, config.roughness, config.terrainType),
```

and add (alongside the other initializers, before `rng`):

```ts
      trackSeed: config.seed,
      stepsThisCar: 0,
      bestTimeSec: Infinity,
      rubbleLayout: makeRubbleLayout(config.seed, config.rubbleDensity),
      rubbleBlocks: new Map(),
      rubbleNextSlot: 0,
```

(`spawnCar(state)` at the end of setup calls `resetRubble`, which populates `rubbleNextSlot` from spawn.)

- [ ] **Step 10: Mark new structural fields in `update`** — add to the `if (...)` re-setup condition:

```ts
      config.mode !== old.mode ||
      config.goalDistance !== old.goalDistance ||
      config.terrainType !== old.terrainType ||
      config.rubbleDensity !== old.rubbleDensity ||
```

(`timeCap`, `showHud`, colours, `speed`, motor stay live-applied.)

- [ ] **Step 11: Run the boxcar2d suite + determinism keystone, verify pass**

Run: `npx vitest run src/diversions/boxcar2d/`
Expected: PASS — including "determinism keystone" (rolling terrain unchanged, rubble default 0, layout pure) and the two new behavior tests.

- [ ] **Step 12: Commit**

```bash
git add src/diversions/boxcar2d/index.ts src/diversions/boxcar2d/index.test.ts
git commit -m "feat(boxcar2d): wire time mode, terrain type, rubble bodies, ∞ track lifespan"
```

---

### Task 7: Rendering — finish line, rubble blocks, mode-aware HUD

**Files:**
- Modify: `src/diversions/boxcar2d/render.ts`

**Interfaces:**
- Consumes: `state.cfg.mode`, `state.spawnX`, `state.cfg.goalDistance`, `state.rubbleBlocks`, `state.bestTimeSec`, `state.stepsThisCar`.

- [ ] **Step 1: Mode-gate the record flag / finish line.** In `render.ts`, the existing "record flag" block (draws a vertical line + red pennant at `s.spawnX + s.bestDistMeters`) should render **only in distance mode**. Wrap it:

```ts
  if (s.cfg.mode === 'distance') {
    // ...existing record-flag block unchanged...
  } else {
    // time mode: checkered finish line at the goal
    const fx = sx(s.spawnX + s.cfg.goalDistance)
    ctx.strokeStyle = ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(fx, 0)
    ctx.lineTo(fx, height)
    ctx.stroke()
    const sq = 10
    for (let r = 0; r * sq < height; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f5f7fa' : '#11161f'
        ctx.fillRect(fx + c * sq, r * sq, sq, sq)
      }
    }
  }
```

- [ ] **Step 2: Draw rubble blocks** (after terrain fill, before the car) — add:

```ts
  // rubble obstacle blocks — translucent fill + outline, in a contrasting accent
  for (const b of s.rubbleBlocks.values()) {
    const bp = getBodyPosition(b.body)
    const ba = getBodyAngle(b.body)
    const half = (b.size / 2) * m2px
    ctx.save()
    ctx.translate(sx(bp.x), sy(bp.y))
    ctx.rotate(-ba)
    ctx.fillStyle = 'rgba(231,111,81,0.22)'
    ctx.fillRect(-half, -half, half * 2, half * 2)
    ctx.strokeStyle = '#e76f51'
    ctx.lineWidth = 2
    ctx.strokeRect(-half, -half, half * 2, half * 2)
    ctx.restore()
  }
```

(`getBodyAngle` is already imported in `render.ts`.)

- [ ] **Step 3: Mode-aware HUD** — replace the HUD `text` line (`render.ts:156`):

```ts
    const text =
      s.cfg.mode === 'time'
        ? `Gen ${s.generation}   Car ${s.carIndex + 1}/${s.cfg.population}   Time ${(s.stepsThisCar / 60).toFixed(1)}s   Best ${Number.isFinite(s.bestTimeSec) ? s.bestTimeSec.toFixed(1) + 's' : '—'}   Goal ${s.cfg.goalDistance}m`
        : `Gen ${s.generation}   Car ${s.carIndex + 1}/${s.cfg.population}   Dist ${Math.max(0, cp.x - s.spawnX).toFixed(1)}m   Best ${s.bestDistMeters.toFixed(1)}m`
```

(Widen the HUD backing plate from `360` to `420` so the time-mode string fits: `ctx.fillRect(8, 8, 420, 26)`.)

- [ ] **Step 4: Run the diversion smoke + boxcar2d suite, verify pass**

Run: `npx vitest run src/diversions/boxcar2d/ src/framework/diversionSmoke.test.ts`
Expected: PASS (the headless ctx stub in `index.test.ts` already stubs `fillRect`/`strokeRect`/`getBodyAngle` paths; `frame` runs without throwing in both modes).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/boxcar2d/render.ts
git commit -m "feat(boxcar2d): render finish line (time mode), rubble blocks, mode-aware HUD"
```

---

### Task 8: Presets, README, close-out

**Files:**
- Modify: `src/diversions/boxcar2d/presets.ts`
- Modify: `README.md` (boxcar2d blurb / feature list)

**Interfaces:**
- Consumes: new config fields (Task 5).

- [ ] **Step 1: Add preset groups** — append to `boxcar2dPresets` in `presets.ts`:

```ts
  {
    label: 'Terrain',
    options: [
      { name: 'Rolling', patch: { terrainType: 'rolling' } },
      { name: 'Dunes', patch: { terrainType: 'dunes' } },
      { name: 'Plateaus', patch: { terrainType: 'plateaus' } },
      { name: 'Ridges', patch: { terrainType: 'ridges' } },
    ],
  },
  {
    label: 'Objective',
    options: [
      { name: 'Distance', patch: { mode: 'distance' } },
      { name: 'Race', patch: { mode: 'time' } },
    ],
  },
```

- [ ] **Step 2: Run preset sweeps, verify pass**

Run: `npx vitest run src/diversions/boxcar2d/presets.test.ts src/framework/presetSweep.test.ts`
Expected: PASS (every preset patch validates against the schema).

- [ ] **Step 3: Update README** — in the BoxCar2D entry, note the new capabilities (one or two sentences): *"Distance or time mode (race to a finish line), four terrain types (rolling / dunes / plateaus / ridges), an optional resettable rubble obstacle layer, and an ∞ track-lifespan option."* Match the surrounding diversion-blurb style.

- [ ] **Step 4: Full suite + typecheck + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all green; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/boxcar2d/presets.ts README.md
git commit -m "feat(boxcar2d): terrain/objective presets + README"
```

---

### Task 9: Code review + Chrome verification

**Files:** none (verification only).

- [ ] **Step 1: Dispatch the required reviewers** (no implementation bias): `diversion-reviewer` (UX invariants, schema-as-source, codec keystone) and `perf-analyzer` (per-frame allocations, rubble body lifecycle, GL/2D frame budget). Address findings via `superpowers:receiving-code-review`.

- [ ] **Step 2: Start the dev server** (background) on port 5180:

```bash
npm run dev
```

- [ ] **Step 3: Chrome verify** (chrome-devtools MCP, `?mute=1`) — hand the user `http://localhost:5180/d/boxcar2d/play?mute=1`. Confirm:
  - **Distance mode unchanged:** endless track, record flag, cars evolve outward.
  - **Terrain types:** cycle Rolling/Dunes/Plateaus/Ridges — each visibly distinct and legible at the live zoom (push `plateaus` step / `ridges` sharpness constants in `terrain.ts` if they read flat).
  - **Time mode:** finish line visible at the goal; early generations rank by distance; cars eventually finish; HUD timer counts up; "Best" finish time drops over generations.
  - **Rubble:** raise density — blocks appear, the car collides and slows; watch two consecutive cars meet the **same** blocks at the same spots (reset-per-car); confirm framerate holds at `speed` 8 with max density (the `MAX_RUBBLE_BLOCKS` guard caps body count).
  - **Track Lifespan:** slider shows **∞** at the top and defaults there (one track forever); lower it and confirm a fresh track regenerates at the interval.
  - **Share-link keystone:** copy the link, reload — mode, terrain, rubble, goal all restore.

- [ ] **Step 4: Hand off for user-verify** before FF-merge (per the user-verify gate). On approval: squash → FF-merge `feature/boxcar2d-modes-terrain-rubble` → `main`, deploy, live-validate, close #155, delete both branch ends.

---

## Self-Review

**Spec coverage:**
- Time mode (endpoint + 2-phase fitness + 3 run-end conditions) → Tasks 3 (fitness) + 6 (goal/timeCap wiring in `stepCar`/`endCurrentCar`). ✓
- Terrain types (4) → Task 2 + call-site wiring in Task 6. ✓
- Rubble obstacle layer (resettable, deterministic, sliding pool, density slider) → Tasks 4 (layout) + 6 (bodies) + 7 (render). ✓
- Infinite track lifespan (∞ slider + maxLabel + default ∞ + never-regenerate logic) → Tasks 1 (Slider) + 5 (schema) + 6 (`TRACK_LIFESPAN_MAX`). ✓
- Schema additions → Task 5. ✓
- Rendering/HUD (finish line, rubble, timer) → Task 7. ✓
- `update()` structural list → Task 6 Step 10. ✓
- Presets + README → Task 8. ✓
- Determinism / codec keystones → guarded in Tasks 2, 5, 6 (rolling byte-identical; rubble/terrain pure; sweeps run). ✓

**Placeholder scan:** every code step shows full code; no TBD/TODO. ✓

**Type consistency:** `makeTerrain(seed, roughness, type?)`, `carFitness({mode,finished,distance,goalDistance,timeCap,timeSec})`, `makeRubbleLayout(seed,density) → RubbleLayout|null` with `{blockX,blockSize,firstSlotAtOrAfter}`, and `BoxCarState` fields (`trackSeed`, `stepsThisCar`, `bestTimeSec`, `rubbleLayout`, `rubbleBlocks: Map<number,{body,size}>`, `rubbleNextSlot`) are referenced identically across Tasks 2–7. `TRACK_LIFESPAN_MAX` (index) mirrors schema `trackLifespan` max (50). ✓
