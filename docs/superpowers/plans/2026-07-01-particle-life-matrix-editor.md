# Particle Life — Live Interaction-Matrix Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Particle Life (GPU)'s hidden per-species attract/repel matrix as a live, editable, share-linkable grid in the config UI.

**Architecture:** Add an optional `matrix` array field to the diversion schema (rides the existing URL codec). A new config-aware `ui:'matrix'` SchemaForm control renders an `n×n` heatmap you drag to retune; edits write the full matrix into `cfg.matrix` ("Custom"). A pure `resolveMatrix(cfg)` seam makes the GPU prefer `cfg.matrix` over the seed-derived table. A new pure `Diversion.reconcile(prev,next)` hook enforces the generator rules (Seed/Species clear, Symmetry transform, Bias defer) from `ConfigScreen`.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest + @testing-library/react, WebGPU. Dev/verify port **5180**.

## Global Constraints

- **Schema is the single source of truth** — one Zod field drives form + URL codec + `Config` type. New field carries `.meta({...})`.
- **Codec keystone:** an un-edited config must stay seedless and emit **no** `matrix` key; `seed` remains the only `randomizeOnFreshLoad` field. Decode degrades per-field (bad `matrix` → derive from seed, rest survives).
- **Black-box rule:** the framework renders; the diversion only describes. New seams (`ui:'matrix'`, `deriveFrom`, `reconcile`) are generic; particle-life math stays in the diversion.
- **Live-apply:** matrix edits go through `update()` (return `true`, no re-setup). Only `count`/`colors`/`seed`/`worldSize` remain structural (`false`).
- **Never `device.destroy()`** in teardown (shared singleton). No changes to the GPU lifecycle here.
- **Tests co-located** `*.test.ts(x)`. Git identity `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Terse commit subjects, no trailers.
- Read direction (fixed, everywhere): **cell = how the ROW (left/feeler) species feels about the COLUMN (top/neighbour) species.** `matrix[i*n + j]`, row `i` feeler, col `j` neighbour.

---

## File Structure

- `src/framework/fieldMeta.ts` — MODIFY: add `'matrix'` to `FieldUi`; add optional `deriveFrom?: (config: any) => number[]` to `FieldMeta`.
- `src/diversions/particle-life-gpu/schema.ts` — MODIFY: add optional `matrix` field with `ui` + `deriveFrom` (via `buildMatrix`).
- `src/diversions/particle-life-gpu/pack.ts` — MODIFY: add `resolveMatrix(cfg, worldW?, worldH?)`.
- `src/diversions/particle-life-gpu/pack.test.ts` — MODIFY: test `resolveMatrix`.
- `src/diversions/particle-life-gpu/matrixCodec.test.ts` — CREATE: codec round-trip / resilience for the `matrix` field.
- `src/diversions/particle-life-gpu/gpu.ts` — MODIFY: `initGPU` + `writeMatrix` call `resolveMatrix`.
- `src/framework/controls/MatrixEditor.tsx` — CREATE: the grid control.
- `src/framework/controls/MatrixEditor.test.tsx` — CREATE.
- `src/framework/SchemaForm.tsx` — MODIFY: `renderField` branch for `meta.ui === 'matrix'` (pass whole config + onChange).
- `src/framework/theme.css` — MODIFY: matrix grid styles.
- `src/framework/types.ts` — MODIFY: add optional `reconcile?(prev, next): Config` to the `Diversion` interface.
- `src/diversions/particle-life-gpu/index.ts` — MODIFY: implement `reconcile`.
- `src/diversions/particle-life-gpu/reconcile.ts` — CREATE: pure reconcile logic (unit-testable without React/GPU).
- `src/diversions/particle-life-gpu/reconcile.test.ts` — CREATE.
- `src/routes/ConfigScreen.tsx` — MODIFY: apply `diversion.reconcile` in `update`.
- `README.md` / `CLAUDE.md` — MODIFY: feature note + one gotcha.

---

## Task 1: Data layer — `matrix` field, `resolveMatrix`, GPU wiring, codec

Ships the field as `ui:'hidden'` (round-trips in the URL, drives the sim, not yet editable). This isolates the data/codec/GPU plumbing from the UI.

**Files:**
- Modify: `src/framework/fieldMeta.ts`
- Modify: `src/diversions/particle-life-gpu/pack.ts`
- Modify: `src/diversions/particle-life-gpu/schema.ts`
- Modify: `src/diversions/particle-life-gpu/gpu.ts:242`, `gpu.ts:372-376`
- Test: `src/diversions/particle-life-gpu/pack.test.ts`, `src/diversions/particle-life-gpu/matrixCodec.test.ts` (new)

**Interfaces:**
- Produces: `resolveMatrix(cfg: { colors: number; seed: number; symmetry: string; attractBias: number; matrix?: number[] }, worldW?: number, worldH?: number): Float32Array`
- Produces: schema field `matrix?: number[]` (optional, elements in `[-1,1]`), meta carries `deriveFrom(config) => number[]`.
- Produces: `FieldMeta.deriveFrom?: (config: any) => number[]`, `FieldUi` includes `'matrix'`.

- [ ] **Step 1: Add the `resolveMatrix` failing test**

In `src/diversions/particle-life-gpu/pack.test.ts`, add:

```ts
import { resolveMatrix, packMatrix } from './pack'

describe('resolveMatrix', () => {
  const base = { colors: 3, seed: 1337, symmetry: 'Asymmetric', attractBias: 0.1 }

  it('falls back to the seed-derived matrix when no override', () => {
    const got = resolveMatrix({ ...base })
    const want = packMatrix(3, 1337, 'Asymmetric', 0.1)
    expect(Array.from(got)).toEqual(Array.from(want))
  })

  it('prefers a valid override of length colors²', () => {
    const override = [0.5, -0.5, 1, -1, 0, 0.25, -0.25, 0.75, -0.75] // 3×3
    const got = resolveMatrix({ ...base, matrix: override })
    expect(Array.from(got)).toEqual(override)
  })

  it('ignores an override of the wrong length (falls back to seed)', () => {
    const got = resolveMatrix({ ...base, matrix: [0.5, -0.5] }) // wrong length for 3×3
    const want = packMatrix(3, 1337, 'Asymmetric', 0.1)
    expect(Array.from(got)).toEqual(Array.from(want))
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/diversions/particle-life-gpu/pack.test.ts`
Expected: FAIL — `resolveMatrix` is not exported.

- [ ] **Step 3: Implement `resolveMatrix` in `pack.ts`**

Append to `src/diversions/particle-life-gpu/pack.ts`:

```ts
/** The matrix the sim should use: the user's Custom override when present AND
 *  correctly sized (length colors²), else the seed-derived table. The length
 *  guard is here (not in the codec) because only the consumer knows colors. */
export function resolveMatrix(
  cfg: { colors: number; seed: number; symmetry: Symmetry; attractBias: number; matrix?: number[] },
  worldW: number = WORLD_W, worldH: number = WORLD_H,
): Float32Array {
  const n = cfg.colors
  if (Array.isArray(cfg.matrix) && cfg.matrix.length === n * n) return Float32Array.from(cfg.matrix)
  return packMatrix(n, cfg.seed, cfg.symmetry, cfg.attractBias)
}
```

(`Symmetry`, `WORLD_W`, `WORLD_H`, `packMatrix` are already in this file's scope.)

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run src/diversions/particle-life-gpu/pack.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `FieldMeta` / `FieldUi`**

In `src/framework/fieldMeta.ts`:

```ts
export type FieldUi = 'slider' | 'number' | 'segmented' | 'toggle' | 'color' | 'colorList' | 'group' | 'matrix' | 'hidden'

export interface FieldMeta {
  ui: FieldUi
  label: string
  help?: string
  min?: number
  max?: number
  step?: number
  maxLabel?: string
  options?: string[]
  showWhen?: { field: string; equals: string | string[] }
  section?: string
  randomizeOnFreshLoad?: boolean
  /** ui:'matrix' — derive the seed-based matrix (flat row-major, length colors²)
   *  from the full config. Keeps diversion math out of the generic control. */
  deriveFrom?: (config: any) => number[]
}
```

- [ ] **Step 6: Add the `matrix` schema field (as `hidden` for now)**

In `src/diversions/particle-life-gpu/schema.ts`, add the import and field:

```ts
import { buildMatrix } from '../particle-life/matrix'
```

Add inside `z.object({ ... })`, in the `Forces` group (after `attractBias`):

```ts
  matrix: z.array(z.number().min(-1).max(1)).optional()
    .meta({ section: 'Forces', ui: 'hidden', label: 'Interaction matrix',
            help: 'Per-species attract/repel table. Edit cells to hand-tune relationships; Reset to seed re-rolls it. Seed and Species rebuild it.',
            deriveFrom: (c) => [...buildMatrix(c.colors, c.seed, c.symmetry, c.attractBias)] }),
```

- [ ] **Step 7: Wire the GPU to `resolveMatrix`**

In `src/diversions/particle-life-gpu/gpu.ts`:

Line 24 import list — add `resolveMatrix`:
```ts
  seedWorld, packMatrix, packColors, packParams, packView, worldDims, DEFAULT_CAMERA, resolveMatrix,
```

Line 242 (`initGPU`), replace:
```ts
  const matrix = packMatrix(colors, cfg.seed, cfg.symmetry as Symmetry, cfg.attractBias)
```
with:
```ts
  const matrix = resolveMatrix(cfg as any)
```

`writeMatrix` (line ~372), replace its body:
```ts
export function writeMatrix(res: GpuResources, cfg: ParticleLifeGpuConfig): void {
  res.device.queue.writeBuffer(res.matrixBuf, 0, resolveMatrix(cfg as any))
}
```

- [ ] **Step 8: Write the codec resilience tests**

Create `src/diversions/particle-life-gpu/matrixCodec.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { particleLifeGpuSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

const parse = (o = {}) => particleLifeGpuSchema.parse(o)

describe('matrix field codec', () => {
  it('emits NO matrix key for an un-edited config (keystone)', () => {
    const qs = encodeConfig(particleLifeGpuSchema, parse()).toString()
    expect(qs).not.toContain('matrix=')
  })

  it('round-trips a Custom matrix through the URL', () => {
    const cfg = { ...parse({ colors: 3 }), matrix: [0.5, -0.5, 1, -1, 0, 0.25, -0.25, 0.75, -0.75] }
    const qs = encodeConfig(particleLifeGpuSchema, cfg)
    const back = decodeConfig(particleLifeGpuSchema, qs)
    expect(back.matrix).toBeDefined()
    back.matrix!.forEach((v, i) => expect(v).toBeCloseTo(cfg.matrix[i], 5))
  })

  it('drops an out-of-range matrix element (field reverts, rest survives)', () => {
    const qs = new URLSearchParams({ matrix: '2,0,0,0,0,0,0,0,0', colors: '3', dotSize: '4' })
    const back = decodeConfig(particleLifeGpuSchema, qs)
    expect(back.matrix).toBeUndefined() // whole field reverts to default (undefined)
    expect(back.dotSize).toBe(4)        // other fields still decode
  })
})
```

- [ ] **Step 9: Run all touched tests + typecheck**

Run: `npx vitest run src/diversions/particle-life-gpu/ src/framework/urlKeys.test.ts && npx tsc --noEmit`
Expected: PASS (including the existing `urlKeys.test.ts` — `matrix` is a globally-unique leaf, flat key, no collision).

- [ ] **Step 10: Commit**

```bash
git add src/framework/fieldMeta.ts src/diversions/particle-life-gpu/
git commit -m "feat(particle-life-gpu): matrix override field + resolveMatrix GPU seam (#204)"
```

---

## Task 2: MatrixEditor control — read-only grid + read-direction cues

Renders the `n×n` heatmap from the seed-derived matrix, with axis labels, the natural-language readout, and hover highlight. **No editing yet** — this task proves the view + read-direction.

**Files:**
- Create: `src/framework/controls/MatrixEditor.tsx`
- Create: `src/framework/controls/MatrixEditor.test.tsx`
- Modify: `src/framework/SchemaForm.tsx:62-91`
- Modify: `src/diversions/particle-life-gpu/schema.ts` (flip `ui:'hidden'` → `ui:'matrix'`)
- Modify: `src/framework/theme.css`

**Interfaces:**
- Consumes: `FieldMeta.deriveFrom`, `resolveMatrix` semantics (length colors²), `paletteColors(palette, n)` from `../../diversions/particle-life/palette`.
- Produces: `MatrixEditor` component, props `{ config: any; onConfigChange: (next: any) => void; meta: FieldMeta }`.
- Produces: helper `speciesLabel(config, i): string` and `relationSentence(config, i, j, v): string` (exported for tests).

- [ ] **Step 1: Failing test for grid render + readout**

Create `src/framework/controls/MatrixEditor.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MatrixEditor } from './MatrixEditor'
import { particleLifeGpuSchema } from '../../diversions/particle-life-gpu/schema'
import { fields } from '../fieldMeta'

const meta = fields(particleLifeGpuSchema).find(([k]) => k === 'matrix')![2]
const cfg = () => ({ ...particleLifeGpuSchema.parse({ colors: 4 }) })

describe('MatrixEditor (read-only view)', () => {
  it('renders an n×n grid of cells for the species count', () => {
    render(<MatrixEditor config={cfg()} onConfigChange={() => {}} meta={meta} />)
    expect(screen.getAllByTestId(/^mcell-/)).toHaveLength(4 * 4)
  })

  it('reflows when species changes', () => {
    const { rerender } = render(<MatrixEditor config={cfg()} onConfigChange={() => {}} meta={meta} />)
    rerender(<MatrixEditor config={{ ...cfg(), colors: 6 }} onConfigChange={() => {}} meta={meta} />)
    expect(screen.getAllByTestId(/^mcell-/)).toHaveLength(6 * 6)
  })

  it('shows a plain-language relationship on hover, with the sign verb', () => {
    render(<MatrixEditor config={cfg()} onConfigChange={() => {}} meta={meta} />)
    fireEvent.pointerEnter(screen.getByTestId('mcell-1-2'))
    const ro = screen.getByTestId('matrix-readout').textContent || ''
    expect(ro).toMatch(/(drawn to|repels|ignores)/)
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/framework/controls/MatrixEditor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MatrixEditor.tsx` (read-only)**

Create `src/framework/controls/MatrixEditor.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { FieldMeta } from '../fieldMeta'
import { paletteColors } from '../../diversions/particle-life/palette'

type Cfg = Record<string, any>

/** Flat matrix in effect: the Custom override if it fits colors², else derived. */
function effectiveMatrix(config: Cfg, meta: FieldMeta): number[] {
  const n = config.colors
  if (Array.isArray(config.matrix) && config.matrix.length === n * n) return config.matrix
  return meta.deriveFrom ? meta.deriveFrom(config) : new Array(n * n).fill(0)
}

export function speciesLabel(config: Cfg, i: number): string {
  return `species ${i + 1}`
}

export function relationSentence(config: Cfg, i: number, j: number, v: number): string {
  const a = speciesLabel(config, i), b = speciesLabel(config, j)
  const verb = v > 0.05 ? 'is drawn to' : v < -0.05 ? 'repels' : 'ignores'
  const sign = v >= 0 ? '+' : ''
  return `${a} ${verb} ${b} · ${sign}${v.toFixed(2)}`
}

function cellColor(v: number): string {
  const mag = Math.min(1, Math.abs(v))
  const [br, bg, bb] = v >= 0 ? [95, 208, 255] : [255, 107, 107]
  const t = 0.12 + 0.88 * mag
  const mix = (base: number) => Math.round(16 + (base - 16) * t)
  return `rgb(${mix(br)}, ${mix(bg)}, ${mix(bb)})`
}

export function MatrixEditor({ config, onConfigChange, meta }: {
  config: Cfg; onConfigChange: (next: Cfg) => void; meta: FieldMeta
}) {
  const n: number = config.colors
  const m = effectiveMatrix(config, meta)
  const colors = useMemo(() => paletteColors(config.palette, n), [config.palette, n])
  const [hover, setHover] = useState<[number, number] | null>(null)
  const custom = Array.isArray(config.matrix) && config.matrix.length === n * n

  const cols = `18px repeat(${n}, 1fr)`
  const active = hover ?? [0, Math.min(1, n - 1)]
  const av = m[active[0] * n + active[1]] ?? 0

  return (
    <div className="matrix-editor">
      <div className="matrix-legend">
        <span><i style={{ background: 'var(--accent-2)' }} />attract +</span>
        <span><i style={{ background: '#ff6b6b' }} />repel −</span>
      </div>
      <div className="matrix-grid" style={{ gridTemplateColumns: cols }}>
        <div className="mcorner" />
        {Array.from({ length: n }, (_, j) => (
          <div key={`h${j}`} className="mhead"><span className="mswatch" style={{ background: colors[j] }} /></div>
        ))}
        {Array.from({ length: n }, (_, i) => (
          <div key={`r${i}`} style={{ display: 'contents' }}>
            <div className="mhead"><span className="mswatch" style={{ background: colors[i] }} /></div>
            {Array.from({ length: n }, (_, j) => {
              const v = m[i * n + j] ?? 0
              const on = hover && hover[0] === i && hover[1] === j
              return (
                <div
                  key={`c${i}-${j}`}
                  data-testid={`mcell-${i}-${j}`}
                  className={`mcell${i === j ? ' diag' : ''}${on ? ' active' : ''}`}
                  style={{ background: cellColor(v) }}
                  onPointerEnter={() => setHover([i, j])}
                  onPointerLeave={() => setHover((h) => (h && h[0] === i && h[1] === j ? null : h))}
                >
                  {n <= 5 ? <span className="mval">{v.toFixed(1)}</span> : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="matrix-axis">cell = how the <b>left</b> species feels about the <b>top</b> species</div>
      <div className="matrix-readout" data-testid="matrix-readout">
        <span className="mswatch" style={{ background: colors[active[0]] }} />
        <span>{relationSentence(config, active[0], active[1], av)}</span>
        {custom ? <span className="matrix-custom">Custom</span> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire `MatrixEditor` into SchemaForm**

In `src/framework/SchemaForm.tsx`, add the import:
```ts
import { MatrixEditor } from './controls/MatrixEditor'
```
In `renderField`, add a branch BEFORE the `controlFor` lookup (after the `group` branch, ~line 80):
```ts
    if (meta.ui === 'matrix') {
      // Config-aware control: unlike normal controls it reads sibling fields
      // (colors/palette/symmetry) and writes the whole config.
      return <MatrixEditor key={key} meta={meta} config={value} onConfigChange={onChange} />
    }
```

- [ ] **Step 5: Flip the schema field to `ui:'matrix'`**

In `src/diversions/particle-life-gpu/schema.ts`, change the matrix field's `ui: 'hidden'` to `ui: 'matrix'`.

- [ ] **Step 6: Add CSS**

Append to `src/framework/theme.css`:

```css
.matrix-editor{display:flex;flex-direction:column;gap:9px;user-select:none}
.matrix-legend{display:flex;gap:14px;font-size:10px;color:var(--muted)}
.matrix-legend i{display:inline-block;width:20px;height:8px;border-radius:3px;vertical-align:middle;margin-right:4px}
.matrix-grid{display:grid;gap:3px}
.mcorner{}
.mhead{display:flex;align-items:center;justify-content:center}
.mswatch{width:13px;height:13px;border-radius:50%;box-shadow:0 0 0 1px rgba(255,255,255,.2)}
.mcell{position:relative;aspect-ratio:1/1;border-radius:5px;border:1px solid rgba(255,255,255,.06);cursor:ns-resize;display:flex;align-items:center;justify-content:center;touch-action:none}
.mcell.diag{border-color:rgba(255,255,255,.34)}
.mcell.active{outline:2px solid var(--accent);outline-offset:1px}
.mval{font-size:9px;color:rgba(255,255,255,.6);pointer-events:none}
.matrix-axis{font-size:10px;color:var(--muted)}
.matrix-readout{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--fg)}
.matrix-custom{margin-left:auto;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink);background:var(--accent);border-radius:4px;padding:2px 6px}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/framework/controls/MatrixEditor.test.tsx src/routes/ConfigScreen.test.tsx && npx tsc --noEmit`
Expected: PASS (ConfigScreen renders the GPU form without throwing on `ui:'matrix'`).

- [ ] **Step 8: Commit**

```bash
git add src/framework/controls/MatrixEditor.tsx src/framework/controls/MatrixEditor.test.tsx src/framework/SchemaForm.tsx src/framework/theme.css src/diversions/particle-life-gpu/schema.ts
git commit -m "feat(particle-life-gpu): matrix grid view + read-direction cues (#204)"
```

---

## Task 3: Editing — drag-to-edit, Custom, Reset, symmetric mirror

Makes the grid an instrument: vertical drag writes `cfg.matrix`; double-click types an exact value; Reset clears; Symmetric mirrors the partner cell.

**Files:**
- Modify: `src/framework/controls/MatrixEditor.tsx`
- Modify: `src/framework/controls/MatrixEditor.test.tsx`

**Interfaces:**
- Consumes: `effectiveMatrix`, `onConfigChange` from Task 2.
- Produces: on edit, calls `onConfigChange({ ...config, matrix: number[] /* length n² */ })`. On Reset, calls `onConfigChange(withoutMatrix)` where the `matrix` key is **omitted** (not set to `undefined`, so the codec emits nothing).

- [ ] **Step 1: Failing tests for edit + reset + mirror**

Add to `src/framework/controls/MatrixEditor.test.tsx`:

```tsx
describe('MatrixEditor (editing)', () => {
  it('drag writes a full-length matrix and marks Custom', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }) }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    const cell = screen.getByTestId('mcell-1-2')
    fireEvent.pointerDown(cell, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(cell, { clientY: 40, pointerId: 1 }) // drag up = more attract
    fireEvent.pointerUp(cell, { pointerId: 1 })
    expect(latest.matrix).toHaveLength(9)
    expect(latest.matrix[1 * 3 + 2]).toBeGreaterThan(effectiveMatrix(config, meta)[1 * 3 + 2])
  })

  it('Reset omits the matrix key entirely', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }), matrix: new Array(9).fill(0.5) }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    fireEvent.click(screen.getByTestId('matrix-reset'))
    expect('matrix' in latest).toBe(false)
  })

  it('Symmetric mode mirrors the partner cell on drag', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }), symmetry: 'Symmetric' }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    const cell = screen.getByTestId('mcell-0-2')
    fireEvent.pointerDown(cell, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(cell, { clientY: 60, pointerId: 1 })
    fireEvent.pointerUp(cell, { pointerId: 1 })
    expect(latest.matrix[0 * 3 + 2]).toBeCloseTo(latest.matrix[2 * 3 + 0], 5)
  })
})
```

Add `effectiveMatrix` to the export list of `MatrixEditor.tsx` (it's needed by the test): change `function effectiveMatrix` to `export function effectiveMatrix`.

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/framework/controls/MatrixEditor.test.tsx`
Expected: FAIL — no drag handler / no reset button.

- [ ] **Step 3: Add editing to `MatrixEditor.tsx`**

Add a clamp helper and a commit function near the top of the component body (after `custom`):

```tsx
  const clamp = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v)
  const commit = (i: number, j: number, v: number) => {
    const next = (Array.isArray(config.matrix) && config.matrix.length === n * n
      ? config.matrix.slice()
      : effectiveMatrix(config, meta).slice())
    next[i * n + j] = clamp(v)
    if (config.symmetry === 'Symmetric' && i !== j) next[j * n + i] = clamp(v)
    onConfigChange({ ...config, matrix: next })
  }
  const reset = () => {
    const { matrix: _omit, ...rest } = config // omit key, not undefined → codec emits nothing
    onConfigChange(rest)
  }
  const startDrag = (i: number, j: number, e: React.PointerEvent) => {
    const startY = e.clientY
    const startV = m[i * n + j] ?? 0
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const move = (ev: PointerEvent) => commit(i, j, startV + (startY - ev.clientY) * 0.008)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
```

On each `.mcell` div add `onPointerDown={(e) => startDrag(i, j, e)}` and `onDoubleClick={() => { const s = prompt(`${speciesLabel(config, i)} → ${speciesLabel(config, j)} (−1…1)`, String((m[i*n+j] ?? 0).toFixed(2))); if (s != null && !Number.isNaN(Number(s))) commit(i, j, Number(s)) }}`.

Add a Reset button after the readout block:
```tsx
      <button type="button" className="matrix-reset" data-testid="matrix-reset" onClick={reset}>↺ Reset to seed</button>
```
(Style `.matrix-reset` like `.btn` in Task 2's CSS — add:)
```css
.matrix-reset{align-self:flex-start;font:inherit;font-size:11px;color:var(--muted);background:var(--field);border:1px solid var(--line-2);border-radius:6px;padding:6px 10px;cursor:pointer}
.matrix-reset:hover{color:var(--fg)}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/framework/controls/MatrixEditor.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/controls/MatrixEditor.tsx src/framework/controls/MatrixEditor.test.tsx src/framework/theme.css
git commit -m "feat(particle-life-gpu): drag-to-edit matrix, Custom/Reset, symmetric mirror (#204)"
```

---

## Task 4: Generator reconcile hook (Seed/Species clear · Symmetry transform · Bias defer)

Enforces the truth model when a generator field changes, via a pure `Diversion.reconcile(prev, next)` hook called by `ConfigScreen`.

**Files:**
- Modify: `src/framework/types.ts` (add `reconcile?`)
- Create: `src/diversions/particle-life-gpu/reconcile.ts`
- Create: `src/diversions/particle-life-gpu/reconcile.test.ts`
- Modify: `src/diversions/particle-life-gpu/index.ts` (wire `reconcile`)
- Modify: `src/routes/ConfigScreen.tsx:46-50` (apply reconcile in `update`)

**Interfaces:**
- Produces: `reconcileMatrix(prev, next): Config` — pure.
  - `next.seed !== prev.seed` OR `next.colors !== prev.colors` → return `next` with `matrix` **omitted**.
  - `next.symmetry !== prev.symmetry` AND `next.matrix` is a length-n² array → return `next` with `matrix` transformed: Symmetric mirrors upper→lower (`out[j*n+i] = out[i*n+j]` for `i<j`); Asymmetric leaves values unchanged.
  - `next.attractBias !== prev.attractBias` → return `next` unchanged (bias defers; it re-applies only on the next derive/Reset).
  - otherwise → `next` unchanged (including plain `matrix` edits).
- Produces: `Diversion.reconcile?(prev: Config, next: Config): Config`.

- [ ] **Step 1: Failing tests for `reconcileMatrix`**

Create `src/diversions/particle-life-gpu/reconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { reconcileMatrix } from './reconcile'
import { particleLifeGpuSchema } from './schema'

const base = () => ({ ...particleLifeGpuSchema.parse({ colors: 3 }), matrix: [0.5,-0.5,1,-1,0,0.25,-0.25,0.75,-0.75] })

describe('reconcileMatrix', () => {
  it('clears the matrix when seed changes', () => {
    const out = reconcileMatrix(base(), { ...base(), seed: 42 })
    expect('matrix' in out).toBe(false)
  })
  it('clears the matrix when species changes', () => {
    const out = reconcileMatrix(base(), { ...base(), colors: 4 })
    expect('matrix' in out).toBe(false)
  })
  it('mirrors upper→lower when flipping to Symmetric', () => {
    const out = reconcileMatrix(base(), { ...base(), symmetry: 'Symmetric' })
    const n = 3, m = out.matrix!
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(m[j*n+i]).toBeCloseTo(m[i*n+j], 5)
  })
  it('leaves the matrix untouched when attractBias changes (defer)', () => {
    const b = base()
    const out = reconcileMatrix(b, { ...b, attractBias: 0.9 })
    expect(out.matrix).toEqual(b.matrix)
  })
  it('passes a plain matrix edit straight through', () => {
    const b = base(); const edited = { ...b, matrix: b.matrix.map(() => 0) }
    expect(reconcileMatrix(b, edited).matrix).toEqual(edited.matrix)
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/diversions/particle-life-gpu/reconcile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reconcile.ts`**

Create `src/diversions/particle-life-gpu/reconcile.ts`:

```ts
import type { ParticleLifeGpuConfig } from './schema'

/** Enforce the matrix truth-model when a generator field changes. Pure. */
export function reconcileMatrix(
  prev: ParticleLifeGpuConfig, next: ParticleLifeGpuConfig,
): ParticleLifeGpuConfig {
  // Seed / Species → rebuild: drop any Custom override (omit the key).
  if (next.seed !== prev.seed || next.colors !== prev.colors) {
    const { matrix: _omit, ...rest } = next
    return rest as ParticleLifeGpuConfig
  }
  // Symmetry flip → live transform on a Custom matrix (no reroll).
  const n = next.colors
  if (next.symmetry !== prev.symmetry && Array.isArray(next.matrix) && next.matrix.length === n * n) {
    if (next.symmetry === 'Symmetric') {
      const m = next.matrix.slice()
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m[j * n + i] = m[i * n + j]
      return { ...next, matrix: m }
    }
    return next // → Asymmetric: values unchanged, pairs just unlock
  }
  // Attraction-bias defers; plain matrix edits pass through.
  return next
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run src/diversions/particle-life-gpu/reconcile.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the `reconcile` seam to the Diversion type**

In `src/framework/types.ts`, add to the `Diversion` interface (near `update?`):
```ts
  /** Config screen: normalize a config edit before it commits (e.g. clear a
   *  derived override when its generator changes). Pure; framework calls it in
   *  ConfigScreen.update. Omit → edits commit as-is. */
  reconcile?(prev: Config, next: Config): Config
```
(Use the interface's existing `Config` type parameter — match the surrounding generic names in `types.ts`.)

- [ ] **Step 6: Wire it in `index.ts` and `ConfigScreen.tsx`**

In `src/diversions/particle-life-gpu/index.ts`, import and add the hook to the `defineDiversion({...})` object:
```ts
import { reconcileMatrix } from './reconcile'
```
```ts
  reconcile: reconcileMatrix,
```

In `src/routes/ConfigScreen.tsx`, update `update` (lines 46-50):
```ts
  const update = (next: Record<string, unknown>) => {
    const reconciled = (diversion.reconcile ? diversion.reconcile(config as any, next as any) : next) as Record<string, unknown>
    setConfig(reconciled)
    const qs = encodeConfig(diversion.schema, reconciled).toString()
    navigate({ search: qs ? `?${qs}` : '' }, { replace: true })
  }
```

- [ ] **Step 7: Run full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (all existing tests + new ones).

- [ ] **Step 8: Commit**

```bash
git add src/framework/types.ts src/routes/ConfigScreen.tsx src/diversions/particle-life-gpu/reconcile.ts src/diversions/particle-life-gpu/reconcile.test.ts src/diversions/particle-life-gpu/index.ts
git commit -m "feat(particle-life-gpu): generator reconcile hook for matrix edits (#204)"
```

---

## Task 5: Docs + Chrome verification

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Update docs**

- `README.md`: in the Particle Life (GPU) blurb / feature list, note the live interaction-matrix editor (drag cells to tune attract/repel; hand-tuned worlds ride the share-link).
- `CLAUDE.md` "Gotchas learned": add one line — *"A config-aware SchemaForm control (`ui:'matrix'`) receives the whole config via a dedicated `renderField` branch (not the one-field `value`), and derives diversion-owned values through a `meta.deriveFrom(config)` callback so the framework control imports no diversion math. Generator→derived-field reconciliation rides `Diversion.reconcile(prev,next)`, applied in `ConfigScreen.update`."*

- [ ] **Step 2: Commit docs**

```bash
git add README.md CLAUDE.md
git commit -m "docs: matrix editor — README feature + framework gotcha (#204)"
```

- [ ] **Step 3: Chrome verification (manual, port 5180)**

Start the dev server (`npm run dev`), open the config screen for Particle Life (GPU). Verify by looking:
1. The **Interaction matrix** subpanel shows an `n×n` heatmap; species swatches on both axes; diagonal boxed.
2. **Hover** a cell → row+col swatches highlight; readout reads a plain sentence with the right verb (attract/repel/ignore) and value.
3. **Drag** a cell up/down → the broth visibly reorganizes live; **Custom** badge appears.
4. **Species slider 3→8** → grid reflows; at 8 the ~32px cells are still usable.
5. **Symmetric** mode → dragging mirrors the partner cell; broth stays crystalline.
6. **Reset to seed** → grid re-derives, Custom badge clears.
7. Change **Seed** → matrix rebuilds (Custom clears). Change **Attraction-bias** while Custom → edits are **kept** (bias defers).
8. **Copy link** on a Custom world → open in a fresh tab → same tuned matrix loads. Un-edited world's link has no `matrix=` param and shows a fresh world.

Report what was verified with a screenshot path; note anything that looks off for a tuning pass (drag sensitivity, 8-species density, readout wording).

---

## Self-Review

**Spec coverage:**
- §1 data model (schema field, optional, `undefined`=derive, truth model) → Task 1 + Task 3 (omit-on-clear) + Task 4 (generator rules). ✓
- §1 generator-vs-custom rule (Symmetry transform · Seed/Species rebuild · Bias defer · guard) → Task 4. **Note:** the approved "guarded rebuild" for Bias is implemented as **defer** (edits kept; bias re-applies on next derive/Reset) rather than a modal confirm — lighter, no browser dialog, honors "no surprise wipe." Flagged in Execution Handoff for the user to confirm.
- §2 `ui:'matrix'` config-aware control + layering via `deriveFrom` → Task 1 (meta) + Task 2 (control + SchemaForm branch). ✓
- §2 view (inline responsive grid, swatches, diagonal, in-cell number ≤5) → Task 2. ✓
- §2 read-direction cues (axis label, natural-language readout, hover highlight) → Task 2. ✓
- §2 edit gesture (vertical drag, dbl-click type, symmetric mirror, Reset, Custom badge) → Task 3. ✓
- §3 codec (encode only when Custom, array format, per-field degrade, keystone) → Task 1 (tests). ✓
- §4 GPU wiring (`resolveMatrix` in initGPU + writeMatrix; structural unchanged) → Task 1. ✓
- §5 testing (MatrixEditor, matrixCodec, pack, reconcile, urlKeys green) → Tasks 1–4. ✓
- §6 out-of-scope (overlay, CPU mirror) → not built. ✓
- §7 tunables (drag sensitivity, ≤5 threshold, 8-species density) → surfaced in Task 5 verify. ✓

**Placeholder scan:** no TBD/TODO; every code step shows real code. ✓

**Type consistency:** `resolveMatrix` (Task 1) consumed by gpu wiring (Task 1) ✓; `effectiveMatrix`/`onConfigChange`/`commit` names consistent across Tasks 2–3 ✓; `reconcileMatrix(prev,next)` signature matches `Diversion.reconcile` and the ConfigScreen call site (Task 4) ✓; matrix always flat row-major length `colors²` throughout ✓.

**One open item for the user:** Bias guard implemented as *defer* not *modal confirm* (see §1 note above).
