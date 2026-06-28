// Test-support helpers for the registry/codec/meta/preset SWEEPS (#127). These
// walk a diversion's Zod schema the same way the URL codec and SchemaForm do —
// peeling .default()/.optional() wrappers and recursing into `ui:'group'`
// objects — so the sweeps can assert invariants against EVERY current and future
// diversion via listDiversions(). Pure introspection; imported only by *.test.ts.

type AnyZod = any

function defType(s: AnyZod): string {
  const d = s as { def?: { type?: string }; _def?: { type?: string } }
  return (d?.def ?? d?._def)?.type ?? ''
}

/** Peel .default()/.optional()/.nullable() wrappers to the core schema node. */
export function unwrap(s: AnyZod): AnyZod {
  let cur = s
  while (
    (defType(cur) === 'default' || defType(cur) === 'optional' || defType(cur) === 'nullable') &&
    typeof cur.unwrap === 'function'
  ) {
    cur = cur.unwrap()
  }
  return cur
}

export function nodeType(node: AnyZod): string {
  return defType(node)
}

export interface FieldEntry {
  /** Dotted path from the schema root, e.g. `color.colors`. */
  path: string
  /** Final path segment, e.g. `colors`. */
  key: string
  /** Dotted path of the enclosing object (`''` for top-level fields). */
  parent: string
  /** Unwrapped Zod node (default/optional peeled away). */
  node: AnyZod
  /** Original wrapped field, the one that carries `.meta()`. */
  field: AnyZod
  /** True when the field is itself an object (a `ui:'group'` container). */
  isObject: boolean
}

/** Every field in the schema, depth-first, including `ui:'group'` containers AND
 *  the leaves nested inside them. Mirrors leafTypes()/fields() traversal. */
export function walkFields(schema: AnyZod, prefix = '', out: FieldEntry[] = []): FieldEntry[] {
  const shape = schema.shape as Record<string, AnyZod>
  for (const [key, field] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key
    const inner = unwrap(field)
    const isObject = defType(inner) === 'object'
    out.push({ path, key, parent: prefix, node: inner, field, isObject })
    if (isObject) walkFields(inner, path, out)
  }
  return out
}

/** Just the encodable leaves (scalars + scalar arrays) — what the URL codec
 *  emits one key for. Excludes `ui:'group'` object containers. */
export function leafFields(schema: AnyZod): FieldEntry[] {
  return walkFields(schema).filter((f) => !f.isObject)
}

/** Reproduce the codec's flat URL key for each leaf path: the final segment when
 *  that name is globally unique among leaves, else the full dotted path. Kept in
 *  lockstep with buildUrlKeyMap() in urlCodec.ts. */
export function urlKeyMap(schema: AnyZod): Map<string, string> {
  const paths = leafFields(schema).map((l) => l.path)
  const counts = new Map<string, number>()
  for (const p of paths) {
    const leaf = p.split('.').at(-1)!
    counts.set(leaf, (counts.get(leaf) ?? 0) + 1)
  }
  const map = new Map<string, string>()
  for (const p of paths) {
    const leaf = p.split('.').at(-1)!
    map.set(p, counts.get(leaf) === 1 ? leaf : p)
  }
  return map
}

/** Read a Zod number node's effective min/max bound, or undefined when open-ended. */
export function numberBounds(node: AnyZod): { min?: number; max?: number } {
  const min = node?.minValue
  const max = node?.maxValue
  return {
    min: typeof min === 'number' && Number.isFinite(min) ? min : undefined,
    max: typeof max === 'number' && Number.isFinite(max) ? max : undefined,
  }
}
