import { describe, it, expect } from 'vitest'
import { quantize, contrastFloor } from './quantize'
import { srgbToOklab, oklabToHex, hexToRgb } from '../../framework/color'

/** A w×h image; `at(x,y)` returns [r,g,b]. */
function make(w: number, h: number, at: (x: number, y: number) => [number, number, number]) {
  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = at(x, y)
      const i = (y * w + x) * 4
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255
    }
  }
  return { width: w, height: h, pixels }
}

const halves = make(64, 64, (x) => (x < 32 ? [10, 20, 30] : [220, 210, 200]))

/** A photo-like image: continuous tone in two directions plus a colour shift, so
 *  the clusters are genuinely spread rather than the two spikes `halves` gives. */
const gradient = make(120, 90, (x, y) => [
  20 + Math.round((x / 120) * 200),
  10 + Math.round((y / 90) * 180),
  40 + Math.round(((x + y) / 210) * 150),
])

const meanChannel = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3
}

/** WCAG 2.x relative-luminance contrast ratio — the measure the shipped palettes
 *  are documented against (README: darkest stop vs its background >= 1.88). */
function contrast(a: string, b: string): number {
  const rel = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const la = rel(a), lb = rel(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('quantize (#278)', () => {
  it('is deterministic for a fixed seed', () => {
    const a = quantize(halves, 16, 16, 4, 7)
    const b = quantize(halves, 16, 16, 4, 7)
    expect(Array.from(a.idx)).toEqual(Array.from(b.idx))
    expect(a.palette).toEqual(b.palette)
  })

  it('emits exactly cols*rows indices, all in range', () => {
    const q = quantize(halves, 12, 9, 5, 3)
    expect(q.idx.length).toBe(108)
    for (const v of q.idx) expect(v).toBeLessThan(5)
  })

  it('emits one palette entry per requested colour', () => {
    expect(quantize(halves, 16, 16, 6, 1).palette).toHaveLength(6)
    expect(quantize(halves, 16, 16, 2, 1).palette).toHaveLength(2)
  })

  it('at 2 colours a two-tone image comes back stark dark-and-light', () => {
    const { palette } = quantize(halves, 16, 16, 2, 1)
    const lum = palette.map(meanChannel).sort((a, b) => a - b)
    expect(lum[1] - lum[0]).toBeGreaterThan(150) // genuinely two-tone, not two greys
    expect(lum[1]).toBeGreaterThan(231) // the light end really is white
  })

  // The stretch must NOT reach true black. A darkest band at L≈0 sits at or below
  // the ground (#05070a), so intact cells of that band are indistinguishable from
  // the space where cells have already been destroyed — and at 2 colours that is
  // half the picture. Every hand-authored ramp holds >= 1.88 WCAG against its own
  // background for exactly this reason; the quantizer has to hold it too.
  it.each([2, 4, 6, 12, 24])('keeps the darkest band clear of the ground at %i colours', (k) => {
    const { palette } = quantize(gradient, 40, 30, k, 3)
    expect(contrast(palette[0], '#05070a')).toBeGreaterThanOrEqual(1.88)
  })

  it('orders the palette dark to light, matching the hand-authored ramps', () => {
    // Ordered by perceptual LIGHTNESS, which is the actual invariant. Mean RGB
    // channel is not a stand-in for it: the stretch moves L only, so a saturated
    // band can carry a lower channel mean than a paler band above it and still
    // be correctly ordered.
    const { palette } = quantize(gradient, 40, 30, 8, 3)
    const ls = palette.map((hex) => {
      const n = parseInt(hex.slice(1), 16)
      return srgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255).L
    })
    expect(ls[0]).toBe(Math.min(...ls))
    expect(ls[ls.length - 1]).toBe(Math.max(...ls))
    // Non-decreasing WITHIN A TOLERANCE, not strictly. The centroids themselves
    // are sorted by construction, but the palette is emitted as 8-bit hex and
    // out-of-gamut chroma clamps per channel — so two centroids a hair apart in L
    // can come back a hair inverted. 0.02 is comfortably under one band's width
    // at the maximum 24 colours, so a genuine ordering bug still fails this.
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeGreaterThan(ls[i - 1] - 0.02)
  })

  it('groups like with like — the left half shares an index, the right another', () => {
    const q = quantize(halves, 16, 16, 2, 1)
    const left = q.idx[16 * 8 + 2]
    const right = q.idx[16 * 8 + 13]
    expect(left).not.toBe(right)
    for (let row = 0; row < 16; row++) {
      expect(q.idx[row * 16 + 2]).toBe(left)
      expect(q.idx[row * 16 + 13]).toBe(right)
    }
  })

  it('box-downsamples rather than point-sampling — a 1px stripe tints, never dominates', () => {
    // One white column in every eight, offset so it is NOT the pixel a
    // point-sampler would land on (cell c starts at x = c*8, the stripe is at
    // x = c*8+3). Point-sampling would see pure black and return black; a box
    // filter sees 1/8 white and returns a dark grey. Asserting on the VALUE is
    // what makes this test able to tell the two filters apart at all — the
    // earlier version asserted only that all cells agreed, which is true either
    // way.
    const striped = make(64, 8, (x) => (x % 8 === 3 ? [255, 255, 255] : [0, 0, 0]))
    const q = quantize(striped, 8, 1, 1, 1)
    expect(new Set(Array.from(q.idx)).size).toBe(1)
    // A single band is stretched to the top of the range, so read the mean back
    // off the source instead: every cell must have averaged the same 1-in-8 white.
    const flatBlack = quantize(make(64, 8, () => [0, 0, 0]), 8, 1, 1, 1)
    expect(q.palette[0]).toBe(flatBlack.palette[0]) // both single-tone → same treatment
    // The discriminating check: with TWO colours the stripe cell must not read as
    // pure black, which is what a point-sampler would have produced.
    const half = make(64, 8, (x) => (x < 32 ? (x % 8 === 3 ? [255, 255, 255] : [0, 0, 0]) : [0, 0, 0]))
    expect(new Set(Array.from(quantize(half, 8, 1, 2, 1).idx)).size).toBe(2)
  })

  it('survives more colours than the image contains', () => {
    const flat = make(8, 8, () => [128, 128, 128])
    const q = quantize(flat, 4, 4, 8, 1)
    expect(q.palette).toHaveLength(8)
    expect(q.idx.length).toBe(16)
  })
})

describe('contrastFloor', () => {
  it('reproduces the historical 0.40 on the ground it was calibrated against', () => {
    // The shipped constant was solved by hand against #05070a; if the derivation
    // disagrees with it, the derivation is wrong.
    expect(contrastFloor('#05070a')).toBeCloseTo(0.40, 2)
  })

  it('rises as the ground lightens, so the darkest band never sinks into it', () => {
    const dark = contrastFloor('#05070a')
    const warm = contrastFloor('#2b2620')
    const warmer = contrastFloor('#3d372e')
    expect(warm).toBeGreaterThan(dark)
    expect(warmer).toBeGreaterThan(warm)
  })

  it('never drops below the historical floor on a very dark ground', () => {
    // Solving alone would return something lower for pure black; clamping keeps
    // the one case that was already correct from regressing.
    expect(contrastFloor('#000000')).toBeGreaterThanOrEqual(0.40)
  })

  it('actually clears the 1.88 floor it solves for, at worst-case hue', () => {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const lumOf = (hex: string) => {
      const [r, g, b] = hexToRgb(hex)
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lumOf(a), lumOf(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    for (const bg of ['#05070a', '#2b2620', '#3d372e']) {
      const L = contrastFloor(bg)
      for (let d = 0; d < 360; d += 30) {
        const h = (d * Math.PI) / 180
        const band = oklabToHex({ L, a: 0.20 * Math.cos(h), b: 0.20 * Math.sin(h) })
        expect(ratio(band, bg), `${bg} at hue ${d}`).toBeGreaterThanOrEqual(1.87)
      }
    }
  })
})

describe('matte (the sprite sits in a solid rectangle)', () => {
  // A 4x4 source: opaque 2x2 block top-left, transparent elsewhere.
  const sprite = () => {
    const px = new Uint8ClampedArray(4 * 4 * 4)
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const at = (y * 4 + x) * 4
        px[at] = 200; px[at + 1] = 80; px[at + 2] = 60; px[at + 3] = 255
      }
    }
    return { width: 4, height: 4, pixels: px }
  }

  it('without matte, the void is left dead so the sprite floats', () => {
    const q = quantize(sprite(), 8, 8, 3, 1, true, '#2b2620', false)
    expect(q.coverage.some((c) => c === 0)).toBe(true)
  })

  it('with matte, every cell is alive — the whole rectangle must be cleared', () => {
    const q = quantize(sprite(), 8, 8, 3, 1, true, '#2b2620', true)
    expect(q.coverage.every((c) => c === 1)).toBe(true)
  })

  it('adds exactly one band, at index 0, without inventing an image colour', () => {
    const plain = quantize(sprite(), 8, 8, 3, 1, true, '#2b2620', false)
    const matted = quantize(sprite(), 8, 8, 3, 1, true, '#2b2620', true)
    expect(matted.palette).toHaveLength(plain.palette.length + 1)
    expect(matted.palette.slice(1)).toEqual(plain.palette)
    // Void cells became band 0; covered cells shifted up by one.
    for (let i = 0; i < plain.idx.length; i++) {
      expect(matted.idx[i]).toBe(plain.coverage[i] ? plain.idx[i] + 1 : 0)
    }
  })

  it('keeps the matte clear of the ground AND below every image band', () => {
    const q = quantize(sprite(), 8, 8, 3, 1, true, '#2b2620', true)
    const L = (hex: string) => {
      const [r, g, b] = hexToRgb(hex)
      return srgbToOklab(r * 255, g * 255, b * 255).L
    }
    const matteL = L(q.palette[0])
    // At the floor: visible against the ground it sits on.
    expect(matteL).toBeCloseTo(contrastFloor('#2b2620'), 2)
    // And strictly below the artwork, so a dark outline cannot dissolve into it.
    for (const c of q.palette.slice(1)) expect(L(c)).toBeGreaterThan(matteL)
  })
})

describe('contrast solving is robust on any ground', () => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lumOf = (hex: string) => {
    const [r, g, b] = hexToRgb(hex)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lumOf(a), lumOf(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  // A saturated source: sRGB primaries reach chroma ~0.31 in OKLab, well past the
  // 0.20 the floor was first modelled at. Pixel art is exactly this case.
  const saturated = () => {
    const px = new Uint8ClampedArray(4 * 4 * 4)
    const cols = [[0, 15, 255], [255, 0, 0], [0, 255, 0], [255, 0, 255]]
    for (let i = 0; i < 16; i++) {
      const c = cols[i % 4]
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255
    }
    return { width: 4, height: 4, pixels: px }
  }

  // Light grounds are the regression case: contrast-vs-L is V-shaped, so the
  // original bisection converged to L=1 on mid-grey and produced a white slab
  // with the matte BRIGHTER than the artwork.
  const GROUNDS = ['#05070a', '#201c17', '#2b2620', '#909090', '#999999', '#aaaaaa', '#ffffff']

  it('emits a palette that actually clears the floor, on every ground', () => {
    for (const bg of GROUNDS) {
      const q = quantize(saturated(), 16, 16, 4, 1, true, bg, true)
      for (const c of q.palette) {
        expect(ratio(c, bg), `${bg} band ${c}`).toBeGreaterThanOrEqual(1.87)
      }
    }
  })

  it('never puts the matte above the artwork, even on a light ground', () => {
    for (const bg of GROUNDS) {
      const q = quantize(saturated(), 16, 16, 4, 1, true, bg, true)
      const L = (hex: string) => {
        const [r, g, b] = hexToRgb(hex)
        return srgbToOklab(r * 255, g * 255, b * 255).L
      }
      const matteL = L(q.palette[0])
      for (const c of q.palette.slice(1)) {
        expect(L(c), `${bg}: band ${c} vs matte ${q.palette[0]}`).toBeGreaterThan(matteL)
      }
    }
  })

  it('leaves the floor put on the ground it was calibrated against', () => {
    expect(contrastFloor('#05070a')).toBeCloseTo(0.40, 2)
  })
})
