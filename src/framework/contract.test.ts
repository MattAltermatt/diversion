import { describe, it, expect } from 'vitest'
import type { Diversion } from './types'
import { listDiversions } from './registry'

// Contract SWEEP (#127): every diversion is a black box the framework drives, so
// each must honour the Diversion contract. Re-glob the diversion folders here
// (same pattern the registry uses) to recover each one's folder slug and assert
// it matches the declared `id` — the codec, routing, and getDiversion() all key
// off that slug. Auto-covers any future diversion folder.

const modules = import.meta.glob<{ default: Diversion }>('../diversions/*/index.ts', { eager: true })

/** `../diversions/<slug>/index.ts` → `<slug>`. */
function slugOf(path: string): string {
  return path.replace(/.*\/diversions\/([^/]+)\/index\.ts$/, '$1')
}

describe('diversion contract sweep (#127)', () => {
  const entries = Object.entries(modules).map(([path, m]) => [slugOf(path), m.default] as const)

  it('discovers every diversion the registry lists', () => {
    expect(entries.map(([s]) => s).sort()).toEqual(listDiversions().map((d) => d.id).sort())
  })

  for (const [slug, d] of entries) {
    describe(`${slug}`, () => {
      it('id equals its folder slug', () => {
        expect(d.id).toBe(slug)
      })

      it("kind is '2d', 'webgl', or 'webgpu'", () => {
        expect(['2d', 'webgl', 'webgpu']).toContain(d.kind)
      })

      it('has a non-empty title and description', () => {
        expect(typeof d.title).toBe('string')
        expect(d.title.length).toBeGreaterThan(0)
        expect(typeof d.description).toBe('string')
        expect(d.description.length).toBeGreaterThan(0)
      })

      it('schema.parse({}) resolves (all fields defaulted)', () => {
        expect(() => d.schema.parse({})).not.toThrow()
      })

      it('declares the required draw methods with sane arity', () => {
        expect(typeof d.setup).toBe('function')
        expect(typeof d.frame).toBe('function')
        // setup(ctx, config, size) ≤ 3 ; frame(state, ctx, t, dt) ≤ 4 params.
        expect(d.setup.length).toBeGreaterThanOrEqual(1)
        expect(d.setup.length).toBeLessThanOrEqual(3)
        expect(d.frame.length).toBeGreaterThanOrEqual(1)
        expect(d.frame.length).toBeLessThanOrEqual(4)
      })

      it('optional lifecycle hooks, when present, are functions with sane arity', () => {
        if (d.resize) {
          expect(typeof d.resize).toBe('function')
          expect(d.resize.length).toBeLessThanOrEqual(3) // (state, size, ctx)
        }
        if (d.update) {
          expect(typeof d.update).toBe('function')
          expect(d.update.length).toBeLessThanOrEqual(3) // (state, config, size)
        }
        if (d.teardown) {
          expect(typeof d.teardown).toBe('function')
          expect(d.teardown.length).toBeLessThanOrEqual(1) // (state)
        }
      })
    })
  }
})
