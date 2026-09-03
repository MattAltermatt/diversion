import { describe, it, expect, beforeEach, vi } from 'vitest'
import { putImage, clearImage } from '../../framework/imageStore'
import { salvageSchema } from './schema'
import { createState, step, applyConfig, resizeState, geometry, cellFor } from './salvage'
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

const size = { width: 1000, height: 600 }   // derives cell 7: a 142x85 arena, the 16 px fixture at k 3
// The cell is derived from the canvas (ARENA_COLS x ARENA_ROWS), so the way to a small, fast arena is a
// small canvas: 380x240 derives cell 4 — a 95x60 arena with the fixture at k 2 (32 cells),
// the regime the loop tests were budgeted on.
const loopSize = { width: 380, height: 240 }
beforeEach(() => { clearImage(); vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in tests')))) })

describe('createState', () => {
  it('lays the picture out left and the nest right, at a realistic ratio, with the hole unreachable', () => {
    const cfg = salvageSchema.parse({ source: 'Yours', image: upload(), colors: 3, seed: 3 })
    const s = createState(cfg, size)
    expect(s.hasPicture).toBe(true)
    expect(s.cell).toBe(7); expect(s.cols).toBe(142); expect(s.rows).toBe(85)
    expect(s.palette.length).toBe(3)
    // Box 56x59 cells for 16 blocks → largest whole fill k = 3 → 48 cells wide.
    expect(s.picCols).toBe(48)
    expect(s.picOriginCol + s.picCols).toBeLessThan(s.nestSeed % s.cols)
    // The hole's cells are free but not reachable; the border is reachable.
    const holeCell = (s.picOriginRow + 7 * 3) * s.cols + s.picOriginCol + 7 * 3
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
    const cfg = salvageSchema.parse({ source: 'Yours', image: upload(), colors: 3, seed, tempo: 4 })
    const s = createState(cfg, loopSize)
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

  it('finishes a dismantle at the SHIPPED arena with the default piece size (the fill rule is bounded by this)', () => {
    // 1440x900 → cell 10, 144x90; the 16 px fixture is k 3 = 48x48 cells, 12-block pieces
    // of 108 cells. Nearest-fill (k 4: 64x64, 192-cell pieces) stalled here at 21/24 pieces.
    const cfg = salvageSchema.parse({ source: 'Yours', image: upload(), colors: 3, seed: 11, tempo: 4 })
    const s = createState(cfg, { width: 1440, height: 900 })
    expect(s.cell).toBe(10); expect(s.picCols).toBe(48)
    let steps = 0
    while (s.generation < 1 && steps++ < 40000) step(s, 0.05)
    expect(s.generation).toBe(1)
  }, 120000)

  it('never places a mound cell inside the forbidden mask', () => {
    const cfg = salvageSchema.parse({ source: 'Yours', image: upload(), colors: 3, seed: 2, tempo: 4 })
    const s = createState(cfg, loopSize)
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

describe('the Contours source', () => {
  const run = (seed: number) => {
    const cfg = salvageSchema.parse({ source: 'Contours', colors: 4, seed, tempo: 4 })
    const s = createState(cfg, loopSize)
    let steps = 0
    while ((s.generation < 1 || s.phase === 'swap') && steps++ < 60000) step(s, 0.05)
    return { s, steps }
  }

  it('builds a solid rectangle of every band with no store at all, sized to the box cap', () => {
    const cfg = salvageSchema.parse({ source: 'Contours', colors: 5, seed: 1 })
    const s = createState(cfg, size)
    expect(s.hasPicture).toBe(true)
    expect(s.palette).toHaveLength(5)
    expect(new Set(s.chunks.map((c) => c.color)).size).toBe(5)
    // 142x85 cells → box 56x59 → longer side 59 > 48 → k = 2, 28x29 blocks drawn 2 cells each.
    expect(s.picCols).toBe(56)
    expect(s.picRows).toBe(58)
    let covered = 0
    for (const v of s.grid.occ) if (v === PICTURE) covered++
    expect(covered).toBe(56 * 58)
  })

  it('caps the longer side at 48 blocks on a big arena by scaling blocks up', () => {
    const cfg = salvageSchema.parse({ source: 'Contours', seed: 1 })
    const s = createState(cfg, { width: 1920, height: 1080 })
    // 1920x1080 derives cell 12: 160x90 cells → box 64x63 → k = 2 → 32x31 blocks drawn
    // 2 cells each. (The arena is a fixed cell COUNT, so a big screen is not a big grid.)
    expect(s.picCols).toBe(64)
    expect(s.picRows).toBe(62)
    expect(s.chunks.every((c) => c.at!.length % 4 === 0)).toBe(true)
  })

  it('dismantles a whole map to the mound and a DIFFERENT map fades in next', () => {
    const before = run(9)
    expect(before.steps).toBeLessThan(60000)
    expect(before.s.generation).toBe(1)
    expect(before.s.hasPicture).toBe(true)
    const first = createState(salvageSchema.parse({ source: 'Contours', colors: 4, seed: 9, tempo: 4 }), size)
    expect(first.chunks.map((c) => c.color).join()).not.toBe(before.s.chunks.map((c) => c.color).join())
  }, 60000)

  it('is deterministic for a seed', () => {
    const a = run(4), b = run(4)
    expect(a.steps).toBe(b.steps)
    expect(Array.from(a.s.grid.occ)).toEqual(Array.from(b.s.grid.occ))
  }, 60000)

  it('repaints live for a palette change — same bands, new colours, mound kept — and rebuilds for the generator knobs', () => {
    const cfg = salvageSchema.parse({ source: 'Contours', seed: 1, colors: 4 })
    const s = createState(cfg, size)
    const idxBefore = s.chunks.map((c) => c.color).join()
    expect(applyConfig(s, { ...cfg, palette: [...cfg.palette] }, size)).toBe(true)
    // A ramp that clears the dark ground on its own, so it comes back verbatim.
    const next = { ...cfg, palette: ['#505070', '#ffffff'] }
    expect(applyConfig(s, next, size)).toBe(true)
    expect(s.palette).toHaveLength(4)
    expect(s.palette[0]).toBe('#505070')
    expect(s.palette[3]).toBe('#ffffff')
    expect(s.chunks.map((c) => c.color).join()).toBe(idxBefore)
    expect(s.dirty).toEqual([-1])
    // A pale ground is live too, and pulls the ramp under the ceiling rather than
    // letting the lightest band vanish.
    s.dirty = []
    expect(applyConfig(s, { ...next, background: '#f0f0f0' }, size)).toBe(true)
    expect(s.palette[3]).not.toBe('#ffffff')
    expect(s.dirty).toEqual([-1])
    expect(applyConfig(s, { ...next, featureSize: 20 }, size)).toBe(false)
    expect(applyConfig(s, { ...next, roughness: 0.9 }, size)).toBe(false)
  })
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
    expect(applyConfig(s, { ...base, colors: 4 }, size)).toBe(false)
    expect(applyConfig(s, { ...base, chunkSize: 3 }, size)).toBe(false)
  })
})

describe('a resize (#319)', () => {
  // The cell is derived from the canvas, so a resize is the one thing that moves it. That
  // path used to be the host's fallback — setup() again: generation 0, the mound gone, every
  // drone respawned onto the same seeded layout. It is a re-grid of the SAME run.
  it('re-grids in place: same generation and sprite, rng and clock carried, drones kept where they stood', () => {
    const base = salvageSchema.parse({ source: 'Yours', image: upload(), seed: 3, colors: 3 })
    const s = createState(base, size)
    expect(s.cell).toBe(7)
    for (let i = 0; i < 40; i++) step(s, 0.05)
    s.generation = 4 // pretend the run is deep in its rotation
    const key = s.arenaKey, time = s.time, rand = s.rand
    const before = s.drones.map((d) => ({ x: d.x * s.cell, y: d.y * s.cell }))
    resizeState(s, { width: 1400, height: 900 })
    expect(s.cell).toBe(10); expect(s.cols).toBe(140); expect(s.rows).toBe(90)
    expect(s.generation).toBe(4)
    expect(s.time).toBe(time)
    expect(s.rand).toBe(rand)
    expect(s.arenaKey).not.toBe(key) // the arena WAS rebuilt (cols moved)
    expect(s.hasPicture).toBe(true)
    expect(s.drones.length).toBe(before.length)
    // Every drone is within a cell of its old pixel position, except one that was standing
    // where the new picture (plus its forbidden margin) landed, which is nudged off it.
    let near = 0
    for (let i = 0; i < before.length; i++) {
      const d = s.drones[i]
      if (Math.hypot(d.x * s.cell - before[i].x, d.y * s.cell - before[i].y) <= s.cell) { near++; continue }
      const oldCol = Math.floor(before[i].x / s.cell), oldRow = Math.floor(before[i].y / s.cell)
      expect(s.grid.forbid[oldRow * s.cols + oldCol], `drone ${i} moved without cause`).toBe(1)
    }
    expect(near).toBeGreaterThanOrEqual(before.length * 0.5)
    // And the run continues: nothing holds a stale path into the old grid.
    for (let i = 0; i < 40; i++) step(s, 0.05)
    expect(s.drones.every((d) => d.x >= 0 && d.x <= s.cols && d.y >= 0 && d.y <= s.rows)).toBe(true)
  })

  it('a sweep of resizes is one run, not a restart per size', () => {
    const base = salvageSchema.parse({ source: 'Yours', image: upload(), seed: 3, colors: 3 })
    const s = createState(base, size)
    s.generation = 2
    for (let i = 0; i < 40; i++) step(s, 0.05)
    const rand = s.rand
    for (const w of [900, 800, 700, 600, 500, 400, 600, 800, 1000, 1200, 1400]) {
      resizeState(s, { width: w, height: Math.floor(w * 0.6) }); step(s, 0.016)
    }
    expect(s.generation).toBe(2)
    expect(s.rand).toBe(rand)
    expect(s.cell).toBe(cellFor({ width: 1400, height: 840 }))
    expect(s.cols).toBe(Math.floor(1400 / s.cell))
  })

  it('a resize that moves no grid line keeps the mound and the phase', () => {
    const base = salvageSchema.parse({ source: 'Yours', image: upload(), seed: 3, colors: 3 })
    const s = createState(base, size)
    for (let i = 0; i < 40; i++) step(s, 0.05)
    const key = s.arenaKey, occ = Array.from(s.grid.occ), drones = s.drones.map((d) => [d.x, d.y, d.state])
    s.phase = 'rest'
    resizeState(s, { width: 999, height: 599 }) // still cell 7, 142x85
    expect(s.size).toEqual({ width: 999, height: 599 })
    expect(s.arenaKey).toBe(key)
    expect(Array.from(s.grid.occ)).toEqual(occ)
    expect(s.drones.map((d) => [d.x, d.y, d.state])).toEqual(drones)
    expect(s.phase).toBe('rest')
  })

  it('cellFor: the arena is a fixed number of cells, clamped to the old slider range', () => {
    expect(cellFor({ width: 1440, height: 900 })).toBe(10)   // the shipped default arena, 144x90
    expect(cellFor({ width: 1000, height: 600 })).toBe(7)
    expect(cellFor({ width: 1920, height: 1080 })).toBe(12)  // 160x90
    expect(cellFor({ width: 3440, height: 1440 })).toBe(16)  // ultrawide keeps 90 ROWS (215x90), not 72
    expect(cellFor({ width: 390, height: 700 })).toBe(4)     // portrait: the width is the tight side
    expect(cellFor({ width: 300, height: 190 })).toBe(4)     // a gallery tile floors at CELL_MIN
    expect(cellFor({ width: 3840, height: 2160 })).toBe(24)  // 4K ceilings at CELL_MAX: 160x90 cells
    expect(cellFor({ width: 100, height: 100 })).toBe(4)
    expect(cellFor({ width: 9000, height: 9000 })).toBe(24)
  })
})

describe('geometry', () => {
  const pictures = salvageSchema.parse({ source: 'Pictures' })
  it('fits a sprite that overflows the box by ONE scale, so the forbidden box is the art\'s box', () => {
    // 390 px phone at cell 10: 39x70 cells, box 15x49. A 32x63 sprite cannot fit at k = 1;
    // the old fallback clamped each axis alone and walled off 15x49 around 15x30 of art.
    const g = geometry(pictures, 39, 70, 32, 63)
    expect(g.k).toBe(1)
    expect(g.picCols).toBeLessThanOrEqual(15)
    expect(g.picRows).toBeLessThanOrEqual(49)
    expect(Math.abs(g.picRows / g.picCols - 63 / 32)).toBeLessThan(0.15)
  })
  it('keeps the shipped fill at the shipped arena: one block per sprite pixel at the largest whole fill', () => {
    // 144x90 cells (1440x900), box 57x62: 48 / 32 / 48 cells (83% / 55% / 84% of the box).
    // Nearest-fill (64 / 64 / 48) was benched and stalls the mound — see geometry().
    expect(geometry(pictures, 144, 90, 16, 16)).toMatchObject({ bw: 16, bh: 16, k: 3, picCols: 48, picRows: 48 })
    expect(geometry(pictures, 144, 90, 32, 32)).toMatchObject({ k: 1, picCols: 32 })
    expect(geometry(pictures, 144, 90, 48, 48)).toMatchObject({ k: 1, picCols: 48 })
    // A tall sprite gets one cell per pixel: a 62-cell box cannot hold two rows per pixel.
    expect(geometry(pictures, 144, 90, 21, 40)).toMatchObject({ k: 1, picCols: 21, picRows: 40 })
  })
  it('holds the composition for every sprite and viewport: inside the cap, clear of the border and the nest', () => {
    const yours = salvageSchema.parse({ source: 'Yours' })
    const sizes = [[300, 190], [390, 700], [1000, 600], [1440, 900], [3440, 1440], [3840, 2160]]
    const sprites = [[16, 16], [21, 40], [32, 32], [32, 63], [48, 48], [64, 64], [200, 120]]
    for (const [w, h] of sizes) for (const [iw, ih] of sprites) {
      const cell = cellFor({ width: w, height: h })
      const cols = Math.floor(w / cell), rows = Math.floor(h / cell)
      const cfg = Math.max(iw, ih) <= 48 ? pictures : yours
      const g = geometry(cfg, cols, rows, iw, ih)
      const why = `${w}x${h} cell ${cell} sprite ${iw}x${ih}`
      expect(Number.isInteger(g.k) && g.k >= 1, why).toBe(true)
      expect(g.picCols, why).toBeLessThanOrEqual(Math.max(Math.floor(cols * 0.4), Math.floor(cols * 0.54) - 4))
      expect(g.picRows, why).toBeLessThanOrEqual(Math.max(Math.floor(rows * 0.7), Math.floor(rows * 0.85)))
      expect(g.originCol, why).toBeGreaterThanOrEqual(2)
      expect(g.originCol + g.picCols + 2, why).toBeLessThan(g.seedCol)
      expect(g.originRow, why).toBeGreaterThanOrEqual(0)
      expect(g.originRow + g.picRows, why).toBeLessThanOrEqual(rows)
    }
  })
  it('gives a photograph blocks in its own aspect, not the box\'s', () => {
    const yours = salvageSchema.parse({ source: 'Yours' })
    const g = geometry(yours, 144, 90, 400, 100)
    expect(g.bw).toBe(48); expect(g.bh).toBe(12)
    expect(g.picCols).toBeLessThanOrEqual(57)
  })
})

describe('the wave', () => {
  it('at defaults a dominant colour forms during the middle of the dismantle', () => {
    // Piece size 4 so the 16x16 fixture yields ~60 pieces and the middle of the job is long
    // enough to sample.
    const cfg = salvageSchema.parse({ source: 'Yours', image: upload(), colors: 3, seed: 9, tempo: 4, chunkSize: 4 })
    const s = createState(cfg, loopSize)
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
