import { describe, it, expect } from 'vitest'
import { derivedGround, lastGroundSample, paintGround } from './ground'
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
  // ⚠️ Assert the BITMAP changed, not the key string. An earlier version of this
  // test compared `paintGround(..., seed 1)` against `paintGround(..., seed 2)`
  // and asserted the returned keys differ — i.e. it tested string interpolation.
  // Both of the mutants it named survived it: hardcoding the fbm seeds so every
  // drawing sits on an identical floor, and collapsing the cache to `if (!cache)`
  // so the ground is never repainted at all. Recording the source canvas kills
  // both, and also pins the cache itself.
  const recorder = () => {
    const seen: unknown[] = []
    const target = { drawImage: (src: unknown) => seen.push(src) } as unknown as
      CanvasRenderingContext2D
    return { target, seen }
  }

  it('paints a DIFFERENT ground for two seeds at the same size and colour', () => {
    const { target, seen } = recorder()
    const keyA = paintGround(target, 64, 48, '#8e8b84', 26, 1)
    const keyB = paintGround(target, 64, 48, '#8e8b84', 26, 2)
    expect(keyA).not.toBe(keyB)
    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
    // ⚠️ Two different canvas OBJECTS is still not evidence — hardcoding the fbm
    // seeds produces two distinct canvases holding identical pixels, and that
    // mutant survived a version of this test that stopped here.
    const { target: t2 } = recorder()
    paintGround(t2, 64, 48, '#8e8b84', 26, 11)
    const s11 = lastGroundSample()
    paintGround(t2, 64, 48, '#8e8b84', 26, 12)
    expect(lastGroundSample()).not.toBeCloseTo(s11, 3)
  })

  it('reuses the cached ground when nothing changed', () => {
    const { target, seen } = recorder()
    paintGround(target, 64, 48, '#8e8b84', 26, 7)
    paintGround(target, 64, 48, '#8e8b84', 26, 7)
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])
  })
})
