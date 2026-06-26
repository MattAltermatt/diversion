import type { ZodTypeAny, ZodObject } from 'zod'

export type FieldUi = 'slider' | 'number' | 'segmented' | 'toggle' | 'color' | 'group'

export interface FieldMeta {
  ui: FieldUi
  label: string
  help?: string
  min?: number // required for ui:'slider'
  max?: number // required for ui:'slider'
  step?: number
  options?: string[] // for ui:'segmented' (mirrors enum values)
}

/** Read a field's UI meta via Zod's public .meta(). Returns undefined if unset. */
export function readMeta(field: ZodTypeAny): FieldMeta | undefined {
  // Zod 4: .meta() (no args) returns the metadata registered via .meta({...}).
  // Verified against zod@4.4.3 — equivalent to z.globalRegistry.get(field).
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
