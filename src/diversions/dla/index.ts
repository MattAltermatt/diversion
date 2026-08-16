import { defineDiversion, type PresetGroup } from '../../framework/types'
import { dlaSchema, type DLAConfig } from './schema'
import { advance, applyConfig, createState, type DLAState } from './dla'
import { render, disposeRender } from './render'
import { growthPresets, lookPresets } from './presets'
import { meta } from './meta'

// Once the dendrite has filled the frame it holds a beat, then the framework
// reseeds a fresh world — the right unattended-screensaver loop.
const FILL_HOLD_MS = 5000

const presets: PresetGroup<DLAConfig>[] = [
  { label: 'Growth', options: growthPresets },
  { label: 'Look', options: lookPresets },
]

const dla = defineDiversion<typeof dlaSchema, DLAState, '2d'>({
  ...meta,
  schema: dlaSchema,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    // The grid is pixel-bound; a resize rebuilds the world (fullscreen toggle only).
    disposeRender(state)
    Object.assign(state, createState(state.cfg, size.width, size.height))
  },

  update(state, config) {
    return applyConfig(state, config)
  },

  shouldRestart(state) {
    return state.filled && state.filledMs >= FILL_HOLD_MS
  },

  teardown(state) {
    disposeRender(state)
  },

  presets,
})

export default dla
