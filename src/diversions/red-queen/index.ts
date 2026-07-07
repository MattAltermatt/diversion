import { defineDiversion } from '../../framework/types'
import { redQueenSchema, type RedQueenConfig } from './schema'
import { advance, buildColors, buildKernel, createRedQueenState, render, type RedQueenState } from './redQueen'
import { redQueenPresets } from './presets'

// Changing the genotype count or the seed rebuilds the run; the rest — virulence,
// pressure, mutation, colours, speed, AND match breadth (the kernel rebuilds live) —
// applies live to the ongoing chase.
const STRUCTURAL: (keyof RedQueenConfig)[] = ['genotypeCount', 'seed']

const redQueen = defineDiversion<typeof redQueenSchema, RedQueenState, '2d'>({
  id: 'red-queen',
  title: 'Red Queen',
  description: 'Hosts and parasites chase each other’s genes forever — the common type gets targeted and crashes while a rare type rises, an endless out-of-phase wave of colour.',
  kind: '2d',
  schema: redQueenSchema,

  setup(_ctx, config, size) {
    return createRedQueenState(config, size.width, size.height)
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
    state.kernel = buildKernel(config)
    state.colors = buildColors(config)
    return true
  },

  presets: redQueenPresets,
})

export default redQueen
