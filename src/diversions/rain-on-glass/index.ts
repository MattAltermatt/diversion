import { defineDiversion, type PresetGroup } from '../../framework/types'
import { rainOnGlassSchema, type RainOnGlassConfig } from './schema'
import {
  createState, stepRain, updateState, resizeState, type RainOnGlassState,
} from './rainOnGlass'
import { palettePresets, palettePatch } from './presets'

const presets: PresetGroup<RainOnGlassConfig>[] = [
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: palettePatch(p) })) },
]

const rainOnGlass = defineDiversion<typeof rainOnGlassSchema, RainOnGlassState, '2d'>({
  id: 'rain-on-glass',
  title: 'Rain on Glass',
  description: 'Droplets condense, merge, and slide down a rain-streaked window over blurred city lights.',
  kind: '2d',

  schema: rainOnGlassSchema,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepRain(state, ctx, dt)
  },

  resize(state, size) {
    resizeState(state, size.width, size.height)
  },

  update(state, config) {
    return updateState(state, config)
  },

  presets,
})

export default rainOnGlass
