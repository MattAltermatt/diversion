// Schelling's Segregation Model (GH #178) — how a mild same-type preference makes a
// whole grid sort itself into large single-colour neighbourhoods that no individual
// intended. Faithful mechanic; gallery-grade presentation (crisp blocks, high
// contrast, a settle-hold-reshuffle loop, live segregation readout).
import { defineDiversion } from '../../framework/types'
import { schellingSchema, type SchellingConfig } from './schema'
import { createSchellingState, advance, render, buildLut, type SchellingState } from './schelling'
import { meta } from './meta'

// Editing any of these rebuilds the grid; everything else applies live.
const STRUCTURAL: (keyof SchellingConfig)[] = ['gridSize', 'types', 'emptyFraction', 'seed']

const schelling = defineDiversion<typeof schellingSchema, SchellingState, '2d'>({
  ...meta,
  schema: schellingSchema,

  setup(_ctx, config, size) {
    return createSchellingState(config, size.width, size.height)
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
    state.tickMs = 1000 / config.speed
    state.lut = buildLut(config)
    return true
  },
})

export default schelling
