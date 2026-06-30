import { describe, it, expect } from 'vitest'
import { boxcar2dPresets } from './presets'
import { boxcar2dSchema } from './schema'

describe('boxcar2dPresets', () => {
  it('every preset patch keeps the config valid', () => {
    const base = boxcar2dSchema.parse({})
    for (const group of boxcar2dPresets)
      for (const opt of group.options)
        expect(() => boxcar2dSchema.parse({ ...base, ...opt.patch })).not.toThrow()
  })
})
