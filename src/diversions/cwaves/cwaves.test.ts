import { describe, it, expect } from 'vitest'
import { cwavesSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { buildWaves, buildPalette, fieldAt, FRAG_SRC, MAX_WAVES } from './cwaves'

describe('cwaves schema + codec', () => {
  it('parses to valid defaults', () => {
    const cfg = cwavesSchema.parse({})
    expect(cfg.waveCount).toBe(5)
    expect(cfg.palette.length).toBeGreaterThanOrEqual(2)
    expect(cfg.seed).toBe(1)
  })

  it('round-trips config through the URL codec, seed omitted', () => {
    const cfg = cwavesSchema.parse({})
    const sp = encodeConfig(cwavesSchema, cfg)
    expect(sp.has('seed')).toBe(false) // pin-only (randomizeOnFreshLoad) — never emitted
    const back = decodeConfig(cwavesSchema, sp)
    expect(back).toEqual(cfg) // seed absent from URL → decodes back to its default (== cfg.seed)
  })

  it('round-trips non-default values including the palette array', () => {
    const cfg = cwavesSchema.parse({
      waveCount: 8, scale: 12.5, angleSpread: 0.8, banding: 2.1,
      palette: ['#010203', '#0a0b0c', '#fdfeff'],
    })
    const back = decodeConfig(cwavesSchema, encodeConfig(cwavesSchema, cfg))
    expect(back).toEqual(cfg)
  })

  it('honors an explicit seed present in the URL', () => {
    const sp = encodeConfig(cwavesSchema, cwavesSchema.parse({}))
    sp.set('seed', '424242')
    expect(decodeConfig(cwavesSchema, sp).seed).toBe(424242)
  })
})

describe('buildWaves determinism', () => {
  it('is identical for the same seed', () => {
    const cfg = cwavesSchema.parse({ seed: 7 })
    const a = buildWaves(cfg)
    const b = buildWaves(cfg)
    expect(Array.from(a.wave)).toEqual(Array.from(b.wave))
    expect(Array.from(a.phase)).toEqual(Array.from(b.phase))
    expect(Array.from(a.drift)).toEqual(Array.from(b.drift))
    expect(Array.from(a.amp)).toEqual(Array.from(b.amp))
    expect(a.count).toBe(b.count)
  })

  it('differs across seeds', () => {
    const a = buildWaves(cwavesSchema.parse({ seed: 1 }))
    const b = buildWaves(cwavesSchema.parse({ seed: 2 }))
    expect(Array.from(a.wave)).not.toEqual(Array.from(b.wave))
  })

  it('caps count at MAX_WAVES and pads unused slots with zero', () => {
    const w = buildWaves(cwavesSchema.parse({ waveCount: 8 }))
    expect(w.count).toBe(MAX_WAVES)
    expect(w.wave.length).toBe(MAX_WAVES * 2)
    const w3 = buildWaves(cwavesSchema.parse({ waveCount: 3 }))
    expect(w3.count).toBe(3)
    // slots >= count are untouched zeros
    expect(w3.amp[3]).toBe(0)
    expect(w3.wave[6]).toBe(0)
  })

  it('normalizes active amplitudes to a fixed total (~3), independent of count', () => {
    for (const waveCount of [3, 5, 8]) {
      const w = buildWaves(cwavesSchema.parse({ waveCount }))
      const sum = w.amp.reduce((s, a) => s + a, 0)
      expect(sum).toBeCloseTo(3.0, 5)
    }
  })
})

describe('fieldAt', () => {
  it('is finite and bounded by the amplitude total everywhere', () => {
    const w = buildWaves(cwavesSchema.parse({ seed: 11, waveCount: 8 }))
    let worst = 0
    for (let x = -20; x <= 20; x += 1.7) {
      for (let y = -20; y <= 20; y += 1.7) {
        for (const t of [0, 3.3, 50]) {
          const v = fieldAt(w, x, y, t)
          expect(Number.isFinite(v)).toBe(true)
          worst = Math.max(worst, Math.abs(v))
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(3.0 + 1e-6) // Σ|amp| == AMP_TOTAL bounds the sum
  })
})

describe('buildPalette', () => {
  it('maps hex stops to 0..1 floats and reports the active count', () => {
    const p = buildPalette(cwavesSchema.parse({ palette: ['#000000', '#ffffff'] }))
    expect(p.count).toBe(2)
    expect(p.stops[0]).toBe(0)
    expect(p.stops[3]).toBe(1)
  })
})

describe('FRAG_SRC', () => {
  it('declares every uniform the renderer sets', () => {
    for (const u of ['u_res', 'u_time', 'u_scale', 'u_banding', 'u_count', 'u_wave',
      'u_phase', 'u_drift', 'u_amp', 'u_stops', 'u_stopCount']) {
      expect(FRAG_SRC).toContain(u)
    }
  })
})
