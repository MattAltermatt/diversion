import { describe, it, expect } from 'vitest'
import { abstractileSchema, type AbstractileConfig } from './schema'
import {
  buildMosaic, resolveTile, matMul, matEq, FLIPH, FLIPV, ROT180, type Mosaic,
} from './mosaic'

const cfg = (over: Partial<AbstractileConfig> = {}): AbstractileConfig =>
  abstractileSchema.parse({ ...over })

const W = 800
const H = 600

const finiteUnit = (v: number) => Number.isFinite(v) && (v === -1 || v === 0 || v === 1)

// Walk every grid cell; assert each resolves to a valid, NaN-free tile and count coverage.
function forEachCell(m: Mosaic, fn: (i: number, j: number) => void) {
  for (let j = 0; j < m.rows; j++) for (let i = 0; i < m.cols; i++) fn(i, j)
}

describe('schema', () => {
  it('parses with valid defaults', () => {
    const c = abstractileSchema.parse({})
    expect(c.gridSize).toBe(18)
    expect(c.tileSet).toBe('Mixed')
    expect(c.symmetry).toBe('Mirror')
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
    expect(/^#[0-9a-fA-F]{6}$/.test(c.background)).toBe(true)
  })
})

describe('buildMosaic — determinism', () => {
  it('same seed → identical mosaic; different seed → different', () => {
    const a = buildMosaic(cfg({ seed: 7 }), W, H)
    const b = buildMosaic(cfg({ seed: 7 }), W, H)
    const c = buildMosaic(cfg({ seed: 8 }), W, H)
    const sig = (m: Mosaic) => {
      const parts: string[] = []
      forEachCell(m, (i, j) => {
        const t = resolveTile(m, i, j)
        parts.push(`${t.family},${t.ca},${t.cb},${t.mat.a}${t.mat.b}${t.mat.c}${t.mat.d}`)
      })
      return parts.join('|')
    }
    expect(sig(a)).toBe(sig(b))
    expect(sig(a)).not.toBe(sig(c))
  })
})

describe('resolveTile — coverage + no NaN', () => {
  it('every cell resolves to a valid tile across all tile sets', () => {
    for (const tileSet of ['Triangles', 'Arcs', 'Quarters', 'Diamonds', 'Bars', 'Mixed'] as const) {
      const m = buildMosaic(cfg({ tileSet, seed: 3 }), W, H)
      let count = 0
      forEachCell(m, (i, j) => {
        const t = resolveTile(m, i, j)
        expect(t.family).toBeGreaterThanOrEqual(0)
        expect(t.family).toBeLessThan(5)
        expect(t.ca).toBeGreaterThanOrEqual(0)
        expect(t.ca).toBeLessThan(m.n)
        expect(t.cb === -1 || (t.cb >= 0 && t.cb < m.n)).toBe(true)
        expect([t.mat.a, t.mat.b, t.mat.c, t.mat.d].every(finiteUnit)).toBe(true)
        count++
      })
      expect(count).toBe(m.cols * m.rows)
    }
  })
})

// The headline: the mosaic actually obeys its chosen symmetry — a cell's tile is
// the transformed partner of its mirror/rotate/translate counterpart.
describe('symmetry invariant', () => {
  it('Mirror: cells reflect across both centre lines', () => {
    const m = buildMosaic(cfg({ symmetry: 'Mirror', tileSet: 'Mixed', seed: 5 }), W, H)
    forEachCell(m, (i, j) => {
      const t = resolveTile(m, i, j)
      const hx = resolveTile(m, m.cols - 1 - i, j) // horizontal mirror partner
      expect(hx.family).toBe(t.family)
      expect(hx.ca).toBe(t.ca)
      expect(hx.cb).toBe(t.cb)
      expect(matEq(hx.mat, matMul(FLIPH, t.mat))).toBe(true)
      const vy = resolveTile(m, i, m.rows - 1 - j) // vertical mirror partner
      expect(vy.family).toBe(t.family)
      expect(matEq(vy.mat, matMul(FLIPV, t.mat))).toBe(true)
    })
  })

  it('Rotate: cells are 180° partners about the centre', () => {
    const m = buildMosaic(cfg({ symmetry: 'Rotate', tileSet: 'Arcs', seed: 9 }), W, H)
    forEachCell(m, (i, j) => {
      const t = resolveTile(m, i, j)
      const p = resolveTile(m, m.cols - 1 - i, m.rows - 1 - j)
      expect(p.family).toBe(t.family)
      expect(p.ca).toBe(t.ca)
      expect(p.cb).toBe(t.cb)
      expect(matEq(p.mat, matMul(ROT180, t.mat))).toBe(true)
    })
  })

  it('Translate: the motif repeats every period cells', () => {
    const m = buildMosaic(cfg({ symmetry: 'Translate', tileSet: 'Quarters', seed: 4 }), W, H)
    const P = m.period
    expect(P).toBeGreaterThanOrEqual(3)
    forEachCell(m, (i, j) => {
      if (i + P >= m.cols) return
      const t = resolveTile(m, i, j)
      const p = resolveTile(m, i + P, j)
      expect(p.family).toBe(t.family)
      expect(p.ca).toBe(t.ca)
      expect(p.cb).toBe(t.cb)
      expect(matEq(p.mat, t.mat)).toBe(true)
    })
  })
})
