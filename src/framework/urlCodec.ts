import type { ZodObject } from 'zod'

type Json = Record<string, unknown>

// --- schema introspection (Zod 4) -------------------------------------------
// Coercion is driven by the Zod node, NOT the default value's JS type — so an
// array of strings stays strings instead of being forced through Number() (#3).

type LeafKind = 'number' | 'boolean' | 'string'
type Leaf = { kind: LeafKind } | { kind: 'array'; elem: LeafKind }

function defType(s: unknown): string {
  const d = s as { def?: { type?: string }; _def?: { type?: string } }
  return (d.def ?? d._def)?.type ?? ''
}

/** Peel .default()/.optional()/.nullable() wrappers to the core schema. */
function unwrap(s: any): any {
  let cur = s
  while (
    (defType(cur) === 'default' || defType(cur) === 'optional' || defType(cur) === 'nullable') &&
    typeof cur.unwrap === 'function'
  ) {
    cur = cur.unwrap()
  }
  return cur
}

// enum / literal / string all decode as the raw string; number & boolean coerce.
function scalarKind(t: string): LeafKind {
  return t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : 'string'
}

/** Map each dotted leaf path of an object schema to how its value decodes. */
function leafTypes(schema: any, prefix = '', out: Map<string, Leaf> = new Map()): Map<string, Leaf> {
  const shape = schema.shape as Record<string, unknown>
  for (const [key, field] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key
    const inner = unwrap(field)
    const t = defType(inner)
    if (t === 'object') {
      leafTypes(inner, path, out)
    } else if (t === 'array') {
      out.set(path, { kind: 'array', elem: scalarKind(defType(unwrap(inner.element))) })
    } else {
      out.set(path, { kind: scalarKind(t) })
    }
  }
  return out
}

// --- value <-> string encoding ----------------------------------------------

// Arrays join with ',' after per-element encodeURIComponent (which escapes ','
// itself), so any element — including ones containing '_', ',', or '%' — round-
// trips unambiguously. Scalars stringify as-is (URLSearchParams handles the URL
// escaping), keeping color/enum URLs short and readable.
function encodeArray(v: unknown[]): string {
  return v.map((e) => encodeURIComponent(String(e))).join(',')
}

function decodeLeaf(raw: string, leaf: Leaf): unknown {
  if (leaf.kind === 'array') {
    const parts = raw === '' ? [] : raw.split(',').map(decodeURIComponent)
    if (leaf.elem === 'number') return parts.map(Number)
    if (leaf.elem === 'boolean') return parts.map((p) => p === 'true')
    return parts
  }
  if (leaf.kind === 'number') return Number(raw)
  if (leaf.kind === 'boolean') return raw === 'true'
  return raw
}

// --- flatten / set ----------------------------------------------------------

/** Flatten nested plain objects to dotted keys; arrays use the collision-safe encoding. */
function flatten(obj: Json, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (Array.isArray(v)) out[key] = encodeArray(v)
    else if (v && typeof v === 'object') flatten(v as Json, key, out)
    else out[key] = String(v)
  }
  return out
}

/** Assign a decoded value at a dotted path, only if the path exists in the target. */
function setPath(root: Json, path: string, value: unknown): void {
  const parts = path.split('.')
  let cur: Json = root
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]]
    if (next == null || typeof next !== 'object') return // path absent in defaults → skip
    cur = next as Json
  }
  cur[parts[parts.length - 1]] = value
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
  const leaves = leafTypes(schema)
  const out = structuredClone(defaults)
  for (const [k, raw] of params) {
    const leaf = leaves.get(k)
    if (!leaf) continue // unknown / non-schema param → ignore
    setPath(out, k, decodeLeaf(raw, leaf))
  }
  // safeParse so a bad/hand-edited URL degrades to defaults instead of throwing.
  const result = schema.safeParse(out)
  return (result.success ? result.data : defaults) as ReturnType<T['parse']>
}
