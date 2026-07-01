import { describe, it, expect } from 'vitest'
import { particleLifeGpuSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

const parse = (o: Record<string, unknown> = {}) => particleLifeGpuSchema.parse(o)

describe('matrix field codec', () => {
  it('emits NO matrix key for an un-edited config (keystone)', () => {
    const qs = encodeConfig(particleLifeGpuSchema, parse()).toString()
    expect(qs).not.toContain('matrix=')
  })

  it('round-trips a Custom matrix through the URL', () => {
    const custom = [0.5, -0.5, 1, -1, 0, 0.25, -0.25, 0.75, -0.75] // 3×3
    const cfg = { ...parse({ colors: 3 }), matrix: custom }
    const qs = encodeConfig(particleLifeGpuSchema, cfg)
    const back = decodeConfig(particleLifeGpuSchema, qs)
    expect(back.matrix).toBeDefined()
    back.matrix!.forEach((v, i) => expect(v).toBeCloseTo(custom[i], 5))
  })

  it('drops an out-of-range matrix element (field reverts, rest survives)', () => {
    const qs = new URLSearchParams({ matrix: '2,0,0,0,0,0,0,0,0', colors: '3', dotSize: '4' })
    const back = decodeConfig(particleLifeGpuSchema, qs)
    expect(back.matrix).toBeUndefined() // whole field reverts to default (undefined)
    expect(back.dotSize).toBe(4) // other fields still decode
  })
})
