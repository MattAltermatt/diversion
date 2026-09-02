import { describe, it, expect, beforeEach, vi } from 'vitest'
import { putImage, clearImage } from '../../framework/imageStore'
import { salvageSchema } from './schema'
import { createState, step, applyConfig } from './salvage'
import { MOUND, PICTURE } from './grid'

// A 16x16 three-colour upload with a transparent 4x4 hole: realistic for a sprite.
function upload(id = 'fixture') {
  const w = 16, h = 16
  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const hole = x >= 6 && x < 10 && y >= 6 && y < 10
    const v = y < 5 ? 60 : y < 11 ? 140 : 220
    pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v; pixels[i + 3] = hole ? 0 : 255
  }
  putImage({ id, dataUrl: 'data:,', width: w, height: h, pixels })
  return id
}

const size = { width: 1000, height: 600 }
beforeEach(() => { clearImage(); vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in tests')))) })

describe('createState', () => {
  it('lays the picture out left and the nest right, at a realistic ratio, with the hole unreachable', () => {
    const cfg = salvageSchema.parse({ source: 'Yours', image: upload(), cellSize: 10, colors: 3, seed: 3 })
    const s = createState(cfg, size)
    expect(s.hasPicture).toBe(true)
    expect(s.cols).toBe(100); expect(s.rows).toBe(60)
    expect(s.palette.length).toBe(3)
    // 40% of 100 cols = 40 cells for 16 blocks → k = 2 → 32 cells wide.
    expect(s.picCols).toBe(32)
    expect(s.picOriginCol + s.picCols).toBeLessThan(s.nestSeed % s.cols)
    // The hole's cells are free but not reachable; the border is reachable.
    const holeCell = (s.picOriginRow + 7 * 2) * s.cols + s.picOriginCol + 7 * 2
    expect(s.grid.occ[holeCell]).toBe(0)
    expect(s.grid.reach[holeCell]).toBe(0)
    expect(s.grid.reach[0]).toBe(1)
    // The forbidden mask covers the picture box + margin and the border.
    expect(s.grid.forbid[holeCell]).toBe(1)
    expect(s.grid.forbid[0]).toBe(1)
    expect(s.grid.forbid[s.nestSeed]).toBe(0)
  })

  it('survives a cold store: no picture, and the upload landing later builds it', () => {
    const cfg = salvageSchema.parse({ source: 'Yours', seed: 3 })
    const s = createState(cfg, size)
    expect(s.hasPicture).toBe(false)
    expect(() => step(s, 0.05)).not.toThrow()
    upload()
    step(s, 0.05)
    expect(s.hasPicture).toBe(true)
  })

  it('does not re-resolve the picture every frame while cold', () => {
    const cfg = salvageSchema.parse({ source: 'Pictures', seed: 3 })
    const s = createState(cfg, size)
    const fetches = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    for (let i = 0; i < 50; i++) step(s, 0.05)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetches)
  })
})

describe('the loop', () => {
  const run = (seed: number) => {
    const cfg = salvageSchema.parse({ source: 'Yours', image: upload(), cellSize: 10, colors: 3, seed, tempo: 4 })
    const s = createState(cfg, size)
    let steps = 0
    // Run until the NEXT picture is built, not merely until the counter ticks at the swap.
    while ((s.generation < 1 || s.phase === 'swap') && steps++ < 40000) step(s, 0.05)
    return { s, steps }
  }

  it('dismantles the whole picture to the mound, rests, fades, and shows the next picture', () => {
    const { s, steps } = run(11)
    expect(steps).toBeLessThan(40000)
    expect(s.generation).toBe(1)
    expect(s.grid.occ.some((v) => v === MOUND)).toBe(false)
    expect(s.chunks.length).toBeGreaterThan(0)
    expect(s.chunks.every((c) => c.where === 'picture')).toBe(true)
    expect(s.grid.occ.some((v) => v === PICTURE)).toBe(true)
    expect(s.phase === 'fadeIn' || s.phase === 'dismantle').toBe(true)
  }, 60000)

  it('never places a mound cell inside the forbidden mask', () => {
    const cfg = salvageSchema.parse({ source: 'Yours', image: upload(), cellSize: 10, colors: 3, seed: 2, tempo: 4 })
    const s = createState(cfg, size)
    for (let i = 0; i < 5000 && s.phase === 'dismantle'; i++) {
      step(s, 0.05)
      for (let c = 0; c < s.grid.occ.length; c++) if (s.grid.occ[c] === MOUND) expect(s.grid.forbid[c]).toBe(0)
    }
    expect(s.phase).not.toBe('dismantle')
  }, 60000)

  it('is deterministic for a seed', () => {
    const a = run(5), b = run(5)
    expect(a.steps).toBe(b.steps)
    expect(Array.from(a.s.grid.occ)).toEqual(Array.from(b.s.grid.occ))
  }, 60000)
})

describe('applyConfig', () => {
  it('applies tempo, strength, drones, glyph and background live; rebuilds for structural keys', () => {
    const base = salvageSchema.parse({ source: 'Yours', image: upload(), seed: 3, colors: 3 })
    const s = createState(base, size)
    const before = s.palette.slice()
    expect(applyConfig(s, { ...base, tempo: 2, strength: 9, drones: 50, glyph: 'Ant', trailFade: 5 }, size)).toBe(true)
    expect(s.cfg.tempo).toBe(2)
    expect(applyConfig(s, { ...base, background: '#e8e8ee' }, size)).toBe(true)
    expect(s.palette).not.toEqual(before) // re-stretched against a light ground
    expect(applyConfig(s, { ...base, cellSize: 8 }, size)).toBe(false)
    expect(applyConfig(s, { ...base, colors: 4 }, size)).toBe(false)
    expect(applyConfig(s, { ...base, chunkSize: 3 }, size)).toBe(false)
  })
})

describe('the wave', () => {
  it('at defaults a dominant colour forms during the middle of the dismantle', () => {
    // Piece size 4 so the 16x16 fixture yields ~60 pieces and the middle of the job is long
    // enough to sample.
    const cfg = salvageSchema.parse({ source: 'Yours', image: upload(), cellSize: 10, colors: 3, seed: 9, tempo: 4, chunkSize: 4 })
    const s = createState(cfg, size)
    const total = s.chunks.length
    const shares: number[] = []
    let steps = 0
    while (s.phase === 'dismantle' && steps++ < 40000) {
      step(s, 0.05)
      const left = s.chunks.filter((c) => c.where === 'picture').length
      if (left < total * 0.8 && left > total * 0.2 && steps % 5 === 0) {
        const counts = new Map<number, number>()
        let tinted = 0
        for (const d of s.drones) if (d.tint >= 0) { tinted++; counts.set(d.tint, (counts.get(d.tint) ?? 0) + 1) }
        if (tinted >= 10) shares.push(Math.max(...counts.values()) / tinted)
      }
    }
    expect(shares.length).toBeGreaterThan(5)
    const mean = shares.reduce((a, b) => a + b, 0) / shares.length
    expect(mean).toBeGreaterThan(0.4)
  }, 60000)
})
