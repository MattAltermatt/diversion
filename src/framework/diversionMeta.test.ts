import { describe, it, expect } from 'vitest'
import { listDiversions } from './registry'
import { readMeta } from './fieldMeta'
import { walkFields, numberBounds, nodeType, type FieldEntry } from './sweepHelpers'

// Meta-invariant SWEEP (#127): the Zod schema is the single source of truth for
// the config form, so every field's `.meta()` must be well-formed for SchemaForm
// to render it. Today slider-bounds is checked only inside substrate's own test
// and flow-field has no schema test at all — this sweep enforces the contract for
// EVERY current and future diversion, recursing into `ui:'group'` containers.

function arrEq(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

describe('diversion meta sweep — every registered diversion (#127)', () => {
  for (const d of listDiversions()) {
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

    it(`${d.id}: every bounded ui:'number' field surfaces its Zod bound to meta (#196)`, () => {
      // NumberInput clamps to meta.min/max only. A ui:'number' field with a Zod bound
      // but no matching meta bound can be driven schema-invalid from the form (e.g.
      // substrate.drawTime → 0 broke the sim). Require the Zod bound be surfaced, and
      // that the surfaced bound keeps clamped values inside the Zod range.
      for (const f of fields) {
        const meta = readMeta(f.field)
        if (meta?.ui !== 'number') continue
        const { min, max } = numberBounds(f.node)
        // .int() injects the ±safe-integer range as sentinel bounds — those are not
        // user-facing limits (seed fields are intentionally open-ended), so ignore them.
        const realMin = min !== undefined && min > Number.MIN_SAFE_INTEGER ? min : undefined
        const realMax = max !== undefined && max < Number.MAX_SAFE_INTEGER ? max : undefined
        if (realMin !== undefined) {
          expect(typeof meta.min, `${f.path} ui:'number' has Zod min ${realMin} but no meta.min`).toBe('number')
          expect(meta.min!, `${f.path} meta.min < Zod min ${realMin}`).toBeGreaterThanOrEqual(realMin)
        }
        if (realMax !== undefined) {
          expect(typeof meta.max, `${f.path} ui:'number' has Zod max ${realMax} but no meta.max`).toBe('number')
          expect(meta.max!, `${f.path} meta.max > Zod max ${realMax}`).toBeLessThanOrEqual(realMax)
        }
      }
    })

    it(`${d.id}: every segmented field's options mirror the Zod enum values`, () => {
      for (const f of fields) {
        const meta = readMeta(f.field)
        if (meta?.ui !== 'segmented') continue
        expect(nodeType(f.node), `${f.path} segmented must back an enum`).toBe('enum')
        const enumOpts: string[] = f.node.options ?? []
        expect(meta.options, `${f.path}.options missing`).toBeDefined()
        expect(arrEq(meta.options!, enumOpts), `${f.path} options ≠ enum ${JSON.stringify(enumOpts)}`).toBe(true)
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
