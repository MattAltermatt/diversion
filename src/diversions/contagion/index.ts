// Contagion — an SIR / SIRS epidemic on a toroidal lattice. A few sparks of
// infection spread to neighbours, stay infectious for a spell, recover, and (with
// waning immunity) become susceptible again. Past the transmission threshold a
// spark becomes a sweeping wavefront; with waning immunity the fronts curl into
// endless spiral reinfection waves, and with permanent immunity each epidemic
// burns out and a fresh one seeds. A live S/I/R stacked bar breathes below.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { contagionSchema, type ContagionConfig } from './schema'
import {
  createContagionState, stepContagion, renderContagion, resizeContagion, applyColors,
  type ContagionState,
} from './contagion'
import { regimePresets, palettePresets } from './presets'
import { meta } from './meta'

const MAX_STEPS_PER_FRAME = 4 // post-stall cap so a dt spike can't jank

const presets: PresetGroup<ContagionConfig>[] = [
  { label: 'Regime', options: regimePresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const contagion = defineDiversion<typeof contagionSchema, ContagionState, '2d'>({
  ...meta,
  schema: contagionSchema,

  setup(ctx, config, size) {
    const st = createContagionState(config, size.width, size.height)
    renderContagion(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.stepAcc += state.cfg.speed * (dt / 1000)
    let steps = Math.floor(state.stepAcc)
    state.stepAcc -= steps
    if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
    for (let s = 0; s < steps; s++) stepContagion(state)
    // Render every frame (not just on a step) so the phosphor glow keeps easing.
    renderContagion(state, ctx)
  },

  resize(state, size) {
    resizeContagion(state, size.width, size.height)
  },

  update(state, config) {
    // Grid geometry and seed want a fresh epidemic → full re-setup.
    if (config.cellSize !== state.cfg.cellSize) return false
    if (config.seed !== state.cfg.seed) return false
    // Everything else reads live; a colour / contrast edit re-bakes the LUT.
    const recolor =
      config.palette.join() !== state.cfg.palette.join() ||
      config.contrast !== state.cfg.contrast
    state.cfg = config
    if (recolor) applyColors(state)
    return true
  },

  presets,
})

export default contagion
