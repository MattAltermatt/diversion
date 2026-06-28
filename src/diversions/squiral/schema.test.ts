import { describe, it, expect } from 'vitest'
import { squiralSchema } from './schema'

describe('squiral schema', () => {
  it('parses with all defaults', () => {
    const cfg = squiralSchema.parse({})
    expect(cfg.count).toBe(3) // zen default: a few calm worms
    expect(cfg.speed).toBe(10)
    expect(cfg.disorder).toBe(0)
    expect(cfg.clearMode).toBe('rolling') // never clears → always-full, no sparse regrow
    expect(cfg.cellStyle).toBe('square')
    expect(cfg.color.mode).toBe('palette')
    expect(cfg.cycle).toBe(false)
  })

  it('exposes section + ui metadata on fields', () => {
    const shape = squiralSchema.shape
    expect(shape.count.meta()?.section).toBe('Worms')
    expect(shape.clearMode.meta()?.ui).toBe('segmented')
    expect(shape.cellSize.meta()?.min).toBe(2)
  })

  it('rejects an out-of-range fillThreshold', () => {
    expect(() => squiralSchema.parse({ fillThreshold: 5 })).toThrow()
  })
})
