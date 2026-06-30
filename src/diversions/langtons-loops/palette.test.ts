import { describe, it, expect } from 'vitest'
import { buildStateLut, AGE_BUCKETS } from './palette'
import { langtonsLoopsSchema } from './schema'

const cfg = langtonsLoopsSchema.parse({})

describe('Langton palette', () => {
  it('maps state 0 to background and state 2 to sheath', () => {
    const lut = buildStateLut(cfg)
    expect(lut[0]).toBe(cfg.background)
    expect(lut[2]).toBe(cfg.sheath)
  })

  it('gives the six signal states distinct, non-background colors', () => {
    const lut = buildStateLut(cfg)
    const signals = [1, 3, 4, 5, 6, 7].map((s) => lut[s])
    for (const c of signals) expect(c).not.toBe(cfg.background)
    expect(new Set(signals).size).toBe(6) // all distinct
  })

  it('exposes an aged-sheath ramp that darkens toward, but never past, background', () => {
    const lut = buildStateLut(cfg)
    const brightness = (c: string) => c.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0)
    expect(lut.agedSheath.length).toBe(AGE_BUCKETS)
    // bucket 0 = freshly-active sheath = the rgb() form of the sheath color
    const { r, g, b } = { r: 0x1f, g: 0x7a, b: 0x8c } // #1f7a8c
    expect(lut.agedSheath[0]).toBe(`rgb(${r},${g},${b})`)
    // ramp gets dimmer toward the last bucket, but stays brighter than background
    const bgBrightness = 0x06 + 0x08 + 0x0d // #06080d channels
    expect(brightness(lut.agedSheath[AGE_BUCKETS - 1])).toBeLessThan(brightness(lut.agedSheath[0]))
    expect(brightness(lut.agedSheath[AGE_BUCKETS - 1])).toBeGreaterThan(bgBrightness)
  })
})
