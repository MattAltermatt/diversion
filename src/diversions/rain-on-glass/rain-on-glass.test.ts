import { describe, it, expect } from 'vitest'
import { rainOnGlassSchema } from './schema'
import { buildBackdropData, buildBlooms, BACKDROP_W, BACKDROP_H } from './backdrop'
import {
  spawnInitialDrops, stepDrop, absorbOverlaps, radiusFromMass, type Drop,
} from './drops'
import { mulberry32 } from '../../framework/rng'

const base = rainOnGlassSchema.parse({})

function makeDrop(overrides: Partial<Drop>): Drop {
  return {
    x: 0, y: 0, prevY: 0, r: radiusFromMass(0.1), mass: 0.1,
    sliding: false, vy: 0, wobblePhase: 0, wobbleSeed: 0.5,
    ...overrides,
  }
}

describe('determinism', () => {
  it('same seed -> identical initial drops', () => {
    const rngA = mulberry32((42 ^ 0x9e3779b9) >>> 0)
    const rngB = mulberry32((42 ^ 0x9e3779b9) >>> 0)
    const a = spawnInitialDrops({ ...base, seed: 42 }, 800, 600, rngA)
    const b = spawnInitialDrops({ ...base, seed: 42 }, 800, 600, rngB)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('different seeds -> different initial drops', () => {
    const rngA = mulberry32((1 ^ 0x9e3779b9) >>> 0)
    const rngB = mulberry32((2 ^ 0x9e3779b9) >>> 0)
    const a = spawnInitialDrops({ ...base, seed: 1 }, 800, 600, rngA)
    const b = spawnInitialDrops({ ...base, seed: 2 }, 800, 600, rngB)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('same seed -> identical backdrop blooms and pixel bake', () => {
    const a = buildBlooms({ ...base, seed: 7 })
    const b = buildBlooms({ ...base, seed: 7 })
    expect(a).toEqual(b)
    const da = buildBackdropData({ ...base, seed: 7 })
    const db = buildBackdropData({ ...base, seed: 7 })
    expect(da).toEqual(db)
  })

  it('different seeds -> different backdrop', () => {
    expect(buildBackdropData({ ...base, seed: 3 }))
      .not.toEqual(buildBackdropData({ ...base, seed: 9 }))
  })

  it('backdrop bake is a fully opaque buffer of the right size', () => {
    const d = buildBackdropData(base)
    expect(d.length).toBe(BACKDROP_W * BACKDROP_H * 4)
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255)
  })
})

describe('droplet physics', () => {
  it('a droplet above the slide-mass threshold moves down', () => {
    const d = makeDrop({ mass: base.slideThreshold + 0.1, sliding: false, y: 100 })
    stepDrop(d, base, 1000) // 1s
    expect(d.sliding).toBe(true)
    expect(d.y).toBeGreaterThan(100)
    expect(d.vy).toBeGreaterThan(0)
  })

  it('a droplet below the slide-mass threshold stays put', () => {
    const cfg = { ...base, condensation: 0 } // isolate: no growth this step
    const d = makeDrop({ mass: base.slideThreshold - 0.5, sliding: false, y: 100 })
    stepDrop(d, cfg, 1000)
    expect(d.sliding).toBe(false)
    expect(d.y).toBe(100)
    expect(d.vy).toBe(0)
  })

  it('condensation grows a static droplet\'s mass over time', () => {
    const cfg = { ...base, condensation: 1, slideThreshold: 999 } // never crosses
    const d = makeDrop({ mass: 0.1, sliding: false })
    stepDrop(d, cfg, 1000)
    expect(d.mass).toBeGreaterThan(0.1)
  })

  it('a sliding drop absorbs a smaller overlapped bead (mass transfers, bead removed)', () => {
    const slider = makeDrop({ x: 50, y: 50, mass: 3, sliding: true, r: radiusFromMass(3) })
    const smallBead = makeDrop({ x: 52, y: 51, mass: 0.3, sliding: false, r: radiusFromMass(0.3) })
    const untouched = makeDrop({ x: 500, y: 500, mass: 0.3, sliding: false, r: radiusFromMass(0.3) })
    const result = absorbOverlaps([slider, smallBead, untouched])
    expect(result).toHaveLength(2)
    expect(result).not.toContain(smallBead)
    expect(result).toContain(untouched)
    const survivedSlider = result.find((d) => d === slider)!
    expect(survivedSlider.mass).toBeCloseTo(3.3, 5)
  })

  it('does not absorb a LARGER nearby bead', () => {
    const slider = makeDrop({ x: 50, y: 50, mass: 0.5, sliding: true, r: radiusFromMass(0.5) })
    const bigger = makeDrop({ x: 51, y: 51, mass: 3, sliding: false, r: radiusFromMass(3) })
    const result = absorbOverlaps([slider, bigger])
    expect(result).toHaveLength(2)
    expect(slider.mass).toBe(0.5)
  })

  it('a static (non-sliding) drop never absorbs, even when overlapping a smaller one', () => {
    const staticA = makeDrop({ x: 50, y: 50, mass: 1, sliding: false, r: radiusFromMass(1) })
    const staticB = makeDrop({ x: 51, y: 51, mass: 0.2, sliding: false, r: radiusFromMass(0.2) })
    const result = absorbOverlaps([staticA, staticB])
    expect(result).toHaveLength(2)
  })
})

describe('schema', () => {
  it('parses defaults', () => {
    expect(base.density).toBeGreaterThan(0)
    expect(base.palette.length).toBeGreaterThanOrEqual(2)
  })
})
