import type { ZodType, ZodObject } from 'zod'

// 'hidden' — a field that is part of the schema (so the URL codec round-trips it)
// but is not rendered as a form control. Used for values driven indirectly, e.g.
// a preset-dropdown-only field. SchemaForm skips it in renderField.
export type FieldUi = 'slider' | 'number' | 'segmented' | 'toggle' | 'color' | 'colorList' | 'group' | 'hidden'

export interface FieldMeta {
  ui: FieldUi
  label: string
  help?: string
  min?: number // required for ui:'slider'
  max?: number // required for ui:'slider'
  step?: number
  maxLabel?: string // ui:'slider' — when value is at max, show this text instead of the number (e.g. "∞")
  options?: string[] // for ui:'segmented' (mirrors enum values)
  showWhen?: { field: string; equals: string | string[] } // render only when a sibling field === this value (or is one of the listed values)
  section?: string // groups the field under a collapsible subpanel in the config form
  randomizeOnFreshLoad?: boolean // numeric field rolled to a fresh random value on a bare load (empty query); share-links still pin it
}

/** Read a field's UI meta via Zod's public .meta(). Returns undefined if unset. */
export function readMeta(field: ZodType): FieldMeta | undefined {
  // Zod 4: .meta() (no args) returns the metadata registered via .meta({...}).
  // Verified against zod@4.4.3 — equivalent to z.globalRegistry.get(field).
  const m = (field as { meta?: () => unknown }).meta?.()
  return m as FieldMeta | undefined
}

/** Ordered [key, fieldSchema, meta] for each property of an object schema. */
export function fields(schema: ZodObject<any>): Array<[string, ZodType, FieldMeta]> {
  return Object.entries(schema.shape).map(([key, field]) => {
    const meta = readMeta(field as ZodType)
    if (!meta) throw new Error(`Field "${key}" is missing .meta({ ui, label })`)
    return [key, field as ZodType, meta]
  })
}
