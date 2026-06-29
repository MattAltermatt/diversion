import { describe, it, expect } from 'vitest'
import { demonSchema } from './schema'
import { leafNameCollisions } from '../../framework/urlCodec'

describe('demon schema', () => {
  it('parses to a complete default config', () => {
    const cfg = demonSchema.parse({})
    expect(cfg.field).toBe('hexagon')
    expect(cfg.colors).toBe(8)
    expect(cfg.dominanceReach).toBe(1)
    expect(cfg.color.hueSpan).toBe(360)
  })
  it('has no colliding URL leaf names', () => {
    expect(leafNameCollisions(demonSchema as any)).toEqual([])
  })
})
