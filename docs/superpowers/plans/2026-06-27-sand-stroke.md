# Sand Stroke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a faithful, clean-room reimplementation of Jared Tarbell's _Sand Stroke_ as a new Diversion — parallel horizontal sweeps laying perpendicular columns of translucent sand grains that accrete into wavy, density-modulated colour ribbons.

**Architecture:** `kind: '2d'`. The piece never clears and blends per-pixel, so it owns an **offscreen CSS-px canvas + ImageData buffer** (the accreting painting); grains blend in via a manual lerp (Tarbell's `tpoint`), and each frame the buffer is `drawImage`'d onto the DPR-scaled main context. Pure logic (grain falloff, gain walk, blend, sweep stepping, seeded RNG) is unit-tested; the diversion auto-registers via the framework's `import.meta.glob`.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + Vitest. No new dependencies.

---

## Reference facts (from the spec)

- Spec: `docs/superpowers/specs/2026-06-27-sand-stroke-design.md`.
- Faithful constants: gain clamp `±0.3` (`MAX_GAIN`), grain alpha `opacity·(1 − i/(density·10+10))`, center grain alpha `0.7·opacity`, gain walk uniform `±waviness`.
- Scaled to canvas (decision A): `gage = bandHeight·h / sin(0.3)` so `gage·sin(0.3) = bandHeight·h`; horizontal advance is `dt`-driven at `pxPerSec = w·speed / 8` (≈8 s to cross at speed=1), depositing one column per whole pixel advanced (one gain-walk per column — framerate-independent & deterministic).
- Reference idioms: `src/diversions/flow-field/schema.ts` (colour group + `.meta`), `src/diversions/flow-field/flowField.ts` (`parseHex8`, `sampleGradient`, `mulberry32` usage, `createState/updateState/step` shape), `src/diversions/flow-field/index.ts` (Diversion contract).

## File Structure

```text
src/diversions/sand-stroke/
  schema.ts            Zod schema + SandStrokeConfig type. seed LAST (Advanced renders last).
  sandStroke.ts        Pure core + state: RNG, RGBA parse/gradient, palette, gage derive,
                       grain-alpha falloff, gain walk+clamp, blendPixel (tpoint), sweep
                       stepping/respawn, createSandState/updateSandState/stepSand/resizeSandState.
  index.ts             Diversion<SandStrokeConfig, SandState, '2d'> contract (+ clean-room
                       credit header). Auto-registered by import.meta.glob.
  schema.test.ts       defaults parse, ranges, seed-last.
  sandStroke.test.ts   grain alpha, gain walk/clamp, blendPixel, gradient, respawn, determinism.
README.md              add a "Credits / Inspiration" line crediting Jared Tarbell.
```

---

### Task 1: Config schema

**Files:**
- Create: `src/diversions/sand-stroke/schema.ts`
- Test: `src/diversions/sand-stroke/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/diversions/sand-stroke/schema.test.ts
import { describe, it, expect } from 'vitest'
import { sandStrokeSchema } from './schema'

describe('sandStrokeSchema', () => {
  it('parses with all defaults', () => {
    const cfg = sandStrokeSchema.parse({})
    expect(cfg.strokes).toBe(40)
    expect(cfg.speed).toBe(1)
    expect(cfg.bandHeight).toBeCloseTo(0.13)
    expect(cfg.waviness).toBeCloseTo(0.042)
    expect(cfg.density).toBe(200)
    expect(cfg.opacity).toBeCloseTo(0.1)
    expect(cfg.background).toBe('#ffffff')
    expect(cfg.color.mode).toBe('palette')
    expect(cfg.color.colors.length).toBeGreaterThanOrEqual(1)
    expect(cfg.colorDrift).toBe(8)
    expect(cfg.seed).toBe(4823)
  })

  it('enforces ranges', () => {
    expect(() => sandStrokeSchema.parse({ strokes: 0 })).toThrow()
    expect(() => sandStrokeSchema.parse({ strokes: 200 })).toThrow()
    expect(() => sandStrokeSchema.parse({ opacity: 1 })).toThrow()
    expect(() => sandStrokeSchema.parse({ background: 'white' })).toThrow()
  })

  it('puts seed last so Advanced renders last', () => {
    const keys = Object.keys(sandStrokeSchema.shape)
    expect(keys[keys.length - 1]).toBe('seed')
  })

  it('colors and stops are #rrggbbaa', () => {
    const cfg = sandStrokeSchema.parse({})
    for (const c of cfg.color.colors) expect(c).toMatch(/^#[0-9a-fA-F]{8}$/)
    for (const s of cfg.color.stops) expect(s).toMatch(/^#[0-9a-fA-F]{8}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/sand-stroke/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Write the schema**

```typescript
// src/diversions/sand-stroke/schema.ts
import { z } from 'zod'

export const sandStrokeSchema = z.object({
  strokes: z.number().int().min(4).max(80).default(40)
    .meta({ section: 'Strokes', ui: 'slider', min: 4, max: 80, step: 1, label: 'Strokes',
            help: 'Number of parallel horizontal sweeps laying sand across the canvas.' }),
  speed: z.number().min(0.2).max(4).default(1)
    .meta({ section: 'Strokes', ui: 'slider', min: 0.2, max: 4, step: 0.1, label: 'Speed',
            help: 'How fast a sweep crosses the canvas. Seconds-to-cross is proportional to 1/speed.' }),
  bandHeight: z.number().min(0.02).max(0.4).default(0.13)
    .meta({ section: 'The Wave', ui: 'slider', min: 0.02, max: 0.4, step: 0.01, label: 'Band height',
            help: 'Maximum half-thickness of a sweep’s sand column, as a fraction of canvas height.' }),
  waviness: z.number().min(0.005).max(0.12).default(0.042)
    .meta({ section: 'The Wave', ui: 'slider', min: 0.005, max: 0.12, step: 0.001, label: 'Waviness',
            help: 'How fast a sweep’s thickness wanders. Low ≈ near-constant ribbons; high = busy waves.' }),
  density: z.number().int().min(40).max(400).default(200)
    .meta({ section: 'Grain', ui: 'slider', min: 40, max: 400, step: 10, label: 'Grain density',
            help: 'Grains per side per column. More = denser, smoother bands (and a little slower).' }),
  opacity: z.number().min(0.02).max(0.3).default(0.1)
    .meta({ section: 'Grain', ui: 'slider', min: 0.02, max: 0.3, step: 0.005, label: 'Grain opacity',
            help: 'Alpha at the dense spine of a column; grains feather toward ~0 at the band edges.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground colour. The painting is never cleared, so this is painted once.' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('palette')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Mode',
              help: 'Palette: each sweep picks one random colour. '
                  + 'Gradient: colour is sampled along a source (lane or progress).' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#7c3f1eff', '#c8762fff', '#e0a458ff', '#9c5a3cff', '#3a4a6bff', '#b0402eff'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Each sweep picks one colour at random per pass. A colour’s alpha multiplies '
                  + 'the grain falloff — leave at ff for the faithful look, lower it to thin a colour.' }),
    source: z.enum(['y', 'x']).default('y')
      .meta({ ui: 'segmented', options: ['y', 'x'], label: 'Gradient source',
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'What maps onto the gradient: y (a sweep’s lane height) or x (column progress L→R).' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#7c3f1eff', '#c8762fff', '#3a4a6bff'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Evenly spaced and sampled along the source; per-stop alpha multiplies grain build-up.' }),
  }).default({
    mode: 'palette',
    colors: ['#7c3f1eff', '#c8762fff', '#e0a458ff', '#9c5a3cff', '#3a4a6bff', '#b0402eff'],
    source: 'y',
    stops: ['#7c3f1eff', '#c8762fff', '#3a4a6bff'],
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
  colorDrift: z.number().int().min(0).max(100).default(8)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 100, step: 1, label: 'Color drift',
            help: 'Chance a sweep recolours mid-pass near a flat point (palette mode). 0 = one colour per pass.' }),
  seed: z.number().int().default(4823)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always regenerates the same painting.' }),
})

export type SandStrokeConfig = z.infer<typeof sandStrokeSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/sand-stroke/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/sand-stroke/schema.ts src/diversions/sand-stroke/schema.test.ts
git commit -m "sand-stroke: config schema"
```

---

### Task 2: Pure grain & blend helpers

**Files:**
- Create: `src/diversions/sand-stroke/sandStroke.ts`
- Test: `src/diversions/sand-stroke/sandStroke.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/diversions/sand-stroke/sandStroke.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseHex8, grainAlpha, MAX_GAIN, stepGain, blendPixel, sampleGradientRGBA, gageFor,
} from './sandStroke'

describe('parseHex8', () => {
  it('parses #rrggbbaa to rgb + 0..1 alpha', () => {
    expect(parseHex8('#80c0ffff')).toEqual({ r: 128, g: 192, b: 255, a: 1 })
    const c = parseHex8('#00000000')
    expect(c).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })
})

describe('grainAlpha', () => {
  it('is the spine opacity at i=0 and feathers toward ~0 at the edge', () => {
    expect(grainAlpha(0, 200, 0.1)).toBeCloseTo(0.1)
    const edge = grainAlpha(199, 200, 0.1)
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(0.005)
  })
  it('is monotonically decreasing in i', () => {
    let prev = Infinity
    for (let i = 0; i < 200; i++) {
      const a = grainAlpha(i, 200, 0.1)
      expect(a).toBeLessThanOrEqual(prev)
      prev = a
    }
  })
})

describe('stepGain', () => {
  it('clamps to ±MAX_GAIN', () => {
    expect(MAX_GAIN).toBeCloseTo(0.3)
    const up = () => 1 // rng()=1 -> +waviness every step
    let g = 0
    for (let i = 0; i < 100; i++) g = stepGain(g, 0.042, up)
    expect(g).toBeCloseTo(MAX_GAIN)
    const down = () => 0 // rng()=0 -> -waviness every step
    g = 0
    for (let i = 0; i < 100; i++) g = stepGain(g, 0.042, down)
    expect(g).toBeCloseTo(-MAX_GAIN)
  })
  it('is a uniform symmetric step of ±waviness', () => {
    expect(stepGain(0, 0.05, () => 0.5)).toBeCloseTo(0) // rng()=0.5 -> 0 delta
    expect(stepGain(0, 0.05, () => 1)).toBeCloseTo(0.05)
  })
})

describe('blendPixel (tpoint)', () => {
  it('moves each channel a fraction a toward the grain colour and sets opaque', () => {
    const w = 2, h = 1
    const buf = new Uint8ClampedArray(w * h * 4).fill(0)
    blendPixel(buf, w, h, 0, 0, { r: 100, g: 200, b: 50, a: 1 }, 0.5)
    expect(buf[0]).toBe(50)  // 0 + (100-0)*0.5
    expect(buf[1]).toBe(100) // 0 + (200-0)*0.5
    expect(buf[2]).toBe(25)  // 0 + (50-0)*0.5
    expect(buf[3]).toBe(255) // opaque
  })
  it('a=0 is a no-op on rgb; ignores out-of-bounds', () => {
    const buf = new Uint8ClampedArray(4).fill(10)
    buf[3] = 255
    blendPixel(buf, 1, 1, 0, 0, { r: 255, g: 255, b: 255, a: 1 }, 0)
    expect([buf[0], buf[1], buf[2]]).toEqual([10, 10, 10])
    expect(() => blendPixel(buf, 1, 1, 5, 5, { r: 0, g: 0, b: 0, a: 1 }, 1)).not.toThrow()
  })
})

describe('sampleGradientRGBA', () => {
  it('returns endpoints at t=0 and t=1', () => {
    const stops = ['#000000ff', '#ffffffff']
    expect(sampleGradientRGBA(stops, 0)).toMatchObject({ r: 0, g: 0, b: 0 })
    expect(sampleGradientRGBA(stops, 1)).toMatchObject({ r: 255, g: 255, b: 255 })
    expect(sampleGradientRGBA(stops, 0.5).r).toBeCloseTo(128, -1)
  })
})

describe('gageFor', () => {
  it('scales so gage·sin(MAX_GAIN) equals bandHeight·h', () => {
    const h = 800, bandHeight = 0.13
    expect(gageFor(bandHeight, h) * Math.sin(MAX_GAIN)).toBeCloseTo(bandHeight * h)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/sand-stroke/sandStroke.test.ts`
Expected: FAIL — cannot resolve `./sandStroke`.

- [ ] **Step 3: Write the helpers**

```typescript
// src/diversions/sand-stroke/sandStroke.ts
// Sand Stroke — clean-room reimplementation of the algorithm from Jared
// Tarbell's "Sand Stroke" (complexification.net). Not a code port; the algorithm
// was reproduced from its published description. Original © Jared Tarbell.

export interface RGBA { r: number; g: number; b: number; a: number }

/** The gain clamp from Tarbell's source — defines the wave's character. */
export const MAX_GAIN = 0.3

/** mulberry32 PRNG — same as flow-field's, kept local so the diversion is self-contained. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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

/** Per-grain alpha: spine `opacity` at i=0, feathering toward ~0 at the band edge.
 *  Faithful to Tarbell's `0.1 - i/(wd*10+10)`, with `opacity` replacing the 0.1 spine. */
export function grainAlpha(i: number, density: number, opacity: number): number {
  return opacity * (1 - i / (density * 10 + 10))
}

/** Random-walk the gain by a uniform ±waviness, clamped to ±MAX_GAIN. */
export function stepGain(g: number, waviness: number, rng: () => number): number {
  const next = g + (rng() * 2 - 1) * waviness
  return Math.max(-MAX_GAIN, Math.min(MAX_GAIN, next))
}

/** Tarbell's `tpoint`: move pixel (x,y) a fraction `a` toward colour `c`, set opaque.
 *  Out-of-bounds is a silent no-op. */
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

/** Linear-interpolate RGBA across evenly-spaced `stops` (hex8) at t in [0,1]. */
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

/** Amplitude scale: gage·sin(MAX_GAIN) == bandHeight·h (band height scales with canvas). */
export function gageFor(bandHeight: number, h: number): number {
  return (bandHeight * h) / Math.sin(MAX_GAIN)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/sand-stroke/sandStroke.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/sand-stroke/sandStroke.ts src/diversions/sand-stroke/sandStroke.test.ts
git commit -m "sand-stroke: pure grain, gain-walk and blend helpers"
```

---

### Task 3: State, sweeps & stepping

**Files:**
- Modify: `src/diversions/sand-stroke/sandStroke.ts` (append)
- Test: `src/diversions/sand-stroke/sandStroke.test.ts` (append)

- [ ] **Step 1: Write the failing test (append)**

```typescript
// append to src/diversions/sand-stroke/sandStroke.test.ts
import {
  createSandState, stepSand, updateSandState, resizeSandState, BASE_CROSS_SECONDS,
} from './sandStroke'
import { sandStrokeSchema } from './schema'

const cfg = (over: Partial<import('./schema').SandStrokeConfig> = {}) =>
  sandStrokeSchema.parse({ ...over })

describe('createSandState', () => {
  it('creates one sweep per stroke, each in-bounds at the left edge', () => {
    const s = createSandState(cfg({ strokes: 12 }), 300, 200)
    expect(s.sweeps).toHaveLength(12)
    for (const sw of s.sweeps) {
      expect(sw.x).toBe(0)
      expect(sw.y).toBeGreaterThanOrEqual(0)
      expect(sw.y).toBeLessThan(200)
    }
    expect(s.buf.length).toBe(300 * 200 * 4)
  })

  it('fills the buffer with the background colour (opaque)', () => {
    const s = createSandState(cfg({ background: '#ffffff' }), 4, 4)
    expect([s.buf[0], s.buf[1], s.buf[2], s.buf[3]]).toEqual([255, 255, 255, 255])
  })
})

describe('stepSand determinism', () => {
  it('same seed → identical buffer after N steps; different seed differs', () => {
    const a = createSandState(cfg({ seed: 7 }), 120, 80)
    const b = createSandState(cfg({ seed: 7 }), 120, 80)
    for (let i = 0; i < 30; i++) { stepSand(a, 16); stepSand(b, 16) }
    expect(Array.from(a.buf)).toEqual(Array.from(b.buf))

    const c = createSandState(cfg({ seed: 8 }), 120, 80)
    for (let i = 0; i < 30; i++) stepSand(c, 16)
    expect(Array.from(c.buf)).not.toEqual(Array.from(a.buf))
  })

  it('advances sweeps rightward and paints (buffer changes from background)', () => {
    const s = createSandState(cfg({ seed: 1, strokes: 6 }), 200, 120)
    const before = Array.from(s.buf)
    for (let i = 0; i < 60; i++) stepSand(s, 16)
    expect(s.sweeps.some((sw) => sw.x > 0)).toBe(true)
    expect(Array.from(s.buf)).not.toEqual(before)
  })
})

describe('sweep respawn', () => {
  it('wraps x back to the left edge after crossing, keeping y a valid lane', () => {
    const s = createSandState(cfg({ seed: 2, strokes: 1, speed: 4 }), 60, 40)
    const lane = s.sweeps[0].y
    for (let i = 0; i < 400; i++) stepSand(s, 16)
    expect(s.sweeps[0].x).toBeLessThan(60)
    expect(s.sweeps[0].x).toBeGreaterThanOrEqual(0)
    expect(s.sweeps[0].y).toBe(lane) // lane is fixed for the sweep's life
  })
})

describe('updateSandState', () => {
  it('applies live params (returns true) and recomputes gage on bandHeight', () => {
    const s = createSandState(cfg({ bandHeight: 0.13 }), 100, 200)
    const g0 = s.gage
    expect(updateSandState(s, cfg({ bandHeight: 0.26 }), { width: 100, height: 200 })).toBe(true)
    expect(s.gage).toBeCloseTo(g0 * 2)
    expect(updateSandState(s, cfg({ opacity: 0.2 }), { width: 100, height: 200 })).toBe(true)
    expect(s.cfg.opacity).toBeCloseTo(0.2)
  })

  it('returns false for structural changes (strokes, seed, background)', () => {
    const s = createSandState(cfg({ strokes: 10, seed: 1, background: '#ffffff' }), 100, 100)
    expect(updateSandState(s, cfg({ strokes: 11 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSandState(s, cfg({ seed: 2 }), { width: 100, height: 100 })).toBe(false)
    expect(updateSandState(s, cfg({ background: '#000000' }), { width: 100, height: 100 })).toBe(false)
  })
})

describe('resizeSandState', () => {
  it('rebuilds the buffer at the new size and refills background', () => {
    const s = createSandState(cfg({ background: '#ffffff' }), 50, 50)
    resizeSandState(s, { width: 80, height: 60 })
    expect(s.w).toBe(80)
    expect(s.h).toBe(60)
    expect(s.buf.length).toBe(80 * 60 * 4)
    expect([s.buf[0], s.buf[1], s.buf[2], s.buf[3]]).toEqual([255, 255, 255, 255])
  })
})

describe('BASE_CROSS_SECONDS', () => {
  it('is a positive constant', () => { expect(BASE_CROSS_SECONDS).toBeGreaterThan(0) })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/sand-stroke/sandStroke.test.ts`
Expected: FAIL — `createSandState` etc. not exported.

- [ ] **Step 3: Append the state + stepping implementation**

```typescript
// append to src/diversions/sand-stroke/sandStroke.ts
import type { SandStrokeConfig } from './schema'
import type { Size } from '../../framework/types'

/** ~seconds for a sweep to cross the canvas at speed=1 → pxPerSec = w·speed / this. */
export const BASE_CROSS_SECONDS = 8

interface Sweep {
  y: number       // fixed lane centre for the sweep's life
  x: number       // float column position, 0..w
  lastCol: number // last integer column deposited
  gain: number    // sg — random-walking band amplitude in [-MAX_GAIN, MAX_GAIN]
  color: RGBA     // palette pick (palette mode) or lane sample (gradient/y); recomputed per column for gradient/x
}

export interface SandState {
  cfg: SandStrokeConfig
  rng: () => number
  img: ImageData
  buf: Uint8ClampedArray
  sweeps: Sweep[]
  palette: RGBA[]
  gage: number
  w: number
  h: number
}

function fillBackground(buf: Uint8ClampedArray, bgHex: string): void {
  const r = parseInt(bgHex.slice(1, 3), 16)
  const g = parseInt(bgHex.slice(3, 5), 16)
  const b = parseInt(bgHex.slice(5, 7), 16)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255
  }
}

/** A sweep's freshly-chosen colour: palette pick, or a gradient sample by lane (source y).
 *  For gradient source 'x' the colour varies per column, so this returns a placeholder the
 *  stepper overrides — see depositColumn. */
function pickColor(cfg: SandStrokeConfig, palette: RGBA[], y: number, h: number, rng: () => number): RGBA {
  if (cfg.color.mode === 'gradient') {
    if (cfg.color.source === 'y') return sampleGradientRGBA(cfg.color.stops, h > 0 ? y / h : 0)
    return sampleGradientRGBA(cfg.color.stops, 0)
  }
  return palette[Math.floor(rng() * palette.length)] ?? palette[0]
}

export function createSandState(cfg: SandStrokeConfig, w: number, h: number): SandState {
  const rng = mulberry32(cfg.seed >>> 0)
  const palette = cfg.color.colors.map(parseHex8)
  const img = new ImageData(Math.max(1, w), Math.max(1, h))
  fillBackground(img.data, cfg.background)
  const gage = gageFor(cfg.bandHeight, h)
  const sweeps: Sweep[] = Array.from({ length: cfg.strokes }, () => {
    const y = Math.floor(rng() * h)
    const gain = 0.01 + rng() * 0.09 // Tarbell's selfinit: random(0.01, 0.1)
    const color = pickColor(cfg, palette, y, h, rng)
    return { y, x: 0, lastCol: -1, gain, color }
  })
  return { cfg, rng, img, buf: img.data, sweeps, palette, gage, w, h }
}

/** Deposit one full column of grains at integer column `col` for a sweep. */
function depositColumn(state: SandState, sw: Sweep, col: number): void {
  const { cfg, buf, palette, gage, w, h, rng } = state
  // gain random-walk (once per column, as in the original's per-frame step)
  sw.gain = stepGain(sw.gain, cfg.waviness, rng)
  // near a flat wave, small chance to recolour (palette mode only)
  if (cfg.color.mode === 'palette' && Math.abs(sw.gain) < 0.01 && rng() < cfg.colorDrift / 1000) {
    sw.color = palette[Math.floor(rng() * palette.length)] ?? palette[0]
  }
  // active colour: gradient/x varies per column; otherwise the sweep's stored colour
  const c = cfg.color.mode === 'gradient' && cfg.color.source === 'x'
    ? sampleGradientRGBA(cfg.color.stops, w > 0 ? col / w : 0)
    : sw.color
  const y = sw.y
  // centre grain (Tarbell: alpha 0.07 ≈ 0.7·spine)
  blendPixel(buf, w, h, col, y, c, 0.7 * cfg.opacity * c.a)
  const wd = cfg.density
  const step = sw.gain / wd
  for (let i = 0; i < wd; i++) {
    const off = gage * Math.sin(i * step)
    const a = grainAlpha(i, wd, cfg.opacity) * c.a
    blendPixel(buf, w, h, col, Math.round(y + off), c, a)
    blendPixel(buf, w, h, col, Math.round(y - off), c, a)
  }
}

export function stepSand(state: SandState, dt: number): void {
  const { cfg, w, h, palette, rng } = state
  const pxPerSec = (w * cfg.speed) / BASE_CROSS_SECONDS
  const adv = pxPerSec * (dt / 1000)
  for (const sw of state.sweeps) {
    sw.x += adv
    // respawn when the sweep runs off the right edge: back to the left, new colour, fresh gain
    if (sw.x >= w) {
      sw.x -= w
      sw.lastCol = -1
      sw.gain = 0.01 + rng() * 0.09
      sw.color = pickColor(cfg, palette, sw.y, h, rng)
    }
    const target = Math.floor(sw.x)
    for (let col = sw.lastCol + 1; col <= target; col++) depositColumn(state, sw, col)
    sw.lastCol = target
  }
}

/** Apply a config change live. Returns false for structural changes (strokes / seed /
 *  background) so the framework re-runs setup; true otherwise. */
export function updateSandState(state: SandState, cfg: SandStrokeConfig, size: Size): boolean {
  if (
    cfg.strokes !== state.cfg.strokes ||
    cfg.seed !== state.cfg.seed ||
    cfg.background !== state.cfg.background
  ) return false
  state.cfg = cfg
  state.palette = cfg.color.colors.map(parseHex8)
  state.gage = gageFor(cfg.bandHeight, size.height)
  return true
}

/** Rebuild the buffer at a new size, refill background, reseed sweeps (accretion resets). */
export function resizeSandState(state: SandState, size: Size): void {
  const fresh = createSandState(state.cfg, Math.max(1, size.width), Math.max(1, size.height))
  state.img = fresh.img
  state.buf = fresh.buf
  state.sweeps = fresh.sweeps
  state.palette = fresh.palette
  state.gage = fresh.gage
  state.rng = fresh.rng
  state.w = fresh.w
  state.h = fresh.h
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/sand-stroke/sandStroke.test.ts`
Expected: PASS (all groups).

Note: tests run under jsdom (the project's Vitest env). `ImageData` is available in jsdom; if a test reports `ImageData is not defined`, confirm `vitest.config` uses the `jsdom` environment (it does for the React tests) — the file inherits it.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/sand-stroke/sandStroke.ts src/diversions/sand-stroke/sandStroke.test.ts
git commit -m "sand-stroke: state, sweeps, deterministic stepping + live update/resize"
```

---

### Task 4: Diversion wiring + credit

**Files:**
- Create: `src/diversions/sand-stroke/index.ts`
- Modify: `README.md` (Credits / Inspiration line)

- [ ] **Step 1: Write the diversion contract**

```typescript
// src/diversions/sand-stroke/index.ts
// Sand Stroke — clean-room reimplementation of the algorithm from Jared
// Tarbell's "Sand Stroke" (complexification.net/gallery/machines/sandstroke/).
// Reproduced from the published algorithm; not a code port. Original © Jared Tarbell.
import type { Diversion } from '../../framework/types'
import { sandStrokeSchema, type SandStrokeConfig } from './schema'
import {
  createSandState, stepSand, updateSandState, resizeSandState, type SandState,
} from './sandStroke'

const sandStroke: Diversion<SandStrokeConfig, SandState, '2d'> = {
  id: 'sand-stroke',
  title: 'Sand Stroke',
  description: 'Grainy sand-painted colour ribbons that accrete across the canvas. '
    + 'After Jared Tarbell’s Sand Stroke (complexification.net).',
  kind: '2d',
  schema: sandStrokeSchema,

  setup(ctx, config, size) {
    // paint the ground once on the visible canvas so there's no first-frame flash
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createSandState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepSand(state, dt)
    // blit the accreting CSS-px buffer onto the DPR-scaled main context
    ctx.putImageData(state.img, 0, 0)
  },

  resize(state, size) {
    resizeSandState(state, size)
  },

  update(state, config, size) {
    return updateSandState(state, config, size)
  },
}

export default sandStroke
```

Note on the blit: the main 2D context is DPR-scaled with `setTransform(dpr,…)`, but `putImageData` ignores the transform and writes device pixels 1:1 — so a CSS-px `ImageData` only covers the top-left on HiDPI. To fill the whole canvas crisply, draw the buffer through an offscreen canvas with `drawImage` (which honours the transform). Replace the blit line accordingly:

- [ ] **Step 2: Use an offscreen canvas so the blit honours DPR**

Edit `frame` and `setup`/state to blit via `drawImage`. Final `index.ts` `setup`/`frame`:

```typescript
  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    const state = createSandState(config, size.width, size.height)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepSand(state, dt)
    const off = getOffscreen(state)
    off.ctx.putImageData(state.img, 0, 0)
    // drawImage honours the ctx transform → CSS-px buffer upscales to fill the canvas
    ctx.drawImage(off.canvas, 0, 0, state.w, state.h)
  },
```

Add this module-local offscreen cache above the diversion object (keyed off state size so it rebuilds on resize):

```typescript
const offscreens = new WeakMap<SandState, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number }>()
function getOffscreen(state: SandState) {
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
```

- [ ] **Step 3: Typecheck + run the full suite**

Run: `npx tsc --noEmit && npx vitest run src/diversions/sand-stroke/`
Expected: PASS, no type errors. The registry auto-discovers the new folder via `import.meta.glob` — no manual registration.

- [ ] **Step 4: Add the credit line to README**

In `README.md`, add (or extend) a "Credits / Inspiration" section near the bottom:

```markdown
## Credits / Inspiration

Several diversions reimplement algorithms pioneered by **Jared Tarbell**
([complexification.net](http://www.complexification.net/)) — e.g. _Sand Stroke_.
These are independent clean-room reimplementations of the published algorithms,
not ports of his source. Original work © Jared Tarbell.
```

- [ ] **Step 5: Commit**

```bash
git add src/diversions/sand-stroke/index.ts README.md
git commit -m "sand-stroke: wire diversion contract (offscreen blit) + credit Tarbell"
```

---

### Task 5: Full verification (tests, typecheck, build, lint)

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS — all prior tests plus the new sand-stroke tests; no regressions in `urlCodec`/`urlKeys`/`registry`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint (if configured)**

Run: `npm run lint`
Expected: clean (or pre-existing-only warnings).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds; sand-stroke is bundled.

- [ ] **Step 5: Commit (only if lint/build auto-fixes touched files)**

```bash
git add -A
git commit -m "sand-stroke: lint/build clean-up" || echo "nothing to commit"
```

---

### Task 6: Chrome visual verification (inline — needs dev server)

**Files:** none

- [ ] **Step 1: Start the dev server (background)**

Run: `npm run dev` (pinned to port 5180).

- [ ] **Step 2: Open the diversion in Chrome (chrome-devtools MCP, never the built-in preview)**

Hand the URL: `http://localhost:5180/diversion/d/sand-stroke/play?mute=1` (and the config screen `…/sand-stroke/config`). Confirm the deployed-vs-hash routing note in memory — use the path form, not a `#/` URL.

- [ ] **Step 3: Verify it looks faithful**

Watch for: wavy horizontal ribbons accreting on a white ground; density modulation (thin wave = dark/dense, tall wave = faint); grain texture (no hard edges); multiple lanes; colours from the palette. Tweak `strokes`, `bandHeight`, `waviness`, `density`, `opacity`, switch palette↔gradient, change `background` — confirm live updates apply (and structural ones re-setup cleanly). Toggle fullscreen — confirm resize rebuilds without crashing.

- [ ] **Step 4: Capture a screenshot** to `screenshots/` for the record, and note any visual issues to fix before review.

- [ ] **Step 5:** Fix any visual problems found (tuning-number changes to defaults require an explicit ask per repo rules — surface them rather than changing unilaterally), then re-verify.

---

### Task 7: Code review (required phase)

**Files:** none (review only)

- [ ] **Step 1: Dispatch the project reviewer**

Dispatch the `diversion-reviewer` subagent (fresh, no implementation bias) against the branch diff. Brief it: review the new Sand Stroke diversion against the 5 UX invariants, schema-as-single-source-of-truth, the URL-codec keystone (leaf-name uniqueness), and the black-box/contract rules.

- [ ] **Step 2: Triage findings** using `superpowers:receiving-code-review` — verify each before acting; push back on anything technically wrong.

- [ ] **Step 3: Apply accepted fixes** with tests; re-run `npx vitest run` + `npx tsc --noEmit`.

- [ ] **Step 4: Commit** any review fixes.

```bash
git add -A && git commit -m "sand-stroke: address review feedback"
```

- [ ] **Step 5: Hand off for user-verify before FF-merge** — surface the dev-server URL and what to look at; wait for explicit approval before merging to `main`.

---

## Self-Review (completed by plan author)

- **Spec coverage:** schema (T1) ✓; grain falloff / gain walk / tpoint blend / gradient / gage (T2) ✓; state, sweeps, deterministic stepping, respawn, live update vs structural, resize (T3) ✓; contract wiring, offscreen DPR-correct blit, never-clear accretion, credit header + README (T4) ✓; verification (T5), Chrome faithfulness (T6), required review (T7) ✓.
- **Determinism, palette/gradient, colorDrift, per-colour-alpha multiply, background-as-structural** — all covered by tasks/tests.
- **Type consistency:** `SandState`, `Sweep`, `RGBA`, `createSandState/stepSand/updateSandState/resizeSandState`, `gageFor`, `grainAlpha`, `stepGain`, `blendPixel`, `sampleGradientRGBA`, `MAX_GAIN`, `BASE_CROSS_SECONDS` used identically across tasks. `update(state, config, size)` matches the `Diversion.update?` signature.
- **Placeholders:** none — every code step has complete content.
- **Open tuning surfaced, not silently set:** default constants (`BASE_CROSS_SECONDS=8`, colorDrift/1000 mapping) are documented; any change to balance defaults during verify needs an explicit ask.
```
