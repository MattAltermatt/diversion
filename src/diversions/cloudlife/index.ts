import { defineDiversion, type PresetGroup } from '../../framework/types'
import { cloudlifeSchema, type CloudLifeConfig } from './schema'
import {
  createCloudLifeState, generation, renderCloudLife, resizeCloudLife, applyColors, type CloudLifeState,
} from './life'
import { cloudPresets, colorPresets } from './presets'

const MAX_GENS_PER_FRAME = 4 // post-stall cap so a dt spike can't jank

const presets: PresetGroup<CloudLifeConfig>[] = [
  { label: 'Clouds', options: cloudPresets },
  { label: 'Palette', options: colorPresets },
]

const cloudlife = defineDiversion<typeof cloudlifeSchema, CloudLifeState, '2d'>({
  id: 'cloudlife',
  title: 'CloudLife',
  description: 'An aging Conway’s Life: a cell that outlives its max age starts counting triple '
    + 'toward its neighbours’ next generation, so old formations explode instead of freezing — the '
    + 'churn reads as slow, billowing clouds that never settle, tinted young to old. Port of Don '
    + 'Marti’s xscreensaver hack “cloudlife.”',
  kind: '2d',
  schema: cloudlifeSchema,
  presets,

  setup(ctx, config, size) {
    const st = createCloudLifeState(config, size.width, size.height)
    renderCloudLife(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.stepAcc += state.cfg.speed * (dt / 1000)
    let gens = Math.floor(state.stepAcc)
    state.stepAcc -= gens
    if (gens > MAX_GENS_PER_FRAME) gens = MAX_GENS_PER_FRAME
    for (let g = 0; g < gens; g++) generation(state)
    if (state.needBlit) renderCloudLife(state, ctx)
  },

  resize(state, size) {
    resizeCloudLife(state, size.width, size.height)
  },

  update(state, config) {
    // Grid dimensions, seed, and density want a fresh board → full re-setup.
    if (config.cellSize !== state.cfg.cellSize) return false
    if (config.seed !== state.cfg.seed) return false
    if (config.initialDensity !== state.cfg.initialDensity) return false
    // maxAge/speed read live off state.cfg every generation/frame; a palette or
    // background edit re-bakes the LUT — all keep the current board.
    if (config.palette.join() !== state.cfg.palette.join() || config.background !== state.cfg.background) {
      applyColors(state, config.palette, config.background)
    }
    state.cfg = config
    return true
  },
})

export default cloudlife
