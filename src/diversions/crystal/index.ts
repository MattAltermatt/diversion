import { defineDiversion, type PresetGroup } from '../../framework/types'
import { crystalSchema, type CrystalConfig } from './schema'
import { createState, rebuild, render, type CrystalState } from './wallpaper'
import { lookPresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<CrystalConfig>[] = [
  { label: 'Look', options: lookPresets },
]

const crystal = defineDiversion<typeof crystalSchema, CrystalState, '2d'>({
  ...meta,
  schema: crystalSchema,
  presets,

  setup(ctx, config, size) {
    const st = createState(config, size.width, size.height)
    render(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.driftPhase += (dt / 1000) * state.cfg.driftSpeed
    state.elapsed += dt
    render(state, ctx)
  },

  resize(state, size) {
    // The wallpaper is viewport-independent (tiled from the centre); a resize
    // just changes the extent we stamp over — no rebuild, no restart.
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    const structural = config.group !== state.cfg.group
      || config.seed !== state.cfg.seed
      || config.palette !== state.cfg.palette
      || config.motifComplexity !== state.cfg.motifComplexity
    state.cfg = config
    if (structural) rebuild(state) // group/motif/palette rebuild; cellSize/drift/bg read live
    return true
  },

  shouldRestart(state) {
    // Periodically reseed a fresh group + motif + palette (the screensaver loop).
    // The framework rolls a new seed and re-runs setup(); 0 disables.
    return state.cfg.cycleSeconds > 0 && state.elapsed >= state.cfg.cycleSeconds * 1000
  },
})

export default crystal
