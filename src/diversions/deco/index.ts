import { defineDiversion, type PresetGroup } from '../../framework/types'
import { decoSchema, type DecoConfig } from './schema'
import { createDecoState, rebuild, renderDeco, type DecoState } from './deco'
import { palettePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<DecoConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

const deco = defineDiversion<typeof decoSchema, DecoState, '2d'>({
  ...meta,
  schema: decoSchema,
  presets,

  setup(ctx, config, size) {
    const st = createDecoState(config, size.width, size.height)
    renderDeco(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.t += state.cfg.speed * (dt / 1000)
    renderDeco(state, ctx)
  },

  // Once the composition is built and held, ask the framework to reseed — it rolls
  // a fresh seed (the randomizeOnFreshLoad field), re-runs setup, and reports the
  // new seed so "copy this world" pins what's actually on screen (#191 seam).
  shouldRestart(state) {
    return state.t > state.done + state.cfg.hold
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
    // A resize past the MIN_SIZE / aspect thresholds can restructure the tree; keep
    // the reveal clock so it never restarts the animation (viewport-independent rule).
    rebuild(state, false)
  },

  update(state, config) {
    const restructure = config.depth !== state.cfg.depth || config.split !== state.cfg.split
      || config.seed !== state.cfg.seed
    const recolor = config.palette.join() !== state.cfg.palette.join()
    state.cfg = config
    if (restructure) rebuild(state, true)      // new topology → replay the build
    else if (recolor) rebuild(state, false)    // same topology, recolor, keep progress
    return true // borderWidth/border/speed/hold read live
  },
})

export default deco
