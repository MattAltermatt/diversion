// Apollonian Gasket — clean-room port of xscreensaver's `apollonian` hack by
// Jamie Zawinski. Recursively packs mutually-tangent circles into every gap via
// the Descartes Circle Theorem; coloured by depth/size and drawn coarse-first,
// then reseeded. Credit: jwz / xscreensaver.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { apollonianSchema, type ApollonianConfig } from './schema'
import { advance, applyConfig, createState, isDone, resizeState, type GasketState } from './gasket'
import { render, disposeRender } from './render'
import { lookPresets, motionPresets } from './presets'

const presets: PresetGroup<ApollonianConfig>[] = [
  { label: 'Look', options: lookPresets },
  { label: 'Motion', options: motionPresets },
]

const apollonian = defineDiversion<typeof apollonianSchema, GasketState, '2d'>({
  id: 'apollonian',
  title: 'Apollonian Gasket',
  description: 'Mutually-tangent circles packed into every gap by the Descartes Circle Theorem — '
    + 'a self-similar fractal foam. After xscreensaver’s apollonian.',
  kind: '2d',
  schema: apollonianSchema,
  presets,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    // Geometry is viewport-independent — just update the size; render re-bakes at
    // the new resolution. Never regenerate/restart on a fullscreen or drag resize.
    resizeState(state, size.width, size.height)
  },

  update(state, config) {
    return applyConfig(state, config)
  },

  shouldRestart(state) {
    return isDone(state)
  },

  teardown(state) {
    disposeRender(state)
  },
})

export default apollonian
