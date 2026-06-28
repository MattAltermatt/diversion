import { describe, it, expect } from 'vitest'
import { listDiversions } from './registry'
import { encodeConfig, decodeConfig } from './urlCodec'
import { deepEqual } from './presets'
import { leafFields, urlKeyMap, nodeType, type FieldEntry } from './sweepHelpers'

// Codec SWEEP (#127): the URL codec is the keystone, and the registry auto-
// discovers diversions, so the highest-leverage test is one that runs the codec
// against EVERY registered diversion's real schema. Any future diversion is
// covered the moment its folder lands. Three invariants per diversion:
//   (a) round-trip — decode(encode(defaults)) deep-equals defaults
//   (b) full snapshot — encode emits exactly one key per schema leaf
//   (c) per-field degradation — one garbage field reverts to its own default
//       while a valid sibling survives (no whole-config wipe)

function getAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, k) => (cur as Record<string, unknown>)?.[k], obj)
}

/** A guaranteed-valid value DIFFERENT from `current`, for a survivor field, plus
 *  its URL-encoded string. Returns undefined when the node shape can't cheaply
 *  yield a distinct valid value (so the caller skips it and tries another leaf). */
function altValue(node: any, current: unknown): { value: unknown; raw: string } | undefined {
  const t = nodeType(node)
  if (t === 'boolean') {
    const v = !current
    return { value: v, raw: String(v) }
  }
  if (t === 'enum') {
    const opts: string[] = node.options ?? []
    const other = opts.find((o) => o !== current)
    if (other != null) return { value: other, raw: other }
    return undefined
  }
  if (t === 'number') {
    const min = node.minValue
    const max = node.maxValue
    const cand = [
      typeof min === 'number' && typeof max === 'number' ? Math.round((min + max) / 2) : undefined,
      typeof min === 'number' && Number.isFinite(min) ? min : undefined,
      typeof max === 'number' && Number.isFinite(max) ? max : undefined,
    ].filter((v): v is number => typeof v === 'number')
    for (const v of cand) {
      if (v !== current && node.safeParse(v).success) return { value: v, raw: String(v) }
    }
  }
  return undefined
}

describe('codec sweep — every registered diversion (#127)', () => {
  for (const d of listDiversions()) {
    const defaults = d.schema.parse({}) as Record<string, unknown>

    it(`${d.id}: decode(encode(defaults)) deep-equals defaults`, () => {
      const round = decodeConfig(d.schema, encodeConfig(d.schema, defaults as never))
      expect(round).toEqual(defaults)
    })

    it(`${d.id}: encode emits exactly one key per schema leaf (full snapshot)`, () => {
      const sp = encodeConfig(d.schema, defaults as never)
      const emitted = [...sp.keys()].sort()
      const expected = [...urlKeyMap(d.schema).values()].sort()
      expect(emitted).toEqual(expected)
    })

    it(`${d.id}: a garbage field reverts to default while a sibling survives`, () => {
      const leaves = leafFields(d.schema)
      const keys = urlKeyMap(d.schema)

      // Target: a number leaf (garbage 'abc' → NaN → always rejected by z.number).
      const target = leaves.find((l): l is FieldEntry => nodeType(l.node) === 'number')
      expect(target, `${d.id} has no numeric leaf to corrupt`).toBeDefined()

      // Survivor: a DIFFERENT leaf that can carry a distinct valid value, so we
      // can prove it isn't wiped when its sibling is garbage.
      let survivor: { leaf: FieldEntry; alt: { value: unknown; raw: string } } | undefined
      for (const l of leaves) {
        if (l.path === target!.path) continue
        const alt = altValue(l.node, getAt(defaults, l.path))
        if (alt) { survivor = { leaf: l, alt }; break }
      }
      expect(survivor, `${d.id} has no distinct-valued sibling leaf`).toBeDefined()

      const sp = encodeConfig(d.schema, defaults as never)
      sp.set(keys.get(survivor!.leaf.path)!, survivor!.alt.raw)
      sp.set(keys.get(target!.path)!, 'abc')
      const decoded = decodeConfig(d.schema, sp)

      // Corrupted field fell back to its own default…
      expect(deepEqual(getAt(decoded, target!.path), getAt(defaults, target!.path))).toBe(true)
      // …and the unrelated sibling kept its (non-default) value.
      expect(deepEqual(getAt(decoded, survivor!.leaf.path), survivor!.alt.value)).toBe(true)
    })
  }
})
