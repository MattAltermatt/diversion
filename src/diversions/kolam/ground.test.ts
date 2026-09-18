import { describe, it, expect } from 'vitest'
import { derivedGround, paintGround } from './ground'
import { parseHex6, srgbToOklab } from '../../framework/color'

// ⚠️ parseHex6 (0-255), NOT hexToRgb (0-1 floats). Pairing hexToRgb with
// srgbToOklab collapses the entire sRGB cube into L in [0, 0.067] — and an
// ordering test alone still passes, because both sides are wrong together
// and monotonicity survives. See the mutation note at the bottom.
const L = (hex: string) => { const { r, g, b } = parseHex6(hex); return srgbToOklab(r, g, b).L }

describe('derivedGround', () => {
  it('orders dark < base < warm for every shipped ground', () => {
    for (const bg of ['#8e8b84', '#a98c5c', '#9a6f4e', '#3a2c22', '#2b3034']) {
      const g = derivedGround(bg)
      expect(L(g.dark)).toBeLessThan(L(g.base))
      expect(L(g.base)).toBeLessThan(L(g.warm))
    }
  })

  // ⚠️ Asserting /^#[0-9a-f]{6}$/ would pass BY CONSTRUCTION (oklabToHex's
  // per-channel clamp + padStart) even with the L clamp removed — measured,
  // with the clamp gone #000000 collapses all three stops to #000000 and a
  // format-only test stays green. Distinctness is the actual requirement.
  it('keeps three DISTINCT stops even at #000000 and #ffffff', () => {
    for (const bg of ['#000000', '#ffffff']) {
      const g = derivedGround(bg)
      expect(new Set([g.dark, g.base, g.warm]).size).toBe(3)
      expect(L(g.warm) - L(g.dark)).toBeGreaterThan(0.05)
    }
  })
})

describe('paintGround', () => {
  it('returns a different cache key for two different seeds at the same size/colour', () => {
    const target = { drawImage: () => {} } as unknown as CanvasRenderingContext2D
    const keyA = paintGround(target, 64, 48, '#8e8b84', 26, 1)
    const keyB = paintGround(target, 64, 48, '#8e8b84', 26, 2)
    expect(keyA).not.toBe(keyB)
  })
})
