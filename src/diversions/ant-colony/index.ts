import { defineDiversion } from '../../framework/types'
import { antColonySchema, type AntColonyConfig } from './schema'
import { advance, buildTrailLuts, createAntColonyState, render, type AntColonyState } from './antColony'
import { antColonyPresets } from './presets'

// Editing any of these reshapes the world (grid, colony count, food placement,
// ant population, or the seeded layout) — everything else applies live.
const STRUCTURAL: (keyof AntColonyConfig)[] = ['gridResolution', 'colonies', 'foodSources', 'antCount', 'seed']

const antColony = defineDiversion<typeof antColonySchema, AntColonyState, '2d'>({
  id: 'ant-colony',
  title: 'Ant Colony',
  description: 'Pheromone foraging: a near-optimal supply network self-assembles from purely local ant rules.',
  kind: '2d',
  schema: antColonySchema,

  setup(_ctx, config, size) {
    return createAntColonyState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    for (const k of STRUCTURAL) {
      if (config[k] !== state.cfg[k]) return false
    }
    state.cfg = config
    state.tickMs = 1000 / config.simSpeed
    state.lut = buildTrailLuts(config)
    return true
  },

  // Screensaver safety: with finite food, once every source is exhausted and the
  // to-food trail (the "we found it" signal) has fully decayed, the story is over
  // — reseed a fresh world rather than let a dim, static husk sit on screen forever.
  shouldRestart(state) {
    if (state.cfg.foodRegenerates) return false
    const foodGone = state.food.every((f) => f.amount <= 0)
    if (!foodGone) return false
    const toFoodTotal = state.fields.reduce((sum, f) => sum + f.toFoodTotal, 0)
    return toFoodTotal < 1
  },

  presets: antColonyPresets,
})

export default antColony
