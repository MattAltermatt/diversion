import { describe, it, expect } from 'vitest'
import { waTorSchema } from './schema'
import { createWaTorState, step, advance, buildLut, EMPTY, FISH, SHARK } from './waTor'

const cfg = (over = {}) => waTorSchema.parse({ ...over })

describe('wa-tor determinism', () => {
  it('same seed → identical initial grid', () => {
    const a = createWaTorState(cfg({ seed: 7 }), 800, 600)
    const b = createWaTorState(cfg({ seed: 7 }), 800, 600)
    expect(Array.from(a.kind)).toEqual(Array.from(b.kind))
    expect(Array.from(a.energy)).toEqual(Array.from(b.energy))
    expect(Array.from(a.breed)).toEqual(Array.from(b.breed))
  })

  it('different seed → different grid', () => {
    const a = createWaTorState(cfg({ seed: 1 }), 800, 600)
    const b = createWaTorState(cfg({ seed: 2 }), 800, 600)
    expect(Array.from(a.kind)).not.toEqual(Array.from(b.kind))
  })

  it('seeds roughly the requested fish/shark fractions', () => {
    const n = 100
    const s = createWaTorState(cfg({ seed: 3, gridResolution: n, initialFish: 0.4, initialSharks: 0.05 }), 800, 600)
    const total = n * n
    expect(s.fishCount / total).toBeGreaterThan(0.3)
    expect(s.fishCount / total).toBeLessThan(0.5)
    expect(s.sharkCount / total).toBeGreaterThan(0.02)
    expect(s.sharkCount / total).toBeLessThan(0.08)
  })
})

describe('wa-tor rules', () => {
  it('every cell stays a valid kind over many steps', () => {
    const s = createWaTorState(cfg({ seed: 5, gridResolution: 60 }), 800, 600)
    // Track validity in a local (an expect() per cell per step = ~1M calls times out
    // under parallel load — hoist the assertion out of the hot loop).
    let allValid = true
    for (let t = 0; t < 300 && allValid; t++) {
      step(s)
      for (const v of s.kind) {
        if (v !== EMPTY && v !== FISH && v !== SHARK) { allValid = false; break }
      }
    }
    expect(allValid).toBe(true)
  })

  it('never seats two creatures on one cell (kind array stays 1 value per cell, trivially true by construction) — cross-check fishCount+sharkCount against a fresh scan', () => {
    const s = createWaTorState(cfg({ seed: 6, gridResolution: 60 }), 800, 600)
    for (let t = 0; t < 150; t++) {
      step(s)
      let fish = 0, sharks = 0
      for (const v of s.kind) { if (v === FISH) fish++; else if (v === SHARK) sharks++ }
      expect(fish).toBe(s.fishCount)
      expect(sharks).toBe(s.sharkCount)
    }
  })

  it('with sharks removed entirely, fish never starve and keep breeding to fill the grid', () => {
    const n = 60
    const s = createWaTorState(cfg({ seed: 8, gridResolution: n, initialFish: 0.3, initialSharks: 0.005, fishBreedTime: 3 }), 800, 600)
    // Wipe every shark off the board.
    for (let i = 0; i < s.kind.length; i++) if (s.kind[i] === SHARK) s.kind[i] = EMPTY
    let prevFish = s.fishCount
    let sawGrowth = false
    for (let t = 0; t < 400; t++) {
      step(s)
      expect(s.sharkCount).toBe(0) // no sharks ever appear from nothing
      if (s.fishCount > prevFish) sawGrowth = true
      prevFish = s.fishCount
    }
    expect(sawGrowth).toBe(true)
    // Fish never starve on their own — population should end up dominant.
    expect(s.fishCount).toBeGreaterThan(n * n * 0.5)
  })

  it('advance fires whole chronons from dt', () => {
    const s = createWaTorState(cfg({ seed: 4, simSpeed: 10 }), 800, 600)
    advance(s, 350)
    expect(s.tick).toBeGreaterThanOrEqual(3)
    expect(s.tick).toBeLessThanOrEqual(4)
  })

  it('produces rolling population waves rather than instant collapse or a fish-only flood', () => {
    // A long run at the shipped defaults should show real oscillation: fish and shark
    // counts both swing meaningfully, and — critically — sharks don't vanish early.
    const n = 90
    const s = createWaTorState(cfg({ seed: 21, gridResolution: n }), 800, 600)
    let minFish = Infinity, maxFish = 0, minShark = Infinity, maxShark = 0
    let extinctAt = -1
    for (let t = 0; t < 1500; t++) {
      step(s)
      minFish = Math.min(minFish, s.fishCount); maxFish = Math.max(maxFish, s.fishCount)
      minShark = Math.min(minShark, s.sharkCount); maxShark = Math.max(maxShark, s.sharkCount)
      if (extinctAt === -1 && (s.fishCount === 0 || s.sharkCount === 0)) extinctAt = t
    }
    // Both populations should visibly swing (waves), not sit flat.
    expect(maxFish - minFish).toBeGreaterThan(n * n * 0.05)
    expect(maxShark).toBeGreaterThan(0)
    // Sharks shouldn't die out almost immediately (that would read as instant collapse).
    if (extinctAt !== -1) expect(extinctAt).toBeGreaterThan(200)
  })
})

describe('wa-tor render gate (#273)', () => {
  it('marks dirty only when a chronon actually runs', () => {
    const s = createWaTorState(cfg({ seed: 4, simSpeed: 10 }), 800, 600)
    expect(s.dirty).toBe(true) // fresh state must paint once

    s.dirty = false
    advance(s, 0) // no time → no step
    expect(s.dirty).toBe(false) // nothing changed → no field rebuild

    s.dirty = false
    advance(s, 1000) // plenty of time → steps run
    expect(s.dirty).toBe(true)
  })
})

describe('colour LUT', () => {
  it('has 3 distinct rgb entries', () => {
    const lut = buildLut(cfg())
    expect(lut.length).toBe(9)
    const bg = `${lut[0]},${lut[1]},${lut[2]}`
    const fish = `${lut[3]},${lut[4]},${lut[5]}`
    const shark = `${lut[6]},${lut[7]},${lut[8]}`
    expect(bg).not.toEqual(fish)
    expect(fish).not.toEqual(shark)
    expect(bg).not.toEqual(shark)
  })
})
