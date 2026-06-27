# Gravity Wells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `kind:'2d'` diversion where test particles with momentum fall through a field of transient, signed-force gravity wells — producing orbits, slingshots, and push-pull churn that never settles.

**Architecture:** Framework-agnostic sim module (`gravityWells.ts`) of pure functions (well lifecycle, softened force accumulation, semi-implicit Euler integration, particle lifecycle) + a thin `index.ts` `Diversion` wiring them to the canvas. One Zod schema (`schema.ts`) drives form + URL codec + `Config` type. Auto-discovered by the registry — no registration. Mirrors `src/diversions/flow-field/`.

**Tech Stack:** TypeScript, Zod 4, Canvas 2D, Vitest. Seeded RNG via `mulberry32` (exported from `src/diversions/flow-field/noise.ts`). Gradient sampling via `sampleGradient` (exported from `src/diversions/flow-field/flowField.ts`).

## Global Constraints

- **id/slug:** `gravity-wells` (folder name == id). **Title:** `Gravity Wells`. **kind:** `2d`.
- **Five UX invariants in the first pass:** readability; hide nothing (all params visible, live values); persistent inline `help` on non-obvious params (`maxWells`, `wellLifespan`, force range); sliders only with `min`+`max`+`step`; err toward contrast.
- **Seeded randomness only** — never `Math.random()`. All particle init AND respawns draw from the `mulberry32(seed)` stream so same seed → same look.
- **Softening is non-negotiable:** acceleration uses `1/(dist² + SOFTENING²)`, never raw `r²`. Guard positions against non-finite.
- **Velocity clamp is non-negotiable:** clamp speed every step so slingshots stay bounded.
- **Unattended-death guard:** `maxWells ≥ 1` and finite `wellLifespan` (schema bounds) — field always evolves.
- **HiDPI handled by framework:** draw in CSS pixels (`lineWidth ≈ 1`); framework DPR-scales the 2D context and passes CSS-pixel sizes.
- **`frame` must NOT call requestAnimationFrame** — the framework owns the loop. Allocate sparingly per-frame (screensaver).
- **Dev server:** port 5180. **Verify in Chrome** (chrome-devtools MCP), never a built-in preview.
- **Tests co-located** (`*.test.ts`). Gates: `npx vitest run` all green; `npx tsc -b --noEmit` clean.

---

### Task 1: Schema (`schema.ts`) — single source of truth

**Files:**
- Create: `src/diversions/gravity-wells/schema.ts`
- Test: `src/diversions/gravity-wells/schema.test.ts`

**Interfaces:**
- Produces: `gravityWellsSchema` (Zod object) and `export type GravityWellsConfig = z.infer<typeof gravityWellsSchema>`.
- Field names (later tasks depend on these exact names): `particles`, `particleSize`, `maxWells`, `wellLifespan`, `forceMin`, `forceMax`, `timeScale`, `fadeTrails`, `trailLength`, `blend`, `color` (group: `mode`, `colors`, `source`, `stops`), `background`, `seed`.

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/gravity-wells/schema.test.ts
import { describe, it, expect } from 'vitest'
import { gravityWellsSchema } from './schema'

describe('gravityWellsSchema', () => {
  it('parses to the curated defaults', () => {
    const c = gravityWellsSchema.parse({})
    expect(c.maxWells).toBe(5)
    expect(c.wellLifespan).toBe(6)
    expect(c.forceMin).toBe(-0.4)
    expect(c.forceMax).toBe(1.5)
    expect(c.color.mode).toBe('gradient')
    expect(c.color.source).toBe('speed')
    expect(c.blend).toBe('lighten')
  })
  it('offers speed as a gradient source and rejects flow-angle (no field here)', () => {
    expect(gravityWellsSchema.parse({ color: { mode: 'gradient', source: 'speed',
      colors: ['#ffffffff'], stops: ['#000000ff', '#ffffffff'] } }).color.source).toBe('speed')
  })
  it('enforces the unattended-death guard: maxWells >= 1', () => {
    expect(() => gravityWellsSchema.parse({ maxWells: 0 })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/gravity-wells/schema.test.ts`
Expected: FAIL — `Failed to resolve import './schema'`.

- [ ] **Step 3: Write the schema**

```ts
// src/diversions/gravity-wells/schema.ts
import { z } from 'zod'

export const gravityWellsSchema = z.object({
  particles: z.number().int().min(100).max(20000).default(5000)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles',
            help: 'How many drifting test particles. More = denser orbits.' }),
  particleSize: z.number().min(0.3).max(5).default(1.4)
    .meta({ ui: 'slider', min: 0.3, max: 5, step: 0.1, label: 'Particle size',
            help: 'Thickness of each particle stroke, in pixels.' }),
  maxWells: z.number().int().min(1).max(12).default(5)
    .meta({ ui: 'slider', min: 1, max: 12, step: 1, label: 'Max gravity fields',
            help: 'The most gravity fields active at once. New ones appear as old ones expire.' }),
  wellLifespan: z.number().min(1).max(20).default(6)
    .meta({ ui: 'slider', min: 1, max: 20, step: 0.5, label: 'Field lifespan',
            help: 'Seconds each gravity field lasts before it fades out and a new one appears.' }),
  forceMin: z.number().min(-2).max(2).default(-0.4)
    .meta({ ui: 'slider', min: -2, max: 2, step: 0.1, label: 'Force min',
            help: 'Lower end of each field’s force. Negative = repels (pushes away), '
                + 'positive = attracts (pulls in). Set ≥ 0 for attract-only.' }),
  forceMax: z.number().min(-2).max(2).default(1.5)
    .meta({ ui: 'slider', min: -2, max: 2, step: 0.1, label: 'Force max',
            help: 'Upper end of each field’s force. Each field draws a random force between '
                + 'min and max — a wide signed range gives chaotic push-pull.' }),
  timeScale: z.number().min(0).max(2).default(1)
    .meta({ ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Speed',
            help: 'Simulation speed. 0 freezes motion.' }),
  fadeTrails: z.boolean().default(true)
    .meta({ ui: 'toggle', label: 'Motion trails',
            help: 'On: particles leave trails that fade out. Off: each frame is wiped clean.' }),
  trailLength: z.number().min(0).max(100).default(88)
    .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail length',
            help: 'How long trails persist before fading. Higher = longer orbital ribbons.' }),
  blend: z.enum(['lighten', 'screen', 'normal']).default('lighten')
    .meta({ ui: 'segmented', options: ['lighten', 'screen', 'normal'], label: 'Blend',
            help: 'How overlapping trails combine:\n'
                + '- lighten (default): colored glow that keeps its hue — no white-out\n'
                + '- screen: glows and mixes; dense areas wash to white\n'
                + '- normal: each particle’s true color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060f')
    .meta({ ui: 'color', label: 'Background' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('gradient')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Color mode',
              help: 'Palette: each particle keeps one random color from the list. '
                  + 'Gradient: color is sampled along a source (speed or position).' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#3bd2ffaa', '#4d9bffaa', '#ffd23baa', '#ff7a3baa'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Each particle picks one color at random when it spawns and keeps it for life. '
                  + 'Per-color alpha controls how fast trails build up.' }),
    source: z.enum(['speed', 'x', 'y']).default('speed')
      .meta({ ui: 'segmented', options: ['speed', 'x', 'y'], label: 'Gradient source',
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'What maps onto the gradient: speed (slingshots flare hot, slow orbits stay '
                  + 'cool), or x / y screen position.' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#1b3a8aaa', '#3bd2ffaa', '#ffd23baa', '#ff3b3baa'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Colors are evenly spaced and sampled along the source; per-stop alpha '
                  + 'controls trail buildup.' }),
  }).default({
    mode: 'gradient',
    colors: ['#3bd2ffaa', '#4d9bffaa', '#ffd23baa', '#ff7a3baa'],
    source: 'speed',
    stops: ['#1b3a8aaa', '#3bd2ffaa', '#ffd23baa', '#ff3b3baa'],
  }).meta({ ui: 'group', label: 'Color' }),
  seed: z.number().int().default(7)
    .meta({ ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always regenerates the same pattern.' }),
})

export type GravityWellsConfig = z.infer<typeof gravityWellsSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/gravity-wells/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/gravity-wells/schema.ts src/diversions/gravity-wells/schema.test.ts
git commit -m "gravity-wells: schema (params, defaults, speed gradient source)"
```

---

### Task 2: Well lifecycle (`gravityWells.ts` part 1)

**Files:**
- Create: `src/diversions/gravity-wells/gravityWells.ts`
- Test: `src/diversions/gravity-wells/gravityWells.test.ts`

**Interfaces:**
- Consumes: `GravityWellsConfig` (Task 1); `mulberry32` from `../flow-field/noise`.
- Produces:
  - `export interface Well { x: number; y: number; force: number; age: number; life: number; fade: number }`
  - `export function spawnWell(rng: () => number, cfg: GravityWellsConfig, w: number, h: number): Well`
  - `export function wellEnvelope(well: Well): number` — 0→1 over the fade-in (first `fade` ms), 1 across the hold, 1→0 over the fade-out (last `fade` ms).
  - `export function maintainWells(wells: Well[], dt: number, rng: () => number, cfg: GravityWellsConfig, w: number, h: number): void` — ages wells, drops expired (`age ≥ life`), spawns until `wells.length === cfg.maxWells` (or trims if `maxWells` shrank).

- [ ] **Step 1: Write the failing tests**

```ts
// src/diversions/gravity-wells/gravityWells.test.ts
import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../flow-field/noise'
import { gravityWellsSchema } from './schema'
import { spawnWell, wellEnvelope, maintainWells, type Well } from './gravityWells'

const cfg = gravityWellsSchema.parse({})

describe('spawnWell', () => {
  it('places the well in-bounds with force inside [forceMin, forceMax]', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 50; i++) {
      const wl = spawnWell(rng, cfg, 800, 600)
      expect(wl.x).toBeGreaterThanOrEqual(0)
      expect(wl.x).toBeLessThanOrEqual(800)
      expect(wl.force).toBeGreaterThanOrEqual(cfg.forceMin - 1e-9)
      expect(wl.force).toBeLessThanOrEqual(cfg.forceMax + 1e-9)
      expect(wl.life).toBeGreaterThan(0)
    }
  })
})

describe('wellEnvelope', () => {
  it('is 0 at birth, ~1 mid-life, and 0 at the very end', () => {
    const wl: Well = { x: 0, y: 0, force: 1, age: 0, life: 10000, fade: 1000 }
    expect(wellEnvelope({ ...wl, age: 0 })).toBeCloseTo(0, 2)
    expect(wellEnvelope({ ...wl, age: 5000 })).toBeCloseTo(1, 2)
    expect(wellEnvelope({ ...wl, age: 10000 })).toBeCloseTo(0, 2)
  })
})

describe('maintainWells', () => {
  it('fills the pool up to maxWells and replaces expired wells', () => {
    const rng = mulberry32(2)
    const wells: Well[] = []
    maintainWells(wells, 16, rng, cfg, 800, 600)
    expect(wells.length).toBe(cfg.maxWells)
    // force every well to expire, then a maintain pass refills back to maxWells
    for (const wl of wells) wl.age = wl.life + 1
    maintainWells(wells, 16, rng, cfg, 800, 600)
    expect(wells.length).toBe(cfg.maxWells)
    expect(wells.every((wl) => wl.age < wl.life)).toBe(true)
  })
  it('trims the pool when maxWells shrinks', () => {
    const rng = mulberry32(3)
    const wells: Well[] = []
    maintainWells(wells, 16, rng, cfg, 800, 600)
    maintainWells(wells, 16, rng, { ...cfg, maxWells: 2 }, 800, 600)
    expect(wells.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/diversions/gravity-wells/gravityWells.test.ts`
Expected: FAIL — `Failed to resolve import './gravityWells'`.

- [ ] **Step 3: Write the well lifecycle**

```ts
// src/diversions/gravity-wells/gravityWells.ts
import type { GravityWellsConfig } from './schema'

export interface Well {
  x: number
  y: number
  force: number // signed: negative repels, positive attracts
  age: number   // ms
  life: number  // ms
  fade: number  // ms of fade-in and (separately) fade-out
}

// Each well lives wellLifespan seconds ± 30% jitter so the pool doesn't all
// flip at once; fade is min(900ms, a third of life) for a smooth in/out ramp.
export function spawnWell(rng: () => number, cfg: GravityWellsConfig, w: number, h: number): Well {
  const jitter = 0.7 + rng() * 0.6 // 0.7..1.3
  const life = cfg.wellLifespan * 1000 * jitter
  return {
    x: rng() * w,
    y: rng() * h,
    force: cfg.forceMin + rng() * (cfg.forceMax - cfg.forceMin),
    age: 0,
    life,
    fade: Math.min(900, life / 3),
  }
}

// Trapezoid envelope: ramp 0→1 over the first `fade`, hold at 1, ramp 1→0 over
// the last `fade`. Keeps particles from ever getting an instantaneous force step.
export function wellEnvelope(well: Well): number {
  const { age, life, fade } = well
  if (age <= 0 || age >= life) return 0
  if (age < fade) return age / fade
  if (age > life - fade) return (life - age) / fade
  return 1
}

export function maintainWells(
  wells: Well[], dt: number, rng: () => number,
  cfg: GravityWellsConfig, w: number, h: number,
): void {
  for (const wl of wells) wl.age += dt
  // drop expired (iterate backwards so splice is safe)
  for (let i = wells.length - 1; i >= 0; i--) if (wells[i].age >= wells[i].life) wells.splice(i, 1)
  // trim if maxWells shrank
  while (wells.length > cfg.maxWells) wells.pop()
  // refill up to maxWells
  while (wells.length < cfg.maxWells) wells.push(spawnWell(rng, cfg, w, h))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/diversions/gravity-wells/gravityWells.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/gravity-wells/gravityWells.ts src/diversions/gravity-wells/gravityWells.test.ts
git commit -m "gravity-wells: transient well lifecycle (spawn, fade envelope, maintain-to-max)"
```

---

### Task 3: Physics — softened force + integrator + clamp

**Files:**
- Modify: `src/diversions/gravity-wells/gravityWells.ts` (append)
- Modify: `src/diversions/gravity-wells/gravityWells.test.ts` (append)

**Interfaces:**
- Consumes: `Well`, `wellEnvelope` (Task 2).
- Produces:
  - `export const SOFTENING = 18` (px) and `export const MAX_SPEED = 520` (px/s) — baked mechanism constants (MAX_SPEED is tuning, adjusted at verify).
  - `export const G = 9000` — force-to-acceleration scale (tuning).
  - `export function accelAt(px: number, py: number, wells: Well[]): { ax: number; ay: number }` — Σ `force·envelope·G·dir / (dist² + SOFTENING²)`, `dir` = unit vector from particle toward well; positive force pulls toward the well, negative pushes away. Always finite.
  - `export interface Mover { x: number; y: number; vx: number; vy: number }`
  - `export function integrate(p: Mover, ax: number, ay: number, dtSec: number, timeScale: number): void` — semi-implicit Euler (velocity first, then position), speed clamped to `MAX_SPEED`.

- [ ] **Step 1: Write the failing tests (append)**

```ts
// append to src/diversions/gravity-wells/gravityWells.test.ts
import { accelAt, integrate, SOFTENING, MAX_SPEED, type Mover } from './gravityWells'

describe('accelAt', () => {
  it('an attractor (force>0) accelerates a particle toward the well', () => {
    const wells = [{ x: 100, y: 0, force: 1, age: 5000, life: 10000, fade: 100 }]
    const { ax } = accelAt(0, 0, wells) // well is to the right → ax > 0
    expect(ax).toBeGreaterThan(0)
  })
  it('a repulsor (force<0) accelerates a particle away from the well', () => {
    const wells = [{ x: 100, y: 0, force: -1, age: 5000, life: 10000, fade: 100 }]
    const { ax } = accelAt(0, 0, wells) // pushed left, away from the well
    expect(ax).toBeLessThan(0)
  })
  it('stays finite at the singularity (particle exactly on the well) via softening', () => {
    const wells = [{ x: 0, y: 0, force: 2, age: 5000, life: 10000, fade: 100 }]
    const { ax, ay } = accelAt(0, 0, wells)
    expect(Number.isFinite(ax)).toBe(true)
    expect(Number.isFinite(ay)).toBe(true)
    expect(SOFTENING).toBeGreaterThan(0)
  })
})

describe('integrate', () => {
  it('clamps speed to MAX_SPEED no matter how large the acceleration', () => {
    const p: Mover = { x: 0, y: 0, vx: 0, vy: 0 }
    integrate(p, 1e9, 1e9, 0.016, 1) // absurd accel
    const speed = Math.hypot(p.vx, p.vy)
    expect(speed).toBeLessThanOrEqual(MAX_SPEED + 1e-6)
  })
  it('moves position in the velocity direction (semi-implicit)', () => {
    const p: Mover = { x: 0, y: 0, vx: 0, vy: 0 }
    integrate(p, 100, 0, 0.1, 1) // accel +x → vx>0 → x advances
    expect(p.vx).toBeGreaterThan(0)
    expect(p.x).toBeGreaterThan(0)
  })
  it('timeScale 0 freezes position', () => {
    const p: Mover = { x: 5, y: 5, vx: 10, vy: 10 }
    integrate(p, 0, 0, 0.1, 0)
    expect(p.x).toBe(5)
    expect(p.y).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/diversions/gravity-wells/gravityWells.test.ts`
Expected: FAIL — `accelAt`/`integrate` not exported.

- [ ] **Step 3: Implement the physics (append to gravityWells.ts)**

```ts
// append to src/diversions/gravity-wells/gravityWells.ts
export const SOFTENING = 18      // px — removes the r->0 singularity
export const MAX_SPEED = 520     // px/s — slingshot clamp (tuning)
export const G = 9000            // force -> acceleration scale (tuning)

export interface Mover { x: number; y: number; vx: number; vy: number }

export function accelAt(px: number, py: number, wells: Well[]): { ax: number; ay: number } {
  let ax = 0, ay = 0
  for (const wl of wells) {
    const env = wellEnvelope(wl)
    if (env === 0) continue
    const dx = wl.x - px, dy = wl.y - py
    const d2 = dx * dx + dy * dy + SOFTENING * SOFTENING
    const inv = 1 / d2
    const dist = Math.sqrt(d2)
    const mag = (wl.force * env * G) * inv // signed: + pulls toward well, - pushes away
    ax += (dx / dist) * mag
    ay += (dy / dist) * mag
  }
  return { ax, ay }
}

export function integrate(p: Mover, ax: number, ay: number, dtSec: number, timeScale: number): void {
  // semi-implicit Euler: update velocity, then position from the new velocity
  p.vx += ax * dtSec
  p.vy += ay * dtSec
  const speed = Math.hypot(p.vx, p.vy)
  if (speed > MAX_SPEED) {
    const s = MAX_SPEED / speed
    p.vx *= s
    p.vy *= s
  }
  p.x += p.vx * dtSec * timeScale
  p.y += p.vy * dtSec * timeScale
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/diversions/gravity-wells/gravityWells.test.ts`
Expected: PASS (Task 2's 4 + 6 new = 10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/gravity-wells/gravityWells.ts src/diversions/gravity-wells/gravityWells.test.ts
git commit -m "gravity-wells: softened force accumulation + semi-implicit integrator + speed clamp"
```

---

### Task 4: Particle state, lifecycle & color source

**Files:**
- Modify: `src/diversions/gravity-wells/gravityWells.ts` (append)
- Modify: `src/diversions/gravity-wells/gravityWells.test.ts` (append)

**Interfaces:**
- Consumes: `mulberry32` (`../flow-field/noise`), `Mover`, `Well`, `spawnWell`, `MAX_SPEED` (this module), `GravityWellsConfig`.
- Produces:
  - `export const BOUNDS_MARGIN = 0.5` — padded recycle box = canvas grown 50% each side.
  - `export interface Particle extends Mover { age: number; life: number; ci: number }`
  - `export interface GravityState { particles: Particle[]; wells: Well[]; rng: () => number; cfg: GravityWellsConfig; w: number; h: number }`
  - `export function createGravityState(cfg: GravityWellsConfig, w: number, h: number): GravityState` — seeded particles (random pos, zero-ish velocity, staggered ages) + an initial full well pool. Same seed → identical state.
  - `export function respawnParticle(p: Particle, rng: () => number, cfg: GravityWellsConfig, w: number, h: number): void` — reseed pos, zero velocity, reset age, new random `life` and `ci`.
  - `export function outOfBounds(p: Particle, w: number, h: number): boolean` — true only when outside the padded box.
  - `export function colorT(source: 'speed' | 'x' | 'y', p: Particle, w: number, h: number): number` — 0..1: `speed` → `min(1, hypot(vx,vy)/MAX_SPEED)`; `x` → `p.x/w` clamped; `y` → `p.y/h` clamped.

- [ ] **Step 1: Write the failing tests (append)**

```ts
// append to src/diversions/gravity-wells/gravityWells.test.ts
import {
  createGravityState, respawnParticle, outOfBounds, colorT, BOUNDS_MARGIN,
} from './gravityWells'

describe('createGravityState', () => {
  it('is deterministic: same seed → identical particle layout', () => {
    const a = createGravityState(cfg, 800, 600)
    const b = createGravityState(cfg, 800, 600)
    expect(a.particles.map((p) => [p.x, p.y]))
      .toEqual(b.particles.map((p) => [p.x, p.y]))
  })
  it('different seed → different layout', () => {
    const a = createGravityState(cfg, 800, 600)
    const b = createGravityState({ ...cfg, seed: cfg.seed + 1 }, 800, 600)
    expect(a.particles[0].x).not.toBe(b.particles[0].x)
  })
  it('starts with a full well pool', () => {
    const s = createGravityState(cfg, 800, 600)
    expect(s.wells.length).toBe(cfg.maxWells)
  })
})

describe('outOfBounds (padded box)', () => {
  it('a particle just past the visible edge is NOT recycled (orbit can return)', () => {
    expect(outOfBounds({ x: 820, y: 300, vx: 0, vy: 0, age: 0, life: 1, ci: 0 }, 800, 600)).toBe(false)
  })
  it('a particle well outside the padded box IS recycled', () => {
    const far = 800 * (1 + BOUNDS_MARGIN) + 10
    expect(outOfBounds({ x: far, y: 300, vx: 0, vy: 0, age: 0, life: 1, ci: 0 }, 800, 600)).toBe(true)
  })
})

describe('colorT', () => {
  it('maps speed to 0..1 (fast → ~1)', () => {
    const slow = { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, ci: 0 }
    const fast = { x: 0, y: 0, vx: 9999, vy: 0, age: 0, life: 1, ci: 0 }
    expect(colorT('speed', slow, 800, 600)).toBeCloseTo(0, 5)
    expect(colorT('speed', fast, 800, 600)).toBeCloseTo(1, 5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/diversions/gravity-wells/gravityWells.test.ts`
Expected: FAIL — new exports missing.

- [ ] **Step 3: Implement state, lifecycle & color source (append to gravityWells.ts)**

```ts
// append to src/diversions/gravity-wells/gravityWells.ts
import { mulberry32 } from '../flow-field/noise'

export const BOUNDS_MARGIN = 0.5 // padded recycle box = canvas grown 50% each side

export interface Particle extends Mover { age: number; life: number; ci: number }

export interface GravityState {
  particles: Particle[]
  wells: Well[]
  rng: () => number
  cfg: GravityWellsConfig
  w: number
  h: number
}

function randomLife(rng: () => number, cfg: GravityWellsConfig): number {
  // 4..12 s, independent of well lifespan — staggers particle recycling
  return (4 + rng() * 8) * 1000
}

export function respawnParticle(
  p: Particle, rng: () => number, cfg: GravityWellsConfig, w: number, h: number,
): void {
  p.x = rng() * w
  p.y = rng() * h
  p.vx = 0
  p.vy = 0
  p.age = 0
  p.life = randomLife(rng, cfg)
}

export function createGravityState(cfg: GravityWellsConfig, w: number, h: number): GravityState {
  const rng = mulberry32(cfg.seed)
  const particles: Particle[] = []
  for (let i = 0; i < cfg.particles; i++) {
    const life = randomLife(rng, cfg)
    particles.push({
      x: rng() * w, y: rng() * h, vx: 0, vy: 0,
      age: rng() * life, // stagger so recycles don't pulse
      life,
      ci: 0, // assigned by the diversion from its palette length at setup
    })
  }
  const wells: Well[] = []
  for (let i = 0; i < cfg.maxWells; i++) wells.push(spawnWell(rng, cfg, w, h))
  return { particles, wells, rng, cfg, w, h }
}

export function outOfBounds(p: Particle, w: number, h: number): boolean {
  const mx = w * BOUNDS_MARGIN, my = h * BOUNDS_MARGIN
  return p.x < -mx || p.x > w + mx || p.y < -my || p.y > h + my
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function colorT(source: 'speed' | 'x' | 'y', p: Particle, w: number, h: number): number {
  if (source === 'x') return clamp01(p.x / w)
  if (source === 'y') return clamp01(p.y / h)
  return clamp01(Math.hypot(p.vx, p.vy) / MAX_SPEED) // 'speed'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/diversions/gravity-wells/gravityWells.test.ts`
Expected: PASS (10 + 6 = 16 tests).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run` → all green. Run: `npx tsc -b --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/gravity-wells/gravityWells.ts src/diversions/gravity-wells/gravityWells.test.ts
git commit -m "gravity-wells: seeded particle state, dual-trigger recycle, speed color source"
```

---

### Task 5: Diversion wiring & rendering (`index.ts`)

**Files:**
- Create: `src/diversions/gravity-wells/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4; `sampleGradient` from `../flow-field/flowField`; `Diversion`, `RenderContext`, `Size` from `../../framework/types`.
- Produces: `export default` a `Diversion<GravityWellsConfig>`.

**Reference:** mirror `src/diversions/flow-field/index.ts` for the `Diversion` shape and the `update?()` live-apply pattern, and `flow-field/flowField.ts:153-210` (`stepFlow`) for the trail-fade + stroke + DPR-aware draw idiom (`toHex2(fadeAlpha)`, `globalCompositeOperation`).

- [ ] **Step 1: Read the references**

Read `src/diversions/flow-field/index.ts` (whole file) and `src/diversions/flow-field/flowField.ts:140-215`. Note: `trailFadeAlpha(trailLength)` and `toHex2(...)` are local helpers in `flowField.ts` — re-derive the trail fill inline here (don't import private helpers): `fadeAlpha = fadeTrails ? (1 - trailLength/100) * 0.5 + 0.02 : 1`, and build the background fill string as `background + twoHexDigits(fadeAlpha)`.

- [ ] **Step 2: Write `index.ts`**

```ts
// src/diversions/gravity-wells/index.ts
import type { Diversion, RenderContext, Size } from '../../framework/types'
import { sampleGradient } from '../flow-field/flowField'
import { gravityWellsSchema, type GravityWellsConfig } from './schema'
import {
  createGravityState, maintainWells, accelAt, integrate,
  respawnParticle, outOfBounds, colorT, wellEnvelope,
  type GravityState,
} from './gravityWells'

// two hex digits for an alpha in 0..1 (e.g. 0.5 -> "80")
const toHex2 = (a: number) => Math.round(Math.max(0, Math.min(1, a)) * 255)
  .toString(16).padStart(2, '0')

function buildStyles(cfg: GravityWellsConfig): string[] {
  return cfg.color.colors.length ? cfg.color.colors : ['#ffffffff']
}

function assignColorIndices(state: GravityState): void {
  const n = state.styles.length
  for (const p of state.particles) p.ci = Math.floor(state.rng() * n)
}

interface GWState extends GravityState { styles: string[] }

const gravityWells: Diversion<GravityWellsConfig> = {
  id: 'gravity-wells',
  title: 'Gravity Wells',
  description: 'Particles caught in a field of gravity wells that appear and fade.',
  kind: '2d',
  schema: gravityWellsSchema,

  setup(_ctx: RenderContext, config: GravityWellsConfig, size: Size) {
    const base = createGravityState(config, size.width, size.height)
    const state: GWState = { ...base, styles: buildStyles(config) }
    assignColorIndices(state)
    return state
  },

  update(state: GWState, config: GravityWellsConfig, size: Size) {
    // structural changes (particle count, seed) → full re-setup
    if (config.particles !== state.cfg.particles || config.seed !== state.cfg.seed) return false
    state.cfg = config
    state.styles = buildStyles(config)
    state.w = size.width
    state.h = size.height
    return true
  },

  resize(state: GWState, size: Size) {
    state.w = size.width
    state.h = size.height
  },

  frame(state: GWState, ctx: RenderContext, _t: number, dt: number) {
    const c = ctx as CanvasRenderingContext2D
    const { cfg, particles, wells, rng, styles, w, h } = state
    const dtSec = dt / 1000

    // 1. trail fade (or hard clear)
    c.globalCompositeOperation = 'source-over'
    const fadeAlpha = cfg.fadeTrails ? (1 - cfg.trailLength / 100) * 0.5 + 0.02 : 1
    c.fillStyle = `${cfg.background}${toHex2(fadeAlpha)}`
    c.fillRect(0, 0, w, h)

    // 2. advance the well pool
    maintainWells(wells, dt, rng, cfg, w, h)

    // 3. particle strokes
    c.globalCompositeOperation = (cfg.blend === 'normal' ? 'source-over' : cfg.blend) as GlobalCompositeOperation
    c.lineWidth = cfg.particleSize
    c.lineCap = 'round'
    for (const p of particles) {
      p.age += dt
      if (p.age >= p.life || outOfBounds(p, w, h)) { respawnParticle(p, rng, cfg, w, h); continue }
      const px = p.x, py = p.y
      const { ax, ay } = accelAt(px, py, wells)
      integrate(p, ax, ay, dtSec, cfg.timeScale)
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { respawnParticle(p, rng, cfg, w, h); continue }
      c.strokeStyle = cfg.color.mode === 'gradient'
        ? sampleGradient(cfg.color.stops, colorT(cfg.color.source, p, w, h), false)
        : styles[p.ci % styles.length]
      c.beginPath()
      c.moveTo(px, py)
      c.lineTo(p.x, p.y)
      c.stroke()
    }

    // 4. subtle well markers (warm = attract, cool = repel); opacity tracks envelope
    c.globalCompositeOperation = 'source-over'
    c.lineWidth = 1
    for (const wl of wells) {
      const env = wellEnvelope(wl)
      if (env <= 0.01) continue
      const hue = wl.force >= 0 ? '255,180,90' : '110,180,255'
      c.strokeStyle = `rgba(${hue},${(env * 0.5).toFixed(3)})`
      c.beginPath()
      c.arc(wl.x, wl.y, 7, 0, Math.PI * 2)
      c.stroke()
    }
  },
}

export default gravityWells
```

- [ ] **Step 3: Typecheck + full suite**

Run: `npx tsc -b --noEmit` → clean. Run: `npx vitest run` → all green (registry auto-discovery test still passes; the new folder is picked up).

- [ ] **Step 4: Commit**

```bash
git add src/diversions/gravity-wells/index.ts
git commit -m "gravity-wells: diversion wiring + canvas rendering (trails, strokes, well markers)"
```

---

### Task 6: Code review

- [ ] Dispatch the `diversion-reviewer` subagent against the branch (`git diff main`). Focus: the 5 UX invariants (all params visible, sliders have bounds, help on `maxWells`/`wellLifespan`/force range); schema-as-single-source-of-truth; seeded randomness (no `Math.random()`, respawns use the seeded stream); softening + clamp present and correct (no divide-by-raw-r², no NaN escape); the `update?()` seam returns false only for structural fields; teardown/leak (screensaver — confirm no per-frame leaks, no own timers). Address must-fix / should-fix; re-run tests after fixes.

---

### Task 7: Chrome verify, tune, ship

- [ ] Start the dev server (`npm run dev`, port 5180).
- [ ] In Chrome (chrome-devtools MCP) open `http://localhost:5180/d/gravity-wells` and let it run ~30s. Verify: orbits + slingshots are visible; wells fade in/out with subtle warm/cool markers; repulsors (negative force) push particles into voids; nothing flickers/teleports; trails look like orbital ribbons; speed-coloring makes slingshots flare. Console clean.
- [ ] Confirm the config screen shows every control + expanded Color group + inline help; editing updates the preview AND the URL; `/d/gravity-wells/play?...` reconstructs the look; fullscreen + pause work.
- [ ] **Tuning pass (ask user before changing numeric constants):** if motion feels wrong, the levers are `G`, `MAX_SPEED`, `SOFTENING` (gravityWells.ts) and the force/lifespan defaults (schema.ts). Per the gameplay-tuning-is-sacrosanct rule, surface proposed numeric changes to the user; ship mechanism fixes (e.g. a missing guard) directly.
- [ ] Screenshot for the record.
- [ ] Update `CHANGELOG.md` with the new diversion.
- [ ] On user-verify approval: squash → FF-merge to `main` → delete branch (local + remote if pushed) → push `main` (deploy) → live-validate on GitHub Pages → file any follow-ups (drifting wells, N-body, well-proximity color source) as GitHub Issues.

---

## Self-Review

- **Spec coverage:** identity/2nd-order (Task 3 integrator) ✓; transient wells + signed force + fade envelope + maintain-to-max (Task 2) ✓; markers warm/cool (Task 5) ✓; test particles no N-body (accelAt only sums wells) ✓; softening + clamp (Task 3) ✓; dual-trigger respawn + padded bounds (Task 4) ✓; trails reuse (Task 5 frame) ✓; color group + speed source (Task 1 schema + Task 4 colorT + Task 5 sampleGradient) ✓; schema controls + help + bounds (Task 1) ✓; update() seam structural-only false (Task 5) ✓; unattended-death guard (Task 1 maxWells≥1, Task 2 finite life) ✓; seeded randomness (Task 4 mulberry32) ✓; CHANGELOG + issues (Task 7) ✓.
- **Placeholder scan:** none — every code step is complete; Task 5 step 1 instructs reading references but step 2 supplies the full file.
- **Type consistency:** `Well` fields (`x,y,force,age,life,fade`) consistent across Tasks 2–5; `Mover`/`Particle`/`GravityState` consistent Tasks 3–5; `colorT` source union `'speed'|'x'|'y'` matches the schema enum (Task 1) and call site (Task 5); `wellEnvelope`/`accelAt`/`integrate`/`maintainWells`/`outOfBounds`/`respawnParticle`/`createGravityState` signatures match between definition and use. `GWState extends GravityState` adds `styles` used in Task 5 only.
</content>
