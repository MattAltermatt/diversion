# Diversion Framework + Flow Field (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React framework that hosts independent generative-art "diversions" behind one contract (config screen + URL-driven animation screen), proven end-to-end with a Flow Field reference diversion.

**Architecture:** A shared framework owns the chrome — routing, a schema-driven config form, a config⇆URL codec, and an animation host that drives the rAF loop. Each diversion is a black-box module exposing a Zod schema + `setup/frame/resize/teardown` lifecycle, drawing into a 2D or WebGL context. v1 ships the framework + one diversion (Flow Field, 2D canvas).

**Tech Stack:** Vite + React 19 + TypeScript, Zod 4 (schema → form + URL + types), nuqs (reactive URL state on config screen), React Router (3 routes), Vitest. Custom `SchemaForm` (no generator dep) and custom URL codec. Design ethos: high-contrast dark "Instrument", with five UX invariants (readability · hide-nothing · inline-help · sliders-only-if-bounded · high-contrast).

**Spec:** `docs/superpowers/specs/2026-06-26-diversion-framework-design.md`

---

## File structure

```text
src/
  framework/
    types.ts            // Diversion<C>, RenderContext, Size, FieldMeta, DiversionState
    registry.ts         // discover + lazy-load diversions (Vite glob)
    urlCodec.ts         // encode/decode config ⇆ URLSearchParams (KEYSTONE, fully tested)
    fieldMeta.ts        // read a Zod field's UI meta safely (public API only)
    AnimationHost.tsx   // owns rAF loop, canvas, pause, visibility-pause, fps, fullscreen
    useAnimationLoop.ts // the pure loop hook (testable with fake timers)
    SchemaForm.tsx      // walks schema.shape → controls; recurses into groups
    controls/
      Slider.tsx  NumberInput.tsx  Segmented.tsx  Toggle.tsx  Swatch.tsx  Group.tsx
    theme.css           // Instrument palette + control styling (high contrast)
  diversions/
    flow-field/
      schema.ts         // Zod schema (+ UI meta) → Config type
      flowField.ts      // pure-ish simulation: noise field + particle advection
      noise.ts          // seeded value-noise (deterministic, unit-tested)
      index.ts          // Diversion module: metadata + schema + lifecycle
  routes/
    Gallery.tsx  ConfigScreen.tsx  PlayScreen.tsx
  App.tsx               // router
  main.tsx              // entry
tests/                  // co-located *.test.ts next to sources (Vitest)
```

**Decomposition rationale:** the codec, the loop, and the noise/sim are pure logic split into their own files so they're unit-testable without a DOM. UI components stay thin. `fieldMeta.ts` isolates the one place we read Zod metadata, so a Zod-version change touches one file.

---

## Phase 1 — Scaffold & framework core

### Task 1: Scaffold project + test harness

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/smoke.test.ts`

- [ ] **Step 1: Scaffold Vite React-TS app in place**

The project dir already contains `.git`, `.gitignore`, `docs/`. Scaffold into it:

```bash
npm create vite@latest . -- --template react-ts
```

If prompted about a non-empty directory, choose "Ignore files and continue".

- [ ] **Step 2: Install runtime + dev deps**

```bash
npm install zod nuqs react-router-dom
npm install -D vitest jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @vitejs/plugin-react
```

- [ ] **Step 3: Configure Vitest (jsdom env) in `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

Create `src/test-setup.ts`:

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test script to `package.json`**

Add to `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 5: Write a smoke test**

`src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Run it**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Scaffold Vite + React + TS + Vitest"
```

---

### Task 2: Core types + registry

**Files:**
- Create: `src/framework/types.ts`, `src/framework/registry.ts`, `src/framework/registry.test.ts`

- [ ] **Step 1: Define the contract types**

`src/framework/types.ts`:

```ts
import type { ZodObject } from 'zod'

export interface Size { width: number; height: number }

export type RenderContext = CanvasRenderingContext2D | WebGL2RenderingContext

/** Opaque per-run state a diversion builds in setup() and the framework threads back. */
export type DiversionState = unknown

export interface Diversion<Config = unknown> {
  id: string                       // slug, e.g. "flow-field"
  title: string
  description: string
  kind: '2d' | 'webgl'
  schema: ZodObject<any>           // drives form + URL codec + Config type
  setup(ctx: RenderContext, config: Config, size: Size): DiversionState
  frame(state: DiversionState, ctx: RenderContext, t: number, dt: number): void
  resize?(state: DiversionState, size: Size): void
  teardown?(state: DiversionState): void
}
```

- [ ] **Step 2: Write the failing registry test**

`src/framework/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { listDiversions, getDiversion } from './registry'

describe('registry', () => {
  it('lists at least the flow-field diversion', () => {
    const all = listDiversions()
    expect(all.some(d => d.id === 'flow-field')).toBe(true)
  })

  it('looks up a diversion by id', () => {
    expect(getDiversion('flow-field')?.title).toBe('Flow Field')
  })

  it('returns undefined for unknown id', () => {
    expect(getDiversion('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- registry`
Expected: FAIL (cannot find `./registry`).

- [ ] **Step 4: Implement the registry with Vite glob import**

`src/framework/registry.ts`:

```ts
import type { Diversion } from './types'

// Eagerly import every diversion's index module. Vite resolves this at build time.
const modules = import.meta.glob<{ default: Diversion }>(
  '../diversions/*/index.ts',
  { eager: true },
)

const diversions: Diversion[] = Object.values(modules)
  .map(m => m.default)
  .sort((a, b) => a.title.localeCompare(b.title))

export function listDiversions(): Diversion[] {
  return diversions
}

export function getDiversion(id: string): Diversion | undefined {
  return diversions.find(d => d.id === id)
}
```

> Note: this test passes only after Task 8 registers flow-field. Until then, expect the two flow-field assertions to fail. Either implement Task 2 + Task 8 together, or temporarily assert `Array.isArray(listDiversions())` and tighten in Task 8. The plan assumes you keep the strict test and see it green after Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/framework/types.ts src/framework/registry.ts src/framework/registry.test.ts
git commit -m "Add diversion contract types + registry"
```

---

### Task 3: URL codec (keystone — full TDD)

**Files:**
- Create: `src/framework/urlCodec.ts`, `src/framework/urlCodec.test.ts`

The codec converts a typed config to/from `URLSearchParams`: flatten nested objects to dotted keys, omit values equal to the schema default (short URLs), and validate on decode so a bad URL degrades to defaults instead of throwing.

- [ ] **Step 1: Write the failing tests**

`src/framework/urlCodec.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { encodeConfig, decodeConfig } from './urlCodec'

const schema = z.object({
  particles: z.number().int().min(100).max(20000).default(4000),
  speed: z.number().min(0).max(5).default(1.2),
  blend: z.enum(['lighter', 'screen', 'normal']).default('lighter'),
  fadeTrails: z.boolean().default(true),
  palette: z.object({
    background: z.string().default('#0a0a12'),
    hueStart: z.number().min(0).max(360).default(200),
  }).default({ background: '#0a0a12', hueStart: 200 }),
})

const defaults = schema.parse({})

describe('encodeConfig', () => {
  it('omits values equal to defaults (empty for all-default config)', () => {
    expect(encodeConfig(schema, defaults).toString()).toBe('')
  })

  it('emits only changed values, flattening nested keys', () => {
    const cfg = { ...defaults, particles: 8000, palette: { background: '#0a0a12', hueStart: 300 } }
    const sp = encodeConfig(schema, cfg)
    expect(sp.get('particles')).toBe('8000')
    expect(sp.get('palette.hueStart')).toBe('300')
    expect(sp.has('speed')).toBe(false)          // unchanged → omitted
    expect(sp.has('palette.background')).toBe(false)
  })
})

describe('decodeConfig', () => {
  it('round-trips: decode(encode(cfg)) === cfg', () => {
    const cfg = { ...defaults, particles: 8000, speed: 3.5, blend: 'screen' as const,
                  fadeTrails: false, palette: { background: '#112233', hueStart: 90 } }
    expect(decodeConfig(schema, encodeConfig(schema, cfg))).toEqual(cfg)
  })

  it('fills omitted params from defaults', () => {
    expect(decodeConfig(schema, new URLSearchParams('particles=5000')))
      .toEqual({ ...defaults, particles: 5000 })
  })

  it('coerces numbers and booleans from strings', () => {
    const out = decodeConfig(schema, new URLSearchParams('particles=5000&fadeTrails=false'))
    expect(out.particles).toBe(5000)
    expect(out.fadeTrails).toBe(false)
  })

  it('falls back to full defaults on out-of-range values (never throws)', () => {
    expect(decodeConfig(schema, new URLSearchParams('particles=999999'))).toEqual(defaults)
  })

  it('falls back to full defaults on garbage', () => {
    expect(decodeConfig(schema, new URLSearchParams('particles=abc&blend=purple'))).toEqual(defaults)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- urlCodec`
Expected: FAIL (cannot find `./urlCodec`).

- [ ] **Step 3: Implement the codec**

`src/framework/urlCodec.ts`:

```ts
import type { ZodObject } from 'zod'

type Json = Record<string, unknown>

/** Flatten nested plain objects to dotted keys. Arrays join with "_". */
function flatten(obj: Json, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (Array.isArray(v)) out[key] = v.join('_')
    else if (v && typeof v === 'object') flatten(v as Json, key, out)
    else out[key] = String(v)
  }
  return out
}

/** Rebuild a nested object from dotted keys, coercing each leaf by its default's type. */
function unflatten(flat: Record<string, string>, defaults: Json): Json {
  const out: Json = structuredClone(defaults)
  for (const [path, raw] of Object.entries(flat)) {
    const parts = path.split('.')
    let cur: Json = out
    let def: unknown = defaults
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur[parts[i]] as Json
      def = (def as Json)?.[parts[i]]
      if (cur == null) break
    }
    if (cur == null) continue
    const leaf = parts[parts.length - 1]
    const prev = (def as Json)?.[leaf]
    cur[leaf] =
      Array.isArray(prev) ? raw.split('_').map(Number)
      : typeof prev === 'number' ? Number(raw)
      : typeof prev === 'boolean' ? raw === 'true'
      : raw
  }
  return out
}

export function encodeConfig<T extends ZodObject<any>>(
  schema: T, value: ReturnType<T['parse']>,
): URLSearchParams {
  const defaults = schema.parse({}) as Json
  const flatVal = flatten(value as Json)
  const flatDef = flatten(defaults)
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(flatVal)) {
    if (v !== flatDef[k]) sp.set(k, v)   // omit anything still at default
  }
  return sp
}

export function decodeConfig<T extends ZodObject<any>>(
  schema: T, params: URLSearchParams,
): ReturnType<T['parse']> {
  const defaults = schema.parse({}) as Json
  const flat: Record<string, string> = {}
  for (const [k, v] of params) flat[k] = v
  const raw = unflatten(flat, defaults)
  const result = schema.safeParse(raw)
  return (result.success ? result.data : defaults) as ReturnType<T['parse']>
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- urlCodec`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/framework/urlCodec.ts src/framework/urlCodec.test.ts
git commit -m "Add config⇆URL codec with defaults-omission + validating decode"
```

---

### Task 4: SchemaForm + controls

**Files:**
- Create: `src/framework/fieldMeta.ts`, `src/framework/fieldMeta.test.ts`, `src/framework/SchemaForm.tsx`, `src/framework/controls/*.tsx`, `src/framework/SchemaForm.test.tsx`

The form reads **all UI info from each field's `.meta()`** (public Zod API) — never from Zod internals — and picks the control from `meta.ui`. The invariant "slider only if bounds defined" is enforced at schema-authoring time: bounded fields declare `ui:'slider'` with `min/max/step` in meta; open-ended numbers declare `ui:'number'`.

- [ ] **Step 1: Define the field-meta shape + reader**

`src/framework/fieldMeta.ts`:

```ts
import type { ZodTypeAny, ZodObject } from 'zod'

export type FieldUi = 'slider' | 'number' | 'segmented' | 'toggle' | 'color' | 'group'

export interface FieldMeta {
  ui: FieldUi
  label: string
  help?: string
  min?: number          // required for ui:'slider'
  max?: number          // required for ui:'slider'
  step?: number
  options?: string[]    // for ui:'segmented' (mirrors enum values)
}

/** Read a field's UI meta via Zod's public .meta(). Returns undefined if unset. */
export function readMeta(field: ZodTypeAny): FieldMeta | undefined {
  // Zod 4: .meta() (no args) returns the registered metadata object.
  // VERIFY against installed Zod version via context7 if this returns undefined.
  const m = (field as { meta?: () => unknown }).meta?.()
  return m as FieldMeta | undefined
}

/** Ordered [key, fieldSchema, meta] for each property of an object schema. */
export function fields(schema: ZodObject<any>): Array<[string, ZodTypeAny, FieldMeta]> {
  return Object.entries(schema.shape).map(([key, field]) => {
    const meta = readMeta(field as ZodTypeAny)
    if (!meta) throw new Error(`Field "${key}" is missing .meta({ ui, label })`)
    return [key, field as ZodTypeAny, meta]
  })
}
```

- [ ] **Step 2: Write the failing meta test**

`src/framework/fieldMeta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { fields } from './fieldMeta'

const schema = z.object({
  particles: z.number().int().min(100).max(20000).default(4000)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles' }),
  seed: z.number().int().default(1).meta({ ui: 'number', label: 'Seed' }),
})

describe('fields', () => {
  it('returns ordered fields with their meta', () => {
    const f = fields(schema)
    expect(f.map(([k]) => k)).toEqual(['particles', 'seed'])
    expect(f[0][2].ui).toBe('slider')
    expect(f[0][2].max).toBe(20000)
    expect(f[1][2].ui).toBe('number')
  })

  it('throws if a field has no meta', () => {
    const bad = z.object({ x: z.number().default(0) })
    expect(() => fields(bad)).toThrow(/missing .meta/)
  })
})
```

- [ ] **Step 3: Run to verify failure, then make it pass**

Run: `npm test -- fieldMeta`
Expected: FAIL → after Step 1 exists, PASS. If `.meta()` returns undefined, consult context7 for the Zod 4 metadata retrieval API and adjust `readMeta`.

- [ ] **Step 4: Implement the control components**

Each control is controlled: `{ value, onChange, meta }`. High-contrast styling lives in `theme.css` (Task added classnames). Create `src/framework/controls/`:

`Slider.tsx`:

```tsx
import type { FieldMeta } from '../fieldMeta'
export function Slider({ value, onChange, meta }: { value: number; onChange: (v: number) => void; meta: FieldMeta }) {
  return (
    <div className="ctl">
      <div className="ctl-top"><span className="ctl-name">{meta.label}</span><span className="ctl-val">{value}</span></div>
      <input type="range" min={meta.min} max={meta.max} step={meta.step ?? 1}
             value={value} onChange={e => onChange(Number(e.target.value))} />
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
```

`NumberInput.tsx`:

```tsx
import type { FieldMeta } from '../fieldMeta'
export function NumberInput({ value, onChange, meta }: { value: number; onChange: (v: number) => void; meta: FieldMeta }) {
  return (
    <div className="ctl">
      <div className="ctl-top"><span className="ctl-name">{meta.label}</span><span className="ctl-tag">no bounds → number</span></div>
      <div className="num">
        <button onClick={() => onChange(value - (meta.step ?? 1))}>–</button>
        <input type="number" step={meta.step ?? 1} value={value}
               onChange={e => onChange(Number(e.target.value))} />
        <button onClick={() => onChange(value + (meta.step ?? 1))}>+</button>
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
```

`Segmented.tsx`:

```tsx
import type { FieldMeta } from '../fieldMeta'
export function Segmented({ value, onChange, meta }: { value: string; onChange: (v: string) => void; meta: FieldMeta }) {
  return (
    <div className="ctl">
      <div className="ctl-top"><span className="ctl-name">{meta.label}</span></div>
      <div className="seg">
        {(meta.options ?? []).map(opt => (
          <button key={opt} className={opt === value ? 'on' : ''} onClick={() => onChange(opt)}>{opt}</button>
        ))}
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
```

`Toggle.tsx`:

```tsx
import type { FieldMeta } from '../fieldMeta'
export function Toggle({ value, onChange, meta }: { value: boolean; onChange: (v: boolean) => void; meta: FieldMeta }) {
  return (
    <div className="ctl toggle-row">
      <span className="ctl-name">{meta.label}</span>
      <button className={`sw ${value ? 'on' : ''}`} role="switch" aria-checked={value}
              onClick={() => onChange(!value)} />
    </div>
  )
}
```

`Swatch.tsx`:

```tsx
import type { FieldMeta } from '../fieldMeta'
export function Swatch({ value, onChange, meta }: { value: string; onChange: (v: string) => void; meta: FieldMeta }) {
  return (
    <div className="ctl">
      <div className="ctl-top"><span className="ctl-name">{meta.label}</span><span className="ctl-val">{value}</span></div>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} />
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
```

`Group.tsx`:

```tsx
import type { ReactNode } from 'react'
export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="group">
      <legend className="glabel">{label}</legend>
      {children}
    </fieldset>
  )
}
```

- [ ] **Step 5: Implement `SchemaForm`**

`src/framework/SchemaForm.tsx`:

```tsx
import type { ZodObject } from 'zod'
import { fields, type FieldMeta } from './fieldMeta'
import { Slider } from './controls/Slider'
import { NumberInput } from './controls/NumberInput'
import { Segmented } from './controls/Segmented'
import { Toggle } from './controls/Toggle'
import { Swatch } from './controls/Swatch'
import { Group } from './controls/Group'

type AnyObj = Record<string, any>

function controlFor(ui: FieldMeta['ui']) {
  switch (ui) {
    case 'slider': return Slider
    case 'number': return NumberInput
    case 'segmented': return Segmented
    case 'toggle': return Toggle
    case 'color': return Swatch
    default: return null
  }
}

export function SchemaForm({ schema, value, onChange }: {
  schema: ZodObject<any>
  value: AnyObj
  onChange: (next: AnyObj) => void
}) {
  return (
    <div className="schema-form">
      {fields(schema).map(([key, field, meta]) => {
        if (meta.ui === 'group') {
          return (
            <Group key={key} label={meta.label}>
              <SchemaForm
                schema={field as ZodObject<any>}
                value={value[key]}
                onChange={(sub) => onChange({ ...value, [key]: sub })}
              />
            </Group>
          )
        }
        const Control = controlFor(meta.ui)!
        return (
          <Control key={key} meta={meta} value={value[key]}
                   onChange={(v: any) => onChange({ ...value, [key]: v })} />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Write a render test for control selection**

`src/framework/SchemaForm.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { z } from 'zod'
import { SchemaForm } from './SchemaForm'

const schema = z.object({
  particles: z.number().min(100).max(20000).default(4000)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles' }),
  seed: z.number().default(1).meta({ ui: 'number', label: 'Seed' }),
  fadeTrails: z.boolean().default(true).meta({ ui: 'toggle', label: 'Fade trails' }),
  palette: z.object({
    hueStart: z.number().min(0).max(360).default(200)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue start' }),
  }).default({ hueStart: 200 }).meta({ ui: 'group', label: 'Palette' }),
})

describe('SchemaForm', () => {
  it('renders a slider for bounded, a number input for open-ended, and an expanded group', () => {
    const value = schema.parse({})
    render(<SchemaForm schema={schema} value={value} onChange={() => {}} />)
    // bounded → range input
    expect(screen.getByDisplayValue('4000')).toHaveAttribute('type', 'range')
    // open-ended → number input
    expect(screen.getByDisplayValue('1')).toHaveAttribute('type', 'number')
    // toggle present as a switch
    expect(screen.getByRole('switch')).toBeInTheDocument()
    // nested group rendered (expanded) with its label + child slider
    expect(screen.getByText('Palette')).toBeInTheDocument()
    expect(screen.getByDisplayValue('200')).toHaveAttribute('type', 'range')
  })
})
```

- [ ] **Step 7: Run all Phase-1 tests**

Run: `npm test`
Expected: all green (registry's flow-field assertions still pending Task 8).

- [ ] **Step 8: Commit**

```bash
git add src/framework/fieldMeta.ts src/framework/fieldMeta.test.ts src/framework/SchemaForm.tsx src/framework/SchemaForm.test.tsx src/framework/controls
git commit -m "Add schema-driven SchemaForm + controls (slider/number/segmented/toggle/swatch/group)"
```

---

## Phase 2 — Animation host & screens

### Task 5: Animation host

**Files:**
- Create: `src/framework/useAnimationLoop.ts`, `src/framework/useAnimationLoop.test.ts`, `src/framework/AnimationHost.tsx`

The host renders one `<canvas>`, acquires the right context for `diversion.kind`, runs `setup`, drives a single rAF loop calling `frame(state, ctx, t, dt)`, and owns pause / visibility-pause / fps / fullscreen / resize.

- [ ] **Step 1: Write the failing loop-hook test**

`src/framework/useAnimationLoop.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLoop } from './useAnimationLoop'

describe('createLoop', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('calls onFrame with increasing time and a positive dt, and stops cleanly', () => {
    let frames: Array<{ t: number; dt: number }> = []
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number)
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => clearTimeout(id as unknown as NodeJS.Timeout))

    const loop = createLoop((t, dt) => frames.push({ t, dt }))
    loop.start()
    vi.advanceTimersByTime(50)   // ~3 frames
    loop.stop()
    const after = frames.length
    vi.advanceTimersByTime(50)   // no more frames after stop

    expect(after).toBeGreaterThanOrEqual(2)
    expect(frames.length).toBe(after)
    expect(frames[1].dt).toBeGreaterThan(0)
    raf.mockRestore()
  })

  it('does not call onFrame while paused', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number)
    let count = 0
    const loop = createLoop(() => { count++ })
    loop.start(); loop.setPaused(true)
    const at = count
    vi.advanceTimersByTime(64)
    expect(count).toBe(at)   // frozen
    loop.stop()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- useAnimationLoop`
Expected: FAIL (cannot find `./useAnimationLoop`).

- [ ] **Step 3: Implement the loop**

`src/framework/useAnimationLoop.ts`:

```ts
export interface Loop {
  start(): void
  stop(): void
  setPaused(p: boolean): void
}

/** A single rAF loop. onFrame receives elapsed time t (ms) and delta dt (ms). */
export function createLoop(onFrame: (t: number, dt: number) => void): Loop {
  let raf = 0
  let startTime = 0
  let last = 0
  let paused = false
  let running = false

  const tick = (now: number) => {
    if (!running) return
    if (!paused) {
      if (startTime === 0) { startTime = now; last = now }
      const t = now - startTime
      const dt = now - last
      last = now
      onFrame(t, dt)
    } else {
      last = now   // keep dt sane on resume
    }
    raf = requestAnimationFrame(tick)
  }

  return {
    start() { if (running) return; running = true; startTime = 0; raf = requestAnimationFrame(tick) },
    stop() { running = false; cancelAnimationFrame(raf) },
    setPaused(p: boolean) { paused = p },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- useAnimationLoop`
Expected: green.

- [ ] **Step 5: Implement `AnimationHost`**

`src/framework/AnimationHost.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Diversion, RenderContext, Size } from './types'
import { createLoop } from './useAnimationLoop'

export function AnimationHost({ diversion, config, fullscreenable = false, showChrome = true }: {
  diversion: Diversion
  config: unknown
  fullscreenable?: boolean
  showChrome?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [fps, setFps] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = (diversion.kind === 'webgl'
      ? canvas.getContext('webgl2')
      : canvas.getContext('2d')) as RenderContext | null
    if (!ctx) return

    const sizeOf = (): Size => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(r.width * dpr))
      canvas.height = Math.max(1, Math.floor(r.height * dpr))
      return { width: canvas.width, height: canvas.height }
    }

    let size = sizeOf()
    const state = diversion.setup(ctx, config, size)

    // fps sampling
    let acc = 0, frames = 0
    const loop = createLoop((t, dt) => {
      diversion.frame(state, ctx, t, dt)
      acc += dt; frames++
      if (acc >= 500) { setFps(Math.round((frames * 1000) / acc)); acc = 0; frames = 0 }
    })
    loop.start()

    const onResize = () => { size = sizeOf(); diversion.resize?.(state, size) }
    window.addEventListener('resize', onResize)
    const onVisibility = () => loop.setPaused(document.hidden || paused)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      loop.stop()
      diversion.teardown?.(state)
    }
    // re-run when the diversion or config identity changes
  }, [diversion, config])

  // reflect manual pause into the loop without re-running setup
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const toggleFullscreen = () => {
    const el = wrapRef.current!
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  return (
    <div ref={wrapRef} className="anim-host">
      <canvas ref={canvasRef} className="anim-canvas" />
      {showChrome && (
        <div className="anim-bar">
          <span className="fps">{fps} fps</span>
          <button onClick={() => setPaused(p => !p)}>{paused ? '▶' : '⏸'}</button>
          {fullscreenable && <button onClick={toggleFullscreen}>⛶</button>}
        </div>
      )}
    </div>
  )
}
```

> Pause wiring note: the loop is created inside the effect. To let the ⏸ button pause without restarting `setup`, store the loop in a ref and have a small second effect call `loop.setPaused(paused || document.hidden)` when `paused` changes. Add that ref + effect during implementation; the loop test already covers `setPaused`.

- [ ] **Step 6: Commit**

```bash
git add src/framework/useAnimationLoop.ts src/framework/useAnimationLoop.test.ts src/framework/AnimationHost.tsx
git commit -m "Add AnimationHost + rAF loop with pause/visibility/fps/fullscreen"
```

---

### Task 6: Routing + screens

**Files:**
- Create: `src/routes/Gallery.tsx`, `src/routes/ConfigScreen.tsx`, `src/routes/PlayScreen.tsx`, `src/App.tsx` (replace), `src/main.tsx` (replace), `src/framework/theme.css`

- [ ] **Step 1: Wire the router**

`src/App.tsx`:

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Gallery } from './routes/Gallery'
import { ConfigScreen } from './routes/ConfigScreen'
import { PlayScreen } from './routes/PlayScreen'

const router = createBrowserRouter([
  { path: '/', element: <Gallery /> },
  { path: '/d/:slug', element: <ConfigScreen /> },
  { path: '/d/:slug/play', element: <PlayScreen /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6'
import './framework/theme.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NuqsAdapter>
      <App />
    </NuqsAdapter>
  </StrictMode>,
)
```

> Verify the nuqs adapter import path against the installed nuqs version (context7). If the React-Router adapter differs, use the generic adapter; the config screen below uses the codec directly for nested config, so nuqs is only the reactive write transport.

- [ ] **Step 2: Gallery index (live preview tiles)**

`src/routes/Gallery.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { listDiversions } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'

export function Gallery() {
  return (
    <div className="gallery">
      <h1 className="gallery-title">Diversions</h1>
      <div className="gallery-grid">
        {listDiversions().map(d => (
          <Link key={d.id} to={`/d/${d.id}`} className="tile">
            <div className="tile-preview">
              <AnimationHost diversion={d} config={d.schema.parse({})} showChrome={false} />
            </div>
            <div className="tile-meta"><h3>{d.title}</h3><p>{d.description}</p></div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Config screen (form left, live preview right, URL-synced)**

`src/routes/ConfigScreen.tsx`:

```tsx
import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getDiversion } from '../framework/registry'
import { SchemaForm } from '../framework/SchemaForm'
import { AnimationHost } from '../framework/AnimationHost'
import { encodeConfig, decodeConfig } from '../framework/urlCodec'

export function ConfigScreen() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const diversion = getDiversion(slug!)
  if (!diversion) return <div className="empty">Unknown diversion.</div>

  // initialise config from the current URL, fall back to defaults
  const [config, setConfig] = useState(() =>
    decodeConfig(diversion.schema, new URLSearchParams(window.location.search)))

  const update = (next: any) => {
    setConfig(next)
    // reactive URL write (replace, no history spam)
    const qs = encodeConfig(diversion.schema, next).toString()
    navigate({ search: qs ? `?${qs}` : '' }, { replace: true })
  }

  const playHref = `/d/${diversion.id}/play?${encodeConfig(diversion.schema, config).toString()}`

  return (
    <div className="config-screen">
      <aside className="config-panel">
        <header className="config-head">
          <Link to="/" className="back">← gallery</Link>
          <h2>{diversion.title}</h2>
        </header>
        <SchemaForm schema={diversion.schema} value={config} onChange={update} />
        <Link className="open-btn" to={playHref}>Open animation ↗</Link>
      </aside>
      <main className="config-preview">
        <AnimationHost diversion={diversion} config={config} />
      </main>
    </div>
  )
}
```

> The config object identity changes on every edit, which re-runs `AnimationHost`'s setup effect — acceptable for the preview (cheap reset). If a future diversion is expensive to re-`setup`, add a `diversion.update?(state, config)` hook. Out of scope for v1.

- [ ] **Step 4: Play screen (full canvas from URL)**

`src/routes/PlayScreen.tsx`:

```tsx
import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getDiversion } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'
import { decodeConfig } from '../framework/urlCodec'

export function PlayScreen() {
  const { slug } = useParams()
  const diversion = getDiversion(slug!)
  // parse config ONCE from the URL; frozen for the session
  const config = useMemo(
    () => diversion ? decodeConfig(diversion.schema, new URLSearchParams(window.location.search)) : null,
    [diversion],
  )
  if (!diversion || !config) return <div className="empty">Unknown diversion.</div>

  return (
    <div className="play-screen">
      <Link to={`/d/${diversion.id}`} className="play-back">← config</Link>
      <AnimationHost diversion={diversion} config={config} fullscreenable />
    </div>
  )
}
```

- [ ] **Step 5: Add the theme stylesheet (Instrument, high contrast)**

`src/framework/theme.css` — implement the Instrument palette from the approved mockup. Required tokens & classes (fill in full rules during implementation, verifying against the mockup in `.superpowers/brainstorm/`):

```css
:root {
  --bg: #08080a; --panel: #0b0b0e; --fg: #f0f0f2; --muted: #8a8a94;
  --accent: #7df5cf; --accent-2: #5fd0ff; --line: #26262c; --line-2: #30303a;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
       font-family: ui-monospace, Menlo, monospace; }
/* config-screen grid (panel 300px + preview), config-panel, ctl/ctl-top/ctl-name/
   ctl-val/ctl-help/ctl-tag, range/number/seg/sw styling, group/glabel,
   anim-host/anim-canvas/anim-bar/fps, gallery-grid/tile, open-btn, play-screen
   chrome auto-hide on mouse idle. High contrast per invariant #5. */
```

> Styling is cosmetic and iterated during Chrome verify (Task 9). Get it functional and on-ethos here; polish in verify.

- [ ] **Step 6: Commit**

```bash
git add src/routes src/App.tsx src/main.tsx src/framework/theme.css
git commit -m "Add router + gallery/config/play screens + Instrument theme"
```

---

## Phase 3 — Flow Field diversion

### Task 7: Seeded noise + flow simulation

**Files:**
- Create: `src/diversions/flow-field/noise.ts`, `src/diversions/flow-field/noise.test.ts`, `src/diversions/flow-field/flowField.ts`

- [ ] **Step 1: Write the failing noise test**

`src/diversions/flow-field/noise.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeNoise2D } from './noise'

describe('makeNoise2D', () => {
  it('is deterministic for a given seed', () => {
    const a = makeNoise2D(1234)
    const b = makeNoise2D(1234)
    expect(a(0.3, 0.7)).toBeCloseTo(b(0.3, 0.7), 10)
  })

  it('differs across seeds', () => {
    expect(makeNoise2D(1)(0.3, 0.7)).not.toBeCloseTo(makeNoise2D(2)(0.3, 0.7), 6)
  })

  it('returns values within [-1, 1]', () => {
    const n = makeNoise2D(42)
    for (let i = 0; i < 100; i++) {
      const v = n(i * 0.13, i * 0.29)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- noise`
Expected: FAIL (cannot find `./noise`).

- [ ] **Step 3: Implement seeded value noise**

`src/diversions/flow-field/noise.ts`:

```ts
// Small deterministic value-noise with bilinear interpolation. Good enough for a flow field.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x)

export function makeNoise2D(seed: number): (x: number, y: number) => number {
  // hashed gradient grid → value in [-1, 1]
  const rand = mulberry32(seed)
  const SIZE = 256
  const grid = new Float32Array(SIZE * SIZE)
  for (let i = 0; i < grid.length; i++) grid[i] = rand() * 2 - 1
  const at = (xi: number, yi: number) => grid[((yi & (SIZE - 1)) * SIZE) + (xi & (SIZE - 1))]

  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const fx = smooth(x - x0), fy = smooth(y - y0)
    const v00 = at(x0, y0), v10 = at(x0 + 1, y0)
    const v01 = at(x0, y0 + 1), v11 = at(x0 + 1, y0 + 1)
    const a = v00 + fx * (v10 - v00)
    const b = v01 + fx * (v11 - v01)
    return a + fy * (b - a)
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- noise`
Expected: green.

- [ ] **Step 5: Implement the simulation (no DOM — operates on a context passed in)**

`src/diversions/flow-field/flowField.ts`:

```ts
import type { CanvasRenderingContext2D as Ctx2D } from 'typescript' // type alias only; runtime uses the real ctx
import { makeNoise2D } from './noise'
import type { FlowFieldConfig } from './schema'

interface Particle { x: number; y: number }

export interface FlowState {
  particles: Particle[]
  noise: (x: number, y: number) => number
  cfg: FlowFieldConfig
  w: number; h: number
}

export function createFlowState(cfg: FlowFieldConfig, w: number, h: number): FlowState {
  const noise = makeNoise2D(cfg.seed)
  const particles: Particle[] = Array.from({ length: cfg.particles }, () => ({
    x: Math.random() * w, y: Math.random() * h,
  }))
  return { particles, noise, cfg, w, h }
}

export function stepFlow(state: FlowState, ctx: CanvasRenderingContext2D, dt: number) {
  const { particles, noise, cfg, w, h } = state
  // fade the canvas for trails (or clear)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.fadeTrails ? `${cfg.palette.background}22` : cfg.palette.background
  ctx.fillRect(0, 0, w, h)

  ctx.globalCompositeOperation = cfg.blend as GlobalCompositeOperation
  const speed = cfg.speed * dt * 0.06
  for (const p of particles) {
    const angle = noise(p.x * cfg.noiseScale, p.y * cfg.noiseScale) * Math.PI * 2
    const nx = p.x + Math.cos(angle) * speed * 16
    const ny = p.y + Math.sin(angle) * speed * 16
    const hue = cfg.palette.hueStart + ((p.x / w) * cfg.palette.hueRange)
    ctx.strokeStyle = `hsl(${hue}, 90%, 65%)`
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke()
    p.x = (nx + w) % w; p.y = (ny + h) % h
  }
}
```

> Remove the bogus `typescript` import line — it's illustrative of "type-only"; use the ambient `CanvasRenderingContext2D` DOM type directly (no import needed). Kept here only to flag that `flowField.ts` must not import anything browser-instantiating, so it stays unit-testable.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/flow-field/noise.ts src/diversions/flow-field/noise.test.ts src/diversions/flow-field/flowField.ts
git commit -m "Add seeded noise + flow-field simulation"
```

---

### Task 8: Flow Field schema + diversion module

**Files:**
- Create: `src/diversions/flow-field/schema.ts`, `src/diversions/flow-field/index.ts`

- [ ] **Step 1: Define the schema with UI meta**

`src/diversions/flow-field/schema.ts`:

```ts
import { z } from 'zod'

export const flowFieldSchema = z.object({
  particles: z.number().int().min(100).max(20000).default(4000)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles' }),
  noiseScale: z.number().min(0.0005).max(0.02).default(0.004)
    .meta({ ui: 'slider', min: 0.0005, max: 0.02, step: 0.0005, label: 'Noise scale',
            help: 'Lower = broad, sweeping currents. Higher = tight, turbulent detail.' }),
  speed: z.number().min(0).max(5).default(1.2)
    .meta({ ui: 'slider', min: 0, max: 5, step: 0.1, label: 'Speed' }),
  seed: z.number().int().default(10847)
    .meta({ ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always regenerates the same pattern.' }),
  blend: z.enum(['lighter', 'screen', 'normal']).default('lighter')
    .meta({ ui: 'segmented', options: ['lighter', 'screen', 'normal'], label: 'Blend' }),
  fadeTrails: z.boolean().default(true)
    .meta({ ui: 'toggle', label: 'Fade trails' }),
  palette: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a12')
      .meta({ ui: 'color', label: 'Background' }),
    hueStart: z.number().min(0).max(360).default(200)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue start' }),
    hueRange: z.number().min(0).max(360).default(80)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue range' }),
  }).default({ background: '#0a0a12', hueStart: 200, hueRange: 80 })
    .meta({ ui: 'group', label: 'Palette' }),
})

export type FlowFieldConfig = z.infer<typeof flowFieldSchema>
```

- [ ] **Step 2: Implement the diversion module**

`src/diversions/flow-field/index.ts`:

```ts
import type { Diversion, RenderContext, Size } from '../../framework/types'
import { flowFieldSchema, type FlowFieldConfig } from './schema'
import { createFlowState, stepFlow, type FlowState } from './flowField'

const flowField: Diversion<FlowFieldConfig> = {
  id: 'flow-field',
  title: 'Flow Field',
  description: 'Particles drifting through a noise-driven vector field.',
  kind: '2d',
  schema: flowFieldSchema,

  setup(ctx: RenderContext, config: FlowFieldConfig, size: Size): FlowState {
    const c = ctx as CanvasRenderingContext2D
    c.fillStyle = config.palette.background
    c.fillRect(0, 0, size.width, size.height)
    return createFlowState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepFlow(state as FlowState, ctx as CanvasRenderingContext2D, dt)
  },

  resize(state, size) {
    const s = state as FlowState
    s.w = size.width; s.h = size.height
  },
}

export default flowField
```

- [ ] **Step 3: Run the registry test (now fully green)**

Run: `npm test -- registry`
Expected: PASS — flow-field is discovered, title resolves.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flow-field/schema.ts src/diversions/flow-field/index.ts
git commit -m "Add Flow Field diversion module + schema; register it"
```

---

## Phase 4 — Verify & docs

### Task 9: Chrome verification + ethos polish (lead-inline)

**Files:** `src/framework/theme.css` (polish), any wiring fixes surfaced.

- [ ] **Step 1: Start the dev server (background)**

Run: `npm run dev` (note the actual port; Vite may bump 5173 → 5174).

- [ ] **Step 2: Verify in Chrome (chrome-devtools MCP) — NOT the built-in preview**

Drive Chrome through the full flow and assert each:
- `http://localhost:<port>/` — gallery shows the Flow Field tile with a **live** preview animating.
- Click the tile → `/d/flow-field` — form left (slider/number/segmented/toggle/swatch + expanded Palette group), live preview right.
- Drag **Particles**, **Noise scale**, change **Blend**, toggle **Fade trails**, edit **Seed**, change **Background** — confirm the preview updates and the **URL query string updates live** (and omits defaults).
- Reload the config URL → controls + preview restore from the URL.
- Click **Open animation ↗** → `/d/flow-field/play?...` — full-canvas animation matching the configured params.
- Click **⛶** → fullscreen works; **⏸** pauses; `fps` reads a sane number; switch tabs → auto-pause; return → resumes.
- Hand-edit the URL to an out-of-range value → animation falls back to defaults (no crash; check console clean).

- [ ] **Step 3: Polish the theme against the approved mockup**

Compare side-by-side with `.superpowers/brainstorm/57154-*/content/design-A-refined.html`. Tune contrast, spacing, control styling to match the Instrument ethos and the five invariants. Iterate in-place.

- [ ] **Step 4: Surface the verify URL to the user**

Provide the full clickable URL (with `?mute=1` is N/A — no audio; but include a representative config query). Name hotkeys. **Hand off for manual user inspection before any merge** (user-verify-before-FF-merge gate).

- [ ] **Step 5: Commit polish**

```bash
git add src/framework/theme.css
git commit -m "Polish Instrument theme to match approved mockup"
```

---

### Task 10: Docs + code review

**Files:** `README.md`, `ROADMAP.md`, `BACKLOG.md`, `CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1: Write the docs**

- `README.md` — what Diversion is, how to run (`npm install`, `npm run dev`, `npm test`), how to add a new diversion (a schema + `setup/frame/resize/teardown` in `src/diversions/<slug>/`), the three routes.
- `ROADMAP.md` — phases (✅ v1: framework + Flow Field), forward milestones (more diversions, static thumbnails, vector controls, GIF export).
- `BACKLOG.md` — the out-of-scope list from the spec.
- `CHANGELOG.md` — v1 shipped entry.
- `CLAUDE.md` — project conventions: stack, the diversion contract, the five UX invariants, test conventions, "framework owns the loop", git identity.

- [ ] **Step 2: Dispatch a fresh code-reviewer (no implementation bias)**

Use `feature-dev:code-reviewer` (or `/code-review`) over the full diff vs the initial commit. Focus: the codec round-trip correctness, the AnimationHost effect lifecycle (setup/teardown leaks, pause wiring), the meta-reading robustness, and adherence to the five invariants.

- [ ] **Step 3: Address review findings**

Apply fixes; re-run `npm test` (all green) and re-verify any touched flow in Chrome.

- [ ] **Step 4: Commit docs + fixes**

```bash
git add README.md ROADMAP.md BACKLOG.md CHANGELOG.md CLAUDE.md
git commit -m "Add project docs (README/ROADMAP/BACKLOG/CHANGELOG/CLAUDE)"
```

---

## Self-review (completed against the spec)

- **Spec coverage:** visual mix (2d|webgl in `types.ts` `kind`) ✓ · stack (Task 1) ✓ · framework-owned loop (Task 5) ✓ · contract (Task 2) ✓ · config⇆URL codec w/ defaults-omission + validating decode (Task 3) ✓ · SchemaForm + 5 invariants (Task 4, theme, Task 9) ✓ · three screens/routes (Task 6) ✓ · Flow Field reference (Tasks 7–8) ✓ · gallery live previews (Task 6) ✓ · pause/visibility/fps/fullscreen (Task 5) ✓ · testing/anti-regression contract (codec round-trip, codec resilience, control-selection, schema validation — Tasks 3,4,7) ✓ · docs/backlog (Task 10) ✓.
- **Placeholder scan:** theme.css full rules + README/ROADMAP/CLAUDE prose are intentionally authored during implementation (cosmetic / doc content), not logic placeholders. Two `> Note` callouts (nuqs adapter path, Zod `.meta()` retrieval) flag genuine version-specific verifications via context7 — deliberate, not gaps. The `typescript` import in `flowField.ts` is explicitly flagged for removal.
- **Type consistency:** `Diversion`/`RenderContext`/`Size`/`DiversionState` (Task 2) used consistently in AnimationHost (5), screens (6), flow-field module (8). `FieldMeta` (Task 4) consumed by every control + schema metas (Task 8). `encodeConfig`/`decodeConfig` signatures stable across codec (3) and screens (6). `createFlowState`/`stepFlow`/`FlowState` consistent across Tasks 7–8.
