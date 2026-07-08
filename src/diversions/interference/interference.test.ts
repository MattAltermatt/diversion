import { describe, it, expect } from 'vitest'
import { interferenceSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import {
  buildSources, buildPalette, sourcePosition, heightAt, computePositions,
  FRAG_SRC, MAX_SOURCES,
} from './interference'

describe('interference schema + codec', () => {
  it('parses to valid defaults', () => {
    const cfg = interferenceSchema.parse({})
    expect(cfg.sourceCount).toBe(4)
    expect(cfg.palette.length).toBeGreaterThanOrEqual(2)
    expect(cfg.seed).toBe(1)
  })

  it('round-trips config through the URL codec, seed omitted (pin-only)', () => {
    const cfg = interferenceSchema.parse({})
    const sp = encodeConfig(interferenceSchema, cfg)
    expect(sp.has('seed')).toBe(false)
    expect(decodeConfig(interferenceSchema, sp)).toEqual(cfg)
  })

  it('round-trips non-default values including the palette array', () => {
    const cfg = interferenceSchema.parse({
      sourceCount: 7, frequency: 45.5, radius: 0.6, bands: 2.3,
      palette: ['#010203', '#0a0b0c', '#fdfeff'],
    })
    const back = decodeConfig(interferenceSchema, encodeConfig(interferenceSchema, cfg))
    expect(back).toEqual(cfg)
  })

  it('honors an explicit seed present in the URL', () => {
    const sp = encodeConfig(interferenceSchema, interferenceSchema.parse({}))
    sp.set('seed', '424242')
    expect(decodeConfig(interferenceSchema, sp).seed).toBe(424242)
  })

  it('every field carries a ui meta', () => {
    for (const [, field] of Object.entries(interferenceSchema.shape)) {
      const meta = (field as { meta(): { ui?: string } }).meta()
      expect(meta.ui).toBeTruthy()
    }
  })
})

describe('buildSources determinism (seed -> identical initial source positions)', () => {
  it('is identical for the same seed', () => {
    const cfg = interferenceSchema.parse({ seed: 7 })
    const a = buildSources(cfg)
    const b = buildSources(cfg)
    expect(Array.from(a.thetaX)).toEqual(Array.from(b.thetaX))
    expect(Array.from(a.thetaY)).toEqual(Array.from(b.thetaY))
    expect(Array.from(a.rateX)).toEqual(Array.from(b.rateX))
    expect(Array.from(a.rateY)).toEqual(Array.from(b.rateY))
    expect(a.count).toBe(b.count)

    // The initial (t=0, driftT=0) position derives purely from thetaX/thetaY,
    // so it too is identical run-to-run for the same seed.
    for (let i = 0; i < a.count; i++) {
      expect(sourcePosition(a, i, 0, 0.3, 1.5, 1)).toEqual(sourcePosition(b, i, 0, 0.3, 1.5, 1))
    }
  })

  it('differs across seeds', () => {
    const a = buildSources(interferenceSchema.parse({ seed: 1 }))
    const b = buildSources(interferenceSchema.parse({ seed: 2 }))
    expect(Array.from(a.thetaX)).not.toEqual(Array.from(b.thetaX))
    const posA = sourcePosition(a, 0, 0, 0.3, 1.5, 1)
    const posB = sourcePosition(b, 0, 0, 0.3, 1.5, 1)
    expect(posA).not.toEqual(posB)
  })

  it('caps count at MAX_SOURCES and pads unused slots with zero', () => {
    const s = buildSources(interferenceSchema.parse({ sourceCount: 8 }))
    expect(s.count).toBe(MAX_SOURCES)
    const s3 = buildSources(interferenceSchema.parse({ sourceCount: 3 }))
    expect(s3.count).toBe(3)
    expect(s3.thetaX[3]).toBe(0) // slots >= count are untouched zeros
    expect(s3.rateX[3]).toBe(0)
  })
})

describe('sourcePosition', () => {
  it('stays within the requested range at every drift-time', () => {
    const s = buildSources(interferenceSchema.parse({ seed: 3, sourceCount: 5 }))
    const rangeX = 1.7, rangeY = 1
    for (let i = 0; i < s.count; i++) {
      for (const t of [0, 5, 50, 1000]) {
        const [x, y] = sourcePosition(s, i, t, 0.4, rangeX, rangeY)
        expect(Math.abs(x)).toBeLessThanOrEqual(rangeX + 1e-9)
        expect(Math.abs(y)).toBeLessThanOrEqual(rangeY + 1e-9)
      }
    }
  })

  it('driftSpeed = 0 freezes the source in place', () => {
    const s = buildSources(interferenceSchema.parse({ seed: 9 }))
    const p0 = sourcePosition(s, 0, 0, 0, 1.5, 1)
    const p10 = sourcePosition(s, 0, 10, 0, 1.5, 1)
    expect(p10).toEqual(p0)
  })
})

describe('computePositions', () => {
  it('flattens active sources and zero-pads the rest', () => {
    const s = buildSources(interferenceSchema.parse({ seed: 1, sourceCount: 3 }))
    const flat = computePositions(s, 0, 0.3, 1.7)
    expect(flat.length).toBe(MAX_SOURCES * 2)
    for (let i = s.count; i < MAX_SOURCES; i++) {
      expect(flat[i * 2]).toBe(0)
      expect(flat[i * 2 + 1]).toBe(0)
    }
  })
})

describe('heightAt (wave-math)', () => {
  it('matches the amplitude-sum formula for a single source', () => {
    const p = { x: 0, y: 0 }
    const d = Math.hypot(3, 4) // 5
    const frequency = 2, radius = 10, t = 1.25
    const expected = Math.max(0, 1 - d / radius) * Math.sin(d * frequency - t)
    expect(heightAt([p], 3, 4, t, frequency, radius)).toBeCloseTo(expected, 10)
  })

  it('is the sum of each source’s independent contribution', () => {
    const a = { x: -1, y: 0 }
    const b = { x: 1, y: 0.5 }
    const frequency = 3, radius = 8, t = 0.7
    const px = 0.4, py = -0.2
    const solo = (p: { x: number; y: number }) => {
      const d = Math.hypot(px - p.x, py - p.y)
      return Math.max(0, Math.min(1, 1 - d / radius)) * Math.sin(d * frequency - t)
    }
    const expected = solo(a) + solo(b)
    expect(heightAt([a, b], px, py, t, frequency, radius)).toBeCloseTo(expected, 10)
  })

  it('a point equidistant from two in-phase sources is constructive (doubles a single source’s contribution)', () => {
    // Two sources placed symmetrically around the origin; the origin is
    // equidistant from both, so their sin() arguments (same distance, same
    // frequency/time) are identical — the contributions add rather than cancel.
    const a = { x: -2, y: 0 }
    const b = { x: 2, y: 0 }
    const frequency = 1.3, radius = 10, t = 0.9
    const dual = heightAt([a, b], 0, 0, t, frequency, radius)
    const single = heightAt([a], 0, 0, t, frequency, radius)
    expect(dual).toBeCloseTo(2 * single, 10)
    expect(Math.abs(dual)).toBeGreaterThan(Math.abs(single)) // genuinely constructive, not cancelling
  })

  it('is finite and bounded by the active source count everywhere', () => {
    const s = buildSources(interferenceSchema.parse({ seed: 11, sourceCount: 8 }))
    const radius = 2, frequency = 25
    let worst = 0
    for (let x = -3; x <= 3; x += 0.7) {
      for (let y = -3; y <= 3; y += 0.7) {
        for (const t of [0, 3.3, 50]) {
          const positions = Array.from({ length: s.count }, (_, i) => {
            const [px, py] = sourcePosition(s, i, t, 0.3, 1.7, 1)
            return { x: px, y: py }
          })
          const v = heightAt(positions, x, y, t, frequency, radius)
          expect(Number.isFinite(v)).toBe(true)
          worst = Math.max(worst, Math.abs(v))
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(s.count + 1e-6)
  })
})

describe('buildPalette', () => {
  it('maps hex stops to 0..1 floats and reports the active count', () => {
    const p = buildPalette(interferenceSchema.parse({ palette: ['#000000', '#ffffff'] }))
    expect(p.count).toBe(2)
    expect(p.stops[0]).toBe(0)
    expect(p.stops[3]).toBe(1)
  })
})

describe('FRAG_SRC', () => {
  it('declares every uniform the renderer sets', () => {
    for (const u of ['u_res', 'u_time', 'u_frequency', 'u_radius', 'u_bands', 'u_count',
      'u_srcPos', 'u_stops', 'u_stopCount']) {
      expect(FRAG_SRC).toContain(u)
    }
  })
})
