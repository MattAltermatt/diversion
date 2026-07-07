import { describe, it, expect } from 'vitest'
import { asteroidsSchema } from './schema'
import { generateField, buildNebulaData, buildDustData, nearestCopy, FIELD, NEB_W, NEB_H, DUST_W, DUST_H } from './asteroids'

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

describe('Pan-mode toroidal wrap (regression #263)', () => {
  it('nearestCopy is a real field copy within half a period of the window centre', () => {
    const P = 2 * FIELD.ast.hw
    for (const center of [0, 3.9, 12.3, -50, 100000.7]) {
      for (const c of [-FIELD.ast.hw, -0.3, 0, 1.7, FIELD.ast.hw]) {
        const wrapped = nearestCopy(c, center, P)
        expect(Math.abs(wrapped - center)).toBeLessThanOrEqual(P / 2 + 1e-9)
        const k = (wrapped - c) / P // differs from the original by a whole number of periods
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9)
      }
    }
  })

  it('keeps field content near the window no matter how far Pan accretes (no flat background)', () => {
    // The bug: a linear Pan slid the finite field off → flat #0a0a1a forever. With the
    // wrap, every point's drawn copy stays within ±½-period of screen centre — the field
    // can never pan off into the void, regardless of how large the accreted offset grows.
    const unit = 300, w = 1067 // ~16:9 (h=600, w/h≈1.78)
    const P = 2 * FIELD.star.hw, pf = 0.05
    for (const camx of [0, 100, 5000, -99999]) {
      const baseWx = nearestCopy(FIELD.star.hw - 0.01, camx * pf, P) // a star at the field edge
      const screenX = w / 2 + (baseWx - camx * pf) * unit
      expect(Math.abs(screenX - w / 2)).toBeLessThanOrEqual((P / 2) * unit + 1e-6)
    }
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
