import { describe, it, expect } from 'vitest'
import flowField from './index'
import { flowPresets, colorPresets } from './presets'
import { flowFieldSchema } from './schema'

describe('flow-field preset groups', () => {
  it('declares two groups: Flow and Color', () => {
    expect(flowField.presets).toBeDefined()
    expect(flowField.presets!.map((g) => g.label)).toEqual(['Flow', 'Color'])
  })

  it('exposes every flow/color preset as an option', () => {
    const [flow, color] = flowField.presets!
    expect(flow.options.map((o) => o.name)).toEqual(flowPresets.map((p) => p.name))
    expect(color.options.map((o) => o.name)).toEqual(colorPresets.map((p) => p.name))
    expect(flow.options).toHaveLength(6)
    expect(color.options).toHaveLength(7)
  })

  it('Flow patches carry the motion fields (and no seed/color)', () => {
    const aurora = flowField.presets![0].options.find((o) => o.name === 'Aurora')!
    expect(aurora.patch).toEqual(flowPresets[0].flow)
    expect(aurora.patch).not.toHaveProperty('seed')
    expect(aurora.patch).not.toHaveProperty('color')
  })

  it('Color patches carry background + blend + color group', () => {
    const pyr3 = flowField.presets![1].options.find((o) => o.name === 'pyr3')!
    expect(pyr3.patch).toHaveProperty('background')
    expect(pyr3.patch).toHaveProperty('blend')
    expect(pyr3.patch).toHaveProperty('color')
  })

  it('every preset patch is valid against the schema (merged onto defaults)', () => {
    const defaults = flowFieldSchema.parse({})
    for (const group of flowField.presets!) {
      for (const opt of group.options) {
        expect(() => flowFieldSchema.parse({ ...defaults, ...opt.patch })).not.toThrow()
      }
    }
  })
})
