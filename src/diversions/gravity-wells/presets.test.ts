import { describe, it, expect } from 'vitest'
import { gravityWellsSchema } from './schema'
import { motionPresets, colorPresets } from './presets'
import { matchPresets } from '../../framework/presets'
import type { GravityWellsConfig } from './schema'

const defaults = gravityWellsSchema.parse({})

describe('gravity-wells presets', () => {
  it('every motion preset patch parses against the schema', () => {
    for (const p of motionPresets) {
      expect(() => gravityWellsSchema.parse({ ...defaults, ...p.motion })).not.toThrow()
    }
  })

  it('every color preset patch parses against the schema', () => {
    for (const p of colorPresets) {
      const patch = { background: p.background, blend: p.blend, color: p.color }
      expect(() => gravityWellsSchema.parse({ ...defaults, ...patch })).not.toThrow()
    }
  })

  it('Vortex motion equals the schema motion defaults (reads named on load)', () => {
    const vortex = motionPresets.find((p) => p.name === 'Vortex')!
    for (const key of Object.keys(vortex.motion) as (keyof typeof vortex.motion)[]) {
      expect(vortex.motion[key]).toEqual(defaults[key])
    }
  })

  it('Tide color equals the schema color defaults (reads named on load)', () => {
    const tide = colorPresets.find((p) => p.name === 'Tide')!
    expect(tide.background).toEqual(defaults.background)
    expect(tide.blend).toEqual(defaults.blend)
    expect(tide.color).toEqual(defaults.color)
  })

  it('matchPresets round-trips every option', () => {
    const groups = [
      { label: 'Motion', options: motionPresets.map((p) => ({ name: p.name, patch: p.motion })) },
      {
        label: 'Palette',
        options: colorPresets.map((p) => ({
          name: p.name,
          patch: { background: p.background, blend: p.blend, color: p.color },
        })),
      },
    ]
    for (const p of motionPresets) {
      const cfg = { ...defaults, ...p.motion } as GravityWellsConfig
      expect(matchPresets(groups, cfg)[0]).toBe(p.name)
    }
    for (const p of colorPresets) {
      const cfg = { ...defaults, background: p.background, blend: p.blend, color: p.color } as GravityWellsConfig
      expect(matchPresets(groups, cfg)[1]).toBe(p.name)
    }
  })

  it('names are unique within each axis', () => {
    expect(new Set(motionPresets.map((p) => p.name)).size).toBe(motionPresets.length)
    expect(new Set(colorPresets.map((p) => p.name)).size).toBe(colorPresets.length)
  })
})
