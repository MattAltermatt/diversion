# Strange Attractors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `strange-attractors` 2D diversion (#30) that plots a long chaotic orbit of a self-bounding iterated map (Clifford / de Jong / Hopalong) as accumulated point-density, with always-on sinusoidal drift, reusing Flow Field's buildup/trail rendering idiom.

**Architecture:** A pure math core (`attractors.ts`: three map kernels, rejection-sampled seed→coefficients, sinusoidal drift, color-t + screen-scale helpers) drives a thin diversion contract (`index.ts`) that keeps one persistent orbit and paints `pointsPerFrame` dots per frame onto a fade-decayed canvas accumulator. One Zod schema (`schema.ts`) is the single source of truth; two preset axes (`presets.ts`).

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + Vitest. Framework helpers: `mulberry32` (`framework/rng`), `hexToRgba` / `trailFadeAlpha` / `toHex2` / `sampleGradient` (`framework/gradient`).

**Reference files to read first:** `src/diversions/flow-field/{index,flowField,schema,presets}.ts` (the idiom this mirrors), `src/framework/types.ts` (`defineDiversion`, `PresetGroup`), `CLAUDE.md` (architecture + 5 UX invariants).

---

## File Structure

- `src/diversions/strange-attractors/attractors.ts` — **pure math core.** Map kernels, validity gate, rejection sampler, drift, color-t, screen scale. No canvas, no React. Heavily unit-tested.
- `src/diversions/strange-attractors/attractors.test.ts` — unit tests for the core.
- `src/diversions/strange-attractors/schema.ts` — Zod schema + `AttractorConfig` type. Single source of truth for form + URL codec + config type.
- `src/diversions/strange-attractors/index.ts` — diversion contract (`setup`/`frame`/`resize`/`update`) + render loop. Auto-discovered by the registry glob.
- `src/diversions/strange-attractors/presets.ts` — Attractor + Color preset groups.
- `src/diversions/strange-attractors/presets.test.ts` — presets are valid partials of the schema.

---

## Task 1: Pure math core (`attractors.ts`)

The foundational task — locks the module shape, types, and test idioms the rest builds on.

**Files:**
- Create: `src/diversions/strange-attractors/attractors.ts`
- Test: `src/diversions/strange-attractors/attractors.test.ts`

- [ ] **Step 1: Write failing tests for the kernels + helpers**

Create `src/diversions/strange-attractors/attractors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  MAPS, FALLBACK, isValidOrbit, sampleCoeffs, driftedCoeffs,
  attractorColorT, screenScale, type Coeffs, type AttractorKind,
} from './attractors'

const KINDS: AttractorKind[] = ['clifford', 'deJong', 'hopalong']

describe('map kernels', () => {
  it('are deterministic — same input, same output', () => {
    const c: Coeffs = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 }
    for (const k of KINDS) {
      const a = MAPS[k](0.1, 0.2, c)
      const b = MAPS[k](0.1, 0.2, c)
      expect(a).toEqual(b)
    }
  })

  it('clifford matches its closed form', () => {
    const c: Coeffs = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 }
    const r = MAPS.clifford(0.3, 0.5, c)
    expect(r.x).toBeCloseTo(Math.sin(c.a * 0.5) + c.c * Math.cos(c.a * 0.3), 12)
    expect(r.y).toBeCloseTo(Math.sin(c.b * 0.3) + c.d * Math.cos(c.b * 0.5), 12)
  })

  it('keeps a fallback orbit finite and bounded for 2000 steps', () => {
    for (const k of KINDS) {
      let { x, y } = { x: 0.1, y: 0.1 }
      for (let i = 0; i < 2000; i++) {
        const n = MAPS[k](x, y, FALLBACK[k]); x = n.x; y = n.y
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
      }
    }
  })
})

describe('isValidOrbit', () => {
  it('accepts every fallback coefficient set', () => {
    for (const k of KINDS) expect(isValidOrbit(k, FALLBACK[k])).toBe(true)
  })

  it('rejects a collapsed orbit (coeffs that decay to a point)', () => {
    // a=b=c=d=0: clifford → (1, 1) fixed point after one step → zero spread
    expect(isValidOrbit('clifford', { a: 0, b: 0, c: 0, d: 0 })).toBe(false)
  })

  it('rejects a divergent hopalong orbit', () => {
    // huge b drives sqrt term to blow past the magnitude guard
    expect(isValidOrbit('hopalong', { a: 1e6, b: 1e6, c: 0, d: 0 })).toBe(false)
  })
})

describe('sampleCoeffs', () => {
  it('is deterministic per seed', () => {
    expect(sampleCoeffs('clifford', 12345)).toEqual(sampleCoeffs('clifford', 12345))
  })

  it('always returns a valid orbit (gate or fallback)', () => {
    for (const k of KINDS) {
      for (const seed of [1, 2, 7, 42, 99, 1000]) {
        expect(isValidOrbit(k, sampleCoeffs(k, seed))).toBe(true)
      }
    }
  })
})

describe('driftedCoeffs', () => {
  it('drift=0 is frozen (equals base for any t)', () => {
    const base: Coeffs = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 }
    expect(driftedCoeffs(base, 0, 0)).toEqual(base)
    expect(driftedCoeffs(base, 999999, 0)).toEqual(base)
  })

  it('stays within driftAmp of base for all t', () => {
    const base: Coeffs = { a: 0, b: 0, c: 0, d: 0 }
    const amp = 0.18 // == DRIFT_AMP_MAX * drift(1)
    for (let t = 0; t < 200000; t += 137) {
      const d = driftedCoeffs(base, t, 1)
      for (const k of ['a', 'b', 'c', 'd'] as const) {
        expect(Math.abs(d[k])).toBeLessThanOrEqual(amp + 1e-9)
      }
    }
  })
})

describe('attractorColorT', () => {
  it('radius is 0 at center, 1 at the corner-clamped edge', () => {
    expect(attractorColorT('radius', 50, 50, 50, 50, 50, 100, 100)).toBeCloseTo(0, 6)
    expect(attractorColorT('radius', 100, 50, 50, 50, 50, 100, 100)).toBeCloseTo(1, 6)
  })

  it('x / y sources are clamped screen fractions', () => {
    expect(attractorColorT('x', 25, 0, 50, 50, 50, 100, 100)).toBeCloseTo(0.25, 6)
    expect(attractorColorT('y', 0, 80, 50, 50, 50, 100, 100)).toBeCloseTo(0.8, 6)
    expect(attractorColorT('x', 999, 0, 50, 50, 50, 100, 100)).toBe(1) // clamp high
  })
})

describe('screenScale', () => {
  it('maps each kind to a positive pixels-per-world-unit scale', () => {
    for (const k of KINDS) expect(screenScale(k, 800, 600)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/diversions/strange-attractors/attractors.test.ts`
Expected: FAIL — `Failed to resolve import './attractors'`.

- [ ] **Step 3: Implement the core**

Create `src/diversions/strange-attractors/attractors.ts`:

```typescript
import { mulberry32 } from '../../framework/rng'

export type AttractorKind = 'clifford' | 'deJong' | 'hopalong'
export interface Coeffs { a: number; b: number; c: number; d: number }

type StepFn = (x: number, y: number, c: Coeffs) => { x: number; y: number }

// The three self-bounding-ish iterated maps. Clifford & de Jong are sin/cos
// self-bounding by construction; Hopalong (Barry Martin) is not, so it leans on
// the magnitude guard in isValidOrbit + the live skip in the render loop.
export const MAPS: Record<AttractorKind, StepFn> = {
  clifford: (x, y, c) => ({
    x: Math.sin(c.a * y) + c.c * Math.cos(c.a * x),
    y: Math.sin(c.b * x) + c.d * Math.cos(c.b * y),
  }),
  deJong: (x, y, c) => ({
    x: Math.sin(c.a * y) - Math.cos(c.b * x),
    y: Math.sin(c.c * x) - Math.cos(c.d * y),
  }),
  hopalong: (x, y, c) => ({
    x: y - Math.sign(x) * Math.sqrt(Math.abs(c.b * x - c.c)),
    y: c.a - x,
  }),
}

// Curated known-good coefficient sets — the guaranteed fallback when rejection
// sampling exhausts its tries, and the starting point for hand-tuned presets.
// (Hopalong ignores d.) Values Chrome-verified in Task 5.
export const FALLBACK: Record<AttractorKind, Coeffs> = {
  clifford: { a: -1.4, b: 1.6, c: 1.0, d: 0.7 },
  deJong: { a: 1.4, b: -2.3, c: 2.4, d: -2.1 },
  hopalong: { a: -2, b: -0.33, c: 0.01, d: 0 },
}

const MAG_GUARD = 1e4 // Hopalong divergence ceiling

/** Integrate ~500 points; reject non-finite / over-magnitude / collapsed orbits. */
export function isValidOrbit(kind: AttractorKind, c: Coeffs): boolean {
  const step = MAPS[kind]
  let x = 0.1, y = 0.1
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < 500; i++) {
    const n = step(x, y, c); x = n.x; y = n.y
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    if (Math.abs(x) > MAG_GUARD || Math.abs(y) > MAG_GUARD) return false
    if (i > 50) { // skip the transient before measuring spread
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  const spread = (maxX - minX) + (maxY - minY)
  return spread > 0.4 // below this it collapsed to a point / short limit cycle
}

/** seed → first valid coefficient set (cap 40 tries → curated fallback). */
export function sampleCoeffs(kind: AttractorKind, seed: number): Coeffs {
  const rng = mulberry32(seed >>> 0)
  const draw = () => rng() * 6 - 3 // [-3, 3]
  for (let i = 0; i < 40; i++) {
    const c: Coeffs = { a: draw(), b: draw(), c: draw(), d: draw() }
    if (isValidOrbit(kind, c)) return c
  }
  return { ...FALLBACK[kind] }
}

const DRIFT_RATE = 0.00018 // base angular rate (rad/ms) at drift=1 — slow, zen
const DRIFT_AMP_MAX = 0.18 // max coeff wobble in world units at drift=1
const FREQS = [1.0, 1.31, 1.73, 2.11] as const // incommensurate → quasi-periodic

/** Sinusoidal wobble around base. drift=0 → base unchanged (frozen). Bounded by
 *  DRIFT_AMP_MAX·drift for every t, so it never trips the validity gate. */
export function driftedCoeffs(base: Coeffs, t: number, drift: number): Coeffs {
  if (drift === 0) return base
  const amp = DRIFT_AMP_MAX * drift
  const w = t * DRIFT_RATE
  return {
    a: base.a + amp * Math.sin(w * FREQS[0]),
    b: base.b + amp * Math.sin(w * FREQS[1]),
    c: base.c + amp * Math.sin(w * FREQS[2]),
    d: base.d + amp * Math.sin(w * FREQS[3]),
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Map a plotted point's screen position to t in [0,1] for color. */
export function attractorColorT(
  source: 'radius' | 'x' | 'y',
  sx: number, sy: number, cx: number, cy: number, maxR: number, w: number, h: number,
): number {
  if (source === 'x') return clamp01(sx / w)
  if (source === 'y') return clamp01(sy / h)
  return clamp01(Math.hypot(sx - cx, sy - cy) / maxR)
}

// Per-map world half-extent (Hopalong spans much wider than the sin/cos maps).
const WORLD_RADIUS: Record<AttractorKind, number> = {
  clifford: 2.8, deJong: 2.6, hopalong: 18,
}
/** Pixels per world unit: fit the map's nominal extent into 90% of min dimension.
 *  Fixed (not auto-fit) so there's no jittery breathing zoom. */
export function screenScale(kind: AttractorKind, w: number, h: number): number {
  const minDim = Math.min(w, h)
  return (minDim * 0.45) / WORLD_RADIUS[kind]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/diversions/strange-attractors/attractors.test.ts`
Expected: PASS (all describe blocks green). If `rejects a collapsed orbit` fails, the spread threshold needs nudging — but `a=b=c=d=0` gives clifford a `(1,1)` fixed point (zero spread), so it should pass cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/strange-attractors/attractors.ts src/diversions/strange-attractors/attractors.test.ts
git commit -m "strange-attractors: pure math core (kernels, sampler, drift)"
```

---

## Task 2: Schema (`schema.ts`)

**Files:**
- Create: `src/diversions/strange-attractors/schema.ts`
- Test: covered by the framework's codec/registry tests (Task 5) — no per-field test here.

- [ ] **Step 1: Write the schema**

Create `src/diversions/strange-attractors/schema.ts` (mirrors `flow-field/schema.ts`; note `blend` defaults to `lighter` = additive, which density accumulation needs, and the color group's `source` enum is `radius | x | y`):

```typescript
import { z } from 'zod'

export const strangeAttractorsSchema = z.object({
  attractor: z.enum(['clifford', 'deJong', 'hopalong']).default('clifford')
    .meta({ section: 'Attractor', ui: 'segmented', options: ['clifford', 'deJong', 'hopalong'],
            label: 'Attractor',
            help: 'Which chaotic map is plotted. Each has its own family of shapes; '
                + 'changing it draws a fresh seed of that map.' }),
  pointsPerFrame: z.number().int().min(1000).max(50000).default(20000)
    .meta({ section: 'Attractor', ui: 'slider', min: 1000, max: 50000, step: 1000,
            label: 'Points per frame',
            help: 'How many points are plotted each frame. Higher = the cloud fills in '
                + 'faster and denser.' }),
  drift: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Attractor', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Drift',
            help: 'Slowly morphs the attractor over time so it never sits still. 0 = frozen.' }),
  fadeTrails: z.boolean().default(true)
    .meta({ section: 'Trails', ui: 'toggle', label: 'Fade trails',
            help: 'On: old density slowly fades, so the morphing cloud leaves a soft wake. '
                + 'Off: each frame is wiped clean.' }),
  trailLength: z.number().min(0).max(100).default(72)
    .meta({ section: 'Trails', ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail length',
            help: 'How long density lingers before fading. Higher = fuller, slower-fading '
                + 'cloud. Only matters when Fade trails is on.' }),
  blend: z.enum(['lighter', 'screen', 'normal']).default('lighter')
    .meta({ section: 'Trails', ui: 'segmented', options: ['lighter', 'screen', 'normal'],
            label: 'Blend',
            help: 'How overlapping points combine:\n'
                + '- lighter (default): additive — dense filaments glow brighter\n'
                + '- screen: glows and mixes; dense areas wash toward white\n'
                + '- normal: each point’s flat color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#050810')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Density fades toward this colour.' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('gradient')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Mode',
              help: 'Palette: color is banded by position. Gradient: smooth ramp sampled '
                  + 'along the source.' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Color bands by position (low alpha lets density build up additively).' }),
    source: z.enum(['radius', 'x', 'y']).default('radius')
      .meta({ ui: 'segmented', options: ['radius', 'x', 'y'], label: 'Color source',
              help: 'What position drives the color: radius (distance from center — reads '
                  + 'beautifully on a centered cloud), or x / y screen position.' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#3b1a6a66', '#7a3bff66', '#3bd2ff66', '#3bff7a66', '#ffe08a66'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Colors are evenly spaced and sampled along the source; per-stop alpha '
                  + 'controls additive build-up.' }),
  }).default({
    mode: 'gradient',
    colors: ['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66'],
    source: 'radius',
    stops: ['#3b1a6a66', '#7a3bff66', '#3bd2ff66', '#3bff7a66', '#ffe08a66'],
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
  seed: z.number().int().default(7),
})

export type StrangeAttractorsConfig = z.infer<typeof strangeAttractorsSchema>
```

Note the `seed` field has no `.meta()` section yet — add it in the next step (kept separate so the diff reads cleanly).

- [ ] **Step 2: Give `seed` its Advanced-section meta**

Edit the `seed` line to:

```typescript
  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always regenerates the same attractor. '
                + 'Change it to discover a new one.' }),
```

- [ ] **Step 3: Typecheck the schema compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). This confirms the schema + inferred type are well-formed before `index.ts` consumes them.

- [ ] **Step 4: Commit**

```bash
git add src/diversions/strange-attractors/schema.ts
git commit -m "strange-attractors: schema (single source of truth)"
```

---

## Task 3: Diversion contract + render loop (`index.ts`)

**Files:**
- Create: `src/diversions/strange-attractors/index.ts`

- [ ] **Step 1: Implement the diversion**

Create `src/diversions/strange-attractors/index.ts`:

```typescript
import { defineDiversion } from '../../framework/types'
import { hexToRgba, trailFadeAlpha, toHex2, sampleGradient } from '../../framework/gradient'
import { strangeAttractorsSchema, type StrangeAttractorsConfig } from './schema'
import {
  MAPS, sampleCoeffs, driftedCoeffs, attractorColorT, screenScale, type Coeffs,
} from './attractors'

interface AttractorState {
  cfg: StrangeAttractorsConfig
  base: Coeffs      // sampled from (attractor, seed) — drift wobbles around this
  x: number         // persistent orbit position (world space)
  y: number
  styles: string[]  // precomputed rgba() per palette color
  w: number
  h: number
}

const POINT_ALPHA = 0.16 // per-point additive opacity — low, so density builds up

function makeState(cfg: StrangeAttractorsConfig, w: number, h: number): AttractorState {
  return {
    cfg,
    base: sampleCoeffs(cfg.attractor, cfg.seed),
    x: 0.1,
    y: 0.1,
    styles: cfg.color.colors.map(hexToRgba),
    w,
    h,
  }
}

const strangeAttractors = defineDiversion<typeof strangeAttractorsSchema, AttractorState, '2d'>({
  id: 'strange-attractors',
  title: 'Strange Attractors',
  description: 'Chaotic iterated maps painting gossamer density clouds.',
  kind: '2d',
  schema: strangeAttractorsSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return makeState(config, size.width, size.height)
  },

  frame(state, ctx, t, _dt) {
    const { cfg, w, h } = state

    // 1. fade for trails (low-alpha bg fill) or hard-clear
    ctx.globalCompositeOperation = 'source-over'
    const fadeAlpha = cfg.fadeTrails ? trailFadeAlpha(cfg.trailLength) : 1
    ctx.globalAlpha = 1
    ctx.fillStyle = `${cfg.background}${toHex2(fadeAlpha)}`
    ctx.fillRect(0, 0, w, h)

    // 2. drifted coefficients for this instant
    const c = driftedCoeffs(state.base, t, cfg.drift)

    // 3. plot pointsPerFrame additive dots
    ctx.globalCompositeOperation = (
      cfg.blend === 'normal' ? 'source-over' : cfg.blend
    ) as GlobalCompositeOperation
    ctx.globalAlpha = POINT_ALPHA
    const scale = screenScale(cfg.attractor, w, h)
    const cx = w / 2, cy = h / 2
    const maxR = Math.min(w, h) / 2
    const size = 1 // dot size in px; round to keep it crisp
    const step = MAPS[cfg.attractor]
    const n = state.styles.length
    let { x, y } = state
    for (let i = 0; i < cfg.pointsPerFrame; i++) {
      const next = step(x, y, c); x = next.x; y = next.y
      if (!Number.isFinite(x) || !Number.isFinite(y)) { x = 0.1; y = 0.1; continue }
      const sx = cx + x * scale
      const sy = cy + y * scale
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue // off-screen, skip draw
      const tCol = attractorColorT(cfg.color.source, sx, sy, cx, cy, maxR, w, h)
      ctx.fillStyle = cfg.color.mode === 'gradient'
        ? sampleGradient(cfg.color.stops, tCol, false)
        : state.styles[Math.min(n - 1, Math.floor(tCol * n))]
      ctx.fillRect(sx, sy, size, size)
    }
    state.x = x
    state.y = y
    ctx.globalAlpha = 1
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    // Resizing the canvas wipes the backing store; repaint bg so it doesn't flash.
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    // Structural changes need a fresh orbit / fresh coefficients.
    if (config.attractor !== state.cfg.attractor || config.seed !== state.cfg.seed) return false
    state.cfg = config
    state.styles = config.color.colors.map(hexToRgba)
    return true
  },
})

export default strangeAttractors
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Confirms the contract satisfies `Diversion<Config, State, '2d'>` (state + `CanvasRenderingContext2D` threaded with no casts).

- [ ] **Step 3: Run the full suite (registry auto-discovers the new folder)**

Run: `npx vitest run`
Expected: PASS. The registry glob picks up the new `index.ts`; codec/registry tests now exercise the new schema. If `urlKeys.test.ts` fails on a leaf-name collision, it will name the colliding key — note it for Task 5 (none expected: `attractor`, `pointsPerFrame`, `drift` are unique; `colors`/`stops`/`source`/`mode`/`blend`/`background`/`seed`/`trailLength`/`fadeTrails` already collide-resolve via the dotted-path fallback the codec guards).

- [ ] **Step 4: Commit**

```bash
git add src/diversions/strange-attractors/index.ts
git commit -m "strange-attractors: diversion contract + density render loop"
```

---

## Task 4: Presets (`presets.ts`)

**Files:**
- Create: `src/diversions/strange-attractors/presets.ts`
- Create: `src/diversions/strange-attractors/presets.test.ts`
- Modify: `src/diversions/strange-attractors/index.ts` (wire `presets`)

- [ ] **Step 1: Write a failing test that presets are valid schema partials**

Create `src/diversions/strange-attractors/presets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { attractorPresets, colorPresets } from './presets'
import { strangeAttractorsSchema } from './schema'

describe('strange-attractors presets', () => {
  it('every attractor preset patch is a valid partial config', () => {
    const full = strangeAttractorsSchema.parse({})
    for (const p of attractorPresets) {
      expect(() => strangeAttractorsSchema.parse({ ...full, ...p.patch })).not.toThrow()
      expect(['clifford', 'deJong', 'hopalong']).toContain(p.patch.attractor)
    }
  })

  it('every color preset patch is a valid partial config', () => {
    const full = strangeAttractorsSchema.parse({})
    for (const p of colorPresets) {
      expect(() => strangeAttractorsSchema.parse({
        ...full, background: p.background, blend: p.blend, color: p.color,
      })).not.toThrow()
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/diversions/strange-attractors/presets.test.ts`
Expected: FAIL — `Failed to resolve import './presets'`.

- [ ] **Step 3: Implement presets**

Create `src/diversions/strange-attractors/presets.ts`. Each attractor preset sets the map + a `seed` that lands on a beautiful orbit (seeds Chrome-validated in Task 5 — adjust there if one is dull):

```typescript
import type { StrangeAttractorsConfig } from './schema'

export type AttractorPreset = {
  name: string
  patch: Pick<StrangeAttractorsConfig, 'attractor' | 'seed'>
}

// One signature seed per map. The seed drives rejection-sampled coefficients,
// so these are "known-beautiful discoveries" rather than raw coefficient sets.
export const attractorPresets: AttractorPreset[] = [
  { name: 'Clifford', patch: { attractor: 'clifford', seed: 7 } },
  { name: 'de Jong', patch: { attractor: 'deJong', seed: 7 } },
  { name: 'Hopalong', patch: { attractor: 'hopalong', seed: 7 } },
]

export type ColorPreset = {
  name: string
  background: StrangeAttractorsConfig['background']
  blend: StrangeAttractorsConfig['blend']
  color: StrangeAttractorsConfig['color']
}

export const colorPresets: ColorPreset[] = [
  {
    name: 'Nebula',
    background: '#050810',
    blend: 'lighter',
    color: {
      mode: 'gradient', source: 'radius',
      colors: ['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66'],
      stops: ['#3b1a6a66', '#7a3bff66', '#3bd2ff66', '#3bff7a66', '#ffe08a66'],
    },
  },
  {
    name: 'Ember',
    background: '#0a0503',
    blend: 'lighter',
    color: {
      mode: 'gradient', source: 'radius',
      colors: ['#ff3b1a66', '#ff8a3b66', '#ffd23b66', '#fff0a866'],
      stops: ['#3b0a0266', '#ff3b1a55', '#ffae3b55', '#ffe7a855'],
    },
  },
  {
    name: 'Mono',
    background: '#000000',
    blend: 'lighter',
    color: {
      mode: 'gradient', source: 'radius',
      colors: ['#ffffff33', '#ffffff66'],
      stops: ['#11224455', '#88aaffaa', '#ffffffcc'],
    },
  },
]
```

- [ ] **Step 4: Run the presets test to verify it passes**

Run: `npx vitest run src/diversions/strange-attractors/presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire presets into the diversion**

In `src/diversions/strange-attractors/index.ts`, add the import near the others:

```typescript
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { attractorPresets, colorPresets } from './presets'
```

Add this `presets` array just above `const strangeAttractors = defineDiversion(...)`:

```typescript
// Two independent preset axes (mirrors Flow Field). The Attractor axis sets the
// map + a signature seed; the Color axis patches background + blend + the whole
// color group. Seed stays independent of Color so the 🎲 dice still surprises.
const presets: PresetGroup<StrangeAttractorsConfig>[] = [
  { label: 'Attractor', options: attractorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  {
    label: 'Color',
    options: colorPresets.map((p) => ({
      name: p.name,
      patch: { background: p.background, blend: p.blend, color: p.color },
    })),
  },
]
```

Then add `presets,` as the final property of the `defineDiversion({ ... })` object (after `update`).

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (both).

- [ ] **Step 7: Commit**

```bash
git add src/diversions/strange-attractors/presets.ts src/diversions/strange-attractors/presets.test.ts src/diversions/strange-attractors/index.ts
git commit -m "strange-attractors: Attractor + Color preset axes"
```

---

## Task 5: Verify — full gate + Chrome

**Files:** none (verification + any tuning nudges only).

- [ ] **Step 1: Full verification gate**

Run each as a discrete command:
- `npx tsc --noEmit` → no errors
- `npx vitest run` → all green (including framework codec/registry/urlKeys covering the new schema)
- `npm run lint` → clean

- [ ] **Step 2: Start the dev server (port 5180, pinned)**

Run (background): `npm run dev`
The diversion auto-registers; its play URL is `http://localhost:5180/d/strange-attractors/play` and config at `http://localhost:5180/d/strange-attractors`.

- [ ] **Step 3: Chrome verify (chrome-devtools MCP — never a built-in preview)**

Open `http://localhost:5180/d/strange-attractors/play?mute=1` and confirm against the 5 UX invariants + visual quality:
- The cloud renders as a filamentary attractor (not a blob, not empty), builds up over ~1–2s, and **visibly morphs** under default drift (0.15) — watch ~20s.
- Switch the **Attractor** preset through Clifford / de Jong / Hopalong: each draws a distinct, non-degenerate shape. If any default seed (7) looks dull or sparse, try a few seeds and update that preset's `seed` in `presets.ts` (this is preset curation, not gameplay tuning — fine to change).
- Switch **Color** presets (Nebula / Ember / Mono) and toggle `mode` palette↔gradient: color responds, radial ramp reads.
- Confirm `drift = 0` freezes the cloud; raising `pointsPerFrame` thickens it; `fadeTrails` off hard-clears each frame.
- Hopalong specifically: confirm it stays on-screen (the per-map `WORLD_RADIUS` 18 is a guess — if it's tiny or clipped, adjust `WORLD_RADIUS.hopalong` in `attractors.ts` and re-verify).
- Read a live value back via `evaluate_script` if a control's effect is ambiguous.

- [ ] **Step 4: Commit any tuning nudges**

If preset seeds or `WORLD_RADIUS` were adjusted:

```bash
git add src/diversions/strange-attractors/
git commit -m "strange-attractors: tune preset seeds + hopalong scale from Chrome verify"
```

- [ ] **Step 5: Docs — add to README diversion list**

Check `README.md` for the diversion gallery list; if present, add a Strange Attractors entry matching the existing format. Commit:

```bash
git add README.md
git commit -m "docs: list Strange Attractors in README"
```

- [ ] **Step 6: Code review (required phase)**

Dispatch the `diversion-reviewer` agent (fresh, no implementation bias) against the branch diff: the 5 UX invariants, schema-as-single-source-of-truth, codec keystone, the black-box rule. Address findings, then hand off for user-verify-before-FF-merge.

---

## Self-Review (plan author check)

- **Spec coverage:** §2 kernels → Task 1. §3 rejection sampler → Task 1. §4 drift → Task 1. §5 render loop → Task 3. §6 color unification → Task 1 (`attractorColorT`) + Task 3 (application). §7 update split → Task 3. §8 schema (incl. `blend: lighter`, dropped raw coeffs) → Task 2. §9 presets → Task 4. §10 testing → Tasks 1/4 + framework (Task 5). §11 effort M → matches 5 coarse tasks. All covered.
- **Placeholder scan:** no TBD/TODO; every code step shows full code; tuning placeholders (preset seeds, `WORLD_RADIUS.hopalong`) are explicit Chrome-verify nudges, not unfilled blanks.
- **Type consistency:** `Coeffs`, `AttractorKind`, `MAPS`, `FALLBACK`, `isValidOrbit`, `sampleCoeffs`, `driftedCoeffs`, `attractorColorT`, `screenScale` defined in Task 1 and consumed with matching signatures in Task 3. `StrangeAttractorsConfig` defined Task 2, used Tasks 3/4. `strangeAttractorsSchema` name consistent throughout. Color group `source` enum (`radius|x|y`) consistent schema↔`attractorColorT`. `blend` values (`lighter|screen|normal`) consistent schema↔render loop.
