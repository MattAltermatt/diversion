import { defineDiversion, type PresetGroup } from '../../framework/types'
import { turmiteSchema, type TurmiteConfig } from './schema'
import { createTurmiteState, advance, fillBackground, hex8ToRgba, type TurmiteState } from './turmite'
import { rulePresets, palettePresets } from './presets'

const presets: PresetGroup<TurmiteConfig>[] = [
  { label: 'Rule', options: rulePresets },
  { label: 'Palette', options: palettePresets },
]

const turmite = defineDiversion<typeof turmiteSchema, TurmiteState, '2d'>({
  id: 'turmite',
  title: 'Turmite',
  description: 'A generalized Langton’s ant: ants turn by the colour beneath them, leaving emergent highways, spirals, and fractal growth.',
  kind: '2d',
  schema: turmiteSchema,

  setup(ctx, config, size) {
    const state = createTurmiteState(config, size.width, size.height)
    fillBackground(state, ctx, size.width, size.height)
    return state
  },

  frame(state, ctx, _t, dt) {
    advance(state, ctx, dt, state.cols * state.cell, state.rows * state.cell)
  },

  resize(state, size, ctx) {
    // Structural: rebuild the grid to the new dimensions (canvas resize wipes
    // the backing store), keep the generation/seed so the look continues.
    const next = createTurmiteState(state.cfg, size.width, size.height, state.generation)
    Object.assign(state, next)
    fillBackground(state, ctx, size.width, size.height)
  },

  update(state, config, size) {
    const prev = state.cfg
    // Structural changes can't be applied live — full re-setup.
    if (config.rule !== prev.rule || config.ants !== prev.ants
        || config.cellSize !== prev.cellSize || config.seed !== prev.seed) {
      return false
    }
    // Visual-only: swap cfg + recompute fill styles.
    // Neither the background nor the accumulated grid cells have a per-frame
    // repaint of their own (only setup/resize/reseed paint them), so a live
    // Background OR Palette edit would otherwise sit dead until the next reseed
    // — new styles would apply only to future ant draws. Flag a one-off full
    // repaint (bg fill + redraw every painted cell with the new styles) on the
    // next advance() call, which also covers the paused dt=0 static-repaint case.
    const paletteChanged = config.palette.join() !== prev.palette.join()
    if (config.background !== prev.background || paletteChanged) state.bgDirty = true
    state.cfg = config
    state.styles = config.palette.map((c) => hex8ToRgba(c))
    void size
    return true
  },

  presets,
})

export default turmite
