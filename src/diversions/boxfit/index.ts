// Boxfit — a clean-room take on xscreensaver's `boxfit` hack by Jamie Zawinski.
// Drop a tiny shape on an empty point and grow it until it touches a neighbour or
// the edge, then freeze it; keep spawning + growing until a tight, big-to-small
// mosaic of boxes/circles fills the plane. Holds when full, then the framework
// reseeds a fresh packing. Credit: jwz / xscreensaver.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { boxfitSchema, type BoxfitConfig } from './schema'
import { advance, applyConfig, createState, type BoxfitState } from './boxfit'
import { render, disposeRender } from './render'
import { lookPresets, stylePresets } from './presets'

// Once the plane is packed it holds a beat, then the framework reseeds a fresh
// mosaic — the right unattended-screensaver loop.
const FILL_HOLD_MS = 5000

const presets: PresetGroup<BoxfitConfig>[] = [
  { label: 'Style', options: stylePresets },
  { label: 'Look', options: lookPresets },
]

const boxfit = defineDiversion<typeof boxfitSchema, BoxfitState, '2d'>({
  id: 'boxfit',
  title: 'Boxfit',
  description: 'Shapes drop on empty ground and grow until they touch — a tight, big-to-small '
    + 'mosaic that packs itself. After xscreensaver’s boxfit.',
  kind: '2d',
  schema: boxfitSchema,
  presets,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    // The packing is pixel-bound; a resize repacks (fullscreen toggle only).
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
})

export default boxfit
