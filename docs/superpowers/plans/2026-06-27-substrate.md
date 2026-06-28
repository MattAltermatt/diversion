# Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Substrate diversion — a clean-room reimplementation of Jared Tarbell's crack-growth network with a perpendicular sand-painter watercolor fill and a grow→fade→regrow screensaver lifecycle.

**Architecture:** A never-cleared `Uint8ClampedArray` RGBA accretion buffer (CSS px) holds both the dark crack ink and the colour washes, blitted through an offscreen canvas for DPR (the Sand Stroke pattern). An `Int16Array` occupancy grid stores each inked cell's quantized crack angle, driving collision (angle-difference test) and the perpendicular ray-march. Cracks advance, ink, fill perpendicular to their nearest neighbour, and relocate-on-stop; a two-phase state machine (`growing`/`fading`) resets on a draw-time timer or a saturation signal (moving-average ray length below ~3 px).

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest. Pure logic in `substrate.ts`, schema in `schema.ts`, Diversion contract in `index.ts` — all self-contained under `src/diversions/substrate/`. Auto-registered via `import.meta.glob`.

## Global Constraints

- **Self-contained helpers:** copy `mulberry32` / `parseHex8` / `blendPixel` / `sampleGradientRGBA` / `seedFor` locally into `substrate.ts` (matching Sand Stroke's "kept local so the diversion is self-contained" convention). Do NOT import a shared geometry helper.
- **Clean-room + credit:** header comment in `index.ts` and `substrate.ts`: `// Substrate — clean-room reimplementation of the algorithm from Jared` / `// Tarbell's "Substrate" (complexification.net). Not a code port.` Repo stays MIT. Add a README "Credits / Inspiration" line linking `http://www.complexification.net/gallery/machines/substrate/`.
- **Schema is the single source of truth** — drives form + URL codec + `Config` type. Every field carries `.meta({ ui, label, help, ... })`; sliders carry `min`/`max`/`step`; `seed` is `ui:'number'` and LAST in the object.
- **Hardcoded faithfulness constants (NOT knobs):** crack step `STEP = 0.42`, sand-gain clamp `SAND_MAXG = 0.22`, collision angle tolerance `ANGLE_TOL = 5`°, saturation `MIN_RAY = 3` px, saturation warm-up `WARMUP_MS = 2000`, ray-EMA decay `RAY_DECAY = 0.005`, per-frame step safety cap `MAX_STEPS = 12`, fuzz `FUZZ = 0.33`.
- **Colours:** `color.colors` / `color.stops` are `#rrggbbaa` (8-digit); `background` / `crackColor` are `#rrggbb` (6-digit).
- **Determinism contract:** per-crack seeded RNG streams; same seed + same dt cadence → identical buffer. Exact cross-frame-rate reproduction is NOT promised.
- **Dev server:** port 5180. Verify in Chrome (chrome-devtools MCP), never a built-in preview. Run tests with `npx vitest run`.
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Branch `feature/substrate` (already created). Commit messages terse, no trailers.

---

### Task 1: Schema + local pure helpers

**Files:**
- Create: `src/diversions/substrate/schema.ts`
- Create: `src/diversions/substrate/substrate.ts`
- Test: `src/diversions/substrate/schema.test.ts`
- Test: `src/diversions/substrate/substrate.test.ts`

**Interfaces:**
- Produces: `substrateSchema` (Zod), `SubstrateConfig` type. From `substrate.ts`: `RGBA`, `mulberry32(seed)`, `parseHex8(hex)`, `parseHex6(hex)`, `blendPixel(buf,w,h,x,y,c,a)`, `sampleGradientRGBA(stops,t)`, `seedFor(seed,i)`, `grainAlpha(i,grains,opacity)`, `quantizeAngle(rad)`, `angleDiff(a,b)`, and constants `EMPTY=-1`, `STEP`, `SAND_MAXG`, `ANGLE_TOL`, `MIN_RAY`, `WARMUP_MS`, `RAY_DECAY`, `MAX_STEPS`, `FUZZ`.

- [ ] **Step 1: Write the schema**

Create `src/diversions/substrate/schema.ts`:

```ts
import { z } from 'zod'

export const substrateSchema = z.object({
  initialCracks: z.number().int().min(2).max(10).default(3)
    .meta({ section: 'Growth', ui: 'slider', min: 2, max: 10, step: 1, label: 'Initial cracks',
            help: 'How many seed cracks start each cycle on the empty canvas.' }),
  maxCracks: z.number().int().min(50).max(500).default(200)
    .meta({ section: 'Growth', ui: 'slider', min: 50, max: 500, step: 10, label: 'Max cracks',
            help: 'Cap on simultaneously-active cracks (not a stop condition). The network grows '
                + 'to this many and holds them, relocating each one when it hits something.' }),
  speed: z.number().min(5).max(200).default(30)
    .meta({ section: 'Growth', ui: 'slider', min: 5, max: 200, step: 1, label: 'Speed',
            help: 'How fast cracks advance, in pixels per second. Higher fills the canvas sooner.' }),
  branchJitter: z.number().min(0).max(8).default(2)
    .meta({ section: 'Growth', ui: 'slider', min: 0, max: 8, step: 0.5, label: 'Branch jitter',
            help: 'Random angle wobble (degrees) added to the ±90° right-angle branch when a crack relocates.' }),
  drawTime: z.number().min(5).max(180).default(30)
    .meta({ section: 'Lifecycle', ui: 'slider', min: 5, max: 180, step: 1, label: 'Draw time',
            help: 'Seconds a network grows before it fades and a fresh one begins. A full canvas resets sooner.' }),
  fadeTime: z.number().min(1).max(6).default(3)
    .meta({ section: 'Lifecycle', ui: 'slider', min: 1, max: 6, step: 0.5, label: 'Fade time',
            help: 'How long the finished painting takes to fade to the background before regrowing.' }),
  grainDensity: z.number().int().min(16).max(128).default(64)
    .meta({ section: 'Sand', ui: 'slider', min: 16, max: 128, step: 1, label: 'Grain density',
            help: 'Grains laid along each perpendicular ray. More = smoother, denser watercolour cells.' }),
  grainOpacity: z.number().min(0.02).max(0.3).default(0.1)
    .meta({ section: 'Sand', ui: 'slider', min: 0.02, max: 0.3, step: 0.005, label: 'Grain opacity',
            help: 'Alpha at a ray’s dense end; grains feather toward ~0 at the far (neighbour) end.' }),
  crackColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2a2a2a')
    .meta({ section: 'Line', ui: 'color', label: 'Crack color',
            help: 'Colour of the thin dark ink line each crack draws as it grows.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f4efe4')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground colour, painted once and faded back to between cycles.' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('palette')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Mode',
              help: 'Palette: each crack picks one random wash colour. Gradient: colour sampled by start position.' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#7c3f1eff', '#c8762fff', '#e0a458ff', '#3a4a6bff', '#9c5a3cff', '#b0402eff'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Each crack picks one of these for its watercolour wash. Alpha multiplies the grain build-up.' }),
    source: z.enum(['y', 'x']).default('y')
      .meta({ ui: 'segmented', options: ['y', 'x'], label: 'Gradient source',
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'What maps onto the gradient: a crack’s start y (top→bottom) or x (left→right).' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#3a4a6bff', '#c8762fff', '#7c3f1eff'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Evenly spaced and sampled along the source; per-stop alpha multiplies grain build-up.' }),
  }).default({
    mode: 'palette',
    colors: ['#7c3f1eff', '#c8762fff', '#e0a458ff', '#3a4a6bff', '#9c5a3cff', '#b0402eff'],
    source: 'y',
    stops: ['#3a4a6bff', '#c8762fff', '#7c3f1eff'],
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
  seed: z.number().int().default(2917)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed regenerates the same sequence of crack networks.' }),
})

export type SubstrateConfig = z.infer<typeof substrateSchema>
```

- [ ] **Step 2: Write the schema test**

Create `src/diversions/substrate/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { substrateSchema } from './schema'

describe('substrateSchema', () => {
  it('parses with all defaults', () => {
    const cfg = substrateSchema.parse({})
    expect(cfg.initialCracks).toBe(3)
    expect(cfg.maxCracks).toBe(200)
    expect(cfg.speed).toBe(30)
    expect(cfg.branchJitter).toBeCloseTo(2)
    expect(cfg.drawTime).toBe(30)
    expect(cfg.fadeTime).toBeCloseTo(3)
    expect(cfg.grainDensity).toBe(64)
    expect(cfg.grainOpacity).toBeCloseTo(0.1)
    expect(cfg.crackColor).toBe('#2a2a2a')
    expect(cfg.background).toBe('#f4efe4')
    expect(cfg.color.mode).toBe('palette')
    expect(cfg.color.colors.length).toBeGreaterThanOrEqual(1)
    expect(cfg.seed).toBe(2917)
  })

  it('enforces ranges', () => {
    expect(() => substrateSchema.parse({ initialCracks: 1 })).toThrow()
    expect(() => substrateSchema.parse({ maxCracks: 10 })).toThrow()
    expect(() => substrateSchema.parse({ grainOpacity: 1 })).toThrow()
    expect(() => substrateSchema.parse({ background: 'white' })).toThrow()
    expect(() => substrateSchema.parse({ crackColor: '#fff' })).toThrow()
  })

  it('puts seed last so Advanced renders last', () => {
    const keys = Object.keys(substrateSchema.shape)
    expect(keys[keys.length - 1]).toBe('seed')
  })

  it('colors and stops are #rrggbbaa', () => {
    const cfg = substrateSchema.parse({})
    for (const c of cfg.color.colors) expect(c).toMatch(/^#[0-9a-fA-F]{8}$/)
    for (const s of cfg.color.stops) expect(s).toMatch(/^#[0-9a-fA-F]{8}$/)
  })
})
```

- [ ] **Step 3: Write the helpers + their failing test**

Create `src/diversions/substrate/substrate.ts`:

```ts
// Substrate — clean-room reimplementation of the algorithm from Jared
// Tarbell's "Substrate" (complexification.net). Not a code port; the algorithm
// was reproduced from its published description. Original © Jared Tarbell.

export interface RGBA { r: number; g: number; b: number; a: number }

// ── Faithfulness constants (hardcoded, not knobs) ───────────────────────────
export const STEP = 0.42          // px a crack advances per step
export const SAND_MAXG = 0.22     // sand-painter gain clamp ±
export const ANGLE_TOL = 5        // degrees; ≤ this from a cell's angle = same line, continue
export const MIN_RAY = 3          // px; mean ray length below this = saturated
export const WARMUP_MS = 2000     // saturation can't trigger before this into a cycle
export const RAY_DECAY = 0.005    // ray-length EMA weight per sample
export const MAX_STEPS = 12        // per-frame advance cap (safety)
export const FUZZ = 0.33          // crack-head positional fuzz
export const EMPTY = -1           // occupancy-grid sentinel

/** mulberry32 PRNG — kept local so the diversion is self-contained. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Per-crack RNG seed offset. */
export function seedFor(seed: number, i: number): number {
  return (seed + i * 0x9e3779b1) >>> 0
}

/** "#rrggbbaa" -> { r, g, b, a in 0..1 }. */
export function parseHex8(hex: string): RGBA {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: parseInt(hex.slice(7, 9), 16) / 255,
  }
}

/** "#rrggbb" -> opaque RGBA. */
export function parseHex6(hex: string): RGBA {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: 1,
  }
}

/** tpoint: move pixel (x,y) a fraction `a` toward colour `c`, set opaque. OOB = no-op. */
export function blendPixel(
  buf: Uint8ClampedArray, w: number, h: number,
  x: number, y: number, c: RGBA, a: number,
): void {
  if (x < 0 || x >= w || y < 0 || y >= h) return
  const idx = (y * w + x) * 4
  buf[idx]     += (c.r - buf[idx]) * a
  buf[idx + 1] += (c.g - buf[idx + 1]) * a
  buf[idx + 2] += (c.b - buf[idx + 2]) * a
  buf[idx + 3] = 255
}

/** Linear-interpolate RGBA across evenly-spaced hex8 `stops` at t in [0,1]. */
export function sampleGradientRGBA(stops: string[], t: number): RGBA {
  const tc = Math.min(1, Math.max(0, t))
  const n = stops.length
  if (n === 1) return parseHex8(stops[0])
  const scaled = tc * (n - 1)
  let i = Math.floor(scaled)
  if (i >= n - 1) i = n - 2
  const f = scaled - i
  const a = parseHex8(stops[i])
  const b = parseHex8(stops[i + 1])
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
    a: a.a + (b.a - a.a) * f,
  }
}

/** Per-grain alpha: `opacity` at i=0, feathering to ~0 at i=grains. */
export function grainAlpha(i: number, grains: number, opacity: number): number {
  return opacity * (1 - i / grains)
}

/** Radians -> quantized degrees 0..359. */
export function quantizeAngle(rad: number): number {
  let deg = Math.round((rad * 180) / Math.PI) % 360
  if (deg < 0) deg += 360
  return deg
}

/** Smallest absolute angular difference (degrees) between two 0..359 headings. */
export function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}
```

Append to `src/diversions/substrate/substrate.test.ts` (create it):

```ts
import { describe, it, expect } from 'vitest'
import {
  parseHex8, parseHex6, blendPixel, sampleGradientRGBA, grainAlpha,
  quantizeAngle, angleDiff, mulberry32, seedFor, SAND_MAXG,
} from './substrate'

describe('parseHex8 / parseHex6', () => {
  it('parses 8-digit to rgb + 0..1 alpha and 6-digit to opaque', () => {
    expect(parseHex8('#80c0ff80')).toMatchObject({ r: 128, g: 192, b: 255 })
    expect(parseHex8('#80c0ff80').a).toBeCloseTo(128 / 255)
    expect(parseHex6('#2a2a2a')).toEqual({ r: 42, g: 42, b: 42, a: 1 })
  })
})

describe('blendPixel', () => {
  it('moves each channel a fraction a toward the colour and sets opaque; ignores OOB', () => {
    const buf = new Uint8ClampedArray(2 * 1 * 4).fill(0)
    blendPixel(buf, 2, 1, 0, 0, { r: 100, g: 200, b: 50, a: 1 }, 0.5)
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([50, 100, 25, 255])
    expect(() => blendPixel(buf, 2, 1, 9, 9, { r: 0, g: 0, b: 0, a: 1 }, 1)).not.toThrow()
  })
})

describe('sampleGradientRGBA', () => {
  it('returns endpoints and a mid value', () => {
    const stops = ['#000000ff', '#ffffffff']
    expect(sampleGradientRGBA(stops, 0)).toMatchObject({ r: 0 })
    expect(sampleGradientRGBA(stops, 1)).toMatchObject({ r: 255 })
    expect(sampleGradientRGBA(stops, 0.5).r).toBeCloseTo(128, -1)
  })
})

describe('grainAlpha', () => {
  it('is opacity at i=0 and monotonically decreasing to ~0', () => {
    expect(grainAlpha(0, 64, 0.1)).toBeCloseTo(0.1)
    let prev = Infinity
    for (let i = 0; i < 64; i++) {
      const a = grainAlpha(i, 64, 0.1)
      expect(a).toBeLessThanOrEqual(prev); prev = a
    }
    expect(grainAlpha(63, 64, 0.1)).toBeGreaterThan(0)
    expect(grainAlpha(63, 64, 0.1)).toBeLessThan(0.01)
  })
})

describe('quantizeAngle / angleDiff', () => {
  it('wraps angles into 0..359 and measures shortest difference', () => {
    expect(quantizeAngle(0)).toBe(0)
    expect(quantizeAngle(Math.PI)).toBe(180)
    expect(quantizeAngle(-Math.PI / 2)).toBe(270)
    expect(angleDiff(10, 350)).toBe(20)   // wraps
    expect(angleDiff(0, 90)).toBe(90)
    expect(angleDiff(0, 180)).toBe(180)
  })
})

describe('mulberry32 / seedFor', () => {
  it('gives distinct streams per index, repeatable per seed', () => {
    const a = mulberry32(seedFor(7, 0))
    const b = mulberry32(seedFor(7, 1))
    const a2 = mulberry32(seedFor(7, 0))
    expect(a()).not.toBe(b())
    expect(mulberry32(seedFor(7, 0))()).toBe(a2())
  })
  it('exposes the sand gain clamp constant', () => {
    expect(SAND_MAXG).toBeCloseTo(0.22)
  })
})
```

- [ ] **Step 4: Run the tests, expect FAIL then PASS**

Run: `npx vitest run src/diversions/substrate/`
Expected: schema + helper tests PASS (they exercise only what Step 1/3 define). If a helper test fails, the helper is wrong — fix `substrate.ts`, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/substrate/schema.ts src/diversions/substrate/substrate.ts src/diversions/substrate/schema.test.ts src/diversions/substrate/substrate.test.ts
git commit -m "substrate: schema + local pure helpers"
```

---

### Task 2: Occupancy grid + collision rule

**Files:**
- Modify: `src/diversions/substrate/substrate.ts`
- Test: `src/diversions/substrate/substrate.test.ts`

**Interfaces:**
- Consumes: `EMPTY`, `ANGLE_TOL`, `angleDiff`, `quantizeAngle` (Task 1).
- Produces: `makeGrid(w,h)` → `Int16Array`; `markCell(grid, idx, deg)` → `boolean` (true if newly marked); `blocks(cell, deg)` → `boolean` (true if a crack at heading `deg` is STOPPED by grid value `cell`).

- [ ] **Step 1: Write the failing test**

Append to `substrate.test.ts`:

```ts
import { makeGrid, markCell, blocks } from './substrate'
import { EMPTY } from './substrate'

describe('occupancy grid', () => {
  it('makeGrid is all-EMPTY of the right length', () => {
    const g = makeGrid(4, 3)
    expect(g.length).toBe(12)
    expect(Array.from(g).every((v) => v === EMPTY)).toBe(true)
  })

  it('markCell writes the angle and reports first-mark only', () => {
    const g = makeGrid(2, 2)
    expect(markCell(g, 0, 90)).toBe(true)   // newly marked
    expect(g[0]).toBe(90)
    expect(markCell(g, 0, 95)).toBe(false)  // already marked
  })

  it('blocks: empty or near-parallel continues; clearly-different stops', () => {
    expect(blocks(EMPTY, 90)).toBe(false)        // empty → continue
    expect(blocks(90, 92)).toBe(false)           // within ANGLE_TOL → own line
    expect(blocks(0, 90)).toBe(true)             // perpendicular → stop
    expect(blocks(10, 350)).toBe(false)          // wraps to diff 20 > tol → actually stop
  })
})
```

Note: the last assertion as written is wrong on purpose to confirm you understand `blocks` — diff(10,350)=20 > 5 → blocks=true. Correct it to `expect(blocks(10, 350)).toBe(true)` before running.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'occupancy grid'`
Expected: FAIL — `makeGrid`/`markCell`/`blocks` not exported.

- [ ] **Step 3: Implement**

Append to `substrate.ts`:

```ts
/** A fresh w·h occupancy grid, all cells EMPTY. */
export function makeGrid(w: number, h: number): Int16Array {
  const g = new Int16Array(Math.max(1, w) * Math.max(1, h))
  g.fill(EMPTY)
  return g
}

/** Write `deg` into cell `idx`. Returns true iff it was EMPTY before (a first mark). */
export function markCell(grid: Int16Array, idx: number, deg: number): boolean {
  const fresh = grid[idx] === EMPTY
  grid[idx] = deg
  return fresh
}

/** Does grid value `cell` STOP a crack heading at `deg`?
 *  No if empty or within ANGLE_TOL of `deg` (own line / parallel); yes otherwise. */
export function blocks(cell: number, deg: number): boolean {
  if (cell === EMPTY) return false
  return angleDiff(cell, deg) > ANGLE_TOL
}
```

- [ ] **Step 4: Run tests (after fixing the deliberately-wrong assertion)**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'occupancy grid'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/substrate/substrate.ts src/diversions/substrate/substrate.test.ts
git commit -m "substrate: occupancy grid + collision rule"
```

---

### Task 3: Crack model, state creation & single-step advance

**Files:**
- Modify: `src/diversions/substrate/substrate.ts`
- Test: `src/diversions/substrate/substrate.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces:
  - `interface Crack { x; y; angle; gain; color: RGBA; alive: boolean; rng: () => number }`
  - `interface SubstrateState { cfg; buf: Uint8ClampedArray; grid: Int16Array; cracks: Crack[]; palette: RGBA[]; crackC: RGBA; bg: RGBA; w; h; phase: 'growing'|'fading'; elapsed; fadeElapsed; rayAvg; stepAcc; cycle }`
  - `createSubstrateState(cfg, w, h)` → `SubstrateState` (background-filled buffer, `initialCracks` seeded, `phase:'growing'`).
  - `advanceCrack(state, cr)` (exported for tests): advance one crack one STEP — ink, collision, set `cr.alive=false` on stop/edge. (Sand fill is added in Task 5; leave a call site comment for now.)
  - `pickColor(cfg, palette, x, y, w, h, rng)` → `RGBA`.

- [ ] **Step 1: Write the failing test**

Append to `substrate.test.ts`:

```ts
import {
  createSubstrateState, advanceCrack, type SubstrateState,
} from './substrate'
import { substrateSchema, type SubstrateConfig } from './schema'

const cfg = (over: Partial<SubstrateConfig> = {}) => substrateSchema.parse({ ...over })

describe('createSubstrateState', () => {
  it('fills background, seeds initialCracks, starts growing', () => {
    const s = createSubstrateState(cfg({ initialCracks: 4, background: '#ffffff' }), 100, 80)
    expect(s.cracks).toHaveLength(4)
    expect(s.phase).toBe('growing')
    expect(s.buf.length).toBe(100 * 80 * 4)
    expect([s.buf[0], s.buf[1], s.buf[2], s.buf[3]]).toEqual([255, 255, 255, 255])
    for (const c of s.cracks) {
      expect(c.alive).toBe(true)
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThan(100)
      expect(c.y).toBeGreaterThanOrEqual(0); expect(c.y).toBeLessThan(80)
    }
  })

  it('gives each crack an independent RNG stream', () => {
    const s = createSubstrateState(cfg({ seed: 9, initialCracks: 3 }), 100, 100)
    const r0 = Array.from({ length: 4 }, () => s.cracks[0].rng())
    const r1 = Array.from({ length: 4 }, () => s.cracks[1].rng())
    expect(r0).not.toEqual(r1)
  })
})

describe('advanceCrack', () => {
  it('moves the head along its heading and inks a cell', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1, crackColor: '#000000' }), 60, 60)
    const c = s.cracks[0]
    c.x = 30; c.y = 30; c.angle = 0 // heading +x
    const x0 = c.x
    advanceCrack(s, c)
    expect(c.x).toBeGreaterThan(x0)
    expect(c.alive).toBe(true)
    // grid got marked somewhere near (31,30)
    expect(Array.from(s.grid).some((v) => v !== -1)).toBe(true)
  })

  it('dies when it walks off the edge', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 40, 40)
    const c = s.cracks[0]
    c.x = 39.5; c.y = 20; c.angle = 0
    advanceCrack(s, c)
    expect(c.alive).toBe(false)
  })

  it('dies when it meets a clearly-different crack', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 40, 40)
    // pre-ink a vertical wall (angle 90°) at x=21 across the row the crack enters
    const deg = 90
    for (let y = 0; y < 40; y++) s.grid[y * 40 + 21] = deg
    const c = s.cracks[0]
    c.x = 20.4; c.y = 20; c.angle = 0 // heading +x into the wall
    advanceCrack(s, c)
    expect(c.alive).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'createSubstrateState'`
Expected: FAIL — `createSubstrateState` not exported.

- [ ] **Step 3: Implement**

Append to `substrate.ts`:

```ts
import type { SubstrateConfig } from './schema'
import type { Size } from '../../framework/types'

export interface Crack {
  x: number; y: number      // float head position (CSS px)
  angle: number             // heading, radians
  gain: number              // sand-painter gain, random-walks in ±SAND_MAXG
  color: RGBA               // wash colour for this crack's current life
  alive: boolean
  rng: () => number         // this crack's own seeded stream
}

export interface SubstrateState {
  cfg: SubstrateConfig
  buf: Uint8ClampedArray<ArrayBuffer> // RGBA, w·h·4, CSS px — never cleared during growth
  grid: Int16Array                    // w·h occupancy (quantized angle | EMPTY)
  cracks: Crack[]
  palette: RGBA[]
  crackC: RGBA                         // crack ink colour
  bg: RGBA                             // background colour
  w: number; h: number
  phase: 'growing' | 'fading'
  elapsed: number                     // ms grown this cycle
  fadeElapsed: number                 // ms into the current fade
  rayAvg: number                      // EMA of regionFill ray lengths (saturation signal)
  stepAcc: number                     // fractional-step accumulator (speed → integer steps)
  cycle: number                       // cycle index; varies the per-cycle seed
}

/** Fill an RGBA buffer with an opaque colour. */
function fillRGBA(buf: Uint8ClampedArray, c: RGBA): void {
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = c.r; buf[i + 1] = c.g; buf[i + 2] = c.b; buf[i + 3] = 255
  }
}

/** A crack's wash colour: palette pick, or gradient sample by start position. */
export function pickColor(
  cfg: SubstrateConfig, palette: RGBA[], x: number, y: number, w: number, h: number, rng: () => number,
): RGBA {
  if (cfg.color.mode === 'gradient') {
    const t = cfg.color.source === 'y' ? (h > 0 ? y / h : 0) : (w > 0 ? x / w : 0)
    return sampleGradientRGBA(cfg.color.stops, t)
  }
  return palette[Math.floor(rng() * palette.length)] ?? palette[0]
}

/** Per-cycle seed so each cycle is a fresh network, reproducible from cfg.seed. */
function cycleSeed(seed: number, cycle: number): number {
  return (seed + cycle * 0x85ebca6b) >>> 0
}

/** Seed `initialCracks` cracks at random positions/headings for cycle `cycle`. */
function seedCracks(cfg: SubstrateConfig, palette: RGBA[], w: number, h: number, cycle: number): Crack[] {
  const base = cycleSeed(cfg.seed, cycle)
  return Array.from({ length: cfg.initialCracks }, (_, i) => {
    const rng = mulberry32(seedFor(base, i))
    const x = rng() * w
    const y = rng() * h
    const angle = rng() * Math.PI * 2
    const gain = 0.01 + rng() * 0.09
    const color = pickColor(cfg, palette, x, y, w, h, rng)
    return { x, y, angle, gain, color, alive: true, rng }
  })
}

export function createSubstrateState(cfg: SubstrateConfig, w: number, h: number): SubstrateState {
  const W = Math.max(1, w), H = Math.max(1, h)
  const palette = cfg.color.colors.map(parseHex8)
  const bg = parseHex6(cfg.background)
  const buf = new Uint8ClampedArray(W * H * 4)
  fillRGBA(buf, bg)
  return {
    cfg, buf, grid: makeGrid(W, H),
    cracks: seedCracks(cfg, palette, W, H, 0),
    palette, crackC: parseHex6(cfg.crackColor), bg,
    w: W, h: H,
    phase: 'growing', elapsed: 0, fadeElapsed: 0,
    rayAvg: Math.min(W, H), stepAcc: 0, cycle: 0,
  }
}

/** Advance one crack one STEP: move, fuzz, (sand fill — Task 5), ink, collide. */
export function advanceCrack(state: SubstrateState, cr: Crack): void {
  const { grid, buf, w, h, crackC } = state
  cr.x += STEP * Math.cos(cr.angle)
  cr.y += STEP * Math.sin(cr.angle)
  const fx = cr.x + (cr.rng() * 2 - 1) * FUZZ
  const fy = cr.y + (cr.rng() * 2 - 1) * FUZZ
  const ix = Math.floor(fx), iy = Math.floor(fy)
  if (ix < 0 || ix >= w || iy < 0 || iy >= h) { cr.alive = false; return }
  // (Task 5 inserts: regionFill(state, cr) here — perpendicular watercolour wash.)
  blendPixel(buf, w, h, ix, iy, crackC, 1) // dark crack ink
  const idx = iy * w + ix
  const deg = quantizeAngle(cr.angle)
  if (blocks(grid[idx], deg)) { cr.alive = false; return }
  markCell(grid, idx, deg)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'createSubstrateState|advanceCrack'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/substrate/substrate.ts src/diversions/substrate/substrate.test.ts
git commit -m "substrate: crack model, state creation, single-step advance"
```

---

### Task 4: Relocate-on-stop + active-crack ramp

**Files:**
- Modify: `src/diversions/substrate/substrate.ts`
- Test: `src/diversions/substrate/substrate.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `findStart(state, cr)`: reposition a stopped crack onto a random inked grid cell with a perpendicular (±90° + jitter) heading; fresh gain + colour; `alive=true`. Falls back to a random fresh seed if no inked cell is found within the attempt cap.
  - `makeCrack(state)` → `Crack`: a brand-new crack (own rng stream keyed by `cracks.length`) already `findStart`-ed.

- [ ] **Step 1: Write the failing test**

Append to `substrate.test.ts`:

```ts
import { findStart, makeCrack } from './substrate'

describe('findStart', () => {
  it('relocates onto an inked cell with a perpendicular-ish heading and revives', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1, branchJitter: 0 }), 50, 50)
    // ink a horizontal crack (angle 0°) along row 25
    for (let x = 5; x < 45; x++) s.grid[25 * 50 + x] = 0
    const c = s.cracks[0]
    c.alive = false
    findStart(s, c)
    expect(c.alive).toBe(true)
    // landed on the inked row
    expect(Math.floor(c.y)).toBe(25)
    expect(c.x).toBeGreaterThanOrEqual(5); expect(c.x).toBeLessThan(45)
    // heading ~perpendicular to 0° → cos(angle) ≈ 0 (±90°)
    expect(Math.abs(Math.cos(c.angle))).toBeLessThan(0.2)
  })

  it('falls back to a fresh random seed when nothing is inked', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 30, 30)
    s.grid.fill(-1) // truly empty
    const c = s.cracks[0]; c.alive = false
    findStart(s, c)
    expect(c.alive).toBe(true)
    expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThan(30)
  })
})

describe('makeCrack', () => {
  it('produces a fresh, alive crack with its own stream', () => {
    const s = createSubstrateState(cfg({ initialCracks: 2 }), 40, 40)
    for (let x = 0; x < 40; x++) s.grid[20 * 40 + x] = 0 // give findStart something to land on
    const c = makeCrack(s)
    expect(c.alive).toBe(true)
    expect(typeof c.rng).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'findStart|makeCrack'`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Append to `substrate.ts`:

```ts
const FIND_TRIES = 1000

/** Reposition a stopped crack onto a random inked cell, heading ±90° (+ jitter)
 *  off that cell's crack. Fresh gain + colour; revives the crack. Falls back to a
 *  random seed if no inked cell is sampled within FIND_TRIES. */
export function findStart(state: SubstrateState, cr: Crack): void {
  const { grid, w, h, cfg, palette } = state
  let found = false
  for (let t = 0; t < FIND_TRIES && !found; t++) {
    const px = Math.floor(cr.rng() * w)
    const py = Math.floor(cr.rng() * h)
    const cell = grid[py * w + px]
    if (cell !== EMPTY) {
      const base = (cell * Math.PI) / 180
      const sign = cr.rng() < 0.5 ? 1 : -1
      const jitter = (cr.rng() * 2 - 1) * (cfg.branchJitter * Math.PI / 180)
      cr.x = px; cr.y = py
      cr.angle = base + sign * (Math.PI / 2) + jitter
      found = true
    }
  }
  if (!found) {
    cr.x = cr.rng() * w
    cr.y = cr.rng() * h
    cr.angle = cr.rng() * Math.PI * 2
  }
  cr.gain = 0.01 + cr.rng() * 0.09
  cr.color = pickColor(cfg, palette, cr.x, cr.y, w, h, cr.rng)
  cr.alive = true
}

/** A brand-new crack with its own RNG stream (keyed by current population), findStart-ed. */
export function makeCrack(state: SubstrateState): Crack {
  const base = cycleSeed(state.cfg.seed, state.cycle)
  const cr: Crack = {
    x: 0, y: 0, angle: 0, gain: 0.05,
    color: state.palette[0], alive: false,
    rng: mulberry32(seedFor(base, state.cracks.length + 1)),
  }
  findStart(state, cr)
  return cr
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'findStart|makeCrack'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/substrate/substrate.ts src/diversions/substrate/substrate.test.ts
git commit -m "substrate: relocate-on-stop + active-crack ramp helpers"
```

---

### Task 5: Perpendicular ray-march + sand-painter fill

**Files:**
- Modify: `src/diversions/substrate/substrate.ts`
- Test: `src/diversions/substrate/substrate.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `rayLength(state, x, y, perp)` → `number`: march unit steps along direction `perp` from `(x,y)` until an inked cell or edge; returns step count (capped at `min(w,h)`).
  - `regionFill(state, cr)`: from the crack head, ray-march perpendicular, sand-paint head→endpoint with `sin(sin(i·w))` distribution + `grainAlpha` falloff; updates `state.rayAvg` (EMA).
  - Wires `regionFill` into `advanceCrack` (the Task 3 comment site).

- [ ] **Step 1: Write the failing test**

Append to `substrate.test.ts`:

```ts
import { rayLength, regionFill, RAY_DECAY } from './substrate'

describe('rayLength', () => {
  it('stops at the first inked cell along the perpendicular', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 60, 60)
    // ink a vertical wall at x=35
    for (let y = 0; y < 60; y++) s.grid[y * 60 + 35] = 90
    // march +x from (30,30): should reach ~5 steps to x=35
    const n = rayLength(s, 30, 30, 0) // perp angle 0 → +x
    expect(n).toBeGreaterThan(3); expect(n).toBeLessThan(7)
  })

  it('stops at the edge when nothing is inked', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 20, 20)
    s.grid.fill(-1)
    const n = rayLength(s, 18, 10, 0) // +x from x=18 in width 20 → ~1-2 steps
    expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(4)
  })
})

describe('regionFill', () => {
  it('paints into the buffer and updates the ray EMA', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1, background: '#ffffff' }), 40, 40)
    const before = Array.from(s.buf)
    const ema0 = s.rayAvg
    const c = s.cracks[0]
    c.x = 20; c.y = 20; c.angle = 0; c.color = { r: 200, g: 0, b: 0, a: 1 }
    regionFill(s, c)
    expect(Array.from(s.buf)).not.toEqual(before) // some grains landed
    expect(s.rayAvg).not.toBe(ema0)               // EMA moved
  })

  it('keeps the sand gain within ±SAND_MAXG over many fills', () => {
    const s = createSubstrateState(cfg({ initialCracks: 1 }), 80, 80)
    const c = s.cracks[0]; c.x = 40; c.y = 40; c.angle = 0.7
    for (let i = 0; i < 500; i++) regionFill(s, c)
    expect(Math.abs(c.gain)).toBeLessThanOrEqual(SAND_MAXG + 1e-9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'rayLength|regionFill'`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Append to `substrate.ts`:

```ts
/** March unit steps from (x,y) along heading `perp` until an inked cell or the
 *  edge; return the number of steps (capped at min(w,h)). */
export function rayLength(state: SubstrateState, x: number, y: number, perp: number): number {
  const { grid, w, h } = state
  const dx = Math.cos(perp), dy = Math.sin(perp)
  const cap = Math.min(w, h)
  let rx = x, ry = y
  for (let n = 1; n <= cap; n++) {
    rx += dx; ry += dy
    const ix = Math.floor(rx), iy = Math.floor(ry)
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) return n
    if (grid[iy * w + ix] !== EMPTY) return n
  }
  return cap
}

/** Perpendicular watercolour wash: ray-march to the nearest neighbour, then lay
 *  `grainDensity` grains from the head toward that endpoint with the sin(sin)
 *  distribution + feathering alpha. Updates the saturation ray-EMA. */
export function regionFill(state: SubstrateState, cr: Crack): void {
  const { buf, w, h, cfg } = state
  const perp = cr.angle - Math.PI / 2
  const n = rayLength(state, cr.x, cr.y, perp)
  state.rayAvg = state.rayAvg * (1 - RAY_DECAY) + n * RAY_DECAY
  // endpoint of the ray
  const ex = cr.x + Math.cos(perp) * n
  const ey = cr.y + Math.sin(perp) * n
  // sand-gain random-walk, clamped
  cr.gain += (cr.rng() * 2 - 1) * 0.05
  if (cr.gain < -SAND_MAXG) cr.gain = -SAND_MAXG
  if (cr.gain > SAND_MAXG) cr.gain = SAND_MAXG
  const grains = cfg.grainDensity
  const wgt = cr.gain / (grains - 1)
  const c = cr.color
  for (let i = 0; i < grains; i++) {
    const sis = Math.sin(Math.sin(i * wgt))
    const px = cr.x + (ex - cr.x) * sis
    const py = cr.y + (ey - cr.y) * sis
    const a = grainAlpha(i, grains, cfg.grainOpacity) * c.a
    if (a > 0) blendPixel(buf, w, h, Math.round(px), Math.round(py), c, a)
  }
}
```

Then wire it into `advanceCrack` — replace the Task 3 comment line:

```ts
  // (Task 5 inserts: regionFill(state, cr) here — perpendicular watercolour wash.)
```

with:

```ts
  regionFill(state, cr)
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'rayLength|regionFill|advanceCrack'`
Expected: PASS (advanceCrack still passes with the fill wired in).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/substrate/substrate.ts src/diversions/substrate/substrate.test.ts
git commit -m "substrate: perpendicular ray-march + sand-painter fill"
```

---

### Task 6: Lifecycle state machine (step, fade, reseed)

**Files:**
- Modify: `src/diversions/substrate/substrate.ts`
- Test: `src/diversions/substrate/substrate.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `stepSubstrate(state, dt)`: the per-frame driver. GROWING → advance integer steps (from `speed·dt`), relocate stopped cracks, ramp population toward `maxCracks`, accumulate `elapsed`; transition to FADING when `elapsed ≥ drawTime·1000` OR (`elapsed > WARMUP_MS` AND `rayAvg < MIN_RAY`). FADING → lerp buffer toward `bg`; on completion `reseed`.
  - Exposes `COVERAGE_UNUSED`? No — saturation is ray-based. Nothing else exported.

- [ ] **Step 1: Write the failing test**

Append to `substrate.test.ts`:

```ts
import { stepSubstrate } from './substrate'

describe('stepSubstrate growth', () => {
  it('paints over time and ramps active cracks toward maxCracks', () => {
    const s = createSubstrateState(cfg({ seed: 3, initialCracks: 3, maxCracks: 60, speed: 120 }), 200, 150)
    const before = Array.from(s.buf)
    for (let i = 0; i < 240; i++) stepSubstrate(s, 16) // ~3.8s
    expect(Array.from(s.buf)).not.toEqual(before)
    expect(s.cracks.length).toBeGreaterThan(3)
    expect(s.cracks.length).toBeLessThanOrEqual(60)
  })

  it('same seed + same dt cadence → identical buffer', () => {
    const a = createSubstrateState(cfg({ seed: 11, speed: 100 }), 120, 90)
    const b = createSubstrateState(cfg({ seed: 11, speed: 100 }), 120, 90)
    for (let i = 0; i < 200; i++) { stepSubstrate(a, 16); stepSubstrate(b, 16) }
    expect(Array.from(a.buf)).toEqual(Array.from(b.buf))
    const c = createSubstrateState(cfg({ seed: 12, speed: 100 }), 120, 90)
    for (let i = 0; i < 200; i++) stepSubstrate(c, 16)
    expect(Array.from(c.buf)).not.toEqual(Array.from(a.buf))
  })
})

describe('stepSubstrate lifecycle', () => {
  it('enters fading when drawTime elapses, then reseeds growing', () => {
    const s = createSubstrateState(cfg({ drawTime: 1, fadeTime: 1, speed: 60 }), 80, 80)
    for (let i = 0; i < 70; i++) stepSubstrate(s, 16)   // >1s → fading
    expect(s.phase).toBe('fading')
    const cycle0 = s.cycle
    for (let i = 0; i < 80; i++) stepSubstrate(s, 16)   // >1s fade → reseed
    expect(s.phase).toBe('growing')
    expect(s.cycle).toBe(cycle0 + 1)
    expect(s.elapsed).toBeLessThan(200)                 // reset
  })

  it('fading drives the buffer toward the background colour', () => {
    const s = createSubstrateState(cfg({ drawTime: 1, fadeTime: 1, background: '#ffffff', speed: 80 }), 60, 60)
    for (let i = 0; i < 80; i++) stepSubstrate(s, 16)   // grow + paint
    // force into fade
    s.phase = 'fading'; s.fadeElapsed = 0
    for (let i = 0; i < 80; i++) stepSubstrate(s, 16)   // full 1s fade
    // after a full fade the canvas is ≈ white again
    expect(s.buf[0]).toBeGreaterThan(250)
    expect(s.buf[1]).toBeGreaterThan(250)
    expect(s.buf[2]).toBeGreaterThan(250)
  })

  it('saturation (forced low rayAvg after warmup) triggers an early fade', () => {
    const s = createSubstrateState(cfg({ drawTime: 180, speed: 60 }), 80, 80)
    for (let i = 0; i < 200; i++) stepSubstrate(s, 16)  // past WARMUP_MS
    s.rayAvg = 1 // pretend the canvas is packed
    stepSubstrate(s, 16)
    expect(s.phase).toBe('fading')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'stepSubstrate'`
Expected: FAIL — `stepSubstrate` not exported.

- [ ] **Step 3: Implement**

Append to `substrate.ts`:

```ts
/** Lerp the whole buffer toward bg by a fraction that completes exactly at fadeTime. */
function fadeStep(state: SubstrateState, dt: number): void {
  const total = state.cfg.fadeTime * 1000
  const remaining = Math.max(dt, total - (state.fadeElapsed - dt))
  const frac = Math.min(1, dt / remaining)
  const { buf, bg } = state
  for (let i = 0; i < buf.length; i += 4) {
    buf[i]     += (bg.r - buf[i]) * frac
    buf[i + 1] += (bg.g - buf[i + 1]) * frac
    buf[i + 2] += (bg.b - buf[i + 2]) * frac
  }
}

/** Start a fresh cycle: clear buffer + grid, new varied seed, reset lifecycle. */
function reseed(state: SubstrateState): void {
  fillRGBA(state.buf, state.bg)
  state.grid.fill(EMPTY)
  state.cycle += 1
  state.cracks = seedCracks(state.cfg, state.palette, state.w, state.h, state.cycle)
  state.phase = 'growing'
  state.elapsed = 0
  state.fadeElapsed = 0
  state.rayAvg = Math.min(state.w, state.h)
  state.stepAcc = 0
}

/** Per-frame driver. */
export function stepSubstrate(state: SubstrateState, dt: number): void {
  if (state.phase === 'fading') {
    state.fadeElapsed += dt
    fadeStep(state, dt)
    if (state.fadeElapsed >= state.cfg.fadeTime * 1000) reseed(state)
    return
  }
  // GROWING
  state.elapsed += dt
  state.stepAcc += (state.cfg.speed * (dt / 1000)) / STEP
  let steps = Math.floor(state.stepAcc)
  state.stepAcc -= steps
  if (steps > MAX_STEPS) steps = MAX_STEPS
  for (let s = 0; s < steps; s++) {
    let spawn = 0
    for (const cr of state.cracks) {
      if (!cr.alive) continue
      advanceCrack(state, cr)
      if (!cr.alive) { findStart(state, cr); spawn++ } // relocate keeps it alive
    }
    while (spawn-- > 0 && state.cracks.length < state.cfg.maxCracks) {
      state.cracks.push(makeCrack(state))
    }
  }
  const saturated = state.elapsed > WARMUP_MS && state.rayAvg < MIN_RAY
  if (state.elapsed >= state.cfg.drawTime * 1000 || saturated) {
    state.phase = 'fading'
    state.fadeElapsed = 0
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'stepSubstrate'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/substrate/substrate.ts src/diversions/substrate/substrate.test.ts
git commit -m "substrate: lifecycle state machine (step, fade, reseed)"
```

---

### Task 7: Live-apply update + resize

**Files:**
- Modify: `src/diversions/substrate/substrate.ts`
- Test: `src/diversions/substrate/substrate.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - `updateSubstrateState(state, cfg, size)` → `boolean`: returns `false` for structural changes (`initialCracks`, `maxCracks`, `seed`, `background`) so the framework re-runs setup; otherwise live-applies visual params (speed, branchJitter, drawTime, fadeTime, grainDensity, grainOpacity, crackColor, the whole `color` group) and returns `true`.
  - `resizeSubstrateState(state, size)`: rebuild buffer + grid at the new size and reseed (accretion resets), mirroring Sand Stroke.

- [ ] **Step 1: Write the failing test**

Append to `substrate.test.ts`:

```ts
import { updateSubstrateState, resizeSubstrateState } from './substrate'

describe('updateSubstrateState', () => {
  it('applies live visual params (returns true)', () => {
    const s = createSubstrateState(cfg({ grainOpacity: 0.1 }), 100, 100)
    expect(updateSubstrateState(s, cfg({ grainOpacity: 0.2 }), { width: 100, height: 100 })).toBe(true)
    expect(s.cfg.grainOpacity).toBeCloseTo(0.2)
    expect(updateSubstrateState(s, cfg({ crackColor: '#112233' }), { width: 100, height: 100 })).toBe(true)
    expect(s.crackC).toEqual({ r: 17, g: 34, b: 51, a: 1 })
  })

  it('returns false for structural changes (initialCracks, maxCracks, seed, background)', () => {
    const s = createSubstrateState(cfg(), 100, 100)
    expect(updateSubstrateState(s, cfg({ initialCracks: 5 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSubstrateState(s, cfg({ maxCracks: 300 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSubstrateState(s, cfg({ seed: 99 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSubstrateState(s, cfg({ background: '#000000' }), { width: 100, height: 100 })).toBe(false)
  })
})

describe('resizeSubstrateState', () => {
  it('rebuilds buffer + grid at the new size and refills background', () => {
    const s = createSubstrateState(cfg({ background: '#ffffff' }), 50, 50)
    resizeSubstrateState(s, { width: 80, height: 60 })
    expect(s.w).toBe(80); expect(s.h).toBe(60)
    expect(s.buf.length).toBe(80 * 60 * 4)
    expect(s.grid.length).toBe(80 * 60)
    expect([s.buf[0], s.buf[1], s.buf[2], s.buf[3]]).toEqual([255, 255, 255, 255])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'updateSubstrateState|resizeSubstrateState'`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Append to `substrate.ts`:

```ts
/** Apply a config change live; false for structural changes (→ framework re-setup). */
export function updateSubstrateState(state: SubstrateState, cfg: SubstrateConfig, _size: Size): boolean {
  if (
    cfg.initialCracks !== state.cfg.initialCracks ||
    cfg.maxCracks !== state.cfg.maxCracks ||
    cfg.seed !== state.cfg.seed ||
    cfg.background !== state.cfg.background
  ) return false
  state.cfg = cfg
  state.palette = cfg.color.colors.map(parseHex8)
  state.crackC = parseHex6(cfg.crackColor)
  return true
}

/** Rebuild at a new size, refill background, reseed (accretion resets). */
export function resizeSubstrateState(state: SubstrateState, size: Size): void {
  const fresh = createSubstrateState(state.cfg, Math.max(1, size.width), Math.max(1, size.height))
  state.buf = fresh.buf
  state.grid = fresh.grid
  state.cracks = fresh.cracks
  state.palette = fresh.palette
  state.crackC = fresh.crackC
  state.bg = fresh.bg
  state.w = fresh.w
  state.h = fresh.h
  state.phase = 'growing'
  state.elapsed = 0
  state.fadeElapsed = 0
  state.rayAvg = fresh.rayAvg
  state.stepAcc = 0
  state.cycle = 0
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'updateSubstrateState|resizeSubstrateState'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/substrate/substrate.ts src/diversions/substrate/substrate.test.ts
git commit -m "substrate: live-apply update + resize"
```

---

### Task 8: Diversion contract (index.ts), README credit, full verify

**Files:**
- Create: `src/diversions/substrate/index.ts`
- Modify: `README.md` (Credits / Inspiration line)
- Test: full suite + Chrome verify

**Interfaces:**
- Consumes: all of `substrate.ts` + `schema.ts`.
- Produces: `default` export — a `Diversion<SubstrateConfig, SubstrateState, '2d'>`. Auto-registered via `import.meta.glob('../diversions/*/index.ts')`.

- [ ] **Step 1: Write `index.ts`**

Create `src/diversions/substrate/index.ts` (mirrors Sand Stroke's offscreen-blit pattern):

```ts
// Substrate — clean-room reimplementation of the algorithm from Jared
// Tarbell's "Substrate" (complexification.net/gallery/machines/substrate/).
// Reproduced from the published algorithm; not a code port. Original © Jared Tarbell.
import type { Diversion } from '../../framework/types'
import { substrateSchema, type SubstrateConfig } from './schema'
import {
  createSubstrateState, stepSubstrate, updateSubstrateState, resizeSubstrateState,
  type SubstrateState,
} from './substrate'

// The accreting painting lives in a CSS-px ImageData buffer. The main 2D context
// is DPR-scaled (setTransform(dpr)), and putImageData ignores that transform — so
// we blit through an offscreen canvas with drawImage, which honours it and upscales
// the CSS-px buffer to fill the whole canvas crisply. Cached per state, rebuilt on resize.
const offscreens = new WeakMap<SubstrateState, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number }>()
function getOffscreen(state: SubstrateState) {
  let off = offscreens.get(state)
  if (!off || off.w !== state.w || off.h !== state.h) {
    const canvas = document.createElement('canvas')
    canvas.width = state.w
    canvas.height = state.h
    off = { canvas, ctx: canvas.getContext('2d')!, w: state.w, h: state.h }
    offscreens.set(state, off)
  }
  return off
}

const substrate: Diversion<SubstrateConfig, SubstrateState, '2d'> = {
  id: 'substrate',
  title: 'Substrate',
  description: 'Cracks grow and branch at right angles into an organic network, '
    + 'each washing a soft watercolour cell beside it. After Jared Tarbell’s Substrate (complexification.net).',
  kind: '2d',
  schema: substrateSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createSubstrateState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepSubstrate(state, dt)
    const off = getOffscreen(state)
    off.ctx.putImageData(new ImageData(state.buf, state.w, state.h), 0, 0)
    ctx.drawImage(off.canvas, 0, 0, state.w, state.h)
  },

  resize(state, size) {
    resizeSubstrateState(state, size)
  },

  update(state, config, size) {
    return updateSubstrateState(state, config, size)
  },
}

export default substrate
```

- [ ] **Step 2: Add the README credit line**

In `README.md`, find the "Credits / Inspiration" section (added for Sand Stroke). Add a Substrate line alongside it, e.g.:

```markdown
- **Substrate** — after Jared Tarbell's _Substrate_
  (<http://www.complexification.net/gallery/machines/substrate/>). Clean-room
  reimplementation of the algorithm; not a code port.
```

(If the section's exact wording differs, match the existing Sand Stroke entry's format.)

- [ ] **Step 3: Run the full test suite + typecheck + build**

Run: `npx vitest run`
Expected: all suites green, including the global `urlKeys.test.ts` leaf-name guard (confirms no Substrate leaf-name collides with another diversion's schema — `initialCracks`, `maxCracks`, `branchJitter`, `drawTime`, `fadeTime`, `grainDensity`, `grainOpacity`, `crackColor` are all unique; `speed`, `background`, `color`, `seed` are shared leaf names but the codec falls back to dotted paths via that guard — if the test flags a collision, it will name the key, and the fix is to confirm the guard's expectations include Substrate).

Run: `npx tsc --noEmit` (or the project's typecheck script) — expect no errors.
Run: `npm run build` — expect a clean production build.

- [ ] **Step 4: Chrome verify (chrome-devtools MCP, port 5180)**

Start the dev server in the background, then open Chrome to the Substrate play screen:

```
http://localhost:5180/d/substrate/play?mute=1
```

Confirm visually (this is a screensaver — quality matters, not just "it renders"):
- Cracks grow straight, branch at right angles, and stop on contact — an organic network forms.
- Each cell fills with a soft watercolour wash bounded by its neighbours (not uniform ribbons).
- After ~`drawTime` (or when it looks packed) the painting fades to the cream ground and a *new* network grows.
- Open the config screen; every subpanel control changes the look; gradient-mode fields appear only in gradient mode; `maxCracks` help reads "active cap."

- [ ] **Step 5: Commit**

```bash
git add src/diversions/substrate/index.ts README.md
git commit -m "substrate: diversion contract + README credit"
```

---

## Self-Review

**Spec coverage:**
- Provenance/credit → Task 1 (header comments) + Task 8 (README). ✓
- Algorithm (advance, collision, occupancy grid) → Tasks 2–3. ✓
- Relocate-on-stop + active-crack ramp → Task 4. ✓
- Perpendicular ray-march sand fill (decision A) → Task 5. ✓
- Lifecycle (timer + saturation reset, fade, varied-per-cycle reseed) → Task 6. ✓
- Live-apply vs structural `update` + resize → Task 7. ✓
- Config schema (all sections, palette/gradient reuse, sliders bounded, seed last) → Task 1. ✓
- Buffer/offscreen-blit + Diversion contract → Task 8. ✓
- Determinism (per-crack streams) → Tasks 3 + 6 tests. ✓
- Testing list (collision, relocate, ray-march, grain math, lifecycle, determinism, schema, codec) → covered across Tasks 1–8. ✓
- Five UX invariants → schema meta (Task 1) + Chrome verify (Task 8). ✓

**Placeholder scan:** No TBD/TODO; the only intentional "insert here" is the Task 3 → Task 5 wiring, which is explicit (exact line to replace + replacement). The deliberately-wrong test assertion in Task 2 Step 1 is flagged with its correction inline.

**Type consistency:** `SubstrateState` fields (`crackC`, `bg`, `rayAvg`, `stepAcc`, `cycle`, `phase`) are used consistently across Tasks 3/6/7. `Crack` shape stable from Task 3. Function names stable: `createSubstrateState`, `advanceCrack`, `findStart`, `makeCrack`, `rayLength`, `regionFill`, `stepSubstrate`, `updateSubstrateState`, `resizeSubstrateState`, `pickColor`, `blocks`, `markCell`, `makeGrid`. Constants exported from Task 1 and reused by name.

## Execution Handoff

Per project convention (code-only Vite project) and the global heuristic — run the **foundational tasks inline** (they lock the module shape, test idioms, and the crack/grid contract every later task builds on), then hand the now-replicable pure-logic tasks to **subagents**. Inherently-inline tasks (dev server + Chrome verify) stay inline.

Proposed split:
- **Inline:** Task 1 (schema + helpers — locks module shape & test idioms), Task 2 (grid + collision — the core contract). Task 8's Chrome-verify step is inline regardless.
- **Subagent-eligible:** Tasks 3, 4, 5, 6, 7 (pure logic + co-located Vitest — clean file-edit-test loops), and Task 8's index.ts/README authorship.

Code review (fresh `diversion-reviewer` subagent) runs as the second-to-last phase before the final Chrome verify + FF-merge.
