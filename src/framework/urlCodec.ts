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
    let ok = true
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur[parts[i]] as Json
      def = (def as Json)?.[parts[i]]
      if (cur == null) {
        ok = false
        break
      }
    }
    if (!ok || cur == null) continue
    const leaf = parts[parts.length - 1]
    const prev = (def as Json)?.[leaf]
    cur[leaf] = Array.isArray(prev)
      ? raw.split('_').map(Number)
      : typeof prev === 'number'
        ? Number(raw)
        : typeof prev === 'boolean'
          ? raw === 'true'
          : raw
  }
  return out
}

export function encodeConfig<T extends ZodObject<any>>(
  schema: T,
  value: ReturnType<T['parse']>,
): URLSearchParams {
  const defaults = schema.parse({}) as Json
  const flatVal = flatten(value as Json)
  const flatDef = flatten(defaults)
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(flatVal)) {
    if (v !== flatDef[k]) sp.set(k, v) // omit anything still at default
  }
  return sp
}

export function decodeConfig<T extends ZodObject<any>>(
  schema: T,
  params: URLSearchParams,
): ReturnType<T['parse']> {
  const defaults = schema.parse({}) as Json
  const flat: Record<string, string> = {}
  for (const [k, v] of params) flat[k] = v
  const raw = unflatten(flat, defaults)
  const result = schema.safeParse(raw)
  return (result.success ? result.data : defaults) as ReturnType<T['parse']>
}
