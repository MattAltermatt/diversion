import { defineDiversion, type PresetGroup } from '../../framework/types'
import { gameOfLifeSchema, type GameOfLifeConfig } from './schema'
import {
  createLifeState, generation, renderLife, resizeLife, applyColors, ruleMasks, type LifeState,
} from './life'
import { stylePresets, colorPresets } from './presets'
import { meta } from './meta'

const MAX_GENS_PER_FRAME = 4 // post-stall cap so a dt spike can't jank

const presets: PresetGroup<GameOfLifeConfig>[] = [
  { label: 'Style', options: stylePresets },
  { label: 'Palette', options: colorPresets },
]

const gameOfLife = defineDiversion<typeof gameOfLifeSchema, LifeState, '2d'>({
  ...meta,
  schema: gameOfLifeSchema,
  presets,

  setup(ctx, config, size) {
    const st = createLifeState(config, size.width, size.height)
    renderLife(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.stepAcc += state.cfg.speed * (dt / 1000)
    let gens = Math.floor(state.stepAcc)
    state.stepAcc -= gens
    if (gens > MAX_GENS_PER_FRAME) gens = MAX_GENS_PER_FRAME
    for (let g = 0; g < gens; g++) generation(state)
    if (state.needBlit) renderLife(state, ctx)
  },

  resize(state, size) {
    resizeLife(state, size.width, size.height)
  },

  update(state, config) {
    // Grid dimensions, seed, and density want a fresh board → full re-setup.
    if (config.cellSize !== state.cfg.cellSize) return false
    if (config.seed !== state.cfg.seed) return false
    if (config.density !== state.cfg.density) return false
    // A rule swap evolves the CURRENT board under the new rule (masks only);
    // speed/trail read live; a color change re-bakes the LUT — all keep the board.
    if (config.rule !== state.cfg.rule) {
      const m = ruleMasks(config.rule)
      state.birth = m.birth
      state.survive = m.survive
    }
    if (config.stops.join() !== state.cfg.stops.join()) applyColors(state, config.stops)
    state.cfg = config
    return true
  },
})

export default gameOfLife
