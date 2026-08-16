import { describe, expect, it } from 'vitest'
import { PICTURES, PICTURE_OPTIONS, SHUFFLE_ALL, hasPicture, rotationOrder } from './pictures'

describe('registry integrity', () => {
  it('is not empty — an empty set would leave Pictures mode permanently on contours', () => {
    expect(PICTURES.length).toBeGreaterThan(0)
  })

  it('gives every sprite a unique slug', () => {
    const slugs = PICTURES.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('slugs are url-safe: lowercase, digits and hyphens only', () => {
    for (const p of PICTURES) expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('records provenance on every entry — this is the licence audit trail', () => {
    for (const p of PICTURES) {
      expect(p.author.trim(), `${p.slug} author`).not.toBe('')
      expect(p.title.trim(), `${p.slug} title`).not.toBe('')
      expect(p.sourceUrl, `${p.slug} sourceUrl`).toMatch(/^https:\/\//)
      expect(p.license, `${p.slug} license`).toMatch(/^CC0/)
    }
  })

  it('no slug collides with the shuffle sentinel', () => {
    // A collision would make `rotationOrder` reinterpret a sprite pick as shuffle.
    for (const p of PICTURES) expect(p.slug).not.toBe(SHUFFLE_ALL)
  })
})

describe('rotationOrder', () => {
  it('returns every slug for the shuffle sentinel', () => {
    expect(rotationOrder(SHUFFLE_ALL, 1).slice().sort())
      .toEqual(PICTURES.map((p) => p.slug).sort())
  })

  it('returns exactly one slug for a sprite selection, and never advances off it', () => {
    const slug = PICTURES[0].slug
    expect(hasPicture(slug)).toBe(true)
    expect(rotationOrder(slug, 1)).toEqual([slug])
    expect(rotationOrder(slug, 99)).toEqual([slug])
  })

  it('is deterministic for a given seed and varies across seeds', () => {
    expect(rotationOrder(SHUFFLE_ALL, 7)).toEqual(rotationOrder(SHUFFLE_ALL, 7))
    // With a dozen-plus entries an identical permutation from two seeds is
    // vanishingly unlikely; a failure means the seed is not reaching the shuffle.
    expect(rotationOrder(SHUFFLE_ALL, 7)).not.toEqual(rotationOrder(SHUFFLE_ALL, 8))
  })

  it('is a permutation, not a sample — no drops, no duplicates', () => {
    const order = rotationOrder(SHUFFLE_ALL, 3)
    expect(new Set(order).size).toBe(order.length)
    expect(order.length).toBe(PICTURES.length)
  })

  it('falls back to every slug for an unknown selection, so a stale link still plays', () => {
    expect(rotationOrder('a-sprite-removed-since-that-link-was-made', 1).length)
      .toBe(PICTURES.length)
  })
})

describe('PICTURE_OPTIONS', () => {
  it('leads with the shuffle sentinel', () => {
    expect(PICTURE_OPTIONS[0]).toEqual({ value: SHUFFLE_ALL, label: 'Shuffle all' })
  })

  it('lists every sprite under its title', () => {
    for (const p of PICTURES) {
      const opt = PICTURE_OPTIONS.find((o) => o.value === p.slug)
      expect(opt, `${p.slug} missing from options`).toBeDefined()
      expect(opt!.label).toBe(p.title)
    }
  })

  it('covers exactly the selectable values, with no duplicates', () => {
    const values = PICTURE_OPTIONS.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
    expect(values.length).toBe(1 + PICTURES.length)
  })
})

describe('every registered slug has a committed PNG', () => {
  // A typo'd slug fails silently and permanently: the fetch 404s, the store is
  // fail-soft, and that sprite shows the contour map forever with nothing logged.
  // Uses Vite's glob rather than node:fs — this tsconfig has no node types.
  const onDisk = new Set(
    Object.keys(import.meta.glob('../../../public/pictures/*.png'))
      .map((path) => path.split('/').pop()!.replace(/\.png$/, '')),
  )

  it('has a file for every registered slug', () => {
    expect(onDisk.size).toBeGreaterThan(0)
    for (const p of PICTURES) expect(onDisk.has(p.slug), `${p.slug}.png missing`).toBe(true)
  })

  it('registers every file on disk, so nothing ships as dead weight', () => {
    const registered = new Set(PICTURES.map((p) => p.slug))
    for (const f of onDisk) expect(registered.has(f), `${f}.png is not registered`).toBe(true)
  })
})
