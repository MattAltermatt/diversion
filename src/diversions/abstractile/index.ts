import { defineDiversion, type PresetGroup } from '../../framework/types'
import { abstractileSchema, type AbstractileConfig } from './schema'
import { createState, rebuild, render, cycleEnd, type AbstractileState } from './render'
import { palettePresets, stylePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<AbstractileConfig>[] = [
  { label: 'Style', options: stylePresets },
  { label: 'Palette', options: palettePresets },
]

const abstractile = defineDiversion<typeof abstractileSchema, AbstractileState, '2d'>({
  ...meta,
  schema: abstractileSchema,
  presets,

  setup(ctx, config, size) {
    const st = createState(config, size.width, size.height)
    render(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.t += dt / 1000
    render(state, ctx)
  },

  // When the cycle completes (fill → hold → dissolve), ask the framework to reseed:
  // it rolls a fresh seed (the randomizeOnFreshLoad field) + re-runs setup, so "copy
  // this world" pins exactly what's on screen (#191 seam).
  shouldRestart(state) {
    return state.t > cycleEnd(state) + 0.2
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
    // A resize changes the grid dimensions but the mosaic is viewport-independent
    // (hash-keyed cells) — rebuild geometry, keep the reveal clock so it never restarts.
    rebuild(state, false)
  },

  update(state, config) {
    const c = state.cfg
    // Topology: a different tileset/symmetry/grid/seed → replay the build fresh.
    const topo = config.gridSize !== c.gridSize || config.tileSet !== c.tileSet
      || config.symmetry !== c.symmetry || config.seed !== c.seed
    // Colours + grout are baked into tiles → rebuild the buffer but keep progress.
    const rebake = config.palette.join() !== c.palette.join() || config.grout !== c.grout
    state.cfg = config
    if (topo) rebuild(state, true)
    else if (rebake) rebuild(state, false)
    // background / fillSpeed / holdSeconds are read live in render — nothing to do.
    return true
  },
})

export default abstractile
