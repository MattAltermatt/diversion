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

// The URL codec only models arrays of *scalars* — encode stringifies each element
// with String(), so an object/array element would serialize as '[object Object]'
// (or a flattened inner array) and decode would silently revert the whole field to
// its default. No diversion uses this shape; rather than corrupt a share link in
// silence, make the limitation loud at schema-introspection time (encode/decode of
// any such schema, and the CI sweep in urlKeys.test.ts). See #123.
function arrayElemKind(elemType: string, path: string): LeafKind {
  if (elemType === 'object' || elemType === 'array') {
    throw new Error(
      `urlCodec: array leaf "${path}" has non-scalar elements (${elemType}); the URL ` +
        `codec only supports arrays of scalars (number/boolean/string/enum/literal). ` +
        `Flatten the shape or split into scalar fields.`,
    )
  }
  return scalarKind(elemType)
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
      out.set(path, { kind: 'array', elem: arrayElemKind(defType(unwrap(inner.element)), path) })
    } else {
      out.set(path, { kind: scalarKind(t) })
    }
  }
  return out
}

/** Map each dotted leaf path to its URL key and back. The URL key is the leaf's
 *  final segment when that name is globally unique within the schema; otherwise
 *  the full dotted path (collision fallback). Keeps URLs flat while staying
 *  unambiguous. */
function buildUrlKeyMap(schema: any): { encode: Map<string, string>; decode: Map<string, string> } {
  const paths = [...leafTypes(schema).keys()]
  const counts = new Map<string, number>()
  for (const p of paths) {
    const leaf = p.split('.').at(-1)!
    counts.set(leaf, (counts.get(leaf) ?? 0) + 1)
  }
  const encode = new Map<string, string>()
  const decode = new Map<string, string>()
  for (const p of paths) {
    const leaf = p.split('.').at(-1)!
    const key = counts.get(leaf) === 1 ? leaf : p
    encode.set(p, key)
    decode.set(key, p)
  }
  return { encode, decode }
}

/** Map each dotted leaf path to its unwrapped Zod node, for per-field validation. */
function leafNodes(schema: any, prefix = '', out: Map<string, any> = new Map()): Map<string, any> {
  const shape = schema.shape as Record<string, unknown>
  for (const [key, field] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key
    const inner = unwrap(field)
    if (defType(inner) === 'object') leafNodes(inner, path, out)
    else out.set(path, inner)
  }
  return out
}

/** Leaf names that occur more than once in the schema (would force a dotted
 *  fallback). Empty array = every leaf flattens cleanly. CI guard. */
export function leafNameCollisions(schema: any): string[] {
  const counts = new Map<string, number>()
  for (const p of leafTypes(schema).keys()) {
    const leaf = p.split('.').at(-1)!
    counts.set(leaf, (counts.get(leaf) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([leaf]) => leaf)
}

/** Dotted paths of array leaves whose elements are non-scalar (object / nested
 *  array) — these can't round-trip through the flat URL codec and make encode/
 *  decode throw. Empty array = every array leaf is scalar-element. CI guard,
 *  parallel to {@link leafNameCollisions}. #123 */
export function nonScalarArrayLeaves(schema: any): string[] {
  const bad: string[] = []
  try {
    leafTypes(schema)
  } catch (e) {
    bad.push(e instanceof Error ? e.message : String(e))
  }
  return bad
}

// --- value <-> string encoding ----------------------------------------------

// Arrays join with ',' after per-element encodeURIComponent (which escapes ','
// itself), so any element — including ones containing '_', ',', or '%' — round-
// trips unambiguously. Scalars stringify as-is (URLSearchParams handles the URL
// escaping), keeping color/enum URLs short and readable.
function encodeArray(v: unknown[]): string {
  return v.map((e) => encodeURIComponent(String(e))).join(',')
}

// Booleans accept 'true'/'1' case-insensitively (generated links emit 'true'/
// 'false', but a hand-edited link shouldn't silently read 'True' as false). #123
function decodeBool(raw: string): boolean {
  return /^(true|1)$/i.test(raw)
}

function decodeLeaf(raw: string, leaf: Leaf): unknown {
  if (leaf.kind === 'array') {
    const parts = raw === '' ? [] : raw.split(',').map(decodeURIComponent)
    // An empty element ('a,,b') must NOT coerce to 0 — map it to NaN so the
    // array's safeParse rejects and the field reverts to default, not [1,0,3]. #123
    if (leaf.elem === 'number') return parts.map((p) => (p === '' ? NaN : Number(p)))
    if (leaf.elem === 'boolean') return parts.map(decodeBool)
    return parts
  }
  if (leaf.kind === 'number') return Number(raw)
  if (leaf.kind === 'boolean') return decodeBool(raw)
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

// Keys that could walk into Object.prototype if a path were ever attacker-shaped.
// Schema paths never contain these, and unknown params are already dropped before
// setPath, so this is belt-and-suspenders on a module decoding URL input. #123
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Assign a decoded value at a dotted path, only if the path exists in the target. */
function setPath(root: Json, path: string, value: unknown): void {
  const parts = path.split('.')
  if (parts.some((p) => UNSAFE_KEYS.has(p))) return // prototype-pollution guard
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
  const flatVal = flatten(value as Json)
  const { encode } = buildUrlKeyMap(schema)
  const sp = new URLSearchParams()
  for (const [path, v] of Object.entries(flatVal)) {
    sp.set(encode.get(path) ?? path, v) // full snapshot — every field, flat leaf name
  }
  return sp
}

export function decodeConfig<T extends ZodObject<any>>(
  schema: T,
  params: URLSearchParams,
): ReturnType<T['parse']> {
  const defaults = schema.parse({}) as Json
  const leaves = leafTypes(schema)
  const { decode: reverse } = buildUrlKeyMap(schema)
  const nodes = leafNodes(schema)
  const out = structuredClone(defaults)
  for (const [rawKey, raw] of params) {
    const path = reverse.get(rawKey) ?? rawKey // flat → dotted; legacy dotted keys pass through
    const leaf = leaves.get(path)
    if (!leaf) continue // unknown / non-schema param → ignore
    // Empty whole-param on a scalar leaf means "no value": revert to default rather
    // than coerce '' → 0 / false / ''. Arrays keep '' → [] (a legit empty array). #123
    if (raw === '' && leaf.kind !== 'array') continue
    const value = decodeLeaf(raw, leaf)
    const node = nodes.get(path)
    if (node && !node.safeParse(value).success) continue // bad field → keep its default
    setPath(out, path, value)
  }
  // Per-field validation above is the primary degradation path (one bad field
  // keeps its default, the rest survive). This whole-object safeParse only applies
  // schema-level transforms and types the result. If it fails (e.g. a future
  // cross-field .refine() conflict), fall back to the per-field-degraded `out` —
  // every leaf there is already individually valid — never to whole-config
  // defaults, which would discard every other field over one conflict. #123
  const result = schema.safeParse(out)
  return (result.success ? result.data : out) as ReturnType<T['parse']>
}
