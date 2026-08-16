import { describe, it, expect } from 'vitest'
// @ts-expect-error tsconfig.app exposes only vite/client types; node's are not
// widened into the app for one test file. Same idiom as manifest.test.ts.
import { readFileSync, readdirSync } from 'node:fs'
// @ts-expect-error — see above.
import { join } from 'node:path'
import { listDiversions } from './registry'
import { allDiversionEntries } from './testRegistry'

// Contract SWEEP (#127): every diversion is a black box the framework drives, so
// each must honour the Diversion contract. Sweeps the folder slugs recovered by the
// test registry's eager glob and asserts each matches the declared `id` — the codec
// and routing both key off that slug. Auto-covers any future diversion folder.

describe('diversion contract sweep (#127)', () => {
  const entries = allDiversionEntries

  // ── #288 keystone ───────────────────────────────────────────────────────────
  // The registry now reads identity from meta.ts (eager) and code from index.ts
  // (lazy). Those are two separate globs, so they can disagree — and every way they
  // disagree is SILENT: no type error, nothing thrown, just a diversion that is
  // missing from the gallery or whose card lies about what it links to. These are
  // the only things standing between a contributor and that hole.
  it('every diversion folder has BOTH meta.ts and index.ts', () => {
    // A folder with index.ts but no meta.ts vanishes from the gallery and 404s its
    // route; one with meta.ts but no index.ts renders a tile that cannot load.
    expect(listDiversions().map((m) => m.id).sort()).toEqual(entries.map(([s]) => s).sort())
  })

  it('no production module imports the test-only eager registry', () => {
    // testRegistry.ts eager-globs all 137 implementations. A single production
    // import of it silently restores the 1.9 MB entry chunk and undoes #288
    // entirely — with the full suite still green, because the tests are exactly
    // what keeps using it. Nothing else can catch this.
    const offenders: string[] = []
    let scanned = 0
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          scanned++
          if (/from ['"].*testRegistry['"]/.test(readFileSync(p, 'utf8'))) offenders.push(p)
        }
      }
    }
    walk('src')
    // Non-vacuity: a wrong CWD or a changed layout would walk nothing and pass this
    // test while guarding nothing. 137 diversions alone put the real count in the
    // hundreds, so this floor cannot be met by accident.
    expect(scanned).toBeGreaterThan(200)
    expect(offenders).toEqual([])
  })

  for (const [slug, d] of entries) {
    it(`${slug}: meta.ts is the source of truth index.ts spreads`, () => {
      // index.ts does `...meta`, so these are the same object's fields — unless
      // someone re-declares one AFTER the spread, which silently wins over the card
      // the gallery renders. (Re-declaring BEFORE the spread is the opposite bug:
      // their edit is silently discarded. That one is unguarded by design — the
      // committed value still equals meta, so there is nothing to compare against.)
      const m = listDiversions().find((x) => x.id === d.id)
      expect(m).toEqual({
        id: d.id,
        title: d.title,
        description: d.description,
        kind: d.kind,
      })
    })
  }

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
