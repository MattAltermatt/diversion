import { describe, it, expect } from 'vitest'
import { buildField, buildFieldFromIndices, cellAt, type FieldOptions } from './field'

const OPTS: FieldOptions = {
  seed: 1234, cols: 60, rows: 40, bands: 6, featureSize: 12, roughness: 0.5,
}

function bandCounts(f: ReturnType<typeof buildField>): number[] {
  const counts = new Array<number>(f.bands).fill(0)
  for (const v of f.idx) counts[v]++
  return counts
}

describe('buildField', () => {
  it('is deterministic — same seed gives an identical grid', () => {
    const a = buildField(OPTS)
    const b = buildField(OPTS)
    expect(Array.from(b.idx)).toEqual(Array.from(a.idx))
  })

  it('a different seed gives a different grid', () => {
    const a = buildField(OPTS)
    const b = buildField({ ...OPTS, seed: 9999 })
    expect(Array.from(b.idx)).not.toEqual(Array.from(a.idx))
  })

  it('starts fully alive', () => {
    const f = buildField(OPTS)
    expect(f.aliveCount).toBe(f.cols * f.rows)
    expect(Array.from(f.alive).every((v) => v === 1)).toBe(true)
  })

  it('uses every palette index (the quantile guarantee)', () => {
    for (const seed of [1, 2, 3, 4, 5, 1234, 88888]) {
      const f = buildField({ ...OPTS, seed })
      for (const [band, count] of bandCounts(f).entries()) {
        expect(count, `seed ${seed} band ${band}`).toBeGreaterThan(0)
      }
    }
  })

  it('gives every band roughly equal mass', () => {
    // Bounded on BOTH sides — a lower bound alone would pass a regression that
    // dumped most of the picture into one band, which is exactly what the quantile
    // cut exists to prevent.
    const f = buildField(OPTS)
    const ideal = (f.cols * f.rows) / f.bands
    for (const c of bandCounts(f)) {
      expect(c).toBeGreaterThan(ideal * 0.75)
      expect(c).toBeLessThan(ideal * 1.25)
    }
  })

  it('holds equal mass at the widest palette too', () => {
    const f = buildField({ ...OPTS, bands: 24 })
    const ideal = (f.cols * f.rows) / f.bands
    for (const c of bandCounts(f)) {
      expect(c).toBeGreaterThan(ideal * 0.6)
      expect(c).toBeLessThan(ideal * 1.4)
    }
  })

  it('bands step by one between neighbours at a smooth feature size', () => {
    // The layer-peeling property (spec §2). Guaranteed only when the field is
    // sampled densely relative to its features — a steep field crossed by thin
    // bands can skip. featureSize 20 with 5 bands never does.
    const f = buildField({ ...OPTS, featureSize: 20, bands: 5, roughness: 0.35 })
    let maxJump = 0
    for (let row = 0; row < f.rows; row++) {
      for (let col = 0; col < f.cols; col++) {
        const here = f.idx[cellAt(f, col, row)]
        if (col + 1 < f.cols) maxJump = Math.max(maxJump, Math.abs(here - f.idx[cellAt(f, col + 1, row)]))
        if (row + 1 < f.rows) maxJump = Math.max(maxJump, Math.abs(here - f.idx[cellAt(f, col, row + 1)]))
      }
    }
    expect(maxJump).toBe(1)
  })

  it('honours the requested band count', () => {
    const f = buildField({ ...OPTS, bands: 2 })
    expect(f.bands).toBe(2)
    expect(Array.from(f.idx).every((v) => v === 0 || v === 1)).toBe(true)
  })

  it('cellAt indexes row-major', () => {
    const f = buildField({ ...OPTS, cols: 5, rows: 4 })
    expect(cellAt(f, 0, 0)).toBe(0)
    expect(cellAt(f, 4, 0)).toBe(4)
    expect(cellAt(f, 0, 1)).toBe(5)
    expect(cellAt(f, 4, 3)).toBe(19)
  })

  it('survives a single-band palette without dividing by zero', () => {
    const f = buildField({ ...OPTS, bands: 1 })
    expect(Array.from(f.idx).every((v) => v === 0)).toBe(true)
  })
})

describe('buildFieldFromIndices (#278)', () => {
  it('wraps indices as a fully-alive field', () => {
    const f = buildFieldFromIndices(new Uint8Array([0, 1, 1, 0, 2, 2]), 3, 2, 3)
    expect(f.cols).toBe(3)
    expect(f.rows).toBe(2)
    expect(f.bands).toBe(3)
    expect(f.aliveCount).toBe(6)
    expect(Array.from(f.alive)).toEqual([1, 1, 1, 1, 1, 1])
    expect(Array.from(f.idx)).toEqual([0, 1, 1, 0, 2, 2])
  })

  it('copies rather than aliasing — a re-peel must not share mutable state', () => {
    const src = new Uint8Array([0, 1])
    const f = buildFieldFromIndices(src, 2, 1, 2)
    src[0] = 1
    expect(f.idx[0]).toBe(0)
    f.alive[0] = 0
    expect(Array.from(src)).toEqual([1, 1])
  })
})
