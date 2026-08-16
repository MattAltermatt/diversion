import type { ZodType, ZodObject } from 'zod'

// 'hidden' — a field that is part of the schema (so the URL codec round-trips it)
// but is not rendered as a form control. Used for values driven indirectly, e.g.
// a preset-dropdown-only field. SchemaForm skips it in renderField.
export type FieldUi = 'slider' | 'number' | 'segmented' | 'select' | 'toggle' | 'color' | 'colorList' | 'group' | 'matrix' | 'image' | 'hidden'

/** An option for ui:'select' when the value must differ from the visible label,
 *  or when a long list needs <optgroup> headings.
 *
 *  ui:'segmented' keeps the plain string[] form — its contract test in
 *  diversionMeta.test.ts requires options to mirror the backing Zod enum exactly,
 *  so a value/label split there would be a lie. */
export interface SelectOption {
  value: string
  label: string
  group?: string
}

export interface FieldMeta {
  ui: FieldUi
  label: string
  help?: string
  min?: number // required for ui:'slider'
  max?: number // required for ui:'slider'
  step?: number
  maxLabel?: string // ui:'slider' — when value is at max, show this text instead of the number (e.g. "∞")
  options?: string[] | SelectOption[] // ui:'segmented' mirrors the enum values; ui:'select' may split value/label and group
  showWhen?: { field: string; equals: string | string[] } // render only when a sibling field === this value (or is one of the listed values)
  section?: string // groups the field under a collapsible subpanel in the config form
  collapsed?: boolean // section starts collapsed if ANY field in it sets this (e.g. 'Advanced')
  randomizeOnFreshLoad?: boolean // numeric field rolled to a fresh random value on a bare load (empty query); share-links still pin it
  local?: boolean // value lives only in THIS browser (e.g. an uploaded image's id) — never encoded into a link, pinned or not
  deriveFrom?: (config: any) => number[] // ui:'matrix' — derive the seed-based table (flat row-major, length colors²) from the full config, so the generic control imports no diversion math
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
