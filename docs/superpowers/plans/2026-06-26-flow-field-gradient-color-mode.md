# Flow Field Gradient Color Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a continuous, source-driven **Gradient** color mode to Flow Field alongside the existing **Palette Set** mode, switched by a new `colorMode` control (#26; subsumes #25).

**Architecture:** Two pure helpers in `flowField.ts` — `sampleGradient(stops, t, wrap)` (rgba lerp across evenly-spaced stops, optional wrap for cyclic sources) and `colorSourceT(source, x, y, angle, w, h)` (maps a particle's color source to `t∈[0,1]`). A `colorMode` enum selects palette vs gradient stroke color in `stepFlow`. The schema gains `colorMode` + a `gradient` group, promotes `background` to top-level, and reduces `palette` to `colors[]`. Defaults keep today's look (default `colorMode: 'palette'`).

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest. Custom SchemaForm (`segmented`/`colorList`/`color`/`group` UIs already exist) + URL codec (enums, string arrays, nested→dotted flattening already supported — no codec code changes).

## Global Constraints

- **Stack/deps:** no new deps. One Zod schema is the single source of truth (form + codec + `Config` type); `.meta({...})` chains after `.default(...)`.
- **UX invariants (MUST):** readability; hide nothing (both `palette` and `gradient` groups stay visible & live regardless of mode — inert-mode controls say so in help, the Trail-length precedent); persistent inline help; sliders only when bounded (none added here); high contrast.
- **WIP diversion:** Flow Field unreleased — schema may reshape freely; no URL backward-compat (promoting `background` out of `palette` is fine).
- **Default look preserved:** default `colorMode: 'palette'` → today's exact Palette Set look. Gradient is opt-in.
- **Determinism preserved:** `createFlowState` RNG call order per particle is unchanged (x, y, age, life, ci) — `ci` is still assigned even in Gradient mode (unused there, but keeps determinism + instant mode-switch).
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Commit messages terse, one line, **no trailers**.
- **Verify:** `npx vitest run`, `npx tsc --noEmit`, `npm run build`. (A pre-existing `ZodTypeAny` deprecation *warning* in fieldMeta.ts/SchemaForm.tsx is expected — NOT an error; ignore it.)

---

### Task 1: Pure color helpers (`sampleGradient` + `colorSourceT`)

Self-contained, schema-independent math. TDD: tests first. These are exported from `flowField.ts` and consumed by Task 2.

**Files:**
- Modify: `src/diversions/flow-field/flowField.ts` (add `parseHex8` (internal), `sampleGradient`, `colorSourceT` after `toHex2`)
- Modify: `src/diversions/flow-field/flowField.test.ts` (add imports + two describes)

**Interfaces produced (exported from `flowField.ts`):**
- `sampleGradient(stops: string[], t: number, wrap: boolean): string` → an `rgba(r, g, b, a)` string (same format as `hexToRgba`).
- `colorSourceT(source: 'flow-angle'|'x'|'y', x: number, y: number, angle: number, w: number, h: number): number` → `t∈[0,1]`.

- [ ] **Step 1: Write the failing tests**

Replace the import line at the top of `src/diversions/flow-field/flowField.test.ts`:

```ts
import { createFlowState, hexToRgba, trailFadeAlpha, toHex2 } from './flowField'
```

with:

```ts
import {
  createFlowState, hexToRgba, trailFadeAlpha, toHex2, sampleGradient, colorSourceT,
} from './flowField'
```

Then append these describes to the end of the file:

```ts
describe('sampleGradient', () => {
  it('returns the first stop at t=0 and the last stop at t=1 (non-wrap)', () => {
    expect(sampleGradient(['#ff000080', '#0000ff80'], 0, false)).toBe('rgba(255, 0, 0, 0.502)')
    expect(sampleGradient(['#ff000080', '#0000ff80'], 1, false)).toBe('rgba(0, 0, 255, 0.502)')
  })
  it('linearly interpolates at the midpoint of two stops', () => {
    expect(sampleGradient(['#ff000080', '#0000ff80'], 0.5, false)).toBe('rgba(128, 0, 128, 0.502)')
  })
  it('locates the right segment among many evenly-spaced stops', () => {
    // 3 stops, non-wrap → 2 segments; t=0.5 lands exactly on the middle stop
    expect(sampleGradient(['#ff0000ff', '#00ff00ff', '#0000ffff'], 0.5, false)).toBe('rgba(0, 255, 0, 1)')
  })
  it('wraps the last stop back to the first when wrap=true', () => {
    const stops = ['#ff0000ff', '#00ff00ff', '#0000ffff'] // 3 stops, wrap → 3 segments
    // t=1 closes the loop back to stop0
    expect(sampleGradient(stops, 1, true)).toBe('rgba(255, 0, 0, 1)')
    // t=5/6 is the midpoint of the wrap segment (blue -> red)
    expect(sampleGradient(stops, 5 / 6, true)).toBe('rgba(128, 0, 128, 1)')
  })
  it('clamps t outside [0,1]', () => {
    expect(sampleGradient(['#ff000080', '#0000ff80'], -1, false)).toBe('rgba(255, 0, 0, 0.502)')
    expect(sampleGradient(['#ff000080', '#0000ff80'], 2, false)).toBe('rgba(0, 0, 255, 0.502)')
  })
})

describe('colorSourceT', () => {
  it('normalizes x and y position to [0,1] and clamps', () => {
    expect(colorSourceT('x', 400, 0, 0, 800, 600)).toBeCloseTo(0.5, 6)
    expect(colorSourceT('y', 0, 300, 0, 800, 600)).toBeCloseTo(0.5, 6)
    expect(colorSourceT('x', 1000, 0, 0, 800, 600)).toBe(1) // clamp over
    expect(colorSourceT('y', 0, -50, 0, 800, 600)).toBe(0) // clamp under
  })
  it('maps flow-angle into [0,1) cyclically', () => {
    expect(colorSourceT('flow-angle', 0, 0, 0, 800, 600)).toBeCloseTo(0, 6)
    expect(colorSourceT('flow-angle', 0, 0, Math.PI, 800, 600)).toBeCloseTo(0.5, 6)
    expect(colorSourceT('flow-angle', 0, 0, 2 * Math.PI, 800, 600)).toBeCloseTo(0, 6) // wraps to 0
    expect(colorSourceT('flow-angle', 0, 0, -Math.PI / 2, 800, 600)).toBeCloseTo(0.75, 6) // negative wraps
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/diversions/flow-field/flowField.test.ts`
Expected: FAIL — `sampleGradient` / `colorSourceT` are not exported.

- [ ] **Step 3: Implement the helpers**

In `src/diversions/flow-field/flowField.ts`, add immediately after the `toHex2` function (after line 30):

```ts
/** "#rrggbbaa" -> {r,g,b, a in 0..1}. */
function parseHex8(hex: string): { r: number; g: number; b: number; a: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: parseInt(hex.slice(7, 9), 16) / 255,
  }
}

/** Linear-interpolate rgba across evenly-spaced `stops` at t in [0,1].
 *  wrap=true treats the stops as cyclic (last blends back to first) — for the
 *  flow-angle source, which rolls over at 2π. Returns an rgba() string in the
 *  same format as hexToRgba. */
export function sampleGradient(stops: string[], t: number, wrap: boolean): string {
  const tc = Math.min(1, Math.max(0, t))
  const n = stops.length
  const fmt = (r: number, g: number, b: number, a: number) =>
    `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`
  if (n === 1) {
    const c = parseHex8(stops[0])
    return fmt(c.r, c.g, c.b, c.a)
  }
  const segments = wrap ? n : n - 1
  const scaled = tc * segments
  let i = Math.floor(scaled)
  if (i >= segments) i = segments - 1 // pull t===1 into the last segment
  const f = scaled - i
  const a = parseHex8(stops[i])
  const b = parseHex8(stops[wrap ? (i + 1) % n : i + 1])
  return fmt(
    Math.round(a.r + (b.r - a.r) * f),
    Math.round(a.g + (b.g - a.g) * f),
    Math.round(a.b + (b.b - a.b) * f),
    a.a + (b.a - a.a) * f,
  )
}

/** Map a particle's chosen color source to t in [0,1]. flow-angle is cyclic
 *  (pairs with sampleGradient wrap=true); x/y are clamped screen fractions. */
export function colorSourceT(
  source: 'flow-angle' | 'x' | 'y',
  x: number, y: number, angle: number, w: number, h: number,
): number {
  if (source === 'x') return Math.min(1, Math.max(0, x / w))
  if (source === 'y') return Math.min(1, Math.max(0, y / h))
  const tau = Math.PI * 2
  return (((angle % tau) + tau) % tau) / tau
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/diversions/flow-field/flowField.test.ts`
Expected: PASS — all `sampleGradient` + `colorSourceT` cases green (existing tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flow-field/flowField.ts src/diversions/flow-field/flowField.test.ts
git commit -m "Flow Field: gradient sampling + color-source helpers"
```

---

### Task 2: Schema reshape + wire the color-mode branch

Adds `colorMode` + the `gradient` group, promotes `background` to top-level, reduces `palette` to `colors[]`, and branches the stroke color in `stepFlow`. TDD: schema/codec tests first.

**Files:**
- Modify: `src/diversions/flow-field/schema.ts` (add `colorMode`, `gradient`; promote `background`; trim `palette`)
- Modify: `src/diversions/flow-field/flowField.ts` (`stepFlow` stroke branch; fade fill uses `cfg.background`)
- Modify: `src/diversions/flow-field/index.ts` (`setup` clear uses `config.background`)
- Modify: `src/diversions/flow-field/flowField.test.ts` (schema-default + codec round-trip tests)

**Interfaces consumed:** `sampleGradient` / `colorSourceT` from Task 1; `FlowFieldConfig.colorMode`, `.background`, `.gradient.{source,stops}`, `.palette.colors`.

- [ ] **Step 1: Write the failing tests**

Add this import near the top of `src/diversions/flow-field/flowField.test.ts` (below the existing `flowFieldSchema` import):

```ts
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
```

Append these describes to the end of the file:

```ts
describe('color-mode schema defaults', () => {
  it('defaults colorMode to palette (today\'s look preserved)', () => {
    expect(flowFieldSchema.parse({}).colorMode).toBe('palette')
  })
  it('promotes background to a top-level field (not under palette)', () => {
    const cfg = flowFieldSchema.parse({})
    expect(cfg.background).toBe('#0a0a12')
    expect('background' in cfg.palette).toBe(false)
  })
  it('defaults the gradient group: flow-angle source + >=2 evenly-spaced stops', () => {
    const cfg = flowFieldSchema.parse({})
    expect(cfg.gradient.source).toBe('flow-angle')
    expect(cfg.gradient.stops.length).toBeGreaterThanOrEqual(2)
    for (const s of cfg.gradient.stops) expect(s).toMatch(/^#[0-9a-fA-F]{8}$/)
  })
})

describe('color-mode codec round-trip', () => {
  it('round-trips colorMode, gradient source/stops, and top-level background', () => {
    const defaults = flowFieldSchema.parse({})
    const cfg = {
      ...defaults,
      colorMode: 'gradient' as const,
      background: '#101018',
      gradient: { source: 'x' as const, stops: ['#11223344', '#55667788', '#99aabbcc'] },
    }
    const sp = encodeConfig(flowFieldSchema, cfg)
    const back = decodeConfig(flowFieldSchema, sp)
    expect(back.colorMode).toBe('gradient')
    expect(back.background).toBe('#101018')
    expect(back.gradient.source).toBe('x')
    expect(back.gradient.stops).toEqual(['#11223344', '#55667788', '#99aabbcc'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/diversions/flow-field/flowField.test.ts`
Expected: FAIL — `colorMode` / `background` (top-level) / `gradient` undefined on the parsed config.

- [ ] **Step 3: Reshape the schema**

Replace the entire body of `src/diversions/flow-field/schema.ts` with:

```ts
import { z } from 'zod'

export const flowFieldSchema = z.object({
  particles: z.number().int().min(100).max(20000).default(4000)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles' }),
  noiseScale: z.number().min(0.0005).max(0.02).default(0.004)
    .meta({ ui: 'slider', min: 0.0005, max: 0.02, step: 0.0005, label: 'Noise scale',
            help: 'Lower = broad, sweeping currents. Higher = tight, turbulent detail.' }),
  speed: z.number().min(0).max(1).default(0.5)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Speed' }),
  lifespan: z.number().min(0.5).max(12).default(4)
    .meta({ ui: 'slider', min: 0.5, max: 12, step: 0.1, label: 'Particle lifespan',
            help: 'Seconds a particle lives before respawning elsewhere. Shorter = busier, '
                + 'fewer long streaks; longer = sparser, longer ribbons.' }),
  seed: z.number().int().default(10847)
    .meta({ ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always regenerates the same pattern.' }),
  blend: z.enum(['lighter', 'screen', 'normal']).default('screen')
    .meta({ ui: 'segmented', options: ['lighter', 'screen', 'normal'], label: 'Blend' }),
  colorMode: z.enum(['palette', 'gradient']).default('palette')
    .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Color mode',
            help: 'Palette: each particle keeps one random color from the list. '
                + 'Gradient: color is sampled along a source (direction or position).' }),
  fadeTrails: z.boolean().default(true)
    .meta({ ui: 'toggle', label: 'Motion trails',
            help: 'On: particles leave trails that fade out. Off: each frame is wiped clean.' }),
  trailLength: z.number().min(0).max(100).default(88)
    .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail length',
            help: 'Length of the fading motion trails. 0 wipes each frame; higher leaves '
                + 'longer, slower-fading ribbons. Only affects the look when Motion Trails is on.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a12')
    .meta({ ui: 'color', label: 'Background' }),
  palette: z.object({
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#1e63ff1f', '#16d6ff1a', '#ff3ea51a', '#ffffff14'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              help: 'Active in Palette mode. Each particle picks one color at random when it '
                  + 'spawns and keeps it for life. Low alpha lets overlapping ribbons build up '
                  + 'into richer color instead of clipping to white.' }),
  }).default({ colors: ['#1e63ff1f', '#16d6ff1a', '#ff3ea51a', '#ffffff14'] })
    .meta({ ui: 'group', label: 'Palette colors' }),
  gradient: z.object({
    source: z.enum(['flow-angle', 'x', 'y']).default('flow-angle')
      .meta({ ui: 'segmented', options: ['flow-angle', 'x', 'y'], label: 'Gradient source',
              help: 'What maps onto the gradient: flow-angle (particle direction — cyclic, '
                  + 'wraps), or x / y screen position.' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#ff3b3b22', '#ffd23b22', '#3bff7a22', '#3bd2ff22', '#6a3bff22'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              help: 'Active in Gradient mode. Colors are evenly spaced and sampled along the '
                  + 'source; per-stop alpha controls additive build-up.' }),
  }).default({ source: 'flow-angle', stops: ['#ff3b3b22', '#ffd23b22', '#3bff7a22', '#3bd2ff22', '#6a3bff22'] })
    .meta({ ui: 'group', label: 'Gradient' }),
})

export type FlowFieldConfig = z.infer<typeof flowFieldSchema>
```

- [ ] **Step 4: Wire the stroke-color branch + background in `flowField.ts`**

In `src/diversions/flow-field/flowField.ts`:

Change the fade fill in `stepFlow` (the line reading `ctx.fillStyle = \`${cfg.palette.background}${toHex2(fadeAlpha)}\``) to read from the promoted top-level field:

```ts
  ctx.fillStyle = `${cfg.background}${toHex2(fadeAlpha)}`
```

Then replace the stroke-style assignment in the per-particle loop. Change:

```ts
    // styles.length is >=1 (schema min); modulo keeps a stale index valid if the set shrank
    ctx.strokeStyle = styles[p.ci % styles.length]
```

to:

```ts
    // Palette mode: each particle's spawn color. Gradient mode: sample the gradient
    // at the particle's color-source position (flow-angle wraps; x/y clamp).
    ctx.strokeStyle = cfg.colorMode === 'gradient'
      ? sampleGradient(
          cfg.gradient.stops,
          colorSourceT(cfg.gradient.source, p.x, p.y, angle, w, h),
          cfg.gradient.source === 'flow-angle',
        )
      : styles[p.ci % styles.length]
```

(`createFlowState` is unchanged — `styles`/`ci` still come from `cfg.palette.colors`; `cfg.background` is not used there.)

- [ ] **Step 5: Point `index.ts` setup-clear at the promoted background**

In `src/diversions/flow-field/index.ts`, change line 14:

```ts
    c.fillStyle = config.palette.background
```

to:

```ts
    c.fillStyle = config.background
```

- [ ] **Step 6: Run tests + types + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS — all tests green (including determinism + the new schema/codec tests), `tsc` exits 0 (ignore the pre-existing `ZodTypeAny` deprecation *warning*), build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/diversions/flow-field/schema.ts src/diversions/flow-field/flowField.ts src/diversions/flow-field/index.ts src/diversions/flow-field/flowField.test.ts
git commit -m "Flow Field: Gradient color mode + colorMode selector (#26, subsumes #25)"
```

---

### Task 3: Chrome verification (manual)

A verification gate, not a code task. Confirm both modes and the controls in Chrome (project convention; chrome-devtools MCP, never a built-in preview). Dev server is pinned to port 5180.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open Flow Field config in Chrome**

URL: `http://localhost:5180/d/flow-field?mute=1`

- [ ] **Step 3: Verify default (Palette) mode unchanged**
  - **Color mode** segmented shows **`palette`** selected by default.
  - The animation looks exactly like today's default (colored ribbons, no white-out, `screen` blend).
  - **Background** is its own top-level control; **Palette colors** group has the 4-color list; **Gradient** group (source + stops) is visible but inert in this mode (help says "Active in Gradient mode").

- [ ] **Step 4: Verify Gradient mode**
  - Flip **Color mode** → `gradient`. Strokes immediately take the default red→yellow→green→cyan→blue stops.
  - With **Gradient source** = `flow-angle`: colors trace particle direction — rotating bands of hue around vortices, **with no hard seam** at the angle rollover (the wrap).
  - Switch **Gradient source** → `x` then `y`: color becomes a smooth left→right (then top→bottom) sweep across the canvas.
  - Edit **Gradient stops**: add/remove a stop and lower a stop's alpha — the gradient updates and low alpha softens the additive build-up.
  - Change **Background** — confirm the canvas fade/clear uses the new color in both modes.

- [ ] **Step 5: Verify the share link (codec round-trip)**
  - Set colorMode=gradient, a non-default source, edited stops, and a changed background; copy the URL; open in a fresh tab — the same look loads (mode + source + stops + background all round-trip).

## Self-Review

**Spec coverage:**
- `colorMode` selector (palette|gradient, default palette) → Task 2 Step 3 + test. ✅
- Gradient mode: evenly-spaced multi-stop list sampled along a source → Task 1 (`sampleGradient`) + Task 2 stroke branch. ✅
- Color sources flow-angle/x/y, default flow-angle → Task 1 (`colorSourceT`) + schema enum (Task 2). ✅
- Cyclic wrap for flow-angle, clamp for x/y → Task 1 `sampleGradient(wrap)` + `colorSourceT` + tests. ✅
- `background` promoted to top-level; `palette` reduced to `colors[]` → Task 2 Step 3 + index.ts (Step 5) + fade fill (Step 4) + test. ✅
- Per-stop alpha retained → `#rrggbbaa` stops + `parseHex8` alpha lerp (Task 1). ✅
- Default look preserved (palette default) → Task 2 default + test. ✅
- Determinism (RNG order unchanged) → `createFlowState` untouched; noted in constraints. ✅
- Codec round-trip for new fields → Task 2 Step 1 round-trip test (no codec code change). ✅
- UX invariants (inert-but-visible groups, help, no unbounded sliders) → schema meta + Chrome verify. ✅
- #24 framework engine out of scope; positioned stops out of scope → nothing implemented (correct). ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code, every default is a literal. ✅

**Type consistency:** `sampleGradient(stops: string[], t: number, wrap: boolean)` and `colorSourceT(source, x, y, angle, w, h)` signatures match their test calls and the `stepFlow` usage; schema field names `colorMode`/`background`/`gradient.source`/`gradient.stops`/`palette.colors` match `cfg.*` reads in `flowField.ts` and `config.background` in `index.ts`. ✅
