# Ablation Image Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the viewer pick an image off their own disk and have Ablation peel it, quantized to a chosen number of colours.

**Architecture:** The erosion sim is already source-agnostic — `front.ts` reads `field.idx[cell]` and never asks where the indices came from. So this swaps the *sampler* inside `newField()` and changes nothing downstream. Pixels live in a module-level store keyed by an id (the config holds the id, never the pixels), backed by one `localStorage` slot so a reload keeps the picture. Two new framework pieces make it possible: a `ui:'image'` control and a `local` meta flag that keeps the id out of shared links.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest + @testing-library/react, Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-08-15-ablation-image-import.md`

## Global Constraints

- **Determinism is a test keystone.** Any RNG in the quantizer must be the seeded `mulberry32(cfg.seed)` from `framework/rng.ts`. Never `Math.random`.
- **`erasableSyntaxOnly` is on** — `enum` is banned (TS1294). Use `as const` objects or union types.
- **Every schema field needs `.meta({ ui, label })`** or `fields()` throws. Non-obvious fields need persistent `help` (UX invariant #3).
- **Sliders need `min`/`max`** (UX invariant #4).
- **Colour controls live under section `'Color'`; the power-user tail under `'Advanced'`** (schema UX canon).
- **`.meta({...})` chains AFTER `.default(...)`** in Zod 4.
- **Commit style:** terse one-line subject, no `Co-Authored-By` trailer, no emoji.
- **Every task ends green:** `npx vitest run` and `npx tsc -b --noEmit` both clean before the commit.

---

### Task 1: OKLab conversion in `framework/color.ts`

Perceptual clustering needs OKLab. `color.ts` is the canonical home for colour maths; the quantizer stays free of conversion code.

**Files:**
- Modify: `src/framework/color.ts` (append; keep existing exports untouched)
- Test: `src/framework/color.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export interface Lab { L: number; a: number; b: number }`
  - `export function srgbToOklab(r: number, g: number, b: number): Lab` — inputs are **0–255** channels (matches `parseHex6`), output `L` in 0..1
  - `export function oklabToHex(lab: Lab): string` — returns `"#rrggbb"`, channels clamped to 0–255

- [ ] **Step 1: Write the failing tests**

```ts
// src/framework/color.test.ts — append
import { srgbToOklab, oklabToHex } from './color'

describe('OKLab (#278)', () => {
  it('black and white sit at the ends of L', () => {
    expect(srgbToOklab(0, 0, 0).L).toBeCloseTo(0, 3)
    expect(srgbToOklab(255, 255, 255).L).toBeCloseTo(1, 3)
  })

  it('greys are achromatic', () => {
    const g = srgbToOklab(128, 128, 128)
    expect(g.a).toBeCloseTo(0, 3)
    expect(g.b).toBeCloseTo(0, 3)
  })

  it('round-trips a saturated colour to within one channel step', () => {
    for (const hex of ['#1b4f6b', '#f2e2b0', '#ff0000', '#00ff00', '#0000ff']) {
      const n = parseInt(hex.slice(1), 16)
      const lab = srgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255)
      expect(oklabToHex(lab)).toBe(hex)
    }
  })

  it('clamps out-of-gamut Lab back into sRGB rather than emitting NaN', () => {
    const hex = oklabToHex({ L: 1.4, a: 0.3, b: -0.3 })
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/framework/color.test.ts`
Expected: FAIL — `srgbToOklab is not a function`

- [ ] **Step 3: Implement**

```ts
// src/framework/color.ts — append

/** OKLab: a perceptually uniform space. Clustering photo pixels in sRGB groups
 *  by voltage rather than by appearance — two colours a viewer calls "the same
 *  green" can sit further apart in sRGB than one of them sits from a grey. */
export interface Lab { L: number; a: number; b: number }

function toLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function fromLinear(v: number): number {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(s * 255)))
}

/** 0-255 sRGB channels → OKLab (Björn Ottosson's matrices). L lands in 0..1. */
export function srgbToOklab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/** OKLab → "#rrggbb". Out-of-gamut input is clamped per channel, never NaN. */
export function oklabToHex({ L, a, b }: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const g = fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const bb = fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  return `#${((r << 16) | (g << 8) | bb).toString(16).padStart(6, '0')}`
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/framework/color.test.ts && npx tsc -b --noEmit`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add src/framework/color.ts src/framework/color.test.ts
git commit -m "framework: OKLab conversion for perceptual colour grouping"
```

---

### Task 2: `local` meta flag — keep a field out of every link

**Files:**
- Modify: `src/framework/fieldMeta.ts` (add `'image'` to `FieldUi`, `local?` to `FieldMeta`)
- Modify: `src/framework/urlCodec.ts:191-222` (add `localKeys`, union it into `encodeConfig`'s skip set)
- Test: `src/framework/urlCodec.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: nothing
- Produces: `export function localKeys(schema: ZodObject<any>): Set<string>`

`randomizeOnFreshLoad` cannot be reused here: it also drives `applyFreshLoadRandomization`, which would try to roll a random **string**. The two concepts differ at `includePinned` — a seed IS emitted for a pinned link, an image id must never be, because the recipient has no such file.

**Do NOT touch `codecSweep.test.ts`.** It builds its expected keys from leaves carrying a value *in defaults*, and `image` is `.optional()` with no default, so it is already excluded — same as a Custom-only matrix override.

- [ ] **Step 1: Write the failing tests**

```ts
// src/framework/urlCodec.test.ts — append
import { localKeys } from './urlCodec'

describe('local fields never reach a link (#278)', () => {
  const localSchema = z.object({
    size: z.number().default(4).meta({ ui: 'number', label: 'Size' }),
    seed: z.number().default(1)
      .meta({ ui: 'number', label: 'Seed', randomizeOnFreshLoad: true }),
    image: z.string().optional().meta({ ui: 'image', label: 'Image', local: true }),
  })

  it('localKeys reports the flagged field', () => {
    expect(localKeys(localSchema).has('image')).toBe(true)
    expect(localKeys(localSchema).has('seed')).toBe(false)
  })

  it('encodeConfig omits a SET local field', () => {
    const cfg = { ...localSchema.parse({}), image: 'img_abc123' }
    expect(encodeConfig(localSchema, cfg as never).has('image')).toBe(false)
  })

  it('includePinned emits the seed but STILL omits the local field', () => {
    const cfg = { ...localSchema.parse({}), image: 'img_abc123' }
    const sp = encodeConfig(localSchema, cfg as never, { includePinned: true })
    expect(sp.has('seed')).toBe(true)
    expect(sp.has('image')).toBe(false)
  })

  it('a link with no image decodes to a config with none', () => {
    const round = decodeConfig(localSchema, encodeConfig(localSchema, localSchema.parse({}) as never))
    expect(round.image).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/framework/urlCodec.test.ts`
Expected: FAIL — `localKeys is not a function`

- [ ] **Step 3: Implement**

```ts
// src/framework/fieldMeta.ts
export type FieldUi = 'slider' | 'number' | 'segmented' | 'select' | 'toggle' | 'color' | 'colorList' | 'group' | 'matrix' | 'image' | 'hidden'

// in interface FieldMeta, below randomizeOnFreshLoad:
  local?: boolean // value lives only in THIS browser (an uploaded image id) — never encoded into a link, pinned or not
```

```ts
// src/framework/urlCodec.ts — after freshLoadKeys

/** Encoded URL keys of fields flagged `local`. Distinct from pin-only: a pin-only
 *  field (the seed) IS emitted when `includePinned` is set, because pinning it
 *  reproduces the world. A local field is an id for pixels held in THIS browser,
 *  so emitting it — pinned or not — would encode a dangling reference. */
export function localKeys(schema: ZodObject<any>): Set<string> {
  const { encode } = buildUrlKeyMap(schema)
  const keys = new Set<string>()
  for (const [name, field] of Object.entries(schema.shape)) {
    if (readMeta(field as ZodType)?.local) keys.add(encode.get(name) ?? name)
  }
  return keys
}
```

```ts
// src/framework/urlCodec.ts — replace the skip line in encodeConfig (was line 214)
  const skip = localKeys(schema)
  if (!opts.includePinned) for (const k of freshLoadKeys(schema)) skip.add(k)
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/framework && npx tsc -b --noEmit`
Expected: PASS — including the untouched `codecSweep` and `seedContract` suites

- [ ] **Step 5: Commit**

```bash
git add src/framework/fieldMeta.ts src/framework/urlCodec.ts src/framework/urlCodec.test.ts
git commit -m "framework: local meta flag keeps browser-only values out of links"
```

---

### Task 3: `imageStore` — module cache + one localStorage slot

**Files:**
- Create: `src/framework/imageStore.ts`
- Test: `src/framework/imageStore.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export interface StoredImage { id: string; dataUrl: string; width: number; height: number; pixels: Uint8ClampedArray }`
  - `export function putImage(img: StoredImage): void`
  - `export function getImage(id: string | undefined): StoredImage | null`
  - `export function clearImage(): void`
  - `export function storeVersion(): number` — monotonic, bumps on every put/clear/rehydrate
  - `export function rehydrate(): void` — reads the localStorage slot; fire-and-forget, never throws
  - `export function decodeToPixels(dataUrl: string): Promise<StoredImage>` — browser-only; used by the control and by `rehydrate`

One slot only. Keeping a library of uploads is out of scope and unbounded.

`pixels` is RGBA at `width*height*4`, the shape `ctx.getImageData().data` gives.

- [ ] **Step 1: Write the failing tests**

```ts
// src/framework/imageStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { putImage, getImage, clearImage, storeVersion, rehydrate, SLOT } from './imageStore'

const img = (id: string) => ({
  id, dataUrl: 'data:image/png;base64,AA', width: 2, height: 1,
  pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
})

describe('imageStore (#278)', () => {
  beforeEach(() => { localStorage.clear(); clearImage() })

  it('round-trips a put', () => {
    putImage(img('a'))
    expect(getImage('a')?.width).toBe(2)
  })

  it('holds ONE slot — a second put evicts the first', () => {
    putImage(img('a'))
    putImage(img('b'))
    expect(getImage('a')).toBeNull()
    expect(getImage('b')).not.toBeNull()
  })

  it('getImage(undefined) is null, not a throw', () => {
    expect(getImage(undefined)).toBeNull()
  })

  it('version advances on put and on clear', () => {
    const v0 = storeVersion()
    putImage(img('a'))
    const v1 = storeVersion()
    expect(v1).toBeGreaterThan(v0)
    clearImage()
    expect(storeVersion()).toBeGreaterThan(v1)
  })

  it('a put that exceeds quota still serves from memory', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(() => putImage(img('a'))).not.toThrow()
    expect(getImage('a')).not.toBeNull()
    spy.mockRestore()
  })

  it('rehydrate survives corrupt JSON', () => {
    localStorage.setItem(SLOT, '{not json')
    expect(() => rehydrate()).not.toThrow()
    expect(getImage('a')).toBeNull()
  })

  it('rehydrate ignores a stale schema version', () => {
    localStorage.setItem(SLOT, JSON.stringify({ v: 0, id: 'a', dataUrl: 'data:,' }))
    expect(() => rehydrate()).not.toThrow()
    expect(getImage('a')).toBeNull()
  })

  it('rehydrate survives localStorage itself throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => { throw new Error('SecurityError') })
    expect(() => rehydrate()).not.toThrow()
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/framework/imageStore.test.ts`
Expected: FAIL — cannot resolve `./imageStore`

- [ ] **Step 3: Implement**

```ts
// src/framework/imageStore.ts

// Pixels for an uploaded picture. They live HERE, not in the config: a config
// travels through the URL codec and through `update()` diffing on every slider
// drag, and neither wants a megabyte of base64. The config holds an id.
//
// Every localStorage path is fail-soft. A corrupt slot, a stale schema version,
// a quota rejection, and a browser that throws on `localStorage` access at all
// (Safari private mode) must each degrade to "no image", never to a thrown
// error inside a render or a sync framework hook.

export const SLOT = 'ablation.image.v1'
const SCHEMA = 1
/** Long edge the stored copy is capped at. The sampler only ever reduces to
 *  cols×rows, which tops out near 250×150 at cellSize 2, so this is generous. */
export const MAX_EDGE = 512

export interface StoredImage {
  id: string
  dataUrl: string
  width: number
  height: number
  /** RGBA, width*height*4 — the shape getImageData().data gives. */
  pixels: Uint8ClampedArray
}

let current: StoredImage | null = null
let version = 1

export function storeVersion(): number {
  return version
}

export function getImage(id: string | undefined): StoredImage | null {
  if (!id || !current || current.id !== id) return null
  return current
}

export function putImage(img: StoredImage): void {
  current = img
  version++
  try {
    localStorage.setItem(SLOT, JSON.stringify({ v: SCHEMA, id: img.id, dataUrl: img.dataUrl }))
  } catch {
    // Quota, private mode, disabled storage — the in-memory copy still works for
    // this session. Losing it on reload beats losing the upload outright.
  }
}

export function clearImage(): void {
  current = null
  version++
  try {
    localStorage.removeItem(SLOT)
  } catch { /* see putImage */ }
}

/** Decode a data URL to pixels. Browser-only — jsdom has no real image decode,
 *  so unit tests exercise the store through putImage instead. */
export function decodeToPixels(dataUrl: string): Promise<StoredImage> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onerror = () => reject(new Error('decode failed'))
    el.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(el.width, el.height))
      const width = Math.max(1, Math.round(el.width * scale))
      const height = Math.max(1, Math.round(el.height * scale))
      const cv = document.createElement('canvas')
      cv.width = width
      cv.height = height
      const c2d = cv.getContext('2d')
      if (!c2d) return reject(new Error('no 2d context'))
      c2d.drawImage(el, 0, 0, width, height)
      resolve({
        id: `img_${Math.random().toString(36).slice(2, 10)}`,
        dataUrl: cv.toDataURL('image/png'),
        width,
        height,
        pixels: c2d.getImageData(0, 0, width, height).data,
      })
    }
    el.src = dataUrl
  })
}

/** Read the slot back after a reload. Fire-and-forget: the decode is async, so
 *  callers watch `storeVersion()` rather than awaiting this. */
export function rehydrate(): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SLOT)
  } catch {
    return // storage unavailable entirely
  }
  if (!raw) return
  let saved: { v?: number; id?: string; dataUrl?: string }
  try {
    saved = JSON.parse(raw)
  } catch {
    return // corrupt — leave the slot alone; the next put overwrites it
  }
  if (saved.v !== SCHEMA || !saved.id || !saved.dataUrl) return
  decodeToPixels(saved.dataUrl)
    .then((img) => putImage({ ...img, id: saved.id! }))
    .catch(() => { /* undecodable payload — stay on the procedural picture */ })
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/framework/imageStore.test.ts && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/framework/imageStore.ts src/framework/imageStore.test.ts
git commit -m "framework: image store with one fail-soft localStorage slot"
```

---

### Task 4: `ImagePicker` control + `SchemaForm` wiring

**Files:**
- Create: `src/framework/controls/ImagePicker.tsx`
- Create: `src/framework/controls/ImagePicker.test.tsx`
- Modify: `src/framework/SchemaForm.tsx:13` (import) and `:32-51` (`controlFor` case)

**Interfaces:**
- Consumes: `putImage`, `clearImage`, `getImage`, `decodeToPixels` (Task 3)
- Produces: `export function ImagePicker({ value, onChange, meta }: { value: string | undefined; onChange: (v: string | undefined) => void; meta: FieldMeta })`

Follows `Swatch.tsx`'s markup contract exactly: `.ctl` > `.ctl-top` (`.ctl-name` + `.ctl-val`), the input, then `.ctl-help`.

`onChange(undefined)` on clear — **not** `onChange('')`. An empty string is a value the codec would try to flatten; `undefined` omits the key, which is the same rule the matrix override follows.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/framework/controls/ImagePicker.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImagePicker } from './ImagePicker'
import { putImage, clearImage } from '../imageStore'

const meta = { ui: 'image' as const, label: 'Image', help: 'Pick a picture.' }

describe('ImagePicker (#278)', () => {
  beforeEach(() => { clearImage() })

  it('renders the label and help', () => {
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={meta} />)
    expect(screen.getByText('Image')).toBeTruthy()
    expect(screen.getByText('Pick a picture.')).toBeTruthy()
  })

  it('says so when nothing is picked', () => {
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={meta} />)
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('shows a thumbnail once the store holds the id', () => {
    putImage({ id: 'a', dataUrl: 'data:image/png;base64,AA', width: 2, height: 1,
               pixels: new Uint8ClampedArray(8) })
    render(<ImagePicker value="a" onChange={vi.fn()} meta={meta} />)
    expect(screen.getByAltText('selected image').getAttribute('src'))
      .toBe('data:image/png;base64,AA')
  })

  it('clear calls onChange(undefined) and empties the store', () => {
    putImage({ id: 'a', dataUrl: 'data:image/png;base64,AA', width: 2, height: 1,
               pixels: new Uint8ClampedArray(8) })
    const onChange = vi.fn()
    render(<ImagePicker value="a" onChange={onChange} meta={meta} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('offers no clear button when nothing is picked', () => {
    render(<ImagePicker value={undefined} onChange={vi.fn()} meta={meta} />)
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/framework/controls/ImagePicker.test.tsx`
Expected: FAIL — cannot resolve `./ImagePicker`

- [ ] **Step 3: Implement the control**

```tsx
// src/framework/controls/ImagePicker.tsx
import { useState } from 'react'
import type { FieldMeta } from '../fieldMeta'
import { putImage, clearImage, getImage, decodeToPixels } from '../imageStore'

// The first file input in the codebase. It stores PIXELS in the module-level
// image store and hands the field an ID, so the config stays small enough to
// diff on every slider drag and to hand to the URL codec.
export function ImagePicker({
  value,
  onChange,
  meta,
}: {
  value: string | undefined
  onChange: (v: string | undefined) => void
  meta: FieldMeta
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const held = getImage(value)

  const pick = (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    const reader = new FileReader()
    reader.onerror = () => { setBusy(false); setError('Could not read that file.') }
    reader.onload = () => {
      decodeToPixels(String(reader.result))
        .then((img) => { putImage(img); onChange(img.id) })
        .catch(() => setError('Could not decode that image.'))
        .finally(() => setBusy(false))
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
        <span className="ctl-val">{busy ? 'reading…' : held ? `${held.width}×${held.height}` : 'none'}</span>
      </div>
      {held && <img className="ctl-thumb" src={held.dataUrl} alt="selected image" />}
      <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
      {value && (
        <button type="button" onClick={() => { clearImage(); onChange(undefined) }}>
          Clear image
        </button>
      )}
      {error && <div className="ctl-help">{error}</div>}
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Wire it into `SchemaForm`**

```tsx
// src/framework/SchemaForm.tsx — add to the imports beside MatrixEditor
import { ImagePicker } from './controls/ImagePicker'

// src/framework/SchemaForm.tsx — add to controlFor's switch, before `default:`
    case 'image':
      return ImagePicker as ControlComponent
```

- [ ] **Step 5: Add the thumbnail style**

```css
/* src/framework/theme.css — append */
.ctl-thumb {
  display: block;
  max-width: 100%;
  max-height: 120px;
  margin: 0.4rem 0;
  border-radius: 4px;
  image-rendering: auto;
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/framework && npx tsc -b --noEmit`
Expected: PASS — `SchemaForm.test.tsx` still green

- [ ] **Step 7: Commit**

```bash
git add src/framework/controls/ImagePicker.tsx src/framework/controls/ImagePicker.test.tsx src/framework/SchemaForm.tsx src/framework/theme.css
git commit -m "framework: ui:'image' file-picker control"
```

---

### Task 5: The quantizer

**Files:**
- Create: `src/diversions/ablation/quantize.ts`
- Test: `src/diversions/ablation/quantize.test.ts`

**Interfaces:**
- Consumes: `srgbToOklab`, `oklabToHex`, `type Lab` (Task 1); `StoredImage` (Task 3); `mulberry32` from `../../framework/rng`
- Produces:
  - `export interface Quantized { idx: Uint8Array; palette: string[] }`
  - `export function quantize(img: { width: number; height: number; pixels: Uint8ClampedArray }, cols: number, rows: number, colors: number, seed: number): Quantized`

Pipeline: box-downsample to `cols×rows` → OKLab → k-means++ (seeded) → contrast-stretch the centroid lightness → emit indices + hex list.

**The stretch is what makes `colors: 2` return black and white.** Raw k-means on a photo at k=2 returns two *tinted* centroids (a seascape gives roughly `#1a2430` / `#d8cfc0`). Normalising centroid `L` across its observed range so the darkest lands at 0 and the lightest at 1 — hue and chroma untouched — makes the control mean what it says and serves UX invariant #5.

- [ ] **Step 1: Write the failing tests**

```ts
// src/diversions/ablation/quantize.test.ts
import { describe, it, expect } from 'vitest'
import { quantize } from './quantize'

/** A w×h image; `at(x,y)` returns [r,g,b]. */
function make(w: number, h: number, at: (x: number, y: number) => [number, number, number]) {
  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = at(x, y)
      const i = (y * w + x) * 4
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255
    }
  }
  return { width: w, height: h, pixels }
}

const halves = make(64, 64, (x) => (x < 32 ? [10, 20, 30] : [220, 210, 200]))

describe('quantize (#278)', () => {
  it('is deterministic for a fixed seed', () => {
    const a = quantize(halves, 16, 16, 4, 7)
    const b = quantize(halves, 16, 16, 4, 7)
    expect(Array.from(a.idx)).toEqual(Array.from(b.idx))
    expect(a.palette).toEqual(b.palette)
  })

  it('emits exactly cols*rows indices, all in range', () => {
    const q = quantize(halves, 12, 9, 5, 3)
    expect(q.idx.length).toBe(108)
    for (const v of q.idx) expect(v).toBeLessThan(5)
  })

  it('emits one palette entry per requested colour', () => {
    expect(quantize(halves, 16, 16, 6, 1).palette).toHaveLength(6)
    expect(quantize(halves, 16, 16, 2, 1).palette).toHaveLength(2)
  })

  it('at 2 colours a two-tone image comes back black and white', () => {
    const { palette } = quantize(halves, 16, 16, 2, 1)
    const lum = palette.map((h) => {
      const n = parseInt(h.slice(1), 16)
      return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3
    }).sort((a, b) => a - b)
    expect(lum[0]).toBeLessThan(24)
    expect(lum[1]).toBeGreaterThan(231)
  })

  it('groups like with like — the left half shares an index, the right another', () => {
    const q = quantize(halves, 16, 16, 2, 1)
    const left = q.idx[16 * 8 + 2]
    const right = q.idx[16 * 8 + 13]
    expect(left).not.toBe(right)
    for (let row = 0; row < 16; row++) {
      expect(q.idx[row * 16 + 2]).toBe(left)
      expect(q.idx[row * 16 + 13]).toBe(right)
    }
  })

  it('box-downsamples rather than point-sampling — a 1px stripe still tints its cell', () => {
    // Every 8th column is white on black. Point-sampling would miss most stripes.
    const striped = make(64, 8, (x) => (x % 8 === 0 ? [255, 255, 255] : [0, 0, 0]))
    const q = quantize(striped, 8, 1, 2, 1)
    expect(new Set(Array.from(q.idx)).size).toBe(1) // every cell averages identically
  })

  it('survives more colours than the image contains', () => {
    const flat = make(8, 8, () => [128, 128, 128])
    const q = quantize(flat, 4, 4, 8, 1)
    expect(q.palette).toHaveLength(8)
    expect(q.idx.length).toBe(16)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/diversions/ablation/quantize.test.ts`
Expected: FAIL — cannot resolve `./quantize`

- [ ] **Step 3: Implement**

```ts
import { srgbToOklab, oklabToHex, type Lab } from '../../framework/color'
import { mulberry32 } from '../../framework/rng'

// Turning a photograph into the same thing Ablation already eats: one palette
// INDEX per cell, plus the colours those indices mean.
//
// Clustering happens in OKLab, not sRGB — "like is grouped with like" is a
// statement about appearance, and sRGB distance does not measure appearance.

export interface Quantized {
  /** cols*rows palette indices. */
  idx: Uint8Array
  /** `colors` hex strings; idx[i] indexes this. */
  palette: string[]
}

const ITERATIONS = 15

/** Average every source pixel falling inside a cell. A hard reduction — a photo
 *  down to ~200 cells — so point-sampling would alias badly and drop any feature
 *  thinner than a cell. Averaging keeps a one-pixel stripe as a tint. */
function downsample(
  img: { width: number; height: number; pixels: Uint8ClampedArray },
  cols: number,
  rows: number,
): Lab[] {
  const out: Lab[] = new Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor((row * img.height) / rows)
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * img.height) / rows))
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor((col * img.width) / cols)
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * img.width) / cols))
      let r = 0, g = 0, b = 0, n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * img.width + x) * 4
          r += img.pixels[i]; g += img.pixels[i + 1]; b += img.pixels[i + 2]
          n++
        }
      }
      out[row * cols + col] = srgbToOklab(r / n, g / n, b / n)
    }
  }
  return out
}

function dist2(p: Lab, q: Lab): number {
  const dL = p.L - q.L, da = p.a - q.a, db = p.b - q.b
  return dL * dL + da * da + db * db
}

/** k-means++ seeding: pick the first centre at random, then bias each subsequent
 *  pick toward points far from everything chosen so far. Uniform-random seeding
 *  regularly lands two centres inside one dominant mass and leaves a whole
 *  region of the image unrepresented. */
function seedCentres(pts: Lab[], k: number, rand: () => number): Lab[] {
  const centres: Lab[] = [pts[Math.floor(rand() * pts.length)]]
  const best = new Float64Array(pts.length).fill(Infinity)
  while (centres.length < k) {
    let total = 0
    const last = centres[centres.length - 1]
    for (let i = 0; i < pts.length; i++) {
      const d = dist2(pts[i], last)
      if (d < best[i]) best[i] = d
      total += best[i]
    }
    // A flat image has zero spread, so every candidate is distance 0 and the
    // roulette below never advances. Duplicate a point instead of looping forever.
    if (total <= 0) { centres.push(pts[Math.floor(rand() * pts.length)]); continue }
    let target = rand() * total
    let pick = pts.length - 1
    for (let i = 0; i < pts.length; i++) {
      target -= best[i]
      if (target <= 0) { pick = i; break }
    }
    centres.push(pts[pick])
  }
  return centres.map((c) => ({ ...c }))
}

/** Spread the centroid lightnesses across the full 0..1 range, hue and chroma
 *  untouched. Without this, `colors: 2` on a photo returns the image's two
 *  tinted centroids rather than the black-and-white the control implies — and
 *  every band count reads flatter than it should (UX invariant #5). */
function stretch(centres: Lab[]): void {
  let lo = Infinity, hi = -Infinity
  for (const c of centres) { if (c.L < lo) lo = c.L; if (c.L > hi) hi = c.L }
  const span = hi - lo
  if (span < 1e-6) return // a single-tone image has nothing to spread
  for (const c of centres) c.L = (c.L - lo) / span
}

export function quantize(
  img: { width: number; height: number; pixels: Uint8ClampedArray },
  cols: number,
  rows: number,
  colors: number,
  seed: number,
): Quantized {
  const pts = downsample(img, cols, rows)
  const k = Math.max(1, Math.min(colors, 255))
  const rand = mulberry32(seed)
  const centres = seedCentres(pts, k, rand)
  const idx = new Uint8Array(pts.length)

  for (let it = 0; it < ITERATIONS; it++) {
    for (let i = 0; i < pts.length; i++) {
      let bestD = Infinity
      let bestK = 0
      for (let c = 0; c < k; c++) {
        const d = dist2(pts[i], centres[c])
        if (d < bestD) { bestD = d; bestK = c }
      }
      idx[i] = bestK
    }
    const sumL = new Float64Array(k), sumA = new Float64Array(k)
    const sumB = new Float64Array(k), count = new Uint32Array(k)
    for (let i = 0; i < pts.length; i++) {
      const c = idx[i]
      sumL[c] += pts[i].L; sumA[c] += pts[i].a; sumB[c] += pts[i].b; count[c]++
    }
    for (let c = 0; c < k; c++) {
      // An empty cluster keeps its previous centre rather than becoming NaN. It
      // stays in the palette: the viewer asked for k colours, and silently
      // returning fewer would make the band count a lie.
      if (count[c] === 0) continue
      centres[c] = { L: sumL[c] / count[c], a: sumA[c] / count[c], b: sumB[c] / count[c] }
    }
  }

  // Order by lightness before stretching so the palette reads dark → light, the
  // same convention the hand-authored palettes use.
  const order = [...centres.keys()].sort((a, b) => centres[a].L - centres[b].L)
  const rank = new Uint8Array(k)
  order.forEach((from, to) => { rank[from] = to })
  for (let i = 0; i < idx.length; i++) idx[i] = rank[idx[i]]
  const sorted = order.map((i) => centres[i])
  stretch(sorted)

  return { idx, palette: sorted.map(oklabToHex) }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/diversions/ablation/quantize.test.ts && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/diversions/ablation/quantize.ts src/diversions/ablation/quantize.test.ts
git commit -m "Ablation: quantize an image to N colours by OKLab k-means"
```

---

### Task 6: Schema — `source`, `image`, `colors`

**Files:**
- Modify: `src/diversions/ablation/schema.ts`
- Test: `src/diversions/ablation/schema.test.ts` (append)

**Interfaces:**
- Consumes: the `image` ui + `local` flag (Tasks 2, 4)
- Produces: `AblationConfig` gains `source: 'Contours' | 'Image'`, `image?: string`, `colors: number`

`showWhen.equals` only validates against **enum** siblings, so `source` is what every conditional keys on. Existing links keep working: `source` defaults to `Contours`, and a decoded legacy URL that omits it lands on the default.

- [ ] **Step 1: Write the failing tests**

```ts
// src/diversions/ablation/schema.test.ts — append
import { encodeConfig } from '../../framework/urlCodec'

describe('image source (#278)', () => {
  const d = ablationSchema.parse({})

  it('defaults to Contours so every existing link is unchanged', () => {
    expect(d.source).toBe('Contours')
    expect(d.image).toBeUndefined()
  })

  it('the image id never reaches a link', () => {
    const sp = encodeConfig(ablationSchema, { ...d, source: 'Image', image: 'img_x' } as never,
      { includePinned: true })
    expect(sp.has('image')).toBe(false)
    expect(sp.get('source')).toBe('Image')
  })

  it('contour-only fields are gated on source', () => {
    for (const k of ['featureSize', 'roughness', 'palette']) {
      expect(ablationSchema.shape[k].meta()?.showWhen)
        .toEqual({ field: 'source', equals: 'Contours' })
    }
  })

  it('image-only fields are gated on source', () => {
    for (const k of ['image', 'colors']) {
      expect(ablationSchema.shape[k].meta()?.showWhen)
        .toEqual({ field: 'source', equals: 'Image' })
    }
  })

  it('cellSize and background are gated on neither — they serve both modes', () => {
    expect(ablationSchema.shape.cellSize.meta()?.showWhen).toBeUndefined()
    expect(ablationSchema.shape.background.meta()?.showWhen).toBeUndefined()
  })

  it('colors covers the same band range the palette does', () => {
    expect(() => ablationSchema.parse({ colors: 1 })).toThrow()
    expect(() => ablationSchema.parse({ colors: 25 })).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/diversions/ablation/schema.test.ts`
Expected: FAIL — `source` undefined

- [ ] **Step 3: Implement**

```ts
// src/diversions/ablation/schema.ts — insert at the TOP of the Picture section,
// above cellSize, so the mode reads before the things it gates.
  source: z.enum(['Contours', 'Image']).default('Contours')
    .meta({ section: 'Picture', ui: 'segmented', label: 'Source',
            options: ['Contours', 'Image'],
            help: 'Contours generates a fresh topographic map every picture. Image peels a '
                + 'picture you choose, quantized down to a handful of colours — and re-peels '
                + 'the same one each time, since a turret crew is shuffled fresh per picture '
                + 'and never dissolves it the same way twice.' }),
  image: z.string().optional()
    .meta({ section: 'Picture', ui: 'image', label: 'Image', local: true,
            showWhen: { field: 'source', equals: 'Image' },
            help: 'Stays on this machine — it is too big for a link, so a link you share '
                + 'falls back to the generated contour map. Your own reloads keep it.' }),
  colors: z.number().int().min(2).max(24).default(6)
    .meta({ section: 'Picture', ui: 'slider', min: 2, max: 24, step: 1, label: 'Colors',
            showWhen: { field: 'source', equals: 'Image' },
            help: 'How many colours the picture is reduced to — which is also how many bands '
                + 'the turrets divide into. Like is grouped with like, and the range is '
                + 'stretched to the full dark-to-light span, so 2 gives you black and white.' }),
```

```ts
// src/diversions/ablation/schema.ts — add showWhen to the three Contours-only fields.
// featureSize and roughness: add to their existing .meta({...})
            showWhen: { field: 'source', equals: 'Contours' },
// palette: same line added to its .meta({...})
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/diversions/ablation && npx tsc -b --noEmit`
Expected: schema tests PASS. `ablation.test.ts` may fail where it constructs configs — that is Task 7's job; if any break, note them and move on.

- [ ] **Step 5: Run the framework sweeps**

Run: `npx vitest run src/framework`
Expected: PASS — `codecSweep`, `seedContract`, `urlKeys`, `presetSweep` all green. `colors` and `source` are new leaf names; if `urlKeys.test.ts` reports a collision, rename the URL key rather than the field.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/ablation/schema.ts src/diversions/ablation/schema.test.ts
git commit -m "Ablation: Source mode picks contours or an uploaded image"
```

---

### Task 7: Wire the image into the field, cycling, and live edits

**Files:**
- Modify: `src/diversions/ablation/field.ts` (add `buildFieldFromIndices`)
- Modify: `src/diversions/ablation/ablation.ts:78-87` (`newField`), `:481-518` (`applyConfig`), `frame` path for the store version
- Modify: `src/diversions/ablation/index.ts` (call `rehydrate()` at module load)
- Test: `src/diversions/ablation/field.test.ts`, `src/diversions/ablation/ablation.test.ts` (append)

**Interfaces:**
- Consumes: `quantize` (Task 5), `getImage`/`storeVersion`/`rehydrate` (Task 3), the schema fields (Task 6)
- Produces:
  - `export function buildFieldFromIndices(idx: Uint8Array, cols: number, rows: number, bands: number): Field`
  - `export function bandsFor(cfg: AblationConfig): number` from `ablation.ts`

Three behaviours land together because they share one branch:

1. **`newField` branches on source.** Image mode quantizes; the result is cached on `(imageId, colors, cols, rows)` so a re-peel reuses it and only resets `alive`.
2. **Cycling.** A finished image picture rebuilds from the cache. Variation comes free from `crew()`'s RNG — the Mixed shuffle, the turret jitter, the Unison lock pick.
3. **Rehydrate swap.** `frame()` compares `storeVersion()` against a stashed copy; a change rebuilds **immediately**, not at the next picture boundary — a lap runs ~25 minutes at the slowest Track speed, so deferring would show the wrong picture for the rest of the session.

- [ ] **Step 1: Write the failing tests**

```ts
// src/diversions/ablation/field.test.ts — append
import { buildFieldFromIndices } from './field'

describe('buildFieldFromIndices (#278)', () => {
  it('wraps indices as a fully-alive field', () => {
    const f = buildFieldFromIndices(new Uint8Array([0, 1, 1, 0, 2, 2]), 3, 2, 3)
    expect(f.cols).toBe(3)
    expect(f.rows).toBe(2)
    expect(f.bands).toBe(3)
    expect(f.aliveCount).toBe(6)
    expect(Array.from(f.alive)).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('copies rather than aliasing — a re-peel must not share mutable state', () => {
    const src = new Uint8Array([0, 1])
    const f = buildFieldFromIndices(src, 2, 1, 2)
    src[0] = 1
    expect(f.idx[0]).toBe(0)
  })
})
```

```ts
// src/diversions/ablation/ablation.test.ts — append
import { putImage, clearImage } from '../../framework/imageStore'

/** A 64×64 half-dark/half-light image in the store under `id`. */
function storeSplitImage(id: string) {
  const w = 64, h = 64
  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const v = (i % w) < w / 2 ? 12 : 220
    pixels[i * 4] = v; pixels[i * 4 + 1] = v; pixels[i * 4 + 2] = v; pixels[i * 4 + 3] = 255
  }
  putImage({ id, dataUrl: 'data:,', width: w, height: h, pixels })
}

describe('image source (#278)', () => {
  const size = { width: 400, height: 300 }
  const imgCfg = () => ({ ...ablationSchema.parse({}), source: 'Image' as const, image: 'i1', colors: 4 })

  beforeEach(() => { clearImage() })

  it('builds the picture from the image, with colors as the band count', () => {
    storeSplitImage('i1')
    const s = createState(imgCfg(), size)
    expect(s.field.bands).toBe(4)
    expect(s.field.aliveCount).toBe(s.field.cols * s.field.rows)
  })

  it('falls back to contours when the store has no such image', () => {
    const s = createState(imgCfg(), size)
    // No image → the contour sampler runs, so bands follow the palette, not `colors`.
    expect(s.field.bands).toBe(ablationSchema.parse({}).palette.length)
  })

  it('re-peels the SAME picture when one completes', () => {
    storeSplitImage('i1')
    const s = createState(imgCfg(), size)
    const before = Array.from(s.field.idx)
    // Destroy everything, then step past the completion branch.
    s.field.alive.fill(0)
    s.field.aliveCount = 0
    s.track.length = 0
    s.dying.length = 0
    step(s, 1 / 60)
    expect(s.pictures).toBe(1)
    expect(Array.from(s.field.idx)).toEqual(before)
    expect(s.field.aliveCount).toBe(s.field.cols * s.field.rows)
  })

  it('source, image and colors are all structural', () => {
    storeSplitImage('i1')
    const s = createState(imgCfg(), size)
    expect(applyConfig(s, { ...imgCfg(), colors: 8 }, size)).toBe(false)
    expect(applyConfig(s, { ...imgCfg(), image: 'i2' }, size)).toBe(false)
    expect(applyConfig(s, { ...imgCfg(), source: 'Contours' }, size)).toBe(false)
  })

  it('an interior-only band still lets the picture finish', () => {
    // Band 1 sits entirely away from every border, so its turrets start with
    // nothing to strike. They must keep cycling, not retire, and the picture
    // must still complete.
    const s = createState({ ...ablationSchema.parse({}), palette: ['#000000', '#ffffff'] }, size)
    s.field.idx.fill(0)
    for (let row = 2; row < s.field.rows - 2; row++) {
      for (let col = 2; col < s.field.cols - 2; col++) s.field.idx[row * s.field.cols + col] = 1
    }
    s.field.alive.fill(1)
    s.field.aliveCount = s.field.cols * s.field.rows
    for (let i = 0; i < 400000 && s.field.aliveCount > 0; i++) step(s, 1 / 60)
    expect(s.field.aliveCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/diversions/ablation`
Expected: FAIL — `buildFieldFromIndices` is not exported; image configs build contour fields

- [ ] **Step 3: Implement `buildFieldFromIndices`**

```ts
// src/diversions/ablation/field.ts — append

/** Wrap a ready-made index grid (an image quantization) as a fresh, fully-alive
 *  Field. The indices are COPIED: the quantizer caches its result so a re-peel
 *  can skip the work, and a Field mutates `alive` — aliasing would let one
 *  picture's erosion leak into the next. */
export function buildFieldFromIndices(
  idx: Uint8Array,
  cols: number,
  rows: number,
  bands: number,
): Field {
  const n = cols * rows
  return {
    cols,
    rows,
    bands: Math.max(1, bands),
    idx: idx.slice(0, n),
    alive: new Uint8Array(n).fill(1),
    aliveCount: n,
  }
}
```

- [ ] **Step 4: Implement the `newField` branch + cache**

```ts
// src/diversions/ablation/ablation.ts — imports
import { buildField, buildFieldFromIndices, type Field } from './field'
import { getImage, storeVersion } from '../../framework/imageStore'
import { quantize } from './quantize'

// replace newField (was lines 78-87)

/** The band count for the picture this config describes. Contours takes it from
 *  the palette's LENGTH (documented in that field's help, and depended on by
 *  every shared link); Image takes it from the explicit `colors` control. */
export function bandsFor(cfg: AblationConfig): number {
  return cfg.source === 'Image' ? cfg.colors : cfg.palette.length
}

// Quantizing is the most expensive thing in setup, and its result is STABLE for
// a fixed (image, colours, grid) — so a re-peel of the same picture reuses it and
// only resets `alive`. One entry: the store holds one image, and a stale entry
// for a cleared upload is dead weight.
let quantCache: { key: string; idx: Uint8Array } | null = null

function imageIndices(cfg: AblationConfig, geom: Geom): Uint8Array | null {
  const img = getImage(cfg.image)
  if (!img) return null
  const key = `${cfg.image}|${cfg.colors}|${geom.cols}|${geom.rows}|${cfg.seed}`
  if (quantCache?.key !== key) {
    quantCache = { key, idx: quantize(img, geom.cols, geom.rows, cfg.colors, cfg.seed).idx }
  }
  return quantCache.idx
}

/** The palette a picture is drawn in. Image mode derives it from the pixels;
 *  Contours uses the hand-authored list. Returns null in Image mode when the
 *  store is cold, which is the caller's cue to fall back. */
export function paletteFor(cfg: AblationConfig, geom: Geom): string[] | null {
  if (cfg.source !== 'Image') return cfg.palette
  const img = getImage(cfg.image)
  if (!img) return null
  return quantize(img, geom.cols, geom.rows, cfg.colors, cfg.seed).palette
}

function newField(cfg: AblationConfig, geom: Geom, generation: number): Field {
  if (cfg.source === 'Image') {
    const idx = imageIndices(cfg, geom)
    // A cold store — a shared link, a cleared slot, a rehydrate still in flight —
    // falls through to contours rather than rendering nothing. `frame` watches the
    // store version and rebuilds the moment pixels arrive.
    if (idx) return buildFieldFromIndices(idx, geom.cols, geom.rows, cfg.colors)
  }
  return buildField({
    seed: cfg.seed + generation,
    cols: geom.cols,
    rows: geom.rows,
    bands: cfg.palette.length,
    featureSize: cfg.featureSize,
    roughness: cfg.roughness,
  })
}
```

Note the deliberate asymmetry: image mode passes `generation` nowhere, because a re-peel is the *same* picture (the spec's option A). Contours keeps `cfg.seed + generation` so it draws a new map each time.

- [ ] **Step 5: Add the store-version watch and the structural list**

```ts
// src/diversions/ablation/ablation.ts — add to AblationState
  /** last `storeVersion()` seen, so a rehydrated upload swaps in mid-run */
  imageVersion: number

// in createState's state literal
  imageVersion: storeVersion(),

// at the TOP of step(), before anything else advances
  // A reload rehydrates the stored image asynchronously. Rebuild the MOMENT it
  // lands rather than at the next picture boundary: a lap runs ~25 minutes at the
  // slowest Track speed, so deferring would show the fallback for the whole session.
  if (s.cfg.source === 'Image' && storeVersion() !== s.imageVersion) {
    s.imageVersion = storeVersion()
    s.field = newField(s.cfg, s.geom, s.pictures)
    s.front = buildFront(s.field)
    s.patches.length = 0
    s.buffer = null
    crew(s)
  }

// in applyConfig's `structural` expression, add three clauses
    next.source !== prev.source ||
    next.image !== prev.image ||
    next.colors !== prev.colors ||
```

- [ ] **Step 6: Rehydrate at module load**

```ts
// src/diversions/ablation/index.ts — after the imports
import { rehydrate } from '../../framework/imageStore'

// Kick the stored upload's decode off at module load. Fire-and-forget: `step`
// watches the store's version counter and swaps the picture in when it lands.
rehydrate()
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/diversions/ablation && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 8: Run the whole suite**

Run: `npx vitest run`
Expected: PASS — 5826+ tests. `diversionSmoke` mounts every diversion, so a throw in `index.ts` surfaces here.

- [ ] **Step 9: Commit**

```bash
git add src/diversions/ablation/field.ts src/diversions/ablation/field.test.ts src/diversions/ablation/ablation.ts src/diversions/ablation/ablation.test.ts src/diversions/ablation/index.ts
git commit -m "Ablation: peel an uploaded image, re-peeling the same one each cycle"
```

---

### Task 8: Render in the derived palette

**Files:**
- Modify: `src/diversions/ablation/render.ts` (resolve the palette through `paletteFor`)
- Test: `src/diversions/ablation/render.test.ts` (append)

**Interfaces:**
- Consumes: `paletteFor` (Task 7)
- Produces: nothing new

`render.ts` reads `cfg.palette` for the baked buffer, the turrets, the bolts and the dying cells. In image mode that list is the wrong length *and* the wrong colours, so every one of those paths must resolve through `paletteFor` instead — and the baked buffer must invalidate when it changes.

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/ablation/render.test.ts — append
import { putImage, clearImage } from '../../framework/imageStore'

describe('image palette (#278)', () => {
  beforeEach(() => { clearImage() })

  it('draws an image picture in the DERIVED colours, not the configured palette', () => {
    const w = 64, h = 64
    const pixels = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const v = (i % w) < w / 2 ? 12 : 220
      pixels[i * 4] = v; pixels[i * 4 + 1] = v; pixels[i * 4 + 2] = v; pixels[i * 4 + 3] = 255
    }
    putImage({ id: 'i1', dataUrl: 'data:,', width: w, height: h, pixels })

    const cfg = { ...ablationSchema.parse({}), source: 'Image' as const, image: 'i1', colors: 2 }
    const s = createState(cfg, { width: 400, height: 300 })
    const fills: string[] = []
    const ctx = recordingContext(fills)   // existing helper in this file
    render(s, ctx)

    // The configured palette's teal must not appear; near-black and near-white must.
    expect(fills.some((f) => f.toLowerCase().includes('1b4f6b'))).toBe(false)
    expect(fills.length).toBeGreaterThan(0)
  })
})
```

If `render.test.ts` has no `recordingContext` helper yet, write one that records every `fillStyle` assignment — the same proxy shape the `globalAlpha` gotcha in CLAUDE.md describes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/ablation/render.test.ts`
Expected: FAIL — the configured palette is used

- [ ] **Step 3: Implement**

Replace every `cfg.palette` read in `render.ts` with a single resolution at the top of `render()`:

```ts
// src/diversions/ablation/render.ts — at the top of render()
  // Image mode draws in the colours the quantizer pulled OUT of the picture, not
  // the hand-authored list — which in that mode is both the wrong length and the
  // wrong colours. `paletteFor` returns null only when the store is cold, and the
  // field is then a contour fallback, so the configured palette is correct.
  const palette = paletteFor(s.cfg, s.geom) ?? s.cfg.palette
```

then use `palette[...]` everywhere `s.cfg.palette[...]` appeared.

- [ ] **Step 4: Invalidate the baked buffer when the derived palette moves**

`applyConfig` already clears `s.buffer` on a palette or background change. Extend that condition so an image swap or a `colors` change does too — though both are structural and force a full re-setup, so this is belt-and-braces for a future live-apply:

```ts
// src/diversions/ablation/ablation.ts — in applyConfig's recolour check
  if (next.background !== prev.background ||
      next.image !== prev.image ||
      next.colors !== prev.colors ||
      next.palette.some((c, i) => c !== prev.palette[i])) {
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/diversions/ablation && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/diversions/ablation/render.ts src/diversions/ablation/render.test.ts src/diversions/ablation/ablation.ts
git commit -m "Ablation: draw an image picture in its derived palette"
```

---

### Task 9: Presets, lint, and the full suite

**Files:**
- Modify: `src/diversions/ablation/presets.ts` (guard the Palette axis against Image mode)
- Test: `src/diversions/ablation/presets.test.ts` (append)

**Interfaces:**
- Consumes: everything above
- Produces: nothing new

The `Palette` preset group patches `palette`, which does nothing in Image mode. `matchPresets` would then read whatever the last patch set and show a stale group label. The honest fix is for the Palette group's options to also set `source: 'Contours'` — picking a named palette is a statement that you want the generated map.

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/ablation/presets.test.ts — append
describe('presets vs image source (#278)', () => {
  it('every Palette option returns the piece to Contours', () => {
    const group = ablationPresets.find((g) => g.label === 'Palette')!
    for (const opt of group.options) {
      if (opt.label === 'Custom') continue
      expect(opt.patch.source).toBe('Contours')
    }
  })

  it('the Demolition axis leaves source alone — it is orthogonal', () => {
    const group = ablationPresets.find((g) => g.label === 'Demolition')!
    for (const opt of group.options) expect(opt.patch.source).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/ablation/presets.test.ts`
Expected: FAIL — `patch.source` undefined

- [ ] **Step 3: Implement**

Add `source: 'Contours'` to each non-Custom option's `patch` in the `Palette` group. Leave the `Demolition` group untouched — turret feel applies to both sources.

- [ ] **Step 4: Full gates**

```bash
npx vitest run
npx tsc -b --noEmit
npm run lint
npm run build
```

Expected: all clean. `presetSweep.test.ts` verifies every patch key exists in its schema — a typo surfaces there.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/ablation/presets.ts src/diversions/ablation/presets.test.ts
git commit -m "Ablation: a named palette returns the piece to contours"
```

---

### Task 10: Docs

**Files:**
- Modify: `README.md` (Ablation's entry)
- Modify: `CLAUDE.md` (framework seams: the `local` flag, the image store)

**Interfaces:** none

Docs are a ship dependency here, not a follow-up. Two things are genuinely new framework surface a future session needs to find: the `local` meta flag (and why it is not `randomizeOnFreshLoad`), and the image store's fail-soft contract.

- [ ] **Step 1: Update `README.md`**

Extend Ablation's description to name the two sources and the fact that an uploaded image stays local.

- [ ] **Step 2: Update `CLAUDE.md`**

Add to the architecture section, beside the codec bullet:

> **Browser-local config fields (`local: true`, #278).** A field whose value cannot travel — an uploaded image's id, pointing at pixels in `framework/imageStore.ts` — is flagged `local` and skipped by `encodeConfig` **in both modes**, unlike a pin-only `randomizeOnFreshLoad` seed which IS emitted under `includePinned`. Do not conflate them: the seed flag also drives `applyFreshLoadRandomization`, which would try to roll a random string. `codecSweep` needs no change for a `local` field that is `.optional()` with no default — it is already excluded for carrying no value at defaults.

Add to the gotchas section:

> **An async asset behind a sync `setup()` needs a version counter, not a promise.** `setup`/`resize` are synchronous, so a `localStorage`-backed image can't be awaited there. `imageStore` exposes a monotonic `storeVersion()`; the diversion stashes it in state and compares each `step()`. Rebuild **immediately** on a change rather than at the next natural boundary — Ablation's lap is ~25 minutes at the slowest Track speed, so "wait for this picture to finish" means "wrong picture for the whole session".

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: image source, the local meta flag, and the async-asset seam"
```

---

### Task 11: Code review (required phase)

Dispatch a fresh reviewer with no implementation bias — **both** project reviewers, in parallel:

- `diversion-reviewer` — the 5 UX invariants, schema-as-single-source-of-truth, the URL-codec keystone
- `perf-analyzer` — `frame()`/`setup()` hot path; specifically the per-frame `storeVersion()` compare and the quantize cache

Brief them on the spec path and the diff (`git diff main...HEAD`). Apply what survives triage; re-run the full gates after.

---

### Task 12: Chrome verify

Not optional and not a screenshot — the piece has to be watched.

- [ ] **Step 1: Start the dev server in the background**

```bash
npm run dev
```

- [ ] **Step 2: Drive Chrome via chrome-devtools MCP**

Verify, with a **seeded** URL (a seedless direct load resumes/randomizes and muddies the read):

1. `http://localhost:5180/d/ablation/config?seed=7` — the form shows `Source`, and switching to `Image` swaps `Feature size`/`Roughness`/`Palette` out for `Image`/`Colors`.
2. Upload a photo. It appears as a thumbnail, and the canvas shows the quantized picture within a frame or two.
3. Drag `Colors` from 2 to 12. At 2 the picture is genuinely black and white.
4. Let a picture complete (raise `Track speed`, drop `Cell size` to finish fast) — the SAME image re-peels.
5. Reload the page. The image survives, and the picture is right within a second.
6. Copy the share link, open it in a fresh tab — it falls back to the contour map, no error, no blank canvas.
7. Click `← config` (the in-app `<Link>`, not a reload) and back — the image is still there, per the SPA-nav state-leak gotcha.
8. Watch the console throughout for anything thrown.

- [ ] **Step 3: Hand the URL to the user for manual verification**

Automated checks are necessary, not sufficient. Surface the URL, name what to look at, and wait for explicit approval before the FF-merge.

---

## Self-Review

**Spec coverage.** §1 schema → Task 6. §2 `ui:'image'` → Task 4; `local` flag → Task 2. §3 persistence + async seam → Tasks 3 and 7. §4 quantizer → Tasks 1 and 5, with the cache in Task 7. §5 cycling → Task 7; live edits → Task 7; missing image → Task 7's fallback and Task 12's step 6. §6 interior band → Task 7's test. Testing section → distributed across Tasks 1–9. The derived swatch strip in §1's table is served by Task 8's `paletteFor` feeding `render`; the read-only strip in the *form* is the one piece deliberately deferred — it is display-only, and the canvas already shows the colours. Noted below.

**Placeholders.** None — every code step carries real code. Task 8 step 1 conditionally asks for a `recordingContext` helper; the shape is specified inline rather than left open.

**Type consistency.** `bandsFor`/`paletteFor`/`imageIndices` are defined in Task 7 and used in Tasks 7–8. `StoredImage` is defined in Task 3 and consumed in Tasks 4, 5, 7, 8. `Quantized` is Task 5's, consumed in Task 7. `Lab` is Task 1's, consumed in Task 5. `localKeys` is Task 2's, consumed nowhere but its own test — correct, it is read inside `encodeConfig`.

**Known deferral:** the read-only derived-swatch strip in the config form. It needs no new control (a `ui:'hidden'`-adjacent display) but it is pure affordance, and the canvas is the real preview. Backlog it after verify rather than growing Task 4.
