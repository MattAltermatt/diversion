// Percolation — the giant-component phase transition, made visible. Sites of a
// square lattice open independently with probability p; as p sweeps up through the
// critical p_c ≈ 0.5927, scattered clusters abruptly bridge into one lacy fractal
// that spans the whole grid (highlighted in gold), then dissolve as p falls. A
// frozen-landscape / rising-tide coupling keeps the transition coherent, not flickery.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { percolationSchema, type PercolationConfig } from './schema'
import { advance, applyConfig, createState, type PercolationState } from './percolation'
import { render, disposeRender } from './render'
import { sweepPresets, colourPresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<PercolationConfig>[] = [
  { label: 'Sweep', options: sweepPresets },
  { label: 'Palette', options: colourPresets },
]

const percolation = defineDiversion<typeof percolationSchema, PercolationState, '2d'>({
  ...meta,
  schema: percolationSchema,
  presets,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    // Grid is viewport-bound; a resize rebuilds it (fullscreen toggle only). Keep the
    // live density/phase so the sweep continues coherently at the new resolution.
    disposeRender(state)
    const next = createState(state.cfg, size.width, size.height)
    next.p = state.p
    next.phase = state.phase
    next.landscapeIndex = state.landscapeIndex
    Object.assign(state, next)
  },

  update(state, config) {
    return applyConfig(state, config)
  },

  teardown(state) {
    disposeRender(state)
  },
})

export default percolation
