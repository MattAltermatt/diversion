import { describe, it, expect } from 'vitest'
import { morphogenSchema } from './schema'

describe('morphogenSchema', () => {
  it('parses to the territories hero default', () => {
    const cfg = morphogenSchema.parse({})
    expect(cfg.fateMode).toBe('territories')
    expect(cfg.sourceLayout).toBe('scatter')
    expect(cfg.morphogenCount).toBe(4)
    expect(cfg.palette.length).toBeGreaterThanOrEqual(2)
    expect(cfg.territoryColors.length).toBeGreaterThanOrEqual(2)
  })

  it('every slider field carries min/max meta (invariant #4)', () => {
    const shape = morphogenSchema.shape
    for (const [key, field] of Object.entries(shape)) {
      const m = (field as any).meta()
      if (m.ui === 'slider') {
        expect(typeof m.min, `${key}.min`).toBe('number')
        expect(typeof m.max, `${key}.max`).toBe('number')
        expect(typeof m.step, `${key}.step`).toBe('number')
      }
    }
  })

  it('seed is pin-only (randomizeOnFreshLoad)', () => {
    expect((morphogenSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })

  it('rejects a non-hex palette color', () => {
    expect(() => morphogenSchema.parse({ palette: ['red', 'blue'] })).toThrow()
  })

  it('mode-dependent fields carry showWhen', () => {
    expect((morphogenSchema.shape.bands as any).meta().showWhen).toEqual({ field: 'fateMode', equals: 'bands' })
    expect((morphogenSchema.shape.territoryMix as any).meta().showWhen).toEqual({ field: 'fateMode', equals: 'territories' })
  })
})
