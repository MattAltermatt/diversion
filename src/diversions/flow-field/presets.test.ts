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
    expect(color.options).toHaveLength(8)
  })

  it('Slow Fuzz is redefined to the new default motion', () => {
    const sf = flowPresets.find((p) => p.name === 'Slow Fuzz')!
    expect(sf.flow).toEqual({
      noiseScale: 0.0014, fieldDrift: 0.71, speed: 0.11, lifespan: 6.5,
      trailLength: 72, particles: 16200, particleSize: 2.6, fadeTrails: true,
    })
  })

  it('Mariners uses normal blend (color-true)', () => {
    const mariners = colorPresets.find((p) => p.name === 'Mariners')!
    expect(mariners.blend).toBe('normal')
  })

  it('Dusk is a gradient-mode preset with no pure white', () => {
    const dusk = colorPresets.find((p) => p.name === 'Dusk')!
    expect(dusk.color.mode).toBe('gradient')
    expect(dusk.color.stops).toEqual(['#3b2d8f66', '#c43b9a66', '#ff8a3b66'])
    expect(dusk.color.stops.some((s) => /^#ffffff/i.test(s))).toBe(false)
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
