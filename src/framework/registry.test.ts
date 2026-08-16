import { describe, it, expect } from 'vitest'
import {
  listDiversions,
  getDiversionMeta,
  loadDiversion,
  peekDiversion,
} from './registry'

describe('registry', () => {
  it('lists at least the flow-field diversion', () => {
    const all = listDiversions()
    expect(all.some((m) => m.id === 'flow-field')).toBe(true)
  })

  it('returns an array (empty until diversions are registered)', () => {
    expect(Array.isArray(listDiversions())).toBe(true)
  })

  it('lists metadata title-sorted', () => {
    const titles = listDiversions().map((m) => m.title)
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)))
  })

  it('looks up metadata by id, synchronously', () => {
    expect(getDiversionMeta('flow-field')?.title).toBe('Flow Field')
  })

  it('returns undefined metadata for an unknown id', () => {
    expect(getDiversionMeta('nope')).toBeUndefined()
  })

  // ── the #288 lazy seam ──────────────────────────────────────────────────────
  describe('lazy loading', () => {
    it('carries no schema on the eager metadata', () => {
      // The whole point of the split. `schema` here would drag all of zod plus 137
      // schema modules back into the entry chunk (measured: +142 kB gzipped, more
      // than doubling it) for a value nothing needs until a tile mounts.
      expect(getDiversionMeta('flow-field')).not.toHaveProperty('schema')
      expect(Object.keys(getDiversionMeta('flow-field')!).sort()).toEqual([
        'description',
        'id',
        'kind',
        'title',
      ])
    })

    it('is cold before anything asks for it', () => {
      expect(peekDiversion('plasma')).toBeUndefined()
    })

    it('loads a real diversion, and peek goes warm afterwards', async () => {
      const d = await loadDiversion('plasma')
      expect(d?.title).toBe('Plasma')
      expect(typeof d?.setup).toBe('function')
      expect(d?.schema).toBeDefined() // the schema arrives WITH the module
      expect(peekDiversion('plasma')).toBe(d)
    })

    it('returns the SAME promise for repeat calls', () => {
      // Load-bearing for `use()`: it re-runs the render that suspended, so a fresh
      // promise per call would suspend forever. Identity, not just equal values.
      expect(loadDiversion('doyle-spiral')).toBe(loadDiversion('doyle-spiral'))
    })

    it('resolves undefined for a slug no meta.ts claims', async () => {
      // A genuine 404 — distinguishable from a slow network, which suspends instead.
      await expect(loadDiversion('nope')).resolves.toBeUndefined()
    })

    it('every listed diversion has a loader behind it', async () => {
      // The two globs are independent, so a metadata entry with no matching
      // index.ts would render a tile that can never load. contract.test.ts asserts
      // the slug sets match; this asserts the loader map actually resolves.
      const ids = listDiversions().map((m) => m.id)
      const loaded = await Promise.all(ids.map((id) => loadDiversion(id)))
      expect(loaded.filter(Boolean)).toHaveLength(ids.length)
    })
  })
})
