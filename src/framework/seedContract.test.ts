import { describe, it, expect } from 'vitest'
import type { ZodType } from 'zod'
import { allDiversions } from './testRegistry'
import { encodeConfig, applyFreshLoadRandomization } from './urlCodec'
import { urlKeyMap } from './sweepHelpers'
import { readMeta } from './fieldMeta'

// SEED CONTRACT SWEEP (#193): the codec keystone is that a `seed` field is *pin-only* —
// `encodeConfig` never emits it (so a shared link is seedless / "new world every visit"),
// while `applyFreshLoadRandomization` rolls a fresh one on a bare load and honors an
// explicit `?seed=N` for reproduction. That contract requires each seed field to carry
// `.meta({ randomizeOnFreshLoad: true })`. 16/19 diversions historically forgot it and
// nothing guarded it, so `new-diversion` scaffolding a bare `seed` field silently
// regressed the "new world every visit" ethos every time. This sweep runs the registry
// and makes any future omission a compile-loud failure.
//
// A field is subject to the contract if it is NAMED `seed` OR flagged
// `randomizeOnFreshLoad` — both must imply the other.

const ROLL = 500_000_000 // Math.floor(0.5 * 1e9), for a deterministic rand()

describe('seed contract — every registered diversion (#193)', () => {
  for (const d of allDiversions) {
    const defaults = d.schema.parse({}) as Record<string, unknown>
    const keyOf = urlKeyMap(d.schema) // path → encoded URL key (top-level path === field name)

    for (const [name, field] of Object.entries(d.schema.shape)) {
      const meta = readMeta(field as ZodType)
      const named = name === 'seed'
      const flagged = meta?.randomizeOnFreshLoad === true
      if (!named && !flagged) continue

      const key = keyOf.get(name) ?? name

      it(`${d.id}.${name}: a seed field is flagged randomizeOnFreshLoad (and vice versa)`, () => {
        expect(named, `field '${name}' is flagged randomizeOnFreshLoad but is not named 'seed'`).toBe(true)
        expect(flagged, `field '${name}' is a seed but lacks .meta({ randomizeOnFreshLoad: true })`).toBe(true)
      })

      it(`${d.id}.${name}: encodeConfig omits it (seedless link) but includePinned emits it`, () => {
        expect(encodeConfig(d.schema, defaults as never).has(key)).toBe(false)
        expect(encodeConfig(d.schema, defaults as never, { includePinned: true }).has(key)).toBe(true)
      })

      it(`${d.id}.${name}: a bare load rolls it fresh; an explicit ?${key}=N is honored`, () => {
        const bare = applyFreshLoadRandomization(d.schema, defaults as never, new URLSearchParams(), () => 0.5)
        expect((bare as Record<string, unknown>)[name]).toBe(ROLL)

        const pinned = applyFreshLoadRandomization(
          d.schema, defaults as never, new URLSearchParams({ [key]: '123' }), () => 0.5,
        )
        expect((pinned as Record<string, unknown>)[name]).toBe(defaults[name])
      })
    }
  }
})
