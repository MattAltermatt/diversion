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

  // The dark-default test above only exercises a sheath BRIGHTER than the bg (ramp
  // darkens). The shipped light-bg 'Ink' preset flips this — a dark sheath fading
  // toward a light bg — so pin the settled-coral-vs-background contrast in BOTH ramp
  // directions (invariant #5) so a future tweak to the 65% stop can't fade it away.
  it("keeps settled coral distinguishable from a LIGHT background ('Ink' preset)", () => {
    const inkCfg = langtonsLoopsSchema.parse({ background: '#f4f1e8', sheath: '#3a4252' })
    const lut = buildStateLut(inkCfg)
    const channels = (c: string) => c.match(/\d+/g)!.map(Number)
    const bg = channels(rgbOf('#f4f1e8'))
    const settled = channels(lut.agedSheath[AGE_BUCKETS - 1])
    const dist = settled.reduce((sum, v, i) => sum + Math.abs(v - bg[i]), 0)
    expect(dist).toBeGreaterThan(30) // total channel distance — settled coral stays visible
  })
})

/** #rrggbb -> the `rgb(r,g,b)` form buildStateLut emits, for channel comparison. */
function rgbOf(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r},${g},${b})`
}
