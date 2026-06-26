# Flow Field Palette Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Flow Field's hue-sweep coloring with a Palette Set — a viewer-edited set of `{color, alpha}` entries where each particle picks one at spawn and keeps it for life, producing coherent colored ribbons with no white-out.

**Architecture:** A new reusable `ui: 'colorList'` control in `SchemaForm` edits a `string[]` of 8-digit hex (`#rrggbbaa`) values. Flow Field's schema swaps its two hue sliders for that array; `flowField.ts` stores a palette index per particle and strokes with a precomputed `rgba()` string per entry (retiring the 360-hue cache from #11).

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest + @testing-library/react. URL codec already supports string arrays (#3).

## Global Constraints

- **Stack:** Vite + React 19 + TypeScript + Zod 4; custom `SchemaForm` + custom URL codec. No new deps.
- **Schema is the single source of truth** — one Zod field drives form + codec + `Config` type. `.meta({...})` chains after `.default(...)`.
- **UX invariants (MUST):** readability; hide nothing (no collapsed groups, show every live value); persistent inline help; sliders only when bounds defined; err toward more contrast.
- **Tests:** Vitest, co-located `*.test.ts(x)`. Anti-regression must-haves: codec round-trip + resilience, control-selection-from-schema, sim determinism.
- **WIP diversion:** Flow Field is unreleased — schema may change freely; no backward-compat for old `hueStart`/`hueRange` URLs.
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Commit messages terse, one line, **no trailers**.
- **Verify command:** `npx vitest run` (all tests), `npx tsc --noEmit` (types), `npm run build` (build).

---

### Task 1: `colorList` control (framework, additive)

Adds the repeatable color-list control and wires it into the form. Purely additive — no diversion touched yet, build stays green with the new `ui` recognized but unused.

**Files:**
- Modify: `src/framework/fieldMeta.ts:3` (add `'colorList'` to `FieldUi`)
- Create: `src/framework/controls/ColorList.tsx`
- Create: `src/framework/controls/ColorList.test.tsx`
- Modify: `src/framework/SchemaForm.tsx` (import + `controlFor` case)
- Modify: `src/framework/theme.css` (append color-list styles)

**Interfaces:**
- Produces: `ColorList` React component `{ value: string[]; onChange: (v: string[]) => void; meta: FieldMeta }`; helpers `splitColor(hex8) → { rgb: string; alpha: number }` and `joinColor(rgb: string, alphaPct: number) → string` (exported for tests).
- Consumes: `FieldMeta` from `./fieldMeta` (uses `meta.label`, `meta.help`, and `meta.min`/`meta.max` **as item-count bounds** for this `ui`).

- [ ] **Step 1: Write the failing helper + render tests**

Create `src/framework/controls/ColorList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ColorList, splitColor, joinColor } from './ColorList'
import type { FieldMeta } from '../fieldMeta'

const meta: FieldMeta = { ui: 'colorList', label: 'Colors', min: 1, max: 8 }

describe('splitColor / joinColor', () => {
  it('splits #rrggbbaa into rgb + alpha percent', () => {
    expect(splitColor('#1e63ff1f')).toEqual({ rgb: '#1e63ff', alpha: 12 })
    expect(splitColor('#ffffffff')).toEqual({ rgb: '#ffffff', alpha: 100 })
    expect(splitColor('#00000000')).toEqual({ rgb: '#000000', alpha: 0 })
  })
  it('joins rgb + alpha percent back into #rrggbbaa', () => {
    expect(joinColor('#1e63ff', 12)).toBe('#1e63ff1f')
    expect(joinColor('#ffffff', 100)).toBe('#ffffffff')
    expect(joinColor('#000000', 0)).toBe('#00000000')
  })
})

describe('ColorList', () => {
  it('renders one row per color', () => {
    render(<ColorList value={['#1e63ff1f', '#16d6ff1a']} onChange={vi.fn()} meta={meta} />)
    expect(screen.getAllByRole('slider')).toHaveLength(2) // one alpha slider per color
    expect(screen.getByText('2 colors')).toBeInTheDocument()
  })

  it('appends a new color when "Add color" is clicked', () => {
    const onChange = vi.fn()
    render(<ColorList value={['#1e63ff1f']} onChange={onChange} meta={meta} />)
    fireEvent.click(screen.getByRole('button', { name: /add color/i }))
    expect(onChange).toHaveBeenCalledWith(['#1e63ff1f', '#7df5cf1a'])
  })

  it('removes a color, and disables remove at the minimum', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ColorList value={['#1e63ff1f', '#16d6ff1a']} onChange={onChange} meta={meta} />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /remove color/i })[0])
    expect(onChange).toHaveBeenCalledWith(['#16d6ff1a'])
    rerender(<ColorList value={['#16d6ff1a']} onChange={onChange} meta={meta} />)
    expect(screen.getByRole('button', { name: /remove color/i })).toBeDisabled()
  })

  it('rewrites only the alpha byte when the alpha slider moves', () => {
    const onChange = vi.fn()
    render(<ColorList value={['#1e63ff1f']} onChange={onChange} meta={meta} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '50' } })
    expect(onChange).toHaveBeenCalledWith(['#1e63ff80']) // 50% -> 0x80, color preserved
  })

  it('rewrites only the color bytes when a valid hex is typed', () => {
    const onChange = vi.fn()
    render(<ColorList value={['#1e63ff1f']} onChange={onChange} meta={meta} />)
    const hex = screen.getByDisplayValue('#1e63ff')
    fireEvent.change(hex, { target: { value: '#ff0000' } })
    expect(onChange).toHaveBeenCalledWith(['#ff00001f']) // alpha 0x1f preserved
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/framework/controls/ColorList.test.tsx`
Expected: FAIL — `Cannot find module './ColorList'`.

- [ ] **Step 3: Add `'colorList'` to the `FieldUi` union**

In `src/framework/fieldMeta.ts` line 3:

```ts
export type FieldUi = 'slider' | 'number' | 'segmented' | 'toggle' | 'color' | 'colorList' | 'group'
```

(No change to `FieldMeta` — `min`/`max` already exist and are reused as item-count bounds for `colorList`.)

- [ ] **Step 4: Implement `ColorList.tsx`**

Create `src/framework/controls/ColorList.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { FieldMeta } from '../fieldMeta'

const HEX6 = /^#[0-9a-fA-F]{6}$/

/** "#rrggbbaa" -> { rgb: "#rrggbb", alpha: 0..100 } */
export function splitColor(hex8: string): { rgb: string; alpha: number } {
  return { rgb: hex8.slice(0, 7), alpha: Math.round((parseInt(hex8.slice(7, 9), 16) / 255) * 100) }
}

/** ("#rrggbb", 0..100) -> "#rrggbbaa" */
export function joinColor(rgb: string, alphaPct: number): string {
  const aa = Math.round((alphaPct / 100) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${rgb}${aa}`
}

function ColorRow({
  hex8,
  canRemove,
  onChange,
  onRemove,
}: {
  hex8: string
  canRemove: boolean
  onChange: (next: string) => void
  onRemove: () => void
}) {
  const { rgb, alpha } = splitColor(hex8)
  // local text state so typing a partial hex doesn't get clobbered by the controlled value
  const [text, setText] = useState(rgb)
  useEffect(() => setText(rgb), [rgb])

  const commitText = (t: string) => {
    setText(t)
    if (HEX6.test(t)) onChange(joinColor(t, alpha))
  }

  return (
    <div className="crow">
      <input type="color" value={rgb} onChange={(e) => onChange(joinColor(e.target.value, alpha))} />
      <input className="hex" value={text} onChange={(e) => commitText(e.target.value)} />
      <button className="rm" title="Remove color" disabled={!canRemove} onClick={onRemove}>
        ✕
      </button>
      <div className="arow">
        <span className="alab">α</span>
        <input
          type="range"
          min={0}
          max={100}
          value={alpha}
          onChange={(e) => onChange(joinColor(rgb, Number(e.target.value)))}
        />
        <span className="aval">{alpha}%</span>
      </div>
    </div>
  )
}

export function ColorList({
  value,
  onChange,
  meta,
}: {
  value: string[]
  onChange: (v: string[]) => void
  meta: FieldMeta
}) {
  const min = meta.min ?? 1
  const max = meta.max ?? 8
  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
        <span className="ctl-val">
          {value.length} {value.length === 1 ? 'color' : 'colors'}
        </span>
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
      <div className="clist">
        {value.map((hex8, i) => (
          <ColorRow
            key={i}
            hex8={hex8}
            canRemove={value.length > min}
            onChange={(next) => onChange(value.map((c, j) => (j === i ? next : c)))}
            onRemove={() => onChange(value.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      {value.length < max && (
        <button className="addc" onClick={() => onChange([...value, '#7df5cf1a'])}>
          + Add color
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Wire into `SchemaForm`**

In `src/framework/SchemaForm.tsx`, add the import after line 8:

```ts
import { ColorList } from './controls/ColorList'
```

In `controlFor`, add a case before `default:` (after the `'color'` case at line 39):

```ts
    case 'colorList':
      return ColorList as ControlComponent
```

- [ ] **Step 6: Append styles to `theme.css`**

Append to `src/framework/theme.css` (after the `/* color swatch */` block, ~line 314):

```css
/* color-list (repeatable colors) */
.clist {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.crow {
  display: grid;
  grid-template-columns: 30px 1fr 22px;
  grid-template-rows: auto auto;
  gap: 5px 8px;
  align-items: center;
  padding: 8px;
  background: #101016;
  border: 1px solid var(--line);
  border-radius: 7px;
}
.crow input[type='color'] {
  grid-column: 1;
  grid-row: 1 / 3;
  width: 30px;
  height: 46px;
  padding: 2px;
}
.crow .hex {
  grid-column: 2;
  grid-row: 1;
  background: var(--field);
  border: 1px solid var(--line-2);
  border-radius: 5px;
  color: var(--fg);
  font-family: inherit;
  font-size: 12px;
  padding: 5px 7px;
  width: 100%;
}
.crow .rm {
  grid-column: 3;
  grid-row: 1 / 3;
  width: 22px;
  height: 46px;
  color: #d98a8a;
  border-color: #3a2a2a;
  background: #171015;
  font-size: 13px;
  display: grid;
  place-items: center;
}
.crow .rm:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.arow {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  align-items: center;
  gap: 8px;
}
.arow .alab {
  font-size: 9px;
  color: var(--muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.arow input[type='range'] {
  flex: 1;
}
.arow .aval {
  font-size: 11px;
  color: var(--accent);
  min-width: 34px;
  text-align: right;
}
.addc {
  align-self: flex-start;
  color: var(--accent);
  border-color: #2a3a40;
  background: rgba(125, 245, 207, 0.06);
  padding: 7px 12px;
  font-size: 11px;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 7: Run tests + types to verify they pass**

Run: `npx vitest run src/framework/controls/ColorList.test.tsx && npx tsc --noEmit`
Expected: PASS (all ColorList tests green, no type errors).

- [ ] **Step 8: Commit**

```bash
git add src/framework/controls/ColorList.tsx src/framework/controls/ColorList.test.tsx \
        src/framework/SchemaForm.tsx src/framework/fieldMeta.ts src/framework/theme.css
git commit -m "SchemaForm: colorList control for repeatable color+alpha sets (#23)"
```

---

### Task 2: Flow Field schema + sim use the palette set

Swaps Flow Field's hue fields for the `colors` array and rewires `flowField.ts` to stroke with per-entry `rgba()` strings, retiring the hue cache.

**Files:**
- Modify: `src/diversions/flow-field/schema.ts:19-27` (palette group)
- Modify: `src/diversions/flow-field/flowField.ts` (state, color, particle)
- Modify: `src/diversions/flow-field/flowField.test.ts` (replace hue-cache tests)
- Modify: `src/framework/urlCodec.test.ts` (add palette-colors round-trip)

**Interfaces:**
- Consumes: `FlowFieldConfig.palette.colors: string[]` (8-digit hex); `ColorList` control (Task 1) renders it.
- Produces: `hexToRgba(hex8: string) → string` (exported from `flowField.ts`); `FlowState.styles: string[]` replaces `FlowState.style`; `Particle.ci: number`. `makeHueStyleCache`, `STROKE_SAT`, `STROKE_LIGHT` are **removed**.

- [ ] **Step 1: Update the schema**

In `src/diversions/flow-field/schema.ts`, replace the `palette` group (lines 19-27):

```ts
  palette: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a12')
      .meta({ ui: 'color', label: 'Background' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#1e63ff1f', '#16d6ff1a', '#ff3ea51a', '#ffffff14'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              help: 'Each particle picks one color at random when it spawns and keeps it for '
                  + 'life. Low alpha lets overlapping ribbons build up into richer color '
                  + 'instead of clipping to white.' }),
  }).default({ background: '#0a0a12', colors: ['#1e63ff1f', '#16d6ff1a', '#ff3ea51a', '#ffffff14'] })
    .meta({ ui: 'group', label: 'Palette' }),
```

- [ ] **Step 2: Write the failing `flowField` tests**

Replace the entire contents of `src/diversions/flow-field/flowField.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createFlowState, hexToRgba } from './flowField'
import { flowFieldSchema } from './schema'

const base = flowFieldSchema.parse({})

describe('hexToRgba', () => {
  it('converts #rrggbbaa to an rgba() string (alpha rounded to 3 dp)', () => {
    expect(hexToRgba('#1e63ff1f')).toBe('rgba(30, 99, 255, 0.122)')
    expect(hexToRgba('#102030ff')).toBe('rgba(16, 32, 48, 1)')
    expect(hexToRgba('#00000000')).toBe('rgba(0, 0, 0, 0)')
  })
})

describe('createFlowState palette', () => {
  it('precomputes one rgba style per palette color', () => {
    const s = createFlowState({ ...base, particles: 20 }, 800, 600)
    expect(s.styles).toHaveLength(base.palette.colors.length)
    expect(s.styles[0]).toBe(hexToRgba(base.palette.colors[0]))
  })

  it('assigns every particle a color index within the palette range', () => {
    const n = base.palette.colors.length
    const s = createFlowState({ ...base, particles: 200 }, 800, 600)
    for (const p of s.particles) {
      expect(p.ci).toBeGreaterThanOrEqual(0)
      expect(p.ci).toBeLessThan(n)
      expect(Number.isInteger(p.ci)).toBe(true)
    }
  })
})

describe('createFlowState determinism', () => {
  it('produces identical particle layouts for the same seed', () => {
    const a = createFlowState({ ...base, particles: 50, seed: 777 }, 800, 600)
    const b = createFlowState({ ...base, particles: 50, seed: 777 }, 800, 600)
    expect(a.particles).toEqual(b.particles)
  })

  it('produces different layouts for different seeds', () => {
    const a = createFlowState({ ...base, particles: 50, seed: 1 }, 800, 600)
    const b = createFlowState({ ...base, particles: 50, seed: 2 }, 800, 600)
    expect(a.particles).not.toEqual(b.particles)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/diversions/flow-field/flowField.test.ts`
Expected: FAIL — `hexToRgba` is not exported; `s.styles` undefined; `p.ci` undefined.

- [ ] **Step 4: Rewrite `flowField.ts`**

Apply these edits to `src/diversions/flow-field/flowField.ts`:

Replace the `Particle` interface and the stroke-constant comment (lines 4-13):

```ts
interface Particle {
  x: number
  y: number
  age: number
  life: number
  ci: number // index into the palette; chosen at spawn, kept for life
}

/** "#rrggbbaa" -> "rgba(r, g, b, a)" (alpha rounded to 3 dp). */
export function hexToRgba(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const a = Math.round((parseInt(hex.slice(7, 9), 16) / 255) * 1000) / 1000
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
```

Replace `FlowState` (lines 15-23) — swap `style` for `styles`:

```ts
export interface FlowState {
  particles: Particle[]
  noise: (x: number, y: number) => number
  rng: () => number // seeded — keeps respawns deterministic per seed
  styles: string[] // one precomputed rgba() per palette color — see hexToRgba
  cfg: FlowFieldConfig
  w: number
  h: number
}
```

Delete `makeHueStyleCache` entirely (the export + its doc comment, lines 37-49).

Replace `createFlowState` (lines 51-64):

```ts
export function createFlowState(cfg: FlowFieldConfig, w: number, h: number): FlowState {
  const noise = makeNoise2D(cfg.seed)
  const rng = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0)
  const styles = cfg.palette.colors.map(hexToRgba)
  const n = cfg.palette.colors.length
  const particles: Particle[] = Array.from({ length: cfg.particles }, () => ({
    x: rng() * w,
    y: rng() * h,
    age: rng() * MAX_LIFE, // stagger initial ages so respawns don't pulse
    life: randomLife(rng),
    ci: Math.floor(rng() * n), // pick a palette color for this particle's life
  }))
  return { particles, noise, rng, styles, cfg, w, h }
}
```

In `stepFlow`, change the destructure (line 67) from `style` to `styles`:

```ts
  const { particles, noise, rng, styles, cfg, w, h } = state
```

In the respawn block (after line 85, `p.life = randomLife(rng)`), reassign the color:

```ts
      p.ci = Math.floor(rng() * styles.length)
```

Replace the hue/stroke lines (lines 92-93):

```ts
    // styles.length is >=1 (schema min); modulo keeps a stale index valid if the set shrank
    ctx.strokeStyle = styles[p.ci % styles.length]
```

- [ ] **Step 5: Add the codec round-trip test**

In `src/framework/urlCodec.test.ts`, add a test asserting the palette color array round-trips. Use the existing test's import of `flowFieldSchema` if present; otherwise add a focused inline-schema test:

```ts
import { z } from 'zod'
import { encodeConfig, decodeConfig } from './urlCodec'

describe('urlCodec — palette colors (8-digit hex array)', () => {
  const schema = z.object({
    palette: z.object({
      colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
        .default(['#1e63ff1f', '#16d6ff1a']),
    }).default({ colors: ['#1e63ff1f', '#16d6ff1a'] }),
  })

  it('round-trips a custom color set unchanged', () => {
    const cfg = schema.parse({ palette: { colors: ['#ff000080', '#00ff00ff', '#0000ff10'] } })
    const decoded = decodeConfig(schema, encodeConfig(schema, cfg))
    expect(decoded.palette.colors).toEqual(['#ff000080', '#00ff00ff', '#0000ff10'])
  })

  it('falls back to defaults when an element is malformed (safeParse, never throws)', () => {
    const params = new URLSearchParams()
    params.set('palette.colors', 'not-a-hex,#00ff00ff')
    const decoded = decodeConfig(schema, params)
    expect(decoded.palette.colors).toEqual(['#1e63ff1f', '#16d6ff1a']) // back to defaults
  })
})
```

- [ ] **Step 6: Run the full suite + types + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS — all tests green (old `makeHueStyleCache` tests gone), no type errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/diversions/flow-field/schema.ts src/diversions/flow-field/flowField.ts \
        src/diversions/flow-field/flowField.test.ts src/framework/urlCodec.test.ts
git commit -m "Flow Field: Palette Set coloring — per-particle color+alpha (#23)"
```

---

### Task 3: Chrome verification (manual)

Not a code task — a verification gate. Start the dev server and confirm the feature looks and behaves right in Chrome (per project convention; chrome-devtools MCP, never a built-in preview).

- [ ] **Step 1: Start the dev server** (pinned to port 5180)

```bash
npm run dev
```

- [ ] **Step 2: Open the Flow Field config screen in Chrome**

URL: `http://localhost:5180/d/flow-field?mute=1`

- [ ] **Step 3: Verify the color subpanel**
  - Palette group shows Background + a Colors list of 4 rows (swatch · hex · α slider/%).
  - "Add color" appends a row; appears disabled at 8 colors.
  - Remove (✕) drops a row; disabled when one color remains.
  - Editing a swatch/hex changes only the color; the α slider changes only alpha %.

- [ ] **Step 4: Verify the animation**
  - Open the animation (play). Particles draw ribbons in the chosen colors, each particle a single coherent color.
  - At low alpha (~8–12%) with `lighter` blend, overlaps build into rich color with **no white-out** at the bright spines.
  - Flip Blend → `normal` and `screen`; confirm sensible layered/translucent looks.

- [ ] **Step 5: Verify the share link**
  - Edit the palette, copy the URL, open in a fresh tab — the same custom set loads (codec round-trip live).

## Self-Review

**Spec coverage:**
- Schema `colors: string[]` of `#rrggbbaa`, min 1 / max 8, defaults → Task 2 Step 1. ✅
- Per-particle index, kept for life, reassigned on respawn → Task 2 Step 4. ✅
- Per-entry `rgba` precompute, hue cache retired → Task 2 Step 4. ✅
- `ui: 'colorList'` control (vertical rows, swatch/hex/α, add/remove, min-1/max-8) → Task 1. ✅
- Alpha edited as 0–100%, stored as `aa` byte → `splitColor`/`joinColor`, Task 1. ✅
- White-out tamed by low alpha (no separate mechanism) → verified Task 3 Step 4. ✅
- Codec round-trip + malformed fallback → Task 2 Step 5. ✅
- UX invariants (visible set, inline help, bounded α slider) → Task 1 component + schema help. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `splitColor`/`joinColor`/`ColorList` (Task 1) match their test calls; `hexToRgba`/`FlowState.styles`/`Particle.ci` (Task 2) match the rewritten test; `FieldUi` includes `'colorList'` before `SchemaForm` references it. ✅
