// Hextrail — clean-room reimplementation of the algorithm from xscreensaver's
// "hextrail" by Jamie Zawinski (jwz.org/xscreensaver). Reproduced from the
// published algorithm, not a code port. Original © Jamie Zawinski.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { hextrailSchema, type HextrailConfig } from './schema'
import {
  createHexState, stepHex, updateHexState, resizeHexState, type HexState,
} from './grow'
import { renderHex } from './render'
import { palettePresets, pacePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<HextrailConfig>[] = [
  { label: 'Palette', options: palettePresets },
  { label: 'Pace', options: pacePresets },
]

const hextrail = defineDiversion<typeof hextrailSchema, HexState, '2d'>({
  ...meta,
  schema: hextrailSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createHexState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepHex(state, dt)
    renderHex(state, ctx, dt)
  },

  resize(state, size, ctx) {
    resizeHexState(state, size.width, size.height)
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    return updateHexState(state, config)
  },

  presets,
})

export default hextrail
