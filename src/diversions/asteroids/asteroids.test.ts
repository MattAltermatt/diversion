import { describe, it, expect } from 'vitest'
import { asteroidsSchema } from './schema'
import { generateField, buildNebulaData, buildDustData, NEB_W, NEB_H, DUST_W, DUST_H } from './asteroids'

const base = asteroidsSchema.parse({})

describe('asteroid field generation', () => {
  it('is deterministic for a given seed', () => {
    const a = generateField({ ...base, seed: 42 })
    const b = generateField({ ...base, seed: 42 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('differs across seeds', () => {
    const a = generateField({ ...base, seed: 1 })
    const b = generateField({ ...base, seed: 2 })
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('honors the asteroid count', () => {
    expect(generateField({ ...base, count: 0 }).asteroids).toHaveLength(0)
    expect(generateField({ ...base, count: 30 }).asteroids).toHaveLength(30)
  })

  it('scales rock size with sizeScale', () => {
    const small = generateField({ ...base, count: 40, sizeScale: 0.5, seed: 5 })
    const big = generateField({ ...base, count: 40, sizeScale: 1.5, seed: 5 })
    const maxR = (f: ReturnType<typeof generateField>) =>
      f.asteroids.reduce((m, a) => Math.max(m, a.radius), 0)
    expect(maxR(big)).toBeGreaterThan(maxR(small))
  })

  it('draws far (small, low-parallax) rocks before near ones', () => {
    const f = generateField({ ...base, count: 30, seed: 7 })
    for (let i = 1; i < f.asteroids.length; i++) {
      expect(f.asteroids[i].depth).toBeGreaterThanOrEqual(f.asteroids[i - 1].depth)
    }
  })

  it('scales star and dust populations with their knobs', () => {
    expect(generateField({ ...base, stars: 0, dust: 0 }).stars).toHaveLength(0)
    expect(generateField({ ...base, stars: 1 }).stars.length).toBeGreaterThan(
      generateField({ ...base, stars: 0.25 }).stars.length,
    )
  })
})

describe('nebula + dust bakes', () => {
  it('nebula is a fully opaque low-res buffer of the right size', () => {
    const d = buildNebulaData(base)
    expect(d.length).toBe(NEB_W * NEB_H * 4)
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255)
  })

  it('nebula is deterministic for a seed and varies with it', () => {
    expect(buildNebulaData({ ...base, seed: 3 })).toEqual(buildNebulaData({ ...base, seed: 3 }))
    expect(buildNebulaData({ ...base, seed: 3 })).not.toEqual(buildNebulaData({ ...base, seed: 9 }))
  })

  it('dust veil is mostly transparent (lanes, not full cover) and scales with dustLanes', () => {
    const d = buildDustData(base)
    expect(d.length).toBe(DUST_W * DUST_H * 4)
    const meanAlpha = (buf: Uint8ClampedArray) => {
      let s = 0
      for (let i = 3; i < buf.length; i += 4) s += buf[i]
      return s / (buf.length / 4)
    }
    expect(meanAlpha(d)).toBeLessThan(128)                  // clear more than half the frame
    expect(meanAlpha(d)).toBeGreaterThan(0)
    expect(meanAlpha(buildDustData({ ...base, dustLanes: 1 })))
      .toBeGreaterThan(meanAlpha(buildDustData({ ...base, dustLanes: 0.2 })))
    // dustLanes: 0 → no veil at all
    expect(meanAlpha(buildDustData({ ...base, dustLanes: 0 }))).toBe(0)
  })
})
