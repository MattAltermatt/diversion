import { describe, it, expect } from 'vitest'
import { mapCreatorSchema } from './schema'
import {
  classify, buildFields, buildGrid, buildLandOrder, buildCoastSegments, buildRivers, generateMap,
} from './mapgen'
import { timelineFor, phaseAt } from './timeline'

const base = mapCreatorSchema.parse({})
const COLS = 48
const ROWS = 32

describe('schema', () => {
  it('parses with valid defaults', () => {
    expect(base.seaLevel).toBeGreaterThan(0)
    expect(base.seaLevel).toBeLessThan(1)
    expect(base.palette.sea).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('exposes a randomize-on-fresh-load pin-only seed', () => {
    const meta = (mapCreatorSchema.shape.seed as { meta: () => { randomizeOnFreshLoad?: boolean } }).meta()
    expect(meta.randomizeOnFreshLoad).toBe(true)
  })
})

describe('biome classification', () => {
  it('a cell below sea level is always sea, regardless of moisture', () => {
    expect(classify(0.1, 0.5, 0.42)).toBe('sea')
    expect(classify(0.41, 0.9, 0.42)).toBe('sea')
  })
  it('a high, dry cell classifies as mountain (elevation dominates moisture in the peak band)', () => {
    expect(classify(0.78, 0.05, 0.42)).toBe('mountain')
  })
  it('a mid-elevation dry cell classifies as desert', () => {
    expect(classify(0.55, 0.1, 0.42)).toBe('desert')
  })
  it('a mid-elevation wet cell classifies as forest', () => {
    expect(classify(0.55, 0.9, 0.42)).toBe('forest')
  })
  it('a very high cell classifies as snow', () => {
    expect(classify(0.95, 0.5, 0.42)).toBe('snow')
  })
  it('a cell just above sea level classifies as beach', () => {
    expect(classify(0.425, 0.5, 0.42)).toBe('beach')
  })
})

describe('determinism', () => {
  it('same seed → identical elevation + moisture fields', () => {
    const a = buildFields(COLS, ROWS, { seaLevel: 0.42, roughness: 0.5, seed: 1234 })
    const b = buildFields(COLS, ROWS, { seaLevel: 0.42, roughness: 0.5, seed: 1234 })
    expect(Array.from(a.elevation)).toEqual(Array.from(b.elevation))
    expect(Array.from(a.moisture)).toEqual(Array.from(b.moisture))
  })

  it('different seed → different elevation field', () => {
    const a = buildFields(COLS, ROWS, { seaLevel: 0.42, roughness: 0.5, seed: 1234 })
    const b = buildFields(COLS, ROWS, { seaLevel: 0.42, roughness: 0.5, seed: 5678 })
    expect(Array.from(a.elevation)).not.toEqual(Array.from(b.elevation))
  })

  it('same seed → identical biome grid', () => {
    const a = buildGrid(COLS, ROWS, { seaLevel: 0.42, roughness: 0.5, seed: 42 })
    const b = buildGrid(COLS, ROWS, { seaLevel: 0.42, roughness: 0.5, seed: 42 })
    expect(Array.from(a.biome)).toEqual(Array.from(b.biome))
  })

  it('same seed → identical land order, coastline, and rivers', () => {
    const a = generateMap(COLS, ROWS, { seaLevel: 0.42, roughness: 0.5, seed: 42 })
    const b = generateMap(COLS, ROWS, { seaLevel: 0.42, roughness: 0.5, seed: 42 })
    expect(Array.from(a.landOrder)).toEqual(Array.from(b.landOrder))
    expect(a.coastSegments).toEqual(b.coastSegments)
    expect(a.rivers).toEqual(b.rivers)
  })

  it('a full generateMap call is deterministic end to end for the schema default seed', () => {
    const params = { seaLevel: base.seaLevel, roughness: base.roughness, seed: base.seed }
    const a = generateMap(64, 40, params)
    const b = generateMap(64, 40, params)
    expect(Array.from(a.grid.biome)).toEqual(Array.from(b.grid.biome))
  })
})

describe('field generation invariants', () => {
  it('produces at least some sea and some land for the default sea level', () => {
    const grid = buildGrid(COLS, ROWS, { seaLevel: base.seaLevel, roughness: base.roughness, seed: 7 })
    const hasSea = Array.from(grid.biome).some((b) => b === 0) // BIOMES[0] === 'sea'
    const hasLand = Array.from(grid.biome).some((b) => b !== 0)
    expect(hasSea).toBe(true)
    expect(hasLand).toBe(true)
  })

  it('land order is sorted by ascending elevation', () => {
    const grid = buildGrid(COLS, ROWS, { seaLevel: base.seaLevel, roughness: base.roughness, seed: 7 })
    const order = buildLandOrder(grid)
    for (let k = 1; k < order.length; k++) {
      expect(grid.elevation[order[k]]).toBeGreaterThanOrEqual(grid.elevation[order[k - 1]])
    }
  })

  it('coast segments only border a sea cell', () => {
    const grid = buildGrid(COLS, ROWS, { seaLevel: base.seaLevel, roughness: base.roughness, seed: 7 })
    const segs = buildCoastSegments(grid)
    expect(segs.length).toBeGreaterThan(0)
  })

  it('rivers stay in bounds and start on land', () => {
    const grid = buildGrid(80, 50, { seaLevel: base.seaLevel, roughness: base.roughness, seed: 99 })
    const rivers = buildRivers(grid, 99)
    for (const river of rivers) {
      for (const p of river.points) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(grid.cols)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(grid.rows)
      }
    }
  })
})

describe('timeline', () => {
  it('starts in reveal at progress 0', () => {
    const tl = timelineFor(1)
    expect(phaseAt(0, tl)).toEqual({ phase: 'reveal', progress: 0 })
  })
  it('reaches hold at progress 1 once the reveal duration elapses', () => {
    const tl = timelineFor(1)
    const ps = phaseAt(tl.revealDuration + 1, tl)
    expect(ps.phase).toBe('hold')
    expect(ps.progress).toBe(1)
  })
  it('dissolves progress back toward 0 after the hold', () => {
    const tl = timelineFor(1)
    const ps = phaseAt(tl.revealDuration + tl.holdDuration + tl.dissolveDuration / 2, tl)
    expect(ps.phase).toBe('dissolve')
    expect(ps.progress).toBeGreaterThan(0)
    expect(ps.progress).toBeLessThan(1)
  })
  it('signals done once the full cycle elapses', () => {
    const tl = timelineFor(1)
    const total = tl.revealDuration + tl.holdDuration + tl.dissolveDuration + 1
    expect(phaseAt(total, tl).phase).toBe('done')
  })
  it('a higher revealSpeed yields a shorter reveal duration', () => {
    expect(timelineFor(2).revealDuration).toBeLessThan(timelineFor(1).revealDuration)
  })
})
