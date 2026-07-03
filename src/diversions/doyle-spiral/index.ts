// Doyle Spiral — a hexagonal packing of mutually-tangent circles whose radii scale
// geometrically into logarithmic-spiral arms (the discrete analogue of the complex
// exponential map). Because the packing is invariant under one complex "scale+rotate"
// generator, it flows forever in a seamless loxodromic zoom — circles born at the
// core, growing, drifting out along their arms. Clean-room port of Robin Houston's
// Doyle-spiral numerics (2013). This is the "Golden Apollonian" of the reference — a
// Doyle spiral, not an Apollonian gasket (#56 ships that).
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { doyleSchema, type DoyleConfig } from './schema'
import { advance, applyConfig, createState, resizeState, type SpiralState } from './spiral'
import { render, disposeRender } from './render'
import { spiralPresets, lookPresets, motionPresets } from './presets'

const presets: PresetGroup<DoyleConfig>[] = [
  { label: 'Spiral', options: spiralPresets },
  { label: 'Look', options: lookPresets },
  { label: 'Motion', options: motionPresets },
]

const doyleSpiral = defineDiversion<typeof doyleSchema, SpiralState, '2d'>({
  id: 'doyle-spiral',
  title: 'Doyle Spiral',
  description: 'Mutually-tangent circles whose radii scale by a fixed ratio, coiling into '
    + 'logarithmic-spiral arms that zoom forever in a seamless loxodromic flow. After Doyle / '
    + 'Robin Houston’s numerics.',
  kind: '2d',
  schema: doyleSchema,
  presets,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    resizeState(state, size.width, size.height)
  },

  update(state, config) {
    return applyConfig(state, config)
  },

  // Keep Twist (p) strictly below Arms (q) — the Doyle solve needs p<q. Clamp p
  // (rather than bumping q) so dragging Twist never disturbs the chosen density.
  reconcile(_prev, next) {
    if (next.p >= next.q) return { ...next, p: next.q - 1 }
    return next
  },

  teardown(state) {
    disposeRender(state)
  },
})

export default doyleSpiral
