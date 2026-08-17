import { describe, it, expect } from 'vitest'
// @ts-expect-error tsconfig.app exposes only vite/client types; node's are not
// widened into the app for one test file. Same idiom as contract.test.ts.
import { readFileSync } from 'node:fs'
// @ts-expect-error — see above.
import { join } from 'node:path'
import { allDiversions } from './testRegistry'
import { readMeta, type FieldMeta } from './fieldMeta'
import { walkFields, numberBounds, nodeType, type FieldEntry } from './sweepHelpers'

// Meta-invariant SWEEP (#127): the Zod schema is the single source of truth for
// the config form, so every field's `.meta()` must be well-formed for SchemaForm
// to render it. Today slider-bounds is checked only inside substrate's own test
// and flow-field has no schema test at all — this sweep enforces the contract for
// EVERY current and future diversion, recursing into `ui:'group'` containers.
//
// #304 widened two of these from one `ui` kind to every kind that shares the same
// failure mode. The options contract used to early-return unless `ui === 'segmented'`,
// so morphogen's two `ui:'select'` dropdowns shipped with no options at all — a
// strictly worse bug, since Segmented at least renders its label while Select renders
// an empty box and loses the controlled value. The bound-agreement contract was
// written for `ui:'number'` and never generalised, so ablation's Palette ran on
// ColorList's own 1..8 fallback against a schema saying 2..24 — wrong in BOTH
// directions at once. Neither kind list is guessed: they are derived from the
// controls' own source below, so a new control that reads `meta.options` or
// `meta.min` joins the contract by existing.

function arrEq(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// ── Which `ui` kinds each contract covers, derived from the controls ────────────
const CONTROLS_DIR = 'src/framework/controls'
const SCHEMA_FORM = 'src/framework/SchemaForm.tsx'

/** `ui` kind -> control component name, read out of SchemaForm's `controlFor` switch.
 *  That switch IS the mapping — anything else here would be a second copy of it. */
function uiToComponent(): Map<string, string> {
  const src: string = readFileSync(SCHEMA_FORM, 'utf8')
  const out = new Map<string, string>()
  for (const m of src.matchAll(/case '([A-Za-z]+)':\s*return (\w+)/g)) out.set(m[1], m[2])
  return out
}

/** The `ui` kinds whose control component's source matches `re` — i.e. whose
 *  rendering actually depends on that slice of meta. */
function uisWhoseControlReads(re: RegExp): string[] {
  const uis: string[] = []
  for (const [ui, comp] of uiToComponent()) {
    const src: string = readFileSync(join(CONTROLS_DIR, `${comp}.tsx`), 'utf8')
    if (re.test(src)) uis.push(ui)
  }
  return uis.sort()
}

const READS_OPTIONS = /meta\.options/
const READS_BOUNDS = /meta\.(min|max)\b/

/** Controls that render FROM meta.options: nothing to show without them. */
const OPTION_UIS = ['segmented', 'select']
/** Controls that clamp/gate on meta.min/meta.max, each with its own silent
 *  fallback when the field declares none (Slider renders an unusable 0..100,
 *  NumberInput stops clamping, ColorList falls back to 1..8). */
const BOUNDED_UIS = ['colorList', 'number', 'slider']

/** A Zod array's length bounds — the colorList equivalent of numberBounds(). Zod 4
 *  keeps them as checks on the def rather than as `minValue`/`maxValue` getters, so
 *  this cannot reuse numberBounds. */
function arrayLengthBounds(node: any): { min?: number; max?: number } {
  const checks: any[] = node?.def?.checks ?? node?._zod?.def?.checks ?? []
  let min: number | undefined
  let max: number | undefined
  for (const c of checks) {
    const d = c?._zod?.def ?? c?.def ?? c
    if (d?.check === 'min_length') min = d.minimum
    else if (d?.check === 'max_length') max = d.maximum
    else if (d?.check === 'length_equals') { min = d.length; max = d.length }
  }
  return {
    min: typeof min === 'number' && Number.isFinite(min) ? min : undefined,
    max: typeof max === 'number' && Number.isFinite(max) ? max : undefined,
  }
}

/** The bound a bounded control must respect, whichever shape the Zod node takes. */
function zodBounds(node: any): { min?: number; max?: number } {
  return nodeType(node) === 'array' ? arrayLengthBounds(node) : numberBounds(node)
}

/** Option values, normalised across the plain-string and {value,label} forms. */
function optionValues(meta: FieldMeta): string[] {
  return (meta.options ?? []).map((o) => (typeof o === 'string' ? o : o.value))
}

const HEX8 = /^#[0-9a-fA-F]{8}$/

describe('the contracts below cover every control that shares the failure mode (#304)', () => {
  // The two generalised contracts name `ui` kinds, and a hand-maintained list would
  // drift the moment a control is added — which is exactly how `select` was missed
  // for the whole life of the options contract. Derive the lists from the controls'
  // own source and fail here (not silently, later) when they move.
  it('SchemaForm still maps ui kinds to controls in a readable switch', () => {
    const map = uiToComponent()
    expect(map.size, 'controlFor switch unreadable — the derivations below are vacuous').toBeGreaterThanOrEqual(8)
    expect(map.get('select')).toBe('Select')
    expect(map.get('colorList')).toBe('ColorList')
  })

  it('OPTION_UIS is exactly the set of controls that render from meta.options', () => {
    expect(uisWhoseControlReads(READS_OPTIONS)).toEqual(OPTION_UIS)
  })

  it('BOUNDED_UIS is exactly the set of controls that gate on meta.min/meta.max', () => {
    expect(uisWhoseControlReads(READS_BOUNDS)).toEqual(BOUNDED_UIS)
  })

  it('the sweeps below actually reach fields of every covered kind', () => {
    // Non-vacuity: a contract that no field in the gallery exercises guards nothing.
    // arrayLengthBounds in particular reads Zod internals — if a version bump moved
    // them, every colorList would silently report "no bound" and pass.
    const counts = new Map<string, number>()
    let boundedArrays = 0
    for (const d of allDiversions) {
      for (const f of walkFields(d.schema)) {
        const ui = readMeta(f.field)?.ui
        if (!ui) continue
        counts.set(ui, (counts.get(ui) ?? 0) + 1)
        if (ui === 'colorList' && arrayLengthBounds(f.node).max !== undefined) boundedArrays++
      }
    }
    for (const ui of [...OPTION_UIS, ...BOUNDED_UIS, 'color']) {
      expect(counts.get(ui) ?? 0, `no ui:'${ui}' field in the gallery`).toBeGreaterThan(0)
    }
    expect(boundedArrays, 'arrayLengthBounds() read no Zod array bound at all').toBeGreaterThan(20)
  })
})

describe('diversion meta sweep — every registered diversion (#127)', () => {
  for (const d of allDiversions) {
    const fields = walkFields(d.schema)
    const byPath = new Map(fields.map((f) => [f.path, f]))

    it(`${d.id}: every field declares ui + label`, () => {
      for (const f of fields) {
        const meta = readMeta(f.field)
        expect(meta, `${f.path} missing .meta`).toBeDefined()
        expect(typeof meta!.ui, `${f.path}.ui`).toBe('string')
        expect(typeof meta!.label, `${f.path}.label`).toBe('string')
        expect(meta!.label.length, `${f.path}.label is empty`).toBeGreaterThan(0)
        // An object field is the group container; a leaf is anything but.
        if (f.isObject) expect(meta!.ui, `${f.path} object must be ui:'group'`).toBe('group')
        else expect(meta!.ui, `${f.path} leaf must not be ui:'group'`).not.toBe('group')
      }
    })

    it(`${d.id}: every slider has numeric min < max and a step`, () => {
      for (const f of fields) {
        const meta = readMeta(f.field)
        if (meta?.ui !== 'slider') continue
        expect(typeof meta.min, `${f.path}.min`).toBe('number')
        expect(typeof meta.max, `${f.path}.max`).toBe('number')
        expect(meta.min!, `${f.path} min<max`).toBeLessThan(meta.max!)
        expect(typeof meta.step, `${f.path}.step`).toBe('number')
      }
    })

    it(`${d.id}: every slider's meta min/max stay within the Zod bounds`, () => {
      for (const f of fields) {
        const meta = readMeta(f.field)
        if (meta?.ui !== 'slider') continue
        const { min, max } = numberBounds(f.node)
        if (min !== undefined)
          expect(meta.min!, `${f.path} meta.min < Zod min ${min}`).toBeGreaterThanOrEqual(min)
        if (max !== undefined)
          expect(meta.max!, `${f.path} meta.max > Zod max ${max}`).toBeLessThanOrEqual(max)
      }
    })

    it(`${d.id}: every bounded control surfaces its Zod bound to meta (#196, #304)`, () => {
      // A bounded control clamps/gates on meta.min/max ONLY — it never sees the Zod
      // node. A field with a Zod bound and no matching meta bound can therefore be
      // driven schema-invalid from its own control (substrate.drawTime → 0 broke the
      // sim; ablation's Palette let ✕ delete down to one colour against a .min(2)),
      // and in the other direction the control's fallback silently caps the field
      // below what the schema allows (ColorList hid "+ Add color" at 8 against a
      // .max(24)). Both are the same missing surfacing, so this covers every kind in
      // BOUNDED_UIS — number's Zod bound is numeric, colorList's is an array LENGTH.
      for (const f of fields) {
        const meta = readMeta(f.field)
        if (!meta || !BOUNDED_UIS.includes(meta.ui)) continue
        const { min, max } = zodBounds(f.node)
        // .int() injects the ±safe-integer range as sentinel bounds — those are not
        // user-facing limits (seed fields are intentionally open-ended), so ignore them.
        const realMin = min !== undefined && min > Number.MIN_SAFE_INTEGER ? min : undefined
        const realMax = max !== undefined && max < Number.MAX_SAFE_INTEGER ? max : undefined
        if (realMin !== undefined) {
          expect(typeof meta.min, `${f.path} ui:'${meta.ui}' has Zod min ${realMin} but no meta.min`).toBe('number')
          expect(meta.min!, `${f.path} meta.min < Zod min ${realMin}`).toBeGreaterThanOrEqual(realMin)
        }
        if (realMax !== undefined) {
          expect(typeof meta.max, `${f.path} ui:'${meta.ui}' has Zod max ${realMax} but no meta.max`).toBe('number')
          expect(meta.max!, `${f.path} meta.max > Zod max ${realMax}`).toBeLessThanOrEqual(realMax)
        }
      }
    })

    it(`${d.id}: every options-driven control declares options that match its Zod node (#304)`, () => {
      // Covers every kind in OPTION_UIS, not just segmented. Both controls map
      // `meta.options ?? []` straight to their children, so a field with none renders
      // an EMPTY control and strands its value: Segmented shows a bare label, Select
      // shows an empty box that cannot even display what the config currently holds.
      for (const f of fields) {
        const meta = readMeta(f.field)
        if (!meta || !OPTION_UIS.includes(meta.ui)) continue
        expect(meta.options, `${f.path} ui:'${meta.ui}' renders FROM meta.options but declares none`).toBeDefined()
        expect(meta.options!.length, `${f.path} ui:'${meta.ui}' declares an EMPTY options list`).toBeGreaterThan(0)
        // Segmented paints each option string as its own button, so it must stay
        // enum-backed with the plain-string form; Select may split value/label and may
        // back a plain z.string() (ablation's Picture list is built from the sprite
        // roster). Either way, when the node IS an enum the option VALUES must mirror
        // it exactly — an option the enum rejects is a control that writes an invalid
        // config, and an enum member with no option is a value nothing can reach.
        const values = optionValues(meta)
        if (meta.ui === 'segmented') {
          expect(nodeType(f.node), `${f.path} segmented must back an enum`).toBe('enum')
        }
        if (nodeType(f.node) === 'enum') {
          const enumOpts: string[] = f.node.options ?? []
          expect(arrEq(values, enumOpts), `${f.path} option values ${JSON.stringify(values)} ≠ enum ${JSON.stringify(enumOpts)}`).toBe(true)
        }
      }
    })

    it(`${d.id}: every ui:'color' field's Zod node accepts what <input type=color> emits (#304)`, () => {
      // `<input type="color">` is a SIX-hex device — its value sanitizer rewrites
      // anything else to #000000 and it only ever emits 6-hex. Swatch grows its alpha
      // affordance from the VALUE's length (a control never sees the Zod node), so an
      // 8-hex field is legal ONLY if its own default carries the alpha byte: that
      // default is the one thing that ever hands the control the signal. Without it —
      // intermomentary's two inks before this — the picker renders black, and every
      // pick writes a 6-hex value the field's own regex rejects, which the codec
      // reverts on the next load.
      for (const f of fields) {
        const meta = readMeta(f.field)
        if (meta?.ui !== 'color') continue
        if (f.node.safeParse('#aabbcc').success) continue // plain 6-hex field, nothing to prove
        const def = f.field.safeParse(undefined)
        const shown = def.success ? JSON.stringify(def.data) : '<no default>'
        expect(
          def.success && typeof def.data === 'string' && HEX8.test(def.data),
          `${f.path} ui:'color' node rejects 6-hex '#aabbcc', so it needs an 8-hex default to ask Swatch for the alpha row — got ${shown}`,
        ).toBe(true)
      }
    })

    it(`${d.id}: every showWhen names a real sibling enum that can hold its value`, () => {
      for (const f of fields) {
        const meta = readMeta(f.field)
        if (!meta?.showWhen) continue
        const siblingPath = f.parent ? `${f.parent}.${meta.showWhen.field}` : meta.showWhen.field
        const sibling: FieldEntry | undefined = byPath.get(siblingPath)
        expect(sibling, `${f.path} showWhen → missing sibling ${siblingPath}`).toBeDefined()
        expect(nodeType(sibling!.node), `${siblingPath} must be an enum`).toBe('enum')
        const opts: string[] = sibling!.node.options ?? []
        const wanted = Array.isArray(meta.showWhen.equals) ? meta.showWhen.equals : [meta.showWhen.equals]
        for (const w of wanted) {
          expect(
            opts.includes(w),
            `${f.path} showWhen.equals="${w}" not in ${JSON.stringify(opts)}`,
          ).toBe(true)
        }
      }
    })
  }
})
