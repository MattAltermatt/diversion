import { describe, it, expect } from 'vitest'
import { boidsSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { readMeta } from '../../framework/fieldMeta'

describe('boids schema', () => {
  it('parses to calm, murmuration-band defaults', () => {
    const cfg = boidsSchema.parse({})
    expect(cfg.count).toBe(400)
    expect(cfg.separation).toBe(1.45)
    expect(cfg.alignment).toBe(1.0)
    expect(cfg.cohesion).toBe(0.55)
    expect(cfg.perception).toBe(36)
    expect(cfg.edgeMode).toBe('steer')
    expect(cfg.predator).toBe(false)
  })

  it('every slider field declares min and max (UX invariant 4)', () => {
    for (const [key, field] of Object.entries(boidsSchema.shape)) {
      const m = readMeta(field as any)
      if (m?.ui === 'slider') {
        expect(m.min, `${key} min`).toBeTypeOf('number')
        expect(m.max, `${key} max`).toBeTypeOf('number')
      }
    }
  })

  it('every non-obvious field carries persistent help', () => {
    for (const [key, field] of Object.entries(boidsSchema.shape)) {
      const m = readMeta(field as any)
      expect(m, `${key} meta`).toBeDefined()
    }
  })

  it('seed is in Advanced, collapsed, randomizeOnFreshLoad (seed contract canon)', () => {
    const m = readMeta(boidsSchema.shape.seed as any)
    expect(m?.section).toBe('Advanced')
    expect(m?.collapsed).toBe(true)
    expect(m?.randomizeOnFreshLoad).toBe(true)
    expect(m?.ui).toBe('number')
  })

  it('color canon: background under Color section, dark default', () => {
    const m = readMeta(boidsSchema.shape.background as any)
    expect(m?.section).toBe('Color')
    expect(m?.label).toBe('Background')
    // dark default (rough luminance check on the hex)
    const hex = boidsSchema.parse({}).background
    const n = parseInt(hex.slice(1), 16)
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    expect(0.299 * r + 0.587 * g + 0.114 * b).toBeLessThan(128)
  })

  it('palette canon: a single colorList field named Palette', () => {
    const m = readMeta(boidsSchema.shape.palette as any)
    expect(m?.ui).toBe('colorList')
    expect(m?.label).toBe('Palette')
  })

  it('round-trips through the URL codec (seed is pin-only, not encoded)', () => {
    const cfg = boidsSchema.parse({ seed: 999, count: 250, edgeMode: 'wrap' })
    const decoded = decodeConfig(boidsSchema, encodeConfig(boidsSchema, cfg))
    expect(decoded).toEqual({ ...cfg, seed: boidsSchema.parse({}).seed })
  })
})
