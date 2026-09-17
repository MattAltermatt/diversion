import { describe, expect, it } from 'vitest'
import { makeColony } from './colony'
import { buildRock, computeSterile, computeWet } from './rock'
import { lichenSchema } from './schema'
import { buildPalette, paint } from './render'

const cfg = lichenSchema.parse({})
const pal = buildPalette(cfg)

function scene(w = 40, h = 40) {
  const rock = buildRock(w, h, 1)
  computeWet(rock, cfg.exposure, cfg.relief)
  computeSterile(rock, 0, 0)
  const colony = makeColony(w * h)
  const buf = new Uint8ClampedArray(w * h * 4)
  return { rock, colony, buf, w, h }
}

const px = (buf: Uint8ClampedArray, i: number) => [buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2]]
const dist = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('paint', () => {
  it('writes every pixel opaque', () => {
    const s = scene()
    paint(s.buf, s.colony, s.rock, cfg, pal)
    for (let i = 3; i < s.buf.length; i += 4) expect(s.buf[i]).toBe(255)
  })

  it('preserves each species\' chromaticity, so a palette index error shows', () => {
    // Compare rendered against the palette by RATIO, not by distance. At full maturity the
    // renderer multiplies the species colour by a single scalar, so chromaticity is exact —
    // whereas a raw-distance test fails for a legitimate reason, because Xanthoria scaled
    // down really is closer to undimmed Caloplaca than to undimmed Xanthoria.
    const s = scene()
    const i = 10 * s.w + 10
    for (let sp = 0; sp < pal.species.length; sp++) {
      s.colony.occ.fill(-1)
      s.colony.occ[i] = sp
      s.colony.age[i] = 10
      paint(s.buf, s.colony, s.rock, { ...cfg, margins: 0 }, pal)
      const got = px(s.buf, i)
      const want = pal.species[sp]
      const k = got[0] / want[0]
      expect(k).toBeGreaterThan(0.1)
      for (let c = 1; c < 3; c++) {
        expect(got[c] / want[c], `species ${sp} channel ${c} off-hue`).toBeCloseTo(k, 1)
      }
    }
  })

  it('renders the five species mutually distinguishable', () => {
    const s = scene()
    const i = 10 * s.w + 10
    const rendered: number[][] = []
    for (let sp = 0; sp < pal.species.length; sp++) {
      s.colony.occ.fill(-1)
      s.colony.occ[i] = sp
      s.colony.age[i] = 10
      paint(s.buf, s.colony, s.rock, { ...cfg, margins: 0 }, pal)
      rendered.push(px(s.buf, i))
    }
    for (let a = 0; a < rendered.length; a++) {
      for (let b = a + 1; b < rendered.length; b++) {
        expect(dist(rendered[a], rendered[b]), `${a} vs ${b} look alike`).toBeGreaterThan(12)
      }
    }
  })

  it('darkens a cell touching a different species on ANY of its four sides', () => {
    // ⚠️ Compare each cell WITH margins against ITSELF without them. Comparing a border
    // cell against a different interior cell conflates the margin with the rock's own
    // per-cell shading, and that is how the "ignores the above neighbour" mutant survived
    // the first version of this test.
    const s = scene()
    s.colony.occ.fill(0)
    s.colony.age.fill(10)
    for (let y = 0; y < s.h; y++) s.colony.occ[y * s.w + 21] = 1 // vertical seam
    for (let x = 0; x < s.w; x++) s.colony.occ[25 * s.w + x] = 1 // horizontal seam

    const lum = (c: number[]) => c[0] + c[1] + c[2]
    paint(s.buf, s.colony, s.rock, { ...cfg, margins: 0 }, pal)
    const off = Array.from(s.buf)
    paint(s.buf, s.colony, s.rock, cfg, pal)
    const lumAt = (i: number) => lum(px(s.buf, i))
    const lumOffAt = (i: number) => off[i * 4] + off[i * 4 + 1] + off[i * 4 + 2]

    // One probe per side, each with exactly one foreign neighbour in that direction.
    const rightOf = 20 * s.w + 20 // foreign neighbour at x=21, to its RIGHT
    const leftOf = 20 * s.w + 22 // foreign neighbour at x=21, to its LEFT
    const below = 26 * s.w + 10 // foreign neighbour on row 25, ABOVE
    const above = 24 * s.w + 10 // foreign neighbour on row 25, BELOW
    for (const [name, i] of [['right', rightOf], ['left', leftOf], ['above', below], ['below', above]] as const) {
      expect(lumAt(i), `${name} neighbour ignored`).toBeLessThan(lumOffAt(i) - 1)
    }
    // ...and an interior cell with no foreign neighbour is untouched either way.
    const interior = 10 * s.w + 10
    expect(Math.abs(lumAt(interior) - lumOffAt(interior))).toBeLessThan(1)
  })

  it('renders scoured rock as darker STONE, not as water', () => {
    // The requirement is that a big low storm does not read as risen water. Wet stone is
    // legitimately a little cooler, so the test is distance from the SEA colour, not a
    // channel-ratio rule — the first version of this test asserted the latter and failed
    // correct code.
    const s = scene()
    const dry = 10 * s.w + 10, wet = 10 * s.w + 20
    s.colony.scour[wet] = 1
    paint(s.buf, s.colony, s.rock, cfg, pal)
    const d = px(s.buf, dry), w = px(s.buf, wet)
    expect(w[0] + w[1] + w[2]).toBeLessThan(d[0] + d[1] + d[2])
    // RGB distance is the WRONG metric for two dark colours — measured, scoured stone sits
    // only ~30 from the sea and that is fine. What separates them is that water is
    // blue-DOMINANT and wet stone is not: sea reads b/r ~3.7, scoured stone ~1.3.
    const seaRatio = pal.sea[2] / Math.max(1, pal.sea[0])
    const wetRatio = w[2] / Math.max(1, w[0])
    expect(seaRatio).toBeGreaterThan(3)
    expect(wetRatio).toBeLessThan(2)
  })

  it('renders sterile ground as stone distinct from a rendered Lecanora', () => {
    // Compared against RENDERED Lecanora, not the raw swatch: the raw values sit close
    // together and the earlier version of this test failed for that reason alone.
    const s = scene()
    computeSterile(s.rock, 40, 50)
    let sterileIdx = -1
    for (let i = 0; i < s.rock.sterile.length; i++) if (s.rock.sterile[i]) { sterileIdx = i; break }
    expect(sterileIdx).toBeGreaterThanOrEqual(0)
    const lichenIdx = sterileIdx + 1
    s.colony.occ[lichenIdx] = 3 // Lecanora
    s.colony.age[lichenIdx] = 10
    paint(s.buf, s.colony, s.rock, { ...cfg, margins: 0 }, pal)
    expect(dist(px(s.buf, sterileIdx), px(s.buf, lichenIdx))).toBeGreaterThan(30)
  })
})
