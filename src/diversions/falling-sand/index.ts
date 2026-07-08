import { defineDiversion, type PresetGroup } from '../../framework/types'
import { fallingSandSchema, type FallingSandConfig } from './schema'
import {
  createSandState, stepSand, renderSand, resizeSand, applyColors, reseedEmitters, paintAt,
  type FallingSandState, SAND,
} from './sim'
import { palettePresets } from './presets'

const MAX_STEPS_PER_FRAME = 6 // post-stall cap so a dt spike can't jank

const presets: PresetGroup<FallingSandConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

const fallingSand = defineDiversion<typeof fallingSandSchema, FallingSandState, '2d'>({
  id: 'falling-sand',
  title: 'Falling Sand',
  description: 'A powder-toy chamber that pours itself — sand piles at its angle of repose, water finds its level, and fire climbs and consumes drifting plant, while wandering spouts keep the chamber endlessly filling and draining.',
  kind: '2d',
  schema: fallingSandSchema,
  presets,

  setup(ctx, config, size) {
    const st = createSandState(config, size.width, size.height)
    renderSand(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.stepAcc += state.cfg.simSpeed * (dt / 1000)
    let steps = Math.floor(state.stepAcc)
    state.stepAcc -= steps
    if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
    const dtPerStep = 1 / state.cfg.simSpeed
    for (let s = 0; s < steps; s++) stepSand(state, dtPerStep)
    if (state.needBlit) renderSand(state, ctx)
  },

  resize(state, size) {
    resizeSand(state, size.width, size.height)
  },

  update(state, config) {
    // Cell size and seed reshape/reroll the grid → full re-setup.
    if (config.cellSize !== state.cfg.cellSize) return false
    if (config.seed !== state.cfg.seed) return false
    if (config.emitterCount !== state.cfg.emitterCount) reseedEmitters(state, config)
    const c = config.colors
    const p = state.cfg.colors
    if (
      config.background !== state.cfg.background
      || c.sand !== p.sand || c.water !== p.water || c.fire !== p.fire
      || c.stone !== p.stone || c.plant !== p.plant
    ) applyColors(state, config)
    state.cfg = config
    return true
  },

  // Hold the (left) button and drag to pour sand at the cursor — a bonus on top
  // of the autonomous emitters, not required for the piece to run unattended.
  onPointer(state, sample) {
    if (sample.phase === 'leave') return
    if (!(sample.buttons & 1)) return
    paintAt(state, sample.x, sample.y, SAND, 2)
  },
})

export default fallingSand
